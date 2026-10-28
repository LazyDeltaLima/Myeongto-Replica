// Debug page sandbag arena — pure helpers (local patch, docs/LOCAL-PATCH.md): no DOM, no fetch. /debug.html
// (js/debug/arena.js) builds its battles with them in the browser and test/local-patch-debug.test.js under Node, both
// with the shared sim (server/sim, served at /sim/) passed in.
//
//   arenaStage(terrain, stages)          a 19×21 stage: a 7×7 island of tiles (ARENA, rows 7–13 × cols 2–8), '#' elsewhere
//   sandbagRecord(raw, bag)              an enemies.json record turned into a sandbag (HP 1e9, never moves, no abilities;
//                                        `bag.attack`: it attacks the allies anywhere on the island)
//   createSandbagBattle(sim, ds, cfg)    a normal-kind Battle: one operator + the sandbags, no time limit, never ends
//   keepSandbags(battle) / reviveSandbags(battle, ev)   called by the page after each step / drain: a sandbag never dies
//   defaultBags(op, dir, rangeGrid)      the sandbag tile for an operator: the tile in front, or its own tile (blocked)
//   hurtOp(battle)                       the "injured ally" option: a heal target for medics (true damage to the operator)
//   keepOp(battle)                       the "operator stands" option: below KEEP_OP of its max HP it is healed to full
//   ownTokens(chessId, tokens) / autoTokens(…)   the operator's hand-placed pieces (望's 棋子, 赫默's 医疗探机 …) and a default
//                                        placement of them; createSandbagBattle places cfg.tokens like a board's token pieces
//   fillSp(unit) / castNow(unit)         the operator's skill charged / cast at once (the debug buttons)
//   rangeTiles(unit)                     the operator's live attack range as absolute tiles (the range overlay)

/** The 7×7 island (inclusive tile rect; row 0 is the bottom row). Its centre (10, 5) is the old debug patch's origin. */
export const ARENA = Object.freeze({ r0: 7, r1: 13, c0: 2, c1: 8 });
export const inArena = (r, c) => r >= ARENA.r0 && r <= ARENA.r1 && c >= ARENA.c0 && c <= ARENA.c1;
/** Terrain presets of the island: every tile a road, or two raised rows (gold-framed 高台, ranged-only) across it. */
export const TERRAINS = Object.freeze({ flat: '평지', high: '고지대 섞기' });
const HIGH_ROWS = new Set([8, 12]);
/** Default sandbag: 重装防御者 (a plain heavy soldier, no abilities). */
export const SANDBAG_DEFAULT = 'enemy_1006_shield';
export const SANDBAG_HP = 1e9;
export const SANDBAG_TAG = 'sandbag';
export const DEBUG_PLAYER = 'debug';
/** Default tiles: the operator two columns left of the centre facing right, one sandbag in front of it (melee reach). */
export const DEFAULT_OP = Object.freeze({ row: 10, col: 4 });
export const DEFAULT_BAGS = Object.freeze([Object.freeze({ row: 10, col: 5 })]);
/** Offset of a sandbag placed on its operator's tile (block-only ranges): blocked there, a little in front of the model. */
export const BLOCK_OFFSET = 0.35;
/** The "injured ally" option: every `every` s of game time, `frac` of the operator's max HP as true damage while it has more than `floor`. */
export const HURT = Object.freeze({ every: 1.5, frac: 0.2, floor: 0.35 });
/** The "operator stands" option: below this share of its max HP after a step, the operator is healed to full (under HURT.floor). */
export const KEEP_OP = 0.25;
/** An attacking sandbag's reach (tiles): the island's diagonal (6√2 ≈ 8.5) and more — every island tile is in range. */
export const ISLAND_REACH = 9;
const FRONT = Object.freeze({ RIGHT: [0, 1], LEFT: [0, -1], UP: [1, 0], DOWN: [-1, 0] });
/** Data files the sim reads — a copy of battle/runner.js SIM_DATA_FILES (the test keeps them equal; importing
 *  runner.js would create the app's battle runner wired to the socket). */
export const SIM_DATA_FILES = Object.freeze(['chess', 'enemies', 'tokens', 'stages', 'waves', 'bonds', 'items', 'garrisons', 'bands', 'effects', 'backups']);

const ROWS = 19, COLS = 21;

/**
 * The island stage. `stages` = data/stages.json (any shape with `tiles` legends): the legend entries of the glyphs used
 * are taken from the real stages, so the sim and both boards read the same tile records as in a match. The id names the
 * terrain (an unknown stage id: no official scene, the 3D board builds the procedural tiles — board3d/official.js).
 * @param {keyof TERRAINS} terrain
 * @param {any} [stages]
 */
export function arenaStage(terrain = 'flat', stages = null) {
  // local patch (2026-10-08): `stage:<id>` — that real stage as it is (its scene, tiles and devices: 阻隔工事 crates …); the
  // island rect stays the camera's frame and the operator / sandbag bounds (check scripts set it, no chip)
  const real = typeof terrain === 'string' && terrain.startsWith('stage:') && stages && typeof stages === 'object'
    ? Object.values(stages).find((s) => s && s.id === terrain.slice(6)) : null;
  if (real) return { ...real };
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    let line = '';
    for (let c = 0; c < COLS; c++) line += !inArena(r, c) ? '#' : terrain === 'high' && HIGH_ROWS.has(r) ? 'h' : 'r';
    rows.push(line);
  }
  const tiles = {};
  for (const st of Object.values(stages && typeof stages === 'object' ? stages : {})) {
    for (const g of ['#', 'r', 'h']) if (!tiles[g] && st && st.tiles && st.tiles[g]) tiles[g] = st.tiles[g];
  }
  return { id: `debug_sandbag_${TERRAINS[terrain] ? terrain : 'flat'}`, name: 'sandbag', size: [ROWS, COLS], rows, tiles, devices: [], special: null };
}

/**
 * A sandbag made from an enemy record: HP `bag.hp` (default 1e9), DEF / RES `bag.def` / `bag.res` (default 0), standing
 * still (move speed 0), no abilities / skills / talents, attacking only with `bag.atk` > 0 (else damage type NONE: it
 * never attacks), a static body (pushes / pulls never move it) unless `bag.fixed === false`. Model, motion, size (hit
 * area) and immunities stay the enemy's own.
 * `bag.attack`: it attacks the allies wherever they stand on the island — a ranged attacker (applyWay RANGED, so not only
 * its blocker: sim/ai.js enemyAttack) with ISLAND_REACH, at `bag.atk` or, with 0 there, its own ATK; a melee enemy's
 * blow (no projectile) lands on its target at the strike, a ranged one's own shot flies.
 * @param {any} raw data/enemies.json record
 * @param {{ hp?: number, def?: number, res?: number, atk?: number, fixed?: boolean, attack?: boolean }} [bag]
 */
export function sandbagRecord(raw, bag = {}) {
  const st = (raw && raw.stats) || {};
  const n = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Math.max(0, Number(v)) : d);
  const attack = !!bag.attack;
  const atk = n(bag.atk, 0) || (attack ? n(st.atk, 0) || 1 : 0);
  const own = String(st.dmgType ?? 'phys').toLowerCase();
  return {
    ...raw,
    stats: {
      ...st, maxHp: Math.max(1, n(bag.hp, SANDBAG_HP)), atk, def: n(bag.def, 0), res: n(bag.res, 0), moveSpeed: 0, hpRecoveryPerSec: 0,
      dmgType: atk > 0 ? (attack && (own === 'none' || own === 'heal') ? 'phys' : (st.dmgType ?? 'phys')) : 'NONE',
      ...(attack ? { rangeRadius: Math.max(n(st.rangeRadius, 0), ISLAND_REACH) } : {}),
    },
    applyWay: attack ? 'RANGED' : atk > 0 && raw && raw.applyWay === 'NONE' ? 'MELEE' : raw && raw.applyWay,
    // a melee enemy's record names no shot (undefined = the old default shot, sim/ai.js enemyShot): its blow has none
    ...(attack && raw && raw.proj === undefined && raw.applyWay !== 'RANGED' ? { proj: null } : {}),
    abilities: [], skills: [], talents: { bb: {} }, summons: [],
    staticBody: bag.fixed === false ? !!(raw && raw.staticBody) : true,
    notCountInTotal: true,
  };
}

/** A sandbag's route: from its tile toward an island corner it never reaches (move speed 0; start ≠ end, no leak). */
function bagRoute(row, col, motion) {
  const end = row === ARENA.r0 && col === ARENA.c0 ? [ARENA.r1, ARENA.c1] : [ARENA.r0, ARENA.c0];
  return { motion: motion === 'FLY' ? 'FLY' : 'WALK', start: [row, col], end, checkpoints: [] };
}

/**
 * The sandbag battle.
 * @param {{ Battle: Function, DataSource: Function, withUnitLoadouts: Function }} sim the /sim/ modules (Battle.js, simdata.js)
 * @param {any} baseDs the sim's DataSource (all data files)
 * @param {{ fieldId?: string, stage: any, chessId: string, skillIndex?: number|null, moduleId?: string|null, dir?: string,
 *   op?: { row: number, col: number }, bags?: { row: number, col: number }[], enemyKey?: string, bag?: object,
 *   spAuto?: () => boolean, seed?: number, logger?: object }} cfg `spAuto()` false = the operator gains no SP by itself
 *   (only fillSp / castNow charge it)
 */
export function createSandbagBattle(sim, baseDs, cfg) {
  const raw = baseDs.rawEnemy(cfg.enemyKey || SANDBAG_DEFAULT);
  if (!raw) throw new Error(`unknown enemy ${cfg.enemyKey}`);
  const ds = new sim.DataSource({ enemies: { [raw.key]: sandbagRecord(raw, cfg.bag) } }, baseDs);
  const op = cfg.op || DEFAULT_OP;
  const unit = { uid: 1, kind: 'chess', chessId: cfg.chessId, row: op.row, col: op.col, dir: cfg.dir || 'RIGHT' };
  if (Number.isInteger(cfg.skillIndex)) unit.skillIndex = cfg.skillIndex;
  if (typeof cfg.moduleId === 'string' && cfg.moduleId) unit.moduleId = cfg.moduleId;
  if (cfg.diy && typeof cfg.diy === 'object') unit.diy = cfg.diy; // a 自选 pick on its slot id (simdata getDiy)
  if (Array.isArray(cfg.items) && cfg.items.length) unit.items = [...cfg.items]; // equipment (items.json ids)
  // the operator's hand-placed pieces (tokens.json `placeable`): board token pieces owned by it (PlayerState battleInput)
  const busy = (r, c) => (r === op.row && c === op.col);
  const tokens = (cfg.tokens || []).filter((t) => t && typeof t.tokenId === 'string' && inArena(t.row, t.col) && !busy(t.row, t.col))
    .map((t, i) => ({ uid: 2 + i, kind: 'token', tokenId: t.tokenId, row: t.row, col: t.col, dir: cfg.dir || 'RIGHT', ownerUid: 1 }));
  const players = [{ playerId: DEBUG_PLAYER, seat: 0, side: 'L', colOffset: 0, coords: 'field', units: [unit, ...tokens], bonds: {}, bandId: null, playerEffects: [] }];
  const motion = String((raw.stats && raw.stats.motion) || raw.motion || 'WALK').toUpperCase();
  // a sandbag on the operator's tile only off-centre (defaultBags' blocked placement); off the island never
  const spawns = (cfg.bags || DEFAULT_BAGS).filter((b) => inArena(Math.round(b.row), Math.round(b.col))
    && !(b.row === op.row && b.col === op.col)).map((b) => ({
    time: 0, enemyKey: raw.key, pos: [b.row, b.col], route: bagRoute(Math.round(b.row), Math.round(b.col), motion), tag: SANDBAG_TAG, countInTotal: false,
  }));
  const spAuto = typeof cfg.spAuto === 'function' ? cfg.spAuto : () => true;
  return new sim.Battle({
    seed: cfg.seed ?? 1, kind: 'normal', modeId: 'mode_multi_normal', round: 1, stage: cfg.stage, rect: { ...ARENA },
    timeLimit: 86400, players, spawns, routes: [], fieldId: cfg.fieldId ?? 'debug',
    // no battle-start operation cooldown (a fresh skill may go at once), no bond layers
    flags: { bornTime: 0, layerGainsEnabled: false },
    data: sim.withUnitLoadouts(ds, players), content: 'full', autoFinish: false, quiet: true, logger: cfg.logger,
    setup: (b) => {
      b.on('spGain', (ctx) => { if (ctx.unit && ctx.unit.side === 'ally' && !spAuto()) ctx.amount = 0; });
    },
  });
}

/**
 * Where the sandbag goes for an operator on `op` facing `dir` with this range grid (authored facing RIGHT): the tile in
 * front when the range reaches it, else the nearest range tile on the island; a block-only range ([[0,0]]: 重装 / 护卫
 * protectors) puts it on the operator's own tile, BLOCK_OFFSET in front — it is blocked there, as a walking enemy would be.
 */
export function defaultBags(op, dir = 'RIGHT', grid = null) {
  const [fr, fc] = FRONT[dir] || FRONT.RIGHT;
  const g = (Array.isArray(grid) ? grid : []).filter((x) => Array.isArray(x) && (x[0] || x[1]));
  const turn = ([dr, dc]) => (dir === 'UP' ? [dc, -dr] : dir === 'LEFT' ? [-dr, -dc] : dir === 'DOWN' ? [-dc, dr] : [dr, dc]);
  const reach = !Array.isArray(grid) || g.some((x) => x[0] === 0 && x[1] === 1);
  if (reach && inArena(op.row + fr, op.col + fc)) return [{ row: op.row + fr, col: op.col + fc }];
  const near = g.map(turn).map(([dr, dc]) => ({ row: op.row + dr, col: op.col + dc })).filter((t) => inArena(t.row, t.col))
    .sort((a, b) => (Math.abs(a.row - op.row) + Math.abs(a.col - op.col)) - (Math.abs(b.row - op.row) + Math.abs(b.col - op.col)))[0];
  return [near || { row: op.row + fr * BLOCK_OFFSET, col: op.col + fc * BLOCK_OFFSET }];
}

/** The "injured ally" option, one blow: true damage to the operator (it never drops below HURT.floor). */
export function hurtOp(battle) {
  const u = arenaOp(battle);
  if (!u || !u.alive || !u.deployed || u.hp <= u.s.maxHp * HURT.floor) return 0;
  return battle.dealDamage(null, u, { amount: u.s.maxHp * HURT.frac, type: 'true', canDodge: false, sourceless: true, tags: ['debug'] });
}

/** The "operator stands" option, after a step: an operator below KEEP_OP of its max HP is healed to full (true). */
export function keepOp(battle) {
  const u = arenaOp(battle);
  if (!u || !u.alive || u.hp >= u.s.maxHp * KEEP_OP) return false;
  u.hp = u.s.maxHp;
  return true;
}

/** The operator of the arena (its first deployed ally op), or null. */
export const arenaOp = (battle) => (battle ? battle.allyUnits.find((u) => u.kind === 'op') || null : null);
/** The living sandbags. */
export const arenaBags = (battle) => (battle ? battle.enemies.filter((e) => e.alive && e.tag === SANDBAG_TAG) : []);

/** After a step: a sandbag below half HP is healed to full (a %-max-HP hit never brings it near 0). */
export function keepSandbags(battle) {
  for (const e of arenaBags(battle)) if (e.hp < e.s.maxHp * 0.5) e.hp = e.s.maxHp;
}

/**
 * After a drain: every sandbag of a 'die' tuple (an execute, an instant kill) stands up again on its tile at once (its
 * 'spawn' tuple goes out with the next drain). Returns how many were revived.
 */
export function reviveSandbags(battle, ev) {
  let n = 0;
  for (const x of Array.isArray(ev) ? ev : []) {
    if (!Array.isArray(x) || x[0] !== 'die') continue;
    const e = battle.units.find((u) => u.id === x[1]);
    if (!e || e.side !== 'enemy' || e.tag !== SANDBAG_TAG) continue;
    const pos = [e.spawnY, e.spawnX];   // exact: a blocked sandbag stands off its tile's centre
    if (battle.spawnEnemy(e.defId, { pos, route: bagRoute(Math.round(pos[0]), Math.round(pos[1]), e.motion), tag: SANDBAG_TAG, countInTotal: false })) n++;
  }
  return n;
}

/** Charge the unit's skill fully (every charge); false for a unit without an active skill or while a timed one runs. */
export function fillSp(u) {
  const s = u && u.skill;
  if (!s || s.noSkill || s.kind === 'passive' || !u.alive) return false;
  if (s.active && s.isTimed) return false;
  s.setSpTotal(s.spCost * s.maxCharges);
  return true;
}

/** Charge and cast the unit's skill now (its trigger rule and the operation cooldown are skipped). */
export function castNow(u) {
  if (!fillSp(u)) return false;
  return u.skill.activate('manual');
}

/**
 * The unit's live attack range (its grid as the sim keeps it — skills / modules included — authored facing RIGHT, turned
 * to its direction with /sim/dir.js `rotateOffset`) as absolute tiles of the island.
 * @param {any} u ally unit
 * @param {(dr: number, dc: number, dir: string) => [number, number]} rotateOffset
 */
export function rangeTiles(u, rotateOffset) {
  const grid = (u && (Array.isArray(u.liveRangeGrid) ? u.liveRangeGrid : u.rangeGrid)) || [];
  const r0 = Math.round(u.tileR ?? u.y), c0 = Math.round(u.tileC ?? u.x);
  const out = [];
  for (const g of grid) {
    if (!Array.isArray(g)) continue;
    const [dr, dc] = rotateOffset(g[0], g[1], u.dir || 'RIGHT');
    const r = r0 + dr, c = c0 + dc;
    if (inArena(r, c)) out.push([r, c]);
  }
  return out;
}

/**
 * The pieces an operator places by hand (tokens.json / backups.json tokens with `placeable`, owned by this chess id —
 * a 自选 pick's by its `charId@status` owner key, shared/diy.js diyTokenOwner):
 * [{ tokenId, name, limit (deployLimit), ownerRange (only on its owner's attack range) }].
 * @param {string} chessId the battle's chess id (normal or elite)
 * @param {any[]} tokens token records
 */
export function ownTokens(chessId, tokens) {
  return (Array.isArray(tokens) ? tokens : []).filter((t) => t && t.placeable && Array.isArray(t.owners) && t.owners.includes(chessId))
    .map((t) => ({ tokenId: t.tokenId, name: t.name, limit: Math.max(1, Number(t.deployLimit) || 1), ownerRange: !!t.ownerRange }));
}

/** The island tiles of an operator's attack range (its grid, authored facing RIGHT, turned to `dir`). */
export function rangeOf(op, dir, grid) {
  const turn = ([dr, dc]) => (dir === 'UP' ? [dc, -dr] : dir === 'LEFT' ? [-dr, -dc] : dir === 'DOWN' ? [-dc, dr] : [dr, dc]);
  return (Array.isArray(grid) ? grid : []).filter(Array.isArray).map(turn).map(([dr, dc]) => ({ row: op.row + dr, col: op.col + dc }))
    .filter((t) => inArena(t.row, t.col));
}

/**
 * A default placement of an operator's pieces: up to each one's limit, on free island tiles nearest the operator
 * (its attack range only for an `ownerRange` piece), the tiles in front of it first.
 * @param {{ row: number, col: number }} op
 * @param {string} dir
 * @param {any[]} grid the operator's range grid
 * @param {{ tokenId: string, limit: number, ownerRange: boolean }[]} own ownTokens
 * @param {{ row: number, col: number }[]} [taken] tiles already used (the sandbags)
 */
export function autoTokens(op, dir, grid, own, taken = []) {
  const [fr, fc] = FRONT[dir] || FRONT.RIGHT;
  const used = new Set([`${op.row},${op.col}`, ...taken.map((t) => `${Math.round(t.row)},${Math.round(t.col)}`)]);
  const all = [];
  for (let r = ARENA.r0; r <= ARENA.r1; r++) for (let c = ARENA.c0; c <= ARENA.c1; c++) all.push({ row: r, col: c });
  const score = (t) => { const dr = t.row - op.row, dc = t.col - op.col; return Math.abs(dr) + Math.abs(dc) - 0.5 * Math.sign(dr * fr + dc * fc); };
  const inRange = new Set(rangeOf(op, dir, grid).map((t) => `${t.row},${t.col}`));
  const out = [];
  for (const t of own) {
    const pool = all.filter((x) => !used.has(`${x.row},${x.col}`) && (!t.ownerRange || inRange.has(`${x.row},${x.col}`))).sort((a, b) => score(a) - score(b));
    for (const x of pool.slice(0, t.limit)) { used.add(`${x.row},${x.col}`); out.push({ tokenId: t.tokenId, row: x.row, col: x.col }); }
  }
  return out;
}
