// tools/local-extract/skin_extract.py: the operator and summon skin models and pictures (docs/rules/render.md 「스킨 모델 소재」).
// The official skin ids carry `#` (`char_202_demkni_boc#1`), which a URL reads as a fragment, so the browser's resource
// list refuses those paths (public/js/resources.js validPath). The extractor names every output through file_name()
// (`#` → `-`, any other unknown character stops the run) and rewrites the atlas to the renamed pages; and the extracted
// models, avatars and portraits never enter the pre-download list (tools/build-browser-resources.mjs: the skin models
// come from fexli's repository, tools/fetch-skin-models.mjs, the avatars and portraits from yuanyan's,
// tools/fetch-skin-art.mjs, and the skin data is a pack of its own). The Python helpers run without
// UnityPy; the real-output check skips when nothing was extracted on this machine.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validPath } from '../public/js/resources.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(ROOT, 'tools/local-extract');
const PY = ['python3', 'python'].find((bin) => spawnSync(bin, ['--version']).status === 0);
const ENV = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
const RULE = 'docs/rules/render.md 「스킨 모델 소재」';

/** Run python code with `skin_extract` imported as `s`; returns the parsed JSON it prints. */
function py(code) {
  const src = `import sys, json\nsys.path.insert(0, ${JSON.stringify(TOOL)})\nimport skin_extract as s\n${code}`;
  const r = spawnSync(PY, ['-c', src], { encoding: 'utf8', env: ENV });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

describe('skin_extract.py names (no UnityPy needed)', { skip: !PY && 'no python3' }, () => {
  test('file_name: `#` becomes `-`, and the result is a path the browser resource list keeps', () => {
    const names = ['char_202_demkni_boc#1', 'char_202_demkni_ambienceSynesthesia#7.png', 'token_10035_wisdel_wward_sale#14', 'char_2_x_2.png'];
    const out = py(`print(json.dumps([s.file_name(n) for n in ${JSON.stringify(names)}]))`);
    assert.deepEqual(out, ['char_202_demkni_boc-1', 'char_202_demkni_ambienceSynesthesia-7.png', 'token_10035_wisdel_wward_sale-14', 'char_2_x_2.png']);
    for (const n of out) assert.ok(validPath(`/assets/local/spine/skin/x/${n}`), `${n}: refused by resources.js validPath (${RULE})`);
    // the raw id is what the list refuses: the reason the rule exists
    assert.equal(validPath(`/assets/local/spine/skin/x/${names[0]}`), false);
  });

  test('illust_picture: a skin 立绘 carries the frame the client card draws it by (the stored pair before the RectTransform)', () => {
    // 史尔特尔's skin 「缤纷奇境 CW03」: the card draws it at the stored 1577.161 @ (−35.0, 195.0), not the RectTransform's
    // 1656.2 @ (−29.5, 188.1) — measured on the maintainer's official screenshot (docs/rules/ui.md 「스킨 고르기」 상세 카드)
    const out = py(`
from types import SimpleNamespace as NS
class O:
    def __init__(self, kind, tree): self.type, self._t = NS(name=kind), tree
    def read_typetree(self): return self._t
    def read(self): return 'sprite'
objs = {1: O('RectTransform', {'m_AnchoredPosition': {'x': -29.5, 'y': 188.09}, 'm_SizeDelta': {'x': 1656.2, 'y': 1656.2}}),
        2: O('MonoBehaviour', {'m_Sprite': {'m_FileID': 0, 'm_PathID': 9}, 'm_Material': None}),
        3: O('MonoBehaviour', {'_objects': [], '_values': [{'key': 'ILLUST_OFFSET', 'value': '-35.01463,195.0144,0'}, {'key': 'ILLUST_SIZE', 'value': '1577.161,1577.161,0'}]}),
        9: O('Sprite', None)}
s.sprite_picture = lambda sp, alpha=None: 'PIC'
s.material_alpha = lambda ptr, objects: None
tree = {'m_Component': [{'component': {'m_FileID': 0, 'm_PathID': i}} for i in (1, 2, 3)]}
print(json.dumps(s.illust_picture(tree, objs)))`);
    assert.deepEqual(out, ['PIC', { x: -35.01463, y: 195.0144, w: 1577.161, h: 1577.161 }], 'skin_extract.py illust_picture must take its frame from chararts_extract.illust_frame (docs/rules/ui.md 「스킨 고르기」)');
  });

  test('file_name stops on a character it has no rule for (a `-` too: it could make two names one)', () => {
    const bad = ['a-b#1', 'a b', 'a%23', 'a/b', 'a?b', '..', '', 'ä#1'];
    const out = py(`
r = []
for n in ${JSON.stringify(bad)}:
    try:
        s.file_name(n); r.append(None)
    except ValueError as e:
        r.append(str(e))
print(json.dumps(r))`);
    out.forEach((msg, i) => {
      assert.ok(msg, `file_name(${JSON.stringify(bad[i])}) must stop the run (${RULE})`);
      assert.match(msg, /스킨 모델 소재/);
    });
  });

  test('rename_atlas_pages renames the page lines only; region names and fields stay', () => {
    const atlas = 'char_x_boc#1.png\nsize: 4,4\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\nBody#1\n  rotate: false\n  xy: 0, 0\n\nchar_x_boc#1_2.png\nsize: 2,2\nHead\n  xy: 1, 1\n';
    const out = py(`print(json.dumps(s.rename_atlas_pages(${JSON.stringify(atlas)}, {'char_x_boc#1.png': 'char_x_boc-1.png', 'char_x_boc#1_2.png': 'char_x_boc-1_2.png'})))`);
    assert.equal(out, atlas.replace('char_x_boc#1.png', 'char_x_boc-1.png').replace('char_x_boc#1_2.png', 'char_x_boc-1_2.png'));
    assert.match(out, /\nBody#1\n/, 'a region name is not a file and keeps its `#`');
  });

  test('skin_rows: the table\'s own battle prefabs of our operators and summons, with the summon map; DefaultSkin, null and other owners left out', () => {
    const table = {
      charSkins: {
        'char_1_a#1': { charId: 'char_1_a', battleSkin: { skinOrPrefabId: 'DefaultSkin' } },
        'char_1_a@boc#1': { charId: 'char_1_a', battleSkin: { skinOrPrefabId: 'char_1_a_boc#1' }, tokenSkinMap: [{ tokenId: 'token_9_t', tokenSkinId: 'token_9_t_boc#1' }] },
        'char_2_other@x#1': { charId: 'char_2_other', battleSkin: { skinOrPrefabId: 'char_2_other_x#1' } },
        'token_9_t#1': { charId: 'token_9_t', battleSkin: { skinOrPrefabId: null } },
        'token_9_t_boc#1': { charId: 'token_9_t', battleSkin: { skinOrPrefabId: 'token_9_t_boc#1' } },
      },
    };
    const rows = py(`print(json.dumps(s.skin_rows(json.loads(${JSON.stringify(JSON.stringify(table))}), {'char_1_a'}, set())))`);
    assert.deepEqual(rows, [
      { key: 'char_1_a@boc#1', owner: 'char_1_a', prefab: 'char_1_a_boc#1', tokens: { token_9_t: 'token_9_t_boc#1' } },
      { key: 'token_9_t_boc#1', owner: 'token_9_t', prefab: 'token_9_t_boc#1' },
    ]);
  });

  test('skin_rows carries the record\'s Chinese name (the picker shows it through tName); a summon skin has none', () => {
    const table = { charSkins: {
      'char_1_a@boc#1': { charId: 'char_1_a', battleSkin: { skinOrPrefabId: 'char_1_a_boc#1' }, displaySkin: { skinName: ' 升华 ' } },
      'token_9_t_boc#1': { charId: 'token_9_t', battleSkin: { skinOrPrefabId: 'token_9_t_boc#1' }, displaySkin: { skinName: null } },
    } };
    const rows = py(`print(json.dumps(s.skin_rows(json.loads(${JSON.stringify(JSON.stringify(table))}), {'char_1_a'}, {'token_9_t'})))`);
    assert.deepEqual(rows.map((r) => r.name), ['升华', undefined]);
  });

  test('--only names writes the table\'s names into the listed skins without a client, every other field kept', () => {
    const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
    const op = Object.keys(assets.chars).find((c) => c.startsWith('char_') && assets.chars[c].spine?.front);
    const dir = path.join(ROOT, `.cache/test-skin-names-${process.pid}`);
    try {
      mkdirSync(path.join(dir, 'spine/skin'), { recursive: true });
      const table = { charSkins: {
        [`${op}@x#1`]: { charId: op, battleSkin: { skinOrPrefabId: `${op}_x#1` }, displaySkin: { skinName: '新名字' } },
        [`${op}@y#2`]: { charId: op, battleSkin: { skinOrPrefabId: `${op}_y#2` }, displaySkin: { skinName: '没有模型' } },
      } };
      writeFileSync(path.join(dir, 'table.json'), JSON.stringify(table));
      const front = { skel: '/a.skel', atlas: '/a.atlas', textures: ['/a.png'], pma: true };
      const illust = { path: '/i.webp', w: 1024, h: 1024, frame: { x: 0, y: 0, w: 1, h: 1 }, full: { path: '/f.webp', w: 2048, h: 2048 } };
      const index = { version: 1, source: 'local-client', skins: { [`${op}@x#1`]: { owner: op, prefab: `${op}_x#1`, client: 'en', name: '旧名字', front, illust } },
        missing: { [`${op}@y#2`]: { owner: op, why: 'no client has its prefab' } }, artMissing: {} };
      const file = path.join(dir, 'spine/skin/skins.json');
      writeFileSync(file, JSON.stringify(index));
      const r = spawnSync(PY, ['-I', path.join(TOOL, 'skin_extract.py'), '--only', 'names', '--id', op, '--table', path.join(dir, 'table.json'), '--out', dir],
        { encoding: 'utf8', env: { ...ENV, SP_CLIENT: path.join(dir, 'no-client') } });
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(readFileSync(file, 'utf8'));
      assert.deepEqual(out.skins[`${op}@x#1`], { ...index.skins[`${op}@x#1`], name: '新名字' }, 'the name follows the table, the model and both 立绘 copies stay');
      assert.deepEqual(Object.keys(out.skins[`${op}@x#1`]), ['owner', 'prefab', 'client', 'name', 'front', 'illust']);
      assert.deepEqual(Object.keys(out.skins), [`${op}@x#1`], 'a skin without a model is not listed for its name');
      assert.deepEqual(out.missing, index.missing);
      rmSync(file);
      assert.notEqual(spawnSync(PY, ['-I', path.join(TOOL, 'skin_extract.py'), '--only', 'names', '--table', path.join(dir, 'table.json'), '--out', dir], { encoding: 'utf8', env: ENV }).status, 0,
        'no list to name: stops instead of writing an empty one');
      assert.ok(!existsSync(file));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('skin_rows carries the record\'s own picture ids, and the pictures are named by the same rule', () => {
    const table = {
      charSkins: {
        'char_1_a@boc#1': { charId: 'char_1_a', battleSkin: { skinOrPrefabId: 'char_1_a_boc#1' },
          avatarId: 'char_1_a_boc#1', portraitId: 'char_1_a_boc#1', illustId: 'illust_char_1_a_boc#1' },
        'token_9_t_boc#1': { charId: 'token_9_t', battleSkin: { skinOrPrefabId: 'token_9_t_boc#1' }, avatarId: 'token_9_t_boc#1', portraitId: null, illustId: null },
      },
    };
    const out = py(`
rows = s.skin_rows(json.loads(${JSON.stringify(JSON.stringify(table))}), {'char_1_a'}, {'token_9_t'})
print(json.dumps([[r.get('pics'), [s.picture_rel(r['owner'], r['prefab'], k, v) for k, v in r.get('pics', {}).items()]] for r in rows]))`);
    assert.deepEqual(out[0][0], { avatar: 'char_1_a_boc#1', portrait: 'char_1_a_boc#1', illust: 'illust_char_1_a_boc#1' });
    assert.deepEqual(out[0][1], [
      'spine/skin/char_1_a/char_1_a_boc-1/avatar/char_1_a_boc-1.png',
      'spine/skin/char_1_a/char_1_a_boc-1/portrait/char_1_a_boc-1.png',
      'spine/skin/char_1_a/char_1_a_boc-1/illust/illust_char_1_a_boc-1.webp',
    ]);
    assert.deepEqual(out[1][0], { avatar: 'token_9_t_boc#1' }, 'a summon skin carries an avatar only');
    for (const rel of out.flatMap((r) => r[1])) assert.ok(validPath(`/assets/local/${rel}`), `${rel}: refused by resources.js validPath (${RULE})`);
    // the client's name → path map gives `Arts/…/Skins/<id>`; the sprite pack lists it lower case with its extension
    assert.equal(py(`print(json.dumps(s.picture_container('Arts/CharAvatars/Skins/char_1_a_ambienceSynesthesia#7')))`),
      'dyn/arts/charavatars/skins/char_1_a_ambiencesynesthesia#7.png');
  });

  test('skin_rows stops on a prefab of another owner and on two folders that differ only in case', () => {
    const cases = [
      { charSkins: { 'char_1_a@x#1': { charId: 'char_1_a', battleSkin: { skinOrPrefabId: 'char_2_b_x#1' } } } },
      { charSkins: { 'char_1_a@x#1': { charId: 'char_1_a', battleSkin: { skinOrPrefabId: 'char_1_a_x#1' } },
        'char_1_a@X#1': { charId: 'char_1_a', battleSkin: { skinOrPrefabId: 'char_1_a_X#1' } } } },
    ];
    for (const t of cases) {
      const r = py(`
try:
    s.skin_rows(json.loads(${JSON.stringify(JSON.stringify(t))}), {'char_1_a'}, set()); print(json.dumps(None))
except ValueError as e:
    print(json.dumps(str(e)))`);
      assert.ok(r, `skin_rows must stop on ${JSON.stringify(t)} (${RULE})`);
    }
  });
});

describe('the skin data is a pack of the pre-download list', () => {
  test('tools/build-browser-resources.mjs lists the skin models and avatars / portraits from their indexes and the 立绘, never the extracted copies', () => {
    const rel = `.cache/test-browser-resources-${process.pid}`;
    const dir = path.join(ROOT, rel);
    const h = 'c'.repeat(64);
    try {
      mkdirSync(path.join(dir, 'local/spine/skin/char_1_a/char_1_a_boc-1/front'), { recursive: true });
      mkdirSync(path.join(dir, 'local/spine/skin/char_1_a/char_1_a_boc-1/illust'), { recursive: true });
      mkdirSync(path.join(dir, 'local/spine/skin/char_1_a/char_1_a_boc-1/avatar'), { recursive: true });
      mkdirSync(path.join(dir, 'local/spine/skin/char_1_a/char_1_a_boc-1/portrait'), { recursive: true });
      mkdirSync(path.join(dir, 'local/spine/token/t'), { recursive: true });
      writeFileSync(path.join(dir, 'local/spine/skin/char_1_a/char_1_a_boc-1/front/char_1_a_boc-1.skel'), 'x');
      writeFileSync(path.join(dir, 'local/spine/skin/char_1_a/char_1_a_boc-1/illust/char_1_a_boc-1.webp'), 'w');
      mkdirSync(path.join(dir, 'local/spine/skin/char_1_a/char_1_a_boc-1/illust/full'), { recursive: true });
      writeFileSync(path.join(dir, 'local/spine/skin/char_1_a/char_1_a_boc-1/illust/full/char_1_a_boc-1.webp'), 'W');
      mkdirSync(path.join(dir, 'local/chararts/full'), { recursive: true });
      writeFileSync(path.join(dir, 'local/chararts/char_1_a.webp'), 'c');
      writeFileSync(path.join(dir, 'local/chararts/full/char_1_a.webp'), 'C');
      writeFileSync(path.join(dir, 'local/chararts/full/lone.webp'), 'L');
      writeFileSync(path.join(dir, 'local/spine/skin/char_1_a/char_1_a_boc-1/avatar/char_1_a_boc-1.png'), 'a');
      writeFileSync(path.join(dir, 'local/spine/skin/char_1_a/char_1_a_boc-1/portrait/char_1_a_boc-1.png'), 'p');
      writeFileSync(path.join(dir, 'local/spine/skin/skins.json'), '{}');
      const model = { p: '/assets/spine/skin/char_1_a/char_1_a_boc_1/front/char_1_a_boc_1.skel', s: 5, h,
        u: `https://raw.githubusercontent.com/fexli/ArknightsResource/${'a'.repeat(40)}/spine/char_1_a/char_1_a_boc_1/Front/char_1_a_boc_1.skel` };
      writeFileSync(path.join(dir, 'local/spine/skin/models.json'), JSON.stringify({ files: [model] }));
      const avatar = { p: '/assets/spine/skin/char_1_a/char_1_a_boc-1/avatar/char_1_a_boc-1.png', s: 7, h,
        u: `https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/${'b'.repeat(40)}/avatar/char_1_a_boc%231.png` };
      writeFileSync(path.join(dir, 'local/spine/skin/art.json'), JSON.stringify({ files: [avatar] }));
      writeFileSync(path.join(dir, 'local/spine/token/t/t.skel'), 'y');
      const run = () => spawnSync(process.execPath, [path.join(ROOT, 'tools/build-browser-resources.mjs'), '--assets', rel], { cwd: ROOT, encoding: 'utf8' });
      const r = run();
      assert.equal(r.status, 0, r.stderr);
      const list = JSON.parse(readFileSync(path.join(dir, 'browser-resources.json'), 'utf8'));
      const paths = list.files.map((f) => f.p);
      assert.ok(paths.includes('/assets/local/spine/token/t/t.skel'), 'an ordinary local file is listed');
      assert.deepEqual(list.packs, { skin: ['/assets/spine/skin/', '/assets/local/spine/skin/'] });
      assert.deepEqual(paths.filter((p) => p.includes('/spine/skin/')).sort(), [
        '/assets/local/spine/skin/art.json', '/assets/local/spine/skin/char_1_a/char_1_a_boc-1/illust/char_1_a_boc-1.webp',
        '/assets/local/spine/skin/char_1_a/char_1_a_boc-1/illust/full/char_1_a_boc-1.webp', '/assets/local/spine/skin/models.json', '/assets/local/spine/skin/skins.json', avatar.p, model.p,
      ], `the skin models, avatars and portraits come from their repositories, the extracted ones never from this server (${RULE})`);
      assert.deepEqual(list.files.find((f) => f.p === model.p), model, 'with the repository\'s URL and hash');
      assert.deepEqual(list.files.find((f) => f.p === avatar.p), avatar, 'the avatar with yuanyan\'s URL and hash');
      // the two copies of a 立绘 (maintainer decision 2026-11-16): a browser pre-downloads only its device's
      const pairOf = (p) => list.files.find((f) => f.p === p)?.r;
      for (const lo of ['/assets/local/chararts/char_1_a.webp', '/assets/local/spine/skin/char_1_a/char_1_a_boc-1/illust/char_1_a_boc-1.webp']) {
        const hi = lo.replace(/\/([^/]+)$/, '/full/$1');
        assert.deepEqual([pairOf(lo), pairOf(hi)], ['lo', 'hi'], `${lo}: the 1024 copy and the original-resolution one are marked a pair (public/js/illust-res.js)`);
      }
      assert.equal(pairOf('/assets/local/chararts/full/lone.webp'), undefined, 'a full/ copy without its 1024 twin is no pair');
      assert.equal(pairOf(model.p), undefined);
      writeFileSync(path.join(dir, 'local/spine/skin/art.json'), JSON.stringify({ files: [avatar, avatar] }));
      assert.notEqual(run().status, 0, 'a path listed twice stops the run');
      writeFileSync(path.join(dir, 'local/spine/skin/art.json'), JSON.stringify({ files: [avatar] }));
      writeFileSync(path.join(dir, 'local/spine/skin/models.json'), JSON.stringify({ files: [{ ...model, u: 'https://evil.host/x' }] }));
      assert.notEqual(run().status, 0, 'a malformed models.json stops the run');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

const INDEX = path.join(ROOT, 'public/assets/local/spine/skin/skins.json');
describe('extracted skin models (when a local client was extracted)', { skip: !existsSync(INDEX) && 'no extracted skins' }, () => {
  test('every listed file exists and is a path the browser resource list keeps; every skin has a front model', () => {
    const doc = JSON.parse(readFileSync(INDEX, 'utf8'));
    const skins = Object.entries(doc.skins);
    assert.ok(skins.length > 0, 'skins.json lists no skin');
    for (const [key, s] of skins) {
      assert.ok(s.front, `${key}: no front model`);
      const pics = ['avatar', 'portrait', 'illust'].map((k) => s[k]).filter(Boolean).map((e) => e.path);
      if (s.illust?.full) pics.push(s.illust.full.path);
      for (const p of [s.front, s.back].filter(Boolean).flatMap((side) => [side.skel, side.atlas, ...side.textures]).concat(pics)) {
        assert.ok(validPath(p), `${key}: ${p} is refused by resources.js validPath (${RULE})`);
        assert.ok(existsSync(path.join(ROOT, 'public', p)), `${key}: ${p} missing on disk`);
      }
    }
  });

  test('an operator skin has its avatar, portrait and framed 立绘, or skins.json says which the clients lack', { skip: !('artMissing' in JSON.parse(readFileSync(INDEX, 'utf8'))) && 'pictures not extracted' }, () => {
    const doc = JSON.parse(readFileSync(INDEX, 'utf8'));
    let checked = 0, full = 0;
    for (const [key, s] of Object.entries(doc.skins)) {
      if (!s.owner.startsWith('char_')) continue;
      const lack = doc.artMissing[key] || [];
      for (const k of ['avatar', 'portrait', 'illust']) {
        assert.ok(s[k] || lack.includes(k), `${key}: no ${k} and not listed in artMissing (${RULE})`);
      }
      if (s.illust) {
        const f = s.illust.frame;
        assert.ok(f && f.w > 0 && f.h > 0, `${key}: the 立绘 has no illust frame`);
        checked++;
        if (s.illust.full) {
          assert.equal(Math.max(s.illust.w, s.illust.h), 1024, `${key}: the copy beside the original resolution has the long side 1024`);
          assert.ok(Math.max(s.illust.full.w, s.illust.full.h) > 1024, `${key}: a full copy no larger than 1024`);
          full++;
        }
      }
    }
    assert.ok(checked > 0, 'no operator skin 立绘 was checked');
    // the clients' skin 立绘 are 1024–3000 px squares (2026-11-16: 42 under 2048, none under 1024): nearly every one has
    // the original-resolution copy (maintainer decision 2026-11-16; skin_extract.py through chararts_extract.save_illust)
    assert.ok(full > checked * 0.8, `only ${full} of ${checked} skin 立绘 have their original-resolution copy: run skin_extract.py --only art (${RULE})`);
  });

  // Most skin 立绘 keep their alpha outside the sprite: the illust Image's material draws its `_AlphaTex` over an opaque
  // texture. Read without it, the art comes out on a white or black square (skin_extract.py material_alpha).
  const pil = PY && spawnSync(PY, ['-c', 'import PIL.Image, PIL.features; assert PIL.features.check("webp")']).status === 0;
  test('every extracted 立绘 is cut out (its material\'s alpha texture was applied)', { skip: !pil && 'no Pillow with webp' }, () => {
    const doc = JSON.parse(readFileSync(INDEX, 'utf8'));
    const files = Object.entries(doc.skins).filter(([, s]) => s.illust)
      .flatMap(([key, s]) => [s.illust, s.illust.full].filter(Boolean).map((e) => [key, path.join(ROOT, 'public', e.path)]));
    const r = spawnSync(PY, ['-c', `
import json, sys
from PIL import Image
out = []
for key, f in json.load(sys.stdin):
    a = Image.open(f).convert('RGBA').getchannel('A')
    clear = a.histogram()[0] / (a.width * a.height)
    if clear < 0.01:
        out.append([key, round(clear, 4)])
print(json.dumps(out))`], { input: JSON.stringify(files), encoding: 'utf8', env: ENV, maxBuffer: 1 << 24 });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(files.length > 0, 'no 立绘 listed');
    assert.deepEqual(JSON.parse(r.stdout), [], `立绘 with (almost) no transparent pixel: the illust material's _AlphaTex was not applied (${RULE})`);
  });
});
