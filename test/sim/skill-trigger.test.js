// A MANUAL skill's own target trigger (docs/rules/sim.md 「스킬 프리팹의 대상 트리거」): the automatic operations ask the
// official CastSkill.get_canCastCheck besides the trigger rule, and it is false when the skill prefab's `_trigger` finds no
// target. tools/local-extract/skill_cast.py reads every pool `_trigger` (data `cast.trig`), server/sim/skills.js _trigFound
// searches it. The cause this replaces — one kit's hand-written castCheck (歌蕾蒂娅 S3) while every other trigger went
// unread — is gone; the sweep below keeps the selectors the engine does not model listed, each with its reason.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { ALLY_TRIG_SORTS } from '../../server/sim/targeting.js';

const FILES = ['data/chess.json', 'data/backups.json', 'data/seasons/act3autochess/chess.json', 'data/seasons/act3autochess/backups.json'];

// MANUAL skills whose trigger selector _trigFound does not model: they cast by their rule alone (true). Empty since the
// ally selectors (褐果 S1, 莎草 S2, 引星棘刺 S3) and the tile selector (Miss.Christine S2) were read.
const UNMODELLED = {};

function manualTrigs() {
  const out = new Map();
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (typeof o.skillId === 'string' && o.skillType === 'MANUAL' && o.cast?.trig) out.set(o.skillId, o.cast.trig);
    for (const k in o) walk(o[k]);
  };
  for (const f of FILES) walk(JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')));
  return out;
}

const modelled = (t) => t.sel === 'never' || t.sel === 'self' || (t.sel === 'selfIf' && !t.cond)
  || ((t.sel === 'range' || t.sel === 'blocked') && t.side === 2 && !t.filter)
  || (t.sel === 'range' && t.side === 1 && !t.filter && ALLY_TRIG_SORTS.has(t.post));

test('pool MANUAL skills: every prefab target trigger is searched by the engine or listed with its reason', () => {
  const trigs = manualTrigs();
  assert.ok(trigs.get('skchr_glady_3')?.sel === 'range', 'the data lacks 歌蕾蒂娅 S3 `cast.trig` (skill_cast.py trigger_entry → build-data skillTrig)');
  assert.ok(trigs.get('skchr_blkkgt_3')?.sel === 'blocked', 'the data lacks 锏 S3 `cast.trig` sel blocked');
  const missing = [...trigs].filter(([id, t]) => !modelled(t) && !UNMODELLED[id]).map(([id, t]) => `${id} ${JSON.stringify(t)}`);
  assert.deepEqual(missing, [], 'a pool MANUAL skill has a `_trigger` selector server/sim/skills.js _trigFound does not model: '
    + 'model it or list it in UNMODELLED with the reason (docs/rules/sim.md 「스킬 프리팹의 대상 트리거」)');
  const stale = Object.keys(UNMODELLED).filter((id) => !trigs.has(id) || modelled(trigs.get(id)));
  assert.deepEqual(stale, [], 'UNMODELLED lists a skill the data no longer has unmodelled — drop it');
  assert.ok(trigs.size >= 20, `only ${trigs.size} pool MANUAL skills carry a trigger — the sweep ran on too little`);
});

function lane(chessId, dir, enemy = {}) {
  const h = makeBattle({
    seed: 1, timeLimit: 60, autoFinish: false, units: [{ chessId, row: 9, col: 6, dir }], enemies: [],
    defs: { enemies: { tank: enemyRec({ key: 'tank', hp: 1e6, speed: 0.6, ...enemy }) } },
  });
  const u = h.unit(chessId);
  h.step(1);
  u.skill.sp = u.skill.spCost;   // ready from the start
  const e = h.spawn('tank', { pos: [9, 9.5] });   // comes from the right towards (9,6)
  return { h, u, e };
}

test('锏 S3: an enemy she blocks from behind casts it (BlockedOrAdvancedSelector: the blocked enemies count, in range or not)', () => {
  const { h, u, e } = lane('chess_char_6_19_a', 'LEFT');
  assert.ok(u.skill.cast?.trig?.sel === 'blocked', 'skchr_blkkgt_3 carries its blocked-or trigger');
  assert.ok(h.runUntil(() => e.blockedBy === u, 20), 'the enemy reaches her and is blocked from behind');
  assert.ok(h.runUntil(() => u.skill.active, 3), 'S3 waits although the enemy it blocks is a target of its trigger');
});

test('a ground-only trigger (`_targetMotion` 1) is not met by a flyer in the range box; an SP_FULL rule waits for it too', () => {
  const { h, u } = lane('chess_char_4_12_a', 'RIGHT', { motion: 'FLY', speed: 0.3 });
  u.skill.cast = { ...u.skill.cast, trig: { ...u.skill.cast.trig, motion: 1 } };
  u.skill.rule = 'SP_FULL';
  h.run(4);
  assert.ok(!u.skill.active, 'the skill cast with only a flyer in range although its trigger selects ground enemies');
  u.skill.cast = { ...u.skill.cast, trig: { ...u.skill.cast.trig, motion: 3 } };
  assert.ok(h.runUntil(() => u.skill.active, 3), 'with ground and air the flyer in range casts it');
});

// ---------------------------------------------------------------------------------------------------------------
// ally selectors and the tile selector (docs/rules/sim.md 「스킬 프리팹의 대상 트리거」 — skills.js _trigAllies)

const ACT3 = JSON.parse(readFileSync(new URL('../../data/seasons/act3autochess/chess.json', import.meta.url), 'utf8'));
const act3Chess = ACT3.chess || ACT3;
/** An act3autochess chess record fielding another of its skills. */
const withSkill = (id, skillId) => ({ ...act3Chess[id], skill: act3Chess[id].skills.find((s) => s.skillId === skillId) });

function board(units, chess = {}) {
  const h = makeBattle({ season: 'act3autochess', seed: 1, timeLimit: 60, autoFinish: false, units, enemies: [], defs: { chess } });
  h.step(1);
  return h;
}
const CHNUT = 'chess_char_1_15_a', CHRIST = 'chess_char_2_09_a', PAPYRS = 'chess_char_2_04_a', THORN2 = 'chess_char_6_01_a';

test('褐果 S1: its trigger holds an ally in range that is hurt or holds 元素损伤 — the most 元素损伤 first, no 禁疗 ally', () => {
  const h = board([{ chessId: CHNUT, row: 9, col: 6, dir: 'RIGHT' }, { chessId: CHRIST, row: 9, col: 7, dir: 'RIGHT' }]);
  const u = h.unit(CHNUT), a = h.unit(CHRIST), sk = u.skill;
  assert.ok(sk.id === 'skchr_chnut_1' && sk.cast?.trig?.side === 1 && sk.cast.trig.post === 38, 'skchr_chnut_1 carries its ally trigger (post 38)');
  assert.ok(!sk._trigFound() && sk.trigTarget(sk.cast.trig) === null, 'everyone at full HP and no 元素损伤: no target (FilterUtil drops them)');
  a.hp = a.s.maxHp * 0.5;
  assert.ok(sk._trigFound() && sk.trigTarget(sk.cast.trig) === a, 'the hurt ally in her range is the target');
  u.hp = u.s.maxHp * 0.2;
  assert.ok(sk.trigTarget(sk.cast.trig) === u, 'she herself counts (`_excludeOwner` 0), the lowest HP ratio first');
  a.elem.burn = 200;
  assert.ok(sk.trigTarget(sk.cast.trig) === a, 'an ally with 元素损伤 comes before a lower HP ratio');
  u.hp = u.s.maxHp;
  assert.ok(sk.cast.trig.noHeal, 'skchr_chnut_1 carries `noHeal`: its skill ability is a Heal, whose purpose mask holds HEAL (skill_cast.py skill_entry)');
  h.b.addBuff(a, { key: 'test:noheal', duration: 99, flags: { noHeal: true } });
  assert.ok(!sk._trigFound(), 'a 禁疗 ally is no target of her heal');
  u.hp = u.s.maxHp * 0.5;
  assert.ok(sk.trigTarget(sk.cast.trig) === u, 'she herself, hurt, is');
  h.b.addBuff(u, { key: 'test:noheal', duration: 99, flags: { noHeal: true } });
  assert.ok(!sk._trigFound(), 'a 禁疗 Chestnut is no target of her own heal either (`TargetOptions._VerifyAdvanced` drops HEAL_FREE, the owner too) '
    + '— docs/rules/sim.md 「스킬 프리팹의 대상 트리거」');
});

test('莎草 S2: another ground operator in range, no 禁疗 one, none holding the validator buff', () => {
  const h = board([{ chessId: PAPYRS, row: 9, col: 6, dir: 'RIGHT' }], { [PAPYRS]: withSkill(PAPYRS, 'skchr_papyrs_2') });
  const u = h.unit(PAPYRS), sk = u.skill;
  assert.ok(sk.id === 'skchr_papyrs_2' && sk.cast?.trig?.exclSelf && sk.cast.trig.prof === 639, 'skchr_papyrs_2 carries exclSelf / prof');
  assert.ok(!sk._trigFound(), 'alone: she is no target of her own S2 (`_excludeOwner`)');
  const h2 = board([{ chessId: PAPYRS, row: 9, col: 6, dir: 'RIGHT' }, { chessId: CHRIST, row: 9, col: 7, dir: 'RIGHT' }],
    { [PAPYRS]: withSkill(PAPYRS, 'skchr_papyrs_2') });
  const u2 = h2.unit(PAPYRS), a = h2.unit(CHRIST);
  assert.ok(u2.skill._trigFound() && u2.skill.trigTarget(u2.skill.cast.trig) === a, 'an operator in her range is the target');
  const b = h2.b.addBuff(a, { key: 'trap_skzwyx[undeadable]', duration: 99 });
  assert.ok(!u2.skill._trigFound(), 'an operator holding the validator buff is left out');
  h2.b.removeBuff(a, b);
  h2.b.addBuff(a, { key: 'test:noheal', duration: 99, flags: { noHeal: true } });
  assert.ok(!u2.skill._trigFound(), 'a 禁疗 operator is left out (the validator excludes HEAL_FREE)');
});

test('引星棘刺 S3: an operator in range casts it; its units go to the operators in her range, the fewest blocked first, then the latest deployed — and no thorn2_s_3[buff] on them', () => {
  const units = [{ chessId: THORN2, row: 9, col: 6, dir: 'RIGHT' }, { chessId: CHRIST, row: 9, col: 7, dir: 'RIGHT' },
    { chessId: PAPYRS, row: 9, col: 8, dir: 'RIGHT' }, { chessId: CHNUT, row: 3, col: 1, dir: 'RIGHT' }];
  const h = board(units, { [THORN2]: withSkill(THORN2, 'skchr_thorn2_3') });
  const u = h.unit(THORN2), sk = u.skill, far = h.unit(CHNUT);
  assert.ok(sk.id === 'skchr_thorn2_3' && sk.cast?.trig?.buffSrc && sk.cast.trig.notBuff.includes('thorn2_s_3[buff]') && sk.cast.trig.post === 61,
    'skchr_thorn2_3 carries its trigger (buff filter, post 61)');
  assert.ok(sk._trigFound() && sk.trigTarget(sk.cast.trig) !== null, 'an operator in her range is a target');
  const picked = sk.trigAllyTargets(sk.cast.trig, 3);
  assert.ok(!picked.includes(far), 'an operator outside her skill range gets no unit (the kit took every operator of her owner)');
  assert.ok(picked.length === 3 && picked[0] === h.unit(PAPYRS) && picked[1] === h.unit(CHRIST) && picked[2] === u,
    'with no one blocking, the latest deployed first (BLOCK_CNT_ASC_CREATED_TIME_DES), she herself too');
  assert.ok(sk.trigAllyTargets(sk.cast.trig, 1).length === 1, '`max_target_token` caps them');
  sk.gainSp(999);
  assert.ok(sk.activate('DEFAULT') !== false, 'S3 casts');
  h.run(3);
  assert.ok(!h.b.allyUnits.some((a) => a.buffs.some((x) => x.key === 'thorn2_s_3[buff]')),
    'no thorn2_s_3[buff]: no official node attaches it (docs/rules/sim.md 「스킬 프리팹의 대상 트리거」)');
  assert.ok(sk._trigFound(), 'so the operators carrying her units still hold her trigger');
});

test('Miss.Christine S2: a TileSelector trigger finds the enemies of her skill range (HATRED_DES), not tiles', () => {
  const h = makeBattle({
    season: 'act3autochess', seed: 1, timeLimit: 60, autoFinish: false, units: [{ chessId: CHRIST, row: 9, col: 6, dir: 'RIGHT' }],
    enemies: [], defs: { enemies: { tank: enemyRec({ key: 'tank', hp: 1e6, speed: 0 }) } },
  });
  h.step(1);
  const u = h.unit(CHRIST), sk = u.skill;
  assert.ok(sk.id === 'skchr_christ_2' && sk.cast?.trig?.sel === 'range' && sk.cast.trig.side === 2 && sk.cast.trig.post === 4, 'skchr_christ_2 carries an enemy range trigger');
  assert.ok(!sk._trigFound(), 'no enemy: no cast');
  const e = h.spawn('tank', { pos: [9, 7] });
  h.step(1);
  assert.ok(sk._trigFound() && sk.trigTarget(sk.cast.trig) === e, 'an enemy in her skill range is the target');
});
