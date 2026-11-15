// test/render/status-stand-in-wait.test.js — 2026-11-15 (user report: stand-ins flashed for a moment before the official
// art): the status stand-ins — the units' drawn status icons (fxstatus.js syncStatusFx → `_statusIcons`) and the elite
// ground ring (fxgolden.js syncGoldenFx → `goldenFallback`) — show only where the official effects cannot play (quality
// 'low', a failed layer, no extracted effects, the prefab not listed). While the effect index still loads neither shows;
// they used to show until it came (docs/rules/ui.md ⑤ 「버프 이펙트」). Its own file: the index is fetched once a page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { syncStatusFx } from '../../public/js/render/fxstatus.js';
import { syncGoldenFx, GOLDEN_FX } from '../../public/js/render/fxgolden.js';

const unit = () => ({ id: 1, flags: 0, statuses: new Set(), alive: true, prep: false, remove: false });
const piece = () => ({ id: 2, flags: 0, statuses: new Set(), alive: true, prep: true, golden: true, isEnemy: false, isToken: false, remove: false, destroyed: false });

test('status stand-ins wait for the effect index: neither while it loads, the effects once it comes, the stand-ins where they cannot play', async () => {
  const fetch0 = globalThis.fetch;
  try {
    let release;
    const gate = new Promise((r) => { release = r; });
    const files = { '/assets/local/fx/index.json': { bundles: { trap: [GOLDEN_FX[1]], common: ['common_buff_01'] } } };
    globalThis.fetch = async (url) => { await gate; return files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null }; };
    let quality = 'high';
    const layer = createFxLayer({ host: null, above: null, quality: () => quality, dry: true });
    const u = unit(), g = piece();
    const sync = () => { syncStatusFx(new Map([[1, u]]), layer, false); syncGoldenFx(new Map([[2, g]]), layer, true); };

    sync();
    assert.equal(u._statusIcons, false, 'index loading: no drawn status icons (they used to show until it came)');
    assert.equal(g.goldenFallback, false, 'index loading: no elite ground ring either');
    quality = 'low';
    sync();
    assert.equal(u._statusIcons, true, '\'low\' needs no index: the icons');
    assert.equal(g.goldenFallback, true, '\'low\': the ring');
    quality = 'high';

    release();
    await new Promise((r) => setTimeout(r, 10));
    sync();
    assert.equal(u._statusIcons, false, 'the index there: the effects, no icons');
    assert.equal(g.goldenFallback, false, 'the glow listed: no ring');
    assert.equal(layer.statusStandIn('trap', 'not_extracted'), true, 'a prefab not listed: its stand-in');
    quality = 'low';
    sync();
    assert.equal(u._statusIcons, true, '\'low\' turns the effects off: the icons');
    assert.equal(g.goldenFallback, true);

    globalThis.fetch = undefined;
    const bare = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true });
    assert.equal(bare.statusStandIn(), true, 'no effect index to wait for (no extracted effects): the icons');
    assert.equal(bare.statusStandIn(...GOLDEN_FX), true, 'and the ring');
  } finally { globalThis.fetch = fetch0; }
});
