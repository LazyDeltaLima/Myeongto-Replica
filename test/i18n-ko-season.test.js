// The Korean overlay: a season's own records (data/seasons/<id>/, shared/seasons.js) are in it, and a known fault of the KR
// table stays corrected (tools/i18n/build-ko-pack.mjs DATA_FIXES).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyFileOverlay } from '../shared/i18nData.js';

const json = (rel) => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));
const ko = json('data/i18n/ko.json');
const next = json('data/seasons/next/chess.json');

test('the hidden season\'s own pieces read in Korean, kits included', () => {
  const { value } = applyFileOverlay(next, ko.files.chess);
  const CJK = /[一-鿿]/;
  // 바이슨, 쥐, 타락사쿰, 우요우, 레토, 이스티나, 우쿠시크: the KR tables have them
  for (const id of ['nbison', 'nju', 'ntaraxa', 'nnothin', 'nleto', 'nglassb', 'nturdus']) {
    const key = Object.keys(next).find((k) => k.includes(`_${id}_a`));
    assert.ok(key, id);
    const c = value[key];
    assert.ok(!CJK.test(c.name), `${id}: ${c.name}`);
    for (const t of [...(c.talents ?? []), c.skill, c.trait].filter(Boolean)) {
      for (const f of ['name', 'desc', 'description']) if (typeof t[f] === 'string') assert.ok(!CJK.test(t[f]), `${id} ${f}: ${t[f]}`);
    }
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
