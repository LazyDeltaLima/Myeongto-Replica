// server/sim/content/kits/ops/op-cammou.js — 卡达 (char_328_cammou) kit: 4★ 驭械术师 (术师), a tier-1 piece of 规程 (act3autochess) (shared/seasons.js `act3autochess`,
// docs/rules/diy.md 「새 시즌 미틈·로베르타·클릭·퀘르쿠스」); both skills, the talent, the trait (professions.js funnel) and FUN-Y (the trait's bb: the ramp's cap) in both forms.
//
// Forms (data/seasons/act3autochess/chess.json): normal = E1 Lv55, skills at rank 4, no module; elite = E2 Lv50, rank 7, FUN-Y stage 1.
// Sources: the record's tables; PRTS 卡达 (S2 备注); charpack char_328_cammou (Trait cammou_tr, Talents/1 cammou_t_1, Modes S1 / S2 Funnel, S2 Attack), skill prefabs skchr_cammou_1 / _2, projectile
// projectile_chr_cammou_funnel_s2 (`_hitNumType` 2, `_stopWhenSourceInvalid`, attached to its target), buff_template_data cammou_tr, cammou_s_2.
// - 协调一致: ASPD +attack_speed, the drone's too (it hits at her interval).
// - S1 攻击力强化·β型: ATK +atk (mode S1 only changes the drawings).
// - S2 同步索敌攻击: range 3-3, ATK +atk. Meanwhile the unreleased drone's addition is off. Her attacks and the drone's hits each stun for attack@stun s at attack@prob (cammou_s_2 on
//   both abilities). Official client (FunnelRemoteAttack `_funnelAction` → projectile_chr_cammou_funnel_s2, FunnelHitbehaviour): the drone is released as one of her attacks goes out
//   (DoCastOnTargets), on that attack's target, when none is out; it stays on that enemy, inside her range or not, until the enemy dies or turns invalid (its `_targetOptions`), she
//   dies or the skill ends, and the next one waits for her next attack. It hits on its own timer: at once as it is placed (`_waitFirstPeriod` 0), then every attack interval of hers
//   (`Entity.attackTime`), re-timed keeping its progress when that interval changes (RangedAttack.OnAttackTimeChanged → PeriodicTimer.ResetButKeepProgress: remaining × new ÷ old), each
//   hit with the trait's ramp (CammouTrait.SetFunnelAtkScale: a new target starts over). Her statuses do not stop it (PRTS 备注): the skill's tick runs it.

import { canTargetEnemy } from '../../../targeting.js';
import { num, talentBb, skillRec, up } from '../shared/tier1.js';
/** @import { KitFns, KitChess } from '../shared/tier1.js' */
/** @import { Battle } from '../../../Battle.js' */
/** @import { Unit } from '../../../units.js' */
/** @import { SkillRuntime } from '../../../skills.js' */
/** @import { Profile } from '../../../professions.js' */

const S1 = 'skcom_atk_up[2]';
const S2 = 'skchr_cammou_2';
export const DRONE_TAG = 'cammou:drone';
/** @param {KitChess} chess @param {string} id */
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

/** @type {KitFns} */
export default {
  char_328_cammou: (bb, chess) => {
    const t0 = talentBb(chess, 0), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const aspd = num(t0.attack_speed), prob = num(b2['attack@prob']), stun = num(b2['attack@stun']);
    /** @param {Battle} battle @param {Unit} unit @param {Unit | null | undefined} e */
    const roll = (battle, unit, e) => { if (e?.alive && stun > 0 && battle.rng.chance(prob)) battle.applyStatus(e, 'stun', { duration: stun, source: unit }); };
    return {
      skills: {
        [S1]: { kind: 'duration', mods: { atkPct: num(b1.atk) } },
        [S2]: {
          kind: 'duration',
          mods: { atkPct: num(b2.atk) },
          targeting: { rangeGrid: skillRec(chess, S2)?.rangeGrid ?? null },
          onStart({ unit }) {
            const key = typeof /** @type {Profile} */ (unit.profile).funnelMul === 'function' ? 'funnelMul' : 'dmgMul';
            const mul = /** @type {Profile} */ (unit.profile)[key];
            unit.profile = { ...unit.profile, [key]: null };
            unit.mem.cammouDrone = { lock: null, cd: 0, period: 0, key, mul, target: unit.trait.funnelTarget, scale: unit.trait.funnelScale };
          },
          onAttack({ unit, targets }) {
            const d = unit.mem.cammouDrone, t = targets?.[0];
            if (!d || d.lock || !t?.alive || !canTargetEnemy(unit, t, unit.profile)) return;
            d.lock = t;
            d.cd = 0;
            d.period = unit.s.interval;
          },
          onTick({ battle, unit, dt }) {
            const d = unit.mem.cammouDrone;
            if (!d || !unit.alive || !/** @type {SkillRuntime} */ (unit.skill).active) return;
            if (d.lock && !canTargetEnemy(unit, d.lock, unit.profile)) d.lock = null;
            if (!d.lock) return;
            const p = unit.s.interval;
            if (p !== d.period) { d.cd = d.period > 0 ? d.cd * (p / d.period) : 0; d.period = p; }
            d.cd = Math.max(0, d.cd - dt);
            if (d.cd > 1e-9) return;
            d.cd = p;
            const f = /** @type {Profile} */ (unit.profile).funnel;
            d.scale = d.target === d.lock.id ? Math.min(f.max, (d.scale ?? f.init) + f.delta) : f.init;
            d.target = d.lock.id;
            battle.fx('drone', { x: d.lock.x, y: d.lock.y, id: unit.id });
            battle.dealDamage(unit, d.lock, { amount: unit.s.atk * unit.s.atkScaleMul * d.scale, type: 'arts', isSkill: true, isAttack: false, tags: ['skill', 'drone', DRONE_TAG] });
            roll(battle, unit, d.lock);
          },
          onEnd({ unit }) {
            const d = unit.mem.cammouDrone;
            unit.mem.cammouDrone = null;
            if (!d) return;
            unit.trait.funnelTarget = d.target;
            unit.trait.funnelScale = d.scale;
            unit.profile = { ...unit.profile, [d.key]: d.mul };
          },
        },
      },
      talents: [{ install(battle, unit) {
        if (aspd) battle.addBuff(unit, { key: 'cammou_t_1', mods: { aspd }, persist: true, allowDead: true, tags: ['talent'] });
        // S2: her own attack's stun roll (the drone's rolls in the skill's tick)
        battle.on('damaged', (ctx) => {
          if (!unit.mem.cammouDrone || ctx.source !== unit || !up(unit) || !ctx.dmg?.isAttack) return;
          if (ctx.dmg.tags?.includes(DRONE_TAG)) return;
          roll(battle, unit, ctx.target);
        }, { owner: unit });
      } }],
    };
  },
};
