// server/sim/content/kits/ops/op-brigid.js — 水灯心 (char_4177_brigid) kit: 5★ 回环射手 (狙击), a tier-3 piece of the season not out yet
// (shared/seasons.js `next`, docs/rules/diy.md 「새 시즌 무스·미스 크리스틴·브리지드·오로라」); both skills, the talent, the trait (professions.js loopshooter) and LPS-X in both forms.
//
// Forms (data/seasons/next/chess.json): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7, LPS-X stage 1.
// Sources: the record's tables; PRTS 水灯心 (备注 of T1); charpack char_4177_brigid (Others/Direction/Talents/1, Modes/S2/Body/Attack), skill prefabs skchr_brigid_1 / _2,
// projectiles projectile_chr_brigid_s1 / _s2, buff_template_data brigid_t[evade_trigger], brigid_t[evade_core], brigid_s2[cut].
// - T1 结绳老手 (brigid_t[evade_trigger]): each damage she deals counts (PRTS: every source of hers); at trigger_damage_count she has physical dodge prob, kept for this deployment.
// - S1 所熟知的 (ReplacementSkill, attack SP): the next attack at atk_scale, its projectile (`_speedAfterFirstReach` 6) then bounces `times` times, each to the nearest enemy
//   within 1.7 tiles (its selector's collider) it has not hit, again on the nearest when none is left (`_allowRepetitionIfNoTarget`, `_fixAllowRepetitionIfNoTarget`), each hit at atk_scale
//   (`_atkScaleRatePerBounce` 1). It comes back from the last hit. [ASSUMED·화면: repeated hits on a lone enemy follow at once; whether `_keepAlreadyHitTime` 0.7 spaces them was not read]
// - S2 可驯服的 (mode S2): ATK +atk. The hit gives sluggish for attack@sluggish s and brigid_s2[cut]: every attack@interval s for attack@cut_duration s attack@cut_scale × her ATK of physical
//   damage while the enemy is one she can select (VertifyTarget, else it ends); the projectile stays attack@projectile_delay_time s on it before coming back.
// - LPS-X: on an enemy on the 8 tiles around her an attack has ATK × atk_scale (trait; as 跃跃's LPS-X).

import { canTargetEnemy } from '../../../targeting.js';
import { hypot } from '../../../detmath.js';
import { num, talentBb, traitBb, skillRec, up, cheb, instantKind } from '../shared/tier1.js';

const S1 = 'skchr_brigid_1';
const S2 = 'skchr_brigid_2';
const CUT = 'brigid_s2[cut]';
const DODGE = 'brigid_t[evade_core]';
const ANY = Object.freeze({ canHitFly: true });
/** projectile_chr_brigid_s1: its selector's collider, `_speedAfterFirstReach`. */
export const BOUNCE_RADIUS = 1.7;
export const BOUNCE_SPEED = 6;
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

/** The nearest enemy she can select within `r` of (x, y), `skip` left out; the oldest of equals. */
function nearest(battle, unit, x, y, r, skip) {
  let best = null, bd = Infinity;
  for (const e of battle.foesInRadius(x, y, r, true)) {
    if (skip?.has(e) || !canTargetEnemy(unit, e, ANY)) continue;
    const d = hypot(e.x - x, e.y - y);
    if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && best && e.spawnSeq < best.spawnSeq)) { bd = d; best = e; }
  }
  return best;
}

export default {
  char_4177_brigid: (bb, chess) => {
    const t0 = talentBb(chess, 0), near = num(traitBb(chess).atk_scale, 1), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const needed = Math.floor(num(t0.trigger_damage_count)), prob = num(t0.prob);
    return {
      skills: {
        [S1]: {
          kind: instantKind({ skill: { maxCharges: num(skillRec(chess, S1)?.maxChargeTime, 1) } }),
          attack: {
            atkScale: num(b1.atk_scale, 1),
            boomerangOnward(ctx) {
              const { battle, unit } = ctx;
              const seen = new Set(ctx.target ? [ctx.target] : []);
              let left = Math.floor(num(b1.times));
              const go = (x, y) => {
                if (left-- <= 0 || !ctx.home()) { ctx.comeBack(x, y); return; }
                const next = nearest(battle, unit, x, y, BOUNCE_RADIUS, seen) ?? nearest(battle, unit, x, y, BOUNCE_RADIUS, null);
                if (!next) { ctx.comeBack(x, y); return; }
                seen.add(next);
                battle.addProjectile({
                  from: { x, y }, target: next, speed: BOUNCE_SPEED, visual: 'boomerang', source: unit, hitDead: true,
                  onHit: (c) => { if (c.target?.alive) ctx.hit(c.target, c.x, c.y); go(c.x, c.y); },
                });
              };
              go(ctx.x, ctx.y);
            },
          },
        },
        [S2]: {
          kind: 'duration', mods: { atkPct: num(b2.atk) },
          attack: {
            onEachHit({ battle, unit, target }) {
              if (!target?.alive) return;
              battle.applyStatus(target, 'sluggish', { duration: num(b2['attack@sluggish']), source: unit });
              const iv = num(b2['attack@interval']), scale = num(b2['attack@cut_scale'], 1), dur = num(b2['attack@cut_duration']);
              if (!(iv > 0 && dur > 0)) return;
              battle.addBuff(target, {
                key: `${CUT}:${unit.id}`, source: unit, duration: dur + battle.dt, interval: iv, visible: true, data: {}, tags: ['skill'],
                onTick: ({ battle: b, unit: e, buff }) => {
                  if (!up(unit) || !canTargetEnemy(unit, e, ANY)) { b.removeBuff(e, buff); return; }
                  b.dealDamage(unit, e, { amount: unit.s.atk * scale, type: 'phys', isAttack: true, isSkill: true, tags: ['skill', 'brigid:cut'] });
                  // the buff's hit_cnt, 1 → 2 → 3 → 1: which of its three prefabs this cut plays (brigid_s2[cut] ON_BUFF_TRIGGER)
                  const n = ((buff.data.cuts ?? 0) % 3) + 1;
                  buff.data.cuts = n;
                  b.fx('kitHit', { x: e.x, y: e.y, id: unit.id, src: unit.id, tgt: e.id, k: 'brigid:cut', n });
                },
              });
            },
            boomerangOnward(ctx) {
              const { battle, target } = ctx;
              battle.after(num(b2['attack@projectile_delay_time']), () => {
                const live = target?.alive && !target.hidden;
                ctx.comeBack(live ? target.x : ctx.x, live ? target.y : ctx.y);
              });
            },
          },
        },
      },
      talents: [{ install(battle, unit) {
        if (!(prob > 0 && needed > 0)) return;
        battle.on('deploy', (c) => { if (c.unit === unit) { unit.mem.brigidHits = 0; battle.removeBuff(unit, DODGE); } }, { owner: unit });
        battle.on('hit', (c) => {
          if (c.source !== unit || !up(unit)) return;
          unit.mem.brigidHits = (unit.mem.brigidHits ?? 0) + 1;
          if (unit.mem.brigidHits === needed) battle.addBuff(unit, { key: DODGE, mods: { dodgePhys: prob }, visible: true, tags: ['talent'] });
        }, { owner: unit });
      } }],
      install(battle, unit) {
        if (near === 1) return;
        battle.on('hit', (c) => { if (c.source === unit && c.dmg?.isAttack && c.target && cheb(unit, c.target) <= 1) c.dmg.amount *= near; }, { owner: unit, priority: 10 });
      },
    };
  },
};
