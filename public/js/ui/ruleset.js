// 규칙 모드 on the client (shared/ruleset.js; maintainer decision 2026-10-15): the 经典 / 休闲 switch the lobby and the room
// bar share (the room's ruleset for its host; the lobby's choice for 创建 and 开始匹配, remembered in `lobby.ruleset`), its
// tooltip — what each preset changes against the official rules — and the waiting counts of the matchmaking queues
// (lobby.queueCounts → store ui.queueCounts: { [preset]: { [difficulty]: humans } }, ui/matchQueue.js).

import { html, Tooltip } from './components.js';
import { RULE_OPTIONS, RULE_PRESETS, PRESET_LABELS, DEFAULT_PRESET, resolveRuleset, isRulePreset } from '../../../shared/ruleset.js';
import { loadPref, savePref } from '../store.js';
import { t } from '../../../shared/i18n.js';

/**
 * What a preset changes against the official rules: the options it turns on, then those it turns off (none for 经典).
 * No colon inside a line: the switch's tooltip already pairs each preset with its line.
 * @param {string} preset
 * @returns {string}
 */
export function rulesetTip(preset) {
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
 * The switch's tooltip: one line per preset, then a footnote for each option some preset changes that has a `note`
 * (what the official rule does, for players who never met it — 限伤).
 */
export function rulesetTips() {
  const lines = RULE_PRESETS.map((p) => t('【{name}】{tip}', { name: t(PRESET_LABELS[p]), tip: rulesetTip(p) }));
  for (const [k, o] of Object.entries(RULE_OPTIONS)) {
    if (!o.note || !RULE_PRESETS.some((p) => resolveRuleset(p).options[k] !== o.official)) continue;
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

/** Remember the lobby's preset. @param {string} preset */
export const saveLobbyRuleset = (preset) => { if (isRulePreset(preset)) savePref('lobby.ruleset', preset); };

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
 * The 经典 / 休闲 switch (styled like the room's difficulty picker). `counts` = { [preset]: n } shows the waiting Doctors
 * beside each preset (the lobby's 同盟匹配).
 * @param {{ value: string, editable?: boolean, busy?: boolean, onPick: (p: string) => void, counts?: Record<string, number> | null, class?: string }} props
 */
export function RulesetSwitch({ value, editable = true, busy = false, onPick, counts = null, class: cls = '' }) {
  const cur = resolveRuleset(value).preset;
  return html`<${Tooltip} text=${rulesetTips()}>
    <div class=${`dpick rpick ${cls}`.trim()} role="radiogroup" aria-label=${t('规则')}>
      ${RULE_PRESETS.map((p) => html`<button key=${p} type="button" role="radio" aria-checked=${cur === p ? 'true' : 'false'} data-ruleset=${p}
          class=${`dpick__opt rpick__opt${cur === p ? ' is-active' : ''}`} disabled=${!editable || !!busy}
          onClick=${() => editable && cur !== p && onPick(p)}>
        ${t(PRESET_LABELS[p])}${counts ? html`<span class="rpick__n num" data-testid=${`queue-total-${p}`}>${counts[p] ?? 0}</span>` : null}
      </button>`)}
    </div>
  <//>`;
}
