// test/render/skin-gate.test.js — which model an ally's operator skin draws (render/skin-gate.js, render/units.js
// UnitView._skinModel; docs/rules/render.md 「스킨 렌더 게이트」). The resource worker fetches any listed file it is asked
// for, so the gate in front of the model loader is what keeps a skin from being downloaded (함정 3); a skin draws only
// once all of its files are cached, and never changes mid-scene (함정 4); 其他玩家的皮肤 off draws the other players' units
// in their default model. Skin ids are made up; the last case reads the real lists when they are on disk.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { createSkinGate, skinKeyFor, skinSideEntry, skinFiles, pageSkinLists, SKIN_MODELS, SKIN_LIST } from '../../public/js/render/skin-gate.js';
import { renderInfo } from '../../public/js/render/app/info.js';

const RULE = 'docs/rules/render.md 「스킨 렌더 게이트」';
const tick = () => new Promise((r) => setImmediate(r));

const SK = 'char_1_a@boc#1', TK = 'token_1_a_drone_boc#1';
const side = (dir, extra = {}) => ({
  skel: `/assets/spine/skin/char_1_a/char_1_a_boc_1/${dir}/char_1_a_boc_1.skel`, atlas: `/assets/spine/skin/char_1_a/char_1_a_boc_1/${dir}/char_1_a_boc_1.atlas`,
  pages: [`/assets/spine/skin/char_1_a/char_1_a_boc_1/${dir}/char_1_a_boc_1.png`],
  pma: false, anims: { idle: 'Idle', die: 'Die' }, animations: { Idle: 1, Die: 0.8 }, events: ['OnAttack'], hits: {}, bounds: null, ...extra,
});
const tside = { ...side('front'), skel: '/assets/spine/skin/token_1_a_drone/t/front/t.skel', atlas: '/assets/spine/skin/token_1_a_drone/t/front/t.atlas', pages: ['/assets/spine/skin/token_1_a_drone/t/front/t.png'] };
const LISTS = () => ({
  models: { skins: { [SK]: { front: side('front'), back: side('back') }, [TK]: { front: tside } } },
  list: { skins: { [SK]: { owner: 'char_1_a', tokens: { token_1_a_drone: TK } }, [TK]: { owner: 'token_1_a_drone' } } },
});

/** A gate over a fake cache: `cache` holds the cached paths; `asked` records every path the gate asked about. */
function rig({ chosen = true, others = true, self = 'p1', lists = LISTS(), cacheAll = true } = {}) {
  const cache = new Set([SKIN_MODELS, SKIN_LIST]);
  if (cacheAll) for (const r of Object.values(lists.models.skins)) for (const p of skinFiles(r)) cache.add(p);
  const st = { chosen, others, self, loads: 0, asked: [] };
  const gate = createSkinGate({
    chosen: () => st.chosen, others: () => st.others, self: () => st.self,
    cached: (paths) => { st.asked.push(...paths); return paths.every((p) => cache.has(p)); },
    load: async () => { st.loads++; return lists; },
  });
  return { gate, cache, st };
}
const own = { side: 'ally', ownerId: 'p1', defId: 'char_1_a', spine: 'char_1_a', skin: SK };
const mate = { ...own, ownerId: 'p2' };
const base = (back) => ({ skel: back ? '/b.skel' : '/f.skel', base: true });
/** The gate after its lists arrived: one scene to start the load, one to judge by them. */
async function ready(r) { r.gate.scene(); await tick(); await tick(); r.gate.scene(); return r; }

describe('skin gate: what is drawn', () => {
  test('an own unit draws its skin once the lists and every file are cached; each side falls back to the default', async () => {
    const r = await ready(rig());
    const m = r.gate.model(own, base);
    assert.ok(m, `the skin is drawn (${RULE})`);
    assert.equal(m.front.skel, side('front').skel);
    assert.deepEqual(m.front.textures, side('front').pages, 'the pages are the entry textures');
    assert.equal(m.front.pma, false);
    assert.equal(m.back.skel, side('back').skel);
    assert.equal(m.front.fallback.skel, '/f.skel', 'a failed skin load falls back to the default Front');
    assert.equal(m.back.fallback.skel, '/b.skel');
  });

  test('a summon takes its owner skin to its own skin (skins.json tokens); one without a skin of it stays default', async () => {
    const r = await ready(rig());
    const m = r.gate.model({ side: 'ally', ownerId: 'p1', defId: 'token_1_a_drone', spine: 'token_1_a_drone', skin: SK }, base);
    assert.equal(m?.front.skel, tside.skel);
    assert.equal(m.back, null, 'no Back model');
    assert.equal(r.gate.model({ ...own, defId: 'token_9_x', spine: 'token_9_x' }, base), null);
    assert.equal(skinKeyFor(LISTS().list, SK, 'char_2_b'), null, 'another operator never wears it');
  });

  test('no skin, an enemy, an unknown skin or an incomplete record: the default model', async () => {
    const lists = LISTS();
    delete lists.models.skins[SK].front.pma; // the fexli pages are of both kinds: drawn only once the record says which
    const r = await ready(rig({ lists }));
    assert.equal(r.gate.model({ ...own, skin: undefined }, base), null);
    assert.equal(r.gate.model({ ...own, side: 'enemy' }, base), null);
    assert.equal(r.gate.model({ ...own, skin: 'char_1_a@nope#1' }, base), null);
    assert.equal(r.gate.model(own, base), null, 'no pma');
    assert.equal(skinSideEntry({ ...side('front'), anims: undefined }), null, 'no key table');
    assert.equal(skinSideEntry({ ...side('front'), pages: [] }), null, 'no pages');
  });
});

describe('skin gate: nothing of a skin is asked for unless it may be drawn (함정 3)', () => {
  test('the skin data not chosen: the lists are not loaded and no model file is looked up', async () => {
    const r = rig({ chosen: false });
    r.gate.scene(); await tick();
    assert.equal(r.gate.model(own, base), null);
    assert.equal(r.st.loads, 0, 'no list loaded');
    assert.deepEqual(r.st.asked.filter((p) => p.endsWith('.skel') || p.endsWith('.png')), [], `no model file asked for (${RULE})`);
  });

  test('其他玩家的皮肤 off: a teammate draws the default model and its files are never looked up; own units keep theirs', async () => {
    const r = await ready(rig({ others: false }));
    r.st.asked.length = 0;
    assert.equal(r.gate.model(mate, base), null, `a teammate's unit is default (${RULE})`);
    assert.deepEqual(r.st.asked, [], 'nothing of that skin asked for');
    assert.ok(r.gate.model(own, base), 'own (ownerId = self)');
    assert.ok(r.gate.model({ ...mate, ownerId: null, mine: true }, base), 'own prep piece (mine)');
    r.st.others = true;
    assert.equal(r.gate.model(mate, base), null, 'the setting turned on mid-scene: from the next scene');
    r.gate.scene();
    assert.ok(r.gate.model(mate, base), 'next scene');
  });
});

describe('skin gate: all files cached, and no change mid-scene (함정 4)', () => {
  test('a skin with one file missing draws default; cached mid-scene it still does until the next scene', async () => {
    const r = rig({ cacheAll: false });
    for (const p of skinFiles(LISTS().models.skins[SK])) if (!p.includes('/back/')) r.cache.add(p);
    await ready(r);
    assert.equal(r.gate.model(own, base), null, `the Back page is not cached (${RULE})`);
    for (const p of skinFiles(LISTS().models.skins[SK])) r.cache.add(p);
    assert.equal(r.gate.model(own, base), null, 'the download ended mid-scene: unchanged');
    r.gate.scene();
    assert.ok(r.gate.model(own, base), 'the next scene draws it');
  });

  test('lists that arrive mid-scene count from the next scene', async () => {
    const r = rig();
    r.gate.scene();
    await tick(); await tick();
    assert.equal(r.st.loads, 1);
    assert.equal(r.gate.model(own, base), null, 'loaded after this scene began');
    r.gate.scene();
    assert.ok(r.gate.model(own, base));
  });

  test('a field\'s first scene waits for ready(): it draws the skin (a new match opened in the default skins)', async () => {
    const r = rig();
    await r.gate.ready();
    r.gate.scene();
    assert.ok(r.gate.model(own, base), `ready() settles once the lists are loaded, so the first scene has them (${RULE} — createFieldView waits for it)`);
    const off = rig({ chosen: false });
    await off.gate.ready();
    assert.equal(off.st.loads, 0, 'not chosen: ready() settles without loading the lists');
    const g = createSkinGate({ chosen: () => true, others: () => true, self: () => 'p1', cached: () => true, load: async () => { throw new Error('offline'); } });
    await g.ready();
    g.scene();
    assert.equal(g.model(own, base), null, 'a failed fetch: ready() settles, the default model');
  });

  test('the page keeps the lists for the next field: one fetch for two loads, a failure is fetched again', async () => {
    const real = globalThis.fetch;
    let calls = 0, ok = false;
    globalThis.fetch = async (u) => { calls++; return ok ? { ok: true, json: async () => ({ skins: {}, u }) } : { ok: false, status: 503 }; };
    try {
      await assert.rejects(pageSkinLists());
      ok = true;
      const a = await pageSkinLists(), b = await pageSkinLists();
      assert.ok(a === b, `the second field reuses the page's lists (${RULE})`);
      assert.equal(calls, 4, 'two files after the failed pair, then none');
    } finally { globalThis.fetch = real; }
  });
});

describe('UnitView draws what the gate gives (render/units.js _skinModel)', () => {
  let fake, UnitView;
  before(async () => { fake = installFakePixi(); ({ UnitView } = await import('../../public/js/render/units.js')); });
  after(() => fake.restore());
  const DATA = { animations: [{ name: 'Idle' }, { name: 'Die' }] };
  const BASE = { skel: '/assets/spine/op/char_1_a/front/char_1_a.skel', atlas: '/a.atlas', textures: ['/a.png'], anims: { idle: 'Idle' }, animations: { Idle: 1 } };
  const view = (info, skinModel, acquire = async () => DATA) => {
    const got = [], calls = [];
    const ctx = fakeViewCtx(fake.P, {
      assets: { picture: () => null, image: async () => null, spineEntry: () => BASE, hasBack: () => false,
        spine: { acquire: async (e, o) => { got.push(e.skel); return acquire(e, o); }, release() {} } },
      skinModel: (i, b) => { calls.push(i); return skinModel(i, b); },
    });
    const v = new UnitView(ctx, { id: 1, kind: 'op', tier: 3, x: 5, y: 5, maxHp: 1, dir: 'RIGHT', ...info });
    return { v, got, calls };
  };

  test('a skin the gate allows is the model loaded; without a skin the gate is not asked', async () => {
    const r = await ready(rig());
    const a = view({ ...own }, (i, b) => r.gate.model(i, b));
    await tick(); await tick();
    assert.deepEqual(a.got, [side('front').skel], `the skin's Front (${RULE})`);
    const b = view({ side: 'ally', defId: 'char_1_a', spine: 'char_1_a' }, () => { throw new Error('asked'); });
    await tick(); await tick();
    assert.deepEqual(b.got, [BASE.skel]);
    assert.equal(b.calls.length, 0);
  });

  test('judged once per view; a skin model that fails to load falls back to the default one', async () => {
    const r = await ready(rig());
    const a = view({ ...own }, (i, b) => r.gate.model(i, b), async (e) => { if (e.skin) throw new Error('down'); return DATA; });
    await tick(); await tick(); await tick();
    assert.deepEqual(a.got, [side('front').skel, BASE.skel], 'the fallback');
    assert.ok(a.v.spineReady);
    a.v._entryFor(true); a.v._wantsBack();
    assert.equal(a.calls.length, 1, 'one judgement');
  });

  test('renderInfo keeps an ally\'s skin (UnitInfo.skin), not an enemy\'s', () => {
    assert.equal(renderInfo({ id: 1, side: 'ally', defId: 'char_1_a', skin: SK }).skin, SK);
    assert.equal(renderInfo({ id: 2, side: 'enemy', defId: 'enemy_1', skin: SK }).skin, undefined);
  });
});

describe('the skin lists on disk', () => {
  const dir = 'public/assets/local/spine/skin/';
  const have = existsSync(dir + 'models.json') && existsSync(dir + 'skins.json');
  test('every summon skin an operator skin names resolves to a model or a listed missing one; every model file is listed', { skip: !have && 'no skin lists' }, () => {
    const models = JSON.parse(readFileSync(dir + 'models.json', 'utf8'));
    const list = JSON.parse(readFileSync(dir + 'skins.json', 'utf8'));
    const listed = new Set(models.files.map((f) => f.p));
    const missing = new Set(Object.keys(models.missing || {}));
    let tokens = 0;
    for (const [id, rec] of Object.entries(list.skins)) {
      for (const [tokenId, tk] of Object.entries(rec.tokens || {})) {
        const key = skinKeyFor(list, id, tokenId);
        if (!key && !list.skins[tk]) continue; // a summon skin the client lacks (skins.json missing)
        assert.equal(key, tk, `${id} → ${tokenId}`);
        assert.ok(models.skins[key] || missing.has(key), `${key}: no model`);
        tokens++;
      }
      if (models.skins[id]) assert.equal(skinKeyFor(list, id, rec.owner), id);
    }
    assert.ok(tokens > 20, `summon skins checked: ${tokens}`);
    for (const [id, rec] of Object.entries(models.skins)) for (const p of skinFiles(rec)) assert.ok(listed.has(p), `${id}: ${p} not in the list`);
  });
});
