// test/render/act3-shell-fx.test.js — 规程's 赘生甲壳 family on screen (2026-11-12, docs/rules/fx.md 「규정 재생 무리」):
// 复核洋流使者 eats a shell in its own Skill clip (fx 'enemySkill' 1 → render/units.js ESKILL_CLIPS), then draws its mode 1
// (fx 'phase' form '1' → FORMS B_* clips, FORM_MODES its binding's mode 1) and dspred_tr_1[attribute]'s
// enemy_dspred_buff_01 (the status's `fxTag`); 元核孽生者 wakes into its mode 1 (Skill_* clips, dslntf_tr_1[aura_effect]'s
// enemy_dslntf_buff_03) and, breaking a shell, shows dslntf_s_1[block]'s enemy_dslntf_buff_02 on itself (fx 'kitHit'
// dslntf:break → fxgame.js EKIT_HIT_FX). The sim's events come from the real 规程 kits (server/sim/content/enemies/reborn.js
// kitShellEater, element.js kitNucleus); the effect layer runs on a sample binding (the extracted one is compared at the end).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { wantedStatusFx, statusSource } from '../../public/js/render/fxstatus.js';
import { getData } from '../../server/data.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const MODES = path.join(ROOT, 'public/assets/local/fx/enemy-modes.json');
const quiet = { warn() {}, error() {}, info() {} };
const ACT3 = getData({ log: quiet, season: 'act3autochess' });
const DSPRED = 'enemy_1438_dspred', DSLNTF = 'enemy_1439_dslntf', DSSHEL = 'enemy_1434_dsshel', SHELL = 'trap_156_dsshell';
const WALL = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });

let fake, UnitView, DeviceView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView, DeviceView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

/** A 赘生甲壳 at (10, 6) (a 微核沉积者 knocked out there) and enemy `key` coming at it from (10, 7.4). */
function shellAndWalker(key) {
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600, kind: 'normal', sharedBoss: null, enemies: [],
    defs: { chess: { t_wall: WALL }, enemies: { [DSSHEL]: ACT3.enemies[DSSHEL], [key]: ACT3.enemies[key] } },
    kits: { t_wall: () => ({ trait: { noAttack: true } }) }, units: [{ chessId: 't_wall', row: 12, col: 2, uid: 1 }],
  });
  h.step();
  const d = h.spawn(DSSHEL, { pos: [10, 6], routeIndex: 0, mods: { speedMul: 0 }, tag: null });
  h.step();
  h.b.kill(d, h.allies()[0]);
  const sh = h.b.allyUnits.find((u) => u.alive && u.defId === SHELL);
  const e = h.spawn(key, { pos: [10, 7.4], routeIndex: 0, mods: { speedMul: 1 }, tag: null });
  e.route.pts = null;
  return { h, sh, e };
}
const fxOf = (h, kind, id) => h.events.filter((x) => x[0] === 'fx' && x[1] === kind && x[4]?.id === id);

// the parts of the extracted binding these cases read (enemy-modes.json, enemy_bindings.py)
const emodes = () => ({
  [DSPRED]: { modes: [{ name: 'Default', anim: ['Attack'] }, { name: '1', anim: ['Attack'], aura: ['enemy_dspred_mode1_probe'] }],
    buffFx: { 'dspred_tr_1[attribute]': ['enemy_dspred_buff_01'] } },
  [DSLNTF]: { modes: [{ name: 'Default', anim: [] }, { name: '1', anim: ['Skill_Attack'] }],
    buffFx: { 'dslntf_s_1[block]': ['enemy_dslntf_buff_02'], 'dslntf_tr_1[aura_effect]': ['enemy_dslntf_buff_03'] } },
});
// (enemy_dspred_mode1_probe: a stand-in aura that shows which mode the layer picks — the real mode 1 has none)
const NAMES = ['enemy_dspred_buff_01', 'enemy_dslntf_buff_02', 'enemy_dslntf_buff_03', 'enemy_dspred_mode1_probe'];
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
function feed(L, h, views) {
  for (const e of h.events) {
    if (e[0] === 'spawn' && e[1] && !views.has(e[1].id)) views.set(e[1].id, viewOf(e[1]));
    L.onEvent(e, views);
    const v = e[0] === 'status' ? views.get(e[1]) : e[0] === 'fx' && e[4] && 'form' in e[4] ? views.get(e[4].id) : null;
    if (v && e[0] === 'status') { if (e[3]) { v.statuses.add(e[2]); v.statusFrom.set(e[2], statusSource(views, e) || {}); } else { v.statuses.delete(e[2]); v.statusFrom.delete(e[2]); } }
    if (v && e[0] === 'fx') v.form = e[4].form;
    tick(L);
  }
}
const want = (L, v, views) => [...wantedStatusFx(v, new Map(), L.enemyBuffFx, null, null, (id) => views.get(id)).keys()].sort();

const cam = () => presetCamera('normal', { width: 1280, height: 720 });
function store(id) {
  const entry = assets.enemies[id].spine;
  const names = Object.keys(entry.animations || {});
  return { picture: () => null, image: async () => null, spineEntry: () => entry, spine: { acquire: async () => ({ animations: names.map((name) => ({ name })) }), release() {} } };
}
async function view(id, x, y) {
  const v = new UnitView(fakeViewCtx(fake.P, { assets: store(id), cam }), { id: 7, side: 'enemy', kind: 'enemy', defId: id, spine: id, tier: 1, x, y, maxHp: 1000, facing: -1 });
  await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  assert.ok(v.actor, 'Spine model built');
  v.sync({ x, y, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: 0, vx: 0 }, 0);
  return v;
}
let clock = 0;
const frames = (v, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) { clock += dt; v.update(dt, cam(), clock); } };

test('复核洋流使者 (real kit): skill 1 in its Skill clip, then mode 1\'s B_* clips (no stand-in puff), FORM_MODES its mode 1, enemy_dspred_buff_01 on it', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { h, sh, e } = shellAndWalker(DSPRED);
    h.runUntil(() => !sh.alive, 15);
    h.run(0.2);
    const cast = fxOf(h, 'enemySkill', e.id).find((x) => x[4].ability === '1');
    const phase = fxOf(h, 'phase', e.id).find((x) => x[4].form === '1');
    assert.ok(cast && phase && !sh.alive, 'the sim casts skill 1, eats the shell and switches to mode 1 (fx phase)');

    const v = await view(DSPRED, e.x, e.y);
    assert.equal(v.onEnemySkill('1'), true);
    assert.equal(v.actor.current, 'Skill', 'its Skill clip');
    frames(v, assets.enemies[DSPRED].spine.animations.Skill);
    assert.equal(v.knowsForm('1'), true, 'a form its model draws: no stand-in puff');
    v.setForm('1', phase[4]);
    frames(v, 0.1);
    assert.equal(v.actor.current, 'B_Idle', 'mode 1\'s idle');
    assert.equal(v.actor.roles.attack.loop, 'B_Attack');

    const { L } = await layer();
    const views = new Map([[e.id, viewOf(e)], ...h.allies().map((u) => [u.id, viewOf(u)])]);
    feed(L, h, views);
    const ev = views.get(e.id);
    // dspred_tr_1[attribute] on it, and its form '1' puts mode 1 in force (FORM_MODES: the probe aura of the sample's mode 1)
    assert.deepEqual(want(L, ev, views), ['b/enemy_dspred_buff_01', 'b/enemy_dspred_mode1_probe'], 'the buff and mode 1');
    // the layer's mode: B_Attack is no clip of the binding's modes (they name Attack, the hooker's pair) — FORM_MODES says 1
    ev.actor = { roles: { attack: { loop: 'B_Attack' } } };
    assert.deepEqual(L.enemyBuffFx(ev, 'mode')?.on?.map((s) => s[1]), ['enemy_dspred_mode1_probe'], 'mode 1 in force');
  } finally { globalThis.fetch = fetch0; }
});

test('元核孽生者 (real kit): blocked by a shell it wakes into mode 1 (Skill_* clips, enemy_dslntf_buff_03 on it) and breaks it with enemy_dslntf_buff_02 once', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { h, sh, e } = shellAndWalker(DSLNTF);
    h.runUntil(() => !sh.alive, 15);
    h.run(0.2);
    const phase = fxOf(h, 'phase', e.id).find((x) => x[4].form === '1');
    const brk = h.events.filter((x) => x[0] === 'fx' && x[1] === 'kitHit' && x[4]?.k === 'dslntf:break');
    assert.ok(phase && brk.length === 1 && brk[0][4].id === e.id, 'the sim wakes it (fx phase) and breaks the shell once');

    const v = await view(DSLNTF, e.x, e.y);
    v.setForm('1', phase[4]);
    frames(v, 0.1);
    assert.equal(v.actor.current, 'Skill_Idle', 'mode 1\'s idle');
    assert.equal(v.actor.roles.attack.loop, 'Skill_Attack');
    assert.equal(v.actor.roles.die, 'Die', 'its death clip stays');

    const { L, seen } = await layer();
    const views = new Map([[e.id, viewOf(e)], ...h.allies().map((u) => [u.id, viewOf(u)])]);
    feed(L, h, views);
    assert.deepEqual(want(L, views.get(e.id), views), ['b/enemy_dslntf_buff_03'], 'dslntf_tr_1[aura_effect] on it');
    const sp = seen.filter((p) => p.kind === 'spawn').map((p) => `${p.names[0]}>${p.on ?? ''}`);
    assert.deepEqual(sp.filter((s) => s.startsWith('enemy_dslntf_buff_02')), [`enemy_dslntf_buff_02>${e.id}`], 'the break effect once, on the 孽生者');
    assert.ok(L.ownsFx(brk[0]), 'drawn by its official effect');
  } finally { globalThis.fetch = fetch0; }
});

test('赘生甲壳: its battle device names its key to the 3D board, which draws its own model by it (board3d-official-devices.test.js)', () => {
  const seen = [];
  const ctx = fakeViewCtx(fake.P, { cam, createBox: () => ({ mesh: null, update: (_c, b) => seen.push(b), destroy() {} }) });
  const d = new DeviceView(ctx, { id: 9, side: 'ally', kind: 'device', defId: SHELL, x: 6, y: 10, maxHp: 3000 });
  d.sync({ x: 6, y: 10, hp: 3000, maxHp: 3000, flags: 0 });
  d.update(1 / 60, cam(), 0);
  assert.equal(seen.at(-1)?.key, SHELL);
  d.destroy();
});

test('the extracted binding: the parts these cases read', { skip: !existsSync(MODES) && 'no extracted enemy effects' }, () => {
  const m = JSON.parse(readFileSync(MODES, 'utf8')), w = emodes();
  for (const k of [DSPRED, DSLNTF]) {
    for (const [b, fx] of Object.entries(w[k].buffFx)) assert.deepEqual(m[k].buffFx[b], fx, `${k} ${b}`);
    assert.deepEqual(m[k].modes.map((x) => [x.name, x.anim]), w[k].modes.map((x) => [x.name, x.anim]), `${k} modes`);
  }
  for (const n of NAMES.filter((x) => !x.endsWith('_probe'))) assert.ok(m.$fx[n.toLowerCase()], `${n} extracted`);
});
