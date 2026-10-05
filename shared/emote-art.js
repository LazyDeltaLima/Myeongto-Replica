// User emote set (local patch): 36 fan-made pictures (public/img/emotes/, taken from the Korean fork
// moring-m/Stronghold-Protocol_Ko_Arca) mapped onto the 36 official emote ids, so the wire protocol keeps its id
// whitelist. A sender picks the set in the emote wheel's tabs and `g.emote { id, set }` carries it, so every player sees
// the picture that was sent (server/match/Match.js emote, public/js/ui/emotes.js).
//
// Pages of the user tab: the pictures in natural filename order (c2 before c10), six per page.

import { EMOTE_CATALOG } from './constants.js';

/** Emote sets a player can send from: the official pictures, or the user pictures below. */
export const EMOTE_SETS = Object.freeze(['official', 'user']);
/** Wire value → set ('official' for anything unknown or missing: older clients send no set). */
export const emoteSet = (v) => (v === 'user' ? 'user' : 'official');

const ART = new Map([
  ["autochess_battle_happy", '/img/emotes/c8.webp'],
  ["autochess_battle_scared", '/img/emotes/b0.webp'],
  ["autochess_battle_sorry", '/img/emotes/c3.webp'],
  ["autochess_battle_thanks", '/img/emotes/c0.webp'],
  ["autochess_battle_thinking", '/img/emotes/c6.webp'],
  ["autochess_battle_nice_cooperate", '/img/emotes/c2.webp'],
  ["slug_autochess_battle_nice_work", '/img/emotes/d0.webp'],
  ["slug_autochess_battle_thanks", '/img/emotes/e7.webp'],
  ["slug_autochess_battle_sorry", '/img/emotes/e9.webp'],
  ["slug_autochess_battle_bye", '/img/emotes/f2.webp'],
  ["slug_autochess_battle_distrust", '/img/emotes/e1.webp'],
  ["slug_autochess_battle_very_soon", '/img/emotes/b2.webp'],
  ["autochess_battle_noproblem", '/img/emotes/c11.webp'],
  ["autochess_battle_respect", '/img/emotes/f3.webp'],
  ["autochess_battle_call", '/img/emotes/a0.webp'],
  ["autochess_battle_playingcool", '/img/emotes/g4.webp'],
  ["autochess_battle_sad", '/img/emotes/e5.webp'],
  ["autochess_battle_dying", '/img/emotes/c13.webp'],
  ["autochess_battle_fooldoctor_01", '/img/emotes/b3.webp'],
  ["autochess_battle_fooldoctor_02", '/img/emotes/b4.webp'],
  ["autochess_battle_fooldoctor_03", '/img/emotes/e10.webp'],
  ["autochess_battle_fooldoctor_04", '/img/emotes/e0.webp'],
  ["autochess_battle_fooldoctor_05", '/img/emotes/c4.webp'],
  ["autochess_battle_fooldoctor_06", '/img/emotes/c5.webp'],
  ["autochess_battle_foolamiya_01", '/img/emotes/f0.webp'],
  ["autochess_battle_foolamiya_02", '/img/emotes/a5.webp'],
  ["autochess_battle_foolamiya_03", '/img/emotes/e4.webp'],
  ["autochess_battle_foolamiya_04", '/img/emotes/e6.webp'],
  ["autochess_battle_foolamiya_05", '/img/emotes/e8.webp'],
  ["autochess_battle_foolamiya_06", '/img/emotes/h1.webp'],
  ["autochess_battle_foolwisdel_01", '/img/emotes/c9.webp'],
  ["autochess_battle_foolwisdel_02", '/img/emotes/c10.webp'],
  ["autochess_battle_foolwisdel_03", '/img/emotes/c14.webp'],
  ["autochess_battle_foolwisdel_04", '/img/emotes/f4.webp'],
  ["autochess_battle_foolwisdel_05", '/img/emotes/g5.webp'],
  ["autochess_battle_foolwisdel_06", '/img/emotes/e3.webp'],
]);
/** URL of an emote id's user picture, or null (safe for any input, including '__proto__'). */
export const userEmoteArt = (id) => (typeof id === 'string' && ART.get(id)) || null;

const sorted = [...EMOTE_CATALOG].sort((a, b) => userEmoteArt(a.id).localeCompare(userEmoteArt(b.id), 'en', { numeric: true }));
/** Pages of the user tab: { key, name, emotes } × 6. */
export const USER_EMOTE_PAGES = Object.freeze(Array.from({ length: Math.ceil(sorted.length / 6) }, (_, i) => Object.freeze({
  key: `user${i + 1}`,
  name: `用户表情 ${i + 1}`,
  emotes: Object.freeze(sorted.slice(i * 6, (i + 1) * 6)),
})));
