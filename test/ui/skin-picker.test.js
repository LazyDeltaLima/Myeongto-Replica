// test/ui/skin-picker.test.js — 스킨 고르기 (docs/rules/ui.md 「스킨 고르기」): the catalogue from the skin data's two lists
// (ui/skins.js), the section's states and tiles (ui/skinPicker.js: locked without the skin data, open with it), the
// enlarged preview, the sync that publishes the choice only with the skin data and never per season
// (ui/loadoutSync.js installSkinsSync), the seat card's skin (ui/seatArt.js seatCardSkin) and the detail card's skin
// 立绘 (ui/skins.js cardSkinArt, ui/detailArt.js). The real lists are swept
// when this checkout has them: every picture the picker draws must be a file of the resource list.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStore } from '../../public/js/store.js';
import { parseStoredSkins, buildSkinCatalog, chosenSkin, skinRows, ownerSkin, playerSkins, cardSkinArt, skinPicture, wornSkin, skinPic, cardWorn, SKINS_KEY, SKINS_SYNC_KEY } from '../../public/js/ui/skins.js';
import { cardArt } from '../../public/js/ui/detailArt.js';
import { resolveDetail } from '../../public/js/ui/detailPanel.js';
import { skinSectionState, skinTiles, SkinTile, SkinPreview, SkinPackBox } from '../../public/js/ui/skinPicker.js';
import { installSkinsSync, setLoadoutSeason, SYNC_DEBOUNCE_MS } from '../../public/js/ui/loadoutSync.js';
import { seatCardSkin } from '../../public/js/ui/seatArt.js';
import { data } from '../../public/js/data.js';
import { SKIN_LIMITS } from '../../shared/protocol.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const OP = 'char_1012_skadi2';
const SKIN = `${OP}@boc#4`;
const SKIN2 = `${OP}@iteration#2`;
const NOART = `${OP}@winter#9`;
const P = (s) => `/assets/spine/skin/${OP}/${s}`;
const LIST = {
  skins: {
    [SKIN]: { owner: OP, name: '升华', illust: { path: '/assets/local/spine/skin/x/illust/a.webp', w: 1024, h: 1024, frame: { x: -35, y: 195, w: 1577, h: 1577 } }, tokens: { token_10017_skadi2_dedant: 'token_10017_skadi2_dedant_boc#4' } },
    [SKIN2]: { owner: OP, illust: { path: '/assets/local/spine/skin/x/illust/b.webp', w: 1024, h: 1024 } },
    [NOART]: { owner: OP },
    // a summon's own skin: never chosen, it follows its owner's
    'token_10017_skadi2_dedant_boc#4': { owner: 'token_10017_skadi2_dedant' },
  },
};
const ART = { skins: {
  [SKIN]: { avatar: { path: P('a/boc.png'), w: 180, h: 180 }, portrait: { path: P('p/boc.png'), w: 180, h: 360 } },
  [SKIN2]: { avatar: { path: P('a/it.png'), w: 180, h: 180 }, portrait: { path: P('p/it.png'), w: 180, h: 360 } },
} };
const CAT = buildSkinCatalog(LIST, ART);
const RES = (o = {}) => ({ phase: 'idle', sizes: { '': { total: 10, left: 0 }, skin: { total: 300 * 1048576, left: 300 * 1048576 } }, chosen: {}, paused: {}, runGroups: [], ...o });

describe('skins: the catalogue and the choice', () => {
  test('one row per operator skin in the list order, summons\' own skins left out, pictures from art.json', () => {
    assert.deepEqual(skinRows(CAT, OP).map((r) => r.id), [SKIN, SKIN2, NOART]);
    assert.deepEqual(skinRows(CAT, 'token_10017_skadi2_dedant'), [], 'a summon skin is not chosen');
    const [boc, , none] = skinRows(CAT, OP);
    assert.equal(boc.portrait, P('p/boc.png'));
    assert.equal(boc.avatar, P('a/boc.png'));
    assert.equal(boc.illust, '/assets/local/spine/skin/x/illust/a.webp');
    assert.equal(boc.name, '升华');
    assert.equal(none.portrait, null, 'no art: nothing invented');
    assert.deepEqual(skinRows(buildSkinCatalog(LIST, null), OP).map((r) => r.portrait), [null, null, null], 'art.json missing: default art');
    assert.deepEqual(skinRows(null, OP), []);
  });

  test('chosenSkin: a stored skin the catalogue does not list for the operator is the default', () => {
    assert.equal(chosenSkin(OP, { [OP]: SKIN }, CAT), SKIN);
    assert.equal(chosenSkin(OP, { [OP]: `${OP}@gone#1` }, CAT), null);
    assert.equal(chosenSkin(OP, { char_003_kalts: SKIN }, CAT), null);
    assert.equal(chosenSkin(OP, { [OP]: SKIN }, null), null, 'before the catalogue');
  });

  test('parseStoredSkins keeps the wire\'s shape: charId → skinId pairs, at most SKIN_LIMITS.entries', () => {
    assert.deepEqual(parseStoredSkins({ [OP]: SKIN, chess_char_1: 'x@y#1', char_2_b: '', char_3_c: 7, char_4_d: 'bad skin' }), { [OP]: SKIN });
    assert.deepEqual(parseStoredSkins(null), {});
    assert.deepEqual(parseStoredSkins([SKIN]), {});
    const many = Object.fromEntries(Array.from({ length: SKIN_LIMITS.entries + 5 }, (_, i) => [`char_${i}_x`, `char_${i}_x@s#1`]));
    assert.equal(Object.keys(parseStoredSkins(many)).length, SKIN_LIMITS.entries);
  });
});

describe('skin section: states and tiles', () => {
  test('no section where the skin data cannot be taken; locked / loading / ready from the pack', () => {
    assert.equal(skinSectionState(RES({ phase: 'off' }), CAT), null, 'plain http, no list');
    assert.equal(skinSectionState(RES({ sizes: { '': { total: 1, left: 0 } } }), CAT), null, 'no skin pack in the list');
    assert.equal(skinSectionState(RES(), null), null, 'before the catalogue');
    assert.equal(skinSectionState(RES(), 'missing'), null, 'no catalogue on this server');
    assert.equal(skinSectionState(RES(), CAT), 'locked');
    assert.equal(skinSectionState(RES({ chosen: { skin: true } }), CAT), 'loading');
    assert.equal(skinSectionState(RES({ chosen: { skin: true }, sizes: { skin: { total: 9, left: 0 } } }), CAT), 'ready');
  });

  test('locked: the default tile is worn, every skin tile is the operator\'s own art under a lock', () => {
    const tiles = skinTiles({ catalog: CAT, charId: OP, map: { [OP]: SKIN }, state: 'locked', art: '/p/own.png', face: '/a/own.png' });
    assert.deepEqual(tiles.map((x) => x.id), ['', SKIN, SKIN2, NOART]);
    assert.equal(tiles[0].on, true, 'the stored choice is not worn without the skin data');
    for (const x of tiles.slice(1)) {
      assert.equal(x.locked, true);
      assert.equal(x.on, false);
      assert.equal(x.art, '/p/own.png');
      assert.equal(x.face, '/a/own.png');
    }
  });

  test('open: own portraits and avatars, the operator\'s where a skin has none, the stored choice worn, unnamed skins numbered', () => {
    const tiles = skinTiles({ catalog: CAT, charId: OP, map: { [OP]: SKIN2 }, state: 'ready', art: '/p/own.png', face: '/a/own.png' });
    const by = Object.fromEntries(tiles.map((x) => [x.id, x]));
    assert.equal(by[''].on, false);
    assert.equal(by[SKIN2].on, true);
    assert.equal(by[SKIN].art, P('p/boc.png'));
    assert.equal(by[SKIN].face, P('a/boc.png'));
    assert.equal(by[SKIN].fallbackArt, false);
    assert.equal(by[NOART].art, '/p/own.png');
    assert.equal(by[NOART].fallbackArt, true);
    assert.equal(by[SKIN].name, '升华', 'the list\'s name (Chinese: no overlay)');
    assert.equal(by[SKIN2].name, '皮肤 2', 'no name in the list: numbered');
    assert.equal(by[NOART].illust, null);
    assert.deepEqual(skinTiles({ catalog: CAT, charId: 'char_003_kalts', state: 'ready', art: '/p/k.png' }).map((x) => x.id), [''],
      'an operator without a skin: the default tile alone');
  });

  test('a tile\'s name is looked up by the skin id, never by the Chinese name (升华 is also an effect\'s name)', () => {
    const was = data.localeSkinName;
    const asked = [];
    data.localeSkinName = (id, zh) => { asked.push([id, zh]); return id === SKIN ? '서블리메이션' : zh; };
    try {
      const by = Object.fromEntries(skinTiles({ catalog: CAT, charId: OP, state: 'ready' }).map((x) => [x.id, x]));
      assert.equal(by[SKIN].name, '서블리메이션', 'the overlay\'s skins map by id (data.localeSkinName; docs/rules/ui.md 「스킨 고르기」)');
      assert.deepEqual(asked, [[SKIN, '升华']]);
    } finally { data.localeSkinName = was; }
  });

  test('a tile: locked does nothing, the worn skin opens the preview, another is chosen', () => {
    const tiles = skinTiles({ catalog: CAT, charId: OP, map: { [OP]: SKIN }, state: 'ready', art: '/p/own.png' });
    const calls = [];
    const click = (row) => SkinTile({ row, onPick: () => calls.push(['pick', row.id]), onPreview: () => calls.push(['preview', row.id]) }).props.onClick();
    click(tiles.find((x) => x.id === SKIN));
    click(tiles.find((x) => x.id === SKIN2));
    click(tiles[0]);
    click({ ...tiles.find((x) => x.id === SKIN2), locked: true });
    assert.deepEqual(calls, [['preview', SKIN], ['pick', SKIN2], ['pick', '']]);
  });

  test('the box: locked offers the download with its size, loading shows the progress, ready nothing', () => {
    const locked = JSON.stringify(SkinPackBox({ state: 'locked', g: { total: 300 * 1048576, left: 300 * 1048576 } }));
    assert.match(locked, /300/);
    assert.match(locked, /下载皮肤数据后/);
    assert.match(JSON.stringify(SkinPackBox({ state: 'loading', g: { total: 100, left: 25 } })), /75/);
    assert.equal(SkinPackBox({ state: 'ready' }), null);
  });

  test('the enlarged preview is the 立绘 in the modal; nothing without one', () => {
    const v = SkinPreview({ art: '/i/a.webp', name: 'x' });
    assert.equal(v.props.class, 'lo-skin-preview');
    assert.equal(v.props.children.type, 'img');
    assert.equal(v.props.children.props.src, '/i/a.webp');
    assert.equal(SkinPreview({ art: null }), null);
  });

  test('both detail panels put 皮肤 first, before 潜能与练度', () => {
    for (const file of ['loadout', 'diy']) {
      const src = read(`public/js/screens/${file}.js`);
      const skin = src.indexOf('<${SkinSection}');
      assert.ok(skin >= 0 && src.indexOf('<${CultivationSection}', skin) > skin, `${file}.js: 皮肤 then 潜能与练度`);
    }
  });

  test('the phone switch: the avatar takes the tile only on a short landscape screen', () => {
    const css = read('public/css/screens/loadout.css');
    assert.match(css, /\.lo-skin__art > \.lo-skin__art--faceimg \{ display: none; \}/);
    const q = css.indexOf('@media (max-width: 1000px) and (max-height: 520px) {\n  .lo-skin__art');
    assert.ok(q > 0, 'the media query of the tiles');
    assert.match(css.slice(q, q + 400), /\.lo-skin__art--face > \.lo-skin__art--faceimg \{ display: block; \}/);
  });
});

describe('skins sync (room.skins)', () => {
  const ticks = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  function harness({ skins = { [OP]: SKIN }, packOn = true } = {}) {
    const listeners = new Map(), pending = new Map();
    let time = 0, timerId = 0;
    const timers = {
      setTimeout(fn, ms) { const id = ++timerId; pending.set(id, { fn, at: time + ms }); return id; },
      clearTimeout(id) { pending.delete(id); },
      async advance(ms) {
        time += ms;
        for (const [id, task] of [...pending]) if (task.at <= time) { pending.delete(id); task.fn(); await ticks(); }
        await ticks();
      },
    };
    const net = {
      status: 'online', sent: [],
      on(name, fn) { listeners.set(name, fn); return () => listeners.delete(name); },
      emit(name, msg = {}) { listeners.get(name)?.(msg); },
      async request(type, fields) { net.sent.push({ t: type, ...fields }); return { t: 'ok' }; },
    };
    const target = createStore({ [SKINS_KEY]: skins, [SKINS_SYNC_KEY]: 'idle' });
    const pack = createStore({ chosen: packOn ? { skin: true } : {} });
    const sync = installSkinsSync({ net, timers, target, pack });
    return { net, timers, target, pack, ...sync };
  }

  test('the choice goes out as stored, never naming a season (room.skins is not per season: the server keeps one map)', async (t) => {
    setLoadoutSeason('act3autochess');
    t.after(() => setLoadoutSeason('act2autochess'));
    const h = harness();
    t.after(h.dispose);
    await h.flush();
    assert.deepEqual(h.net.sent, [{ t: 'room.skins', skins: { [OP]: SKIN } }]);
    h.target.set({ [SKINS_KEY]: { [OP]: SKIN2 } });
    await h.timers.advance(SYNC_DEBOUNCE_MS);
    assert.deepEqual(h.net.sent.at(-1), { t: 'room.skins', skins: { [OP]: SKIN2 } });
    assert.equal(h.target.get()[SKINS_SYNC_KEY], 'synced');
  });

  test('without the skin data the map goes empty; taking it sends the stored choice, turning it off clears it again', async (t) => {
    const h = harness({ packOn: false });
    t.after(h.dispose);
    await h.flush();
    assert.deepEqual(h.net.sent, [{ t: 'room.skins', skins: {} }]);
    h.pack.set({ chosen: { skin: true } });
    await h.timers.advance(SYNC_DEBOUNCE_MS);
    assert.deepEqual(h.net.sent.at(-1), { t: 'room.skins', skins: { [OP]: SKIN } });
    h.pack.set({ chosen: { skin: false } });
    await h.timers.advance(SYNC_DEBOUNCE_MS);
    assert.deepEqual(h.net.sent.at(-1), { t: 'room.skins', skins: {} });
    assert.deepEqual(h.target.get()[SKINS_KEY], { [OP]: SKIN }, 'the pref keeps the choice');
  });

  test('every welcome sends it again (a new session)', async (t) => {
    const h = harness();
    t.after(h.dispose);
    await h.flush();
    h.net.emit('welcome', {});
    await h.timers.advance(50);
    assert.equal(h.net.sent.length, 2);
  });
});

describe('seat card skin', () => {
  const seat = (playerId, skins) => ({ playerId, name: 'x', skins });
  test('one\'s own card wears the local choice, another the seat\'s published one, none without the skin data', () => {
    const local = { [OP]: SKIN };
    assert.equal(seatCardSkin(seat(1, { [OP]: SKIN2 }), OP, { myId: 1, localSkins: local, pack: true }), SKIN, 'own: local at once');
    assert.equal(seatCardSkin(seat(2, { [OP]: SKIN2 }), OP, { myId: 1, localSkins: local, pack: true }), SKIN2);
    assert.equal(seatCardSkin(seat(2, { [OP]: SKIN2 }), OP, { myId: 1, pack: true, otherSkins: false }), null, '其他玩家的皮肤 off');
    assert.equal(seatCardSkin(seat(1, {}), OP, { myId: 1, localSkins: local, pack: false }), null, 'no skin data: everybody default');
    assert.equal(seatCardSkin(seat(2, null), OP, { myId: 1, pack: true }), null);
    assert.equal(seatCardSkin({ playerId: 3, isBot: true, skins: { [OP]: SKIN } }, OP, { myId: 1, pack: true }), null, 'an AI seat');
    assert.equal(seatCardSkin(null, OP, { pack: true }), null);
    assert.equal(ownerSkin(OP, { ownerId: 2, myId: 1, players: [seat(2, { [OP]: SKIN })] }), SKIN);
  });

  test('the room draws the skin portrait first and falls back to the default one', () => {
    const src = read('public/js/screens/room.js');
    assert.match(src, /seatArtSrc\(\[skinArt, portrait\], badArt\)/);
    assert.match(src, /seatCardSkin\(s, op\.chess\.charId, \{ myId: me\.playerId, localSkins: skins\[SKINS_KEY\], otherSkins, pack: skinPack \}\)/);
  });
});

describe('detail card skin 立绘', () => {
  const ILL = '/assets/local/spine/skin/x/illust/a.webp';
  const FULL = '/assets/local/spine/skin/x/illust/full/a.webp';
  const FRAME = { x: -35, y: 195, w: 1577, h: 1577 };
  const lo = buildSkinCatalog(LIST, ART, false);
  const withFull = { skins: { ...LIST.skins, [SKIN]: { ...LIST.skins[SKIN], illust: { ...LIST.skins[SKIN].illust, full: { path: FULL, w: 2100, h: 2100 } } } } };
  test('the worn skin\'s 立绘 by its own card frame, only once the skin data is downloaded and that copy cached', () => {
    const cached = (paths) => paths.every((p) => p === ILL || p === FULL);
    assert.deepEqual(cardSkinArt(SKIN, [OP], { catalog: lo, ready: true, cached }), { src: ILL, frame: FRAME });
    assert.deepEqual(cardSkinArt(SKIN, [OP], { catalog: buildSkinCatalog(withFull, ART, true), ready: true, cached }), { src: FULL, frame: FRAME }, '高清: the full copy');
    assert.equal(cardSkinArt(SKIN, [OP], { catalog: lo, ready: false, cached }), null, 'not taken or still downloading: the default art');
    assert.equal(cardSkinArt(SKIN, [OP], { catalog: lo, ready: true, cached: () => false }), null, 'that 立绘 not cached');
    assert.equal(cardSkinArt(SKIN, ['char_2_other'], { catalog: lo, ready: true, cached }), null, 'another operator\'s skin');
    assert.equal(cardSkinArt(SKIN2, [OP], { catalog: lo, ready: true, cached: () => true }), null, 'no card frame: the default art');
    assert.equal(cardSkinArt(NOART, [OP], { catalog: lo, ready: true, cached: () => true }), null);
    assert.equal(cardSkinArt(null, [OP], { catalog: lo, ready: true, cached }), null);
    assert.equal(cardSkinArt(SKIN, [OP], { catalog: 'missing', ready: true, cached }), null);
  });

  test('cardArt: the skin 立绘 replaces the default art and its frame', () => {
    const skin = cardSkinArt(SKIN, [OP], { catalog: lo, ready: true, cached: () => true });
    assert.deepEqual(cardArt({}, { charId: OP }, false, skin), { src: ILL, full: true, frame: FRAME });
    assert.notEqual(cardArt({}, { charId: OP }, false, null).src, ILL);
  });

  test('ChessDetailArt asks for the skin the card\'s operator wears, for the body drawn (a stand-in, a 自选 pick, a template)', () => {
    const src = read('public/js/ui/detailArt.js');
    assert.match(src, /const skinId = wornSkin\(body, \{ \.\.\.cardWorn\(piece, skin, otherSkins\), map: sk\.map \}\);/);
    assert.match(src, /cardSkinArt\(skinId, \[body\.tmplId, body\.charId\], sk\)/);
    assert.match(src, /const art = cardArt\(m, body, hi, wornArt\);/);
    assert.match(read('public/js/ui/detailPanel.js'), /skin=\$\{detail\.skin \|\| null\}/, 'the panel hands resolveDetail\'s skin to the card');
  });

  test('cardWorn: the own piece\'s skin, a card without a piece this browser\'s choice, another player\'s unit only with 其他玩家的皮肤', () => {
    assert.deepEqual(cardWorn({ skin: SKIN }, { own: true }), { skin: SKIN }, 'the piece first');
    assert.deepEqual(cardWorn(null, { own: true }), { own: true });
    assert.deepEqual(cardWorn(null, { id: SKIN, mine: false }, true), { skin: SKIN });
    assert.deepEqual(cardWorn(null, { id: SKIN, mine: false }, false), {}, '其他玩家的皮肤 off');
    assert.deepEqual(cardWorn(null, { id: SKIN, mine: true }, false), { skin: SKIN }, 'one\'s own unit whatever the setting says');
    assert.deepEqual(cardWorn(null, null), {});
    assert.equal(wornSkin({ charId: OP }, { ...cardWorn(null, { own: true }), map: { [OP]: SKIN2 } }), SKIN2);
  });
});

describe('operator pictures in the chosen skin (shop card, icons)', () => {
  const cat = buildSkinCatalog(LIST, ART, false);
  const all = () => true;
  test('skinPicture: the skin\'s avatar / portrait for its own operator, once the skin data is downloaded and that picture cached', () => {
    assert.equal(skinPicture(SKIN, [OP], 'avatar', { catalog: cat, ready: true, cached: all }), P('a/boc.png'));
    assert.equal(skinPicture(SKIN, [undefined, OP], 'portrait', { catalog: cat, ready: true, cached: all }), P('p/boc.png'));
    assert.equal(skinPicture(SKIN, [OP], 'portrait', { catalog: cat, ready: false, cached: all }), null, 'not taken or still downloading: the default picture');
    assert.equal(skinPicture(SKIN, [OP], 'portrait', { catalog: cat, ready: true, cached: (ps) => !ps.includes(P('p/boc.png')) }), null, 'that picture not cached');
    assert.equal(skinPicture(SKIN, ['char_2_other'], 'avatar', { catalog: cat, ready: true, cached: all }), null, 'another operator\'s skin');
    assert.equal(skinPicture(NOART, [OP], 'avatar', { catalog: cat, ready: true, cached: all }), null, 'no picture in art.json');
    assert.equal(skinPicture(SKIN, [OP], 'illust', { catalog: cat, ready: true, cached: all }), null);
    assert.equal(skinPicture(SKIN, [OP], 'avatar', { catalog: 'missing', ready: true, cached: all }), null);
    assert.equal(skinPicture(null, [OP], 'avatar', { catalog: cat, ready: true, cached: all }), null);
  });

  test('wornSkin / skinPic: a worn skin first, else with `own` this browser\'s choice for the operator drawn', () => {
    const ctx = { map: { [OP]: SKIN }, catalog: cat, ready: true, cached: all };
    assert.equal(wornSkin({ charId: OP }, { own: true, map: ctx.map }), SKIN);
    assert.equal(wornSkin({ charId: OP }, { map: ctx.map }), null, 'not one\'s own: no choice read');
    assert.equal(wornSkin({ charId: OP }, { skin: SKIN2, own: true, map: ctx.map }), SKIN2, 'the worn one first');
    assert.equal(skinPic({ charId: OP }, 'portrait', ctx, { own: true }), P('p/boc.png'));
    assert.equal(skinPic({ charId: OP }, 'avatar', ctx, { skin: SKIN2 }), P('a/it.png'));
    assert.equal(skinPic({ charId: OP }, 'avatar', ctx), null);
    assert.equal(skinPic({ charId: 'char_2_other' }, 'avatar', { ...ctx, map: { char_2_other: SKIN } }, { own: true }), null, 'a choice stored under another operator');
    assert.equal(skinPic(null, 'avatar', ctx, { own: true }), null);
  });

  test('another player\'s operator icon: the skins they published, only with 其他玩家的皮肤 on', () => {
    const players = [{ playerId: 'p_me', skins: { [OP]: SKIN2 } }, { playerId: 'p_2', skins: { [OP]: SKIN } }, { playerId: 'p_bot' }];
    assert.deepEqual(playerSkins(players, 'p_2'), { [OP]: SKIN });
    assert.equal(playerSkins(players, 'p_2', false), null, '其他玩家的皮肤 off');
    assert.equal(playerSkins(players, 'p_bot'), null, 'chose none (an AI seat)');
    assert.equal(playerSkins(players, 'p_gone'), null);
    assert.equal(playerSkins(null, 'p_2'), null);
    const ctx = { map: { [OP]: SKIN2 }, catalog: cat, ready: true, cached: all };
    assert.equal(skinPic({ charId: OP }, 'avatar', ctx, { of: playerSkins(players, 'p_2') }), P('a/boc.png'), 'theirs, not this browser\'s');
    assert.equal(skinPic({ charId: OP }, 'avatar', ctx, { of: playerSkins(players, 'p_2', false) }), null);
    assert.equal(skinPic({ charId: OP }, 'avatar', { ...ctx, ready: false }, { of: playerSkins(players, 'p_2') }), null, 'no skin data: the default');
    assert.equal(wornSkin({ charId: OP }, { own: true, map: ctx.map, of: { [OP]: SKIN } }), SKIN2, 'own wins over `of`');
    assert.equal(wornSkin({ charId: OP }, { skin: SKIN2, of: { [OP]: SKIN } }), SKIN2, 'a worn skin first');
  });

  test('the leader ranking, the result\'s lineups and a teammate\'s bond popup draw others\' operators in their published skins', () => {
    assert.match(read('public/js/ui/gameComponents.js'), /skinPic\(c, 'avatar', sk, \{ skin, own: ownSkin, of: skinsOf \}\)/);
    const badges = read('public/js/ui/avatarBadges.js');
    assert.match(badges, /ownSkin=\$\{r\.pid === myId\} skinsOf=\$\{r\.pid === myId \? null : playerSkins\(pub\.players, r\.pid, others\)\}/);
    assert.match(read('public/js/screens/game.js'), /<\$\{BossDamagePanel\} pub=\$\{pub\} myId=\$\{myId\} \/>/);
    const result = read('public/js/screens/result.js');
    assert.match(result, /const skinsOf = own \? null : playerSkins\(store\.get\(\)\.match\?\.public\?\.players, pid, settingsStore\.get\(\)\.otherSkins !== false\);/);
    assert.match(result, /<\$\{LineupThumb\} key=\$\{i\} u=\$\{u\} gd=\$\{gd\} own=\$\{p\.playerId === myId\} pid=\$\{p\.playerId\} \/>/);
    assert.equal(read('public/js/screens/resultCharts.js').match(/own=\$\{x\.playerId === myId\} pid=\$\{x\.playerId\}/g)?.length, 2, 'the damage and 联防 tabs');
    assert.match(read('public/js/ui/bondStrip.js'), /ownSkin=\$\{!owner\} skinsOf=\$\{owner \? skins : null\}/);
    assert.match(read('public/js/screens/game.js'), /skins=\$\{bondPop\.self \? null : playerSkins\(pub\?\.players, bondPop\.ownerId, settingsStore\.get\(\)\.otherSkins !== false\)\}/);
  });

  test('resolveDetail hands the card its skin: an own card without a piece the choice, a unit the one it wears', () => {
    const chess = { chessId: 'chess_x', charId: OP, name: 'x', tier: 6, bonds: [] };
    const was = { lookup: data.lookup, get: data.get };
    data.lookup = (kind, id) => (kind === 'chess' && id === chess.chessId ? chess : null);
    data.get = () => null;
    try {
      const priv = { playerId: 'p_me' };
      assert.deepEqual(resolveDetail({ kind: 'chess', id: chess.chessId }, new Map(), { priv }).skin, { own: true }, 'a shop slot');
      assert.equal(resolveDetail({ kind: 'chess', id: chess.chessId, owner: 'p_2' }, new Map(), { priv }).skin, undefined, 'a teammate\'s bond row');
      assert.equal(resolveDetail({ kind: 'chess', id: chess.chessId, foreign: true }, new Map(), { priv }).skin, undefined, 'the banned list');
      const unit = (o) => resolveDetail({ kind: 'unit', unit: { id: 3, side: 'ally', kind: 'op', defId: chess.chessId, ...o } }, new Map(), { priv }).skin;
      assert.deepEqual(unit({ ownerId: 'p_2', skin: SKIN }), { id: SKIN, mine: false });
      assert.deepEqual(unit({ ownerId: 'p_me', skin: SKIN }), { id: SKIN, mine: true });
      assert.equal(unit({ ownerId: 'p_2' }), undefined);
    } finally { data.lookup = was.lookup; data.get = was.get; }
  });

  // Every operator picture of the page goes through the skin (ui/skins.js skinPic / skinPicture on the same line), or is
  // listed here with why it keeps the default (docs/rules/ui.md 「스킨 고르기」 operator pictures).
  const DEFAULT_ONLY = {
    'public/js/screens/achievements.js': 'past matches\' records and bond members: the data, no worn skin recorded',
    'public/js/ui/consolePanel.js': 'the console: a data reference',
    'public/js/screens/sweep.js': 'the S.W.E.E.P. report\'s bond members: a data reference',
    'public/js/ui/matchInfo.js': 'ChessIcon: the mode\'s operator list (banned, stage info), not anyone\'s operator',
    'public/js/screens/ownership.js': '干员持有: each chess beside its official stand-in, a reference of who stands in',
    'public/js/screens/room.js': 'the 名片干员 picker list; the seat card wears its skin through seatCardSkin (skinArt first in seatArtSrc)',
    'public/js/ui/detailArt.js': 'cardArt\'s default art: the skin 立绘 comes first through cardSkinArt',
    'public/js/screens/bandDraft.js': 'pickAvatar, the default its callers fall back to after skinPic',
    'public/js/screens/diy.js': 'avatarOf (the default its callers fall back to) and SkinSection\'s 默认 tile',
    'public/js/screens/loadout.js': 'SkinSection\'s 默认 tile: the default appearance by definition',
  };
  test('every operator picture goes through the skin, or says why it keeps the default', () => {
    const files = [];
    const walk = (dir) => {
      for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (rel.endsWith('.js') && rel !== 'public/js/ui/assetUrls.js') files.push(rel);
      }
    };
    walk('public/js');
    const bare = [];
    let routed = 0;
    for (const f of files) {
      read(f).split('\n').forEach((line, i) => {
        if (!/\bchess(Avatar|Portrait)Url\(/.test(line) || /^\s*(\/\/|\*)/.test(line)) return;
        if (/\bskinPic(ture)?\(/.test(line)) { routed++; return; }
        if (!Object.hasOwn(DEFAULT_ONLY, f)) bare.push(`${f}:${i + 1}`);
      });
    }
    assert.ok(routed >= 10, `pictures through the skin: ${routed}`);
    assert.deepEqual(bare, [], 'an operator picture without the chosen skin: draw it with ui/skins.js skinPic(rec, kind, skinArt(), { own | skin }) before the default, '
      + 'or list the file with its reason (docs/rules/ui.md 「스킨 고르기」)');
    for (const f of Object.keys(DEFAULT_ONLY)) assert.ok(files.includes(f), `${f} is gone: drop it from the list`);
  });
});

test('the real skin lists: every picture the picker draws is a file of the resource list', { skip: !existsSync(path.join(ROOT, 'public/assets/local/spine/skin/skins.json')) && 'no skin lists in this checkout' }, () => {
  const list = JSON.parse(read('public/assets/local/spine/skin/skins.json'));
  const artFile = path.join(ROOT, 'public/assets/local/spine/skin/art.json');
  const art = existsSync(artFile) ? JSON.parse(read('public/assets/local/spine/skin/art.json')) : null;
  const cat = buildSkinCatalog(list, art);
  const rows = [...cat.byOwner.values()].flat();
  assert.ok(rows.length > 200, `operator skins: ${rows.length}`);
  assert.ok(rows.every((r) => r.owner.startsWith('char_')), 'only operators own a chosen skin');
  assert.ok(skinRows(cat, OP).some((r) => r.id === SKIN), `${SKIN} is in the catalogue`);
  const unnamed = rows.filter((r) => !r.name).map((r) => r.id);
  // the detail card draws a skin 立绘 only by its card frame (skin_extract.py illust_picture → chararts_extract.illust_frame)
  const noFrame = rows.filter((r) => r.illust && !r.frame).map((r) => r.id);
  assert.deepEqual(noFrame.slice(0, 5), [], `${noFrame.length} skin 立绘 without a card frame: run tools/local-extract/skin_extract.py --only art (docs/rules/ui.md 「스킨 고르기」)`);
  assert.deepEqual(unnamed.slice(0, 5), [], `${unnamed.length} skins without a name show 「皮肤 N」: tools/local-extract/skin_extract.py writes the skin table's displaySkin.skinName (--only names; docs/rules/ui.md 「스킨 고르기」)`);
  const idx = path.join(ROOT, 'public/assets/browser-resources.json');
  if (!existsSync(idx)) return;
  const listed = new Set(JSON.parse(readFileSync(idx, 'utf8')).files.map((f) => f.p));
  const pics = rows.flatMap((r) => [r.portrait, r.avatar, r.illust]).filter(Boolean);
  assert.ok(pics.length > 500, `pictures: ${pics.length}`);
  const unlisted = pics.filter((p) => !listed.has(p));
  assert.deepEqual(unlisted.slice(0, 5), [], `${unlisted.length} pictures the worker cannot serve`);
});
