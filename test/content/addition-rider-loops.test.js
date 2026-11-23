// test/content/addition-rider-loops.test.js — no operator's own-output rider and a bond's / item's 附加伤害 rider may answer
// each other. The client's riders on ON_OUTPUT_DAMAGE skip attack type ADDITION (附加伤害) and deal ADDITION themselves;
// a kit rider that answered an ADDITION hit, or dealt its own without the 'addition' tag, re-triggered the bond's rider
// and was re-triggered by it until the engine's hook-depth guard (32 frames) cut the chain: 予愿安洁莉娜's T1 with 奥术 /
// 卡西米尔 dealt ~24 × ATK per attack, with the golden 伊比利亚骨刺刀 (two riders a hit) hundreds of thousands of hits a
// second. Rules: docs/rules/diy.md 「부가 대미지 되먹임」.
//
// The sweep: every operator of each season and every 自选 pick × skill, a member of each rider (变形同构体 + the bond's
// item, or the item alone), against dummies for a few seconds; no hook-depth error and a bounded number of damage
// instances. ALLOWED lists the cases that may still trip it, each with its reason (none today).
// Run: node --test test/content/addition-rider-loops.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { DataSource } from '../../server/sim/simdata.js';
import { getData } from '../../server/data.js';
import { LOCAL_DIY_PICKS } from '../../shared/local-diy.js';

/** `${season} ${rider} ${unit label}` → why it may loop (none). */
const ALLOWED = new Map();

const QUIET = { warn() {}, error() {}, info() {} };
const SECONDS = 8;
/** Far above any honest case (a few hundred instances in SECONDS s): a branching loop passes it within one attack. */
const MAX_INSTANCES = 20000;

/** The riders of a season: bond → { count, tier } to activate it, or an item alone. */
const RIDERS = {
  act2autochess: [
    { label: '卡西米尔 6', bond: 'kazimierzShip' },
    { label: '叙拉古 6', bond: 'siracusaShip' },
  ],
  act3autochess: [
    { label: '奥术 3', bond: 'arcaneShip' },
    { label: '卡西米尔 6', bond: 'kazimierzShip' },
    { label: '伊比利亚骨刺刀 (golden)', item: 'chess_item_3_14_e_b' },
    { label: '动能轰击弩', item: 'chess_item_6_08_e_a' },
  ],
};

function seasonData(season) {
  const raw = getData({ log: QUIET, season });
  return {
    raw,
    data: new DataSource({ ...raw, enemies: { ...raw.enemies,
      enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e12, speed: 0, mass: 0, def: 0, res: 0 }),
      enemy_fly: enemyRec({ key: 'enemy_fly', hp: 1e12, speed: 0, mass: 0, def: 0, res: 0, motion: 'FLY' }) } }, null),
  };
}

function unitsOf(raw) {
  const slots = raw.backups?.diy?.slots ?? {};
  const slot = Object.keys(slots).find((k) => slots[k].tier === 6);
  const out = [];
  for (const id of Object.keys(raw.chess)) if (/^chess_char_.*_b$/.test(id) && !raw.chess[id].isDiy) out.push({ label: id, unit: { chessId: id } });
  for (const charId of LOCAL_DIY_PICKS) for (const skillIndex of [0, 1, 2]) out.push({ label: `${charId} S${skillIndex + 1}`, unit: { diy: { slot, charId, skillIndex }, elite: true } });
  return out;
}

function riderSetup(raw, r) {
  if (r.item) return { items: [r.item], bonds: {} };
  const items = Object.values(raw.items);
  const iso = items.find((i) => i.canGiveBond && !i.isGolden)?.id;
  const it = items.find((i) => i.giveBondId === r.bond && i.isGolden)?.id;
  assert.ok(iso && it, `precondition: 变形同构体 and an item of ${r.bond} in the season`);
  const th = raw.bonds[r.bond].thresholds;
  return { items: [iso, it], bonds: { [r.bond]: { count: th[th.length - 1], active: true, tier: th.length, layers: 200 } } };
}

/** One battle: `{ setup: false }` when the unit cannot be fielded this way, else the hook-depth errors and the count. */
function run(data, season, u, setup) {
  let h;
  try {
    h = makeBattle({ season, data, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, hooks: [],
      bonds: setup.bonds, units: [{ uid: 1, row: 10, col: 4, items: setup.items, ...u.unit }] });
  } catch { return { setup: false }; }
  h.step();
  const me = h.unit(1), b = h.b;
  if (!me) return { setup: false };
  let n = 0;
  const tags = new Set();
  b.on('damaged', (c) => { if (c.source === me) { n++; for (const t of c.dmg?.tags ?? []) tags.add(t); } }, { priority: -1e9 });
  h.spawn('enemy_dummy', { pos: [10, 5] }); h.spawn('enemy_dummy', { pos: [10, 6] }); h.spawn('enemy_fly', { pos: [9, 6] });
  for (let i = 0; i < 30 * SECONDS && n <= MAX_INSTANCES; i++) {
    const sk = me.skill;
    if (sk && !sk.active && sk.spCost > 0) sk.sp = sk.spCost;
    h.step();
  }
  const deep = b.errors.filter((e) => /hook nesting/.test(`${e.message ?? ''}${e.label ?? ''}`)).length;
  return { setup: true, deep, n, tags };
}

for (const season of Object.keys(RIDERS)) {
  test(`${season}: no operator's own-output rider and a bond's / item's 附加伤害 rider re-trigger each other`, () => {
    const { raw, data } = seasonData(season);
    const units = unitsOf(raw);
    const bad = [];
    let ran = 0;
    for (const r of RIDERS[season]) {
      const setup = riderSetup(raw, r);
      for (const u of units) {
        const res = run(data, season, u, setup);
        if (!res.setup) continue;
        ran++;
        const key = `${season} ${r.label} ${u.label}`;
        if ((res.deep || res.n > MAX_INSTANCES) && !ALLOWED.has(key)) bad.push(`${key}: ${res.deep} hook-depth error(s), ${res.n} damage instances`);
        // the sweep cannot pass empty: 予愿安洁莉娜 S1 deals her T1 (an 附加伤害) and the rider fires on her attacks
        if (u.label === 'char_1015_aglna2 S1' && r.bond === 'arcaneShip') {
          assert.ok(res.tags.has('aglna2:extra') && res.tags.has('bond:arcane'), `${key}: her T1 and the 奥术 rider both ran (${[...res.tags]})`);
        }
      }
    }
    assert.ok(ran > 100, `${season}: the sweep fielded ${ran} cases`);
    assert.deepEqual(bad, [], 'a rider on her own output answered an 附加伤害 (or dealt its own without the \'addition\' tag) and a bond\'s / item\'s rider answered it back: '
      + 'skip attack type ADDITION (tags \'addition\' / \'item\') and tag the rider\'s own damage \'addition\' — docs/rules/diy.md 「부가 대미지 되먹임」');
  });
}
