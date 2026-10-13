// In-game debug panel (local patch, docs/LOCAL-PATCH.md) — local debug mode only. The server adds m.private.debug
// ({ fundsPin, pinValue, candidates, enemies }) only when it runs in local debug mode (server/local-patch.js debugMode:
// SP_DEBUG_PAGE=1 or SP_DEBUG_FUNDS, never NODE_ENV=production); without it this renders nothing. The server checks
// every message again (debugIntent), so the panel is a convenience, not a gate.
//   checkbox  dbg.funds { on }      the player's funds pinned to pinValue (SP_DEBUG_FUNDS) or real funds
//   operator  one list of every operator: the normal chess of the client's chess table (data/chess.json, hidden ones
//             marked) and the 自选 candidates (data/backups.json diy.ownedPool), filtered by bond (盟约, or 自选 alone),
//             tier and a search (the shown and Chinese names, the English appellation, the branch, the bond names)
//   add       a chess: dbg.addChess { chessId, golden } — normal / elite into the hand
//             a 自选 pick: dbg.addDiy { charId, tier, golden, skill, module? } of tier V / VI, fighting with the chosen
//             skill (S1–S3) and — elite only — module (or 'none'); the server sets it as the pick of a 自选 slot of that
//             tier. The selectors start at the player's current pick of that operator (m.private.diy) or the defaults.
//   enemies   dbg.addEnemy { enemyKey, count } — `count` more of any enemy of the client's enemy table (token-only summons
//             left out; search by name, Chinese name or key) in the player's next battle, joined like a 悬赏 card's
//             enemies (preview, effects list); m.private.debug.enemies lists the queued ones, dbg.clearEnemies drops them
//   end       dbg.finish { victory } the match ends now as won / lost — the settlement screen (and its feedback) at once
//   F2        hides / shows the whole panel (remembered per browser: sp.pref.debugPanelHidden)
// Sits left of the board under the bond strip (css/debug-panel.css), clear of the board, shop and hand.

import { useEffect, useMemo, useState } from '../../vendor/hooks.module.js';
import { html, roman } from './components.js';
import { act } from './gameActions.js';
import { toast, toastError } from './toasts.js';
import { net } from '../net.js';
import { audio } from '../audio.js';
import { data } from '../data.js';
import { loadPref, savePref } from '../store.js';
import { N_, t, tName } from '../../../shared/i18n.js';

const NONE = 'none';
const DIY = 'diy';         // the bond filter's 自选-only choice
const DIY_KEY = 'diy:';    // entry key prefix of a 自选 candidate (a chess entry's key is its chessId)
export const DEBUG_PANEL_KEY = 'F2'; // KeyboardEvent.key that hides / shows the panel
const HIDDEN_PREF = 'debugPanelHidden';
const RANK_ORDER = { NORMAL: 0, ELITE: 1, BOSS: 2 };
const RANK_LABEL = { NORMAL: N_('普通'), ELITE: N_('精英'), BOSS: N_('首领') };

/**
 * Every operator the panel offers: [{ key, kind: 'chess'|'diy', name, tiers, bonds, hidden, hay, cand? }], tier then
 * shop order, 自选 candidates after the chess of their tier.
 * @param {any[]} chessList data.list('chess') @param {any[]} candidates m.private.debug.candidates
 * @param {(id: string) => any} rawChess the record's Chinese texts (data.lookupRaw)
 * @param {(id: string) => any} getBond bond lookup (the search also matches bond names)
 */
export function debugEntries(chessList, candidates, rawChess = () => null, getBond = () => null) {
  const out = [];
  const bondNames = (ids) => ids.map((id) => getBond(id)?.name);
  for (const c of Array.isArray(chessList) ? chessList : []) {
    if (!c || c.isGolden || c.isDiy || !Number.isInteger(c.tier) || !c.chessId) continue;
    const raw = rawChess(c.chessId);
    out.push({ key: c.chessId, kind: 'chess', name: c.name || c.chessId, tiers: [c.tier], bonds: Array.isArray(c.bonds) ? c.bonds : [],
      hidden: !!c.isHidden, sort: c.shopSortId ?? 0,
      hay: [c.name, raw?.name, c.appellation, c.subProfessionName, ...bondNames(c.bonds || [])].filter(Boolean).join(' ').toLowerCase() });
  }
  for (const cand of Array.isArray(candidates) ? candidates : []) {
    const tiers = Object.keys(cand.tiers || {}).map(Number).sort();
    if (!tiers.length) continue;
    out.push({ key: DIY_KEY + cand.charId, kind: 'diy', name: tName(cand.name), tiers, bonds: cand.bonds || [], hidden: false, sort: Infinity,
      hay: [tName(cand.name), cand.name, cand.charId, ...bondNames(cand.bonds || [])].filter(Boolean).join(' ').toLowerCase(), cand });
  }
  return out.sort((a, b) => a.tiers[0] - b.tiers[0] || a.sort - b.sort || (a.key < b.key ? -1 : 1));
}

/**
 * The tier and operator names of a dbg.addDiy refused because both 自选 slots of the tier hold operators with pieces
 * (server/local-patch.js debugIntent: its NetError.detail, pinned by test/local-patch.test.js), else null.
 * @param {any} detail
 * @returns {{ tier: number, names: string[] } | null}
 */
export function diySlotsFullOf(detail) {
  const m = /^both 自选 slots of tier (\d) hold operators with pieces \(([^)]*)\)/.exec(typeof detail === 'string' ? detail : '');
  return m ? { tier: Number(m[1]), names: m[2] ? m[2].split(', ') : [] } : null;
}

/**
 * The enemies dbg.addEnemy may queue: [{ key, name, rank, hay }], token-only summons left out, normal → elite → boss,
 * then by key. @param {any[]} enemyList data.list('enemies') @param {(key: string) => any} rawEnemy the Chinese record
 */
export function debugEnemyEntries(enemyList, rawEnemy = () => null) {
  const out = [];
  for (const e of Array.isArray(enemyList) ? enemyList : []) {
    if (!e || typeof e.key !== 'string' || e.tokenOnly) continue;
    const rank = Object.hasOwn(RANK_ORDER, e.rank) ? e.rank : 'NORMAL';
    out.push({ key: e.key, name: e.name || e.key, rank, hay: [e.name, rawEnemy(e.key)?.name, e.key].filter(Boolean).join(' ').toLowerCase() });
  }
  return out.sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank] || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** The entries passing the filters: `bond` '' | DIY | a bond id, `tier` 0 (all) | 1–6, `query` a name fragment. */
export function filterDebugEntries(entries, { bond = '', tier = 0, query = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return entries.filter((e) => {
    if (bond === DIY ? e.kind !== 'diy' : bond && !e.bonds.includes(bond)) return false;
    if (tier && !e.tiers.includes(tier)) return false;
    return !q || e.hay.includes(q);
  });
}

/**
 * @param {{ debug: { fundsPin: boolean, pinValue: number, candidates: any[] } | null | undefined, prep: boolean,
 *   diy?: Record<string, { charId: string, skillIndex: number, uniEquipId: string|null }> | null }} props
 */
export function DebugPanel({ debug, prep, diy }) {
  const [hidden, setHidden] = useState(() => loadPref(HIDDEN_PREF, false) === true);
  const [open, setOpen] = useState(true);
  const [enemyQ, setEnemyQ] = useState('');
  const [enemyKey, setEnemyKey] = useState('');
  const [enemyN, setEnemyN] = useState(1);
  const [bondF, setBondF] = useState('');
  const [tierF, setTierF] = useState(0);
  const [query, setQuery] = useState('');
  const [key, setKey] = useState('');
  const [diyTier, setDiyTier] = useState(6);
  const [elite, setElite] = useState('a');
  const [skillSel, setSkillSel] = useState(null);   // null = the current loadout / default
  const [moduleSel, setModuleSel] = useState(null);
  const [busy, setBusy] = useState(false);
  const candidates = debug?.candidates;
  const chessReady = data.status('chess');
  const entries = useMemo(() => debugEntries(data.list('chess'), candidates, (id) => data.lookupRaw('chess', id), (id) => data.lookup('bonds', id)),
    [candidates, chessReady, data.status('bonds'), data.locale()]);
  const enemyEntries = useMemo(() => debugEnemyEntries(data.list('enemies'), (k) => data.lookupRaw('enemies', k)),
    [data.status('enemies'), data.locale()]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== DEBUG_PANEL_KEY || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      setHidden((h) => {
        savePref(HIDDEN_PREF, !h);
        if (!h) toast(t('调试面板已隐藏，按 {key} 再次显示', { key: DEBUG_PANEL_KEY }));
        return !h;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const bonds = useMemo(() => data.list('bonds').filter((b) => b && b.bondId && entries.some((e) => e.bonds.includes(b.bondId)))
    .sort((a, b) => (a.identifier ?? 99) - (b.identifier ?? 99)), [entries, data.status('bonds'), data.locale()]);
  if (!debug || !Array.isArray(candidates) || hidden) return null;
  const shown = filterDebugEntries(entries, { bond: bondF, tier: tierF, query });
  const sel = shown.find((e) => e.key === key) || shown[0] || null;
  const cand = sel?.kind === 'diy' ? sel.cand : null;
  const tier = cand ? (tierF && cand.tiers[tierF] ? tierF : cand.tiers[diyTier] ? diyTier : sel.tiers[sel.tiers.length - 1]) : sel?.tiers[0];
  const tierRec = cand?.tiers?.[tier] || null;
  const pick = cand && diy ? Object.entries(diy).find(([id, p]) => p && p.charId === cand.charId && id.startsWith(`chess_char_${tier}_`))?.[1] : null;
  const entry = pick ? { skill: pick.skillIndex, module: pick.uniEquipId ?? NONE } : null;
  const skills = tierRec?.skills || [];
  const modules = tierRec?.modules || [];
  const skill = [skillSel, entry?.skill, 0].find((v) => skills.some((s) => s.index === v)) ?? skills[0]?.index ?? null;
  const module = [moduleSel, entry?.module].find((v) => modules.some((m) => m.id === v)) ?? NONE;
  const reset = () => { setSkillSel(null); setModuleSel(null); };
  const finish = async (victory) => { setBusy(true); await act('dbg.finish', { victory }, { sfx: false }); setBusy(false); };
  const toggle = async (e) => { setBusy(true); await act('dbg.funds', { on: !!e.currentTarget.checked }, { sfx: false }); setBusy(false); };
  // like act(), but a tier's two 自选 slots held by operators with pieces toast that reason with their names (the code's
  // own text, BAD_TARGET 「잘못된 대상」, says nothing of why)
  const send = async (type, fields) => {
    try { await net.request(type, fields); audio.sfx('pick'); } catch (err) {
      const full = diySlotsFullOf(err?.detail);
      if (full) toast(t('{tier}阶的两个自选栏位已被持有棋子的干员占用（{names}），请先出售', { tier: roman(full.tier), names: full.names.map((n) => tName(n)).join(', ') }), 'error');
      else toastError(err);
      audio.sfx('error', { volume: 0.6 });
    }
  };
  const add = async () => {
    if (!sel || (cand && !tierRec)) return;
    setBusy(true);
    if (cand) {
      const fields = { charId: cand.charId, tier, golden: elite === 'b' };
      if (Number.isInteger(skill)) fields.skill = skill;
      if (elite === 'b') fields.module = module;
      await send('dbg.addDiy', fields);
    } else {
      await send('dbg.addChess', { chessId: sel.key, golden: elite === 'b' });
    }
    setBusy(false);
  };
  const eq = enemyQ.trim().toLowerCase();
  const enemiesShown = eq ? enemyEntries.filter((e) => e.hay.includes(eq)) : enemyEntries;
  const enemySel = enemiesShown.find((e) => e.key === enemyKey) || enemiesShown[0] || null;
  const queued = Array.isArray(debug.enemies) ? debug.enemies : [];
  const enemyName = (k) => data.lookup('enemies', k)?.name || k;
  const addEnemy = async () => {
    if (!enemySel) return;
    setBusy(true);
    await send('dbg.addEnemy', { enemyKey: enemySel.key, count: enemyN });
    setBusy(false);
  };
  const clearEnemies = async () => { setBusy(true); await act('dbg.clearEnemies', {}, { sfx: false }); setBusy(false); };
  const label = (e) => `${e.tiers.map(roman).join('/')} · ${e.name}`
    + (e.kind === 'diy' ? ` (${t('自选')})` : e.hidden ? ` (${t('隐藏')})` : '');
  return html`<div class="dbgp" role="group" aria-label=${t('调试面板')}>
    <button type="button" class="dbgp__head" onClick=${() => setOpen(!open)} aria-expanded=${open ? 'true' : 'false'}
      title=${t('{key} 键显示 / 隐藏', { key: DEBUG_PANEL_KEY })}>
      <span>DEBUG <span class="dbgp__key">${DEBUG_PANEL_KEY}</span></span><span class="dbgp__fold">${open ? '−' : '+'}</span>
    </button>
    ${open ? html`<div class="dbgp__body">
      <label class="dbgp__pin">
        <input type="checkbox" checked=${!!debug.fundsPin} disabled=${busy} onChange=${toggle} />
        <span>${t('调试用资金固定 {pinValue}', { pinValue: debug.pinValue })}</span>
      </label>
      <div class="dbgp__row">
        <span class="dbgp__label">${t('盟约')}</span>
        <select value=${bondF} onChange=${(e) => { setBondF(e.currentTarget.value); reset(); }}>
          <option value="">${t('全部盟约')}</option>
          <option value=${DIY}>${t('自选')}</option>
          ${bonds.map((b) => html`<option key=${b.bondId} value=${b.bondId}>${tName(b.name)}</option>`)}
        </select>
      </div>
      <div class="dbgp__row">
        <span class="dbgp__label">${t('阶级')}</span>
        <select value=${String(tierF)} onChange=${(e) => { setTierF(Number(e.currentTarget.value)); reset(); }}>
          <option value="0">${t('全部阶级')}</option>
          ${[1, 2, 3, 4, 5, 6].map((n) => html`<option key=${n} value=${String(n)}>${t('{tier}阶', { tier: roman(n) })}</option>`)}
        </select>
      </div>
      <input type="search" class="dbgp__search" value=${query} placeholder=${t('搜索干员 / 职业 / 盟约')} aria-label=${t('搜索干员 / 职业 / 盟约')}
        onInput=${(e) => { setQuery(String(e.currentTarget.value).slice(0, 24)); reset(); }} />
      <div class="dbgp__row">
        <span class="dbgp__label">${t('干员')}</span>
        ${shown.length ? html`<select value=${sel?.key || ''} onChange=${(e) => { setKey(e.currentTarget.value); reset(); }}>
          ${shown.map((e) => html`<option key=${e.key} value=${e.key}>${label(e)}</option>`)}
        </select>` : html`<span class="dbgp__none">${t('没有符合条件的干员')}</span>`}
        <span class="dbgp__count">${shown.length}</span>
      </div>
      <div class="dbgp__row">
        ${cand ? html`<select value=${String(tier)} onChange=${(e) => { setDiyTier(Number(e.currentTarget.value)); reset(); }}>
          ${sel.tiers.filter((n) => !tierF || n === tierF).map((n) => html`<option key=${n} value=${String(n)}>${t('{tier}阶', { tier: roman(n) })}</option>`)}
        </select>` : null}
        <select value=${elite} onChange=${(e) => setElite(e.currentTarget.value)}>
          <option value="a">${t('普通')}</option><option value="b">${t('精锐')}</option>
        </select>
      </div>
      ${cand ? html`<div class="dbgp__row">
        <span class="dbgp__label">${t('技能')}</span>
        <select value=${String(skill ?? '')} onChange=${(e) => setSkillSel(Number(e.currentTarget.value))}>
          ${skills.map((s) => html`<option key=${s.index} value=${String(s.index)}>${`S${s.index + 1} · ${tName(s.name)}`}</option>`)}
        </select>
      </div>` : null}
      ${cand && elite === 'b' ? html`<div class="dbgp__row">
        <span class="dbgp__label">${t('模组')}</span>
        <select value=${module} onChange=${(e) => setModuleSel(e.currentTarget.value)}>
          ${modules.map((m) => html`<option key=${m.id} value=${m.id}>${m.id === NONE ? t('无模组') : `${m.type || m.id} · ${tName(m.name)}`}</option>`)}
        </select>
      </div>` : null}
      <button type="button" class="dbgp__add" disabled=${busy || !prep || !sel} onClick=${add}>${t('加入整备区')}</button>
      <div class="dbgp__sep"></div>
      <input type="search" class="dbgp__search" value=${enemyQ} placeholder=${t('搜索敌人')} aria-label=${t('搜索敌人')}
        onInput=${(e) => setEnemyQ(String(e.currentTarget.value).slice(0, 24))} />
      <div class="dbgp__row">
        <span class="dbgp__label">${t('敌人')}</span>
        ${enemiesShown.length ? html`<select value=${enemySel?.key || ''} onChange=${(e) => setEnemyKey(e.currentTarget.value)}>
          ${enemiesShown.map((e) => html`<option key=${e.key} value=${e.key}>${`${e.name} · ${t(RANK_LABEL[e.rank])}`}</option>`)}
        </select>` : html`<span class="dbgp__none">${t('没有符合条件的敌人')}</span>`}
        <span class="dbgp__count">${enemiesShown.length}</span>
      </div>
      <div class="dbgp__row">
        <span class="dbgp__label">${t('数量')}</span>
        <input type="number" class="dbgp__num" min="1" max="20" step="1" value=${String(enemyN)} aria-label=${t('数量')}
          onInput=${(e) => { const n = Math.trunc(Number(e.currentTarget.value)); if (n >= 1 && n <= 20) setEnemyN(n); }} />
      </div>
      <button type="button" class="dbgp__add" disabled=${busy || !prep || !enemySel} onClick=${addEnemy}>${t('加入下一场作战')}</button>
      ${queued.length ? html`<div class="dbgp__row">
        <span class="dbgp__queued">${t('下一场作战：{list}', { list: queued.map((q) => `${enemyName(q.enemyKey)} ×${q.count}`).join(', ') })}</span>
        <button type="button" class="dbgp__end dbgp__clear" disabled=${busy || !prep} onClick=${clearEnemies}>${t('清空')}</button>
      </div>` : null}
      <div class="dbgp__row">
        <span class="dbgp__label">${t('结算')}</span>
        <button type="button" class="dbgp__end" disabled=${busy} onClick=${() => finish(true)}>${t('胜利')}</button>
        <button type="button" class="dbgp__end" disabled=${busy} onClick=${() => finish(false)}>${t('失败')}</button>
      </div>
    </div>` : null}
  </div>`;
}
