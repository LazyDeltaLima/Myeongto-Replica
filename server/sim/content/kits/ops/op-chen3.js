// server/sim/content/kits/ops/op-chen3.js — 赤刃明霄陈 (char_1050_chen3) 自选 operator kit — local patch: this fork's 선발
// kit (formerly kits/diy.js, docs/LOCAL-PATCH.md 「선발 오퍼레이터」) on upstream's 自选 framework; it replaces upstream's
// op-chen3.js (the owner's rule: where the two differ, ours wins). Kit contract: ../README.md ("How to add an operator
// (自选)"); `chess` = the composed 自选 record (shared/diy.js diyRecordOf), every number from it.
// fx kinds the client draws / sounds from (render/fxgame.js, audio.js kitHitKey): 'chen3Qi' { x, y, id, dir } (S3 剑气 path),
// 'kitHit' { k: 'chen3:s3' }, 'swordStorm' { id } (S2 slashes), 'teleport'.
//
// 赤刃明霄陈 (术战者) — 形意洞照 / 寒暑觉知; S1 赤霄·奔夜, S2 赤霄·绝影-驰, S3 赤霄·天喟
//
// Trait: arts damage (branch). 形意洞照: ATK +atk, ASPD +attack_speed, every damage of hers is 弱点伤害 (the less
// resisted of phys / arts — items/battle.js weaknessRetype; PRTS: "根据目标防御力和法术抗性变更伤害类型").
// 寒暑觉知: every stack_time s without taking damage she heals ATK × random(heal_atk_scale_min…max) % and holds one dodge
// of the next dodgeable physical / arts damage instance — any, not attacks only (BT chen3_t2[evade]: Evade
// PHYSICAL_AND_MAGICAL, _applyWayFilter ALL), rolled after her other dodges (LOW_PRIORITY; PRTS 闪避优先级 −1000: when S2's
// dodge wins, the held one is kept); damage taken restarts the clock, a dodge does not (chen3_t2 resets on
// ON_APPLIED_MODIFIER IsDamage only). Module: ASPD +8 while blocking nobody.
// S2 (PRTS 备注): a slash every 0.4 s; while slashing 无敌, no attack, 不可阻挡 (blocks nothing), 阻回 (no SP), stun / freeze
// immune (PF skchr_chen3_2 chen3_s2[invincible] abnormalImmunes [0, 16] [ASSUMED: 0 = stun, 16 = freeze], BT
// chen3_s2[ban_sp]) [not modelled: its 静默 (abnormalFlags 24) — her own skill is the one running]; a target that leaves
// the field — knocked out by anyone, removed, hidden [ASSUMED: BT chen3_s2[dead_listener] ON_OWNER_FINISH = every exit] —
// passes on to the nearest other enemy within 1.7 of it, else of her range, remaining slashes +1; at the end she
// 【移动】s to a standing, deployable target's tile; then — for the skill's whole `duration` (6 s) from the landing, the
// slashing time held (PF RespawnBuff chen3_s2[respawn_buff] durationKey duration; PRTS 「不包括斩击所耗时间」) — ATK
// +respawn_buff.atk and respawn_buff.prob phys / arts dodge.
// S3 剑气 (PRTS 备注): "剑气可对空，碰撞半径1.3，移动速度1.5，每次转向前对每个敌人仅判定一次伤害"; "在距离前进方向上的
// 侵入点/保护目标/高度类型为高地的地块的距离不低于0.25时，顺时针旋转90°". Current-HP hp_ratio arts (≥ projectile_min_atk_scale × ATK).
// It leaves as Skill_3_Begin ends, whether she attacks or not; the S3 mode three ticks later, before her first attack (s3Spec).
// (2026-10-06) — EN client battle/prefabs/[uc]projectiles.ab `projectile_chr_chen3_s3`:
//   movement: straight (_moveType 4) from her facing (_useSourceDirection), _speed 1.5; untimed (_lifeTimeType 2 — [inferred]:
//     other type-2 projectiles carry _lifeTime 0) and finished at the skill end by chen3_s3[finish_projectile]
//     (FinishManagedProjectiles, _managedBySource).
//   turning (ChangeStateWithHighlandBehaviour): _hitDistance 0.25, _hitEps 0.02, checks _checkHitHighland, _checkHitMapEdge,
//     _checkTileStart (侵入点), _checkTileEnd (保护目标) on the NEXT tile ahead (_CheckNextTile*, _GetDistanceToNextTile) →
//     _ChangeDirection, _clearTargetsAlreadyHitListWhenHit. Nothing else is an obstacle: lowland impassable tiles and
//     things standing on a tile (roadblocks) are not (client code _CheckHitConditions, RVA 0x96C610, 2026-10-10: outside
//     the map, heightType 1 (highland), TileTypesMask START 8 / END 4; every flag set in the prefab). It has no direction
//     field; clockwise is a client code constant (ChangeStateWithHighlandBehaviour._ChangeDirection: up → right → down → left, 2026-10-10;
//     PRTS "顺时针"). The distance is to the next tile's near edge ([inferred] from "_GetDistanceToNextTile" and PRTS), so it turns
//     0.25 past the centre of the last free tile — before 2026-10-06 we looked 0.75 ahead and turned 0.5 too early, counted
//     lowland impassable / blocked tiles and ignored 侵入点.
//   hits: CircleCollider2D radius 1.3 (_ignoreRangeScale), _hitPasserby every 0.03 s (_interval; the sim ticks 1/30 s),
//     ground + air, each enemy once until a turn clears the list (_canHitSameTargetMultipleTimes 0, _maxHitNum 9999).

import { DIRS, dirVec, normDir } from '../../../dir.js';
import { isHpLoss } from '../../../damage.js';
import { canTargetEnemy } from '../../../targeting.js';
import { weaknessRetype } from '../../items/battle.js';
import { talentBb } from '../shared/tier1.js';
import { hypot } from '../../../detmath.js';
import { TICK } from '../../../constants.js';

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const live = (u) => !!u && u.alive && u.deployed && !u.removed && !u.hidden;
/** An S2 target that left the field — dead, removed or hidden [ASSUMED: a hidden one counts as gone]. */
const gone = (e) => !e || !e.alive || e.removed || e.hidden;
const skillGridOf = (def) => (def?.skill?.rangeGrid?.length ? def.skill.rangeGrid : null);
const ANY = Object.freeze({ canHitFly: true });
const inRange = (battle, unit) => battle.enemiesInKeys(unit.rangeKeys || [], unit, ANY);
const dist = (a, b) => hypot(a.x - b.x, a.y - b.y);

const QI_SPEED = 1.5, QI_RADIUS = 1.3, QI_LOOK = 0.25, QI_EPS = 0.02, S2_INTERVAL = 0.4, S2_PASS_RADIUS = 1.7;
/**
 * S3: the begin clip (s after the cast). EN client skchr_chen3_3: `_playSkillBeginAnim` 1, `_beginAnim` Skill_3_Begin;
 * its abilities start only once the begin clip has played (client code BasicSkill.PlayBeginAnimation:
 * WaitForFixedSeconds(clip) → DoStartSkill). Her skeleton's Skill_3_Begin is 13 frames (0.433 s), no OnAttack event.
 * She does not attack meanwhile (S3_HOLD).
 */
const S3_BEGIN = 13 / 30;
/** S3's attack profile while the begin clip plays: no attack. */
const S3_HOLD = Object.freeze({ noAttack: true });

/**
 * One tick of the S3 剑气 (exported for tests). `st` = { x, y, d } (x = col, y = row, d ∈ UP/RIGHT/DOWN/LEFT) is updated in
 * place: turn 90° clockwise if the next tile ahead is an obstacle within QI_LOOK (+ QI_EPS), then move `dist`, stopping
 * on the QI_LOOK mark in front of an obstacle. At most one turn per tick: client code ChangeStateWithHighlandBehaviour.OnTick
 * (RVA 0x96C200) runs `_CheckHit` → `_ChangeDirection` once per tick, so a dead end (the tile ahead and the one to its
 * right both blocked) takes one 90° turn per tick. Returns the number of turns (0 or 1). `grid` needs inRect(r, c) and
 * tile(r, c).
 */
export function chen3QiAdvance(grid, st, dist) {
  const wall = (r, c) => {
    if (!grid.inRect(r, c)) return true;                                  // _checkHitMapEdge
    const t = grid.tile(r, c);
    return t.height === 'HIGH' || t.special === 'start' || t.special === 'end';  // highland / 侵入点 / 保护目标
  };
  const ahead = (d) => {
    const [dr, dc] = dirVec(d), r0 = Math.round(st.y), c0 = Math.round(st.x);
    const past = dr ? (st.y - r0) * dr : (st.x - c0) * dc;              // how far past the centre of its tile
    return { gap: 0.5 - past, wall: wall(r0 + dr, c0 + dc) };
  };
  let turns = 0;
  const front = ahead(st.d);
  if (front.wall && front.gap <= QI_LOOK + QI_EPS) { st.d = DIRS[(DIRS.indexOf(st.d) + 1) % 4]; turns = 1; }
  const a = ahead(st.d);
  const move = a.wall ? Math.max(0, Math.min(dist, a.gap - QI_LOOK)) : dist;
  const [dr, dc] = dirVec(st.d);
  st.x += dc * move; st.y += dr * move;
  return turns;
}

function chen3(bb, chess, def) {
  const t0 = talentBb(chess, 0), t1 = talentBb(chess, 1);
  const moduleAspd = num(chess?.trait?.bb?.attack_speed, 0);

  /** 剑气 of S3: a virtual mover (chen3QiAdvance), damage once per enemy per straight run. */
  const releaseQi = (battle, unit) => {
    const st = { x: unit.x, y: unit.y, d: normDir(unit.dir) };
    let hitSet = new Set();
    let steps = 0;
    const seq = unit.deploySeq;
    const minDmg = unit.s.atk * num(bb.projectile_min_atk_scale, 5.5), ratio = num(bb.hp_ratio, 0.06);
    const STEP = 1 / 30;   // the sim tick (constants.js TICK); the client hit interval is 0.03 s
    const job = battle.every(STEP, () => {
      if (unit.deploySeq !== seq || !unit.alive || !unit.skill?.active || unit.skill.id !== 'skchr_chen3_3') { job.cancel(); return; }
      const turned = chen3QiAdvance(battle.grid, st, QI_SPEED * STEP) > 0;
      if (turned) hitSet = new Set();   // _clearTargetsAlreadyHitListWhenHit: "每次转向前对每个敌人仅判定一次伤害"
      const { x, y, d } = st;
      // render/fxgame.js moves her official S3 trail along it: every 0.1 s and at once on a turn (re-aims the dragon)
      if (turned || steps % 3 === 0) battle.fx('chen3Qi', { x, y, id: unit.id, dir: d });
      if (++steps % 9 === 0) battle.fx('swordStorm', { x, y, r: 0.5 }); // procedural fallback (render/fx.js)
      // local patch: only selectable enemies (PRTS AOE判定 "每个可以被选中的敌人": no unrevealed 隐匿 / untargetable)
      let struck = false;
      for (const e of battle.foesInRadius(x, y, QI_RADIUS)) {
        if (!e.alive || hitSet.has(e.id)) continue;
        hitSet.add(e.id);
        struck = true;
        battle.dealDamage(unit, e, { amount: Math.max(minDmg, e.hp * ratio), type: 'arts', isSkill: true, tags: ['skill', 'chen3Qi'] });
      }
      if (struck) battle.fx('kitHit', { x, y, id: unit.id, k: 'chen3:s3' }); // local patch: its hit sound (projectile_chr_chen3_s3, audio.js)
    }, { owner: unit });
  };

  /**
   * S2: 10 slashes (+1 per target that leaves the field), passing on; then the 【移动】 and the buff. While slashing
   * (unit.mem.chen3Slashing): 无敌, no attack, 不可阻挡 (blocks nothing), 阻回 (no SP), stun / freeze immune (install), and
   * the skill's 6 s wait (onTick) — they start when she lands.
   */
  const slashes = (battle, unit) => {
    const seq = unit.deploySeq;
    const scale = num(bb.atk_scale, 4.3);
    const grid = skillGridOf(def);
    // local patch (audit 2026-10-06): unitsInGrid lists every enemy on the grid — only selectable ones (no unrevealed
    // 隐匿 / untargetable), as the range picks below (enemiesInKeys → canTargetEnemy)
    const keys = grid ? battle.unitsInGrid(unit, grid, { side: 'enemy' }).filter((e) => canTargetEnemy(unit, e, ANY)) : inRange(battle, unit);
    const first = keys.filter((e) => e.alive).sort((a, b) => dist(a, unit) - dist(b, unit))[0]
      || inRange(battle, unit).sort((a, b) => dist(a, unit) - dist(b, unit))[0];
    // local patch: cast on a 隐匿 enemy alone (the skill-range trigger ignores selectability) — wait for a selectable one
    if (!first) {
      if (unit.skill?.active && unit.skill.id === 'skchr_chen3_2') battle.after(0.2, () => { if (unit.deploySeq === seq && unit.skill?.active && unit.skill.id === 'skchr_chen3_2') slashes(battle, unit); }, { owner: unit });
      return;
    }
    // PF skchr_chen3_2 chen3_s2[invincible] / [skill_not_available], BT chen3_s2[ban_sp]: 无敌, 不可阻挡, 阻回, no attack
    battle.addBuff(unit, { key: 'chen3:s2:inv', duration: Infinity, flags: { invulnerable: true, disarm: true, noBlock: true, noSp: true } });
    battle.releaseBlocked?.(unit);
    unit.mem.chen3Slashing = true;
    // she vanishes while she slashes (skchr_chen3_2 `_animKey "Skill_2_Begin"`, `_endAnimKey "Skill_2_Disappear"`) and
    // comes back in mode S2Respawn (Born→Start_2): a model form (render/units.js FORMS)
    unit.form = 'vanish';
    battle.fx('chen3Vanish', { x: unit.x, y: unit.y, id: unit.id, form: 'vanish' });
    let target = first, left = 10;
    const step = () => {
      if (unit.deploySeq !== seq || !unit.alive) return;
      // BT chen3_s2[dead_listener] (ON_OWNER_FINISH): a target that left the field — knocked out by anyone, removed,
      // hidden [ASSUMED: OWNER_FINISH = every exit] — adds a slash (+0.4 s) and hands over to the nearest enemy around it
      if (gone(target)) {
        left++;
        const near = battle.foesInRadius(target.x, target.y, S2_PASS_RADIUS).filter((e) => !gone(e));
        target = (near.length ? near : inRange(battle, unit)).sort((a, b) => dist(a, unit) - dist(b, unit))[0] || target;
      }
      if (!gone(target) && left > 0) {
        left--;
        battle.fx('swordStorm', { x: target.x, y: target.y, id: unit.id, r: 0.6 });
        battle.dealDamage(unit, target, { amount: unit.s.atk * scale, type: 'arts', isSkill: true, tags: ['skill', 'chen3S2'] });
        battle.after(S2_INTERVAL, step, { owner: unit });
        return;
      }
      battle.removeBuff?.(unit, 'chen3:s2:inv');
      unit.mem.chen3Slashing = false;
      unit.form = null;
      battle.fx('chen3Respawn', { x: unit.x, y: unit.y, id: unit.id, form: null });
      // the 【移动】 to a standing target's tile (deployable for her, free)
      if (!gone(target) && !target.isFlying) {
        const r = Math.round(target.y), c = Math.round(target.x);
        if ((r !== unit.tileR || c !== unit.tileC) && battle.grid.canStand(r, c) && !battle.grid.isObstacle(r, c) && !battle.isReservedTile?.(r, c)) {
          const fromX = unit.x, fromY = unit.y;
          if (battle.moveRedeploy(unit, r, c)) battle.fx('teleport', { x: unit.x, y: unit.y, id: unit.id, fromX, fromY });
        }
      }
      // the skill's `duration` (6 s) starts now ("不包括斩击所耗时间"; PF RespawnBuff chen3_s2[respawn_buff] durationKey
      // duration): ATK + / dodge for all of it, lifted when the skill ends (onEnd)
      const sk = unit.skill;
      if (unit.alive && sk?.active && sk.id === 'skchr_chen3_2') {
        sk.timeLeft = Math.max(0.01, num(sk.duration, 6));
        const p = num(bb['chen3_s2[respawn_buff].prob'], 0.5);
        battle.addBuff(unit, { key: 'chen3:s2:after', duration: Infinity,
          mods: { atkPct: num(bb['chen3_s2[respawn_buff].atk'], 2.6), dodgePhys: p, dodgeArts: p } });
      }
    };
    step();
  };

  /**
   * S3 (the client's timing). skchr_chen3_3 is an AbilitySequenceGroup (`_alwaysNext` 1: CastToTarget casts the first
   * sub-ability at once, _OnSubAbilityFinished casts the next as soon as one ends; the group ends after the last) of two
   * ActiveBuffAbility: EmitProjectile (+ SimpleProjectileEmitter projectile_chr_chen3_s3, `_emitEvent` 2 = ON_CAST_START,
   * which AbilityStandard._DoCast raises before the pre-delay), then SwitchMode (`mode` 3 → Modes/S3: Body/Attack
   * Skill_3_Loop, the S3 attack blackboard `_attackBlackboardModeIndex` 3, the S3 range `_rangeIdModeIndex` 3). Both have
   * `_waitForCasting` 0, so ActiveBuffAbility's own OnWaitForPreDelay / OnWaitForPostDelay wait one fixed tick each and
   * never read their `_waitForAttackEvent` 1. The group starts when Skill_3_Begin has played (BasicSkill.PlayBeginAnimation
   * → DoStartSkill → SkillState → BasicSkill.Cast); SkillState keeps her from attacking until the mode switch.
   * chen3_s3[switch_mode]'s template is switch_mode_restart_fsm (Nodes.SwitchMode `_restartFSM` 1 at the buff's start and
   * end): Unit.SwitchMode attaches the S3 mode's own attack ability (Ability.DoAttach → Reset → its cooldown timer reset
   * without a first period: ready at once, whatever her Default attack's cooldown was) and Unit.OnSwitchMode restarts the
   * state machine — SkillState.OnExit interrupts the skill's cast and the machine starts in IDLE, its default state; the
   * next tick IdleState.OnTick finds a target and AttackState.OnEnter starts the swing. So: Skill_3_Begin (S3_BEGIN, no
   * attack) → the 剑气 leaves, facing her direction then, with or without a target → the S3 mode three ticks later
   * (EmitProjectile's pre- and post-delay ticks, SwitchMode's pre-delay tick), her attack cooldown cleared → her first
   * swing one tick after that, an S3 one (atk_scale 1.8, 3 hits, Skill_3_Loop, range 3-12). At the skill's end the same
   * template switches back with another restart: a swing in progress is cut and the Default attack is ready at once.
   * Official text 「技能开启时向前释放一道可转向的剑气」.
   * Ticks from the cast (client code): AutoChessBattleTrigger casts from its own coroutine, which the CoroutineSimulator
   * runs after the entities in BattleController.OnTick (SimulateTick); UseSkill → Character.SwitchToSkillState → SkillState.
   * OnEnter → BasicSkill.OnBeforeSkillStart starts PlayBeginAnimation (StartBattleCoroutine runs its first step at once,
   * but a coroutine started during SimulateTick is first resumed on the next tick); AsyncUtil.WaitForFixedSeconds yields
   * round(0.433 × 30) = 13 times → DoStartSkill calls SkillState._DoStartSkill on the 13th tick, and the 剑气 leaves in
   * that same call; EmitProjectile's pre-delay tick (14), post-delay tick (15), SwitchMode's pre-delay tick (16) → the S3
   * mode at tick 16 = S3_BEGIN + 3 ticks, the first swing at tick 17, as here. History: 49eb223e made both wait for her attacks (the wave for her first strike, the mode for
   * the one after); cdc84e33 sent the wave one tick after S3_BEGIN but kept the mode waiting for a Default attack, which
   * never came with enemies only in the S3 range; before 49eb223e the wave left at S3_BEGIN with the S3 mode from the
   * cast. The spec object is this unit's own (the kit is built per unit): `attack` / `targeting` change with the phase
   * and are put back when the skill ends.
   */
  function s3Spec() {
    const S3_ATTACK = { atkScale: num(bb['attack@atk_scale'], 1.8), hits: 3, maxTargets: Math.max(1, num(bb['attack@max_target'], 3)), groundOnly: true, canHitFly: false };
    const S3_TARGETING = { rangeGrid: skillGridOf(def), maxTargets: Math.max(1, num(bb['attack@max_target'], 3)), showOwnRange: true };
    // the state machine restart of switch_mode_restart_fsm: no swing in progress, the newly attached attack ready
    const restart = (unit) => { unit.swing = null; unit.castLeft = 0; unit.atkCd = 0; };
    // phases: 'begin' (Skill_3_Begin and the abilities after it: no attack) → 'mode' (the S3 mode, still no swing this
    // tick) → 'attack'; null = off: the static values (static tools, the next cast)
    const mode = (battle, unit, spec, phase) => {
      unit.mem.chen3S3 = phase;
      spec.attack = phase === 'begin' || phase === 'mode' ? S3_HOLD : S3_ATTACK;
      spec.targeting = S3_TARGETING;
      if (phase === 'mode') restart(unit);
      if (phase !== null) battle._refreshRange(unit);   // (the skill end's own range reset follows onEnd)
    };
    return {
      kind: 'duration',
      targeting: S3_TARGETING,
      attack: S3_ATTACK,
      onStart({ battle, unit, skill }) {
        const seq = unit.deploySeq, n = skill.activations;
        mode(battle, unit, skill.spec, 'begin');
        const same = () => unit.deploySeq === seq && unit.alive && unit.skill?.active && unit.skill === skill && skill.activations === n;
        battle.after(S3_BEGIN, () => { if (same()) releaseQi(battle, unit); }, { owner: unit });
        battle.after(S3_BEGIN + 3 * TICK, () => { if (same()) mode(battle, unit, skill.spec, 'mode'); }, { owner: unit });
        battle.after(S3_BEGIN + 4 * TICK, () => { if (same()) mode(battle, unit, skill.spec, 'attack'); }, { owner: unit });
      },
      onEnd({ unit, skill }) {
        if (unit.mem.chen3S3 === 'mode' || unit.mem.chen3S3 === 'attack') restart(unit);   // the switch back restarts too
        mode(null, unit, skill.spec, null);
      },
    };
  }

  return {
    install(battle, unit) {
      // S2: 眩晕 / 冻结 immunity while she slashes (PF chen3_s2[invincible] abnormalImmunes [0, 16] [ASSUMED: 0 = stun,
      // 16 = freeze — the enum names are native])
      battle.on('beforeStatus', (c) => {
        if (c.target === unit && unit.mem.chen3Slashing && (c.status === 'stun' || c.status === 'freeze')) c.cancel = true;
      }, { owner: unit });
    },
    skills: {
      // 赤霄·奔夜: ATK +atk, two hits, the struck enemies lose their special abilities until the skill ends (silence)
      skchr_chen3_1: {
        kind: 'duration', mods: { atkPct: num(bb.atk) },
        attack: {
          hits: 2,
          onEachHit({ battle, unit, target }) {
            if (target?.alive) battle.applyStatus(target, 'silence', { duration: Math.max(0.1, num(unit.skill?.timeLeft, 1)), source: unit });
          },
        },
      },
      // 赤霄·绝影-驰
      skchr_chen3_2: {
        kind: 'duration',
        onStart({ battle, unit }) { slashes(battle, unit); },
        // the 6 s wait while she slashes (onTick runs before the runtime counts `dt` down)
        onTick({ unit, skill, dt }) { if (unit.mem.chen3Slashing) skill.timeLeft = Math.max(0.01, num(skill.duration, 6)) + dt; },
        onEnd({ battle, unit }) {
          unit.mem.chen3Slashing = false;
          if (unit.form === 'vanish') unit.form = null;   // (ended while she slashed: the view ends it with the skill)
          battle.removeBuff?.(unit, 'chen3:s2:inv');
          battle.removeBuff?.(unit, 'chen3:s2:after');
        },
      },
      // 赤霄·天喟: the 剑气 + range 3-12, each attack ≤ max_target ground enemies × 3 hits at attack@atk_scale (the S3 mode)
      skchr_chen3_3: s3Spec(),
    },
    talents: [
      { install(battle, unit) { // 形意洞照
        battle.addBuff(unit, { key: 'chen3:t1', mods: { atkPct: num(t0.atk), aspd: num(t0.attack_speed) }, persist: true, allowDead: true });
        battle.on('hit', (c) => { if (c.source === unit && c.dmg && (c.dmg.type === 'phys' || c.dmg.type === 'arts')) weaknessRetype(c.dmg, unit, c.target); }, { owner: unit, priority: -10 });
      } },
      { install(battle, unit) { // 寒暑觉知
        const T = num(t1.stack_time, 7), lo = num(t1.heal_atk_scale_min, 30) / 100, hi = num(t1.heal_atk_scale_max, 160) / 100;
        let since = battle.time, dodge = false;
        battle.on('damaged', (c) => { if (c.target === unit && c.amount > 0 && !isHpLoss(c.dmg)) since = battle.time; }, { owner: unit });
        // the held dodge's status back after a redeploy took her buffs (its effect only: the dodge itself is `dodge`)
        battle.on('deploy', (c) => { if (c.unit === unit && dodge) battle.addBuff(unit, { key: 'chen3:evade', visible: true }); }, { owner: unit });
        // the held dodge (BT chen3_t2[evade]: Evade PHYSICAL_AND_MAGICAL, _applyWayFilter ALL, LOW_PRIORITY): any dodgeable
        // physical / arts damage instance, after her other dodges (PRTS 闪避优先级 −1000 — S2's 50 % is rolled first and,
        // when it dodges, the held one is kept). A dodge lands no damage: the counter goes on (chen3_t2 resets on
        // ON_APPLIED_MODIFIER IsDamage only).
        battle.on('hit', (c) => {
          const d = c.dmg;
          if (c.target !== unit || !dodge || !d || d.cancel || !d.canDodge || (d.type !== 'phys' && d.type !== 'arts')) return;
          const p = d.type === 'phys' ? unit.s.dodgePhys : unit.s.dodgeArts;
          if (!(p > 0 && battle.rng() < p)) { dodge = false; battle.removeBuff(unit, 'chen3:evade'); }
          d.cancel = true;
          battle.fx('dodge', { x: unit.x, y: unit.y, id: unit.id });
          battle.emit('dodge', { source: c.credit ?? c.source, target: unit, dmg: d });
        }, { owner: unit, priority: -1000 });
        battle.every(0.2, () => {
          if (!live(unit) || battle.time - since < T) return;
          since = battle.time;
          battle.heal(unit, unit, unit.s.atk * (lo + battle.rng() * (hi - lo)), { self: true });
          dodge = true;
          // chen3_t2[evade]'s effect while held (render/fxstatus.js KEY_FX) and the moment's two (render/fx/kitofficial.js)
          battle.addBuff(unit, { key: 'chen3:evade', visible: true });
          battle.fx('evadeReady', { x: unit.x, y: unit.y, id: unit.id });
        }, { owner: unit });
      } },
      { install(battle, unit) { // module trait: ASPD while blocking nobody
        if (!moduleAspd) return;
        battle.every(0.25, () => {
          if (!live(unit)) return;
          const want = !(unit.blocking && unit.blocking.length);
          const has = unit.buffs.some((b) => b.key === 'chen3:mod');
          if (want && !has) battle.addBuff(unit, { key: 'chen3:mod', duration: Infinity, mods: { aspd: moduleAspd } });
          else if (!want && has) battle.removeBuff?.(unit, 'chen3:mod');
        }, { owner: unit });
      } },
    ],
  };
}

export default {
  char_1050_chen3: (bb, chess, def) => chen3(bb, chess, def),
};
