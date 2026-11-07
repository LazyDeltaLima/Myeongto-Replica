"""Where the local Arknights client is, for the tools in tools/local-extract/.

The client's `Arknights_Data` folder (e.g. …/Arknights_EN/Arknights_Data) is taken from, in order:
  1. SP_CLIENT in the environment,
  2. a `SP_CLIENT=…` line in <repo>/.env (git-ignored; `export`, quotes and `#` comments allowed),
  3. <repo>/.client/Arknights_Data (`.client` = a link to the install folder, git-ignored).
Each tool's --client / --game still overrides this per call.

The CN client (`SP_CLIENT_CN`, the same three places with `.client-cn`) is optional. The CN client gets operators before
the EN one; the tools that write one table for all operators (attack_timing.py, op_projectiles.py, skill_cast.py,
skill_hud.py) read the EN client first and the CN client for what the EN one lacks (`clients`), and keep the rows of
an earlier run that neither client has (`kept`), so a run on the EN client alone does not drop the CN-only operators.
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENV_KEY = 'SP_CLIENT'
CN_KEY = 'SP_CLIENT_CN'


def ensure_extract_env(argv=None):
    """Run under the extraction environment: with lz4 and UnityPy missing, start over with <repo>/.venv-extract/bin/python, or stop and
    say what is missing. Without this a driver run under another python gets through a dozen steps, each failing on its own."""
    try:
        import lz4.block  # noqa: F401
        import UnityPy  # noqa: F401
        return
    except ImportError as err:
        missing = err
    venv = ROOT / '.venv-extract/bin/python'
    if venv.exists() and os.environ.get('SP_EXTRACT_REEXEC') != '1':
        print(f'[{missing}] → {venv.relative_to(ROOT)}', file=sys.stderr, flush=True)
        os.environ['SP_EXTRACT_REEXEC'] = '1'
        os.execv(str(venv), [str(venv), *(sys.argv if argv is None else argv)])
    sys.exit(f'{missing}: the extraction tools need lz4 and UnityPy (python -m venv .venv-extract, then '
             '.venv-extract/bin/pip install -r tools/local-extract/requirements.txt)')


def _from_dotenv(path=ROOT / '.env', name=ENV_KEY):
    try:
        lines = path.read_text(encoding='utf-8').splitlines()
    except OSError:
        return None
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if line.startswith('export '):
            line = line[len('export '):].lstrip()
        key, sep, value = line.partition('=')
        if not sep or key.strip() != name:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in '"\'':
            value = value[1:-1]
        return value or None
    return None


def skin_keys():
    """{ charId: { animKey: clip name } } of the operators' skins (`.cache/anim-keys.json`, anim_keys.py; {} without it): the
    client plays a clip by key only, through the skin's key table."""
    import json
    path = ROOT / '.cache/anim-keys.json'
    if not path.exists():
        return {}
    ops = json.loads(path.read_text(encoding='utf-8')).get('ops') or {}
    return {c: (v.get('skin') or {}).get('keys') or {} for c, v in ops.items()}


def client_data(*sub):
    """The client's Arknights_Data folder (joined with `sub`), as a string."""
    base = os.environ.get(ENV_KEY) or _from_dotenv() or str(ROOT / '.client' / 'Arknights_Data')
    return str(Path(os.path.expanduser(base)).joinpath(*sub))


def client_data_cn(*sub):
    """The CN client's Arknights_Data folder (joined with `sub`), or None when none is set up."""
    link = ROOT / '.client-cn' / 'Arknights_Data'
    base = os.environ.get(CN_KEY) or _from_dotenv(name=CN_KEY) or (str(link) if link.exists() else None)
    return str(Path(os.path.expanduser(base)).joinpath(*sub)) if base else None


def clients(given=None):
    """The Arknights_Data folders a tool reads, in order: `given` (a repeatable --client) or the EN client, then the CN one
    when it is set up and another folder. The first client that has an operator or a skill decides it."""
    if given:
        return list(given)
    out = [client_data()]
    cn = client_data_cn()
    if cn and Path(cn).resolve() != Path(out[0]).resolve():
        out.append(cn)
    return out


def earlier(path):
    """The JSON table an earlier run wrote at `path`, {} without one."""
    p = Path(path)
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else {}


def kept(old, read, wanted):
    """{id: row} of `old` (the table an earlier run wrote) for the ids in `wanted` that no client read this run, sorted."""
    return {k: old[k] for k in sorted(set(old) & set(wanted) - set(read))}


def kept_all(old, read):
    """{id: row} of `old` for every id not read this run, sorted: an --id run reads only its operators and leaves every
    other row as the earlier run wrote it (even one no data names any more)."""
    return {k: old[k] for k in sorted(set(old) - set(read))}


def skills_of(ids, prefabs):
    """The skill prefab ids of the operators `ids` ({charId: [prefabId, …]}: char_modes.py char_skill_prefabs); an
    operator no data names has none (told on stderr)."""
    out = set()
    for cid in ids:
        if cid not in prefabs:
            print(f'{cid}: in no chess / 선발 data — its skills are not read', file=sys.stderr)
        out.update(p for p in prefabs.get(cid) or [] if isinstance(p, str) and p)
    return out
