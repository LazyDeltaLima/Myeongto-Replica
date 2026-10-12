// Result screen tabs beside 同盟成员 (a feature of this fork, maintainer decision 2026-10-12; docs/rules/ui.md 「결산 대미지 ·
// 연합 방어 탭」): 伤害 — every operator's damage over the whole match next to its leader damage (合计 / 最终攻势 / 隐秘核心),
// with the players' shares of the leader's HP — and 联防 — who knocked out the enemies another player let through, by
// player and by operator (co-op only). The numbers are m.result players[].units / unite / bossPools
// (server/match/unitTally.js); the data side is ui/gameLogic/resultCharts.js. A player's color is its chat faction's
// (playerColors). The official settlement has neither tab.
//
// `Thumb` is the result screen's LineupThumb (screens/result.js), handed in so the operator art follows the lineup cards
// (自选 picks, 补位 stand-ins) without an import cycle.

import { useState } from '../../vendor/hooks.module.js';
import { html } from '../ui/components.js';
import { useGameData } from '../ui/gameComponents.js';
import { fmtNum, diyRecordFor, cardStandIn, damageRanking, playerSum, leaderPool, leaderOf, uniteFlows } from '../ui/gameLogic.js';
import { data } from '../data.js';
import { chatFaction } from '../../../shared/local.js';
import { t, N_ } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');
const pctOf = (n, d) => (d > 0 ? (n > 0 && n / d < 0.01 ? '<1%' : `${Math.round((n / d) * 100)}%`) : '—');
const ROUND_NAMES = { sum: N_('合计'), final: N_('最终攻势'), hidden: N_('隐秘核心') };
/** Ranking rows shown before 显示全部. */
const TOP_DAMAGE = 10, TOP_UNITE = 8;

/** The display name of a result unit row (its 自选 operator, its 补位 stand-in, else the chess). */
function unitName(gd, u) {
  const chess = gd.chess(u.id);
  if (!chess) return u.id;
  const dr = u.diy ? diyRecordFor(chess, u.diy, { chess: data.get('chess'), backups: data.get('backups') }) : null;
  const si = !dr ? cardStandIn(chess, { unit: u, backups: gd.backups }) : null;
  return (dr || si || chess).name || u.id;
}

/** A player's name with its color dot (and the faction name, or AI). */
function Who({ p, color, myId, sub = true }) {
  const f = chatFaction(p.faction);
  return html`<span class="rch-who">
    <b>${p.name}${p.isBot ? html`<span class="rcard__ai">AI</span>` : null}${p.playerId === myId ? html`<span class="rcard__you">${t('你')}</span>` : null}</b>
    ${sub ? html`<small><i class="rch-dot" style=${`background:${color}`}></i>${f ? t(f.name) : null}</small>` : null}
  </span>`;
}

/** Legend chips (focus one player); `valueText(p)` adds a number. */
function Legend({ players, colors, focus, setFocus, valueText = null }) {
  return html`<div class="rch-legend">${players.map((p) => html`<button key=${p.playerId} type="button" class="rch-chip" aria-pressed=${focus === p.playerId ? 'true' : 'false'}
      onClick=${() => setFocus(focus === p.playerId ? null : p.playerId)}>
    <i class="rch-dot" style=${`background:${colors.get(p.playerId)?.color}`}></i>${p.name}${valueText ? html` <b class="num">${valueText(p)}</b>` : null}</button>`)}</div>`;
}

/** One stacked bar: segments { key, n, color, cls?, title } over `max`. */
function Stack({ segs, max, tall = false }) {
  return html`<span class=${cx('rch-stack', tall && 'is-tall')}>${segs.filter((s) => s.n > 0).map((s) => {
    const w = (s.n / max) * 100;
    return html`<span key=${s.key} class=${cx('rch-seg', s.cls)} style=${`flex:0 0 calc(${w}% - 2px)${s.color ? `;background:${s.color}` : ''}`} title=${s.title}>${s.label != null && w > 7 ? html`<b class="num">${s.label}</b>` : null}</span>`;
  })}</span>`;
}

/** 伤害 tab. */
export function DamageTab({ r, myId, colors, Thumb }) {
  const gd = useGameData();
  const fought = !!(r.bossPools.final || r.bossPools.hidden);
  const [sort, setSort] = useState(fought ? 'leader' : 'total');
  const [round, setRound] = useState('sum');
  const [focus, setFocus] = useState(null);
  const [all, setAll] = useState(false);
  const players = r.players;
  const coop = players.length > 1;
  const byLeader = sort === 'leader';
  const pool = leaderPool(r.bossPools, round);
  const teamTotal = players.reduce((s, p) => s + playerSum(p, 'total'), 0);
  const base = byLeader ? (pool ? pool.maxHp : 0) : teamTotal;
  const share = (p) => (byLeader ? playerSum(p, 'leader', round) : playerSum(p, 'total'));
  const rows = damageRanking(players, { sort, round });
  const maxT = Math.max(1, ...rows.map((x) => x.total)), maxL = Math.max(1, ...rows.map((x) => x.leader));
  const shown = all ? rows : rows.slice(0, TOP_DAMAGE);
  const byId = new Map(players.map((p) => [p.playerId, p]));
  const roundName = t(ROUND_NAMES[round]);
  const cell = (on, v, max, color) => html`<span class=${cx('rch-track', !on && 'is-off')}><span class="rch-bar" style=${`width:${(v / max) * 100}%;background:${color}`}></span></span>
    <span class=${cx('rch-val num', !on && 'is-off')}>${v > 0 ? fmtNum(v) : '—'}</span>`;
  const tip = (x, name, p) => [
    `${name} · ${p.name}`,
    `${t('造成伤害')}: ${Math.round(x.unit.dmg).toLocaleString('en-US')}`,
    r.bossPools.final ? `${t('领袖伤害')} · ${t('最终攻势')}: ${Math.round(x.unit.final).toLocaleString('en-US')}` : null,
    r.bossPools.hidden ? `${t('领袖伤害')} · ${t('隐秘核心')}: ${Math.round(x.unit.hidden).toLocaleString('en-US')}` : null,
    pool ? `${t('占领袖生命值')} (${roundName}): ${pctOf(leaderOf(x.unit, round), pool.maxHp)}` : null,
    x.unit.summon ? t('含召唤物') : null,
  ].filter(Boolean).join('\n');
  return html`<div class="rch">
    ${r.bossPools.hidden ? html`<div class="rch-sub"><span class="rch-cap">${t('领袖伤害')}</span>
      <div class="rch-seg-ctl" role="group">${['sum', 'final', 'hidden'].map((k) => html`<button key=${k} type="button" aria-pressed=${round === k ? 'true' : 'false'} onClick=${() => setRound(k)}>${t(ROUND_NAMES[k])}</button>`)}</div></div>` : null}
    <div class="rch-pool">
      <div class="rch-pool__h">${byLeader
        ? html`<span>${t('领袖生命值')}${r.bossPools.hidden ? ` · ${roundName}` : ''}</span><span>${pool ? html`<b class="num">${fmtNum(pool.dealt)}</b> / ${fmtNum(pool.maxHp)} · ${pool.dealt >= pool.maxHp ? t('已击败') : t('剩余生命值 {n}', { n: fmtNum(pool.maxHp - pool.dealt) })}` : '—'}</span>`
        : html`<span>${t('造成伤害')} · ${t('全局')}</span><span><b class="num">${fmtNum(teamTotal)}</b></span>`}</div>
      ${coop && base > 0 ? html`<${Stack} max=${base} segs=${[
        ...players.map((p) => ({ key: p.playerId, n: share(p), color: colors.get(p.playerId)?.color, cls: focus && focus !== p.playerId && 'is-dim', title: `${p.name}: ${Math.round(share(p)).toLocaleString('en-US')} (${pctOf(share(p), base)})` })),
        ...(byLeader && pool && pool.dealt < pool.maxHp ? [{ key: 'left', n: pool.maxHp - pool.dealt, cls: 'is-left', title: t('剩余生命值 {n}', { n: fmtNum(pool.maxHp - pool.dealt) }) }] : []),
      ]} />
      <${Legend} players=${players} colors=${colors} focus=${focus} setFocus=${setFocus} valueText=${(p) => pctOf(share(p), base)} />` : null}
    </div>
    <div class="rch-rank" role="list">
      <div class="rch-row is-head">
        <span></span><span></span><span class="rch-cap">${t('点击排序')}</span>
        <button type="button" class=${cx('rch-colh', byLeader && 'is-off')} aria-pressed=${byLeader ? 'false' : 'true'} onClick=${() => setSort('total')}>${t('造成伤害')} · ${t('全局')}</button>
        <button type="button" class=${cx('rch-colh', !byLeader && 'is-off')} aria-pressed=${byLeader ? 'true' : 'false'} onClick=${() => setSort('leader')}>${t('领袖伤害')}${r.bossPools.hidden ? ` · ${roundName}` : ''}</button>
      </div>
      ${shown.map((x, i) => {
        const p = byId.get(x.playerId), color = colors.get(x.playerId)?.color, name = unitName(gd, x.unit);
        return html`<div key=${`${x.playerId}:${x.unit.id}:${i}`} role="listitem" title=${tip(x, name, p)}
            class=${cx('rch-row', i < 3 && 'is-top', focus && focus !== x.playerId && 'is-dim', coop && x.playerId === myId && 'is-mine')}>
          <span class="rch-no num">${i + 1}</span>
          <span class=${cx('rch-thumb', x.unit.sold && 'is-sold')}><${Thumb} u=${x.unit} gd=${gd} /></span>
          <span class="rch-nm"><b>${name}</b><small>${coop ? html`<i class="rch-dot" style=${`background:${color}`}></i>${p.name}` : null}${x.unit.sold ? html`<em>${t('已出售')}</em>` : null}${x.unit.summon ? html`<em>${t('含召唤物')}</em>` : null}</small></span>
          ${cell(!byLeader, x.total, maxT, color)}${cell(byLeader, x.leader, maxL, color)}
        </div>`;
      })}
    </div>
    ${rows.length > TOP_DAMAGE ? html`<button type="button" class="rch-more" onClick=${() => setAll(!all)}>${all ? t('仅显示前 {n} 名', { n: TOP_DAMAGE }) : t('显示全部 {n} 名', { n: rows.length })}</button>` : null}
    <p class="rch-cap">${t('颜色 = 玩家 · 两列各自按比例绘制')}</p>
  </div>`;
}

/** 联防 tab (co-op). */
export function UniteTab({ r, myId, colors, Thumb }) {
  const gd = useGameData();
  const [side, setSide] = useState('helper');
  const [focus, setFocus] = useState(null);
  const [all, setAll] = useState(false);
  const players = r.players;
  const fl = uniteFlows(players);
  if (!fl.totals.sent && !fl.ranking.length) return html`<div class="rch"><p class="rch-empty">${t('本局没有发生联防')}</p></div>`;
  const color = (pid) => colors.get(pid)?.color;
  const name = (pid) => players.find((p) => p.playerId === pid)?.name ?? pid;
  const pairTitle = (h, l, n) => t('{helper} → {leaker}的敌人 {n} 只', { helper: name(h), leaker: name(l), n });
  let flow;
  if (side === 'helper') {
    const rows = [...players].sort((a, b) => (fl.helpedTotal.get(b.playerId) || 0) - (fl.helpedTotal.get(a.playerId) || 0));
    const max = Math.max(1, ...rows.map((p) => fl.helpedTotal.get(p.playerId) || 0));
    flow = rows.map((h) => html`<div key=${h.playerId} class=${cx('rch-frow', focus && focus !== h.playerId && 'is-dim')}>
      <${Who} p=${h} color=${color(h.playerId)} myId=${myId} />
      <${Stack} tall max=${max} segs=${players.filter((l) => l.playerId !== h.playerId).map((l) => {
        const n = fl.helped(h.playerId, l.playerId);
        return { key: l.playerId, n, label: n, color: color(l.playerId), title: pairTitle(h.playerId, l.playerId, n) };
      })} />
      <span class="rch-end num">${t('{n} 只', { n: fl.helpedTotal.get(h.playerId) || 0 })}</span>
    </div>`);
    flow = html`<h3 class="rch-h">${t('替队友击倒的敌人')} <span class="rch-cap">· ${t('颜色 = 放走该敌人的玩家')}</span></h3>${flow}`;
  } else {
    const rows = [...players].sort((a, b) => (fl.sent.get(b.playerId) || 0) - (fl.sent.get(a.playerId) || 0));
    const max = Math.max(1, ...rows.map((p) => Math.max(fl.sent.get(p.playerId) || 0, (fl.rescued.get(p.playerId) || 0) + (fl.through.get(p.playerId) || 0))));
    flow = rows.map((l) => {
      const sent = fl.sent.get(l.playerId) || 0, through = fl.through.get(l.playerId) || 0, rescued = fl.rescued.get(l.playerId) || 0;
      const other = Math.max(0, sent - rescued - through);
      return html`<div key=${l.playerId} class=${cx('rch-frow', focus && focus !== l.playerId && 'is-dim')}>
        <${Who} p=${l} color=${color(l.playerId)} myId=${myId} />
        <${Stack} tall max=${max} segs=${[
          ...players.filter((h) => h.playerId !== l.playerId).map((h) => {
            const n = fl.helped(h.playerId, l.playerId);
            return { key: h.playerId, n, label: n, color: color(h.playerId), title: pairTitle(h.playerId, l.playerId, n) };
          }),
          { key: 'other', n: other, label: other, cls: 'is-other', title: `${t('其他')}: ${other} — ${t('非干员击倒（地形等）')}` },
          { key: 'through', n: through, label: through, cls: 'is-through', title: `${t('突破')}: ${through}` },
        ]} />
        <span class="rch-end num">${rescued}<small> / ${sent}</small></span>
      </div>`;
    });
    flow = html`<h3 class="rch-h">${t('放走的敌人由谁击倒')} <span class="rch-cap">· ${t('颜色 = 击倒的玩家 · 斜线 = 突破')}</span></h3>${flow}`;
  }
  const rank = all ? fl.ranking : fl.ranking.slice(0, TOP_UNITE);
  const maxN = Math.max(1, ...fl.ranking.map((x) => x.n));
  return html`<div class="rch">
    <div class="rch-tiles">
      <div><span>${t('联防次数')}</span><b class="num">${r.uniteRounds ?? '—'}</b></div>
      <div><span>${t('送入联防')}</span><b class="num">${fl.totals.sent}</b></div>
      <div><span>${t('同盟击倒')}</span><b class="num">${fl.totals.rescued}<small>${pctOf(fl.totals.rescued, fl.totals.sent)}</small></b></div>
      <div><span>${t('突破')}</span><b class="num">${fl.totals.through}</b></div>
    </div>
    <div class="rch-block">
      <div class="rch-seg-ctl" role="group">
        <button type="button" aria-pressed=${side === 'helper' ? 'true' : 'false'} onClick=${() => setSide('helper')}>${t('协助方')}</button>
        <button type="button" aria-pressed=${side === 'leaker' ? 'true' : 'false'} onClick=${() => setSide('leaker')}>${t('受助方')}</button>
      </div>
      ${flow}
      <${Legend} players=${players} colors=${colors} focus=${focus} setFocus=${setFocus} />
    </div>
    ${fl.ranking.length ? html`<div class="rch-block">
      <h3 class="rch-h">${t('干员联防击倒')}</h3>
      <div class="rch-rank" role="list">${rank.map((x, i) => {
        const p = players.find((q) => q.playerId === x.playerId), nm = unitName(gd, x.unit);
        const by = Object.entries(x.unit.assist).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
        return html`<div key=${`${x.playerId}:${x.unit.id}:${i}`} role="listitem" class=${cx('rch-row is-one', i < 3 && 'is-top', focus && focus !== x.playerId && 'is-dim', x.playerId === myId && 'is-mine')}
            title=${[`${nm} · ${p.name}`, ...by.map(([l, n]) => `${t('{name}的敌人', { name: name(l) })}: ${n}`)].join('\n')}>
          <span class="rch-no num">${i + 1}</span>
          <span class=${cx('rch-thumb', x.unit.sold && 'is-sold')}><${Thumb} u=${x.unit} gd=${gd} /></span>
          <span class="rch-nm"><b>${nm}</b><small><i class="rch-dot" style=${`background:${color(x.playerId)}`}></i>${p.name}${x.unit.sold ? html`<em>${t('已出售')}</em>` : null}${x.unit.summon ? html`<em>${t('含召唤物')}</em>` : null}</small></span>
          <span class="rch-track"><span class="rch-bar" style=${`width:${(x.n / maxN) * 100}%;background:${color(x.playerId)}`}></span></span>
          <span class="rch-val num">${x.n}</span>
          <span class="rch-by">${by.length ? t('{name}的敌人', { name: name(by[0][0]) }) + ` ${by[0][1]}` : ''}</span>
        </div>`;
      })}</div>
      ${fl.ranking.length > TOP_UNITE ? html`<button type="button" class="rch-more" onClick=${() => setAll(!all)}>${all ? t('仅显示前 {n} 名', { n: TOP_UNITE }) : t('显示全部 {n} 名', { n: fl.ranking.length })}</button>` : null}
      <p class="rch-cap">${t('只计入其他玩家放走的敌人 · 全局累计')}</p>
    </div>` : null}
  </div>`;
}
