// Local patch, battle side: enemy fixes kept out of the upstream content files so that merging upstream releases
// stays conflict-free. content/index.js loads this file as one more domain module (one line: DOMAIN_NAMES.push), so it
// runs wherever the sim runs — the server and the browser (client-run boss / hidden fields).
//
// “帝国的甲胄” (enemy_10027_vtsk, the 隐秘核心 假想敌：胄 escort), per PRTS “帝国的甲胄”:
//   出场 · 回忆里的誓死  "在全场范围内的1名当前生命值最高的我方单位所在位置创造一个持续5.85秒、碰撞范围3×3的弹道，弹道在延迟1.33秒后
//                      对碰撞范围内的1名当前生命值最高的我方单位造成攻击力100%的物理伤害，此后每0.53秒重复一次，最多命中8次"
//                      upstream (content/enemies.js KITS.enemy_10027_vtsk): all 8 hits in one tick 0.5 s after it appears.
//   蓄力 · 回忆里的怒守  "仅被阻挡时可触发" — a melee triple hit, 100 % ATK each. upstream: fires on the 15 s cooldown and
//                      turns the next attack into three hits even when that attack is the unblocked ranged one.
// How: an enemySpawn hook that runs before content/enemies.js's (priority 100) takes `Appear` / `MultiCombat` out of the
// enemy's ability record, so the upstream kit builds neither; the versions below are attached instead (its ranged ×0.8
// stays upstream's). When upstream fixes either skill, drop it here — test/local-patch.test.js pins upstream's current
// behaviour so a merge that changes it fails there. Expected upstream failure while this patch is in: the “帝国的甲胄”
// case of test/sim/feedback1f-liftoff.test.js (F3 review) counts all 8 barrage hits 1.5 s after the spawn.
//
// 假想敌：胄 死亡集群 vs 限伤: since 0.2.0 upstream's own (Battle.loseHp noHitLimit for the drone share, PR #209); our
// exemptDroneLink is gone.

//
// 圣堂剑士 (enemy_10087_hlchgr, 悬赏·特异II) — 赐我力量！ spends ammo. Official data: spData {maxSp 5, initSp 5, increment 0}
// (弹药上限：5, shown as its SP bar in bullet mode: prefab _showSpAsBulletMode), skill ForeverEnhance spCost 1 {atk_add 0.2,
// move_speed_add 0.2}, talent SkillTrigger {interval 6, max_stack_cnt 10}. Buff templates (zh_CN buff_template_data):
// hlchgr_t[skill_trigger] every `interval` s — while hlchgr_t[stack_mark] < max_stack_cnt — TriggerEnemySkill
// ForeverEnhance (_checkSkillReady: needs the bullet; interrupts the current ability, Skill clip); each cast adds 0.2 to
// the stored atk (AttributeModifier MULTIPLIER) and move_speed (start 1.0, FINAL_SCALER). PRTS 圣堂剑士: "每6s尝试触发
// 一次【赐我力量！】，最多成功触发10次 … 自身移动速度最终提升至(100%+增益层数×20%)；自身攻击力+(增益层数×20%)"; 不可被沉默.
// upstream (content/enemies.js KITS.enemy_10087_hlchgr): the same numbers on a plain 6 s timer, no ammo to see, no cast
// (it also enhances while stunned) and move speed as +20 % base each. Here: the upstream timer is taken out after
// enemies.js builds it (priority 99) and the ammo version attached; the bullets go to the snapshot as SP / SP max
// (`e.lpAmmo`, server/sim/snapshot.js unitTuple 1 line; render/units.js draws an enemy bar only when it has one).
// [ASSUMED] a trigger while stunned / frozen / asleep fails (no bullet, no count) — an enemy skill cannot start then.

import { abOf, attach, hurt, allTargets, areaAlliesInTiles, canCast, T } from './enemies.js';

export const VTSK = 'enemy_10027_vtsk';
/** 回忆里的誓死 (PRTS): first hit after 1.33 s, one every 0.53 s, the 3×3 弹道 lasts 5.85 s. */
export const BARRAGE_DELAY = 1.33, BARRAGE_STEP = 0.53, BARRAGE_LIFE = 5.85;

export function install(battle) {
  battle.on('enemySpawn', ({ enemy }) => { if (enemy && enemy.defId === VTSK) patchVtsk(battle, enemy); }, { priority: 101 });
  battle.on('enemySpawn', ({ enemy }) => { if (enemy && enemy.defId === HLCHGR) patchHlchgr(battle, enemy); }, { priority: 99 });
  // 深池暗影术师 / 队长 "不会攻击飞行单位" (PRTS 天赋; EN client prefab Attack/Trigger _targetMotion 1 = ground only, where
  // 控潮术师 / 萨卡兹王庭军精锐术师 have 3): the engine's candidate filter, as content/enemies.js noAirTargets (upstream
  // gives these two only kitRefraction). A 起飞 ally is already out of a ground enemy's reach (targeting.js evadesGround).
  battle.on('enemySpawn', ({ enemy }) => { if (enemy && NO_AIR_KEYS.includes(enemy.defId)) enemy.profile.canTarget = (u) => !u.isFlying; }, { priority: 99 });
  // per form (扎罗: M1 has no attack filter, M2 Attack/Trigger 1): ground only once the kit's setForm names that form
  battle.on('enemySpawn', ({ enemy: e }) => { const f = enemy0(e) && NO_AIR_FORMS[e.defId]; if (f) e.profile.canTarget = (u) => !(u.isFlying && e.form === f); }, { priority: 99 });
  // a kit that picks its own attack targets in 'before' (“灵幛” everyone in reach, the 胄 blades, …) bypasses the engine's
  // candidate filter: after content (priority 50) the swept enemies' targets are filtered again (an empty list = no attack)
  battle.on('beforeAttack', (c) => {
    const e = c.attacker;
    if (!enemy0(e) || !(NO_AIR_KEYS.includes(e.defId) || NO_AIR_FORMS[e.defId]) || typeof e.profile.canTarget !== 'function') return;
    c.targets = (c.targets || []).filter((t) => t && e.profile.canTarget(t));
  }, { priority: 49 });
  // skills whose client Trigger / Selector is _targetMotion 1: their target picks (enemies.js allTargets / targetsNear) skip a
  // flyer; an area their projectile then covers keeps its own client filter (鼠王 唱沙 / 沙狱, “自在” 纬地经天: collision 3)
  battle.on('enemySpawn', ({ enemy }) => { if (enemy && NO_AIR_PICKS.includes(enemy.defId)) enemy.lpGroundPicks = true; }, { priority: 99 });
}

export const HLCHGR = 'enemy_10087_hlchgr';
// + the 2026-10-06 sweep of every enemy prefab: normal-attack target filter _targetMotion 1 and PRTS 天赋 「不会攻击飞行单位」
// (烹泉 / 沏虹 「不可对空」) while upstream sets no rule — 隐形弩手(组长), 隐形术师, “庞贝”, 潜水员, 术师快艇, 无胄盟清扫小队, 烹泉,
// 沏虹, 家族(暗影)灭迹人, 萨卡兹百夫长, “自在”, “遗弃者”, “帝国的甲胄” (docs/LOCAL-PATCH.md for the cases left out). 假想敌：骨刺 and
// 斩胄之剑 / 破胄之锤 left the list 2026-10-09: upstream 0.2.2 grounds them itself (c250ff66, 977215e1 — their own target picks too)
export const NO_AIR_KEYS = Object.freeze(['enemy_1168_dumage', 'enemy_1168_dumage_2',
  'enemy_1019_jshoot', 'enemy_1019_jshoot_2', 'enemy_1023_jmage', 'enemy_1050_lslime', 'enemy_1158_divman', 'enemy_1162_magmot',
  'enemy_1183_mlasrt', 'enemy_1203_sfhu', 'enemy_1203_sfhu_2', 'enemy_1283_sgkill', 'enemy_1283_sgkill_2', 'enemy_1501_demonk', 'enemy_1517_xi',
  'enemy_2005_axetro', 'enemy_10027_vtsk',
  // user decision 「공식 클라이언트를 따라 막아」: client normal attack 1, PRTS silent (绯红歌伶, Dor-β号复制体, “灵幛”, 鼠王, W) or
  // mixed — 杰斯顿 (狱警 form Attack/Trigger 1; its 杀手 form is melee, so only a blocker), 主角/反派阵营角色 (Default 1; the
  // Shooting mode is not modelled)
  'enemy_2010_csdcr', 'enemy_1252_lysytb_2', 'enemy_1427_lrnazg', 'enemy_1509_mousek', 'enemy_1504_cqbw', 'enemy_1516_jakill',
  'enemy_10098_crhro', 'enemy_10099_crvln']);
export const NO_AIR_FORMS = Object.freeze({ enemy_1535_wlfmster: 'form2' });
// skill target picks, client _targetMotion 1: 鼠王 DriftSand / SandStorm / Mark Trigger, 杰斯顿 IronSandStorm Trigger (its
// stuns — PRTS 「禁锢装置/飞行单位以外」), “自在” CrossAttack / Mark Selector. Their area parts: enemies.js (“自在” 破桎而出 and
// “巨大的丑东西”'s 重生 bomb skip flyers there; 唱沙 / 沙狱 / 纬地经天 projectiles keep collision 3 — PRTS 「弹道可对空」)
export const NO_AIR_PICKS = Object.freeze(['enemy_1509_mousek', 'enemy_1516_jakill', 'enemy_1517_xi']);
const enemy0 = (e) => !!e && e.side === 'enemy' && !!e.profile;

/** After content/enemies.js (priority 100): replace its 6 s timer with the ammo skill. */
function patchHlchgr(b, e) {
  const ab = abOf(b, e);
  const sk = ab.sk.ForeverEnhance;
  if (!sk) return;
  ab.list = ab.list.filter((a) => !(a.tick && a.iv > 0 && !a.lpAmmo)); // upstream's only ability: the plain timer
  const sp = (e.def && e.def.raw && e.def.raw.sp) || {};
  const max = Math.max(1, Math.floor(Number(sp.maxSp) || 0));
  e.lpAmmo = { left: Math.min(max, Math.max(0, Math.floor(Number(sp.initSp ?? max) || 0))), max };
  attach(b, e, [foreverEnhance(ab, sk)]);
}

/** 赐我力量！: every SkillTrigger.interval s try one cast (≤ max_stack_cnt successes, 1 bullet each). */
function foreverEnhance(ab, sk) {
  const maxCasts = T(ab, 'SkillTrigger.max_stack_cnt') ?? Infinity;
  const cost = Math.max(0, sk.sp ?? 1);
  const atk0 = T(ab, 'AttributeStorage.atk') ?? 0, move0 = T(ab, 'AttributeStorage.move_speed') ?? 1;
  return {
    lpAmmo: true,
    iv: T(ab, 'SkillTrigger.interval') ?? 6,
    tick(b, e, a) {
      const n = a.n ?? 0;
      if (n >= maxCasts || !(e.lpAmmo.left >= cost) || !canCast(e, false)) return;
      e.lpAmmo.left -= cost;
      a.n = n + 1;
      e.skillAnimUntil = b.time + 0.5;
      b.addBuff(e, { key: 'ab:enhance', persist: true, mods: { atkPct: atk0 + a.n * (sk.bb.atk_add ?? 0), moveMul: move0 + a.n * (sk.bb.move_speed_add ?? 0) } });
    },
  };
}

function patchVtsk(b, e) {
  const ab = abOf(b, e);
  const ap = ab.sk.Appear, mc = ab.sk.MultiCombat;
  delete ab.sk.Appear;
  delete ab.sk.MultiCombat;
  attach(b, e, [ap && barrage(ap.bb.times ?? 0), mc && chargedTriple(mc)]);
}

/** 回忆里的誓死: one 3×3 zone on the highest-HP ally's tile; each pulse hits the highest-HP ally inside it, ≤ `times` hits. */
function barrage(times) {
  return {
    spawn(b, e) {
      const lock = allTargets(b, e).sort((p, q) => q.hp - p.hp)[0];
      if (!lock || !(times > 0)) return;
      const r = lock.tileR, c = lock.tileC;
      b.fx('telegraph', { x: lock.x, y: lock.y, r: 1, tiles: 'box', dur: BARRAGE_LIFE, kind: 'barrage', id: e.id });
      let hits = 0;
      for (let k = 0; BARRAGE_DELAY + k * BARRAGE_STEP <= BARRAGE_LIFE + 1e-9; k++) {
        b.after(BARRAGE_DELAY + k * BARRAGE_STEP, () => {
          // the zone goes with its source [ASSUMED: PRTS does not say whether the 弹道 outlives the enemy]
          if (!e.alive || hits >= times) return;
          const t = areaAlliesInTiles(b, e, r, c, 'box', 1).sort((p, q) => q.hp - p.hp)[0];
          if (!t) return;
          hits++;
          b.fx('explode', { x: t.x, y: t.y, r: 0.5, kind: 'barrage' });
          hurt(b, e, t, e.s.atk, 'phys');
        }, { owner: e });
      }
    },
  };
}

/** 回忆里的怒守: ready on the data cooldown, cast only while blocked; that melee attack lands as three 100 % hits. */
function chargedTriple(mc) {
  const n = mc.bb.times ?? 1;
  return {
    cd: mc.cd, icd: mc.icd,
    cond: (b, e) => !!e.blockedBy,
    fire(b, e, a) { a.ready = n; },
    dealt(c, b, e, a) {
      if (!(a.ready > 1) || c.target !== e.blockedBy) return;
      const m = a.ready;
      a.ready = 0;
      for (let i = 1; i < m; i++) hurt(b, e, c.target, e.s.atk, 'phys');
    },
  };
}
