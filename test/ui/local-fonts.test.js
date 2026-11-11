// The official HUD number font (docs/rules/ui.md 「HUD 숫자 글꼴」): the client's HUD Text nodes name Novecentowide-Medium
// at runtime (DynFontLoader); the public font source has Novecento Wide Normal only, so the local extraction copies the
// client's Font asset (tools/local-extract/extract.py FONT_NAMES → fonts/) and the page registers it as 'Novecento Wide'
// weight 500 (public/js/ui/localFonts.js). The HUD CSS asks for that face; without the file the Normal one draws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { installLocalFonts, LOCAL_FONTS } from '../../public/js/ui/localFonts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOOL = path.join(ROOT, 'tools/local-extract');
const PY = ['python3', 'python'].find((bin) => spawnSync(bin, ['--version']).status === 0);
const ENV = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };

const MANIFEST = { groups: { fonts: { 'Novecentowide-Medium': { path: '/assets/local/fonts/novecento-wide-medium.otf', kind: 'Font', bytes: 46560 } } } };

/** A document stand-in: its FontFaceSet and a FontFace constructor that records what it was given. */
function fakeDoc() {
  const faces = [];
  class Face {
    constructor(family, src, desc) { this.family = family; this.src = src; this.desc = desc; this.loads = 0; }
    load() { this.loads++; return Promise.resolve(this); }
  }
  return { doc: { fonts: { add: (f) => faces.push(f) } }, Face, faces };
}

test('installLocalFonts: the manifest\'s Novecentowide-Medium becomes \'Novecento Wide\' weight 500, once per document', () => {
  assert.deepEqual(LOCAL_FONTS.map((f) => [f.name, f.family, f.weight]), [['Novecentowide-Medium', 'Novecento Wide', '500']]);
  const { doc, Face, faces } = fakeDoc();
  assert.deepEqual(installLocalFonts(MANIFEST, doc, Face), ['Novecento Wide 500']);
  assert.equal(faces.length, 1);
  assert.equal(faces[0].family, 'Novecento Wide');
  assert.equal(faces[0].src, 'url("/assets/local/fonts/novecento-wide-medium.otf")');
  assert.deepEqual(faces[0].desc, { weight: '500', style: 'normal', display: 'swap' });
  assert.equal(faces[0].loads, 1, 'loaded right away (a failure leaves the Normal face)');
  assert.deepEqual(installLocalFonts(MANIFEST, doc, Face), [], 'a second call adds nothing');
  assert.equal(faces.length, 1);
});

test('installLocalFonts: nothing without the entry, outside /assets/local, or without FontFace / document.fonts', () => {
  const { doc, Face, faces } = fakeDoc();
  assert.deepEqual(installLocalFonts(null, doc, Face), []);
  assert.deepEqual(installLocalFonts({ groups: {} }, doc, Face), []);
  assert.deepEqual(installLocalFonts({ groups: { fonts: { 'Novecentowide-Medium': { path: 'https://example.com/x.otf' } } } }, doc, Face), []);
  assert.deepEqual(installLocalFonts(MANIFEST, { fonts: null }, Face), []);
  assert.deepEqual(installLocalFonts(MANIFEST, doc, undefined), []);
  assert.equal(faces.length, 0);
});

test('the app and the dev mock register the local fonts with the local-art manifest', () => {
  assert.match(readFileSync(path.join(ROOT, 'public/js/main.js'), 'utf8'), /data\.load\('local'\)\.then\(\(m\) => installLocalFonts\(m\)\)/);
  assert.match(readFileSync(path.join(ROOT, 'public/dev/game-mock.js'), 'utf8'), /data\.load\('local'\)\.then\(\(m\) => installLocalFonts\(m\)\)/);
});

test('HUD CSS: the bond disc count is Novecento Wide 500 at the prefab\'s 16; the dialog numbers and the round / LP / kill counters 500', () => {
  const css = readFileSync(path.join(ROOT, 'public/css/hud-art.css'), 'utf8');
  const rule = (sel) => {
    const i = css.indexOf(`${sel} {`);
    assert.ok(i >= 0, sel);
    return css.slice(i, css.indexOf('}', i));
  };
  const count = rule('.gm.has-hud-art .bslot .bond__count');
  assert.match(count, /font-size: calc\(var\(--u\) \* 16\)/);
  assert.match(count, /font-family: 'Novecento Wide', var\(--font-num\); font-weight: 500/);
  const counters = rule('.gm.has-hud-art .roundbox__num, .gm.has-hud-art .capsule__kills, .gm.has-hud-art .gtop__center .lp--lg');
  assert.match(counters, /font-family: 'Novecento Wide', var\(--font-num\); font-weight: 500/);
  for (const sel of ['.gm.has-hud-art .bpop__need b', '.gm.has-hud-art .bpop__stack b']) assert.match(rule(sel), /'Novecento Wide'[^;]*;[^]*font-weight: 500/, sel);
});

test('extract.py: the font job is listed, and the *_Data folder is found above either client\'s bundle root', { skip: !PY && 'no python3' }, () => {
  const r = spawnSync(PY, [path.join(TOOL, 'extract.py'), '--print-jobs'], { encoding: 'utf8', env: ENV });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).fonts, { from: '<game>_Data/*.assets', sub: 'fonts', names: { 'Novecentowide-Medium': 'novecento-wide-medium' } });
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'sp-fonts-'));
  try {
    const en = path.join(tmp, 'Arknights_Data', 'PersistentData', 'Bundles');
    const cn = path.join(tmp, 'Arknights_Data', 'StreamingAssets', 'AB', 'Windows');
    mkdirSync(en, { recursive: true });
    mkdirSync(cn, { recursive: true });
    const code = `import sys, json\nfrom pathlib import Path\nsys.path.insert(0, ${JSON.stringify(TOOL)})\nimport extract as e\n`
      + `print(json.dumps([str(e.game_data_dir(Path(p))) for p in ${JSON.stringify([en, cn, tmp])}]))`;
    const q = spawnSync(PY, ['-c', code], { encoding: 'utf8', env: ENV });
    assert.equal(q.status, 0, q.stderr);
    const want = path.join(tmp, 'Arknights_Data');
    assert.deepEqual(JSON.parse(q.stdout), [want, want, 'None']);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
