// The lobby's season change through the dark (ui/seasonFade.js; maintainer decisions 2026-11-02, 2026-11-13): the whole
// screen goes black, the pick is made only while it is black, the screen lights up after the season's files settled,
// the latest pick wins, and the title has no season tabs (the lobby's chip is the one place to pick).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');

/** A document with one body; elements record their style and whether they are attached. */
function fakeDom() {
  const body = { kids: [], append(el) { el.isConnected = true; this.kids.push(el); } };
  globalThis.document = {
    body,
    createElement: () => {
      const el = { style: {}, isConnected: false, className: '', setAttribute() {}, remove() { el.isConnected = false; body.kids.splice(body.kids.indexOf(el), 1); } };
      return el;
    },
  };
  // the opacity each style read saw (the browser computes the veil's style there)
  body.styleReads = [];
  globalThis.getComputedStyle = (el) => { body.styleReads.push(el.style.opacity); return { opacity: el.style.opacity }; };
  return body;
}

test('black first, the pick under the black, lit again after the files; the latest pick wins', async () => {
  const body = fakeDom();
  const { store } = await import('../../public/js/store.js');
  const { pickSeasonThroughDark, SEASON_FADE } = await import('../../public/js/ui/seasonFade.js');
  assert.deepEqual({ ...SEASON_FADE }, { out: 350, in: 450 });
  const before = store.get().ui.season;
  try {
    const t0 = Date.now();
    const run = pickSeasonThroughDark('act3autochess');
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(body.kids.length, 1, 'the veil is up');
    assert.equal(body.kids[0].style.opacity, '1');
    assert.equal(body.kids[0].style.position, 'fixed', 'the whole screen');
    // its style is computed at 0 before it turns 1, or there is no transition and the screen goes black at once
    assert.equal(body.styleReads[0], '0', 'the veil\'s style is read at opacity 0 first');
    assert.equal(store.get().ui.season, before, 'no pick before the screen is black');
    let pickedAt = 0;
    const off = store.subscribe((s) => { if (!pickedAt && s.ui.season === 'act3autochess') pickedAt = Date.now() - t0; });
    await run;
    off();
    assert.ok(pickedAt >= SEASON_FADE.out - 30, `picked at ${pickedAt} ms, after the fade down`);
    assert.equal(store.get().ui.season, 'act3autochess');
    assert.equal(body.kids.length, 0, 'the veil is gone once lit');
    // two picks in a row: the first never lands, the second does
    const a = pickSeasonThroughDark('act2autochess');
    await new Promise((r) => setTimeout(r, 50));
    const b = pickSeasonThroughDark('act3autochess');
    await Promise.all([a, b]);
    assert.equal(store.get().ui.season, 'act3autochess');
    assert.equal(body.kids.length, 0);
  } finally {
    store.patch('ui', { season: before });
    delete globalThis.document;
    delete globalThis.getComputedStyle;
  }
});

test('the lobby chip picks through the dark; the title has no season tabs', () => {
  assert.match(read('public/js/screens/lobby.js'), /<\$\{SeasonChip\} onPick=\$\{pickSeasonThroughDark\} \/>/);
  const season = read('public/js/ui/season.js');
  assert.doesNotMatch(season, /export function SeasonTabs/);
  assert.match(season, /const choose = \(id\) => \{ setOpen\(false\); if \(id !== st\.picked\) onPick\(id\); \};/);
  const title = read('public/js/screens/title.js');
  assert.doesNotMatch(title, /SeasonTabs|useSeasonFade|title-bg__veil/);
});
