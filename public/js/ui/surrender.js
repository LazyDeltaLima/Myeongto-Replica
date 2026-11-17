import { useRef, useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon, confirmDialog, useTicker, secondsLeft } from './components.js';
import { actions } from './gameActions.js';
import { store } from '../store.js';
import { t } from '../../../shared/i18n.js';
import { playerName } from '../../../shared/botNames.js';
import { PHASE } from '../../../shared/constants.js';
import { localAsset } from '../data.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

const PHASES = new Set([PHASE.COMBAT, PHASE.UNITE, PHASE.FINAL_ASSAULT, PHASE.HIDDEN_CORE]);
export const surrenderField = (pub, myId) => PHASES.has(pub?.phase) && !pub.restarted
  ? pub.fields?.find(f => f.live && !f.surrendering && f.battleId && f.players.includes(myId)) || null : null;
const votersOf = (pub, field) => (pub.players || []).filter(p => field.players.includes(p.playerId) && !p.isBot && p.status !== 'left' && !p.autoplay);

export function SurrenderButton({ pub, myId }) {
  const [busy, setBusy] = useState(false);
  const asking = useRef(false);
  const field = surrenderField(pub, myId);
  const me = pub?.players?.find(p => p.playerId === myId);
  if (!field || !me || me.isBot || me.autoplay || me.status === 'left') return null;
  const send = async () => {
    if (asking.current) return;
    asking.current = true;
    try {
      const voters = votersOf(pub, field);
      if (voters.length <= 1) {
        const boss = field.kind === 'boss' || field.kind === 'hidden';
        const ok = await confirmDialog({ title: t('放弃本次战斗？'),
          text: t(boss ? '仅结束本阵地的战斗。其他阵地继续作战；全部阵地结束而领袖仍存活时，本次挑战失败。'
            : '结束本阵地的战斗，未处理的敌人（含尚未登场的敌人）按漏怪处理。后续联防和生命扣除遵循现有规则。'),
          okText: t('放弃战斗'), danger: true });
        if (!ok) return;
      }
      // The dialog may span the end of a round. Never apply its confirmation to a new field.
      const latest = surrenderField(store.get().match.public, myId);
      if (!latest || latest.battleId !== field.battleId || latest.surrenderVote) return;
      setBusy(true);
      await actions.surrender(field);
    } finally { asking.current = false; setBusy(false); }
  };
  return html`<div class="readywrap"><button type="button" class="readybtn tapx surrenderbtn" data-testid="surrender-button"
    disabled=${busy || !!field.surrenderVote} onClick=${send}>
    <span class="readybtn__box"><${Icon} name="close" /></span><span class="readybtn__label">${t('放弃战斗')}</span>
  </button></div>`;
}

export function SurrenderVoteBanner({ pub, myId }) {
  const field = (pub?.fields || []).find(f => f.surrenderVote && f.players.includes(myId));
  if (!field || !PHASES.has(pub?.phase) || pub.restarted) return null;
  const v = field.surrenderVote;
  const voters = (pub.players || []).filter(p => v.voters.includes(p.playerId));
  const by = voters.find(p => p.playerId === v.by);
  const title = v.by === myId ? t('你提议放弃战斗') : t('{name} 提议放弃战斗', { name: playerName(by?.name) || t('博士') });
  return html`<${SurrenderVoteContent} key=${`${field.battleId}:${v.by}:${v.deadline}`} v=${v} voters=${voters} myId=${myId}
    title=${title} note=${t('本阵地参与者全员同意时放弃战斗')} icon="close" testId="surrender-vote"
    class=${pub.restartVote ? 'rvote--second' : ''} onVote=${op => actions.surrender(field, op)} />`;
}

/** Field surrender vote, styled with the existing restart banner CSS. */
function SurrenderVoteContent({ v, voters, myId, title, note, onVote, icon = 'refresh', testId = 'restart-vote', class: cls = '' }) {
  const [busy, setBusy] = useState(null);
  useTicker(1000);
  const yes = new Set(v.yes);
  const mine = v.by === myId;
  const voter = voters.some((p) => p.playerId === myId);
  const answered = yes.has(myId);
  const secs = secondsLeft(v.deadline);
  const send = (op) => async () => {
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
    <i class="rvote__bar" style=${`--rv-p:${secs != null && v.ms > 0 ? Math.min(100, Math.round((secs * 1000 / v.ms) * 100)) : 100}%`}></i>
  </div>`;
}
