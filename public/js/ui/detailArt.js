// Official look of an operator's detail card (local patch, docs/LOCAL-PATCH.md 「정비 화면 HUD」 — 배치 기물 정보 창): no
// panel box — the operator's art on the left edge at full height, fading out to the right, with the client's
// act2autochess_character_info_subpanel_status / …_subpanel_tabgroup (ui/autochess/[uc]autochessbattle.ab) laid over it,
// matched against the user's in-game screenshots (深巡 / 乌尔比安 / 斯卡蒂 / 盟约·辅助干员, 2026-10-06): the class icon in a
// gold frame (cyan for a helper token), the name, the tier | elite icon LV n (chess.json `status`, the official
// charChessDataDict status), the stat list (攻击 防御 法抗 阻挡 费用, 21 px #b2b2b2), the 攻击范围 tile and one tile per bond, the
// blue HP bar (生命 x/y), the tabs 特质 / 技能 / 特性 / 天赋 and their text. Built from ChessDetail's own blocks
// (ui/detailPanel.js), so every upstream line stays: the live tag and +/− differences, 攻击间隔 / 再部署, the bond counts,
// the merge hint, the module and loadout tags (出售 is the board underframe's, as in the client). Only while the HUD has
// its official look (hudArt `has-hud-art`; css/hud-art.css).
//
// The art: the operator's 立绘 when the local client extraction lists it (data/local-assets.json group `chararts`,
// `<charId>` — tools/local-extract/chararts_extract.py: the default art `<charId>_1` and its `illust_<charId>_1` frame,
// the client's per-art size and offset that line the faces up), placed by that frame (css/hud-art.css `--fx/--fy/--fw/
// --fh`); else the web manifest's half-body portrait (180×360); else no art.
//
//   ChessDetailArt(props)   the props of ChessDetail (ui/detailPanel.js)
//   placingDetail(p, pieces) the card of the operator being placed — dragged (`drag`) or waiting for its direction
//                           (`facing`, screens/game.js): the client shows the same card then, its art more transparent
//                           (KR gameplay captures, 2026-10-06); null for an item / token or an unknown piece

import { useState } from '../../vendor/hooks.module.js';
import { html, TierChip } from './components.js';
import { Img } from './gameComponents.js';
import { ChessDetail, liveStat, RangeGrid, cardRangeGrid, resolveDetail } from './detailPanel.js';
import { attackInterval, fmtNum, chessLoadout } from './gameLogic.js';
import { chessPortraitUrl, profIconUrl, uiUrl } from './assetUrls.js';
import { data, localAsset } from '../data.js';
import { t, N_ } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** Tab → the ChessDetail blocks (CHESS_SECTIONS keys) it shows, in the client's tab order. */
export const ART_TABS = Object.freeze([
  ['garrison', N_('特质'), ['garrison', 'equip']],
  ['skill', N_('技能'), ['skill', 'module']],
  ['trait', N_('特性'), ['trait']],
  ['talents', N_('天赋'), ['talents']],
]);

/**
 * Split ChessDetail's keyed blocks into the official card's parts.
 * @param {any[]} blocks @returns {{ by: Map<string, any>, tabs: Array<{ id: string, label: string, nodes: any[] }> }}
 */
export function artParts(blocks) {
  const by = new Map((Array.isArray(blocks) ? blocks : []).filter((b) => b && b.key != null).map((b) => [String(b.key), b]));
  const tabs = ART_TABS.map(([id, label, keys]) => ({ id, label, nodes: keys.map((k) => by.get(k)).filter(Boolean) })).filter((t) => t.nodes.length);
  return { by, tabs };
}

/**
 * The card's art: the local 立绘 (`chararts`, with its illust frame), else the portrait.
 * @returns {{ src: string|null, full: boolean, frame: { x: number, y: number, w: number, h: number } | null }}
 */
export function cardArt(m, chess) {
  const id = chess?.charId;
  const e = id ? data.get('local')?.groups?.chararts?.[id] : null;
  const src = id ? localAsset('chararts', id) : null;
  if (src) {
    const f = e && e.frame && [e.frame.x, e.frame.y, e.frame.w, e.frame.h].every(Number.isFinite) ? e.frame : null;
    return { src, full: true, frame: f };
  }
  return { src: chessPortraitUrl(m, chess), full: false, frame: null };
}

const fmtInterval = (v) => (Number.isFinite(v) && v > 0 ? `${v.toFixed(2)}s` : '—');
const fmtRes = (v) => (Number.isFinite(v) ? String(Math.round(v * 10) / 10) : '0');

function Line({ k, v, tone, sub, title, cls }) {
  return html`<div class=${cx('dart__stat', tone && `is-${tone}`, cls)} title=${title}><span>${k}</span><b class="num">${v}</b>${sub ? html`<small class="num">${sub}</small>` : null}</div>`;
}

export function ChessDetailArt(props) {
  const [tab, setTab] = useState(null);
  const { chess: c, piece, live = null, snapHp = null, loadout = null } = props;
  const blocks = ChessDetail(props);
  const { by, tabs } = artParts(blocks);
  const m = data.get('assets');
  const lo = chessLoadout(c, loadout, (id) => data.lookup('chess', id));
  const fr = lo?.record || c;
  const s = fr?.stats || {};
  const golden = !!(c.isGolden || piece?.golden);
  const art = cardArt(m, c);
  const fs = art.frame ? `--fx:${art.frame.x};--fy:${art.frame.y};--fw:${art.frame.w};--fh:${art.frame.h}` : '';
  const token = piece?.kind === 'token' || c.profession === 'TOKEN';
  const st = {
    atk: liveStat(live, 'atk', s.atk), def: liveStat(live, 'def', s.def), res: liveStat(live, 'res', s.res ?? 0, fmtRes),
    blockCnt: liveStat(live, 'blockCnt', s.blockCnt, (v) => String(v)), interval: liveStat(live, 'interval', attackInterval(s.bat, s.aspd), fmtInterval),
  };
  const hp = live && live.src === 'battle' && Number.isFinite(live.hp) && Number.isFinite(live.maxHp) ? { hp: live.hp, max: live.maxHp }
    : snapHp || { hp: Number.isFinite(live?.maxHp) ? live.maxHp : s.maxHp, max: Number.isFinite(live?.maxHp) ? live.maxHp : s.maxHp };
  const pct = Number.isFinite(hp?.hp) && hp.max > 0 ? Math.max(0, Math.min(100, (hp.hp / hp.max) * 100)) : 100;
  const cur = tabs.find((t) => t.id === tab) || tabs[0] || null;
  const phase = Number.isInteger(c.status?.phase) ? c.status.phase : null;
  const level = Number.isFinite(c.status?.level) ? c.status.level : null;
  const eliteUrl = phase != null ? uiUrl(m, `elite/elite_${phase}`) : null;
  // the bond tiles: ChessDetail's own bond chips (counts, 同构, 本局禁用, the popup on a tap) out of its header
  const chips = findByClass(by.get('head'), 'dbonds');
  const prof = profIconUrl(m, c.profession);
  return [
    html`<div key="art" class=${cx('dart', golden && 'is-golden', token && 'is-token', art.full && 'has-full-art', art.frame && 'has-frame')}>
      <div class="dart__bg" aria-hidden="true" style=${fs}>${art.src ? html`<${Img} src=${art.src} />` : null}</div>
      <div class="dart__head">
        <span class="dart__prof"><i style=${prof ? `background-image:url("${prof}")` : ''}></i></span>
        <h3 class="dart__name">${c.name}</h3>
        <div class="dart__tier">
          <${TierChip} tier=${c.tier} golden=${golden} size="md" />
          ${golden ? html`<span class="dtag-elite">${t('精锐')}</span>` : null}
          <i class="dart__split"></i>
          ${eliteUrl ? html`<img class="dart__elite" src=${eliteUrl} alt="" />` : null}
          ${level != null ? html`<span class="dart__lv"><small>LV</small><b class="num">${level}</b></span>` : null}
        </div>
      </div>
      <div class="dart__mid">
        <div class=${cx('dart__stats', live && 'is-live')} data-live=${live ? live.src || 'prep' : undefined}
            title=${live ? (live.src === 'battle' ? t('当前作战中的实时数值（绿色为增益，红色为减益）') : t('下一场作战开始时的数值')) : undefined}>
          <${Line} k=${t('攻击')} ...${st.atk} />
          <${Line} k=${t('防御')} ...${st.def} />
          <${Line} k=${t('法抗')} ...${st.res} />
          <${Line} k=${t('阻挡')} ...${st.blockCnt} cls="is-white" />
          <${Line} k=${t('费用')} v=${s.cost ?? '—'} cls="is-white" />
          <${Line} k=${t('攻击间隔')} ...${st.interval} cls="is-extra" />
          <${Line} k=${t('再部署')} v=${s.respawnTime != null ? `${s.respawnTime}s` : '—'} cls="is-extra" />
        </div>
        <div class="dart__tiles">
          <div class="dart__tile dart__range"><${RangeGrid} grid=${cardRangeGrid(live, fr, c)} /><span>${t('攻击范围')}</span></div>
          ${chips}
        </div>
      </div>
      <div class="dart__hp"><i style=${`width:${pct}%`}></i><span><em>${t('生命')}</em><b class="num">${fmtNum(hp?.hp)}/${fmtNum(hp?.max)}</b></span></div>
    </div>`,
    tabs.length ? html`<div key="tabs" class="dart__tabs" role="tablist">
      ${tabs.map((tb) => html`<button key=${tb.id} type="button" role="tab" aria-selected=${tb === cur ? 'true' : 'false'}
          class=${cx('dart__tab', tb === cur && 'is-on')} onClick=${() => setTab(tb.id)}>${t(tb.label)}</button>`)}
    </div>` : null,
    by.get('merge') || null,
    cur ? html`<div key=${`pane:${cur.id}`} class=${cx('dart__pane', `dart__pane--${cur.id}`)} role="tabpanel">${cur.nodes}</div>` : null,
  ].filter(Boolean);
}

/** The first vnode under `node` whose class list holds `cls` (ChessDetail's bond chips inside its header). */
function findByClass(node, cls, depth = 0) {
  if (!node || depth > 8) return null;
  if (Array.isArray(node)) {
    for (const n of node) { const f = findByClass(n, cls, depth + 1); if (f) return f; }
    return null;
  }
  if (typeof node !== 'object') return null;
  const p = node.props || {};
  const c = typeof p.class === 'string' ? p.class : typeof p.className === 'string' ? p.className : '';
  if (c.split(/\s+/).includes(cls)) return node;
  if (typeof node.type === 'function' && node.type.name === 'BondChips') return node;
  return findByClass(p.children, cls, depth + 1);
}

/**
 * @param {{ uid?: number, piece?: any } | null} p screens/game.js `drag` or `facing`
 * @param {Map<number, any>} pieces indexPieces(priv)
 * @returns {any|null} a resolveDetail result of type 'chess'
 */
export function placingDetail(p, pieces) {
  if (!p || !Number.isInteger(p.uid)) return null;
  const d = resolveDetail({ kind: 'piece', uid: p.uid }, pieces);
  if (d && d.type === 'chess') return d;
  const piece = p.piece;
  const c = piece && piece.kind === 'chess' ? data.lookup('chess', piece.id) : null;
  return c ? { type: 'chess', chess: c, piece } : null;
}
