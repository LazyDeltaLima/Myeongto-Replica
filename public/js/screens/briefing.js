// Briefing — INFO_CHECK "1/2 确认本局信息" (research 06 §4.1, D1): enemy leader (silhouette, name,
// abilities — the client's stage-info enemy block, maintainer request 2026-10-11), stage (+ its pool: 战场固定 /
// 战场随机（共N张）, and under its name the battlefield's preview picture — maintainer request 2026-10-11,
// tools/map-previews.mjs; the card then sits beside the factions, both as tall as the taller one), 特训敌人 factions (icon, name, description), the difficulty
// tag, the ready count x/N with person pips, the 准备就绪 button (g.infoReady) and the countdown. Next to it 重新抽取
// (g.infoReroll, feat — maintainer decision 2026-10-09; the official briefing has no such button): alone it redraws at
// once; in co-op it is a vote of its own, apart from ready (maintainer decision 2026-10-13): a unanimous vote redraws
// (a new match), every seat ready starts the strategy draft (server phases.js maybeEndInfo). In co-op a reroll vote can
// be taken back (取消重新抽取), also by a seat already ready, and the first seat still voting it is named just above the
// footer, over the screen rather than in its flow (「…提议重新抽取」, m.public.rerollBy), with the vote count (maintainer
// decisions 2026-10-12; the co-op countdown runs 45 s, m.public.infoSeconds). The right column — 核心盟约
// / 附加盟约 rows of bond discs (disabled bonds greyed with the banned-member badge), the legend and the 本局禁用干员
// avatars, with the player's own 自选 pieces out of the shop (m.private.diyBanned) — is ui/matchInfo.js MatchInfo, the same
// blocks the strategy draft's 本局信息 dialog shows (screens/bandDraft.js).
// 규칙 모드 (m.public.ruleset, shared/ruleset.js; maintainer decision 2026-10-15): the battlefield card's name, pool and
// preview are a 休闲 convenience (battlefieldInfo) — 盟约's official stage-info view has no battlefield, so 经典 keeps the
// card in its place as 「未知战场」 (a dark box with the boss block's 「?」, revealed when the battle starts) and the column
// keeps its shape; 规程's official view shows the map preview, so that season shows the card in every mode
// (seasonOfficialOptions, maintainer decision 2026-11-13); 重新抽取 (infoReroll) is 休闲 only.

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon } from '../ui/components.js';
import { useGameData } from '../ui/gameComponents.js';
import { StepHeader, ExitModal } from '../ui/matchChrome.js';
import { MatchInfo, matchInfoModel } from '../ui/matchInfo.js';
import { MatchIntel } from '../ui/matchIntel.js';
import { LoadoutButton } from './loadout.js';
import { actions } from '../ui/gameActions.js';
import { sortedPlayers, phaseTotalSeconds, startStepCount } from '../ui/gameLogic.js';
import { useStore } from '../store.js';
import { data } from '../data.js';
import { t } from '../../../shared/i18n.js';
import { playerName } from '../../../shared/botNames.js';
import { resolveRuleset, seasonOfficialOptions } from '../../../shared/ruleset.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** INFO_CHECK screen. */
export function BriefingScreen() {
  const pub = useStore((s) => s.match.public);
  const priv = useStore((s) => s.match.private);
  const myId = useStore((s) => s.me.playerId);
  const solo = useStore((s) => s.room?.mode === 'solo') || String(pub?.modeId || '').includes('single');
  const gd = useGameData();
  const matchNo = useStore((s) => s.room?.matchNo ?? 0);
  const season = useStore((s) => s.room?.season ?? null);
  const [exit, setExit] = useState(false);
  const [busy, setBusy] = useState(null);
  // the server refuses 重新抽取 in the briefing's first second (phases.js INFO_REROLL_MIN_MS): the button waits as long
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    setArmed(false);
    const h = setTimeout(() => setArmed(true), 1100);
    return () => clearTimeout(h);
  }, [matchNo]);
  if (!pub) return null;

  const players = sortedPlayers(pub);
  const me = players.find((p) => p.playerId === myId);
  const readyN = players.filter((p) => p.ready).length;
  const rerollN = players.filter((p) => p.reroll).length;
  // a single human decides alone (solo, or a 同盟 room with AI teammates only)
  const alone = players.filter((p) => !p.isBot).length <= 1;
  const closing = !!pub.infoOutcome;
  // the 「…提议重新抽取」 banner (co-op): the first seat still voting reroll and the count
  const proposer = !alone && pub.rerollBy ? players.find((p) => p.playerId === pub.rerollBy) : null;
  // the seats a reroll needs (server maybeEndInfo: humans still in, not under AI 托管)
  const voters = players.filter((p) => !p.isBot && p.status !== 'left' && !p.autoplay);
  const mode = gd.config?.modes?.[pub.modeId];
  // (+ the own 自选 pieces this match leaves out of the shop: m.private.diyBanned)
  const info = matchInfoModel(pub, { bonds: gd.list('bonds'), chess: gd.chess, mode, priv, diyData: { chess: data.get('chess'), backups: data.get('backups') } });
  const rules = { ...resolveRuleset(pub.ruleset).options, ...seasonOfficialOptions(season) };

  const vote = (kind) => async () => {
    if (busy || closing) return;
    // a reroll vote can be taken back in co-op (the button turns into 取消重新抽取); 准备就绪 is final
    if (kind === 'reroll' && me?.reroll && !alone) {
      setBusy('reroll');
      await actions.infoRerollCancel();
      setBusy(null);
      return;
    }
    if (kind === 'ready' ? me?.ready : me?.reroll) return;
    setBusy(kind);
    await (kind === 'reroll' ? actions.infoReroll() : actions.infoReady());
    setBusy(null);
  };
  const rerollTip = alone ? t('重新抽取首领、战场、特训敌人与禁用盟约')
    : me?.reroll ? t('撤回重新抽取的投票')
    : t('投票重新抽取首领、战场、特训敌人与禁用盟约：全员同意时重新抽取');

  return html`<div class="screen brief">
    <div class="brief__bg" aria-hidden="true"></div>
    <${StepHeader} step=${1} of=${startStepCount(gd.config)} title=${t('确认本局信息')} micro="BRIEFING // INFO CHECK" pub=${pub}
      total=${phaseTotalSeconds(pub, gd.config)} config=${gd.config} onExit=${() => setExit(true)} />
    <main class="brief__main">
      <section class="brief__left">
        <${MatchIntel} pub=${pub} season=${season} />
      </section>
      <section class="brief__right">
        <${MatchInfo} model=${info} />
      </section>
    </main>
    <footer class="brief__foot">
      ${proposer ? html`<div class="brief-rr" role="status" data-testid="reroll-proposer">
        <${Icon} name="refresh" />
        <div class="brief-rr__text">
          <b>${proposer.playerId === myId ? t('你提议重新抽取') : t('{name} 提议重新抽取', { name: playerName(proposer.name) || t('博士') })}</b>
          <span>${t('重新抽取 {rr}/{n}：全员同意时重新抽取', { rr: rerollN, n: voters.length })}</span>
        </div>
      </div>` : null}
      <${LoadoutButton} from="briefing" size="lg" class="brief-loadout" />
      <div class="brief-ready">
        <span class="brief-ready__txt">${t('已就绪')} <b class="num">${readyN}</b><span class="num">/${players.length}</span></span>
        ${!alone && rerollN ? html`<span class="brief-ready__txt brief-ready__txt--rr" data-testid="reroll-count">${t('重新抽取')} <b class="num">${rerollN}</b><span class="num">/${voters.length}</span></span>` : null}
        <span class="brief-ready__pips">${players.map((p) => html`<i key=${p.playerId} class=${cx(p.ready && 'on', p.reroll && 'rr', p.playerId === myId && 'me')} title=${playerName(p.name)}><${Icon} name=${p.reroll ? 'refresh' : 'user'} /></i>`)}</span>
      </div>
      ${me && rules.infoReroll ? html`<${Button} variant="secondary" size="xl" icon="refresh" class="brief-reroll" data-testid="info-reroll" title=${rerollTip}
        active=${!!me.reroll} loading=${busy === 'reroll' || pub.infoOutcome === 'reroll'} disabled=${(me.reroll && alone) || closing || !armed}
        onClick=${vote('reroll')}>${me.reroll && !alone ? t('取消重新抽取') : t('重新抽取')}<//>` : null}
      <${Button} variant="primary" size="xl" icon=${me?.ready ? 'check' : me ? 'play' : 'eye'} active=${!!me?.ready} loading=${busy === 'ready'}
        disabled=${!!me?.ready || closing || !me} onClick=${vote('ready')}>${me?.ready ? t('已就绪') : me ? t('准备就绪') : t('观战中')}<//>
    </footer>
    <${ExitModal} open=${exit} onClose=${() => setExit(false)} solo=${solo} />
  </div>`;
}
