// No detail card has a close button (GitHub #3, maintainer decision 2026-10-14: the client's UICharacterInfoPanel and
// its autochess sub-panels have none). Every card closes without one: a card the field opened on the next field press
// (closesOnFieldPress), a card the shop opened on a press elsewhere (ui/shopBar.js), a card a window opened — the
// 敌方情报 / 本局信息 drawer's rows, a bond popup's members — on a press anywhere but the card or a row that opens another
// card, and with its window; Esc closes any of them (screens/game.js). The browser check is in the maintainer's notes.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { closesOnOutsidePress, drawerClosesOnPress, openedFromWindow, windowCardGone, closesOnFieldPress, WINDOW_CARD_KEEP } from '../../public/js/ui/gameLogic.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
/** A stand-in for a pressed element: `closest` answers for the selectors listed in `inside`. */
const el = (...inside) => ({ closest: (sel) => (sel.split(',').map((s) => s.trim()).some((s) => inside.includes(s)) ? {} : null) });

describe('a card a window opened closes on a press elsewhere', () => {
  const drawerCard = { kind: 'enemy', id: 'enemy_1007_slime', count: 3, from: 'drawer' };
  const bondCard = { kind: 'chess', id: 'chess_x', owner: 'p1', from: 'bond' };

  test('which cards follow the rule', () => {
    assert.equal(openedFromWindow(drawerCard), true);
    assert.equal(openedFromWindow(bondCard), true);
    assert.equal(openedFromWindow({ kind: 'piece', uid: 3 }), false, 'a field card: closesOnFieldPress');
    assert.equal(openedFromWindow({ kind: 'item', id: 'x' }), false, 'a shop card: the shop bar closes it');
    assert.equal(openedFromWindow(null), false);
    assert.equal(closesOnFieldPress(drawerCard), false, 'a field press reaches it through closesOnOutsidePress instead');
  });

  test('a press on the board, the window\'s empty area or the HUD closes it', () => {
    for (const card of [drawerCard, bondCard]) {
      assert.equal(closesOnOutsidePress(card, el()), true, 'the board canvas');
      assert.equal(closesOnOutsidePress(card, el('.edrawer')), true, 'the drawer\'s empty area');
      assert.equal(closesOnOutsidePress(card, null), true);
    }
    assert.equal(closesOnOutsidePress(bondCard, el('.bpop')), true, 'the bond popup\'s empty area');
  });

  test('a press on the card, a dialog or a row that opens another card keeps it', () => {
    for (const card of [drawerCard, bondCard]) {
      for (const sel of ['.dpanel', '.modal', '.erow', '.ibanned__one', '.bpop__member', 'button.bpop__harmony']) {
        assert.equal(closesOnOutsidePress(card, el(sel)), false, sel);
      }
    }
    assert.equal(closesOnOutsidePress(drawerCard, el('.bpop')), false, 'a popup the drawer card\'s bond chip opened');
    assert.equal(closesOnOutsidePress({ kind: 'piece', uid: 1 }, el()), false, 'other cards are not this rule\'s');
    assert.match(WINDOW_CARD_KEEP, /\.dpanel/);
  });

  test('the card goes with its window', () => {
    assert.equal(windowCardGone(drawerCard, { drawer: null, bond: { id: 'b' } }), true);
    assert.equal(windowCardGone(drawerCard, { drawer: 'enemies', bond: null }), false);
    assert.equal(windowCardGone(bondCard, { drawer: 'info', bond: null }), true);
    assert.equal(windowCardGone(bondCard, { drawer: null, bond: { id: 'b' } }), false);
    assert.equal(windowCardGone({ kind: 'piece', uid: 1 }, {}), false);
  });
});

describe('the 本局信息 / 敌方情报 drawer closes on a press outside it', () => {
  test('the board, the HUD and the right 🔍 close it', () => {
    assert.equal(drawerClosesOnPress(el()), true, 'the board canvas or the HUD');
    assert.equal(drawerClosesOnPress(el('.gtop')), true, 'the top bar');
    assert.equal(drawerClosesOnPress(null), true);
  });
  test('the drawer, what it opened, a dialog and its own toggle keep it', () => {
    for (const sel of ['.edrawer', '.dpanel', '.modal', '.bpop', '.bpop-nav', '[data-testid="check-player"]']) {
      assert.equal(drawerClosesOnPress(el(sel)), false, sel);
    }
  });
  test('the match screen wires it', () => {
    assert.match(read('public/js/screens/game.js'), /const onDown = \(e\) => \{ if \(drawerClosesOnPress\(e\.target\)\) setDrawer\(null\); \};/);
  });
});

describe('the match screen wires it', () => {
  const game = read('public/js/screens/game.js');
  test('the drawer rows and the bond members mark where their card came from', () => {
    assert.match(game, /onEnemy=\$\{\(k, n\) => setDetail\(\{ kind: 'enemy', id: k, count: n, from: 'drawer' \}\)\}/);
    assert.match(game, /onChess=\$\{\(id\) => setDetail\(\{ kind: 'chess', id, foreign: true, from: 'drawer' \}\)\}/);
    assert.match(game, /diy: diy \|\| null, from: 'bond' \}\)\} \/>/);
  });
  test('a window press closes it, its window closing closes it, Esc closes a bond member\'s card before its popup', () => {
    assert.match(game, /window\.addEventListener\('pointerdown', onDown, true\);/);
    assert.match(game, /setDetail\(\(d\) => \(closesOnOutsidePress\(d, e\.target\) \? null : d\)\)/);
    assert.match(game, /setDetail\(\(d\) => \(windowCardGone\(d, \{ drawer, bond: bondOpen \}\) \? null : d\)\);/);
    assert.ok(game.indexOf("else if (L.detail?.from === 'bond') setDetail(null);") < game.indexOf('else if (L.bondOpen) setBondOpen(null);'));
    assert.match(game, /'\.bpop, \.bpop-nav, \.bslot, \[data-bond\], \.modal, \.dpanel'/, 'a press in the member card keeps its popup');
  });
  test('no card renders a close button', () => {
    assert.doesNotMatch(read('public/js/ui/detailPanel.js'), /dpanel__close/);
    assert.doesNotMatch(read('public/css/screens/game-panels.css'), /dpanel__close/);
    assert.doesNotMatch(read('public/css/hud-art.css'), /dpanel__close/);
  });
});
