// 规程's two MAP_TILE 指令 (content/bands/meta.js → server/match/player/round.js battleInput → content/bands/battle.js):
// 溃心领域 (妮芙, a tile mark for the round's battle: the first time each enemy's tile becomes the tile, fear 3 s) and 宝藏探机
// (寻宝人, a chest that stands on the board from battle to battle until an enemy touches it: its tile takes no piece, a
// battle that ends with it standing pays 1 fund, a touch removes it) — through g.bandSkill, the real registry, the real spec
// path and the client-result check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';
import { makeMatch } from '../match/harness.js';
import { createRegistry } from '../../server/match/effectsMeta.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { BAND_MARK, BAND_CHEST } from '../../server/sim/content/bands/meta.js';
import { tileKey, FIELD } from '../../server/match/board.js';
import { validateClientResult } from '../../server/match/fields.js';
import { isBattleResult } from '../../shared/protocol.js';
import { COLS } from '../../server/sim/constants.js';

const OK = { ok: true };
const quiet = { error() {}, warn() {}, info() {}, log() {} };

/** A 规程 match in PREP of `round` holding `band`, its own handlers. */
function setup({ band, funds = 30, seed = 7, round = 1 }) {
  const reg = createRegistry({ data: ACT3_ON_BASE_FIELD, log: quiet });
  const h = makeMatch({ mode: 'solo', humans: 1, seed, registry: reg, fake: true, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
  h.toPrep(1, { band: 'band_amiya' });
  const m = h.m;
  m.round = round;
  const ps = h.ps('p_0');
  ps.bandId = band; ps.counters = {}; ps.funds = funds; ps.offers.length = 0; ps.ready = false;
  for (const l of [...ps.board.keys()]) ps.board.delete(l);
  ps.hand.fill(null); ps.temp.fill(null);
  ps.recompute();
  const use = (target = {}) => m.handle('p_0', { t: 'g.bandSkill', ...target });
  return { h, m, ps, use, view: () => ps.privateView().bandSkill };
}

/** The board tiles the stage's filter allows (match/bandSkill.js _bandSkillTile), row-major. */
function tilesOf(m, ps, filter) {
  const out = [];
  for (let r = FIELD.r0; r <= FIELD.r1; r++) for (let c = FIELD.c0; c <= FIELD.c1; c++) if (m._bandSkillTile(ps, r, c, filter)) out.push([r, c]);
  return out;
}
/** A board tile the filter refuses. */
function refusedTile(m, ps, filter) {
  for (let r = FIELD.r0; r <= FIELD.r1; r++) for (let c = FIELD.c0; c <= FIELD.c1; c++) if (!m._bandSkillTile(ps, r, c, filter)) return [r, c];
  return null;
}

/** The round's normal battle of the player through the real spec path (the spec JSON round trip as a browser gets it). */
function specOf(m, ps) {
  return buildBattleSpec({ ...m._normalOpts(ps), battleId: 'tl', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
}
function battleOf(m, ps) {
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(specOf(m, ps))), m.ds);
  b.start();
  return b;
}
const run = (b, t = 200) => { while (!b.finished && b.time < t) b.step(); };

/**
 * Board tiles (in board coordinates) that some enemy enters during the player's battle with an empty board — not as the
 * first tile change of that enemy (so a fear on the first change anywhere would land elsewhere).
 */
function enteredTiles(m, ps) {
  const b = battleOf(m, ps);
  const bp = b.getPlayer('p_0');
  const board = new Map();
  for (let r = FIELD.r0; r <= FIELD.r1; r++) for (let c = FIELD.c0; c <= FIELD.c1; c++) {
    const [fr, fc] = b.mapTile(bp, r, c);
    board.set(fr * COLS + fc, [r, c]);
  }
  const last = new Map();
  const changes = new Map();
  const hits = new Map();
  b.on('tick', () => {
    for (const e of b.enemies) {
      if (!e.alive || e.hidden) continue;
      const k = Math.round(e.y) * COLS + Math.round(e.x);
      const before = last.get(e.id);
      last.set(e.id, k);
      if (before === undefined || before === k) continue;
      changes.set(e.id, (changes.get(e.id) || 0) + 1);
      if (changes.get(e.id) === 1 || !board.has(k)) continue;
      const key = tileKey(...board.get(k));
      if (!hits.has(key)) hits.set(key, new Set());
      hits.get(key).add(e.id);
    }
  });
  run(b);
  return hits;
}

test('溃心领域 (妮芙): a passable tile, once a round at stage 1 — twice from round 4; a mark of the round with its tile', () => {
  const { m, ps, use, view } = setup({ band: 'band_dance' });
  assert.deepEqual(view().target, { type: 'MAP_TILE', filter: 'PASSABLE' });
  const tiles = tilesOf(m, ps, 'PASSABLE');
  assert.ok(tiles.length >= 2, 'passable tiles on the board');
  const bad = refusedTile(m, ps, 'PASSABLE');
  assert.ok(bad, 'a tile that is no ground passage');
  assert.equal(use({ row: bad[0], col: bad[1] }).error, 'BAD_TILE');
  assert.equal(use({ uid: 1 }).error, 'BAD_TARGET', 'a tile target only');
  const [r, c] = tiles[0];
  assert.deepEqual(use({ row: r, col: c }), OK);
  assert.equal(ps.funds, 30, 'cost 0');
  assert.deepEqual(view().marks, [{ effectId: 'eff_band19', row: r, col: c }]);
  assert.deepEqual(ps.battleInput().bandMarks, [{ effectId: 'eff_band19', row: r, col: c }]);
  assert.equal(ps.battleInput({ marks: false }).bandMarks, undefined, '联防: no marks');
  assert.deepEqual(use({ row: tiles[1][0], col: tiles[1][1] }), { error: 'ALREADY', detail: 'no uses left' });

  const four = setup({ band: 'band_dance', round: 4 });
  const t4 = tilesOf(four.m, four.ps, 'PASSABLE');
  assert.deepEqual(four.use({ row: t4[0][0], col: t4[0][1] }), OK);
  assert.deepEqual(four.use({ row: t4[1][0], col: t4[1][1] }), OK, 'stage 2: two uses a round');
  assert.equal(four.ps.effects.filter((e) => e.key === BAND_MARK).length, 2);
});

test('溃心领域 in battle: each enemy whose tile first becomes the marked tile is feared 3 s, sourceless, once; none without the mark', () => {
  const { m, ps, use } = setup({ band: 'band_dance' });
  const passable = new Set(tilesOf(m, ps, 'PASSABLE').map(([r, c]) => tileKey(r, c)));
  const hits = enteredTiles(m, ps);
  const busy = [...hits.entries()].filter(([k]) => passable.has(k)).sort((a, b) => b[1].size - a[1].size)[0];
  assert.ok(busy && busy[1].size >= 2, 'a passable tile two enemies walk into');
  const [r, c] = busy[0].split(',').map(Number);

  const fears = (b) => {
    const out = [];
    b.on('statusApplied', (x) => { if (x.status === 'fear' && x.target.side === 'enemy') out.push({ id: x.target.id, at: Math.round(x.target.y) * COLS + Math.round(x.target.x), source: x.source ?? null, duration: x.duration }); });
    return out;
  };
  const plain = battleOf(m, ps);
  const none = fears(plain);
  run(plain);
  assert.equal(none.length, 0, 'no fear without the mark');

  assert.deepEqual(use({ row: r, col: c }), OK);
  const b = battleOf(m, ps);
  const got = fears(b);
  const [fr, fc] = b.mapTile(b.getPlayer('p_0'), r, c);
  run(b);
  assert.ok(got.length >= 2, `feared enemies (${got.length})`);
  assert.equal(new Set(got.map((x) => x.id)).size, got.length, 'once per enemy');
  for (const x of got) {
    assert.equal(x.at, fr * COLS + fc, 'on the marked tile');
    assert.equal(x.source, null, 'no source');
    assert.equal(x.duration, 3);
  }

  // an enemy that walks off the tile and back in is not feared again (the template's `triggered`)
  const c2 = battleOf(m, ps);
  const again = fears(c2);
  let e = null;
  while (!c2.finished && !(e = c2.enemies.find((x) => x.alive && !x.hidden && again.some((f) => f.id === x.id)))) c2.step();
  assert.ok(e, 'a feared enemy');
  for (let i = 0; i < 2; i++) {
    e.x = fc + 1; e.y = fr;
    c2.step();
    e.x = fc; e.y = fr;
    c2.step();
  }
  assert.equal(again.filter((f) => f.id === e.id).length, 1, 'once per enemy');
});

test('宝藏探机 (寻宝人): an empty buildable ground tile, cost 1, cooldown 3; the chest stays, closes its tile, and is in the view and the battle input', () => {
  const { m, ps, use, view } = setup({ band: 'band_treasure' });
  assert.deepEqual(view().target, { type: 'MAP_TILE', filter: 'PASSABLE_AND_BUILDABLE' });
  const tiles = tilesOf(m, ps, 'PASSABLE_AND_BUILDABLE');
  assert.ok(tiles.length >= 2, 'buildable ground tiles');
  const road = tilesOf(m, ps, 'PASSABLE').find(([r, c]) => !m._bandSkillTile(ps, r, c, 'PASSABLE_AND_BUILDABLE'));
  assert.ok(road, 'a ground passage no piece may stand on');
  assert.equal(use({ row: road[0], col: road[1] }).error, 'BAD_TILE');
  const [r, c] = tiles[0];
  assert.ok(ps.deployMap().has(tileKey(r, c)));
  assert.deepEqual(use({ row: r, col: c }), OK);
  assert.equal(ps.funds, 29, 'cost 1');
  const chests = ps.effects.filter((e) => e.key === BAND_CHEST);
  assert.equal(chests.length, 1);
  assert.ok(chests[0].hidden === true && chests[0].battle === false, 'a hidden effect, no playerEffects card');
  assert.deepEqual(view().chests, [{ row: r, col: c, enemyId: 'enemy_9038_achest' }]);
  assert.equal(ps.deployMap().has(tileKey(r, c)), false, '「使所在格无法部署」');
  assert.equal(m._bandSkillTile(ps, r, c, 'PASSABLE_AND_BUILDABLE'), false, 'no second chest on it');
  assert.deepEqual(ps.battleInput().bandChests, [{ id: chests[0].id, row: r, col: c, enemyId: 'enemy_9038_achest', coin: 1 }]);
  assert.equal(ps.battleInput({ marks: false }).bandChests, undefined, '联防: no chest');
  assert.deepEqual(use({ row: tiles[1][0], col: tiles[1][1] }), { error: 'ALREADY', detail: 'cooldown' });
  for (let i = 0; i < 3; i++) {
    m.round += 1;
    m.dispatch(ps, 'onRoundStart', { round: m.round });
  }
  assert.equal(ps.effects.filter((e) => e.key === BAND_CHEST).length, 1, 'the chest outlives its round');
  assert.equal(view().cooldown, 0);
  assert.deepEqual(use({ row: tiles[1][0], col: tiles[1][1] }), OK, 'ready again 3 rounds later');
  assert.equal(view().chests.length, 2);
});

test('宝藏探机 in battle: the chest stands on its tile; standing at the end it pays 1 and stays; a ground enemy touching it removes it for good', () => {
  const { m, ps, use } = setup({ band: 'band_treasure' });
  const [r, c] = tilesOf(m, ps, 'PASSABLE_AND_BUILDABLE')[0];
  assert.deepEqual(use({ row: r, col: c }), OK);
  const id = ps.effects.find((e) => e.key === BAND_CHEST).id;

  // untouched: the battle ends with it standing
  const a = battleOf(m, ps);
  const chest = (b) => b.allyUnits.find((u) => u.mem?.bandChest === id);
  const ch = chest(a);
  const [fr, fc] = a.mapTile(a.getPlayer('p_0'), r, c);
  assert.ok(ch && ch.alive && ch.kind === 'device', 'a device on the field');
  assert.equal(ch.tileR * COLS + ch.tileC, fr * COLS + fc, 'on its tile');
  assert.equal(ch.ownerId, 'p_0');
  assert.equal(ch.hp, 100, 'the enemy record\'s HP');
  a.forceEnd('forced');
  const ra = a.result().perPlayer.p_0;
  assert.equal(ra.coins, 1, '「战斗结束后提供1资金」');
  assert.equal(ra.bandChestsGone, undefined);
  m.dispatch(ps, 'onBattleResult', { result: ra });
  assert.equal(ps.effects.filter((e) => e.key === BAND_CHEST).length, 1, 'stays');

  // touched: a ground enemy within 0.5 of it
  const b = battleOf(m, ps);
  const cb = chest(b);
  let e = null;
  while (!b.finished && !(e = b.enemies.find((x) => x.alive && !x.hidden && !x.isFlying))) b.step();
  assert.ok(e, 'a ground enemy');
  e.x = cb.x + 0.6; e.y = cb.y;
  b.step();
  if (e.alive && Math.hypot(e.x - cb.x, e.y - cb.y) > 0.5) assert.ok(cb.alive, 'not touched at 0.6');
  e.x = cb.x + 0.3; e.y = cb.y;
  b.step();
  assert.equal(cb.alive, false, 'touched');
  b.forceEnd('forced');
  const rb = b.result().perPlayer.p_0;
  assert.deepEqual(rb.bandChestsGone, [id]);
  assert.equal(rb.coins, 0, 'no fund');
  m.dispatch(ps, 'onBattleResult', { result: rb });
  assert.equal(ps.effects.filter((x) => x.key === BAND_CHEST).length, 0, '「被敌人触碰后永久消失」');
  assert.equal(ps.deployMap().has(tileKey(r, c)), true, 'the tile takes a piece again');
  assert.equal(ps.battleInput().bandChests, undefined);
});

test('宝藏探机: a flying enemy over the chest does not touch it', () => {
  const { m, ps, use } = setup({ band: 'band_treasure' });
  const [r, c] = tilesOf(m, ps, 'PASSABLE_AND_BUILDABLE')[0];
  assert.deepEqual(use({ row: r, col: c }), OK);
  const b = battleOf(m, ps);
  const cb = b.allyUnits.find((u) => u.mem?.bandChest);
  let e = null;
  while (!b.finished && !(e = b.enemies.find((x) => x.alive && !x.hidden))) b.step();
  assert.ok(e, 'an enemy');
  b.addBuff(e, { key: 'test:levitate', flags: { levitate: true }, duration: 99 });
  assert.ok(e.isFlying, 'airborne');
  e.x = cb.x; e.y = cb.y;
  b.step();
  assert.ok(cb.alive, 'targetMotion 1: ground enemies only');
});

test('宝藏探机: a client-run battle may report its chests gone and their coin, never another chest or more coins', () => {
  const { m, ps, use } = setup({ band: 'band_treasure' });
  const [r, c] = tilesOf(m, ps, 'PASSABLE_AND_BUILDABLE')[0];
  assert.deepEqual(use({ row: r, col: c }), OK);
  const id = ps.effects.find((e) => e.key === BAND_CHEST).id;
  const spec = JSON.parse(JSON.stringify(specOf(m, ps)));
  const b = createBattleFromSpec(spec, m.ds);
  b.start();
  b.forceEnd('forced');
  const ok = JSON.parse(JSON.stringify(b.result()));
  assert.ok(isBattleResult(ok), 'the protocol shape');
  const v = validateClientResult(spec, ok, { gd: m.gd });
  assert.ok(v.ok, v.reason);
  assert.equal(v.result.perPlayer.p_0.coins, 1);
  const gone = JSON.parse(JSON.stringify(ok));
  gone.perPlayer.p_0.coins = 0;
  gone.perPlayer.p_0.bandChestsGone = [id, 'band:chest:999'];
  const g = validateClientResult(spec, gone, { gd: m.gd });
  assert.ok(g.ok, g.reason);
  assert.deepEqual(g.result.perPlayer.p_0.bandChestsGone, [id], 'only its own chests');
  const more = JSON.parse(JSON.stringify(ok));
  more.perPlayer.p_0.coins = 2;
  assert.equal(validateClientResult(spec, more, { gd: m.gd }).reason, 'coins');
});

test('宝藏探机 through a real round: the battle fields the chest, an enemy walking the lane touches it, the settle removes it', () => {
  const reg = createRegistry({ data: ACT3_ON_BASE_FIELD, log: quiet });
  const h = makeMatch({ mode: 'solo', humans: 1, seed: 11, registry: reg, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
  h.toPrep(1, { band: 'band_amiya' });
  const m = h.m;
  const ps = h.ps('p_0');
  ps.bandId = 'band_treasure'; ps.counters = {}; ps.funds = 10; ps.offers.length = 0;
  ps.recompute();
  // the first buildable ground tile of this field lies on the enemies' lane (seed 11: they walk over it)
  const [r, c] = tilesOf(m, ps, 'PASSABLE_AND_BUILDABLE')[0];
  assert.deepEqual(m.handle('p_0', { t: 'g.bandSkill', row: r, col: c }), OK);
  const id = ps.effects.find((e) => e.key === BAND_CHEST).id;
  assert.ok(h.drive(() => m.phase === 'SETTLE' && m.round === 1), 'the round settles');
  const res = m.lastResults.get('p_0');
  assert.deepEqual(res.bandChestsGone, [id], 'touched in the real battle');
  assert.ok(!ps.effects.some((e) => e.key === BAND_CHEST), 'removed at the settle');
  assert.ok(ps.deployMap().has(tileKey(r, c)), 'its tile open again');
  m.dispose();
});
