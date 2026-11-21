// Enemy skills, talents and their areas against a flying ally (the 炎佑 dragon; docs/rules/sim.md 「적 비행 유닛 공격 전수 조사」
// 스킬·재능 대조): the official prefab's selector or projectile collider `_targetMotion` 1 (ground only) keeps a flyer out.
// The cause stays hand-written — each kit picks its own units (areaAllies / alliesInRadius …) and has to leave the flyer out
// where the client does — so a sweep runs every enemy of both seasons next to a ground wall and a flyer with its normal
// attack held to the ground (the normal attack is the data `attackMotion` rule's, test/local-patch.test.js): what still reaches the
// flyer must be listed below with the official reason. The skills the probe does not set off have a case each.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';
import * as simPatch from '../../server/sim/content/local-patch.js';

const SEASONS = [[undefined, 'data/enemies.json'], ['act3autochess', 'data/seasons/act3autochess/enemies.json']];
const read = (f) => JSON.parse(fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
const RULE = 'docs/rules/sim.md 「적 비행 유닛 공격 전수 조사」 스킬·재능 대조';

const WALL = (id, blockCnt = 0) => chessRec({ id, profession: 'TANK', stats: { atk: 0, maxHp: 2e7, def: 0, res: 0, blockCnt }, rangeGrid: [[0, 0]], skill: null });
const quiet = () => ({ trait: { noAttack: true } });

/** A flat field with ground walls and one flyer (a flying ally deployed holds no ground: `ground` false, as 炎佑's). */
function field({ season, walls, flyer, extra = [], flat }) {
  const chess = {}, kits = {}, units = [];
  walls.forEach(([r, c, block], i) => { chess[`t_w${i}`] = WALL(`t_w${i}`, block ?? 0); kits[`t_w${i}`] = quiet; units.push({ chessId: `t_w${i}`, row: r, col: c }); });
  chess.t_fly = WALL('t_fly'); kits.t_fly = quiet; units.push({ chessId: 't_fly', row: flyer[0], col: flyer[1] });
  const h = makeBattle({
    season, content: 'generic', extraContent: [enemiesMod, bossesMod, simPatch, ...extra], seed: 7, autoFinish: false, timeLimit: 600,
    defs: { chess }, kits, units, ...(flat ? { flat } : {}),
  });
  h.step();
  const fly = h.unit('t_fly');
  fly.motion = 'FLY';
  fly.ground = false;
  assert.ok(fly.isFlying, 'the flyer flies');
  return { h, fly, walls: walls.map((_, i) => h.unit(`t_w${i}`)) };
}

/** What reached `u` from an enemy: damage, statuses and buffs. */
function watch(b, u) {
  const got = [];
  const dd = b.dealDamage.bind(b), as = b.applyStatus.bind(b), ab = b.addBuff.bind(b);
  b.dealDamage = (s, t, d) => { if (t === u && s && s.side === 'enemy') got.push(`dmg:${s.defId}`); return dd(s, t, d); };
  b.applyStatus = (t, k, o) => { if (t === u) got.push(`status:${k}`); return as(t, k, o); };
  b.addBuff = (t, x) => { if (t === u && x && !String(x.key).startsWith('trait:')) got.push(`buff:${x.key}`); return ab(t, x); };
  return got;
}

// enemy key → why a skill / talent / area of it reaches the flyer in the probe (the client's own filter takes flyers)
const SEL3 = (what) => `${what}: _targetMotion 3 in the prefab (any motion)`;
const REACHES = {
  enemy_1040_bombd: SEL3('暴鸰 Skills/Boomb/Trigger; projectile_bombd collides on 3'),
  enemy_1234_dsubrl: SEL3('深溟巢涌者 Talents/AOE TargetValidator'), enemy_1234_dsubrl_2: SEL3('Talents/AOE TargetValidator (as enemy_1234_dsubrl)'),
  enemy_1275_dwlock_2: SEL3('萨卡兹王庭军精锐术师 Skills/DeathEye/Trigger'),
  enemy_1321_wdarft: '枯朽萃聚使徒 never attacks (NeverTrigger); its 枯朽之种 (enemy_1269_nhfly) do — Trigger 3, projectile_enemy_nhfly has no collider and strikes its target',
  enemy_1373_ltnhor: SEL3('残党乐团圆号手 Skills/attackTwoTarget/Selector'), enemy_1373_ltnhor_2: SEL3('Skills/attackTwoTarget/Selector (as enemy_1373_ltnhor)'),
  enemy_1376_ltndru: '残党乐团鼓手 aoeAttack: selector 1 is only whom it faces, the damage is the buff enemy_ltndru[AOE]\'s AOEDamage on every motion',
  enemy_1376_ltndru_2: 'aoeAttack: as enemy_1376_ltndru',
  enemy_1509_mousek: '鼠王 唱沙 / 沙狱: their Triggers are 1 (NO_AIR_PICKS: the centre is ground), projectile_mousek_s1 / _s2 collide on 3 — a flyer in the 7-tile cross / the 3 × 3 box is hit',
  enemy_1513_dekght_2: SEL3('凋零骑士 Skill/TripleAttack/Trigger'),
  enemy_1517_xi: '“自在” 纬地经天: its Selector is 1 (NO_AIR_PICKS: the centre is ground), projectile_enemy_xi_s collides on 3 — a flyer on the cross line is hit',
  enemy_1525_blkswb: SEL3('锏 Skills/CircleAttack/Trigger'),
  enemy_2003_rockman: SEL3('迷路的巨像 Skills/StunAttack/Trigger'),
  enemy_2016_csphtm: SEL3('卢西恩 Skill/Aoe/Selector'), enemy_2017_csphts: SEL3('不祥幻影 Skills/Aoe/Selector'),
  enemy_2124_dyjsfg: '矩兽 尚同 (Talents/Trample): its template enemy_dyjsfg_t[aura] CreateBuffInRange with targetMotion ALL',
  enemy_9013_acstmk: '假想敌：胄 — 刺胄之弹\'s zone: projectile_enemy_acstmr_s1 MultiHitBehaviour targetMotion 3', enemy_9013_acstmk_2: 'as enemy_9013_acstmk',
  enemy_9021_acduml: '假想敌：管 shots: projectile_enemy_acduml, its attack selectors 3 (KillOther\'s selector 1 takes only 弦 enemy_9022_acdumm)',
  enemy_9021_acduml_2: 'as enemy_9021_acduml', enemy_9022_acdumm: SEL3('假想敌：弦 Attack selectors'),
  enemy_9033_acdeer: SEL3('“萨米的意志” Attack / Lasso / Doom selectors'),
  enemy_1042_frostd: SEL3('寒霜 Talents/atkSpeedDown TargetValidator'),
  enemy_1104_lfkght_3: SEL3('“左手”泰特斯·白杨 Skills/AtkDesWeaken selector'),
  enemy_2008_flking: '“墓碑”\'s halving is a map effect on every ally (PRTS “墓碑” ※), no selector',
  enemy_2048_smgrd: '“邪魔的利刃” 国度: the global buff rogue_3_blackfog[random_tile] (every motion) goes to the character on each fogged tile — the probe\'s flyer is one; 炎佑, an Enemy on our side, never gets it (enemies_bosses.test.js)',
  enemy_9029_acfnc_2: '冲击之械 laser (its 威光冲击 area): projectile_enemy_acfnca LaserHitBehaviour targetMotion 3',
  enemy_9034_acblk: SEL3('假想敌：影役 Talents/Aura TargetValidator'),
  enemy_9035_acspider_2: '假想敌：茧 悲惨之雨: selector 1 picks only the field, the rain takes every unit there (any motion, ignoreTargetFree)',
};

describe('enemy skills and areas vs a flying ally', () => {
  test(`sweep: what reaches the flyer, its normal attack held to the ground, is listed with the official reason (${RULE})`, () => {
    // the normal attack held to the ground: the engine's candidates and a kit's own 'before' picks (after content, as local-patch.js does)
    const hold = (key) => ({ install(b) {
      b.on('enemySpawn', ({ enemy }) => { if (enemy && enemy.defId === key) enemy.profile.canTarget = (u) => !u.isFlying; }, { priority: 98 });
      b.on('beforeAttack', (c) => { if (c.attacker && c.attacker.defId === key) c.targets = (c.targets || []).filter((t) => t && !t.isFlying); }, { priority: 48 });
    } });
    const reached = new Map(), unlisted = [];
    let ran = 0;
    for (const [season, file] of SEASONS) {
      for (const key of Object.keys(read(file))) {
        const { h, fly } = field({ season, walls: [[10, 6]], flyer: [10, 8], extra: [hold(key)] });
        const got = watch(h.b, fly);
        h.spawn(key, { pos: [10, 7], routeIndex: 0, mods: { speedMul: 0 } });
        h.run(40);
        ran++;
        if (!got.length) continue;
        reached.set(key, got);
        if (!REACHES[key]) unlisted.push(`${season ?? 'default'} ${key}: ${[...new Set(got)].join(', ')}`);
      }
    }
    assert.ok(ran > 500 && reached.has('enemy_2124_dyjsfg') && reached.has('enemy_9013_acstmk'), `the probe ran (${ran}) and a known all-motion talent reached the flyer`);
    assert.deepEqual(unlisted, [], `these reach a flying ally though they should not, unless the client's filter is 3 (then list the reason): ${RULE}`);
    const stale = Object.keys(REACHES).filter((k) => !reached.has(k));
    assert.deepEqual(stale, [], 'listed but no longer reaching the flyer: drop them');
  });

  test(`萨卡兹子裔责罚者 StunAttack (EnemyBlockerOrAdvancedSelector \`_targetMotion\` 1): its blocker and the ground units round it, never the flyer (${RULE})`, () => {
    const { h, fly, walls: [w] } = field({ season: 'act3autochess', walls: [[10, 7, 3], [11, 7]], flyer: [10, 8] });
    const got = watch(h.b, fly);
    h.spawn('enemy_1362_dfat', { pos: [10, 7], routeIndex: 0, mods: { speedMul: 0 } });   // on the wall's tile
    h.runUntil(() => h.eventsOf('fx').some((x) => x[1] === 'explode' && x[4]?.kind === 'dfatStun'), 30);
    assert.ok(w.s.flags.stun && h.unit('t_w1').s.flags.stun, 'the ground units round it are stunned');
    assert.deepEqual(got, [], 'the flyer beside it is not');
  });

  test(`孽罪奇美拉 OrigAura (TargetValidator \`targetMotion\` 1): the ground units in it, not the flyer (${RULE})`, () => {
    const { h, fly, walls: [w] } = field({ walls: [[10, 6]], flyer: [11, 7], flat: { rows: { 11: '##hrrriirrfrrrrrrrf##' } } });
    const got = watch(h.b, fly);
    const e = h.spawn('enemy_1425_lrcmra', { pos: [11, 6], routeIndex: 0, mods: { speedMul: 0 } });   // on 源石污染区: activated
    h.run(3);
    assert.equal(e.mode, 'Originium', 'activated');
    assert.ok(w.findBuff('ab:originium') && w.stats.taken > 0, 'the ground wall is in its aura');
    assert.deepEqual(got, [], 'the flyer is not');
    assert.ok(!fly.findBuff('ab:originium') && !(fly.stats.taken > 0), 'no aura buff, no damage on the flyer');
  });

  test(`咸鳞汁推荐者's barrel zone (projectile_enemy_wintun_range \`targetMotion\` 1): ground enemies only (${RULE})`, () => {
    const { h } = field({ walls: [[10, 7, 3]], flyer: [12, 12] });
    const e = h.spawn('enemy_10044_wintun', { pos: [10, 7], routeIndex: 0, mods: { speedMul: 0 } });
    const ground = h.spawn('enemy_1001_bigbo', { pos: [10, 8], routeIndex: 0, mods: { speedMul: 0 } });
    const air = h.spawn('enemy_1001_bigbo', { pos: [11, 7], routeIndex: 0, mods: { speedMul: 0 } });
    air.motion = 'FLY';
    assert.ok(air.isFlying && !ground.isFlying);
    h.runUntil(() => h.eventsOf('fx').some((x) => x[1] === 'zone' && x[4]?.kind === 'barrel'), 30);
    h.run(1);
    assert.ok(e.alive && ground.findBuff('ab:barrelZone'), 'the ground enemy beside it is buffed');
    assert.ok(!air.findBuff('ab:barrelZone'), 'the flying one is not');
  });

  test(`阿利斯泰尔 王权号令 (projectile_enemy_vtlionk_s1 HitBehaviour \`targetMotion\` 1): the plus strikes its ground units, a flyer only as the target (${RULE})`, () => {
    // the boss at (10,4), range 3.4: the wall at (10,7) is its only target in reach; the flyer at (10,8) is out of reach, in the plus
    const { h, fly, walls: [w] } = field({ walls: [[10, 7]], flyer: [10, 8] });
    const got = watch(h.b, fly);
    h.spawn('enemy_9032_aclionk', { pos: [10, 4], routeIndex: 0, mods: { speedMul: 0 } });
    h.runUntil(() => h.eventsOf('fx').some((x) => x[1] === 'telegraph' && x[4]?.kind === 'royalDecree'), 40);
    const t = h.eventsOf('fx').find((x) => x[1] === 'telegraph' && x[4]?.kind === 'royalDecree');
    assert.ok(t && t[2] === 7 && t[3] === 10, 'the decree centres on the wall');
    h.run(0.5);
    assert.ok(w.stats.taken > 0, 'the wall is struck');
    assert.deepEqual(got.filter((x) => x.startsWith('dmg:')), [], 'the flyer in the plus is not');
  });
});
