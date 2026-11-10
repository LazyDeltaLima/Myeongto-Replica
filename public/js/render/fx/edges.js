// public/js/render/fx/edges.js — the edge lines of a set of tiles (2026-11-10, docs/rules/fx.md 「테리토리야 국가의 칸과 가장자리 선」).
// The official RangeLineEffectHandler (a RangeLineEffectEmitter's) walks the corners of the tiles of an attack range and keeps
// one closed line per loop of their outline (`m_edgeLines`); `_RenderLine` makes one `_edgeLineRendererEffectKey` effect per
// loop and gives each of its LineRenderers the loop's corners (positionCount = the corners + 1: the first again), at a tile's
// edge (`_lineOffsetToMapCenter` −0.5, −0.5). Only the turns are kept (`_IsStraightMove`). Pure: fxgame.js edgeLines draws them.

/**
 * The outline loops of `cells` [[x, y]…] (column, row): [[[cx, cy]…]…], each closed (its first corner again at its end), its
 * corners at the tiles' edges (x ± 0.5, y ± 0.5), the interior on the left of the walk (x right, y up). Two tiles touching
 * only at a corner give two loops (the walk turns into the interior there). In a fixed order: the same cells, the same loops.
 */
export function rangeEdges(cells) {
  const inside = new Set();
  for (const c of Array.isArray(cells) ? cells : []) {
    const x = Number(c?.[0]), y = Number(c?.[1]);
    if (Number.isInteger(x) && Number.isInteger(y)) inside.add(`${x},${y}`);
  }
  const has = (x, y) => inside.has(`${x},${y}`);
  // directed edges between corners (i, j) = (i − 0.5, j − 0.5): out[corner] = [[to corner, direction]…]
  const out = new Map();
  const edges = [];
  const add = (a, b, d) => {
    const k = `${a[0]},${a[1]}`;
    const e = { a, b, d, used: false };
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(e);
    edges.push(e);
  };
  const tiles = [...inside].map((k) => k.split(',').map(Number)).sort((p, q) => p[1] - q[1] || p[0] - q[0]);
  for (const [x, y] of tiles) {
    if (!has(x, y - 1)) add([x, y], [x + 1, y], 0);             // bottom, walking +x
    if (!has(x + 1, y)) add([x + 1, y], [x + 1, y + 1], 1);     // right, +y
    if (!has(x, y + 1)) add([x + 1, y + 1], [x, y + 1], 2);     // top, −x
    if (!has(x - 1, y)) add([x, y + 1], [x, y], 3);             // left, −y
  }
  const loops = [];
  for (const first of edges) {
    if (first.used) continue;
    const pts = [first.a];
    let e = first;
    for (let guard = 0; guard <= edges.length && e && !e.used; guard++) {
      e.used = true;
      pts.push(e.b);
      const next = (out.get(`${e.b[0]},${e.b[1]}`) || []).filter((n) => !n.used);
      // at a corner two tiles share diagonally, the left turn (into the interior) closes this tile's loop first
      e = next.find((n) => n.d === (e.d + 1) % 4) || next.find((n) => n.d === e.d) || next[0] || null;
    }
    // the turns only (and the first corner again at the end)
    const turns = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const p = pts[(k - 1 + pts.length - 1) % (pts.length - 1)], c = pts[k], n = pts[k + 1];
      const straight = (c[0] - p[0]) * (n[1] - c[1]) - (c[1] - p[1]) * (n[0] - c[0]) === 0;
      if (!straight) turns.push([c[0] - 0.5, c[1] - 0.5]);
    }
    if (turns.length >= 3) loops.push([...turns, turns[0]]);
  }
  return loops;
}
