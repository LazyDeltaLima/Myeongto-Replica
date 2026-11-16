// test/ui/illust-res.test.js — the two copies of a 立绘 (maintainer decision 2026-11-16: a phone the long side 1024,
// every other device the client texture's own size, q85 both; public/js/illust-res.js). The unit card (ui/detailArt.js
// cardArt) and the skin picker (ui/skins.js buildSkinCatalog) draw the copy of the device, and the pre-download
// (resources.js choose, the list's `r` from tools/build-browser-resources.mjs) takes only that copy.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { phoneScreen, illustEntry, illustListed, illustFull, PHONE_SHORT_SIDE } from '../../public/js/illust-res.js';
import { buildSkinCatalog } from '../../public/js/ui/skins.js';

const RULE = 'docs/rules/ui.md 「정비 화면 HUD」 (the 立绘 copies)';
const win = (w, h, coarse) => ({ screen: { width: w, height: h }, matchMedia: (q) => ({ matches: q === '(pointer: coarse)' && coarse }) });

describe('which 立绘 copy a device takes', () => {
  test('a phone is a coarse primary pointer on a screen whose short side is under 600 CSS px', () => {
    assert.equal(PHONE_SHORT_SIDE, 600);
    assert.equal(phoneScreen(win(390, 844, true)), true, 'an iPhone held upright');
    assert.equal(phoneScreen(win(915, 412, true)), true, 'an Android phone in landscape: the screen, not the orientation');
    assert.equal(phoneScreen(win(744, 1133, true)), false, 'an iPad mini is not a phone');
    assert.equal(phoneScreen(win(1920, 1080, false)), false, 'a desktop');
    assert.equal(phoneScreen(win(500, 400, false)), false, 'a small screen with a mouse is not a phone');
    assert.equal(phoneScreen({}), false, 'no screen (Node): not a phone');
    assert.equal(illustFull(), true, 'Node takes the original resolution');
  });

  test('the entry\'s copy: `full` where the device takes the original resolution and the entry has one', () => {
    const e = { path: '/assets/local/chararts/c.webp', w: 819, h: 1024, full: { path: '/assets/local/chararts/full/c.webp', w: 1638, h: 2048 } };
    assert.equal(illustEntry(e, true), e.full, `a desktop draws the original resolution (${RULE})`);
    assert.equal(illustEntry(e, false), e, 'a phone the 1024 copy');
    const small = { path: '/assets/local/chararts/s.webp', w: 900, h: 900 };
    assert.equal(illustEntry(small, true), small, 'a texture no larger than 1024 has one copy');
    assert.equal(illustEntry({ ...e, full: { w: 1 } }, true).path, e.path, 'a malformed `full` is ignored');
    assert.equal(illustEntry(null, true), null);
  });

  test('the pre-download takes only the device\'s copy of a pair, every other file always', () => {
    for (const hi of [true, false]) {
      assert.equal(illustListed({ p: '/assets/ui/a.png' }, hi), true);
      assert.equal(illustListed({ p: '/x/full/a.webp', r: 'hi' }, hi), hi, `hi=${hi}: the original-resolution copy`);
      assert.equal(illustListed({ p: '/x/a.webp', r: 'lo' }, hi), !hi, `hi=${hi}: the 1024 copy`);
    }
  });
});

describe('the screens draw the device\'s copy', () => {
  test('the unit card (cardArt): the full copy on a desktop, the 1024 one on a phone, the same frame', async () => {
    const { data } = await import('../../public/js/data.js');
    const { cardArt } = await import('../../public/js/ui/detailArt.js');
    const frame = { x: 6, y: -93, w: 953, h: 953 };
    const local = { groups: { chararts: { char_1_a: { path: '/assets/local/chararts/char_1_a.webp', w: 1024, h: 1024, kind: 'Illust', frame,
      full: { path: '/assets/local/chararts/full/char_1_a.webp', w: 2048, h: 2048 } } } } };
    const get = data.get;
    data.get = (n) => (n === 'local' ? local : get.call(data, n));
    try {
      const desk = cardArt({}, { charId: 'char_1_a' }, true);
      assert.equal(desk.src, '/assets/local/chararts/full/char_1_a.webp', `a desktop's card draws the original resolution (${RULE})`);
      assert.deepEqual(desk.frame, frame, 'placed by the same illust frame');
      assert.equal(cardArt({}, { charId: 'char_1_a' }, false).src, '/assets/local/chararts/char_1_a.webp', 'a phone\'s card the 1024 copy');
      assert.equal(cardArt({}, { charId: 'char_1_a' }).src, desk.src, 'by default this device\'s copy (Node: not a phone)');
    } finally { data.get = get; }
  });

  test('the skin picker\'s preview (buildSkinCatalog)', () => {
    const OP = 'char_1012_skadi2', SKIN = `${OP}@boc#4`;
    const list = { skins: { [SKIN]: { owner: OP, illust: { path: '/assets/local/spine/skin/x/illust/a.webp', w: 1024, h: 1024,
      full: { path: '/assets/local/spine/skin/x/illust/full/a.webp', w: 2560, h: 2560 }, frame: { x: 0, y: 0, w: 1, h: 1 } } } } };
    assert.equal(buildSkinCatalog(list, null, true).bySkin.get(SKIN).illust, '/assets/local/spine/skin/x/illust/full/a.webp', RULE);
    assert.equal(buildSkinCatalog(list, null, false).bySkin.get(SKIN).illust, '/assets/local/spine/skin/x/illust/a.webp');
  });
});
