// test/sim/mount-points.test.js — where an operator's shot leaves its model and where a shot at an operator ends
// (docs/rules/sim.md 「투사체의 출발·도착 점」): data/ `shot.*.from` (tools/assets/mount-poses.mjs → op-mount-poses.json →
// tools/build-data.mjs opMounts) and `hitAt` (tools/assets/local-char-points.json → opHitAt), read by the sim's data;
// the enemies' and summons' `hitAt` (local-enemy-bindings.json → enemyHitAt, local-char-points.json → summonRecord).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

import * as simdata from '../../server/sim/simdata.js';
import { shotClipAt, mountKey, fliesFromPoint, shotPoses, enemyHitClips } from '../../tools/assets/mount-poses.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = (rel) => JSON.parse(readFileSync(new URL(rel, ROOT), 'utf8'));
const RULE = 'docs/rules/sim.md 「투사체의 출발·도착 점」';

/** Every operator record of data/ (each season's chess.json and backups.json units) as [file, id, record]. */
function operatorRecords() {
  const files = ['data/chess.json', 'data/backups.json'];
  const seasons = new URL('data/seasons/', ROOT);
  if (existsSync(seasons)) for (const d of readdirSync(seasons).sort()) files.push(`data/seasons/${d}/chess.json`, `data/seasons/${d}/backups.json`);
  const out = [];
  for (const f of files) {
    if (!existsSync(new URL(f, ROOT))) continue;
    const d = read(f);
    for (const [id, u] of Object.entries(f.endsWith('backups.json') ? d.units || {} : d)) if (u?.assets?.spine) out.push([f, id, u]);
  }
  return out;
}

const pair = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

/** The data files of every season: [dir] ('data', 'data/seasons/<id>'). */
function dataDirs() {
  const out = ['data'];
  const seasons = new URL('data/seasons/', ROOT);
  if (existsSync(seasons)) for (const d of readdirSync(seasons).sort()) out.push(`data/seasons/${d}`);
  return out;
}

describe('shot mount points in data/', () => {
  test('every flying shot of every operator says where it leaves the model; every operator has its hit point', () => {
    let shots = 0, units = 0;
    const bad = [];
    for (const [f, id, u] of operatorRecords()) {
      units++;
      if (!pair(u.hitAt?.F)) bad.push(`${f} ${id}: no hitAt`);
      const s = u.shot;
      for (const [i, r] of [s?.base, ...(s?.skills || [])].entries()) {
        if (!r || typeof r.key !== 'string' || !(r.speed > 0)) continue;
        shots++;
        if (!pair(r.from?.F) || (r.from.B && !pair(r.from.B))) bad.push(`${f} ${id} shot ${i}: no from`);
      }
    }
    assert.ok(shots > 500 && units > 400, `swept ${shots} flying shots of ${units} operators`);
    assert.deepEqual(bad, [], `data/ built without the mount tables (${RULE}): run node tools/assets/mount-poses.mjs, then tools/build-data.mjs for every season`);
  });

  test('the strike pose, not the saved spot: 号角 fires from her ranged clip, 能天使 from in front of her', () => {
    const chess = read('data/chess.json');
    const byBody = (cid) => Object.values(chess).find((c) => c.assets?.spine === cid);
    const horn = byBody('char_4039_horn');
    // 号角's 要塞 Default mode: the projectile leaves in Attack_B (RangedAttack) at its OnAttack frame 0.3 s
    assert.deepEqual(horn.shot.base.from.F, [0.6, 0.625]);
    assert.equal(horn.attackAnim.skills[1].ranged.clip, 'Skill_2_B_Loop', 'the ranged clip is kept even when it times as the melee one');
    // 能天使: F_Muzzle is (−144, 76) in the prefab (her Idle), (118, 163) at her attack's OnAttack frame
    const angel = byBody('char_103_angel');
    assert.ok(angel.shot.skills[0].from.F[0] > 0.3, `能天使 S1 leaves ${angel.shot.skills[0].from.F} (${RULE})`);
    assert.deepEqual(horn.hitAt, { F: [0, 0.486] });
  });

  test('the sim reads them: normalizeChess carries `from` and `hitAt`, B falling back to F', () => {
    const chess = read('data/chess.json');
    const rec = Object.values(chess).find((c) => c.assets?.spine === 'char_4039_horn');
    const op = simdata.normalizeChess(rec);
    assert.deepEqual(op.shot.base.from, { F: [0.6, 0.625], B: rec.shot.base.from.B });
    assert.deepEqual(op.hitAt, { F: [0, 0.486], B: [0, 0.486] });
    assert.equal(simdata.normalizeChess({ ...rec, hitAt: undefined }).hitAt, null);
  });
});

describe('enemy and summon hit points in data/', () => {
  test('every enemy and every summon of every season says where the shots at it end', () => {
    let enemies = 0, tokens = 0;
    const bad = [];
    for (const d of dataDirs()) {
      for (const [k, e] of Object.entries(read(`${d}/enemies.json`))) {
        enemies++;
        if (!pair(e.hitAt?.F) || (e.hitAt.B && !pair(e.hitAt.B))) bad.push(`${d} enemy ${k}: no hitAt`);
        for (const [m, v] of Object.entries(e.hitAt?.modes || {})) if (!pair(v?.F)) bad.push(`${d} enemy ${k} mode ${m}: no hitAt`);
      }
      const recs = [...Object.entries(read(`${d}/tokens.json`))];
      if (existsSync(new URL(`${d}/backups.json`, ROOT))) recs.push(...Object.entries(read(`${d}/backups.json`).tokens || {}));
      for (const [k, t] of recs) {
        tokens++;
        if (!pair(t.hitAt?.F)) bad.push(`${d} token ${k}: no hitAt`);
      }
    }
    assert.ok(enemies > 500 && tokens > 50, `swept ${enemies} enemies and ${tokens} summons`);
    assert.deepEqual(bad, [], `data/ built without the point tables (${RULE}): tools/local-extract/enemy_bindings.py / char_points.py, `
      + 'node tools/assets/mount-poses.mjs, then tools/build-data.mjs for every season');
  });

  test('the frame scale and the bone: 守墓石像 by its mode, 刺胄之弹 without a face switcher, a summon on a larger frame', () => {
    const enemies = read('data/enemies.json');
    // 守墓石像's `hitpoint` bone (Graphic 0.28): (0, 164) in its Walk clips, (−30, 355) in the Fly mode's `_2` clips
    assert.deepEqual(enemies.enemy_1172_dugago.hitAt, { F: [0, 0.459], modes: { Fly: { F: [-0.084, 0.994] } } });
    // 刺胄之弹's EmptyAnimator HitPoint (0, 1.8) on its 0.27 frame
    assert.deepEqual(enemies.enemy_9016_acstmr.hitAt, { F: [0, 0.486] });
    // “斩胄之剑”: R_Arm_Main2 in the first frame of its Attack clip — where the prefab saved it (its idle)
    assert.deepEqual(enemies.enemy_9014_acstma.hitAt, { F: [-0.016, 1.294] });
    // a summon on a 0.4 frame (token_10000_silent_healrb)
    assert.deepEqual(read('data/tokens.json').token_10000_silent_healrb.hitAt, { F: [0, 0.72] });
  });

  test('the sim reads them: normalizeEnemy keeps the modes, normalizeToken the point', () => {
    const enemies = read('data/enemies.json');
    const e = simdata.normalizeEnemy('enemy_1172_dugago', enemies.enemy_1172_dugago);
    assert.deepEqual(e.hitAt, { F: [0, 0.459], B: [0, 0.459], modes: { Fly: { F: [-0.084, 0.994], B: [-0.084, 0.994] } } });
    assert.equal(simdata.normalizeEnemy('x', { ...enemies.enemy_1172_dugago, hitAt: undefined }).hitAt, null);
    const t = read('data/tokens.json').token_10000_silent_healrb;
    assert.deepEqual(simdata.normalizeToken('token_10000_silent_healrb', t).hitAt, { F: [0, 0.72], B: [0, 0.72] });
  });
});

describe('tools/assets/mount-poses.mjs', () => {
  test('an enemy hit point that follows a bone is posed in each attack clip', () => {
    assert.deepEqual(enemyHitClips({ clip: 'Attack', modes: { Fly: { clip: 'Attack_2' }, NoReborn: null, Stone: { clip: 'Attack' } } }), ['Attack', 'Attack_2']);
    assert.deepEqual(enemyHitClips(null), []);
  });

  test('the clip time a shot leaves at: the ranged swing, the OnAttack frame, the clip end, or _preDelay', () => {
    assert.deepEqual(shotClipAt({ clip: 'Attack_A', dur: 1.067, hit: 0.3, ranged: { clip: 'Attack_B', dur: 1.2, hit: 0.25 } }), { clip: 'Attack_B', t: 0.25 });
    assert.deepEqual(shotClipAt({ clip: 'Attack', dur: 1 }), { clip: 'Attack', t: 1 });
    assert.deepEqual(shotClipAt({ clip: 'Attack', dur: 1, hit: 0.5, wait: 0, pre: 0.2 }), { clip: 'Attack', t: 0.2 });
    assert.deepEqual(shotClipAt({ clip: 'Attack', dur: 1, hit: 0.5, wait: 0 }), { clip: 'Attack', t: 0 });
    assert.equal(shotClipAt(null), null);
  });

  test('mount names and what flies from a model point', () => {
    assert.equal(mountKey('MUZZLE'), 'muzzle');
    assert.equal(mountKey('SPECIAL_4'), 'sp4');
    assert.equal(mountKey('GROUND'), null);
    assert.equal(fliesFromPoint({ key: 'p', speed: 5, mount: 'MUZZLE' }), true);
    assert.equal(fliesFromPoint({ key: 'p', speed: 5, mount: 'GROUND' }), false);
    assert.equal(fliesFromPoint({ key: 'p', speed: 0, mount: 'MUZZLE' }), false);
    assert.equal(fliesFromPoint({ move: 'NONE', speed: 0 }), false);
  });

  test('a skill without its own clip poses the Default one; one without a shot is skipped', () => {
    const shot = { base: { key: 'a', speed: 5, mount: 'MUZZLE' }, skills: [{ key: 'b', speed: 5, mount: 'SPECIAL_0' }, null] };
    const anim = { base: { clip: 'Attack', dur: 1, hit: 0.3 }, skills: [null, { clip: 'Skill_2', dur: 1, hit: 0.4 }] };
    assert.deepEqual(shotPoses('char_x', shot, anim).map((p) => [p.key, p.point]), [['Attack@0.3', 'muzzle'], ['Attack@0.3', 'sp0']]);
  });
});
