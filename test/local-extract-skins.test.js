// tools/local-extract/skin_extract.py: the operator and summon skin models (docs/rules/render.md 「스킨 모델 소재」).
// The official skin ids carry `#` (`char_202_demkni_boc#1`), which a URL reads as a fragment, so the browser's resource
// list refuses those paths (public/js/resources.js validPath). The extractor names every output through file_name()
// (`#` → `-`, any other unknown character stops the run) and rewrites the atlas to the renamed pages; and the skin folder
// stays out of the pre-download list everyone takes (tools/build-browser-resources.mjs). The Python helpers run without
// UnityPy; the real-output check skips when nothing was extracted on this machine.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validPath } from '../public/js/resources.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(ROOT, 'tools/local-extract');
const PY = ['python3', 'python'].find((bin) => spawnSync(bin, ['--version']).status === 0);
const ENV = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
const RULE = 'docs/rules/render.md 「스킨 모델 소재」';

/** Run python code with `skin_extract` imported as `s`; returns the parsed JSON it prints. */
function py(code) {
  const src = `import sys, json\nsys.path.insert(0, ${JSON.stringify(TOOL)})\nimport skin_extract as s\n${code}`;
  const r = spawnSync(PY, ['-c', src], { encoding: 'utf8', env: ENV });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

describe('skin_extract.py names (no UnityPy needed)', { skip: !PY && 'no python3' }, () => {
  test('file_name: `#` becomes `-`, and the result is a path the browser resource list keeps', () => {
    const names = ['char_202_demkni_boc#1', 'char_202_demkni_ambienceSynesthesia#7.png', 'token_10035_wisdel_wward_sale#14', 'char_2_x_2.png'];
    const out = py(`print(json.dumps([s.file_name(n) for n in ${JSON.stringify(names)}]))`);
    assert.deepEqual(out, ['char_202_demkni_boc-1', 'char_202_demkni_ambienceSynesthesia-7.png', 'token_10035_wisdel_wward_sale-14', 'char_2_x_2.png']);
    for (const n of out) assert.ok(validPath(`/assets/local/spine/skin/x/${n}`), `${n}: refused by resources.js validPath (${RULE})`);
    // the raw id is what the list refuses: the reason the rule exists
    assert.equal(validPath(`/assets/local/spine/skin/x/${names[0]}`), false);
  });

  test('file_name stops on a character it has no rule for (a `-` too: it could make two names one)', () => {
    const bad = ['a-b#1', 'a b', 'a%23', 'a/b', 'a?b', '..', '', 'ä#1'];
    const out = py(`
r = []
for n in ${JSON.stringify(bad)}:
    try:
        s.file_name(n); r.append(None)
    except ValueError as e:
        r.append(str(e))
print(json.dumps(r))`);
    out.forEach((msg, i) => {
      assert.ok(msg, `file_name(${JSON.stringify(bad[i])}) must stop the run (${RULE})`);
      assert.match(msg, /스킨 모델 소재/);
    });
  });

  test('rename_atlas_pages renames the page lines only; region names and fields stay', () => {
    const atlas = 'char_x_boc#1.png\nsize: 4,4\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\nBody#1\n  rotate: false\n  xy: 0, 0\n\nchar_x_boc#1_2.png\nsize: 2,2\nHead\n  xy: 1, 1\n';
    const out = py(`print(json.dumps(s.rename_atlas_pages(${JSON.stringify(atlas)}, {'char_x_boc#1.png': 'char_x_boc-1.png', 'char_x_boc#1_2.png': 'char_x_boc-1_2.png'})))`);
    assert.equal(out, atlas.replace('char_x_boc#1.png', 'char_x_boc-1.png').replace('char_x_boc#1_2.png', 'char_x_boc-1_2.png'));
    assert.match(out, /\nBody#1\n/, 'a region name is not a file and keeps its `#`');
  });

  test('skin_rows: the table\'s own battle prefabs of our operators and summons, with the summon map; DefaultSkin, null and other owners left out', () => {
    const table = {
      charSkins: {
        'char_1_a#1': { charId: 'char_1_a', battleSkin: { skinOrPrefabId: 'DefaultSkin' } },
        'char_1_a@boc#1': { charId: 'char_1_a', battleSkin: { skinOrPrefabId: 'char_1_a_boc#1' }, tokenSkinMap: [{ tokenId: 'token_9_t', tokenSkinId: 'token_9_t_boc#1' }] },
        'char_2_other@x#1': { charId: 'char_2_other', battleSkin: { skinOrPrefabId: 'char_2_other_x#1' } },
        'token_9_t#1': { charId: 'token_9_t', battleSkin: { skinOrPrefabId: null } },
        'token_9_t_boc#1': { charId: 'token_9_t', battleSkin: { skinOrPrefabId: 'token_9_t_boc#1' } },
      },
    };
    const rows = py(`print(json.dumps(s.skin_rows(json.loads(${JSON.stringify(JSON.stringify(table))}), {'char_1_a'}, set())))`);
    assert.deepEqual(rows, [
      { key: 'char_1_a@boc#1', owner: 'char_1_a', prefab: 'char_1_a_boc#1', tokens: { token_9_t: 'token_9_t_boc#1' } },
      { key: 'token_9_t_boc#1', owner: 'token_9_t', prefab: 'token_9_t_boc#1' },
    ]);
  });

  test('skin_rows stops on a prefab of another owner and on two folders that differ only in case', () => {
    const cases = [
      { charSkins: { 'char_1_a@x#1': { charId: 'char_1_a', battleSkin: { skinOrPrefabId: 'char_2_b_x#1' } } } },
      { charSkins: { 'char_1_a@x#1': { charId: 'char_1_a', battleSkin: { skinOrPrefabId: 'char_1_a_x#1' } },
        'char_1_a@X#1': { charId: 'char_1_a', battleSkin: { skinOrPrefabId: 'char_1_a_X#1' } } } },
    ];
    for (const t of cases) {
      const r = py(`
try:
    s.skin_rows(json.loads(${JSON.stringify(JSON.stringify(t))}), {'char_1_a'}, set()); print(json.dumps(None))
except ValueError as e:
    print(json.dumps(str(e)))`);
      assert.ok(r, `skin_rows must stop on ${JSON.stringify(t)} (${RULE})`);
    }
  });
});

describe('the skin folder stays out of the pre-download list', () => {
  test('tools/build-browser-resources.mjs lists an ordinary local file and leaves local/spine/skin/ out', () => {
    const rel = `.cache/test-browser-resources-${process.pid}`;
    const dir = path.join(ROOT, rel);
    try {
      mkdirSync(path.join(dir, 'local/spine/skin/char_1_a/char_1_a_boc-1/front'), { recursive: true });
      mkdirSync(path.join(dir, 'local/spine/token/t'), { recursive: true });
      writeFileSync(path.join(dir, 'local/spine/skin/char_1_a/char_1_a_boc-1/front/char_1_a_boc-1.skel'), 'x');
      writeFileSync(path.join(dir, 'local/spine/skin/skins.json'), '{}');
      writeFileSync(path.join(dir, 'local/spine/token/t/t.skel'), 'y');
      const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/build-browser-resources.mjs'), '--assets', rel], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      const paths = JSON.parse(readFileSync(path.join(dir, 'browser-resources.json'), 'utf8')).files.map((f) => f.p);
      assert.ok(paths.includes('/assets/local/spine/token/t/t.skel'), 'an ordinary local file is listed');
      const skin = paths.filter((p) => p.startsWith('/assets/local/spine/skin/'));
      assert.deepEqual(skin, [], `skin files are taken only by those who choose the skin data, never by everyone (${RULE})`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

const INDEX = path.join(ROOT, 'public/assets/local/spine/skin/skins.json');
describe('extracted skin models (when a local client was extracted)', { skip: !existsSync(INDEX) && 'no extracted skins' }, () => {
  test('every listed file exists and is a path the browser resource list keeps; every skin has a front model', () => {
    const doc = JSON.parse(readFileSync(INDEX, 'utf8'));
    const skins = Object.entries(doc.skins);
    assert.ok(skins.length > 0, 'skins.json lists no skin');
    for (const [key, s] of skins) {
      assert.ok(s.front, `${key}: no front model`);
      for (const side of [s.front, s.back].filter(Boolean)) {
        for (const p of [side.skel, side.atlas, ...side.textures]) {
          assert.ok(validPath(p), `${key}: ${p} is refused by resources.js validPath (${RULE})`);
          assert.ok(existsSync(path.join(ROOT, 'public', p)), `${key}: ${p} missing on disk`);
        }
      }
    }
  });
});
