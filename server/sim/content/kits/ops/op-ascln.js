// server/sim/content/kits/ops/op-ascln.js — 阿斯卡纶 (char_4132_ascln) 自选 operator kit — local patch: the nas-local 선발
// kit (formerly kits/diy.js, docs/LOCAL-PATCH.md 「선발 오퍼레이터」) on upstream's 自选 framework; it replaces upstream's
// op-ascln.js (the owner's rule: where the two differ, ours wins). 6★ 伏击客 (特种); every skill, both talents. Kit contract:
// ../README.md ("How to add an operator (自选)"); `chess` = the composed 自选 record (shared/diy.js diyRecordOf).
//
// Trait (branch): hits every enemy of her range, 50 % dodge, less likely to be targeted (professions.js stalker).
// 死亡拘审: each hit gives a stack (≤ 3, 25 s, refreshed): move speed −18 % per stack, arts 10 % of her CURRENT ATK per
// second per stack (PRTS: "阿斯卡纶当前攻击力"); every effect ends when she leaves the field (PRTS 备注).
// 噬光残影: ASPD +attack_speed, +attack_speed_add while one of her 4 neighbouring tiles is high ground.
// S3: enemies inside her range miss 30 % of their attacks (on anyone) [engine: no hit-rate stat — a cancel in `hit`];
// a miss on her or her own dodge heals her hp_ratio of max HP.

import { COLS } from '../../../constants.js';
import { talentBb } from '../shared/tier1.js';

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
          for (const e of battle.enemies) battle.removeBuff?.(e, dreadKey(unit));
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
          // (audit 2026-10-06) rangeKeys is an array — `.has?.` was undefined, so the spread never ran
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
          // (2026-10-07 port) rangeKeys is an array: the old `(unit.rangeKeys || new Set()).has?.(…)` was always undefined,
          // so the miss never happened — the same bug the 2026-10-06 audit fixed in S2
          const inR = unit.rangeKeySet || new Set(unit.rangeKeys || []);
          if (!inR.has(Math.round(src.y) * COLS + Math.round(src.x))) return;
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

export default {
  char_4132_ascln: (bb, chess, def) => ascalon(bb, chess, def),
};
