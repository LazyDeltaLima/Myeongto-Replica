// test/sim/attack-clip-view.test.js — the sim's clock of an attack and the clip the view plays are read from two places: the sim's
// from data/backups.json `attackAnim` (tools/build-data.mjs), the view's from the model's roles (render/spine.js _attackClip).
// Mon3tr S3 had the sim on `Attack` (2.83 s, the `S3` mode by the name rule) under the view's `Skill_3_Loop` (1.5 s, the mode she
// lands in), so her swing and strike ran at half their time in real battles and her cast effect could not show (2026-11-04,
// docs/rules/fx.md 「Mon3tr·벨로네 S3 공격 타이밍」). Nothing reported it, and no golden battle placed her 重构体.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SKILL_SUB_MODES } from '../../shared/skill-modes.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => JSON.parse(readFileSync(path.join(ROOT, f), 'utf8'));
const units = read('data/backups.json').units;
const chars = read('data/assets.json').chars;

/**
 * Skills whose sim clip is not the view's skill role. Not judged yet (they would move battles, or the view picks among variants
 * the role does not name): STRONGHOLD open items. A fixed one leaves the list; a new one is a bug until it is read.
 */
const NOT_THE_ROLE = new Set(['char_2027_wang S2', 'char_4182_oblvns S2', 'char_4098_vvana S1', 'char_416_zumama S3']);

test('a skill\'s attack is timed from the clip the view plays', () => {
  const found = [];
  let n = 0;
  for (const [c, u] of Object.entries(units)) {
    const roles = chars[c]?.spine?.front?.anims?.skills;
    if (!roles) continue;
    (u.attackAnim?.skills ?? []).forEach((a, i) => {
      if (!a) return;
      n++;
      if (roles[String(i)]?.loop !== a.clip) found.push(`${c} S${i + 1}`);
    });
  }
  assert.ok(n > 50, `${n} skills read`);
  assert.deepEqual(found.filter((x) => !NOT_THE_ROLE.has(x)), [], 'the sim\'s clip is not the view\'s (build-data opAttackAnim)');
  assert.deepEqual([...NOT_THE_ROLE].filter((x) => !found.includes(x)), [], 'no longer differs: take it off the list');
});

test('a skill that moves its owner to another mode is timed from that mode', () => {
  assert.ok(Object.values(SKILL_SUB_MODES).some((x) => x.teleport));
  const clip = (c, i) => units[c].attackAnim.skills[i];
  assert.deepEqual([clip('char_4179_monstr', 2).clip, clip('char_4179_monstr', 2).dur, clip('char_4179_monstr', 2).hit], ['Skill_3_Loop', 1.5, 0.667]);
  assert.equal(clip('char_4037_demetr', 2).clip, 'Skill_3_Loop_A');
});

test('Mon3tr S3 on her 重构体: the swing and the strike of her real clip', () => {
  const dummy = enemyRec({ key: 'e_d', hp: 1e9, speed: 0, mass: 0, def: 0, res: 0 });
  const h = makeBattle({ defs: { enemies: { e_d: dummy } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true,
    units: [{ uid: 1, diy: { slot: 'chess_char_5_diy1_a', charId: 'char_4179_monstr', skillIndex: 2, uniEquipId: null }, row: 10, col: 5 },
      { uid: 2, kind: 'token', tokenId: 'token_10050_monstr_prosts', ownerUid: 1, row: 9, col: 5 }] });
  h.step();
  const u = h.unit(1);
  h.spawn('e_d', { pos: [9, 6] });
  u.skill.gainSp(999);
  assert.ok(u.skill.activate('test'));
  const swings = [];
  for (let i = 0; i < Math.round(5 / h.b.dt); i++) {
    h.step();
    for (const e of h.events.splice(0)) if (e[0] === 'swing' && e[1] === u.id) swings.push({ t: h.b.time, strike: e[2] });
  }
  assert.ok(swings.length >= 3, `${swings.length} swings`);
  const gaps = swings.slice(1).map((s, i) => s.t - swings[i].t);
  for (const g of gaps) assert.ok(g > 0.9, `she swings every ${g.toFixed(2)} s`);
  // the strike by her real clip's hit (0.667 of 1.5); `Attack`'s (0.567 of 2.833) lands it at 0.22 s
  for (const x of swings.slice(1)) assert.ok(x.strike > 0.4 && x.strike < 0.6, `strike ${x.strike}`);
});
