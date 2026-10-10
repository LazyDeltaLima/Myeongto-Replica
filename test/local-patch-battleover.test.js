// Local patch: the own battle's end sound (round_result_dialog → ui.ON_ACT1AUTOCHESS_BATTLEOVER_*), audioOfficial.js battleOverOf.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { battleOverOf } from '../public/js/audioOfficial.js';

const manifest = JSON.parse(readFileSync(new URL('../data/assets.json', import.meta.url), 'utf8'));

describe('battle-over sound (round_result_dialog)', () => {
  test('counted leaks ⇒ REDUCE with the LP lost, no leak ⇒ NOREDUCE, uncounted leaks only ⇒ NORMAL', () => {
    assert.deepEqual(battleOverOf({ perfect: false, leaked: [{ counted: true }, {}, { counted: false }] }), { kind: 'miss', lost: 2, sfx: 'battleOverReduce' });
    assert.deepEqual(battleOverOf({ perfect: true, leaked: [] }), { kind: 'perfect', lost: 0, sfx: 'battleOverNoReduce' });
    assert.deepEqual(battleOverOf({ perfect: false, leaked: [{ counted: false }] }), { kind: 'done', lost: 0, sfx: 'battleOverNormal' });
    assert.equal(battleOverOf(null).kind, 'done');
  });

  test('the box says the LP lost, capped per round like Match.settle — not the raw leak count (maintainer report 2026-10-09)', () => {
    const leaked = Array.from({ length: 17 }, () => ({ counted: true }));
    assert.deepEqual(battleOverOf({ perfect: false, leaked }), { kind: 'miss', lost: 10, sfx: 'battleOverReduce' });
    assert.equal(battleOverOf({ perfect: false, leaked }, 10).lost, 10);
    assert.equal(battleOverOf({ perfect: false, leaked: leaked.slice(0, 7) }, 10).lost, 7);
    assert.equal(battleOverOf({ perfect: false, leaked }, 20).lost, 17);
  });

  test('the three sounds are in the web manifest (sfx.ui)', () => {
    for (const k of ['battleOverReduce', 'battleOverNoReduce', 'battleOverNormal']) {
      assert.match(manifest.audio.sfx.ui[k], /act1autochess_b_ui_battleover_(reduce|noreduce|normal)\.mp3$/, k);
    }
  });
});
