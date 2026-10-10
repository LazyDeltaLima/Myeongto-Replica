// server/sim/content/kits/ops/op-wisdel.js — 维什戴尔 (char_1035_wisdel) 自选 operator kit — local patch: the nas-local 선발
// kit (formerly kits/diy.js, docs/LOCAL-PATCH.md 「선발 오퍼레이터」) on upstream's 自选 framework; it replaces upstream's
// op-wisdel.js (the owner's rule: where the two differ, ours wins). 6★ 投掷手 (狙击); every skill, both talents, the trait,
// the module and the kit of her summon 魂灵之影 (token_10035_wisdel_wward). Kit contract: ../README.md ("How to add an
// operator (自选)"); `chess` = the composed 自选 record (shared/diy.js diyRecordOf), every number from it.
//
// Trait: every attack = the main blast + aftershocks (append_atk_scale × ATK, the module's enable_third_attack adds one)
// in the bombarder splash (0.9, PRTS 溅射半径一览), ground only (S3 aside). 好礼: the main target takes main_atk_scale ×
// the hit AND × her aftershocks on it (PF projectile shock `_applyAtkScaleTraceTgt 1`; PRTS 「攻击倍率提升效果仅对普通攻击
// （含余震）生效」) and gets an 残影 (one, kept while she is on the field — BT wisdel_t_1[bomb] _finishDerivedBuffIfParentFinish,
// PRTS 「维什戴尔退场后消失」); an 残影 struck by her aftershock explodes with `prob` (S3: 100 %): bomb_atk_scale × ATK phys
// within range_radius (1.1, centre test, height ignored, air too) + stun 1 s, the mark is used up [ASSUMED: used up — the
// text does not say it stays]. 死魂灵的余息: on deploy a 魂灵之影 on the free tile of her range nearest to her (PRTS 备注:
// lowest distance first). 迷彩: granted when a shadow comes in with her on its x-5 (its tile + the 4 next to it), kept while
// that shadow lives (BT token_wisdel_passive[to_host] ON_BUFF_START CreateBuffInRange x-5; PRTS 「仅在登场时尝试给予维什戴尔
// 迷彩」; a 孤立 她 is not selected) — no distance polling.
// 魂灵之影 (shadowKit): no attack; once its skill is ready and a targetable GROUND enemy stands in her range (PF
// sktok_wisdel_wward SkillTrigger `_targetMotion 1`, `_fetchHost 1`; PRTS 「不可对空」) it casts on one — unmarked first
// (`_withoutThisBuff` wisdel_t_1[bomb]), then the usual target order: arts (its ATK), 停顿, her 残影, then 0-2 SP to the
// SHADOW itself (BT token_wisdel_skill_end ModifySp _targetType BUFF_OWNER, forced) — not to her.
// S1 定点清算: the next attack — splash 1.1, 2 more aftershocks at append_atk_scale, every enemy it hits (main, splash,
// aftershocks) stunned stun_duration s (表 「使所有目标晕眩」).
// S2 过载 = the second half of the 25 s: skill prefab skchr_wisdel_2 has `_isOverloadSkill` 1, and client code
// BasicSkill.get_overloadRatio (RVA 0x63DAC0) is 0.5 for such a skill — OverloadIfNecessary (0x63ADC0) overloads once the
// progress passes it (ON_OVERLOAD → buff wisdel_s_2[overload_start], mode 2); 2026-10-10, until then [ASSUMED]. Every
// attack becomes 4 shots of atk_scale_ol × ATK at random targets of her range (each a full blast with its aftershocks).
// S3 爆裂黎明: splash 2.5 (PF projectile_chr_wisdel_s3 CircleCollider2D m_Radius 2.5; PRTS 「攻击溅射半径2.5」); she targets
// and splashes air units, and the aftershocks hit them too (PF charpack S3 Selector and every projectile_chr_wisdel_s3
// component `_targetMotion 3`); 2 shades at the cast, the first with `sp` (3) SP (BT wisdel_s_3_token[add_sp]; PRTS
// 「初始技力分别为3sp（优先召唤）与0sp」).
// The skills' aftershock parameters live on their attack overrides (bound when the shot leaves — a bomb that lands after an
// instant / last-ammo skill ended still carries them).
// fx kinds the client draws / sounds from (render/fxgame.js, audio.js kitHitKey): 'explode' { by } (好礼's bomb),
// 'bombardShell' { id } (the overload shots), 'burst' { id: the shade } (魂灵之影's strike), 'summon'.

import { COLS } from '../../../constants.js';
import { sortEnemyTargets } from '../../../targeting.js';
import { talentBb } from '../shared/tier1.js';
import { hypot } from '../../../detmath.js';

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const live = (u) => !!u && u.alive && u.deployed && !u.removed && !u.hidden;
const selectedSkill = (chess, def) => chess?.skill?.skillId ?? def?.skill?.id ?? null;
/** Skill blackboard base_attack_time → engine batPct (a shortening is flat seconds, a lengthening scales). */
function batOf(v, def) {
  const x = num(v);
  if (!x) return 0;
  if (x > 0) return x;
  return Math.max(-0.9, x / (num(def?.stats?.bat, 1) || 1));
}
const ANY = Object.freeze({ canHitFly: true });
const GROUND = Object.freeze({ canHitFly: false });
const inRange = (battle, unit) => battle.enemiesInKeys(unit.rangeKeys || [], unit, ANY);

const WIS_SPLASH = 0.9, WIS_S1_SPLASH = 1.1, WIS_S3_SPLASH = 2.5, WIS_WARD_MAX = 3;
/** Her summon 魂灵之影 (T2 死魂灵的余息, S3 爆裂黎明). */
export const SHADOW = 'token_10035_wisdel_wward';
/** Buff key of her 残影 on an enemy / of the 迷彩 shadow `w` gave her. */
const markKey = (host) => `wis:mark:${host.id}`;
const camoKey = (w) => `wis:camou:${w.id}`;

/** The enemy a shadow strikes: a targetable ground enemy of `owner`'s range, unmarked first, then the usual order. */
function shadowTarget(battle, owner, t) {
  const pool = battle.enemiesInKeys(owner.rangeKeys || [], t, GROUND).filter((e) => e.alive);
  if (!pool.length) return null;
  const fresh = pool.filter((e) => !e.buffs.some((b) => b.key === markKey(owner)));
  const list = fresh.length ? fresh : pool;
  sortEnemyTargets(battle, t, list, null);
  return list[0];
}

/**
 * 魂灵之影: no attack; its skill (cast by its own tick once ready, with a ground enemy in 维什戴尔's range) hits one enemy:
 * arts (its ATK), 停顿, her 残影, then 0-2 SP to itself.
 */
function wisdelWard(bb) {
  const slug = num(bb.sluggish, 1), spMin = num(bb.sp_min, 0), spMax = num(bb.sp_max, 3);
  return {
    fromTokens: true, // under its deploy limit (content/tokens.js), as the token kits of tokens.js
    skill: {
      kind: 'instant',
      trigger: 'NEVER', // cast by the install below (her range, ground only — the data rule cannot see it)
      onStart({ battle, unit }) {
        const owner = unit.ownerUnit;
        const t = unit.mem.wisdelTarget;
        unit.mem.wisdelTarget = null;
        if (live(owner) && t && t.alive) {
          battle.fx('burst', { x: t.x, y: t.y, id: unit.id });
          battle.dealDamage(unit, t, { amount: unit.s.atk, type: 'arts', isSkill: true, tags: ['summon'] });
          if (t.alive) {
            battle.applyStatus(t, 'sluggish', { duration: slug, source: unit });
            battle.addBuff(t, { key: markKey(owner), duration: Infinity, source: owner, visible: true });
          }
        }
        // token_wisdel_skill_end: an integer of [sp_min, sp_max) to the shadow (BUFF_OWNER), forced (reason 'init')
        const sp = Math.floor(spMin + battle.rng() * Math.max(0, spMax - spMin));
        if (sp > 0) unit.skill?.gainSp(sp, 'init');
      },
    },
    trait: { noAttack: true },
    install(battle, t) {
      battle.on('tick', () => {
        const sk = t.skill, owner = t.ownerUnit;
        if (!live(t) || !sk || !sk.ready || sk.active || !t.canAct || t.s.flags.silence || !live(owner)) return;
        const e = shadowTarget(battle, owner, t);
        if (!e) return;
        t.mem.wisdelTarget = e;
        sk.activate('DEFAULT');
      }, { owner: t });
      battle.on('death', (c) => { // its 迷彩 on her lasts while it lives
        const owner = t.ownerUnit;
        if (c.unit === t && owner) battle.removeBuff?.(owner, camoKey(t));
      }, { owner: t });
    },
  };
}

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
    if (!e.alive || !e.buffs.some((b) => b.key === markKey(unit))) return;
    if (battle.rng() >= p) return;
    battle.removeBuff?.(e, markKey(unit));
    battle.fx('explode', { x: e.x, y: e.y, r: bombR, by: unit.id }); // `by` = her, for its hit sound (audio.js kitHitKey)
    for (const v of battle.foesInRadius(e.x, e.y, bombR, true)) {
      battle.dealDamage(unit, v, { amount: unit.s.atk * bombScale, type: 'phys', isSkill: true, tags: ['talent', 'wisdelBomb'] });
      if (v.alive) battle.applyStatus(v, 'stun', { duration: bombStun, source: unit });
    }
  };
  const mark = (battle, unit, e) => {
    if (!e?.alive || !live(unit)) return;
    battle.addBuff(e, { key: markKey(unit), duration: Infinity, source: unit, visible: true });
  };
  /**
   * One blast at (x, y) (the main target `main`): splash + `n` aftershocks of `after` × ATK 0.3 s apart (× main_atk_scale
   * on the main target). `stun` stuns every enemy the blast hits; `prob` = the 残影 explosion chance of the aftershocks;
   * `air` = air units are hit too (S3). `primary` = the engine already dealt the main hit and its splash.
   */
  const blast = (battle, unit, main, { x, y, scale = 1, radius = WIS_SPLASH, n = shocks, after = append, stun = 0, prob = markProb, air = false, primary = false }) => {
    if (!primary) {
      for (const e of battle.foesInRadius(x, y, radius, true)) {
        if (e.isFlying && !air) continue;
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
          if (e.isFlying && !air) continue;
          battle.dealDamage(unit, e, { amount: unit.s.atk * after * (e === main ? mainScale : 1), type: 'phys', isSplash: true, tags: ['aftershock'] });
          if (stun && e.alive) battle.applyStatus(e, 'stun', { duration: stun, source: unit });
          tryBomb(battle, unit, e, prob);
        }
      }, { owner: unit });
    }
  };
  /** A profile `afterHit` running `blast` with the given parameters on the engine's hit. */
  const afterHitOf = (opts) => (battle, unit, target, info) => blast(battle, unit, target, { x: info.x, y: info.y, primary: true, ...opts });

  const ownWards = (battle, unit) => battle.allies(unit.ownerId).filter((a) => a.kind === 'token' && a.defId === SHADOW && a.ownerUnit === unit && a.alive);
  /** A shadow coming in: 迷彩 for her while it lives, when she stands on its x-5 and may be selected by it (孤立). */
  const grantCamo = (battle, unit, w) => {
    if (!live(unit) || !battle.allySelectable(unit, w)) return;
    if (Math.abs(unit.tileR - w.tileR) + Math.abs(unit.tileC - w.tileC) > 1) return;
    battle.addBuff(unit, { key: camoKey(w), duration: Infinity, flags: { camou: true }, status: 'camou', source: w });
  };
  const placeWard = (battle, unit, sp = 0) => {
    if (ownWards(battle, unit).length >= WIS_WARD_MAX) return null;
    const tiles = [...(unit.rangeKeys || [])].map((k) => [Math.floor(k / COLS), k % COLS])
      .filter(([r, c]) => battle.grid.inRect(r, c) && battle.grid.canStand(r, c, { ranged: true }) && !battle.isReservedTile?.(r, c))
      .sort((a, b) => hypot(a[0] - unit.tileR, a[1] - unit.tileC) - hypot(b[0] - unit.tileR, b[1] - unit.tileC) || a[1] - b[1]);
    for (const [r, c] of tiles) {
      // the shade's kit is given here (content/index.js resolves no token kit for it)
      const w = battle.spawnToken(unit, SHADOW, r, c, { anySource: true, kit: wisdelWard(battle.tokenDef(SHADOW, unit)?.skill?.bb ?? {}) });
      if (w) {
        if (sp > 0) w.skill?.gainSp(sp, 'init');
        battle.fx('summon', { x: w.x, y: w.y, id: w.id });
        grantCamo(battle, unit, w);
        return w;
      }
    }
    return null;
  };

  const s3 = sid === 'skchr_wisdel_3';
  const s1Stun = num(bb.stun_duration, 1);
  return {
    // the trait's aftershocks and the talents are this kit's own blast (it replaces the branch's afterHit)
    trait: { splashRadius: WIS_SPLASH, afterHit: afterHitOf({}) },
    skills: {
      // 定点清算 (AUTO, attack SP): the next attack — wider splash, 2 more aftershocks at append_atk_scale, every target stunned
      skchr_wisdel_1: {
        kind: 'instant',
        attack: {
          splashRadius: WIS_S1_SPLASH,
          onEachHit({ battle, unit, target }) { // the main target and every splash victim (the aftershocks stun in blast)
            if (target?.alive && target.side === 'enemy') battle.applyStatus(target, 'stun', { duration: s1Stun, source: unit });
          },
          afterHit: afterHitOf({ n: shocks + 2, after: num(bb.append_atk_scale, 0.9), radius: WIS_S1_SPLASH, stun: s1Stun }),
        },
      },
      // 饱和复仇: ATK +atk, base attack time −0.7 s, 3 targets; 过载 (second half): 4 shots at random targets
      skchr_wisdel_2: {
        kind: 'duration',
        mods: { atkPct: num(bb.atk), batPct: batOf(bb.base_attack_time, def) },
        targeting: { maxTargets: 3 },
      },
      // 爆裂黎明: 2 shades (≤ 3, kept; the first with `sp` SP), ATK +atk, base attack time ×(1 + 2.9), atk_scale_3, splash
      // 2.5, air units targeted and hit (aftershocks too), 残影 100 %, ammo
      skchr_wisdel_3: {
        kind: 'ammo', ammo: Math.max(1, Math.floor(num(bb['attack@trigger_time'], 6))),
        mods: { atkPct: num(bb.atk), batPct: batOf(bb.base_attack_time, def) },
        targeting: { canHitFly: true },
        attack: {
          atkScale: num(bb['attack@atk_scale_3'], 1.9), splashRadius: WIS_S3_SPLASH, groundOnly: false, canHitFly: true,
          afterHit: afterHitOf({ radius: WIS_S3_SPLASH, prob: num(bb['attack@prob'], 1), air: true }),
        },
        onStart({ battle, unit }) {
          for (let i = 0; i < Math.max(1, num(bb.max_cnt, 2)); i++) placeWard(battle, unit, i === 0 ? num(bb.sp) : 0);
        },
      },
    },
    talents: [
      { install(battle, unit) { // 好礼: the main target takes main_atk_scale × the attack; her 残影 leave with her
        battle.on('hit', (c) => {
          if (c.source !== unit || !c.dmg?.isAttack || c.dmg.isSplash || c.dmg.tags?.includes('wisdelShot')) return;
          c.dmg.mul = num(c.dmg.mul, 1) * mainScale;
        }, { owner: unit });
        battle.on('death', ({ unit: u }) => {
          if (u !== unit) return;
          for (const e of battle.enemies) if (e.buffs.some((b) => b.key === markKey(unit))) battle.removeBuff?.(e, markKey(unit));
        }, { owner: unit });
      } },
      { install(battle, unit) { // 死魂灵的余息: a shade on deploy (迷彩: placeWard → grantCamo)
        battle.on('deploy', ({ unit: u }) => { if (u === unit) battle.after(0, () => { if (live(unit)) placeWard(battle, unit); }, { owner: unit }); }, { owner: unit });
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
      // (2026-10-06) the main shot's atk_scale_ol lives on her own profile (a copy, like 丰川祥子 S2) — ai.js performAttack
      // never read back a `beforeAttack` ctx.profile, so the main shot kept the full scale. Restored when the overload
      // ends; re-applied when Battle._setupUnit resolves a fresh profile. Checked every step (the scheduled phase runs
      // before the allies attack; at 0.2 s the main shot and the 4 shots could disagree for up to 0.2 s), and the 4 shots
      // follow the applied profile, not a fresh overload() reading.
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

export default {
  char_1035_wisdel: (bb, chess, def) => wisdel(bb, chess, def),
};
