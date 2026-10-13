// Band draft — BAND_DRAFT "2/2 选择策略" (research 06 §4.2, D1): left = draft order (avatar, name, state:
// … waiting / ⌛ 决策中 / chosen band ✓), current picker highlighted; centre = grid of every band allowed
// for the mode type (icon, name, LP); a band a teammate already picked carries the picker's avatar and is marked
// 队友已选 — it cannot be chosen again (research 09 §5, guidebook 策略与轮选; the server refuses it too); right =
// detail pane (icon, 初始生命值, name, effect name + rich description) with 跳过 (co-op, once) and 确认选择.
// One countdown (user playtest #4 item 4): every turn has the same clock (Match BAND_TURN_SECONDS, m.public.draft
// turnSeconds) and the step header counts it down — m.public.deadline IS the turn's end, the same number as the
// current picker's row. The highlighted band (the detail pane's) is what a turn that runs out takes: every change of it
// is reported (g.bandFocus) and the server assigns it while it is free, else 「华法琳」, else the first free strategy
// (timeoutBand). It starts on that default, so the tip under the order list always names what a timeout gives.
// Solo, and a co-op match with a single human (the server's soloUntimed: draft.untimed): no clock at all.
// A strategy built around a bond the mode switches off (bands.json bondIds ∩ the mode's inactive bonds — 标准: 潘格尼尼
// 拉特兰, 克莱门莎 阿戈尔, 玛恩纳 卡西米尔; the bot never picks one) reads 本局禁用 on its card and in the detail pane
// (BandOffTag / BandOffNote, DESIGN §21.26, §21.7's look); it stays selectable — information only.
// 전략별 선발 프리셋 (local feature, maintainer decisions 2026-10-12; ui/diyPresets.js links): the detail pane's 自选预设 row
// picks the roster the strategy applies — this match's choice, else the strategy's saved link, else the chat faction it is
// built around (推荐, bandRecommendation), else 保持当前编队 — with a preview of its picks and 记住此策略的预设 (on by
// default: the choice becomes the link). It applies when my pick lands — 确认选择 applies it first and flushes room.diy
// (a solo draft ends with the pick), a turn that runs out or an AI 托管 pick right after — through the chat's faction pick
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
// without a preset shows four empty slots (its 「…自选编队不变」 in the tooltip) (selectPreset: the live picks follow it, as the tab's own preset bar does); the order
// list carries the overlay's entry (LoadoutButton, from 'draft' — it closes when the draft ends; maintainer request 2026-10-13).
// 本局信息 (GitHub issue #8 item 1, "选策略时没法返回查看禁用的干员和盟约"): 查看禁用盟约与干员 under the order list opens the
// briefing's bond rows, legend and 本局禁用干员 again, read-only (ui/matchInfo.js MatchInfoDialog — the very blocks of the
// briefing). The draft runs on underneath: its status line repeats the current turn and the countdown (draftInfoStatus),
// a turn change (a pick, a skip, a turn that runs out, an AI pick) closes it, the end of the draft unmounts it, and it
// never touches the highlighted band or the buttons.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon, MicroLabel, TierChip, useTicker, secondsLeft } from '../ui/components.js';
import { useGameData, BandIcon, RichText, PlayerAvatar, LpTower, Sprite } from '../ui/gameComponents.js';
import { chessAvatarUrl } from '../ui/assetUrls.js';
import { StepHeader, ExitModal } from '../ui/matchChrome.js';
import { MatchInfoDialog, matchInfoModel, ChessIcon } from '../ui/matchInfo.js';
import { actions, act } from '../ui/gameActions.js';
import { normalizeDraft, sortedPlayers, diyPickOff } from '../ui/gameLogic.js';
import { useStore } from '../store.js';
import { FactionIcon } from '../ui/faction.js';
import { diyPresetStore, bandPresetChoice, bandRecommendation, linkBand, selectPreset, clearRosterSlot, KEEP_LINK, BASE_LINK } from '../ui/diyPresets.js';
import { loadoutStore, flushDiySync, openLoadout } from '../ui/loadoutSync.js';
import { LoadoutButton } from './loadout.js';
import { diySlotList } from '../ui/diyModel.js';
import { CHAT_FACTIONS, chatFaction } from '../../../shared/local.js';
import { PHASE } from '../../../shared/constants.js';
import { data, localAsset } from '../data.js';
import { audio } from '../audio.js';
import { modeOffBonds, bandOffBonds, bandOffLine } from '../ui/gameLogic.js';
import { t, tParts, tName } from '../../../shared/i18n.js';
import { applyPresetChoice } from '../ui/factionPick.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

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
 * Bands selectable in a mode (modeTypeList contains the mode's type), sorted by sortId.
 * @param {any[]} bands
 * @param {string|null} modeType 'SINGLE'|'MULTI'
 */
export function allowedBands(bands, modeType) {
  const sid = (b) => (Number.isFinite(b.sortId) ? b.sortId : 99);
  return (Array.isArray(bands) ? bands : [])
    .filter((b) => b && (!modeType || !Array.isArray(b.modeTypeList) || b.modeTypeList.includes(modeType)))
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
 * The 自选 picks a strategy's roster choice would apply (the 自选预设 row's preview): a faction's preset (empty when it
 * has none — then nothing changes), 不使用预设's roster, or the live picks for 保持当前编队.
 * @param {string} choice a chat faction id, BASE_LINK or KEEP_LINK
 * @param {{ presets?: Record<string, any>, base?: Record<string, any> }} st diyPresetStore state
 * @param {Record<string, any>} live the live picks (loadoutStore diy)
 */
export function presetPreviewPicks(choice, st, live) {
  if (choice === BASE_LINK) return st?.base || {};
  if (chatFaction(choice)) return st?.presets?.[choice] || null;
  return live || {};
}

/**
 * The tags of the 自选预设 row: 已关联 (the choice is the strategy's saved link), 推荐 (no link: the faction the
 * strategy is built around), 本局禁用 (the faction's bond is off this match — applied anyway, maintainer 2026-10-12).
 * A turned-off recommendation (link KEEP_LINK, ui/diyPresets.js) reads as no link: 保持当前编队 untagged (maintainer
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
 * The roster choices of the 自选预设 row: 保持当前编队, 不使用预设, then the eight chat factions (their icon, 未设置 when the
 * faction has no preset, 本局禁用 when this match disables its bond).
 * @param {Record<string, any>} presets @param {string[]|null} off
 * @returns {Array<{ v: string, label: string, f?: any, empty?: boolean, off?: boolean }>}
 */
export function presetOptions(presets, off) {
  const offIds = Array.isArray(off) ? off : [];
  return [
    { v: KEEP_LINK, label: t('保持当前编队') },
    { v: BASE_LINK, label: t('不使用预设') },
    ...CHAT_FACTIONS.map((f) => ({ v: f.id, label: t(f.name), f, empty: !presets?.[f.id], off: offIds.includes(f.bond) })),
  ];
}

/**
 * The 自选预设 dropdown (maintainer request 2026-10-13: an icon before each faction — a native <select> draws no image):
 * a button showing the choice, and the list floating over the pane (fixed: the pane's overflow cannot cut it; under the
 * button, or above it without room below). Escape, a tap outside, a scroll or a resize closes it. No words beside the names (maintainer decision 2026-10-13): a faction without a
 * preset has its icon left uncoloured (grey), a faction this match disables carries the
 * briefing's own img_bond_banned mark top-right of its icon (as the briefing draws it; without that local art the dimmed
 * name); both say so in the tooltip.
 * @param {{ choice: string, presets: Record<string, any>, off: string[]|null, locked: boolean, onChoice: (v: string) => void }} props
 */
export function PresetPicker({ choice, presets, off, locked, onChoice }) {
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
  const opts = presetOptions(presets, off);
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
      onClick=${() => setOpen(!open)}>${line(cur)}<i class="draft-preset__caret" aria-hidden="true"></i></button>
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
 * preset: four empty slots) —, 记住 and 编辑自选编队 (`onEdit()`).
 * @param {{ band: any, choice: string, link: string|null, presets: Record<string, any>, base: Record<string, any>,
 *   live: Record<string, any>, off: string[]|null, locked: boolean, remember: boolean, m?: any,
 *   onChoice: (v: string) => void, onRemember: (v: boolean) => void, onEdit?: ((slotId?: string) => void)|null,
 *   onClear?: ((slotId: string) => void)|null }} props
 */
export function DraftPresetRow({ band, choice, link, presets, base, live, off, locked, remember, m = null, onChoice, onRemember, onEdit = null, onClear = null }) {
  const tags = presetChoiceTags(choice, { link, rec: bandRecommendation(band), off });
  const preview = presetPreviewPicks(choice, { presets, base }, live);
  const picks = preview || {}; // a faction without a preset: its slots drawn empty (nothing would change)
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
  return html`<div class="draft-preset" data-testid="draft-preset">
    <div class="draft-preset__head" title=${t('确认选择时套用，超时自动选择时也会套用；选择阵营预设时聊天阵营一并切换')}><${MicroLabel} tone="mint">DIY PRESET</${MicroLabel}><label for="draft-preset-sel">${t('自选预设')}</label>
      ${tags.map((k) => html`<span key=${k} class=${`draft-preset__tag is-${TAG[k][0]}`}>${TAG[k][1]}</span>`)}</div>
    <${PresetPicker} choice=${choice} presets=${presets} off=${off} locked=${locked} onChoice=${onChoice} />
    <div class="draft-preset__slots" title=${preview ? null : t('该阵营尚未设置预设，自选编队不变')}>${groups.map((g) => html`<div key=${g.tier ?? '?'} class="draft-preset__grp" data-tier=${g.tier ?? ''}
        style=${g.tier ? `--gc: var(--tier-${g.tier})` : null}>
      ${g.tier ? html`<span class="draft-preset__tier" title=${[t('{tier}阶 自选', { tier: g.tier }), g.shop && t('调度中心等级 {level} 起出现在商店', { level: g.shop })].filter(Boolean).join(' · ')}>
        <${TierChip} tier=${g.tier} size="sm" /></span>` : null}
      ${g.slots.map(({ id, tier }) => {
        const u = pickUnit(picks[id]);
        const name = u ? u.name || u.charId : '';
        const gone = !!u && diyPickOff(id, picks[id], offSet, getChess, diyData);
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

/** BAND_DRAFT screen. */
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
  const bands = useMemo(() => allowedBands(gd.list('bands'), mode?.type || (solo ? 'SINGLE' : 'MULTI')), [gd.ready, mode?.type, solo, data.locale()]);
  const players = sortedPlayers(pub);
  const draft = normalizeDraft(pub?.draft, players);
  const myPick = draft.picks.get(myId) || priv?.bandId || null;
  const myTurn = !myPick && (solo || draft.turnPid === myId);
  const skipsLeft = draft.skipsLeft.has(myId) ? draft.skipsLeft.get(myId) : (skipped ? 0 : 1);
  const canSkip = !solo && myTurn && skipsLeft > 0 && draft.order.length > 1;
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

  // one countdown (user playtest #4 item 4): the current turn's — m.public.deadline, the same clock as the picker's row
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
  const choiceFor = (bid) => presetSel[bid] ?? bandPresetChoice(bid, gd.band(bid), links);
  const applyBandPreset = async (bid) => {
    presetAppliedFor = `${roomKey}|${bid}`;
    const choice = choiceFor(bid);
    if (choice !== KEEP_LINK && (remember[bid] ?? true)) linkBand(bid, choice);
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
  // 编辑自选编队: the 自选编队 tab on the roster the row shows (keep: the one in use); an empty slot's picker with it
  const editPreset = (bid, slotId = null) => {
    const choice = choiceFor(bid);
    if (choice !== KEEP_LINK) selectPreset(choice === BASE_LINK ? null : choice);
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
  const turnName = players.find((p) => p.playerId === draft.turnPid)?.name;
  useTicker(clock ? 250 : 0);
  // the picker's row shows the step header's number (both read the one turn deadline)
  const turnSecs = clock ? secondsLeft(clock.deadline) : null;
  const turnLen = Number(pub?.draft?.turnSeconds) > 0 ? Math.round(pub.draft.turnSeconds) : null;
  // 本局信息: the briefing's blocks (built only while the dialog is open) and the draft's state under it
  const info = infoOpen ? matchInfoModel(pub, { bonds: gd.list('bonds'), chess: gd.chess, mode, priv, diyData: { chess: data.get('chess'), backups: data.get('backups') } }) : null;
  const infoStatus = infoOpen ? draftInfoStatus({ myPick, pickName: myPick ? gd.band(myPick)?.name : null, myTurn, turnName, secs: turnSecs,
    waiting: !solo && !draft.done }) : null;

  return html`<div class="screen draft">
    <div class="brief__bg" aria-hidden="true"></div>
    <${StepHeader} step=${2} of=${2} title=${t('选择策略')} micro="STRATEGY // BAND CHECK" pub=${clock ? { ...pub, deadline: clock.deadline } : { ...pub, deadline: 0 }}
      total=${clock ? clock.total : null} onExit=${() => setExit(true)} />
    <main class="draft__main">
      <aside class="draft-order">
        <h3 class="brief-h"><span>${solo ? t('独立模拟') : t('决策顺序')}</span><${MicroLabel}>${solo ? 'FREE PICK' : 'RANDOM ORDER'}</${MicroLabel}></h3>
        ${(solo ? players.filter((p) => p.playerId === myId) : draft.order.map((pid) => players.find((p) => p.playerId === pid)).filter(Boolean)).map((p, i) => {
          const picked = draft.picks.get(p.playerId) || (p.playerId === myId ? myPick : p.bandId) || null;
          const cur = !picked && (solo || draft.turnPid === p.playerId);
          const pband = picked ? gd.band(picked) : null;
          return html`<div key=${p.playerId} class=${cx('dorder', cur && 'is-cur', picked && 'is-done', p.playerId === myId && 'is-self')}>
            ${!solo ? html`<span class="dorder__idx num">${i + 1}</span>` : null}
            <${PlayerAvatar} player=${p} self=${p.playerId === myId} />
            <div class="dorder__text">
              <b class="dorder__name">${p.name || t('博士')}${p.isBot ? html`<span class="dorder__ai">AI</span>` : null}</b>
              <span class="dorder__state">${picked ? html`<span class="t-mint">${pband?.name || t('已选择')}</span>${confirmOn && p.confirmReady ? html`<span class="dorder__ready">${t('已准备')}</span>` : null}`
                : cur ? html`<span class="t-gold"><${Icon} name="hourglass" />${t('决策中')}${turnSecs != null ? html`<b class="num dorder__secs">${turnSecs}s</b>` : null}</span>`
                : html`<span class="t-dim"><${Icon} name="dots" />${t('等待中')}</span>`}</span>
            </div>
            <span class="dorder__box">
              ${picked ? html`<${BandIcon} bandId=${picked} size="sm" /><span class="dorder__check"><${Icon} name="check" /></span>`
                : cur && p.playerId === myId ? html`<${Sprite} k="bandChoose/youturn_finger" class="dorder__finger" fallback=${html`<${Icon} name="chevronLeft" />`} />`
                : null}
            </span>
          </div>`;
        })}
        <${Button} variant="secondary" icon="search" block=${true} class="draft-order__info" data-testid="match-info-open"
          aria-haspopup="dialog" onClick=${() => setInfoOpen(true)}>${t('查看禁用盟约与干员')}<//>
        ${inDraft ? html`<${LoadoutButton} from="draft" class="draft-order__loadout" />` : null}
        ${!solo ? html`<p class="draft-order__tip" data-testid="draft-tip">${draftTip({ timed, turnSeconds: turnLen, autoName: myPick ? null : autoName, selected: autoId === sel })}</p>` : null}
      </aside>

      <section class="draft-grid" role="listbox" aria-label=${t('策略')}>
        ${bands.map((b) => {
          const who = pickers.get(b.bandId) || [];
          const isTaken = taken.has(b.bandId);
          const offNames = bandOffBonds(b, offBonds).map((id) => gd.bond(id)?.name || id); // 本局禁用 (still selectable)
          return html`<button key=${b.bandId} type="button" role="option" aria-selected=${sel === b.bandId ? 'true' : 'false'} data-band=${b.bandId}
              aria-disabled=${isTaken ? 'true' : 'false'} title=${isTaken ? t('队友已选') : offNames.length ? bandOffLine(offNames) : undefined}
              class=${cx('dband', sel === b.bandId && 'is-sel', myPick === b.bandId && 'is-mine', isTaken && 'is-taken', offNames.length && 'is-off')} onClick=${() => { setSel(b.bandId); audio.sfx('tab', { volume: 0.5 }); }}>
            <${BandIcon} bandId=${b.bandId} size="lg" />
            <span class="dband__name">${b.name}</span>
            <span class="dband__lp num"><i></i>${b.totalHp}</span>
            <${BandOffTag} names=${offNames} />
            ${chatFaction(links?.[b.bandId]) && !isTaken ? html`<span class="dband__link" title=${t('已关联{faction}预设', { faction: t(chatFaction(links[b.bandId]).name) })}
              style=${`--fac:${chatFaction(links[b.bandId]).color}`} data-link=${links[b.bandId]}><${FactionIcon} f=${chatFaction(links[b.bandId])} /></span>` : null}
            ${who.length ? html`<span class="dband__who">${who.slice(0, 4).map((p) => html`<${PlayerAvatar} key=${p.playerId} player=${p} size="sm" />`)}</span>` : null}
            ${isTaken ? html`<span class="dband__taken">${t('队友已选')}</span>` : null}
          </button>`;
        })}
      </section>

      <aside class=${cx('draft-detail', 'brackets', band && inDraft && 'has-preset')}>
        ${band ? html`
          <div class="draft-detail__art">
            <${BandIcon} bandId=${band.bandId} size="xl" />
          </div>
          <div class="draft-detail__hp"><span>${t('初始生命值')}</span><${LpTower} value=${band.totalHp} size="lg" /></div>
          <h2 class="draft-detail__name">${band.name}</h2>
          <${BandOffNote} names=${bandOffBonds(band, offBonds).map((id) => gd.bond(id)?.name || id)} />
          <div class="draft-detail__eff">
            <${MicroLabel} tone="mint">EFFECT</${MicroLabel}>
            <b>${band.effectName || ''}</b>
            <${RichText} as="p" text=${band.descRaw || band.desc} class="draft-detail__desc" />
          </div>
          ${inDraft ? html`<${DraftPresetRow} band=${band} choice=${choiceFor(band.bandId)} link=${links?.[band.bandId] ?? null}
            presets=${presets} base=${baseRoster} live=${livePicks} off=${pub?.disabledBonds ?? null} m=${gd.m}
            locked=${(!!myPick && myPick !== band.bandId) || busy === 'pick'}
            remember=${remember[band.bandId] ?? true} onChoice=${(v) => changeChoice(band.bandId, v)}
            onRemember=${(v) => changeRemember(band.bandId, v)} onEdit=${(slotId) => editPreset(band.bandId, slotId)}
            onClear=${(slotId) => clearPresetSlot(band.bandId, slotId)} />` : null}`: html`<p class="t-dim">${t('选择一个策略查看详情')}</p>`}
        <div class="draft-detail__actions">
          ${confirmOn && inDraft ? html`<div class="draft-confirm" role="status" data-testid="draft-confirm">
            <b>${t('策略已确定 · 编队确认')}</b>
            <p>${t('倒计时结束前仍可在上方更改自选预设，更改后立即套用。全员准备完毕后立即开始')}</p>
            <${Button} variant="primary" size="lg" icon="check" active=${meReady} disabled=${meReady} loading=${busy === 'ready'}
              data-testid="draft-ready" onClick=${readyUp}>${meReady ? t('已准备') : t('准备完毕')}<//>
          </div>`
            : myPick ? html`<p class="draft-detail__status t-mint"><${Icon} name="check" />${t('已选择「{name}」', { name: gd.band(myPick)?.name || '' })}${!solo && !draft.done ? t('，等待其他博士') : ''}</p>`
            : selTaken ? html`<p class="draft-detail__status draft-detail__status--taken"><${Icon} name="close" />${t('队友已选，请选择其他策略')}</p>`
            : !myTurn ? html`<p class="draft-detail__status"><${Icon} name="hourglass" />${turnName ? t('{turnName} 正在决策…', { turnName }) : t('等待轮到你')}</p>` : null}
          ${confirmOn && inDraft ? null : html`<div class="draft-detail__btns">
            ${!solo ? html`<${Button} variant="secondary" size="lg" icon="chevrons" disabled=${!canSkip} loading=${busy === 'skip'} onClick=${skip}
              title=${skipsLeft > 0 ? t('跳过本轮，稍后再选') : t('跳过次数已用完')}>${t('跳过')}${skipsLeft > 0 ? '' : t('（已用）')}<//>` : null}
            <${Button} variant="primary" size="lg" icon="check" disabled=${!myTurn || !band || selTaken} loading=${busy === 'pick'} onClick=${confirm}>${selTaken ? t('队友已选') : t('确认选择')}<//>
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
