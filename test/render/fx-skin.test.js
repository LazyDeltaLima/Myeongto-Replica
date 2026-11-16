// test/render/fx-skin.test.js — a unit drawn in an operator skin plays its skin's effects, points and drawn projectiles
// (render/fxskin.js, render/fxgame.js skinOf / skinAt, render/fxplayer.js FxLibrary skinFiles; docs/rules/render.md
// 「스킨 모델 소재」 「렌더가 스킨 유닛에 쓰는 것」). Its own file: the effect layer caches its index per process.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKIN_EFFECTS_URL, SKIN_POINTS_URL, skinEffect, skinFile, skinShot } from '../../public/js/render/fxskin.js';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const RULE = 'docs/rules/render.md 「스킨 모델 소재」 — 「렌더가 스킨 유닛에 쓰는 것」';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SK = 'char_1_a@boc#1';
const DOC = {
  skins: {
    [SK]: { owner: 'char_1_a', effects: { common_char_birth_01: 'a_birth_boc#1', a_attack_hit: 'a_attack_hit_boc#1', a_trail: 'a_trail_boc#1' },
      projectiles: [{ from: 'projectile_a', graphic: 'projectile_a_graphic', logic: 'projectile_a_logic', muzzle: 5 },
        { from: 'projectile_a_s2', graphic: 'projectile_a_s2_graphic', logic: 'projectile_a_s2_logic', muzzle: 2 }] },
    'char_2_b@sale#3': { owner: 'char_2_b' },
  },
  files: { 'a_birth_boc#1': 'skin/a/a_birth_boc-1.json', 'a_attack_hit_boc#1': 'skin/a/a_attack_hit_boc-1.json', 'a_kid': 'skin/a/a_kid.json' },
  projectileEffects: { projectile_a: ['A_Trail'], projectile_a_graphic: ['a_trail'], projectile_a_s2: ['a_s2_trail'] },
  missing: { effects: [], projectiles: ['projectile_a_s2_graphic'] },
};

test('fxskin: the skin\'s effect pairs, its prefab files and its drawn projectiles', () => {
  assert.equal(skinEffect(DOC, SK, 'a_attack_hit'), 'a_attack_hit_boc#1', `${RULE}: the CharacterSkinHooker pair`);
  assert.equal(skinEffect(DOC, SK, 'common_char_birth_01'), 'a_birth_boc#1', 'the common deploy effect too');
  assert.equal(skinEffect(DOC, SK, 'a_other'), 'a_other', 'an effect the skin does not pair: the default');
  assert.equal(skinEffect(DOC, 'char_2_b@sale#3', 'a_attack_hit'), 'a_attack_hit', 'a skin without a hooker');
  assert.equal(skinEffect(DOC, null, 'a_attack_hit'), 'a_attack_hit');
  assert.deepEqual(skinFile(DOC, 'a_birth_boc#1'), ['skin/a', 'a_birth_boc-1'], 'the skin folder and the file name (# → -)');
  assert.equal(skinFile(DOC, 'a_attack_hit'), null);
  assert.deepEqual(skinShot(DOC, SK, 'a_trail'), { names: ['a_trail'], muzzle: 5 }, `${RULE}: the replaced projectile's trail (case aside) → the drawn one's, from its muzzle point`);
  assert.deepEqual(skinShot(DOC, SK, 'a_s2_trail'), { names: [], muzzle: 2 }, 'a drawn projectile without a _mainEffect draws nothing');
  assert.equal(skinShot(DOC, SK, 'a_s3_trail'), null, 'a trail no row replaces');
  assert.equal(skinShot(DOC, 'char_2_b@sale#3', 'a_trail'), null);
});

test('the skin tables are the skin data pack\'s (fx/skin/, in packs.skin): a player who never chose the skins does not get them', () => {
  for (const u of [SKIN_EFFECTS_URL, SKIN_POINTS_URL]) assert.ok(u.startsWith('/assets/local/fx/skin/'), `${RULE}: ${u}`);
  const tool = readFileSync(path.join(ROOT, 'tools/build-browser-resources.mjs'), 'utf8');
  assert.match(tool, /'\/assets\/local\/fx\/skin\/'/, 'the skin pack holds fx/skin/');
});

const files = {
  '/assets/local/fx/index.json': { bundles: { a: ['a_attack_hit', 'a_trail'], common: ['common_char_birth_01'] } },
  '/assets/local/fx/modes.json': {},
  '/assets/local/fx/enemy-index.json': { bundles: {} },
  '/assets/local/fx/enemy-modes.json': { $fx: {} },
  [SKIN_EFFECTS_URL]: DOC,
  [SKIN_POINTS_URL]: { [SK]: { muzzle: { F: { at: [1, 2] } } } },
};
const settle = () => new Promise((r) => setTimeout(r, 10));

test('a unit drawn in a skin plays its skin\'s deploy effect; one in the default model, or another player\'s skin not drawn, the default', async () => {
  const fetch0 = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => { asked.push(url); return files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null }; };
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p) });
    await settle();
    const unit = (id, skinKey) => ({ id, x: 0, y: 0, alive: true, skinKey, info: { id, side: 'ally', defId: 'char_1_a', kind: 'op', skin: 'char_1_a@boc#1' } });
    const born = () => seen.splice(0).filter((p) => p.tag === 'born').map((p) => `${p.names.join('+')}@${p.by}`);
    // the default model (the gate said no: skinKey null) — the skin tables are never fetched
    let views = new Map([[1, unit(1, null)]]);
    layer.onEvent(['deploy', 1], views);
    layer.update(0.1);
    await settle();
    assert.deepEqual(born(), ['common_char_birth_01@1']);
    assert.ok(!asked.includes(SKIN_EFFECTS_URL) && !asked.includes(SKIN_POINTS_URL), `${RULE}: no unit drawn in a skin, no skin table fetched`);
    views = new Map([[2, unit(2, SK)]]);
    layer.onEvent(['deploy', 2], views);
    layer.update(0.2);
    await settle();
    assert.deepEqual(born(), ['a_birth_boc#1@2'], `${RULE}: the skin's own deploy effect (common_char_birth_01's pair)`);
    assert.ok(asked.includes(SKIN_EFFECTS_URL) && asked.includes(SKIN_POINTS_URL));
  } finally { globalThis.fetch = fetch0; }
});

test('FxLibrary: a skin prefab loads from fx/skin/<bundle>/, its own textures and meshes from fx/skin/tex|mesh/', async () => {
  const fxp = await import('../../public/js/render/fxplayer.js');
  const fetch0 = globalThis.fetch;
  const asked = [];
  const defs = {
    '/fx/skin/index.json': { tex: ['mine.webp'], mesh: ['m_mine'] },
    '/fx/skin/tex/wrap.json': { 'mine.webp': [1, 1] },
    '/fx/skin/a/a_hit_boc-1.json': { name: 'a_hit_boc#1', materials: {}, nodes: [{ mesh: { mesh: 'm_mine' } }, { mesh: { mesh: 'm_shared' } }] },
  };
  globalThis.fetch = async (url) => { asked.push(url); return defs[url] ? { ok: true, json: async () => defs[url] } : url.endsWith('.json') && url.includes('/mesh/') ? { ok: true, json: async () => ({ pos: [0, 0, 0], idx: [0] }) } : { ok: false, json: async () => null }; };
  try {
    const lib = new fxp.FxLibrary('/fx/');
    lib.loader = { load: (u) => ({ url: u }) };
    const def = await lib.load('skin/a', 'a_hit_boc-1');
    assert.ok(def, 'loaded from the skin folder (the folder\'s parts encoded one by one)');
    assert.ok(asked.includes('/fx/skin/a/a_hit_boc-1.json'));
    assert.ok(asked.includes('/fx/skin/mesh/m_mine.json') && asked.includes('/fx/mesh/m_shared.json'), `${RULE}: a mesh only skins use is in the skin folder, a shared one in mesh/`);
    assert.equal(lib.texture('mine.webp').url, '/fx/skin/tex/mine.webp');
    assert.equal(lib.texture('shared.webp').url, '/fx/tex/shared.webp');
    assert.ok(lib.texture('mine.webp').wrapS === lib.texture('mine.webp').wrapT, 'its wrap from skin/tex/wrap.json');
  } finally { globalThis.fetch = fetch0; }
});

// The extracted tables (git-ignored client data): every skin's drawn-projectile rows resolve, a known case.
const FX = path.join(ROOT, 'public/assets/local/fx/skin');
const real = existsSync(path.join(FX, 'skin-effects.json')) ? JSON.parse(readFileSync(path.join(FX, 'skin-effects.json'), 'utf8')) : null;
test('the extracted skin tables: the drawn projectile rows find their trails, and their prefabs are in the skin folder or the defaults', { skip: !real && 'not extracted on this machine' }, () => {
  let rows = 0, found = 0;
  const lacking = [];
  for (const [key, row] of Object.entries(real.skins)) {
    for (const p of row.projectiles || []) {
      rows++;
      const from = real.projectileEffects?.[p.from];
      if (!from) continue;   // the replaced projectile has no _mainEffect of its own: nothing it would replace
      found++;
      const shot = skinShot(real, key, from[0]);
      assert.ok(shot, `${key} ${p.from}`);
      for (const n of shot.names) {
        const drawn = skinEffect(real, key, n);
        if (!skinFile(real, drawn) && !real.missing?.effects?.includes(drawn.toLowerCase()) && drawn !== n) lacking.push(`${key}: ${drawn}`);
      }
    }
  }
  assert.ok(rows > 300 && found > 300, `${RULE}: ${found} of ${rows} drawn-projectile rows know the trail they replace (fx_extract.py --skin-finish writes the \`from\` keys)`);
  assert.deepEqual(lacking, [], `${RULE}: a drawn projectile's skin effect without its file (rerun --skin-effects)`);
  const k = skinShot(real, 'char_1021_kroos2@game#3', 'kroos2_attack_trail_01');
  assert.deepEqual(k, { names: ['kroos2_attack_trail_01'], muzzle: 6 }, 'a known case: 크루스 더 킨 글린트 game#3');
  assert.deepEqual(skinFile(real, skinEffect(real, 'char_1021_kroos2@game#3', k.names[0])), ['skin/kroos2', 'kroos2_attack_trail_01_game-3']);
});
