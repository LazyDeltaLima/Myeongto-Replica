// test/render/shared-skill-fx.test.js — maintainer report 2026-11-16 「애쉬락 S1 발동 시 착탄 이펙트가 공식보다 화려하다」.
// A skill whose prefab is a shared one (`skcom_*` in [uc]skills.ab: 灰毫 S1 skcom_atk_up) names no effect of its operator's own
// bundle and switches no attack mode, so its owner keeps the Default mode's attacks. The view read such a skill's attacks as
// mode −1, found no binding and fell to the name rule: 灰毫 S1 hit with ashlok_skill_01_hit on the target (her shell's blast
// gone) and swung with no cast, and the skill's start played ashlok_skill_01_start (fxgame.js sharedSkill / attackModeOf;
// docs/rules/fx.md 「모드를 바꾸지 않는 스킬의 공격」). The sweep: every chess form of every season whose skill is shared, whose
// operator has extracted bindings and whose charpack holds no mode of that skill's (`S<n>`) — its attacks during the skill start the same prefabs as without it, and neither the
// skill's start nor those attacks start one of its bundle's `_skill_` prefabs its binding does not name. tools/fx-golden.mjs
// hands the layer no unitDef, so the effect golden cannot see this.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { fxBundleOf } from '../../public/js/render/fxmap.js';
import { skillModeIndex } from '../../shared/skill-modes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FX = path.join(ROOT, 'public/assets/local/fx');
const NO_DATA = !existsSync(path.join(FX, 'modes.json')) && 'no extracted effects';
const json = (f) => JSON.parse(readFileSync(f, 'utf8'));
const recordsOf = (f) => { const d = json(path.join(ROOT, f)); return Array.isArray(d.chess) ? d.chess : Object.values(d.chess || d); };
const settle = () => new Promise((r) => setTimeout(r, 10));

/** Every [record, skill index] of a chess form whose skill i is a shared prefab and whose operator has bindings. */
function cases() {
  if (NO_DATA) return [];
  const modes = json(path.join(FX, 'modes.json'));
  const seen = new Set(), out = [];
  for (const f of ['data/chess.json', 'data/seasons/act3autochess/chess.json']) {
    if (!existsSync(path.join(ROOT, f))) continue;
    for (const r of recordsOf(f)) {
      if (!r?.charId || !Array.isArray(modes[r.charId]?.modes) || !Array.isArray(r.skills)) continue;
      r.skills.forEach((s, i) => {
        const key = `${r.charId}:${s?.prefabId}:${i}`;
        if (!/^skcom_/.test(String(s?.prefabId || '')) || seen.has(key)) return;
        // a charpack mode of its own for that skill (`S<n>`: 远牙 S1, 卡达 S1) is the mode the client switches to — not this case
        if (skillModeIndex(modes[r.charId].modes, i, modes[r.charId].skillMode) >= 0) return;
        seen.add(key);
        out.push({ r, i, bind: modes[r.charId] });
      });
    }
  }
  return out;
}

async function run(rec, i, skillOn, blocked) {
  const files = {
    '/assets/local/fx/index.json': json(path.join(FX, 'index.json')),
    '/assets/local/fx/modes.json': json(path.join(FX, 'modes.json')),
    '/assets/local/fx/enemy-index.json': { bundles: {} },
    '/assets/local/fx/enemy-modes.json': { $fx: {} },
  };
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p),
      unitDef: (info) => (info?.side === 'enemy' ? null : rec) });
    await settle();
    const op = { id: 1, x: 2, y: 0, alive: true, info: { id: 1, side: 'ally', defId: rec.chessId, spine: rec.charId, skillIndex: i, kind: 'op' } };
    const foe = { id: 9, x: blocked ? 3 : 4, y: 0, z: 0, alive: true, info: { id: 9, side: 'enemy', defId: 'enemy_x' } };
    const views = new Map([[1, op], [9, foe]]);
    const kind = blocked || rec.attackKind !== 'ranged' ? 'none' : (rec.projectile || 'arrow');
    layer.onEvent(['deploy', 1], views); layer.update(0.1, null); await settle();
    let start = [];
    if (skillOn) { seen.length = 0; layer.onEvent(['skill', 1, 1], views); layer.update(0.1, null); await settle(); start = seen.flatMap((p) => p.names || []); }
    seen.length = 0;
    layer.onEvent(['swing', 1, 9, kind, 0.4], views); layer.update(0.2, null);
    layer.onEvent(['atk', 1, 9, kind], views); layer.update(0.8, null);
    layer.onEvent(['dmg', 9, 100, 'phys', 0, 1], views); layer.update(0.1, null);
    const attack = [...new Set(seen.filter((p) => !/^skill(Start|Buff)$/.test(p.kind || '')).flatMap((p) => p.names || []))].sort();
    return { start, attack };
  } finally { globalThis.fetch = fetch0; }
}

test('every chess skill on a shared prefab attacks as the Default mode and plays no own-bundle `_skill_` stand-in', { skip: NO_DATA }, async () => {
  const all = cases();
  assert.ok(all.some(({ r, i }) => r.charId === 'char_431_ashlok' && i === 0), '灰毫 S1 (skcom_atk_up) is among the cases');
  const bad = [];
  for (const { r, i, bind } of all) {
    const named = new Set(Object.values(bind.skills?.[i] || {}).flat().filter((x) => typeof x === 'string'));
    const code = fxBundleOf(r.charId);
    const stray = (names) => names.filter((n) => n.startsWith(`${code}_skill`) && !named.has(n));
    for (const blocked of [false, true]) {
      const off = await run(r, i, false, blocked), on = await run(r, i, true, blocked);
      const why = `${r.chessId} S${i + 1} ${r.skills[i].prefabId}${blocked ? ' (blocking)' : ''}`;
      if (JSON.stringify(on.attack) !== JSON.stringify(off.attack)) bad.push(`${why}: attack ${on.attack.join('+') || '-'} ≠ Default ${off.attack.join('+') || '-'}`);
      const s = stray([...on.start, ...on.attack]);
      if (s.length) bad.push(`${why}: own-bundle stand-ins ${s.join('+')}`);
    }
  }
  assert.deepEqual(bad, [], 'a shared (skcom_*) skill keeps the Default mode\'s attack effects and names none of its operator\'s '
    + '`_skill_` prefabs (fxgame.js sharedSkill / attackModeOf; docs/rules/fx.md 「모드를 바꾸지 않는 스킬의 공격」)');
});
