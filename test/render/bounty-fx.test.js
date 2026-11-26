// test/render/bounty-fx.test.js — the main-story enemies 规程's 悬赏 cards bring, drawn by their official effects (2026-11-12,
// docs/rules/fx.md 「규정 수배 카드 적」): 遮天面包机's bomb flies its trail from the toaster to the tile under it, bursts once
// there (its reach effect) and hits each unit with its hit effect only; 破城者's SkyProjectile casts its skill effect, its
// missiles draw no plain attack and show at their burst (the projectile's reach effect on the spot, nothing more on what
// they hit); 暴走食人花 digests with its Eat skill's looping effect held to the end of form 'eat', its mode switches draw no
// puff, and the form has the prefab mode Eat's clips; 开天汽水瓶's and 炫目刀技厨师's effects stand on them from their birth.
// The sim's events come from the real 规程 kits (content/enemies/bounty.js); the render runs on a sample binding (the
// extracted one is compared at the end).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { fxSpec } from '../../public/js/render/fx/kinds.js';
import { installFakePixi } from './fakepixi.js';
import { getData } from '../../server/data.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const MODES = new URL('../../public/assets/local/fx/enemy-modes.json', import.meta.url);
const quiet = { warn() {}, error() {}, info() {} };
const ACT3 = getData({ log: quiet, season: 'act3autochess' });
const NSBOMB = 'enemy_10147_nsbomb', UAREAP = 'enemy_10123_uareap', TRWLPL = 'enemy_10003_trwlpl_2', NSCOLA = 'enemy_10146_nscola', AGACTR = 'enemy_10229_agactr_2';
const SHKRBT = 'enemy_2135_shkrbt';
const WALL = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
// a shooter that reaches 3 tiles to its left (the hunter blinks onto the tile of the unit that hurt it)
const GUN = chessRec({ id: 't_gun', profession: 'SNIPER', stats: { atk: 50, maxHp: 1e7, def: 0, res: 0, blockCnt: 0 }, rangeGrid: [[0, 0], [0, -1], [0, -2], [0, -3]], skill: null });
const walls = (cells, chessId = 't_wall') => cells.map(([row, col], i) => ({ chessId, row, col, uid: i + 1 }));

function field(keys, units) {
  const enemies = Object.fromEntries(keys.map((k) => [k, ACT3.enemies[k]]));
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    kind: 'normal', sharedBoss: null, enemies: [], defs: { chess: { t_wall: WALL, t_gun: GUN }, enemies },
    kits: { t_wall: () => ({ trait: { noAttack: true } }) }, units,
  });
  h.step();
  return h;
}
const put = (h, key, pos) => h.spawn(key, { pos, routeIndex: 0, mods: { speedMul: 0 }, tag: null });

// the parts of the extracted binding these cases read (enemy-modes.json, enemy_bindings.py)
const NSBOMB_PROJ = { key: 'projectile_enemy_nsbomb', mount: 2, trail: ['enemy_nsbomb_attack_01_trail'], hit: ['enemy_nsbomb_attack_01_hit_02'],
  reached: ['enemy_nsbomb_attack_01_hit_01'], move: 'TRACE_TARGET_WITHIN_TIME', speed: 10.0 };
const emodes = () => ({
  [NSBOMB]: { modes: [{ name: 'Default', anim: [] }], skills: { bomb: { cast: [], opt: {}, hit: [], proj: NSBOMB_PROJ } } },
  [UAREAP]: { modes: [{ name: 'Default', anim: ['F_Combat', 'F_Attack'],
    melee: { cast: ['enemy_uareap_Combat_start_01'], opt: { enemy_uareap_Combat_start_01: { s: 2, e: 3, o: 1 } }, hit: ['enemy_uareap_Combat_hit_01'] },
    ranged: { cast: ['enemy_uareap_attack_start_01'], opt: { enemy_uareap_attack_start_01: { s: 4, e: 3, o: 1 } }, hit: [],
      proj: { key: 'projectile_enemy_uareap', mount: 2, trail: ['enemy_uareap_attack_trail_01'], hit: ['enemy_uareap_attack_hit_01'], move: 'TRACE_TARGET_WITH_SPEED', speed: 10.0 } } }],
  skills: { skyprojectile: { cast: ['enemy_uareap_skill_start_01'], opt: { enemy_uareap_skill_start_01: { s: 4, e: 3, o: 1, once: 1 } }, hit: [],
    proj: { key: 'projectile_enemy_uareap_skill', mount: 2, reached: ['enemy_uareap_skill_hit_01'] }, anim: 'F_Skill' } } },
  [TRWLPL]: { modes: [{ name: 'Default', anim: ['Attack_Begin'], ranged: { cast: ['enemy_trwlpl_attack_01'], opt: { enemy_trwlpl_attack_01: { s: 2, e: 3, o: 0 } }, hit: [] } },
    { name: 'Eat', anim: [] }, { name: 'EatInit', anim: [] }],
  skills: { eat: { cast: [], opt: {}, hit: [], buff: ['enemy_trwlpl_idlebuff_02'], dying: ['enemy_trwlpl_end-vomit_01'] } } },
  [SHKRBT]: { modes: [{ name: 'Default', anim: ['Attack'], ranged: { cast: ['enemy_shkrbt_attack_01_start'], opt: { enemy_shkrbt_attack_01_start: { s: 2, e: 3, o: 0 } }, hit: ['enemy_shkrbt_attack_01_hit'] } }],
    skills: { blink: { cast: [], opt: {}, hit: [], blink: { from: ['enemy_shkrbt_skill_01_start'], to: ['enemy_shkrbt_skill_01_end'] } } } },
  [NSCOLA]: { modes: [{ name: 'Default', anim: ['Attack'], melee: { cast: [], opt: {}, hit: ['enemy_nscola_attack_01_hit'] } }], aura: ['enemy_nscola_buff_01'] },
  [AGACTR]: { modes: [{ name: 'Default', anim: ['Attack'], melee: { cast: ['enemy_agactr_attack_start_01'], opt: {}, hit: ['enemy_agactr_attack_hit_01'] } }], aura: ['enemy_agactr_range_02'] },
});
const NAMES = [...new Set(JSON.stringify(emodes()).match(/"enemy_[A-Za-z0-9_-]+"/g).map((s) => JSON.parse(s)).filter((n) => !/^enemy_\d/.test(n)))];

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
const viewOf = (u) => ({ id: u.id, x: u.x, y: u.y, alive: true, isEnemy: u.side === 'enemy', form: null, flags: 0, statuses: new Set(),
  info: { id: u.id, side: u.side === 'enemy' ? 'enemy' : 'ally', defId: u.defId ?? 'char_x', form: null } });
const fxOf = (evs, kind, k) => evs.filter((e) => e[0] === 'fx' && e[1] === kind && (!k || e[4]?.kind === k));
/** The events of the sim tick the event `e` is in (the layer's clock is one per tick): from `e` to the next 'tick'. */
const tickOf = (evs, e) => { const i = evs.indexOf(e); const j = evs.findIndex((x, n) => n > i && x[0] === 'tick'); return evs.slice(i, j < 0 ? undefined : j); };
const spawned = (seen) => seen.splice(0).filter((p) => p.kind === 'spawn').map((p) => `${p.names[0]}${p.on != null ? '>' + p.on : ''}`);
const tick = (L) => L.update(0.05, { dist: 20 }, { width: 100, height: 100 });

test('遮天面包机: its bomb\'s trail drops to the tile under it, bursts once there, its hit effect alone on each unit — no stand-in ring or blast', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const h = field([NSBOMB], walls([[10, 6]]));
    const e = put(h, NSBOMB, [10, 6]);
    h.run(3.1);
    const evs = h.events;
    const [tel] = fxOf(evs, 'telegraph', 'nsbomb'), [boom] = fxOf(evs, 'explode', 'nsbomb');
    assert.ok(tel && boom && tel[4].ability === 'Bomb' && tel[4].dur === 0.5, 'the sim drops a bomb and bursts it 0.5 s later');
    const wall = h.allies()[0];
    const { L, seen } = await layer();
    const views = new Map([[e.id, viewOf(e)], [wall.id, viewOf(wall)]]);
    L.onEvent(['tick'], views);
    seen.length = 0;
    L.onEvent(tel, views);
    assert.equal(L.ownsFx(tel), true, 'no stand-in ring');
    assert.deepEqual(seen.splice(0).filter((p) => p.tag === 'dropTrail').map((p) => p.names[0]), ['enemy_nsbomb_attack_01_trail'], 'its trail flies to the spot');
    tick(L);
    const burst = tickOf(evs, boom).filter((x) => x === boom || x[0] === 'dmg' && x[5] === e.id);
    assert.ok(burst.some((x) => x[0] === 'dmg' && x[1] === wall.id), 'the burst hits the wall under it');
    for (const x of burst) L.onEvent(x, views);
    assert.equal(L.ownsFx(boom), true, 'no stand-in blast');
    assert.deepEqual(spawned(seen), ['enemy_nsbomb_attack_01_hit_01', `enemy_nsbomb_attack_01_hit_02>${wall.id}`], 'its reach effect on the spot, its hit effect on the unit');
  } finally { globalThis.fetch = fetch0; }
});

test('破城者: SkyProjectile casts its skill effect; its missiles draw no plain attack, burst with their reach effect on the spot and nothing on what they hit', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const h = field([UAREAP], walls([[10, 7], [9, 6], [11, 6], [10, 8]]));
    const e = put(h, UAREAP, [10, 6]);
    h.runUntil(() => fxOf(h.eventsOf('fx'), 'explode', 'uareap').length >= 1, 12);
    h.run(0.1);
    const evs = h.events;
    const [cast] = fxOf(evs, 'enemySkill').filter((x) => x[4].ability === 'SkyProjectile');
    const missile = evs.find((x) => x[0] === 'atk' && x[1] === e.id && x[3] === 'uareapMissile');
    const [boom] = fxOf(evs, 'explode', 'uareap');
    assert.ok(cast && missile && boom, 'the sim casts SkyProjectile, fires a missile and bursts it');
    const { L, seen } = await layer();
    const views = new Map([[e.id, viewOf(e)], ...h.allies().map((u) => [u.id, viewOf(u)])]);
    L.onEvent(['tick'], views);
    seen.length = 0;
    L.onEvent(cast, views);
    tick(L);
    // (2026-11-27) its cast effect is bound to ON_SPELL_ON: at the sequence's spell (the 'enemySkill' `spell`, 0.9 s), not as
    // the cast starts (docs/rules/fx.md 「적 범위 공격의 경고 칸」 주문·시전 끝)
    assert.ok(Math.abs(cast[4].spell - 0.9) < 1e-6, `the spell 0.9 s in: two fixed updates, then F_Skill's event (${cast[4].spell})`);
    assert.deepEqual(spawned(seen), [], 'no cast effect as the cast starts');
    for (let k = 0; k < 18; k++) tick(L);
    assert.deepEqual(spawned(seen), [`enemy_uareap_skill_start_01>${e.id}`], 'the skill\'s cast effect at its spell');
    L.onEvent(missile, views);
    tick(L);
    assert.deepEqual(spawned(seen), [], 'no plain attack effect for a missile');
    const burst = tickOf(evs, boom).filter((x) => x === boom || x[0] === 'dmg' && x[5] === e.id);
    assert.ok(burst.some((x) => x[0] === 'dmg'), 'the burst hits');
    for (const x of burst) L.onEvent(x, views);
    tick(L);
    assert.equal(L.ownsFx(boom), true, 'no stand-in blast');
    assert.deepEqual(spawned(seen), ['enemy_uareap_skill_hit_01'], 'its reach effect on the spot alone (no hit effect, no plain hit)');
  } finally { globalThis.fetch = fetch0; }
});

test('暴走食人花: its Eat skill\'s effect held while it digests (form eat), ended as the form ends; the mode switches draw no puff', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const h = field([TRWLPL], walls([[10, 7]]));
    const e = put(h, TRWLPL, [10, 6]);
    h.runUntil(() => fxOf(h.eventsOf('fx'), 'phase').length >= 2, 30);
    const evs = h.events;
    const [into, back] = fxOf(evs, 'phase');
    const eat = fxOf(evs, 'enemySkill').find((x) => x[4].ability === 'Eat');
    assert.ok(into && back && eat && into[4].form === 'eat' && back[4].form === null, 'the sim devours, digests in form eat and comes back');
    for (const p of [into, back]) assert.notEqual(fxSpec('phase', p[4]).a, 'none', '(the stand-in would draw: the layer must own it)');
    const { L, seen } = await layer();
    const v = viewOf(e);
    const views = new Map([[e.id, v]]);
    L.onEvent(['tick'], views);
    seen.length = 0;
    L.onEvent(into, views);
    assert.equal(L.ownsFx(into), true, 'SwitchMode into Eat: no puff');
    v.form = v.info.form = 'eat';
    L.onEvent(eat, views);
    const held = seen.splice(0).filter((p) => p.kind === 'spawn');
    assert.deepEqual(held.map((p) => [p.names[0], p.tag]), [['enemy_trwlpl_idlebuff_02', 'eskill']], 'its digest effect, held');
    L.onEvent(back, views);
    assert.equal(L.ownsFx(back), true, 'SwitchMode back: no puff');
    assert.deepEqual(seen.splice(0).filter((p) => p.kind === 'eskillEnd').map((p) => p.names[0]), ['Eat'], 'the digest effect ends with the form');
  } finally { globalThis.fetch = fetch0; }
});

test('暴走食人花 knocked out while digesting: enemy_trwlpl_s\'s vomit on it (ON_BEFORE_TRY_SET_HP_ZERO), none out of form eat', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const h = field([TRWLPL], walls([[10, 7], [3, 3]]));
    const e = put(h, TRWLPL, [10, 6]);
    h.runUntil(() => fxOf(h.eventsOf('fx'), 'phase').length >= 1, 10);
    h.run(0.1);
    const eat = fxOf(h.events, 'enemySkill').find((x) => x[4].ability === 'Eat');
    assert.ok(eat && e.form === 'eat', 'digesting');
    const n0 = h.events.length;
    h.b.kill(e, h.allies()[0]);
    h.run(0.1);
    const die = h.events.slice(n0).find((x) => x[0] === 'die' && x[1] === e.id);
    assert.ok(die, 'the sim knocks it out in form eat');
    const { L, seen } = await layer();
    const v = viewOf(e);
    v.form = v.info.form = 'eat';
    const views = new Map([[e.id, v]]);
    L.onEvent(['tick'], views);
    L.onEvent(eat, views);
    seen.length = 0;
    L.onEvent(die, views);
    assert.ok(spawned(seen).includes(`enemy_trwlpl_end-vomit_01>${e.id}`), 'the vomit where it fell');
    // not when it falls after digesting
    const w = viewOf(e);
    const { L: L2, seen: seen2 } = await layer();
    L2.onEvent(['tick'], new Map([[e.id, w]]));
    L2.onEvent(die, new Map([[e.id, w]]));
    assert.ok(!spawned(seen2).some((x) => x.startsWith('enemy_trwlpl_end-vomit_01')), 'no vomit out of form eat');
  } finally { globalThis.fetch = fetch0; }
});

test('聆风猎手: hit while free, its blink — enemy_shkrbt_skill_01_start where it leaves, _end on it where it lands; no stand-in blink', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const h = field([SHKRBT], walls([[10, 7]], 't_gun'));
    const e = put(h, SHKRBT, [10, 4]);
    h.runUntil(() => fxOf(h.eventsOf('fx'), 'teleport', 'shkrbt').length >= 1, 5);
    const [tp] = fxOf(h.events, 'teleport', 'shkrbt');
    assert.ok(tp && tp[4].ability === 'Blink' && tp[4].fromX === 4 && tp[2] === 7, 'the sim blinks it onto the gun\'s tile');
    const { L, seen } = await layer();
    const views = new Map([[e.id, viewOf(e)], ...h.allies().map((u) => [u.id, viewOf(u)])]);
    L.onEvent(['tick'], views);
    seen.length = 0;
    L.onEvent(tp, views);
    assert.equal(L.ownsFx(tp), true, 'no stand-in blink');
    const sp = seen.splice(0).filter((p) => p.kind === 'spawn');
    assert.deepEqual(sp.map((p) => `${p.names[0]}${p.on != null ? '>' + p.on : ''}`), ['enemy_shkrbt_skill_01_start', `enemy_shkrbt_skill_01_end>${e.id}`]);
  } finally { globalThis.fetch = fetch0; }
});

test('暴走食人花 form eat: the prefab mode Eat\'s clips — Attack_Idle in place of Idle and Move, Attack_Die, Attack_End as it ends', async () => {
  const fake = installFakePixi();
  try {
    const { FORMS } = await import('../../public/js/render/units.js');
    const f = FORMS[TRWLPL]?.eat;
    assert.ok(f, 'a form the model draws');
    assert.equal(f.leave, 'Attack_End');
    assert.equal(f.roles.idle, 'Attack_Idle');
    assert.equal(f.roles.move.loop, 'Attack_Idle');
    assert.equal(f.roles.die, 'Attack_Die');
    assert.equal(f.roles.attack, null);
    const models = JSON.parse(readFileSync(new URL('../../data/assets.json', import.meta.url), 'utf8')).enemies;
    const clips = models[TRWLPL]?.spine?.animations;
    if (clips) for (const c of ['Attack_Idle', 'Attack_End', 'Attack_Die']) assert.ok(c in clips, c);
  } finally { fake.restore(); }
});

test('开天汽水瓶 and 炫目刀技厨师: their effects stand on them from their birth', async () => {
  const fetch0 = globalThis.fetch;
  try {
    for (const [key, fx] of [[NSCOLA, 'enemy_nscola_buff_01'], [AGACTR, 'enemy_agactr_range_02']]) {
      const h = field([key], walls([[3, 3]]));
      const e = put(h, key, [10, 6]);
      const born = h.events.find((x) => x[0] === 'spawn' && x[1]?.id === e.id);
      assert.ok(born, key);
      const { L, seen } = await layer();
      const views = new Map([[e.id, viewOf(e)]]);
      L.onEvent(['tick'], views);
      seen.length = 0;
      L.onEvent(born, views);
      tick(L);
      assert.ok(seen.some((p) => p.kind === 'spawn' && p.names[0] === fx && p.tag === 'aura'), `${key}: ${fx}`);
    }
  } finally { globalThis.fetch = fetch0; }
});

test('the extracted binding: the parts these cases read', { skip: !existsSync(MODES) && 'no extracted enemy effects' }, () => {
  const m = JSON.parse(readFileSync(MODES, 'utf8')), w = emodes();
  assert.deepEqual(m[NSBOMB].skills.bomb.proj, w[NSBOMB].skills.bomb.proj);
  assert.deepEqual(m[UAREAP].skills.skyprojectile, w[UAREAP].skills.skyprojectile);
  assert.deepEqual(m[UAREAP].modes[0].ranged, w[UAREAP].modes[0].ranged);
  assert.deepEqual(m[TRWLPL].skills.eat.buff, w[TRWLPL].skills.eat.buff);
  assert.deepEqual(m[TRWLPL].skills.eat.dying, w[TRWLPL].skills.eat.dying);
  assert.deepEqual(m[SHKRBT].skills.blink.blink, w[SHKRBT].skills.blink.blink);
  assert.deepEqual(m[TRWLPL].modes.map((x) => x.name), ['Default', 'Eat', 'EatInit']);
  for (const k of [NSCOLA, AGACTR]) assert.deepEqual(m[k].aura, w[k].aura, k);
  for (const n of NAMES) assert.ok(m.$fx[n.toLowerCase()], `${n} extracted`);
});
