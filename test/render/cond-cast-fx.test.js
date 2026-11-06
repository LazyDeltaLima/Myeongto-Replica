// test/render/cond-cast-fx.test.js — a cast effect the client binds only to a child ability that fires on a condition must not play
// with every attack. modes.json `cast` lists a mode's prefabs together; 涤火杰西卡 S3's ExtraBomb start played on each shot until
// 2026-11-04 (maintainer report; render/fxmap.js KIT_CAST). The groups come from the sound side's reading of the same client
// data (test/audio-cond-group-list.js): `plain` is what an attack is, every other child needs a condition.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COND_GROUPS } from '../audio-cond-group-list.js';
import { KIT_CAST, KIT_HIT } from '../../public/js/render/fxmap.js';
import { kitOfficialPlan } from '../../public/js/render/fx/kitofficial.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL = path.join(ROOT, 'public/assets/local/fx');
const NO_DATA = !existsSync(path.join(LOCAL, 'bindings.json')) && 'no extracted effects';

/**
 * Cast effects of a conditional child that fxmap.js KIT_CAST does not take off the attacks: 'ok: …' why that is right, or
 * 'todo: …' (STRONGHOLD-side open list). A new operator's entry settles it: KIT_CAST plus a kit moment, or the reason.
 */
const COND_CASTS = Object.freeze({});

test('a cast effect bound only to a conditional child of an attack group is the kit\'s or is listed', { skip: NO_DATA }, () => {
  const rows = JSON.parse(readFileSync(path.join(LOCAL, 'bindings.json'), 'utf8')).rows;
  const modes = JSON.parse(readFileSync(path.join(LOCAL, 'modes.json'), 'utf8'));
  const found = new Set();
  for (const [key, group] of Object.entries(COND_GROUPS)) {
    const charId = key.split('|')[0];
    const others = Object.keys(group.others);
    const m = modes[charId];
    if (!m || !others.length) continue;
    (m.cast || []).forEach((list, i) => {
      if (m.fortress?.[i]) return;   // the attack's kind picks the list (fxmap.js fortressEffects; 号角 S2's test below)
      for (const n of list) {
        const kids = rows.filter((r) => r.char === charId && r.fx === n && String(r.moment).startsWith('_castEffects') && r.key.includes(`/Modes/${m.modes[i]}/`))
          .map((r) => r.key.split('/').pop());
        if (kids.length && kids.every((k) => others.includes(k)) && !KIT_CAST.has(n)) found.add(`${charId}|${m.modes[i]}|${n}`);
      }
    });
  }
  assert.deepEqual([...found].filter((k) => !COND_CASTS[k]), [], 'put it in fxmap.js KIT_CAST with a kit moment, or list it with the reason');
  assert.deepEqual(Object.keys(COND_CASTS).filter((k) => !found.has(k)), [], 'no stale entry');
  for (const [k, v] of Object.entries(COND_CASTS)) assert.match(v, /^(ok|todo): /, k);
});

test('KIT_CAST names prefabs a kit plan plays', () => {
  const src = readFileSync(path.join(ROOT, 'public/js/render/fx/kitofficial.js'), 'utf8');
  // by name, or by the client key whose plays hold it (`tpl`)
  const keys = existsSync(path.join(LOCAL, 'plays.json')) ? JSON.parse(readFileSync(path.join(LOCAL, 'plays.json'), 'utf8')).keys : null;
  const byKey = (n) => Object.entries(keys || {}).some(([k, v]) => v.held?.includes(n) && src.includes(`tpl: '${k}'`));
  for (const n of KIT_CAST) assert.ok(src.includes(`'${n}'`) || !keys || byKey(n), `${n}: no plan plays it, so it would never show`);
});

test('号角 S2: a blocked shot casts its own effects, an unblocked one its own, and the hand-closed Full Burst\'s never', { skip: NO_DATA }, () => {
  const m = JSON.parse(readFileSync(path.join(LOCAL, 'modes.json'), 'utf8')).char_4039_horn;
  const f = m.fortress[m.modes.indexOf('S2')];
  assert.deepEqual(f.melee.cast, ['horn_skill_02_start', 'horn_skill_02_start_01']);
  assert.deepEqual(f.ranged.cast, ['horn_skill_02_start_02']);
  assert.ok(!m.cast.flat().includes('horn_skill_02_start_03'), 'Full Burst fires only as the skill is closed by hand');
});

test('焰尾: the attack after a dodge is its own child, with the plain attack\'s effects kept apart', { skip: NO_DATA }, () => {
  const m = JSON.parse(readFileSync(path.join(LOCAL, 'modes.json'), 'utf8')).char_420_flamtl;
  assert.deepEqual([m.cast[0], m.hit[0]], [['flamtl_attack_01_start_01'], ['flamtl_attack_01_hit_01']]);
  assert.deepEqual([m.cast[1], m.hit[1]], [['flamtl_skill_03_attack_start_01'], ['flamtl_skill_03_attack_01_hit_01']]);
  assert.deepEqual(m.talentAtk[0].Attack_T1.hit, ['flamtl_attack_01_hit_02_1', 'flamtl_attack_01_hit_02_2']);
  assert.deepEqual(m.talentAtk[1].Attack_T1.cast, ['flamtl_skill_03_attack_start_01_2', 'flamtl_skill_03_attack_start_02']);
  const s = readFileSync(path.join(ROOT, 'server/sim/content/kits/ops/chess_char_4_19-flamtl.js'), 'utf8');
  assert.match(s, /c\.signal = 'Attack_T1'/, 'the swing names the child the table holds');
});

test('琳琅诗怀雅 S1: HealAlly\'s hit plays on the ally it heals, not on the enemies she attacks', () => {
  assert.ok(KIT_HIT.has('swire2_skill_01_hit'));
  const plan = kitOfficialPlan('coin', { skill: 'swire2_1', heal: 7 }, 'swire2');
  assert.deepEqual(plan.play, [{ n: 'swire2_skill_01_hit', on: 'heal', life: 'once' }]);
  assert.equal(kitOfficialPlan('coin', { skill: 'swire2_1', n: 1 }, 'swire2'), null, 'a coin gained is no heal');
});
