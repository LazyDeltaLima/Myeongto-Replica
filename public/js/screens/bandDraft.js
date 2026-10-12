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
// Under the order list, the faction row (ui/factionPick.js DraftFactionPicker — the same pick as the chat's, and the
// faction's 自选 preset applies to this match; local feature, maintainer 2026-10-09).
// 전략별 선발 프리셋 (local feature, maintainer decisions 2026-10-12; ui/diyPresets.js links): the detail pane's 自选预设 row
// picks the roster the strategy applies — this match's choice, else the strategy's saved link, else the chat faction it is
// built around (推荐, bandRecommendation), else 保持当前编队 — with a preview of its picks and 记住此策略的预设 (on by
// default: the choice becomes the link). It applies when my pick lands — 确认选择 applies it first and flushes room.diy
// (a solo draft ends with the pick), a turn that runs out or an AI 托管 pick right after — through the faction row's own
// pick (the chat faction follows; a faction this match disables is still applied, 本局禁用). A linked strategy's card
// carries the faction's badge. After the last pick a timed draft keeps 编队确认 (m.public.draft.confirm, the server's
// DRAFT_CONFIRM_SECONDS): the faction row can still change the picks, 准备完毕 (g.draftReady) ends it once every human is done.
// 本局信息 (GitHub issue #8 item 1, "选策略时没法返回查看禁用的干员和盟约"): 查看禁用盟约与干员 under the order list opens the
// briefing's bond rows, legend and 本局禁用干员 again, read-only (ui/matchInfo.js MatchInfoDialog — the very blocks of the
// briefing). The draft runs on underneath: its status line repeats the current turn and the countdown (draftInfoStatus),
// a turn change (a pick, a skip, a turn that runs out, an AI pick) closes it, the end of the draft unmounts it, and it
// never touches the highlighted band or the buttons.

import { useEffect, useMemo, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon, MicroLabel, useTicker, secondsLeft } from '../ui/components.js';
import { useGameData, BandIcon, RichText, PlayerAvatar, LpTower, Sprite } from '../ui/gameComponents.js';
import { StepHeader, ExitModal } from '../ui/matchChrome.js';
import { MatchInfoDialog, matchInfoModel } from '../ui/matchInfo.js';
import { actions, act } from '../ui/gameActions.js';
import { normalizeDraft, sortedPlayers } from '../ui/gameLogic.js';
import { useStore } from '../store.js';
import { FactionIcon } from '../ui/faction.js';
import { diyPresetStore, bandPresetChoice, bandRecommendation, linkBand, KEEP_LINK, BASE_LINK } from '../ui/diyPresets.js';
import { loadoutStore, flushDiySync } from '../ui/loadoutSync.js';
import { diySlotList } from '../ui/diyModel.js';
import { CHAT_FACTIONS, chatFaction } from '../../../shared/local.js';
import { PHASE } from '../../../shared/constants.js';
import { data } from '../data.js';
import { audio } from '../audio.js';
import { modeOffBonds, bandOffBonds, bandOffLine } from '../ui/gameLogic.js';
import { t, tParts, tName } from '../../../shared/i18n.js';
import { DraftFactionPicker, applyPresetChoice } from '../ui/factionPick.js'; // the faction row under the draft order (진영별 선발 프리셋)

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
 * @param {string} choice @param {{ link?: string|null, rec?: string|null, off?: string[]|null }} o
 * @returns {Array<'linked'|'rec'|'off'>}
 */
export function presetChoiceTags(choice, { link = null, rec = null, off = null } = {}) {
  const out = [];
  if (link && link === choice) out.push('linked');
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

/** A 自选 pick's operator name (backups.json units; the slot's preview). */
const pickName = (pick) => (pick?.charId ? data.get('backups')?.units?.[pick.charId]?.name || pick.charId : null);

/**
 * The detail pane's 自选预设 row (전략별 선발 프리셋): the roster choice, its tags, the four slots it would field, 记住.
 * @param {{ band: any, choice: string, link: string|null, presets: Record<string, any>, base: Record<string, any>,
 *   live: Record<string, any>, off: string[]|null, locked: boolean, remember: boolean,
 *   onChoice: (v: string) => void, onRemember: (v: boolean) => void }} props
 */
export function DraftPresetRow({ band, choice, link, presets, base, live, off, locked, remember, onChoice, onRemember }) {
  const tags = presetChoiceTags(choice, { link, rec: bandRecommendation(band), off });
  const picks = presetPreviewPicks(choice, { presets, base }, live);
  const slots = diySlotList({ chess: data.get('chess'), backups: data.get('backups') });
  const ids = slots.length ? slots.map((x) => x.slotId) : Object.keys(picks || {});
  const offIds = Array.isArray(off) ? off : [];
  const TAG = { linked: ['link', t('已关联')], rec: ['rec', t('推荐')], off: ['off', t('本局禁用')] };
  return html`<div class="draft-preset" data-testid="draft-preset">
    <div class="draft-preset__head"><${MicroLabel} tone="mint">DIY PRESET</${MicroLabel}><label for="draft-preset-sel">${t('自选预设')}</label>
      ${tags.map((k) => html`<span key=${k} class=${`draft-preset__tag is-${TAG[k][0]}`}>${TAG[k][1]}</span>`)}</div>
    <select id="draft-preset-sel" class="draft-preset__sel" data-testid="draft-preset-select" disabled=${locked}
      onChange=${(e) => onChoice(e.currentTarget.value)}>
      <option value=${KEEP_LINK} selected=${choice === KEEP_LINK}>${t('保持当前编队')}</option>
      <option value=${BASE_LINK} selected=${choice === BASE_LINK}>${t('不使用预设')}</option>
      ${CHAT_FACTIONS.map((f) => html`<option key=${f.id} value=${f.id} selected=${choice === f.id}>${t(f.name)}${presets?.[f.id] ? '' : t('（未设置）')}${offIds.includes(f.bond) ? t('（本局禁用）') : ''}</option>`)}
    </select>
    <div class="draft-preset__slots">${picks ? ids.map((id) => {
      const n = pickName(picks[id]);
      return html`<span key=${id} class=${cx('draft-preset__slot', !n && 'is-empty')} title=${n || ''}>${n || '—'}</span>`;
    }) : html`<span class="draft-preset__none">${t('该阵营尚未设置预设，自选编队不变')}</span>`}</div>
    <label class="draft-preset__keep"><input type="checkbox" checked=${remember && choice !== KEEP_LINK} disabled=${locked || choice === KEEP_LINK}
      onChange=${(e) => onRemember(e.currentTarget.checked)} />${t('记住此策略的预设')}</label>
    <p class="draft-preset__hint">${t('确认选择时套用，超时自动选择时也会套用；选择阵营预设时聊天阵营一并切换')}</p>
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
        <${DraftFactionPicker} />
        <${Button} variant="secondary" icon="search" block=${true} class="draft-order__info" data-testid="match-info-open"
          aria-haspopup="dialog" onClick=${() => setInfoOpen(true)}>${t('查看禁用盟约与干员')}<//>
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

      <aside class="draft-detail brackets">
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
            presets=${presets} base=${baseRoster} live=${livePicks} off=${pub?.disabledBonds ?? null} locked=${!!myPick || busy === 'pick'}
            remember=${remember[band.bandId] ?? true} onChoice=${(v) => setPresetSel({ ...presetSel, [band.bandId]: v })}
            onRemember=${(v) => setRemember({ ...remember, [band.bandId]: v })} />` : null}` : html`<p class="t-dim">${t('选择一个策略查看详情')}</p>`}
        <div class="draft-detail__actions">
          ${confirmOn && inDraft ? html`<div class="draft-confirm" role="status" data-testid="draft-confirm">
            <b>${t('策略已确定 · 编队确认')}</b>
            <p>${t('倒计时结束前仍可更改自选编队：选择阵营即套用该阵营的预设。全员准备完毕后立即开始')}</p>
            <${Button} variant="primary" size="lg" icon="check" active=${meReady} disabled=${meReady} loading=${busy === 'ready'}
              data-testid="draft-ready" onClick=${readyUp}>${meReady ? t('已准备') : t('准备完毕')}<//>
          </div>`
            : myPick ? html`<p class="draft-detail__status t-mint"><${Icon} name="check" />${t('已选择「{name}」', { name: gd.band(myPick)?.name || '' })}${!solo && !draft.done ? t('，等待其他博士') : ''}</p>`
            : selTaken ? html`<p class="draft-detail__status draft-detail__status--taken"><${Icon} name="close" />${t('队友已选，请选择其他策略')}</p>`
            : !myTurn ? html`<p class="draft-detail__status"><${Icon} name="hourglass" />${turnName ? t('{turnName} 正在决策…', { turnName }) : t('等待轮到你')}</p>` : null}
          <div class="draft-detail__btns">
            ${!solo ? html`<${Button} variant="secondary" size="lg" icon="chevrons" disabled=${!canSkip} loading=${busy === 'skip'} onClick=${skip}
              title=${skipsLeft > 0 ? t('跳过本轮，稍后再选') : t('跳过次数已用完')}>${t('跳过')}${skipsLeft > 0 ? '' : t('（已用）')}<//>` : null}
            <${Button} variant="primary" size="lg" icon="check" disabled=${!myTurn || !band || selTaken} loading=${busy === 'pick'} onClick=${confirm}>${selTaken ? t('队友已选') : t('确认选择')}<//>
          </div>
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
