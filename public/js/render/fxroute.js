// render/fxroute.js — the route preview of a walking leader in the Final Assault / Hidden Core prep (docs/LOCAL-PATCH.md
// 「보스 경로 미리보기」, user request 2026-10-08).
//
// The server sends the leader's paths on its field (m.private.nextEnemies boss entry `paths`: [[row, col], …] per leader
// copy, server/match/bossPath.js — the sim's walk from the spawn through one patrol lap). Along each one runs the
// client's own route preview cursor — the glowing mark a normal stage sends along an enemy's route before it comes
// (metadata: CreatePreviewCursor / ShowRoutePreviewCursor; prefabs WalkPreviewCursor / FlyPreviewCursor in
// battle/[pack]common.ab, extracted as route_cursor): its controller moves it at `_moveSpeed` 8 tiles/s, `_height` 0.3
// (walk) / 1.2 (fly) over the ground, `_times` 1 run, then `_delayToRecycle` 0.5 s for the trail to fade. Here the run
// repeats after ROUTE_GAP_S [추정: ROUTE_SHOWN_INTERVAL's value is in native code] for as long as the prep shows the
// leader. Without the official effect (quality low, not extracted, no WebP) a trail of red motes (render/fx.js) runs
// the same way.

/** [bundle, prefab] of the cursors (fx_extract.py --bundle route_cursor --pack 'battle/[pack]common.ab'). */
export const ROUTE_FX = Object.freeze({ WALK: ['route_cursor', 'WalkPreviewCursor'], FLY: ['route_cursor', 'FlyPreviewCursor'] });
/** Cursor controller values of the prefabs (`_moveSpeed` tiles/s, `_height` tiles, `_delayToRecycle` s). */
export const CURSOR = Object.freeze({ speed: 8, height: { WALK: 0.3, FLY: 1.2 }, recycle: 0.5 });
/** Pause between two runs of one path (s) [추정]. */
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
 * The cursors of the shown paths.
 * @param {{ fxGame: object, heightAt: (r: number, c: number) => number, fallback?: (x: number, y: number, z: number) => void,
 *   onShow?: () => void }} o
 *   fxGame = render/fxgame.js layer (playFree); fallback draws one mote of the stand-in trail at a board point; onShow:
 *   a new route preview starts (its cursors' first run) — the client's 行动开始 line hangs on the cursor's spawn
 *   (VoicePlayer._OnPreviewCursorSpawn, public/js/voice.js voiceForRoutePreview)
 * @returns {{ sync(paths: number[][][]|null, motion: string, dt: number): void, clear(): void }}
 */
export function createRouteCursors({ fxGame, heightAt, fallback = null, onShow = null }) {
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
        if (runs.length && typeof onShow === 'function') { try { onShow(); } catch { /* ignore */ } }
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
