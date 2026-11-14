// test/render/bounty-mark.test.js — 规程's 悬赏 mark (2026-11-14, docs/rules/fx.md 「규정 수배 적 머리 위 표식」): a 悬赏 card's
// enemy wears map_067_reward_01 (CN map.ab, looping on the HEAD mount) while it lives. The season decides (shared/seasons.js
// bountyMark — the 盟约 client has no such prefab): the match marks the card's spawn specs (match/waves.js markBounties),
// the sim hands it to the view (UnitInfo `bounty`), the effect layer keeps the mark on the view (fxgame.js stepBountyMarks).
// A split child of the bounty enemy loses the card (modsWithoutBounty) and wears none.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { installFakePixi } from './fakepixi.js';
import { markBounties } from '../../server/match/waves.js';
import { seasonFeature } from '../../shared/seasons.js';
import { unitInfo } from '../../server/sim/snapshot.js';
import { makeMatch, DATA } from '../match/harness.js';
import { ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { createRegistry } from '../../server/match/effectsMeta.js';

const quiet = { error() {}, warn() {}, info() {}, log() {} };

const MARK = 'map_067_reward_01';

test('the season decides: 规程 marks a 悬赏 card\'s specs, the default season none; specs without the card stay', () => {
  assert.equal(seasonFeature('act3autochess', 'bountyMark'), true);
  assert.equal(seasonFeature(null, 'bountyMark'), false);
  const specs = [{ key: 'a', mods: { bountyId: 'bounty:1', hpMul: 2 } }, { key: 'b', mods: { hpMul: 2 } }, { key: 'c' }];
  const act3 = markBounties('act3autochess', specs);
  assert.deepEqual(act3.map((s) => !!s.mods?.bountyMark), [true, false, false]);
  assert.equal(specs[0].mods.bountyMark, undefined, 'the input specs are not edited');
  assert.ok(markBounties(null, specs) === specs, 'the default season: the same list');
  // UnitInfo: an enemy with the card and the mark; neither alone (a child lost the card, another season has no mark)
  const u = (mods) => ({ id: 1, side: 'enemy', kind: 'enemy', defId: 'x', s: { maxHp: 1 }, mods });
  assert.equal(unitInfo(u({ bountyId: 'bounty:1', bountyMark: true })).bounty, true);
  assert.equal(unitInfo(u({ bountyMark: true })).bounty, undefined);
  assert.equal(unitInfo(u({ bountyId: 'bounty:1' })).bounty, undefined);
});

/** The spawn events of a player's normal battle with one 悬赏 card, through the real match path. */
function bountyBattle(season) {
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
  const act3 = season === 'act3autochess';
  const h = act3
    ? makeMatch({ mode: 'solo', seats, seed: 11, registry: createRegistry({ data: ACT3_ON_BASE_FIELD, log: quiet }), data: ACT3_ON_BASE_FIELD, season }).start()
    : makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
  h.toPrep(1, act3 ? { band: 'band_amiya' } : {});
  const m = h.m, ps = h.ps('p_0');
  const card = (act3 ? ACT3_ON_BASE_FIELD : DATA).choices.cards.bounty.find((c) => c && m.gd.enemy(c.enemyKey) && !(c.count > 1));
  assert.ok(card, 'a 悬赏 card');
  m.addBounty(ps, card);
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'bm', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  b.start();
  m.dispose?.();
  const spawns = [];
  while (!b.finished && b.time < 90 && !spawns.some((i) => i.defId === card.enemyKey)) {
    b.step();
    for (const e of b.drainEvents()) if (e[0] === 'spawn' && e[1]?.side === 'enemy') spawns.push(e[1]);
  }
  return { spawns, key: card.enemyKey };
}

test('real match path: in 规程 the card\'s enemy spawns as a bounty unit (UnitInfo bounty), the wave\'s own enemies do not', () => {
  const { spawns, key } = bountyBattle('act3autochess');
  const own = spawns.filter((i) => i.defId === key && i.bounty);
  assert.ok(own.length >= 1, `the bounty enemy ${key} marked`);
  assert.ok(spawns.some((i) => !i.bounty), 'the wave\'s own enemies are not');
  assert.ok(spawns.every((i) => !i.bounty || i.defId === key), 'only the card\'s enemy');
});

test('real match path: the default season marks no enemy', () => {
  const { spawns, key } = bountyBattle(undefined);
  assert.ok(spawns.some((i) => i.defId === key), 'the bounty enemy spawned');
  assert.ok(spawns.every((i) => !i.bounty));
});

async function layer() {
  const fake = installFakePixi();
  const files = { '/assets/local/fx/index.json': { bundles: { map: [MARK] } }, '/assets/local/fx/enemy-modes.json': {} };
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  const seen = [];
  const L = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p) });
  await new Promise((r) => setTimeout(r, 10));
  return { L, seen, fake };
}
const view = (id, bounty) => ({ id, x: 5, y: 5, alive: true, isEnemy: true, form: null, flags: 0, statuses: new Set(),
  info: { id, side: 'enemy', kind: 'enemy', defId: 'enemy_1007_slime_2', form: null, ...(bounty ? { bounty: true } : {}) } });
const marks = (seen) => seen.filter((p) => p.kind === 'spawn' && p.names[0] === MARK);
const frame = async (L, views) => { L.onEvent(['tick'], views); L.update(0.05, { dist: 20 }, { width: 100, height: 100 }); await new Promise((r) => setImmediate(r)); };

test('the effect layer: a bounty view wears map_067_reward_01 on itself while it lives; another enemy none', async () => {
  const { L, seen, fake } = await layer();
  try {
    const v = view(7, true), o = view(8, false);
    const views = new Map([[7, v], [8, o]]);
    for (let i = 0; i < 40; i++) await frame(L, views);
    // (a dry layer loads nothing, so the frame tries again a second later — never every frame; a drawn mark stays)
    const m = marks(seen);
    assert.ok(m.length >= 1 && m.length <= 3, `the mark, once a second at most over 2 s (${m.length})`);
    assert.ok(m.every((p) => p.on === 7 && p.tag === 'bountyMark'), 'on the bounty enemy only');
    // dead: no new mark (its 'die' stops the one it wears)
    v.alive = false;
    const n = marks(seen).length;
    for (let i = 0; i < 40; i++) await frame(L, views);
    assert.equal(marks(seen).length, n);
  } finally { fake.restore(); }
});
