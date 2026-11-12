// server/sim/content/garrisons/effects/stats.js — the stat 特质: the fixed ones (GAIN_BUFF, attr_common_global_buff)
// and the layer readers (每叠加N层: floor(Σ layers of the listed active bonds / divide_num) — garrisons/battle.js header).

import * as S from '../../support/index.js';
import { ids, EMPTY, byUnit } from '../shared.js';
import { raiseUrsusExtra } from '../../bonds/nation/ursus.js';
import { bondSteps } from './triggered.js';

/** Installers of the fixed stat 特质 by effect key: (battle, instances of the key). */
export const STAT_INSTALLERS = {
  GAIN_BUFF(battle, list) {
    for (const it of list) {
      const mods = {};
      if (S.num(it.bb.atk, 0) > 0) mods.atkMul = S.num(it.bb.atk);
      if (S.num(it.bb.max_hp, 0) > 0) mods.hpMul = S.num(it.bb.max_hp);
      if (S.num(it.bb.def, 0) > 0) mods.defMul = S.num(it.bb.def);
      S.passiveBuff(battle, it.unit, it.buffKey, mods);
    }
  },

  // 规程 garrison_23 (乌萨斯 6): "击倒单位时叠加的临时层数提升至4层；在场6名…提升至6层" — the player's AUTOCHESS globals
  // ursus_extra_bond_stack_cnt / [power] become ex_bond_cnt / ex_bond_cnt[power] if higher (bonds/nation/ursus.js
  // raiseUrsusExtra), added to each member knock-out's 临时层数
  act3autochess_gar_effect_ursusexbondcnt(battle, list) {
    for (const it of list) raiseUrsusExtra(battle, it.unit.ownerId, S.num(it.bb.ex_bond_cnt), S.num(it.bb['ex_bond_cnt[power]']));
  },

  // 规程 克莱门莎 garrison_65 "<战斗开始时>【阿戈尔】盟约每叠加20层，使场上所有敌人侵蚀损伤冷却恢复速度+1%": every enemy on the
  // field (use_global_range) gets act3autochess_gar_effect_block_eprecoverspeed, whose EP_BREAK_RECOVER_SPEED MULTIPLIER
  // + ep_break_recover_speed_base × floor(layers of bond_id / denominator) holds while that enemy is blocked by the holder
  // (CheckBlocked, the holder as source) AND in its ep_type burst (WATER = 侵蚀, FilterEPBreakRecoveryType; ON_EP_BREAK_START
  // / _FINISH / ON_OWNER_BLOCKEE_CHANGED re-check it, the steps read at each check). The burst's 爆发冷却 (damage.js
  // `<el>Burst`) then runs that much faster: its time left drops by dt × the bonus each tick.
  act3autochess_gar_effect_block_eprecoverspeed_inrange(battle, list) {
    const EP = { WATER: 'erosion', FIRE: 'burn', NEURAL: 'neural', DARK: 'apoptosis' };
    for (const it of list) { it.el = EP[it.bbStr.ep_type || 'WATER'] || 'erosion'; it.rate = new Map(); }
    const check = (it, e) => {
      const h = it.unit;
      const on = S.onField(h) && e.alive && e.blockedBy === h && !!e.findBuff(`${it.el}Burst`);
      if (!on) { it.rate.delete(e); return; }
      if (it.rate.has(e)) return;
      const k = bondSteps(battle, h.ownerId, [it.bbStr.bond_id].filter(Boolean), it.bb.denominator);
      if (k > 0) it.rate.set(e, S.num(it.bb.ep_break_recover_speed_base, 0) * k);
    };
    battle.on('tick', ({ dt }) => {
      for (const it of list) {
        for (const e of battle.enemies) check(it, e);
        for (const [e, r] of it.rate) {
          const b = e.findBuff(`${it.el}Burst`);
          if (b && Number.isFinite(b.timeLeft) && r > 0) b.timeLeft = Math.max(0, b.timeLeft - dt * r);
        }
      }
    });
  },

  attr_common_global_buff(battle, list) {
    for (const it of list) {
      const mods = {};
      if (S.num(it.bb.sp_recovery_per_sec, 0)) mods.spRecoveryFlat = S.num(it.bb.sp_recovery_per_sec);
      Object.assign(mods, S.directMods({ atk: S.num(it.bb.atk, 0), hp: S.num(it.bb.max_hp, 0) }));
      if (S.num(it.bb.attack_speed, 0)) mods.aspd = S.num(it.bb.attack_speed);
      S.passiveBuff(battle, it.unit, it.buffKey, mods);
    }
  },
};

export const READERS = new Set([
  'act1autochess_gar_eff_attrByBond', 'act1autochess_gar_eff_respawnTimeByBond',
  'act2autochess_gar_eff_attrByBond_add_onstart', 'act2autochess_gar_eff_ab_damageScaleByBond',
]);

/** floor(Σ layers of the listed active bonds / divide_num). */
export function stepsOf(battle, it) {
  const div = Math.max(1, S.num(it.bb.divide_num, 1));
  let sum = 0;
  for (const b of it.bonds ?? (it.bonds = ids(it.bbStr.bond_id))) if (S.bondActive(battle, it.unit.ownerId, b)) sum += S.bondLayers(battle, it.unit.ownerId, b);
  return Math.floor(sum / div);
}

function attrMods(bb, k) {
  // "每叠加N层，本干员攻击力+X%": a 直接乘算 bonus like every other "+X%" of the 卫戍 systems (support directMods)
  const m = S.directMods({ atk: S.num(bb.atk, 0) * k, hp: S.num(bb.max_hp, 0) * k, def: S.num(bb.def, 0) * k });
  if (S.num(bb.attack_speed, 0)) m.aspd = S.num(bb.attack_speed) * k;
  if (S.num(bb.hp_recovery_per_sec, 0)) m.hpRegen = S.num(bb.hp_recovery_per_sec) * k;
  if (S.num(bb.sp_recovery_per_sec, 0)) m.spRecoveryFlat = S.num(bb.sp_recovery_per_sec) * k;
  return m;
}

function applyReader(battle, it) {
  const k = stepsOf(battle, it);
  if (k === it.k) return;
  it.k = k;
  const u = it.unit;
  const key = it.buffKey;
  switch (it.key) {
    case 'act1autochess_gar_eff_attrByBond':
      if (k > 0) S.passiveBuff(battle, u, key, attrMods(it.bb, k));
      else battle.removeBuff(u, key);
      break;
    case 'act1autochess_gar_eff_respawnTimeByBond':
      // 耀骑士临光's 144: −1.5 % / −3 % per 3 卡西米尔 layers with no minimum in the blackboard (divide_num, respawn_time
      // only) — clamped at 0 like every other redeploy multiplier, so a knock-out timer can reach 0 s (GitHub #370;
      // until 0.2.1 a 0.05 floor kept it at 5 % of the base time from 192 layers, 96 for the elite). The EN client's buff
      // templates have no graph under this key, only act1autochess_gar_eff_respawnByBond (a card buff on the owner's exit,
      // layers / divide_num NOT floored, until its next spawn) — possibly a newer CN template; kept as it is.
      if (k > 0) S.passiveBuff(battle, u, key, { redeployMul: Math.max(0, 1 + S.num(it.bb.respawn_time, 0) * k) });
      else battle.removeBuff(u, key);
      break;
    case 'act2autochess_gar_eff_attrByBond_add_onstart': {
      const b = u.findBuff(key);
      if (b && b.timeLeft > 0) onstartBuff(battle, it, b.timeLeft);
      break;
    }
    default: break; // damageScale reads it.k in the hit hook
  }
}

function onstartBuff(battle, it, duration) {
  const k = Math.max(0, it.k);
  const key = it.buffKey;
  if (!(k > 0) || !(duration > 0)) { battle.removeBuff(it.unit, key); return; }
  battle.addBuff(it.unit, { key, duration, refresh: 'replace', mods: { atkFlat: S.num(it.bb.atk, 0) * k, hpFlat: S.num(it.bb.max_hp, 0) * k } });
}

export function installReaders(battle, by) {
  const list = [];
  for (const key of READERS) for (const it of by.get(key) ?? EMPTY) list.push(it);
  if (!list.length) return;
  for (const it of list) applyReader(battle, it);
  // attrByBond is computed at a deployment only (client buff template act1autochess_gar_eff_attrByBond: every node under
  // ON_BUFF_START — the floored steps (`_finalFloor`) × each stat, capped by max_stack 999999 — and no ON_BUFF_TRIGGER):
  // an in-battle layer gain leaves it as it is until the operator deploys again (a redeploy, a 突袭 landing; a 【移动】
  // keeps it). attrByBond_add_onstart likewise (ON_BUFF_START only: its timed buff keeps the steps it started with —
  // until 2026-10-11 a layer gain re-scaled the running buff). The other readers follow the live layers
  // (ab_damageScaleByBond: ON_BUFF_TRIGGER; respawnTimeByBond has no EN template).
  const ATTR = 'act1autochess_gar_eff_attrByBond';
  const ONSTART = 'act2autochess_gar_eff_attrByBond_add_onstart';
  const live = list.filter((it) => it.key !== ATTR && it.key !== ONSTART);
  const atDeploy = byUnit(list.filter((it) => it.key === ATTR));
  if (atDeploy.size) {
    battle.on('deploy', ({ unit, move }) => {
      const arr = move ? null : atDeploy.get(unit);
      if (arr) for (const it of arr) applyReader(battle, it);
    });
  }
  let pending = false;
  if (live.length) {
    battle.on('layerGain', () => {
      if (pending) return;
      pending = true;
      battle.after(0, () => { pending = false; for (const it of live) applyReader(battle, it); });
    });
  }
  const onstart = by.get('act2autochess_gar_eff_attrByBond_add_onstart');
  if (onstart) {
    const m = byUnit(onstart);
    battle.on('deploy', ({ unit }) => {
      const arr = m.get(unit);
      if (!arr) return;
      for (const it of arr) { it.k = stepsOf(battle, it); onstartBuff(battle, it, S.num(it.bb.duration, 0)); }
    });
  }
}
