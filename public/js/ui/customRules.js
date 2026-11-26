// 커스텀 규칙 설정 창 (maintainer decisions 2026-10-18): the settings of the custom 규칙 모드 — six tabs (盟约 · 敌人能力
// · 敌人类型 · 领袖 · 战场 · 进程; 敌人类型 = the 特训敌人 types, maintainer decision 2026-11-15), the preset row on top (ui/customRulesStore.js: 预设 picker, 保存 · 新建 · 改名 · 删除, the count of
// settings that differ from the official ones and the unsaved mark, 复制代码 · 粘贴代码) and 休闲值 / 官方值 / 取消 / 应用.
// The ⚙ of the 规则 switch opens it (ui/ruleset.js): in the lobby it edits the lobby's settings, in a room the host's
// edit the room's (room.setRuleset), anybody else sees them read-only with 保存为我的预设.
// Every setting reaches the match: the match flow (bonds, leader and stage bans, rounds, prep, 目标生命值, the shop pool
// sizes) through its GameData, the battle settings (enemy and leader stats, 限伤, the layer cap) through the spawn mods
// and the spec flags.
//
// The lists come from the season's data (data.js follows the room's season): its bonds, 特训敌人 types, leaders and
// stages; a 规程等级 room (`grade`) compares with that grade's mode, the bond ban counts keep the season's range
// (customBanLimits), and 收录上半战场 shows only where this season's data has those stages.
//
//   openCustomRules({ rules, readonly, roomMode, difficulty, grade, size, onApply })   CustomRulesDialog (mounted by the lobby and the room)

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Icon, Button, Modal, confirmDialog, Roman } from './components.js';
import { Img } from './gameComponents.js';
import { bondIconUrl, enemyIconUrl, factionIconUrl, lentTypeIconUrl } from './assetUrls.js';
import { createStore, useStore, loadPref, savePref } from '../store.js';
import { data, useData, getMode, localAsset } from '../data.js';
import { copyText } from './clipboard.js';
import { toast } from './toasts.js';
import {
  customRulesStore, setDraft, selectPreset, addPreset, savePreset, renamePreset, deletePreset, presetOf, nextPresetName,
  encodeCustomCode, decodeCustomCode, CUSTOM_NAME_MAX,
} from './customRulesStore.js';
import {
  sanitizeCustom, customDiffs, customRoundPlan, customPrepSeconds, customStagePool, customPoolCount, CUSTOM_OFFICIAL, CUSTOM_CASUAL,
  CUSTOM_LIMITS, CUSTOM_FIRST_HALF_STAGES, OFFICIAL_TYPE_COUNT, officialBans, customBanLimits, seasonOfficialOptions, officialStep, stepScale, stepPreset, CUSTOM_STEP_PRESETS,
} from '../../../shared/ruleset.js';
import { borrowSeasons, fitCustomToSeason, lendableBoss, lendableStage, lendableType, sameField } from '../../../shared/seasonBorrow.js';
import { seasonInfo } from '../../../shared/seasons.js';
import { modeIdFor, DIFFICULTIES, LARGE_SEATS, isGrade, gradeDifficulty } from '../../../shared/constants.js';
import { t, N_ } from '../../../shared/i18n.js';

/** @import { CustomSettings, BanCounts } from '../../../shared/ruleset.js' */
/** @import { Bag } from './gameLogic/shared.js' */
/** @typedef {Readonly<CustomSettings>} Rules */
/** @typedef {Exclude<keyof CustomSettings, 'v'>} RuleSection */
/**
 * What every tab gets (CustomRulesBody's `ctx`): the settings on screen, their setters, the mode record and the
 * official values the settings compare with.
 * @typedef {{ work: Rules, set: (sec: RuleSection, k: string, v: unknown) => void,
 *   setWork: (next: Rules | ((w: Rules) => Rules)) => void, readonly: boolean, solo: boolean, mode: Bag | null, bans: BanCounts | null,
 *   banLimits: ReturnType<typeof customBanLimits>, base: { bans: BanCounts | null, rounds: number | null }, difficulty: string,
 *   size: number, config: Bag | null }} PaneProps
 */
/** @typedef {Event & { target: HTMLInputElement }} InputEv */

/** @param {...unknown} p */
const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** The tabs: id, name, the settings paths it counts (customDiffs prefixes). */
const TABS = [
  { id: 'bonds', name: N_('盟约'), micro: 'BONDS', keys: ['bonds.'] },
  { id: 'enemies', name: N_('敌人能力'), micro: 'ENEMIES', keys: ['enemies.', 'leaders.'] },
  { id: 'types', name: N_('敌人类型'), micro: 'ENEMY TYPES', keys: ['types.'] },
  { id: 'bosses', name: N_('敌方领袖'), micro: 'LEADERS', keys: ['bosses.'] },
  { id: 'stages', name: N_('战场'), micro: 'BATTLEFIELD', keys: ['stages.'] },
  { id: 'flow', name: N_('进程'), micro: 'FLOW', keys: ['flow.', 'pool.'] },
];

/**
 * @typedef {{ open: boolean, seq: number, rules: Rules | null, readonly: boolean, live: (() => unknown) | null,
 *   roomMode: string, difficulty: string, grade: number | null, size?: number, onApply: ((rules: Rules) => void) | null }} DialogState
 */
export const customDialogStore = createStore(/** @type {DialogState} */ ({ open: false, seq: 0, rules: null, readonly: false, live: null, roomMode: 'coop', difficulty: 'FUNNY', grade: null, onApply: null }));

/**
 * Open the settings. `onApply(rules)` runs after 应用 (the lobby picks custom, a room's host sends room.setRuleset).
 * `live` (read-only): a function giving the settings to show now — a room's, which its host may change meanwhile.
 * `size`: the room's seat count (an 8-seat room compares with the 8-player official values — shared/ruleset.js officialBans).
 * `grade`: a 规程 solo room's 规程等级 (its mode and difficulty are the grade's), null elsewhere.
 * @param {{ rules: unknown, readonly?: boolean, live?: (() => unknown) | null, roomMode?: 'solo'|'coop', difficulty?: string,
 *   grade?: number | null, size?: number, onApply?: ((rules: Rules) => void) | null }} opts
 */
export function openCustomRules({ rules, readonly = false, live = null, roomMode = 'coop', difficulty = 'FUNNY', grade = null, size = 4, onApply = null }) {
  const graded = roomMode === 'solo' && isGrade(grade);
  customDialogStore.set((s) => ({ open: true, seq: s.seq + 1, rules: sanitizeCustom(rules), readonly, live: readonly ? live : null, roomMode,
    difficulty: graded ? gradeDifficulty(/** @type {number} */ (grade)) : DIFFICULTIES.includes(difficulty) ? difficulty : 'FUNNY', grade: graded ? grade : null, size, onApply }));
}

export const closeCustomRules = () => customDialogStore.set({ open: false, onApply: null, live: null });

/** The settings dialog (one per screen that has the ⚙; leaving the screen closes it). */
export function CustomRulesDialog() {
  const st = useStore((s) => s, Object.is, customDialogStore);
  useEffect(() => closeCustomRules, []);
  if (!st.open) return null;
  return html`<${CustomRulesBody} key=${st.seq} init=${st.rules} readonly=${st.readonly} live=${st.live} roomMode=${st.roomMode}
    difficulty=${st.difficulty} grade=${st.grade} size=${st.size} onApply=${st.onApply} />`;
}

/** @param {number} n */
const fmt = (n) => Number(n).toLocaleString('en-US');

// ---- controls ----------------------------------------------------------------------------------------------------

/**
 * − value + with a typed value; `suffix` after the number (%), `prefix` before it (×); `scale`: the value is shown and
 * typed divided by it, with two decimals (the step multipliers: 120 → ×1.20).
 * @param {{ value: number, min: number, max: number, step?: number, onChange: (v: number) => void, disabled?: boolean,
 *   suffix?: string, prefix?: string, scale?: number, wide?: boolean, testid?: string }} p
 */
function Stepper({ value, min, max, step = 1, onChange, disabled, suffix = '', prefix = '', scale = 1, wide = false, testid }) {
  const [text, setText] = useState(/** @type {string | null} */ (null));
  /** @param {number} v */
  const clamp = (v) => Math.min(max, Math.max(min, Math.round(v)));
  // the value the last click asked for, until the new props arrive: two clicks before a render both count
  const last = useRef({ prop: value, cur: value });
  if (last.current.prop !== value) last.current = { prop: value, cur: value };
  /** @param {number} d */
  const bump = (d) => { const v = clamp(last.current.cur + d); last.current.cur = v; onChange(v); };
  const commit = () => {
    if (text == null) return;
    const v = Number(String(text).replace(/[^\d.-]/g, '')) * scale;
    setText(null);
    if (Number.isFinite(v)) onChange(clamp(v));
  };
  return html`<span class=${cx('crx-step', wide && 'crx-step--wide')} data-testid=${testid}>
    <button type="button" aria-label="−" disabled=${disabled || value <= min} onClick=${() => bump(-step)}><${Icon} name="minus" /></button>
    <input class="num" type="text" inputmode=${scale === 1 ? 'numeric' : 'decimal'} disabled=${disabled}
      value=${text ?? `${prefix}${scale === 1 ? fmt(value) : (value / scale).toFixed(2)}${suffix}`}
      onFocus=${(/** @type {InputEv} */ e) => { setText(scale === 1 ? String(value) : (value / scale).toFixed(2)); requestAnimationFrame(() => e.target.select?.()); }}
      onInput=${(/** @type {InputEv} */ e) => setText(e.target.value)} onBlur=${commit}
      onKeyDown=${(/** @type {KeyboardEvent & InputEv} */ e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }} />
    <button type="button" aria-label="+" disabled=${disabled || value >= max} onClick=${() => bump(step)}><${Icon} name="plus" /></button>
  </span>`;
}

/** @param {{ on: boolean, onChange: (v: boolean) => void, disabled?: boolean, testid?: string }} p */
function Switch({ on, onChange, disabled, testid }) {
  return html`<button type="button" role="switch" aria-checked=${on ? 'true' : 'false'} class=${cx('crx-sw', on && 'is-on')}
    disabled=${disabled} data-testid=${testid} onClick=${() => onChange(!on)}></button>`;
}

/** @param {{ options: { v: string, label: string }[], value: string, onChange: (v: string) => void, disabled?: boolean }} p */
function Seg({ options, value, onChange, disabled }) {
  return html`<span class="crx-seg" role="radiogroup">${options.map((o) => html`<button key=${o.v} type="button" role="radio"
    aria-checked=${o.v === value ? 'true' : 'false'} class=${o.v === value ? 'is-on' : ''} disabled=${disabled}
    onClick=${() => o.v !== value && onChange(o.v)}>${o.label}</button>`)}</span>`;
}

/** @param {{ label: string, note?: string | null, official?: string | null, children?: unknown, locked?: boolean }} p */
function Row({ label, note, official, children, locked }) {
  return html`<div class=${cx('crx-row', locked && 'is-locked')}>
    <div class="crx-row__l"><span>${label}</span>${note ? html`<em>${note}</em>` : null}</div>
    ${official ? html`<span class="crx-official">${official}</span>` : null}
    ${children}
  </div>`;
}

/** @param {{ title: string, sub?: string | null, children?: unknown }} p */
const Sec = ({ title, sub, children }) => html`<section class="crx-sec">
  <h3 class="crx-sec__h">${title}${sub ? html`<small>${sub}</small>` : null}</h3>
  ${children}
</section>`;

// ---- the dialog --------------------------------------------------------------------------------------------------

/**
 * Custom settings fitted to the season on screen (shared/seasonBorrow.js fitCustomToSeason): its own files (the dialog
 * has them loaded) and the files of the seasons that lend to it, loaded first. `from` = the season a share code names.
 * @param {unknown} rules @param {string | null} from
 */
async function fitToSeason(rules, from) {
  const season = data.season();
  const lenders = borrowSeasons(season).map((sid) => [sid, data.seasonStore(sid)]).filter(([, st]) => st);
  await Promise.all(lenders.flatMap(([, st]) => ['stages', 'factions', 'bosses'].map((n) => st.load(n))));
  const own = Object.fromEntries(['bonds', 'bosses', 'stages', 'factions', 'config'].map((n) => [n, data.getRaw(n)]));
  /** @type {[string, { stages?: unknown, factions?: unknown, bosses?: unknown }][]} */
  const foreign = lenders.map(([sid, st]) => [sid, { stages: st.getRaw('stages'), factions: st.getRaw('factions'), bosses: st.getRaw('bosses') }]);
  return fitCustomToSeason(rules, own, foreign, { season, from });
}

/**
 * @param {{ init: Rules, readonly: boolean, live: (() => unknown) | null, roomMode: string, difficulty: string,
 *   grade: number | null, size: number, onApply: ((rules: Rules) => void) | null }} p
 */
function CustomRulesBody({ init, readonly, live, roomMode, difficulty, grade, size, onApply }) {
  useData('config', 'bonds', 'bosses', 'stages', 'factions', 'assets', 'local');
  const [own, setWork] = useState(init);
  // read-only: what the room has now (its host may change it while this is open)
  const liveRules = useStore(() => (live ? live() : null));
  const work = readonly && liveRules ? sanitizeCustom(liveRules) : own;
  const [tab, setTabState] = useState(() => { const v = loadPref('customRules.tab', 'bonds'); return TABS.some((x) => x.id === v) ? v : 'bonds'; });
  const [renaming, setRenaming] = useState(/** @type {string | null} */ (null));
  const [paste, setPaste] = useState(/** @type {{ text: string, copy?: boolean } | null} */ (null));
  const store = useStore((/** @type {ReturnType<typeof customRulesStore.get>} */ s) => s, Object.is, customRulesStore);
  /** @param {string} v */
  const setTab = (v) => { setTabState(v); savePref('customRules.tab', v); };

  const solo = roomMode === 'solo';
  const config = data.get('config');
  const mode = getMode(modeIdFor(solo ? 'solo' : 'coop', difficulty, solo ? grade : null));
  const bans = officialBans(config, difficulty, size);
  const banLimits = customBanLimits(config);
  const base = { bans, rounds: Number.isInteger(mode?.lastRound) ? mode.lastRound : null };
  const diffs = customDiffs(work, base);
  /** @param {{ keys: string[] }} tb */
  const tabCount = (tb) => diffs.filter((d) => tb.keys.some((k) => d.startsWith(k))).length;
  const active = presetOf(store.active);
  const dirty = !!active && JSON.stringify(active.rules) !== JSON.stringify(work);

  /**
   * set(section, key, value) — every edit goes through sanitizeCustom
   * @param {RuleSection} sec
   * @param {string} k
   * @param {unknown} v
   */
  const set = (sec, k, v) => setWork((w) => sanitizeCustom({ ...w, [sec]: { ...w[sec], [k]: v } }));

  const close = closeCustomRules;
  const apply = () => {
    setDraft(work);
    try { onApply?.(work); } finally { close(); }
  };
  const save = () => {
    // @ts-expect-error 'ok' is not a toast kind (ui/toasts.js TOAST_KINDS): the toast shows as 'info'
    if (active) { savePreset(active.id, work); toast(t('已保存预设「{name}」', { name: active.name }), 'ok'); return; }
    newPreset();
  };
  const newPreset = (name = nextPresetName(t('预设'))) => {
    const id = addPreset(name, work);
    // @ts-expect-error 'ok' is not a toast kind (ui/toasts.js TOAST_KINDS): the toast shows as 'info'
    if (id) toast(t('已保存预设「{name}」', { name: presetOf(id)?.name ?? name }), 'ok');
    else toast(t('预设已满，请先删除不用的预设'), 'warn');
  };
  const remove = async () => {
    if (!active) return;
    const ok = await confirmDialog({ title: t('删除预设'), text: t('确定删除预设「{name}」吗？', { name: active.name }), okText: t('删除'), danger: true });
    if (ok) deletePreset(active.id);
  };
  /** @param {string} id */
  const pick = (id) => {
    const rules = selectPreset(id || null);
    if (rules) setWork(rules);
  };
  const copyCode = async () => {
    const code = await encodeCustomCode(work, data.season());
    // @ts-expect-error 'ok' is not a toast kind (ui/toasts.js TOAST_KINDS): the toast shows as 'info'
    if (await copyText(code)) toast(t('已复制规则代码'), 'ok');
    else setPaste({ text: code, copy: true });
  };
  const readCode = async () => {
    const r = await decodeCustomCode(paste?.text);
    if (!r.ok) { toast(t('无法读取这个规则代码'), 'error'); return; }
    // a code made in another season names its bonds, leaders, stages and types: keep what this season can use
    const { rules, dropped } = await fitToSeason(r.rules, r.season);
    setWork(rules);
    setPaste(null);
    if (r.newer) toast(t('已读取规则代码（来自更新的版本，本版本没有的设置保持官方值）'), 'warn');
    else if (dropped) toast(t('已读取规则代码（本赛季用不到的 {n} 项设置已去除）', { n: dropped }), 'warn');
    // @ts-expect-error 'ok' is not a toast kind (ui/toasts.js TOAST_KINDS): the toast shows as 'info'
    else toast(t('已读取规则代码'), 'ok');
  };
  const saveMine = () => newPreset(nextPresetName(t('房间规则')));

  const presetRow = readonly
    ? html`<div class="crx-presets">
        <span class="crx-ro">${t('由创建者设置 · 仅可查看')}</span>
        <span class="crx-presets__sp"></span>
        <span class="crx-diff" data-testid="custom-diff-count">${t('与官方不同的设置 {n} 项', { n: diffs.length })}</span>
        <${Button} variant="secondary" size="sm" icon="copy" onClick=${saveMine}>${t('保存为我的预设')}<//>
      </div>`
    : html`<div class="crx-presets">
        <span class="crx-presets__k">${t('预设')}</span>
        ${renaming != null
          ? html`<input class="crx-name" type="text" maxLength=${CUSTOM_NAME_MAX} value=${renaming} data-autofocus
              onInput=${(/** @type {InputEv} */ e) => setRenaming(e.target.value)}
              onKeyDown=${(/** @type {KeyboardEvent & InputEv} */ e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); } }}
              onBlur=${() => { if (active && renaming != null) renamePreset(active.id, renaming); setRenaming(null); }} />`
          : html`<select class="crx-select" value=${active ? active.id : ''} onChange=${(/** @type {Event & { target: HTMLSelectElement }} */ e) => pick(e.target.value)} data-testid="custom-preset-select">
              <option value="">${t('（未选择预设）')}</option>
              ${store.presets.map((p) => html`<option key=${p.id} value=${p.id}>${p.name}</option>`)}
            </select>`}
        <${Button} variant="secondary" size="sm" icon="check" class="crx-hi" onClick=${save}>${t('保存')}<//>
        <${Button} variant="secondary" size="sm" icon="plus" class="crx-wide" onClick=${() => newPreset()}>${t('新建预设')}<//>
        <${Button} variant="secondary" size="sm" icon="edit" class="crx-wide" disabled=${!active} onClick=${() => setRenaming(active?.name ?? '')}>${t('改名')}<//>
        <${Button} variant="secondary" size="sm" icon="trash" class="crx-wide crx-danger" disabled=${!active} onClick=${remove}>${t('删除')}<//>
        <span class="crx-presets__sp"></span>
        <span class="crx-diff" data-testid="custom-diff-count">${t('与官方不同的设置 {n} 项', { n: diffs.length })}${dirty ? html` · ${t('未保存')} <i class="crx-dot"></i>` : null}</span>
        <${Button} variant="secondary" size="sm" icon="copy" onClick=${copyCode}>${t('复制代码')}<//>
        <${Button} variant="secondary" size="sm" icon="paste" onClick=${() => setPaste({ text: '' })}>${t('粘贴代码')}<//>
      </div>`;

  const pasteRow = paste ? html`<div class="crx-paste">
      <textarea rows="2" class="num" readonly=${!!paste.copy} value=${paste.text} placeholder=${t('在此粘贴规则代码')} data-autofocus
        onInput=${(/** @type {Event & { target: HTMLTextAreaElement }} */ e) => setPaste({ text: e.target.value })} onFocus=${(/** @type {Event & { target: HTMLTextAreaElement }} */ e) => paste.copy && e.target.select()}></textarea>
      ${paste.copy ? html`<span class="crx-note">${t('无法自动复制，请手动复制上面的代码')}</span>`
        : html`<${Button} variant="primary" size="sm" icon="check" disabled=${!paste.text.trim()} onClick=${readCode}>${t('读取')}<//>`}
      <${Button} variant="secondary" size="sm" icon="close" onClick=${() => setPaste(null)}>${t('关闭窗口')}<//>
    </div>` : null;

  const ctx = { work, set, readonly, solo, mode, bans, banLimits, base, difficulty, size, config, setWork };
  const Pane = PANES[tab];

  const actions = readonly
    ? html`<span class="crx-foot__sp"></span><${Button} variant="primary" onClick=${close}>${t('关闭窗口')}<//>`
    : html`<${Button} variant="secondary" size="sm" icon="refresh" onClick=${() => setWork(CUSTOM_CASUAL)}>${t('设为休闲值')}<//>
      <${Button} variant="secondary" size="sm" icon="refresh" onClick=${() => setWork(CUSTOM_OFFICIAL)}>${t('设为官方值')}<//>
      <span class="crx-foot__sp"></span>
      <${Button} variant="secondary" onClick=${close}>${t('取消')}<//>
      <${Button} variant="primary" icon="check" onClick=${apply} data-testid="custom-apply">${t('应用此规则')}<//>`;

  return html`<${Modal} open=${true} title=${t('自定义规则')} micro="CUSTOM RULES" onClose=${close} class="crx" closeOnBackdrop=${false} actions=${actions}>
    ${presetRow}${pasteRow}
    <div class="crx-main">
      <nav class="crx-tabs" role="tablist">${TABS.map((tb) => {
        const n = tabCount(tb);
        return html`<button key=${tb.id} type="button" role="tab" aria-selected=${tab === tb.id ? 'true' : 'false'} data-tab=${tb.id}
          class=${cx('crx-tab', tab === tb.id && 'is-on')} onClick=${() => setTab(tb.id)}>
          <span>${t(tb.name)}<small>${tb.micro}</small></span>${n ? html`<b class="num">${n}</b>` : null}
        </button>`;
      })}</nav>
      <div class="crx-pane" role="tabpanel" data-pane=${tab}>${config ? html`<${Pane} ...${ctx} />` : null}</div>
    </div>
  <//>`;
}

// ---- tabs --------------------------------------------------------------------------------------------------------

/** @type {Readonly<Record<string, string>>} */
const PICK_LABELS = { random: N_('随机'), ban: N_('禁用'), allow: N_('允许') };

/** @param {PaneProps} p */
function BondsPane({ work, set, readonly, mode, bans, banLimits }) {
  const m = data.get('assets');
  const inactive = new Set(Array.isArray(mode?.inactiveBondIds) ? mode.inactiveBondIds : []);
  const all = data.list('bonds') || [];
  const core = all.filter((b) => b.isCore && b.weight > 0);
  const addon = all.filter((b) => !b.isCore && b.weight > 0);
  const fixed = all.filter((b) => !(b.weight > 0));
  const pick = work.bonds.pick;
  /**
   * @param {string} id
   * @param {string} v
   */
  const setPick = (id, v) => {
    const next = { ...pick };
    if (v === 'random') delete next[id]; else next[id] = v;
    set('bonds', 'pick', next);
  };
  /**
   * @param {Bag} b
   * @param {boolean} [lock]
   */
  const card = (b, lock) => {
    const v = lock ? null : pick[b.bondId] || 'random';
    const off = inactive.has(b.bondId);
    return html`<div key=${b.bondId} class=${cx('crx-bond', v === 'ban' && 'is-ban', v === 'allow' && 'is-allow', (lock || off) && 'is-lock')} data-bond=${b.bondId}>
      <${Img} src=${bondIconUrl(m, b.bondId)} class="crx-bond__i" />
      <span class="crx-bond__n">${b.name}</span>
      ${lock ? html`<span class="crx-official">${t('不参与抽取')}</span>`
        : off ? html`<span class="crx-official">${t('本难度未启用')}</span>`
        : html`<span class="crx-tri" role="radiogroup">${['random', 'ban', 'allow'].map((k) => html`<button key=${k} type="button" role="radio"
            aria-checked=${v === k ? 'true' : 'false'} class=${v === k ? `on-${k}` : ''} disabled=${readonly}
            onClick=${() => setPick(b.bondId, k)}>${t(PICK_LABELS[k])}</button>`)}</span>`}
    </div>`;
  };
  const nBan = Object.values(pick).filter((v) => v === 'ban').length;
  const nAllow = Object.values(pick).filter((v) => v === 'allow').length;
  const coreN = work.bonds.banCore ?? bans?.core ?? 0;
  const addonN = work.bonds.banAddon ?? bans?.addon ?? 0;
  return html`
    <${Sec} title=${t('盟约禁用抽取')} sub=${t('每局随机禁用的盟约数 — 只从设为「随机」的盟约中抽取')}>
      <${Row} label=${t('国家盟约（核心）随机禁用')} official=${t('难度默认 {n}', { n: bans?.core ?? 0 })}>
        <${Stepper} value=${coreN} min=${banLimits.core[0]} max=${banLimits.core[1]} disabled=${readonly} testid="custom-ban-core"
          onChange=${(/** @type {number} */ v) => set('bonds', 'banCore', v === (bans?.core ?? null) ? null : v)} />
      <//>
      <${Row} label=${t('职业·特性盟约（附加）随机禁用')} official=${t('难度默认 {n}', { n: bans?.addon ?? 0 })}>
        <${Stepper} value=${addonN} min=${banLimits.addon[0]} max=${banLimits.addon[1]} disabled=${readonly}
          onChange=${(/** @type {number} */ v) => set('bonds', 'banAddon', v === (bans?.addon ?? null) ? null : v)} />
      <//>
      <${Row} label=${t('解除盟约层数上限')} note=${t('官方规则下每个盟约最多 999 层 — 解除后没有上限')} official=${t('官方：{n}', { n: 999 })}>
        <${Switch} on=${work.bonds.noLayerCap} disabled=${readonly} onChange=${(/** @type {boolean} */ v) => set('bonds', 'noLayerCap', v)} />
      <//>
    <//>
    <${Sec} title=${t('逐个盟约设置')}>
      <div class="crx-legend"><span><i class="lg-r"></i>${t('随机：交给抽取')}</span><span><i class="lg-b"></i>${t('禁用：每局缺席')}</span><span><i class="lg-a"></i>${t('允许：不会被抽为缺席')}</span></div>
      <div class="crx-note">${t('国家盟约（核心）· {n}', { n: core.length })}</div>
      <div class="crx-bonds">${core.map((b) => card(b))}</div>
      <div class="crx-note">${t('职业·特性盟约（附加）· {n}', { n: addon.length })}</div>
      <div class="crx-bonds">${addon.map((b) => card(b))}</div>
      <div class="crx-note">${t('不参与官方抽取的盟约 · {n}', { n: fixed.length })}</div>
      <div class="crx-bonds">${fixed.map((b) => card(b, true))}</div>
      <div class="crx-note">${t('始终禁用 {b} · 始终允许 {a} · 随机 {r}（其中核心 {c} · 附加 {d} 个缺席）— 只有缺席盟约的干员不会出现在商店和自选中',
        { b: nBan, a: nAllow, r: core.length + addon.length - nBan - nAllow, c: coreN, d: addonN })}</div>
    <//>`;
}

/** @param {PaneProps} p */
function EnemiesPane({ work, set, readonly, mode }) {
  /**
   * @param {'enemies' | 'leaders'} sec
   * @param {string} k
   * @param {string} label
   * @param {string} [note]
   */
  const pct = (sec, k, label, note) => html`<${Row} label=${label} note=${note} official=${t('官方 100%')}>
    <${Stepper} value=${/** @type {Record<string, number>} */ (work[sec])[k]} min=${CUSTOM_LIMITS.pct[0]} max=${CUSTOM_LIMITS.pct[1]} step=${10} suffix="%" disabled=${readonly}
      testid=${`custom-${sec}-${k}`} onChange=${(/** @type {number} */ v) => set(sec, k, v)} />
  <//>`;
  // the multiplier per official step (maintainer decision 2026-11-15), the step rounds kept — null = the mode's own
  // (officialStep); the quick setups below only fill both (stepPreset)
  /**
   * @param {'stepHp' | 'stepAtk'} k
   * @param {'hp' | 'atk'} stat
   * @param {string} label
   * @param {string} note
   */
  const stepRow = (k, stat, label, note) => {
    const off = Math.round(officialStep(mode, stat) * 100);
    return html`<${Row} label=${label} note=${note} official=${t('官方 ×{n}', { n: (off / 100).toFixed(2) })}>
      <${Stepper} value=${work.enemies[k] ?? off} min=${CUSTOM_LIMITS.step[0]} max=${CUSTOM_LIMITS.step[1]} step=${1} prefix="×" scale=${100}
        disabled=${readonly} testid=${`custom-enemies-${k}`} onChange=${(/** @type {number} */ v) => set('enemies', k, v === off ? null : v)} />
    <//>`;
  };
  return html`
    <${Sec} title=${t('普通敌人')} sub=${t('含特训敌人、护卫、部件 · 各 {lo}% – {hi}%', { lo: CUSTOM_LIMITS.pct[0], hi: CUSTOM_LIMITS.pct[1] })}>
      ${pct('enemies', 'hp', t('生命值'))}
      ${pct('enemies', 'atk', t('攻击力'))}
      ${pct('enemies', 'def', t('防御力'))}
      ${pct('enemies', 'res', t('法术抗性'), t('乘以倍率后法术抗性也不超过 100'))}
      ${pct('enemies', 'speed', t('移动速度'))}
    <//>
    <${Sec} title=${t('敌方领袖')} sub=${t('最终攻势、隐秘核心的敌方领袖及其召唤物')}>
      ${pct('leaders', 'hp', t('生命值'), t('乘在共享生命值池（按人数）上'))}
      ${pct('leaders', 'atk', t('攻击力'))}
      ${pct('leaders', 'def', t('防御力'))}
      ${pct('leaders', 'res', t('法术抗性'))}
    <//>
    <${Sec} title=${t('逐回合能力成长')} sub=${t('以难度的官方曲线为基础 — 图表为生命值倍率')}>
      ${stepRow('stepHp', 'hp', t('生命值成长倍率'), t('官方表格每升一级时乘上的值 · ×{lo} – ×{hi} · ×1.00 则保持第 1 回合',
        { lo: (CUSTOM_LIMITS.step[0] / 100).toFixed(2), hi: (CUSTOM_LIMITS.step[1] / 100).toFixed(2) }))}
      ${stepRow('stepAtk', 'atk', t('攻击力成长倍率'), t('同一级时乘在攻击力上的值'))}
      <${StepPresets} work=${work} mode=${mode} readonly=${readonly} onPick=${(/** @type {StepPair} */ p) => { set('enemies', 'stepHp', p.stepHp); set('enemies', 'stepAtk', p.stepAtk); }} />
      <${CurveChart} work=${work} mode=${mode} />
    <//>`;
}

/** @typedef {{ stepHp: number | null, stepAtk: number | null }} StepPair */
/** @type {Readonly<Record<string, string>>} */
const STEP_PRESET_LABELS = { official: N_('官方'), gentle: N_('平缓'), steep: N_('陡峭'), flat: N_('持平') };

/**
 * The 快速设置 row under the step multipliers: each button fills both with its values for this difficulty (stepPreset)
 * and is lit while both are those; values set by hand light none. Its note lists what each fills in.
 * @param {{ work: Rules, mode: Bag | null, readonly: boolean, onPick: (p: StepPair) => void }} p
 */
function StepPresets({ work, mode, readonly, onPick }) {
  /** @param {'hp' | 'atk'} stat */
  const off = (stat) => Math.round(officialStep(mode, stat) * 100);
  /** @param {StepPair} p */
  const eff = (p) => [p.stepHp ?? off('hp'), p.stepAtk ?? off('atk')];
  const now = eff(work.enemies);
  const opts = ['official', ...Object.keys(CUSTOM_STEP_PRESETS)].map((v) => ({ v, label: t(STEP_PRESET_LABELS[v]), p: stepPreset(mode, v) }));
  const on = opts.find((o) => { const [h, a] = eff(o.p); return h === now[0] && a === now[1]; })?.v ?? '';
  /** @param {number} n */
  const x = (n) => `×${(n / 100).toFixed(2)}`;
  const note = opts.map((o) => { const [h, a] = eff(o.p); return `${o.label} ${x(h)} · ${x(a)}`; }).join(' · ');
  return html`<${Row} label=${t('快速配置')} note=${note}>
    <span class="crx-seg crx-seg--chips" role="group">${opts.map((o) => html`<button key=${o.v} type="button" aria-pressed=${o.v === on ? 'true' : 'false'}
      class=${o.v === on ? 'is-on' : ''} disabled=${readonly} data-testid=${`custom-steps-${o.v}`}
      onClick=${() => onPick(o.p)}>${o.label}</button>`)}</span>
  <//>`;
}

/**
 * The hp multiplier per round as the match spawns it (config.json enemyScale hp): the official line (dashed) and the
 * custom one (the steps × hp%, over the custom rounds) — left out while it is the official line itself (the official steps,
 * hp 100 %, the official round count: maintainer request 2026-10-18).
 * @param {{ work: Rules, mode: Bag | null }} p
 */
export function CurveChart({ work, mode }) {
  if (!mode) return null;
  const plan = customRoundPlan(mode, work.flow.rounds);
  const off = customRoundPlan(mode, null).rounds.map((r) => r.hp);
  const k1 = plan.rounds[0]?.kHp ?? 0;
  const oHp = officialStep(mode, 'hp');
  const sHp = work.enemies.stepHp != null ? work.enemies.stepHp / 100 : oHp;
  const cus = plan.rounds.map((r) => (work.enemies.hp / 100) * stepScale(r.hp, r.kHp, k1, sHp, oHp));
  const same = cus.length === off.length && cus.every((v, i) => Math.abs(v - off[i]) < 1e-9);
  const W = 1000, H = 220, P = 40;
  const nX = Math.max(off.length, cus.length);
  const maxY = Math.max(1.5, ...off, ...cus) * 1.08;
  /** @param {number} i */
  const x = (i) => P + (nX > 1 ? (i * (W - 2 * P)) / (nX - 1) : 0);
  /** @param {number} v */
  const y = (v) => H - P + 6 - (v / maxY) * (H - 2 * P);
  /** @param {number[]} arr */
  const pts = (arr) => arr.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const gridStep = maxY > 12 ? Math.ceil(maxY / 6) : maxY > 6 ? 2 : 1;
  const grid = [];
  for (let g = gridStep; g < maxY; g += gridStep) grid.push(g);
  return html`<svg class="crx-chart" viewBox=${`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label=${t('成长曲线')}>
    ${grid.map((g) => html`<line key=${`g${g}`} x1=${P} x2=${W - P} y1=${y(g)} y2=${y(g)} class="crx-chart__grid" /><text key=${`t${g}`} x=${P - 8} y=${y(g) + 4} text-anchor="end">×${g}</text>`)}
    ${Array.from({ length: nX }, (_, i) => html`<text key=${`x${i}`} x=${x(i)} y=${H - 6} text-anchor="middle">${i + 1}</text>`)}
    <polyline points=${pts(off)} class="crx-chart__off" />
    ${same ? null : html`<polyline points=${pts(cus)} class="crx-chart__cus" />
    <text x=${W - P} y=${P - 6} text-anchor="end" class="crx-chart__lc">${t('自定义')}</text>`}
    <text x=${W - P} y=${P + 14} text-anchor="end">${t('官方')}</text>
  </svg>`;
}

/** @type {Readonly<Record<string, string>>} */
const TYPE_PICK_LABELS = { random: N_('随机'), ban: N_('禁用'), force: N_('固定'), out: N_('不加入'), allow: N_('随机') };
/**
 * a type's order on screen: the season's own (sortId), then its id
 * @param {Bag} a
 * @param {Bag} b
 */
const typeOrder = (a, b) => (a.sortId ?? 9) - (b.sortId ?? 9) || String(a.type).localeCompare(String(b.type));
/**
 * a type's name without the 「特训敌人·」 every one starts with (as the briefing shows them)
 * @param {Bag | null | undefined} ty
 */
const typeName = (ty) => (ty?.name || '').replace(t('特训敌人·'), '');

/**
 * 敌人类型 (maintainer decision 2026-11-15): how many 特训敌人 types a match draws (types.count, 0–5, official 3) and for
 * each type of the season's draw (factions.json types with involveRandom) 随机 / 禁用 / 固定 (types.pick) — the match
 * draws them with shared/ruleset.js customEnemyTypes.
 * @param {PaneProps} p
 */
function TypesPane({ work, set, readonly }) {
  const m = data.get('assets');
  // the season's own draw (a type the room borrows is in the data too: `borrowed`, listed below with its season)
  const types = Object.values(data.get('factions')?.types || {}).filter((ty) => ty && ty.involveRandom && !ty.borrowed).sort(typeOrder);
  const pick = work.types.pick;
  /**
   * @param {string} id
   * @param {string} v
   */
  const setPick = (id, v) => {
    const next = { ...pick };
    if (v === 'random' || v === 'out') delete next[id]; else next[id] = v;
    set('types', 'pick', next);
  };
  const ids = new Set(types.map((ty) => ty.type));
  // other seasons' types (maintainer decision 2026-11-15, shared/seasonBorrow.js): out by default, 'allow' joins the draw
  const lenders = borrowSeasons(data.season()).map((sid) => {
    const st = data.seasonStore(sid);
    st?.load('factions');
    return { sid, list: Object.values(st?.get('factions')?.types || {}).filter((ty) => lendableType(ty) && !ids.has(ty.type)).sort(typeOrder) };
  }).filter((x) => x.list.length);
  const lentIds = new Set(lenders.flatMap((x) => x.list.map((ty) => ty.type)));
  const nForce = Object.entries(pick).filter(([k, v]) => v === 'force' && ids.has(k)).length;
  const nBan = Object.entries(pick).filter(([k, v]) => v === 'ban' && ids.has(k)).length;
  const nLentForce = Object.entries(pick).filter(([k, v]) => v === 'force' && lentIds.has(k)).length;
  const nLentAllow = Object.entries(pick).filter(([k, v]) => v === 'allow' && lentIds.has(k)).length;
  const count = work.types.count ?? OFFICIAL_TYPE_COUNT;
  const drawn = Math.min(CUSTOM_LIMITS.types[1], Math.max(count, nForce + nLentForce));
  /**
   * @param {Bag} ty
   * @param {string} sid
   */
  const lentCard = (ty, sid) => {
    const v = pick[ty.type] === 'force' || pick[ty.type] === 'allow' ? pick[ty.type] : 'out';
    return html`<div key=${ty.type} class=${cx('crx-bond', v === 'out' && 'is-out', v === 'force' && 'is-allow')} data-type=${ty.type} title=${ty.desc || ''}>
      <${Img} src=${lentTypeIconUrl(m, data.get('local'), sid, ty.icon)} class="crx-bond__i crx-type__i" />
      <span class="crx-bond__n">${typeName(ty)}</span>
      <span class="crx-tri" role="radiogroup">${['out', 'allow', 'force'].map((k) => html`<button key=${k} type="button" role="radio"
          aria-checked=${v === k ? 'true' : 'false'} class=${v === k ? `on-${k === 'force' ? 'allow' : k === 'out' ? 'ban' : 'random'}` : ''} disabled=${readonly}
          onClick=${() => setPick(ty.type, k)}>${t(TYPE_PICK_LABELS[k])}</button>`)}</span>
    </div>`;
  };
  return html`
    <${Sec} title=${t('特训敌人类型')} sub=${t('每局抽取的类型 — 即简报中显示的类型')}>
      <${Row} label=${t('每局抽取的类型数')} official=${t('官方 {n}', { n: OFFICIAL_TYPE_COUNT })}
          note=${t('{lo} – {hi} · 每种类型占 15 个回合中的 3 个，其余回合为「特异」', { lo: CUSTOM_LIMITS.types[0], hi: CUSTOM_LIMITS.types[1] })}>
        <${Stepper} value=${count} min=${CUSTOM_LIMITS.types[0]} max=${CUSTOM_LIMITS.types[1]} disabled=${readonly} testid="custom-type-count"
          onChange=${(/** @type {number} */ v) => set('types', 'count', v === OFFICIAL_TYPE_COUNT ? null : v)} />
      <//>
      <div class="crx-legend"><span><i class="lg-r"></i>${t('随机：交给抽取')}</span><span><i class="lg-b"></i>${t('禁用：不会出现')}</span><span><i class="lg-a"></i>${t('固定：每局出现')}</span></div>
      <div class="crx-note">${t('参与抽取的类型 · {n}', { n: types.length })}</div>
      <div class="crx-bonds crx-types">${types.map((ty) => {
        const v = pick[ty.type] || 'random';
        return html`<div key=${ty.type} class=${cx('crx-bond', v === 'ban' && 'is-ban', v === 'force' && 'is-allow')} data-type=${ty.type} title=${ty.desc || ''}>
          <${Img} src=${factionIconUrl(m, ty.icon)} class="crx-bond__i crx-type__i" />
          <span class="crx-bond__n">${typeName(ty)}</span>
          <span class="crx-tri" role="radiogroup">${['random', 'ban', 'force'].map((k) => html`<button key=${k} type="button" role="radio"
              aria-checked=${v === k ? 'true' : 'false'} class=${v === k ? `on-${k === 'force' ? 'allow' : k}` : ''} disabled=${readonly}
              onClick=${() => setPick(ty.type, k)}>${t(TYPE_PICK_LABELS[k])}</button>`)}</span>
        </div>`;
      })}</div>
      <div class="crx-note" data-testid="custom-type-note">${t('固定 {f} · 禁用 {b} · 随机 {r} — 每局 {n} 种：先放入固定类型，其余从随机类型中抽取；固定类型多于类型数时，类型数随之增加',
        { f: nForce + nLentForce, b: nBan, r: types.length - nForce - nBan + nLentAllow, n: drawn })}</div>
    <//>
    ${lenders.map(({ sid, list }) => html`<${Sec} key=${sid} title=${t('其他赛季的特训敌人类型 · {season}', { season: t(seasonInfo(sid).name) })}
        sub=${t('加入本局的抽取 — 本赛季没有的敌人按该赛季的数据出现 · 官方：没有')}>
      <div class="crx-legend"><span><i class="lg-b"></i>${t('不加入：不会出现（默认）')}</span><span><i class="lg-r"></i>${t('随机：加入抽取')}</span><span><i class="lg-a"></i>${t('固定：每局出现')}</span></div>
      <div class="crx-bonds crx-types" data-testid=${`custom-lent-types-${sid}`}>${list.map((ty) => lentCard(ty, sid))}</div>
    <//>`)}`;
}

/** @param {Bag} a @param {Bag} b */
const bossOrder = (a, b) => (a.sortId ?? 99) - (b.sortId ?? 99) || String(a.bossId).localeCompare(String(b.bossId));

/** @param {PaneProps} p */
function BossesPane({ work, set, setWork, readonly, mode }) {
  const m = data.get('assets');
  // the season's own leaders (a leader the room borrows is in the data too: `borrowed`, listed below with its season)
  const all = (data.list('bosses') || []).filter((/** @type {Bag} */ b) => !b.borrowed);
  const ban = new Set(work.bosses.ban);
  const extra = new Set(work.bosses.extra);
  /** @param {boolean} hidden */
  const weights = (hidden) => (hidden ? mode?.hiddenBossWeights : mode?.bossWeights) || {};
  /** @param {Bag} b */
  const inMode = (b) => (weights(b.hidden)[b.bossId] ?? 0) > 0;
  /** whether the difficulty draws the group at all (no 隐秘核心 in some) @param {boolean} hidden */
  const groupOn = (hidden) => Object.values(weights(hidden)).some((v) => Number(v) > 0);
  // other seasons' leaders (maintainer request 2026-11-25, shared/seasonBorrow.js): a click adds one to its group's draw
  const ownIds = new Set(all.map((b) => b.bossId));
  const lenders = borrowSeasons(data.season()).map((sid) => {
    const st = data.seasonStore(sid);
    st?.load('bosses');
    return { sid, list: (st?.list('bosses') || []).filter((/** @type {Bag} */ b) => lendableBoss(b) && !ownIds.has(b.bossId)).sort(bossOrder) };
  }).filter((x) => x.list.length);
  const lentHidden = new Map(lenders.flatMap((x) => x.list.map((/** @type {Bag} */ b) => /** @type {[string, boolean]} */ ([b.bossId, !!b.hidden]))));
  /** the leaders a group still draws: its own in the difficulty not banned, and the borrowed ones added @param {boolean} hidden */
  const left = (hidden) => all.filter((x) => !!x.hidden === hidden && inMode(x) && !ban.has(x.bossId)).length
    + (groupOn(hidden) ? [...extra].filter((id) => lentHidden.get(id) === hidden).length : 0);
  /** @param {Bag} b */
  const toggle = (b) => {
    if (!ban.has(b.bossId) && inMode(b) && left(!!b.hidden) <= 1) {
      toast(t('至少要保留一名敌方领袖'), 'warn');
      return;
    }
    const next = new Set(ban);
    if (next.has(b.bossId)) next.delete(b.bossId); else next.add(b.bossId);
    set('bosses', 'ban', [...next]);
  };
  /** @param {Bag} b */
  const toggleExtra = (b) => {
    if (extra.has(b.bossId) && groupOn(!!b.hidden) && left(!!b.hidden) <= 1) { toast(t('至少要保留一名敌方领袖'), 'warn'); return; }
    const next = new Set(extra);
    if (next.has(b.bossId)) next.delete(b.bossId); else next.add(b.bossId);
    set('bosses', 'extra', [...next]);
  };
  /** @param {Bag} b */
  const lentCard = (b) => {
    const on = extra.has(b.bossId);
    const off = !groupOn(!!b.hidden);
    return html`<button key=${b.bossId} type="button" class=${cx('crx-boss', (!on || off) && 'is-off')} disabled=${readonly}
        data-boss=${b.bossId} aria-pressed=${on ? 'true' : 'false'} onClick=${() => toggleExtra(b)}>
      <${Img} src=${enemyIconUrl(m, b.enemyKey)} class="crx-boss__i" />
      <span class="crx-boss__n">${b.name}</span>
      <span class="crx-boss__s">${off ? t('本难度没有') : on ? t('加入') : t('不加入')}</span>
    </button>`;
  };
  /** @param {Bag} b */
  const card = (b) => {
    const isBan = ban.has(b.bossId);
    const off = !inMode(b);
    return html`<button key=${b.bossId} type="button" class=${cx('crx-boss', isBan && 'is-ban', off && 'is-off')} disabled=${readonly}
        data-boss=${b.bossId} aria-pressed=${isBan ? 'true' : 'false'} onClick=${() => toggle(b)}>
      <${Img} src=${enemyIconUrl(m, b.enemyKey)} class="crx-boss__i" />
      <span class="crx-boss__n">${b.name}</span>
      <span class="crx-boss__s">${off ? t('本难度没有') : isBan ? t('禁用') : t('出场')}</span>
    </button>`;
  };
  const finals = all.filter((b) => !b.hidden);
  const hiddens = all.filter((b) => b.hidden);
  const hasHidden = Object.keys(mode?.hiddenBossWeights || {}).length > 0;
  const modes = [{ v: 'void', label: t('无效（官方）') }, { v: 'clamp', label: t('按上限计算') }, { v: 'none', label: t('不限制') }];
  return html`
    <${Sec} title=${t('最终攻势敌方领袖')} sub=${t('禁用的领袖不会被抽到 — 至少保留 1 名 · 其余按官方权重抽取')}>
      <div class="crx-bosses">${finals.map(card)}</div>
    <//>
    <${Sec} title=${t('隐秘核心领袖')} sub=${hasHidden ? t('同样的规则') : t('本难度没有隐秘核心')}>
      <div class="crx-bosses">${hiddens.map(card)}</div>
    <//>
    ${lenders.map(({ sid, list }) => html`<${Sec} key=${sid} title=${t('其他赛季的敌方领袖 · {season}', { season: t(seasonInfo(sid).name) })}
        sub=${t('点击加入同组的抽取 — 按本赛季该组最高的权重抽取 · 官方：没有')}>
      ${[[false, t('最终攻势敌方领袖')], [true, t('隐秘核心领袖')]].map(([hidden, label]) => {
        const group = list.filter((/** @type {Bag} */ b) => !!b.hidden === hidden);
        return group.length ? html`<div key=${String(hidden)} class="crx-note">${label}</div>
          <div class="crx-bosses" data-testid=${`custom-lent-bosses-${sid}-${hidden ? 'hidden' : 'final'}`}>${group.map(lentCard)}</div>` : null;
      })}
    <//>`)}
    <${Sec} title=${t('领袖限伤')} sub=${t('对敌方领袖单次造成的伤害')}>
      <${Row} label=${t('超过上限的一击')} note=${t('官方：达到上限的一击整个无效 · 按上限计算：只计上限的伤害（与休闲规则相同）')}>
        <${Seg} options=${modes} value=${work.bosses.hitMode} disabled=${readonly} onChange=${(/** @type {string} */ v) => setWork((w) => sanitizeCustom({ ...w, bosses: { ...w.bosses, hitMode: v } }))} />
      <//>
      <${Row} label=${t('上限值')} official=${t('官方 {n}', { n: fmt(CUSTOM_OFFICIAL.bosses.hitLimit) })}
          note=${t('{lo} – {hi} · 更高请选「不限制」', { lo: fmt(CUSTOM_LIMITS.hitLimit[0]), hi: fmt(CUSTOM_LIMITS.hitLimit[1]) })} locked=${work.bosses.hitMode === 'none'}>
        <${Stepper} value=${work.bosses.hitLimit} min=${CUSTOM_LIMITS.hitLimit[0]} max=${CUSTOM_LIMITS.hitLimit[1]} step=${100000} wide=${true}
          disabled=${readonly || work.bosses.hitMode === 'none'} onChange=${(/** @type {number} */ v) => set('bosses', 'hitLimit', v)} />
      <//>
    <//>`;
}

/**
 * The stages of this season, and the 上半 ones the sim has when 「收录上半战场」 is on (CUSTOM_FIRST_HALF_STAGES: 战场#06;
 * #05 and #07 wait for their mechanics, maintainer decision 2026-10-18).
 * @param {Bag} s
 * @param {boolean} firstHalf
 */
const stageShown = (s, firstHalf) => !s.kind && !s.borrowed && (s.active !== false || Number(s.weight) > 0 || (firstHalf && CUSTOM_FIRST_HALF_STAGES.includes(s.id)));

/** @param {PaneProps} p */
function StagesPane({ work, set, setWork, readonly, mode }) {
  const all = (data.list('stages') || []).filter((s) => stageShown(s, work.stages.firstHalf));
  // the season's own stages (a borrowed record is another season's): the pool takes them only through the mode and the
  // 上半 switch (customStagePool), as the server's draw does
  const ownRaw = Object.values(data.getRaw('stages') || {}).filter((s) => s && !s.kind && !s.borrowed);
  /** @param {string} id */
  const ownStage = (id) => { const s = data.getRaw('stages')?.[id]; return !!s && !s.borrowed; };
  const pool = new Set(customStagePool(mode?.stages, work, ownStage));
  // switching the 上半 stages off drops their bans with them (a ban of a stage the pool lacks means nothing)
  /** @param {boolean} v */
  const setFirstHalf = (v) => setWork((w) => sanitizeCustom({ ...w, stages: { ...w.stages, firstHalf: v, ban: v ? w.stages.ban : w.stages.ban.filter((id) => !CUSTOM_FIRST_HALF_STAGES.includes(id)) } }));
  const firstNames = CUSTOM_FIRST_HALF_STAGES.map((id) => data.get('stages')?.[id]?.name ?? id).join(t('、'));
  // 收录上半战场 adds the 盟约 上半 stages: a season whose data has none of them (规程) shows neither the switch nor the tags
  const hasFirstHalf = CUSTOM_FIRST_HALF_STAGES.some((id) => data.get('stages')?.[id]);
  // 规程's official briefing shows the battlefield anyway (seasonOfficialOptions): the switch stands on, locked
  const infoAlways = !!seasonOfficialOptions(data.season()).battlefieldInfo;
  const ban = new Set(work.stages.ban);
  const used = [...pool].filter((id) => !ban.has(id)).length;
  /** @param {Bag} s */
  const toggle = (s) => {
    if (!ban.has(s.id) && pool.has(s.id) && used <= 1) { toast(t('至少要保留一张战场'), 'warn'); return; }
    const next = new Set(ban);
    if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
    set('stages', 'ban', [...next]);
  };
  /** @param {Bag} s */
  const half = (s) => (/^act1/.test(s.id) ? t('上半') : t('下半'));
  // other seasons' stages (maintainer decision 2026-11-15, shared/seasonBorrow.js): a click adds one to the pool; one that
  // plays as an own field (sameField: 规程 m01–m04 / m06 = 盟约 战场#01–#04 / #06(下半)) is left out (the raw records:
  // the localized ones differ in their names)
  const ownIds = new Set(ownRaw.map((s) => s.id));
  const lenders = borrowSeasons(data.season()).map((sid) => {
    const st = data.seasonStore(sid);
    st?.load('stages');
    const raw = st?.getRaw('stages') || {};
    return { sid, list: (st?.list('stages') || []).filter((/** @type {Bag} */ s) => lendableStage(s, CUSTOM_FIRST_HALF_STAGES) && !ownIds.has(s.id)
      && !ownRaw.some((o) => sameField(o, raw[s.id]))) };
  }).filter((x) => x.list.length);
  const extra = new Set(work.stages.extra);
  /** @param {Bag} s */
  const toggleExtra = (s) => {
    if (extra.has(s.id) && !ban.has(s.id) && used <= 1) { toast(t('至少要保留一张战场'), 'warn'); return; }
    const next = new Set(extra);
    if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
    setWork((w) => sanitizeCustom({ ...w, stages: { ...w.stages, extra: [...next], ban: w.stages.ban.filter((id) => id !== s.id) } }));
  };
  // 盟约's stages keep their 上半 / 下半 tag wherever they are listed
  /**
   * @param {string} _sid
   * @param {Bag} s
   */
  const lentHalf = (_sid, s) => (/^act[12]autochess_/.test(s.id) ? half(s) : null);
  return html`
    <${Sec} title=${t('简报')}>
      <${Row} label=${t('战场信息预览')} note=${infoAlways ? t('本赛季的官方简报始终显示战场') : t('简报中显示本局战场的名称和预览图（关闭时为「未知战场」）')}
          official=${infoAlways ? t('官方：开启') : t('官方：关闭')} locked=${infoAlways}>
        <${Switch} on=${infoAlways || work.stages.info} disabled=${readonly || infoAlways} testid="custom-stage-info" onChange=${(/** @type {boolean} */ v) => set('stages', 'info', v)} />
      <//>
      <${Row} label=${t('简报「重新抽取」')} note=${t('全员同意时重新抽取战场、领袖和缺席盟约')} official=${t('官方：没有')}>
        <${Switch} on=${work.stages.reroll} disabled=${readonly} onChange=${(/** @type {boolean} */ v) => set('stages', 'reroll', v)} />
      <//>
    <//>
    ${hasFirstHalf ? html`<${Sec} title=${t('上半战场')}>
      <${Row} label=${t('收录上半战场')} note=${t('{names} 加入战场池（与战场#01 同权重）', { names: firstNames })} official=${t('官方：关闭')}>
        <${Switch} on=${work.stages.firstHalf} disabled=${readonly} testid="custom-stage-first-half" onChange=${setFirstHalf} />
      <//>
    <//>` : null}
    <${Sec} title=${t('战场池')} sub=${t('使用 {n} / {total} — 点击图片禁用 · 至少保留 1 张', { n: used, total: pool.size })}>
      <div class="crx-stages">${all.map((s) => {
        const off = !pool.has(s.id);
        const isBan = ban.has(s.id);
        return html`<button key=${s.id} type="button" class=${cx('crx-stage', isBan && 'is-ban', off && 'is-off')} disabled=${readonly}
            data-stage=${s.id} aria-pressed=${isBan ? 'true' : 'false'} onClick=${() => toggle(s)}>
          <${Img} src=${localAsset('stage/preview', s.id)} class="crx-stage__i" fallback=${html`<span class="crx-stage__i crx-stage__none"></span>`} />
          ${isBan ? html`<span class="crx-stage__flag is-ban">${t('禁用')}</span>` : off ? html`<span class="crx-stage__flag">${t('本难度没有')}</span>` : null}
          <span class="crx-stage__n"><span>${s.name}</span>${hasFirstHalf ? html`<span class="crx-stage__tag">${half(s)}</span>` : null}</span>
        </button>`;
      })}</div>
    <//>
    ${lenders.map(({ sid, list }) => html`<${Sec} key=${sid} title=${t('其他赛季的战场 · {season}', { season: t(seasonInfo(sid).name) })}
        sub=${t('点击加入本局的战场池 — 与本赛季的战场同权重抽取 · 官方：没有')}>
      <div class="crx-stages" data-testid=${`custom-lent-stages-${sid}`}>${list.map((/** @type {Bag} */ s) => {
        const on = extra.has(s.id);
        return html`<button key=${s.id} type="button" class=${cx('crx-stage', !on && 'is-off')} disabled=${readonly}
            data-stage=${s.id} aria-pressed=${on ? 'true' : 'false'} onClick=${() => toggleExtra(s)}>
          <${Img} src=${localAsset('stage/preview', s.id)} class="crx-stage__i" fallback=${html`<span class="crx-stage__i crx-stage__none"></span>`} />
          <span class=${cx('crx-stage__flag', on && 'is-add')}>${on ? t('加入') : t('不加入')}</span>
          <span class="crx-stage__n"><span>${s.name}</span>${lentHalf(sid, s) ? html`<span class="crx-stage__tag">${lentHalf(sid, s)}</span>` : null}</span>
        </button>`;
      })}</div>
    <//>`)}`;
}


/** @param {PaneProps} p */
function FlowPane({ work, set, readonly, solo, mode, base, size, config }) {
  const official = base.rounds ?? 14;
  const n = work.flow.rounds ?? official;
  const plan = mode ? customRoundPlan(mode, work.flow.rounds) : { rounds: [], hidden: null };
  /** @param {number} src */
  const prepOf = (src) => mode?.rounds?.[src]?.prepTime ?? null;
  // the prep table: the first round of each official prep length, then the final assault
  const cols = [];
  /** @type {number | null} */
  let last = null;
  plan.rounds.forEach((r, i) => {
    const p = prepOf(r.src);
    if (r.kind === 'boss' || p == null || p === last) return;
    last = p;
    cols.push({ label: String(i + 1), p });
  });
  const boss = plan.rounds.find((r) => r.kind === 'boss');
  if (boss && prepOf(boss.src) != null) cols.push({ label: t('最终攻势'), p: prepOf(boss.src) });
  /** @param {number | null} p */
  const custom = (p) => customPrepSeconds(work.flow, p);
  const preps = [{ v: 'official', label: t('官方') }, { v: 'x1.5', label: '×1.5' }, { v: 'x2', label: '×2' }, { v: 'fixed', label: t('固定秒数') }];
  return html`
    <${Sec} title=${t('回合')} sub=${t('增加时在最终攻势前加入轮换后期波次的追加回合，减少时先去掉敌人能力相同的中期普通回合')}>
      <${Row} label=${t('回合数')} note=${t('{lo} – {hi} · 追加回合的敌人能力按成长曲线继续提升 [推定]', { lo: CUSTOM_LIMITS.rounds[0], hi: CUSTOM_LIMITS.rounds[1] })}
          official=${t('官方 {n}', { n: official })}>
        <${Stepper} value=${n} min=${CUSTOM_LIMITS.rounds[0]} max=${CUSTOM_LIMITS.rounds[1]} disabled=${readonly} testid="custom-rounds"
          onChange=${(/** @type {number} */ v) => set('flow', 'rounds', v === official ? null : v)} />
      <//>
      <div class="crx-rounds" data-testid="custom-round-strip">
        ${plan.rounds.map((r, i) => html`<span key=${i} class=${`k-${r.kind}`}>${r.kind === 'boss' ? html`${i + 1} ${t('最终攻势')}` : i + 1}${r.src !== i + 1 && r.kind !== 'boss' ? html`<small>←${r.src}</small>` : null}</span>`)}
        ${plan.hidden ? html`<span class="k-hidden">${plan.rounds.length + 1} ${t('隐秘核心')}</span>` : null}
      </div>
      <div class="crx-legend"><span><i class="lg-sp"></i>${t('机变回合')}</span><span><i class="lg-boss"></i>${t('最终攻势')}</span>
        ${plan.hidden ? html`<span><i class="lg-hid"></i>${t('隐秘核心（满足条件时）')}</span>` : null}<span><i class="lg-ext"></i>${t('追加回合（←原波次）')}</span></div>
    <//>
    <${Sec} title=${t('休整期')} sub=${solo ? t('仅同盟 — 独立模拟按官方规则不限时') : t('仅同盟')}>
      <${Row} label=${t('休整期时长')} locked=${solo}>
        <${Seg} options=${preps} value=${work.flow.prep} disabled=${readonly || solo} onChange=${(/** @type {string} */ v) => set('flow', 'prep', v)} />
      <//>
      ${work.flow.prep === 'fixed' ? html`<${Row} label=${t('每回合秒数')} locked=${solo}>
        <${Stepper} value=${work.flow.prepSec} min=${CUSTOM_LIMITS.prepSec[0]} max=${CUSTOM_LIMITS.prepSec[1]} step=${5} suffix=${t('秒')}
          disabled=${readonly || solo} onChange=${(/** @type {number} */ v) => set('flow', 'prepSec', v)} />
      <//>` : null}
      ${!solo && cols.length ? html`<div class="crx-ptable" style=${`--cols:${cols.length}`}>
        <span class="k">${t('回合')}</span>${cols.map((c, i) => html`<span key=${`r${i}`}>${c.label}</span>`)}
        <span class="k">${t('官方')}</span>${cols.map((c, i) => html`<span key=${`o${i}`}>${t('{n} 秒', { n: c.p })}</span>`)}
        <span class="k">${t('自定义')}</span>${cols.map((c, i) => html`<span key=${`c${i}`} class="v">${t('{n} 秒', { n: custom(c.p) })}</span>`)}
      </div>` : null}
    <//>
    <${Sec} title=${t('目标生命值')} sub=${t('仅同盟')}>
      <${Row} label=${t('解除每回合目标生命值减少上限')} note=${t('官方：一回合最多减少 10 — 解除后漏怪多少就减少多少')} official=${t('官方：{n}', { n: 10 })} locked=${solo}>
        <${Switch} on=${work.flow.lpCapOff} disabled=${readonly || solo} onChange=${(/** @type {boolean} */ v) => set('flow', 'lpCapOff', v)} />
      <//>
      <${Row} label=${t('所有回合共享目标生命值')} note=${t('像最终攻势一样，整个同盟共用一个目标生命值（初始值之和）— 不会单独淘汰，归零时全员失败')}
          official=${t('官方：仅最终攻势')} locked=${solo}>
        <${Switch} on=${work.flow.lpShared} disabled=${readonly || solo} onChange=${(/** @type {boolean} */ v) => set('flow', 'lpShared', v)} />
      <//>
    <//>
    ${solo ? null : html`<${Sec} title=${t('策略')}>
      <${Row} label=${t('允许重复选择策略')} note=${t('队友已选的策略也可以选择 — 全队只生效一次的策略（如外勤医疗）多人选择也不会叠加')}
          official=${t('官方：不能重复')}>
        <${Switch} on=${work.flow.bandDup} disabled=${readonly} onChange=${(/** @type {boolean} */ v) => set('flow', 'bandDup', v)} />
      <//>
    <//>`}
    <${PoolSec} work=${work} set=${set} readonly=${readonly} solo=${solo} size=${size} config=${config} />
    <${Sec} title=${t('其他便利功能')} sub=${t('休闲规则的项目')}>
      <${Row} label=${t('移动型领袖路线预览')} note=${t('最终攻势休整期中敌方领袖将要走的路线')} official=${t('官方：没有')}>
        <${Switch} on=${work.flow.routePreview} disabled=${readonly} onChange=${(/** @type {boolean} */ v) => set('flow', 'routePreview', v)} />
      <//>
    <//>`;
}

/**
 * The shop pool sizes (pool.chess / pool.items): two percents and the per-tier counts they give in a room of this size —
 * the official count already holds the room's multiplier (server/match/gamedata.js poolCopies / itemPoolCopies).
 * @param {Pick<PaneProps, 'work' | 'set' | 'readonly' | 'solo' | 'size' | 'config'>} p
 */
function PoolSec({ work, set, readonly, solo, size, config }) {
  const eco = config?.economy || {};
  const big = !solo && size === LARGE_SEATS ? config?.eightPlayer || {} : null;
  const chessMul = solo ? 1 : (big?.coopPoolMultiplier || eco.coopPoolMultiplier || 1);
  const itemMul = big?.itemPoolMultiplier || 1;
  const tiers = [1, 2, 3, 4, 5, 6];
  const chess = tiers.map((k) => (eco.poolCopies?.[k] ?? 0) * chessMul);
  const items = tiers.map((k) => (eco.itemPoolCopies?.[k] ?? 0) * itemMul);
  const who = solo ? t('独立模拟') : t('{n} 人同盟', { n: size === LARGE_SEATS ? LARGE_SEATS : 4 });
  /**
   * @param {'chess' | 'items'} k
   * @param {string} label
   * @param {string} note
   */
  const pct = (k, label, note) => html`<${Row} label=${label} note=${note} official=${t('官方 100%')}>
    <${Stepper} value=${work.pool[k]} min=${CUSTOM_LIMITS.pct[0]} max=${CUSTOM_LIMITS.pct[1]} step=${10} suffix="%" disabled=${readonly}
      testid=${`custom-pool-${k}`} onChange=${(/** @type {number} */ v) => set('pool', k, v)} />
  <//>`;
  /**
   * @param {string} label
   * @param {unknown[]} list
   */
  const row = (label, list, cls = '') => html`<span class="k">${label}</span>${list.map((n, i) => html`<span key=${i} class=${cls}>${n}</span>`)}`;
  return html`<${Sec} title=${t('商店卡池')} sub=${t('当前人数的官方数量乘以百分比 — 干员：同盟为独立模拟的 ×2、8 人同盟 ×4；装备：8 人同盟 ×2')}>
    ${pct('chess', t('干员卡池'), t('每名干员在共享卡池中的张数（自选干员的个人库存也一样）'))}
    ${pct('items', t('装备库存'), t('每件商店装备全队同时持有的上限'))}
    <div class="crx-note">${t('{who}的每阶数量 — 部分干员和装备的官方数量与本阶不同，同样按比例增减', { who })}</div>
    <div class="crx-ptable" style="--cols:6" data-testid="custom-pool-table">
      ${row(t('阶级'), tiers.map((k) => html`<${Roman} n=${k} />`))}
      ${row(t('干员（官方）'), chess)}
      ${row(t('干员（自定义）'), chess.map((n) => customPoolCount(n, work.pool.chess)), 'v')}
      ${row(t('装备（官方）'), items)}
      ${row(t('装备（自定义）'), items.map((n) => customPoolCount(n, work.pool.items)), 'v')}
    </div>
  <//>`;
}

/** @type {Readonly<Record<string, (p: PaneProps) => unknown>>} */
const PANES = { bonds: BondsPane, enemies: EnemiesPane, types: TypesPane, bosses: BossesPane, stages: StagesPane, flow: FlowPane };

/** The tabs' names, for tests. */
export const CUSTOM_TABS = Object.freeze(TABS.map((x) => x.id));
