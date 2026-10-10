// A module's 攻击范围扩大 in another language (maintainer report 2026-10-10: 시 (夕) elite with SPC-X showed her 3×3 range
// on the direction wheel and the placing card while the Korean UI was on): the game-text overlays (data/i18n) translate
// trait.moduleDesc / skill desc, so shared/loadoutRecord.js attackRangeGrid reads the data's language-neutral flags
// (tools/build-data.mjs rangeUp / passiveRange / otherMode) instead of the Chinese words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyFileOverlay } from '../../shared/i18nData.js';
import { attackRangeGrid, traitRangeExtend } from '../../shared/loadoutRecord.js';
import { chessLoadout } from '../../public/js/ui/gameLogic/loadout.js';
import { deployedRecord } from '../../public/js/ui/gameLogic/standIn.js';
import { previewGrid } from '../../public/js/ui/facing.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const json = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const CHESS = json('data/chess.json');
const BACKUPS = json('data/backups.json');
const OVERLAYS = ['ko', 'en', 'ja', 'zh-TW'].map((l) => [l, json(`data/i18n/${l}.json`)]);
const key = (g) => JSON.stringify((g || []).map((p) => p.join(',')).sort());

for (const [lang, ov] of OVERLAYS) {
  test(`${lang}: 夕 elite SPC-X keeps her extended range on the wheel and the card`, () => {
    const loc = applyFileOverlay(CHESS, ov.files.chess).value;
    const zhRec = CHESS.chess_char_5_12_b;
    const rec = loc.chess_char_5_12_b;
    assert.notEqual(rec.trait.moduleDesc, zhRec.trait.moduleDesc, 'the overlay translated the module text');
    const want = attackRangeGrid(chessLoadout(zhRec, null, (id) => CHESS[id])?.record);
    assert.equal(want.length, 10, 'the 3×3 caster range + [0,3]');
    const getChess = (id) => loc[id];
    assert.equal(key(attackRangeGrid(chessLoadout(rec, null, getChess)?.record)), key(want), 'the card');
    const wheel = previewGrid({ getChess, chessRecord: (r) => deployedRecord(r, { loadout: {} }, getChess, BACKUPS) }, { kind: 'chess', id: 'chess_char_5_12_b' });
    assert.equal(key(wheel), key(want), 'the direction wheel');
  });
}

test('every chess: the same range and 攻击距离 in each language as in Chinese', () => {
  for (const [lang, ov] of OVERLAYS) {
    const loc = applyFileOverlay(CHESS, ov.files.chess).value;
    for (const [id, zh] of Object.entries(CHESS)) {
      const l = loc[id];
      for (const m of [null, ...(zh.modules || []).map((x) => x.uniEquipId)]) for (const sk of [0, 1, 2]) {
        const lo = { [zh.baseId || zh.chessId]: { skill: sk, ...(m ? { module: m } : {}) } };
        const a = chessLoadout(zh, lo, (x) => CHESS[x])?.record;
        const b = chessLoadout(l, lo, (x) => loc[x])?.record;
        assert.equal(key(attackRangeGrid(b)), key(attackRangeGrid(a)), `${lang} ${id} ${m} S${sk + 1}`);
        assert.equal(traitRangeExtend(b), traitRangeExtend(a), `${lang} ${id} ${m} 攻击距离`);
      }
    }
  }
});
