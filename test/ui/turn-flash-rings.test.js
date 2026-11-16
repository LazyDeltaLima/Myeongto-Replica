// The "轮到你了" turn flash (panel_player_select) draws its three rings and two glows as the official client does
// (docs/rules/ui.md 「휴식 진입·현상 수배·전투 종료 화면」, the 「轮到你了」 line): the rings are a dissolve shader on a white
// disc — an outer band in the material's #18e6b8, the Image colour being a threshold and not a colour — and the glows add light.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const css = readFileSync(path.join(ROOT, 'public/css/phase-art.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const { YourTurn, TURN_FLASH_MS } = await import('../../public/js/ui/phaseArt.js');

const RULE = 'docs/rules/ui.md 「휴식 진입·현상 수배·전투 종료 화면」 「轮到你了」';
const cls = (v) => (typeof v?.props?.class === 'string' ? v.props.class.split(/\s+/) : []);
const kids = (v) => [v?.props?.children].flat(Infinity).filter((x) => x && typeof x === 'object');
const rule = (sel) => {
  const m = css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`));
  assert.ok(m, `phase-art.css has the rule ${sel}`);
  return m[1];
};

test('YourTurn: the rings sit in root_circle, glow_behind under the cube, glow_front over everything', () => {
  const c = kids(YourTurn())[0];
  const order = kids(c).map((v) => cls(v).find((k) => k.startsWith('pcturn__')));
  assert.deepEqual(order, ['pcturn__bg', 'pcturn__circ', 'pcturn__plus', 'pcturn__glow', 'pcturn__cube', 'pcturn__fx', 'pcturn__bottom', 'pcturn__glow'],
    `the prefab's sibling order (bg, root_circle, root_plus, glow_behind, the squares, root_bottom, glow_front) — ${RULE}`);
  const circ = kids(c)[1];
  assert.deepEqual(kids(circ).map((v) => cls(v).join(' ')), ['pcturn__ring is-1', 'pcturn__ring is-2', 'pcturn__ring is-3'],
    'circle1..3 are children of root_circle, which the clip scales 1 → 1.2 at the end');
  assert.ok(cls(kids(c)[3]).includes('is-behind') && cls(kids(c)[7]).includes('is-front'));
});

test('the rings: an outer band in #18e6b8 with the official inner radii, not a border in the Image colour', () => {
  const base = rule('.pcturn__ring');
  assert.doesNotMatch(base, /border:/, `the Image colour (#00e9ff…) is the dissolve threshold, not a colour — ${RULE}`);
  assert.match(base, /radial-gradient\(circle closest-side, transparent calc\(var\(--pcr-in\)[^)]*\), #18e6b8 calc\(var\(--pcr-in\)/,
    `the band is cut at --pcr-in, coloured by m_wipe_circle's _Color — ${RULE}`);
  // the inner radius at the clip's last key, as a share of the outer radius (circle1·2·3)
  assert.match(base, /--pcr-in: 82\.3%/);
  assert.match(rule('.pcturn__ring.is-2'), /--pcr-in: 94\.8%/);
  assert.match(rule('.pcturn__ring.is-3'), /--pcr-in: 68\.3%/);
  assert.match(css, /@property --pcr-in \{[^}]*syntax: '<percentage>'/, 'registered, so the thinning animates instead of jumping');
  assert.match(base, /opacity: \.102/, "the final alpha key, also what reduced motion shows");
});

test('the glows add light and stay hidden without their animation', () => {
  const g = rule('.pcturn__glow');
  assert.match(g, /mix-blend-mode: plus-lighter/, `m_add is SrcAlpha + One — ${RULE}`);
  assert.match(g, /opacity: 0/, 'reduced motion drops the animations: the glow must not stay lit');
  assert.match(rule('.pcturn__glow.is-behind'), /--pcg: 0 68 53/);
  assert.match(rule('.pcturn__glow.is-front'), /--pcg: 173 255 237/);
});

test('every part of the flash runs over the clip length, TURN_FLASH_MS', () => {
  const durs = [...css.matchAll(/(?:^|\n)\.pcturn[^{]*\{[^}]*\}/g)].flatMap((m) => [...m[0].matchAll(/pcturn[-\w]* (\d+(?:\.\d+)?)s linear both/g)])
    .map((m) => Number(m[1]));
  assert.ok(durs.length >= 10, `found the ring and glow animations (${durs.length})`);
  for (const d of durs) assert.equal(Math.round(d * 1000), TURN_FLASH_MS, 'the keyframe percentages are clip time / 1.333 s');
});
