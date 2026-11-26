// test/render/mousek-sandstorm-fx.test.js — 鼠王's 【沙狱】 area drawn as the client draws it (2026-11-26, docs/rules/sim.md
// 「적 스킬 = 일반 공격 차례」 래트킹·'즈자이'의 투사체, 화면): projectile_mousek_s2 has no effect of its own while it lasts
// (`_mainEffect` empty, no start / reach effects) — the round sandstorm is the ability's cast-target effect
// mousek_skill_02_range, played on its target as the cast starts — and its `_effectsWhenHit` mousek_attack_01_hit plays on
// every unit each period hits, for its whole 15 s. Before, the sim's 'zone' came as one more fx of the cast (Battle.fx names the
// cast's ability and caster): the enemy-skill path owned it (no stand-in) but drew the hit effect only within 3 s of the
// strike — four of the fifteen. The events come from the real kit
// (server/sim/content/enemies/leaders.js kitLeaderMisc); the render runs on a sample binding (the extracted one is compared
// at the end).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const MODES = new URL('../../public/assets/local/fx/enemy-modes.json', import.meta.url);
const MOUSEK = 'enemy_1509_mousek', RANGE = 'mousek_skill_02_range', HIT = 'mousek_attack_01_hit', START = 'mousek_skill_02_start';
// the part of the extracted binding these cases read (enemy-modes.json skills.sandstorm)
const SANDSTORM = { cast: [START], opt: {}, hit: [], castTgt: [RANGE], castTgtOpt: { [RANGE]: { s: 2, e: 3, o: 1 } }, proj: { key: 'projectile_mousek_s2', mount: 2, hit: [HIT] }, anim: 'Skill_2' };
const NAMES = [RANGE, HIT, START];
const wall = (id, maxHp) => chessRec({ id, profession: 'TANK', stats: { atk: 0, maxHp, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });

// (the layers of one file share the tables the first one read: every case reads this binding)
async function layer(quality = 'high') {
  const m = { $fx: Object.fromEntries(NAMES.map((n) => [n, ['b', n]])), [MOUSEK]: { modes: [{ name: 'Default', anim: ['Attack'] }], skills: { sandstorm: SANDSTORM } } };
  const files = { '/assets/local/fx/index.json': { bundles: { b: NAMES } }, '/assets/local/fx/enemy-modes.json': m };
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  const seen = [];
  const L = createFxLayer({ host: null, above: null, quality: () => quality, dry: true, enemyDef: () => null, trace: (p) => seen.push(p) });
  await new Promise((r) => setTimeout(r, 10));
  return { L, seen };
}

/** The real kit on a field of two walls (the lower max HP one is 【沙狱】's): its events, each with the battle time it came at. */
function battle() {
  const walls = [{ id: 't_hi', at: [12, 9], maxHp: 2e7 }, { id: 't_lo', at: [10, 6], maxHp: 5e6 }];
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600, enemies: [], captureNoisy: true,
    defs: { chess: Object.fromEntries(walls.map((w) => [w.id, wall(w.id, w.maxHp)])) }, kits: Object.fromEntries(walls.map((w) => [w.id, () => ({ trait: { noAttack: true } })])),
    units: walls.map((w, i) => ({ chessId: w.id, row: w.at[0], col: w.at[1], uid: i + 1 })),
  });
  h.step();
  const e = h.spawn(MOUSEK, { pos: [9, 9], routeIndex: 0, mods: { speedMul: 0 }, tag: null });
  const ab = e.mem.ab;
  ab.list.find((a) => a && a.cd === ab.sk.SandStorm.cd && a.fire).left = 2;   // (its initial cooldown is 60 s)
  const out = [];
  let seen = h.events.length, zoneAt = null;
  while (h.b.time < 60 && (zoneAt == null || h.b.time < zoneAt + 16)) {
    h.step();
    for (const ev of h.events.slice(seen)) {
      out.push({ t: h.b.time, ev });
      if (zoneAt == null && ev[0] === 'fx' && ev[1] === 'zone' && ev[4]?.kind === 'sandStorm') zoneAt = h.b.time;
    }
    seen = h.events.length;
  }
  return { h, e, out, zoneAt, lo: h.unit('t_lo'), hi: h.unit('t_hi') };
}
const viewOf = (u) => ({ id: u.id, x: u.x, y: u.y, alive: true, isEnemy: u.side === 'enemy', form: null, flags: 0, statuses: new Set(), statusFrom: new Map(),
  info: { id: u.id, side: u.side === 'enemy' ? 'enemy' : 'ally', defId: u.defId ?? 'char_x', form: null } });

/** Plays the events into the layer on the battle's clock; the spawned effect names on each unit, and the zone's own fx. */
function replay(L, seen, run, { keepEnemy = true } = {}) {
  const vs = new Map([[run.e.id, viewOf(run.e)], ...run.h.allies().map((u) => [u.id, viewOf(u)])]);
  if (!keepEnemy) vs.delete(run.e.id);
  let t = run.out[0]?.t ?? 0;
  const hits = [], zones = [];
  for (const { t: at, ev } of run.out) {
    if (at > t) { L.update(at - t, { dist: 20 }, { width: 100, height: 100 }); t = at; }
    L.onEvent(ev, vs);
    if (ev[0] === 'fx' && ev[1] === 'zone' && ev[4]?.kind === 'sandStorm') zones.push(ev);
    for (const p of seen.splice(0)) if (p.kind === 'spawn') hits.push({ t: at, names: p.names.join('+'), on: p.on ?? null });
  }
  return { hits, zones };
}

test('鼠王 【沙狱】: the cast-target sandstorm, no procedural zone on top, and the hit effect on each unit through the 15 s', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { L, seen } = await layer();
    const run = battle();
    assert.ok(run.zoneAt != null, 'the sim casts 沙狱');
    const { hits, zones } = replay(L, seen, run);
    const z = zones[0];
    assert.ok(z[4].ability === 'SandStorm' && z[4].caster == null, 'the zone is its projectile\'s area (the kit names Skills/SandStorm itself: fxgame.js eprojAreaFx), not one more fx of the cast');
    assert.equal(L.ownsFx(z), true, 'no procedural zone circle: projectile_mousek_s2 draws nothing of its own (sim.md 「래트킹·\'즈자이\'의 투사체」)');
    const range = hits.filter((x) => x.names === RANGE);
    assert.ok(range.length >= 1 && range.every((x) => x.on === run.lo.id), `the round sandstorm on its target as the cast starts (${JSON.stringify(range)})`);
    const late = hits.filter((x) => x.names === HIT && x.on === run.lo.id && x.t > run.zoneAt + 4);
    assert.ok(late.length >= 8, `the projectile's hit effect each period after the cast's 3 s, not only within them (${late.length})`);
    assert.equal(zones.length, 1, 'one 沙狱 in the run (its cooldown is 25 s)');
    assert.ok(!hits.some((x) => x.names === HIT && x.on === run.lo.id && x.t > run.zoneAt + 15.5), 'none past the zone\'s 15 s');
    assert.ok(!hits.some((x) => x.names === HIT && x.on === run.hi.id && x.t > run.zoneAt + 4), 'not on the unit outside the box');
  } finally { globalThis.fetch = fetch0; }
});

test('鼠王 【沙狱】 at quality low, or without 鼠王\'s view: the procedural zone stays', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const run = battle();
    {
      const { L, seen } = await layer('low');
      const { zones } = replay(L, seen, run);
      assert.ok(zones.length > 0, 'the sim casts 沙狱');
      assert.equal(L.ownsFx(zones[0]), false, 'no official effects at low: the stand-in zone');
    }
    {
      const { L, seen } = await layer();
      const { zones } = replay(L, seen, run, { keepEnemy: false });
      assert.equal(L.ownsFx(zones[0]), false, 'no binding to read');
    }
  } finally { globalThis.fetch = fetch0; }
});

test('the extracted binding: 沙狱\'s cast-target effect and its projectile\'s hit', { skip: !existsSync(MODES) && 'no extracted enemy effects' }, () => {
  const m = JSON.parse(readFileSync(MODES, 'utf8'));
  const s = m[MOUSEK]?.skills?.sandstorm;
  assert.deepEqual(s?.castTgt, SANDSTORM.castTgt, `${MOUSEK} skills.sandstorm.castTgt (tools/local-extract/enemy_bindings.py emit_part)`);
  assert.deepEqual(s?.proj?.hit, SANDSTORM.proj.hit);
  assert.ok(!s?.proj?.reached && !s?.proj?.start && !s?.proj?.targetStart, 'projectile_mousek_s2 has no effect of its own while it lasts');
  for (const n of NAMES) assert.ok(m.$fx[n], `${n} extracted`);
});
