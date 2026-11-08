#!/usr/bin/env python3
"""Extract a 卫戍协议 season's own UI art from a locally installed client (optional, host-side).

A season after 盟约 has art the public mirror does not carry yet and the EN client lacks: its hub backdrop and logos
(activity/[uc]<season>.ab) and the icons its tables add to the shared autochess UI bundles. This tool reads them from
the client that has the season (the CN one: SP_CLIENT_CN, tools/local-extract/client_path.py) and writes, for a season
id of shared/seasons.js:

  season/<id>/backdrop/title      the season hub's background as the event lays it out (SEASONS[id]['backdrop']: the
                                  layers of its on-season entry panel, back to front, at their offsets), one JPEG
  season/<id>/logo/<sprite>       the season's logos as they are (SEASONS[id]['logos'])
  season/<id>/logo/<sprite>_ko    a logo whose Chinese title is written over in Korean (SEASONS[id]['logo_ko']): the
                                  Chinese lines are filled with their own row's plate colour and the Korean of the same
                                  msgids (public/i18n/ko.json) is set in the official UI face — the one Font asset of the
                                  game that has Hangul, read from the EN client (SP_CLIENT); maintainer decision 2026-11-08
  season/<id>/<dir>/<sprite>      every sprite of the icon folders the season's tables point at (SEASONS[id]['icons']),
                                  by folder: one name can be in two folders with two pictures (modeicon / modeselecticon)
  season/<id>/skin/<sprite>       the sprites of the season's default UI theme bundle (SEASONS[id]['skin'])

into <out>/season/<id>/… and the groups `season/<id>/…` of data/local-assets.json (the other groups are kept; a full
tools/local-extract/extract.py run keeps these). The page looks them up with localAsset('season/<id>/<group>', name).
A newer copy of a bundle in PersistentData/Bundles (a hot update) wins over StreamingAssets/AB/Windows.

Usage:
  .venv-extract/bin/python tools/local-extract/season_ui.py [--season act3autochess] [--game <CN Arknights_Data>]
      [--font-client <EN Arknights_Data>] [--out public/assets/local] [--manifest data/local-assets.json]
Everything extracted is (c) Hypergryph; for private, non-commercial fan use only. Nothing extracted is committed.
"""
import argparse
import json
import sys
from io import BytesIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from client_path import ROOT, ensure_extract_env, client_data, client_data_cn  # noqa: E402

# The hub of 规程 is `panel_act3autochess_on_entry` (the season running; the off-season panel is not used, maintainer
# decision 2026-11-08): bkg_1 bkg_season_on, bkg_2 bg_season_on and bg_front bg_front_season_on, each centred in a
# 1559×960 frame, bg_front 149 units below the centre (its RectTransform pos y −149). The smoke / dust particles and
# the effect meshes between the layers are not drawn.
SEASONS = {
    'act3autochess': {
        'bundle': 'activity/[uc]act3autochess.ab',
        'backdrop': {'size': (1559, 960), 'layers': [('bkg_season_on', 0), ('bg_season_on', 0), ('bg_front_season_on', -149)]},
        # title_season: the hub's logo (root_title of the entry panel); season_logo: the bare emblem; season_logo_settle_game: the result screen's
        'logos': ['title_season', 'season_logo', 'season_logo_settle_game'],
        # 卫戍协议 in 136–217 × 192–215 and 规程 in 236–308 × 192–232 of title_season (its own pixels); x 222 is plate only
        'logo_ko': {'sprite': 'title_season', 'plate_x': 222, 'colour': (211, 195, 141),
                    'lines': [('卫戍协议', (136, 192, 217, 215)), ('规程', (236, 192, 308, 232))]},
        'icons': [
            ('ui/autochess/[uc]autochesscommon.ab', ['bandicon', 'bondicon', 'shopitemicon', 'modeicon', 'modeselecticon', 'garrisontypeicon']),
            ('ui/autochess/[uc]autochessouter.ab', ['medalicon', 'enemytypeicon', 'diychooselevelsprite', 'shoplevelsprite', 'chesslevelsprite']),
            ('ui/autochess/[uc]autochessbattle.ab', ['bondphaseicon', 'bufficon', 'modeinfotitle', 'bondboardicon']),
        ],
        # activity_table autoChessData.skinConsts.defaultAutoChessSkinId
        'skin': 'ui/autochess/autochessvariantskin/[uc]ac_n_initial.ab',
    },
}
# the official UI face with Hangul: a Font asset of the EN client's resources.assets
FONT_ASSETS = 'resources.assets'
FONT_NAME = 'SourceHanSansSC-Bold'
# the backdrop is opaque: a JPEG (a WebP of the local extracts stands for a board PNG beside it, test/render/board3d-extract)
BACKDROP_JPEG = {'quality': 90, 'optimize': True}


def bundle_path(game, rel):
    """The newest copy of a bundle: PersistentData/Bundles (hot update) first, then StreamingAssets/AB/Windows."""
    for sub in ('PersistentData/Bundles', 'StreamingAssets/AB/Windows'):
        p = Path(game) / sub / rel
        if p.exists():
            return p
    return None


def load(game, rel):
    import UnityPy
    p = bundle_path(game, rel)
    if p is None:
        raise SystemExit(f'{rel}: not in {game} (is this the client that has the season?)')
    return UnityPy.load(str(p))


def sprites_by_name(env, names):
    out = {}
    for o in env.objects:
        if o.type.name != 'Sprite':
            continue
        d = o.read()
        if d.m_Name in names and d.m_Name not in out:
            out[d.m_Name] = d.image.convert('RGBA')
    missing = set(names) - set(out)
    if missing:
        raise SystemExit(f'sprites missing: {", ".join(sorted(missing))}')
    return out


def sprites_by_folder(env, folders):
    """{folder: {name: image}} of the Sprites whose container path is …/arts/<folder>/<name>."""
    out = {}
    for path, obj in env.container.items():
        if obj.type.name != 'Sprite':
            continue
        parts = path.split('/')
        if len(parts) < 3 or parts[-3] != 'arts' or parts[-2] not in folders:
            continue
        d = obj.read()
        out.setdefault(parts[-2], {})[d.m_Name] = d.image.convert('RGBA')
    return out


def compose_backdrop(images, spec):
    from PIL import Image
    w, h = spec['size']
    canvas = Image.new('RGBA', (w, h), (0, 0, 0, 255))
    for name, dy in spec['layers']:
        im = images[name]
        canvas.alpha_composite(im, ((w - im.width) // 2, round(h / 2 - dy - im.height / 2)))
    return canvas.convert('RGB')


def official_font(font_client):
    import UnityPy
    p = Path(font_client) / FONT_ASSETS
    if not p.exists():
        raise SystemExit(f'{p}: missing (the EN client carries the UI face with Hangul)')
    for o in UnityPy.load(str(p)).objects:
        if o.type.name == 'Font':
            f = o.read()
            if f.m_Name == FONT_NAME:
                return bytes(f.m_FontData)
    raise SystemExit(f'{FONT_NAME}: no such Font in {p}')


def korean_logo(image, spec, font_bytes, ko):
    from PIL import ImageDraw, ImageFont
    im = image.copy()
    px = im.load()
    for _, (x0, y0, x1, y1) in spec['lines']:
        for y in range(y0, y1):
            plate = px[spec['plate_x'], y]
            for x in range(x0, x1):
                px[x, y] = plate
    draw = ImageDraw.Draw(im)
    for msgid, (x0, y0, x1, y1) in spec['lines']:
        text = ko.get(msgid)
        if not isinstance(text, str) or not text:
            raise SystemExit(f'public/i18n/ko.json has no Korean for {msgid}')
        w, h = x1 - x0, y1 - y0
        for size in range(90, 6, -1):  # the largest size that fits the Chinese line's box, centred in it
            font = ImageFont.truetype(BytesIO(font_bytes), size)
            l, t, r, b = draw.textbbox((0, 0), text, font=font)
            if r - l <= w and b - t <= h:
                draw.text((x0 + (w - (r - l)) // 2 - l, y0 + (h - (b - t)) // 2 - t), text, font=font,
                          fill=tuple(spec['colour']) + (255,))
                break
    return im


def main(argv=None):
    ensure_extract_env(argv)
    import aklz4  # noqa: F401  (registers the client's LZ4 variant with UnityPy)
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--season', default='act3autochess', choices=sorted(SEASONS))
    ap.add_argument('--game', help='the Arknights_Data folder of the client that has the season (default SP_CLIENT_CN)')
    ap.add_argument('--font-client', help='the Arknights_Data folder holding the Hangul UI face (default SP_CLIENT)')
    ap.add_argument('--out', default=str(ROOT / 'public/assets/local'))
    ap.add_argument('--manifest', default=str(ROOT / 'data/local-assets.json'))
    args = ap.parse_args(argv)
    game = args.game or client_data_cn()
    if not game:
        raise SystemExit('no client with the season: give --game or set SP_CLIENT_CN')
    font_client = args.font_client or client_data()
    spec = SEASONS[args.season]
    base = f'season/{args.season}'
    out_root = Path(args.out)
    groups = {}

    def save(group, name, im, fmt='png'):
        sub = f'{base}/{group}'
        folder = out_root / sub
        folder.mkdir(parents=True, exist_ok=True)
        fname = f'{name}.{fmt}'
        if fmt == 'jpg':
            im.save(folder / fname, 'JPEG', **BACKDROP_JPEG)
        else:
            im.save(folder / fname)
        groups.setdefault(sub, {})[name] = {'path': f'/assets/local/{sub}/{fname}', 'w': im.width, 'h': im.height, 'kind': 'Sprite'}

    env = load(game, spec['bundle'])
    names = {n for n, _ in spec['backdrop']['layers']} | set(spec['logos'])
    art = sprites_by_name(env, names)
    save('backdrop', 'title', compose_backdrop(art, spec['backdrop']), 'jpg')
    for n in spec['logos']:
        save('logo', n, art[n])
    lk = spec.get('logo_ko')
    if lk:
        ko = json.loads((ROOT / 'public/i18n/ko.json').read_text(encoding='utf-8'))
        save('logo', f"{lk['sprite']}_ko", korean_logo(art[lk['sprite']], lk, official_font(font_client), ko))
    for rel, folders in spec['icons']:
        found = sprites_by_folder(load(game, rel), set(folders))
        for folder in folders:
            if folder not in found:
                print(f'warn: {rel} has no arts/{folder}', file=sys.stderr)
            for name, im in sorted(found.get(folder, {}).items()):
                save(folder, name, im)
    if spec.get('skin'):
        senv = load(game, spec['skin'])
        seen = set()
        for o in senv.objects:
            if o.type.name == 'Sprite':
                d = o.read()
                if d.m_Name not in seen:
                    seen.add(d.m_Name)
                    save('skin', d.m_Name, d.image.convert('RGBA'))

    man = Path(args.manifest)
    doc = {'version': 1, 'source': 'local-client', 'count': 0, 'groups': {}}
    if man.exists():
        doc = json.loads(man.read_text(encoding='utf-8'))
    old = {k: v for k, v in (doc.get('groups') or {}).items() if k != base and not k.startswith(base + '/')}
    doc['groups'] = {**old, **groups}
    doc['count'] = sum(len(v) for v in doc['groups'].values())
    man.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    n = sum(len(v) for v in groups.values())
    for sub in sorted(groups):
        print(f'  {sub}: {len(groups[sub])}')
    print(f'done: {n} files under {out_root}/{base}, manifest {man} ({doc["count"]} entries)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
