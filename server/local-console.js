// Local patch, server side: 콘솔 모드 (console mode) — the in-game console of a solo room that turned it on before its
// match (room.setConsole, server/local-patch.js), and the same console in local debug mode for any room (the former
// debug panel, maintainer decision 2026-11-15). One door for every command: consoleIntent below. The page is
// public/js/ui/consolePanel.js; the rules and their reasons are docs/rules/ui.md 「콘솔 모드」.
//
// Who may send con.*:
//   - a human seat of a console match (Match.console, set by local-patch.js onMatchCreate from the room: solo rooms only,
//     fixed for the match) — on every server, deployed ones too (maintainer decision 2026-11-15)
//   - any human seat while the server runs in local debug mode (debugMode below: SP_DEBUG_PAGE=1 or a valid
//     SP_DEBUG_FUNDS, never NODE_ENV=production — the Docker image sets it, so a deployed server is never in it)
//   Anything else is refused as BAD_MSG: the server never trusts the page's panel.
//
// m.private.console (privateView wrapper, installed at import) for those seats only — the page renders the panel when it
// is present: { console, fundsPin, pinValue, candidates, enemies, boss, rounds, layers, layersEdited, layerCap, note }
//   console      true in a console match (false: local debug mode in another room)
//   candidates   the 自选 picks the panel offers (debugCandidates)
//   enemies      the extra enemies queued for the next battle (con.addEnemy)
//   boss         { round, hiddenRound, at, bossId, hiddenBossId, bosses, hiddenBosses } — the leader rounds and leaders
//   rounds       { last, sp: [rounds of a 机变 draft] } — the rounds con.jumpRound may go to are 1..last
//   layers       the player's bond layers; layersEdited / layersBase: con.setLayers changed them since the last
//                con.resetLayers, and what the reset puts back (the panel marks the rows that differ)
//   note         { seq, kind, round } the last time the match went back to a prep instead of ending (kind: 'cleared' |
//                'hiddenCleared' | 'defeat' | 'eliminated'): the page shows its notice once per seq
// m.public.console = true in a console match (main.js keeps no record of it; the HUD shows no mark — the panel is the sign).
//
// Commands (shared/local.js C2S, validated there; prep-only ones say so):
//   con.funds { on }        the sender's funds pinned to pinValue (SP_DEBUG_FUNDS, else 99) or back to real funds
//   con.addChess { chessId, golden? }                     any normal chess (hidden ones too) into the hand, prep only
//   con.addDiy { charId, tier, golden?, skill?, module? } a 自选 pick of tier V / VI into the hand (debugSetPick), prep only
//   con.addItem { itemId, golden? }  an item (equipment, the 规程 装备区 for its kind) through PlayerState.acquireItem,
//                           outside the shared equipment stock (noPool, like the trait-fixed equipment), prep only
//   con.addEnemy { enemyKey, count? } / con.clearEnemies { enemyKey? }   extra enemies in the sender's next battle (the
//                           clear drops all of them, or those of one enemy), prep only
//   con.jumpRound { round } the match goes to that round's start now (Match.startRound, forward or back; 1..rounds.last),
//                           prep only. What the player holds stays; the boss state of a leader round is reset.
//   con.presetBoard { bondId?, layers }   every alive seat's board rebuilt now around a bond (local-debug-board.js), prep only
//   con.setBoss { final?, hidden? }       the leader of the Final Assault / the Hidden Core from the next leader prep on
//   con.setLayers { bondId, layers } / con.resetLayers {}   one bond's layers set (0..the cap); the reset puts back what
//                           the player had before its first con.setLayers
//   con.end { to: 'lobby' | 'result', victory? }   the match ends now. A console match: reason 'consoleLobby' (the page
//                           goes back to the room) or 'console' (the settlement screen, shown only); a debug-mode match
//                           without the console: 'result' is the old debug finish (won / lost by `victory`).
//
// A console match never ends by its rules (maintainer decision 2026-11-15): a leader cleared or the team LP lost in a
// leader round goes back to that round's prep (Match.finish wrapped), a player whose LP runs out in a normal round is not
// eliminated — LP back to the start value, the same round again (PlayerState.eliminate and Match.afterSettle wrapped,
// the elimination toast and ticker muted). The cleared Final Assault still opens the Hidden Core when it qualifies. Only
// con.end, a departure (Match._quit) or an error end it. Its result carries no record: no [stats] line
// (local-patch.js onMatchEnd), and the page keeps no statistics, achievements or match history of it (main.js).
// The successful commands are logged on the match (m.consoleLog, CONSOLE_LOG_MAX entries) and stored with a feedback
// report sent from it (local-feedback.js).

import { ERR, PHASE, BOND_LAYER_CAP } from '../shared/constants.js';
import { PlayerState } from './match/PlayerState.js';
import { Match } from './match/Match.js';
import { diyRecord, diySlot, diySlotIds, isDiyModule } from '../shared/diy.js';
import { localDiyPool } from '../shared/local-diy.js';
import { checkDiyPicks } from '../shared/protocol.js';
import { strengthenedItemId } from '../shared/local.js';
import { diyGameData } from './match/player/diy.js';
import { KITTED_CHARS } from './sim/content/kits/index.js';
import { DEBUG_LAYER_LEVELS, applyDebugBoard, assignDebugBonds, bondMembers, debugBosses } from './local-debug-board.js';

const OK = Object.freeze({ ok: true });
const fail = (code, detail) => (detail ? { error: code, detail } : { error: code });

export const DEBUG_PIN_DEFAULT = 99;
export const DEBUG_ENEMY_NAME = 'DEBUG'; // the queued bounty's name in the effects list (the same in every language)
export const CONSOLE_LOG_MAX = 300;
export const CONSOLE_MSGS = Object.freeze(['con.funds', 'con.addChess', 'con.addDiy', 'con.addItem', 'con.addEnemy', 'con.clearEnemies',
  'con.jumpRound', 'con.presetBoard', 'con.setBoss', 'con.setLayers', 'con.resetLayers', 'con.end']);
const CONSOLE_SET = new Set(CONSOLE_MSGS);
/** Match.finish reasons a console match turns into a prep of the same round */
const RETRY_REASONS = new Set(['victory', 'defeat', 'eliminated']);
/** the elimination lines (settle.js) a console match never shows: nobody is eliminated there */
const MUTED_TOASTS = new Set(['你的目标生命值耗尽，已被淘汰', '同盟的目标生命值耗尽，全员被淘汰']); // i18n-ignore: settle.js's msgids, compared, never shown
const MUTED_TICKERS = new Set(['{name}博士的目标生命值已耗尽', '同盟的目标生命值已耗尽']); // i18n-ignore: settle.js's msgids, compared, never shown

// ---- local debug mode ---------------------------------------------------------------------------------------------

/** 디버그용 재화 고정: SP_DEBUG_FUNDS=<0..999> pins every human player's funds (local debug only), else null. */
export function debugFunds(env = process.env) {
  const raw = env.SP_DEBUG_FUNDS;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 999 ? n : null;
}

/** Whether this server runs in local debug mode (see the header). */
export function debugMode(env = process.env) {
  if (env.NODE_ENV === 'production') return false;
  return env.SP_DEBUG_PAGE === '1' || debugFunds(env) != null;
}

/** Whether `ps` may use the console in its match: a human seat of a console match, or any in local debug mode. */
export function consoleAllowed(m, ps, env = process.env) {
  if (!m || !ps || ps.isBot || ps.spectator) return false;
  return m.console === true || debugMode(env);
}

// ---- funds pin (con.funds, SP_DEBUG_FUNDS) ------------------------------------------------------------------------
// `ps.debugFundsPin` = the pinned value, null = real funds, undefined = the env default (FIXED_FUNDS). The accessor is
// installed at startup when SP_DEBUG_FUNDS is set in local debug mode, else on the first con.funds — so a server where
// nobody pins keeps upstream's plain `funds` field.

const FIXED_FUNDS = debugMode() ? debugFunds() : null;
let fundsPinInstalled = false;
/** Whether the funds accessor is installed (local-patch.js roundGold reads the gross credit while pinned). */
export const fundsPinActive = () => fundsPinInstalled;
/** The value the player's funds are pinned to, or null. */
export const fundsPinOf = (ps) => (ps.isBot ? null : ps.debugFundsPin === undefined ? FIXED_FUNDS : ps.debugFundsPin);
function installFundsPin() {
  if (fundsPinInstalled) return;
  fundsPinInstalled = true;
  Object.defineProperty(PlayerState.prototype, 'funds', {
    configurable: true,
    get() { const pin = fundsPinOf(this); return pin == null ? (this._funds ?? 0) : pin; },
    set(v) { this._funds = v; },
  });
}
if (FIXED_FUNDS != null) {
  console.warn(`[local-console] SP_DEBUG_FUNDS: human players' funds fixed at ${FIXED_FUNDS} (debug only)`);
  installFundsPin();
}

// ---- 自选 picks (con.addDiy) ----------------------------------------------------------------------------------------

const MODULE_NONE = 'none';
const formKey = (tier, elite) => (elite ? `2/60/7/${tier === 6 ? 3 : 1}` : '2/1/4/0');

/**
 * The 自选 candidates offered by the panel: [{ charId, name, bonds, tiers: { 5|6: { skills: [{ index, name }], modules: [{ id,
 * name, type }] } } }] — skills of the normal form, modules of the tier's elite form (plus 'none', isDiyModule only);
 * `bonds` = the pick's bond ids (diy.operators, the panel's bond filter).
 */
export function debugCandidates(gd) {
  const b = gd?.raw?.backups;
  const pool = Array.isArray(b?.diy?.ownedPool) ? localDiyPool(b.diy.ownedPool) : []; // the picks offered, in the picker's order (shared/local-diy.js)
  return pool.map((charId) => {
    const u = b.units?.[charId];
    if (!u || !u.forms) return null;
    const tiers = {};
    for (const t of [5, 6]) {
      const nf = u.forms[formKey(t, false)], ef = u.forms[formKey(t, true)];
      if (!nf) continue;
      tiers[t] = {
        skills: (nf.skills || []).map((sk, i) => ({ index: i, name: sk?.name || '' })),
        modules: [{ id: MODULE_NONE, name: '', type: '' }, ...(ef?.modules || []).filter(isDiyModule).map((m) => ({ id: m.uniEquipId, name: m.name || m.uniEquipId, type: m.typeName || '' }))],
      };
    }
    const bonds = b.diy.operators?.[charId]?.bonds;
    return { charId, name: u.name || charId, bonds: Array.isArray(bonds) ? bonds : [], tiers };
  }).filter(Boolean);
}

/**
 * The slot base id a con.addDiy of `charId` at `tier` uses for player `ps`, or null: the tier's slot already holding that
 * operator, else a free slot of the tier, else one whose operator (the room's 自选编队 pick, say) has no piece in hand /
 * temp / board.
 */
export function debugDiySlot(ps, charId, tier) {
  const data = ps.m.gd.raw;
  const ids = diySlotIds(data).filter((id) => data.backups?.diy?.slots?.[id]?.tier === tier);
  const cur = ps.diy || {};
  const unused = (id) => { const s = diySlot(id, data); return !ps._chessLocations().some((l) => l.piece.id === s.baseId || l.piece.id === s.goldenId); };
  return ids.find((id) => cur[id]?.charId === charId) || ids.find((id) => !cur[id]) || ids.find(unused) || null;
}

/**
 * Put `pick` into DIY slot `slotId` of player `ps` mid-match (con.addDiy): the pick checked on its own (checkDiyPicks of
 * that one slot: kit, skill, module, a prototype's locked selection), the slot's two records composed and the player's
 * data view rebuilt like PlayerState.setDiy does — the other slots keep their picks and records. The roster rule "an
 * owned operator fills one slot" is not applied: the same operator may sit at both tiers (under PlayerState.setDiy that
 * rule dropped the new slot and the gain failed as HAND_FULL). Returns a restore function, or null when refused.
 */
export function debugSetPick(ps, slotId, pick) {
  const data = ps.m.gd.raw;
  const res = checkDiyPicks({ [slotId]: pick }, { data, kitted: KITTED_CHARS });
  const kept = res && 'ok' in res ? res.picks[slotId] : null;
  const slot = diySlot(slotId, data);
  if (!kept || !slot) return null;
  let normal, golden;
  try { normal = diyRecord(slotId, kept, { elite: false, data }); golden = diyRecord(slotId, kept, { elite: true, data }); } catch { return null; }
  if (!normal || !golden) return null;
  const before = { diy: ps.diy, records: ps._diyRecords, gd: ps.gd };
  const records = new Map(ps._diyRecords || []);
  records.set(slot.baseId, Object.freeze(normal));
  records.set(slot.goldenId, Object.freeze(golden));
  ps.diy = Object.freeze({ ...(ps.diy || {}), [slot.baseId]: Object.freeze({ charId: kept.charId, skillIndex: kept.skillIndex, uniEquipId: kept.uniEquipId ?? null }) });
  ps._diyRecords = records;
  ps.gd = diyGameData(ps.m.gd, records);
  return () => { ps.diy = before.diy; ps._diyRecords = before.records; ps.gd = before.gd; };
}

// ---- the view -----------------------------------------------------------------------------------------------------

/** The last round con.jumpRound may go to: the Hidden Core's when the match has one, else the Final Assault's. */
export function lastConsoleRound(m) {
  const gd = m.gd;
  return gd.hiddenRound && m.hiddenBossId ? Math.max(gd.hiddenRound, gd.bossRound) : gd.bossRound;
}

const hiddenBosses = (gd) => gd.bossWeights(true).map(([id]) => id);
const layerCapOf = (gd) => Math.min(BOND_LAYER_CAP, gd.layerCap ?? BOND_LAYER_CAP);

/** m.private.console of a human player who may use the console (see the header), else null. */
export function consoleView(ps, env = process.env) {
  const m = ps?.m;
  if (!consoleAllowed(m, ps, env)) return null;
  if (!m.debugCandidates) m.debugCandidates = debugCandidates(m.gd);
  const gd = m.gd;
  const enemies = ps.bounties.filter((b) => b.debugEnemies).map((b) => ({ enemyKey: b.card.enemyKey, count: b.card.count }));
  const boss = {
    round: gd.bossRound, hiddenRound: m.hiddenBossId ? gd.hiddenRound ?? null : null, at: m.round,
    bossId: m.bossId ?? null, hiddenBossId: m.hiddenBossId ?? null, bosses: debugBosses(gd), hiddenBosses: m.hiddenBossId ? hiddenBosses(gd) : [],
  };
  return {
    console: m.console === true, fundsPin: fundsPinOf(ps) != null, pinValue: FIXED_FUNDS ?? DEBUG_PIN_DEFAULT,
    candidates: m.debugCandidates, enemies, boss, rounds: { last: lastConsoleRound(m), sp: gd.spRounds() },
    layers: { ...(ps.layers || {}) }, layersEdited: !!ps.consoleLayersBase, layersBase: ps.consoleLayersBase ? { ...ps.consoleLayersBase } : null,
    layerCap: layerCapOf(gd),
    note: m.consoleNote ?? null,
  };
}

// ---- the commands -------------------------------------------------------------------------------------------------

/** The bots of a preset board only Ready in their later preps (they keep the board as placed). */
let botLockInstalled = false;
function installBotLock() {
  if (botLockInstalled) return;
  botLockInstalled = true;
  const upstreamBotPrep = Match.prototype.scheduleBotPrep;
  Match.prototype.scheduleBotPrep = function scheduleBotPrep(ps, i = 0) {
    if (!ps.debugLocked) return upstreamBotPrep.call(this, ps, i);
    const round = this.round;
    this.later(0, () => {
      if (this.phase !== PHASE.PREP || this.round !== round || !ps.alive || ps.ready || !ps.botControlled) return;
      this.autoPickPersonalChoice(ps, 'random');
      ps.resolveTemp();
      ps.setReady(true);
    });
  };
}

/** Clear a leader round's state before the match starts a round again (con.jumpRound, a console retry). */
function resetBossState(m, r) {
  m.teamLp = m.gd.lpShared ? m.teamLp : null;
  m.bossPool = null;
  m._finalEnding = null;
  m.overtimeOver = false;
  m.overtimeAt = 0;
  m.hiddenReached = !!m.gd.hiddenRound && r === m.gd.hiddenRound && r !== m.gd.bossRound;
  for (const ps of m.order) ps.lpAtFinal = null;
}

function logCommand(m, msg) {
  if (!Array.isArray(m.consoleLog)) m.consoleLog = [];
  const { t, ...fields } = msg;
  m.consoleLog.push({ r: m.round, t: t.slice(4), ...fields });
  if (m.consoleLog.length > CONSOLE_LOG_MAX) m.consoleLog.splice(0, m.consoleLog.length - CONSOLE_LOG_MAX);
}

/**
 * A console command of a match player. `env` decides local debug mode (tests pass their own).
 * @returns {{ ok: true } | { error: string, detail?: string }}
 */
export function consoleIntent(m, playerId, msg, env = process.env) {
  const ps = m && m.players && m.players.get(playerId);
  if (!m || !(m.console === true || debugMode(env))) return fail(ERR.BAD_MSG, 'console is off');
  if (!ps || ps.isBot || ps.left || ps.spectator) return fail(ERR.NOT_IN_ROOM);
  if (m.disposed || m.ended) return fail(ERR.WRONG_PHASE);
  if (!CONSOLE_SET.has(msg?.t)) return fail(ERR.BAD_MSG);
  const res = run(m, ps, msg);
  if (res === OK) { logCommand(m, msg); ps.dirty?.(); }
  return res;
}

function run(m, ps, msg) {
  const gd = m.gd;
  const gate = () => ps._gate({ allowWhenReady: true });
  switch (msg.t) {
    case 'con.funds': {
      installFundsPin();
      if (Object.hasOwn(ps, 'funds')) { const v = ps.funds; delete ps.funds; ps._funds = v; } // created before the accessor
      if (msg.on) ps.debugFundsPin = FIXED_FUNDS ?? DEBUG_PIN_DEFAULT;
      else { ps._funds = ps.funds; ps.debugFundsPin = null; }
      return OK;
    }
    case 'con.end': {
      const to = msg.to === 'lobby' ? 'lobby' : 'result';
      if (!m.console && to === 'result') {
        m.finish({ victory: msg.victory === true, reason: msg.victory === true ? 'victory' : 'defeat' });
        return OK;
      }
      m._consoleEnding = true;
      m.finish({ victory: !!m.consoleCleared, reason: to === 'lobby' ? 'consoleLobby' : 'console' });
      return OK;
    }
    case 'con.addDiy': {
      const tier = msg.tier;
      const cand = debugCandidates(gd).find((c) => c.charId === msg.charId);
      if (!cand || !cand.tiers[tier]) return fail(ERR.BAD_TARGET, 'not a DIY candidate');
      const g = gate(); if (g) return g;
      const slotId = debugDiySlot(ps, msg.charId, tier);
      if (!slotId) {
        const held = Object.entries(ps.diy || {}).filter(([id]) => gd.raw.backups.diy.slots?.[id]?.tier === tier)
          .map(([, p]) => gd.raw.backups.units?.[p.charId]?.name || p.charId);
        return fail(ERR.BAD_TARGET, `both 自选 slots of tier ${tier} hold operators with pieces (${held.join(', ')}): sell them first`); // i18n-ignore: parsed by consoleLists.js diySlotsFullOf, which toasts the translated sentence
      }
      const prev = ps.diy?.[slotId]?.charId === msg.charId ? ps.diy[slotId] : null;
      const skillIndex = msg.skill ?? prev?.skillIndex ?? 0;
      if (!cand.tiers[tier].skills.some((x) => x.index === skillIndex)) return fail(ERR.BAD_TARGET, `skill ${skillIndex} not available`);
      const mod = msg.module ?? (prev?.uniEquipId ?? MODULE_NONE);
      if (!cand.tiers[tier].modules.some((x) => x.id === mod)) return fail(ERR.BAD_TARGET, `module ${mod} not available`);
      const slot = gd.raw.backups.diy.slots[slotId];
      const chessId = msg.golden ? slot.goldenId : slotId;
      if (!ps.hand.includes(null) && !ps.completesChessMerge(chessId)) return fail(ERR.HAND_FULL);
      const restore = debugSetPick(ps, slotId, { charId: msg.charId, skillIndex, uniEquipId: mod === MODULE_NONE ? null : mod });
      if (!restore) return fail(ERR.BAD_TARGET, 'pick refused');
      if (!ps.acquireChess(chessId, { source: 'grant', fromPool: false })) { restore(); return fail(ERR.HAND_FULL); }
      return OK;
    }
    case 'con.addChess': {
      const rec = ps.gd.chess(msg.chessId);
      if (!rec || rec.isGolden || rec.isDiy || !Number.isInteger(rec.tier)) return fail(ERR.BAD_TARGET, 'not a normal chess id');
      const g = gate(); if (g) return g;
      const chessId = msg.golden ? ps.gd.goldenIdOf(msg.chessId) : msg.chessId;
      if (!chessId || !ps.gd.chess(chessId)) return fail(ERR.BAD_TARGET, 'no elite form');
      if (!ps.hand.includes(null) && !ps.completesChessMerge(chessId)) return fail(ERR.HAND_FULL);
      if (!ps.acquireChess(chessId, { source: 'grant', fromPool: false })) return fail(ERR.HAND_FULL);
      return OK;
    }
    case 'con.addItem': {
      const rec = gd.item(msg.itemId);
      if (!rec || rec.isGolden) return fail(ERR.BAD_TARGET, 'not a normal item id');
      const g = gate(); if (g) return g;
      const gid = msg.golden ? strengthenedItemId(rec) : msg.itemId;
      if (!gid || !gd.item(gid)) return fail(ERR.BAD_TARGET, 'no strengthened form');
      if (ps.freeZoneSlot('item') < 0 && !ps.completesItemMerge(gid)) return fail(ERR.HAND_FULL);
      if (!ps.acquireItem(gid, { source: 'grant', noPool: true })) return fail(ERR.HAND_FULL);
      return OK;
    }
    case 'con.addEnemy': {
      const e = gd.enemy(msg.enemyKey);
      if (!e || e.tokenOnly) return fail(ERR.BAD_TARGET, 'not a spawnable enemy');
      const g = gate(); if (g) return g;
      const id = m.addBounty(ps, { name: DEBUG_ENEMY_NAME, desc: '', coin: 0, payout: 'kill', rounds: 1, enemyKey: msg.enemyKey, count: msg.count ?? 1 });
      const b = id && ps.bounties.find((x) => x.id === id);
      if (!b) return fail(ERR.BAD_TARGET, 'not a spawnable enemy');
      b.debugEnemies = true;
      return OK;
    }
    case 'con.clearEnemies': {
      const g = gate(); if (g) return g;
      ps.bounties = ps.bounties.filter((b) => !b.debugEnemies || (msg.enemyKey != null && b.card.enemyKey !== msg.enemyKey));
      return OK;
    }
    case 'con.jumpRound': {
      const g = gate(); if (g) return g;
      const r = msg.round;
      if (!(r >= 1 && r <= lastConsoleRound(m))) return fail(ERR.BAD_TARGET, 'no such round');
      resetBossState(m, r);
      m.startRound(r);
      return OK;
    }
    case 'con.presetBoard': {
      const g = gate(); if (g) return g;
      if (msg.bondId != null && !bondMembers(gd, msg.bondId).length) return fail(ERR.BAD_TARGET, 'no chess of that bond');
      const layers = DEBUG_LAYER_LEVELS.includes(msg.layers) ? msg.layers : 'normal';
      const bonds = assignDebugBonds(m, ps.playerId, msg.bondId ?? null);
      installBotLock();
      for (const p of m.alivePlayers()) {
        const bondId = bonds.get(p.playerId);
        if (!bondId) continue;
        try { applyDebugBoard(m, p, bondId, layers); } catch (e) { m.reportError(`console preset ${p.playerId}`, e); continue; }
        if (p.isBot) {
          // its prep under way stops (prep.js scheduleBotPrep: a newer token invalidates the running job); it only Readies
          p.debugLocked = true;
          p._botPrepToken = (p._botPrepToken || 0) + 1;
          if (m.phase === PHASE.PREP && !p.ready) m.scheduleBotPrep(p);
        }
        p.dirty();
      }
      m.markPublic();
      return OK;
    }
    case 'con.setBoss': {
      if (msg.final == null && msg.hidden == null) return fail(ERR.BAD_MSG, 'no leader');
      if (msg.final != null && !debugBosses(gd).includes(msg.final)) return fail(ERR.BAD_TARGET, 'not a leader of this mode');
      if (msg.hidden != null && !(m.hiddenBossId && hiddenBosses(gd).includes(msg.hidden))) return fail(ERR.BAD_TARGET, 'not a hidden leader of this mode');
      if (msg.final != null) m.bossId = msg.final;
      if (msg.hidden != null) m.hiddenBossId = msg.hidden;
      // the leader prep under way plans its fields again (the preview shows the new leader)
      const leaderRound = m.round === gd.bossRound || m.round === gd.hiddenRound;
      if (leaderRound && (m.phase === PHASE.PREP || m.phase === PHASE.ROUND_START) && m.bossWaves) {
        m._planBossWaves();
        for (const p of m.alivePlayers()) p.recompute();
      }
      m.markPublic();
      return OK;
    }
    case 'con.setLayers': {
      const g = gate(); if (g) return g;
      if (!gd.bond(msg.bondId)) return fail(ERR.BAD_TARGET, 'no such bond');
      // 调和 协防干员 独行 绝技 (bonds.json noStack): the game keeps no layers for them, the panel offers no stepper
      if (gd.bond(msg.bondId).noStack) return fail(ERR.BAD_TARGET, 'bond without layers');
      const n = Math.min(layerCapOf(gd), Math.max(0, Math.trunc(msg.layers)));
      if (!ps.consoleLayersBase) ps.consoleLayersBase = { ...(ps.layers || {}) };
      const next = { ...(ps.layers || {}) };
      if (n > 0) next[msg.bondId] = n; else delete next[msg.bondId];
      ps.layers = next;
      ps.recompute();
      return OK;
    }
    case 'con.resetLayers': {
      const g = gate(); if (g) return g;
      if (ps.consoleLayersBase) { ps.layers = ps.consoleLayersBase; ps.consoleLayersBase = null; ps.recompute(); }
      return OK;
    }
    default: return fail(ERR.BAD_MSG);
  }
}

/** Lobby side: a con.* message of `session` (server/local-patch.js onMessage). */
export function consoleMessage(lobby, session, msg) {
  const room = lobby.roomOf(session);
  if (!room) return fail(ERR.NOT_IN_ROOM);
  if (!room.match) return fail(ERR.WRONG_PHASE, 'no running match');
  const res = consoleIntent(room.match, session.playerId, msg);
  try { room.match?.flush?.(); } catch { /* the next push carries it */ }
  return res;
}

export const isConsoleMessage = (t) => CONSOLE_SET.has(t);

// ---- the console match's flow (installed at import; each wrapper acts on console matches only) ----------------------

function note(m, kind) {
  m.consoleNote = { seq: (Number(m.consoleNote?.seq) || 0) + 1, kind, round: m.round };
  for (const ps of m.order) if (!ps.isBot) ps.dirty?.();
}

/** A console match that would end: back to the same round's prep (LP restored where it ran out). */
function consoleRetry(m, o) {
  const kind = o.reason === 'victory' ? (o.hiddenCleared ? 'hiddenCleared' : 'cleared') : o.reason === 'eliminated' ? 'eliminated' : 'defeat';
  if (o.victory) m.consoleCleared = true;
  for (const ps of m.order) {
    if (ps.isBot || ps._consoleQuit) continue;
    if (!(ps.lp > 0)) ps.lp = m.gd.startLp(ps.bandId);
  }
  const r = m.round;
  resetBossState(m, r);
  m.startRound(r);
  note(m, kind);
}

const someHumanIn = (m) => m.order.some((p) => !p.isBot && !p.left && !p._consoleQuit && p.alive);

const upstreamFinish = Match.prototype.finish;
Match.prototype.finish = function finish(o = {}) {
  if (this.console === true && !this.ended && !this.disposed) {
    if (!this._consoleEnding && RETRY_REASONS.has(o.reason) && someHumanIn(this)) {
      try { consoleRetry(this, o); return; } catch (e) { this.reportError('console retry', e); }
    }
    // the summary the lobby keeps (onEnd → room.lastSummary): marked, with the console log, so no [stats] line is written
    // and a feedback report from the settlement screen carries the log
    const onEnd = this.onEndFn;
    if (typeof onEnd === 'function' && !onEnd.consoleWrapped) {
      const wrapped = (summary) => onEnd({ ...summary, console: { log: Array.isArray(this.consoleLog) ? this.consoleLog : [] } });
      wrapped.consoleWrapped = true;
      this.onEndFn = wrapped;
    }
  }
  return upstreamFinish.call(this, o);
};

// a player whose LP ran out stays in a console match: LP back to the start value; the round is played again (afterSettle)
const upstreamEliminate = PlayerState.prototype.eliminate;
PlayerState.prototype.eliminate = function eliminate(round) {
  const ps = /** @type {any} */ (this);
  const m = ps.m;
  if (m && m.console === true && !ps.isBot && !ps.left && !ps._consoleQuit && !m._consoleEnding) {
    ps.lp = m.gd.startLp(ps.bandId);
    m._consoleRevived = true;
    ps.dirty?.();
    return;
  }
  return upstreamEliminate.call(this, round);
};

const upstreamQuit = Match.prototype._quit;
Match.prototype._quit = function _quit(ps) {
  if (this.console === true && ps) ps._consoleQuit = true;
  return upstreamQuit.call(this, ps);
};

const upstreamAfterSettle = Match.prototype.afterSettle;
Match.prototype.afterSettle = function afterSettle() {
  if (this.console === true && this._consoleRevived && someHumanIn(this)) {
    this._consoleRevived = false;
    this.startRound(this.round);
    note(this, 'eliminated');
    return;
  }
  return upstreamAfterSettle.call(this);
};

const upstreamToast = Match.prototype.toast;
Match.prototype.toast = function toast(ps, kind, text) {
  if (this.console === true && typeof text === 'string' && MUTED_TOASTS.has(text)) return;
  return upstreamToast.call(this, ps, kind, text);
};

const upstreamTickerText = Match.prototype.tickerText;
Match.prototype.tickerText = function tickerText(text, priority) {
  if (this.console === true && MUTED_TICKERS.has(typeof text === 'string' ? text : text?.msgid)) return;
  return upstreamTickerText.call(this, text, priority);
};

const upstreamPublicView = Match.prototype.publicView;
Match.prototype.publicView = function publicView() {
  const v = upstreamPublicView.call(this);
  if (v && this.console === true) v.console = true;
  return v;
};

const upstreamPrivateView = PlayerState.prototype.privateView;
PlayerState.prototype.privateView = function privateView() {
  const v = upstreamPrivateView.call(this);
  try { if (v) { const c = consoleView(this); if (c) v.console = c; } } catch { /* display only */ }
  return v;
};

if (debugMode()) console.warn('[local-console] local debug mode: the in-game console is open in every room');
