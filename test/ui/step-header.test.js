// The start-step header (ui/matchChrome.js StepHeader / StepChain / stepHeadArt; docs/rules/ui.md 「판 시작 단계 머리」):
// the official left chain after the exit tile — the mode plate (its picture, the name in the mode's colour) | the 规则 mode |
// the divider | 规程: the theme's character + the bubble 「n/3 title」, 盟约: 「n/3 title」 — in place of the centred title
// (maintainer decision 2026-11-18). The plate picture is picked per modeDifficulty by a hand-written name table (TRAINING →
// guide / train), so the sweep below asserts every mode of both seasons finds its picture in the extract.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
let localOverride = null;
// the page's /data/<file> and /data/s/<season>/<file> from the repository's data/ (server/index.js serves them so)
globalThis.fetch = async (url) => {
  const m = /\/data\/(?:s\/([a-z0-9]+)\/)?([\w.-]+)$/.exec(String(url));
  if (localOverride && m?.[2] === 'local-assets.json') return { ok: true, status: 200, json: async () => localOverride };
  try {
    const body = readFileSync(path.join(ROOT, 'data', ...(m?.[1] ? ['seasons', m[1]] : []), m?.[2] ?? ''), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};

const { data } = await import('../../public/js/data.js');
const { StepChain, stepHeadArt } = await import('../../public/js/ui/matchChrome.js');
const { DifficultyTag } = await import('../../public/js/ui/components.js');
const { DEFAULT_SEASON } = await import('../../shared/seasons.js');

const ACT3 = 'act3autochess';
const RULE = 'docs/rules/ui.md 「판 시작 단계 머리」';
const localJson = (() => { try { return JSON.parse(read('data/local-assets.json')); } catch { return null; } })();
/** A served picture's pixel size from its PNG header (public/<url>), null when the file is not on this machine. */
function pngSize(url) {
  let b;
  try { b = readFileSync(path.join(ROOT, 'public', url)); } catch { return null; }
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
/** The plate's border-image slices (css/screens/briefing.css .sh-mode::before) are cut for the 68-high plate. */
function assertPlateSize(url, what) {
  const size = pngSize(url);
  if (size) assert.equal(size.h, 68, `${what}: ${url} is ${size.w}×${size.h}, not a 68-high mode plate — a same-named sprite of another prefab (ui/outer mode_normal / mode_abyss are the mode list's 147×40 buttons); see ${RULE}`);
  return !!size;
}

function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  yield* walk(v.props?.children);
}
const classes = (v) => (typeof v?.props?.class === 'string' ? v.props.class.split(/\s+/) : []);
const find = (v, c) => [...walk(v)].find((n) => classes(n).includes(c));
const textOf = (v) => (v == null || typeof v === 'boolean' ? '' : typeof v !== 'object' ? String(v) : Array.isArray(v) ? v.map(textOf).join('') : textOf(v.props?.children));
/** The chain's own parts, in order (the class each starts with). */
const parts = (chain) => [chain.props.children].flat(Infinity).filter((c) => c && typeof c === 'object').map((c) => classes(c)[0]);

async function withSeason(season, fn) {
  await data.setSeason(season);
  try {
    await data.invalidate('local');
    await data.loadAll('config', 'assets', 'local');
    await fn();
  } finally {
    await data.setSeason(DEFAULT_SEASON);
  }
}

test('every mode of both seasons finds its plate picture, 规程 its character, divider and bubbles (stepHeadArt)', async (t) => {
  if (!localJson?.groups?.[`season/${ACT3}/stageinfo`]) { t.skip('no local client extract (data/local-assets.json season/act3autochess/stageinfo)'); return; }
  const modesOf = (file) => Object.values(JSON.parse(read(file)).modes);
  await withSeason(ACT3, async () => {
    const modes = modesOf(`data/seasons/${ACT3}/config.json`);
    assert.ok(modes.some((m) => m.difficulty === 'FAST') && modes.some((m) => m.difficulty === 'ABYSS'), 'the sweep sees the 规程 modes');
    for (const m of modes) {
      for (const step of [1, 2, 3]) {
        const art = stepHeadArt(step, m.difficulty, ACT3);
        assert.ok(art.cn && art.plate, `${m.modeId} (${m.difficulty}) step ${step}: no plate picture — StepChain falls back to the tag; see ${RULE}`);
        assert.match(art.plate, step === 1 ? /\/stageinfo\/img_title_mode_\w+\.png$/ : /\/diychoose\/mode_\w+\.png$/);
        assertPlateSize(art.plate, `${m.modeId} step ${step}`);
        assert.ok(art.char && art.bubble, `step ${step}: the theme character and the bubble (${RULE})`);
        assert.match(art.bubble, step === 3 ? /\/diychoose\/pop\.png$/ : /\/stageinfo\/img_chat_babble\.png$/);
        assert.equal(!!art.split, step !== 3, 'step 3 draws the flat divider, steps 1–2 img_split_line');
      }
    }
    assert.match(stepHeadArt(1, 'FAST', ACT3).char, /\/skin\/img_char_spine_outer\.png$/, 'the default theme\'s still picture');
  });
  await withSeason(DEFAULT_SEASON, async () => {
    const modes = modesOf('data/config.json');
    let sized = 0;
    assert.ok(modes.some((m) => m.difficulty === 'TRAINING') && modes.some((m) => m.difficulty === 'ABYSS'), 'the sweep sees the 盟约 modes');
    for (const m of modes) {
      for (const step of [1, 2, 3]) {
        const art = stepHeadArt(step, m.difficulty, DEFAULT_SEASON);
        assert.ok(!art.cn && art.plate, `${m.modeId} (${m.difficulty}) step ${step}: no plate picture (${RULE})`);
        if (step !== 1) assert.match(art.plate, /\/bandChoose\/mode_\w+\.png$/, `${m.modeId} step 2: the 选择策略 screen's own sprite, never ui/outer's same-named button (${RULE})`);
        if (assertPlateSize(art.plate, `${m.modeId} step ${step}`)) sized++;
        assert.ok(!art.char && !art.bubble, '盟约 has no character and no bubble');
      }
    }
    assert.match(stepHeadArt(1, 'TRAINING', DEFAULT_SEASON).plate, /img_title_mode_guide\.png$/);
    assert.match(stepHeadArt(2, 'TRAINING', DEFAULT_SEASON).plate, /mode_train\.png$/);
    assert.ok(sized > 0 || !pngSize('/assets/ui/bandChoose/mode_hard.png'), 'the size check saw the 盟约 plates');
  });
});

test('规程: plate (name in the mode colour) | divider | character | bubble 「n/3 title」; no centred title, no 本局信息 button', async () => {
  localOverride = {
    version: 1, groups: {
      [`season/${ACT3}/stageinfo`]: Object.fromEntries(['img_title_mode_normal', 'img_split_line', 'img_chat_babble'].map((n) => [n, { path: `/s/${n}.png`, w: 2, h: 2, kind: 'Sprite' }])),
      [`season/${ACT3}/diychoose`]: Object.fromEntries(['mode_normal', 'pop'].map((n) => [n, { path: `/d/${n}.png`, w: 2, h: 2, kind: 'Sprite' }])),
      [`season/${ACT3}/skin`]: { img_char_spine_outer: { path: '/k/char.png', w: 113, h: 96, kind: 'Sprite' } },
    },
  };
  try {
    await withSeason(ACT3, async () => {
      const pub = { modeId: 'mode_single_5', difficulty: 'NORMAL', ruleset: { preset: 'casual' } };
      const one = StepChain({ step: 1, of: 3, title: '确认本局信息', pub, season: ACT3 });
      assert.deepEqual(parts(one), ['sh-mode', 'stephead__tags', 'sh-split', 'sh-char', 'sh-bub'], `the official chain order, the 规则 tag after the plate (${RULE})`);
      const plate = find(one, 'sh-mode');
      assert.match(plate.props.style, /--mt:url\("\/s\/img_title_mode_normal\.png"\);--mc:#e85a1a/, 'step 1 plate picture, the name in the mode\'s modeColor');
      assert.equal(textOf(plate), '规程等级 5');
      assert.equal(textOf(find(one, 'sh-bub')), '1/3确认本局信息');
      assert.ok(find(one, 'rtag'), 'the 规则 mode tag stays in the chain');
      const three = StepChain({ step: 3, of: 3, title: '确定自选编队', pub: { ...pub, ruleset: null }, season: ACT3 });
      assert.deepEqual(parts(three), ['sh-mode', 'sh-split', 'sh-char', 'sh-bub']);
      assert.ok(classes(find(three, 'sh-split')).includes('is-flat') && classes(find(three, 'sh-bub')).includes('is-pop'), 'step 3: flat divider, the pop bubble');
      assert.match(find(three, 'sh-mode').props.style, /\/d\/mode_normal\.png/);
    });
    // no picture: the difficulty tag stands in for the plate, the bubble draws its CSS stand-in, no character
    localOverride = { version: 1, groups: {} };
    await withSeason(ACT3, async () => {
      const bare = StepChain({ step: 2, of: 3, title: '选择策略', pub: { modeId: 'mode_single_5', difficulty: 'NORMAL' }, season: ACT3 });
      assert.deepEqual(parts(bare), ['sh-mode', 'sh-split', 'sh-bub']);
      assert.ok([...walk(bare)].some((n) => n.type === DifficultyTag), 'the tag stands in for the plate');
      assert.ok(classes(find(bare, 'sh-bub')).includes('no-art'));
    });
  } finally {
    localOverride = null;
    await data.invalidate('local');
  }
  const src = read('public/js/ui/matchChrome.js');
  assert.doesNotMatch(src, /stephead__center|stephead__title|btn_game_detail/, `the centred title and its micro label are gone; the 本局信息 button stays out of the header (${RULE})`);
});

test('盟约: plate | divider | 「n/3 title」, no character or bubble — its 3/3 too (maintainer decision 2026-11-19)', async () => {
  const { startStepCount } = await import('../../public/js/ui/gameLogic.js');
  await withSeason(DEFAULT_SEASON, async () => {
    const of = startStepCount(data.get('config'));
    assert.equal(of, 3, `盟约's data has the three start steps (CUSTOM_CHECK), so its header reads 「n/3」 (${RULE})`);
    const chain = StepChain({ step: 2, of, title: '选择策略', pub: { modeId: 'mode_multi_abyss', difficulty: 'ABYSS' }, season: DEFAULT_SEASON });
    assert.deepEqual(parts(chain), ['sh-mode', 'sh-split', 'sh-plain']);
    assert.equal(textOf(find(chain, 'sh-plain')), '2/3选择策略');
    assert.ok(classes(find(chain, 'sh-split')).includes('is-flat'), '盟约 step 2: the flat divider');
    const three = StepChain({ step: 3, of, title: '确定自选编队', pub: { modeId: 'mode_multi_abyss', difficulty: 'ABYSS' }, season: DEFAULT_SEASON });
    assert.deepEqual(parts(three), ['sh-mode', 'sh-split', 'sh-plain'], `盟约 step 3: the 盟约 chain, not 规程's character and pop bubble (${RULE})`);
    assert.equal(textOf(find(three, 'sh-plain')), '3/3确定自选编队');
    assert.ok(classes(find(three, 'sh-split')).includes('is-flat'));
    assert.equal(stepHeadArt(3, 'ABYSS', DEFAULT_SEASON).plate, stepHeadArt(2, 'ABYSS', DEFAULT_SEASON).plate, '盟约 step 3: the 选择策略 plate');
  });
});

test('the chain is level with the exit button: the header reads the ping height the tile uses (css)', () => {
  const comp = read('public/css/components.css');
  assert.match(comp, /\.exit-tile, \.stephead \{ --eu: \.0128rem; --exit-ping-gap: [^;]+; --exit-ping-h: [^;]+; --exit-below: calc\(var\(--exit-ping-gap\) \+ var\(--exit-ping-h\)\); \}/);
  assert.match(comp, /\.exit-tile \.exit-tile__ping \{[^}]*margin-top: var\(--exit-ping-gap\);[^}]*height: var\(--exit-ping-h\);/, 'the ping\'s size is the variable the header reads');
  const css = read('public/css/screens/briefing.css');
  assert.match(css, /\.stephead__chain \{ --c: calc\(\(var\(--sh-h\) - var\(--exit-below\)\) \/ 2\);/, 'the button centre: the tile is centred in the header');
  assert.match(css, /\.sh-mode \{[^}]*margin-top: calc\(var\(--c\) - 34 \* var\(--eu\)\);/, `the plate's centre is the button's (maintainer decision 2026-11-18, ${RULE})`);
});

test('the 规程 bubble stays whole inside the header at every root size, with a gap after 「n/N」 (css)', () => {
  const comp = read('public/css/components.css');
  const css = read('public/css/screens/briefing.css');
  const num = (re, text, what) => { const m = text.match(re); assert.ok(m, `${what} not found (${RULE})`); return m.slice(1).map(Number); };
  const [eu] = num(/\.exit-tile, \.stephead \{ --eu: ([\d.]+)rem;/, comp, '--eu');
  const [gapEu, pingEu, pingMin] = num(/--exit-ping-gap: calc\(([\d.]+) \* var\(--eu\)\); --exit-ping-h: max\(calc\(([\d.]+) \* var\(--eu\)\), (\d+)px\);/, comp, 'the desktop ping');
  const [gapPhone, pingPhone] = num(/\.exit-tile, \.stephead \{ --exit-ping-gap: (\d+)px; --exit-ping-h: (\d+)px; \}/, comp, 'the phone ping');
  const [shH] = num(/\.stephead \{\s*--sh-h: ([\d.]+)rem;/, css, '--sh-h');
  const bub = css.match(/\.sh-bub \{[^}]*\}/)?.[0] || '';
  const [height] = num(/height: calc\((\d+) \* var\(--eu\)\)/, bub, 'the bubble height');
  const [lift] = num(/margin: max\(0px, calc\(var\(--c\) - (\d+) \* var\(--eu\)\)\)/, bub, 'the bubble top, clamped to the header');
  assert.match(bub, /gap: calc\(8 \* var\(--eu\)\)/, `「/N」 and the title 8 apart, as the picked mockup (${RULE})`);
  assert.doesNotMatch(css, /\.sh-bub[^{]*\.sh-num \{[^}]*min-width/, 'no fixed 「n/N」 width: the prefab 70 is narrower than our number font and left no gap');
  // the root size is clamp(40px, …, 240px); the phone (height ≤ 520) uses the fixed ping, its root is 40 px there
  const cases = [40, 60, 83.3, 120, 240].map((rem) => ({ rem, below: gapEu * eu * rem + Math.max(pingEu * eu * rem, pingMin) }));
  cases.push({ rem: 40, below: gapPhone + pingPhone, phone: true });
  for (const { rem, below, phone } of cases) {
    const u = eu * rem; const head = shH * rem; const c = (head - below) / 2;
    const top = c - lift * u;
    assert.ok(top >= 0 && top + height * u <= head + 0.5,
      `root ${rem}px${phone ? ' (phone)' : ''}: the bubble ${top.toFixed(1)}–${(top + height * u).toFixed(1)} px leaves the ${head.toFixed(1)} px header (${RULE})`);
  }
});
