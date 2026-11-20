#!/usr/bin/env python3
"""The abnormal flags (异常效果) the summons hold from deployment, from their prefabs in the local client.

The official client gives a summon its 禁疗 (`AbnormalFlag.HEAL_FREE` 7), 孤立 (`ALLY_TARGET_FREE` 15) and the like through
buffs on its own prefab (pkgrps/btl_pfb_tokens_*.ab; 炎佑, a bond summon built from an enemy, through its enemy prefab in
battle/enm_pfb*.ab): each buff's `attributes.abnormalFlags`. No table carries them. This script writes
tools/assets/local-token-abnormal.json, which tools/build-data.mjs (tokenAbnormal) turns into data/tokens.json /
data/backups.json `tokens[…].abnormal`:

  { "tokens": { "token_10003_cgbird_bird": { "modes": ["Default"],
                  "held": [ { "at": "Modes/Default/Passive", "buff": "bird_c_healfree", "flags": [7], "mode": "Default" } ],
                  "other": [] }, … } }

`held` = the buffs the summon holds from the moment the ability that carries them attaches: a `PassiveBuffAbility` with no
selector of its own (its `_buffs` go on the owner as it attaches) and a `BuffToOwner` that runs on `ON_ATTACHED` (0) with no
extra condition. Where the ability sits says when it attaches: `CommonAbilities/…` and `Trait` always; `Modes/<mode>/…`
while that mode is on (`mode`); `Talents/<k>` / `Talent/<k>` when the summon's talent whose prefabKey is k is unlocked
(`talent`; `Talents/-1` is a skill's slot: `other`). `life` is set when the buff does not last forever (`lifeTimeType` 1 LIMITED, with its `template`).
`other` = the flag-carrying buffs of any other ability (a skill, a trigger, a toggle, an event): held only when something
happens, so never read as held — listed for the reader, with the ability class (`cls`).
A flag-carrying held buff in a place none of the above names stops the run (the build would not know when it holds).

Usage (from the repo root; --client = an Arknights_Data folder, repeatable — by default the EN client, then the CN one for
what the EN one lacks, client_path.py; a summon neither client has keeps the row of the earlier run):
  .venv-extract/bin/python tools/local-extract/token_abnormal.py [--client <…/Arknights_Data>]… [--id token_…]…
The class names come from the client's MonoScript bundles through the CAB index (.cache/fx-cab-index.json for EN,
.cache/fx-cab-index-cn.json for CN: fx_extract.py --build-cab-index); a script the index does not find stops the run.
Everything read is (c) Hypergryph; only these flags are kept.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from attack_timing import all_token_ids, enemy_bundles, mode_paths  # noqa: E402
from char_modes import load_tree  # noqa: E402
from char_points import token_files  # noqa: E402
from client_path import client_data_cn, clients, earlier, kept, kept_all  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tools/assets/local-token-abnormal.json'
CAB_INDEX = {'en': ROOT / '.cache/fx-cab-index.json', 'cn': ROOT / '.cache/fx-cab-index-cn.json'}
# Torappu.LifeType: IMMEDIATELY 0, LIMITED 1, INFINITY 2, CUSTOM 3
LIFE = {0: 'immediately', 1: 'limited', 3: 'custom'}
TALENT = re.compile(r'(?:^|/)Talents?/(-?\d+)(?:/|$)')


def bond_summon_ids():
    """The bond summons data/tokens.json builds from an enemy (`kind` bondSummon: 炎佑 enemy_9012_acloon)."""
    ids = set()
    for f in [ROOT / 'data/tokens.json', *sorted((ROOT / 'data/seasons').glob('*/tokens.json'))]:
        toks = json.loads(f.read_text(encoding='utf-8'))
        ids |= {k for k, v in (toks.get('tokens', toks)).items() if isinstance(v, dict) and v.get('kind') == 'bondSummon'}
    return sorted(ids)


def enemy_files(client, ids):
    """{ enemy key: its battle/enm_pfb*.ab } by the root names of each bundle's prefabs."""
    import aklz4  # noqa: F401
    import UnityPy
    out, want = {}, set(ids)
    for f in enemy_bundles(client).values():
        for o in UnityPy.load(str(f)).objects:
            if o.type.name == 'GameObject':
                n = o.read().m_Name
                if n in want and n not in out:
                    out[n] = f
        if want <= set(out):
            break
    return out


class Scripts:
    """The class name of a MonoBehaviour's m_Script, read from the MonoScript bundle the CAB index names."""

    def __init__(self, client, index_path):
        self.client = Path(client)
        self.index_path = index_path
        self.index = json.loads(Path(index_path).read_text(encoding='utf-8')) if Path(index_path).exists() else {}
        self.lower = {k.lower(): v for k, v in self.index.items()}
        self.objs = {}

    def externals(self, bundle):
        import aklz4  # noqa: F401
        import UnityPy
        env = UnityPy.load(str(bundle))
        af = next(iter(env.assets))
        return [e.path.split('/')[-1] for e in af.externals]

    def name(self, externals, ref):
        fid, pid = ref.get('m_FileID'), ref.get('m_PathID')
        if not fid or fid > len(externals):
            sys.exit(f'a script reference ({fid}, {pid}) outside the bundle\'s externals')
        cab = externals[fid - 1]
        if cab not in self.objs:
            import aklz4  # noqa: F401
            import UnityPy
            rel = self.lower.get(cab.lower())
            p = self.client / rel if rel else None
            if not p or not p.exists():
                sys.exit(f'{cab}: {"not in" if not rel else "gone from the folder named by"} the CAB index {self.index_path} — '
                         'rebuild it: fx_extract.py --game <Arknights_Data> --build-cab-index <that file>')
            self.objs[cab] = {o.path_id: o for o in UnityPy.load(str(p)).objects if o.type.name == 'MonoScript'}
        o = self.objs[cab].get(pid)
        if o is None:
            sys.exit(f'script {pid} not in {cab}')
        return o.read_typetree()['m_ClassName']


def flagged(buffs):
    """The buffs of a `_buffs` list that carry abnormal flags."""
    return [b for b in buffs if isinstance(b, dict) and ((b.get('attributes') or {}).get('abnormalFlags') or [])]


def held_by_owner(cls, d):
    """Whether the ability's buffs go on its owner as it attaches."""
    if cls == 'PassiveBuffAbility':
        return not (d.get('_selector') or {}).get('m_PathID')
    if cls == 'BuffToOwner':
        return d.get('_runActionOnEvent') == 0 and not d.get('_extraCondition')
    return False


def place(rel):
    """{mode?, talent?} of an ability path under the prefab root, or None when it is no place this script knows."""
    out = {}
    parts = rel.split('/')
    if parts[0] == 'Modes' and len(parts) > 2:
        out['mode'] = parts[1]
    m = TALENT.search(rel)
    if m:
        out['talent'] = m.group(1)
    if out or rel == 'Trait' or rel.startswith('CommonAbilities/') or '/CommonAbilities/' in rel:
        return out
    return None


def entry(tid, tree, externals, scripts):
    sub = [x for x in tree if x[0] == tid or x[0].startswith(tid + '/')]
    modes = [p.rsplit('/', 1)[-1] for p in (mode_paths(sub) or [])]
    held, other = [], []
    for gp, d, _ in sub:
        bl = d.get('_buffs')
        if not isinstance(bl, list) or not flagged(bl):
            continue
        rel = gp[len(tid) + 1:]
        cls = scripts.name(externals, d.get('m_Script') or {})
        for b in flagged(bl):
            row = {'at': rel, 'buff': b.get('buffKey'), 'flags': sorted(b['attributes']['abnormalFlags'])}
            where = place(rel)
            # `Talents/-1` is the skill's slot (attached by a skill, as an operator's charpack `Talents/-1`), no talent
            if not held_by_owner(cls, d) or (where or {}).get('talent') == '-1':
                other.append({**row, 'cls': cls})
                continue
            if where is None:
                sys.exit(f'{tid}: the held buff {row["buff"]} {row["flags"]} sits at {rel}, a place this script does not know '
                         '(CommonAbilities / Trait / Modes/<mode> / Talents/<k>) — read when it attaches and add the place')
            life = LIFE.get(b.get('lifeTimeType'))
            if life:
                where = {**where, 'life': life, 'template': b.get('templateKey')}
            held.append({**row, **where})
    return {'modes': modes, 'held': held, 'other': other}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--client', action='append', help='an Arknights_Data folder (repeatable; default: EN, then CN — client_path.py)')
    ap.add_argument('--out', default=str(OUT))
    ap.add_argument('--id', action='append', default=[], help='only this summon (repeatable): every other row stays as the earlier run wrote it')
    args = ap.parse_args()
    prev = (earlier(args.out) or {}).get('tokens') or {}
    ids = args.id or [*all_token_ids(), *bond_summon_ids()]
    cn = client_data_cn()
    rows = {}
    for client in clients(args.client):
        kind = 'cn' if cn and Path(client).resolve() == Path(cn).resolve() else 'en'
        scripts = Scripts(client, CAB_INDEX[kind])
        want = [t for t in ids if t not in rows]
        files = {**token_files(client, [t for t in want if t.startswith('token_')]),
                 **enemy_files(client, [t for t in want if not t.startswith('token_')])}
        trees, exts = {}, {}
        for tid, f in files.items():
            if f not in trees:
                trees[f] = load_tree(f)[0]
                exts[f] = scripts.externals(f)
            rows[tid] = entry(tid, trees[f], exts[f], scripts)
        print(f'{client}: {len(files)} summons')
    old = kept_all(prev, rows) if args.id else kept(prev, rows, ids)
    for t in sorted(set(ids) - set(rows) - set(old)):
        print('missing', t, file=sys.stderr)
    rows.update(old)
    out = {'$comment': 'tools/local-extract/token_abnormal.py — the abnormal flags each summon\'s prefab gives it (docs/rules/sim.md 「치료 금지와 孤立」)',
           'tokens': dict(sorted(rows.items()))}
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    n = sum(1 for r in rows.values() if r['held'])
    print(f'{len(rows)} summons ({n} with held flags) → {args.out}' + (f'; kept from the earlier run: {", ".join(old)}' if old else ''))


if __name__ == '__main__':
    main()
