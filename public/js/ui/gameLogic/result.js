// ui/gameLogic/result.js — end-of-match result normalisation. Re-exported from ../gameLogic.js.

import { int, isObj, sortedPlayers } from './shared.js';
import { t } from '../../../../shared/i18n.js';


// ---- result -----------------------------------------------------------------------------------------------------------

const num0 = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
/** A boss round's pool ({ maxHp, dealt }) or null. */
const poolOf = (p) => (isObj(p) && Number.isFinite(p.maxHp) && p.maxHp > 0 ? { maxHp: p.maxHp, dealt: Math.min(p.maxHp, num0(p.dealt)) } : null);

/**
 * Normalise an m.result payload (free-form; see screens/result.js header for the expected shape).
 * @param {any} res
 * @param {any} pub last m.public (fallbacks)
 */
export function normalizeResult(res, pub) {
  const r = isObj(res) ? res : {};
  const pubPlayers = new Map(sortedPlayers(pub).map((p) => [p.playerId, p]));
  // From the 最终攻势 on, every survivor's LP is one merged pool (m.public teamLp) and leaks / overtime only drain
  // that pool: a survivor's remaining LP is the pool, not its own LP from before the Final Assault.
  const teamLp = Number.isFinite(r.teamLp) ? r.teamLp : Number.isFinite(pub?.teamLp) ? pub.teamLp : null;
  const players = (Array.isArray(r.players) ? r.players : []).filter(isObj).map((p) => {
    const pp = pubPlayers.get(p.playerId) || {};
    const title = typeof p.title === 'string' ? { id: p.title } : isObj(p.title) ? p.title : null;
    const alive = p.alive ?? pp.alive ?? true;
    const ownLp = Number.isFinite(p.lp) ? p.lp : (Number.isFinite(pp.lp) ? pp.lp : null);
    return {
      playerId: p.playerId,
      seat: int(p.seat, int(pp.seat, 0)),
      name: p.name || pp.name || t('博士'),
      isBot: !!(p.isBot ?? pp.isBot),
      alive,
      lp: teamLp != null ? (alive === false ? 0 : Math.max(0, teamLp)) : ownLp,
      lpShared: teamLp != null,
      bandId: p.bandId ?? pp.bandId ?? null,
      roundsPassed: Number.isFinite(p.roundsPassed) ? p.roundsPassed : (Number.isFinite(r.roundsPassed) ? r.roundsPassed : 0),
      title,
      lineup: (Array.isArray(p.lineup) ? p.lineup : Array.isArray(p.board) ? p.board : []).filter(isObj).slice(0, 12),
      bonds: (Array.isArray(p.bonds) ? p.bonds : Array.isArray(pp.bonds) ? pp.bonds : []).filter(isObj),
      stats: isObj(p.stats) ? p.stats : {},
      trophies: Number.isFinite(p.trophies) ? p.trophies : 0,
      reward: Number.isFinite(p.reward) ? p.reward : 0,
      left: !!p.left,
      // the damage / 联防 tabs (gameLogic/resultCharts.js): absent on older payloads and stored records
      units: (Array.isArray(p.units) ? p.units : []).filter((u) => isObj(u) && typeof u.id === 'string').map((u) => ({
        ...u, dmg: num0(u.dmg), final: num0(u.final), hidden: num0(u.hidden), assist: isObj(u.assist) ? u.assist : null,
      })),
      unite: isObj(p.unite) ? { sent: num0(p.unite.sent), through: num0(p.unite.through) } : null,
      faction: typeof p.faction === 'string' ? p.faction : null,
    };
  }).sort((a, b) => a.seat - b.seat);
  return {
    victory: !!r.victory,
    roundsPassed: Number.isFinite(r.roundsPassed) ? r.roundsPassed : Math.max(0, ...players.map((p) => p.roundsPassed), 0),
    lastRound: Number.isFinite(r.lastRound) ? r.lastRound : (Number.isFinite(pub?.lastRound) ? pub.lastRound : 14),
    hiddenCleared: !!r.hiddenCleared,
    // the Hidden Core (R15) was fought: only then does the result show its boss medal (m.result.hiddenReached;
    // older payloads without it: a clear implies it was reached)
    hiddenReached: typeof r.hiddenReached === 'boolean' ? (r.hiddenReached || !!r.hiddenCleared) : !!r.hiddenCleared,
    difficulty: r.difficulty || pub?.difficulty || null,
    modeId: r.modeId || pub?.modeId || null,
    bossId: r.bossId ?? pub?.bossId ?? null,
    hiddenBossId: r.hiddenBossId ?? pub?.hiddenBossId ?? null,
    durationMs: Number.isFinite(r.durationMs) ? r.durationMs : null,
    bossPools: { final: poolOf(r.bossPools?.final), hidden: poolOf(r.bossPools?.hidden) },
    uniteRounds: Number.isFinite(r.uniteRounds) ? r.uniteRounds : null,
    players,
  };
}
