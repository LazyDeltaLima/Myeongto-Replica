// server/sim/content/kits/diy.js — hand-authored kits of the 선발 오퍼레이터 (甄选 / DIY picks, local NAS patch,
// docs/LOCAL-PATCH.md): 望, 赤刃明霄陈, 维什戴尔, 丰川祥子, 阿斯卡纶. Numbers come from each record's blackboards
// (data/diy.json, the official tables at the 甄选 slot status); behaviour from the skill / talent texts and the PRTS
// operator pages (备注), [ASSUMED] where neither says. Registered by content/index.js (operator kits by the
// chess_diy_<key>_<5|6>_a ids — the elite resolves through its baseId) and `tokenKits` (望's 棋子, 维什戴尔's 魂灵之影).
// Runs on the server and in the browser (/sim/content/kits/diy.js).

import { COLS } from '../../constants.js';
import { DIRS, dirVec, normDir } from '../../dir.js';
import { bodyOnTile } from '../../body.js';
import { isHpLoss } from '../../damage.js';
import { sortEnemyTargets } from '../../targeting.js';
import { weaknessRetype } from '../items/battle.js';
import { talentBb, alliesInGridOf, installAura } from './tier1.js';

// ------------------------------------------------------------------------------------------------------------------
// helpers (the tier files keep theirs file-local)

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const live = (u) => !!u && u.alive && u.deployed && !u.removed && !u.hidden;
const selectedSkill = (chess, def) => chess?.skill?.skillId ?? def?.skill?.id ?? null;
/** Skill blackboard base_attack_time → engine batPct (tier6.js batOf: a shortening is flat seconds, a lengthening scales). */
function batOf(v, def) {
  const x = num(v);
  if (!x) return 0;
  if (x > 0) return x;
  return Math.max(-0.9, x / (num(def?.stats?.bat, 1) || 1));
}
const instantKind = (def) => ((def?.skill?.maxCharges ?? 1) > 1 ? 'charges' : 'instant');
const skillGridOf = (def) => (def?.skill?.rangeGrid?.length ? def.skill.rangeGrid : null);
const ANY = Object.freeze({ canHitFly: true });
const inRange = (battle, unit) => battle.enemiesInKeys(unit.rangeKeys || [], unit, ANY);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** Per-battle state of this file (by battle). */
const STATE = new WeakMap();
const bstate = (battle) => { let s = STATE.get(battle); if (!s) STATE.set(battle, (s = { fever: new Map() })); return s; };

// ==================================================================================================================
// 维什戴尔 (投掷手) — 好礼 / 死魂灵的余息; S1 定点清算, S2 饱和复仇, S3 爆裂黎明
//
// Trait: every attack = the main blast + aftershocks (append_atk_scale × ATK, the module's enable_third_attack adds one)
// in the bombarder splash (0.9, PRTS 溅射半径一览), ground only. 好礼: the main target takes main_atk_scale × the hit and
// gets an 残影 (one, kept); an 残影 struck by her aftershock explodes with `prob` (S3: 100 %): bomb_atk_scale × ATK phys
// within range_radius (1.1, centre test, height ignored) + stun 1 s, the mark is used up [ASSUMED: used up — the text
// does not say it stays]. 死魂灵的余息: on deploy a 魂灵之影 on the free tile of her range nearest to her (PRTS 备注:
// lowest distance first); she has 迷彩 while one stands within 1.5 tiles [ASSUMED radius: "在魂灵之影周围"].
// S2 过载 [ASSUMED: the second half of the 25 s — the table gives no switch time]: every attack becomes 4 shots of
// atk_scale_ol × ATK at random targets of her range (each a full blast with its aftershocks).

const WIS_SPLASH = 0.9, WIS_S1_SPLASH = 1.1, WIS_S3_SPLASH = 1.7, WIS_WARD_NEAR = 1.5, WIS_WARD_MAX = 3;
const WARD_ID = 'token_10035_wisdel_wward';

function wisdel(bb, chess, def) {
  const sid = selectedSkill(chess, def);
  const t0 = talentBb(chess, 0);
  const tb = chess?.trait?.bb || {};
  const append = num(tb['attack@append_atk_scale'], 0.5);
  const shocks = 1 + (num(tb['attack@enable_third_attack']) ? 1 : 0);
  const mainScale = num(t0['attack@main_atk_scale'], 1.15);
  const markProb = num(t0['attack@prob'], 0.15), bombScale = num(t0['attack@bomb_atk_scale'], 1.5);
  const bombStun = num(t0['attack@stun'], 1), bombR = num(t0['attack@range_radius'], 1.1);

  /** The 残影 of a target: explode it (prob `p`) — called by an aftershock of hers striking a marked enemy. */
  const tryBomb = (battle, unit, e, p) => {
    if (!e.alive || !e.buffs.some((b) => b.key === `wis:mark:${unit.id}`)) return;
    if (battle.rng() >= p) return;
    battle.removeBuff?.(e, `wis:mark:${unit.id}`);
    battle.fx('explode', { x: e.x, y: e.y, r: bombR });
    for (const v of battle.foesInRadius(e.x, e.y, bombR, true)) {
      battle.dealDamage(unit, v, { amount: unit.s.atk * bombScale, type: 'phys', isSkill: true, tags: ['talent', 'wisdelBomb'] });
      if (v.alive) battle.applyStatus(v, 'stun', { duration: bombStun, source: unit });
    }
  };
  const mark = (battle, unit, e) => {
    if (!e?.alive) return;
    battle.addBuff(e, { key: `wis:mark:${unit.id}`, duration: Infinity, source: unit, visible: true });
  };
  /**
   * One blast at (x, y) (the main target `main`): splash + `n` aftershocks of `scale` × ATK 0.3 s apart. `stun` stuns
   * every enemy the blast hits; `prob` = the 残影 explosion chance of the aftershocks.
   */
  const blast = (battle, unit, main, { x, y, scale = 1, radius = WIS_SPLASH, n = shocks, after = append, stun = 0, prob = markProb, primary = false }) => {
    if (!primary) {
      for (const e of battle.foesInRadius(x, y, radius, true)) {
        if (e.isFlying) continue;
        battle.dealDamage(unit, e, { amount: unit.s.atk * scale * (e === main ? mainScale : 1), type: 'phys', isAttack: true, isSplash: e !== main, tags: ['wisdelShot'] });
        if (stun && e.alive) battle.applyStatus(e, 'stun', { duration: stun, source: unit });
      }
    }
    mark(battle, unit, main);
    const seq = unit.deploySeq;
    for (let i = 1; i <= n; i++) {
      battle.after(0.3 * i, () => {
        if (unit.deploySeq !== seq) return;
        for (const e of battle.foesInRadius(x, y, radius, true)) {
          if (e.isFlying) continue;
          battle.dealDamage(unit, e, { amount: unit.s.atk * after, type: 'phys', isSplash: true, tags: ['aftershock'] });
          if (stun && e.alive) battle.applyStatus(e, 'stun', { duration: stun, source: unit });
          tryBomb(battle, unit, e, prob);
        }
      }, { owner: unit });
    }
  };

  const ownWards = (battle, unit) => battle.allies(unit.ownerId).filter((a) => a.kind === 'token' && a.defId === WARD_ID && a.ownerUnit === unit && a.alive);
  const placeWard = (battle, unit) => {
    if (ownWards(battle, unit).length >= WIS_WARD_MAX) return null;
    const tiles = [...(unit.rangeKeys || [])].map((k) => [Math.floor(k / COLS), k % COLS])
      .filter(([r, c]) => battle.grid.inRect(r, c) && battle.grid.canStand(r, c, { ranged: true }) && !battle.isReservedTile?.(r, c))
      .sort((a, b) => Math.hypot(a[0] - unit.tileR, a[1] - unit.tileC) - Math.hypot(b[0] - unit.tileR, b[1] - unit.tileC) || a[1] - b[1]);
    for (const [r, c] of tiles) {
      const w = battle.spawnToken(unit, WARD_ID, r, c, { anySource: true });
      if (w) { battle.fx('summon', { x: w.x, y: w.y, id: w.id }); return w; }
    }
    return null;
  };

  const s3 = sid === 'skchr_wisdel_3';
  return {
    // the trait's aftershocks and the talents are this kit's own blast (it replaces the branch's afterHit)
    trait: {
      splashRadius: WIS_SPLASH,
      afterHit(battle, unit, target, info) {
        const sk = unit.skill;
        const s1 = sk?.active && sk.id === 'skchr_wisdel_1';
        const s3on = sk?.active && sk.id === 'skchr_wisdel_3';
        blast(battle, unit, target, {
          x: info.x, y: info.y, primary: true,
          n: shocks + (s1 ? 2 : 0), after: s1 ? num(sk.bb?.append_atk_scale, 0.9) : append,
          radius: s3on ? WIS_S3_SPLASH : s1 ? WIS_S1_SPLASH : WIS_SPLASH,
          stun: s1 ? num(sk.bb?.stun_duration, 1) : 0, prob: s3on ? num(sk.bb?.['attack@prob'], 1) : markProb,
        });
        if (s1) battle.applyStatus(target, 'stun', { duration: num(sk.bb?.stun_duration, 1), source: unit });
      },
    },
    skills: {
      // 定点清算 (AUTO, attack SP): the next attack — 2 more aftershocks at append_atk_scale, stun, wider splash (afterHit)
      skchr_wisdel_1: { kind: 'instant', attack: { splashRadius: WIS_S1_SPLASH } },
      // 饱和复仇: ATK +atk, base attack time −0.7 s, 3 targets; 过载 (second half): 4 shots at random targets
      skchr_wisdel_2: {
        kind: 'duration',
        mods: { atkPct: num(bb.atk), batPct: batOf(bb.base_attack_time, def) },
        targeting: { maxTargets: 3 },
      },
      // 爆裂黎明: 2 shades (≤ 3, kept), ATK +atk, base attack time ×(1 + 2.9), atk_scale_3, huge splash, 残影 100 %, ammo
      skchr_wisdel_3: {
        kind: 'ammo', ammo: Math.max(1, Math.floor(num(bb['attack@trigger_time'], 6))),
        mods: { atkPct: num(bb.atk), batPct: batOf(bb.base_attack_time, def) },
        attack: { atkScale: num(bb['attack@atk_scale_3'], 1.9), splashRadius: WIS_S3_SPLASH },
        onStart({ battle, unit }) { for (let i = 0; i < Math.max(1, num(bb.max_cnt, 2)); i++) placeWard(battle, unit); },
      },
    },
    talents: [
      { install(battle, unit) { // 好礼: the main target takes main_atk_scale × the attack
        battle.on('hit', (c) => {
          if (c.source !== unit || !c.dmg?.isAttack || c.dmg.isSplash || c.dmg.tags?.includes('wisdelShot')) return;
          c.dmg.mul = num(c.dmg.mul, 1) * mainScale;
        }, { owner: unit });
      } },
      { install(battle, unit) { // 死魂灵的余息: a shade on deploy; 迷彩 near a shade
        battle.on('deploy', ({ unit: u }) => { if (u === unit) battle.after(0, () => { if (live(unit)) placeWard(battle, unit); }, { owner: unit }); }, { owner: unit });
        battle.every(0.25, () => {
          if (!live(unit)) return;
          const near = ownWards(battle, unit).some((w) => dist(w, unit) <= WIS_WARD_NEAR);
          const has = unit.buffs.some((b) => b.key === 'wis:camou');
          if (near && !has) battle.addBuff(unit, { key: 'wis:camou', duration: Infinity, flags: { camou: true }, status: 'camou' });
          else if (!near && has) battle.removeBuff?.(unit, 'wis:camou');
        }, { owner: unit });
      } },
    ],
    install(battle, unit) {
      if (sid !== 'skchr_wisdel_2') return;
      // 过载: the second half of 饱和复仇 — each attack is 4 shots at random targets of her range at atk_scale_ol
      battle.on('beforeAttack', (ctx) => {
        if (ctx.attacker !== unit || !unit.skill?.active || unit.skill.id !== 'skchr_wisdel_2') return;
        const sk = unit.skill;
        const total = num(sk.duration, 25), left = num(sk.timeLeft, total);
        if (left > total / 2) return;
        const pool = inRange(battle, unit).filter((e) => !e.isFlying);
        if (!pool.length) return;
        ctx.targets = [battle.rng.pick(pool)];
        ctx.profile = { ...ctx.profile, atkScale: num(bb['attack@atk_scale_ol'], 0.7) };
        for (let i = 1; i <= 3; i++) {
          battle.after(0.12 * i, () => {
            const p2 = inRange(battle, unit).filter((e) => !e.isFlying);
            const t = p2.length ? battle.rng.pick(p2) : null;
            if (!t || !live(unit)) return;
            battle.fx('bombardShell', { x: t.x, y: t.y, id: unit.id, r: WIS_SPLASH, t: 0.25 });
            blast(battle, unit, t, { x: t.x, y: t.y, scale: num(bb['attack@atk_scale_ol'], 0.7) });
          }, { owner: unit });
        }
      }, { owner: unit, priority: 5 });
    },
    // the shades she owns are kept between her S3 casts; s3 flag for readers
    meta: { s3 },
  };
}

/** 魂灵之影: no attack; its AUTO skill hits one enemy of 维什戴尔's range (unmarked first): arts (its ATK), 停顿, 残影, SP. */
function wisdelWard(bb) {
  const slug = num(bb.sluggish, 1), spMin = num(bb.sp_min, 0), spMax = num(bb.sp_max, 3);
  return {
    skill: {
      kind: 'instant',
      trigger: { rule: 'SP_FULL' },
      onStart({ battle, unit }) {
        const owner = unit.ownerUnit;
        if (!live(owner)) return;
        const pool = inRange(battle, owner).filter((e) => e.alive);
        if (!pool.length) { unit.skill?.gainSp?.(unit.skill.spCost ?? 0, 'refund'); return; }
        const fresh = pool.filter((e) => !e.buffs.some((b) => b.key === `wis:mark:${owner.id}`));
        const t = battle.rng.pick(fresh.length ? fresh : pool);
        battle.fx('burst', { x: t.x, y: t.y, id: unit.id });
        battle.dealDamage(unit, t, { amount: unit.s.atk, type: 'arts', isSkill: true, tags: ['summon'] });
        if (t.alive) {
          battle.applyStatus(t, 'sluggish', { duration: slug, source: unit });
          battle.addBuff(t, { key: `wis:mark:${owner.id}`, duration: Infinity, source: owner, visible: true });
        }
        const sp = Math.floor(spMin + battle.rng() * Math.max(0, spMax - spMin)); // 0-2 (sp_max exclusive)
        if (sp > 0 && owner.skill && !owner.skill.active) owner.skill.gainSp(sp, 'talent');
      },
    },
    trait: { noAttack: true },
  };
}

// ==================================================================================================================
// 阿斯卡纶 (伏击客) — 死亡拘审 / 噬光残影; S1 追袭, S2 恩赐, S3 降临
//
// Trait (branch): hits every enemy of her range, 50 % dodge, less likely to be targeted (professions.js stalker).
// 死亡拘审: each hit gives a stack (≤ 3, 25 s, refreshed): move speed −18 % per stack, arts 10 % of her CURRENT ATK per
// second per stack (PRTS: "阿斯卡纶当前攻击力"); every effect ends when she leaves the field (PRTS 备注).
// 噬光残影: ASPD +attack_speed, +attack_speed_add while one of her 4 neighbouring tiles is high ground.
// S3: enemies inside her range miss 30 % of their attacks (on anyone) [engine: no hit-rate stat — a cancel in `hit`];
// a miss on her or her own dodge heals her hp_ratio of max HP.

function ascalon(bb, chess, def) {
  const t0 = talentBb(chess, 0), t1 = talentBb(chess, 1);
  const slow = Math.abs(num(t0.move_speed, -0.18)), ratio = num(t0.atk_ratio, 0.1);
  const maxStacks = Math.max(1, num(t0.max_stack_cnt, 3)), dur = num(t0.debuff_duration, 25);
  const keyOf = (unit) => `ascln:judg:${unit.id}`;
  const judge = (battle, unit, e, n = 1) => {
    if (!e?.alive || e.side !== 'enemy') return;
    for (let i = 0; i < n; i++) {
      const b = battle.addBuff(e, {
        key: keyOf(unit), duration: dur, refresh: 'stack', stacks: 1, maxStacks, interval: 1, source: unit, visible: true,
        mods: { moveMul: 1 - slow },
        onTick: ({ unit: t, buff }) => {
          if (!live(unit)) return;
          battle.dealDamage(unit, t, { amount: unit.s.atk * ratio * Math.max(1, buff.stacks || 1), type: 'arts', canDodge: false, ignoreSelect: true, tags: ['dot', 'talent'] });
        },
      });
      // linear −18 % per stack (not compounding)
      if (b) { b.mods = { moveMul: Math.max(0.05, 1 - slow * Math.max(1, b.stacks || 1)) }; e.markDirty?.(); }
    }
  };
  return {
    skills: {
      // 追袭 (AUTO, charges): the next attack at atk_scale, twice
      skchr_ascln_1: { kind: instantKind(def), attack: { atkScale: num(bb.atk_scale, 1.7), hits: 2 } },
      // 恩赐: ATK +atk; ground enemies in range −40 % move speed; a ground enemy of her range knocked out → 1 stack around it
      skchr_ascln_2: {
        kind: 'duration', mods: { atkPct: num(bb.atk) },
        onTick({ battle, unit }) {
          if (battle.time - num(unit.mem.asclnSlowAt, -9) < 0.25) return; // refreshed 4× a second (0.5 s status)
          unit.mem.asclnSlowAt = battle.time;
          for (const e of inRange(battle, unit)) if (!e.isFlying) battle.applyStatus(e, 'slow', { duration: 0.5, value: Math.abs(num(bb.move_speed, -0.4)), source: unit });
        },
      },
      // 降临: range y-10, ATK +atk, base attack time −1.5 s, taunt +2; hit-rate −30 % / heal on miss (install)
      skchr_ascln_3: {
        kind: 'duration',
        mods: { atkPct: num(bb.atk), batPct: batOf(bb.base_attack_time, def), taunt: num(bb.taunt_level, 2) },
        targeting: { rangeGrid: skillGridOf(def), showOwnRange: true },
      },
    },
    talents: [
      { install(battle, unit) { // 死亡拘审: every damage instance of her attacks
        battle.on('damaged', (c) => {
          if (c.source !== unit || !(c.amount > 0) || !c.dmg?.isAttack) return;
          judge(battle, unit, c.target);
        }, { owner: unit });
        battle.on('death', ({ unit: u }) => { // her stacks end with her
          if (u !== unit) return;
          for (const e of battle.enemies) battle.removeBuff?.(e, keyOf(unit));
        }, { owner: unit });
      } },
      { install(battle, unit) { // 噬光残影
        const base = num(t1.attack_speed, 8), add = num(t1.attack_speed_add, 6);
        battle.on('deploy', ({ unit: u }) => {
          if (u !== unit) return;
          const high = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => {
            const r = unit.tileR + dr, c = unit.tileC + dc;
            return battle.grid.inBounds(r, c) && battle.grid.tile(r, c).height === 'HIGH' && battle.grid.tile(r, c).build !== 'NONE';
          });
          battle.addBuff(unit, { key: 'ascln:aspd', duration: Infinity, mods: { aspd: base + (high ? add : 0) } });
        }, { owner: unit });
      } },
    ],
    install(battle, unit) {
      const s = selectedSkill(chess, def);
      if (s === 'skchr_ascln_2') {
        battle.on('death', ({ unit: e, reason }) => {
          if (!unit.skill?.active || unit.skill.id !== 'skchr_ascln_2' || e.side !== 'enemy' || e.isFlying || reason === 'leak') return;
          if (!(unit.rangeKeys || new Set()).has?.(Math.round(e.y) * COLS + Math.round(e.x))) return;
          for (const v of battle.foesInRadius(e.x, e.y, num(bb.range_radius, 1.3), true)) judge(battle, unit, v);
        }, { owner: unit });
      }
      if (s === 'skchr_ascln_3') {
        const miss = Math.abs(num(bb['attack@damage_hitrate_physical'], -0.3));
        const heal = () => { if (live(unit)) battle.heal(unit, unit, unit.s.maxHp * num(bb['attack@hp_ratio'], 0.05), { self: true }); };
        battle.on('hit', (c) => {
          if (!unit.skill?.active || unit.skill.id !== 'skchr_ascln_3') return;
          const src = c.source;
          if (!src || src.side !== 'enemy' || src.isFlying || !c.dmg?.isAttack || (c.dmg.type !== 'phys' && c.dmg.type !== 'arts')) return;
          if (!(unit.rangeKeys || new Set()).has?.(Math.round(src.y) * COLS + Math.round(src.x))) return;
          if (battle.rng() < miss) {
            c.dmg.cancel = true;
            battle.fx('dodge', { x: c.target.x, y: c.target.y, id: c.target.id });
            if (c.target === unit) heal();
          }
        }, { owner: unit, priority: 5 });
        battle.on('dodge', (c) => { if (c.target === unit && unit.skill?.active && unit.skill.id === 'skchr_ascln_3') heal(); }, { owner: unit });
      }
    },
  };
}

// ==================================================================================================================
// 赤刃明霄陈 (术战者) — 形意洞照 / 寒暑觉知; S1 赤霄·奔夜, S2 赤霄·绝影-驰, S3 赤霄·天喟
//
// Trait: arts damage (branch). 形意洞照: ATK +atk, ASPD +attack_speed, every damage of hers is 弱点伤害 (the less
// resisted of phys / arts — items/battle.js weaknessRetype; PRTS: "根据目标防御力和法术抗性变更伤害类型").
// 寒暑觉知: every stack_time s without taking damage she heals ATK × random(heal_atk_scale_min…max) % and dodges the
// next physical / arts attack; taking damage restarts the clock (PRTS 备注). Module: ASPD +8 while blocking nobody.
// S2 (PRTS 备注): a slash every 0.4 s, 无敌 meanwhile; a knocked-out target passes on to the nearest other enemy within
// 1.7 of it, else of her range, remaining slashes +1; at the end she 【移动】s to a standing, deployable target's tile;
// then ATK +respawn_buff.atk and respawn_buff.prob phys / arts dodge until the skill ends.
// S3 剑气 (PRTS 备注): leaves forward at 1.5 tiles/s for the whole skill, radius 1.3, current-HP hp_ratio arts (≥
// projectile_min_atk_scale × ATK), each enemy once between turns, flyers too; 0.25 before a high-ground / impassable /
// out-of-field / 保护目标 tile ahead it turns 90° clockwise.

const QI_SPEED = 1.5, QI_RADIUS = 1.3, QI_LOOK = 0.25, S2_INTERVAL = 0.4, S2_PASS_RADIUS = 1.7;

function chen3(bb, chess, def) {
  const t0 = talentBb(chess, 0), t1 = talentBb(chess, 1);
  const moduleAspd = num(chess?.trait?.bb?.attack_speed, 0);

  /** 剑气 of S3: a virtual mover, damage once per enemy per straight run. */
  const releaseQi = (battle, unit) => {
    let d = normDir(unit.dir);
    let x = unit.x, y = unit.y;
    let hitSet = new Set();
    let steps = 0;
    const seq = unit.deploySeq;
    const minDmg = unit.s.atk * num(bb.projectile_min_atk_scale, 5.5), ratio = num(bb.hp_ratio, 0.06);
    const blocked = (r, c) => {
      if (!battle.grid.inRect(r, c)) return true;
      const t = battle.grid.tile(r, c);
      return t.pass === 'NONE' || t.height === 'HIGH' || t.special === 'end' || battle.grid.isBlocked?.(r, c);
    };
    const STEP = 0.1;
    const job = battle.every(STEP, () => {
      if (unit.deploySeq !== seq || !unit.alive || !unit.skill?.active || unit.skill.id !== 'skchr_chen3_3') { job.cancel(); return; }
      // turn (clockwise: UP → RIGHT → DOWN → LEFT) while the tile ahead is a wall; at most 4 turns a step
      for (let k = 0; k < 4; k++) {
        const [dr, dc] = dirVec(d);
        const ar = Math.round(y + dr * (0.5 + QI_LOOK)), ac = Math.round(x + dc * (0.5 + QI_LOOK));
        if (!blocked(ar, ac)) break;
        d = DIRS[(DIRS.indexOf(d) + 1) % 4];
        hitSet = new Set();   // "每次转向前对每个敌人仅判定一次伤害"
      }
      const [dr, dc] = dirVec(d);
      x += dc * QI_SPEED * STEP; y += dr * QI_SPEED * STEP;
      battle.fx('chen3Qi', { x, y, id: unit.id, dir: d });          // render/fxgame.js moves her official S3 trail along it
      if (++steps % 3 === 0) battle.fx('swordStorm', { x, y, r: 0.5 }); // procedural fallback (render/fx.js)
      for (const e of battle.enemiesInRadius(x, y, QI_RADIUS)) {
        if (!e.alive || hitSet.has(e.id)) continue;
        hitSet.add(e.id);
        battle.dealDamage(unit, e, { amount: Math.max(minDmg, e.hp * ratio), type: 'arts', isSkill: true, tags: ['skill', 'chen3Qi'] });
      }
    }, { owner: unit });
  };

  /** S2: 10 slashes (+1 per kill), passing on; then the 【移动】 and the buff. */
  const slashes = (battle, unit) => {
    const seq = unit.deploySeq;
    const scale = num(bb.atk_scale, 4.3);
    const grid = skillGridOf(def);
    const keys = grid ? battle.unitsInGrid(unit, grid, { side: 'enemy' }) : inRange(battle, unit);
    const first = keys.filter((e) => e.alive).sort((a, b) => dist(a, unit) - dist(b, unit))[0]
      || inRange(battle, unit).sort((a, b) => dist(a, unit) - dist(b, unit))[0];
    if (!first) return;
    battle.addBuff(unit, { key: 'chen3:s2:inv', duration: 10 * S2_INTERVAL + 2, flags: { invulnerable: true, disarm: true } });
    let target = first, left = 10;
    const step = () => {
      if (unit.deploySeq !== seq || !unit.alive) return;
      if (!target || !target.alive) {
        const near = battle.foesInRadius(target ? target.x : unit.x, target ? target.y : unit.y, S2_PASS_RADIUS).filter((e) => e.alive);
        target = (near.length ? near : inRange(battle, unit)).sort((a, b) => dist(a, unit) - dist(b, unit))[0] || null;
      }
      if (target && left > 0) {
        left--;
        battle.fx('swordStorm', { x: target.x, y: target.y, id: unit.id, r: 0.6 });
        battle.dealDamage(unit, target, { amount: unit.s.atk * scale, type: 'arts', isSkill: true, tags: ['skill', 'chen3S2'] });
        if (!target.alive) left++;
        battle.after(S2_INTERVAL, step, { owner: unit });
        return;
      }
      battle.removeBuff?.(unit, 'chen3:s2:inv');
      // the 【移动】 to a standing target's tile (deployable for her, free)
      if (target && target.alive && !target.isFlying) {
        const r = Math.round(target.y), c = Math.round(target.x);
        if ((r !== unit.tileR || c !== unit.tileC) && battle.grid.canStand(r, c) && !battle.grid.isObstacle(r, c) && !battle.isReservedTile?.(r, c)) {
          const fromX = unit.x, fromY = unit.y;
          if (battle.moveRedeploy(unit, r, c)) battle.fx('teleport', { x: unit.x, y: unit.y, id: unit.id, fromX, fromY });
        }
      }
      if (unit.alive && unit.skill?.active) {
        const p = num(bb['chen3_s2[respawn_buff].prob'], 0.5);
        battle.addBuff(unit, { key: 'chen3:s2:after', duration: Math.max(0.5, num(unit.skill.timeLeft, 2)),
          mods: { atkPct: num(bb['chen3_s2[respawn_buff].atk'], 2.6), dodgePhys: p, dodgeArts: p } });
      }
    };
    step();
  };

  return {
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
      skchr_chen3_2: { kind: 'duration', onStart({ battle, unit }) { slashes(battle, unit); } },
      // 赤霄·天喟: the 剑气 + range 3-12, each attack ≤ max_target ground enemies × 3 hits at attack@atk_scale
      skchr_chen3_3: {
        kind: 'duration',
        targeting: { rangeGrid: skillGridOf(def), maxTargets: Math.max(1, num(bb['attack@max_target'], 3)), showOwnRange: true },
        attack: { atkScale: num(bb['attack@atk_scale'], 1.8), hits: 3, maxTargets: Math.max(1, num(bb['attack@max_target'], 3)), groundOnly: true, canHitFly: false },
        onStart({ battle, unit }) { releaseQi(battle, unit); },
      },
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
        battle.on('hit', (c) => {
          if (c.target !== unit || !dodge || !c.dmg?.isAttack || (c.dmg.type !== 'phys' && c.dmg.type !== 'arts')) return;
          dodge = false; c.dmg.cancel = true; since = battle.time;
          battle.fx('dodge', { x: unit.x, y: unit.y, id: unit.id });
        }, { owner: unit, priority: 4 });
        battle.every(0.2, () => {
          if (!live(unit) || battle.time - since < T) return;
          since = battle.time;
          battle.heal(unit, unit, unit.s.atk * (lo + battle.rng() * (hi - lo)), { self: true });
          dodge = true;
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

// ==================================================================================================================
// 丰川祥子 (领主) — 颂乐音符 / 毋畏遗忘; S1 新月的苏醒, S2 满月的舞会, S3 残月的余响; Fever
//
// Trait (branch): ranged attacks at 80 % ATK. 颂乐音符: her attacks are homing notes; each note alive gives her (the only
// Ave Mujica member on a remake field) 3 % DEF / 2 % RES ignore, ≤ max_cnt — [ASSUMED] a note lives ~1.5 s from its
// attack (flight + "飘出攻击范围一段时间后消失"). 毋畏遗忘: every damage instance of hers: Fever +cnt; operators inside
// her talent range get ASPD +attack_speed. Fever (gamedata_const: "Fever累计至450点时，任意一位Ave Mujica成员手动
// 触发技能后，在场所有Ave Mujica成员20秒内会持续释放当前技能"): a skill cast at ≥ 450 starts 20 s in which her skill
// recasts as soon as it ends, SP-free; S2 attacks hit twice; under S3 a fatal hit does not knock her out until it ends.
// S2 满月的舞会 (a mode, no duration): piano (start: ATK +attack@atk, phys) ↔ organ (ASPD +attack@attack_speed, arts);
// each cast switches [ASSUMED: the remake casts automatically, so a cast toggles the timbre].

const FEVER_NEED = 450, FEVER_TIME = 20, NOTE_LIFE = 1.5;

function sakiko(bb, chess, def) {
  const t0 = talentBb(chess, 0), t1 = talentBb(chess, 1);
  const sid = selectedSkill(chess, def);
  const perDef = num(t0.def_penetrate_ratio, 0.03), perRes = num(t0.magic_resist_penetrate_ratio, 0.02), maxNotes = num(t0.max_cnt, 10);
  const feverOf = (battle, unit) => {
    const m = bstate(battle).fever;
    let f = m.get(unit.ownerId);
    if (!f) m.set(unit.ownerId, (f = { gauge: 0, until: -1 }));
    return f;
  };
  const inFever = (battle, unit) => feverOf(battle, unit).until > battle.time;
  const startFeverIfFull = (battle, unit) => {
    const f = feverOf(battle, unit);
    if (f.gauge >= FEVER_NEED && f.until <= battle.time) {
      f.gauge = 0; f.until = battle.time + FEVER_TIME;
      battle.fx('sunBurst', { x: unit.x, y: unit.y, id: unit.id });
    }
  };
  const recastInFever = { onEnd({ battle, unit, reason }) {
    if (reason === 'stopped' || !inFever(battle, unit) || !live(unit)) return;
    battle.after(0.05, () => { if (live(unit) && unit.skill && !unit.skill.active && inFever(battle, unit)) { unit.skill.gainSp(999, 'fever'); unit.skill.activate?.('fever'); } }, { owner: unit });
  } };
  const notesTimeline = [];
  return {
    skills: {
      // 新月的苏醒 (charges 2): 8 notes, arts, decreasing scales, fanned over the enemies of her range
      skchr_oblvns_1: {
        kind: instantKind(def),
        onStart({ battle, unit }) {
          startFeverIfFull(battle, unit);
          const scales = [bb.atk_scale, bb.atk_scale_2, bb.atk_scale_3, bb.atk_scale_4, bb.atk_scale_5, bb.atk_scale_6, bb.atk_scale_7, bb.atk_scale_8].map((v) => num(v));
          const seq = unit.deploySeq;
          scales.forEach((s, i) => battle.after(0.06 * i, () => {
            if (unit.deploySeq !== seq) return;
            const pool = inRange(battle, unit);
            if (!pool.length) return;
            sortEnemyTargets(battle, unit, pool, null);
            const t = pool[i % pool.length];
            battle.fx('burst', { x: t.x, y: t.y, id: unit.id });
            battle.dealDamage(unit, t, { amount: unit.s.atk * s, type: 'arts', isSkill: true, tags: ['skill', 'note'] });
            notesTimeline.push(battle.time);
          }, { owner: unit }));
        },
        ...recastInFever,
      },
      // 满月的舞会: a cast switches the timbre (piano first)
      skchr_oblvns_2: {
        kind: 'instant',
        onStart({ battle, unit }) {
          startFeverIfFull(battle, unit);
          unit.mem.timbre = unit.mem.timbre === 'piano' ? 'organ' : 'piano';
          battle.fx('spGain', { x: unit.x, y: unit.y, id: unit.id });
        },
      },
      // 残月的余响: range 3-21; each attack: 2 piano notes (phys) at the highest-RES enemy + 2 organ notes (arts) at the
      // highest-DEF one, attack@atk_scale each
      skchr_oblvns_3: {
        kind: 'duration',
        targeting: { rangeGrid: skillGridOf(def), showOwnRange: true },
        attack: { atkScale: num(bb['attack@atk_scale'], 1.8), hits: 2, dmgType: 'phys' },
        onStart({ battle, unit }) { startFeverIfFull(battle, unit); },
        ...recastInFever,
      },
    },
    talents: [
      { install(battle, unit) { // 颂乐音符: DEF / RES ignore per live note
        battle.on('attack', (c) => { if (c.attacker === unit) notesTimeline.push(battle.time); }, { owner: unit });
        battle.every(0.25, () => {
          while (notesTimeline.length && battle.time - notesTimeline[0] > NOTE_LIFE) notesTimeline.shift();
          const n = Math.min(maxNotes, notesTimeline.length);
          if (unit.mem.notes === n) return;
          unit.mem.notes = n;
          battle.addBuff(unit, { key: 'oblvns:notes', duration: Infinity, mods: { defIgnorePct: perDef * n, resIgnorePct: perRes * n } });
        }, { owner: unit });
      } },
      { install(battle, unit) { // 毋畏遗忘: Fever per damage instance; ASPD to operators of her talent range
        const gain = num(t1.cnt, 3);
        battle.on('damaged', (c) => {
          if (c.source !== unit || !(c.amount > 0)) return;
          const f = feverOf(battle, unit);
          if (f.until <= battle.time) f.gauge = Math.min(FEVER_NEED, f.gauge + gain);
        }, { owner: unit });
        const grid = chess?.talents?.find((t) => t && t.index === 1)?.rangeGrid || null;
        installAura(battle, unit, {
          key: 'oblvns:aspd', mods: { aspd: num(t1.attack_speed, 12) }, value: num(t1.attack_speed, 12),
          select: (a) => a !== unit && a.kind === 'op' && alliesInGridOf(battle, unit, grid).includes(a),
        });
      } },
    ],
    install(battle, unit) {
      // module trait: ASPD while 2+ enemies are in range
      const mAspd = num(chess?.trait?.bb?.attack_speed, 0);
      if (mAspd) {
        battle.every(0.25, () => {
          if (!live(unit)) return;
          const want = inRange(battle, unit).length >= 2;
          const has = unit.buffs.some((b) => b.key === 'oblvns:mod');
          if (want && !has) battle.addBuff(unit, { key: 'oblvns:mod', duration: Infinity, mods: { aspd: mAspd } });
          else if (!want && has) battle.removeBuff?.(unit, 'oblvns:mod');
        }, { owner: unit });
      }
      if (sid === 'skchr_oblvns_2') {
        // the timbre (piano by default once she is on the field): mods + damage type; Fever: two hits
        unit.mem.timbre = 'piano';
        battle.every(0.2, () => {
          if (!live(unit)) return;
          const piano = unit.mem.timbre !== 'organ';
          const k = `${piano ? 'p' : 'o'}${inFever(battle, unit) ? 'F' : ''}`;
          if (unit.mem.timbreKey === k) return;
          unit.mem.timbreKey = k;
          battle.addBuff(unit, { key: 'oblvns:timbre', duration: Infinity, mods: piano ? { atkPct: num(bb['attack@atk'], 0.75) } : { aspd: num(bb['attack@attack_speed'], 110) } });
        }, { owner: unit });
        battle.on('beforeAttack', (ctx) => {
          if (ctx.attacker !== unit) return;
          const piano = unit.mem.timbre !== 'organ';
          ctx.profile = { ...ctx.profile, dmgType: piano ? 'phys' : 'arts', hits: inFever(battle, unit) ? 2 : (ctx.profile?.hits ?? 1) };
        }, { owner: unit });
      }
      if (sid === 'skchr_oblvns_3') {
        // S3 targets: the piano notes at the highest-RES enemy; the organ notes (arts) at the highest-DEF one
        battle.on('beforeAttack', (ctx) => {
          if (ctx.attacker !== unit || !unit.skill?.active || unit.skill.id !== 'skchr_oblvns_3') return;
          const pool = inRange(battle, unit);
          if (!pool.length) return;
          const byRes = [...pool].sort((a, b) => num(b.s?.res) - num(a.s?.res))[0];
          const byDef = [...pool].sort((a, b) => num(b.s?.def) - num(a.s?.def))[0];
          ctx.targets = [byRes];
          const seq = unit.deploySeq;
          for (let i = 0; i < 2; i++) {
            battle.after(0.1 * (i + 1), () => {
              if (unit.deploySeq !== seq || !byDef.alive) return;
              battle.dealDamage(unit, byDef, { amount: unit.s.atk * num(bb['attack@atk_scale'], 1.8), type: 'arts', isAttack: true, tags: ['note'] });
            }, { owner: unit });
          }
        }, { owner: unit });
        // Fever: a fatal hit does not knock her out while S3 runs in Fever; she leaves when the Fever ends
        battle.on('fatal', (c) => {
          if (c.unit !== unit || !unit.skill?.active || unit.skill.id !== 'skchr_oblvns_3' || !inFever(battle, unit)) return;
          c.prevented = true;
          if (!unit.mem.feverLeave) {
            unit.mem.feverLeave = true;
            const f = feverOf(battle, unit);
            battle.after(Math.max(0.05, f.until - battle.time), () => { unit.mem.feverLeave = false; if (live(unit)) battle.retreat(unit, { reason: 'retreat' }); }, { owner: unit });
          }
        }, { owner: unit });
      }
    },
  };
}

// ==================================================================================================================
// 望 (陷阱师) — 铸子 / 料敌机先; S1 取势, S2 连星, S3 天下劫; 棋子 (token_10064_wang_stone1)
//
// 棋子 are hand pieces placed in the prep (any deployable tile, ground or high ground — owner's decision 2026-10-05,
// tools/build-diy.mjs makes the token position ALL). PRTS: a stone is 激活 while orthogonally connected to another of
// hers; an enemy (flyers too) entering the tile of an activated stone triggers it; the stone stays. 料敌机先: per stone
// on the continuous straight line through the triggering stone, +per_atk_scale damage and per_magic_resist_penetrate_fixed
// RES ignore (≤ max_trigger_cnt). 铸子 跟子: each placed stone brings one more on an adjacent tile (up > right > down >
// left; also on undeployable ground without units), ≤ attack@max_spawn_cnt stones in all.
// S1 / S2 (AUTO): "立即获得两枚棋子" — the remake has no hand in battle, so the two stones are placed at once on the
// free tiles next to her stones that the enemies' ground routes cross, nearest to an enemy first [ASSUMED]. The stone
// effect follows her selected skill (token variant bySkill: S1 停顿 + DoT, S2 line blast + slow, S3 bigger area).
// S3 (ammo): no attack, range 4-12; gains cnt stones placed on enemies inside the range (one ammo each, a stone a
// second while enemies are there [ASSUMED pace]); trigger range of every stone grows (radius 1.0 [ASSUMED]).

const STONE_ID = 'token_10064_wang_stone1';
const ORTHO = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // up > right > down > left (row 0 = bottom)

function stonesOf(battle, owner) {
  return battle.allies(owner.ownerId).filter((a) => a.kind === 'token' && a.defId === STONE_ID && a.ownerUnit === owner && a.alive);
}
const stoneAt = (stones, r, c) => stones.find((s) => s.tileR === r && s.tileC === c) || null;
/** Stones on the continuous straight line (row or column) through `s`, the longer one. */
function lineCount(stones, s) {
  let best = 1;
  for (const [dr, dc] of [[0, 1], [1, 0]]) {
    let n = 1;
    for (const k of [1, -1]) for (let i = 1; stoneAt(stones, s.tileR + dr * i * k, s.tileC + dc * i * k); i++) n++;
    best = Math.max(best, n);
  }
  return best;
}
/** Direction (axis) of the connection of an activated stone: 'h' | 'v' (the longer run). */
function linkAxis(stones, s) {
  const run = (dr, dc) => { let n = 0; for (const k of [1, -1]) for (let i = 1; stoneAt(stones, s.tileR + dr * i * k, s.tileC + dc * i * k); i++) n++; return n; };
  return run(0, 1) >= run(1, 0) ? 'h' : 'v';
}

function wang(bb, chess, def) {
  const sid = selectedSkill(chess, def);
  const t0 = talentBb(chess, 0);
  const maxStones = Math.max(1, num(t0['attack@max_spawn_cnt'], 9));
  const place = (battle, unit, r, c, opts = {}) => {
    const s = battle.spawnToken(unit, STONE_ID, r, c, { anySource: true, force: !!opts.force });
    if (s) battle.fx('summon', { x: s.x, y: s.y, id: s.id });
    return s;
  };
  /** 跟子: one stone adjacent to `s` (up > right > down > left), deployable or undeployable ground, no unit. */
  const follower = (battle, unit, s) => {
    const stones = stonesOf(battle, unit);
    if (stones.length >= maxStones) return null;
    for (const [dr, dc] of ORTHO) {
      const r = s.tileR + dr, c = s.tileC + dc;
      if (!battle.grid.inRect(r, c) || stoneAt(stones, r, c)) continue;
      const t = battle.grid.tile(r, c);
      const ok = (t.build !== 'NONE') || (t.pass === 'ALL' && t.height === 'LOW');
      if (!ok || battle.grid.isObstacle(r, c)) continue;
      const n = place(battle, unit, r, c, { force: t.build === 'NONE' });
      if (n) return n;
    }
    return null;
  };
  /** S1 / S2 active: stones next to hers on enemy ground routes, nearest to an enemy first. */
  const gainStones = (battle, unit, n) => {
    for (let k = 0; k < n; k++) {
      const stones = stonesOf(battle, unit);
      if (stones.length >= maxStones) return;
      const cand = [];
      const seeds = stones.length ? stones : [unit];
      for (const s of seeds) {
        for (const [dr, dc] of ORTHO) {
          const r = s.tileR + dr, c = s.tileC + dc;
          if (!battle.grid.inRect(r, c) || stoneAt(stones, r, c) || cand.some((x) => x[0] === r && x[1] === c)) continue;
          const t = battle.grid.tile(r, c);
          if (t.build === 'NONE' || battle.grid.isObstacle(r, c)) continue;
          const near = battle.enemies.filter((e) => e.alive).reduce((m, e) => Math.min(m, Math.hypot(e.x - c, e.y - r)), 99);
          const road = t.pass === 'ALL' && t.height === 'LOW' ? 0 : 1;
          cand.push([r, c, road, near]);
        }
      }
      cand.sort((a, b) => a[2] - b[2] || a[3] - b[3]);
      let done = false;
      for (const [r, c] of cand) if (place(battle, unit, r, c)) { done = true; break; }
      if (!done) return;
    }
  };
  return {
    skills: {
      // AUTO, no attack of their own: "立即获得两枚棋子" as soon as the SP is full (not on an attack)
      skchr_wang_1: { kind: 'instant', trigger: { rule: 'SP_FULL' }, onStart({ battle, unit }) { gainStones(battle, unit, Math.max(1, num(bb.cnt, 2))); } },
      skchr_wang_2: { kind: 'instant', trigger: { rule: 'SP_FULL' }, onStart({ battle, unit }) { gainStones(battle, unit, Math.max(1, num(bb.cnt, 2))); } },
      skchr_wang_3: {
        kind: 'ammo', ammo: Math.max(1, num(bb.trigger_time, 20)),
        targeting: { rangeGrid: skillGridOf(def), showOwnRange: true },
        attack: { noAttack: true },
        onStart({ battle, unit }) {
          unit.mem.wangS3 = true;
          let gain = Math.max(1, num(bb.cnt, 8));
          const seq = unit.deploySeq;
          const drop = () => {
            if (unit.deploySeq !== seq || !unit.skill?.active || unit.skill.id !== 'skchr_wang_3') return false;
            const stones = stonesOf(battle, unit);
            if (stones.length >= maxStones) return false;
            const foes = inRange(battle, unit).filter((e) => e.alive && !stoneAt(stones, Math.round(e.y), Math.round(e.x)))
              .sort((a, b) => dist(a, unit) - dist(b, unit));
            for (const e of foes) {
              const s = place(battle, unit, Math.round(e.y), Math.round(e.x), { force: true });
              if (!s) continue;
              unit.skill.ammoLeft = Math.max(0, num(unit.skill.ammoLeft, 1) - 1);
              if (unit.skill.ammoLeft <= 0) unit.skill.end('ammo');
              return true;
            }
            return false;
          };
          while (gain > 0 && drop()) gain--;
          const job = battle.every(1, () => { if (!drop() && !unit.skill?.active) job.cancel(); }, { owner: unit });
        },
        onEnd({ unit }) { unit.mem.wangS3 = false; },
      },
    },
    talents: [
      { install(battle, unit) { // 铸子: each stone placed in the prep brings a 跟子 at the battle start
        battle.on('battleStart', () => {
          if (!live(unit)) return;
          for (const s of stonesOf(battle, unit)) follower(battle, unit, s);
        }, { owner: unit });
      } },
    ],
  };
}

/** 棋子: untargetable, no attack; triggers (owner's selected skill) when an enemy enters its tile while activated. */
function wangStone(bb, raw, def) {
  return {
    skill: {
      kind: 'passive',
      onTick({ battle, unit }) {
        const owner = unit.ownerUnit;
        if (!unit.alive || !owner) return;
        const stones = stonesOf(battle, owner);
        const active = ORTHO.some(([dr, dc]) => stoneAt(stones, unit.tileR + dr, unit.tileC + dc));
        const inside = unit.mem.inside || (unit.mem.inside = new Set());
        const s3 = !!owner.mem?.wangS3;
        const reach = s3 ? 1.0 : 0.5;
        const now = new Set();
        for (const e of battle.enemies) {
          if (!e.alive || e.hidden) continue;
          const on = e.hitArea ? bodyOnTile(e, unit.tileR, unit.tileC) : Math.abs(e.x - unit.tileC) <= reach && Math.abs(e.y - unit.tileR) <= reach;
          if (on) now.add(e.id);
          if (!on || inside.has(e.id) || !active) continue;
          trigger(battle, unit, owner, stones, e, s3);
        }
        unit.mem.inside = now;
      },
    },
    trait: { noAttack: true },
    install(battle, unit) {
      battle.addBuff(unit, { key: 'wang:stone', duration: Infinity, flags: { untargetable: true, invulnerable: true } });
    },
  };

  function trigger(battle, unit, owner, stones, e, s3) {
    const tal = talentBb(owner.def?.raw ?? owner.def, 1);
    const n = Math.min(num(tal['attack@max_trigger_cnt'], 3), lineCount(stones, unit));
    const mul = 1 + num(tal['attack@per_atk_scale'], 0.1) * n;
    const resFlat = num(tal['attack@per_magic_resist_penetrate_fixed'], 9) * n;
    const atk = owner.s?.atk ?? unit.s.atk;
    const sk = owner.skill?.id;
    battle.fx('zone', { x: unit.x, y: unit.y, id: unit.id, r: s3 ? 1.5 : 0.6, dur: 0.6 });
    if (sk === 'skchr_wang_2') {
      // 连星: the enemies within 3 tiles on both sides along the link direction
      const axis = linkAxis(stones, unit);
      const span = 3;
      for (const v of battle.enemies) {
        if (!v.alive || v.hidden) continue;
        const along = axis === 'h' ? Math.abs(v.x - unit.tileC) : Math.abs(v.y - unit.tileR);
        const across = axis === 'h' ? Math.abs(v.y - unit.tileR) : Math.abs(v.x - unit.tileC);
        if (along > span + 0.5 || across > 0.6) continue;
        battle.dealDamage(unit, v, { amount: atk * num(bb.atk_scale, 4.8) * mul, type: 'arts', resIgnoreFlat: resFlat, isSkill: true, tags: ['summon', 'trap'] });
        if (v.alive) battle.applyStatus(v, 'slow', { duration: num(bb.duration, 6), value: Math.abs(num(bb.move_speed, -0.4)), source: owner });
      }
      return;
    }
    if (s3 || sk === 'skchr_wang_3') {
      for (const v of battle.foesInRadius(unit.x, unit.y, 1.5, true)) {
        battle.dealDamage(unit, v, { amount: atk * num(bb.atk_scale, 3.2) * mul, type: 'arts', resIgnoreFlat: resFlat, isSkill: true, tags: ['summon', 'trap'] });
      }
      return;
    }
    // 取势 (default): 停顿 + atk_scale × 望's ATK arts per second for `sluggish` s (independent stacks per stone)
    const dur = num(bb.sluggish, 6.5), scale = num(bb.atk_scale, 1.2);
    battle.applyStatus(e, 'sluggish', { duration: dur, source: owner });
    battle.addBuff(e, {
      key: `wang:dot:${unit.id}`, duration: dur, interval: 1, source: owner, visible: true,
      onTick: ({ unit: t }) => battle.dealDamage(owner, t, { amount: atk * scale * mul, type: 'arts', resIgnoreFlat: resFlat, canDodge: false, ignoreSelect: true, tags: ['dot', 'trap'] }),
    });
  }
}

// ------------------------------------------------------------------------------------------------------------------
// registry

const KITS = { wang, chen3, wisdel, oblvns: sakiko, ascln: ascalon };
const out = {};
for (const [key, f] of Object.entries(KITS)) for (const tier of [5, 6]) out[`chess_diy_${key}_${tier}_a`] = f;
export default Object.freeze(out);

/** Token kits (content/index.js consults them after content/tokens.js); `fromTokens` puts them under the deploy limits. */
const withFlag = (f) => (bb, raw, def) => { const k = f(bb ?? {}, raw ?? {}, def ?? null); if (k && typeof k === 'object') k.fromTokens = true; return k; };
export const tokenKits = Object.freeze({ [STONE_ID]: withFlag(wangStone), [WARD_ID]: withFlag(wisdelWard) });
