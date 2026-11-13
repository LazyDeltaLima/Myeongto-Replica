// The HUD number font (docs/rules/ui.md 「HUD 숫자 글꼴」): the client's HUD Text nodes name Novecentowide-Medium at
// runtime (DynFontLoader). No free release has that weight and the free Novecento licence forbids web embedding, so
// Lexend Exa (SIL OFL 1.1, google/fonts) stands in for it: the same digit height, 500, the digits' extra .06 em taken
// back by the letter spacing (maintainer decision 2026-11-11). tools/fetch-assets.mjs downloads it with the other
// public fonts (tools/assets/fonts.mjs) into public/fonts/fonts.css.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONTS, fontJobs } from '../../tools/assets/fonts.mjs';
import { RAW } from '../../tools/assets/sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LX = "'Lexend Exa', 'Novecento Wide', var(--font-num)";

test('fonts.mjs: Lexend Exa, the variable face, from google/fonts pinned to a commit', () => {
  const lx = FONTS.find((f) => f.family === 'Lexend Exa');
  assert.ok(lx, 'listed');
  assert.equal(lx.weight, '100 900');
  assert.equal(lx.base, RAW.googleFonts);
  assert.match(RAW.googleFonts, /^https:\/\/raw\.githubusercontent\.com\/google\/fonts\/[0-9a-f]{40}\/$/, 'a commit, not a branch');
  const job = fontJobs().find((j) => j.rel === 'lexend-exa.ttf');
  assert.deepEqual(job.urls, [`${RAW.googleFonts}ofl/lexendexa/LexendExa%5Bwght%5D.ttf`], "joinUrl escapes the brackets");
  assert.equal(job.bytes, 189908);
  for (const j of fontJobs().filter((x) => x.rel !== 'lexend-exa.ttf')) assert.ok(j.urls[0].startsWith(RAW.fonts), j.rel);
});

test('the manifest lists the face (data/assets.json fonts.faces, written by fetch-assets)', () => {
  const faces = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8')).fonts?.faces || {};
  assert.deepEqual(faces['lexend-exa'], { family: 'Lexend Exa', weight: '100 900', original: '/fonts/lexend-exa.ttf', woff2: '/fonts/lexend-exa.woff2' });
});

test('fonts.css declares Lexend Exa 100–900 with its OFL credit', { skip: !existsSync(path.join(ROOT, 'public/fonts/fonts.css')) && 'no public/fonts (npm run setup)' }, () => {
  const css = readFileSync(path.join(ROOT, 'public/fonts/fonts.css'), 'utf8');
  assert.match(css, /Lexend Exa \(c\) The Lexend Project Authors — SIL Open Font License 1\.1/);
  assert.match(css, /font-family: 'Lexend Exa';\n  font-style: normal;\n  font-weight: 100 900;/);
});

test('HUD CSS: the Medium spots are Lexend Exa 500 at -.06 em — the bond disc count at the prefab\'s 16, the dialog numbers, the round / LP / kill counters', () => {
  const css = readFileSync(path.join(ROOT, 'public/css/hud-art.css'), 'utf8');
  const rule = (sel) => {
    const i = css.indexOf(`${sel} {`);
    assert.ok(i >= 0, sel);
    return css.slice(i, css.indexOf('}', i));
  };
  const medium = new RegExp(`font-family: ${LX.replace(/[()]/g, '\\$&')};[^}]*font-weight: 500;[^}]*letter-spacing: -\\.06em`);
  const count = rule('.gm.has-hud-art .bslot .bond__count');
  assert.match(count, /font-size: calc\(var\(--u\) \* 16\)/);
  for (const sel of ['.gm.has-hud-art .bslot .bond__count',
    '.gm.has-hud-art .roundbox__num, .gm.has-hud-art .capsule__kills, .gm.has-hud-art .gtop__center .lp--lg',
    '.gm.has-hud-art .bpop__need b', '.gm.has-hud-art .bpop__stack b', '.gm.has-hud-art .bpop__stack .bpop__temp']) assert.match(rule(sel), medium, sel);
});

test('no local Novecento Medium is left: no extract job, no page registration', () => {
  assert.ok(!existsSync(path.join(ROOT, 'public/js/ui/localFonts.js')));
  for (const f of ['public/js/main.js', 'public/dev/game-mock.js']) assert.doesNotMatch(readFileSync(path.join(ROOT, f), 'utf8'), /installLocalFonts/, f);
  assert.doesNotMatch(readFileSync(path.join(ROOT, 'tools/local-extract/extract.py'), 'utf8'), /FONT_NAMES|Novecentowide-Medium/);
});

test('more Medium spots: the 3/3 lineup count, the shop prices and funds, the achievement trophies and mode counts', () => {
  const read = (f) => readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (css, sel) => {
    const m = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((x) => x[1].trim() === sel);
    assert.ok(m, sel);
    return m[2];
  };
  const medium = new RegExp(`font-family: ${LX.replace(/[()]/g, '\\$&')};[^}]*font-weight: 500;[^}]*letter-spacing: -\\.06em`);
  // 3/3 确定自选编队: text_phase_now / text_phase_total (Novecentowide-Medium); the line centred in num_bg, no top padding
  const dc = read('public/css/screens/diychoose.css');
  const num = rule(dc, '.dclv__num');
  assert.match(num, medium);
  assert.match(num, /align-content: center/);
  assert.match(num, /flex-wrap: wrap/);
  assert.doesNotMatch(dc.match(/\.dclv__num \{[^}]*\}/g).join('\n'), /padding-top/, 'no padding pushes the count down (desktop or phone)');
  // the shop: autochess_shop_cost_item text_num 6 up (EN) / 5 up (规程), coin_num (Novecentowide-Medium)
  const shop = read('public/css/shop-art.css');
  const price = rule(shop, '.shopbar.has-shop-cost :is(.scard__price, .lvcard__price, .toolbtn--amber .hex) .hex__value');
  assert.match(price, medium);
  assert.match(price, /transform: translateY\(calc\(var\(--u\) \* -4\.4\)\)/);
  assert.match(rule(shop, '.shopbar.has-shop-cost.has-shop-theme :is(.scard__price, .lvcard__price, .toolbtn--amber .hex) .hex__value'), /font-size: calc\(var\(--u\) \* 20\);[^}]*translateY\(calc\(var\(--u\) \* -3\.6\)\)/);
  assert.match(rule(shop, '.shopbar.has-shop-art .funds__num'), medium);
  assert.match(rule(shop, '.shopbar.has-shop-theme .funds__num'), /translateY\(calc\(var\(--u\) \* -3\)\)/);
  // the achievement window: the trophies and the per-mode counts, the counts' cells centred
  const ac = read('public/css/screens/achievements.css');
  assert.match(rule(ac, '.st-profile__trophies b'), medium);
  assert.match(rule(ac, '.st-modegrid__value'), medium);
  assert.match(rule(ac, '.st-modegrid__cell'), /text-align: center/);
  // its banner mark has a box of its own: 规程's tall mark (138×167) stays inside the banner
  assert.match(rule(ac, '.achv__mark img'), /height: \.46rem;[^}]*object-fit: contain/);
});
