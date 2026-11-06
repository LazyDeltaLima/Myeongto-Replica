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
to do by hand — summon effects in the shared token packs, summon models (extract.py TOKEN_SPINES).

Once the kit is written and listed, --finish runs the rebuilds that read it, in the order they depend on each other (FINISH_ORDER:
the templates before the bindings, the plays after the kit, the clip keys before the manifest, the manifest before the data), then
says for each operator whether it arrived: its clip keys, manifest entry and attack clips. It names what moved for any other operator
in data/assets.json and data/chess.json, and prints fx-wiring-report.mjs for these operators (what is left to connect).

Usage (from the repo root; another python starts over with .venv-extract/bin/python):
  .venv-extract/bin/python tools/local-extract/add_operator.py --id char_1042_phatm2 [--id …] [--dry-run] [--skip fx,art]
  .venv-extract/bin/python tools/local-extract/add_operator.py --finish --id char_1042_phatm2 [--id …] [--dry-run] [--skip assets]
Everything read is (c) Hypergryph; private fan use only.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from client_path import client_data, client_data_cn, ensure_extract_env  # noqa: E402
from char_modes import char_skill_prefabs, chess_records, pool_char_ids  # noqa: E402

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
# --finish, in this order: fx_bindings reads the templates; build-fx-plays reads the kit and the bindings; fetch-assets overlays the clip
# keys and plans a hidden season's piece by its kit; build-data takes the attack clips from the manifest
FINISH_ORDER = ('templates', 'bindings', 'plays', 'keys', 'assets', 'data', 'seasons', 'resources', 'report')
# what no other operator's row should move in, compared around --finish
FINISH_TABLES = ['data/assets.json', 'data/chess.json']
KITS = ROOT / 'server/sim/content/kits'


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


def art_roots(client, ids):
    """{bundle root: [operators whose chararts/<charId>.ab it holds]}: a client's hot-update copy has a chararts folder of its own
    without every operator, so a root is chosen per operator and not by the folder alone."""
    roots = {}
    for c in ids:
        root = next((Path(client) / d for d in BUNDLE_DIRS if (Path(client) / d / f'chararts/{c}.ab').is_file()), None)
        if root:
            roots.setdefault(root, []).append(c)
    return roots


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


def kit_file(cid):
    """The operator's kit file, by the kit layout's names (ops/op-<codename>.js, ops/<chessId>-<codename>.js), or None."""
    return next((p for p in sorted((KITS / 'ops').glob(f'*{codename(cid)}.js'))
                 if p.stem == f'op-{codename(cid)}' or p.stem.endswith(f'-{codename(cid)}')), None)


def kit_problem(cid, index_src=None):
    """Why --finish cannot run for this operator yet, or None: every rebuild reads the kit, so it comes first."""
    f = kit_file(cid)
    if not f:
        return f'{cid}: no kit file in server/sim/content/kits/ops/ (write ops/op-{codename(cid)}.js first)'
    src = (KITS / 'index.js').read_text(encoding='utf-8') if index_src is None else index_src
    return None if f"'{f.name}'" in src else f'{cid}: {f.name} is not listed in server/sim/content/kits/index.js'


def season_ids():
    return sorted(p.parent.name for p in (ROOT / 'data/seasons').glob('*/chess.json'))


def finish_commands(py, cnargs, ids, seasons):
    """{step: [command, …]} of --finish, in FINISH_ORDER."""
    node = 'node'
    return {
        'templates': [[node, 'tools/build-fx-templates.mjs', '--offline']],
        'bindings': [[py, TOOL / 'fx_bindings.py', *cnargs]],
        'plays': [[node, 'tools/build-fx-plays.mjs']],
        'keys': [[py, TOOL / 'anim_keys.py', *cnargs]],
        'assets': [[node, 'tools/fetch-assets.mjs']],
        'data': [[node, 'tools/build-data.mjs', '--offline']],
        'seasons': [[node, 'tools/build-data.mjs', '--offline', '--season', s] for s in seasons],
        'resources': [[node, 'tools/build-browser-resources.mjs']],
        'report': [[node, 'tools/fx-wiring-report.mjs', *[x for c in ids for x in ('--id', c)]]],
    }


def read_json(rel):
    p = ROOT / rel
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else {}


def arrival(cid, manifest, keys, records):
    """What did not reach this operator after --finish: [problem, …]. Each is a fault no test of the kit itself shows."""
    out = []
    if cid not in (keys.get('ops') or {}):
        out.append('no row in .cache/anim-keys.json: its clips keep the roles of the name rule')
    if not ((manifest.get('chars') or {}).get(cid) or {}).get('spine'):
        out.append('no model in data/assets.json: run fetch-assets (no clips, no sounds)')
    mine = [c for c in records if c.get('charId') == cid]
    if mine and not any(c.get('attackAnim') for c in mine):
        out.append('no attackAnim in its chess records: rebuild the data after fetch-assets')
    return out


def moved_tables(before, tables, names):
    """{table: [path, …]} of `tables` against `before`, as moved(); the tables' own counters are no operator's row."""
    out = {}
    for rel in tables:
        a, b = before.get(rel, {}), flat(read_json(rel))
        paths = sorted(p for p in set(a) | set(b) if a.get(p) != b.get(p) and not any(n in p for n in names)
                       and not p.startswith(('version', 'hash', 'stats', 'generator')))
        if paths:
            out[rel] = paths
    return out


def finish(ids, a, py, cnargs):
    bad = [p for p in (kit_problem(c) for c in ids) if p]
    if bad:
        sys.exit('\n'.join(bad))
    skip = {s for s in a.skip.split(',') if s}
    if skip - set(FINISH_ORDER):
        sys.exit(f'unknown step: {", ".join(sorted(skip - set(FINISH_ORDER)))}')
    before = {rel: flat(read_json(rel)) for rel in FINISH_TABLES}
    cmds = finish_commands(py, cnargs, ids, season_ids())
    failed = []
    for name in FINISH_ORDER:
        if name in skip:
            continue
        for cmd in cmds[name]:
            if not run(cmd, a.dry_run):
                failed.append(name)
    if a.dry_run:
        return
    prefabs = char_skill_prefabs()
    names = set(ids) | {codename(c) for c in ids} | {p for c in ids for p in prefabs.get(c) or [] if p}
    for rel, paths in moved_tables(before, FINISH_TABLES, names).items():
        print(f'⚠ {rel}: {len(paths)} other row(s) moved: {", ".join(paths[:8])}{" …" if len(paths) > 8 else ""}')
    manifest, keys = read_json('data/assets.json'), read_json('.cache/anim-keys.json')
    records = list(chess_records())
    problems = 0
    for c in ids:
        faults = arrival(c, manifest, keys, records)
        problems += len(faults)
        print(f'{c}: ' + ('arrived' if not faults else f'{len(faults)} problem(s)'))
        for f in faults:
            print(f'  ✗ {f}')
    print('\nLeft: node tools/fx-golden.mjs (--update when an effect meant to change), node tools/i18n/build-ko-diy.mjs for a 선발 pick '
          '(not with KO_DIY_TRACE), then the full tests and the golden corpus')
    if failed or problems:
        sys.exit(f'failed: {", ".join(dict.fromkeys(failed)) or "the operators above"}')


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
    ap.add_argument('--skip', default='', help=f'comma-separated steps to leave out ({", ".join(STEPS)}; with --finish: {", ".join(FINISH_ORDER)})')
    ap.add_argument('--finish', action='store_true', help='the kit is written: the rebuilds that read it, in order, and what arrived')
    a = ap.parse_args()
    if not a.dry_run:
        ensure_extract_env()
    ids = list(dict.fromkeys(a.id))
    en, cn = client_data(), client_data_cn()
    clients = [('en', en)] + ([('cn', cn)] if cn and Path(cn).resolve() != Path(en).resolve() else [])
    py = sys.executable
    if a.finish:
        finish(ids, a, py, ['--cn', cn] if len(clients) > 1 else [])
        return
    skip = {s for s in a.skip.split(',') if s}
    if skip - set(STEPS):
        sys.exit(f'unknown step: {", ".join(sorted(skip - set(STEPS)))}')

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
        for root, group in art_roots(folder[n], cs).items():
            step('art', [py, TOOL / 'chararts_extract.py', '--game', root, *[x for c in group for x in ('--id', c)]])

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
    print('  - write and list the kit, then every rebuild that reads it, in order, with a check of what arrived:\n'
          f'    .venv-extract/bin/python tools/local-extract/add_operator.py --finish {" ".join(f"--id {c}" for c in ids)}')
    if failed:
        sys.exit(f'failed: {", ".join(dict.fromkeys(failed))}')


if __name__ == '__main__':
    main()
