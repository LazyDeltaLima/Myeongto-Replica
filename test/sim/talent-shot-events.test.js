// test/sim/talent-shot-events.test.js — what the kits tell the renderer about the projectiles of talents and skill ends
// (docs/rules/fx.md 「다른 필드 투사체 — 재능 화살·동전·되돌아오는 영哨·작살」, 2026-10-21): 寒芒克洛丝's 中的 outside her
// skills is the Default mode's talent ability, chosen as the swing starts — the 'swing' event's 9th field and its 'atk'
// events carry 'T.1', and exactly those arrows crit (×1.5 + stun; in her skill modes the roll stays at the hit);
// 琳琅诗怀雅 S3's coins name their targets; 伊内丝 S3's recalled sentry names the enemies it struck on its way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { getDefaultSource, hasGeneratedData } from '../../server/sim/simdata.js';

const REAL = { skip: !hasGeneratedData() };
const ds = getDefaultSource();
const dummy = (o = {}) => enemyRec({ key: 'enemy_dummy', hp: 1e9, speed: 0, atk: 0, def: 0, res: 0, mass: 1, ...o });

test('寒芒克洛丝 中的 outside her skills: the swing chooses it — T.1 on the swing and its arrow, and only those crit', REAL, () => {
  const id = 'chess_char_4_06_a', t0 = ds.getChess(id).talents[0].bb;
  const h = makeBattle({
    defs: { enemies: { enemy_dummy: dummy() } }, units: [{ chessId: id, row: 10, col: 3 }], enemies: [{ key: 'enemy_dummy', pos: [10, 5] }],
    timeLimit: 200, autoFinish: false, hooks: ['damaged', 'skillStart'], captureNoisy: true, seed: 7,
  });
  h.step();
  const u = h.unit(id);
  u.skill.sp = -1e9;   // no skill: her Default mode only
  h.run(40);
  const swings = h.eventsOf('swing').filter((e) => e[1] === u.id);
  const tal = swings.filter((e) => e[8] === 'T.1');
  assert.ok(tal.length >= 3 && tal.length < swings.length, `some swings are the talent's (${tal.length} / ${swings.length})`);
  for (const e of tal) assert.equal(e.length, 9, 'the fields before the signal are filled');
  assert.ok(swings.every((e) => e.length < 9 || e[8] === 'T.1'));
  const atks = h.eventsOf('atk').filter((e) => e[1] === u.id);
  assert.equal(atks.filter((e) => e[4] === 'T.1').length, tal.length, 'each talent swing shoots one T.1 arrow');
  const hits = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg.isAttack);
  const base = Math.min(...hits.map((c) => c.amount));
  for (const c of hits) {
    const crit = c.dmg.signal === 'T.1';
    assert.ok(Math.abs(c.amount / base - (crit ? t0.atk_scale : 1)) < 1e-6, `${crit ? 'a talent arrow' : 'an attack'}: ×${c.amount / base}`);
  }
  assert.equal(h.eventsOf('fx').filter((e) => e[1] === 'crit' && e[4]?.by === u.id).length, hits.filter((c) => c.dmg.signal === 'T.1').length, 'a crit mark per talent arrow');
  assert.equal(h.hooksOf('skillStart').length, 0);
});

test('寒芒克洛丝 in her skill: no talent swing — the roll stays at the hit (kroos2_t_1[critical])', REAL, () => {
  const id = 'chess_char_4_06_a', t0 = ds.getChess(id).talents[0].bb;
  const h = makeBattle({
    defs: { enemies: { enemy_dummy: dummy() } }, units: [{ chessId: id, row: 10, col: 3 }], enemies: [{ key: 'enemy_dummy', pos: [10, 5] }],
    timeLimit: 200, autoFinish: false, hooks: ['damaged'], captureNoisy: true, seed: 3,
  });
  h.step();
  const u = h.unit(id);
  assert.ok(u.skill.activate('test', { free: true }));
  const t1 = h.b.time;
  h.run(Math.min(15, u.skill.timeLeft - 0.5));
  assert.equal(h.eventsOf('swing').filter((e) => e[1] === u.id && e[8] === 'T.1').length, 0);
  const hits = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg.isAttack && c.t > t1);
  const base = Math.min(...hits.map((c) => c.amount));
  assert.ok(hits.some((c) => Math.abs(c.amount / base - t0.atk_scale) < 1e-6), 'crits rolled at the hit');
  assert.ok(hits.every((c) => c.dmg.signal == null));
});

test('琳琅诗怀雅 S3: the coins of the closing name each paid enemy in order', REAL, () => {
  const ID = 'chess_char_3_04_a';
  const h = makeBattle({
    defs: { enemies: { enemy_dummy: dummy() } }, units: [{ chessId: ID, row: 10, col: 5, skillIndex: 2 }],
    enemies: [{ key: 'enemy_dummy', pos: [10, 6] }], autoFinish: false, timeLimit: 30, hooks: ['damaged'], captureNoisy: true,
  });
  h.step();
  const u = h.unit(ID);
  assert.ok(u.skill.active || u.skill.activate('test', { free: true }));
  u.mem.coins = 10;
  h.run(0.3);
  const end = h.eventsOf('fx').find((e) => e[1] === 'coin' && e[4]?.skill === 'swire2_3');
  assert.ok(end, 'the purse paid out');
  const paid = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg.tags.includes('swire2Cash')).map((c) => c.target.id);
  assert.equal(end[4].spent, 10);
  assert.deepEqual(end[4].targets, paid);
});

test('伊内丝 S3: the recalled sentry names the enemies it struck', REAL, () => {
  const h = makeBattle({
    defs: { enemies: { enemy_dummy: dummy() } }, timeLimit: 20, autoFinish: false, seed: 1, captureNoisy: true,
    units: [{ uid: 1, chessId: 'chess_char_4_04_a', row: 10, col: 2, dir: 'RIGHT', skillIndex: 2 }],
    enemies: [{ key: 'enemy_dummy', pos: [10, 4] }, { key: 'enemy_dummy', pos: [12, 8] }],
    hooks: ['damaged'],
    // a later deployment (priority 1000: before her kit's deploy hook casts S3)
    setup: (b) => { b.on('deploy', ({ unit }) => { if (unit.uid === 1) unit.mem.inesS3Placed = true; }, { priority: 1000 }); },
  });
  h.step();
  const u = h.b.allyUnits.find((x) => x.uid === 1);
  // its sentry left 4 tiles ahead: the skill cast again recalls it
  u.mem.sentry = new Set();
  u.mem.inesSentryAt = { x: u.x + 4, y: u.y };
  u.skill.end('test');
  assert.ok(u.skill.activate('test', { free: true }));
  const beam = h.eventsOf('fx').find((e) => e[1] === 'beam');
  assert.ok(beam, 'the recall');
  const struck = h.hooksOf('damaged').filter((c) => c.dmg.tags.includes('sentryRecall')).map((c) => c.target.id);
  assert.equal(struck.length, 1, 'the enemy on its way, not the one off it');
  assert.deepEqual(beam[4].hits, struck);
});
