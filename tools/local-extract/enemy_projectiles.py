#!/usr/bin/env python3
"""The official projectiles of the enemies' attacks, skills and talents, from the local client.

An enemy ability that shoots names its projectile prefab (`_projectileKey`, fired from the model point
`_mountPointType`, Entity.MountPointType) on the ability MonoBehaviour of its prefab (battle/enm_pfb_*.ab:
`<id>/Modes/<mode>/Body/Attack|Combat` for the normal attack, `Skills/<name>` or `Modes/<mode>/…/Skills/<name>` for a
skill, `Talents/<name>` for a talent — a talent's buff may name it in its blackboard). The projectile prefab
(battle/prefabs/[uc]projectiles.ab) moves by one movement behaviour, recognised here by its serialized fields (the client's
classes, namespace Torappu.Battle.Projectiles):

  AdvancedMovement   `_moveType` (AdvancedMovement.MoveType: TRACE_TARGET_WITH_SPEED, FIXED_DIRECTION …), `_speed`,
                     `_delayToStart` (delay), `_delayAfterReached` (stay), `_constDirection` with `_useConstDirection`
  ParacurveMovement  `_raiseHeight` → move PARACURVE: the horizontal speed is `_speed` towards the target's current
                     position (the client's ParacurveMovement.OnInit / _CalculateNextPosition: flight time = horizontal
                     distance / speed; the height only shapes the arc); `_delayTime` with `_delayAfterReached` (stay: it
                     lies where it landed that long — the blackboard `projectile_delay_time` overrides it)
  HarpoonMovement    `_extendLenth` → move HARPOON (a line that extends at `_speed` (+ `_acceleration`) to its target)
  AttachToTarget     `_immediatelyReach` → move ATTACH (no flight: on the target after `_delayToStart` s)
  none               a projectile with no movement behaviour (an area / effect carrier at its target) → move NONE

The sim (server/sim/ai.js enemyAttack, content kits) times the hit of an enemy's shot by these numbers; the renderer and
the sound plan bind the projectile key. Writes tools/assets/local-enemy-projectiles.json, which tools/build-data.mjs
folds into data/enemies.json (`proj`, `skills[i].proj`, `talentProj`):

  { "projectiles": { "projectile_lslime": { "move": "PARACURVE", "speed": 6, "height": 0.3, "life": 5 }, … },
    "enemies": { "enemy_1050_lslime": { "attack": { "key": "projectile_lslime", "mount": "MUZZLE" },
                                        "modes": [ { "name": "Default", "attack": {…}, "combat": {…} }, … ],
                                        "skills": { "Boomb": [ {…} ] }, "talents": { "1": [ {…} ] } } } }

`attack` / `combat` = the projectile of the first mode's unblocked / blocked normal attack (absent: none — the attack
hits at its strike, its hit effect on the target); `modes` only when a later mode shoots another one. Keys are the
prefab roots (data/enemies.json `spine`); every prefab read has an entry ({} = it shoots nothing).

Usage (from the repo root; --client = the EN client's Arknights_Data folder):
  .venv-extract/bin/python tools/local-extract/enemy_projectiles.py [--client <…/Arknights_Data>]
Everything read is (c) Hypergryph; only these names and numbers are kept.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from char_modes import load_tree  # noqa: E402
from client_path import client_data  # noqa: E402
from attack_timing import mode_paths, num  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tools/assets/local-enemy-projectiles.json'

# the client's enums
MOVES = ['NONE', 'TRACE_TARGET_WITH_SPEED', 'TRACE_TARGET_WITHIN_TIME', 'TWO_POINTS', 'FIXED_DIRECTION', 'FIXED_DISTANCE',
         'FUNC_ANGLE_AND_TIME']   # AdvancedMovement.MoveType
MOUNTS = ['FOOT', 'HIT', 'MUZZLE', 'HEAD', 'UI', 'SPECIAL_0', 'SPECIAL_1', 'GROUND'] + [f'SPECIAL_{i}' for i in range(2, 16)]
DIRS = ['UP', 'RIGHT', 'DOWN', 'LEFT']   # SharedConsts.Direction (the client's enum)


def enum(names, v):
    return names[v] if isinstance(v, int) and 0 <= v < len(names) else (str(v) if v is not None else None)


def bundles(C, pattern):
    files = {}
    for base in (C / 'StreamingAssets/AB/Windows', C / 'PersistentData/Bundles'):
        for f in sorted(base.glob(pattern)):
            files[str(f.relative_to(base))] = f   # PersistentData (the newer bundle) wins
    return files


def movement(d):
    """(move, fields) of a movement MonoBehaviour, or None when `d` is none."""
    if '_moveType' in d:
        out = {'move': enum(MOVES, d['_moveType']), 'speed': num(d.get('_speed', 0))}
        if d.get('_delayToStart'):
            out['delay'] = num(d['_delayToStart'])
        if isinstance(d.get('_delayAfterReached'), (int, float)) and not isinstance(d.get('_delayAfterReached'), bool) and d['_delayAfterReached'] > 0 \
                and '_delayToReachAfterHit' in d:
            out['stay'] = num(d['_delayAfterReached'])
        if d.get('_useConstDirection'):
            out['dir'] = enum(DIRS, d.get('_constDirection'))
        if d.get('_useSourceDirection'):
            out['sourceDir'] = 1
        return out
    if '_raiseHeight' in d and '_speed' in d:
        out = {'move': 'PARACURVE', 'speed': num(d['_speed']), 'height': num(d['_raiseHeight'])}
        if d.get('_delayAfterReached') and d.get('_delayTime'):
            out['stay'] = num(d['_delayTime'])   # it stays this long where it landed (a blackboard `projectile_delay_time` overrides)
        return out
    if '_extendLenth' in d and '_speed' in d:
        out = {'move': 'HARPOON', 'speed': num(d['_speed'])}
        if d.get('_acceleration'):
            out['accel'] = num(d['_acceleration'])
        return out
    if '_immediatelyReach' in d:
        out = {'move': 'ATTACH', 'speed': 0}
        if d.get('_delayToStart'):
            out['delay'] = num(d['_delayToStart'])
        if d.get('_immediatelyReach'):
            out['instant'] = 1
        return out
    return None


def projectiles(C):
    """{key: record} of every projectile prefab (PersistentData first)."""
    roots = {}
    for f in bundles(C, 'battle/prefabs/[[]uc[]]projectiles.ab').values():
        per = {}
        for gp, d, _ in load_tree(f)[0]:
            per.setdefault(gp.split('/')[0], []).append((gp, d))
        roots.update(per)
    out = {}
    for key, lst in roots.items():
        r = {}
        moves = []
        for gp, d in lst:
            if gp != key:
                continue   # the root's own behaviours (children are graphics)
            m = movement(d)
            if m:
                moves.append(m)
        # a root with an AttachToTarget beside a moving behaviour (萨米的意志's 冰凌 projectile_enemy_smdeer): the moving
        # one is recorded — the client runs both: the AttachToTarget (`_immediatelyReach`) puts it on its target tile, the
        # FIXED_DIRECTION one moves it on from there (docs/rules/sim.md 「萨米的意志 冰凌」)
        moves.sort(key=lambda m: m['move'] == 'ATTACH')
        if moves:
            r.update(moves[0])
        for gp, d in lst:
            if gp != key:
                continue
            if d.get('_linkDuration'):
                r['link'] = num(d['_linkDuration'])
            if '_lifeTime' in d and '_lifeTimeType' in d:
                r['life'] = num(d['_lifeTime'])
            for k in ('_subProjectileKey', '_childProjectileKey'):
                if isinstance(d.get(k), str) and d[k]:
                    r.setdefault('sub', []).append(d[k])
        r.setdefault('move', 'NONE')
        r.setdefault('speed', 0)
        out[key] = dict(sorted(r.items()))
    return out


def shot(d):
    return {'key': d['_projectileKey'], 'mount': enum(MOUNTS, d.get('_mountPointType'))}


def strings(o):
    if isinstance(o, dict):
        for v in o.values():
            yield from strings(v)
    elif isinstance(o, list):
        for v in o:
            yield from strings(v)
    elif isinstance(o, str) and o:
        yield o


def first_shot(sub, base, names):
    """The projectile of the normal attack under `base` (`Body/Attack` …): the ability itself, else its shallowest
    descendant that shoots (假想敌：管 Body/Attack/AttackEnemy)."""
    for n in names:
        p = f'{base}/{n}'
        here = [d for gp, d, _ in sub if gp == p and d.get('_projectileKey')]
        if here:
            return shot(here[0])
        below = sorted(((gp.count('/'), gp, i) for i, (gp, d, _) in enumerate(sub) if gp.startswith(p + '/') and d.get('_projectileKey')))
        if below:
            return shot(sub[below[0][2]][1])
    return None


def enemy_entry(root, sub, proj_keys):
    modes = mode_paths(sub) or []
    if not modes or not modes[0]:
        bodies = sorted({gp.rsplit('/Body/', 1)[0] for gp, _, _ in sub if '/Body/' in gp})
        modes = [bodies[0] if bodies else root]
    per = []
    for m in modes:
        if not m:
            per.append({'name': '?'})
            continue
        e = {'name': m.split('/')[-1]}
        for key, names in (('attack', ('Body/Attack', 'Attack')), ('combat', ('Body/Combat', 'Combat'))):
            s = first_shot(sub, m, names)
            if s:
                e[key] = s
        per.append(e)
    out = {k: per[0][k] for k in ('attack', 'combat') if k in per[0]}
    if any(x.get(k) and x.get(k) != per[0].get(k) for x in per[1:] for k in ('attack', 'combat')):
        out['modes'] = per   # a later mode shoots another projectile (守墓石像 enemy_1172_dugago Fly, enemy_10081_mpplai ModeD)
    skills, talents = {}, {}
    for gp, d, _ in sub:
        rel = gp[len(root) + 1:]
        m = re.search(r'(?:^|/)Skills?/([^/]+)', rel)
        t = re.match(r'Talents/([^/]+)', rel)
        if m and d.get('_projectileKey'):
            lst = skills.setdefault(m.group(1), [])
            s = shot(d)
            if s not in lst:
                lst.append(s)
        if t:
            for v in strings({k: v for k, v in d.items() if k not in ('m_GameObject', 'm_Script', 'm_Name')}):
                if v in proj_keys:
                    lst = talents.setdefault(t.group(1), [])
                    s = shot(d) if d.get('_projectileKey') == v else {'key': v}
                    if s not in lst:
                        lst.append(s)
    if skills:
        out['skills'] = dict(sorted(skills.items()))
    if talents:
        out['talents'] = dict(sorted(talents.items()))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--client', default=client_data())
    ap.add_argument('--out', default=str(OUT))
    args = ap.parse_args()
    C = Path(args.client)
    proj = projectiles(C)
    enemies_json = json.loads((ROOT / 'data/enemies.json').read_text(encoding='utf-8'))
    recs = enemies_json.get('enemies', enemies_json)
    wanted = set(recs)
    for e in recs.values():
        if isinstance(e, dict):
            for f in ('prefabKey', 'spine'):
                if isinstance(e.get(f), str):
                    wanted.add(e[f])
    enemies = {}
    for f in bundles(C, 'battle/enm_pfb*.ab').values():
        tree, _ = load_tree(f)
        for root in sorted({gp.split('/')[0] for gp, _, _ in tree} & wanted):
            sub = [(gp, d, pid) for gp, d, pid in tree if gp == root or gp.startswith(root + '/')]
            enemies[root] = enemy_entry(root, sub, proj)   # {} = read, shoots nothing
    used = set()
    for e in enemies.values():
        for s in [e.get('attack'), e.get('combat')] + [x.get(k) for x in e.get('modes', []) for k in ('attack', 'combat')] \
                + [s for lst in list(e.get('skills', {}).values()) + list(e.get('talents', {}).values()) for s in lst]:
            if s:
                used.add(s['key'])
    for k in list(used):   # a projectile's sub-projectiles (萨米的意志's 冰凌 → its landing)
        used.update(proj.get(k, {}).get('sub', []))
    out = {'projectiles': {k: proj[k] for k in sorted(used) if k in proj}, 'enemies': dict(sorted(enemies.items()))}
    missing = sorted(used - set(proj))
    if missing:
        print('projectiles not in [uc]projectiles.ab:', ', '.join(missing), file=sys.stderr)
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'{len(out["projectiles"])} projectiles, {len(enemies)} enemies → {args.out}')


if __name__ == '__main__':
    main()
