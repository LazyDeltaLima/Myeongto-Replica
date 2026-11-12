// test/render/critic-fx.test.js — 规程's CRITIC 精锐 drawn by their official effects (2026-11-11, docs/rules/fx.md 「규정 정예
// 무리」): 冰原卫法者's projectile appears where it fell with its target-start effects and strikes there 1.2 s later with
// its hit effect on each unit struck; 马特奥的近卫's / 无畏掷弹兵's bombs burst once where they touch (their reach effect), not
// again on each unit the burst damages; 寻路者破阵者 in its ammo mode casts and lands its HeadShot shell (not its Default
// melee effects) and its 3 × 3 box draws no stand-in; the forms the sim turns on have their clip sets (render/units.js FORMS),
// the same clips the sim times (enemies.json attackAnim.modes). The sim's events come from the real 规程 kits
// (content/enemies/critic.js); the render runs on a sample binding (the extracted effects are not needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { installFakePixi } from './fakepixi.js';
import { getData } from '../../server/data.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const MODES = new URL('../../public/assets/local/fx/enemy-modes.json', import.meta.url);
const quiet = { warn() {}, error() {}, info() {} };
const ACT3 = getData({ log: quiet, season: 'act3autochess' });
const KRGRG = 'enemy_1191_krgrg', BDGUAD = 'enemy_1409_bdguad_2', BOOMER = 'enemy_1405_boomer_2', CANSLD = 'enemy_1216_cansld';
const MTRBTY = 'enemy_1219_mtrbty', MTRSNP = 'enemy_1213_mtrsnp', LTNDRU = 'enemy_1376_ltndru', WINGNT = 'enemy_1388_wingnt', WINBOM = 'enemy_1385_winbom';
const WALL = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
const walls = (cells) => cells.map(([row, col], i) => ({ chessId: 't_wall', row, col, uid: i + 1 }));

function field(keys, units) {
  const enemies = Object.fromEntries(keys.map((k) => [k, ACT3.enemies[k]]));
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    kind: 'normal', sharedBoss: null, enemies: [], defs: { chess: { t_wall: WALL }, enemies },
    kits: { t_wall: () => ({ trait: { noAttack: true } }) }, units,
  });
  h.step();
  return h;
}
const put = (h, key, pos) => h.spawn(key, { pos, routeIndex: 0, mods: { speedMul: 0 }, tag: null });

// the parts of the extracted binding these cases read (enemy-modes.json, enemy_bindings.py)
const BOMB = (key, trail, reached) => ({ key, mount: 2, trail: [trail], reached: [reached], move: 'FIXED_DIRECTION', speed: 5 });
const emodes = () => ({
  [KRGRG]: { modes: [{ name: 'Default', anim: ['Attack'], melee: { cast: [], opt: {}, hit: ['enemy_krgrg_attack_01_hit'] } }],
    skills: { boom: { cast: [], opt: {}, hit: [], proj: { key: 'projectile_enemy_krgrg', mount: null, hit: ['enemy_krgrg_die_hit'], targetStart: ['enemy_krgrg_die_start', 'enemy_krgrg_die_start_02'] } } } },
  [BDGUAD]: { modes: [{ name: 'Default', anim: ['Attack'], melee: { cast: [], opt: {}, hit: ['enemy_bdguad_attack_hit'] } }],
    skills: { crossbomb: { cast: ['enemy_bdguad_skill_01_start_01'], opt: {}, hit: ['enemy_hummbd_buff_01'], hopt: { enemy_hummbd_buff_01: { e: 4, once: 1 } },
      proj: BOMB('projectile_enemy_bdguad', 'enemy_bdguad_skill_01_trail', 'enemy_bdguad_skill_01_hit'), anim: 'Skill_1' } } },
  [BOOMER]: { modes: [{ name: 'Default', anim: ['Attack_1'], melee: { cast: ['enemy_boomer_attack_start'], opt: {}, hit: ['enemy_boomer_attack_hit'] } }, { name: 'D2L', anim: [] },
    { name: 'Light', anim: ['Attack_2'], melee: { cast: ['enemy_boomer_attack_start'], opt: {}, hit: ['enemy_boomer_attack_hit'] } }],
    skills: { bomb: { cast: ['enemy_boomer_skill_start'], opt: {}, hit: [], proj: BOMB('projectile_enemy_boomer', 'enemy_boomer_skill_trail', 'enemy_boomer_skill_hit'), anim: 'Skill_1' } } },
  [CANSLD]: { modes: [{ name: 'Default', anim: ['Attack_A'], melee: { cast: ['enemy_cansld_attack_01_start'], opt: {}, hit: ['enemy_cansld_attack_01_hit'] } },
    { name: 'HeadShot', anim: ['Attack_B'], ranged: { cast: ['enemy_cansld_skill_01_start'], opt: {}, hit: [],
      proj: { key: 'projectile_enemy_cansld', mount: 2, trail: ['enemy_cansld_skill_01_trail'], reached: ['enemy_cansld_skill_01_hit'], move: 'OTHER', speed: 4, raise: 0.6 } } }] },
  [LTNDRU]: { modes: [{ name: 'Default', anim: ['Attack'] }],
    skills: { aoeattack: { cast: ['enemy_ltndru_attack_ap_start_01', 'enemy_ltndru_attack_ap_start_02'],
      opt: { enemy_ltndru_attack_ap_start_01: { s: 2, e: 3, o: 1 }, enemy_ltndru_attack_ap_start_02: { s: 2, e: 3, o: 0 } }, hit: [], anim: 'Attack' } },
    buffFx: { 'enemy_act29side[enthu_fx_deco_only]': ['common_radical_01'] } },
  [WINGNT]: { modes: [{ name: 'Default', anim: ['A_Attack'], ranged: { cast: ['enemy_wingnt_attack_01_start'], opt: { enemy_wingnt_attack_01_start: { s: 4, e: 3, o: 0 } }, hit: [],
    proj: { key: 'projectile_enemy_wingnt', mount: 2, trail: ['enemy_wingnt_attack_01_trail'], reached: ['enemy_wingnt_attack_01_hit'], move: 'OTHER', speed: 4.0, raise: 1.5 } } },
  { name: 'Normal', anim: ['B_Attack'], melee: { cast: ['enemy_wingnt_attack_02_start'], opt: { enemy_wingnt_attack_02_start: { s: 4, e: 3, o: 0 } }, hit: ['enemy_wingnt_attack_02_hit'] } }] },
  [WINBOM]: { modes: [{ name: 'Default', anim: [] }],
    skills: { boom: { cast: [], opt: {}, hit: [], proj: { key: 'projectile_enemy_winbom', mount: null, targetStart: ['enemy_winbom_die_01'] } } } },
});
const NAMES = [...new Set(JSON.stringify(emodes()).match(/"enemy_[a-z0-9_]+(?:_hit|_start|_start_0\d|_trail|_buff_01|_die_01)"/g).map((s) => JSON.parse(s)))];

async function layer() {
  const m = emodes();
  m.$fx = Object.fromEntries(NAMES.map((n) => [n, ['b', n]]));
  const files = { '/assets/local/fx/index.json': { bundles: { b: NAMES } }, '/assets/local/fx/enemy-modes.json': m };
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  const seen = [];
  const L = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, enemyDef: (id) => ACT3.enemies[id] || null, trace: (p) => seen.push(p) });
  await new Promise((r) => setTimeout(r, 10));
  return { L, seen };
}
const viewOf = (u) => ({ id: u.id, x: u.x, y: u.y, alive: true, isEnemy: u.side === 'enemy', form: null, info: { id: u.id, side: u.side === 'enemy' ? 'enemy' : 'ally', defId: u.defId ?? 'char_x', form: null } });
const fxOf = (evs, kind, k) => evs.filter((e) => e[0] === 'fx' && e[1] === kind && (!k || e[4]?.kind === k));
/** The events of the sim tick the event `e` is in (the layer's clock is one per tick): from `e` to the next 'tick'. */
const tickOf = (evs, e) => { const i = evs.indexOf(e); const j = evs.findIndex((x, n) => n > i && x[0] === 'tick'); return evs.slice(i, j < 0 ? undefined : j); };
const spawned = (seen) => seen.splice(0).filter((p) => p.kind === 'spawn').map((p) => `${p.names[0]}${p.on != null ? '>' + p.on : ''}`);

for (const [key, name, start] of [[KRGRG, '冰原卫法者', ['enemy_krgrg_die_start', 'enemy_krgrg_die_start_02']], [WINBOM, '“喷射罐”', ['enemy_winbom_die_01']]]) test(`${name} knocked out: its projectile's target-start effects where it fell (the procedural ring off), its strike draws no stand-in`, async () => {
  const fetch0 = globalThis.fetch;
  try {
    const h = field([key], walls([[10, 5], [10, 6]]));
    const e = put(h, key, [10, 6.4]);
    h.step();
    const views = new Map([[e.id, viewOf(e)], ...h.allies().map((u) => [u.id, viewOf(u)])]);
    h.events.length = 0;
    h.b.kill(e, h.allies()[0]);
    h.run(1.5);
    const [tel] = fxOf(h.events, 'telegraph', 'deathBoom'), [boom] = fxOf(h.events, 'explode', 'deathBoom');
    assert.ok(tel && boom && tel[4].ability === 'Boom', 'the sim shows where it fell and strikes there');
    const { L, seen } = await layer();
    views.get(e.id).alive = false;
    L.onEvent(['tick'], views);
    seen.length = 0;
    L.onEvent(tel, views);
    assert.equal(L.ownsFx(tel), true, 'no stand-in ring');
    assert.deepEqual(spawned(seen), start);
    L.update(Number(tel[4].dur) || 1, { dist: 20 }, { width: 100, height: 100 });
    views.delete(e.id);
    L.onEvent(boom, views);
    assert.equal(L.ownsFx(boom), true, 'no stand-in blast');
  } finally { globalThis.fetch = fetch0; }
});

test('冰原卫法者 knocked out: its projectile\'s target-start effects where it fell, its hit on each unit the strike hits 1.2 s later — no stand-in', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const h = field([KRGRG], walls([[10, 5], [10, 6]]));
    const e = put(h, KRGRG, [10, 6.4]);
    h.step();
    const views = new Map([[e.id, viewOf(e)], ...h.allies().map((u) => [u.id, viewOf(u)])]);
    h.events.length = 0;
    h.b.kill(e, h.allies()[0]);
    h.run(1.5);
    const evs = h.events;
    const [tel] = fxOf(evs, 'telegraph', 'deathBoom'), [boom] = fxOf(evs, 'explode', 'deathBoom');
    assert.ok(tel && boom && tel[4].ability === 'Boom' && boom[4].id === e.id, 'the sim shows where it fell and strikes there');
    const strike = tickOf(evs, boom).filter((x) => x[0] === 'dmg' && x[5] === e.id);
    assert.equal(strike.length, 2, 'both walls struck');
    const { L, seen } = await layer();
    views.get(e.id).alive = false;
    L.onEvent(['tick'], views);
    seen.length = 0;
    L.onEvent(tel, views);
    assert.equal(L.ownsFx(tel), true, 'no stand-in ring');
    assert.deepEqual(spawned(seen), ['enemy_krgrg_die_start', 'enemy_krgrg_die_start_02']);
    L.update(1.2, { dist: 20 }, { width: 100, height: 100 });
    views.delete(e.id);   // its view is gone by the strike
    seen.length = 0;
    L.onEvent(boom, views);
    assert.equal(L.ownsFx(boom), true, 'no stand-in blast');
    for (const d of strike) L.onEvent(d, views);
    assert.deepEqual(spawned(seen), strike.map((d) => `enemy_krgrg_die_hit>${d[1]}`));
    const other = ['fx', 'explode', 1, 1, { x: 1, y: 1, r: 1.65, kind: 'deathBoom', id: 999, ability: 'Boom' }];
    L.onEvent(other, views);
    assert.equal(L.ownsFx(other), false, 'a strike with nothing shown where it fell: the stand-in');
  } finally { globalThis.fetch = fetch0; }
});

for (const [key, units, at, reached] of [
  [BDGUAD, walls([[10, 3], [11, 3]]), [10, 8], 'enemy_bdguad_skill_01_hit'],
  [BOOMER, walls([[10, 3], [10, 9], [12, 6]]), [10, 6], 'enemy_boomer_skill_hit'],
]) {
  test(`${key === BDGUAD ? '马特奥的近卫' : '无畏掷弹兵'}'s bombs: each bursts once where it touched (its reach effect), not again on each unit the burst damages — no stand-in`, async () => {
    const fetch0 = globalThis.fetch;
    try {
      const h = field([key], units);
      const e = put(h, key, at);
      h.step();
      if (key === BOOMER) h.b.dealDamage(null, e, { amount: 1, type: 'true' });
      h.run(key === BDGUAD ? 6 : 2);
      const evs = h.events;
      const blasts = fxOf(evs, 'explode', 'bomb');
      assert.ok(blasts.length >= 2 && blasts.every((b) => b[4].id === e.id), 'the sim bursts its bombs');
      const { L, seen } = await layer();
      const views = new Map([[e.id, viewOf(e)], ...h.allies().map((u) => [u.id, viewOf(u)])]);
      L.onEvent(['tick'], views);
      L.onEvent(fxOf(evs, 'enemySkill')[0], views);   // the cast: the ability whose projectile these are
      for (const b of blasts) {
        L.update(1 / 30, { dist: 20 }, { width: 100, height: 100 });
        seen.length = 0;
        const tick = tickOf(evs, b).filter((x) => x === b || x[0] === 'dmg' && x[5] === e.id);
        assert.ok(tick.length >= 2, 'its damage follows it in that tick');
        for (const x of tick) L.onEvent(x, views);
        assert.equal(L.ownsFx(b), true, 'no stand-in blast');
        assert.deepEqual(spawned(seen), [reached], 'one burst on the spot, nothing more on the units it damages');
      }
    } finally { globalThis.fetch = fetch0; }
  });
}

test('寻路者破阵者 in HeadShot: its HeadShot attack\'s cast and its shell landing, not the Default melee\'s; its 3 × 3 box draws no stand-in', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const h = field([CANSLD], walls([[10, 4], [10, 3]]));
    const e = put(h, CANSLD, [10, 6.4]);
    h.run(2.5);
    const evs = h.events;
    const [phase] = fxOf(evs, 'phase', 'HeadShot'), [box] = fxOf(evs, 'explode', 'cansld');
    const atk = evs.find((x) => x[0] === 'atk' && x[1] === e.id), shot = fxOf(evs, 'enemyShot')[0];
    assert.ok(phase && phase[4].form === 'HeadShot' && atk && shot && box, 'the sim turns HeadShot on and lobs a shell');
    const { L, seen } = await layer();
    const v = viewOf(e);
    const views = new Map([[e.id, v], ...h.allies().map((u) => [u.id, viewOf(u)])]);
    L.onEvent(['tick'], views);
    v.form = v.info.form = phase[4].form;   // render/app.js: a form FORMS draws for this model (asserted below)
    seen.length = 0;
    L.onEvent(atk, views);
    L.onEvent(shot, views);
    assert.deepEqual(spawned(seen), [`enemy_cansld_skill_01_start>${e.id}`], 'the HeadShot attack\'s cast effect, on it');
    L.update(Number(shot[4].t) + 0.01, { dist: 20 }, { width: 100, height: 100 });
    assert.deepEqual(spawned(seen), [`enemy_cansld_skill_01_hit>${shot[4].tgt}`], 'its reach effect as it lands');
    for (const x of tickOf(evs, box).filter((x) => x === box || x[0] === 'dmg' && x[5] === e.id)) L.onEvent(x, views);
    assert.equal(L.ownsFx(box), true, 'no stand-in box');
    assert.deepEqual(spawned(seen), [], 'no Default melee hit on what the box strikes');
  } finally { globalThis.fetch = fetch0; }
});

test('the forms the 规程 CRITIC kits turn on: a clip set the model has, attacking on the clip the sim times', async () => {
  const fake = installFakePixi();
  try {
    const { FORMS } = await import('../../public/js/render/units.js');
    const models = JSON.parse(readFileSync(new URL('../../data/assets.json', import.meta.url), 'utf8')).enemies;
    for (const [key, form] of [[CANSLD, 'HeadShot'], [MTRBTY, 'HeadShot'], [MTRSNP, 'HeadShot'], [BOOMER, 'Light'], [WINGNT, 'Normal'], [`${WINGNT}_2`, 'Normal']]) {
      const f = FORMS[key]?.[form];
      assert.ok(f, `${key} ${form}`);
      const clips = models[key].spine.animations;
      for (const r of Object.values(f.roles)) for (const c of [r?.loop, typeof r === 'string' ? r : null]) if (c) assert.ok(c in clips, `${key} ${form}: ${c}`);
      const sim = ACT3.enemies[key].attackAnim;
      const viewClip = f.roles.attack?.loop ?? models[key].spine.anims.attack.loop;
      assert.equal(viewClip, sim.modes[form].clip, `${key} ${form}: the view attacks on the clip the sim times`);
    }
  } finally { fake.restore(); }
});

test('the extracted binding: the CRITIC projectiles\' effects these cases read', { skip: !existsSync(MODES) && 'no extracted enemy effects' }, () => {
  const m = JSON.parse(readFileSync(MODES, 'utf8')), want = emodes();
  assert.deepEqual(m[KRGRG].skills.boom.proj, want[KRGRG].skills.boom.proj);
  for (const k of [BDGUAD, BOOMER]) {
    const [sk] = Object.keys(want[k].skills);
    assert.deepEqual(m[k].skills[sk].proj, want[k].skills[sk].proj, k);
  }
  assert.deepEqual(m[CANSLD].modes.map((x) => x.name), ['Default', 'HeadShot']);
  assert.deepEqual(m[CANSLD].modes[1].ranged.proj, want[CANSLD].modes[1].ranged.proj);
  for (const n of NAMES) assert.ok(m.$fx[n], `${n} extracted`);
  assert.deepEqual(m.enemy_1406_chghmr.buffFx['enemy_chghmr_damage_up[mark]'], ['enemy_chghmr_buff'], '战线推进者\'s mark');
  assert.ok(m.$fx.enemy_chghmr_buff);
  assert.deepEqual(m[LTNDRU].skills.aoeattack.cast, want[LTNDRU].skills.aoeattack.cast, '鼓手\'s aoeAttack');
  assert.deepEqual(m[LTNDRU].buffFx['enemy_act29side[enthu_fx_deco_only]'], ['common_radical_01']);
  for (const k of [WINGNT, `${WINGNT}_2`]) assert.deepEqual(m[k].modes.map(({ name, anim, ranged, melee }) => ({ name, anim, ranged, melee })), want[WINGNT].modes.map(({ name, anim, ranged, melee }) => ({ name, anim, ranged, melee })), k);
  for (const k of [WINBOM, `${WINBOM}_2`]) assert.deepEqual(m[k].skills.boom.proj, want[WINBOM].skills.boom.proj, k);
});

test('战线推进者\'s mark enemy_chghmr_damage_up[mark]: its enemy_chghmr_buff while it has the mark — from its spawn to PowerHit\'s strike', async () => {
  const F = await import('../../public/js/render/fxstatus.js');
  const CHGHMR = 'enemy_1406_chghmr';
  const h = field([CHGHMR], walls([[10, 5]]));
  const e = h.spawn(CHGHMR, { pos: [10, 7], routeIndex: 0, tag: null });
  const own = (_v, kind, tag) => (kind === 'key' && tag === 'enemy_chghmr_damage_up[mark]' ? { on: [['b', 'enemy_chghmr_buff', 0.5]], ends: new Map(), once: new Set() } : null);
  const drawn = () => {
    const v = { ...viewOf(e), flags: 0, statuses: new Set(), statusFrom: new Map() };
    const views = new Map([[e.id, v]]);
    for (const x of h.events) if (x[0] === 'status' && x[1] === e.id) {
      if (x[3]) { v.statuses.add(x[2]); const f = F.statusSource(views, x); if (f) v.statusFrom.set(x[2], f); } else { v.statuses.delete(x[2]); v.statusFrom.delete(x[2]); }
    }
    return [...F.wantedStatusFx(v, new Map(), own).keys()];
  };
  h.step();
  assert.deepEqual(drawn(), ['b/enemy_chghmr_buff'], 'marked as it spawns');
  assert.ok(h.runUntil(() => e.castLeft > 0, 10), 'PowerHit cast on its blocker');
  assert.ok(h.events.some((x) => x[0] === 'fx' && x[1] === 'enemySkill' && x[4]?.ability === 'PowerHit'));
  assert.deepEqual(drawn(), ['b/enemy_chghmr_buff'], 'still marked as PowerHit starts');
  assert.ok(h.runUntil(() => !(e.castLeft > 0), 5));
  assert.ok(h.events.some((x) => x[0] === 'dmg' && x[5] === e.id), 'its strike');
  assert.deepEqual(drawn(), [], 'spent at its strike');
});

test('残党乐团鼓手\'s aoeAttack: its cast effects are the blast (enemy_ltndru[AOE] creates none) — no stand-in ring; the band\'s 变奏 decoration on it', async () => {
  const fetch0 = globalThis.fetch;
  const F = await import('../../public/js/render/fxstatus.js');
  try {
    const h = field([LTNDRU], walls([[10, 4], [10, 5]]));
    const e = put(h, LTNDRU, [10, 6]);
    h.run(6);
    const evs = h.events;
    const cast = fxOf(evs, 'enemySkill').find((x) => x[4].ability === 'aoeAttack'), [aoe] = fxOf(evs, 'explode', 'ltndruAoe');
    assert.ok(cast && aoe && aoe[4].ability === 'aoeAttack', 'the sim casts it and blasts');
    const { L, seen } = await layer();
    const m = emodes();
    const names = ['enemy_ltndru_attack_ap_start_01', 'enemy_ltndru_attack_ap_start_02'];
    const views = new Map([[e.id, viewOf(e)], ...h.allies().map((u) => [u.id, viewOf(u)])]);
    L.onEvent(['tick'], views);
    L.onEvent(cast, views);
    L.update(1 / 30, { dist: 20 }, { width: 100, height: 100 });
    assert.deepEqual(spawned(seen).map((s) => s.split('>')[0]), names, 'its cast effects, the wave among them');
    L.update(0.9, { dist: 20 }, { width: 100, height: 100 });
    seen.length = 0;
    for (const x of tickOf(evs, aoe).filter((x) => x === aoe || x[0] === 'dmg' && x[5] === e.id)) L.onEvent(x, views);
    assert.equal(L.ownsFx(aoe), true, 'no stand-in ring');
    assert.deepEqual(spawned(seen), [], 'and nothing on what it hits');
    // 变奏 is not on in this mode: the 激昂 decoration only (enemy_act29side[enthu_fx_deco_only] → common_radical_01)
    const v = { ...viewOf(e), flags: 0, statuses: new Set(), statusFrom: new Map() };
    for (const x of evs) if (x[0] === 'status' && x[1] === e.id && x[3]) { v.statuses.add(x[2]); const f = F.statusSource(views, x); if (f) v.statusFrom.set(x[2], f); }
    const own = (_v, kind, tag) => (kind === 'key' && m[LTNDRU].buffFx[tag] ? { on: m[LTNDRU].buffFx[tag].map((n) => ['b', n, 0.5]), ends: new Map(), once: new Set() } : null);
    assert.deepEqual([...F.wantedStatusFx(v, new Map(), own).keys()], ['b/common_radical_01']);
  } finally { globalThis.fetch = fetch0; }
});

test('“投石机”\'s first throw: its snowball\'s trail, its reach effect as it lands (on the spot when its target fell meanwhile), its cross draws no stand-in; then the Normal mode\'s melee effects, no puff for the switch', async () => {
  const fetch0 = globalThis.fetch;
  const { fxSpec } = await import('../../public/js/render/fx/kinds.js');
  try {
    for (const fell of [false, true]) {
      const h = field([WINGNT], walls([[10, 6], [10, 5]]));   // the one at 6 blocks it: its Normal melee strikes it
      const e = put(h, WINGNT, [10, 6.4]);
      h.run(4);
      const evs = h.events;
      const shot = fxOf(evs, 'enemyShot')[0], [blast] = fxOf(evs, 'explode', 'wingnt'), [phase] = fxOf(evs, 'phase', 'Normal');
      const atk = evs.find((x) => x[0] === 'atk' && x[1] === e.id);
      assert.ok(shot && blast && phase && atk && blast[4].tiles === 'plus', 'the sim lobs a snowball, bursts it in a cross and turns Normal');
      assert.equal(fxSpec('phase', phase[4]).a, 'none', 'SwitchMode: no effect of its own');
      const { L, seen } = await layer();
      const v = viewOf(e);
      const views = new Map([[e.id, v], ...h.allies().map((u) => [u.id, viewOf(u)])]);
      L.onEvent(['tick'], views);
      seen.length = 0;
      L.onEvent(atk, views);
      L.onEvent(shot, views);
      assert.deepEqual(spawned(seen), [`enemy_wingnt_attack_01_start>${e.id}`], 'the throw\'s cast effect');
      if (fell) views.get(shot[4].tgt).alive = false;
      L.update(Number(shot[4].t) + 0.01, { dist: 20 }, { width: 100, height: 100 });
      assert.deepEqual(spawned(seen), fell ? [] : [`enemy_wingnt_attack_01_hit>${shot[4].tgt}`], 'its reach effect as it lands on its target');
      for (const x of tickOf(evs, blast).filter((x) => x === blast || x[0] === 'dmg' && x[5] === e.id)) L.onEvent(x, views);
      assert.equal(L.ownsFx(blast), true, 'no stand-in cross');
      assert.deepEqual(spawned(seen), fell ? ['enemy_wingnt_attack_01_hit'] : [], fell ? 'its target fell: the reach effect on the spot' : 'nothing more on what the cross strikes');
      // Normal: its melee (B_Attack) — the Normal mode's cast effect, not the throw's
      v.form = v.info.form = 'Normal';
      const melee = evs.slice(evs.indexOf(phase)).find((x) => x[0] === 'atk' && x[1] === e.id);
      assert.ok(melee, 'a melee strike after the switch');
      L.update(1, { dist: 20 }, { width: 100, height: 100 });
      seen.length = 0;
      L.onEvent(melee, views);
      assert.ok(spawned(seen).includes(`enemy_wingnt_attack_02_start>${e.id}`), 'the Normal mode\'s cast effect');
    }
  } finally { globalThis.fetch = fetch0; }
});
