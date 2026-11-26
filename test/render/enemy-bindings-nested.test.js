// test/render/enemy-bindings-nested.test.js — nested buff templates in the enemy bindings (tools/local-extract/enemy_bindings.py
// template_info, 2026-11-26, docs/rules/fx.md 「적 이펙트 바인딩」 중첩 버프 템플릿의 사건): a buff a template's nodes create runs its
// own events at its own moments, so its end / trigger effects go under its own key (`subEvent`), not into the parent's event of
// the same number; a template only named by another node (FinishBuffsById, AssignBuffBlackboardFromOthers) runs nothing there;
// a tile effect (CreateTileEffect) is only `tileFx`. Reads the extracted file the repository keeps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const B = JSON.parse(readFileSync(join(ROOT, 'tools/assets/local-enemy-bindings.json'), 'utf8'));
const KINDS = ['buffs', 'activeBuffs', 'passiveBuffs', 'projectileBuffs', 'buffsWhenReachedTarget', 'buffsToBlockee', 'uniqueBuffs'];
const WHY = 'enemy_bindings.py template_info: nested buff templates (docs/rules/fx.md 「적 이펙트 바인딩」 중첩 버프 템플릿의 사건) — rerun the extractor after fixing it';

/** @param {string} eid @param {string} tmpl */
function templates(eid, tmpl) {
  const out = [];
  for (const a of B[eid]?.abilities || []) {
    for (const k of KINDS) for (const b of a[k] || []) if ((b.tmpl || b.key) === tmpl && b.template) out.push(b.template);
  }
  assert.ok(out.length, `${eid} has no buff of template ${tmpl} in the bindings`);
  return out;
}
/** every effect name a template lists for its own events */
const ownEvents = (/** @type {any} */ t) => [...(t.fx || []), ...Object.values(t.onEvent || {}).flat()];

test('제트맨: the take-off and landing effects belong to its nested buffs, under their own keys', () => {
  for (const t of templates('enemy_2004_balloon', 'enemy_balloon_s')) {
    assert.ok(t.subEvent?.['balloon_s[fly]']?.['1']?.includes('enemy_balloon_land_01_start_l'), `fly's end lands — ${WHY}`);
    assert.ok(t.subEvent?.['balloon_s[trigger]']?.['2']?.includes('enemy_balloon_take_off_01_start_l'), `trigger's tick takes off — ${WHY}`);
    assert.ok(!ownEvents(t).some((n) => n.startsWith('enemy_balloon_')), `not as enemy_balloon_s's own events — ${WHY}`);
  }
});

test("'갑주를 부수는 해머': stun_back's end only finishes special_stun — no held stun effect as an end effect", () => {
  for (const eid of ['enemy_9014_acstma', 'enemy_9015_acstmb']) {
    for (const tmpl of [`${eid.slice(-6)}_s_1`]) {
      for (const t of templates(eid, tmpl)) {
        const ends = Object.values(t.subEvent || {}).flatMap((e) => e['1'] || []);
        assert.ok(!ends.includes('buff_stun'), `${eid}: ${WHY}`);
      }
    }
  }
});

test('죄악의 키메라: a template only named by AssignBuffBlackboardFromOthers adds none of its effects', () => {
  for (const eid of ['enemy_1425_lrcmra', 'enemy_1425_lrcmra_2']) {
    for (const t of templates(eid, 'enemy_lrcmra[originum][dmg]')) {
      assert.ok(!Object.values(t.onEvent || {}).flat().includes('mapeff_v050_toxci_debuff_01'), `${eid}: ${WHY}`);
    }
  }
});

test("'제국의 갑옷': the 3×3 tile warning is only a tile effect 0.8 s on, not an effect on the marked unit", () => {
  for (const t of templates('enemy_10027_vtsk', 'enemy_vtsk_skillRange_start')) {
    assert.deepEqual(t.tileFx, [{ fx: 'enemy_vtsk_skill_01_range_01', at: 0.8 }]);
    const all = [...ownEvents(t), ...Object.values(t.subEvent || {}).flatMap((e) => Object.values(e).flat())];
    assert.ok(!all.includes('enemy_vtsk_skill_01_range_01'), `${WHY}`);
  }
});
