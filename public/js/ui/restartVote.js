// The in-match 重新开始 vote (feat, maintainer decisions 2026-10-31; server/match/match/restart.js): proposed from the exit
// dialog (ui/matchChrome.js ExitModal — from the first round on; the briefing has its 重新抽取, the strategy draft
// nothing), answered on a one-line banner under the bond strip (screens/game.js): the proposer's name, a person per
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

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** The phases a restart can be proposed in (server restart.js RESTART_PHASES). */
const RESTART_PHASES = new Set([PHASE.BATTLE_CHECK, PHASE.ROUND_START, PHASE.SP_DRAFT, PHASE.PREP, PHASE.COMBAT, PHASE.UNITE,
  PHASE.SETTLE, PHASE.FINAL_ASSAULT, PHASE.HIDDEN_CORE]);

/**
 * The seats a restart needs (server restartVoters): humans still in and not under AI 托管, the eliminated included.
 * @param {any} pub m.public
 */
export const restartVoters = (pub) => (Array.isArray(pub?.players) ? pub.players : [])
  .filter((p) => p && !p.isBot && p.status !== 'left' && !p.autoplay);

/**
 * Whether the exit dialog offers 重新开始 to `myId`: a voter, in a phase from the first round on, the match not over.
 * @param {any} pub @param {string|null} myId
 */
export const canProposeRestart = (pub, myId) => !!pub && RESTART_PHASES.has(pub.phase) && !pub.restarted
  && restartVoters(pub).some((p) => p.playerId === myId);

/** The banner of an open vote (null without one). */
export function RestartVoteBanner({ pub, myId }) {
  const v = pub?.restartVote;
  const [busy, setBusy] = useState(null);
  useTicker(v ? 1000 : 0);
  if (!v || pub.restarted) return null;
  const voters = restartVoters(pub);
  const yes = new Set(v.yes);
  const proposer = (pub.players || []).find((p) => p.playerId === v.by);
  const mine = v.by === myId;
  const voter = voters.some((p) => p.playerId === myId);
  const answered = yes.has(myId);
  const secs = secondsLeft(v.deadline);
  const send = (op) => async () => {
    if (busy) return;
    setBusy(op);
    await actions.restartVote(op);
    setBusy(null);
  };
  const bg = localAsset('ui/outer', 'img_player_bg');
  const on = localAsset('ui/outer', 'img_player_confirmed');
  return html`<div class="rvote" role="status" data-testid="restart-vote" title=${t('全员同意时从头开始')}
    style=${bg && on ? `--rv-off:url("${bg}");--rv-on:url("${on}")` : null}>
    <${Icon} name="refresh" />
    <b class="rvote__title">${mine ? t('你提议重新开始') : t('{name} 提议重新开始', { name: playerName(proposer?.name) || t('博士') })}</b>
    <span class="rvote__note">${t('全员同意时从头开始')}</span>
    <span class=${cx('rvote__pips', !(bg && on) && 'no-art')}>${voters.map((p) => html`<i key=${p.playerId}
      class=${cx(yes.has(p.playerId) && 'on')} title=${playerName(p.name)}></i>`)}</span>
    <span class="rvote__n num"><b>${voters.filter((p) => yes.has(p.playerId)).length}</b>/${voters.length}</span>
    ${secs != null ? html`<span class="rvote__secs num">${secs}s</span>` : null}
    ${mine ? html`<span class="rvote__acts"><${Button} variant="secondary" size="sm" loading=${busy === 'cancel'} onClick=${send('cancel')}>${t('取消投票')}<//></span>`
      : voter && !answered ? html`<span class="rvote__acts">
        <${Button} variant="secondary" size="sm" icon="close" loading=${busy === 'no'} onClick=${send('no')}>${t('反对')}<//>
        <${Button} variant="amber" size="sm" icon="check" loading=${busy === 'yes'} onClick=${send('yes')}>${t('同意')}<//>
      </span>` : null}
    <i class="rvote__bar" style=${`--rv-p:${secs != null && v.ms > 0 ? Math.min(100, Math.round((secs * 1000 / v.ms) * 100)) : 100}%`}></i>
  </div>`;
}
