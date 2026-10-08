#!/usr/bin/env python3
"""Operator model attach points from the local client (local patch, docs/LOCAL-PATCH.md 「이펙트 붙는 자리」).

An effect prefab's root `_spawnLocation` (fx_extract.py `spawn`) names the point of the unit it is created at — the client's
`SpawnLocation` enum (global-metadata.dat): 0 NONE, 1 FOOT_POINT, 2 HIT_POINT, 3 MUZZLE_POINT, 4 HEAD_POINT, 5 GROUND_CENTER,
6 MUZZLE_POINT_WITHOUT_ROTATION, 7 GROUND_CENTER_WITH_ZERO_HEIGHT, 8 MP_SPECIAL_0 … 11 MP_SPECIAL_3, 12 CAMERA, 13… MP_SPECIAL_4….
The points are Transforms of the battle model (chararts/<charId>.ab `DefaultSkin`, the animator's `_muzzleTransform`,
`_hitTransform`, `_headTransform`, `_specialPoint0~15`): `FaceSwitcher/Front|Back/Muzzle`, `HitPoint`, `SpecialPointN`,
`FaceSwitcher/HeadPoint`. Most follow a Spine bone (a spine-unity BoneFollower: `boneName`, `followBoneRotation`); the rest
sit at a fixed spot of the skeleton. Their local position is in skeleton units × the SkeletonDataAsset `scale` (0.01):
char_245_cello Front/SpecialPoint0 (0.602, 1.785) = bone F_Weapon_Chord (60.2, 178.5) in the Idle pose.

Writes { charId: { muzzle | hit | head | sp<N>: { F?: point, B?: point } } } with point = { bone?: name, rot?: 1, at: [x, y] }
(`at` in skeleton units, y up; `bone` the bone it follows, `rot` when it also turns with the bone) to
tools/assets/local-char-points.json (reviewed in git) and public/assets/local/fx/points.json (read by render/fxgame.js,
git-ignored beside the effects).

Usage (from the repo root; --client = the EN client's Arknights_Data folder):
  .venv-extract/bin/python -I tools/local-extract/char_points.py [--client /mnt/d/YostarGames/Arknights_EN/Arknights_Data] [--id char_…]…
Without --id every operator with an extracted effect bundle (public/assets/local/fx/index.json) or in data/chess.json +
data/diy.json. Everything is (c) Hypergryph; private fan use only.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tools/assets/local-char-points.json'
FX_OUT = ROOT / 'public/assets/local/fx/points.json'
DEFAULT_CLIENT = '/mnt/d/YostarGames/Arknights_EN/Arknights_Data'


def char_ids(client):
    """Operators to read: the fx bundles' codenames matched to chararts files, plus the pool."""
    from char_modes import pool_char_ids
    files = {}
    for d in ('PersistentData/Bundles/chararts', 'StreamingAssets/AB/Windows/chararts'):
        p = Path(client) / d
        if p.is_dir():
            for f in p.glob('char_*.ab'):
                files.setdefault(f.stem, f)
    ids = set(pool_char_ids())
    idx = ROOT / 'public/assets/local/fx/index.json'
    if idx.exists():
        bundles = json.loads(idx.read_text(encoding='utf-8')).get('bundles') or {}
        for cid in files:
            if re.sub(r'^char_\d+_', '', cid) in bundles:
                ids.add(cid)
    return sorted(ids), files


def points_of(path):
    """{ key: { F|B: point } } of one chararts bundle's DefaultSkin, or None without one."""
    import aklz4  # noqa: F401  (registers the LZ4AK decoder)
    import UnityPy
    env = UnityPy.load(str(path))
    objs = {o.path_id: o for o in env.objects}
    cache = {}

    def tt(pid):
        if pid not in cache:
            cache[pid] = objs[pid].read_typetree()
        return cache[pid]

    go_mbs, animator = {}, None
    for pid, o in objs.items():
        if o.type.name == 'MonoBehaviour':
            try:
                d = tt(pid)
            except Exception:
                continue
            go_mbs.setdefault(d['m_GameObject']['m_PathID'], []).append(d)
            if '_faceSwitcher' in d and ('_front' in d or '_hitTransform' in d):
                animator = d
    if animator is None:
        return None

    def name_of(tr):
        return tt(tt(tr)['m_GameObject']['m_PathID'])['m_Name']

    # the two-sided animator keeps one record per side (`_front` / `_back`: muzzlaTransform [sic], hitTransform,
    # headTransform, shadowTransform, specialPoint0…15); the one-sided SingleSpineAnimator (char_1012_skadi2) has the
    # same fields on itself (_muzzleTransform, _hitTransform, _headTransform, _specialPoint0…15), for both sides
    if '_front' in animator:
        sides = [('F', animator.get('_front') or {}, ''), ('B', animator.get('_back') or {}, '')]
        names = {'muzzle': 'muzzlaTransform', 'hit': 'hitTransform', 'head': 'headTransform'}
    else:
        sides = [('FB', animator, '_')]
        names = {'muzzle': '_muzzleTransform', 'hit': '_hitTransform', 'head': '_headTransform'}
    out = {}
    for side, rec, pre in sides:
        fields = dict(names)
        fields.update({f'sp{n}': f'{pre}specialPoint{n}' for n in range(16)})
        for key, f in fields.items():
            ref = rec.get(f)
            if not (isinstance(ref, dict) and ref.get('m_FileID') == 0 and ref.get('m_PathID') in objs):
                continue
            tr = ref['m_PathID']
            pos = tt(tr)['m_LocalPosition']
            pt = {}
            for d in go_mbs.get(tt(tr)['m_GameObject']['m_PathID'], []):
                if isinstance(d.get('boneName'), str) and d['boneName']:
                    pt['bone'] = d['boneName']
                    if d.get('followBoneRotation'):
                        pt['rot'] = 1
            # every point sits in the Front / Back renderer's frame or the switcher's (HeadPoint, HitPoint) — the same
            # skeleton frame (both at the switcher's origin, scale 1)
            sc = skeleton_scale(objs, tt, go_mbs, tt(tr)['m_Father']['m_PathID']) or 0.01
            pt['at'] = [round(pos['x'] / sc, 2), round(pos['y'] / sc, 2)]
            for s1 in side:
                out.setdefault(key, {})[s1] = pt
    return {k: {s1: v[s1] for s1 in ('F', 'B') if s1 in v} for k, v in out.items()} or None


def skeleton_scale(objs, tt, go_mbs, side_tr):
    """The SkeletonDataAsset `scale` the renderer on `side_tr` (Front / Back) draws with, or None (not a renderer)."""
    if side_tr not in objs:
        return None
    go = tt(side_tr)['m_GameObject']['m_PathID']
    for d in go_mbs.get(go, []):
        ref = d.get('skeletonDataAsset')
        if isinstance(ref, dict) and ref.get('m_FileID') == 0 and ref.get('m_PathID') in objs:
            try:
                s = tt(ref['m_PathID']).get('scale')
            except Exception:
                return None
            return float(s) if s else None
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--client', default=DEFAULT_CLIENT)
    ap.add_argument('--id', action='append', default=[])
    a = ap.parse_args()
    ids, files = char_ids(a.client)
    ids = a.id or ids
    out = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    out.pop('$comment', None)
    missing = []
    for cid in ids:
        f = files.get(cid)
        if not f:
            missing.append(cid)
            continue
        try:
            pts = points_of(f)
        except Exception as e:  # a bundle that fails to load is reported, the old entry kept
            print(f'FAIL {cid}: {e}', file=sys.stderr)
            continue
        if pts:
            out[cid] = {k: pts[k] for k in sorted(pts)}
    doc = {'$comment': 'Operator model attach points (chararts DefaultSkin: Muzzle / HitPoint / HeadPoint / SpecialPointN, '
                       'Front F / Back B): the Spine bone each follows and its spot in skeleton units (y up). Written by '
                       'tools/local-extract/char_points.py from the local client (local patch); the same table goes to '
                       'public/assets/local/fx/points.json for render/fxgame.js (an effect\'s _spawnLocation 3 / 8…).'}
    # one operator per line (a reviewable diff when the client changes)
    lines = [f' {json.dumps(k)}: {json.dumps(v, ensure_ascii=False, separators=(",", ":"))}' for k, v in doc.items()]
    lines += [f' {json.dumps(k)}: {json.dumps(out[k], ensure_ascii=False, separators=(",", ":"))}' for k in sorted(out)]
    OUT.write_text('{\n' + ',\n'.join(lines) + '\n}\n', encoding='utf-8')
    if FX_OUT.parent.exists():
        FX_OUT.write_text(json.dumps({k: out[k] for k in sorted(out)}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'{len(out)} operator(s) → {OUT.relative_to(ROOT)}' + (f' + {FX_OUT.relative_to(ROOT)}' if FX_OUT.parent.exists() else '')
          + f'; no chararts: {", ".join(missing) or "none"}')


if __name__ == '__main__':
    main()
