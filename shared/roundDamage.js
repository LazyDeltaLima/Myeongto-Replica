// shared/roundDamage.js — the round damage panel's numbers (a feature of this fork, maintainer decision 2026-10-25;
// docs/rules/ui.md 「라운드 대미지 패널」): what each of a player's board operators dealt in the player's own battle of a
// round. The server sends the settled numbers as m.roundDmg (server/match/match/settle.js, bossRounds.js); the browser
// reads the own battle it runs live the same way (public/js/battle/runner.js ownDamage). 联防 battles are left out
// (maintainer decision 2026-10-25). A row also carries the healing and the damage by type (the panel's 治疗 tab and its
// stacked bar, maintainer decision 2026-11-06): [uid, damage, healing, physical, arts, true, elemental].
//
// The fold is the settlement's (server/match/unitTally.js): a unit counts for the board chess its uid names, or the chess
// behind a board summon piece (`ownerUid`), or — a unit the battle created — the chess its own `ownerUid` names (the
// nearest summoner with a board uid); a unit with no operator behind it (a bond's summon) counts for nobody.

/** The order of a unit's `stats.byType` (server/sim/damage.js) and of a row's four type numbers. */
export const DAMAGE_TYPES = Object.freeze(['phys', 'arts', 'true', 'elemental']);

/**
 * A battle's units of one player in the unitStats shape the fold reads ({ uid, ownerUid, dmg, heal, byType }): the sim's
 * lifecycle.js result, taken from the live units.
 * @param {any[]|undefined} units Battle.players[i].units
 * @returns {Array<{ uid: number|null, ownerUid: number|null, dmg: number, heal: number, byType: number[]|null }>}
 */
export function liveUnitDamage(units) {
  const out = [];
  for (const u of units || []) {
    if (!u || !u.stats) continue;
    let o = u.ownerUnit;
    for (let i = 0; o && o.uid == null && i < 8; i++) o = o.ownerUnit;
    out.push({ uid: u.uid ?? null, ownerUid: o && o.uid != null && o !== u ? o.uid : null, dmg: Number(u.stats.dmg) || 0, heal: Number(u.stats.heal) || 0, byType: u.stats.byType || null });
  }
  return out;
}

/**
 * Sum a battle's unit damage and healing per board chess.
 * @param {Iterable<{ uid: number, kind: string, ownerUid?: number|null }>|undefined} board the player's board pieces
 * @param {Array<{ uid?: number|null, ownerUid?: number|null, dmg?: number, heal?: number, byType?: number[]|null }>|undefined} units the battle's unitStats
 * @returns {number[][]} [chess uid, damage, healing, physical, arts, true, elemental] for every board chess the battle had, most damage first
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
    if (!piece) continue;
    let row = sum.get(piece.uid);
    if (!row) sum.set(piece.uid, (row = [piece.uid, 0, 0, 0, 0, 0, 0]));
    row[1] += Math.max(0, Number(u.dmg) || 0);
    row[2] += Math.max(0, Number(u.heal) || 0);
    if (Array.isArray(u.byType)) for (let i = 0; i < DAMAGE_TYPES.length; i++) row[3 + i] += Math.max(0, Number(u.byType[i]) || 0);
  }
  return [...sum.values()].map((row) => row.map(Math.round)).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
}
