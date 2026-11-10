// server/sim/content/bonds/dispatch.js — which bond effect runs: the template keys of each bond record (bbStr.key ?? key,
// sub-keys `[…]` belong to their parent, `…_power` is a template of its own — shared.js bondTemplate) pick the code. No
// season id is read: a season that gives a bond another template runs that template's code, and a template no file
// registers runs nothing (tools/season-coverage.mjs lists it).
//
//   nation/<bond>.js   the 12 nation bonds (炎 萨尔贡 维多利亚 谢拉格 拉特兰 阿戈尔 叙拉古 卡西米尔; 规程: 乌萨斯 伊比利亚
//                      莱塔尼亚 聚合), each `TEMPLATES = { template: { bond, battle(battle, pid, bb, members), bb?,
//                      readBy?, partial? } }` — `bb: 'record'` hands the installer every buff of the record together
//                      (shared.js recordBb), else the template's first buff; `readBy`: a part another template's
//                      installer reads; `partial`: what of the template is not written yet
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
import { templateBb, recordBb } from './shared.js';
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

/** Battle templates by file (the file names are the coverage report's `where`). */
const BATTLE_FILES = Object.freeze([
  ['bonds/nation/yan.js', yan], ['bonds/nation/sargon.js', sargon], ['bonds/nation/victoria.js', victoria],
  ['bonds/nation/kjerag.js', kjerag], ['bonds/nation/laterano.js', laterano], ['bonds/nation/egir.js', egir],
  ['bonds/nation/siracusa.js', siracusa], ['bonds/nation/kazimierz.js', kazimierz], ['bonds/nation/ursus.js', ursus],
  ['bonds/nation/iberia.js', iberia], ['bonds/nation/lethania.js', lethania], ['bonds/nation/doc.js', doc],
  ['bonds/general/arcane.js', arcane],
]);
const PREP_FILES = Object.freeze([
  ['bonds/templates.js', common], ['bonds/addon/meta.js', addonMeta], ['bonds/general/visi.js', visi], ['bonds/general/mira.js', mira],
]);

/** template → its declaration, with `where` (the file). */
const BATTLE = Object.freeze(Object.fromEntries(BATTLE_FILES.flatMap(([where, mod]) => Object.entries(mod.TEMPLATES).map(([k, d]) => [k, Object.freeze({ ...d, where })]))));

const ADDON = Symbol('addon');
/** The battle install order (see the header). */
export const ORDER = Object.freeze([
  Object.freeze([
    'act1autochess_bond_eff_yan',
    'act1autochess_bond_eff_sargon', 'act3autochess_bond_eff_sargon',
    'act1autochess_bond_eff_victoria',
    'act1autochess_bond_eff_kjerag', 'act3autochess_bond_eff_kjerag',
    'act1autochess_bond_eff_laterano',
    'act1autochess_bond_eff_egir',
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
  ]),
]);

/** The installer's numbers for `bondId` under template `key` (null when the record does not carry it). */
export function templateNumbers(bondId, key, scope = null) {
  const d = BATTLE[key];
  const rec = S.bondRecord(bondId, scope);
  return d && d.bb === 'record' ? recordBb(rec, key) : templateBb(rec, key);
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
        const bb = templateNumbers(d.bond, key, battle);
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
