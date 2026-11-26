// Chrome shared by every in-match screen: the step header of the pre-game screens (exit with the ping under it — ExitTile,
// also the waiting room's — + the mode plate | "1/3 确认本局信息" | countdown) and the exit flow (confirm with 暂离 / 放弃, AI 托管 overlay).
//
// 暂离 (co-op): turns on AI 托管 (g.autoplay on) so the seat keeps playing; the overlay's 返回模拟 turns it
// off. 放弃模拟: g.leave then room.leave (the platform treats it as a quit), back to the lobby. 重新开始 (from the first
// round on, any 规则 mode — maintainer decisions 2026-10-31): a single human restarts at once, co-op opens the vote
// (发起重新开始投票; ui/restartVote.js, server/match/match/restart.js). 返回等待室 the same way, and in the start steps
// too (maintainer decision 2026-11-26): there the vote's banner sits under StepHeader.

import { useState } from '../../vendor/hooks.module.js';
import { html, Button, Modal, PingPill, DifficultyTag, Countdown, MicroLabel, Icon, gradeName } from './components.js';
import { data, localAsset } from '../data.js';
import { seasonArt } from './seasonArt.js';
import { actions } from './gameActions.js';
import { toastError } from './toasts.js';
import { net } from '../net.js';
import { store, useStore, shallowEqual, emptyMatch, createStore, isSpectating, reservedRank } from '../store.js';
import { GIcon } from './gameComponents.js';
import { GuideButton } from './guide.js';
import { countdownWarnAt } from './gameLogic.js';
import { audio } from '../audio.js';
import { recordQuit } from './stats.js';
import { canProposeRestart, canProposeRoomReturn, restartVoters, RestartVoteBanner } from './restartVote.js';
import { t, tParts, N_ } from '../../../shared/i18n.js';
import { resolveRuleset, PRESET_LABELS } from '../../../shared/ruleset.js';
import { DEFAULT_SEASON, seasonOf, modeGrade } from '../../../shared/seasons.js';
import { DIFFICULTY_NAMES, DIFFICULTY_COLORS, gradeDifficulty } from '../../../shared/constants.js';

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

/** @import { Pub } from './gameLogic/shared.js' */
/** @typedef {{ match?: { public?: unknown, result?: unknown } | null } | null | undefined} AwayState the store fields awayEnds reads */

/** A request error's code (net.request rejects with `{ code }`). @param {unknown} err */
const errCode = (err) => (err && typeof err === 'object' && 'code' in err ? err.code : undefined);

/** Local "暂离 / AI 托管" flag (the server keeps no per-client autoplay view). */
export const awayStore = createStore({ away: false });

/**
 * Whether a store change ends the match the 暂离 flag belongs to: its state was cleared (result → 返回同盟, 放弃模拟, a
 * new match starting, the room closing, a new server session) or its settlement arrived. The next match must never
 * open under the previous one's "AI 托管中" overlay (the server starts every match with autoplay off).
 * @param {AwayState} s store state
 * @param {AwayState} prev previous store state
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
      if (errCode(err) === 'NOT_IN_ROOM') left = true;
      else if (errCode(err) !== 'WRONG_PHASE') throw err;
    }
    // g.leave already removes the member (server/lobby.js routeGame); only a room without a running match
    // (WRONG_PHASE) needs room.leave, and a redundant request cannot revoke an acknowledged departure (upstream PR #879)
    if (!left) {
      try { await net.request('room.leave', {}); } catch (err) { if (errCode(err) !== 'NOT_IN_ROOM') throw err; }
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
  const [busy, setBusy] = useState(/** @type {string | null} */ (null));
  // a spectator seat (community report #26) only leaves its seat: nothing of the match is given up
  const spectator = useStore((s) => isSpectating(s.room, s.me.playerId));
  const reserved = useStore((s) => reservedRank(s.room, s.me.playerId));
  const pub = useStore((s) => s.match.public);
  const myId = useStore((s) => s.me.playerId);
  const restartOn = !spectator && canProposeRestart(pub, myId);
  // 返回等待室 also in the start steps, where 重新开始 is not offered (maintainer decision 2026-11-26)
  const roomOn = !spectator && canProposeRoomReturn(pub, myId);
  // a single human (solo, or AI teammates only) restarts at once; co-op proposes the vote
  const alone = restartVoters(pub).length <= 1;
  const voteOpen = !!pub?.restartVote;
  const restart = (/** @type {string} */ target) => async () => {
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
      ${roomOn ? html`<${Button} variant="secondary" data-testid="restart-room" loading=${busy === 'room'}
        disabled=${voteOpen} onClick=${restart('room')}>${alone ? t('返回等待室') : t('发起返回等待室投票')}<//>` : null}
      ${restartOn ? html`<${Button} variant="secondary" icon="refresh" class="exitm__restart" data-testid="restart-propose" loading=${busy === 'restart'}
        disabled=${voteOpen} title=${voteOpen ? t('重新开始投票进行中') : null} onClick=${restart('restart')}>${alone ? t('重新开始') : t('发起重新开始投票')}<//>` : null}
      <${Button} variant="danger" icon="exit" loading=${busy === 'quit'} onClick=${quit}>${t('放弃模拟')}<//>`}>
    <div class="exitm">
      ${roomOn ? html`<p>${alone ? t('返回等待室：结束本局，保留房间与席位，不进行结算。') : t('返回等待室：全员同意后结束本局，保留房间与席位，不进行结算。')}</p>` : null}
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
 * The official exit of the waiting room and the start steps (auto_chess_prepare_page outer_top_menu_view left_top:
 * leave_btn 54×56 of img_return — the grey tile with the white door and arrow —, and ping_part 63×22 of img_delay_bg,
 * white 16, 40.4 under the tile's centre; the start steps' official screens draw the same, CN screen 2026-11-13 —
 * maintainer decision 2026-11-13, the red square of 2026-11-08 undone; the battle HUD keeps its red one): the tile and
 * the ping under it. Without the local art, a grey CSS tile with the exit icon. Styles: css/components.css .exit-tile.
 * @param {{ onClick: () => void, label: string, ping: number|null|undefined, online: boolean, disabled?: boolean,
 *   class?: string, testid?: string|null }} props
 */
export function ExitTile({ onClick, label, ping, online, disabled = false, class: cls = '', testid = null }) {
  const art = localAsset('ui/outer', 'img_return');
  const pbg = localAsset('ui/outer', 'img_delay_bg');
  const vars = [art && `--exit-art:url("${art}")`, pbg && `--ping-art:url("${pbg}")`].filter(Boolean).join(';');
  return html`<div class=${`exit-tile ${cls}`.trim()} style=${vars || null}>
    <button type="button" class=${`exit-tile__btn${art ? ' has-art' : ''}`} disabled=${disabled} onClick=${onClick}
      aria-label=${label} title=${label} data-testid=${testid}>${art ? null : html`<${Icon} name="exit" />`}</button>
    <${PingPill} ms=${ping} online=${online} class="exit-tile__ping" />
  </div>`;
}

/** The plate pictures' names per modeDifficulty where they differ from it lowercased: step 1 img_title_mode_guide, steps 2–3 mode_train. */
/** @type {Readonly<Record<number, Readonly<Record<string, string>>>>} */
const PLATE_NAME = Object.freeze({ 1: { TRAINING: 'guide' }, 2: { TRAINING: 'train' } });

/**
 * The official pictures of the start-step header (docs/rules/ui.md 「판 시작 단계 머리」), null where there is none (the
 * header then draws its CSS stand-in). A later season (规程) reads its own extract: step 1 the stage-info view's
 * (season/<id>/stageinfo img_title_mode_<difficulty>, img_split_line, img_chat_babble), steps 2–3 the 3/3 screen's
 * (season/<id>/diychoose mode_<difficulty>; pop for step 3's bubble — the 选择策略 bar has the stage-info divider and
 * bubble), and the theme's character (season/<id>/skin img_char_spine_outer: the default theme ac_n_initial's still
 * picture, which the prefab's img_char_spine takes from the theme's skin_config `char_spine_outer`). 盟约 step 1 reads the
 * EN client's (ui/outer), then the public mirror (stageInfo/*); steps 2–3 only the mirror's bandChoose/mode_*, the
 * 选择策略 screen's own sprites: ui/outer is one flat name space where the mode list's 147×40 buttons mode_normal /
 * mode_abyss took those names, and the 68-high plate's slices stretched them (maintainer report 2026-11-18). It has no
 * character and no bubble. Steps 2–3
 * of 盟约 and step 3 of 规程 draw a flat divider (split_line without a sprite, #e4e4e4 at 0.2).
 * @param {number} step 1–3 @param {string|null|undefined} difficulty the mode's modeDifficulty (config.modes[].difficulty)
 * @param {unknown} season
 * @returns {{ cn: boolean, plate: string|null, split: string|null, bubble: string|null, char: string|null }}
 */
export function stepHeadArt(step, difficulty, season) {
  const id = seasonOf(season);
  const cn = id !== DEFAULT_SEASON;
  const first = step === 1;
  const diff = typeof difficulty === 'string' && difficulty ? difficulty : null;
  const name = diff ? (PLATE_NAME[first ? 1 : 2][diff] || diff.toLowerCase()) : null;
  const ui = data.get('assets')?.ui;
  const mirror = (/** @type {string} */ key) => (ui && typeof ui === 'object' && typeof ui[key] === 'string' && ui[key] ? ui[key] : null);
  const outer = (/** @type {string} */ n) => localAsset('ui/outer', n);
  if (cn) {
    return {
      cn,
      plate: name ? seasonArt(id, first ? 'stageinfo' : 'diychoose', first ? `img_title_mode_${name}` : `mode_${name}`) : null,
      split: step === 3 ? null : seasonArt(id, 'stageinfo', 'img_split_line'),
      bubble: step === 3 ? seasonArt(id, 'diychoose', 'pop') : seasonArt(id, 'stageinfo', 'img_chat_babble'),
      char: seasonArt(id, 'skin', 'img_char_spine_outer'),
    };
  }
  const plate = !name ? null : first ? outer(`img_title_mode_${name}`) || mirror(`stageInfo/img_title_mode_${name}`)
    : mirror(`bandChoose/mode_${name}`);
  return { cn, plate, split: first ? outer('img_split_line') : null, bubble: null, char: null };
}

/**
 * The left chain of the start-step header after the exit tile (official auto_chess_stage_info_state panel_top, the
 * 选择策略 / 3/3 bars' group_game_info; maintainer decision 2026-11-18, the mockup as chosen): the mode plate (its picture
 * with the mode's name in the mode's colour, as the official KR and CN screens draw it) | the 规则 mode when not 经典 |
 * the divider | (规程) the theme's character and the speech bubble 「n/N title」 / (盟约) 「n/N title」. The 本局信息
 * button the official bars put between the plate and the divider is left out (maintainer decision 2026-11-18). Without
 * the plate's picture, the difficulty tag. Positions and sizes in prefab units (css/screens/briefing.css .stephead__chain).
 * @param {{ step: number, of: number, title: string, pub: Pub | null | undefined, season?: unknown }} props
 */
export function StepChain({ step, of, title, pub, season = data.season() }) {
  const rules = resolveRuleset(pub?.ruleset);
  const config = data.get('config');
  const mode = pub?.modeId ? config?.modes?.[pub.modeId] : null;
  const grade = pub?.modeId ? modeGrade(pub.modeId, season) : null;
  const difficulty = grade !== null ? gradeDifficulty(grade) : pub?.difficulty || null;
  const art = stepHeadArt(step, mode?.difficulty || difficulty, season);
  const first = step === 1;
  const name = grade !== null ? gradeName(grade) : /** @type {Record<string, string>} */ (DIFFICULTY_NAMES)[difficulty] ? t(/** @type {Record<string, string>} */ (DIFFICULTY_NAMES)[difficulty]) : mode?.name ? t(mode.name) : '';
  const color = /^#[0-9a-f]{6}$/i.test(mode?.color || '') ? mode.color : /** @type {Record<string, string>} */ (DIFFICULTY_COLORS)[difficulty] || null;
  const plate = !difficulty ? null : art.plate
    ? html`<span class=${`sh-mode is-step${first ? 1 : 2}`} style=${`--mt:url("${art.plate}")${color ? `;--mc:${color}` : ''}`} data-testid="step-mode"><b>${name}</b></span>`
    : html`<span class="sh-mode is-tag" data-testid="step-mode"><${DifficultyTag} difficulty=${difficulty} modeId=${pub?.modeId} season=${season} /></span>`;
  const num = html`<span class="sh-num"><b>${step}</b><i><s class="sh-num__sl">/</s>${of}</i></span>`;
  return html`<div class=${`stephead__chain ${art.cn ? 'is-cn' : 'is-en'} is-step${step}`}>
    ${plate}
    ${rules.preset !== 'classic' ? html`<span class="stephead__tags"><span class=${`rtag rtag--${rules.preset}`} data-testid="match-ruleset">${t(/** @type {Record<string, string>} */ (PRESET_LABELS)[rules.preset])}</span></span>` : null}
    <i class=${`sh-split${art.split ? '' : ' is-flat'}`} style=${art.split ? `--split:url("${art.split}")` : null} aria-hidden="true"></i>
    ${art.cn && art.char ? html`<i class="sh-char" style=${`--char:url("${art.char}")`} aria-hidden="true"></i>` : null}
    ${art.cn
      ? html`<span class=${`sh-bub${step === 3 ? ' is-pop' : ''}${art.bubble ? '' : ' no-art'}`} style=${art.bubble ? `--bub:url("${art.bubble}")` : null}>${num}<span class="sh-title">${title}</span></span>`
      : html`<h1 class="sh-plain">${num}<span class="sh-title">${title}</span></h1>`}
  </div>`;
}

/**
 * Pre-game step header: the exit tile, the left chain (StepChain), the 玩法说明 button and the countdown. The countdown
 * turns orange at the step's official warning time and plays the countdown cue then (gameLogic countdownWarnAt:
 * 确认本局信息 5 s, 选择策略 15 s; maintainer decision 2026-10-14).
 * An open 返回等待室 vote (ui/restartVote.js) hangs under the header, centred (maintainer decision 2026-11-26).
 * @param {{ step: number, of: number, title: string, pub: Pub | null | undefined, total?: number|null, config?: unknown,
 *   onExit: Function }} props config: data/config.json (the steps' warning times)
 */
export function StepHeader({ step, of, title, pub, total, config = null, onExit }) {
  const conn = useStore((s) => s.connection, shallowEqual);
  const myId = useStore((s) => s.me.playerId);
  return html`<header class="stephead">
    <div class="stephead__left">
      <${ExitTile} onClick=${onExit} label=${t('离开')} ping=${conn.ping} online=${conn.status === 'online'} />
      <${StepChain} step=${step} of=${of} title=${title} pub=${pub} />
    </div>
    <div class="stephead__right">
      <${GuideButton} class="stephead__guide" variant="secondary" />
      <${Countdown} deadline=${pub?.deadline} total=${total ?? undefined} warnAt=${countdownWarnAt(pub, config)} onWarn=${timerCue} size="md" />
    </div>
    <${RestartVoteBanner} pub=${pub} myId=${myId} />
  </header>`;
}
