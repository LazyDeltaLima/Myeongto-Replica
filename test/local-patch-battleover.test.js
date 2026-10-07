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

  test('the three sounds are in the web manifest (sfx.ui)', () => {
    for (const k of ['battleOverReduce', 'battleOverNoReduce', 'battleOverNormal']) {
      assert.match(manifest.audio.sfx.ui[k], /act1autochess_b_ui_battleover_(reduce|noreduce|normal)\.mp3$/, k);
    }
  });
});
