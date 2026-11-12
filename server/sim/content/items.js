// server/sim/content/items.js — equipment & Arts content (research 04, docs/DATA.md §5).
// Battle side: install(battle) is called once per Battle by content/index.js (inside try/catch).
// Prep side: registerMeta(registry) is called once at server boot by match/effectsMeta.js.
// lendItemEffects(battle, fromUnit, toUnit, { maxTier, duration }) is used by 萨尔贡 × 娜仁图亚 (bands) and 规程's 维多利亚
// 6 (洛洛's other direction; endLentItems ends its loans early, bonds/nation/victoria.js); deploymentOf(u)
// (the deployment a unit is in — a redeploy or an in-place 复活 opens a new one) by 阿戈尔's devour (bonds/nation/egir.js).
export { install, lendItemEffects, endLentItems, deploymentOf } from './items/battle.js';
export { registerMeta } from './items/meta.js';
