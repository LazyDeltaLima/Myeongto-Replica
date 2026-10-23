#!/usr/bin/env python3
"""Normal-attack timing fields of the operators' and enemies' attack abilities, from the local client.

The client times a normal attack from its attack ability (`AbstractAnimatedAbility` → `EasyToStartAbility`, the
MonoBehaviour on `<id>/Modes/<mode>/Body/Attack` or `…/Combat`): its clip `_animKey` is played at the speed that fits the
attack time — scale = clamp(attack time / clip length, 0.1, `_maxAnimScale`) (−1 = no upper bound), speed = 1 / scale,
the swing lasts scale × clip (the client's `AbstractAnimatedAbility.UpdatePlaybackSpeed`) —, the damage lands on the
clip's OnAttack event when `_waitForAttackEvent` is 1 (else `_preDelay` × scale after the swing starts), and
`_selectTargetTiming` says whether the targets are taken again at the strike (docs/rules/sim.md 「일반 공격 타이밍」),
and the ability's facing flags say where the unit turns as the swing starts (`AbstractAnimatedAbility.DealWithFaceDirection`,
the first flag set wins: `_faceToTarget` → `face` 1 its main target, `_faceToDefault` 2 its deploy direction,
`_faceToFront` 3 front, `_faceToFirstCastTarget` 4 its first cast target; 0 none: it keeps its facing — docs/rules/render.md
「공격 방향」).
The sim (server/sim/ai.js) and the renderer need those per operator mode and per enemy; the clip lengths and OnAttack
frames themselves come from the Spine skeletons (data/assets.json). This script writes
tools/assets/local-attack-timing.json, which tools/build-data.mjs folds into data/chess.json / data/backups.json
(`attackAnim`) and data/enemies.json (`attackAnim.max` …):

  { "ops": { "char_4100_caper": { "modes": ["Default", "S2", "S2[Down]"],
                                  "attack": [ { "anim": "Attack", "max": 1, "pre": 0, "wait": 1, "sel": 0, "dead": 0,
                                                "time": 0, "face": 1 }, … ] } },   (+ "begin", "esc": a ThreePart attack)
    "enemies": { "enemy_1001_bigbo": { "combat": { … }, "attack": { … } } } }

`attack[i]` = the attack ability of mode i (null when the mode has none), its clip renamed by the mode's
`_replaceAnimPairs`; an enemy's `combat` / `attack` = the abilities of
its first mode used while blocked / unblocked (either may be missing).

Usage (from the repo root; --client = the EN client's Arknights_Data folder):
  .venv-extract/bin/python tools/local-extract/attack_timing.py [--client <…/Arknights_Data>]
Everything read is (c) Hypergryph; only these numbers are kept.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from char_modes import load_tree, pool_char_ids  # noqa: E402
from client_path import client_data  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tools/assets/local-attack-timing.json'

# MonoBehaviour field → output key
FIELDS = {
    '_animKey': 'anim', '_maxAnimScale': 'max', '_preDelay': 'pre', '_waitForAttackEvent': 'wait',
    '_selectTargetTiming': 'sel', '_interuptIfTargetDead': 'dead', '_timeMode': 'time',
}
# the ability that makes a mode's normal attack, by its path under the mode (first match wins); then the first child of
# Body/Attack, Body/Combat (alternatives such as 维什戴尔 Attack_A/B/C: the first by name stands for all)
DIRECT = ('Body/Attack', 'Body/Combat', 'Attack', 'Combat', 'Body/Heal')
NESTED = ('Body/Attack/', 'Body/Combat/', 'Attack/')
# abilities that are no normal attack (talents, skill-triggered and general abilities)
NOT_ATTACK = re.compile(r'(^|/)(GeneralAbilities|Talents|Trigger|Skills|CommonAbilities)(/|$)')
# the facing flags in the order DealWithFaceDirection tests them → `face` 1..4 (0: none set)
FACE_FLAGS = ('_faceToTarget', '_faceToDefault', '_faceToFront', '_faceToFirstCastTarget')


def num(v):
    f = float(v)
    return int(f) if f == int(f) else round(f, 4)


def ability(d):
    """The timing fields of an attack ability MonoBehaviour, or None when it is no animated ability."""
    if not isinstance(d, dict) or '_animKey' not in d or '_maxAnimScale' not in d or '_timeMode' not in d:
        return None
    out = {}
    for k, o in FIELDS.items():
        v = d.get(k)
        if k == '_animKey':
            out[o] = v if isinstance(v, str) else ''
        elif isinstance(v, (int, float)):
            out[o] = num(v)
    if any(f in d for f in FACE_FLAGS):
        out['face'] = next((i + 1 for i, f in enumerate(FACE_FLAGS) if d.get(f)), 0)
    return out


def pick(cands):
    """The normal-attack ability among {relative path: fields} of one mode, or None. A direct ability without a clip of
    its own (维什戴尔 S3 `Body/Attack`, a selector over MainAttack / AimEff) gives way to its descendants — the shallowest
    first, those named Attack / Combat first (年 `Body/Attack/children/Attack_1`); then any other ability of the mode
    named Attack (白铁 `Body/M0FunnelsNormalAttack`) outside its talents / triggers / general abilities."""
    direct = next((cands[rel] for rel in DIRECT if rel in cands), None)
    if direct is not None and direct.get('anim'):
        return direct
    for pre in NESTED:
        sub = [r for r in cands if r.startswith(pre) and cands[r].get('anim')]
        sub.sort(key=lambda r: (r.count('/'), not re.search(r'attack|combat', r.rsplit('/', 1)[-1], re.I), r))
        if sub:
            return cands[sub[0]]
    other = sorted((r for r in cands if cands[r].get('anim') and re.search(r'attack|combat', r, re.I) and not NOT_ATTACK.search(r)),
                   key=lambda r: (r.count('/'), r))
    return cands[other[0]] if other else direct


def mode_paths(tree):
    """The GameObject paths of the prefab's `_modes` (in order), or None."""
    root = next((d for _, d, _ in tree if isinstance(d.get('_modes'), list) and d['_modes']), None)
    if root is None:
        return None
    by_pid = {pid: gp for gp, _, pid in tree}
    return [by_pid.get(r.get('m_PathID')) or '' for r in root['_modes']]


def under(tree, base):
    """{path relative to `base`: ability fields} of the animated abilities below GameObject `base`."""
    out, three = {}, {}
    for gp, d, _ in tree:
        if not gp.startswith(base + '/'):
            continue
        rel = gp[len(base) + 1:]
        a = ability(d)
        if a is not None:
            a['_esc'] = d.get('_escapeTime')
            out.setdefault(rel, a)
        # a ThreePartOneshotAnimation / CycleThreePartAnimation beside it plays the clips and sets their speed
        if isinstance(d.get('_oneshotAnim'), str) and d['_oneshotAnim']:
            three.setdefault(rel, d)
    for rel, a in out.items():
        esc = a.pop('_esc', None)
        t = three.get(rel)
        if t is None or a.get('anim'):
            continue
        # its `_oneshotAnim` is the attack clip; its own `_maxAnimScale` bounds the scale (ThreePartOneshotAnimation.
        # InitAnimation, whose speed UpdatePlaybackSpeed hands the ability); a `_beginAnim` played before the first attack
        # only (`_onlyPlayBeginAnimWhenFirstAttack`) is scaled with it — `begin` + the ability's `_escapeTime` (`esc`: how
        # long the attack state outlasts a lost target, which decides what a first attack is; docs/rules/sim.md
        # 「일반 공격 타이밍」). A begin on every attack and an `_endAnim` are not read: none in the pool has one.
        a['anim'] = t['_oneshotAnim']
        if isinstance(t.get('_maxAnimScale'), (int, float)):
            a['max'] = num(t['_maxAnimScale'])
        if t.get('_onlyPlayBeginAnimWhenFirstAttack') and isinstance(t.get('_beginAnim'), str) and t['_beginAnim']:
            a['begin'] = t['_beginAnim']
            if isinstance(esc, (int, float)) and esc > 0:
                a['esc'] = num(esc)
    return out


def op_entry(path):
    tree, _ = load_tree(path)
    modes = mode_paths(tree)
    if not modes:
        return None
    attack = []
    for p in modes:
        a = pick(under(tree, p)) if p else None
        # the mode's `_replaceAnimPairs` (维什戴尔 S2: Attack → Skill_2_Loop) rename the clip it plays
        rep = next((d.get('_replaceAnimPairs') for gp, d, _ in tree if gp == p and isinstance(d.get('_replaceAnimPairs'), list)), None)
        if a and a.get('anim') and rep:
            to = next((r.get('toAnimKey') for r in rep if isinstance(r, dict) and r.get('fromAnimKey') == a['anim']), None)
            if isinstance(to, str) and to:
                a = {**a, 'anim': to}
        attack.append(a)
    return {'modes': [p.split('/')[-1] if p else '?' for p in modes], 'attack': attack}


def enemy_entries(path, wanted):
    tree, _ = load_tree(path)
    roots = {gp.split('/')[0] for gp, _, _ in tree}
    out = {}
    for root in sorted(roots & wanted):
        sub = [(gp, d, pid) for gp, d, pid in tree if gp == root or gp.startswith(root + '/')]
        modes = mode_paths(sub)
        base = modes[0] if modes and modes[0] else None
        if base is None:
            # no `_modes` list: the first GameObject holding a Body (enemy_1001_bigbo/Default/Body/Combat)
            bodies = sorted({gp.rsplit('/Body/', 1)[0] for gp, _, _ in sub if '/Body/' in gp})
            base = bodies[0] if bodies else root
        cands = under(sub, base)
        e = {}
        for key, names in (('combat', ('Body/Combat', 'Combat')), ('attack', ('Body/Attack', 'Attack'))):
            a = next((cands[n] for n in names if n in cands), None)
            if a is None:
                sub_names = sorted(r for r in cands if any(r.startswith(n + '/') and '/' not in r[len(n) + 1:] for n in names))
                a = cands[sub_names[0]] if sub_names else None
            if a is not None:
                e[key] = a
        sk = enemy_skills(sub, modes)
        if sk:
            e['skills'] = sk
        if e:
            out[root] = e
    return out


# EnemySkill MonoBehaviour field → output key (its family mask, whether the main attack's cooldown restarts as its cast
# ends and with what `waitFirstPeriod`)
SKILL_FIELDS = {'_familyMask': 'family', '_resetMainAbilityCdWhenCastEnd': 'resetMain', '_resetCdWaitFirstPeriod': 'waitFirst'}


def enemy_skills(sub, modes):
    """{skill GameObject name: fields} of an enemy prefab's EnemySkill components (the MonoBehaviour with `_familyMask`,
    `<root>/Modes/<mode>/Skills/<name>`): its family mask and main-attack reset flags, and the clip of the animated ability
    on the same GameObject (`anim`, `max`, `wait`, `pre` as for the attack; none when the ability plays no clip). The
    client casts such a skill in place of a normal attack (the client's `Enemy.AttackWrapper.SearchTarget` / `Cast`) and
    restarts its cooldown when the cast ends (`EnemySkill._OnCastFinish`). A name in several modes: the first mode's
    (the prefab's `_modes` order), the others only when they differ (`alt`)."""
    order = {p: i for i, p in enumerate(modes or []) if p}
    rank = lambda gp: min((i for p, i in order.items() if gp.startswith(p + '/')), default=len(order))
    by_gp = {}
    for gp, d, _ in sub:
        by_gp.setdefault(gp, []).append(d)
    out = {}
    for gp in sorted((gp for gp, ds in by_gp.items() if any('_familyMask' in d for d in ds)), key=lambda g: (rank(g), g)):
        ds = by_gp[gp]
        s = next(d for d in ds if '_familyMask' in d)
        rec = {o: num(s[k]) if isinstance(s.get(k), (int, float)) else 0 for k, o in SKILL_FIELDS.items()}
        a = next((x for x in (ability(d) for d in ds) if x is not None), None)
        if a and a.get('anim'):
            rec.update({k: a[k] for k in ('anim', 'max', 'wait', 'pre') if k in a})
        name = gp.rsplit('/', 1)[-1]
        if name not in out:
            out[name] = rec
        elif rec != out[name] and rec not in out[name].get('alt', []):
            out[name].setdefault('alt', []).append(rec)
    return out


def all_char_ids():
    ids = set(pool_char_ids())
    p = ROOT / 'data/backups.json'
    if p.exists():
        units = (json.loads(p.read_text(encoding='utf-8')).get('units') or {})
        ids |= {k for k in units if isinstance(k, str) and k.startswith('char_')}
    return sorted(ids)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--client', default=client_data())
    ap.add_argument('--out', default=str(OUT))
    args = ap.parse_args()
    C = Path(args.client)
    ops = {}
    for cid in all_char_ids():
        f = C / f'PersistentData/Bundles/charpack/{cid}.ab'
        if not f.exists():
            f = C / f'StreamingAssets/AB/Windows/charpack/{cid}.ab'
        if not f.exists():
            print('missing', cid, file=sys.stderr)
            continue
        e = op_entry(f)
        if e:
            ops[cid] = e
    enemies_json = json.loads((ROOT / 'data/enemies.json').read_text(encoding='utf-8'))
    recs = enemies_json.get('enemies', enemies_json)
    wanted = set(recs)
    for k, e in recs.items():
        if isinstance(e, dict):
            for f in ('prefabKey', 'spine'):
                if isinstance(e.get(f), str):
                    wanted.add(e[f])
    files = {}
    for base in (C / 'StreamingAssets/AB/Windows/battle', C / 'PersistentData/Bundles/battle'):
        for f in sorted(base.glob('enm_pfb*.ab')):
            files[f.name] = f   # PersistentData (the newer bundle) wins
    enemies = {}
    for f in files.values():
        enemies.update(enemy_entries(f, wanted))
    out = {'ops': dict(sorted(ops.items())), 'enemies': dict(sorted(enemies.items()))}
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':'), sort_keys=False) + '\n', encoding='utf-8')
    print(f'{len(ops)} operators, {len(enemies)} enemies → {args.out}')


if __name__ == '__main__':
    main()
