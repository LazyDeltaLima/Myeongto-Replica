// server/sim/content/enemies/critic.js — CRITIC 精锐 kits of 卫戍协议：规程 (factions.json type CRITIC, a new type of 规程) and
// the escorts their entries bring (factions.json entries[*].N / E): main-story enemies, every prefab in the EN client
// (battle/enm_pfb_9 / _10 / _15 / _16). Their part of KITS.
//
// The type itself carries no rule of its own: activity_table's enemyInfoDict CRITIC is the handbook's list of the type's
// enemies, and none of the kits below reads the type.

import { canTargetAlly, areaSelectable } from '../../targeting.js';
import { ALLY_COLLIDER_RADIUS } from '../../constants.js';
import { T, hurt, areaAllies, lineShot, shoot, atCastEvent, mode, setForm, targetsNear, byPriority } from './helpers.js';
import { unbalancedBleed, skill } from './archetypes.js';
import { hypot } from '../../detmath.js';

// ---------------------------------------------------------------------------------------------------------------
// constants (numbers that exist nowhere in the data)

/**
 * 冰原卫法者 / 冰原御法者's knock-out blast, projectile_enemy_krgrg (battle/prefabs/[uc]projectiles): its CircleCollider2D
 * radius, and its LIMITED `_lifeTime` — no movement, `_alwaysReachInTheEnd` with `_onlyCheckHitWhenReachTarget`, so it
 * strikes as its life ends (docs/rules/sim.md 「오퍼레이터 투사체」: the same reading as 迷迭香 S2's shell). The data's
 * talentProj.Boom.life is the same 1.2.
 */
const KRGRG_BLAST_RADIUS = 1.65, KRGRG_BLAST_DELAY = 1.2;

/**
 * The later OnAttack events of 马特奥的近卫's CrossBomb clip (Skill_1 / _Down / _Up: 1.867, 2.033, 2.233 s — data/assets.json
 * `hits`, from its skeleton): its MultiRangedAttack waits for an event for every shot (`_waitAttackEventForAllAttacks`), and
 * the blackboard `times` 2 makes it 2 shots (MultiRangedAttack.DoSetData: additional = times − 1) — the first at the
 * clip's first event (`skillCast.hit`), the second at this one.
 */
const BDGUAD_SECOND_BOMB = 2.033;
/** A bomb's touch radius: projectile_enemy_bdguad / projectile_enemy_boomer, BoomerHitBehaviour's selectors (CircleRange 0.3). */
const BOMB_TOUCH = 0.3;

// ---------------------------------------------------------------------------------------------------------------
// shared pieces

/**
 * Units of both sides within `r` of (x, y) a projectile of `src` with HitBehaviour `targetSide` 3 (SideType
 * BOTH_ALLY_AND_ENEMY) and `targetMotion` 1 (ground) strikes: the allies an area effect of `src` selects (areaAllies,
 * ground ones), and the other enemies on the ground there — no untargetable one (a 重生 in progress).
 * [추정·미조사: whether a same-side selection skips a 隐匿 or 无敌 enemy; here only 无法选中 does]
 */
function bothSidesAt(b, src, x, y, r) {
  const allies = areaAllies(b, src, x, y, r).filter((u) => !u.isFlying);
  const foes = b.enemiesInRadius(x, y, r).filter((o) => o !== src && !o.isFlying && !o.s.flags.untargetable);
  return [...allies, ...foes];
}

/**
 * The allies a 直击 of enemy `e` can aim at: the client's CrossTileRange (every tile of the enemy's own row and column, no
 * distance — CrossTileRange.CheckTargetIn: the selector's grid row or column) through AdvancedSelectorWithTrapSheltr
 * `_checkOnTheSameLine` with the prefab's offsets X −0.5…0.5 / Y −0.5…0.1 (the candidate's position minus the target's,
 * within either — as 重弩突袭者's, content/enemies/invisible.js kitCrossbow), every motion; nearest first.
 */
function crossTargets(b, e) {
  const r = Math.round(e.y), c = Math.round(e.x);
  const between = (v, lo, hi) => v > lo - 1e-9 && v < hi + 1e-9;
  return b.allies().filter((u) => canTargetAlly(e, u, true) && (u.tileR === r || u.tileC === c)
    && (between(e.x - u.x, -0.5, 0.5) || between(e.y - u.y, -0.5, 0.1)))
    .sort((p, q) => hypot(p.x - e.x, p.y - e.y) - hypot(q.x - e.x, q.y - e.y) || p.id - q.id);
}

/**
 * One FIXED_DIRECTION shot of `e` at `t` (its position when the shot leaves, the aimed spot once it is gone —
 * `_emitToInputPosWhenTargetIsInvalid`), along the nearest map axis (helpers.js lineShot); `onHit(u)` on the first ally it
 * touches.
 */
function crossShot(b, e, t, aim, proj, onHit, radius = undefined) {
  const at = t && t.alive && t.deployed ? { x: t.x, y: t.y } : aim;
  return lineShot(b, e, at, proj, (u) => { if (u && u.alive) onHit(u); }, { source: e, ...(radius != null ? { radius } : {}) });
}

/** A bomb's blast where it touched `u`: physical ATK × `scale` on the allies within `r` of it (BoomerHitBehaviour). */
function bombBlast(b, e, u, r, scale, atk = e.s.atk) {
  const x = u.x, y = u.y;
  b.fx('explode', { x, y, r, kind: 'bomb', id: e.id });
  for (const o of areaAllies(b, e, x, y, r)) hurt(b, e, o, atk * scale, 'phys', { tags: ['splash'] });
}

// ---------------------------------------------------------------------------------------------------------------
// kits

/**
 * 冰原卫法者 / 冰原御法者 (enm_pfb_9). Talents/Boom: a BslimeTalent_1 whose buff krgrg_t_boom (projectile_on_killed: on its
 * knock-out, not while 沉默 — the handbook line is SILENCE) emits projectile_enemy_krgrg where it fell; KRGRG_BLAST_DELAY s
 * later every ground unit of both sides within KRGRG_BLAST_RADIUS takes its ATK × `boom.atk_scale` as arts (the projectile's
 * AdvancedApplyDamage MAGICAL, SPLASH) and `boom.cold` s of 寒冷 (its buff enemy_krgrg_boom: e2c_cold on an operator, c2e_cold
 * on an enemy — the second cold of an enemy freezes it, Battle.applyStatus). Talents/unbalanced_bleed: unbalancedBleed.
 * The battle waits for the blast.
 */
function kitIceGuard(ab) {
  const scale = T(ab, 'boom.atk_scale') ?? 0, cold = T(ab, 'boom.cold') ?? 0;
  return [{
    sil: true,
    death(c, b, e) {
      if (c.reason !== 'killed') return;
      const x = e.x, y = e.y, atk = e.s.atk;
      // the projectile appears where it fell (its `_effectsToTargetWhenStart`), the blast is its end
      b.fx('telegraph', { x, y, r: KRGRG_BLAST_RADIUS, dur: KRGRG_BLAST_DELAY, kind: 'deathBoom', id: e.id, ability: 'Boom' });
      b.after(KRGRG_BLAST_DELAY, () => {
        b.fx('explode', { x, y, r: KRGRG_BLAST_RADIUS, kind: 'deathBoom', id: e.id, ability: 'Boom' });
        for (const u of bothSidesAt(b, e, x, y, KRGRG_BLAST_RADIUS)) {
          if (scale > 0) hurt(b, e, u, atk * scale, 'arts', { tags: ['splash'] });
          if (cold > 0 && u.alive) b.applyStatus(u, 'cold', { duration: cold, source: e });
        }
      }, { holdsBattle: true });
    },
  }, ...unbalancedBleed(ab)];
}

/**
 * 战线推进者 (enm_pfb_16). Talents/DmgUp (enemy_chghmr_t) gives it the mark enemy_chghmr_damage_up[mark] as it spawns and
 * again whenever its block ends without it (ON_OWNER_BLOCKEE_CHANGED, not blocked). Skills/PowerHit (SILENCE line; EnemySkill
 * `_familyMask` 3, its trigger a self selector that needs the mark): a MeleeAttack on its target — with no range, its
 * blocker; none, no cast — in its own clip (Skill,
 * `skillCast`), its ATK × (1 + `atk`) while it casts (BuffToOwnerDuringAbility, ATK MULTIPLIER), and the mark spent at the
 * clip's event (ActionToOwner on the attack event) — so its first attack each time it is blocked. The talent's
 * `sheltr_atk_scale` is against 掩体 (trap_sheltr), which no 规程 field has.
 */
function kitLinePusher(ab) {
  const s = ab.sk.PowerHit, up = (s && s.bb.atk) ?? 0;
  const BUFF = 'ab:chghmrPower', MARK = 'ab:chghmrMark';
  const P = { mark: true, was: false };
  // the mark is a buff of its own, enemy_chghmr_damage_up[mark] (its effect enemy_chghmr_buff while it lasts)
  const setMark = (b, e, on) => {
    P.mark = on;
    if (on) b.addBuff(e, { key: MARK, persist: true, visible: true, fxTag: 'buff:enemy_chghmr_damage_up[mark]' });
    else b.removeBuff(e, MARK);
  };
  return [{
    spawn(b, e) { setMark(b, e, true); },
    tick(b, e) {
      const now = !!e.blockedBy;
      if (P.was && !now && !P.mark) setMark(b, e, true);
      P.was = now;
    },
  }, s ? {
    ...skill(s, (b, e) => {
      const t = e.blockedBy;
      if (up) b.addBuff(e, { key: BUFF, persist: true, mods: { atkPct: up } });
      atCastEvent(b, e, s, () => {
        if (t && t.alive && t.deployed) hurt(b, e, t, e.s.atk * (s.bb.atk_scale ?? 1), 'phys');
        setMark(b, e, false);
        b.removeBuff(e, BUFF);
      });
    }, { sil: true, cond: (b, e) => P.mark && !!e.blockedBy }),
    onCut(b, e) { b.removeBuff(e, BUFF); },
  } : null];
}

/**
 * 速射轻弩手 / 速射劲弩手 (enm_pfb_16). Skills/CrossAttack (SILENCE line; ATTACK family — never begun while blocked): on the
 * nearest ally in its 直击 cross (crossTargets) a MultiRangedAttack of 1 + `_additionalTimes` 2 = 3 bolts (no blackboard
 * `times`), the first at its clip's event (`skillCast.hit`), the others `_triggerDelta` 0.1 s apart; each its official
 * projectile_enemy_gunsho (FIXED_DIRECTION, as 重弩突袭者's: the first ally it touches) for physical ATK × `atk_scale`.
 * [추정·미조사: the bolts leave from its centre, not its MUZZLE point]
 */
function kitRapidCrossbow(ab) {
  const s = ab.sk.CrossAttack, n = 3, step = 0.1;
  if (!s) return [];
  return [skill(s, (b, e) => {
    const t = crossTargets(b, e)[0];
    if (!t) return;
    const aim = { x: t.x, y: t.y };
    const hit = s.cast && Number.isFinite(s.cast.hit) ? s.cast.hit : 0;
    for (let i = 0; i < n; i++) {
      atCastEvent(b, e, s, () => crossShot(b, e, t, aim, s.proj, (u) => hurt(b, e, u, e.s.atk * (s.bb.atk_scale ?? 1), 'phys')), hit + i * step);
    }
  }, { sil: true, cond: (b, e) => crossTargets(b, e).length > 0 })];
}

/**
 * 马特奥的近卫 (enm_pfb_16). Skills/CrossBomb (SILENCE line; ATTACK family, cooldown 10 / 2): on the nearest ally in its 直击
 * cross 2 bombs (blackboard `times`) at its clip's events (BDGUAD_SECOND_BOMB), each projectile_enemy_bdguad (FIXED_DIRECTION,
 * BoomerHitBehaviour: it bursts on the first ally it touches) for physical ATK × `atk_scale` on the allies within
 * `projectile_range` of that spot. Talents/DmgResist: while unblocked (BlockedToggleChecker) physical and arts damage taken
 * × (1 − `DmgResist.damage_resistance`) (damage_resistance[inf]).
 * [추정·미조사: the bombs leave from its centre, not its MUZZLE points; the blast is centred on the ally touched]
 */
function kitMatteoGuard(ab) {
  const s = ab.sk.CrossBomb, cut = 1 - (T(ab, 'DmgResist.damage_resistance') ?? 0);
  const out = [{
    tick(b, e, a) {
      const on = !e.blockedBy && cut !== 1;
      if (on === !!a.on) return;
      a.on = on;
      if (on) b.addBuff(e, { key: 'ab:bdguadResist', persist: true, mods: { physTakenMul: cut, artsTakenMul: cut } });
      else b.removeBuff(e, 'ab:bdguadResist');
    },
  }];
  if (s) {
    const r = s.bb.projectile_range ?? 1, scale = s.bb.atk_scale ?? 1;
    const hit = s.cast && Number.isFinite(s.cast.hit) ? s.cast.hit : 0;
    const times = [hit, BDGUAD_SECOND_BOMB].slice(0, Math.max(1, s.bb.times ?? 1));
    out.push(skill(s, (b, e) => {
      const t = crossTargets(b, e)[0];
      if (!t) return;
      const aim = { x: t.x, y: t.y };
      for (const at of times) atCastEvent(b, e, s, () => crossShot(b, e, t, aim, s.proj, (u) => bombBlast(b, e, u, r, scale), BOMB_TOUCH), at);
    }, { sil: true, cond: (b, e) => crossTargets(b, e).length > 0 }));
  }
  return out;
}

/**
 * 无畏掷弹兵 (enm_pfb_16). Its first damage taken while unblocked and not 沉默 (enemy_boomer_skill_trigger, ON_TAKE_DAMAGE)
 * switches it to the mode D2L (the state machine restarted): there Skills/Bomb (AlwaysTrigger, once, `_ignoreSilence`) casts
 * its clip (Skill_1) and at the event throws projectile_enemy_boomer 4 ways — right, up, left, down (NoTargetRangedAttack
 * `_projectileNum` 4 over 270°) —, each bursting on the first ally it touches for physical ATK × `atk_scale` within
 * `projectile_range`; the cast over (enemy_boomer_switch2light), the mode Light: move speed + `Light.move_speed` and weight
 * + `Light.mass_level` (both ADDITION), its own melee attack.
 * [추정·미조사: the blast is centred on the ally touched]
 */
function kitGrenadier(ab) {
  const s = ab.sk.Bomb;
  const ms = T(ab, 'Light.move_speed') ?? 0, mass = T(ab, 'Light.mass_level') ?? 0;
  const light = (b, e) => {
    if (e.mode === 'Light') return;
    mode(b, e, 'Light', false);
    setForm(b, e, 'Light');   // the view's clips and effects of the mode (fx 'phase')
    b.addBuff(e, { key: 'ab:boomerLight', persist: true, mods: { moveFlat: ms, massFlat: mass } });
  };
  const trigger = {
    sil: true,
    taken(c, b, e, a) {
      if (a.done || e.blockedBy || !e.alive) return;
      a.done = true;
      mode(b, e, 'D2L', true);
    },
  };
  if (!s) return [trigger];
  const r = s.bb.projectile_range ?? 1, scale = s.bb.atk_scale ?? 1;
  return [trigger, {
    ...skill(s, (b, e, a) => {
      a.fired = true;
      atCastEvent(b, e, s, () => {
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          lineShot(b, e, { x: e.x + dx, y: e.y + dy }, s.proj, (u) => { if (u && u.alive) bombBlast(b, e, u, r, scale); }, { source: e, radius: BOMB_TOUCH });
        }
      });
      const c = s.cast, end = c && c.dur > 0 ? c.dur : 0;
      b.after(end, () => { if (e.alive) light(b, e); }, { owner: e });
    }, { cond: (b, e, a) => e.mode === 'D2L' && !a.fired }),
    onCut(b, e) { if (e.alive) light(b, e); },
  }];
}

/** The 寻路者 trio's second prefab mode, the one their ammo turns on (enm_pfb_9 / _10 `Modes/HeadShot`). */
const HEAD = 'HeadShot';

/**
 * Half the side of 寻路者破阵者's shell box: projectile_enemy_cansld's BoxCollider2D 3 × 3 (battle/prefabs/[uc]projectiles),
 * its HitBehaviour taking every ally (`targetMotion` 3: ground and air, `_ignoreCamouflage`) whose collider meets the box
 * as the shell arrives (`_onlyCheckHitWhenReachTarget`).
 */
const CANSLD_BOX = 1.5;

/**
 * Enemy `e` is in its attack state, as the client's CheckUnitInAttackState reads it: a swing or a cast plays, or its
 * cooldown runs with a target still in reach (the attack state waits there for the next attack — ai.js enemyAttack's
 * reach: rangeRadius + an ally's collider; its blocker when it is blocked).
 */
function inAttackState(b, e) {
  if (e.swing || e.castLeft > 0) return true;
  if (!(e.atkCd > 0)) return false;
  if (e.blockedBy) return true;
  const r = e.profile.melee ? 0 : e.base.rangeRadius;
  return r > 0 && targetsNear(b, e, r + ALLY_COLLIDER_RADIUS).length > 0;
}

/**
 * The 寻路者 trio (CRITIC, enm_pfb_9 / _10): ammo as SP (enemy_database spData INCREASE_WITH_TIME with no increment: the
 * initial `initSp`, never refilled in this mode — the HUD shows it as bullets, `_showSpAsBulletMode`), two prefab modes,
 * Default and HeadShot, and the talent ShotBuff's buffs that move between them:
 * - enemy_spmode_check (every one), ON_BEFORE_ATTACK: with SP ≥ 1 in the first mode it switches to HeadShot, with less in
 *   HeadShot back to the first — no state restart, so the attack it comes before is still the old mode's and the next
 *   follows it at once (docs/rules/sim.md 「적의 모드 전환」: Enemy.CombatWrapper._DoCast). Run here as that attack is made
 *   (the 'attack' hook), on the SP it began with: the same switch, the same attack in the old mode.
 * - enemy_melee_and_ranged_spmode_check (`idle`: 破阵者, 传令兵), every 0.1 s while unblocked and not in its attack state
 *   (inAttackState): SP ≥ 1 in the first mode → HeadShot, less in HeadShot → the first — so an unblocked one with ammo
 *   shoots at once, and one out of ammo with nobody in reach walks on in its first mode.
 * HeadShot's attack ability (`blackboardPrefix` headshot_: ATK × `shotbuff.attack@headshot_atk_scale`) fires its own
 * projectile (data projModes.HeadShot) and spends `headshot_sp` (−1) at its attack event (BuffToOwner enemy_spmode_sp_reduce,
 * ModifySp); the attack is made by the engine and hit here (profile.deferHit while in HeadShot, so its swing and
 * attack events carry no engine shot: the fx 'enemyShot' draws the official one). `meleeDefault`: the first mode has only a
 * `_combat` MeleeAttack — its blocker alone (破阵者, 传令兵); 狙击手's first mode shoots plain shots and fights its blocker
 * in melee (`Attack_2`). `hit(b, e, t, x, y)`: HeadShot's effect where the shot lands. The `headshot_trapdamage` fixed arts
 * damage of 破阵者 / 传令兵 is on traps tagged TAG_TRAP_WPNSTS (冰淇淋机) only, which no 规程 field has.
 */
function pathfinder(ab, e, { meleeDefault = false, idle = false, hit, pick = null }) {
  const spd = (e.def.raw && e.def.raw.sp) || {};
  const init = Math.max(0, Number.isFinite(spd.initSp) ? spd.initSp : 1);
  const cost = -(T(ab, 'shotbuff.attack@headshot_sp') ?? -1);
  const shot = (e.def.projModes && e.def.projModes[HEAD]) || null;
  const set = (b, e2, on) => {
    if ((e2.mode === HEAD) === on) return;
    mode(b, e2, on ? HEAD : null, false);
    setForm(b, e2, on ? HEAD : null);
    e2.profile.deferHit = on;
    if (meleeDefault) e2.profile.melee = !on;
  };
  return [{
    iv: idle ? 0.1 : undefined,
    spawn(b, e2, a) {
      a.sp = init;
      a.head = false;
      if (meleeDefault) e2.profile.melee = true;
      e2.profile.shot = 'none';
    },
    tick(b, e2, a) {
      if (!idle || e2.blockedBy || inAttackState(b, e2)) return;
      if (a.sp >= 1 && e2.mode !== HEAD) set(b, e2, true);
      else if (a.sp < 1 && e2.mode === HEAD) set(b, e2, false);
    },
    // the attack about to be made is HeadShot's (its mode as it began: the switches below come after its strike)
    before(c, b, e2, a) {
      a.head = e2.mode === HEAD;
      e2.profile.deferHit = a.head;
      if (a.head && pick && c.targets.length) {
        const t = pick(b, e2, c.targets);
        if (t) c.targets = [t];
      }
    },
    attack(c, b, e2, a) {
      const was = a.head, sp = a.sp;
      a.head = false;
      if (was) {
        const t = c.targets[0];
        if (t) {
          const x = t.x, y = t.y;
          shoot(b, e2, t, shot, (u) => hit(b, e2, u, x, y), { hitDead: true });
        }
        a.sp = Math.max(0, a.sp - cost);
      }
      // enemy_spmode_check, on the SP this attack began with
      if (sp >= 1 && !was) set(b, e2, true);
      else if (sp < 1 && was) set(b, e2, false);
    },
  }];
}

/** HeadShot's hit on `u`: ATK × `scale` of `type`, the normal attack's (its projectile: 远程途径). */
const headHit = (b, e, u, scale, type) => {
  if (!u || !u.alive || !u.deployed) return false;
  b.dealDamage(e, u, { amount: e.s.atk * scale, type, isAttack: true, isProjectile: true });
  return true;
};

/** 寻路者狙击手 (enm_pfb_9): HeadShot shoots projectile_enemy_mtrsnp_headshot for physical ATK × `headshot_atk_scale` (2). */
function kitPfSniper(ab, e) {
  const scale = T(ab, 'shotbuff.attack@headshot_atk_scale') ?? 1;
  return pathfinder(ab, e, { hit: (b, e2, u) => headHit(b, e2, u, scale, 'phys') });
}

/**
 * 寻路者破阵者 (enm_pfb_9): its first mode fights only its blocker; HeadShot (`_useDynamicAttackType`) lobs
 * projectile_enemy_cansld (PARACURVE 4 tiles/s, to its target's spot at the attack) whose 3 × 3 box (CANSLD_BOX) strikes
 * every ally there — ground and air — for physical ATK × `headshot_atk_scale` (1) as it arrives, on a dead target too
 * (`_alwaysHitTraceTargetInTheEnd`).
 */
function kitPfBreaker(ab, e) {
  const scale = T(ab, 'shotbuff.attack@headshot_atk_scale') ?? 1;
  const R = CANSLD_BOX + ALLY_COLLIDER_RADIUS;
  return pathfinder(ab, e, {
    meleeDefault: true, idle: true,
    hit(b, e2, _u, x, y) {
      b.fx('explode', { x, y, r: CANSLD_BOX, kind: 'cansld', id: e2.id });
      for (const o of b.allies()) {
        if (o.alive && o.deployed && Math.abs(o.x - x) <= R + 1e-9 && Math.abs(o.y - y) <= R + 1e-9 && areaSelectable(e2, o)) {
          b.dealDamage(e2, o, { amount: e2.s.atk * scale, type: 'phys', isAttack: true, isProjectile: true, tags: ['splash'] });
        }
      }
    },
  });
}

/**
 * 寻路者传令兵 (enm_pfb_10): its first mode fights only its blocker (arts); HeadShot shoots projectile_enemy_mtrbty for arts
 * ATK × `headshot_atk_scale` (1.5) and, on that hit, the client's buff disarmed_and_cant_use_skill (its buff table row:
 * buff key `disarmed`, abnormal flags DISARMED + SILENCED, `disarmed_duration` = `headshot_disarmed_duration` 15 s) — no
 * normal attack and no skill, 抵抗 shortening both. Its selector (SecondaryFilterAdvancedSelector `_buffKey` disarmed,
 * `_withoutThisBuff`) prefers the candidates without it: with one target its OnPostFilter keeps only those when any is
 * there, else all.
 */
function kitPfHerald(ab, e) {
  const scale = T(ab, 'shotbuff.attack@headshot_atk_scale') ?? 1;
  const dur = T(ab, 'shotbuff.attack@headshot_disarmed_duration') ?? 0;
  return pathfinder(ab, e, {
    meleeDefault: true, idle: true,
    pick(b, e2, targets) {
      if (!targets[0].s.flags.disarm) return null;
      const r = e2.base.rangeRadius + ALLY_COLLIDER_RADIUS;
      const l = byPriority(e2, targetsNear(b, e2, r)).filter((u) => !u.s.flags.disarm);
      return l[0] || null;
    },
    hit(b, e2, u) {
      if (!headHit(b, e2, u, scale, 'arts') || !u.alive || !(dur > 0)) return;
      b.applyStatus(u, 'disarm', { duration: dur, source: e2 });
      b.applyStatus(u, 'silence', { duration: dur, source: e2 });
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// the 乐团 trio (残党乐团 / 巫王乐团 圆号手 · 管乐家 · 鼓手, enm_pfb_15)

/**
 * The 乐团's 变奏 is off in this mode. Each one's Talents/switchMode (PassiveBuffAbility) puts on
 * enemy_act29side[siwtch_mode_enthu] (圆号手, 鼓手) or [siwtch_mode_depressed] (管乐家) and
 * [switchmode_buff_creator]: both look for the environment system env_008_act29side_audio_type_switcher
 * (CheckContainsEnvSystem) as they start and, without it, finish there — so no mode switch, no buff_enthu /
 * buff_depressed numbers (the `switchMode.enemy_act29side[…]` blackboards), no 激昂 / 沉郁 mode abilities — and the first
 * leaves only its decoration, [enthu_fx_deco_only] (effect common_radical_01) or [depressed_fx_deco_only]
 * (common_gloomyl_01), not derived, for good. No 规程 level (levels/activities/act1autochess, every
 * level_act3autochess_*) and no buff of activity_table's act3autochess has that system.
 */
const bandDeco = (key) => ({
  spawn(b, e) { b.addBuff(e, { key: `ab:${key}`, persist: true, visible: true, fxTag: `buff:enemy_act29side[${key}]` }); },
});

/**
 * 鼓手's attack range: the prefab's CircleRange (Combat / Attack / Skills/aoeAttack selectors, CircleCollider2D 1.5). Its
 * table rangeRadius is −1, and CircleRange.InitCollidersIfNot keeps the collider's own radius for a negative one.
 */
const LTNDRU_RANGE = 1.5;
/**
 * 鼓手's aoeAttack blast: enemy_ltndru[AOE] (BuffToOwner at the clip's attack event, `lifeTime` 0.2 s — the skill
 * blackboard has no `duration_aoe`), ON_BUFF_FINISH an AOEDamage `_radius` 2 (no `range_radius` blackboard) around it.
 */
const LTNDRU_AOE_DELAY = 0.2, LTNDRU_AOE_RADIUS = 2;
/** 圆号手's attackTwoTarget: its selector BlockedOrAdvancedSelector `_maxNum` 2 (the normal attack's 1). */
const LTNHOR_TARGETS = 2;
/** 管乐家's atkboostCore: enemy_ltnclr[boost_atk] `triggerInterval` 0.5 s. */
const LTNCLR_BOOST_IV = 0.5;

/**
 * The SP of 圆号手 / 鼓手 (enemy_database spData maxSp 2): +1 for each normal attack as it strikes — 圆号手's
 * enemy_ltnhor[charge_sp] (BuffToOwner of its Combat and Attack abilities, ON_SPELL_ON: ModifySp +1; its spType
 * INCREASE_WITH_TIME has no increment), 鼓手's INCREASE_WHEN_ATTACK —, not for its skill's cast. Its skill (EnemySkill
 * `_familyMask` 3: blocked or not) waits for SP = `spCost` and spends it as it casts: 2 attacks, then the skill.
 */
function bandSp(s) {
  const cost = s && s.sp > 0 ? s.sp : 0;
  const P = { sp: 0 };
  return {
    P, cost,
    counter: { attack() { P.sp = Math.min(cost, P.sp + 1); } },
    ready: () => cost > 0 && P.sp >= cost,
    spend: () => { P.sp = Math.max(0, P.sp - cost); },
  };
}

/**
 * 残党乐团圆号手 / 巫王乐团圆号手: after 2 attacks (bandSp) Skills/attackTwoTarget (SILENCE line; SelectorTrigger: a target
 * in its 1.5 range) — a RangedAttack in its Attack clip on up to LTNHOR_TARGETS allies (its blocker first, then by its
 * targeting order), each its projectile_enemy_ltnhor for physical ATK at the clip's event. bandDeco: enthu.
 */
function kitBandHorn(ab) {
  const s = ab.sk.attackTwoTarget;
  const sp = bandSp(s);
  const pick = (b, e) => {
    const l = byPriority(e, targetsNear(b, e, e.base.rangeRadius + ALLY_COLLIDER_RADIUS));
    const k = e.blockedBy;
    const out = k && l.includes(k) ? [k, ...l.filter((u) => u !== k)] : l;
    return out.slice(0, LTNHOR_TARGETS);
  };
  return [bandDeco('enthu_fx_deco_only'), sp.counter, skill(s, (b, e) => {
    sp.spend();
    const ts = pick(b, e);
    const scale = s.bb.atk_scale ?? 1;
    atCastEvent(b, e, s, () => {
      for (const t of ts) {
        if (!t.alive || !t.deployed) continue;
        shoot(b, e, t, s.proj, (u) => { if (u && u.alive && u.deployed) b.dealDamage(e, u, { amount: e.s.atk * scale, type: 'phys', isAttack: true, isProjectile: true }); });
      }
    });
  }, { sil: true, cond: (b, e) => sp.ready() && pick(b, e).length > 0 })];
}

/**
 * 残党乐团管乐家 / 巫王乐团管乐家 (melee: only a Combat ability, its blocker): Talents/atkboostCore — every LTNCLR_BOOST_IV s
 * while unblocked (no enemy_ltnclr[blocked_flag], atkboostChecker's BlockedToggleChecker) a stack of
 * enemy_ltnclr[atk_boost_stack], ATK FINAL_ADDITION `atkboostCore.atk`, below `atkboostCore.max_stack_count`; its attack's
 * end (enemy_ltnclr[revert_atk], ON_CAST_END) clears them — the first attack after a walk carries the boost. The
 * `atkboostCore.attack@stun_duration` stun is the 沉郁 mode's attack, off here (bandDeco: depressed).
 */
function kitBandClarinet(ab) {
  const add = T(ab, 'atkboostCore.atk') ?? 0, max = T(ab, 'atkboostCore.max_stack_count') ?? 0;
  const KEY = 'ab:ltnclrBoost';
  const clear = (b, e) => { if (e.alive) b.removeBuff(e, KEY); };
  return [bandDeco('depressed_fx_deco_only'), {
    iv: LTNCLR_BOOST_IV,
    tick(b, e) {
      if (e.blockedBy || !(add > 0) || !(max > 0)) return;
      b.addBuff(e, { key: KEY, refresh: 'stack', stacks: 1, maxStacks: max, persist: true, mods: { atkFinal: add } });
    },
    attack(c, b, e) {
      const end = e.castLeft > 0 ? e.castLeft : 0;
      if (end > 1e-9) b.after(end, () => clear(b, e), { owner: e });
      else clear(b, e);
    },
  }];
}

/**
 * 残党乐团鼓手 / 巫王乐团鼓手 (ranged arts, LTNDRU_RANGE): after 2 attacks (bandSp) Skills/aoeAttack (SILENCE line;
 * AlwaysTrigger, `_allowNoTarget`) — its Attack clip, and LTNDRU_AOE_DELAY s after the clip's event arts ATK on every
 * ally within LTNDRU_AOE_RADIUS of it (AOEDamage MAGICAL, every motion). bandDeco: enthu.
 * [추정·미조사: whether the blast still comes when it falls within those 0.2 s — here not]
 */
function kitBandDrummer(ab) {
  const s = ab.sk.aoeAttack;
  const sp = bandSp(s);
  return [bandDeco('enthu_fx_deco_only'), {
    spawn(b, e) { e.base.rangeRadius = Math.max(e.base.rangeRadius || 0, LTNDRU_RANGE); },
  }, sp.counter, skill(s, (b, e) => {
    sp.spend();
    atCastEvent(b, e, s, () => b.after(LTNDRU_AOE_DELAY, () => {
      if (!e.alive) return;
      b.fx('explode', { x: e.x, y: e.y, r: LTNDRU_AOE_RADIUS, kind: 'ltndruAoe', id: e.id, ability: 'aoeAttack' });
      for (const u of areaAllies(b, e, e.x, e.y, LTNDRU_AOE_RADIUS)) hurt(b, e, u, e.s.atk * (s.bb.atk_scale ?? 1), 'arts', { tags: ['splash'] });
    }, { owner: e }));
  }, { sil: true, cond: () => sp.ready() })];
}

// ---------------------------------------------------------------------------------------------------------------
// this module's part of KITS

export const CRITIC_KITS = {
  enemy_1191_krgrg: kitIceGuard,                           // 冰原卫法者 · knocked out: arts blast + cold on both sides; bleeds in 失衡
  enemy_1191_krgrg_2: kitIceGuard,                         // 冰原御法者 · same
  enemy_1406_chghmr: kitLinePusher,                        // 战线推进者 · first attack after each block: PowerHit, ATK +80 %
  enemy_1403_gunsho: kitRapidCrossbow,                     // 速射轻弩手 · 直击: 3 bolts along its row / column
  enemy_1403_gunsho_2: kitRapidCrossbow,                   // 速射劲弩手 · same
  enemy_1409_bdguad_2: kitMatteoGuard,                     // 马特奥的近卫 · 直击: 2 bombs; damage taken −40 % unblocked
  enemy_1405_boomer_2: kitGrenadier,                       // 无畏掷弹兵 · first hit unblocked: 4 bombs, then faster and lighter
  enemy_1213_mtrsnp: kitPfSniper,                          // 寻路者狙击手 · ammo 1: HeadShot ATK × 2
  enemy_1216_cansld: kitPfBreaker,                         // 寻路者破阵者 · melee; ammo 2: a 3 × 3 shell
  enemy_1219_mtrbty: kitPfHerald,                          // 寻路者传令兵 · melee; ammo 1: ATK × 1.5 arts + 15 s 缴械·沉默
  enemy_1373_ltnhor: kitBandHorn,                          // 残党乐团圆号手 · 2 attacks, then 2 targets; no 变奏 here
  enemy_1373_ltnhor_2: kitBandHorn,                        // 巫王乐团圆号手 · same
  enemy_1375_ltnclr: kitBandClarinet,                      // 残党乐团管乐家 · unblocked ATK +30 per 0.5 s (30 max), spent by its attack
  enemy_1375_ltnclr_2: kitBandClarinet,                    // 巫王乐团管乐家 · same
  enemy_1376_ltndru: kitBandDrummer,                       // 残党乐团鼓手 · 2 attacks, then arts ATK within 2
  enemy_1376_ltndru_2: kitBandDrummer,                     // 巫王乐团鼓手 · same
};
