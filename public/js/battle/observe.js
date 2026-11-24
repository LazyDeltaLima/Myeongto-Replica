// Observing rules and labels of client-side combat (research 09 §3.1 / §6.3, DESIGN §14 "Spectating") — pure helpers
// for the game screen, the team panel and the combat HUD (mirror of server/match/match/watch.js _watchClient):
//   * prep (休整期): tap a teammate → 前往查看 → their board (read-only);
//   * 各自行动: tap a teammate → 前往查看 → a local replica of their battle, while the own battle still runs too (it goes
//     on off screen and reports; the official current season refused it, 「当前无法查看」 — the next season's mode allows
//     it, taken for every season as a convenience: maintainer decision 2026-10-25); 返回战场 goes back; once the own
//     battle is over: "⌛ 作战结束，等待队友完成作战" + the teammates' progress;
//   * 联防 / 最终攻势: the ‹ › pill switches the camera LEFT half / 全景 / RIGHT half of the own field; tap a player of
//     the other pair → 前往查看 → its boss field while the own one runs off screen (the official game hides it,
//     「无法查看另一组队友的战场情况」 — a convenience for every season, maintainer decision 2026-11-20);
//   * eliminated: anything — each phase reset starts on the player it follows (the server's prep scout / b.start,
//     followedScout).

import { PHASE } from '../../../shared/constants.js';
import { data } from '../data.js';
import { t } from '../../../shared/i18n.js';
import { playerName } from '../../../shared/botNames.js';
import { wideHalves } from '../../../shared/wideField.js';

/** @typedef {import('../ui/gameLogic/shared.js').Pub} Pub */
/** @typedef {import('../ui/gameLogic/shared.js').PubPlayer} PubPlayer */
/** @typedef {import('../ui/gameLogic/shared.js').PubField} PubField */
/** @typedef {import('../ui/gameLogic/shared.js').Bag} Bag */
/** A battle spec of b.start (the keys read here). @typedef {{ players?: Bag[], kind?: string, wide?: number, [key: string]: any }} BattleSpec */
/** A teammate's progress row. @typedef {{ playerId: string, name: string, isBot: boolean, killed: number|null, resolved: number|null, total: number|null, done: boolean }} ProgressRow */
/** One effect of the watched player's effects column. @typedef {{ id: string, name: string, desc: string, iconKind: string, iconId: string, effectId?: string, counter?: number }} SpectateEffect */

/** @param {unknown} v @returns {v is Bag} */
const isObj = (v) => !!v && typeof v === 'object';
/** @type {Set<unknown>} */
const COMBAT = new Set([PHASE.COMBAT, PHASE.UNITE, PHASE.FINAL_ASSAULT, PHASE.HIDDEN_CORE]);

/** The server runs client-side combat (m.public.combatMode). @param {Pub | null | undefined} pub */
export const isClientCombat = (pub) => !!pub && pub.combatMode === 'client';

/** @param {Pub | null | undefined} pub @returns {PubPlayer[]} */
const players = (pub) => (Array.isArray(pub?.players) ? pub.players.filter(isObj) : []);
/** @param {Pub | null | undefined} pub @returns {PubField[]} */
const fields = (pub) => (Array.isArray(pub?.fields) ? pub.fields.filter(isObj) : []);

/** The field listing a player, or null. @param {Pub | null | undefined} pub @param {string} playerId */
export function fieldOf(pub, playerId) {
  return fields(pub).find((f) => Array.isArray(f.players) && f.players.includes(playerId)) || null;
}

/** Display name of a player id ('队友' when unknown). @param {Pub | null | undefined} pub @param {string} playerId @returns {string} */
export function nameOf(pub, playerId) {
  return /** @type {string} */ (playerName(players(pub).find((p) => p.playerId === playerId)?.name)) || t('队友');
}

/**
 * What tapping a team row does: `{ back: true }` (own row while observing), `{ fieldId }` to observe, or `{ reason }`.
 * @param {PubPlayer | Bag} p m.public player row
 * @param {Pub | null | undefined} pub
 * @param {string} myId
 * @param {{ observing?: boolean }} [o]
 */
export function observeTarget(p, pub, myId, { observing = false } = {}) {
  if (!isObj(p)) return { reason: t('无效的目标') };
  if (p.playerId === myId) return observing ? { back: true } : { reason: null };
  if (p.alive === false || p.status === 'left') return { reason: t('该队友已被淘汰，无法查看') };
  const phase = pub?.phase;
  const me = players(pub).find((x) => x.playerId === myId) || null;
  const meAlive = me ? me.alive !== false : true;
  if (!COMBAT.has(phase)) return { fieldId: `n:${p.playerId}` };
  const target = fieldOf(pub, p.playerId);
  if (!target) return { reason: t('该队友当前没有战场') };
  const own = fieldOf(pub, myId);
  if (!meAlive || !own) return { fieldId: target.fieldId };
  if (own.fieldId === target.fieldId) return { reason: t('队友与你在同一战场，使用 ‹ › 切换视角') };
  return { fieldId: target.fieldId };
}

/**
 * A screen reloaded (or a socket reconnected) while it watched a teammate's battle after the own one: the server
 * resends the watched field (Match._resendBattle, b.start `watch: true`), but a fresh screen starts at home — so the
 * observing pill, 返回战场 and the own row would be missing. Decided once per battle, at the first sight of its
 * battleId (`seen` = the battleId already decided): adopt `fieldId` as the watched field when it is a teammate's normal
 * battle in 各自行动, or the other pair's boss field in 最终攻势 / 隐秘核心 (maintainer decision 2026-11-20), shown to a
 * living player who watches nothing. Never for a battle first seen while watching (a
 * 前往查看 under way — and its 返回战场 must not bring it back while the own b.start is on its way), the own field, a
 * 联防 leaker's field or an eliminated player's auto-observed one (those keep their own rules). A loading battle (its
 * state carries no `watch` yet) is decided once it runs, unless the screen already watches (then it is marked seen).
 * @param {Bag} b battleRunner.state() @param {{ pub?: Pub | null, myId?: string, alive?: boolean, watching?: string|null,
 *   seen?: string|null }} [o]
 * @returns {{ seen: string|null, fieldId: string|null }} seen: the new value to remember
 */
export function resumedWatch(b, { pub = null, myId = '', alive = true, watching = null, seen = null } = {}) {
  const keep = { seen, fieldId: null };
  if (!isObj(pub) || !isObj(b) || typeof b.battleId !== 'string' || !b.battleId || b.battleId === seen) return keep;
  if (b.loading && !watching) return keep;
  const done = { seen: b.battleId, fieldId: null };
  if (b.loading || watching || !alive || !isClientCombat(pub)) return done;
  const kinds = pub.phase === PHASE.COMBAT ? ['normal'] : pub.phase === PHASE.FINAL_ASSAULT || pub.phase === PHASE.HIDDEN_CORE ? ['boss', 'hidden'] : [];
  if (!b.watch || !kinds.includes(b.kind) || typeof b.fieldId !== 'string' || !b.fieldId) return done;
  const f = fields(pub).find((x) => x.fieldId === b.fieldId);
  if (!f || f.kind !== b.kind || !Array.isArray(f.players) || f.players.includes(myId)) return done;
  return { seen: b.battleId, fieldId: b.fieldId };
}

/**
 * The prep board the server pushed to a viewer that follows a player (an eliminated player or a spectator seat:
 * Match._followScout — the player it last watched, else the first player still in; community report of 2026-10-06,
 * item 56, the idea of PR #189), to adopt as the watched board like a 前往查看 tap: `field` is such a scout (m.field
 * `prep`, an `n:<pid>` id other than the own) and the screen watches nothing (`watching` null — a 返回战场 this phase is
 * not overridden: the caller adopts a board once per phase). Null for a living player: its phase resets keep its own
 * board.
 * @param {{ field?: Bag | null, watching?: string|null, alive?: boolean, spectator?: boolean, myId?: string }} o
 * @returns {string|null} the fieldId to watch
 */
export function followedScout({ field = null, watching = null, alive = true, spectator = false, myId = '' } = {}) {
  if (watching || (alive && !spectator) || !isObj(field) || !field.prep) return null;
  const fid = field.fieldId;
  if (typeof fid !== 'string' || !fid.startsWith('n:') || fid === `n:${myId}`) return null;
  return fid;
}

/** A normal field's progress row: { playerId, name, killed, resolved, total, done, isBot }. @param {Pub | null | undefined} pub @param {PubField} f @param {string|null} [name] @returns {ProgressRow} */
function progressRow(pub, f, name = null) {
  const pid = /** @type {string[]} */ (f.players)[0];
  const p = players(pub).find((x) => x.playerId === pid);
  /** @type {{ killed?: number, resolved?: number, total?: number, done?: boolean }} */
  const pr = isObj(f.progress) ? f.progress : {};
  return {
    playerId: pid, name: /** @type {string} */ (playerName(name || p?.name)) || t('队友'), isBot: !!p?.isBot,
    killed: Number.isFinite(pr.killed) ? /** @type {number} */ (pr.killed) : null,
    resolved: Number.isFinite(pr.resolved) ? /** @type {number} */ (pr.resolved) : (Number.isFinite(pr.killed) ? /** @type {number} */ (pr.killed) : null),
    total: Number.isFinite(pr.total) ? /** @type {number} */ (pr.total) : null,
    done: f.live === false || !!pr.done,
  };
}

/** Teammates' progress for the waiting pill: [{ playerId, name, killed, resolved, total, done, isBot }]. @param {Pub | null | undefined} pub @param {string} myId */
export function teammateProgress(pub, myId) {
  /** @type {ReturnType<typeof progressRow>[]} */
  const out = [];
  for (const f of fields(pub)) {
    if (f.kind !== 'normal' || !Array.isArray(f.players)) continue;
    if (f.players[0] === myId) continue;
    out.push(progressRow(pub, f));
  }
  return out;
}

/**
 * The own normal battle's progress row ("你自己"), shown under the observing pill while a teammate is watched in 各自行动
 * (maintainer decision 2026-10-25: the own battle goes on off screen); `done` also when the local simulation already
 * ended (`localDone`: its report may not be back yet). Null outside 各自行动 or without an own normal field.
 * @param {Pub | null | undefined} pub @param {string} myId @param {{ localDone?: boolean }} [o]
 */
export function ownProgress(pub, myId, { localDone = false } = {}) {
  if (!isObj(pub) || pub.phase !== PHASE.COMBAT) return null;
  const f = fieldOf(pub, myId);
  if (!f || f.kind !== 'normal') return null;
  const row = progressRow(pub, f, t('你自己'));
  if (localDone) row.done = true;
  return row;
}

/**
 * The half a battle spec's player holds (the runner's field meta `sides`): 'L' | 'R' — 联防 (the first of two helpers
 * takes the right half, colOffset 8) and boss pairs —, or on the 8-player mode's wide 联防 field (`wide` 3 | 4) the half
 * counted from the left, 'H0'…'H3' (colOffset 0, 8, 16, 24; shared/wideField.js).
 * @param {{ side?: string, colOffset?: number }} p @param {number} [wide]
 */
export function halfSide(p, wide = 0) {
  if (wideHalves(wide)) return `H${Math.max(0, Math.round((Number(p?.colOffset) || 0) / 8))}`;
  return p?.side === 'R' || Number(p?.colOffset) >= 8 ? 'R' : 'L';
}

/** Whether `layer` is a half of a field (`L`, `R`, a wide field's `H0`…), not 全景. @param {unknown} layer */
export const isHalfLayer = (layer) => layer === 'L' || layer === 'R' || /^H\d$/.test(String(layer));

/** Side of each player of a local field meta (`sides` from the runner, else seat order). @param {Bag | null | undefined} field @returns {Record<string, string>} */
export function sidesOf(field) {
  if (isObj(field?.sides)) return field.sides;
  /** @type {string[]} */
  const ps = Array.isArray(field?.players) ? field.players : [];
  return Object.fromEntries(ps.map((pid, i) => [pid, i === 1 ? 'R' : 'L']));
}

/**
 * The ‹ › camera layers of a 联防 / boss field: LEFT half, 全景, RIGHT half with captions "你自己" / "👁 name" /
 * "全景" / "无人在家"; the 8-player mode's wide 联防 field has one per half from the left with 全景 in the middle
 * (H0 H1 全景 H2 H3 / H0 全景 H1 H2). Empty for normal fields and single-player boss fields.
 * @param {Bag} field @param {Pub | null | undefined} pub @param {string} myId
 * @returns {{ key: string, label: string, self: boolean, watch: boolean, kind: string, pid: string|null }[]}
 */
export function cameraLayers(field, pub, myId) {
  if (!isObj(field) || (field.kind !== 'unite' && field.kind !== 'boss' && field.kind !== 'hidden')) return [];
  const sides = sidesOf(field);
  /** @param {string} side */
  const at = (side) => Object.keys(sides).find((pid) => sides[pid] === side) || null;
  /** @param {string|null} pid */
  const label = (pid) => (!pid ? t('无人在家') : pid === myId ? t('你自己') : nameOf(pub, pid));
  const left = at('L');
  const right = at('R');
  if ((field.kind === 'boss' || field.kind === 'hidden') && (!left || !right)) return [];
  // `kind` / `pid`: the official panel_ob_info part (ui/battleArt.js ObInfo) — ob_self / ob_other / ob_empty / ob_overview
  /** @param {string|null} pid */
  const kind = (pid) => (!pid ? 'empty' : pid === myId ? 'self' : 'other');
  const n = field.kind === 'unite' ? wideHalves(field.wide) : 0;
  if (n) {
    const out = Array.from({ length: n }, (_, i) => {
      const pid = at(`H${i}`);
      return { key: `H${i}`, label: label(pid), self: pid === myId, watch: !!pid && pid !== myId, kind: kind(pid), pid };
    });
    out.splice(Math.floor(n / 2), 0, { key: 'ALL', label: t('全景'), self: false, watch: false, kind: 'all', pid: null });
    return out;
  }
  return [
    { key: 'L', label: label(left), self: left === myId, watch: !!left && left !== myId, kind: kind(left), pid: left },
    { key: 'ALL', label: t('全景'), self: false, watch: false, kind: 'all', pid: null },
    { key: 'R', label: label(right), self: right === myId, watch: !!right && right !== myId, kind: kind(right), pid: right },
  ];
}

/** Camera options of a layer for view.setCamera(kind, …). @param {Bag | null | undefined} field @param {unknown} layer @param {string} [mySide] @returns {{ rect: unknown, side: string, half?: boolean, halfOffset?: number }} */
export function layerCamera(field, layer, mySide = 'L') {
  const rect = field?.rect;
  if (layer === 'L' || layer === 'R') return { rect, side: layer, half: true };
  // a wide 联防 field's half: the official left half's camera moved by its column offset (render/projection.js presetCamera)
  const h = /^H(\d)$/.exec(String(layer));
  if (h) return { rect, side: 'L', half: true, halfOffset: 8 * Number(h[1]) };
  if (layer === 'ALL' && field?.kind === 'unite') {
    const occupied = ['L', 'R'].filter((side) => Object.values(sidesOf(field)).includes(side));
    if (occupied.length === 1) return { rect, side: occupied[0], half: true };
  }
  return { rect, side: mySide };
}

/**
 * The watched player's effects column for a battle watched as a display replica (user playtest #2: while spectating,
 * the right column shows the spectated player's effects, not one's own). The spec's raw playerEffects (Battle spec:
 * `{ id, source = iconKind, counter, … }`) resolved client-side — a band effect through bands.json (its effectId),
 * everything else through effects.json; `effectIconUrl`'s per-kind fallbacks cover the missing icon ids. Undefined
 * where whose column would be ambiguous (联防 / boss pairs) or there are no effects data (a server-run field's meta
 * comes from the server without effects — the column stays empty rather than showing one's own).
 * @param {BattleSpec} spec @param {unknown} members @returns {SpectateEffect[]|undefined}
 */
export function spectateEffects(spec, members) {
  if (!Array.isArray(members) || members.length !== 1 || !isObj(spec)) return undefined;
  const p = Array.isArray(spec.players) ? spec.players.find((/** @type {unknown} */ x) => isObj(x) && x.playerId === members[0]) : null;
  if (!p || !Array.isArray(p.playerEffects)) return undefined;
  /** @type {SpectateEffect[]} */
  const out = [];
  for (const pe of p.playerEffects) {
    if (!isObj(pe) || typeof pe.id !== 'string' || !pe.id) continue;
    const counter = pe.counter != null ? { counter: pe.counter } : {};
    if (pe.source === 'band') {
      const band = data.list('bands').find((b) => b && b.effectId === pe.id);
      if (band) {
        out.push({ id: pe.id, name: band.effectName || band.name, desc: band.desc || '', iconKind: 'band', iconId: band.iconId || band.bandId, ...counter });
        continue;
      }
    }
    // a 机变 card's ref is `<effectId>#<n>` (or `choice:<effectId>#<n>`): its record is `data.effectId`, and its icon the
    // record's card-type icon (icon_team_buff …), as the own list shows it (server/match/choices.js addRef)
    const ref = isObj(pe.data) && typeof pe.data.effectId === 'string' && pe.data.effectId ? pe.data.effectId : null;
    const rec = data.lookup('effects', ref || pe.id);
    const iconId = ref ? rec?.decoIconId || ref : pe.id;
    out.push({ id: pe.id, ...(ref ? { effectId: ref } : null), name: rec?.name || pe.id, desc: rec?.desc || rec?.descRaw || '', iconKind: pe.source || 'choice', iconId, ...counter });
  }
  return out;
}
