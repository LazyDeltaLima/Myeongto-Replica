// test/skill-begin.test.js — a 'state' cast's begin clip (data `cast.begin`, server/sim/skills.js beginTime / _beginCast /
// _tickBegin; docs/rules/sim.md 「스킬 시작 클립」): the client's `BasicSkill.PlayBeginAnimation` waits the clip out in the Skill
// state before `DoStartSkill` — whose `BasicSkill.Cast` spends the SP (`CastSkill.DoCast` → `ReduceSp`) —, and a stun meanwhile
// loses the cast and keeps the SP.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACT3, field, done, cast } from './helpers/seasonPieces.js';
import { TICK } from '../server/sim/constants.js';

const AURORA = 'chess_char_3_07_a';
const S1 = 'skchr_aurora_1';
const manifest = JSON.parse(readFileSync(new URL('../data/assets.json', import.meta.url), 'utf8'));
const castRows = JSON.parse(readFileSync(new URL('../tools/assets/local-skill-cast.json', import.meta.url), 'utf8')).skills;
const attacks = (h, e) => h.hooksOf('damaged').filter((c) => c.target === e && c.dmg?.isAttack);
function block(h, u, e) { e.blockedBy = u; u.blocking.push(e); h.step(); }

test('data: a state cast with a prefab begin clip carries its length; a free cast none', () => {
  let n = 0;
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (typeof o.skillId === 'string' && o.cast?.begin) {
      n++;
      assert.equal(o.cast.mode, 'state', `${o.skillId}: only a state cast waits`);
      assert.ok(castRows[o.prefabId ?? o.skillId]?.begin, `${o.skillId}: from the prefab row`);
    }
    for (const v of Object.values(o)) walk(v);
  };
  for (const f of ['../data/chess.json', '../data/backups.json', '../data/seasons/act3autochess/chess.json']) walk(JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8')));
  assert.ok(n > 100, `begin clips in the data: ${n}`);
  assert.equal(castRows.skchr_highmo_2.begin, undefined, 'a `_switchToState` 0 cast starts at once (海沫 S2)');
  assert.equal(castRows.skchr_aurora_1.begin, 'Skill_Begin');
  assert.equal(ACT3.chess[AURORA].skills.find((s) => s.skillId === S1).cast.begin, manifest.chars.char_422_aurora.spine.front.animations.Skill_Begin);
});

test('begin clip: the swing in progress is cut, no attack and no skill until it has played, then the skill and its time', () => {
  const { h, u } = field(AURORA, { skill: 0 });
  const rec = ACT3.chess[AURORA].skills.find((s) => s.skillId === S1);
  const begin = Math.round(rec.cast.begin / TICK) * TICK;
  const e = h.spawn('enemy_dummy', { pos: [10, 5] });
  block(h, u, e);
  h.runUntil(() => !!u.swing, 5);
  assert.ok(u.swing, 'a swing under way');
  const def = u.s.def, n0 = attacks(h, e).length;
  cast(u);
  assert.equal(u.swing, null, 'the cast cuts it');
  assert.ok(!u.skill.active && u.skill._begin, 'the begin clip plays: the skill has not started');
  const full = u.skill.spCost;
  assert.ok(u.skill.sp >= full && u.skill.ready, 'the SP stays until the skill starts (CastSkill.DoCast spends it)');
  const t0 = h.b.time;
  h.runUntil(() => u.skill.active, 3);
  assert.equal(u.skill.sp, 0, 'spent as the skill starts');
  assert.ok(Math.abs(h.b.time - t0 - begin) < TICK + 1e-9, `the skill starts as the clip ends: ${h.b.time - t0} vs ${begin}`);
  assert.equal(attacks(h, e).length, n0, 'no attack during it');
  assert.ok(u.s.def > def, 'its mods from then');
  const t1 = h.b.time;
  h.runUntil(() => !u.skill.active, rec.duration + 2);
  assert.ok(Math.abs(h.b.time - t1 - rec.duration) < 2 * TICK, `its whole time after the clip: ${h.b.time - t1}`);
  done(h);
});

test('begin clip: a stun meanwhile loses the cast — no skill, no end effect, the SP kept, the view told', () => {
  const { h, u } = field(AURORA, { skill: 0 });
  const e = h.spawn('enemy_dummy', { pos: [10, 5] });
  block(h, u, e);
  const def = u.s.def;
  cast(u);
  h.step();
  h.eventsOf('skill');
  h.b.applyStatus(u, 'stun', { duration: 0.2, source: e });
  h.run(1.5);
  assert.ok(!u.skill.active && !u.skill._begin, 'no skill');
  assert.equal(u.s.def, def, 'no mods');
  assert.ok(!u.findBuff('stun'), 'no self-stun of its end (S1 onEnd did not run)');
  assert.ok(u.skill.sp >= u.skill.spCost && u.skill.charges === u.skill.maxCharges, 'the SP is kept: the cast never reached DoCast');
  assert.ok(h.eventsOf('skill').some((ev) => ev[1] === u.id && ev[2] === 0), 'the skill off event');
  done(h);
});
