// Equipment models (2026-11-11, maintainer request: the hand items drawn as the client's models, not icon plates; both
// seasons' items). The client builds every item as a trap character whose battle prefab (the token packs
// pkgrps/btl_pfb_tokens_*.ab) draws one Spine model with a single 0 s clip. tools/local-extract/extract.py extracts the
// model of every `trapId` of the item tables (item_spine_ids; the --game root first, then the CN client for a season's
// items only it has) into public/assets/local/spine/item/<trapId>/; tools/fetch-assets.mjs --local-spines writes their
// metadata (tools/assets/local-item-spines.json) and data/assets.json `itemSpines[trapId]` names the files of the
// data/local-assets.json group spine/item/<trapId> — never read from the disk, so the manifest is the same with or
// without the extraction. The client (assets.js itemSpine) resolves the model when data/local-assets.json lists its
// files; render/item-models.js draws each model once into a shared page and render/units.js ItemView shows a sprite of
// it, keeping the icon plate without one (no extraction, a load failure, the magic items whose prefab draws none).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlan } from '../tools/assets/plan.mjs';
import { resolveTemplate, collectLeaves } from '../tools/assets/manifest.mjs';
import { loadLocalSpines, LOCAL_ITEM_SPINES_FILE } from '../tools/assets/spine.mjs';
import { indexAudio } from '../tools/assets/audio.mjs';
import { itemSpineEntry, validSpine } from '../public/js/assets.js';
import { installFakePixi, fakeViewCtx } from './render/fakepixi.js';
import { presetCamera } from '../public/js/render/projection.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const TOOL = path.join(ROOT, 'tools/local-extract');
const PY = ['python3', 'python'].find((bin) => spawnSync(bin, ['--version']).status === 0);

/** The magic items whose battle prefab draws no Spine model (an empty Graphic): they keep the icon plate. */
const NO_MODEL = ['trap_1108_acdisney', 'trap_1110_accopy', 'trap_1111_acchal'];

/** Every trapId of the item tables (data/items.json and each season's items.json). */
function tableTrapIds() {
  const ids = new Set();
  const files = ['data/items.json', ...readdirSync(path.join(ROOT, 'data/seasons')).sort().map((d) => `data/seasons/${d}/items.json`)];
  for (const f of files) {
    let recs;
    try { recs = readJson(f); } catch { continue; }
    for (const r of Object.values(recs.items || recs)) if (r && typeof r.trapId === 'string') ids.add(r.trapId);
  }
  return [...ids].sort();
}

describe('the committed metadata and data/assets.json itemSpines', () => {
  let committed;
  before(async () => { committed = await loadLocalSpines(path.join(ROOT, LOCAL_ITEM_SPINES_FILE)); });

  test('every item of both seasons has its model, but the magic items whose prefab draws none', () => {
    const ids = tableTrapIds();
    assert.ok(ids.includes('trap_1041_acarm041') && ids.includes('trap_1126_acarm126'), 'both seasons\' tables read');
    const missing = ids.filter((id) => !committed[id] && !NO_MODEL.includes(id));
    assert.deepEqual(missing, [], 'an item with no extracted model (extract.py --only spine/item, then fetch-assets --local-spines)');
    assert.deepEqual(Object.keys(committed).filter((id) => !ids.includes(id)), [], 'a model of no item');
    for (const id of NO_MODEL) assert.equal(committed[id], undefined, id);
  });

  test('a model is a still pose: one 0 s clip, the idle role', () => {
    for (const [id, m] of Object.entries(committed)) {
      const clips = Object.entries(m.animations);
      assert.equal(clips.length, 1, id);
      assert.equal(clips[0][1], 0, `${id}: ${clips[0][0]} lasts 0 s`);
      assert.equal(m.anims.idle, clips[0][0], id);
      assert.ok(m.skel.endsWith('.skel') && m.atlas === m.skel.replace(/\.skel$/, '.atlas') && m.textures.length, id);
    }
  });

  test('the shared skeletons stay: 维式重锤 draws trap_1024_acarm024\'s (the prefab decides, not the id)', () => {
    assert.equal(committed.trap_1041_acarm041.skel, 'trap_1024_acarm024.skel');
  });

  test('data/assets.json itemSpines = the committed metadata with its group, no file to download', () => {
    const m = readJson('data/assets.json');
    assert.deepEqual(Object.keys(m.itemSpines).sort(), Object.keys(committed).sort());
    for (const [id, meta] of Object.entries(committed)) assert.deepEqual(m.itemSpines[id], { group: `spine/item/${id}`, ...meta }, id);
  });

  test('plan: itemSpines from the metadata as it is; none without it', () => {
    const plan = (localItemSpines) => buildPlan({
      assets07: readJson('docs/research/07-assets.json'), ops03: readJson('docs/research/03-operators.json'),
      enemies05: readJson('docs/research/05-enemies.json'), maps05: readJson('docs/research/05-maps.json'),
      audio: indexAudio({}), modelsData: { data: {} }, localItemSpines,
    });
    assert.deepEqual(plan(undefined).template.itemSpines, {});
    const p = plan({ trap_1041_acarm041: committed.trap_1041_acarm041, bogus: committed.trap_1041_acarm041 });
    const tmp = mkdtempSync(path.join(tmpdir(), 'sp-itemplan-'));
    try {
      const { value } = resolveTemplate({ itemSpines: p.template.itemSpines }, { root: tmp, spine: new Map() });
      assert.deepEqual(value.itemSpines, { trap_1041_acarm041: { group: 'spine/item/trap_1041_acarm041', ...committed.trap_1041_acarm041 } });
    } finally { rmSync(tmp, { recursive: true, force: true }); }
    assert.ok(!collectLeaves(p.template).some((l) => /itemSpines/.test(l.path)));
  });
});

describe('assets.js itemSpineEntry', () => {
  const meta = { skel: 'a.skel', atlas: 'a.atlas', textures: ['a.png'], pma: true, anims: { idle: 'Default' }, animations: { Default: 0 } };
  const M = { itemSpines: { trap_1041_acarm041: { group: 'spine/item/trap_1041_acarm041', ...meta } } };
  const files = { 'a.skel': { path: '/assets/local/spine/item/t/a.skel' }, 'a.atlas': { path: '/assets/local/spine/item/t/a.atlas' }, 'a.png': { path: '/assets/local/spine/item/t/a.png' } };
  const LOCAL = { groups: { 'spine/item/trap_1041_acarm041': files } };

  test('the model when data/local-assets.json lists every file; by trapId or item record', () => {
    const e = itemSpineEntry(M, 'trap_1041_acarm041', LOCAL);
    assert.ok(validSpine(e) && e.local && e.pma && e.textures[0] === files['a.png'].path && e.fallback === null);
    assert.equal(itemSpineEntry(M, { trapId: 'trap_1041_acarm041', iconId: 'x' }, LOCAL), e, 'one entry object per manifest pair');
  });

  test('null without the local manifest, with a file missing, or for an unknown item', () => {
    assert.equal(itemSpineEntry(M, 'trap_1041_acarm041', null), null);
    const { 'a.png': _, ...rest } = files;
    assert.equal(itemSpineEntry(M, 'trap_1041_acarm041', { groups: { 'spine/item/trap_1041_acarm041': rest } }), null);
    assert.equal(itemSpineEntry(M, 'trap_9_nope', LOCAL), null);
    assert.equal(itemSpineEntry({}, 'trap_1041_acarm041', LOCAL), null);
  });
});

describe('render/item-models.js: one still snapshot per model, shared', () => {
  let fake, ItemModels;
  before(async () => { fake = installFakePixi(); ({ ItemModels } = await import('../public/js/render/item-models.js')); });
  after(() => fake.restore());

  const rig = (resolution = 1) => {
    const renders = [], runners = new Set(), acquired = new Map(), released = [];
    const renderer = {
      resolution, render: (obj, o) => renders.push({ obj, clear: o.clear }),
      runners: { contextChange: { add: (x) => runners.add(x), remove: (x) => runners.delete(x) } },
    };
    const assets = {
      spine: {
        acquire: async (entry) => { if (entry.bad) throw new Error('load'); acquired.set(entry, (acquired.get(entry) || 0) + 1); return { animations: [{ name: 'Default' }] }; },
        release: (entry) => released.push(entry),
      },
    };
    return { renderer, assets, renders, runners, acquired, released };
  };
  const E = (n) => ({ n, anims: { idle: 'Default' } });

  test('two views of one model: one load, one draw, one cell; the cell stays cached after the last release', async () => {
    const r = rig();
    const models = new ItemModels(r.renderer, r.assets);
    const e = E(1);
    const a = models.acquire(e), b = models.acquire(e);
    const [sa, sb] = await Promise.all([a.ready, b.ready]);
    assert.ok(sa && sa === sb && sa.texture.baseTexture === models.rt.baseTexture);
    assert.equal(r.acquired.get(e), 1);
    assert.equal(r.renders.length, 1);
    assert.equal(r.renders[0].clear, true, 'the first draw clears the page');
    assert.ok(sa.k > 0 && sa.k <= 128 && sa.top < sa.ay && sa.ay <= sa.bottom + 1e-9, 'the feet inside the model box');
    models.release(a); models.release(b); models.release(b);
    assert.equal(models.cells.size, 1);
    assert.ok(models.idle.size === 1 && r.released.length === 0, 'idle, its skeleton still held');
    const c = models.acquire(e);
    assert.equal(await c.ready, sa, 'taken again without a draw');
    assert.equal(r.renders.length, 1);
    models.destroy();
    assert.deepEqual(r.released, [e], 'released with the page');
    assert.equal(r.runners.size, 0);
  });

  test('a full page gives the oldest unreferenced cell to a new model; a referenced one is never taken', async () => {
    const r = rig(2);                            // 1024 CSS px page: 8 × 8 cells
    const models = new ItemModels(r.renderer, r.assets);
    assert.equal(models.cols, 8);
    const refs = [];
    for (let i = 0; i < 64; i++) refs.push(models.acquire(E(i)));
    await Promise.all(refs.map((x) => x.ready));
    const idx5 = refs[5].cell.index;
    models.release(refs[5]); models.release(refs[2]);
    const n = models.acquire(E(100));
    assert.ok(await n.ready, 'drawn');
    assert.equal(models.cells.has(refs[5].cell.entry), false, 'the oldest idle cell went');
    assert.equal(models.cells.has(refs[2].cell.entry), true);
    assert.equal(n.cell.index, idx5, 'into its space');
    const m = models.acquire(E(101)), o = models.acquire(E(102));
    assert.ok(await m.ready);
    assert.equal(await o.ready, null, 'nothing left to give: the plate stays');
    assert.equal(models.stats.full, 1);
    models.destroy();
  });

  test('a load failure resolves null and is tried again by the next view', async () => {
    const r = rig();
    const models = new ItemModels(r.renderer, r.assets);
    const bad = { bad: true, anims: {} };
    const a = models.acquire(bad);
    assert.equal(await a.ready, null);
    models.release(a);
    assert.equal(models.cells.size, 0);
    const b = models.acquire(bad);
    assert.notEqual(b.cell, a.cell);
    models.destroy();
  });

  test('a held item\'s outline: drawn once per model into its own texture (12 offset copies filled by SRC_IN), kept, redrawn on a restored context, gone with its cell', async () => {
    const r = rig();
    const models = new ItemModels(r.renderer, r.assets);
    const a = models.acquire(E(1));
    const snap = await a.ready;
    r.renders.length = 0;
    const o = models.outline(snap, 0x66f0d4);
    assert.ok(o && o !== snap.texture && o.baseTexture !== models.rt.baseTexture, 'its own render texture');
    assert.equal(r.renders.length, 1);
    const kids = r.renders[0].obj.children;
    assert.equal(kids.length, 13, '12 offset copies and the fill');
    assert.ok(kids.slice(0, 12).every((k) => k.texture === snap.texture && Math.hypot(k.position.x, k.position.y) > 1));
    assert.equal(kids[12].tint, 0x66f0d4);
    assert.equal(kids[12].blendMode, globalThis.PIXI.BLEND_MODES.SRC_IN);
    assert.equal(models.outline(snap, 0x66f0d4), o, 'cached: no second draw');
    assert.equal(r.renders.length, 1);
    for (const x of r.runners) x.contextChange();
    assert.equal(r.renders.length, 3, 'the page cell and the outline drawn again');
    assert.equal(r.renders[2].obj.children.length, 13);
    assert.equal(models.outline(null, 1), null);
    models.release(a);
    models._drop(a.cell);
    assert.equal(models.outlines.size, 0, 'dropped with its cell');
    assert.equal(o.destroyed, true);
    models.destroy();
  });

  test('a restored WebGL context draws every cached cell again on a cleared page', async () => {
    const r = rig();
    const models = new ItemModels(r.renderer, r.assets);
    const a = models.acquire(E(1)), b = models.acquire(E(2));
    await Promise.all([a.ready, b.ready]);
    models.release(b);
    r.renders.length = 0;
    for (const x of r.runners) x.contextChange();
    assert.equal(r.renders.length, 2);
    assert.deepEqual(r.renders.map((x) => x.clear), [true, false]);
    models.destroy();
  });
});

describe('render/units.js ItemView: the model on its slot, else the plate', () => {
  let fake, ItemView;
  before(async () => { fake = installFakePixi(); ({ ItemView } = await import('../public/js/render/units.js')); });
  after(() => fake.restore());
  const cam = () => presetCamera(1280, 720);
  const store = () => ({ image: async () => null, itemSpine: (t) => (t === 'trap_1' ? { e: 1 } : null) });

  const snapModels = (snap) => {
    const log = { acquired: 0, released: 0 };
    let resolve;
    const ready = new Promise((r) => { resolve = r; });
    return { log, resolve: () => resolve(snap), models: { acquire: () => { log.acquired++; return { ready }; }, release: () => { log.released++; } } };
  };

  test('the snapshot replaces the plate, standing on the ground at the prefab scale; dragged, it stays ringed and a copy has the pointer at its lower right', async () => {
    const tex = new fake.P.Texture(new fake.P.BaseTexture({ width: 128, height: 128 }));
    const ringTex = new fake.P.Texture(new fake.P.BaseTexture({ width: 128, height: 128 }));
    const snap = { texture: tex, ax: 0.5, ay: 0.9, k: 128, top: 0.3, bottom: 0.98, width: 0.5 };
    const s = snapModels(snap);
    const outlined = [];
    s.models.outline = (sn, color) => { outlined.push([sn, color]); return ringTex; };
    const it = new ItemView(fakeViewCtx(fake.P, { assets: store(), cam, itemModels: s.models }), { id: 'p:9', uid: 9, kind: 'item', defId: 'chess_item_x', trapId: 'trap_1', x: 3, y: 7 });
    assert.equal(s.log.acquired, 1);
    s.resolve();
    await new Promise((r) => setImmediate(r));
    assert.ok(it.model && it.model.texture === tex && it.plate.visible === false);
    it.setWorld(3, 7, 0.16);
    it.update(1 / 60, cam(), 0);
    const g = cam().project(3, 7, 0.16);
    assert.ok(Math.abs(it.root.y - g.y) < 1e-6, 'on its ground point: no float, no bob');
    assert.ok(Math.abs(it.model.scale.x - g.s / 128) < 1e-9, 'px per tile / the snapshot\'s');
    const b0 = it.bounds();
    const side = 128 * g.s / 128;
    assert.ok(Math.abs(b0.y - (g.y - (0.9 - 0.3) * side)) < 1e-6 && Math.abs(b0.height - 0.68 * side) < 1e-6, 'the model box');
    assert.equal(it.copy, null, 'no copy before a drag');
    // dragged: the pointer over another tile
    const ptr = cam().project(6, 9, 0.16);
    it.holdAt(ptr.x, ptr.y);
    it.update(1 / 60, cam(), 0);
    assert.deepEqual(it.bounds(), b0, 'the item stays in its slot');
    assert.ok(Math.abs(it.root.x - g.x) < 1e-6 && Math.abs(it.root.y - g.y) < 1e-6);
    assert.equal(outlined.length, 1);
    assert.ok(outlined[0][0] === snap && outlined[0][1] === 0x66f0d4);
    assert.ok(it.ring && it.ring.texture === ringTex && it.ring.visible && it.ring.parent === it.root, 'the ring on the item (behind its model: addChildAt 0)');
    assert.ok(Math.abs(it.ring.scale.x - it.model.scale.x) < 1e-12 && it.ring.anchor.x === 0.5 && it.ring.anchor.y === 0.9);
    const c = it.copy;
    assert.ok(c && c.root.visible && c.model.texture === tex && c.model !== it.model, 'a copy of the model');
    assert.ok(c.root.children.every((k) => k.texture !== ringTex), 'the copy has no outline');
    const k = c.model.scale.x, cs = 128 * k;
    const right = c.root.x + (0.5 - 0.5) * cs + (0.5 * cs) / 2, bottom = c.root.y + (0.98 - 0.9) * cs;
    assert.ok(Math.abs(right - ptr.x) < 1e-6 && Math.abs(bottom - ptr.y) < 1e-6, 'the pointer at the copy\'s box\' lower right');
    assert.ok(c.root.x < ptr.x && c.root.y < ptr.y, 'the copy stands above left of the pointer');
    const cg = cam().project(c.g.x, c.g.y, c.g.z);
    assert.ok(Math.abs(cg.x - c.root.x) < 1e-6 && Math.abs(cg.y - c.root.y) < 1e-6, 'its ground point under it');
    assert.ok(c.shadow.visible && Math.abs(c.shadow.position.x - cg.x) < 1e-6, 'its own shadow at its feet');
    assert.ok(c.root.zIndex > it.root.zIndex, 'over the units');
    const end = it.endHold();
    assert.ok(Math.abs(end.x - c.g.x) < 1e-9 && Math.abs(end.y - c.g.y) < 1e-9, 'the drop flies from the copy');
    it.update(1 / 60, cam(), 0);
    assert.ok(!c.root.visible && !c.shadow.visible && !it.ring.visible, 'released: copy and ring gone');
    assert.equal(it.endHold(), null);
    it.destroy();
    assert.equal(s.log.released, 1);
    assert.equal(tex.destroyed, false, 'the shared snapshot stays');
    assert.equal(ringTex.destroyed, false, 'the shared outline stays');
  });

  // the client's CreateDummy runs _CreateGoldEffectIfNeed for every chess type (ChessBasicInfo.isGolden, no type test);
  // an elite item shares its base item's trapId, so the glow is what tells it apart
  test('an elite item wears the prep elite glow (or the ring flag while it cannot play); a normal one none', async () => {
    const { syncGoldenFx, GOLDEN_FX } = await import('../public/js/render/fxgolden.js');
    const ctx = () => fakeViewCtx(fake.P, { assets: store(), cam, itemModels: snapModels(null).models });
    const gold = new ItemView(ctx(), { id: 'p:1', uid: 1, kind: 'item', defId: 'chess_item_1_01_e_b', trapId: 'trap_1', golden: true, x: 1, y: 7 });
    const plain = new ItemView(ctx(), { id: 'p:2', uid: 2, kind: 'item', defId: 'chess_item_1_01_e_a', trapId: 'trap_1', x: 2, y: 7 });
    const views = new Map([['p:1', gold], ['p:2', plain]]);
    const calls = [];
    const fx = (ready) => ({
      statusReady: (b, n) => ready && b === GOLDEN_FX[0] && n === GOLDEN_FX[1],
      statusOn(v, b, n, key, frac, hold, under) { (v._fxStatusOn ||= new Set()).add(key); calls.push(['on', v.id, key, under]); },
      statusOff(v, key) { v._fxStatusOn?.delete(key); calls.push(['off', v.id, key]); },
    });
    syncGoldenFx(views, fx(true), true);
    assert.deepEqual(calls, [['on', 'p:1', 'golden', true]]);
    gold.update(1 / 60, cam(), 0);
    syncGoldenFx(views, fx(true), false);
    assert.deepEqual(calls.at(-1), ['off', 'p:1', 'golden'], 'out of the prep: off');
    syncGoldenFx(views, fx(false), true);
    assert.deepEqual([gold.goldenFallback, plain.goldenFallback], [true, false], 'cannot play: the ring on the elite only');
    gold.destroy(); plain.destroy();
  });

  test('no model (unknown trap, no snapshot): the plate stays and the reference is given back', async () => {
    const s = snapModels(null);
    const it = new ItemView(fakeViewCtx(fake.P, { assets: store(), cam, itemModels: s.models }), { id: 'p:9', uid: 9, kind: 'item', defId: 'x', trapId: 'trap_1', x: 3, y: 7 });
    s.resolve();
    await new Promise((r) => setImmediate(r));
    assert.ok(!it.model && it.plate.visible !== false && s.log.released === 1);
    const other = new ItemView(fakeViewCtx(fake.P, { assets: store(), cam, itemModels: s.models }), { id: 'p:8', uid: 8, kind: 'item', defId: 'y', trapId: 'trap_2', x: 3, y: 7 });
    assert.equal(s.log.acquired, 1, 'no entry: nothing acquired');
    it.retryAssets();
    assert.equal(s.log.acquired, 2, 'retried when the manifest arrives late');
    it.destroy(); other.destroy();
  });
});

describe('extract.py: the item list and the EN-then-CN search', { skip: !PY && 'no python3' }, () => {
  const py = (code) => {
    const src = `import sys, json, types\nsys.path.insert(0, ${JSON.stringify(TOOL)})\nimport extract as e\n${code}`;
    const r = spawnSync(PY, ['-c', src], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };

  test('item_spine_ids: every trapId of both seasons\' tables', () => {
    assert.deepEqual(py('print(json.dumps(e.item_spine_ids()))'), tableTrapIds());
  });

  test('ids the first root lacks come from the next (CN); a prefab drawing no Spine is reported once', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'sp-itemext-'));
    try {
      for (const r of ['en', 'cn']) { mkdirSync(path.join(tmp, r, 'pkgrps'), { recursive: true }); writeFileSync(path.join(tmp, r, 'pkgrps', 'btl_pfb_tokens_4.ab'), ''); }
      const out = py(`
class O:
    def __init__(s, pid, kind, tree): s.path_id, s.type, s._t = pid, types.SimpleNamespace(name=kind), tree
    def read_typetree(s): return s._t
def bundle(spine_ids, empty_ids):
    objs, cont = [], {}
    for n, tid in enumerate(spine_ids + empty_ids):
        comps = []
        if tid in spine_ids:
            objs.append(O(1000 + n, 'MonoBehaviour', {'skeletonDataAsset': {'m_FileID': 0, 'm_PathID': 2000 + n}}))
            objs.append(O(2000 + n, 'MonoBehaviour', {}))
            comps = [{'component': {'m_FileID': 0, 'm_PathID': 1000 + n}}]
        cont[f'dyn/battle/prefabs/[uc]tokens/{tid}.prefab'] = types.SimpleNamespace(read_typetree=lambda c=comps: {'m_Name': 'Front', 'm_Component': c})
    return types.SimpleNamespace(objects=objs, container=cont)
B = {'en': bundle(['trap_1', 'trap_2'], ['trap_9']), 'cn': bundle(['trap_1', 'trap_3'], [])}
sys.modules['aklz4'] = types.ModuleType('aklz4')
sys.modules['UnityPy'] = types.SimpleNamespace(load=lambda p: B['cn' if 'cn' in __import__('pathlib').Path(p).parts else 'en'])
wrote = []
e.write_spine = lambda objects, sda, sub, name, *a: (wrote.append([sub, name]), 3)[1]
log = []
n = e.export_token_spines(${JSON.stringify(path.join(tmp, 'en'))}, '/x', {}, log.append, ['trap_1', 'trap_2', 'trap_3', 'trap_9', 'trap_8'],
                          e.ITEM_SPINE_SUB, [${JSON.stringify(path.join(tmp, 'cn'))}], 'item')
print(json.dumps({'n': n, 'wrote': wrote, 'log': log}))`);
      assert.deepEqual(out.wrote, [['spine/item/trap_1', 'trap_1'], ['spine/item/trap_2', 'trap_2'], ['spine/item/trap_3', 'trap_3']], 'EN first; CN only for trap_3');
      assert.equal(out.n, 9);
      assert.ok(out.log.some((l) => /item trap_9: its prefab draws no Spine model/.test(l)));
      assert.ok(out.log.includes('skip (not found) item Spine trap_8'));
      assert.ok(!out.log.some((l) => /trap_9/.test(l) && /not found/.test(l)), 'a modelless prefab is not looked up again');
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });
});
