// server/match/unitTally.js — the settlement's per-operator numbers (m.result players[].units, the result screen's
// damage and 联防 tabs): what each of a player's operators did over the whole match, summed from the battles' unitStats.
//
//   dmg      damage dealt to enemies in every battle the player fought (own battles, 联防, boss rounds) — the per-unit
//            share of stats.dmgDealt (造成伤害)
//   final    damage to the Final Assault leader's shared pool; hidden: to the Hidden Core leader's
//   assist   联防 knock-outs of enemies other players let through, by the leaker (playerId → count)
//
// An operator is one row however often it was merged, elited or rebought: the key is its base chess id (a 自选 slot:
// its pick's charId). A summon counts for its summoner — a board summon piece through its `ownerUid`, a unit the battle
// created through the unitStats `ownerUid` (the nearest summoner with a board uid, sim lifecycle.js); a unit with no
// operator behind it (a bond's summon) counts for nobody.
//
// Leader damage of a battle is capped at what the server credited the player in that boss round (`bossCap`, the shared
// pool's own tally): a browser-run boss field counts against its local copy of the pool, so when two fields land the
// last hits at the same moment both browsers count the HP that was left, and the server credits it once. The units are
// scaled down together so their sum never exceeds the player's own number on the same screen. Damage and 联防 knock-outs
// come from the same report as the player's totals and are taken as they are.
//
// Pure bookkeeping on the PlayerState (`unitTally`): nothing here reads or changes what a battle does.

/** Most rows a player's result carries (the screen ranks the top ones; the stored match records keep fewer). */
export const MAX_UNIT_ROWS = 24;

/** The chess piece a board uid counts for: the piece itself, or the operator behind a summon piece. */
function chessFor(byUid, uid) {
  let p = byUid.get(uid);
  for (let i = 0; p && p.kind !== 'chess' && i < 4; i++) p = Number.isInteger(p.ownerUid) ? byUid.get(p.ownerUid) : null;
  return p && p.kind === 'chess' ? p : null;
}

/** The player's row of a chess piece (created on first use); its look follows the latest piece (elite, pick, stand-in). */
function rowOf(gd, ps, piece) {
  const pick = typeof ps.diyPickOf === 'function' ? ps.diyPickOf(piece.id) : null;
  const key = pick ? `diy:${pick.charId}` : gd.baseIdOf(piece.id);
  let row = ps.unitTally.get(key);
  if (!row) ps.unitTally.set(key, (row = { key, id: piece.id, dmg: 0, final: 0, hidden: 0, assist: {}, summon: false }));
  row.id = piece.id;
  row.diy = pick ? { charId: pick.charId, skillIndex: pick.skillIndex, uniEquipId: pick.uniEquipId } : null;
  const si = !pick && typeof ps.fieldsStandIn === 'function' && ps.fieldsStandIn(piece.id) ? gd.standIn(piece.id) : null;
  row.standInFor = si && si.standInFor ? si.standInFor : null;
  return row;
}

/**
 * Add one battle's unitStats of a player.
 * @param {any} gd the match's game data
 * @param {any} ps PlayerState
 * @param {any[]|undefined} unitStats BattleResult.perPlayer[pid].unitStats
 * @param {{ boss?: 'final'|'hidden'|null, bossCap?: number|null }} [o] a boss round: which leader, and what the server credited
 */
export function tallyBattle(gd, ps, unitStats, { boss = null, bossCap = null } = {}) {
  if (!ps || !ps.unitTally || !Array.isArray(unitStats) || !unitStats.length) return;
  const byUid = new Map();
  for (const p of ps.board.values()) if (p && Number.isInteger(p.uid)) byUid.set(p.uid, p);
  const hits = [];
  for (const u of unitStats) {
    if (!u) continue;
    const piece = (Number.isInteger(u.uid) && chessFor(byUid, u.uid)) || (Number.isInteger(u.ownerUid) && chessFor(byUid, u.ownerUid)) || null;
    if (piece) hits.push([rowOf(gd, ps, piece), u, u.uid !== piece.uid]);
  }
  let scale = 1;
  if (boss) {
    const sum = hits.reduce((s, [, u]) => s + Math.max(0, Number(u.boss) || 0), 0);
    if (Number.isFinite(bossCap) && sum > bossCap) scale = sum > 0 ? Math.max(0, bossCap) / sum : 0;
  }
  for (const [row, u, summon] of hits) {
    const dmg = Math.max(0, Number(u.dmg) || 0);
    const lead = boss ? Math.max(0, Number(u.boss) || 0) * scale : 0;
    let assists = 0;
    row.dmg += dmg;
    if (boss) row[boss] += lead;
    if (u.assist && typeof u.assist === 'object') {
      for (const [src, n] of Object.entries(u.assist)) {
        if (src === ps.playerId || !(Number(n) > 0)) continue;
        row.assist[src] = (row.assist[src] || 0) + Math.trunc(Number(n));
        assists += Math.trunc(Number(n));
      }
    }
    if (summon && (dmg > 0 || lead > 0 || assists > 0)) row.summon = true;
  }
}

/**
 * The player's rows for m.result: every operator that dealt damage or knocked out another player's enemy, most damage
 * first, at most MAX_UNIT_ROWS. `sold`: the operator is no longer the player's (not on the board, in the hand or in temp).
 * @returns {Array<{ id: string, golden: boolean, tier: number|null, diy?: object, standInFor?: string, sold?: true,
 *   summon?: true, dmg: number, final: number, hidden: number, assist?: Record<string, number> }>}
 */
export function unitRows(gd, ps) {
  if (!ps || !ps.unitTally) return [];
  const owned = new Set();
  for (const p of [...ps.board.values(), ...(ps.hand || []), ...(ps.temp || [])]) {
    if (!p || p.kind !== 'chess') continue;
    const pick = typeof ps.diyPickOf === 'function' ? ps.diyPickOf(p.id) : null;
    owned.add(pick ? `diy:${pick.charId}` : gd.baseIdOf(p.id));
  }
  const rows = [];
  for (const r of ps.unitTally.values()) {
    const assistSum = Object.values(r.assist).reduce((s, n) => s + n, 0);
    if (!(r.dmg >= 0.5) && !(r.final >= 0.5) && !(r.hidden >= 0.5) && !assistSum) continue;
    const e = { id: r.id, golden: gd.isGolden(r.id), tier: gd.tierOf(r.id) ?? null, dmg: Math.round(r.dmg), final: Math.round(r.final), hidden: Math.round(r.hidden) };
    if (r.diy) e.diy = { ...r.diy };
    if (r.standInFor) e.standInFor = r.standInFor;
    if (!owned.has(r.key)) e.sold = true;
    if (r.summon) e.summon = true;
    if (assistSum) e.assist = { ...r.assist };
    rows.push(e);
  }
  rows.sort((a, b) => b.dmg - a.dmg || (b.final + b.hidden) - (a.final + a.hidden));
  return rows.slice(0, MAX_UNIT_ROWS);
}
