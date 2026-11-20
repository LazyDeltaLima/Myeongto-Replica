// shared/doctorNo.js — the 「DOCTOR #1234」 tag of a player: the waiting room's seat cards, the team panel's name card
// (public/js/ui/components.js re-exports it) and the server's public room list (server/lobby.js roomRow), which names a
// room's host by this number and never by its playerId.

/**
 * Stable 4-digit "博士 #1234" tag for a player id (FNV-1a hash; ids themselves are opaque strings).
 * @param {any} id
 * @returns {string}
 */
export function doctorNo(id) {
  let h = 2166136261;
  for (const ch of String(id ?? '')) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return String(h % 10000).padStart(4, '0');
}
