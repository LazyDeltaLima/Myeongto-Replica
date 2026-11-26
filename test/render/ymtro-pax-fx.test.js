// test/render/ymtro-pax-fx.test.js — “越长尘”'s passenger mark drawn by its official effects (2026-11-26, docs/rules/fx.md
// 「규정 대포 「염괴포」」 승객 표시): DurbusAbility `_UpdatePassengerEffect` puts the n-th of its `_passengerEffects`
// (enemy_ymtro_buff_01 … _04) on the carrier while it carries n, made again only when n changes, none with none
// (`_FinishPassengerEffect`). The sim's fx 'passengers' { id, n } (content/enemies/special.js kitBus) come from a real
// battle; the render runs on a sample binding (the extracted one is compared at the end).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { makeBattle } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const MODES = new URL('../../public/assets/local/fx/enemy-modes.json', import.meta.url);
const YMTRO = 'enemy_1302_ymtro_2';
const PAX = ['enemy_ymtro_buff_01', 'enemy_ymtro_buff_02', 'enemy_ymtro_buff_03', 'enemy_ymtro_buff_04'];

async function layer() {
  const m = { [YMTRO]: { modes: [{ name: 'Default', anim: ['Attack'] }], passenger: PAX }, $fx: Object.fromEntries(PAX.map((n) => [n, ['pfx_enemy_15', n]])) };
  const files = { '/assets/local/fx/index.json': { bundles: { pfx_enemy_15: PAX } }, '/assets/local/fx/enemy-modes.json': m };
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  const seen = [];
  const L = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p) });
  await new Promise((r) => setTimeout(r, 10));
  return { L, seen };
}
const viewOf = (u) => ({ id: u.id, x: u.x, y: u.y, alive: true, isEnemy: true, form: null, flags: 0, statuses: new Set(),
  info: { id: u.id, side: 'enemy', defId: u.defId, form: null } });

/** A real battle: “越长尘” standing still takes one 源石虫, then two more, loses one on board and is knocked out. */
function ride() {
  const h = makeBattle({ content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600, enemies: [] });
  h.step();
  const put = (key) => h.spawn(key, { pos: [10, 7], routeIndex: 0, mods: { speedMul: 0 }, tag: null });
  const bus = put(YMTRO);
  const first = put('enemy_1007_slime');
  h.step();
  put('enemy_1007_slime');
  put('enemy_1007_slime');
  h.step();
  h.b.kill(first, null);
  h.step();
  h.b.kill(bus, null);
  h.step();
  return { h, bus };
}

test('“越长尘”: the n-th passenger mark on it at each count the sim signals, the old one stopped; none once they get off', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { h, bus } = ride();
    const sig = h.events.filter((x) => x[0] === 'fx' && x[1] === 'passengers' && x[4]?.id === bus.id);
    assert.deepEqual(sig.map((x) => x[4].n), [1, 3, 2, 0], 'the sim: one, three, one lost on board, the drop');
    const { L, seen } = await layer();
    const views = new Map([[bus.id, viewOf(bus)]]);
    L.onEvent(['tick'], views);
    seen.length = 0;
    const got = [];
    for (const x of sig) {
      L.onEvent(x, views);
      assert.equal(L.ownsFx(x), true, 'no stand-in');
      got.push(seen.splice(0).filter((p) => p.kind === 'spawn' || p.kind === 'paxEnd').map((p) => (p.kind === 'paxEnd' ? 'end' : `${p.names[0]}>${p.on}:${p.tag}`)));
    }
    assert.deepEqual(got, [
      [`enemy_ymtro_buff_01>${bus.id}:pax`], [`enemy_ymtro_buff_03>${bus.id}:pax`], [`enemy_ymtro_buff_02>${bus.id}:pax`], ['end'],
    ]);
  } finally { globalThis.fetch = fetch0; }
});

test('the extracted binding: its four passenger marks, extracted', { skip: !existsSync(MODES) && 'no extracted enemy effects' }, () => {
  const m = JSON.parse(readFileSync(MODES, 'utf8'));
  assert.deepEqual(m[YMTRO].passenger, PAX);
  for (const n of PAX) assert.ok(m.$fx[n], `${n} extracted (tools/local-extract/enemy_bindings.py --extract --id ${YMTRO})`);
});
