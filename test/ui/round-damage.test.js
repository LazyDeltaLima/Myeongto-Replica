// The round damage panel's view logic (ui/gameLogic/roundDamage.js, ui/roundDamage.js; docs/rules/ui.md
// 「라운드 대미지 패널」, maintainer decision 2026-10-25): which numbers it shows when (the current round's settled
// message > the own battle running live > the previous round's message; another match's never), the rows (board
// operators only, a sold one stays in the total), the settings (on by default, 'auto' style) and the strings.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { roundDamageSource, roundDamageRows, ROUND_DAMAGE_ROWS, sanitizeSettings, DEFAULT_SETTINGS, ROUND_DAMAGE_STYLES } from '../../public/js/ui/gameLogic.js';

const board = [{ uid: 1, kind: 'chess', id: 'a' }, { uid: 2, kind: 'chess', id: 'b' }, { uid: 3, kind: 'token', id: 't', ownerUid: 2 }];
const live = (done) => ({ done, units: [{ uid: 1, dmg: 10 }, { uid: 3, dmg: 30 }] });

test('roundDamageSource: settled this round > live own battle > the previous round; never an older message', () => {
  const m5 = { round: 5, units: [[1, 7]] };
  // prep of round 6: the last settle
  assert.deepEqual(roundDamageSource({ round: 6, msg: m5, board }), { round: 5, live: false, pairs: [[1, 7]] });
  // round 6's battle: live, folded onto the board (the summon piece counts for 2)
  assert.deepEqual(roundDamageSource({ round: 6, msg: m5, live: live(false), board, combat: true }), { round: 6, live: true, pairs: [[2, 30], [1, 10]] });
  // the own battle done, 联防 running: the local final, no longer live
  assert.equal(roundDamageSource({ round: 6, msg: m5, live: live(true), board, combat: true }).live, false);
  // settled round 6 wins over the live reading
  const m6 = { round: 6, units: [[2, 31], [1, 10]] };
  assert.deepEqual(roundDamageSource({ round: 6, msg: m6, live: live(true), board, combat: true }), { round: 6, live: false, pairs: m6.units });
  // a battle phase without an own battle (eliminated): the last settle
  assert.equal(roundDamageSource({ round: 6, msg: m5, live: null, board, combat: true }).round, 5);
  // a live reading outside a battle phase is ignored
  assert.equal(roundDamageSource({ round: 6, live: live(false), board, combat: false }), null);
  // another match's message (the page kept it): never shown
  assert.equal(roundDamageSource({ round: 2, msg: { round: 12, units: [[1, 1]] }, board }), null);
  assert.equal(roundDamageSource({ round: 9, msg: m5, board }), null);
  assert.equal(roundDamageSource({ round: 1, board }), null);
});

test('roundDamageRows: board operators most first, share of the total, a sold one only in the total, the rest counted', () => {
  const { rows, rest, total } = roundDamageRows([[9, 50], [2, 30], [1, 20], [3, 999]], board, 8);
  assert.equal(total, 50 + 30 + 20 + 999);
  assert.deepEqual(rows.map((r) => r.uid), [2, 1], 'uid 9 was sold, uid 3 is no operator piece');
  assert.equal(rest, 0);
  assert.equal(rows[0].bar, 1);
  assert.equal(rows[1].bar, 20 / 30);
  assert.equal(rows[0].share, 30 / total);
  const cut = roundDamageRows([[1, 5], [2, 6]], board, 1);
  assert.deepEqual([cut.rows.map((r) => r.uid), cut.rest], [[2], 1]);
  assert.deepEqual(roundDamageRows([[1, 0]], board, 5).rows[0], { uid: 1, piece: board[0], dmg: 0, share: 0, bar: 0 });
  assert.deepEqual(roundDamageRows(null, null, 5), { rows: [], rest: 0, total: 0 });
  assert.deepEqual(ROUND_DAMAGE_ROWS, { desktop: 8, phone: 5 });
});

test('settings: the panel is on by default with the automatic style; bad values fall back', () => {
  assert.equal(DEFAULT_SETTINGS.roundDamage, true);
  assert.equal(DEFAULT_SETTINGS.roundDamageStyle, 'auto');
  assert.deepEqual(ROUND_DAMAGE_STYLES, ['auto', 'full', 'compact']);
  const s = sanitizeSettings({ roundDamage: false, roundDamageStyle: 'compact' });
  assert.equal(s.roundDamage, false);
  assert.equal(s.roundDamageStyle, 'compact');
  const bad = sanitizeSettings({ roundDamage: 'yes', roundDamageStyle: 'huge' });
  assert.equal(bad.roundDamage, true);
  assert.equal(bad.roundDamageStyle, 'auto');
});

test('strings: every new panel / settings string has its English and Korean', () => {
  const en = JSON.parse(readFileSync(new URL('../../public/i18n/en.json', import.meta.url), 'utf8'));
  const ko = JSON.parse(readFileSync(new URL('../../public/i18n/ko/ui.json', import.meta.url), 'utf8'));
  for (const k of ['回合伤害统计', '伤害统计样式', '自动', '详细', '简洁', '回合 {n}', '另外 {n} 名 · 合计', '伤害', '实时', '收起', '合计']) {
    assert.ok(typeof en[k] === 'string' && en[k], `en: ${k}`);
    assert.ok(typeof ko[k] === 'string' && ko[k], `ko: ${k}`);
  }
  assert.equal(ko['回合 {n}'], '라운드 {n}');
});
