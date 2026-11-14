// Korean line breaking on the in-match screens (mock harness, headless Chrome). Opt-in: SP_E2E=1.
//
//   SP_E2E=1 node --test test/ui/ko-linebreak.e2e.test.js
//
// The Korean pack breaks lines with `word-break: keep-all; overflow-wrap: anywhere` (public/i18n/ko/ko.css). Under
// `anywhere` a box's min-content width is one letter, so a flex row whose box comes out a pixel short (a web font that
// swaps in wider than the one the row was sized with) shrinks its items and breaks every short word in them a letter
// per line: the step header's 「2 / 2 · 전략 / 선택」, a skill's 「초 / 기」 and its SP numbers. A label that cannot shrink
// runs out of its button instead (队友已选 「팀원 선택 완료」 over 跳过). For every screen below at three sizes this test
// fails on a short word broken across lines, on a short word that breaks when its flex row (one with text of its own) is
// made 2 px narrower, and on a button label outside its button. docs/rules/ui.md 「한국어 줄바꿈」.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { launchBrowser, loadingScreenGone } from '../e2e/browser.mjs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);

const SIZES = [[1920, 1080], [1280, 720], [960, 540]];
/** [name, mock query, what to press first] — the press brings up the state the screen shows only on demand. */
const SCREENS = [
  ['briefing', 'phase=INFO_CHECK', null],
  ['draft · a band a teammate took', 'phase=BAND_DRAFT', 'taken'],
  ['shop card detail · skill tab', 'phase=PREP&variant=detail', 'skill'],
  ['board piece detail · skill tab', 'phase=PREP&variant=detailpiece&render=fallback', 'skill'], // the fallback view's pieces take the right-click
];

/** In the page: what breaks (see the header). Returns one line per finding. */
function probe() {
  const out = [];
  const range = document.createRange();
  const where = (el) => `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).join('.')}`;
  /** Short words (2–6 letters) under `root` whose letters sit on different lines; adjacent text nodes read as one text. */
  const broken = (root) => {
    const found = [];
    const runs = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(), run = null; n; n = walker.nextNode()) {
      if (run && n.previousSibling === run.at(-1)) run.push(n);
      else runs.push((run = [n]));
    }
    for (const run of runs) {
      const el = run[0].parentElement;
      if (!el || !el.getClientRects().length) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      const half = parseFloat(cs.fontSize) / 2;
      const chars = run.flatMap((n) => [...n.data].map((_, i) => [n, i]));
      const text = run.map((n) => n.data).join('');
      for (const m of text.matchAll(/\S{2,6}/g)) {
        let top = null;
        for (let k = m.index; k < m.index + m[0].length; k++) {
          range.setStart(chars[k][0], chars[k][1]); range.setEnd(chars[k][0], chars[k][1] + 1);
          const r = range.getClientRects()[0];
          if (!r || !r.width) continue;
          if (top === null) top = r.top;
          else if (Math.abs(r.top - top) > half) { found.push(`${where(el)}: 「${m[0]}」`); break; }
        }
      }
    }
    return found;
  };
  const app = document.querySelector('#app') || document.body;
  for (const line of broken(app)) out.push(`${line} broken across lines`);
  for (const el of app.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (!/flex/.test(cs.display) || cs.flexDirection.startsWith('column') || cs.flexWrap !== 'nowrap') continue;
    if (![...el.childNodes].some((c) => c.nodeType === 3 && c.data.trim())) continue;
    const w = el.getBoundingClientRect().width;
    if (!w || broken(el).length) continue;
    const was = el.style.maxWidth;
    el.style.maxWidth = `${w - 2}px`;
    const squeezed = broken(el);
    el.style.maxWidth = was;
    if (squeezed.length) out.push(`${where(el)} 2 px narrower breaks ${squeezed.map((x) => x.slice(x.indexOf('「'))).join(' ')}`);
  }
  for (const b of app.querySelectorAll('.btn')) {
    const box = b.getBoundingClientRect();
    const label = b.querySelector('.btn__label');
    if (!box.width || !label) continue;
    const r = label.getBoundingClientRect();
    if (r.left < box.left - 1 || r.right > box.right + 1) out.push(`${where(b)}: 「${label.textContent.trim()}」 runs out of its button (${Math.round(r.width)} px in ${Math.round(box.width)} px)`);
  }
  return out;
}

describe('Korean line breaking (mock harness, headless Chrome)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
  let srv;
  let browser;
  let base;

  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    base = `http://127.0.0.1:${srv.port}`;
    browser = await launchBrowser(puppeteer, { executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  });

  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  for (const [name, query, press] of SCREENS) {
    test(`${name}: no short word broken a letter per line, no label out of its button`, async () => {
      const found = [];
      let ran = 0;
      for (const [w, h] of SIZES) {
        const page = await browser.newPage();
        try {
          await page.setViewport({ width: w, height: h });
          await page.goto(`${base}/dev/game-mock.html?shot=1&lang=ko&${query}`, { waitUntil: 'networkidle0' });
          await page.waitForFunction(() => !!document.querySelector('.screen:not(.gload)'), { timeout: 15000 });
          await loadingScreenGone(page, 20000).catch(() => {});
          await page.evaluate(() => document.fonts.ready);
          await new Promise((r) => setTimeout(r, 900));
          assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowWrap), 'anywhere',
            'the mock page links the Korean pack (i18n/ko/ko.css), as index.html does');
          if (press === 'taken') {
            const ok = await page.evaluate(() => {
              const band = [...document.querySelectorAll('.dband')].find((e) => e.querySelector('.dband__taken'));
              band?.click();
              return !!band;
            });
            assert.ok(ok, 'the mock draft has a band a teammate took');
            await page.waitForSelector('.draft-pick--taken', { timeout: 5000 });
          } else if (press === 'skill') {
            const ok = await page.evaluate(() => {
              const tab = [...document.querySelectorAll('.tabs__tab, [role=tab]')].find((b) => /^\s*스킬\s*$/.test(b.textContent));
              tab?.click();
              return !!tab;
            });
            if (ok) await page.waitForSelector('.dsp__num', { timeout: 5000 });
            else assert.ok(await page.$('.dsp__num'), 'the detail shows a skill');
          }
          await new Promise((r) => setTimeout(r, 300));
          for (const line of await page.evaluate(probe)) found.push(`${w}×${h} ${line}`);
          ran++;
        } finally {
          await page.close();
        }
      }
      assert.equal(ran, SIZES.length);
      assert.deepEqual(found, [], `Korean line breaking (docs/rules/ui.md 「한국어 줄바꿈」): a flex item with short words needs ` +
        '`white-space: nowrap`, a long button label room to wrap between words:\n' + found.join('\n'));
    });
  }
});
