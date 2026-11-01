// server/sim/content/kits/ops/op-tocka.js — 冻河 (char_4244_tocka) 自选 operator kit: 6★ 辅助 (游击手), an owned-6★ pick of the
// tier-5 and tier-6 自选 slots (maintainer decision 2026-11-01, ahead of the next 卫戍协议 season); every skill, both talents and
// the trait at every form. Kit contract and the 自选 rules: ../README.md ("How to add an operator (自选)").
//
// Forms (data/backups.json units.char_4244_tocka): normal = E2 Lv1, skills at rank 4; elite = E2 Lv60, rank 7 — she has no
// module. Full potential (the owner's decision of 2026-10-07). Sources: character_table / skill_table (zh_CN, as built into
// backups.json), PRTS 冻河 (S2 备注 "“自动开启”的实现逻辑为自动触发该技能，不改变其手动触发性质；切换类技能也可触发此效果"), and the
// battle data of the CN client (she is not in the other servers yet): charpack char_4244_tocka (the attack group T2Attack →
// NormalAttack, talents tocka_t1[sp_and_heal] with its SelectHealTarget and tocka_t2[aoe_mark_listener], the S3 mode), the
// skill prefabs skchr_tocka_1 / 2 / 3 (their selectors and SelectorTrigger), projectile_chr_tocka_t2 / _s2, and the buff
// templates tocka_t1[sp_and_heal] / [heal_core], tocka_t2[aoe_mark_listener], tocka_mx_a[t2_dot], tocka_s1[trigger] / [shield],
// tocka_s2[trigger] / [auto_skill], tocka_s3[switch_mode] / [add_trigger] / [trigger_listener] / [trigger] / [skill_add_sp] /
// [bonus]. Every class and node they use also exists in the EN client, whose behaviour is known; only the sort of S3's pick
// (FilterType 81) is CN-only.
// - Trait (游击手) "可以使用触发型效果协助作战": no rule of its own — ranged physical shots (3-18), hits air units, blocks 1.
// - 触发型效果: the buff each skill puts on an ally operator (tocka_s1/2/3[trigger]; keys S1_FX / S2_FX / S3_FX, one per 冻河).
//   Putting one on (its start) gives her T2's mark; setting one off triggers T1. Operators only (profession mask 639: no
//   summons, traps or devices), never a 孤立 one.
// - T1 夜的哑然 "自身的触发型效果触发时回复2点技力，并为攻击范围内一名友方干员治疗攻击力100%的生命": she gains `sp` SP and heals
//   heal_scale × ATK on one injured ally operator of her range, the lowest HP ratio first (SelectHealTarget: sort
//   HP_RATIO_NOT_FULL_ASC, 禁疗 excluded, herself excluded). Nothing while she is off the field.
// - T2 雪的印痕 "施加触发型效果后的下次普通攻击造成范围伤害，并使目标获得20%的虚弱效果，持续8秒，期间每秒受到攻击力80%的法术伤害":
//   the mark (tocka_t2[aoe_mark], one) makes her next normal attack T2Attack (the attack group's first ability, its
//   validator her own mark) — the shot projectile_chr_tocka_t2 hits every enemy within attack@projectile_range of where it
//   lands (HitBehaviour + CircleRange, ground and air) for her attack's damage, and each takes 虚弱 |attack@t2_atk| and, every
//   second for attack@t2_buff_duration s, attack@t2_magic_atk_scale × her ATK arts (tocka_mx_a[t2_dot], 持续伤害; one per 冻河
//   per enemy: a new one restarts it with the larger value [ASSUMED·미조사: how the same-source buff is overridden]). The
//   attack spends the mark. In S3's mode her attack is S3's (no T2Attack): the mark waits for the next attack after it.
// - S1 一无所有之人 (AUTO, time SP): cast once its SP is full and an ally operator of her range holds no S1 effect (any 冻河's;
//   SelectorTrigger `_minTargetNum` 1 — with none it waits, full) on up to max_target of them — herself too —, the lowest HP
//   ratio first, then the latest deployed. The effect keeps her ATK × atk_scale (default 1) of that moment; the first damage
//   the ally takes that is neither 元素伤害 nor 持续伤害 (ON_BEFORE_APPLYING_MODIFIER, so before the 屏障 step: the new 屏障
//   meets that hit too [ASSUMED·엔진: the event order within one hit]; a hit dodged afterwards set it off too) sets it off:
//   a 屏障 of that ATK × shield_atk_scale against every type but 元素伤害 (BlockDamage ANY_ATTACK_EXCEPT_ELEMENT) — an older 屏障
//   of hers that is larger stays as it is —, losing its starting amount ÷ shield_time every second; the attacker, when
//   alive and not an ally, is 晕眩 `stun` s; T1; the effect ends.
// - S2 意欲呼啸之心 (AUTO, time SP): cast once its SP is full and an ally operator on the field holds no S2 effect of anyone and
//   has a skill that is not passive: the latest deployed one but herself, else herself (GroupSelector). Its shot (projectile
//   speed S2_SHOT) puts the effect on: every 0.2 s, once the ally's skill could be cast (CheckCharSkillAvailable), or as the
//   ally starts its skill (ON_SKILL_START / ON_TOGGLE_SKILL_START) — ASPD +attack_speed for buff_duration s (EXTEND), T1,
//   the effect ends. Meanwhile, every 0.2 s, a MANUAL skill of that ally is cast as soon as it can be (TriggerSkill: the
//   client's Character.RemoteTrigSkill → BasicSkill.IsTriggerable → UseSkill, outside the 卫戍协议 automatic operations'
//   conditions — PRTS 备注 "自动触发该技能，不改变其手动触发性质"); an AUTO skill only gains the ASPD.
// - S3 踽踽独行之春 (MANUAL, data DEFAULT, 20 s): ASPD +attack_speed; her attack (the S3 mode) takes attack@max_target enemies
//   for attack@atk_scale × ATK physical and 晕眩 each attack@stun s. At its start the S3 effect she has on an ally is set
//   off; with none on anyone she puts one on an ally operator of her range but herself (SelectCharacter: one with a skill
//   that is not passive and not running, else one with such a skill, else any — the highest SP ratio first [ASSUMED·CN: the
//   sort FilterType 81 is not in the EN enum; its text says "技力比例最高"]). The ally holding it gains bonus_sp SP every second
//   while her S3 runs; when it starts its own skill (or her S3 starts) it is set off: that ally and she get ATK
//   +bonus_init_atk, down by bonus_atk_dec_per_sec every second, for bonus_duration s (one per 冻河 per unit), the effect
//   moves to the highest-SP-ratio other ally operator of her range by the same pick (none — it is gone until her next S3),
//   T1. The move needs no running S3 (tocka_s3[trigger_listener]'s other branch: only the SP gain checks her skill). It is
//   a passive of the S3 pick (S3Passive): the effect leaves with her.
// Statuses: 晕眩 (S1, S3), 虚弱 (T2).

import { num, up, talentBb, skillRec, giveSp, alliesInGridOf } from '../shared/tier1.js';

const S1 = 'skchr_tocka_1';
const S2 = 'skchr_tocka_2';
const S3 = 'skchr_tocka_3';
/** The 触发型效果 of each skill on an ally (`<key>:<her unit id>`: one per 冻河, `independentCharacterSource`). */
export const S1_FX = 'tocka:s1', S2_FX = 'tocka:s2', S3_FX = 'tocka:s3';
/** tocka_s1[shield], tocka_s2[auto_skill], tocka_s3[bonus] (per 冻河), tocka_t2[aoe_mark] (on her), tocka_mx_a[t2_dot] (per 冻河). */
export const SHIELD = 'tocka:shield', AUTO = 'tocka:auto', BONUS = 'tocka:bonus', MARK = 'tocka:mark', DOT = 'tocka:dot';
/** tocka_s2[trigger] / [auto_skill]: their trigger interval (s). */
const POLL = 0.2;
/** projectile_chr_tocka_s2 (AdvancedMovement `_speed`, tiles/s): S2's shot to its ally. */
const S2_SHOT = 10;
/** BlockDamage ANY_ATTACK_EXCEPT_ELEMENT: S1's 屏障 takes every damage type but 元素伤害. */
const SHIELD_TYPES = Object.freeze(['phys', 'arts', 'true']);

const keyOf = (base, src) => `${base}:${src.id}`;
const own = (a, base, src) => a.buffs.find((b) => b.key === keyOf(base, src)) ?? null;
const anyOf = (a, base) => a.buffs.some((b) => b.key.startsWith(`${base}:`));
const skillOn = (u, id) => !!(u && u.skill && u.skill.id === id && u.skill.active);
/** 持续伤害 (attack type BUFF: the 'dot' / 'periodic' damage of the engine). */
const continuous = (d) => Array.isArray(d.tags) && (d.tags.includes('dot') || d.tags.includes('periodic'));
/** A skill that is not passive (the selectors' AdvancedCharacterValidator `_hasSkill`, PASSIVE excluded). */
const activeSkill = (a) => !!(a.skill && !a.skill.noSkill && a.skill.kind !== 'passive');
/** CheckCharSkillAvailable: the ally's skill could be cast now — ready, not running, no cast waiting. */
const skillAvailable = (a) => activeSkill(a) && a.skill.ready && !(a.skill.active && a.skill.isTimed) && !a.skill.pending;
/** BasicSkill.IsTriggerable: also on the field, able to act and not silenced. */
const triggerable = (a) => up(a) && !a.hidden && a.canAct && !a.s.flags.silence && skillAvailable(a);
/** CREATED_TIME_DES: the latest deployed first. */
const latest = (a, b) => (b.deployedAt ?? 0) - (a.deployedAt ?? 0) || (b.deploySeq ?? 0) - (a.deploySeq ?? 0);
/** 技力比例: the SP of the skill over its full SP (stored charges included); a free skill counts as full. */
function spRatio(a) {
  if (!activeSkill(a)) return 0;
  const full = a.skill.spCost * a.skill.maxCharges;
  return full > 0 ? a.skill.spTotal / full : 1;
}

/** T1 (tocka_t1[sp_and_heal]): `sp` SP for her, a heal of heal_scale × ATK on the most injured other ally operator of her range. */
function talent1(battle, src, t1) {
  if (!up(src) || src.hidden) return;
  giveSp(src, num(t1.sp, 0), 'talent');
  const pick = battle.injuredAlliesInKeys(src.rangeKeys, src).find((a) => a !== src && a.kind === 'op' && battle.allySelectable(a, src));
  const amount = src.s.atk * num(t1.heal_scale, 0);
  if (pick && amount > 0) battle.heal(src, pick, amount);
}

/** T2's mark on her (tocka_t2[aoe_mark_listener] → [aoe_mark], one) — the next normal attack is T2Attack. */
function mark(battle, src, t2) {
  if (!up(src) || !t2 || src.buffs.some((b) => b.key === MARK)) return;
  battle.addBuff(src, { key: MARK, tags: ['talent'] });
  syncT2(src, t2);
}

/**
 * Her attack profile: T2Attack's (`unit.mem.tockaT2`, a copy of the resolved profile — ai.js performAttack reads the
 * profile it was given, so the copy rides with a shot in flight) while she holds the mark outside S3's mode, else the
 * resolved one (`unit.mem.tockaBase`).
 */
function syncT2(unit, t2) {
  if (!t2) return;
  const want = unit.buffs.some((b) => b.key === MARK) && !skillOn(unit, S3);
  const cur = unit.profile;
  if (cur && cur === unit.mem.tockaT2) {
    if (!want) unit.profile = unit.mem.tockaBase;
    return;
  }
  if (!want || !cur) return;
  unit.mem.tockaBase = cur;
  unit.profile = unit.mem.tockaT2 = t2Profile(cur, t2);
}

/** T2Attack: the attack's damage on every enemy within attack@projectile_range of the hit, 虚弱 and the 持续伤害 on each. */
function t2Profile(base, t2) {
  const radius = num(t2['attack@projectile_range'], 0);
  const dur = num(t2['attack@t2_buff_duration'], 0);
  const weak = Math.abs(num(t2['attack@t2_atk'], 0));
  const scale = num(t2['attack@t2_magic_atk_scale'], 0);
  const prev = base.onEachHit;
  return {
    ...base, splashRadius: radius, splashScale: 1,
    onEachHit(b, u, victim, hc) {
      if (prev) prev(b, u, victim, hc);
      t2Debuff(b, u, victim, dur, weak, scale);
    },
  };
}

function t2Debuff(battle, src, e, dur, weak, scale) {
  if (!e || !e.alive || !(dur > 0)) return;
  if (weak > 0) battle.applyStatus(e, 'weaken', { duration: dur, value: weak, source: src });
  const amount = src.s.atk * scale;   // tocka_mx_a[t2_dot] dot_value: the ATK the shot cached × the scale
  if (!(amount > 0)) return;
  const key = keyOf(DOT, src);
  const old = e.buffs.find((b) => b.key === key);
  battle.addBuff(e, {
    key, duration: dur, interval: 1, data: { value: Math.max(amount, old?.data?.value ?? 0) }, tags: ['dot'],
    onTick: ({ battle: b, unit: t, buff }) => {
      b.dealDamage(src, t, { amount: buff.data.value, type: 'arts', canDodge: false, ignoreSelect: true, tags: ['dot', 'talent'] });
    },
  });
}

/** S1's picks: up to max_target ally operators of her range with no S1 effect, the lowest HP ratio first, then the latest. */
function s1Targets(battle, unit, bb) {
  const n = Math.max(1, Math.floor(num(bb.max_target, 1)));
  const list = alliesInGridOf(battle, unit).filter((a) => a.kind === 'op' && !anyOf(a, S1_FX));
  list.sort((a, b) => a.hpRatio - b.hpRatio || latest(a, b));
  return list.length > n ? list.slice(0, n) : list;
}

/** tocka_s1[shield]: the 屏障 an S1 effect leaves, losing its starting amount ÷ shield_time every second. */
function s1Shield(battle, a, src, amount, time) {
  const key = keyOf(SHIELD, src);
  const old = a.buffs.find((b) => b.key === key);
  const cap = Math.max(amount, old ? old.shield : 0);
  if (old) battle.removeBuff(a, old);
  if (!(cap > 0)) return;
  const dec = cap / Math.max(1e-9, time);
  battle.addBuff(a, {
    key, shield: cap, shieldType: SHIELD_TYPES, blockFx: true, interval: 1, tags: ['tocka'],
    onTick: ({ battle: b, unit: t, buff }) => {
      buff.shield = Math.max(0, buff.shield - dec);
      t.markDirty();
      if (!(buff.shield > 1e-9)) b.removeBuff(t, buff);
    },
  });
}

/** S2's pick: the latest deployed ally operator on the field with a skill and no S2 effect — not herself, unless she is the only one. */
function s2Target(battle, unit) {
  const pool = battle.alliesFor(unit).filter((a) => a.kind === 'op' && !a.hidden && activeSkill(a) && !anyOf(a, S2_FX) && !anyOf(a, AUTO));
  pool.sort(latest);
  return pool.find((a) => a !== unit) ?? pool.find((a) => a === unit) ?? null;
}

/** tocka_s2[trigger] set off: tocka_s2[auto_skill] on the ally, T1, the effect ends. */
function s2Fire(battle, src, x, fx, b2, t1) {
  battle.removeBuff(x, fx);
  battle.addBuff(x, {
    key: keyOf(AUTO, src), duration: num(b2.buff_duration), refresh: 'extend', mods: { aspd: num(b2.attack_speed) },
    interval: POLL, tags: ['tocka'],
    onTick: ({ unit: y }) => { if (y.skill && y.skill.manual && triggerable(y)) y.skill.activate('tocka'); },
  });
  talent1(battle, src, t1);
}

function s2Apply(battle, src, a, b2, t1, t2) {
  if (!up(a) || anyOf(a, S2_FX) || anyOf(a, AUTO)) return;
  battle.addBuff(a, {
    key: keyOf(S2_FX, src), interval: POLL, tags: ['tocka'],
    onTick: ({ battle: b, unit: x, buff }) => { if (skillAvailable(x)) s2Fire(b, src, x, buff, b2, t1); },
  });
  mark(battle, src, t2);
}

/** SelectCharacter (S3): another ally operator of her range without her S3 effect, by three groups, the highest SP ratio first. */
function s3Pick(battle, src) {
  const pool = alliesInGridOf(battle, src).filter((a) => a !== src && a.kind === 'op' && !own(a, S3_FX, src));
  pool.sort((a, b) => spRatio(b) - spRatio(a));
  return pool.find((a) => activeSkill(a) && !a.skill.active) ?? pool.find(activeSkill) ?? pool[0] ?? null;
}

function s3Apply(battle, src, a, b3, t2) {
  battle.addBuff(a, {
    key: keyOf(S3_FX, src), interval: 1, data: { valid: true }, tags: ['tocka'],
    // tocka_s3[skill_add_sp]: every second while her S3 runs (CheckCharSkillAffecting)
    onTick: ({ unit: x }) => { if (skillOn(src, S3)) giveSp(x, num(b3.bonus_sp), 'tocka'); },
  });
  mark(battle, src, t2);
}

/** tocka_s3[bonus]: ATK +bonus_init_atk, down by bonus_atk_dec_per_sec every second to 0, for bonus_duration s. */
function s3Bonus(battle, src, a, b3) {
  const dec = num(b3.bonus_atk_dec_per_sec);
  battle.addBuff(a, {
    key: keyOf(BONUS, src), duration: num(b3.bonus_duration), mods: { atkPct: num(b3.bonus_init_atk) }, interval: 1, tags: ['tocka'],
    onTick: ({ unit: t, buff }) => {
      buff.mods = { atkPct: Math.max(0, (buff.mods?.atkPct ?? 0) - dec) };
      t.markDirty();
    },
  });
}

/** tocka_s3[trigger] set off on ally `x`: the bonus on it, the move to another ally, the bonus on her, T1. */
function s3Fire(battle, src, x, b3, t1, t2) {
  const fx = own(x, S3_FX, src);
  if (!fx || !fx.data.valid) return;
  fx.data.valid = false;
  s3Bonus(battle, src, x, b3);
  const y = s3Pick(battle, src);   // (x still holds it: never picked)
  if (y) s3Apply(battle, src, y, b3, t2);
  battle.removeBuff(x, fx);
  if (x !== src) s3Bonus(battle, src, src, b3);
  talent1(battle, src, t1);
}

/** S1 / S2 cast themselves once their SP is full and their selector finds a target (CastSkill + SelectorTrigger). */
function canCast(battle, unit, id) {
  const sk = unit.skill;
  return !!sk && sk.id === id && up(unit) && !unit.hidden && unit.canAct && sk.ready && !unit.s.flags.silence && !sk.pending
    && !sk.active && battle.time >= sk.nextCastAt - 1e-9;
}

export default {
  // 冻河 — S1 屏障 + stun effects, S2 skill-ready ASPD (+ MANUAL auto-cast), S3 four-target stun shots and the moving ATK
  // effect; T1 SP + heal per effect set off, T2 the next attack's area 虚弱 + 持续伤害 per effect put on (header above).
  char_4244_tocka: (bb, chess) => {
    const t1 = talentBb(chess, 0), t2 = talentBb(chess, 1);
    const b1 = skillRec(chess, S1)?.bb ?? {}, b2 = skillRec(chess, S2)?.bb ?? {}, b3 = skillRec(chess, S3)?.bb ?? {};
    const hasT2 = Object.keys(t2).length > 0 ? t2 : null;
    return {
      skill: null,
      skills: {
        [S1]: {
          kind: 'instant', trigger: 'NEVER',
          onStart({ battle, unit }) {
            const atk = unit.s.atk * num(b1.atk_scale, 1);
            for (const a of s1Targets(battle, unit, b1)) {
              battle.addBuff(a, { key: keyOf(S1_FX, unit), data: { atk }, tags: ['tocka'] });
              mark(battle, unit, hasT2);
            }
          },
        },
        [S2]: {
          kind: 'instant', trigger: 'NEVER',
          onStart({ battle, unit }) {
            const t = s2Target(battle, unit);
            if (!t) return;
            if (t === unit) { s2Apply(battle, unit, t, b2, t1, hasT2); return; }
            battle.addProjectile({ from: unit, target: t, speed: S2_SHOT, visual: 'orb', source: unit, onHit: ({ target }) => { if (target) s2Apply(battle, unit, target, b2, t1, hasT2); } });
          },
        },
        [S3]: {
          kind: 'duration',
          mods: { aspd: num(b3.attack_speed) },
          targeting: { maxTargets: Math.max(1, Math.floor(num(b3['attack@max_target'], 1))) },
          attack: { atkScale: num(b3['attack@atk_scale'], 1), onHitStatus: { key: 'stun', duration: num(b3['attack@stun']) } },
          onStart({ battle, unit }) {
            syncT2(unit, hasT2);   // S3's mode: no T2Attack
            const held = battle.allyUnits.filter((a) => a.alive && own(a, S3_FX, unit));
            if (held.length) for (const a of held) s3Fire(battle, unit, a, b3, t1, hasT2);
            else {
              const y = s3Pick(battle, unit);
              if (y) s3Apply(battle, unit, y, b3, hasT2);
            }
          },
          onEnd({ unit }) { syncT2(unit, hasT2); },
        },
      },
      install(battle, unit) {
        const sid = unit.skill?.id;
        if (hasT2) {
          // T2Attack spends the mark; the profile follows the mark (and a profile the engine resolves afresh)
          battle.on('attack', (c) => {
            if (c.attacker !== unit || c.isSkill || unit.profile !== unit.mem.tockaT2) return;
            battle.removeBuff(unit, MARK);
            syncT2(unit, hasT2);
          }, { owner: unit });
          battle.on('tick', () => syncT2(unit, hasT2), { owner: unit });
        }
        if (sid === S1 || sid === S2) {
          battle.on('tick', () => {
            if (!canCast(battle, unit, sid)) return;
            if (sid === S1 ? s1Targets(battle, unit, b1).length > 0 : !!s2Target(battle, unit)) unit.skill.activate('SP_FULL');
          }, { owner: unit });
        }
        if (sid === S1) {
          // tocka_s1[trigger]: the first damage the ally takes that is neither 元素伤害 nor 持续伤害 (late: after any cancel)
          const key = keyOf(S1_FX, unit);
          battle.on('hit', (ctx) => {
            const a = ctx.target, d = ctx.dmg;
            if (!a || a.side !== 'ally' || !d || d.cancel || d.type === 'elemental' || continuous(d)) return;
            const fx = a.buffs.find((b) => b.key === key);
            if (!fx) return;
            battle.removeBuff(a, fx);
            s1Shield(battle, a, unit, fx.data.atk * num(b1.shield_atk_scale), num(b1.shield_time, 10));
            const s = ctx.source;
            if (s && s.alive && s.side !== 'ally') battle.applyStatus(s, 'stun', { duration: num(b1.stun), source: unit });
            talent1(battle, unit, t1);
          }, { owner: unit, priority: -100 });
        }
        if (sid === S2) {
          battle.on('skillStart', (c) => {
            const fx = c.unit && own(c.unit, S2_FX, unit);
            if (fx) s2Fire(battle, unit, c.unit, fx, b2, t1);
          }, { owner: unit });
        }
        if (sid === S3) {
          battle.on('skillStart', (c) => { if (c.unit && c.unit !== unit && own(c.unit, S3_FX, unit)) s3Fire(battle, unit, c.unit, b3, t1, hasT2); }, { owner: unit });
          // S3Passive ends with her: her S3 effect leaves every ally
          battle.on('death', (c) => {
            if (c.unit !== unit) return;
            for (const a of battle.allyUnits) { const fx = a.alive ? own(a, S3_FX, unit) : null; if (fx) battle.removeBuff(a, fx); }
          }, { owner: unit });
        }
      },
    };
  },
};
