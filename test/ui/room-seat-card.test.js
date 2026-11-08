// The waiting room's seat card as the event's player_solt_item_room (screens/room.js SeatCard, css/screens/room.css):
// the sprites drawn only with all of them (seatArt), 更换立绘 in the name card's ⋯ menu, no state on a Doctor not ready,
// the fainter mint of a ready card and the phone's 8-player room in one row (maintainer decisions 2026-11-08).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const seatCardSource = () => {
  const src = read('public/js/screens/room.js');
  const a = src.indexOf('function SeatCard(');
  return src.slice(a, src.indexOf('\n}\n', a));
};

test('seatArt: every seat sprite planned and present → one CSS variable each; one missing → none (the CSS look)', async () => {
  const { SEAT_SPRITES, UI_EXTRAS } = await load('tools/assets/plan.mjs');
  const { seatArt } = await load('public/js/screens/room.js');
  const names = [...SEAT_SPRITES, 'icon_card'];
  for (const n of names) assert.ok(UI_EXTRAS.some(([g, k, p]) => g === 'room' && k === n && p.endsWith(`player_solt_item_room/${n}.png`)), `${n} planned`);
  const manifest = (list) => ({ ui: Object.fromEntries(list.map((n) => [`room/${n}`, `/assets/ui/room/${n}.png`])) });
  const all = seatArt(manifest(names));
  assert.equal(all.split(';').length, names.length, 'every planned sprite is one variable: the card uses no sprite the mirror lacks');
  for (const n of names) assert.ok(all.includes(`url("/assets/ui/room/${n}.png")`), n);
  assert.equal(seatArt(manifest(names.filter((n) => n !== 'bg_normal2'))), '');
  assert.equal(seatArt({ ui: {} }), '');
  assert.equal(seatArt(null), '');
});

test('SeatCard: 更换立绘 sits in the own name card\'s ⋯ menu; a Doctor not ready shows no state; the first empty seat says what 邀请 does', () => {
  const src = seatCardSource();
  const more = src.indexOf('data-testid="seat-card-more"');
  const pick = src.indexOf('data-testid="seat-card-pick"');
  assert.ok(more > 0 && pick > more, 'the ⋯ tag comes first, the menu item after it');
  assert.match(src.slice(more, pick), /\$\{menu\.open \? html`<div class="rseat__menu" role="menu">/);
  assert.ok(!src.includes("t('准备中')"), 'no 准备中 on a card');
  assert.match(src, /\$\{lit \? html`<span class=\$\{`rseat__state /, 'only a ready card (or the host\'s) carries a state');
  assert.match(src, /firstEmpty \? html`<small class="rseat__tip">/);
});

test('room.css: the card in prefab units, the fainter mint, the sprites only under has-art, the phone\'s 8 seats in one row', () => {
  const css = read('public/css/screens/room.css');
  assert.match(css, /\.rseat \{[^}]*width: calc\(234 \* var\(--u\)\);\s*height: calc\(486 \* var\(--u\)\)/);
  assert.match(css, /\.rseat \{[^}]*--u: min\(calc\(var\(--w\) \/ 234\), calc\(\(var\(--seats-h, 60vh\) - 16px\) \/ 520\)\);/, 'the row\'s measured height, no container queries');
  assert.match(css, /\.has-art \.rseat\.is-lit \.rseat__matte::after \{[^}]*opacity: \.6;[^}]*var\(--st-down\)/);
  assert.match(css, /\.rseat\.is-lit \.rseat__matte::after \{[^}]*rgba\(34, 200, 160, \.5\) 50%/);
  // a background override keeps the size: `background-image` alone would tile the sprite at its own size
  assert.match(css, /\.has-art \.rseat\.is-lit \.rseat__strip \{ background: var\(--st-top-on\) center \/ 100% 100% no-repeat; \}/);
  assert.ok(!/\.has-art [^{]*\{[^}]*background-image:/.test(css));
  const phone = css.slice(css.indexOf('@media (max-height: 520px) {'));
  assert.match(phone, /\.rs-seats\.seats--8 \{ grid-template-columns: repeat\(8, auto\); grid-template-rows: auto;/);
  assert.match(css, /\.rseat__clip, \.rseat__bg, \.rseat__matte, \.rseat__roots, \.rseat__cline, \.rseat__state, \.rseat__lost \{ pointer-events: none; \}/);
});
