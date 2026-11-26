// The in-match 重新开始 vote (feat, maintainer decisions 2026-10-31; server/match/match/restart.js): proposed from the exit
// dialog (ui/matchChrome.js ExitModal — from the first round on; the briefing has its 重新抽取, the strategy draft
// nothing; its 返回等待室 target in the start steps too, maintainer decision 2026-11-26), answered on a one-line banner
// under the bond strip (screens/game.js) or under the start steps' header (ui/matchChrome.js StepHeader): the proposer's name, a person per
// voter in the official stage-info icons (ui/outer img_player_bg / img_player_confirmed, painted in the vote's gold —
// maintainer requests 2026-10-31), the count, the seconds left, and 反对 / 同意 for a voter or 取消投票 for the proposer.
// A seat that has answered sees the banner without buttons. The outcome comes as the server's m.toast (反对, withdrawn,
// not carried) or, when it passed, from the new match (public/js/main.js: the 中途退出 record and 「全员同意…」).

import { useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon, useTicker, secondsLeft } from './components.js';
import { actions } from './gameActions.js';
import { localAsset } from '../data.js';
import { t } from '../../../shared/i18n.js';
import { playerName } from '../../../shared/botNames.js';
import { PHASE } from '../../../shared/constants.js';

const cx = (/** @type {unknown[]} */ ...p) => p.flat().filter(Boolean).join(' ');

/** @import { Pub, PubPlayer } from './gameLogic/shared.js' */
/**
 * @typedef {{ by?: string, yes?: string[], deadline?: number, ms?: number, target?: string, [key: string]: unknown }} VoteState
 *   an open vote (m.public restartVote, a field's surrenderVote)
 */

/** The phases a restart can be proposed in (server restart.js RESTART_PHASES). @type {Set<string | undefined>} */
const RESTART_PHASES = new Set([PHASE.BATTLE_CHECK, PHASE.ROUND_START, PHASE.SP_DRAFT, PHASE.PREP, PHASE.COMBAT, PHASE.UNITE,
  PHASE.SETTLE, PHASE.FINAL_ASSAULT, PHASE.HIDDEN_CORE]);

/** The start steps, where only the 返回等待室 vote opens (server restart.js ROOM_VOTE_START_PHASES). @type {Set<string | undefined>} */
const ROOM_VOTE_START_PHASES = new Set([PHASE.INFO_CHECK, PHASE.BAND_DRAFT, PHASE.DIY_CHOOSE]);

/**
 * The seats a restart needs (server restartVoters): humans still in and not under AI 托管, the eliminated included.
 * @param {Pub | null | undefined} pub m.public
 * @returns {PubPlayer[]}
 */
export const restartVoters = (pub) => (Array.isArray(pub?.players) ? pub.players : [])
  .filter((/** @type {PubPlayer | null} */ p) => p && !p.isBot && p.status !== 'left' && !p.autoplay);

/**
 * Whether the exit dialog offers 重新开始 to `myId`: a voter, in a phase from the first round on, the match not over.
 * @param {Pub | null | undefined} pub @param {string|null} myId
 */
export const canProposeRestart = (pub, myId) => !!pub && RESTART_PHASES.has(pub.phase) && !pub.restarted
  && restartVoters(pub).some((p) => p.playerId === myId);

/**
 * Whether the exit dialog offers 返回等待室 to `myId`: wherever 重新开始 is offered, and in the start steps as well
 * (确认本局信息, 选择策略, 确定自选编队 — not once the briefing's 重新抽取 passed).
 * @param {Pub | null | undefined} pub @param {string|null} myId
 */
export const canProposeRoomReturn = (pub, myId) => canProposeRestart(pub, myId)
  || (!!pub && ROOM_VOTE_START_PHASES.has(pub.phase) && !pub.restarted && !pub.infoOutcome
    && restartVoters(pub).some((p) => p.playerId === myId));

/** The banner of an open vote (null without one). @param {{ pub: Pub | null | undefined, myId: string | null }} props */
export function RestartVoteBanner({ pub, myId }) {
  const v = pub?.restartVote;
  if (!v || pub.restarted) return null;
  const room = v.target === 'room';
  const note = room ? t('全员同意时返回等待室') : t('全员同意时从头开始');
  const proposer = (pub.players || []).find((p) => p.playerId === v.by);
  const title = v.by === myId ? (room ? t('你提议返回等待室') : t('你提议重新开始'))
    : t(room ? '{name} 提议返回等待室' : '{name} 提议重新开始', { name: playerName(proposer?.name) || t('博士') });
  return html`<${MatchVoteBanner} v=${v} voters=${restartVoters(pub)} myId=${myId} title=${title} note=${note}
    onVote=${(/** @type {string} */ op) => actions.restartVote(op)} />`;
}

/**
 * The one-line vote banner shared by the restart vote and the field surrender vote (ui/surrender.js): the icon, the
 * title, the note, a pip per voter, the count, the seconds left, 反对 / 同意 for a voter who has not answered or 取消投票
 * for the proposer, and the time bar. `onVote(op)` sends 'yes' | 'no' | 'cancel'.
 * @param {{ v: VoteState, voters: { playerId: string, name?: string }[], myId: string|null, title: string, note: string,
 *   onVote: (op: string) => unknown,
 *   icon?: string, testId?: string, class?: string }} props
 */
export function MatchVoteBanner({ v, voters, myId, title, note, onVote, icon = 'refresh', testId = 'restart-vote', class: cls = '' }) {
  const [busy, setBusy] = useState(/** @type {string | null} */ (null));
  useTicker(1000);
  /** @type {Set<string | null>} */
  const yes = new Set(v.yes);
  const mine = v.by === myId;
  const voter = voters.some((p) => p.playerId === myId);
  const answered = yes.has(myId);
  const secs = secondsLeft(v.deadline);
  const send = (/** @type {string} */ op) => async () => {
    if (busy) return;
    setBusy(op);
    try { await onVote(op); } finally { setBusy(null); }
  };
  const bg = localAsset('ui/outer', 'img_player_bg');
  const on = localAsset('ui/outer', 'img_player_confirmed');
  return html`<div class=${cx('rvote', cls)} role="status" data-testid=${testId} title=${note}
    style=${bg && on ? `--rv-off:url("${bg}");--rv-on:url("${on}")` : null}>
    <${Icon} name=${icon} />
    <b class="rvote__title">${title}</b>
    <span class="rvote__note">${note}</span>
    <span class=${cx('rvote__pips', !(bg && on) && 'no-art')}>${voters.map((p) => html`<i key=${p.playerId}
      class=${cx(yes.has(p.playerId) && 'on')} title=${playerName(p.name)}></i>`)}</span>
    <span class="rvote__n num"><b>${voters.filter((p) => yes.has(p.playerId)).length}</b>/${voters.length}</span>
    ${secs != null ? html`<span class="rvote__secs num">${secs}s</span>` : null}
    ${mine ? html`<span class="rvote__acts"><${Button} variant="secondary" size="sm" loading=${busy === 'cancel'} onClick=${send('cancel')}>${t('取消投票')}<//></span>`
      : voter && !answered ? html`<span class="rvote__acts">
        <${Button} variant="secondary" size="sm" icon="close" loading=${busy === 'no'} onClick=${send('no')}>${t('反对')}<//>
        <${Button} variant="amber" size="sm" icon="check" loading=${busy === 'yes'} onClick=${send('yes')}>${t('同意')}<//>
      </span>` : null}
    <i class="rvote__bar" style=${`--rv-p:${secs != null && /** @type {number} */ (v.ms) > 0 ? Math.min(100, Math.round((secs * 1000 / /** @type {number} */ (v.ms)) * 100)) : 100}%`}></i>
  </div>`;
}
