// Read-only in-match spectator roster (maintainer decision 2026-11-18).
// room.state owns the roster in both seasons, including disconnected seats retained by the server. The HUD shows the
// button only while the roster has someone in it (spectatorCount; ui/hud.js TopBar).
import { useEffect, useMemo, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Icon, MicroLabel } from './components.js';
import { GIcon } from './gameComponents.js';
import { buffBtnSprite } from './effectsList.js';
import { data, localAsset } from '../data.js';
import { useStore } from '../store.js';
import { useLang } from './lang.js';
import { t } from '../../../shared/i18n.js';

/** url → Promise of the plate's data URL (null: not the 59 × 37 sprite this knows, or it failed to load) */
const plates = new Map();

/**
 * The 强化效果 button's sprite (buffBtnSprite) with its cube painted over, for the eye and the count (maintainer decision
 * 2026-11-19: the spectator button looks like the 强化效果 one). The cube and its glow sit in x 9–33 of the 59 × 37
 * sprite and column 40 is bare plate from edge to edge, so that column is copied over them: the frame keeps the sprite's
 * own pixels, nothing is stretched. Another size (a later theme's art) is not guessed at: null, the look-alike box.
 * @param {string|null} url @returns {Promise<string|null>}
 */
export function cubeFreePlate(url) {
  if (!url || typeof document === 'undefined') return Promise.resolve(null);
  let p = plates.get(url);
  if (!p) {
    p = (async () => {
      const img = new Image();
      img.src = url;
      await img.decode();
      if (img.naturalWidth !== 59 || img.naturalHeight !== 37) return null;
      const c = document.createElement('canvas');
      c.width = 59; c.height = 37;
      const g = c.getContext('2d');
      if (!g) return null;
      g.drawImage(img, 0, 0);
      for (let x = 9; x <= 33; x++) { g.clearRect(x, 0, 1, 37); g.drawImage(c, 40, 0, 1, 37, x, 0, 1, 37); }
      return c.toDataURL();
    })().catch(() => null);
    plates.set(url, p);
  }
  return p;
}

/** @param {boolean} open @returns {string|null} the plate once made — both states at once, so the first opening does
 * not flash the look-alike */
function usePlate(open) {
  const m = data.get('assets');
  const shut = buffBtnSprite(m, false);
  const opened = buffBtnSprite(m, true);
  const [made, setMade] = useState(/** @type {Record<string, string|null>} */ ({}));
  useEffect(() => {
    let live = true;
    for (const url of [shut, opened]) {
      if (url) cubeFreePlate(url).then((v) => { if (live) setMade((o) => (o[url] === v ? o : { ...o, [url]: v })); });
    }
    return () => { live = false; };
  }, [shut, opened]);
  const url = open ? opened : shut;
  return url ? made[url] ?? null : null;
}

const seatsOf = (roster) => (Array.isArray(roster) ? roster : []).filter((s) => s && typeof s.playerId === 'string');

/** How many spectator seats the room has (room.state.spectators, well-formed rows only): a number, so the top bar that
 * reads it redraws only when it changes. @param {any} room @returns {number} */
export function spectatorCount(room) { return seatsOf(room?.spectators).length; }

/**
 * The eye button and its roster window; the caller mounts it only while spectatorCount is above 0. Drawn as the
 * 强化效果 button left of the bar, mirrored: the same box and plate (cubeFreePlate), the eye where its cube is
 * (css/screens/game.css).
 */
export function Spectators() {
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
  const plate = usePlate(open);
  return html`<div class=${`buffs spectators${open ? ' is-open' : ''}`} ref=${root}>
    <button type="button" class=${plate ? 'buffs__btn tapx has-sprite' : 'buffs__btn tapx'} ref=${button} data-testid="spectators-open"
      style=${plate ? `--buff-sprite:url("${plate}")` : undefined}
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
