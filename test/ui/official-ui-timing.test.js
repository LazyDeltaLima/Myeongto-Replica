// Official 卫戍协议 UI timing (docs/rules/ui.md 「공식 위수협약 UI」, maintainer report 2026-10-10): the boss rounds'
// opening dialog before the round's prep (client BOSS_PREPARE_WAITING), no battle-start band, the player cards' three dots
// only for a battle still running, the 准备 question with funds left in the client's confirm dialog, and the match's end
// keeping the field until m.result lands (no 模拟失败 result screen and no battle loading screen in between).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHASE } from '../../shared/constants.js';
import { phaseBanner } from '../../public/js/ui/gameLogic.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const { cardState } = await import('../../public/js/ui/teamPanel.js');
const { bossOpening } = await import('../../public/js/ui/battleArt.js');

test('the boss opening comes at the boss round\'s ROUND_START, never with the boss battle', () => {
  const pub = (round) => ({ round, bossRound: 14, hiddenRound: 15 });
  assert.equal(bossOpening(PHASE.ROUND_START, pub(14), true), 'single');
  assert.equal(bossOpening(PHASE.ROUND_START, pub(14), false), 'multi');
  assert.equal(bossOpening(PHASE.ROUND_START, pub(15), false), 'hidden');
  assert.equal(bossOpening(PHASE.ROUND_START, pub(13), true), null);
  assert.equal(bossOpening(PHASE.PREP, pub(14), true), null);
  assert.equal(bossOpening(PHASE.FINAL_ASSAULT, pub(14), true), null);
  assert.equal(bossOpening(PHASE.HIDDEN_CORE, pub(15), true), null);
  assert.equal(bossOpening(PHASE.ROUND_START, { round: 9, bossRound: 9, hiddenRound: null }, true), 'single', 'a mode without a hidden round');
  const src = read('public/js/screens/game.js');
  assert.match(src, /bossOpening\(phase, pub, solo\)/);
  assert.doesNotMatch(src, /startsWith\(`\$\{PHASE\.FINAL_ASSAULT\}:`\)/, 'the boss battle\'s banner key no longer opens BossPrepare');
});

test('no band at a battle\'s start', () => {
  assert.equal(phaseBanner(PHASE.COMBAT, {}), null);
});

test('the three dots: only a battle still running; nothing for a player deciding or not ready', () => {
  assert.equal(cardState({ status: 'combat' }).action, 'doing');
  assert.equal(cardState({ status: 'helping' }).action, 'doing');
  assert.equal(cardState({ status: 'acting' }).action, null, 'prep, not ready');
  assert.equal(cardState({ status: 'deciding' }).action, null);
  assert.equal(cardState({ status: 'ready' }).action, 'done');
  assert.equal(cardState({ status: 'done' }).action, 'done');
  const css = read('public/css/hud-art.css');
  assert.match(css, /\.team__status\.is-act-doing \{ border: 0; background: none;/, 'no outline around the dots');
  assert.match(css, /\.team__status\.is-act-none:not\(\.is-offline\) \{ display: none; \}/);
});

test('准备 with funds left: the client confirm dialog when the art is there, muted for the match by its check box', () => {
  const src = read('public/js/screens/game.js');
  assert.match(src, /battleArt\('confirm'\)\.cls\s*\? await new Promise\(\(resolve\) => setGoldAsk\(\{ text: ask\.text, check: kind === 'gold', resolve \}\)\)\s*: await confirmDialog\(ask\)/);
  assert.match(src, /\['gold', goldTipOff\.current \? null : readyFundsPrompt/);
  // the client's order (_EventOnPrepReadyBtnClick): the temp overflow first (TIP_1), then the funds (TIP_2)
  assert.ok(src.indexOf("['overflow', readyOverflowPrompt(") < src.indexOf("['gold', goldTipOff"));
  assert.match(src, /if \(ok && noMore\) goldTipOff\.current = true;/);
});

test('the match\'s end keeps the field until m.result lands; the loading screen is the match start\'s only', () => {
  const src = read('public/js/screens/game.js');
  assert.match(src, /else if \(!hasResult && mode === 'result' && endRef\.current\.onField\) body = html`<\$\{MatchScreen\} \/>`;/);
  assert.match(src, /if \(status && pub && endRef\.current\.onField && battleArt\('ending'\)\.cls\)/);
  assert.match(src, /endRef\.current\.onField = body\.type === MatchScreen;/);
  assert.match(src, /show=\$\{phase === PHASE\.BATTLE_CHECK \|\| \(fieldLoading && phase !== PHASE\.RESULT\)\}/);
  // the field still loading = the engine not mounted yet, or its first frame still held back (render/app.js isReady)
  assert.match(src, /const fieldLoading = viewKind === 'loading' \|\| \(!!view && readyView !== view\);/);
});
