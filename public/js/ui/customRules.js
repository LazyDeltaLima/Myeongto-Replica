// 커스텀 규칙 설정 창 (maintainer decisions 2026-10-18): the settings of the custom 규칙 모드 — five tabs (盟约 · 敌人能力
// · 领袖 · 战场 · 进程), the preset row on top (ui/customRulesStore.js: 预设 picker, 保存 · 新建 · 改名 · 删除, the count of
// settings that differ from the official ones and the unsaved mark, 复制代码 · 粘贴代码) and 休闲值 / 官方值 / 取消 / 应用.
// The ⚙ of the 规则 switch opens it (ui/ruleset.js): in the lobby it edits the lobby's settings, in a room the host's
// edit the room's (room.setRuleset), anybody else sees them read-only with 保存为我的预设.
// What a match does not read yet carries the 「后续更新生效」 tag (PENDING): this step carries every setting to the match
// (shared/ruleset.js), the match flow and the battles take them in later steps.
//
//   openCustomRules({ rules, readonly, roomMode, difficulty, onApply })   CustomRulesDialog (mounted by the lobby and the room)

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Icon, Button, Modal, confirmDialog } from './components.js';
import { Img } from './gameComponents.js';
import { bondIconUrl, enemyIconUrl } from './assetUrls.js';
import { createStore, useStore, loadPref, savePref } from '../store.js';
import { data, useData, getMode, localAsset } from '../data.js';
import { copyText } from './clipboard.js';
import { toast } from './toasts.js';
import {
  customRulesStore, setDraft, selectPreset, addPreset, savePreset, renamePreset, deletePreset, presetOf, nextPresetName,
  encodeCustomCode, decodeCustomCode, CUSTOM_NAME_MAX,
} from './customRulesStore.js';
import {
  sanitizeCustom, customDiffs, customRoundPlan, curveScale, CUSTOM_OFFICIAL, CUSTOM_CASUAL, CUSTOM_LIMITS,
} from '../../../shared/ruleset.js';
import { modeIdFor, DIFFICULTIES } from '../../../shared/constants.js';
import { t, N_ } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** The settings a match does not read yet (their rows carry the 「后续更新生效」 tag). */
export const PENDING = new Set(['bonds', 'enemies', 'bosses.ban', 'bosses.hitLimit', 'stages.ban', 'flow.rounds', 'flow.prep', 'flow.lp']);

/** The tabs: id, name, the settings paths it counts (customDiffs prefixes). */
const TABS = [
  { id: 'bonds', name: N_('盟约'), micro: 'BONDS', keys: ['bonds.'] },
  { id: 'enemies', name: N_('敌人能力'), micro: 'ENEMIES', keys: ['enemies.', 'leaders.'] },
  { id: 'bosses', name: N_('敌方领袖'), micro: 'LEADERS', keys: ['bosses.'] },
  { id: 'stages', name: N_('战场'), micro: 'BATTLEFIELD', keys: ['stages.'] },
  { id: 'flow', name: N_('进程'), micro: 'FLOW', keys: ['flow.'] },
];

export const customDialogStore = createStore({ open: false, seq: 0, rules: null, readonly: false, live: null, roomMode: 'coop', difficulty: 'FUNNY', onApply: null });

/**
 * Open the settings. `onApply(rules)` runs after 应用 (the lobby picks custom, a room's host sends room.setRuleset).
 * `live` (read-only): a function giving the settings to show now — a room's, which its host may change meanwhile.
 * @param {{ rules: unknown, readonly?: boolean, live?: (() => unknown) | null, roomMode?: 'solo'|'coop', difficulty?: string,
 *   onApply?: ((rules: any) => void) | null }} opts
 */
export function openCustomRules({ rules, readonly = false, live = null, roomMode = 'coop', difficulty = 'FUNNY', onApply = null }) {
  customDialogStore.set((s) => ({ open: true, seq: s.seq + 1, rules: sanitizeCustom(rules), readonly, live: readonly ? live : null, roomMode,
    difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : 'FUNNY', onApply }));
}

export const closeCustomRules = () => customDialogStore.set({ open: false, onApply: null, live: null });

/** The settings dialog (one per screen that has the ⚙; leaving the screen closes it). */
export function CustomRulesDialog() {
  const st = useStore((s) => s, Object.is, customDialogStore);
  useEffect(() => closeCustomRules, []);
  if (!st.open) return null;
  return html`<${CustomRulesBody} key=${st.seq} init=${st.rules} readonly=${st.readonly} live=${st.live} roomMode=${st.roomMode}
    difficulty=${st.difficulty} onApply=${st.onApply} />`;
}

const fmt = (n) => Number(n).toLocaleString('en-US');

// ---- controls ----------------------------------------------------------------------------------------------------

/** − value + with a typed value; `suffix` after the number (%). */
function Stepper({ value, min, max, step = 1, onChange, disabled, suffix = '', wide = false, testid }) {
  const [text, setText] = useState(null);
  const clamp = (v) => Math.min(max, Math.max(min, Math.round(v)));
  // the value the last click asked for, until the new props arrive: two clicks before a render both count
  const last = useRef({ prop: value, cur: value });
  if (last.current.prop !== value) last.current = { prop: value, cur: value };
  const bump = (d) => { const v = clamp(last.current.cur + d); last.current.cur = v; onChange(v); };
  const commit = () => {
    if (text == null) return;
    const v = Number(String(text).replace(/[^\d.-]/g, ''));
    setText(null);
    if (Number.isFinite(v)) onChange(clamp(v));
  };
  return html`<span class=${cx('crx-step', wide && 'crx-step--wide')} data-testid=${testid}>
    <button type="button" aria-label="−" disabled=${disabled || value <= min} onClick=${() => bump(-step)}><${Icon} name="minus" /></button>
    <input class="num" type="text" inputmode="numeric" disabled=${disabled} value=${text ?? `${fmt(value)}${suffix}`}
      onFocus=${(e) => { setText(String(value)); requestAnimationFrame(() => e.target.select?.()); }}
      onInput=${(e) => setText(e.target.value)} onBlur=${commit}
      onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }} />
    <button type="button" aria-label="+" disabled=${disabled || value >= max} onClick=${() => bump(step)}><${Icon} name="plus" /></button>
  </span>`;
}

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

const Pending = ({ k }) => (PENDING.has(k) ? html`<span class="crx-pending">${t('后续更新生效')}</span>` : null);

function Row({ label, note, official, children, pending, locked }) {
  return html`<div class=${cx('crx-row', locked && 'is-locked')}>
    <div class="crx-row__l"><span>${label}${pending ? html`<${Pending} k=${pending} />` : null}</span>${note ? html`<em>${note}</em>` : null}</div>
    ${official ? html`<span class="crx-official">${official}</span>` : null}
    ${children}
  </div>`;
}

const Sec = ({ title, sub, pending, children }) => html`<section class="crx-sec">
  <h3 class="crx-sec__h">${title}${pending ? html`<${Pending} k=${pending} />` : null}${sub ? html`<small>${sub}</small>` : null}</h3>
  ${children}
</section>`;

// ---- the dialog --------------------------------------------------------------------------------------------------

function CustomRulesBody({ init, readonly, live, roomMode, difficulty, onApply }) {
  useData('config', 'bonds', 'bosses', 'stages', 'assets', 'local');
  const [own, setWork] = useState(init);
  // read-only: what the room has now (its host may change it while this is open)
  const liveRules = useStore(() => (live ? live() : null));
  const work = readonly && liveRules ? sanitizeCustom(liveRules) : own;
  const [tab, setTabState] = useState(() => { const v = loadPref('customRules.tab', 'bonds'); return TABS.some((x) => x.id === v) ? v : 'bonds'; });
  const [renaming, setRenaming] = useState(null);
  const [paste, setPaste] = useState(null);
  const store = useStore((s) => s, Object.is, customRulesStore);
  const setTab = (v) => { setTabState(v); savePref('customRules.tab', v); };

  const solo = roomMode === 'solo';
  const config = data.get('config');
  const mode = getMode(modeIdFor(solo ? 'solo' : 'coop', difficulty));
  const bans = config?.bans?.[difficulty] || null;
  const base = { bans, rounds: Number.isInteger(mode?.lastRound) ? mode.lastRound : null };
  const diffs = customDiffs(work, base);
  const tabCount = (tb) => diffs.filter((d) => tb.keys.some((k) => d.startsWith(k))).length;
  const active = presetOf(store.active);
  const dirty = !!active && JSON.stringify(active.rules) !== JSON.stringify(work);

  /** set(section, key, value) — every edit goes through sanitizeCustom */
  const set = (sec, k, v) => setWork((w) => sanitizeCustom({ ...w, [sec]: { ...w[sec], [k]: v } }));

  const close = closeCustomRules;
  const apply = () => {
    setDraft(work);
    try { onApply?.(work); } finally { close(); }
  };
  const save = () => {
    if (active) { savePreset(active.id, work); toast(t('已保存预设「{name}」', { name: active.name }), 'ok'); return; }
    newPreset();
  };
  const newPreset = (name = nextPresetName(t('预设'))) => {
    const id = addPreset(name, work);
    if (id) toast(t('已保存预设「{name}」', { name: presetOf(id)?.name ?? name }), 'ok');
    else toast(t('预设已满，请先删除不用的预设'), 'warn');
  };
  const remove = async () => {
    if (!active) return;
    const ok = await confirmDialog({ title: t('删除预设'), text: t('确定删除预设「{name}」吗？', { name: active.name }), okText: t('删除'), danger: true });
    if (ok) deletePreset(active.id);
  };
  const pick = (id) => {
    const rules = selectPreset(id || null);
    if (rules) setWork(rules);
  };
  const copyCode = async () => {
    const code = await encodeCustomCode(work);
    if (await copyText(code)) toast(t('已复制规则代码'), 'ok');
    else setPaste({ text: code, copy: true });
  };
  const readCode = async () => {
    const r = await decodeCustomCode(paste?.text);
    if (!r.ok) { toast(t('无法读取这个规则代码'), 'error'); return; }
    setWork(r.rules);
    setPaste(null);
    toast(r.newer ? t('已读取规则代码（来自更新的版本，本版本没有的设置保持官方值）') : t('已读取规则代码'), r.newer ? 'warn' : 'ok');
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
              onInput=${(e) => setRenaming(e.target.value)}
              onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); } }}
              onBlur=${() => { if (active && renaming != null) renamePreset(active.id, renaming); setRenaming(null); }} />`
          : html`<select class="crx-select" value=${active ? active.id : ''} onChange=${(e) => pick(e.target.value)} data-testid="custom-preset-select">
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
        onInput=${(e) => setPaste({ text: e.target.value })} onFocus=${(e) => paste.copy && e.target.select()}></textarea>
      ${paste.copy ? html`<span class="crx-note">${t('无法自动复制，请手动复制上面的代码')}</span>`
        : html`<${Button} variant="primary" size="sm" icon="check" disabled=${!paste.text.trim()} onClick=${readCode}>${t('读取')}<//>`}
      <${Button} variant="secondary" size="sm" icon="close" onClick=${() => setPaste(null)}>${t('关闭窗口')}<//>
    </div>` : null;

  const ctx = { work, set, readonly, solo, mode, bans, base, difficulty, setWork };
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

const PICK_LABELS = { random: N_('随机'), ban: N_('禁用'), allow: N_('允许') };

function BondsPane({ work, set, readonly, mode, bans }) {
  const m = data.get('assets');
  const inactive = new Set(Array.isArray(mode?.inactiveBondIds) ? mode.inactiveBondIds : []);
  const all = data.list('bonds') || [];
  const core = all.filter((b) => b.isCore && b.weight > 0);
  const addon = all.filter((b) => !b.isCore && b.weight > 0);
  const fixed = all.filter((b) => !(b.weight > 0));
  const pick = work.bonds.pick;
  const setPick = (id, v) => {
    const next = { ...pick };
    if (v === 'random') delete next[id]; else next[id] = v;
    set('bonds', 'pick', next);
  };
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
    <${Sec} title=${t('盟约禁用抽取')} sub=${t('每局随机禁用的盟约数 — 只从设为「随机」的盟约中抽取')} pending="bonds">
      <${Row} label=${t('国家盟约（核心）随机禁用')} official=${t('难度默认 {n}', { n: bans?.core ?? 0 })}>
        <${Stepper} value=${coreN} min=${CUSTOM_LIMITS.banCore[0]} max=${CUSTOM_LIMITS.banCore[1]} disabled=${readonly} testid="custom-ban-core"
          onChange=${(v) => set('bonds', 'banCore', v === (bans?.core ?? null) ? null : v)} />
      <//>
      <${Row} label=${t('职业·特性盟约（附加）随机禁用')} official=${t('难度默认 {n}', { n: bans?.addon ?? 0 })}>
        <${Stepper} value=${addonN} min=${CUSTOM_LIMITS.banAddon[0]} max=${CUSTOM_LIMITS.banAddon[1]} disabled=${readonly}
          onChange=${(v) => set('bonds', 'banAddon', v === (bans?.addon ?? null) ? null : v)} />
      <//>
      <${Row} label=${t('解除盟约层数上限')} note=${t('官方规则下每个盟约最多 999 层 — 解除后没有上限')} official=${t('官方：{n}', { n: 999 })}>
        <${Switch} on=${work.bonds.noLayerCap} disabled=${readonly} onChange=${(v) => set('bonds', 'noLayerCap', v)} />
      <//>
    <//>
    <${Sec} title=${t('逐个盟约设置')} pending="bonds">
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

function EnemiesPane({ work, set, readonly, mode }) {
  const pct = (sec, k, label, note) => html`<${Row} label=${label} note=${note} official=${t('官方 100%')}>
    <${Stepper} value=${work[sec][k]} min=${CUSTOM_LIMITS.pct[0]} max=${CUSTOM_LIMITS.pct[1]} step=${10} suffix="%" disabled=${readonly}
      testid=${`custom-${sec}-${k}`} onChange=${(v) => set(sec, k, v)} />
  <//>`;
  const curves = [
    { v: 'official', label: t('官方') }, { v: 'gentle', label: t('平缓') }, { v: 'steep', label: t('陡峭') }, { v: 'flat', label: t('持平（固定第 1 回合）') },
  ];
  return html`
    <${Sec} title=${t('普通敌人')} sub=${t('含特训敌人、护卫、部件 · 各 {lo}% – {hi}%', { lo: CUSTOM_LIMITS.pct[0], hi: CUSTOM_LIMITS.pct[1] })} pending="enemies">
      ${pct('enemies', 'hp', t('生命值'))}
      ${pct('enemies', 'atk', t('攻击力'))}
      ${pct('enemies', 'def', t('防御力'))}
      ${pct('enemies', 'res', t('法术抗性'), t('乘以倍率后法术抗性也不超过 100'))}
      ${pct('enemies', 'speed', t('移动速度'))}
    <//>
    <${Sec} title=${t('敌方领袖')} sub=${t('最终攻势、隐秘核心的敌方领袖及其召唤物')} pending="enemies">
      ${pct('leaders', 'hp', t('生命值'), t('乘在共享生命值池（按人数）上'))}
      ${pct('leaders', 'atk', t('攻击力'))}
      ${pct('leaders', 'def', t('防御力'))}
      ${pct('leaders', 'res', t('法术抗性'))}
    <//>
    <${Sec} title=${t('逐回合能力成长')} sub=${t('以难度的官方曲线为基础 — 图表为生命值倍率')} pending="enemies">
      <${Row} label=${t('成长曲线')}><${Seg} options=${curves} value=${work.enemies.curve} disabled=${readonly} onChange=${(v) => set('enemies', 'curve', v)} /><//>
      <${CurveChart} work=${work} mode=${mode} />
    <//>`;
}

/** The hp multiplier per round as the match spawns it (config.json enemyScale hp): the official line (dashed) and the custom one (curve × hp%, over the custom rounds). */
function CurveChart({ work, mode }) {
  if (!mode) return null;
  const plan = customRoundPlan(mode, work.flow.rounds);
  const off = customRoundPlan(mode, null).rounds.map((r) => r.hp);
  const m1 = plan.rounds[0]?.hp ?? 1;
  const cus = plan.rounds.map((r) => (work.enemies.hp / 100) * curveScale(r.hp, m1, work.enemies.curve));
  const W = 1000, H = 220, P = 40;
  const nX = Math.max(off.length, cus.length);
  const maxY = Math.max(1.5, ...off, ...cus) * 1.08;
  const x = (i) => P + (nX > 1 ? (i * (W - 2 * P)) / (nX - 1) : 0);
  const y = (v) => H - P + 6 - (v / maxY) * (H - 2 * P);
  const pts = (arr) => arr.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const gridStep = maxY > 12 ? Math.ceil(maxY / 6) : maxY > 6 ? 2 : 1;
  const grid = [];
  for (let g = gridStep; g < maxY; g += gridStep) grid.push(g);
  return html`<svg class="crx-chart" viewBox=${`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label=${t('成长曲线')}>
    ${grid.map((g) => html`<line key=${`g${g}`} x1=${P} x2=${W - P} y1=${y(g)} y2=${y(g)} class="crx-chart__grid" /><text key=${`t${g}`} x=${P - 8} y=${y(g) + 4} text-anchor="end">×${g}</text>`)}
    ${Array.from({ length: nX }, (_, i) => html`<text key=${`x${i}`} x=${x(i)} y=${H - 6} text-anchor="middle">${i + 1}</text>`)}
    <polyline points=${pts(off)} class="crx-chart__off" />
    <polyline points=${pts(cus)} class="crx-chart__cus" />
    <text x=${W - P} y=${P - 6} text-anchor="end" class="crx-chart__lc">${t('自定义')}</text>
    <text x=${W - P} y=${P + 14} text-anchor="end">${t('官方')}</text>
  </svg>`;
}

function BossesPane({ work, set, setWork, readonly, mode }) {
  const m = data.get('assets');
  const all = data.list('bosses') || [];
  const ban = new Set(work.bosses.ban);
  const weights = (hidden) => (hidden ? mode?.hiddenBossWeights : mode?.bossWeights) || {};
  const inMode = (b) => (weights(b.hidden)[b.bossId] ?? 0) > 0;
  const toggle = (b) => {
    const group = all.filter((x) => !!x.hidden === !!b.hidden && inMode(x));
    if (!ban.has(b.bossId) && inMode(b) && group.filter((x) => !ban.has(x.bossId)).length <= 1) {
      toast(t('至少要保留一名敌方领袖'), 'warn');
      return;
    }
    const next = new Set(ban);
    if (next.has(b.bossId)) next.delete(b.bossId); else next.add(b.bossId);
    set('bosses', 'ban', [...next]);
  };
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
    <${Sec} title=${t('最终攻势敌方领袖')} sub=${t('禁用的领袖不会被抽到 — 至少保留 1 名 · 其余按官方权重抽取')} pending="bosses.ban">
      <div class="crx-bosses">${finals.map(card)}</div>
    <//>
    <${Sec} title=${t('隐秘核心领袖')} sub=${hasHidden ? t('同样的规则') : t('本难度没有隐秘核心')} pending="bosses.ban">
      <div class="crx-bosses">${hiddens.map(card)}</div>
    <//>
    <${Sec} title=${t('领袖限伤')} sub=${t('对敌方领袖单次造成的伤害')}>
      <${Row} label=${t('超过上限的一击')} note=${t('官方：达到上限的一击整个无效 · 按上限计算：只计上限的伤害（与休闲规则相同）')}>
        <${Seg} options=${modes} value=${work.bosses.hitMode} disabled=${readonly} onChange=${(v) => setWork((w) => sanitizeCustom({ ...w, bosses: { ...w.bosses, hitMode: v } }))} />
      <//>
      <${Row} label=${t('上限值')} pending="bosses.hitLimit" official=${t('官方 {n}', { n: fmt(CUSTOM_OFFICIAL.bosses.hitLimit) })}
          note=${t('{lo} – {hi} · 更高请选「不限制」', { lo: fmt(CUSTOM_LIMITS.hitLimit[0]), hi: fmt(CUSTOM_LIMITS.hitLimit[1]) })} locked=${work.bosses.hitMode === 'none'}>
        <${Stepper} value=${work.bosses.hitLimit} min=${CUSTOM_LIMITS.hitLimit[0]} max=${CUSTOM_LIMITS.hitLimit[1]} step=${100000} wide=${true}
          disabled=${readonly || work.bosses.hitMode === 'none'} onChange=${(v) => set('bosses', 'hitLimit', v)} />
      <//>
    <//>`;
}

/** The second-half stages and the first-half ones whose ground works in the sim (m05–m07 wait for their mechanics, maintainer decision 2026-10-18). */
const stageShown = (s) => !s.kind && (s.active !== false || Number(s.weight) > 0);

function StagesPane({ work, set, readonly, mode }) {
  const all = (data.list('stages') || []).filter(stageShown);
  const pool = new Set(Array.isArray(mode?.stages) ? mode.stages : []);
  const ban = new Set(work.stages.ban);
  const used = [...pool].filter((id) => !ban.has(id)).length;
  const toggle = (s) => {
    if (!ban.has(s.id) && pool.has(s.id) && used <= 1) { toast(t('至少要保留一张战场'), 'warn'); return; }
    const next = new Set(ban);
    if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
    set('stages', 'ban', [...next]);
  };
  const half = (s) => (/^act1/.test(s.id) ? t('上半') : t('下半'));
  return html`
    <${Sec} title=${t('简报')}>
      <${Row} label=${t('战场信息预览')} note=${t('简报中显示本局战场的名称和预览图（关闭时为「未知战场」）')} official=${t('官方：关闭')}>
        <${Switch} on=${work.stages.info} disabled=${readonly} testid="custom-stage-info" onChange=${(v) => set('stages', 'info', v)} />
      <//>
      <${Row} label=${t('简报「重新抽取」')} note=${t('全员同意时重新抽取战场、领袖和缺席盟约')} official=${t('官方：没有')}>
        <${Switch} on=${work.stages.reroll} disabled=${readonly} onChange=${(v) => set('stages', 'reroll', v)} />
      <//>
    <//>
    <${Sec} title=${t('战场池')} sub=${t('使用 {n} / {total} — 点击图片禁用 · 至少保留 1 张', { n: used, total: pool.size })} pending="stages.ban">
      <div class="crx-stages">${all.map((s) => {
        const off = !pool.has(s.id);
        const isBan = ban.has(s.id);
        return html`<button key=${s.id} type="button" class=${cx('crx-stage', isBan && 'is-ban', off && 'is-off')} disabled=${readonly}
            data-stage=${s.id} aria-pressed=${isBan ? 'true' : 'false'} onClick=${() => toggle(s)}>
          <${Img} src=${localAsset('stage/preview', s.id)} class="crx-stage__i" fallback=${html`<span class="crx-stage__i crx-stage__none"></span>`} />
          ${isBan ? html`<span class="crx-stage__flag is-ban">${t('禁用')}</span>` : off ? html`<span class="crx-stage__flag">${t('本难度没有')}</span>` : null}
          <span class="crx-stage__n"><span>${s.name}</span><span class="crx-stage__tag">${half(s)}</span></span>
        </button>`;
      })}</div>
    <//>`;
}

const PREP_MUL = { official: 1, 'x1.5': 1.5, x2: 2 };

function FlowPane({ work, set, readonly, solo, mode, base }) {
  const official = base.rounds ?? 14;
  const n = work.flow.rounds ?? official;
  const plan = mode ? customRoundPlan(mode, work.flow.rounds) : { rounds: [], hidden: null };
  const prepOf = (src) => mode?.rounds?.[src]?.prepTime ?? null;
  // the prep table: the first round of each official prep length, then the final assault
  const cols = [];
  let last = null;
  plan.rounds.forEach((r, i) => {
    const p = prepOf(r.src);
    if (r.kind === 'boss' || p == null || p === last) return;
    last = p;
    cols.push({ label: String(i + 1), p });
  });
  const boss = plan.rounds.find((r) => r.kind === 'boss');
  if (boss && prepOf(boss.src) != null) cols.push({ label: t('最终攻势'), p: prepOf(boss.src) });
  const custom = (p) => (work.flow.prep === 'fixed' ? work.flow.prepSec : Math.round(p * (PREP_MUL[work.flow.prep] ?? 1)));
  const preps = [{ v: 'official', label: t('官方') }, { v: 'x1.5', label: '×1.5' }, { v: 'x2', label: '×2' }, { v: 'fixed', label: t('固定秒数') }];
  return html`
    <${Sec} title=${t('回合')} sub=${t('增加时在最终攻势前加入轮换后期波次的追加回合，减少时先去掉敌人能力相同的中期普通回合')} pending="flow.rounds">
      <${Row} label=${t('回合数')} note=${t('{lo} – {hi} · 追加回合的敌人能力按成长曲线继续提升 [推定]', { lo: CUSTOM_LIMITS.rounds[0], hi: CUSTOM_LIMITS.rounds[1] })}
          official=${t('官方 {n}', { n: official })}>
        <${Stepper} value=${n} min=${CUSTOM_LIMITS.rounds[0]} max=${CUSTOM_LIMITS.rounds[1]} disabled=${readonly} testid="custom-rounds"
          onChange=${(v) => set('flow', 'rounds', v === official ? null : v)} />
      <//>
      <div class="crx-rounds" data-testid="custom-round-strip">
        ${plan.rounds.map((r, i) => html`<span key=${i} class=${`k-${r.kind}`}>${r.kind === 'boss' ? html`${i + 1} ${t('最终攻势')}` : i + 1}${r.src !== i + 1 && r.kind !== 'boss' ? html`<small>←${r.src}</small>` : null}</span>`)}
        ${plan.hidden ? html`<span class="k-hidden">${plan.rounds.length + 1} ${t('隐秘核心')}</span>` : null}
      </div>
      <div class="crx-legend"><span><i class="lg-sp"></i>${t('机变回合')}</span><span><i class="lg-boss"></i>${t('最终攻势')}</span>
        ${plan.hidden ? html`<span><i class="lg-hid"></i>${t('隐秘核心（满足条件时）')}</span>` : null}<span><i class="lg-ext"></i>${t('追加回合（←原波次）')}</span></div>
    <//>
    <${Sec} title=${t('休整期')} sub=${solo ? t('仅同盟 — 独立模拟按官方规则不限时') : t('仅同盟')} pending="flow.prep">
      <${Row} label=${t('休整期时长')} locked=${solo}>
        <${Seg} options=${preps} value=${work.flow.prep} disabled=${readonly || solo} onChange=${(v) => set('flow', 'prep', v)} />
      <//>
      ${work.flow.prep === 'fixed' ? html`<${Row} label=${t('每回合秒数')} locked=${solo}>
        <${Stepper} value=${work.flow.prepSec} min=${CUSTOM_LIMITS.prepSec[0]} max=${CUSTOM_LIMITS.prepSec[1]} step=${5} suffix=${t('秒')}
          disabled=${readonly || solo} onChange=${(v) => set('flow', 'prepSec', v)} />
      <//>` : null}
      ${!solo && cols.length ? html`<div class="crx-ptable" style=${`--cols:${cols.length}`}>
        <span class="k">${t('回合')}</span>${cols.map((c, i) => html`<span key=${`r${i}`}>${c.label}</span>`)}
        <span class="k">${t('官方')}</span>${cols.map((c, i) => html`<span key=${`o${i}`}>${t('{n} 秒', { n: c.p })}</span>`)}
        <span class="k">${t('自定义')}</span>${cols.map((c, i) => html`<span key=${`c${i}`} class="v">${t('{n} 秒', { n: custom(c.p) })}</span>`)}
      </div>` : null}
    <//>
    <${Sec} title=${t('目标生命值')} sub=${t('仅同盟')} pending="flow.lp">
      <${Row} label=${t('解除每回合目标生命值减少上限')} note=${t('官方：一回合最多减少 10 — 解除后漏怪多少就减少多少')} official=${t('官方：{n}', { n: 10 })} locked=${solo}>
        <${Switch} on=${work.flow.lpCapOff} disabled=${readonly || solo} onChange=${(v) => set('flow', 'lpCapOff', v)} />
      <//>
      <${Row} label=${t('所有回合共享目标生命值')} note=${t('像最终攻势一样，整个同盟共用一个目标生命值（初始值之和）— 不会单独淘汰，归零时全员失败')}
          official=${t('官方：仅最终攻势')} locked=${solo}>
        <${Switch} on=${work.flow.lpShared} disabled=${readonly || solo} onChange=${(v) => set('flow', 'lpShared', v)} />
      <//>
    <//>
    <${Sec} title=${t('其他便利功能')} sub=${t('休闲规则的项目')}>
      <${Row} label=${t('移动型领袖路线预览')} note=${t('最终攻势休整期中敌方领袖将要走的路线')} official=${t('官方：没有')}>
        <${Switch} on=${work.flow.routePreview} disabled=${readonly} onChange=${(v) => set('flow', 'routePreview', v)} />
      <//>
    <//>`;
}

const PANES = { bonds: BondsPane, enemies: EnemiesPane, bosses: BossesPane, stages: StagesPane, flow: FlowPane };

/** The tabs' names, for tests. */
export const CUSTOM_TABS = Object.freeze(TABS.map((x) => x.id));
