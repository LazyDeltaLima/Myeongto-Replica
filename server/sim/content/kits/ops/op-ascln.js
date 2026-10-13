// server/sim/content/kits/ops/op-ascln.js — 阿斯卡纶 (char_4132_ascln) 自选 operator kit — local patch: this fork's 선발
// kit (formerly kits/diy.js, docs/LOCAL-PATCH.md 「선발 오퍼레이터」) on upstream's 自选 framework; it replaces upstream's
// op-ascln.js (the owner's rule: where the two differ, ours wins). 6★ 伏击客 (特种); every skill, both talents, both
// modules. Kit contract: ../README.md ("How to add an operator (自选)"); `chess` = the composed 自选 record (shared/diy.js
// diyRecordOf). Sources and the 2026-10-07 fixes: maintainer's notes 2026-10-07 §4.
//
// Trait (branch): hits every enemy of her range, 50 % dodge (AMB-Y 65 %: trait bb prob), less likely to be targeted —
// taunt level −1, which her data stats already carry (表 tauntLevel −1; PRTS 伏击客 「嘲讽等级为-1」): the kit trait installs
// the dodge only (professions.js installStalker adds its own −1 on top — −2 before 2026-10-07; S3 −1 → +1, PRTS
// 「从-1提升至1」). AMB-X 「攻击范围内所有敌人移动速度-20%」 (hidden talent move_speed): every enemy of her current range, air
// units too, moves ×(1 + move_speed), refreshed every 0.25 s; one slow per 阿斯卡纶 (her own key) — PRTS 「多个伏击客X模组
// 之间的减速效果可叠加」 — multiplied with every other slow.
// 死亡拘审: each hit gives a stack (≤ 3, 25 s, refreshed): move speed −18 % per stack, arts 10 % of her CURRENT ATK per
// second per stack (PRTS: "阿斯卡纶当前攻击力"); every effect ends when she leaves the field (PRTS 备注). AMB-Y stage 2 / 3
// (talent hp_ratio 0.05 / 0.1, battle_equip_table uniequip_003_ascln): 「拥有该效果的敌人被击倒时阿斯卡纶回复X%生命」 — an
// enemy carrying her effect knocked out (reason 'killed', by anyone; BT ascln_e_003_t_1[heal] ON_OWNER_FINISH →
// HealViaMaxHpRatio [ASSUMED: a knock-out, not a leak]) heals her hp_ratio × max HP while she is on the field.
// 噬光残影: ASPD +attack_speed, +attack_speed_add while at least `cnt` of her 4 neighbouring tiles are high ground — any
// HIGH tile, the undeployable ones too (BT ascln_t_2 CheckHeightTypeInRange x-5: the height type only), judged per deploy.
// S2: ATK +; every enemy of her range, air units too, −|move_speed| (PF skchr_ascln_2 Aura targetMotion 3; PRTS 修正
// 「使攻击范围内所有敌人移动速度-N%」); a GROUND enemy of her range knocked out (reason 'killed') gives one 死亡拘审 stack to
// every selectable ground enemy within range_radius of it (BT ascln_s_2[enemy]: CheckMotionMode WALK, WALK_ONLY).
// S3: ground enemies inside her range have their 物理 / 法术 hit rate −N % (bb damage_hitrate_physical / _magical): one
// roll per enemy attack at its first damage instance, every instance of that attack shares it (PRTS 命中率 「开始攻击时」)
// [engine: no hit-rate stat — a cancel in `hit`]; a miss on her (once per attack) or her own dodge heals her hp_ratio of
// max HP.

import { COLS } from '../../../constants.js';
import { canTargetEnemy } from '../../../targeting.js';
import { talentBb, moduleBb, traitBb } from '../shared/tier1.js';

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const live = (u) => !!u && u.alive && u.deployed && !u.removed && !u.hidden;
const selectedSkill = (chess, def) => chess?.skill?.skillId ?? def?.skill?.id ?? null;
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

/** Buff key of `src`'s 死亡拘审 on an enemy (named as upstream's test helpers import it). */
export const dreadKey = (src) => `ascln:judg:${src.id}`;
/** Tag of the 死亡拘审 damage ticks. */
export const DREAD_TAG = 'ascln:dread';

function ascalon(bb, chess, def) {
  const t0 = talentBb(chess, 0), t1 = talentBb(chess, 1);
  const slow = Math.abs(num(t0.move_speed, -0.18)), ratio = num(t0.atk_ratio, 0.1);
  const maxStacks = Math.max(1, num(t0.max_stack_cnt, 3)), dur = num(t0.debuff_duration, 25);
  const judge = (battle, unit, e, n = 1) => {
    if (!e?.alive || e.side !== 'enemy') return;
    for (let i = 0; i < n; i++) {
      const b = battle.addBuff(e, {
        key: dreadKey(unit), duration: dur, refresh: 'stack', stacks: 1, maxStacks, interval: 1, source: unit, visible: true,
        mods: { moveMul: 1 - slow },
        onTick: ({ unit: t, buff }) => {
          if (!live(unit)) return;
          battle.dealDamage(unit, t, { amount: unit.s.atk * ratio * Math.max(1, buff.stacks || 1), type: 'arts', canDodge: false, ignoreSelect: true, tags: ['dot', 'talent', DREAD_TAG] });
        },
      });
      // linear −18 % per stack (not compounding)
      if (b) { b.mods = { moveMul: Math.max(0.05, 1 - slow * Math.max(1, b.stacks || 1)) }; e.markDirty?.(); }
    }
  };
  const dodge = num(traitBb(chess).prob, 0.5);
  return {
    trait: {
      // 伏击客: the dodge only — the taunt level −1 is in her stats (no second −1 from the profile's install)
      install(battle, unit) {
        const p = num(unit.profile?.dodge, dodge);
        if (p > 0) battle.addBuff(unit, { key: 'trait:stalker', mods: { dodgePhys: p, dodgeArts: p }, persist: true, allowDead: true });
      },
    },
    skills: {
      // 追袭 (AUTO, charges): the next attack at atk_scale, twice
      skchr_ascln_1: { kind: instantKind(def), attack: { atkScale: num(bb.atk_scale, 1.7), hits: 2 } },
      // 恩赐: ATK +atk; every enemy in range (air too) −40 % move speed; a ground enemy of her range knocked out → 1 stack on
      // the ground enemies around it
      skchr_ascln_2: {
        kind: 'duration', mods: { atkPct: num(bb.atk) },
        onTick({ battle, unit }) {
          if (battle.time - num(unit.mem.asclnSlowAt, -9) < 0.25) return; // refreshed 4× a second (0.5 s status)
          unit.mem.asclnSlowAt = battle.time;
          for (const e of inRange(battle, unit)) battle.applyStatus(e, 'slow', { duration: 0.5, value: Math.abs(num(bb.move_speed, -0.4)), source: unit });
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
        const heal = num(t0.hp_ratio); // AMB-Y stage 2+ (0.05 / 0.1)
        battle.on('death', ({ unit: u, reason }) => {
          if (u === unit) { // her stacks end with her
            for (const e of battle.enemies) battle.removeBuff?.(e, dreadKey(unit));
            return;
          }
          // AMB-Y: an enemy carrying her 死亡拘审 knocked out (by anyone) heals her
          if (heal > 0 && u.side === 'enemy' && reason === 'killed' && live(unit) && u.buffs.some((b) => b.key === dreadKey(unit))) {
            battle.heal(unit, unit, unit.s.maxHp * heal, { self: true });
          }
        }, { owner: unit });
      } },
      { install(battle, unit) { // 噬光残影
        const base = num(t1.attack_speed, 8), add = num(t1.attack_speed_add, 6), cnt = Math.max(1, Math.floor(num(t1.cnt, 1)));
        battle.on('deploy', ({ unit: u }) => {
          if (u !== unit) return;
          // any HIGH tile counts, undeployable high ground too (ascln_t_2 CheckHeightTypeInRange: the height type only)
          const high = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dr, dc]) => {
            const r = unit.tileR + dr, c = unit.tileC + dc;
            return battle.grid.inBounds(r, c) && battle.grid.tile(r, c).height === 'HIGH';
          }).length;
          battle.addBuff(unit, { key: 'ascln:aspd', duration: Infinity, mods: { aspd: base + (high >= cnt ? add : 0) } });
        }, { owner: unit });
      } },
    ],
    install(battle, unit) {
      const s = selectedSkill(chess, def);
      // AMB-X: every enemy of her range (air too) moves ×(1 + move_speed) — one slow per 阿斯卡纶 (they stack, PRTS)
      const mx = num(moduleBb(chess).move_speed);
      if (mx < 0) {
        const key = `ascln:ambx#${unit.id}`;
        battle.every(0.25, () => {
          if (!live(unit)) return;
          for (const e of inRange(battle, unit)) battle.addBuff(e, { key, duration: 0.4, mods: { moveMul: Math.max(0, 1 + mx) }, source: unit });
        }, { owner: unit, immediate: true });
      }
      if (s === 'skchr_ascln_2') {
        battle.on('death', ({ unit: e, reason }) => {
          // ascln_s_2[enemy]: ON_OWNER_KILLED of a WALK enemy → the ground enemies around it (not the dead one)
          if (!unit.skill?.active || unit.skill.id !== 'skchr_ascln_2' || e.side !== 'enemy' || e.isFlying || reason !== 'killed' || !live(unit)) return;
          // (audit 2026-10-06) rangeKeys is an array — `.has?.` was undefined, so the spread never ran
          const inR = unit.rangeKeySet || new Set(unit.rangeKeys || []);
          if (!inR.has(Math.round(e.y) * COLS + Math.round(e.x))) return;
          // its sound (docs/rules/audio.md 「버프·커스텀 트리거 소리」: the template's PlayAudio ASCLN_S_2_BOMB at her)
          battle.fx('kitHit', { x: unit.x, y: unit.y, id: unit.id, k: 'ascln:s2bomb' });
          for (const v of battle.foesInRadius(e.x, e.y, num(bb.range_radius, 1.3), true)) {
            if (v !== e && !v.isFlying && canTargetEnemy(unit, v, ANY)) judge(battle, unit, v);
          }
        }, { owner: unit });
      }
      if (s === 'skchr_ascln_3') {
        const missPhys = Math.abs(num(bb['attack@damage_hitrate_physical'], -0.3));
        const missArts = Math.abs(num(bb['attack@damage_hitrate_magical'], -missPhys));
        const heal = () => { if (live(unit)) battle.heal(unit, unit, unit.s.maxHp * num(bb['attack@hp_ratio'], 0.05), { self: true }); };
        const last = new WeakMap(); // enemy → { id: its attackId, miss } — one roll per attack (PRTS 命中率 「开始攻击时」)
        battle.on('hit', (c) => {
          if (!unit.skill?.active || unit.skill.id !== 'skchr_ascln_3') return;
          const src = c.source, d = c.dmg;
          if (!src || src.side !== 'enemy' || src.isFlying || !d?.isAttack || d.cancel || (d.type !== 'phys' && d.type !== 'arts')) return;
          let miss, first = true;
          const prev = d.attackId ? last.get(src) : null;
          if (prev && prev.id === d.attackId) { miss = prev.miss; first = false; } else {
            // (2026-10-07 port) rangeKeys is an array: the old `(unit.rangeKeys || new Set()).has?.(…)` was always
            // undefined, so the miss never happened — the same bug the 2026-10-06 audit fixed in S2
            const inR = unit.rangeKeySet || new Set(unit.rangeKeys || []);
            miss = inR.has(Math.round(src.y) * COLS + Math.round(src.x)) && battle.rng() < (d.type === 'arts' ? missArts : missPhys);
            if (d.attackId) last.set(src, { id: d.attackId, miss });
          }
          if (!miss) return;
          d.cancel = true;
          battle.fx('dodge', { x: c.target.x, y: c.target.y, id: c.target.id });
          if (first && c.target === unit) heal(); // 敌人未命中自身: once per missed attack
        }, { owner: unit, priority: 5 });
        battle.on('dodge', (c) => { if (c.target === unit && unit.skill?.active && unit.skill.id === 'skchr_ascln_3') heal(); }, { owner: unit });
      }
    },
  };
}

export default {
  char_4132_ascln: (bb, chess, def) => ascalon(bb, chess, def),
};
