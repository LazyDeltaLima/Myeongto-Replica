// A room drawn small. The event room's mode capsule (auto_chess_room_state group_mode, the official sprites bg_mode /
// light_mode / icon_<difficulty>): 赛季 | 规则 | 难度 | 人数 in one dark capsule with thin white lines. The waiting room's
// mode bar (screens/room.js ModeBar) is the capsule as a button with the round switch; the public room list
// (ui/publicRooms.js) and matchmaking's offer of a public room (ui/matchQueue.js) draw it small and read-only
// (ModeCapsule), with the room's seats as squares (RoomSeats: a Doctor's 名片干员 avatar in the skin it wears, an AI
// teammate, an empty seat).
// css/screens/room.css `.rs-mode`, css/screens/lobby.css `.pubroom__seat`.

import { DIFFICULTY_NAMES } from '../../../shared/constants.js';
import { html, DifficultyIcon, Icon } from './components.js';
import { uiUrl, chessAvatarUrl } from './assetUrls.js';
import { data } from '../data.js';
import { t } from '../../../shared/i18n.js';
import { presetName } from './ruleset.js';
import { SeasonSeg } from './season.js';
import { useCardOperators } from './seatCards.js';
import { skinArt, skinPic } from './skins.js';
import { settingsStore } from './settings.js';
import { useStore } from '../store.js';

/**
 * The event room's group_mode per difficulty (auto_chess_room_state root_easy / _normal / _hard / _abyss, in the order of
 * DIFFICULTIES): its icon, and the colour of its name and light (light_mode, white, tinted). icon_easy is white and
 * tinted too; the other three icons carry their colour.
 */
export const MODE_ROOTS = Object.freeze({
  FUNNY: { icon: 'icon_easy', color: '#ffa015', tint: true },
  NORMAL: { icon: 'icon_normal', color: '#f25203' },
  HARD: { icon: 'icon_hard', color: '#e32525' },
  ABYSS: { icon: 'icon_abyss', color: '#ff0024' },
});

/**
 * The capsule's sprites for a difficulty (null where the install has no art: the capsule then draws a dark pill with the
 * project's icons) and the style that hands them to room.css.
 * @param {string} difficulty @param {any} [m] the assets manifest
 */
export function modeArt(difficulty, m = data.get('assets')) {
  const root = MODE_ROOTS[difficulty] || MODE_ROOTS.FUNNY;
  const art = (k) => uiUrl(m, `room/${k}`);
  const bg = art('bg_mode'), light = art('light_mode'), icon = art(root.icon), knob = art('btn_switch_mode');
  const url = (u) => (u ? `url("${u}")` : 'none');
  return { root, bg, light, icon, knob, style: `--rm-bg:${url(bg)}; --rm-light:${url(light)}; --rm-ico:${url(icon)}; --rm-knob:${url(knob)}; --rm-c:${root.color}` };
}

/**
 * The capsule's 规则 | 难度 | 人数 parts. `name`: the difficulty's (or 规程等级's) name, the difficulty's own by default;
 * `code`: its AC-MP code, none when absent; `size`: none when null; `ids`: the waiting room's test ids.
 */
export function ModeSegs({ art, ruleset, difficulty, name = null, code = null, size = null, ids = false }) {
  const label = name ?? (DIFFICULTY_NAMES[difficulty] ? t(DIFFICULTY_NAMES[difficulty]) : '');
  return [
    html`<span key="r" class=${`rs-mode__seg rs-mode__rules rtag--${typeof ruleset === 'string' ? ruleset : ruleset?.preset}`} data-testid=${ids ? 'room-ruleset' : null}>${presetName(ruleset)}</span>`,
    html`<span key="d" class="rs-mode__seg rs-mode__diff">
      ${art.light ? html`<i class="rs-mode__light" aria-hidden="true"></i>` : null}
      ${art.icon ? html`<i class=${`rs-mode__ico${art.root.tint ? ' is-tint' : ''}`} aria-hidden="true"></i>` : html`<${DifficultyIcon} difficulty=${difficulty} />`}
      <span class="rs-mode__name">${label}</span>${code ? html`<span class="num rs-mode__code">${code}</span>` : null}
    </span>`,
    size != null ? html`<span key="s" class="rs-mode__seg rs-mode__size" data-testid=${ids ? 'room-size' : null}>${t('{n}人', { n: size })}</span>` : null,
  ];
}

/**
 * The capsule, read-only and drawn only (a public room's row, matchmaking's offer): `season` adds the season part in
 * front (a room of another season than the picked one; ui/season.js SeasonSeg).
 */
export function ModeCapsule({ season = null, ruleset, difficulty, size = null, class: cls = '' }) {
  const art = modeArt(difficulty);
  return html`<span class=${`rs-mode is-ro rs-mode--tag${art.bg ? '' : ' no-art'} ${cls}`.trim()} style=${art.style}>
    ${season ? html`<${SeasonSeg} season=${season} />` : null}
    <${ModeSegs} art=${art} ruleset=${ruleset} difficulty=${difficulty} size=${size} />
  </span>`;
}

/**
 * A room's seats as squares (lobby.rooms / room.matchFound `room` seats: { kind: 'human' | 'bot' | 'empty', host?, card?,
 * skin? }): a Doctor's 名片干员 avatar (`card`; the user glyph without one — the list carries no player id, so no default
 * card) in the skin that Doctor chose for it (`skin`, as the waiting room's seat card wears it: another Doctor's, so only
 * with 其他玩家的皮肤 on; docs/rules/ui.md 「스킨 고르기」), the host's with the crown, an AI teammate (a Doctor who comes in
 * takes its seat), an empty seat.
 */
export function RoomSeats({ seats, size }) {
  const { cards } = useCardOperators();
  const others = useStore((x) => x.otherSkins !== false, Object.is, settingsStore);
  const m = data.get('assets');
  const sk = skinArt();
  const list = Array.isArray(seats) ? seats : [];
  return html`<span class=${`pubroom__seats${size > 4 ? ' is-8' : ''}`}>
    ${list.map((s, i) => {
      if (s?.kind === 'bot') return html`<i key=${i} class="pubroom__seat is-bot" title=${t('AI 队友')}><${Icon} name="robot" /></i>`;
      if (s?.kind !== 'human') return html`<i key=${i} class="pubroom__seat is-empty"><${Icon} name="plus" /></i>`;
      const rec = s.card && cards.byChar ? cards.byChar.get(s.card) : null;
      const src = rec ? skinPic(rec, 'avatar', sk, { skin: others ? s.skin : null }) || chessAvatarUrl(m, rec) : null;
      return html`<i key=${i} class=${`pubroom__seat is-human${s.host ? ' is-host' : ''}`}>
        ${src ? html`<img src=${src} alt="" draggable=${false} />` : html`<${Icon} name="user" />`}
        ${s.host ? html`<b class="pubroom__crown" title=${t('创建者')}><${Icon} name="crown" /></b>` : null}
      </i>`;
    })}
  </span>`;
}
