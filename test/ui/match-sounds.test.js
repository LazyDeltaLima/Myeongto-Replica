// 랜덤 매칭·방·카운트다운 알림음 (maintainer decision 2026-10-14, docs/rules/audio.md 「랜덤 매칭·방 알림음」 and
// 「카운트다운 경고음」): which official UI cue a queue message, a room update or a countdown plays, and the audio
// manager staying up in a hidden tab while the player waits in the queue.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { queueCue } from '../../public/js/ui/matchQueue.js';
import { joinedDoctors } from '../../public/js/screens/room.js';
import { warnCue } from '../../public/js/ui/components.js';
import { countdownWarnAt } from '../../public/js/ui/gameLogic.js';
import { AudioManager } from '../../public/js/audio.js';
import { PHASE } from '../../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const config = JSON.parse(read('data/config.json'));

describe('랜덤 매칭 cues (queueCue)', () => {
  const waiting = { difficulty: 'NORMAL', count: 3, since: 0, party: false, found: null };
  const found = { ...waiting, found: { players: 4, accepted: 0, mine: false, deadline: 1, total: 15 } };

  test('a group forming plays matchSucceed once; accept-count updates stay silent', () => {
    assert.equal(queueCue('room.matchFound', waiting, { players: 4, accepted: 0 }), 'matchSucceed');
    assert.equal(queueCue('room.matchFound', null, { players: 4, accepted: 0 }), 'matchSucceed', 'a resumed page that lost its queue');
    assert.equal(queueCue('room.matchFound', found, { players: 4, accepted: 2 }), null);
  });

  test('a failed search plays matchFail, the player\'s own cancel or decline matchCancel', () => {
    assert.equal(queueCue('room.queueState', found, { queued: true, count: 2 }), 'matchFail', 'back in the queue from a group');
    for (const reason of ['timeout', 'offline', 'restarting', 'full', 'room', 'party', 'partyDeclined', 'partyTimeout', 'changed']) {
      assert.equal(queueCue('room.queueState', found, { queued: false, reason }), 'matchFail', reason);
      assert.equal(queueCue('room.queueState', waiting, { queued: false, reason }), 'matchFail', `${reason} while waiting`);
    }
    for (const reason of ['left', 'declined']) assert.equal(queueCue('room.queueState', found, { queued: false, reason }), 'matchCancel', reason);
  });

  test('queue updates and messages for a page that was not queued are silent', () => {
    assert.equal(queueCue('room.queueState', waiting, { queued: true, count: 3 }), null);
    assert.equal(queueCue('room.queueState', null, { queued: true, count: 1 }), null, 'joining the queue');
    assert.equal(queueCue('room.queueState', null, { queued: false, reason: 'left' }), null);
    assert.equal(queueCue('room.state', found, {}), null);
  });
});

describe('room join cue (joinedDoctors)', () => {
  const seat = (playerId, o = {}) => ({ playerId, name: String(playerId), isBot: false, ready: false, connected: true, ...o });
  const room = (seats, o = {}) => ({ code: 'ABCD', mode: 'coop', hostId: 'me', seats, ...o });

  test('a Doctor taking a seat counts; the own player, AI seats and leavers do not', () => {
    const before = room([seat('me'), null, null, null]);
    assert.equal(joinedDoctors(before, room([seat('me'), seat('b'), null, null]), 'me'), 1);
    assert.equal(joinedDoctors(before, room([seat('me'), seat('b'), seat('c'), null]), 'me'), 2);
    assert.equal(joinedDoctors(before, room([seat('me'), seat('ai1', { isBot: true }), null, null]), 'me'), 0, 'an AI seat');
    assert.equal(joinedDoctors(room([seat('me'), seat('b'), null, null]), before, 'me'), 0, 'a Doctor leaving');
    assert.equal(joinedDoctors(before, room([seat('me', { ready: true }), null, null, null]), 'me'), 0, 'a ready toggle');
    // the own player arriving in someone else's room
    assert.equal(joinedDoctors(room([seat('b'), null, null, null]), room([seat('b'), seat('me'), null, null]), 'me'), 0);
  });

  test('another room or a started match is a fresh start', () => {
    const before = room([seat('me'), null, null, null]);
    assert.equal(joinedDoctors(null, before, 'me'), 0);
    assert.equal(joinedDoctors(before, room([seat('me'), seat('b'), null, null], { code: 'WXYZ' }), 'me'), 0);
    assert.equal(joinedDoctors(before, room([seat('me'), seat('b'), seat('c'), seat('d')], { inMatch: true }), 'me'), 0);
  });
});

describe('countdown warning (official hintTime, one cue)', () => {
  test('the warning time follows the official step / phase values', () => {
    assert.equal(countdownWarnAt({ phase: PHASE.INFO_CHECK }, config), 5);
    assert.equal(countdownWarnAt({ phase: PHASE.BAND_DRAFT }, config), 15);
    assert.equal(countdownWarnAt({ phase: PHASE.BATTLE_CHECK }, config), 0);
    for (const phase of [PHASE.SP_DRAFT, PHASE.PREP, PHASE.COMBAT, PHASE.UNITE, PHASE.FINAL_ASSAULT, PHASE.HIDDEN_CORE]) {
      assert.equal(countdownWarnAt({ phase }, config), 10, phase);
    }
    // the data's own values, and the same defaults without it
    assert.equal(config.timers.infoCheckHint, 5);
    assert.equal(config.timers.bandDraftHint, 15);
    assert.equal(countdownWarnAt({ phase: PHASE.INFO_CHECK }, null), 5);
    assert.equal(countdownWarnAt({ phase: PHASE.BAND_DRAFT }), 15);
    assert.equal(countdownWarnAt(null), 10);
  });

  test('the cue plays on the turn to orange only, never every second', () => {
    const plays = [];
    let was = false;
    for (let remain = 30; remain >= 0; remain--) {
      const warn = remain <= 10;
      if (warnCue(was, warn)) plays.push(remain);
      was = warn;
    }
    assert.deepEqual(plays, [10]);
    assert.equal(warnCue(false, true), true, 'a countdown that first shows already orange');
    assert.equal(warnCue(true, true), false);
    assert.equal(warnCue(true, false), false);
  });

  test('the HUD, the step header and the confirmation hand the cue to Countdown; the old per-second tick is gone', () => {
    const game = read('public/js/screens/game.js');
    assert.ok(!/audio\.sfx\('timer', \{ volume: 0\.6 \}\)/.test(game), 'no per-second tick gated on ready');
    assert.match(game, /onTimerWarn=\$\{timerCue\}/);
    assert.match(read('public/js/ui/hud.js'), /warnAt=\$\{warnAt\} onWarn=\$\{onTimerWarn\}/);
    assert.match(read('public/js/ui/matchChrome.js'), /warnAt=\$\{countdownWarnAt\(pub, config\)\} onWarn=\$\{timerCue\}/);
    assert.match(read('public/js/ui/matchQueue.js'), /onWarn=\$\{f\.mine \? null : timerCue\}/);
    for (const p of ['public/js/screens/briefing.js', 'public/js/screens/bandDraft.js']) assert.match(read(p), /config=\$\{gd\.config\}/, p);
  });
});

describe('the official cues are in the manifest', () => {
  test('sfx.ui has the matching, room and countdown sounds', (t) => {
    const ui = JSON.parse(read('data/assets.json'))?.audio?.sfx?.ui;
    if (!ui) { t.skip('no audio manifest'); return; }
    assert.match(ui.matchSucceed, /act1autochess_g_ui_match_succeed\.mp3$/);
    assert.match(ui.matchFail, /act1autochess_g_ui_match_fail\.mp3$/);
    assert.match(ui.matchCancel, /act1autochess_g_ui_match_cancel\.mp3$/);
    assert.match(ui.joinRoom, /act1autochess_g_ui_player_joinroom\.mp3$/);
    assert.match(ui.timer, /act1autochess_g_ui_countdown\.mp3$/);
  });
});

describe('AudioManager.keepAwake (a hidden tab during the 랜덤 매칭 wait)', () => {
  function fakeWin() {
    const calls = { suspend: 0, resume: 0 };
    const listeners = new Map();
    class Param { constructor() { this.value = 1; } setValueAtTime(v) { this.value = v; } linearRampToValueAtTime(v) { this.value = v; } setTargetAtTime(v) { this.value = v; } cancelScheduledValues() {} }
    class Node { connect() {} disconnect() {} }
    class Gain extends Node { constructor() { super(); this.gain = new Param(); } }
    class Src extends Node { constructor() { super(); this.playbackRate = new Param(); } start() {} stop() {} }
    class Ctx {
      constructor() { this.currentTime = 0; this.state = 'running'; this.destination = new Node(); }
      createGain() { return new Gain(); }
      createBufferSource() { return new Src(); }
      createBuffer() { return {}; }
      decodeAudioData(ab, ok) { ok({ duration: 1 }); }
      resume() { calls.resume++; this.state = 'running'; return Promise.resolve(); }
      suspend() { calls.suspend++; this.state = 'suspended'; return Promise.resolve(); }
    }
    const document = { hidden: false, addEventListener() {} };
    return {
      calls, document,
      win: { AudioContext: Ctx, document, addEventListener(t, fn) { listeners.set(t, fn); }, removeEventListener(t) { listeners.delete(t); } },
      fire(t) { listeners.get(t)?.(); },
    };
  }

  test('hidden while awake: the context keeps running, BGM and voice go silent, UI sounds stay', () => {
    const fw = fakeWin();
    const a = new AudioManager({ win: fw.win, getManifest: () => null });
    a.install();
    fw.fire('pointerdown');
    assert.equal(a.unlocked, true);
    const sfx = a.sfxGain.gain.value;
    assert.ok(a.bgmGain.gain.value > 0 && a.voiceGain.gain.value > 0);

    a.keepAwake(true);
    fw.document.hidden = true;
    a._onVis();
    assert.equal(fw.calls.suspend, 0, 'not suspended while queued');
    assert.equal(a.bgmGain.gain.value, 0);
    assert.equal(a.voiceGain.gain.value, 0);
    assert.equal(a.sfxGain.gain.value, sfx, 'the UI cues still play');

    fw.document.hidden = false;
    a._onVis();
    assert.ok(a.bgmGain.gain.value > 0 && a.voiceGain.gain.value > 0, 'back on the tab: the BGM returns');

    // the queue ends while the tab is hidden: it suspends as before
    fw.document.hidden = true;
    a._onVis();
    a.keepAwake(false);
    assert.equal(fw.calls.suspend, 1);
    assert.ok(a.bgmGain.gain.value > 0, 'the channel volumes are the settings again');
  });

  test('hidden without keepAwake suspends as before; keepAwake before the first gesture is just remembered', () => {
    const fw = fakeWin();
    const a = new AudioManager({ win: fw.win, getManifest: () => null });
    a.install();
    a.keepAwake(true);   // no context yet: nothing to do
    assert.equal(a.awake, true);
    a.keepAwake(false);
    fw.fire('pointerdown');
    fw.document.hidden = true;
    a._onVis();
    assert.equal(fw.calls.suspend, 1);
    a.keepAwake(true);   // a queue state arriving while hidden (a resumed session): the context runs again
    assert.equal(fw.calls.resume >= 1, true);
  });
});
