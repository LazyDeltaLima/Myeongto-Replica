#!/usr/bin/env python3
"""Export the official per-stage 3D board scenes of 卫戍协议 from a local Arknights client (docs/local/official-scenes.md).

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
  scene/<stageId>/geom.bin     per group, quantized (scene.json version 2, GEOM_VERSION): position u16×3 on one grid
                               for the whole scene (quant.pos), normal i8×4, uv0 / uv1 u16×2 on the group's own
                               range (q.uv0 / q.uv1), colour u8×4 (or one colConst for the group), index u16 / u32
                               (idxType); pos / uv1 / idx delta + zigzag + byte-shuffled (quant.dzs: same size, gzip
                               ≈ 2.8× smaller). Version 1 was f32 everywhere and index u32 (official.js reads both)
  scene/<stageId>/lm*.png      lightmaps (comp_light, RGBM-encoded) and shadowmasks
  scene.json reflection        the reflection the statics sample (scene_reflection: mean colour per cube face of the
                               island's ReflectionProbe, else the generated skybox reflection; RGBM 5·a·rgb, gamma)
  scene/tex/<name>.png         theme textures (shared by stages; BC5 normal maps get Z rebuilt, gloss maps → roughness)
and the manifest groups scene/<stageId> + scene/tex in data/local-assets.json. Like extract.py's board textures
(WEBP, upstream #186), every texture and lightmap also gets a WebP copy next to its PNG and the manifest lists the
copy: colour maps (a material's _MainTex only) lossy at quality 95, everything else lossless — normal / roughness /
emission maps hold per-channel data, and the RGBM lightmaps keep their range in A (≈ 43 → 28 MB for the 11 stages).

规程 (act3autochess, the CN client): the stage scene holds no geometry; three level prefabs per stage are cut into the
19×21 frame of tools/level-fields.mjs (FRAME_PIECES, export_stage_pieces), textures under scene/tex/cn/.

Usage (WSL, the EN client on D:):
  .venv-extract/bin/python tools/local-extract/scene_extract.py [--client <…/Arknights_Data>]
      [--stage act2autochess_m04 ...] [--rebuild-index] [--no-webp]
  .venv-extract/bin/python tools/local-extract/scene_extract.py --cn --stage act3autochess_m01 ...   (the CN client)
  .venv-extract/bin/python tools/local-extract/scene_extract.py --webp    (only the WebP copies, from the PNGs already
      under --out — e.g. scene art copied to a server; needs Pillow, not the client)
  .venv-extract/bin/python tools/local-extract/scene_extract.py --reflections    (only add scene.json reflection to the
      scenes already under --out; needs the client, leaves geometry and textures alone)
  python3 tools/local-extract/scene_extract.py --requantize    (rewrite version-1 geom.bin / scene.json under --out in
      the quantized version 2 and update the manifest's geom bytes; plain Python, no client)
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
from client_path import client_data, client_data_cn  # noqa: E402
DEFAULT_CLIENT = client_data()  # SP_CLIENT / .env / .client (client_path.py); --client overrides
# CAB → bundle index of the bundles a stage scene can depend on (scanned once, cached: --rebuild-index)
INDEX_DIRS = [
    ('pd', 'arts/maps'), ('pd', 'battle/[pack]common.ab'), ('pd', 'shaders'), ('pd', '[uc]shaders.ab'),
    ('sa', 'arts/maps'), ('sa', 'arts/[pack]common.ab'), ('sa', 'shaders'), ('sa', '[uc]shaders.ab'), ('sa', 'graphics'),
]
SCENE_DIR = 'scenes/activities'
STAGE_RE = re.compile(r'^act\d+autochess_m\d+$')
# Unity anchor of tile (0,0) (BATTLE/GAME/Map/Anchor)
ANCHOR = (-10.0, -9.0, 0.0)
# geom.bin version 2 (quantized): position u16×3, normal i8×4, uv0 u16×2, uv1 u16×2, colour u8×4 (11 stages: 37.2 → 18.2 MB,
# gzip 10.8 → 3.8 MB; version 1: f32 + u32 indices)
GEOM_VERSION = 2
VERTEX_BYTES = 2 * 3 + 4 + 2 * 2 + 2 * 2 + 4
Q16 = 65535


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


def to_board(p, anchor=ANCHOR):
    """Unity world → board space (x = col, y = row, z = up). A level prefab (规程) has its tile (0,0) at its root: anchor 0."""
    return (p[0] - anchor[0], p[1] - anchor[1], -p[2])


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
            # 2026-11-11: the level's camera effect (MapGraphic `_effectSettings.cameraEffect`: 规程's ice stages'
            # screen_ICEWILD_frost_01; render/fxgame.js setStageCamera) — written only when set
            cam = (t.get('_effectSettings') or {}).get('cameraEffect') if isinstance(t.get('_effectSettings'), dict) else None
            if cam:
                sc.map['cameraEffect'] = cam
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
    """Export a Texture2D once (by name) to scene/tex/ (scene/tex/<TEX_SUBDIR>/ for the CN client); returns its file name
    relative to scene/tex. Normal maps become RGB tangent-space maps (BC5: X = R, Y = G; DXT5 = Unity's DXT5nm: X = A,
    Y = G), metallic/gloss maps three.js roughness maps."""
    name = (f'{TEX_SUBDIR}/' if TEX_SUBDIR else '') + re.sub(r'[^A-Za-z0-9_.\-]+', '_', tex.m_Name)
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
        (out_tex / fname).parent.mkdir(parents=True, exist_ok=True)
        img.save(out_tex / fname)
        written[fname] = {'path': f'/assets/local/scene/tex/{fname}', 'w': img.width, 'h': img.height, 'kind': 'Texture2D',
                          'format': fmt, **({'derive': derive} if derive else {})}
        manifest.setdefault('scene/tex', {})[fname[:-4]] = written[fname]
    return fname


TEX_KIND = {'_BumpMap': 'normal', '_MetallicGlossMap': 'gloss'}
# The textures of a CN client run go to scene/tex/cn/ (main sets it): the two clients ship same-named theme textures that
# differ (another compression, and TX_Survivaloasis_E has a region of its own), and one run must not replace the textures
# the other client's scenes were extracted and checked with.
TEX_SUBDIR = ''


def cubemap_faces(cube):
    """Mean colour per face of a baked reflection cubemap (mip 0), in board order +x −x +y −y +z −z (board z = Unity
    −Z). RGBM-encoded faces (Texture2D m_LightmapFormat 5) decode the gamma way, 5 · a · rgb — the client is a
    Gamma-space project. None for a format not handled here (DXT5 and RGBA32 are)."""
    import texture2ddecoder
    raw = cube.get_image_data()
    w, fmt = cube.m_Width, cube.m_TextureFormat
    if not raw or fmt not in (4, 12):
        return None
    per = len(raw) // 6
    rgbm = getattr(cube, 'm_LightmapFormat', 0) == 5
    faces = []
    for f in range(6):
        if fmt == 12:  # DXT5 → BGRA
            px = texture2ddecoder.decode_bc3(raw[f * per:f * per + w * w], w, w)
            order = (2, 1, 0, 3)
        else:  # RGBA32
            px = raw[f * per:f * per + w * w * 4]
            order = (0, 1, 2, 3)
        acc = [0.0, 0.0, 0.0]
        for i in range(0, w * w * 4, 4):
            m = 5.0 * px[i + order[3]] / 255.0 if rgbm else 1.0
            for c in range(3):
                acc[c] += px[i + order[c]] / 255.0 * m
        faces.append([_num(a / (w * w), 4) for a in acc])
    return [faces[i] for i in (0, 1, 2, 3, 5, 4)]


def scene_reflection(env, scene_file):
    """The reflection the scene's static renderers sample: an enabled baked ReflectionProbe of the scene (the
    autochess ones box the whole island), else RenderSettings' generated skybox reflection × m_ReflectionIntensity.
    {source, intensity, faces} (cubemap_faces) or None."""
    probe, sky = None, None
    for o in env.objects:
        if o.assets_file is not scene_file:
            continue
        t = o.type.name
        if t == 'ReflectionProbe' and probe is None:
            tt = o.read_typetree()
            if tt.get('m_Enabled', 1) and tt.get('m_BakedTexture', {}).get('m_PathID'):
                intensity = tt.get('m_IntensityMultiplier', tt.get('m_Intensity', 1.0))
                probe = (tt['m_BakedTexture']['m_PathID'], 1.0 if intensity is None else intensity)
        elif t == 'RenderSettings':
            tt = o.read_typetree()
            if tt.get('m_DefaultReflectionMode', 0) == 0:
                sky = (tt['m_GeneratedSkyboxReflection']['m_PathID'], tt.get('m_ReflectionIntensity', 1.0))
            elif tt.get('m_CustomReflection', {}).get('m_PathID'):
                sky = (tt['m_CustomReflection']['m_PathID'], tt.get('m_ReflectionIntensity', 1.0))
    for kind, ref in (('probe', probe), ('sky', sky)):
        if not ref:
            continue
        pid, intensity = ref
        cube = next((o for o in env.objects if o.path_id == pid and o.type.name == 'Cubemap'), None)
        if cube is None:
            continue
        d = cube.read()
        faces = cubemap_faces(d)
        if faces:
            return {'source': d.m_Name, 'kind': kind, 'intensity': _num(intensity, 4), 'faces': faces,
                    'decode': 'RGBM 5·a·rgb (gamma)' if getattr(d, 'm_LightmapFormat', 0) == 5 else 'rgb'}
    return None


def save_lightmap(tex, out, stage, fname, manifest):
    """Write one lightmap / shadowmask texture to scene/<stage>/<fname>; returns its scene.json entry."""
    img = tex.image
    img.save(out / fname)
    a = img.getchannel('A') if img.mode == 'RGBA' else None
    manifest.setdefault(f'scene/{stage}', {})[fname[:-4]] = {
        'path': f'/assets/local/scene/{stage}/{fname}', 'w': img.width, 'h': img.height, 'kind': 'Lightmap'}
    return {'file': fname, 'w': img.width, 'h': img.height, 'format': tex_format(tex), 'alpha': list(a.getextrema()) if a else None}


def render_settings(d):
    col = lambda c: [_num(c.r), _num(c.g), _num(c.b), _num(c.a)]  # noqa: E731
    return {'ambientMode': d.m_AmbientMode, 'ambientSky': col(d.m_AmbientSkyColor),
            'ambientEquator': col(d.m_AmbientEquatorColor), 'ambientGround': col(d.m_AmbientGroundColor),
            'ambientIntensity': _num(d.m_AmbientIntensity), 'fog': bool(d.m_Fog), 'fogColor': col(d.m_FogColor),
            'fogMode': d.m_FogMode, 'fogStart': _num(d.m_LinearFogStart), 'fogEnd': _num(d.m_LinearFogEnd),
            'fogDensity': _num(d.m_FogDensity), 'subtractiveShadow': col(d.m_SubtractiveShadowColor)}


def light_entry(sc, d, dy=0.0, anchor=ANCHOR):
    """scene.json record of a Light component (board space; `dy` = rows the piece holding it moved up), or None."""
    tid = d.m_GameObject.read().m_Component[0]
    tid = getattr(tid, 'component', tid).m_PathID
    if tid not in sc.tf:
        return None
    m = sc.world(tid)
    fwd = (m[0][2], m[1][2], m[2][2])  # Unity lights shine along +Z
    pos = to_board((m[0][3], m[1][3], m[2][3]), anchor)
    return {'name': sc.gameobject(tid).m_Name, 'active': sc.active(tid) and bool(d.m_Enabled), 'type': d.m_Type,
            'color': [_num(d.m_Color.r), _num(d.m_Color.g), _num(d.m_Color.b)], 'intensity': _num(d.m_Intensity),
            'range': _num(getattr(d, 'm_Range', 0)), 'bake': getattr(d, 'm_Lightmapping', None),
            'shadows': getattr(d.m_Shadows, 'm_Type', 0), 'shadowStrength': _num(getattr(d.m_Shadows, 'm_Strength', 1)),
            'dir': [_num(fwd[0]), _num(fwd[1]), _num(-fwd[2])],
            'pos': [_num(pos[0]), _num(pos[1] + dy), _num(pos[2])]}


# ---- 规程 (act3autochess): the battlefield comes as three level prefabs ----------------------------------------

LEVEL_PREFAB_DIR = 'battle/prefabs/levelprefabs/activities'
INF = 1e9
# 规程's stage scene (scenes/activities/act3autochess/level_<stage>.ab) holds only the tile objects of the 36×55 logic map
# and one renderer; what the battle draws is three level prefabs, one per sub-level (battle/prefabs/levelprefabs/
# activities/act3autochess/level_<stage>/level_<stage>_sub_0N): the meshes of the theme, their own lightmap and
# shadowmask (PrefabLightmapData: per renderer its lightmap index and scale / offset), the main light. A prefab's space
# is its sub-level's tiles: tile (r, c) at (x = c, y = r, z = −height) from the prefab root, so board = (x, y, −z).
# They are put together the way tools/level-fields.mjs STAGE_PIECES puts the sub-levels' tiles into the 19×21 frame the
# sim reads, each piece with the island around it: (sub index, [x0, x1, y0, y1] of the prefab's board space — tile
# edges at ±½, INF = open — and the rows it moves up). sub_03 rows ≤ 6 (the boss field and everything below it) stay;
# sub_03 rows ≥ 7 (the enemy preview area and everything above it) go up 7 (frame 14–18); sub_01 rows 0–6 cols ≤ 10
# (the own field, its hand rows and the island left of it) go up 7 (frame 7–13); sub_02 cols ≥ 11 rows −1…5 (the right-
# hand field and the island right of it) go up 8 — frame row 7 cols 11–20 is no sub-level's tile in the sim's frame, so
# the prefab's row below its hand row fills it. Triangles crossing a cut are clipped (attributes interpolated).
PREFAB_ANCHOR = (0.0, 0.0, 0.0)
FRAME_PIECES = (
    (2, (-INF, INF, -INF, 6.5), 0),
    (2, (-INF, INF, 6.5, INF), 7),
    (0, (-INF, 10.5, -0.5, 6.5), 7),
    (1, (10.5, INF, -1.5, 5.5), 8),
)


def piece_paths(roots, stage):
    """The three level prefabs of a stage built from them (规程), else None."""
    act = stage.split('_')[0]
    out = []
    for n in (1, 2, 3):
        rel = Path(LEVEL_PREFAB_DIR) / act / f'level_{stage}' / f'level_{stage}_sub_{n:02d}' / f'level_{stage}_sub_{n:02d}.ab'
        p = next((roots[k] / rel for k in ('pd', 'sa') if (roots[k] / rel).is_file()), None)
        if p is None:
            return None
        out.append(p)
    return out


def _lerp_vertex(a, b, t):
    v = [x + (y - x) * t for x, y in zip(a, b)]
    ln = math.sqrt(v[3] * v[3] + v[4] * v[4] + v[5] * v[5]) or 1.0
    v[3], v[4], v[5] = v[3] / ln, v[4] / ln, v[5] / ln
    return tuple(v)


def clip_rect(poly, rect):
    """Sutherland–Hodgman: the part of a convex polygon of vertex records (x, y first) inside rect [x0, x1, y0, y1]
    (an edge at ±INF is open). The vertex order (and so the winding) is kept."""
    for axis, lim, low in ((0, rect[0], True), (0, rect[1], False), (1, rect[2], True), (1, rect[3], False)):
        if abs(lim) >= INF or not poly:
            continue
        out = []
        for i, a in enumerate(poly):
            b = poly[(i + 1) % len(poly)]
            da = a[axis] - lim if low else lim - a[axis]
            db = b[axis] - lim if low else lim - b[axis]
            if da >= 0:
                out.append(a)
            if (da >= 0) != (db >= 0):
                out.append(_lerp_vertex(a, b, da / (da - db)))
        poly = out
    return poly


# ---- renderers → draw groups -----------------------------------------------------------------------------------

def bake_renderers(sc, ctx, lm_of=None, lm_base=0, pieces=None, anchor=ANCHOR):
    """Bake the active MeshRenderers of `sc` into ctx['groups'] (per material, lightmap, hidden key), in board space.
    `lm_of`: renderer path id → (lightmap index, (sx, sy, ox, oy)) for a prefab (PrefabLightmapData), its indices offset
    by `lm_base`; else the renderer's own m_LightmapIndex / m_LightmapTilingOffset (a scene). `pieces`: [(rect, dy)] —
    only the parts of the triangles inside each rect (prefab board space), moved up dy rows (FRAME_PIECES); None = all.
    `anchor`: Unity position of tile (0,0) (the scenes' Map/Anchor; a level prefab's root, PREFAB_ANCHOR)."""
    from UnityPy.helpers.MeshHelper import MeshHandler
    meshes, groups, materials, skipped = ctx['meshes'], ctx['groups'], ctx['materials'], ctx['skipped']
    pieces = pieces or [(None, 0.0)]
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
        key = (id(sc), mf.m_Mesh.m_FileID, mf.m_Mesh.m_PathID)
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
        if lm_of is not None:
            lmi, so = lm_of.get(o.path_id, (-1, (1.0, 1.0, 0.0, 0.0)))
            lmi = lmi + lm_base if lmi >= 0 else -1
        else:
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
                        tx['file'] = texture_entry(tex, ctx['out_tex'], TEX_KIND.get(k), ctx['written'], ctx['manifest'])
                    except Exception as e:
                        log(f'  warn texture {mname}.{k}: {e}')
                materials[mname] = info
            grp = groups.setdefault((mname, lmi, hkey or ''), {'material': mname, 'lightmap': lmi, 'hidden': hkey, 'pos': [], 'nrm': [], 'uv0': [], 'uv1': [],
                                                    'col': [], 'idx': [], 'renderers': 0})
            grp['renderers'] += 1
            base_sub = mesh.m_SubMeshes[sub]
            bv = getattr(base_sub, 'baseVertex', 0) or 0
            V, N, U0, U1, C = h.m_Vertices, h.m_Normals, h.m_UV0, h.m_UV1, h.m_Colors
            flip = det < 0  # a mirrored transform flips the winding once more
            recs = {}

            def rec(vi):
                """Vertex record (board pos 3, normal 3, uv0 2, uv1 2, colour 4 as 0–255)."""
                if vi in recs:
                    return recs[vi]
                p = V[vi]
                wp = to_board([m[i][0] * p[0] + m[i][1] * p[1] + m[i][2] * p[2] + m[i][3] for i in range(3)], anchor)
                if N:
                    n = N[vi]
                    wn = [nm[i][0] * n[0] + nm[i][1] * n[1] + nm[i][2] * n[2] for i in range(3)]
                    ln = math.sqrt(sum(c * c for c in wn)) or 1.0
                    nn = (wn[0] / ln, wn[1] / ln, -wn[2] / ln)
                else:
                    nn = (0.0, 0.0, 1.0)
                u0 = U0[vi] if U0 else (0.0, 0.0)
                u1 = U1[vi] if U1 else u0
                c = C[vi] if C else (1.0, 1.0, 1.0, 1.0)
                cc = tuple(int(x) & 255 for x in c[:4]) if any(x > 1.0 for x in c) else tuple(max(0, min(255, int(round(x * 255)))) for x in c[:4])
                recs[vi] = (wp[0], wp[1], wp[2], *nn, u0[0], u0[1], u1[0] * so[0] + so[2], u1[1] * so[1] + so[3], *cc)
                return recs[vi]

            def emit(v, dy):
                grp['pos'] += (v[0], v[1] + dy, v[2])
                grp['nrm'] += v[3:6]
                grp['uv0'] += v[6:8]
                grp['uv1'] += v[8:10]
                grp['col'] += tuple(max(0, min(255, int(round(x)))) for x in v[10:14])
                return len(grp['pos']) // 3 - 1

            def tri_out(ids):
                # board space mirrors Unity's (z flipped): reverse the winding (and again for a mirrored transform)
                grp['idx'] += ids if flip else (ids[0], ids[2], ids[1])

            for rect, dy in pieces:
                remap = {}
                for tri in tris[sub]:
                    vis = [vi + bv for vi in tri]
                    vs = [rec(vi) for vi in vis]
                    if rect is not None:
                        xs, ys = [v[0] for v in vs], [v[1] for v in vs]
                        if max(xs) <= rect[0] or min(xs) >= rect[1] or max(ys) <= rect[2] or min(ys) >= rect[3]:
                            continue
                        if not (min(xs) >= rect[0] and max(xs) <= rect[1] and min(ys) >= rect[2] and max(ys) <= rect[3]):
                            poly = clip_rect(vs, rect)
                            if len(poly) < 3:
                                continue
                            ids = [emit(v, dy) for v in poly]
                            for k in range(1, len(ids) - 1):
                                tri_out((ids[0], ids[k], ids[k + 1]))
                            continue
                    out_idx = []
                    for vi, v in zip(vis, vs):
                        if vi not in remap:
                            remap[vi] = emit(v, dy)
                        out_idx.append(remap[vi])
                    tri_out(out_idx)


def write_scene(out, stage, ctx, doc, manifest):
    """geom.bin + scene.json of the groups in ctx; `doc` = the scene.json fields besides the geometry. Returns the doc."""
    out_groups, packed = [], []
    for (mname, lmi, _hk), grp in sorted(ctx['groups'].items()):
        nv, ni = len(grp['pos']) // 3, len(grp['idx'])
        if not nv or not ni:
            continue
        rec = {'material': mname, 'lightmap': lmi, 'hidden': grp['hidden'], 'renderers': grp['renderers'], 'vertices': nv, 'indices': ni}
        pos = grp['pos']
        rec['bounds'] = [[_num(min(pos[i::3]), 4) for i in range(3)], [_num(max(pos[i::3]), 4) for i in range(3)]]
        out_groups.append(rec)
        packed.append((rec, grp))
    blob, quant = pack_geometry(packed)
    (out / 'geom.bin').write_bytes(bytes(blob))
    doc = {'version': GEOM_VERSION, 'stage': stage, 'space': 'board (x = col, y = row, z = up)',
           'vertexBytes': VERTEX_BYTES, 'quant': quant, **doc,
           'materials': dict(sorted(ctx['materials'].items())), 'groups': out_groups, 'skipped': ctx['skipped'],
           'stats': {'groups': len(out_groups), 'vertices': sum(g['vertices'] for g in out_groups),
                     'triangles': sum(g['indices'] for g in out_groups) // 3, 'bytes': len(blob)}}
    (out / 'scene.json').write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    grp_manifest = manifest.setdefault(f'scene/{stage}', {})
    grp_manifest['scene'] = {'path': f'/assets/local/scene/{stage}/scene.json', 'kind': 'Scene', 'groups': len(out_groups)}
    grp_manifest['geom'] = {'path': f'/assets/local/scene/{stage}/geom.bin', 'kind': 'Geometry', 'bytes': len(blob)}
    log(f'{stage}: {len(out_groups)} groups, {doc["stats"]["vertices"]} verts, {doc["stats"]["triangles"]} tris, '
        f'{len(blob) // 1024} KiB, {len(ctx["materials"])} materials, {len(doc["lightmaps"])} lightmaps, skipped {ctx["skipped"]}'
        + (f', unresolved {doc["unresolved"]}' if doc.get('unresolved') else ''))
    return doc


def new_ctx(out_root, manifest, written):
    out_tex = out_root / 'scene' / 'tex'
    out_tex.mkdir(parents=True, exist_ok=True)
    return {'meshes': {}, 'groups': {}, 'materials': {}, 'skipped': {'inactive': 0, 'noMesh': 0, 'disabled': 0},
            'out_tex': out_tex, 'written': written, 'manifest': manifest}


def export_stage(roots, index, stage, out_root, manifest, written):
    loaded, scene_path = load_stage_env(roots, index, stage)
    if not loaded:
        log(f'skip {stage}: no scene bundle')
        return False
    env, scene_file, deps, missing = loaded
    if scene_file is None:
        log(f'skip {stage}: scene file not found in bundle')
        return False
    pieces = piece_paths(roots, stage)
    if pieces:
        return export_stage_pieces(roots, index, stage, out_root, manifest, written, (env, scene_file, deps, missing), scene_path, pieces)
    sc = Scene(env, scene_file)
    out = out_root / 'scene' / stage
    out.mkdir(parents=True, exist_ok=True)

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
                    entry[key] = save_lightmap(tex, out, stage, f'lm{i}_{key}.png', manifest)
                lightmaps.append(entry)
            settings['lightmapsMode'] = getattr(d, 'm_LightmapsMode', None)
        elif t == 'RenderSettings' and o.assets_file is scene_file:
            settings.update(render_settings(o.read()))
        elif t == 'Light' and o.assets_file is scene_file:
            e = light_entry(sc, o.read())
            if e:
                lights.append(e)

    ctx = new_ctx(out_root, manifest, written)
    bake_renderers(sc, ctx)
    write_scene(out, stage, ctx, {
        'source': os.path.relpath(scene_path, roots['pd'].parent.parent), 'dependencies': deps, 'unresolved': missing,
        'settings': settings, 'lights': lights, 'lightmaps': lightmaps, 'reflection': scene_reflection(env, scene_file),
        'map': sc.map, 'hidden': sc.hidden}, manifest)
    return True


def export_stage_pieces(roots, index, stage, out_root, manifest, written, loaded, scene_path, paths):
    """A 规程 stage (FRAME_PIECES): the stage scene for the render settings and the reflection, the three level prefabs
    for the meshes, lightmaps and lights."""
    env, scene_file, deps, missing = loaded
    out = out_root / 'scene' / stage
    out.mkdir(parents=True, exist_ok=True)
    settings = {}
    for o in env.objects:
        if o.assets_file is scene_file and o.type.name == 'RenderSettings':
            settings.update(render_settings(o.read()))
        elif o.assets_file is scene_file and o.type.name == 'LightmapSettings':
            settings['lightmapsMode'] = getattr(o.read(), 'm_LightmapsMode', None)
    reflection = scene_reflection(env, scene_file)
    game = roots['pd'].parent.parent
    sources, all_deps, lightmaps, lights, the_map = [os.path.relpath(scene_path, game)], set(deps), [], [], {}
    ctx = new_ctx(out_root, manifest, written)
    for si, path in enumerate(paths):
        penv, ploaded = _load_with_deps(index, path)
        bundle = penv.files.get(str(path))
        pfile = next((sf for name, sf in (getattr(bundle, 'files', None) or {}).items() if '.' not in name and hasattr(sf, 'objects')), None)
        if pfile is None:
            log(f'skip {stage}: no prefab file in {path.name}')
            return False
        sources.append(os.path.relpath(path, game))
        all_deps |= {os.path.relpath(p, game) for p in ploaded}
        sc = Scene(penv, pfile)
        the_map = the_map or sc.map
        rects = [(rect, float(dy)) for sub, rect, dy in FRAME_PIECES if sub == si]
        # PrefabLightmapData: the prefab's lightmaps / shadowmasks and per renderer its index and scale / offset
        lm_of, base = {}, len(lightmaps)
        for o in sc.objects:
            if o.type.name != 'MonoBehaviour':
                continue
            try:
                t = o.read_typetree()
            except Exception:
                continue
            if 'm_RendererInfo' not in t:
                continue
            for i, ref in enumerate(t.get('m_Lightmaps') or []):
                entry = {}
                masks = t.get('m_ShadowMasks') or []
                for key, pref in (('light', ref), ('mask', masks[i] if i < len(masks) else None)):
                    obj = next((x for x in sc.objects if pref and x.path_id == pref.get('m_PathID')), None)
                    if obj is not None:
                        entry[key] = save_lightmap(obj.read(), out, stage, f'lm{base + i}_{key}.png', manifest)
                lightmaps.append(entry)
            for ri in t['m_RendererInfo']:
                s = ri['lightmapOffsetScale']
                lm_of[ri['renderer']['m_PathID']] = (ri['lightmapIndex'], (s['x'], s['y'], s['z'], s['w']))
        for o in sc.objects:
            if o.type.name == 'Light':
                dy = rects[0][1] if rects else 0.0
                e = light_entry(sc, o.read(), dy, PREFAB_ANCHOR)
                if e:
                    e['piece'] = si + 1
                    lights.append(e)
        bake_renderers(sc, ctx, lm_of=lm_of, lm_base=base, pieces=rects, anchor=PREFAB_ANCHOR)
    write_scene(out, stage, ctx, {
        'source': sources[0], 'pieces': [{'source': s, 'rects': [[None if abs(v) >= INF else v for v in rect] + [dy]
                                                                  for sub, rect, dy in FRAME_PIECES if sub == i]}
                                         for i, s in enumerate(sources[1:])],
        'dependencies': sorted(all_deps), 'unresolved': missing, 'settings': settings, 'lights': lights,
        'lightmaps': lightmaps, 'reflection': reflection, 'map': the_map, 'hidden': {}}, manifest)
    return True


# ---- devices (runtime prefabs on top of the scene) -------------------------------------------------------------

# The client instantiates the mode's devices (tiles' traps) from the level data on top of the scene: the scene only
# holds their sockets (the 射击台 tiles show an empty frame / a zigzag mark without them). Their prefabs live in the
# battle token packs (pkgrps/btl_pfb_tokens_*.ab: <key>/Graphic/Mesh/<key> MeshRenderer), their meshes / textures in
# arts/maps/common/trap/trap_*.ab. Lit at run time (no lightmap): the stage's main light, ambient and reflection.
# 阻隔工事, 射击台, 特制水上平台 (战场#05's water platforms: Graphic/boat + a shadow quad, in btl_pfb_tokens_0.ab). 封印的地面
# (trap_1107_acblock, 战场#06) is not listed: its prefab has no renderer at all (Graphic is empty; it only sets the tile's
# buildable / passable options and destroys itself), so the client draws nothing for it on the scene either.
# 土石结构 (trap_032_mound, 战场#06): Graphic/Mesh/S_desert_wall/S_desert_wall_01 holds the wall's nine pieces (Unlit/Texture;
# the legacy Animation `Wall06` breaks them apart on Die, which the m06 mounds never reach).
# 盐坨子炮 (trap_196_cnnon, 规程 m10; EN btl_pfb_tokens_2.ab): Graphic/Mesh/trap_196_cnnon, one mesh, its barrel toward −row
# (the prefab's FixedMuzzle at y −0.14) — the way the four m10 cannons face (DOWN).
# 赘生甲壳 (trap_156_dsshell, 规程's 微核沉积者 leaves it where it falls — a runtime device; EN btl_pfb_tokens_1.ab):
# Graphic/Mesh/trap_156_dsshell/group1/Part1..10 (MultiMeshTileGraphic), its MeshAnimator's Die = the legacy clip Break.
DEVICE_KEYS = ('trap_1105_accrate', 'trap_1106_achplat', 'trap_040_canoe', 'trap_032_mound', 'trap_196_cnnon', 'trap_156_dsshell')
DEVICE_PACKS = 'pkgrps/btl_pfb_tokens_*.ab'
# Effect meshes a device always wears, extracted into its model: (effect bundle, prefab, the device's point it is created
# at). The m06 mounds start strengthened (level file `mainSkillLvl` 2: 风沙掩体 SP 10/10), and sktok_mound's permanent buff
# mound_s_1[mesh_effect] creates S_desert_wall_02_start_Mesh at SpecialPoint0 (_spawnLocation 8). The effect takes the
# point's position only (its root's own position is dropped, as render/fxgame.js places every effect), not its turn or
# its 0.01 scale. The bundle's dependencies come from the effect extractor's CAB index (.cache/fx-cab-index.json).
DEVICE_EFFECT_MESHES = {'trap_032_mound': (('battle/prefabs/effects/s.ab', 'S_desert_wall_02_start_Mesh', 'SpecialPoint0'),)}
FX_CAB_INDEX = ROOT / '.cache' / 'fx-cab-index.json'
# Device models whose MeshAnimator plays legacy clips (the prefab's `_animations`: animKey → clip of its Animation):
# 赘生甲壳's Born = Appear (the shell drops in, grows from 0.001 and settles), Die = Break (eight of its ten parts fly
# apart and fall, 1.25 s). Exported as clips of the parts (export_devices: `clips` of the device, one group per moving
# renderer with `part`), sampled at DEVICE_CLIP_FPS from the clips' Hermite curves.
DEVICE_CLIPS = {'trap_156_dsshell': {'Born': 'Appear', 'Die': 'Break'}}
DEVICE_CLIP_FPS = 30


def _curve_at(keys, t, comps):
    """A Unity AnimationCurve (non-weighted Hermite keys, as the shell's) at time t, clamped to its ends; `comps` the
    value's fields ('x', 'y', 'z'[, 'w']) or None for a float curve."""
    get = (lambda v: [getattr(v, c) for c in comps]) if comps else (lambda v: [float(v)])
    if t <= keys[0].time:
        return get(keys[0].value)
    if t >= keys[-1].time:
        return get(keys[-1].value)
    for k0, k1 in zip(keys, keys[1:]):
        if k0.time <= t <= k1.time:
            break
    dt = k1.time - k0.time
    u = (t - k0.time) / dt if dt > 0 else 0.0
    v0, v1, m0, m1 = get(k0.value), get(k1.value), get(k0.outSlope), get(k1.inSlope)
    h00, h10, h01, h11 = 2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u, -2 * u ** 3 + 3 * u ** 2, u ** 3 - u ** 2
    out = []
    for a, b, sa, sb in zip(v0, v1, m0, m1):
        if not (math.isfinite(sa) and math.isfinite(sb)):  # a stepped key (an infinite tangent) holds its value
            out.append(a)
        else:
            out.append(h00 * a + h10 * dt * sa + h01 * b + h11 * dt * sb)
    return out


def _inverse_affine(m):
    a = [r[:3] for r in m[:3]]
    det = (a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
           + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]))
    inv = [[(a[(j + 1) % 3][(i + 1) % 3] * a[(j + 2) % 3][(i + 2) % 3] - a[(j + 1) % 3][(i + 2) % 3] * a[(j + 2) % 3][(i + 1) % 3]) / det
            for j in range(3)] for i in range(3)]
    t = [-sum(inv[i][k] * m[k][3] for k in range(3)) for i in range(3)]
    return [inv[0] + [t[0]], inv[1] + [t[1]], inv[2] + [t[2]], [0, 0, 0, 1]]


def _device_clips(key, tf, go, nodes, local):
    """{animKey: {clip, dur, fps, frames: {renderer path: [12 × n]}}} for DEVICE_CLIPS[key]: per frame each moving renderer's
    delta from its rest pose in board space (row-major 3×4: board = F · D · F with F the z flip), and the set of
    renderers ({node pid: its path}). Empty when the prefab has no such Animation."""
    want = DEVICE_CLIPS.get(key)
    if not want:
        return {}, {}
    anim = owner = None
    for g, _m, pid in nodes:  # this prefab's nodes (the pack holds other prefabs' Animations too)
        a = component(g, 'Animation') if pid is not None else None
        if a is not None:
            anim, owner = a, pid
            break
    if anim is None:
        log(f'  device {key}: no Animation for its clips')
        return {}, {}
    clips = {}
    for c in anim.m_Animations:
        if c.m_PathID:
            clip = c.read()
            clips[clip.m_Name] = clip
    parent = {}
    for pid, t in tf.items():
        for ch in t.m_Children:
            parent[ch.m_PathID] = pid
    name = lambda pid: go[tf[pid].m_GameObject.m_PathID].m_Name

    def path_of(pid):  # the clip path of a node under the Animation's GameObject (None outside it)
        names = []
        while pid != owner:
            if pid not in parent:
                return None
            names.append(name(pid))
            pid = parent[pid]
        return '/'.join(reversed(names))
    out, moving = {}, {}
    for anim_key, clip_name in want.items():
        clip = clips.get(clip_name)
        if clip is None:
            log(f'  device {key}: clip {clip_name} missing')
            continue
        curves = {}
        for kind, comps, attr in (('m_PositionCurves', 'xyz', 'pos'), ('m_RotationCurves', 'xyzw', 'rot'), ('m_ScaleCurves', 'xyz', 'scl')):
            for cv in getattr(clip, kind, None) or []:
                if any(k.weightedMode for k in cv.curve.m_Curve):
                    log(f'  device {key} {clip_name}: weighted keys on {cv.path} read as plain Hermite')
                curves[(cv.path, attr)] = (cv.curve.m_Curve, tuple(comps))
        dur = max((ks[-1].time for ks, _ in curves.values()), default=0.0)
        n = max(1, int(round(dur * DEVICE_CLIP_FPS))) + 1
        frames = {}
        for g, m0, pid in nodes:
            if pid is None or component(g, 'MeshRenderer') is None:
                continue
            chain, q = [], pid  # the nodes from the Animation's GameObject down to this renderer
            while q is not None and q != owner:
                chain.append(q)
                q = parent.get(q)
            if q != owner or not any((path_of(c), at) in curves for c in chain for at in ('pos', 'rot', 'scl')):
                continue
            rp = path_of(pid)
            chain.reverse()
            inv0 = _inverse_affine(m0)
            above = m0
            for c in reversed(chain):
                above = mul(above, _inverse_affine(local(tf[c])))   # the owner's matrix (relative to the prefab root)
            seq = []
            for i in range(n):
                tt = min(dur, i / DEVICE_CLIP_FPS)
                m = above
                for c in chain:
                    t = tf[c]
                    cp = path_of(c)
                    pos = [t.m_LocalPosition.x, t.m_LocalPosition.y, t.m_LocalPosition.z]
                    rot = [t.m_LocalRotation.x, t.m_LocalRotation.y, t.m_LocalRotation.z, t.m_LocalRotation.w]
                    scl = [t.m_LocalScale.x, t.m_LocalScale.y, t.m_LocalScale.z]
                    if (cp, 'pos') in curves:
                        pos = _curve_at(*curves[(cp, 'pos')][:1], tt, 'xyz')
                    if (cp, 'rot') in curves:
                        rot = _curve_at(curves[(cp, 'rot')][0], tt, 'xyzw')
                        ln = math.sqrt(sum(v * v for v in rot)) or 1.0
                        rot = [v / ln for v in rot]
                    if (cp, 'scl') in curves:
                        scl = _curve_at(curves[(cp, 'scl')][0], tt, 'xyz')
                    m = mul(m, trs(pos, rot, scl))
                d = mul(m, inv0)
                # Unity battle space → board (z flipped on both sides)
                fz = [1, 1, -1]
                seq += [_num(d[r][c] * fz[r] * fz[c], 5) for r in range(3) for c in range(3)] + [_num(d[r][3] * fz[r], 5) for r in range(3)]
            frames[rp] = seq
            moving[pid] = rp
        out[anim_key] = {'clip': clip_name, 'dur': _num(dur, 4), 'fps': DEVICE_CLIP_FPS, 'frames': frames}
        log(f'  device {key}: {anim_key} = {clip_name}, {dur:.3f} s, {len(frames)} moving parts')
    return out, moving


def _load_with_deps(index, first):
    import UnityPy
    env = UnityPy.load(str(first))
    loaded = {str(first)}
    for _ in range(4):
        want = set()
        for f in list(env.files.values()):
            for sf in getattr(f, 'files', {}).values():
                for e in getattr(sf, 'externals', None) or []:
                    cab = e.path.split('/')[-1].split('.')[0]
                    if cab in index and index[cab] not in loaded:
                        want.add(index[cab])
        if not want:
            break
        for w in sorted(want):
            try:
                env.load_file(w)
            except Exception as ex:
                log(f'  warn dependency {w}: {ex}')
            loaded.add(w)
    return env, loaded


def _effect_nodes(roots, index, bundle, prefab, local):
    """[(GameObject, matrix)] of an effect prefab's active nodes, the root at the origin with its own turn and scale."""
    path = next((roots[k] / bundle for k in ('pd', 'sa') if (roots[k] / bundle).is_file()), None)
    if path is None:
        return None
    env, _ = _load_with_deps(index, path)
    tf, go = {}, {}
    for f in env.files.values():
        for sf in getattr(f, 'files', {}).values():
            for pid, o in (getattr(sf, 'objects', None) or {}).items():
                if o.type.name == 'Transform':
                    tf[pid] = o.read()
                elif o.type.name == 'GameObject':
                    go[pid] = o.read()
    root = next((pid for pid, t in tf.items() if go.get(t.m_GameObject.m_PathID) and go[t.m_GameObject.m_PathID].m_Name == prefab
                 and not (t.m_Father and t.m_Father.m_PathID)), None)
    if root is None:
        return None
    r = tf[root]
    stack = [(root, trs([0, 0, 0], [r.m_LocalRotation.x, r.m_LocalRotation.y, r.m_LocalRotation.z, r.m_LocalRotation.w],
                        [r.m_LocalScale.x, r.m_LocalScale.y, r.m_LocalScale.z]))]
    out = []
    while stack:
        pid, m = stack.pop()
        t = tf[pid]
        g = go.get(t.m_GameObject.m_PathID)
        if not g or not g.m_IsActive:
            continue
        out.append((g, m))
        stack += [(c.m_PathID, mul(m, local(tf[c.m_PathID]))) for c in t.m_Children if c.m_PathID in tf]
    return out


def _add_tris(grp, h, tris, m, nm, det):
    """Append one renderer's triangles (submesh `tris` of MeshHandler h) to group grp, baked with matrix m."""
    remap = {}
    V, N, U0 = h.m_Vertices, h.m_Normals, h.m_UV0
    for tri in tris:
        o3 = []
        for vi in tri:
            if vi not in remap:
                remap[vi] = len(grp['pos']) // 3
                p = V[vi]
                wp = [m[i][0] * p[0] + m[i][1] * p[1] + m[i][2] * p[2] + m[i][3] for i in range(3)]
                grp['pos'] += (wp[0], wp[1], -wp[2])  # Unity battle space → board offset (z = up)
                if N:
                    n = N[vi]
                    wn = [nm[i][0] * n[0] + nm[i][1] * n[1] + nm[i][2] * n[2] for i in range(3)]
                    ln = math.sqrt(sum(c * c for c in wn)) or 1.0
                    grp['nrm'] += (wn[0] / ln, wn[1] / ln, -wn[2] / ln)
                else:
                    grp['nrm'] += (0.0, 0.0, 1.0)
                u0 = U0[vi] if U0 else (0.0, 0.0)
                grp['uv0'] += (u0[0], u0[1])
                grp['uv1'] += (u0[0], u0[1])
                grp['col'] += (255, 255, 255, 255)
            o3.append(remap[vi])
        grp['idx'] += o3 if det < 0 else (o3[0], o3[2], o3[1])


def export_devices(roots, index, out_root, manifest, written, keys=DEVICE_KEYS):
    """scene/devices/scene.json + geom.bin (the scene format, version 2): one group per (device, material), positions
    in board space relative to the device's tile centre on the ground (z = up), lightmap −1."""
    from UnityPy.helpers.MeshHelper import MeshHandler
    # the effect extractor's CAB index too: the effect bundles and the built-in shaders (Unlit/Texture of the mound) are
    # not in the scene index
    if FX_CAB_INDEX.exists():
        game = roots['pd'].parent.parent
        index = {**{k: str(game / v) for k, v in json.loads(FX_CAB_INDEX.read_text(encoding='utf-8')).items()}, **index}
    out = out_root / 'scene' / 'devices'
    out.mkdir(parents=True, exist_ok=True)
    out_tex = out_root / 'scene' / 'tex'
    out_tex.mkdir(parents=True, exist_ok=True)
    found = {}
    for pack in sorted(roots['pd'].glob(DEVICE_PACKS)):
        if len(found) == len(keys):
            break
        names = None
        try:
            import UnityPy
            probe = UnityPy.load(str(pack))
            names = {o.read().m_Name for o in probe.objects if o.type.name == 'GameObject'}
        except Exception as ex:
            log(f'  skip {pack.name}: {ex}')
            continue
        want = [k for k in keys if k in names and k not in found]
        if not want:
            continue
        env, deps = _load_with_deps(index, pack)
        for k in want:
            found[k] = (env, pack, deps)
    groups, materials, packed, devices = {}, {}, [], {}
    for key in keys:
        if key not in found:
            log(f'  device {key}: no prefab found')
            continue
        env, pack, _deps = found[key]
        pfile = env.files[str(pack)]
        objs = {}
        for sf in getattr(pfile, 'files', {}).values():
            for pid, o in (getattr(sf, 'objects', None) or {}).items():
                objs[pid] = o
        tf, go = {}, {}
        for pid, o in objs.items():
            if o.type.name in ('Transform', 'RectTransform'):
                tf[pid] = o.read()
            elif o.type.name == 'GameObject':
                go[pid] = o.read()
        # the prefab root: a GameObject named key, without a parent, with a Graphic child
        root = None
        for pid, t in tf.items():
            g = go.get(t.m_GameObject.m_PathID)
            if g and g.m_Name == key and not (t.m_Father and t.m_Father.m_PathID):
                if any(go.get(tf[c.m_PathID].m_GameObject.m_PathID).m_Name == 'Graphic' for c in t.m_Children if c.m_PathID in tf):
                    root = pid
                    break
        if root is None:
            log(f'  device {key}: prefab root not found')
            continue

        def local(t):
            return trs([t.m_LocalPosition.x, t.m_LocalPosition.y, t.m_LocalPosition.z],
                       [t.m_LocalRotation.x, t.m_LocalRotation.y, t.m_LocalRotation.z, t.m_LocalRotation.w],
                       [t.m_LocalScale.x, t.m_LocalScale.y, t.m_LocalScale.z])

        stack = [(c.m_PathID, IDENTITY) for c in tf[root].m_Children if c.m_PathID in tf]
        nodes = []
        while stack:
            pid, parent = stack.pop()
            t = tf[pid]
            g = go.get(t.m_GameObject.m_PathID)
            if not g or not g.m_IsActive:
                continue
            m = mul(parent, local(t))
            nodes.append((g, m, pid))
            stack += [(c.m_PathID, m) for c in t.m_Children if c.m_PathID in tf]
        for bundle, prefab, point in DEVICE_EFFECT_MESHES.get(key, ()):
            at = next((m for g, m, _p in nodes if g.m_Name == point), None)
            fx_nodes = _effect_nodes(roots, index, bundle, prefab, local) if at is not None else None
            if not fx_nodes:
                log(f'  device {key}: effect {prefab} at {point} not found')
                continue
            place = trs([at[0][3], at[1][3], at[2][3]], [0, 0, 0, 1], [1, 1, 1])
            nodes += [(g, mul(place, m), None) for g, m in fx_nodes]
        clips, moving = _device_clips(key, tf, go, nodes, local)
        paths = moving
        grp_keys = []
        for g, m, pid in nodes:
            r = component(g, 'MeshRenderer')
            mf = component(g, 'MeshFilter')
            if not r or not mf or not mf.m_Mesh.m_PathID or not r.m_Enabled:
                continue
            mesh = mf.m_Mesh.read()
            h = MeshHandler(mesh)
            h.process()
            tris = h.get_triangles()
            nm, det = normal_matrix(m)
            for si, mp in enumerate(r.m_Materials):
                if si >= len(tris) or not mp.m_PathID:
                    continue
                mat = mp.read()
                mname = mat.m_Name
                if mname not in materials:
                    info = material_info(mat)
                    for k, tx in info['textures'].items():
                        try:
                            tex = next(e.m_Texture for kk, e in mat.m_SavedProperties.m_TexEnvs if kk == k).read()
                            tx['file'] = texture_entry(tex, out_tex, TEX_KIND.get(k), written, manifest)
                        except Exception as ex:
                            log(f'  warn texture {mname}.{k}: {ex}')
                    materials[mname] = info
                part = paths.get(pid)
                # a moving renderer goes into the merged group (the standing model) and into its own (the clips)
                for gk in [(key, mname, None)] + ([(key, mname, part)] if part else []):
                    grp = groups.get(gk)
                    if grp is None:
                        grp = groups[gk] = {'device': key, 'material': mname, 'part': gk[2], 'pos': [], 'nrm': [], 'uv0': [], 'uv1': [], 'col': [], 'idx': []}
                        grp_keys.append(gk)
                    _add_tris(grp, h, tris[si], m, nm, det)
        pos = [v for gk in grp_keys if gk[2] is None for v in groups[gk]['pos']]
        if pos:
            # the standing surface: the highest up-facing level under the model's top rim (a 射击台's plate sits below its
            # 0.47 rim at 0.39; a model without a raised rim: its top)
            levels = sorted({round(gp[i + 2], 3) for gk in grp_keys if gk[2] is None for gp, gn in [(groups[gk]['pos'], groups[gk]['nrm'])]
                             for i in range(0, len(gp), 3) if gn[i + 2] > 0.9}, reverse=True)
            zmax = max(pos[2::3])
            top = levels[1] if len(levels) > 1 and levels[0] >= zmax - 0.01 and zmax - levels[1] < 0.15 else (levels[0] if levels else None)
            devices[key] = {'bounds': [[_num(min(pos[i::3]), 4) for i in range(3)], [_num(max(pos[i::3]), 4) for i in range(3)]],
                            'top': _num(top, 4) if top is not None else None,
                            'source': os.path.relpath(pack, roots['pd'].parent.parent)}
            if clips:
                devices[key]['clips'] = clips
            log(f'  device {key}: {len(grp_keys)} groups, bounds {devices[key]["bounds"]}')
    out_groups = []
    for (key, mname, part), grp in groups.items():
        nv, ni = len(grp['pos']) // 3, len(grp['idx'])
        if not nv or not ni:
            continue
        rec = {'device': key, 'material': mname, 'lightmap': -1, 'hidden': None, 'renderers': 1, 'vertices': nv, 'indices': ni}
        if part:
            rec['part'] = part  # one moving renderer of the device's clips (official.js: drawn only while a clip plays)
        out_groups.append(rec)
        packed.append((rec, grp))
    if not packed:
        return False
    blob, quant = pack_geometry(packed)
    (out / 'geom.bin').write_bytes(bytes(blob))
    doc = {'version': GEOM_VERSION, 'kind': 'devices', 'space': 'board offset from the tile centre on the ground (x = col, y = row, z = up)',
           'vertexBytes': VERTEX_BYTES, 'quant': quant, 'devices': devices, 'materials': dict(sorted(materials.items())),
           'groups': out_groups, 'stats': {'groups': len(out_groups), 'bytes': len(blob)}}
    (out / 'scene.json').write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    gm = manifest.setdefault('scene/devices', {})
    gm['scene'] = {'path': '/assets/local/scene/devices/scene.json', 'kind': 'Scene', 'groups': len(out_groups)}
    gm['geom'] = {'path': '/assets/local/scene/devices/geom.bin', 'kind': 'Geometry', 'bytes': len(blob)}
    log(f'devices: {len(out_groups)} groups, {len(devices)} devices, {len(blob) // 1024} KiB')
    return True


def _q16(v, lo, span):
    return min(Q16, max(0, int(round((v - lo) / span * Q16))))


# arrays stored delta + zigzag + byte-shuffled (quant.dzs): same size, gzip on the wire ≈ 45 % smaller (indices ≈ 15×)
DZS_KEYS = ('pos', 'uv1', 'idx')


def dzs(data, fmt, comps):
    """Delta per component (mod 2^16 / 2^32), zigzag, then the bytes shuffled by significance (all low bytes first).
    Same length as the plain array; official.js undoes it at load (unDzs)."""
    bits = 16 if fmt == 'H' else 32
    mask, half = (1 << bits) - 1, 1 << (bits - 1)
    prev, out = [0] * comps, []
    for i, v in enumerate(data):
        c = i % comps
        d = ((v - prev[c] + half) & mask) - half
        prev[c] = v
        out.append(((d << 1) ^ (d >> (bits - 1))) & mask)
    raw = struct.pack(f'<{len(out)}{fmt}', *out)
    w = bits // 8
    return b''.join(raw[j::w] for j in range(w))


def _put(blob, rec, key, fmt, data, comps=0):
    while len(blob) % 4:  # every array starts 4-byte aligned
        blob.append(0)
    rec[key] = [len(blob), len(data)]
    blob += dzs(data, fmt, comps) if comps else struct.pack(f'<{len(data)}{fmt}', *data)


def pack_geometry(packed):
    """geom.bin version 2 from [(group record, {pos, nrm, uv0, uv1: float lists, col: u8 list, idx: int list})] in board
    space. Positions go on one u16 grid for the whole scene (quant.pos = [x0, y0, z0, span]: board = x0 + q / 65535 ·
    span, one span for the three axes so the mesh matrix scales uniformly and the shader's normals stay right) — the
    same vertex in two groups lands on the same grid point, so the seams between groups stay closed. uv0 / uv1 are u16
    on the group's own range (q.uvN = [sx, sy, ox, oy]: uv = q / 65535 · s + o), normals i8×4 (/127, w = 0), the colour
    stays u8×4 unless the whole group has one (colConst, no array), indices u16 when the group has ≤ 65536 vertices.
    pos / uv1 / idx are stored through dzs (quant.dzs). Fills the records' buffer ranges; returns (blob, quant)."""
    lo, hi = [math.inf] * 3, [-math.inf] * 3
    for _rec, d in packed:
        pos = d['pos']
        for i in range(3):
            lo[i] = min(lo[i], min(pos[i::3]))
            hi[i] = max(hi[i], max(pos[i::3]))
    span = max(hi[i] - lo[i] for i in range(3)) or 1.0
    blob = bytearray()
    for rec, d in packed:
        nv = len(d['pos']) // 3
        _put(blob, rec, 'pos', 'H', [_q16(v, lo[k % 3], span) for k, v in enumerate(d['pos'])], 3)
        nrm = d['nrm']
        _put(blob, rec, 'nrm', 'b', [max(-127, min(127, int(round(nrm[3 * v + i] * 127)))) if i < 3 else 0
                                     for v in range(nv) for i in range(4)])
        q = {}
        for key in ('uv0', 'uv1'):
            u = d[key]
            ulo = [min(u[0::2]), min(u[1::2])]
            us = [(max(u[i::2]) - ulo[i]) or 1.0 for i in range(2)]
            q[key] = [us[0], us[1], ulo[0], ulo[1]]
            _put(blob, rec, key, 'H', [_q16(v, ulo[k % 2], us[k % 2]) for k, v in enumerate(u)], 2 if key in DZS_KEYS else 0)
        rec['q'] = q
        col = list(d['col'])
        if col[:4] * nv == col:
            rec['col'], rec['colConst'] = None, col[:4]
        else:
            _put(blob, rec, 'col', 'B', col)
        rec['idxType'] = 'u16' if nv <= 65536 else 'u32'
        _put(blob, rec, 'idx', 'H' if nv <= 65536 else 'I', list(d['idx']), 1)
    return blob, {'pos': [lo[0], lo[1], lo[2], span], 'dzs': list(DZS_KEYS)}


def requantize(out_root, groups, log):
    """Rewrite the version-1 scenes (f32 attributes, u32 indices) under out_root/scene in version 2 (pack_geometry)
    and update the manifest groups' geom bytes. Returns the number of stages rewritten."""
    n = 0
    for sj in sorted((Path(out_root) / 'scene').glob('*/scene.json')):
        doc = json.loads(sj.read_text(encoding='utf-8'))
        if doc.get('version', 1) >= GEOM_VERSION:
            continue
        gb = sj.with_name('geom.bin')
        raw = gb.read_bytes()
        read = lambda r, fmt, size: list(struct.unpack_from(f'<{r[1]}{fmt}', raw, r[0]))  # noqa: E731
        packed = [(rec, {'pos': read(rec['pos'], 'f', 4), 'nrm': read(rec['nrm'], 'f', 4), 'uv0': read(rec['uv0'], 'f', 4),
                         'uv1': read(rec['uv1'], 'f', 4), 'col': read(rec['col'], 'B', 1), 'idx': read(rec['idx'], 'I', 4)})
                  for rec in doc['groups']]
        blob, quant = pack_geometry(packed)
        gb.write_bytes(bytes(blob))
        doc.update(version=GEOM_VERSION, vertexBytes=VERTEX_BYTES, quant=quant)
        doc.setdefault('stats', {})['bytes'] = len(blob)
        sj.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        stage = sj.parent.name
        g = groups.get(f'scene/{stage}')
        if isinstance(g, dict) and isinstance(g.get('geom'), dict):
            g['geom']['bytes'] = len(blob)
        log(f'{stage}: geom.bin {len(raw) // 1024} → {len(blob) // 1024} KiB')
        n += 1
    log(f'requantize: {n} stages')
    return n


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
            mode = 'lossy' if g == 'scene/tex' and png.relative_to(out_root / 'scene/tex').as_posix() in lossy else 'lossless'
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
    """Read the manifest, let groups_update change its groups, write it. The update can take minutes (the WebP copies), and
    another extractor (extract.py) may write the file meanwhile: just before writing, the file is read again and every
    group the update left as it was takes the newer copy (a group another tool added or changed is kept)."""
    read = lambda: json.loads(mpath.read_text(encoding='utf-8')) if mpath.exists() else {'version': 1, 'source': 'local-client', 'groups': {}}  # noqa: E731
    doc = read()
    groups = doc.setdefault('groups', {})
    seen = json.loads(json.dumps(groups))
    groups_update(groups)
    for k, v in (read().get('groups') or {}).items():
        if groups.get(k) == seen.get(k) and v != seen.get(k):
            groups[k] = v
    doc['groups'] = dict(sorted(groups.items()))
    doc['count'] = sum(len(v) for v in groups.values())
    mpath.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    log(f'manifest {mpath} ({doc["count"]} entries)')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--client', default=DEFAULT_CLIENT, help='…/Arknights_Data of the client')
    ap.add_argument('--cn', action='store_true', help='the CN client (client_path.py client_data_cn): its own CAB index '
                    '(.cache/scene-cab-index-cn.json) and textures (scene/tex/cn/); also when --client names it')
    ap.add_argument('--stage', action='append', default=[], help='stage id (repeatable); default: every stage with a scene')
    ap.add_argument('--out', default=str(ROOT / 'public/assets/local'))
    ap.add_argument('--manifest', default=str(ROOT / 'data/local-assets.json'))
    ap.add_argument('--index', default=None, help='CAB index cache (git-ignored .cache/; default scene-cab-index.json, '
                    'scene-cab-index-cn.json for the CN client)')
    ap.add_argument('--rebuild-index', action='store_true')
    ap.add_argument('--no-webp', action='store_true', help='keep the manifest on the PNGs (no WebP copies)')
    ap.add_argument('--webp', action='store_true',
                    help='only write the WebP copies of the scene art already under --out and list them (no client)')
    ap.add_argument('--reflections', action='store_true',
                    help='only add the reflection probe (scene.json reflection) to the scenes already under --out (needs the client)')
    ap.add_argument('--devices', action='store_true',
                    help='only export the device models (scene/devices: 阻隔工事, 射击台, 特制水上平台, 土石结构, 盐坨子炮, 赘生甲壳) and their textures (needs the client)')
    ap.add_argument('--requantize', action='store_true',
                    help='only rewrite the version-1 geometry already under --out in the quantized version 2 (no client)')
    args = ap.parse_args()
    mpath = Path(args.manifest)
    out_root = Path(args.out)
    if args.requantize:
        if not mpath.exists():
            print(f'no manifest at {mpath}: extract the scenes first', file=sys.stderr)
            return 2
        n = [0]
        write_manifest(mpath, lambda groups: n.__setitem__(0, requantize(out_root, groups, log)), log)
        return 0
    if args.webp:
        if not mpath.exists():
            print(f'no manifest at {mpath}: extract the scenes first', file=sys.stderr)
            return 2
        n = [0]
        write_manifest(mpath, lambda groups: n.__setitem__(0, apply_webp(out_root, groups, log)), log)
        return 0 if n[0] else 1

    import aklz4  # noqa: F401  (registers the LZ4AK decoder)
    global TEX_SUBDIR
    cn = client_data_cn()
    if args.cn:
        if not cn:
            print('no CN client set up (SP_CLIENT_CN, client_path.py)', file=sys.stderr)
            return 2
        args.client = cn
    is_cn = bool(cn) and Path(args.client).resolve() == Path(cn).resolve()
    TEX_SUBDIR = 'cn' if is_cn else ''
    roots = bundle_roots(args.client)
    if not roots['pd'].is_dir():
        print(f'no client at {args.client}', file=sys.stderr)
        return 2
    cache = Path(args.index or ROOT / '.cache' / ('scene-cab-index-cn.json' if is_cn else 'scene-cab-index.json'))
    index = build_index(roots, cache) if args.rebuild_index or not cache.exists() else json.loads(cache.read_text(encoding='utf-8'))
    stages = args.stage or sorted(p.name[len('level_'):] for p in (roots['pd'] / SCENE_DIR).glob('act*autochess/level_*')
                                  if p.is_dir() and STAGE_RE.match(p.name[len('level_'):]))
    if args.devices:
        manifest, written = {}, {}
        ok = export_devices(roots, index, out_root, manifest, written)

        def merge(groups):
            for k, v in manifest.items():
                groups[k] = {**groups.get(k, {}), **v} if k == 'scene/tex' else v
            if not args.no_webp:
                # only the new entries (the dicts are shared, so the WebP paths land in the manifest)
                apply_webp(out_root, {k: {e: groups[k][e] for e in manifest[k]} for k in manifest}, log)
        write_manifest(mpath, merge, log)
        return 0 if ok else 1
    if args.reflections:
        n = 0
        for stage in stages:
            sj = out_root / 'scene' / stage / 'scene.json'
            if not sj.exists():
                continue
            loaded, _ = load_stage_env(roots, index, stage)
            if not loaded or loaded[1] is None:
                log(f'skip {stage}: no scene bundle')
                continue
            doc = json.loads(sj.read_text(encoding='utf-8'))
            doc['reflection'] = scene_reflection(loaded[0], loaded[1])
            sj.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
            log(f'{stage}: reflection {doc["reflection"] and doc["reflection"]["source"]} {doc["reflection"] and doc["reflection"]["faces"][4]}')
            n += 1
        return 0 if n else 1
    manifest, written, ok = {}, {}, 0
    for stage in stages:
        try:
            ok += export_stage(roots, index, stage, out_root, manifest, written)
        except Exception as e:  # one broken stage keeps the others
            import traceback
            traceback.print_exc()
            log(f'FAIL {stage}: {e}')

    if not args.stage:
        try:
            export_devices(roots, index, out_root, manifest, written)
        except Exception as e:
            log(f'FAIL devices: {e}')

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
