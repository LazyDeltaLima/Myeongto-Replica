// test/local-patch-diy.test.js — the nas-local 선발 (自选) picks on upstream 0.2.0's 自选 framework (local patch,
// docs/LOCAL-PATCH.md 「선발 오퍼레이터」): only the owner's five picks are offered and accepted (shared/local-diy.js: the
// server's welcome `diyKitted` and its room.diy check — server/lobby.js; shared/diy.js stays upstream's), 丰川祥子 is built into data/backups.json (tools/build-data.mjs
// DIY_LOCAL_INCLUDED), and the five kits (server/sim/content/kits/ops/op-wang.js, op-chen3.js, op-wisdel.js, op-oblvns.js,
// op-ascln.js — the former kits/diy.js) keep the behaviour the owner decided. Every operator is fielded the production
// way: a DIY slot + its `diy` pick (test/helpers/battleHarness.js `diy`), the elite with its X module (the module our
// former 선발 records carried by default), and the 望 stone tests also through the real match path (Match board →
// battleInput → BattleSpec → createBattleFromSpec).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { makeBattle, flatStage, enemyRec } from './helpers/battleHarness.js';
import { COLS } from '../server/sim/constants.js';
import { diyPool, diyRecord, validateDiyPicks, isPrototypePick } from '../shared/diy.js';
import { LOCAL_DIY_PICKS, isLocalDiyPick } from '../shared/local-diy.js';
import { checkDiyPicks } from '../shared/protocol.js';
import { KITTED_CHARS, OPERATOR_KITS } from '../server/sim/content/kits/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = (rel) => import(pathToFileURL(path.join(ROOT, 'public', 'js', rel)).href);
const CHESS = JSON.parse(readFileSync(path.join(ROOT, 'data/chess.json'), 'utf8'));
const BACKUPS = JSON.parse(readFileSync(path.join(ROOT, 'data/backups.json'), 'utf8'));
const DATA = { chess: CHESS, backups: BACKUPS };

const ENEMY = 'enemy_1422_lrsldr';
const CHAR = { wang: 'char_2027_wang', chen3: 'char_1050_chen3', wisdel: 'char_1035_wisdel', oblvns: 'char_4182_oblvns', ascln: 'char_4132_ascln' };
const STONE = 'token_10064_wang_stone1';
const SHADE = 'token_10035_wisdel_wward';
const MOD = (key) => `uniequip_002_${key}`;
/** The pick of `key` (the elite carries its X module, as the former 선발 records did by default). */
const pickOf = (key, elite, skillIndex) => ({ charId: CHAR[key], skillIndex, uniEquipId: elite ? MOD(key) : null });
/** A harness unit: `key` in the first DIY slot of `tier` (uid 1), `elite` = the `_b` form. */
const op = (key, { tier = 6, elite = true, sk = 0, row, col, ...rest } = {}) => ({ diy: { slot: tier, ...pickOf(key, elite, sk) }, elite, row, col, uid: 1, ...rest });
/** The composed record of that pick (shared/diy.js diyRecord — what the kit receives as `chess`). */
const recOf = (key, { tier = 6, elite = true, sk = 0 } = {}) => diyRecord(`chess_char_${tier}_diy1_a`, pickOf(key, elite, sk), { elite, data: DATA });
const stone = (row, col, uid) => ({ kind: 'token', tokenId: STONE, ownerUid: 1, row, col, uid });
const tagged = (h, tag) => h.hooksOf('damaged').filter((d) => d.dmg?.tags?.includes(tag)).length;
/** The old helper: `key` (tier-6 elite) with skill `sk` on (r, c), SP full, two waves of 重装 soldiers. */
const battle = (key, sk, r, c, extra = [], secs = 25) => {
  const h = makeBattle({ seed: 5, timeLimit: 60, captureNoisy: true,
    units: [op(key, { sk, row: r, col: c, carryState: { sp: 999 } }), ...extra],
    enemies: [{ key: ENEMY, time: 0, route: 0, count: 8, interval: 1.2 }, { key: ENEMY, time: 1, route: 1, count: 6, interval: 1.6 }] });
  h.run(secs);
  return h;
};
const POS = { wang: [11, 3], chen3: [10, 4], wisdel: [11, 4], oblvns: [10, 4], ascln: [10, 4] };

describe('선발 picks on upstream 自选 (shared/local-diy.js, server/lobby.js welcome / room.diy, tools/build-data.mjs)', () => {
  test('offered: the welcome\'s diyKitted is exactly the owner\'s five in his order — the client picker (diyPool kitted) shows them only', async () => {
    const { Lobby } = await import('../server/lobby.js');
    assert.deepEqual([...LOCAL_DIY_PICKS], Object.values(CHAR));
    const kitted = Lobby.prototype.welcomeInfo.call({}).diyKitted;
    assert.deepEqual([...kitted].sort(), Object.values(CHAR).sort());
    for (const tier of [5, 6]) assert.deepEqual(diyPool(tier, { data: DATA, kitted }).sort(), Object.values(CHAR).sort(), `tier ${tier}`);
    // upstream's data and helpers stay whole: the 71 + her owned picks and the prototypes are still there, only not offered
    assert.ok(BACKUPS.diy.ownedPool.length > 5 && BACKUPS.diy.ownedPool.includes('char_112_siege'));
    assert.ok(BACKUPS.diy.prototypes[5].length > 0 && isPrototypePick(DATA, 6, 'char_609_acguad'));
    assert.ok(diyPool(6, { data: DATA, kitted: KITTED_CHARS }).includes('char_112_siege'), 'upstream\'s diyPool unchanged');
    assert.equal(isLocalDiyPick('char_112_siege'), false);
    for (const id of Object.values(CHAR)) assert.ok(OPERATOR_KITS[id], `${id}: a kit (ops/op-<codename>.js)`);
  });

  test('accepted: room.diy keeps the five and drops anyone else (another owned 6★, a prototype, a reserve) — the seat never holds one', async () => {
    const { Lobby } = await import('../server/lobby.js');
    const session = {};
    const lobby = { safeData: () => DATA, roomOf: () => null };
    const res = Lobby.prototype.diy.call(lobby, session, { picks: {
      chess_char_5_diy1_a: { charId: 'char_112_siege', skillIndex: 0 }, chess_char_5_diy2_a: { charId: 'char_601_cguard' },
      chess_char_6_diy1_a: pickOf('wang', false, 0), chess_char_6_diy2_a: { charId: 'char_609_acguad' } } });
    assert.deepEqual(res, { ok: true });
    assert.deepEqual(Object.keys(session.diy), ['chess_char_6_diy1_a'], 'only the local pick is kept');
    assert.equal(session.diy.chess_char_6_diy1_a.charId, CHAR.wang);
    const ok = validateDiyPicks({ chess_char_5_diy1_a: pickOf('wisdel', false, 2), chess_char_6_diy1_a: pickOf('oblvns', false, 1) }, { data: DATA, kitted: KITTED_CHARS });
    assert.ok(ok.ok, ok.detail);
    const lenient = checkDiyPicks({ chess_char_6_diy1_a: pickOf('wang', false, 0) }, { data: DATA, kitted: KITTED_CHARS });
    assert.deepEqual(Object.keys(lenient.picks), ['chess_char_6_diy1_a']);
  });

  test('data: 丰川祥子 has her units / operators entries like the others (collab, taken in); 望 / 陈 炎, the others 协防; 望\'s 棋子 go on any tile', () => {
    assert.ok(BACKUPS.diy.ownedPool.includes(CHAR.oblvns));
    assert.ok(!BACKUPS.diy.excluded.includes(CHAR.oblvns));
    const u = BACKUPS.units[CHAR.oblvns];
    assert.deepEqual(Object.keys(u.forms).sort(), ['2/1/4/0', '2/60/7/1', '2/60/7/3']);
    for (const f of Object.values(u.forms)) assert.equal(f.skills.length, 3);
    assert.deepEqual(BACKUPS.diy.operators[CHAR.oblvns].bonds, ['emptyShip']);
    assert.deepEqual(BACKUPS.diy.operators[CHAR.wang].bonds, ['yanShip']);
    assert.deepEqual(BACKUPS.diy.operators[CHAR.chen3].bonds, ['yanShip']);
    for (const k of ['wisdel', 'ascln']) assert.deepEqual(BACKUPS.diy.operators[CHAR[k]].bonds, ['emptyShip'], k);
    // the slot status: normal E2 Lv1 skill 4, elite E2 Lv60 skill 7, module 1 (V) / 3 (VI); no 特质
    const a = recOf('wisdel', { elite: false }), b = recOf('wisdel'), b5 = recOf('wisdel', { tier: 5 });
    assert.deepEqual(a.status, { phase: 2, level: 1, skillLevel: 4, equipLevel: 0 });
    assert.deepEqual(b.status, { phase: 2, level: 60, skillLevel: 7, equipLevel: 3 });
    assert.equal(b5.status.equipLevel, 1);
    assert.equal(BACKUPS.tokens[STONE].position, 'ALL');
  });

  test('effects: prefab groups and the event mapping by the client names', async () => {
    const { fxBundleOf, effectGroups, effectsFor } = await mod('render/fxmap.js');
    assert.equal(fxBundleOf('char_1050_chen3'), 'chen3');
    const list = ['chen3_attack_start_01', 'chen3_attack_hit_01', 'chen3_skill_01_start_01', 'chen3_skill_01_start_02', 'chen3_skill_01_buff_01',
      'chen3_skill_02_B_buff_02', 'chen3_skill_02_buff_01', 'chen3_skill_02_hit_01', 'chen3_skill_01_start_01_sale#10', 'chen3_buff_start_01'];
    const g = effectGroups(list);
    assert.ok(!g.skill1.some((p) => p.includes('#')), 'skin variants dropped');
    assert.deepEqual(effectsFor(list, 'skillStart', 0), ['chen3_skill_01_start_01', 'chen3_skill_01_start_02']);
    assert.deepEqual(effectsFor(list, 'skillBuff', 1), ['chen3_skill_02_buff_01']);
    assert.deepEqual(effectsFor(list, 'attackHit'), ['chen3_attack_hit_01']);
    assert.deepEqual(effectsFor(['wang_attack_01_start', 'wang_attack_01_hit', 'wang_attack_01_trail'], 'attackStart'), ['wang_attack_01_start']);
    assert.deepEqual(effectsFor(['yu_attack_01', 'yu_hit_01', 'yu_skill3_hit_01'], 'attackHit'), ['yu_hit_01']);
    assert.deepEqual(effectsFor(['wisdel_attack_a_start', 'wisdel_attack_b_start', 'wisdel_attack_down_a_start'], 'attackStart'), ['wisdel_attack_a_start']);
    assert.deepEqual(effectsFor(['whitw2_attack_01_start', 'whitw2_hit_01'], 'attackStart'), ['whitw2_attack_01_start']);
    assert.deepEqual(effectsFor(['qiubai_attack_combat_A_start_01', 'qiubai_attack_start_01'], 'attackStart'), ['qiubai_attack_start_01']);
  });

  test('丰川祥子 notes: client trail / hit prefab per sim note mode; the drawn flight is the sim\'s (render/fxmap.js NOTE_FX)', async () => {
    const { noteEffects, NOTE_FX, NOTE_FLIGHT } = await mod('render/fxmap.js');
    const { OBLVNS_NOTE } = await import('../server/sim/content/kits/ops/op-oblvns.js');
    assert.deepEqual(noteEffects('base'), { trail: 'oblvns_attack_01_trail', hit: 'oblvns_attack_01_hit' });
    assert.deepEqual(noteEffects('talent'), { trail: 'oblvns_talent_trail', hit: 'oblvns_attack_01_hit' });
    assert.deepEqual(noteEffects('s1', 1), { trail: 'oblvns_skill_01_trail', hit: 'oblvns_skill_01_hit' });
    assert.deepEqual(noteEffects('s1', 8), { trail: 'oblvns_skill_01_trail_08', hit: 'oblvns_skill_01_hit' });
    assert.deepEqual(noteEffects('piano'), { trail: 'oblvns_skill_02_trail_02', hit: 'oblvns_skill_02_hit_02' });
    assert.deepEqual(noteEffects('organ'), { trail: 'oblvns_skill_02_trail', hit: 'oblvns_skill_02_hit' });
    assert.deepEqual(noteEffects('s3'), { trail: 'oblvns_skill_03_trail_02', hit: 'oblvns_skill_03_hit_02' });
    assert.deepEqual(noteEffects('s3m'), { trail: 'oblvns_skill_03_trail', hit: 'oblvns_skill_03_hit' });
    assert.equal(noteEffects('nope'), null);
    assert.deepEqual(Object.keys(NOTE_FX).sort(), Object.keys(OBLVNS_NOTE).sort(), 'one effect per sim note mode');
    for (const [k, f] of Object.entries(OBLVNS_NOTE)) {
      for (const p of ['free', 'track', 'turn']) assert.equal(NOTE_FLIGHT[k][p], f[p], `${k}.${p}`);
      assert.equal(NOTE_FLIGHT[k].sine ?? 0, f.sine ?? 0, `${k}.sine`);
    }
    const idx = path.join(ROOT, 'public/assets/local/fx/index.json');
    if (existsSync(idx)) { // the extracted bundle (local client files only)
      const { default: index } = await import(pathToFileURL(idx).href, { with: { type: 'json' } });
      const have = new Set(index.bundles.oblvns || []);
      for (const m of Object.keys(NOTE_FX)) for (let i = m === 's1' ? 1 : 0; i <= (m === 's1' ? 8 : 0); i++) {
        const fx = noteEffects(m, i);
        assert.ok(have.has(fx.trail) && have.has(fx.hit), `${m}${i || ''}: ${fx.trail} / ${fx.hit} extracted`);
      }
    }
  });
});

describe('선발 kits (server/sim/content/kits/ops/op-wang / chen3 / wisdel / oblvns / ascln.js)', () => {
  test('every candidate × skill × form: its own kit spec, casts, deals damage, no content errors', () => {
    for (const [key, [r, c]] of Object.entries(POS)) {
      for (const [tier, elite] of [[6, true], [5, true], [5, false]]) {
        for (const sk of [0, 1, 2]) {
          // 望 S3: one lone (never activated) prep stone — S3 needs a placed one, and with its x-1 passive area two linked
          // stones by the lane clear the waves before she ever casts
          const wangStones = sk < 2 ? [stone(10, 6, 50), stone(10, 7, 51)] : [stone(10, 6, 50)];
          const h = makeBattle({ seed: 5, timeLimit: 60, captureNoisy: true,
            units: [op(key, { tier, elite, sk, row: r, col: c, carryState: { sp: 999 } }), ...(key === 'wang' ? wangStones : [])],
            enemies: [{ key: ENEMY, time: 0, route: 0, count: 8, interval: 1.2 }, { key: ENEMY, time: 1, route: 1, count: 6, interval: 1.6 }] });
          h.run(25);
          const u = h.unit(1);
          const at = `${key} T${tier}${elite ? ' elite' : ''} S${sk + 1}`;
          assert.equal(h.b.errors.length, 0, `${at}: ${h.b.errors[0]?.error?.message || ''}`);
          assert.equal(u.def.charId, CHAR[key], at);
          assert.ok(!u.kit.generic, `${at}: not the generic kit`);
          assert.equal(u.kit?.skillSource, 'skills', `${at} uses its hand spec`);
          assert.ok(h.hooksOf('skillStart').some((x) => x.unit === u), `${at} casts`);
          const dealt = h.hooksOf('damaged').filter((d) => d.source === u || d.source?.ownerUnit === u).reduce((a, d) => a + (d.amount || 0), 0);
          assert.ok(dealt > 0, `${at} deals damage`);
        }
      }
    }
  });

  test('赤刃明霄陈: S3 剑气 travels and hits; S2 slashes ≥ 10 then 【移动】; S1 silences', () => {
    assert.ok(tagged(battle('chen3', 2, 10, 4), 'chen3Qi') > 0, 'the 剑气 hits');
    const h2 = battle('chen3', 1, 10, 4);
    assert.ok(tagged(h2, 'chen3S2') >= 10, '10 slashes (+1 per kill)');
    assert.equal(h2.hooksOf('deploy').filter((d) => d.unit === h2.unit(1) && d.move).length, 1, 'moves to the target tile');
    assert.ok(battle('chen3', 0, 10, 4).hooksOf('statusApplied').some((s) => (s.key ?? s.status) === 'silence'));
  });

  test('维什戴尔: 残影 explodes on aftershocks; the 魂灵之影 hits; S3 summons more shades (≤ 3)', () => {
    const h = battle('wisdel', 2, 11, 4);
    assert.ok(tagged(h, 'wisdelBomb') > 0 && tagged(h, 'summon') > 0);
    const shades = h.b.allies(h.unit(1).ownerId).filter((a) => a.kind === 'token' && a.defId === SHADE);
    assert.ok(shades.length > 1 && shades.length <= 3, `shades ${shades.length}`);
    for (const s of shades) assert.ok(s.kit && !s.kit.generic && s.kit.fromTokens, 'the shade runs its kit (under its deploy limit)');
  });

  test('阿斯卡纶: 死亡拘审 stacks tick arts damage', () => {
    assert.ok(tagged(battle('ascln', 1, 10, 4), 'dot') > 0);
  });

  test('阿斯卡纶 S3: enemies in her range miss 30 % of their attacks; a miss on her heals her (port fix: the range test always failed)', () => {
    const hitterRec = enemyRec({ key: 'enemy_hitter', hp: 1e9, speed: 0, mass: 0, atk: 200, range: 1.5, bat: 0.5 });
    const h = makeBattle({ seed: 5, timeLimit: 900, autoFinish: false, captureNoisy: true, defs: { enemies: { enemy_hitter: hitterRec } },
      flags: { dpPerSec: 0, dpMax: 999 }, units: [op('ascln', { sk: 2, row: 10, col: 5 })] });
    h.step();
    const u = h.unit(1);
    const hitter = h.spawn('enemy_hitter', { pos: [10, 6] });
    h.b.addBuff(hitter, { key: 'test:dodge', mods: { dodgePhys: 1 } });   // she never kills it
    h.b.addBuff(u, { key: 'test:tough', mods: { defFlat: 1e6 } });
    h.b.on('fatal', (c) => { if (c.unit === u) c.prevented = true; });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 5), 'S3 cast');
    u.skill.extend?.(400);
    const seen = new Set(), passed = new Set();
    h.b.on('hit', (c) => { if (c.source === hitter && c.dmg.isAttack) seen.add(c.dmg.attackId); }, { priority: 100 });
    h.b.on('hit', (c) => { if (c.source === hitter && c.dmg.isAttack && !c.dmg.cancel) passed.add(c.dmg.attackId); }, { priority: -100 });
    const heals0 = h.hooksOf('heal').filter((c) => c.target === u).length;
    h.run(200);
    const rate = 1 - passed.size / seen.size;
    const want = Math.abs(recOf('ascln', { sk: 2 }).skill.bb['attack@damage_hitrate_physical']);
    assert.ok(seen.size > 200 && Math.abs(rate - want) < 0.06, `miss rate ${rate.toFixed(3)} of ${seen.size} (want ${want})`);
    assert.ok(h.hooksOf('heal').filter((c) => c.target === u).length > heals0, 'a miss on her heals her');
    assert.equal(h.b.errors.length, 0);
  });

  test('丰川祥子: S2 switches the timbre on each cast', () => {
    const h = battle('oblvns', 1, 10, 4, [], 30);
    const casts = h.hooksOf('skillStart').filter((x) => x.unit === h.unit(1)).length;
    assert.ok(casts >= 1);
    assert.equal(h.unit(1).mem.timbre, casts % 2 ? 'organ' : 'piano');
  });

  // 丰川祥子 talents (namu 4.6 + PRTS 备注, 2026-10-05): 持续攻击 with no enemy, notes, ASPD aura incl. herself, LOR-Y
  describe('丰川祥子 talents', () => {
    const solo = (form, sk, { flat, enemies = [], kits, secs = 6 } = {}) => {
      const h = makeBattle({ seed: 5, timeLimit: Math.max(60, secs + 10), captureNoisy: true, flat, kits, enemies,
        units: [op('oblvns', { ...form, sk, row: 10, col: 4 })] });
      h.run(secs);
      return h;
    };
    const blankAtks = (h, u) => h.eventsOf('atk').filter((e) => e[1] === u.id && e[2] == null).length;

    test('持续攻击: attacks with no enemy in range — attack SP, notes stack; ASPD aura on herself (data value)', () => {
      for (const form of [{ tier: 5, elite: false }, { tier: 6, elite: true }]) {
        const h = solo(form, 1);
        const u = h.unit(1);
        const at = JSON.stringify(form);
        assert.equal(h.b.errors.length, 0);
        assert.ok(blankAtks(h, u) >= 4, `${at}: keeps attacking (${blankAtks(h, u)})`);
        assert.ok(u.skill.sp >= 4, `${at}: attack-type SP from the empty attacks (${u.skill.sp})`);
        assert.ok(u.mem.notes >= 1, `${at}: the notes count`);
        const t1 = recOf('oblvns', { ...form, sk: 1 }).talents.find((t) => t.index === 1).bb;
        assert.equal(u.findBuff('oblvns:aspd')?.mods?.aspd, t1.attack_speed, `${at}: 毋畏遗忘 ASPD on herself`);
      }
    });

    test('持续攻击: no note while the tile in front has 通行类型 无', () => {
      const wall = (row) => row.slice(0, 5) + 'X' + row.slice(6);
      const base = flatStage().rows;
      const rows = {}; for (const r of [9, 10, 11, 12]) rows[r] = wall(base[r]);
      const h = solo({}, 1, { flat: { rows } });
      const u = h.unit(1);
      assert.equal(blankAtks(h, u), 0);
      assert.equal(u.skill.sp, 0);
    });

    test('持续攻击 under S3: a blank attack plays 2 piano notes at the S3 attack@atk_scale, phys (the skill override; review 2026-10-06)', () => {
      const scale = recOf('oblvns', { sk: 2 }).skill.bb['attack@atk_scale'];
      assert.ok(scale > 1);
      const h = makeBattle({ seed: 5, timeLimit: 60, captureNoisy: true, autoFinish: false,
        enemies: [{ key: ENEMY, time: 5, route: 0, count: 3, interval: 1 }],
        units: [op('oblvns', { sk: 2, row: 10, col: 4 })] });
      h.step(1);
      const u = h.unit(1);
      u.skill.activate('manual', { free: true });
      assert.ok(u.skill.active);
      const hits = [];
      const orig = h.b.dealDamage.bind(h.b);
      h.b.dealDamage = (src, t, d) => { if (src === u && d?.tags?.includes('blankNote') && u.skill.active) hits.push({ d, atk: u.s.atk }); return orig(src, t, d); };
      h.run(3);
      const born = h.eventsOf('fx').filter((e) => e[1] === 'oblvnsNote' && e[4].e === 'born' && e[4].m === 's3'); // s3m: the 2 organ notes, one each
      assert.ok(born.length > 0 && born.every((e) => e[4].w === 2), `S3 piano notes are 2 each (${born.map((e) => e[4].w)})`);
      h.run(12);
      assert.ok(hits.length > 0, 'a blank note landed during S3');
      for (const { d } of hits) assert.equal(d.type, 'phys');
      const per = hits.map((x) => x.d.amount / x.atk);
      assert.ok(Math.max(...per) > 1.2, `amount / ATK = ${per.map((v) => v.toFixed(2))} (S3 ${scale})`);
    });

    test('持续攻击: notes in flight home on an enemy entering her range', () => {
      const h = solo({}, 1, { enemies: [{ key: ENEMY, time: 6, route: 0, count: 3, interval: 1 }], secs: 25 });
      assert.ok(tagged(h, 'blankNote') > 0);
    });

    // notes (2026-10-06, EN client projectile_chr_oblvns* + PRTS 备注; op-oblvns.js NOTE)
    const noteEvents = (h) => {
      const m = new Map();
      for (const e of h.eventsOf('fx')) {
        if (e[1] !== 'oblvnsNote') continue;
        const n = m.get(e[4].n) || { mode: e[4].m, ev: [] };
        m.set(e[4].n, n);
        n.ev.push({ e: e[4].e, x: e[2], y: e[3], t: e[4].t });
      }
      return m;
    };

    test('notes: an attack lands when its note arrives (client note speed ≈ 2 tiles/s), not at the arrow speed', () => {
      const log = [];
      const h = makeBattle({ seed: 5, timeLimit: 60, captureNoisy: true, units: [op('oblvns', { sk: 1, row: 10, col: 4 })],
        enemies: [{ key: ENEMY, time: 0, route: 0, count: 3, interval: 3 }],
        setup(b) {
          b.on('attack', (c) => { if (c.attacker.uid === 1 && c.attacker.kind === 'op' && c.targets[0]) log.push({ k: 'atk', t: b.time, d: Math.hypot(c.targets[0].x - c.attacker.x, c.targets[0].y - c.attacker.y) }); });
          b.on('damaged', (c) => { if (c.source?.uid === 1 && c.source?.kind === 'op' && c.dmg?.isAttack && !c.dmg.tags?.includes('blankNote')) log.push({ k: 'dmg', t: b.time }); });
        } });
      h.run(20);
      assert.equal(h.b.errors.length, 0);
      const a = log.find((x) => x.k === 'atk');
      assert.ok(a, 'she attacked an enemy');
      const d = log.find((x) => x.k === 'dmg' && x.t > a.t);
      assert.ok(d, 'the attack landed');
      assert.ok(d.t - a.t >= 0.4, `lands after the free flight (${(d.t - a.t).toFixed(2)} s for ${a.d.toFixed(2)} tiles)`);
      const notes = noteEvents(h);
      assert.ok([...notes.values()].some((n) => n.ev[0].e === 'born' && n.ev.some((x) => x.e === 'track') && n.ev.at(-1).e === 'hit'), 'born → track → hit');
    });

    test('notes: untargeted notes fly on past her range and go `delay` s after leaving it; the count is the live notes', () => {
      const h = solo({}, 0, { secs: 12 });
      const u = h.unit(1);
      assert.equal(h.b.errors.length, 0);
      const notes = noteEvents(h);
      const keys = new Set(u.rangeKeys);
      const gone = [...notes.values()].filter((n) => n.ev.at(-1).e === 'gone');
      assert.ok(gone.length >= 3, `notes ended (${gone.length})`);
      for (const n of gone) {
        assert.equal(n.mode, 'talent', '持续攻击 without a skill: projectile_chr_oblvns_talent');
        const [b, end] = [n.ev[0], n.ev.at(-1)];
        const L = Math.hypot(end.x - b.x, end.y - b.y), ux = (end.x - b.x) / L, uy = (end.y - b.y) / L;
        assert.ok(Math.abs(Math.atan2(uy, ux)) <= (20.5 * Math.PI) / 180, 'within ±20° of her facing (RIGHT)');
        let last = 0;
        for (let s = 0; s <= L; s += 0.01) if (keys.has(Math.round(b.y + uy * s) * COLS + Math.round(b.x + ux * s))) last = s;
        assert.ok(L - last >= 1.2 && L - last <= 1.45, `flew ${(L - last).toFixed(2)} tiles past her range before it went`);
      }
      const alive = [...notes.values()].filter((n) => !['gone', 'hit'].includes(n.ev.at(-1).e)).length;
      assert.equal(u.mem.noteList.length, alive, 'the kit keeps exactly the notes still flying');
      h.run(0.3);
      assert.equal(u.mem.notes, Math.min(recOf('oblvns').talents.find((t) => t.index === 0).bb.max_cnt, u.mem.noteList.length), '颂乐音符 count = live notes (≤ max_cnt)');
    });

    test('notes: when she leaves, only the tracing notes stay — and still land', () => {
      const h = makeBattle({ seed: 5, timeLimit: 60, captureNoisy: true, units: [op('oblvns', { sk: 2, row: 10, col: 4, carryState: { sp: 999 } })],
        enemies: [{ key: ENEMY, time: 0, route: 0, count: 6, interval: 1 }] });
      const u = h.unit(1);
      let tracing = 0;
      for (let i = 0; i < 900 && !tracing; i++) {
        h.step(1);
        const l = u.mem.noteList || [];
        if (l.some((n) => n.state === 'track') && l.some((n) => n.state === 'free')) tracing = l.filter((n) => n.state === 'track').length;
      }
      assert.ok(tracing > 0, 'tracing and free notes in flight');
      h.b.retreat(u, { reason: 'retreat' });
      h.step(1);
      assert.ok(u.mem.noteList.length > 0 && u.mem.noteList.every((n) => n.state === 'track'), 'free notes cleared');
      const before = h.hooksOf('damaged').filter((x) => x.source === u).length;
      h.run(6);
      assert.ok(h.hooksOf('damaged').filter((x) => x.source === u).length > before, 'a tracing note still hits');
      assert.equal(u.mem.noteList.length, 0);
      assert.equal(h.b.errors.length, 0);
    });

    test('LOR-Y stage 2+: no ranged ATK cut on her attacks while a skill runs', async () => {
      const { default: KIT } = await import('../server/sim/content/kits/ops/op-oblvns.js');
      const plain = { [CHAR.oblvns]: (bb, chess, def) => KIT[CHAR.oblvns](bb, { ...chess, talents: chess.talents.map((t) => ({ ...t, fromModule: false })) }, def) };
      const enemies = [{ key: ENEMY, time: 0, route: 0, count: 8, interval: 1.2 }, { key: ENEMY, time: 1, route: 1, count: 6, interval: 1.6 }];
      const perHit = (h) => {
        const u = h.unit(1);
        const d = h.hooksOf('damaged').filter((x) => x.source === u && x.dmg?.isAttack && x.dmg.isSkill && !x.dmg.tags?.includes('note'));
        return d.reduce((a, x) => a + x.amount, 0) / Math.max(1, d.length);
      };
      assert.ok(recOf('oblvns').talents.find((t) => t.index === 0).fromModule, 'the tier-6 elite\'s talent is the module\'s');
      const withMod = perHit(solo({}, 2, { enemies, secs: 25 }));
      const without = perHit(solo({}, 2, { enemies, kits: plain, secs: 25 }));
      assert.ok(withMod > without * 1.1, `${withMod} vs ${without}`);
    });

    test('S2 满月的舞会: organ attacks deal arts damage; in Fever every attack hits twice', () => {
      const h = solo({}, 1, { secs: 160, enemies: [{ key: ENEMY, time: 0, route: 0, count: 120, interval: 1 }, { key: ENEMY, time: 0.5, route: 1, count: 120, interval: 1 }] });
      const u = h.unit(1);
      assert.equal(h.b.errors.length, 0);
      const atk = h.hooksOf('damaged').filter((x) => x.source === u && x.dmg?.isAttack && !x.dmg.tags?.includes('note'));
      assert.ok(atk.some((x) => x.type === 'arts'), 'organ: arts');
      assert.ok(atk.some((x) => x.type === 'phys'), 'piano: phys');
      assert.ok(h.eventsOf('fx').some((e) => e[1] === 'sunBurst'), 'Fever reached');
      const hits = new Map();
      for (const x of atk) if (x.dmg.attackId) hits.set(x.dmg.attackId, (hits.get(x.dmg.attackId) || 0) + 1);
      assert.ok([...hits.values()].some((n) => n >= 2), 'a Fever attack hits twice');
    });
  });

  test('望: only connected 棋子 trigger; battle start = prep layout (no 跟子); traps take no hits; used up on a trigger, back on their tile for DP (the card returns); S3 x-1 area', () => {
    const noSp = (extra) => { // S1 not cast yet: only the placed stones
      const b = makeBattle({ seed: 5, timeLimit: 60, captureNoisy: true, units: [op('wang', { sk: 0, row: 11, col: 3 }), ...extra],
        enemies: [{ key: ENEMY, time: 0, route: 0, count: 8, interval: 1.2 }, { key: ENEMY, time: 1, route: 1, count: 6, interval: 1.6 }] });
      b.run(12);
      return b;
    };
    assert.equal(tagged(noSp([stone(9, 6, 50)]), 'trap'), 0, 'a lone stone is not activated');
    assert.ok(tagged(noSp([stone(9, 6, 50), stone(9, 7, 51)]), 'trap') > 0, 'connected stones trigger');
    // six placed stones (the deploy limit): the layout at the battle start is the prep layout, also later on
    const placed = [[10, 5], [10, 6], [10, 7], [11, 5], [11, 7], [12, 6]];
    const h6 = makeBattle({ seed: 5, timeLimit: 60, captureNoisy: true,
      units: [op('wang', { sk: 0, row: 11, col: 3 }), ...placed.map(([r, c], i) => stone(r, c, 60 + i))],
      enemies: [{ key: ENEMY, time: 0, route: 0, count: 6, interval: 1.2 }, { key: 'enemy_1019_jshoot', time: 0, route: 1, count: 4, interval: 2 }] });
    const layout = () => h6.allies().filter((u) => u.kind === 'token' && u.alive).map((u) => `${u.tileR},${u.tileC}`).sort();
    const want = placed.map(([r, c]) => `${r},${c}`).sort();
    h6.step(1);
    assert.deepEqual(layout(), want, 'battle start = prep layout');
    for (const t of h6.allies().filter((u) => u.kind === 'token')) assert.ok(t.kit && t.kit.fromTokens && !t.kit.generic, 'the placed stones run the stone kit');
    h6.run(30);
    for (const k of layout()) assert.ok(want.includes(k), `${k}: stones only come back on their own tiles`);
    for (const t of h6.allies().filter((u) => u.kind === 'token')) assert.ok(t.s.flags.untargetable && t.s.flags.invulnerable, 'stones are traps');
    assert.equal(h6.hooksOf('damaged').filter((d) => d.target?.kind === 'token').length, 0, 'no enemy hits a stone (ranged 弩手 included)');
    assert.equal(h6.b.errors.length, 0);
    // a trigger uses the stone up; it comes back on its tile after respawnTime, for its DP cost
    const hc = makeBattle({ seed: 5, captureNoisy: true, units: [op('wang', { sk: 0, row: 11, col: 3 }), stone(9, 6, 50), stone(9, 7, 51)],
      enemies: [{ key: ENEMY, time: 0, route: 0, count: 1 }, { key: ENEMY, time: 30, route: 1, count: 1 }] });
    hc.runUntil(() => tagged(hc, 'trap') > 0, 20);
    hc.step(1);
    const used = hc.b.allyUnits.find((u) => u.kind === 'token' && !u.alive);
    assert.ok(used && used.mem.wangUsed && !used.removed, 'the triggered stone is gone, waiting');
    const w = hc.unit(1), stock0 = w.mem.wang.stock;
    let dpBefore = 0;
    for (let i = 0; i < 20 / 0.05 && !used.alive; i++) { dpBefore = hc.b.players[0].dp; hc.step(1); }
    assert.ok(used.alive && used.mem.wangUsed === false, 'redeployed');
    assert.equal(w.mem.wang.stock, stock0, 'the card itself comes back: no stock spent (token deck rule)');
    assert.ok(hc.b.players[0].dp < dpBefore - 1.5, 'its DP cost paid (2 for the VI elite: module −1)');
    // S1 with stones in the stock: deployed next to hers; their 跟子 do not count under the limit (nothing withdrawn)
    const s1 = battle('wang', 0, 11, 3, [stone(10, 6, 50), stone(10, 7, 51)], 30);
    const all = s1.allies().filter((u) => u.kind === 'token' && u.alive);
    assert.ok(all.some((u) => u.mem.wangFollower), '跟子 with an automatic deployment');
    assert.ok(all.filter((u) => !u.mem.wangFollower).length <= 6, 'stones ≤ maxDeployCount');
    // S3 equipped: the x-1 diamond triggers and hits (passive), flyers included
    assert.ok(tagged(battle('wang', 2, 11, 3, [stone(10, 6, 50), stone(10, 7, 51)], 20), 'trap') > 0);
  });

  test('望 棋子: 激活 and 料敌机先 stacks are latched; with S3 a high-ground stone catches ground enemies (x-1 diamond), with S1 it does not', () => {
    const h = makeBattle({ seed: 5, captureNoisy: true, units: [op('wang', { sk: 0, row: 11, col: 3 }), stone(9, 5, 50), stone(9, 6, 51), stone(9, 7, 52)],
      enemies: [{ key: ENEMY, time: 0, route: 0, count: 3, interval: 1.2 }] });
    h.step(2);
    for (const c of [6, 7]) h.b.retreat(h.allies().find((u) => u.kind === 'token' && u.tileC === c), { reason: 'expired', permanent: true });
    h.step(1);
    const last = h.allies().filter((u) => u.kind === 'token' && u.alive);
    assert.equal(last.length, 1);
    assert.equal(last[0].mem.active, true, 'stays active');
    assert.equal(last[0].mem.line, 3, '料敌机先 keeps 3 stacks');
    let n = 0;
    h.runUntil(() => (n = h.hooksOf('damaged').filter((d) => d.dmg?.tags?.includes('trap')).length) > 0, 15);
    assert.ok(n > 0, 'the lone (latched) stone triggers');
    const hi = (sk) => {
      const b = makeBattle({ seed: 5, captureNoisy: true, stage: flatStage({ rows: { 10: '##hrrhhrrrfrrrrrrrf##' } }),
        units: [op('wang', { sk, row: 11, col: 3 }), stone(10, 5, 50), stone(10, 6, 51)],
        enemies: [{ key: ENEMY, time: 0, route: 0, count: 6, interval: 1.2 }] });
      b.run(15);
      return b.hooksOf('damaged').filter((d) => d.dmg?.tags?.includes('trap') && d.source?.kind === 'token').length;
    };
    assert.ok(hi(2) > 0, 'S3: the x-1 diamond reaches the lane');
    assert.equal(hi(0), 0, 'S1: tile only — ground enemies never enter a high-ground stone');
    // the S3 area is x-1 (radius-2 diamond, sktok_wang_3 prefab), not the table's x-6 cross: a stone at 10,1 reaches the
    // lane only through its diagonal
    const diag = makeBattle({ seed: 5, captureNoisy: true,
      stage: flatStage({ rows: { 10: '#hhrrrrrrrfrrrrrrrf##', 11: '#hhrrrrrrrfrrrrrrrf##' } }),
      units: [op('wang', { sk: 2, row: 11, col: 3 }), stone(10, 1, 50), stone(11, 1, 51)],
      enemies: [{ key: ENEMY, time: 0, route: 0, count: 3, interval: 1.2 }] });
    diag.step();
    diag.unit(1).skill.opReadyAt = Infinity; // S3 equipped for its stone area, never cast here
    const fromCorner = () => diag.hooksOf('damaged').some((d) => d.dmg?.tags?.includes('trap') && d.source?.tileR === 10 && d.source?.tileC === 1);
    diag.runUntil(fromCorner, 60);
    assert.ok(fromCorner(), 'S3: the stone triggers through its x-1 diagonal');
  });

  test('维什戴尔 S2 过载: the main shot uses atk_scale_ol in the second half (her profile copy, not ctx.profile)', () => {
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 60, units: [op('wisdel', { sk: 1, row: 11, col: 4, carryState: { sp: 999 } })],
      enemies: [{ key: ENEMY, time: 0, route: 0, count: 30, interval: 0.8 }] });
    const u = h.unit(1);
    const ol0 = recOf('wisdel', { sk: 1 }).skill.bb['attack@atk_scale_ol'];
    const first = [], ol = [];
    h.b.on('hit', (c) => {
      if (c.source !== u || !c.dmg?.isAttack || c.dmg.isSplash || c.dmg.tags?.includes('wisdelShot') || !u.skill.active) return;
      (u.skill.timeLeft > u.skill.duration / 2 + 0.3 ? first : u.skill.timeLeft < u.skill.duration / 2 - 0.3 ? ol : []).push(c.dmg.amount / u.s.atk);
    }, { priority: 100 });
    h.run(45);
    assert.ok(first.length && ol.length, 'attacks in both halves');
    assert.ok(first.every((r) => Math.abs(r - 1) < 1e-6), `first half: the full scale (${first})`);
    assert.ok(ol.every((r) => Math.abs(r - ol0) < 1e-6), `overload: atk_scale_ol ${ol0} (${ol})`);
  });

  test('선발 kits audit: 赤刃明霄陈 S2 never slashes an unrevealed 隐匿 enemy; 阿斯卡纶 S2 spreads 死亡拘审 on a death in range', async () => {
    const { enemyStealthed } = await import('../server/sim/targeting.js');
    const h = makeBattle({ seed: 5, captureNoisy: true, units: [op('chen3', { sk: 1, row: 10, col: 5, carryState: { sp: 999 } })],
      enemies: [{ key: 'enemy_1019_jshoot', time: 0, route: 0, count: 4, interval: 0.4 }, { key: ENEMY, time: 0.2, route: 0, count: 3, interval: 1 }] });
    let bad = 0, good = 0;
    h.b.on('hit', (c) => { if (c.dmg?.tags?.includes('chen3S2')) { if (c.target.s.flags.stealth && enemyStealthed(c.target)) bad++; else good++; } }, { priority: 100 });
    h.run(25);
    assert.equal(bad, 0, 'no slash on a 隐匿 enemy');
    assert.ok(good > 0, 'the slashes wait for a selectable target');
    const a = makeBattle({ seed: 5, captureNoisy: true, units: [op('ascln', { sk: 1, row: 10, col: 4, carryState: { sp: 999 } })],
      enemies: [{ key: ENEMY, time: 0, route: 0, count: 10, interval: 0.5 }] });
    let spread = 0;
    const f = a.b.foesInRadius.bind(a.b);
    a.b.foesInRadius = (...args) => { if (Math.abs(args[2] - 1.3) < 1e-9 && args[3] === true) spread++; return f(...args); };
    a.run(30);
    assert.ok(spread > 0, 'the S2 death spread runs (rangeKeys is an array: `.has?.` never matched)');
  });

  test('赤刃明霄陈 S3 剑气 turns like the client (ChangeStateWithHighlandBehaviour: next tile highland / 侵入点 / 保护目标 / map edge within 0.25 → 90° clockwise)', async () => {
    const { chen3QiAdvance } = await import('../server/sim/content/kits/ops/op-chen3.js');
    const LOW = { height: 'LOW', pass: 'ALL' };
    const grid = (special = {}) => ({ inRect: (r, c) => r >= 0 && r <= 9 && c >= 0 && c <= 9, tile: (r, c) => special[`${r},${c}`] || LOW });
    const run = (g, st, secs) => { const turns = []; for (let i = 0; i < Math.round(secs * 30); i++) { const { d, x, y } = st; if (chen3QiAdvance(g, st, 1.5 / 30)) turns.push({ from: d, to: st.d, x, y }); } return turns; };
    let st = { x: 2, y: 5, d: 'RIGHT' };
    let turns = run(grid({ '5,5': { height: 'HIGH', pass: 'FLY' } }), st, 2);
    assert.deepEqual(turns.map((t) => [t.from, t.to]), [['RIGHT', 'DOWN']], 'RIGHT → DOWN (clockwise, UP = +row)');
    assert.ok(Math.abs(turns[0].x - 4.25) < 1e-6 && Math.abs(turns[0].y - 5) < 1e-9, `turned at x 4.25 (got ${turns[0].x})`);
    for (const [t, wall] of [[{ height: 'LOW', pass: 'ALL', special: 'start' }, true], [{ height: 'LOW', pass: 'ALL', special: 'end' }, true],
      [{ height: 'LOW', pass: 'NONE' }, false], [{ height: 'LOW', pass: 'ALL', special: 'telin' }, false]]) {
      st = { x: 5, y: 2, d: 'UP' };
      turns = run(grid({ '4,5': t }), st, 1);
      assert.equal(turns.length > 0, wall, `${JSON.stringify(t)} ${wall ? 'turns' : 'passes'}`);
      if (wall) assert.ok(Math.abs(turns[0].y - 3.25) < 1e-6 && turns[0].to === 'RIGHT', 'UP → RIGHT at 0.25 past row 3');
    }
    st = { x: 2, y: 0, d: 'LEFT' };
    turns = run(grid(), st, 9);
    assert.deepEqual(turns.slice(0, 2).map((t) => [t.from, t.to, +t.x.toFixed(2), +t.y.toFixed(2)]), [['LEFT', 'UP', -0.25, 0], ['UP', 'RIGHT', -0.25, 9.25]]);
    st = { x: 5, y: 5, d: 'UP' };
    turns = run(grid({ '6,5': { height: 'HIGH' }, '5,6': { height: 'HIGH' } }), st, 1);
    assert.deepEqual(turns.map((t) => [t.from, t.to, +t.x.toFixed(2), +t.y.toFixed(2)]), [['UP', 'RIGHT', 5, 5.25], ['RIGHT', 'DOWN', 5.25, 5.25]]);
    // in a battle: the fx payload keeps { x, y, id, dir }, and every turn is clockwise (row 10 col 4 facing RIGHT: the field
    // edge at col 10 turns it DOWN, then the 侵入点 at row 9 col 10 turns it LEFT)
    const h = battle('chen3', 2, 10, 4);
    const qi = h.eventsOf('fx').filter((e) => e[1] === 'chen3Qi');
    assert.ok(qi.length > 50, 'the 剑气 flies');
    assert.deepEqual(qi.filter((e, i) => i && e[4].dir !== qi[i - 1][4].dir).map((e) => e[4].dir), ['DOWN', 'LEFT'], 'map edge, then 侵入点');
    const DIRS = ['UP', 'RIGHT', 'DOWN', 'LEFT'];
    for (let i = 0; i < qi.length; i++) {
      assert.deepEqual(Object.keys(qi[i][4]).sort(), ['dir', 'id']);
      if (i && qi[i][4].dir !== qi[i - 1][4].dir) assert.equal(qi[i][4].dir, DIRS[(DIRS.indexOf(qi[i - 1][4].dir) + 1) % 4], 'turns clockwise');
    }
  });

  test('赤刃明霄陈 S3: a 剑气 step that strikes sends kitHit chen3:s3 (her official projectile hit sound)', () => {
    const h = makeBattle({ seed: 5, timeLimit: 60, captureNoisy: true, units: [op('chen3', { sk: 2, row: 10, col: 4, carryState: { sp: 999 } })],
      enemies: [{ key: ENEMY, time: 0, route: 0, count: 8, interval: 1.2 }, { key: ENEMY, time: 1, route: 1, count: 6, interval: 1.6 }] });
    for (let i = 0; i < 1200 && !h.b.finished && !h.events.some((e) => e[0] === 'fx' && e[1] === 'kitHit'); i++) h.step(1);
    const k = h.events.find((e) => e[0] === 'fx' && e[1] === 'kitHit');
    assert.ok(k, 'kitHit sent');
    assert.equal(k[4].k, 'chen3:s3');
    assert.equal(k[4].id, h.unit(1).id);
  });

  test('望 client-data rules: hand cap 7 counts the hand only; S1 DoT ticks 7×; 望 leaving kills her stones; a redeployed stone brings a 跟子', () => {
    const six = [[9, 5], [9, 6], [9, 7], [10, 5], [10, 7], [11, 6]].map(([r, c], i) => stone(r, c, 60 + i));
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 120, units: [op('wang', { sk: 0, row: 11, col: 3, carryState: { sp: 999 } }), ...six],
      enemies: [{ key: ENEMY, time: 30, route: 0, count: 1 }] });
    h.step(2);
    const w = h.unit(1);
    assert.equal(w.mem.wang.prepPlaced, 6);
    assert.ok(h.hooksOf('skillStart').some((x) => x.unit === w), 'S1 cast');
    assert.equal(w.mem.wang.stock, 2, '0 + 2 cards: the 6 on the field are not counted');
    const d = makeBattle({ seed: 5, captureNoisy: true, units: [op('wang', { sk: 0, row: 11, col: 3 }), stone(9, 6, 50), stone(9, 7, 51)],
      enemies: [{ key: 'enemy_1001_bigbo', time: 0, route: 0, count: 1 }] });
    d.runUntil(() => d.hooksOf('damaged').some((x) => x.dmg?.tags?.includes('dot')), 30);
    d.run(8);
    const ticks = d.hooksOf('damaged').filter((x) => x.dmg?.tags?.includes('dot') && x.dmg?.tags?.includes('trap'));
    const first = ticks.filter((x) => x.dmg.sourceless);
    assert.ok(first.length >= 7 && first.length % 7 === 0, `7 ticks per trigger (${first.length})`);
    const k = makeBattle({ seed: 5, captureNoisy: true, units: [op('wang', { sk: 0, row: 11, col: 3 }), stone(9, 6, 50), stone(9, 7, 51)], enemies: [{ key: ENEMY, time: 40, route: 0, count: 1 }] });
    k.step(2);
    k.b.retreat(k.unit(1));
    assert.equal(k.allies().filter((u) => u.kind === 'token' && u.alive).length, 0, 'KillTokens on her exit');
    const r = makeBattle({ seed: 5, captureNoisy: true, units: [op('wang', { sk: 0, row: 11, col: 3 }), stone(9, 6, 50), stone(9, 7, 51)], enemies: [{ key: ENEMY, time: 0, route: 0, count: 1 }, { key: ENEMY, time: 40, route: 1, count: 1 }] });
    r.runUntil(() => r.b.allyUnits.some((u) => u.kind === 'token' && u.mem.wangUsed), 30);
    const used = r.b.allyUnits.find((u) => u.kind === 'token' && u.mem.wangUsed);
    r.runUntil(() => used.alive, 20);
    assert.ok(used.alive, 'redeployed');
    assert.ok(r.allies().some((u) => u.kind === 'token' && u.alive && u.mem.wangFollower), '跟子 with the redeploy (ON_OWNER_BORN)');
  });

  test('望 跟子 never land on enemy spawn / goal / hole tiles (client exceptTileTypes mask 14) nor undeployable high ground', () => {
    for (const sk of [0, 2]) {
      const stage = flatStage({ rows: { 12: '##hrrrrr#rSrrrrrrrS##' } });
      const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 60, stage,
        units: [op('wang', { sk, row: 11, col: 7, carryState: { sp: sk === 2 ? 999 : 0 } }), stone(12, 9, 50), stone(11, 9, 51)],
        enemies: [{ key: ENEMY, time: 0, route: 1, count: 6, interval: 3 }] });
      assert.equal(h.b.grid.tile(12, 10).key, 'tile_start');
      const bad = [];
      let fol = 0;
      const orig = h.b.spawnToken.bind(h.b);
      h.b.spawnToken = (...a) => {
        const u = orig(...a);
        if (u && a[4]?.kit && !a[4].kit.fromTokens) {
          fol++;
          const t = h.b.grid.tile(a[2], a[3]);
          if (t.special === 'start' || t.special === 'end' || /^tile_(start|end|hole|allygoal|enemygoal)/.test(t.key) || (t.build === 'NONE' && t.height === 'HIGH')) bad.push(`${a[2]},${a[3]} ${t.key}`);
        }
        return u;
      };
      h.run(40);
      assert.deepEqual(bad, [], `S${sk + 1}: no 跟子 on forbidden tiles`);
      if (sk === 2) assert.ok(fol > 0, 'S3 built 跟子 (elsewhere)');
    }
  });

  /** 跟子 spawned (spawnToken with a kit outside the deploy limit — a placed stone's kit carries fromTokens). */
  const countFollowers = (b, on = () => true) => {
    let n = 0;
    const orig = b.spawnToken.bind(b);
    b.spawnToken = (...a) => { const u = orig(...a); if (u && a[4]?.kit && !a[4].kit.fromTokens && on()) n++; return u; };
    return () => n;
  };

  test('望 S3: a used stone coming back during S3 is her deployment — it builds the S3 跟子 around it, one ammo each', () => {
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 120, autoFinish: false,
      units: [op('wang', { sk: 2, row: 11, col: 3 }), ...[4, 5, 6, 7, 8, 9].map((c, i) => stone(9, c, 50 + i))],
      enemies: [{ key: ENEMY, time: 0, route: 0, count: 6, interval: 2 }] });
    h.step(2);
    const w = h.unit(1);
    w.skill.activate('manual', { free: true });
    h.b.players[0].dp = 99;
    const built = countFollowers(h.b);
    const seen = [];
    let redeploys = 0;
    h.b.on('deploy', (c) => { if (c.unit.kind === 'token' && c.unit.mem?.wangUsed === true && w.skill.active) redeploys++; });
    const a0 = w.skill.ammoLeft;
    for (let i = 0; i < 25 / 0.05 && w.skill.active; i++) {
      const am = w.skill.ammoLeft, b0 = built();
      h.step(1);
      if (w.skill.active && built() > b0) seen.push([am - w.skill.ammoLeft, built() - b0]);
    }
    assert.ok(redeploys > 0, 'used stones came back during S3');
    assert.ok(a0 - (w.skill.active ? w.skill.ammoLeft : 0) > 0, 'ammo spent');
    for (const [spent, n] of seen) assert.equal(spent, n, 'one ammo per 跟子 built');
  });

  test('望 S3: one ammo per 跟子 actually built around a deployment: 4 free neighbours → 4, fewer → fewer', () => {
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 120, autoFinish: false,
      units: [op('wang', { sk: 2, row: 11, col: 3 }), ...[5, 6, 7, 8, 9].map((c, i) => stone(12, c, 50 + i))] });
    h.step(2);
    const w = h.unit(1);
    w.skill.activate('manual', { free: true });
    h.step(1);
    assert.ok(w.skill.active);
    for (const f of h.allies().filter((u) => u.kind === 'token' && u.alive && u.mem.wangFollower)) h.b.retreat(f, { reason: 'expired', permanent: true });
    let base = 0;
    const built = countFollowers(h.b);
    const put = (r, c) => { const e = h.spawn('enemy_1001_bigbo', { pos: [r, c], route: 0 }); h.b.applyStatus(e, 'stun', { duration: 99 }); return e; };
    const seen = [];
    for (const [r, c] of [[10, 5], [11, 4]]) {
      const a0 = w.skill.ammoLeft;
      base = built();
      const e = put(r, c);
      h.run(1.2);
      seen.push([a0 - w.skill.ammoLeft, built() - base]);
      h.b.kill(e);
    }
    assert.deepEqual(seen[0], [4, 4], '10,5: four free neighbours → 4 跟子, 4 ammo');
    assert.ok(seen[1][0] === seen[1][1] && seen[1][0] < 4 && seen[1][0] > 0, `11,4: fewer neighbours → fewer ammo (${seen[1]})`);
  });

  test('望 S3: among enemy tiles of her range the enemy closest to its goal comes first, not the one closest to her (user decision 2026-10-06)', () => {
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 120, autoFinish: false,
      units: [op('wang', { sk: 2, row: 11, col: 3 }), ...[5, 6, 7, 8, 9].map((c, i) => stone(12, c, 50 + i))] });
    h.step(2);
    const w = h.unit(1);
    w.skill.activate('manual', { free: true });
    h.step(1);
    assert.ok(w.skill.active);
    const put = (r, c) => { const e = h.spawn('enemy_1001_bigbo', { pos: [r, c], route: 0 }); h.b.applyStatus(e, 'stun', { duration: 99 }); return e; };
    const near = put(11, 4), goal = put(9, 4);
    assert.ok(h.b.remainingDistance(goal) < h.b.remainingDistance(near));
    const spawned = [];
    const orig = h.b.spawnToken.bind(h.b);
    h.b.spawnToken = (...a) => { const u = orig(...a); if (u) spawned.push([u.tileR, u.tileC]); return u; };
    h.run(1.2);
    assert.deepEqual(spawned[0], [9, 4], `the first stone went on the enemy nearest its goal (${JSON.stringify(spawned)})`);
  });

  test('望 S3: her used stones waiting to come back hold their slots — no prep stone is ever withdrawn by the deploy limit', () => {
    for (const seed of [5, 7, 11, 13]) {
      const h = makeBattle({ seed, captureNoisy: true, timeLimit: 120, autoFinish: false,
        units: [op('wang', { sk: 2, row: 11, col: 3 }), ...[4, 5, 6, 7, 8, 9].map((c, i) => stone(9, c, 50 + i))],
        enemies: [{ key: ENEMY, time: 0, route: 0, count: 8, interval: 1.5 }, { key: ENEMY, time: 0.5, route: 1, count: 8, interval: 1.7 }] });
      h.step(2);
      const w = h.unit(1);
      h.b.players[0].dp = 99;
      let lost = 0, cast = false;
      const orig = h.b.retreat.bind(h.b);
      h.b.retreat = (t, o) => { if (t.kind === 'token' && o?.permanent && t.mem?.replaced) lost++; return orig(t, o); };
      for (let i = 0; i < 40 / 0.05; i++) {
        if (!cast && h.b.allyUnits.some((t) => t.mem?.wangUsed)) cast = w.skill.activate('manual', { free: true });
        h.step(1);
      }
      assert.ok(cast, `seed ${seed}: S3 cast while a stone waited`);
      assert.equal(lost, 0, `seed ${seed}: no stone withdrawn by the deploy limit`);
    }
  });

  test('望 S3 start: overflow 跟子 go enemy tiles first, then by tile class — undeployable ground before deployable ground (PRTS 技能3 备注)', () => {
    const base = flatStage().rows;
    const rows = { 10: base[10].slice(0, 6) + 'ff' + base[10].slice(8), 11: base[11].slice(0, 6) + 'ff' + base[11].slice(8) };
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 120, autoFinish: false, flat: { rows },
      units: [op('wang', { sk: 2, row: 11, col: 3 }), stone(9, 9, 50)] });
    h.step(2);
    const w = h.unit(1);
    w.mem.wang.stock = w.mem.wang.deckCap; // a full hand: all 8 go out as 跟子
    const placedAt = [];
    const orig = h.b.spawnToken.bind(h.b);
    h.b.spawnToken = (...a) => { const u = orig(...a); if (u) placedAt.push([u.tileR, u.tileC]); return u; };
    w.skill.activate('manual', { free: true });
    assert.ok(placedAt.length > 0);
    const cls = ([r, c]) => { const t = h.b.grid.tile(r, c); return t.build === 'NONE' ? 0 : t.height === 'LOW' ? 1 : 2; };
    const seq = placedAt.map(cls);
    assert.deepEqual(seq.slice(0, 4), [0, 0, 0, 0], `the 4 undeployable ground tiles first: ${seq} at ${JSON.stringify(placedAt)}`);
    for (let i = 1; i < seq.length; i++) assert.ok(seq[i] >= seq[i - 1], `class order ${seq} at ${JSON.stringify(placedAt)}`);
  });

  test('望 S3 天下劫 (ammo): no stone placed in the prep → nothing placed, stays active; with stones → 跟子 + deployments for ammo, leftover ammo back as stones', () => {
    const run = (extra) => {
      const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 120, units: [op('wang', { sk: 2, row: 11, col: 3 }), ...extra],
        enemies: [{ key: ENEMY, time: 0, route: 0, count: 20, interval: 2 }, { key: ENEMY, time: 1, route: 1, count: 15, interval: 2.5 }] });
      h.run(40);
      return h;
    };
    const none = run([]);
    const w0 = none.unit(1);
    assert.ok(w0.skill.active, 'zero stones: the skill stays active (user\'s observation of the real game)');
    assert.equal(w0.skill.ammoLeft, 20, 'no ammo spent');
    assert.equal(none.allies().filter((u) => u.kind === 'token' && u.alive).length, 0, 'no stone appears');
    assert.equal(none.hooksOf('skillEnd').filter((x) => x.unit === w0).length, 0);
    const some = run([stone(9, 6, 50), stone(9, 7, 51)]);
    const w1 = some.unit(1);
    assert.ok(some.hooksOf('skillStart').some((x) => x.unit === w1), 'cast');
    const fol = some.allies().filter((u) => u.kind === 'token' && u.alive && u.mem.wangFollower).length;
    assert.ok(!w1.skill.active || w1.skill.ammoLeft < 20 || fol >= 8, `ammo spent unless max_spawn_cnt is (nearly) reached (${fol})`);
    assert.ok(fol > 0, 'ChargeToken overflow → InstantSpawn 跟子');
    assert.ok(tagged(some, 'trap') > 0);
    if (w1.skill.active) {
      const st0 = w1.mem.wang.stock, left = w1.skill.ammoLeft;
      w1.skill.end('stop');
      assert.equal(w1.mem.wang.stock, Math.min(w1.mem.wang.deckCap, st0 + left), 'leftover ammo → cards in the hand (≤ 最多拥有 7)');
    }
  });

  test('望 棋子: a stone neither selects nor hits an unrevealed 隐匿 enemy (隐形弩手), like Battle.foesInRadius', () => {
    for (const sk of [1, 2]) {
      const h = makeBattle({ seed: 5, captureNoisy: true, units: [op('wang', { sk, row: 11, col: 3 }), stone(9, 6, 50), stone(9, 7, 51), stone(10, 6, 52)],
        enemies: [{ key: 'enemy_1019_jshoot', time: 0, route: 0, count: 2, interval: 0.6 }, { key: ENEMY, time: 0.3, route: 0, count: 2, interval: 0.6 }] });
      h.run(20);
      const trap = h.hooksOf('damaged').filter((d) => d.dmg?.tags?.includes('trap'));
      assert.ok(trap.some((d) => d.target.defId !== 'enemy_1019_jshoot'), `S${sk + 1}: the others are hit`);
      assert.equal(trap.filter((d) => d.target.defId === 'enemy_1019_jshoot').length, 0, `S${sk + 1}: no 隐匿 enemy in the blast`);
    }
  });

  test('棋子 / 医疗探机: no HP bar on the stone, no direction step (shared/trap-tokens.js, ui/facing.js needsFacing)', async () => {
    const { noHpBar, facingless } = await import('../shared/trap-tokens.js');
    const { needsFacing } = await import('../public/js/ui/facing.js');
    assert.equal(noHpBar(STONE), true);
    assert.equal(noHpBar('token_10000_silent_healrb'), false);
    const ctx = (piece) => ({ pieces: new Map([[7, { piece }]]) });
    const tgt = { area: 'board', row: 10, col: 5 }, res = { ok: true, action: 'move' };
    for (const id of [STONE, 'token_10000_silent_healrb']) {
      assert.equal(facingless(id), true);
      assert.equal(needsFacing(ctx({ uid: 7, kind: 'token', id }), 7, tgt, res), false, `${id}: placed at once`);
    }
    assert.equal(needsFacing(ctx({ uid: 7, kind: 'token', id: 'token_10028_vigil_wolf' }), 7, tgt, res), true, 'other summons keep the wheel');
    assert.equal(needsFacing(ctx({ uid: 7, kind: 'chess', id: 'chess_char_6_diy1_a' }), 7, tgt, res), true, 'operators keep the wheel');
  });
});

describe('望 棋子 through the real match path (seats[].diy → Match board → battleInput → BattleSpec → createBattleFromSpec)', () => {
  const T6 = 'chess_char_6_diy1_a';
  /** A solo match whose player slots 望 (skill `sk`) in the first tier-6 slot, on m04 at `round`, with her on 9,3 and her six stones on 9,4…9,9. */
  const wangMatch = async (sk, round) => {
    const { makeMatch } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [T6]: pickOf('wang', false, sk) } }];
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    h.toPrep(round);
    h.setStage('act2autochess_m04');
    const m = h.m, ps = h.ps('p_0');
    assert.ok(ps.diy?.[T6]?.charId === CHAR.wang, 'the pick is the player\'s');
    ps.initDiyStock?.(new Set());
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    const w = ps.acquireChess(T6, { source: 'buy' });
    assert.ok(w, 'her piece');
    assert.ok(m.handle('p_0', { t: 'g.move', uid: w.uid, to: { area: 'board', row: 9, col: 3 }, dir: 'RIGHT' }).ok);
    for (let c = 4; c <= 9; c++) {
      const card = ps.hand.find((p) => p && p.kind === 'token' && p.id === STONE);
      assert.ok(card, 'the stone cards are in the hand');
      assert.ok(m.handle('p_0', { t: 'g.move', uid: card.uid, to: { area: 'board', row: 9, col: c } }).ok, `stone on 9,${c}`);
    }
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    return { h, m, ps, b };
  };

  test('a used-up stone comes back on its prep tile, again and again, for DP; the client sees die → deploy', async () => {
    const { b, m } = await wangMatch(0, 1);
    b.start();
    const wu = b.allyUnits.find((u) => u.kind === 'op');
    assert.equal(wu.def.charId, CHAR.wang);
    for (const t of b.allyUnits.filter((u) => u.kind === 'token')) assert.ok(t.kit?.fromTokens && !t.kit.generic, 'placed stones run the stone kit');
    const back = [];
    b.on('deploy', (c) => { if (c.unit.kind === 'token' && b.time > 0.5) back.push([c.unit.id, c.unit.tileR, c.unit.tileC, c.unit.homeR, c.unit.homeC]); });
    const ev = [];
    while (!b.finished && b.time < 15) { b.step(); ev.push(...b.drainEvents()); }
    assert.ok(back.length >= 2, `used-up stones come back more than once (${back.length})`);
    for (const [, r, c, hr, hc] of back) assert.deepEqual([r, c], [hr, hc], 'on the tile placed in the prep');
    const id = back[0][0];
    const kinds = ev.filter((e) => (e[0] === 'die' || e[0] === 'deploy') && e[1] === id).map((e) => e[0]);
    assert.ok(kinds.indexOf('deploy', kinds.indexOf('die')) > 0, `die → deploy for the stone (${kinds.join(' ')})`);
    assert.equal(b.errors.length, 0);
    m.dispose?.();
  });

  test('S3 (6 prep stones, m04 round 4): ammo really drops per 跟子 built, the snapshot ammo bar follows, refund from the same count', async () => {
    const { b, m } = await wangMatch(2, 4);
    b.start();
    const wu = b.allyUnits.find((u) => u.kind === 'op');
    while (b.time < 8) b.step();
    wu.skill.activate('manual', { free: true });
    const built = countFollowersIn(b, () => wu.skill.active);
    const a0 = wu.skill.ammoLeft;
    while (!b.finished && b.time < 22 && wu.skill.active) b.step();
    assert.ok(wu.skill.ammoLeft < a0, `ammo spent (${a0} → ${wu.skill.ammoLeft})`);
    assert.equal(wu.mem.wang.ammo, wu.skill.ammoLeft, 'the kit count = the engine count');
    const tup = b.snapshot().units.find((x) => x[0] === wu.id);
    assert.ok(Math.abs(tup[5] - tup[6] * wu.skill.ammoLeft / wu.skill.ammoMax) < 0.2, 'the snapshot ammo bar shows it');
    const st0 = wu.mem.wang.stock, left = wu.skill.ammoLeft;
    wu.skill.end('stop');
    assert.equal(wu.mem.wang.stock, Math.min(wu.mem.wang.deckCap, st0 + left), 'refund = the ammo left');
    assert.ok(built() > 0);
    assert.equal(b.errors.length, 0);
    m.dispose?.();
  });

  function countFollowersIn(b, on) {
    let n = 0;
    const orig = b.spawnToken.bind(b);
    b.spawnToken = (...a) => { const u = orig(...a); if (u && a[4]?.kit && !a[4].kit.fromTokens && on()) n++; return u; };
    return () => n;
  }
});

describe('频次 enemies lose exactly 1 HP per damage instance — the 선발 kits', () => {
  const TIMES = 'enemy_1200_msfjin'; // 青铜镜 · 30 hits
  test('선발 kits × skills (望 stones, 陈 剑气 / S2, 维什戴尔, 祥子 notes, 阿斯卡纶 DoT): never more than 1 HP per instance', () => {
    const many = [{ key: TIMES, time: 0, route: 0, count: 6, interval: 1.2 }, { key: TIMES, time: 1, route: 1, count: 6, interval: 1.6 }];
    for (const [key, at] of Object.entries(POS)) {
      for (const sk of [0, 1, 2]) {
        const h = makeBattle({ seed: 5, timeLimit: 60, captureNoisy: true, enemies: many,
          units: [op(key, { sk, row: at[0], col: at[1], carryState: { sp: 999 } }), ...(key === 'wang' ? [stone(10, 6, 50), stone(10, 7, 51)] : [])] });
        let inst = new Map();
        const over = [];
        h.b.on('damaged', (c) => {
          if (c.target?.side === 'enemy' && c.type !== 'element' && c.amount > 0 && !c.dmg?.tags?.includes('hpLoss')) inst.set(c.target, (inst.get(c.target) ?? 0) + c.amount);
        });
        const last = new Map();
        for (let i = 0; i < 25 * 30; i++) {
          inst = new Map();
          h.step(1);
          for (const e of new Set([...last.keys(), ...h.b.enemies])) {
            if (!(e.s.flags.hitCount || e.s.flags.hitCountArts) && last.get(e) == null) continue;
            const cur = e.alive ? e.hp : 0, prev = last.get(e);
            last.set(e, cur);
            if (prev != null && prev - cur > (inst.get(e) ?? 0) + 1e-6) over.push(`${e.defId} t=${h.b.time.toFixed(2)} −${(prev - cur).toFixed(2)} for ${inst.get(e) ?? 0}`);
          }
        }
        assert.equal(h.b.errors.length, 0);
        assert.ok(h.hooksOf('damaged').some((d) => d.target?.side === 'enemy' && d.amount > 0 && d.type !== 'element'), `${key} S${sk + 1} hits`);
        assert.deepEqual(over, [], `${key} S${sk + 1}`);
        for (const d of h.hooksOf('damaged')) if (d.target?.side === 'enemy' && d.type !== 'element') assert.ok(d.amount <= 1, `${key} S${sk + 1}: ${d.amount}`);
      }
    }
  });
});
