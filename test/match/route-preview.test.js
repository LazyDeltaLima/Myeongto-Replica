// The official route preview of a battle's start (docs/rules/render.md 「적 경로 미리보기」, 관리자 결정 (2026-10-10)): a level
// action marked `autoPreviewRoute` (data/waves.json `previewRoute`) gets 2 cursors 0.3 s apart, 3 s before its first unit
// (client Scheduler._DealAction), along the line the sim's enemy walks (server/sim/routePreview.js); the browser runs them
// (render/fxroute.js createBattleCursors) and each spawn asks for 行动开始. The boss-prep preview (our feature) no longer
// speaks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { DATA } from './harness.js';
import { buildBattleSpec, createBattleFromSpec, routePreviewPlan } from '../../server/sim/spec.js';
import { normalizeRoute } from '../../server/sim/simdata.js';
import { routePreviews, routePolyline, cursorTimes, PREVIEW_CURSOR_COUNT, PREVIEW_CURSOR_PRE_DELAY, PREVIEW_CURSOR_INTERVAL } from '../../server/sim/routePreview.js';
import { buildUniteWave } from '../../server/match/waves.js';
import { GameData } from '../../server/match/gamedata.js';
import { createBattleCursors, createRouteCursors, CURSOR } from '../../public/js/render/fxroute.js';

const W = DATA.waves;

test('data/waves.json carries the level files\' autoPreviewRoute as previewRoute', () => {
  const marked = (id) => W[id].spawns.map((s, i) => (s.previewRoute ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(marked('act1autochess_05'), [0, 4, 6, 10]);
  assert.deepEqual(marked('act1autochess_02'), []);
  assert.deepEqual(marked('act1autochess_escaped_multi'), [0, 1, 2, 3, 4, 5, 7]);
  assert.deepEqual(marked('act1autochess_escaped_single'), []);
  for (const t of Object.values(W).filter((t) => t.kind === 'boss' || t.kind === 'hidden')) assert.deepEqual(marked(t.id), [], t.id);
  const lv = '.cache/gamedata/levels/activities/act1autochess/level_act1autochess_05.json';
  if (existsSync(lv)) {
    const acts = JSON.parse(readFileSync(lv, 'utf8')).waves.flatMap((w) => w.fragments.flatMap((f) => f.actions));
    assert.deepEqual(acts.map((a, i) => (a.autoPreviewRoute ? i : -1)).filter((i) => i >= 0), marked('act1autochess_05'));
  }
});

test('cursor times: 2 cursors 0.3 s apart, 3 s before the first unit, at once when that is before the start', () => {
  assert.deepEqual([PREVIEW_CURSOR_COUNT, PREVIEW_CURSOR_PRE_DELAY, PREVIEW_CURSOR_INTERVAL], [2, 3, 0.3]);
  assert.deepEqual(cursorTimes(7), [4, 4.3]);
  assert.deepEqual(cursorTimes(3).map((t) => +t.toFixed(6)), [0, 0.3]);
  assert.deepEqual(cursorTimes(2).map((t) => +t.toFixed(6)), [0, 0]);
  // one preview per marked action, from its earliest unit (bounty units joining it included), on that unit's route
  const tpl = { spawns: [{ previewRoute: true }, {}, { previewRoute: true }] };
  const p = routePreviews([
    { time: 9, routeIndex: 0, actionIndex: 0 }, { time: 6, routeIndex: 0, actionIndex: 0, tag: 'bounty' },
    { time: 3, routeIndex: 1, actionIndex: 1 }, { time: 5, routeIndex: 2 },
  ], tpl);
  assert.deepEqual(p.map((x) => [x.actionIndex, x.time, x.routeIndex]), [[0, 6, 0]], 'action 2 spawns nothing: no preview');
});

/** A real round's field through the match path, with no operator on the board (enemies walk freely). */
async function realField(round) {
  const { makeMatch } = await import('./harness.js');
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
  h.toPrep(round);
  const m = h.m, ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'rp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const templateId = m.wave.templateId;
  const ds = m.ds;
  m.dispose?.();
  return { spec: JSON.parse(JSON.stringify(spec)), templateId, ds };
}

/** Distance of a point to a [row, col] polyline. */
function distTo(pts, r, c) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ar, ac] = pts[i - 1], [br, bc] = pts[i];
    const dr = br - ar, dc = bc - ac, L = dr * dr + dc * dc;
    const k = L > 0 ? Math.max(0, Math.min(1, ((r - ar) * dr + (c - ac) * dc) / L)) : 0;
    best = Math.min(best, Math.hypot(r - (ar + k * dr), c - (ac + k * dc)));
  }
  return best;
}

test('real match (round 4, act1autochess_04): the previews of the marked actions, along the line the enemy walks', async () => {
  const { spec, templateId, ds } = await realField(4);
  assert.equal(templateId, 'act1autochess_04');
  const b = createBattleFromSpec(spec, ds);
  const plan = routePreviewPlan(b, spec);
  assert.deepEqual(plan.map((p) => [+p.t.toFixed(6), p.actionIndex, p.motion]), [[0, 3, 'WALK'], [0.3, 3, 'WALK'], [9, 0, 'WALK'], [9.3, 0, 'WALK']]);
  // reading the plan changed nothing: the same spec without it gives the same battle
  const b2 = createBattleFromSpec(spec, ds);
  b.start(); b2.start();
  const firsts = new Map(); // actionIndex → { id, route spawn time }
  for (const a of [0, 3]) {
    const s = spec.spawns.filter((x) => x.actionIndex === a).sort((x, y) => x.time - y.time)[0];
    firsts.set(a, s);
  }
  const tracks = new Map(); // enemy id → { a, pts: [] }
  while (!b.finished && b.time < 60) {
    b.step(); b2.step();
    assert.deepEqual(b.enemies.map((e) => [e.id, e.x, e.y, e.hp]), b2.enemies.map((e) => [e.id, e.x, e.y, e.hp]));
    for (const e of b.enemies) {
      if (!e.alive) continue;
      let t = tracks.get(e.id);
      if (!t) {
        const a = [...firsts].find(([, s]) => Math.abs(e.deployedAt - s.time) < 0.05 && e.defId === s.enemyKey)?.[0];
        if (a == null) continue;
        t = { a, pts: [] };
        tracks.set(e.id, t);
      }
      t.pts.push([e.y, e.x]);
    }
  }
  assert.equal(b.time, b2.time);
  assert.deepEqual(b.result?.leaks ?? null, b2.result?.leaks ?? null);
  const seen = new Set();
  for (const t of tracks.values()) {
    if (seen.has(t.a)) continue;
    seen.add(t.a);
    const line = plan.find((p) => p.actionIndex === t.a).pts;
    assert.ok(t.pts.length > 30, `action ${t.a} walked`);
    for (const [r, c] of t.pts) assert.ok(distTo(line, r, c) < 0.02, `action ${t.a}: (${r.toFixed(2)},${c.toFixed(2)}) off the preview line`);
  }
  assert.deepEqual([...seen].sort(), [0, 3]);
  // a FLY route: straight through its checkpoints (the sim's flyers do the same)
  const fly = normalizeRoute(W.act1autochess_01.routes[2]);
  assert.deepEqual(routePolyline(b, fly), [[9, 10], [9, 9], [12, 9], [12, 7], [9, 7], [9, 5], [12, 5], [12, 4], [9, 4], [9, 2]]);
});

test('a round whose template marks nothing, a leader field and 联防 with one helper preview nothing; two helpers do', () => {
  const spawnsOf = (id) => W[id].spawns.map((s, i) => ({ time: s.time, routeIndex: s.routeIndex, actionIndex: i, enemyKey: s.key }));
  assert.deepEqual(routePreviews(spawnsOf('act1autochess_02'), W.act1autochess_02), []);
  assert.deepEqual(routePreviews(spawnsOf('act1autochess_h07_02'), W.act1autochess_h07_02), []);
  const gd = new GameData(DATA, 'mode_multi_normal');
  const leaked = [{ enemyKey: 'enemy_1005_yokai', mods: null, sourcePlayerId: 'p_0' }, { enemyKey: 'enemy_1007_slime', mods: null, sourcePlayerId: 'p_1' }];
  const one = buildUniteWave(gd, leaked, 1, 60);
  assert.deepEqual(routePreviews(one.spawns, W[one.templateId]), []);
  const two = buildUniteWave(gd, leaked, 2, 60);
  const pv = routePreviews(two.spawns, W[two.templateId]);
  assert.ok(pv.length >= 1, 'escaped_multi marks the host actions');
  for (const p of pv) assert.equal(W[two.templateId].spawns[p.actionIndex].previewRoute, true);
});

test('the browser cursors: one run each on the battle clock, 行动开始 per spawn, none for a run already over', () => {
  const played = [];
  const fxGame = { playFree: (b, n) => { played.push(n); const h = { on: true, stop() { h.on = false; }, alive: () => h.on }; return Promise.resolve(h); } };
  const spawned = [];
  const c = createBattleCursors({ fxGame, heightAt: () => 0, onSpawn: (x) => spawned.push(x.t) });
  const line = [[9, 10], [9, 2]];   // 8 tiles: one second at 8 tiles/s
  c.load([{ t: 0, motion: 'WALK', pts: line }, { t: 0.3, motion: 'WALK', pts: line }, { t: 4, motion: 'FLY', pts: line }]);
  c.update(0.05);
  assert.deepEqual(spawned, [0]);
  c.update(0.4);
  assert.deepEqual(spawned, [0, 0.3]);
  c.update(3.9);
  c.update(4.1);
  assert.deepEqual(spawned, [0, 0.3, 4]);
  assert.deepEqual(played, ['WalkPreviewCursor', 'WalkPreviewCursor', 'FlyPreviewCursor']);
  assert.equal(CURSOR.speed, 8);
  // a field watched mid-battle: a run already over is skipped, one under way joins silently
  const late = [];
  const c2 = createBattleCursors({ fxGame, heightAt: () => 0, onSpawn: (x) => late.push(x.t) });
  c2.load([{ t: 0, motion: 'WALK', pts: line }, { t: 3, motion: 'WALK', pts: line }, { t: 6, motion: 'WALK', pts: line }]);
  c2.update(3.5);
  c2.update(6.01);
  assert.deepEqual(late, [6]);
});

test('the boss-prep route preview (our feature) has no voice hook any more', () => {
  const calls = [];
  const fxGame = { playFree: () => Promise.resolve(null) };
  const r = createRouteCursors({ fxGame, heightAt: () => 0, onShow: () => calls.push(1) });
  r.sync([[[3, 9], [2, 3]]], 'WALK', 0.016);
  r.sync([[[3, 9], [2, 3]]], 'WALK', 0.016);
  assert.deepEqual(calls, []);
});
