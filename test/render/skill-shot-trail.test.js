// test/render/skill-shot-trail.test.js — the trail of an attack in a skill that switches no attack mode (2026-10-16: those
// attacks flew render/fx.js's procedural shot). A skill without duration shoots its skill prefab's projectile
// (char_modes.py `skills[i].shot`, its `_mainEffect`) with the first attack after its start (号角 S1 projectile_chr_horn_s1
// → horn_skill_01_trail_02); every other attack of such a skill keeps the Default mode's trail (fxmap.js modelessTrail,
// fxgame.js skillTrail).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attackMode, modelessTrail } from '../../public/js/render/fxmap.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const MODES = read('tools/assets/local-char-modes.json');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');

/** {skill prefabId: table duration} of data/chess.json and the 自选 picks' forms (char_modes.py skill_durations). */
function durations() {
  const out = {};
  const chess = read('data/chess.json');
  const skills = Object.values(chess.chess || chess).flatMap((c) => c?.skills || []);
  for (const u of Object.values(read('data/backups.json').units || {})) for (const f of Object.values(u?.forms || {})) skills.push(...(f?.skills || []));
  for (const s of skills) if (s && typeof s.duration === 'number') out[s.prefabId || s.skillId] ??= s.duration;
  return out;
}
/** {charId: [skill prefabId…]} as char_modes.py orders `skills` (data/chess.json, then the 自选 picks). */
function prefabs() {
  const out = {};
  const chess = read('data/chess.json');
  for (const c of Object.values(chess.chess || chess)) if (c?.charId && !out[c.charId] && c.skills?.length) out[c.charId] = c.skills.map((s) => s.prefabId || s.skillId);
  const b = read('data/backups.json');
  for (const id of Object.keys(b.diy?.operators || {})) {
    const f = Object.values(b.units?.[id]?.forms || {}).find((x) => x?.skills?.length);
    if (f && !out[id]) out[id] = f.skills.map((s) => s.prefabId || s.skillId);
  }
  return out;
}

test('char_modes.py: a skill\'s shot is its projectile\'s trail, the flying one first', () => {
  assert.deepEqual(MODES.char_4039_horn.skills[0].shot, ['horn_skill_01_trail_02'], '号角 S1: projectile_chr_horn_s1');
  assert.deepEqual(MODES.char_472_pasngr.skills[0].shot, ['pasngr_skill_01_trail'], '异客 S1: the chain\'s line is no shot');
  assert.equal(MODES.char_474_glady.skills[0].shot[0], 'glady_skill_01_trail', '歌蕾蒂娅 S1: the harpoon before its rope');
  assert.equal(MODES.char_1047_halo2.skills[1].shot[0], 'halo2_skill_02_trail_01', '溯光星源 S2: the shot before the link line');
  assert.deepEqual(MODES.char_126_shotst.skills.map((s) => s.shot), [['shotst_skill_01_trail'], ['shotst_skill_02_trail']]);
});

test('char_modes.py: only a skill without duration keeps its shot (焰影苇草 S2\'s fireballs are an ability of their own)', () => {
  assert.equal(MODES.char_1020_reed2.skills[1].shot, undefined);
  const dur = durations(), pre = prefabs();
  let n = 0;
  for (const [id, m] of Object.entries(MODES)) {
    if (id.startsWith('$')) continue;
    (m.skills || []).forEach((s, i) => {
      if (!s?.shot) return;
      n++;
      assert.ok(!(dur[pre[id]?.[i]] > 0), `${id} S${i + 1}: a timed skill has no shot`);
    });
  }
  assert.ok(n >= 30, `the skills with a shot of their own (${n})`);
});

test('modelessTrail: the skill\'s shot while pending, else the Default mode\'s trail', () => {
  const h = MODES.char_4039_horn;
  assert.equal(attackMode(h, true, 0), -1, '号角 S1 switches no mode');
  const all = ['horn_skill_01_trail_02', 'horn_attack_01_trail_02'];
  assert.deepEqual(modelessTrail(h, all, 0, true), { name: 'horn_skill_01_trail_02', mode: -1, shot: true });
  assert.deepEqual(modelessTrail(h, all, 0, false), { name: 'horn_attack_01_trail_02', mode: 0, shot: false });
  assert.deepEqual(modelessTrail(h, ['horn_attack_01_trail_02'], 0, true), { name: 'horn_attack_01_trail_02', mode: 0, shot: false },
    'its shot not extracted: the Default one');
  const r = MODES.char_1020_reed2;
  assert.equal(attackMode(r, true, 1), -1);
  assert.equal(modelessTrail(r, [...r.trail[0], 'reed2_skill_02_fireball_01'], 1, true).name, r.trail[0][0], '焰影苇草 S2: her Default shot');
  assert.deepEqual(modelessTrail(h, null, 0, true), { name: null, mode: 0, shot: false });
});

test('fxgame: a mode-less skill\'s attack takes skillTrail; a skill\'s start arms its shot, its end disarms it', () => {
  assert.match(SRC, /if \(spec && mode === -1\) \(\{ name, mode \} = skillTrail\(src\)\);/);
  assert.match(SRC, /v\._fxShot = e\[2\] \? \{ t: null \} : null;/);
  assert.match(SRC, /if \(r\.shot\) s\.t = clockS;/);
});
