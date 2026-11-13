// test/helpers/fxDryLayer.js — the real effect layer without a canvas (createFxLayer `dry`), fed the extracted index and bindings:
// a test sends it battle events and reads the prefabs it starts. `take()` gives them as 'name' or 'name@unit' and empties the list;
// `load` is the view's adaptive load level 0–3 (render/app.js).

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FX = path.join(ROOT, 'public/assets/local/fx');
export const NO_DATA = !existsSync(path.join(FX, 'modes.json')) && 'no extracted effects';
const json = (f) => JSON.parse(readFileSync(path.join(FX, f), 'utf8'));
const settle = () => new Promise((r) => setTimeout(r, 10));

export async function withLayer(run, { load = () => 0 } = {}) {
  const files = {
    '/assets/local/fx/index.json': json('index.json'),
    '/assets/local/fx/modes.json': json('modes.json'),
    '/assets/local/fx/plays.json': json('plays.json'),
    '/assets/local/fx/enemy-index.json': { bundles: {} },
    '/assets/local/fx/enemy-modes.json': { $fx: {} },
  };
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', load, dry: true, trace: (p) => seen.push(p) });
    await settle();
    const unit = (id, side, defId, x = 0, skillIndex = 0) => ({ id, x, y: 0, alive: true, info: { id, side, defId, skillIndex } });
    const take = () => seen.splice(0).flatMap((p) => (p.names || []).map((n) => `${n}${p.at != null ? `@${p.at}` : ''}`));
    await run({ layer, unit, take });
  } finally { globalThis.fetch = fetch0; }
}
