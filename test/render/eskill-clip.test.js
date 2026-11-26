// test/render/eskill-clip.test.js — enemy abilities cast in a clip of their own (2026-11-12, docs/rules/fx.md 「규정 수배 카드 적」·
// 「규정 살카즈 후예 무리」): the sim's fx 'enemySkill' { id, ability } plays the ability's clip once (render/units.js ESKILL_CLIPS
// → SpineActor.chant), and the attacks meanwhile play no attack clip — 破城者's SkyProjectile fires its three missiles ('atk'
// uareapMissile) inside its one F_Skill (it played F_Attack for each); 萨卡兹子裔责罚者 / 惩戒者 strike StunAttack in Skill;
// “喷射罐”'s Flame — its normal attack, the ability its mode's `_attack` points at — is a three-part channel over the fx's `dur`,
// in the way it faces its target `tgt`, from the data's `attackAnim.chan` (tools/local-extract/attack_timing.py
// mode_channels; no hand table). A skill's three-part channel comes from the data (2026-11-15, docs/rules/sim.md 「투사체 채널 스킬은 채널 동안 시전이다」): the engine's cast
// (content/enemies.js castSkill) sends `dur` = the ability's time or `hold` (`_waitForAttachFinishEvent`, closed by the
// cast's 'enemySkillEnd'), the view plays `skillCast.*.chan` of the enemy's record.
// Real kits and real manifest entries, headless fake PIXI.

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

let fake, UnitView, ESKILL_CLIPS, faceWay;
before(async () => {
  fake = installFakePixi();
  ({ UnitView, ESKILL_CLIPS, faceWay } = await import('../../public/js/render/units.js'));
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
async function view(id, uid = 7, x = 8, y = 9, def = null) {
  const v = new UnitView(fakeViewCtx(fake.P, { assets: store(id), cam, lookupDef: () => def }), { id: uid, side: 'enemy', kind: 'enemy', defId: id, spine: id, tier: 1, x, y, maxHp: 1000, facing: -1 });
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
  const def = getData({ log: quiet, season: 'act3autochess' }).enemies[WINBOM];
  assert.equal(def.attackAnim?.chan?.ability, 'Flame', 'data: its normal attack is the Flame channel (attackAnim.chan, attack_timing.py mode_channels)');
  assert.ok(!ESKILL_CLIPS[WINBOM], 'no hand-table row: the view plays the data\'s channel');
  for (const [walls, pos, set] of [[[[10, 7]], [10, 6], 'Attack'], [[[9, 6]], [10, 6], 'Skill_Down']]) {
    const { h, e, rec } = field(WINBOM, walls, pos);
    h.runUntil(() => rec.some(([, x]) => x[0] === 'fx' && x[1] === 'enemySkill' && x[4]?.ability === 'Flame'), 12);
    const [t0, cast] = rec.find(([, x]) => x[0] === 'fx' && x[1] === 'enemySkill' && x[4]?.ability === 'Flame');
    assert.equal(cast[4].dur, 4, 'a 4 s channel');
    assert.ok(cast[4].tgt != null, 'the sim names its target');
    h.run(4.2);
    const tgt = h.allies().find((u) => u.id === cast[4].tgt);
    const v = await view(WINBOM, e.id, e.x, e.y, def);
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
  assert.match(app, /if \(e\[1\] === 'enemySkill' && e\[4\] && typeof e\[4\]\.ability === 'string' && e\[4\]\.id != null\) \{\n {10}const t = e\[4\]\.tgt != null \? views\.get\(e\[4\]\.tgt\) : null;\n {10}views\.get\(e\[4\]\.id\)\?\.onEnemySkill\?\.\(e\[4\]\.ability, LATE\.get\(e\) \|\| 0, \{ dur: Number\(e\[4\]\.dur\) \|\| 0, hold: !!e\[4\]\.hold, aim: t \? \{ x: t\.x, y: t\.y \} : null \}\);/);
});

test('“喷射罐”: the set follows its body direction — the target\'s FOUR_WAYS axis beyond 0.2 tiles, nearer the way it last walked (or last faced)', async () => {
  const WINBOM = 'enemy_1385_winbom';
  const def = getData({ log: quiet, season: 'act3autochess' }).enemies[WINBOM];
  const cast = async (walk, aim, uid) => {
    const v = await view(WINBOM, uid, 8, 9, def);
    if (walk) v.sync({ x: 8, y: 9, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: 0, vx: walk[0], vy: walk[1] }, 0);
    v.sync({ x: 8, y: 9, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: 0, vx: 0, vy: 0 }, 0);   // it stops, blocked
    assert.equal(v.onEnemySkill('Flame', 0, { dur: 4, aim: aim && { x: 8 + aim[0], y: 9 + aim[1] } }), true);
    return v;
  };
  assert.equal((await cast([0, -0.6], [0.1, 0], 21)).actor.current, 'Skill_Down_Begin', 'walked down, target 0.1 to its side: still down');
  assert.equal((await cast([0, 0.6], null, 22)).actor.current, 'Skill_Up_Begin', 'walked up, no target position: up');
  assert.equal((await cast([0.6, 0], [0, -0.15], 23)).actor.current, 'Attack_Begin', 'walked sideways, target 0.15 below: still the side set');
  assert.equal((await cast([0, -0.6], [0.5, 0], 24)).actor.current, 'Attack_Begin', 'walked down, target 0.5 to its side: it turns');
  assert.equal((await cast(null, [0.1, 0.1], 25)).actor.current, 'Attack_Begin', 'never walked: the side set');
  assert.equal((await cast(null, [0.3, 0.3], 26)).actor.current, 'Skill_Up_Begin', 'a diagonal tie takes UP (FOUR_WAYS order)');
  const v = await cast(null, [0, -0.5], 27);
  assert.equal(v.actor.current, 'Skill_Down_Begin');
  frames(v, 4.5);
  v.onEnemySkill('Flame', 0, { dur: 4, aim: { x: 8.05, y: 9 } });
  assert.equal(v.actor.current, 'Skill_Down_Begin', 'its next channel at a target within 0.2: the way its last cast faced');
});

/** The default season's field: still walls at (row, col) and enemy `key` at `pos`, every event logged with its battle time. */
function field2(key, walls, pos) {
  const D = getData({ log: quiet });
  const WALL = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e9, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    kind: 'normal', sharedBoss: null, enemies: [], defs: { chess: { t_wall: WALL }, enemies: { [key]: D.enemies[key] } },
    kits: { t_wall: () => ({ trait: { noAttack: true } }) },
    units: walls.map(([row, col], i) => ({ chessId: 't_wall', row, col, uid: i + 1 })),
  });
  h.step();
  const b = h.battle, ev0 = b._ev.bind(b), rec = [];
  b._ev = (e) => { rec.push([b.time, e]); return ev0(e); };
  const e = h.spawn(key, { pos, routeIndex: 0, mods: { speedMul: 0 }, tag: null });
  return { h, e, rec };
}

/** The sim's 'enemySkillEnd' of enemy `id`'s `ability` in log `rec` ([time, event]), or undefined. */
const endOf = (rec, id, ability) => rec.find(([, x]) => x[0] === 'fx' && x[1] === 'enemySkillEnd' && x[4]?.id === id && x[4]?.ability === ability);

test('节日爵士乐手 (real kit): 狂欢式演奏 is held — Skill_Begin → Skill_Loop until the cast ends as its 10.5 s channel does (\'enemySkillEnd\') → Skill_End; a silence ends it sooner', async () => {
  const JAZZ = 'enemy_10034_cnvsax';
  const D = getData({ log: quiet });
  const A = assets.enemies[JAZZ].spine.animations;
  const isCast = ([, x]) => x[0] === 'fx' && x[1] === 'enemySkill' && x[4]?.ability === 'fire';
  assert.deepEqual(D.enemies[JAZZ].skillCast.fire.chan, { begin: 'Skill_Begin', loop: 'Skill_Loop', end: 'Skill_End', wait: 1 }, 'the data\'s channel, `_waitForAttachFinishEvent`');
  // the full channel (blocked: revealed, it casts on its blocker)
  {
    const { h, e, rec } = field2(JAZZ, [[10, 5]], [10, 5]);
    h.runUntil(() => rec.some(isCast), 30);
    const [t0, cast] = rec.find(isCast);
    assert.equal(cast[4].hold, 1, 'held to its end');
    assert.equal(cast[4].dur, undefined, 'no length of the kit\'s');
    assert.equal(cast[4].tgt, h.allies()[0].id, 'its fire\'s target');
    h.runUntil(() => endOf(rec, e.id, 'fire'), 12);
    const [t1] = endOf(rec, e.id, 'fire');
    assert.ok(Math.abs(t1 - t0 - 10.5) < 0.1, `the cast ends with its 21 ticks × 0.5 s (${(t1 - t0).toFixed(3)} s)`);
    const v = await view(JAZZ, e.id, e.x, e.y, D.enemies[JAZZ]);
    assert.equal(v.onEnemySkill('fire', 0, { hold: true, aim: null }), true);
    assert.equal(v.actor.current, 'Skill_Begin');
    let at = t0;
    for (const [t, x] of rec.filter(([tt, x]) => tt >= t0 && tt < t1 && x[0] === 'atk' && x[1] === e.id)) {
      frames(v, t - at); at = t;
      v.onAttack(null, clock, x[3]);
    }
    frames(v, t1 - at);
    assert.deepEqual(v.log.slice(-2), ['Skill_Begin', 'queue Skill_Loop'], `the loop to the cast's end (${v.log.join(' ')})`);
    assert.equal(v.actor.mode, 'chant', 'still channelling');
    assert.equal(v.onEnemySkillEnd('fire'), true);
    assert.equal(v.actor.current, 'Skill_End', 'its end clip as the cast ends');
    frames(v, A.Skill_End + 0.05);
    assert.equal(v.actor.mode, 'base', 'back at rest');
    assert.ok(!v.log.includes('Attack'), 'no attack clip during the channel');
  }
  // a channel a silence ends 3 s in: its cast ends then ('enemySkillEnd' — the ability's own time, the attack interval, is
  // over by then)
  {
    const { h, e, rec } = field2(JAZZ, [[10, 5]], [10, 5]);
    h.runUntil(() => rec.some(isCast), 30);
    const [t0] = rec.find(isCast);
    h.run(3);
    h.battle.applyStatus(e, 'silence', { duration: 1 });
    h.run(1);
    const cut = endOf(rec, e.id, 'fire');
    assert.ok(cut && cut[0] - t0 < 4.5, 'the sim sends the early end');
    assert.equal(rec.filter(([, x]) => x[0] === 'fx' && x[1] === 'enemySkillEnd').length, 1, 'once');
    const v = await view(JAZZ, e.id + 100, e.x, e.y, D.enemies[JAZZ]);
    v.onEnemySkill('fire', 0, { hold: true, aim: null });
    frames(v, cut[0] - t0);
    assert.equal(v.actor.mode, 'chant');
    assert.equal(v.onEnemySkillEnd('fire'), true);
    assert.equal(v.actor.current, 'Skill_End', 'closes on its end clip');
    frames(v, A.Skill_End + 0.05);
    assert.equal(v.actor.mode, 'base', 'then rests');
    assert.equal(v.onEnemySkillEnd('fire'), false, 'a second end does nothing');
  }
});

test('萨卡兹王庭军精锐术师 (real kit): 死亡之眼 is held over its 8 s channel to the cast\'s end; its target falling ends it sooner', async () => {
  const DW = 'enemy_1275_dwlock_2';
  const D = getData({ log: quiet });
  const A = assets.enemies[DW].spine.animations;
  const isCast = ([, x]) => x[0] === 'fx' && x[1] === 'enemySkill' && x[4]?.ability === 'DeathEye';
  {
    const { h, e, rec } = field2(DW, [[10, 5]], [10, 5]);
    h.runUntil(() => rec.some(isCast), 40);
    const [t0, cast] = rec.find(isCast);
    assert.equal(cast[4].hold, 1, 'its LineAttack\'s channel waits for its attack-finish event');
    assert.equal(cast[4].tgt, h.allies()[0].id, 'its fire\'s target');
    h.runUntil(() => endOf(rec, e.id, 'DeathEye'), 10);
    const [t1] = endOf(rec, e.id, 'DeathEye');
    // LineAttack's `_preDelay` 0.6 s (its target on its own tile: no flight), then the 8 s link
    assert.ok(Math.abs(t1 - t0 - 8.6) < 0.1, `the cast ends with its 0.6 s pre-delay + 8 ticks × 1 s (${(t1 - t0).toFixed(3)} s)`);
    const v = await view(DW, e.id, e.x, e.y, D.enemies[DW]);
    assert.equal(v.onEnemySkill('DeathEye', 0, { hold: true, aim: null }), true);
    assert.equal(v.actor.current, 'Skill_Begin');
    frames(v, t1 - t0);
    assert.deepEqual(v.log.slice(-2), ['Skill_Begin', 'queue Skill_Loop'], 'the loop to the cast\'s end');
    assert.equal(v.onEnemySkillEnd('DeathEye'), true);
    assert.equal(v.actor.current, 'Skill_End');
    frames(v, A.Skill_End + 0.05);
    assert.equal(v.actor.mode, 'base', 'back at rest');
  }
  {
    const { h, e, rec } = field2(DW, [[10, 5]], [10, 5]);
    h.runUntil(() => rec.some(isCast), 40);
    const [t0, cast] = rec.find(isCast);
    h.run(2.5);
    h.battle.kill(h.allies().find((u) => u.id === cast[4].tgt), null);
    h.run(2);
    // the channel stops at its next 1 s tick; the cast then waits out what is left of the ability's own time (its attack
    // interval, 4 s — RangedAttack's post-delay) and ends: 'enemySkillEnd' then
    const cut = endOf(rec, e.id, 'DeathEye');
    assert.ok(cut && Math.abs(cut[0] - t0 - 4) < 0.1, `the sim sends the early end at the ability's 4 s (${cut && (cut[0] - t0).toFixed(3)})`);
  }
});

test('重弩突袭者 (real kit): CrossAttack plays the data\'s channel over its ability\'s 2.5 s (`_timeMode` 2) — the _Down / _Up set by the way it faces, no kit table', async () => {
  const KEY = 'enemy_1404_msnip';
  const D = getData({ log: quiet });
  const A = assets.enemies[KEY].spine.animations;
  assert.equal(ESKILL_CLIPS[KEY], undefined, 'not in the hand table');
  // a wall straight below it in its column (CrossTileRange: its row and column)
  const { h, e, rec } = field2(KEY, [[12, 5]], [10, 5]);
  const isCast = ([, x]) => x[0] === 'fx' && x[1] === 'enemySkill' && x[4]?.ability === 'CrossAttack';
  h.runUntil(() => rec.some(isCast), 40);
  const [, cast] = rec.find(isCast);
  assert.equal(cast[4].dur, 2.5, 'the ability\'s time');
  // (its fire names no `tgt`: render/fxgame.js would fly the skill's bolt from the cast's start — the kit shoots it 1.4 s
  // later; the view's set then follows the way it last walked, here given as its target's)
  assert.equal(cast[4].tgt, undefined);
  const tgt = h.allies()[0];
  const v = await view(KEY, e.id, e.x, e.y, D.enemies[KEY]);
  const way = { DOWN: 'Down', UP: 'Up' }[faceWay(tgt.x - e.x, tgt.y - e.y)];
  assert.ok(way, 'a target in its column: above or below');
  assert.equal(v.onEnemySkill('CrossAttack', 0, { dur: cast[4].dur, aim: { x: tgt.x, y: tgt.y } }), true);
  assert.equal(v.actor.current, `Skill_Begin_${way}`, `the ${way} set`);
  frames(v, 2.5 - A[`Skill_End_${way}`] + 0.05);
  assert.equal(v.actor.current, `Skill_End_${way}`, 'its end closes the 2.5 s');
  frames(v, A[`Skill_End_${way}`]);
  assert.equal(v.actor.mode, 'base');
  const w = await view(KEY, e.id + 1, e.x, e.y, null);
  assert.equal(w.onEnemySkill('CrossAttack', 0, { dur: 2.5 }), false, 'without its record nothing plays');
});

test('render/app.js hands each fx \'enemySkillEnd\' to its view', () => {
  const app = readFileSync(path.join(ROOT, 'public/js/render/app.js'), 'utf8');
  assert.match(app, /if \(e\[1\] === 'enemySkillEnd' && e\[4\] && typeof e\[4\]\.ability === 'string' && e\[4\]\.id != null\) views\.get\(e\[4\]\.id\)\?\.onEnemySkillEnd\?\.\(e\[4\]\.ability\);/);
});
