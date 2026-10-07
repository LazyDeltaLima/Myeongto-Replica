// In-game debug panel (local patch, docs/LOCAL-PATCH.md) — local debug mode only. The server adds m.private.debug
// ({ fundsPin, pinValue, candidates }) only when it runs in local debug mode (server/local-patch.js debugMode:
// SP_DEBUG_PAGE=1 or SP_DEBUG_FUNDS, never NODE_ENV=production); without it this renders nothing. The server checks
// every message again (debugIntent), so the panel is a convenience, not a gate.
//   checkbox  dbg.funds { on }      the player's funds pinned to pinValue (local.sh: 99) or real funds
//   pick add  dbg.addDiy { charId, tier, golden, skill, module? } a 自选 candidate (data/backups.json diy.ownedPool) of
//             tier V / VI, normal / elite, into the hand, fighting with the chosen skill (S1–S3) and — elite only —
//             module (or 'none'); the server sets it as the pick of a 自选 slot of that tier (PlayerState.setDiy). The
//             selectors start at the player's current pick of that operator (m.private.diy) or the defaults.
// Sits left of the board under the bond strip (css/debug-panel.css), clear of the board, shop and hand.

import { useState } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { act } from './gameActions.js';
import { t, tName } from '../../../shared/i18n.js';

const NONE = 'none';

/**
 * @param {{ debug: { fundsPin: boolean, pinValue: number, candidates: any[] } | null | undefined, prep: boolean,
 *   diy?: Record<string, { charId: string, skillIndex: number, uniEquipId: string|null }> | null }} props
 */
export function DebugPanel({ debug, prep, diy }) {
  const [open, setOpen] = useState(true);
  const [key, setKey] = useState('');
  const [tier, setTier] = useState('6');
  const [elite, setElite] = useState('a');
  const [skillSel, setSkillSel] = useState(null);   // null = the current loadout / default
  const [moduleSel, setModuleSel] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!debug || !Array.isArray(debug.candidates)) return null;
  const cand = debug.candidates.find((c) => c.charId === key) || debug.candidates[0];
  const tierRec = cand?.tiers?.[tier] || null;
  const pick = cand && diy ? Object.entries(diy).find(([id, p]) => p && p.charId === cand.charId && id.startsWith(`chess_char_${tier}_`))?.[1] : null;
  const entry = pick ? { skill: pick.skillIndex, module: pick.uniEquipId ?? NONE } : null;
  const skills = tierRec?.skills || [];
  const modules = tierRec?.modules || [];
  const skill = [skillSel, entry?.skill, 0].find((v) => skills.some((s) => s.index === v)) ?? skills[0]?.index ?? null;
  const module = [moduleSel, entry?.module].find((v) => modules.some((m) => m.id === v)) ?? NONE;
  const reset = () => { setSkillSel(null); setModuleSel(null); };
  const toggle = async (e) => { setBusy(true); await act('dbg.funds', { on: !!e.currentTarget.checked }, { sfx: false }); setBusy(false); };
  const add = async () => {
    if (!cand || !tierRec) return;
    setBusy(true);
    const fields = { charId: cand.charId, tier: Number(tier), golden: elite === 'b' };
    if (Number.isInteger(skill)) fields.skill = skill;
    if (elite === 'b') fields.module = module;
    await act('dbg.addDiy', fields, { sfx: 'pick' });
    setBusy(false);
  };
  return html`<div class="dbgp" role="group" aria-label=${t('调试面板')}>
    <button type="button" class="dbgp__head" onClick=${() => setOpen(!open)} aria-expanded=${open ? 'true' : 'false'}>
      <span>DEBUG</span><span class="dbgp__fold">${open ? '−' : '+'}</span>
    </button>
    ${open ? html`<div class="dbgp__body">
      <label class="dbgp__pin">
        <input type="checkbox" checked=${!!debug.fundsPin} disabled=${busy} onChange=${toggle} />
        <span>${t('调试用资金固定 {pinValue}', { pinValue: debug.pinValue })}</span>
      </label>
      <div class="dbgp__row">
        <span class="dbgp__label">${t('自选')}</span>
        <select value=${cand?.charId || ''} onChange=${(e) => { setKey(e.currentTarget.value); reset(); }}>
          ${debug.candidates.map((c) => html`<option key=${c.charId} value=${c.charId}>${tName(c.name)}</option>`)}
        </select>
      </div>
      <div class="dbgp__row">
        <select value=${tier} onChange=${(e) => { setTier(e.currentTarget.value); reset(); }}>
          <option value="5">${t('V阶')}</option><option value="6">${t('VI阶')}</option>
        </select>
        <select value=${elite} onChange=${(e) => setElite(e.currentTarget.value)}>
          <option value="a">${t('普通')}</option><option value="b">${t('精锐')}</option>
        </select>
      </div>
      <div class="dbgp__row">
        <span class="dbgp__label">${t('技能')}</span>
        <select value=${String(skill ?? '')} onChange=${(e) => setSkillSel(Number(e.currentTarget.value))}>
          ${skills.map((s) => html`<option key=${s.index} value=${String(s.index)}>${`S${s.index + 1} · ${tName(s.name)}`}</option>`)}
        </select>
      </div>
      ${elite === 'b' ? html`<div class="dbgp__row">
        <span class="dbgp__label">${t('模组')}</span>
        <select value=${module} onChange=${(e) => setModuleSel(e.currentTarget.value)}>
          ${modules.map((m) => html`<option key=${m.id} value=${m.id}>${m.id === NONE ? t('无模组') : `${m.type || m.id} · ${tName(m.name)}`}</option>`)}
        </select>
      </div>` : null}
      <button type="button" class="dbgp__add" disabled=${busy || !prep || !cand} onClick=${add}>${t('加入整备区')}</button>
    </div>` : null}
  </div>`;
}
