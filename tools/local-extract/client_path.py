"""Where the local Arknights client is, for the tools in tools/local-extract/.

The client's `Arknights_Data` folder (e.g. …/Arknights_EN/Arknights_Data) is taken from, in order:
  1. SP_CLIENT in the environment,
  2. a `SP_CLIENT=…` line in <repo>/.env (git-ignored; `export`, quotes and `#` comments allowed),
  3. <repo>/.client/Arknights_Data (`.client` = a link to the install folder, git-ignored).
Each tool's --client / --game still overrides this per call.
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENV_KEY = 'SP_CLIENT'


def _from_dotenv(path=ROOT / '.env'):
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
        if not sep or key.strip() != ENV_KEY:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in '"\'':
            value = value[1:-1]
        return value or None
    return None


def client_data(*sub):
    """The client's Arknights_Data folder (joined with `sub`), as a string."""
    base = os.environ.get(ENV_KEY) or _from_dotenv() or str(ROOT / '.client' / 'Arknights_Data')
    return str(Path(os.path.expanduser(base)).joinpath(*sub))
