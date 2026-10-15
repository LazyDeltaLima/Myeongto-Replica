// The bond layer-up cue (upstream #482, docs/rules/audio.md 「맹약 층 효과음」): `bondUp` = the official bank
// battle.ON_ACT1AUTOCHESS_ADD_BOND (maxSoundAllowed 1, popOldest) on one channel of the SoundFXBank limiter — a new cue
// cuts the one on air (or still loading), no cooldown; battle 'layer' tuples share it; late-entry replays carry none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AudioManager } from '../../public/js/audio.js';
import { keepEarly } from '../../public/js/screens/game/early.js';
import { UI_SFX } from '../../tools/assets/audio.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BOND_URL = '/assets/audio/sfx/customse/act1autochess/act1autochess_b_ui_buffup.mp3';

function harness({ bank = { [BOND_URL]: [1, 1, 1, 1] } } = {}) {
  const sources = [];
  const a = new AudioManager({ win: null, getManifest: () => ({ audio: { sfx: { ui: { bondUp: BOND_URL, buy: '/buy.mp3' }, bank } } }) });
  a.ctx = {
    currentTime: 0,
    createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
    createBufferSource: () => {
      const s = { buffer: null, playbackRate: { value: 1 }, onended: null, started: false, stopped: false, connect() {}, disconnect() {},
        start() { this.started = true; }, stop() { this.stopped = true; this.onended?.(); } };
      sources.push(s);
      return s;
    },
  };
  a.sfxGain = {};
  a._buffer = async () => ({ duration: 0 });
  return { a, sources };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const started = (sources) => sources.filter((s) => s.started);

test('the cue is the official ADD_BOND bank: one sound, popOldest (manifest sfx.bank, tools/assets/audio.mjs UI_SFX)', () => {
  assert.deepEqual(UI_SFX.bondUp, { bank: 'battle.ON_ACT1AUTOCHESS_ADD_BOND' });
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));
  const url = manifest.audio?.sfx?.ui?.bondUp;
  assert.equal(url, BOND_URL);
  assert.deepEqual(manifest.audio.sfx.bank?.[url]?.slice(2), [1, 1], 'maxSoundAllowed 1, popOldest');
});

test('a real layer gain plays once whatever its amount; invalid gains are silent', async () => {
  const { a, sources } = harness();
  for (const n of [0, -1, NaN, Infinity, '1']) a.layerGain('sargonShip', n);
  a.layerGain(null, 1); a.layerGain('', 1);
  await flush();
  assert.equal(sources.length, 0);
  a.layerGain('sargonShip', 5);
  await flush();
  assert.equal(started(sources).length, 1);
  a.stopBondCue();
  assert.equal(sources[0].stopped, true);
});

test('each new cue cuts the one on air at once (no cooldown); a late end of the old one leaves the new one alone', async () => {
  const { a, sources } = harness();
  a.layerGain('sargonShip', 1); await flush();
  a.handleBattleEvents([['layer', 'p_1', 'sargonShip', 2]]); await flush();
  assert.equal(started(sources).length, 2);
  assert.equal(sources[0].stopped, true);
  assert.equal(sources[1].stopped, false);
  sources[0].onended?.();
  assert.equal(a.limiter.count('ui:bondUp'), 1, 'the replacement still holds the channel');
  a.stopBondCue();
  assert.equal(sources[1].stopped, true);
  assert.equal(a.limiter.count('ui:bondUp'), 0);
});

test('without bank values for the file the channel still holds one cue (BOND_POP)', async () => {
  const { a, sources } = harness({ bank: {} });
  a.layerGain('sargonShip', 1); await flush();
  a.layerGain('kjeragShip', 1); await flush();
  assert.equal(started(sources).length, 2);
  assert.equal(sources[0].stopped, true);
  assert.equal(a.limiter.count('ui:bondUp'), 1);
  a.stopBondCue();
});

test('only the newest request starts after asynchronous decoding', async () => {
  const { a, sources } = harness(), resolves = [];
  a._buffer = () => new Promise((resolve) => resolves.push(resolve));
  a.layerGain('kjeragShip', 1); a.layerGain('steadShip', 2);
  resolves[1]({ duration: 0 }); await flush();
  resolves[0]({ duration: 0 }); await flush();
  assert.equal(started(sources).length, 1);
  a.stopBondCue();
});

test('field entry, stopping, muting and sfx 0 cancel a cue that is still decoding', async () => {
  for (const cancel of [(a) => a.setFieldUnits([]), (a) => a.stopBondCue(), (a) => a.setVolumes({ muted: true }), (a) => a.setVolumes({ sfx: 0 })]) {
    const { a, sources } = harness();
    let resolve;
    a._buffer = () => new Promise((r) => { resolve = r; });
    a.layerGain('sargonShip', 1);
    cancel(a);
    resolve({ duration: 0 }); await flush();
    assert.equal(started(sources).length, 0, String(cancel));
  }
});

test('locked or muted audio and a missing asset queue nothing for later', async () => {
  const { a, sources } = harness(), ctx = a.ctx;
  a.ctx = null; a.layerGain('sargonShip', 1); a.ctx = ctx;
  a.setVolumes({ muted: true }); a.layerGain('sargonShip', 1); a.setVolumes({ muted: false });
  a._buffer = async () => null; a.layerGain('sargonShip', 1); await flush();
  a._buffer = async () => { throw new Error('missing'); }; a.layerGain('sargonShip', 1); await flush();
  assert.equal(started(sources).length, 0);
  assert.equal(a.limiter.count('ui:bondUp'), 0);
});

test('back in the prep a battle cue is cut, but a prep gain that came before the phase view keeps playing', async () => {
  const { a, sources } = harness();
  let resolve;
  a._buffer = () => new Promise((r) => { resolve = r; });
  a.handleBattleEvents([['layer', 'p_0', 'sargonShip', 1]]);
  a.stopBondCue('battle');
  resolve({ duration: 0 }); await flush();
  assert.equal(started(sources).length, 0);
  a.layerGain('sargonShip', 1);
  a.stopBondCue('battle');
  resolve({ duration: 0 }); await flush();
  assert.equal(started(sources).length, 1);
  a.stopBondCue();
});

test('battle layer tuples share the channel; a late field entry replays none', async () => {
  const { a, sources } = harness();
  const events = [['layer', 'p_0', 'sargonShip', 1], ['layer', 'p_1', 'kjeragShip', 2]];
  a.handleBattleEvents(events); await flush();
  assert.equal(started(sources).length, 1, 'one batch, one cue');
  assert.equal(events.some(keepEarly), false, 'not a state-bearing event: late entries and catch-up frames drop it');
  a.stopBondCue();
});

test('a prep update that adds layers and turns a bond on plays one cue, not a cut-off restart', async () => {
  const { a, sources } = harness();
  a.layerGain('sargonShip', 2); await flush();
  // screens/game.js: the active-bond count rose in the same update — the cue on air stays
  if (!a.bondCueRecent('prep')) a.sfx('bondUp', { scope: 'prep' });
  await flush();
  assert.equal(sources.length, 1);
  assert.equal(sources[0].stopped, false);
  // a bond turning on with no layer cue of its own still sounds
  const b = harness();
  if (!b.a.bondCueRecent('prep')) b.a.sfx('bondUp', { scope: 'prep' });
  await flush();
  assert.equal(started(b.sources).length, 1);
  a.stopBondCue(); b.a.stopBondCue();
});

test('other UI sounds keep their own path (no channel)', async () => {
  const { a, sources } = harness();
  a.layerGain('sargonShip', 1); a.sfx('buy'); await flush();
  assert.equal(started(sources).length, 2);
  assert.equal(sources[0].stopped, false, 'a UI sound does not cut the bond cue');
  a.stopBondCue();
});
