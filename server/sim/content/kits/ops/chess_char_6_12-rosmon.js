// server/sim/content/kits/ops/chess_char_6_12-rosmon.js — 迷迭香 (char_391_rosmon) kit, tier 6.
// Conventions of the tier-6 kits: ../shared/tier6.js; kit contract and rules: ../README.md.

import { sortEnemyTargets } from '../../../targeting.js';
import { summonToken } from '../../tokens.js';
import { num, tbb, live, opsOf, selectedSkill, batOf } from '../shared/tier6.js';

// ------------------------------------------------------------------------------------------------------------------
// 迷迭香 chess_char_6_12 (投掷手) — S2 末梢阻断; 歼灭战装备; 感知稳定

/** S2 末梢阻断 "溅射范围扩大": radius 1.5 (PRTS 溅射半径一览, 技能: 迷迭香 末梢阻断 1.5; ×1.3 [ASSUMED] until 0.1.1). */
const ROSMON_S2_SPLASH = 1.5;
/** Tag of the after-shocks fired by S2 attacks (profile `shockTags`): they keep its stun chance after the skill ends. */
const S2_SHOCK = 'rosmon:s2';

function rosmon(bb, chess, def) {
  const t0 = tbb(def, 0), t1 = tbb(def, 1);
  const sid = selectedSkill(chess, def);
  const prob = num(bb['attack@prob']), stun = num(bb['attack@stun']);
  const gearId = (chess?.tokens || []).find((t) => /rosmon_shield/.test(String(t))) || 'token_10012_rosmon_shield';
  const skills = {
    // S1 思维膨大 (attack SP): the next attack also deals extra_atk_scale × ATK arts to every enemy it hits
    skchr_rosmon_1: {
      kind: 'instant',
      attack: {
        onEachHit({ battle, unit, target, kind }) {
          if (!target || !target.alive || (kind !== 'main' && kind !== 'splash')) return;
          battle.dealDamage(unit, target, { amount: unit.s.atk * num(bb.extra_atk_scale, 1), type: 'arts', isSkill: true, tags: ['skill'] });
        },
      },
    },
    // S3 “如你所愿”: base attack time ×0.5 (akdata: 乘算负数), ATK +atk, 2 targets but blocked enemies only (install);
    // two 战术装备 on melee tiles of her range (the token kit: appear stun, blocked enemies DEF −160, lifetime)
    skchr_rosmon_3: {
      kind: 'duration',
      mods: { batPct: batOf(bb.base_attack_time, def, true), atkPct: num(bb.atk) },
      targeting: { maxTargets: Math.max(1, Math.floor(num(bb['attack@max_target'], 2))) },
      onStart({ battle, unit }) {
        let n = 0;
        for (let i = 0; i < 2; i++) if (summonToken(battle, unit, gearId, 'melee')) n++;
        battle.fx('summon', { x: unit.x, y: unit.y, id: unit.id, n });
      },
    },
  };
  return {
    skills,
    install(battle, unit) {
      if (sid !== 'skchr_rosmon_3') return;
      battle.on('beforeAttack', (ctx) => { // "仅选择被阻挡的敌人作为目标"
        if (ctx.attacker !== unit || !unit.skill?.active) return;
        // her range, plus the enemies she blocks herself — always her targets (Battle.blockedTargets, DESIGN §20.3)
        const c = battle.enemiesInKeys(unit.rangeKeys, unit, ctx.profile);
        for (const e of battle.blockedTargets(unit, ctx.profile)) if (!c.includes(e)) c.push(e);
        for (let i = c.length - 1; i >= 0; i--) if (!c[i].blockedBy) c.splice(i, 1);
        sortEnemyTargets(battle, unit, c, ctx.profile?.priority ?? null);
        ctx.targets = c.slice(0, Math.max(1, Math.floor(num(ctx.profile?.maxTargets, 2))));
      }, { owner: unit });
    },
    skill: {
      kind: 'duration',
      mods: { batPct: batOf(bb.base_attack_time, def), atkPct: num(bb.atk) },
      // The S2 mode's shots land 1.2 s after they are fired (projectile_chr_rosmon_s2 and its after-shocks: the client's
      // AttachToTarget reaches only at the end of its life — data `shot.land`), so an attack fired near the end of the skill
      // lands after it: it keeps the S2 splash and after-shocks (ai.js copies the profile it was fired with) and its stun
      // chance (rosmon_s_2[stun] rides on the attack) — the attack ids fired during the skill and the after-shock tag below.
      onStart({ battle, unit }) {
        const p = unit.profile;
        unit.mem.rosSaved = { r: p.splashRadius, n: p.shockTimes, t: p.shockTags };
        p.splashRadius = Math.max(num(p.splashRadius, 0.9), ROSMON_S2_SPLASH);
        p.shockTimes = num(p.shockTimes, 2) + Math.floor(num(bb.add_times));
        p.shockTags = [S2_SHOCK];
        unit.mem.rosS2Ids = [battle._attackSeq + 1, Infinity];
      },
      onEnd({ battle, unit }) {
        const s = unit.mem.rosSaved;
        if (s) { unit.profile.splashRadius = s.r; unit.profile.shockTimes = s.n; unit.profile.shockTags = s.t; }
        unit.mem.rosSaved = null;
        if (unit.mem.rosS2Ids) unit.mem.rosS2Ids[1] = battle._attackSeq;
      },
    },
    talents: [
      { install(battle, unit) { // S2: attack & aftershock stun chance
        battle.on('damaged', (ctx) => {
          if (ctx.source !== unit || !(stun > 0) || !ctx.target.alive || ctx.target.side !== 'enemy') return;
          const w = unit.mem.rosS2Ids, id = ctx.dmg?.attackId;
          const s2Attack = ctx.dmg?.isAttack && w && id >= w[0] && id <= w[1];
          if (!s2Attack && !ctx.dmg?.tags?.includes(S2_SHOCK)) return;
          if (battle.rng() < prob) battle.applyStatus(ctx.target, 'stun', { duration: stun, source: unit });
        }, { owner: unit });
      } },
      { install(battle, unit) { // 歼灭战装备
        const v = num(t0.def_penetrate_fixed);
        if (v) battle.addBuff(unit, { key: 'rosmon:pierce', mods: { defIgnoreFlat: v }, persist: true, allowDead: true });
      } },
      { install(battle, unit) { // 感知稳定
        // client char_391_rosmon/Talents/2 (2026-10-16 check): an Aura while at least one 术师 stands on her side (`_checker`
        // professionMask 32, minCount 1) — one of them (`_maxNum` 1) and herself (`_selfOption`) hold rosmon_t_2, removed when
        // that caster leaves (`_removeBuffWhenTargetLeave`: the aura takes another) or she does (`_removeBuffWhenAbilityDetached`);
        // a caster deployed after her is taken too. [ASSUMED: a new pick is random, checked every 0.25 s]
        const atk = num(t1.atk);
        const KEY = 'rosmon:stable';
        battle.on('deploy', ({ unit: u }) => {
          if (u !== unit || !atk) return;
          const seq = unit.deploySeq;
          let pick = null, pickSeq = 0;
          const drop = () => { if (pick) battle.removeBuff(pick, KEY); pick = null; };
          battle.every(0.25, (b, sched) => {
            if (!live(unit) || unit.deploySeq !== seq) { drop(); if (unit.deploySeq === seq) battle.removeBuff(unit, KEY); sched.cancel(); return; }
            if (pick && !(live(pick) && pick.deploySeq === pickSeq)) drop();
            const casters = opsOf(battle, unit.ownerId).filter((a) => live(a) && a.def?.profession === 'CASTER');
            if (!casters.length) { drop(); battle.removeBuff(unit, KEY); return; }
            if (pick) return;
            pick = battle.rng.pick(casters);
            pickSeq = pick.deploySeq;
            // rosmon_t_2 carries overrideEffectKey rosmon_buff_01_start (render/fxstatus.js KEY_FX)
            if (!unit.findBuff(KEY)) battle.addBuff(unit, { key: KEY, mods: { atkPct: atk }, visible: true });
            battle.addBuff(pick, { key: KEY, mods: { atkPct: atk }, visible: true, source: unit });
            battle.fx('link', { x: pick.x, y: pick.y, id: pick.id, src: unit.id });
          }, { owner: unit, immediate: true });
        }, { owner: unit });
      } },
    ],
  };
}

export default {
  chess_char_6_12_a: rosmon,
};
