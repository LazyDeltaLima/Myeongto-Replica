#!/usr/bin/env python3
"""Operator art (立绘) from the local client for the unit card (local patch, docs/LOCAL-PATCH.md 「정비 화면 HUD」).

The in-game unit card (public/js/ui/detailArt.js) draws the operator's full art on the left edge; the web mirrors only
carry the 180×360 half-body portraits. The client keeps the arts in chararts/<charId>.ab: the Sprite / Texture2D
`<charId>_1` (the default art, a square canvas — 1200 or 2048 px, pivot centred; BC7 with its alpha, or an
`<charId>_1[alpha]` texture beside it) and a GameObject `illust_<charId>_1` whose RectTransform places the art in the
client's illustration frame: `m_SizeDelta` (the drawn size) and `m_AnchoredPosition` (its centre's offset from the
frame's centre, y up) — the per-character framing that lines the faces up. This writes, for every charId the mode uses
(data/chess.json, data/diy.json; tokens only when they have an art bundle):
  chararts/<charId>.webp   the default art, the full canvas, long side ≤ 1024, lossy q85 with alpha
and merges a `chararts` group into data/local-assets.json (re-read right before writing; other groups kept):
  chararts → { <charId>: { path, w, h, kind: 'Illust', frame: { x, y, w, h } } }   frame = the illust RectTransform

Usage (from the repo root; --game = the folder holding chararts/, e.g. the EN client's PersistentData/Bundles):
  .venv-extract/bin/python tools/local-extract/chararts_extract.py --game <Bundles> [--id char_…]… [--max 1024] [--quality 85]
Everything is (c) Hypergryph; for private, non-commercial fan use only.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import extract  # noqa: E402  (merge_manifest)

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_GAME = '/mnt/d/YostarGames/Arknights_EN/Arknights_Data/PersistentData/Bundles'
SUB = 'chararts'


def wanted_ids(root):
    """charIds of data/chess.json and data/diy.json (operators and the 甄选 picks), then token ids (art only if bundled)."""
    ids = []
    for name in ('chess.json', 'diy.json'):
        p = root / 'data' / name
        if not p.exists():
            continue
        doc = json.loads(p.read_text(encoding='utf-8'))
        recs = doc.get('chess', doc) if isinstance(doc, dict) else doc
        if isinstance(recs, dict):
            recs = recs.values()
        for r in recs:
            cid = r.get('charId') if isinstance(r, dict) else None
            if isinstance(cid, str) and cid.startswith('char_') and cid not in ids:
                ids.append(cid)
    tokens = root / 'data' / 'tokens.json'
    if tokens.exists():
        doc = json.loads(tokens.read_text(encoding='utf-8'))
        recs = doc.get('tokens', doc) if isinstance(doc, dict) else {}
        for tid in (recs.keys() if isinstance(recs, dict) else []):
            if tid not in ids:
                ids.append(tid)
    return ids


def export_art(ab, cid, out_dir, max_side, quality, log):
    import aklz4  # noqa: F401  (registers the LZ4AK decoder)
    import UnityPy
    from PIL import Image
    env = UnityPy.load(str(ab))
    stem = f'{cid}_1'
    tex = alpha = None
    frame = None
    objs = {o.path_id: o for o in env.objects}
    for o in env.objects:
        n = o.type.name
        if n == 'Texture2D':
            t = o.read()
            if t.m_Name == stem:
                tex = t
            elif t.m_Name == f'{stem}[alpha]':
                alpha = t
        elif n == 'GameObject':
            g = o.read_typetree()
            if g.get('m_Name') != f'illust_{stem}':
                continue
            for c in g.get('m_Component', []):
                co = objs.get(c['component']['m_PathID'])
                if co is not None and co.type.name == 'RectTransform':
                    rt = co.read_typetree()
                    p, s = rt['m_AnchoredPosition'], rt['m_SizeDelta']
                    frame = {'x': round(p['x'], 2), 'y': round(p['y'], 2), 'w': round(s['x'], 2), 'h': round(s['y'], 2)}
    if tex is None:
        return None
    img = tex.image.convert('RGBA')
    if alpha is not None:  # a separate alpha texture (any size): its channel becomes the art's alpha
        a = alpha.image.convert('RGB')
        a = a.convert('L').resize(img.size, Image.LANCZOS)  # stored as grey RGB (its own A is opaque)
        img.putalpha(a)
    w, h = img.size
    scale = min(1.0, max_side / max(w, h))
    if scale < 1:
        img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    out = out_dir / f'{cid}.webp'
    img.save(out, 'WEBP', quality=quality, method=6, exact=False)
    log(f'{cid}: {w}×{h} → {img.size[0]}×{img.size[1]} {out.stat().st_size // 1024} KB{" (+[alpha])" if alpha is not None else ""}{"" if frame else " (no illust frame)"}')
    entry = {'path': f'/assets/local/{SUB}/{cid}.webp', 'w': img.size[0], 'h': img.size[1], 'kind': 'Illust'}
    if frame:
        entry['frame'] = frame
    return entry


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--game', default=DEFAULT_GAME, help='folder holding chararts/<charId>.ab')
    ap.add_argument('--out', default=str(ROOT / 'public/assets/local'))
    ap.add_argument('--manifest', default=str(ROOT / 'data/local-assets.json'))
    ap.add_argument('--id', action='append', default=[], help='charId (default: every charId of chess.json / diy.json, tokens with art)')
    ap.add_argument('--max', type=int, default=1024, help='long side, px')
    ap.add_argument('--quality', type=int, default=85)
    args = ap.parse_args()
    game = Path(args.game) / 'chararts'
    out_dir = Path(args.out) / SUB
    out_dir.mkdir(parents=True, exist_ok=True)
    group, total = {}, 0
    for cid in args.id or wanted_ids(ROOT):
        ab = game / f'{cid}.ab'
        if not ab.exists():
            if cid.startswith('char_'):
                print(f'skip (no bundle) {cid}')
            continue
        try:
            e = export_art(ab, cid, out_dir, args.max, args.quality, print)
        except Exception as ex:  # a broken bundle: report it and go on
            print(f'FAIL {cid}: {ex}')
            continue
        if e:
            group[cid] = e
            total += (out_dir / f'{cid}.webp').stat().st_size
        else:
            print(f'skip (no {cid}_1 art) {cid}')
    # re-read right before writing (another extraction may have added groups meanwhile); with --id, keep the other arts
    old = {}
    if Path(args.manifest).exists():
        try:
            old = json.loads(Path(args.manifest).read_text(encoding='utf-8')).get('groups') or {}
        except (OSError, ValueError) as ex:
            print(f'warn: previous manifest unreadable ({ex})', file=sys.stderr)
    if args.id:
        group = {**(old.get(SUB) or {}), **group}
    groups = extract.merge_manifest(old, {SUB: group} if group else {}, {SUB} if group else set())
    count = sum(len(v) for v in groups.values())
    doc = {'version': 1, 'source': 'local-client', 'count': count, 'groups': groups}
    Path(args.manifest).write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'done: {len(group)} arts, {total / 1048576:.1f} MB this run, manifest {args.manifest} ({count} entries)')
    return 0 if group else 1


if __name__ == '__main__':
    sys.exit(main())
