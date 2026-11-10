// server/sim/content/bonds/nation/sargon.js — 萨尔贡 (sargonShip).
//
//   act1autochess_bond_eff_sargon   member skill start → every member on the field gets an independent stack (ASPD
//                                   +base_attack_speed for base_time + time_per_stack·L s, ≤ max_buff_stack_cnt); 6: each
//                                   stack also ATK +base_atk (additive, one 直接乘算 buff)
//   act2autochess_bond_eff_sargon   ([share], band_narant) read by the act-1 installer: at 6 with 纳兰特 the caster instead
//                                   lends its equipment (tier ≤ filter_item_level) to the 8 surrounding operators
//                                   (items.js lendItemEffects)
//   act3autochess_bond_eff_sargon   (卫戍协议：规程) the same stacks, no ATK: its 6-tier effect is the 流沙 ground of
//                                   act3autochess_bond_eff_sargon_power (not written yet, bundle sim-K)

import * as S from '../../support/index.js';
import * as items from '../../items.js';
import { num, reached } from '../shared.js';

const SARGON_SHARE_KEY = 'act2autochess_bond_eff_sargon[share]';

/** Injection point for tests (lendItemEffects stub); null ⇒ items.js export. */
export const deps = { lendItemEffects: null };

function installSargon(battle, pid, bb, members, { atk }) {
  const memberSet = new Set(members);
  const ps = S.player(battle, pid);
  const share = S.buffParams(S.bondRecord('sargonShip', battle), SARGON_SHARE_KEY);
  const band = ps?.bandId ?? null;
  const narant = !!(share && band && share.valid_in_band === band);
  const main = narant ? share : bb;
  const six = reached(battle, pid, 'sargonShip', num(main.power_bond_char_cnt, 6));
  const perAtk = num(bb.base_atk, 0);
  const atkStacks = atk && six && !narant && !(bb.invalid_in_band && bb.invalid_in_band === band);
  const maxStacks = Math.max(1, Math.floor(num(main.max_buff_stack_cnt, 25)));
  const syncAtk = (u) => {
    if (!atkStacks) return;
    let n = 0;
    for (const b of u.buffs) if (b.key === 'bond:sargon') n++;
    if (n > 0 && u.alive) battle.addBuff(u, { key: 'bond:sargon:atk', mods: S.directMods({ atk: perAtk * n }) });
    else battle.removeBuff(u, 'bond:sargon:atk');
  };
  battle.on('skillStart', ({ unit }) => {
    if (!memberSet.has(unit)) return;
    const L = S.bondLayers(battle, pid, 'sargonShip');
    const dur = num(main.base_time, 0) + num(main.time_per_stack, 0) * L;
    if (dur > 0) {
      for (const m of members) {
        if (!S.onField(m)) continue;
        battle.addBuff(m, {
          key: 'bond:sargon', duration: dur, refresh: 'independent', maxStacks,
          mods: { aspd: num(main.base_attack_speed, 0) },
          onExpire: ({ unit: u }) => syncAtk(u), onRemove: ({ unit: u }) => syncAtk(u),
        });
        syncAtk(m);
      }
    }
    if (narant && six) lendAround(battle, unit, share, S.bondLayers(battle, pid, 'sargonShip'));
  });
}

function lendAround(battle, from, share, L) {
  if (!S.itemsOf(from).length) return;
  const lend = typeof deps.lendItemEffects === 'function' ? deps.lendItemEffects
    : typeof items.lendItemEffects === 'function' ? items.lendItemEffects : null;
  if (!lend) return;
  const duration = num(share.base_power_time, 0) + num(share.power_time_per_stack, 0) * L;
  if (!(duration > 0)) return;
  const maxTier = num(share.filter_item_level, 5);
  let n = 0;
  for (const a of S.alliesAround(battle, from, S.N8)) {
    if (!S.isOp(a)) continue;
    lend(battle, from, a, { maxTier, duration });
    n++;
  }
  if (n) S.fxOn(battle, 'bondShare', from, 'bond:sargonShip', 'narant', { n, duration });
}

export const TEMPLATES = Object.freeze({
  act1autochess_bond_eff_sargon: { bond: 'sargonShip', battle: (b, pid, bb, ms) => installSargon(b, pid, bb, ms, { atk: true }) },
  act2autochess_bond_eff_sargon: { bond: 'sargonShip', readBy: 'act1autochess_bond_eff_sargon' },
  act3autochess_bond_eff_sargon: { bond: 'sargonShip', battle: (b, pid, bb, ms) => installSargon(b, pid, bb, ms, { atk: false }) },
});
