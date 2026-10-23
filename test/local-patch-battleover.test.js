// Local patch: the own battle's end sound (round_result_dialog → ui.ON_ACT1AUTOCHESS_BATTLEOVER_*), audioOfficial.js battleOverOf.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { battleOverOf, battleLossOf } from '../public/js/audioOfficial.js';

const manifest = JSON.parse(readFileSync(new URL('../data/assets.json', import.meta.url), 'utf8'));

describe('battle-over sound (round_result_dialog)', () => {
  // maintainer decision 2026-10-11 (the client's AutoChessBattleUIViewModel.GetBattleResultStatus): the
  // state reads every player's LP loss in the result — leak counts and `perfect` play no part
  test('the three states from the result\'s per-player LP loss: all 0 ⇒ NOREDUCE, the viewer 0 / another lost ⇒ NORMAL, the viewer lost ⇒ REDUCE', () => {
    assert.deepEqual(battleOverOf({ p_0: 0, p_1: 0, p_2: 0 }, 'p_0'), { kind: 'perfect', lost: 0, sfx: 'battleOverNoReduce' });
    assert.deepEqual(battleOverOf({ p_0: 0, p_1: 4 }, 'p_0'), { kind: 'done', lost: 0, sfx: 'battleOverNormal' });
    assert.deepEqual(battleOverOf({ p_0: 3, p_1: 0 }, 'p_0'), { kind: 'miss', lost: 3, sfx: 'battleOverReduce' });
    assert.deepEqual(battleOverOf({ p_0: 3, p_1: 5 }, 'p_0'), { kind: 'miss', lost: 3, sfx: 'battleOverReduce' }, 'both lost: the viewer\'s own number');
    // the viewer not in the dict: the client's lostHp stays 0
    assert.equal(battleOverOf({ p_1: 2 }, 'p_0').kind, 'done');
    assert.equal(battleOverOf({}, 'p_0').kind, 'perfect');
    assert.equal(battleOverOf(null, 'p_0').kind, 'perfect');
  });

  test('solo: the viewer alone — counted leaks ⇒ REDUCE, uncounted leaks only cost 0 ⇒ NOREDUCE (not NORMAL)', () => {
    const solo = (pp) => battleOverOf({ p_0: battleLossOf(pp) }, 'p_0');
    assert.deepEqual(solo({ perfect: false, leaked: [{ counted: true }, {}, { counted: false }] }), { kind: 'miss', lost: 2, sfx: 'battleOverReduce' });
    assert.deepEqual(solo({ perfect: true, leaked: [] }), { kind: 'perfect', lost: 0, sfx: 'battleOverNoReduce' });
    assert.deepEqual(solo({ perfect: false, leaked: [{ counted: false }] }), { kind: 'perfect', lost: 0, sfx: 'battleOverNoReduce' });
    assert.equal(solo(null).kind, 'perfect');
  });

  test('the box says the LP lost, capped per round like Match.settle — not the raw leak count (maintainer report 2026-10-09)', () => {
    const leaked = Array.from({ length: 17 }, () => ({ counted: true }));
    assert.equal(battleLossOf({ leaked }), 10);
    assert.equal(battleLossOf({ leaked }, 10), 10);
    assert.equal(battleLossOf({ leaked: leaked.slice(0, 7) }, 10), 7);
    assert.equal(battleLossOf({ leaked }, 20), 17);
    assert.equal(battleLossOf({ leaked: [{ counted: false }] }), 0);
    assert.deepEqual(battleOverOf({ p_0: battleLossOf({ leaked }) }, 'p_0'), { kind: 'miss', lost: 10, sfx: 'battleOverReduce' });
  });

  test('the three sounds are in the web manifest (sfx.ui)', () => {
    for (const k of ['battleOverReduce', 'battleOverNoReduce', 'battleOverNormal']) {
      assert.match(manifest.audio.sfx.ui[k], /act1autochess_b_ui_battleover_(reduce|noreduce|normal)\.mp3$/, k);
    }
  });
});
