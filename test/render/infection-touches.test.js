// test/render/infection-touches.test.js — maintainer report 2026-11-03 「전투 중에 칸을 지나간 적이 협동방어에서도 계속 표시」.
//
// The red 「!!!」 of 活性源石 marks, in battle, every ground unit that has touched the tile (render/infectionMark.js
// createInfectionTouches, used by render/app.js updateInfectionMarks). The touched keys used to be cleared only outside
// a battle, so a battle followed by another without a prep in between (the 联防 battle, another player's field) kept
// them — and as every battle numbers its units from 1 again (sim Battle `_idSeq`), its units with those ids wore the mark.
// Maintainer report the same day 「관전으로 볼 때 한 번이라도 장판 위에 있었던 오퍼레이터는 계속 표식」: a spectator's seat (and a
// scouted teammate's board) spends prep on a battle view with `prep: true`, which took the battle rule; it marks only the
// pieces standing on the tile now, as the own prep board does.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInfectionTouches } from '../../public/js/render/infectionMark.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('a unit that touched the tile keeps the mark for the rest of that battle', () => {
  const t = createInfectionTouches();
  const battle = {};
  assert.equal(t.see(battle, 3, false), false);
  assert.equal(t.see(battle, 3, true), true, 'on the tile');
  assert.equal(t.see(battle, 3, false), true, 'walked off: the buff lasts 300 s');
  assert.equal(t.see(battle, 4, false), false, 'another unit');
});

test('the next battle view starts over: its unit with the same id is not marked', () => {
  const t = createInfectionTouches();
  const normal = {}, unite = {};
  t.see(normal, 3, true);
  assert.equal(t.see(unite, 3, false), false, 'the 联防 battle\'s unit 3 never touched the tile');
  assert.equal(t.see(unite, 3, true), true);
  t.clear();
  assert.equal(t.see(unite, 3, false), false, 'cleared outside a battle');
});

test('app.js keys the touches by the battle view (battleMeta, a new object per enterBattle)', () => {
  const app = readFileSync(path.join(ROOT, 'public/js/render/app.js'), 'utf8');
  assert.match(app, /if \(battleMeta\?\.prep \? onTile\(v\) : infTouched\.see\(battleMeta, key, onTile\(v\)\)\) mark\(v\);/,
    'a scouted board (a spectator\'s prep) marks only the pieces on the tile now');
  assert.match(app, /\n {4}battleMeta = \{ fieldId:/);
});
