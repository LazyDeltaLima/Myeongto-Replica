// Server side: the per-room status list behind the internal `GET /healthz/rooms` (server/http/routes.js),
// so an operator can see which rooms are where before a restart (the deploy script prints it during the countdown and
// on request). One row per room:
//
//   { code, mode, difficulty, phase, round, stageId, bossId, humans, connected, bots, spectators, ageMin, matchMin }
//
// `phase` is shared/constants.js PHASE (LOBBY between matches, round 0); `humans` counts seated humans that have not
// left, `connected` those of them online now; `ageMin` = since the room was created, `matchMin` = since the running
// match started (null in the lobby). Room codes are shown as they are: the path answers 404 through the reverse proxy
// (proxiedRequest), so only someone with docker access on the host reads them (user decision 2026-10-09).
// Nothing is kept or logged here.

import { PHASE } from '../shared/constants.js';

const minutes = (ms) => (Number.isFinite(ms) && ms >= 0 ? Math.floor(ms / 60_000) : null);

/** The status row of one lobby room. */
export function roomRow(room, now) {
  const m = room.match;
  let humans = 0, connected = 0, bots = 0;
  for (const s of room.seats) {
    if (!s || s.left) continue;
    if (s.isBot) { bots++; continue; }
    humans++;
    if (s.connected) connected++;
  }
  return {
    code: room.code,
    mode: room.mode,
    difficulty: room.difficulty,
    phase: m ? (m.phase ?? null) : PHASE.LOBBY,
    round: m ? (m.round ?? 0) : 0,
    stageId: m?.stageId ?? null,
    bossId: m?.bossId ?? null,
    humans,
    connected,
    bots,
    spectators: room.spectators.length,
    ageMin: minutes(now - room.createdAt),
    matchMin: m && typeof m.sched?.now === 'function' && Number.isFinite(m.startedAt) ? minutes(m.sched.now() - m.startedAt) : null,
  };
}

/** Every room of the lobby, running matches first, then by round (highest first). */
export function roomList(lobby) {
  const now = lobby.now();
  return [...lobby.rooms.values()].map((r) => roomRow(r, now))
    .sort((a, b) => (b.phase !== PHASE.LOBBY) - (a.phase !== PHASE.LOBBY) || b.round - a.round);
}
