#!/usr/bin/env node
// tools/boss-route-map.mjs — draw the walking leaders' paths on every stage's boss field (docs/LOCAL-PATCH.md 「보스 경로
// 미리보기」): the same headless runs as the Final Assault prep preview (server/match/bossPath.js runLeaderPaths), one
// SVG per stage × leader (pair field: both copies), on the stage's boss-field tiles and its devices at their start
// state. For comparing with in-game footage; nothing here is official beyond the checkpoints and the tiles.
//
//   node tools/boss-route-map.mjs [out.html]      (default ../research/<today>-boss-routes/index.html)

import fs from 'node:fs';
import path from 'node:path';
import { getData, ROOT } from '../server/data.js';
import { DataSource } from '../server/sim/simdata.js';
import { Battle } from '../server/sim/Battle.js';
import { GEO } from '../shared/constants.js';
import { runLeaderPaths } from '../server/match/bossPath.js';

const data = getData({ log: { info() {}, warn() {}, error() {} } });
const ds = new DataSource(data, null);
const out = process.argv[2] || path.join(ROOT, '..', 'research', `${new Date().toISOString().slice(0, 10)}-boss-routes`, 'index.html');

// [template, label] — the pair templates (both copies); the solo ones walk the left copy's path
const LEADERS = [
  ['act1autochess_h07_02', '가상적: 총 (최종 공세, boss_2)'],
  ['act1autochess_h08_02', '가상적: 총 (숨겨진 핵심, boss_9)'],
  ['act2autochess_h07_05', '루시안, \'블러드 다이아몬드\' (boss_5)'],
];
const stages = Object.values(data.stages).filter((s) => /autochess_m\d+$/.test(s.id)).sort((a, b) => a.id.localeCompare(b.id));
const R = GEO.BOSS_RECT;
const T = 34;   // px per tile
const COLORS = ['#e0362c', '#f08a00'];

function tileFill(t) {
  if (!t) return '#333';
  const k = t.tileKey;
  if (k === 'tile_end') return '#6aa0e6';
  if (k === 'tile_deepsea') return '#5f8fb0';
  if (k === 'tile_mire') return '#8a7a4a';
  if (k === 'tile_smog') return '#9aa0a8';
  if (k === 'tile_infection') return '#c88aa8';
  if (k === 'tile_fence_bound') return '#7a6a5a';
  if (t.groundPassable) return '#ece6d6';
  return '#4a4a4a';
}
const DEVICE_LABEL = { trap_1105_accrate: '箱', trap_032_mound: '土', trap_218_fttree: '树', trap_1106_achplat: '台', trap_040_canoe: '舟', trap_1104_aclasert: '光' };

function svgFor(stage, paths) {
  const W = (R.c1 - R.c0 + 1) * T, H = (R.r1 - R.r0 + 1) * T;
  const X = (c) => (c - R.c0 + 0.5) * T, Y = (r) => (R.r1 - r + 0.5) * T;   // row 5 on top, as the board shows it
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`];
  for (let r = R.r0; r <= R.r1; r++) {
    for (let c = R.c0; c <= R.c1; c++) {
      const t = stage.tiles[stage.rows[r][c]];
      parts.push(`<rect x="${(c - R.c0) * T}" y="${(R.r1 - r) * T}" width="${T}" height="${T}" fill="${tileFill(t)}" stroke="#0002"/>`);
    }
  }
  for (const d of stage.devices || []) {
    if (!d.pos || d.pos[0] < R.r0 || d.pos[0] > R.r1 || d.active === false) continue;
    const lab = DEVICE_LABEL[d.key] || '◆';
    parts.push(`<text x="${X(d.pos[1])}" y="${Y(d.pos[0]) + 5}" font-size="15" text-anchor="middle" fill="#7a3b00">${lab}</text>`);
  }
  paths.forEach((p, i) => {
    const pts = p.pts.map(([r, c]) => `${X(c).toFixed(1)},${Y(r).toFixed(1)}`).join(' ');
    const col = COLORS[i % COLORS.length];
    parts.push(`<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="3" stroke-linejoin="round" opacity="0.85"/>`);
    const [r0, c0] = p.pts[0];
    parts.push(`<circle cx="${X(c0)}" cy="${Y(r0)}" r="6" fill="${col}"/>`);
  });
  parts.push('</svg>');
  return parts.join('');
}

const rows = [];
let checks = 0, soloSame = 0;
for (const stage of stages) {
  const cells = [];
  for (const [tplId, label] of LEADERS) {
    const tpl = data.waves[tplId];
    const run = (t, n) => runLeaderPaths((o) => new Battle({ data: ds, content: 'full', ...o }), {
      kind: 'boss', stageId: stage.id, rect: { ...R },
      players: Array.from({ length: n }, (_, i) => ({ playerId: `p${i + 1}`, seat: i, side: i ? 'R' : 'L', colOffset: i ? 8 : 0 })),
      spawns: t.spawns.filter((s) => s.tag === 'boss').map((s) => ({ enemyKey: s.key, time: s.time, routeIndex: s.routeIndex, tag: 'boss', mods: {} })),
      routes: t.routes, waveId: t.id, enemyOverrides: t.overrides, flags: { layerGainsEnabled: false },
    });
    const pair = run(tpl, 2);
    const solo = data.waves[`${tplId}_s`] ? run(data.waves[`${tplId}_s`], 1) : [];
    checks++;
    if (solo[0] && pair[0] && JSON.stringify(solo[0].pts) === JSON.stringify(pair[0].pts)) soloSame++;
    const len = (p) => p.pts.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - p.pts[i - 1][0], q[1] - p.pts[i - 1][1]) : 0), 0);
    cells.push(`<figure><figcaption>${label} · ${pair.map((p) => `${len(p).toFixed(1)}칸`).join(' / ')}</figcaption>${svgFor(stage, pair)}</figure>`);
  }
  rows.push(`<section><h2>${stage.name} <small>${stage.id}</small></h2><div class="row">${cells.join('')}</div></section>`);
}

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>보스 이동 경로</title><style>
body{font:14px/1.5 system-ui,sans-serif;margin:16px;background:#f7f5f0;color:#222}
h1{font-size:20px}h2{font-size:16px;margin:18px 0 6px}small{color:#777;font-weight:normal}
.row{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0}figcaption{font-size:12px;color:#444}svg{max-width:100%;height:auto;display:block}
.legend span{display:inline-block;margin-right:12px}
</style></head><body>
<h1>보스 이동 경로 (서버 시뮬, 전장별)</h1>
<p>보스 구역(0–5행, 위쪽이 5행). 빨강 = 왼쪽(1인) 경로, 주황 = 2인전의 오른쪽 복제본. 점 = 출발. 출발 → 첫 순찰 지점 → 순찰 한 바퀴. 체크포인트(공식 레벨 파일)는 모든 전장에서 같고, 칸 사이 길은 시뮬의 흐름장 길찾기 결과다 [추정 — 인게임 대조 전].
1인 템플릿 경로가 2인 왼쪽 복제본과 같은 경우: ${soloSame}/${checks}.</p>
<p class="legend"><span>箱 아크 상자</span><span>土 토석 구조물</span><span>树 수풀</span><span>台 플랫폼</span><span>舟 수상 플랫폼</span><span>光 레이저(꺼짐 제외)</span></p>
${rows.join('\n')}
</body></html>`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${stages.length} stages; solo = pair-left ${soloSame}/${checks})`);
