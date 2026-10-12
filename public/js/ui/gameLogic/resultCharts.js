// ui/gameLogic/resultCharts.js — the result screen's damage and 联防 tabs as data (screens/resultCharts.js draws them):
// the players' colors, the per-operator ranking, the leader-pool shares, the 联防 flows. Re-exported from ../gameLogic.js.
//
// m.result players[].units (server/match/unitTally.js): { id, golden, tier, diy?, standInFor?, sold?, summon?, dmg, final,
// hidden, assist?: { leakerId: n } }; players[].unite { sent, through } (co-op); players[].faction (the chat faction);
// bossPools { final, hidden: { maxHp, dealt } | null }.
//
// Player colors: the chat faction's own color (shared/local.js CHAT_FACTIONS, as the chat shows it) for a player who
// picked one, else the default slot of the seat. Seats are taken in order, so every viewer sees the same colors (the
// owner's decision of 2026-10-12): a color closer than MIN_COLOR_DE (OKLab ΔE × 100) to one an earlier seat holds — the
// same faction, or one of the eight's six close pairs (쉐라그–에기르, 염국–라테라노, …) — falls back to a default slot; a
// default slot itself only has to clear the faction colors in use (the four defaults are a set validated together), and
// the spare violet (no faction is violet) comes when all four are too close.

import { chatFaction } from '../../../../shared/local.js';

/** Default seat colors (a categorical set validated for the dark result screen: CVD ΔE ≥ 8 between neighbours). */
export const DEFAULT_PLAYER_COLORS = Object.freeze(['#3987e5', '#d95926', '#199e70', '#c98500']);
/** After the defaults: violet clears all eight faction colors and the defaults; a light neutral last. */
export const SPARE_PLAYER_COLORS = Object.freeze(['#b05ce0', '#b8c4be']);
/** Below this OKLab distance (× 100) two player colors read as one. */
export const MIN_COLOR_DE = 15;

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function oklab(hex) {
  const n = String(hex).replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(n.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
/** OKLab distance × 100 of two #rrggbb colors. */
export function colorDistance(a, b) {
  const p = oklab(a), q = oklab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 100;
}

/**
 * Every player's chart color, in seat order.
 * @param {Array<{ playerId: string, faction?: string|null }>} players sorted by seat
 * @returns {Map<string, { color: string, source: 'faction'|'default'|'clash', faction: string|null }>}
 */
export function playerColors(players) {
  const out = new Map();
  const taken = [];
  (players || []).forEach((p, seat) => {
    const near = (hex, list) => list.length ? Math.min(...list.map((t) => colorDistance(t, hex))) : Infinity;
    const facColors = taken.filter((x) => x.source === 'faction').map((x) => x.color);
    const gap = (hex) => (taken.some((x) => x.color === hex) ? 0 : near(hex, facColors));
    const fallback = () => {
      const cands = [DEFAULT_PLAYER_COLORS[seat % DEFAULT_PLAYER_COLORS.length], ...DEFAULT_PLAYER_COLORS, ...SPARE_PLAYER_COLORS];
      return cands.find((h) => gap(h) >= MIN_COLOR_DE) || cands.reduce((a, b) => (gap(b) > gap(a) ? b : a));
    };
    const f = chatFaction(p && p.faction);
    let e;
    if (f && near(f.color, taken.map((x) => x.color)) >= MIN_COLOR_DE) e = { color: f.color, source: 'faction', faction: f.id };
    else e = { color: fallback(), source: f ? 'clash' : 'default', faction: f ? f.id : null };
    taken.push(e);
    out.set(p.playerId, e);
  });
  return out;
}

/** A unit row's leader damage for a round choice: 'sum' (both rounds), 'final' or 'hidden'. */
export const leaderOf = (u, round = 'sum') => (round === 'final' ? u.final || 0 : round === 'hidden' ? u.hidden || 0 : (u.final || 0) + (u.hidden || 0));
/** Sum of a 联防 assist map. */
export const assistSum = (u) => (u && u.assist ? Object.values(u.assist).reduce((s, n) => s + (Number(n) || 0), 0) : 0);

/** Whether a normalized result carries the per-operator numbers at all (older payloads and stored records may not). */
export const hasUnitCharts = (r) => !!(r && Array.isArray(r.players) && r.players.some((p) => Array.isArray(p.units) && p.units.length));

/**
 * The damage tab's ranking: every operator of every player, sorted by the chosen column.
 * @param {any[]} players normalized result players (units)
 * @param {{ sort?: 'total'|'leader', round?: 'sum'|'final'|'hidden' }} [o]
 * @returns {Array<{ playerId: string, unit: any, total: number, leader: number }>}
 */
export function damageRanking(players, { sort = 'leader', round = 'sum' } = {}) {
  const rows = [];
  for (const p of players || []) for (const u of p.units || []) {
    const total = u.dmg || 0, leader = leaderOf(u, round);
    if (total > 0 || leader > 0) rows.push({ playerId: p.playerId, unit: u, total, leader });
  }
  const key = sort === 'total' ? (x) => x.total : (x) => x.leader;
  return rows.sort((a, b) => key(b) - key(a) || b.total - a.total);
}

/** A player's sum over its units: 'total' damage or a round's leader damage. */
export function playerSum(p, what = 'total', round = 'sum') {
  return (p && p.units ? p.units : []).reduce((s, u) => s + (what === 'total' ? u.dmg || 0 : leaderOf(u, round)), 0);
}

/**
 * The leader pool of a round choice (m.result bossPools): { maxHp, dealt } summed for 'sum', or null when the round
 * was not fought.
 */
export function leaderPool(bossPools, round = 'sum') {
  const f = bossPools && bossPools.final, h = bossPools && bossPools.hidden;
  if (round === 'final') return f || null;
  if (round === 'hidden') return h || null;
  if (!f && !h) return null;
  return { maxHp: (f ? f.maxHp : 0) + (h ? h.maxHp : 0), dealt: (f ? f.dealt : 0) + (h ? h.dealt : 0) };
}

/**
 * The 联防 tab: who knocked out whose enemies.
 * @param {any[]} players normalized result players
 * @returns {{ helped: (helper: string, leaker: string) => number, helpedTotal: Map<string, number>,
 *   rescued: Map<string, number>, sent: Map<string, number>, through: Map<string, number>,
 *   totals: { sent: number, rescued: number, through: number }, ranking: Array<{ playerId: string, unit: any, n: number }> }}
 */
export function uniteFlows(players) {
  const pairs = new Map(); // `${helper}>${leaker}` → n
  const helpedTotal = new Map(), rescued = new Map(), sent = new Map(), through = new Map();
  const ranking = [];
  for (const p of players || []) {
    sent.set(p.playerId, Math.max(0, p.unite?.sent || 0));
    through.set(p.playerId, Math.max(0, p.unite?.through || 0));
    for (const u of p.units || []) {
      const n = assistSum(u);
      if (!n) continue;
      ranking.push({ playerId: p.playerId, unit: u, n });
      for (const [leaker, k] of Object.entries(u.assist)) {
        const v = Number(k) || 0;
        if (!v || leaker === p.playerId) continue;
        pairs.set(`${p.playerId}>${leaker}`, (pairs.get(`${p.playerId}>${leaker}`) || 0) + v);
        helpedTotal.set(p.playerId, (helpedTotal.get(p.playerId) || 0) + v);
        rescued.set(leaker, (rescued.get(leaker) || 0) + v);
      }
    }
  }
  ranking.sort((a, b) => b.n - a.n || (b.unit.dmg || 0) - (a.unit.dmg || 0));
  const sum = (m) => [...m.values()].reduce((s, n) => s + n, 0);
  return {
    helped: (helper, leaker) => pairs.get(`${helper}>${leaker}`) || 0,
    helpedTotal, rescued, sent, through,
    totals: { sent: sum(sent), rescued: sum(rescued), through: sum(through) },
    ranking,
  };
}
