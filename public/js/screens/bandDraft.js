// Band draft — BAND_DRAFT "2/2 选择策略" (research 06 §4.2, D1), laid out as the upstream event screen (upstream PR #643,
// ported by hand; maintainer decision 2026-11-07): left = the draft order as name cards (OrderRow: avatar, name, state
// 等待中 / 决策中 / the picked strategy, the strategy box and ✓ outside it), the current picker framed, with 本局信息, 干员调配
// and the co-op tip under it; centre = a 4-wide wall of every strategy allowed for the mode type (portrait and name, SELECTED
// brackets on the highlighted one); a band a teammate already picked carries the picker's avatar and is marked 队友已选 —
// it cannot be chosen again (research 09 §5, guidebook 策略与轮选; the server refuses it too); right = the detail pane,
// always shown on the highlighted band (art, 初始生命值, name, 【effect】 description, the 自选预设 row) with 跳过 (co-op,
// once) beside 确认选择. The step header stays this fork's (maintainer decision 2026-11-07: the briefing shares it).
// One countdown (user playtest #4 item 4): every turn has the same clock (Match BAND_TURN_SECONDS, m.public.draft
// turnSeconds) and the step header counts it down — m.public.deadline IS the turn's end (the order rows carry no
// seconds of their own). The highlighted band (the detail pane's) is what a turn that runs out takes: every change of it
// is reported (g.bandFocus) and the server assigns it while it is free, else 「华法琳」, else the first free strategy
// (timeoutBand). It starts on that default, so the tip under the order list always names what a timeout gives.
// Solo, and a co-op match with a single human (the server's soloUntimed: draft.untimed): no clock at all.
// A strategy built around a bond the mode switches off (bands.json bondIds ∩ the mode's inactive bonds — 标准: 潘格尼尼
// 拉特兰, 克莱门莎 阿戈尔, 玛恩纳 卡西米尔; the bot never picks one) reads 本局禁用 on its card and in the detail pane
// (BandOffTag / BandOffNote, DESIGN §21.26, §21.7's look); it stays selectable — information only.
// 전략별 선발 프리셋 (local feature, maintainer decisions 2026-10-12; ui/diyPresets.js links): the detail pane's 自选预设 row
// picks the roster the strategy applies — this match's choice, else the strategy's saved link, else the chat faction it is
// built around (推荐, bandRecommendation) when that faction holds a preset, else 不使用预设 (maintainer decision 2026-10-29;
// 保持当前编队 before) — with a preview of its picks and 记住此策略的预设 (on by default: the choice becomes the link; the
// 不使用预设 default is saved only when picked in the dropdown, so a recommendation filled in later still applies). It applies when my pick lands — 确认选择 applies it first and flushes room.diy
// and room.loadout (a solo draft ends with the pick), a turn that runs out or an AI 托管 pick right after — through the chat's faction pick
// (ui/factionPick.js applyPresetChoice: the chat faction follows; a faction this match disables is still applied, 本局禁用).
// Once my pick has landed, the row of my strategy applies a new choice at once (the faction row under the order list did
// that until 2026-10-13 and is gone, maintainer request; no 「…预设已套用 · 撤销」 notice in the draft either, maintainer
// request 2026-10-13). The choice is a dropdown of our own (PresetPicker) so each faction carries its icon. The preview
// shows each slot's tier and operator icon (name in the tooltip). A linked strategy's card carries the faction's badge. After the last pick
// a timed draft kept 编队确认 (m.public.draft.confirm, the server's DRAFT_CONFIRM_SECONDS): the row could still change the
// picks, 准备完毕 (g.draftReady) ended it once every human was done — switched off on the server since 2026-10-13
// (maintainer decision, phases.js startDraftTurn); the code here stays for a return and draws nothing without it. The slots stand by tier (maintainer decision 2026-10-13):
// one plate per tier — the stage info's group bar (img_content_bkg) — with the tier's badge once (its tooltip: the slot
// kind and the 调度中心 level it sells from) and a line of the tier's colour under it; an empty slot is a faint card with +.
// 编辑自选编队 under them opens the 干员调配 overlay's 自选编队 tab on
// the roster the dropdown shows, a slot opens that slot's picker there — an empty one to fill, a filled one (a swap icon on
// hover) as its 更换 does, and closing it (确认, 取消 or 清空) comes back here (maintainer requests 2026-10-13); a filled
// slot's × empties it in the roster the dropdown shows, without leaving the draft (maintainer request 2026-10-13); a faction
// without a preset is its own empty roster: four empty slots, edits saved into it, and no 自选 when applied (diyPresets.js
// choiceRoster, maintainer decision 2026-10-29: the dropdown is the roster shown and edited — selectPreset: the live
// picks follow it, as the tab's own preset bar does); the order
// list carries the overlay's entry (LoadoutButton, from 'draft' — it closes when the draft ends; maintainer request 2026-10-13).
// 规程 (hasDiyChooseStep): no row in the detail pane — the strategy's roster still applies when my pick lands, and the
// 确定自选编队 screen after the draft carries the dropdown (screens/diyChoose.js DiyPresetBox; maintainer decision 2026-11-13).
// 本局信息 (GitHub issue #8 item 1, "选策略时没法返回查看禁用的干员和盟约"): 本局信息 under the order list (named so: maintainer decision 2026-11-07) opens the
// briefing's bond rows, legend and 本局禁用干员 again, read-only (ui/matchInfo.js MatchInfoDialog — the very blocks of the
// briefing). The draft runs on underneath: its status line repeats the current turn and the countdown (draftInfoStatus),
// a turn change (a pick, a skip, a turn that runs out, an AI pick) closes it, the end of the draft unmounts it, and it
// never touches the highlighted band or the buttons.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon, MicroLabel, TierChip, useTicker, secondsLeft } from '../ui/components.js';
import { useGameData, BandIcon, RichText, PlayerAvatar, Sprite } from '../ui/gameComponents.js';
import { chessAvatarUrl, chessPortraitUrl, uiUrl } from '../ui/assetUrls.js';
import { CARD_KEY, cardStore, cardOperators, cardContext, seatOperator, seatArtSrc } from '../ui/seatArt.js';
import { StepHeader, ExitModal } from '../ui/matchChrome.js';
import { MatchInfoDialog, matchInfoModel, ChessIcon } from '../ui/matchInfo.js';
import { actions, act } from '../ui/gameActions.js';
import { normalizeDraft, sortedPlayers, diyPickOff, startStepCount, hasDiyChooseStep } from '../ui/gameLogic.js';
import { store, useStore } from '../store.js';
import { seasonFeature } from '../../../shared/seasons.js';
import { FactionIcon } from '../ui/faction.js';
import { diyPresetStore, bandPresetChoice, bandRecommendation, linkBand, selectPreset, clearRosterSlot, choiceRoster, KEEP_LINK, BASE_LINK, presetSeasonOf } from '../ui/diyPresets.js';
import { loadoutStore, flushDiySync, flushLoadoutSync, openLoadout } from '../ui/loadoutSync.js';
import { LoadoutButton } from './loadout.js';
import { diySlotList } from '../ui/diyModel.js';
import { chatFactionsOf, chatFaction } from '../../../shared/local.js';
import { PHASE } from '../../../shared/constants.js';
import { data, localAsset } from '../data.js';
import { audio } from '../audio.js';
import { modeOffBonds, bandOffBonds, bandOffLine } from '../ui/gameLogic.js';
import { t, tParts, tName } from '../../../shared/i18n.js';
import { playerName } from '../../../shared/botNames.js';
import { applyPresetChoice } from '../ui/factionPick.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/**
 * The official sprites of the strategy pick (data/assets.json ui `bandChoose/*`) as CSS variables, per part — the detail
 * pane (auto_chess_band_choose_state: team_info_back behind it, team_icon_frame around the art, team_hp_back under the
 * HP number, the team_id_title / team_intro_title plates) and the order list (panel_player: player_list_back with its
 * dec and composer; prefab_auto_chess_band_choose_player_card_item: myself_highlight = player_card_self_frame +
 * icon_self_room + team_list_selected_arrow, the state box: waiting dots, selecting plate with the shallow_main
 * hourglass, selected player_card_team_frame with player_card_ready beside it). A part draws them (`has-art`) only when
 * the manifest has every sprite of it; otherwise it keeps its CSS look.
 */
const DRAFT_ART = Object.freeze({
  detail: { '--dd-back': 'team_info_back', '--dd-frame': 'team_icon_frame', '--dd-hp': 'team_hp_back', '--dd-id': 'team_id_title',
    '--dd-intro': 'team_intro_title' },
  order: { '--do-back': 'player_list_back', '--do-dec': 'player_list_back_dec', '--do-comp': 'player_list_dec_back',
    '--do-self': 'player_card_self_frame', '--do-tag': 'icon_self_room', '--do-arrow': 'team_list_selected_arrow',
    '--do-wait': 'player_card_waiting', '--do-sel': 'player_card_selecting', '--do-team': 'player_card_team_frame',
    '--do-ready': 'player_card_ready' },
});
const artCache = new Map();

/**
 * The CSS variables of a part's official sprites ('detail' | 'order'), or '' when the manifest lacks any of them.
 * @param {'detail'|'order'} part @param {any} [m] data/assets.json
 */
export function draftArt(part, m = data.get('assets')) {
  const hit = artCache.get(part);
  if (hit && hit.m === m) return hit.v;
  const vars = [];
  for (const [name, key] of Object.entries(DRAFT_ART[part] || {})) {
    const u = uiUrl(m, `bandChoose/${key}`);
    if (!u) { vars.length = 0; break; }
    vars.push(`${name}:url("${u}")`);
  }
  const v = vars.join(';');
  artCache.set(part, { m, v });
  return v;
}

/** Where the official 跳过 arrow lies inside bandChoose/btn_skip (161 × 46): the light glyph left of the label, with a pixel of margin. */
const SKIP_ARROW = Object.freeze({ x: 19, y: 9, w: 23, h: 16, bg: 38 /* the capsule's #262626 */ });
/** @type {{ src: string, p: Promise<string|null>, url: string|null } | null} */
let skipArrow = null;

/**
 * The official 跳过 arrow, cut once out of bandChoose/btn_skip (the client draws it inside the capsule; no sprite of its
 * own) into a white glyph on transparency for a CSS mask, so the button tints it like its other icons: the glyph's
 * brightness above the capsule's becomes the alpha. Resolves null without a canvas or when the image fails.
 * @param {string} src
 * @returns {Promise<string|null>}
 */
export function cutSkipArrow(src) {
  if (skipArrow && skipArrow.src === src) return skipArrow.p;
  const entry = { src, p: Promise.resolve(/** @type {string|null} */ (null)), url: /** @type {string|null} */ (null) };
  entry.p = new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') { resolve(null); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const { x, y, w, h, bg } = SKIP_ARROW;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        if (!g) { resolve(null); return; }
        g.drawImage(img, x, y, w, h, 0, 0, w, h);
        const d = g.getImageData(0, 0, w, h);
        const px = d.data;
        for (let i = 0; i < px.length; i += 4) {
          const l = Math.max(px[i], px[i + 1], px[i + 2]);
          px[i + 3] = Math.round(Math.max(0, Math.min(1, (l - bg) / (255 - bg))) * px[i + 3]);
          px[i] = 255; px[i + 1] = 255; px[i + 2] = 255;
        }
        g.putImageData(d, 0, 0);
        entry.url = c.toDataURL('image/png');
        resolve(entry.url);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
  skipArrow = entry;
  return entry.p;
}

/** The cut 跳过 arrow (cutSkipArrow) for the button, null until it is ready or without the sprite (the button keeps its icon). */
function useSkipArrow() {
  const src = uiUrl(data.get('assets'), 'bandChoose/btn_skip');
  const [url, setUrl] = useState(() => (src && skipArrow && skipArrow.src === src ? skipArrow.url : null));
  useEffect(() => {
    if (!src) return undefined;
    let live = true;
    void cutSkipArrow(src).then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [src]);
  return src ? url : null;
}

/** 本局禁用 on a strategy card whose bonds `names` the mode switches off (bandOffBonds); nothing otherwise. */
export function BandOffTag({ names = [] }) {
  return names.length ? html`<span class="dband__off" title=${bandOffLine(names)}>${t('本局禁用')}</span>` : null;
}

/** The detail pane's note for such a strategy: "本局禁用【拉特兰】盟约，此策略效果可能无法发挥" (the bond names struck through). */
export function BandOffNote({ names = [] }) {
  if (!names.length) return null;
  return html`<p class="draft-detail__off" role="note" aria-label=${bandOffLine(names)}><${Icon} name="info" /><span>${tParts('本局禁用{names}盟约，此策略效果可能无法发挥', { names: names.map((n, i) => html`<span key=${i}>${tParts('【{name}】', { name: html`<s class="draft-detail__offname">${n}</s>` })}</span>`) })}</span></p>`;
}

/**
 * Bands selectable in a mode (modeTypeList contains the mode's type, and — 规程 — the mode is not one of its
 * inactiveModeIds, as the server's GameData.bandAllowed), sorted by sortId.
 * @param {any[]} bands
 * @param {string|null} modeType 'SINGLE'|'MULTI'
 * @param {string|null} [modeId] the match's mode
 */
export function allowedBands(bands, modeType, modeId = null) {
  const sid = (b) => (Number.isFinite(b.sortId) ? b.sortId : 99);
  return (Array.isArray(bands) ? bands : [])
    .filter((b) => b && (!modeType || !Array.isArray(b.modeTypeList) || b.modeTypeList.includes(modeType)))
    .filter((b) => !modeId || !Array.isArray(b.inactiveModeIds) || !b.inactiveModeIds.includes(modeId))
    .sort((a, b) => sid(a) - sid(b) || (a.bandId < b.bandId ? -1 : a.bandId > b.bandId ? 1 : 0));
}

/** The official default strategy of an automatic assignment (data/config.json bandDraft.timeoutBandId). */
export const DEFAULT_TIMEOUT_BAND = 'band_bldsk';

/**
 * The strategy the server assigns me when my turn times out (server/match/match/phases.js defaultBand): the official default
 * 「华法琳」 while no teammate holds it, else the first free strategy in draft order (sortId) — never one a teammate
 * already picked (队友已选).
 * @param {any[]} bands allowedBands(...) (sortId order)
 * @param {Map<string, any>} taken teammateBands(...)
 * @param {string} [defaultId]
 * @returns {string|null}
 */
export function timeoutBand(bands, taken, defaultId = DEFAULT_TIMEOUT_BAND) {
  const list = Array.isArray(bands) ? bands : [];
  const has = (id) => !!(taken && typeof taken.has === 'function' && taken.has(id));
  if (defaultId && !has(defaultId) && (!list.length || list.some((b) => b.bandId === defaultId))) return defaultId;
  return list.find((b) => !has(b.bandId))?.bandId || defaultId || null;
}

/**
 * Whether the draft still has someone to pass a skip to: another player who has not picked yet. The published order
 * keeps the players who already picked (for display), so its length alone would leave the last picker's 「跳过」 on
 * and the server would refuse it (match/phases.js skipBand → BAD_TARGET 'nobody to pass to'; upstream PR #546).
 * @param {{ order: string[], picks: Map<string, string> }} draft normalizeDraft(...)
 */
export function draftCanPass(draft) {
  const picks = draft?.picks instanceof Map ? draft.picks : new Map();
  return (Array.isArray(draft?.order) ? draft.order : []).filter((pid) => !picks.has(pid)).length > 1;
}

/**
 * Bands taken by teammates (队友已选): bandId → the picking players (never the viewer).
 * @param {Map<string, string>} picks normalizeDraft(...).picks (playerId → bandId)
 * @param {string} myId
 */
export function teammateBands(picks, myId) {
  const out = new Map();
  for (const [pid, bid] of picks instanceof Map ? picks : []) {
    if (pid === myId || typeof bid !== 'string') continue;
    if (!out.has(bid)) out.set(bid, []);
    out.get(bid).push(pid);
  }
  return out;
}

/**
 * The band the detail pane shows (= the highlighted band a turn that runs out takes): the current one, else my pick,
 * else the band a timeout would give me (timeoutBand: 「华法琳」 while free, else the first free one). When it is my
 * turn and the shown band was taken meanwhile (队友已选), that default instead (confirm would be disabled).
 * @param {string|null} sel
 * @param {{ bands: any[], taken: Map<string, any>, myPick: string|null, myTurn: boolean, defaultId?: string }} o
 */
export function draftSelection(sel, { bands, taken, myPick, myTurn, defaultId = DEFAULT_TIMEOUT_BAND }) {
  if (!Array.isArray(bands) || !bands.length) return sel;
  const free = timeoutBand(bands, taken, defaultId) || bands[0].bandId;
  if (!sel) return myPick || free;
  if (!myPick && myTurn && taken.has(sel)) return free;
  return sel;
}

/**
 * The strategy a turn that runs out assigns me (server Match.timeoutBand): the highlighted band while it is one of
 * the mode's and no teammate holds it, else timeoutBand. Null after my pick.
 * @param {string|null} sel the highlighted band
 * @param {{ bands: any[], taken: Map<string, any>, myPick?: string|null, defaultId?: string }} o
 */
export function autoPickBand(sel, { bands, taken, myPick = null, defaultId = DEFAULT_TIMEOUT_BAND }) {
  if (myPick) return null;
  const list = Array.isArray(bands) ? bands : [];
  const has = (id) => !!(taken && typeof taken.has === 'function' && taken.has(id));
  if (sel && !has(sel) && list.some((b) => b.bandId === sel)) return sel;
  return timeoutBand(list, taken, defaultId);
}

/**
 * The tip under the co-op draft order: the one skip, the turn clock and what a turn that runs out assigns me (the
 * highlighted band while free — autoPickBand). Untimed drafts (a single human) name no clock.
 * @param {{ timed: boolean, turnSeconds?: number|null, autoName?: string|null, selected?: boolean }} o
 *   selected: the auto pick is the highlighted band (not the default standing in for a band a teammate holds)
 */
export function draftTip({ timed, turnSeconds = null, autoName = null, selected = true }) {
  const skip = t('联合模拟在选择策略时可以进行一次跳过');
  if (!timed) return t('{skip}；本局不限时', { skip });
  const clock = Number(turnSeconds) > 0 ? t('每位博士有 {n} 秒', { n: Math.round(turnSeconds) }) : t('每位博士限时决策');
  if (!autoName) return t('{skip}；{clock}', { skip, clock });
  return selected ? t('{skip}；{clock}，超时将自动选择当前选中的「{autoName}」', { skip, clock, autoName })
    : t('{skip}；{clock}，超时将自动选择「{autoName}」', { skip, clock, autoName });
}

/**
 * The step header's countdown during the draft: the current turn's (m.public.deadline = draft.turnDeadline) with a
 * turn's length as the gauge total — null when the draft is untimed.
 * @param {any} pub m.public
 * @returns {{ deadline: number, total: number|null } | null}
 */
export function draftClock(pub) {
  const d = pub && typeof pub.draft === 'object' ? pub.draft : null;
  if (!d || d.untimed) return null;
  const deadline = Number(pub.deadline) > 0 ? Number(pub.deadline) : Number(d.turnDeadline) || 0;
  if (!(deadline > 0)) return null;
  // 编队确认 after the last pick: its own length (m.public.draft.confirm.seconds)
  const len = Number(d.confirm?.seconds) > 0 ? Number(d.confirm.seconds) : Number(d.turnSeconds);
  return { deadline, total: len > 0 ? len : null };
}

/**
 * The 自选 picks a strategy's roster choice would apply (the 自选预设 row's preview): a faction's preset (none when it
 * has none: that empty roster applies — maintainer decision 2026-10-29), 不使用预设's roster, or the live picks for
 * 保持当前编队.
 * @param {string} choice a chat faction id, BASE_LINK or KEEP_LINK
 * @param {{ presets?: Record<string, any>, base?: Record<string, any> }} st diyPresetStore state
 * @param {Record<string, any>} live the live picks (loadoutStore diy)
 */
export function presetPreviewPicks(choice, st, live) {
  if (choice === BASE_LINK) return st?.base || {};
  if (chatFaction(choice)) return st?.presets?.[choice] || {};
  return live || {};
}

/**
 * The tags of the 自选预设 row: 已关联 (the choice is the strategy's saved link), 推荐 (no link: the faction the
 * strategy is built around), 本局禁用 (the faction's bond is off this match — applied anyway, maintainer 2026-10-12).
 * A turned-off recommendation (link KEEP_LINK, ui/diyPresets.js) reads as no link: 不使用预设 untagged (maintainer
 * decision 2026-10-13).
 * @param {string} choice @param {{ link?: string|null, rec?: string|null, off?: string[]|null }} o
 * @returns {Array<'linked'|'rec'|'off'>}
 */
export function presetChoiceTags(choice, { link = null, rec = null, off = null } = {}) {
  const out = [];
  if (link && link === choice && link !== KEEP_LINK) out.push('linked');
  else if (!link && rec && rec === choice) out.push('rec');
  const f = chatFaction(choice);
  if (f && Array.isArray(off) && off.includes(f.bond)) out.push('off');
  return out;
}

/** The match (room code + match number) a strategy's preset was last applied for, so a re-render never applies it twice. */
let presetAppliedFor = '';

/**
 * The status line of the 本局信息 dialog: what the draft does while the dialog covers it — my pick, else whose turn it is
 * with the turn's seconds left (the step header's number; none when untimed), warning at ≤ 10 s like the countdown.
 * @param {{ myPick?: string|null, pickName?: string|null, myTurn: boolean, turnName?: string|null, secs?: number|null,
 *   waiting?: boolean }} o waiting: teammates still have to pick after my pick
 * @returns {{ text: string, secs: number|null, tone: 'mint'|'gold'|'warn'|'dim' }}
 */
export function draftInfoStatus({ myPick = null, pickName = null, myTurn, turnName = null, secs = null, waiting = false }) {
  if (myPick) return { text: `${t('已选择「{name}」', { name: pickName || '' })}${waiting ? t('，等待其他博士') : ''}`, secs: null, tone: 'mint' };
  const s = Number.isFinite(secs) ? Math.max(0, Math.round(secs)) : null;
  const tone = s != null && s <= 10 ? 'warn' : 'gold';
  if (myTurn) return { text: t('轮到你决策'), secs: s, tone };
  return { text: turnName ? t('{turnName} 决策中', { turnName }) : t('等待轮到你'), secs: s, tone: s != null ? tone : 'dim' };
}

/** A 自选 pick's operator (backups.json units; the slot's preview): its name and avatar (the 自选编队 tab's own icon). */
const pickUnit = (pick) => (pick?.charId ? data.get('backups')?.units?.[pick.charId] || { charId: pick.charId } : null);
const pickAvatar = (m, u) => (u ? chessAvatarUrl(m, { charId: u.charId, assets: { avatar: u.assets?.avatar } }) : null);
/** A DIY slot's tier from its id (chess_char_<tier>_diy…) when the slot list is not loaded. */
const slotTier = (id) => Number(/^chess_char_(\d)_/.exec(id)?.[1]) || null;

/**
 * The roster choices of the 自选预设 row: 保持当前编队 (`keep`; not on 规程's 确定自选编队, whose cards are the roster in
 * use), 不使用预设, then the season's chat factions (their icon, 未设置 when the faction has no preset, 本局禁用 when this
 * match disables its bond).
 * @param {Record<string, any>} presets @param {string[]|null} off @param {{ keep?: boolean }} [o]
 * @returns {Array<{ v: string, label: string, f?: any, empty?: boolean, off?: boolean }>}
 */
export function presetOptions(presets, off, { keep = true } = {}) {
  const offIds = Array.isArray(off) ? off : [];
  return [
    ...(keep ? [{ v: KEEP_LINK, label: t('保持当前编队') }] : []),
    { v: BASE_LINK, label: t('不使用预设') },
    ...chatFactionsOf(presetSeasonOf()).map((f) => ({ v: f.id, label: t(f.name), f, empty: !presets?.[f.id], off: offIds.includes(f.bond) })),
  ];
}

/**
 * The 自选预设 dropdown (maintainer request 2026-10-13: an icon before each faction — a native <select> draws no image):
 * a button showing the choice, and the list floating over the pane (fixed: the pane's overflow cannot cut it; under the
 * button, or above it without room below). Escape, a tap outside, a scroll or a resize closes it. No words beside the names (maintainer decision 2026-10-13): a faction without a
 * preset has its icon left uncoloured (grey), a faction this match disables carries the
 * briefing's own img_bond_banned mark top-right of its icon (as the briefing draws it; without that local art the dimmed
 * name); both say so in the tooltip.
 * @param {{ choice: string, presets: Record<string, any>, off: string[]|null, locked: boolean, onChoice: (v: string) => void,
 *   keep?: boolean }} props keep: offer 保持当前编队 (presetOptions)
 */
export function PresetPicker({ choice, presets, off, locked, onChoice, keep = true }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if (locked) setOpen(false); }, [locked]);
  // the opened list floats over the pane (maintainer request 2026-10-13: opening it must not grow the pane into a scroll):
  // fixed under the button, or above it when the viewport has no room below, as wide as the button
  useLayoutEffect(() => {
    if (!open) return;
    const btn = ref.current?.querySelector('.draft-preset__sel');
    const list = ref.current?.querySelector('.draft-preset__list');
    if (!btn || !list) return;
    const r = btn.getBoundingClientRect();
    const h = list.offsetHeight;
    const below = window.innerHeight - r.bottom - 4;
    const up = h > below && r.top - 4 > below;
    list.style.left = `${r.left}px`;
    list.style.width = `${r.width}px`;
    list.style.top = up ? `${Math.max(4, r.top - 2 - h)}px` : `${r.bottom + 2}px`;
    list.style.maxHeight = `${Math.max(below, r.top - 4) - 2}px`;
    list.style.visibility = 'visible';
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    // a fixed list would stay behind when the pane scrolls or the window resizes: close it instead
    const moved = (e) => { if (!ref.current?.querySelector('.draft-preset__list')?.contains(e.target)) setOpen(false); };
    const resized = () => setOpen(false);
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', esc, true);
    document.addEventListener('scroll', moved, true);
    window.addEventListener('resize', resized);
    return () => {
      document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc, true);
      document.removeEventListener('scroll', moved, true); window.removeEventListener('resize', resized);
    };
  }, [open]);
  const opts = presetOptions(presets, off, { keep });
  const cur = opts.find((o) => o.v === choice) || opts[0];
  const ban = localAsset('ui/outer', 'img_bond_banned');
  const tip = (o) => [o.label, o.empty && t('尚未设置预设'), o.off && t('本局禁用')].filter(Boolean).join(' · ');
  // 保持当前编队 ✓ / 不使用预设 − (glyphs: they have no faction icon)
  const line = (o) => html`<span class="draft-preset__icw">${o.f ? html`<${FactionIcon} f=${o.f} class="chat__facico draft-preset__ico" />`
    : html`<${Icon} name=${o.v === KEEP_LINK ? 'check' : 'minus'} class="draft-preset__ico is-glyph" />`}
    ${o.off && ban ? html`<img class="draft-preset__ban" src=${ban} alt="" draggable=${false} />` : null}</span><span class="draft-preset__optname">${o.label}</span>`;
  const stateCls = (o) => cx(o.empty && 'is-empty', o.off && 'is-off');
  return html`<div class="draft-preset__pick" ref=${ref}>
    <button type="button" id="draft-preset-sel" data-testid="draft-preset-select" data-value=${cur.v}
      aria-haspopup="listbox" aria-expanded=${open ? 'true' : 'false'} disabled=${locked} style=${cur.f ? `--fac:${cur.f.color}` : null}
      class=${cx('draft-preset__sel', stateCls(cur))} title=${tip(cur)}
      onClick=${() => setOpen(!open)}><span class="draft-preset__lbl" aria-hidden="true">${t('自选预设')} · </span>${line(cur)}<i class="draft-preset__caret" aria-hidden="true"></i></button>
    ${open ? html`<ul class="draft-preset__list" role="listbox" aria-label=${t('自选预设')}>
      ${opts.map((o) => html`<li key=${o.v} role="option" aria-selected=${o.v === choice ? 'true' : 'false'}>
        <button type="button" class=${cx('draft-preset__opt', o.v === choice && 'is-on', stateCls(o))} data-preset=${o.v} title=${tip(o)}
          style=${o.f ? `--fac:${o.f.color}` : null} onClick=${() => { setOpen(false); if (o.v !== choice) onChoice(o.v); }}>${line(o)}</button>
      </li>`)}
    </ul>` : null}
  </div>`;
}

/**
 * The detail pane's 自选预设 row (전략별 선발 프리셋): the roster choice (PresetPicker), its tags, the four slots it would
 * field by tier — a plate per tier with its badge once, then the operators' icons as the official stage info draws them
 * (ChessIcon without its own tier badge; the name in the tooltip; maintainer request 2026-10-13: an operator whose every
 * bond this match disables is drawn banned; a slot opens its picker through `onEdit(slotId)` — empty: +, filled: a swap
 * icon on hover, and its × (`onClear(slotId)`) empties it in the roster shown; a faction without a
 * preset: four empty slots) —, 记住 and 编辑自选编队 (`onEdit()`). The dropdown names the roster the row shows and
 * edits (diyPresets.js choiceRoster), so no line repeats it (maintainer request 2026-10-29).
 * @param {{ band: any, choice: string, link: string|null, presets: Record<string, any>, base: Record<string, any>,
 *   live: Record<string, any>, off: string[]|null, locked: boolean, remember: boolean, m?: any,
 *   onChoice: (v: string) => void, onRemember: (v: boolean) => void, onEdit?: ((slotId?: string) => void)|null,
 *   onClear?: ((slotId: string) => void)|null }} props
 */
export function DraftPresetRow({ band, choice, link, presets, base, live, off, locked, remember, m = null, onChoice, onRemember, onEdit = null, onClear = null }) {
  const tags = presetChoiceTags(choice, { link, rec: bandRecommendation(band), off });
  const picks = presetPreviewPicks(choice, { presets, base }, live);
  const slots = diySlotList({ chess: data.get('chess'), backups: data.get('backups') });
  const list = slots.length ? slots.map((x) => ({ id: x.slotId, tier: x.tier, shop: x.shopLevel }))
    : Object.keys(picks || {}).map((id) => ({ id, tier: slotTier(id), shop: slotTier(id) }));
  // the slots by tier, in slot order (5阶 ×2, 6阶 ×2)
  const groups = [];
  for (const x of list) {
    const g = groups.find((y) => y.tier === x.tier);
    if (g) g.slots.push(x);
    else groups.push({ tier: x.tier, shop: x.shop, slots: [x] });
  }
  const TAG = { linked: ['link', t('已关联')], rec: ['rec', t('推荐')], off: ['off', t('本局禁用')] };
  // a pick whose every bond is off this match would never reach the shop: drawn as the briefing's banned operators
  const offSet = new Set(Array.isArray(off) ? off : []);
  const diyData = { chess: data.get('chess'), backups: data.get('backups') };
  const getChess = (id) => data.lookup('chess', id);
  const rule = { coreBan: seasonFeature(store.get().room?.season, 'coreBondBan'), isCore: (b) => !!data.lookup('bonds', b)?.isCore };
  return html`<div class="draft-preset" data-testid="draft-preset">
    <div class="draft-preset__head" title=${t('确认选择时套用，超时自动选择时也会套用；选择阵营预设时聊天阵营一并切换')}><${MicroLabel} tone="mint">DIY PRESET</${MicroLabel}><label for="draft-preset-sel">${t('自选预设')}</label>
      ${tags.map((k) => html`<span key=${k} class=${`draft-preset__tag is-${TAG[k][0]}`}>${TAG[k][1]}</span>`)}</div>
    <${PresetPicker} choice=${choice} presets=${presets} off=${off} locked=${locked} onChoice=${onChoice} />
    <div class="draft-preset__slots">${groups.map((g) => html`<div key=${g.tier ?? '?'} class="draft-preset__grp" data-tier=${g.tier ?? ''}
        style=${g.tier ? `--gc: var(--tier-${g.tier})` : null}>
      ${g.tier ? html`<span class="draft-preset__tier" title=${[t('{tier}阶 自选', { tier: g.tier }), g.shop && t('调度中心等级 {level} 起出现在商店', { level: g.shop })].filter(Boolean).join(' · ')}>
        <${TierChip} tier=${g.tier} size="sm" /></span>` : null}
      ${g.slots.map(({ id, tier }) => {
        const u = pickUnit(picks[id]);
        const name = u ? u.name || u.charId : '';
        const gone = !!u && diyPickOff(id, picks[id], offSet, getChess, diyData, rule);
        // an empty slot opens its picker in the 自选编队 tab, a filled one too (as its 更换); not on a locked row
        if (!u && onEdit && !locked) {
          const add = t('{slot}：选择干员', { slot: t('{tier}阶 自选', { tier: tier || '?' }) });
          return html`<button key=${id} type="button" class="draft-preset__slot is-empty is-edit" data-slot=${id} title=${add} aria-label=${add}
            data-testid="draft-preset-add" onClick=${() => onEdit(id)}><${ChessIcon} title=${add} class="draft-preset__ava" /></button>`;
        }
        const tip = [t('{tier}阶', { tier: tier || '?' }), name, gone && t('本局禁用')].filter(Boolean).join(' · ');
        if (onEdit && !locked) {
          const swap = `${tip} · ${t('更换')}`;
          const rm = `${tip} · ${t('清空')}`;
          return html`<span key=${id} class=${cx('draft-preset__slot', 'is-edit', gone && 'is-off')} data-slot=${id}>
            <button type="button" class="draft-preset__hit" title=${swap} aria-label=${swap} data-testid="draft-preset-swap" onClick=${() => onEdit(id)}>
              <${ChessIcon} src=${pickAvatar(m, u)} name=${name} banned=${gone} title=${swap} class="draft-preset__ava" />
              <i class="draft-preset__swap" aria-hidden="true"><${Icon} name="refresh" /></i>
            </button>
            ${onClear ? html`<button type="button" class="draft-preset__rm" title=${rm} aria-label=${rm} data-testid="draft-preset-remove"
              onClick=${() => onClear(id)}><${Icon} name="close" /></button>` : null}
          </span>`;
        }
        return html`<span key=${id} class=${cx('draft-preset__slot', !u && 'is-empty', gone && 'is-off')} data-slot=${id}>
          <${ChessIcon} src=${pickAvatar(m, u)} name=${name} banned=${gone} title=${tip} class="draft-preset__ava" />
        </span>`;
      })}
    </div>`)}</div>
    <div class="draft-preset__foot">
      <label class="draft-preset__keep" title=${t('确认选择时套用，超时自动选择时也会套用；选择阵营预设时聊天阵营一并切换')}><input type="checkbox"
        checked=${remember && choice !== KEEP_LINK} disabled=${locked || choice === KEEP_LINK} onChange=${(e) => onRemember(e.currentTarget.checked)} />${t('记住此策略的预设')}</label>
      ${onEdit ? html`<${Button} variant="ghost" size="sm" icon="edit" class="draft-preset__edit" data-testid="draft-preset-edit" disabled=${locked}
        title=${t('在自选编队中编辑此预设')} onClick=${() => onEdit()}>${t('编辑自选编队')}<//>` : null}
    </div>
  </div>`;
}

/**
 * One doctor of the draft order (the upstream event layout, upstream PR #643; the official player_card_item's parts,
 * maintainer decision 2026-11-08): the name card (avatar with 我 on one's own, name, state), the strategy box beside it
 * (the official selecting hourglass shallow_main and 决策中 — for everyone, one's own turn too: the 轮到你 finger
 * belongs to the client's top bar, not to this box —, the waiting dots, or the picked strategy) and ✓ outside it; one's
 * own row also carries the client's myself_highlight tag and arrow (drawn only with the official sprites, draft.css). The
 * card carries the Doctor's 名片干员 art behind the text (ui/seatArt.js, the operator of the room's seat card; `art` its
 * portrait, null for a bot or none) — a picture that fails to load is left out. The ✓ follows the pick; the 3/3
 * 确定自选编队 screen (screens/diyChoose.js) shows the same rows with the ✓ of its own ready (`checked`).
 */
export function OrderRow({ p, i, picked, cur, self, ready, gd, art = null, checked = !!picked }) {
  const [badArt, setBadArt] = useState(/** @type {string[]} */ ([]));
  const shownArt = seatArtSrc([art], badArt);
  const pband = picked ? gd.band(picked) : null;
  return html`<div class=${cx('dorder', cur && 'is-cur', picked && 'is-done', checked && 'is-checked', self && 'is-self')} style=${`--i:${i}`}>
    <div class="dorder__card">
      ${shownArt ? html`<img key=${shownArt} class="dorder__art" src=${shownArt} alt="" aria-hidden="true" draggable=${false}
        onError=${() => setBadArt((b) => (b.includes(shownArt) ? b : [...b, shownArt]))} />` : null}
      <span class="dorder__face"><${PlayerAvatar} player=${p} self=${self} />${self ? html`<span class="dorder__me" title=${t('你')}><${Icon} name="user" /></span>` : null}</span>
      <div class="dorder__text">
        <b class="dorder__name"><span>${playerName(p.name) || t('博士')}</span>${p.isBot ? html`<span class="dorder__ai">AI</span>` : null}</b>
        <span class="dorder__state">${picked ? html`<span class="t-mint">${pband?.name || t('已选择')}</span>${ready ? html`<span class="dorder__ready">${t('已准备')}</span>` : null}`
          : cur ? html`<span class="t-gold">${t('决策中')}</span>` : html`<span class="t-dim">${t('等待中')}</span>`}</span>
      </div>
    </div>
    ${picked ? html`<span class="dorder__box is-band" title=${pband?.name || ''}><${BandIcon} bandId=${picked} size="md" /></span>`
      : cur ? html`<span class="dorder__box is-cur"><${Sprite} k="bandChoose/shallow_main" class="dorder__glass" fallback=${html`<${Icon} name="hourglass" />`} /><span>${t('决策中')}</span></span>`
      : html`<span class="dorder__box is-wait"><${Icon} name="dots" /></span>`}
    <span class="dorder__check" aria-hidden="true">${checked ? html`<${Icon} name="check" />` : null}</span>
    ${self ? html`<i class="dorder__tag" aria-hidden="true"></i><i class="dorder__arrow" aria-hidden="true"></i>` : null}
  </div>`;
}

/** 「【effect】 description」 of a strategy (the data's description usually opens with the 【effect】 already). */
function BandText({ band, class: cls }) {
  const text = band.descRaw || band.desc || '';
  const head = band.effectName && !String(text).includes(`【${band.effectName}】`) ? `【${band.effectName}】` : '';
  return html`<p class=${cls}>${head}<${RichText} text=${text} /></p>`;
}

/** BAND_DRAFT screen. */
/**
 * 名片干员 (ui/seatArt.js): the operator of each Doctor's seat card in the room (seats[].card; one's own pick at once), else
 * the one chosen by the player id — the room's seat cards' art on the order rows. Returns player → portrait URL or null.
 * @param {any} gd useGameData() @param {string|null} myId
 */
export function useOrderArt(gd, myId) {
  const roomSeats = useStore((s) => s.room?.seats);
  const myCard = useStore((s) => s[CARD_KEY], Object.is, cardStore);
  const cards = useMemo(() => cardContext(cardOperators(gd.list('chess'), data.get('backups')), { pending: !data.get('backups') }), [gd.ready]);
  return (p) => {
    if (p.isBot) return null;
    const seat = (Array.isArray(roomSeats) && roomSeats.find((x) => x && x.playerId === p.playerId)) || { playerId: p.playerId };
    const op = seatOperator(seat, cards, { myId, myCard });
    return op ? chessPortraitUrl(data.get('assets'), op.chess) : null;
  };
}

export function BandDraftScreen() {
  const pub = useStore((s) => s.match.public);
  const priv = useStore((s) => s.match.private);
  const myId = useStore((s) => s.me.playerId);
  const roomSolo = useStore((s) => s.room?.mode === 'solo');
  const gd = useGameData();
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(null);
  const [exit, setExit] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  // 전략별 선발 프리셋: this match's roster choice per strategy (bandId → choice) and 记住此策略的预设 (bandId → bool, on)
  const [presetSel, setPresetSel] = useState({});
  const [remember, setRemember] = useState({});
  const links = useStore((s) => s.links, Object.is, diyPresetStore);
  const presets = useStore((s) => s.presets, Object.is, diyPresetStore);
  const baseRoster = useStore((s) => s.base, Object.is, diyPresetStore);
  const livePicks = useStore((s) => s.diy, Object.is, loadoutStore);
  const roomKey = useStore((s) => `${s.room?.code || ''}#${s.room?.matchNo ?? 0}`);

  const mode = gd.config?.modes?.[pub?.modeId];
  const offBonds = modeOffBonds(mode); // the bonds this mode never activates (标准: 10 of 23)
  const solo = roomSolo || mode?.type === 'SINGLE' || String(pub?.modeId || '').includes('single');
  const bands = useMemo(() => allowedBands(gd.list('bands'), mode?.type || (solo ? 'SINGLE' : 'MULTI'), pub?.modeId || null), [gd.ready, mode?.type, solo, pub?.modeId, data.locale()]);
  const artOf = useOrderArt(gd, myId);
  const players = sortedPlayers(pub);
  const draft = normalizeDraft(pub?.draft, players);
  const myPick = draft.picks.get(myId) || priv?.bandId || null;
  const myTurn = !myPick && (solo || draft.turnPid === myId);
  const skipsLeft = draft.skipsLeft.has(myId) ? draft.skipsLeft.get(myId) : (skipped ? 0 : 1);
  const canSkip = !solo && myTurn && skipsLeft > 0 && draftCanPass(draft);
  const taken = solo ? new Map() : teammateBands(draft.picks, myId);
  const pickers = new Map(); // bandId → players
  for (const [pid, bid] of draft.picks) {
    const p = players.find((x) => x.playerId === pid);
    if (!pickers.has(bid)) pickers.set(bid, []);
    pickers.get(bid).push(p || { playerId: pid, name: '?' });
  }

  // default selection: my pick, else what a timeout gives me (华法琳 while free); when my turn comes while the selected
  // band has been taken by a teammate meanwhile (队友已选), move the selection back to that default
  const defaultId = gd.config?.bandDraft?.timeoutBandId || DEFAULT_TIMEOUT_BAND;
  const takenKey = [...taken.keys()].sort().join(',');
  useEffect(() => {
    const next = draftSelection(sel, { bands, taken, myPick, myTurn, defaultId });
    if (next !== sel) setSel(next);
  }, [bands.length, myPick, myTurn, takenKey]);
  // "your turn" cue
  useEffect(() => { if (myTurn && !solo) audio.sfx('yourTurn'); }, [myTurn]);
  // the 本局信息 dialog never outlives the turn it was opened in: a turn change (a pick, a skip, a turn that ran out, an
  // AI pick) or my pick closes it, so whoever's turn begins sees the draft
  const turnKey = `${draft.turnPid || ''}|${myPick || ''}`;
  useEffect(() => { setInfoOpen(false); }, [turnKey]);

  // one countdown (user playtest #4 item 4): the current turn's — m.public.deadline
  const clock = solo ? null : draftClock(pub);
  // the highlighted band is what a turn that runs out takes (Match.timeoutBand): report every change before my pick
  const timed = !solo && !!pub?.draft && !pub.draft.untimed;
  const focusSent = useRef(null);
  useEffect(() => {
    // (a spectator seat — community report #26 — is in no draft order: it never reports)
    if (!timed || myPick || !sel || focusSent.current === sel || !draft.order.includes(myId)) return;
    focusSent.current = sel;
    act('g.bandFocus', { bandId: sel }, { sfx: false, quiet: true });
  }, [sel, timed, myPick]);

  // what a timeout gives me: the highlighted band while free, else the default (never 队友已选 — match/phases.js timeoutBand)
  const autoId = autoPickBand(sel, { bands, taken, myPick, defaultId });
  const autoName = (autoId && gd.band(autoId)?.name) || gd.band(defaultId)?.name || tName('华法琳');

  const band = sel ? gd.band(sel) : null;
  const selTaken = !!band && taken.has(band.bandId);
  // 전략별 선발 프리셋: the roster a strategy applies when my pick of it lands (see the header)
  const inDraft = draft.order.includes(myId);
  // 规程: the 自选预设 is picked on 确定自选编队 (screens/diyChoose.js), the draft's detail pane has no row (maintainer decision 2026-11-13)
  const diyStep = hasDiyChooseStep(gd.config);
  const choiceFor = (bid) => presetSel[bid] ?? bandPresetChoice(bid, gd.band(bid), links, presets);
  const applyBandPreset = async (bid) => {
    presetAppliedFor = `${roomKey}|${bid}`;
    const choice = choiceFor(bid);
    // the 不使用预设 default is no choice of the player's: kept unlinked (a link only when picked in the dropdown)
    const chosen = choice !== BASE_LINK || presetSel[bid] === BASE_LINK;
    if (choice !== KEEP_LINK && chosen && (remember[bid] ?? true)) linkBand(bid, choice);
    if (choice === KEEP_LINK) return;
    await applyPresetChoice(choice);
    // a solo draft ends with the pick: the picks must reach the match first (room.diy is debounced)
    await flushDiySync();
  };
  // my strategy's row after the pick (its 编队确认 included): a new choice applies at once
  const changeChoice = (bid, v) => {
    setPresetSel({ ...presetSel, [bid]: v });
    if (myPick !== bid || pub?.phase !== PHASE.BAND_DRAFT || v === KEEP_LINK) return;
    if (remember[bid] ?? true) linkBand(bid, v);
    void applyPresetChoice(v).then(() => flushDiySync());
  };
  // 编辑自选编队: the 自选编队 tab on the roster the row shows (keep, or a faction without a preset: the one in use —
  // choiceRoster); an empty slot's picker with it
  const editPreset = (bid, slotId = null) => {
    const roster = choiceRoster(choiceFor(bid));
    if (roster !== undefined) selectPreset(roster);
    openLoadout('draft', null, 'diy', slotId);
  };
  // a filled slot's ×: empties it in the roster the row shows (the picks in use only when that is the one shown)
  const clearPresetSlot = (bid, slotId) => clearRosterSlot(choiceFor(bid), slotId);
  const changeRemember = (bid, v) => {
    setRemember({ ...remember, [bid]: v });
    if (v && myPick === bid && choiceFor(bid) !== KEEP_LINK) linkBand(bid, choiceFor(bid));
  };
  const confirm = async () => {
    if (!band || busy || !myTurn || selTaken) return;
    setBusy('pick');
    await applyBandPreset(band.bandId);
    // a solo draft ends with this pick: a loadout edit still in its debounce reaches the match first
    await flushLoadoutSync();
    await actions.band(band.bandId);
    setBusy(null);
  };
  // a pick I did not confirm here (a turn that ran out, AI 托管): its roster applies as it lands — once per match
  useEffect(() => {
    if (!myPick || !inDraft || pub?.phase !== PHASE.BAND_DRAFT || presetAppliedFor === `${roomKey}|${myPick}`) return;
    void applyBandPreset(myPick);
  }, [myPick, roomKey]);
  // 编队确认 after the last pick (timed drafts): 准备完毕 ends it once every human is done
  const confirmOn = !!pub?.draft?.confirm;
  const meReady = !!players.find((p) => p.playerId === myId)?.confirmReady;
  const readyUp = async () => {
    if (busy || meReady || !confirmOn) return;
    setBusy('ready');
    await actions.draftReady();
    setBusy(null);
  };
  const skip = async () => {
    if (busy || !canSkip) return;
    setBusy('skip');
    if (await actions.bandSkip()) setSkipped(true);
    setBusy(null);
  };
  const turnName = playerName(players.find((p) => p.playerId === draft.turnPid)?.name);
  useTicker(clock ? 250 : 0);
  // the turn's seconds (the 本局信息 dialog's status line repeats the step header's number)
  const turnSecs = clock ? secondsLeft(clock.deadline) : null;
  const turnLen = Number(pub?.draft?.turnSeconds) > 0 ? Math.round(pub.draft.turnSeconds) : null;
  // 本局信息: the briefing's blocks (built only while the dialog is open) and the draft's state under it
  const info = infoOpen ? matchInfoModel(pub, { bonds: gd.list('bonds'), chess: gd.chess, mode, priv, diyData: { chess: data.get('chess'), backups: data.get('backups') } }) : null;
  const infoStatus = infoOpen ? draftInfoStatus({ myPick, pickName: myPick ? gd.band(myPick)?.name : null, myTurn, turnName, secs: turnSecs,
    waiting: !solo && !draft.done }) : null;

  const rows = solo ? players.filter((p) => p.playerId === myId) : draft.order.map((pid) => players.find((p) => p.playerId === pid)).filter(Boolean);
  // the official sprites (draftArt) and the 跳过 arrow cut from btn_skip
  const orderArt = draftArt('order');
  const detailArt = draftArt('detail');
  const skipIco = useSkipArrow();
  return html`<div class="screen draft">
    <div class="brief__bg" aria-hidden="true"></div>
    <${StepHeader} step=${2} of=${startStepCount(gd.config)} title=${t('选择策略')} micro="STRATEGY // BAND CHECK" pub=${clock ? { ...pub, deadline: clock.deadline } : { ...pub, deadline: 0 }}
      total=${clock ? clock.total : null} config=${gd.config} onExit=${() => setExit(true)} />
    <main class="draft__main">
      <aside class=${cx('draft-order', !solo && draft.order.length > 4 && 'is-8' /* the 8-player mode: compact rows */, orderArt && 'has-art')}
        style=${orderArt || null}>
        ${orderArt ? html`<i class="draft-order__back" aria-hidden="true"></i>` : null}
        <div class="draft-order__deco" aria-hidden="true"><i></i><i></i><span>STRONGHOLD PROTOCOL<br />${solo ? 'SINGLE OPERATOR' : 'COLLABORATIVE SYSTEM'}</span></div>
        <div class="draft-order__rows">
          ${rows.map((p, i) => {
            const picked = draft.picks.get(p.playerId) || (p.playerId === myId ? myPick : p.bandId) || null;
            return html`<${OrderRow} key=${p.playerId} p=${p} i=${i} picked=${picked} cur=${!picked && (solo || draft.turnPid === p.playerId)}
              self=${p.playerId === myId} ready=${confirmOn && !!p.confirmReady} gd=${gd} art=${artOf(p)} />`;
          })}
        </div>
        <div class="draft-order__side">
          <${Button} variant="secondary" icon="search" block=${true} class="draft-order__info" data-testid="match-info-open"
            aria-haspopup="dialog" onClick=${() => setInfoOpen(true)}>${t('本局信息')}<//>
          ${inDraft ? html`<${LoadoutButton} from="draft" class="draft-order__loadout" />` : null}
          ${!solo ? html`<p class="draft-order__tip" data-testid="draft-tip">${draftTip({ timed, turnSeconds: turnLen, autoName: myPick ? null : autoName, selected: autoId === sel })}</p>` : null}
        </div>
      </aside>

      <section class="draft-grid" role="listbox" aria-label=${t('策略')}>
        ${bands.map((b, i) => {
          const who = pickers.get(b.bandId) || [];
          const isTaken = taken.has(b.bandId);
          const offNames = bandOffBonds(b, offBonds).map((id) => gd.bond(id)?.name || id); // 本局禁用 (still selectable)
          const on = sel === b.bandId;
          const link = chatFaction(links?.[b.bandId]);
          return html`<button key=${b.bandId} type="button" role="option" aria-selected=${on ? 'true' : 'false'} data-band=${b.bandId}
              aria-disabled=${isTaken ? 'true' : 'false'} title=${isTaken ? t('队友已选') : offNames.length ? bandOffLine(offNames) : b.name}
              class=${cx('dband', on && 'is-sel', myPick === b.bandId && 'is-mine', isTaken && 'is-taken', offNames.length && 'is-off')} style=${`--n:${Math.min(i, 15)}`}
              onClick=${() => { setSel(b.bandId); audio.sfx('tab', { volume: 0.5 }); }}>
            <span class="dband__frame"><${BandIcon} bandId=${b.bandId} size="lg" /></span>
            <span class="dband__name">${b.name}</span>
            <${BandOffTag} names=${offNames} />
            ${link && !isTaken ? html`<span class="dband__link" title=${t('已关联{faction}预设', { faction: t(link.name) })}
              style=${`--fac:${link.color}`} data-link=${links[b.bandId]}><${FactionIcon} f=${link} /></span>` : null}
            ${who.length ? html`<span class="dband__who">${who.slice(0, 4).map((p) => html`<${PlayerAvatar} key=${p.playerId} player=${p} size="sm" />`)}</span>` : null}
            ${isTaken ? html`<span class="dband__taken">${t('队友已选')}</span>` : null}
            ${on ? html`<span class="dband__selmark" aria-hidden="true">SELECTED</span>` : null}
          </button>`;
        })}
      </section>

      <aside class=${cx('draft-detail', detailArt && 'has-art')} style=${detailArt || null}>
        ${band ? html`<div class="draft-detail__body" key=${band.bandId}>
          <div class="draft-detail__art"><${BandIcon} bandId=${band.bandId} size="xl" /></div>
          <div class="draft-detail__hp">${t('初始生命值')}<b class="num">${band.totalHp ?? '--'}</b></div>
          <span class="draft-tag draft-tag--id" aria-hidden="true">STRATEGY</span>
          <h2 class="draft-detail__name">${band.name}</h2>
          <${BandOffNote} names=${bandOffBonds(band, offBonds).map((id) => gd.bond(id)?.name || id)} />
          <span class="draft-tag draft-tag--intro" aria-hidden="true">INTRO</span>
          <div class="draft-detail__eff"><${BandText} band=${band} class="draft-detail__desc" /></div>
          ${inDraft && !diyStep ? html`<${DraftPresetRow} band=${band} choice=${choiceFor(band.bandId)} link=${links?.[band.bandId] ?? null}
            presets=${presets} base=${baseRoster} live=${livePicks} off=${pub?.disabledBonds ?? null} m=${gd.m}
            locked=${(!!myPick && myPick !== band.bandId) || busy === 'pick'}
            remember=${remember[band.bandId] ?? true} onChoice=${(v) => changeChoice(band.bandId, v)}
            onRemember=${(v) => changeRemember(band.bandId, v)} onEdit=${(slotId) => editPreset(band.bandId, slotId)}
            onClear=${(slotId) => clearPresetSlot(band.bandId, slotId)} />` : null}
        </div>` : html`<p class="t-dim draft-detail__body">${t('选择一个策略查看详情')}</p>`}
        <div class="draft-detail__actions">
          ${confirmOn && inDraft ? html`<div class="draft-confirm" role="status" data-testid="draft-confirm">
            <b>${t('策略已确定 · 编队确认')}</b>
            <p>${t('倒计时结束前仍可在上方更改自选预设，更改后立即套用。全员准备完毕后立即开始')}</p>
            <${Button} variant="primary" size="lg" icon="check" active=${meReady} disabled=${meReady} loading=${busy === 'ready'}
              data-testid="draft-ready" onClick=${readyUp}>${meReady ? t('已准备') : t('准备完毕')}<//>
          </div>`
            : myPick ? html`<p class="draft-detail__status t-mint"><${Icon} name="check" />${t('已选择「{name}」', { name: gd.band(myPick)?.name || '' })}${!solo && !draft.done ? t('，等待其他博士') : ''}</p>`
            : selTaken ? html`<p class="draft-detail__status draft-detail__status--taken"><${Icon} name="close" />${t('队友已选，请选择其他策略')}</p>`
            : !inDraft && !solo ? html`<p class="draft-detail__status"><${Icon} name="search" />${t('观战中')}</p>`
            : !myTurn ? html`<p class="draft-detail__status"><${Icon} name="hourglass" />${turnName ? t('{turnName} 正在决策…', { turnName }) : t('等待轮到你')}</p>` : null}
          ${confirmOn && inDraft ? null : html`<div class="draft-detail__btns">
            ${!solo ? html`<${Button} variant="secondary" size="lg" icon=${skipIco ? null : 'chevrons'} class="draft-skip" disabled=${!canSkip} loading=${busy === 'skip'} onClick=${skip}
              style=${skipIco ? `--skip-ico:url("${skipIco}")` : null}
              title=${skipsLeft > 0 ? t('跳过本轮，稍后再选') : t('跳过次数已用完')}>${skipIco ? html`<i class="draft-skip__ico" aria-hidden="true"></i>` : null}${t('跳过')}${skipsLeft > 0 ? '' : html`<span class="draft-skip__used">${t('（已用）')}</span>`}<//>` : null}
            <${Button} variant="primary" size="lg" icon="check" class="draft-pick" disabled=${!myTurn || !band || selTaken} loading=${busy === 'pick'} onClick=${confirm}>${selTaken ? t('队友已选') : t('确认选择')}<//>
          </div>`}
        </div>
      </aside>
    </main>
    <${ExitModal} open=${exit} onClose=${() => setExit(false)} solo=${solo} />
    <${MatchInfoDialog} open=${infoOpen} onClose=${() => setInfoOpen(false)} model=${info}
      status=${infoStatus ? html`<span class=${cx('minfo-dlg__turn', `is-${infoStatus.tone}`)}>
        <${Icon} name=${infoStatus.tone === 'mint' ? 'check' : 'hourglass'} />${infoStatus.text}${infoStatus.secs != null ? html`<b class="num">${infoStatus.secs}s</b>` : null}
      </span>` : null} />
  </div>`;
}
