// test/audio-cond-group.test.js — the attack groups with a condition per child (AbilitySelectableGroup `_abilityConfigs`,
// official client; docs/rules/audio.md 「공격 소리 신호」): an attack sounds the plain child; a child with a buff or target
// condition sounds only when the sim names it ('swing' 9th field, 'atk' 5th field) or its kit moment comes.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager, billroChargeKey, signalFxKey } from '../public/js/audio.js';
import { pickVariant } from '../public/js/audioOfficial.js';
import { makeBattle, enemyRec } from './helpers/battleHarness.js';
import { KIT_HIT_BANKS } from '../tools/assets/kit-sfx.mjs';
import { COND_GROUPS } from './audio-cond-group-list.js';
import { fxEvent } from './helpers/fxEvent.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'data', 'assets.json');
const NO_DATA = !existsSync(MANIFEST) && 'no data/assets.json';
const file = (u) => String(u).split('/').pop().replace(/\.\w+$/, '');
const KITS = path.join(ROOT, 'server', 'sim', 'content', 'kits', 'ops');
const SLOT5 = 'chess_char_5_diy1_a';
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, def: 0, res: 0, ...o });
const manifest = () => JSON.parse(readFileSync(MANIFEST, 'utf8'));
function manager(m) {
  const a = new AudioManager({ win: null, getManifest: () => m, random: () => 0 });
  a.ctx = { currentTime: 0 };
  a.played = [];
  a._play = (url) => { a.played.push(file(url)); };
  a.voice = () => false;
  return a;
}
const op = (id, spine, skillIndex = null) => ({ id, kind: 'op', side: 'ally', spine, ...(skillIndex != null ? { skillIndex } : null) });
const swing = (id, signal = null) => ['swing', id, 0.3, 'none', null, null, null, null, ...(signal ? [signal] : [])];

describe('attack groups with a condition per child', () => {
  test('every group is read and listed, its plain child is what the manifest plays, its others say how they sound', { skip: NO_DATA }, () => {
    const audio = JSON.parse(readFileSync(path.join(ROOT, 'tools', 'assets', 'local-char-audio.json'), 'utf8'));
    const units = manifest().audio.sfx.units;
    const kitSrc = readdirSync(KITS).map((f) => readFileSync(path.join(KITS, f), 'utf8')).join('\n');
    const audioSrc = readFileSync(path.join(ROOT, 'public', 'js', 'audio.js'), 'utf8');
    const seen = new Set();
    for (const [id, e] of Object.entries(audio)) {
      (e.ab || []).forEach((ab, m) => {
        for (const [kind, g] of Object.entries(ab || {})) {
          if (g?.g !== 'cond') continue;
          const names = g.names || [];
          const key = `${id}|${names.join(',')}`;
          seen.add(key);
          const row = COND_GROUPS[key];
          assert.ok(row, `${key}: a new attack group — read its children's conditions (link_sheet.py 「attack groups」) and list it in test/audio-cond-group-list.js`);
          for (const n of names) {
            if (row.plain.includes(n) || row.melee === n) continue;
            const how = row.others[n];
            assert.match(String(how), /^(signal|key \S+|same|none): ./, `${key}: child ${n} says how it sounds`);
            if (how.startsWith('signal')) assert.ok(kitSrc.includes(`'${n}'`) || audioSrc.includes(`'${n}'`), `${key}: nothing names '${n}'`);
            if (how.startsWith('key ')) assert.ok(KIT_HIT_BANKS[how.split(' ')[1].replace(/:$/, '')], `${key}: ${how}`);
          }
          // what the built manifest picks for this mode's group
          const entry = units[id];
          const sets = !entry ? [] : e.modes?.[m] === 'Default' ? [entry] : Object.values(entry.modes || {}).flatMap((x) => [x, ...Object.values(x?.sub || {})]);
          for (const set of sets) {
            const sel = set?.sel?.[kind];
            if (sel?.how !== 'cond' || sel.n !== names.length) continue;
            if (Number.isInteger(sel.ranged) && row.plain.length && !row.plain.includes(names[sel.ranged - 1]) && !Object.values(COND_GROUPS).some((r, i) => Object.keys(COND_GROUPS)[i].startsWith(`${id}|`) && r.plain.includes(names[sel.ranged - 1]))) {
              assert.fail(`${key}: the manifest's plain child is ${names[sel.ranged - 1]}, not ${row.plain}`);
            }
            if (row.melee && Number.isInteger(sel.melee)) assert.equal(names[sel.melee - 1], row.melee, key);
          }
        }
      });
    }
    assert.deepEqual(Object.keys(COND_GROUPS).filter((k) => !seen.has(k)), [], 'listed groups that are gone');
  });

  test('pickVariant: the child the sim names, else the plain one', () => {
    const sel = { attack: { n: 3, how: 'cond', ranged: 3, sig: { 'Attack_T1+': 1, Attack_T1: 2 } } };
    assert.equal(pickVariant(sel, 'attack', { melee: false, mem: {}, random: () => 0 }), 3);
    assert.equal(pickVariant(sel, 'attack', { melee: false, mem: {}, random: () => 0, signal: 'Attack_T1' }), 2);
    assert.equal(pickVariant(sel, 'attack', { melee: false, mem: {}, random: () => 0, signal: 'unknown' }), 3);
  });

  test('the plain child of each group', { skip: NO_DATA }, () => {
    const u = manifest().audio.sfx.units;
    assert.equal(u.char_1034_jesca2.modes[2].sel.attack.ranged, 2, 'S3Attack, not ExtraBomb');
    assert.equal(u.char_1033_swire2.modes[0].sel.attack.ranged, 2, 'Attack, not HealAlly');
    assert.equal(u.char_420_flamtl.sel.attack.ranged, 3, 'Attack, not Attack_T1+');
    assert.equal(u.char_4247_oxi.sel.attack.ranged, 2, 'Attack, not BuffedAttack');
    assert.equal(u.char_4042_lumen.modes[2].sel.attack.ranged, 2, 'Common, not Special');
    assert.equal(u.char_1052_kalts2.modes[1].sel.attack.ranged, 1, 'AttackEnemy, not HealAlly');
  });

  test('a swing sounds its child; the kit moments sound the others', { skip: NO_DATA }, () => {
    const a = manager(manifest());
    a.setFieldUnits([op(1, 'char_1034_jesca2', 2), op(2, 'char_420_flamtl'), op(3, 'char_4247_oxi'), op(4, 'char_1033_swire2', 0)]);
    const heard = (ev) => { a.played.length = 0; a.handleBattleEvents(ev); return [...a.played]; };
    heard([['skill', 1, 1], ['skill', 4, 1]]);
    assert.deepEqual(heard([swing(1)]), ['p_atk_pistolcarbin_s'], '涤火杰西卡 S3: the plain shot');
    assert.ok(heard([fxEvent('bombardShell', { id: 1, x: 0, y: 0, t: 1 })]).includes('p_atk_navalgun_n'), 'its ExtraBomb child sounds at the shell');
    const u4 = { def: 'char_1033_swire2' };
    assert.equal(signalFxKey('swire2Heal', { id: 4 }, () => u4), 'swire2:heal');
    assert.equal(signalFxKey('coin', { id: 4, heal: 2, skill: 'swire2_1' }, () => u4), 'swire2:healhit');
    assert.equal(signalFxKey('coin', { id: 4 }, () => u4), null, 'a coin without a heal');
    assert.deepEqual(heard([swing(4)]), ['p_atk_richfan_n'], '琳琅诗怀雅 S1: the plain attack');
    assert.deepEqual(heard([['fx', 'swire2Heal', 0, 0, { id: 4 }]]), ['p_atk_richfan_d']);
    assert.deepEqual(heard([['fx', 'coin', 0, 0, { id: 4, heal: 2, skill: 'swire2_1' }]]), ['p_imp_richfan_d']);
  });

  test('the other children\'s kit moments: 琳琅诗怀雅 S2\'s throw, 新约能天使 S3\'s opening strike, 遥\'s ShieldOnly by her mode', { skip: NO_DATA }, () => {
    const a = manager(manifest());
    a.setFieldUnits([op(1, 'char_1033_swire2', 1), op(2, 'char_1041_angel2', 2), op(3, 'char_4202_haruka', 2), op(4, 'char_4202_haruka'), op(5, 'char_4202_haruka', 2)]);
    const heard = (ev) => { a.played.length = 0; a.handleBattleEvents(ev); return [...a.played]; };
    assert.ok(heard([['fx', 'swire2Throw', 0, 0, { id: 1, signal: 'spawnToken' }]]).includes('p_atk_richbttl_h'));
    assert.ok(heard([['fx', 'airstrike', 0, 0, { id: 2, signal: 'fireToToken' }]]).includes('p_atk_tlsrhgns_s'));
    assert.ok(heard([['fx', 'shield', 0, 0, { id: 5, kind: 'bubble', only: 4 }]]).includes('p_atk_idgfshblh'), 'Default mode');
    heard([['skill', 3, 1]]);
    assert.ok(heard([['fx', 'shield', 0, 0, { id: 5, kind: 'bubble', only: 3 }]]).includes('p_atk_idgfshbl_s'), 'S3 mode');
    assert.ok(!heard([['fx', 'shield', 0, 0, { id: 5, kind: 'bubble' }]]).some((f) => /^p_atk_idgfshbl/.test(f)), 'a bubble with an attack: that attack\'s sound');
  });

  test('卡涅利安: a charged cast keeps [full], so 2 charges right after it are silent; an uncharged one sounds them', () => {
    const on = (full) => { const u = { skillIndex: 1 }; billroChargeKey(u, -1, full); return billroChargeKey(u, 2); };
    assert.equal(on(true), null);
    assert.equal(on(false), 'billro:s2:full');
  });

  test('a battle: 塔露拉\'s BuffedAttack and 凯尔希·思衡托 S2\'s HealAlly are named', () => {
    const run = (charId, skillIndex, prep, secs = 4) => {
      const h = makeBattle({ defs: { enemies: { e_d: dummy('e_d') } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true,
        units: [{ uid: 1, diy: { slot: SLOT5, charId, skillIndex, uniEquipId: null }, row: 10, col: 5 }, { uid: 2, diy: { slot: SLOT5, charId: 'char_4202_haruka', skillIndex: 0, uniEquipId: null }, row: 9, col: 5 }] });
      h.step();
      prep(h, h.unit(1), h.unit(2));
      h.events.length = 0;
      h.run(secs);
      assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
      return h;
    };
    const oxi = run('char_4247_oxi', 1, (h, u) => { h.spawn('e_d', { pos: [10, 6] }); h.b.addBuff(u, { key: 'oxi_s_2_stack', duration: 30, source: u }); });
    const sw = oxi.eventsOf('swing').filter((e) => e[1] === oxi.unit(1).id);
    assert.ok(sw.length > 0 && sw.every((e) => e[8] === 'BuffedAttack'), `swings ${JSON.stringify(sw.slice(0, 2))}`);
    const k = run('char_1052_kalts2', 1, (h, u, ally) => { ally.hp = 1; u.skill.gainSp(999); u.skill.activate('test'); });
    assert.ok(k.eventsOf('atk').some((e) => e[1] === k.unit(1).id && e[4] === 'HealAlly'), 'the shot at an injured ally with no enemy around');
  });
});
