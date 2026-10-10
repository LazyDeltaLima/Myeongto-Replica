// test/render/fx-live-cap.test.js — the cap on live official effects (render/fxgame.js liveOverCap, render/fxplayer.js
// MAX_INSTANCES / MAX_LASTING; maintainer report 2026-10-10: 赤刃明霄陈 S3's self-buff, 余 S3's fire wall and other lasting
// effects showed and vanished, or never showed, in a full battle — one list capped at 24 ended its oldest entry, nearly
// always a buff loop started with the skill). A short effect and a lasting one each end the oldest of their own kind.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveOverCap, isLasting, LASTING_S } from '../../public/js/render/fxgame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const PLAYER = readFileSync(path.join(ROOT, 'public/js/render/fxplayer.js'), 'utf8');

const hit = (i, now) => ({ i, buff: false, until: now + 1.2 });
const buff = (i) => ({ i, buff: true, until: null });

test('isLasting: buff loops, effects with no end and those with more than LASTING_S left', () => {
  assert.equal(isLasting(buff(0), 0), true);
  assert.equal(isLasting({ buff: false, until: null }, 0), true);
  assert.equal(isLasting({ buff: false, until: LASTING_S + 1 }, 0), true);
  assert.equal(isLasting(hit(0, 0), 0), false);
  assert.equal(isLasting({ buff: false, keep: true, until: 1 }, 0), true);
});

test('a burst of hits never ends a buff: the oldest hits go', () => {
  const now = 10;
  const list = [buff('chen3'), ...Array.from({ length: 30 }, (_, i) => hit(i, now))];
  const drop = liveOverCap(list, now, 24, 48);
  assert.equal(drop.length, 6);
  assert.ok(!drop.includes(list[0]), 'the buff stays');
  assert.deepEqual(drop.map((l) => l.i), [0, 1, 2, 3, 4, 5]);
});

test('past the lasting cap the oldest lasting effect goes; the hits are left alone', () => {
  const list = [...Array.from({ length: 50 }, (_, i) => buff(i)), hit('h', 0)];
  const drop = liveOverCap(list, 0, 24, 48);
  assert.deepEqual(drop.map((l) => l.i), [0, 1]);
  assert.deepEqual(liveOverCap(list.slice(0, 10), 0, 24, 48), []);
});

test('fxgame trims with liveOverCap everywhere; the player keeps only a backstop above both caps', () => {
  assert.doesNotMatch(SRC, /dropLive\(live\.shift\(\)\)/);
  assert.ok((SRC.match(/trimLive\(\);/g) || []).length >= 10);
  assert.match(SRC, /liveOverCap\(live, clockS, mod\.fxp\.MAX_INSTANCES, mod\.fxp\.MAX_LASTING \?\? mod\.fxp\.MAX_INSTANCES\)/);
  assert.match(PLAYER, /export const MAX_LASTING = \d+;/);
  assert.match(PLAYER, /const PLAYER_CAP = MAX_INSTANCES \+ MAX_LASTING \+ \d+;/);
  assert.match(PLAYER, /while \(live\.length > PLAYER_CAP\) live\[0\]\.dispose\(\);/);
});
