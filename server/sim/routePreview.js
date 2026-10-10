// server/sim/routePreview.js — the official enemy route preview of a battle's start: the cursors the client's wave
// scheduler runs along an enemy route before the first unit of a level action marked `autoPreviewRoute` comes
// (docs/rules/render.md 「적 경로 미리보기」, 관리자 결정 (2026-10-10)). Display only: it reads the battle (routes, grid flow
// fields) and never changes it, so the sim and the golden digests stay as they are; the browser runner builds the plan
// once per battle (public/js/battle/runner.js → m.field `routeCursors` → render/fxroute.js createBattleCursors).
//
// Client code (EN client, il2cpp dump):
//   * `Scheduler._DealAction` (RVA 0x629EE0): a SPAWN action with `autoPreviewRoute` adds a PREVIEW_CURSOR action on the
//     same route (`routeIndex`, `useExtraRoute`) at `t − 3` s (the constant 3.0 at .rdata 0x185D65030 =
//     PREVIEW_CURSOR_PRE_DELAY), where t = the SPAWN time minus the enemy's `delayToBorn` (≥ 0); a PREVIEW_CURSOR action
//     is `count` 2 × `interval` 0.3 s (PREVIEW_CURSOR_COUNT / _INTERVAL) — one cursor per item.
//   * The fragment's action queue is sorted by time (`_DealFragment`, RVA 0x630740, LegacySort) and run by
//     `DefaultWaveHandler.ExecuteActionQueue` (MoveNext RVA 0x62E0A0): an item at or before the elapsed time runs at
//     once — so a cursor time below 0 runs at the battle's start.
//   * Each item: `Scheduler._DoPreviewCursor` (MoveNext RVA 0x632000) → `BattleController.CreatePreviewCursor`
//     (RVA 0x3544C60): the route's cursor (`BattleFactory.CreatePreviewCursor(motionMode)`: WalkPreviewCursor /
//     FlyPreviewCursor), `PreviewCursor.Spawn`, event ON_PREVIEW_CURSOR_SPAWND (24) — VoicePlayer's 行动开始.
//   * 卫戍协议 builds each battle's actions from the server's enemy list (`AutoChessLevelEnemyManager`
//     `_GenerateActionFromEnemyInfo` RVA 0x8313F0, 联防 `GenerateHelpBattleEnemyData` RVA 0x82EFC0): one action per unit,
//     and only the FIRST unit generated for a level action copies its `autoPreviewRoute` — one preview per marked
//     action, before its first unit. data/waves.json carries the mark as `spawns[i].previewRoute`; a spawn spec names its
//     level action by `actionIndex` (server/match/waves.js).
// [추정] A marked action whose units are all left out (a placeholder of the other movement class) previews nothing — the
// client generates no action for it. The enemy's `delayToBorn` (prefab `_delayToBorn`, non-zero on 5 enemies, none of
// them a marked action's first unit in practice) is not modelled: our spawn time is the SPAWN time.

import { COLS } from './constants.js';
import { compileRoute } from './ai.js';
import { normalizeRoute } from './simdata.js';

/** Scheduler PREVIEW_CURSOR_COUNT: cursors per preview. */
export const PREVIEW_CURSOR_COUNT = 2;
/** Scheduler PREVIEW_CURSOR_PRE_DELAY (s): a preview starts this long before its action's first unit. */
export const PREVIEW_CURSOR_PRE_DELAY = 3;
/** Scheduler PREVIEW_CURSOR_INTERVAL (s) between the cursors of one preview. */
export const PREVIEW_CURSOR_INTERVAL = 0.3;

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/**
 * The previews of a spawn list: one per marked level action that spawns at least one unit, from its earliest unit.
 * @param {object[]} spawns spawn specs (`time`, `routeIndex`, `route?`, `actionIndex`)
 * @param {object|null} template the field's wave template (data/waves.json record: `spawns[i].previewRoute`)
 * @returns {Array<{ actionIndex: number, time: number, routeIndex: number, route: object|null }>} by time
 */
export function routePreviews(spawns, template) {
  const list = template && Array.isArray(template.spawns) ? template.spawns : [];
  const first = new Map(); // actionIndex → its earliest spawn spec
  for (const s of Array.isArray(spawns) ? spawns : []) {
    if (!s || typeof s !== 'object' || !Number.isInteger(s.actionIndex)) continue;
    const a = list[s.actionIndex];
    if (!a || a.previewRoute !== true) continue;
    const t = num(Number(s.time), Infinity);
    if (!(t >= 0) || t === Infinity) continue;
    const cur = first.get(s.actionIndex);
    if (!cur || t < cur.time) first.set(s.actionIndex, { actionIndex: s.actionIndex, time: t, routeIndex: Number.isInteger(s.routeIndex) ? s.routeIndex : 0, route: s.route ?? null });
  }
  return [...first.values()].sort((a, b) => a.time - b.time || a.actionIndex - b.actionIndex);
}

/** The cursor times of a preview whose action's first unit comes at `spawnTime` (the battle start clamps them to 0). */
export function cursorTimes(spawnTime) {
  const out = [];
  for (let i = 0; i < PREVIEW_CURSOR_COUNT; i++) out.push(Math.max(0, spawnTime - PREVIEW_CURSOR_PRE_DELAY + i * PREVIEW_CURSOR_INTERVAL));
  return out;
}

/**
 * The line an enemy of `route` walks on this battle's grid as it stands now, as [row, col] points: from the spawn
 * point, WALK legs along the flow field of each target exactly like ai.js planLeg (the live field, else the
 * obstacle-free one, else straight), FLY legs straight; WAIT legs add nothing; a DISAPPEAR ends the line (the cursor's
 * run) [추정]. Read-only: flow fields are cached per grid version and pure.
 * @param {object} b Battle
 * @param {object} route RouteSpec (normalizeRoute)
 * @returns {number[][]}
 */
export function routePolyline(b, route) {
  if (!b || !route || !Array.isArray(route.start)) return [];
  const R = b.rect;
  let r0 = num(route.start[0], 0), c0 = num(route.start[1], 0);
  if (R) { r0 = Math.max(R.r0 - 0.5, Math.min(R.r1 + 0.5, r0)); c0 = Math.max(R.c0 - 0.5, Math.min(R.c1 + 0.5, c0)); }
  const pts = [[r0, c0]];
  const g = b.grid;
  const fly = route.motion === 'FLY';
  let at = [r0, c0];
  const push = (r, c) => { const l = pts[pts.length - 1]; if (l[0] !== r || l[1] !== c) pts.push([r, c]); };
  for (const leg of compileRoute(route, R || null)) {
    if (leg.t === 'disappear' || leg.t === 'appear') break;
    if (leg.t !== 'move') continue;
    if (!fly && g) {
      const sr = Math.round(at[0]), sc = Math.round(at[1]);
      const k = g.inBounds(sr, sc) ? sr * COLS + sc : -1;
      let f = k >= 0 ? g.flowField(leg.r, leg.c) : null;
      if (f && !(f.dist[k] >= 0)) {
        f = g.flowField(leg.r, leg.c, { ignoreObstacles: true });
        if (!(f.dist[k] >= 0)) f = null;
      }
      if (f) {
        let x = k;
        let guard = COLS * 32;
        while (x !== f.dest && guard-- > 0) {
          x = f.next[x];
          if (x < 0) break;
          push((x / COLS) | 0, x % COLS);
        }
      }
    }
    push(leg.r, leg.c);
    at = [leg.r, leg.c];
  }
  return pts;
}

/**
 * The route preview cursors of a battle built from `spec` (call it before the first step — the line is read from the
 * grid as it stands): `[{ t, motion: 'WALK'|'FLY', pts: [[row, col], …], actionIndex }]` by time, or [] when the
 * field's template marks no action (boss fields, the routes the server sends for the Final Assault prep are another
 * thing: server/match/bossPath.js).
 * @param {object} b Battle
 * @param {object} spec BattleSpec (`spawns`, `waveId`)
 */
export function routePreviewPlan(b, spec) {
  if (!b || !spec || typeof spec !== 'object') return [];
  let template;
  try { template = spec.waveId && b.data && typeof b.data.rawWave === 'function' ? b.data.rawWave(spec.waveId) : null; } catch { template = null; }
  if (!template) return [];
  const out = [];
  for (const p of routePreviews(spec.spawns, template)) {
    const route = p.route ? normalizeRoute(p.route) : (b.routes && (b.routes[p.routeIndex] ?? b.routes[0])) || null;
    if (!route) continue;
    const pts = routePolyline(b, route);
    if (pts.length < 2) continue;
    const motion = route.motion === 'FLY' ? 'FLY' : 'WALK';
    for (const t of cursorTimes(p.time)) out.push({ t, motion, pts, actionIndex: p.actionIndex });
  }
  return out.sort((a, b2) => a.t - b2.t || a.actionIndex - b2.actionIndex);
}
