// 临时层数 (卫戍协议：规程) on the bond strip and the bond popup, in battle. The official CN HUD (capture of 2026-11-11, docs/rules/ui.md
// 「임시 중첩 표시」): the strip disc shows the whole count (fixed + temporary) in yellow; the popup shows 层数 = the fixed
// layers and a yellow "+ n" (the temporary ones) under it; the effect text keeps the whole count.
// The runner's side (state().bondTemp from Battle.tempLayerGainsOf) is in test/match/watch-bonds.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
globalThis.fetch = async (url) => {
  const name = String(url).split('/').pop();
  try {
    const body = readFileSync(path.join(ROOT, 'data', name), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};
const { withLiveLayers, screenStrip, popupView, playerBonds } = await import('../../public/js/ui/watchBonds.js');
const { BondPopup, BondStrip } = await import('../../public/js/ui/bondStrip.js');
const { data } = await import('../../public/js/data.js');
await data.loadAll('chess', 'bonds', 'assets', 'config');

function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  if (typeof v.type === 'function' && !v.props?.children) return;
  yield* walk(v.props?.children);
}
const hasClass = (v, c) => typeof v?.props?.class === 'string' && v.props.class.split(/\s+/).includes(c);
const textOf = (v) => [...walk(v)].flatMap((n) => (Array.isArray(n.props?.children) ? n.props.children : [n.props?.children])).filter((x) => typeof x === 'string' || typeof x === 'number').join('');

const BOND = 'yanShip'; // any stacking bond of the default season's data (the rule is the same for 乌萨斯 in 规程)
const entry = (layers, extra = {}) => ({ bondId: BOND, count: 6, active: true, tier: 2, layers, thresholds: [3, 6], ...extra });

test('withLiveLayers: the temporary part rides on the entries the live count sets, never above the shown count', () => {
  const list = [entry(30), { bondId: 'preciShip', count: 3, active: true, tier: 1, layers: 61, thresholds: [2, 3] }];
  const out = withLiveLayers(list, { [BOND]: 193, preciShip: 70 }, 999, { [BOND]: 144 });
  assert.deepEqual(out.map((b) => [b.bondId, b.layers, b.tempLayers]), [[BOND, 193, 144], ['preciShip', 70, undefined]], 'only the bond with 临时层数 carries it');
  assert.equal(withLiveLayers(list, { [BOND]: 100 }, 999, { [BOND]: 500 })[0].tempLayers, 100, 'clamped to the shown count');
  assert.equal(withLiveLayers(list, { [BOND]: 20 }, 999, { [BOND]: 10 }), list, 'the view already shows more (settled): no live count, no temporary part');
  assert.equal(withLiveLayers(list, { [BOND]: 193 })[0].tempLayers, undefined, 'no temp map: nothing tagged');
  const joined = withLiveLayers([], { [BOND]: 12 }, 999, { [BOND]: 12 });
  assert.equal(joined[0].tempLayers, 12, 'a bond that joins the list keeps its temporary part too');
});

test('screenStrip / popupView / playerBonds pass the runner\'s bondTemp of the player on screen, only with live layers', () => {
  const pub = { phase: 'COMBAT', players: [{ playerId: 'p1', name: 'me', bonds: [entry(49)] }, { playerId: 'p2', name: 'mate', bonds: [entry(5)] }], fields: [] };
  const bondLayers = { p1: { [BOND]: 193 }, p2: { [BOND]: 9 } };
  const bondTemp = { p1: { [BOND]: 144 }, p2: { [BOND]: 4 } };
  const own = screenStrip({ pub, myId: 'p1', combat: true, battleFieldId: 'n:p1', bondLayers, bondTemp });
  assert.deepEqual([own.bonds[0].layers, own.bonds[0].tempLayers], [193, 144]);
  assert.equal(screenStrip({ pub, myId: 'p1', combat: false, bondLayers, bondTemp }).bonds[0].tempLayers, undefined, 'prep: no live layers, no yellow');
  const pop = popupView({ open: { id: BOND, ownerId: 'p2' }, pub, myId: 'p1', live: bondLayers, temp: bondTemp });
  assert.deepEqual([pop.entry.layers, pop.entry.tempLayers], [9, 4], 'a teammate\'s popup: their temporary part');
  assert.equal(playerBonds({ pub, myId: 'p1', ownerId: 'p1', live: null, temp: bondTemp })[0].tempLayers, undefined, 'temp without live layers is ignored');
});

test('BondStrip: a count with 临时层数 is drawn in yellow (has-temp) and its title says the temporary part', () => {
  const strip = BondStrip({ bonds: [entry(193, { tempLayers: 144 }), { bondId: 'preciShip', count: 3, active: true, tier: 1, layers: 61 }], onOpen() {} });
  const slots = [...walk(strip)].filter((v) => hasClass(v, 'bslot'));
  const yan = slots.find((v) => v.props['data-bond'] === BOND);
  const preci = slots.find((v) => v.props['data-bond'] === 'preciShip');
  assert.ok(hasClass(yan, 'has-temp') && yan.props['data-temp'] === 144);
  assert.ok(!hasClass(preci, 'has-temp') && preci.props['data-temp'] == null, 'no temporary part: the usual white count');
  const disc = [...walk(yan)].find((v) => v.props?.layers != null);
  assert.equal(disc.props.layers, 193, 'the disc shows the whole count, as the official HUD');
  assert.match(disc.props.title, /临时层数 \+144$/);
});

test('BondPopup: 层数 = the fixed layers, then a yellow "+ n" for the temporary ones; the effect text keeps the whole count', () => {
  const pop = BondPopup({ bondId: BOND, entry: entry(193, { tempLayers: 144 }), priv: { board: [], hand: [] }, onClose() {} });
  const stack = [...walk(pop)].find((v) => hasClass(v, 'bpop__stack'));
  assert.equal([...walk(stack)].find((v) => v.type === 'b').props.children, 49);
  const tags = [...walk(pop)].filter((v) => hasClass(v, 'bpop__temp'));
  assert.equal(tags.length, 2, 'the official-art stack and the plain facts row');
  assert.ok(tags.every((v) => textOf(v) === '+ 144'));
  assert.ok(tags[0] !== tags[1], 'a vnode per place');
  assert.match(textOf(pop), /（193 层）/, '当前效果 at the whole count');
  const plain = BondPopup({ bondId: BOND, entry: entry(193), priv: { board: [], hand: [] }, onClose() {} });
  assert.equal([...walk(plain)].filter((v) => hasClass(v, 'bpop__temp')).length, 0, 'no temporary part: no tag');
  assert.equal([...walk([...walk(plain)].find((v) => hasClass(v, 'bpop__stack')))].find((v) => v.type === 'b').props.children, 193);
});
