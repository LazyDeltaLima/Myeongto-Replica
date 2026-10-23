#!/usr/bin/env python3
"""Where each operator's and token's model and shadow sit in its battle prefab, from the local client (docs/rules/render.md
「모델 위치값·그림자」).

A unit's battle prefab draws its skeleton under `Graphic` (turned X −30° to face the camera) at a child's local position —
an operator's `DefaultSkin/FaceSwitcher` (chararts/<charId>.ab), a token's `Graphic/DefaultSkin/FaceSwitcher`,
`Graphic/Spine` or `Graphic/Front` (pkgrps/btl_pfb_tokens_*.ab, one prefab per root name; a summon that is an enemy, in
battle/enm_pfb_*.ab) — and its shadow sprite at `Others/Shadow/Sprite` (charpack/<charId>.ab or the token prefab; an enemy
prefab's `Shadow/Sprite`; neither parent is turned, the sprite lies on the board).
Most of them carry the same values (render/fxpoints.js STANDARD_PLACE); this table holds every unit read, so the render
keeps the standard place for a unit missing here or without the table.

Writes { unitId: { face: [x, y, z], scale, graphic?: [x, y, z], shadow: { at: [x, y], sx, sy } | null } } to
public/assets/local/fx/places.json (git-ignored beside the effects; read by render/fxpoints.js loadPlaces): `face` the
skeleton node's local position (Unity units = tiles) in Graphic's frame, `scale` its scale (the skeleton draws at it ×
the SkeletonDataAsset's 0.01), `graphic` Graphic's own local position when it is not 0, `shadow` the sprite's local
position on the board and its scale (null: the prefab draws no shadow — no Shadow/Sprite, no SpriteRenderer on it,
or inactive: 凛御银灰's 风雪之眼).

Usage (from the repo root; --client = the client's Arknights_Data folder):
  .venv-extract/bin/python -I tools/local-extract/model_place.py [--client <…/Arknights_Data>] [--id char_…|token_…]…
The EN client lacks a few CN-only units (予愿安洁莉娜, 克莱门莎, …): run again with --client <CN Arknights_Data> --id …
(the table keeps the other entries). Without --id: the pool's operators (data/chess.json + the 선발 picks: char_modes.py pool_char_ids), the 预备 operators and
the tokens of data/backups.json, and the tokens of data/tokens.json. Everything is (c) Hypergryph; private fan use only.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/local/fx/places.json'
from client_path import client_data  # noqa: E402
from char_points import token_files  # noqa: E402
DEFAULT_CLIENT = client_data()

# the skeleton's node under a token's Graphic, in the order looked for (an operator's is its skin's FaceSwitcher)
TOKEN_MODEL_NODES = ('DefaultSkin/FaceSwitcher', 'FaceSwitcher', 'Spine', 'Front', 'EmptyAnimator')


def unit_ids():
    from char_modes import pool_char_ids
    backups = json.loads((ROOT / 'data/backups.json').read_text(encoding='utf-8'))
    tokens = set(json.loads((ROOT / 'data/tokens.json').read_text(encoding='utf-8'))) | set(backups.get('tokens') or {})
    # the 预备 operators (backups `units`) too, and a summon that is an operator prefab (char_605_cmedic …) is read like one
    chars = set(pool_char_ids()) | set(backups.get('units') or {}) | {t for t in tokens if t.startswith('char_')}
    return sorted(chars), sorted(t for t in tokens if not t.startswith('char_'))


def enemy_files(client, ids):
    """{ id: its battle/enm_pfb_*.ab } for summons that are enemy prefabs (“炎佑” enemy_9012_acloon), by root name."""
    import aklz4  # noqa: F401
    import UnityPy
    out, want = {}, set(ids)
    for d in ('PersistentData/Bundles/battle', 'StreamingAssets/AB/Windows/battle'):
        p = Path(client) / d
        for f in sorted(p.glob('enm_pfb*.ab')) if want - set(out) and p.is_dir() else []:
            for o in UnityPy.load(str(f)).objects:
                if o.type.name == 'GameObject' and o.read().m_Name in want - set(out):
                    out[o.read().m_Name] = f
    return out


def bundle_file(client, sub, uid):
    for d in ('PersistentData/Bundles', 'StreamingAssets/AB/Windows'):
        p = Path(client) / d / sub / f'{uid}.ab'
        if p.exists():
            return p
    return None


def trees(path):
    """{ root name: node } of a bundle's Transform hierarchies; node = { pos, scale, active, sprite, children: { name: node } }
    (`active`: the GameObject's m_IsActive; `sprite`: it has an enabled SpriteRenderer)."""
    import aklz4  # noqa: F401  (registers the LZ4AK decoder)
    import UnityPy
    objs = {o.path_id: o for o in UnityPy.load(str(path)).objects}
    trs = {pid: o.read_typetree() for pid, o in objs.items() if o.type.name == 'Transform'}
    gos = {}
    for pid, t in trs.items():
        go = objs.get(t['m_GameObject']['m_PathID'])
        gos[pid] = go.read_typetree() if go is not None else {'m_Name': '?', 'm_Component': []}

    def has_sprite(go):
        for c in go.get('m_Component') or []:
            ref = c.get('component') or {}
            o = objs.get(ref.get('m_PathID')) if ref.get('m_FileID') == 0 else None
            if o is not None and o.type.name == 'SpriteRenderer' and o.read_typetree().get('m_Enabled', 1):
                return True
        return False

    def node(pid):
        t, go = trs[pid], gos[pid]
        p, s = t['m_LocalPosition'], t['m_LocalScale']
        kids = {}
        for c in t['m_Children']:
            if c.get('m_FileID') == 0 and c['m_PathID'] in trs:
                kids.setdefault(gos[c['m_PathID']]['m_Name'], node(c['m_PathID']))
        return {'pos': [p['x'], p['y'], p['z']], 'scale': [s['x'], s['y'], s['z']], 'active': bool(go.get('m_IsActive', 1)),
                'sprite': go['m_Name'] == 'Sprite' and has_sprite(go), 'children': kids}

    return {gos[pid]['m_Name']: node(pid) for pid, t in trs.items() if not t['m_Father']['m_PathID']}


def child(n, path):
    for part in path.split('/'):
        n = n and n['children'].get(part)
    return n


def r(v):
    return [round(x, 4) + 0.0 for x in v]


def place(model, graphic, shadow):
    # the node sits in Graphic's frame, so Graphic's own scale scales its place and size (an enemy prefab keeps its 0.27
    # on Graphic itself, the skeleton node at 1)
    k = graphic['scale'][0] if graphic else 1
    out = {'face': r([x * k for x in model['pos']]), 'scale': round(model['scale'][0] * k, 4)}
    if graphic and any(abs(x) > 1e-6 for x in graphic['pos']):
        out['graphic'] = r(graphic['pos'])
    out['shadow'] = {'at': r(shadow['pos'][:2]), 'sx': round(shadow['scale'][0], 4), 'sy': round(shadow['scale'][1], 4)} \
        if shadow and shadow['sprite'] and shadow['active'] else None
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--client', default=DEFAULT_CLIENT)
    ap.add_argument('--id', action='append', default=[])
    a = ap.parse_args()
    chars, tokens = unit_ids()
    if a.id:
        chars = [i for i in a.id if i.startswith('char_')]
        tokens = [i for i in a.id if not i.startswith('char_')]
    out = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    missing = []
    for cid in chars:
        art, pack = bundle_file(a.client, 'chararts', cid), bundle_file(a.client, 'charpack', cid)
        skin = art and trees(art).get('DefaultSkin')
        root = pack and trees(pack).get(cid)
        model = child(skin, 'FaceSwitcher')
        if not model or not root:
            missing.append(cid)
            continue
        out[cid] = place(model, child(root, 'Graphic'), child(root, 'Others/Shadow/Sprite'))
    by_file = {}
    found = token_files(a.client, [t for t in tokens if not t.startswith('enemy_')])
    found.update(enemy_files(a.client, [t for t in tokens if t.startswith('enemy_')]))
    for tid, f in found.items():
        by_file.setdefault(f, []).append(tid)
    for f, ids in by_file.items():
        roots = trees(f)
        for tid in ids:
            g = child(roots.get(tid), 'Graphic')
            model = next((m for m in (child(g, p) for p in TOKEN_MODEL_NODES) if m), None)
            if not model:
                missing.append(tid)
                continue
            out[tid] = place(model, g, child(roots[tid], 'Others/Shadow/Sprite') or child(roots[tid], 'Shadow/Sprite'))
    missing += [t for t in tokens if t not in out and t not in missing]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({k: out[k] for k in sorted(out)}, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'{len(out)} unit(s) → {OUT.relative_to(ROOT)}; not in this client: {", ".join(sorted(set(missing))) or "none"}')


if __name__ == '__main__':
    main()
