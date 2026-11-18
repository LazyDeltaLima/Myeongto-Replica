// Chrome shared by every in-match screen: the step header of the pre-game screens (exit with the ping under it — ExitTile,
// also the waiting room's — + difficulty | "1/2 确认本局信息" | countdown) and the exit flow (confirm with 暂离 / 放弃, AI 托管 overlay).
//
// 暂离 (co-op): turns on AI 托管 (g.autoplay on) so the seat keeps playing; the overlay's 返回模拟 turns it
// off. 放弃模拟: g.leave then room.leave (the platform treats it as a quit), back to the lobby. 重新开始 (from the first
// round on, any 规则 mode — maintainer decisions 2026-10-31): a single human restarts at once, co-op opens the vote
// (发起重新开始投票; ui/restartVote.js, server/match/match/restart.js).

import { useState } from '../../vendor/hooks.module.js';
import { html, Button, Modal, PingPill, DifficultyTag, Countdown, MicroLabel, Icon } from './components.js';
import { localAsset } from '../data.js';
import { actions } from './gameActions.js';
import { toastError } from './toasts.js';
import { net } from '../net.js';
import { store, useStore, shallowEqual, emptyMatch, createStore, isSpectating, reservedRank } from '../store.js';
import { GIcon } from './gameComponents.js';
import { GuideButton } from './guide.js';
import { PingPanel, ModePanel, battleArt, modePanelArt } from './battleArt.js';
import { countdownWarnAt } from './gameLogic.js';
import { audio } from '../audio.js';
import { recordQuit } from './stats.js';
import { canProposeRestart, restartVoters } from './restartVote.js';
import { t, tParts, N_ } from '../../../shared/i18n.js';
import { resolveRuleset, PRESET_LABELS } from '../../../shared/ruleset.js';

/**
 * Exit dialog lines. 放弃模拟 (g.leave → room.leave) ends the run on the server as 'abandoned' and returns to the
 * lobby straight away — no settlement screen follows, so the solo text must not promise one.
 */
export const EXIT_TEXT = Object.freeze({
  soloRest: N_('独立模拟的休整期没有时间限制，你可以随时继续。'),
  soloQuit: N_('放弃模拟将立即结束本局并返回大厅，本局进度不会保留，也不会进行结算。'),
  restartAlone: N_('{restart}：结束本局并从头开始，重新抽取首领、战场、特训敌人与禁用盟约。'),
  restartVote: N_('{restart}：全员同意后结束本局并从头开始，重新抽取首领、战场、特训敌人与禁用盟约。'),
});

/** Local patch: no 暂离（AI 托管） in the exit dialog — a player who leaves gives up the seat (放弃模拟 only). */
const AWAY_OPTION = false;

/** Local "暂离 / AI 托管" flag (the server keeps no per-client autoplay view). */
export const awayStore = createStore({ away: false });

/**
 * Whether a store change ends the match the 暂离 flag belongs to: its state was cleared (result → 返回同盟, 放弃模拟, a
 * new match starting, the room closing, a new server session) or its settlement arrived. The next match must never
 * open under the previous one's "AI 托管中" overlay (the server starts every match with autoplay off).
 * @param {any} s store state
 * @param {any} prev previous store state
 */
export const awayEnds = (s, prev) => (!!prev?.match?.public && !s?.match?.public) || (!!s?.match?.result && !prev?.match?.result);
store.subscribe((s, prev) => { if (awayStore.get().away && awayEnds(s, prev)) awayStore.set({ away: false }); });

/**
 * Leave the match for good (g.leave; room.leave only when no match runs), then drop local room/match state — only
 * once the server acknowledged it. The server sends a leaver no
 * settlement, so the page records the match itself before it is cleared (本机统计, ui/stats.js recordQuit: a 中途退出
 * entry of the history; it counts only when a round had been cleared) — once the leave went through.
 * @returns {Promise<void>}
 */
export async function quitMatch() {
  const before = store.get();
  let left = false;
  try {
    try { await net.request('g.leave', {}); left = true; } catch (err) {
      if (err?.code === 'NOT_IN_ROOM') left = true;
      else if (err?.code !== 'WRONG_PHASE') throw err;
    }
    // g.leave already removes the member (server/lobby.js routeGame); only a room without a running match
    // (WRONG_PHASE) needs room.leave, and a redundant request cannot revoke an acknowledged departure (upstream PR #879)
    if (!left) {
      try { await net.request('room.leave', {}); } catch (err) { if (err?.code !== 'NOT_IN_ROOM') throw err; }
      left = true;
    }
  } catch (err) {
    toastError(err);
  } finally {
    // (a settlement that arrived while the leave was in flight is the match's record already)
    if (left && !store.get().match.result) {
      try { recordQuit(before); } catch (err) { console.warn('[stats] quit record failed', err); }
    }
    // a failed request (OFFLINE, TIMEOUT, …) does not show the server released the seat: keep the latest view for a
    // retry or a reconnect, including a waiting-room update that arrived after the match ended
    if (left) store.set({ room: null, match: emptyMatch() });
  }
}

/**
 * A spectator seat's 预约座位 / 取消预约 (server/lobby.js header 「Seat reservation」), in the match screen's corner and the
 * exit dialog (the briefing and the draft have only that one): the seat comes when the match ends or restarts with a free one.
 * @param {{ reserved: number, size?: string }} props reserved: reservedRank, 0 = none
 */
export function SeatReserveButton({ reserved, size }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    await actions.reserveSeat(!reserved);
    setBusy(false);
  };
  return html`<${Button} variant=${reserved ? 'primary' : 'secondary'} size=${size} icon=${reserved ? 'check' : 'user'} active=${!!reserved}
    class="seat-reserve" data-testid="seat-reserve" loading=${busy} title=${t('模拟结束或重新开始时，有空位就自动入座')} onClick=${toggle}>${reserved ? t('取消预约') : t('预约座位')}<//>`;
}

/**
 * Exit confirmation modal.
 * @param {{ open: boolean, onClose: Function, solo: boolean, onAway?: Function }} props
 */
export function ExitModal({ open, onClose, solo, onAway }) {
  const [busy, setBusy] = useState(null);
  // a spectator seat (community report #26) only leaves its seat: nothing of the match is given up
  const spectator = useStore((s) => isSpectating(s.room, s.me.playerId));
  const reserved = useStore((s) => reservedRank(s.room, s.me.playerId));
  const pub = useStore((s) => s.match.public);
  const myId = useStore((s) => s.me.playerId);
  const restartOn = !spectator && canProposeRestart(pub, myId);
  // a single human (solo, or AI teammates only) restarts at once; co-op proposes the vote
  const alone = restartVoters(pub).length <= 1;
  const voteOpen = !!pub?.restartVote;
  const restart = (target) => async () => {
    if (busy) return;
    setBusy(target);
    const ok = await actions.restartVote('propose', target);
    setBusy(null);
    if (ok) onClose();
  };
  const quit = async () => {
    setBusy('quit');
    await quitMatch();
    setBusy(null);
    onClose();
  };
  if (spectator) {
    return html`<${Modal} open=${open} onClose=${onClose} tone="red" title=${t('离开观战')} micro="LEAVE SPECTATING" width="6.8rem"
      actions=${html`<${Button} variant="secondary" onClick=${onClose}>${t('取消')}<//>
        <${SeatReserveButton} reserved=${reserved} />
        <${Button} variant="danger" icon="exit" loading=${busy === 'quit'} onClick=${quit}>${t('离开观战')}<//>`}>
      <div class="exitm"><p>${t('离开观战席并返回大厅，本局模拟不受影响；观战席空着时可以凭同盟密钥再次观战。')}</p>
        ${reserved ? html`<p class="t-amber" data-testid="seat-reserved">${t('已预约座位（第 {n} 位）· 有空位时自动入座', { n: reserved })}</p>` : null}</div>
    <//>`;
  }
  const away = async () => {
    setBusy('away');
    const ok = await actions.autoplay(true);
    setBusy(null);
    onClose();
    if (ok) { awayStore.set({ away: true }); onAway?.(); }
  };
  // the buttons follow the order the text explains them, alone too: 返回等待室 → 重新开始 → 放弃模拟 (maintainer decision 2026-11-18)
  return html`<${Modal} open=${open} onClose=${onClose} tone="red" title=${t('离开模拟')} class="exit-modal" micro="LEAVE SIMULATION" width="min(var(--exit-modal-width, 8rem), 94vw)"
    actions=${html`
      <${Button} variant="secondary" onClick=${onClose}>${t('取消')}<//>
      ${!solo && AWAY_OPTION ? html`<${Button} variant="ice" icon="robot" loading=${busy === 'away'} onClick=${away}>${t('暂离（AI 托管）')}<//>` : null}
      ${restartOn ? html`<${Button} variant="secondary" data-testid="restart-room" loading=${busy === 'room'}
        disabled=${voteOpen} onClick=${restart('room')}>${alone ? t('返回等待室') : t('发起返回等待室投票')}<//>` : null}
      ${restartOn ? html`<${Button} variant="secondary" icon="refresh" class="exitm__restart" data-testid="restart-propose" loading=${busy === 'restart'}
        disabled=${voteOpen} title=${voteOpen ? t('重新开始投票进行中') : null} onClick=${restart('restart')}>${alone ? t('重新开始') : t('发起重新开始投票')}<//>` : null}
      <${Button} variant="danger" icon="exit" loading=${busy === 'quit'} onClick=${quit}>${t('放弃模拟')}<//>`}>
    <div class="exitm">
      ${restartOn ? html`<p>${alone ? t('返回等待室：结束本局，保留房间与席位，不进行结算。') : t('返回等待室：全员同意后结束本局，保留房间与席位，不进行结算。')}</p>` : null}
      ${solo
        ? html`<p>${t(EXIT_TEXT.soloRest)}</p>
               ${restartOn ? html`<p>${tParts(EXIT_TEXT.restartAlone, { restart: html`<b class="t-gold">${t('重新开始')}</b>` })}</p>` : null}
               <p class="t-lo">${t(EXIT_TEXT.soloQuit)}</p>`
        : html`${restartOn ? html`<p>${tParts(alone ? EXIT_TEXT.restartAlone : EXIT_TEXT.restartVote, { restart: html`<b class="t-gold">${alone ? t('重新开始') : t('发起重新开始投票')}</b>` })}</p>` : null}
               ${AWAY_OPTION ? html`<p>${tParts('{away}：由 AI 托管你的席位（自动部署、准备与选择），随时可以返回。', { away: html`<b class="t-ice">${t('暂离')}</b>` })}</p>` : null /* local patch: AWAY_OPTION */}
               <p>${tParts('{quit}：离开后无法返回本局，你的干员将回到共享卡池。', { quit: html`<b class="t-red">${t('放弃模拟')}</b>` })}</p>`}
    </div>
  <//>`;
}

/** Full-screen "AI 托管中" overlay with 返回模拟. */
export function AwayOverlay({ onBack = () => {} }) {
  const [busy, setBusy] = useState(false);
  return html`<div class="awayov" role="dialog" aria-label=${t('AI 托管中')}>
    <div class="awayov__box brackets">
      <${GIcon} name="robot" class="awayov__icon" />
      <${MicroLabel} tone="mint">${t('AUTOPILOT // AI 托管')}</${MicroLabel}>
      <h2>${t('AI 托管中')}</h2>
      <p class="t-lo">${t('AI 正在代为操作你的席位')}</p>
      <${Button} variant="primary" size="lg" icon="play" loading=${busy} onClick=${async () => { setBusy(true); const ok = await actions.autoplay(false); setBusy(false); if (ok) { awayStore.set({ away: false }); onBack(); } }}>${t('返回模拟')}<//>
    </div>
  </div>`;
}

const timerCue = () => audio.sfx('timer');

/**
 * Pre-game step header. Beside the difficulty, the 规则 mode when it is not 经典 (休闲 / 自定义, m.public.ruleset).
 * The countdown turns orange at the step's official warning time and plays the countdown cue then (gameLogic
 * countdownWarnAt: 确认本局信息 5 s, 选择策略 15 s; maintainer decision 2026-10-14).
 * @param {{ step: number, of: number, title: string, micro: string, pub: any, total?: number|null, config?: any,
 *   onExit: Function }} props config: data/config.json (the steps' warning times)
 */
/**
 * The official exit of the waiting room and the start steps (auto_chess_prepare_page outer_top_menu_view left_top:
 * leave_btn 54×56 of img_return — the grey tile with the white door and arrow —, and ping_part 63×22 of img_delay_bg,
 * white 16, 40.4 under the tile's centre; the start steps' official screens draw the same, CN screen 2026-11-13 —
 * maintainer decision 2026-11-13, the red square of 2026-11-08 undone; the battle HUD keeps its red one): the tile and
 * the ping under it. Without the local art, a grey CSS tile with the exit icon. Styles: css/components.css .exit-tile.
 * With `mode` ({ modeId, difficulty }), the battle HUD's left top instead (ui/hud.js): beside the tile the mode badge
 * (ModePanel, else the difficulty tag) over the ping panel, the two as high as the tile — the waiting room and the start
 * steps read like the battle (maintainer decision 2026-11-18).
 * @param {{ onClick: () => void, label: string, ping: number|null|undefined, online: boolean, disabled?: boolean,
 *   class?: string, testid?: string|null, mode?: { modeId?: string|null, difficulty?: string|null }|null }} props
 */
export function ExitTile({ onClick, label, ping, online, disabled = false, class: cls = '', testid = null, mode = null }) {
  const art = localAsset('ui/outer', 'img_return');
  const pbg = localAsset('ui/outer', 'img_delay_bg');
  const vars = [art && `--exit-art:url("${art}")`, pbg && `--ping-art:url("${pbg}")`].filter(Boolean).join(';');
  const modeArt = mode ? modePanelArt(mode.modeId) : null;
  return html`<div class=${`exit-tile${mode ? ' has-meta' : ''} ${cls}`.trim()} style=${vars || null}>
    <button type="button" class=${`exit-tile__btn${art ? ' has-art' : ''}`} disabled=${disabled} onClick=${onClick}
      aria-label=${label} title=${label} data-testid=${testid}>${art ? null : html`<${Icon} name="exit" />`}</button>
    ${mode ? html`<div class="exit-tile__meta">
      ${modeArt ? html`<${ModePanel} modeId=${mode.modeId} art=${modeArt} difficulty=${mode.difficulty} />`
        : mode.difficulty ? html`<${DifficultyTag} difficulty=${mode.difficulty} modeId=${mode.modeId} size="sm" />` : html`<span></span>`}
      ${battleArt('ping').cls ? html`<${PingPanel} ms=${ping} online=${online} />` : html`<${PingPill} ms=${ping} online=${online} />`}
    </div>` : html`<${PingPill} ms=${ping} online=${online} class="exit-tile__ping" />`}
  </div>`;
}

export function StepHeader({ step, of, title, micro, pub, total, config = null, onExit }) {
  const conn = useStore((s) => s.connection, shallowEqual);
  const rules = resolveRuleset(pub?.ruleset);
  return html`<header class="stephead">
    <div class="stephead__left">
      <${ExitTile} onClick=${onExit} label=${t('离开')} ping=${conn.ping} online=${conn.status === 'online'}
        mode=${{ modeId: pub?.modeId ?? null, difficulty: pub?.difficulty ?? null }} />
      ${rules.preset !== 'classic' ? html`<span class="stephead__tags">
        <span class=${`rtag rtag--${rules.preset}`} data-testid="match-ruleset">${t(PRESET_LABELS[rules.preset])}</span>
      </span>` : null}
    </div>
    <div class="stephead__center">
      <${MicroLabel} tone="mint">${micro}</${MicroLabel}>
      <h1 class="stephead__title"><b class="num">${step}</b><span class="num stephead__of">/${of}</span>${title}</h1>
    </div>
    <div class="stephead__right">
      <${GuideButton} class="stephead__guide" variant="secondary" />
      <${Countdown} deadline=${pub?.deadline} total=${total ?? undefined} warnAt=${countdownWarnAt(pub, config)} onWarn=${timerCue} size="md" />
    </div>
  </header>`;
}

