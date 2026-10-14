// GitHub issue #184 「建议加入对于特殊地形的单击信息提示」, reshaped by GitHub #3 (maintainer decision 2026-10-14): a tap on
// a special terrain tile shows the client's tile toast at the top of the screen (TileInfoController._SelectTile →
// UIToastController.Show(tileName, tileDescription)), not a detail card — `screens/game.js` tileClick hands the toast
// `{ key, terrain }` resolved from the stage the board on screen is built from, and the next press of the board takes it
// away. The words / numbers themselves are covered in test/ui/gameLogic.test.js (terrainInfo) and the tap itself reaches
// them in the browser (test/ui/terrain-tip.e2e.test.js); this is the link between the two.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const { resolveDetail } = await import('../../public/js/ui/detailPanel.js');
const { terrainInfo, closesOnFieldPress } = await import('../../public/js/ui/gameLogic.js');
const { TileToast } = await import('../../public/js/ui/tileToast.js');

/** The first (row, col) of `glyph` in a stage of data/stages.json. */
function at(stage, glyph) {
  for (let row = 0; row < stage.rows.length; row++) {
    const col = stage.rows[row].indexOf(glyph);
    if (col >= 0) return { row, col };
  }
  throw new Error(`no ${glyph} in ${stage.id}`);
}

/** The text of a vnode tree. */
function textOf(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  return textOf(node.props?.children);
}

test('a special tile\'s tip is a toast with its name, tag, lines and facts — never a detail card', () => {
  const stages = JSON.parse(read('data/stages.json'));
  const st = stages['act1autochess_m04'];
  const p = at(st, 'i');
  const info = terrainInfo(st, p.row, p.col);
  assert.equal(info.name, '活性源石');
  const vnode = TileToast({ tip: { key: `${p.row},${p.col}`, terrain: info } });
  assert.ok(vnode && vnode.props, 'a toast');
  assert.equal(vnode.props.class, 'ttoast');
  assert.equal(vnode.props.role, 'status');
  assert.equal(vnode.props['data-tile'], `${p.row},${p.col}`);
  const text = textOf(vnode);
  assert.ok(text.includes('活性源石'), text);
  for (const line of info.lines) assert.ok(text.includes(line), line);
  assert.equal(TileToast({ tip: { key: '1,1', terrain: info, again: true } }).props.class, 'ttoast is-again',
    'the same tile pressed again: no entry animation');
  assert.equal(TileToast({ tip: null }), null);
  assert.equal(TileToast({ tip: { key: '0,0', terrain: null } }), null);
  // the old card path is gone: a terrain target resolves to nothing, and nothing of it closes on a field press
  assert.equal(resolveDetail({ kind: 'terrain', terrain: info }, new Map()), null);
  assert.equal(closesOnFieldPress({ kind: 'terrain' }), false);
});

test('the game screen shows the toast on a special tile and hides it on the next press of the board', () => {
  const js = read('public/js/screens/game.js');
  assert.match(js, /setTileTip\(\{ key, terrain: info, again \}\);/);
  assert.ok(!js.includes("setDetail({ kind: 'terrain'"), 'no terrain card');
  // the field's capture pointerdown: the toast goes (the client's _ClearSelectedTile), remembered for a press on the same tile
  assert.match(js, /tipAtDown\.current = L\.tileTip;\n\s+if \(L\.tileTip\) setTileTip\(null\);/);
  assert.match(js, /const again = tipAtDown\.current\?\.key === key;/);
  assert.match(js, /<\$\{TileToast\} tip=\$\{tileTip\} \/>/);
  assert.match(js, /useEffect\(\(\) => \{ setTileTip\(null\); tipAtDown\.current = null; \}, \[phase, watching\]\);/, 'a new phase / board takes it away');
  assert.match(js, /else if \(L\.tileTip\) setTileTip\(null\);/, 'Esc takes it away too');
  const css = read('public/css/screens/game-panels.css');
  const rule = css.slice(css.indexOf('.ttoast {'), css.indexOf('}', css.indexOf('.ttoast {')));
  assert.match(rule, /pointer-events: none;/, 'the toast never takes a press: the board under it stays pressable');
});
