// Skill and talent projectile sounds (docs/rules/audio.md 「스킬·재능 투사체 소리」, 2026-10-29): the banks of skill / talent
// projectiles and drones the sim has a moment for — 寒芒克洛丝 S2's four shots (S2_Sub), 至简 S2's second shot, 耶拉 S2's released
// drone, a 驭械术师's unreleased drone (the 'dmg' 7th field 2), 荒芜拉普兰德 S3's wolves, 引星棘刺 S3's throw, 维什戴尔 S3's mark,
// 溯光星源 S3's links, 新约能天使's 火力电台 bombing, 克莱门莎's carriage, vortex, shells and T1 roll. The manifest under test is the committed one.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager, kitHitKey, signalAttackKey, strikeImpactKey, funnelHitKey, haloLinkCount } from '../public/js/audio.js';
import { KIT_HIT_BANKS } from '../tools/assets/kit-sfx.mjs';
import { indexAudio } from '../tools/assets/audio.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const skip = existsSync(OFFICIAL) ? false : 'no official audio table (.cache/gamedata, tools/build-data.mjs)';
const file = (u) => String(u).split('/').pop();
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));

const NEW_KEYS = {
  'kjera:funnel': 'p_imp_funnel_d.mp3', 'whitw2:funnel': 'p_imp_whtolfdrkslfnl_n.mp3', 'rockr:funnelN': 'p_atk_elecwandfunnel_n.mp3',
  'kjera:s2': 'p_imp_funnel_h.mp3', 'kjera:s2end': 'p_imp_funnel_end_h.mp3', 'malist:s2': 'p_imp_staffcannon_h.mp3',
  'whitw2:s3born': 'p_atk_whtolfdrksltr_s.mp3', 'whitw2:mark': 'p_imp_whtolfdrkslfnlmrk.mp3', 'whitw2:s3lock': 'p_imp_whtolfdrkslfnl_s.mp3',
  'thorn2:s3': 'p_atk_trshldacyd_h.mp3', 'wisdel:s3mark': 'p_atk_dkmrcaygnam.mp3', 'halo2:s3link': 'p_imp_strbsvrmk_s.mp3',
  'angel2:t1': 'p_imp_tlsrhgns_n.mp3',
  'clemnt:s2cab': 'p_atk_wtfyswrsp.mp3', 'clemnt:s2tide': 'p_imp_wtfyswrsp.mp3', 'clemnt:s3reach': 'p_atk_wtrbmcn.mp3',
  'clemnt:s3fall': 'p_atk_wtrbmsl.mp3', 'clemnt:s3hit': 'p_imp_wtrbmsl.mp3', 'clemnt:t1': 'p_imp_wtsdrvrtl.mp3',
};

function manager() {
  const a = new AudioManager({ win: null, getManifest: () => manifest, random: () => 0 });
  a.ctx = { currentTime: 0 };
  a.played = [];
  a._play = (url, o) => { a.played.push({ f: file(url), bank: o.bank, delay: o.delay ?? null }); };
  a.voice = () => false;
  return a;
}
const field = (a, op, skillIndex) => a.setFieldUnits([
  { id: 1, kind: 'op', side: 'ally', spine: op, defId: 'chess_x', skillIndex },
  { id: 2, kind: 'enemy', side: 'enemy', spine: 'enemy_1006_shield' },
  { id: 3, kind: 'enemy', side: 'enemy', spine: 'enemy_1006_shield' },
]);
const files = (a) => a.played.map((p) => p.f);

describe('skill and talent projectile sounds wired 2026-10-29', () => {
  test('each new kit key sounds its official bank', { skip }, () => {
    const audio = indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8')));
    for (const [k, f] of Object.entries(NEW_KEYS)) {
      assert.equal(file(audio.bank(KIT_HIT_BANKS[k])?.[0]), f, k);
      assert.equal(file(manifest.audio.sfx.kit[k]), f, `manifest ${k}`);
    }
  });

  test('寒芒克洛丝 S2: after the four-shot switch its attacks sound S2_Sub (projectile_chr_kroos2_s2_2)', () => {
    const sub = manifest.audio.sfx.units.char_1021_kroos2.modes[1].sub?.quadShot;
    assert.ok(sub, 'sub mode quadShot');
    assert.deepEqual(sub.cues.filter((c) => c.at === 'd').map((c) => file(c.u)), ['p_imp_krossbow_s.mp3']);
    const a = manager();
    field(a, 'char_1021_kroos2', 1);
    a.handleBattleEvents([['skill', 1, 1], ['fx', 'quadShot', 0, 0, { id: 1, form: 'quad' }], ['atk', 1, 2, 'arrow'], ['dmg', 2, 10, 'phys', 0, 1, 0, 0]]);
    assert.ok(files(a).includes('p_imp_krossbow_s.mp3'), files(a).join());
  });

  test('the keys of the kits\' moments', () => {
    const units = new Map([[1, { def: 'char_4013_kjera', skillIndex: 1 }], [2, { def: 'char_1038_whitw2', skillIndex: 2 }],
      [3, { def: 'char_1039_thorn2', skillIndex: 2 }], [4, { def: 'char_1041_angel2', skillIndex: 2 }]]);
    const of = (id) => units.get(id);
    assert.equal(kitHitKey('drone', { id: 1, i: 0 }, of), 'kjera:s2');
    assert.equal(kitHitKey('drone', { id: 1, i: 1 }, of), null, 'Funnel_1 has no bank');
    assert.equal(kitHitKey('drone', { id: 2, lock: 1 }, of), 'whitw2:s3lock');
    assert.equal(kitHitKey('drone', { id: 2 }, of), 'whitw2:s3', 'a roaming wolf: its cruise projectile');
    assert.equal(kitHitKey('droneLock', { id: 9, src: 2 }, of), 'whitw2:mark');
    assert.equal(kitHitKey('zone', { id: 3, thrown: 1 }, of), 'thorn2:s3');
    assert.equal(kitHitKey('zone', { id: 3, key: 'k' }, of), null, 'a drifting unit re-sent');
    assert.equal(kitHitKey('airstrike', { id: 4, tgt: 9 }, of), 'angel2:t1');
    assert.equal(kitHitKey('airstrike', { id: 4, signal: 'fireToToken' }, of), null, 'S3');
    assert.equal(signalAttackKey({ def: 'char_1035_wisdel', skillOn: true, skillIndex: 2 }, 's', false), 'wisdel:s3mark');
    assert.equal(signalAttackKey({ def: 'char_1035_wisdel', skillOn: true, skillIndex: 1 }, 's', false), null);
    assert.equal(strikeImpactKey({ def: 'char_4054_malist', skillOn: true, skillIndex: 1 }, 1), 'malist:s2');
    assert.equal(strikeImpactKey({ def: 'char_4054_malist', skillOn: true, skillIndex: 1 }, 0), null);
    assert.equal(funnelHitKey({ def: 'char_4013_kjera', skillOn: false }), 'kjera:funnel');
    assert.equal(funnelHitKey({ def: 'char_4054_malist', skillOn: false }), null, '至简\'s drone has no bank');
    const halo = { def: 'char_1047_halo2', skillIndex: 2, skillOn: true };
    assert.equal(haloLinkCount(halo, [5, 6]), 2);
    assert.equal(haloLinkCount(halo, [5, 6, 7]), 1, 'only the newly linked');
  });

  test('AudioManager: 耶拉 S2 drone hit + its trigger 0.6 s later; an unreleased drone sounds its own projectile', () => {
    const a = manager();
    field(a, 'char_4013_kjera', 1);
    a.handleBattleEvents([['skill', 1, 1]]);
    a.played.length = 0;
    a.handleBattleEvents([['fx', 'drone', 0, 0, { id: 1, i: 0 }], ['fx', 'drone', 0, 0, { id: 1, i: 1 }]]);
    assert.deepEqual(a.played.map((p) => [p.f, p.delay]), [['p_imp_funnel_h.mp3', null], ['p_imp_funnel_end_h.mp3', 0.6]]);
    const b = manager();
    field(b, 'char_4013_kjera', 1);
    b.handleBattleEvents([['skill', 1, 1], ['skill', 1, 0], ['swing', 1, 2, 'arrow', 0.2], ['atk', 1, 2, 'arrow']]);
    b.played.length = 0;
    b.handleBattleEvents([['dmg', 2, 10, 'arts', 0, 1, 0, 0], ['dmg', 2, 4, 'arts', 0, 1, 2, 0]]);
    assert.deepEqual(files(b), ['p_imp_funnel_n.mp3', 'p_imp_funnel_d.mp3'], 'the attack\'s impact, then the drone\'s — not a second impact');
  });

  test('AudioManager: 至简 S2 — the second shot sounds, the first is silent, the drones too', () => {
    const a = manager();
    field(a, 'char_4054_malist', 1);
    a.handleBattleEvents([['skill', 1, 1], ['swing', 1, 2, 'arrow', 0.2], ['atk', 1, 2, 'arrow']]);
    a.played.length = 0;
    a.handleBattleEvents([['dmg', 2, 10, 'arts', 0, 1, 0, 0], ['dmg', 2, 10, 'arts', 0, 1, 0, 1], ['dmg', 2, 3, 'arts', 0, 1, 2, 0]]);
    assert.deepEqual(files(a), ['p_imp_staffcannon_h.mp3']);
  });

  test('AudioManager: 荒芜拉普兰德 S3 wolves released, 溯光星源 S3 links, 维什戴尔 S3 mark at the swing', () => {
    const a = manager();
    field(a, 'char_1038_whitw2', 2);
    a.handleBattleEvents([['skill', 1, 1], ['fx', 'drones', 0, 0, { id: 1, n: 3 }]]);
    assert.deepEqual(files(a).filter((f) => f === 'p_atk_whtolfdrksltr_s.mp3').length, 3);
    const h = manager();
    field(h, 'char_1047_halo2', 2);
    h.handleBattleEvents([['skill', 1, 1], ['fx', 'link', 0, 0, { id: 1, ids: [2, 3] }], ['fx', 'link', 0, 0, { id: 1, ids: [2, 3] }]]);
    assert.equal(files(h).filter((f) => f === 'p_imp_strbsvrmk_s.mp3').length, 2, 'once per newly linked enemy');
    const w = manager();
    field(w, 'char_1035_wisdel', 2);
    w.handleBattleEvents([['skill', 1, 1], ['swing', 1, 2, 'arrow', 0.3]]);
    assert.ok(files(w).includes('p_atk_dkmrcaygnam.mp3'), files(w).join());
  });

  test('AudioManager: 克莱门莎 S2 carriage / vortex, S3 shells (fall 0.5 s before each impact, buff damage silent), T1 roll', () => {
    const a = manager();
    field(a, 'char_4231_clemnt', 1);
    a.handleBattleEvents([['skill', 1, 1]]);
    a.played.length = 0;
    a.handleBattleEvents([['fx', 'anchor', 3, 0, { id: 1, fromX: 0, fromY: 0, dur: 1.5 }], ['fx', 'tide', 3, 0, { id: 1, r: 1.5, dur: 5 }]]);
    assert.deepEqual(files(a), ['p_atk_wtfyswrsp.mp3', 'p_imp_wtfyswrsp.mp3']);
    const b = manager();
    field(b, 'char_4231_clemnt', 2);
    b.handleBattleEvents([['skill', 1, 1]]);
    b.played.length = 0;
    b.handleBattleEvents([['fx', 'lock', 3, 0, { id: 2, src: 1, dur: 0.5 }]]);
    assert.deepEqual(b.played.map((p) => [p.f, p.delay]), [['p_atk_wtrbmcn.mp3', null], ['p_atk_wtrbmsl.mp3', 0], ['p_atk_wtrbmsl.mp3', 1], ['p_atk_wtrbmsl.mp3', 2]]);
    b.played.length = 0;
    b.handleBattleEvents([['fx', 'blast', 3, 0, { id: 1, r: 1.5 }], ['dmg', 2, 50, 'phys', 0, 1, 0, null]]);
    assert.deepEqual(files(b), ['p_imp_wtrbmsl.mp3'], 'the shell\'s damage itself is buff damage: no impact sound');
    const t = manager();
    field(t, 'char_4231_clemnt', 0);
    t.handleBattleEvents([['dmg', 2, 50, 'phys', 0, 1, 0, 0, [['clemnt_t1[dice_damage]', 1]]]]);
    assert.ok(files(t).includes('p_imp_wtsdrvrtl.mp3'), files(t).join());
  });

  test('real match path: 耶拉\'s drone damage is flagged 2, her S2 drones carry their index', async () => {
    const { makeMatch, give, legalTileFor } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    h.toPrep(4);
    const m = h.m, ps = h.ps('p_0');
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    give(m, ps, 'chess_char_3_20_a', 'board', legalTileFor(m, ps, 'chess_char_3_20_a'));
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    const u = b.allyUnits.find((x) => x.kind === 'op');
    m.dispose?.();
    assert.equal(u.def.charId, 'char_4013_kjera');
    const ev = [];
    while (b.time < 40 && !ev.some((e) => e[0] === 'dmg' && e[5] === u.id && e[6] === 2)) { b.step(); ev.push(...b.drainEvents()); }
    assert.ok(ev.some((e) => e[0] === 'dmg' && e[5] === u.id && e[6] === 2), 'a drone\'s additional damage');
    u.skill.activate('manual', { free: true });
    while (b.time < 60 && !ev.some((e) => e[0] === 'fx' && e[1] === 'drone' && e[4]?.id === u.id)) { b.step(); ev.push(...b.drainEvents()); }
    const d = ev.filter((e) => e[0] === 'fx' && e[1] === 'drone' && e[4]?.id === u.id);
    assert.ok(d.length && d.every((e) => Number.isInteger(e[4].i)), 'released drones carry `i`');
  });
});
