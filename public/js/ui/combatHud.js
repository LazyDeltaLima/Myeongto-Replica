// Combat HUD (research 06 §11.3/§11.7, research 09 §3.1 / §6.3): DP counter at the right edge and the bottom-centre
// pills.
//   Client-side combat (`client` prop, DESIGN §14 — the official behaviour):
//     * own normal battle over: "⌛ 作战结束，等待队友完成作战" with each teammate's live progress (kills / total, ✓);
//     * observing a teammate (team row → 前往查看): "👁 name" + 返回战场;
//     * 联防 / 最终攻势: the ‹ › pill switches the camera LEFT half / 全景 / RIGHT half ("你自己" / name / "全景"); it
//       replaces the observing pill on such a field watched with 前往查看 (a 联防 leaker, an eliminated spectator — the
//       official non-helper pill "‹ 👁 helper# ›"), with 返回战场 beside the arrows (DESIGN §20.15);
//     * there is NO view switcher during normal combat.
//   Server-run combat (legacy streaming mode): the ‹ 自己 › switcher cycling the live fields of m.public.fields.

import { html, Icon } from './components.js';
import { DpCounter } from './hud.js';
import { GIcon } from './gameComponents.js';
import { switcherLabel, cycleField } from './gameLogic.js';
import { t } from '../../../shared/i18n.js';
import { battleArt, ObInfo } from './battleArt.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/**
 * The teammates the progress list names one by one: all of them, or — more than four (the 8-player mode) — only those still
 * fighting, the finished ones folded into one 「作战结束 n/N」 pill (two or three rows of seven pills otherwise) [추정].
 * @param {Array<{ playerId: string, done?: boolean }>} list
 * @returns {{ rows: any[], done: number | null, total: number }}
 */
export function progressRows(list) {
  const all = Array.isArray(list) ? list : [];
  if (all.length <= 4) return { rows: all, done: null, total: all.length };
  const rows = all.filter((p) => !p.done);
  return { rows, done: all.length - rows.length, total: all.length };
}

/** Teammates' progress under the waiting pill (css/screens/game.css .chud__progress / .chud__prog). */
function ProgressList({ list }) {
  if (!Array.isArray(list) || !list.length) return null;
  const { rows, done, total } = progressRows(list);
  return html`<div class="chud__progress" role="list" aria-label=${t('队友作战进度')}>
    ${done ? html`<span key="done" role="listitem" class="chud__prog is-done"><b>${t('作战结束')}</b><span class="num chud__prog__ok">${done}/${total}</span></span>` : null}
    ${rows.map((p) => html`<span key=${p.playerId} role="listitem" class=${cx('chud__prog', p.done && 'is-done')}>
      <b>${p.name}</b>
      ${p.done
        ? html`<span class="chud__prog__ok" aria-label=${t('作战结束')}>✓</span>`
        : html`<span class="num">${(p.resolved ?? p.killed) != null && p.total != null ? `${p.resolved ?? p.killed}/${p.total}` : '•••'}</span>`}
    </span>`)}
  </div>`;
}

/**
 * @param {{ pub:any, myId:string, watching:string|null, hud:any, myDone:boolean, onWatch:(fieldId:string)=>void, spectating?: boolean,
 *   client?: null | { progress?: any[]|null, observing?: { name: string }|null, onBack?: () => void,
 *                     layers?: Array<{ key: string, label: string, self: boolean, watch: boolean }>, layer?: string, onLayer?: (k: string) => void },
 *   waitBand?: boolean }} props `waitBand`: the official bottom band (ui/battleArt.js BottomTips) says the wait instead
 */
export function CombatHud({ pub, myId, watching, hud, myDone, onWatch, spectating = false, spectator = false, client = null, waitBand = false }) {
  // `spectator`: a spectator seat (community report #26) watches like an eliminated player, under its own caption
  if (client) return ClientHud({ pub, hud, myDone, spectating, spectator, client, waitBand });
  const fields = (Array.isArray(pub?.fields) ? pub.fields : []).filter((f) => f && f.live !== false);
  // the watched field may already have finished (not live): still name it
  const label = switcherLabel(pub, watching, myId, spectating);
  const canCycle = fields.length > 1;
  return html`<div class="chud">
    <${DpCounter} dp=${hud?.dp} />
    <div class="chud__bottom">
      ${myDone && !waitBand ? html`<div class="chud__msg" role="status"><${Icon} name="hourglass" /><span>${t('作战结束，等待队友完成作战')}</span></div>` : null}
      ${spectating ? (spectator ? html`<div class="chud__msg" role="status"><${GIcon} name="eye" /><span>${t('观战中')}</span></div>`
        : html`<div class="chud__msg chud__msg--dead" role="status"><${Icon} name="close" /><span>${t('你已被淘汰，正在观战')}</span></div>`) : null}
      ${fields.length ? html`<div class=${cx('vswitch', !canCycle && 'is-single')}>
        <button type="button" class="vswitch__arrow" disabled=${!canCycle} aria-label=${t('上一个战场')}
          onClick=${() => { const n = cycleField(fields, watching, -1); if (n && n !== watching) onWatch(n); }}><${Icon} name="chevronLeft" /></button>
        <span class="vswitch__label">${label}</span>
        <button type="button" class="vswitch__arrow" disabled=${!canCycle} aria-label=${t('下一个战场')}
          onClick=${() => { const n = cycleField(fields, watching, 1); if (n && n !== watching) onWatch(n); }}><${Icon} name="chevronRight" /></button>
      </div>` : null}
    </div>
  </div>`;
}

function ClientHud({ pub = null, hud, myDone, spectating, spectator = false, client, waitBand = false }) {
  const layers = Array.isArray(client.layers) ? client.layers : [];
  const idx = Math.max(0, layers.findIndex((l) => l.key === (client.layer || 'ALL')));
  const cur = layers[idx] || null;
  const step = (d) => {
    if (!layers.length || !client.onLayer) return;
    const n = Math.min(layers.length - 1, Math.max(0, idx + d));
    if (n !== idx) client.onLayer(layers[n].key);
  };
  const observing = client.observing;
  const halves = layers.length > 0;
  // the official caption (panel_ob_info, ui/battleArt.js ObInfo) in place of the ‹ › pill when its art is there
  const ob = battleArt('ob').cls;
  const back = observing && client.onBack ? html`<button type="button" class="btn btn--secondary btn--sm chud__back" onClick=${() => client.onBack()}>
    <span class="btn__label">${t('返回战场')}</span></button>` : null;
  const curPlayer = cur && cur.pid && Array.isArray(pub?.players) ? pub.players.find((p) => p && p.playerId === cur.pid) : null;
  return html`<div class="chud">
    <${DpCounter} dp=${hud?.dp} />
    <div class="chud__bottom">
      ${myDone && !observing ? html`${waitBand ? null : html`<div class="chud__msg chud__wait" role="status"><${Icon} name="hourglass" /><span>${t('作战结束，等待队友完成作战')}</span></div>`}
        <${ProgressList} list=${client.progress} />` : null}
      ${spectating && !observing ? (spectator ? html`<div class="chud__msg" role="status"><${GIcon} name="eye" /><span>${t('观战中，可点击左侧成员头像前往查看')}</span></div>`
        : html`<div class="chud__msg chud__msg--dead" role="status"><${Icon} name="close" /><span>${t('你已被淘汰，可点击队友头像前往查看')}</span></div>`) : null}
      ${ob && halves ? html`<${ObInfo} cur=${cur} arrows=${true} prev=${idx > 0 ? () => step(-1) : null} next=${idx < layers.length - 1 ? () => step(1) : null}
        lost=${curPlayer?.status === 'left'}>${back}<//>` : null}
      ${ob && observing && !halves ? html`<${ObInfo} cur=${{ kind: 'other', label: observing.name }}>${back}<//>` : null}
      ${!ob && observing && !halves ? html`<div class="vswitch chud__observe is-single" role="status">
        <span class="vswitch__label"><${GIcon} name="eye" /><span>${observing.name}</span></span>
        ${client.onBack ? html`<button type="button" class="btn btn--secondary btn--sm chud__back" onClick=${() => client.onBack()}>
          <span class="btn__label">${t('返回战场')}</span></button>` : null}
      </div>` : null}
      ${!ob && halves ? html`<div class=${cx('vswitch', 'chud__layers', observing && 'is-observing')}>
        <button type="button" class="vswitch__arrow" disabled=${idx <= 0} aria-label=${t('左侧战场')} onClick=${() => step(-1)}><${Icon} name="chevronLeft" /></button>
        <span class="vswitch__label">
          ${cur && cur.watch ? html`<${GIcon} name="eye" />` : null}<span>${cur ? cur.label : t('全景')}</span></span>
        <button type="button" class="vswitch__arrow" disabled=${idx >= layers.length - 1} aria-label=${t('右侧战场')} onClick=${() => step(1)}><${Icon} name="chevronRight" /></button>
        ${observing && client.onBack ? html`<button type="button" class="btn btn--secondary btn--sm chud__back" onClick=${() => client.onBack()}>
          <span class="btn__label">${t('返回战场')}</span></button>` : null}
      </div>` : null}
    </div>
  </div>`;
}
