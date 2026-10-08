// server/match/bossPath.js — the path a walking leader (假想敌：铳 boss_2 / 9, 卢西恩 boss_5 — the other leaders are
// 自缚) takes on this match's boss field, for the Final Assault / Hidden Core prep (render/fxroute.js runs the official
// route preview cursor along it). docs/LOCAL-PATCH.md 「보스 경로 미리보기」 (user request 2026-10-08).
//
// The level files only give checkpoints (the same on every stage: level_act1autochess_h07_02 / h08_02 / act2 h07_05);
// the walked line between them is the flow field over the stage's own boss-field tiles. Rather than re-deriving it, the
// path is the sim's: a headless battle of the field with no operators and only the round's leader spawns (the mirrored
// copy of a pair field comes from its branch as in the real fight), each leader's position sampled every tick from its
// spawn until it reaches the first checkpoint of its route a second time — the way there plus one patrol lap
// (content/bosses.js patrolLoop; 卢西恩's list of five laps collapses to one). [추정] what the client walks: no official
// per-stage path exists to compare with (research note in STRONGHOLD.md §11, 2026-10-08).
//
// Deterministic (no operators, a fixed seed) and cached per stage × template × field size × device overrides.

import { GEO } from '../../shared/constants.js';
import { Battle } from '../sim/Battle.js';

/** Tick cap of one path run (30 ticks/s): 600 game s — a lap of the slowest leader on the longest field is ~560 s. */
export const PATH_TICK_CAP = 30 * 600;
/** Douglas–Peucker tolerance (tiles) of the sent polyline. */
export const PATH_EPS = 0.02;
/** Ticks after which a leader still on its spawn point counts as not walking (10 game s). */
const STILL_TICKS = 30 * 10;
const CACHE_MAX = 64;
const cache = new Map();

/** Douglas–Peucker over [row, col] points. */
export function simplifyPath(pts, eps = PATH_EPS) {
  if (!Array.isArray(pts) || pts.length < 3) return Array.isArray(pts) ? pts.slice() : [];
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ar, ac] = pts[a], [br, bc] = pts[b];
    const dr = br - ar, dc = bc - ac, len = Math.hypot(dr, dc);
    let best = -1, bd = eps;
    for (let i = a + 1; i < b; i++) {
      const [r, c] = pts[i];
      const d = len < 1e-9 ? Math.hypot(r - ar, c - ac) : Math.abs(dc * (r - ar) - dr * (c - ac)) / len;
      if (d > bd) { bd = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const legAt = (L) => (L && L.t === 'move' && Number.isFinite(L.r) && Number.isFinite(L.c) ? `${L.r},${L.c}` : null);

/**
 * Run the leaders of a boss field without operators and record their paths.
 * @param {(opts: object) => object} newBattle battle factory (Match.newBattle, or `(o) => new Battle(o)`)
 * @param {object} opts battle options of the field (stageId, rect, routes, waveId, enemyOverrides, …); `players` are
 *   reduced to their seats (no units, effects or bonds), `spawns` to the leader spawns
 * @returns {Array<{ enemyKey: string, pts: number[][] }>} one entry per leader, [row, col] points from its spawn
 */
export function runLeaderPaths(newBattle, opts) {
  const players = (opts.players || []).map((p, i) => ({
    playerId: p.playerId ?? `p${i + 1}`, seat: p.seat ?? i, side: p.side ?? (i ? 'R' : 'L'), colOffset: p.colOffset ?? (i ? 8 : 0),
    units: [], bonds: {}, bandId: null, playerEffects: [], deviceOverrides: { ...(p.deviceOverrides || {}) },
  }));
  const spawns = (opts.spawns || []).filter((s) => s && s.tag === 'boss').map((s) => ({ ...s, count: 1, interval: 0 }));
  if (!spawns.length) return [];
  const pool = { hp: 1e12, maxHp: 1e12, damage() {} };
  const b = newBattle({ ...opts, seed: 1, timeLimit: null, players, spawns, sharedBoss: pool });
  if (!b || typeof b.step !== 'function') return [];
  const tracks = new Map();
  for (let i = 0; i < PATH_TICK_CAP && !b.finished; i++) {
    b.step();
    let open = 0;
    for (const e of b.enemies || []) {
      if (!e || !(e.isBoss || e.tag === 'boss')) continue;
      let t = tracks.get(e.id);
      if (!t) {
        const legs = e.route && Array.isArray(e.route.legs) ? e.route.legs : [];
        t = { enemyKey: e.defId, pts: [], first: legAt(legs[0]), arrivals: 0, leg: e.route ? e.route.legIdx : 0, done: false };
        tracks.set(e.id, t);
      }
      if (t.done) continue;
      if (!e.alive || !t.first) { t.done = true; continue; }   // gone, or no checkpoint route: nothing to preview
      t.pts.push([e.y, e.x]);
      const li = e.route ? e.route.legIdx : t.leg;
      if (li !== t.leg) {
        // the leg it just finished ends on the route's first checkpoint: the 2nd time closes the lap
        const legs = e.route.legs;
        if (legAt(legs[t.leg]) === t.first && ++t.arrivals >= 2) t.done = true;
        t.leg = li;
      }
      // a leader that has not left its spawn tile after STILL_TICKS does not walk (自缚: 胄, 管, 昆图斯 …)
      if (t.pts.length === STILL_TICKS && Math.hypot(e.y - t.pts[0][0], e.x - t.pts[0][1]) < 0.05) { t.still = true; t.done = true; }
      if (!t.done) open++;
    }
    if (tracks.size && !open && i > 0) break;
  }
  return [...tracks.values()].filter((t) => t.first && !t.still && t.pts.length > 1).map((t) => ({
    enemyKey: t.enemyKey,
    pts: simplifyPath(t.pts).map(([r, c]) => [Math.round(r * 100) / 100, Math.round(c * 100) / 100]),
  }));
}

/**
 * The leader paths of a boss group's field (Match: `g` = bossGroupOf(ps)), cached; [] when the group's leader does not
 * walk or the run fails.
 */
export function bossFieldPaths(m, g) {
  const wave = g && g.wave;
  if (!wave || !wave.templateId || !m || !m.stageId) return [];
  const pss = (g.players || []).map((pid) => (m.players && typeof m.players.get === 'function' ? m.players.get(pid) : null));
  const devices = pss.map((ps) => (ps && ps.deviceOverrides) || {});
  const key = `${m.stageId}|${wave.templateId}|${pss.length}|${JSON.stringify(devices)}`;
  if (cache.has(key)) return cache.get(key);
  let out;
  try {
    // the sim's own Battle, not the match's factory (Match.newBattle: tests inject a fake one and count its fields)
    out = runLeaderPaths((o) => new Battle({ data: m.ds, content: m.battleContent || 'full', ...o }), {
      kind: 'boss', modeId: m.modeId, round: m.round, stageId: m.stageId, rect: { ...GEO.BOSS_RECT },
      players: pss.map((ps, i) => ({ playerId: ps ? ps.playerId : `p${i + 1}`, seat: i, side: i ? 'R' : 'L', colOffset: i ? 8 : 0, deviceOverrides: devices[i] })),
      spawns: wave.spawns, routes: wave.routes, enemyOverrides: wave.overrides, waveId: wave.templateId,
      flags: { layerGainsEnabled: false, ...(m.gd && m.gd.dp) }, fieldId: 'path',
    });
  } catch (e) {
    if (typeof m.reportError === 'function') m.reportError('boss path', e);
    out = [];
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, out);
  return out;
}
