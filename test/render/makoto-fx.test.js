// test/render/makoto-fx.test.js — 结城理 (char_4217_makoto, 自选): the effects of his personas (docs/rules/fx.md 「유키 마코토
// 페르소나」). The CN charpack's modes (char_modes.py: Stand_S1's HealAlly_Lt50Per / MagicAttack as per-side children through
// their `_abilityConfigs` triggers), the mode his form holds (fxmap.js FORM_HELD_MODES), the switch's own one-shots
// (DOLL_SWITCH_FX: the makoto[switch*] sequences' buffs) and the buff-template moments his kit names (kitofficial.js hit /
// kitHit) — and that his real kit sends those moments.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORM_HELD_MODES, DOLL_SWITCH_FX, heldMode, modePart } from '../../public/js/render/fxmap.js';
import { kitOfficialPlan } from '../../public/js/render/fx/kitofficial.js';
import { fxSpec } from '../../public/js/render/fx/kinds.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { DOLL_SWITCH } from '../../server/sim/professions.js';
import { S3_CHANGE } from '../../server/sim/content/kits/ops/op-makoto.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const C = 'char_4217_makoto';
const MODES = read('tools/assets/local-char-modes.json')[C];
const CLIPS = read('data/assets.json').chars[C].spine.front.animations;
const names = (plan) => plan?.play.map((p) => `${p.n}@${p.on}`) ?? null;

test('char_modes.py: Stand_S1\'s heal and attack are per-side children (their configs\' triggers), out of the mode\'s lists', { skip: !MODES && 'no extracted modes' }, () => {
  const i = MODES.modes.indexOf('Stand_S1');
  assert.deepEqual(MODES.sideFx[i], {
    ally: { cast: ['makoto_skill_01_start_01'], trail: [], hit: ['makoto_skill_01_heal_01'] },
    foe: { cast: ['makoto_skill_01_start_02'], trail: ['makoto_skill_01_trail_01'], hit: ['makoto_skill_01_hit_01'] },
  }, 'HealAlly_Lt50Per (AdvancedSelectorWithinHpRatio _targetSide 1) / MagicAttack (_targetSide 2)');
  assert.deepEqual([MODES.cast[i], MODES.hit[i], MODES.trail[i]], [[], [], []]);
  const pre = Object.values(MODES.sideFx[i]).flatMap((s) => [...s.cast, ...s.trail, ...s.hit]);
  assert.deepEqual(modePart(MODES, pre, i, 'HealAlly_Lt50Per', true).hit, ['makoto_skill_01_heal_01'], 'a heal swing (the kit\'s signal) on an ally');
  assert.deepEqual(modePart(MODES, pre, i, null, false).cast, ['makoto_skill_01_start_02'], 'an attack on an enemy');
});

test('FORM_HELD_MODES: the <替身> fights in the picked skill\'s persona mode, S3\'s form orpheus in Stand_S3_2; the <本体> in none', () => {
  const bind = { modes: ['Default', 'Stand_S1', 'Stand_S2', 'Stand_S3_1', 'Stand_S3_2', 'Switch2Normal'] };
  if (MODES) assert.deepEqual(MODES.modes, bind.modes, 'the charpack\'s _modes order');
  assert.deepEqual([0, 1, 2].map((s) => heldMode(bind, C, s, 'doll')), [1, 2, 3]);
  assert.equal(heldMode(bind, C, 2, 'orpheus'), 4);
  for (const s of [0, 1, 2]) assert.equal(heldMode(bind, C, s, null), -1, 'the <本体>: no held mode');
  assert.ok(FORM_HELD_MODES[C]);
});

test('DOLL_SWITCH_FX: the switch\'s own effects at their time in it (the clips\' lengths), the mode switching 0.99 s into SwitchEnd', () => {
  const t = DOLL_SWITCH_FX[C];
  assert.deepEqual(t.src, ['makoto_change_01_effect', 'makoto_allout_attack_effect', 'makoto_switchend2normal_talent_2_effect']);
  assert.equal(t.substitute.fx[0].at, CLIPS.SwitchOut, 'SwitchEnd starts after the <本体>\'s SwitchOut');
  assert.equal(t.persona.fx[0].at, CLIPS.Doll_Skill_3_P1toP2_ChangeBegin, '… after S3\'s ChangeBegin');
  assert.ok(Math.abs(t.substitute.mode - (CLIPS.SwitchOut + 0.99)) < 1e-9 && t.substitute.mode < DOLL_SWITCH);
  assert.ok(Math.abs(t.persona.mode - (CLIPS.Doll_Skill_3_P1toP2_ChangeBegin + 0.99)) < 1e-9 && t.persona.mode < S3_CHANGE);
  assert.deepEqual(t.swap.fx.map((p) => `${p.n}@${p.at}`), ['makoto_talent_finish_01@0', 'makoto_change_01@0.3', 'makoto_talent_chance_01@0.3']);
  assert.equal(fxSpec('persona', {}).a, 'none', 'nothing procedural for the persona change');
});

test('kitofficial.js: the moments of his kit play the buff templates\' effects', () => {
  assert.deepEqual(names(kitOfficialPlan('hit', { k: 'makoto_s2_fear_damage' }, 'makoto')), ['makoto_skill_02_hit_01@id']);
  assert.deepEqual(names(kitOfficialPlan('hit', { k: 'makoto_s2_fear_aura_inst_kill' }, 'makoto')), ['makoto_skill_02_hit_01_finish@id']);
  assert.deepEqual(names(kitOfficialPlan('hit', { k: 'makoto_s3_1_standin[phys]' }, 'makoto')), ['makoto_skill_03_p1_weak_01@id', 'makoto_skill_03_p1_hit_02@id']);
  assert.deepEqual(names(kitOfficialPlan('hit', { k: 'makoto_s3_1_standin[arts]' }, 'makoto')), ['makoto_skill_03_p1_weak_01@id', 'makoto_skill_03_p1_hit_01@id']);
  assert.deepEqual(names(kitOfficialPlan('kitHit', { k: 'makoto:heal' }, 'makoto')), ['makoto_skill_03_p2_heal_01@tgt']);
});

const LOCAL = existsSync(path.join(ROOT, 'public/assets/local/fx/index.json'));
test('the prefabs named are extracted in his bundle', { skip: !LOCAL && 'no extracted effects' }, () => {
  const pre = new Set(read('public/assets/local/fx/index.json').bundles.makoto);
  const all = [...Object.values(DOLL_SWITCH_FX[C]).flatMap((x) => x.fx.map((p) => p.n)),
    'makoto_skill_02_hit_01', 'makoto_skill_02_hit_01_finish', 'makoto_skill_03_p1_weak_01', 'makoto_skill_03_p1_hit_01',
    'makoto_skill_03_p1_hit_02', 'makoto_skill_03_p2_heal_01'];
  for (const n of all) assert.ok(pre.has(n), n);
});

// his real kit: the moments on its 'dmg' events (9th field), the heal's kitHit, the persona change's form fx
const enemy = (key, o = {}) => enemyRec({ key, hp: 1e8, atk: 0, speed: 0, ...o });
function field(skill, extra = []) {
  const h = makeBattle({ seed: 7, autoFinish: false, timeLimit: 300, defs: { enemies: { armored: enemy('armored', { def: 3000, res: 0 }), warded: enemy('warded', { def: 0, res: 90 }) } },
    units: [{ uid: 1, diy: { slot: 6, charId: C, skillIndex: skill, uniEquipId: null }, elite: true, potential: 6, row: 10, col: 3, dir: 'RIGHT' }, ...extra] });
  h.step();
  const u = h.unit(1);
  u.skill.sp = u.skill.spCost; u.skill.charges = 1;
  assert.ok(u.skill.activate('test'));
  h.run(DOLL_SWITCH + 0.05);
  return { h, u };
}
const momentsOn = (h, id) => h.eventsOf('dmg').filter((e) => e[1] === id && Array.isArray(e[8])).map((e) => e[8][0][0]);

test('the kit: S2 塔纳托斯\'s hits carry makoto_s2_fear_damage; S3 塔纳托斯\'s the 弱点 type; 俄耳甫斯 sends form orpheus and a kitHit per heal', () => {
  {
    const { h } = field(1);
    const e = h.spawn('armored', { pos: [10, 4] });
    h.run(4);
    assert.ok(momentsOn(h, e.id).length && momentsOn(h, e.id).every((k) => k === 'makoto_s2_fear_damage'));
  }
  const ally = { uid: 2, chessId: 'chess_char_1_02_a', row: 10, col: 4, dir: 'RIGHT' };
  const { h, u } = field(2, [ally]);
  const armored = h.spawn('armored', { pos: [10, 5] }), warded = h.spawn('warded', { pos: [9, 4] });
  h.run(4);
  assert.ok(momentsOn(h, armored.id).includes('makoto_s3_1_standin[arts]'), 'the armoured one: arts');
  assert.ok(momentsOn(h, warded.id).includes('makoto_s3_1_standin[phys]'), 'the warded one: physical');
  h.events.length = 0;
  h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
  const persona = h.eventsOf('fx').filter((e) => e[1] === 'persona');
  assert.equal(persona.length, 1);
  assert.deepEqual([persona[0][4].id, persona[0][4].form, u.form], [u.id, 'orpheus', 'orpheus']);
  const a = h.unit(2);
  a.hp = a.s.maxHp * 0.5;
  h.run(S3_CHANGE + 2);
  const heals = h.eventsOf('fx').filter((e) => e[1] === 'kitHit' && e[4]?.k === 'makoto:heal');
  assert.ok(heals.some((e) => e[4].id === u.id && e[4].tgt === a.id), 'the heal\'s effect on the ally it picks');
});
