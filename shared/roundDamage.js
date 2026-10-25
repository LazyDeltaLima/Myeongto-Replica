// shared/roundDamage.js — the round damage panel's numbers (a feature of this fork, maintainer decision 2026-10-25;
// docs/rules/ui.md 「라운드 대미지 패널」): what each of a player's board operators dealt in the player's own battle of a
// round. The server sends the settled numbers as m.roundDmg (server/match/match/settle.js, bossRounds.js); the browser
// reads the own battle it runs live the same way (public/js/battle/runner.js ownDamage). 联防 battles are left out
// (maintainer decision 2026-10-25).
//
// The fold is the settlement's (server/match/unitTally.js): a unit counts for the board chess its uid names, or the chess
// behind a board summon piece (`ownerUid`), or — a unit the battle created — the chess its own `ownerUid` names (the
// nearest summoner with a board uid); a unit with no operator behind it (a bond's summon) counts for nobody.

/**
 * A battle's units of one player in the unitStats shape the fold reads ({ uid, ownerUid, dmg }): the sim's
 * lifecycle.js result, taken from the live units.
 * @param {any[]|undefined} units Battle.players[i].units
 * @returns {Array<{ uid: number|null, ownerUid: number|null, dmg: number }>}
 */
export function liveUnitDamage(units) {
  const out = [];
  for (const u of units || []) {
    if (!u || !u.stats) continue;
    let o = u.ownerUnit;
    for (let i = 0; o && o.uid == null && i < 8; i++) o = o.ownerUnit;
    out.push({ uid: u.uid ?? null, ownerUid: o && o.uid != null && o !== u ? o.uid : null, dmg: Number(u.stats.dmg) || 0 });
  }
  return out;
}

/**
 * Sum a battle's unit damage per board chess.
 * @param {Iterable<{ uid: number, kind: string, ownerUid?: number|null }>|undefined} board the player's board pieces
 * @param {Array<{ uid?: number|null, ownerUid?: number|null, dmg?: number }>|undefined} units the battle's unitStats
 * @returns {Array<[number, number]>} [chess uid, damage] for every board chess the battle had, most damage first
 */
export function foldRoundDamage(board, units) {
  const byUid = new Map();
  for (const p of board || []) if (p && Number.isInteger(p.uid)) byUid.set(p.uid, p);
  const chessFor = (uid) => {
    let p = byUid.get(uid);
    for (let i = 0; p && p.kind !== 'chess' && i < 4; i++) p = Number.isInteger(p.ownerUid) ? byUid.get(p.ownerUid) : null;
    return p && p.kind === 'chess' ? p : null;
  };
  const sum = new Map();
  for (const u of units || []) {
    if (!u) continue;
    const piece = (Number.isInteger(u.uid) && chessFor(u.uid)) || (Number.isInteger(u.ownerUid) && chessFor(u.ownerUid)) || null;
    if (piece) sum.set(piece.uid, (sum.get(piece.uid) || 0) + Math.max(0, Number(u.dmg) || 0));
  }
  return [...sum].map(([uid, d]) => /** @type {[number, number]} */ ([uid, Math.round(d)])).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
}
