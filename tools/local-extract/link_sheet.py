#!/usr/bin/env python3
"""The linking worksheet of a 선발 operator: its official sound banks and the client nodes that sound them, side by side
(docs/rules/audio.md 「선발 소리 뱅크 커버리지」, 2026-11-01).

Wiring a new operator's sounds by hand meant finding, bank by bank, which prefab or buff template names its signal and
when that node runs. This prints, for each charId:

  1. banks — every `battle.` bank of zh_CN audio_data.json whose name carries the codename or one of her summons' own
     codes as a word (the same set as test/audio-bank-coverage.test.js), with
       state   'played' (a file of it is in the asset manifest, not proof that this moment reaches it: test/audio-skill-silence.test.js), 'none' / 'todo' (its test/audio-bank-coverage-list.js
               entry) or 'MISSING' (neither: the coverage test fails on it);
       wired   the tools/assets/*.mjs files that name the bank (kit-sfx.mjs KIT_HIT_BANKS etc.);
       where   the client nodes that carry the bank's signal id as a value: `<source>:<GameObject or template> <class>
               .<field>`, or for an ability's signal (`<unit or skill>.<path>`) the GameObjects whose path matches
               (`T` = Talents, `extra.<n>` = the n-th of the skill's `_extraAbilities`). Nothing found = the signal is built at
               run time from names the sheet does not follow.
  2. attack groups — the charpack's `_abilityConfigs`: each child with its trigger and selector values (2026-11-04: picking a
     child by its name alone sounded conditional children on every attack).
  3. emitters — every node of the same sources with an audio signal (`audioSignal`, `_audioSignal`,
     `_overrideAudioSignal`), a projectile key or an effect key, and the banks of that name (projectile keys: the
     ON_PROJECTILE_* banks), so a signal no bank carries and a projectile nobody wired stand out.

Sources: charpack/<charId>.ab, the model's AudioWhenPlayAnimation in chararts/<charId>.ab (CN client: clip → signal, read
from the raw object), the [uc]skills.ab and [uc]projectiles.ab prefabs and the config/buff_template_holder.ab
templates whose name carries the codename, and the summons' prefabs (pkgrps/btl_pfb_tokens_*.ab, a `token_` root with the
codename). Classes: a prefab component's MonoScript (`--cab-index`, the bundle every m_Script points at), a template or
SerializedState node's `$type`; buff template events by their Buff.Event names (BUFF_EVENTS; another one prints as its
number).

Usage (from the repo root; the CN client for an operator only it has, with its own CAB index):
  .venv-extract/bin/python -I tools/local-extract/link_sheet.py --id char_1052_kalts2 [--id …] [--client <Arknights_Data>]
      [--cab-index .cache/fx-cab-index.json] [--out sheet.md]
Read-only: writes nothing but `--out`. Everything is (c) Hypergryph; private fan use only.
"""
import argparse
import glob
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from char_modes import load_tree, buff_templates  # noqa: E402
from client_path import client_data  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
AUDIO = ROOT / '.cache/gamedata/excel/audio_data.json'
SIGNAL_FIELDS = ('audioSignal', '_audioSignal', '_overrideAudioSignal')
PROJ_FIELDS = ('_projectileKey', '_duoProjectileKey', '_subProjectileKey', '_childProjectileKey', '_additionalProjectile',
               '_extraProjectileKeys')
EFFECT_FIELD = re.compile(r'(?i)effectkey$')


def bases(client):
    return [Path(client) / 'PersistentData/Bundles', Path(client) / 'StreamingAssets/AB/Windows']


def bundle(client, rel):
    """The newer copy of a bundle: PersistentData first."""
    for b in bases(client):
        if (b / rel).exists():
            return b / rel
    return None


def word(code):
    return re.compile(f'(?<![a-z0-9]){re.escape(code)}(?![a-z0-9])')


def summon_codes(code, tokens):
    """The own codes of an operator's summons (data/backups.json `tokens`: token_<n>_<codename>_<code> → <code>), which name
    banks without her codename (酒神's token_encdool_boom_start) — test/audio-bank-coverage.test.js counts them too."""
    w = word(code)
    return [re.sub(f'^{re.escape(code)}_', '', t.split('_', 2)[2]) for t in tokens if w.search(t) and len(t.split('_', 2)) == 3]


def short(t):
    return re.split(r'[.+]', str(t).split(',')[0])[-1]


# Buff.Event: the event numbers of a buff template's eventToActions (0 … 37, and 80)
BUFF_EVENTS = {**dict(enumerate([
    'ON_BUFF_START', 'ON_BUFF_FINISH', 'ON_BUFF_TRIGGER', 'ON_OWNER_KILLED', 'ON_OWNER_FINISH',
    'ON_BEFORE_APPLYING_MODIFIER', 'ON_APPLYING_MODIFIER', 'ON_APPLIED_MODIFIER', 'ON_OUTPUT_MODIFIER',
    'ON_TARGET_KILLED', 'ON_TAKE_DAMAGE', 'ON_OUTPUT_DAMAGE', 'ON_OWNER_BORN', 'ON_OWNER_LOCATE',
    'ON_CALCULATE_DAMAGE', 'ON_EVADE_DAMAGE', 'ON_ABILITY_START', 'ON_ABILITY_FINISH', 'ON_ABILITY_SPELL_ON',
    'ON_ABILITY_CAST_ON_TARGET', 'ON_SKILL_FINISH', 'ON_AFTER_OUTPUT_DAMAGE', 'ON_OUTPUT_ATK_OR_HEAL',
    'ON_AFTER_ATTACK', 'ON_BUFF_ENABLE', 'ON_BUFF_DISABLE', 'ON_BEFORE_ATTACK', 'ON_BEFORE_TRY_SET_HP_ZERO',
    'ON_BEFORE_DISAPPEAR', 'ON_OWNER_KILLED_BY_MAIN_TARGET', 'ON_ABNORMAL_FLAG_DIRTY', 'ON_AFTER_CALCULATE_DAMAGE',
    'ON_BUFF_LATE_ENABLE', 'ON_SKILL_START', 'ON_OWNER_REACH_EXIT', 'ON_OWNER_POST_BORN', 'ON_OTHER_BUFF_START',
    'ON_OWNER_BLOCKEE_CHANGED',
])), 80: 'ON_TOGGLE_SKILL_START'}


class Scripts:
    """m_Script PathID → class name, from the MonoScript bundle the prefabs point at (found through the CAB index)."""
    def __init__(self, client, cab_index):
        self.client, self.names, self.loaded = client, {}, set()
        self.cab = json.loads(Path(cab_index).read_text(encoding='utf-8')) if cab_index and Path(cab_index).exists() else {}

    def load(self, cab):
        if cab in self.loaded:
            return
        self.loaded.add(cab)
        rel = self.cab.get(cab) or self.cab.get(cab.lower())
        f = Path(self.client) / rel if rel else None
        if not f or not f.exists():
            print(f'[sheet] the MonoScript bundle {cab} is {"gone" if rel else "not in the CAB index"}: classes print as ? '
                  '(rebuild the index: fx_extract.py --build-cab-index)', file=sys.stderr)
            return
        import aklz4  # noqa: F401
        import UnityPy
        for o in UnityPy.load(str(f)).objects:
            if o.type.name == 'MonoScript':
                try:
                    d = o.read_typetree()
                except Exception:
                    continue
                self.names[o.path_id] = d.get('m_ClassName') or '?'

    def of(self, path):
        """{MonoBehaviour PathID: class} of a bundle's MonoBehaviours whose script resolves."""
        import aklz4  # noqa: F401
        import UnityPy
        out = {}
        for o in UnityPy.load(str(path)).objects:
            if o.type.name != 'MonoBehaviour':
                continue
            try:
                s = o.read_typetree().get('m_Script') or {}
            except Exception:
                continue
            fid, pid = s.get('m_FileID'), s.get('m_PathID')
            if not fid:
                continue
            ext = o.assets_file.externals
            if fid - 1 < len(ext):
                self.load(ext[fid - 1].path.split('/')[-1])
            if pid in self.names:
                out[o.path_id] = self.names[pid]
        return out


class Node:
    __slots__ = ('src', 'where', 'cls', 'field', 'value')

    def __init__(self, src, where, cls, field, value):
        self.src, self.where, self.cls, self.field, self.value = src, where, cls, field, value

    def __str__(self):
        return f'{self.src}:{self.where} {self.cls or "?"}.{self.field}'


def strings(o, src, where, cls, out, field=''):
    """Every string value under o as a Node (SerializedState JSON opened, `$type` = the class of what is under it)."""
    if isinstance(o, dict):
        cls = short(o['$type']) if isinstance(o.get('$type'), str) else cls
        for k, v in o.items():
            k = str(k)
            if k == '$type':
                continue
            if k == 'SerializedState' and isinstance(v, str):
                try:
                    v = json.loads(v)
                except ValueError:
                    pass
            if isinstance(v, str):
                if v:
                    out.append(Node(src, where, cls, k, v))
            else:
                strings(v, src, where, cls, out, k)
    elif isinstance(o, list):
        for v in o:
            if isinstance(v, str):
                if v:
                    out.append(Node(src, where, cls, field, v))
            else:
                strings(v, src, where, cls, out, field)
    return out


def tree_nodes(path, src, keep, scripts, extras):
    """(Nodes, GameObject paths) of a bundle's MonoBehaviours whose root GameObject passes keep(root); `extras` gains each
    `_extraAbilities` list as {GameObject: [the GameObjects of its abilities, in order]} (a skill's `extra.<n>` signal)."""
    tree = load_tree(str(path))[0]
    cls = scripts.of(path) if scripts.cab else {}
    at = {pid: gp for gp, _d, pid in tree}
    out, paths = [], set()
    for gp, d, pid in tree:
        if not keep(gp.split('/')[0]):
            continue
        paths.add(gp)
        if isinstance(d.get('_extraAbilities'), list) and d['_extraAbilities']:
            extras[gp] = [at.get((x or {}).get('m_PathID')) for x in d['_extraAbilities']]
        strings({k: v for k, v in d.items() if not k.startswith('m_')}, src, gp, cls.get(pid), out)
    return out, paths


def raw_strings(raw):
    """The length-prefixed strings (3+ characters) of a serialized object (int32 length, the bytes, 4-byte alignment), in order."""
    out, i = [], 0
    while i + 4 <= len(raw):
        n = int.from_bytes(raw[i:i + 4], 'little')
        if 3 <= n < 256 and i + 4 + n <= len(raw) and all(32 <= c < 127 for c in raw[i + 4:i + 4 + n]):
            out.append(raw[i + 4:i + 4 + n].decode('ascii'))
            i += 4 + ((n + 3) & ~3)
        else:
            i += 4
    return out


def clip_audio(path, scripts):
    """The model's AudioWhenPlayAnimation (CN client, clip name → audio signal, ON_PLAY_ANIMATION) as Nodes, read from the raw
    object: its type tree does not read."""
    import aklz4  # noqa: F401
    import UnityPy
    cls = scripts.of(path)
    out = []
    for o in UnityPy.load(str(path)).objects:
        if o.type.name != 'MonoBehaviour' or cls.get(o.path_id) != 'AudioWhenPlayAnimation':
            continue
        s = raw_strings(o.get_raw_data())
        for clip, signal in zip(s[0::2], s[1::2]):
            out.append(Node('chararts', f'{clip} clip', 'AudioWhenPlayAnimation', 'signal', signal))
    return out


def collect(client, cid, codes, scripts, templates, events):
    """(Nodes, GameObject paths, extra abilities) of the sources named by any of `codes` (see the header)."""
    ws = [word(c) for c in codes]
    named = lambda r: any(w.search(r) for w in ws)  # noqa: E731
    nodes, paths, extras = [], set(), {}
    f = bundle(client, f'charpack/{cid}.ab')
    if f:
        n, p = tree_nodes(f, 'charpack', lambda r: True, scripts, extras)
        nodes += n
        paths |= p
    else:
        print(f'[sheet] {cid}: no charpack in {client}', file=sys.stderr)
    for rel, src in (('battle/prefabs/[uc]skills.ab', 'skills'), ('battle/prefabs/[uc]projectiles.ab', 'projectiles')):
        f = bundle(client, rel)
        if f:
            n, p = tree_nodes(f, src, named, scripts, extras)
            nodes += n
            paths |= p
    f = bundle(client, f'chararts/{cid}.ab')
    if f and scripts.cab:
        nodes += clip_audio(f, scripts)
    seen = set()
    for b in bases(client):
        for f in sorted(glob.glob(str(b / 'pkgrps/btl_pfb_tokens_*.ab'))):
            name = Path(f).name
            if name in seen:   # PersistentData first: the newer copy
                continue
            seen.add(name)
            try:
                n, p = tree_nodes(f, 'tokens', lambda r: r.startswith('token_') and named(r), scripts, extras)
            except Exception as err:
                print(f'[sheet] {name}: {err}', file=sys.stderr)
                continue
            nodes += n
            paths |= p
    for key, ev in templates.items():
        if not named(key):
            continue
        for e, acts in ev.items():
            name = events.get(int(e), str(e)) if str(e).lstrip('-').isdigit() else str(e)
            strings(acts, 'buff', f'{key} @{name}', None, nodes)
    return nodes, paths, extras


def ability_paths(signal, paths, extras):
    """GameObject paths an ability signal `<root>.<part>…` can name: under that root, its parts in order (T = Talents);
    the root itself for a bare root, its children (`?` before each) when the parts name no GameObject (an `extra.<n>` ability
    of a list field, a suffix the unit adds)."""
    parts = signal.split('.')
    for i in range(len(parts), 0, -1):
        root = '.'.join(parts[:i])
        under = [p for p in paths if p == root or p.startswith(root + '/')]
        if not under:
            continue
        want = ['Talents' if x == 'T' else x for x in parts[i:]]
        if len(want) >= 2 and want[0] == 'extra' and want[1].isdigit() and root in extras:
            lst = extras[root]
            return [f'{lst[int(want[1])]} (_extraAbilities[{want[1]}])'] if int(want[1]) < len(lst) and lst[int(want[1])] else []
        hits = []
        for p in under:
            comps, j = p.split('/')[1:], 0
            for c in comps:
                if j < len(want) and (c == want[j] or c.lower() == want[j].lower()):
                    j += 1
            if want and j == len(want) and comps and comps[-1].lower() == want[-1].lower():
                hits.append(p)
        if not want:
            return [root]
        return sorted(hits)[:6] or ['? ' + p for p in sorted(under) if p.count('/') == root.count('/') + 1][:6]
    return []


GROUP_CONDITION_KEYS = ('_buffKey', '_buffKeys', '_checkContainBuffs', '_checkReloadFlag', '_reloadFlag', '_targetSide', '_rangeId',
                        '_filterType', '_triggers', '_alwaysUseTrigger')


def attack_groups(client, cid):
    """Rows (group, child, condition) of the charpack's attack groups with a condition per child (`_abilityConfigs`, the official
    AbilitySelectableGroup): each child's trigger and selector values under its GameObject. A group needs a line in
    test/audio-cond-group-list.js: an attack sounds the child with no condition, the others only as the sim picks them."""
    path = bundle(client, f'charpack/{cid}.ab')
    if not path:
        return []
    tree = load_tree(str(path))[0]
    at = {pid: gp for gp, _d, pid in tree}
    rows = []
    for gp, d, _pid in tree:
        for c in d.get('_abilityConfigs') or []:
            child = at.get((c.get('_ability') or {}).get('m_PathID'))
            if not child:
                continue
            cond = {}
            for sub, sd, _p in tree:
                if sub == child or sub.startswith(child + '/'):
                    for k in GROUP_CONDITION_KEYS:
                        v = sd.get(k)
                        if v not in (None, '', [], 0, False):
                            cond[k] = 'list' if k == '_triggers' else v
            rows.append((gp.split('Modes/')[-1], child.split('/')[-1], json.dumps(cond, ensure_ascii=False)))
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--client', default=client_data())
    ap.add_argument('--id', action='append', required=True)
    ap.add_argument('--cab-index', default=str(ROOT / '.cache/fx-cab-index.json'),
                    help='fx_extract.py CAB index of that client (class names; the CN one for --client <CN>)')
    ap.add_argument('--out')
    a = ap.parse_args()
    banks = json.loads(AUDIO.read_text(encoding='utf-8'))['soundFXBanks']
    manifest = json.loads((ROOT / 'data/assets.json').read_text(encoding='utf-8'))
    played = {u.lower() for u in re.findall(r'/assets/audio/[^"]+?\.mp3', json.dumps(manifest.get('audio')))}
    dubs = {k: v.get('dub') for k, v in manifest['audio']['sfx']['units'].items() if v.get('dub')}
    listed = {}
    lf = ROOT / 'test/audio-bank-coverage-list.js'
    if lf.exists():
        cur = None
        for line in lf.read_text(encoding='utf-8').splitlines():
            m = re.match(r"\s+(char_\w+): \{", line)
            if m:
                cur = m.group(1)
            m = re.match(r"\s+'([^']+)': '((?:none|todo): [^']*)", line.replace("\\'", '’'))
            if m and cur:
                listed[(cur, m.group(1))] = m.group(2)
    wired_src = {f.name: f.read_text(encoding='utf-8') for f in sorted((ROOT / 'tools/assets').glob('*.mjs'))}
    tokens = json.loads((ROOT / 'data/backups.json').read_text(encoding='utf-8')).get('tokens') or {}
    scripts = Scripts(a.client, a.cab_index)
    templates = buff_templates(a.client)
    events = BUFF_EVENTS
    out = []
    for cid in a.id:
        code = cid.split('_', 2)[2]
        codes = [code] + [c for c in summon_codes(code, tokens) if c != code]
        nodes, paths, extras = collect(a.client, cid, codes, scripts, templates, events)
        by_value = {}
        for n in nodes:
            by_value.setdefault(n.value, []).append(n)
        mine = [b for b in banks if b['name'].startswith('battle.') and any(word(c).search(b['name']) for c in codes)]
        names = {b['name'][len('battle.'):] for b in mine}
        out.append(f'## {cid}\n\nclient `{a.client}` · {len(nodes)} string fields · {len(mine)} banks\n')
        out.append('### banks\n\n| bank | state | wired | where |\n|---|---|---|---|')
        for b in sorted(mine, key=lambda b: b['name']):
            name = b['name'][len('battle.'):]
            event, _, signal = name.partition('.')
            urls = {f"/assets/audio/sfx/{'/'.join(str(s.get('asset')).split('/')[-3:])}.mp3".lower() for s in b.get('sounds') or []}
            state = 'played' if urls & played else (listed.get((cid, name)) or 'MISSING').split(':')[0]
            # a dub's bank (`@KR`, `@JP`): the manifest keeps it per language (sfx.units[id].dub); this fork offers those two (voice.mjs voiceTwin)
            lang = {'KR': 'kr', 'JP': 'jp'}.get(name.rpartition('@')[2]) if '@' in name else None
            if '@' in name:
                state = 'played' if lang and lang in (dubs.get(cid) or {}) else 'none'
            wired = ', '.join(f for f, t in wired_src.items() if b['name'] in t or f"'{name}'" in t) or '-'
            where = [str(n) for n in by_value.get(signal, [])]
            if not where and event.startswith(('ON_ABILITY', 'ON_SKILL')):
                where = [f'ability {p}' for p in ability_paths(signal, paths, extras)]
            if not where:
                base = re.sub(r'(\[[^\]]*\])+$', '', signal)
                where = [f'~{n}' for n in by_value.get(base, [])] if base != signal else []
            out.append(f"| `{name}` | {state} | {wired} | {'<br>'.join(sorted(set(where))[:6]) or '—'} |")
        groups = attack_groups(a.client, cid)
        if groups:
            out.append('\n### attack groups\n\nThe child with no condition is what an attack sounds; list each group in test/audio-cond-group-list.js.\n')
            out.append('| group | child | condition |\n|---|---|---|')
            out.extend(f'| {g} | {c} | `{cond}` |' for g, c, cond in groups)
        out.append('\n### emitters\n\n| node | value | banks |\n|---|---|---|')
        rows = set()
        for n in nodes:
            if n.field in SIGNAL_FIELDS or n.cls == 'AudioWhenPlayAnimation':
                kind = 'signal'
            elif n.field in PROJ_FIELDS:
                kind = 'projectile'
            elif EFFECT_FIELD.search(n.field):
                kind = 'effect'
            else:
                continue
            hit = sorted(x.split('.', 1)[0] for x in names if x.split('.', 1)[1:] == [n.value])
            rows.add((str(n), kind, n.value, ', '.join(hit) or ('—' if kind != 'effect' else '')))
        for node, kind, value, hit in sorted(rows):
            out.append(f'| {node} | {kind} `{value}` | {hit} |')
        out.append('')
    text = '\n'.join(out) + '\n'
    if a.out:
        Path(a.out).write_text(text, encoding='utf-8')
    else:
        sys.stdout.write(text)


if __name__ == '__main__':
    main()
