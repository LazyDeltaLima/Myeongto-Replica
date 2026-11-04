// Room screen (同盟等待室): 4 seat cards (avatar frame, name, ready state, AI badge, host crown),
// host controls (difficulty picker, add/remove AI and the 「AI 队友最后选择」 switch in co-op, start), invite code with
// copy code / copy link, ready toggle and leave.
//
// Start rule (server/lobby.js): room.start needs every *other* human connected and ready; the
// host's start counts as the host's ready. So 开始模拟 is enabled exactly then and sends room.start
// alone (no separate room.ready round trip that could leave the host "ready" after a failed start).
// Solo rooms show a single seat.
// Spectator seats (community report #26, a remake feature): a co-op room with spectators shows the 观战席 strip under
// the seats — names, offline marks, the host's ✕ (room.removeSpectator) — and a spectator's own view swaps the ready
// button for 入座 (room.join of the room) while a player seat is free, else 预约座位 / 取消预约 (room.reserveSeat). In that
// strip the host picks how many spectator seats the room has (room.setSpectatorSeats).
// 랜덤 매칭 for the empty seats (server/matchmaking.js, maintainer decision 2026-10-13): a co-op host with fewer than four
// Doctors gets 匹配补位 (room.queueRoom, under the start rule: every other Doctor ready; the AI seats are freed). While the
// room waits (room.state `matching`) the bar shows the waiting time and the queue, every Doctor's main button is
// 取消匹配 (room.unqueue: the whole room leaves the queue), and the difficulty, AI seats and start are locked; the
// confirmation of a formed group is ui/matchQueue.js's dialog. An 8-seat room waiting in a queue of five or more gets
// 提议提前开始 in the bar (room.queueVote, maintainer decision 2026-11-02; its vote is the same dialog).
// 규칙 모드 (shared/ruleset.js, maintainer decisions 2026-10-15, 2026-10-18): the bar's 规则 picker (经典 / 休闲 / 自定义,
// host only, locked while matchmaking like the difficulty; its tooltip lists what 休闲 turns on) spans the row under the
// difficulty, the 「AI 队友最后选择」 switch sits under the ready count (maintainer decision 2026-10-18), and the
// ruleset tag is beside the title's difficulty. 自定义 takes the host's settings (ui/customRulesStore.js) and its ⚙ opens
// them (ui/customRules.js: the host edits them — room.setRuleset { preset: 'custom', custom } —, anybody else sees the
// room's read-only); a custom room has no 匹配补位 (the server refuses room.queueRoom, maintainer decision 2026-10-18).
// The 8-player mode (maintainer decisions 2026-10-16, 2026-10-19): a room of `size` 8 shows its 8 seats in two rows, has no
// AI teammates (no add button, no 「AI 队友最后选择」), starts with LARGE_MIN_PLAYERS Doctors or more (SEATS_OPEN: 开始模拟
// stays locked below that and says so; maintainer decision 2026-11-01) and fills its empty seats from the 8-player queues (匹配补位 under the ready rule alone).
// The 人数 switch (room.setSize, maintainer decision 2026-11-02) sits beside the 规则 picker of a co-op room: the host switches
// 4 ↔ 8 (locked while matchmaking; 4 is locked while more than four seats are taken; 8 asks first when AI seats would go).
// Texts go through t() (docs/I18N.md).

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { DIFFICULTIES, DIFFICULTY_NAMES, DIFFICULTY_COLORS, LARGE_MIN_PLAYERS, LARGE_SEATS, MAX_SEATS, MIN_SPECTATORS, ROOM_SIZES, SPECTATOR_SEATS, seatsOf, modeIdFor } from '../../../shared/constants.js';
import { SeatMark } from '../ui/faction.js'; // local patch
import {
  html, Button, Icon, MicroLabel, PingPill, AvatarFrame, DifficultyTag, DifficultyIcon, Tooltip, confirmDialog, doctorNo, useTicker,
} from '../ui/components.js';
import { toast, toastError } from '../ui/toasts.js';
import { copyText } from '../ui/clipboard.js';
import { GuideButton } from '../ui/guide.js';
import { openStats } from './stats.js';
import { SettingsButton } from '../ui/settings.js';
import { LoadoutButton } from './loadout.js';
import { net } from '../net.js';
import { useDocClass } from '../ui/device.js';
import { store, useStore, shallowEqual, emptyMatch, isSpectating, reservedRank } from '../store.js';
import { difficultyInfo } from './lobby.js';
import { RoomChat } from '../ui/chat.js';
import { MatchQueueDialog, mmss, canProposeStart, proposeStart } from '../ui/matchQueue.js';
import { audio } from '../audio.js';
import { t, tc } from '../../../shared/i18n.js';
import { playerName } from '../../../shared/botNames.js';
import { resolveRuleset, officialBans } from '../../../shared/ruleset.js';
import { RulesetSwitch, presetName, queueCountOf } from '../ui/ruleset.js';
import { CustomRulesDialog, openCustomRules } from '../ui/customRules.js';
import { customDraft } from '../ui/customRulesStore.js';
import { customSummary } from '../ui/customSummary.js';
import { getBond, getBoss, getStage, getConfig, getMode } from '../data.js';
import { DEFAULT_SEASON, seasonOf } from '../../../shared/seasons.js';
import { SeasonBadge, seasonName, seasonQueueCounts } from '../ui/season.js';

/**
 * Seats padded to the room's capacity (co-op 4 or its `size` 8, solo 1), each null or a seat record.
 * @param {any} room room.state payload
 * @returns {(null | {seat:number, playerId:any, name:string, isBot:boolean, ready:boolean, connected:boolean})[]}
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
    const lookup = { bond: getBond, boss: getBoss, stage: getStage };
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

function SeatCard({ seat, index, room, facts, myId, busy, onAddBot, onRemoveBot, onKick }) {
  const coop = room.mode !== 'solo';
  if (!seat) {
    const canAdd = coop && facts.isHost && facts.canAddBot !== false && !room.matching;
    // the host sees why the add button is gone (SP_MAX_BOTS, local patch)
    const capped = coop && facts.isHost && !canAdd && !room.matching && !facts.large;
    return html`<article class="seat seat--empty" style=${`--seat-i:${index}`}>
      <header class="seat__head"><span class="seat__no num">P${index + 1}</span><${MicroLabel}>SEAT ${String(index + 1).padStart(2, '0')}<//></header>
      <div class="seat__art seat__art--empty">
        <div class="seat__radar" aria-hidden="true"></div>
        <span class="seat__wait">${t('等待博士加入')}</span>
        <${MicroLabel}>AWAITING DOCTOR<//>
      </div>
      <footer class="seat__foot">
        ${canAdd
          ? html`<${Button} variant="secondary" size="sm" icon="robot" block=${true} loading=${busy === `add`} onClick=${onAddBot}>${t('添加 AI 队友')}<//>`
          : html`<span class="seat__state t-dim">${room.matching ? t('随机匹配中') : capped ? (facts.maxBots === 0 ? t('本服务器未开放 AI 队友') : t('AI 队友已达上限（{maxBots}）', { maxBots: facts.maxBots })) : t('空位')}</span>`}
      </footer>
    </article>`;
  }
  const isMe = seat.playerId === myId;
  const isHostSeat = seat.playerId === room.hostId;
  const offline = seat.connected === false && !seat.isBot;
  // The host never needs to toggle ready: starting the match readies them (server rule).
  const state = offline ? 'offline' : seat.ready || seat.isBot ? 'ready' : isHostSeat ? 'host' : 'waiting';
  return html`<article class=${`seat brackets${isMe ? ' is-me' : ''}${isHostSeat ? ' is-host' : ''}${seat.isBot ? ' is-bot' : ''} is-${state}`}
      style=${`--seat-i:${index}`}>
    <header class="seat__head">
      <span class="seat__no num">P${index + 1}</span>
      <${MicroLabel}>SEAT ${String(index + 1).padStart(2, '0')}<//>
      ${isHostSeat ? html`<span class="seat__host"><${Icon} name="crown" />${t('创建者')}</span>` : null}
    </header>
    <div class="seat__art">
      <div class="seat__stripes" aria-hidden="true"></div>
      <${AvatarFrame} size="xl" name=${seat.name} seat=${index} bot=${seat.isBot} self=${isMe} ready=${state === 'ready'} offline=${offline}
        mark=${seat.isBot ? null : html`<${SeatMark} playerId=${seat.playerId} name=${seat.name} />`} />
      ${seat.isBot ? html`<span class="seat__bot-label"><${Icon} name="robot" />${t('AI 队友')}</span>` : null}
    </div>
    <div class="seat__who">
      <span class="seat__name">${playerName(seat.name) || t('博士')}</span>
      ${isMe ? html`<span class="seat__you">${t('你')}</span>` : null}
    </div>
    <${MicroLabel}>${seat.isBot ? 'AUTONOMOUS UNIT' : `DOCTOR #${doctorNo(seat.playerId)}`}<//>
    <footer class="seat__foot">
      <span class=${`seat__state seat__state--${state}`}>
        ${state === 'ready' ? html`<${Icon} name="check" />${t('已就绪')}`
          : state === 'offline' ? html`<${Icon} name="wifiOff" />${t('连接中断')}`
          : state === 'host' ? html`<${Icon} name="crown" />${t('待命中')}`
          : html`<${Icon} name="hourglass" />${t('准备中')}`}
      </span>
      ${seat.isBot && facts.isHost ? html`<${Tooltip} text=${t('移除该 AI 队友')}>
        <${Button} variant="ghost" size="sm" square=${true} icon="close" loading=${busy === `rm${index}`} onClick=${() => onRemoveBot(index)} aria-label=${t('移除 AI 队友')} />
      <//>` : null}
      ${!seat.isBot && !isMe && facts.isHost ? html`<${Tooltip} text=${t('将该博士移出同盟')}>
        <${Button} variant="ghost" size="sm" square=${true} icon="close" loading=${busy === `kick${index}`} onClick=${() => onKick(index, playerName(seat.name), seat.playerId)} aria-label=${t('移出该博士')} />
      <//>` : null}
    </footer>
  </article>`;
}

/**
 * 观战席: the room's spectators (host: ✕ frees a seat). The host of a co-op room always has this strip: its seat count is
 * picked here (room.setSpectatorSeats, server/lobby.js header).
 */
function SpectatorBar({ facts, coop, myId, busy, onRemove, onSeats }) {
  const picks = coop && facts.isHost;
  if (!facts.spectators.length && !picks) return null;
  return html`<section class="specbar" aria-label=${t('观战席')}>
    <span class="specbar__label"><${Icon} name="eye" />${t('观战席')}<b class="num">${facts.spectators.length}</b><span class="num t-dim">/${picks ? '' : facts.spectatorSeats}</span></span>
    ${picks ? html`<${SpectatorSeatsSelect} facts=${facts} busy=${busy} onPick=${onSeats} />` : null}
    <div class="specbar__list">${facts.spectators.map((s) => html`<span key=${s.playerId} class=${`specbar__who${s.playerId === myId ? ' is-me' : ''}${s.connected === false ? ' is-offline' : ''}`}>
      ${s.connected === false ? html`<${Icon} name="wifiOff" />` : null}<span class="specbar__name" title=${s.name || null}>${s.name || t('博士')}</span>${s.playerId === myId ? html`<span class="seat__you">${t('你')}</span>` : null}
      ${s.reserved ? html`<span class="specbar__res num" title=${t('模拟结束或重新开始时，有空位就自动入座')}>${t('预约 {n}', { n: s.reserved })}</span>` : null}
      ${facts.isHost ? html`<${Button} variant="ghost" size="sm" square=${true} icon="close" loading=${busy === `rs${s.playerId}`}
        onClick=${() => onRemove(s.playerId)} aria-label=${t('移出观战者 {name}', { name: s.name || '' })} title=${t('移出该观战者')} />` : null}
    </span>`)}</div>
  </section>`;
}

function InviteBox({ room, name }) {
  const code = room.code;
  const copy = async (what) => {
    const ok = await copyText(what === 'code' ? code : inviteMessage(room, name));
    if (ok) toast(what === 'code' ? t('已复制同盟密钥 {code}', { code }) : t('已复制邀请链接'), 'success');
    else toast(t('复制失败，请手动复制'), 'warn');
  };
  return html`<div class="invite brackets">
    <div class="invite__label"><${Icon} name="key" /><span>${t('同盟密钥')}</span><${MicroLabel}>ALLIANCE KEY<//></div>
    <div class="invite__code num selectable" aria-label=${t('同盟密钥 {code}', { code })}>${[...String(code)].map((ch, i) => html`<span key=${i}>${ch}</span>`)}</div>
    <div class="invite__btns">
      <${Button} size="sm" icon="copy" onClick=${() => copy('code')}>${t('复制密钥')}<//>
      <${Button} size="sm" icon="link" onClick=${() => copy('link')}>${t('复制链接')}<//>
    </div>
  </div>`;
}

function DifficultyPicker({ room, isHost, busy, onPick }) {
  if (!isHost || room.matching) {
    return html`<div class="dpick dpick--ro">
      <${DifficultyTag} difficulty=${room.difficulty} size="lg" code=${difficultyInfo(room.mode, room.difficulty).code} />
      <span class="t-dim">${room.matching ? t('匹配中无法更改') : t('由创建者选择')}</span>
    </div>`;
  }
  return html`<div class="dpick" role="radiogroup" aria-label=${t('模拟难度')}>
    ${DIFFICULTIES.map((d) => html`<button key=${d} type="button" role="radio" aria-checked=${room.difficulty === d ? 'true' : 'false'}
        class=${`dpick__opt${room.difficulty === d ? ' is-active' : ''}`} style=${`--d-color:${DIFFICULTY_COLORS[d]}`}
        disabled=${!!busy} onClick=${() => room.difficulty !== d && onPick(d)}>
      <${DifficultyIcon} difficulty=${d} />${t(DIFFICULTY_NAMES[d].replace('模拟', ''))}
    </button>`)}
  </div>`;
}

/** The 「AI 队友最后选择」 switch (co-op): the host toggles it, everybody else sees its state (由创建者设置 in its tooltip: a note
 * beside it squeezed the button in the bar's half-width cell). */
function AiLastToggle({ option, busy, onToggle }) {
  if (!option) return null;
  return html`<div class="ailast">
    <${Tooltip} text=${option.editable ? t('策略与机变轮选时，所有博士先于 AI 队友选择') : `${t('策略与机变轮选时，所有博士先于 AI 队友选择')}\n${t('由创建者设置')}`}>
      <button type="button" role="switch" aria-checked=${option.on ? 'true' : 'false'}
          class=${`dpick__opt ailast__opt${option.on ? ' is-active' : ''}`} disabled=${!option.editable || !!busy}
          onClick=${() => option.editable && onToggle(!option.on)}>
        <${Icon} name="check" class=${option.on ? 'is-on' : ''} />${t('AI 队友最后选择')}
      </button>
    <//>
  </div>`;
}

/** The room's 人数 switch (sizeOption), beside the 规则 picker; the lobby's 4人 / 8人 look (screens/lobby.js SizeSwitch). */
function RoomSizeSwitch({ option, busy, onPick }) {
  if (!option) return null;
  const tips = [t('八人同盟：{n}–{max} 名博士即可开始，没有 AI 队友；卡池、敌方数值和联防人数随开局人数调整', { n: LARGE_MIN_PLAYERS, max: LARGE_SEATS })];
  if (option.size > MAX_SEATS && !option.shrinkable) tips.push(t('已有 5 名以上成员入座，无法改为 4 人同盟'));
  if (!option.editable) tips.push(t('由创建者设置'));
  return html`<${Tooltip} text=${tips.join('\n')}>
    <div class="dpick rpick roomsize" role="radiogroup" aria-label=${t('人数')}>
      ${ROOM_SIZES.map((n) => {
        const on = option.size === n;
        const locked = !on && n === MAX_SEATS && !option.shrinkable;
        return html`<button key=${n} type="button" role="radio" aria-checked=${on ? 'true' : 'false'} data-size=${n}
            class=${`dpick__opt rpick__opt${on ? ' is-active' : ''}${locked ? ' is-locked' : ''}`} disabled=${!option.editable || !!busy || locked}
            onClick=${() => option.editable && !on && !locked && onPick(n)}>${t('{n}人', { n })}</button>`;
      })}
    </div>
  <//>`;
}

/**
 * The host's pick of the room's 观战席 count, in the SpectatorBar: a menu opening upwards (the room's bottom bar is under
 * it, and on a phone the screen's edge). Never below the spectators seated. Escape or a press outside closes it.
 */
function SpectatorSeatsSelect({ facts, busy, onPick }) {
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
  const [busy, setBusy] = useState(null);
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

  if (!room) return null;
  const online = conn.status === 'online';
  const coop = room.mode !== 'solo';
  const facts = roomFacts(room, me.playerId);
  const myReady = !!facts.mine?.ready;
  const info = difficultyInfo(room.mode, room.difficulty);

  const run = async (kind, fn) => {
    if (inFlight.current) return;
    if (!online) { toast(t('连接中断，请稍候重试'), 'warn'); return; }
    inFlight.current = true;
    setBusy(kind);
    try { await fn(); } catch (err) { toastError(err); } finally {
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
  const setDifficulty = (difficulty) => run('diff', () => net.request('room.setDifficulty', { difficulty }));
  const setAiLast = (on) => run('ailast', () => net.request('room.setAiPicksLast', { on }));
  const sizeOpt = sizeOption(room, me.playerId);
  // 4 → 8 frees the AI seats (the 8-player mode has none): asked first
  const setSize = async (size) => {
    if (inFlight.current) return;
    if (size > MAX_SEATS && sizeOpt?.bots > 0) {
      const ok = await confirmDialog({ title: t('改为 8 人同盟'), text: t('八人同盟没有 AI 队友，{n} 名 AI 队友将被移出。确定改为 8 人同盟吗？', { n: sizeOpt.bots }), okText: t('改为 8 人') });
      if (!ok) return;
    }
    run('size', () => net.request('room.setSize', { size }));
  };
  const setRuleset = (preset) => run('rules', () => net.request('room.setRuleset', preset === 'custom' ? { preset, custom: customDraft() } : { preset }));
  const roomRules = resolveRuleset(room.ruleset);
  const isCustom = roomRules.preset === 'custom';
  const rulesEditable = rulesetOption(room, me.playerId).editable;
  // the ⚙: the host edits (the room's settings when it is custom, else the lobby's), anybody else views a custom room's
  const customGear = rulesEditable
    ? () => openCustomRules({ rules: isCustom ? roomRules.custom : customDraft(), roomMode: room.mode, difficulty: room.difficulty, size: room.size,
      onApply: (custom) => run('rules', () => net.request('room.setRuleset', { preset: 'custom', custom })) })
    : isCustom ? () => openCustomRules({ rules: roomRules.custom, readonly: true, roomMode: room.mode, difficulty: room.difficulty, size: room.size,
      live: () => store.get().room?.ruleset?.custom ?? null }) : null;
  // spectator seats: the host frees one; a spectator takes a free player seat with room.join of this room
  const removeSpectator = (playerId) => run(`rs${playerId}`, () => net.request('room.removeSpectator', { playerId }));
  const sit = () => run('sit', () => net.request('room.join', { code: room.code }));
  const setSpectatorSeats = (seats) => run('specseats', () => net.request('room.setSpectatorSeats', { seats }));
  // the next free seat (server/lobby.js header 「Seat reservation」): the toggle while none is free or one is reserved
  const myReserved = reservedRank(room, me.playerId);
  const reserve = () => run('reserve', () => net.request('room.reserveSeat', { on: !myReserved }));
  // 랜덤 매칭 for the empty seats (header): the host queues the room, any Doctor of it cancels
  const matching = coop && !!room.matching;
  const canFill = coop && facts.isHost && facts.humans.length < facts.seats.length && !matching;
  const fillTip = isCustom ? t('自定义规则不能使用匹配补位') : !facts.canQueue ? t('仍有博士未准备就绪')
    : facts.large ? t('用随机匹配的博士补满空位') : t('用随机匹配的博士补满空位（AI 队友会被移出）');
  // the Doctors already waiting with this room's difficulty, ruleset and size (lobby.queueCounts; the lobby's cards show the same)
  const fillWaiting = queueCountOf(facts.large ? queueCounts8 : queueCounts, resolveRuleset(room.ruleset).preset, room.difficulty);
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

  return html`<div class=${`screen room-screen${coop ? ' has-chat' : ''}`}>
    <header class="topbar">
      <div class="topbar__left">
        <${Tooltip} text=${t('离开同盟')} placement="bottom">
          <${Button} variant="danger" size="lg" square=${true} icon="exit" loading=${busy === 'leave'} onClick=${leave} aria-label=${t('离开同盟')} />
        <//>
        <div class="room-ping">
          <${PingPill} ms=${conn.ping} online=${online} />
          <${MicroLabel}>${t('当前延迟')}<//>
        </div>
        <${Button} variant="secondary" size="sm" icon="chart" class="stats-entry" onClick=${openStats} title=${t('统计数据')} aria-label=${t('统计数据')}>${t('统计')}<//>
        <${SettingsButton} class="room-settings" variant="secondary" label=${t('设置')} />
        <${GuideButton} class="room-guide" variant="secondary" label=${t('玩法说明')} />
      </div>
      <div class="topbar__center">
        <${MicroLabel} tone="mint">${coop ? (facts.large ? 'ALLIANCE LOBBY · 8' : 'ALLIANCE LOBBY') : 'SOLO SIMULATION'}<//>
        <h1 class="topbar__title">${coop ? t('同盟模拟') : t('独立模拟')}<span class="topbar__sep"></span><${DifficultyTag} difficulty=${room.difficulty} size="lg" /><span class=${`rtag rtag--${roomRules.preset}`} data-testid="room-ruleset">${presetName(roomRules)}</span>${facts.large ? html`<span class="rtag rtag--size" data-testid="room-size">${t('{n} 人同盟', { n: facts.seats.length })}</span>` : null}</h1>
        <${SeasonBadge} />
      </div>
      <div class="topbar__right">
        ${coop ? html`<${InviteBox} room=${room} name=${me.name} />` : html`<div class="solo-note"><${MicroLabel}>SINGLE OPERATOR<//><span>${t('仅限 1 名博士')}</span></div>`}
      </div>
    </header>

    <main class=${`seats${coop ? '' : ' seats--solo'}${facts.large ? ' seats--8' : ''}`}>
      ${facts.seats.map((s, i) => html`<${SeatCard} key=${s ? `p${s.playerId}` : `e${i}`} seat=${s} index=${i} room=${room} facts=${facts}
        myId=${me.playerId} busy=${busy} onAddBot=${addBot} onRemoveBot=${removeBot} onKick=${kick} />`)}
      ${coop ? null : html`<aside class="solo-brief brackets">
        <${MicroLabel} tone="mint">BRIEFING<//>
        <h2>${DIFFICULTY_NAMES[room.difficulty] ? t(DIFFICULTY_NAMES[room.difficulty]) : ''}<span class="num t-dim"> ${info.code}</span></h2>
        <p>${info.desc}</p>
        <ul>
          ${info.effects.map((e) => html`<li key=${e}>${e}</li>`)}
          <li>${t('共')} <b class="num">${roomRules.custom?.flow?.rounds ?? info.rounds}</b> ${tc('rounds', '回合')}${info.hidden ? t('，满足条件时进入隐秘核心') : ''}</li>
          <li>${t('独立模拟中休整期与机变阶段不限时')}</li>
        </ul>
      </aside>`}
    </main>
    <${SpectatorBar} facts=${facts} coop=${coop} myId=${me.playerId} busy=${busy} onRemove=${removeSpectator} onSeats=${setSpectatorSeats} />

    ${coop ? html`<${RoomChat} />` : null}

    <footer class="room-bar">
      <div class="room-bar__left">
        <span class="room-bar__label">${t('模拟难度')}<${MicroLabel}>DIFFICULTY<//></span>
        <div class="room-bar__opts">
          <${DifficultyPicker} room=${room} isHost=${facts.isHost} busy=${busy} onPick=${setDifficulty} />
          <div class=${`room-bar__row${sizeOpt ? ' room-bar__row--size' : ''}`}>
            <${RulesetSwitch} value=${roomRules} editable=${rulesEditable} busy=${busy} onPick=${setRuleset} onGear=${customGear} />
            <${RoomSizeSwitch} option=${sizeOpt} busy=${busy} onPick=${setSize} />
          </div>
        </div>
      </div>
      <div class="room-bar__center">
        <div class="ready-count" hidden=${!coop}>
          <span class="t-lo">${t('已就绪')}</span>
          <b class="num">${facts.readyHumans}</b><span class="num t-dim">/${facts.humans.length}</span>
          <span class="ready-count__icons" aria-hidden="true">
            ${facts.humans.map((s) => html`<${Icon} key=${s.playerId} name="user" class=${facts.isReady(s) ? 'is-on' : ''} />`)}
          </span>
        </div>
        <${AiLastToggle} option=${aiLastOption(room, me.playerId)} busy=${busy} onToggle=${setAiLast} />
        <div class="room-bar__status">${statusLine}</div>
      </div>
      <div class=${`room-bar__right${canFill ? ' room-bar__right--stack' : ''}`}>
        ${canFill
          // two md buttons stacked in the place of the lg 干员调配 (three side by side overflow the bar's right column)
          ? html`<div class="room-bar__stack">
              <${LoadoutButton} from="room" class="room-loadout" label=${t('干员调配')} />
              <${Tooltip} block=${true} text=${fillTip}>
                <${Button} variant="secondary" icon="signal" block=${true} class="room-fill" loading=${busy === 'fill'} disabled=${isCustom || !facts.canQueue || !online} onClick=${fill}>${t('匹配补位')}<span class=${`rpick__n room-fill__n num${fillWaiting > 0 ? ' is-on' : ''}`} data-testid="fill-waiting">${fillWaiting}</span><//>
              <//>
            </div>`
          : html`<${LoadoutButton} from="room" size="lg" class="room-loadout" label=${t('干员调配')} />`}
        ${matching && !facts.spectating
          ? html`<${Button} variant="secondary" size="xl" icon="close" loading=${busy === 'unfill'} disabled=${!online} onClick=${unfill}>${t('取消匹配')}<//>`
          : facts.isHost
          ? html`<${Tooltip} text=${facts.canStart ? null : facts.seatsOpen && facts.othersReady ? t('八人同盟需至少 5 名博士才能开始') : t('仍有博士未准备就绪')}>
              <${Button} variant="primary" size="xl" icon="play" loading=${busy === 'start'} disabled=${!facts.canStart || !online} onClick=${start}>${t('开始模拟')}<//>
            <//>`
          : facts.spectating
            ? (facts.emptySeats > 0 && !matching
              ? html`<${Button} variant="primary" size="xl" icon="user" data-testid="seat-sit" loading=${busy === 'sit'} disabled=${!online} onClick=${sit}>${t('入座')}<//>`
              : myReserved || !matching
              ? html`<${Tooltip} text=${t('模拟结束或重新开始时，有空位就自动入座')}>
                  <${Button} variant=${myReserved ? 'primary' : 'secondary'} size="xl" icon=${myReserved ? 'check' : 'user'} active=${!!myReserved} data-testid="seat-reserve"
                    loading=${busy === 'reserve'} disabled=${!online} onClick=${reserve}>${myReserved ? t('取消预约') : t('预约座位')}<//>
                <//>`
              : html`<${Button} variant="secondary" size="xl" icon="eye" disabled=${true}>${t('观战中')}<//>`)
          : html`<${Button} variant=${myReady ? 'primary' : 'secondary'} size="xl" icon=${myReady ? 'check' : 'hourglass'} active=${myReady}
              loading=${busy === 'ready'} disabled=${!online || !facts.mine} onClick=${toggleReady}>${myReady ? t('已就绪') : t('准备就绪')}<//>`}
      </div>
    </footer>
    <${MatchQueueDialog} />
    <${CustomRulesDialog} />
  </div>`;
}
