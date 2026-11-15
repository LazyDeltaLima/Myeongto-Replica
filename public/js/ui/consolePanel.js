// 콘솔 모드: the in-game console panel (docs/rules/ui.md 「콘솔 모드」). The server adds m.private.console only for a
// player who may use it — the seat of a console match (a solo room that turned it on, room.setConsole), or any seat
// while the server runs in local debug mode (the former debug panel, merged here: maintainer decision 2026-11-15) —
// and checks every con.* message again (server/local-console.js), so the panel is a convenience, not a gate.
//
// Left of the board (the solo seat's team list is empty there), five tabs: 오퍼레이터 (normal chess and the 自选 picks:
// tier, core / add-on bond and name filters; a tap adds to the hand, a 自选 pick opens its small window: tier, normal /
// elite, skill, module), 장비 (con.addItem), 적 (con.addEnemy, the next battle's queue), 라운드 (con.jumpRound to any
// round, the 완성 보드 block con.presetBoard, the leaders con.setBoss, the funds pin, 콘솔 끝내기 → con.end), 맹약
// (con.setLayers per bond, core and add-on apart, 「↺ 초기화」 con.resetLayers). The head holds 「✎ 제보」 (the settlement
// screen's feedback window, during the match; the server attaches the console log) in a console match. ` (Backquote)
// folds / unfolds it (remembered per browser); folded, a 「CONSOLE」 tab stays at the top left. When the match goes back
// to a prep instead of ending (m.private.console.note), a notice shows once. On a phone (short and touch) it is a sheet
// over the left of the screen with the tabs as a vertical rail (css/console-panel.css). Per-frame cost: none — it renders
// on m.private changes, the icon grid only for the open tab (docs/rules/render.md 「함정」).

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from '../../vendor/hooks.module.js';
import { html, roman, tierChipUrl } from './components.js';
import { BondDisc } from './components.js';
import { act } from './gameActions.js';
import { toast, toastError } from './toasts.js';
import { FeedbackModal, feedbackStore } from './feedback.js';
import { bondBoardOf } from './hudArt.js';
import { bondIconUrl, chessAvatarUrl, enemyIconUrl, itemIconUrl, uiUrl } from './assetUrls.js';
import { DIY, consoleItemEntries, debugEnemyEntries, debugEntries, diySlotsFullOf, filterDebugEntries, filterItemEntries, ourSideEnemyKeys, ownedBondSets } from './consoleLists.js';
import { ownDiyRecord, pieceBondIds } from './gameLogic.js';
import { net } from '../net.js';
import { audio } from '../audio.js';
import { data } from '../data.js';
import { loadPref, savePref, useStore } from '../store.js';
import { N_, t, tName } from '../../../shared/i18n.js';
import { PHASE } from '../../../shared/constants.js';

export const CONSOLE_KEY = '`';            // KeyboardEvent.key that folds / unfolds the panel
const CONSOLE_CODE = 'Backquote';
const OPEN_PREF = 'consoleOpen';
const TAB_PREF = 'consoleTab';
const NOTE_MS = 7000;
const NONE = 'none';
const cx = (...p) => p.flat().filter(Boolean).join(' ');

const TABS = [['ops', N_('干员')], ['items', N_('装备')], ['enemies', N_('敌人')], ['round', N_('回合')], ['bonds', N_('盟约')]];
// the fold glyph (a panel with its edge arrow): the head's fold button and the phone rail's (maintainer decision
// 2026-11-15: no tab icons, the key in the fold button's tooltip)
const FOLD_ICON = html`<svg class="cxp__fold" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M9 4v16M16 9l-3 3 3 3"/></svg>`;
/** con.presetBoard `layers` (server/local-debug-board.js DEBUG_LAYER_LEVELS) and their labels */
const LAYER_LEVELS = [['keep', N_('保持当前')], ['normal', N_('常规')], ['strong', N_('较多')], ['max', N_('上限')]];
const NOTE_TEXT = {
  cleared: N_('最终攻势已通关——不结算，回到第{round}回合的整备'),
  hiddenCleared: N_('隐秘核心已通关——不结算，回到第{round}回合的整备'),
  defeat: N_('首领回合失败——不结算，回到第{round}回合的整备'),
  eliminated: N_('目标生命值耗尽——不淘汰，生命值恢复，重新进行第{round}回合'),
};

/** The panel's request: the server's refusal toasted (a tier's two 自选 slots taken: with the names). */
async function send(type, fields = {}) {
  try {
    await net.request(type, fields);
    audio.sfx('pick');
    return true;
  } catch (err) {
    const full = diySlotsFullOf(err?.detail);
    if (full) toast(t('{tier}阶的两个自选栏位已被持有棋子的干员占用（{names}），请先出售', { tier: roman(full.tier), names: full.names.map((n) => tName(n)).join(', ') }), 'error');
    else toastError(err);
    audio.sfx('error', { volume: 0.6 });
    return false;
  }
}

const typing = (e) => { const el = e.target; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable); };

/**
 * @param {{ con: any, pub: any, priv: any, phase: string }} props — con = m.private.console
 */
export function ConsolePanel({ con, pub, priv, phase }) {
  const [open, setOpen] = useState(() => loadPref(OPEN_PREF, true) !== false);
  const [tab, setTab] = useState(() => { const v = loadPref(TAB_PREF, 'ops'); return TABS.some(([k]) => k === v) ? v : 'ops'; });
  const [fb, setFb] = useState(false);
  const [ending, setEnding] = useState(false);
  const feedbackOn = useStore((s) => s.enabled, Object.is, feedbackStore);
  const toggle = (v) => setOpen((o) => { const n = typeof v === 'boolean' ? v : !o; savePref(OPEN_PREF, n); return n; });
  const pick = (k) => { setTab(k); savePref(TAB_PREF, k); };
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key !== CONSOLE_KEY && e.code !== CONSOLE_CODE) || e.repeat || e.ctrlKey || e.altKey || e.metaKey || typing(e)) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!con) return null;
  const prep = phase === PHASE.PREP;
  const live = con.console === true;
  const hand = Array.isArray(priv?.hand) ? priv.hand : [];
  const handUsed = hand.filter(Boolean).length;
  const foldTip = `${t('收起')} · ${t('{key} 键显示 / 隐藏', { key: CONSOLE_KEY })}`;
  const head = html`<div class="cxp__head">
    <span class="cxp__tag">CONSOLE</span><b class="cxp__title">${t('控制台')}</b>
    <span class="cxp__sub" title=${live ? t('自由更改干员、装备、敌人、回合、首领与盟约层数；不结算，也不计入统计、成就和战绩') : null}>${live ? t('不计入统计、成就和战绩') : t('本地调试')}</span>
    ${live && feedbackOn ? html`<button type="button" class="cxp__fb" onClick=${() => setFb(true)}>✎ ${t('报错')}</button>` : null}
    <button type="button" class="cxp__x" aria-label=${t('收起')} title=${foldTip} onClick=${() => toggle(false)}>${FOLD_ICON}</button>
  </div>`;
  const tabs = html`<div class="cxp__tabs" role="tablist">
    ${TABS.map(([k, label]) => html`<button key=${k} type="button" role="tab" aria-selected=${tab === k ? 'true' : 'false'}
      class=${cx('cxp__tab', tab === k && 'on')} onClick=${() => pick(k)}><span>${t(label)}</span></button>`)}
  </div>`;
  const body = tab === 'ops' ? html`<${OpsTab} con=${con} priv=${priv} prep=${prep} />`
    : tab === 'items' ? html`<${ItemsTab} prep=${prep} />`
    : tab === 'enemies' ? html`<${EnemiesTab} con=${con} prep=${prep} />`
    : tab === 'round' ? html`<${RoundTab} con=${con} pub=${pub} prep=${prep} onEnd=${() => setEnding(true)} />`
    : html`<${BondsTab} con=${con} priv=${priv} prep=${prep} />`;
  const foot = tab === 'ops' || tab === 'items'
    ? html`<div class="cxp__foot"><span>${tab === 'ops' ? t('点击直接加入备战区 · 三个相同棋子自动合成') : t('点击加入备战区 · 拖到干员身上装备')}</span>
        <span class="cxp__sp"></span><span>${t('备战区')} <b>${handUsed}/${hand.length || 5}</b></span></div>`
    : tab === 'enemies' ? html`<div class="cxp__foot"><span>${t('点击加入下一场作战 · 也显示在敌情预览和效果列表')}</span></div>`
    : tab === 'round' ? html`<div class="cxp__foot"><span>${live ? t('首领回合胜利后不结算，回到同一回合的整备') : t('本地调试：结算照常记录')}</span></div>`
    : html`<div class="cxp__foot"><span>${t('层数立即生效，从下一场作战起作用 · 「重置」= 回到在控制台修改之前的层数')}</span></div>`;
  return html`
    <${ConsoleNote} note=${con.note} />
    ${open ? html`<div class="cxp" role="dialog" aria-label=${t('控制台')}>
      <div class="cxp__rail"><span class="cxp__tag">CONSOLE</span>${tabs}
        <button type="button" class="cxp__x" aria-label=${t('收起')} onClick=${() => toggle(false)}>${FOLD_ICON}</button></div>
      <div class="cxp__main">${head}${tabs}<div class="cxp__body">${body}</div>${foot}</div>
    </div>` : html`<button type="button" class="cxp-launch" onClick=${() => toggle(true)} title=${t('{key} 键显示 / 隐藏', { key: CONSOLE_KEY })}>
      <span class="cxp__tag">CONSOLE</span>${t('控制台')}<span class="cxp__kbd">${CONSOLE_KEY}</span></button>`}
    ${fb ? html`<${FeedbackModal} console=${true} onClose=${() => setFb(false)} />` : null}
    ${ending ? html`<${ConsoleEndDialog} live=${live} onClose=${() => setEnding(false)} />` : null}`;
}

/** The notice of a match that went back to a prep instead of ending (once per note.seq; none for a note older than the page). */
function ConsoleNote({ note }) {
  const seen = useRef(note?.seq ?? 0);
  const [shown, setShown] = useState(null);
  useEffect(() => {
    if (!note || !(note.seq > seen.current)) return undefined;
    seen.current = note.seq;
    setShown(note);
    const id = setTimeout(() => setShown(null), NOTE_MS);
    return () => clearTimeout(id);
  }, [note?.seq]);
  if (!shown || !NOTE_TEXT[shown.kind]) return null;
  return html`<div class="cxp-note" role="status" aria-live="polite" onClick=${() => setShown(null)}>
    <span class="cxp__tag">CONSOLE</span>
    <span><b>${t(NOTE_TEXT[shown.kind], { round: shown.round })}</b>
      <small>${t('可以换首领或回合再试 · 要结束请到 控制台 ▸ 回合 ▸ 结束控制台')}</small></span>
  </div>`;
}

/** 「콘솔 끝내기…」: the official confirm dialog's look (battleArt 'confirm') with three answers. */
function ConsoleEndDialog({ live, onClose }) {
  const [art, setArt] = useState(null);
  useEffect(() => {
    let on = true;
    import('./battleArt.js').then((m) => { if (on) setArt(m.battleArt('confirm')); }).catch(() => { if (on) setArt({ cls: '', style: '' }); });
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => { on = false; window.removeEventListener('keydown', onKey, true); };
  }, []);
  const end = async (fields) => { onClose(); await act('con.end', fields, { sfx: false }); };
  const text = live ? t('结束控制台吗？结算画面只用于查看，不会计入记录。') : t('结束本局吗？（本地调试：结算照常记录）');
  if (!art) return null;
  const btn = (cls, label, onClick, icon = true) => html`<button type="button" class=${cx('bcd__btn', cls)} onClick=${onClick}>
    <i class="bcd__btnbg" aria-hidden="true"></i><span class="bcd__group">${icon ? html`<i class="bcd__icon" aria-hidden="true"></i>` : null}<span>${label}</span></span></button>`;
  return html`<div class=${cx('bart', 'bcd', 'cxp-end', art.cls)} style=${art.style} role="dialog" aria-modal="true" aria-label=${text}>
    <i class="bcd__blur" aria-hidden="true"></i>
    <div class="bcd__band" style=${'top:calc(50% - var(--pu) * (39.05 + 257.09 / 2));height:calc(var(--pu) * 257.09)'}>
      <i class="bcd__bg" aria-hidden="true"></i><p class="bcd__text is-alone">${text}</p>
    </div>
    <div class="bcd__btns" style=${'top:calc(50% - var(--pu) * (-140 + 103 / 2));height:calc(var(--pu) * 103)'}>
      ${btn('is-cancel', t('取消'), onClose)}
      ${live ? btn('is-cancel', t('回到同盟'), () => end({ to: 'lobby' }), false) : btn('is-cancel', t('以失败结算'), () => end({ to: 'result', victory: false }), false)}
      ${live ? btn('is-ok', t('前往结算画面'), () => end({ to: 'result' })) : btn('is-ok', t('以胜利结算'), () => end({ to: 'result', victory: true }))}
    </div>
  </div>`;
}

// ---- 오퍼레이터 ------------------------------------------------------------------------------------------------------

const TIER_LIST = [1, 2, 3, 4, 5, 6];
function TierSeg({ value, onChange }) {
  return html`<span class="cxp__seg">
    <b class=${cx(!value && 'on')} onClick=${() => onChange(0)}>${t('全部')}</b>
    ${TIER_LIST.map((n) => { const u = tierChipUrl(n); return html`<b key=${n} class=${cx(u && 'ti', value === n && 'on')} onClick=${() => onChange(n)} title=${roman(n)}>
      ${u ? html`<img src=${u} alt=${roman(n)} />` : roman(n)}</b>`; })}
  </span>`;
}

function Seg({ value, options, onChange, amber = false }) {
  return html`<span class=${cx('cxp__seg', amber && 'amber')}>${options.map(([v, label]) => html`<b key=${v} class=${cx(value === v && 'on')} onClick=${() => onChange(v)}>${label}</b>`)}</span>`;
}

function TierBadge({ tier }) {
  const u = tierChipUrl(tier);
  return u ? html`<img class="cxp__tier" src=${u} alt=${roman(tier)} />` : html`<b class="cxp__tier">${roman(tier)}</b>`;
}

/** An operator / enemy picture on the official avatar plate and frame (equipReplace avatart_bg / _frame). */
function Pic({ src, kind = 'op', tier = 0, children }) {
  const m = data.get('assets');
  const bg = uiUrl(m, 'equipReplace/avatart_bg'), fr = uiUrl(m, 'equipReplace/avatart_frame');
  return html`<span class=${cx('cxp__pic', kind)} style=${bg ? `--ava:url("${bg}")` : undefined}>
    ${src ? html`<img src=${src} alt="" loading="lazy" />` : null}
    ${fr ? html`<i class="fr" style=${`--fr:url("${fr}")`}></i>` : null}
    ${tier ? html`<${TierBadge} tier=${tier} />` : null}${children}</span>`;
}

function OpsTab({ con, priv, prep }) {
  const [bond, setBond] = useState('');
  const [tier, setTier] = useState(0);
  const [query, setQuery] = useState('');
  const [elite, setElite] = useState(false);
  const [pop, setPop] = useState(null); // { key, at: the tapped cell }
  const [busy, setBusy] = useState(false);
  const entries = useMemo(() => debugEntries(data.list('chess'), con.candidates, (id) => data.lookupRaw('chess', id), (id) => data.lookup('bonds', id)),
    [con.candidates, data.status('chess'), data.status('bonds'), data.locale()]);
  const bonds = useMemo(() => data.list('bonds').filter((b) => b && b.bondId && entries.some((e) => e.bonds.includes(b.bondId)))
    .sort((a, b) => (a.identifier ?? 99) - (b.identifier ?? 99)), [entries, data.status('bonds'), data.locale()]);
  const shown = filterDebugEntries(entries, { bond, tier, query });
  const m = data.get('assets');
  const add = async (e, ev) => {
    if (busy || !prep) return;
    if (e.kind === 'diy') { setPop({ key: e.key, at: ev.currentTarget }); return; }
    setBusy(true);
    await send('con.addChess', { chessId: e.key, golden: elite });
    setBusy(false);
  };
  const avatar = (e) => (e.kind === 'diy' ? chessAvatarUrl(m, { charId: e.charId }) : chessAvatarUrl(m, data.lookup('chess', e.key)));
  const chip = (b) => html`<button key=${b.bondId} type="button" class=${cx('cxp__bchip', 'ico', bond === b.bondId && 'on')} title=${tName(b.name)}
      style=${chipArt(m, bond === b.bondId)} onClick=${() => setBond(bond === b.bondId ? '' : b.bondId)}>
    ${bondIconUrl(m, b.bondId) ? html`<img src=${bondIconUrl(m, b.bondId)} alt=${tName(b.name)} />` : tName(b.name).slice(0, 1)}</button>`;
  const popEntry = pop ? entries.find((e) => e.key === pop.key) : null;
  return html`
    <div class="cxp__row"><span class="cxp__k">${t('阶级')}</span><${TierSeg} value=${tier} onChange=${setTier} /><span class="cxp__sp"></span>
      <${Seg} amber value=${elite} options=${[[false, t('普通')], [true, t('精锐')]]} onChange=${setElite} /></div>
    <div class="cxp__row"><span class="cxp__k">${t('类型')}</span>
      <${Seg} value=${bond === DIY ? DIY : bond ? 'x' : ''} options=${[['', t('全部')], [DIY, t('自选')]]} onChange=${setBond} /></div>
    <div class="cxp__row top"><span class="cxp__bk">${t('核心')}</span><span class="cxp__bonds">${bonds.filter((b) => b.isCore).map(chip)}</span></div>
    <div class="cxp__row top"><span class="cxp__bk">${t('附加')}</span><span class="cxp__bonds">${bonds.filter((b) => !b.isCore).map(chip)}</span></div>
    <div class="cxp__row"><input type="search" class="cxp__search" value=${query} placeholder=${t('搜索干员 / 职业 / 盟约')} aria-label=${t('搜索干员 / 职业 / 盟约')}
      onInput=${(e) => setQuery(String(e.currentTarget.value).slice(0, 24))} /><span class="cxp__count">${t('{n} 名', { n: shown.length })}</span></div>
    <div class="cxp__grid g6">
      ${shown.map((e) => html`<button key=${e.key} type="button" class=${cx('cxp__cell', e.hidden && 'hid')} disabled=${!prep} onClick=${(ev) => add(e, ev)} title=${e.name}>
        <${Pic} src=${avatar(e)} tier=${e.kind === 'diy' ? 0 : e.tiers[0]}>
          ${e.kind === 'diy' ? html`<span class="cxp__flag diy">${t('自选')}</span>` : e.hidden ? html`<span class="cxp__flag">${t('隐藏')}</span>` : null}
        <//><span class="nm">${e.name}</span></button>`)}
    </div>
    ${popEntry ? html`<${DiyPop} key=${popEntry.key} entry=${popEntry} at=${pop.at} priv=${priv} tierF=${tier} prep=${prep} onClose=${() => setPop(null)} />` : null}`;
}

/** The bond chip's official disc (bondBoardIcon 1_0 off / 1_1 on), or nothing (the CSS circle). */
const chipArt = (m, on) => { const u = uiUrl(m, `bondBoardIcon/1_${on ? 1 : 0}`); return u ? `--chip:url("${u}")` : undefined; };

/** The 自选 pick's forms in data/backups.json (con.addDiy's server/local-console.js formKey): the page's own, translated. */
const diyForm = (charId, tier, elite) => data.get('backups')?.units?.[charId]?.forms?.[elite ? `2/60/7/${tier === 6 ? 3 : 1}` : '2/1/4/0'] || null;

/**
 * Where the pick window goes in the scrolled list: under the tapped cell, over it when the room below runs out, never
 * outside the visible part of the list (the list scrolls; a fixed top put it above the view).
 */
function placePop(pop, cell) {
  const body = pop?.offsetParent;
  if (!body || !cell) return;
  const b = body.getBoundingClientRect(), c = cell.getBoundingClientRect();
  const gap = 4, h = pop.offsetHeight, top0 = body.scrollTop, bottom0 = top0 + body.clientHeight;
  let top = c.bottom - b.top + top0 + gap;
  if (top + h > bottom0 - gap) top = c.top - b.top + top0 - h - gap;
  pop.style.top = `${Math.max(top0 + gap, Math.min(top, bottom0 - h - gap))}px`;
}

/** A 自选 pick's small window: tier V / VI, normal / elite, skill, module (elite only) → con.addDiy. */
function DiyPop({ entry, at, priv, tierF, prep, onClose }) {
  const cand = entry.cand;
  const ref = useRef(null);
  const [tier, setTier] = useState(() => (tierF && cand.tiers[tierF] ? tierF : cand.tiers[6] ? 6 : 5));
  const [elite, setElite] = useState(false);
  const pickOf = (tr) => Object.entries(priv?.diy || {}).find(([id, p]) => p && p.charId === cand.charId && id.startsWith(`chess_char_${tr}_`))?.[1] || null;
  const [skill, setSkill] = useState(() => pickOf(tier)?.skillIndex ?? 0);
  const [mod, setMod] = useState(() => pickOf(tier)?.uniEquipId ?? NONE);
  const [busy, setBusy] = useState(false);
  const rec = cand.tiers[tier] || { skills: [], modules: [] };
  const m = data.get('assets');
  useLayoutEffect(() => placePop(ref.current, at), [at, tier, elite]);
  // the server's candidates carry the Chinese names; the page's backups have them in the player's language
  const skillName = (s) => diyForm(cand.charId, tier, false)?.skills?.[s.index]?.name || tName(s.name);
  const modName = (x) => { const r = (diyForm(cand.charId, tier, true)?.modules || []).find((y) => y.uniEquipId === x.id); return r?.typeName || x.type || r?.name || tName(x.name); };
  const add = async () => {
    setBusy(true);
    const fields = { charId: cand.charId, tier, golden: elite };
    if (rec.skills.some((s) => s.index === skill)) fields.skill = skill;
    if (elite) fields.module = rec.modules.some((x) => x.id === mod) ? mod : NONE;
    const ok = await send('con.addDiy', fields);
    setBusy(false);
    if (ok) onClose();
  };
  return html`<div class="cxp__pop" ref=${ref} role="dialog" aria-label=${entry.name}>
    <div class="ttl"><img src=${chessAvatarUrl(m, { charId: cand.charId }) || ''} alt="" /><span><b>${entry.name}</b><small>${t('自选干员')}</small></span>
      <span class="cxp__sp"></span><button type="button" class="cxp__x" aria-label=${t('关闭')} onClick=${onClose}>×</button></div>
    <div class="cxp__row"><span class="cxp__k">${t('阶级')}</span>
      <${Seg} value=${tier} options=${Object.keys(cand.tiers).map(Number).map((n) => [n, roman(n)])} onChange=${setTier} /><span class="cxp__sp"></span>
      <${Seg} amber value=${elite} options=${[[false, t('普通')], [true, t('精锐')]]} onChange=${setElite} /></div>
    <div class="cxp__sk">${rec.skills.map((s) => html`<span key=${s.index} class=${cx(skill === s.index && 'on')} onClick=${() => setSkill(s.index)}>
      <b>S${s.index + 1}</b>${skillName(s)}</span>`)}</div>
    ${elite ? html`<div class="cxp__row"><span class="cxp__k">${t('模组')}</span>
      <${Seg} value=${mod} options=${rec.modules.map((x) => [x.id, x.id === NONE ? t('无') : modName(x)])} onChange=${setMod} /></div>` : null}
    <button type="button" class="cxp__btn full" disabled=${busy || !prep} onClick=${add}>${t('加入备战区')}</button>
  </div>`;
}

// ---- 장비 ----------------------------------------------------------------------------------------------------------

function ItemsTab({ prep }) {
  const [tier, setTier] = useState(0);
  const [golden, setGolden] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const entries = useMemo(() => consoleItemEntries(data.list('items'), (id) => data.lookupRaw('items', id)), [data.status('items'), data.locale()]);
  const shown = filterItemEntries(entries, { tier, golden, query });
  const m = data.get('assets');
  const add = async (e) => { if (busy) return; setBusy(true); await send('con.addItem', { itemId: e.key, golden }); setBusy(false); };
  return html`
    <div class="cxp__row"><span class="cxp__k">${t('阶级')}</span><${TierSeg} value=${tier} onChange=${setTier} /><span class="cxp__sp"></span>
      <${Seg} amber value=${golden} options=${[[false, t('普通')], [true, t('强化')]]} onChange=${setGolden} /></div>
    <div class="cxp__row"><input type="search" class="cxp__search" value=${query} placeholder=${t('搜索装备名称 / 效果')} aria-label=${t('搜索装备名称 / 效果')}
      onInput=${(e) => setQuery(String(e.currentTarget.value).slice(0, 24))} /><span class="cxp__count">${t('{n} 件', { n: shown.length })}</span></div>
    <div class="cxp__grid g6">
      ${shown.map((e) => { const rec = data.lookup('items', e.key); const rar = uiUrl(m, `itemRarity/r${Math.min(6, Math.max(1, e.tier || 1))}`);
        return html`<button key=${e.key} type="button" class="cxp__cell" disabled=${!prep} onClick=${() => add(e)} title=${e.name}>
          <span class="cxp__pic item" style=${rar ? `--rar:url("${rar}")` : undefined}>${itemIconUrl(m, rec) ? html`<img src=${itemIconUrl(m, rec)} alt="" loading="lazy" />` : null}
            ${e.magic ? html`<span class="cxp__flag magic">${t('特殊')}</span>` : golden ? html`<span class="cxp__flag elite">${t('强化')}</span>` : null}</span>
          <span class="nm">${e.name}</span></button>`; })}
    </div>`;
}

// ---- 적 ------------------------------------------------------------------------------------------------------------

function EnemiesTab({ con, prep }) {
  const [rank, setRank] = useState('');
  const [query, setQuery] = useState('');
  const [n, setN] = useState(1);
  const [busy, setBusy] = useState(false);
  const entries = useMemo(() => debugEnemyEntries(data.list('enemies'), (k) => data.lookupRaw('enemies', k), ourSideEnemyKeys(data.list('effects'))),
    [data.status('enemies'), data.status('effects'), data.locale()]);
  const q = query.trim().toLowerCase();
  const shown = entries.filter((e) => (!rank || e.rank === rank) && (!q || e.hay.includes(q)));
  const m = data.get('assets');
  const queued = Array.isArray(con.enemies) ? con.enemies : [];
  const add = async (e) => { if (busy) return; setBusy(true); await send('con.addEnemy', { enemyKey: e.key, count: n }); setBusy(false); };
  const clear = async (enemyKey = null) => { setBusy(true); await send('con.clearEnemies', enemyKey ? { enemyKey } : {}); setBusy(false); };
  const name = (k) => data.lookup('enemies', k)?.name || k;
  return html`
    <div class="cxp__row"><span class="cxp__k">${t('阶级')}</span>
      <${Seg} value=${rank} options=${[['', t('全部')], ['NORMAL', t('普通')], ['ELITE', t('精英')]]} onChange=${setRank} />
      <span class="cxp__sp"></span><span class="cxp__hint">${t('首领在「回合」页选择')}</span></div>
    <div class="cxp__row"><input type="search" class="cxp__search" value=${query} placeholder=${t('搜索敌人')} aria-label=${t('搜索敌人')}
      onInput=${(e) => setQuery(String(e.currentTarget.value).slice(0, 24))} />
      <span class="cxp__k">${t('数量')}</span><span class="cxp__step"><i onClick=${() => setN(Math.max(1, n - 1))}>−</i><b class="num">${n}</b><i onClick=${() => setN(Math.min(20, n + 1))}>+</i></span></div>
    <div class="cxp__grid g7">
      ${shown.map((e) => html`<button key=${e.key} type="button" class="cxp__cell" disabled=${!prep} onClick=${() => add(e)}
          title=${e.twin ? `${e.name} · HP ${e.hp}` : e.name}>
        <${Pic} kind="enemy" src=${enemyIconUrl(m, e.key)}>${e.rank === 'ELITE' ? html`<span class="cxp__flag elite">${t('精英')}</span>` : null}
          ${e.twin ? html`<span class="cxp__flag hp num">HP ${e.hp}</span>` : null}<//>
        <span class="nm">${e.name}</span></button>`)}
    </div>
    ${queued.length ? html`<div class="cxp__queue">
      <div class="h"><span>${t('下一场作战（第{round}回合）一起出现', { round: (con.boss?.at || 0) + 1 })}</span>
        <button type="button" class="cxp__btn ghost sm" disabled=${busy || !prep} onClick=${() => clear()}>${t('清空')}</button></div>
      <div class="cxp__qlist">${queued.map((x) => html`<span key=${x.enemyKey} class="cxp__q">
        ${enemyIconUrl(m, x.enemyKey) ? html`<img src=${enemyIconUrl(m, x.enemyKey)} alt="" />` : null}${name(x.enemyKey)} <b class="num">×${x.count}</b>
        <i role="button" tabIndex="0" aria-label=${t('移除')} onClick=${() => prep && !busy && clear(x.enemyKey)}>×</i></span>`)}</div>
    </div>` : null}`;
}

// ---- 라운드 --------------------------------------------------------------------------------------------------------

function RoundTab({ con, pub, prep, onEnd }) {
  const boss = con.boss || {};
  const last = con.rounds?.last || boss.round || 14;
  const at = boss.at || pub?.round || 1;
  const [target, setTarget] = useState(null);
  const [bondId, setBondId] = useState('');
  const [level, setLevel] = useState('normal');
  const [busy, setBusy] = useState(false);
  const live = con.console === true;
  const m = data.get('assets');
  const tgt = target && target <= last ? target : null;
  const jump = async () => { if (!tgt) return; setBusy(true); if (await send('con.jumpRound', { round: tgt })) setTarget(null); setBusy(false); };
  const preset = async () => { setBusy(true); await send('con.presetBoard', bondId ? { bondId, layers: level } : { layers: level }); setBusy(false); };
  const setBoss = async (f) => { setBusy(true); await send('con.setBoss', f); setBusy(false); };
  const funds = async () => { setBusy(true); await act('con.funds', { on: !con.fundsPin }, { sfx: false }); setBusy(false); };
  const coreBonds = useMemo(() => data.list('bonds').filter((b) => b && b.isCore).sort((a, b) => (a.identifier ?? 99) - (b.identifier ?? 99)), [data.status('bonds'), data.locale()]);
  const rounds = Array.from({ length: last }, (_, i) => i + 1);
  const label = (r) => (r === at ? t('当前') : r === boss.round ? t('最终攻势') : r === boss.hiddenRound ? t('隐秘核心') : (con.rounds?.sp || []).includes(r) ? t('机变') : '');
  const bossCell = (id, on, f) => { const rec = data.lookup('bosses', id); return html`<button key=${id} type="button" class=${cx('cxp__boss', on && 'on')} disabled=${busy} onClick=${() => setBoss(f)} title=${rec?.name || id}>
    <${Pic} kind="boss" src=${enemyIconUrl(m, rec?.enemyKey) || enemyIconUrl(m, rec?.handbookId)} /><span class="nm">${rec?.name || id}</span></button>`; };
  return html`
    <div class="cxp__sec">${t('回合跳转')} <em>${t('当前第{round}回合', { round: at })}</em></div>
    <div class="cxp__track">${rounds.map((r) => html`<button key=${r} type="button" onClick=${() => setTarget(r)}
      class=${cx('cxp__rd', 'num', r < at && 'past', r === at && 'cur', r === boss.round && 'boss', r === boss.hiddenRound && 'hid', tgt === r && 'tgt')}>
      ${r}${label(r) ? html`<small>${label(r)}</small>` : null}</button>`)}</div>
    <button type="button" class="cxp__btn full" disabled=${busy || !prep || !tgt} onClick=${jump}>${tgt ? t('前往第{round}回合的整备', { round: tgt }) : t('先选择回合')}</button>
    <div class="cxp__sec">${t('成品阵容')}</div>
    <p class="cxp__note">${t('清空场上、备战区和临时区，按盟约布置全精锐阵容（层数按第14回合水平）')}</p>
    <div class="cxp__row"><span class="cxp__k">${t('盟约')}</span>
      <select class="cxp__select" value=${bondId} onChange=${(e) => setBondId(e.currentTarget.value)}>
        <option value="">${t('随机')}</option>${coreBonds.map((b) => html`<option key=${b.bondId} value=${b.bondId}>${tName(b.name)}</option>`)}
      </select>
      <span class="cxp__k">${t('层数')}</span><${Seg} value=${level} options=${LAYER_LEVELS.map(([v, l]) => [v, t(l)])} onChange=${setLevel} /></div>
    <button type="button" class="cxp__btn ghost full" disabled=${busy || !prep} onClick=${preset}>${t('换成成品阵容')}</button>
    <div class="cxp__sec">${t('首领')} <em>${t('更改后从下一个首领回合起生效')}</em></div>
    <div class="cxp__sub2">${t('最终攻势（第{round}回合）', { round: boss.round })}</div>
    <div class="cxp__bosses">${(boss.bosses || []).map((id) => bossCell(id, id === boss.bossId, { final: id }))}</div>
    ${boss.hiddenBosses?.length ? html`<div class="cxp__sub2">${t('隐秘核心（第{round}回合）', { round: boss.hiddenRound })}</div>
      <div class="cxp__bosses">${boss.hiddenBosses.map((id) => bossCell(id, id === boss.hiddenBossId, { hidden: id }))}</div>` : null}
    <div class="cxp__sec">${t('其他')}</div>
    ${live ? html`<div class="cxp__chk on"><i>✓</i><span>${t('首领回合胜利也不结算')}</span><em>${t('控制台固定')}</em></div>` : null}
    <button type="button" class=${cx('cxp__chk', con.fundsPin && 'on')} disabled=${busy} onClick=${funds}><i>${con.fundsPin ? '✓' : ''}</i><span>${t('资金固定为 {pinValue}', { pinValue: con.pinValue })}</span></button>
    ${live ? html`<div class="cxp__chk on"><i>✓</i><span>${t('生命值耗尽也不结算，回到整备（恢复生命值）')}</span><em>${t('控制台固定')}</em></div>` : null}
    <div class="cxp__row"><button type="button" class="cxp__btn warn" onClick=${onEnd}>${live ? t('结束控制台…') : t('结束本局…')}</button>
      <span class="cxp__hint">${live ? t('回到同盟 / 前往结算画面') : t('以胜利 / 失败结算')}</span></div>`;
}

// ---- 맹약 ----------------------------------------------------------------------------------------------------------

function BondsTab({ con, priv, prep }) {
  const [scope, setScope] = useState('all'); // 'all' | 'field' (배치 중) | 'held' (보유 중)
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({});
  const list = useMemo(() => data.list('bonds').filter((b) => b && b.bondId).sort((a, b) => (a.identifier ?? 99) - (b.identifier ?? 99)), [data.status('bonds'), data.locale()]);
  const mine = new Map((Array.isArray(priv?.bonds) ? priv.bonds : []).map((b) => [b.bondId, b]));
  const layers = con.layers || {};
  const base = con.layersBase || null;
  const cap = con.layerCap || 999;
  const D = { chess: data.get('chess'), backups: data.get('backups') };
  const owned = ownedBondSets(priv, (p) => { const c = data.lookup('chess', p.id); return (c && ownDiyRecord(c, priv, D)) || c; },
    (rec, p) => pieceBondIds(rec, p.items, (id) => data.lookup('items', id)));
  const inList = (set) => list.filter((b) => set.has(b.bondId));
  const shown = scope === 'field' ? inList(owned.field) : scope === 'held' ? inList(owned.held) : list;
  const m = data.get('assets');
  const set = async (bondId, v) => {
    const n = Math.max(0, Math.min(cap, Math.trunc(Number(v)) || 0));
    setDraft((d) => { const x = { ...d }; delete x[bondId]; return x; });
    setBusy(true); await send('con.setLayers', { bondId, layers: n }); setBusy(false);
  };
  const reset = async () => { setBusy(true); await send('con.resetLayers'); setBusy(false); };
  const row = (b) => {
    const cur = layers[b.bondId] ?? 0;
    const st = mine.get(b.bondId);
    const th = Array.isArray(b.thresholds) ? b.thresholds : [];
    const board = bondBoardOf(th, st?.count ?? 0, !!st?.active);
    const edited = base && (base[b.bondId] ?? 0) !== cur;
    const val = draft[b.bondId] ?? String(cur);
    return html`<div key=${b.bondId} class=${cx('cxp__brow', st?.active && 'act', edited && 'edit')}>
      <span class="cxp-slot"><div class=${cx('bslot', st?.active && 'is-active')} style=${board.style} data-full=${board.full ? '1' : null}>
        <${BondDisc} name=${tName(b.name)} icon=${bondIconUrl(m, b.bondId)} layers=${b.noStack ? undefined : cur} tier=${st?.tier ?? 0}
          maxTier=${Math.max(1, th.length)} active=${!!st?.active} size="sm" showName=${false} /></div></span>
      <span class="cxp__bname">${tName(b.name)}<small><b>${st?.count ?? 0}</b> / ${th.join('·')}</small></span>
      <span class="cxp__sp"></span>
      ${b.noStack ? html`<span class="cxp__nostack">${t('没有层数')}</span>` : html`<span class="cxp__step">
        <i class="w" onClick=${() => !busy && prep && set(b.bondId, cur - 10)}>−10</i><i onClick=${() => !busy && prep && set(b.bondId, cur - 1)}>−</i>
        <input class="num" inputMode="numeric" value=${val} aria-label=${t('层数')} disabled=${!prep}
          onInput=${(e) => setDraft((d) => ({ ...d, [b.bondId]: String(e.currentTarget.value).replace(/[^0-9]/g, '').slice(0, 5) }))}
          onKeyDown=${(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          onBlur=${() => { if (draft[b.bondId] != null && Number(draft[b.bondId]) !== cur) set(b.bondId, draft[b.bondId]); else setDraft((d) => { const x = { ...d }; delete x[b.bondId]; return x; }); }} />
        <i onClick=${() => !busy && prep && set(b.bondId, cur + 1)}>+</i><i class="w" onClick=${() => !busy && prep && set(b.bondId, cur + 10)}>+10</i>
      </span>
      <button type="button" class="cxp__mx" disabled=${busy || !prep} onClick=${() => set(b.bondId, cap)}>${t('上限')}</button>`}
    </div>`;
  };
  const core = shown.filter((b) => b.isCore), add = shown.filter((b) => !b.isCore);
  return html`
    <div class="cxp__row"><${Seg} value=${scope} options=${[['all', t('全部')], ['field', `${t('部署中')} ${inList(owned.field).length}`], ['held', `${t('持有中')} ${inList(owned.held).length}`]]} onChange=${setScope} />
      <span class="cxp__sp"></span><button type="button" class="cxp__btn ghost sm" disabled=${busy || !prep || !con.layersEdited} onClick=${reset}>↺ ${t('重置')}</button></div>
    <div class="cxp__bl">
      ${core.length ? html`<div class="cxp__bsec">${t('核心盟约')} <b>${core.length}</b><small>CORE</small></div>${core.map(row)}` : null}
      ${add.length ? html`<div class="cxp__bsec">${t('附加盟约')} <b>${add.length}</b><small>ADD-ON</small></div>${add.map(row)}` : null}
    </div>`;
}
