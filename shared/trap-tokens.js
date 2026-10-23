// Summons without HP bar / facing (local patch, docs/LOCAL-PATCH.md) — shared by the server and the browser.
//
// 望's 棋子 is a trap (陷阱师): never an attack target, takes no damage (server/sim/content/kits/ops/op-wang.js), so the client
// draws no HP bar over it. Summons whose range does not depend on the facing (a rotation-symmetric grid) and that the
// user asked to place without the direction step (2026-10-05): 望's 棋子 ([[0,0]]) and 医疗探机 (3×3) — dropping one on
// the board skips the facing wheel (ui/facing.js needsFacing) and shows no facing chevron (render/units.js).

// 琳琅诗怀雅's 香槟炸弹 shows no HP bar either — PRTS 香槟炸弹 备注 "即使自身生命值未满，模型下方也不会显示生命值槽" (upstream
// dd23572b, maintainer decision 2026-10-09: the bar only — it still takes damage and healing, upstream's invulnerability
// 5f98baec is not taken).

// 予愿安洁莉娜's S3 marker “一会儿见！” has no body at all: its client prefab (pkgrps/btl_pfb_tokens_5.ab
// token_10071_aglna2_agairp) holds an EmptyAnimator and no Spine, no shadow, and hides its HP / SP bars (`_alwaysHideHp` /
// `_alwaysHideSp`); what shows is its effect token_aglna2_agairp_01 (render/fxgame.js) — so the client draws no avatar
// diamond, shadow, bar or facing for it (2026-10-11, maintainer report).

/** Summons drawn without an HP bar (untargetable, invulnerable traps; 香槟炸弹; the bodiless markers below). */
export const NO_HP_TOKENS = Object.freeze(new Set(['token_10064_wang_stone1', 'token_10031_swire2_gdtrap', 'token_10071_aglna2_agairp']));
/**
 * Summons drawn with an HP bar but no SP row: 炎佑 (enemy_9012_acloon, an ally built from an enemy record — its 祛恶之焰 runs
 * on the enemy skill's cooldown; the official shows it with its HP bar only, by the maintainer's account 2026-10-23).
 */
export const NO_SP_TOKENS = Object.freeze(new Set(['enemy_9012_acloon']));
/**
 * Summons whose HP bar shows only for a moment after their HP moves (hurt or healed), hidden otherwise: 炎佑, by the
 * maintainer's account of the official game 2026-10-23 (render/units.js HP_FLASH: then gone at once, no fade; the time is [ASSUMED]).
 */
export const FLASH_HP_TOKENS = Object.freeze(new Set(['enemy_9012_acloon']));
/** Summons with no body of their own: only their effect is drawn. */
export const BODYLESS_TOKENS = Object.freeze(new Set(['token_10071_aglna2_agairp']));
/** Summons placed without the direction step. */
export const FACINGLESS_TOKENS = Object.freeze(new Set(['token_10064_wang_stone1', 'token_10000_silent_healrb']));

export const noHpBar = (id) => typeof id === 'string' && NO_HP_TOKENS.has(id);
export const noSpBar = (id) => typeof id === 'string' && NO_SP_TOKENS.has(id);
export const flashHpBar = (id) => typeof id === 'string' && FLASH_HP_TOKENS.has(id);
export const facingless = (id) => typeof id === 'string' && FACINGLESS_TOKENS.has(id);
export const bodyless = (id) => typeof id === 'string' && BODYLESS_TOKENS.has(id);
