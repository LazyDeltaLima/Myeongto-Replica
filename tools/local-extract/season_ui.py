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
  season/<id>/<group>/<sprite>    every sprite the images of a few screen prefabs show (SEASONS[id]['prefabs']), at its
                                  rect: a plain Image's Sprite, or an atlas image's picture cut from its atlas (the
                                  client's own atlas component: `_initAtlas` + `_initSpriteId`) — the prefab's own
                                  references, so a generic name (none, ban, tips) is the one that screen shows
  season/<id>/bondboard/<max>_<n> the bond disc boards as the theme's bond_icon_view_item lays them (SEASONS[id]
                                  ['bondboard']): bg_active (all lit) or bg_inactive, the ring of every segment in grey
                                  (bg_total) and the n lit segments in the theme's colour (bg_actual), from the white
                                  ring pieces bondboardicon/<max>_<n> — one picture per state, n = 0…max
  season/<id>/entry/film          the event's entry animation (SEASONS[id]['entry']) as data for public/js/ui/clipFilm.js:
                                  the RectTransform tree of the film (and the black cover over it), each node's Image
                                  (sprite, type, colour, material), the CanvasGroup alphas, what each material draws
                                  (read from its shader properties) and every keyframe of the panel's entry clip
                                  (tangents kept: Unity's Hermite curves), the hub's own nodes included — one JSON
  season/<id>/entry/<sprite>      the sprites the film's images show, at their rect, and the textures its flipbook
                                  materials sample (`tex_<texture>`)

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
        # the 3/3 确定自选编队 screen (public/js/screens/diyChoose.js): its state, tier rows and cards, the shared operator
        # card it holds (the out-of-match 干员调配 card) and that card's bond badge
        'prefabs': [
            ('ui/autochess/[uc]autochessouter.ab', 'diychoose', ['auto_chess_diy_choose_state', 'auto_chess_diy_choose_level_view',
                                                                 'auto_chess_diy_choose_char_view', 'auto_chess_deploy_char_item_view',
                                                                 'auto_chess_deploy_char_card_bond_item']),
        ],
        # activity_table autoChessData.skinConsts.defaultAutoChessSkinId
        'skin': 'ui/autochess/autochessvariantskin/[uc]ac_n_initial.ab',
        # bond_icon_view_item of the theme: bg_total #a1a1a1 at 80 % (its prefab colour), bg_actual in the theme's
        # skinColorDataDict skinDarkColor #00FFC4 — the prefab leaves it white and the client tints it at run time; an
        # official CN screen (2026-11-10) shows the lit segments in that field for two themes at once (the default
        # #00FFC4, the purchased ac_s_closur #2E38FF, not its skinLightColor #00D2FF)
        'bondboard': {'pieces': ('ui/autochess/[uc]autochessbattle.ab', 'bondboardicon'), 'total': (161, 161, 161, 0.8), 'actual': (0, 255, 196, 1.0)},
        # the hub panel plays its legacy Animation clip autochess_entry_season_on (3.17 s) as it opens: the film
        # canvas_front/entry_anim_season_on (off at 2.57 s) under the black cover cover_black_in, then the hub's own
        # nodes come in (canvas_back, title_effect/root_title, bottom_view, top_menu, the side panels)
        'entry': {'panel': 'panel_act3autochess_on_entry', 'film': 'canvas_front/entry_anim_season_on', 'cover': 'cover_black_in',
                  'clip': 'autochess_entry_season_on'},
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


def prefab_sprites(env, roots):
    """{name: image} of every picture the images under the GameObjects `roots` show: a plain Image's m_Sprite (at its
    rect), or an atlas image's sprite — the client's atlas component: `_initAtlas` (its `_sprites` name / guid / rect,
    the rect from the bottom left, and `_atlases` textures with a separate alpha texture) and `_initSpriteId` (a guid).
    Only references inside the bundle are followed (a picture of another bundle is drawn by its own screen)."""
    from PIL import Image
    objs = {o.path_id: o for o in env.objects}
    atlases = {}

    def atlas(pid):
        if pid not in atlases:
            t = objs[pid].read_typetree()
            tex = {}
            for a in t['_atlases']:
                im = objs[a['texture']['m_PathID']].read().image.convert('RGBA')
                if a['alpha']['m_PathID']:
                    im.putalpha(objs[a['alpha']['m_PathID']].read().image.convert('RGBA').getchannel('R').resize(im.size))
                tex[a['index']] = im
            atlases[pid] = ({s['guid']: s for s in t['_sprites']}, tex)
        return atlases[pid]

    out = {}

    def picture(ct):
        sp = ct.get('m_Sprite')
        if sp and sp['m_FileID'] == 0 and sp['m_PathID'] in objs:
            d = objs[sp['m_PathID']].read()
            return d.m_Name, full_rect(d)
        ref, sid = ct.get('_initAtlas'), ct.get('_initSpriteId')
        if sid and ref and ref['m_FileID'] == 0 and ref['m_PathID'] in objs:
            sprites, tex = atlas(ref['m_PathID'])
            s = sprites.get(sid)
            if not s:
                return None
            r, im = s['rect'], tex[s['atlas']]
            w, h = (r['h'], r['w']) if s['rotate'] else (r['w'], r['h'])
            top = im.height - r['y'] - h
            cut = im.crop((r['x'], top, r['x'] + w, top + h))
            return s['name'], cut.transpose(Image.ROTATE_90) if s['rotate'] else cut
        return None

    def walk(go):
        t = go.read_typetree()
        children = []
        for c in t['m_Component']:
            co = objs.get(c['component']['m_PathID'])
            if co is None or c['component']['m_FileID'] != 0:
                continue
            if co.type.name in ('RectTransform', 'Transform'):
                children = co.read_typetree()['m_Children']
            elif co.type.name == 'MonoBehaviour':
                try:
                    got = picture(co.read_typetree())
                except Exception:  # a component without a type tree
                    got = None
                if got and got[0] not in out:
                    out[got[0]] = got[1]
        for ch in children:
            tr = objs.get(ch['m_PathID'])
            if tr is not None:
                walk(objs[tr.read_typetree()['m_GameObject']['m_PathID']])

    by_name = {}
    for o in env.objects:
        if o.type.name == 'GameObject':
            n = o.read_typetree()['m_Name']
            if n in roots and n not in by_name:
                by_name[n] = o
    missing = set(roots) - set(by_name)
    if missing:
        raise SystemExit(f'prefabs missing: {", ".join(sorted(missing))}')
    for n in roots:
        walk(by_name[n])
    return out


def _r(v, n=4):
    return round(float(v), n)


def _slope(v):
    """A tangent; an infinite one (a stepped key: m_IsActive) is null."""
    v = float(v)
    return None if v != v or abs(v) == float('inf') else round(v, 5)


def material_draw(m):
    """What a UI material of the film draws, from its shader properties (no shader is read): a flipbook sheet
    (_Column × _Row frames of _ParticleTex, the frame picked by the image colour's r, tinted _Color1), a circle
    (_InStep / _OutStep of the UV radius, _AdditionMap = scan lines), a dissolve sweep (_Dissolve1_Tex, with
    _Mask_Tex = masked by scan lines) or a plain image; `add` when it blends One + One."""
    f = dict(m['m_SavedProperties']['m_Floats'])
    tex = dict(m['m_SavedProperties']['m_TexEnvs'])
    col = dict(m['m_SavedProperties']['m_Colors'])
    add = f.get('_DstBlend') == 1 or f.get('_Dst') == 1
    out = {'add': True} if add else {}
    if '_Column' in f and '_Row' in f and '_ParticleTex' in tex:
        c = col.get('_Color1') or {'r': 1, 'g': 1, 'b': 1, 'a': 1}
        out.update(kind='sheet', cols=int(f['_Column']), rows=int(f['_Row']), tint=[_r(c['r']), _r(c['g']), _r(c['b'])])
    elif '_InStep' in f and '_OutStep' in f:
        out.update(kind='ring', inStep=_r(f['_InStep']), inSmooth=_r(f.get('_InSmooth', 0)), outStep=_r(f['_OutStep']),
                   outSmooth=_r(f.get('_OutSmooth', 0)), lines=bool(tex.get('_AdditionMap', {}).get('m_Texture', {}).get('m_PathID')))
    elif '_Dissolve1_Tex' in tex:
        out.update(kind='dissolve', masked=bool(tex.get('_Mask_Tex', {}).get('m_Texture', {}).get('m_PathID')))
    return out


def entry_film(env, spec):
    """The entry animation of the season's hub panel: (pictures, film JSON). See the module doc, season/<id>/entry/film."""
    objs = {o.path_id: o for o in env.objects}
    cache = {}

    def tt(pid):
        if pid not in cache:
            o = objs.get(pid)
            try:
                cache[pid] = o.read_typetree() if o is not None else None
            except Exception:
                cache[pid] = None
        return cache[pid]

    def local(ref):
        return ref.get('m_PathID') if isinstance(ref, dict) and ref.get('m_PathID') and ref.get('m_FileID', 0) == 0 else None

    root = next((o for o in env.objects if o.type.name == 'GameObject' and (tt(o.path_id) or {}).get('m_Name') == spec['panel']), None)
    if root is None:
        raise SystemExit(f"entry: no {spec['panel']} in the bundle")
    sprite_ids, mats, nodes = {}, {}, []

    def node(go_pid, path):
        go = tt(go_pid)
        n = {'p': path, 'active': bool(go.get('m_IsActive', 1))}
        rt = None
        for c in go.get('m_Component', []):
            pid = c['component']['m_PathID']
            o = objs.get(pid)
            if o is None:
                continue
            t = o.type.name
            if t == 'RectTransform':
                rt = tt(pid)
                n.update(amin=[_r(rt['m_AnchorMin'][a]) for a in 'xy'], amax=[_r(rt['m_AnchorMax'][a]) for a in 'xy'],
                         pos=[_r(rt['m_AnchoredPosition'][a], 3) for a in 'xy'], size=[_r(rt['m_SizeDelta'][a], 3) for a in 'xy'],
                         piv=[_r(rt['m_Pivot'][a]) for a in 'xy'], scale=[_r(rt['m_LocalScale'][a]) for a in 'xy'])
            elif t == 'CanvasGroup':
                n['alpha'] = _r(tt(pid)['m_Alpha'])
            elif t == 'ParticleSystem':
                n['particles'] = True
            elif t == 'MonoBehaviour':
                m = tt(pid)
                if not m or 'm_Sprite' not in m or 'm_Color' not in m:
                    if m and 'm_ShowMaskGraphic' in m or m and 'm_Softness' in m:
                        n['mask'] = True
                    continue
                c = m['m_Color']
                img = {'type': int(m.get('m_Type', 0)), 'color': [_r(c[a]) for a in 'rgba']}
                sp = m['m_Sprite']
                if local(sp):
                    name = tt(sp['m_PathID'])['m_Name']
                    sprite_ids[sp['m_PathID']] = name
                    img['sprite'] = name
                elif isinstance(sp, dict) and sp.get('m_PathID'):
                    img['sprite'] = None  # a sprite of another bundle (the loading bar's flare): not carried
                mp = local(m.get('m_Material', {}))
                if mp:
                    md = tt(mp)
                    if md['m_Name'] not in mats:
                        mats[md['m_Name']] = dict(material_draw(md), _tex=md['m_SavedProperties']['m_TexEnvs'])
                    img['mat'] = md['m_Name']
                n['img'] = img
        nodes.append(n)
        if rt:
            for ch in rt['m_Children']:
                ct = tt(ch['m_PathID'])
                if ct:
                    g = tt(ct['m_GameObject']['m_PathID'])
                    node(ct['m_GameObject']['m_PathID'], f"{path}/{g['m_Name']}" if path else g['m_Name'])

    # walk only the film and the cover (by their paths under the panel)
    def find(go_pid, parts):
        if not parts:
            return go_pid
        go = tt(go_pid)
        for c in go.get('m_Component', []):
            o = objs.get(c['component']['m_PathID'])
            if o is not None and o.type.name == 'RectTransform':
                for ch in tt(o.path_id)['m_Children']:
                    ct = tt(ch['m_PathID'])
                    if ct and tt(ct['m_GameObject']['m_PathID'])['m_Name'] == parts[0]:
                        return find(ct['m_GameObject']['m_PathID'], parts[1:])
        raise SystemExit(f'entry: no {parts[0]} under {go["m_Name"]}')

    for path in (spec['film'], spec['cover']):
        node(find(root.path_id, path.split('/')), path)

    # the flipbook textures, saved beside the sprites
    pictures = {}
    for name, md in mats.items():
        if md.get('kind') == 'sheet':
            ref = dict(md['_tex']).get('_ParticleTex', {}).get('m_Texture', {})
            tp = local(ref)
            if tp:
                tex = objs[tp].read()
                md['tex'] = f'tex_{tex.m_Name}'
                pictures[md['tex']] = tex.image.convert('RGBA')
        del md['_tex']
    sprites = {}
    for pid, name in sprite_ids.items():
        d = objs[pid].read()
        pictures[name] = full_rect(d)
        b = d.m_Border
        sprites[name] = {'w': round(d.m_Rect.width), 'h': round(d.m_Rect.height), 'border': [_r(b.x), _r(b.y), _r(b.z), _r(b.w)]}

    clip = next((o for o in env.objects if o.type.name == 'AnimationClip' and (tt(o.path_id) or {}).get('m_Name') == spec['clip']), None)
    if clip is None:
        raise SystemExit(f"entry: no clip {spec['clip']}")
    c = tt(clip.path_id)
    curves = []
    for cv in c.get('m_FloatCurves', []):
        curves.append({'p': cv['path'], 'a': cv['attribute'],
                       'k': [[_r(k['time'], 5), _r(k['value'], 5), _slope(k['inSlope']), _slope(k['outSlope'])] for k in cv['curve']['m_Curve']]})
    for cv in c.get('m_ScaleCurves', []):
        curves.append({'p': cv['path'], 'a': 'scale',
                       'k': [[_r(k['time'], 5), [_r(k['value'][a], 5) for a in 'xy'], [_slope(k['inSlope'][a]) for a in 'xy'],
                              [_slope(k['outSlope'][a]) for a in 'xy']] for k in cv['curve']['m_Curve']]})
    length = max((k[0] for cv in curves for k in cv['k']), default=0)
    events = [[_r(e['time'], 5), e['functionName'], e.get('data') or ''] for e in c.get('m_Events', [])]
    film = {'version': 1, 'panel': spec['panel'], 'clip': spec['clip'], 'canvas': [1280, 720], 'length': _r(length, 5),
            'film': spec['film'], 'cover': spec['cover'], 'events': events, 'nodes': nodes, 'materials': mats,
            'sprites': sprites, 'curves': curves}
    return pictures, film


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
    for rel, group, roots in spec.get('prefabs', []):
        for name, im in sorted(prefab_sprites(load(game, rel), roots).items()):
            save(group, name, im)
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

    if spec.get('entry'):
        pictures, film = entry_film(env, spec['entry'])
        for name, im in sorted(pictures.items()):
            save('entry', name, im)
        sub = f'{base}/entry'
        (out_root / sub).mkdir(parents=True, exist_ok=True)
        (out_root / sub / 'film.json').write_text(json.dumps(film, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        groups.setdefault(sub, {})['film'] = {'path': f'/assets/local/{sub}/film.json', 'kind': 'Data'}

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
