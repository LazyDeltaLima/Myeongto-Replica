"""The extract JSON golden (2026-10-20, docs/rules/fx.md 「추출 JSON 골든」): a fixed set of effect prefabs re-extracted with
the current fx_extract.py and compared with their stored extraction, path by path (fx_extract.json_diff) — an extractor
change, a CAB index rebuilt or a client update that changes what a prefab's JSON says shows here before it reaches the
screen (a reader that shifted by a word, a flag read from the wrong field).

The stored extractions are game data (derived from the client's bundles), so they live outside the repository: DIR is a
folder of the maintainer's, holding

    golden.json            {"prefabs": {"<bundle>/<name>": {"client": "en", "pack": null}}} — the set, the client each
                           prefab is extracted from (fx_extract.py --game of that client) and its shared pack (--pack)
    <bundle>/<name>.json   the stored extraction (indented, keys sorted, so a diff of the folder reads)

Nothing is written into public/assets/local/fx (a dry walk: no texture or mesh file). Texture and mesh contents are not
compared, only the names the JSON gives them.

    python tools/local-extract/fx_golden.py check  DIR --game <Arknights_Data> --cab-index .cache/fx-cab-index.json
    python tools/local-extract/fx_golden.py update DIR --game … --cab-index … [--add <bundle>/<name> …] [--client cn]

`--client` (default en) picks the entries of that client (one client per call: the CN prefabs with the CN client and its
CAB index); `--add` puts new prefabs into the set with that client (and `--pack`). `check` exits 1 when a prefab differs
or cannot be extracted; `update` rewrites the selected entries (the whole set of the client, or `--only`).
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fx_extract as fx  # noqa: E402


def load_set(d):
    p = d / 'golden.json'
    return json.loads(p.read_text()) if p.exists() else {'prefabs': {}}


def stored_path(d, key):
    b, n = key.split('/', 1)
    return d / b / f'{n}.json'


def dump(data):
    return json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True) + '\n'


def extract(ex, keys, prefabs):
    """{key: data} of `keys` walked with `ex` (dry), grouped by bundle and pack; a key missing from the result could
    not be extracted (its bundle is not in this client, or the prefab is gone)."""
    ex.dry = True
    ex.keep = {}
    groups = {}
    for k in keys:
        b, n = k.split('/', 1)
        groups.setdefault((b, prefabs[k].get('pack')), set()).add(n)
    for (b, pack), names in sorted(groups.items(), key=lambda x: (x[0][0], x[0][1] or '')):
        try:
            ex.run(b, names, pack=pack, write=False)
        except SystemExit as e:
            print(f'[golden] {b}: {e}')
    return ex.keep


def main(argv=None):
    ap = argparse.ArgumentParser(description='the extract JSON golden of the effect prefabs (fx_extract.py)')
    ap.add_argument('mode', choices=['check', 'update'])
    ap.add_argument('dir', help='the golden folder (golden.json and the stored extractions)')
    ap.add_argument('--game', required=True, help='Arknights_Data folder of the client the entries come from')
    ap.add_argument('--cab-index', metavar='JSON', help='the CAB index of that client (fx_extract.py --build-cab-index)')
    ap.add_argument('--client', default='en', help='the entries of this client (default en)')
    ap.add_argument('--add', action='append', default=[], metavar='BUNDLE/NAME', help='update: add these prefabs')
    ap.add_argument('--pack', help='--add: their shared pack (fx_extract.py --pack)')
    ap.add_argument('--only', action='append', default=[], metavar='BUNDLE/NAME', help='only these entries')
    a = ap.parse_args(argv)
    d = Path(a.dir)
    gs = load_set(d)
    prefabs = gs['prefabs']
    if a.add:
        if a.mode != 'update':
            ap.error('--add needs update')
        for k in a.add:
            if '/' not in k:
                ap.error(f'{k}: give <bundle>/<name>')
            prefabs[k] = {'client': a.client, 'pack': a.pack}
    keys = sorted(k for k, v in prefabs.items() if v.get('client', 'en') == a.client and (not a.only or k in a.only))
    if not keys:
        print(f'[golden] no {a.client} entries in {d}')
        return 0
    ex = fx.Extractor(a.game, a.cab_index)
    got = extract(ex, keys, prefabs)
    bad = 0
    for k in keys:
        p = stored_path(d, k)
        if k not in got:
            print(f'{k}: not extracted')
            bad += 1
            continue
        old = json.loads(p.read_text()) if p.exists() else None
        paths = sorted(fx.json_diff(old, got[k], limit=40)) if old is not None else ['(not stored)']
        if paths:
            bad += 1
            print(f'{k}: {len(paths)} path(s) differ' + ''.join(f'\n  {x}' for x in paths))
        if a.mode == 'update':
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(dump(got[k]))
    if a.mode == 'update':
        d.mkdir(parents=True, exist_ok=True)
        gs['prefabs'] = dict(sorted(prefabs.items()))
        (d / 'golden.json').write_text(json.dumps(gs, ensure_ascii=False, indent=1) + '\n')
        print(f'[golden] {a.client}: {len(keys)} entr(ies) written, {bad} changed or new -> {d}')
        return 0
    print(f'[golden] {a.client}: {len(keys) - bad} of {len(keys)} unchanged')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
