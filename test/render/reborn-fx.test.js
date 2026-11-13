// test/render/reborn-fx.test.js — 规程's 萨卡兹子裔 drawn by their official effects (2026-11-11, docs/rules/fx.md 「규정 살카즈 후예
// 무리」): the 轰击者's shell lies where it landed (its projectile's reach effect), blows up there (its stop effect) and hits
// what the blast hits (its hit effect); the 集恨者 shows enemy_dklord_buff_01 / _02 by the 重生造物 on its field; a 重生造物
// summoned on a knock-out is drawn by its own birth effect, no stand-in puff. The sim's events come from the real 规程 kits
// (content/enemies/reborn.js); the render runs on a sample binding (the extracted effects are not needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import * as F from '../../public/js/render/fxstatus.js';
import { getData } from '../../server/data.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';
import { fxEvent } from '../helpers/fxEvent.js';

const MODES = new URL('../../public/assets/local/fx/enemy-modes.json', import.meta.url);
const quiet = { warn() {}, error() {}, info() {} };
const ACT3 = getData({ log: quiet, season: 'act3autochess' });
const THROW = 'enemy_1361_dthrow', LORD = 'enemy_1226_dklord', DPVT = 'enemy_1222_dpvt', DZOMS = 'enemy_1220_dzoms', DZOMG = 'enemy_1221_dzomg';
const BEAST = 'enemy_1131_sbeast', PLASM = 'enemy_1137_plasm';
const WALL = (id) => chessRec({ id, profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });

function field(keys, units) {
  const enemies = Object.fromEntries(keys.map((k) => [k, ACT3.enemies[k]]));
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    kind: 'normal', sharedBoss: null, enemies: [], defs: { chess: { t_wall: WALL('t_wall') }, enemies },
    kits: { t_wall: () => ({ trait: { noAttack: true } }) }, units,
  });
  h.step();
  return h;
}
const put = (h, key, pos) => h.spawn(key, { pos, routeIndex: 0, mods: { speedMul: 0 }, tag: null });

const PROJ = { key: 'projectile_enemy_dthrow', mount: 2, trail: ['enemy_dthrow_attack_trail'], hit: ['enemy_dthrow_attack_hit'],
  reached: ['enemy_dthrow_attack_fire_ground'], stop: ['enemy_dthrow_attack_fire_explode'], move: 'OTHER', speed: 8, raise: 0.5 };
const NAMES = ['enemy_dthrow_attack_trail', 'enemy_dthrow_attack_hit', 'enemy_dthrow_attack_fire_ground', 'enemy_dthrow_attack_fire_explode',
  'enemy_dzoms_born_01', 'enemy_dklord_buff_01', 'enemy_dklord_buff_02', 'enemy_sbeast_skill_start', 'enemy_sbeast_skill_trail', 'plasm_birth_01_start'];
const emodes = () => ({
  $fx: Object.fromEntries(NAMES.map((n) => [n, ['b', n]])),
  [THROW]: { modes: [{ name: 'Default', anim: ['Attack'], ranged: { cast: [], opt: {}, hit: [], proj: PROJ }, melee: { cast: [], opt: {}, hit: [], proj: PROJ } }] },
  [DPVT]: { modes: [{ name: 'Default', anim: ['Attack'] }] },
  [DZOMS]: { modes: [{ name: 'Default', anim: ['Attack'] }], start: 'enemy_dzoms_born_01' },
  [BEAST]: { modes: [{ name: 'Default', anim: ['Attack'] }], skills: { deathrattle: { cast: [], opt: {}, hit: [], summon: ['enemy_sbeast_skill_start'], proj: { key: 'projectile_enemy_sbeast', mount: null, trail: ['enemy_sbeast_skill_trail'], move: 'OTHER', speed: 6, raise: 0.3 } } } },
  [PLASM]: { modes: [{ name: 'Default', anim: ['Attack'] }], born: ['plasm_birth_01_start'] },
  [LORD]: { modes: [{ name: 'Default', anim: ['Attack'] }], buffFx: { 'ememy_dklord_atk[effect_1]': ['enemy_dklord_buff_01'], 'ememy_dklord_atk[effect_2]': ['enemy_dklord_buff_02'] } },
});

async function layer() {
  const files = { '/assets/local/fx/index.json': { bundles: { b: NAMES } }, '/assets/local/fx/enemy-modes.json': emodes() };
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  const seen = [];
  const L = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, enemyDef: (id) => ACT3.enemies[id] || null, trace: (p) => seen.push(p) });
  await new Promise((r) => setTimeout(r, 10));
  return { L, seen };
}
/** A view of sim unit `u` for the layer. */
const viewOf = (u) => ({ id: u.id, x: u.x, y: u.y, alive: true, isEnemy: u.side === 'enemy', info: { id: u.id, side: u.side === 'enemy' ? 'enemy' : 'ally', defId: u.defId ?? 'char_x' } });

test('萨卡兹子裔轰击者\'s shell: its reach effect where it lies, then its stop effect there and its hit on each unit the blast hits — no stand-in', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const h = field([THROW], [{ chessId: 't_wall', row: 10, col: 4, uid: 1 }, { chessId: 't_wall', row: 10, col: 5, uid: 2 }]);
    put(h, THROW, [10, 6.5]);
    const evs = h.events;
    const t0 = h.b.time;
    while (h.b.time - t0 < 20 && !evs.some((e) => e[0] === 'fx' && e[1] === 'explode' && e[4]?.kind === 'dthrowShell')) h.step();
    h.step(3);
    const tel = evs.find((e) => e[0] === 'fx' && e[1] === 'telegraph' && e[4]?.kind === 'dthrowShell');
    const boom = evs.find((e) => e[0] === 'fx' && e[1] === 'explode' && e[4]?.kind === 'dthrowShell');
    assert.ok(tel && boom, 'the sim lays a shell and blows it up');
    const thrower = h.b.enemies.find((x) => x.defId === THROW);
    assert.equal(tel[4].id, thrower.id);
    const after = evs.slice(evs.indexOf(boom) + 1);
    const blastDmg = after.filter((e) => e[0] === 'dmg' && e[5] === thrower.id);
    assert.ok(blastDmg.length >= 1, 'the blast\'s damage follows it');

    const { L, seen } = await layer();
    const views = new Map([[thrower.id, viewOf(thrower)], ...h.allies().map((u) => [u.id, viewOf(u)])]);
    L.onEvent(['tick'], views);
    seen.length = 0;
    const names = () => seen.splice(0).filter((p) => p.kind === 'spawn').map((p) => `${p.names[0]}${p.on != null ? '>' + p.on : ''}`);
    L.onEvent(tel, views);
    assert.equal(L.ownsFx(tel), true, 'no stand-in ring');
    assert.deepEqual(names(), ['enemy_dthrow_attack_fire_ground'], 'it lies there burning');
    L.onEvent(boom, views);
    assert.equal(L.ownsFx(boom), true, 'no stand-in blast');
    for (const d of blastDmg) L.onEvent(d, views);
    assert.deepEqual(names(), ['enemy_dthrow_attack_fire_explode', ...blastDmg.map((d) => `enemy_dthrow_attack_hit>${d[1]}`)]);
    L.update(0.1, { dist: 20 }, { width: 100, height: 100 });
    seen.length = 0;
    L.onEvent(blastDmg[0], views);
    assert.ok(!names().includes(`enemy_dthrow_attack_hit>${blastDmg[0][1]}`), 'a later hit by it is no blast');
    const other = fxEvent('explode', { x: 1, y: 1, r: 1.1, kind: 'dthrowShell' });
    L.onEvent(other, views);
    assert.equal(L.ownsFx(other), false, 'a blast with no shell drawn: the stand-in');
  } finally { globalThis.fetch = fetch0; }
});

test('萨卡兹子裔集恨者: enemy_dklord_buff_01 above two 重生造物 on its field, enemy_dklord_buff_02 too from five', () => {
  const lord = { id: 1, alive: true, isEnemy: true, flags: 0, info: { id: 1, side: 'enemy', defId: LORD }, statuses: new Set(['ab:dklord']), statusFrom: new Map() };
  const own = (_v, kind, tag) => (kind === 'key' ? { on: tag.split('|').map((t) => ['b', t === 'ememy_dklord_atk[effect_1]' ? 'enemy_dklord_buff_01' : 'enemy_dklord_buff_02', 0.5]), ends: new Map(), once: new Set() } : null);
  const at = (n) => {
    const views = new Map([[1, lord], ...Array.from({ length: n }, (_, i) => [10 + i, { id: 10 + i, alive: true, isEnemy: true, info: { defId: i % 2 ? DZOMS : DZOMG } }])]);
    views.set(99, { id: 99, alive: true, isEnemy: true, info: { defId: THROW } });   // not a 重生造物
    views.set(98, { id: 98, alive: false, isEnemy: true, info: { defId: DZOMS } });  // a dead one
    F.countForStatus(views);
    return [...F.wantedStatusFx(lord, new Map(), own).keys()].sort();
  };
  assert.deepEqual(at(2), [], 'two: none');
  assert.deepEqual(at(3), ['b/enemy_dklord_buff_01']);
  assert.deepEqual(at(4), ['b/enemy_dklord_buff_01']);
  assert.deepEqual(at(5), ['b/enemy_dklord_buff_01', 'b/enemy_dklord_buff_02']);
  assert.deepEqual(at(8), ['b/enemy_dklord_buff_01', 'b/enemy_dklord_buff_02'], 'the stack count is not capped');
});

test('a 重生造物 summoned on a knock-out: its own birth effect on it, no stand-in puff at the summoner', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const h = field([DPVT, DZOMS], [{ chessId: 't_wall', row: 12, col: 2, uid: 1 }]);
    const e = put(h, DPVT, [10, 6]);
    h.step();
    h.events.length = 0;
    h.b.kill(e, h.allies()[0]);
    h.run(1.5);
    const evs = h.events;
    const summon = evs.find((x) => x[0] === 'fx' && x[1] === 'summon' && x[4]?.key === DZOMS);
    const spawn = evs.find((x) => x[0] === 'spawn' && x[1]?.side === 'enemy');
    assert.ok(summon && spawn, 'the sim summons it');
    const child = h.b.enemies.find((x) => x.defId === DZOMS);
    const { L, seen } = await layer();
    const views = new Map([[e.id, { ...viewOf(e), alive: false }], [child.id, viewOf(child)]]);
    L.onEvent(['tick'], views);
    seen.length = 0;
    L.onEvent(spawn, views);
    L.onEvent(summon, views);
    assert.equal(L.ownsFx(summon), true, 'no stand-in puff');
    L.update(1 / 60, { dist: 20 }, { width: 100, height: 100 });
    assert.deepEqual(seen.filter((p) => p.kind === 'spawn').map((p) => p.names[0]), ['enemy_dzoms_born_01']);
    const plain = ['fx', 'summon', 0, 0, { id: e.id, key: 'enemy_none', n: 1 }];
    L.onEvent(plain, views);
    assert.equal(L.ownsFx(plain), false, 'a summoned enemy with no birth effect: the stand-in');
  } finally { globalThis.fetch = fetch0; }
});

test('the extracted binding: projectile_enemy_dthrow\'s `_effectsWhenStop` reaches the render table (`stop`) and is extracted', { skip: !existsSync(MODES) && 'no extracted enemy effects' }, () => {
  const m = JSON.parse(readFileSync(MODES, 'utf8'));
  for (const k of [THROW, `${THROW}_2`]) {
    const pr = m[k].modes[0].ranged.proj;
    assert.deepEqual([pr.reached, pr.stop, pr.hit], [['enemy_dthrow_attack_fire_ground'], ['enemy_dthrow_attack_fire_explode'], ['enemy_dthrow_attack_hit']], k);
  }
  assert.ok(m.$fx.enemy_dthrow_attack_fire_explode, 'extracted');
  const stops = Object.entries(m).filter(([k, v]) => k !== '$fx' && JSON.stringify(v).includes('"stop"')).map(([k]) => k);
  assert.deepEqual(stops.sort(), [THROW, `${THROW}_2`], 'the only projectile with a stop effect so far');
});

test('变异沙地兽 splitting where it fell: its talent buff\'s effect there once per child, its projectile\'s trail to each, each child\'s born_effect — no stand-in puff', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const h = field([BEAST, PLASM], [{ chessId: 't_wall', row: 12, col: 2, uid: 1 }]);
    const e = put(h, BEAST, [10, 6]);
    h.step();
    h.events.length = 0;
    h.b.kill(e, h.allies()[0]);
    h.run(1);
    const evs = h.events;
    const summon = evs.find((x) => x[0] === 'fx' && x[1] === 'summon' && x[4]?.key === PLASM);
    const spawns = evs.filter((x) => x[0] === 'spawn' && x[1]?.side === 'enemy');
    assert.ok(summon && spawns.length === 2, 'the sim splits it into two 腐化的原生质');
    const kids = h.b.enemies.filter((x) => x.defId === PLASM);
    const { L, seen } = await layer();
    const views = new Map([[e.id, { ...viewOf(e), alive: false }], ...kids.map((k) => [k.id, viewOf(k)])]);
    L.onEvent(['tick'], views);
    seen.length = 0;
    for (const sp of spawns) L.onEvent(sp, views);
    L.onEvent(summon, views);
    assert.equal(L.ownsFx(summon), true, 'no stand-in puff');
    const now = seen.splice(0).filter((p) => p.kind === 'spawn').map((p) => `${p.names[0]}${p.tag === 'splitTrail' ? '>' + p.on : ''}`);
    assert.deepEqual(now.sort(), ['enemy_sbeast_skill_start', 'enemy_sbeast_skill_start', ...kids.map((k) => `enemy_sbeast_skill_trail>${k.id}`)].sort());
    L.update(1 / 60, { dist: 20 }, { width: 100, height: 100 });
    assert.deepEqual(seen.filter((p) => p.kind === 'spawn').map((p) => p.names[0]), ['plasm_birth_01_start', 'plasm_birth_01_start'], 'each child\'s born_effect');
  } finally { globalThis.fetch = fetch0; }
});

test('the extracted binding: the split beasts\' `summon` and their children\'s `born`', { skip: !existsSync(MODES) && 'no extracted enemy effects' }, () => {
  const m = JSON.parse(readFileSync(MODES, 'utf8'));
  assert.deepEqual(m[BEAST].skills.deathrattle.summon, ['enemy_sbeast_skill_start']);
  assert.equal(m[BEAST].skills.deathrattle.proj.key, 'projectile_enemy_sbeast');
  assert.deepEqual(m.enemy_1133_harchn.skills.deathrattle.summon, ['enemy_harchn_skill_start']);
  assert.deepEqual([m[PLASM].born, m.enemy_1138_tumor.born], [['plasm_birth_01_start'], ['tumor_birth_01_start']]);
  for (const n of ['enemy_sbeast_skill_start', 'enemy_sarchn_skill_start', 'enemy_harchn_skill_start', 'plasm_birth_01_start', 'tumor_birth_01_start']) assert.ok(m.$fx[n], n);
});

// the status events of the real kits through the app's path (render/app.js: UnitView.onStatus with statusSource) into the layer
const statusView = (u, evs, views) => {
  const v = { ...viewOf(u), flags: 0, statuses: new Set(), statusFrom: new Map() };
  for (const e of evs) if (e[0] === 'status' && e[1] === u.id) {
    if (e[3]) { v.statuses.add(e[2]); const f = F.statusSource(views, e); if (f) v.statusFrom.set(e[2], f); } else { v.statuses.delete(e[2]); v.statusFrom.delete(e[2]); }
  }
  return v;
};
const KNIGHT = 'enemy_1103_wdkght_2', APPRENTICE = 'enemy_1104_lfkght', BREEDER = 'enemy_1437_dsfull';
const kmodes = {
  [KNIGHT]: { modes: [{ name: 'Default', anim: ['Attack'] }], buffFx: { 'wdkght_t[enhance]': ['enemy_wdkght_skill_01_buff'] } },
  [APPRENTICE]: { modes: [{ name: 'Mode', anim: ['Attack'] }], buffFx: { 'lfkght_s[weaken]': ['wind_buff_01'] } },
};
const kbuff = (v, kind, tag) => {
  const b = kmodes[v?.info?.defId];
  const on = kind === 'key' && b ? tag.split('|').flatMap((t) => (b.buffFx[t] || []).map((n) => ['b', n, 0.5])) : [];
  return on.length ? { on, ends: new Map(), once: new Set() } : null;
};

test('骑士团: 沸血骑士团精锐\'s stacks are wdkght_t[enhance] on it, 锋盔骑士团学徒\'s cut is lfkght_s[weaken] on the operator (its source the 学徒)', () => {
  const h = field([KNIGHT, APPRENTICE, DPVT], [{ chessId: 't_wall', row: 12, col: 2, uid: 1 }]);
  const k = put(h, KNIGHT, [3, 14]), a = put(h, APPRENTICE, [12, 3.5]), d = put(h, DPVT, [5, 14]);
  h.step();
  h.b.kill(d, h.allies()[0]);
  const wall = h.allies()[0];
  h.runUntil(() => !!wall.findBuff('ab:lfkghtWeaken'), 40);   // AtkDesWeaken: initCooldown 25 s
  const views = new Map([[k.id, viewOf(k)], [a.id, viewOf(a)], [wall.id, viewOf(wall)]]);
  const kv = statusView(k, h.events, views), wv = statusView(wall, h.events, views);
  assert.ok(kv.statuses.has('ab:wdkght'), 'a stack on the 精锐');
  assert.deepEqual([...F.wantedStatusFx(kv, new Map(), kbuff, null, null, (id) => views.get(id)).keys()], ['b/enemy_wdkght_skill_01_buff']);
  assert.ok(wv.statuses.has('ab:lfkghtWeaken'), 'the 学徒 cut the operator');
  assert.deepEqual([...F.wantedStatusFx(wv, new Map(), kbuff, null, null, (id) => views.get(id)).keys()], ['b/wind_buff_01'], 'drawn on the operator from the 学徒\'s binding');
});

test('蕴核饲育者\'s child: dsfull_tr_1[speed_up]\'s enemy_dsfull_buff_03 on it', () => {
  const kids = Object.values(ACT3.enemies[BREEDER].talents.bbStr || {}).filter((x) => typeof x === 'string' && x.startsWith('enemy_'));
  const h = field([BREEDER, ...kids], [{ chessId: 't_wall', row: 12, col: 2, uid: 1 }]);
  const e = put(h, BREEDER, [10, 6]);
  h.step();
  h.b.kill(e, h.allies()[0]);
  h.run(0.5);
  const kid = h.b.enemies.find((x) => x !== e && x.alive);
  assert.ok(kid, 'a sea monster where it fell');
  const views = new Map([[kid.id, viewOf(kid)]]);
  const v = statusView(kid, h.events, views);
  assert.deepEqual([...F.wantedStatusFx(v, new Map(), () => null).keys()], ['pfx_enemy_3/enemy_dsfull_buff_03']);
});
