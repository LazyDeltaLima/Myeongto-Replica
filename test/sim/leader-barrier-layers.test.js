// test/sim/leader-barrier-layers.test.js — 2026-10-21 (docs/rules/sim.md 「리더 방벽 층 셋」, maintainer decision 2026-10-21):
// the client builds the barriers of 鼠王 (mousek_shield[a/b/c]), “自在” 破桎而出 (enemy_xi_s2[shield][a/b/c]) and 泥岩
// (enemy_mdrock_s_2[shield_a/b/c]) from three shield buffs, each a copy of the blackboard with the whole `dynamic`
// (Buff.Reset), spent in the order they were added with the overflow going on — so the barrier is 3 × dynamic (PRTS 鼠王
// 14001, “自在” 7500 / 9000, 泥岩 16500). Each layer is a status naming its client buff and ends when that layer is spent.
// Through the real match path (buildBattleSpec → createBattleFromSpec).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const E = JSON.parse(fs.readFileSync(new URL('../../data/enemies.json', import.meta.url), 'utf8'));
const skb = (key, p) => E[key].skills.find((s) => s.prefabKey === p);

async function fieldWith(enemyKey, seed = 11) {
  const { makeMatch, give } = await import('../match/harness.js');
  const { buildBattleSpec, createBattleFromSpec } = await import('../../server/sim/spec.js');
  const mh = makeMatch({ mode: 'solo', difficulty: 'NORMAL', humans: 1, seed }).start();
  mh.toPrep(3);
  const m = mh.m, ps = mh.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  give(m, ps, 'chess_char_1_03_a', 'board', [10, 5]);
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'bl', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent, timeLimit: 120,
    spawns: [{ time: 0, enemyKey, routeIndex: 0, count: 1, interval: 0, pos: [10, 7], mods: { speedMul: 0 } }] });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  const events = [];
  const ev = b._ev.bind(b);
  b._ev = (t) => { events.push(t); return ev(t); };
  b.start();
  let e = null;
  for (let i = 0; i < 400 && !e; i++) { b.step(); e = b.enemyUnits?.find?.((x) => x.defId === enemyKey) ?? b.enemies?.find?.((x) => x.defId === enemyKey); }
  assert.ok(e, 'on the field');
  const u = b.allyUnits.find((x) => x.kind === 'op');
  // it neither dies nor attacks: only the test's hits reach the barrier
  b.addBuff(u, { key: 'test:tough', duration: Infinity, flags: { invulnerable: true, disarm: true, silence: true } });
  return { m, b, e, events };
}
const barrierOf = (e) => e.mem.ab.list.find((a) => a && Array.isArray(a.layers));
const statusOn = (events, id, key) => events.find((x) => x[0] === 'status' && x[1] === id && x[2] === key && x[3] === 1)?.[5]?.fx ?? null;
const statusOff = (events, id, key) => events.some((x) => x[0] === 'status' && x[1] === id && x[2] === key && x[3] === 0);
const artsFor = (e, final) => final / (1 - e.s.res / 100);

test('鼠王 through the real match path: three layers of the whole shield.dynamic, spent a → b → c, DEF bonus to the last', async () => {
  const { m, b, e, events } = await fieldWith('enemy_1509_mousek');
  const dyn = E.enemy_1509_mousek.talents.bb['shield.dynamic'];
  const bar = barrierOf(e);
  assert.deepEqual(bar.layers, [dyn, dyn, dyn]);
  assert.equal(bar.left, 3 * dyn, 'PRTS 「可吸收14001法术伤害的屏障」');
  assert.deepEqual([1, 2, 3].map((i) => statusOn(events, e.id, `ab:sandDef[${i}]`)), ['buff:mousek_shield[a]', 'buff:mousek_shield[b]', 'buff:mousek_shield[c]']);
  const def = e.s.def;
  // one hit past the first layer: its overflow goes into the second
  assert.equal(b.dealDamage(null, e, { amount: artsFor(e, dyn + 100), type: 'arts' }), 0, 'absorbed whole');
  assert.ok(Math.abs(bar.layers[0]) < 1e-6 && Math.abs(bar.layers[1] - (dyn - 100)) < 1e-6 && bar.layers[2] === dyn, `layers ${bar.layers}`);
  assert.ok(statusOff(events, e.id, 'ab:sandDef[1]') && !e.findBuff('ab:sandDef[1]'), 'layer a ends');
  assert.ok(e.findBuff('ab:sandDef[2]') && e.findBuff('ab:sandDef[3]'));
  assert.equal(e.s.def, def, 'DEF bonus while layers hold');
  const hp = e.hp;
  const dealt = b.dealDamage(null, e, { amount: artsFor(e, 2 * dyn - 100 + 50), type: 'arts' });
  assert.ok(Math.abs(dealt - 50) < 1e-6, `overflow past the last layer ${dealt}`);
  assert.ok(e.hp < hp && !e.findBuff('ab:sandDef[2]') && !e.findBuff('ab:sandDef[3]'), 'all layers spent');
  assert.ok(e.s.def < def, 'DEF bonus gone with the last layer');
  // 2026-10-23: the last layer's end (template mousek_shield_end) switches it to its prefab mode NoShield: the break carries
  // the form (render/fxgame.js FORM_MODES — that mode's mousek_t[effect])
  const brk = events.find((x) => x[0] === 'fx' && x[1] === 'shieldBreak' && x[4]?.id === e.id);
  assert.equal(brk?.[4]?.form, 'noShield');
  assert.equal(e.form, 'noShield');
  assert.deepEqual(b.errors.map((x) => x.error?.message), []);
  m.dispose?.();
});

test('“自在” 破桎而出 through the real match path: three layers of the whole dynamic (phys / arts only); the burst unless the last breaks', async () => {
  const sb = skb('enemy_1517_xi', 'ShieldBurst');
  const run = async (breakTo) => {
    const { m, b, e, events } = await fieldWith('enemy_1517_xi');
    e.profile.noAttack = true;
    while (b.time < sb.initCooldown + 1 && !e.findBuff('ab:xiShield[a]')) b.step();
    assert.ok(e.findBuff('ab:xiShield[a]'), 'cast');
    assert.equal(e.s.shield, 3 * sb.bb.dynamic, 'PRTS 「可吸收7500物理/法术伤害的屏障」');
    assert.deepEqual(['a', 'b', 'c'].map((l) => statusOn(events, e.id, `ab:xiShield[${l}]`)), ['a', 'b', 'c'].map((l) => `buff:enemy_xi_s2[shield][${l}]`));
    const hp = e.hp;
    b.dealDamage(null, e, { amount: 300, type: 'true' });
    assert.equal(e.hp, hp - 300, 'true damage passes');
    b.dealDamage(null, e, { amount: artsFor(e, breakTo), type: 'arts' });
    const left = ['a', 'b', 'c'].map((l) => !!e.findBuff(`ab:xiShield[${l}]`));
    const t0 = b.time;
    const n0 = events.filter((x) => x[0] === 'fx' && x[1] === 'explode' && x[4]?.kind === 'breakFree').length;
    while (b.time < t0 + sb.bb.duration + 1) b.step();
    const bursts = events.filter((x) => x[0] === 'fx' && x[1] === 'explode' && x[4]?.kind === 'breakFree').length - n0;
    assert.deepEqual(b.errors.map((x) => x.error?.message), []);
    m.dispose?.();
    return { left, bursts };
  };
  const two = await run(2 * sb.bb.dynamic + 10);
  assert.deepEqual(two.left, [false, false, true], 'a and b broken, c holds');
  assert.equal(two.bursts, 1, 'the last layer held ⇒ burst');
  const all = await run(3 * sb.bb.dynamic + 10);
  assert.deepEqual(all.left, [false, false, false]);
  assert.equal(all.bursts, 0, 'the last layer broken ⇒ no burst');
});

test('泥岩 through the real match path: three layers of the whole dynamic; 刷新屏障 restores all three', async () => {
  const { m, b, e, events } = await fieldWith('enemy_1511_mdrock');
  const s = skb('enemy_1511_mdrock', 'RefreshShield');
  const dyn = s.bb.dynamic;
  const bar = barrierOf(e);
  assert.equal(bar.left, 3 * dyn, 'PRTS 「可吸收16500法术伤害的屏障」');
  assert.deepEqual([1, 2, 3].map((i) => statusOn(events, e.id, `ab:rockPower[${i}]`)),
    ['buff:enemy_mdrock_s_2[shield_a]', 'buff:enemy_mdrock_s_2[shield_b]', 'buff:enemy_mdrock_s_2[shield_c]']);
  b.dealDamage(null, e, { amount: artsFor(e, 2 * dyn + 1), type: 'arts' });
  assert.deepEqual([1, 2, 3].map((i) => !!e.findBuff(`ab:rockPower[${i}]`)), [false, false, true]);
  assert.ok(e.findBuff('ab:rockPower'), 'HP / ASPD bonus while the last layer holds');
  while (b.time < s.initCooldown + 1 && bar.left < 3 * dyn) b.step();
  assert.equal(bar.left, 3 * dyn, 'refreshed');
  assert.deepEqual([1, 2, 3].map((i) => !!e.findBuff(`ab:rockPower[${i}]`)), [true, true, true]);
  assert.deepEqual(b.errors.map((x) => x.error?.message), []);
  m.dispose?.();
});

// 2026-10-23 (docs/rules/fx.md 「적 상태의 버프 이펙트」): each layer's ON_TAKE_DAMAGE BlockDamage names its block effect
// (`_specifyBlockEffect`) and only a hit it takes whole is cancelled with it; the last layer's graph plays a break effect
// once its `dynamic` is 0 — fx 'parry' { id, buff, whole, broke } for those moments (render/fxgame.js parryFx)
const parries = (events, id) => events.filter((x) => x[0] === 'fx' && x[1] === 'parry' && x[4]?.id === id).map((x) => [x[4].buff, x[4].whole, x[4].broke]);

test('“自在”\'s barrier layers announce a whole-hit block and a break (fx parry)', async () => {
  const sb = skb('enemy_1517_xi', 'ShieldBurst');
  const { m, b, e, events } = await fieldWith('enemy_1517_xi');
  e.profile.noAttack = true;
  while (b.time < sb.initCooldown + 1 && !e.findBuff('ab:xiShield[a]')) b.step();
  const dyn = sb.bb.dynamic;
  b.dealDamage(null, e, { amount: artsFor(e, 100), type: 'arts' });
  assert.deepEqual(parries(events, e.id), [['ab:xiShield[a]', 1, 0]], 'taken whole by the first layer');
  events.length = 0;
  b.dealDamage(null, e, { amount: artsFor(e, dyn), type: 'arts' });
  assert.deepEqual(parries(events, e.id), [['ab:xiShield[a]', 0, 1], ['ab:xiShield[b]', 1, 0]], 'a drained, b takes the rest whole');
  events.length = 0;
  b.dealDamage(null, e, { amount: artsFor(e, 2 * dyn), type: 'arts' });
  assert.deepEqual(parries(events, e.id), [['ab:xiShield[b]', 0, 1], ['ab:xiShield[c]', 0, 1]], 'b and the last drained, the overflow lands');
  assert.deepEqual(b.errors.map((x) => x.error?.message), []);
  m.dispose?.();
});

test('the enemy 泥岩\'s layers too; 鼠王\'s name no block effect and send none', async () => {
  const { m, b, e, events } = await fieldWith('enemy_1511_mdrock');
  const dyn = skb('enemy_1511_mdrock', 'RefreshShield').bb.dynamic;
  b.dealDamage(null, e, { amount: artsFor(e, dyn + 10), type: 'arts' });
  assert.deepEqual(parries(events, e.id), [['ab:rockPower[1]', 0, 1], ['ab:rockPower[2]', 1, 0]]);
  events.length = 0;
  b.dealDamage(null, e, { amount: artsFor(e, 2 * dyn), type: 'arts' });
  assert.deepEqual(parries(events, e.id), [['ab:rockPower[2]', 0, 1], ['ab:rockPower[3]', 0, 1]]);
  assert.ok(events.some((x) => x[0] === 'fx' && x[1] === 'shieldBreak' && x[4]?.id === e.id), 'its own break event follows');
  m.dispose?.();
  const k = await fieldWith('enemy_1509_mousek');
  k.b.dealDamage(null, k.e, { amount: artsFor(k.e, 100), type: 'arts' });
  assert.deepEqual(parries(k.events, k.e.id), []);
  k.m.dispose?.();
});
