// test/render/fx-overlap.test.js — no prefab a hand table (or a key a kit names) draws is played on the caster again by a skill
// activation's name rule (docs/rules/fx.md 「바인딩 표 — 손 표를 클라 키로 대조」, 겹침). The report's `overlap` over every
// operator (tools/fx-wiring-report.mjs): 12 such prefabs sat there until 2026-11-15, each drawn at the cast on the caster
// besides on the ally / enemy / later moment its table draws it at (新约能天使 S2's 屏障 on her twice, 水月 S2's 束缚 on her …),
// and a newly added operator's bundle can bring more. Each one is looked at: fxgame.js KIT_OWNED silences the name rule, or
// it goes into OVERLAP_OK with the reason the caster's copy is the official one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localWiringReport } from '../../tools/fx-wiring-report.mjs';

/** 'bundle|S<n>|prefab' → why the name rule's copy on the caster at the cast is right. */
const OVERLAP_OK = Object.freeze({
  // the S2 skill prefab skchr_gvial2_2 holds gvial2_s_1 in its `_buffs` on her for the skill (LIMITED @duration); the kit names
  // the key for the S1 template of the same name (heal_via_damage's moment, kitofficial.js plays gvial2_skill_1_heal instead)
  'gvial2|S2|gvial2_skill_2_buff_02': 'ok: S2\'s own buff on her for the skill; the kit names the S1 template that shares its key',
});

const report = localWiringReport();

test('no prefab a hand table draws plays again on the caster by the skill name rule, unless OVERLAP_OK says why', { skip: !report && 'needs the extracted effects' }, () => {
  const got = new Set(Object.entries(report).flatMap(([b, r]) => r.overlap.map((o) => `${b}|S${o.skill}|${o.fx}`)));
  assert.ok(report.angel2?.char === 'char_1041_angel2' && report.gvial2, 'the report ran over the operators (新约能天使, 百炼嘉维尔)');
  const fresh = [...got].filter((k) => !(k in OVERLAP_OK)).sort();
  assert.deepEqual(fresh, [], 'a prefab a hand table draws elsewhere (fxstatus.js / kitofficial.js / a named key) is also played on the caster at '
    + 'the cast by the `_buff` / `_range` / `_start` / `_hit` name rule: add it to fxgame.js KIT_OWNED, or to OVERLAP_OK with the reason the '
    + 'caster\'s copy is official (docs/rules/fx.md 「바인딩 표 — 손 표를 클라 키로 대조」 겹침; node tools/fx-wiring-report.mjs shows the rows)');
  const stale = Object.keys(OVERLAP_OK).filter((k) => !got.has(k));
  assert.deepEqual(stale, [], 'an OVERLAP_OK entry the report no longer shows: delete it');
});
