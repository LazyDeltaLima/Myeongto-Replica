// test/render/act3-escort-fx.test.js — 规程's special entries and the new escorts of the old entries drawn by their official
// effects (2026-11-12, docs/rules/fx.md 「규정 특수 적 항목·호위」): 假想敌：影役's aura range on it from its birth (Talents/Aura/Aura
// `_effects`), 镜眼's and 萨卡兹本卫领袖's slows on the operator they slow (the buff's effect in the applier's binding — the
// sim names the applier), 镜波's dying shot, 野性三角兽's charge on it and its crash on the unit it runs into, 神勇的帕拉杜利斯's
// Run mode (its clips, the mode aura, no stand-in for the switch) and its collision on the unit it meets. The sim's events
// come from the real 规程 kits; the render runs on a sample binding (the extracted one is compared at the end).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { wantedStatusFx, statusSource } from '../../public/js/render/fxstatus.js';
import { FORMS } from '../../public/js/render/units.js';
import { fxSpec } from '../../public/js/render/fx/kinds.js';
import { getData } from '../../server/data.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const MODES = new URL('../../public/assets/local/fx/enemy-modes.json', import.meta.url);
const quiet = { warn() {}, error() {}, info() {} };
const ACT3 = getData({ log: quiet, season: 'act3autochess' });
const ACBLK = 'enemy_9034_acblk', ACREFM = 'enemy_9039_acrefm', ACREFD = 'enemy_9031_acrefd', SLIME = 'enemy_1067_snslime';
const SPNSHD = 'enemy_1363_spnshd_2', MHBOAR = 'enemy_1309_mhboar_2', MNCTUR = 'enemy_10163_mnctur_2';
const still = (id, o = {}) => chessRec({ id, profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, res: 0, blockCnt: 3, ...o }, rangeGrid: [[0, 0]], skill: null });
const CHESS = {
  t_wall: still('t_wall'), t_low: still('t_low', { blockCnt: 1 }),
  t_mage: chessRec({ id: 't_mage', profession: 'CASTER', dmgType: 'magic', stats: { atk: 50, maxHp: 1e7, def: 0, res: 0, blockCnt: 0 }, rangeGrid: [[0, 0], [0, 1], [0, 2], [1, 0], [-1, 0], [0, -1]], skill: null }),
  t_atk: chessRec({ id: 't_atk', profession: 'WARRIOR', stats: { atk: 300, maxHp: 1e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0], [0, 1]], skill: null }),
};
const mute = () => ({ trait: { noAttack: true } });

function field(keys, units) {
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600, kind: 'normal', sharedBoss: null, enemies: [],
    defs: { chess: CHESS, enemies: Object.fromEntries(keys.map((k) => [k, ACT3.enemies[k]])) }, kits: { t_wall: mute, t_low: mute }, units,
  });
  h.step();
  return h;
}
const put = (h, key, pos, speedMul = 0) => h.spawn(key, { pos, routeIndex: 0, mods: { speedMul }, tag: null });
const at = (id, row, col, uid = 1) => ({ chessId: id, row, col, uid });

// the parts of the extracted binding these cases read (enemy-modes.json, enemy_bindings.py)
const emodes = () => ({
  [ACBLK]: { modes: [{ name: 'Default', anim: ['Attack'] }], aura: ['enemy_acblk_buff'] },
  [ACREFM]: { modes: [{ name: 'Default', anim: ['Attack'] }], buffFx: { 'acrefm[atk-spd-down]': ['enemy_acrefm_buff'] } },
  [SPNSHD]: { modes: [{ name: 'Default', anim: ['Attack'] }], buffFx: { 'enemy_spnshd_atkspeed[d]': ['enemy_spnshd_debuff'] } },
  [MHBOAR]: { modes: [{ name: 'Default', anim: ['Attack'] }], buffFx: { mhboar_crash: ['enemy_mhboar_hit_02'], 'mhboar_t[core]': ['enemy_mhboar_buff'] } },
  [MNCTUR]: { modes: [{ name: 'Default', anim: ['Attack'] }, { name: 'Run', anim: [], aura: ['enemy_mnctur_move_1'] }, { name: 'Stun', anim: [] }],
    buffFx: { enemy_mnctur_collide_char: ['enemy_mnctur_rush_hit'] }, buffOnce: ['enemy_mnctur_collide_char'] },
  [ACREFD]: { modes: [{ name: 'Default', anim: ['Attack'] }],
    skills: { refracting: { cast: [], opt: {}, hit: [], proj: { key: 'projectile_enemy_acrefd', mount: 2, trail: ['enemy_acrefd_die_trail'],
      hit: ['enemy_acrefd_die_trail_hit', 'enemy_acrefd_die_trail_buff'], start: ['enemy_acrefd_die_trail_start'], move: 'OTHER', speed: 4.0, raise: 1.0 } } } },
});
const NAMES = [...new Set(JSON.stringify(emodes()).match(/"enemy_[a-z][A-Za-z0-9_]+"/g).map((s) => JSON.parse(s)).filter((n) => !n.includes('[') && !/collide_char$/.test(n)))];

async function layer() {
  const m = emodes();
  m.$fx = Object.fromEntries(NAMES.map((n) => [n.toLowerCase(), ['b', n]]));
  const files = { '/assets/local/fx/index.json': { bundles: { b: NAMES } }, '/assets/local/fx/enemy-modes.json': m };
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  const seen = [];
  const L = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, enemyDef: (id) => ACT3.enemies[id] || null, trace: (p) => seen.push(p) });
  await new Promise((r) => setTimeout(r, 10));
  return { L, seen };
}
const viewOf = (u) => ({ id: u.id, x: u.x, y: u.y, alive: true, isEnemy: u.side === 'enemy', form: null, flags: 0, statuses: new Set(), statusFrom: new Map(),
  info: { id: u.id, side: u.side === 'enemy' ? 'enemy' : 'ally', defId: u.defId ?? 'char_x', form: null } });
const tick = (L) => L.update(0.05, { dist: 20 }, { width: 100, height: 100 });
/** Feed the layer the field's events (each followed by a frame), keeping each view's statuses and form as the client does. */
function feed(L, h, views, from = 0) {
  for (const e of h.events.slice(from)) {
    if (e[0] === 'spawn' && e[1] && !views.has(e[1].id)) views.set(e[1].id, viewOf(e[1]));
    L.onEvent(e, views);
    const v = e[0] === 'status' ? views.get(e[1]) : e[0] === 'fx' && e[4] && 'form' in e[4] ? views.get(e[4].id) : null;
    if (v && e[0] === 'status') { if (e[3]) { v.statuses.add(e[2]); v.statusFrom.set(e[2], statusSource(views, e) || {}); } else { v.statuses.delete(e[2]); v.statusFrom.delete(e[2]); } }
    if (v && e[0] === 'fx') v.form = e[4].form;
    tick(L);
  }
  for (let i = 0; i < 40; i++) tick(L);
  return h.events.length;
}
const want = (L, v, views) => [...wantedStatusFx(v, new Map(), L.enemyBuffFx, null, null, (id) => views.get(id)).keys()];
const spawned = (seen, kind = 'spawn') => seen.filter((p) => p.kind === kind).map((p) => `${p.names[0]}${p.on != null ? '>' + p.on : p.by != null && kind !== 'spawn' ? '>' + p.by : ''}`);
const views0 = (h, ens) => new Map([...h.allies().map((u) => [u.id, viewOf(u)]), ...ens.map((e) => [e.id, viewOf(e)])]);

test('假想敌：影役: its aura range enemy_acblk_buff on it from its birth (an AuraAbility\'s `_effects` in a talent folder)', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const h = field([ACBLK], [at('t_wall', 10, 7)]);
    const e = put(h, ACBLK, [10, 6]);
    h.run(1);
    const { L, seen } = await layer();
    feed(L, h, views0(h, [e]));
    assert.deepEqual(spawned(seen).filter((s) => s.startsWith('enemy_acblk_buff')), [`enemy_acblk_buff>${e.id}`]);
  } finally { globalThis.fetch = fetch0; }
});

test('镜眼\'s and 萨卡兹本卫领袖\'s slows: the buff\'s effect on the operator they slow, found through the applier the sim names', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const cases = [[ACREFM, 't_mage', 'enemy_acrefm_buff', 'ab:acrefmSlow'], [SPNSHD, 't_atk', 'enemy_spnshd_debuff', 'ab:spnshdSlow']];
    for (const [key, op, fx, status] of cases) {
      const h = field([key], [at(op, 10, 6)]);
      const e = put(h, key, [10, 7]);
      h.run(4);
      const ev = h.events.find((x) => x[0] === 'status' && x[2] === status && x[3]);
      assert.ok(ev && ev[4] === e.id, `${key}: the sim names the applier`);
      const { L } = await layer();
      const views = views0(h, [e]);
      feed(L, h, views);
      assert.deepEqual(want(L, views.get(ev[1]), views), [`b/${fx}`], key);
    }
  } finally { globalThis.fetch = fetch0; }
});

test('野性三角兽: its charge mhboar_t[core] on it, its crash enemy_mhboar_hit_02 once on the unit it runs into', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const h = field([MHBOAR], [at('t_low', 10, 5)]);
    const e = put(h, MHBOAR, [10, 9], 1);
    h.run(10);
    const crash = h.events.filter((x) => x[0] === 'dmg' && Array.isArray(x[8]) && x[8].some((m) => m[0] === 'buff:mhboar_crash'));
    assert.equal(crash.length, 1, 'the sim names the crash on its hit');
    const { L, seen } = await layer();
    const views = views0(h, [e]);
    feed(L, h, views);
    assert.deepEqual(spawned(seen, 'statusEnd'), [`enemy_mhboar_hit_02>${crash[0][1]}`]);
    assert.deepEqual(want(L, views.get(e.id), views), ['b/enemy_mhboar_buff']);
  } finally { globalThis.fetch = fetch0; }
});

test('神勇的帕拉杜利斯: Run is the prefab mode (Skill for Idle / Move, its aura on), no stand-in for the switch either way; its collision on the unit it meets', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const h = field([MNCTUR], [at('t_wall', 10, 4)]);
    const e = put(h, MNCTUR, [10, 9], 1);
    h.runUntil(() => h.eventsOf('fx').some((x) => x[1] === 'phase' && x[4].form === 'Run'), 20);
    const { L, seen } = await layer();
    const views = views0(h, [e]);
    const n = feed(L, h, views);
    const run = h.events.find((x) => x[0] === 'fx' && x[1] === 'phase' && x[4].form === 'Run');
    assert.equal(L.ownsFx(run), true, 'the SwitchMode into Run: nothing drawn');
    assert.deepEqual(want(L, views.get(e.id), views), ['b/enemy_mnctur_move_1'], `the Run mode's aura`);
    h.runUntil(() => h.eventsOf('fx').some((x) => x[1] === 'phase' && x[4].form === null), 20);
    feed(L, h, views, n);
    const back = h.events.find((x) => x[0] === 'fx' && x[1] === 'phase' && x[4].form === null);
    assert.equal(L.ownsFx(back), true, 'and back to Default');
    assert.deepEqual(want(L, views.get(e.id), views), [], 'the aura off');
    const hit = h.events.find((x) => x[0] === 'dmg' && Array.isArray(x[8]) && x[8].some((m) => m[0] === 'buff:enemy_mnctur_collide_char'));
    assert.ok(hit, 'the sim names the collision on its hit');
    assert.deepEqual(spawned(seen, 'statusEnd'), [`enemy_mnctur_rush_hit>${hit[1]}`]);
    const r = FORMS[MNCTUR].Run;
    assert.deepEqual([r.change, r.roles.idle, r.roles.move.loop], [null, 'Skill', 'Skill']);
    assert.equal(fxSpec('phase', { kind: 'Run' }).a, 'none');
  } finally { globalThis.fetch = fetch0; }
});

test('镜波: its dying shot — the start on it, the trail\'s hit and buff effects on the enemy it lands on', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const h = field([ACREFD, SLIME], [at('t_atk', 10, 6)]);
    const e = put(h, ACREFD, [10, 7]), s = put(h, SLIME, [10, 8]);
    h.run(1);
    h.b.kill(e, h.allies()[0]);
    h.run(3);
    assert.ok(h.events.some((x) => x[0] === 'fx' && x[1] === 'enemyShot'), 'the sim throws it');
    const { L, seen } = await layer();
    feed(L, h, views0(h, [e, s]));
    const sp = spawned(seen);
    assert.ok(sp.includes(`enemy_acrefd_die_trail_start>${e.id}`), sp.join(' '));
    assert.ok(sp.includes(`enemy_acrefd_die_trail_hit>${s.id}`) && sp.includes(`enemy_acrefd_die_trail_buff>${s.id}`), sp.join(' '));
  } finally { globalThis.fetch = fetch0; }
});

test('the extracted binding: the parts these cases read', { skip: !existsSync(MODES) && 'no extracted enemy effects' }, () => {
  const m = JSON.parse(readFileSync(MODES, 'utf8')), w = emodes();
  assert.deepEqual(m[ACBLK].aura, w[ACBLK].aura);
  assert.equal(m[ACBLK].auraNested, undefined, 'held from its birth, not by a status');
  for (const k of [ACREFM, SPNSHD, MHBOAR]) for (const [b, fx] of Object.entries(w[k].buffFx)) assert.deepEqual(m[k].buffFx[b], fx, `${k} ${b}`);
  assert.deepEqual(m[MNCTUR].modes.map((x) => [x.name, x.aura ?? null]), w[MNCTUR].modes.map((x) => [x.name, x.aura ?? null]));
  assert.deepEqual(m[MNCTUR].buffFx.enemy_mnctur_collide_char, ['enemy_mnctur_rush_hit']);
  assert.deepEqual(m[ACREFD].skills.refracting.proj, w[ACREFD].skills.refracting.proj);
  for (const n of NAMES) assert.ok(m.$fx[n.toLowerCase()], `${n} extracted`);
});
