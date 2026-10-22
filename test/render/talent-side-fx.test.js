// test/render/talent-side-fx.test.js — 2026-10-21 (이펙트 연결 전수 ①·②, docs/rules/fx.md 「다른 필드 투사체 — 재능 화살·동전·
// 되돌아오는 영哨·작살」·「대상 쪽별 능력·뒤따르는 투사체」):
//  - a mode talent the client casts in place of the attack (char_modes.py mode_parts → talentAtk): 寒芒克洛丝's 中的 arrow — the
//    swing / 'atk' signal 'T.1' plays its cast, trail and hit instead of the attack's;
//  - the per-side children of an attack (sideFx): 凯尔希·思衡托 S2 HealAlly / AttackEnemy — the cast and trail of the target's
//    side; landing, the follow-up projectile's effects;
//  - kit events that fly a projectile of another field (render/fx/kitofficial.js): 琳琅诗怀雅 S3's coins, 伊内丝 S3's recalled
//    sentry, 歌蕾蒂娅 S3's harpoon.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { modePart } from '../../public/js/render/fxmap.js';
import { PLAYS } from '../helpers/fxPlays.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const MODES = read('tools/assets/local-char-modes.json');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');

test('char_modes.py: a mode talent and the per-side children keep their effects out of the mode\'s lists', () => {
  const k = MODES.char_1021_kroos2;
  assert.deepEqual(k.talentAtk[0], { 'T.1': { cast: ['kroos2_attack_start_02'], trail: ['kroos2_attack_trail_02'], hit: ['kroos2_attack_hit_02'] } },
    '寒芒克洛丝: Modes/Default/Body/Talents/1 (_isModeTalent, projectile_chr_kroos2_2)');
  assert.deepEqual(k.cast[0], ['kroos2_attack_start_01'], 'her normal attack casts its own start only');
  assert.deepEqual(k.trail[0], ['kroos2_attack_trail_01']);
  const x = MODES.char_1032_excu2;
  assert.ok(x.talentAtk[0]['T.1'].hit.includes('excu2_beidong_hit') && !x.hit[0].includes('excu2_beidong_hit'), '圣约送葬人: the passive\'s hit is the 受选之人 shot\'s');
  const c = MODES.char_1052_kalts2;
  if (c?.sideFx) {
    assert.deepEqual(c.sideFx[4], {
      ally: { cast: ['kalts2_skill_02_start_heal_01'], trail: ['kalts2_skill_02_trail_heal_01'], hit: ['kalts2_skill_02_range_heal_01'] },
      foe: { cast: ['kalts2_skill_02_start_damage_01'], trail: ['kalts2_skill_02_trail_damage_01'], hit: ['kalts2_skill_02_range_damage_01'] },
    }, '凯尔希·思衡托 S2: HealAlly / AttackEnemy by their Trigger._targetSide');
    assert.deepEqual(c.cast[4], ['folnic_skill_02_start'], 'the group\'s own cast stays the mode\'s');
    assert.deepEqual(c.trail[4], []);
  }
});

test('modePart: the talent of the signal replaces; the side child adds; nothing without either', () => {
  const bind = { talentAtk: [{ 'T.1': { cast: ['a_02'], trail: ['t_02'], hit: ['h_02', 'gone'] } }], sideFx: [null, { ally: { cast: ['heal'], trail: ['th'], hit: [] }, foe: { cast: ['dmg'], trail: ['td'], hit: [] } }] };
  const pre = ['a_02', 't_02', 'h_02', 'heal', 'th', 'dmg', 'td'];
  assert.deepEqual(modePart(bind, pre, 0, 'T.1', null), { replace: true, cast: ['a_02'], trail: ['t_02'], hit: ['h_02'] });
  assert.equal(modePart(bind, pre, 0, null, true), null);
  assert.equal(modePart(bind, pre, 0, 'T.2', false), null);
  assert.deepEqual(modePart(bind, pre, 1, null, true), { replace: false, cast: ['heal'], trail: ['th'], hit: [] });
  assert.deepEqual(modePart(bind, pre, 1, null, false).cast, ['dmg']);
  assert.equal(modePart(bind, pre, 1, null, null), null, 'no target: no side');
});

test('fxgame: a skill shot\'s rope runs from her to the flying head (ropeLine), the harpoon out and back (planHarpoon)', () => {
  assert.match(SRC, /if \(shot && mode === -1\) \{ const line = shotLine\(src, name\); if \(line\) ropeLine\(b\.bundle, line, src, rec\); \}/);
  assert.match(SRC, /startLine\(bundle, name, src, head, rec\.dur \+ link, \{ sMount: 2, eMount: 7 \}\);/);
  assert.match(SRC, /const t = clockS - t0, k = t < out \? t \/ out : Math\.max\(0, 1 - \(t - out\) \/ backT\);/);
});

const BIND = (id) => Object.fromEntries(['modes', 'skillMode', 'cast', 'castOpt', 'hit', 'trail', 'skills', 'talentAtk', 'sideFx'].filter((k) => k in MODES[id]).map((k) => [k, MODES[id][k]]));
const files = {
  '/assets/local/fx/index.json': { bundles: {
    kroos2: ['kroos2_attack_start_01', 'kroos2_attack_start_02', 'kroos2_attack_trail_01', 'kroos2_attack_trail_02', 'kroos2_attack_hit_01', 'kroos2_attack_hit_02'],
    kalts2: ['kalts2_skill_02_start_heal_01', 'kalts2_skill_02_start_damage_01', 'folnic_skill_02_start', 'kalts2_skill_02_range_damage_01',
      'kalts2_skill_02_range_heal_01', 'kalts2_skill_02_indicator_damage_01', 'kalts2_skill_02_indicator_heal_01', 'kalts2_skill_02_range_heal_01_delay',
      'kalts2_skill_02_range_damage_01_delay'],
    swire2: ['swire2_skill_03_trail', 'swire2_skill_03_hit_02'],
    ines: ['ines_skill_03_label_trail_01', 'ines_skill_03_pullLabel_line_01', 'ines_skill_03_label_hit_01', 'ines_skill_03_getLabel_01', 'ines_skill_03_getLabel_range_01'],
  } },
  '/assets/local/fx/modes.json': Object.fromEntries(['char_1021_kroos2', 'char_1052_kalts2'].filter((id) => MODES[id]).map((id) => [id, BIND(id)])),
  '/assets/local/fx/plays.json': PLAYS,   // 琳琅诗怀雅's coin by its projectile key
  '/assets/local/fx/enemy-index.json': { bundles: {} },
  '/assets/local/fx/enemy-modes.json': { $fx: {} },
};
const settle = () => new Promise((r) => setTimeout(r, 10));

async function withLayer(run) {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p) });
    await settle();
    const unit = (id, side, defId, x = 0, skillIndex = 0) => ({ id, x, y: 0, alive: true, info: { id, side, defId, skillIndex } });
    const take = (kind = null) => seen.splice(0).filter((p) => !kind || p.kind === kind).map((p) => `${p.kind}:${p.names.join('+')}${p.at != null ? `@${p.at}` : ''}`);
    await run({ layer, unit, take });
  } finally { globalThis.fetch = fetch0; }
}

test('寒芒克洛丝: a T.1 swing casts the talent\'s start, its arrow hits with the talent\'s hit; a normal one the attack\'s', () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_1021_kroos2')], [9, unit(9, 'enemy', 'enemy_x', 2)]]);
  layer.onEvent(['swing', 1, 0.2, 'arrow', 0, 9, 0, 0, 'T.1'], views);
  layer.update(0.2);
  layer.onEvent(['atk', 1, 9, 'arrow', 'T.1'], views);
  layer.onEvent(['dmg', 9, 300, 'phys', 0, 1], views);
  const t = take();
  assert.ok(t.some((p) => p.includes('kroos2_attack_start_02')) && !t.some((p) => p.includes('kroos2_attack_start_01')), `${t}`);
  assert.ok(t.includes('attackHit:kroos2_attack_hit_02@9'), `${t}`);
  layer.update(2);
  take();
  layer.onEvent(['swing', 1, 0.2, 'arrow'], views);
  layer.update(0.2);
  layer.onEvent(['atk', 1, 9, 'arrow'], views);
  layer.onEvent(['dmg', 9, 300, 'phys', 0, 1], views);
  const n = take();
  assert.ok(n.some((p) => p.includes('kroos2_attack_start_01')) && !n.some((p) => p.includes('kroos2_attack_start_02')), `${n}`);
  assert.ok(n.includes('attackHit:kroos2_attack_hit_01@9'), `${n}`);
}));

test('凯尔希·思衡托 S2: the cast of the target\'s side; landing, its half and the follow-up shot\'s', { skip: !MODES.char_1052_kalts2?.sideFx }, () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_1052_kalts2', 0, 1)], [2, unit(2, 'ally', 'char_x', 1)], [9, unit(9, 'enemy', 'enemy_x', 2)]]);
  layer.onEvent(['skill', 1, 1], views);
  take();
  layer.onEvent(['swing', 1, 0.2, 'orb', 0, 9], views);
  const foe = take();
  assert.ok(foe.some((p) => p.includes('kalts2_skill_02_start_damage_01')) && !foe.some((p) => p.includes('start_heal')), `${foe}`);
  layer.update(1);
  layer.onEvent(['atk', 1, 2, 'orb'], views);   // a heal shot (Battle.forceAttack: no swing)
  const ally = take();
  assert.ok(ally.some((p) => p.includes('kalts2_skill_02_start_heal_01')) && !ally.some((p) => p.includes('start_damage')), `${ally}`);
  layer.onEvent(['fx', 'aoe', 2, 0, { x: 2, y: 0, radius: 1.5, id: 1, skill: 'kalts2:s2', ally: false }], views);
  assert.deepEqual(take('spawn').map((p) => p.slice(6)).sort(),
    ['kalts2_skill_02_indicator_damage_01', 'kalts2_skill_02_range_damage_01', 'kalts2_skill_02_range_heal_01_delay']);
  layer.onEvent(['fx', 'aoe', 1, 0, { x: 1, y: 0, radius: 1.5, id: 1, skill: 'kalts2:s2', ally: true }], views);
  assert.deepEqual(take('spawn').map((p) => p.slice(6)).sort(),
    ['kalts2_skill_02_indicator_heal_01', 'kalts2_skill_02_range_damage_01_delay', 'kalts2_skill_02_range_heal_01']);
}));

test('琳琅诗怀雅 S3: a coin at each paid enemy, 0.07 s apart, its hit as it lands', () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_1033_swire2')], [8, unit(8, 'enemy', 'enemy_x', 1)], [9, unit(9, 'enemy', 'enemy_x', 2)]]);
  layer.onEvent(['fx', 'coin', 0, 0, { id: 1, n: 0, spent: 2, skill: 'swire2_3', targets: [8, 9] }], views);
  assert.deepEqual(take('spawn'), ['spawn:swire2_skill_03_trail'], 'the first coin now');
  layer.update(0.08);
  assert.deepEqual(take('spawn'), ['spawn:swire2_skill_03_trail'], 'the second 0.07 s later');
  layer.update(0.3);   // 2 tiles at 8 tiles / s from the second's start
  assert.deepEqual(take('attackHit').sort(), ['attackHit:swire2_skill_03_hit_02@8', 'attackHit:swire2_skill_03_hit_02@9']);
}));

test('伊内丝 S3: the sentry flies back to her, hitting the enemies it passes, its reach effects on her', () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_4087_ines')], [8, unit(8, 'enemy', 'enemy_x', 2)]]);
  layer.onEvent(['fx', 'beam', 4, 0, { x: 4, y: 0, tx: 0, ty: 0, id: 1, hits: [8] }], views);
  assert.deepEqual(take('spawn'), ['spawn:ines_skill_03_label_trail_01']);
  layer.update(0.25);   // 2 tiles at 10 tiles / s: the enemy halfway
  assert.deepEqual(take('attackHit'), ['attackHit:ines_skill_03_label_hit_01@8']);
  layer.update(0.25);
  assert.deepEqual(take('spawn').sort(), ['spawn:ines_skill_03_getLabel_01', 'spawn:ines_skill_03_getLabel_range_01']);
}));
