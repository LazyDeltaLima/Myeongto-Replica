// test/render/eskill-clip.test.js — enemy abilities cast in a clip of their own (2026-11-12, docs/rules/fx.md 「규정 수배 카드 적」·
// 「규정 살카즈 후예 무리」): the sim's fx 'enemySkill' { id, ability } plays the ability's clip once (render/units.js ESKILL_CLIPS
// → SpineActor.chant), and the attacks meanwhile play no attack clip — 破城者's SkyProjectile fires its three missiles ('atk'
// uareapMissile) inside its one F_Skill (it played F_Attack for each); 萨卡兹子裔责罚者 / 惩戒者 strike StunAttack in Skill.
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
async function view(id, uid = 7) {
  const v = new UnitView(fakeViewCtx(fake.P, { assets: store(id), cam }), { id: uid, side: 'enemy', kind: 'enemy', defId: id, spine: id, tier: 1, x: 8, y: 9, maxHp: 1000, facing: -1 });
  await tick(); await tick();
  assert.ok(v.actor, 'Spine model built');
  v.log = [];
  const st = v.actor.spine.state, set = st.setAnimation;
  st.setAnimation = (i, name, loop) => { v.log.push(name); return set(i, name, loop); };
  v.sync({ x: 8, y: 9, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: 0, vx: 0 }, 0);
  return v;
}
let clock = 0;
const frames = (v, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) { clock += dt; v.update(dt, cam(), clock); } };

test('ESKILL_CLIPS: each clip is in its model, and is the ability\'s clip in the extracted binding', (t) => {
  for (const [id, row] of Object.entries(ESKILL_CLIPS)) {
    for (const [ability, clip] of Object.entries(row)) assert.ok(assets.enemies[id]?.spine?.animations?.[clip] > 0, `${id} ${ability}: ${clip} in its model`);
  }
  if (!existsSync(MODES)) return t.skip('no extracted enemy bindings');
  const modes = JSON.parse(readFileSync(MODES, 'utf8'));
  for (const [id, row] of Object.entries(ESKILL_CLIPS)) {
    for (const [ability, clip] of Object.entries(row)) assert.equal(modes[id]?.skills?.[ability.toLowerCase()]?.anim, clip, `${id} ${ability}`);
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

test('render/app.js hands each fx \'enemySkill\' to its view', () => {
  const app = readFileSync(path.join(ROOT, 'public/js/render/app.js'), 'utf8');
  assert.match(app, /if \(e\[1\] === 'enemySkill' && e\[4\] && typeof e\[4\]\.ability === 'string' && e\[4\]\.id != null\) views\.get\(e\[4\]\.id\)\?\.onEnemySkill\?\.\(e\[4\]\.ability, LATE\.get\(e\) \|\| 0\);/);
});
