// ui/gameLogic/watch.js — field ids, the watch switcher, emote bubbles. Re-exported from ../gameLogic.js.

/** @import { Pub, PubField, PubPlayer } from './shared.js' */
import { isObj, sortedPlayers } from './shared.js';
import { isCombatPhase } from './phases.js';
import { t } from '../../../../shared/i18n.js';
import { playerName } from '../../../../shared/botNames.js';


/** Own normal field id (DESIGN §8.3). @param {string} playerId */
export const ownFieldId = (playerId) => `n:${playerId}`;

/**
 * Field the player sits in right now (own normal field, or the unite/boss field that lists them).
 * @param {Pub | null | undefined} pub
 * @param {string} playerId
 */
export function homeFieldId(pub, playerId) {
  const fields = Array.isArray(pub?.fields) ? pub.fields : [];
  const special = fields.find((f) => isObj(f) && f.kind !== 'normal' && Array.isArray(f.players) && f.players.includes(playerId) && f.live !== false);
  if (special) return special.fieldId;
  const me = sortedPlayers(pub).find((p) => p.playerId === playerId);
  if (me && typeof me.fieldId === 'string' && me.fieldId) return me.fieldId;
  return ownFieldId(playerId);
}

/**
 * Next/previous watchable field for the ‹ › view switcher.
 * @param {Array<{fieldId:string, live?:boolean}>} fields
 * @param {string|null} current
 * @param {1|-1} dir
 * @returns {string|null}
 */
export function cycleField(fields, current, dir = 1) {
  const list = (Array.isArray(fields) ? fields : []).filter((f) => isObj(f) && typeof f.fieldId === 'string' && f.live !== false);
  if (list.length === 0) return null;
  const i = list.findIndex((f) => f.fieldId === current);
  if (i < 0) return list[0].fieldId;
  const n = list.length;
  return list[(((i + dir) % n) + n) % n].fieldId;
}

/**
 * What clicking a teammate row asks the server to watch, or why it can't (mirror of server Match.watch): an
 * eliminated player has no board to watch; any live field may be watched, during 最终攻势 / 隐秘核心 the other pair's
 * boss field too (the official game hides it, "无法查看另一组队友的战场情况" — a convenience for every season,
 * maintainer decision 2026-11-20).
 * @param {PubPlayer} p m.public player row
 * @param {Pub | null | undefined} pub
 * @param {string} myId
 * @returns {{ fieldId: string, reason?: undefined } | { reason: string, fieldId?: undefined }}
 */
export function watchTarget(p, pub, myId) {
  void myId;
  if (!isObj(p)) return { reason: t('无效的目标') };
  if (p.alive === false) return { reason: t('该队友已被淘汰，无法查看其阵地') };
  const combat = isCombatPhase(pub?.phase);
  const fieldId = (combat && typeof p.fieldId === 'string' && p.fieldId) || ownFieldId(p.playerId);
  return { fieldId };
}

/**
 * Label of the ‹ › view switcher: the watched field (also one whose battle already ended), else the own field —
 * or, for an eliminated spectator (no own field), the watched player / 观战.
 * @param {Pub | null | undefined} pub
 * @param {string|null} watching fieldId on screen
 * @param {string} myId
 * @param {boolean} [spectating]
 */
export function switcherLabel(pub, watching, myId, spectating = false) {
  const fields = (Array.isArray(pub?.fields) ? pub.fields : []).filter(isObj);
  const cur = fields.find((f) => f.fieldId === watching);
  if (cur) return fieldLabel(cur, pub, myId);
  if (typeof watching === 'string' && watching.startsWith('n:') && watching !== ownFieldId(myId)) {
    return playerName(sortedPlayers(pub).find((p) => p.playerId === watching.slice(2))?.name) || t('队友');
  }
  return spectating ? t('观战') : t('自己');
}

/**
 * Human label of a field for the view switcher.
 * @param {PubField} field { fieldId, kind, players }
 * @param {Pub | null | undefined} pub
 * @param {string} myId
 */
export function fieldLabel(field, pub, myId) {
  if (!isObj(field)) return '—';
  const names = new Map(sortedPlayers(pub).map((p) => [p.playerId, playerName(p.name) || t('博士')]));
  const ps = Array.isArray(field.players) ? field.players : [];
  if (field.kind === 'unite') return ps.includes(myId) ? t('联防（自己）') : t('联防阵地');
  if (field.kind === 'boss' || field.kind === 'hidden') {
    if (ps.includes(myId)) return ps.length > 1 ? t('全景') : t('自己');
    return ps.map((id) => names.get(id) || t('博士')).join(' · ') || t('领袖战场');
  }
  if (ps.includes(myId) || field.fieldId === ownFieldId(myId)) return t('自己');
  const id = ps[0] ?? String(field.fieldId || '').replace(/^n:/, '');
  return names.get(id) || t('队友');
}

/**
 * Active emote bubbles: playerId → { id, seq, at, set } for emotes younger than ttl.
 * @param {Array<{seq:number, playerId:string, id:string, at:number, set?:string}>} emotes
 * @param {number} now
 * @param {number} [ttl]
 */
export function activeBubbles(emotes, now, ttl = 3000) {
  const out = new Map();
  for (const e of Array.isArray(emotes) ? emotes : []) {
    if (!isObj(e) || !(now - e.at < ttl) || e.at > now + 1000) continue;
    const cur = out.get(e.playerId);
    if (!cur || cur.seq < e.seq) out.set(e.playerId, { id: e.id, seq: e.seq, at: e.at, set: e.set }); // local patch: emote set
  }
  return out;
}
