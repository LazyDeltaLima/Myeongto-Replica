// The extractors' skin dimension (docs/rules/render.md 「스킨 모델 소재」 — 「스킨마다 따라오는 것」). A skin model has its own
// key table, attach points and effect replacements in its prefab of skinpack/<owner>.ab: tools/local-extract/anim_keys.py
// `skins` (.cache/anim-keys.json), char_points.py (public/assets/local/fx/skin-points.json) and fx_extract.py --skin-pairs
// (public/assets/local/fx/skin-effects.json, the prefab's CharacterSkinHooker) read them for every skin model skins.json lists,
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
  'char_points.py (public/assets/local/fx/skin-points.json)': read('public/assets/local/fx/skin-points.json'),
  'fx_extract.py --skin-pairs (public/assets/local/fx/skin-effects.json)': read('public/assets/local/fx/skin-effects.json')?.skins,
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
