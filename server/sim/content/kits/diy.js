// server/sim/content/kits/diy.js — hand-authored kits of the 선발 오퍼레이터 (甄选 / DIY picks, local patch,
// docs/LOCAL-PATCH.md): 望, 赤刃明霄陈, 维什戴尔, 丰川祥子, 阿斯卡纶. Numbers come from each record's blackboards
// (data/diy.json, the official tables at the 甄选 slot status); behaviour from the skill / talent texts and the PRTS
// operator pages (备注), [ASSUMED] where neither says. Registered by content/index.js (operator kits by the
// chess_diy_<key>_<5|6>_a ids — the elite resolves through its baseId) and `tokenKits` (望's 棋子, 维什戴尔's 魂灵之影).
// Runs on the server and in the browser (/sim/content/kits/diy.js).

import { COLS } from '../../constants.js';
import { DIRS, dirVec, normDir } from '../../dir.js';
import { bodyOnTile } from '../../body.js';
import { isHpLoss } from '../../damage.js';
import { sortEnemyTargets, enemyStealthed, canTargetEnemy } from '../../targeting.js';
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
      const overload = () => {
        const sk = unit.skill;
        if (!sk?.active || sk.id !== 'skchr_wisdel_2') return false;
        const total = num(sk.duration, 25), left = num(sk.timeLeft, total);
        return left <= total / 2;
      };
      // local patch 2026-10-06: the main shot's atk_scale_ol lives on her own profile (a copy, like 丰川祥子 S2) —
      // ai.js performAttack never reads back a `beforeAttack` ctx.profile, so the main shot kept the full scale.
      // Restored when the overload ends; re-applied when Battle._setupUnit resolves a fresh profile. Checked every step
      // (the scheduled phase runs before the allies attack; review 2026-10-06: at 0.2 s the main shot and the 4 shots
      // could disagree for up to 0.2 s), and the 4 shots follow the applied profile, not a fresh overload() reading.
      battle.every(battle.dt, () => {
        const on = live(unit) && overload();
        const m = unit.mem;
        if (on) {
          if (unit.profile === m.olProfile) return;
          m.olBase = unit.profile;
          if (!m.olBase) return;
          unit.profile = m.olProfile = { ...m.olBase, atkScale: num(bb['attack@atk_scale_ol'], 0.7) };
        } else if (m.olProfile) {
          if (unit.profile === m.olProfile) unit.profile = m.olBase;
          m.olProfile = m.olBase = null;
        }
      }, { owner: unit, immediate: true });
      battle.on('beforeAttack', (ctx) => {
        if (ctx.attacker !== unit || !unit.mem.olProfile || unit.profile !== unit.mem.olProfile) return;
        const pool = inRange(battle, unit).filter((e) => !e.isFlying);
        if (!pool.length) return;
        ctx.targets = [battle.rng.pick(pool)];
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
          // local patch (audit 2026-10-06): rangeKeys is an array — `.has?.` was undefined, so the spread never ran
          const inR = unit.rangeKeySet || new Set(unit.rangeKeys || []);
          if (!inR.has(Math.round(e.y) * COLS + Math.round(e.x))) return;
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
// S3 剑气 (PRTS 备注): "剑气可对空，碰撞半径1.3，移动速度1.5，每次转向前对每个敌人仅判定一次伤害"; "在距离前进方向上的
// 侵入点/保护目标/高度类型为高地的地块的距离不低于0.25时，顺时针旋转90°". Current-HP hp_ratio arts (≥ projectile_min_atk_scale × ATK).
// local patch (2026-10-06) — EN client battle/prefabs/[uc]projectiles.ab `projectile_chr_chen3_s3`:
//   movement: straight (_moveType 4) from her facing (_useSourceDirection), _speed 1.5; untimed (_lifeTimeType 2 — [inferred]:
//     other type-2 projectiles carry _lifeTime 0) and finished at the skill end by chen3_s3[finish_projectile]
//     (FinishManagedProjectiles, _managedBySource).
//   turning (ChangeStateWithHighlandBehaviour): _hitDistance 0.25, _hitEps 0.02, checks _checkHitHighland, _checkHitMapEdge,
//     _checkTileStart (侵入点), _checkTileEnd (保护目标) on the NEXT tile ahead (_CheckNextTile*, _GetDistanceToNextTile) →
//     _ChangeDirection, _clearTargetsAlreadyHitListWhenHit. Nothing else is an obstacle: lowland impassable tiles and
//     things standing on a tile (roadblocks) are not ([inferred] from the flag list). It has no direction field; clockwise
//     is PRTS. The distance is to the next tile's near edge ([inferred] from "_GetDistanceToNextTile" and PRTS), so it turns
//     0.25 past the centre of the last free tile — before 2026-10-06 we looked 0.75 ahead and turned 0.5 too early, counted
//     lowland impassable / blocked tiles and ignored 侵入点.
//   hits: CircleCollider2D radius 1.3 (_ignoreRangeScale), _hitPasserby every 0.03 s (_interval; the sim ticks 1/30 s),
//     ground + air, each enemy once until a turn clears the list (_canHitSameTargetMultipleTimes 0, _maxHitNum 9999).

const QI_SPEED = 1.5, QI_RADIUS = 1.3, QI_LOOK = 0.25, QI_EPS = 0.02, S2_INTERVAL = 0.4, S2_PASS_RADIUS = 1.7;

/**
 * One tick of the S3 剑气 (exported for tests). `st` = { x, y, d } (x = col, y = row, d ∈ UP/RIGHT/DOWN/LEFT) is updated in
 * place: turn 90° clockwise while the next tile ahead is an obstacle within QI_LOOK (+ QI_EPS), then move `dist`, stopping
 * on the QI_LOOK mark in front of an obstacle. Returns the number of turns. `grid` needs inRect(r, c) and tile(r, c).
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
  for (; turns < 4; turns++) {
    const a = ahead(st.d);
    if (!a.wall || a.gap > QI_LOOK + QI_EPS) break;
    st.d = DIRS[(DIRS.indexOf(st.d) + 1) % 4];
  }
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
      for (const e of battle.foesInRadius(x, y, QI_RADIUS)) {
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
// Ave Mujica member on a remake field) def_penetrate_ratio DEF / magic_resist_penetrate_ratio RES ignore, ≤ max_cnt.
// Notes (local patch 2026-10-06, EN client [uc]projectiles.ab projectile_chr_oblvns* + PRTS 备注; NOTE below): every
// note is simulated here (noteStep) — the engine projectile of a normal attack is taken over (its own onHit = the
// engine's resolveHit lands when the note arrives), skill / blank notes are the kit's. A note flies free (her facing ±20°,
// S1 fanned) for ≥ `switch` s, then traces its target (the attack's target; else the nearest selectable enemy within
// `seek` tiles of the NOTE, searched every `tick` s — PRTS "选择自身一定范围内距离音符自身最近的可选目标"); a target that
// dies sends it back to free flight. It ends on a hit, after `delay` (talent bb, client passby_delay 1 s) continuous s
// outside her attack range without a target (PRTS "音符位于自身攻击范围外时，若连续1s以上不存在跟踪目标则消失" — so notes
// fly past the range edge before they go). No timed lifetime: the prefabs' `_lifeTime` 10 has `_lifeTimeType` 2, a type
// that 57 client projectiles use with `_lifeTime` 0 (shields, rays living until their logic ends) — so not a timer
// [inference]; NOTE_SAFETY only bounds a note that could chase forever (a sim guard, not a game rule).
// When she leaves, every note not tracing is cleared (PRTS "自身退场时，清除所有不处于【跟踪移动】状态的音符"). The note
// count is the live notes (client: oblvns_t_1[cnt] +1 on a note's birth, −1 on its end). One note per attack (S2 Fever /
// S3 piano: 2, their profile hits), 8 per S1 cast, S3 + 2 organ notes. Each note change is a battle.fx 'oblvnsNote' event
// for the client's official note effect (render/fxgame.js).
// 持续攻击 (talent 1, local patch 2026-10-05; namu 4.6 / PRTS 备注): with no enemy in range she keeps attacking at her
// attack interval — each such attack recovers attack-type SP and plays an untargeted note (counts for the stacks), which
// hits whatever it finds near it with the ATK cached at its attack ("所有音符强制使用缓存攻击力与攻击倍率"). No note (and
// no attack) while the tile in front of her has 通行类型 无 (PRTS 备注). Client: 持续攻击 = "RangedAlways" abilities —
// projectile_chr_oblvns_talent (no skill), _s2_t / _s2_slow_t (S2), _s3_phy + _s3_mag (S3).
// Module LOR-Y stage 2+ (talent 1 fromModule): "技能期间远程攻击不再降低攻击力" — no 80 % cut while a skill is active.
// 毋畏遗忘: every damage instance of hers on an enemy (notes too): Fever +cnt; operators inside her current attack range,
// herself included (namu 4.6 "자신을 포함한"; S3's wider range counts), get ASPD +attack_speed (the 范围延伸 to other
// Ave Mujica members has nobody to apply to). Fever (gamedata_const: "Fever累计至450点时，任意一位Ave Mujica成员手动
// 触发技能后，在场所有Ave Mujica成员20秒内会持续释放当前技能"): a skill cast at ≥ 450 starts 20 s in which her skill
// recasts as soon as it ends, SP-free; S2 attacks hit twice; under S3 a fatal hit does not knock her out until it ends.
// S2 满月的舞会 (a mode, no duration): piano (start: ATK +attack@atk, phys) ↔ organ (ASPD +attack@attack_speed, arts);
// each cast switches [ASSUMED: the remake casts automatically, so a cast toggles the timbre].

const FEVER_NEED = 450, FEVER_TIME = 20, NOTE_SAFETY = 60;
/**
 * Note flight per client projectile prefab (tiles/s, s): `free` the free-flight speed (`sine`: its 扩张正弦 amplitude,
 * drawn by the client only — the sim flies straight), tracing at `track` turning `turn`/s (direction lerp; PRTS "转向速度
 * 7/30每帧" = 7 at 30 fps), free for ≥ `switch` s, target search every `tick` s within `seek` tiles of the note (PRTS
 * 跟踪范围半径), hit within `hit` tiles (piano: its 0.8 collision; others [ASSUMED] contact), `fx` the client trail.
 * base = projectile_chr_oblvns (an attack with a target), talent = _talent (持续攻击 without a skill), s1 = _s1_1…8,
 * piano = _s2 / _s2_t, organ = _s2_slow / _s2_slow_t, s3 = _s3_phy (piano), s3m = _s3_mag (organ, the same movement).
 */
const NOTE = Object.freeze({
  base: { free: 2.0, track: 2.0, turn: 5, switch: 0.1, tick: 0.4, seek: 1.0, hit: 0.2 },
  talent: { free: 1.3, sine: 0.3, track: 2.0, turn: 7, switch: 0.1, tick: 0.4, seek: 1.0, hit: 0.2 },
  s1: { free: 1.7, track: 2.2, turn: 5, switch: 0.6, tick: 0.2, seek: 1.0, hit: 0.2 },
  piano: { free: 1.9, sine: 0.4, track: 3.5, turn: 15, switch: 0.4, tick: 0.2, seek: 0.8, hit: 0.8 },
  organ: { free: 0.7, sine: 0.15, track: 1.0, turn: 2.5, switch: 0.4, tick: 0.4, seek: 1.0, hit: 0.2 },
  s3: { free: 0.8, sine: 0.5, track: 1.3, turn: 7.5, switch: 0.8, tick: 0.4, seek: 1.0, hit: 0.2 },
  s3m: { free: 0.8, sine: 0.5, track: 1.3, turn: 7.5, switch: 0.8, tick: 0.4, seek: 1.0, hit: 0.2 },
});
/** Free-flight spread around her facing (PRTS: "自身朝向左20°至右20°范围内，随机一个角度"; [ASSUMED] for skill notes too). */
const NOTE_ARC = 20;
let noteSeq = 0;
/** The note flight table (render/fxmap.js NOTE_FLIGHT draws with a copy; the tests compare them). */
export const OBLVNS_NOTE = NOTE;

function sakiko(bb, chess, def) {
  const t0 = talentBb(chess, 0), t1 = talentBb(chess, 1);
  const sid = selectedSkill(chess, def);
  const perDef = num(t0.def_penetrate_ratio, 0.03), perRes = num(t0.magic_resist_penetrate_ratio, 0.02), maxNotes = num(t0.max_cnt, 10);
  const noteDelay = num(t0.delay, 1);
  /** The movement key of her current attack notes (the client's projectile of the ability she attacks with). */
  const modeOf = (unit, blank = false) => (s3On(unit) ? 's3' : sid === 'skchr_oblvns_2' ? (unit.mem.timbre === 'organ' ? 'organ' : 'piano') : blank ? 'talent' : 'base');
  const skillNoRangedCut = !!(chess?.talents ?? []).find((t) => t && t.index === 0)?.fromModule; // LOR-Y stage 2+
  const s3On = (unit) => !!unit.skill?.active && unit.skill.id === 'skchr_oblvns_3';
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
  // ---- notes (local patch 2026-10-06): see the header. A note: { id, mode, x, y, dx, dy, age, state 'free'|'track',
  // target, seekT, outT, w (count: 2 = a two-hit note), hit(target) }
  const notesOf = (unit) => unit.mem.noteList || (unit.mem.noteList = []);
  const noteFx = (battle, unit, n, e, extra = null) => battle.fx('oblvnsNote', {
    x: n.x, y: n.y, id: unit.id, n: n.id, e, m: n.mode, a: Math.round((Math.atan2(n.dy, n.dx) * 180) / Math.PI),
    ...(n.target ? { t: n.target.id } : null), ...(n.w > 1 ? { w: n.w } : null), ...(n.fan ? { i: n.fan } : null), ...extra,
  });
  /**
   * A new note from her position: `deg` its free-flight heading off her facing (default: random ±NOTE_ARC), `target`
   * the attack's target (traced after the free flight), `hit(target)` its damage, `w` how many notes it stands for.
   */
  const spawnNote = (battle, unit, { mode, target = null, hit, w = 1, deg = null, fan = 0 }) => {
    const [dr, dc] = dirVec(unit.dir);
    const off = ((deg ?? (battle.rng() * 2 - 1) * NOTE_ARC) * Math.PI) / 180;
    const base = Math.atan2(dr, dc);
    const n = { id: ++noteSeq, mode, x: unit.x, y: unit.y, dx: Math.cos(base + off), dy: Math.sin(base + off), age: 0, state: 'free',
      target: target && target.alive ? target : null, seekT: 0, outT: 0, w, hit, fan };
    notesOf(unit).push(n);
    noteFx(battle, unit, n, 'born');
    return n;
  };
  const noteTargetOk = (t) => !!t && t.alive && !t.hidden && t.deployed !== false && canTargetEnemy(null, t, ANY);
  /** One sim step of her notes (the 'tick' hook, after the projectiles phase). */
  const noteStep = (battle, unit, dt) => {
    const list = unit.mem.noteList;
    if (!list || !list.length) return;
    const home = live(unit);
    const keys = home ? unit.rangeKeySet || new Set(unit.rangeKeys || []) : null;
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i], mv = NOTE[n.mode];
      const end = (e, extra) => { list.splice(i, 1); noteFx(battle, unit, n, e, extra); };
      if (!home && n.state !== 'track') { end('gone'); continue; }   // she left: only the tracing notes stay
      n.age += dt;
      if (n.target && !noteTargetOk(n.target)) {   // its target is gone: free flight on in the current direction
        n.target = null;
        if (n.state === 'track') { n.state = 'free'; noteFx(battle, unit, n, 'free'); }
        if (!home) { end('gone'); continue; }
      }
      if (!n.target && (n.seekT -= dt) <= 0) {
        n.seekT = mv.tick;
        let best = null, bd = Infinity;
        for (const e of battle.foesInRadius(n.x, n.y, mv.seek, true)) {
          if (!noteTargetOk(e)) continue;
          const d = Math.hypot(e.x - n.x, e.y - n.y);
          if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && best && e.spawnSeq < best.spawnSeq)) { bd = d; best = e; }
        }
        n.target = best;
      }
      if (n.state === 'free' && n.target && n.age >= mv.switch) { n.state = 'track'; noteFx(battle, unit, n, 'track'); }
      let speed = mv.free;
      if (n.state === 'track') {
        speed = mv.track;
        const tx = n.target.x - n.x, ty = n.target.y - n.y, d = Math.hypot(tx, ty);
        if (d <= Math.max(mv.hit, speed * dt)) { const t = n.target; end('hit'); battle._safe(() => n.hit(t, n), 'oblvns.note', unit); continue; }
        const k = Math.min(1, mv.turn * dt);
        let ndx = n.dx + (tx / d - n.dx) * k, ndy = n.dy + (ty / d - n.dy) * k;
        const l = Math.hypot(ndx, ndy);
        if (l > 1e-6) { n.dx = ndx / l; n.dy = ndy / l; } else { n.dx = tx / d; n.dy = ty / d; }
      }
      n.x += n.dx * speed * dt; n.y += n.dy * speed * dt;
      if (n.age >= NOTE_SAFETY) { end('gone'); continue; }   // the sim guard only (see the header)
      const inside = home && keys.has(Math.round(n.y) * COLS + Math.round(n.x));
      n.outT = inside || n.target ? 0 : n.outT + dt;
      if (n.outT >= noteDelay) end('gone');
    }
  };
  /** S3: the 2 organ notes of an attack (_s3_mag, arts, attack@atk_scale with the ATK of the attack), 0.1 s apart. */
  const s3Organ = (battle, unit, target) => {
    const seq = unit.deploySeq, amount = unit.s.atk * num(bb['attack@atk_scale'], 1.8);
    for (let i = 0; i < 2; i++) {
      battle.after(0.1 * (i + 1), () => {
        if (unit.deploySeq !== seq || !live(unit)) return;
        spawnNote(battle, unit, { mode: 's3m', target: target && target.alive ? target : null,
          hit: (t) => battle.dealDamage(unit, t, { amount, type: 'arts', isAttack: true, tags: ['note'] }) });
      }, { owner: unit });
    }
  };
  /** Live notes (the 颂乐音符 count). */
  const noteCount = (unit) => (unit.mem.noteList || []).reduce((a, n) => a + n.w, 0);
  return {
    skills: {
      // 新月的苏醒 (charges 2): 8 notes, arts, decreasing scales, fanned over the enemies of her range
      skchr_oblvns_1: {
        kind: instantKind(def),
        onStart({ battle, unit }) {
          startFeverIfFull(battle, unit);
          const scales = [bb.atk_scale, bb.atk_scale_2, bb.atk_scale_3, bb.atk_scale_4, bb.atk_scale_5, bb.atk_scale_6, bb.atk_scale_7, bb.atk_scale_8].map((v) => num(v));
          const seq = unit.deploySeq;
          // local patch 2026-10-06: 8 notes (client projectile_chr_oblvns_s1_1…8), fanned around her facing by
          // _sourceDirectionArcAngleRatio (2i+1)/16 [ASSUMED: of a full turn], each at an enemy of her range, the damage
          // (ATK cached at the cast) when it arrives
          scales.forEach((s, i) => battle.after(0.06 * i, () => {
            if (unit.deploySeq !== seq || !live(unit)) return;
            const pool = inRange(battle, unit);
            if (pool.length) sortEnemyTargets(battle, unit, pool, null);
            const amount = unit.s.atk * s;
            spawnNote(battle, unit, { mode: 's1', target: pool.length ? pool[i % pool.length] : null, deg: ((2 * i + 1) / 16) * 360, fan: i + 1,
              hit: (t) => {
                battle.fx('burst', { x: t.x, y: t.y, id: unit.id });
                battle.dealDamage(unit, t, { amount, type: 'arts', isSkill: true, tags: ['skill', 'note'] });
              } });
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
          unit.mem.applyTimbre?.();
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
      { install(battle, unit) { // 颂乐音符: DEF / RES ignore per live note; 持续攻击; module: no ranged cut during a skill
        // local patch 2026-10-06: her attack's engine projectile becomes a note — taken off the projectile list the moment
        // it is fired (ai.js performAttack emits 'attack' right after adding it) and flown by noteStep; its own onHit
        // (resolveHit: profile damage type, hits, ranged cut, attackId) lands when the note arrives, on the note's target
        // then. [ASSUMED] the hit reads her ATK at arrival (the engine's resolveHit), not the cached ATK of PRTS.
        battle.on('attack', (c) => {
          if (c.attacker !== unit) return;
          const P = battle.projectiles;
          const mine = P.list.filter((p) => p.source === unit && p.age === 0 && p.onHit);
          if (!mine.length) return;
          P.list = P.list.filter((p) => !mine.includes(p));
          const mode = modeOf(unit), w = Math.max(1, num(battle.effectiveProfile(unit)?.hits, 1)); // S3's hits: 2 is a skill override
          for (const p of mine) {
            spawnNote(battle, unit, { mode, target: p.target, w, hit: (t, n) => p.onHit({ battle, projectile: p, target: t, x: n.x, y: n.y }) });
          }
        }, { owner: unit });
        // 持续攻击 (local patch): the step's attack loop (ai.js updateAlly, before 'tick') found no target — attack anyway.
        // The notes fly every step here (owner-bound hooks stay after she leaves: tracing notes still land).
        battle.on('tick', () => {
          noteStep(battle, unit, battle.dt);
          if (!live(unit) || !unit.canAct || !unit.profile) return;
          if (unit.blocking.length || unit.atkCd > 0 || unit.s.flags.disarm || inRange(battle, unit).length) return;
          const [dr, dc] = dirVec(unit.dir);
          const fr = unit.tileR + dr, fc = unit.tileC + dc;
          if (!battle.grid.inRect(fr, fc) || battle.grid.tile(fr, fc).pass === 'NONE') return;   // PRTS: no note to play
          unit.atkCd = unit.s.interval;
          // the skill-applied profile (ai.js effectiveProfile — S3's atk_scale / hits / phys are a skill override; review
          // 2026-10-06: unit.profile is the base one, so S3 blank notes were 1 hit at 1.0 × ATK)
          const prof = battle.effectiveProfile(unit);
          battle._ev(['atk', unit.id, null, prof.projectile || 'arrow']);   // the attack clip, no target
          // the cached ATK × attack scale of this attack; S2 organ: arts (its profile copy); S2 Fever / S3: two hits
          const atk = unit.s.atk * num(prof.atkScale, 1) * num(unit.s.atkScaleMul, 1);
          const type = prof.dmgType === 'arts' ? 'arts' : 'phys', hits = Math.max(1, num(prof.hits, 1));
          spawnNote(battle, unit, { mode: modeOf(unit, true), w: hits, hit: (t) => {
            const dm = prof.dmgMul;
            const cut = skillNoRangedCut && unit.skill?.active ? 1 : num(typeof dm === 'function' ? dm(battle, unit, t) : dm, 1);
            for (let h = 0; h < hits && t.alive; h++) battle.dealDamage(unit, t, { amount: atk * cut, type, isAttack: true, tags: ['note', 'blankNote'] });
          } });
          if (s3On(unit)) s3Organ(battle, unit, null);   // S3: + 2 organ notes (_s3_mag)
          const sk = unit.skill;   // attack-type SP, as for any attack that is not a skill attack (skills.js onAttackPerformed)
          if (sk && !sk.noSkill && sk.spType === 'attack' && !(sk.active && sk.isTimed)) sk.gainSp(1, 'attack');
        }, { owner: unit });
        // LOR-Y stage 2+: "技能期间远程攻击不再降低攻击力" — undo the trait's ranged cut on her attacks while a skill runs
        if (skillNoRangedCut) battle.on('hit', (c) => {
          const d = c.dmg;
          if (c.source !== unit || !d?.isAttack || !unit.skill?.active || d.tags?.includes('note')) return;
          const dm = unit.profile?.dmgMul;
          const m = num(typeof dm === 'function' ? dm(battle, unit, c.target) : dm, 1);
          if (m > 0 && m < 1) d.amount /= m;
        }, { owner: unit });
        battle.every(0.25, () => {
          const n = Math.min(maxNotes, noteCount(unit));
          if (unit.mem.notes === n) return;
          unit.mem.notes = n;
          battle.addBuff(unit, { key: 'oblvns:notes', duration: Infinity, mods: { defIgnorePct: perDef * n, resIgnorePct: perRes * n } });
        }, { owner: unit });
      } },
      { install(battle, unit) { // 毋畏遗忘: Fever per damage instance on an enemy; ASPD to the operators of her range
        const gain = num(t1.cnt, 3);
        battle.on('damaged', (c) => {
          if (c.source !== unit || !(c.amount > 0) || c.target?.side !== 'enemy') return;
          const f = feverOf(battle, unit);
          if (f.until <= battle.time) f.gauge = Math.min(FEVER_NEED, f.gauge + gain);
        }, { owner: unit });
        // local patch: her current attack range (S3's wider one too), herself included (namu 4.6)
        installAura(battle, unit, {
          key: 'oblvns:aspd', mods: { aspd: num(t1.attack_speed, 12) }, value: num(t1.attack_speed, 12),
          select: (a) => a.kind === 'op' && alliesInGridOf(battle, unit, null).includes(a),
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
        // the timbre (piano by default once she is on the field): mods + damage type; Fever: two hits.
        // local patch 2026-10-06: the damage type / hits live on her own profile (a copy of the resolved one, like
        // tier5.js) — ai.js performAttack never reads back a `beforeAttack` ctx.profile, so organ stayed phys and the
        // Fever double hit never happened. Re-applied when Battle._setupUnit resolves a fresh profile.
        unit.mem.timbre = 'piano';
        // every step (scheduled phase, before the allies attack) and at once when S2 switches (review 2026-10-06: at
        // 0.2 s the first attacks after a switch kept the old damage type)
        const applyTimbre = unit.mem.applyTimbre = () => {
          if (!live(unit)) return;
          const piano = unit.mem.timbre !== 'organ';
          const fever = inFever(battle, unit);
          const k = `${piano ? 'p' : 'o'}${fever ? 'F' : ''}`;
          if (unit.mem.timbreKey === k && unit.profile === unit.mem.timbreProfile) return;
          if (unit.mem.timbreKey !== k) {
            unit.mem.timbreKey = k;
            battle.addBuff(unit, { key: 'oblvns:timbre', duration: Infinity, mods: piano ? { atkPct: num(bb['attack@atk'], 0.75) } : { aspd: num(bb['attack@attack_speed'], 110) } });
          }
          if (unit.profile !== unit.mem.timbreProfile) unit.mem.timbreBase = unit.profile;
          const base = unit.mem.timbreBase;
          if (!base) return;
          unit.profile = unit.mem.timbreProfile = { ...base, dmgType: piano ? 'phys' : 'arts', hits: fever ? 2 : (base.hits ?? 1) };
        };
        battle.every(battle.dt, applyTimbre, { owner: unit, immediate: true });
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
          s3Organ(battle, unit, byDef);
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
// Sources: the official tables (character_table / skill_table: talents, skills, the token's sktok_wang_1..3 and its
// x-6 range, overridden by the sktok_wang_3 prefab's x-1) and PRTS 「望」 备注 (fetched 2026-10-05). Rules followed:
// - 棋子 = 陷阱: not an attack target, takes no damage (persistent untargetable + invulnerable; no HP bar on the client,
//   shared/trap-tokens.js). A stone is 激活 once orthogonally connected to another stone or 跟子 of hers, and stays
//   active after that neighbour leaves (latched; namu: "연결된 바둑돌이 사라져도 유지"); a selectable enemy (flyers too; no unrevealed 隐匿 one —
//   stoneSelectable) entering the trigger area of an activated stone triggers it and USES IT UP (陷阱师 traps: "踩上去的
//   第一个敌人会触发其效果"; the token has an ON_UNIT_DEAD sound; user report 2026-10-05). A used-up placed stone comes back
//   on its own tile like the mode's redeploys (Battle.redeploy / tokens.js enableRespawn): after its respawnTime, for its
//   DP cost (卫戍协议 in-battle DP: 10, +1/s), once no enemy stands there — the card itself comes back (token deck rule), no stock is spent. The trigger area is the
//   stone's own tile, with S3 equipped (its passive: "棋子的触发和伤害范围扩大") x-1, a radius-2 diamond of 13 tiles (the
//   sktok_wang_3 prefab's SkillTrigger / Selector and PRTS 天下劫 "携带该技能时…x-1"; the table's x-6 cross is in no prefab —
//   owner's decision 2026-10-06: the official diamond)
//   and every enemy in it is hit — a high-ground stone thus catches ground enemies with S3; with S2 only a flyer
//   entering its tile triggers it, and the line blast then hits ground enemies too.
// - Stones are hand pieces placed in the prep (any deployable tile, ground or high ground — owner's decision 2026-10-05,
//   tools/build-diy.mjs makes the token position ALL). They stay exactly where they were placed: the battle-start
//   deployment is automatic, and 铸子's 跟子 comes only with a MANUAL deployment ("手动部署棋子时") — so none at the
//   battle start (it used to add one per stone, and those, counted under the deploy limit, withdrew the oldest placed
//   stones: the layout changed when the battle began).
// - 跟子 (铸子, E1+): PRTS "通过天赋'额外部署的棋子'实为望自身发射的弹道 由此其不具有单位相关的性质（例如占据空位等）" — not a unit: it never counts under the stone deploy limit
//   (maxDeployCount) and occupies no tile; ≤ attack@max_spawn_cnt of them. Tile: one of the 4 neighbours, enemy tiles
//   first, then undeployable ground > deployable ground > deployable high ground (never undeployable high ground), ties
//   random (client _alwaysRandomInTheEnd 1; PRTS's up > right > down > left is not used); only where no character unit stands. It needs no stock and is drawn as a stone. It links like a stone; its damage comes from 望.
// - Stock (手牌): maxDeckStackCnt in all; at the battle start the stones not placed [ASSUMED: deckStack − placed].
//   S1 / S2: "立即获得两枚棋子", 阻回 while the stock is full (PRTS 备注). S3: gains cnt, the stones above the stock limit
//   go out as 跟子 on the enemies of her range (PRTS: "技能开启时自动部署的为第一天赋的跟子"); manual deployments in her
//   range may go on enemy tiles and bring up to 3 extra 跟子 for as much ammo; it ends when stopped or out of stones,
//   the ammo left returns as stones.
// - [ASSUMED] 卫戍协议 battles take no manual deployment: like the mode's 自动操作 of skills, stones of the stock are
//   deployed automatically (S1 / S2: on the free deployable tile next to her stones that an enemy route crosses,
//   nearest to an enemy, no enemy on it — trait; S3: on an enemy tile of her range, one a second) while fewer than
//   maxDeployCount stones stand; S3 stops itself once it can deploy no more. The used-up stones waiting for a redeploy
//   come first: new tiles only beyond them. A deployment from the stock pays the stone's DP cost too.
// - 取势: 停顿 + atk_scale × 望's ATK arts per second for `sluggish` s (independent per trigger, from 望).
//   连星: arts atk_scale × 望's ATK to the enemies within 3 tiles on both sides along the link direction (vertical
//   when linked up / down, horizontal when left / right; once activated a direction stays, PRTS 备注) + slow.
//   料敌机先: per stone on the continuous straight line through the triggering stone, +per_atk_scale damage and
//   per_magic_resist_penetrate_fixed flat RES ignore (≤ max_trigger_cnt); latched per stone at the longest line it
//   has seen (namu: 3 linked, one leaves → the others keep 3).

const STONE_ID = 'token_10064_wang_stone1';
const ORTHO = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // up > right > down > left (row 0 = bottom)
const WANG_S3_PACE = 1; // [ASSUMED] one automatic deployment a second while S3 runs
/**
 * Tiles no 跟子 may take (local patch 2026-10-06, user: "적 공격 포인트"): the client 跟子 selector has `exceptTileTypes`
 * with tileTypesMask 14. Torappu TileTypesMask bits, in the order of battle_misc_table tileTypeDict (DEFAULT 1 assumed
 * first, then END 2, START 4, HOLE 8, FAKE_HIGHLAND 16, RESPAWN_ABNORMAL 32) → 14 = END | START | HOLE:
 * tile_end / tile_end_cooperate / tile_allygoal, tile_start / tile_start_cooperate / tile_enemygoal, tile_hole.
 */
const FOLLOWER_EXCEPT_TILES = new Set(['tile_end', 'tile_end_cooperate', 'tile_allygoal', 'tile_start', 'tile_start_cooperate', 'tile_enemygoal', 'tile_hole']);
const WANG_S3_EXTRA = 3; // "第一天赋额外至多部署3枚棋子"

function stonesOf(battle, owner) {
  return battle.allies(owner.ownerId).filter((a) => a.kind === 'token' && a.defId === STONE_ID && a.ownerUnit === owner && a.alive);
}
const isFollower = (s) => !!s?.mem?.wangFollower;
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
/** The S3-equipped stone's x-1 trigger / damage area (radius-2 diamond, 13 tiles) as [dr, dc] offsets. */
const DIAMOND2 = Object.freeze([[0, 0], [1, 0], [2, 0], [-1, 0], [-2, 0], [0, 1], [0, 2], [0, -1], [0, -2], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
const enemiesOnTile = (battle, r, c) => battle.enemies.filter((e) => e.alive && !e.hidden && Math.round(e.y) === r && Math.round(e.x) === c);
/** Walking enemies on a tile: the only ones that block a stone's placement / redeploy (client _excludeOccupiedByWalkEnemy). */
const walkersOnTile = (battle, r, c) => enemiesOnTile(battle, r, c).filter((e) => !e.isFlying);
/**
 * An enemy a stone can select (trigger on, hit): PRTS 作战机制 §AOE伤害判定 "AOE的判定是对攻击范围内的每个可以被选中的敌人进行
 * 判定" and 隐匿 "一般无法被敌方的索敌机制和Buff选择器选中为目标" (Battle.foesInRadius: no untargetable, no unrevealed 隐匿 one);
 * PRTS 望 备注 "棋子的索敌…" — the stones select like any summon (user report 2026-10-05: 은신 enemies took the blast).
 */
const stoneSelectable = (e) => e.alive && !e.hidden && !e.s.flags.untargetable && !(e.s.flags.stealth && enemyStealthed(e));
/**
 * S3 enemy tiles, most urgent first: the official text only says "优先部署在范围内敌人所在位置" (client WangTileSelector
 * SKILL_3_INSTANT sorts natively, no distance sort in its data; PRTS orders by enemy / tile class only) — local patch
 * (user decision 2026-10-06) [추정]: the enemy closest to its goal first (default targeting: remaining path, then spawn order).
 */
const goalFirst = (battle, list) => list.sort((a, b) => battle.remainingDistance(a) - battle.remainingDistance(b) || a.spawnSeq - b.spawnSeq);
const wangSkill = (owner) => owner?.skill?.id ?? owner?.def?.skill?.id ?? null;

function wang(bb, chess, def) {
  const sid = selectedSkill(chess, def);
  const t0 = talentBb(chess, 0);
  const followerCap = Math.max(0, num(t0['attack@max_spawn_cnt'], 0));
  const stoneStats = (battle, unit) => battle.data.getToken?.(STONE_ID, unit.defId, unit.def?.loadout ?? null)?.stats ?? {};
  // stock = the stone cards in her hand, ≤ deckCap ("最多拥有": the client's card counts — wang_s3_charge_token
  // max_cnt / remaining_cnt via AssignTokenCardCntToBB, _stopSpWhenTokenIsFull; local patch 2026-10-06: not field + hand)
  const st = (unit) => unit.mem.wang || (unit.mem.wang = { stock: 0, deckCap: 7, fieldCap: 6, prepPlaced: 0 });
  const placed = (battle, unit) => stonesOf(battle, unit).filter((s) => !isFollower(s));
  const followers = (battle, unit) => stonesOf(battle, unit).filter(isFollower);
  /** Placed stones used up by a trigger, waiting to be redeployed on their own tile. */
  const waitingOf = (battle, unit) => battle.allyUnits.filter((t) => t.kind === 'token' && t.defId === STONE_ID && t.ownerUnit === unit
    && !t.alive && !t.removed && t.mem.wangUsed);
  /** Battle.isReservedTile without the home tiles of her own used stones waiting to be redeployed. */
  const reservedForOthers = (battle, unit, r, c) =>
    battle.isReservedTile(r, c, (a) => a.kind === 'token' && a.defId === STONE_ID && a.ownerUnit === unit && a.mem.wangUsed);
  /**
   * A consumed stone is a card again (the token deck: a summon that leaves returns to the hand after its 再部署时间,
   * respawnTime — the official token rule, so the stock is the deck, not a count used up) and comes back on its own
   * tile like any redeploy of the mode (tokens.js enableRespawn / Battle.redeploy): after its respawnTime, paying its DP
   * cost; the tile must be free of units and enemies (trait). [ASSUMED] she must be on the field (a hand piece of hers).
   * User report 2026-10-06: the earlier model took a stock stone for every redeploy, the stock was 7 − placed (1 with
   * the usual 6 on the board), so after one redeploy no stone came back until S1 / S2.
   */
  const redeployUsed = (battle, unit) => {
    if (!live(unit)) return;
    for (const t of waitingOf(battle, unit).sort((a, b) => a.mem.respawnAt - b.mem.respawnAt)) {
      if (battle.time + 1e-9 < t.mem.respawnAt || walkersOnTile(battle, t.homeR, t.homeC).length) continue;
      if (placed(battle, unit).length >= st(unit).fieldCap) break; // never over the deploy limit (it would withdraw a stone)
      if (!battle.redeploy(t, { free: false })) continue;
      Object.assign(t.mem, { wangUsed: false, active: false, line: 0, inside: new Set(), axes: new Set() });
      battle.fx('summon', { x: t.x, y: t.y, id: t.id });
      // every stone birth brings its 跟子 (client wang_stone1_t_1[trigger] ON_OWNER_BORN) — the battle-start deployment
      // of the prep stones aside (user decision)
      // local patch (2026-10-06, user: "S3 ammo never drops"): while S3 runs, a used stone coming back IS her deployment
      // of a stone in the mode (卫戍协议 has no hand placement; the prep layout keeps the field at its cap of 6, so the
      // S3 stand-in found no free slot and spent nothing) — it builds the S3 跟子 around it (≤ 4, one ammo each)
      const s3 = unit.skill?.active && unit.skill.id === 'skchr_wang_3';
      const ammo = s3 ? Math.max(0, Math.floor(num(unit.skill.ammoLeft, 0))) : 0;
      const built = followAround(battle, unit, t, s3 ? Math.min(1 + WANG_S3_EXTRA, ammo) : 1);
      if (s3 && built > 0) {
        const st3 = st(unit);
        unit.skill.ammoLeft = st3.ammo = Math.max(0, ammo - built);
        if (unit.skill.ammoLeft <= 0) unit.skill.end('ammo');
      }
      syncSpLock(battle, unit);
    }
  };
  /** 阻回 while the stock is full (S1 / S2). */
  const syncSpLock = (battle, unit) => {
    if (sid === 'skchr_wang_3') return;
    const s = st(unit);
    const full = s.stock >= s.deckCap;
    const has = unit.buffs.some((b) => b.key === 'wang:stockFull');
    if (full && !has) battle.addBuff(unit, { key: 'wang:stockFull', duration: Infinity, flags: { noSp: true } });
    else if (!full && has) battle.removeBuff(unit, 'wang:stockFull');
  };
  /** A 跟子 on (r, c): a projectile of hers — never under the stone deploy limit, holds no tile. */
  const placeFollower = (battle, unit, r, c) => {
    const tdef = battle.data.getToken?.(STONE_ID, unit.defId, unit.def?.loadout ?? null);
    if (!tdef) return null;
    const kit = wangStone(tdef.skill?.bb ?? {}, tdef.raw ?? tdef, tdef); // no fromTokens: outside the deploy limit
    kit.follower = true;
    const f = battle.spawnToken(unit, STONE_ID, r, c, { anySource: true, force: true, kit });
    if (!f) return null;
    f.mem.wangFollower = true;
    if (battle.unitAt(r, c) === f) battle._occ[r * COLS + c] = null; // occupies no tile
    battle.fx('summon', { x: f.x, y: f.y, id: f.id });
    return f;
  };
  /** Follower tile class (PRTS 备注): 0 undeployable ground, 1 deployable ground, 2 deployable high ground, null = none. */
  const followerClass = (battle, r, c, stones) => {
    if (!battle.grid.inRect(r, c) || stoneAt(stones, r, c) || battle.grid.isObstacle(r, c)) return null;
    const occ = battle.unitAt(r, c);
    if (occ && !isFollower(occ)) return null; // no character unit
    const t = battle.grid.tile(r, c);
    if (FOLLOWER_EXCEPT_TILES.has(t.key) || t.special === 'start' || t.special === 'end') return null; // local patch
    if (t.build === 'NONE') return t.pass === 'ALL' && t.height === 'LOW' ? 0 : null;
    return t.height === 'LOW' ? 1 : 2;
  };
  /** 铸子 跟子 around `s`; returns the count placed (≤ n). */
  const followAround = (battle, unit, s, n = 1) => {
    let k = 0;
    while (k < n && followers(battle, unit).length < followerCap) {
      const stones = stonesOf(battle, unit);
      const cand = [];
      ORTHO.forEach(([dr, dc]) => {
        const r = s.tileR + dr, c = s.tileC + dc;
        const cls = followerClass(battle, r, c, stones);
        // ties: random (client _alwaysRandomInTheEnd; seeded battle.rng — PRTS's up > right > down > left is not it)
        if (cls != null) cand.push([r, c, enemiesOnTile(battle, r, c).length ? 0 : 1, cls, battle.rng()]);
      });
      cand.sort((a, b) => a[2] - b[2] || a[3] - b[3] || a[4] - b[4]);
      if (!cand.length || !placeFollower(battle, unit, cand[0][0], cand[0][1])) break;
      k++;
    }
    return k;
  };
  /** A stone from the stock on (r, c) ("manual" deployment), then its 跟子 (`extra` of them). */
  const deployStone = (battle, unit, r, c, extra = 1) => {
    // a deployment from the stock pays the stone's DP cost (卫戍协议 has in-battle DP: 10, +1/s — the same pool the
    // automatic operator redeploys use)
    const ps = battle.getPlayer(unit.ownerId);
    const cost = num(stoneStats(battle, unit).cost, 3);
    if (!ps || ps.dp + 1e-9 < cost) return null;
    const s = battle.spawnToken(unit, STONE_ID, r, c, { anySource: true });
    if (!s) return null;
    ps.dp = Math.max(0, ps.dp - num(s.base.cost, cost)); // the deployed stone's own cost (TRP-X module: −1), as Battle.redeploy
    battle.fx('summon', { x: s.x, y: s.y, id: s.id });
    st(unit).stock--;
    s.mem.wangExtra = followAround(battle, unit, s, extra);
    return s;
  };
  /** S1 / S2 automatic deployment tile: free deployable, no enemy (trait), next to her stones (or her), route first. */
  const autoTile = (battle, unit) => {
    const stones = stonesOf(battle, unit);
    const seeds = stones.length ? stones : [unit];
    const cand = [];
    for (const s of seeds) {
      for (const [dr, dc] of ORTHO) {
        const r = s.tileR + dr, c = s.tileC + dc;
        if (!battle.grid.inRect(r, c) || stoneAt(stones, r, c) || cand.some((x) => x[0] === r && x[1] === c)) continue;
        const t = battle.grid.tile(r, c);
        if (t.build === 'NONE' || battle.grid.isObstacle(r, c) || battle.unitAt(r, c) || battle.isReservedTile(r, c)) continue;
        if (walkersOnTile(battle, r, c).length) continue; // trait: only walking enemies block (_excludeOccupiedByWalkEnemy)
        const near = battle.enemies.filter((e) => e.alive).reduce((m, e) => Math.min(m, Math.hypot(e.x - c, e.y - r)), 99);
        cand.push([r, c, t.pass === 'ALL' && t.height === 'LOW' ? 0 : 1, near]);
      }
    }
    cand.sort((a, b) => a[2] - b[2] || a[3] - b[3]);
    return cand[0] || null;
  };
  const autoDeploy = (battle, unit) => {
    const s = st(unit);
    // consumed stones waiting to come back on their tiles go first (the player's layout), new ones only beyond them
    while (s.stock > 0 && !waitingOf(battle, unit).length && placed(battle, unit).length < s.fieldCap) {
      const t = autoTile(battle, unit);
      if (!t || !deployStone(battle, unit, t[0], t[1], 1)) break;
    }
  };
  /** "获得N枚棋子" (ChargeToken): charge = min(deckCap − hand, n) cards; returns the count above it. */
  const addOwned = (unit, n) => {
    const s = st(unit);
    const add = Math.max(0, Math.min(n, s.deckCap - s.stock));
    s.stock += add;
    return n - add;
  };
  const gain = (battle, unit, n) => {
    const s = st(unit);
    addOwned(unit, n);
    autoDeploy(battle, unit);
    syncSpLock(battle, unit);
  };
  return {
    skills: {
      // AUTO, no attack of their own: "立即获得两枚棋子" as soon as the SP is full (阻回 while the stock is full)
      skchr_wang_1: { kind: 'instant', trigger: { rule: 'SP_FULL' }, onStart({ battle, unit }) { gain(battle, unit, Math.max(1, num(bb.cnt, 2))); } },
      skchr_wang_2: { kind: 'instant', trigger: { rule: 'SP_FULL' }, onStart({ battle, unit }) { gain(battle, unit, Math.max(1, num(bb.cnt, 2))); } },
      skchr_wang_3: {
        kind: 'ammo', ammo: Math.max(1, num(bb.trigger_time, 20)),
        targeting: { rangeGrid: skillGridOf(def), showOwnRange: true },
        attack: { noAttack: true },
        onStart({ battle, unit }) {
          const s = st(unit);
          const seq = unit.deploySeq;
          const running = () => unit.deploySeq === seq && unit.skill?.active && unit.skill.id === 'skchr_wang_3';
          s.ammo = unit.skill.ammoLeft; // mirrored: SkillRuntime.end zeroes ammoLeft before onEnd (the refund needs it)
          // no stone placed in the prep at all: nothing is charged or placed and the skill never ends (user's observation
          // of the real game, 2026-10-06 — no deployment ever spends ammo or stones)
          if (!s.prepPlaced) return;
          // client: ChargeToken (min(max − remaining, cnt) cards), then InstantSpawn of the rest as 跟子, ≤ max_spawn_cnt
          // alive, on tiles of her range, no adjacency. Order: PRTS 技能3 备注 "触发第一天赋时，按照有敌人的>没有敌人的；不可部署地块>
          // 可部署地面地块>可部署高台地块的优先级生成" — enemy tiles first, each group by tile class (followerClass); among enemy
          // tiles of one class the enemy closest to its goal first (goalFirst, [추정] user decision 2026-10-06), the rest
          // random [ASSUMED: the client InstantSpawn selector (WangTileSelector SKILL_3_INSTANT, _alwaysRandomInTheEnd 0)
          // sorts natively — review 2026-10-06: the empty tiles were plain random, no class order]
          let over = addOwned(unit, Math.max(1, num(bb.cnt, 8)));
          const stones0 = stonesOf(battle, unit);
          const cand = [];
          goalFirst(battle, inRange(battle, unit).filter(stoneSelectable)).forEach((e, i) => {
            const r = Math.round(e.y), c = Math.round(e.x), cls = followerClass(battle, r, c, stones0);
            if (cls != null) cand.push([r, c, 0, cls, i]);
          });
          for (const k of unit.rangeKeys || []) {
            const r = Math.floor(k / COLS), c = k % COLS, cls = followerClass(battle, r, c, stones0);
            const foe = enemiesOnTile(battle, r, c).some(stoneSelectable);   // (already listed above, by goal) : random
            if (cls != null) cand.push([r, c, foe ? 0 : 1, cls, foe ? 1e6 : battle.rng()]);
          }
          cand.sort((a, b) => a[2] - b[2] || a[3] - b[3] || a[4] - b[4]);
          const tiles = cand.map(([r, c]) => [r, c]);
          for (const [r, c] of tiles) {
            if (over <= 0 || followers(battle, unit).length >= followerCap) break;
            if (followerClass(battle, r, c, stonesOf(battle, unit)) == null) continue;
            if (placeFollower(battle, unit, r, c)) over--;
          }
          // automatic "manual" deployments: a stone on an enemy tile of her range and a 跟子 on each placeable neighbour (≤ 4),
          // one ammo per 跟子 built (client SpawnTokenS3InSkill). It ends only when the stones (stock) or the ammo run out —
          // no self-stop while the field is full (it waits).
          const drop = () => {
            if (!running()) return false;
            if (s.stock <= 0) { unit.skill.end('stones'); return false; }
            // her used stones waiting to come back hold their slots (as in autoDeploy): a new stone beyond them would make
            // the comeback exceed the deploy limit, and tokens.js would withdraw a prep stone for good (review 2026-10-06)
            if (placed(battle, unit).length + waitingOf(battle, unit).length >= s.fieldCap) return false;
            const stones = stonesOf(battle, unit);
            // where she would put it by hand: an enemy tile of her range (closest to its goal first) — else (local patch 2026-10-06,
            // user report "S3 spends no ammo": enemies walking just outside her range never gave the stand-in a tile)
            // a free tile of her range on the ground routes, nearest to a living enemy, no walking enemy on it (trait)
            const tiles = goalFirst(battle, inRange(battle, unit).filter(stoneSelectable)).map((e) => [Math.round(e.y), Math.round(e.x)]);
            const alive = battle.enemies.filter((e) => e.alive && !e.hidden);
            if (alive.length) {
              const near = (r, c) => alive.reduce((m, e) => Math.min(m, Math.hypot(e.x - c, e.y - r)), 99);
              const extra = [];
              for (const k of unit.rangeKeys || []) {
                const r = Math.floor(k / COLS), c = k % COLS;
                if (!battle.grid.inRect(r, c) || walkersOnTile(battle, r, c).length) continue;
                const t = battle.grid.tile(r, c);
                extra.push([r, c, t.pass === 'ALL' && t.height === 'LOW' ? 0 : 1, near(r, c)]);
              }
              extra.sort((x, y) => x[2] - y[2] || x[3] - y[3]);
              tiles.push(...extra.map(([r, c]) => [r, c]));
            }
            for (const [r, c] of tiles) {
              if (!battle.grid.inRect(r, c) || stoneAt(stones, r, c) || battle.grid.isObstacle(r, c)) continue;
              const t = battle.grid.tile(r, c);
              // local patch (2026-10-06): the home tile of one of HER used stones waiting to come back does not hold the
              // deployment off (isReservedTile did: on a lane of prep stones every enemy tile was such a home, so S3 never
              // deployed and never spent ammo); that stone waits until its tile is free again
              if (t.build === 'NONE' || battle.unitAt(r, c) || reservedForOthers(battle, unit, r, c)) continue;
              const ammo = Math.max(0, Math.floor(num(unit.skill.ammoLeft, 0)));
              // client SpawnTokenS3InSkill: a BuildStone on each placeable neighbour (4 grid positions), its counter
              // `_countEvent 4, _expendPerTrigger 1` spends one ammo per stone actually built — the talent's one included
              // (user 2026-10-06; PRTS / namu read "额外至多部署3枚…并消耗等量弹药" as 3 paid: see LOCAL-PATCH.md)
              const stone = deployStone(battle, unit, r, c, Math.min(1 + WANG_S3_EXTRA, ammo));
              if (!stone) continue;
              const paid = Math.max(0, stone.mem.wangExtra);
              if (paid > 0) {
                unit.skill.ammoLeft = s.ammo = Math.max(0, ammo - paid);
                if (unit.skill.ammoLeft <= 0) { unit.skill.end('ammo'); return true; }
              }
              if (s.stock <= 0 && unit.skill?.active) unit.skill.end('stones');
              return true;
            }
            return false;
          };
          drop();
          const job = battle.every(WANG_S3_PACE, () => { if (!running()) { job.cancel(); return; } drop(); }, { owner: unit });
        },
        onEnd({ unit }) {
          // the ammo left returns as stones (ammoLeft is already 0 here: the mirrored count)
          const s = st(unit);
          addOwned(unit, Math.max(0, Math.floor(num(s.ammo, 0))));
          s.ammo = 0;
        },
      },
    },
    talents: [
      { install(battle, unit) { // 铸子: the stock at the battle start (the placed stones stay as they are — no 跟子)
        battle.on('battleStart', () => {
          const ss = stoneStats(battle, unit);
          const s = st(unit);
          s.deckCap = Math.max(1, num(ss.deckStack, 7));
          s.fieldCap = Math.max(1, num(ss.deployLimit, 6));
          // 卫戍协议 hands out the deploy limit (maxDeployCount, 6) as cards (PRTS 卫戍协议/帮助 "根据召唤物部署数量上限…发送等量
          // 召唤物至手牌区"): those placed stand, the rest are the stock
          const n = placed(battle, unit).length;
          s.prepPlaced = n;
          s.stock = Math.min(s.deckCap, Math.max(0, s.fieldCap - n));
          syncSpLock(battle, unit);
          battle.every(0.25, () => redeployUsed(battle, unit), { owner: unit }); // new stones only come with a skill (gain)
        }, { owner: unit });
        // 望 leaves the field (retreat / knock-out): every stone and 跟子 of hers dies (client die_to_kill_token,
        // ON_OWNER_FINISH → KillTokens). [ASSUMED] the placed stones are cards again and come back on their tiles,
        // for DP, once she stands again (redeployUsed waits for her)
        battle.on('death', (ctx) => {
          if (ctx.unit !== unit) return;
          for (const t of stonesOf(battle, unit)) {
            if (!isFollower(t)) t.mem.wangUsed = true;
            battle.retreat(t, { reason: 'expired', permanent: true });
          }
        }, { owner: unit, priority: -20 });
        // a placed stone used up by its trigger waits for its redeploy (a 跟子 — a projectile — is simply gone)
        battle.on('death', (ctx) => {
          const t = ctx.unit;
          if (!t || t.kind !== 'token' || t.defId !== STONE_ID || t.ownerUnit !== unit || isFollower(t) || !t.mem.wangUsed || battle.finished) return;
          t.removed = false;
          t.mem.respawnAt = battle.time + Math.max(0, num(t.base.respawnTime, 2));
        }, { owner: unit, priority: -10 });
      } },
    ],
  };
}

/** 棋子 / 跟子: a trap — untargetable, no damage taken, no attack; triggers when an enemy enters its area while activated. */
function wangStone(bb, raw, def) {
  const kit = {
    skill: {
      kind: 'passive',
      onTick({ battle, unit }) {
        const owner = unit.ownerUnit;
        if (!unit.alive || !owner) return;
        const stones = stonesOf(battle, owner);
        const links = ORTHO.filter(([dr, dc]) => stoneAt(stones, unit.tileR + dr, unit.tileC + dc));
        // 连星: a link direction, once seen, stays activated (PRTS 备注)
        const axes = unit.mem.axes || (unit.mem.axes = new Set());
        const nAxes = axes.size;
        for (const [dr] of links) axes.add(dr ? 'v' : 'h');
        // link fx (official ON_CUSTOM_TRIGGER wang_stone1_line_up): on activation and on each new link direction
        if (axes.size > nAxes) battle.fx('wangLink', { x: unit.x, y: unit.y, id: unit.id, axes: [...axes], first: !unit.mem.active });
        // 激活 and 料敌机先 stacks are latched (PRTS / namu): once linked a stone stays active, and keeps the longest
        // straight line it has seen (≤ max_trigger_cnt) after a linked stone leaves
        if (links.length) {
          unit.mem.active = true;
          unit.mem.line = Math.max(unit.mem.line ?? 0, lineCount(stones, unit));
        }
        const active = !!unit.mem.active;
        const wide = wangSkill(owner) === 'skchr_wang_3'; // S3 equipped: x-1 trigger / damage area
        const inside = unit.mem.inside || (unit.mem.inside = new Set());
        const now = new Set();
        for (const e of battle.enemies) {
          if (!stoneSelectable(e)) continue;
          // a 跟子 checks the enemy's root tile (client _checkTargetRootTile); a stone its body on the tile
          const on = wide ? inArea(e, unit) : isFollower(unit) ? (Math.round(e.x) === unit.tileC && Math.round(e.y) === unit.tileR)
            : (e.hitArea ? bodyOnTile(e, unit.tileR, unit.tileC) : Math.abs(e.x - unit.tileC) <= 0.5 && Math.abs(e.y - unit.tileR) <= 0.5);
          if (on) now.add(e.id);
          if (!on || inside.has(e.id) || !active) continue;
          trigger(battle, unit, owner, stones, e, wide, axes);
          // a trap is used up by its trigger (陷阱师 traps: "踩上去的第一个敌人会触发其效果"; the stone has an
          // ON_UNIT_DEAD sound) — its fx carries `consumed` so the client plays no knock-out sound
          unit.mem.wangUsed = true;
          battle.retreat(unit, { reason: 'expired', permanent: true });
          return;
        }
        unit.mem.inside = now;
      },
    },
    trait: { noAttack: true },
    install(battle, unit) {
      // persistent + allowDead: the kit installs before the deployment (the unit is not alive yet — a plain buff was
      // refused, so stones were attacked and took damage)
      battle.addBuff(unit, { key: 'wang:stone', duration: Infinity, persist: true, allowDead: true, flags: { untargetable: true, invulnerable: true } });
    },
  };
  return kit;

  /**
   * The enemies a stone's blast selects on tiles (dr, dc) around it: Battle.enemiesInKeys with canTargetEnemy — the
   * engine's selection (no 隐匿 unless revealed, no untargetable; 沉睡 is 无敌 anyway), flyers included, a huge enemy's
   * body on any of the tiles (checklist: never loop battle.enemies to deal damage; review 2026-10-06).
   */
  function blastFoes(battle, unit, offsets) {
    const keys = [];
    for (const [dr, dc] of offsets) {
      const r = unit.tileR + dr, c = unit.tileC + dc;
      if (battle.grid.inRect(r, c)) keys.push(r * COLS + c);
    }
    return battle.enemiesInKeys(keys, unit, ANY);
  }
  function inArea(e, unit) {
    const r = Math.round(e.y), c = Math.round(e.x);
    return DIAMOND2.some(([dr, dc]) => unit.tileR + dr === r && unit.tileC + dc === c);
  }

  function trigger(battle, unit, owner, stones, e, wide, axes) {
    const tal = talentBb(owner.def?.raw ?? owner.def, 1);
    const n = Math.min(num(tal['attack@max_trigger_cnt'], 3), unit.mem.line ?? lineCount(stones, unit));
    const mul = 1 + num(tal['attack@per_atk_scale'], 0.1) * n;
    const resFlat = num(tal['attack@per_magic_resist_penetrate_fixed'], 9) * n;
    const atk = owner.s?.atk ?? unit.s.atk;
    const src = isFollower(unit) ? owner : unit; // a 跟子's damage comes from 望 (PRTS 备注)
    const sk = wangSkill(owner);
    // trigger / explosion fx: `skill` 1 | 2 | 3 = the effect of the stone (3 = S3 equipped, x-1 diamond), `axes` the
    // activated link directions (S2 line blast), `follower` = a 跟子; the stone is used up right after (`consumed`)
    battle.fx('zone', { x: unit.x, y: unit.y, id: unit.id, r: wide ? 2.5 : 0.6, dur: 0.6, consumed: true, token: STONE_ID,
      skill: wide ? 3 : sk === 'skchr_wang_2' ? 2 : 1, axes: [...axes], line: n, target: e.id, follower: isFollower(unit) });
    if (wide) {
      for (const v of blastFoes(battle, unit, DIAMOND2)) {
        battle.dealDamage(src, v, { amount: atk * num(bb.atk_scale, 3.2) * mul, type: 'arts', resIgnoreFlat: resFlat, isSkill: true, canDodge: false, tags: ['summon', 'trap'] });
      }
      return;
    }
    if (sk === 'skchr_wang_2') {
      // 连星: the enemies within 3 tiles on both sides along each activated link direction
      const span = Math.max(1, Math.floor(num(bb.tile_count, 6) / 2));
      const hit = new Set();
      for (const axis of axes) {
        const line = [];
        for (let d = -span; d <= span; d++) line.push(axis === 'h' ? [0, d] : [d, 0]);
        for (const v of blastFoes(battle, unit, line)) hit.add(v);
      }
      for (const v of hit) {
        battle.dealDamage(src, v, { amount: atk * num(bb.atk_scale, 4.8) * mul, type: 'arts', resIgnoreFlat: resFlat, isSkill: true, canDodge: false, tags: ['summon', 'trap'] });
        if (v.alive) battle.applyStatus(v, 'slow', { duration: num(bb.duration, 6), value: Math.abs(num(bb.move_speed, -0.4)), source: owner });
      }
      return;
    }
    // 取势 (default): 停顿 + atk_scale × 望's ATK arts per second for `sluggish` s (independent stacks per trigger)
    const dur = num(bb.sluggish, 6.5), scale = num(bb.atk_scale, 1.2);
    battle.applyStatus(e, 'sluggish', { duration: dur, source: owner });
    // PRTS S1 备注: "由望依自身属性预计算伤害后、以无来源的形式施加给目标" — 无来源 (望 keeps the credit) for a stone's DoT; a
    // 跟子's damage keeps 望 as its source (client: the 跟子 is her projectile)
    const tick = (t) => battle.dealDamage(owner, t, { amount: atk * scale * mul, type: 'arts', resIgnoreFlat: resFlat, canDodge: false, ignoreSelect: true, sourceless: !isFollower(unit), tags: ['dot', 'trap'] });
    // client buff: triggerInterval 1.0, waitFirstTriggerInterval false, lifetime 6.5 s → ticks at 0, 1, … 6 (7 in all)
    tick(e);
    if (e.alive) battle.addBuff(e, { key: 'wang:dot', refresh: 'independent', duration: dur, interval: 1, source: owner, visible: true, onTick: ({ unit: t }) => tick(t) });
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
