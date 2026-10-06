// Official look of an operator's detail card (local patch, docs/LOCAL-PATCH.md 「정비 화면 HUD」 — 배치 기물 정보 창): the
// client's act2autochess_character_info_subpanel_status / …_subpanel_tabgroup (ui/autochess/[uc]autochessbattle.ab) and
// the user's in-game screenshots (深巡 / 乌尔比安 / 斯卡蒂, 2026-10-06): the art behind, the class icon in a gold frame,
// the name, the tier, the stat list (攻击 防御 法抗 阻挡 费用, 21 px #b2b2b2 labels), the 攻击范围 tile and one tile per
// bond, the blue HP bar (生命 x/y), then the tabs 特质 / 技能 / 特性 / 天赋 (特质 = the 卫戍协议 ability, with the equipped
// items under it — buttonType 5 "autochess_equip" group). Built from ChessDetail's own blocks (ui/detailPanel.js), so
// every upstream line stays: the live tag and +/− differences, 攻击间隔 / 再部署, the bond counts, the merge hint, the
// module, the loadout tags, 出售. Only while the HUD has its official look (hudArt `has-hud-art`; css/hud-art.css).
//
//   ChessDetailArt(props)   the props of ChessDetail (ui/detailPanel.js)

import { useState } from '../../vendor/hooks.module.js';
import { html, TierChip } from './components.js';
import { Img } from './gameComponents.js';
import { ChessDetail, liveStat, RangeGrid, cardRangeGrid } from './detailPanel.js';
import { attackInterval, fmtNum, chessLoadout } from './gameLogic.js';
import { chessPortraitUrl, profIconUrl, subProfIconUrl } from './assetUrls.js';
import { data } from '../data.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** Tab → the ChessDetail blocks (CHESS_SECTIONS keys) it shows, in the client's tab order. */
export const ART_TABS = Object.freeze([
  ['garrison', '特质', ['garrison', 'equip']],
  ['skill', '技能', ['skill', 'module']],
  ['trait', '特性', ['trait']],
  ['talents', '天赋', ['talents']],
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

const fmtInterval = (v) => (Number.isFinite(v) && v > 0 ? `${v.toFixed(2)}s` : '—');
const fmtRes = (v) => (Number.isFinite(v) ? String(Math.round(v * 10) / 10) : '0');

function Line({ k, v, tone, sub, title }) {
  return html`<div class=${cx('dart__stat', tone && `is-${tone}`)} title=${title}><span>${k}</span><b class="num">${v}</b>${sub ? html`<small class="num">${sub}</small>` : null}</div>`;
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
  const st = {
    atk: liveStat(live, 'atk', s.atk), def: liveStat(live, 'def', s.def), res: liveStat(live, 'res', s.res ?? 0, fmtRes),
    blockCnt: liveStat(live, 'blockCnt', s.blockCnt, (v) => String(v)), interval: liveStat(live, 'interval', attackInterval(s.bat, s.aspd), fmtInterval),
  };
  const hp = live && live.src === 'battle' && Number.isFinite(live.hp) && Number.isFinite(live.maxHp) ? { hp: live.hp, max: live.maxHp }
    : snapHp || { hp: Number.isFinite(live?.maxHp) ? live.maxHp : s.maxHp, max: Number.isFinite(live?.maxHp) ? live.maxHp : s.maxHp };
  const pct = Number.isFinite(hp?.hp) && hp.max > 0 ? Math.max(0, Math.min(100, (hp.hp / hp.max) * 100)) : 100;
  const cur = tabs.find((t) => t.id === tab) || tabs[0] || null;
  // the bond tiles: ChessDetail's own bond chips (counts, 同构, 本局禁用, the popup on a tap) out of its header
  const head = by.get('head');
  const chips = findByClass(head, 'dbonds');
  return [
    html`<div key="art" class=${cx('dart', golden && 'is-golden')}>
      <div class="dart__bg" aria-hidden="true"><${Img} src=${chessPortraitUrl(m, c)} /></div>
      <div class="dart__head">
        <span class="dart__prof"><i style=${profIconUrl(m, c.profession) ? `background-image:url("${profIconUrl(m, c.profession)}")` : ''}></i></span>
        <h3 class="dart__name">${c.name}</h3>
        <div class="dart__tier">
          <${TierChip} tier=${c.tier} golden=${golden} size="md" />
          ${golden ? html`<span class="dtag-elite">精锐</span>` : null}
          ${piece?.kind === 'token' ? html`<span class="dtag-token">召唤物</span>` : null}
          <i class="dart__split"></i>
          <${Img} src=${subProfIconUrl(m, c)} class="dart__sub" />
          <span class="dart__subname">${c.subProfessionName || ''}</span>
        </div>
      </div>
      <div class="dart__mid">
        <div class=${cx('dart__stats', live && 'is-live')} data-live=${live ? live.src || 'prep' : undefined}
            title=${live ? (live.src === 'battle' ? '当前作战中的实时数值（绿色为增益，红色为减益）' : '下一场作战开始时的数值') : undefined}>
          <${Line} k="攻击" ...${st.atk} />
          <${Line} k="防御" ...${st.def} />
          <${Line} k="法抗" ...${st.res} />
          <${Line} k="阻挡" ...${st.blockCnt} />
          <${Line} k="费用" v=${s.cost ?? '—'} />
          <${Line} k="攻击间隔" ...${st.interval} />
          <${Line} k="再部署" v=${s.respawnTime != null ? `${s.respawnTime}s` : '—'} />
        </div>
        <div class="dart__tiles">
          <div class="dart__tile dart__range"><${RangeGrid} grid=${cardRangeGrid(live, fr, c)} /><span>攻击范围</span></div>
          ${chips}
        </div>
      </div>
      <div class="dart__hp"><i style=${`width:${pct}%`}></i><span><em>生命</em><b class="num">${fmtNum(hp?.hp)}/${fmtNum(hp?.max)}</b></span></div>
    </div>`,
    by.get('merge') || null,
    tabs.length ? html`<div key="tabs" class="dart__tabs" role="tablist">
      ${tabs.map((t) => html`<button key=${t.id} type="button" role="tab" aria-selected=${t === cur ? 'true' : 'false'}
          class=${cx('dart__tab', t === cur && 'is-on')} onClick=${() => setTab(t.id)}>${t.label}</button>`)}
    </div>` : null,
    cur ? html`<div key=${`pane:${cur.id}`} class=${cx('dart__pane', `dart__pane--${cur.id}`)} role="tabpanel">${cur.nodes}</div>` : null,
    by.get('actions') || null,
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
