#!/usr/bin/env python3
"""Operator attack modes from the local client (local patch, docs/LOCAL-PATCH.md 「스킬 모드 효과음」).

The official client sounds an operator's attacks through its attack mode: a bank `battle.<EVENT>.<charId>.attack.<n>`
where n is the mode's index in the character prefab's `_modes` list (charpack/char_*.ab: Default = 0, then the skill
modes in prefab order, e.g. 维什戴尔 [Default, S2, S2_Overload, S3] → S3's attacks sound `attack.3`). Which skill a mode
belongs to is in its name (`S<n>` + optional suffix). audio_data.json does not carry this order, so the asset plan
(tools/assets/plan.mjs) reads it from tools/assets/local-char-modes.json, which this script writes — with the projectile
keys each mode's attack fires (`_projectileKey` under Modes/<name>/: a ranged mode's impact sound is its projectile's bank
`battle.ON_PROJECTILE_HIT.<key>`):
  { "char_1035_wisdel": { "modes": ["Default", "S2", "S2_Overload", "S3"],
                          "proj": [["projectile_chr_wisdel_default"], ["projectile_chr_wisdel_s2"], …] }, … }

Usage (from the repo root; --client = the EN client's Arknights_Data folder):
  .venv-extract/bin/python tools/local-extract/char_modes.py [--client /mnt/d/YostarGames/Arknights_EN/Arknights_Data] [--id char_…]…
Without --id every operator of data/chess.json + data/diy.json. Everything is (c) Hypergryph; private fan use only.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tools/assets/local-char-modes.json'
DEFAULT_CLIENT = '/mnt/d/YostarGames/Arknights_EN/Arknights_Data'


def pool_char_ids():
    ids = set()
    chess = json.loads((ROOT / 'data/chess.json').read_text(encoding='utf-8'))
    recs = chess.get('chess', chess)
    for c in (recs.values() if isinstance(recs, dict) else recs):
        if isinstance(c, dict) and isinstance(c.get('charId'), str) and c['charId'].startswith('char_'):
            ids.add(c['charId'])
    diy = ROOT / 'data/diy.json'
    if diy.exists():
        d = json.loads(diy.read_text(encoding='utf-8'))
        recs = (d.get('chess') or {})
        for c in (recs.values() if isinstance(recs, dict) else recs):
            if isinstance(c, dict) and isinstance(c.get('charId'), str) and c['charId'].startswith('char_'):
                ids.add(c['charId'])
    return sorted(ids)


def modes_of(path):
    """{ modes: the `_modes` order (mode GameObject names), proj: per mode the projectile keys under it } or None."""
    import aklz4  # noqa: F401  (registers the LZ4AK decoder)
    import UnityPy
    env = UnityPy.load(str(path))
    go_name, mb, tr_of_go, parent = {}, [], {}, {}
    root = None
    for o in env.objects:
        t = o.type.name
        if t == 'GameObject':
            go_name[o.path_id] = o.read_typetree().get('m_Name')
        elif t == 'Transform':
            d = o.read_typetree()
            tr_of_go[d['m_GameObject']['m_PathID']] = o.path_id
            parent[o.path_id] = (d['m_GameObject']['m_PathID'], d['m_Father']['m_PathID'])
        elif t == 'MonoBehaviour':
            try:
                d = o.read_typetree()
            except Exception:
                continue
            mb.append((o.path_id, d))
            if root is None and isinstance(d.get('_modes'), list) and d['_modes']:
                root = d
    if root is None:
        return None
    go_of_tr = {tr: go for tr, (go, _) in parent.items()}

    def go_path(go):
        parts, tr = [], tr_of_go.get(go)
        while tr:
            g, father = parent[tr]
            parts.append(go_name.get(g) or '?')
            tr = father if father in parent else None
        return '/'.join(reversed(parts))

    mb_go = {pid: d.get('m_GameObject', {}).get('m_PathID') for pid, d in mb}
    modes = [go_name.get(mb_go.get(r.get('m_PathID'))) or '?' for r in root['_modes']]
    mode_paths = [go_path(mb_go.get(r.get('m_PathID'))) for r in root['_modes']]
    proj = [[] for _ in modes]

    def keys(o, out):
        if isinstance(o, dict):
            for k, v in o.items():
                if k in ('_projectileKey', '_duoProjectileKey') and isinstance(v, str) and v:
                    out.append(v)
                else:
                    keys(v, out)
        elif isinstance(o, list):
            for v in o:
                keys(v, out)
    for pid, d in mb:
        found = []
        keys(d, found)
        if not found:
            continue
        p = go_path(mb_go.get(pid))
        for i, mp in enumerate(mode_paths):
            if mp and (p == mp or p.startswith(mp + '/')):
                for k in found:
                    if k not in proj[i]:
                        proj[i].append(k)
    return {'modes': modes, 'proj': proj}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--client', default=DEFAULT_CLIENT)
    ap.add_argument('--id', action='append', default=[])
    a = ap.parse_args()
    pack = Path(a.client) / 'StreamingAssets/AB/Windows/charpack'
    ids = a.id or pool_char_ids()
    out = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    out.pop('$comment', None)
    missing = []
    for cid in ids:
        f = pack / f'{cid}.ab'
        if not f.exists():
            missing.append(cid)
            continue
        try:
            m = modes_of(f)
        except Exception as e:  # a pack that fails to load is reported, the old entry kept
            print(f'FAIL {cid}: {e}', file=sys.stderr)
            continue
        if m:
            out[cid] = m
    doc = {'$comment': 'Operator attack modes (charpack _modes order: index n = audio bank attack.<n>). Written by '
                       'tools/local-extract/char_modes.py from the local client (local patch); read by tools/assets/plan.mjs.'}
    doc.update({k: out[k] for k in sorted(out)})
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'{len(out)} operator(s) → {OUT.relative_to(ROOT)}; no charpack: {", ".join(missing) or "none"}')


if __name__ == '__main__':
    main()
