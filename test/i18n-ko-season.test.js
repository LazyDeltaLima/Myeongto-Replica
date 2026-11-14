// The Korean overlay: a season's own records (data/seasons/<id>/, shared/seasons.js) are in it, and a known fault of the KR
// table stays corrected (tools/i18n/build-ko-pack.mjs DATA_FIXES).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { applyFileOverlay } from '../shared/i18nData.js';
import { allSeasonData, seasonPicks } from './helpers/seasonPicks.js';

const json = (rel) => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));
const ko = json('data/i18n/ko.json');
const koSeason = json('data/i18n/ko.act3autochess.json'); // the season's own overlay (tools/build-i18n.mjs seasonOverlayPath)
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
  // 125 ids of 规程 name another operator than the default season's: the default overlay (keyed by id) checks each text
  // against its Chinese source, so it never gives such a piece the other's Korean; the season's own overlay
  // (data/i18n/ko.act3autochess.json, tools/build-i18n.mjs) gives it its own, applied over the default's as public/js/data.js does
  const { value: baseKo } = applyFileOverlay(base, ko.files.chess);
  assert.deepEqual([koSeason.lang, koSeason.season, ko.seasons], ['ko', 'act3autochess', undefined], 'a file of its own, not in the default\'s');
  const season = koSeason.files.chess;
  assert.ok(season, 'the season overlay of chess');
  const { value: seasonKo, stale } = applyFileOverlay(next, season, value);
  assert.equal(stale, 0);
  let other = 0;
  for (const [k, c] of Object.entries(next)) {
    if (!base[k] || !c.charId || c.charId === base[k].charId) continue;
    other++;
    assert.notEqual(value[k].name, baseKo[k].name, `${k}: ${c.name} reads as ${baseKo[k].name}`);
    assert.ok(!CJK.test(seasonKo[k].name) && seasonKo[k].name !== baseKo[k].name, `${k}: ${c.name} → ${seasonKo[k].name}`);
  }
  assert.ok(other >= 100, `${other} reused ids`);
  // 淬羽赫默 is 规程's chess_char_4_20 (another operator's id in 盟约)
  const slent2 = Object.keys(next).find((k) => next[k].charId === 'char_1031_slent2' && !next[k].isGolden);
  assert.ok(Object.hasOwn(base, slent2) && base[slent2].charId !== 'char_1031_slent2');
  assert.equal(seasonKo[slent2].name, '사일런스 더 패러디그매틱');
});

test('the default season never reads the season overlay: its records under the same ids keep the default\'s Korean', () => {
  const { value } = applyFileOverlay(base, ko.files.chess);
  const { value: wrong } = applyFileOverlay(base, koSeason.files.chess, value);
  // the season's leaves stop at their hash check on the default's Chinese texts that differ
  const k = Object.keys(next).find((id) => base[id] && next[id].charId && next[id].charId !== base[id].charId);
  assert.equal(wrong[k].name, value[k].name);
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

test('every season\'s 自选 picks read in Korean: name, skills, talents, trait (a pick a season adds needs its overlay rebuilt)', () => {
  // A season's backups.json is the whole file that season reads; the Korean it shows is the default overlay with the
  // season's own (data/i18n/ko.<season>.json) applied over it, as public/js/data.js does. A pick added to
  // LOCAL_DIY_PICKS without `node tools/i18n/build-ko-pack.mjs` (docs/rules/diy.md 「규정 선발 추가 …」) stays Chinese.
  const CJK = /[一-鿿]/;
  const checked = new Set();
  for (const [season, { chess, backups }] of Object.entries(allSeasonData())) {
    let value = applyFileOverlay(backups, ko.files.backups).value;
    if (season !== 'act2autochess') {
      const own = existsSync(new URL(`../data/i18n/ko.${season}.json`, import.meta.url)) ? json(`data/i18n/ko.${season}.json`) : null;
      if (own?.files?.backups) value = applyFileOverlay(backups, own.files.backups, value).value;
    }
    for (const charId of seasonPicks(chess)) {
      const where = `${season} ${charId} — the season's Korean overlay lacks this pick: run node tools/i18n/build-ko-pack.mjs --offline (docs/rules/diy.md 「규정 선발 추가 …」)`;
      const zhName = backups.diy?.operators?.[charId]?.name;
      assert.ok(zhName, `${where}: not in the season's backups.diy`);
      // (a name with no Chinese in it — Mon3tr — has nothing to translate)
      assert.ok(!CJK.test(value.diy.operators[charId].name), `${where}: name ${value.diy.operators[charId].name}`);
      const unit = value.units[charId];
      assert.ok(!CJK.test(unit.name), `${where}: unit name ${unit.name}`);
      for (const [form, f] of Object.entries(unit.forms)) {
        for (const s of f.skills ?? []) for (const k of ['name', 'desc']) assert.ok(!CJK.test(s[k] ?? ''), `${where} ${form} ${s.skillId}.${k}: ${s[k]}`);
        for (const t of f.talents ?? []) for (const k of ['name', 'desc']) assert.ok(!CJK.test(t[k] ?? ''), `${where} ${form} talent ${t.index}.${k}: ${t[k]}`);
        assert.ok(!CJK.test(f.trait?.desc ?? ''), `${where} ${form} trait: ${f.trait?.desc}`);
      }
      checked.add(`${season} ${charId}`);
    }
  }
  assert.ok(checked.has('act3autochess char_1020_reed2') && checked.has('act2autochess char_1031_slent2'), `${checked.size} picks checked`);
});
