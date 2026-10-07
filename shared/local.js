// Local patch: what this server adds to the shared constants and the wire protocol, kept out of the upstream files
// (shared/constants.js, shared/protocol.js) so that merging upstream releases stays conflict-free. protocol.js only
// imports extendProtocol and calls it once at its end.
//
//   room chat      room.chat { text } → room.chat { seq, playerId, name, text, at, faction, kind?, spectator? };
//                  room.chatlog { lines } (the recent lines, to a member who joins or resyncs)
//   chat faction   room.chatFaction { faction } → room.factions { factions: { [playerId]: factionId } } (all members,
//                  whenever it changes, and to whoever joins); cleared when the match ends
//   emote sets     g.emote { id, set? } — 'user' pictures (shared/emote-art.js), missing = official
//   debug panel    dbg.funds { on } · dbg.addDiy { charId, tier, golden?, skill?, module? } — local debug mode only (server/local-patch.js debugMode)

import { EMOTE_SETS } from './emote-art.js';
import { N_ } from './i18n.js';

// local version (docs/LOCAL-PATCH.md "버전 표기"): this server's own semver, independent of upstream's APP_VERSION
// (shared/constants.js), which is shown beside it as the base. major = a big direction change, minor = a deploy with
// new features / screens, patch = a fix-only deploy; merging an upstream release changes only the base.
export const LOCAL_VERSION = '1.0.0';
/** @returns {string} the local version (the `app` argument is kept for the callers; the base is shown separately) */
export const localVersion = () => LOCAL_VERSION;

// room chat: a line's length in code points, the per-player gap between lines, the lines a (re)joining member gets back
export const CHAT_MAX_LEN = 120;
export const CHAT_COOLDOWN_MS = 700;
export const CHAT_HISTORY = 40;

// b.snap unit flag bit beside shared/constants.js UF: the see-through state (UF.STEALTH) is 迷彩 (위장, buffs.js camou),
// not 隐匿 — render/units.js shows its own icon (docs/LOCAL-PATCH.md "위장 아이콘"). Set only when no 隐匿 is in effect.
export const UF_CAMOU = 1024;

// chat faction: a colored tag a player may pick for their chat lines and avatar, cleared when the match ends;
// `bond` is the nation bond whose icon (data/assets.json bonds) shows it
export const CHAT_FACTIONS = Object.freeze([
  { id: 'yan', name: N_('炎国'), color: '#ff3b42', bond: 'yanShip' },
  { id: 'sargon', name: N_('萨尔贡'), color: '#b87850', bond: 'sargonShip' },
  { id: 'victoria', name: N_('维多利亚'), color: '#ff782f', bond: 'victoriaShip' },
  { id: 'kjerag', name: N_('谢拉格'), color: '#43acec', bond: 'kjeragShip' },
  { id: 'laterano', name: N_('拉特兰'), color: '#ff4d91', bond: 'lateranoShip' },
  { id: 'aegir', name: N_('阿戈尔'), color: '#009fb2', bond: 'egirShip' },
  { id: 'siracusa', name: N_('叙拉古'), color: '#4776df', bond: 'siracusaShip' },
  { id: 'kazimierz', name: N_('卡西米尔'), color: '#d8b400', bond: 'kazimierzShip' },
].map(Object.freeze));
/** Chat faction record of an id, or null (safe for any input). */
export const chatFaction = (id) => (typeof id === 'string' && CHAT_FACTIONS.find((f) => f.id === id)) || null;

const isStr = (v, max) => typeof v === 'string' && v.length <= max;
const optional = (check) => (v) => v === undefined || check(v);

/** Server → client message types this patch adds (protocol.js S2C). */
export const LOCAL_S2C = Object.freeze(['room.chat', 'room.chatlog', 'room.factions']);

/**
 * Add this patch's messages to the protocol tables (called once by shared/protocol.js, after both are defined). An
 * upstream g.emote spec keeps its own fields; only the optional `set` is added.
 * @param {Record<string, any>} C2S
 * @param {string[]} S2C
 */
export function extendProtocol(C2S, S2C) {
  // the server trims a line to CHAT_MAX_LEN code points (UTF-16 ×2 here, plus room for whitespace it collapses)
  C2S['room.chat'] = { text: (v) => isStr(v, CHAT_MAX_LEN * 4) };
  C2S['room.chatFaction'] = { faction: (v) => !!chatFaction(v) };
  // local debug mode only (server/local-patch.js debugIntent refuses both otherwise): the in-game debug panel
  C2S['dbg.funds'] = { on: (v) => typeof v === 'boolean' };
  C2S['dbg.addDiy'] = {
    charId: (v) => typeof v === 'string' && /^char_[A-Za-z0-9_]{1,40}$/.test(v),
    tier: (v) => v === 5 || v === 6,
    golden: (v) => typeof v === 'boolean',
    skill: (v) => Number.isInteger(v) && v >= 0 && v <= 2,
    module: (v) => typeof v === 'string' && /^[A-Za-z0-9_\-]{1,64}$/.test(v),
    $optional: ['golden', 'skill', 'module'],
  };
  if (C2S['g.emote']) C2S['g.emote'] = { ...C2S['g.emote'], set: optional((v) => EMOTE_SETS.includes(v)) };
  for (const t of LOCAL_S2C) if (!S2C.includes(t)) S2C.push(t);
}
