// Local patch, server side: one `[stats]` log line per finished match, so the deployed server's play statistics can be
// read from the container log (docker logs or a log collector) without a database or a volume. Called from
// server/local-patch.js onMatchEnd (one line). The line is compact JSON after the `[stats] ` prefix:
//
//   { v, room, match, mode, difficulty, modeId, stageId, bossId, hiddenBossId, victory, rounds, hiddenReached,
//     hiddenCleared, reason, teamLp, durationS, errors,
//     players: [{ seat, name, bot, left, alive, victory, rounds, elimRound, lp, band, title, trophies,
//                 lineup: [[id, tier, golden, [itemIds]]], bonds: [[bondId, layers, active]], stats: {…} }] }
//
// `title` is the settlement title's id (data/config.json titles; v2 — v1 logged the whole Chinese title object).
// Nicknames are already in the [lobby] lines; playerIds (random per session) and the seed are left out. Nothing is
// kept in memory or on disk here.

export const STATS_VERSION = 2;

/** The `[stats]` record for a match summary (Match.finish → room.lastSummary), or null when there is none. */
export function matchStats(room, summary) {
  if (!summary || typeof summary !== 'object') return null;
  const players = Array.isArray(summary.players) ? summary.players : [];
  return {
    v: STATS_VERSION,
    room: room.code,
    match: room.matchCount,
    mode: room.mode,
    difficulty: summary.difficulty ?? room.difficulty,
    modeId: summary.modeId ?? null,
    stageId: summary.stageId ?? null,
    bossId: summary.bossId ?? null,
    hiddenBossId: summary.hiddenBossId ?? null,
    victory: !!summary.victory,
    rounds: summary.roundsPassed ?? null,
    hiddenReached: !!summary.hiddenReached,
    hiddenCleared: !!summary.hiddenCleared,
    reason: summary.reason ?? null,
    teamLp: summary.teamLp ?? null,
    durationS: Number.isFinite(summary.durationMs) ? Math.round(summary.durationMs / 1000) : null,
    errors: summary.errors ?? 0,
    players: players.map((p) => ({
      seat: p.seat,
      name: p.name,
      bot: !!p.isBot,
      left: !!p.left,
      alive: !!p.alive,
      victory: !!p.victory,
      rounds: p.roundsPassed ?? null,
      elimRound: p.eliminatedRound ?? null,
      lp: p.lp ?? null,
      band: p.bandId ?? null,
      title: p.title?.id ?? null, // the title id only (comment_N): its name / text are upstream's Chinese data
      trophies: p.trophies ?? 0,
      lineup: (p.lineup || []).map((u) => [u.id, u.tier ?? null, !!u.golden, u.items || []]),
      bonds: (p.bonds || []).map((b) => [b.bondId, b.layers ?? 0, !!b.active]),
      stats: p.stats || {},
    })),
  };
}

/** Logs the finished match of `room` (its room.lastSummary) as one `[stats]` line; never throws. */
export function logMatchStats(lobby, room) {
  try {
    const rec = matchStats(room, room.lastSummary);
    if (rec) lobby.log.info(`[stats] ${JSON.stringify(rec)}`);
  } catch (e) {
    try { lobby.log.warn(`[stats] ${room?.code} not logged: ${e?.message || e}`); } catch { /* ignore */ }
  }
}
