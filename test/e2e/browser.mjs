// The browser every opt-in suite drives: puppeteer's launch plus the page defaults the suites assume.
//
// The suites find the UI by its source text (Chinese, `t('…')`), while a first visit opens in Korean, and with a resource
// list served the consent card (`.res-ask`) covers the lobby's and the room's buttons. So each new page starts as a
// returning Chinese-language player who postponed the download. A value already stored is kept: a suite switching
// languages, or preparing a pref itself, still decides. `launchBrowser(puppeteer, opts, { lang: null })` keeps a real first
// visit (the language and the card as a new player gets them). Not a test file itself.

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
