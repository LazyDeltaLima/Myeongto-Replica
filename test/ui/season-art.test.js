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
