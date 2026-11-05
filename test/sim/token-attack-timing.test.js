// test/sim/token-attack-timing.test.js — a summon's normal attack is timed by its prefab's attack ability as an operator's is
// (pkgrps/btl_pfb_tokens_*.ab → tools/assets/local-attack-timing.json `tokens` → tools/build-data.mjs tokenAttackAnim →
// data/tokens.json / backups.json `attackAnim`): it used to strike as its swing started, while the view ran its clip fast to fit
// that gap. docs/rules/sim.md 「일반 공격 타이밍」.
// Run: node --test test/sim/token-attack-timing.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { normAttackAnim } from '../../server/sim/simdata.js';
import { attackTiming } from '../../server/sim/ai.js';
import { TICK } from '../../server/sim/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => JSON.parse(readFileSync(path.join(ROOT, f), 'utf8'));
const tokens = read('data/tokens.json');
const picks = read('data/backups.json').tokens;
const all = { ...(tokens.tokens ?? tokens), ...picks };
const timing = read('tools/assets/local-attack-timing.json').tokens;
const assets = read('data/assets.json').tokens;

const timed = (id, interval) => attackTiming({ def: { attackAnim: normAttackAnim(all[id].attackAnim) }, s: { interval } });
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

test('data: a summon with an attack ability in its prefab carries it, the clip by the skeleton it is drawn with', () => {
  let clips = 0, none = 0;
  for (const [id, r] of Object.entries(all)) {
    if (!id.startsWith('token_')) continue;
    const row = timing[id];
    assert.ok(row, `${id}: its prefab was read`);
    const ab = row.attack[row.modes.indexOf('Default')];
    if (!ab) { assert.equal(r.attackAnim, undefined, `${id}: no attack ability, no record`); none++; continue; }
    assert.ok(r.attackAnim, `${id}: its record`);
    const sp = assets[id]?.spine ?? assets[id]?.spineLocal;
    if (sp?.animations?.[ab.anim] > 0) {
      assert.equal(r.attackAnim.clip, ab.anim, `${id}: the ability's clip`);
      assert.equal(r.attackAnim.dur, sp.animations[ab.anim], `${id}: its length`);
      // the view plays the same clip, or the swing, the strike and the cast effects run on different clocks (attack-clip-view.test.js)
      if (sp.anims?.attack?.via !== 'idle') assert.equal(sp.anims?.attack?.loop, ab.anim, `${id}: the clip the view plays`);
      clips++;
    } else assert.equal(r.attackAnim.noClip, 1, `${id}: no such clip on its skeleton`);
    assert.equal(r.attackAnim.max, ab.max, `${id}: _maxAnimScale`);
  }
  assert.ok(clips >= 8 && none >= 8, `${clips} with a clip, ${none} with no attack ability`);
});

test('the swing scales as an operator\'s: no bound (“小自在”), bound 1 (黄金盟誓), a deploy-direction facing (“打字机”)', () => {
  const dusk = timed('token_10015_dusk_drgn', 1.9);
  near(dusk.action, 1.9, '“小自在” _maxAnimScale -1: the 1 s clip stretched to its interval');
  near(dusk.strike, 0.433 * 1.9, '“小自在”: its OnAttack frame, scaled');
  const lion = timed('token_10040_siege2_vlion', 2.5);
  near(lion.action, 1.267, '黄金盟誓 _maxAnimScale 1: the clip at its own speed');
  near(lion.strike, 0.5, '黄金盟誓: its OnAttack frame');
  assert.equal(normAttackAnim(all.token_10026_bgsnow_subbow.attackAnim).face, 2, '“打字机” _faceToDefault');
});

test('an ability that plays no clip waits for a frame that never comes: its strike ends the attack time, or its _preDelay', () => {
  const doll = timed('token_10006_vodfox_doll', 1);
  near(doll.action, 1, '诅咒娃娃: the swing lasts the attack time');
  near(doll.strike, 1, '诅咒娃娃: _waitForAttackEvent runs out');
  const drone = timed('token_10000_silent_healrb', 0.5);
  near(drone.action, 0.5, '医疗探机: the swing lasts the attack time');
  near(drone.strike, 0, '医疗探机: _waitForAttackEvent 0, _preDelay 0');
});

test('a battle: the strike of a summon lands its wind-up after the swing that announced it', () => {
  const owner = { key: 'e', hp: 1e9, speed: 0 };
  const h = makeBattle({
    defs: { enemies: { e: enemyRec(owner) } }, autoFinish: false, timeLimit: 60, recordEvents: true, hooks: ['attack'], captureNoisy: true, flags: { dpPerSec: 0 },
    units: [{ uid: 1, chessId: 'chess_char_2_11_a', row: 10, col: 3 }, { uid: 2, kind: 'token', tokenId: 'token_10022_kazema_shadow', ownerUid: 1, row: 11, col: 3 }],
    enemies: [{ key: 'e', pos: [11, 4] }],
  });
  h.step();
  const t = h.b.allyUnits.find((a) => a.defId === 'token_10022_kazema_shadow');
  assert.ok(t, 'the 纸偶');
  let swingAt = null, windup = null;
  assert.ok(h.runUntil(() => {
    for (const e of h.b.drainEvents()) if (e[0] === 'swing' && e[1] === t.id && swingAt == null) { swingAt = h.b.time; windup = e[2]; }
    return swingAt != null && h.hooksOf('attack').some((c) => c.attacker === t && c.t >= swingAt);
  }, 10), 'it attacks');
  const strike = h.hooksOf('attack').find((c) => c.attacker === t && c.t >= swingAt).t;
  assert.ok(windup > 0.3, `its wind-up ${windup}: the OnAttack frame of a clip scaled to its interval`);
  assert.ok(Math.abs(strike - swingAt - windup) <= 2 * TICK, `strike ${strike - swingAt} s after the swing, wind-up ${windup}`);
  checkInvariants(h.b);
});
