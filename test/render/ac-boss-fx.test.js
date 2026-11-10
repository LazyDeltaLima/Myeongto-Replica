// test/render/ac-boss-fx.test.js — 规程's 假想敌：茧 / 鳍 and 淤困之茧 drawn by their official effects (2026-11-10, docs/rules/fx.md
// 「규정 보스 고치·지느러미의 이펙트」): the sim's buffs name their client buffs (`fxTag`), the web's buff on the operator it
// binds names the web as its source (fxstatus.js draws the web's acweb[vfx] there), and the render owns the fx events those
// effects stand for — the shield / 伪装 phases, the shield break (enemy-modes.json `buffBlocked`), the 鳍's jumping shot
// and the web's summon (nothing extracted: ac-boss-fx-bare.test.js — the layer's tables load once per process).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import * as F from '../../public/js/render/fxstatus.js';
import { getData } from '../../server/data.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const EEL = 'enemy_9037_aceel_2', SPIDER = 'enemy_9035_acspider', SPIDER2 = 'enemy_9035_acspider_2', WEB = 'enemy_9036_acweb';
const NAMES = ['sh_loop', 'sh_buff', 'sh_end', 'line', 'hit', 'mask', 'web1', 'weather', 'ground'];
const emodes = (extracted) => ({
  $fx: Object.fromEntries((extracted ? NAMES : []).map((n) => [n, ['b', n]])),
  [EEL]: {
    modes: [{ name: 'Default', anim: ['Attack'], ranged: { cast: [], opt: {}, hit: [], proj: { key: 'projectile_enemy_aceel', mount: 2, trail: ['line'], hit: ['hit'] } } }],
    skills: { poweratk: { cast: [], opt: {}, hit: [], proj: { key: 'projectile_enemy_aceel_pwratk', mount: 2, trail: ['line'], hit: ['hit'] } } },
    buffFx: { 'aceel[shield]': ['sh_loop'], 'aceel[power-atk]': ['sh_buff'] },
    buffBlocked: { 'aceel[shield]': ['sh_end'] },
    camera: ['weather'],
  },
  [SPIDER]: { modes: [{ name: 'Default', anim: ['Attack'] }], buffFx: { 'acspdier[evade]': ['mask'] } },
  [SPIDER2]: { modes: [{ name: 'Default', anim: ['Attack'] }], skills: { acidrain: { cast: [], opt: {}, hit: [], tile: ['ground'] } } },
  [WEB]: { modes: [{ name: 'Default', anim: [] }], buffFx: { 'acweb[vfx]': ['web1'] } },
});
const settle = () => new Promise((r) => setTimeout(r, 10));

async function layerWith(extracted, opts = {}) {
  const files = {
    '/assets/local/fx/index.json': { bundles: { b: extracted ? NAMES : [] } },
    '/assets/local/fx/enemy-modes.json': emodes(extracted),
  };
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  const seen = [];
  const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, enemyDef: () => null, trace: (p) => seen.push(p), ...opts });
  await settle();
  const foe = (id, defId) => ({ id, x: id, y: 0, alive: true, isEnemy: true, info: { id, side: 'enemy', defId }, actor: { roles: { attack: { loop: 'Attack' } } } });
  const ally = (id) => ({ id, x: id, y: 1, alive: true, info: { id, side: 'ally', defId: 'char_x' } });
  const views = new Map([[1, foe(1, EEL)], [2, foe(2, SPIDER)], [3, ally(3)], [4, ally(4)], [7, foe(7, SPIDER2)]]);
  layer.onEvent(['tick'], views);
  seen.length = 0;
  const take = () => seen.splice(0).filter((p) => p.kind === 'spawn').flatMap((p) => p.names);
  return { layer, views, take, seen };
}

test('鳍 / 茧 fx events: the shield and 伪装 phases are their buffs\' (no puff), the break plays buffBlocked, the jump flies the shot, the web has no birth puff', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { layer, views, take } = await layerWith(true);
    const ev = (kind, o) => { const e = ['fx', kind, 0, 0, o]; layer.onEvent(e, views); return e; };
    const on = ev('phase', { id: 1, kind: 'aceelShield' });
    assert.equal(layer.ownsFx(on), true, 'aceel[shield]\'s own effect is the status\'s');
    assert.deepEqual(take(), []);
    const off = ev('phase', { id: 1, kind: 'aceelShieldEnd' });
    assert.equal(layer.ownsFx(off), true);
    assert.deepEqual(take(), ['sh_end'], 'CheckBlocked → CreateEffect once');
    assert.equal(layer.ownsFx(ev('phase', { id: 2, kind: 'acspiderEvade', dur: 15 })), true);
    const jump = ev('link', { from: 3, to: 4, kind: 'aceelChain', dur: 0.2, id: 1, key: 'projectile_enemy_aceel_pwratk' });
    assert.equal(layer.ownsFx(jump), true, 'the jump is the 鳍\'s shot, not the stand-in beam');
    assert.equal(layer.ownsFx(ev('link', { from: 3, to: 4, kind: 'aceelChain', dur: 0.2, id: 1 })), false, 'no shot key: the beam');
    assert.equal(layer.ownsFx(ev('summon', { id: 2, key: WEB, tgt: 3 })), true, '淤困之茧 has no birth effect');
    assert.equal(layer.ownsFx(ev('summon', { id: 2, key: 'enemy_other', tgt: 3 })), false);
  } finally { globalThis.fetch = fetch0; }
});

test('鳍 (隐秘核心) weather: its talent buff\'s camera effect (enemy-modes.json `camera`) is on once while one such enemy lives, off as the last goes', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { layer, views, seen } = await layerWith(true);
    const frame = () => { layer.update(1 / 60, { dist: 20 }, { width: 100, height: 100 }); return seen.splice(0).filter((p) => /^camera/.test(p.kind)).map((p) => `${p.kind} ${p.names[0]}`); };
    assert.deepEqual(frame(), ['camera weather'], 'the 鳍 on the field: the screen comes on');
    assert.deepEqual(frame(), [], 'held, not started again each frame');
    const second = { ...views.get(1), id: 5, x: 5 };
    views.set(5, second);
    assert.deepEqual(frame(), [], 'a second 鳍: the same one effect (aceel[vfx-counter])');
    views.get(1).alive = false;
    assert.deepEqual(frame(), [], 'one 鳍 left: still on');
    second.remove = true;
    assert.deepEqual(frame(), ['cameraOff weather'], 'the last one gone: off');
    views.delete(1); views.delete(5);
    assert.deepEqual(frame(), []);
    views.set(6, { ...second, id: 6, remove: false, alive: true });
    assert.deepEqual(frame(), ['camera weather'], 'another 鳍 later: on again');
    layer.clear();
    views.delete(6);
    assert.deepEqual(frame(), [], 'clear() ended it: nothing left to switch off');
  } finally { globalThis.fetch = fetch0; }
});

test('茧 (隐秘核心) 【悲惨之雨】: its tile listeners\' floor (enemy-modes.json skills.acidrain.tile) on every drawn tile of the rain\'s field, no stand-in', async () => {
  const fetch0 = globalThis.fetch;
  try {
    // rows 2–5 drawn, row 4 col 3 not (a hole in the drawn board)
    const g = Array.from({ length: 6 }, (_, r) => Array.from({ length: 21 }, (_, c) => ({ drawn: r >= 2 && !(r === 4 && c === 3), h: c === 5 ? 1 : 0 })));
    const { layer, views, seen } = await layerWith(true, { grid: () => g });
    const rain = (o) => { const e = ['fx', 'zone', 10, 3, { x: 10, y: 3, r: 0, dur: 25, kind: 'acspiderRain', id: 7, ability: 'AcidRain', field: 'p1', ...o }]; layer.onEvent(e, views); return e; };
    const spawns = () => seen.splice(0).filter((p) => p.kind === 'spawn');
    assert.equal(layer.ownsFx(rain({ tiles: [2, 5, 0, 10] })), true, 'drawn here, not the stand-in zone');
    const got = spawns();
    assert.equal(got.length, 4 * 11 - 1, 'one floor per drawn tile of rows 2–5 × cols 0–10');
    assert.ok(got.every((p) => p.names[0] === 'ground' && p.tag === 'acRain'));
    assert.equal(layer.ownsFx(rain({ tiles: [2, 5, 11, 20], field: 'p2' })), true);
    assert.equal(spawns().length, 4 * 10, 'the other field: its own half');
    assert.equal(layer.ownsFx(rain({ tiles: null })), false, 'no tiles: the stand-in');
    assert.equal(layer.ownsFx(rain({ id: 2, tiles: [2, 5, 0, 10] })), false, 'an enemy without the tile effect: the stand-in');
    assert.deepEqual(spawns(), []);
  } finally { globalThis.fetch = fetch0; }
});

const EXTRACTED = new URL('../../public/assets/local/fx/enemy-modes.json', import.meta.url);
test('the extracted bindings: 鳍 (隐秘核心) alone holds a camera effect — its aceel[thurder-trigger]\'s screen_act3autochess_aceel_weather',
  { skip: !existsSync(EXTRACTED) && 'no extracted enemy effects' }, () => {
    const em = JSON.parse(readFileSync(EXTRACTED, 'utf8'));
    const holders = Object.entries(em).filter(([k, e]) => !k.startsWith('$') && e?.camera).map(([k, e]) => [k, e.camera]);
    assert.deepEqual(holders, [[EEL, ['screen_act3autochess_aceel_weather']]]);
    assert.deepEqual(em.$fx.screen_act3autochess_aceel_weather, ['screen', 'screen_act3autochess_aceel_weather'], 'extracted (the CN screen pack)');
  });
test('the extracted bindings: 茧 (隐秘核心) alone holds a tile effect — 悲惨之雨\'s enemy_acspider_debuff_ground_01 (Left / Right `_effectSettings`)',
  { skip: !existsSync(EXTRACTED) && 'no extracted enemy effects' }, () => {
    const em = JSON.parse(readFileSync(EXTRACTED, 'utf8'));
    const holders = Object.entries(em).filter(([k]) => !k.startsWith('$'))
      .flatMap(([k, e]) => Object.entries(e?.skills || {}).filter(([, p]) => p?.tile).map(([sk, p]) => `${k} ${sk} ${p.tile.join(',')}`));
    const G = 'enemy_acspider_debuff_ground_01';
    assert.deepEqual(holders.sort(), ['acidrain', 'acidrain/left', 'acidrain/right', 'left', 'right'].map((sk) => `${SPIDER2} ${sk} ${G}`).sort());
    assert.deepEqual(em.$fx[G], ['pfx_enemy_20', G], 'extracted (the CN enemy effect pack)');
  });

test('fxstatus: a status an enemy puts on an ally draws that enemy\'s binding of the buff it names (its applier `src`)', () => {
  const web = { id: 9, isEnemy: true, info: { defId: WEB } };
  const ebuff = (v, kind, tag) => (v === web && kind === 'key' && tag === 'acweb[vfx]' ? { on: [['b', 'web1', 'own']], ends: new Map() } : null);
  const op = (src) => ({ info: { defId: 'char_x' }, isEnemy: false, alive: true, flags: 0, statuses: new Set(['boss:acweb']),
    statusFrom: new Map([['boss:acweb', { src, fx: 'buff:acweb[vfx]', n: 0 }]]) });
  const viewOf = (id) => (id === 9 ? web : null);
  const keys = (v, vo) => [...F.wantedStatusFx(v, new Map(), ebuff, null, null, vo).keys()];
  assert.deepEqual(keys(op(9), viewOf), ['b/web1']);
  assert.deepEqual(keys(op(9), null), [], 'no views: nothing');
  assert.deepEqual(keys(op(7), viewOf), [], 'its source gone: nothing');
});

// ---------------------------------------------------------------------------------------------------------------
// the sim side: the real 规程 records and kits (content/bosses.js kitSpider / kitWeb / kitEel)

const quiet = { warn() {}, error() {}, info() {} };
const ACT3 = getData({ log: quiet, season: 'act3autochess' });
const WALL = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
function arena(keys, o = {}) {
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    kind: o.kind || 'boss', sharedBoss: o.kind === 'normal' ? null : { hp: 1e7, maxHp: 1e7, damage() {} }, enemies: [],
    defs: { chess: { t_wall: WALL }, enemies: Object.fromEntries(keys.map((k) => [k, ACT3.enemies[k]])) },
    kits: { t_wall: () => ({ trait: { noAttack: true } }) }, ...o.battle,
  });
  h.step();
  return h;
}
const statusFx = (h, key) => h.eventsOf('status').filter((e) => e[2] === key && e[3] === 1).map((e) => ({ fx: e[5]?.fx, src: e[4] }));

test('茧 sim: 伪装 names acspdier[evade]; the web\'s buff on its operator names acweb[vfx] with the web as its source', () => {
  const h = arena([SPIDER, WEB], { battle: { players: [{ playerId: 'p1', seat: 0, side: 'L', colOffset: 0, units: [{ uid: 1, chessId: 't_wall', row: 2, col: 3, abs: true }] }] } });
  h.spawn(SPIDER, { pos: [3, 10], routeIndex: 0, tag: 'boss' });
  h.b.sharedBoss.hp = 0.7e7;   // the boss field's shared HP (假想敌's HP is the pool's)
  const op = h.b.allies()[0];
  const web = h.spawn(WEB, { pos: [op.tileR, op.tileC], routeIndex: 0, tag: null });
  h.runUntil(() => statusFx(h, 'boss:acspiderEvade').length && statusFx(h, 'boss:acweb').length, 5);
  assert.deepEqual(statusFx(h, 'boss:acspiderEvade').map((s) => s.fx), ['buff:acspdier[evade]']);
  assert.deepEqual(statusFx(h, 'boss:acweb'), [{ fx: 'buff:acweb[vfx]', src: web.id }]);
});

test('鳍 sim: the shield and the strong attack name aceel[shield] / aceel[power-atk]; a jump names the 鳍 and its shot', () => {
  const units = [{ chessId: 't_wall', row: 9, col: 6 }, { chessId: 't_wall', row: 9, col: 5 }, { chessId: 't_wall', row: 8, col: 6 }];
  const h = arena([EEL], { kind: 'normal', battle: { units } });
  const eel = h.spawn(EEL, { pos: undefined, routeIndex: 0, tag: 'boss' });
  const links = h.eventsOf.bind(h);
  h.runUntil(() => links('fx').some((e) => e[1] === 'link' && e[4]?.kind === 'aceelChain'), 60);
  assert.deepEqual([...new Set(statusFx(h, 'boss:aceelShield').map((s) => s.fx))], ['buff:aceel[shield]']);
  assert.deepEqual([...new Set(statusFx(h, 'boss:aceelPower').map((s) => s.fx))], ['buff:aceel[power-atk]']);
  const jump = links('fx').find((e) => e[1] === 'link' && e[4]?.kind === 'aceelChain')[4];
  assert.equal(jump.id, eel.id);
  assert.ok(['projectile_enemy_aceel', 'projectile_enemy_aceel_pwratk'].includes(jump.key), jump.key);
});

test('茧 (隐秘核心) sim: 【悲惨之雨】\'s zone names the tiles of the field it rains on — its own half first, then the other player\'s', () => {
  const wall = (base, list) => list.map(([row, col], i) => ({ uid: base + i, chessId: 't_wall', row, col, abs: true }));
  const h = arena([SPIDER2], { battle: { players: [
    { playerId: 'p1', seat: 0, side: 'L', colOffset: 0, units: wall(1, [[2, 3]]) },
    { playerId: 'p2', seat: 1, side: 'R', colOffset: 8, units: wall(101, [[2, 15]]) },
  ] } });
  h.spawn(SPIDER2, { pos: [3, 10], routeIndex: 0, tag: 'boss' });
  const rains = () => h.eventsOf('fx').filter((e) => e[1] === 'zone' && e[4]?.kind === 'acspiderRain').map((e) => e[4]);
  h.runUntil(() => rains().length >= 2, 70);
  assert.deepEqual(rains().map((o) => [o.field, o.tiles]), [['p1', [2, 5, 0, 10]], ['p2', [2, 5, 11, 20]]], 'rows 2–5 (not the hand rows), each half');
  assert.ok(rains().every((o) => /acidrain/i.test(o.ability)), 'names the ability (its tile effect)');
});
