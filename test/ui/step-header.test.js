// The start-step header (ui/matchChrome.js StepHeader / StepChain / stepHeadArt; docs/rules/ui.md 「판 시작 단계 머리」):
// the official left chain after the exit tile — the mode plate (its picture, the name in the mode's colour) | the 规则 mode |
// the divider | 规程: the theme's character + the bubble 「n/3 title」, 盟约: 「n/2 title» — in place of the centred title
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
        assert.ok(art.char && art.bubble, `step ${step}: the theme character and the bubble (${RULE})`);
        assert.match(art.bubble, step === 3 ? /\/diychoose\/pop\.png$/ : /\/stageinfo\/img_chat_babble\.png$/);
        assert.equal(!!art.split, step !== 3, 'step 3 draws the flat divider, steps 1–2 img_split_line');
      }
    }
    assert.match(stepHeadArt(1, 'FAST', ACT3).char, /\/skin\/img_char_spine_outer\.png$/, 'the default theme\'s still picture');
  });
  await withSeason(DEFAULT_SEASON, async () => {
    const modes = modesOf('data/config.json');
    assert.ok(modes.some((m) => m.difficulty === 'TRAINING') && modes.some((m) => m.difficulty === 'ABYSS'), 'the sweep sees the 盟约 modes');
    for (const m of modes) {
      for (const step of [1, 2]) {
        const art = stepHeadArt(step, m.difficulty, DEFAULT_SEASON);
        assert.ok(!art.cn && art.plate, `${m.modeId} (${m.difficulty}) step ${step}: no plate picture in ui/outer (${RULE})`);
        assert.ok(!art.char && !art.bubble, '盟约 has no character and no bubble');
      }
    }
    assert.match(stepHeadArt(1, 'TRAINING', DEFAULT_SEASON).plate, /img_title_mode_guide\.png$/);
    assert.match(stepHeadArt(2, 'TRAINING', DEFAULT_SEASON).plate, /mode_train\.png$/);
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

test('盟约: plate | divider | 「n/2 title」, no character or bubble', async () => {
  await withSeason(DEFAULT_SEASON, async () => {
    const chain = StepChain({ step: 2, of: 2, title: '选择策略', pub: { modeId: 'mode_multi_abyss', difficulty: 'ABYSS' }, season: DEFAULT_SEASON });
    assert.deepEqual(parts(chain), ['sh-mode', 'sh-split', 'sh-plain']);
    assert.equal(textOf(find(chain, 'sh-plain')), '2/2选择策略');
    assert.ok(classes(find(chain, 'sh-split')).includes('is-flat'), '盟约 step 2: the flat divider');
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
