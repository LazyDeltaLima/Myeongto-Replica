// test/render/enemy-buff-fx.test.js — an enemy's statuses drawn by its own buffs' effects (2026-10-21, docs/rules/fx.md
// 「적 상태의 버프 이펙트」): the client draws a status by its buff's effect (Entity.AddBuffEffect), so a sim status that
// stands for an enemy's buff names the client buff keys (`fxTag` 'buff:…') and the render takes that enemy's effects from
// enemy-modes.json (`buffFx`, a key used in several modes as `<key>#<mode>`); a rebirth's 无敌 (`ab:…:inv`) and its 隐匿
// take its own INVINCIBLE / INVISIBLE buffs' (`inv`, `stealth`); a buff's ON_BUFF_FINISH effect plays once as it ends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import * as F from '../../public/js/render/fxstatus.js';
import { UF } from '../../shared/constants.js';
import { PLAYS } from '../helpers/fxPlays.js';

const EMODES = {
  $fx: { warden: ['b', 'warden'], killer: ['b', 'killer'], killer2: ['b', 'killer2'], inv: ['b', 'inv'], hide: ['b', 'hide'],
    shield_a: ['b', 'shield_a'], shield_b: ['b', 'shield_b'], shield_end: ['b', 'shield_end'], not_here: ['b', 'not_here'],
    lib: ['b', 'lib'], wall: ['b', 'wall'], flash: ['b', 'flash'] },
  enemy_w: {
    modes: [{ name: 'Default', anim: ['Attack'] }, { name: 'R', anim: ['Attack'] }],
    buffFx: { 'enhance#0': ['warden'], 'enhance#1': ['killer'], 'enhance[eff1]': ['killer2'], 'sh[a]': ['shield_a'], 'sh[b]': ['shield_b', 'not_here'] },
    buffEnd: { 'sh[b]': ['shield_end'] },
    inv: ['inv'], stealth: ['hide'],
  },
  enemy_none: { modes: [{ name: 'Default', anim: ['Attack'] }] },
  enemy_1116_liprr: { modes: [{ name: 'Default', anim: ['Attack'] }, { name: 'R', anim: ['Attack'] }, { name: 'L', anim: ['Attack'], aura: ['lib'] }] },
  enemy_1516_jakill: { modes: [{ name: 'Default', anim: ['Attack'], aura: ['warden'] }, { name: 'R', anim: ['Attack'], aura: ['killer'] }] },
  enemy_one: { modes: [{ name: 'Default', anim: ['Attack'], aura: ['wall'] }] },
  enemy_s: { modes: [{ name: 'Default', anim: ['Attack'] }], buffFx: { dog: ['flash'], t_1: ['wall'] }, buffOnce: ['dog'] },
};
const files = {
  '/assets/local/fx/index.json': { bundles: { b: ['warden', 'killer', 'killer2', 'inv', 'hide', 'shield_a', 'shield_b', 'shield_end', 'lib', 'wall', 'flash'] } },
  '/assets/local/fx/enemy-modes.json': EMODES,
};
globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
const settle = () => new Promise((r) => setTimeout(r, 5));
const names = (r) => (r ? r.on.map((s) => s[1]) : null);

test('fxgame enemyBuffFx: the buffs a tag names (any mode of a bare key), their ends, the rebirth 无敌 and the 隐匿 — extracted ones only', async () => {
  const layer = createFxLayer({ host: null, above: null, quality: () => 'high' });
  await settle();
  const w = { id: 1, info: { id: 1, side: 'enemy', defId: 'enemy_w' } };
  assert.deepEqual(names(layer.enemyBuffFx(w, 'key', 'enhance#0')), ['warden']);
  assert.deepEqual(names(layer.enemyBuffFx(w, 'key', 'enhance#1|enhance[eff1]')), ['killer', 'killer2']);
  assert.deepEqual(names(layer.enemyBuffFx(w, 'key', 'enhance')), ['warden', 'killer'], 'a bare key: every mode\'s');
  const sh = layer.enemyBuffFx(w, 'key', 'sh[a]|sh[b]');
  assert.deepEqual(names(sh), ['shield_a', 'shield_b'], 'not extracted: left out');
  assert.deepEqual([...sh.ends.keys()], ['b/shield_b'], 'the end of [b] only');
  assert.deepEqual(sh.ends.get('b/shield_b').map((s) => s[1]), ['shield_end']);
  assert.deepEqual(sh.on[0], ['b', 'shield_a', 'own'], 'at the prefab\'s own spawn point');
  assert.deepEqual(names(layer.enemyBuffFx(w, 'inv')), ['inv']);
  assert.deepEqual(names(layer.enemyBuffFx(w, 'stealth')), ['hide']);
  assert.equal(layer.enemyBuffFx(w, 'key', 'nothing'), null);
  assert.equal(layer.enemyBuffFx({ id: 2, info: { id: 2, side: 'enemy', defId: 'enemy_none' } }, 'inv'), null);
  assert.equal(layer.enemyBuffFx({ id: 3, info: { id: 3, side: 'ally', defId: 'char_x' } }, 'inv'), null);
});

// a stub of fxgame.js enemyBuffFx for one enemy
const SPEC = (n) => ['b', n, 'own'];
const ebuff = (v, kind, tag) => {
  if (kind === 'inv') return { on: [SPEC('inv')], ends: new Map() };
  if (kind === 'stealth') return v.info.defId === 'enemy_w' ? { on: [SPEC('hide')], ends: new Map() } : null;
  if (tag === 'enhance#0') return { on: [SPEC('warden')], ends: new Map() };
  if (tag === 'sh[a]|sh[b]') return { on: [SPEC('shield_a'), SPEC('shield_b')], ends: new Map([['b/shield_b', [SPEC('shield_end')]]]) };
  return null;
};
const enemy = (statuses, from, extra = {}) => ({ info: { defId: 'enemy_w' }, isEnemy: true, alive: true, flags: 0,
  statuses: new Set(statuses), statusFrom: new Map(from), ...extra });
const want = (v) => [...F.wantedStatusFx(v, new Map(), ebuff).keys()].sort();

test('fxstatus: an enemy status naming its buffs draws the enemy\'s own effects; none bound — nothing', () => {
  assert.deepEqual(want(enemy(['ab:warden'], [['ab:warden', { src: null, fx: 'buff:enhance#0', n: 0 }]])), ['b/warden']);
  assert.deepEqual(want(enemy(['ab:xiShield'], [['ab:xiShield', { src: null, fx: 'buff:sh[a]|sh[b]', n: 0 }]])), ['b/shield_a', 'b/shield_b']);
  assert.deepEqual(want(enemy(['ab:helm'], [['ab:helm', { src: null, fx: 'buff:nothing', n: 0 }]])), [], 'its buff has no effect');
  // a rebirth's 无敌 (reborn() `ab:reborn:inv`): the enemy's INVINCIBLE buff; an operator kit's `…:inv` is not this path
  assert.deepEqual(want(enemy(['ab:reborn:inv'], [])), ['b/inv']);
  const op = { info: { defId: 'char_x' }, isEnemy: false, alive: true, flags: 0, statuses: new Set(['chen3:s2:inv']), statusFrom: new Map() };
  assert.deepEqual(want(op), []);
  // no resolver (no enemy bindings loaded): nothing drawn for these, the catalogue statuses as before
  assert.deepEqual([...F.wantedStatusFx(enemy(['ab:warden', 'stun'], [['ab:warden', { fx: 'buff:enhance#0' }]]), new Map()).keys()], ['stun']);
});

test('fxstatus: an enemy\'s 隐匿 is its own invisible buff\'s effect, else common_invisible', () => {
  assert.deepEqual(want(enemy([], [], { flags: UF.STEALTH })), ['b/hide']);
  assert.deepEqual(want(enemy([], [], { flags: UF.STEALTH, info: { defId: 'enemy_other' } })), ['stealth']);
});

test('syncStatusFx: a buff\'s end effect plays once as it ends on a living unit — not as the unit dies', () => {
  const calls = [];
  const fxGame = {
    statusLayer: () => true, statusReady: () => true, enemyBuffFx: ebuff,
    statusOn: (v, b, n, k) => { (v._fxStatusOn ||= new Set()).add(k); calls.push(['on', n]); },
    statusOff: (v, k) => { v._fxStatusOn.delete(k); calls.push(['off', k]); },
    statusOnce: (v, b, n) => calls.push(['once', n]),
  };
  const from = [['ab:xiShield', { fx: 'buff:sh[a]|sh[b]' }]];
  const e = enemy(['ab:xiShield'], from);
  const views = new Map([[1, e]]);
  F.syncStatusFx(views, fxGame, {});
  assert.deepEqual(calls.filter((c) => c[0] === 'on').map((c) => c[1]).sort(), ['shield_a', 'shield_b']);
  calls.length = 0;
  e.statuses.delete('ab:xiShield');
  F.syncStatusFx(views, fxGame, {});
  assert.deepEqual(calls.filter((c) => c[0] === 'once'), [['once', 'shield_end']], 'the end of [b], once');
  // the same buff ending with its unit's death: no end effect
  const d = enemy(['ab:xiShield'], from);
  const v2 = new Map([[2, d]]);
  F.syncStatusFx(v2, fxGame, {});
  calls.length = 0;
  d.alive = false;
  F.syncStatusFx(v2, fxGame, {});
  assert.equal(calls.filter((c) => c[0] === 'once').length, 0);
  assert.equal(calls.filter((c) => c[0] === 'off').length, 2);
});

test('END_FX: 凯瑟琳\'s device shield mark (its key\'s `end`) and 泥岩\'s last layer end into their official end effects', () => {
  assert.equal(F.END_FX['cathy_token/token_cathy_catsld_shield_01'], undefined, 'the keyed spec\'s end (2026-10-23)');
  assert.deepEqual(F.KEY_FX['cathy:shield'], ['cathy_token', { tpl: 'catsld_t_1[shield_mark]' }, 0]);
  assert.deepEqual(F.END_FX['mudrok/mudrok_buff_03_start'][0], ['mudrok', 'mudrok_buff_01_end', 'own']);
  // the layer it hangs on is the last one LAYER_FX keeps (its first)
  assert.equal(F.LAYER_FX['mudrok:layers'][0][1], 'mudrok_buff_03_start');
  const calls = [];
  const fxGame = {
    statusLayer: () => true, statusReady: () => true, plays: () => PLAYS,
    statusOn: (v, b, n, k) => { (v._fxStatusOn ||= new Set()).add(k); },
    statusOff: (v, k) => { v._fxStatusOn.delete(k); },
    statusOnce: (v, b, n) => calls.push(n),
  };
  const dev = { info: { defId: 'token_10020_cathy_catsld' }, isEnemy: false, alive: true, flags: 0, statuses: new Set(['cathy:shield']), statusFrom: new Map() };
  const views = new Map([[1, dev]]);
  F.syncStatusFx(views, fxGame, {});
  dev.statuses.delete('cathy:shield');
  F.syncStatusFx(views, fxGame, {});
  assert.deepEqual(calls, ['token_cathy_catsld_shield_01_end']);
});

// 2026-10-23: a multi-mode enemy's mode passive buffs, the mode chosen by its sim form (fxgame.js FORM_MODES)
test('fxgame enemyBuffFx \'mode\': the passive buffs of the mode its sim form stands for — none during a 重生', async () => {
  const layer = createFxLayer({ host: null, above: null, quality: () => 'high' });
  await settle();
  const p = (form) => ({ id: 1, form, info: { id: 1, side: 'enemy', defId: 'enemy_1116_liprr' } });
  assert.equal(layer.enemyBuffFx(p(null), 'mode'), null, 'confined: mode Default holds none');
  assert.equal(layer.enemyBuffFx(p('warning'), 'mode'), null, 'mode R');
  assert.deepEqual(names(layer.enemyBuffFx(p('liberty'), 'mode')), ['lib'], '【解放】 = mode L');
  const j = (form) => ({ id: 2, form, info: { id: 2, side: 'enemy', defId: 'enemy_1516_jakill' } });
  assert.deepEqual(names(layer.enemyBuffFx(j(null), 'mode')), ['warden']);
  assert.equal(layer.enemyBuffFx(j('reborn'), 'mode'), null, 'the 重生: its buffs cleared (Unit.DoFakeDeath), the new mode not yet');
  assert.deepEqual(names(layer.enemyBuffFx(j('form2'), 'mode')), ['killer'], 'the rebirth\'s end: mode R');
  assert.equal(layer.enemyBuffFx({ id: 3, info: { id: 3, side: 'enemy', defId: 'enemy_one' } }, 'mode'), null, 'one mode: its aura is the life-long one');
});

test('fxstatus: the mode\'s passive buffs join the enemy\'s wanted effects; one a status names too is one key', () => {
  const eb = (v, kind, tag) => (kind === 'mode' ? { on: [SPEC('warden')], ends: new Map() } : ebuff(v, kind, tag));
  const v = enemy(['ab:warden'], [['ab:warden', { src: null, fx: 'buff:enhance#0', n: 0 }]]);
  assert.deepEqual([...F.wantedStatusFx(v, new Map(), eb).keys()], ['b/warden']);
  assert.deepEqual([...F.wantedStatusFx(enemy([], []), new Map(), eb).keys()], ['b/warden'], 'the mode alone');
});

// 2026-10-23: an IMMEDIATELY buff (enemy-modes.json `buffOnce` — “碎铳之簧”'s achunt_dog_silence as its MoveToHunter mode
// comes on): the client's buff ends as it starts and finishes its effect, so the render flashes it once for the whole status
test('fxgame enemyBuffFx: an IMMEDIATELY buff\'s effect is `once`; syncStatusFx starts it once and never again while the status stands', async () => {
  const layer = createFxLayer({ host: null, above: null, quality: () => 'high' });
  await settle();
  const s = { id: 1, info: { id: 1, side: 'enemy', defId: 'enemy_s' } };
  assert.deepEqual([...layer.enemyBuffFx(s, 'key', 'dog').once], ['b/flash']);
  assert.deepEqual([...layer.enemyBuffFx(s, 'key', 't_1').once], [], 'a lasting buff: held');
  const calls = [];
  const fxGame = {
    statusLayer: () => true, statusReady: () => true, enemyBuffFx: (v, kind, tag) => layer.enemyBuffFx({ ...v, id: 1, info: { id: 1, side: 'enemy', defId: 'enemy_s' } }, kind, tag),
    statusOn: (v, b, n, k, frac, hold, under, once) => { (v._fxStatusOn ||= new Set()).add(k); calls.push(['on', n, once]); },
    statusOff: (v, k) => { v._fxStatusOn.delete(k); calls.push(['off', k]); },
  };
  const e = { info: { defId: 'enemy_s' }, isEnemy: true, alive: true, flags: 0, statuses: new Set(['boss:dash', 'boss:shield']),
    statusFrom: new Map([['boss:dash', { fx: 'buff:dog' }], ['boss:shield', { fx: 'buff:t_1' }]]) };
  const views = new Map([[1, e]]);
  F.syncStatusFx(views, fxGame, {});
  F.syncStatusFx(views, fxGame, {});
  assert.deepEqual(calls.filter((c) => c[0] === 'on').sort(), [['on', 'flash', true], ['on', 'wall', false]], 'one start each');
  e.statuses.delete('boss:dash');
  F.syncStatusFx(views, fxGame, {});
  assert.deepEqual(calls.filter((c) => c[0] === 'off'), [['off', 'b/flash']]);
});

test('KEY_FX: 扎罗\'s 【远古威慑】 range on itself (`ab:aweAura`) — its FearAura AuraAbility `_effects` at the prefab\'s own spawn point', () => {
  assert.deepEqual(F.KEY_FX['ab:aweAura'], ['pfx_enemy_14', 'enemy_wlfmster_B_buff_02', 'own']);
  const v = { info: { defId: 'enemy_1535_wlfmster' }, isEnemy: true, alive: true, flags: 0, statuses: new Set(['ab:aweAura']), statusFrom: new Map() };
  assert.deepEqual([...F.wantedStatusFx(v, new Map(), () => null).keys()], ['pfx_enemy_14/enemy_wlfmster_B_buff_02']);
});
