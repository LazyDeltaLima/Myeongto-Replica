// server/sim/content/kits/ops/chess_char_3_11-snhunt.js — 雪猎 (char_4211_snhunt) kit, tier 3.
// Conventions of the tier-3 kits: ../shared/tier3.js; kit contract and rules: ../README.md.

import {
  num, defOf, talentBb, traitBb, selectedId, altSkills, instantKindOf, alive, fx, textNum, enemiesOn,
} from '../shared/tier3.js';
/** @import { KitFns } from '../shared/tier1.js' */
/** @import { Unit } from '../../../units.js' */
/** @import { Profile } from '../../../professions.js' */

/** @type {KitFns} */
export default {
  // ---- 3_11 雪猎 · 猎手 — S2 风雪连弩: instant special-bullet double shot (higher vs non-moving targets), charges;
  //      裂云一击: the skill also sends 裂云兽 (ATK% phys + cold); 精锐 module HUN-X: reload from empty adds extra rounds
  //      S1 强力击·β型: next attack ×atk_scale (a normal shot: needs a round); 裂云兽 hits the enemy it is cast on
  chess_char_3_11_a: (bb, chess, def) => {
    const d = defOf(chess, def);
    const t0 = talentBb(d, 0);
    const tb = traitBb(d);
    const sel = selectedId(chess, d);
    const S2 = 'skchr_snhunt_2';
    const s1 = num(bb.atk_scale_1, 1), s2 = num(bb.atk_scale_2, s1);
    const charges = Math.max(1, Math.floor(num(d.skill?.maxCharges, num(bb.ct, 1))));
    const shots = textNum(d.skill?.description, /(\d+|[一二两三四五])连击/, 2);
    const still = (/** @type {Unit} */ e) => !!(e.blockedBy || e.s.flags.stun || e.s.flags.noMove || !e.moving);
    const extra = num(tb.extra_add, 0);
    return {
      skill: {
        kind: charges > 1 ? 'charges' : 'instant',
        // at the first OnAttack frame of the clip its ThreePartOneshotAnimation plays (Skill_2_Begin + Skill_2_Loop), the target taken then
        onStrike({ battle, unit }) {
          const t = enemiesOn(battle, unit, /** @type {number[]} */ (unit.rangeKeys), 1, unit.profile)[0] ?? null;
          if (!t) return;
          battle.addProjectile({
            from: unit, target: t, speed: 16, visual: 'arrow', source: unit,
            onHit: (/** @type {{ target: Unit | null }} */ { target }) => {
              if (!target || !target.alive) return;
              const sc = still(target) ? s2 : s1;
              for (let i = 0; i < shots && target.alive; i++) battle.dealDamage(unit, target, { amount: unit.s.atk * sc, type: 'phys', isSkill: true, tags: ['skill', 'snhunt'] });
            },
          });
          fx(battle, 'volley', unit, { target: t.id, skill: 'snhunt_2' });
        },
      },
      skills: altSkills(chess, d, bb, {
        skchr_snhunt_1: (s) => ({ kind: instantKindOf(s), attack: { atkScale: num(s.bb.atk_scale, 1) } }),
      }),
      talents: [{ install(battle, unit) {
        battle.on('skillStart', (ctx) => {
          if (ctx.unit !== unit) return;
          // cast on the enemy about to be shot (S2's own shots leave a little later, at their frame)
          const t = enemiesOn(battle, unit, /** @type {number[]} */ (unit.rangeKeys), 1, unit.profile)[0] ?? null;
          if (!t || !t.alive) return;
          battle.dealDamage(unit, t, { amount: unit.s.atk * num(t0.atk_scale, 1), type: 'phys', isSkill: true, tags: ['talent', 'cloudbeast'], moment: 'snhunt_t[effect]' });
          if (t.alive) battle.applyStatus(t, 'cold', { duration: num(t0.cold, 3), source: unit });
          fx(battle, 'strike', t, { src: unit.id, talent: 'snhunt_beast' });
        }, { owner: unit });
      } }],
      install(battle, unit) {
        // special bullets (S2 only): the skill also fires while the magazine is empty (the attack loop cannot run then)
        if (sel === S2 || sel == null) {
          battle.on('tick', () => {
            const sk = unit.skill;
            if (!alive(unit) || !unit.canAct || !sk || !sk.ready || sk.opCooling || unit.s.flags.silence || (unit.trait.ammo ?? 1) > 0) return;
            if (battle.enemiesInKeys(unit.baseRangeKeys || unit.rangeKeys, unit, unit.profile).length) sk.activate('DEFAULT');
          }, { owner: unit });
        }
        if (extra > 0) {
          battle.on('tick', () => {
            const a = unit.trait.ammo ?? 0;
            if (unit.mem.prevAmmo === 0 && a === 1) unit.trait.ammo = Math.min(Math.max(1, /** @type {Profile} */ (unit.profile).ammoMax ?? 8), a + extra);
            unit.mem.prevAmmo = unit.trait.ammo;
          }, { owner: unit });
        }
      },
    };
  },
};
