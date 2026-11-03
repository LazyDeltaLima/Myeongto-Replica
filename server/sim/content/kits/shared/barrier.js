// server/sim/content/kits/shared/barrier.js — 闪灵 / 夜莺 kit helpers: an aura on the allies of the source's attack range
// and the PRTS 屏障 (each barrier its own timer, older ones absorb first, the stat bonus not stacking). Taken from the
// upstream 闪灵 kit (op-shining.js, not one of our picks) so 夜莺's kit (op-cgbird.js) does not need it.

import { up } from './tier1.js';

/** Aura refresh period and buff life (s): an ally leaving the range loses the buff within one refresh (tier-4 AURA). */
const AURA = 0.2;
const AURA_DUR = 0.25;

/**
 * Keep buff `key` on every ally standing in `unit`'s current attack range (operators and summons, its own tile included;
 * never a 孤立 unit — Battle.alliesInGrid) while `on()` holds, refreshed every AURA s; it lapses AURA_DUR s after the
 * source stops refreshing it. Several sources of the same effect keep the strongest `value` (same-named buffs).
 * @param {object} battle
 * @param {object} unit the source
 * @param {{ key: string, value: number, mods: object|((ally: object) => object), on?: () => boolean }} o
 */
export function rangeAura(battle, unit, { key, value, mods, on = () => true }) {
  battle.every(AURA, () => {
    if (!up(unit) || !on()) return;
    for (const a of battle.alliesInGrid(unit)) {
      const cur = a.findBuff(key);
      if (cur && cur.source !== unit && cur.source?.alive && (cur.data?.v ?? 0) > value && cur.timeLeft > 0.05) continue;
      battle.addBuff(a, { key, duration: AURA_DUR, mods: typeof mods === 'function' ? mods(a) : mods, source: unit, data: { v: value }, tags: ['aura'] });
    }
  }, { owner: unit, immediate: true });
}

/**
 * A 屏障 on `target` (闪灵 S2 自动掩护, 夜莺 S2 法术护盾): `shield` HP for `duration` s — of `shieldType` damage only when
 * given (damage.js absorbShields), else every type — plus the buff `statKey` (`mods`) while any barrier `key` lasts. PRTS
 * 备注 of both skills: "多个屏障吸收量可叠加，持续时间独立计算，优先消耗先生成的屏障，…效果不可叠加" — each barrier is its own
 * buff (refresh 'independent': its own timer; absorbShields walks the buffs oldest first), the stat bonus one buff whose
 * life follows the barriers (it ends when the last one breaks or expires).
 * @param {object} battle
 * @param {object} source the operator
 * @param {object} target
 * @param {{ key: string, statKey: string, shield: number, duration: number, mods: object, shieldType?: string|null }} o
 */
export function grantBarrier(battle, source, target, { key, statKey, shield, duration, mods, shieldType = null }) {
  if (!target || !target.alive || !(shield > 0) || !(duration > 0)) return;
  const sync = () => { if (!target.buffs.some((b) => b.key === key)) battle.removeBuff(target, statKey); };
  battle.addBuff(target, {
    key, refresh: 'independent', maxStacks: 99, duration, shield, shieldType, source, visible: true, onRemove: sync, onExpire: sync,
  });
  battle.addBuff(target, { key: statKey, refresh: 'extend', duration, mods, source });
  battle.fx('shield', { x: target.x, y: target.y, id: target.id, from: source.id });
}
