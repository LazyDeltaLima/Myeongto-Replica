// upstream #676 (PR #694): in a language other than Simplified Chinese — Korean is this server's default — 歌蕾蒂娅,
// 崖心 and 见行者 (钩索师 / 推击手, MELEE) could not be placed on a 高台. The 高台 check (shared/highGround.js) reads the
// trait text 「可以放置于远程位」, and the client's placement context read the localized chess records. It now reads the
// records as downloaded (ui/gameLogic/placement.js placementRecords: data.lookupRaw / getRaw, 自选 picks composed from
// them); cards and details keep the localized ones. The server always read the Chinese data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDataStore } from '../../public/js/data.js';
import { placementContext, placementRecords, canPlace } from '../../public/js/ui/gameLogic.js';
import { meleeOnHighGround } from '../../shared/highGround.js';
import { GEO } from '../../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const load = (f) => JSON.parse(readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const STAGE = load('stages.json').act2autochess_m01; // (10,4) a 高台, (9,4) a melee tile on the road
const HIGH = { area: 'board', row: 10, col: 4 };
const GLADIIA = ['chess_char_4_12_a', 'chess_char_4_12_b']; // 歌蕾蒂娅 钩索师, normal and elite (the elite carries traitBase)

function diskFetch() {
  return async (url) => {
    const abs = path.join(ROOT, url.replace(/^\/data\//, 'data/'));
    if (!existsSync(abs)) return { ok: false, status: 404, json: async () => null };
    const text = readFileSync(abs, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  };
}

async function koreanData() {
  const d = createDataStore({ fetch: diskFetch(), retryDelays: [] });
  await d.loadAll('chess', 'backups');
  assert.equal(await d.setLocale('ko'), 'ko');
  return d;
}

function privWithHand(id) {
  const hand = new Array(GEO.HAND_SIZE).fill(null);
  hand[0] = { uid: 1, kind: 'chess', id, golden: id.endsWith('_b'), tier: 4, items: [] };
  return { alive: true, ready: false, funds: 10, board: [], hand, temp: new Array(GEO.TEMP_SIZE).fill(null), deployCap: 8,
    deployCount: 0, canReady: true, loadout: null, shop: { level: 3, maxLevel: 6, upgradePrice: 8, refreshPrice: 1, freeRefreshes: 0, frozen: false, slots: [] } };
}

test('Korean: the localized records lose the 高台 line, the placement records keep it', async () => {
  const d = await koreanData();
  const raw = d.getRaw('chess');
  const highGround = Object.keys(raw).filter((id) => meleeOnHighGround(raw[id]));
  assert.ok(highGround.length >= 6, `歌蕾蒂娅 / 崖心 / 见行者, normal and elite: ${highGround.join(' ')}`);
  for (const id of GLADIIA) assert.ok(highGround.includes(id), id);
  const { getChess } = placementRecords(d, privWithHand(GLADIIA[0]));
  for (const id of highGround) {
    assert.equal(meleeOnHighGround(d.lookup('chess', id)), false, `${id}: the Korean card text is not the rule text`);
    assert.equal(meleeOnHighGround(getChess(id)), true, `${id}: the placement record reads the rule text`);
  }
});

for (const id of GLADIIA) test(`Korean: ${id} may be placed on a 高台 (canPlace with the placement records)`, async () => {
  const d = await koreanData();
  const priv = privWithHand(id);
  const ctx = placementContext({ priv, stage: STAGE, editable: true, ...placementRecords(d, priv) });
  assert.equal(canPlace(ctx, 1, HIGH).ok, true, 'the 高台 accepts the 钩索师');
  const localized = placementContext({ priv, stage: STAGE, editable: true, getChess: (x) => d.lookup('chess', x), backups: d.get('backups') });
  assert.equal(canPlace(localized, 1, HIGH).ok, false, 'the localized records alone refused it (the reported bug)');
});
