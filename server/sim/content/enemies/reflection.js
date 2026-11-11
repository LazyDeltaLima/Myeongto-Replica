// server/sim/content/enemies/reflection.js — REFLECTION 折射 kits (深池 enemies, 守墓石像) and their part of KITS (split from
// content/enemies.js).

import { T, auraAllies, auraBuff, shoot } from './helpers.js';
import { refraction, statue, kitRefraction } from './archetypes.js';
import { hypot } from '../../detmath.js';

// ---------------------------------------------------------------------------------------------------------------
// kits

function kitPhalanx(ab, e) {
  const def = T(ab, 'auraDefup.def') ?? 0;
  const r = (e.def.raw && e.def.raw.stats && e.def.raw.stats.rawRangeRadius) || 1.5;
  return [...kitRefraction(ab), {
    iv: 0.5,
    tick(b, e2) {
      let n = 0;
      for (const o of b.enemiesInRadius(e2.x, e2.y, r)) if (o !== e2 && o.defId === e2.defId) n++;
      if (n > 0) auraBuff(b, e2, 'ab:phalanx', 0.5, { defFlat: def * n });
    },
  }];
}

function kitHolyGuard(ab) {
  const r = T(ab, 'traitAbility.range_radius') ?? 1.1, aspd = T(ab, 'traitAbility.attack_speed') ?? 0;
  return [...kitRefraction(ab), {
    iv: 0.5,
    tick(b, e) {
      const on = b.enemiesInRadius(e.x, e.y, r).some((o) => /enemy_1175_dushdo/.test(o.defId));
      if (!on) return;
      // a buff aura (auraAllies): no 隐匿 operator, the blocker included (PRTS 作战机制 §隐匿与Buff的关系 — no 无视 note on
      // its page), but an airborne 起飞 one still [ASSUMED, as §21.22's ground-enemy auras]
      for (const u of auraAllies(b, e, e.x, e.y, r)) auraBuff(b, u, 'ab:forceField', 0.5, { aspd }, null, true);
    },
  }];
}

/**
 * 假想敌：镜眼 (规程 only; CN client prefab enemy_9039_acrefm, template acrefm[refracting] of 规程's buff table): 折射 (RES
 * +`refracting.magic_resistance` until silenced), and while it holds, every arts damage it takes (ON_APPLIED_MODIFIER:
 * IsDamage, not SILENCED, FilterDamageModifer MAGICAL with a source — `_sharedFlag` / `_source` are not filtered, their
 * switches are off) puts acrefm[atk-spd-down] on the damage's source: ATTACK_SPEED +`refracting.attack_speed` (−50) for
 * `refracting.duration` (3) s, EXTEND (a new one refills the time). No side check: an enemy's arts damage counts too.
 */
function kitMirrorEye(ab) {
  const aspd = T(ab, 'refracting.attack_speed') ?? 0, dur = T(ab, 'refracting.duration') ?? 0;
  return [...kitRefraction(ab), {
    sil: true,
    taken(c, b) {
      const s = c.source;
      if (c.dmg.type !== 'arts' || !s || !s.alive || !(dur > 0)) return;
      b.addBuff(s, { key: 'ab:acrefmSlow', duration: dur, refresh: 'replace', visible: true, mods: { aspd }, fxTag: 'buff:acrefm[atk-spd-down]' });
    },
  }];
}

/**
 * 假想敌：镜波 (规程 only; CN client prefab enemy_9031_acrefd, template acrefd[refracting]): 折射, and knocked out while it
 * holds (ON_OWNER_KILLED, not SILENCED) its RandomBuff casts at once: the selector (AdvancedSelector, its own side, ground
 * and air, enemies only, itself left out, circle `refracting.range_radius` 1.2) takes one enemy — the lowest RES, the
 * table's 「周围法抗最低的敌人」 (its `_postFilter` 79 is a CN-only sort: [추정·CN: ties go to the nearest]) — and throws
 * projectile_enemy_acrefd (PARACURVE, 4 tiles/s) at it from where it fell; on the hit the target gains acrefd[magic-resistance]
 * RES +`refracting.acrefd[magic-resistance].magic_resistance` (10), INFINITY, one at a time (maxStackCnt 1: a second
 * 镜波's adds nothing). Nobody in reach, or the target gone before the hit: nothing.
 */
function kitMirrorWave(ab) {
  const r = T(ab, 'refracting.range_radius') ?? 0, res = T(ab, 'refracting.acrefd[magic-resistance].magic_resistance') ?? 0;
  return [...kitRefraction(ab), {
    sil: true,
    death(c, b, e) {
      if (c.reason !== 'killed' || !(res > 0)) return;
      const t = b.enemiesInRadius(e.x, e.y, r).filter((o) => o !== e && o.alive && !o.hidden && !o.s.flags.untargetable)
        .sort((p, q) => p.s.res - q.s.res || hypot(p.x - e.x, p.y - e.y) - hypot(q.x - e.x, q.y - e.y) || p.id - q.id)[0];
      if (!t) return;
      const proj = (e.def.raw.talentProj && e.def.raw.talentProj.refracting) || { key: 'projectile_enemy_acrefd', move: 'PARACURVE', speed: 4 };
      shoot(b, { x: e.x, y: e.y }, t, proj, (u) => {
        if (u && u.alive) b.addBuff(u, { key: 'ab:acrefdRes', persist: true, refresh: 'keep', visible: true, mods: { resFlat: res }, fxTag: 'buff:acrefd[magic-resistance]' });
      }, { source: e });
    },
  }];
}

// ---------------------------------------------------------------------------------------------------------------
// this family's part of KITS (content/enemies.js spreads the parts in this order)

export const REFLECTION_KITS = Object.freeze({
  // --- REFLECTION 折射
  enemy_1165_duhond: kitRefraction,                                  // 深池侦察犬 · refraction
  enemy_1165_duhond_2: kitRefraction,                                // 深池侦察犬pro · refraction
  enemy_1166_dusbr: kitRefraction,                                   // 深池侦察兵 · refraction
  enemy_1166_dusbr_2: kitRefraction,                                 // 深池侦察队长 · refraction
  enemy_1168_dumage: kitRefraction,                                  // 深池暗影术师 · refraction
  enemy_1168_dumage_2: kitRefraction,                                // 深池暗影术师队长 · refraction
  enemy_1170_dushld: kitRefraction,                                  // 深池重甲卫士 · refraction
  enemy_1170_dushld_2: kitRefraction,                                // 深池重甲卫士队长 · refraction
  enemy_1169_duphlx: kitPhalanx,                                     // 深池方阵步兵 · refraction + DEF +200 per nearby same unit
  enemy_1169_duphlx_2: kitPhalanx,                                   // 深池方阵指挥官 · same
  enemy_1172_dugago: (ab) => [...kitRefraction(ab), statue(ab)],     // 守墓石像 · refraction; melee when blocked; 1st KO → unblockable statue 10 s → arts flyer
  enemy_1172_dugago_2: (ab) => [...kitRefraction(ab), statue(ab)],   // 愤怒的守墓石像 · same
  enemy_1174_duholy: kitHolyGuard,                                   // 深池伙友卫队 · refraction; ASPD-down field next to 影刃 (taunt from data)
  enemy_1174_duholy_2: kitHolyGuard,                                 // 深池伙友卫队精英 · same
  enemy_9011_acrefr: (ab) => [refraction(T(ab, 'Refracting.magic_resistance') ?? 0, T(ab, 'Refracting.max_hp') ?? 0)], // 假想敌：镜膜 · refraction + max HP until first silence
  enemy_9039_acrefm: kitMirrorEye,                                   // 假想敌：镜眼 · refraction; arts damage taken → its source ASPD −50 3 s
  enemy_9031_acrefd: kitMirrorWave,                                  // 假想敌：镜波 · refraction; knocked out → nearby lowest-RES enemy RES +10
});
