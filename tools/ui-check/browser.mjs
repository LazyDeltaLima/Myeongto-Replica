// tools/ui-check/browser.mjs — the browser half of tools/ui-check.mjs: start a Chrome, open one screen of ours in a
// given state, and hand the page back. Shared by every ui-check command (compare: the overlay against an official
// screenshot), so a state is written once as a spec (`ours` below) and every check sees the same screen.
//
// Chrome: opts.chrome, else CHROME_PATH, else the usual install paths. Under WSL use the Windows Chrome through
// test/helpers/wsl-windows-chrome.sh (the GPU, and its own profile under the Windows %TEMP%): the profile passed here is a
// fresh temp folder, which that script swaps for a Windows one. Every wait has a hard limit.
//
// The `ours` part of a spec:
//   url        the page under --base, e.g. "/dev/game-mock.html?phase=PREP&lang=ko&season=act3autochess"
//   viewport   [w, h] CSS px (deviceScaleFactor 1 unless `dpr`); `touch`: true emulates a phone (isMobile + touch)
//   lang       the UI language pref set before the page loads (default "ko")
//   ready      { selector, absent: [selector…], stable: n } — polled every 250 ms until `selector` is there and none of
//              `absent` for n polls in a row (default 4), then document.fonts.ready
//   uiK        the PC UI-size factor (--ui-k on <html>, css/hud-art.css) to force, or a target px per unit (uiPxPerUnit)
//              solved into one: our unit is linear in k at a given viewport, so two probes give the k
//   steps      [{click: sel, nth, text} | {wait: sel, timeout} | {sleep: ms} | {move: [x, y]} | {hide: sel} | {key: name}
//              | {style: css}] in order; a click is a mouse click (a tap with `touch`) at the centre of the nth visible
//              match; style adds a stylesheet (a what-if, or breaking a cell on purpose to see a check fail).

/* global document, requestAnimationFrame -- inside page.evaluate callbacks, which run in the browser */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The Chrome to start: the option, CHROME_PATH, or the first usual path that exists. */
export function chromePath(opt) {
  const p = (typeof opt === 'string' && opt) || process.env.CHROME_PATH || CHROMES.find((c) => fs.existsSync(c));
  if (!p) throw new Error('ui-check: no Chrome — pass --chrome or set CHROME_PATH (WSL: test/helpers/wsl-windows-chrome.sh)');
  return p;
}

/**
 * The --ui-k that gives `target` px per unit, from our unit measured at two k (css/hud-art.css: linear in k between its
 * clamps). Throws when the target is outside what the slider's CSS can reach at this viewport.
 * @param {number} target @param {{k: number, u: number}} a @param {{k: number, u: number}} b
 */
export function solveUiK(target, a, b) {
  if (!(target > 0)) throw new Error(`ui-check: bad target px per unit ${target}`);
  if (Math.abs(b.u - a.u) < 1e-6) {
    if (Math.abs(a.u - target) / target < 0.002) return a.k;
    throw new Error(`ui-check: our unit is ${a.u.toFixed(4)} px at this viewport whatever --ui-k is (the clamp) — cannot reach ${target}`);
  }
  const k = a.k + ((target - a.u) * (b.k - a.k)) / (b.u - a.u);
  if (!(k > 0.5 && k <= 1.0001)) throw new Error(`ui-check: ${target} px per unit needs --ui-k ${k.toFixed(4)}, outside (0.5, 1] — pick a viewport where the official scale is reachable`);
  return Math.min(1, k);
}

/** Our px per canvas unit on the page now (--ui-u of css/hud-art.css). */
async function unitPx(page) {
  return page.evaluate(() => {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;width:calc(var(--ui-u, .015rem) * 1000);height:1px';
    document.body.appendChild(d);
    const w = d.getBoundingClientRect().width;
    d.remove();
    return w / 1000;
  });
}

async function setK(page, k) {
  await page.evaluate((k) => document.documentElement.style.setProperty('--ui-k', String(k)), k);
  return unitPx(page);
}

/**
 * Start Chrome and open `ours` (see the header) under `base`. Returns { browser, page, problems, scale, close }; problems
 * collects 4xx / failed requests and page errors from the start.
 */
export async function openScreen(ours, { base, chrome, timeoutMs = 120000, log = () => {} } = {}) {
  const { default: puppeteer } = await import('puppeteer-core');
  const [w, h] = ours.viewport || [1920, 1080];
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-check-'));
  const browser = await puppeteer.launch({
    executablePath: chromePath(chrome), headless: 'new', protocolTimeout: timeoutMs,
    args: [`--user-data-dir=${profile}`, '--no-first-run', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--hide-scrollbars'],
  });
  const close = async () => { await browser.close().catch(() => {}); fs.rmSync(profile, { recursive: true, force: true }); };
  const problems = { requests: [], errors: [] };
  try {
    const [first] = await browser.pages();
    const page = first || await browser.newPage();
    const touch = !!ours.touch;
    await page.setViewport({ width: w, height: h, deviceScaleFactor: ours.dpr || 1, isMobile: touch, hasTouch: touch });
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    page.on('pageerror', (e) => problems.errors.push(String(e).slice(0, 300)));
    page.on('response', (r) => { if (r.status() >= 400) problems.requests.push(`${r.status()} ${r.url()}`); });
    page.on('requestfailed', (r) => problems.requests.push(`failed ${r.failure()?.errorText} ${r.url()}`));
    const lang = ours.lang || 'ko';
    await page.evaluateOnNewDocument((lang) => {
      try { localStorage.setItem('sp.pref.lang', JSON.stringify(lang)); localStorage.setItem('sp.pref.lang.raw', lang); } catch { /* private mode */ }
    }, lang);
    const url = new URL(ours.url, base.replace(/\/?$/, '/')).href;
    log(`open ${url} at ${w}×${h}${touch ? ' touch' : ''}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitReady(page, ours.ready);
    let scale = null;
    if (ours.uiK != null || ours.uiPxPerUnit != null) {
      let k = ours.uiK;
      if (k == null) {
        const a = { k: 1, u: await setK(page, 1) }, b = { k: 0.9, u: await setK(page, 0.9) };
        k = solveUiK(ours.uiPxPerUnit, a, b);
      }
      const u = await setK(page, k);
      scale = { k, pxPerUnit: u };
      log(`--ui-k ${k.toFixed(4)} → ${u.toFixed(4)} px per unit`);
      await sleep(300);
    } else {
      scale = { k: null, pxPerUnit: await unitPx(page) };
    }
    await runSteps(page, ours.steps || [], { touch });
    return { browser, page, problems, scale, close };
  } catch (e) {
    await close();
    throw e;
  }
}

/** Poll until the screen is drawn (see the header's `ready`), then wait for the web fonts. */
export async function waitReady(page, ready, timeoutMs = 90000) {
  if (ready) {
    const t0 = Date.now();
    let ok = 0;
    const need = ready.stable || 4;
    while (ok < need) {
      if (Date.now() - t0 > timeoutMs) throw new Error(`ui-check: not ready after ${timeoutMs} ms (${JSON.stringify(ready)})`);
      const clear = await page.evaluate((r) => (!r.selector || !!document.querySelector(r.selector)) && !(r.absent || []).some((s) => document.querySelector(s)), ready);
      ok = clear ? ok + 1 : 0;
      await sleep(250);
    }
  }
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

async function point(page, sel, nth = 0, text = null, timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const pt = await page.evaluate((sel, nth, text) => {
      let n = 0;
      for (const el of document.querySelectorAll(sel)) {
        if (text && !(el.textContent || '').includes(text)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        if (n++ < nth) continue;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      return null;
    }, sel, nth, text);
    if (pt) return pt;
    await sleep(200);
  }
  throw new Error(`ui-check: nothing visible for ${sel}${nth ? ` #${nth}` : ''}${text ? ` "${text}"` : ''}`);
}

/** Run the spec's steps in order (see the header). */
export async function runSteps(page, steps, { touch = false } = {}) {
  for (const s of steps) {
    if (s.click != null) {
      const p = await point(page, s.click, s.nth || 0, s.text || null, s.timeout);
      if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
    } else if (s.wait != null) {
      await page.waitForSelector(s.wait, { timeout: s.timeout || 15000, visible: true });
    } else if (s.sleep != null) {
      await sleep(Number(s.sleep));
    } else if (s.move != null) {
      await page.mouse.move(s.move[0], s.move[1]);
    } else if (s.hide != null) {
      await page.evaluate((sel) => { for (const el of document.querySelectorAll(sel)) el.style.setProperty('visibility', 'hidden', 'important'); }, s.hide);
    } else if (s.key != null) {
      await page.keyboard.press(s.key);
    } else if (s.style != null) {
      await page.addStyleTag({ content: String(s.style) });
    } else {
      throw new Error(`ui-check: unknown step ${JSON.stringify(s)}`);
    }
  }
  // the screen settles after the last step: two frames and the fonts a new text may have asked for
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

/** The client rects of `sel` (the nth match, default 0) — null when there is none. */
export async function domRect(page, sel, nth = 0) {
  return page.evaluate((sel, nth) => {
    const el = document.querySelectorAll(sel)[nth];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, sel, nth);
}
