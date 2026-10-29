// The debug panel's jump to the Final Assault (dbg.bossJump, server/local-patch.js debugIntent) — local debug mode
// only, never on a deployed server. From any prep before the boss round:
//   bossId       the leader of the jump (one of the mode's, gd.bossWeights), else the match's own draw
//   preset       every alive seat — the sender, other humans, the AI teammates — gets a board built around one bond:
//                its members (highest tiers first) up to the bond's highest threshold the deploy cap allows, the rest
//                by role (blockers, a medic, anti-air) and shared bonds, every operator elite, no equipment, placed by
//                the AI's layout planner on the boss field (bot.js arrange, no rehearsal). The sender's bond is
//                `bondId` (else drawn), the others draw distinct core bonds of this match. Every piece held before is
//                returned (pool copies, 自选 stock); the new ones take no copies, like dbg.addChess. The AI seats then
//                stay as placed: their later preps only Ready (`debugLocked`).
//   layers       'keep' the layers held, or put on every bond the board activates: 'normal' = the competent board of
//                R14 (docs/BALANCE.md §1.1: core bond 150, every other active bond 90), 'strong' ×1.4 (enough for
//                the Hidden Core's layer check), 'max' the cap (999)
// The match goes straight to the boss round (Match.startRound): the rounds between, their incomes, 机变 drafts and
// battles are skipped. The boards are put in the boss round's prep (Match.enterPrep wrapped in local-patch.js), where
// the deploy map is already the boss field and the layout moves are legal.

import { arrange } from './match/bot.js';
import { basePositionClass } from './match/board.js';
import { computeBonds } from './match/bondsMeta.js';
import { createRng, deriveSeed } from './sim/rng.js';
import { BOND_LAYER_CAP, layerGainRoom } from '../shared/constants.js';

export const DEBUG_LAYER_LEVELS = Object.freeze(['keep', 'normal', 'strong', 'max']);
const CORE_LAYERS = 150;  // docs/BALANCE.md §1.1, R14 core bond
const ADDON_LAYERS = 90;  // the same row, each other active bond
const STRONG = 1.4;       // tools/balance.mjs PROFILES.strong

const isHealer = (c) => !!c && (c.dmgType === 'heal' || c.attackKind === 'heal');
const isBlocker = (c) => !!c && basePositionClass(c) === 'melee' && (c.stats?.blockCnt ?? 1) > 0 && c.attackKind !== 'none' && !isHealer(c);
const hitsFly = (c) => !!c && !!c.canHitFly && !isHealer(c) && c.attackKind !== 'none';
const ROLES = Object.freeze([[isBlocker, 2], [isHealer, 1], [hitsFly, 1]]);

/** The leaders a jump may pick: the mode's boss-round draw (the custom bans applied). */
export function debugBosses(gd) {
  return gd.bossWeights(false).map(([id]) => id);
}

/** The shop chess of a bond, highest tier first (then shop order). */
export function bondMembers(gd, bondId) {
  const rec = (id) => gd.chess(id);
  return gd.visibleChess.filter((id) => (rec(id).bonds || []).includes(bondId))
    .sort((a, b) => rec(b).tier - rec(a).tier || (rec(a).shopSortId ?? 0) - (rec(b).shopSortId ?? 0) || (a < b ? -1 : 1));
}

/** The core bonds a seat may draw: on in this match (mode and draw), with members for its first threshold. */
export function debugCoreBonds(m) {
  const gd = m.gd;
  const off = new Set([...(m.disabledBonds || []), ...(m.staticInactiveBonds || []), ...gd.modeInactiveBonds]);
  return gd.bondIds.filter((b) => gd.bond(b)?.isCore && !off.has(b) && bondMembers(gd, b).length >= (gd.bond(b).thresholds?.[0] ?? 3));
}

/**
 * The base chess ids of a board around `bondId` of `size` units: the members up to the bond's highest threshold that
 * fits (all of them when fewer), then the unmet roles, then the units sharing the most bonds with the board, highest
 * tier first. No randomness: the same bond gives the same board.
 */
export function planDebugBoard(gd, bondId, size) {
  const members = bondMembers(gd, bondId);
  const fits = (gd.bond(bondId)?.thresholds || []).filter((t) => t <= size);
  const want = Math.min(members.length, fits.length ? Math.max(...fits) : size);
  const chosen = members.slice(0, want);
  const rec = (id) => gd.chess(id);
  const bondsOf = (id) => rec(id).bonds || [];
  while (chosen.length < size) {
    const held = new Set(chosen.flatMap(bondsOf));
    const unmet = ROLES.filter(([pred, k]) => chosen.filter((id) => pred(rec(id))).length < k);
    const score = (id) => 100 * unmet.filter(([pred]) => pred(rec(id))).length + 10 * bondsOf(id).filter((b) => held.has(b)).length + rec(id).tier;
    let best = null, bestScore = -Infinity;
    for (const id of gd.visibleChess) {
      if (chosen.includes(id)) continue;
      const s = score(id);
      if (s > bestScore) { best = id; bestScore = s; }
    }
    if (!best) break;
    chosen.push(best);
  }
  return chosen;
}

/** The layers of a level on the bonds `bonds` activates (`core` takes the core value), or null for 'keep'. */
export function debugLayers(gd, bonds, core, level) {
  if (level === 'keep') return null;
  const cap = Math.min(BOND_LAYER_CAP, gd.layerCap ?? BOND_LAYER_CAP);
  const out = {};
  for (const [id, b] of Object.entries(bonds)) {
    if (!b.active) continue;
    const base = id === core ? CORE_LAYERS : ADDON_LAYERS;
    const v = level === 'max' ? cap : Math.round(base * (level === 'strong' ? STRONG : 1));
    const n = layerGainRoom(0, v, cap);
    if (n > 0) out[id] = n;
  }
  return out;
}

/** Each alive seat's bond for a preset: the sender's `bondId` (else drawn), the others distinct drawn core bonds. */
export function assignDebugBonds(m, senderId, bondId = null) {
  const rng = createRng(deriveSeed(m.seed, `debug:bossJump:${m.round}`));
  const pool = rng.shuffle(debugCoreBonds(m));
  const taken = new Set(bondId ? [bondId] : []);
  const draw = () => pool.find((b) => !taken.has(b)) ?? pool[0] ?? null;
  const out = new Map();
  const alive = m.alivePlayers();
  for (const ps of [...alive.filter((p) => p.playerId === senderId), ...alive.filter((p) => p.playerId !== senderId)]) {
    const b = ps.playerId === senderId && bondId ? bondId : draw();
    if (b) taken.add(b);
    out.set(ps.playerId, b);
  }
  return out;
}

/**
 * Replace the player's pieces with a preset board around `bondId` and place it (prep of the boss round: the moves need
 * PREP). Returns the board's base ids.
 */
export function applyDebugBoard(m, ps, bondId, level) {
  const gd = m.gd;
  const held = [...ps.board.values(), ...ps.hand, ...ps.temp].filter(Boolean);
  for (const p of held) ps.returnCopies(p);
  ps.board.clear();
  ps.hand.fill(null);
  ps.temp.fill(null);
  ps._tempDue?.clear();
  const units = planDebugBoard(gd, bondId, Math.min(ps.deployCap, ps.hand.length));
  const pieces = units.map((id, i) => (ps.hand[i] = ps.newPiece('chess', gd.goldenIdOf(id) || id)));
  // the layers of the bonds the whole board activates (the pieces are still in the hand here)
  const planned = computeBonds(gd, { board: new Map(pieces.map((p, i) => [`x${i}`, p])), hand: [], layers: {}, bondCountBonus: ps.bondCountBonus || {} });
  const layers = debugLayers(gd, planned, bondId, level);
  if (layers) ps.layers = layers;
  ps.recompute();
  arrange(m, ps);
  for (const p of [...ps.board.values()]) if (p.kind === 'chess') ps.grantTokensFor(p);
  arrange(m, ps); // the summon cards granted just now
  ps.recompute();
  return units;
}

/** Layers of a level on the bonds the player's own board activates now (a jump without the preset). */
export function applyDebugLayers(m, ps, level) {
  const active = Object.entries(ps.bonds || {}).filter(([, b]) => b.active);
  const core = active.sort(([, a], [, b]) => b.count - a.count)[0]?.[0] ?? null;
  const layers = debugLayers(m.gd, ps.bonds || {}, core, level);
  if (!layers) return;
  ps.layers = { ...ps.layers, ...layers };
  ps.recompute();
}
