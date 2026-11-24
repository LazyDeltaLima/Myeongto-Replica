// server/sim/content/kits/ops/op-meteo.js — 陨星 (char_219_meteo) kit: 5★ 炮手 (狙击), a tier-1 piece of 规程 (act3autochess)
// (shared/seasons.js `act3autochess`, docs/rules/diy.md 「새 시즌 메테오라이트·올가·아미야」); both skills, the talent and ART-Y in both forms.
//
// Forms (data/seasons/act3autochess/chess.json): normal = E1 Lv55, skills at rank 4, no module; elite = E2 Lv50, rank 7, ART-Y stage 1.
// Sources: the record's tables; charpack char_219_meteo (Modes/Default/Body/Attack projectile_meteo, Talents/1), skill prefabs
// skchr_meteo_1 / _2, projectiles projectile_meteo / _s1 / _s2 (each one's Range CircleCollider2D).
// - Trait (炮手) "攻击造成群体物理伤害": the aoesniper profile (professions.js: every enemy within 1.0 of the struck one, the
//   radius of projectile_meteo's collider). ART-Y "攻击时无视敌人100点的防御力" (trait bb def_penetrate_fixed): flat DEF ignore.
// - T1 爆破附着改装 (ProbAdditionNextAtkTalent, `_probKey` prob, family mask 15: attacks and skills): with chance prob the attack
//   (or the S2 shell) is made with meteo_t_1 on, ATK +atk (MULTIPLIER) — one roll for every damage instance of it, the splash too.
// - S1 霰射弹头 (ReplacementSkill, attack SP, `_recoverSpIfTargetDead`): the next attack at atk_scale, its projectile_meteo_s1
//   exploding on radius 2.0 ("爆炸范围扩大").
// - S2 高爆弹头 (MANUAL instant, `_switchToState` 1, `_shouldCastLikeAttack`): at its clip's strike one shell projectile_meteo_s2 at
//   the enemy her attack would pick: atk_scale × ATK physical on every enemy within 1.2 of where it lands, each hit one taking
//   meteo_s_2 (DEF +def, a negative flat value, `duration` s; `independentCharacterSource`: one per 陨星).

import { num, talentBb, traitBb, skillRec, up, statBuff } from '../shared/tier1.js';
import { sortEnemyTargets } from '../../../targeting.js';
/** @import { KitFns, KitChess } from '../shared/tier1.js' */
/** @import { Battle } from '../../../Battle.js' */
/** @import { Unit } from '../../../units.js' */
/** @import { ShotHit } from '../../../ai.js' */

const S1 = 'skchr_meteo_1';
const S2 = 'skchr_meteo_2';
/** projectile_meteo_s1's Range CircleCollider2D. */
export const S1_RADIUS = 2.0;
/** projectile_meteo_s2's Range CircleCollider2D. */
export const S2_RADIUS = 1.2;
/** projectile_meteo_s2 `_speed` (PARACURVE). */
const S2_SPEED = 8;
const TALENT = 'meteo_t_1';
const DEBUFF = 'meteo_s_2';
const SHELL_TAG = 'meteo:shell';
/** @param {KitChess} chess @param {string} id */
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
const AIR = Object.freeze({ canHitFly: true });

/** The enemies of her range and the ones she blocks, by her target order (`_targetMotion` 3: air units too). @param {Battle} battle @param {Unit} unit */
function rangeFoes(battle, unit) {
  const pool = battle.enemiesInKeys(unit.rangeKeys, unit, AIR);
  for (const e of battle.blockedTargets(unit, AIR)) if (!pool.includes(e)) pool.push(e);
  sortEnemyTargets(battle, unit, pool, null);
  return pool;
}

/** @type {KitFns} */
export default {
  char_219_meteo: (_bb, chess) => {
    const t0 = talentBb(chess, 0), tb = traitBb(chess), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const prob = num(t0.prob), boost = num(t0.atk);
    /** One roll of the talent; on success meteo_t_1 holds until `release` takes it off. @param {Battle} battle @param {Unit} unit */
    const roll = (battle, unit) => {
      if (!(prob > 0) || !boost || !battle.rng.chance(prob)) return false;
      battle.addBuff(unit, { key: TALENT, mods: { atkPct: boost }, tags: ['talent'] });
      return true;
    };
    /** @param {Battle} battle @param {Unit} unit */
    const release = (battle, unit) => { if (unit.findBuff(TALENT)) battle.removeBuff(unit, TALENT); };
    return {
      skills: {
        [S1]: { kind: 'instant', attack: { atkScale: num(b1.atk_scale, 1), splashRadius: S1_RADIUS } },
        [S2]: {
          kind: 'instant',
          onStart({ battle, unit, skill }) { skill.castPick = rangeFoes(battle, unit)[0] ?? null; },
          onStrike({ battle, unit, skill }) {
            const e = skill.castPick;
            if (!e?.alive) return;
            const lucky = roll(battle, unit);
            const scale = num(b2.atk_scale, 1), def = num(b2.def), dur = num(b2.duration);
            // its look: projectile_meteo_s2's trail to the enemy and its hit there (render/fx/kitofficial.js 'kitHit' meteo:shell)
            battle.fx('kitHit', { x: unit.x, y: unit.y, id: unit.id, src: unit.id, target: e.id, k: 'meteo:shell' });
            battle.addProjectile({
              from: unit, target: e, speed: S2_SPEED, visual: 'bomb', source: unit, hitDead: true,
              onHit: (/** @type {ShotHit} */ c) => {
                for (const v of battle.foesInRadius(c.x, c.y, S2_RADIUS, true)) {
                  battle.dealDamage(unit, v, { amount: unit.s.atk * scale, type: 'phys', isSkill: true, tags: ['skill', SHELL_TAG] });
                  if (v.alive && def && dur > 0) {
                    battle.addBuff(v, { key: `${DEBUFF}:${unit.id}`, source: unit, duration: dur, refresh: 'replace', mods: { defFlat: def }, visible: true, tags: ['skill'] });
                  }
                }
                if (lucky) release(battle, unit);
              },
            });
          },
        },
      },
      talents: [{ install(battle, unit) {
        // an attack rolls as it is made; its buff holds until its damage is done (a shell lands later: its first hit), or the next attack
        let rolled = 0;
        battle.on('beforeAttack', (c) => {
          if (c.attacker !== unit || !up(unit)) return;
          release(battle, unit);
          rolled = roll(battle, unit) ? battle._attackSeq + 1 : 0;
        }, { owner: unit });
        battle.on('hit', (c) => {
          if (!rolled || c.source !== unit || c.dmg?.attackId !== rolled) return;
          rolled = 0;
          // the splash instances of the same hit come in this tick
          battle.after(0, () => { if (!rolled) release(battle, unit); }, { owner: unit });
        }, { owner: unit, priority: -100 });
      } }],
      install(battle, unit) {
        const pierce = num(tb.def_penetrate_fixed);
        if (pierce) statBuff(battle, unit, 'trait:meteo:pierce', { defIgnoreFlat: pierce });
      },
    };
  },
};
