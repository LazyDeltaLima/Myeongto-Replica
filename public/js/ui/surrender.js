import { useRef, useState } from '../../vendor/hooks.module.js';
import { html, Icon, confirmDialog } from './components.js';
import { actions } from './gameActions.js';
import { store } from '../store.js';
import { t } from '../../../shared/i18n.js';
import { playerName } from '../../../shared/botNames.js';
import { PHASE } from '../../../shared/constants.js';
import { MatchVoteBanner } from './restartVote.js';

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
  return html`<${MatchVoteBanner} key=${`${field.battleId}:${v.by}:${v.deadline}`} v=${v} voters=${voters} myId=${myId}
    title=${title} note=${t('本阵地参与者全员同意时放弃战斗')} icon="close" testId="surrender-vote"
    class=${pub.restartVote ? 'rvote--second' : ''} onVote=${op => actions.surrender(field, op)} />`;
}
