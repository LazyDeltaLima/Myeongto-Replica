// test/render/wintun-ymgtop-fx.test.js — 咸鳞汁推荐者's barrel smash and 水遁忍者's spin with their official effects and sounds
// (2026-11-26, docs/rules/render.md 「적 프리팹 모드의 클립 — 액젓 추천자·수둔 닌자」 「스킬의 이펙트·소리」, 공식 클라에서 확인).
// 咸鳞汁推荐者: the swing on BlockedBoom's clip is that skill's cast — fx 'enemySkill' BlockedBoom `swing` (its cast effect
// enemy_wintun_attack_1_start, START e_atk_bales_n), its strike none of the Combat's (no enemy_wintun_attack_2_hit, no attack
// impact sound), the damage on the blocker the moment 'buff:wintun_m1_s1[real_damage]' (enemy_wintun_attack_1_hit), the zone
// its projectile's reach effect enemy_wintun_range (and REACH e_imp_berxplvbrl). 水遁忍者: fx 'enemySkill' SwitchModeTrigger as
// the spin starts (its looping START e_atk_spngtptrnd, held until 'enemySkillEnd'), its spin effect
// ymgtop_m1_t[rotate_effect_core] from 0.5 s (a status by that key), each unit hit the moment
// 'buff:ymgtop_m1_t[rotate_attack]' (enemy_ymgtop_attack_hit_01). Real battles (the kits); the render on the extracted
// bindings, the audio on data/assets.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { AudioManager } from '../../public/js/audio.js';
import { wantedStatusFx, statusSource } from '../../public/js/render/fxstatus.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const MODES = new URL('../../public/assets/local/fx/enemy-modes.json', import.meta.url);
const NO_FX = !existsSync(MODES) && 'no extracted enemy effects';
const WINTUN = 'enemy_10044_wintun', YMGTOP = 'enemy_10116_ymgtop', SLIME = 'enemy_1007_slime';
const WALL = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
function arena(wall) {
  return makeBattle({ content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    defs: { chess: { t_wall: WALL } }, kits: { t_wall: () => ({ trait: { noAttack: true } }) }, units: [{ chessId: 't_wall', row: wall[0], col: wall[1] }] });
}
const fxOf = (h, kind, id) => h.events.filter((x) => x[0] === 'fx' && x[1] === kind && x[4]?.id === id);

/** 咸鳞汁推荐者 blocked by a wall: its smash and two bare-handed attacks. */
function smash() {
  const h = arena([9, 5]);
  h.step();
  const e = h.spawn(WINTUN, { pos: [9, 5], routeIndex: 0, mods: { speedMul: 0 } });
  const from = h.events.length;
  for (let i = 0; i < 150; i++) h.step();
  return { h, e, w: h.b.allyUnits[0], ev: h.events.slice(from) };
}
/** 咸鳞汁推荐者 blocked by a wall with a 源石虫 beside it (in its barrel zone), 3 s past the smash. */
function zone() {
  const h = arena([9, 5]);
  h.step();
  const e = h.spawn(WINTUN, { pos: [9, 5], routeIndex: 0, mods: { speedMul: 0 } });
  const o = h.spawn(SLIME, { pos: [9, 6], routeIndex: 0, mods: { speedMul: 0 } });
  const from = h.events.length;
  for (let i = 0; i < 120; i++) h.step();
  return { h, e, o, ev: h.events.slice(from) };
}
/** 水遁忍者 beside a wall: its spin (10 s in) cut by a 失衡 3 s later. */
function spin() {
  const h = arena([10, 6]);
  h.step();
  const e = h.spawn(YMGTOP, { pos: [10, 7], routeIndex: 0, mods: { speedMul: 0 } });
  const from = h.events.length;
  /** @type {[number, boolean][]} */
  const fx = [];
  const run = (n) => { for (let i = 0; i < n; i++) { h.step(); const on = !!e.findBuff('ab:spinFx'); if (on !== (fx.at(-1)?.[1] ?? false)) fx.push([h.b.time, on]); } };
  run(13 * 30);
  h.b.displace(e, { x: 1, y: 0 }, 0.2, { force: 3 });
  run(30);
  return { h, e, w: h.b.allyUnits[0], ev: h.events.slice(from), fx };
}

test('咸鳞汁推荐者 (sim): BlockedBoom named as its smash swing starts, the smash\'s moment on its blocker, the zone by its ability', () => {
  const { e, w, ev } = smash();
  const swings = ev.filter((x) => x[0] === 'swing' && x[1] === e.id);
  const casts = ev.filter((x) => x[0] === 'fx' && x[1] === 'enemySkill' && x[4]?.id === e.id);
  assert.ok(swings.length >= 3, `three swings (${swings.length})`);
  assert.equal(casts.length, 1, 'one cast: the smash, no later swing');
  assert.deepEqual([casts[0][4].ability, casts[0][4].swing, casts[0][4].tgt], ['BlockedBoom', 1, w.id]);
  assert.equal(ev.indexOf(casts[0]) - ev.indexOf(swings[0]), 1, 'with the first swing');
  const dmg = ev.filter((x) => x[0] === 'dmg' && x[1] === w.id && x[5] === e.id);
  assert.deepEqual(dmg[0][8], [['buff:wintun_m1_s1[real_damage]', e.id]], 'the smash\'s damage: its moment');
  assert.ok(dmg.slice(1).every((x) => x[8] == null), 'the bare-handed ones: none');
  const zone = ev.find((x) => x[0] === 'fx' && x[1] === 'zone' && x[4]?.kind === 'barrel');
  assert.deepEqual([zone[4].id, zone[4].ability], [e.id, 'BlockedBoom']);
});

test('水遁忍者 (sim): SwitchModeTrigger named as it spins and ended as it stops; the spin effect from 0.5 s; its hits\' moment', () => {
  const { h, e, w, ev, fx } = spin();
  const cast = fxOf({ events: ev }, 'enemySkill', e.id), end = fxOf({ events: ev }, 'enemySkillEnd', e.id);
  assert.deepEqual(cast.map((x) => x[4].ability), ['SwitchModeTrigger']);
  assert.deepEqual(end.map((x) => x[4].ability), ['SwitchModeTrigger'], 'its end with the 失衡');
  assert.equal(fx.length, 2, `on then off (${JSON.stringify(fx)})`);
  const start = 10 + h.b.dt;   // its initCooldown 10 (the cast the step after)
  assert.ok(Math.abs(fx[0][0] - start - 0.5) <= 2 * h.b.dt + 1e-9, `on 0.5 s into the spin (${fx[0][0]})`);
  assert.equal(e.findBuff('ab:spinFx'), null, 'off once it stopped');
  const hits = ev.filter((x) => x[0] === 'dmg' && x[1] === w.id && x[5] === e.id);
  assert.ok(hits.length >= 2, `its spin hits the wall (${hits.length})`);
  assert.ok(hits.every((x) => x[8]?.[0]?.[0] === 'buff:ymgtop_m1_t[rotate_attack]'), 'each with its moment');
});

/** A dry effect layer on the extracted bindings of both (one table for the module: its index is fetched once). */
async function layer(ids = [WINTUN, YMGTOP, SLIME]) {
  const M = JSON.parse(readFileSync(MODES, 'utf8'));
  const m = { $fx: {} }, bundles = {};
  for (const id of ids) {
    m[id] = M[id];
    const s = JSON.stringify(M[id]).toLowerCase();
    for (const [n, r] of Object.entries(M.$fx)) if (s.includes(`"${n}"`)) { m.$fx[n] = r; (bundles[r[0]] ||= []).push(r[1]); }
  }
  const files = { '/assets/local/fx/index.json': { bundles }, '/assets/local/fx/enemy-modes.json': m };
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  const seen = [];
  const L = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p) });
  await new Promise((r) => setTimeout(r, 10));
  return { L, seen };
}
const viewOf = (u) => ({ id: u.id, x: u.x, y: u.y, alive: true, isEnemy: u.side === 'enemy', form: null, flags: 0, statuses: new Set(),
  info: { id: u.id, side: u.side, defId: u.defId, form: null } });
/** Each event of `ev` to the layer (a form switch moves the view's form, as render/units.js does): what it spawned per event. */
function feed(L, seen, ev, views) {
  L.onEvent(['tick'], views);
  return ev.map((x) => {
    if (x[0] === 'fx' && x[4] && typeof x[4] === 'object' && 'form' in x[4] && views.get(x[4].id)) views.get(x[4].id).form = x[4].form;
    seen.length = 0;
    L.onEvent(x, views);
    return { x, names: seen.filter((p) => Array.isArray(p.names)).flatMap((p) => p.names) };
  });
}

test('咸鳞汁推荐者 (render): the cast effect at its cast, enemy_wintun_attack_1_hit on the blocker, no Combat hit at the smash, the zone', { skip: NO_FX }, async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { e, w, ev } = smash();
    const { L, seen } = await layer();
    const out = feed(L, seen, ev, new Map([[e.id, viewOf(e)], [w.id, viewOf(w)]]));
    const at = (pred) => out.filter((o) => pred(o.x)).map((o) => o.names);
    assert.deepEqual(at((x) => x[1] === 'enemySkill'), [['enemy_wintun_attack_1_start']], 'its cast effect on it');
    const hits = at((x) => x[0] === 'dmg' && x[1] === w.id);
    assert.deepEqual(hits[0], ['enemy_wintun_attack_1_hit'], 'the smash: its own hit on the blocker, not the Combat\'s');
    assert.deepEqual(hits[1], ['enemy_wintun_attack_2_hit'], 'the next swing: the Combat\'s hit');
    assert.ok(hits.slice(1).every((n) => !n.includes('enemy_wintun_attack_1_hit')), 'the smash\'s hit once');
    const zone = out.find((o) => o.x[1] === 'zone');
    assert.deepEqual(zone.names, ['enemy_wintun_range'], 'its projectile\'s reach effect as the zone');
    assert.equal(L.ownsFx(zone.x), true, 'no stand-in ring');
  } finally { globalThis.fetch = fetch0; }
});

test('水遁忍者 (render): enemy_ymgtop_attack_hit_01 on each unit its spin hits; its spin effect bound by the status\'s key', { skip: NO_FX }, async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { e, w, ev } = spin();
    const { L, seen } = await layer();
    const views = new Map([[e.id, viewOf(e)], [w.id, viewOf(w)]]);
    const out = feed(L, seen, ev, views);
    const hits = out.filter((o) => o.x[0] === 'dmg' && o.x[1] === w.id && Array.isArray(o.x[8]));
    assert.ok(hits.length >= 2 && hits.every((o) => o.names.includes('enemy_ymgtop_attack_hit_01')), `on the wall (${JSON.stringify(hits.map((o) => o.names))})`);
    const r = L.enemyBuffFx(views.get(e.id), 'key', 'ymgtop_m1_t[rotate_effect_core]');
    assert.deepEqual(r?.on.map((s) => s[1]), ['enemy_ymgtop_skill_01_buff_01'], 'the status ab:spinFx (fxTag) draws it');
  } finally { globalThis.fetch = fetch0; }
});

test('咸鳞汁推荐者 (sim): its barrel zone\'s buff on the ground enemies in it names wintun_t[attack_speed], from it', () => {
  const { e, o, ev } = zone();
  const on = ev.filter((x) => x[0] === 'status' && x[2] === 'ab:barrelZone' && x[3]);
  assert.deepEqual(on.map((x) => [x[1], x[4], x[5]?.fx]).sort(), [[e.id, e.id, 'buff:wintun_t[attack_speed]'], [o.id, e.id, 'buff:wintun_t[attack_speed]']].sort(),
    'once on each (refreshed while inside, no new event)');
  assert.ok(!ev.some((x) => x[0] === 'status' && x[2] === 'ab:barrelZone' && !x[3]), 'held while inside');
  assert.ok(o.findBuff('ab:barrelZone'), 'the zone\'s buff (attack speed, physical dodge) on the 源石虫');
});

test('咸鳞汁推荐者 (render): enemy_wintun_range_buff on the enemies in its zone — by its binding, also once its view has left', { skip: NO_FX }, async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { e, o, ev } = zone();
    const { L } = await layer();
    const vs = new Map([[e.id, viewOf(e)], [o.id, viewOf(o)]]);
    for (const v of vs.values()) v.statusFrom = new Map();
    for (const x of ev) {
      const v = x[0] === 'status' ? vs.get(x[1]) : null;
      if (v) { if (x[3]) { v.statuses.add(x[2]); v.statusFrom.set(x[2], statusSource(vs, x) || {}); } else { v.statuses.delete(x[2]); v.statusFrom.delete(x[2]); } }
    }
    const want = (u) => [...wantedStatusFx(vs.get(u.id), new Map(), L.enemyBuffFx, null, null, (id) => vs.get(id)).keys()].filter((k) => k.includes('wintun'));
    const FX = 'pfx_enemy_14/enemy_wintun_range_buff';
    const on0 = (list, id) => list.find((x) => x[0] === 'status' && x[1] === id && x[2] === 'ab:barrelZone' && x[3]);
    assert.deepEqual(want(o), [FX], 'on the 源石虫: the applier\'s binding (its own has no such buff)');
    assert.ok(want(e).includes(FX), 'on 咸鳞汁推荐者 itself');
    vs.delete(e.id);
    assert.deepEqual(want(o), [FX], 'its view gone (dead, the zone stays): found by the defId the status kept');
    const late = on0(ev, o.id);
    vs.get(o.id).statusFrom.set('ab:barrelZone', statusSource(vs, late) || {});
    assert.deepEqual(want(o), [FX], 'a unit walking in after its view left: the defId last seen for its id');
    vs.get(o.id).statusFrom.set('ab:barrelZone', { fx: 'buff:wintun_t[attack_speed]', n: 0 });
    assert.deepEqual(want(o), [], 'no applier: none (the key is not the 源石虫\'s)');
  } finally { globalThis.fetch = fetch0; }
});

const file = (u) => String(u).split('/').pop();
function manager() {
  const m = JSON.parse(readFileSync(new URL('../../data/assets.json', import.meta.url), 'utf8'));
  const a = new AudioManager({ win: null, getManifest: () => m, random: () => 0 });
  a.ctx = { currentTime: 0 };
  a.played = [];
  a._play = (url) => { a.played.push(file(url)); return () => {}; };
  a._buffer = async () => null;
  a.voice = () => false;
  return a;
}

test('咸鳞汁推荐者 (audio): START at the cast, its smash no attack sound but the REACH; the later attacks their own', () => {
  const { e, w, ev } = smash();
  const a = manager();
  a.setFieldUnits([{ id: e.id, kind: 'enemy', side: 'enemy', spine: WINTUN, defId: WINTUN }, { id: w.id, kind: 'op', side: 'ally', spine: 'char_x', defId: 't_wall' }]);
  const heard = ev.filter((x) => x[0] !== 'tick').map((x) => { a.played.length = 0; a.handleBattleEvents([x]); return [x, [...a.played]]; });
  const cast = heard.findIndex(([x]) => x[1] === 'enemySkill');
  assert.deepEqual(heard[cast][1], ['e_atk_bales_n.mp3'], 'BlockedBoom START');
  const dmg = heard.filter(([x]) => x[0] === 'dmg' && x[1] === w.id);
  assert.deepEqual(dmg[0][1], ['e_imp_berxplvbrl.mp3'], 'the smash: the zone projectile\'s REACH, no attack impact');
  const strike = heard.slice(cast).find(([x]) => x[0] === 'atk');
  assert.deepEqual(strike[1], [], 'its strike: no attack sound');
  assert.ok(dmg.slice(1).every(([, p]) => p.includes('e_imp_punch_n.mp3')), 'the bare-handed hits: the Combat\'s HIT');
});

test('水遁忍者 (audio): the spin\'s looping START held from its cast to its end', () => {
  const { e, ev } = spin();
  const a = manager();
  a.setFieldUnits([{ id: e.id, kind: 'enemy', side: 'enemy', spine: YMGTOP, defId: YMGTOP }]);
  const cast = ev.find((x) => x[1] === 'enemySkill'), end = ev.find((x) => x[1] === 'enemySkillEnd');
  a.handleBattleEvents([cast]);
  assert.ok(a._skillLoops?.has(`${e.id}:esk`), 'its loop on');
  assert.ok(!a.played.includes('e_atk_spngtptrnd.mp3'), 'not also once');
  a.handleBattleEvents([end]);
  assert.ok(!a._skillLoops.has(`${e.id}:esk`), 'stopped with the spin (ymgtop_rotate_finish: its ctrlStop)');
});

test('the extracted bindings: the moments\' buff keys and their effects, extracted', { skip: NO_FX }, () => {
  const m = JSON.parse(readFileSync(MODES, 'utf8'));
  assert.deepEqual(m[WINTUN].buffFx['wintun_m1_s1[real_damage]'], ['enemy_wintun_attack_1_hit']);
  assert.deepEqual(m[YMGTOP].buffFx['ymgtop_m1_t[rotate_attack]'], ['enemy_ymgtop_attack_hit_01']);
  for (const n of ['enemy_wintun_attack_1_hit', 'enemy_wintun_attack_1_start', 'enemy_wintun_range', 'enemy_ymgtop_attack_hit_01', 'enemy_ymgtop_skill_01_buff_01']) {
    assert.ok(m.$fx[n], `${n} extracted (tools/local-extract/enemy_bindings.py --extract --id …)`);
  }
});
