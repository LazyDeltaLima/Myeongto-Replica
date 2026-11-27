// The official 观战 caption (panel_ob_info, ui/battleArt.js ObInfo) places its parts with `position: fixed` against the
// viewport (css/battle-art.css .obinfo__bar / __self / __lost), and the battle cost counter (css/hud-art.css .dpbox) is
// set level with that bar from the same viewport bottom. ObInfo is drawn inside the client battle HUD's .chud /
// .chud__bottom (ui/combatHud.js): a transform, filter, perspective, contain or will-change on either makes it the
// containing block of those fixed parts. .chud__bottom's translateX(-50%) did that: the bar sat .3rem higher than the
// cost counter and the 当前玩家已离开 panel fell below the screen (2026-11-27). docs/rules/ui.md 「전투 HUD」.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CSS_DIR = path.join(ROOT, 'public/css');

/** @param {string} dir @returns {string[]} */
const cssFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? cssFiles(path.join(dir, e.name)) : e.name.endsWith('.css') ? [path.join(dir, e.name)] : []);

/** Rules (selector, body) of a stylesheet, media blocks flattened, comments dropped. @param {string} css */
function rules(css) {
  const out = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m; (m = re.exec(src));) out.push({ sel: m[1].trim().replace(/^@[^{]*$/, ''), body: m[2] });
  return out;
}

const CONTAINING = /(^|;)\s*(transform|filter|backdrop-filter|perspective|contain|will-change|container-type)\s*:\s*(?!none\b)/;

test('ObInfo fixed parts: no ancestor in the client battle HUD becomes their containing block', () => {
  const fixed = rules(readFileSync(path.join(CSS_DIR, 'battle-art.css'), 'utf8'))
    .filter((r) => /\.obinfo__(bar|self|lost)\b/.test(r.sel) && /position:\s*fixed/.test(r.body)).length;
  assert.ok(fixed >= 3, 'the caption parts are no longer position: fixed — revisit this guard (docs/rules/ui.md 「전투 HUD」)');
  let seen = 0;
  const bad = [];
  for (const file of cssFiles(CSS_DIR)) {
    for (const r of rules(readFileSync(file, 'utf8'))) {
      for (const sel of r.sel.split(',').map((s) => s.trim())) {
        if (!/\.chud(__bottom)?$/.test(sel)) continue;
        seen++;
        if (CONTAINING.test(r.body)) bad.push(`${path.relative(ROOT, file)}: ${sel} { ${r.body.trim()} }`);
      }
    }
  }
  assert.ok(seen >= 2, 'the .chud / .chud__bottom rules were not found — the guard ran on nothing');
  assert.deepEqual(bad, [], '.chud / .chud__bottom must not set a transform / filter / contain / will-change: it turns the '
    + 'box into the containing block of the ObInfo bar\'s fixed parts, which then leave the viewport place the cost counter '
    + 'is levelled with (docs/rules/ui.md 「전투 HUD」)');
});
