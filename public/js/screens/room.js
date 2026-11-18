// Room screen (同盟等待室), laid out like the event's room after upstream 0.3.3 (the maintainer's mockups of 2026-11-07 and
// 2026-11-08): tall seat cards (the 名片干员 portrait or the avatar frame, 创建者 / AI 队友, the state at the bottom — the
// host's card shows 创建者 there, the host never readies —, the name plate under the card; an empty seat offers 邀请 —
// copies the key — and, to the host, 添加 AI 队友, nothing else; the host's 移出 / 移除 AI 队友 at a card's top right),
// the top bar (leave — the briefing's red square —, mode and ping, 统计 / 设置 / 玩法说明, the 同盟密钥 with 复制 / the
// link), the room chat at the left with 干员调配 under it (on a short screen the chat is the same column and 干员调配 stays
// in the top bar), and the bottom: the ready count, the status line, the 观战席 and 「AI 队友最后选择」, then the mode bar,
// 匹配补位 and the big 开始模拟 / 准备就绪 button.
// The mode bar is the event room's group_mode (auto_chess_room_state, the official sprites bg_mode / light_mode /
// icon_<difficulty> / btn_switch_mode): one dark capsule of 赛季 | 规则 | 难度 | 人数 with thin white lines and the round
// switch at its end, no labels. The whole bar is one button, like the event's (its touch area spans the bar): it opens
// 选择模拟协议 (screens/lobby.js ProtocolSelect with ProtoRules' 规则 and 人数 rows) over the room — the host's 确认
// sends room.setRuleset, room.setSize and room.setDifficulty, the dialog closes once the server took them; everybody
// else (and the host while the room matchmakes) opens it read-only and sees no switch. 自定义 rules are edited (host) or
// viewed there, by the ⚙ of the 规则 row (ui/customRules.js).
// 名片干员 (ui/seatArt.js): a Doctor's card shows an operator's portrait — the one the player picked (更换立绘 on one's own
// seat opens the picker; kept as a pref and sent as room.card by ui/cardSync.js, so the room sees it as seats[].card),
// else one of the 5★/6★ operators chosen by the player id, the same on every client. Without the art the card keeps its
// avatar frame; a bot keeps its robot frame. The operator wears its player's skin (seatCardSkin: the skin's portrait,
// with the skin data; the default portrait when that one fails).
//
// Start rule (server/lobby.js): room.start needs every *other* human connected and ready; the
// host's start counts as the host's ready. So 开始模拟 is enabled exactly then and sends room.start
// alone (no separate room.ready round trip that could leave the host "ready" after a failed start).
// Solo rooms show a single seat and the briefing beside it.
// Spectator seats (community report #26, a remake feature): the 观战席 in the status line — names, offline marks, the
// host's ✕ (room.removeSpectator) and the host's pick of the seat count (room.setSpectatorSeats) — and a spectator's own
// view swaps the ready button for 入座 (room.join of the room) while a player seat is free, else 预约座位 / 取消预约
// (room.reserveSeat). The way back (maintainer decision 2026-11-15): 前往观战席 in one's own seat card's ⋯ menu sends
// room.spectate of the room (toSpectateOption; the host confirms first: the host role passes on).
// 랜덤 매칭 for the empty seats (server/matchmaking.js, maintainer decision 2026-10-13): a co-op host with fewer Doctors
// than seats gets 匹配补位 (room.queueRoom, under the start rule: every other Doctor ready; the AI seats are freed). While
// the room waits (room.state `matching`) the status line shows the waiting time and the queue, every Doctor's main button
// is 取消匹配 (room.unqueue: the whole room leaves the queue), and the difficulty, rules, size, AI seats and start are
// locked; the confirmation of a formed group is ui/matchQueue.js's dialog. An 8-seat room waiting in a queue of five or
// more gets 提议提前开始 (room.queueVote, maintainer decision 2026-11-02). A 自定义 room matchmakes alone and only 快速匹配
// Doctors fill it (maintainer decision 2026-11-07, fillOption): its button's badge counts the difficulty's 快速匹配 queue.
// 규칙 모드 (shared/ruleset.js, maintainer decisions 2026-10-15, 2026-10-18): 经典 / 休闲 / 自定义, host only, locked while
// matchmaking like the difficulty. 自定义 takes the host's settings (ui/customRulesStore.js).
// The 8-player mode (maintainer decisions 2026-10-16, 2026-10-19): a room of `size` 8 shows its 8 seats in two rows, has no
// AI teammates (no add button, no 「AI 队友最后选择」), starts with LARGE_MIN_PLAYERS Doctors or more (SEATS_OPEN: 开始模拟
// stays locked below that and says so; maintainer decision 2026-11-01) and fills its empty seats from the 8-player queues.
// 人数 (room.setSize, maintainer decision 2026-11-02; on 选择模拟协议 since 2026-11-08): 4 is locked while more than four
// seats are taken; 8 asks first when AI seats would go.
// Texts go through t() (docs/I18N.md).

import { useCallback, useEffect, useMemo, useRef, useState } from '../../vendor/hooks.module.js';
import { DIFFICULTIES, DIFFICULTY_NAMES, DIFFICULTY_COLORS, LARGE_MIN_PLAYERS, MAX_SEATS, MIN_SPECTATORS, SPECTATOR_SEATS, seatsOf, modeIdFor, gradeDifficulty, isGrade } from '../../../shared/constants.js';
import { SeatMark } from '../ui/faction.js'; // local patch
import {
  html, Button, Icon, MicroLabel, AvatarFrame, DifficultyIcon, Tooltip, Spinner, Modal, TextField, confirmDialog, doctorNo, useTicker,
} from '../ui/components.js';
import { toast, toastError } from '../ui/toasts.js';
import { copyText } from '../ui/clipboard.js';
import { GuideButton } from '../ui/guide.js';
import { openStats } from './stats.js';
import { SettingsButton, settingsStore } from '../ui/settings.js';
import { LoadoutButton } from './loadout.js';
import { ConsoleToggle } from '../ui/consoleToggle.js'; // local patch: 콘솔 모드
import { net } from '../net.js';
import { useDocClass, useMediaQuery, SHORT_SCREEN_QUERY } from '../ui/device.js';
import { store, useStore, shallowEqual, emptyMatch, isSpectating, reservedRank, savePref } from '../store.js';
import { difficultyInfo, gradeInfo, gradeName, ProtocolSelect, ProtoRules, CustomBrief } from './lobby.js';
import { RoomChat } from '../ui/chat.js';
import { ExitTile } from '../ui/matchChrome.js';
import { MatchQueueDialog, mmss, canProposeStart, proposeStart } from '../ui/matchQueue.js';
import { audio } from '../audio.js';
import { t, tc } from '../../../shared/i18n.js';
import { playerName } from '../../../shared/botNames.js';
import { resolveRuleset, officialBans } from '../../../shared/ruleset.js';
import { presetName, queueCountOf } from '../ui/ruleset.js';
import { CustomRulesDialog, openCustomRules } from '../ui/customRules.js';
import { customDraft, customRulesStore } from '../ui/customRulesStore.js';
import { customSummary } from '../ui/customSummary.js';
import { data, useData, getBond, getBoss, getConfig, getMode } from '../data.js';
import { chessAvatarUrl, chessPortraitUrl, uiUrl } from '../ui/assetUrls.js';
import { Sprite } from '../ui/gameComponents.js';
import { CARD_KEY, cardStore, setCard, cardOperators, cardContext, seatOperator, seatArtSrc, seatCardSkin } from '../ui/seatArt.js';
import { skinsStore, SKINS_KEY, loadSkinCatalog, skinArt, skinPic } from '../ui/skins.js';
import { resStore } from '../resources.js';
import { DEFAULT_SEASON, seasonOf } from '../../../shared/seasons.js';
import { RoomSeasonSeg, seasonName, seasonQueueCounts, seasonQuickCounts } from '../ui/season.js';

/**
 * Seats padded to the room's capacity (co-op 4 or its `size` 8, solo 1), each null or a seat record.
 * @param {any} room room.state payload
 * @returns {(null | {seat:number, playerId:any, name:string, isBot:boolean, ready:boolean, connected:boolean, card?:string})[]}
 */
export function normalizeSeats(room) {
  const cap = room?.mode === 'solo' ? 1 : seatsOf(room?.size);
  const src = Array.isArray(room?.seats) ? room.seats : [];
  const out = [];
  for (let i = 0; i < cap; i++) {
    const s = src[i];
    out.push(s && typeof s === 'object' ? { ...s, seat: Number.isInteger(s.seat) ? s.seat : i } : null);
  }
  return out;
}

/**
 * Derived room facts for the local player.
 * @param {any} room
 * @param {any} myId
 */
export function roomFacts(room, myId) {
  const seats = normalizeSeats(room);
  const occupied = seats.filter(Boolean);
  const humans = occupied.filter((s) => !s.isBot);
  const mine = occupied.find((s) => s.playerId === myId) || null;
  const isHost = room?.hostId != null && room.hostId === myId;
  const others = humans.filter((s) => s.playerId !== myId);
  // The host never readies: starting the match is the host's ready (server rule), so the count
  // treats the host as ready — "已就绪 0/1" next to "准许进入模拟" would contradict itself.
  const isReady = (s) => !!s.ready || s.playerId === room?.hostId;
  const readyHumans = humans.filter(isReady).length;
  const othersReady = others.every((s) => s.ready && s.connected !== false);
  // SP_MAX_BOTS (local patch): room.state maxBots, null = only the seats limit the AI teammates
  const maxBots = Number.isInteger(room?.maxBots) && room.maxBots >= 0 ? room.maxBots : null;
  const botCount = occupied.filter((s) => s.isBot).length;
  // the 8-player mode: no AI teammates, and the match starts with LARGE_MIN_PLAYERS Doctors or more (server/lobby.js SEATS_OPEN)
  const large = room?.mode !== 'solo' && seatsOf(room?.size) > MAX_SEATS;
  // room.state largeBots: a local debug server lets AI seats fill the 8-player room (server/local-patch.js largeBots)
  const largeBots = large && room?.largeBots === true;
  const seatsOpen = large && (largeBots ? occupied.length < LARGE_MIN_PLAYERS : humans.length < LARGE_MIN_PLAYERS || botCount > 0);
  return {
    seats, occupied, humans, mine, isHost, readyHumans, isReady, maxBots, botCount, large, seatsOpen,
    canAddBot: room?.mode !== 'solo' && (!large || largeBots) && isHost && (maxBots == null || botCount < maxBots),
    emptySeats: seats.filter((s) => !s).length,
    canStart: isHost && othersReady && !!mine && !seatsOpen,
    // 匹配补位: the ready rule alone (the seats it fills are the open ones)
    canQueue: isHost && othersReady && !!mine,
    othersReady,
    // spectator seats (never players: not in `humans`, never counted for ready / start)
    spectators: Array.isArray(room?.spectators) ? room.spectators.filter((s) => s && typeof s === 'object') : [],
    spectatorSeats: SPECTATOR_SEATS.includes(room?.spectatorSeats) ? room.spectatorSeats : MIN_SPECTATORS,
    spectating: isSpectating(room, myId),
  };
}

/**
 * How many Doctors took a player seat between two room.state payloads — the official room's join cue
 * (client AutoChessRoomState._HandlePlayersDeltaResult plays ON_ACT1AUTOCHESS_PLAYER_JOINROOM once when its new-player
 * count is above 0; maintainer decision 2026-10-14). The page's own player and AI seats never count; another room
 * (a new code) and a room whose match started give 0.
 * @param {any} prev the previous room.state payload @param {any} room @param {any} myId
 */
export function joinedDoctors(prev, room, myId) {
  if (!prev || !room || prev.code !== room.code || room.inMatch) return 0;
  const was = new Set(roomFacts(prev, myId).humans.map((s) => s.playerId));
  return roomFacts(room, myId).humans.filter((s) => s.playerId !== myId && !was.has(s.playerId)).length;
}

/**
 * The co-op room option 「AI 队友最后选择」 (GitHub #338; room.setAiPicksLast, room.state.aiPicksLast): in the strategy and
 * 机变 drafts every human picks before the AI teammates. null in a solo room and an 8-seat room (no AI teammates); otherwise its state (off
 * when the server sends none) and whether this player may switch it — the host only, the others see it read-only.
 * @param {any} room room.state payload
 * @param {any} myId
 * @returns {{ on: boolean, editable: boolean } | null}
 */
export function aiLastOption(room, myId) {
  if (!room || room.mode === 'solo' || room.size > 4) return null;
  return { on: room.aiPicksLast === true, editable: room.hostId != null && room.hostId === myId };
}

/**
 * 前往观战席 (maintainer decision 2026-11-15; server/lobby.js header): a Doctor seated in a co-op room's lobby may move to a
 * spectator seat. null where the server refuses it outright — a solo room, a running match, a matchmaking room, a
 * spectator, the room's last Doctor (a spectator keeps no room alive); `enabled` false while every spectator seat is taken.
 * @param {any} room room.state payload
 * @param {ReturnType<typeof roomFacts>} facts
 * @returns {{ enabled: boolean } | null}
 */
export function toSpectateOption(room, facts) {
  if (!room || room.mode === 'solo' || room.inMatch || room.matching || !facts.mine || facts.mine.isBot || facts.humans.length < 2) return null;
  return { enabled: facts.spectators.length < facts.spectatorSeats };
}

/**
 * The 人数 switch of a co-op room (room.setSize; header): its size, whether this player may switch it — the host, while
 * the room is not matchmaking —, whether 4 seats can hold everybody seated (spectators do not count) and how many AI
 * seats switching to 8 would free (none in local debug mode, room.state largeBots). null in a solo room.
 * @param {any} room room.state payload
 * @param {any} myId
 * @returns {{ size: number, editable: boolean, shrinkable: boolean, bots: number } | null}
 */
export function sizeOption(room, myId) {
  if (!room || room.mode === 'solo') return null;
  const taken = normalizeSeats(room).filter(Boolean);
  return {
    size: seatsOf(room.size),
    editable: room.hostId != null && room.hostId === myId && !room.matching,
    shrinkable: taken.length <= MAX_SEATS,
    bots: room.largeBots === true ? 0 : taken.filter((s) => s.isBot).length,
  };
}

/**
 * 규칙 모드 of a room (room.state.ruleset; the default preset when the server sends none) and whether this player may
 * change it — the host, while the room is not matchmaking.
 * @param {any} room room.state payload
 * @param {any} myId
 * @returns {{ preset: string, editable: boolean } | null}
 */
export function rulesetOption(room, myId) {
  if (!room) return null;
  return { preset: resolveRuleset(room.ruleset).preset, editable: room.hostId != null && room.hostId === myId && !room.matching };
}

/**
 * The 匹配补位 button of a co-op room (header): shown to the host while seats are open and the room is not matchmaking;
 * `waiting` = the Doctors its queue would draw from — the room's difficulty, ruleset and size, or for a 自定义 room the
 * difficulty's 快速匹配 queue (only 快速匹配 Doctors fill it, maintainer decision 2026-11-07). null when not shown.
 * @param {any} room room.state payload
 * @param {ReturnType<typeof roomFacts>} facts
 * @param {{ counts4?: any, counts8?: any, quick?: any }} [queues] lobby.queueCounts of the room's season
 * @returns {{ enabled: boolean, custom: boolean, waiting: number } | null}
 */
export function fillOption(room, facts, { counts4 = null, counts8 = null, quick = null } = {}) {
  if (!room || room.mode === 'solo' || !facts.isHost || room.matching || facts.humans.length >= facts.seats.length) return null;
  const preset = resolveRuleset(room.ruleset).preset;
  const custom = preset === 'custom';
  const waiting = custom
    ? (Number.isFinite(quick?.[room.difficulty]) ? quick[room.difficulty] : 0)
    : queueCountOf(facts.large ? counts8 : counts4, preset, room.difficulty);
  return { enabled: facts.canQueue, custom, waiting };
}

/**
 * Invite link for a room code (current page URL with ?room=CODE; a room of another 卫戍协议 season than the default adds
 * &season=<id>, so the invited title names it: ui/season.js).
 */
export function inviteLink(code, season = DEFAULT_SEASON) {
  const loc = globalThis.location;
  const base = loc ? `${loc.origin}${loc.pathname}` : '';
  return `${base}?room=${encodeURIComponent(code)}${seasonOf(season) !== DEFAULT_SEASON ? `&season=${seasonOf(season)}` : ''}`;
}

/**
 * The copied invitation: the link with its invitation line (#103: 「{name}邀请你加入卫戍协议：盟约【{difficulty}】」), then
 * the room's size and 规则 preset, and in a 自定义 room its differences from the official rules, one per line, as the
 * match screens list them (ui/customSummary.js).
 * @param {any} room room.state payload
 * @param {string} name the inviting Doctor's name
 * @returns {string}
 */
export function inviteMessage(room, name) {
  const difficulty = DIFFICULTY_NAMES[room?.difficulty] ? t(DIFFICULTY_NAMES[room.difficulty]) : '';
  const rs = resolveRuleset(room?.ruleset);
  const out = [
    `${inviteLink(room?.code ?? '', room?.season)} ${seasonOf(room?.season) === DEFAULT_SEASON
      ? t('{name}邀请你加入卫戍协议：盟约【{difficulty}】', { name: name ?? '', difficulty })
      : t('{name}邀请你加入卫戍协议：{season}【{difficulty}】', { name: name ?? '', season: seasonName(room.season), difficulty })}`,
    `${t('{n} 人同盟', { n: seatsOf(room?.size) })} · ${presetName(rs)}`,
  ];
  if (rs.custom) {
    const mode = DIFFICULTIES.includes(room.difficulty) ? getMode(modeIdFor('coop', room.difficulty)) : null;
    const lookup = { bond: getBond, boss: getBoss, stage: (id) => data.lendable('stages', id), type: (id) => data.lendable('types', id) };
    const lines = customSummary(rs.custom, {
      bans: officialBans(getConfig(), room.difficulty, room.size),
      rounds: Number.isInteger(mode?.lastRound) ? mode.lastRound : null,
      name: (kind, id) => lookup[kind](id)?.name || id,
      hidden: (id) => !!getBoss(id)?.hidden,
    });
    if (lines.length) out.push(t('自定义规则'), ...lines.map((l) => `- ${l.text}`));
    else out.push(t('{who}：{list}', { who: t('自定义规则'), list: t('与官方规则相同') }));
  }
  return out.join('\n');
}

/**
 * Copy text to the clipboard (async API with a textarea fallback for insecure contexts). Moved to ui/clipboard.js so
 * 干员调配 can use it without importing this screen (which imports loadout.js): re-exported here for existing callers.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export { copyText };

/** A picker tile's avatar; the name's first character when there is no art or it fails to load. */
function CardThumb({ src, name }) {
  const [bad, setBad] = useState(false);
  return html`<span class="cardpick__img">${src && !bad
    ? html`<img src=${src} alt="" loading="lazy" draggable=${false} onError=${() => setBad(true)} />`
    : html`<span class="cardpick__glyph">${[...(name || '?')][0]}</span>`}</span>`;
}

/**
 * 名片干员 picker (更换立绘 on one's own seat card): the operators a seat card can show (ui/seatArt.js cardOperators —
 * search by name, rarity tabs) and 默认, no pick: the card shows the operator chosen by the player id. Picking closes it;
 * the current choice takes the focus.
 */
function CardPicker({ current, list, m, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [star, setStar] = useState(0);
  const stars = useMemo(() => [...new Set(list.map((c) => c.rarity).filter((r) => r > 0))].sort((a, b) => b - a), [list]);
  const known = !!current && list.some((c) => c.charId === current);
  const sk = skinArt(); // the list in this browser's chosen skin (docs/rules/ui.md 「스킨 고르기」)
  const needle = q.trim().toLowerCase();
  const shown = list.filter((c) => (!star || c.rarity === star)
    && (!needle || [c.name, c.appellation].some((v) => String(v || '').toLowerCase().includes(needle))));
  return html`<${Modal} open=${true} class="cardpick" micro="SEAT CARD OPERATOR" title=${t('名片干员')} width="min(10.4rem, 96vw)"
      onClose=${onClose} actions=${html`<${Button} variant="ghost" onClick=${onClose}>${t('关闭')}<//>`}>
    <div class="cardpick__bar">
      <${TextField} class="cardpick__search" size="sm" icon="search" value=${q} onInput=${setQ} placeholder=${t('搜索干员')} />
      <div class="cardpick__stars" role="radiogroup" aria-label=${t('稀有度')}>
        ${[0, ...stars].map((v) => html`<button key=${v} type="button" role="radio" aria-checked=${star === v ? 'true' : 'false'}
          class=${star === v ? 'is-on' : ''} onClick=${() => setStar(v)}>${v ? html`<span class="num">${v}★</span>` : t('全部')}</button>`)}
      </div>
    </div>
    <div class="cardpick__grid" data-testid="card-picker">
      <button type="button" class=${`cardpick__op cardpick__op--auto${known ? '' : ' is-on'}`} aria-pressed=${known ? 'false' : 'true'}
          data-char="" data-autofocus=${known ? undefined : ''} title=${t('按博士编号自动分配')} onClick=${() => onPick('')}>
        <span class="cardpick__img"><${Icon} name="refresh" /></span><span class="cardpick__name">${t('默认')}</span>
      </button>
      ${shown.map((c) => {
        const on = known && c.charId === current;
        return html`<button key=${c.charId} type="button" class=${`cardpick__op r${c.rarity}${on ? ' is-on' : ''}`} aria-pressed=${on ? 'true' : 'false'}
            data-char=${c.charId} data-autofocus=${on ? '' : undefined} title=${c.name} onClick=${() => onPick(c.charId)}>
          <${CardThumb} src=${skinPic(c, 'avatar', sk, { own: true }) || chessAvatarUrl(m, c)} name=${c.name} />
          <span class="cardpick__name">${c.name}</span>${c.rarity ? html`<span class="cardpick__star num">${c.rarity}★</span>` : null}
        </button>`;
      })}
    </div>
    ${shown.length ? null : html`<p class="cardpick__empty">${t('没有符合条件的干员')}</p>`}
    <p class="cardpick__note"><${Icon} name="info" />${t('选择后，同盟里的博士都会看到这张立绘')}</p>
  <//>`;
}

/** A picture card (更换立绘) when the official seat card's icon_card is missing. */
function CardGlyph() {
  return html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill-rule="evenodd" d="M3 5h18v14H3zm2 2v8.6l4.2-4.2 3.3 3.3 2.2-2.2L19 16.8V7zm10.5 1.5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z" /></svg>`;
}

/**
 * The event's seat card sprites (player_solt_item_room) as CSS variables of `.rs-seats`: the cards draw them (`has-art`)
 * only when the manifest has every one of them; otherwise the same boxes keep a CSS look.
 */
const SEAT_ART = Object.freeze({
  '--st-bg': 'bg_normal2', '--st-frame': 'bg_frame', '--st-matte': 'front_matte_normal', '--st-down': 'front_matte_select1',
  '--st-up': 'front_matte_select2', '--st-top': 'bg_top_normal', '--st-top-on': 'bg_top_ready', '--st-glow': 'select_glow_up',
  '--st-line': 'select_deco_line', '--st-deco': 'select_deco_down1', '--st-roots': 'select_deco_down2', '--st-ok': 'icon_prepared',
  '--st-self': 'card_deco_self', '--st-more': 'btn_card_detail', '--st-unfold': 'unfold_matte', '--st-unfold-btn': 'unfold_bg_normal',
  '--st-card': 'icon_card', '--st-empty': 'bg_empty', '--st-slot': 'card_empty', '--st-plus': 'bg_plus', '--st-guest': 'bg_guest',
  '--st-cline': 'card_line', '--st-kick': 'btn_kick', '--st-lost': 'bg_disconnect', '--st-lost-ico': 'icon_disconnect',
});
const seatArtCache = { m: /** @type {any} */ (undefined), v: '' };

/**
 * The CSS variables of the seat card sprites, or '' when the manifest lacks any of them.
 * @param {any} [m] data/assets.json
 */
export function seatArt(m = data.get('assets')) {
  if (seatArtCache.m === m) return seatArtCache.v;
  const vars = [];
  for (const [name, key] of Object.entries(SEAT_ART)) {
    const u = uiUrl(m, `room/${key}`);
    if (!u) { vars.length = 0; break; }
    vars.push(`${name}:url("${u}")`);
  }
  seatArtCache.m = m;
  seatArtCache.v = vars.join(';');
  return seatArtCache.v;
}

/**
 * The seat row's content box as `--seats-w` / `--seats-h` (room.css sizes the cards by it: the event's card is a fixed
 * 234 × 486, so it must fit the row's height as well as its width; this project uses no container queries).
 */
function useSeatBox() {
  const [box, setBox] = useState('');
  const stop = useRef(/** @type {(() => void)|null} */ (null));
  // a callback ref: the row mounts after the room arrives (the screen renders nothing before)
  const ref = useCallback((/** @type {HTMLElement|null} */ el) => {
    stop.current?.();
    stop.current = null;
    if (!el) return;
    const fit = () => {
      const cs = getComputedStyle(el);
      const w = Math.max(0, Math.floor(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)));
      const h = Math.max(0, Math.floor(el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)));
      const v = `--seats-w:${w}px;--seats-h:${h}px`;
      setBox((old) => (old === v ? old : v));
    };
    fit();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(el); else addEventListener('resize', fit);
    stop.current = () => { if (ro) ro.disconnect(); else removeEventListener('resize', fit); };
  }, []);
  useEffect(() => () => stop.current?.(), []);
  return { ref, box };
}

/**
 * One seat: the event's seat card (player_solt_item_room, 234 × 486 units, every box at its prefab place; room.css
 * `--u` is one unit). A Doctor's card: the top strip (P#; mint when ready), the line up from it, the 名片干员 portrait
 * (or the avatar frame: a bot, no art) under the matte, and the name card over the card's foot (one's own in its self
 * frame with the self tag and the ⋯ tag, which opens 更换立绘: the event's 名片 menu, maintainer decision 2026-11-08). A
 * ready card — and the host's, who never readies — gets the mint mattes, the lines hanging under it and its state over
 * the name card: 已就绪 with the event's check, the host's 创建者 with the crown (the card's only 创建者, maintainer
 * decision 2026-11-08). A Doctor not ready shows no state (the event's card shows none either; maintainer decision
 * 2026-11-08); a dropped one the event's 连接中断 band. The host gets 移出 / 移除 AI 队友 at the top right corner. An
 * empty seat: + 邀请 (copies the key; the first empty seat says so) and, for the host of a co-op room, 添加 AI 队友 in the
 * empty name card's place — nothing else (maintainer decision 2026-11-08); a spectator or a matching room sees the
 * event's waiting figure. A portrait that fails to load gives way to the avatar frame.
 */
function SeatCard({ seat, index, room, facts, myId, busy, onAddBot, onRemoveBot, onKick, onInvite, portrait = null, skinArt = null, operator = null, onPickCard = null, toSpectate = null, firstEmpty = false }) {
  const [badArt, setBadArt] = useState(/** @type {string[]} */ ([]));
  const menu = useUpMenu();
  const coop = room.mode !== 'solo';
  if (!seat) {
    const canAdd = coop && facts.isHost && facts.canAddBot !== false && !room.matching;
    // the host sees why the add button is gone (SP_MAX_BOTS, local patch)
    const capped = coop && facts.isHost && !canAdd && !room.matching && !facts.large;
    const invitable = coop && !facts.spectating && !room.matching;
    return html`<article class=${`seat seat--empty rseat rseat--empty${firstEmpty ? ' is-first' : ''}`} style=${`--i:${index}`}>
      <span class="rseat__clip" aria-hidden="true"></span>
      <span class="rseat__bg" aria-hidden="true"></span>
      <header class="rseat__strip"><i></i><span class="num">P${index + 1}</span></header>
      <span class="rseat__cline" aria-hidden="true"></span>
      ${invitable
        ? html`<button type="button" class="rseat__invite" onClick=${onInvite} title=${t('复制同盟密钥以邀请队友')}>
            <span class="rseat__plus" aria-hidden="true"></span><b>${t('邀请')}</b>
            ${firstEmpty ? html`<small class="rseat__tip">${t('复制同盟密钥以邀请队友')}</small>` : null}</button>`
        : html`<span class="rseat__wait"><span class="rseat__guest" aria-hidden="true"></span><b>${room.matching ? t('随机匹配中') : t('等待博士加入')}</b></span>`}
      <div class="rseat__slot">
        ${canAdd ? html`<${Button} variant="ghost" size="sm" icon="robot" class="rseat__add" loading=${busy === 'add'} onClick=${onAddBot}>${t('添加 AI 队友')}<//>`
          : capped ? html`<span class="rseat__cap t-dim">${facts.maxBots === 0 ? t('本服务器未开放 AI 队友') : t('AI 队友已达上限（{maxBots}）', { maxBots: facts.maxBots })}</span>` : null}
      </div>
    </article>`;
  }
  const isMe = seat.playerId === myId;
  const isHostSeat = seat.playerId === room.hostId;
  const offline = seat.connected === false && !seat.isBot;
  // The host never needs to toggle ready: starting the match readies them (server rule).
  const state = offline ? 'offline' : seat.ready || seat.isBot ? 'ready' : isHostSeat ? 'host' : 'waiting';
  const lit = state === 'ready' || state === 'host';
  const art = seat.isBot ? null : seatArtSrc([skinArt, portrait], badArt);
  const canPick = isMe && !seat.isBot && !!onPickCard;
  const name = playerName(seat.name) || t('博士');
  const mark = seat.isBot ? null : html`<${SeatMark} playerId=${seat.playerId} name=${seat.name} />`;
  return html`<article class=${`seat rseat${isMe ? ' is-me' : ''}${isHostSeat ? ' is-host' : ''}${seat.isBot ? ' is-bot' : ''}${art ? ' has-art' : ''}${lit ? ' is-lit' : ''} is-${state}`}
      style=${`--i:${index}`}>
    <span class="rseat__clip" aria-hidden="true"></span>
    <span class="rseat__bg" aria-hidden="true"></span>
    <div class="seat__art rseat__art">
      ${art
        ? html`<img key=${art} class="seat__portrait" src=${art} alt=${operator?.name || ''} title=${operator?.name || ''} draggable=${false} onError=${() => setBadArt((b) => (b.includes(art) ? b : [...b, art]))} />`
        : html`<${AvatarFrame} size="xl" name=${seat.name} seat=${index} bot=${seat.isBot} self=${isMe} ready=${state === 'ready'} offline=${offline} mark=${mark} />`}
    </div>
    <span class="rseat__matte" aria-hidden="true"></span>
    ${lit ? html`<span class="rseat__roots" aria-hidden="true"></span>` : null}
    <header class="rseat__strip"><i></i><span class="num">P${index + 1}</span></header>
    ${lit ? html`<span class=${`rseat__state seat__state seat__state--${state}`}>
      <span class="rseat__box">${state === 'host' ? html`<${Icon} name="crown" />` : null}</span>
      <span class="rseat__said">${state === 'host' ? t('创建者') : t('已就绪')}</span>
    </span>` : null}
    ${offline ? html`<span class="rseat__lost"><i class="rseat__lost-ico" aria-hidden="true"><${Icon} name="wifiOff" /></i>${t('连接中断')}</span>` : null}
    ${seat.isBot && facts.isHost ? html`<button type="button" class="rseat__kick" disabled=${busy === `rm${index}`} onClick=${() => onRemoveBot(index)}
      title=${t('移除该 AI 队友')} aria-label=${t('移除 AI 队友')}><${Icon} name="robot" /><${Icon} name="close" /></button>` : null}
    ${!seat.isBot && !isMe && facts.isHost ? html`<button type="button" class="rseat__kick" disabled=${busy === `kick${index}`}
      onClick=${() => onKick(index, name, seat.playerId)} title=${t('将该博士移出同盟')} aria-label=${t('移出该博士')}><${Icon} name="user" /><${Icon} name="close" /></button>` : null}
    <div class="rseat__plate">
      ${isMe ? html`<span class="rseat__me" role="img" aria-label=${t('你')} title=${t('你')}><${Sprite} k="room/icon_self_room" fallback=${html`<${Icon} name="user" />`} /></span>` : null}
      <${AvatarFrame} size="sm" name=${seat.name} seat=${index} bot=${seat.isBot} self=${isMe} mark=${mark} />
      <span class="rseat__who"><b class="seat__name">${name}</b>${isMe ? html`<span class="seat__you" aria-hidden="true">${t('你')}</span>` : null}</span>
      <small class="rseat__doc">${seat.isBot ? 'AUTONOMOUS UNIT' : `DOCTOR #${doctorNo(seat.playerId)}`}</small>
    </div>
    ${canPick ? html`<div class="rseat__menu-root" ref=${menu.ref}>
      <button type="button" class="rseat__more" data-testid="seat-card-more" aria-haspopup="menu" aria-expanded=${menu.open ? 'true' : 'false'}
        onClick=${() => menu.setOpen(!menu.open)} title=${t('更多')} aria-label=${t('更多')}><i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i></button>
      ${menu.open ? html`<div class="rseat__menu" role="menu">
        <div class="rseat__menu-list">
          <button type="button" role="menuitem" class="rseat__pick" data-testid="seat-card-pick" onClick=${() => { menu.setOpen(false); onPickCard(); }}
            title=${t('更换名片干员')}><${Sprite} k="room/icon_card" class="rseat__pick-ico" fallback=${html`<${CardGlyph} />`} /><span>${t('更换立绘')}</span></button>
          ${toSpectate ? html`<button type="button" role="menuitem" class="rseat__pick" data-testid="seat-card-spectate"
            disabled=${!toSpectate.enabled || busy === 'tospec'} title=${toSpectate.enabled ? null : t('观战席已满')}
            onClick=${() => { menu.setOpen(false); toSpectate.onClick(); }}><${Icon} name="eye" /><span>${t('前往观战席')}</span></button>` : null}
        </div>
      </div>` : null}
    </div>` : null}
  </article>`;
}

/**
 * 观战席 in the status line: the count, the host's pick of the seat count (a co-op host always sees it) and 名单, which
 * opens the spectators upwards (host: ✕ frees a seat). The line stays one line however many watch (maintainer decision
 * 2026-11-08: six names in the line wrapped the status line onto three and pushed the seat cards up).
 */
function SpectatorBar({ facts, coop, myId, busy, onRemove, onSeats }) {
  const picks = coop && facts.isHost;
  if (!facts.spectators.length && !picks) return null;
  return html`<span class="specbar" aria-label=${t('观战席')}>
    <span class="specbar__label"><${Icon} name="eye" />${t('观战席')}<b class="num">${facts.spectators.length}</b><span class="num t-dim">/${picks ? '' : facts.spectatorSeats}</span></span>
    ${picks ? html`<${SpectatorSeatsSelect} facts=${facts} busy=${busy} onPick=${onSeats} />` : null}
    ${facts.spectators.length ? html`<${SpectatorRoster} facts=${facts} myId=${myId} busy=${busy} onRemove=${onRemove} />` : null}
  </span>`;
}

/** A menu of the status line opening upwards (and the seat card's ⋯ menu): Escape or a press outside `ref` closes it. */
function useUpMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', close, true); document.removeEventListener('keydown', esc, true); };
  }, [open]);
  return { open, setOpen, ref };
}

/** 名单: the spectators, folded into one button of the status line (their count is the label's) — whole names, 预约 n, the host's ✕. */
function SpectatorRoster({ facts, myId, busy, onRemove }) {
  const { open, setOpen, ref } = useUpMenu();
  const reserved = facts.spectators.filter((s) => s.reserved).length;
  return html`<span class="specroster" ref=${ref}>
    <button type="button" class=${`specseats__btn specroster__btn tapx${open ? ' is-open' : ''}`} aria-haspopup="true" aria-expanded=${open ? 'true' : 'false'}
      aria-label=${t('观战席名单')} data-testid="spectator-roster" onClick=${() => setOpen(!open)}>
      <span>${t('名单')}</span>
      ${reserved ? html`<span class="specbar__res">${t('预约 {n} 人', { n: reserved })}</span>` : null}
      <span class="specseats__caret" aria-hidden="true">▴</span>
    </button>
    ${open ? html`<div class="specbar__list" role="list" aria-label=${t('观战席名单')}>${facts.spectators.map((s) => html`<span key=${s.playerId} role="listitem" class=${`specbar__who${s.playerId === myId ? ' is-me' : ''}${s.connected === false ? ' is-offline' : ''}`}>
      ${s.connected === false ? html`<${Icon} name="wifiOff" />` : null}<span class="specbar__name" title=${s.name || null}>${s.name || t('博士')}</span>${s.playerId === myId ? html`<span class="seat__you">${t('你')}</span>` : null}
      ${s.reserved ? html`<span class="specbar__res num" title=${t('模拟结束或重新开始时，有空位就自动入座')}>${t('预约 {n}', { n: s.reserved })}</span>` : null}
      ${facts.isHost ? html`<${Button} variant="ghost" size="sm" square=${true} icon="close" loading=${busy === `rs${s.playerId}`}
        onClick=${() => onRemove(s.playerId)} aria-label=${t('移出观战者 {name}', { name: s.name || '' })} title=${t('移出该观战者')} />` : null}
    </span>`)}</div>` : null}
  </span>`;
}

/** The 「AI 队友最后选择」 switch (co-op): the host toggles it, everybody else sees its state (由创建者设置 in its tooltip). */
function AiLastToggle({ option, busy, onToggle, short = false }) {
  if (!option) return null;
  return html`<div class="ailast">
    <${Tooltip} text=${option.editable ? t('策略与机变轮选时，所有博士先于 AI 队友选择') : `${t('策略与机变轮选时，所有博士先于 AI 队友选择')}\n${t('由创建者设置')}`}>
      <button type="button" role="switch" aria-checked=${option.on ? 'true' : 'false'}
          class=${`dpick__opt ailast__opt${option.on ? ' is-active' : ''}`} disabled=${!option.editable || !!busy}
          onClick=${() => option.editable && onToggle(!option.on)}>
        <${Icon} name="check" class=${option.on ? 'is-on' : ''} />${short ? t('AI 队友最后') : t('AI 队友最后选择')}
      </button>
    <//>
  </div>`;
}

/**
 * The host's pick of the room's 观战席 count, in the status line: a menu opening upwards (the room's bottom bar is under
 * it, and on a phone the screen's edge). Never below the spectators seated. Escape or a press outside closes it.
 */
function SpectatorSeatsSelect({ facts, busy, onPick }) {
  const { open, setOpen, ref } = useUpMenu();
  const pick = (n) => {
    setOpen(false);
    if (n !== facts.spectatorSeats) onPick(n);
  };
  return html`<span class="specseats" ref=${ref}>
    <button type="button" class=${`specseats__btn tapx${open ? ' is-open' : ''}`} aria-haspopup="true" aria-expanded=${open ? 'true' : 'false'}
      aria-label=${t('观战席数量')} title=${t('观战席数量')} disabled=${!!busy} onClick=${() => setOpen(!open)}>
      <span class="num">${t('{n}席', { n: facts.spectatorSeats })}</span><span class="specseats__caret" aria-hidden="true">▾</span>
    </button>
    ${open ? html`<div class="specseats__menu" role="menu" aria-label=${t('观战席数量')}>
      ${SPECTATOR_SEATS.map((n) => {
        const on = facts.spectatorSeats === n;
        const locked = n < facts.spectators.length;
        return html`<button key=${n} type="button" role="menuitemradio" aria-checked=${on ? 'true' : 'false'} data-seats=${n}
          class=${`specseats__row num${on ? ' is-on' : ''}`} disabled=${locked} title=${locked ? t('不能少于已入座的观战者') : null}
          onClick=${() => pick(n)}><span>${t('{n}席', { n })}</span><span aria-hidden="true">${on ? '✓' : ''}</span></button>`;
      })}
    </div>` : null}
  </span>`;
}

/**
 * The event room's group_mode per difficulty (auto_chess_room_state root_easy / _normal / _hard / _abyss, in the order of
 * DIFFICULTIES): its icon, and the colour of its name and light (light_mode, white, tinted). icon_easy is white and
 * tinted too; the other three icons carry their colour.
 */
const MODE_ROOTS = Object.freeze({
  FUNNY: { icon: 'icon_easy', color: '#ffa015', tint: true },
  NORMAL: { icon: 'icon_normal', color: '#f25203' },
  HARD: { icon: 'icon_hard', color: '#e32525' },
  ABYSS: { icon: 'icon_abyss', color: '#ff0024' },
});

/**
 * The mode bar (header): the event room's group_mode drawn with its sprites — 赛季 | 规则 | 难度 | 人数 in one capsule
 * (bg_mode, sliced), the difficulty's icon and light, the round switch (btn_switch_mode) at the end — and one button: a
 * press anywhere on it opens 选择模拟协议 (the event's switch has a touch area as wide as the bar). The switch is the
 * host's: anybody else opens the dialog read-only and sees none [ASSUMED·화면: the event's room was not recorded from a
 * guest's seat]. Without the sprites (an install without the art) the bar is a dark capsule with the project's icons.
 */
function ModeBar({ room, rules, sizeOpt, info, editable, busy, matching, onOpen }) {
  const m = data.get('assets');
  const root = MODE_ROOTS[room.difficulty] || MODE_ROOTS.FUNNY;
  const art = (k) => uiUrl(m, `room/${k}`);
  const bg = art('bg_mode'), light = art('light_mode'), icon = art(root.icon), knob = art('btn_switch_mode');
  const url = (u) => (u ? `url("${u}")` : 'none');
  const style = `--rm-bg:${url(bg)}; --rm-light:${url(light)}; --rm-ico:${url(icon)}; --rm-knob:${url(knob)}; --rm-c:${root.color}`;
  const name = isGrade(room.grade) ? gradeName(room.grade) : DIFFICULTY_NAMES[room.difficulty] ? t(DIFFICULTY_NAMES[room.difficulty]) : '';
  const title = editable ? t('选择模拟协议') : matching ? t('匹配中无法更改') : t('由创建者设置');
  return html`<button type="button" class=${`rs-mode${editable ? ' is-edit' : ' is-ro'}${bg ? '' : ' no-art'}`} style=${style}
      disabled=${editable && !!busy} onClick=${onOpen} data-testid="room-difficulty" title=${title}>
    <${RoomSeasonSeg} />
    <span class=${`rs-mode__seg rs-mode__rules rtag--${rules.preset}`} data-testid="room-ruleset">${presetName(rules)}</span>
    <span class="rs-mode__seg rs-mode__diff">
      ${light ? html`<i class="rs-mode__light" aria-hidden="true"></i>` : null}
      ${icon ? html`<i class=${`rs-mode__ico${root.tint ? ' is-tint' : ''}`} aria-hidden="true"></i>` : html`<${DifficultyIcon} difficulty=${room.difficulty} />`}
      <span class="rs-mode__name">${name}</span><span class="num rs-mode__code">${info.code}</span>
    </span>
    ${sizeOpt ? html`<span class="rs-mode__seg rs-mode__size" data-testid="room-size">${t('{n}人', { n: sizeOpt.size })}</span>` : null}
    ${editable ? html`<span class="rs-mode__knob" aria-hidden="true">${knob ? null : html`<${Icon} name="refresh" />`}</span>` : null}
  </button>`;
}

/**
 * The big button of the bottom right (开始模拟 / 准备就绪 / 已就绪 / 入座 / 预约座位 / 取消匹配 / 观战中), styled like
 * 选择模拟协议's. A disabled reason goes in the project's Tooltip around it (a native title never shows on touch).
 */
function GoButton({ label, onClick = null, disabled, loading = false, ready = null, icon = null, testid = null }) {
  return html`<button type="button" class=${`proto-start rs-go${ready ? ' is-ready' : ''}`} disabled=${disabled} onClick=${onClick}
      aria-busy=${loading ? 'true' : 'false'} data-testid=${testid}>
    ${ready != null
      ? html`<span class="rs-go__box" aria-hidden="true">${ready ? html`<${Icon} name="check" />` : null}</span>`
      : icon
        ? html`<span class="rs-go__icon" aria-hidden="true"><${Icon} name=${icon} /></span>`
        : html`<span class="proto-start__mark" aria-hidden="true"><span class="proto-start__rook"><i>[</i><${Icon} name="rook" /><i>]</i></span><small>STRONGHOLD<br />PROTOCOL</small></span>`}
    <span class="proto-start__label">${loading ? html`<${Spinner} size="sm" />` : null}${label}</span>
    <span class="proto-start__deco" aria-hidden="true"></span>
  </button>`;
}

/** Room screen component. */
export function RoomScreen() {
  useDocClass('sp-topbar-tall'); // toasts sit under the (taller) top bar instead of over its title (components.css)
  const room = useStore((s) => s.room);
  const me = useStore((s) => s.me, shallowEqual);
  const conn = useStore((s) => s.connection, shallowEqual);
  const queue = useStore((s) => s.ui.queue);
  // the waiting Doctors of the room's season's queues (ui/season.js)
  const queueCounts = useStore((s) => seasonQueueCounts(s, seasonOf(s.room?.season), false));
  const queueCounts8 = useStore((s) => seasonQueueCounts(s, seasonOf(s.room?.season), true));
  const queueQuick = useStore((s) => seasonQuickCounts(s, seasonOf(s.room?.season)));
  const customRules = useStore((s) => s, Object.is, customRulesStore);
  const short = useMediaQuery(SHORT_SCREEN_QUERY);
  const [busy, setBusy] = useState(null);
  const seatBox = useSeatBox();
  const alive = useRef(true);
  const inFlight = useRef(false); // synchronous guard against double clicks (state updates are async)
  useEffect(() => () => { alive.current = false; }, []);
  useTicker(room?.matching ? 500 : 0); // the waiting clock
  // a Doctor taking a seat: the official join cue (joinedDoctors)
  const lastRoom = useRef(room);
  useEffect(() => {
    if (joinedDoctors(lastRoom.current, room, me.playerId) > 0) audio.sfx('joinRoom');
    lastRoom.current = room;
  }, [room]);
  // 名片干员: the operators a seat card can show and the default pool (ui/seatArt.js), one's own pick (a pref the sync
  // sends: ui/cardSync.js)
  // factions: the 特训敌人 names of a custom room's summary (the invitation text)
  useData('chess', 'assets', 'backups', 'factions');
  const chess = data.get('chess');
  const backups = data.get('backups');
  const cardList = useMemo(() => cardOperators(data.list('chess'), backups), [chess, backups]);
  const cards = useMemo(() => cardContext(cardList, { pending: !backups }), [cardList, backups]);
  const myCard = useStore((s) => s[CARD_KEY], Object.is, cardStore);
  // the seat cards' skins (ui/seatArt.js seatCardSkin): one's own choice, the seats' published ones, with the skin data
  const skins = useStore((s) => s, Object.is, skinsStore);
  const skinPack = useStore((s) => s.chosen?.skin === true, Object.is, resStore);
  const otherSkins = useStore((s) => s.otherSkins !== false, Object.is, settingsStore);
  useEffect(() => { if (skinPack) void loadSkinCatalog(); }, [skinPack]);
  const [picking, setPicking] = useState(false);
  // 选择模拟协议 over the room (open, and the host's picks before 确认)
  const [proto, setProto] = useState(/** @type {null | { difficulty: string, ruleset: string, size: number, grade: number | null }} */ (null));

  if (!room) return null;
  const online = conn.status === 'online';
  const coop = room.mode !== 'solo';
  const facts = roomFacts(room, me.playerId);
  const myReady = !!facts.mine?.ready;
  // a 规程 solo room plays a 规程等级 (room.state `grade`, docs/rules/ui.md 「규정 모드」): its name and mode record
  const graded = isGrade(room.grade);
  const info = graded ? gradeInfo(room.grade) : difficultyInfo(room.mode, room.difficulty);

  /** Runs one request at a time; resolves true once the server took it (false: not sent, or refused — toasted). */
  const run = async (kind, fn) => {
    if (inFlight.current) return false;
    if (!online) { toast(t('连接中断，请稍候重试'), 'warn'); return false; }
    inFlight.current = true;
    setBusy(kind);
    try { await fn(); return true; } catch (err) { toastError(err); return false; } finally {
      inFlight.current = false;
      if (alive.current) setBusy(null);
    }
  };

  const toggleReady = () => run('ready', () => net.request('room.ready', { ready: !myReady }));
  const start = () => run('start', () => net.request('room.start', {}));
  const addBot = () => run('add', () => net.request('room.addBot', {}));
  const removeBot = (seat) => run(`rm${seat}`, () => net.request('room.removeBot', { seat }));
  // the host removes a human before the match (community report #17): asked first; the player may join again. The
  // confirmed player's id goes along: if they left and someone else took the seat meanwhile, the server refuses it.
  const kick = async (seat, name, playerId) => {
    if (inFlight.current) return;
    const ok = await confirmDialog({ title: t('移出同盟'), text: t('确定将「{name}」移出同盟吗？对方可以凭同盟密钥重新加入。', { name: name || t('博士') }), okText: t('移出'), danger: true });
    if (ok) run(`kick${seat}`, () => net.request('room.kick', { seat, playerId }));
  };
  const setAiLast = (on) => run('ailast', () => net.request('room.setAiPicksLast', { on }));
  // 콘솔 모드 (local patch: server/local-patch.js setConsole): a solo room only, before its match
  const setConsole = (on) => run('console', () => net.request('room.setConsole', { on }));
  const sizeOpt = sizeOption(room, me.playerId);
  // 4 → 8 frees the AI seats (the 8-player mode has none): asked first. Resolves true once the server took it.
  const setSize = async (size) => {
    if (inFlight.current) return false;
    if (size > MAX_SEATS && sizeOpt?.bots > 0) {
      const ok = await confirmDialog({ title: t('改为 8 人同盟'), text: t('八人同盟没有 AI 队友，{n} 名 AI 队友将被移出。确定改为 8 人同盟吗？', { n: sizeOpt.bots }), okText: t('改为 8 人') });
      if (!ok) return false;
    }
    return run('size', () => net.request('room.setSize', { size }));
  };
  const roomRules = resolveRuleset(room.ruleset);
  const isCustom = roomRules.preset === 'custom';
  const rulesEditable = rulesetOption(room, me.playerId).editable;
  // 自定义 rules: the host edits the room's (sent at once), anybody else views them, live
  const customGear = !isCustom ? null
    : rulesEditable
      ? () => openCustomRules({ rules: roomRules.custom, roomMode: room.mode, difficulty: room.difficulty, grade: graded ? room.grade : null, size: room.size,
        onApply: (custom) => run('rules', () => net.request('room.setRuleset', { preset: 'custom', custom })) })
      : () => openCustomRules({ rules: roomRules.custom, readonly: true, roomMode: room.mode, difficulty: room.difficulty, grade: graded ? room.grade : null, size: room.size,
        live: () => store.get().room?.ruleset?.custom ?? null });
  // spectator seats: the host frees one; a spectator takes a free player seat with room.join of this room
  const removeSpectator = (playerId) => run(`rs${playerId}`, () => net.request('room.removeSpectator', { playerId }));
  const sit = () => run('sit', () => net.request('room.join', { code: room.code }));
  // and back: a Doctor of the room's lobby moves to a spectator seat (room.spectate of this room; server/lobby.js header)
  const specOpt = toSpectateOption(room, facts);
  const toSpectate = specOpt && {
    enabled: specOpt.enabled,
    onClick: async () => {
      if (inFlight.current) return;
      if (facts.isHost && !(await confirmDialog({ title: t('前往观战席'), text: t('你是同盟的创建者，前往观战席后创建者身份将移交给其他博士。确定前往吗？'), okText: t('前往') }))) return;
      run('tospec', () => net.request('room.spectate', { code: room.code }));
    },
  };
  const setSpectatorSeats = (seats) => run('specseats', () => net.request('room.setSpectatorSeats', { seats }));
  // the next free seat (server/lobby.js header 「Seat reservation」): the toggle while none is free or one is reserved
  const myReserved = reservedRank(room, me.playerId);
  const reserve = () => run('reserve', () => net.request('room.reserveSeat', { on: !myReserved }));
  // 랜덤 매칭 for the empty seats (header): the host queues the room, any Doctor of it cancels
  const matching = coop && !!room.matching;
  const fillOpt = fillOption(room, facts, { counts4: queueCounts, counts8: queueCounts8, quick: queueQuick });
  const fillTip = fillOpt && (!fillOpt.enabled ? t('仍有博士未准备就绪')
    : fillOpt.custom ? t('自定义规则的同盟只由快速匹配的博士补位')
    : facts.large ? t('用随机匹配的博士补满空位') : t('用随机匹配的博士补满空位（AI 队友会被移出）'));
  const fill = () => run('fill', () => net.request('room.queueRoom', {}));
  const unfill = () => run('unfill', () => net.request('room.unqueue', {}));
  const leave = async () => {
    if (inFlight.current) return;
    const othersHere = facts.humans.some((s) => s.playerId !== me.playerId);
    if (facts.isHost && othersHere) {
      const ok = await confirmDialog({ title: t('离开同盟'), text: t('你是同盟的创建者，离开后创建者身份将移交或同盟解散。确定离开吗？'), okText: t('离开'), danger: true });
      if (!ok) return;
    }
    inFlight.current = true;
    setBusy('leave');
    try {
      await net.request('room.leave', {});
    } catch (err) {
      if (err?.code !== 'NOT_IN_ROOM') toastError(err);
    } finally {
      // Leaving locally is always safe: the server either confirmed or no longer has us in the room.
      store.set({ room: null, match: emptyMatch() });
      inFlight.current = false;
      if (alive.current) setBusy(null);
    }
  };
  const copy = async (what) => {
    const ok = await copyText(what === 'code' ? room.code : inviteMessage(room, me.name));
    if (ok) toast(what === 'code' ? t('已复制同盟密钥 {code}', { code: room.code }) : t('已复制邀请链接'), 'success');
    else toast(t('复制失败，请手动复制'), 'warn');
  };

  // 选择模拟协议 over the room (header): the host picks the difficulty, the ruleset and the 人数 and sends them on 确认
  // (nothing for what did not change; 自定义 takes the lobby's settings, ui/customRulesStore.js); it closes once the server
  // took them, and an accepted difficulty becomes the remembered one (`lobby.difficulty`). Everybody else opens it
  // read-only.
  const protoEditable = facts.isHost && !matching;
  const openProto = () => setProto({ difficulty: room.difficulty, ruleset: roomRules.preset, size: seatsOf(room.size), grade: graded ? room.grade : null });
  const closeProto = () => setProto(null);
  const confirmProto = async () => {
    if (!proto) return;
    const { difficulty, ruleset, size, grade } = proto;
    if (ruleset !== roomRules.preset
      && !(await run('rules', () => net.request('room.setRuleset', ruleset === 'custom' ? { preset: ruleset, custom: customDraft() } : { preset: ruleset })))) return;
    if (sizeOpt && size !== sizeOpt.size && !(await setSize(size))) return;
    if (isGrade(grade)) {
      if (grade !== room.grade) {
        if (!(await run('diff', () => net.request('room.setDifficulty', { difficulty: gradeDifficulty(grade), grade })))) return;
        savePref('lobby.grade', grade);
      }
    } else if (difficulty !== room.difficulty) {
      if (!(await run('diff', () => net.request('room.setDifficulty', { difficulty })))) return;
      savePref('lobby.difficulty', difficulty);
    }
    if (alive.current) closeProto();
  };
  const protoHint = facts.humans.length > 1 ? t('更改后，其他博士需要重新准备就绪') : '';
  // the 规则 row's 自定义 summary: the room's settings while it stays 自定义, else the lobby's (what 确认 would send)
  const keepsCustom = proto?.ruleset === 'custom' && isCustom;
  const protoCustom = keepsCustom ? { ...customRules, draft: roomRules.custom } : customRules;
  const editCustom = () => (keepsCustom ? customGear?.()
    : openCustomRules({ rules: customDraft(), roomMode: room.mode, difficulty: proto?.difficulty || room.difficulty, grade: proto ? proto.grade : graded ? room.grade : null, size: room.size }));

  const waiting = matching && queue?.party ? queue : null;
  const statusLine = !online
    ? html`<span class="t-orange"><${Icon} name="wifiOff" />${t('连接中断，正在重连…')}</span>`
    : matching
      ? html`<span class="t-amber room-bar__match"><${Icon} name="signal" />${t('正在匹配空位')}${waiting
        ? html` · <b class="num">${mmss(Date.now() - waiting.since)}</b> · ${t('排队中的博士：{count}/{n}', { count: Math.min(facts.seats.length, waiting.count), n: facts.seats.length })}` : null}${waiting && !facts.spectating && canProposeStart(waiting)
        // the 8-player queue's 「바로 시작」 (ui/matchQueue.js): any queued Doctor of the room may propose it
        ? html` <${Button} variant="primary" size="sm" icon="play" loading=${busy === 'vote'} disabled=${!online} onClick=${() => run('vote', proposeStart)}>${t('提议提前开始')}<//>` : null}</span>`
    : facts.spectating
      ? html`<span class="t-lo"><${Icon} name="eye" />${myReserved ? t('已预约座位（第 {n} 位）· 有空位时自动入座', { n: myReserved }) : t('观战中 · 不占博士席位，模拟开始后可切换观看各位博士')}</span>`
    : !coop
      ? html`<span class="t-mint">${t('*模拟协议已就绪，准许进入模拟')}</span>`
    : facts.isHost
      ? facts.canStart
        ? html`<span class="t-mint">${t('*同盟人数达标，准许进入模拟')}</span>`
        : facts.seatsOpen
        ? html`<span class="t-lo">${t('八人同盟需至少 5 名博士才能开始')}</span>`
        : html`<span class="t-lo">${t('等待所有博士准备就绪')}</span>`
      : myReady
        ? html`<span class="t-mint">${t('已就绪 · 等待创建者开始模拟')}</span>`
        : html`<span class="t-lo">${t('准备就绪后，创建者即可开始模拟')}</span>`;
  const aiLast = aiLastOption(room, me.playerId);
  const m = data.get('assets');
  const seatVars = seatArt(m);
  const firstEmpty = facts.seats.findIndex((s) => !s); // the first empty seat says what + 邀请 does (variant_first_empty)
  const protoMode = coop ? 'coop' : 'solo';

  // the main button (bottom right)
  const goButton = matching && !facts.spectating
    ? html`<${GoButton} label=${t('取消匹配')} icon="close" loading=${busy === 'unfill'} disabled=${!online} onClick=${unfill} />`
    : facts.isHost
    ? html`<${Tooltip} text=${facts.canStart ? null : facts.seatsOpen && facts.othersReady ? t('八人同盟需至少 5 名博士才能开始') : t('仍有博士未准备就绪')}>
        <${GoButton} label=${t('开始模拟')} loading=${busy === 'start'} disabled=${!facts.canStart || !online || busy === 'start'} onClick=${start} testid="room-start" />
      <//>`
    : facts.spectating
      ? (facts.emptySeats > 0 && !matching
        ? html`<${GoButton} label=${t('入座')} icon="user" testid="seat-sit" loading=${busy === 'sit'} disabled=${!online} onClick=${sit} />`
        : myReserved || !matching
        ? html`<${Tooltip} text=${t('模拟结束或重新开始时，有空位就自动入座')}>
            <${GoButton} label=${myReserved ? t('取消预约') : t('预约座位')} ready=${!!myReserved} testid="seat-reserve"
              loading=${busy === 'reserve'} disabled=${!online} onClick=${reserve} />
          <//>`
        : html`<${GoButton} label=${t('观战中')} icon="eye" disabled=${true} />`)
    : html`<${GoButton} label=${myReady ? t('已就绪') : t('准备就绪')} ready=${myReady} loading=${busy === 'ready'}
        disabled=${!online || !facts.mine || busy === 'ready'} onClick=${toggleReady} />`;

  // 干员调配: under the chat on the bottom row (by the start button, as the briefing has it beside 准备完毕; maintainer
  // decision 2026-11-08), in the top bar on a short screen
  const loadout = html`<${LoadoutButton} from="room" size="md" class="rs-loadout room-loadout" label=${t('干员调配')} />`;
  // 콘솔 모드 (local patch): right of 干员调配 in a solo room (maintainer decision 2026-11-15)
  const consoleBtn = coop ? null : html`<${ConsoleToggle} on=${room.console === true} busy=${busy === 'console'} disabled=${!online || !!room.inMatch} onToggle=${setConsole} />`;

  return html`<div class=${`screen room-screen rs${coop ? '' : ' rs--solo'}${coop ? ' has-chat' : ''}${facts.large ? ' rs--8' : ''}`}
      style=${`--d-color:${DIFFICULTY_COLORS[room.difficulty] || 'var(--amber)'}; --n:${facts.large ? MAX_SEATS : facts.seats.length}`}>
    <div class="rs__bg" aria-hidden="true"></div>
    <header class="topbar rs-top">
      <div class="topbar__left rs-top__left">
        <${ExitTile} class="rs-exit" onClick=${leave} disabled=${busy === 'leave'} label=${t('离开同盟')} ping=${conn.ping} online=${online}
          testid="room-leave" mode=${{ modeId: modeIdFor(room.mode, room.difficulty, room.grade), difficulty: room.difficulty }} />
        <div class="rs-clock">
          <b>${coop ? t('同盟模拟') : t('独立模拟')}</b>
        </div>
        <div class="rs-tools">
          <${Button} variant="secondary" size="sm" square=${true} icon="chart" class="stats-entry" onClick=${openStats} title=${t('统计数据')} aria-label=${t('统计数据')} />
          <${SettingsButton} class="room-settings" variant="secondary" square=${true} />
          <${GuideButton} class="room-guide" variant="secondary" square=${true} />
        </div>
      </div>
      <div class="rs-top__right">
        ${short ? html`${loadout}${consoleBtn}` : null}
        ${coop ? html`<div class="rs-key">
          <span class="rs-key__k">${t('同盟密钥')}</span>
          <b class="rs-key__code num selectable" aria-label=${t('同盟密钥 {code}', { code: room.code })}>${room.code}</b>
          <button type="button" class="rs-key__copy" onClick=${() => copy('code')} title=${t('复制密钥')}>${t('复制')}</button>
          <button type="button" class="rs-key__link" onClick=${() => copy('link')} title=${t('复制链接')} aria-label=${t('复制链接')}><${Icon} name="link" /></button>
        </div>` : html`<div class="rs-key rs-key--solo"><${MicroLabel}>SINGLE OPERATOR<//><span>${t('仅限 1 名博士')}</span>${room.console ? html`<span class="cxp-badge">CONSOLE</span>` : null}</div>`}
      </div>
    </header>

    <main ref=${seatBox.ref} class=${`seats rs-seats${coop ? '' : ' seats--solo'}${facts.large ? ' seats--8' : ''}${seatVars ? ' has-art' : ''}`}
      style=${[seatVars, seatBox.box].filter(Boolean).join(';')}>
      ${facts.seats.map((s, i) => {
        const op = seatOperator(s, cards, { myId: me.playerId, myCard });
        const skin = op ? seatCardSkin(s, op.chess.charId, { myId: me.playerId, localSkins: skins[SKINS_KEY], otherSkins, pack: skinPack }) : null;
        const skinArt = skin && skins.catalog?.bySkin?.get(skin)?.owner === op.chess.charId ? skins.catalog.bySkin.get(skin).portrait : null;
        return html`<${SeatCard} key=${s ? `p${s.playerId}` : `e${i}`} seat=${s} index=${i} room=${room} facts=${facts}
          myId=${me.playerId} busy=${busy} onAddBot=${addBot} onRemoveBot=${removeBot} onKick=${kick} onInvite=${() => copy('code')}
          portrait=${op ? chessPortraitUrl(m, op.chess) : null} skinArt=${skinArt} operator=${op?.chess} onPickCard=${() => setPicking(true)} toSpectate=${toSpectate}
          firstEmpty=${!s && i === firstEmpty} />`;
      })}
      ${coop ? null : html`<aside class="solo-brief rs-brief brackets">
        <${MicroLabel} tone="mint">BRIEFING<//>
        <h2>${graded ? gradeName(room.grade) : DIFFICULTY_NAMES[room.difficulty] ? t(DIFFICULTY_NAMES[room.difficulty]) : ''} <span class="num t-dim">${info.code}</span></h2>
        <p>${info.desc}</p>
        <ul>
          ${info.effects.map((e) => html`<li key=${e}>${e}</li>`)}
          <li>${t('共')} <b class="num">${roomRules.custom?.flow?.rounds ?? info.rounds}</b> ${tc('rounds', '回合')}${info.hidden ? t('，满足条件时进入隐秘核心') : ''}</li>
          <li>${t('独立模拟中休整期与机变阶段不限时')}</li>
          ${room.console ? html`<li class="rs-brief__console"><b>${t('控制台模式')}</b> — ${t('自由更改干员、装备、敌人、回合、首领与盟约层数；不结算，也不计入统计、成就和战绩；对局中可以反馈')}</li>` : null}
        </ul>
      </aside>`}
    </main>

    ${coop ? html`<${RoomChat} />` : null}

    <footer class="room-bar rs-foot">
      <div class="rs-hint">
        ${coop ? html`<span class="rs-ready ready-count num" title=${t('已就绪')}>${facts.humans.map((s) => html`<${Icon} key=${s.playerId} name="user" class=${facts.isReady(s) ? 'is-on' : ''} />`)}<b>${facts.readyHumans}</b>/${facts.humans.length}</span>` : null}
        <span class="room-bar__status">${statusLine}</span>
        <${SpectatorBar} facts=${facts} coop=${coop} myId=${me.playerId} busy=${busy} onRemove=${removeSpectator} onSeats=${setSpectatorSeats} />
        <${AiLastToggle} option=${aiLast} busy=${busy} onToggle=${setAiLast} short=${short} />
      </div>
      ${short ? null : html`<div class=${consoleBtn ? 'rs-foot__lo has-console' : 'rs-foot__lo'}>${loadout}${consoleBtn}</div>`}
      <${ModeBar} room=${room} rules=${roomRules} sizeOpt=${sizeOpt} info=${info} editable=${protoEditable} busy=${busy} matching=${matching} onOpen=${openProto} />
      <div class="room-bar__right rs-foot__right">
        ${fillOpt ? html`<${Tooltip} text=${fillTip}>
          <button type="button" class="rs-fill room-fill" disabled=${!fillOpt.enabled || !online || busy === 'fill'} onClick=${fill} data-testid="room-fill">
            ${busy === 'fill' ? html`<${Spinner} size="sm" />` : html`<${Icon} name="signal" />`}<span>${t('匹配补位')}</span>
            <span class=${`rpick__n room-fill__n num${fillOpt.waiting > 0 ? ' is-on' : ''}`} data-testid="fill-waiting">${fillOpt.waiting}</span>
          </button>
        <//>` : null}
        ${goButton}
      </div>
    </footer>
    ${picking ? html`<${CardPicker} current=${myCard} list=${cardList} m=${m} onPick=${(id) => { setCard(id); setPicking(false); }} onClose=${() => setPicking(false)} />` : null}
    ${proto ? protoEditable
      ? html`<${ProtocolSelect} roomMode=${protoMode} difficulty=${proto.difficulty} onDifficulty=${(d) => setProto({ ...proto, difficulty: d })}
          grade=${proto.grade} onGrade=${(g) => setProto({ ...proto, grade: g })}
          onClose=${closeProto} onStart=${confirmProto} busy=${busy === 'diff' || busy === 'rules' || busy === 'size' ? 'create' : null} online=${online} action=${t('确认')} hint=${protoHint}
          brief=${html`<${CustomBrief} roomMode=${protoMode} ruleset=${proto.ruleset} customRules=${protoCustom} difficulty=${proto.difficulty} grade=${proto.grade} />`}
          rules=${html`<${ProtoRules} roomMode=${protoMode} ruleset=${proto.ruleset} onRuleset=${(r) => setProto({ ...proto, ruleset: r })}
            onGear=${editCustom} size=${proto.size}
            onSize=${sizeOpt ? (n) => setProto({ ...proto, size: n }) : null} sizeLocked=${!!sizeOpt && proto.size > MAX_SEATS && !sizeOpt.shrinkable} />`} />`
      : html`<${ProtocolSelect} roomMode=${protoMode} difficulty=${room.difficulty} onDifficulty=${() => {}} onClose=${closeProto} grade=${graded ? room.grade : null}
          online=${online} readOnly=${true} hint=${matching ? t('匹配中无法更改') : null}
          brief=${html`<${CustomBrief} roomMode=${protoMode} ruleset=${roomRules.preset} difficulty=${room.difficulty} grade=${graded ? room.grade : null}
            customRules=${isCustom ? { ...customRules, draft: roomRules.custom } : customRules} />`}
          rules=${html`<${ProtoRules} roomMode=${protoMode} ruleset=${roomRules.preset} onRuleset=${() => {}} onGear=${customGear} readOnly=${true}
            size=${seatsOf(room.size)}
            onSize=${sizeOpt ? () => {} : null} />`} />` : null}
    <${MatchQueueDialog} />
    <${CustomRulesDialog} />
  </div>`;
}
