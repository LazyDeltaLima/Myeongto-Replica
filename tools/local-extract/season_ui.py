#!/usr/bin/env python3
"""Extract a 卫戍协议 season's own UI art from a locally installed client (optional, host-side).

A season after 盟约 has art the public mirror does not carry yet and the EN client lacks: its hub backdrop and logos
(activity/[uc]<season>.ab) and the icons its tables add to the shared autochess UI bundles. This tool reads them from
the client that has the season (the CN one: SP_CLIENT_CN, tools/local-extract/client_path.py) and writes, for a season
id of shared/seasons.js:

  season/<id>/backdrop/title      the season hub's background as the event lays it out (SEASONS[id]['backdrop']: the
                                  layers of its on-season entry panel, back to front, at their offsets), one JPEG
  season/<id>/logo/<sprite>       the season's logos as they are (SEASONS[id]['logos'])
  season/<id>/banner/tab          the title's season tab picture (SEASONS[id]['banner']): the event's home activity card
                                  art cut to its picture (the part left of `crop` carries the Chinese logo), one JPEG
  season/<id>/logo/<sprite>_ko    a logo whose Chinese title is written over in Korean (SEASONS[id]['logo_ko']): the
                                  Chinese lines are filled with their own row's plate colour and the Korean of the same
                                  msgids (public/i18n/ko.json) is set in the official UI face — the one Font asset of the
                                  game that has Hangul, read from the EN client (SP_CLIENT); maintainer decision 2026-11-08
  season/<id>/<dir>/<sprite>      every sprite of the icon folders the season's tables point at (SEASONS[id]['icons']),
                                  by folder: one name can be in two folders with two pictures (modeicon / modeselecticon)
  season/<id>/skin/<sprite>       the sprites of the season's default UI theme bundle (SEASONS[id]['skin']), each at its
                                  sprite rect: a texture packed tight is put back where it sits in the rect
  season/<id>/bondboard/<max>_<n> the bond disc boards as the theme's bond_icon_view_item lays them (SEASONS[id]
                                  ['bondboard']): bg_active (all lit) or bg_inactive, the ring of every segment in grey
                                  (bg_total) and the n lit segments in the theme's colour (bg_actual), from the white
                                  ring pieces bondboardicon/<max>_<n> — one picture per state, n = 0…max

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
        # group_season_background (1189×494, the home screen's activity card while the season runs): its logo with the
        # Chinese title sits in x < 380, the tab draws the emblem season_logo over the rest (maintainer decision 2026-11-10)
        'banner': {'sprite': 'group_season_background', 'crop': (380, 0, 1189, 494), 'width': 480},
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
        # bond_icon_view_item of the theme: bg_total #a1a1a1 at 80 % (its prefab colour), bg_actual in the theme's
        # skinColorDataDict skinDarkColor #00FFC4 — the prefab leaves it white and the client tints it at run time; an
        # official CN screen (2026-11-10) shows the lit segments in that field for two themes at once (the default
        # #00FFC4, the purchased ac_s_closur #2E38FF, not its skinLightColor #00D2FF)
        'bondboard': {'pieces': ('ui/autochess/[uc]autochessbattle.ab', 'bondboardicon'), 'total': (161, 161, 161, 0.8), 'actual': (0, 255, 196, 1.0)},
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


def full_rect(d):
    """A Sprite's picture at its rect: the client packs some textures tight (the transparent margin cut away) and keeps
    where they sit in the rect (m_RD.textureRectOffset, from the bottom left); UnityPy hands the tight texture."""
    from PIL import Image
    im = d.image.convert('RGBA')
    w, h = round(d.m_Rect.width), round(d.m_Rect.height)
    if (im.width, im.height) == (w, h):
        return im
    off = d.m_RD.textureRectOffset
    canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    canvas.alpha_composite(im, (round(off.x), round(h - off.y - im.height)))
    return canvas


def tinted(im, rgba):
    """A white sprite in one colour (Unity's Image colour multiplies it)."""
    from PIL import Image
    r, g, b, a = rgba
    out = Image.new('RGBA', im.size, (r, g, b, 255))
    out.putalpha(im.getchannel('A').point(lambda v: round(v * a)))
    return out


def bond_boards(pieces, active, inactive, spec):
    """{'<max>_<n>': image} for max 1…4 and n 0…max (n = max: the full, active disc)."""
    from PIL import Image
    out = {}
    for mx in range(1, 5):
        if f'{mx}_{mx}' not in pieces:
            continue
        for n in range(0, mx + 1):
            bg = active if n == mx else inactive
            board = Image.new('RGBA', bg.size, (0, 0, 0, 0))
            board.alpha_composite(bg)
            board.alpha_composite(tinted(pieces[f'{mx}_{mx}'], spec['total']))
            if n:
                board.alpha_composite(tinted(pieces[f'{mx}_{n}'], spec['actual']))
            out[f'{mx}_{n}'] = board
    return out


def sprites_by_folder(env, folders, full=False):
    """{folder: {name: image}} of the Sprites whose container path is …/arts/<folder>/<name> (`full`: at the rect)."""
    out = {}
    for path, obj in env.container.items():
        if obj.type.name != 'Sprite':
            continue
        parts = path.split('/')
        if len(parts) < 3 or parts[-3] != 'arts' or parts[-2] not in folders:
            continue
        d = obj.read()
        out.setdefault(parts[-2], {})[d.m_Name] = full_rect(d) if full else d.image.convert('RGBA')
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
    if spec.get('banner'):
        names.add(spec['banner']['sprite'])
    art = sprites_by_name(env, names)
    save('backdrop', 'title', compose_backdrop(art, spec['backdrop']), 'jpg')
    for n in spec['logos']:
        save('logo', n, art[n])
    bn = spec.get('banner')
    if bn:
        from PIL import Image
        im = art[bn['sprite']].crop(bn['crop']).convert('RGB')
        save('banner', 'tab', im.resize((bn['width'], round(im.height * bn['width'] / im.width)), Image.LANCZOS), 'jpg')
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
        skin = {}
        for o in senv.objects:
            if o.type.name == 'Sprite':
                d = o.read()
                if d.m_Name not in skin:
                    skin[d.m_Name] = full_rect(d)
                    save('skin', d.m_Name, skin[d.m_Name])
        if spec.get('bondboard'):
            rel, folder = spec['bondboard']['pieces']
            pieces = sprites_by_folder(load(game, rel), {folder}, full=True).get(folder, {})
            for name, im in sorted(bond_boards(pieces, skin['bg_active'], skin['bg_inactive'], spec['bondboard']).items()):
                save('bondboard', name, im)

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
