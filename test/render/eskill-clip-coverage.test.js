// test/render/eskill-clip-coverage.test.js — every enemy skill whose official ability plays a three-part channel
// (ThreePartChannelingAnimation: `skillCast.*.chan` of data/enemies.json and the seasons' enemies.json, read from the
// client prefabs by tools/local-extract/attack_timing.py) is drawn by the view: in render/units.js ESKILL_CLIPS with the
// same clips, or listed with why in test/render/eskill-clip-list.js. 节日爵士乐手's 狂欢式演奏 and 萨卡兹王庭军精锐术师's 死亡之眼
// were channels the view never looped (the model played one clip and stood); a new enemy, season or extract that adds
// a channel fails here until it is wired or listed.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi } from './fakepixi.js';
import { OTHER, TODO } from './eskill-clip-list.js';
import { NOT_CAST } from '../content/enemy-not-cast-list.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

let fake, ESKILL_CLIPS;
before(async () => {
  fake = installFakePixi();
  ({ ESKILL_CLIPS } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

/** The first channel of cast record `c` (itself, else a child of its group), or null. */
const chanOf = (c) => (!c ? null : c.chan || (c.subs || []).map(chanOf).find(Boolean) || null);

/** `<spine id> <skill>` of the channel skills the sim never casts (test/content/enemy-not-cast-list.js, by enemy key). */
const notCast = new Set();

/** `<spine id> <skill>` → its channel, over the current season's enemies and every season's. */
function channels() {
  const files = ['data/enemies.json', ...readdirSync(path.join(ROOT, 'data/seasons')).map((s) => `data/seasons/${s}/enemies.json`)]
    .filter((f) => existsSync(path.join(ROOT, f)));
  const out = new Map();
  for (const f of files) {
    for (const [key, e] of Object.entries(read(f))) {
      for (const [name, c] of Object.entries(e.skillCast || {})) {
        const ch = chanOf(c);
        if (ch) out.set(`${e.spine || key} ${name}`, ch);
        if (ch && NOT_CAST[`${key} ${name}`]) notCast.add(`${e.spine || key} ${name}`);
      }
    }
  }
  return out;
}

/** ESKILL_CLIPS as `<spine id> <ability, lower case>` → its spec. */
function wired() {
  const out = new Map();
  for (const [id, row] of Object.entries(ESKILL_CLIPS)) for (const [ab, spec] of Object.entries(row)) out.set(`${id} ${ab.toLowerCase()}`, spec);
  return out;
}

const LISTED = { ...OTHER, ...TODO };

test('the extract carries the channels (节日爵士乐手 fire, 死亡之眼 LineAttack)', () => {
  const ch = channels();
  assert.ok(ch.size >= 20, `${ch.size} channel skills`);
  assert.deepEqual(ch.get('enemy_10034_cnvsax fire'), { begin: 'Skill_Begin', loop: 'Skill_Loop', end: 'Skill_End' });
  assert.deepEqual(ch.get('enemy_1275_dwlock_2 deatheye'), { begin: 'Skill_Begin', loop: 'Skill_Loop', end: 'Skill_End' });
});

test('every channel skill is in ESKILL_CLIPS or listed with why', () => {
  const w = wired();
  const missing = [...channels().keys()].filter((k) => !w.has(k) && !LISTED[k] && !notCast.has(k));
  assert.deepEqual(missing, [], 'wire them in render/units.js ESKILL_CLIPS (and the sim\'s `dur`), or list them in test/render/eskill-clip-list.js (test/content/enemy-not-cast-list.js when the sim never casts them)');
  assert.ok(notCast.size >= 6, `the not-cast list reaches the channels (${notCast.size})`);
});

test('a wired channel plays the prefab\'s clips (its down / up sets too)', () => {
  const w = wired();
  for (const [k, ch] of channels()) {
    const spec = w.get(k);
    if (!spec || typeof spec === 'string') continue;
    const pick = (s) => (s ? Object.fromEntries(['begin', 'loop', 'end'].filter((x) => s[x]).map((x) => [x, s[x]])) : undefined);
    assert.deepEqual(pick(spec), pick(ch), `${k}: its _default set`);
    for (const way of ['down', 'up']) assert.deepEqual(pick(spec[way]), pick(ch[way]), `${k}: its ${way} set`);
  }
});

test('the list names only channel skills the view does not wire', () => {
  const ch = channels(), w = wired();
  for (const k of Object.keys(LISTED)) {
    assert.ok(ch.has(k), `${k} is no channel skill in the data any more: drop it from the list`);
    assert.ok(!w.has(k), `${k} is wired in ESKILL_CLIPS now: drop it from the list`);
    assert.ok(!notCast.has(k), `${k} is also in test/content/enemy-not-cast-list.js: one place`);
  }
  for (const k of notCast) assert.ok(!w.has(k), `${k} is wired in ESKILL_CLIPS but test/content/enemy-not-cast-list.js says the sim never casts it`);
});
