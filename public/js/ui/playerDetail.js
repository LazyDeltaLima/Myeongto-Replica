// The 队员信息 dialog (the official 规程 autochess_player_detail_dialog; docs/rules/ui.md 「팀원 정보 창」): tapping an
// avatar of the left player list opens one row per player beside the list, in the list's order — the list's own
// avatar first (ui/teamPanel.js keeps it above the dialog and puts the 前往查看 tag on it: watching moved there from the
// avatar tap), then the name card (name, 完美连胜 n, the shop level), the player's lit bonds (the HUD strip's .bslot drawn
// smaller, without the phase mark and n/m — maintainer decision 2026-11-15), the operators on their board (tier, elite
// frame, equipment bar: m.public players[].lineup, server/match/match/views.js _lineupView) and their strategy's
// portrait. Every season (maintainer decision 2026-11-15: a convenience where the official current season has none).
// Rows touch (no gap between them, maintainer decision 2026-11-15): each row is the list row's height plus the list's gap.
// The official art (CN battle bundle, season/act3autochess/playerdetail; the default theme's playerdetailshoplevel) is
// drawn when the local extract has it, else plain CSS shapes (css/player-detail.css).
// [ASSUMED·화면: only the lit bonds, the board's operators without the 整备区, their order, no click on the strategy
// portrait (its 🔍 likely opens the strategy's details), closing by a tap outside or on an avatar, an eliminated
// player's row under the row_dead_cover, a solo match without the dialog (its list is hidden)]

import { html, BondDisc } from './components.js';
import { Img } from './gameComponents.js';
import { sortBonds } from './gameLogic.js';
import { bondIconUrl, bandIconUrl, chessAvatarUrl } from './assetUrls.js';
import { bondBoardOf } from './hudArt.js';
import { skinArt, skinPic, playerSkins } from './skins.js';
import { settingsStore } from './settings.js';
import { data, localAsset } from '../data.js';
import { t } from '../../../shared/i18n.js';
import { playerName } from '../../../shared/botNames.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');
const ROMAN = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ'];
const ART = 'season/act3autochess/playerdetail';

// operator names by charId (a tooltip only: a 自选 or 补位 body the chess table lacks has none), per loaded chess table
const charNames = new WeakMap();
function charName(char) {
  const all = data.get('chess');
  if (!all || typeof all !== 'object') return '';
  let names = charNames.get(all);
  if (!names) {
    names = new Map();
    for (const c of data.list('chess')) if (c && c.charId && !names.has(c.charId)) names.set(c.charId, c.name || '');
    charNames.set(all, names);
  }
  return names.get(char) || '';
}

/** An official sprite of the dialog as a CSS variable declaration, '' without the local extract. */
const artVar = (name, sprite) => {
  const u = localAsset(ART, sprite);
  return u ? `--pd-${name}:url("${u}");` : '';
};

/**
 * The dialog's bonds of a player: the lit ones (official: a teammate's 1st-round row reads NOINFO while the own row shows
 * its lit 独行 — CN capture 2026-11-15), in the HUD strip's order.
 * @param {any[]} bonds m.public players[].bonds
 */
export function detailBonds(bonds) {
  return sortBonds((Array.isArray(bonds) ? bonds : []).filter((b) => b && b.active && !b.off), (id) => data.lookup('bonds', id));
}

/**
 * The dialog's operators of a player (m.public players[].lineup), malformed entries dropped.
 * @param {any[]} lineup
 * @returns {Array<{ char: string, avatar?: string, tier: number, golden?: boolean, items?: [number, number] }>}
 */
export function detailLineup(lineup) {
  return (Array.isArray(lineup) ? lineup : []).filter((u) => u && typeof u.char === 'string' && u.char);
}

function NoInfo() {
  const u = localAsset(ART, 'icon_noinfo');
  return html`<i class=${cx('pdetail__noinfo', u && 'has-sprite')} style=${u ? `--pd-noinfo:url("${u}")` : undefined}>${u ? null : 'NO INFO'}</i>`;
}

function Bonds({ bonds, unit }) {
  const m = data.get('assets');
  if (!bonds.length) return html`<${NoInfo} />`;
  return html`<div class="pdetail__list pdetail__bonds" style=${`--u:${unit}px`}>
    ${bonds.map((b) => {
      const rec = data.lookup('bonds', b.bondId);
      const th = Array.isArray(rec?.thresholds) ? rec.thresholds : [];
      const board = bondBoardOf(th, b.count ?? 0, true);
      return html`<div key=${b.bondId} data-bond=${b.bondId} style=${board.style} data-full=${board.full ? '1' : null} class="bslot is-active">
        <${BondDisc} name=${rec?.name || b.bondId} icon=${bondIconUrl(m, b.bondId)} layers=${rec?.noStack ? undefined : b.layers ?? 0}
          tier=${b.tier ?? 0} maxTier=${Math.max(1, th.length)} active=${true} size="sm" showName=${true} />
      </div>`;
    })}
  </div>`;
}

function Operators({ lineup, own, skins }) {
  if (!lineup.length) return html`<${NoInfo} />`;
  const m = data.get('assets');
  const sk = skinArt();
  return html`<div class="pdetail__list pdetail__ops">
    ${lineup.map((u, i) => {
      const rec = { charId: u.char, assets: { avatar: u.avatar || u.char } };
      const name = charName(u.char);
      const src = skinPic(rec, 'avatar', sk, { own, of: skins }) || chessAvatarUrl(m, rec);
      const tier = Math.max(1, Math.min(6, u.tier | 0));
      const eq = Array.isArray(u.items) ? u.items : null;
      return html`<span key=${i} class=${cx('pdetail__op', u.golden && 'is-golden')} title=${name || undefined}>
        <span class="pdetail__av"><${Img} src=${src} fallback=${html`<i class="pdetail__glyph">${[...(name || '?')][0]}</i>`} /></span>
        <i class="pdetail__fr" aria-hidden="true"></i>
        ${u.golden ? html`<i class="pdetail__gg" aria-hidden="true"></i>` : null}
        <b class="pdetail__rk num">${ROMAN[tier]}</b>
        ${eq ? html`<span class="pdetail__eq" aria-label=${`${eq[0]}/${eq[1]}`}>${Array.from({ length: Math.max(0, Math.min(6, eq[1] | 0)) },
          (_, k) => html`<i key=${k} class=${k < eq[0] ? 'is-on' : null}></i>`)}</span>` : null}
      </span>`;
    })}
  </div>`;
}

/**
 * The dialog: one row per player, at the list rows' places (`geo`, measured by ui/teamPanel.js against the list).
 * @param {{ players: any[], myId: string, geo: { left: number, top: number, width: number, height: number, k: number,
 *   rows: Array<{ top: number, height: number, hole: number }> } }} props
 */
export function PlayerDetail({ players, myId, geo }) {
  const others = settingsStore.get().otherSkins !== false;
  const m = data.get('assets');
  const vars = artVar('card', 'name_card_cover') + artVar('combo', 'combo_win_back') + artVar('list', 'detail_list_back')
    + artVar('arrow', 'list_arrow') + artVar('frame', 'char_avatar_frame') + artVar('gold', 'char_avatar_gold_gradient')
    + artVar('eqback', 'char_avatar_equipment_back') + artVar('tframe', 'team_check_frame') + artVar('tcheck', 'team_check_icon');
  return html`<div class="pdetail" role="dialog" aria-label=${t('同盟成员信息')}
      style=${`left:${geo.left}px;top:${geo.top}px;width:${geo.width}px;height:${geo.height}px;--k:${geo.k};${vars}`}>
    ${players.map((p, i) => {
      const g = geo.rows[i];
      if (!g) return null;
      const own = p.playerId === myId;
      const bonds = detailBonds(p.bonds);
      const lineup = detailLineup(p.lineup);
      const lvl = Math.max(1, Math.min(6, p.shopLevel | 0));
      const lvlArt = localAsset('season/act3autochess/playerdetailshoplevel', `shop_level_${lvl}`);
      const band = p.bandId ? data.lookup('bands', p.bandId) : null;
      const bandArt = p.bandId ? bandIconUrl(m, p.bandId) : null;
      return html`<div key=${p.playerId} class=${cx('pdetail__row', own && 'is-self', p.alive === false && 'is-dead')}
          style=${`top:${g.top - geo.top}px;height:${g.height}px`}>
        <i class="pdetail__hole" style=${`width:${g.hole}px`}></i>
        <div class="pdetail__card">
          <span class="pdetail__name">${playerName(p.name) || t('博士')}</span>
          ${p.winStreak > 0 ? html`<span class="pdetail__combo">${t('完美连胜 {n}', { n: p.winStreak })}</span>` : null}
          <i class=${cx('pdetail__shop', lvlArt && 'has-sprite')} style=${lvlArt ? `--pd-shop:url("${lvlArt}")` : undefined}
            title=${t('调度中心等级 {n}', { n: lvl })}>${lvlArt ? null : html`<small>LV</small>${lvl}`}</i>
        </div>
        <div class="pdetail__part is-bonds"><${Bonds} bonds=${bonds} unit=${(g.height * 0.8 / 84).toFixed(3)} /><i class="pdetail__more" aria-hidden="true"></i></div>
        <div class="pdetail__part is-ops"><${Operators} lineup=${lineup} own=${own} skins=${own ? null : playerSkins(players, p.playerId, others)} /><i class="pdetail__more" aria-hidden="true"></i></div>
        <div class="pdetail__band" title=${band?.name || undefined}>
          <span class="pdetail__bandimg"><${Img} src=${bandArt} /></span>
          <i class="pdetail__bandfr" aria-hidden="true"></i>
          <i class="pdetail__check" aria-hidden="true"></i>
        </div>
      </div>`;
    })}
  </div>`;
}

/**
 * Where the dialog goes: measured against the list (`aside`, the team panel), relative to it — the dialog box from 8 px
 * left of the rows to the side layer's right edge less `margin`, each row the list row's height plus the gap between
 * rows (half above, half below: the rows touch), its first `hole` px left open for the list's avatar.
 * @param {HTMLElement} aside @param {number} margin
 */
export function measureDetail(aside, margin) {
  const rows = [...aside.querySelectorAll(':scope > .team__row')];
  if (!rows.length) return null;
  const a = aside.getBoundingClientRect();
  const side = aside.closest('.gm__side')?.getBoundingClientRect();
  const R = rows.map((r) => r.getBoundingClientRect());
  const B = rows.map((r) => (r.querySelector('.team__btn') || r).getBoundingClientRect());
  const gap = R.length > 1 ? Math.max(0, R[1].top - R[0].bottom) : 0;
  const k = R[0].height / 92;
  const left = Math.min(...R.map((r) => r.left)) - 8;
  const right = (side ? side.right : window.innerWidth) - margin;
  const top = R[0].top - gap / 2;
  const bottom = R[R.length - 1].bottom + gap / 2;
  const r1 = (v) => Math.round(v * 10) / 10;
  return {
    left: r1(left - a.left), top: r1(top - a.top), width: r1(right - left), height: r1(bottom - top), k: Math.round(k * 1000) / 1000,
    rows: R.map((r, i) => ({ top: r1(r.top - gap / 2 - a.top), height: r1(r.height + gap), hole: r1(B[i].right - left + 6 * k) })),
  };
}
