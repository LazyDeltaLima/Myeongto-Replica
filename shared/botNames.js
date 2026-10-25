// shared/botNames.js — the AI teammates' display names. The server seats them in Chinese (server/lobby.js); the client
// shows them in the current language (playerName, and ui/lang.js's `{ dn }` name resolver for server messages).

import { N_, dn, t } from './i18n.js';

/** Display names for AI teammates (the tutorial NPCs first, then a few familiar faces). */
export const BOT_NAMES = Object.freeze([N_('AI·华法琳'), N_('AI·阿米娅'), N_('AI·惊蛰'), N_('AI·杜宾'), N_('AI·凯尔希'), N_('AI·可露希尔')]);

const BOT_NAME_SET = new Set(/** @type {readonly string[]} */ (BOT_NAMES));

/** @param {unknown} name */
export const isBotName = (name) => typeof name === 'string' && BOT_NAME_SET.has(name);

/**
 * A player's name as shown: an AI teammate's in the current language, a Doctor's as typed.
 * @param {unknown} name
 */
export const playerName = (name) => (isBotName(name) ? t(/** @type {string} */ (name)) : name);

/**
 * A player's name as a msg() param: an AI teammate's as a `{ dn }` name the client translates, a Doctor's as typed.
 * @param {string} name
 */
export const nameParam = (name) => (isBotName(name) ? dn(name) : name);
