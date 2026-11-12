// test/render/eskill-clip.test.js — enemy abilities cast in a clip of their own (2026-11-12, docs/rules/fx.md 「규정 수배 카드 적」·
// 「규정 살카즈 후예 무리」): the sim's fx 'enemySkill' { id, ability } plays the ability's clip once (render/units.js ESKILL_CLIPS
// → SpineActor.chant), and the attacks meanwhile play no attack clip — 破城者's SkyProjectile fires its three missiles ('atk'
// uareapMissile) inside its one F_Skill (it played F_Attack for each); 萨卡兹子裔责罚者 / 惩戒者 strike StunAttack in Skill;
// “喷射罐”'s Flame is a three-part channel over the fx's `dur`, in the way it faces its target `tgt`.
// Real kit (server/sim/content/enemies/bounty.js kitUareap) and real manifest entries, headless fake PIXI.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { getData } from '../../server/data.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const MODES = path.join(ROOT, 'public/assets/local/fx/enemy-modes.json');
const quiet = { warn() {}, error() {}, info() {} };
const UAREAP = 'enemy_10123_uareap', DFAT = 'enemy_1362_dfat';

let fake, UnitView, ESKILL_CLIPS;
before(async () => {
  fake = installFakePixi();
  ({ UnitView, ESKILL_CLIPS } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const tick = () => new Promise((r) => setImmediate(r));
const cam = () => presetCamera('normal', { width: 1280, height: 720 });
function store(id) {
  const entry = assets.enemies[id].spine;
  const names = Object.keys(entry.animations || {});
  return {
    picture: () => null, image: async () => null, spineEntry: () => entry,
    spine: { acquire: async () => ({ animations: names.map((name) => ({ name })) }), release() {} },
  };
}
/** A view of enemy `id` with its Spine model, every clip set logged. */
async function view(id, uid = 7, x = 8, y = 9) {
  const v = new UnitView(fakeViewCtx(fake.P, { assets: store(id), cam }), { id: uid, side: 'enemy', kind: 'enemy', defId: id, spine: id, tier: 1, x, y, maxHp: 1000, facing: -1 });
  await tick(); await tick();
  assert.ok(v.actor, 'Spine model built');
  v.log = [];
  const st = v.actor.spine.state, set = st.setAnimation, add = st.addAnimation;
  st.setAnimation = (i, name, loop) => { v.log.push(name); return set(i, name, loop); };
  st.addAnimation = (i, name, loop) => { v.log.push(`queue ${name}`); return add(i, name, loop); };   // (the fake plays no queue on)
  v.sync({ x, y, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: 0, vx: 0 }, 0);
  return v;
}
let clock = 0;
const frames = (v, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) { clock += dt; v.update(dt, cam(), clock); } };

test('ESKILL_CLIPS: each clip is in its model, and is the ability\'s clip in the extracted binding', (t) => {
  const clips = (spec) => (typeof spec === 'string' ? [spec] : [spec.begin, spec.loop, spec.end, ...clips2(spec.down), ...clips2(spec.up)]);
  const clips2 = (set) => (set ? [set.begin, set.loop, set.end] : []);
  for (const [id, row] of Object.entries(ESKILL_CLIPS)) {
    for (const [ability, spec] of Object.entries(row)) for (const clip of clips(spec)) assert.ok(assets.enemies[id]?.spine?.animations?.[clip] > 0, `${id} ${ability}: ${clip} in its model`);
  }
  if (!existsSync(MODES)) return t.skip('no extracted enemy bindings');
  const modes = JSON.parse(readFileSync(MODES, 'utf8'));
  for (const [id, row] of Object.entries(ESKILL_CLIPS)) {
    // a one-clip cast is the binding's `anim`; a channel (ThreePartChannelingAnimation) is no `anim` of it — its clips are checked above
    // (复核洋流使者's skill 1 has no effect of its own: no row in the binding — its clip is the prefab's, act3-shell-fx.test.js)
    for (const [ability, clip] of Object.entries(row)) {
      const sk = modes[id]?.skills?.[ability.toLowerCase()];
      if (typeof clip === 'string' && sk) assert.equal(sk.anim, clip, `${id} ${ability}`);
    }
    assert.equal(modes.enemy_10123_uareap?.skills?.skyprojectile?.anim, 'F_Skill', 'a bound one is checked');
  }
});

test('破城者 (real kit): SkyProjectile plays F_Skill once over its three missiles — no F_Attack for each —, then a plain attack plays F_Attack', async () => {
  const ACT3 = getData({ log: quiet, season: 'act3autochess' });
  const WALL = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    kind: 'normal', sharedBoss: null, enemies: [], defs: { chess: { t_wall: WALL }, enemies: { [UAREAP]: ACT3.enemies[UAREAP] } },
    kits: { t_wall: () => ({ trait: { noAttack: true } }) },
    units: [[10, 7], [9, 6], [11, 6], [10, 8]].map(([row, col], i) => ({ chessId: 't_wall', row, col, uid: i + 1 })),
  });
  h.step();
  const b = h.battle, ev0 = b._ev.bind(b), rec = [];
  b._ev = (e) => { rec.push([b.time, e]); return ev0(e); };
  const e = h.spawn(UAREAP, { pos: [10, 6], routeIndex: 0, mods: { speedMul: 0 }, tag: null });
  h.runUntil(() => rec.filter(([, x]) => x[0] === 'atk' && x[3] === 'uareapMissile').length >= 3, 12);
  const cast = rec.find(([, x]) => x[0] === 'fx' && x[1] === 'enemySkill' && x[4]?.ability === 'SkyProjectile');
  const shots = rec.filter(([, x]) => x[0] === 'atk' && x[1] === e.id && x[3] === 'uareapMissile');
  assert.ok(cast && shots.length === 3, 'the sim casts SkyProjectile and fires three missiles');
  const dur = assets.enemies[UAREAP].spine.animations.F_Skill;
  assert.ok(shots.at(-1)[0] - cast[0] < dur, 'all three inside the one F_Skill');

  const v = await view(UAREAP, e.id);
  let at = cast[0];
  assert.equal(v.onEnemySkill('SkyProjectile'), true);
  assert.equal(v.actor.current, 'F_Skill');
  for (const [t] of shots) {
    frames(v, t - at); at = t;
    v.onAttack(null, clock, 'uareapMissile');
    assert.equal(v.actor.current, 'F_Skill', 'a missile leaves the skill clip alone');
  }
  frames(v, cast[0] + dur + 0.05 - at);
  assert.ok(!v.log.includes('F_Attack'), `no attack clip during the cast (${v.log.join(' ')})`);
  assert.equal(v.log.filter((n) => n === 'F_Skill').length, 1, 'F_Skill once');
  assert.notEqual(v.actor.current, 'F_Skill', 'back to its resting clip as F_Skill ends');
  v.onAttack(null, clock, 'enemy');
  assert.equal(v.actor.current, 'F_Attack', 'its next plain attack');
});

test('萨卡兹子裔责罚者: StunAttack plays Skill; a stun cuts it; only the listed abilities, and none shown after its clip would have ended', async () => {
  const v = await view(DFAT);
  assert.equal(v.onEnemySkill('StunAttack'), true);
  assert.equal(v.actor.current, 'Skill');
  v.onAttack(null, clock, 'enemy');
  assert.equal(v.actor.current, 'Skill', 'an attack waits');
  frames(v, 0.3);
  v.actor.setBase('stun');
  assert.equal(v.actor.mode, 'stun', 'a stun cuts the cast clip');
  const w = await view(DFAT, 8);
  assert.equal(w.onEnemySkill('Attack'), false, 'an ability the table does not list');
  assert.equal(w.onEnemySkill('StunAttack', 2), false, 'shown 2 s late: its 1.6 s clip is over');
  assert.equal(w.log.includes('Skill'), false);
  const u = await view(UAREAP, 9);
  assert.equal(u.onEnemySkill('StunAttack'), false, 'another enemy\'s ability');
});

/** A 规程 field of 4 still walls (row, col) and enemy `key` at `pos`, every event logged with its battle time. */
function field(key, walls, pos) {
  const ACT3 = getData({ log: quiet, season: 'act3autochess' });
  const WALL = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    kind: 'normal', sharedBoss: null, enemies: [], defs: { chess: { t_wall: WALL }, enemies: { [key]: ACT3.enemies[key] } },
    kits: { t_wall: () => ({ trait: { noAttack: true } }) },
    units: walls.map(([row, col], i) => ({ chessId: 't_wall', row, col, uid: i + 1 })),
  });
  h.step();
  const b = h.battle, ev0 = b._ev.bind(b), rec = [];
  b._ev = (e) => { rec.push([b.time, e]); return ev0(e); };
  const e = h.spawn(key, { pos, routeIndex: 0, mods: { speedMul: 0 }, tag: null });
  return { h, e, rec };
}

test('“喷射罐” (real kit): its Flame channel over the fx\'s `dur` — Attack_Begin → Attack_Loop → Attack_End, Skill_Down_* at a target below; its hits play no attack clip', async () => {
  const WINBOM = 'enemy_1385_winbom';
  const A = assets.enemies[WINBOM].spine.animations;
  for (const [walls, pos, set] of [[[[10, 7]], [10, 6], 'Attack'], [[[9, 6]], [10, 6], 'Skill_Down']]) {
    const { h, e, rec } = field(WINBOM, walls, pos);
    h.runUntil(() => rec.some(([, x]) => x[0] === 'fx' && x[1] === 'enemySkill' && x[4]?.ability === 'Flame'), 12);
    const [t0, cast] = rec.find(([, x]) => x[0] === 'fx' && x[1] === 'enemySkill' && x[4]?.ability === 'Flame');
    assert.equal(cast[4].dur, 4, 'a 4 s channel');
    assert.ok(cast[4].tgt != null, 'the sim names its target');
    h.run(4.2);
    const tgt = h.allies().find((u) => u.id === cast[4].tgt);
    const v = await view(WINBOM, e.id, e.x, e.y);
    assert.equal(v.onEnemySkill('Flame', 0, { dur: cast[4].dur, aim: { x: tgt.x, y: tgt.y } }), true);
    assert.equal(v.actor.current, `${set}_Begin`, `${set}: its begin`);
    let at = t0;
    for (const [t, x] of rec.filter(([tt, x]) => tt >= t0 && tt < t0 + 4 && (x[0] === 'atk' || x[0] === 'dmg') && (x[1] === e.id || x[2] === e.id))) {
      frames(v, t - at); at = t;
      if (x[0] === 'atk') v.onAttack(null, clock, x[3]);
    }
    frames(v, t0 + 4 - A[`${set}_End`] - 0.05 - at);
    assert.deepEqual(v.log.slice(-2), [`${set}_Begin`, `queue ${set}_Loop`], `${set}: the loop after its begin, to ${(4 - A[`${set}_End`]).toFixed(3)} s`);
    frames(v, 0.1);
    assert.equal(v.actor.current, `${set}_End`, `${set}: its end to close the 4 s`);
    frames(v, A[`${set}_End`]);
    assert.ok(!v.log.some((n) => /^(queue )?(Attack|Skill_(Up|Down))_/.test(n) && !n.replace('queue ', '').startsWith(set)), `only the ${set} set (${v.log.join(' ')})`);
    assert.equal(v.actor.mode, 'base', 'back at rest after the 4 s');
  }
});

test('render/app.js hands each fx \'enemySkill\' to its view', () => {
  const app = readFileSync(path.join(ROOT, 'public/js/render/app.js'), 'utf8');
  assert.match(app, /if \(e\[1\] === 'enemySkill' && e\[4\] && typeof e\[4\]\.ability === 'string' && e\[4\]\.id != null\) \{\n {10}const t = e\[4\]\.tgt != null \? views\.get\(e\[4\]\.tgt\) : null;\n {10}views\.get\(e\[4\]\.id\)\?\.onEnemySkill\?\.\(e\[4\]\.ability, LATE\.get\(e\) \|\| 0, \{ dur: Number\(e\[4\]\.dur\) \|\| 0, aim: t \? \{ x: t\.x, y: t\.y \} : null \}\);/);
});
