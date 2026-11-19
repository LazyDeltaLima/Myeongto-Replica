// 自选编队 (0.2.0 DIY; research 0.2.0 §2, the owner's decisions of 2026-10-05): the third tab of the 干员调配 overlay
// (screens/loadout.js). Twelve slots — 5阶 ×6, 6阶 ×6, of which a match's 3/3 确定自选编队 (screens/diyChoose.js) takes up
// to two per tier — each filled with an operator: a 6★ the player owns outside the
// chess pool (any of its three skills, any module of its elite form but a 集成战略 one) or a prototype (原型干员, its skill
// and module locked as when it stands in). Only operators with a kit are listed (the server's welcome.diyKitted). The
// slots are drawn as the official 自选编队 window's lineup (DiyLineup, maintainer decision 2026-11-19): a row per tier on
// its band, a filled slot the 干员调配 card (ui/diyCard.js), an empty one the official empty slot. A tap on a slot opens
// its TIER's picker (upstream 0.3.3's window, maintainer decision 2026-11-07, several at once since 2026-11-19): the
// 干员调配 roster's own list — a row per legal pick of the tier with its skills, modules and 潜能 / 练度 to tap, the
// roster's 职业 chips and search — and its detail (screens/loadoutSections.js); a tap on a row adds it to the tier's
// choice (numbered) or takes it out, 确认 fills the tier's slots in that order; an operator the other tier holds is greyed
// out with where it is. In the match the operator is sold
// only in this player's shop, from 调度中心 level 5 (tier 5) / 6 (tier 6), and fights with the pick (server/match/player
// /diy.js). Out of match: the next match takes the picks. The picks live in ui/loadoutSync.js (localStorage + room.diy);
// the model is ui/diyModel.js. Styles: css/screens/loadout.css (diy-*). An owned pick's 潜能 / 练度 selects are the
// picker's (0.2.2, screens/cultivation.js — the same per-operator settings as 干员调配, `ops`); a prototype has neither.
// Above the slots (folded behind a rail on a phone, DiyFold), the 阵营预设 bar (local feature, maintainer decisions 2026-10-09; ui/diyPresets.js): 不使用预设 + the eight chat
// factions, each its own roster — a chip shows its roster (a faction without one starts empty), every change here is
// saved into the roster shown; picking that faction in the chat or the strategy draft applies it. Under the bar, the
// strategies linked to the roster shown (전략별 선발 프리셋, maintainer 2026-10-12: chips with ×, 关联策略 to add one —
// a strategy has one link, adding it here moves it — and the strategies built around that faction, dashed, as 推荐:
// unlinked, the draft offers them this roster anyway). Each strategy carries its icon, and 关联策略 opens a grid of all
// 40 icons over the tab where a tap links or unlinks one (maintainer decision 2026-10-13, picked from mockups); a
// 推荐 one can be unlinked too (its × or its tile), which turns the recommendation off (diyPresets.js KEEP_LINK).

import { useEffect, useLayoutEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Icon, Button, TierChip, TextField } from '../ui/components.js';
import { Img, BandIcon } from '../ui/gameComponents.js';
import { chessAvatarUrl, chessPortraitUrl, profIconUrl, profGlyphUrl, subProfIconUrl, bondIconUrl, uiUrl, withDiyChooseArt } from '../ui/assetUrls.js';
import { DiyCard, diyCardArt, cssUrlVars, CARD_NAME_FIT } from '../ui/diyCard.js';
import { fitLine } from '../ui/fitLine.js';
import { toast } from '../ui/toasts.js';
import { skinArt, skinPic } from '../ui/skins.js';
import { data } from '../data.js';
import { MODULE_NONE, PROF_NAME, skillLabel, moduleBadge, quickSkillTags, opsOf, chessOptions } from '../ui/loadoutModel.js';
import { diySlotList, pickChoices, pickOptions, slotRecord, defaultPick } from '../ui/diyModel.js';
import { LoadoutStats } from '../ui/loadoutStats.js';
import { CultivationSelects, CultivationSection } from './cultivation.js';
import { SkinSection } from '../ui/skinPicker.js';
import { SkillIcon, ModuleGlyph, SkillSection, ModuleSection, ProfFilter, rowControlHit } from './loadoutSections.js';
import { useStore } from '../store.js';
import { loadoutStore, closeLoadout } from '../ui/loadoutSync.js';
import { FactionIcon } from '../ui/faction.js';
import { diyPresetStore, selectPreset, deletePreset, toggleBandLink, bandLinkTarget, BASE_LINK, presetSeasonOf } from '../ui/diyPresets.js';
import { chatFactionsOf, chatFaction } from '../../../shared/local.js';
import { t } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');
const ROMAN_FULL = { 1: 'Ⅰ', 2: 'Ⅱ', 3: 'Ⅲ', 4: 'Ⅳ', 5: 'Ⅴ', 6: 'Ⅵ' };
/** The lineup's size in canvas units (auto_chess_deploy_diy_lineup_state: the tag's overhang to the Ⅵ slots' corner). */
const LINEUP_W = 958;
const LINEUP_H = 547.5;

/** The data the 自选 rules read (shared/diy.js): chess.json + backups.json (localized copies). */
export const diyData = () => ({ chess: data.get('chess'), backups: data.get('backups') });

/** A unit summary's avatar / portrait URL (a backups.json unit or a composed record). */
const avatarOf = (m, unit, elite = false) => chessAvatarUrl(m, unit && { charId: unit.charId, assets: { avatar: elite ? unit.assets?.avatarGolden : unit.assets?.avatar } });
const classLine = (u) => `${t(PROF_NAME[u?.profession] || '') || ''}${u?.subProfessionName ? ` · ${u.subProfessionName}` : ''}`;
const bondName = (id) => data.lookup('bonds', id)?.name || id;

// ---- the picker's list (the roster's rows, after upstream 0.3.3) -------------------------------------------------------

/**
 * The choices of one picker row (ui/diyModel.js pickChoices) behind a memo: the tier-6 list holds dozens of operators and
 * every row draws its skills and modules, so a search keystroke must not recompose all of them. The memo belongs to the
 * loaded backups.json — a language switch or a data reload replaces that object and drops the memo with it; nothing is
 * cached while the data is absent.
 */
let choicesOf = null;
const choicesMemo = new Map();
function rowChoices(charId, slotId, D) {
  const backups = D?.backups ?? null;
  if (!backups) return pickChoices(charId, slotId, D);
  if (choicesOf !== backups) { choicesOf = backups; choicesMemo.clear(); }
  const key = `${slotId}|${charId}`;
  if (!choicesMemo.has(key)) choicesMemo.set(key, pickChoices(charId, slotId, D));
  return choicesMemo.get(key);
}

/** One skill to tap: the roster's quick choice (screens/loadout.js QuickSkill) — it writes the draft. */
function QuickSkill({ m, opt, on, elite, onPick, disabled = false }) {
  const rec = elite ? opt.elite || opt.normal : opt.normal || opt.elite;
  const tags = quickSkillTags(rec);
  const label = `${skillLabel(opt.index)} · ${rec?.name || t('未知技能')} · ${tags.sp} · ${t('初始')} ${tags.init ?? '—'} / ${t('消耗')} ${tags.cost ?? '—'} · ${t('持续')} ${tags.duration}`;
  return html`<button type="button" class=${cx('lo-q', 'lo-q--skill', on && 'is-on')} data-skill=${opt.index} aria-pressed=${on ? 'true' : 'false'}
      aria-label=${label} title=${label} disabled=${disabled} onClick=${() => onPick(opt.index)}>
    <${SkillIcon} m=${m} rec=${rec} index=${opt.index} on=${on} size="q" />
  </button>`;
}

/** One module to tap (不装备 first): the roster's quick choice (screens/loadout.js QuickModule). */
function QuickModule({ m, opt, on, onPick, disabled = false }) {
  const label = opt.id === MODULE_NONE ? t('不装备模组') : `${opt.rec?.typeName || ''} · ${opt.rec?.name || opt.id}`;
  return html`<button type="button" class=${cx('lo-q', 'lo-q--mod', on && 'is-on')} data-module=${opt.id} aria-pressed=${on ? 'true' : 'false'}
      aria-label=${label} title=${label} disabled=${disabled} onClick=${() => onPick(opt.id)}>
    <${ModuleGlyph} m=${m} rec=${opt.rec} id=${opt.id} size="q" />
    ${opt.id !== MODULE_NONE ? html`<b class="lo-q__type num" aria-hidden="true">${moduleBadge(opt.rec, opt.id)}</b>` : null}
  </button>`;
}

/** The list's column heads — the roster's own (screens/loadout.js RosterHead), whose grid the picker's rows share. */
function DiyHead() {
  return html`<div class="lo-list__head" aria-hidden="true">
    <span class="lo-list__h lo-list__h--op">${t('干员')}</span>
    <span class="lo-list__h lo-list__h--skills">${t('技能')}</span>
    <span class="lo-list__h lo-list__h--mods" title=${t('模组仅在精锐形态生效')}>${t('模组')}<small>${t('精锐')}</small></span>
    <span class="lo-list__h lo-list__h--cult">${t('潜能')} · ${t('练度')}</span>
  </div>`;
}

/** The 不装备 option and a module record as a quick choice's option (loadoutModel.js chessOptions' shape). */
const noneOpt = { id: MODULE_NONE, rec: null };
const moduleOpt = (x) => ({ id: x.uniEquipId, rec: x.rec });

/** What a row shows as chosen: the draft's choice for the drafted operator, else the operator's own default pick (what a
 *  fresh selection starts with — ui/diyModel.js defaultPick: the last skill, the first module). */
function rowChoice(ch, charId, draft) {
  const def = ch ? { skill: ch.skills.length ? ch.skills[ch.skills.length - 1].index : null, module: ch.modules[0]?.uniEquipId ?? null } : null;
  if (draft && draft.charId === charId) {
    return { skill: draft.skillIndex ?? def?.skill ?? null, module: draft.uniEquipId === undefined ? def?.module ?? null : draft.uniEquipId };
  }
  return def || { skill: null, module: null };
}

/**
 * One operator of the picker's list: the roster's row (RosterRow) whose quick choices write the operator's entry through
 * `onQuick` instead of the stored loadout; `level` 'elite' shows the quick skills' Lv.7 tags. A tap on the row puts the
 * operator in the tier's choice or takes it out (`onSel`); `index` is its place in the choice (1–6, 0 = not chosen),
 * drawn left of its skills in the official select_index's look. An operator the OTHER tier holds is greyed out with
 * where it is, and every control of its row but 详情 is disabled. Narrow screens (≤ 1000 px, the list alone) end the row
 * with 详情 › — the one way to the detail there, since a tap on the row is add / remove (maintainer decision 2026-11-19).
 */
function DiyRow({ m, tier, opt, ch, takenTier, choice, index, selected, ops, onOps, onSel, onQuick, onDetail, level }) {
  const skinCtx = skinArt();
  const u = opt.unit;
  const name = u?.name || opt.charId;
  const taken = takenTier != null;
  const note = taken ? t('已在{tier}阶自选中', { tier: takenTier }) : null;
  const cur = rowChoice(ch, opt.charId, choice);
  const curMod = cur.module ?? MODULE_NONE;
  const slots = [0, 1, 2].map((i) => (ch && ch.skills[i]) || null);
  const pick = (patch) => onQuick(opt.charId, patch);
  // the row itself adds / removes the operator too (the shared, row-anchored guard of screens/loadoutSections.js); a
  // taken option does nothing
  const onRowClick = (e) => { if (!taken && !rowControlHit(e)) onSel(opt.charId); };
  return html`<div role="listitem" data-char=${opt.charId}
      class=${cx('diy-opt', 'lo-card', `lo-card--t${tier}`, index > 0 && 'is-on', selected && 'is-sel', taken && 'is-taken')} onClick=${onRowClick}>
    <button type="button" class="diy-opt__pick lo-card__pick" aria-pressed=${index > 0 ? 'true' : 'false'} disabled=${taken}
        title=${note || name} onClick=${() => onSel(opt.charId)}>
      <span class="lo-card__art"><${Img} src=${skinPic(u, 'avatar', skinCtx, { own: true }) || avatarOf(m, u)} fallback=${html`<span class="lo-card__glyph">${[...name][0]}</span>`} /></span>
      <span class="lo-card__id">
        <span class="lo-card__name">${name}</span>
        <span class="lo-card__bonds">${(opt.bonds || []).map((b) => html`<${Img} key=${b} src=${bondIconUrl(m, b)} class="lo-card__bond" alt=${bondName(b)}
          fallback=${html`<i class="lo-bond__dot" title=${bondName(b)}></i>`} />`)}</span>
        <span class="diy-opt__sub"><span class="diy-opt__class"><${Img} src=${profIconUrl(m, u?.profession)} class="diy-opt__prof" />${classLine(u)}</span>
          ${note ? html`<span class="diy-opt__taken">${note}</span>` : null}</span>
      </span>
      ${index > 0 ? html`<b class="diy-opt__idx" aria-label=${t('第{n}个选择', { n: index })}><span aria-hidden="true">${index}</span></b>` : null}
    </button>
    <div class="lo-card__skills lo-quick" role="group" aria-label=${t('选择技能')}>
      ${slots.map((s, i) => (s
        ? html`<${QuickSkill} key=${s.index} m=${m} opt=${s} elite=${level === 'elite'} on=${s.index === cur.skill} disabled=${taken}
            onPick=${(index) => pick({ skillIndex: index })} />`
        : html`<span key=${`e${i}`} class="lo-q lo-q--empty" aria-hidden="true"></span>`))}
    </div>
    <div class="lo-card__mods lo-quick" role="group" aria-label=${t('选择模组')} title=${t('模组仅在精锐形态生效')}>
      ${[html`<${QuickModule} key="none" m=${m} opt=${noneOpt} on=${curMod === MODULE_NONE} disabled=${taken}
            onPick=${(id) => pick({ uniEquipId: id === MODULE_NONE ? null : id })} />`,
        ...(ch?.modules || []).map((x) => html`<${QuickModule} key=${x.uniEquipId} m=${m} opt=${moduleOpt(x)} on=${curMod === x.uniEquipId} disabled=${taken}
            onPick=${(id) => pick({ uniEquipId: id === MODULE_NONE ? null : id })} />`)]}
    </div>
    ${onOps
      ? html`<${CultivationSelects} charId=${opt.charId} ops=${ops} onSet=${onOps} note=${note} disabled=${taken} />`
      : html`<span class="lo-cult diy-opt__nocult t-dim">—</span>`}
    <button type="button" class="diy-opt__det" aria-label=${t('{name} 详情', { name })} onClick=${() => onDetail(opt.charId)}>
      <span>${t('详情')}</span><i aria-hidden="true">›</i></button>
  </div>`;
}

/** The tier's slots in data order (ui/diyModel.js diySlotList). */
const tierSlots = (tier, D) => diySlotList(D).filter((s) => s.tier === tier);

/**
 * The tier's choice as the picker starts it: the operators of its slots in slot order (an operator twice in a stored
 * roster counts once) and their picks.
 * @returns {{ order: string[], edits: Record<string, any> }}
 */
export function pickerStart(tier, picks, D) {
  const order = [];
  const edits = {};
  for (const s of tierSlots(tier, D)) {
    const p = picks?.[s.slotId];
    if (!p || typeof p.charId !== 'string' || order.includes(p.charId)) continue;
    order.push(p.charId);
    edits[p.charId] = { ...p };
  }
  return { order, edits };
}

/**
 * The tier picker (upstream 0.3.3's window, maintainer decision 2026-11-07: its shape only — this server's picks stay the
 * owned 6★ of shared/local-diy.js, no prototypes; several at once since maintainer decision 2026-11-19): the legal
 * operators of the tier as the roster's list (the roster's 职业 chips and a search; a row's skills, modules and 潜能 /
 * 练度 to tap), the last tapped one's detail on the right (潜能与练度, 技能, 局内数值 — ui/loadoutStats.js —, 模组; its
 * 普通 / 精锐 toggle sets the rows' skill level too), 清空选择 / 取消 / 确认. A tap on a row adds the operator to the
 * choice or takes it out, the rows numbered in the order chosen; the tier's slots hold six, and a seventh is refused with
 * one notice (maintainer decision 2026-11-19: no first-in drops out, unlike the 3/3 step). 确认 fills the tier's slots
 * 1… in that order and empties the rest; the operators already in the tier when it opens come first in the list in slot
 * order, a row tapped inside it keeps its place. A row's quick choice writes that operator's entry (确认 saves it, 取消 /
 * Esc drop it) while a 潜能 / 练度 write stays immediate like the roster's. The state lives here; DiyPickerView draws it.
 * @param {{ m: any, tier: number, picks: Record<string, any>, kitted: string[]|null, onDone: (list: any[]) => void,
 *   onClose: () => void, ops?: Record<string, any>, onOps?: Function|null }} props
 */
export function DiyPicker(props) {
  const [start] = useState(() => pickerStart(props.tier, props.picks, diyData()));
  const [previewLevel, setPreviewLevel] = useState('elite');
  const [narrowDetail, setNarrowDetail] = useState(false); // phones: the detail slides over the list
  const [prof, setProf] = useState(null);
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState(start.order);
  const [edits, setEdits] = useState(start.edits);
  const [focus, setFocus] = useState(start.order[0] ?? null);
  const [bump, setBump] = useState(0); // the 「n/6」 flash of a refused seventh
  // Esc cancels only the picker, like its 取消 (GitHub #284, idea from PR #286); the 干员调配 overlay's own Esc skips
  // while a picker is open, and a dialog over the picker (导入) still takes Esc first. A layout effect: the listener is
  // attached in the same commit as the picker (a plain effect waits for the next frame, and an Esc pressed in between
  // was swallowed — the overlay skipped it, the picker did not hear it yet; the 0.2.2 full browser pass)
  useLayoutEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modal')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      props.onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [props.onClose]);
  const refuse = (cap) => {
    toast(t('{tier}阶自选编队最多{n}名。再次点击已选择的干员可将其移出', { tier: ROMAN_FULL[props.tier] || props.tier, n: cap }), 'warn');
    setBump((n) => n + 1);
  };
  return DiyPickerView({ ...props, previewLevel, onPreviewLevel: setPreviewLevel, narrowDetail, onNarrowDetail: setNarrowDetail,
    prof, query, order, edits, focus, top: start.order, bump, onProf: setProf, onQuery: setQuery, onOrder: setOrder, onEdits: setEdits,
    onFocus: setFocus, onRefuse: refuse });
}

/**
 * The picker's view (no hooks: the tests draw it): `prof` the profession the roster's chips select (null = every one),
 * `query`, `order` the chosen operators in choice order, `edits` the picks being made (charId → pick; an operator without
 * one shows its default — ui/diyModel.js defaultPick), `focus` the operator whose detail shows, `top` the operators
 * listed first (the tier's at opening), `bump` the refusal count, and their setters (`onEdits` takes an updater of the
 * entries); `narrowDetail` the phone layout (the detail over the list).
 */
export function DiyPickerView({ m, tier, picks, kitted, onDone, onClose, prof = null, query = '', order = [], edits = {}, focus = null, top = [], bump = 0,
  onProf = () => {}, onQuery: setQuery = () => {}, onOrder = () => {}, onEdits = () => {}, onFocus = () => {}, onRefuse = () => {},
  ops = {}, onOps = null, previewLevel = 'elite', onPreviewLevel = () => {}, narrowDetail = false, onNarrowDetail = () => {} }) {
  const skinCtx = skinArt();
  const D = diyData();
  const slots = tierSlots(tier, D);
  const cap = slots.length;
  const slotId = slots[0]?.slotId ?? null;
  const tiers = new Map(diySlotList(D).map((s) => [s.slotId, s.tier]));
  // the tier's own operators at opening first, in slot order; the rest as the pool lists them
  const options = slotId ? pickOptions(slotId, picks, D, kitted) : [];
  const rank = (c) => { const i = top.indexOf(c); return i < 0 ? top.length : i; };
  const sorted = options.map((o, i) => [o, i]).sort((a, b) => rank(a[0].charId) - rank(b[0].charId) || a[1] - b[1]).map(([o]) => o);
  const q = query.trim().toLowerCase();
  const list = sorted.filter((o) => (!prof || o.unit?.profession === prof)
    && (!q || [o.unit?.name, o.unit?.appellation, o.unit?.subProfessionName, t(PROF_NAME[o.unit?.profession] || ''), ...o.bonds.map(bondName)].some((x) => typeof x === 'string' && x.toLowerCase().includes(q))));
  const choiceOf = (charId) => edits[charId] || defaultPick(charId, slotId, D);
  // a tap on a row: in the choice → out (the rest renumber); else in at the end, unless the tier is full
  const sel = (charId) => {
    if (order.includes(charId)) { onFocus(charId); onOrder(order.filter((c) => c !== charId)); return; }
    if (order.length >= cap) { onRefuse(cap); return; }
    onFocus(charId);
    onOrder([...order, charId]);
  };
  // a row's quick choice (or the detail's): that operator's entry, chosen or not — an update of the latest entries, so two
  // taps before the next render both count
  const quick = (charId, patch) => {
    onFocus(charId);
    onEdits((prev) => ({ ...prev, [charId]: { ...(prev[charId] || defaultPick(charId, slotId, D)), ...patch } }));
  };
  const detail = (charId) => { onFocus(charId); onNarrowDetail(true); };
  const draft = focus && slotId ? choiceOf(focus) : null;
  const ch = draft ? rowChoices(draft.charId, slotId, D) : null;
  const chosen = ch ? rowChoice(ch, draft.charId, draft) : null;
  const skillOn = chosen ? chosen.skill : null;
  const modOn = chosen ? chosen.module : null;
  const unit = draft ? D.backups?.units?.[draft.charId] : null;
  const potential = draft ? opsOf(ops, draft.charId).potential : null;
  const label = t('{tier}阶 自选', { tier });
  const base = draft ? slotRecord(slotId, draft, D, { potential }) : null;
  const golden = draft ? slotRecord(slotId, draft, D, { elite: true, potential }) : null;
  const previewEntries = base ? { [base.baseId || base.chessId]: { skill: skillOn, module: modOn || 'none' } } : {};
  const previewChess = (id) => id === golden?.chessId ? golden : base;
  // the 默认 badge is suppressed: on a slot record `isDefault` marks the CURRENT pick (shared/standIn.js composeUnitRecord),
  // not the operator's official default; the module list itself is the DIY one (ui/diyModel.js), 不装备 first
  const skillOptions = base ? chessOptions(base, golden).skillOptions.map((s) => ({ ...s, isDefault: false })) : [];
  const moduleOptions = ch ? [noneOpt, ...ch.modules.map(moduleOpt)] : [];
  const pickSkill = (i) => quick(draft.charId, { skillIndex: i });
  const pickModule = (id) => quick(draft.charId, { uniEquipId: id === MODULE_NONE ? null : id });
  const full = order.length >= cap;
  return html`<section class=${cx('diy-pick', narrowDetail && 'is-detail')} role="dialog" aria-label=${t('{slot}：选择干员', { slot: label })} data-testid="diy-picker" data-tier=${tier}
      style=${`--tc:var(--tier-${tier})`}>
    <div class=${cx('diy-pick__main', narrowDetail && 'is-detail')}>
      <section class="diy-pick__col">
        <header class="lo-filters diy-pick__head">
          <div class="lo-frow">
            <span class="diy-pick__heading">
              <span class="diy-pick__stack">
                <b class="diy-pick__title">${t('自选编队')}<${TierChip} tier=${tier} size="sm" class="diy-pick__tier" /></b>
                <span class="diy-pick__tips">${t('可选择{n}名干员加入作战编队', { n: cap })}</span>
              </span>
              <span class="diy-pick__lab">${t('已选干员')}</span>
              <b key=${bump} class=${cx('diy-pick__num', full && 'is-full', bump > 0 && 'is-bump')} data-testid="diy-pick-count">${order.length}/${cap}</b>
            </span>
            <${TextField} size="sm" icon="search" value=${query} placeholder=${t('搜索干员 / 职业 / 盟约')} class="lo-search"
              onInput=${(v) => setQuery(String(v).slice(0, 24))} />
            <button type="button" class="diy-pick__x" aria-label=${t('关闭')} onClick=${onClose}><${Icon} name="close" /></button>
          </div>
          <div class="lo-frow diy-pick__profrow"><${ProfFilter} m=${m} prof=${prof} onProf=${onProf} /></div>
        </header>
        <div class="lo-list diy-pick__list">
          <${DiyHead} />
          <div class="lo-list__rows" role="list" aria-label=${t('可选干员')}>
            ${kitted == null ? html`<p class="lo-empty t-dim">${t('连接服务器后才能选择自选干员')}</p>`
              : list.length ? list.map((o) => html`<${DiyRow} key=${o.charId} m=${m} tier=${tier} opt=${o} ch=${rowChoices(o.charId, slotId, D)}
                  takenTier=${o.taken ? tiers.get(o.taken) ?? tier : null} choice=${choiceOf(o.charId)} index=${order.indexOf(o.charId) + 1}
                  selected=${focus === o.charId} ops=${ops} onOps=${onOps} onSel=${sel} onQuick=${quick} onDetail=${detail} level=${previewLevel} />`)
                : html`<p class="lo-empty t-dim">${t('没有符合条件的干员')}</p>`}
          </div>
        </div>
      </section>
      <div class="lo-detail-wrap">
        <div class="diy-pick__backrow">
          <button type="button" class="lo-detail-back diy-pick__back" onClick=${() => onNarrowDetail(false)}><${Icon} name="chevronLeft" />${t('干员列表')}</button>
        </div>
        <div class="lo-detail">
          ${ch && unit && base ? html`
            <div class="lo-dhead">
              <div class=${cx('lo-dhead__art', `lo-dhead__art--t${tier}`)}>
                <${Img} src=${skinPic(unit, 'portrait', skinCtx, { own: true }) || chessPortraitUrl(m, golden || base) || avatarOf(m, unit, true)} fallback=${html`<b class="diy-pick__glyph">${[...(unit.name || '?')][0]}</b>`} />
              </div>
              <div class="lo-dhead__info">
                <div class="lo-dhead__chips"><${TierChip} tier=${tier} size="md" /></div>
                <h2 class="lo-dhead__name">${base.name || unit.name}</h2>
                <span class="lo-dhead__en">${base.appellation || unit.appellation || ''}</span>
                <span class="lo-dhead__class">
                  <${Img} src=${profGlyphUrl(m, base.profession)} class="lo-dhead__prof lo-profglyph" />${t(PROF_NAME[base.profession] || '')}
                  <i class="lo-sep"></i><${Img} src=${subProfIconUrl(m, base)} class="lo-dhead__prof" />${base.subProfessionName || ''}
                </span>
                <span class="lo-dhead__bonds">${(base.bonds || []).map((b) => html`<span key=${b} class="lo-bond">
                  <${Img} src=${bondIconUrl(m, b)} class="lo-bond__icon" fallback=${html`<i class="lo-bond__dot"></i>`} />${bondName(b)}</span>`)}</span>
              </div>
            </div>
            <div class="diy-pick__detail">
              <${SkinSection} charId=${draft.charId} art=${chessPortraitUrl(m, golden || base) || avatarOf(m, unit, true)} face=${avatarOf(m, unit, true)} />
              ${onOps ? html`<${CultivationSection} charId=${draft.charId} ops=${ops} onSet=${onOps} />` : null}
              <${SkillSection} m=${m} chess=${base} golden=${golden} skillOptions=${skillOptions} skill=${skillOn} level=${previewLevel}
                onLevel=${onPreviewLevel} onPick=${pickSkill} />
              <${LoadoutStats} base=${base} golden=${golden} entries=${previewEntries} level=${previewLevel}
                onLevel=${onPreviewLevel} getChess=${previewChess} ops=${ops} />
              <${ModuleSection} m=${m} golden=${golden} moduleOptions=${moduleOptions} module=${modOn ?? MODULE_NONE}
                onPick=${pickModule} potential=${potential} />
            </div>` : html`<div class="diy-pick__detail"><p class="lo-empty t-dim">${t('从左侧选择一名干员')}</p></div>`}
        </div>
      </div>
    </div>
    <footer class="diy-pick__foot">
      <${Button} variant="ghost" class="diy-pick__clear" data-testid="diy-pick-clear" disabled=${!order.length} onClick=${() => onOrder([])}>${t('清空选择')}<//>
      <${Button} variant="ghost" onClick=${onClose}>${t('取消')}<//>
      <${Button} variant="primary" icon="check" data-testid="diy-confirm" disabled=${kitted == null} onClick=${() => onDone(order.map(choiceOf))}>${t('确认')}<//>
    </footer>
  </section>`;
}

/**
 * The tab's body: the lineup, the fold of its top on a phone, and the tier picker being filled (`picking`, kept here).
 * @param {{ m: any, picks: Record<string, any>, legal: Record<string, any>, kitted: string[]|null,
 *   onSet: (slotId: string, pick: any) => void, onSetMany?: ((entries: Array<[string, any]>) => void)|null,
 *   ops?: Record<string, any>, onOps?: ((charId: string, patch: { potential?: number, cultivate?: number }) => void) | null }} props
 *   `ops` / `onOps`: the stored 潜能 / 练度 and their setter (0.2.2 — the picker's rows and detail carry the selects)
 */
export function DiyPanel(props) {
  const [picking, setPicking] = useState(null);
  const [fold, setFold] = useState(false); // phones: the lead, the preset bar and the linked strategies over the lineup
  // a slot handed over by openLoadout (the strategy draft's preset slot): its tier's picker opens once, and closing it —
  // 确认 or 取消 — returns to the draft (closes the overlay — maintainer requests 2026-10-13)
  const handed = useStore((s) => s.diyPick, Object.is, loadoutStore);
  const [back, setBack] = useState(null);
  useEffect(() => {
    if (!handed) return;
    const tier = diySlotList(diyData()).find((s) => s.slotId === handed)?.tier ?? null;
    if (tier != null) { setPicking(tier); setBack(tier); setFold(false); }
    loadoutStore.set({ diyPick: null });
  }, [handed]);
  const onPicking = (v) => {
    setPicking(v);
    if (v) { setFold(false); return; }
    if (back) closeLoadout();
    setBack(null);
  };
  // the fold closes on a tap outside it and on Escape (the 关联策略 grid's Escape first)
  useEffect(() => {
    if (!fold) return undefined;
    const keep = '.diy__fold, .diy .own__bar, .diy .diy-presets, .diy-links__grid, .modal';
    const away = (e) => { if (!e.target?.closest?.(keep)) setFold(false); };
    const esc = (e) => {
      if (e.key !== 'Escape' || document.querySelector('.diy-links__grid, .modal')) return;
      e.preventDefault(); e.stopImmediatePropagation(); setFold(false);
    };
    document.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', esc, true); };
  }, [fold]);
  // the lineup's unit (css/screens/loadout.css .diy-lineup --lu): the HUD unit, or the body's room when that takes no more
  // than 15 % off it (else the body scrolls); on a phone (the fold, max-height 560 px) always the room — both rows on
  // screen (maintainer decision 2026-11-19). The names fit again at the new size (ui/fitLine.js).
  const mainRef = useRef(null);
  useLayoutEffect(() => {
    const body = mainRef.current?.querySelector('.diy__body');
    if (!body || typeof ResizeObserver !== 'function') return undefined;
    const fit = () => {
      const lineup = body.querySelector('.diy-lineup');
      if (!lineup) return;
      lineup.style.removeProperty('--lu');
      const u = lineup.getBoundingClientRect().width / LINEUP_W;
      const cs = getComputedStyle(body);
      const h = body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 2;
      const w = body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
      const room = Math.min(h / LINEUP_H, w / LINEUP_W);
      const phone = matchMedia('(max-height: 560px)').matches;
      const lu = phone ? Math.min(u, room) : room < u && room >= u * 0.85 ? room : u;
      if (u > 0 && lu > 0) lineup.style.setProperty('--lu', `${lu}px`);
      for (const n of lineup.querySelectorAll('.dccard__name')) fitLine(n, CARD_NAME_FIT);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(body);
    return () => ro.disconnect();
  }, []);
  const presets = useStore((s) => s.presets, Object.is, diyPresetStore);
  const activePreset = useStore((s) => s.active, Object.is, diyPresetStore);
  const links = useStore((s) => s.links, Object.is, diyPresetStore);
  // the strategies (bands.json) for the linked-strategy chips; drawn once they are loaded
  const [bandsReady, setBandsReady] = useState(() => data.list('bands').length > 0);
  useEffect(() => { if (!bandsReady) data.load('bands').then(() => setBandsReady(true), () => {}); }, []);
  const bands = bandsReady ? data.list('bands') : [];
  return DiyPanelView({ ...props, mainRef, picking, onPicking, fold, onFold: setFold, presets, activePreset, onPreset: selectPreset, onPresetDelete: deletePreset,
    links, bands, onToggle: toggleBandLink });
}

/**
 * The 阵营预设 bar (ui/diyPresets.js): 不使用预设, then a chip per chat faction — filled when it holds a preset, the
 * shown one marked — and 删除 for the shown faction's preset.
 * @param {{ presets: Record<string, any>, active: string|null, onSelect: (id: string|null) => void, onDelete: (id: string) => void }} props
 */
export function DiyPresetBar({ presets, active, onSelect, onDelete, links = null, bands = null, onToggle = null }) {
  const on = chatFaction(active);
  return html`<div class="diy-presets" role="group" aria-label=${t('阵营预设')} data-testid="diy-presets">
    <span class="diy-presets__k">${t('阵营预设')}</span>
    <button type="button" class=${cx('diy-preset', 'diy-preset--none', !on && 'is-on')} aria-pressed=${on ? 'false' : 'true'}
      data-preset="" onClick=${() => onSelect(null)}>${t('不使用预设')}</button>
    ${chatFactionsOf(presetSeasonOf()).map((f) => {
      const has = !!presets?.[f.id];
      return html`<button key=${f.id} type="button" class=${cx('diy-preset', has && 'has-preset', active === f.id && 'is-on')} style=${`--fac:${f.color}`}
        aria-pressed=${active === f.id ? 'true' : 'false'} data-preset=${f.id} title=${`${t(f.name)} · ${has ? t('已保存预设') : t('尚未设置预设')}`}
        onClick=${() => onSelect(f.id)}><${FactionIcon} f=${f} /><span>${t(f.name)}</span></button>`;
    })}
    ${on && presets?.[on.id] ? html`<${Button} variant="ghost" size="sm" icon="close" class="diy-presets__del" data-testid="diy-preset-delete"
      onClick=${() => onDelete(on.id)}>${t('删除{faction}预设', { faction: t(on.name) })}<//>` : null}
    ${onToggle && Array.isArray(bands) && bands.length ? html`<${PresetBandLinks} target=${on ? on.id : BASE_LINK} links=${links || {}} bands=${bands} onToggle=${onToggle} />` : null}
    <p class="diy-presets__hint">${on ? t('此处的修改会保存到{faction}预设；在聊天中选择{faction}时自动套用', { faction: t(on.name) })
      : t('「不使用预设」与每个阵营各存一套自选；在聊天或策略选择中选择阵营时自动套用该阵营的预设')}</p>
  </div>`;
}

/**
 * The strategies linked to the roster shown (전략별 선발 프리셋), with the 关联策略 grid's open state. The grid floats over
 * the tab (fixed under the button, or above it without room below; maintainer decision 2026-10-13: opening it must not
 * push the slots down); a tap outside, Escape, a scroll or a resize closes it.
 * @param {{ target: string, links: Record<string, string>, bands: any[], onToggle: (band: any, target: string) => void }} props
 */
export function PresetBandLinks(props) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!open) return;
    const btn = ref.current?.querySelector('.diy-links__add');
    const list = ref.current?.querySelector('.diy-links__grid');
    if (!btn || !list) return;
    const r = btn.getBoundingClientRect();
    const h = list.offsetHeight;
    const below = window.innerHeight - r.bottom - 4;
    const up = h > below && r.top - 4 > below;
    list.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - list.offsetWidth - 4))}px`;
    list.style.top = up ? `${Math.max(4, r.top - 2 - h)}px` : `${r.bottom + 2}px`;
    list.style.maxHeight = `${Math.max(below, r.top - 4) - 2}px`;
    list.style.visibility = 'visible';
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    const moved = (e) => { if (!ref.current?.querySelector('.diy-links__grid')?.contains(e.target)) setOpen(false); };
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
  return html`<div class="diy-links" data-testid="diy-band-links" ref=${ref}>${PresetBandLinksView({ ...props, open, onOpen: setOpen })}</div>`;
}

/**
 * The row's content (no hooks: the tests draw it). A strategy applies the roster its link names, else the one it is
 * built around (bandLinkTarget). Chips: each strategy that applies `target` — its icon, its name, 推荐 when only the
 * recommendation does it, × to unlink (toggleBandLink: a 推荐 one is turned off). The grid (`open`): every strategy as
 * an icon tile, a toggle — ✓ on the ones that apply `target` (dashed when by recommendation), dimmed with the other
 * roster's faction icon (or −, 不使用预设) on the ones that apply another (a tap moves them here) — and a legend.
 * @param {{ target: string, links: Record<string, string>, bands: any[], onToggle: (band: any, target: string) => void,
 *   open?: boolean, onOpen?: (v: boolean) => void }} props
 */
export function PresetBandLinksView({ target, links, bands, onToggle, open = false, onOpen = () => {} }) {
  const sid = (b) => (Number.isFinite(b.sortId) ? b.sortId : 99);
  const list = bands.filter((b) => b && typeof b.bandId === 'string').sort((a, b) => sid(a) - sid(b));
  const at = (b) => bandLinkTarget(b, links);
  const byRec = (b) => !links[b.bandId] && at(b) === target;
  const here = list.filter((b) => at(b) === target);
  const whereName = (w) => (w === BASE_LINK ? t('不使用预设') : t(chatFaction(w)?.name || ''));
  const tip = (b) => {
    const w = at(b);
    if (w === target) return `${b.name} · ${byRec(b) ? t('推荐：以该阵营为核心的策略，点击取消') : t('已关联此预设，点击取消')}`;
    if (w) return `${b.name} · ${t('已关联{where}，点击改为关联此预设', { where: whereName(w) })}`;
    return `${b.name} · ${t('点击关联此预设')}`;
  };
  const badge = (w) => (w === BASE_LINK ? html`<${Icon} name="minus" class="diy-band__mark is-glyph" />`
    : chatFaction(w) ? html`<${FactionIcon} f=${chatFaction(w)} class="chat__facico diy-band__mark" />` : null);
  return html`<span class="diy-links__k">${t('关联策略')}</span>
    ${here.map((b) => html`<span key=${b.bandId} class=${cx('diy-link', byRec(b) && 'is-rec')} data-band=${b.bandId} title=${tip(b)}>
      <${BandIcon} bandId=${b.bandId} size="xs" />${b.name}${byRec(b) ? html`<small>${t('推荐')}</small>` : null}
      <button type="button" class="diy-link__x" aria-label=${t('取消关联{name}', { name: b.name })} onClick=${() => onToggle(b, target)}>×</button></span>`)}
    ${!here.length ? html`<span class="diy-links__none">${t('没有关联的策略')}</span>` : null}
    <button type="button" class="diy-links__add" data-testid="diy-band-link-add" aria-haspopup="true" aria-expanded=${open ? 'true' : 'false'}
      onClick=${() => onOpen(!open)}><${Icon} name="plus" />${t('选择关联策略')}<i class="diy-links__caret" aria-hidden="true"></i></button>
    ${open ? html`<div class="diy-links__grid" role="group" aria-label=${t('关联策略')} data-testid="diy-band-grid">
      ${list.map((b) => {
        const w = at(b);
        const on = w === target;
        return html`<button key=${b.bandId} type="button" class=${cx('diy-band', on && 'is-here', on && byRec(b) && 'is-rec', w && !on && 'is-other')}
          data-band=${b.bandId} aria-pressed=${on ? 'true' : 'false'} title=${tip(b)} onClick=${() => onToggle(b, target)}>
          <${BandIcon} bandId=${b.bandId} size="sm" /><span class="diy-band__name">${b.name}</span>${on ? html`<${Icon} name="check" class="diy-band__check" />` : badge(w)}
        </button>`;
      })}
      <p class="diy-links__legend"><span><${Icon} name="check" />${t('已关联此预设（再次点击取消）')}</span>
        <span><i class="diy-links__dash"></i>${t('以该阵营为核心的推荐策略')}</span>
        <span>${t('图标暗淡：已关联其他预设（点击移到这里）')}</span></p>
    </div>` : null}`;
}

/**
 * The tab's lineup (the official 自选编队 window's panel, auto_chess_deploy_diy_lineup_state, drawn in the tab —
 * maintainer decision 2026-11-19): a row per tier (row_5 / row_6, 860×250 canvas units 270 apart) on its band
 * (pop_diy_level_tag_bg in the tier's colour, #ffd600 / #ff7c00) with its tag (pop_diy_level_N_tag_short, 146×277 at
 * −40, −21.5), and the tier's six slots (123×266, from x 80 every 143, y −10): a filled one is the 干员调配 card
 * (ui/diyCard.js DiyCard, at the slot's own 123 width), an empty one the official empty slot pop_diy_item_add. A tap on
 * a slot opens its tier's picker. Sizes are canvas units times --lu (css/screens/loadout.css `.diy-lineup`).
 */
function DiyLineup({ m, picks, legal, ops, onOpen }) {
  const slots = diySlotList(diyData());
  const tiers = [...new Set(slots.map((s) => s.tier))];
  const art = (n) => uiUrl(m, `diyLineupArt/${n}`);
  const vars = cssUrlVars([...diyCardArt(m), ['--dl-band', art('pop_diy_level_tag_bg')], ['--dl-add', art('pop_diy_item_add')]]);
  const bad = t('这项自选在当前版本不可用，开局时会被移除');
  return html`<div class="diy-lineup" style=${vars || null} data-testid="diy-lineup">
    <div class="diy-lineup__in">
      ${tiers.map((tier) => {
        const tag = art(`pop_diy_level_${tier}_tag_short`);
        return html`<section key=${tier} class="diy-lrow" data-tier=${tier} aria-label=${t('{tier}阶', { tier })}>
          <i class="diy-lrow__band" aria-hidden="true"></i>
          <i class=${cx('diy-lrow__tag', !tag && 'is-plain')} style=${tag ? `--dl-tag:url("${tag}")` : null} aria-hidden="true">${tag ? null : ROMAN_FULL[tier]}</i>
          ${slots.filter((s) => s.tier === tier).map((s, i) => {
            const pick = picks[s.slotId] || null;
            const rec = pick ? slotRecord(s.slotId, pick, diyData()) : null;
            const illegal = !!pick && !legal[s.slotId];
            const label = t('{slot}：选择干员', { slot: t('{tier}阶 自选', { tier }) });
            return html`<div key=${s.slotId} class=${cx('diy-slot', rec ? 'is-filled' : 'is-empty', illegal && 'is-bad')} data-slot=${s.slotId}
                data-char=${rec ? pick.charId : null} style=${`--i:${i}`} title=${illegal ? bad : null}>
              ${rec ? html`<${DiyCard} m=${m} slotId=${s.slotId} pick=${pick} tier=${tier} ops=${ops} testid="diy-slot-card"
                  label=${`${rec.name} · ${label}`} onTap=${() => onOpen(tier)} />`
                : html`<button type="button" class="diy-slot__fill" aria-label=${label} onClick=${() => onOpen(tier)}>
                  ${art('pop_diy_item_add') ? null : html`<${Icon} name="plus" />`}</button>`}
              ${illegal ? html`<span class="diy-slot__bad" role="img" aria-label=${bad}><${Icon} name="warn" /></span>` : null}
            </div>`;
          })}
        </section>`;
      })}
    </div>
  </div>`;
}

/**
 * The fold of the tab's top on a phone (max-height 560 px; css/screens/loadout.css): a rail left of the lineup in the
 * official row tag's idiom (a dark slab of fine stripes, the ✕ ◆ ◇ marks, a 「NO.」 bracket, a vertical English line —
 * in CSS, the sprite has the tier glyph in it) naming the preset shown and its linked strategies; a tap floats the lead,
 * the preset bar and the links over the lineup (maintainer decision 2026-11-19, look 가).
 */
function DiyFold({ open, onToggle, active, links, bands }) {
  const on = chatFaction(active);
  const target = on ? on.id : BASE_LINK;
  const n = (bands || []).filter((b) => b && typeof b.bandId === 'string' && bandLinkTarget(b, links || {}) === target).length;
  return html`<div class="diy__fold">
    <button type="button" class="diy-fold" aria-expanded=${open ? 'true' : 'false'} aria-label=${t('展开阵营预设、关联策略与说明')} onClick=${() => onToggle(!open)}>
      <span class="diy-fold__marks" aria-hidden="true"><b>✕</b><i>◆</i><i>◇</i><i>◇</i></span>
      <span class="diy-fold__en" aria-hidden="true">BOND PRESET · LINKED STRATEGY</span>
      <span class="diy-fold__frame"><span class="diy-fold__no" aria-hidden="true">NO.</span>
        <span class="diy-fold__k">${t('阵营预设')}</span><b class="diy-fold__v">${on ? t(on.name) : t('不使用预设')}</b>
        <span class="diy-fold__k">${t('关联策略')}</span><b class=${cx('diy-fold__v', !n && 'is-dim')}>${n ? t('{n}个', { n }) : t('无')}</b></span>
      <span class="diy-fold__more">${open ? t('收起') : t('展开')}<i aria-hidden="true"></i></span>
    </button>
  </div>`;
}

/** The tab's view (no hooks: the tests draw it): `picking` = the tier being filled, or null; `fold` the phone fold open. */
export function DiyPanelView({ m, picks, legal, kitted, onSet, onSetMany = null, mainRef = null, picking, onPicking: setPicking, fold = false, onFold = () => {}, ops = {}, onOps = null,
  presets = null, activePreset = null, onPreset = null, onPresetDelete = null, links = null, bands = null, onToggle = null }) {
  const D = diyData();
  const art = withDiyChooseArt(m, data.get('local')); // 盟约 too draws 规程's lineup and card art (ui/assetUrls.js)
  // 确认 of the picker: the tier's slots 1… in the order chosen, the rest emptied — one write when the caller takes it
  const fill = (tier, list) => {
    const entries = tierSlots(tier, D).map((s, i) => [s.slotId, list[i] || null]);
    if (onSetMany) onSetMany(entries); else for (const [id, p] of entries) onSet(id, p);
  };
  return html`<main class=${cx('diy', fold && 'is-fold-open')} data-testid="diy" ref=${mainRef}>
    ${onPreset ? html`<${DiyFold} open=${fold} onToggle=${onFold} active=${activePreset} links=${links} bands=${bands} />` : null}
    <div class="own__bar">
      <p class="own__lead" title=${t('5阶与6阶各有六个自选名额：选择持有的 6★ 干员（任选技能与模组）或原型干员（技能锁定）。开局时在「确定自选编队」每阶最多选两名上场。自选干员只出现在你自己的商店里，调度中心达到该阶等级后才会刷新，价格与同阶干员相同；盟约按干员实际所属阵营分配，没有特质。')}>${t('每阶最多预选六名自选干员，开局时在「确定自选编队」每阶最多选两名上场。点击栏位选择该阶干员。')}</p>
    </div>
    ${onPreset ? html`<${DiyPresetBar} presets=${presets || {}} active=${activePreset} onSelect=${onPreset} onDelete=${onPresetDelete || (() => {})}
      links=${links} bands=${bands} onToggle=${onToggle} />` : null}
    <div class="diy__body">
      <${DiyLineup} m=${art} picks=${picks} legal=${legal} ops=${ops} onOpen=${setPicking} />
    </div>
    ${picking != null ? html`<${DiyPicker} key=${picking} m=${m} tier=${picking} picks=${picks} kitted=${kitted} ops=${ops} onOps=${onOps} onClose=${() => setPicking(null)}
      onDone=${(list) => { fill(picking, list); setPicking(null); }} />` : null}
  </main>`;
}
