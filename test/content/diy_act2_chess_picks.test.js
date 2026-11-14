// test/content/diy_act2_chess_picks.test.js — 焰影苇草 (char_1020_reed2), 新约能天使 (char_1041_angel2) and 缇缇 (char_4056_titi):
// 6★ of 盟约's chess that 规程 does not field, 规程 自选 picks since 2026-11-14 (maintainer decision). Their 自选 kits are 盟约's
// chess kits (ops/op-reed2.js, op-angel2.js, op-titi.js through kits/shared/chessPick.js); 盟约 leaves its own chess out of
// its picks. Every form (tier-6 normal; tier-5 and tier-6 elite with each module or none) × every skill through the real
// match path on 规程's data (test/helpers/diyPickMatch.js: 确定自选编队 → the slot bought, placed, BattleSpec → battle).
// Run: node --test test/content/diy_act2_chess_picks.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { chessKitAsPick } from '../../server/sim/content/kits/shared/chessPick.js';
import { diyPool, diyRecord, validateDiyPicks } from '../../shared/diy.js';
import { realPickMatch } from '../helpers/diyPickMatch.js';
import { ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';

const REAL = { skip: !hasGeneratedData() };
const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const BASE = { chess: load('chess'), backups: load('backups') };
const ACT3 = { chess: load('seasons/act3autochess/chess'), backups: load('seasons/act3autochess/backups') };

/** charId → its 盟约 chess (the kit), its chess's default skill, its modules, its 规程 core bond. */
const PICKS = {
  char_1020_reed2: { chess: 'chess_char_6_08_a', def: 'skchr_reed2_3', modules: ['uniequip_002_reed2', 'uniequip_003_reed2'], bond: 'victoriaShip' },
  char_1041_angel2: { chess: 'chess_char_6_13_a', def: 'skchr_angel2_2', modules: ['uniequip_002_angel2'], bond: 'yanShip' },
  char_4056_titi: { chess: 'chess_char_5_02_a', def: 'skchr_titi_3', modules: ['uniequip_002_titi'], bond: 'sargonShip' },
};
const IDS = Object.keys(PICKS);

test('offered in 规程 at tiers 5 and 6 (kitted, legal), not in 盟约 (its own chess); 规程 core bonds', () => {
  for (const id of IDS) {
    assert.ok(KITTED_CHARS.includes(id) && typeof OPERATOR_KITS[id] === 'function' && KITS[id] === OPERATOR_KITS[id], `${id}: kitted`);
    assert.ok(ACT3.backups.diy.ownedPool.includes(id), `${id}: a 规程 pick`);
    assert.ok(!BASE.backups.diy.ownedPool.includes(id) && !BASE.backups.units[id], `${id}: no 盟约 pick (its chess ${PICKS[id].chess})`);
    assert.equal(BASE.chess[PICKS[id].chess].charId, id);
    assert.ok(!Object.values(ACT3.chess).some((c) => c.charId === id), `${id}: no 规程 chess`);
    for (const t of [5, 6]) {
      assert.ok(diyPool(t, { data: ACT3, kitted: KITTED_CHARS }).includes(id), `${id}: 规程 tier ${t}`);
      assert.ok(!diyPool(t, { data: BASE, kitted: KITTED_CHARS }).includes(id), `${id}: not 盟约 tier ${t}`);
    }
    assert.deepEqual(ACT3.backups.diy.operators[id].bonds, [PICKS[id].bond], `${id}: core bond`);
    const pick = { charId: id, skillIndex: 2, uniEquipId: PICKS[id].modules[0] };
    assert.deepEqual(validateDiyPicks({ chess_char_6_diy1_a: pick }, { data: ACT3, kitted: KITTED_CHARS }), { ok: true, picks: { chess_char_6_diy1_a: pick } });
  }
});

test('the kit is the chess kit: every skill under `skills`, the default one being the chess kit\'s `skill`; the record flags the chess default', () => {
  for (const id of IDS) {
    const p = PICKS[id];
    for (const [slot, elite] of [['chess_char_6_diy1_a', false], ['chess_char_6_diy1_a', true], ['chess_char_5_diy1_a', true]]) {
      for (let skillIndex = 0; skillIndex < 3; skillIndex++) {
        const rec = diyRecord(slot, { charId: id, skillIndex, uniEquipId: elite ? p.modules[0] : null }, { elite, data: ACT3 });
        assert.ok(rec, `${id} ${slot}`);
        const kit = OPERATOR_KITS[id](rec.skill.bb, rec, { ...rec, skill: { id: rec.skill.skillId, bb: rec.skill.bb } });
        assert.deepEqual(Object.keys(kit.skills).sort(), rec.skills.map((s) => s.skillId).sort(), `${id} ${slot} S${skillIndex + 1}: every skill`);
        if (rec.skill.skillId === p.def) {
          const chessKit = KITS[p.chess](rec.skill.bb, rec, { ...rec, skill: { id: rec.skill.skillId, bb: rec.skill.bb } });
          assert.ok(kit.skills[p.def] && chessKit.skill, `${id}: the chess kit's own spec of its default ${p.def}`);
        }
      }
    }
  }
  // the wrapper: the builder sees the chess default flagged (a 自选 record flags none), the record's own flag wins
  let seen = null;
  const build = chessKitAsPick((_bb, rec) => { seen = rec; return { skill: { kind: 'x' }, skills: { a: { kind: 'a' } } }; }, 'b');
  const kit = build({}, { skills: [{ skillId: 'a', isDefault: null }, { skillId: 'b', isDefault: null }] }, {});
  assert.deepEqual(seen.skills.map((s) => s.isDefault), [false, true]);
  assert.deepEqual(kit.skills, { a: { kind: 'a' }, b: { kind: 'x' } });
  build({}, { skills: [{ skillId: 'a', isDefault: true }, { skillId: 'b', isDefault: false }] }, {});
  assert.deepEqual(seen.skills.map((s) => s.isDefault), [true, false]);
});

test('every form × skill on the real 规程 match path: the authored spec, the form\'s module, a cast, no handler error', REAL, async () => {
  let runs = 0;
  for (const id of IDS) {
    const p = PICKS[id];
    const forms = [['chess_char_6_diy1_a', null], ...['chess_char_5_diy1_b', 'chess_char_6_diy1_b'].flatMap((s) => [null, ...p.modules].map((m) => [s, m]))];
    for (const [slot, mod] of forms) {
      for (let skillIndex = 0; skillIndex < 3; skillIndex++) {
        const label = `${id} ${slot} ${mod ?? 'none'} S${skillIndex + 1}`;
        const { u, casts } = await realPickMatch(id, skillIndex, { data: ACT3_ON_BASE_FIELD, season: 'act3autochess', band: 'band_amiya', slot, uniEquipId: mod, secs: 120 });
        assert.deepEqual([u.def.charId, u.skill.id, !!u.kit.generic, u.kit.skillSource], [id, ACT3.backups.units[id].forms['2/1/4/0'].skills[skillIndex].skillId, false, 'skills'], label);
        assert.equal(u.def.loadout?.moduleId ?? null, slot.endsWith('_b') ? mod ?? 'none' : null, `${label}: module`);
        // (an AUTO skill of the normal form may not fill within the run; every elite form casts)
        if (slot.endsWith('_b')) assert.ok(casts > 0, `${label}: cast`);
        runs++;
      }
    }
  }
  assert.equal(runs, 3 * IDS.reduce((n, id) => n + 1 + 2 * (1 + PICKS[id].modules.length), 0), 'every form ran');
});

test('缇缇 at the tier-6 elite: 凝固的时光 takes the module\'s stage-3 numbers (31 % / 42 % ATK); stage 1 / none keep 16 % / 32 %', () => {
  const t0 = (slot, mod) => diyRecord(slot, { charId: 'char_4056_titi', skillIndex: 2, uniEquipId: mod }, { elite: true, data: ACT3 }).talents.find((t) => t.index === 0).bb;
  assert.deepEqual([t0('chess_char_6_diy1_a', 'uniequip_002_titi').extra_atk_scale, t0('chess_char_6_diy1_a', 'uniequip_002_titi').damage_atk_scale], [0.31, 0.42]);
  assert.deepEqual([t0('chess_char_5_diy1_a', 'uniequip_002_titi').extra_atk_scale, t0('chess_char_6_diy1_a', null).damage_atk_scale], [0.16, 0.32]);
});
