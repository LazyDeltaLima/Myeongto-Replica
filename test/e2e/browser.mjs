// The browser every opt-in suite drives: puppeteer's launch plus the page defaults the suites assume.
//
// The suites find the UI by its source text (Chinese, `t('…')`), while a first visit opens in Korean, and with a resource
// list served the consent card (`.res-ask`) covers the lobby's and the room's buttons. So each new page starts as a
// returning Chinese-language player who postponed the download. A value already stored is kept: a suite switching
// languages, or preparing a pref itself, still decides. `launchBrowser(puppeteer, opts, { lang: null })` keeps a real first
// visit (the language and the card as a new player gets them). Not a test file itself.

import { execFileSync } from 'node:child_process';

/** localStorage values a new page starts with. Runs in the page, before any of its scripts. */
function seedPrefs(prefs) {
  try {
    for (const [k, v] of Object.entries(prefs)) if (localStorage.getItem(k) == null) localStorage.setItem(k, v);
  } catch { /* no storage on this document (about:blank) */ }
}

/** The stored prefs of a returning player in language `lang`; none for `lang: null`. */
export function defaultPrefs({ lang = 'zh' } = {}) {
  if (!lang) return {};
  return {
    'sp.pref.lang': JSON.stringify(lang),
    'sp.pref.resources': JSON.stringify({ consent: 'later', at: Date.now() }),
  };
}

/** Apply the defaults to one page. Call before its first navigation. */
export async function preparePage(page, opts = {}) {
  const prefs = defaultPrefs(opts);
  if (Object.keys(prefs).length) await page.evaluateOnNewDocument(seedPrefs, prefs);
  return page;
}

/**
 * Wait until the battle loading screen (`.bload`, ui/battleArt.js LoadingScreen) has left. It covers the whole screen while
 * the field view loads and takes presses until its fade starts, so a press aimed at the board must wait for it, for
 * however long the art takes on this machine.
 */
export function loadingScreenGone(page, timeout = 60000) {
  return page.waitForFunction(() => !document.querySelector('.bload'), { timeout });
}

/**
 * A local file's path as the browser sees it, for `uploadFile`. The Windows Chrome the WSL wrapper starts
 * (test/helpers/wsl-windows-chrome.sh) cannot open a WSL path: it needs the path `wslpath -w` gives.
 */
export function browserFilePath(file) {
  if (!/wsl-windows-chrome\.sh$/.test(process.env.CHROME_PATH || '')) return file;
  return execFileSync('wslpath', ['-w', file], { encoding: 'utf8' }).trim();
}

/**
 * Show a tab of the open card. The official-form card (ui/detailArt.js) keeps each block on a tab, 技能 / 特性 / 天赋 …; the
 * plain card has no tabs and shows everything at once, so there this does nothing. Returns whether a tab was pressed.
 */
export function cardTab(page, label) {
  return page.evaluate(async (label) => {
    const b = [...document.querySelectorAll('.dpanel .dart__tab')].find((x) => x.textContent.trim() === label);
    if (!b) return false;
    b.click();
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
    return true;
  }, label);
}

/**
 * What the open operator card says, in either form, or null when no card opens within `timeout`. Leaves the card on its
 * first tab. `stats` holds the record's values: a live card carries them as the cell's title "基础 N". `diyTag` is the
 * plain card's only: the official form has no such tag.
 */
export async function readChessCard(page, timeout = 2500) {
  const open = await page.waitForSelector('.dpanel .dart__name, .dpanel .dhead__name', { timeout }).then(() => true, () => false);
  if (!open) return null;
  return page.evaluate(async () => {
    const panel = document.querySelector('.dpanel');
    const text = (sel) => panel.querySelector(sel)?.textContent ?? '';
    const tabs = [...panel.querySelectorAll('.dart__tab')];
    const show = async (label) => {
      const b = tabs.find((x) => x.textContent.trim() === label);
      if (!b) return;
      b.click();
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
    };
    const card = {
      official: tabs.length > 0,
      name: text('.dart__name, .dhead__name'),
      standInFor: text('.dart__for, .dhead__for'),
      standInTag: text('.dtag-standin'),
      diyTag: text('.dtag-diy'),
      stats: Object.fromEntries([...panel.querySelectorAll('.dart__stat, .dstat')].map((el) => [
        el.querySelector('.dstat__k, span')?.textContent,
        (el.getAttribute('title') || '').replace(/^基础 /, '') || el.querySelector('.dstat__v, b')?.textContent,
      ])),
    };
    await show('技能');
    Object.assign(card, {
      skillId: panel.querySelector('.dskill')?.dataset.skill ?? '',
      skill: text('.dskill__name'),
      skillTag: !!panel.querySelector('.dskill__name .dtag-loadout'),
      module: text('.dmodule'),
      moduleNone: !!panel.querySelector('.dmodule.is-none'),
    });
    await show('特性');
    card.trait = text('.dtrait');
    tabs[0]?.click();
    return card;
  });
}

/**
 * `puppeteer.launch(launchOpts)` whose pages all start with the defaults: `browser.newPage()` and the first tab.
 * @param {{ launch: Function }} puppeteer
 * @param {object} launchOpts
 * @param {{ lang?: string|null }} [defaults]
 */
export async function launchBrowser(puppeteer, launchOpts, defaults = {}) {
  const browser = await puppeteer.launch(launchOpts);
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...args) => preparePage(await newPage(...args), defaults);
  const prepared = new WeakSet();
  const pages = browser.pages.bind(browser);
  browser.pages = async () => {
    const list = await pages();
    for (const p of list) if (!prepared.has(p)) { prepared.add(p); await preparePage(p, defaults); }
    return list;
  };
  // a separate context has its own storage: its pages need the defaults as well
  const createBrowserContext = browser.createBrowserContext.bind(browser);
  browser.createBrowserContext = async (...args) => {
    const ctx = await createBrowserContext(...args);
    const ctxNewPage = ctx.newPage.bind(ctx);
    ctx.newPage = async (...a) => preparePage(await ctxNewPage(...a), defaults);
    return ctx;
  };
  return browser;
}
