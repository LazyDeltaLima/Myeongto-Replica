// Official look of an operator's detail card (local patch, docs/LOCAL-PATCH.md 「정비 화면 HUD」 — 배치 기물 정보 창): no
// panel box — the operator's art on the left edge at full height, fading out to the right, with the client's
// act2autochess_character_info_subpanel_status / …_subpanel_tabgroup (ui/autochess/[uc]autochessbattle.ab) laid over it,
// matched against the maintainer's in-game screenshots (深巡 / 乌尔比安 / 斯卡蒂 / 盟约·辅助干员, 2026-10-06): the class icon in a
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
// 0.2.0 补位 (docs/LOCAL-PATCH.md 「0.2.0 병합」): a chess the player fields as its stand-in shows the
// stand-in like ChessDetail does — art, class, name, stats, range, skill, talents (its backup selection) — with ChessDetail's
// 「替补」 tag and 「X的替补」 line; the chess's tier, elite level, bonds and 特质 stay. 0.2.0 自选: the composed record's
// stats through the pick (the same lookup as ChessDetail; checked equal to the battle's def, 2026-10-08), at the
// operator's 潜能 / 练度 (ChessDetail's `cultOpts`, upstream 7a0937e3).
//
//   ChessDetailArt(props)   the props of ChessDetail (ui/detailPanel.js)
//   placingDetail(p, pieces, opts) the card of the operator being placed — dragged (`drag`) or waiting for its direction
//                           (`facing`, screens/game.js): the client shows the same card then, its art more transparent
//                           (KR gameplay captures, 2026-10-06); resolved like a tap's card (resolveDetail with the
//                           player's m.private: a 自选 slot's operator, a 补位 stand-in — maintainer report 2026-10-08: the
//                           drag showed the bare slot record 「自选干员」); null for an item / token or an unknown piece

import { useRef, useState } from '../../vendor/hooks.module.js';
import { html, Icon, TierChip, Button, useScrollEdges } from './components.js';
import { Img, RichText, GIcon } from './gameComponents.js';
import { ChessDetail, liveStat, RangeGrid, cardRangeGrid, resolveDetail, hpOf, enemyImmunities, RANK, DMG, MorphPairings, MorphGrantLine, PROF_NAME, chessTalents, skillTags, skillTextNote, summonDeployHint } from './detailPanel.js';
import { abilityRows } from './abilityLines.js';
import { attackInterval, fmtNum, chessLoadout, pickGetter, standInLoadout, standInLabel, standInTip, standInForText } from './gameLogic.js';
import { chessPortraitUrl, profIconUrl, uiUrl, enemyIconUrl, factionIconUrl, itemIconUrl, tokenAvatarUrl, skillRecordIconUrl } from './assetUrls.js';
import { tokenVariantFor } from './gameLogic/loadout.js';
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

/** Local-client entry (group ui/battlecommon) of the class glyph every TRAP / TOKEN character shows (ClassBox). */
export const TRAP_CLASS_SPRITE = 'icon_profession_token_lighten';

/**
 * The class box of a TRAP / TOKEN character — a device, an item, a summon (maintainer decision 2026-10-14). The client's
 * status subpanel (UICharacterInfoStatusSubPanelInAutochess `_professionIcons`) gives TOKEN and TRAP the same sprite,
 * icon_profession_token_lighten of arts/ui/[uc]battlecommon.ab (also the prefab's default `image_profession`), which is
 * the whole box: the glowing white rim, the half-dark fill and the white drone glyph — so the box drops its own border
 * and fill (`is-sprite`). Extracted by tools/local-extract (ui/battlecommon); without it, or when it fails to load,
 * `fallback` in the plain box.
 * @param {{ fallback: any }} props
 */
export function ClassBox({ fallback }) {
  const src = localAsset('ui/battlecommon', TRAP_CLASS_SPRITE);
  const [bad, setBad] = useState(null);
  const ok = !!src && bad !== src;
  return html`<span class=${cx('dart__prof', ok && 'is-sprite')}>${ok
    ? html`<img class="dart__profsprite" src=${src} alt="" draggable=${false} onError=${() => setBad(src)} />`
    : fallback}</span>`;
}

const fmtInterval = (v) => (Number.isFinite(v) && v > 0 ? `${v.toFixed(2)}s` : '—');
const fmtRes = (v) => (Number.isFinite(v) ? String(Math.round(v * 10) / 10) : '0');

function Line({ k, v, tone, sub, title, cls }) {
  return html`<div class=${cx('dart__stat', tone && `is-${tone}`, cls)} title=${title}><span>${k}</span><b class="num">${v}</b>${sub ? html`<small class="num">${sub}</small>` : null}</div>`;
}

export function ChessDetailArt(props) {
  const [tab, setTab] = useState(null);
  const { chess: c, piece, live = null, snapHp = null, loadout = null, standIn = null, diy = null, cultOpts = null } = props;
  const blocks = ChessDetail(props);
  const { by, tabs } = artParts(blocks);
  const m = data.get('assets');
  // the body the card shows and the record the unit fights with: as ChessDetail (ui/detailPanel.js) — a 补位 stand-in's
  // backup selection, else the player's loadout over the chess (a 自选 record through its pick)
  const si = standIn && standIn.standInFor ? standIn : null;
  const body = si || c;
  const getChess = diy ? pickGetter((id) => data.lookup('chess', id), diy, { chess: data.get('chess'), backups: data.get('backups') }) : (id) => data.lookup('chess', id);
  // 0.2.2 潜能 / 练度 (upstream 7a0937e3): the same `cultOpts` as ChessDetail — the player's settings or a teammate's unit's own
  const lo = si ? standInLoadout(si, getChess, data.get('backups')) : chessLoadout(c, loadout, getChess, { ...(cultOpts || {}), effects: data.get('effects') });
  const fr = lo?.record || body;
  const s = fr?.stats || {};
  const golden = !!(c.isGolden || piece?.golden);
  const art = cardArt(m, body);
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
  // each tab is its own vertical scroll view, as the client's detailedPanels group_* scroll_desc: equipped items with
  // set-bonus lines ran past the screen's bottom and under the corner buttons, and the pane — which lets presses
  // through to the bench pads under it — could not be scrolled (css/hud-art.css .dart__pane.is-scroll)
  const paneRef = useRef(null);
  const edges = useScrollEdges(paneRef, [cur?.id]);
  const phase = Number.isInteger(c.status?.phase) ? c.status.phase : null;
  const level = Number.isFinite(c.status?.level) ? c.status.level : null;
  const eliteUrl = phase != null ? uiUrl(m, `elite/elite_${phase}`) : null;
  // the bond tiles: ChessDetail's own bond chips (counts, 同构, 本局禁用, the popup on a tap) out of its header
  const chips = findByClass(by.get('head'), 'dbonds');
  const prof = profIconUrl(m, body.profession);
  return [
    html`<div key="art" class=${cx('dart', golden && 'is-golden', token && 'is-token', art.full && 'has-full-art', art.frame && 'has-frame')}>
      <div class="dart__bg" aria-hidden="true" style=${fs}>${art.src ? html`<${Img} src=${art.src} />` : null}</div>
      <div class="dart__head">
        ${body.profession === 'TOKEN' || body.profession === 'TRAP'
          ? html`<${ClassBox} fallback=${html`<i></i>`} />`
          : html`<span class="dart__prof"><i style=${prof ? `background-image:url("${prof}")` : ''}></i></span>`}
        <h3 class="dart__name">${si ? si.name : c.name}</h3>
        ${si ? html`<span class="dart__for" data-for=${c.chessId}>${standInForText(c.name)}</span>` : null}
        <div class="dart__tier">
          <${TierChip} tier=${c.tier} golden=${golden} size="md" />
          ${golden ? html`<span class="dtag-elite">${t('精锐')}</span>` : null}
          ${si ? html`<span class="dtag-standin" data-standin=${si.charId} title=${standInTip(si, c.name)}>${standInLabel(si)}</span>` : null}
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
    cur ? html`<div key=${`pane:${cur.id}`} ref=${paneRef} class=${cx('dart__pane', `dart__pane--${cur.id}`, edges.scroll && 'is-scroll', edges.up && 'has-up', edges.down && 'has-down')}
        role="tabpanel">${cur.nodes}</div>` : null,
  ].filter(Boolean);
}

/**
 * A stage device's card (阻隔工事 / “双眼皮” / 射击台 / 源石流发生装置 — detailPanel DeviceDetail's data, gameLogic deviceInfo /
 * deviceTipAt) in the operator card's official form, while the HUD has its official look: in the client a device is a
 * trap (`Trap : Token : Character`), and a press on it goes the operator's way — AutoChessHighlightState._OnTileClicked →
 * AutoChessUIPlugin.ReqShowCharacterMenu → UICharacterInfoPanel.ShowCharacter, whose status / tab-group subpanels the
 * plugin hooks for every character alike (GitHub #3, maintainer decision 2026-10-14; docs/rules/ui.md). So the same
 * layout and the same press pass-through as ChessDetailArt: the name, the stat list and the 攻击范围 tile (the turret's),
 * the HP bar (a battle's live HP, a prep card shows the record's 生命上限), and the tabs 技能 (the device's own skill text)
 * / 装置机制 (our mechanism lines and what the tile allows). No art (a trap has no 立绘 — [ASSUMED] the client's panel
 * then shows none); the class box is a TRAP's (ClassBox; an info glyph without the local-client sprite).
 * @param {{ device: any, snapHp?: { hp:number, max:number }|null, live?: any }} props
 */
export function DeviceDetailArt({ device, snapHp = null, live = null }) {
  const [tab, setTab] = useState(null);
  const stats = Array.isArray(device?.stats) ? device.stats : [];
  const range = Array.isArray(device?.range) && device.range.length ? device.range : null;
  const sk = device?.skill && typeof device.skill === 'object' && device.skill.text ? device.skill : null;
  const battle = live && live.src === 'battle' && Number.isFinite(live.hp) && Number.isFinite(live.maxHp) ? { hp: live.hp, max: live.maxHp } : null;
  const maxRow = stats.find((x) => x && x.k === t('生命上限'));
  const hp = battle || snapHp || (maxRow && Number.isFinite(Number(maxRow.v)) ? { hp: Number(maxRow.v), max: Number(maxRow.v) } : null);
  const pct = hp && hp.max > 0 ? Math.max(0, Math.min(100, (hp.hp / hp.max) * 100)) : 100;
  const tabs = [
    sk ? { id: 'skill', label: N_('技能'), nodes: [
      sk.name ? html`<p key="n" class="dtext"><b>${sk.name}</b></p>` : null,
      html`<${RichText} key="t" as="p" text=${sk.text} class="dtext" />`,
    ].filter(Boolean) } : null,
    { id: 'device', label: N_('装置机制'), nodes: [
      ...(Array.isArray(device?.lines) ? device.lines : []).map((line, i) => html`<p class="dtext" key=${`l${i}`}>${line}</p>`),
      Array.isArray(device?.facts) && device.facts.length ? html`<p key="f" class="dtext dart__facts"><b>${t('这一格')}</b> ${device.facts.join(' · ')}</p>` : null,
    ].filter(Boolean) },
  ].filter(Boolean);
  const cur = tabs.find((x) => x.id === tab) || tabs[0];
  const paneRef = useRef(null);
  const edges = useScrollEdges(paneRef, [cur?.id]);
  return [
    html`<div key="art" class="dart is-device" data-device=${device?.key || ''}>
      <div class="dart__bg" aria-hidden="true"></div>
      <div class="dart__head">
        <${ClassBox} fallback=${html`<${Icon} name="info" />`} />
        <h3 class="dart__name">${device?.name || ''}</h3>
        <div class="dart__tier"><span class="dtag-kind">${device?.tag || ''}</span></div>
      </div>
      ${stats.length || range ? html`<div class="dart__mid">
        ${stats.length ? html`<div class="dart__stats">${stats.map((x) => html`<${Line} key=${x.k} k=${x.k} v=${x.v} />`)}</div>` : null}
        ${range ? html`<div class="dart__tiles"><div class="dart__tile dart__range"><${RangeGrid} grid=${range} /><span>${t('攻击范围')}</span></div></div>` : null}
      </div>` : null}
      ${hp ? html`<div class="dart__hp"><i style=${`width:${pct}%`}></i><span><em>${t('生命')}</em><b class="num">${fmtNum(hp.hp)}/${fmtNum(hp.max)}</b></span></div>` : null}
    </div>`,
    html`<div key="tabs" class="dart__tabs" role="tablist">
      ${tabs.map((tb) => html`<button key=${tb.id} type="button" role="tab" aria-selected=${tb === cur ? 'true' : 'false'}
          class=${cx('dart__tab', tb === cur && 'is-on')} onClick=${() => setTab(tb.id)}>${t(tb.label)}</button>`)}
    </div>`,
    html`<div key=${`pane:${cur.id}`} ref=${paneRef} class=${cx('dart__pane', `dart__pane--${cur.id}`, edges.scroll && 'is-scroll', edges.up && 'has-up', edges.down && 'has-down')}
        role="tabpanel">${cur.nodes}</div>`,
  ];
}

/**
 * An enemy's card (a boss / the round's leader on the boss field, an enemy of the preview pen, a battle enemy, the
 * 敌方情报 drawer's rows — detailPanel EnemyDetail's data) in the operator card's official form, while the HUD has its
 * official look. The client opens no panel for an enemy: AutoChessHighlightState._OnTileClicked looks for a `Character`
 * only, and `Enemy : Unit` is none — this card is the maintainer's choice (GitHub #3, maintainer decision 2026-10-14;
 * docs/rules/ui.md 「보드에서 연 카드가 벤치를 가림」). So it takes the form and the press pass-through of the cards the client
 * does open (ChessDetailArt, DeviceDetailArt): no box, the board stays pressable under it. The enemy's icon sits in the class
 * box (gold frame for an elite, red for a leader), its rank / ground or air / count where an operator's tier row is, its
 * factions under it; the stat list as EnemyDetail's (live in a battle, coloured against its spawned stats), the HP bar in
 * red; the tabs 能力 (abilities, immunities) / 说明 (the description when it has no abilities). [ASSUMED] the whole layout
 * (no official enemy card exists to measure).
 * @param {{ enemy: any, snapHp?: { hp:number, max:number }|null, count?: number, live?: any }} props
 */
export function EnemyDetailArt({ enemy, snapHp = null, count = 0, live = null }) {
  const [tab, setTab] = useState(null);
  const m = data.get('assets');
  const s = enemy?.stats || {};
  const types = Array.isArray(enemy?.acTypes) ? enemy.acTypes : enemy?.acType ? [enemy.acType] : [];
  const factions = data.get('factions')?.types || {};
  const imm = enemyImmunities(s);
  const st = {
    atk: liveStat(live, 'atk', s.atk), def: liveStat(live, 'def', s.def), res: liveStat(live, 'res', s.res ?? 0, fmtRes),
    moveSpeed: liveStat(live, 'moveSpeed', s.moveSpeed, (v) => String(Math.round(v * 100) / 100)),
    interval: liveStat(live, 'interval', attackInterval(s.bat, s.aspd), fmtInterval),
  };
  const hp = hpOf(live, snapHp) || (Number.isFinite(live?.maxHp) ? { hp: live.maxHp, max: live.maxHp } : Number.isFinite(s.maxHp) ? { hp: s.maxHp, max: s.maxHp } : null);
  const pct = hp && hp.max > 0 ? Math.max(0, Math.min(100, (hp.hp / hp.max) * 100)) : 100;
  const rank = enemy?.rank === 'BOSS' || enemy?.rank === 'ELITE' ? enemy.rank : 'NORMAL';
  const abil = Array.isArray(enemy?.abilities) && enemy.abilities.length ? abilityRows(enemy.abilities, !!live?.silenced) : [];
  const desc = enemy?.descRaw || enemy?.desc || '';
  const immLine = imm.length ? html`<p key="imm" class="dhint"><${Icon} name="shield" />${t('免疫：{list}', { list: imm })}</p>` : null;
  const tabs = [
    abil.length || (immLine && !desc) ? { id: 'abilities', label: N_('能力'), nodes: [
      immLine,
      abil.length ? html`<ul key="a" class="dabil">${abil.map((a, i) => html`<li key=${i} class=${a.off ? 'is-off' : null}><${RichText} text=${a.text} /></li>`)}</ul>` : null,
    ].filter(Boolean) } : null,
    !abil.length && desc ? { id: 'desc', label: N_('说明'), nodes: [immLine, html`<${RichText} key="d" as="p" text=${desc} class="dtext" />`].filter(Boolean) } : null,
  ].filter(Boolean);
  const cur = tabs.find((x) => x.id === tab) || tabs[0] || null;
  const paneRef = useRef(null);
  const edges = useScrollEdges(paneRef, [cur?.id]);
  return [
    html`<div key="art" class=${cx('dart', 'is-enemy', `is-${rank.toLowerCase()}`)} data-enemy=${enemy?.key || ''}>
      <div class="dart__bg" aria-hidden="true"></div>
      <div class="dart__head">
        <span class="dart__prof"><${Img} src=${enemyIconUrl(m, enemy?.key)} fallback=${html`<${GIcon} name="skull" />`} /></span>
        <h3 class="dart__name">${enemy?.name || ''}</h3>
        <div class="dart__tier">
          <span class=${cx('drank', `drank--${rank.toLowerCase()}`)}>${t(RANK[rank])}</span>
          <span class="dtag-kind">${s.motion === 'FLY' ? t('空中') : t('地面')}</span>
          ${count ? html`<span class="dtag-kind num">×${count}</span>` : null}
        </div>
        ${types.length ? html`<div class="dart__factions">${types.map((k) => html`<span key=${k} class="dfaction"><${Img} src=${factionIconUrl(m, factions[k]?.icon)} />${factions[k]?.name || k}</span>`)}</div>` : null}
      </div>
      <div class="dart__mid">
        <div class=${cx('dart__stats', live && 'is-live')} data-live=${live ? live.src || 'battle' : undefined}
            title=${live ? (live.src === 'battle' ? t('当前作战中的实时数值（绿色为增益，红色为减益）') : t('下一场作战开始时的数值')) : undefined}>
          <${Line} k=${t('攻击')} ...${st.atk} sub=${st.atk.sub || t(DMG[s.dmgType]) || ''} />
          <${Line} k=${t('防御')} ...${st.def} />
          <${Line} k=${t('法抗')} ...${st.res} />
          <${Line} k=${t('移动速度')} ...${st.moveSpeed} cls="is-white" />
          <${Line} k=${t('攻击范围')} v=${s.rangeRadius > 0 ? s.rangeRadius : t('近战')} cls="is-white" />
          <${Line} k=${t('目标价值')} v=${s.lpr ?? 1} cls="is-white" />
          <${Line} k=${t('攻击间隔')} ...${st.interval} cls="is-extra" />
        </div>
      </div>
      ${hp ? html`<div class="dart__hp"><i style=${`width:${pct}%`}></i><span><em>${t('生命')}</em><b class="num">${fmtNum(hp.hp)}/${fmtNum(hp.max)}</b></span></div>` : null}
    </div>`,
    tabs.length ? html`<div key="tabs" class="dart__tabs" role="tablist">
      ${tabs.map((tb) => html`<button key=${tb.id} type="button" role="tab" aria-selected=${tb === cur ? 'true' : 'false'}
          class=${cx('dart__tab', tb === cur && 'is-on')} onClick=${() => setTab(tb.id)}>${t(tb.label)}</button>`)}
    </div>` : null,
    cur ? html`<div key=${`pane:${cur.id}`} ref=${paneRef} class=${cx('dart__pane', `dart__pane--${cur.id}`, edges.scroll && 'is-scroll', edges.up && 'has-up', edges.down && 'has-down')}
        role="tabpanel">${cur.nodes}</div>` : null,
  ].filter(Boolean);
}

/**
 * The trap behind an item: every 装备 and 奇术 of data/items.json is a trap of the client (`trapId` → character_table:
 * profession TRAP, phase 0 at level 1, HP 100, ATK / DEF / RES / block 0, range 0-1 — 画卷's 1-1 is the item's
 * `rangeGrid` already; cost 0 for the 112 equipment, 5 for the 3 奇术), so the official card shows those numbers
 * (test/ui/item-card-art.test.js checks them against the tables when they are downloaded).
 * @param {any} item items.json record
 */
export function itemTrapStats(item) {
  return { level: 1, maxHp: 100, atk: 0, def: 0, res: 0, blockCnt: 0, cost: item?.itemType === 'MAGIC' ? 5 : 0 };
}

/**
 * An item's card (装备 / 奇术: a hand or temp item, a shop or reward card, an item on a scouted board — detailPanel
 * ItemDetail's data) in the operator card's official form, while the HUD has its official look. In the client an item
 * is a trap (`trapId`, `Trap : Token : Character`), and a press on it opens UICharacterInfoPanel like an operator's
 * (the maintainer's capture of 不屈弹射器, maintainer decision 2026-10-14): the class box, the name, the tier | LV 1, the
 * trap's stats (itemTrapStats, all 0), the 攻击范围 tile, the HP bar 生命 100/100, and the tab 技能 — the item's art as the
 * skill icon, its effect name, a 被动 tag (the trap's skills are PASSIVE) and the effect text. Ours after it: a
 * 变形同构体's 天赋 tab (its pairings), and a 说明 tab (the flavour text, how it is used, where an unsold item comes from).
 * No art (a trap has no 立绘); the class box holds the device card's glyph ([ASSUMED]: the client's TRAP class icon is
 * not extracted). 销毁 stays the underframe's (the card renders it only for a caller that passes `editable` + `onDestroy`).
 * @param {{ item: any, piece?: any, editable?: boolean, onDestroy?: Function, offBonds?: Set<string>|null }} props
 */
export function ItemDetailArt({ item, piece = null, editable = false, onDestroy = null, offBonds = null }) {
  const [tab, setTab] = useState(null);
  const m = data.get('assets');
  const st = itemTrapStats(item);
  const golden = !!item?.isGolden;
  const magic = item?.itemType === 'MAGIC';
  const range = Array.isArray(item?.rangeGrid) && item.rangeGrid.length ? item.rangeGrid : [[0, 0]];
  const tabs = [
    { id: 'skill', label: N_('技能'), nodes: [
      html`<div key="s" class="dskill" data-item=${item?.id || ''}>
        <${Img} src=${itemIconUrl(m, item)} class="dskill__icon dskill__icon--item" fallback=${html`<span class="dskill__icon dskill__icon--empty"><${GIcon} name="bolt" /></span>`} />
        <div class="dskill__meta">
          <b class="dskill__name">${item?.effectName || item?.name || ''}</b>
          <div class="dskill__tags"><span class="dsp dsp--trig">${t('被动')}</span></div>
        </div>
      </div>`,
      html`<${RichText} key="d" as="p" text=${item?.descRaw || item?.desc || ''} class="dtext" />`,
      !item?.canGiveBond && item?.giveBondId ? html`<${MorphGrantLine} key="g" item=${item} off=${offBonds} />` : null,
      item?.note ? html`<p key="n" class="dhint dhint--rule"><${Icon} name="info" />${item.note}</p>` : null,
    ].filter(Boolean) },
    item?.canGiveBond ? { id: 'talents', label: N_('天赋'), nodes: [html`<${MorphPairings} key="p" off=${offBonds} />`] } : null,
    { id: 'desc', label: N_('说明'), nodes: [
      item?.flavor ? html`<p key="f" class="dtext dart__flavor">${item.flavor}</p>` : null,
      magic
        ? html`<p key="u" class="dhint"><${Icon} name="info" />${t('将其拖拽至战场上的格子使用')}</p>`
        : html`<p key="u" class="dhint"><${Icon} name="info" />${t('拖拽至干员身上进行配发（每名干员最多 2 件，配发后无法取下）')}${item?.mergeable ? t('；2 件相同装备自动合成进阶装备') : ''}</p>`,
      item?.shopExcluded ? html`<p key="x" class="dhint dhint--source"><${Icon} name="info" />${t('调度中心不出售 · 获取途径：{source}', { source: item.shopExcludedBy || t('效果获得') })}</p>` : null,
      piece && editable && onDestroy ? html`<div key="a" class="dactions"><${Button} variant="danger" onClick=${() => onDestroy(piece, item)}>${t('销毁道具')}<//></div>` : null,
    ].filter(Boolean) },
  ].filter(Boolean);
  const cur = tabs.find((x) => x.id === tab) || tabs[0];
  const paneRef = useRef(null);
  const edges = useScrollEdges(paneRef, [cur?.id]);
  return [
    html`<div key="art" class=${cx('dart', 'is-item', golden && 'is-golden', magic && 'is-magic')} data-item=${item?.id || ''}>
      <div class="dart__bg" aria-hidden="true"></div>
      <div class="dart__head">
        <${ClassBox} fallback=${html`<${Icon} name="info" />`} />
        <h3 class="dart__name">${item?.name || ''}</h3>
        <div class="dart__tier">
          <${TierChip} tier=${item?.tier} golden=${golden} size="md" />
          ${golden ? html`<span class="dtag-elite">${t('进阶')}</span>` : null}
          <i class="dart__split"></i>
          <span class="dart__lv"><small>LV</small><b class="num">${st.level}</b></span>
        </div>
      </div>
      <div class="dart__mid">
        <div class="dart__stats">
          <${Line} k=${t('攻击')} v=${st.atk} />
          <${Line} k=${t('防御')} v=${st.def} />
          <${Line} k=${t('法抗')} v=${st.res} />
          <${Line} k=${t('阻挡')} v=${st.blockCnt} cls="is-white" />
          <${Line} k=${t('费用')} v=${st.cost} cls="is-white" />
        </div>
        <div class="dart__tiles"><div class="dart__tile dart__range"><${RangeGrid} grid=${range} /><span>${t('攻击范围')}</span></div></div>
      </div>
      <div class="dart__hp"><i style="width:100%"></i><span><em>${t('生命')}</em><b class="num">${fmtNum(st.maxHp)}/${fmtNum(st.maxHp)}</b></span></div>
    </div>`,
    html`<div key="tabs" class="dart__tabs" role="tablist">
      ${tabs.map((tb) => html`<button key=${tb.id} type="button" role="tab" aria-selected=${tb === cur ? 'true' : 'false'}
          class=${cx('dart__tab', tb === cur && 'is-on')} onClick=${() => setTab(tb.id)}>${t(tb.label)}</button>`)}
    </div>`,
    html`<div key=${`pane:${cur.id}`} ref=${paneRef} class=${cx('dart__pane', `dart__pane--${cur.id}`, edges.scroll && 'is-scroll', edges.up && 'has-up', edges.down && 'has-down')}
        role="tabpanel">${cur.nodes}</div>`,
  ];
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
 * A summon's card (a token piece on the bench or the board, a battle token, a band map character such as 外勤医疗's
 * 预备干员-医疗 — detailPanel TokenDetail's data) in the operator card's official form, while the HUD has its official look
 * (maintainer decision 2026-10-14). A token is a character of the client (character_table, profession TOKEN; a band map
 * character is an operator), so a press on it goes the operator's way — AutoChessHighlightState._OnTileClicked →
 * UICharacterInfoPanel.ShowCharacter with the same status / tab-group subpanels (docs/rules/ui.md 「상세 카드 세부」). From
 * the token's record — the owner's variant for a summon (tokenVariantFor: a golden owner's summon is stronger): the
 * class box, the name, the tier | elite icon LV n, 攻击 防御 法抗 阻挡 费用 (live in a battle), the 攻击范围 tile, no bond
 * boxes (UICharacterInfoStatusSubPanelInAutochess.SetData shows none for a character without bonds), the HP bar, and the
 * tabs 技能 / 特性 (the character's description, as the operator card's) / 天赋, then ours: 说明 (how a placed summon takes
 * the field). [ASSUMED]: the tier is the owner's chess tier, else I (the client's fallback sprite when the token carries
 * no autochess_chess_id — whether it carries the owner's is not read); 费用 is the token's own cost. The class box is a
 * TOKEN's (ClassBox — the summon's avatar without the local-client sprite); a map character's is its profession's.
 * @param {{ token: any, piece?: any, ownerId?: string|null, snapHp?: { hp:number, max:number }|null, live?: any }} props
 */
export function TokenDetailArt({ token, piece = null, ownerId = null, snapHp = null, live = null }) {
  const [tab, setTab] = useState(null);
  const m = data.get('assets');
  const mapChar = token?.kind === 'mapChar';
  const v0 = mapChar ? null : tokenVariantFor(token, ownerId);
  const rec = v0 || token || {};
  const s = rec.stats || token?.stats || {};
  const owner = typeof ownerId === 'string' ? data.lookup('chess', ownerId) : null;
  const st = {
    atk: liveStat(live, 'atk', s.atk), def: liveStat(live, 'def', s.def), res: liveStat(live, 'res', s.res ?? 0, fmtRes),
    blockCnt: liveStat(live, 'blockCnt', s.blockCnt, (v) => String(v)), interval: liveStat(live, 'interval', attackInterval(s.bat, s.aspd), fmtInterval),
  };
  const hp = hpOf(live, snapHp) || (Number.isFinite(live?.maxHp) ? { hp: live.maxHp, max: live.maxHp } : Number.isFinite(s.maxHp) ? { hp: s.maxHp, max: s.maxHp } : null);
  const pct = hp && hp.max > 0 ? Math.max(0, Math.min(100, (hp.hp / hp.max) * 100)) : 100;
  const range = live && Array.isArray(live.range) && live.range.length ? live.range : Array.isArray(rec.rangeGrid) && rec.rangeGrid.length ? rec.rangeGrid : token?.rangeGrid || null;
  const phase = Number.isInteger(rec.phase) ? rec.phase : Number.isInteger(token?.phase) ? token.phase : null;
  const level = Number.isFinite(rec.level) ? rec.level : Number.isFinite(token?.level) ? token.level : null;
  const eliteUrl = phase != null ? uiUrl(m, `elite/elite_${phase}`) : null;
  // the skill: a summon's withdraw skill (skcom_withdraw) says nothing (TokenDetail's rule)
  const sk = rec.skill && rec.skill.desc && !/^skcom_withdraw/.test(String(rec.skill.skillId || '')) ? rec.skill : null;
  // an enemy-shaped record (炎佑 enemy_9012_acloon) carries one `{ bb, bbStr }` talent object, not a list: no 天赋 tab
  const talents = mapChar ? chessTalents(token) : (Array.isArray(rec.talents) ? rec.talents : []).filter((x) => x && x.name && x.desc);
  const trait = (mapChar ? token.trait?.descRaw || token.trait?.desc : '') || token?.descRaw || token?.desc || '';
  const hint = piece ? summonDeployHint(token) : null;
  const prof = mapChar ? profIconUrl(m, token.profession) : null;
  const tabs = [
    sk ? { id: 'skill', label: N_('技能'), nodes: [
      html`<div key="s" class="dskill" data-skill=${sk.skillId || ''}>
        <${Img} src=${skillRecordIconUrl(m, sk, { empty: false })} class="dskill__icon" fallback=${html`<span class="dskill__icon dskill__icon--empty"></span>`} />
        <div class="dskill__meta">
          <b class="dskill__name">${sk.name}</b>
          <div class="dskill__tags">${skillTags(sk)}</div>
        </div>
      </div>`,
      html`<${RichText} key="d" as="p" text=${sk.descRaw || sk.desc} class="dtext" />`,
      skillTextNote(sk),
    ].filter(Boolean) } : null,
    trait ? { id: 'trait', label: N_('特性'), nodes: [html`<${RichText} key="t" as="p" text=${trait} class="dtext" />`] } : null,
    talents.length ? { id: 'talents', label: N_('天赋'), nodes: talents.map((x, i) => html`<div key=${i} class="dtalent"><b>${x.name}</b><${RichText} text=${x.descRaw || x.desc} class="dtext" /></div>`) } : null,
    hint ? { id: 'desc', label: N_('说明'), nodes: [html`<p key="h" class="dhint"><${Icon} name="info" />${hint}</p>`] } : null,
  ].filter(Boolean);
  const cur = tabs.find((x) => x.id === tab) || tabs[0] || null;
  const paneRef = useRef(null);
  const edges = useScrollEdges(paneRef, [cur?.id]);
  return [
    html`<div key="art" class=${cx('dart', 'is-token', mapChar ? 'is-mapchar' : 'is-summon')} data-token=${token?.tokenId || ''}>
      <div class="dart__bg" aria-hidden="true"></div>
      <div class="dart__head">
        ${mapChar
          ? html`<span class="dart__prof"><i style=${prof ? `background-image:url("${prof}")` : ''}></i></span>`
          : html`<${ClassBox} fallback=${html`<${Img} src=${tokenAvatarUrl(m, token?.tokenId)} fallback=${html`<${GIcon} name="target" />`} />`} />`}
        <h3 class="dart__name">${token?.name || ''}</h3>
        <div class="dart__tier">
          <${TierChip} tier=${owner?.tier ?? 1} golden=${!!owner?.isGolden} size="md" />
          ${mapChar
            ? html`<span class="dtag-kind">${t('干员')}</span><span class="dtag-kind">${t(PROF_NAME[token.profession]) || token.profession || ''} · ${token.position === 'MELEE' ? t('近战位') : t('远程位')}</span>`
            : html`<span class="dtag-token">${t('召唤物')}</span>`}
          ${piece?.count > 1 ? html`<span class="dtag-kind num">×${piece.count}</span>` : null}
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
        ${range ? html`<div class="dart__tiles"><div class="dart__tile dart__range"><${RangeGrid} grid=${range} /><span>${t('攻击范围')}</span></div></div>` : null}
      </div>
      ${hp ? html`<div class="dart__hp"><i style=${`width:${pct}%`}></i><span><em>${t('生命')}</em><b class="num">${fmtNum(hp.hp)}/${fmtNum(hp.max)}</b></span></div>` : null}
    </div>`,
    tabs.length ? html`<div key="tabs" class="dart__tabs" role="tablist">
      ${tabs.map((tb) => html`<button key=${tb.id} type="button" role="tab" aria-selected=${tb === cur ? 'true' : 'false'}
          class=${cx('dart__tab', tb === cur && 'is-on')} onClick=${() => setTab(tb.id)}>${t(tb.label)}</button>`)}
    </div>` : null,
    cur ? html`<div key=${`pane:${cur.id}`} ref=${paneRef} class=${cx('dart__pane', `dart__pane--${cur.id}`, edges.scroll && 'is-scroll', edges.up && 'has-up', edges.down && 'has-down')}
        role="tabpanel">${cur.nodes}</div>` : null,
  ].filter(Boolean);
}

/**
 * @param {{ uid?: number, piece?: any } | null} p screens/game.js `drag` or `facing`
 * @param {Map<number, any>} pieces indexPieces(priv)
 * @param {{ priv?: any, backups?: any }} [opts] resolveDetail's: the player's m.private (its 自选 picks and 补位 list)
 * @returns {any|null} a resolveDetail result of type 'chess'
 */
export function placingDetail(p, pieces, opts) {
  if (!p || !Number.isInteger(p.uid)) return null;
  const d = resolveDetail({ kind: 'piece', uid: p.uid }, pieces, opts);
  if (d && d.type === 'chess') return d;
  const piece = p.piece;
  const c = piece && piece.kind === 'chess' ? data.lookup('chess', piece.id) : null;
  return c ? { type: 'chess', chess: c, piece } : null;
}
