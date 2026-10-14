// Details of the official-form cards (GitHub #3 follow-up, maintainer decision 2026-10-14; docs/rules/ui.md
// 「상세 카드 세부」): the operator card's bond boxes hold the bond's icon and name only (the client's camp_tag_group_*:
// camp_tag + text_camp, both #d0d0d0).

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
