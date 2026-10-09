// Summons without HP bar / facing (local patch, docs/LOCAL-PATCH.md) — shared by the server and the browser.
//
// 望's 棋子 is a trap (陷阱师): never an attack target, takes no damage (server/sim/content/kits/ops/op-wang.js), so the client
// draws no HP bar over it. Summons whose range does not depend on the facing (a rotation-symmetric grid) and that the
// user asked to place without the direction step (2026-10-05): 望's 棋子 ([[0,0]]) and 医疗探机 (3×3) — dropping one on
// the board skips the facing wheel (ui/facing.js needsFacing) and shows no facing chevron (render/units.js).

// 琳琅诗怀雅's 香槟炸弹 shows no HP bar either — PRTS 香槟炸弹 备注 "即使自身生命值未满，模型下方也不会显示生命值槽" (upstream
// dd23572b, user decision 2026-10-09: the bar only — it still takes damage and healing, upstream's invulnerability
// 5f98baec is not taken).

/** Summons drawn without an HP bar (untargetable, invulnerable traps; 香槟炸弹). */
export const NO_HP_TOKENS = Object.freeze(new Set(['token_10064_wang_stone1', 'token_10031_swire2_gdtrap']));
/** Summons placed without the direction step. */
export const FACINGLESS_TOKENS = Object.freeze(new Set(['token_10064_wang_stone1', 'token_10000_silent_healrb']));

export const noHpBar = (id) => typeof id === 'string' && NO_HP_TOKENS.has(id);
export const facingless = (id) => typeof id === 'string' && FACINGLESS_TOKENS.has(id);
