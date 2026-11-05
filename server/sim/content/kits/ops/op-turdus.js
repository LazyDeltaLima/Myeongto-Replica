// server/sim/content/kits/ops/op-turdus.js — 乌啾 (char_4224_turdus) kit: 5★ 链愈师 (医疗), a tier-3 piece of the season not out yet
// (shared/seasons.js `next`, docs/rules/diy.md 「새 시즌 ○○」); both skills, the talent, the trait and XAH-X in both forms. Her 特质 and the 临时
// stacks of the coming season wait for its tables.
//
// Forms (data/seasons/next/chess.json): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7, XAH-X stage 1.
// Sources: the record's tables; PRTS 乌啾 (备注 of T1, S2; 链愈师); charpack char_4224_turdus (each mode's Body/Talents/1, UnitDataFlowConfig), projectiles
// projectile_chr_turdus / _s2 (ChainLightningHitBehaviour, ChainedSelectorWithFilter), skill prefabs skchr_turdus_1 / _2, buff_template_data
// turdus_s2[self_damage], [continues_heal], [try_camouflage].
// - Trait (链愈师): chain.max_target units (+ S1's chain.extra_value), each jump × chain.atk_scale (XAH-X: 0.85).
// - T1 久病良医: she holds turdus[free_jump] and turdus[atk_scale_up], and the chain's validators read those buffs (PRTS: another 乌啾 counts too). In
//   ChainLightningHitBehaviour.DoSelectTargetToHit the rate is kept from one jump to the next: a unit holding atk_scale_up multiplies it by
//   chain.atk_scale_2 (for it and every later jump — PRTS 备注 "会影响到本轮跳跃治疗后续的每一次跳跃"; the first heal too); a jump decays unless the unit before
//   it holds free_jump. That unit also takes no target of the count (ChainedSelectorWithFilter): ai.js doHeal `free` / `up`.
// - S1 火钳秘咒: `_beginAnim` Skill_1_Begin first (no attack during it), ASPD, mode S1 (one target more in the chain).
// - S2 “捉迷藏！” (a `_switchToState` cast of RangedHeal, clip Skill_2): as the cast starts she loses hp_ratio of her current HP, never to death
//   (BuffToOwner `_runActionOnEvent` ON_CAST_START, turdus_s2[self_damage]: DamageViaCurHpRatio `_isUndeadable`, `_ignoreForSp`, no effect). At the
//   clip's OnAttack frame she picks, `_selectTargetTiming` at that moment and with `_allowNoTarget` ("无需目标便可触发"), the ally in range of
//   HP_RATIO_ASC_DIST_TO_SOURCE_ASC_FIRST — a full-HP one too — and shoots projectile_chr_turdus_s2 (speed 10): her chain from it, and every unit of the
//   chain takes the skill's two `_activeBuffs`:
//   · turdus_s2[continues_heal] (`independentCharacterSource`, LIMITED bonus_duration, every 1 s, the first after 1 s): heal_scale × her ATK as the buff
//     starts (AssignAttributeAsDynamicVarToBB; PRTS "非缓存攻击力"); put on again it restarts (PRTS "会立刻结束已施加的增益治疗Buff");
//     [ASSUMED·화면: on every unit of the chain, as the prefab's one `_activeBuffs` list says, where the skill's text writes 目标 for it and 治疗的所有目标 for the camouflage];
//   · turdus_s2[try_camouflage] (LIMITED bonus_duration, every 0.1 s, the first after 0.1 s): blocked → the camouflage goes; else, unless held,
//     turdus_s2[camouflage] (CAMOUFLAGE); it ends with the buff; put on again the camouflage goes at once and comes back at its next check.

import { num, talentBb, traitBb, skillRec, up, alliesInGridOf } from '../shared/tier1.js';
import { chainHealWalk } from '../../../ai.js';
import { hypot } from '../../../detmath.js';

const S1 = 'skchr_turdus_1';
const S2 = 'skchr_turdus_2';
const FREE = 'turdus[free_jump]';
const UP = 'turdus[atk_scale_up]';
const HOT = 'turdus_s2[continues_heal]';
const TRY = 'turdus_s2[try_camouflage]';
const CAMO = 'turdus_s2[camouflage]';
/** Skill_1_Begin's length (data/assets.json `animations`). */
export const S1_BEGIN = 0.533;
/** projectile_chr_turdus_s2 (AdvancedMovement `_speed`, tiles/s). */
const SHOT = 10;
const HOT_IV = 1;
const TRY_IV = 0.1;
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
const isFree = (a) => !!a.findBuff(FREE);
const isUp = (a) => !!a.findBuff(UP);

/** S2's two buffs on a unit of its chain. */
function putBuffs(battle, unit, a, b2) {
  const dur = num(b2.bonus_duration);
  if (!(dur > 0)) return;
  const key = `${HOT}:${unit.id}`;
  const heal = unit.s.atk * num(b2[`${HOT}.heal_scale`]);
  battle.removeBuff(a, key);
  battle.addBuff(a, {
    key, source: unit, duration: dur, interval: HOT_IV, tags: ['skill'],
    onTick: ({ battle: b, unit: x }) => { if (up(x)) b.heal(unit, x, heal, { moment: 'turdus_s2[continues_heal]' }); },
  });
  battle.removeBuff(a, TRY);
  battle.addBuff(a, {
    key: TRY, source: unit, duration: dur, interval: TRY_IV, tags: ['skill'],
    onTick: ({ battle: b, unit: x }) => {
      const held = x.findBuff(CAMO);
      if (x.blocking?.length) { if (held) b.removeBuff(x, CAMO); } else if (!held) b.addBuff(x, { key: CAMO, source: unit, flags: { camou: true }, visible: true, tags: ['skill'] });
    },
    onExpire: ({ battle: b, unit: x }) => { b.removeBuff(x, CAMO); },
    onRemove: ({ battle: b, unit: x }) => { b.removeBuff(x, CAMO); },
  });
}

export default {
  char_4224_turdus: (bb, chess) => {
    const t0 = talentBb(chess, 0), tb = traitBb(chess);
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const count = Math.max(1, Math.floor(num(tb['attack@chain.max_target'], 3)));
    const falloff = 1 - num(tb['attack@chain.atk_scale'], 0.75);
    const upScale = num(t0['attack@chain.atk_scale_2'], 1);
    const chain = (extra) => ({ mode: 'chain', count: count + extra, falloff, free: isFree, up: isUp, upScale });
    return {
      trait: { heal: chain(0) },
      skills: {
        [S1]: {
          kind: 'duration',
          mods: { aspd: num(b1.attack_speed) },
          attack: { heal: chain(Math.max(0, Math.floor(num(b1['attack@chain.extra_value'])))) },
          onStart({ battle, unit }) { unit.skillStateUntil = battle.time + S1_BEGIN; },
        },
        [S2]: {
          kind: 'instant', heal: true,
          onStart({ battle, unit }) {
            const hp = unit.hp, loss = Math.min(hp * num(b2[`turdus_s2[self_damage].hp_ratio`]), hp - 1);
            if (loss > 0) battle.loseHp(unit, loss, { source: unit, silent: true, tags: ['skill', 'selfLoss'] });
          },
          onStrike({ battle, unit }) {
            let main = null, best = Infinity, bestD = Infinity;
            for (const a of alliesInGridOf(battle, unit)) {
              if (a.s.flags.noHeal || a.profile?.noHeal) continue;
              const d = hypot(a.x - unit.x, a.y - unit.y);
              if (a.hpRatio < best - 1e-12 || (Math.abs(a.hpRatio - best) <= 1e-12 && d < bestD)) { main = a; best = a.hpRatio; bestD = d; }
            }
            if (!main) return;
            const base = unit.s.atk * unit.s.atkScaleMul;
            battle.fx('volley', { x: unit.x, y: unit.y, id: unit.id, targets: [main.id], skill: 'turdus_2' });
            const dist = hypot(main.x - unit.x, main.y - unit.y);
            battle.after(dist / SHOT, () => {
              if (!main.alive || !main.deployed) return;
              chainHealWalk(battle, unit, main, base, chain(0), { isSkill: true }, (a) => putBuffs(battle, unit, a, b2));
            });
          },
        },
      },
      talents: [{ install(battle, unit) {
        battle.addBuff(unit, { key: FREE, persist: true, allowDead: true, tags: ['talent'] });
        battle.addBuff(unit, { key: UP, persist: true, allowDead: true, tags: ['talent'] });
      } }],
    };
  },
};
