// test/sim/hunter-reload.test.js — 猎手 reload (server/sim/professions.js installHunter; docs/rules/sim.md 「사냥꾼 장전」):
// the client's attack group attacks with a target and a round; only otherwise, not full, it casts ReloadAnimatedAbility, whose
// time is the base attack time + `reload_interval`, at attack speed 100, the round coming as that time ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const ID = 'chess_char_3_11_a';   // 스노우헌터
const PERIOD = 1.6;               // her base attack time; her trait has no reload_interval
const dummy = (o = {}) => enemyRec({ key: 'dummy', hp: 1e9, atk: 0, speed: 0, mass: 0, def: 0, res: 0, ...o });
const setup = () => {
  const h = makeBattle({ seed: 5, autoFinish: false, timeLimit: 300, defs: { enemies: { dummy: dummy() } },
    units: [{ uid: 1, chessId: ID, elite: true, row: 10, col: 4 }] });
  h.step();
  const u = h.unit(1);
  u.skill && (u.skill.sp = 0);
  h.runUntil(() => h.b.time >= (u.bornUntil ?? 0), 5);
  return { h, u };
};
/** Battle times at which her round count grows, over `secs`. */
const roundTimes = (h, u, secs) => {
  const out = [];
  let last = u.trait.ammo;
  const end = h.b.time + secs;
  while (h.b.time < end) {
    h.step();
    if (u.trait.ammo > last) out.push(h.b.time);
    last = u.trait.ammo;
  }
  return out;
};

test('with a target and a round: no reload between attacks, one round per attack', () => {
  const { h, u } = setup();
  h.spawn('dummy', { pos: [10, 6] });
  const max = u.profile.ammoMax;
  let forms = 0;
  const end = h.b.time + PERIOD * 5.5;
  while (h.b.time < end) { h.step(); if (u.trait.reloading || u.form === 'reload') forms++; }
  assert.equal(forms, 0, 'she never reloads with a target and a round');
  assert.ok(u.trait.ammo <= max - 5, `${u.trait.ammo} left of ${max}`);
});

test('no target: a round each base attack time, at the end of each cast; attack speed does not change it', () => {
  for (const aspd of [0, 100]) {
    const { h, u } = setup();
    u.trait.ammo = 2;
    if (aspd) { h.b.addBuff(u, { key: 'test:aspd', mods: { aspd }, persist: true }); u._recalc(); }
    const t0 = h.b.time;
    const times = roundTimes(h, u, PERIOD * 3.5);
    assert.equal(times.length, 3, `aspd +${aspd}: ${times}`);
    assert.ok(Math.abs(times[0] - t0 - PERIOD) < 0.1, `first round ${times[0] - t0}`);
    assert.ok(Math.abs(times[1] - times[0] - PERIOD) < 0.05, `period ${times[1] - times[0]}`);
  }
});

test('out of rounds with a target: a round, then her attack spends it, then the next reload', () => {
  const { h, u } = setup();
  h.spawn('dummy', { pos: [10, 6] });
  u.trait.ammo = 0;
  u.atkCd = 0;
  const t0 = h.b.time;
  let spent = 0, last = 0;
  while (h.b.time < t0 + PERIOD * 6) {
    h.step();
    if (u.trait.ammo < last) spent++;
    last = u.trait.ammo;
    assert.ok(u.trait.ammo <= 1, 'never more than the one round');
  }
  // reload + attack cooldown: an attack every two periods, half her rate with rounds
  assert.ok(spent >= 2 && spent <= 3, `${spent} attacks in six periods`);
});

test('a target found during a cast is attacked after the round', () => {
  const { h, u } = setup();
  u.trait.ammo = 3;
  h.step();
  assert.ok(u.trait.reloading, 'casting');
  h.spawn('dummy', { pos: [10, 6] });
  const shot = (() => { let a = u.trait.ammo; return () => { const less = u.trait.ammo < a; a = u.trait.ammo; return less; }; })();
  let t = null;
  const t0 = h.b.time;
  while (t == null && h.b.time < t0 + 5) { h.step(); assert.ok(!(u.trait.reloadCd > 0 && u.swing), 'no swing during the cast'); if (shot()) t = h.b.time; }
  assert.ok(t != null, 'she attacks');
  assert.ok(t - t0 >= PERIOD - 0.1, `attack ${t - t0} s later: the cast finished first`);
  assert.equal(u.trait.ammo, 3, 'the round came, the shot spent it');
});

test('a stun cuts the cast: its round is lost, its cooldown runs on', () => {
  const { h, u } = setup();
  u.trait.ammo = 3;
  h.step();
  assert.ok(u.trait.reloading, 'casting');
  h.b.applyStatus(u, 'stun', { duration: 0.3, source: null });
  const times = roundTimes(h, u, PERIOD - 0.1);
  assert.deepEqual(times, [], 'no round from the cut cast');
  assert.equal(u.trait.ammo, 3);
  const later = roundTimes(h, u, PERIOD + 0.2);
  assert.equal(later.length, 1, 'the next cast starts once the cooldown is over and loads one');
});
