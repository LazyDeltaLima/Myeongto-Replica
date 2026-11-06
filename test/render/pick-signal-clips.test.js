// test/render/pick-signal-clips.test.js — the clips of five 自选 kits that only a client key names and no role reached
// (docs/rules/render.md 「Spine 클립 커버리지」 「선발 클립 판정」): 棘刺's Attack / Combat pair, 艾丽妮 S3's opening strike, 黑键's
// stores, 黍 S3's heal with no enemy and 涤火杰西卡 S3's shell. Real sim events, replayed in their order into a SpineActor on the
// headless fake PIXI, as render/app.js and units.js hand them out.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi } from './fakepixi.js';
import { enemyRec, makeBattle } from '../helpers/battleHarness.js';
import { TICK } from '../../server/sim/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const chars = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8')).chars;
const SLOT = 'chess_char_5_diy1_a';
const ENEMIES = { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e9, speed: 0, mass: 0 }) };

let fake, SpineActor;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
});
after(() => fake.restore());

function actorOf(charId, skillIndex, side = 'front') {
  const e = chars[charId].spine[side];
  const a = new SpineActor({ animations: Object.keys(e.animations).map((name) => ({ name })) }, e);
  a.setSkillIndex(skillIndex);
  a.setBase('idle');
  return a;
}

function field(charId, skillIndex, enemyAt = null) {
  const h = makeBattle({ defs: { enemies: ENEMIES }, seed: 5, timeLimit: 900, autoFinish: false, captureNoisy: true,
    flags: { dpInit: 99, dpPerSec: 0, dpMax: 999 },
    units: [{ uid: 1, diy: { slot: SLOT, charId, skillIndex, uniEquipId: null }, row: 10, col: 4 }] });
  h.step();
  if (enemyAt) h.spawn('enemy_dummy', { pos: enemyAt });
  return { h, u: h.unit(1) };
}

/** Run `seconds` of the battle into actor `a`; the clips it shows, and what each of its signals and swings played. */
function replay(h, u, a, seconds, seen = h.events.length) {
  const clips = new Set(), signals = [];
  for (let i = 0; i < seconds / TICK; i++) {
    h.step();
    for (const e of h.events.slice(seen)) {
      if (e[0] === 'swing' && e[1] === u.id) {
        a.combatHit = e[6] === 1;
        a.swing(Number(e[2]), null, e[7] === 1);
      } else if (e[0] === 'atk' && e[1] === u.id) a.attack(u.s.interval, false, typeof e[4] === 'string' ? e[4] : null);
      else if (e[0] === 'skill' && e[1] === u.id) a.setSkill(!!e[2]);
      else if (e[0] === 'fx' && e[4]?.id === u.id && typeof e[4].signal === 'string') {
        // render/app.js → UnitView.onSignal
        const t = !e[4].attackTurn && Number(e[4].t) > 0 ? Number(e[4].t) : null;
        a.signalSwing(e[4].signal, t > 0 ? t : u.s.interval);
        signals.push({ signal: e[4].signal, clip: a.current, n: e[4].n, ts: a.spine?.state?.tracks?.[0]?.timeScale ?? null, t });
      }
    }
    seen = h.events.length;
    a.update(TICK);
    clips.add(a.current);
  }
  return { clips, signals };
}

test('棘刺: key Attack → Attack_2 on a target at range, the mode\'s Combat → Attack_1 on the enemy he blocks', () => {
  for (const side of ['front', 'back']) {
    const r = chars.char_293_thorns.spine[side].anims;
    assert.equal(r.attack.loop, 'Attack_2', side);
    assert.equal(r.attack.combat?.loop, 'Attack_1', side);
    assert.equal(r.skills[0].via, 'attack', `${side}: S1 keeps his attacks`);
  }
  const a = actorOf('char_293_thorns', 0);
  a.combatHit = false;
  assert.equal(a._loopOf(a._attackClip()), 'Attack_2');
  a.combatHit = true;
  assert.equal(a._loopOf(a._attackClip()), 'Attack_1');
});

test('棘刺 in battle: a blocked enemy gets Attack_1, one at range Attack_2', () => {
  const near = field('char_293_thorns', 0, [10, 4]);
  const n = replay(near.h, near.u, actorOf('char_293_thorns', 0), 6);
  // (he blocks it from its first tick on his tile: the swing already started before that keeps its Attack_2)
  assert.ok(n.clips.has('Attack_1'), [...n.clips].join());
  const far = field('char_293_thorns', 0, [10, 6]);
  const f = replay(far.h, far.u, actorOf('char_293_thorns', 0), 6);
  assert.ok(f.clips.has('Attack_2') && !f.clips.has('Attack_1'), [...f.clips].join());
});

test('艾丽妮 S3: the cast opens on Skill_3_Start, then the bombardments\' Skill_3_Attack', () => {
  const { h, u } = field('char_4009_irene', 2, [10, 5]);
  const a = actorOf('char_4009_irene', 2);
  u.skill.gainSp(999);
  const seen = h.events.length;
  u.skill.activate('test');
  const { clips } = replay(h, u, a, 0.1, seen);
  assert.deepEqual([...clips], ['Skill_3_Start']);
  // (the next clip is queued on the track: the fake skeleton does not reach it)
  assert.equal(a._afterBegin(a.roles.skill), 'Skill_3_Attack');
  assert.ok(h.runUntil(() => h.events.slice(seen).some((e) => e[0] === 'castHit'), 0.5), 'the kit strikes on Skill_3_Start\'s OnAttack');
});

test('黑键: an energy stored plays the clip of the running mode, over his attack time', () => {
  for (const [skill, want] of [[1, 'Attack_Charge'], [0, 'Skill_1_Charge'], [2, 'Skill_3_Charge']]) {
    const { h, u } = field('char_4046_ebnhlz', skill);
    if (skill !== 1) { u.skill.gainSp(999); u.skill.activate('test'); }
    const a = actorOf('char_4046_ebnhlz', skill);
    if (skill !== 1) a.setSkill(true);
    const { signals } = replay(h, u, a, 12, 0);
    assert.ok(signals.length > 0, `S${skill + 1}: stores`);
    // (S1's opening clip plays out first: its store waits, as 维伊's)
    assert.ok(signals.some((s) => s.signal === 'store' && s.clip === want), `S${skill + 1}: ${JSON.stringify(signals)}`);
  }
});

test('黍 S3: with no enemy her attack is the Heal child, Skill_3_Attack_2, wind-up included; on an enemy Skill_3_Attack_1', () => {
  const calm = field('char_2025_shu', 2);
  calm.u.skill.gainSp(999);
  calm.u.skill.activate('test');
  calm.u.hp = 1;
  const a = actorOf('char_2025_shu', 2);
  a.setSkill(true);
  const seen = calm.h.events.length;
  const c = replay(calm.h, calm.u, a, 6, seen);
  const atks = calm.h.events.slice(seen).filter((e) => e[0] === 'atk' && e[1] === calm.u.id);
  assert.ok(atks.length > 0 && atks.every((e) => e[4] === 'Heal'), JSON.stringify(atks));
  assert.ok(c.clips.has('Skill_3_Attack_2') && !c.clips.has('Skill_3_Attack_1'), [...c.clips].join());

  const w = actorOf('char_2025_shu', 2);
  w.setSkill(true);
  w.update(5);
  assert.ok(w.windUp(1.2, 0.3, false, 'Heal'));
  assert.equal(w.current, 'Skill_3_Attack_2', 'the look-ahead winds up the same clip');

  const fight = field('char_2025_shu', 2, [10, 5]);
  fight.u.skill.gainSp(999);
  fight.u.skill.activate('test');
  const b = actorOf('char_2025_shu', 2);
  b.setSkill(true);
  const f = replay(fight.h, fight.u, b, 6, fight.h.events.length);
  assert.ok(f.clips.has('Skill_3_Attack_1') && !f.clips.has('Skill_3_Attack_2'), [...f.clips].join());
});

test('涤火杰西卡 S3: the shell plays Skill_3_Skill over her attack time, not over its flight; facing down, Skill_Down_3_Skill', () => {
  const e = chars.char_1034_jesca2.spine.front;
  const a = actorOf('char_1034_jesca2', 2);
  a.setSkill(true);
  a.update(3);
  assert.equal(a.signalSwing('extraBomb', 1.8), true);
  assert.equal(a.current, 'Skill_3_Skill');
  assert.ok(Math.abs(a.attackUntil - a.clock - e.animations.Skill_3_Skill) < 0.5, 'its whole clip over 1.8 s');

  const down = actorOf('char_1034_jesca2', 2);
  down.downs = () => ({ deploy: true, face: true });
  down.setSkill(true);
  down.update(3);
  assert.equal(down.signalSwing('extraBomb', 1.8), true);
  assert.equal(down.current, 'Skill_Down_3_Skill');

  const app = readFileSync(path.join(ROOT, 'public/js/render/app.js'), 'utf8');
  assert.ok(app.includes('!e[4].attackTurn && Number(e[4].t) > 0'), 'render/app.js keeps a fx\'s `t` apart from the signal\'s time');
  const kit = readFileSync(path.join(ROOT, 'server/sim/content/kits/ops/op-jesca2.js'), 'utf8');
  assert.ok(/'bombardShell'.*signal: 'extraBomb', attackTurn: 1/.test(kit), 'the kit\'s shell fx signals the clip');
});
