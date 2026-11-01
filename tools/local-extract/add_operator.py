#!/usr/bin/env python3
"""Extract everything the local client holds for operators being added, in one command.

An operator joining the pool (a 自选 pick, or a chess of a 卫戍协议 season being built) needs a dozen extraction steps,
each with its own flags; this runs them in order for the given operators only, so no other operator's row moves:

  1. effects        fx_extract.py --bundle <codename>   (the client that has battle/prefabs/effects/<codename>.ab, with its
                    CAB index: .cache/fx-cab-index.json for EN, .cache/fx-cab-index-cn.json for CN)
  2. modes          char_modes.py --id                  (the client that has charpack/<charId>.ab)
  3. mount points   char_points.py --id                 (same client)
  4. sound cues     char_audio.py --id                  (same client)
  5. attack timing  attack_timing.py --id               (EN, then CN for what EN lacks)
  6. projectiles    op_projectiles.py --id              (likewise)
  7. skill casts    skill_cast.py --id                  (likewise)
  8. skill HUD      skill_hud.py --id                   (likewise)
  9. bindings       fx_bindings.py --cn <CN>            (every operator: without --cn the CN-only ones drop out)
 10. clip keys      anim_keys.py --cn <CN>              (likewise)
 11. card art       chararts_extract.py --game <bundle root> --id

The operators must be in the data first (data/chess.json, a season's data/seasons/<id>/chess.json or the 선발 picks of
data/backups.json): their skills come from there (char_modes.py char_skill_prefabs). The client is the EN one first, the CN
one for what it lacks (client_path.py). Afterwards it compares the tracked tables with what they were and names every
row that moved without being one of these operators' (a warning: the run itself never reverts), then prints what is left
to do by hand — summon effects in the shared token packs, summon models (extract.py TOKEN_SPINES), the rebuilds.

Usage (from the repo root):
  .venv-extract/bin/python tools/local-extract/add_operator.py --id char_1042_phatm2 [--id …] [--dry-run] [--skip fx,art]
Everything read is (c) Hypergryph; private fan use only.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from client_path import client_data, client_data_cn  # noqa: E402
from char_modes import char_skill_prefabs, pool_char_ids  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
TOOL = Path(__file__).resolve().parent
BUNDLE_DIRS = ('PersistentData/Bundles', 'StreamingAssets/AB/Windows')  # the hot-update copy first
CAB_INDEX = {'en': ROOT / '.cache/fx-cab-index.json', 'cn': ROOT / '.cache/fx-cab-index-cn.json'}
# the tables the steps write, compared before / after (git-ignored ones too: they reach the server through deploy.sh)
TABLES = ['tools/assets/local-char-modes.json', 'tools/assets/local-char-points.json', 'tools/assets/local-char-audio.json',
          'tools/assets/local-attack-timing.json', 'tools/assets/local-op-projectiles.json', 'tools/assets/local-skill-cast.json',
          'tools/assets/local-skill-hud.json', 'public/assets/local/fx/modes.json', 'public/assets/local/fx/bindings.json',
          '.cache/anim-keys.json', 'data/local-assets.json']
STEPS = ('fx', 'modes', 'points', 'audio', 'timing', 'projectiles', 'cast', 'hud', 'bindings', 'keys', 'art')


def codename(cid):
    """char_1042_phatm2 → phatm2 (the effect bundle's name)."""
    return cid.split('_', 2)[2] if cid.count('_') >= 2 else cid


def bundle(client, rel):
    """The path of a bundle (relative to the bundle folders) in an Arknights_Data folder, or None."""
    for d in BUNDLE_DIRS:
        f = Path(client) / d / rel
        if f.exists():
            return f
    return None


def which_client(clients, rel):
    """The first (name, folder) of `clients` that has the bundle `rel`, or None."""
    return next(((n, c) for n, c in clients if bundle(c, rel)), None)


def flat(doc, depth=2):
    """{path: JSON text} of a table, two levels deep ('ops/char_x', 'char_x/modes' …): what a row change is told by."""
    out = {}
    if not isinstance(doc, dict) or depth == 0:
        return {'': json.dumps(doc, sort_keys=True)}
    for k, v in doc.items():
        for p, t in flat(v, depth - 1).items():
            out[f'{k}/{p}' if p else k] = t
    return out


def snapshot():
    out = {}
    for rel in TABLES:
        p = ROOT / rel
        out[rel] = flat(json.loads(p.read_text(encoding='utf-8'))) if p.exists() else {}
    return out


def moved(before, after, names):
    """{table: [path, …]} of the rows that changed and name none of `names` (the operators, codenames and skills)."""
    out = {}
    for rel in TABLES:
        a, b = before.get(rel, {}), after.get(rel, {})
        paths = sorted(p for p in set(a) | set(b) if a.get(p) != b.get(p) and not any(n in p for n in names))
        if paths:
            out[rel] = paths
    return out


def run(cmd, dry):
    print('$', ' '.join(str(c) for c in cmd), flush=True)
    if dry:
        return True
    r = subprocess.run([str(c) for c in cmd], cwd=ROOT)
    if r.returncode:
        print(f'  ✗ exit {r.returncode}', file=sys.stderr)
    return r.returncode == 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--id', action='append', required=True, help='charId of an operator being added (repeatable)')
    ap.add_argument('--dry-run', action='store_true', help='print the steps and the clients chosen, run nothing')
    ap.add_argument('--skip', default='', help=f'comma-separated steps to leave out ({", ".join(STEPS)})')
    a = ap.parse_args()
    skip = {s for s in a.skip.split(',') if s}
    if skip - set(STEPS):
        sys.exit(f'unknown step: {", ".join(sorted(skip - set(STEPS)))}')
    ids = list(dict.fromkeys(a.id))
    en, cn = client_data(), client_data_cn()
    clients = [('en', en)] + ([('cn', cn)] if cn and Path(cn).resolve() != Path(en).resolve() else [])
    py = sys.executable

    pool, prefabs = set(pool_char_ids()), char_skill_prefabs()
    unknown = [c for c in ids if c not in pool]
    if unknown:
        print(f'not in any chess / 선발 data: {", ".join(unknown)} — their skills are not read; build the data first '
              '(tools/build-data.mjs, --season for a season being built)', file=sys.stderr)
    pack = {c: which_client(clients, f'charpack/{c}.ab') for c in ids}
    fx = {c: which_client(clients, f'battle/prefabs/effects/{codename(c)}.ab') for c in ids}
    for c in ids:
        print(f'{c}: charpack {pack[c][0] if pack[c] else "—"}, effects {fx[c][0] if fx[c] else "—"}, '
              f'skills {", ".join(prefabs.get(c) or []) or "—"}')
    none = [c for c in ids if not pack[c]]
    if none:
        print(f'no client has the charpack of {", ".join(none)}: those steps leave them out', file=sys.stderr)

    before = snapshot()
    failed = []
    step = lambda name, cmd: name in skip or run(cmd, a.dry_run) or failed.append(name)  # noqa: E731
    by = lambda table: {n: [c for c in ids if table[c] and table[c][0] == n] for n, _ in clients}  # noqa: E731
    folder = dict(clients)
    for n, cs in by(fx).items():
        if not cs:
            continue
        if not CAB_INDEX[n].exists():
            print(f'no {CAB_INDEX[n].relative_to(ROOT)}: build it first (fx_extract.py --game <{n}> --build-cab-index …, '
                  'about 17 min) — effects of', ', '.join(cs), 'not extracted', file=sys.stderr)
            failed.append('fx')
            continue
        step('fx', [py, TOOL / 'fx_extract.py', '--game', folder[n], '--client', n, '--cab-index', CAB_INDEX[n],
                    *[x for c in cs for x in ('--bundle', codename(c))]])
    for n, cs in by(pack).items():
        if not cs:
            continue
        idargs = [x for c in cs for x in ('--id', c)]
        for name, tool in (('modes', 'char_modes.py'), ('points', 'char_points.py'), ('audio', 'char_audio.py')):
            step(name, [py, TOOL / tool, '--client', folder[n], *idargs])
    idargs = [x for c in ids if pack[c] for x in ('--id', c)]
    if idargs:
        for name, tool in (('timing', 'attack_timing.py'), ('projectiles', 'op_projectiles.py'), ('cast', 'skill_cast.py'),
                           ('hud', 'skill_hud.py')):
            step(name, [py, TOOL / tool, *idargs])
    cnargs = ['--cn', cn] if len(clients) > 1 else []
    step('bindings', [py, TOOL / 'fx_bindings.py', *cnargs])
    step('keys', [py, TOOL / 'anim_keys.py', *cnargs])
    for n, cs in by({c: which_client(clients, f'chararts/{c}.ab') for c in ids}).items():
        root = next((Path(folder[n]) / d for d in BUNDLE_DIRS if (Path(folder[n]) / d / 'chararts').is_dir()), None)
        if cs and root:
            step('art', [py, TOOL / 'chararts_extract.py', '--game', root, *[x for c in cs for x in ('--id', c)]])

    if not a.dry_run:
        names = set(ids) | {codename(c) for c in ids} | {p for c in ids for p in prefabs.get(c) or [] if p}
        other = moved(before, snapshot(), names)
        for rel, paths in other.items():
            print(f'⚠ {rel}: {len(paths)} other row(s) moved: {", ".join(paths[:8])}{" …" if len(paths) > 8 else ""}')
        if not other:
            print('no other operator\'s row moved')
    print('\nLeft to do (docs/rules/fx.md 「선발 추가 酒神 — EN 클라이언트」, the kits README):')
    print('  - summon effects: their prefabs may not carry the codename (token_encdool_*) — find them by the binding keys, then\n'
          '    fx_extract.py --bundle <codename>_token --pack pkgrps/btl_pfb_fx_token_<n>.ab --match \'^token_…\'')
    print('  - summon models no dump carries: extract.py TOKEN_SPINES + --only spine/token/<id> (--game = the bundle root)')
    print('  - node tools/build-fx-templates.mjs --offline && node tools/build-fx-plays.mjs')
    print('  - node tools/build-data.mjs --offline (and --season <id>), then node tools/fetch-assets.mjs ONLINE (new sound cues)')
    print('  - node tools/i18n/build-ko-diy.mjs (not with KO_DIY_TRACE), node tools/fx-golden.mjs --update, '
          'node tools/build-browser-resources.mjs')
    if failed:
        sys.exit(f'failed: {", ".join(dict.fromkeys(failed))}')


if __name__ == '__main__':
    main()
