// test/render/clip-coverage.test.js — every Spine clip of every operator model (data/assets.json chars, Front and Back) is
// either reached by the renderer or listed with its status in clip-coverage-list.js. The renderer plays a model's roles
// (anims: idle, deploy, die, attack, move, stun, run, skill / skills[i] begin · loop · end · idle · alts · combat, equip) plus the clips
// render/units.js names per Spine id (FORMS, FORTRESS_CLIPS); a clip outside them never plays unless code names it. User
// report 2026-10-12: 予愿安洁莉娜 S2's Skill_2_Takeoff_* had never played (docs/rules/diy.md 「S2 활공 모션」) — a
// new model, a new kit or a manifest rebuild that leaves a clip unplayed now fails here until someone says why.
// Rules and how to settle an entry: docs/rules/render.md 「Spine 클립 커버리지」.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi } from './fakepixi.js';
import { UNPLAYED } from './clip-coverage-list.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));

/** The facing-down variants (Attack_Down, Skill_Down_2_Loop, Skill_1_Loop_Down …): the renderer draws none of them —
 *  one gap for every model, tracked as a whole (docs/rules/render.md 「Spine 클립 커버리지」), not clip by clip. */
const DOWN_FAMILY = /down/i;
/** Spine's setup pose, never played as a clip. */
const SETUP = 'Default';
const STATUS = /^(render|none|todo): \S/;

let fake, FORMS, FORTRESS_CLIPS;
before(async () => {
  fake = installFakePixi();
  ({ FORMS, FORTRESS_CLIPS } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

function strings(o, out = new Set()) {
  if (typeof o === 'string') out.add(o);
  else if (o && typeof o === 'object') for (const v of Object.values(o)) strings(v, out);
  return out;
}

/** The clips render/spine.js can play from a model's roles (the fallbacks 'Idle' / 'Die' and the `alts` included). */
function rolePlayed(anims) {
  const out = new Set(['Idle', 'Die']);
  if (!anims) return out;
  const equip = Object.values(anims.equip || {});   // an equipped skill's default mode (spine.js setSkillIndex)
  for (const r of [anims, ...equip]) for (const k of ['idle', 'deploy', 'die']) if (typeof r[k] === 'string') out.add(r[k]);
  const clips = [anims.attack, anims.move, anims.stun, anims.run, anims.skill, ...Object.values(anims.skills || {}),
    ...equip.map((r) => r.attack)];
  for (const c of clips) {
    if (!c || typeof c !== 'object') continue;
    for (const k of ['begin', 'loop', 'end', 'idle']) if (typeof c[k] === 'string') out.add(c[k]);
    if (Array.isArray(c.alts)) for (const a of c.alts) out.add(a);   // clips taking turns (spine.js _nextAlt)
    if (c.combat) for (const a of [c.combat.loop, ...(c.combat.alts || [])]) out.add(a);   // on a blocked enemy (_swingClip)
  }
  return out;
}

/** charId → Map(clip → sides 'F' / 'B') of the clips no role, form or fortress pair reaches. */
function unplayed() {
  const res = new Map();
  for (const [charId, rec] of Object.entries(assets.chars)) {
    const named = new Set([...strings(FORMS[charId]), ...strings(FORTRESS_CLIPS[charId])]);
    for (const [side, tag] of [['front', 'F'], ['back', 'B']]) {
      const entry = rec.spine?.[side];
      if (!entry) continue;
      const played = rolePlayed(entry.anims);
      for (const clip of Object.keys(entry.animations || {})) {
        if (clip === SETUP || DOWN_FAMILY.test(clip) || played.has(clip) || named.has(clip)) continue;
        if (!res.has(charId)) res.set(charId, new Map());
        const m = res.get(charId);
        m.set(clip, (m.get(clip) || '') + tag);
      }
    }
  }
  return res;
}

test('every clip of an operator model is played by the renderer or listed with its status', () => {
  const missing = [];
  for (const [charId, clips] of unplayed()) {
    for (const [clip, sides] of clips) if (!UNPLAYED[charId]?.[clip]) missing.push(`${charId} ${clip} (${sides})`);
  }
  assert.deepEqual(missing, [], 'unplayed clips: wire each one where the client plays it, or add it to ' +
    'test/render/clip-coverage-list.js with its status (docs/rules/render.md 「Spine 클립 커버리지」)');
});

test('every listed clip still exists, is still unplayed and has a well-formed status', () => {
  const now = unplayed();
  const stale = [];
  for (const [charId, clips] of Object.entries(UNPLAYED)) {
    for (const [clip, status] of Object.entries(clips)) {
      if (!STATUS.test(status)) stale.push(`${charId} ${clip}: bad status ${JSON.stringify(status)}`);
      else if (!now.get(charId)?.has(clip)) stale.push(`${charId} ${clip}: played or gone — drop the entry`);
    }
  }
  assert.deepEqual(stale, []);
});

test("a 'render:' entry names a file under public/js/ that names the clip", () => {
  const bad = [];
  for (const [charId, clips] of Object.entries(UNPLAYED)) {
    for (const [clip, status] of Object.entries(clips)) {
      const m = /^render: (\S+)/.exec(status);
      if (!m) continue;
      let src = '';
      try { src = readFileSync(path.join(ROOT, 'public/js', m[1]), 'utf8'); } catch { /* reported below */ }
      if (!src.includes(`'${clip}'`)) bad.push(`${charId} ${clip}: ${m[1]} does not name '${clip}'`);
    }
  }
  assert.deepEqual(bad, []);
});

test('the open entries, for the record', (t) => {
  let todo = 0, down = 0;
  for (const clips of Object.values(UNPLAYED)) for (const s of Object.values(clips)) if (s.startsWith('todo:')) todo++;
  for (const rec of Object.values(assets.chars)) {
    for (const side of ['front', 'back']) for (const clip of Object.keys(rec.spine?.[side]?.animations || {})) if (DOWN_FAMILY.test(clip)) down++;
  }
  t.diagnostic(`clip coverage: ${todo} listed clips still 'todo', ${down} facing-down clips not drawn (DOWN_FAMILY)`);
  assert.ok(todo >= 0 && down >= 0);
});
