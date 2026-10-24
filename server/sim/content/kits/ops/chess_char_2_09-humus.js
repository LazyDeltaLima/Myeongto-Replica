// server/sim/content/kits/ops/chess_char_2_09-humus.js — 休谟斯 (char_491_humus) kit, tier 2.
// Conventions of the tier-2 kits: ../shared/tier2.js; kit contract and rules: ../README.md.

import { num, talentBb } from '../shared/tier1.js';

export default {
  // ---------------------------------------------------------------------------------------------------------------
  // 2_09 休谟斯 高效处理: block +block_cnt; above peak_1.hp_ratio HP ATK +peak_1.atk (精力充沛), above peak_2.hp_ratio
  // +peak_2.atk. 再回收: healing beyond max HP becomes a barrier, at most max_hp_ratio × max HP.
  // S1 固废切割 (alt, attack SP): the next attack hits at atk_scale × ATK (every enemy it reaches) and heals her `value`
  // HP once (a self heal: her trait bars only healing by others; overflow feeds 再回收).
  chess_char_2_09_a: (bb, chess) => {
    const t = talentBb(chess, 0);
    const peaks = [];
    for (const [k, v] of Object.entries(bb)) {
      const m = k.match(/\[(peak_\d+)\]\.peak_performance\.(atk|hp_ratio)$/);
      if (!m) continue;
      let p = peaks.find((x) => x.id === m[1]);
      if (!p) peaks.push((p = { id: m[1], atk: 0, hp: 1 }));
      if (m[2] === 'atk') p.atk = num(v); else p.hp = num(v, 1);
    }
    peaks.sort((a, b) => b.hp - a.hp);
    const key = 'humus:peak';
    // the buff's `fxTag` is the peak it stands for (1 / 2: peak_1 / peak_2): each runs peak_performance with its own blackboard
    // `peak_performance.effect` (humus_buff_01 / _02 — render/fxstatus.js KEY_FX)
    const peak = ({ battle, unit }) => {
      const p = peaks.find((x) => unit.hpRatio > x.hp), lvl = p?.atk ?? 0;
      const cur = unit.findBuff(key);
      if ((cur?.data?.v ?? 0) === lvl) return;
      // another peak: off first, so the client hears the new `fxTag` (a replaced buff sends no 'status')
      const tag = p ? Number(p.id.slice(5)) || null : null;
      if (cur && lvl > 0 && cur.fxTag !== tag) battle.removeBuff(unit, key);
      if (lvl > 0) battle.addBuff(unit, { key, mods: { atkPct: lvl }, data: { v: lvl }, visible: true, tags: ['skill'], fxTag: tag });
      else battle.removeBuff(unit, key);
    };
    return {
      skill: {
        kind: 'duration', mods: { blockCnt: num(bb.block_cnt) },
        onStart: peak, onTick: peak,
        onEnd({ battle, unit }) { battle.removeBuff(unit, key); },
      },
      skills: {
        skchr_humus_1: {
          kind: 'instant', attack: { atkScale: num(bb.atk_scale, 1) },
          onAttack({ battle, unit }) {
            if (num(bb.value) > 0 && unit.alive) battle.heal(unit, unit, num(bb.value), { self: true, tags: ['skill'] });
          },
        },
      },
      talents: [{ install(battle, unit) {
        const ratio = num(t.max_hp_ratio);
        if (!(ratio > 0)) return;
        battle.on('heal', (ctx) => {
          if (ctx.target !== unit || !(ctx.amount > 0)) return;
          const over = ctx.amount - (unit.s.maxHp - unit.hp);
          if (!(over > 0)) return;
          const cur = unit.findBuff('humus:recycle');
          const have = cur ? cur.shield : 0;
          const val = Math.min(unit.s.maxHp * ratio, have + over);
          if (val > have + 1e-6) battle.addBuff(unit, { key: 'humus:recycle', shield: val, source: unit, visible: true, tags: ['talent'] });
        }, { owner: unit, priority: -50 });
      } }],
    };
  },
};
