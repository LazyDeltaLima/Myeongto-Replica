// The codes the content handlers read from the tables (server/sim/content/codes.js): a numeric or string value a handler
// turns into a behaviour through a table of its own — check_ab_flag (the client AbnormalFlag), ep_type, add_method, dir,
// a strategy stage's unlockType … Every season's records carry only values those tables know, a value they do not know
// shows up in the coverage report, and the handler does nothing on it instead of running its first or "likely" case.
// 2026-11-14 (CN player report, #13): 规程's 妮芙 garrison_99 reads check_ab_flag 33 (恐惧); the handler knew only 16 (冻结)
// and read every other value as 冻结, so her 特质 counted freezes and never fears.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { ACT3 } from '../helpers/seasonPieces.js';
import { makeMatch, give, DATA } from '../match/harness.js';
import { DataSource, getDefaultSource } from '../../server/sim/simdata.js';
import { getData } from '../../server/data.js';
import { coverage } from '../../server/sim/content/coverage.js';
import { TABLE_CODES } from '../../server/sim/content/codes.js';
import { createRegistry, registryFor, GARRISON_HOOK } from '../../server/match/effectsMeta.js';
import { BUILTIN_ITEM_BUFF_KEYS } from '../../server/match/builtinMeta.js';
import { coverageOf } from '../../tools/season-coverage.mjs';
import { SEASONS } from '../../shared/seasons.js';

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), '../../server/sim/content');
const QUIET = { info() {}, warn() {}, error() {} };

test('every season: each table code a handler reads is one its table knows (codes partial 0), and each entry reads some record', () => {
  const seen = new Map(TABLE_CODES.map((d) => [`${d.where} ${d.field}`, 0]));
  for (const season of Object.keys(SEASONS)) {
    const rows = coverageOf(season).codes;
    assert.equal(rows.length, TABLE_CODES.length, season);
    assert.deepEqual(rows.filter((r) => r.status !== 'ok').map((r) => `${r.id} ${r.key}: ${r.missing.join('; ')}`), [], season);
    for (const r of rows) seen.set(`${r.id} ${r.key}`, seen.get(`${r.id} ${r.key}`) + r.values.length);
  }
  assert.deepEqual([...seen].filter(([, n]) => !n).map(([k]) => k), [], 'an entry no season\'s record carries');
});

test('the code entries name what their files hold', () => {
  for (const d of TABLE_CODES) {
    const [file, name] = d.where.split(' ');
    const src = readFileSync(join(CONTENT, file), 'utf8');
    if (name) assert.ok(src.includes(name), `${name} in ${file}`);
    for (const k of d.keys ?? []) assert.ok(src.includes(k) || /^SERVER_|^act\d/.test(k), `${k} in ${file}`);
    assert.ok(['garrisons', 'buffs', 'bandNext'].includes(d.table) && ['battle', 'prep'].includes(d.side), d.where);
  }
});

test('a code no handler knows shows up as partial, with the records that carry it', () => {
  const base = getData({ season: 'act3autochess', log: QUIET });
  const g = { ...base.garrisons };
  const set = (gid, part, kv) => { g[gid] = { ...g[gid], [part]: { ...g[gid][part], ...kv } }; };
  set('garrison_99_a', 'bb', { check_ab_flag: 99 });                    // 妮芙: an AbnormalFlag the layer-event 特质 does not watch
  set('garrison_65_a', 'bbStr', { ep_type: 'ICE' });                    // 克莱门莎: a burst type
  set('garrison_93_a', 'bbStr', { dir: 'left' });                       // a POSITION target
  set('garrison_33_a', 'bbStr', { conditionkey: 'character_same_col' }); // a prep condition rowCondition does not read
  const bands = { ...base.bands };
  const [bandId, band] = Object.entries(bands).find(([, b]) => b.skills?.some((s) => s.next?.unlockType));
  bands[bandId] = { ...band, skills: band.skills.map((s) => (s.next?.unlockType ? { ...s, next: { ...s.next, unlockType: 'band_skill_load_by_kill' } } : s)) };
  const rep = coverage(Object.freeze({ ...base, garrisons: g, bands }), { registry: registryFor(base), builtinItemBuffKeys: BUILTIN_ITEM_BUFF_KEYS, garrisonHooks: GARRISON_HOOK });
  const bad = Object.fromEntries(rep.codes.filter((r) => r.status !== 'ok').map((r) => [`${r.id.split(' ')[1]} ${r.key}`, r.missing]));
  assert.deepEqual(bad, {
    'AB_FLAG_STATUS check_ab_flag': ['check_ab_flag=99 (garrison_99_a)'],
    'EP_BURST ep_type': ['ep_type=ICE (garrison_65_a)'],
    'POSITION_DIRS dir': ['dir=left (garrison_93_a)'],
    'PREP_CONDITIONS conditionkey': ['conditionkey=character_same_col (garrison_33_a)'],
    'UNLOCK_TYPES unlockType': [`unlockType=band_skill_load_by_kill (${band.skills.filter((s) => s.next?.unlockType).map((s) => s.effectId).sort().join(', ')})`],
  });
  assert.equal(rep.totals.codes.partial, 5);
  // without the match's 特质 event types (a sim-only caller) the event codes read as unknown, as the prep side elsewhere
  assert.ok(coverage(base).codes.some((r) => r.key === 'event' && r.status === 'partial'));
});

// ---------------------------------------------------------------------------------------------------------------------
// The handlers do nothing on a code they do not know (each case passed before on the old fallback)

/** Synthetic operator; `g` = its garrison ids. */
function op(id, g) {
  return {
    ...chessRec({
      id, profession: 'WARRIOR', bonds: [], tier: 1, rangeGrid: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
      stats: { maxHp: 2000, atk: 500, def: 200, res: 10, aspd: 100, bat: 1, respawnTime: 20, spRecovery: 0, blockCnt: 2 },
      skill: { spCost: 60, duration: 5, initSp: 0 },
    }),
    garrisonIds: g,
  };
}
const DUMMY = enemyRec({ key: 'e_d', hp: 1e7, speed: 0, def: 0, res: 0, atk: 0 });
const B = (layers = 0) => ({ count: 3, active: true, tier: 1, layers });
/** A battle on 规程's data with garrison records overridden (`garrisons`: id → record), one operator at [10, 4]. */
function fight({ g, garrisons, bonds, foes = [[10, 6], [10, 7]] }) {
  const data = new DataSource({ ...ACT3, garrisons: { ...ACT3.garrisons, ...garrisons }, chess: { ...ACT3.chess, o: op('o', g) }, enemies: { ...ACT3.enemies, e_d: DUMMY } }, getDefaultSource());
  const h = makeBattle({ data, bonds, timeLimit: 999, autoFinish: false, units: [{ chessId: 'o', row: 10, col: 4 }], enemies: foes.map(([r, c]) => ({ key: 'e_d', pos: [r, c] })) });
  h.run(2);
  return h;
}
const gains = (h) => h.result().perPlayer.p1.layerGains;
const done = (h) => { checkInvariants(h.b); assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0])); };
const with_ = (gid, part, kv, src = ACT3.garrisons) => ({ [gid]: { ...src[gid], [part]: { ...src[gid][part], ...kv } } });

test('the layer-event 特质 (妮芙 garrison_99): an unknown check_ab_flag, bond_type, bond_add_type, conditionkey or garrison_type gains nothing', () => {
  const ok = fight({ g: ['garrison_99_a'], garrisons: {}, bonds: { swiftShip: B(0) } });
  ok.b.applyStatus(ok.b.enemies[0], 'fear', { duration: 1 });
  assert.deepEqual(gains(ok), { swiftShip: 4 }, 'the record as it is');
  done(ok);
  for (const [part, kv] of [
    ['bb', { check_ab_flag: 99 }], ['bbStr', { bond_type: 'bond_act9_new' }], ['bbStr', { bond_add_type: 'by_act9' }],
    ['bbStr', { conditionkey: 'character_act9' }], ['bbStr', { garrison_type: 'garrison_act9' }],
  ]) {
    const h = fight({ g: ['garrison_99_a'], garrisons: with_('garrison_99_a', part, kv), bonds: { swiftShip: B(0) } });
    for (const status of ['fear', 'freeze']) h.b.applyStatus(h.b.enemies[0], status, { duration: 1 });
    assert.deepEqual(gains(h), {}, JSON.stringify(kv));
    done(h);
  }
});

test('克莱门莎 garrison_65 with an unknown ep_type watches no burst (not 侵蚀)', () => {
  // 400 阿戈尔 layers: the record as it is speeds her blocked enemy's 侵蚀 burst by 20 % (garrison_65_a: 1 % per 20)
  for (const [kv, rate] of [[{}, 1.2], [{ ep_type: 'ICE' }, 1]]) {
    const h = fight({ g: ['garrison_65_a'], garrisons: with_('garrison_65_a', 'bbStr', kv), bonds: { egirShip: B(400) } });
    const e = h.b.enemies[0];
    e.blockedBy = h.unit('o');
    h.b.dealDamage(null, e, { amount: 1e6, type: 'element', element: 'erosion' });
    const t0 = e.findBuff('erosionBurst').timeLeft;
    h.run(2);
    const ran = t0 - e.findBuff('erosionBurst').timeLeft;
    assert.ok(Math.abs(ran - 2 * rate) < 0.05, `${JSON.stringify(kv)}: ${ran} s in 2 s`);
    e.blockedBy = null;
    done(h);
  }
});

test('仇白 garrison_101 with an unknown check_ab_flag scales no damage on a bound target (sluggish still counts)', () => {
  const base = getData({ log: QUIET }).garrisons;
  const h = fight({ g: ['garrison_101_a'], garrisons: with_('garrison_101_a', 'bb', { check_ab_flag: 99 }, base), bonds: { yanShip: B(6), raidShip: B(3) } });
  const t = h.b.enemies[0];
  const lost = () => { const hp = t.hp; h.b.dealDamage(h.unit('o'), t, { amount: 1000, type: 'true' }); return Math.round(hp - t.hp); };
  h.b.applyStatus(t, 'bind', { duration: 5 });
  assert.equal(lost(), 1000, 'bound, but 99 is no 束缚 check');
  h.b.removeStatus(t, 'bind');
  h.b.applyStatus(t, 'sluggish', { duration: 5 });
  assert.equal(lost(), Math.round(1000 * 1.03));
  done(h);
});

/** A solo match in preparation with an empty board on data whose garrison `gid` has `kv` in `part`. */
function prep(gid, part, kv, fn) {
  const rec = DATA.garrisons[gid];
  const data = Object.freeze({ ...DATA, garrisons: Object.freeze({ ...DATA.garrisons, [gid]: { ...rec, [part]: { ...rec[part], ...kv } } }) });
  const h = makeMatch({ mode: 'solo', seed: 70, data, registry: createRegistry({ log: QUIET }), fake: true }).start();
  h.toPrep(1);
  const ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear();
  ps.hand.fill(null);
  ps.bandId = null;
  ps.layers = {};
  ps.recompute();
  const gained = {};
  const add = ps.addLayers.bind(ps);
  ps.addLayers = (b, n, o = {}) => { const a = add(b, n, o); if (a > 0 && /^(SERVER_|garrison)/.test(String(o.reason || ''))) gained[b] = (gained[b] || 0) + a; return a; };
  fn({ m: h.m, ps, gained, prepEnd: () => h.m.dispatch(ps, 'onPrepEnd', { round: h.m.round }) });
}
const ownerOf = (gid) => DATA.garrisons[gid].owners.find((id) => DATA.chess[id]);
const activateAll = (ps) => { for (const b of Object.keys(DATA.bonds)) if (b !== 'soloShip') ps.bondCountBonus[b] = 20; ps.recompute(); };

test('the prep 特质: an unknown dir (POSITION) or conditionkey runs nothing; the record as it is still runs', () => {
  const pos = Object.values(DATA.garrisons).find((x) => x.effectKey === 'SERVER_ADD_BOND_POSITION' && x.eventType === 'SERVER_PREP_FIN' && x.owners.length);
  const add = Object.values(DATA.garrisons).find((x) => x.effectKey === 'SERVER_ADD_BOND' && x.eventType === 'SERVER_PREP_FIN' && x.bbStr.conditionkey && x.owners.length);
  for (const g of [pos, add]) {
    for (const [kv, runs] of [[{}, true], [g === pos ? { dir: 'left' } : { conditionkey: 'character_same_col' }, false]]) {
      prep(g.garrisonId, 'bbStr', kv, (s) => {
        give(s.m, s.ps, ownerOf(g.garrisonId), 'board', [10, 5]);
        activateAll(s.ps);
        s.prepEnd();
        assert.equal(Object.keys(s.gained).length > 0, runs, `${g.garrisonId} ${JSON.stringify(kv)}: ${JSON.stringify(s.gained)}`);
      });
    }
  }
});
