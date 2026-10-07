// server/sim/content/kits/ops/op-wisdel.js — 维什戴尔 (char_1035_wisdel) 自选 operator kit — local patch: the nas-local 선발
// kit (formerly kits/diy.js, docs/LOCAL-PATCH.md 「선발 오퍼레이터」) on upstream's 自选 framework; it replaces upstream's
// op-wisdel.js (the owner's rule: where the two differ, ours wins). 6★ 投掷手 (狙击); every skill, both talents, the trait,
// the module and the kit of her summon 魂灵之影 (token_10035_wisdel_wward). Kit contract: ../README.md ("How to add an
// operator (自选)"); `chess` = the composed 自选 record (shared/diy.js diyRecordOf), every number from it.
//
// Trait: every attack = the main blast + aftershocks (append_atk_scale × ATK, the module's enable_third_attack adds one)
// in the bombarder splash (0.9, PRTS 溅射半径一览), ground only. 好礼: the main target takes main_atk_scale × the hit and
// gets an 残影 (one, kept); an 残影 struck by her aftershock explodes with `prob` (S3: 100 %): bomb_atk_scale × ATK phys
// within range_radius (1.1, centre test, height ignored) + stun 1 s, the mark is used up [ASSUMED: used up — the text
// does not say it stays]. 死魂灵的余息: on deploy a 魂灵之影 on the free tile of her range nearest to her (PRTS 备注:
// lowest distance first); she has 迷彩 while one stands within 1.5 tiles [ASSUMED radius: "在魂灵之影周围"].
// S2 过载 [ASSUMED: the second half of the 25 s — the table gives no switch time]: every attack becomes 4 shots of
// atk_scale_ol × ATK at random targets of her range (each a full blast with its aftershocks).
// fx kinds the client draws / sounds from (render/fxgame.js, audio.js kitHitKey): 'explode' { by } (好礼's bomb),
// 'bombardShell' { id } (the overload shots), 'burst' { id: the shade } (魂灵之影's strike), 'summon'.

import { COLS } from '../../../constants.js';
import { talentBb } from '../shared/tier1.js';

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
const inRange = (battle, unit) => battle.enemiesInKeys(unit.rangeKeys || [], unit, ANY);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const WIS_SPLASH = 0.9, WIS_S1_SPLASH = 1.1, WIS_S3_SPLASH = 1.7, WIS_WARD_NEAR = 1.5, WIS_WARD_MAX = 3;
/** Her summon 魂灵之影 (T2 死魂灵的余息, S3 爆裂黎明). */
export const SHADOW = 'token_10035_wisdel_wward';

/** 魂灵之影: no attack; its AUTO skill hits one enemy of 维什戴尔's range (unmarked first): arts (its ATK), 停顿, 残影, SP. */
function wisdelWard(bb) {
  const slug = num(bb.sluggish, 1), spMin = num(bb.sp_min, 0), spMax = num(bb.sp_max, 3);
  return {
    fromTokens: true, // under its deploy limit (content/tokens.js), as the token kits of tokens.js
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
    battle.fx('explode', { x: e.x, y: e.y, r: bombR, by: unit.id }); // `by` = her, for its hit sound (audio.js kitHitKey)
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

  const ownWards = (battle, unit) => battle.allies(unit.ownerId).filter((a) => a.kind === 'token' && a.defId === SHADOW && a.ownerUnit === unit && a.alive);
  const placeWard = (battle, unit) => {
    if (ownWards(battle, unit).length >= WIS_WARD_MAX) return null;
    const tiles = [...(unit.rangeKeys || [])].map((k) => [Math.floor(k / COLS), k % COLS])
      .filter(([r, c]) => battle.grid.inRect(r, c) && battle.grid.canStand(r, c, { ranged: true }) && !battle.isReservedTile?.(r, c))
      .sort((a, b) => Math.hypot(a[0] - unit.tileR, a[1] - unit.tileC) - Math.hypot(b[0] - unit.tileR, b[1] - unit.tileC) || a[1] - b[1]);
    for (const [r, c] of tiles) {
      // the shade's kit is given here (content/index.js resolves no token kit for it)
      const w = battle.spawnToken(unit, SHADOW, r, c, { anySource: true, kit: wisdelWard(battle.tokenDef(SHADOW, unit)?.skill?.bb ?? {}) });
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
