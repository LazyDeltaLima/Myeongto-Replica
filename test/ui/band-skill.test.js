// 规程's active 指令 on the HUD (ui/bandSkill.js; docs/rules/ui.md 「규정 액티브 전략 — 초상·클릭·드래그」): the counter under
// the portrait, the drag tip, the target under the pointer (own operators on the board or in the 整备区, a 调度中心 card of
// the stage's kind, a field tile), and the wiring a browser needs — the field host passing pickAt on, the touch drag not
// handed to the browser's pan, the 调度中心 cards carrying their slot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const { bandSkillCounter, bandSkillTip, bandSkillTarget, BAND_SKILL_HL } = await import('../../public/js/ui/bandSkill.js');
const { GEO } = await import('../../shared/constants.js');

const view = (o) => ({ stage: 0, stageCount: 1, type: 'ACTIVE', target: { type: 'NO_TARGET', filter: null }, cost: 0, avail: { type: 'ROUND_RESET', count: 1 }, usesLeft: 1, cooldown: 0, usable: true, blocked: null, marks: [], ...o });
const priv = {
  board: [{ uid: 5, kind: 'chess', row: 9, col: 4 }, { uid: 6, kind: 'item', row: 9, col: 5 }],
  hand: [null, { uid: 7, kind: 'chess' }, { uid: 8, kind: 'item' }],
  shop: { slots: [{ kind: 'chess', id: 'a', sold: false }, { kind: 'item', id: 'b', sold: false }, { kind: 'chess', id: 'c', sold: true }] },
};
/** A 调度中心 card element under the pointer (what `closest('.shopbar__cards [data-slot]')` finds). */
const card = (slot, row = true) => ({ closest: (sel) => (row && sel === '.shopbar__cards [data-slot]' ? { getAttribute: (k) => (k === 'data-slot' ? String(slot) : null) } : null) });

test('the counter: uses left, the cooldown\'s rounds, a lock while the stage is locked, nothing for a cost-priced stage', () => {
  assert.deepEqual(bandSkillCounter(view({ usesLeft: 2 })), { icon: null, text: '2' });
  assert.deepEqual(bandSkillCounter(view({ usesLeft: null, cooldown: 3, avail: { type: 'COOLDOWN', count: 3 } })), { icon: 'clock', text: '3' });
  assert.deepEqual(bandSkillCounter(view({ type: 'NONE' })), { icon: 'lock', text: '' });
  assert.equal(bandSkillCounter(view({ usesLeft: null, avail: { type: 'DEFAULT', count: 0 } })), null);
  assert.equal(bandSkillCounter(null), null);
});

test('the drag tip follows the table\'s targetTip, else the target kind', () => {
  assert.deepEqual(bandSkillTip({ type: 'COMMON_CHESS', filter: 'CHAR', tip: 'AUTO_CHESS_BANDSKILL_TIPS_OPEARTOR_BATTLE' }), ['请指向{place}的干员', '战场或整备区']);
  assert.deepEqual(bandSkillTip({ type: 'SHOP_SLOT', filter: 'EQUIP', tip: null }), ['请指向{place}的装备', '调度中心']);
  assert.deepEqual(bandSkillTip({ type: 'SHOP_SLOT', filter: 'CHAR' }), ['请指向{place}的干员', '调度中心']);
  assert.deepEqual(bandSkillTip({ type: 'MAP_TILE', filter: 'PASSABLE' }), ['请指向{place}的可用地块', '战场']);
  assert.equal(bandSkillTip({ type: 'NO_TARGET' }), null);
});

test('an operator target: an own board or 整备区 operator, its tile lit; not an item for CHAR, not someone else\'s piece', () => {
  const bs = view({ target: { type: 'COMMON_CHESS', filter: 'CHAR' } });
  assert.deepEqual(bandSkillTarget(bs, priv, { piece: { uid: 5 }, tile: { row: 9, col: 4 } }, null), { fields: { uid: 5 }, tile: [9, 4] });
  assert.deepEqual(bandSkillTarget(bs, priv, { piece: { uid: 7 }, tile: null }, null), { fields: { uid: 7 }, tile: [GEO.HAND_ROW, 1] }, 'the 整备区 slot is its tile');
  assert.equal(bandSkillTarget(bs, priv, { piece: { uid: 6 } }, null), null, 'an item on the board');
  assert.equal(bandSkillTarget(bs, priv, { piece: { uid: 8 } }, null), null, 'an item in the hand');
  assert.equal(bandSkillTarget(bs, priv, { piece: { uid: 99 } }, null), null, 'not one of mine');
  assert.equal(bandSkillTarget(bs, priv, { piece: null, tile: { row: 9, col: 4 } }, null), null, 'a tile is no operator');
  assert.deepEqual(bandSkillTarget(view({ target: { type: 'COMMON_CHESS', filter: null } }), priv, { piece: { uid: 6 } }, null)?.fields, { uid: 6 }, 'no filter: any own piece');
});

test('a 调度中心 target: an unsold card of the stage\'s kind in the shop row (not the reward row)', () => {
  const chess = view({ target: { type: 'SHOP_SLOT', filter: 'CHAR' } });
  const equip = view({ target: { type: 'SHOP_SLOT', filter: 'EQUIP' } });
  const r = bandSkillTarget(chess, priv, null, card(0));
  assert.deepEqual(r.fields, { slot: 0 });
  assert.ok(r.card, 'the card is outlined');
  assert.equal(bandSkillTarget(chess, priv, null, card(1)), null, 'an equipment card for an operator stage');
  assert.deepEqual(bandSkillTarget(equip, priv, null, card(1))?.fields, { slot: 1 });
  assert.equal(bandSkillTarget(chess, priv, null, card(2)), null, 'sold');
  assert.equal(bandSkillTarget(chess, priv, null, card(0, false)), null, 'not in the shop row');
  assert.equal(bandSkillTarget(chess, priv, null, null), null);
});

test('a tile target: a field tile, its tile lit; PASSABLE_AND_BUILDABLE never takes an occupied one', () => {
  const F = GEO.FIELD;
  const pass = view({ target: { type: 'MAP_TILE', filter: 'PASSABLE' } });
  const build = view({ target: { type: 'MAP_TILE', filter: 'PASSABLE_AND_BUILDABLE' } });
  assert.deepEqual(bandSkillTarget(pass, priv, { piece: { uid: 5 }, tile: { row: 9, col: 4 } }, null), { fields: { row: 9, col: 4 }, tile: [9, 4] }, 'PASSABLE: a unit on it is no matter');
  assert.equal(bandSkillTarget(build, priv, { tile: { row: 9, col: 4 } }, null), null, 'occupied');
  assert.deepEqual(bandSkillTarget(build, priv, { tile: { row: 9, col: 6 } }, null)?.fields, { row: 9, col: 6 });
  assert.equal(bandSkillTarget(pass, priv, { tile: { row: GEO.HAND_ROW, col: 1 } }, null), null, 'the 整备区 is no field tile');
  assert.equal(bandSkillTarget(pass, priv, { tile: { row: F.r0 - 1, col: F.c0 } }, null), null);
  assert.equal(bandSkillTarget(pass, priv, null, null), null);
});

test('the lit tile has a group of its own (the placement highlights stay)', () => {
  assert.equal(BAND_SKILL_HL.group, 'bandSkill');
});

test('wiring: the field host passes pickAt on; both views have it; the drag sends g.bandSkill', () => {
  // without it in the host's list the hosted view has no pickAt and no drag ever finds a target
  assert.match(read('public/js/ui/fieldHost.js'), /const OPTIONAL = \[[^\]]*'pickAt'/);
  assert.match(read('public/js/render/app.js'), /\n {4}pickAt\(clientX, clientY\) \{/);
  assert.match(read('public/js/ui/fallbackField.js'), /\n {4}pickAt\(clientX, clientY\) \{/);
  assert.match(read('public/js/ui/gameActions.js'), /bandSkill: \(fields = \{\}\) => act\('g\.bandSkill', fields/);
  // the 调度中心 cards name their slot for the drop (shop row only: `.shopbar__cards`)
  assert.equal((read('public/js/ui/shopBar.js').match(/data-slot=\$\{idx\}/g) || []).length, 2, 'operator and item cards');
});

test('css: a touch drag is not handed to the pan — touch-action none beats devices.css\'s [role="button"] manipulation', () => {
  const css = read('public/css/screens/game-panels.css');
  assert.match(read('public/css/devices.css'), /\[role="button"\][^{]*\{[^}]*touch-action: manipulation/);
  // (0,2,0) over the attribute selector's (0,1,0) in the stylesheet loaded last
  assert.match(css, /\n\.bskill \.bskill__band \{ touch-action: none; \}/);
  assert.match(css, /\.bskill\.is-battle \{ top: auto; bottom:/, 'in a battle the portrait sits low (skill_layout_battle)');
  assert.match(css, /\.gm--prep\.has-bskill \.gm__effects \{ top:/, 'the effects column steps down under it in the prep');
});
