// server/sim/content/kits/ops/op-greyy2.js — 承曦格雷伊 (char_1027_greyy2) kit: 5★ 投掷手, a tier-2 piece of the season not out yet (shared/seasons.js `next`,
// docs/rules/diy.md 「새 시즌 그레이스롯·아스트젠·그레이 더 라이트닝베어러·키치세이」); both skills, the talent and BOM-X in both forms.
//
// Forms (data/seasons/next/chess.json): normal = E1 Lv60, skills at rank 4, no module; elite = E2 Lv55, rank 7, BOM-X stage 1 (its 停顿 damage bonus starts at stage 2: not in these forms).
// Sources: the record's tables; PRTS 承曦格雷伊 (备注 of the talent and of S2); charpack char_1027_greyy2 (Modes/Default/Body/Attack), skill prefab skchr_greyy2_2, projectiles projectile_chr_greyy2 / _s2,
// buff_template_data greey2_t_1.
// - Trait: the branch's blast and aftershock (professions.js bombarder). projectile_chr_greyy2's second and third hit behaviours both fire as it stops, `_delayAfterReached` 0.15 s after it reaches, so BOM-X's two aftershocks
//   land together (`shockTogether`); the third is `_checkValidViaBBKey` enable_third_attack.
// - T1 窃光链缚 (`_activeBuffs` greey2_t_1, Dice `prob`): normal attacks only; the first damage and each aftershock roll on their own (PRTS), for every enemy they hit: attack@sluggish s of 停顿.
// - S1 迅捷打击·γ型: ATK +atk, attack_speed.
// - S2 晨曦信标 (`ct` charges; `_selectTargetTiming` 1, `_recoverSpIfNoTarget`): at the clip's strike an orb flies to a ground target in range (speed 8, it traces the target until it reaches). There it stays
//   projectile_delay_time s and hits at once and every `interval` s (SelectorHitBehaviour: no `_waitFirstPeriod`, the timer runs once reached): every ground enemy within 1 tile (PRTS) takes atk_scale × her current ATK arts
//   (PRTS "实时变化") and with `prob` sluggish s of 停顿 (the ability's greey2_t_1 on the skill's blackboard). She may leave: the orb stays until its time ends (PRTS).

import { num, talentBb, traitBb, skillRec, up, giveSp } from '../shared/tier1.js';
import { sortEnemyTargets } from '../../../targeting.js';
import { hypot } from '../../../detmath.js';

const S1 = 'skcom_quickattack[3]';
const S2 = 'skchr_greyy2_2';
const ORB_SPEED = 8;     // projectile_chr_greyy2_s2 `_speed`
const ORB_RADIUS = 1;    // PRTS 备注 of S2
const GROUND = Object.freeze({ canHitFly: false });
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

/** The orb, landed at (x, y): its ticks are its own, not owned by her (she may have left). */
function beacon(battle, unit, x, y, b2) {
  const dur = num(b2.projectile_delay_time), every = num(b2.interval, 1), scale = num(b2.atk_scale), prob = num(b2.prob), slow = num(b2.sluggish);
  const total = Math.ceil(dur / every - 1e-9);
  let n = 0;
  battle.fx('kitHit', { x, y, id: unit.id, k: 'greyy2:s2reach' }); // its REACH
  battle.every(every, (b, sc) => {
    // SelectorHitBehaviour `_playAudioWhenSelect`: each tick before it looks for targets, enemies or none
    b.fx('kitHit', { x, y, id: unit.id, k: 'greyy2:s2tick' });
    for (const e of b.foesInRadius(x, y, ORB_RADIUS, true)) {
      if (e.isFlying) continue;
      b.dealDamage(unit, e, { amount: unit.s.atk * scale, type: 'arts', isSkill: true, tags: ['skill', 'zone', 'greyy2:beacon'] });
      if (e.alive && prob > 0 && b.rng.chance(prob)) b.applyStatus(e, 'sluggish', { duration: slow, source: unit });
    }
    if (++n >= total) sc.cancel();
  }, { immediate: true });
}

export default {
  char_1027_greyy2: (bb, chess) => {
    const t0 = talentBb(chess, 0), tb = traitBb(chess), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const prob = num(t0['attack@prob']), slow = num(t0['attack@sluggish']);
    return {
      trait: { shockTimes: num(tb['attack@enable_third_attack']) ? 3 : 2, shockTogether: true },
      skills: {
        [S1]: { kind: 'duration', mods: { atkPct: num(b1.atk), aspd: num(b1.attack_speed) } },
        [S2]: {
          kind: num(skillRec(chess, S2)?.maxChargeTime, 1) > 1 ? 'charges' : 'instant',
          onStrike({ battle, unit, skill }) {
            const t = sortEnemyTargets(battle, unit, battle.enemiesInKeys(unit.rangeKeys, unit, GROUND), null)[0];
            if (!t) { giveSp(unit, skill.spCost, 'refund'); return; }
            // the view flies skills[1].shot to where the target stands now and plays its reach effect as it lands (fxgame.js zoneFx, as 홈바운드's);
            // the sim's own flight, drawn by nobody, traces the target as the client's does
            const fly = hypot(t.x - unit.x, t.y - unit.y) / ORB_SPEED;
            battle.fx('zone', { x: t.x, y: t.y, id: unit.id, r: ORB_RADIUS, duration: fly + num(b2.projectile_delay_time) });
            battle.fx('kitHit', { x: unit.x, y: unit.y, id: unit.id, k: 'greyy2:s2on' }); // the skill ability's ON
            battle.addProjectile({ from: unit, target: t, speed: ORB_SPEED, visual: 'none', source: unit, hitDead: true, onHit: (c) => beacon(battle, unit, c.x, c.y, b2) });
          },
        },
      },
      talents: [{ install(battle, unit) {
        if (!(prob > 0 && slow > 0)) return;
        battle.on('damaged', (c) => {
          const e = c.target;
          if (c.source !== unit || !up(unit) || e?.side !== 'enemy' || !e.alive) return;
          if (!c.dmg?.isAttack && !c.dmg?.tags?.includes('aftershock')) return;
          if (battle.rng.chance(prob)) battle.applyStatus(e, 'sluggish', { duration: slow, source: unit });
        }, { owner: unit });
      } }],
    };
  },
};
