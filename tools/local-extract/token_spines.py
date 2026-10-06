#!/usr/bin/env python3
"""Token battle Spine models from the local client (local patch, docs/LOCAL-PATCH.md).

The 선발 (甄选 / DIY) operators' summons have no model on the community dumps: 望's 棋子 (token_10064_wang_stone1) is
missing from fexli/ArknightsResource, 维什戴尔's 魂灵之影 (token_10035_wisdel_wward) is there only as skin variants.
The client keeps the default models in the battle token packs (pkgrps/btl_pfb_tokens_*.ab, SkeletonDataAsset
`<id>_SkeletonData`). This writes them like extract.py's enemy models (skeleton, atlas sized / pma, page PNGs with the
[alpha] texture merged in) to spine/token/<id>/ and merges the groups into data/local-assets.json (other groups kept).
`node tools/assets/local-token-spines.mjs` then records their Spine metadata (tools/assets/local-token-spines.json,
data/assets.json tokens[id].spineLocal).

Usage (from the repo root; --game = the folder holding pkgrps/, e.g. the EN client's PersistentData/Bundles):
  .venv-extract/bin/python tools/local-extract/token_spines.py --game <Bundles> [--id token_…]…
Everything is (c) Hypergryph; for private, non-commercial fan use only.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import extract  # noqa: E402  (write_enemy_spine, merge_manifest)

ROOT = Path(__file__).resolve().parents[2]
TOKEN_SPINES = ['token_10064_wang_stone1', 'token_10035_wisdel_wward']
TOKEN_PACKS = 'pkgrps/btl_pfb_tokens_*.ab'
TOKEN_SPINE_SUB = 'spine/token'


def export_token_spines(ab_root, out_root, manifest, log, ids):
    import aklz4  # noqa: F401  (registers the LZ4AK decoder)
    import UnityPy
    wanted, n = set(ids), 0
    for f in sorted(Path(ab_root).glob(TOKEN_PACKS)):
        if not wanted:
            break
        try:
            env = UnityPy.load(str(f))
        except Exception as e:
            log(f'FAIL load {f.name}: {e}')
            continue
        objects = {o.path_id: o for o in env.objects}
        for o in env.objects:
            if o.type.name != 'MonoBehaviour':
                continue
            try:
                t = o.read_typetree()
            except Exception:
                continue
            name = str(t.get('m_Name') or '')
            tid = name[:-len('_SkeletonData')] if name.endswith('_SkeletonData') else None
            if tid not in wanted or 'skeletonJSON' not in t:
                continue
            # extract.py writes under ENEMY_SPINE_SUB/<id>: point it at spine/token for this call
            prev, extract.ENEMY_SPINE_SUB = extract.ENEMY_SPINE_SUB, TOKEN_SPINE_SUB
            try:
                k = extract.write_enemy_spine(objects, t, tid, out_root, manifest, log)
            except Exception as e:
                log(f'  warn {tid}: {e}')
                k = 0
            finally:
                extract.ENEMY_SPINE_SUB = prev
            if k:
                wanted.discard(tid)
                n += k
                log(f'{f.name}: {tid} -> {TOKEN_SPINE_SUB}/{tid} ({k} files)')
    for tid in sorted(wanted):
        log(f'skip (not found) token Spine {tid}')
    return n


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--game', required=True, help='folder holding pkgrps/btl_pfb_tokens_*.ab')
    ap.add_argument('--out', default=str(ROOT / 'public/assets/local'))
    ap.add_argument('--manifest', default=str(ROOT / 'data/local-assets.json'))
    ap.add_argument('--id', action='append', default=[], help='token id (default: TOKEN_SPINES)')
    args = ap.parse_args()
    out_root = Path(args.out)
    out_root.mkdir(parents=True, exist_ok=True)
    manifest = {}
    total = export_token_spines(Path(args.game), out_root, manifest, print, args.id or TOKEN_SPINES)
    old = {}
    if Path(args.manifest).exists():
        try:
            old = json.loads(Path(args.manifest).read_text(encoding='utf-8')).get('groups') or {}
        except (OSError, ValueError) as e:
            print(f'warn: previous manifest unreadable ({e})', file=sys.stderr)
    groups = extract.merge_manifest(old, manifest, set(manifest))
    count = sum(len(v) for v in groups.values())
    doc = {'version': 1, 'source': 'local-client', 'count': count, 'groups': groups}
    Path(args.manifest).write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'done: {total} files extracted, manifest {args.manifest} ({count} entries)')
    return 0 if total else 1


if __name__ == '__main__':
    sys.exit(main())
