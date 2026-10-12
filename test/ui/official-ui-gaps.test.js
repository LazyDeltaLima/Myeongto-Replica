// UI changes of 2026-10-12 (docs/rules/ui.md 「공식 위수협약 UI」, 「휴대폰 화면 조정」, 「정비 화면 HUD」; maintainer request):
//   - the bond stack number: 12.4 units (16 × .17 / .22: the capture's digit height against ours)
//   - phones fold ⚙ / 📖 / ⛶ of the bottom-left corner behind one ⋯ button (the corner covered the 机变 cards' bottom row)
//   - the official pieces still missing: the reconnect mask, the one-button server-lost / solo-resume dialogs, the latency
//     panel and the 卫戍协议 toast (ui/battleArt.js, css/battle-art.css). The 机变 card scroll view: test/ui/playtest6-ui.test.js.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

const { pingTier, soloResumeDue, ReadyTipDialog } = await import('../../public/js/ui/battleArt.js');

describe('bond stack number', () => {
  test('12.4 units on matte_num (was the prefab 16 px: .22 of the ring against the capture\'s .17)', () => {
    const css = read('public/css/hud-art.css');
    const rule = css.match(/\.gm\.has-hud-art \.bslot \.bond__count \{([^}]*)\}/)[1];
    assert.match(rule, /font-size: calc\(var\(--u\) \* 12\.4\)/);
    assert.match(rule, /min-width: calc\(var\(--u\) \* 42\); height: calc\(var\(--u\) \* 25\)/, 'the matte keeps its size');
  });
});

describe('phones fold the corner tools', () => {
  test('⋯ toggles a tools group holding ⚙ / 📖 / ⛶; a tool\'s tap folds it again', () => {
    const src = read('public/js/screens/game.js');
    const corner = src.slice(src.indexOf('<div class=${sp || personalChoice ? \'gm__corner'), src.indexOf('${loadArt ?'));
    assert.match(corner, /class=\$\{toolsOpen \? 'gm__gear gm__more is-open' : 'gm__gear gm__more'\} aria-expanded=\$\{String\(toolsOpen\)\}/);
    const tools = corner.slice(corner.indexOf('gm__tools'));
    for (const re of [/setToolsOpen\(false\); setSettingsOpen\(true\)/, /setToolsOpen\(false\); openGuide\(0\)/, /FullscreenButton/]) assert.match(tools, re);
    assert.ok(corner.indexOf('EmoteWheel') < corner.indexOf('gm__more'), '交流 stays outside the fold');
  });

  test('CSS: hidden ⋯ and an unwrapped group by default; on touch phones the group hides until opened', () => {
    const game = read('public/css/screens/game.css');
    assert.match(game, /\.gm__more \{ display: none; \}/);
    assert.match(game, /\.gm__tools \{ display: contents; \}/);
    // any screen: folded while the corner sits over the 机变 cards (it covered the bottom-left card at 1920×1080)
    assert.match(game, /\.gm__corner\.is-over-choice \.gm__more \{ display: grid; \}/);
    assert.match(game, /\.gm__corner\.is-over-choice \.gm__tools:not\(\.is-open\) \{ display: none; \}/);
    const dev = read('public/css/devices.css');
    const block = dev.match(/@media \(max-height: 600px\) and \(pointer: coarse\), \(max-height: 600px\) and \(any-pointer: coarse\),\s*\(max-width: 767px\) and \(pointer: coarse\), \(max-width: 767px\) and \(any-pointer: coarse\) \{([^}]*\}[^}]*\})\s*\}/);
    assert.ok(block, 'the phone block');
    assert.match(block[1], /\.gm__more \{ display: grid; \}/);
    assert.match(block[1], /\.gm__tools:not\(\.is-open\) \{ display: none; \}/);
  });
});

describe('official connection pieces', () => {
  test('latency tiers follow constData pingConds (1 / 60 / 200 ms)', () => {
    assert.equal(pingTier(1), 'low');
    assert.equal(pingTier(59), 'low');
    assert.equal(pingTier(60), 'medium');
    assert.equal(pingTier(199), 'medium');
    assert.equal(pingTier(200), 'high');
    assert.equal(pingTier(null), null);
    const css = read('public/css/battle-art.css');
    for (const [k, c] of [['low', '#7fa826'], ['medium', '#ec7a00'], ['high', '#ff3d3d']]) assert.match(css, new RegExp(`\\.bping__num\\.is-${k} \\{ color: ${c}; \\}`));
  });

  test('solo resume: only on a solo run under way, never at its start or its result', () => {
    for (const phase of ['PREP', 'COMBAT', 'SP_DRAFT', 'ROUND_START', 'FINAL_ASSAULT', 'HIDDEN_CORE', 'SETTLE']) assert.equal(soloResumeDue({ phase }, true), true, phase);
    for (const phase of ['LOBBY', 'INFO_CHECK', 'BAND_DRAFT', 'BATTLE_CHECK', 'RESULT']) assert.equal(soloResumeDue({ phase }, true), false, phase);
    assert.equal(soloResumeDue({ phase: 'COMBAT' }, false), false, 'co-op: no resume dialog');
    assert.equal(soloResumeDue(null, true), false);
  });

  test('the one-button dialog (auto_chess_only_confirm_view): no cancel button, no check box', () => {
    assert.equal(typeof ReadyTipDialog, 'function');
    const src = read('public/js/ui/battleArt.js');
    assert.match(src, /if \(only\) check = false;/);
    assert.match(src, /\$\{only \? null : html`<button type="button" class="bcd__btn is-cancel"/);
    assert.match(src, /live\.current\.onAnswer\(live\.current\.only, false\)/, 'Esc confirms a one-button dialog');
  });

  test('wiring: the mask replaces the banner while reconnecting in a match; the server-lost dialog holds the match until 确认', () => {
    const banner = read('public/js/ui/connBanner.js');
    assert.match(banner, /if \(conn\.status === 'reconnecting' && inGame && battleArt\('reconnect'\)\.cls\) return html`<\$\{ReconnectMask\} \/>`;/);
    assert.match(banner, /const inGame = useStore\(\(s\) => selectRoute\(s\) === 'game' && !s\.ui\.serverLost\);/, 'no mask over the server-lost dialog');
    assert.match(read('public/js/screens/game.js'), /preloadBattleArt\(\['reconnect', 'confirm'\]\)/, 'their sprites load before the server can be gone');
    const main = read('public/js/main.js');
    assert.match(main, /if \(serverLostDue\(store\.get\(\)\)\) \{ serverLost\(text\); return; \}\s*backToLobby\(\);/);
    assert.match(main, /if \(prev\.ui\.serverLost && !s\.ui\.serverLost\) backToLobby\(\);/);
    const game = read('public/js/screens/game.js');
    assert.match(game, /serverLostBox \? html`<\$\{OnlyConfirmDialog\} key=\$\{serverLostBox\.text\} text=\$\{serverLostBox\.text\} onOk=\$\{\(\) => store\.patch\('ui', \{ serverLost: null \}\)\} \/>`/);
    assert.match(game, /\$\{paused && !resumeAsk \? html`<\$\{PausedOverlay\}/, 'the pause overlay waits for the resume dialog');
    const hud = read('public/js/ui/hud.js');
    assert.match(hud, /battleArt\('ping'\)\.cls \? html`<\$\{PingPanel\}/);
  });
});
