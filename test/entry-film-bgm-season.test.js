// The entry film holds the title's music and hands it back at its end: the release plays the track the screen asked for
// in the season it asked for. Dropping the season played 盟约's lobby track on 规程's title after 规程's film.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holdBgm } from '../public/js/ui/entryFilm.js';

function standIn() {
  const calls = [];
  const a = {
    ctx: {}, bgmToken: 0, lastBgmKey: null, bgmSeason: null,
    _fadeOutBgm() {},
    playBgm(key, season = null) { this.lastBgmKey = key; this.bgmSeason = season; calls.push([key, season]); },
  };
  // the manager's method lives on its prototype (holdBgm shadows it with an own property)
  const proto = { playBgm: a.playBgm }; delete a.playBgm;
  Object.setPrototypeOf(a, proto);
  return { a, calls };
}

test('the release plays the held track in the season it was asked for', () => {
  const { a, calls } = standIn();
  const release = holdBgm(a);
  a.playBgm('lobby', 'act3autochess');
  assert.deepEqual(calls, []);
  release();
  assert.deepEqual(calls, [['lobby', 'act3autochess']]);
});

test('with nothing asked meanwhile, the release replays the last track in its season', () => {
  const { a, calls } = standIn();
  a.playBgm('lobby', 'act3autochess');
  const release = holdBgm(a);
  release();
  assert.deepEqual(calls.at(-1), ['lobby', 'act3autochess']);
});
