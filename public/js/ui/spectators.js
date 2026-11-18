// Read-only in-match spectator roster (maintainer decision 2026-11-18).
// room.state owns the roster in both seasons, including disconnected seats retained by the server. The HUD shows the
// button only while the roster has someone in it (spectatorCount; ui/hud.js TopBar).
import { useEffect, useMemo, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Icon, MicroLabel } from './components.js';
import { GIcon } from './gameComponents.js';
import { localAsset } from '../data.js';
import { useStore } from '../store.js';
import { useLang } from './lang.js';
import { t } from '../../../shared/i18n.js';

const seatsOf = (roster) => (Array.isArray(roster) ? roster : []).filter((s) => s && typeof s.playerId === 'string');

/** How many spectator seats the room has (room.state.spectators, well-formed rows only): a number, so the top bar that
 * reads it redraws only when it changes. @param {any} room @returns {number} */
export function spectatorCount(room) { return seatsOf(room?.spectators).length; }

/**
 * The eye button and its roster window; the caller mounts it only while spectatorCount is above 0. `theme`: the 🔍 on
 * its left draws a season theme's art (ui/hud.js checkSprite), whose height and level the button follows
 * (css/screens/game.css).
 */
export function Spectators({ theme = false }) {
  useLang();
  const roster = useStore((s) => s.room?.spectators);
  const list = useMemo(() => seatsOf(roster), [roster]);
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const button = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    const esc = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc, true); };
  }, [open]);
  const close = () => { setOpen(false); button.current?.focus(); };
  const bg = localAsset('ui/battle', 'bg_player_info');
  return html`<div class=${`buffs spectators${theme ? ' is-theme' : ''}${open ? ' is-open' : ''}`} ref=${root}>
    <button type="button" class="buffs__btn tapx" ref=${button} data-testid="spectators-open"
      aria-haspopup="dialog" aria-expanded=${open} aria-controls=${open ? 'match-spectators' : undefined}
      aria-label=${t('观战者 {n} 人，查看名单', { n: list.length })}
      onKeyDown=${(e) => { if (e.key === ' ') e.stopPropagation(); }} onClick=${() => setOpen((v) => !v)}>
      <${GIcon} name="eye" class="buffs__ic" /><b class="buffs__n num" data-testid="spectators-count" aria-live="polite" aria-atomic="true">${list.length}</b>
    </button>
    ${open ? html`<section id="match-spectators" class="buffs__dlg brackets spectators__dialog" role="dialog" aria-label=${t('观战席名单')}
      style=${bg ? `--buff-bg:url("${bg}")` : undefined}>
      <header class="edrawer__top spectators__head"><h3>${t('观战者')} <b class="num">${list.length}</b><${MicroLabel}>SPECTATORS</${MicroLabel}></h3>
        <button type="button" class="edrawer__close" aria-label=${t('关闭')} data-testid="spectators-close" onClick=${close}><${Icon} name="close" /></button>
      </header>
      <ul class="buffs__list spectators__list">${list.map((s) => html`<li key=${s.playerId}
        class=${`buffs__row spectators__row${s.connected === false ? ' is-offline' : ''}`} data-player-id=${s.playerId}>
        <span class="spectators__person"><${Icon} name=${s.connected === false ? 'wifiOff' : 'user'} /></span>
        <span class="buffs__name spectators__name">${s.name || t('博士')}</span>
      </li>`)}</ul>
    </section>` : null}
  </div>`;
}
