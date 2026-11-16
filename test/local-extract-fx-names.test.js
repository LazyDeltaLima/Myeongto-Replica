// tools/local-extract/fx_extract.py: the names of the shared effect files (fx/tex/, fx/mesh/; docs/rules/fx.md
// 「텍스처·메시 파일 이름」). They are the official object names, and skin textures carry `#` (`mask_28_sale#10`,
// `ines_##_mask_02`), which a URL reads as a fragment: the browser's resource list refuses such paths
// (public/js/resources.js validPath), so 98 textures were never pre-downloaded nor cached. file_name() names every
// texture and mesh file (`#` → `-`, a character the list refuses stops the run) and claim() stops two names meeting in
// one file. The Python helpers run without UnityPy; the real-output sweep skips when nothing was extracted here.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validPath } from '../public/js/resources.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(ROOT, 'tools/local-extract');
const FX = path.join(ROOT, 'public/assets/local/fx');
const PY = ['python3', 'python'].find((bin) => spawnSync(bin, ['--version']).status === 0);
const ENV = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
const RULE = 'docs/rules/fx.md 「텍스처·메시 파일 이름」';

/** Run python code with fx_extract imported as `fe`; returns the parsed JSON it prints. */
function py(code) {
  const src = `import sys, json, types\nsys.path.insert(0, ${JSON.stringify(TOOL)})\nimport fx_extract as fe\n${code}`;
  const r = spawnSync(PY, ['-I', '-c', src], { encoding: 'utf8', env: ENV });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

/** The messages of the calls that stop (SystemExit), null for those that return. */
function stops(call, args) {
  return py(`
r = []
for a in ${JSON.stringify(args)}:
    try:
        ${call}; r.append(None)
    except SystemExit as e:
        r.append(str(e))
print(json.dumps(r))`);
}

describe('fx_extract.py file names (no UnityPy needed)', { skip: !PY && 'no python3' }, () => {
  test('file_name: `#` becomes `-`, other names stay, and every result is a path the browser resource list keeps', () => {
    const names = ['mask_28_sale#10_438bbf7a', 'ines_##_mask_02_ac6ce0b1', 'GUA-X_c968850d', 'dugago _2_1_5b075783', '平面.001_4277852e', 'asd:Plane001_8a4857b1'];
    const out = py(`print(json.dumps([fe.file_name(n) for n in ${JSON.stringify(names)}]))`);
    assert.deepEqual(out, ['mask_28_sale-10_438bbf7a', 'ines_--_mask_02_ac6ce0b1', 'GUA-X_c968850d', 'dugago _2_1_5b075783', '平面.001_4277852e', 'asd:Plane001_8a4857b1']);
    for (const n of out) assert.ok(validPath(`/assets/local/fx/tex/${n}.webp`), `${n}: refused by resources.js validPath (${RULE})`);
    // the raw name is what the list refuses: the reason the rule exists
    assert.equal(validPath(`/assets/local/fx/tex/${names[0]}.webp`), false);
  });

  test('file_name stops on a character the resource list refuses, a path separator and an empty or dots-only name', () => {
    const out = stops('fe.file_name(a)', ['a?b', 'a%23', 'a\\b', 'a/b', 'a\nb', '', '..']);
    out.forEach((msg, i) => assert.ok(msg && msg.includes('텍스처·메시 파일 이름'), `case ${i}: file_name must stop the run (${RULE})`));
  });

  test('claim: two object names that meet in one file name stop the run; the same name again is the same file', () => {
    const out = py(`
ex = types.SimpleNamespace(named={})
claim = lambda k: fe.Extractor.claim(ex, k, fe.file_name(k) + '.webp')
r = [claim('a#1_00000001'), claim('a#1_00000001')]
try:
    claim('a-1_00000001'); r.append(None)
except SystemExit as e:
    r.append(str(e))
print(json.dumps(r))`);
    assert.equal(out[0], 'a-1_00000001.webp');
    assert.equal(out[1], out[0]);
    assert.ok(out[2] && out[2].includes('텍스처·메시 파일 이름'), `a#1 and a-1 must not share a file (${RULE})`);
  });
});

describe('the extracted effect files (skips without a local extraction)', () => {
  const dirs = ['tex', 'mesh'].map((d) => path.join(FX, d)).filter((d) => existsSync(d));
  test('every file under local/fx is a path the browser resource list keeps', { skip: !dirs.length && 'no local effect extraction' }, () => {
    const bad = [];
    let seen = 0;
    const walk = (dir) => {
      for (const n of readdirSync(dir)) {
        const abs = path.join(dir, n);
        if (statSync(abs).isDirectory()) walk(abs);
        else {
          seen++;
          const p = '/assets/' + path.relative(path.join(ROOT, 'public/assets'), abs).split(path.sep).join('/');
          if (!validPath(p)) bad.push(p);
        }
      }
    };
    walk(FX);
    assert.ok(seen > 100, `only ${seen} files under local/fx: the sweep did not run`);
    assert.deepEqual(bad.slice(0, 10), [], `${bad.length} effect file(s) the resource list refuses — never pre-downloaded nor cached; name them through fx_extract.file_name (${RULE})`);
  });
});
