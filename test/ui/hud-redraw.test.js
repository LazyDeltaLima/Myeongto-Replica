// The battle HUD numbers redraw only what shows them (mobile performance): the match screen used to keep them in its own
// state, so every HUD frame (5× a second in battle) and every ping redrew the whole screen — 2–10 ms a time on a phone.
// Now the numbers live in ui/hud.js battleHud, read by the phase capsule (LiveCapsule) and the DP counter; the ping by
// the top bar's LivePing; a live countdown redraws when its second changes (useTicker's `shown`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

const { battleHud, sameCapsule } = await import('../../public/js/ui/hud.js');

test('the match screen hands the HUD frames to battleHud and reads them back only while a detail card is open', () => {
  const src = read('public/js/screens/game.js');
  assert.doesNotMatch(src, /setHud\(/, 'no HUD numbers in the match screen state');
  assert.match(src, /battleHud\.set\(\{ hud: hudRef\.current \}\)/);
  assert.match(src, /const hud = useStore\(\(s\) => \(detail \? s\.hud : null\), Object\.is, battleHud\)/);
  assert.doesNotMatch(src, /<\$\{TopBar\}[^>]*\bhud=/, 'the top bar reads the store itself');
  assert.doesNotMatch(src, /<\$\{CombatHud\}[^>]*\bhud=/, 'the DP counter reads the store itself');
  assert.doesNotMatch(src, /useStore\(\(s\) => s\.connection, shallowEqual\)/, 'a ping does not redraw the match screen');
  assert.match(src, /useEffect\(\(\) => \(\) => battleHud\.set\(\{ hud: null \}\), \[\]\)/, 'a later match starts without the numbers');
});

test('the capsule and the DP counter subscribe to battleHud; the capsule ignores a frame that only moves the DP', () => {
  const src = read('public/js/ui/hud.js');
  assert.match(src, /export function LiveCapsule\(\{ pub, hud, miss = null \}\) \{\n  const live = useStore\(\(s\) => s\.hud, sameCapsule, battleHud\);/);
  assert.match(src, /export function DpCounter\(\{ dp \}\) \{\n  const live = useStore\(\(s\) => \(Number\.isFinite\(s\.hud\?\.dp\) \? Math\.floor\(s\.hud\.dp\) : null\), Object\.is, battleHud\);/);
  assert.match(src, /function LivePing\(\) \{\n  const ms = useStore\(\(s\) => s\.connection\?\.ping\);/);
  const a = { killed: 3, resolved: 4, total: 20, dp: 10, boss: { hp: 500, max: 900 } };
  assert.equal(sameCapsule(a, { ...a, dp: 11 }), true);
  assert.equal(sameCapsule(a, { ...a, resolved: 5 }), false);
  assert.equal(sameCapsule(a, { ...a, boss: { hp: 499, max: 900 } }), false);
  assert.equal(sameCapsule(a, null), false);
  assert.equal(sameCapsule(null, null), true);
  battleHud.set({ hud: a });
  assert.ok(battleHud.get().hud === a);
  battleHud.set({ hud: null });
});

test('a live countdown redraws when its second changes, not on every 200 ms tick', () => {
  const src = read('public/js/ui/components.js');
  assert.match(src, /useTicker\(live \? 200 : 0, live \? \(\) => secondsLeft\(deadline\) : null\)/);
  assert.match(src, /const tick = \(\) => \{ const fn = shownRef\.current; if \(!fn \|\| !Object\.is\(fn\(\), seen\.current\)\) force\(\); \};/);
});
