// server/sim/content/kits/shared/tier4.js — helpers and notes of the hand-authored kits for every tier-4 chess (26: 22
// visible + 4 hidden; formerly tier4.js — the kits live one per file in ../ops/).
// export default { [baseChessId]: (bb, chess, def) => Kit }  (docs/SIM.md §7.2). The same kit serves the elite
// (精锐 `_b`) id: `bb` is the Lv4 / Lv7 skill blackboard, talent/trait blackboards come from `def` (module talent and
// trait upgrades of elites are already merged into the data), `def.raw.module.active` tells whether the module runs.
// Every number comes from a blackboard (skill `bb`, `def.talents[i].bb`, `def.traitBb`, token data); literals below
// are only fall-backs for missing keys or documented [ASSUMED] shapes (tornado radius …).
//
// Notes shared by several kits:
// - `base_attack_time` in skill blackboards is a FLAT change of the base attack time in seconds (白面鸮 −1.8 on 2.85 s
//   ⇒ 1.05 s; 水月 −0.7 on 3.5 s) and is converted to the engine's `batPct` (÷ base BAT). 焰尾's +0.7 (text: 攻击间隔
//   缩短) is a multiplier (×0.7) and 信仰搅拌机's 0.6 is the counter interval ratio — both handled in their kits.
// - "技力光环 (同类效果取最高)" (莫斯提马, 白面鸮) share the buff key `aura:spRecovery`; a unit keeps the highest one.
// - Auras refresh short buffs every AURA s so they lapse within a few ticks after the source leaves.
// - Talents that name a faction test the group tags (shared/powers.js hasPower: 拉特兰 laterano, 卡西米尔 kazimierz,
//   谢拉格 kjerag — nationId, groupId, teamId and subPower, never the bonds); other talents use data fields:
//   profession (术师 CASTER, 重装 TANK, 先锋 PIONEER), enemy tags (萨卡兹 sarkaz, 海怪 seamonster). 深海猎人 is the
//   group tag `abyssal` too.
// - "友方干员" effects touch operators only (summons/devices excluded); SP gifts skip units whose timed skill runs
//   (AK: no SP gain during a skill — the engine's gainSp enforces it too; the kits skip such units when picking).
// - On-hit effects of 卡涅利安's attacks land on every enemy the attack strikes — the 阵法术师 trait strikes every enemy
//   on her range at once (professions.js `allInRange` / `rangeAoe`, community report E3): S2's 停顿 / 束缚 via a
//   `damaged` hook, the charged S3 mark via a `hit` hook (it applies before the damage, PRTS 备注).
// - Dodge from a skill that adds to other dodge sources (焰尾 S3) is rolled independently in a `hit` hook, so the
//   sources combine as 1 − Π(1 − p) (the same rule the engine now applies to stacked dodge mods).
// - Operator loadouts (DESIGN §16): every selectable non-default skill of the 22 visible chess is authored in the kit's
//   `skills` map (see alt() below); logic of one skill (counters, deferrals, auras…) only runs when it is selected,
//   and module effects check the selected module (moduleIs / the module-merged trait & talent blackboards).
//   `node tools/kit-coverage.mjs --tier 4 --strict`; tests: test/content/kits_alt_t4.test.js.

import { bodyInRange } from '../../../body.js';
import { canTargetEnemy, sortEnemyTargets } from '../../../targeting.js';
import { normalizeChess } from '../../../simdata.js';
import { hasPower } from './powers.js';
/** @import { Battle } from '../../../Battle.js' */
/** @import { Unit } from '../../../units.js' */
/** @import { SkillRuntime } from '../../../skills.js' */
/** @import { KitChess, KitDef, Bb, Grid, Tile } from './tier1.js' */
/** @import { HealEv } from '../../support/index.js' */
/** @import { BuffRec } from '../../bonds/shared.js' */

const AURA = 0.2;          // aura refresh period (s)
const AURA_DUR = 0.25;     // aura buff lifetime (s): lapses ~1 tick after the source stops refreshing it

// ---------------------------------------------------------------------------------------------------------------
// helpers

/** @param {unknown} v @param {number} [d] */
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v !== '' && Number.isFinite(+v) ? +v : d));
/** @param {KitDef} def @param {number} i */
const tbb = (def, i) => (def && def.talents && def.talents[i] && def.talents[i].bb) || {};
/** Hidden module talent blackboard (name null, e.g. 水月 move_speed, 魔王 cnt/atk). @param {KitDef} def */
const moduleBb = (def) => (def?.talents || []).filter((/** @type {{ name?: string, bb?: Bb }} */ t) => !t.name && t.bb && Object.keys(t.bb).length).reduce((/** @type {Bb} */ o, /** @type {{ bb?: Bb }} */ t) => Object.assign(o, t.bb), /** @type {Bb} */ ({}));
/** @param {unknown} g @returns {Tile[] | null} */
const grid = (g) => (Array.isArray(g) && g.length ? g.map((p) => [p[0], p[1]]) : null);
/** Flat BAT change (s) → batPct. @param {KitDef} def @param {unknown} v */
const batFlat = (def, v) => { const b = num(def?.stats?.bat, 1) || 1; return Math.max(-0.9, num(v, 0) / b); };
/** @param {Unit | null | undefined} e @param {string} tag */
const enemyHasTag = (e, tag) => !!e && e.side === 'enemy' && Array.isArray(e.def?.tags) && e.def.tags.includes(tag);
/** @param {Unit} unit */
const keySet = (unit) => unit.rangeKeySet || new Set(unit.rangeKeys || []);
/** Every living, visible enemy standing on the unit's range (ignores stealth/untargetable: auras, reveals). @param {Battle} battle @param {Unit} unit @param {Set<number> | null} [keys] */
function enemiesOnRange(battle, unit, keys = null) {
  const set = keys || keySet(unit);
  /** @type {Unit[]} */
  const out = [];
  for (const e of battle.enemies) if (e.alive && !e.hidden && bodyInRange(e, set)) out.push(e);
  return out;
}
/**
 * Targetable enemies in the unit's current range (flyers included), best targets first.
 * @param {Battle} battle @param {Unit} unit @param {number} [n] @param {Iterable<number> | null} [keys]
 * @returns {Unit[]}
 */
function targetsInRange(battle, unit, n = 0, keys = null) {
  const list = battle.enemiesInKeys(keys || unit.rangeKeys, unit, { canHitFly: true });
  sortEnemyTargets(battle, unit, list, unit.profile?.priority ?? null);
  return n > 0 && list.length > n ? list.slice(0, n) : list;
}
/** Targetable enemies on the tiles of `g` (offsets) around the unit. @param {Battle} battle @param {Unit} unit @param {Grid} g */
function targetsInGrid(battle, unit, g) {
  return /** @type {Unit[]} */ (battle.unitsInGrid(unit, g, { side: 'enemy' })).filter((e) => canTargetEnemy(unit, e, { canHitFly: true }));
}
/** Run `fn` every `iv` s while the unit is alive and deployed. @param {Battle} battle @param {Unit} unit @param {number} iv @param {() => void} fn */
const whileDeployed = (battle, unit, iv, fn) => battle.every(iv, () => { if (unit.alive && unit.deployed) fn(); }, { owner: unit });
/** Short-lived aura buff. @param {Battle} battle @param {Unit} target @param {string} key @param {Bb | null} mods @param {Bb} [extra] */
const pulse = (battle, target, key, mods, extra = {}) => battle.addBuff(target, { key, mods, duration: AURA_DUR, ...extra });
/** Keep (or remove) a permanent self buff (`extra`: more buff fields, e.g. `visible`). @param {Battle} battle @param {Unit} unit @param {string} key @param {unknown} on @param {Bb} mods @param {Bb} [extra] */
function toggleBuff(battle, unit, key, on, mods, extra = {}) {
  const cur = /** @type {BuffRec | null} */ (unit.findBuff(key));
  if (on) {
    if (!cur || JSON.stringify(cur.mods) !== JSON.stringify(mods)) battle.addBuff(unit, { key, mods, ...extra });
  } else if (cur) battle.removeBuff(unit, key);
}
/** "技力光环（同类效果取最高）": shared key, highest value wins. @param {Battle} battle @param {Unit} source @param {number} value @param {(a: Unit) => unknown} filter */
function spAura(battle, source, value, filter) {
  whileDeployed(battle, source, AURA, () => {
    for (const a of /** @type {Unit[]} */ (battle.alliesFor(source, source.ownerId))) {
      if (!filter(a)) continue;
      const cur = /** @type {BuffRec | null} */ (a.findBuff('aura:spRecovery'));
      if (cur && cur.source !== source && cur.source?.alive && (cur.data?.v ?? 0) > value) continue;
      battle.addBuff(a, { key: 'aura:spRecovery', mods: { spRecoveryFlat: value }, duration: AURA_DUR, source, data: { v: value } });
    }
  });
}
/** Reveal stealthed enemies on the given tiles. */
/** RES cut mods for a blackboard magic_resistance value (battle.applyStrongest): |v| < 1 = ×(1 + v), else flat v. */
/** @param {number} v */
const resCut = (v) => (Math.abs(v) < 1 ? { resMul: Math.max(0, 1 + v) } : { resFlat: v });
/** @param {Battle} battle @param {Iterable<Unit>} enemies */
const reveal = (battle, enemies) => { for (const e of enemies) if (e.s.flags.stealth) pulse(battle, e, 'aura:reveal', null, { flags: { reveal: true } }); };
/** @param {Unit} u */
const skillActive = (u) => !!(u.skill && u.skill.active && u.skill.kind !== 'passive');

// ---- operator loadouts (DESIGN §16) ----------------------------------------------------------------------------
// The kit function receives the def of the SELECTED skill / module: `bb` = that skill's blackboard (normal Lv4 /
// elite Lv7), `def.skill` its record, talents / trait already carry the selected module's changes. `skills` holds the
// hand-authored spec of every selectable non-default skill (only the selected one is built, with its own `bb`);
// install / talent logic that belongs to ONE skill is gated on that skill being the selected one.

/** Id of the selected skill. @param {KitDef} def */
const selId = (def) => def?.skill?.id ?? def?.raw?.skill?.skillId ?? null;
/** Is `id` the selected skill? @param {KitDef} def @param {string} id */
const isSel = (def, id) => selId(def) === id;
/** `skills` map of a kit: the spec of the selected skill when a builder exists for it (DESIGN §16 kit contract). @param {KitDef} def @param {Record<string, () => object>} builders */
function alt(def, builders) {
  const id = selId(def);
  return id && typeof builders[id] === 'function' ? { [id]: builders[id]() } : {};
}
/** Instant or charges kind from the data (maxChargeTime). @param {{ skill?: { maxCharges?: number } | null } | null | undefined} def */
const instantKind = (def) => ((def?.skill?.maxCharges ?? 1) > 1 ? 'charges' : 'instant');
/** No other ally operator / summon on the 4 (or 8) tiles around the unit. @param {Battle} battle @param {Unit} unit @param {boolean} [diag] */
function lonely(battle, unit, diag = false) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if ((!dr && !dc) || (!diag && dr && dc)) continue;
      const r = unit.tileR + dr, c = unit.tileC + dc;
      if (!battle.grid.inBounds(r, c)) continue;
      const o = battle.unitAt(r, c);
      if (o && o !== unit && o.side === 'ally' && o.kind !== 'device') return false;
    }
  }
  return true;
}
/**
 * Module "攻击范围扩大" given as a new range (the selected module's data-only talent `rangeGrid`, e.g. SPC-X / RIN-X:
 * the 3×3 caster range + ONE centre tile [0,3]). It replaces the unit's own range — so also the initial range of the
 * DEFAULT trigger — while a skill with its own range (莫斯提马 S3, 白面鸮 S2…) keeps that range, as in AK. Null when the
 * selected module (or 'none') changes no range. (The rangeGrid-only talent is dropped from `def.talents`: read the
 * module record.)
 * @param {KitDef} def
 */
function moduleRangeGrid(def) {
  const m = def?.raw?.module;
  if (!m || !m.active || !m.id) return null;
  const rec = (/** @type {NonNullable<KitDef>} */ (def).raw.modules || []).find((/** @type {{ uniEquipId?: string } | null} */ x) => x && x.uniEquipId === m.id);
  for (const t of rec?.talentChanges || []) { const g = grid(t?.rangeGrid); if (g) return g; }
  return null;
}
/** @param {Battle} battle @param {Unit} unit @param {KitDef} def */
const applyModuleRange = (battle, unit, def) => { const g = moduleRangeGrid(def); if (g) { unit.rangeGrid = g; battle.refreshRange(unit); } };
/**
 * Pull `e` "至面前" of the unit with 力度 `force` (Battle.pullToFront: the official 拉力起点 half a tile ahead, 急停 0.6708
 * around it, 力度 − 重量 — weight ≤ force all the way, one heavier a third of the way, …); returns the distance moved.
 * @param {Battle} battle @param {Unit} unit @param {Unit | null | undefined} e @param {unknown} force
 */
function pullToFront(battle, unit, e, force) {
  return e && e.alive ? battle.pullToFront(e, unit, num(force, 0)) : 0;
}

/** Physician module trait (录武官, 华法琳 elites): heals on allies below hp_ratio are ×heal_scale. */
/**
 * The module trait "治疗生命值低于50%的友方单位时治疗量提升15%" (heal_scale, hp_ratio): the client's module buff filters the
 * target's HP before the heal with its own comparison — `atOrBelow` for the template heal_scale_up[hpratio][LE] (华法琳's
 * PHY-X), strictly below otherwise (录武官's reckpr_e_002_tr: LT). [ASSUMED as before: not on herself]
 * @param {Battle} battle @param {Unit} unit @param {Bb} tb @param {{ atOrBelow?: boolean }} [opts]
 */
function installLowHpHealBonus(battle, unit, tb, { atOrBelow = false } = {}) {
  const s = num(tb.heal_scale, 0), r = num(tb.hp_ratio, 0);
  if (!(s > 0) || !(r > 0)) return;
  const low = atOrBelow ? (/** @type {Unit} */ t) => t.hpRatio <= r + 1e-9 : (/** @type {Unit} */ t) => t.hpRatio < r;
  battle.on('heal', (/** @type {HealEv} */ c) => { if (c.source === unit && c.target !== unit && low(c.target)) c.amount *= s; }, { owner: unit });
}

/**
 * The hits of a skill whose ability is a ChannelingMeleeAttack (official client; docs/rules/sim.md 「즉발 스킬의 시전」), as a
 * kit's onTick: `start` at the cast (onStart), then `tick` every tick. The first hit comes at the frame the ability waits for
 * (`skill.castTiming().strike`), the others `delta` s apart whatever the attack speed (`_triggerDelta`; the blackboard's
 * `interval`), after each hit another comes while the skill's `duration` less the time since the cast exceeds `post`
 * (`CheckAnotherSpell`, `_postDelayChecker`). `AbilityStandard._DoCast` asks that right after the hit, so the last one comes
 * after the check. A stun, freeze or sleep interrupts the ability, and a skill whose ability is the channel itself ends with it
 * (`BasicSkill.OnTick`: the ability no longer affects).
 */
const channel = {
  /** @param {Unit} unit @param {SkillRuntime} skill @param {{ delta?: number, post?: number }} [opts] */
  start(unit, skill, { delta = 1, post = 1 } = {}) {
    unit.mem.channel = { from: skill.battle.time, next: skill.battle.time + skill.castTiming().strike, delta, post };
  },
  /** @param {{ battle: Battle, unit: Unit, skill: SkillRuntime }} ctx @param {() => void} onHit */
  tick({ battle, unit, skill }, onHit) {
    const c = unit.mem.channel;
    if (!c) return;
    if (!unit.canAct) { skill.end('interrupted'); return; }
    while (battle.time + 1e-9 >= c.next) {
      const hitAt = c.next;
      c.next = skill.duration - (hitAt - c.from) > c.post ? hitAt + c.delta : Infinity;
      onHit();
      if (!skill.active) return;
    }
  },
  /** @param {Unit} unit */
  end(unit) { unit.mem.channel = null; },
};

// DESIGN §5.6 documents `(bb, chess)`; content/index.js also passes the normalised def — rebuild it when absent.
/** @import { KitBuilder } from './chessPick.js' */
/** @param {Record<string, KitBuilder>} kits */
const withDefaults = (kits) => Object.fromEntries(Object.entries(kits).map(([id, f]) => [id, (/** @type {Bb | null | undefined} */ bb, /** @type {KitChess} */ chess, /** @type {KitDef} */ def) => f(bb || {}, chess, def || normalizeChess(chess))]));

export {
  AURA, AURA_DUR, num, tbb, moduleBb, grid, batFlat, hasPower, enemyHasTag, keySet, enemiesOnRange, targetsInRange,
  targetsInGrid, whileDeployed, pulse, toggleBuff, spAura, resCut, reveal, skillActive, isSel, alt, instantKind, lonely,
  applyModuleRange, pullToFront, installLowHpHealBonus, channel, withDefaults,
};
