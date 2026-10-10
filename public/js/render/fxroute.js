// render/fxroute.js — the client's route preview cursors (WalkPreviewCursor / FlyPreviewCursor), two uses:
//   * createBattleCursors — the OFFICIAL preview of a battle's start (docs/rules/render.md 「적 경로 미리보기」, 관리자 결정
//     (2026-10-10)): the wave scheduler runs 2 cursors along an enemy route 3 s before the first unit of a level action
//     marked `autoPreviewRoute` (/sim/routePreview.js builds the plan from the BattleSpec, public/js/battle/runner.js
//     hands it over as m.field `routeCursors`). Each cursor spawn is the client's ON_PREVIEW_CURSOR_SPAWND (onSpawn →
//     render/app.js 'routePreview' → screens/game.js → voice.js voiceForRoutePreview — silent in 卫戍协议: its 行动开始
//     needs the card list the mode disables, docs/rules/audio.md 「오퍼레이터 음성」).
//   * createRouteCursors — OUR convenience feature, not in the official game (docs/rules/render.md 「보스 경로 미리보기」,
//     maintainer request 2026-10-08): in the Final Assault / Hidden Core prep the server sends a walking leader's paths
//     (m.private.nextEnemies boss entry `paths`: [[row, col], …] per leader copy, server/match/bossPath.js — the sim's
//     walk from the spawn through one patrol lap) and a cursor runs along each, again ROUTE_GAP_S after each run, for as
//     long as the prep shows the leader. No voice line (관리자 결정 (2026-10-10)).
// The cursor: metadata CreatePreviewCursor / ShowRoutePreviewCursor; prefabs WalkPreviewCursor / FlyPreviewCursor in
// battle/[pack]common.ab, extracted as route_cursor — its controller moves it at `_moveSpeed` 8 tiles/s, `_height` 0.3
// (walk) / 1.2 (fly) over the ground, `_times` 1 run, then `_delayToRecycle` 0.5 s for the trail to fade. Without the
// official effect (quality low, not extracted, no WebP) a trail of red motes (render/fx.js) runs the same way.

/** [bundle, prefab] of the cursors (fx_extract.py --bundle route_cursor --pack 'battle/[pack]common.ab'). */
export const ROUTE_FX = Object.freeze({ WALK: ['route_cursor', 'WalkPreviewCursor'], FLY: ['route_cursor', 'FlyPreviewCursor'] });
/** Cursor controller values of the prefabs (`_moveSpeed` tiles/s, `_height` tiles, `_delayToRecycle` s). */
export const CURSOR = Object.freeze({ speed: 8, height: { WALK: 0.3, FLY: 1.2 }, recycle: 0.5 });
/** Pause between two runs of one path of the boss-prep preview (s) — our own value: the feature is not official. */
export const ROUTE_GAP_S = 1.5;

/** Cumulative lengths of a [row, col] polyline. */
export function pathLengths(pts) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return acc;
}

/** The point at distance `d` along a polyline (acc = pathLengths(pts)) → { row, col }. */
export function pointAt(pts, acc, d) {
  const n = pts.length;
  if (!n) return { row: 0, col: 0 };
  if (d <= 0 || n === 1) return { row: pts[0][0], col: pts[0][1] };
  if (d >= acc[n - 1]) return { row: pts[n - 1][0], col: pts[n - 1][1] };
  let i = 1;
  while (i < n - 1 && acc[i] < d) i++;
  const seg = acc[i] - acc[i - 1] || 1, k = (d - acc[i - 1]) / seg;
  return { row: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, col: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k };
}

const validPath = (p) => Array.isArray(p) && p.length >= 2 && p.every((q) => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1]));

/**
 * The boss-prep cursors of the shown paths (our feature, see the header).
 * @param {{ fxGame: object, heightAt: (r: number, c: number) => number, fallback?: (x: number, y: number, z: number) => void }} o
 *   fxGame = render/fxgame.js layer (playFree); fallback draws one mote of the stand-in trail at a board point
 * @returns {{ sync(paths: number[][][]|null, motion: string, dt: number): void, clear(): void }}
 */
export function createRouteCursors({ fxGame, heightAt, fallback = null }) {
  let sig = '';
  let runs = [];   // { pts, acc, d, wait, at, handle, pending, off }

  function stopRun(r, now = false) {
    if (r.handle) { try { r.handle.stop(now); } catch { /* ignore */ } }
    r.handle = null;
  }
  function clear() {
    for (const r of runs) { r.gone = true; stopRun(r, true); }
    runs = [];
    sig = '';
  }
  function place(r) {
    const p = pointAt(r.pts, r.acc, r.d);
    r.at.x = p.col; r.at.y = p.row;
    r.at.z = (heightAt(Math.round(p.row), Math.round(p.col)) || 0) + r.h;
  }
  function start(r, motion) {
    r.d = 0;
    place(r);
    if (r.off || !fxGame || typeof fxGame.playFree !== 'function') { r.off = true; return; }
    const [bundle, name] = ROUTE_FX[motion] || ROUTE_FX.WALK;
    r.pending = true;
    fxGame.playFree(bundle, name, r.at).then((h) => {
      r.pending = false;
      if (r.gone) { h?.stop(true); return; }
      if (!h) { r.off = true; return; }
      r.handle = h;
    }, () => { r.pending = false; r.off = true; });
  }

  return {
    clear,
    sync(paths, motion, dt) {
      const list = Array.isArray(paths) ? paths.filter(validPath) : [];
      const s = list.length ? `${motion}|${JSON.stringify(list)}` : '';
      if (s !== sig) {
        clear();
        sig = s;
        const h = CURSOR.height[motion] ?? CURSOR.height.WALK;
        runs = list.map((pts) => ({ pts, acc: pathLengths(pts), d: 0, wait: 0, at: { x: 0, y: 0, z: 0 }, h, handle: null, pending: false, off: false, gone: false }));
        for (const r of runs) start(r, motion);
      }
      for (const r of runs) {
        if (r.pending) continue;
        if (r.wait > 0) {
          r.wait -= dt;
          if (r.wait <= 0) start(r, motion);
          continue;
        }
        if (r.handle && !r.handle.alive()) r.handle = null;   // dropped (clear / instance cap): the next run starts anew
        r.d += CURSOR.speed * dt;
        place(r);
        if (r.off && fallback) { try { fallback(r.at.x, r.at.y, r.at.z); } catch { /* ignore */ } }
        if (r.d >= r.acc[r.acc.length - 1]) { stopRun(r); r.wait = CURSOR.recycle + ROUTE_GAP_S; }
      }
    },
  };
}

/** Game seconds a cursor may be under way on the first frame of a view and still count as spawned on screen. */
const JOIN_SLACK_S = 0.25;

/**
 * The official route preview of a battle's start (docs/rules/render.md 「적 경로 미리보기」, 관리자 결정 (2026-10-10)): the
 * cursors the client's wave scheduler runs along an enemy route 3 s before the first unit of a marked level action
 * (Scheduler._DealAction, RVA 0x629EE0: 2 cursors 0.3 s apart, at once when that falls before the battle's start). The
 * plan — `[{ t, motion, pts }]`, t in game seconds, pts the line the sim's enemy walks — is the runner's m.field
 * `routeCursors` (/sim/routePreview.js). Each cursor runs ONCE at `_moveSpeed` in game time (the battle speed scales it
 * like the client's), then its trail fades (`_delayToRecycle`). A cursor whose run is already over when the plan
 * arrives (a field watched mid-battle, a re-entered view) is skipped, one under way joins where it is.
 * @param {{ fxGame: object, heightAt: (r: number, c: number) => number, fallback?: (x: number, y: number, z: number) => void,
 *   onSpawn?: (c: { t: number, motion: string }) => void }} o
 *   onSpawn: a cursor appears on the battle clock (not one joined late) — the client's ON_PREVIEW_CURSOR_SPAWND
 *   (VoicePlayer._OnPreviewCursorSpawn's 行动开始 never plays in 卫戍协议: public/js/voice.js voiceForRoutePreview)
 * @returns {{ load(plan: object[]|null): void, update(renderT: number): void, clear(): void }}
 */
export function createBattleCursors({ fxGame, heightAt, fallback = null, onSpawn = null }) {
  let list = [];   // { t, motion, pts, acc, len, h, at, state: 'wait'|'run'|'done', handle, pending, off, gone }
  let lastT = null;

  function stop(c, now = false) {
    if (c.handle) { try { c.handle.stop(now); } catch { /* ignore */ } }
    c.handle = null;
  }
  function clear() {
    for (const c of list) { c.gone = true; stop(c, true); }
    list = [];
    lastT = null;
  }
  function place(c, d) {
    const p = pointAt(c.pts, c.acc, d);
    c.at.x = p.col; c.at.y = p.row;
    c.at.z = (heightAt(Math.round(p.row), Math.round(p.col)) || 0) + c.h;
  }
  function spawn(c) {
    if (!fxGame || typeof fxGame.playFree !== 'function') { c.off = true; return; }
    const [bundle, name] = ROUTE_FX[c.motion] || ROUTE_FX.WALK;
    c.pending = true;
    fxGame.playFree(bundle, name, c.at).then((h) => {
      c.pending = false;
      if (c.gone || c.state === 'done') { h?.stop(c.gone); return; }
      if (!h) { c.off = true; return; }
      c.handle = h;
    }, () => { c.pending = false; c.off = true; });
  }

  return {
    clear,
    load(plan) {
      clear();
      for (const p of Array.isArray(plan) ? plan : []) {
        if (!p || !Number.isFinite(p.t) || !validPath(p.pts)) continue;
        const motion = p.motion === 'FLY' ? 'FLY' : 'WALK';
        const acc = pathLengths(p.pts);
        list.push({ t: p.t, motion, pts: p.pts, acc, len: acc[acc.length - 1], h: CURSOR.height[motion] ?? CURSOR.height.WALK,
          at: { x: 0, y: 0, z: 0 }, state: 'wait', handle: null, pending: false, off: false, gone: false });
      }
    },
    update(renderT) {
      if (!list.length || !Number.isFinite(renderT)) return;
      const first = lastT === null;
      lastT = renderT;
      for (const c of list) {
        if (c.state === 'done') continue;
        if (renderT < c.t) continue;
        const d = (renderT - c.t) * CURSOR.speed;
        if (c.state === 'wait') {
          if (d >= c.len) { c.state = 'done'; continue; }   // already over when the plan arrived (or a long stall)
          c.state = 'run';
          place(c, d);
          spawn(c);
          // the battle's own clock reached it — a view entered at the start counts (its first frame may be up to
          // JOIN_SLACK_S in), one joined later does not
          if (!(first && renderT - c.t > JOIN_SLACK_S) && typeof onSpawn === 'function') { try { onSpawn({ t: c.t, motion: c.motion }); } catch { /* ignore */ } }
          continue;
        }
        if (c.handle && !c.handle.alive()) c.handle = null;
        place(c, Math.min(d, c.len));
        if (c.off && fallback) { try { fallback(c.at.x, c.at.y, c.at.z); } catch { /* ignore */ } }
        if (d >= c.len) { c.state = 'done'; stop(c); }   // its trail fades (`_delayToRecycle`) in the effect itself
      }
    },
  };
}
