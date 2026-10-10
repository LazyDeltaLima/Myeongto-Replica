// test/ui/shop-detail-close.test.js — the detail a shop card opened closes on a tap anywhere else (maintainer report
// 2026-10-10: tapping an empty spot after a card's first tap disarmed the card but left its detail open). Checked in
// Windows Chrome: card tap → .dpanel and .scard.is-armed; a tap on the board → neither.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/ui/shopBar.js'), 'utf8');
const bar = SRC.slice(SRC.indexOf('export function ShopBar('));

test('an outside tap closes the detail a card opened (armed or not), the cards / detail / a dialog / its bond popup keep it', () => {
  assert.match(SRC, /const SHOP_TAP_KEEP = '\.scard, \.lvcard, \.dpanel, \.modal';/);
  assert.match(bar, /if \(t && t\.closest && t\.closest\(`\$\{SHOP_TAP_KEEP\}, \.bpop`\)\) return;\s+setShown\(false\);\s+closeRef\.current\?\.\(\);/);
  assert.match(bar, /window\.addEventListener\('pointerdown', onDown, true\);/);
  // every detail the bar opens goes through showDetail (a card of a bar that is not editable opens it without arming)
  assert.doesNotMatch(bar, /onDetail=\$\{onDetail\}/);
  assert.equal((bar.match(/onDetail=\$\{showDetail\}/g) || []).length, 3, 'reward, item and operator cards');
  assert.match(bar, /setArmed\(key\); showDetail\(slot\.id,/);
});

test('the hooks run before the collapsed tab\'s early return (hook order)', () => {
  assert.ok(bar.indexOf('const [shown, setShown] = useState(false);') < bar.indexOf('if (collapsed) {'));
});
