// Enemy prefab modes drawn in their own clips: the real kits' mode switches tell the view (fx 'phase' `form`) and
// render/units.js FORMS plays the mode's clips. 咸鳞汁推荐者 (GitHub #14): blocked it is in M2, whose hooker plays
// B_Idle / B_Move / B_Die — its first swing the barrel smash (Skills/BlockedBoom, Attack), every later one the Combat's
// B_Attack (and B_Attack while silenced: no BlockedBoom). 水遁忍者: its spin (M1) opens on Skill_Begin, stands and walks in
// Skill_Loop and closes on Skill_End. 2026-11-14: the other enemies whose kits switch a prefab mode with a clip set of
// its own (each mode's SimpleUnitAnimatorHooker `_replaceAnimPairs`, its Combat `_animKey`), and 假想敌：淤困's cast.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const E = JSON.parse(readFileSync(path.join(ROOT, 'data/enemies.json'), 'utf8'));
const WINTUN = 'enemy_10044_wintun', YMGTOP = 'enemy_10116_ymgtop';
const WALL = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
const haveModel = (id) => !!assets.enemies?.[id]?.spine;

let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

function arena(wall, o = {}) {
  return makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    defs: { chess: { t_wall: WALL }, enemies: o.enemies || {} }, kits: { t_wall: () => ({ trait: { noAttack: true } }) },
    units: wall ? [{ chessId: 't_wall', row: wall[0], col: wall[1] }] : [], ...(o.flat ? { flat: o.flat } : {}),
  });
}
const cam = () => presetCamera('normal', { width: 1280, height: 720 });
function store(id) {
  const entry = assets.enemies[id].spine;
  const names = Object.keys(entry.animations || {});
  return { picture: () => null, image: async () => null, spineEntry: () => entry, spine: { acquire: async () => ({ animations: names.map((name) => ({ name })) }), release() {} } };
}
async function view(id, x, y, spine = id) {
  const v = new UnitView(fakeViewCtx(fake.P, { assets: store(id), cam }), { id: 7, side: 'enemy', kind: 'enemy', defId: id, spine, tier: 1, x, y, maxHp: 1000, facing: -1 });
  await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  assert.ok(v.actor, 'Spine model built');
  v.sync({ x, y, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: 0, vx: 0 }, 0);
  return v;
}
let clock = 0;
const frames = (v, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) { clock += dt; v.update(dt, cam(), clock); } };

/**
 * Steps the battle `s` s, handing enemy `e`'s mode switches (fx 'phase' with a form) and swings to view `v` as they come,
 * the view running alongside. Returns what the view played: [clip at each swing's start], [form, clip after it] per switch.
 */
function play(h, e, v, s) {
  const out = { swings: [], forms: [], skills: [] };
  const end = h.b.time + s;
  while (h.b.time < end - 1e-9) {
    const n = h.events.length;
    h.step();
    for (const x of h.events.slice(n)) {
      if (x[0] === 'fx' && x[4]?.id === e.id && typeof x[4] === 'object' && 'form' in x[4]) {
        v.setForm(x[4].form, x[4]);
        out.forms.push([x[4].form, v.actor.current]);
      } else if (x[0] === 'fx' && x[1] === 'enemySkill' && x[4]?.id === e.id) {
        v.onEnemySkill(x[4].ability, 0, x[4]);
        out.skills.push(v.actor.current);
      } else if (x[0] === 'swing' && x[1] === e.id) {
        v.onSwing(Number(x[2]), x[3]);
        out.swings.push(v.actor.current);
      }
    }
    frames(v, h.b.dt);
  }
  return out;
}

test('咸鳞汁推荐者 (GitHub #14): blocked, the B_* idle / walk; its first swing the barrel smash (Attack), then the bare-handed B_Attack', { skip: !haveModel(WINTUN) && 'no model' }, async () => {
  const h = arena([9, 5]);
  h.step();
  const e = h.spawn(WINTUN, { pos: [9, 5], routeIndex: 0, mods: { speedMul: 0 } });
  const v = await view(WINTUN, e.x, e.y);
  frames(v, 0.1);
  assert.equal(v.actor.current, 'Idle', 'with its barrel before it is blocked');
  const r = play(h, e, v, 6);
  assert.deepEqual(r.forms.map((f) => f[0]), ['M2boom', 'M2'], 'M2 with the smash to come, then M2 for good');
  assert.equal(r.forms[0][1], 'B_Idle', 'the mode\'s hooker: B_Idle from the switch');
  assert.ok(r.swings.length >= 3, `swings seen (${r.swings.length})`);
  assert.equal(r.swings[0], 'Attack', 'the first swing: BlockedBoom\'s barrel smash');
  assert.deepEqual([...new Set(r.swings.slice(1))], ['B_Attack'], 'every later swing: the Combat\'s B_Attack — no barrel again');
  assert.ok(!e.findBuff('ab:barrel'), 'the sim dropped the barrel');
  frames(v, 3);
  assert.equal(v.actor.current, 'B_Idle', 'back to the bare-handed idle between swings');
});

test('咸鳞汁推荐者 silenced when blocked: B_Attack (no BlockedBoom) while the barrel is kept, the smash once the silence ends', { skip: !haveModel(WINTUN) && 'no model' }, async () => {
  const h = arena([9, 5]);
  h.step();
  const e = h.spawn(WINTUN, { pos: [9, 5], routeIndex: 0, mods: { speedMul: 0 } });
  h.b.applyStatus(e, 'silence', { duration: 4 });
  const v = await view(WINTUN, e.x, e.y);
  const r = play(h, e, v, 10);
  assert.deepEqual(r.forms.map((f) => f[0]), ['M2', 'M2boom', 'M2'], 'silenced M2, the smash to come after it, then M2 for good');
  const smash = r.swings.indexOf('Attack');
  assert.ok(smash > 0, `the silenced swings first (${r.swings.join(', ')})`);
  assert.deepEqual([...new Set(r.swings.slice(0, smash))], ['B_Attack'], 'silenced: the Combat\'s B_Attack');
  assert.equal(r.swings.filter((c) => c === 'Attack').length, 1, 'one barrel smash');
});

test('水遁忍者: its spin opens on Skill_Begin, stands and walks in Skill_Loop, closes on Skill_End', { skip: !haveModel(YMGTOP) && 'no model' }, async () => {
  const h = arena([10, 6]);
  h.step();
  const e = h.spawn(YMGTOP, { pos: [10, 7], routeIndex: 0, mods: { speedMul: 0 } });
  const v = await view(YMGTOP, e.x, e.y);
  const sk = E[YMGTOP].skills.find((s) => s.prefabKey === 'SwitchModeTrigger');
  const r = play(h, e, v, sk.initCooldown + 0.5);
  assert.deepEqual(r.forms, [['M1', 'Skill_Begin']], 'the spin starts on BeginAnim\'s Skill_Begin');
  assert.equal(v.actor.roles.move.loop, 'Skill_Loop', 'it walks spinning');
  frames(v, assets.enemies[YMGTOP].spine.animations.Skill_Begin);
  assert.equal(v.actor.current, 'Skill_Loop', 'then the hooker\'s Skill_Loop');
  // 失衡 stops it (the kit's unbalanced: pushed, as in content/enemies_bosses.test.js)
  h.b.displace(e, { x: 1, y: 0 }, 0.2, { force: 3 });
  const r2 = play(h, e, v, 1);
  assert.deepEqual(r2.forms, [[null, 'Skill_End']], 'the spin ends: back to its first mode on EndAnim\'s Skill_End');
  frames(v, assets.enemies[YMGTOP].spine.animations.Skill_End + 0.1);
  assert.equal(v.actor.current, 'Idle', 'then its own idle');
});

// ---------------------------------------------------------------------------------------------------------------
// 2026-11-14: the other mode switches of the sweep (docs/rules/render.md 「적 프리팹 모드의 클립 — 액젓 추천자·수둔 닌자」)
const E3 = JSON.parse(readFileSync(path.join(ROOT, 'data/seasons/act3autochess/enemies.json'), 'utf8'));
const clipLen = (id, c) => assets.enemies[id].spine.animations[c];
const modelTest = (name, id, fn) => test(name, { skip: !haveModel(id) && 'no model' }, fn);

modelTest('卷心籽 ignited by 灼藤\'s first attack: Skills/onfire\'s 1to2, then mode OnFire\'s 2_* clips', 'enemy_10065_ftzlc', async () => {
  const ID = 'enemy_10065_ftzlc';
  const h = arena([9, 5]);
  h.step();
  h.spawn('enemy_10067_ftsjc', { pos: [9, 5], routeIndex: 0, mods: { speedMul: 0 } });
  const e = h.spawn(ID, { pos: [9, 6], routeIndex: 0, mods: { speedMul: 0 } });
  const v = await view(ID, e.x, e.y);
  const r = play(h, e, v, 8);
  assert.deepEqual(r.forms, [['OnFire', '1to2']], 'ignited once: the change clip 1to2');
  frames(v, clipLen(ID, '1to2') + 0.05);
  assert.equal(v.actor.current, '2_Idle', 'then the burning idle');
  assert.deepEqual([v.actor.roles.move.loop, v.actor.roles.die, v.actor.roles.attack.loop], ['2_Move', '2_Die', '2_Attack']);
});

modelTest('拥霜羽兽 unbalanced once: Skills/switch\'s Die_3 (the egg), then mode Speed\'s Idle_2 / Move_2 / Die_2', 'enemy_10141_xdpeng_2', async () => {
  const ID = 'enemy_10141_xdpeng_2';
  const h = arena(null);
  h.step();
  const e = h.spawn(ID, { pos: [9, 5], routeIndex: 0, mods: { speedMul: 0 } });
  const v = await view(ID, e.x, e.y);
  play(h, e, v, 0.1);
  h.b.displace(e, { x: 1, y: 0 }, 0.5, { force: 3 });
  const r = play(h, e, v, 1);
  assert.deepEqual(r.forms, [['Speed', 'Die_3']], 'one switch, on Die_3');
  frames(v, clipLen(ID, 'Die_3') + 0.05);
  assert.deepEqual([v.actor.roles.idle, v.actor.roles.move.loop, v.actor.roles.die], ['Idle_2', 'Move_2', 'Die_2']);
  h.b.displace(e, { x: -1, y: 0 }, 0.2, { force: 3 });
  assert.deepEqual(play(h, e, v, 1).forms, [], 'a second 失衡 switches nothing');
});

modelTest('沸血骑士团精锐 at 10 knock-outs: mode Rage\'s Combat swings Skill', 'enemy_1103_wdkght_2', async () => {
  const ID = 'enemy_1103_wdkght_2';
  const h = arena([9, 5], { enemies: { [ID]: E3[ID] } });
  h.step();
  const w = h.unit('t_wall');
  const e = h.spawn(ID, { pos: [9, 5], routeIndex: 0, mods: { speedMul: 0 } });
  const v = await view(ID, e.x, e.y);
  const before = play(h, e, v, 6);
  assert.ok(before.swings.length >= 1 && before.swings.every((c) => c === 'Attack'), `its plain Attack first (${before.swings})`);
  for (let i = 0; i < 10; i++) h.b.kill(h.spawn('enemy_10065_ftzlc', { pos: [3, 12], routeIndex: 0, mods: { speedMul: 0 } }), w);
  const r = play(h, e, v, 12);
  assert.deepEqual(r.forms.map((f) => f[0]), ['Rage'], 'Rage once, at its next attack');
  assert.ok(r.swings.length >= 3, `swings seen (${r.swings.length})`);
  assert.deepEqual([...new Set(r.swings.slice(1))], ['Skill'], `every swing after the switch: Skill (${r.swings})`);
});

modelTest('潜水员 in deep water: mode Swim\'s Idle02 / Move02 / Attack02, its first clips out of it', 'enemy_1158_divman', async () => {
  const ID = 'enemy_1158_divman';
  const h = arena(null, { flat: { rows: { 10: '##hddddrrrfrrrrrrrf##' } } });
  h.step();
  const e = h.spawn(ID, { pos: [10, 4], routeIndex: 0, mods: { speedMul: 0 } });
  const v = await view(ID, e.x, e.y);
  const r = play(h, e, v, 0.5);
  assert.deepEqual(r.forms, [['Swim', 'Idle02']], 'in the water: Idle02');
  assert.deepEqual([v.actor.roles.move.loop, v.actor.roles.attack.loop], ['Move02', 'Attack02']);
  e.x = 8;
  const r2 = play(h, e, v, 0.5);
  assert.deepEqual(r2.forms, [[null, 'Idle01']], 'out of it: Idle01 again');
});

modelTest('泥岩: Attack_1 until 5 charge stacks, mode Tier 4 / 5\'s Attack_2 from the next swing', 'enemy_1511_mdrock', async () => {
  const ID = 'enemy_1511_mdrock';
  const h = arena([9, 5]);
  h.step();
  const e = h.spawn(ID, { pos: [9, 5], routeIndex: 0, mods: { speedMul: 0 } });
  const v = await view(ID, e.x, e.y);
  const r = { swings: [], forms: [] };
  for (let i = 0; i < 80 && e.stats.attacks < 8; i++) { const x = play(h, e, v, 1); r.swings.push(...x.swings); r.forms.push(...x.forms); }
  const atk = r.swings.filter((c) => /^Attack_/.test(c));
  assert.deepEqual(r.forms.map((f) => f[0]), ['Tier 4', 'Tier 5'], 'Tier 4 at 5 stacks, Tier 5 at 6');
  // ON_BEFORE_ATTACK switches the mode while the old mode's Combat swings on: the 6th swing is still Attack_1
  assert.deepEqual(atk.slice(0, 8), ['Attack_1', 'Attack_1', 'Attack_1', 'Attack_1', 'Attack_1', 'Attack_1', 'Attack_2', 'Attack_2'], `${atk}`);
});

modelTest('喷气人 taking off: mode Fly\'s Move_02 / Die_02 for its flight, its first clips after it', 'enemy_2004_balloon', async () => {
  const ID = 'enemy_2004_balloon';
  const h = arena([9, 5]);
  h.step();
  const e = h.spawn(ID, { pos: [9, 5], routeIndex: 0, mods: { speedMul: 0 } });
  const v = await view(ID, e.x, e.y);
  const sk = E[ID].skills.find((s) => s.prefabKey === 'TakeOff');
  const r = play(h, e, v, (sk.initCooldown || 0) + e.s.interval + 0.2);   // at its first attack slot once ready
  assert.deepEqual(r.forms.map((f) => f[0]), ['Fly'], 'it takes off once blocked');
  assert.deepEqual([v.actor.roles.move.loop, v.actor.roles.die, v.actor.roles.idle], ['Move_02', 'Die_02', 'Idle']);
  const r2 = play(h, e, v, sk.bb.duration + 0.5);
  assert.deepEqual(r2.forms.map((f) => f[0]), [null], 'it lands: its first clips');
  assert.equal(v.actor.roles.move.loop, 'Move_01');
});

modelTest('雪孩子 while 失衡 holds: mode Unbalanced\'s Die_2', 'enemy_10138_xdsnow', async () => {
  const ID = 'enemy_10138_xdsnow';
  const h = arena(null);
  h.step();
  const e = h.spawn(ID, { pos: [9, 5], routeIndex: 0, mods: { speedMul: 0 } });
  const v = await view(ID, e.x, e.y);
  play(h, e, v, 0.1);
  h.b.push(e, e.s.massLevel, { from: { x: e.x - 1, y: e.y } });   // a real push: its 失衡 state
  const r = play(h, e, v, 2);
  assert.deepEqual(r.forms.map((f) => f[0]), ['Unbalanced', null], 'Unbalanced while pushed, back after');
  // pushed again and knocked out meanwhile: the death clip of the mode
  h.b.push(e, e.s.massLevel, { from: { x: e.x + 1, y: e.y } });
  play(h, e, v, 0.1);
  assert.equal(v.actor.roles.die, 'Die_2', 'unbalanced: it dies on Die_2');
});

modelTest('假想敌：淤困: Parasitic while its Combat casts on its blocker, Parasitic again as it attaches, then Idle_2', 'enemy_9007_acelem', async () => {
  const ID = 'enemy_9007_acelem';
  const h = arena([9, 5]);
  h.step();
  const e = h.spawn(ID, { pos: [9, 5], routeIndex: 0, mods: { speedMul: 0 } });
  const v = await view(ID, e.x, e.y);
  const r = play(h, e, v, 0.6);
  assert.deepEqual(r.forms, [['cast', 'Parasitic']], 'blocked: the cast plays Parasitic');
  const r2 = play(h, e, v, 1);
  assert.deepEqual(r2.forms, [['parasitic', 'Parasitic']], 'attached 1.2 s in: mode Parasitic\'s Anim plays it again');
  frames(v, clipLen(ID, 'Parasitic') + 0.05);
  assert.equal(v.actor.current, 'Idle_2');
});

test('假想敌：淤困: a cast cut by a stun takes its form back', { skip: !haveModel('enemy_9007_acelem') && 'no model' }, async () => {
  const ID = 'enemy_9007_acelem';
  const h = arena([9, 5]);
  h.step();
  const e = h.spawn(ID, { pos: [9, 5], routeIndex: 0, mods: { speedMul: 0 } });
  const v = await view(ID, e.x, e.y);
  play(h, e, v, 0.4);
  h.b.applyStatus(e, 'stun', { duration: 3 });
  const r = play(h, e, v, 0.5);
  assert.deepEqual(r.forms.map((f) => f[0]), [null], 'the cut cast leaves the cast form');
  assert.ok(!e.findBuff('ab:parasiteAttached'), 'nothing attached');
});

modelTest('简饲源石虫 below half HP: StartRun\'s Skill_Begin, then mode Run\'s Idle_B / Move_B / Die_B / Attack_B', 'enemy_10001_trslim', async () => {
  const ID = 'enemy_10001_trslim';
  const h = arena(null);
  h.step();
  const e = h.spawn(ID, { pos: [9, 5], routeIndex: 0, mods: { speedMul: 0 } });
  const v = await view(ID, e.x, e.y);
  play(h, e, v, 0.1);
  h.b.dealDamage(null, e, { amount: e.s.maxHp * 0.6, type: 'true' });
  const r = play(h, e, v, 0.2);
  assert.deepEqual(r.forms, [['Run', 'Skill_Begin']], 'the switch (StartRun itself) plays Skill_Begin');
  assert.deepEqual([v.actor.roles.idle, v.actor.roles.move.loop, v.actor.roles.die, v.actor.roles.attack.loop], ['Idle_B', 'Move_B', 'Die_B', 'Attack_B']);
  frames(v, clipLen(ID, 'Skill_Begin') + 0.1);
  assert.equal(v.actor.current, 'Idle_B', 'then the running set');
});

for (const ID of ['enemy_1425_lrcmra', 'enemy_1425_lrcmra_2']) {
  modelTest(`${ID} activated on 源石污染区: Skills/triggerAnim's Skill, then mode Originium's *_2 clips`, ID, async () => {
    const h = arena([11, 6], { flat: { rows: { 11: '##hrrriirrfrrrrrrrf##' } } });
    h.step();
    const e = h.spawn(ID, { pos: [11, 6], routeIndex: 0, mods: { speedMul: 0 } });
    const v = await view(ID, e.x, e.y);
    const r = play(h, e, v, 1);
    assert.deepEqual(r.forms, [['Originium', 'Skill']], 'once, on Skill');
    frames(v, clipLen(ID, 'Skill') + 0.1);
    assert.equal(v.actor.current, 'Idle_2');
    assert.deepEqual([v.actor.roles.move.loop, v.actor.roles.die, v.actor.roles.attack.loop], ['Move_2', 'Die_2', 'Attack_2']);
  });
}

modelTest('鸭爵 hurt once: mode Run\'s Run walk for good (both of its records)', 'enemy_2001_duckmi', async () => {
  for (const ID of ['enemy_2001_duckmi', 'enemy_2001_duckmi_2']) {
    const h = arena(null);
    h.step();
    const e = h.spawn(ID, { pos: [9, 5], routeIndex: 0, mods: { speedMul: 0 } });
    const v = await view(ID, e.x, e.y, E[ID].spine);   // the record's model, as render/app.js names it (神秘顾客: 鸭爵's)
    play(h, e, v, 0.1);
    assert.equal(v.actor.roles.move.loop, 'Move', `${ID}: its plain walk first`);
    h.b.dealDamage(null, e, { amount: 1, type: 'true' });
    const r = play(h, e, v, 0.2);
    assert.deepEqual(r.forms.map((f) => f[0]), ['Run'], `${ID}: mode Run once hurt`);
    assert.equal(e.mode, 'Run', `${ID}: the sim's mode`);
    assert.deepEqual([v.actor.roles.move.loop, v.actor.roles.idle, v.actor.roles.die], ['Run', 'Idle', 'Die'], `${ID}: Move → Run only`);
    h.b.dealDamage(null, e, { amount: 1, type: 'true' });
    assert.deepEqual(play(h, e, v, 0.2).forms, [], `${ID}: hurt again, nothing more`);
  }
});

modelTest('枯朽之种 killing itself as its attack ends: mode DieMode\'s Die_2; knocked out before it, Die', 'enemy_1269_nhfly', async () => {
  const ID = 'enemy_1269_nhfly';
  const h = arena([9, 5]);
  h.step();
  const e = h.spawn(ID, { pos: [9, 6], routeIndex: 0, mods: { speedMul: 0 } });
  const v = await view(ID, e.x, e.y);
  const r = play(h, e, v, 3);
  assert.equal(e.alive, false, 'its attack ended it');
  assert.deepEqual(r.forms.map((f) => f[0]), ['DieMode'], 'mode DieMode right before the kill');
  assert.equal(e.mode, 'DieMode', 'the sim\'s mode');
  v.die();
  assert.equal(v.actor.current, 'Die_2', 'it falls on Die_2');
  // killed by something else before its attack: its first mode's Die
  const h2 = arena(null);
  h2.step();
  const e2 = h2.spawn(ID, { pos: [9, 6], routeIndex: 0, mods: { speedMul: 0 } });
  const v2 = await view(ID, e2.x, e2.y);
  play(h2, e2, v2, 0.1);
  h2.b.kill(e2, null);
  assert.deepEqual(play(h2, e2, v2, 0.1).forms, [], 'no switch');
  v2.die();
  assert.equal(v2.actor.current, 'Die');
});

modelTest('吉兆飞鳞 grounded by a stun: mode Stun\'s Stun_Die while it lies there; floating again, its Die', 'enemy_10045_parrot', async () => {
  const ID = 'enemy_10045_parrot';
  const h = arena(null);
  h.step();
  const e = h.spawn(ID, { pos: [9, 5], routeIndex: 0, mods: { speedMul: 0 } });
  const v = await view(ID, e.x, e.y);
  play(h, e, v, 0.1);
  h.b.applyStatus(e, 'stun', { duration: 0.5, source: null });
  const r = play(h, e, v, 0.2);
  assert.deepEqual(r.forms.map((f) => f[0]), ['Stun'], 'mode Stun as it lands');
  assert.equal(e.mode, 'Stun', 'the sim\'s mode');
  assert.equal(e.form, 'Stun', 'the snapshot\'s form (a view built later)');
  assert.deepEqual([v.actor.roles.die, v.actor.roles.idle, v.actor.roles.move.loop], ['Stun_Die', 'Idle_A', 'Move_A'], 'Die → Stun_Die only');
  // the mode's 8 s stun over: it floats again in its first mode
  const back = play(h, e, v, 9);
  assert.deepEqual(back.forms.map((f) => f[0]), [null], 'back to its first mode');
  assert.equal(e.form, null);
  assert.equal(v.actor.roles.die, 'Die_A', 'its first mode\'s Die');
  // grounded again and killed there: Stun_Die
  h.b.applyStatus(e, 'stun', { duration: 0.5, source: null });
  play(h, e, v, 0.2);
  h.b.kill(e, null);
  play(h, e, v, 0.1);
  v.die();
  assert.equal(v.actor.current, 'Stun_Die', 'it falls on Stun_Die');
});
