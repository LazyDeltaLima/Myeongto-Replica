// render/fxtrait.js — 规程's 特质 effect over a prep piece (docs/rules/fx.md 「규정 특질 발동 이펙트」).
//
// The server's live m.trait { uid, fx } (server/match/effectsMeta.js _traitFx: a piece of this player ran a 特质 —
// 「获得时」 when bought, 铃兰's 指令 running it again, 「进入休整期时」 …) names the piece and the prefab (map_v079_buff0N,
// shared/traitFx.js). main.js queues it here; the field view (render/app.js frame) plays each one once over the piece's
// prep view (fxgame statusOnce: at the prefab's own `_spawnLocation`, the head) as soon as that view exists — the message
// comes before the m.private that shows a bought piece — and drops one whose piece never shows within WAIT_MS (sold, an AI
// seat's board, a battle on screen). In a battle the sim's own ['tplfx', holder, prefab] plays them (fxgame.js tplFx).

import { TRAIT_FX_BUNDLE } from '../../../shared/traitFx.js';

/** @import { StatusFxApi } from './fxstatus.js' */
/** @typedef {{ alive?: unknown, remove?: unknown, destroyed?: unknown }} TraitView what drainTraitFx reads on a prep view */

/** How long a queued effect waits for its piece's view (ms). */
export const WAIT_MS = 2000;
const MAX = 32;
/** @type {{ uid: number, fx: string, at: number }[]} */
const queue = [];

/**
 * Queue m.trait `msg` ({ uid, fx }) at `now` (ms); a malformed one is ignored.
 * @param {{ uid?: unknown, fx?: unknown } | null | undefined} msg
 * @param {number} [now]
 */
export function pushTraitFx(msg, now = Date.now()) {
  if (!msg || !Number.isInteger(msg.uid) || typeof msg.fx !== 'string' || !/^map_v079_buff0\d$/.test(msg.fx)) return;
  queue.push({ uid: /** @type {number} */ (msg.uid), fx: msg.fx, at: now });
  if (queue.length > MAX) queue.splice(0, queue.length - MAX);
}

/** Whether any effect waits (the frame loop skips the walk otherwise). */
export const traitFxPending = () => queue.length > 0;

/**
 * Play the queued effects whose piece has a prep view (views: Map 'p:<uid>' → view) and drop the stale ones. `prep`
 * false (a battle on screen): nothing plays, the queue only ages.
 * @param {Map<unknown, TraitView | null | undefined> | null | undefined} views
 * @param {StatusFxApi | null | undefined} fxGame
 * @param {unknown} prep
 * @param {number} [now]
 */
export function drainTraitFx(views, fxGame, prep, now = Date.now()) {
  for (let i = queue.length - 1; i >= 0; i--) {
    const q = queue[i];
    if (now - q.at > WAIT_MS) { queue.splice(i, 1); continue; }
    if (!prep) continue;
    const v = views?.get?.('p:' + q.uid);
    if (!v || v.alive === false || v.remove || v.destroyed) continue;
    queue.splice(i, 1);
    fxGame?.statusOnce?.(v, TRAIT_FX_BUNDLE, q.fx);
  }
}

/** Empty the queue (tests; leaving a match). */
export function clearTraitFx() { queue.length = 0; }
