// test/content/tile-selectors.test.js — an enemy / token ability whose selector picks a tile is implemented as a tile
// pick, never quietly as a unit pick (规程's 盐坨子炮, 2026-11-14: its TileSelector shoots the farthest tile of its lane,
// the sim shot the lane's top-aggro operator). The abilities come from the extracted bindings
// (tools/assets/local-enemy-bindings.json `sel`, tools/local-extract/enemy_bindings.py), their verdicts from
// test/content/tile-selector-list.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getData } from '../../server/data.js';
import { TILE_SELECTORS } from './tile-selector-list.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BINDINGS = JSON.parse(readFileSync(join(ROOT, 'tools/assets/local-enemy-bindings.json'), 'utf8'));
const QUIET = { info() {}, warn() {}, error() {} };

/** Every tile and device key on any stage of either season. */
function stageKeys() {
  const keys = new Set();
  for (const data of [getData({ log: QUIET }), getData({ log: QUIET, season: 'act3autochess' })]) {
    for (const st of Object.values(data.stages || {})) {
      for (const t of Object.values(st.tiles || {})) if (t?.tileKey) keys.add(t.tileKey);
      for (const d of st.devices || []) if (d?.key) keys.add(d.key);
    }
  }
  return keys;
}

function tileAbilities() {
  const out = [];
  for (const [id, rec] of Object.entries(BINDINGS)) {
    if (id.startsWith('$')) continue;
    for (const a of rec.abilities || []) if (a.sel?.tile) out.push({ key: `${id} ${a.path}`, sel: a.sel });
  }
  return out;
}

test('the bindings carry each ability\'s selector kind (the extractor reads `_selector`)', () => {
  const all = tileAbilities();
  assert.ok(all.some((a) => a.key === 'trap_196_cnnon Modes/Default/Body/Talents/EnemyCannon00D' && a.sel.filter === 12), 'the cannon\'s DIST_DES_IN_FRONT_LINE');
  assert.ok(all.length >= 10, `${all.length} tile-selector abilities`);
});

test('every tile-selector ability is a tile pick in the sim, never run here, or a marked unit pick', () => {
  const keys = stageKeys();
  const missing = [], wrong = [];
  for (const a of tileAbilities()) {
    const v = TILE_SELECTORS[a.key];
    if (!v) {
      if (a.sel.keys?.length && !a.sel.keys.some((k) => keys.has(k))) continue;   // its tiles / tokens are on no stage
      missing.push(`${a.key} (filter ${a.sel.filter}${a.sel.keys ? `, ${a.sel.keys.join('|')}` : ''})`);
      continue;
    }
    if (v.sim === 'none') { if (!v.why) wrong.push(`${a.key}: why`); continue; }
    const src = existsSync(join(ROOT, v.where)) ? readFileSync(join(ROOT, v.where), 'utf8') : '';
    if (!src.includes(v.key)) wrong.push(`${a.key}: '${v.key}' not in ${v.where}`);
    if (v.sim === 'tile') {
      const [file, name] = v.test || [];
      const t = file && existsSync(join(ROOT, file)) ? readFileSync(join(ROOT, file), 'utf8') : '';
      if (!name || !t.includes(name)) wrong.push(`${a.key}: no test 「${name}」 in ${file}`);
    } else if (v.sim === 'unit') {
      if (!/^\[추정·[^\]]+\]$/.test(v.key)) wrong.push(`${a.key}: a unit pick names its [추정·…] mark`);
    } else wrong.push(`${a.key}: sim '${v.sim}'`);
  }
  assert.deepEqual(missing, [], 'a tile-selector ability the list does not judge: see what the sim does (test/content/tile-selector-list.js)');
  assert.deepEqual(wrong, []);
});

test('the list names no ability the bindings no longer have as a tile pick', () => {
  const have = new Set(tileAbilities().map((a) => a.key));
  assert.deepEqual(Object.keys(TILE_SELECTORS).filter((k) => !have.has(k)), []);
});
