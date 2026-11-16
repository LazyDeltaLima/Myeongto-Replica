#!/usr/bin/env python3
"""Operator and summon skins (时装) from the local clients: the battle Spine model of every official skin of the
operators and summons the mode draws (maintainer decision 2026-11-16: all of them). Display only: a battle is decided
on the default model (docs/rules/render.md 「스킨 모델 소재」).

Which skins: the official skin table (Kengxxiao zh_CN `excel/skin_table.json`, cached in .cache/gamedata/excel/ and
downloaded when missing) — every `charSkins` record of an operator of data/assets.json `chars` or a summon of
data/assets.json `tokens` (or a summon an operator skin's `tokenSkinMap` dresses) whose `battleSkin.skinOrPrefabId` is a
prefab of its own (not `DefaultSkin` / null). An operator skin keeps its `tokenSkinMap` (summon → summon skin key).

Where: `skinpack/<ownerId>.ab`, prefab `dyn/battle/prefabs/skins/character/<ownerId>/<prefab id in lower case>.prefab`,
read from the EN client first (its hot-update bundles, then the install), then the CN client for what the EN one lacks
(client_path.clients). An operator's prefab has Front and Back renderers (one `Spine` renderer: the front only); a
summon's is drawn by its Front / only renderer (extract.pick_spine_node), as the default summon models are.

File names: the official ids carry `#` (`char_202_demkni_boc#1`), which a URL reads as the start of a fragment — the
browser's resource list refuses such paths (public/js/resources.js PATH_RE). Every folder and file name goes through
file_name(), the one place that names the output: `#` → `-` (no official skin, skeleton or page name has a `-`, so two
names never meet), anything else outside [A-Za-z0-9_.] stops the run. The atlas text is rewritten to the renamed pages.

Output (under --out, public/assets/local by default):
  spine/skin/<owner>/<prefab>/<front|back>/<prefab>.skel | .atlas | <page>.png      (pages premultiplied, as the
                                                                                  enemy / token models: write_spine)
  spine/skin/skins.json   { version, source, skins: { <skin key>: { owner, prefab, client, front, back?, tokens? } },
                            missing: { <skin key>: { owner, why } } }   front / back = { skel, atlas, textures[], pma }
The index is a file of its own, not a data/local-assets.json group: that manifest goes to every page, the skins only to
those who take the skin data. tools/build-browser-resources.mjs leaves the whole spine/skin/ folder out of the pre-download
list until the skin data is a pack of its own.

Usage (from the repo root):
  .venv-extract/bin/python tools/local-extract/skin_extract.py [--id <ownerId>]… [--out public/assets/local]
  python3 tools/local-extract/skin_extract.py --list     (the skins the table gives, as JSON; no client needed)
An --id run re-extracts only those owners and keeps the other rows of skins.json.
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
    """[{key, owner, prefab, tokens?}] of the official skins with a battle prefab of their own, for the operators in
    `chars`, the summons in `tokens` and the summons an operator skin's tokenSkinMap dresses; sorted by key. Raises
    ValueError on a prefab id that is not its owner's (`<owner>_…`) or two skins whose folders differ only in case."""
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
        tmap = {m['tokenId']: m['tokenSkinId'] for m in rec.get('tokenSkinMap') or []
                if isinstance(m, dict) and m.get('tokenId') and m.get('tokenSkinId')}
        if tmap:
            row['tokens'] = dict(sorted(tmap.items()))
        rows.append(row)
    seen = {}
    for r in rows:
        d = f'{file_name(r["owner"])}/{file_name(r["prefab"])}'.lower()
        if d in seen:
            raise ValueError(f'skin_extract: skins {seen[d]!r} and {r["key"]!r} would share the folder {d}')
        seen[d] = r['key']
    return rows


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


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--id', action='append', default=[], metavar='OWNER', help='only this operator / summon (repeatable)')
    ap.add_argument('--out', default=str(ROOT / 'public/assets/local'))
    ap.add_argument('--table', default=str(TABLE), help='the official skin_table.json (downloaded there when missing)')
    ap.add_argument('--list', action='store_true', help='print the skins the table gives as JSON and exit')
    args = ap.parse_args()
    chars, tokens = roster()
    rows = skin_rows(load_table(args.table), set(chars), set(tokens))
    if args.id:
        rows = [r for r in rows if r['owner'] in args.id]
    if args.list:
        print(json.dumps(rows, ensure_ascii=False, indent=1))
        return 0
    from client_path import clients, ensure_extract_env
    ensure_extract_env()
    games = [('cn' if i else 'en', g) for i, g in enumerate(clients())]  # EN, then the CN client when set up
    out_root = Path(args.out)
    index_path = out_root / SKIN_SUB / INDEX
    old = {}
    if args.id and index_path.exists():
        old = json.loads(index_path.read_text(encoding='utf-8'))
    skins = {k: v for k, v in (old.get('skins') or {}).items() if v.get('owner') not in args.id}
    missing = {k: v for k, v in (old.get('missing') or {}).items() if v.get('owner') not in args.id}
    by_owner = {}
    for r in rows:
        by_owner.setdefault(r['owner'], []).append(r)
    for owner, rs in sorted(by_owner.items()):
        done, miss = extract_owner(owner, rs, games, out_root, print)
        skins.update(done)
        missing.update(miss)
        print(f'{owner}: {len(done)} of {len(rs)} skins' + (f' (missing {sorted(miss)})' if miss else ''), flush=True)
    index_path.parent.mkdir(parents=True, exist_ok=True)
    doc = {'version': 1, 'source': 'local-client', 'skins': dict(sorted(skins.items())), 'missing': dict(sorted(missing.items()))}
    index_path.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'done: {len(skins)} skins of {len(skins) + len(missing)} -> {index_path}')
    return 0 if skins else 1


if __name__ == '__main__':
    sys.exit(main())
