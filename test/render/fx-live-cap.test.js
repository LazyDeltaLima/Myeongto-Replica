// test/render/fx-live-cap.test.js — the cap on live official effects (render/fxgame.js liveOverCap, render/fxplayer.js
// MAX_INSTANCES / MAX_LASTING; maintainer report 2026-10-10: 赤刃明霄陈 S3's self-buff, 余 S3's fire wall and other lasting
// effects showed and vanished, or never showed, in a full battle — one list capped at 24 ended its oldest entry, nearly
// always a buff loop started with the skill). A short effect and a lasting one each end the oldest of their own kind.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveOverCap, isLasting, LASTING_S, createFxLayer } from '../../public/js/render/fxgame.js';
import { presetCamera } from '../../public/js/render/projection.js';

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
  // 2026-11-12: the pinned instances (fxgame's `pinned` entries) are counted apart (PINNED_CAP; test/render/tile-batch.test.js)
  assert.match(PLAYER, /while \(live\.length - livePinned > PLAYER_CAP\) (\/\*\* @type \{FxInstance\} \*\/ \()?live\.find\(\(x\) => !x\.pinned\)\)?\.dispose\(\);/);
});

// 2026-11-26 (user report 「패신저 S3 장판이 1~3초 만에 사라짐」, docs/rules/fx.md 「오래 남아야 할 이펙트가 사라지거나 안 나옴」): a
// skill area of zoneFx (kit fx 'zone' / 'tornado' / 'storm') with ≤ LASTING_S left was a short effect, and its strikes' hits
// past MAX_INSTANCES ended it first. It is pinned now: it ends at its own `until`, never by the caps.
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));
const CHESS = JSON.parse(readFileSync(path.join(ROOT, 'data/chess.json'), 'utf8'));
const records = Array.isArray(CHESS.chess) ? CHESS.chess : Object.values(CHESS.chess || CHESS);
const record = (id) => records.find((r) => r && r.chessId === id) || null;
const settle = () => new Promise((r) => setTimeout(r, 10));
const CAM = presetCamera('normal', { width: 1920, height: 1080 });
const AREAS = [
  { who: '패신저 S3 폭풍', ev: 'storm', char: 'char_472_pasngr', chess: 'chess_char_6_05_a', bundle: 'pasngr', o: { duration: 4, r: 1.6 } },
  { who: '글래디아 S3 회오리', ev: 'tornado', char: 'char_474_glady', chess: 'chess_char_4_12_a', bundle: 'glady', o: { duration: 4, r: 1.2 } },
];
const zoneNames = (char) => { const z = MODES[char].skills[2].zone; return [...z.fx, ...z.aura]; };
for (const a of AREAS) {
  test(`${a.who}: its area effects are pinned — never ended by the live caps (the cause: zoneFx spawning them unpinned)`, async () => {
    const names = zoneNames(a.char);
    assert.ok(names.length > 0, `${a.char} S3 has a zone`);
    // (one index for every case: the effect index is loaded once per module)
    const files = {
      '/assets/local/fx/index.json': { bundles: Object.fromEntries(AREAS.map((x) => [x.bundle, zoneNames(x.char)])) },
      '/assets/local/fx/modes.json': Object.fromEntries(AREAS.map((x) => [x.char, MODES[x.char]])),
      '/assets/local/fx/enemy-index.json': { bundles: {} },
      '/assets/local/fx/enemy-modes.json': { $fx: {} },
    };
    const fetch0 = globalThis.fetch;
    globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
    try {
      const seen = [];
      const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p),
        unitDef: (info) => (info?.side === 'enemy' ? null : record(info?.defId)) });
      await settle();
      const op = { id: 1, x: 2, y: 4, alive: true, info: { id: 1, side: 'ally', defId: a.chess, spine: a.char, skillIndex: 2, kind: 'op' } };
      const views = new Map([[1, op], [9, { id: 9, x: 5, y: 4, z: 0, alive: true, info: { id: 9, side: 'enemy', defId: 'enemy_x' } }]]);
      layer.onEvent(['deploy', 1], views);
      layer.update(0.1, CAM);
      seen.length = 0;
      layer.onEvent(['fx', a.ev, 5, 4, { id: 1, ...a.o }], views);
      for (let i = 0; i < 10; i++) layer.update(0.1, CAM);   // a thrown shot's reach effects play as it lands
      await settle();
      const got = seen.filter((p) => p.kind === 'spawn' && names.includes(p.names[0]));
      assert.deepEqual(got.map((p) => p.names[0]).sort(), [...names].sort(), 'each area effect spawned');
      for (const p of got) assert.equal(p.pinned, true, `${p.names[0]} pinned (docs/rules/fx.md 「오래 남아야 할 이펙트가 사라지거나 안 나옴」)`);
    } finally { globalThis.fetch = fetch0; }
  });
}

test('a pinned 4 s area stays through a burst of hits past the short cap', () => {
  const now = 10;
  const area = { i: 'storm', buff: false, until: now + 4, pinned: true };
  assert.equal(isLasting({ ...area, pinned: false }, now), false, 'a 4 s area is not lasting by itself');
  const list = [area, ...Array.from({ length: 30 }, (_, i) => hit(i, now))];
  const drop = liveOverCap(list, now, 24, 48);
  assert.ok(!drop.includes(area), 'the area stays');
  assert.deepEqual(drop.map((l) => l.i), [0, 1, 2, 3, 4, 5]);
});
