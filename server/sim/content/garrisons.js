// server/sim/content/garrisons.js — 特质 (garrisons), battle side and prep side (docs/DATA.md §4, docs/META.md §2.3).
//
//   install(battle)             IN_BATTLE garrisons — garrisons/battle.js
//   reserve(battle)             the 整备区 operators a switch 特质 may call (before any content installs) — garrisons/effects/switch.js
//   registerMeta(registry)      SERVER_* garrisons — garrisons/meta.js (garrison:<effectKey>)
//   triggerGainEffects(ctx, p)  re-run the 获得时 garrisons of an owned chess piece (×投资人); returns the effects run

export { install, reserve } from './garrisons/battle.js';
export { registerMeta, triggerGainEffects } from './garrisons/meta.js';
