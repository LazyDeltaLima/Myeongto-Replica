// ui/gameLogic/phases.js — phase families, banners, the round's result box and 战斗结束 sound, countdowns. Re-exported
// from ../gameLogic.js.

import { PHASE } from '../../../../shared/constants.js';
import { bossLevelSeconds } from '../matchStatus.js';
import { clamp, int, isObj, sortedPlayers } from './shared.js';
import { normalizeSp } from './draft.js';
import { t } from '../../../../shared/i18n.js';
import { playerName } from '../../../../shared/botNames.js';
import { battleOverOf } from '../../audioOfficial.js';


// ---- phases ----------------------------------------------------------------------------------------

const COMBAT_PHASES = new Set([PHASE.COMBAT, PHASE.UNITE, PHASE.FINAL_ASSAULT, PHASE.HIDDEN_CORE]);
const PREP_PHASES = new Set([PHASE.PREP, PHASE.SP_DRAFT, PHASE.ROUND_START]);

/**
 * Which screen family a phase belongs to.
 * @param {string} phase
 * @returns {'loading'|'briefing'|'draft'|'boot'|'prep'|'combat'|'settle'|'result'}
 */
export function phaseMode(phase) {
  if (!phase) return 'loading';
  if (phase === PHASE.INFO_CHECK) return 'briefing';
  if (phase === PHASE.BAND_DRAFT) return 'draft';
  if (phase === PHASE.BATTLE_CHECK) return 'boot';
  if (phase === PHASE.RESULT) return 'result';
  if (phase === PHASE.SETTLE) return 'settle';
  if (COMBAT_PHASES.has(phase)) return 'combat';
  if (PREP_PHASES.has(phase)) return 'prep';
  return 'prep';
}

export const isCombatPhase = (phase) => COMBAT_PHASES.has(phase);
/**
 * The HUD's "你已被淘汰 · 可继续观战队友" pill of an eliminated player: outside combat only — in combat and in the SETTLE
 * after it the combat HUD (screens/game.js CombatHud, rendered for mode 'settle' too) already says it, and two
 * elimination banners never show at once.
 * @param {boolean} alive
 * @param {string|null|undefined} phase
 */
export const showDeadPill = (alive, phase) => !alive && !COMBAT_PHASES.has(phase) && phase !== PHASE.SETTLE;
export const isBossPhase = (phase) => phase === PHASE.FINAL_ASSAULT || phase === PHASE.HIDDEN_CORE;

/**
 * Banner shown when a phase starts: { title, sub?, tone } or null.
 * @param {string|null|undefined} phase
 * @param {any} pub m.public
 * @param {{ alive?: boolean, spectator?: boolean }} [viewer] the local viewer (screens/game.js): `alive` false for an
 *   eliminated player, `spectator` for a spectator seat — it has no row in m.public, so `pub` cannot tell
 */
export function phaseBanner(phase, pub, { alive = true, spectator = false } = {}) {
  const r = int(pub?.round, 0);
  switch (phase) {
    case PHASE.BATTLE_CHECK: return { title: t('协议启动'), micro: 'PROTOCOL START', tone: 'mint', sub: t('模拟即将开始'), duration: 2600 };
    // round income goes to the seats still in only (server/match/match/phases.js startRound; eliminate() zeroes funds
    // and pendingFunds): an eliminated player or a spectator seat reads 观战中, never 资金已到账 (GitHub #236, PR #237)
    case PHASE.ROUND_START: return { title: t('第 {r} 回合', { r }), micro: `ROUND ${String(r).padStart(2, '0')}`, tone: 'mint',
      sub: spectator || alive === false ? t('观战中') : t('资金已到账') };
    case PHASE.SP_DRAFT: return { title: t('机变阶段'), micro: 'CONTINGENCY', tone: 'gold', sub: t('依次选择机变') };
    // no 休整期 band: the official game opens the rest with the round-start dialog alone (回合 NN · 获得 +N, ui/phaseArt.js
    // RoundStartBanner at ROUND_START) — maintainer decision 2026-10-08, docs/LOCAL-PATCH.md 「0.2.0 병합」
    case PHASE.PREP: return null;
    // no 作战开始 band either: the official battle starts with the round bar's trans_battle (开始作战) alone — maintainer
    // report 2026-10-10 「공식은 전투 시작 시 배너가 없음」 (docs/rules/ui.md 「공식 위수협약 UI」)
    case PHASE.COMBAT: return null;
    case PHASE.UNITE: {
      const names = new Map(sortedPlayers(pub).map((p) => [p.playerId, playerName(p.name) || t('博士')]));
      const helpers = Array.isArray(pub?.unite?.helpers) ? pub.unite.helpers.map((id) => names.get(id)).filter(Boolean) : [];
      return { title: t('联防阶段'), micro: 'JOINT DEFENSE', tone: 'orange', sub: helpers.length ? t('联防：{names}', { names: helpers }) : t('完美作战的博士迎战突破防线的敌人') };
    }
    case PHASE.FINAL_ASSAULT: return { title: t('最终攻势'), micro: 'FINAL ASSAULT', tone: 'red', sub: t('击败敌方领袖') };
    case PHASE.HIDDEN_CORE: return { title: t('隐秘核心'), micro: 'HIDDEN CORE', tone: 'red', sub: t('被源石侵蚀的假想敌') };
    case PHASE.SETTLE: return null;
    default: return null;
  }
}

// ---- the own battle's end: banner and 战斗结束 sound ------------------------------------------------------------------
// One announcement per round (docs/LOCAL-PATCH.md 「0.2.0 병합」 — maintainer decision 2026-10-08: keep ours):
// screens/game.js shows the official round_result_dialog (ui/phaseArt.js BattleEndBanner) and plays its BATTLEOVER sound
// (audioOfficial.js battleOverOf) when the own normal battle's result comes in — in a solo match. In co-op with a teammate
// still in it is held until the round's battles are over (`holdsBattleEnd`): a 联防 may follow, and the official game then
// shows no banner — neither the leaker's nor the perfect players' — until the 联防 is over (the maintainer's recall,
// 2026-10-08); the client cannot tell at its own battle's end whether a teammate will leak — and the official game waits
// too: a co-op round without 联防 announces only once the teammates' battles are over (the maintainer, 2026-10-08), i.e.
// at SETTLE. What it shows is every player's LP charge of the round (m.public.roundLosses, maintainer decision 2026-10-11:
// the client's GetBattleResultStatus): the viewer charged → 目标生命值减少 N, nobody charged → 完美作战, only a teammate
// charged → panel_miss without a number (BATTLEOVER_NORMAL). Upstream's second announcement at SETTLE
// (GitHub #235, PR #112: ResultDialog + its own sound mapping) is gone; what is left of it here is the fallback for a
// round whose own result never came in — server-run combat (SP_COMBAT=server), a reconnect, a battle the client did not
// run — announced at SETTLE from what the round kept (`settleBattleEnd`), and the plain box (`roundResultBox`) a client
// without the dialog's art (no local extraction) shows instead of the banner. A spectator seat, an eliminated player and
// the boss rounds (no SETTLE) get neither [ASSUMED, as upstream].

/** How long the plain result box (ui/components.js ResultDialog) stays up, ms — inside SETTLE's 3 s (server DELAYS.SETTLE). */
export const RESULT_BOX_MS = 2800;

/**
 * What this round's own battle cost the viewer: `min(cap, leaks)`, exactly what settlement charges outside a 联防.
 * `cost` is what screens/game.js `roundLossRef` kept while the battle ran — `leaks` = counted enemies that got through
 * (the highest the round showed: the settled state reads 0 again and must not wipe it), `cap` = the per-round LP cap.
 * @param {{ leaks?: number, cap?: number } | null | undefined} cost
 * @returns {number|null} null when this round's battle was never seen (not in the round, a reconnect landing on SETTLE)
 */
export function ownRoundLoss(cost) {
  if (!cost) return null;
  const leaks = Number.isFinite(cost.leaks) ? Math.max(0, Math.trunc(cost.leaks)) : null;
  if (leaks == null) return null;
  const cap = Number.isFinite(cost.cap) && cost.cap > 0 ? Math.trunc(cost.cap) : 10; // no cap known → the official 10
  return Math.min(cap, leaks);
}

/**
 * Whether the own battle's end waits for SETTLE instead of showing when its result comes in: any battle of a co-op match
 * with another player still in — the round may go on into a 联防 (server/match/unite.js planUnite: co-op only, ≥ 1 leaker
 * and ≥ 1 perfect player alive), after which the leaker's and the helpers' banners both come. A solo match shows at once.
 * @param {{ kind?: string } | null | undefined} over audioOfficial.js battleOverOf
 * @param {any} pub m.public @param {string|null|undefined} selfId the viewer's playerId
 */
export function holdsBattleEnd(over, pub, selfId) {
  if (!over || !isObj(pub)) return false;
  if (String(pub.modeId || '').includes('single')) return false;
  return (Array.isArray(pub.players) ? pub.players : []).some((p) => isObj(p) && p.playerId !== selfId && p.alive !== false);
}

/**
 * The own battle's end announced at SETTLE (a held result, and the fallback above), in audioOfficial.js battleOverOf's
 * shape. The server's charge of this round (`losses` = m.public.roundLosses, every alive player's LP charge — a 联防's
 * redistribution included) decides when it holds the viewer: battleOverOf over all of them — the viewer charged →
 * 'miss' (REDUCE), nobody charged → 'perfect' (NOREDUCE), only another player charged → 'done' (NORMAL; maintainer
 * decision 2026-10-11, the client's GetBattleResultStatus). Else the result held at the own battle's end (`held`, as
 * is); else the round's kept count (`ownRoundLoss(cost)`) as the viewer's only loss.
 * @param {{ leaks?: number, cap?: number } | null | undefined} cost
 * @param {Record<string, number> | null} [losses] m.public.roundLosses
 * @param {string | null} [selfId] the viewer's playerId
 * @param {{ kind: string, lost: number, sfx: string } | null} [held]
 * @returns {{ kind: string, lost: number, sfx: string } | null} null: no battle seen
 */
export function settleBattleEnd(cost, losses = null, selfId = null, held = null) {
  if (!cost && !held) return null; // this round's battle never seen (not in the round, a reconnect landing on SETTLE)
  // the server's figures only when they name the viewer (`losses[me] == null` = no figure: Number(null) would read as 0)
  if (isObj(losses) && selfId != null && losses[selfId] != null && Number.isFinite(Number(losses[selfId]))) return battleOverOf(losses, selfId);
  if (held) return held;
  const lost = ownRoundLoss(cost);
  if (lost == null) return null;
  return battleOverOf({ self: lost }, 'self');
}

/**
 * The plain result box for an LP loss `loss` (a client without the round_result_dialog art): 「作战结束」 + 「全员无伤！」
 * (mint) at 0, else 「生命值减少 −N」 (red) — upstream PR #112's official words.
 * @param {number} loss
 * @returns {{ title: string, micro: string, tone: string, sub: string, duration: number }}
 */
export function roundResultBox(loss) {
  const n = Math.max(0, Math.trunc(Number(loss) || 0));
  return n === 0
    ? { title: t('作战结束'), micro: 'BATTLE OVER', tone: 'mint', sub: t('全员无伤！'), duration: RESULT_BOX_MS }
    : { title: t('作战结束'), micro: 'BATTLE OVER', tone: 'red', sub: t('生命值减少 −{n}', { n }), duration: RESULT_BOX_MS };
}

/** Label of the prep capsule ("休息一下" in the original). */
export function prepCapsuleLabel(phase) {
  if (phase === PHASE.SP_DRAFT) return t('机变阶段');
  if (phase === PHASE.ROUND_START) return t('回合开始');
  if (phase === PHASE.BATTLE_CHECK) return t('协议启动');
  if (phase === PHASE.SETTLE) return t('回合结算');
  return t('休息一下');
}

// ---- countdown -------------------------------------------------------------------------------------

/**
 * Countdown display state.
 * @param {number|null|undefined} deadline server epoch ms (0/null = untimed)
 * @param {number} now server-corrected epoch ms
 * @param {number} [total] total seconds of the phase (for the 5-bar gauge)
 * @param {number} [warnAt] seconds at/below which the digits turn orange
 * @returns {{ remain: number|null, warn: boolean, bars: number, text: string, frac: number }}
 */
export function countdownState(deadline, now, total, warnAt = 10) {
  if (!(Number.isFinite(deadline) && deadline > 0) || !Number.isFinite(now)) {
    return { remain: null, warn: false, bars: 0, text: '--', frac: 0 };
  }
  const remain = Math.max(0, Math.ceil((deadline - now) / 1000));
  const t = Number.isFinite(total) && total > 0 ? total : null;
  const frac = t ? clamp(remain / t, 0, 1) : 1;
  const bars = remain === 0 ? 0 : t ? clamp(Math.ceil(frac * 5), 0, 5) : 5;
  return { remain, warn: remain <= warnAt, bars, text: String(Math.min(999, remain)).padStart(2, '0'), frac };
}

/**
 * The official warning time of a phase's countdown (s): at or below it the bar turns orange and the countdown cue plays
 * once (client AutoChessCountDownView.SetCountDownNum — ON_ACT1AUTOCHESS_COUNTDOWN when the view enters its emergency
 * state; maintainer decision 2026-10-14). The match steps take theirs from autoChessData.enterStepList `hintTime`
 * (config.timers: INFO_CHECK 5, BAND_CHECK 15, BATTLE_CHECK 0); every other phase from constData
 * hintTime{Normal,Special,Fight,Dot}Phase, all 10.
 * @param {any} pub m.public
 * @param {any} [config] data/config.json
 * @returns {number}
 */
export function countdownWarnAt(pub, config) {
  const timers = isObj(config?.timers) ? config.timers : {};
  const num = (v) => (Number.isFinite(v) && v >= 0 ? v : null);
  switch (pub?.phase) {
    case PHASE.INFO_CHECK: return num(timers.infoCheckHint) ?? 5;
    case PHASE.BAND_DRAFT: return num(timers.bandDraftHint) ?? 15;
    case PHASE.BATTLE_CHECK: return num(timers.enterSteps?.find?.((s) => s?.step === 'BATTLE_CHECK')?.hint) ?? 0;
    default: return 10;
  }
}

/**
 * Nominal length (s) of the current timed phase from data/config.json, or null when unknown/untimed.
 * @param {any} pub m.public
 * @param {any} config data/config.json
 * @param {string|null} [myId]
 */
export function phaseTotalSeconds(pub, config, myId = null) {
  if (!isObj(pub)) return null;
  const timers = isObj(config?.timers) ? config.timers : {};
  const mode = isObj(config?.modes) ? config.modes[pub.modeId] : null;
  const num = (v) => (Number.isFinite(v) && v > 0 ? v : null);
  switch (pub.phase) {
    // the co-op briefing's guard (m.public.infoSeconds = INFO_CHECK_SECONDS, 45 s; the official step is 25 s)
    case PHASE.INFO_CHECK: return num(pub.infoSeconds) ?? 45;
    // one countdown: the current turn's (m.public.draft.turnSeconds = Match.BAND_TURN_SECONDS; user playtest #4 item 4),
    // then 编队确认's (m.public.draft.confirm.seconds)
    case PHASE.BAND_DRAFT: return num(pub.draft?.confirm?.seconds) ?? num(pub.draft?.turnSeconds) ?? num(timers.bandTurn) ?? 50;
    case PHASE.BATTLE_CHECK: return num(timers.battleCheck) ?? 3;
    case PHASE.SP_DRAFT: {
      const sp = normalizeSp(pub.sp, pub.players);
      const first = !sp || sp.pickedCount === 0;
      return first ? (num(timers.spFirst) ?? 30) : (num(timers.spTurn) ?? 16);
    }
    // a custom match: the prep's own length (m.public.prepSeconds) and the round's source round (srcRound) in the config
    case PHASE.PREP: return num(pub.prepSeconds) ?? num(mode?.rounds?.[String(pub.srcRound ?? pub.round)]?.prepTime);
    case PHASE.COMBAT:
    case PHASE.UNITE: return num(mode?.rounds?.[String(pub.srcRound ?? pub.round)]?.combatTimeLimit);
    // 最终攻势 / 隐秘核心: m.public.deadline is the level's 120 s countdown (maxPlayTime; the battle goes on past it)
    case PHASE.FINAL_ASSAULT:
    case PHASE.HIDDEN_CORE: return bossLevelSeconds(pub, config);
    default: return null;
  }
}
