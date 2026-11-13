// tools/level-fields.mjs — the 19×21 battle frame of a season whose levels come in pieces (卫戍协议：规程, act3autochess).
//
// The sim, the server's deploy maps and stages.json read one 19×21 map per stage (row 0 = bottom): the boss field in rows
// 0–6 (two halves, cols 0–10 / 11–20), the own field and the right-hand field in rows 7–13, the enemy preview area in
// rows 14–18 (enemy_place_rect ((14,7),(18,13))), and a wave level's routes in the same coordinates. The default season's
// level files are that frame. 规程's are not:
//   - a stage level (level_act3autochess_m01) is the 36×55 scene holding several copies of every field; its battle fields
//     are three sub-levels in level_<stage>/level_<stage>_sub_01…03: sub_01 (7×20) the own field with an enemy area
//     beside it, sub_02 (6×21) two fields side by side, sub_03 (13×21) the boss field over an enemy area;
//   - a wave level's map is the placeholder of the field it is fought on (5×9 one field, 6×17 the boss field, 5×17 the
//     two fields of 联防), and its routes are in that placeholder's coordinates.
// The sub-levels are pieces of the default season's frame, not new geometry: their configBlackBoard is the default
// season's (leftBoss ((0,0),(6,10)), leftNormal ((6,0),(12,10)), enemy_place_rect ((14,7),(18,13)), player_map_ud_offset
// 7 — rects of the 19×21 frame), the own field of sub_01 and of sub_02 is the same tile for tile on all ten stages, and
// the routes of every wave level both seasons have are the default season's shifted by the placeholder's origin (9, 2)
// on one field, (1, 2) on the boss field. composeStageLevel puts the pieces back into the frame and placeWaveLevel moves
// a wave level onto it, so build-data reads both seasons the same way. Which sub-level the client shows for which mode
// (sub_01 alone vs sub_02 with a neighbour) is not read: the own field's tiles, devices and routes are the same in both.

/** The battle frame (GEO.ROWS × GEO.COLS). */
export const FRAME_ROWS = 19;
export const FRAME_COLS = 21;

/** Path of sub-level `n` (1-based) of a stage, relative to the gamedata cache. */
export function subLevelPath(stageId, n) {
  const id = String(stageId).toLowerCase();
  const season = id.split('_')[0];
  return `levels/activities/${season}/level_${id}/level_${id}_sub_${String(n).padStart(2, '0')}.json`;
}

/** The level is already in the battle frame. */
export function isFrameLevel(lv) {
  const m = lv?.mapData?.map;
  return Array.isArray(m) && m.length === FRAME_ROWS && m[0]?.length === FRAME_COLS;
}

/**
 * Where the pieces go: sub-level index, sub rows / cols of its tiles, the frame row of its first row, and the cols whose
 * predefined devices and characters it brings (`predef`, default its tile cols). sub_03's rows 0–6 are the boss field
 * (frame rows 0–6), its rows 7–11 the enemy preview area (frame 14–18); sub_01's rows 0–6 cols 0–10 the own field with
 * its hand and 临时整备区 rows (frame 7–13); sub_02's right half the right-hand field (its hand row is frame row 8, its
 * board rows 9–12 like the own field's), with the hidden 医疗 of the second player that stands on col 10
 * (`char_605_cmedic#2_multi_only` at frame (10, 10), as in the default season). Frame row 7 cols 11–20 is no piece's:
 * forbidden, as in the default season.
 */
export const STAGE_PIECES = Object.freeze([
  Object.freeze({ sub: 2, rows: [0, 6], cols: [0, 20], row0: 0 }),
  Object.freeze({ sub: 2, rows: [7, 11], cols: [0, 20], row0: 14 }),
  Object.freeze({ sub: 0, rows: [0, 6], cols: [0, 10], row0: 7 }),
  Object.freeze({ sub: 1, rows: [0, 5], cols: [11, 20], row0: 8, predef: [10, 20] }),
]);

const rowsOf = (lv) => {
  const m = lv.mapData.map;
  const H = m.length;
  // row coordinates (row 0 = bottom): the file lists the top row first
  return Array.from({ length: H }, (_, r) => m[H - 1 - r]);
};
const tileJson = (t) => JSON.stringify(t);
const inPiece = (p, pos) => {
  const [c0, c1] = p.predef || p.cols;
  return pos && pos.row >= p.rows[0] && pos.row <= p.rows[1] && pos.col >= c0 && pos.col <= c1;
};
const moved = (o, dr, dc) => (o && typeof o === 'object' ? { ...o, position: { ...o.position, row: o.position.row + dr, col: o.position.col + dc } } : o);

/**
 * One 19×21 level of a stage from its three sub-levels (and the scene level for what the pieces do not carry: bgm,
 * routes of the scene are not used by build-data). Predefined devices and characters of each piece move with it; the
 * options (characterLimit, moveMultiplier, configBlackBoard) and the runes are sub_01's — the three sub-levels carry the same.
 * @param {object} scene the stage's own level (the 36×55 scene)
 * @param {object[]} subs sub_01, sub_02, sub_03
 */
export function composeStageLevel(scene, subs) {
  if (!Array.isArray(subs) || subs.length < 3 || subs.some((s) => !s?.mapData?.map)) throw new Error('composeStageLevel: three sub-levels needed');
  const tiles = [];
  const tileIdx = new Map();
  const idxOf = (t) => {
    const k = tileJson(t);
    if (!tileIdx.has(k)) { tileIdx.set(k, tiles.length); tiles.push(t); }
    return tileIdx.get(k);
  };
  const forbidden = subs.flatMap((s) => s.mapData.tiles).find((t) => t.tileKey === 'tile_forbidden' && t.passableMask === 'FLY_ONLY');
  if (!forbidden) throw new Error('composeStageLevel: no tile_forbidden (FLY_ONLY) in the sub-levels');
  const fill = idxOf(forbidden);
  const grid = Array.from({ length: FRAME_ROWS }, () => new Array(FRAME_COLS).fill(fill));
  const tokenInsts = [], characterInsts = [];
  for (const p of STAGE_PIECES) {
    const s = subs[p.sub];
    const src = rowsOf(s);
    const dr = p.row0 - p.rows[0];
    for (let r = p.rows[0]; r <= p.rows[1]; r++) {
      for (let c = p.cols[0]; c <= p.cols[1]; c++) {
        const t = s.mapData.tiles[src[r]?.[c]];
        if (!t) throw new Error(`composeStageLevel: sub_0${p.sub + 1} has no tile at (${r},${c})`);
        grid[r + dr][c] = idxOf(t);
      }
    }
    // Device aliases stay the official ones. 规程 numbers them per field and even repeats one inside a field (m05 sub_02:
    // two trap_013_blower#001), so unlike the default season's (#001 own, #101 right, #201 / #301 boss halves) they
    // name no single device; no 规程 effect toggles a device by alias (auto_chess_change_map).
    for (const t of s.predefines?.tokenInsts || []) if (inPiece(p, t.position)) tokenInsts.push(moved(t, dr, 0));
    for (const ch of s.predefines?.characterInsts || []) if (inPiece(p, ch.position)) characterInsts.push(moved(ch, dr, 0));
  }
  const base = subs[0];
  return {
    ...scene,
    options: base.options,
    // the battle fields' runes, not the scene's (m10's 盐坨子炮: the scene ATK −300 / skill cost ×3, the three sub-levels
    // −400 / ×2 — 2026-11-14, a CN player's report of an overstrong cannon)
    runes: base.runes ?? scene.runes ?? null,
    mapData: { ...base.mapData, map: grid.slice().reverse(), tiles },
    predefines: { ...(base.predefines || {}), tokenInsts, characterInsts },
  };
}

/**
 * Frame origin of a field's placeholder: the boss field's (it has the teleport entries tile_telin) is (1, 2), one field's
 * and 联防's two fields' (9, 2) — the default season's routes of every wave level both seasons have are the 规程 ones
 * shifted by exactly these (test/seasons-act3-stages.test.js). The shape alone cannot tell: a one-field placeholder fits
 * the boss field's left half as well.
 */
export const FIELD_ORIGINS = Object.freeze({ boss: Object.freeze([1, 2]), normal: Object.freeze([9, 2]) });

/** The tiles that must land on the same tile key when a placeholder is set on a frame stage. */
const ANCHOR_TILES = new Set(['tile_end', 'tile_telin', 'tile_telout']);

/**
 * The frame origin of a wave level's placeholder map (FIELD_ORIGINS), and the anchor tiles (goals, teleports) that do not
 * land on the same tile of `stage` there (none on a 规程 stage).
 * @param {object} wave the wave level
 * @param {object} [stage] a frame stage level to check against
 * @returns {{ origin: number[], misfits: string[] }}
 */
export function waveOrigin(wave, stage) {
  const w = rowsOf(wave), wt = wave.mapData.tiles;
  const origin = w.some((row) => row.some((i) => wt[i]?.tileKey === 'tile_telin')) ? FIELD_ORIGINS.boss : FIELD_ORIGINS.normal;
  const misfits = [];
  if (stage) {
    const s = rowsOf(stage), st = stage.mapData.tiles;
    for (let r = 0; r < w.length; r++) {
      for (let c = 0; c < w[r].length; c++) {
        const a = wt[w[r][c]];
        if (!ANCHOR_TILES.has(a?.tileKey)) continue;
        const b = st[s[r + origin[0]]?.[c + origin[1]]];
        if (b?.tileKey !== a.tileKey) misfits.push(`${a.tileKey} (${r},${c}) on ${b?.tileKey ?? 'nothing'}`);
      }
    }
  }
  return { origin: [...origin], misfits };
}

/** Every { row, col } position under `o` shifted by (dr, dc). */
function shiftPositions(o, dr, dc) {
  if (Array.isArray(o)) return o.map((x) => shiftPositions(x, dr, dc));
  if (!o || typeof o !== 'object') return o;
  const keys = Object.keys(o);
  if (keys.length === 2 && Number.isFinite(o.row) && Number.isFinite(o.col)) return { row: o.row + dr, col: o.col + dc };
  const out = {};
  for (const k of keys) out[k] = shiftPositions(o[k], dr, dc);
  return out;
}

/**
 * A wave level moved onto the frame at `origin`: its routes, extra routes and predefines shifted, its placeholder map set
 * into a forbidden 19×21 map (the default season's wave levels carry such a frame map; build-data reads only the routes,
 * and the 联防 stage records read the map).
 * @param {object} wave
 * @param {number[]} origin [dr, dc] from waveOrigin
 */
export function placeWaveLevel(wave, origin) {
  const [dr, dc] = origin;
  const w = rowsOf(wave);
  const tiles = [...wave.mapData.tiles];
  let fill = tiles.findIndex((t) => t.tileKey === 'tile_forbidden' && t.passableMask === 'FLY_ONLY');
  if (fill < 0) { fill = tiles.length; tiles.push({ tileKey: 'tile_forbidden', heightType: 'HIGHLAND', buildableType: 'NONE', passableMask: 'FLY_ONLY', playerSideMask: 'ALL', blackboard: null, effects: null }); }
  const grid = Array.from({ length: FRAME_ROWS }, () => new Array(FRAME_COLS).fill(fill));
  for (let r = 0; r < w.length; r++) for (let c = 0; c < w[r].length; c++) grid[r + dr][c + dc] = w[r][c];
  return {
    ...wave,
    mapData: { ...wave.mapData, map: grid.slice().reverse(), tiles },
    routes: shiftPositions(wave.routes, dr, dc),
    extraRoutes: shiftPositions(wave.extraRoutes, dr, dc),
    predefines: shiftPositions(wave.predefines, dr, dc),
  };
}
