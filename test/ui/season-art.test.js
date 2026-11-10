// A later season's own UI art (public/js/ui/seasonArt.js; tools/local-extract/season_ui.py writes the manifest groups
// `season/<id>/…`): 盟约 never asks for it, a season without the extract gets null (the page keeps its 盟约 art), the
// Korean page takes the logo written over in Korean (maintainer decision 2026-11-08), and the loading pictures 规程
// renamed reach the 盟约 file they are a copy of.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const S = 'act3autochess';
const entry = (p) => ({ path: p, w: 10, h: 10, kind: 'Sprite' });
let local = {
  version: 1,
  groups: {
    [`season/${S}/backdrop`]: { title: entry(`/assets/local/season/${S}/backdrop/title.jpg`) },
    [`season/${S}/logo`]: {
      title_season: entry(`/assets/local/season/${S}/logo/title_season.png`),
      title_season_ko: entry(`/assets/local/season/${S}/logo/title_season_ko.png`),
      season_logo_settle_game: entry(`/assets/local/season/${S}/logo/season_logo_settle_game.png`),
    },
  },
};
const assets = { ui: { 'loading/loading_ac_core': '/assets/ui/loading/loading_ac_core.png', 'loading/loading_ac_hard': '/assets/ui/loading/loading_ac_hard.png' } };
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.endsWith('/local-assets.json')) return { ok: true, status: 200, json: async () => local };
  if (u.endsWith('/assets.json')) return { ok: true, status: 200, json: async () => assets };
  return { ok: false, status: 404, json: async () => ({}) };
};

describe('season art', () => {
  test('盟约 draws none of it; a later season its backdrop and logos; the Korean page its Korean logo', async () => {
    const { data } = await import('../../public/js/data.js');
    await data.load('local');
    const { seasonBackdrop, seasonLogo, seasonSettleLogo } = await import('../../public/js/ui/seasonArt.js');
    assert.equal(seasonBackdrop('act2autochess'), null);
    assert.equal(seasonLogo('act2autochess', 'ko'), null);
    assert.equal(seasonBackdrop(S), `/assets/local/season/${S}/backdrop/title.jpg`);
    assert.equal(seasonLogo(S, 'ko'), `/assets/local/season/${S}/logo/title_season_ko.png`);
    assert.equal(seasonLogo(S, 'zh'), `/assets/local/season/${S}/logo/title_season.png`);
    assert.equal(seasonLogo(S, 'en'), `/assets/local/season/${S}/logo/title_season.png`);
    assert.equal(seasonSettleLogo(S), `/assets/local/season/${S}/logo/season_logo_settle_game.png`);
  });

  test('a season without the extract falls back (null), the Korean page to the official logo when no Korean copy', async () => {
    const { data } = await import('../../public/js/data.js');
    const { seasonBackdrop, seasonLogo } = await import('../../public/js/ui/seasonArt.js');
    local = { version: 1, groups: { [`season/${S}/logo`]: { title_season: entry('/x/title_season.png') } } };
    await data.invalidate('local'); await data.load('local');
    assert.equal(seasonBackdrop(S), null);
    assert.equal(seasonLogo(S, 'ko'), '/x/title_season.png');
    local = { version: 1, groups: {} };
    await data.invalidate('local'); await data.load('local');
    assert.equal(seasonLogo(S, 'ko'), null);
  });

  test("规程's renamed loading pictures show the 盟约 file they copy; a name kept is looked up as it is", async () => {
    const { data } = await import('../../public/js/data.js');
    await data.load('assets');
    const { loadingArt, LOADING_SAME } = await import('../../public/js/ui/battleArt.js');
    assert.equal(loadingArt({ loadingPic: 'loading_ac_normal', code: 'AC-MP-2', name: 'x' })?.pic, '/assets/ui/loading/loading_ac_core.png');
    assert.equal(loadingArt({ loadingPic: 'loading_ac_hard', code: 'x', name: 'x' })?.pic, '/assets/ui/loading/loading_ac_hard.png');
    assert.equal(loadingArt({ loadingPic: 'loading_ac_funny', code: 'x', name: 'x' }), null, 'its 盟约 copy is not in this manifest');
    // every loading picture of the season's modes is the manifest's or a copy of one
    const cfg = JSON.parse(readFileSync(path.join(ROOT, `data/seasons/${S}/config.json`), 'utf8'));
    const have = new Set(['loading_ac_core', 'loading_ac_prototype', 'loading_ac_hard', 'loading_ac_abyss']);
    for (const m of Object.values(cfg.modes)) {
      if (m.type === 'TRAINING' || !m.loadingPic) continue;
      assert.ok(have.has(m.loadingPic) || have.has(LOADING_SAME[m.loadingPic]), `${m.modeId} ${m.loadingPic}`);
    }
  });
});

describe('the title season change through the dark', () => {
  test('down in 0.35 s, up in 0.45 s, as the CSS draws it', async () => {
    const { SEASON_FADE } = await import('../../public/js/screens/title.js');
    assert.deepEqual({ ...SEASON_FADE }, { out: 350, in: 450 });
    const css = readFileSync(path.join(ROOT, 'public/css/screens/title.css'), 'utf8');
    assert.match(css, /\.title-bg__veil \{[^}]*transition: opacity 450ms/);
    assert.match(css, /\.title-bg__veil\.is-dark \{[^}]*transition-duration: 350ms/);
  });
});

describe('the full local extract keeps the season groups', () => {
  test('extract.py keeps season/* of the previous manifest on a run without --only', () => {
    const src = readFileSync(path.join(ROOT, 'tools/local-extract/extract.py'), 'utf8');
    assert.match(src, /if not args\.only:\n\s+#[^\n]*\n\s+old = \{g: v for g, v in old\.items\(\) if g\.startswith\('season\/'\)\}/);
  });
});

describe("a later season's own icons", () => {
  const icons = {
    [`season/${S}/bandicon`]: { icon_gvial2: entry('/s/band/icon_gvial2.png'), icon_amiya: entry('/s/band/icon_amiya.png') },
    [`season/${S}/bondicon`]: { icon_ursusShip: entry('/s/bond/icon_ursusShip.png') },
    [`season/${S}/shopitemicon`]: { trap_1126_acarm126: entry('/s/item/trap_1126_acarm126.png') },
    [`season/${S}/medalicon`]: { trophy_level6_icon: entry('/s/medal/6.png'), trophy_level1_icon: entry('/s/medal/1.png') },
    [`season/${S}/modeicon`]: { mode_hard_icon: entry('/s/mode/hard.png') },
    [`season/${S}/bondboardicon`]: { '1_1': entry('/s/board/1_1.png') },
  };
  const base = {
    bands: { band_amiya: '/assets/band/band_amiya.png' }, bonds: { yanShip: '/assets/bond/yanShip.png' }, items: {},
    ui: { 'medalIcon/trophy_level1_icon': '/en/1.png', 'modeIcon/mode_hard_icon': '/en/hard.png', 'bondBoardIcon/1_1': '/en/1_1.png' },
  };
  const records = {
    bands: [{ bandId: 'band_survive', iconId: 'icon_gvial2' }, { bandId: 'band_amiya', iconId: 'icon_amiya' }, { bandId: 'band_none', iconId: 'icon_none' }],
    bonds: [{ bondId: 'ursusShip', iconId: 'icon_ursusShip' }, { bondId: 'yanShip', iconId: 'icon_yanShip' }],
  };

  test('the season takes its strategy, bond, equipment and medal icons by its records; mode and bond-ring art stay', async () => {
    const { withSeasonArt, bandIconUrl, bondIconUrl, itemIconUrl, uiUrl, effectIconUrl } = await import('../../public/js/ui/assetUrls.js');
    const m = withSeasonArt(base, { groups: icons }, S, records);
    assert.equal(bandIconUrl(m, 'band_survive'), '/s/band/icon_gvial2.png', 'by the record, not the band id');
    assert.equal(bandIconUrl(m, 'band_amiya'), '/s/band/icon_amiya.png', "the season's own copy first");
    assert.equal(bandIconUrl(m, 'band_none'), null);
    assert.equal(effectIconUrl(m, { iconKind: 'band', iconId: 'icon_gvial2' }), '/s/band/icon_gvial2.png');
    assert.equal(bondIconUrl(m, 'ursusShip'), '/s/bond/icon_ursusShip.png');
    assert.equal(bondIconUrl(m, 'yanShip'), '/assets/bond/yanShip.png', 'a record the extract lacks keeps its icon');
    assert.equal(itemIconUrl(m, { iconId: 'trap_1126_acarm126' }), '/s/item/trap_1126_acarm126.png');
    assert.equal(uiUrl(m, 'medalIcon/trophy_level6_icon'), '/s/medal/6.png');
    assert.equal(uiUrl(m, 'medalIcon/trophy_level1_icon'), '/s/medal/1.png');
    assert.equal(uiUrl(m, 'modeIcon/mode_hard_icon'), '/en/hard.png');
    assert.equal(uiUrl(m, 'bondBoardIcon/1_1'), '/en/1_1.png');
    assert.equal(base.bands.band_amiya, '/assets/band/band_amiya.png', 'the manifest itself is not changed');
    assert.ok(withSeasonArt(base, { groups: {} }, S, records) === base, 'no extract: the manifest as it is');
  });

  test("the data store hands 盟约 the file and a later season its view, rebuilt as the extract and records arrive", async () => {
    const { createDataStore } = await import('../../public/js/data.js');
    const files = {
      'assets.json': base, 'local-assets.json': { groups: icons },
      [`s/${S}/bands.json`]: records.bands, [`s/${S}/bonds.json`]: records.bonds,
      'bands.json': [{ bandId: 'band_amiya', iconId: 'icon_amiya' }], 'bonds.json': [],
    };
    const fetch = async (url) => {
      const k = String(url).replace(/^\/data\//, '');
      return Object.hasOwn(files, k) ? { ok: true, status: 200, json: async () => files[k] } : { ok: false, status: 404, json: async () => ({}) };
    };
    const store = createDataStore({ fetch, timeoutMs: 0 });
    const told = [];
    store.subscribe((n) => told.push(n));
    await store.loadAll('assets', 'bands', 'bonds');
    assert.ok(store.get('assets') === base, '盟约 reads the file');
    await store.setSeason(S);
    assert.equal(store.get('assets').bands.band_survive, undefined, 'no extract loaded yet');
    told.length = 0;
    await store.load('local');
    assert.ok(told.includes('assets'), "the extract's arrival re-renders the art readers");
    assert.equal(store.get('assets').bands.band_survive, '/s/band/icon_gvial2.png');
    assert.ok(store.get('assets') === store.get('assets'), 'built once per input');
    assert.ok(store.getRaw('assets') === base);
    told.length = 0;
    await store.setSeason('act2autochess');
    assert.ok(told.includes('assets'));
    assert.ok(store.get('assets') === base);
  });
});

describe("阿米娅's 医疗 form: a body with its E2 art alone", () => {
  const m = { chars: { char_1037_amiya3: { avatarE2: '/a/amiya3_2.png', portraitE2: '/p/amiya3_2.png' } } };
  const rec = (golden) => ({
    charId: 'char_002_amiya', tmplId: 'char_1037_amiya3', isGolden: golden,
    assets: { avatar: golden ? 'char_1037_amiya3_2' : 'char_1037_amiya3', portrait: `char_1037_amiya3_${golden ? 2 : 1}` },
  });

  test('draws that art at every level, the card as the body', async () => {
    const { chessAvatarUrl, chessPortraitUrl } = await import('../../public/js/ui/assetUrls.js');
    for (const golden of [false, true]) {
      assert.equal(chessAvatarUrl(m, rec(golden)), '/a/amiya3_2.png', `avatar golden=${golden}`);
      assert.equal(chessPortraitUrl(m, rec(golden)), '/p/amiya3_2.png', `portrait golden=${golden}`);
    }
    const { data } = await import('../../public/js/data.js');
    await data.load('local');
    const { cardArt } = await import('../../public/js/ui/detailArt.js');
    local = { version: 1, groups: { chararts: { char_1037_amiya3: { path: '/c/amiya3.webp', w: 1, h: 1, kind: 'Illust', frame: { x: 0, y: 0, w: 1, h: 1 } } } } };
    await data.invalidate('local'); await data.load('local');
    assert.equal(cardArt(m, rec(false)).src, '/c/amiya3.webp', "the card's 立绘 is the body's");
  });
});
