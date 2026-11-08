// The Korean overlay: a season's own records (data/seasons/<id>/, shared/seasons.js) are in it, and a known fault of the KR
// table stays corrected (tools/i18n/build-ko-pack.mjs DATA_FIXES).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyFileOverlay } from '../shared/i18nData.js';

const json = (rel) => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));
const ko = json('data/i18n/ko.json');
const next = json('data/seasons/act3autochess/chess.json');
const base = json('data/chess.json');

test('the hidden season\'s own pieces read in Korean, kits included; a reused id never takes the other operator\'s', () => {
  const { value } = applyFileOverlay(next, ko.files.chess);
  const CJK = /[一-鿿]/;
  // 이스티나, 아스트젠, 안드레아나, 폰사이러스: ids only 규정 has, and the KR tables have them
  for (const id of ['glassb', 'halo', 'cuttle', 'buildr']) {
    const key = Object.keys(next).find((k) => !next[k].isGolden && next[k].charId?.endsWith(`_${id}`));
    assert.ok(key && !Object.hasOwn(base, key), id);
    const c = value[key];
    assert.ok(!CJK.test(c.name), `${id}: ${c.name}`);
    for (const t of [...(c.talents ?? []), c.skill, c.trait].filter(Boolean)) {
      for (const f of ['name', 'desc', 'description']) if (typeof t[f] === 'string') assert.ok(!CJK.test(t[f]), `${id} ${f}: ${t[f]}`);
    }
  }
  // 125 ids of 规程 name another operator than the default season's: the overlay (keyed by id) checks each text against
  // its Chinese source, so such a piece keeps its Chinese until a per-season overlay exists, never the other's Korean
  const { value: baseKo } = applyFileOverlay(base, ko.files.chess);
  for (const [k, c] of Object.entries(next)) {
    if (!base[k] || !c.charId || c.charId === base[k].charId) continue;
    assert.notEqual(value[k].name, baseKo[k].name, `${k}: ${c.name} reads as ${baseKo[k].name}`);
  }
});

test('the default season applies the same overlay untouched by those records', () => {
  const chess = json('data/chess.json');
  const { value, stale } = applyFileOverlay(chess, ko.files.chess);
  assert.equal(stale, 0);
  assert.deepEqual(Object.keys(value), Object.keys(chess));
});

test('시라쿠사 맹약 keeps its own description (the KR table has 에기르\'s on it)', () => {
  const { desc, descRaw } = ko.files.bonds.siracusaShip;
  for (const t of [desc, descRaw]) {
    assert.ok(t.includes('시라쿠사'), t);
    assert.ok(!t.includes('에기르'), t);
  }
});
