#!/usr/bin/env python3
"""Operator and summon skins (时装) from the local clients: the battle Spine model and the pictures of every official
skin of the operators and summons the mode draws (maintainer decision 2026-11-16: all of them). Display only: a battle
is decided on the default model (docs/rules/render.md 「스킨 모델 소재」).

Which skins: the official skin table (Kengxxiao zh_CN `excel/skin_table.json`, cached in .cache/gamedata/excel/ and
downloaded when missing) — every `charSkins` record of an operator of data/assets.json `chars` or a summon of
data/assets.json `tokens` (or a summon an operator skin's `tokenSkinMap` dresses) whose `battleSkin.skinOrPrefabId` is a
prefab of its own (not `DefaultSkin` / null). An operator skin keeps its `tokenSkinMap` (summon → summon skin key).

Where: `skinpack/<ownerId>.ab`, prefab `dyn/battle/prefabs/skins/character/<ownerId>/<prefab id in lower case>.prefab`,
read from the EN client first (its hot-update bundles, then the install), then the CN client for what the EN one lacks
(client_path.clients). An operator's prefab has Front and Back renderers (one `Spine` renderer: the front only); a
summon's is drawn by its Front / only renderer (extract.pick_spine_node), as the default summon models are.

Pictures (the skin picker's tiles and its preview, as the default operator's web-mirror avatar / portrait and the
chararts art): the record's own `avatarId` (1:1, 180 px), `portraitId` (1:2, 180×360) and `illustId` (the 立绘). The
avatar and portrait are found by the client's name → path maps (`arts/charavatars/avatar_hub.ab`,
`arts/charportraits/portraits_hub.ab`; ids matched without case) in the sprite packs (`spritepack/ui_char_avatar_*.ab`,
`spritepack/char_portrait_*.ab`); the 立绘 is the `illust_<skin>` prefab of the owner's skinpack: its Image sprite's
texture (the whole square canvas, with the sprite's alpha texture when it has one) and its RectTransform, the frame
chararts_extract.py reads for the default art. The summons' skin records carry an avatar only, and not every one of them
is in the client (the summon then keeps its default one).

File names: the official ids carry `#` (`char_202_demkni_boc#1`), which a URL reads as the start of a fragment — the
browser's resource list refuses such paths (public/js/resources.js PATH_RE). Every folder and file name goes through
file_name(), the one place that names the output: `#` → `-` (no official skin, skeleton or page name has a `-`, so two
names never meet), anything else outside [A-Za-z0-9_.] stops the run. The atlas text is rewritten to the renamed pages.

Output (under --out, public/assets/local by default):
  spine/skin/<owner>/<prefab>/<front|back>/<prefab>.skel | .atlas | <page>.png      (pages premultiplied, as the
                                                                                  enemy / token models: write_spine)
  spine/skin/<owner>/<prefab>/avatar/<avatarId>.png      180×180, as the client has it
  spine/skin/<owner>/<prefab>/portrait/<portraitId>.png  180×360
  spine/skin/<owner>/<prefab>/illust/<illustId>.webp     the whole canvas, long side ≤ 1024, lossy q85 with alpha
  spine/skin/<owner>/<prefab>/illust/full/<illustId>.webp  the same at the client texture's own size, when larger (a phone
                                                         takes the first, other devices this one: chararts_extract.py
                                                         save_illust, maintainer decision 2026-11-16)
  spine/skin/skins.json   { version, source, skins: { <skin key>: { owner, prefab, client, name?, front, back?, tokens?,
                                                                    avatar?, portrait?, illust? } },
                            missing: { <skin key>: { owner, why } }, artMissing: { <skin key>: [kind…] } }
                          name = the record's `displaySkin.skinName` in Chinese (the summons' skins have none): the
                          picker shows it through tName, whose Korean / English … come from the official skin tables of
                          those servers (tools/build-i18n.mjs skinNameRows; docs/rules/ui.md 「스킨 고르기」);
                          front / back = { skel, atlas, textures[], pma }; avatar / portrait = { path, w, h };
                          illust = { path, w, h, frame: { x, y, w, h }, full?: { path, w, h } } (frame = the illust
                          RectTransform, as chararts, in frame units: the same for both copies)
A skin whose model is missing gets no pictures either (the picker does not offer it).
The index is a file of its own, not a data/local-assets.json group: that manifest goes to every page, the skins only to
those who take the skin data. tools/build-browser-resources.mjs leaves the whole spine/skin/ folder out of the pre-download
list until the skin data is a pack of its own.

Usage (from the repo root):
  .venv-extract/bin/python tools/local-extract/skin_extract.py [--id <ownerId>]… [--only models|art|names] [--out public/assets/local]
  python3 tools/local-extract/skin_extract.py --list     (the skins the table gives, as JSON; no client needed)
An --id run re-extracts only those owners and keeps the other rows of skins.json; --only runs one part and keeps the
other part's fields (--only art adds the pictures to the models already listed). Every run writes the names from the
table; --only names does only that, on the skins already listed (no client, seconds).
Everything is (c) Hypergryph; for private, non-commercial fan use only.
"""
import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parents[2]
SKIN_SUB = 'spine/skin'
INDEX = 'skins.json'
TABLE = ROOT / '.cache/gamedata/excel/skin_table.json'
# the source tools/build-data.mjs reads the official tables from (tools/gamedata-url.mjs, master)
TABLE_URL = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/skin_table.json'
BUNDLE_DIRS = (('PersistentData', 'Bundles'), ('StreamingAssets', 'AB', 'Windows'))
NAME_OK = re.compile(r'[A-Za-z0-9_.#]+')
ART_FIELDS = ('avatar', 'portrait', 'illust')
# the skin record's picture id → (the client's name → path map, the sprite packs that hold them)
PIC_KINDS = {'avatar': ('arts/charavatars/avatar_hub.ab', 'ui_char_avatar_*.ab'),
             'portrait': ('arts/charportraits/portraits_hub.ab', 'char_portrait_*.ab')}
ILLUST_MAX, ILLUST_QUALITY = 1024, 85  # as chararts_extract.py (save_illust writes the original-resolution copy too)


def file_name(name):
    """The output name of an official skin / skeleton / page name: `#` → `-`. Raises ValueError on any other character
    outside [A-Za-z0-9_.] (a `-` included: the mapping could then make two names one) and on a name that is only dots."""
    if not isinstance(name, str) or not NAME_OK.fullmatch(name) or not name.strip('.'):
        raise ValueError(f'skin_extract: no file name rule for {name!r} (only A-Z a-z 0-9 _ . # are known; '
                         'docs/rules/render.md 「스킨 모델 소재」)')
    return name.replace('#', '-')


def _is_page_line(lines, i):
    line = lines[i]
    return bool(line.strip()) and ':' not in line and not line[:1].isspace() and (i == 0 or not lines[i - 1].strip())


def rename_atlas_pages(text, names):
    """Spine atlas text with each page name line replaced by names[page] (region names and fields untouched)."""
    lines = text.replace('\r\n', '\n').replace('\r', '\n').lstrip('﻿').split('\n')
    return '\n'.join(names.get(line.strip(), line.strip()) if _is_page_line(lines, i) else line
                     for i, line in enumerate(lines))


def skin_rows(table, chars, tokens):
    """[{key, owner, prefab, name?, tokens?, pics?}] of the official skins with a battle prefab of their own, for the
    operators in `chars`, the summons in `tokens` and the summons an operator skin's tokenSkinMap dresses; sorted by key.
    `name` = the record's displaySkin.skinName (Chinese; the summons' skins have none). `pics` = the record's picture
    ids ({avatar, portrait, illust}, those it has). Raises ValueError on a prefab id that is not its
    owner's (`<owner>_…`), on two skins whose folders differ only in case and on a name file_name has no rule for."""
    skins = (table or {}).get('charSkins') or {}
    rows, dressed = [], set()
    for key, rec in skins.items():
        owner = rec.get('charId')
        if owner not in chars:
            continue
        for m in rec.get('tokenSkinMap') or []:
            if isinstance(m, dict) and m.get('tokenId'):
                dressed.add(m['tokenId'])
    owners = set(chars) | set(tokens) | dressed
    for key, rec in sorted(skins.items()):
        owner = rec.get('charId')
        prefab = (rec.get('battleSkin') or {}).get('skinOrPrefabId')
        if owner not in owners or not prefab or prefab == 'DefaultSkin':
            continue
        if not prefab.startswith(owner + '_'):
            raise ValueError(f'skin_extract: skin {key!r} names prefab {prefab!r}, not one of {owner}')
        row = {'key': key, 'owner': owner, 'prefab': prefab}
        name = (rec.get('displaySkin') or {}).get('skinName')
        if isinstance(name, str) and name.strip():
            row['name'] = name.strip()
        tmap = {m['tokenId']: m['tokenSkinId'] for m in rec.get('tokenSkinMap') or []
                if isinstance(m, dict) and m.get('tokenId') and m.get('tokenSkinId')}
        if tmap:
            row['tokens'] = dict(sorted(tmap.items()))
        pics = {kind: rec[f] for kind, f in (('avatar', 'avatarId'), ('portrait', 'portraitId'), ('illust', 'illustId'))
                if isinstance(rec.get(f), str) and rec[f]}
        for v in pics.values():
            file_name(v)
        if pics:
            row['pics'] = pics
        rows.append(row)
    seen = {}
    for r in rows:
        d = f'{file_name(r["owner"])}/{file_name(r["prefab"])}'.lower()
        if d in seen:
            raise ValueError(f'skin_extract: skins {seen[d]!r} and {r["key"]!r} would share the folder {d}')
        seen[d] = r['key']
    return rows


def with_name(entry, row):
    """A skins.json entry with the row's name (the table's, so a renamed skin follows it; none when the table has none),
    every other field as it is, `name` after `client` as the docstring lists it."""
    out = {}
    for k, v in entry.items():
        if k == 'name':
            continue
        out[k] = v
        if k == 'client' and row.get('name'):
            out['name'] = row['name']
    if row.get('name') and 'name' not in out:
        out['name'] = row['name']
    return out


def load_table(path=TABLE, url=TABLE_URL, log=print):
    """The official skin table: the cached copy, downloaded first when missing."""
    path = Path(path)
    if not path.exists():
        log(f'download {url}')
        with urllib.request.urlopen(url, timeout=180) as r:
            text = r.read().decode('utf-8')
        json.loads(text)  # refuse to cache a truncated file
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix('.json.tmp')
        tmp.write_text(text, encoding='utf-8')
        tmp.replace(path)
    return json.loads(path.read_text(encoding='utf-8'))


def roster(root=ROOT):
    """(operator ids, summon ids) of data/assets.json: the operators with a battle model, every summon."""
    a = json.loads((Path(root) / 'data/assets.json').read_text(encoding='utf-8'))
    chars = sorted(c for c, v in (a.get('chars') or {}).items()
                   if c.startswith('char_') and ((v.get('spine') or {}).get('front')))
    return chars, sorted(a.get('tokens') or {})


def write_side(objects, sda, prefab, sub, out_root, log):
    """One side of a skin model: <sub>/<prefab>.skel, .atlas (pages renamed, sized, `pma: true`) and the merged pages.
    Returns the side's entry, or None when a part is missing (nothing written then)."""
    import extract
    get = lambda pptr: objects.get(pptr['m_PathID']) if pptr and not pptr.get('m_FileID') else None  # noqa: E731
    skel = get(sda.get('skeletonJSON'))
    if skel is None:
        log(f'  warn {sub}: skeleton TextAsset not in this bundle')
        return None
    atlas, pages = extract.spine_atlas_pages(objects, sda, sub, log)
    if atlas is None:
        return None
    names = {p: file_name(p) for p in pages}
    stem = file_name(prefab)
    text = extract.normalize_atlas(rename_atlas_pages(atlas, names), {names[p]: img.size for p, img in pages.items()})
    out_dir = Path(out_root) / sub
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f'{stem}.skel').write_bytes(extract._text_bytes(skel.read()))
    (out_dir / f'{stem}.atlas').write_text(text, encoding='utf-8')
    for p, img in pages.items():
        img.save(out_dir / names[p])
    base = f'/assets/local/{sub}'
    return {'skel': f'{base}/{stem}.skel', 'atlas': f'{base}/{stem}.atlas',
            'textures': [f'{base}/{names[p]}' for p in pages], 'pma': True}


def extract_owner(owner, rows, games, out_root, log):
    """The skins `rows` of one owner from the first client whose skinpack has each: {key: entry}, {key: reason}."""
    import aklz4  # noqa: F401  (registers the LZ4AK decoder)
    import UnityPy
    import extract
    done, missing = {}, {}
    want = {r['prefab'].lower(): r for r in rows}
    is_char = owner.startswith('char_')
    for gname, game in games:
        if not want:
            break
        for sub_dir in BUNDLE_DIRS:
            f = Path(game).joinpath(*sub_dir, 'skinpack', f'{owner}.ab')
            if not want or not f.is_file():
                continue
            try:
                env = UnityPy.load(str(f))
            except Exception as e:  # corrupt or unsupported bundle: report and go on
                log(f'FAIL load {f}: {e}')
                continue
            objects = {o.path_id: o for o in env.objects}
            for cname, ref in env.container.items():
                m = re.search(rf'/battle/prefabs/skins/character/{re.escape(owner.lower())}/([^/]+)\.prefab$', cname.lower())
                row = want.get(m.group(1)) if m else None
                if row is None:
                    continue
                nodes = extract.prefab_spine_nodes(ref.read_typetree(), objects)
                if is_char:
                    pick = {'front': next((n for w in ('Front', 'Spine') for n in nodes if n[0] == w and n[1]), None)
                            or next((n for w in ('Front', 'Spine') for n in nodes if n[0] == w), None),
                            'back': next((n for n in nodes if n[0] == 'Back' and n[1]), None)
                            or next((n for n in nodes if n[0] == 'Back'), None)}
                else:
                    pick = {'front': extract.pick_spine_node(nodes)}
                sub = f'{SKIN_SUB}/{file_name(owner)}/{file_name(row["prefab"])}'
                entry = {'owner': owner, 'prefab': row['prefab'], 'client': gname}
                for side, node in pick.items():
                    sda = objects.get(node[2]['m_PathID']) if node and not node[2].get('m_FileID') else None
                    if sda is None:
                        continue
                    try:
                        e = write_side(objects, sda.read_typetree(), row['prefab'], f'{sub}/{side}', out_root, log)
                    except ValueError:  # file_name: a name the rule does not know stops the run
                        raise
                    except Exception as err:  # an unreadable texture / text asset: that side is reported missing
                        log(f'  warn {row["key"]} {side}: {err}')
                        e = None
                    if e:
                        entry[side] = e
                if 'tokens' in row:
                    entry['tokens'] = row['tokens']
                if 'front' in entry:
                    done[row['key']] = entry
                    missing.pop(row['key'], None)
                    del want[m.group(1)]
                else:
                    missing[row['key']] = {'owner': owner, 'why': f'no readable Spine renderer ({gname} {"/".join(sub_dir)})'}
    for row in want.values():
        missing.setdefault(row['key'], {'owner': owner, 'why': 'no client has its prefab'})
    return done, missing


def hub_paths(env):
    """{id in lower case: asset path} of a client name → path map (`_keys` / `_values` of its MonoBehaviour)."""
    for o in env.objects:
        if o.type.name == 'MonoBehaviour':
            t = o.read_typetree()
            if '_keys' in t and '_values' in t:
                return {k.lower(): v for k, v in zip(t['_keys'], t['_values']) if isinstance(k, str) and isinstance(v, str)}
    return {}


def picture_container(path):
    """The sprite pack container of a name → path map's asset path (`Arts/CharAvatars/Skins/x#1` →
    `dyn/arts/charavatars/skins/x#1.png`)."""
    return f'dyn/{path}.png'.lower()


class PictureIndex:
    """Where each client keeps the avatars and portraits: per client (EN first), the name → path maps and which sprite
    pack holds each container — the install read first, the hot-update bundles over it."""

    def __init__(self, games, log=print):
        import aklz4  # noqa: F401  (registers the LZ4AK decoder)
        import UnityPy
        self.clients = []
        for gname, game in games:
            paths, packs = {k: {} for k in PIC_KINDS}, {}
            for sub_dir in reversed(BUNDLE_DIRS):
                base = Path(game).joinpath(*sub_dir)
                for kind, (hub, pattern) in PIC_KINDS.items():
                    if (base / hub).is_file():
                        paths[kind].update(hub_paths(UnityPy.load(str(base / hub))))
                    for b in sorted((base / 'spritepack').glob(pattern)):
                        for c in UnityPy.load(str(b)).container:
                            packs[c.lower()] = b
            log(f'pictures {gname}: {len(paths["avatar"])} avatar / {len(paths["portrait"])} portrait names, {len(packs)} sprites')
            self.clients.append((gname, paths, packs))

    def find(self, kind, pic_id):
        """(client, sprite pack, container) of a picture id, or None when no client has it."""
        for gname, paths, packs in self.clients:
            path = paths[kind].get(pic_id.lower())
            if path and picture_container(path) in packs:
                return gname, packs[picture_container(path)], picture_container(path)
        return None


def sprite_picture(sprite, alpha_tex=None):
    """The picture a Sprite shows, uncut: its texture inside the sprite rect (the whole canvas for a portrait or 立绘,
    not the tight mesh UnityPy's Sprite.image crops to), with `alpha_tex` (else the sprite's alpha texture, when it has
    one) as its alpha."""
    import chararts_extract
    if alpha_tex is None and sprite.m_RD.alphaTexture:
        alpha_tex = sprite.m_RD.alphaTexture.read()
    img = chararts_extract._image(sprite.m_RD.texture.read(), alpha_tex)
    r = sprite.m_Rect
    box = (round(r.x), img.height - round(r.y + r.height), round(r.x + r.width), img.height - round(r.y))
    return img if box == (0, 0, img.width, img.height) else img.crop(box)


def material_alpha(ptr, objects):
    """The `_AlphaTex` texture of a material pointer (an illust Image's `m_Material`), or None."""
    mat = objects.get(ptr.get('m_PathID')) if ptr and ptr.get('m_PathID') and not ptr.get('m_FileID') else None
    if mat is None or mat.type.name != 'Material':
        return None
    for name, env in mat.read_typetree()['m_SavedProperties']['m_TexEnvs']:
        tex = env.get('m_Texture') or {}
        if name == '_AlphaTex' and tex.get('m_PathID') and not tex.get('m_FileID') and tex['m_PathID'] in objects:
            return objects[tex['m_PathID']].read()
    return None


def illust_picture(tree, objects):
    """(picture, frame) of an `illust_<skin>` prefab's root: its Image sprite and its RectTransform (anchored position
    and size, y up: the frame chararts_extract.py reads). The alpha of most skin 立绘 is not in the sprite: the Image's
    material (`illust_<skin>_material`) draws its `_AlphaTex` over the opaque texture; without a material the
    texture's own alpha counts. None when it has no sprite."""
    pic = frame = None
    for c in tree.get('m_Component') or []:
        co = objects.get(c['component']['m_PathID']) if not c['component'].get('m_FileID') else None
        if co is None:
            continue
        if co.type.name == 'RectTransform':
            rt = co.read_typetree()
            p, sz = rt['m_AnchoredPosition'], rt['m_SizeDelta']
            frame = {'x': p['x'], 'y': p['y'], 'w': sz['x'], 'h': sz['y']}
        elif co.type.name == 'MonoBehaviour' and pic is None:
            t = co.read_typetree()
            ptr = t.get('m_Sprite') or {}
            sp = objects.get(ptr.get('m_PathID')) if ptr.get('m_PathID') and not ptr.get('m_FileID') else None
            if sp is not None and sp.type.name == 'Sprite':
                pic = sprite_picture(sp.read(), material_alpha(t.get('m_Material'), objects))
    return (pic, frame) if pic is not None else None


def save_picture(img, out_root, rel, kind):
    """Write one picture under out_root; returns its entry ({path, w, h}; a 立绘 also `full`, chararts_extract.save_illust)."""
    if kind == 'illust':
        import chararts_extract
        return chararts_extract.save_illust(img, out_root, rel, ILLUST_MAX, ILLUST_QUALITY)
    out = Path(out_root) / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, 'PNG', optimize=True)
    return {'path': f'/assets/local/{rel}', 'w': img.width, 'h': img.height}


def picture_rel(owner, prefab, kind, pic_id):
    return f'{SKIN_SUB}/{file_name(owner)}/{file_name(prefab)}/{kind}/{file_name(pic_id)}.{"webp" if kind == "illust" else "png"}'


def extract_pictures(owner, rows, games, index, out_root, log):
    """The pictures of one owner's skins `rows`: {key: {avatar?, portrait?, illust?}}, {key: [kinds no client has]}."""
    import aklz4  # noqa: F401
    import UnityPy
    got = {r['key']: {} for r in rows}
    by_pack = {}
    for r in rows:
        for kind in PIC_KINDS:
            pid = (r.get('pics') or {}).get(kind)
            hit = pid and index.find(kind, pid)
            if hit:
                by_pack.setdefault(hit[1], []).append((r, kind, pid, hit[2]))
    for pack, items in by_pack.items():
        env = UnityPy.load(str(pack))
        refs = {}
        for c, ref in env.container.items():  # a container may list its Texture2D and its Sprite: the Sprite wins
            if ref.type.name == 'Sprite' or c.lower() not in refs:
                refs[c.lower()] = ref
        for r, kind, pid, cont in items:
            obj = refs[cont].read()
            img = sprite_picture(obj) if refs[cont].type.name == 'Sprite' else obj.image.convert('RGBA')
            got[r['key']][kind] = save_picture(img, out_root, picture_rel(owner, r['prefab'], kind, pid), kind)
    want = {r['pics']['illust'].lower(): r for r in rows if (r.get('pics') or {}).get('illust')}
    for gname, game in games:
        for sub_dir in BUNDLE_DIRS:
            f = Path(game).joinpath(*sub_dir, 'skinpack', f'{owner}.ab')
            if not want or not f.is_file():
                continue
            try:
                env = UnityPy.load(str(f))
            except Exception as e:  # corrupt or unsupported bundle: report and go on
                log(f'FAIL load {f}: {e}')
                continue
            objects = {o.path_id: o for o in env.objects}
            for cname, ref in env.container.items():
                m = re.search(rf'/arts/characters/{re.escape(owner.lower())}/([^/]+)\.prefab$', cname.lower())
                row = want.get(m.group(1)) if m else None
                if row is None:
                    continue
                try:
                    pf = illust_picture(ref.read_typetree(), objects)
                except Exception as err:  # an unreadable texture: reported missing
                    log(f'  warn {row["key"]} illust: {err}')
                    pf = None
                if pf is None:
                    continue
                e = save_picture(pf[0], out_root, picture_rel(owner, row['prefab'], 'illust', row['pics']['illust']), 'illust')
                if pf[1]:
                    e['frame'] = {k: round(v, 2) for k, v in pf[1].items()}
                got[row['key']]['illust'] = e
                del want[m.group(1)]
    missing = {}
    for r in rows:
        lack = [k for k in ART_FIELDS if (r.get('pics') or {}).get(k) and k not in got[r['key']]]
        if lack:
            missing[r['key']] = lack
    return got, missing


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--id', action='append', default=[], metavar='OWNER', help='only this operator / summon (repeatable)')
    ap.add_argument('--out', default=str(ROOT / 'public/assets/local'))
    ap.add_argument('--table', default=str(TABLE), help='the official skin_table.json (downloaded there when missing)')
    ap.add_argument('--list', action='store_true', help='print the skins the table gives as JSON and exit')
    ap.add_argument('--only', choices=('models', 'art', 'names'),
                    help='run one part and keep the other part\'s fields (names: only the names, no client)')
    args = ap.parse_args()
    chars, tokens = roster()
    rows = skin_rows(load_table(args.table), set(chars), set(tokens))
    if args.id:
        rows = [r for r in rows if r['owner'] in args.id]
    if args.list:
        print(json.dumps(rows, ensure_ascii=False, indent=1))
        return 0
    parts = {args.only} if args.only else {'models', 'art'}
    games = []
    if parts & {'models', 'art'}:
        from client_path import clients, ensure_extract_env
        ensure_extract_env()
        games = [('cn' if i else 'en', g) for i, g in enumerate(clients())]  # EN, then the CN client when set up
    out_root = Path(args.out)
    index_path = out_root / SKIN_SUB / INDEX
    old = {}
    if parts == {'names'} and not index_path.exists():
        print(f'--only names: no {index_path} to name (run the models first)', file=sys.stderr)
        return 1
    if (args.id or args.only) and index_path.exists():
        old = json.loads(index_path.read_text(encoding='utf-8'))
    skins = dict(old.get('skins') or {})
    missing = dict(old.get('missing') or {})
    art_missing = dict(old.get('artMissing') or {})
    by_owner = {}
    for r in rows:
        by_owner.setdefault(r['owner'], []).append(r)
    pictures = PictureIndex(games) if 'art' in parts else None
    for owner, rs in sorted(by_owner.items()):
        line = f'{owner}:'
        if 'models' in parts:
            done, miss = extract_owner(owner, rs, games, out_root, print)
            for r in rs:
                keep = {f: v for f, v in (skins.pop(r['key'], None) or {}).items() if f in ART_FIELDS}
                missing.pop(r['key'], None)
                if r['key'] in done:
                    skins[r['key']] = {**done[r['key']], **keep}
            missing.update(miss)
            line += f' {len(done)} of {len(rs)} models' + (f' (missing {sorted(miss)})' if miss else '')
        if 'art' in parts:
            listed = [r for r in rs if r['key'] in skins]  # no model, no pictures: the picker does not offer it
            got, lack = extract_pictures(owner, listed, games, pictures, out_root, print)
            for r in rs:
                art_missing.pop(r['key'], None)
                if r['key'] in skins:
                    skins[r['key']] = {**{f: v for f, v in skins[r['key']].items() if f not in ART_FIELDS}, **got.get(r['key'], {})}
            art_missing.update(lack)
            line += f' pictures {sum(len(v) for v in got.values())}' + (f' (no {lack})' if lack else '')
        named = 0
        for r in rs:
            if r['key'] in skins:
                skins[r['key']] = with_name(skins[r['key']], r)
                named += 'name' in skins[r['key']]
        line += f' names {named}'
        print(line, flush=True)
    index_path.parent.mkdir(parents=True, exist_ok=True)
    doc = {'version': 1, 'source': 'local-client', 'skins': dict(sorted(skins.items())),
           'missing': dict(sorted(missing.items())), 'artMissing': dict(sorted(art_missing.items()))}
    index_path.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'done: {len(skins)} skins of {len(skins) + len(missing)} -> {index_path}')
    return 0 if skins else 1


if __name__ == '__main__':
    sys.exit(main())
