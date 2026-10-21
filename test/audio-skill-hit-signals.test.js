// test/audio-skill-hit-signals.test.js — skill hit sounds the client plays outside the attack banks (2026-10-22,
// docs/rules/audio.md 「버프·커스텀 트리거 소리」 / 「공격 소리 신호」): 佩佩 S3's pepe_s_3_fx PlayAudio pepe_s3_hit_01–03 by her
// stacks (the kit's 'stacks' fx → signalFxKey → sfx.kit), and the Spine OnPlayAudio events, whose sound is the event's
// string value (마운틴 S2 / S3 punches, 필라에, 파투스, the enemies' — render/spine.js onEvent → audio.spineEvent).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager, signalFxKey } from '../public/js/audio.js';
import { KIT_HIT_BANKS, kitHitSfx } from '../tools/assets/kit-sfx.mjs';
import { indexAudio } from '../tools/assets/audio.mjs';
import { skelParserAvailable } from '../tools/assets/skel.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const NO_DATA = !existsSync(OFFICIAL) && 'no .cache/gamedata';
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));
const file = (u) => String(u).split('/').pop();
const PEPE = 'char_4058_pepe';

function manager() {
  const a = new AudioManager({ win: null, getManifest: () => manifest, random: () => 0 });
  a.ctx = { currentTime: 0 };
  a.played = [];
  a._play = (url, o) => { a.played.push({ f: file(url), bank: o.bank }); };
  a.voice = () => false;
  return a;
}

describe('佩佩 S3: pepe_s_3_fx plays pepe_s3_hit_0N on each attack\'s main target', () => {
  test('the banks and the manifest keys', { skip: NO_DATA }, () => {
    const out = kitHitSfx(indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8'))), (p) => p);
    for (const n of [1, 2, 3]) {
      assert.equal(KIT_HIT_BANKS[`pepe:s3:${n}`], `battle.ON_CUSTOM_TRIGGER.pepe_s3_hit_0${n}`);
      assert.equal(file(out[`pepe:s3:${n}`][0]), `p_imp_ctmnyhmr_s${n}.mp3`);
      assert.equal(file(manifest.audio.sfx.kit[`pepe:s3:${n}`]), `p_imp_ctmnyhmr_s${n}.mp3`);
    }
  });

  test('the level by her stacks before the attack: ≥ max _03, ≥ 2 _02, else _01 (as the range effect)', () => {
    const unitOf = () => ({ def: PEPE });
    const key = (n) => signalFxKey('stacks', { id: 1, tgt: 2, buff: 'pepe:tremor', n, max: 5 }, unitOf);
    assert.deepEqual([0, 1, 2, 4, 5].map(key), ['pepe:s3:1', 'pepe:s3:1', 'pepe:s3:2', 'pepe:s3:2', 'pepe:s3:3']);
    assert.equal(signalFxKey('stacks', { id: 1, buff: 'mudrok', n: 3 }, unitOf), null, 'another kit\'s stacks');
  });

  test('real match path (Match → buildBattleSpec → createBattleFromSpec): each S3 attack sounds its level', async () => {
    const { makeMatch, give, legalTileFor } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    h.toPrep(4);
    const m = h.m, ps = h.ps('p_0');
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    give(m, ps, 'chess_char_6_06_a', 'board', legalTileFor(m, ps, 'chess_char_6_06_a'));
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    m.dispose?.();
    const ev = [];
    const stacks = () => ev.filter((x) => x[0] === 'fx' && x[1] === 'stacks' && x[4]?.buff === 'pepe:tremor');
    while (!b.finished && b.time < 150) { b.step(); ev.push(...b.drainEvents()); }
    const s = stacks();
    assert.ok(s.length, 'her S3 attacked');
    const pepe = b.allyUnits.find((u) => u.def?.charId === PEPE);
    assert.ok(s.every((x) => x[4].id === pepe.id && x[4].tgt != null));
    const a = manager();
    a.setFieldUnits([{ id: pepe.id, kind: 'op', side: 'ally', spine: PEPE, defId: 'chess_char_6_06_a', skillIndex: 2 }]);
    const hits = [];
    for (const x of s) {
      a.played.length = 0;
      a.handleBattleEvents([x]);
      hits.push(a.played.map((p) => p.f));
    }
    const level = (o) => (o.n >= o.max ? 3 : o.n >= 2 ? 2 : 1);
    assert.deepEqual(hits, s.map((x) => [`p_imp_ctmnyhmr_s${level(x[4])}.mp3`]), 'one sound per attack, by its stacks');
  });
});

describe('Spine audio events: the sound is the event\'s string value', () => {
  const SPINE_DIR = path.join(ROOT, 'public', 'assets', 'spine');
  test('every sfx.units[*].spine key is an OnPlayAudio string of that unit\'s model', { skip: (!existsSync(SPINE_DIR) || !skelParserAvailable()) && 'no models / Spine parser' }, () => {
    const r = createRequire(import.meta.url)('@pixi-spine/runtime-3.8');
    const loader = {
      newRegionAttachment: (s, n) => new r.RegionAttachment(n), newMeshAttachment: (s, n) => new r.MeshAttachment(n),
      newBoundingBoxAttachment: (s, n) => new r.BoundingBoxAttachment(n), newPathAttachment: (s, n) => new r.PathAttachment(n),
      newPointAttachment: (s, n) => new r.PointAttachment(n), newClippingAttachment: (s, n) => new r.ClippingAttachment(n),
    };
    const skels = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? skels(path.join(dir, e.name)) : e.name.endsWith('.skel') ? [path.join(dir, e.name)] : []));
    let checked = 0;
    for (const [id, u] of Object.entries(manifest.audio.sfx.units)) {
      if (!u.spine) continue;
      const dir = path.join(SPINE_DIR, id.startsWith('enemy_') ? 'enemy' : 'op', id);
      if (!existsSync(dir)) continue;
      const audioValues = new Set();
      for (const f of skels(dir)) {
        const d = new r.SkeletonBinary(loader).readSkeletonData(new Uint8Array(readFileSync(f)));
        for (const an of d.animations) for (const t of an.timelines) for (const e of t?.events ?? []) if (/^OnPlayAudio(_[1-3])?$/.test(e.data.name) && e.stringValue) audioValues.add(e.stringValue);
      }
      for (const k of Object.keys(u.spine)) assert.ok(audioValues.has(k), `${id}: ${k} is no OnPlayAudio string`);
      checked++;
    }
    assert.ok(checked >= 10, `units checked: ${checked}`);
  });

  test('마운틴 S3: OnPlayAudio "Skill_3_1" sounds p_imp_tigerpunch_d_1; the event name alone sounds nothing', () => {
    const a = manager();
    a.setFieldUnits([{ id: 1, kind: 'op', side: 'ally', spine: 'char_264_f12yin', defId: 'chess_x', skillIndex: 2 }]);
    a.handleBattleEvents([['skill', 1, 1]]);
    a.spineEvent(1, null);
    a.played.length = 0;
    assert.equal(a.spineEvent(1, 'OnPlayAudio'), false);
    assert.equal(a.spineEvent(1, 'OnPlayAudio', 'Skill_3_1'), true);
    assert.deepEqual(a.played.map((p) => p.f), ['p_imp_tigerpunch_d_1.mp3']);
  });
});
