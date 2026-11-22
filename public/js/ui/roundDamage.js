// Round damage panel (a feature of this fork, maintainer decision 2026-10-25; docs/rules/ui.md 「라운드 대미지 패널」): a
// 「伤害」 chip that opens a panel of what each own board operator dealt in the player's own battle — live while it runs
// (battleRunner.ownDamage, read twice a second), the server's settled m.roundDmg afterwards and through the next prep.
// Two tabs (maintainer decision 2026-11-06; the choice is remembered, sp.pref.roundDamageTab): 伤害, its bars stacked by
// damage type under a legend, and 治疗, the operators who healed.
// Summons count for their summoner; 联防 battles are left out. Folded by default; the open state is remembered
// (sp.pref.roundDamageOpen). Settings → 画面: 「回合伤害统计」 off hides it; 「伤害统计样式」 'auto' = full rows (name,
// share) on a desktop, compact (avatar, bar, number) on a phone.
// Placement: on a desktop the chip sits left of the effects column's first icon and the panel opens left of the chip
// (screens/game.js, .gm__effects); on a phone — the media query that folds the corner tools behind ⋯ (css/devices.css) — the chip hangs
// under the player list and the panel opens right of it (ui/teamPanel.js `after`), clear of the shop's 刷新.

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { useGameData, Img } from './gameComponents.js';
import { chessAvatarUrl } from './assetUrls.js';
import { skinArt, skinPic } from './skins.js';
import { fmtNum, isCombatPhase, ownDiyRecord, ownStandIn, roundDamageSource, roundDamageRows, ROUND_DAMAGE_ROWS } from './gameLogic.js';
import { settingsStore } from './settings.js';
import { useStore, loadPref, savePref } from '../store.js';
import { battleRunner } from '../battle/runner.js';
import { net } from '../net.js';
import { data } from '../data.js';
import { t, N_ } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** The phone layout's media query (css/devices.css: the corner tools behind ⋯). */
export const PHONE_QUERY = '(max-height: 600px) and (pointer: coarse), (max-height: 600px) and (any-pointer: coarse), '
  + '(max-width: 767px) and (pointer: coarse), (max-width: 767px) and (any-pointer: coarse)';

/** @returns {boolean} the phone layout is on */
export function usePhoneLayout() {
  const mql = typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(PHONE_QUERY) : null;
  const [on, setOn] = useState(() => !!mql?.matches);
  useEffect(() => {
    if (!mql) return undefined;
    const fn = () => setOn(mql.matches);
    fn();
    mql.addEventListener?.('change', fn);
    return () => mql.removeEventListener?.('change', fn);
  }, []);
  return on;
}

// the latest m.roundDmg, kept across remounts of the game screen (a resync sends it again)
let lastMsg = null;
const subs = new Set();
net?.on?.('m.roundDmg', (m) => { lastMsg = m; for (const fn of subs) fn(m); });

function useRoundDamageMsg() {
  const [m, set] = useState(lastMsg);
  useEffect(() => { subs.add(set); set(lastMsg); return () => { subs.delete(set); }; }, []);
  return m;
}

/** The live reading of the own battle while a battle phase runs (null otherwise). */
function useLiveDamage(combat, myId) {
  const [live, setLive] = useState(null);
  useEffect(() => {
    if (!combat || !battleRunner || !myId) { setLive(null); return undefined; }
    const read = () => setLive(battleRunner.ownDamage(myId));
    read();
    const id = setInterval(read, 500);
    return () => clearInterval(id);
  }, [combat, myId]);
  return live;
}

/** Crossed swords (the panel's mark): components.js's sword glyph and its mirror image. */
const SWORD = 'M20 3h1v4L10.4 17.6l1.4 1.4-1.4 1.4-2.1-2.1-3.5 3.5-1.4-1.4 3.5-3.5L4.8 14.8l1.4-1.4 1.4 1.4L18 4z';
const Swords = () => html`<svg class="icon rdmg__ic" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false">
  <path d=${SWORD} fill="currentColor" /><path d=${SWORD} fill="currentColor" transform="matrix(-1 0 0 1 24 0)" /></svg>`;

const pct = (x) => (x > 0 && x < 0.01 ? '<1%' : `${Math.round(x * 100)}%`);

/** The damage types in shared/roundDamage.js's DAMAGE_TYPES order: class and legend word (detailPanel.js DMG; 元素 = 'elemental'). */
const TYPE_MARKS = [['phys', N_('物理')], ['arts', N_('法术')], ['true', N_('真实')], ['elem', N_('元素')]];
const TABS = [['dmg', N_('伤害')], ['heal', N_('治疗')]];

/**
 * @param {{ pub: any, priv: any, myId: string, place: 'desktop'|'phone', spectator?: boolean }} props `place`: where this
 *   copy is mounted — only the one matching the layout draws
 */
export function RoundDamage({ pub, priv, myId, place, spectator = false }) {
  const enabled = useStore((s) => s.roundDamage, Object.is, settingsStore);
  const styleSet = useStore((s) => s.roundDamageStyle, Object.is, settingsStore);
  const phone = usePhoneLayout();
  const gd = useGameData();
  const [open, setOpen] = useState(() => loadPref('roundDamageOpen', false) === true);
  const [tab, setTab] = useState(() => (loadPref('roundDamageTab', 'dmg') === 'heal' ? 'heal' : 'dmg'));
  const msg = useRoundDamageMsg();
  const combat = isCombatPhase(pub?.phase);
  const mine = place === (phone ? 'phone' : 'desktop') && enabled !== false && !spectator && !!priv;
  const live = useLiveDamage(mine && combat, myId);
  const sk = skinArt(); // an operator in the skin its piece wears (pieceView.skin; ui/skins.js skinPic)
  if (!mine) return null;
  const src = roundDamageSource({ round: pub?.round ?? null, live, msg, board: priv.board, combat });
  if (!src) return null;
  const toggle = (v) => { setOpen(v); savePref('roundDamageOpen', v); };
  const full = (styleSet === 'auto' ? (phone ? 'compact' : 'full') : styleSet) === 'full';
  const heal = tab === 'heal';
  const pick = (v) => { setTab(v); savePref('roundDamageTab', v); };
  const { rows, rest, total } = roundDamageRows(src.pairs, priv.board, phone ? ROUND_DAMAGE_ROWS.phone : ROUND_DAMAGE_ROWS.desktop, /** @type {'dmg'|'heal'} */ (tab));
  const m = data.get('assets');
  const recOf = (piece) => {
    const chess = gd.chess(piece.id);
    if (!chess) return null;
    return ownStandIn(chess, priv, data.get('backups')) || ownDiyRecord(chess, priv, { chess: data.get('chess'), backups: data.get('backups') }) || chess;
  };
  return html`<div class=${cx('rdmg', phone ? 'is-phone' : 'is-desktop')}>
    <button type="button" class=${cx('rdmg__chip', open && 'is-open')} aria-expanded=${open ? 'true' : 'false'} aria-controls="rdmg-panel"
      title=${t('回合伤害统计')} onClick=${() => toggle(!open)}>
      <${Swords} /><span>${t('伤害')}</span>${src.live ? html`<i class="rdmg__dot" aria-hidden="true"></i>` : null}
    </button>
    ${open ? html`<section id="rdmg-panel" class=${cx('rdmg__panel', full ? 'is-full' : 'is-compact')} aria-label=${t('回合伤害统计')}>
      <header class="rdmg__hd">
        <${Swords} />
        <span class="rdmg__tabs" role="tablist">${TABS.map(([id, label]) => html`<button key=${id} type="button" role="tab" aria-selected=${tab === id ? 'true' : 'false'}
          class=${tab === id ? 'is-on' : ''} onClick=${() => pick(id)}>${t(label)}</button>`)}</span>
        ${src.live ? html`<span class="rdmg__tag is-live">${t('实时')}</span>` : html`<span class="rdmg__tag num">${t('回合 {n}', { n: src.round })}</span>`}
        <span class="rdmg__sp"></span>
        <button type="button" class="rdmg__x" aria-label=${t('收起')} title=${t('收起')} onClick=${() => toggle(false)}>–</button>
      </header>
      ${rows.some((r) => r.parts) ? html`<div class="rdmg__legend">${TYPE_MARKS.map(([id, label]) => html`<span key=${id} class=${`is-${id}`}>${t(label)}</span>`)}</div>` : null}
      <ol class="rdmg__rows">
        ${rows.map((r, i) => {
          const rec = recOf(r.piece);
          const name = rec?.name || r.piece.id;
          const val = html`<span class="rdmg__val num">${fmtNum(r.value)}${full ? html`<small>${pct(r.share)}</small>` : null}</span>`;
          const bar = html`<span class="rdmg__track"><i class=${r.parts ? 'is-stack' : heal ? 'is-heal' : ''} style=${`width:${(r.bar * 100).toFixed(1)}%`}>${r.parts
            ? TYPE_MARKS.map(([id], k) => (r.parts[k] > 0 ? html`<span key=${id} class=${`is-${id}`} style=${`flex-grow:${r.parts[k].toFixed(3)}`}></span>` : null)) : null}</i></span>`;
          return html`<li key=${r.uid} class=${cx('rdmg__row', !heal && i === 0 && r.value > 0 && 'is-top')} title=${`${name} · ${fmtNum(r.value)}`}>
            <${Img} class="rdmg__av" src=${rec ? skinPic(rec, 'avatar', sk, { skin: r.piece.skin }) || chessAvatarUrl(m, rec) : null} alt="" fallback=${html`<b>${[...name][0] || '?'}</b>`} />
            ${full ? html`<span class="rdmg__nm">${name}</span>${val}${bar}` : html`${bar}${val}`}
          </li>`;
        })}
      </ol>
      <footer class="rdmg__ft"><span>${rest > 0 ? t('另外 {n} 名 · 合计', { n: rest }) : t('合计')}</span><b class="num">${fmtNum(total)}</b></footer>
    </section>` : null}
  </div>`;
}
