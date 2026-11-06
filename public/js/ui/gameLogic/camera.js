// ui/gameLogic/camera.js — prep camera, boss-field tile mapping, owner band. Re-exported from ../gameLogic.js.

import { GEO, PHASE } from '../../../../shared/constants.js';
import { BOSS_ROW_SHIFT, MAX_COL } from '../../render/prepfield.js';
import { int, isObj } from './shared.js';


/**
 * Camera of the own prep board (research 09 §1.2 "Final Assault, right side", DESIGN §15): in the prep of a boss round
 * (最终攻势 / 隐秘核心: `pub.round` is `bossRound` or `hiddenRound`) the pieces stand on the player's half of the shared
 * boss field — `{ kind: 'bossPrep', opts: { side } }`; the side follows the server's pairing (`pub.bossPairs`, server/
 * match/finalAssault.js pairPlayers: drawn for each boss wave, each pair in seat order; the second of a pair is on the
 * mirrored right half 'R', a lone player on 'L' — bossPairOf). Any other prep: the own board
 * `{ kind: 'prep', opts: { rect, side: 'L' } }`.
 * @param {any} pub m.public
 * @param {string|null} myId
 * @returns {{ kind: 'prep'|'bossPrep', opts: { rect?: { r0: number, r1: number, c0: number, c1: number }, side: 'L'|'R' } }}
 */
export function prepCamera(pub, myId) {
  const normal = { kind: 'prep', opts: { rect: { ...GEO.NORMAL_RECT }, side: 'L' } };
  const r = pub?.round;
  if (!Number.isInteger(r) || r <= 0 || !(r === pub.bossRound || r === pub.hiddenRound)) return normal;
  const pair = bossPairOf(pub, myId);
  if (!pair) return normal; // eliminated / unknown: no board of its own on the boss field
  return { kind: 'bossPrep', opts: { side: pair.indexOf(myId) === 1 ? 'R' : 'L' } };
}

/**
 * A player's pair of a boss round's prep: the server's `pub.bossPairs` (drawn for each boss wave — upstream #845), or,
 * from a server that does not send them, the alive players in seat order, two by two. null when the player has none.
 * @param {any} pub m.public @param {string|null} myId
 * @returns {string[]|null}
 */
function bossPairOf(pub, myId) {
  if (Array.isArray(pub.bossPairs)) return pub.bossPairs.find((g) => Array.isArray(g) && g.includes(myId)) || null;
  const alive = (Array.isArray(pub.players) ? pub.players : []).filter((p) => isObj(p) && p.alive !== false)
    .sort((a, b) => int(a.seat, 99) - int(b.seat, 99)).map((p) => p.playerId);
  const idx = alive.indexOf(myId);
  return idx < 0 ? null : alive.slice(idx - (idx % 2), idx - (idx % 2) + 2);
}

const BOSS_PREP_PHASES = new Set([PHASE.ROUND_START, PHASE.SP_DRAFT, PHASE.PREP]);

/**
 * The players framed in green on the team panel (community report of 2026-10-06, item 51: 「同组两个玩家屏幕左边的头像也像原版
 * 那样用绿框框起来」 — the official co-op frame, ui/battle `bg_team_border`): in a boss round (最终攻势 / 隐秘核心) the viewer
 * and its pair partner — from the round's start (回合开始 / 机变 / 休整期: the pairing `prepCamera` reads, bossPairOf —
 * server/match/finalAssault.js pairPlayers) through the fight (the boss field listing the
 * viewer). Empty for a lone player, an eliminated player or a spectator seat (no pair of its own) and in every other
 * round. PR #191 framed the partner alone, in gold (not merged).
 * @param {any} pub m.public @param {string|null} myId
 * @returns {Set<string>}
 */
export function teamFrameIds(pub, myId) {
  const none = new Set();
  if (!pub || !myId) return none;
  const players = Array.isArray(pub.players) ? pub.players.filter(isObj) : [];
  const me = players.find((p) => p.playerId === myId);
  if (!me || me.alive === false) return none;
  const r = pub.round;
  const bossRound = Number.isInteger(r) && r > 0 && (r === pub.bossRound || r === pub.hiddenRound);
  if (pub.phase === PHASE.FINAL_ASSAULT || pub.phase === PHASE.HIDDEN_CORE) {
    const f = (Array.isArray(pub.fields) ? pub.fields : []).find((x) => isObj(x) && (x.kind === 'boss' || x.kind === 'hidden') && Array.isArray(x.players) && x.players.includes(myId));
    return f && f.players.length > 1 ? new Set(f.players) : none;
  }
  if (!bossRound || !BOSS_PREP_PHASES.has(pub.phase)) return none;
  const pair = bossPairOf(pub, myId);
  return pair && pair.length > 1 ? new Set(pair) : none;
}

/**
 * The own prep board's camera request with the shop bar's state (public issue #5 "准备阶段，收起商店界面时，界面并不会进行
 * 缩放"): `prepCamera` plus `shop: !folded` — a folded shop (收起) takes the official shop-collapsed camera
 * (configBlackBoard left_prepare_camera_param / *_boss_prepare_*, render/projection.js presetCamera `shop: false`) and
 * the folded shop's HUD band (ui/fieldHost.js hudBands), an open one the shop camera. `folded` = the shop bar is shown
 * and folded (an eliminated player's board, which shows no bar, keeps the shop camera).
 * @returns {{ kind: 'prep'|'bossPrep', opts: { rect?: object, side: 'L'|'R', shop: boolean } }}
 */
export function prepCameraFor(pub, myId, folded = false) {
  const c = prepCamera(pub, myId);
  return { kind: c.kind, opts: { ...c.opts, shop: !folded } };
}

/**
 * The camera request a fold / unfold of the shop bar needs right now (public issue #5), or null: only while the own prep
 * board is on screen (`ownPrep`: prep, not a teammate's scouted board, not a battle), never over the enemy pen (`pen`: it
 * folds the shop itself and returns to the camera it left), deferred while a piece is dragged or its direction is chosen
 * (`busy`: the drop target and the wheel sit on tiles of the camera in use — the caller asks again once that ends), and
 * nothing when the current request (`current` { kind, opts }) already has that state. `sideBy`: the official side camera
 * (a held or a selected piece, docs/rules/ui.md 「기물을 고르고 집을 때의 측면 카메라」), `at`: the selected piece's board tile.
 * @param {{ pub: any, myId: string|null, ownPrep: boolean, folded: boolean, pen?: boolean, busy?: boolean,
 *   sideBy?: boolean, at?: { row: number, col: number }|null,
 *   current?: { kind: string, opts?: { shop?: boolean, sideBy?: boolean, at?: { row: number, col: number }|null } }|null }} s
 * @returns {{ kind: 'prep'|'bossPrep', opts: object }|null}
 */
export function foldCamera(s) {
  if (!s || !s.ownPrep || s.pen || s.busy) return null;
  const want = prepCameraFor(s.pub, s.myId, !!s.folded);
  if (s.sideBy) want.opts.sideBy = true;
  if (s.at) want.opts.at = { row: s.at.row, col: s.at.col };
  const cur = s.current;
  if (cur && cur.kind === want.kind && (cur.opts?.shop !== false) === want.opts.shop && !!cur.opts?.sideBy === !!s.sideBy
    && cur.opts?.at?.row === s.at?.row && cur.opts?.at?.col === s.at?.col) return null;
  return want;
}

/**
 * The board tile of the piece the own prep board shows selected, or null: while it can be edited, not over the enemy pen,
 * not while a piece is held (that is the held camera). `hold`: the tile of the piece a press on the field just let go of,
 * until the release — a tap on another piece selects that one at the release, and the shop must not open and the camera
 * not turn back in between.
 * @param {{ tile?: { row: number, col: number }|null, hold?: { row: number, col: number }|null, editable?: boolean,
 *   showPrep?: boolean, pen?: boolean, drag?: boolean, facing?: boolean }|null|undefined} o
 * @returns {{ row: number, col: number }|null}
 */
export function selectedTile(o) {
  if (!o || !o.editable || !o.showPrep || o.pen || o.drag || o.facing) return null;
  return o.tile || o.hold || null;
}

/**
 * The camera of the own prep board's interaction (official AutoChessUIPlugin / AutoChessCameraPlugin; docs/rules/ui.md
 * 「기물을 고르고 집을 때의 측면 카메라」): a held piece or the direction wheel (`held`: deployFoldsShop) takes the side camera; a
 * selected piece the side camera over its tile (`selected`: its board tile), at the height of the shop state.
 * @param {{ held?: boolean, selected?: { row: number, col: number }|null }} o
 * @returns {{ sideBy: boolean, at: { row: number, col: number }|null }}
 */
export function sideCamera(o) {
  if (o?.held) return { sideBy: true, at: null };
  return o?.selected ? { sideBy: true, at: o.selected } : { sideBy: false, at: null };
}

/**
 * Whether a held piece folds the shop for as long as it is held (docs/rules/ui.md 「기물을 고르고 집을 때의 측면 카메라」, as the
 * official game does; upstream #602): the viewer edits the own prep board, the camera is not over the enemy pen (it
 * folds the shop itself), and a piece is dragged or the direction wheel of a legal drop is open. Derived from the
 * interaction: the player's own 收起 state is never written and comes back afterwards.
 * @param {{ ownPrep?: boolean, editable?: boolean, pen?: boolean, drag?: boolean, facing?: boolean }|null|undefined} o
 * @returns {boolean}
 */
export function deployFoldsShop(o) {
  if (!o) return false;
  return !!o.ownPrep && !!o.editable && !o.pen && (!!o.drag || !!o.facing);
}

/**
 * The field the own pieces are deployed on (server/match/Match.js deployFieldOf): 'bossL' / 'bossR' in the prep of a
 * boss round (the same pairing as `prepCamera`), else 'normal'. Placement legality (`placementContext` → `deployMap`
 * with `field`) reads that field's tiles.
 * @returns {'normal'|'bossL'|'bossR'}
 */
export function deployFieldOf(pub, myId) {
  const cam = prepCamera(pub, myId);
  return cam.kind === 'bossPrep' ? (cam.opts.side === 'R' ? 'bossR' : 'bossL') : 'normal';
}

/**
 * The stage tile [row, col] of board tile (r, c) on deploy field `field` (server/match/board.js fieldTile): the boss
 * prep's display transform (render/prepfield.js bossPrepField: row − 7, the right half mirrored col c → 20 − c).
 */
export function fieldTile(field, r, c) {
  if (field !== 'bossL' && field !== 'bossR') return [r, c];
  return [r + BOSS_ROW_SHIFT, field === 'bossR' ? MAX_COL - c : c];
}

/** The board tile of stage tile (r, c) on deploy field `field` (server/match/board.js boardTileOf). */
export function boardTileOf(field, r, c) {
  if (field !== 'bossL' && field !== 'bossR') return [r, c];
  return [r - BOSS_ROW_SHIFT, field === 'bossR' ? MAX_COL - c : c];
}

/** The band (策略) a player picked, from m.public.players[].bandId (Match.js marksPublic) — the detail card shows it
 *   on a teammate's unit (user playtest #2 item 2: watching a teammate revealed nothing about their 策略). */
export function ownerBandId(pub, ownerId) {
  const p = Array.isArray(pub?.players) ? pub.players.find((x) => x && x.playerId === ownerId) : null;
  return typeof p?.bandId === 'string' && p.bandId ? p.bandId : null;
}
