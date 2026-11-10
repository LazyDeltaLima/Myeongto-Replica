// test/render/veen-merge-fx.test.js — 维伊's attack abilities (docs/rules/fx.md 「소환물의 공격 이펙트」 「공격 없는 소환물의 스킬
// 이펙트」 the 비이 line): her Default / S1 / S2 modes attack through an ability group, AttackWithMergeBall (its Selector asks for
// veen_charge_ball_merged, the Trait ChargeableGroup's buff while she holds a 转置能量: projectile_chr_veen_merged_base /
// _s2_merged_base, hit veen_attack_rank_02_hit_01) else AttackBase (projectile_chr_veen_base / _s2_base, hit
// veen_attack_rank_01_hit_01). char_modes.py writes the conditional child as the mode's talentAtk (by its Selector, not by a
// `First…` name), the kit names it in the 'atk' signal, and the effect layer plays that child's hit (fxmap.js modePart).
// Before, the mode's hit was whichever child the extractor met (S2: rank_02 on every attack, Default / S1: rank_01 on all).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));
const VEEN = 'char_4226_veen';
const R1 = 'veen_attack_rank_01_hit_01', R2 = 'veen_attack_rank_02_hit_01';

test('char_modes.py: 维伊\'s modes hit with AttackBase\'s rank_01; AttackWithMergeBall is the talentAtk of Default / S1 / S2 (rank_02)', () => {
  const m = MODES[VEEN];
  assert.deepEqual(m.modes, ['Default', 'S1', 'S2', 'S3']);
  for (const i of [0, 1, 2]) {
    assert.deepEqual(m.hit[i], [R1], `${m.modes[i]}: AttackBase's hit`);
    assert.deepEqual(m.talentAtk[i].AttackWithMergeBall.hit, [R2], `${m.modes[i]}: the merged ball's`);
    assert.deepEqual(m.talentAtk[i].AttackWithMergeBall.cast, m.cast[i], 'the same cast as the mode\'s');
  }
  assert.equal(m.talentAtk[3], null, 'S3 attacks with one ability');
  // 折桠 S2's FirstAttack keeps its part (the same rule, read by the Selector now)
  assert.ok(MODES.char_4207_branch.talentAtk[1].FirstAttack, '折桠 FirstAttack');
});

test('维伊 kit: an attack made while she holds a 转置能量 is \'AttackWithMergeBall\' on its \'atk\'; one without, no signal', () => {
  const dummy = enemyRec({ key: 'enemy_fly', hp: 1e9, speed: 0, mass: 0, motion: 'FLY' });
  for (const skill of [0, 1]) {
    const h = makeBattle({ defs: { enemies: { enemy_fly: dummy } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0 },
      units: [{ uid: 1, diy: { slot: 'chess_char_5_diy1_a', charId: VEEN, skillIndex: skill, uniEquipId: null }, elite: false, row: 10, col: 5 }] });
    h.step();
    const u = h.unit(1);
    u.skill.sp = 0;
    assert.ok(h.runUntil(() => (u.trait.veen?.t ?? 0) === 1, 60), 'a 转置能量 stored');
    h.spawn('enemy_fly', { pos: [10, 7] });
    const atkOf = () => h.eventsOf('atk').filter((e) => e[1] === u.id);
    assert.ok(h.runUntil(() => atkOf().length >= 1, 6));
    assert.equal(atkOf()[0][4], 'AttackWithMergeBall', `S${skill + 1}: holding one`);
    assert.ok(h.runUntil(() => atkOf().length >= 2, 6));
    assert.equal(atkOf()[1].length, 4, `S${skill + 1}: the next attack holds none: no signal`);
  }
});

const files = {
  '/assets/local/fx/index.json': { bundles: { veen: [R1, R2, 'veen_attack_start_01', 'veen_trail_01'] } },
  '/assets/local/fx/modes.json': { [VEEN]: {
    modes: ['Default'], cast: [['veen_attack_start_01']], hit: [[R1]], trail: [['veen_trail_01']],
    talentAtk: [{ AttackWithMergeBall: { cast: ['veen_attack_start_01'], trail: ['veen_trail_01'], hit: [R2] } }] } },
  '/assets/local/fx/enemy-index.json': { bundles: {} },
  '/assets/local/fx/enemy-modes.json': { $fx: {} },
};

test('fxgame: the \'atk\' signal AttackWithMergeBall plays rank_02 on the target, an attack without it rank_01', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p) });
    await new Promise((r) => setTimeout(r, 10));
    const her = { id: 1, x: 0, y: 0, alive: true, info: { id: 1, side: 'ally', kind: 'op', defId: 'chess_char_5_diy1_a', spine: VEEN, skillIndex: 0 } };
    const foe = { id: 2, x: 3, y: 0, alive: true, info: { id: 2, side: 'enemy', defId: 'enemy_x' } };
    const views = new Map([[1, her], [2, foe]]);
    const hits = () => seen.splice(0).filter((p) => p.names.some((n) => n === R1 || n === R2)).map((p) => p.names.join('+'));
    const attack = (sig) => {
      layer.onEvent(['swing', 1, 0.5, 'bolt', 0, 2], views);
      layer.update(0.5);
      layer.onEvent(sig ? ['atk', 1, 2, 'bolt', sig] : ['atk', 1, 2, 'bolt'], views);
      layer.onEvent(['dmg', 2, 100, 'arts', 0, 1, 0, 0], views);
      layer.update(1);
    };
    attack('AttackWithMergeBall');
    assert.deepEqual(hits(), [R2]);
    attack(null);
    assert.deepEqual(hits(), [R1]);
  } finally { globalThis.fetch = fetch0; }
});
