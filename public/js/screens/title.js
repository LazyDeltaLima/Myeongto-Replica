// Title screen: season-style backdrop, big title 卫戍协议：<season> (盟约), remembered nickname, 开始, the language menu
// (中文 | English | every pack in public/i18n/, ui/lang.js; a title in an alphabetic script — English — is the big one and
// the small wordmark above it hides).
//
// Pressing 开始 validates the nickname (1..NAME_MAX_LEN chars, no control characters), stores it,
// marks this tab as "entered" (so reloads skip the title) and hands the name to net.js, which
// sends `hello` (now, or as soon as the socket is open). The router then shows the lobby.
//
// The title draws the season picked on the lobby's season chip (ui/season.js; maintainer decision 2026-11-13: the one
// place a season is picked — the title's season tabs are gone; a player who never picked opens in the newest public
// season): its art, words and wordmark — an invitation's room's when the link names it.
//
// Backdrop art: if data/assets.json lists a UI backdrop (`ui.titleBackdrop`, or one of the
// entry/loading illustration names) it is layered under the CSS art; otherwise the screen is
// pure CSS/SVG (radar, ridgelines, glow), so it never issues a request that can 404.
// Above those, the event's night / dusk lobby once its sprites have loaded (ui/allianceScene.js useLobbyArt — the scene
// the entry film, ui/entryFilm.js, ends on), and in the 盟约 season the event's logo (`entry/season_logo`) in the
// emblem's brackets at the size the film leaves it; another season keeps the dot emblem. Ported from upstream 0.3.3.
// A later season with its own art extracted (ui/seasonArt.js) draws its hub backdrop instead and its logo as the title
// (the words stay for screen readers; maintainer decision 2026-11-08). The parts marked `data-reveal` are where a season's entry clip brings its hub in while its film fades
// (ui/clipFilm.js titleReveal: back, logo, bottom, top, side).

import { useMemo, useState } from '../../vendor/hooks.module.js';
import { NAME_MAX_LEN, APP_VERSION, DEV_BUILD } from '../../../shared/constants.js';
import { html, Button, Icon, MicroLabel, TextField, PingPill } from '../ui/components.js';
import { GuideButton } from '../ui/guide.js';
import { openStats } from './stats.js';
import { toast } from '../ui/toasts.js';
import { net, identity } from '../net.js';
import { store, useStore, shallowEqual, loadPref, savePref } from '../store.js';
import { data, useData } from '../data.js';
import { FullscreenButton, detectFeatures, isIosSafari } from '../ui/device.js';
import { LangToggle, useLang } from '../ui/lang.js';
import { t, N_ } from '../../../shared/i18n.js';
import { scriptOf } from '../../../shared/i18nPacks.js';
import { GIcon } from '../ui/gameComponents.js';
import { SettingsModal } from '../ui/settings.js';
import { ResumeMatchButton } from '../ui/resumeMatch.js';
import { AboutModal } from '../ui/about.js';
import { InviteSeason, activeSeason, seasonName } from '../ui/season.js';
import { seasonInfo, DEFAULT_SEASON } from '../../../shared/seasons.js';
import { AllianceBackdrop, useLobbyArt } from '../ui/allianceScene.js';
import { seasonBackdrop, seasonLogoSet, logoSizes } from '../ui/seasonArt.js';
import { uiUrl } from '../ui/assetUrls.js';
import { Img } from '../ui/gameComponents.js';

// Same character classes as server/net.js sanitizeName (control, zero-width, bidi, BOM), so a name
// the client accepts is never rejected by the server's hello validation.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;
// Lone surrogates are removed by a scan, not a regex: the lookbehind such a regex needs is a *syntax error* in Safari
// < 16.4, which would stop the whole client from loading there.
export function stripLoneSurrogates(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
      if (n >= 0xdc00 && n <= 0xdfff) { out += str[i] + str[i + 1]; i++; }
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) continue;
    out += str[i];
  }
  return out;
}

/**
 * Normalise a nickname like the server does (NFC, strip lone surrogates / control / invisible /
 * bidi characters, collapse whitespace, trim), then clamp to NAME_MAX_LEN UTF-16 code units — the
 * protocol's `hello.name` limit — without splitting a surrogate pair.
 * @param {any} raw
 * @returns {string}
 */
export function sanitizeName(raw) {
  let s = String(raw ?? '');
  try { s = s.normalize('NFC'); } catch { /* keep as is */ }
  s = stripLoneSurrogates(s).replace(/\s+/g, ' ').replace(CONTROL_CHARS, '').replace(/ {2,}/g, ' ').trim();
  if (s.length > NAME_MAX_LEN) {
    s = s.slice(0, NAME_MAX_LEN);
    // Don't leave half a surrogate pair at the end.
    if (/[\ud800-\udbff]$/.test(s)) s = s.slice(0, -1);
    s = s.trim();
  }
  return s;
}

/** @param {any} raw @returns {boolean} */
export const isValidName = (raw) => sanitizeName(raw).length > 0;

/**
 * Enter the game shell with a nickname (title → lobby).
 * @param {string} rawName
 * @returns {boolean} false when the name is invalid
 */
export function enterSession(rawName) {
  const name = sanitizeName(rawName);
  if (!name) return false;
  identity.saveName(name);
  identity.setEntered(true);
  store.set((s) => ({ me: { ...s.me, name }, session: { ...s.session, entered: true } }));
  net.setName(name);
  return true;
}

// data/assets.json `ui` keys are 'group/key' (docs/ASSETS.md).
const BACKDROP_KEYS = ['titleBackdrop', 'entry/bkg_01', 'entry/bkg_02'];
const RIDGE_KEYS = ['titleRidges', 'entry/bg_mountains_tiled'];

/**
 * Find a UI image URL in data/assets.json (tolerant of a few plausible shapes).
 * @param {any} assets
 * @param {string[]} names
 * @returns {string|null}
 */
export function findUiAsset(assets, names) {
  if (!assets || typeof assets !== 'object') return null;
  const asUrl = (v) => {
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') return v.url || v.path || v.src || null;
    return null;
  };
  const ui = assets.ui;
  if (ui && typeof ui === 'object' && !Array.isArray(ui)) {
    for (const n of names) {
      const u = asUrl(ui[n]);
      if (u) return u;
    }
  }
  const lists = [Array.isArray(ui) ? ui : null, Array.isArray(assets.files) ? assets.files : null].filter(Boolean);
  for (const list of lists) {
    for (const n of names) {
      const hit = list.map(asUrl).find((u) => typeof u === 'string' && u.includes('/ui/') && u.toLowerCase().split('/').pop().startsWith(n.toLowerCase()));
      if (hit) return hit;
    }
  }
  return null;
}

// Dot-matrix watchtower emblem (13×14 bitmap; dots grow toward the base for depth).
const EMBLEM = [
  'XXX..XXX..XXX',
  'XXX..XXX..XXX',
  'XXXXXXXXXXXXX',
  '.XXXXXXXXXXX.',
  '..XXXXXXXXX..',
  '..XXXXXXXXX..',
  '..XXXX.XXXX..',
  '..XXXX.XXXX..',
  '..XXXXXXXXX..',
  '..XXXXXXXXX..',
  '..XXXXXXXXX..',
  '.XXXXXXXXXXX.',
  'XXXXXXXXXXXXX',
  'XXXXXXXXXXXXX',
];

export function Emblem() {
  const dots = useMemo(() => {
    const out = [];
    EMBLEM.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        if (ch !== 'X') return;
        const rad = 0.2 + (r / (EMBLEM.length - 1)) * 0.2;
        const accent = (r === 6 || r === 7) && (c === 5 || c === 7);
        out.push({ cx: c + 0.5, cy: r + 0.5, r: rad, accent, d: (r * 13 + c) % 7 });
      });
    });
    return out;
  }, []);
  return html`<div class="emblem" aria-hidden="true">
    <span class="emblem__bracket emblem__bracket--l"></span>
    <svg class="emblem__svg" viewBox="-0.5 -0.5 14 15">
      ${dots.map((d, i) => html`<circle key=${i} cx=${d.cx} cy=${d.cy} r=${d.r} class=${d.accent ? 'is-accent' : `d${d.d}`} />`)}
    </svg>
    <span class="emblem__bracket emblem__bracket--r"></span>
  </div>`;
}

/**
 * The event's logo in the emblem's brackets, sized as the entry film leaves it (its 1280×720 stage fitted to the
 * screen: the logo 144 px wide, the brackets 12 × 129 px, 4 px from it), so the film lands on the title screen.
 */
function FilmLogo({ src }) {
  const k = (px) => `min(${(px / 12.8).toFixed(3)}vw,${(px / 7.2).toFixed(3)}vh)`;
  const br = `width:${k(12)};height:${k(129)}`;
  return html`<div class="emblem emblem--logo" aria-hidden="true" style=${`gap:${k(4)}`}>
    <span class="emblem__bracket emblem__bracket--l" style=${br}></span>
    <${Img} src=${src} class="emblem__logo" style=${`width:${k(144)};height:auto`} fallback=${html`<${Emblem} />`} />
    <span class="emblem__bracket emblem__bracket--r" style=${br}></span>
  </div>`;
}

function Ridges() {
  return html`<svg class="title-bg__ridges" viewBox="0 0 1920 420" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="ridge-far" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#16231f" /><stop offset="1" stop-color="#0a0e0d" />
      </linearGradient>
      <linearGradient id="ridge-near" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0f1714" /><stop offset=".6" stop-color="#080b0a" />
      </linearGradient>
      <linearGradient id="ridge-edge" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#17f9b7" stop-opacity="0" />
        <stop offset=".3" stop-color="#17f9b7" stop-opacity=".55" />
        <stop offset=".7" stop-color="#17f9b7" stop-opacity=".55" />
        <stop offset="1" stop-color="#17f9b7" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path class="ridge ridge--far" fill="url(#ridge-far)" stroke="url(#ridge-edge)"
      d="M0 420V250l120-40 90 30 90-70 60 20 80-70 80 55 80-25 90 70 90-20 80 50 100-15 90 25 90-55 90-55 70-55 70 45 80-20 90 65 80-20 100 55 100-20 100 40v180z" />
    <path class="ridge ridge--near" fill="url(#ridge-near)" stroke="url(#ridge-edge)"
      d="M0 420V322l160-32 100 20 120-50 90 40 130-20 120 50 140-30 140 35 120-35 140 20 140-50 120 30 120-20 120 40 160-20v147z" />
  </svg>`;
}

const STATUS_TEXT = {
  idle: N_('准备连接'), connecting: N_('正在连接服务器'), connected: N_('已连接服务器'), handshaking: N_('正在验证身份'),
  online: N_('已连接服务器'), reconnecting: N_('连接中断，正在重连'), closed: N_('连接已关闭'),
};

/** The CSS heights of `.title-logo` (css/screens/title.css, a phone's in css/devices.css), for its srcset's `sizes`. */
const TITLE_LOGO_HEIGHTS = [['(max-height: 600px) and (any-pointer: coarse)', '30vh'], ['', 'min(44vh, 28vw)']];

/** Title screen component. */
export function TitleScreen() {
  const conn = useStore((s) => s.connection, shallowEqual);
  const pendingJoin = useStore((s) => s.ui.pendingJoin);
  const picked = useStore(activeSeason);
  const lang = useLang(); // re-render on a language switch
  const [name, setName] = useState(() => store.get().me.name || identity.loadName() || '');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);   // 服务器信息 (ui/about.js), the button under the login box
  const assetsSettled = useData('assets');
  useData('local'); // a later season's own art (ui/seasonArt.js)
  const assets = data.get('assets');
  // the season on screen: the picked one (the lobby's chip changes it through the dark, ui/seasonFade.js)
  const season = picked;
  const seasonBg = seasonBackdrop(season);
  const markSet = seasonLogoSet(season, lang);
  const seasonMark = markSet?.src ?? null;
  const [markBad, setMarkBad] = useState(null); // a listed logo that fails to load gives the words back
  const markOk = !!seasonMark && markBad !== seasonMark;
  const backdrop = seasonBg ? null : findUiAsset(assets, BACKDROP_KEYS);
  const ridges = seasonBg ? null : findUiAsset(assets, RIDGE_KEYS);
  // the event's night / dusk lobby behind the title once its sprites have loaded (a later season draws its own hub
  // instead); the logo in the 盟约 season, a later season's own logo as the title itself (maintainer decision 2026-11-08)
  const alliance = useLobbyArt() && !seasonBg;
  const logo = season === DEFAULT_SEASON ? uiUrl(assets, 'entry/season_logo') : null;
  // Track load/fail per URL (not as booleans reset in effects: an image can load before an effect runs).
  const [bgLoadedUrl, setBgLoadedUrl] = useState(null);
  const [ridgesLoadedUrl, setRidgesLoadedUrl] = useState(null);
  const [ridgesFailedUrl, setRidgesFailedUrl] = useState(null);
  const bgLoaded = !!backdrop && bgLoadedUrl === backdrop;
  const ridgesLoaded = !!ridges && ridgesLoadedUrl === ridges;
  const ridgesFailed = !!ridges && ridgesFailedUrl === ridges;
  // CSS ridgelines only when there is no ridge art (avoids a swap flash when the art arrives).
  const cssRidges = assetsSettled && !seasonBg && (!ridges || ridgesFailed);

  const valid = isValidName(name);
  const start = () => {
    if (!valid) { toast(t('请输入博士代号'), 'warn'); return; }
    enterSession(name);
  };

  const online = conn.status === 'online' || conn.status === 'connected';
  const dotClass = online ? 'is-on' : conn.status === 'reconnecting' || conn.status === 'connecting' || conn.status === 'handshaking' ? 'is-warn' : 'is-bad';
  // the connection row stays on one line: once a ping is measured (before the name too: the title's socket pings), the
  // green dot and the ping say it (the words stay for screen readers and as the tooltip); the 在线 count is the lobby's alone
  const statusText = STATUS_TEXT[conn.status] ? t(STATUS_TEXT[conn.status]) : conn.status;
  const showPing = online && Number.isFinite(conn.ping);

  // touch screens: no autofocus (it would pop the on-screen keyboard over a landscape phone's whole view)
  const touchUi = useMemo(() => detectFeatures().coarse, []);
  // local patch: iPhone Safari outside the home screen (no Fullscreen API, and the game page never scrolls, so its
  // address / tab bars never fold away) gets a note: Add to Home Screen opens it standalone (index.html
  // apple-mobile-web-app-capable). Closable, remembered. docs/rules/ui.md "iPhone 전체 화면 안내"
  const fsNote = useMemo(() => isIosSafari() && !detectFeatures().standalone, []);
  const [fsNoteClosed, setFsNoteClosed] = useState(() => loadPref('fsNoteClosed', false) === true);
  const closeFsNote = () => { savePref('fsNoteClosed', true); setFsNoteClosed(true); };
  // a title in an alphabetic script (English, French …) is the big one in the display face and the wordmark above it
  // hides; a CJK / kana / Hangul title keeps the Chinese layout (shared/i18nPacks.js scriptOf — a pack needs no flag)
  const alphabetic = scriptOf(t('卫戍协议')) === 'alphabetic';
  return html`<div class="screen title-screen">
    <div class=${`title-bg${bgLoaded || alliance ? ' has-art' : ''}${alliance ? ' has-alliance' : ''}${seasonBg ? ' has-season' : ''}${ridgesLoaded ? ' has-ridges' : ''}`} aria-hidden="true">
      ${alliance ? html`<${AllianceBackdrop} />` : null}
      ${seasonBg ? html`<img key=${seasonBg} class="title-bg__season" data-reveal="back" src=${seasonBg} alt="" draggable=${false} />` : null}
      ${backdrop && !alliance ? html`<img class="title-bg__art" src=${backdrop} alt="" draggable=${false}
        onLoad=${() => setBgLoadedUrl(backdrop)} />` : null}
      <div class="title-bg__glow"></div>
      <div class="title-bg__radar"><div class="title-bg__sweep"></div></div>
      <div class="title-bg__target"></div>
      ${cssRidges && !alliance ? html`<${Ridges} />` : null}
      ${ridges && !ridgesFailed && !alliance ? html`<div class="title-bg__ridge-art" style=${`background-image:url("${ridges}")`}>
        <img src=${ridges} alt="" hidden onLoad=${() => setRidgesLoadedUrl(ridges)} onError=${() => setRidgesFailedUrl(ridges)} />
      </div>` : null}
      <div class="title-bg__haze"></div>
      <span class="cross" style="left:7%;top:22%"></span>
      <span class="cross" style="left:93%;top:30%"></span>
      <span class="cross" style="left:14%;top:70%"></span>
      <span class="cross" style="left:88%;top:62%"></span>
      <span class="cross" style="left:60%;top:12%"></span>
    </div>

    <div class="title-corner title-corner--tl" data-reveal="top">
      <span class="title-corner__mark"></span>
      <div><${MicroLabel} tone="mint">RHODES ISLAND // SIMULATION SERVICE<//><br /><${MicroLabel}>TACTICAL CO-OP NODE · 02<//></div>
    </div>
    <div class="title-corner title-corner--tr" data-reveal="top">
      <div>
        <div class="title-corner__tools">
          <${Button} variant="ghost" size="sm" icon="chart" class="title-stats" onClick=${openStats} title=${t('统计数据')}>${t('统计')}<//>
          <${LangToggle} class="title-lang" />
        </div>
        <${MicroLabel} tone="hi">TARGET POINT<//><br /><${MicroLabel}>STRONGHOLD PROTOCOL<//>
      </div>
    </div>

    <main class="title-main">
      ${markOk ? html`<img key=${seasonMark} class="title-logo" data-reveal="logo" src=${seasonMark} srcset=${markSet.srcset ?? undefined}
          sizes=${markSet.srcset ? logoSizes(markSet.aspect, TITLE_LOGO_HEIGHTS) : undefined} alt="" draggable=${false} onError=${() => setMarkBad(seasonMark)} />`
        : logo ? html`<${FilmLogo} src=${logo} />` : html`<${Emblem} />`}
      ${alphabetic || markOk ? null : html`<div class="title-en">
        <span class="title-en__a">STRONGHOLD PROTOCOL</span>
        <span class="title-en__b">${seasonInfo(season).mark}</span>
      </div>`}
      <h1 class=${`title-cn${alphabetic ? ' title-cn--latin' : ''}${markOk ? ' sr-only' : ''}`}>${t('卫戍协议')}<span class="title-cn__colon">${alphabetic ? ': ' : '：'}</span><em>${seasonName(season)}</em></h1>
      <p class="title-tag" data-reveal="side">${t('调配资金与干员，与同伴协同布防，抵御多波次进攻，直至击败敌方领袖。')}</p>

      <div class="title-login" data-reveal="bottom">
        ${pendingJoin ? html`<div class="title-invite">
          <span class="title-invite__head"><${Icon} name="key" /><span>${t('收到同盟邀请')}</span><b class="num">${pendingJoin}</b></span>
          <span class="title-invite__hint t-lo">${t('· 输入代号后将自动加入')}</span>
          <${InviteSeason} />
        </div>` : null}
        <${TextField} label=${t('博士代号')} micro="CALLSIGN" size="lg" icon="user" value=${name} maxLength=${NAME_MAX_LEN}
          placeholder=${t('输入你的代号（最多 {NAME_MAX_LEN} 字）', { NAME_MAX_LEN })} autoFocus=${!touchUi}
          onInput=${setName} onEnter=${start} />
        <${Button} variant="primary" size="xl" block=${true} iconRight="chevrons" disabled=${!valid} onClick=${start}>${t('开始')}<//>
        <div class="title-conn">
          <span class="title-conn__status" title=${statusText}>
            <span class=${`status-dot ${dotClass}`}></span>
            <span class=${showPing ? 'sr-only' : null}>${statusText}</span>
            ${showPing ? html`<${PingPill} ms=${conn.ping} />` : null}
          </span>
          <span class="title-conn__tools">
            <${GuideButton} class="title-guide" label=${t('玩法说明')} />
            <button type="button" class="title-settings fsbtn tapx" aria-label=${t('设置')} title=${t('设置')}
              onClick=${() => setSettingsOpen(true)}><${GIcon} name="gear" /></button>
            <${FullscreenButton} class="title-fs" />
          </span>
        </div>
      </div>
      <div class="title-links" data-reveal="side">
        <button type="button" class="title-link tapx" onClick=${() => setAboutOpen(true)}>${t('服务器信息')}</button>
      </div>
    </main>

    <${SettingsModal} open=${settingsOpen} onClose=${() => setSettingsOpen(false)} />
    <${AboutModal} open=${aboutOpen} onClose=${() => setAboutOpen(false)} />

    ${fsNote && !fsNoteClosed ? html`<div class="title-fsnote" role="note">
      <${Icon} name="expand" />
      <span>${t('全屏游玩：在 Safari 点「分享」→「添加到主屏幕」，然后从主屏幕图标打开。')}</span>
      <button type="button" class="title-fsnote__close tapx" aria-label=${t('关闭')} title=${t('关闭')} onClick=${closeFsNote}><${Icon} name="close" /></button>
    </div>` : null}

    <footer class="title-foot" data-reveal="side">
      <${ResumeMatchButton} />
      <span>${t('非官方同人复刻 · 与上海鹰角网络 / Yostar 无关 · 仅限非商业用途 · 游戏素材版权归原权利人所有')}</span>
      <${MicroLabel}>v${APP_VERSION} · WEB SIMULATION<//>
      ${DEV_BUILD ? html`<span class="title-dev" role="note">${t('开发版 · 不稳定，请勿用于公开服务器')}</span>` : null}
    </footer>
  </div>`;
}
