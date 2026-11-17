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
import { syncStatusFx } from '../../public/js/render/fxstatus.js';

const RULE = 'docs/rules/render.md 「스킨 모델 소재」 — 「렌더가 스킨 유닛에 쓰는 것」';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SK = 'char_1_a@boc#1';
const DOC = {
  skins: {
    [SK]: { owner: 'char_1_a', effects: { common_char_birth_01: 'a_birth_boc#1', a_attack_hit: 'a_attack_hit_boc#1', a_trail: 'a_trail_boc#1' },
      projectiles: [{ from: 'projectile_a', graphic: 'projectile_a_graphic', logic: 'projectile_a_logic', muzzle: 5 },
        { from: 'projectile_a_s2', graphic: 'projectile_a_s2_graphic', logic: 'projectile_a_s2_logic', muzzle: 2 }] },
    'char_2_b@sale#3': { owner: 'char_2_b' },
    // 流星 (shotst): a skin whose pairs turn her S2 arrow and its hit, one whose fake projectile draws nothing in its place
    'char_126_shotst@x#1': { owner: 'char_126_shotst', effects: { shotst_skill_02_trail: 'shotst_skill_02_trail_x#1', shotst_skill_01_hit: 'shotst_skill_01_hit_x#1' } },
    'char_126_shotst@y#2': { owner: 'char_126_shotst', projectiles: [{ from: 'projectile_shotst_s2', graphic: 'projectile_shotst_s2_graphic', logic: 'projectile_shotst_s2_logic', muzzle: 2 }] },
    'char_1020_reed2@x#1': { owner: 'char_1020_reed2', effects: { reed2_debuff_boom_01: 'reed2_debuff_boom_01_x#1' } },
    'char_311_mudrok@x#1': { owner: 'char_311_mudrok', effects: { mudrok_buff_01_hit: 'mudrok_buff_01_hit_x#1' } },
  },
  files: { 'a_birth_boc#1': 'skin/a/a_birth_boc-1.json', 'a_attack_hit_boc#1': 'skin/a/a_attack_hit_boc-1.json', 'a_kid': 'skin/a/a_kid.json',
    'shotst_skill_02_trail_x#1': 'skin/shotst/shotst_skill_02_trail_x-1.json', 'shotst_skill_01_hit_x#1': 'skin/shotst/shotst_skill_01_hit_x-1.json',
    'reed2_debuff_boom_01_x#1': 'skin/reed2/reed2_debuff_boom_01_x-1.json', 'mudrok_buff_01_hit_x#1': 'skin/mudrok/mudrok_buff_01_hit_x-1.json' },
  projectileEffects: { projectile_a: ['A_Trail'], projectile_a_graphic: ['a_trail'], projectile_a_s2: ['a_s2_trail'], projectile_shotst_s2: ['shotst_skill_02_trail'] },
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

const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const MODES = read('tools/assets/local-char-modes.json');
const CHESS = read('data/chess.json');
const chessOf = (charId) => Object.values(CHESS.chess || CHESS).find((c) => c?.charId === charId);
const BIND = (id) => Object.fromEntries(['modes', 'skillMode', 'cast', 'hit', 'hitGroups', 'tgtStart', 'trail', 'skills'].filter((k) => k in MODES[id]).map((k) => [k, MODES[id][k]]));
const files = {
  '/assets/local/fx/index.json': { bundles: { a: ['a_attack_hit', 'a_trail'], common: ['common_char_birth_01'], shotst: ['shotst_skill_02_trail', 'shotst_skill_01_hit'],
    reed2: ['reed2_debuff_boom_01'], mudrok: ['mudrok_buff_01_hit'] } },
  '/assets/local/fx/modes.json': { char_126_shotst: BIND('char_126_shotst') },
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

// The client hooks an effect by the unit that creates it, not the one it sits on (BattleController.CreateEffect → source
// TryHookEffect; a buff's effect by the buff's source, Entity.AddBuffEffect; a projectile by its source, CreateProjectile →
// TryHookProjectile, and its main effect, Projectile._CreateMainEffect).
async function withSkinLayer(run) {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, unitDef: (info) => chessOf(info.defId) ?? null, trace: (p) => seen.push(p) });
    await settle();
    await run({ layer, seen, take: (kind) => seen.splice(0).filter((p) => p.kind === kind).map((p) => `${p.names.join('+')}${p.at != null ? `@${p.at}` : ''}`) });
  } finally { globalThis.fetch = fetch0; }
}
const op = (id, defId, skinKey = null, skillIndex = 0) => ({ id, x: 0, y: 0, alive: true, skinKey, info: { id, side: 'ally', defId, skillIndex, kind: 'op' } });
const foe = (id, x) => ({ id, x, y: 0, alive: true, info: { id, side: 'enemy', defId: 'enemy_x' } });

test('a skill projectile shot without an attack (skillShotOut) is its shooter\'s: a skin\'s pairs, its fake projectile', () => withSkinLayer(async ({ layer, take }) => {
  for (const [sk, want, why] of [[null, ['shotst_skill_02_trail'], 'the default model'],
    ['char_126_shotst@x#1', ['shotst_skill_02_trail_x#1'], `${RULE}: 流星 S2's volley arrow, ownerless, through her skin's pairs`],
    ['char_126_shotst@y#2', [], `${RULE}: a fake projectile without an effect draws no arrow`]]) {
    const views = new Map([[1, op(1, 'char_126_shotst', sk, 1)], [8, foe(8, 2)]]);
    layer.onEvent(['skill', 1, 1], views);
    await settle();
    take('spawn');
    layer.onEvent(['fx', 'volley', 0, 0, { id: 1, targets: [8], skill: 'shotst_2' }], views);
    await settle();
    assert.deepEqual(take('spawn'), want, why);
    layer.update(0.6);
    await settle();
    assert.deepEqual(take('attackHit'), [`${sk === 'char_126_shotst@x#1' ? 'shotst_skill_01_hit_x#1' : 'shotst_skill_01_hit'}@8`], `${why}: its hit still lands`);
    layer.onEvent(['skillEnd', 1, 1], views);
  }
}));

test('a status effect is its applier\'s: the applier\'s skin on an enemy, not the holder\'s skin for another\'s buff', () => withSkinLayer(async ({ layer, take }) => {
  const skinned = op(2, 'char_1_a', SK), plain = op(3, 'char_1_a'), enemy = foe(9, 1);
  layer.statusOn(enemy, 'a', 'a_attack_hit', 'k1', 0, null, false, false, false, skinned);
  layer.statusOn(skinned, 'a', 'a_attack_hit', 'k2', 0, null, false, false, false, plain);
  layer.statusOn(skinned, 'a', 'a_attack_hit', 'k3');
  await settle();
  assert.deepEqual(take('status').sort(), ['a_attack_hit', 'a_attack_hit_boc#1', 'a_attack_hit_boc#1'],
    `${RULE}: on the enemy by the skin unit = the skin's; on the skin unit by another = the default; its own = the skin's`);
  layer.statusOnce(enemy, 'a', 'a_attack_hit', skinned);
  await settle();
  assert.deepEqual(take('statusEnd'), ['a_attack_hit_boc#1'], 'a buff\'s end effect too');
}));

test('syncStatusFx hands the effect layer each status effect\'s applier (null once it left the field), else the holder', () => {
  const calls = [];
  const fx = { statusReady: () => true, statusOn: (v, b, n, k, ...rest) => { calls.push([v.id, k, rest[5] === undefined ? 'none' : rest[5]?.id ?? null]); (v._fxStatusOn ||= new Set()).add(k); },
    statusOff: (v, k) => v._fxStatusOn.delete(k), statusOnce: () => {} };
  const holder = { ...foe(9, 1), flags: 0, statuses: new Set(['stun']), statusFrom: new Map([['stun', { src: 'a', id: 2, fx: null, n: 0 }]]) };
  const other = { ...foe(8, 1), flags: 0, statuses: new Set(['stun']), statusFrom: new Map([['stun', { src: 'a', id: 5, fx: null, n: 0 }]]) };
  const own = { ...foe(7, 1), flags: 0, statuses: new Set(['stun']) };
  syncStatusFx(new Map([[2, op(2, 'char_1_a', SK)], [9, holder], [8, other], [7, own]]), fx, true);
  assert.deepEqual(calls, [[9, 'stun', 2], [8, 'stun', null], [7, 'stun', 7]], `${RULE}: the applier's view (id 5 is gone: null), the holder without one`);
});

test('a kit event\'s effect made by an operator but owned by none or by its target is the maker\'s: a skin\'s pairs (spawn `hook`)', () => withSkinLayer(async ({ layer, take }) => {
  // 焰影苇草 S3's burst where a 灼痕 enemy died (no owner, on a point); 泥岩's layer blocking a hit (her own buff, on her: the
  // BlockDamage `_useSource` BUFF_OWNER)
  for (const [sk, want] of [[null, 'reed2_debuff_boom_01'], ['char_1020_reed2@x#1', 'reed2_debuff_boom_01_x#1']]) {
    layer.onEvent(['fx', 'scorchBurst', 1, 0, { id: 4 }], new Map([[4, op(4, 'char_1020_reed2', sk)]]));
    await settle();
    assert.deepEqual(take('spawn'), [want], `${RULE} 「만든 쪽」: the burst is hers (skin ${sk})`);
  }
  for (const [sk, want] of [[null, 'mudrok_buff_01_hit'], ['char_311_mudrok@x#1', 'mudrok_buff_01_hit_x#1']]) {
    layer.onEvent(['fx', 'parry', 0, 0, { id: 5, buff: 'mudrok:layers', whole: 1 }], new Map([[5, op(5, 'char_311_mudrok', sk)]]));
    await settle();
    assert.deepEqual(take('spawn'), [want], `${RULE} 「만든 쪽」: her layer's block effect is hers (skin ${sk})`);
  }
}));

// Every spawn() call of the effect layer either hands the unit that makes the effect (`hook`) or is listed here with why it
// needs none — a new kit branch that plays an operator's effect without an owner (or on its target) would show the default
// effect under a skin. Counted per enclosing function: a function whose calls change updates its count.
const OWNER = 'its owner is the unit that makes it', ENEMY = 'an enemy\'s or a map\'s: no skin';
const NO_HOOK = {
  onEmitPlay: [1, 'a playing effect\'s OnPlay/OnFinish emitters: named by its prefab (a skin prefab names its own), the parent\'s owner'],
  tplFx: [3, 'a mode template\'s CreateEffect: no skin pairs a template effect (skin-effects.json)'],
  palsyFx: [1, 'the sim\'s palsy names no applier'], burstFx: [1, 'the sim\'s element burst names no applier'],
  judgeShield: [1, OWNER], pendingHit: [1, OWNER], cabinMark: [1, OWNER], pickFx: [8, OWNER], officialKitFx: [1, OWNER],
  chargeSync: [1, OWNER], chargeStore: [1, OWNER], svashBird: [1, OWNER], edgeLines: [1, OWNER], droneIdle: [1, OWNER],
  kitFx: [1, OWNER], skillEnd: [1, OWNER], foeFx: [1, OWNER], tokenAura: [1, OWNER], flushDeploys: [1, OWNER],
  moduleFx: [1, OWNER], alwaysOn: [1, OWNER], defaultModeFx: [1, OWNER],
  exposeFx: [1, ENEMY], eplay: [1, ENEMY], emortarFx: [2, ENEMY], emortarLand: [1, ENEMY], dshellFx: [1, ENEMY],
  dshellBlast: [1, ENEMY], eprojTelegraph: [1, ENEMY], eshotBlast: [1, ENEMY], cannonBlast: [1, ENEMY], eprojAreaFx: [2, ENEMY],
  stepSand: [1, ENEMY], acRainFx: [1, ENEMY], soulFx: [2, ENEMY], ecolumnFx: [1, ENEMY], eholdBuff: [1, ENEMY], efaithFx: [1, ENEMY],
  stepBountyMarks: [1, ENEMY], stepStageTiles: [1, ENEMY], erebornAbility: [1, ENEMY], eblinkFx: [1, `${ENEMY} (the band tiles below it)`],
};
test('every spawn() of the effect layer names the unit that makes its effect, or is listed with why not', () => {
  const src = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
  const lines = src.split('\n'), starts = [0];
  for (const l of lines) starts.push(starts[starts.length - 1] + l.length + 1);
  const unhooked = {};
  let calls = 0, hooked = 0;
  lines.forEach((ln, i) => {
    if (/^\s*(\/\/|\*|\/\*\*)/.test(ln)) return;
    for (const m of ln.matchAll(/(?<![.\w])spawn\(/g)) {
      if (/function\s+spawn\($/.test(ln.slice(0, m.index + 6))) continue;
      let depth = 0, j = starts[i] + m.index + 5, call = '';
      for (; j < src.length; j++) { const c = src[j]; call += c; if (c === '(') depth++; else if (c === ')' && !--depth) break; }
      calls++;
      if (/\bhook\b/.test(call)) { hooked++; continue; }
      let fn = '?';
      for (let k = i; k >= 0; k--) { const f = /^\s*(?:async\s+)?function\s+(\w+)/.exec(lines[k]); if (f) { fn = f[1]; break; } }
      unhooked[fn] = (unhooked[fn] || 0) + 1;
    }
  });
  assert.ok(calls > 80 && hooked >= 40, `the sweep found ${calls} spawn() calls, ${hooked} with a hook`);
  const want = Object.fromEntries(Object.entries(NO_HOOK).map(([k, [n]]) => [k, n]));
  assert.deepEqual(unhooked, want, `${RULE} 「만든 쪽」: a spawn() without \`hook\` outside this list — hand it the unit that makes the effect `
    + '(the client hooks every effect by its source), or list the function here with why it needs none');
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
