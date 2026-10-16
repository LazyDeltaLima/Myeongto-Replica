// server/sim/content/kits/ops/chess_char_4_07-bpipe.js — 风笛 (char_222_bpipe) kit, tier 4.
// Conventions of the tier-4 kits: ../shared/tier4.js; kit contract and rules: ../README.md.

import { sortEnemyTargets } from '../../../targeting.js';
import { num, tbb, batFlat, alt, withDefaults } from '../shared/tier4.js';

export default withDefaults({
  // ===== 风笛 (charger) S2 高效冲击 — next attack 145 % ×2 (charges); talents 精密填弹 / 军事传统
  //       S1 迅捷打击·γ型; S3 闭膛连发 (BAT +0.7 s, block +1, ATK/DEF up, triple hits); module CHG-Y (“棍棒与口袋”):
  //       attacks on enemies below 40 % HP use 115 % ATK
  chess_char_4_07_a: (bb, chess, def) => {
    const t0 = tbb(def, 0), t1 = tbb(def, 1);
    const tb = def.traitBb || {};
    return {
      skills: alt(def, {
        'skcom_quickattack[3]': () => ({ kind: 'duration', mods: { atkPct: num(bb.atk), aspd: num(bb.attack_speed) } }),
        skchr_bpipe_3: () => ({
          kind: 'duration',
          mods: { atkPct: num(bb.atk), defPct: num(bb.def), blockCnt: num(bb.block_cnt, 1), batPct: batFlat(def, bb.base_attack_time) },
          attack: { hits: 3 },
          onStart({ battle, unit }) { battle.fx('buff', { x: unit.x, y: unit.y, id: unit.id }); },
        }),
      }),
      install(battle, unit) {
        const hr = num(tb.hp_ratio, 0), sc = num(tb.atk_scale, 0);
        if (!(hr > 0) || !(sc > 0)) return;
        battle.on('hit', (c) => { // 攻击力提升至115% (before mitigation)
          if (c.source === unit && c.dmg.isAttack && c.target.side === 'enemy' && c.target.hpRatio < hr) c.dmg.amount *= sc;
        }, { owner: unit });
      },
      skill: {
        kind: (def.skill?.maxCharges ?? 1) > 1 ? 'charges' : 'instant',
        attack: { atkScale: num(bb.atk_scale, 1.45), hits: 2 },
        onStart({ battle, unit }) { battle.fx('charge', { x: unit.x, y: unit.y, id: unit.id }); },
      },
      talents: [
        { install(battle, unit) { // 精密填弹
          // client bpipe_t_1 (2026-10-16 check): on each damage she calculates (ON_CALCULATE_DAMAGE — every hit of an attack,
          // S2's two and S3's three each roll) `prob` → that hit ×atk_scale (AtkScaleUp) and SplashDamage (RVA 0xDA29F0): her
          // attack's own selector finds one more enemy (the hit target excluded) and takes a physical NORMAL-attack hit of her
          // attack's scale ×atk_scale, its blackboard `effect` bpipe_attack_02_hit created on it (render/fx/kitofficial.js
          // 'talent' splash). Not an attack target: no 'atk' to it, no normal hit effect (`avoid_dup_trigger_lock`: the splash
          // does not roll again).
          let busy = false;
          battle.on('hit', (c) => {
            if (busy || c.source !== unit || !c.dmg.isAttack || c.target.side !== 'enemy' || !battle.rng.chance(num(t0.prob, 0.25))) return;
            const sc = num(t0.atk_scale, 1.3), amount = c.dmg.amount;
            c.dmg.mul *= sc;
            const prof = battle.effectiveProfile(unit);
            const extra = battle.enemiesInKeys(unit.rangeKeys, unit, prof).filter((e) => e !== c.target && e.alive);
            sortEnemyTargets(battle, unit, extra, prof?.priority ?? null);
            const e = extra[0];
            if (!e) return;
            busy = true;
            try { battle.dealDamage(unit, e, { amount: amount * sc, type: 'phys', isAttack: true, isSplash: true, noSp: true, tags: ['talent', 'bpipe:splash'] }); } finally { busy = false; }
            battle.fx('talent', { x: e.x, y: e.y, id: e.id, src: unit.id, name: 'splash' });
          }, { owner: unit, priority: 1 }); // before the module's 115 % (its own hit decides the splashed enemy's)
        } },
        { install(battle, unit) { // 军事传统: every 先锋 of the team starts with +6 SP
          battle.on('deploy', (c) => {
            const u = c.unit;
            if (u.side !== 'ally' || u.kind !== 'op' || u.ownerId !== unit.ownerId || u.def?.profession !== 'PIONEER' || !u.skill || (u.skill.active && u.skill.isTimed)) return;
            u.skill.gainSp(num(t1.sp, 6), 'init');
          }, { owner: unit });
        } },
      ],
    };
  },
});
