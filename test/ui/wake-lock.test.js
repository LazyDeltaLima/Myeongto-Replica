// Settings → 通用 「保持屏幕常亮」 (upstream PR #574, ported by hand as a three-way choice, maintainer decision 2026-11-13;
// docs/rules/ui.md 「화면 켜짐 유지」): the setting's values, the lock's life cycle (ui/device.js installScreenWakeLock) on a
// fake document and wakeLock, and the App wiring that decides when it is held.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installScreenWakeLock, isIOS } from '../../public/js/ui/device.js';
import { sanitizeSettings, DEFAULT_SETTINGS } from '../../public/js/ui/gameLogic.js';
import { SCREEN_WAKE_MODES } from '../../public/js/ui/gameLogic/settings.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));

/** A document with visibility and listeners, and a wakeLock whose requests resolve or fail as told. */
function fakeWin({ fail = 0, hold = false } = {}) {
  const listeners = new Map();
  const doc = {
    visibilityState: 'visible',
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    fire(type) { for (const fn of [...(listeners.get(type) || [])]) fn(); },
    count(type) { return listeners.get(type)?.size || 0; },
  };
  const held = new Set();
  const pending = [];
  let failures = fail;
  const wakeLock = {
    requests: 0,
    request(kind) {
      assert.equal(kind, 'screen');
      wakeLock.requests += 1;
      if (failures > 0) { failures -= 1; return Promise.reject(new Error('NotAllowedError')); }
      const lock = { released: false, async release() { lock.released = true; held.delete(lock); } };
      if (hold) return new Promise((resolve) => pending.push(() => { held.add(lock); resolve(lock); }));
      held.add(lock);
      return Promise.resolve(lock);
    },
  };
  return { win: { document: doc, navigator: { wakeLock } }, doc, wakeLock, held, pending };
}

describe('screen wake lock setting', () => {
  test('off / combat / always, combat by default; anything else falls back to the default', () => {
    assert.deepEqual([...SCREEN_WAKE_MODES], ['off', 'combat', 'always']);
    assert.equal(DEFAULT_SETTINGS.screenWakeLock, 'combat');
    assert.deepEqual(['off', 'combat', 'always', true, 'on', undefined].map((v) => sanitizeSettings({ screenWakeLock: v }).screenWakeLock),
      ['off', 'combat', 'always', 'combat', 'combat', 'combat']);
  });

  test('the strings exist in English and Korean', () => {
    const en = JSON.parse(read('public/i18n/en.json'));
    const ko = JSON.parse(read('public/i18n/ko.json'));
    for (const k of ['保持屏幕常亮', '战斗中', '始终', '防止屏幕自动熄灭。战斗中：仅在作战阶段 · 始终：浏览游戏期间一直保持（无需全屏）。需要 HTTPS 和浏览器支持。',
      '添加到主屏幕的应用需要 iOS 18.4 或更高版本，低电量模式下可能不生效。']) {
      assert.ok(en[k] && ko[k], k);
    }
    assert.equal(ko['保持屏幕常亮'], '화면 켜짐 유지');
  });

  test('the settings row sits in 通用 and App holds the lock for always, or for combat in a match', () => {
    const settings = read('public/js/ui/settings.js');
    const general = settings.slice(settings.indexOf("tab === 'general'"), settings.indexOf("tab === 'sound'"));
    assert.match(general, /<\$\{WakeLockSetting\} s=\$\{s\} \/>/);
    const main = read('public/js/main.js');
    assert.match(main, /selectRoute\(s\) === 'game' && !s\.match\.result && isCombatPhase\(s\.match\.public\?\.phase\)/);
    assert.match(main, /useScreenWakeLock\(wakeMode === 'always' \|\| \(wakeMode === 'combat' && combat\)\)/);
  });
});

describe('installScreenWakeLock', () => {
  test('no wakeLock: nothing to do, the disposer is harmless', () => {
    const off = installScreenWakeLock({ document: fakeWin().doc, navigator: {} });
    assert.doesNotThrow(off);
  });

  test('held while visible, dropped on hide, asked again on show, released by the disposer', async () => {
    const f = fakeWin();
    const off = installScreenWakeLock(f.win);
    await tick();
    assert.equal(f.held.size, 1);
    f.doc.visibilityState = 'hidden'; f.doc.fire('visibilitychange');
    await tick();
    assert.equal(f.held.size, 0, 'hidden: released');
    f.doc.visibilityState = 'visible'; f.doc.fire('visibilitychange');
    await tick();
    assert.equal(f.held.size, 1, 'shown again: a new lock');
    assert.equal(f.wakeLock.requests, 2);
    off();
    await tick();
    assert.equal(f.held.size, 0);
    assert.equal(f.doc.count('visibilitychange'), 0);
  });

  test('a refused request retries once on the next touch, then stays silent', async () => {
    const f = fakeWin({ fail: 2 });
    const off = installScreenWakeLock(f.win);
    await tick();
    assert.equal(f.held.size, 0);
    assert.equal(f.doc.count('pointerdown') + f.doc.count('touchstart'), 2, 'waits for a gesture');
    f.doc.fire('touchstart');
    await tick();
    assert.equal(f.wakeLock.requests, 2);
    assert.equal(f.doc.count('pointerdown') + f.doc.count('touchstart'), 0, 'the retry is one-shot');
    assert.equal(f.held.size, 0);
    off();
  });

  test('a lock granted after the disposer ran is released at once', async () => {
    const f = fakeWin({ hold: true });
    const off = installScreenWakeLock(f.win);
    off();
    f.pending.shift()();
    await tick(); await tick();
    assert.equal(f.held.size, 0);
  });
});

test('isIOS: iPhone and iPad browsers and home-screen apps, iPadOS as a touch Mac; not Android or a desktop Mac', () => {
  const nav = (userAgent, maxTouchPoints = 0) => ({ navigator: { userAgent, maxTouchPoints } });
  assert.equal(isIOS(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148')), true, 'home-screen app');
  assert.equal(isIOS(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1')), true);
  assert.equal(isIOS(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15', 5)), true, 'iPadOS');
  assert.equal(isIOS(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15')), false);
  assert.equal(isIOS(nav('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', 5)), false);
});
