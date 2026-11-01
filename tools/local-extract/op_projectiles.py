#!/usr/bin/env python3
"""The official projectiles of the operators' normal attacks, per attack mode, from the local client.

A mode's normal attack (`<id>/Modes/<mode>/Body/Attack`, a heal `Body/Heal`, a fortress' `Body/Attack/RangedAttack` …)
names its projectile prefab in `_projectileKey` on the ability MonoBehaviour; an attack ability without one deals its
hit at the strike (能天使's Default attack, 夕, 白面鸮's heal: no projectile — the client's attack event lands it). An
operator that blocks attacks the enemies it blocks with its `Body/Combat` ability instead (CombatState; 拉普兰德's has no
projectile while her Attack shoots `projectile_whitew_atk`). The projectile's movement is read as
tools/local-extract/enemy_projectiles.py reads the enemies' (AdvancedMovement `_speed`, ParacurveMovement — the horizontal
speed —, AttachToTarget …; OTHER: a movement behaviour it does not read). The sim (server/sim/ai.js opShot) flies an operator's shot by these numbers and the renderer
draws it over the same time (render/fx/speeds.js opProjSpeed). Writes tools/assets/local-op-projectiles.json, which
tools/build-data.mjs folds into data/chess.json / data/backups.json (`shot`):

  { "projectiles": { "projectile_silent": { "move": "PARACURVE", "speed": 5, "height": 1 }, … },
    "ops": { "char_140_whitew": { "modes": ["Default", "S2"],
                                  "attack": [ { "key": "projectile_whitew_atk", "mount": "MUZZLE" }, { … } ],
                                  "combat": [1, 1] } } }

`attack[i]` = the projectile of mode i's ranged (unblocked) attack, null when that attack has none, absent (no entry in
the list: None) when the mode has no attack ability read; `combat[i]` 1 = the mode has a blocked attack (`Body/Combat`,
a fortress' `Body/Attack/BlockedMeleeAttack`) without a projectile. `modes` is the prefab's `_modes` order, as
tools/local-extract/attack_timing.py writes it. `skills` = { skill prefabId: { key, mount } }: the projectile a skill's
own ability fires (battle/prefabs/[uc]skills.ab, the shallowest that names one) — the attack of a skill with no mode
of its own and no table duration fires it (能天使 S1's projectile_angel).

Usage (from the repo root; --client = an Arknights_Data folder, repeatable: the first client that has an operator's pack,
a skill or a projectile prefab decides it — by default the EN client, then the CN one for what the EN one lacks
(client_path.py); an operator or skill neither client has keeps the row of the earlier run, with its projectiles):
  .venv-extract/bin/python tools/local-extract/op_projectiles.py [--client <EN …/Arknights_Data>] [--client <CN …/Arknights_Data>]
Everything read is (c) Hypergryph; only these names and numbers are kept.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from char_modes import load_tree, skills_tree, char_skill_prefabs, END_ABILITY  # noqa: E402
from client_path import clients, earlier, kept  # noqa: E402
from attack_timing import mode_paths, all_char_ids, charpack, NOT_ATTACK  # noqa: E402
import enemy_projectiles as ep  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tools/assets/local-op-projectiles.json'

# the abilities that make a mode's unblocked normal attack, by their path under the mode (first match with an ability
# wins): the direct ones, then the children of Body/Attack named for a ranged attack (号角 RangedAttack), then any other
# child of Body/Attack that is no melee / blocked one
DIRECT = ('Body/Attack', 'Attack', 'Body/Heal', 'Heal')
RANGED_CHILD = re.compile(r'^Body/Attack/[^/]*Ranged[^/]*$')
OTHER_CHILD = re.compile(r'^Body/Attack/[^/]+$')
MELEE_NAME = re.compile(r'Melee|Blocked|Combat|Self', re.I)
# a blocked attack: CombatState's ability, or a fortress' blocked melee
BLOCKED = re.compile(r'^(Body/Combat|Combat|Body/Attack/BlockedMelee[^/]*)$')


def abilities(tree, base):
    """{path relative to the mode: (has an attack ability, its projectile key or '')} of the mode's attack abilities —
    a MonoBehaviour with an `_animKey` (an animated ability) or a `_projectileKey`."""
    out = {}
    for gp, d, _ in tree:
        if not gp.startswith(base + '/'):
            continue
        rel = gp[len(base) + 1:]
        if '_animKey' not in d and '_projectileKey' not in d:
            continue
        key = d.get('_projectileKey') if isinstance(d.get('_projectileKey'), str) else ''
        prev = out.get(rel)
        out[rel] = (True, (prev[1] if prev and prev[1] else key))
    return out


def ranged(ab):
    """(found, key) of the mode's unblocked attack: key '' = it has no projectile."""
    for rel in DIRECT:
        if rel in ab and (ab[rel][1] or rel != 'Body/Attack' or not any(RANGED_CHILD.match(r) or OTHER_CHILD.match(r) for r in ab)):
            return True, ab[rel][1]
    # 号角 S2: RangedAttack before BlockedRangedAttack / SelfRangedAttack (the blocked and point-blank variants)
    name = lambda r: r.rsplit('/', 1)[-1]
    kids = sorted((r for r in ab if RANGED_CHILD.match(r)), key=lambda r: (bool(MELEE_NAME.search(name(r))), r))
    kids += sorted((r for r in ab if OTHER_CHILD.match(r) and not MELEE_NAME.search(name(r)) and r not in kids), key=lambda r: r)
    for r in kids:
        return True, ab[r][1]
    if 'Body/Attack' in ab:
        return True, ab['Body/Attack'][1]
    # any other ability of the mode named Attack (荒芜拉普兰德 `Body/M0FunnelsNormalAttack`, whose funnels shoot): its own
    # projectile, else its children's first
    other = sorted((r for r in ab if r.count('/') == 1 and re.search(r'attack', name(r), re.I) and not NOT_ATTACK.search(r)), key=lambda r: r)
    for r in other:
        kid = sorted(k for k in ab if k.startswith(r + '/') and ab[k][1])
        return True, ab[r][1] or (ab[kid[0]][1] if kid else '')
    return False, ''


def op_entry(path):
    tree, _ = load_tree(path)
    modes = mode_paths(tree)
    if not modes:
        return None
    attack, combat = [], []
    for p in modes:
        ab = abilities(tree, p) if p else {}
        found, key = ranged(ab)
        mount = None
        if key:
            d = next((d for gp, d, _ in tree if gp.startswith(p + '/') and d.get('_projectileKey') == key), {})
            mount = ep.enum(ep.MOUNTS, d.get('_mountPointType')) if isinstance(d.get('_mountPointType'), int) else None
        attack.append(({'key': key, **({'mount': mount} if mount else {})} if key else None) if found else 'none')
        combat.append(1 if any(BLOCKED.match(r) and not k for r, (_, k) in ab.items()) else 0)
    return {'modes': [p.split('/')[-1] if p else '?' for p in modes], 'attack': attack, 'combat': combat}


def skill_shots(C, wanted):
    """({skill prefabId: {key, mount}}, {skill prefabId read}) of a client's skill bundle: a skill's own shot
    (battle/prefabs/[uc]skills.ab `<prefabId>/…` `_projectileKey`, the shallowest ability that names one, End… abilities
    aside) — what the attack of a skill without a mode of its own fires (能天使 S1's projectile_angel, 号角 S1's
    projectile_chr_horn_s1); tools/build-data.mjs opShot takes it for a skill without table duration."""
    found, read = {}, set()
    for gp, d, _ in skills_tree(C):
        sid, _, rest = gp.partition('/')
        if sid not in wanted:
            continue
        read.add(sid)
        key = d.get('_projectileKey')
        if not isinstance(key, str) or not key or any(END_ABILITY.match(x) for x in rest.split('/') if x):
            continue
        rank = (gp.count('/'), gp)
        if sid not in found or rank < found[sid][0]:
            mount = ep.enum(ep.MOUNTS, d.get('_mountPointType')) if isinstance(d.get('_mountPointType'), int) else None
            found[sid] = (rank, {'key': key, **({'mount': mount} if mount else {})})
    return {sid: v[1] for sid, v in found.items()}, read


def client_projectiles(C, keys):
    """{key: record} of the projectile prefabs among `keys` that a client has. A root with a movement behaviour this
    reader does not know (`_rotateToTarget` is the ProjectileMovement base's field — 丰川祥子's notes
    `projectile_chr_oblvns_talent`, 安洁莉娜 S2's `projectile_aglina_s2`) is no NONE (an effect carrier at its target,
    银灰's `projectile_svrash`): `move` OTHER, the flight not read (the sim keeps the kind's speed)."""
    allp = ep.projectiles(C)
    out = {k: allp[k] for k in keys if k in allp}
    for f in ep.bundles(C, 'battle/prefabs/[[]uc[]]projectiles.ab').values():
        for gp, d, _ in load_tree(f)[0]:
            if gp in out and out[gp]['move'] == 'NONE' and '_rotateToTarget' in d:
                out[gp] = {**out[gp], 'move': 'OTHER'}
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--client', action='append', help='an Arknights_Data folder (repeatable; default: EN, then CN — client_path.py)')
    ap.add_argument('--out', default=str(OUT))
    args = ap.parse_args()
    cids = all_char_ids()
    wanted = {sid for lst in char_skill_prefabs().values() for sid in lst if isinstance(sid, str)}
    order = clients(args.client)
    ops, read, skills, skills_read = {}, set(), {}, set()
    for client in order:
        n_ops, n_skills = len(ops), len(skills)
        for cid in cids:
            f = None if cid in read else charpack(client, cid)
            if f is None:
                continue
            read.add(cid)
            e = op_entry(f)
            if e:
                ops[cid] = e
        shots, sread = skill_shots(Path(client), wanted - skills_read)
        skills.update(shots)
        skills_read |= sread
        print(f'{client}: {len(ops) - n_ops} operators, {len(skills) - n_skills} skill shots')
    for cid in sorted(set(cids) - read):
        print('missing', cid, file=sys.stderr)
    for e in ops.values():   # JSON: a mode with no attack ability read is null in the list too, told apart by `none`
        e['none'] = [i for i, a in enumerate(e['attack']) if a == 'none']
        e['attack'] = [None if a == 'none' else a for a in e['attack']]
        if not e['none']:
            del e['none']
        if not any(e['combat']):
            del e['combat']
    prev = earlier(args.out)
    old_ops = kept(prev.get('ops') or {}, read, cids)
    old_skills = kept(prev.get('skills') or {}, skills_read, wanted)
    ops.update(old_ops)
    skills.update(old_skills)
    keys = {a['key'] for e in ops.values() for a in e['attack'] if isinstance(a, dict)} | {v['key'] for v in skills.values()}
    projectiles = {}
    for client in order:
        projectiles.update(client_projectiles(Path(client), keys - set(projectiles)))
    # a key no client has: the earlier run's record (a kept row's), else no movement
    old_p = prev.get('projectiles') or {}
    projectiles.update({k: old_p.get(k, {'move': 'NONE', 'speed': 0}) for k in keys - set(projectiles)})
    out = {'projectiles': dict(sorted(projectiles.items())), 'ops': dict(sorted(ops.items())), 'skills': dict(sorted(skills.items()))}
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    old = [*old_ops, *old_skills]
    print(f'{len(ops)} operators, {len(skills)} skill shots, {len(projectiles)} projectiles → {args.out}'
          + (f'; kept from the earlier run: {", ".join(old)}' if old else ''))


if __name__ == '__main__':
    main()
