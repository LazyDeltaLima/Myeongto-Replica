#!/usr/bin/env python3
"""Export the official per-stage 3D board scenes of 卫戍协议 from a local Arknights client (DESIGN §15.1).

The client ships one prebuilt Unity scene per autochess stage:
  scenes/activities/act{1,2}autochess/level_<stage>/level_<stage>.ab      the scene (GameObjects, meshes, renderers)
  scenes/activities/act{1,2}autochess/level_<stage>/level_<stage>/lightingdata.ab   baked lightmaps (+ shadowmasks)
  scenes/activities/act{1,2}autochess/level_<stage>_lighting_settings.ab
and the map theme bundles its materials come from (resolved through the scenes' external CABs, e.g.
arts/maps/map_autochesssand/res.ab for the desert stages, arts/maps/map_kxmr/res.ab for act2 m03 Kazimierz).

Every active MeshRenderer of the scene is baked into world space and merged per (material, lightmap) into one
draw group, in board space (render/projection.js: x = col, y = row, z = up; Unity's tile (r,c) sits at
Anchor (-10,-9,0) + (c, r, -height), so board = (ux + 10, uy + 9, -uz) and the winding flips). Static-batched
renderers (the "Combined Mesh (root: scene)" chunks) already hold world-space vertices and lightmap UVs; the others
get their transform and their lightmap scale/offset applied here.

Output (under --out, default public/assets/local):
  scene/<stageId>/scene.json   groups (material, lightmap, buffer ranges), materials, lightmaps, main light, ambient
  scene/<stageId>/geom.bin     per group: position f32×3, normal f32×3, uv0 f32×2, uv1 f32×2, colour u8×4, index u32
  scene/<stageId>/lm*.png      lightmaps (comp_light, RGBM-encoded) and shadowmasks
  scene/tex/<name>.png         theme textures (shared by stages; BC5 normal maps get Z rebuilt, gloss maps → roughness)
and the manifest groups scene/<stageId> + scene/tex in data/local-assets.json. Like extract.py's board textures
(WEBP, upstream #186), every texture and lightmap also gets a WebP copy next to its PNG and the manifest lists the
copy: colour maps (a material's _MainTex only) lossy at quality 95, everything else lossless — normal / roughness /
emission maps hold per-channel data, and the RGBM lightmaps keep their range in A (≈ 43 → 28 MB for the 11 stages).

Usage (WSL, the EN client on D:):
  .venv-extract/bin/python tools/local-extract/scene_extract.py [--client /mnt/d/YostarGames/Arknights_EN/Arknights_Data]
      [--stage act2autochess_m04 ...] [--rebuild-index] [--no-webp]
  .venv-extract/bin/python tools/local-extract/scene_extract.py --webp    (only the WebP copies, from the PNGs already
      under --out — e.g. scene art copied to a server; needs Pillow, not the client)
"""

import argparse
import json
import math
import os
import re
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract import material_info, derive_normal_rg, derive_rough_from_gloss, _normal_z_table, _num, WEBP_OPTIONS  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CLIENT = '/mnt/d/YostarGames/Arknights_EN/Arknights_Data'
# CAB → bundle index of the bundles a stage scene can depend on (scanned once, cached: --rebuild-index)
INDEX_DIRS = [
    ('pd', 'arts/maps'), ('pd', 'battle/[pack]common.ab'), ('pd', 'shaders'), ('pd', '[uc]shaders.ab'),
    ('sa', 'arts/maps'), ('sa', 'arts/[pack]common.ab'), ('sa', 'shaders'), ('sa', '[uc]shaders.ab'), ('sa', 'graphics'),
]
SCENE_DIR = 'scenes/activities'
STAGE_RE = re.compile(r'^act\d+autochess_m\d+$')
# Unity anchor of tile (0,0) (BATTLE/GAME/Map/Anchor)
ANCHOR = (-10.0, -9.0, 0.0)
VERTEX_BYTES = 4 * (3 + 3 + 2 + 2) + 4


def log(*a):
    print(*a, flush=True)


# ---- bundle index ----------------------------------------------------------------------------------------------

def bundle_roots(client):
    c = Path(client)
    return {'pd': c / 'PersistentData/Bundles', 'sa': c / 'StreamingAssets/AB/Windows'}


def cab_names(path):
    """CAB names inside one bundle file (directory info only)."""
    from UnityPy.files import BundleFile
    from UnityPy.streams import EndianBinaryReader
    with open(path, 'rb') as fh:
        b = BundleFile(EndianBinaryReader(fh.read()), None, name=path.name)
    return [k.split('.')[0] for k in b.files]


def build_index(roots, cache):
    index = {}
    for root_key, rel in INDEX_DIRS:
        base = roots[root_key] / rel
        files = [base] if base.is_file() else sorted(base.rglob('*.ab')) if base.is_dir() else []
        for f in files:
            try:
                for cab in cab_names(f):
                    index.setdefault(cab, str(f))  # PersistentData (hot update) first: it overrides StreamingAssets
            except Exception as e:  # not a bundle / unreadable: skip
                log(f'  index skip {f}: {e}')
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(index, indent=0), encoding='utf-8')
    log(f'CAB index: {len(index)} entries -> {cache}')
    return index


# ---- maths -----------------------------------------------------------------------------------------------------

def trs(pos, rot, scl):
    """Row-major 4×4 of a Unity local transform (T · R · S)."""
    x, y, z, w = rot
    xx, yy, zz, xy, xz, yz, wx, wy, wz = x * x, y * y, z * z, x * y, x * z, y * z, w * x, w * y, w * z
    r = [[1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy)],
         [2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx)],
         [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy)]]
    return [[r[i][0] * scl[0], r[i][1] * scl[1], r[i][2] * scl[2], pos[i]] for i in range(3)] + [[0, 0, 0, 1]]


def mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


IDENTITY = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]


def normal_matrix(m):
    """Inverse transpose of the upper 3×3 (row-major)."""
    a = [row[:3] for row in m[:3]]
    det = (a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
           + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]))
    if abs(det) < 1e-12:
        return a, det
    inv = [[(a[(j + 1) % 3][(i + 1) % 3] * a[(j + 2) % 3][(i + 2) % 3] - a[(j + 1) % 3][(i + 2) % 3] * a[(j + 2) % 3][(i + 1) % 3]) / det
            for j in range(3)] for i in range(3)]
    return [[inv[j][i] for j in range(3)] for i in range(3)], det


def to_board(p):
    """Unity world → board space (x = col, y = row, z = up)."""
    return (p[0] - ANCHOR[0], p[1] - ANCHOR[1], -p[2])


# ---- scene walk ------------------------------------------------------------------------------------------------

class Scene:
    def __init__(self, env, scene_file):
        self.env = env
        self.tf, self.go, self.kids = {}, {}, {}
        self.objects = [o for o in env.objects if o.assets_file is scene_file]
        for o in self.objects:
            t = o.type.name
            if t in ('Transform', 'RectTransform'):
                d = o.read()
                self.tf[o.path_id] = d
            elif t == 'GameObject':
                self.go[o.path_id] = o.read()
        self._world, self._active = {}, {}
        self.map = {}
        self.hidden_of, self.hidden = hidden_sets(self)


    def parent(self, tid):
        f = self.tf[tid].m_Father
        return f.m_PathID if f and f.m_PathID and f.m_PathID in self.tf else 0

    def gameobject(self, tid):
        return self.go.get(self.tf[tid].m_GameObject.m_PathID)

    def world(self, tid):
        if tid in self._world:
            return self._world[tid]
        d = self.tf[tid]
        local = trs([d.m_LocalPosition.x, d.m_LocalPosition.y, d.m_LocalPosition.z],
                    [d.m_LocalRotation.x, d.m_LocalRotation.y, d.m_LocalRotation.z, d.m_LocalRotation.w],
                    [d.m_LocalScale.x, d.m_LocalScale.y, d.m_LocalScale.z])
        p = self.parent(tid)
        m = mul(self.world(p), local) if p else local
        self._world[tid] = m
        return m

    def active(self, tid):
        """(active in hierarchy, hidden-set key): a GameObject of a HIDDEN@n set (MapHiddenSettings, see
        hidden_sets) counts as active — the client switches those sets per phase — and tags its subtree."""
        if tid in self._active:
            return self._active[tid]
        g = self.gameobject(tid)
        key = self.hidden_of.get(self.tf[tid].m_GameObject.m_PathID)
        ok = bool(g and (g.m_IsActive or key))
        p = self.parent(tid)
        if ok and p:
            pok, pkey = self.active(p)
            ok, key = pok, key or pkey
        self._active[tid] = (ok, key)
        return ok, key

    def path(self, tid):
        names = []
        while tid:
            g = self.gameobject(tid)
            names.append(g.m_Name if g else '?')
            tid = self.parent(tid)
        return '/'.join(reversed(names))


def hidden_sets(sc):
    """The level's hidden sets (the MonoBehaviour with `_settings` + `_hideBakeOffset` on the level root): per key
    (HIDDEN@1 = left normal field, @2 = right normal field, @3 = boss field in 卫戍协议) the GameObjects the client
    hides while that part of the map is not in play (`items` subtrees + `playgroundItems` tile graphics). Saved
    inactive in the scene; shown by the client for the field(s) in play. Returns ({GameObject id: key},
    {key: {tiles: [r0, r1, c0, c1] | None, objects}}); the tile rect comes from the tile graphics' `_gridPos`."""
    of, info, grid = {}, {}, {}
    for o in sc.objects:
        if o.type.name != 'MonoBehaviour':
            continue
        try:
            t = o.read_typetree()
        except Exception:
            continue
        if '_gridPos' in t and isinstance(t.get('m_GameObject'), dict):
            grid[t['m_GameObject']['m_PathID']] = (t['_gridPos']['row'], t['_gridPos']['col'])
        if '_mapSettings' in t and isinstance(t['_mapSettings'], dict):
            ms = t['_mapSettings']
            sc.map = {'theme': ms.get('theme'), 'highlandHeight': _num(ms.get('highlandHeight', 0)),
                      'layerHeight': _num(ms.get('layerHeight', 0)), 'cameraView': ms.get('cameraView')}
        if '_settings' in t and '_hideBakeOffset' in t:
            for st in t['_settings']:
                key = st.get('key')
                if not key or not st.get('hide'):
                    continue
                for p in list(st.get('items') or []) + list(st.get('playgroundItems') or []):
                    pid = p.get('m_PathID')
                    obj = next((x for x in sc.objects if x.path_id == pid), None)
                    if obj is None:
                        continue
                    gid = pid if obj.type.name == 'GameObject' else obj.read().m_GameObject.m_PathID
                    of.setdefault(gid, key)
                info[key] = {'objects': len(st.get('items') or []) + len(st.get('playgroundItems') or [])}
    for key in info:
        cells = [grid[g] for g, k in of.items() if k == key and g in grid]
        info[key]['tiles'] = ([min(r for r, _ in cells), max(r for r, _ in cells), min(c for _, c in cells), max(c for _, c in cells)]
                              if cells else None)
    return of, info


def component(go, type_name):
    for c in go.m_Component:
        p = getattr(c, 'component', c)
        try:
            if p.type.name == type_name:
                return p.read()
        except Exception:
            continue
    return None


# ---- export ----------------------------------------------------------------------------------------------------

def loaded_cabs(env):
    return {n.split('.')[0] for f in env.files.values() for n in (getattr(f, 'files', None) or {})}


def load_stage_env(roots, index, stage):
    import UnityPy
    act = stage.split('_')[0]
    base = roots['pd'] / SCENE_DIR / act / f'level_{stage}'
    scene = base / f'level_{stage}.ab'
    if not scene.exists():
        return None, None
    files = [scene, base / f'level_{stage}' / 'lightingdata.ab', base / f'level_{stage}_lighting_settings.ab']
    env = UnityPy.load(*[str(f) for f in files if f.exists()])
    loaded = {str(f) for f in files}
    missing = set()
    for _ in range(4):  # externals of externals (theme → shaders)
        want = set()
        for f in list(env.files.values()):
            for sf in getattr(f, 'files', {}).values():
                for e in getattr(sf, 'externals', None) or []:
                    cab = e.path.split('/')[-1].split('.')[0]
                    if cab.startswith('CAB-'):
                        if cab in index and index[cab] not in loaded:
                            want.add(index[cab])
                        elif cab not in index and cab not in loaded_cabs(env):
                            missing.add(cab)
        if not want:
            break
        for w in sorted(want):
            try:
                env.load_file(w)
            except Exception as e:
                log(f'  warn dependency {w}: {e}')
            loaded.add(w)
    # the scene bundle holds CAB-<hash> (the scene: GameObjects, transforms, renderers) and CAB-<hash>.sharedAssets
    # (its meshes); the scene is the serialized file without an extension
    scene_file = None
    bundle = env.files.get(str(scene))
    for name, sf in (getattr(bundle, 'files', None) or {}).items():
        if '.' not in name and hasattr(sf, 'objects'):
            scene_file = sf
    deps = sorted(os.path.relpath(p, roots['pd'].parent.parent) for p in loaded)
    return (env, scene_file, deps, sorted(missing)), scene


def tex_format(tex):
    from UnityPy.enums import TextureFormat
    f = tex.m_TextureFormat
    try:
        return TextureFormat(f).name
    except ValueError:
        return str(f)


def derive_normal_dxt5nm(img):
    """RGB tangent-space normal map from Unity's DXT5nm packing (X in A, Y in G, R = 1): Z rebuilt per pixel."""
    from PIL import Image
    rgba = img.convert('RGBA')
    x, y = rgba.getchannel('A'), rgba.getchannel('G')
    table = _normal_z_table()
    z = bytes(table[(a << 8) | b] for a, b in zip(x.tobytes(), y.tobytes()))
    return Image.merge('RGB', (x, y, Image.frombytes('L', rgba.size, z)))


def texture_entry(tex, out_tex, kind, written, manifest):
    """Export a Texture2D once (by name) to scene/tex/; returns its file name. Normal maps become RGB tangent-space
    maps (BC5: X = R, Y = G; DXT5 = Unity's DXT5nm: X = A, Y = G), metallic/gloss maps three.js roughness maps."""
    name = re.sub(r'[^A-Za-z0-9_.\-]+', '_', tex.m_Name)
    fmt = tex_format(tex)
    derive = None
    if kind == 'normal':
        derive = 'normal_rg' if fmt in ('BC5', 'RG16') else 'normal_dxt5nm' if fmt in ('DXT5', 'DXT5Crunched', 'BC7') else None
    elif kind == 'gloss':
        derive = 'rough_from_gloss'
    fname = name + ('_rgb' if derive and derive.startswith('normal') else '_rough' if derive else '') + '.png'
    if fname not in written:
        img = tex.image
        if derive == 'normal_rg':
            img = derive_normal_rg(img)
        elif derive == 'normal_dxt5nm':
            img = derive_normal_dxt5nm(img)
        elif derive == 'rough_from_gloss':
            img = derive_rough_from_gloss(img)
        img.save(out_tex / fname)
        written[fname] = {'path': f'/assets/local/scene/tex/{fname}', 'w': img.width, 'h': img.height, 'kind': 'Texture2D',
                          'format': fmt, **({'derive': derive} if derive else {})}
        manifest.setdefault('scene/tex', {})[fname[:-4]] = written[fname]
    return fname


TEX_KIND = {'_BumpMap': 'normal', '_MetallicGlossMap': 'gloss'}


def export_stage(roots, index, stage, out_root, manifest, written):
    from UnityPy.helpers.MeshHelper import MeshHandler
    loaded, scene_path = load_stage_env(roots, index, stage)
    if not loaded:
        log(f'skip {stage}: no scene bundle')
        return False
    env, scene_file, deps, missing = loaded
    if scene_file is None:
        log(f'skip {stage}: scene file not found in bundle')
        return False
    sc = Scene(env, scene_file)
    out = out_root / 'scene' / stage
    out.mkdir(parents=True, exist_ok=True)
    out_tex = out_root / 'scene' / 'tex'
    out_tex.mkdir(parents=True, exist_ok=True)

    # lightmaps, render settings, lights
    lightmaps, settings, lights = [], {}, []
    for o in env.objects:
        t = o.type.name
        if t == 'LightmapSettings' and o.assets_file is scene_file:
            d = o.read()
            for i, lm in enumerate(d.m_Lightmaps):
                entry = {}
                for key, field in (('light', 'm_Lightmap'), ('dir', 'm_DirLightmap'), ('mask', 'm_ShadowMask')):
                    p = getattr(lm, field, None)
                    if p is None or not p.m_PathID:
                        continue
                    try:
                        tex = p.read()
                    except Exception as e:
                        log(f'  warn lightmap {i} {key}: {e}')
                        continue
                    img = tex.image
                    fname = f'lm{i}_{key}.png'
                    img.save(out / fname)
                    a = img.getchannel('A') if img.mode == 'RGBA' else None
                    entry[key] = {'file': fname, 'w': img.width, 'h': img.height,
                                  'format': tex_format(tex),
                                  'alpha': list(a.getextrema()) if a else None}
                    manifest.setdefault(f'scene/{stage}', {})[fname[:-4]] = {
                        'path': f'/assets/local/scene/{stage}/{fname}', 'w': img.width, 'h': img.height, 'kind': 'Lightmap'}
                lightmaps.append(entry)
            settings['lightmapsMode'] = getattr(d, 'm_LightmapsMode', None)
        elif t == 'RenderSettings' and o.assets_file is scene_file:
            d = o.read()
            col = lambda c: [_num(c.r), _num(c.g), _num(c.b), _num(c.a)]  # noqa: E731
            settings.update({'ambientMode': d.m_AmbientMode, 'ambientSky': col(d.m_AmbientSkyColor),
                             'ambientEquator': col(d.m_AmbientEquatorColor), 'ambientGround': col(d.m_AmbientGroundColor),
                             'ambientIntensity': _num(d.m_AmbientIntensity), 'fog': bool(d.m_Fog), 'fogColor': col(d.m_FogColor),
                             'fogMode': d.m_FogMode, 'fogStart': _num(d.m_LinearFogStart), 'fogEnd': _num(d.m_LinearFogEnd),
                             'fogDensity': _num(d.m_FogDensity), 'subtractiveShadow': col(d.m_SubtractiveShadowColor)})
        elif t == 'Light' and o.assets_file is scene_file:
            d = o.read()
            tid = d.m_GameObject.read().m_Component[0]
            tid = getattr(tid, 'component', tid).m_PathID
            if tid not in sc.tf:
                continue
            m = sc.world(tid)
            fwd = (m[0][2], m[1][2], m[2][2])  # Unity lights shine along +Z
            lights.append({'name': sc.gameobject(tid).m_Name, 'active': sc.active(tid) and bool(d.m_Enabled), 'type': d.m_Type,
                           'color': [_num(d.m_Color.r), _num(d.m_Color.g), _num(d.m_Color.b)], 'intensity': _num(d.m_Intensity),
                           'range': _num(getattr(d, 'm_Range', 0)), 'bake': getattr(d, 'm_Lightmapping', None),
                           'shadows': getattr(d.m_Shadows, 'm_Type', 0), 'shadowStrength': _num(getattr(d.m_Shadows, 'm_Strength', 1)),
                           'dir': [_num(fwd[0]), _num(fwd[1]), _num(-fwd[2])],
                           'pos': [_num(v) for v in to_board((m[0][3], m[1][3], m[2][3]))]})

    # renderers → groups
    meshes, groups, materials, skipped = {}, {}, {}, {'inactive': 0, 'noMesh': 0, 'disabled': 0}
    for o in sc.objects:
        if o.type.name != 'MeshRenderer':
            continue
        r = o.read()
        g = r.m_GameObject.read()
        tid = getattr(g.m_Component[0], 'component', g.m_Component[0]).m_PathID
        active, hkey = sc.active(tid) if tid in sc.tf else (False, None)
        if not active:
            skipped['inactive'] += 1
            continue
        if not r.m_Enabled:
            skipped['disabled'] += 1
            continue
        mf = component(g, 'MeshFilter')
        if not mf or not mf.m_Mesh.m_PathID:
            skipped['noMesh'] += 1
            continue
        key = (mf.m_Mesh.m_FileID, mf.m_Mesh.m_PathID)
        if key not in meshes:
            mesh = mf.m_Mesh.read()
            h = MeshHandler(mesh)
            h.process()
            meshes[key] = (mesh, h, h.get_triangles())
        mesh, h, tris = meshes[key]
        b = r.m_StaticBatchInfo
        batched = bool(b.subMeshCount)
        subs = list(range(b.firstSubMesh, b.firstSubMesh + b.subMeshCount)) if batched else list(range(len(tris)))
        m = IDENTITY if batched else sc.world(tid)
        nm, det = normal_matrix(m)
        so = r.m_LightmapTilingOffset
        so = (1.0, 1.0, 0.0, 0.0) if batched else (so.x, so.y, so.z, so.w)
        lmi = r.m_LightmapIndex if r.m_LightmapIndex < 0xFFFE else -1
        mats = list(r.m_Materials)
        for si, sub in enumerate(subs):
            if sub >= len(tris) or si >= len(mats) or not mats[si].m_PathID:
                continue
            try:
                mat = mats[si].read()
            except Exception as e:
                log(f'  warn {sc.path(tid)} material: {e}')
                continue
            mname = mat.m_Name
            if mname not in materials:
                info = material_info(mat)
                for k, tx in info['textures'].items():
                    try:
                        tex = next(e.m_Texture for kk, e in mat.m_SavedProperties.m_TexEnvs if kk == k).read()
                        tx['file'] = texture_entry(tex, out_tex, TEX_KIND.get(k), written, manifest)
                    except Exception as e:
                        log(f'  warn texture {mname}.{k}: {e}')
                materials[mname] = info
            grp = groups.setdefault((mname, lmi, hkey or ''), {'material': mname, 'lightmap': lmi, 'hidden': hkey, 'pos': [], 'nrm': [], 'uv0': [], 'uv1': [],
                                                    'col': [], 'idx': [], 'renderers': 0})
            grp['renderers'] += 1
            base_sub = mesh.m_SubMeshes[sub]
            bv = getattr(base_sub, 'baseVertex', 0) or 0
            remap = {}
            V, N, U0, U1, C = h.m_Vertices, h.m_Normals, h.m_UV0, h.m_UV1, h.m_Colors
            flip = det < 0  # a mirrored transform flips the winding once more
            for tri in tris[sub]:
                out_idx = []
                for vi in tri:
                    vi += bv
                    if vi not in remap:
                        remap[vi] = len(grp['pos']) // 3
                        p = V[vi]
                        wp = [m[i][0] * p[0] + m[i][1] * p[1] + m[i][2] * p[2] + m[i][3] for i in range(3)]
                        grp['pos'] += to_board(wp)
                        if N:
                            n = N[vi]
                            wn = [nm[i][0] * n[0] + nm[i][1] * n[1] + nm[i][2] * n[2] for i in range(3)]
                            ln = math.sqrt(sum(c * c for c in wn)) or 1.0
                            grp['nrm'] += (wn[0] / ln, wn[1] / ln, -wn[2] / ln)
                        else:
                            grp['nrm'] += (0.0, 0.0, 1.0)
                        u0 = U0[vi] if U0 else (0.0, 0.0)
                        grp['uv0'] += (u0[0], u0[1])
                        u1 = U1[vi] if U1 else u0
                        grp['uv1'] += (u1[0] * so[0] + so[2], u1[1] * so[1] + so[3])
                        c = C[vi] if C else (1.0, 1.0, 1.0, 1.0)
                        if any(x > 1.0 for x in c):
                            grp['col'] += tuple(int(x) & 255 for x in c[:4])
                        else:
                            grp['col'] += tuple(max(0, min(255, int(round(x * 255)))) for x in c[:4])
                    out_idx.append(remap[vi])
                # board space mirrors Unity's (z flipped): reverse the winding (and again for a mirrored transform)
                if flip:
                    grp['idx'] += out_idx
                else:
                    grp['idx'] += (out_idx[0], out_idx[2], out_idx[1])

    # write geometry
    out_groups, blob = [], bytearray()
    for (mname, lmi, _hk), grp in sorted(groups.items()):
        nv, ni = len(grp['pos']) // 3, len(grp['idx'])
        if not nv or not ni:
            continue
        rec = {'material': mname, 'lightmap': lmi, 'hidden': grp['hidden'], 'renderers': grp['renderers'], 'vertices': nv, 'indices': ni}
        for key, fmt, comps in (('pos', 'f', 3), ('nrm', 'f', 3), ('uv0', 'f', 2), ('uv1', 'f', 2), ('col', 'B', 4), ('idx', 'I', 1)):
            while len(blob) % 4:
                blob.append(0)
            data = grp[key]
            rec[key] = [len(blob), len(data)]
            blob += struct.pack(f'<{len(data)}{fmt}', *data)
        pos = grp['pos']
        rec['bounds'] = [[_num(min(pos[i::3]), 4) for i in range(3)], [_num(max(pos[i::3]), 4) for i in range(3)]]
        out_groups.append(rec)
    (out / 'geom.bin').write_bytes(bytes(blob))
    doc = {'version': 1, 'stage': stage, 'source': os.path.relpath(scene_path, roots['pd'].parent.parent),
           'dependencies': deps, 'unresolved': missing, 'space': 'board (x = col, y = row, z = up)',
           'vertexBytes': VERTEX_BYTES, 'settings': settings, 'lights': lights, 'lightmaps': lightmaps,
           'materials': dict(sorted(materials.items())), 'map': sc.map, 'hidden': sc.hidden, 'groups': out_groups, 'skipped': skipped,
           'stats': {'groups': len(out_groups), 'vertices': sum(g['vertices'] for g in out_groups),
                     'triangles': sum(g['indices'] for g in out_groups) // 3, 'bytes': len(blob)}}
    (out / 'scene.json').write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    grp_manifest = manifest.setdefault(f'scene/{stage}', {})
    grp_manifest['scene'] = {'path': f'/assets/local/scene/{stage}/scene.json', 'kind': 'Scene', 'groups': len(out_groups)}
    grp_manifest['geom'] = {'path': f'/assets/local/scene/{stage}/geom.bin', 'kind': 'Geometry', 'bytes': len(blob)}
    log(f'{stage}: {len(out_groups)} groups, {doc["stats"]["vertices"]} verts, {doc["stats"]["triangles"]} tris, '
        f'{len(blob) // 1024} KiB, {len(materials)} materials, {len(lightmaps)} lightmaps, skipped {skipped}'
        + (f', unresolved {missing}' if missing else ''))
    return True


def webp_modes(out_root):
    """scene/tex file names to encode lossy: textures some material samples as its colour map (_MainTex) and none
    samples as a data map."""
    colour, data = set(), set()
    for sj in sorted((Path(out_root) / 'scene').glob('*/scene.json')):
        try:
            doc = json.loads(sj.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            continue
        for m in (doc.get('materials') or {}).values():
            for slot, tx in (m.get('textures') or {}).items():
                if isinstance(tx, dict) and tx.get('file'):
                    (colour if slot == '_MainTex' else data).add(tx['file'])
    return colour - data


def apply_webp(out_root, groups, log):
    """Write a WebP copy next to every scene texture / lightmap PNG of the manifest groups scene/* and point the
    entries at it (`webp`: the mode). A Pillow without WebP support or a broken PNG keeps that entry's PNG."""
    from PIL import Image
    out_root = Path(out_root)
    lossy = webp_modes(out_root)
    n = 0
    for g, entries in groups.items():
        if not g.startswith('scene/') or not isinstance(entries, dict):
            continue
        for key, e in list(entries.items()):
            if not isinstance(e, dict) or e.get('kind') not in ('Texture2D', 'Lightmap') or not isinstance(e.get('path'), str):
                continue
            rel = e['path'][len('/assets/local/'):] if e['path'].startswith('/assets/local/') else None
            if not rel:
                continue
            png = (out_root / rel).with_suffix('.png')
            if not png.exists():  # a texture an earlier extraction listed (shared scene/tex group) and no stage writes now
                entries.pop(key)
                log(f'  drop {g}/{key}: no {png.name}')
                continue
            mode = 'lossy' if g == 'scene/tex' and png.name in lossy else 'lossless'
            dst = png.with_suffix('.webp')
            try:
                with Image.open(png) as img:
                    img.save(dst, 'WEBP', **WEBP_OPTIONS[mode])
            except Exception as ex:
                log(f'  warn webp {png.name}: {ex}')
                e.update(path='/assets/local/' + str(Path(rel).with_suffix('.png')))
                e.pop('webp', None)
                continue
            e.update(path='/assets/local/' + str(Path(rel).with_suffix('.webp')), webp=mode)
            n += 1
    log(f'webp: {n} copies ({sum(1 for g in groups if g.startswith("scene/"))} groups)')
    return n


def write_manifest(mpath, groups_update, log):
    doc = json.loads(mpath.read_text(encoding='utf-8')) if mpath.exists() else {'version': 1, 'source': 'local-client', 'groups': {}}
    groups = doc.setdefault('groups', {})
    groups_update(groups)
    doc['groups'] = dict(sorted(groups.items()))
    doc['count'] = sum(len(v) for v in groups.values())
    mpath.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    log(f'manifest {mpath} ({doc["count"]} entries)')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--client', default=DEFAULT_CLIENT, help='…/Arknights_Data of the client')
    ap.add_argument('--stage', action='append', default=[], help='stage id (repeatable); default: every stage with a scene')
    ap.add_argument('--out', default=str(ROOT / 'public/assets/local'))
    ap.add_argument('--manifest', default=str(ROOT / 'data/local-assets.json'))
    ap.add_argument('--index', default=str(ROOT.parent / 'logs/scene-cab-index.json'), help='CAB index cache')
    ap.add_argument('--rebuild-index', action='store_true')
    ap.add_argument('--no-webp', action='store_true', help='keep the manifest on the PNGs (no WebP copies)')
    ap.add_argument('--webp', action='store_true',
                    help='only write the WebP copies of the scene art already under --out and list them (no client)')
    args = ap.parse_args()
    mpath = Path(args.manifest)
    out_root = Path(args.out)
    if args.webp:
        if not mpath.exists():
            print(f'no manifest at {mpath}: extract the scenes first', file=sys.stderr)
            return 2
        n = [0]
        write_manifest(mpath, lambda groups: n.__setitem__(0, apply_webp(out_root, groups, log)), log)
        return 0 if n[0] else 1

    import aklz4  # noqa: F401  (registers the LZ4AK decoder)
    roots = bundle_roots(args.client)
    if not roots['pd'].is_dir():
        print(f'no client at {args.client}', file=sys.stderr)
        return 2
    cache = Path(args.index)
    index = build_index(roots, cache) if args.rebuild_index or not cache.exists() else json.loads(cache.read_text(encoding='utf-8'))
    stages = args.stage or sorted(p.name[len('level_'):] for p in (roots['pd'] / SCENE_DIR).glob('act*autochess/level_*')
                                  if p.is_dir() and STAGE_RE.match(p.name[len('level_'):]))
    manifest, written, ok = {}, {}, 0
    for stage in stages:
        try:
            ok += export_stage(roots, index, stage, out_root, manifest, written)
        except Exception as e:  # one broken stage keeps the others
            import traceback
            traceback.print_exc()
            log(f'FAIL {stage}: {e}')

    def update(groups):
        for k, v in manifest.items():
            groups[k] = {**groups.get(k, {}), **v} if k == 'scene/tex' else v
        if not args.no_webp:
            apply_webp(out_root, groups, log)
    write_manifest(mpath, update, log)
    log(f'done: {ok}/{len(stages)} stages')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
