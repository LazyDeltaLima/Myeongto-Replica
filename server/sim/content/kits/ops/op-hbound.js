// server/sim/content/kits/ops/op-hbound.js — 旅骨 (char_4232_hbound) kit: 5★ 炼金师 (特种), a tier-3 piece of 规程 (act3autochess)
// (shared/seasons.js `act3autochess`, docs/rules/diy.md 「새 시즌 블루포이즌·하이모어·홈바운드·안드레아나」); both skills, the talent and ALC-X in both forms. CN client only.
//
// Forms (data/seasons/act3autochess/chess.json): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7, ALC-X stage 1.
// Sources: the record's tables; PRTS 旅骨 (备注 of T1, S1, S2, ALC-X); skill prefabs skchr_hbound_1 / _2 (group HitEnemy, then HitTile), projectiles projectile_chr_hbound_s1 /
// _s2, buff_template_data hbound_s_1[dot], hbound_s_2[buff] / [weight_detector] / [heavy_damage], hbound_t_1 / [hitrate].
// - The throw (`_switchToState` 1, clip Skill_N, `_selectTargetTiming` 1): at the clip's OnAttack frame, the first ground enemy of her range (HitEnemy); none → a tile of
//   `_filterType` DIST_DES_FRONT_FIRST (HitTile), the farthest tile straight ahead as 引星棘刺's same selector (PRTS 引星棘刺 备注). The unit flies to that spot at speed 10
//   (`_projectileDestination`: a point, it follows nobody) and acts from its landing for projectile_delay_time s, its ATK cached at the throw (CacheAtkToBBBehaviour,
//   `_increaseByTime` off, so S2's `value` does not grow anything), after she leaves too (PRTS, T1).
// - Who: ground enemies within projectile_range (`_targetOptions`, AuraHitBehaviour `_tickInterval` 10 frames); leaving, or the unit's stop, ends what they have (`_detachBuffsWhenTargetLeave`,
//   `_detachAllBuffsWhenStopped`).
// - S1 触礁 (hbound_s_1[dot], `disableOverride`: one per unit, they add up; PRTS): MOVE_SPEED FINAL_SCALER; atk_scale × ATK arts every 1 s, the first after 0.9 s, NoSourceDamage.
// - S2 座浅 (hbound_s_2[buff], `disableOverride`): atk_scale × ATK likewise. Each 0.1 s (PRTS 3 frames) [weight_detector]: weight ≥ value gives [heavy_damage] (MOVE_SPEED FINAL_SCALER;
//   heavy_atk_scale × ATK arts every 1 s, the first after 1 s), a lighter weight takes it away.
// - T1 潜水作业 (hbound_t_1, values taken at the throw): that enemy's physical and arts hit rate × (1 + hitrate), weight ≥ value × (1 + heavy_hitrate), rechecked each 0.1 s; one
//   per enemy, the highest multiplier of several 旅骨 (PRTS). Rolled once per attack as every hit rate here (standin-acsupo.js, PRTS 命中率).
// - ALC-X: +sp_recovery_per_sec while any alchemy unit is out (PRTS "任何来源的任何炼金单元弹道"), in flight too.

import { num, talentBb, moduleBb, skillRec, up, toggleBuff, enemiesInGrid, instantKind } from '../shared/tier1.js';
import { COLS } from '../../../constants.js';
import { toLocal } from '../../../dir.js';
import { hypot } from '../../../detmath.js';
/** @import { KitFns, KitChess, KitSkill } from '../shared/tier1.js' */
/** @import { Battle } from '../../../Battle.js' */
/** @import { Unit } from '../../../units.js' */
/** @import { BuffRec } from '../../bonds/shared.js' */
/** @import { Buff } from '../../../battle/status.js' */
/** @import { HitEv } from '../../support/index.js' */

const S1 = 'skchr_hbound_1';
const S2 = 'skchr_hbound_2';
const HITRATE = 'hbound_t_1[hitrate]';
const HEAVY = 'hbound_s_2[heavy_damage]';
/** `disableOverride`: one instance per unit, none replaced. */
const MANY = 99;
/** projectile_chr_hbound_s1 / _s2 (`_speed`, tiles/s). */
const SHOT = 10;
const TICK = 0.1;
/** AuraHitBehaviour `_tickInterval` 10 frames at 30 per second. */
const AURA = 1 / 3;
const FIRST = 0.9;
const EPS = 1e-9;
const STATE = new WeakMap();   // battle → the last roll per enemy
/** @param {KitChess} chess @param {string} id */
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

/**
 * One thrown unit (`unit.mem.zones`, throwSpec) and an enemy's state inside it (`in`): its next 1 s tick, the weight rule's
 * own tick, the time inside, its slow and its weight slow.
 * @typedef {{ next: number, heavyNext: number | null, t: number, slow: Buff | null, heavy: Buff | null }} HbZoneIn
 * @typedef {{ x: number, y: number, r: number, sound: string, reached: boolean, land: number, until: number, aura: number,
 *   in: Map<Unit, HbZoneIn>, atk: number, scale: number, slow: number, moment: string, heavyAt: number | null,
 *   heavySlow: number, heavyScale: number, hitAt: number, cut: number, heavyCut: number }} HbZone
 */

/** Whether an alchemy unit of anyone is out: this kit's and 引星棘刺's `mem.zones`, 锡人's `mem.tinZones`. @param {Battle} battle */
const alchemyOut = (battle) => battle.allyUnits.some((a) => a.mem && ((a.mem.zones?.length ?? 0) > 0 || (a.mem.tinZones ?? 0) > 0));

/** One 'hit' handler per battle: an attack of an enemy holding the buff misses by one roll. No owner: the unit acts after she leaves. @param {Battle} battle */
function installHitRate(battle) {
  if (STATE.has(battle)) return;
  const last = new WeakMap();
  STATE.set(battle, last);
  battle.on('hit', (/** @type {HitEv & { stopPropagation?: boolean }} */ c) => {
    const e = c.source, d = c.dmg;
    if (!e || e.side !== 'enemy' || !d?.isAttack || d.cancel || (d.type !== 'phys' && d.type !== 'arts')) return;
    const held = /** @type {BuffRec | null} */ (e.findBuff(HITRATE));
    if (!held) return;
    const prev = d.attackId ? last.get(e) : null;
    let miss;
    if (prev && prev.id === d.attackId) miss = prev.miss;
    else {
      miss = battle.rng() < held.data.cut;
      if (d.attackId) last.set(e, { id: d.attackId, miss });
    }
    if (!miss) return;
    d.cancel = true;
    c.stopPropagation = true;
    if (c.target) battle.fx('dodge', { x: c.target.x, y: c.target.y, id: c.target.id });
  }, { priority: 300 });
}

/** The spot: the first ground enemy of her range, else the farthest tile straight ahead. @param {Battle} battle @param {Unit} unit */
function landing(battle, unit) {
  const t = enemiesInGrid(battle, unit, null, { n: 1, groundOnly: true })[0];
  if (t) return { x: t.x, y: t.y, tile: false };
  let best = null;
  for (const k of unit.rangeKeys || []) {
    const r = Math.floor(k / COLS), c = k % COLS;
    if (!battle.grid.inRect(r, c)) continue;
    const [lat, d] = toLocal(r - unit.tileR, c - unit.tileC, unit.dir);
    if (lat === 0 && d > 0 && (!best || d > best.d)) best = { d, x: c, y: r, tile: true };
  }
  return best;
}

/** @param {Battle} battle @param {Unit} unit @param {HbZone} z @param {Unit} e */
function enter(battle, unit, z, e) {
  /** @type {HbZoneIn} */
  const st = { next: FIRST, heavyNext: null, t: -TICK, slow: null, heavy: null };   // (this step counts as its start)
  z.in.set(e, st);
  if (z.slow < 1) st.slow = battle.addBuff(e, { key: z.moment, source: unit, refresh: 'independent', maxStacks: MANY, mods: { moveMul: z.slow }, tags: ['skill'] });
  return st;
}

/** @param {Battle} battle @param {HbZone} z @param {Unit} e @param {HbZoneIn} st */
function leave(battle, z, e, st) {
  z.in.delete(e);
  if (st.slow) battle.removeBuff(e, st.slow);
  if (st.heavy) battle.removeBuff(e, st.heavy);
}

/** @param {Battle} battle @param {Unit} unit @param {Unit} e @param {number} amount @param {string} moment */
function arts(battle, unit, e, amount, moment) {
  battle.dealDamage(unit, e, { amount, type: 'arts', isSkill: true, sourceless: true, showSource: true, ignoreSelect: true, tags: ['dot', 'zone'], moment });
}

/** A landed unit's step (TICK). @param {Battle} battle @param {Unit} unit @param {HbZone} z */
function stepZone(battle, unit, z) {
  z.aura -= TICK;
  if (z.aura <= EPS) {
    z.aura += AURA;
    const inside = new Set(battle.foesInRadius(z.x, z.y, z.r).filter((e) => !e.isFlying));
    for (const [e, st] of z.in) if (!inside.has(e)) leave(battle, z, e, st);
    for (const e of inside) if (!z.in.has(e)) enter(battle, unit, z, e);
  }
  for (const [e, st] of z.in) {
    if (!e.alive) { z.in.delete(e); continue; }
    st.t += TICK;
    const weight = e.weight;
    if (z.heavyAt != null) {
      if (weight >= z.heavyAt && st.heavyNext == null) {
        st.heavyNext = st.t + 1;
        st.heavy = battle.addBuff(e, { key: HEAVY, source: unit, refresh: 'independent', maxStacks: MANY, visible: true, mods: { moveMul: z.heavySlow }, tags: ['skill'] });
      } else if (weight < z.heavyAt && st.heavyNext != null) {
        st.heavyNext = null;
        battle.removeBuff(e, /** @type {Buff} */ (st.heavy));
        st.heavy = null;
      }
    }
    const cut = z.hitAt > 0 && weight >= z.hitAt ? z.heavyCut : z.cut;
    if (cut > 0) {
      const held = /** @type {BuffRec | null} */ (e.findBuff(HITRATE));
      if (!held || cut <= held.data.cut + EPS) battle.addBuff(e, { key: HITRATE, source: unit, duration: 2 * TICK + EPS, data: { cut }, tags: ['talent'] });
    }
    if (st.t >= st.next - EPS) {
      st.next += 1;
      arts(battle, unit, e, z.atk * z.scale, z.moment);
      if (!e.alive) continue;
    }
    if (st.heavyNext != null && st.t >= st.heavyNext - EPS) {
      st.heavyNext += 1;
      arts(battle, unit, e, z.atk * z.heavyScale, HEAVY);
    }
  }
}

/** The zone of a skill: S2 has its weight rule (`heavy`). @param {KitChess} chess @param {string} id @param {boolean} heavy @returns {KitSkill} */
function throwSpec(chess, id, heavy) {
  const b = bbOf(chess, id), t0 = talentBb(chess, 0);
  return {
    kind: instantKind({ skill: { maxCharges: num(skillRec(chess, id)?.maxChargeTime, 1) } }),
    onStrike({ battle, unit }) {
      const at = landing(battle, unit);
      if (!at) return;
      const dur = num(b.projectile_delay_time), r = num(b.projectile_range);
      const fly = hypot(at.x - unit.x, at.y - unit.y) / SHOT;
      const mv = Math.max(0, 1 + num(b.move_speed));
      /** @type {HbZone} */
      const z = {
        x: at.x, y: at.y, r, sound: heavy ? 's2' : 's1', reached: false,
        land: battle.time + fly, until: battle.time + fly + dur, aura: 0, in: new Map(), atk: unit.s.atk,
        scale: num(b.atk_scale), slow: heavy ? 1 : mv, moment: heavy ? 'hbound_s_2[buff]' : 'hbound_s_1[dot]',
        heavyAt: heavy ? num(b.value) : null, heavySlow: mv, heavyScale: heavy ? num(b.heavy_atk_scale) : 0,
        hitAt: num(t0.value), cut: Math.abs(num(t0.hitrate)), heavyCut: Math.abs(num(t0.heavy_hitrate)),
      };
      (unit.mem.zones ??= []).push(z);
      battle.fx('zone', { x: at.x, y: at.y, id: unit.id, r, duration: fly + dur });
      // the group's second child HitTile has an ON bank (`.2`), HitEnemy none
      if (at.tile) battle.fx('kitHit', { x: unit.x, y: unit.y, id: unit.id, k: `hbound:${z.sound}on` });
    },
  };
}

/** @type {KitFns} */
export default {
  char_4232_hbound: (bb, chess) => {
    const sp = num(moduleBb(chess).sp_recovery_per_sec);
    return {
      skills: { [S1]: throwSpec(chess, S1, false), [S2]: throwSpec(chess, S2, true) },
      install(battle, unit) {
        installHitRate(battle);
        // the units keep acting after she falls (no `up` here): they are already thrown
        battle.every(TICK, () => {
          const zones = unit.mem.zones;
          if (!zones?.length) return;
          for (const z of zones) {
            if (battle.time >= z.until - EPS) {
              for (const [e, st] of [...z.in]) leave(battle, z, e, st);
              battle.fx('kitHit', { x: z.x, y: z.y, id: unit.id, k: `hbound:${z.sound}stop` }); // its projectile's STOP
              continue;
            }
            if (battle.time >= z.land - EPS) {
              if (!z.reached) { z.reached = true; battle.fx('kitHit', { x: z.x, y: z.y, id: unit.id, k: `hbound:${z.sound}reach` }); } // its projectile's REACH
              stepZone(battle, unit, z);
            }
          }
          unit.mem.zones = zones.filter((/** @type {HbZone} */ z) => battle.time < z.until - EPS);
        }, { owner: unit });
        if (sp > 0) toggleBuff(battle, unit, 'hbound_e_t_10', () => up(unit) && alchemyOut(battle), { spRecoveryFlat: sp });
      },
    };
  },
};
