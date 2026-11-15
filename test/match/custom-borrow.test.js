// test/match/custom-borrow.test.js — a custom 规则 match borrowing another season's battlefields and 特训敌人 types
// (shared/seasonBorrow.js; maintainer request 2026-11-15) and the 'step' growth curve (shared/ruleset.js stepScale;
// maintainer decision 2026-11-15), on the real match path (harness → Match → setupMatchWaves → buildBattleSpec →
// createBattleFromSpec): a 盟约 match draws a 规程 battlefield and fights on it, a 规程 match a 盟约 one, a forced 规程 type
// fields its enemies in a 盟约 match while an unpicked one never joins the draw; the browser's data store merges the
// same records as the server's match (public/js/data.js setBorrow / borrowRaw ↔ server/match/borrow.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { sanitizeCustom, customDiffs, officialStep, stepScale } from '../../shared/ruleset.js';
import { customBorrowIds, borrowPlan, withBorrowed, borrowSeasons, sameField } from '../../shared/seasonBorrow.js';
import { GameData } from '../../server/match/gamedata.js';
import { setupMatchWaves } from '../../server/match/waves.js';
import { borrowedData } from '../../server/match/borrow.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { createRng } from '../../server/sim/rng.js';
import { getData } from '../../server/data.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { createRegistry } from '../../server/match/effectsMeta.js';
import { createDataStore } from '../../public/js/data.js';
import { DATA, makeMatch } from './harness.js';

const ACT3_ID = 'act3autochess';
const QUIET = { warn() {}, error() {}, info() {}, log() {} };
const ACT3 = hasGeneratedData() ? getData({ log: QUIET, season: ACT3_ID }) : null;
const skip = !ACT3;
const custom = (c) => ({ preset: 'custom', custom: c });
/** every stage of a mode but `keep` banned: the draw takes `keep` */
const banAllBut = (data, modeId, keep) => (data.config.modes[modeId].stages || []).filter((id) => id !== keep);

/** one normal battle of round r on the match's field, stepped 10 s: the enemy keys that spawned */
function fight(h, r, band) {
  h.toPrep(r, band ? { band } : undefined);
  const spec = buildBattleSpec({ battleId: 'borrow', ...h.m._normalOpts(h.ps('p_0')) });
  const b = createBattleFromSpec(spec, h.m.ds, { recordEvents: false, quiet: true });
  for (let i = 0; i < 30 * 10; i++) b.step();
  return { b, keys: new Set(b.enemies.map((e) => e.key ?? e.enemyKey ?? e.defId)) };
}

test('the settings: stages.extra and the type picks name what is borrowed; one diff each', () => {
  const c = sanitizeCustom({ stages: { extra: ['act3autochess_m10', 'bad id!'] }, types: { pick: { CRITIC: 'allow', REBORN: 'force', FLY: 'ban' } } });
  assert.deepEqual(c.stages.extra, ['act3autochess_m10']);
  assert.deepEqual(customBorrowIds(c), { stages: ['act3autochess_m10'], types: ['CRITIC', 'REBORN'] });
  assert.equal(customBorrowIds(sanitizeCustom({})), null);
  assert.deepEqual(customDiffs(c), ['types.pick.CRITIC', 'types.pick.FLY', 'types.pick.REBORN', 'stages.extra.act3autochess_m10']);
  assert.deepEqual(borrowSeasons('act2autochess'), [ACT3_ID]);
  assert.deepEqual(borrowSeasons(ACT3_ID), ['act2autochess']);
});

test('withBorrowed: only what the own season lacks, the own enemy records kept, the own draw untouched', { skip }, () => {
  const ids = { stages: ['act3autochess_m10', 'act1autochess_m01'], types: ['CRITIC', 'FLY'] };
  const plan = borrowPlan(DATA, [[ACT3_ID, ACT3]], ids);
  assert.deepEqual(plan.stages, [['act3autochess_m10', ACT3_ID]], 'an own stage is never borrowed');
  assert.deepEqual(plan.types, [['CRITIC', ACT3_ID]], 'an own type is never borrowed');
  const d = withBorrowed(DATA, [[ACT3_ID, ACT3]], ids);
  assert.ok(Object.isFrozen(d) && d.chess === DATA.chess, 'the other files are the own ones');
  assert.equal(d.stages.act3autochess_m10.borrowed, ACT3_ID);
  assert.equal(d.factions.types.CRITIC.borrowed, ACT3_ID);
  for (const k of ACT3.factions.types.CRITIC.entries) assert.ok(d.factions.entries[k], `entry ${k}`);
  for (const k of Object.keys(ACT3.enemies)) assert.ok(d.enemies[k], `enemy ${k}`);
  for (const k of Object.keys(DATA.enemies)) assert.ok(d.enemies[k] === DATA.enemies[k], `own enemy ${k} kept`);
  assert.ok(withBorrowed(DATA, [[ACT3_ID, ACT3]], { stages: [], types: ['FLY'] }) === DATA, 'nothing to borrow: the own data');
  // the official draw never takes a borrowed type: a borrowed CRITIC no settings pick leaves the classic draws
  const gd = new GameData(d, 'mode_multi_hard');
  const off = new GameData(DATA, 'mode_multi_hard');
  for (let s = 1; s <= 20; s++) assert.deepEqual(setupMatchWaves(gd, createRng(s)).factions, setupMatchWaves(off, createRng(s)).factions);
});

test('real match path (盟约): a 规程 battlefield is drawn and fought on; its cannon device on the field', { skip }, () => {
  const ban = banAllBut(DATA, 'mode_multi_hard', null);
  const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, seed: 3, fake: true,
    ruleset: custom({ stages: { extra: ['act3autochess_m10'], ban } }) }).start();
  assert.equal(h.m.stageId, 'act3autochess_m10');
  assert.equal(h.m.gd.stage('act3autochess_m10')?.borrowed, ACT3_ID);
  assert.ok(h.m.gd.stage('act3autochess_m10').devices.some((d) => d.key === 'trap_196_cnnon'), 'the 盐坨子炮 came with it');
  const { b } = fight(h, 2);
  assert.ok(b.enemies.length > 0, 'enemies spawned on the borrowed field');
  h.m.dispose();
  // the same settings without the extra stage: every stage banned keeps one of the own (keepUnbanned), never a 规程 one
  const g = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, seed: 3, fake: true, ruleset: custom({ stages: { ban } }) }).start();
  assert.ok(!g.m.stageId.startsWith('act3'), g.m.stageId);
  g.m.dispose();
});

test('real match path (盟约): a forced 规程 type fields its enemies; one left out never joins the draw', { skip }, () => {
  const seen = new Set();
  for (const seed of [1, 4]) {
    const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, seed, fake: true, ruleset: custom({ types: { pick: { CRITIC: 'force' } } }) }).start();
    assert.ok(h.m.factions.includes('CRITIC') && !h.m.factions.includes('REBORN'), `seed ${seed}: ${[...h.m.factions]}`);
    const r = h.m.factions.schedule.typeSlots.indexOf('CRITIC') + 1;
    const { keys } = fight(h, Math.min(r, 13));
    for (const k of keys) seen.add(k);
    h.m.dispose();
  }
  const critic = new Set(ACT3.factions.types.CRITIC.entries.flatMap((k) => [k, ...['N', 'E'].flatMap((s) => (ACT3.factions.entries[k]?.[s] || []).map((x) => x.key))]));
  assert.ok([...seen].some((k) => critic.has(k) && !DATA.enemies[k]), `a 规程-only enemy of the type spawned: ${[...seen]}`);
  // 'allow' joins the draw: over many seeds REBORN comes up, CRITIC (not picked) never
  const gd = new GameData(borrowedData(DATA, 'act2autochess', sanitizeCustom({ types: { pick: { REBORN: 'allow' } } })), 'mode_multi_hard');
  gd.custom = sanitizeCustom({ types: { pick: { REBORN: 'allow' } } });
  let reborn = 0;
  for (let s = 1; s <= 40; s++) {
    const f = setupMatchWaves(gd, createRng(s)).factions;
    assert.ok(!f.includes('CRITIC') && f.length === 3, `seed ${s}: ${f}`);
    if (f.includes('REBORN')) reborn++;
  }
  assert.ok(reborn > 0 && reborn < 40, `REBORN drawn ${reborn} / 40`);
});

test('real match path (规程): a 盟约 battlefield (战场#07(下半) 排气格栅) is drawn and fought on', { skip }, () => {
  const registry = createRegistry({ data: ACT3, log: QUIET });
  const h = makeMatch({ mode: 'solo', difficulty: 'HARD', modeId: 'mode_single_12', seed: 2, data: ACT3, season: ACT3_ID, registry, fake: true,
    ruleset: custom({ stages: { extra: ['act2autochess_m03'], ban: banAllBut(ACT3, 'mode_single_12', null) } }) }).start();
  assert.equal(h.m.stageId, 'act2autochess_m03');
  assert.ok(h.m.gd.stage('act2autochess_m03')?.special?.smog, 'the 排气格栅 terrain came with it');
  const { b } = fight(h, 1, 'band_amiya');
  assert.ok(b.enemies.length > 0);
  h.m.dispose();
});

test('sameField: 规程 m01–m04 / m06 play as 盟约 战场#01–#04 / #06(下半) and are never borrowed; m05 differs', { skip }, () => {
  const own = (data) => Object.values(data.stages).filter((s) => !s.kind);
  const pairs = own(ACT3).flatMap((b) => own(DATA).filter((a) => sameField(a, b)).map((a) => `${b.id}=${a.id}`));
  assert.deepEqual(pairs, ['act3autochess_m01=act1autochess_m01', 'act3autochess_m02=act1autochess_m02', 'act3autochess_m03=act1autochess_m03',
    'act3autochess_m04=act1autochess_m04', 'act3autochess_m06=act2autochess_m02']);
  assert.ok(!sameField(DATA.stages.act2autochess_m01, ACT3.stages.act3autochess_m05), '规程 m05 has two more fence tiles a field');
  // sameField leaves the hidden “双眼皮” out because nothing switches them on: 机械援助 (aceffect_band_43) is granted by
  // no strategy, 机变 card, garrison or item of either season — if one does, the turrets make the fields differ
  for (const d of [DATA, ACT3]) {
    const grants = JSON.stringify([d.bands, d.choices, d.garrisons, d.items]);
    assert.ok(!grants.includes('aceffect_band_43'), 'a record grants 机械援助: sameField must count the hidden 双眼皮 (shared/seasonBorrow.js sameIgnores)');
  }
  // a same field is never borrowed, either way; a different one is
  assert.equal(borrowPlan(ACT3, [['act2autochess', DATA]], { stages: ['act1autochess_m04', 'act2autochess_m02', 'act2autochess_m01'], types: [] })
    .stages.map(([id]) => id).join(), 'act2autochess_m01');
  assert.equal(borrowPlan(DATA, [[ACT3_ID, ACT3]], { stages: ['act3autochess_m01', 'act3autochess_m06'], types: [] }), null);
});

test("the 'step' curve: each official step after round 1 at the set multiplier; null = official; leaders alike", () => {
  const mode = DATA.config.modes.mode_multi_hard;
  assert.equal(officialStep(mode, 'hp'), 1.2);
  assert.equal(officialStep(mode, 'atk'), 1.1);
  if (ACT3) assert.equal(officialStep(ACT3.config.modes.mode_multi_abyss, 'atk'), 1.11);
  if (ACT3) assert.equal(officialStep(ACT3.config.modes.mode_multi_abyss, 'hp'), 1.2, 'the 补给线 share left out');
  assert.equal(stepScale(2, 3, 1, 1.2, 1.2), 2);
  const gd = new GameData(DATA, 'mode_multi_hard', sanitizeCustom({ enemies: { curve: 'step', stepHp: 130, stepAtk: 100 } }));
  const off = new GameData(DATA, 'mode_multi_hard');
  const e = mode.enemyScale;
  assert.deepEqual(gd.enemyScale(1), off.enemyScale(1), 'round 1 as it is');
  for (const r of [4, 9, 13]) {
    const k = e[r].kHp - e[1].kHp;
    assert.ok(Math.abs(gd.enemyScale(r).hpMul - e[r].hp * (1.3 / 1.2) ** k) < 1e-9, `round ${r} hp`);
    // the table's own numbers are rounded (1.948717 for 1.1^7): round 1's within that
    assert.ok(Math.abs(gd.enemyScale(r).atkMul - e[1].atk) < 1e-4, `round ${r} atk ×1.00 per step = round 1's`);
    assert.ok(Math.abs(gd.leaderScale(r).atkMul - gd.enemyScale(r).atkMul) < 1e-9, `round ${r} leader atk`);
  }
  const same = new GameData(DATA, 'mode_multi_hard', sanitizeCustom({ enemies: { curve: 'step' } }));
  for (const r of [1, 7, 14]) assert.deepEqual(same.enemyScale(r), off.enemyScale(r), `round ${r}: the official multipliers`);
  assert.deepEqual(customDiffs({ enemies: { curve: 'step' } }), [], 'the step curve at the official values is no difference');
  assert.deepEqual(sanitizeCustom({ enemies: { curve: 'gentle', stepHp: 150 } }).enemies.stepHp, null, 'steps only with the step curve');
});

test("browser data store: setBorrow reads the same borrowed records the server's match does", { skip }, async () => {
  const fileOf = (url) => {
    const m = /^\/data\/(?:s\/([^/]+)\/)?([a-z-]+\.json)$/.exec(url);
    if (!m) return null;
    const own = m[1] ? `data/seasons/${m[1]}/${m[2]}` : `data/${m[2]}`;
    const p = existsSync(own) ? own : `data/${m[2]}`;
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
  };
  const fetch = async (url) => {
    const body = fileOf(String(url));
    return body == null ? { ok: false, status: 404 } : { ok: true, status: 200, json: async () => JSON.parse(body) };
  };
  const st = createDataStore({ fetch, retryDelays: [], timeoutMs: 0 });
  const ids = customBorrowIds(sanitizeCustom({ stages: { extra: ['act3autochess_m10'] }, types: { pick: { CRITIC: 'force' } } }));
  await st.loadAll('stages', 'enemies', 'factions');
  assert.equal(st.lookup('stages', 'act3autochess_m10'), null, 'nothing borrowed yet');
  await st.setBorrow(ids);
  const server = borrowedData(DATA, 'act2autochess', sanitizeCustom({ stages: { extra: ['act3autochess_m10'] }, types: { pick: { CRITIC: 'force' } } }));
  assert.equal(st.lookup('stages', 'act3autochess_m10')?.borrowed, ACT3_ID);
  assert.equal(st.get('factions')?.types?.CRITIC?.borrowed, ACT3_ID);
  for (const n of ['stages', 'enemies']) {
    const mine = st.borrowRaw(n, await st.load(n));
    assert.deepEqual(Object.keys(mine).sort(), Object.keys(server[n]).sort(), `${n}: the sim's records are the server's`);
  }
  assert.equal(st.lendable('types', 'REBORN')?.type, 'REBORN', 'another season lends the name of a type not borrowed');
  await st.setBorrow(null);
  assert.equal(st.lookup('stages', 'act3autochess_m10'), null, 'borrowing ends with the room');
});
