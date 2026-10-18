// 규칙 모드 on the client (shared/ruleset.js; maintainer decisions 2026-10-15, 2026-10-18): the 经典 / 休闲 / 自定义 switch
// the lobby, the room bar and the stats page share (the room's ruleset for its host; the lobby's choice for 创建 and
// 开始匹配, remembered in `lobby.ruleset` — and the last queue preset in `lobby.queueRuleset`, since 同盟匹配 locks
// 自定义), its tooltip — what each preset changes against the official rules — the waiting counts of the matchmaking
// queues (lobby.queueCounts → store ui.queueCounts: { [preset]: { [difficulty]: humans } }, ui/matchQueue.js) and the
// ⚙ beside 自定义 that opens the settings (ui/customRules.js).

import { html, Icon, Tooltip } from './components.js';
import { GIcon } from './gameComponents.js';
import { RULE_OPTIONS, RULE_PRESETS, QUEUE_PRESETS, PRESET_LABELS, DEFAULT_PRESET, resolveRuleset, isRulePreset, isQueuePreset } from '../../../shared/ruleset.js';
import { loadPref, savePref } from '../store.js';
import { t } from '../../../shared/i18n.js';

/**
 * What a preset changes against the official rules: the options it turns on, then those it turns off (none for 经典).
 * No colon inside a line: the switch's tooltip already pairs each preset with its line.
 * @param {string} preset
 * @returns {string}
 */
export function rulesetTip(preset) {
  if (preset === 'custom') return t('由创建者逐项设置 · 不能用于同盟匹配');
  const { options } = resolveRuleset(preset);
  const on = [];
  const off = [];
  for (const [k, o] of Object.entries(RULE_OPTIONS)) {
    if (options[k] === o.official) continue;
    (options[k] ? on : off).push(t(o.label));
  }
  if (!on.length && !off.length) return t('与官方规则相同');
  return [on.length ? t('使用{list}', { list: on.join(t('、')) }) : '', off.length ? t('没有{list}', { list: off.join(t('、')) }) : '']
    .filter(Boolean).join(' · ');
}

/**
 * The switch's tooltip: one line per preset of the switch, then a footnote for each option a fixed preset changes that
 * has a `note` (what the official rule does, for players who never met it — 限伤).
 * @param {readonly string[]} [presets]
 */
export function rulesetTips(presets = RULE_PRESETS) {
  const lines = presets.map((p) => t('【{name}】{tip}', { name: t(PRESET_LABELS[p]), tip: rulesetTip(p) }));
  for (const [k, o] of Object.entries(RULE_OPTIONS)) {
    if (!o.note || !QUEUE_PRESETS.some((p) => resolveRuleset(p).options[k] !== o.official)) continue;
    lines.push(t('※ {label} — {note}', { label: t(o.label), note: t(o.note, { n: (o.noteN ?? 0).toLocaleString('en-US') }) }));
  }
  return lines.join('\n');
}

/** The preset's display name. @param {unknown} preset */
export const presetName = (preset) => t(PRESET_LABELS[resolveRuleset(preset).preset]);

/** The lobby's remembered preset (the default until the player picks one). */
export function lobbyRuleset() {
  const v = loadPref('lobby.ruleset', DEFAULT_PRESET);
  return isRulePreset(v) ? v : DEFAULT_PRESET;
}

/** The preset 开始匹配 uses: the lobby's, or the last queue preset picked while it is 自定义. */
export function lobbyQueueRuleset() {
  const v = lobbyRuleset();
  if (isQueuePreset(v)) return v;
  const q = loadPref('lobby.queueRuleset', DEFAULT_PRESET);
  return isQueuePreset(q) ? q : DEFAULT_PRESET;
}

/** Remember the lobby's preset. @param {string} preset */
export const saveLobbyRuleset = (preset) => {
  if (!isRulePreset(preset)) return;
  savePref('lobby.ruleset', preset);
  if (isQueuePreset(preset)) savePref('lobby.queueRuleset', preset);
};

/**
 * Humans waiting in a matchmaking queue: one preset and difficulty, or the preset's total when `difficulty` is null.
 * @param {any} counts store ui.queueCounts
 * @param {string} preset
 * @param {string | null} [difficulty]
 * @returns {number}
 */
export function queueCountOf(counts, preset, difficulty = null) {
  const row = counts && typeof counts === 'object' ? counts[preset] : null;
  if (!row || typeof row !== 'object') return 0;
  if (difficulty != null) return Number.isFinite(row[difficulty]) ? row[difficulty] : 0;
  return Object.values(row).reduce((n, v) => n + (Number.isFinite(v) ? v : 0), 0);
}

/**
 * The 经典 / 休闲 / 自定义 switch (styled like the room's difficulty picker). `counts` = { [preset]: n } shows the waiting
 * Doctors beside each preset (the lobby's 同盟匹配). `onGear` adds the ⚙ after 自定义 (it works for a Doctor who may not
 * pick: the settings open read-only); `customLock` locks 自定义 with that line on top of the tooltip (同盟匹配).
 * @param {{ value: unknown, editable?: boolean, busy?: boolean, onPick: (p: string) => void, counts?: Record<string, number> | null,
 *   class?: string, presets?: readonly string[], onGear?: (() => void) | null, customLock?: string | null }} props
 */
export function RulesetSwitch({ value, editable = true, busy = false, onPick, counts = null, class: cls = '', presets = RULE_PRESETS, onGear = null, customLock = null }) {
  const cur = resolveRuleset(value).preset;
  const tips = rulesetTips(presets);
  return html`<${Tooltip} text=${customLock ? `${customLock}\n${tips}` : tips}>
    <div class=${`dpick rpick ${cls}`.trim()} role="radiogroup" aria-label=${t('规则')}>
      ${presets.map((p) => {
        const locked = p === 'custom' && !!customLock;
        const on = cur === p && !locked;
        const opt = html`<button key=${p} type="button" role="radio" aria-checked=${on ? 'true' : 'false'} data-ruleset=${p}
            class=${`dpick__opt rpick__opt${on ? ' is-active' : ''}${locked ? ' is-locked' : ''}`} disabled=${!editable || !!busy || locked}
            onClick=${() => editable && cur !== p && onPick(p)}>
          ${t(PRESET_LABELS[p])}${counts && !locked ? html`<span class="rpick__n num" data-testid=${`queue-total-${p}`}>${counts[p] ?? 0}</span>` : null}
          ${locked ? html`<${Icon} name="lock" class="rpick__lock" />` : null}
        </button>`;
        if (p !== 'custom' || !onGear || locked) return opt;
        return [opt, html`<button key="gear" type="button" class=${`rpick__gear${on ? ' is-active' : ''}`} data-testid="custom-rules-gear"
            title=${t('自定义规则设置')} aria-label=${t('自定义规则设置')} onClick=${onGear}><${GIcon} name="gear" /></button>`];
      })}
    </div>
  <//>`;
}
