// In-game debug panel (local patch, docs/LOCAL-PATCH.md) — local debug mode only. The server adds m.private.debug
// ({ fundsPin, pinValue, candidates }) only when it runs in local debug mode (server/local-patch.js debugMode:
// SP_DEBUG_PAGE=1 or SP_DEBUG_FUNDS, never NODE_ENV=production); without it this renders nothing. The server checks
// every message again (debugIntent), so the panel is a convenience, not a gate.
//   checkbox  dbg.funds { on }      the player's funds pinned to pinValue (local.sh: 99) or real funds
//   pick add  dbg.addDiy { chessId, skill, module? } a 甄选 candidate (data/diy.json) of tier V / VI, normal / elite,
//             into the hand, fighting with the chosen skill (S1–S3) and — elite only — module (or 'none'); the server
//             writes them into the loadout entry of that base chess (DESIGN §16). The selectors start at the player's
//             current loadout (m.private.loadout) or the defaults.
// Sits left of the board under the bond strip (css/debug-panel.css), clear of the board, shop and hand.

import { useState } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { act } from './gameActions.js';

const NONE = 'none';

/**
 * @param {{ debug: { fundsPin: boolean, pinValue: number, candidates: any[] } | null | undefined, prep: boolean,
 *   loadout?: Record<string, { skill: number, module: string|null }> | null }} props
 */
export function DebugPanel({ debug, prep, loadout }) {
  const [open, setOpen] = useState(true);
  const [key, setKey] = useState('');
  const [tier, setTier] = useState('6');
  const [elite, setElite] = useState('a');
  const [skillSel, setSkillSel] = useState(null);   // null = the current loadout / default
  const [moduleSel, setModuleSel] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!debug || !Array.isArray(debug.candidates)) return null;
  const cand = debug.candidates.find((c) => c.key === key) || debug.candidates[0];
  const t = cand?.tiers?.[tier] || null;
  const entry = t && loadout && Object.hasOwn(loadout, t.baseId) ? loadout[t.baseId] : null;
  const skills = t?.skills || [];
  const modules = t?.modules || [];
  const skill = [skillSel, entry?.skill, t?.defaultSkill].find((v) => skills.some((s) => s.index === v)) ?? skills[0]?.index ?? null;
  const module = [moduleSel, entry?.module, t?.defaultModule].find((v) => modules.some((m) => m.id === v)) ?? NONE;
  const reset = () => { setSkillSel(null); setModuleSel(null); };
  const toggle = async (e) => { setBusy(true); await act('dbg.funds', { on: !!e.currentTarget.checked }, { sfx: false }); setBusy(false); };
  const add = async () => {
    if (!cand || !t) return;
    setBusy(true);
    const fields = { chessId: `chess_diy_${cand.key}_${tier}_${elite}` };
    if (Number.isInteger(skill)) fields.skill = skill;
    if (elite === 'b') fields.module = module;
    await act('dbg.addDiy', fields, { sfx: 'pick' });
    setBusy(false);
  };
  return html`<div class="dbgp" role="group" aria-label="调试面板">
    <button type="button" class="dbgp__head" onClick=${() => setOpen(!open)} aria-expanded=${open ? 'true' : 'false'}>
      <span>DEBUG</span><span class="dbgp__fold">${open ? '−' : '+'}</span>
    </button>
    ${open ? html`<div class="dbgp__body">
      <label class="dbgp__pin">
        <input type="checkbox" checked=${!!debug.fundsPin} disabled=${busy} onChange=${toggle} />
        <span>${`调试用资金固定 ${debug.pinValue}`}</span>
      </label>
      <div class="dbgp__row">
        <span class="dbgp__label">甄选</span>
        <select value=${cand?.key || ''} onChange=${(e) => { setKey(e.currentTarget.value); reset(); }}>
          ${debug.candidates.map((c) => html`<option key=${c.key} value=${c.key}>${c.name}</option>`)}
        </select>
      </div>
      <div class="dbgp__row">
        <select value=${tier} onChange=${(e) => { setTier(e.currentTarget.value); reset(); }}>
          <option value="5">V阶</option><option value="6">VI阶</option>
        </select>
        <select value=${elite} onChange=${(e) => setElite(e.currentTarget.value)}>
          <option value="a">普通</option><option value="b">精锐</option>
        </select>
      </div>
      <div class="dbgp__row">
        <span class="dbgp__label">技能</span>
        <select value=${String(skill ?? '')} onChange=${(e) => setSkillSel(Number(e.currentTarget.value))}>
          ${skills.map((s) => html`<option key=${s.index} value=${String(s.index)}>${`S${s.index + 1} · ${s.name}`}</option>`)}
        </select>
      </div>
      ${elite === 'b' ? html`<div class="dbgp__row">
        <span class="dbgp__label">模组</span>
        <select value=${module} onChange=${(e) => setModuleSel(e.currentTarget.value)}>
          ${modules.map((m) => html`<option key=${m.id} value=${m.id}>${m.id === NONE ? '无模组' : `${m.type || m.id} · ${m.name}`}</option>`)}
        </select>
      </div>` : null}
      <button type="button" class="dbgp__add" disabled=${busy || !prep || !cand} onClick=${add}>加入整备区</button>
    </div>` : null}
  </div>`;
}
