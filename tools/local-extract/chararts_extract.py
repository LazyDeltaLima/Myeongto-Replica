#!/usr/bin/env python3
"""Operator art (立绘) from the local client for the unit card (local patch, docs/LOCAL-PATCH.md 「정비 화면 HUD」).

The in-game unit card (public/js/ui/detailArt.js) draws the operator's full art on the left edge; the web mirrors only
carry the 180×360 half-body portraits. The client keeps the arts in chararts/<charId>.ab: the Sprite / Texture2D
`<charId>_1` (the default art, a square canvas — 1200 or 2048 px, pivot centred; BC7 with its alpha, or an
`<charId>_1[alpha]` texture beside it) and a GameObject `illust_<charId>_1` that places the art in the client's
illustration frame: a size and its centre's offset from the frame's centre, y up — the per-character framing that lines
the faces up. The battle's unit card (UICharacterInfoPanel._LoadIllust) takes them from the prefab's StoreValueComponent
`ILLUST_SIZE` / `ILLUST_OFFSET` when it has them, else from its RectTransform (`m_SizeDelta`, `m_AnchoredPosition`):
illust_frame. This writes, for every charId the mode uses
(data/chess.json, the 선발 picks of data/backups.json, the seat cards of data/cards.json; tokens only when they have an art bundle):
  chararts/<charId>.webp        the default art, the full canvas, long side ≤ 1024, lossy q85 with alpha
  chararts/full/<charId>.webp   the same at the client texture's own size, when that is larger (save_illust)
and merges a `chararts` group into data/local-assets.json (re-read right before writing; other groups kept):
  chararts → { <charId>: { path, w, h, kind: 'Illust', frame: { x, y, w, h }, rect?: { x, y, w, h }, full?: { path, w, h } } }
  frame = the unit card's illust frame (illust_frame), rect = the same picture by the player card's frame (illust_rect,
  the waiting room's seat card), both in frame units: the same for both copies

Two copies (maintainer decision 2026-11-16): a phone takes the 1024 one, every other device the original resolution
(public/js/illust-res.js); the card drew the 1024 copy 1.3–2.4 times enlarged on a desktop. tools/build-browser-resources.mjs
pairs `<dir>/full/<name>` with `<dir>/<name>` so a browser pre-downloads only its own copy. The skin 立绘
(skin_extract.py) are written the same way.

Elite 2 (default, --elite 2): when the bundle has `<charId>_2` (the E2 art) with its `illust_<charId>_2` frame, the
card draws that art by that frame, as the official card does (measured on the maintainer's 1920×1080 screenshots of the
official card: the E2 texture at the client's own frame, not resized to the E1 face). No E2 art or frame: the E1 art
by its `illust_<charId>_1` frame. The entry says `elite: 2 | 1`. A body whose bundle has the E2 art alone (阿米娅's
医疗 form char_1037_amiya3: the form exists from E2 on) is the same case.

Every art is cropped to the card's window (card_crop): the part of the frame the card can show, its `frame` the crop's
own place in frame units — the card (ui/detailArt.js) draws it the same, and both copies keep only the pixels it shows.

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
FULL = 'full'  # the folder of the original-resolution copies, beside the 1024 ones
# The card's window onto the client frame, in rem (css/theme.css: 1rem = min(vw / 19.2, vh / 10.8), 100 px at 1920×1080):
# one frame unit = CARD_K rem and the frame's centre at (CARD_CX, CARD_CY) rem from the panel's top left — measured on
# the maintainer's 1920×1080 screenshots of the official card (雪猎's E2 art, two skin arts: 1.448 px a unit, the centre
# at (359.3, 605.7) px, docs/rules/ui.md 「정비 화면 HUD」)
# (css/hud-art.css `.dart.has-full-art .dart__bg` --k / --cx / --cy), the panel CARD_W rem wide (`.dpanel--chess` width)
# and CARD_H rem high on a 4:3 screen (19.2 × 3 / 4), the tallest the 1rem rule lays it out for — a wider screen shows
# less of it. test/local-extract.test.js holds these to the CSS.
CARD_K, CARD_CX, CARD_CY, CARD_W, CARD_H = .01448, 3.593, 6.057, 8.6, 14.4
# the StoreValueComponent keys the card reads its illust frame from (illust_frame)
ILLUST_OFFSET, ILLUST_SIZE = 'ILLUST_OFFSET', 'ILLUST_SIZE'


def full_rel(rel):
    """The original-resolution copy's path of a 立绘 path: `<dir>/full/<name>`."""
    d, _, n = rel.rpartition('/')
    return f'{d}/{FULL}/{n}' if d else f'{FULL}/{n}'


def save_illust(img, out_root, rel, max_side, quality):
    """Write a 立绘 as lossy WebP with alpha under out_root: `rel` with the long side ≤ max_side and, when the picture is
    larger, `full_rel(rel)` at its own size (a stale copy there is removed otherwise, so the files and the entry agree).
    Returns its entry { path, w, h, full?: { path, w, h } } (paths under /assets/local/)."""
    from PIL import Image
    out = Path(out_root) / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    full = Path(out_root) / full_rel(rel)
    big = {}
    if max(img.size) > max_side:
        full.parent.mkdir(parents=True, exist_ok=True)
        img.save(full, 'WEBP', quality=quality, method=6, exact=False)
        big = {'full': {'path': f'/assets/local/{full_rel(rel)}', 'w': img.width, 'h': img.height}}
        scale = max_side / max(img.size)
        img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    else:
        full.unlink(missing_ok=True)
    img.save(out, 'WEBP', quality=quality, method=6, exact=False)
    return {'path': f'/assets/local/{rel}', 'w': img.width, 'h': img.height, **big}


def wanted_ids(root):
    """The bodies of data/chess.json and of every season's data/seasons/<id>/chess.json (a record's character template
    `tmplId`, else its charId — shared/standIn.js chessBody) and the 선발 picks of data/backups.json
    (`diy.ownedPool`), the seat card operators of data/cards.json no season fields (shared/cardOperators.js
    CARD_EXTRA_OPERATORS), then token ids of data/tokens.json and data/backups.json `tokens` (art only if bundled)."""
    ids = []
    for f in [root / 'data' / 'chess.json', *sorted((root / 'data' / 'seasons').glob('*/chess.json'))]:
        doc = json.loads(f.read_text(encoding='utf-8'))
        recs = doc.get('chess', doc) if isinstance(doc, dict) else doc
        for r in (recs.values() if isinstance(recs, dict) else recs):
            cid = (r.get('tmplId') or r.get('charId')) if isinstance(r, dict) else None
            if isinstance(cid, str) and cid.startswith('char_') and cid not in ids:
                ids.append(cid)
    p = root / 'data' / 'backups.json'
    backups = json.loads(p.read_text(encoding='utf-8')) if p.exists() else {}
    for cid in (backups.get('diy') or {}).get('ownedPool') or []:
        if isinstance(cid, str) and cid.startswith('char_') and cid not in ids:
            ids.append(cid)
    p = root / 'data' / 'cards.json'
    for rec in (json.loads(p.read_text(encoding='utf-8')).get('operators') or []) if p.exists() else []:
        cid = rec.get('charId') if isinstance(rec, dict) else None
        if isinstance(cid, str) and cid.startswith('char_') and cid not in ids:
            ids.append(cid)
    token_maps = [backups.get('tokens') or {}]
    p = root / 'data' / 'tokens.json'
    if p.exists():
        doc = json.loads(p.read_text(encoding='utf-8'))
        token_maps.insert(0, doc.get('tokens', doc) if isinstance(doc, dict) else {})
    for recs in token_maps:
        for tid in (recs.keys() if isinstance(recs, dict) else []):
            if tid not in ids:
                ids.append(tid)
    return ids


def _vec(text):
    """A StoreValueComponent vector value ('x,y,z') as floats, or None."""
    try:
        v = [float(p) for p in str(text).split(',')]
    except ValueError:
        return None
    return v if len(v) >= 2 else None


def _centred(pos, size, pivot):
    """The frame of a RectTransform's picture — its CENTRE's offset from the anchor, y up, and its size — from the
    position the RectTransform places (`m_AnchoredPosition`, or the stored ILLUST_OFFSET that overwrites it: where the
    PIVOT sits), its size and its pivot (`m_Pivot`, 0..1 from the bottom left). Most illust prefabs have the pivot in the
    middle, so the two agree; 玛恩纳's E2 art has it at (0.389, 0.271), and reading the position as the centre put the art
    ~165 units left and ~340 down — the card showed his 剑魂's arm, not him."""
    px, py = (pivot['x'], pivot['y']) if pivot else (.5, .5)
    return {'x': pos[0] + (.5 - px) * size[0], 'y': pos[1] + (.5 - py) * size[1], 'w': size[0], 'h': size[1]}


def _rect_parts(components):
    """(position, size, pivot) of the RectTransform among a prefab root's read components, or None."""
    for t in components:
        if 'm_AnchoredPosition' in t and 'm_SizeDelta' in t:
            p, s = t['m_AnchoredPosition'], t['m_SizeDelta']
            return (p['x'], p['y']), (s['x'], s['y']), t.get('m_Pivot')
    return None


def illust_frame(components):
    """The frame the battle's unit card draws an `illust_*` prefab by (UICharacterInfoPanel._LoadIllust), from the read
    typetrees of its root's components: the StoreValueComponent's ILLUST_OFFSET (the anchored position, y up) and
    ILLUST_SIZE (the drawn size) when it has both, else the RectTransform (`m_AnchoredPosition`, `m_SizeDelta`); either
    placed about the RectTransform's pivot, which the card keeps (_centred); None without either. Most E2 arts and skin
    arts have the stored pair, which differs from the RectTransform (雪猎's E2: stored 1770.9 @ (−112.3, 59.3),
    RectTransform 2048 @ (−118.4, 56))."""
    rect = _rect_parts(components)
    stored = None
    for t in components:
        if isinstance(t.get('_values'), list):
            vals = {v.get('key'): _vec(v.get('value')) for v in t['_values'] if isinstance(v, dict)}
            off, size = vals.get(ILLUST_OFFSET), vals.get(ILLUST_SIZE)
            if off and size:
                stored = (off[0], off[1]), (size[0], size[1])
    pivot = rect[2] if rect else None
    if stored:
        return _centred(*stored, pivot)
    return _centred(*rect) if rect else None


def illust_rect(components):
    """The `illust_*` prefab's own RectTransform (`m_AnchoredPosition`, `m_SizeDelta` about its `m_Pivot`: the centre's
    offset, y up, and the size, _centred), the frame a player card draws the art by — not the battle's unit card, which
    prefers the stored pair (illust_frame). Measured on the maintainer's 1920×1080 screenshot of the official settlement
    cards (two skin arts whose stored pairs and RectTransforms differ): the RectTransform puts both at one scale and one
    centre, the stored pair does not (docs/rules/ui.md 「명함 오퍼레이터」). None without one."""
    rect = _rect_parts(components)
    return _centred(*rect) if rect else None


def part_in(part, frame, other):
    """`part` — a frame in `frame`'s units placing a piece of the art that `frame` draws whole (card_crop's crop) — in
    the units of `other`, another frame the whole art is drawn by (illust_rect)."""
    kx, ky = other['w'] / frame['w'], other['h'] / frame['h']
    return {'x': other['x'] + (part['x'] - frame['x']) * kx, 'y': other['y'] + (part['y'] - frame['y']) * ky,
            'w': part['w'] * kx, 'h': part['h'] * ky}


def component_trees(go, objects):
    """The read typetrees of a GameObject typetree's own components (RectTransform, MonoBehaviours) in `objects`."""
    out = []
    for c in go.get('m_Component') or []:
        ref = c.get('component') or {}
        co = objects.get(ref.get('m_PathID')) if not ref.get('m_FileID') else None
        if co is not None and co.type.name in ('RectTransform', 'MonoBehaviour'):
            out.append(co.read_typetree())
    return out


def _read(env, stem):
    """(texture, alpha texture, frame, rect) of `stem` in a chararts bundle (frame: illust_frame of `illust_<stem>`,
    rect: its illust_rect)."""
    tex = alpha = frame = rect = None
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
            trees = component_trees(g, objs)
            frame, rect = illust_frame(trees), illust_rect(trees)
    return tex, alpha, frame, rect


def _image(tex, alpha):
    from PIL import Image
    img = tex.image.convert('RGBA')
    if alpha is not None:  # a separate alpha texture (any size): its channel becomes the art's alpha
        a = alpha.image.convert('RGB').convert('L').resize(img.size, Image.LANCZOS)  # stored as grey RGB (its own A is opaque)
        img.putalpha(a)
    return img


def card_crop(img, frame):
    """The part of `img` (drawn by `frame`: size w × h, centre offset x / y from the frame's centre, y up) that the card's
    window (CARD_*) can show, and the crop's own frame; (img, frame) unchanged when the window holds it all."""
    sx, sy = img.width / frame['w'], img.height / frame['h']  # art px per frame unit
    left = CARD_CX + (frame['x'] - frame['w'] / 2) * CARD_K  # the art's top left in rem
    top = CARD_CY - (frame['y'] + frame['h'] / 2) * CARD_K
    def px(v, s, n):
        return min(n, max(0, v / CARD_K * s))
    x0, x1 = int(px(-left, sx, img.width)), -int(-px(CARD_W - left, sx, img.width))  # floor / ceil
    y0, y1 = int(px(-top, sy, img.height)), -int(-px(CARD_H - top, sy, img.height))
    if x1 <= x0 or y1 <= y0:
        return None, None  # the window misses the art
    if (x0, y0, x1, y1) == (0, 0, img.width, img.height):
        return img, frame
    cw, ch = x1 - x0, y1 - y0
    return img.crop((x0, y0, x1, y1)), {
        'x': frame['x'] - frame['w'] / 2 + (x0 + cw / 2) / sx, 'y': frame['y'] + frame['h'] / 2 - (y0 + ch / 2) / sy,
        'w': cw / sx, 'h': ch / sy}


def export_art(ab, cid, out_dir, max_side, quality, log, elite=2):
    import aklz4  # noqa: F401  (registers the LZ4AK decoder)
    import UnityPy
    env = UnityPy.load(str(ab))
    tex, alpha, frame, rect = _read(env, f'{cid}_1')
    used = 1
    if elite >= 2 or tex is None:  # the E2 art by its own frame; a form that only exists from E2 on has nothing else
        tex2, alpha2, fr2, rect2 = _read(env, f'{cid}_2')
        if tex2 is not None and (fr2 or tex is None):
            tex, alpha, frame, rect, used = tex2, alpha2, fr2, rect2, 2
    if tex is None:
        return None
    img = _image(tex, alpha)
    if frame:
        got, fr = card_crop(img, frame)
        if got is None:
            log(f'{cid}: E{used} art outside the card window — written whole')
        else:
            if rect:  # the crop by the player card's frame too
                rect = part_in(fr, frame, rect)
            img, frame = got, fr
    w, h = img.size
    saved = save_illust(img, out_dir.parent, f'{out_dir.name}/{cid}.webp', max_side, quality)
    kb = sum((out_dir.parent / e['path'][len('/assets/local/'):]).stat().st_size for e in (saved, saved.get('full')) if e) // 1024
    log(f'{cid}: E{used} {w}×{h} → {saved["w"]}×{saved["h"]}{" + full" if "full" in saved else ""} {kb} KB{"" if frame else " (no illust frame)"}')
    entry = {'path': saved['path'], 'w': saved['w'], 'h': saved['h'], 'kind': 'Illust', 'elite': used}
    if frame:
        entry['frame'] = {k: round(v, 2) for k, v in frame.items()}
    if rect:
        entry['rect'] = {k: round(v, 2) for k, v in rect.items()}
    if 'full' in saved:
        entry['full'] = saved['full']
    return entry


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--game', default=DEFAULT_GAME, help='folder holding chararts/<charId>.ab')
    ap.add_argument('--out', default=str(ROOT / 'public/assets/local'))
    ap.add_argument('--manifest', default=str(ROOT / 'data/local-assets.json'))
    ap.add_argument('--id', action='append', default=[], help='charId (default: every charId of chess.json and the 선발 picks of backups.json, tokens with art)')
    ap.add_argument('--max', type=int, default=1024, help='long side, px')
    ap.add_argument('--quality', type=int, default=85)
    ap.add_argument('--elite', type=int, default=2, choices=(1, 2), help='2: the E2 art by its own frame when the bundle has both')
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
            e = export_art(ab, cid, out_dir, args.max, args.quality, print, args.elite)
        except Exception as ex:  # a broken bundle: report it and go on
            print(f'FAIL {cid}: {ex}')
            continue
        if e:
            group[cid] = e
            total += sum((out_dir.parent / f['path'][len('/assets/local/'):]).stat().st_size for f in (e, e.get('full')) if f)
        else:
            print(f'skip (no {cid}_1 / _2 art) {cid}')
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
