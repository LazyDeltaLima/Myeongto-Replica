// The extractors' skin dimension (docs/rules/render.md 「스킨 모델 소재」 — 「스킨마다 따라오는 것」). A skin model has its own
// key table, attach points and effect replacements in its prefab of skinpack/<owner>.ab: tools/local-extract/anim_keys.py
// `skins` (.cache/anim-keys.json), char_points.py (public/assets/local/fx/skin/skin-points.json) and fx_extract.py --skin-pairs
// (public/assets/local/fx/skin/skin-effects.json, the prefab's CharacterSkinHooker) read them for every skin model skins.json lists,
// so a drawn skin never borrows the default model's keys or points. The battle stays timed by the default model: the attack
// timing reads the default table only. The Python helpers run without UnityPy; the real-output sweep skips when nothing was
// extracted on this machine.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(ROOT, 'tools/local-extract');
const PY = ['python3', 'python'].find((bin) => spawnSync(bin, ['--version']).status === 0);
const ENV = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
const RULE = 'docs/rules/render.md 「스킨 모델 소재」';

/** Run python code with the extract tools on the path; returns [exit status, parsed JSON stdout or stderr]. */
function py(code) {
  const src = `import sys, json\nsys.path.insert(0, ${JSON.stringify(TOOL)})\n${code}`;
  const r = spawnSync(PY, ['-c', src], { encoding: 'utf8', env: ENV });
  return r.status === 0 ? JSON.parse(r.stdout) : { error: r.stderr };
}

const tree = (hook) => [['skin_x', { _animations: [] }, 1], ['skin_x', hook, 2]];

describe('fx_extract.skin_hook: a skin prefab\'s CharacterSkinHooker (no UnityPy needed)', { skip: !PY && 'no python3' }, () => {
  test('effect pairs become { from: to }, fake projectiles keep their drawn / logic keys and muzzle point', () => {
    const got = py(`import fx_extract as f\nprint(json.dumps(f.skin_hook(${JSON.stringify(tree({
      _replaceEffectPairs: [{ fromEffect: 'x_hit', toEffect: 'x_hit_boc#1' }, { fromEffect: 'x_hit', toEffect: 'x_hit_boc#1' },
        { fromEffect: 'common_char_birth_01', toEffect: 'x_birth_boc#1' }, { fromEffect: '', toEffect: 'y' }],
      _useFakeProjectile: 1,
      _fakeProjectileConfigs: [{ originProjectileKey: 'p', graphicProjectileKey: 'p_graphic', logicProjecitleKey: 'p_logic', _fakeMuzzlePoint: 12 }],
    }))})))`);
    assert.deepEqual(got, {
      effects: { common_char_birth_01: 'x_birth_boc#1', x_hit: 'x_hit_boc#1' },
      projectiles: [{ from: 'p', graphic: 'p_graphic', logic: 'p_logic', muzzle: 12 }],
    });
  });

  test('a skin without a hooker keeps the default effects; projectile configs without _useFakeProjectile are not used', () => {
    assert.deepEqual(py(`import fx_extract as f\nprint(json.dumps(f.skin_hook([['skin_x', {'_animations': []}, 1]])))`), {});
    assert.deepEqual(py(`import fx_extract as f\nprint(json.dumps(f.skin_hook(${JSON.stringify(tree({
      _replaceEffectPairs: [], _useFakeProjectile: 0, _fakeProjectileConfigs: [{ originProjectileKey: 'p' }] }))})))`), {});
  });

  test('one key paired with two effects stops the run (which one the client takes is not read)', () => {
    const got = py(`import fx_extract as f\nprint(json.dumps(f.skin_hook(${JSON.stringify(tree({
      _replaceEffectPairs: [{ fromEffect: 'x_hit', toEffect: 'x_hit_a#1' }, { fromEffect: 'x_hit', toEffect: 'x_hit_b#1' }] }))})))`);
    assert.match(got.error || '', /x_hit replaced by both/, `${RULE}: a conflicting pair must stop fx_extract --skin-pairs`);
  });
});

describe('the battle is timed by the default model only (no UnityPy needed)', { skip: !PY && 'no python3' }, () => {
  test('client_path.skin_keys reads the default skin table, never the skin models\' `skins`', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'skin-dims-'));
    try {
      mkdirSync(path.join(dir, '.cache'));
      writeFileSync(path.join(dir, '.cache/anim-keys.json'), JSON.stringify({
        ops: { char_x: { skin: { keys: { Attack: 'Attack_1' }, mix: [] } } },
        skins: { 'char_x@boc#1': { owner: 'char_x', keys: { Attack: 'Attack_9' }, mix: [] } },
      }));
      const got = py(`import client_path as c\nfrom pathlib import Path\nc.ROOT = Path(${JSON.stringify(dir)})\nprint(json.dumps(c.skin_keys()))`);
      assert.deepEqual(got, { char_x: { Attack: 'Attack_1' } },
        `${RULE}: attack_timing.py takes its clips from skin_keys(); a skin model's table there would time the battle by a skin`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

const read = (rel) => { const p = path.join(ROOT, rel); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };
const skinList = read('public/assets/local/spine/skin/skins.json');
const outputs = {
  'anim_keys.py (.cache/anim-keys.json `skins`)': read('.cache/anim-keys.json')?.skins,
  'char_points.py (public/assets/local/fx/skin/skin-points.json)': read('public/assets/local/fx/skin/skin-points.json'),
  'fx_extract.py --skin-pairs (public/assets/local/fx/skin/skin-effects.json)': read('public/assets/local/fx/skin/skin-effects.json')?.skins,
};

describe('every skin model has its own keys, points and effect pairs (the extracted outputs)', () => {
  for (const [tool, rows] of Object.entries(outputs)) {
    test(tool, { skip: (!skinList || !rows) && 'not extracted on this machine' }, () => {
      const keys = Object.keys(skinList.skins);
      assert.ok(keys.length > 300, 'the skin list is the full one');
      const lacking = keys.filter((k) => !rows[k]);
      assert.deepEqual(lacking, [], `${RULE}: ${tool} has no row for these skin models — re-run it after skin_extract.py, or they draw with the default model's`);
      assert.deepEqual(Object.keys(rows).filter((k) => !skinList.skins[k]), [], `${tool}: rows of skins skins.json no longer lists`);
      for (const k of keys) {
        if (rows[k].owner !== undefined) assert.equal(rows[k].owner, skinList.skins[k].owner, `${tool}: ${k} owner`);
      }
    });
  }

  test('a known skin: 사리아 boc#1 plays its heal through its own clip, 스카디 더 커럽팅 하트 boc#4 swaps its effects', { skip: (!skinList || Object.values(outputs).some((r) => !r)) && 'not extracted on this machine' }, () => {
    const [keys, points, effects] = Object.values(outputs);
    assert.equal(keys['char_202_demkni@boc#1']?.keys?.Heal, 'Attack_2');
    assert.equal(points['char_202_demkni@boc#1']?.muzzle?.F?.bone, 'F_muzzle', 'the skin\'s own muzzle bone (the default model\'s is F_Muzzle)');
    assert.equal(effects['char_1012_skadi2@boc#4']?.effects?.skadi2_skill_01_hit, 'skadi2_skill_01_hit_boc#4');
  });
});

// The skin effects' own prefabs (fx_extract.py --skin-effects, maintainer decision 2026-11-17: the skin data pack holds
// them). They live under fx/skin/ — apart from the default bundles' folders, whose clean-up deletes the variant names and
// whose index render/fxmap.js groups by name — with the textures / meshes only they use; what a default effect uses too
// stays in the shared fx/tex/ and fx/mesh/.
const SKIN_FX = 'docs/rules/render.md 「스킨 모델 소재」 — 「스킨 이펙트 프리팹」';

describe('fx_extract.py --skin-effects: where the skin effects go (no UnityPy needed)', { skip: !PY && 'no python3' }, () => {
  test('skin_effect_plan: each effect from the client of its skin\'s model, else the other; drawn projectiles by their _mainEffect', () => {
    const got = py(`import fx_extract as f
rows = {'a@x#1': {'effects': {'a_hit': 'a_hit_x#1', 'common_char_birth_01': 'a_birth_x#1'}, 'projectiles': [{'from': 'p', 'graphic': 'P_x#1'}, {'from': 'q', 'graphic': 'q_line_x#1'}]},
        'b@y#2': {'effects': {'b_hit': 'b_hit_y#2', 'b_gone': 'b_gone_y#2'}}}
skins = {'a@x#1': {'client': 'en'}, 'b@y#2': {'client': 'cn'}}
names = {'en': {'a_hit_x#1': 'battle/prefabs/effects/a.ab', 'a_birth_x#1': 'battle/prefabs/effects/a.ab', 'b_hit_y#2': 'battle/prefabs/effects/b.ab', 'p_fly_x#1': 'pkgrps/btl_pfb_fx_token_1.ab'},
         'cn': {'b_hit_y#2': 'battle/prefabs/effects/b.ab'}}
carriers = {'en': {'p_fly_x#1': {'p_x#1': True}, 'p_trail': {'p': False}}, 'cn': {}}
p = f.skin_effect_plan(rows, skins, names, carriers)
print(json.dumps({'jobs': {'|'.join(k): v for k, v in p['jobs'].items()}, 'proj': p['proj'], 'missing': p['missing']}))`);
    assert.deepEqual(got, {
      jobs: { 'cn|battle/prefabs/effects/b.ab': ['b_hit_y#2'], 'en|battle/prefabs/effects/a.ab': ['a_birth_x#1', 'a_hit_x#1'], 'en|pkgrps/btl_pfb_fx_token_1.ab': ['p_fly_x#1'] },
      proj: { 'P_x#1': ['p_fly_x#1'], p: ['p_trail'] },
      missing: { effects: ['b_gone_y#2'], projectiles: ['q_line_x#1'] },
    }, `${SKIN_FX}: the CN skin's effect comes from the CN client, a summon's from its token pack; what no client has is listed missing; the replaced projectile's own trail is named (not extracted again)`);
  });

  test('a skin effect\'s file is under fx/skin/ named through file_name; a default bundle may not take the folder\'s name', () => {
    const got = py(`import fx_extract as f, types
from pathlib import Path
f.OUT = Path('/x/fx')
r = [str(f.prefab_file(f.OUT / f.SKIN_DIR, 'skadi2', 'skadi2_skill_01_hit_boc#4')), str(f.prefab_file(f.OUT, 'skadi2', 'skadi2_skill_01_hit'))]
try:
    f.Extractor.run(types.SimpleNamespace(), 'skin'); r.append(None)
except SystemExit as e:
    r.append(str(e))
print(json.dumps(r))`);
    assert.deepEqual(got.slice(0, 2), ['/x/fx/skin/skadi2/skadi2_skill_01_hit_boc-4.json', '/x/fx/skadi2/skadi2_skill_01_hit.json'], SKIN_FX);
    assert.match(got[2] || '', /may not be named 'skin'/, `${SKIN_FX}: a default bundle named skin would mix with the skin effects`);
  });

  test('place_skin_files: shared files stay shared, skin-only ones go under skin/ with their wrap, unreferenced skin files go', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'skin-fx-'));
    try {
      const w = (rel, body) => { mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); writeFileSync(path.join(dir, rel), typeof body === 'string' ? body : JSON.stringify(body)); };
      w('a/a_hit.json', { materials: { m: { img: 'both.webp' } }, nodes: [{ mesh: 'mboth' }] });
      w('skin/a/a_hit_x-1.json', { materials: { m: { img: 'both.webp' }, n: { img: 'once.webp' }, o: { img: 'mine.webp' } }, nodes: [{ mesh: 'mmine' }, { skin: { mesh: 'monce' } }] });
      for (const t of ['both', 'once', 'gone']) w(`tex/${t}.webp`, t);
      for (const t of ['mine', 'both', 'stale']) w(`skin/tex/${t}.webp`, t);
      w('tex/wrap.json', { 'once.webp': [1, 1], 'gone.webp': [1, 0] });
      for (const m of ['mboth', 'monce']) w(`mesh/${m}.json`, { pos: [] });
      w('skin/mesh/mmine.json', { pos: [] });
      const got = py(`import fx_extract as f, os
from pathlib import Path
f.OUT = Path(${JSON.stringify(dir)})
r = [list(f.place_skin_files())]
ls = lambda d: sorted(os.listdir(f.OUT / d)) if (f.OUT / d).exists() else []
r += [ls('tex'), ls('skin/tex'), ls('mesh'), ls('skin/mesh')]
r.append(list(f.place_skin_files(prune_shared=True)))
r += [ls('tex'), json.loads((f.OUT / 'skin/tex/wrap.json').read_text())]
print(json.dumps(r))`);
      assert.deepEqual(got[0], [3, 1], 'moved: once.webp, monce.json; the skin copy of both.webp; deleted: stale.webp');
      assert.deepEqual(got[1], ['both.webp', 'gone.webp', 'wrap.json'], `${SKIN_FX}: a texture a default effect uses stays shared; without --prune nothing shared is deleted`);
      assert.deepEqual(got[2], ['mine.webp', 'once.webp', 'wrap.json'], `${SKIN_FX}: a texture only skin effects use is the skin pack's`);
      assert.deepEqual([got[3], got[4]], [['mboth.json'], ['mmine.json', 'monce.json']], `${SKIN_FX}: meshes follow the same rule`);
      assert.deepEqual(got[5], [0, 1], '--prune: the shared texture nothing uses goes');
      assert.deepEqual(got[6], ['both.webp', 'wrap.json']);
      assert.deepEqual(got[7], { 'once.webp': [1, 1] }, 'a moved texture keeps its wrap mode, in the skin folder\'s wrap.json');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

const FXD = path.join(ROOT, 'public/assets/local/fx');
const skinIndex = read('public/assets/local/fx/skin/index.json');
describe('the extracted skin effects (fx/skin/)', { skip: (!skinIndex || !outputs[Object.keys(outputs)[2]]) && 'not extracted on this machine' }, () => {
  test('every paired skin effect has its file or is listed missing; their textures and meshes are in one of the two folders', () => {
    const doc = read('public/assets/local/fx/skin/skin-effects.json');
    const files = doc.files || {};
    const lower = new Map(Object.entries(files).map(([k, v]) => [k.toLowerCase(), v]));
    const missing = new Set((doc.missing?.effects || []).map((n) => n.toLowerCase()));
    const lacking = [...new Set(Object.values(doc.skins).flatMap((r) => Object.values(r.effects || {})))].filter((n) => !lower.has(n.toLowerCase()) && !missing.has(n.toLowerCase()));
    assert.deepEqual(lacking, [], `${SKIN_FX}: run fx_extract.py --skin-effects after --skin-pairs`);
    assert.equal(files['skadi2_skill_01_hit_boc#4'], 'skin/skadi2/skadi2_skill_01_hit_boc-4.json', 'a known case ran: 스카디 더 커럽팅 하트 boc#4');
    const own = { tex: new Set(skinIndex.tex), mesh: new Set(skinIndex.mesh) };
    const absent = [];
    const both = [...own.tex].filter((t) => existsSync(path.join(FXD, 'tex', t)));
    for (const rel of new Set(Object.values(files))) {
      const p = path.join(FXD, rel);
      if (!existsSync(p)) { absent.push(rel); continue; }
      const s = readFileSync(p, 'utf8');
      const at = (kind, file, mine) => existsSync(mine ? path.join(FXD, 'skin', kind, file) : path.join(FXD, kind, file));
      for (const [, t] of s.matchAll(/"img":"([^"]+)"/g)) if (!at('tex', t, own.tex.has(t))) absent.push(`${rel} → tex ${t}`);
      for (const [, m] of s.matchAll(/"mesh":"([^"]+)"/g)) if (!at('mesh', `${m}.json`, own.mesh.has(m))) absent.push(`${rel} → mesh ${m}`);
    }
    assert.deepEqual(absent.slice(0, 20), [], `${SKIN_FX}: a skin effect's file is missing (rerun --skin-effects, or --skin-finish after a --prune)`);
    assert.deepEqual(both, [], `${SKIN_FX}: a texture in both folders (fx_extract.py --skin-finish moves it)`);
  });
});
