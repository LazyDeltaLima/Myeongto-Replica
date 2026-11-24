// server/sim/content/bonds/core.js — the old entry of the 8 core bonds, kept for its importers: the bonds are in
// bonds/nation/<bond>.js and run through bonds/dispatch.js.

import * as S from '../support/index.js';
import { ORDER, templateNumbers } from './dispatch.js';
import { templatesOf } from './shared.js';
import { TEMPLATES as COMMON, registerPrep } from './templates.js';
/** @import { MetaRegistry } from '../../../match/effectsMeta.js' */
/** @import { DataScope } from '../support/index.js' */

export { reached } from './shared.js';
export { yanyouShare } from './nation/yan.js';
export { deps } from './nation/sargon.js';
export { lateranoAmmo } from './nation/laterano.js';
export { payHammers } from './templates.js';

/** The templates of the first install stage (the default season's core bonds and the 规程 ones sharing their code). */
const CORE_TEMPLATES = /** @type {ReadonlyArray<string>} */ (ORDER[0]);

/**
 * A core bond's numbers: buff `key` of its record, else the first template of the core stage it carries (null when the
 * data record is missing or carries none), from the scope's data (support dataFile; default: the default season's).
 * @param {string} bondId @param {string | RegExp} [key] @param {DataScope} [scope]
 */
export function bondBb(bondId, key = undefined, scope = null) {
  if (key !== undefined) return S.buffParams(S.bondRecord(bondId, scope), key);
  const t = templatesOf(S.bondRecord(bondId, scope)).find((x) => CORE_TEMPLATES.includes(x));
  return t ? templateNumbers(bondId, t, scope) : null;
}

/** The layer reward handlers alone (tests): 维多利亚's 维式重锤, 规程 谢拉格's 谢拉格不融冰. @param {MetaRegistry} registry @param {Record<string, any>} [data] */
export function registerMeta(registry, data = S.gameData()) {
  registerPrep(registry, data, [{ bond_layer_added_reward_equip: COMMON.bond_layer_added_reward_equip }]);
}
