// test/render/swire2-signal-clips.test.js — 琳琅诗怀雅's S1 heal and S2 champagne throw play their client clips (docs/rules/render.md
// 「스킬 중 공격 클립」): the modes' Body/Trigger groups pick HealAlly `_animKey "Skill_1"` / SpawnToken `_animKey "Skill_2"`
// over Attack; both skills are passive, so the render never turns the skill on and her attacks keep the attack role. The kit
// signals each behaviour (fx 'swire2Heal' { signal: 'healAlly', t } — the heal is the whole attack turn —, 'swire2Throw'
// { signal: 'spawnToken' }) and the
// manifest's attack role names the clips (tools/assets/anim-overrides.mjs SIGNAL_CLIPS). Real sim events, replayed in their
// order into a SpineActor on the headless fake PIXI (test/render/fakepixi.js), as render/app.js hands them out.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi } from './fakepixi.js';
import { makeBattle } from '../helpers/battleHarness.js';
import { TICK } from '../../server/sim/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const entry = assets.chars.char_1033_swire2.spine.front;

let fake, SpineActor;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
});
after(() => fake.restore());

/** S{sk + 1} beside a wounded ally for `seconds`: each signal with the clip the actor shows right after it, and the clips seen. */
function play(sk, { enemies = true, seconds = 30 } = {}) {
  const h = makeBattle({ seed: 5, timeLimit: seconds + 5, autoFinish: false, flags: { dpPerSec: 0 },
    units: [{ chessId: 'chess_char_3_04_b', row: 9, col: 6, uid: 1, skillIndex: sk }, { chessId: 'chess_char_1_01_b', row: 9, col: 5, uid: 2 }],
    enemies: enemies ? [{ key: 'enemy_1007_slime', time: 0, route: 0, count: 30, interval: 1, pos: null }] : [] });
  h.step();
  const op = h.unit(1);
  const a = new SpineActor({ animations: Object.keys(entry.animations).map((name) => ({ name })) }, entry);
  a.setBase('idle');
  const signals = [], clips = new Set();
  let seen = h.events.length;
  for (let i = 0; i < seconds / TICK; i++) {
    h.step();
    if (i % 45 === 0) for (const u of h.b.allyUnits) if (u.alive && u.s) u.hp = Math.max(1, Math.min(u.hp, u.s.maxHp * 0.4));
    for (const e of h.events.slice(seen)) {
      if (e[0] === 'swing' && e[1] === op.id) a.swing(Number(e[2]), null, e[7] === 1);
      else if (e[0] === 'atk' && e[1] === op.id) a.attack(op.s.interval, false, typeof e[4] === 'string' ? e[4] : null);
      else if (e[0] === 'fx' && e[4]?.id === op.id && typeof e[4].signal === 'string') {
        // UnitView.onSignal
        if (e[4].strike) a.attack(op.s.interval, false, e[4].signal);
        else a.signalSwing(e[4].signal, Number(e[4].t) > 0 ? Number(e[4].t) : op.s.interval);
        signals.push([e[4].signal, !!e[4].strike, a.current]);
      }
    }
    seen = h.events.length;
    a.update(TICK);
    clips.add(a.current);
  }
  return { signals, clips };
}

test('the manifest: her attack role names Skill_1 for the heal and Skill_2 for the throw', () => {
  assert.deepEqual(entry.anims.attack.signals, { healAlly: 'Skill_1', spawnToken: 'Skill_2' });
});

test('S1: every coin heal turn plays Skill_1 from its start, in a fight and with no enemy', () => {
  const fight = play(0);
  assert.ok(fight.signals.length >= 3, JSON.stringify(fight.signals));
  for (const [sig, strike, clip] of fight.signals) assert.deepEqual([sig, strike, clip], ['healAlly', false, 'Skill_1']);
  assert.ok(fight.clips.has('Attack'), 'her attacks keep Attack');
  const calm = play(0, { enemies: false });
  assert.ok(calm.signals.length >= 3);
  for (const [, strike, clip] of calm.signals) assert.deepEqual([strike, clip], [false, 'Skill_1']);
});

test('S2: every champagne throw plays Skill_2, a throw right after an attack included (it cuts the Attack clip\'s tail)', () => {
  const fight = play(1);
  assert.ok(fight.signals.length >= 4, JSON.stringify(fight.signals));
  for (const [sig, strike, clip] of fight.signals) assert.deepEqual([sig, strike, clip], ['spawnToken', false, 'Skill_2']);
  assert.ok(fight.clips.has('Attack'));
});

test('a swing before its strike is left alone by a signal clip', () => {
  const a = new SpineActor({ animations: Object.keys(entry.animations).map((name) => ({ name })) }, entry);
  a.setBase('idle');
  assert.ok(a.swing(0.5));
  a.update(0.1);
  assert.equal(a.signalSwing('spawnToken', 1), false);
  assert.equal(a.current, 'Attack');
});
