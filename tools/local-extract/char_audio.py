#!/usr/bin/env python3
"""Operator / summon sound signals from the local client (docs/rules/audio.md 「공격 소리 신호」, 2026-10-10).

The client names an ability's sound banks after its signal id: `battle.<EVENT>.<unitId>.<ability>[.<n>][.<k>]`
(클라 코드 UnitMode.GenerateSignalId RVA 0x787E80: `'{base}{suffix}.{index}'` only when the mode sets
`_addIndexToSignalId` and the index is > 0 or `_includeIndexZero`; AbilityRandomGroup.DoSetData RVA 0xA68600: a child
ability of a random / loop group gets `'{parent}.{i + 1}'`; MultiMeleeAttack.DoEmitAudioSignalForSpellOn / ForHit
RVA 0xA26DF0 / 0xA26BE0: `'{signal}.{spellCnt}'` with `_addSpellCntToAllSignalId` / `_addSpellCntToLastSignalId` /
`_addSpellCntToAllHitSignalId`). audio_data.json has the banks but not the prefab facts that say which of them sound
when, so tools/assets/plan.mjs reads them from tools/assets/local-char-audio.json, which this script writes:

  { "<charId | tokenId>": {
      "modes": ["Default", "S2", …],                 the charpack's `_modes` (= local-char-modes.json for operators)
      "sig": [[add, zero], …],                       per mode: `_addIndexToSignalId`, `_includeIndexZero`
      "ab": [{ "attack": {…}, "combat": {…} }, …],   per mode, its Body/Attack and Body/Combat ability:
             g: 'rand' | 'loop' (AbilityRandomGroup `_selectMethod`) | 'all' (a group with a `_mainAbility`: every child
             runs), n: its children, diff / once / prob (random group options), spell: 'all' | 'last', hitSpell: 1,
             times: `_additionalTimes`
      "proj": [[key, …], …],                         per mode: every projectile its abilities fire (+ extra / duo keys and
                                                     the sub-projectiles those spawn)
      "skillProj": [[key, …], …],                    per skill (skill order of data/chess.json / backups.json): the projectiles
                                                     of its prefab in battle/prefabs/[uc]skills.ab (+ sub-projectiles)
      "talentProj": [key, …] } }                     the projectiles of the unit's Talents / other abilities outside its modes

Usage (from the repo root): .venv-extract/bin/python tools/local-extract/char_audio.py [--client <…/Arknights_Data>] [--id …]…
Without --id: every operator char_modes.py covers + the summons of data/tokens.json. Everything is (c) Hypergryph;
private fan use only.
"""
import argparse
import glob
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from char_modes import load_tree, pool_char_ids, char_skill_prefabs, skills_tree  # noqa: E402
from client_path import client_data  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tools/assets/local-char-audio.json'
PROJ_KEYS = ('_projectileKey', '_duoProjectileKey', '_subProjectileKey', '_childProjectileKey')


def bundle(client, rel):
    """The newer copy of a bundle: PersistentData first."""
    for base in (Path(client) / 'PersistentData/Bundles', Path(client) / 'StreamingAssets/AB/Windows'):
        if (base / rel).exists():
            return base / rel
    return None


def proj_keys(o, out):
    """Every projectile key an ability tree names (its own, extra, duo, sub)."""
    if isinstance(o, dict):
        for k, v in o.items():
            if k in PROJ_KEYS and isinstance(v, str) and v:
                if v not in out:
                    out.append(v)
            elif k == '_extraProjectileKeys' and isinstance(v, list):
                for x in v:
                    if isinstance(x, str) and x and x not in out:
                        out.append(x)
            else:
                proj_keys(v, out)
    elif isinstance(o, list):
        for v in o:
            proj_keys(v, out)
    return out


class Projectiles:
    """[uc]projectiles.ab: key → the projectile keys it spawns (recursively)."""
    def __init__(self, client):
        self.sub = {}
        for rel in ('battle/prefabs/[uc]projectiles.ab',):
            for base in (Path(client) / 'PersistentData/Bundles', Path(client) / 'StreamingAssets/AB/Windows'):
                f = base / rel
                if not f.exists():
                    continue
                seen = set()
                for gp, d, _ in load_tree(str(f))[0]:
                    root = gp.split('/')[0]
                    if root in self.sub and root not in seen:
                        continue
                    seen.add(root)
                    proj_keys(d, self.sub.setdefault(root, []))

    def closure(self, keys):
        out, todo = [], list(keys)
        while todo:
            k = todo.pop(0)
            if k in out:
                continue
            out.append(k)
            todo += [x for x in self.sub.get(k, []) if x != k]
        return out


def ability_info(tree, by_pid, gp, d):
    """The signal facts of a Body/Attack | Body/Combat ability (see the header)."""
    info = {}
    kids = [by_pid.get(r.get('m_PathID')) for r in d.get('_abilities') or [] if isinstance(r, dict)]
    if kids:
        info['names'] = [p.split('/')[-1] if p else '?' for p in kids]
    if '_selectMethod' in d and isinstance(d.get('_abilities'), list):
        info['g'] = 'loop' if d.get('_selectMethod') == 1 else 'rand'
        info['n'] = len(d['_abilities'])
        for k, f in (('_diffFromLastOneIfNotFirst', 'diff'), ('_selectAllAtLeastOnce', 'once'), ('_isConfigurableProb', 'prob')):
            if d.get(k) == 1:
                info[f] = 1
    elif '_mainAbility' in d and isinstance(d.get('_abilities'), list):
        info['g'] = 'all'
        info['n'] = len(d['_abilities'])
    elif isinstance(d.get('_abilityConfigs'), list) and d['_abilityConfigs']:
        # a conditional group: the first child whose trigger passes casts (blocked / melee / ranged, reload …); child i
        # signals '{parent}.{i + 1}' like a random group's — `names` = the children's GameObject names, in order
        names = []
        for c in d['_abilityConfigs']:
            ref = c.get('_ability') if isinstance(c, dict) else None
            p = by_pid.get(ref.get('m_PathID')) if isinstance(ref, dict) else None
            names.append(p.split('/')[-1] if p else '?')
        info['g'] = 'cond'
        info['n'] = len(names)
        info['names'] = names
        if d.get('_selectAbilitySequentially') == 1:
            info['seq'] = 1
    if d.get('_addSpellCntToAllSignalId') == 1:
        info['spell'] = 'all'
    elif d.get('_addSpellCntToLastSignalId') == 1:
        info['spell'] = 'last'
    if d.get('_addSpellCntToAllHitSignalId') == 1:
        info['hitSpell'] = 1
    if isinstance(d.get('_additionalTimes'), int) and d['_additionalTimes'] > 0:
        info['times'] = d['_additionalTimes']
    return info


def unit_audio(tree, prefab_root=''):
    """The unit's entry (see the header) from one prefab tree, or None without `_modes`."""
    by_pid = {pid: gp for gp, _, pid in tree}
    root = next((d for gp, d, _ in tree if isinstance(d.get('_modes'), list) and d['_modes']
                 and (not prefab_root or gp == prefab_root)), None)
    if root is None:
        return None
    mode_paths = [by_pid.get(r.get('m_PathID')) or '' for r in root['_modes']]
    n = len(mode_paths)
    out = {'modes': [p.split('/')[-1] if p else '?' for p in mode_paths], 'sig': [[0, 0] for _ in range(n)],
           'ab': [{} for _ in range(n)], 'proj': [[] for _ in range(n)], 'talentProj': []}
    body = [{} for _ in range(n)]   # per mode: Body/<name> → its signal facts
    for gp, d, _ in tree:
        if prefab_root and not (gp == prefab_root or gp.startswith(prefab_root + '/')):
            continue
        i = next((k for k, mp in enumerate(mode_paths) if mp and (gp == mp or gp.startswith(mp + '/'))), None)
        if i is None:
            if gp.count('/') >= 1:
                proj_keys(d, out['talentProj'])
            parts = gp.split('/')
            if len(parts) >= 3 and parts[1] == 'Skills':   # an enemy's skill ability (its signal suffix = the GameObject name)
                proj_keys(d, out.setdefault('skills', {}).setdefault(parts[2], []))
            continue
        if gp == mode_paths[i] and '_addIndexToSignalId' in d:
            out['sig'][i] = [1 if d.get('_addIndexToSignalId') == 1 else 0, 1 if d.get('_includeIndexZero') == 1 else 0]
        rel = gp[len(mode_paths[i]) + 1:].split('/')
        if len(rel) == 2 and rel[0] == 'Body':
            body[i].setdefault(rel[1], {}).update(ability_info(tree, by_pid, gp, d))
        # a mode's own enemy skill (炎佑 Modes/2/Body/Skills/Skill_2): signalled by its name like a root one
        if len(rel) >= 3 and rel[0] == 'Body' and rel[1] == 'Skills':
            proj_keys(d, out.setdefault('skills', {}).setdefault(rel[2], []))
        proj_keys(d, out['proj'][i])
    # the attack abilities: Body/Attack → `attack`, Body/Combat → `combat` (their signal suffix); a mode with neither signals
    # its one Body ability as `attack` (荒芜拉普兰德's M0FunnelsNormalAttack → attack.0)
    go_of = [{} for _ in range(n)]
    for i in range(n):
        for name, info in sorted(body[i].items()):
            if name.lower() in ('attack', 'combat'):
                out['ab'][i][name.lower()] = info
                go_of[i][name] = name.lower()
        if not out['ab'][i] and body[i]:
            name = sorted(body[i])[0]
            out['ab'][i]['attack'] = dict(body[i][name], go=name)
            go_of[i][name] = 'attack'
    # each attack ability's own projectiles (`proj`: its own GameObject's keys), and a group's per child (`kidProj`, in `names`
    # order, the child's whole subtree); sub-abilities of a plain ability (its drones) are not its shots
    for gp, d, _ in tree:
        i = next((k for k, mp in enumerate(mode_paths) if mp and gp.startswith(mp + '/')), None)
        if i is None:
            continue
        rel = gp[len(mode_paths[i]) + 1:].split('/')
        if len(rel) < 2 or rel[0] != 'Body' or rel[1] not in go_of[i]:
            continue
        info = out['ab'][i][go_of[i][rel[1]]]
        names = info.get('names') or []
        if len(rel) == 2:
            proj_keys(d, info.setdefault('proj', []))
        elif rel[2] in names:
            kp = info.setdefault('kidProj', [[] for _ in names])
            proj_keys(d, kp[names.index(rel[2])])
    for m in out['ab']:
        for info in m.values():
            if not info.get('proj'):
                info.pop('proj', None)
            if 'kidProj' in info and not any(info['kidProj']):
                info.pop('kidProj')
    return out


def close_ab(e, projectiles):
    for m in e['ab']:
        for info in m.values():
            if info.get('proj'):
                info['proj'] = projectiles.closure(info['proj'])
            if info.get('kidProj'):
                info['kidProj'] = [projectiles.closure(x) for x in info['kidProj']]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--client', default=client_data())
    ap.add_argument('--id', action='append', default=[])
    a = ap.parse_args()
    projectiles = Projectiles(a.client)
    prefabs = char_skill_prefabs()
    # skill prefab → its projectile keys ([uc]skills.ab, ~1 min)
    sk_proj = {}
    for gp, d, _ in skills_tree(a.client):
        proj_keys(d, sk_proj.setdefault(gp.split('/')[0], []))
    out = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    out.pop('$comment', None)
    tokens_doc = json.loads((ROOT / 'data/tokens.json').read_text(encoding='utf-8'))
    tokens = tokens_doc.get('tokens', tokens_doc)
    ids = a.id or (pool_char_ids() + sorted(tokens))
    chars = [i for i in ids if i.startswith('char_')]
    toks = [i for i in ids if i.startswith('token_')]
    for cid in chars:
        f = bundle(a.client, f'charpack/{cid}.ab')
        if not f:
            print(f'no charpack: {cid}', file=sys.stderr)
            continue
        try:
            e = unit_audio(load_tree(str(f))[0])
        except Exception as err:  # keep the old entry
            print(f'FAIL {cid}: {err}', file=sys.stderr)
            continue
        if not e:
            continue
        mode_keys = {k for lst in e['proj'] for k in lst}
        e['proj'] = [projectiles.closure(lst) for lst in e['proj']]
        close_ab(e, projectiles)
        e['skillProj'] = [[k for k in projectiles.closure(sk_proj.get(pid) or []) if k not in mode_keys] for pid in (prefabs.get(cid) or [])]
        e['talentProj'] = [k for k in projectiles.closure(e['talentProj']) if k not in mode_keys]
        out[cid] = e
    if toks:
        want = set(toks)
        for base in (Path(a.client) / 'PersistentData/Bundles', Path(a.client) / 'StreamingAssets/AB/Windows'):
            for f in sorted(glob.glob(str(base / 'pkgrps/btl_pfb_tokens_*.ab'))):
                try:
                    tree = load_tree(f)[0]
                except Exception as err:
                    print(f'FAIL {f}: {err}', file=sys.stderr)
                    continue
                roots = {gp.split('/')[0] for gp, _, _ in tree} & want
                for tid in sorted(roots):
                    if tid in out and out[tid].get('_from') == 'persistent':
                        continue
                    e = unit_audio([x for x in tree if x[0] == tid or x[0].startswith(tid + '/')], tid)
                    if not e:
                        continue
                    sk = (tokens.get(tid) or {}).get('skill') or {}
                    sid = sk.get('skillId') if isinstance(sk, dict) else None
                    mode_keys = {k for lst in e['proj'] for k in lst}
                    e['proj'] = [projectiles.closure(lst) for lst in e['proj']]
                    close_ab(e, projectiles)
                    e['skillProj'] = [[k for k in projectiles.closure(sk_proj.get(sid) or []) if k not in mode_keys]] if sid else []
                    e['talentProj'] = [k for k in projectiles.closure(e['talentProj']) if k not in mode_keys]
                    if 'PersistentData' in str(base):
                        e['_from'] = 'persistent'
                    out[tid] = e
    # enemies: battle/enm_pfb_*.ab (PersistentData first), root = the enemy id, else its base id (`_2` variants)
    enemies_doc = json.loads((ROOT / 'data/enemies.json').read_text(encoding='utf-8'))
    enemies = enemies_doc.get('enemies', enemies_doc)
    eids = [i for i in ids if i.startswith('enemy_')] if a.id else sorted(enemies)
    if eids:
        roots = {}
        for base in (Path(a.client) / 'StreamingAssets/AB/Windows', Path(a.client) / 'PersistentData/Bundles'):
            for f in sorted(glob.glob(str(base / 'battle/enm_pfb*.ab'))):
                try:
                    tree = load_tree(f)[0]
                except Exception as err:
                    print(f'FAIL {f}: {err}', file=sys.stderr)
                    continue
                per = {}
                for x in tree:
                    per.setdefault(x[0].split('/')[0], []).append(x)
                roots.update(per)   # PersistentData last: the newer copy wins
        for eid in eids:
            m = re.match(r'^(enemy_\d+_[a-z0-9]+?)_\d+$', eid)
            rid = eid if eid in roots else (m.group(1) if m and m.group(1) in roots else None)
            if not rid:
                continue
            try:
                e = unit_audio(roots[rid], rid)
            except Exception as err:
                print(f'FAIL {eid}: {err}', file=sys.stderr)
                continue
            if not e:
                continue
            e['proj'] = [projectiles.closure(lst) for lst in e['proj']]
            close_ab(e, projectiles)
            e['skills'] = {k: projectiles.closure(v) for k, v in (e.get('skills') or {}).items()}
            e.pop('talentProj', None)
            if rid != eid:
                e['prefab'] = rid
            out[eid] = e
    for k, e in out.items():
        e.pop('_from', None)
        if not k.startswith('enemy_'):
            e.pop('skills', None)
    doc = {'$comment': 'Sound signal facts of the operators and summons (mode signal flags, attack ability groups, the '
                       'projectiles of each mode / skill / talent). Written by tools/local-extract/char_audio.py from the '
                       'local client; read by tools/assets/plan.mjs (skill-mode-sfx.mjs). docs/rules/audio.md 「공격 소리 신호」.'}
    doc.update({k: out[k] for k in sorted(out)})
    lines = [f' {json.dumps(k)}: {json.dumps(v, ensure_ascii=False, separators=(",", ":"))}' for k, v in doc.items()]
    OUT.write_text('{\n' + ',\n'.join(lines) + '\n}\n', encoding='utf-8')
    print(f'{len(out)} unit(s) → {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
