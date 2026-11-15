// test/content/enemy-not-cast.test.js — the enemy skills that test/content/enemy-not-cast-list.js says the sim never
// casts are skills of the data, and their enemy's kit builds no ability of that name (the abilities a kit casts are
// its `mem.ab.list`). The three coverage tests that read the list (channel clips, link lines, projectile waits) take it
// on trust; this is where the claim is checked.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';
import { NOT_CAST } from './enemy-not-cast-list.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILES = ['data/enemies.json', ...readdirSync(path.join(ROOT, 'data/seasons')).map((s) => `data/seasons/${s}/enemies.json`)]
  .filter((f) => existsSync(path.join(ROOT, f)));
/** enemy key → its records, one per data file that has it. */
const RECS = new Map();
for (const f of FILES) for (const [k, r] of Object.entries(JSON.parse(readFileSync(path.join(ROOT, f), 'utf8')))) RECS.set(k, [...(RECS.get(k) || []), r]);

const WALL = chessRec({ id: 'w1', profession: 'TANK', stats: { atk: 0, maxHp: 1e9, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });

/** The lower-case names of the abilities enemy `key` (record `rec`) is built with. */
function abilities(key, rec) {
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    defs: { chess: { w1: WALL }, enemies: { [key]: rec } }, kits: { w1: () => ({ trait: { noAttack: true } }) },
    enemies: [], units: [{ chessId: 'w1', row: 10, col: 6 }],
  });
  h.step();
  const e = h.spawn(key, { pos: [10, 6], routeIndex: 0, mods: { speedMul: 0 } });
  return new Set((e.mem?.ab?.list || []).filter((a) => a && a.name).map((a) => a.name.toLowerCase()));
}

test('every not-cast skill is a skill of the data, and its kit builds no such ability', () => {
  const bad = [];
  for (const [k, why] of Object.entries(NOT_CAST)) {
    assert.ok(typeof why === 'string' && why.length > 8, `${k}: say why`);
    const [key, skill] = k.split(' ');
    const recs = (RECS.get(key) || []).filter((r) => r.skillCast && skill in r.skillCast);
    if (!recs.length) { bad.push(`${k}: no such skill in the data any more`); continue; }
    for (const r of recs) if (abilities(key, r).has(skill)) bad.push(`${k}: its kit builds the ability now — wire it, or say in the list why it never casts`);
  }
  assert.deepEqual(bad, []);
});

test('the check sees a kit\'s abilities (节日爵士乐手 fire, 重弩突袭者 CrossAttack)', () => {
  assert.ok(abilities('enemy_10034_cnvsax', RECS.get('enemy_10034_cnvsax')[0]).has('fire'));
  assert.ok(abilities('enemy_1404_msnip', RECS.get('enemy_1404_msnip')[0]).has('crossattack'));
});
