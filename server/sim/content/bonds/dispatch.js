// server/sim/content/bonds/dispatch.js — which bond effect runs: the template keys of each bond record (bbStr.key ?? key,
// sub-keys `[…]` belong to their parent, `…_power` is a template of its own — shared.js bondTemplate) pick the code. No
// season id is read: a season that gives a bond another template runs that template's code, and a template no file
// registers runs nothing (tools/season-coverage.mjs lists it).
//
//   nation/<bond>.js   the 12 nation bonds (炎 萨尔贡 维多利亚 谢拉格 拉特兰 阿戈尔 叙拉古 卡西米尔; 规程: 乌萨斯 伊比利亚
//                      莱塔尼亚 聚合), each `TEMPLATES = { template: { bond, battle(battle, pid, bb, members), bb?,
//                      readBy?, partial?, reserve? } }` — `bb: 'record'` hands the installer every buff of the record
//                      together (shared.js recordBb), else the template's own buffs (its `[…]` sub-keys with it: templateBb); `readBy`: a part another
//                      template's installer reads; `partial`: what of the template is not written yet; `reserve(battle,
//                      pid, bb)`: the 整备区 operators it may field, created before any content installs (reserve), and
//                      `hand(bb)` the rule of the hand pieces the match sends for it (handRules)
//   general/<bond>.js  an add-on bond's template of another season (规程's 奥术, 远见's discount, 奇迹's 100 layers)
//   addon/battle.js    the 11 add-on bonds with a battle side, one install for all of them (its TEMPLATES name the
//                      templates it runs)
//   templates.js, addon/meta.js   the prep templates (`TEMPLATES = { template: { bonds, prep(bondId) } }`)
//
// ORDER is the battle install order, part of the battle's determinism (hook registration order): per player the nation
// templates of the default season's 8 core bonds (and 规程's that share their installer), then the add-on bonds for the
// whole battle, then per player 规程's own templates. Each installer runs in isolation: one failing installer never
// disables the others (the first error is re-thrown afterwards so content/index.js records it in battle.errors / the
// server log).

import * as S from '../support/index.js';
import { templateBb, recordBb, bondTemplate } from './shared.js';
import * as yan from './nation/yan.js';
import * as sargon from './nation/sargon.js';
import * as victoria from './nation/victoria.js';
import * as kjerag from './nation/kjerag.js';
import * as laterano from './nation/laterano.js';
import * as egir from './nation/egir.js';
import * as siracusa from './nation/siracusa.js';
import * as kazimierz from './nation/kazimierz.js';
import * as ursus from './nation/ursus.js';
import * as iberia from './nation/iberia.js';
import * as lethania from './nation/lethania.js';
import * as doc from './nation/doc.js';
import * as arcane from './general/arcane.js';
import * as visi from './general/visi.js';
import * as mira from './general/mira.js';
import * as addonBattle from './addon/battle.js';
import * as addonMeta from './addon/meta.js';
import * as common from './templates.js';

/** @typedef {readonly [string, { TEMPLATES: Record<string, any> }]} BondFile a bond file and its module */

/**
 * Battle templates by file (the file names are the coverage report's `where`).
 * @type {ReadonlyArray<BondFile>}
 */
const BATTLE_FILES = Object.freeze([
  ['bonds/nation/yan.js', yan], ['bonds/nation/sargon.js', sargon], ['bonds/nation/victoria.js', victoria],
  ['bonds/nation/kjerag.js', kjerag], ['bonds/nation/laterano.js', laterano], ['bonds/nation/egir.js', egir],
  ['bonds/nation/siracusa.js', siracusa], ['bonds/nation/kazimierz.js', kazimierz], ['bonds/nation/ursus.js', ursus],
  ['bonds/nation/iberia.js', iberia], ['bonds/nation/lethania.js', lethania], ['bonds/nation/doc.js', doc],
  ['bonds/general/arcane.js', arcane],
]);
/** @type {ReadonlyArray<BondFile>} */
const PREP_FILES = Object.freeze([
  ['bonds/templates.js', common], ['bonds/addon/meta.js', addonMeta], ['bonds/general/visi.js', visi], ['bonds/general/mira.js', mira],
]);

/** template → its declaration, with `where` (the file). */
const BATTLE = Object.freeze(Object.fromEntries(BATTLE_FILES.flatMap(([where, mod]) => Object.entries(mod.TEMPLATES).map(([k, d]) => [k, Object.freeze({ ...d, where })]))));

const ADDON = Symbol('addon');
const ADDON_TEMPLATES = new Set(Object.keys(addonBattle.TEMPLATES));
/**
 * The battle install order (see the header).
 * @type {ReadonlyArray<ReadonlyArray<string> | typeof ADDON>}
 */
export const ORDER = Object.freeze([
  Object.freeze([
    'act1autochess_bond_eff_yan',
    'act1autochess_bond_eff_sargon', 'act3autochess_bond_eff_sargon',
    'act1autochess_bond_eff_victoria', 'act3autochess_bond_eff_victoria',
    'act1autochess_bond_eff_kjerag', 'act3autochess_bond_eff_kjerag',
    'act1autochess_bond_eff_laterano',
    'act1autochess_bond_eff_egir', 'act3autochess_bond_eff_egir',
    'act2autochess_bond_eff_siracusa',
    'act2autochess_bond_eff_kazimierz',
  ]),
  ADDON,
  Object.freeze([
    'act3autochess_bond_eff_yan',
    'act3autochess_bond_eff_ursus',
    'act3autochess_bond_eff_iberia',
    'act3autochess_bond_eff_lethania',
    'act3autochess_bond_eff_siracusa',
    'act3autochess_bond_eff_kazimierz',
    'act3autochess_bond_eff_arcane',
    'act3autochess_bond_eff_doc',
    'act3autochess_bond_eff_sargon_power',
    'act3autochess_bond_eff_kjerag_power',
  ]),
]);

// =====================================================================================================================
// 规程: a strategy that switches a bond to its other direction (auto_chess_effect_replace)
//
// Eight 规程 strategies carry auto_chess_effect_replace, bbStr `{ <the bond's effect>: <the other direction> }`, on every
// stage: 娜仁图亚 萨尔贡 _2 → the default season's, 耶拉 谢拉格 _2 → the default season's, 裁度 叙拉古, 焰尾 卡西米尔, 望 炎 the
// same way, 洛洛 维多利亚 → _2, 歌蕾蒂娅 阿戈尔 → _2. No text names it (the client's bond card would show the other effect):
// a rider of holding the strategy, from the first round. The holder's battle runs the other effect's battle templates
// (its env buffs with the record's own numbers: the default season's code, 规程's own for 维多利亚 / 阿戈尔 _2 —
// nation/victoria.js, nation/egir.js); the bond's prep templates stay the season
// record's — the layer rewards are server-side, and the other direction's own text still promises them (谢拉格's
// 「每叠加100层获得1件谢拉格不融冰」, its effect record without the reward buff) [ASSUMED·서버: 다른 방향의 층 보상은 서버 쪽 규칙].
// A target direction whose battle templates are not all written here is not switched (the player keeps the season's
// direction; the coverage report shows the strategy's row partial).

/** The strategy record's replacements: the bond effect id → the effect id it becomes (first stage that has one). */
export function bondEffectReplacements(bandRec) {
  const out = new Map();
  const stages = Array.isArray(bandRec?.skills) && bandRec.skills.length ? bandRec.skills : bandRec ? [bandRec] : [];
  for (const st of stages) {
    for (const b of Array.isArray(st?.buffs) ? st.buffs : []) {
      if (b?.key !== 'auto_chess_effect_replace' || !b.bbStr || typeof b.bbStr !== 'object') continue;
      for (const [from, to] of Object.entries(b.bbStr)) if (typeof to === 'string' && to && !out.has(from)) out.set(from, to);
    }
  }
  return out;
}

const RUNE_KEYS = new Set(['env_gbuff_new', 'env_gbuff_new_with_verify', 'char_dynamic_ability_new']);
const isRune = (b) => RUNE_KEYS.has(b?.key);

/** The battle templates of an effect record that no bond file handles (empty: every one is written). */
export function unwrittenTemplates(eff) {
  const out = [];
  for (const b of Array.isArray(eff?.buffs) ? eff.buffs : []) {
    if (!isRune(b)) continue;
    const t = bondTemplate(b);
    if (t && !BATTLE[t] && !ADDON_TEMPLATES.has(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

/**
 * The bond record a holder of `bandRec` plays: `rec` with the other direction's effect (its id, name, texts and battle
 * buffs; the prep buffs stay `rec`'s) when the strategy switches it and that direction is written, else `rec` itself.
 * `effectOf(id)`: the season's effects.json record.
 */
export function swapBondRecord(rec, bandRec, effectOf) {
  if (!rec || !bandRec || typeof effectOf !== 'function') return rec;
  const to = bondEffectReplacements(bandRec).get(rec.effectId);
  const eff = to ? effectOf(to) : null;
  if (!eff || unwrittenTemplates(eff).length) return rec;
  return {
    ...rec, effectId: to, effectName: eff.name ?? rec.effectName, effectDesc: eff.desc ?? rec.effectDesc, effectDescRaw: eff.descRaw ?? rec.effectDescRaw,
    buffs: [...(eff.buffs || []).filter(isRune), ...(rec.buffs || []).filter((b) => !isRune(b))],
    replacedEffectId: rec.effectId,
  };
}

/** The bond record player `pid`'s battle runs (swapBondRecord with the player's strategy; scope: the battle). */
export function playerBondRecord(scope, pid, bondId) {
  const rec = S.bondRecord(bondId, scope);
  const bandId = pid != null ? S.player(scope, pid)?.bandId : null;
  if (!rec || !bandId) return rec;
  const effects = S.dataFile(scope, 'effects') || {};
  return swapBondRecord(rec, S.bandRecord(bandId, scope), (id) => (Object.hasOwn(effects, id) ? effects[id] : null));
}

/**
 * The installer's numbers for `bondId` under template `key` (null when the record does not carry it); with `pid`, the
 * record that player's battle runs (playerBondRecord).
 */
export function templateNumbers(bondId, key, scope = null, pid = null) {
  const d = BATTLE[key];
  const rec = pid != null && typeof scope?.getPlayer === 'function' ? playerBondRecord(scope, pid, bondId) : S.bondRecord(bondId, scope);
  return d && d.bb === 'record' ? recordBb(rec, key) : templateBb(rec, key);
}

/**
 * The 整备区 pieces a battle may field (PlayerBattleInput `reserve`, server/match/player/round.js battleInput): per
 * template with a `hand(bb)` rule whose bond record (`bondOf(bondId)`, the season's) carries it, `{ bond, position, need }`
 * — a hand operator of that deploy class (`position` null: any — 规程's 阿戈尔 6) carrying the bond (or 调和) once the
 * player has `need` members. A superset: the
 * template's `reserve` picks the exact candidates. Only these travel, so the spec shows no more of a player's hand.
 */
export function handRules(bondOf) {
  const out = [];
  for (const [key, d] of Object.entries(BATTLE)) {
    if (typeof d.hand !== 'function') continue;
    const rec = bondOf(d.bond);
    const bb = rec ? (d.bb === 'record' ? recordBb(rec, key) : templateBb(rec, key)) : null;
    if (bb) out.push({ bond: d.bond, ...d.hand(bb) });
  }
  return out;
}

/**
 * Before any content installs (content/index.js `reserve`): the templates with a `reserve(battle, pid, bb)` create the
 * reserve operators they may field (battle/players.js createReserveAlly — 规程's 卡西米尔 6 switch), in ORDER, per player.
 */
export function reserve(battle) {
  if (!battle || !Array.isArray(battle.players)) return;
  for (const stage of ORDER) {
    if (stage === ADDON) continue;
    for (const p of battle.players) {
      const pid = p.playerId;
      if (!p.bonds || typeof p.bonds !== 'object') continue;
      for (const key of stage) {
        const d = BATTLE[key];
        if (typeof d.reserve !== 'function' || !S.bondActive(battle, pid, d.bond)) continue;
        const bb = templateNumbers(d.bond, key, battle, pid);
        if (bb) d.reserve(battle, pid, bb);
      }
    }
  }
}

export function install(battle) {
  if (!battle || !Array.isArray(battle.players)) return;
  let first = null;
  const run = (name, fn) => {
    try { fn(); } catch (e) {
      if (!first) { first = e; try { e.message = `${name}: ${e.message}`; } catch { /* frozen */ } }
    }
  };
  for (const stage of ORDER) {
    if (stage === ADDON) { run('bonds/addon/battle.install', () => addonBattle.install(battle)); continue; }
    for (const p of battle.players) {
      const pid = p.playerId;
      if (!p.bonds || typeof p.bonds !== 'object') continue;
      for (const key of stage) {
        const d = BATTLE[key];
        if (!S.bondActive(battle, pid, d.bond)) continue;
        const bb = templateNumbers(d.bond, key, battle, pid);
        if (!bb) continue;
        const members = S.bondMembers(battle, pid, d.bond);
        if (!members.length) continue;
        run(`${d.where} ${key}`, () => d.battle(battle, pid, bb, members));
      }
    }
  }
  if (first) throw first;
}

/** Prep side, from the season's bond records (`data`: absent, the default season's). */
export function registerMeta(registry, data = S.gameData()) {
  common.registerGlobals(registry);
  common.registerPrep(registry, data, PREP_FILES.map(([, mod]) => mod.TEMPLATES));
}

/**
 * Every template the bond files handle: template → { bonds (null: any), side, where, partial? } — the coverage
 * report's table (content/coverage.js adds the match engine's prep rules).
 */
export function handledTemplates() {
  const out = {};
  for (const [k, d] of Object.entries(BATTLE)) out[k] = { bonds: [d.bond], side: 'battle', where: d.where, ...(d.partial ? { partial: [...d.partial] } : {}) };
  for (const [k, d] of Object.entries(addonBattle.TEMPLATES)) out[k] = { bonds: [d.bond], side: 'battle', where: 'bonds/addon/battle.js' };
  for (const [where, mod] of PREP_FILES) {
    for (const [k, d] of Object.entries(mod.TEMPLATES)) out[k] = { bonds: d.bonds ? [...d.bonds] : null, side: 'prep', where };
  }
  return out;
}
