// test/render/op-sweep-fx.test.js — every operator × skill on the battle path, for what a test of one operator did not ask
// (Mon3tr, 2026-11-04). Two things went wrong for her and none of her tests could see them:
// - her S3 cast effect never showed: it waits 0.6 s (root FxDelay) and her swing, timed from the wrong mode's clip, lasted 0.51 s.
//   A cast effect that ends with the swing has to start before the swing ends (docs/rules/fx.md 「Mon3tr·벨로네 S3 공격 타이밍」).
// - her 重构体 flashed white ten times a second: an HP loss every 0.1 s sent a 'dmg' event, and each one draws the white glow and
//   sparks of 真实 damage on the view. A periodic HP loss with no effect of its own is `silent` (Battle.loseHp).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { seasonPickList } from '../helpers/seasonPicks.js';
import { skillModeIndex, SKILL_SUB_MODES } from '../../shared/skill-modes.js';
import { attackTiming } from '../../server/sim/ai.js';
import { startLead, playSpeed } from '../../public/js/render/fx/face.js';
import { CAST_EVENT } from '../../public/js/render/fxmap.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FX = path.join(ROOT, 'public/assets/local/fx');
const NO_FX = !existsSync(path.join(FX, 'modes.json')) && 'needs the extracted effects';
const SECS = 14;
/** Battle speed: the official battle always runs at Time.timeScale 2, so a cast effect plays at most at 2 ÷ 2 (face.js playSpeed). */
const TIME_SCALE = 2;
/** More HP-loss 'dmg' events than this on one unit within a second is a tick drawing a hit (the 重构体's was 10). */
const LOSS_PER_S_MAX = 3;
const ASSETS = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
/**
 * How long the view's cast lasts (fxgame.js castSpan): its own clip stretched so that the clip's hit falls on the sim's strike.
 * A sim timed from another clip than the view's shows here: Mon3tr S3's strike of 0.23 s on her 1.5 s clip with its hit at 0.667.
 */
function castLen(c, skillOn, t) {
  const sp = ASSETS.chars?.[c.charId]?.spine?.front;
  const clip = skillOn ? sp?.anims?.skills?.[String(c.skill)]?.loop : sp?.anims?.attack?.loop;
  const dur = sp?.animations?.[clip], hit = sp?.hits?.[clip]?.[0];
  return dur > 0 && hit > 0 && t.strike > 0 ? t.strike * dur / hit : t.action;
}
const dummy = (key) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, def: 0, res: 0 });
/** Summons a skill needs on the field to be cast at all (Mon3tr S3 lands on hers: beside the enemies, or she has nothing to strike). */
const NEEDS = Object.freeze({ char_4179_monstr: { kind: 'token', tokenId: 'token_10050_monstr_prosts', ownerUid: 1, row: 9, col: 5 } });

function cases() {
  const out = [];
  // every season's picks, each on its season's data (a 规程-only pick is one of 盟约's chess, with no 自选 form there)
  for (const { charId: c, season } of seasonPickList()) for (const skill of [0, 1, 2]) {
    out.push({ label: `${c} S${skill + 1}`, charId: c, season, skill, extra: NEEDS[c] ? [{ uid: 2, ...NEEDS[c] }] : [], unit: { uid: 1, diy: { slot: 'chess_char_5_diy1_a', charId: c, skillIndex: skill, uniEquipId: null }, row: 10, col: 5 } });
  }
  return out;
}

/** The battle's casts by attack mode (their shortest length) and its HP-loss ticks: `modes` the operator's modes.json entry (null: no extract). */
function watch(c, modes) {
  const h = makeBattle({ season: c.season, defs: { enemies: { e_d: dummy('e_d') } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true, units: [c.unit, ...c.extra] });
  h.step();
  const u = h.unit(1);
  for (const pos of [[10, 6], [10, 7], [9, 6]]) h.spawn('e_d', { pos });
  const swings = new Map();
  const loss = new Map();
  let moved = false, lossMax = 0;
  for (let i = 0, n = Math.round(SECS / h.b.dt); i < n; i++) {
    if (u.skill && !u.skill.activations && !u.skill.active && u.alive) { u.skill.gainSp?.(999); try { u.skill.activate?.('test'); } catch { /* refused */ } }
    h.step();
    const ev = h.events.splice(0);
    if (!u.skill?.active) moved = false;
    for (const e of ev) {
      if (e[0] === 'fx' && e[1] === 'teleport') moved = true;
      if (e[0] === 'dmg' && e[6] === 3) {
        const list = loss.get(e[1]) ?? [];
        list.push(h.b.time);
        while (list[0] < h.b.time - 1) list.shift();
        loss.set(e[1], list);
        lossMax = Math.max(lossMax, list.length);
      }
      if (e[0] !== 'swing' || e[1] !== u.id || !modes) continue;
      const t = attackTiming(u);
      if (!(t.action > 0)) continue;
      let m = u.skill?.active ? skillModeIndex(modes.modes, c.skill, modes.skillMode) : 0;
      const sub = SKILL_SUB_MODES[c.charId]?.teleport;
      if (u.skill?.active && moved && sub && modes.modes.includes(sub)) m = modes.modes.indexOf(sub);
      if (m >= 0) swings.set(m, Math.min(swings.get(m) ?? Infinity, castLen(c, !!u.skill?.active, t)));
    }
  }
  return { swings, lossMax, fielded: u?.def?.charId ?? null };
}

const modesJson = NO_FX ? null : JSON.parse(readFileSync(path.join(FX, 'modes.json'), 'utf8'));
const bundles = NO_FX ? {} : JSON.parse(readFileSync(path.join(FX, 'index.json'), 'utf8')).bundles;
const bundleOf = new Map();
for (const [b, list] of Object.entries(bundles)) for (const n of list) if (!bundleOf.has(n)) bundleOf.set(n, b);
function faceOf(name) {
  const f = path.join(FX, bundleOf.get(name) ?? '-', `${name}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).face ?? null : null;
}

/** A cast effect that ends with the swing, its FxDelay, the swing it has: what cannot show is returned. */
function hidden(c, modes, swings) {
  const out = [];
  for (const [m, action] of swings) {
    for (const n of modes.cast?.[m] ?? []) {
      const opt = modes.castOpt?.[m]?.[n];
      if (opt?.o !== 0 || opt.e === CAST_EVENT.SPELL_ON || opt.e === CAST_EVENT.SPELL_END) continue;   // not cut by the swing's end
      const f = faceOf(n);
      const lead = startLead(f, playSpeed(f, 1, TIME_SCALE));
      if (lead >= action) out.push(`${c.label} ${modes.modes[m]} ${n}: starts ${lead} s in, the swing lasts ${action.toFixed(3)} s`);
    }
  }
  return out;
}

describe('every 自选 operator × skill', () => {
  const all = cases().map((c) => ({ c, ...watch(c, modesJson?.[c.charId] ?? null) }));

  test('the sweep fields every season\'s picks, a 规程-only one on 规程\'s data', () => {
    assert.deepEqual(all.filter((r) => r.fielded !== r.c.charId).map((r) => r.c.label), [], 'a pick the sweep did not field');
    const act3 = all.filter((r) => r.c.season === 'act3autochess').map((r) => r.c.charId);
    for (const id of ['char_1020_reed2', 'char_1041_angel2', 'char_4056_titi']) assert.equal(act3.filter((x) => x === id).length, 3, `${id}: three skills on 规程's data (test/helpers/seasonPicks.js seasonPickList)`);
  });

  test('no HP loss draws a hit: a tick of 流失 is silent', () => {
    const bad = all.filter((r) => r.lossMax > LOSS_PER_S_MAX).map((r) => `${r.c.label}: ${r.lossMax} a second`);
    assert.deepEqual(bad, [], 'a periodic HP loss with no effect of its own sends \'dmg\' each tick, which the view draws as a hit of 真实 damage: pass `silent` to Battle.loseHp (docs/rules/fx.md 「효과 없는 주기적 유실」)');
  });

  test('every cast effect that ends with the swing starts before it ends, at battle speed', { skip: NO_FX }, () => {
    assert.deepEqual(all.flatMap((r) => hidden(r.c, modesJson[r.c.charId] ?? {}, r.swings)), []);
  });

  test('the sweep reaches Mon3tr S3 in the mode she lands in, with the effect that once could not show', { skip: NO_FX }, () => {
    const r = all.find((x) => x.c.label === 'char_4179_monstr S3');
    const m = modesJson.char_4179_monstr;
    const reborn = m.modes.indexOf('S3_Reborn');
    assert.ok(r.swings.has(reborn), `her swings ran in ${[...r.swings.keys()].map((k) => m.modes[k])}`);
    assert.ok(m.cast[reborn].includes('monstr_skill_03_start_01'));
    assert.equal(faceOf('monstr_skill_03_start_01').fxDelay, 0.6);
    // the check itself: her old swing of 0.51 s reads as hidden
    assert.equal(hidden(r.c, m, new Map([[reborn, 0.51]])).length, 1);
  });
});
