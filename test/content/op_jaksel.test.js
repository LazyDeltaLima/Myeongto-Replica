// test/content/op_jaksel.test.js — 재키 (char_347_jaksel, a tier-1 piece of 规程 (act3autochess); kit ops/op-jaksel.js): both forms, both skills.
// Run: node --test test/content/op_jaksel.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, realMatch } from '../helpers/seasonPieces.js';
import { enemyRec } from '../helpers/battleHarness.js';
import { S2_BEGIN, STRIKE_AT } from '../../server/sim/content/kits/ops/op-jaksel.js';

const A = 'chess_char_1_12_a', B = 'chess_char_1_12_b';
const FORMS = [A, B];
const skillBb = (id, i) => ACT3.chess[id].skills[i].bb;
const approx = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
/** Every physical hit on her dodged (one more independent source of 1). */
const alwaysDodge = (h, u) => h.b.addBuff(u, { key: 'test:dodge', mods: { dodgePhys: 1 }, persist: true });
/** A biter in front of her (it attacks her every second); a fast one, five times a second — faster than her strike-back. */
const biter = (h) => h.spawn('enemy_biter', { pos: [10, 5] });
const FAST = { enemy_fast: enemyRec({ key: 'enemy_fast', hp: 1e9, speed: 0, atk: 400, range: 1.2, bat: 0.2 }) };
const hitsOn = (h, u, t) => h.hooksOf('damaged').filter((d) => d.source === u && d.target === t);

test('T1 极速闪避 and FGT-X: 物理闪避 prob (the elite\'s trait 15 % an independent second source); a dodge gives ASPD +attack_speed for duration s, refreshed', () => {
  for (const id of FORMS) {
    const t = ACT3.chess[id].talents[0].bb, trait = ACT3.chess[id].trait.bb.prob ?? 0;
    const { h, u } = field(id, { skill: 0, hooks: ['dodge'] });
    approx(u.s.dodgePhys, 1 - (1 - t.prob) * (1 - trait), `${id}: dodge`);
    alwaysDodge(h, u);
    biter(h);
    assert.ok(h.runUntil(() => h.hooksOf('dodge').some((d) => d.target === u), 5), `${id}: a dodge`);
    h.step();
    const b = u.findBuff('charge_atk_speed_on_evade');
    assert.ok(b, `${id}: ASPD up`);
    assert.equal(b.mods.aspd, t['charge_atk_speed_on_evade.attack_speed'], id);
    assert.ok(b.timeLeft <= t['charge_atk_speed_on_evade.duration'] && b.timeLeft > t['charge_atk_speed_on_evade.duration'] - 0.2, `${id}: ${b.timeLeft}`);
    assert.equal(u.buffs.filter((x) => x.key === 'charge_atk_speed_on_evade').length, 1, `${id}: one at a time`);
    assert.equal(u.hp, u.s.maxHp, `${id}: nothing landed`);
    done(h);
  }
});

test('S1 给你一拳！: the next attack at atk_scale, the one after it a normal one', () => {
  for (const id of FORMS) {
    const scale = skillBb(id, 0).atk_scale;
    const { h, u } = field(id, { skill: 0 });
    assert.equal(u.skill.id, 'skchr_jaksel_1');
    const e = h.spawn('enemy_dummy', { pos: [10, 5] });
    u.skill.gainSp(u.skill.spCost, 'test');
    const hp0 = e.hp;
    h.runUntil(() => e.hp < hp0, 10);
    approx(hp0 - e.hp, u.s.atk * scale, `${id}: atk_scale`);
    const hp1 = e.hp;
    h.runUntil(() => e.hp < hp1, 10);
    approx(hp1 - e.hp, u.s.atk, `${id}: then a normal attack`);
    done(h);
  }
});

test('S2 全神贯注！: no attack; 物理闪避 +prob; a dodge strikes back once per attack interval × base_attack_time, attack@atk_scale × ATK', () => {
  for (const id of FORMS) {
    const bb = skillBb(id, 1);
    const { h, u } = field(id, { skill: 1, hooks: ['dodge'], enemies: FAST });
    assert.equal(u.skill.id, 'skchr_jaksel_2');
    const before = u.s.dodgePhys;
    const e = h.spawn('enemy_fast', { pos: [10, 5] });
    cast(u);
    h.step();
    approx(u.s.dodgePhys, 1 - (1 - before) * (1 - bb['jaksel_skill_2[evade].prob']), `${id}: S2 dodge`);
    alwaysDodge(h, u);
    h.run(S2_BEGIN + 6);
    const hits = hitsOn(h, u, e);
    assert.ok(hits.length >= 3, `${id}: strike-backs (${hits.length})`);
    for (const d of hits) approx(d.amount, u.s.atk * bb['attack@atk_scale'], `${id}: each one`);
    const gap = u.s.interval * bb.base_attack_time;
    const at = hits.map((d) => d.t);
    for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= gap - 0.05, `${id}: ${at[i] - at[i - 1]} ≥ ${gap}`);
    // a strike-back lands STRIKE_AT after the dodge that cast it
    const dodges = h.hooksOf('dodge').filter((d) => d.target === u).map((d) => d.t);
    assert.ok(dodges.length > hits.length * 2, `${id}: most dodges strike nothing back (${dodges.length} dodges)`);
    assert.ok(dodges.some((t) => Math.abs(t + STRIKE_AT - at[0]) < 0.05), `${id}: ${at[0]} after a dodge`);
    // her normal attack would have been far more often: none of it
    assert.ok(hits.length <= Math.ceil(6 / gap) + 1, `${id}: only strike-backs (${hits.length})`);
    // each is the StrikeBack ability (Skill_Loop clip): the 'atk' signal
    const atks = h.events.filter((x) => x[0] === 'atk' && x[1] === u.id);
    assert.ok(atks.length >= hits.length && atks.every((x) => x[4] === 'StrikeBack'), `${id}: ${atks.map((x) => x[4])}`);
    done(h);
  }
});

test('S2: without a dodge, no strike-back; after the skill she attacks again', () => {
  const { h, u } = field(B, { skill: 1 });
  const e = h.spawn('enemy_dummy', { pos: [10, 5] });
  cast(u);
  h.run(S2_BEGIN + 3);
  assert.equal(hitsOn(h, u, e).length, 0, 'nobody attacked her');
  u.skill.end('duration');
  const hp = e.hp;
  h.runUntil(() => e.hp < hp, 5);
  approx(hp - e.hp, u.s.atk, 'a normal attack');
  done(h);
});

test('real match path: her piece fights in a 规程 match', async () => {
  for (const id of FORMS) assert.equal((await realMatch(id, 'char_347_jaksel')).skill.id, ACT3.chess[id].skill.skillId);
});
