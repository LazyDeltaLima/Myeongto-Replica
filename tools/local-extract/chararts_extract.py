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

Elite 2 (default, --elite 2): when the bundle has `<charId>_2` (the E2 art: a large scene in which the operator is
small) and the web mirror's portraits exist, the E2 art is used instead, cropped around the operator: the E2 portrait
(`/assets/char/portrait/<charId>_2.png`, itself a crop of that art) is found in it by multi-scale template matching
(OpenCV, score ≥ 0.6), and the E1 portrait in the E1 art the same way; the crop's `frame` is then computed so the E2
portrait lands exactly where the E1 portrait sits in the E1 frame — the card (ui/detailArt.js) frames it like before,
no code change. No E2 art, no portrait or a weak match: the E1 art as before. The entry says `elite: 2 | 1`.

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
from client_path import client_data  # noqa: E402
DEFAULT_GAME = client_data('PersistentData', 'Bundles')  # SP_CLIENT / .env / .client (client_path.py); --game overrides
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


def _read(env, stem):
    """(texture, alpha texture, frame) of `stem` in a chararts bundle."""
    tex = alpha = frame = None
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
                    frame = {'x': p['x'], 'y': p['y'], 'w': s['x'], 'h': s['y']}
    return tex, alpha, frame


def _image(tex, alpha):
    from PIL import Image
    img = tex.image.convert('RGBA')
    if alpha is not None:  # a separate alpha texture (any size): its channel becomes the art's alpha
        a = alpha.image.convert('RGB').convert('L').resize(img.size, Image.LANCZOS)  # stored as grey RGB (its own A is opaque)
        img.putalpha(a)
    return img


def find_portrait(art, portrait):
    """The portrait's rect (x, y, w, h, art px) inside `art` and the match score: multi-scale TM_CCOEFF_NORMED on grey
    (transparent parts over mid grey) — a coarse pass at half size, then a fine one around the best scale."""
    import cv2
    import numpy as np
    from PIL import Image

    def grey(im):
        bg = Image.new('RGBA', im.size, (128, 128, 128, 255))
        bg.alpha_composite(im)
        return cv2.cvtColor(np.array(bg.convert('RGB')), cv2.COLOR_RGB2GRAY)

    W = art.width
    def best_over(widths, p, f):
        best = None
        ph, pw = p.shape
        for tw in widths:
            a = grey(art.resize((max(1, round(tw * f)), max(1, round(tw * f * art.height / W))), Image.BILINEAR))
            if a.shape[0] < ph or a.shape[1] < pw:
                continue
            _, mv, _, ml = cv2.minMaxLoc(cv2.matchTemplate(a, p, cv2.TM_CCOEFF_NORMED))
            if best is None or mv > best[0]:
                best = (mv, tw, ml)
        return best

    P = grey(portrait)
    half = cv2.resize(P, (P.shape[1] // 2, P.shape[0] // 2), interpolation=cv2.INTER_AREA)
    coarse = best_over(range(300, 5200, 60), half, 0.5)
    if coarse is None:
        return None, 0.0
    fine = best_over(range(max(300, coarse[1] - 60), coarse[1] + 61, 6), P, 1.0)
    mv, tw, (x, y) = fine
    s = W / tw
    return (x * s, y * s, P.shape[1] * s, P.shape[0] * s), mv


def e2_crop(img2, fr2_unused, img1, fr1, por1, por2, log, cid):
    """The E2 art cropped around the operator + a frame placing its portrait where the E1 portrait sits in the E1 frame."""
    r1, m1 = find_portrait(img1, por1)
    r2, m2 = find_portrait(img2, por2)
    if r1 is None or r2 is None or m1 < 0.6 or m2 < 0.6:
        log(f'{cid}: E2 match too weak (E1 {m1:.2f}, E2 {m2:.2f}) — E1 art kept')
        return None
    # E1: frame units per art px, and the portrait's centre / height in frame units (y up)
    k1 = fr1['w'] / img1.width
    U = fr1['x'] + ((r1[0] + r1[2] / 2) / img1.width - 0.5) * fr1['w']
    V = fr1['y'] - ((r1[1] + r1[3] / 2) / img1.height - 0.5) * fr1['h']
    k2 = r1[3] * k1 / r2[3]
    # the crop: about 3.2 portrait heights wide, 4 high, from a portrait height above its centre (head to knees)
    h2, cx2, cy2 = r2[3], r2[0] + r2[2] / 2, r2[1] + r2[3] / 2
    x0, y0 = max(0, round(cx2 - 1.6 * h2)), max(0, round(cy2 - 1.0 * h2))
    x1, y1 = min(img2.width, round(cx2 + 1.6 * h2)), min(img2.height, round(cy2 + 3.0 * h2))
    crop = img2.crop((x0, y0, x1, y1))
    cw, ch = crop.size
    frame = {'x': U - (cx2 - x0 - cw / 2) * k2, 'y': V + (cy2 - y0 - ch / 2) * k2, 'w': cw * k2, 'h': ch * k2}
    log(f'{cid}: E2 crop {cw}×{ch} at ({x0},{y0}) of {img2.width}², match E1 {m1:.2f} E2 {m2:.2f}')
    return crop, frame


def export_art(ab, cid, out_dir, max_side, quality, log, elite=2, portraits=None):
    import aklz4  # noqa: F401  (registers the LZ4AK decoder)
    import UnityPy
    from PIL import Image
    env = UnityPy.load(str(ab))
    tex1, alpha1, frame = _read(env, f'{cid}_1')
    if tex1 is None:
        return None
    img = _image(tex1, alpha1)
    used = 1
    if elite >= 2 and portraits and frame:
        tex2, alpha2, fr2 = _read(env, f'{cid}_2')
        p1, p2 = Path(portraits) / f'{cid}_1.png', Path(portraits) / f'{cid}_2.png'
        if tex2 is not None and p1.exists() and p2.exists():
            got = e2_crop(_image(tex2, alpha2), fr2, img, frame, Image.open(p1).convert('RGBA'), Image.open(p2).convert('RGBA'), log, cid)
            if got:
                img, frame = got
                used = 2
    w, h = img.size
    scale = min(1.0, max_side / max(w, h))
    if scale < 1:
        img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    out = out_dir / f'{cid}.webp'
    img.save(out, 'WEBP', quality=quality, method=6, exact=False)
    log(f'{cid}: E{used} {w}×{h} → {img.size[0]}×{img.size[1]} {out.stat().st_size // 1024} KB{"" if frame else " (no illust frame)"}')
    entry = {'path': f'/assets/local/{SUB}/{cid}.webp', 'w': img.size[0], 'h': img.size[1], 'kind': 'Illust', 'elite': used}
    if frame:
        entry['frame'] = {k: round(v, 2) for k, v in frame.items()}
    return entry


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--game', default=DEFAULT_GAME, help='folder holding chararts/<charId>.ab')
    ap.add_argument('--out', default=str(ROOT / 'public/assets/local'))
    ap.add_argument('--manifest', default=str(ROOT / 'data/local-assets.json'))
    ap.add_argument('--id', action='append', default=[], help='charId (default: every charId of chess.json / diy.json, tokens with art)')
    ap.add_argument('--max', type=int, default=1024, help='long side, px')
    ap.add_argument('--quality', type=int, default=85)
    ap.add_argument('--elite', type=int, default=2, choices=(1, 2), help='2: the E2 art cropped around the operator when it can be placed')
    ap.add_argument('--portraits', default=str(ROOT / 'public/assets/char/portrait'), help='the web mirror portraits (<charId>_1/_2.png)')
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
            e = export_art(ab, cid, out_dir, args.max, args.quality, print, args.elite, args.portraits)
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
