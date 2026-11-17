// A MANUAL skill's own target trigger (docs/rules/sim.md 「스킬 프리팹의 대상 트리거」): the automatic operations ask the
// official CastSkill.get_canCastCheck besides the trigger rule, and it is false when the skill prefab's `_trigger` finds no
// target. tools/local-extract/skill_cast.py reads every pool `_trigger` (data `cast.trig`), server/sim/skills.js _trigFound
// searches it. The cause this replaces — one kit's hand-written castCheck (歌蕾蒂娅 S3) while every other trigger went
// unread — is gone; the sweep below keeps the selectors the engine does not model listed, each with its reason.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const FILES = ['data/chess.json', 'data/backups.json', 'data/seasons/act3autochess/chess.json', 'data/seasons/act3autochess/backups.json'];

// MANUAL skills whose trigger selector _trigFound does not model: they cast by their rule alone (true)
const UNMODELLED = {
  skchr_chnut_1: 'ally selector (side 1): allies in the skill range box, the unit itself included (`_excludeOwner` 0)',
  skchr_papyrs_2: 'ally selector with a validator filter (AdvancedSelectorWithValidatorFilter + FilterBuffTargetValidator)',
  skchr_thorn2_3: 'ally selector by profession, without the thorn2_s_3[buff] buff (AdvancedSelectorWithTagAndBuffKey)',
  skchr_christ_2: 'tile selector (TileSelector): tiles of the range box by its build options, not units',
};

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
  || ((t.sel === 'range' || t.sel === 'blocked') && t.side === 2 && !t.filter);

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
