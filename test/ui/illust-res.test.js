// test/ui/illust-res.test.js — the two copies of a 立绘 (maintainer decisions 2026-11-16, 2026-11-17: 标准 the long side
// 1024, 高清 the client texture's own size, q85 both; the player chooses on the consent card and in the resource tab, by
// default a phone 标准 and other devices 高清; public/js/illust-res.js). The unit card (ui/detailArt.js cardArt) and the skin
// picker (ui/skins.js buildSkinCatalog) draw the chosen copy, and the pre-download (resources.js choose, the list's `r`
// from tools/build-browser-resources.mjs) takes only that copy and follows a change.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createHash } from 'node:crypto';

import { phoneScreen, illustEntry, illustListed, illustFull, setIllustFull, savedIllust, deviceIllustFull, illustStore, ILLUST_PREF, PHONE_SHORT_SIDE }
  from '../../public/js/illust-res.js';
import { buildSkinCatalog, loadSkinCatalog, skinsStore } from '../../public/js/ui/skins.js';
import { illustDiff, illustNote } from '../../public/js/resources.js';
import { cacheStorageOver } from '../helpers/fake-cache-storage.js';

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

describe('the player chooses the copy (立绘画质, maintainer decision 2026-11-17)', () => {
  const withPrefs = async (prefs, fn) => {
    const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    globalThis.localStorage = { getItem: (k) => prefs.get(k) ?? null, setItem: (k, v) => prefs.set(k, String(v)) };
    const before = illustStore.get().hi;
    try { await fn(); } finally {
      illustStore.set({ hi: before });
      if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete globalThis.localStorage;
    }
  };

  test('a choice is saved at once and wins over the device; none saved: the device decides', async () => {
    assert.equal(ILLUST_PREF, 'illustRes');
    assert.equal(deviceIllustFull(win(390, 844, true)), false, 'a phone defaults to 标准');
    assert.equal(deviceIllustFull(win(1920, 1080, false)), true, 'a desktop to 高清');
    const prefs = new Map();
    await withPrefs(prefs, () => {
      assert.equal(savedIllust(), null, 'nothing chosen yet');
      setIllustFull(false);
      assert.equal(prefs.get(`sp.pref.${ILLUST_PREF}`), '"lo"', `the choice is saved when made (the card's 以后再说 keeps it — ${RULE})`);
      assert.equal(savedIllust(), false);
      assert.equal(illustFull(), false, 'the page draws the chosen copy');
      assert.equal(illustEntry({ path: '/a.webp', full: { path: '/full/a.webp' } }).path, '/a.webp', 'illustEntry follows by default');
      setIllustFull(true);
      assert.equal(prefs.get(`sp.pref.${ILLUST_PREF}`), '"hi"');
      prefs.set(`sp.pref.${ILLUST_PREF}`, '"bad"');
      assert.equal(savedIllust(), null, 'an unknown stored value is no choice');
    });
  });

  test('an open skin picker\'s catalogue is rebuilt in the new copy', async () => {
    const OP = 'char_1012_skadi2', SKIN = `${OP}@boc#4`;
    const list = { skins: { [SKIN]: { owner: OP, illust: { path: '/assets/local/spine/skin/x/illust/a.webp', w: 1024, h: 1024,
      full: { path: '/assets/local/spine/skin/x/illust/full/a.webp', w: 2560, h: 2560 } } } } };
    await withPrefs(new Map(), async () => {
      setIllustFull(true);
      await loadSkinCatalog(async (url) => (url.endsWith('skins.json') ? list : null));
      assert.equal(skinsStore.get().catalog.bySkin.get(SKIN).illust, '/assets/local/spine/skin/x/illust/full/a.webp');
      setIllustFull(false);
      assert.equal(skinsStore.get().catalog.bySkin.get(SKIN).illust, '/assets/local/spine/skin/x/illust/a.webp', `标准: the 1024 copy at once (${RULE})`);
    });
  });

  test('the note\'s sizes come from the list: \'hi\' minus \'lo\' per group, none without a pair', () => {
    const packs = { skin: ['/assets/local/spine/skin/'] };
    const M = 1048576;
    const files = [
      { p: '/assets/local/chararts/a.webp', s: 49 * M, r: 'lo' }, { p: '/assets/local/chararts/full/a.webp', s: 85 * M, r: 'hi' },
      { p: '/assets/local/spine/skin/o/illust/b.webp', s: 61 * M, r: 'lo' }, { p: '/assets/local/spine/skin/o/illust/full/b.webp', s: 185 * M, r: 'hi' },
      { p: '/assets/ui/x.png', s: 5 * M },
    ];
    const d = illustDiff(files, packs);
    assert.deepEqual(d, { '': 36 * M, skin: 124 * M }, `no hand-written number (${RULE})`);
    assert.equal(illustDiff([{ p: '/assets/ui/x.png', s: 1 }], packs), null, 'a list without pairs has nothing to choose: the row is hidden');
    assert.equal(illustNote(d), '高清为原始尺寸，比标准多下载约 36 MB。如已下载皮肤数据，还会再多 124 MB。');
    assert.equal(illustNote({ '': 36 * M }), '高清为原始尺寸，比标准多下载约 36 MB。', 'no skin pack: one sentence');
  });

  test('a change resyncs the pre-download: the card\'s size follows and the other copy leaves the cache', async () => {
    const sha = (x) => createHash('sha256').update(x).digest('hex');
    const origin = 'https://x.test';
    const list = { version: 'v1', files: [
      { p: '/assets/ui/a.png', s: 1, h: sha('a') },
      { p: '/assets/local/chararts/c.webp', s: 2, h: sha('lo'), r: 'lo' },
      { p: '/assets/local/chararts/full/c.webp', s: 7, h: sha('hi'), r: 'hi' },
    ] };
    const entries = new Map([[origin + '/assets/local/chararts/full/c.webp', sha('hi')]]); // the game fetched the 高清 copy on demand
    let stateJson = {};
    const urlOf = (r) => (typeof r === 'string' ? origin + r : r.url);
    const cache = {
      keys: async () => [...entries.keys()].map((url) => ({ url })),
      match: async (r) => {
        const u = urlOf(r);
        if (u === origin + '/__sp_res_state__') return new Response(JSON.stringify(stateJson));
        return entries.has(u) ? new Response('x', { headers: { 'X-SP-Hash': entries.get(u) } }) : undefined;
      },
      delete: async (r) => entries.delete(urlOf(r)),
      put: async (r, resp) => {
        const u = urlOf(r);
        if (u === origin + '/__sp_res_state__') stateJson = await resp.json();
        else if (u.startsWith(origin + '/assets/')) entries.set(u, resp.headers.get('X-SP-Hash'));
      },
    };
    const fakeCaches = cacheStorageOver(cache);
    const saved = { window: globalThis.window, location: globalThis.location, caches: globalThis.caches, fetch: globalThis.fetch,
      navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator') };
    const { store } = await import('../../public/js/store.js');
    const before = store.get();
    await withPrefs(new Map(), async () => {
      try {
        globalThis.window = { isSecureContext: true, caches: fakeCaches };
        globalThis.location = { origin };
        globalThis.caches = fakeCaches;
        Object.defineProperty(globalThis, 'navigator', { value: { serviceWorker: { register: async () => {} } }, configurable: true });
        globalThis.fetch = async (u) => (u === '/assets/browser-resources.json' ? new Response(JSON.stringify(list)) : new Response('', { status: 404 }));
        store.set({ session: { entered: true }, room: null });
        setIllustFull(true);
        const res = await import('../../public/js/resources.js');
        const settle = async () => { for (let i = 0; i < 100 && (res.resourceStatus().cleanup.left || res.resourceStatus().reconcile?.ms == null); i++) await new Promise((r) => setTimeout(r, 20)); };
        await res.installResources();
        assert.equal(res.resStore.get().phase, 'ask');
        assert.equal(res.resStore.get().bytesTotal, 1, '高清 already cached on demand: only the file in no pair is left');
        assert.deepEqual(res.resStore.get().illust, { '': 5 });
        setIllustFull(false);
        await settle();
        assert.equal(res.resStore.get().bytesTotal, 3, `标准: the card's size now counts the 1024 copy (${RULE})`);
        assert.deepEqual([...entries.keys()], [], 'the 高清 copy left the cache');
        setIllustFull(true); // back while the fakes are in place (the resync it starts runs against them)
        await settle();
      } finally {
        store.set(before);
        for (const k of ['window', 'location', 'caches', 'fetch']) { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; }
        if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator); else delete globalThis.navigator;
      }
    });
  });
});
