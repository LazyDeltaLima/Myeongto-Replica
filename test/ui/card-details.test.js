// Details of the official-form cards (GitHub #3 follow-up, maintainer decision 2026-10-14; docs/rules/ui.md
// 「상세 카드 세부」): the operator card's bond boxes hold the bond's icon and name only (the client's camp_tag_group_*:
// camp_tag + text_camp, both #d0d0d0); the 攻击范围 cells take the client's UICharacterAttackRangeWidget sprites.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

describe('bond boxes on the operator card', () => {
  test('no count, tier pips or active mark; icon and name in the prefab\'s #d0d0d0', () => {
    const css = read('public/css/hud-art.css');
    assert.match(css, /\.dart__tiles \.dbond \.dbond__count, \.dart__tiles \.dbond \.dbond__tiers \{ display: none; \}/);
    assert.doesNotMatch(css, /\.dart__tiles \.dbond\.is-active \{/, 'no active underline');
    assert.match(css, /\.dart__tiles \.dbond \.dbond__name \{ font-size: \.17rem; color: #d0d0d0; \}/);
    assert.match(css, /\.dart__tiles \.dbond \.dbond__icon img \{ filter: brightness\(0\) invert\(\.816\); \}/);
  });

  test('the boxes are still ChessDetail\'s bond chips: a press opens the bond popup, the title keeps the count', () => {
    const art = read('public/js/ui/detailArt.js');
    assert.match(art, /const chips = findByClass\(by\.get\('head'\), 'dbonds'\);/);
    const panel = read('public/js/ui/detailPanel.js');
    assert.match(panel, /onClick=\$\{\(\) => onBond\(id\)\}/);
    assert.match(panel, /t\('：在场 \{count\}\/\{cap\}', \{ count, cap \}\)/);
  });
});

describe('attack-range cells on the official-form cards', () => {
  test('the client\'s sprites: own cell white, range cells #fe7800 edge round rgba(253,122,63,.4), empty cells clear', () => {
    const css = read('public/css/hud-art.css');
    assert.match(css, /\.dart__range \.rgrid i \{\n  box-sizing: border-box; width: var\(--rg\); height: var\(--rg\);\n  border: max\(1px, calc\(var\(--rg\) \/ 8\)\) solid transparent; background: none;\n\}/);
    assert.match(css, /\.dart__range \.rgrid i\.on \{ border-color: #fe7800; background: rgba\(253, 122, 63, \.4\); \}/);
    assert.match(css, /\.dart__range \.rgrid i\.self \{ border-color: #fff; background: #fff; \}/);
    assert.doesNotMatch(css, /\.dart__range[^{]*\{[^}]*mint/, 'no mint in the card\'s range tile');
  });

  test('every official-form card with a range draws it in the .dart__range tile', () => {
    const js = read('public/js/ui/detailArt.js');
    for (const fn of ['ChessDetailArt', 'DeviceDetailArt', 'ItemDetailArt']) {
      const i = js.indexOf(`export function ${fn}(`);
      const body = js.slice(i, js.indexOf('\nexport function', i + 10));
      assert.match(body, /class="dart__tile dart__range"><\$\{RangeGrid\}/, fn);
    }
  });
});
