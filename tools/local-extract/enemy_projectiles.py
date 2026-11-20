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
  ParacurveMovement  `_raiseHeight` → move PARACURVE `height`, `_noRaiseHeightThreshold` → `noRaise` (within it of its
                     target at launch it does not rise; render/fx/projectiles.js lobZ): the horizontal speed is `_speed` towards the target's current
                     position (the client's ParacurveMovement.OnInit / _CalculateNextPosition: flight time = horizontal
                     distance / speed; the height only shapes the arc); `_delayTime` with `_delayAfterReached` (stay: it
                     lies where it landed that long — the blackboard `projectile_delay_time` overrides it)
  HarpoonMovement    `_extendLenth` → move HARPOON (a line that extends at `_speed` (+ `_acceleration`) to its target)
  AttachToTarget     `_immediatelyReach` → move ATTACH (no flight: on the target after `_delayToStart` s); one that is not
                     instant gets `land` = when its hit lands (attach_land): the client's AttachToTarget.OnTick checks the
                     reach only with `_checkReached` (on the target from OnInit: reached at once), and `_delayAfterReached`
                     then stops it `_delayTime` s later (Projectile.EnsureLifeTime + a timed Stop); without `_checkReached`
                     it is reached only when its LIMITED life ends (`_alwaysReachInTheEnd`, Projectile.OnProjectileStop);
                     a hit behaviour with `_onlyCheckHitWhenStop` hits at the stop, one with
                     `_onlyCheckHitWhenReachTarget` at the reach; `trace` 1 = it hits its own target in the end
                     wherever that one stands (`_alwaysHitTraceTargetInTheEnd` / `_alwaysHitTraceTargetWhenReached`,
                     the client's Projectile._DealHitTraceTarget: while it lives) — else only the enemies in its collider
  none               a projectile with no movement behaviour (an area / effect carrier at its target) → move NONE

and its EffectBehaviour's `_effectsWhenReached` made on the ground under it where it reached — `_forceReachTargetGround` or
`_followTargetGround` (the client's EffectBehaviour.OnProjectileReached: a fixed position at the projectile's own board x, y
and its target's ground height; without them they are made on the projectile, or on its trace target) → `ground` [names]
(render/fxgame.js shellLand: 灰毫's and 号角's blasts, 烹泉's and 自制投石机's shells …; reach_ground).

The sim (server/sim/ai.js enemyAttack, content kits) times the hit of an enemy's shot by these numbers; the renderer and
the sound plan bind the projectile key. Writes tools/assets/local-enemy-projectiles.json, which tools/build-data.mjs
folds into data/enemies.json (`proj`, `skills[i].proj`, `talentProj`):

  { "projectiles": { "projectile_lslime": { "move": "PARACURVE", "speed": 6, "height": 0.3, "life": 5 }, … },
    "enemies": { "enemy_1050_lslime": { "attack": { "key": "projectile_lslime", "mount": "MUZZLE" },
                                        "modes": [ { "name": "Default", "attack": {…}, "combat": {…} }, … ],
                                        "skills": { "Boomb": [ {…} ] }, "talents": { "1": [ {…} ] } } } }

`attack` / `combat` = the projectile of the first mode's unblocked / blocked normal attack (absent: none — the attack
hits at its strike, its hit effect on the target); `modes` only when a later mode shoots another one. `motion` {mode
name: MotionMask} = whom each mode's normal attack can take by motion (attack_motion; tools/build-data.mjs folds it into
`attackMotion` / `attackMotionModes`; absent: no mode's attack takes a unit of our side). Keys are the
prefab roots (data/enemies.json `spine`); every prefab read has an entry ({} = it shoots nothing).

Usage (from the repo root; --client = the EN client's Arknights_Data folder):
  .venv-extract/bin/python tools/local-extract/enemy_projectiles.py [--client <…/Arknights_Data>]
  .venv-extract/bin/python tools/local-extract/enemy_projectiles.py --season-new [--client <EN>] [--client <CN>]
--season-new reads only the enemies a season's data/seasons/<id>/enemies.json adds that the earlier run has no row for,
from the EN client, then the CN one for those EN lacks (client_path.py clients), and their projectiles the earlier run
lacks; every other row stays as the earlier run wrote it.
Everything read is (c) Hypergryph; only these names and numbers are kept.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from char_modes import load_tree  # noqa: E402
from client_path import client_data, clients, earlier, enemy_keys  # noqa: E402
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
        if not isinstance(d.get('_noRaiseHeightThreshold'), (int, float)):
            raise SystemExit(f'a ParacurveMovement without `_noRaiseHeightThreshold`: {sorted(d)}')
        out = {'move': 'PARACURVE', 'speed': num(d['_speed']), 'height': num(d['_raiseHeight']),
               'noRaise': num(d['_noRaiseHeightThreshold'])}
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


def reach_ground(ds):
    """The `_effectsWhenReached` names of the EffectBehaviours among `ds` (a projectile prefab's behaviours) that are made on
    the ground under the projectile where it reached (`_forceReachTargetGround` or `_followTargetGround`), in order; [] for
    none. A behaviour with `_effectsWhenReached` but no `_effectsWhenHit` is no EffectBehaviour (a HarpoonRenderer's) and is
    skipped; an EffectBehaviour without both flags stops the run (a field this reader does not know)."""
    out = []
    for d in ds:
        if '_effectsWhenReached' not in d or '_effectsWhenHit' not in d:
            continue
        flags = (d.get('_forceReachTargetGround'), d.get('_followTargetGround'))
        names = d['_effectsWhenReached']
        if not all(isinstance(v, int) for v in flags) or not isinstance(names, list):
            raise SystemExit(f'an EffectBehaviour without `_forceReachTargetGround` / `_followTargetGround` / a `_effectsWhenReached` list: {sorted(d)}')
        if any(flags):
            out += [n for n in names if isinstance(n, str) and n and n not in out]
    return out


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
        # may an aura slow it or an ability wipe it (Projectile._InitOuterAdjustableSettings; 逻各斯 S3): the movement must allow it
        # (`get_movementAdjustable`: AdvancedMovement and ParacurveMovement yes, HarpoonMovement and AttachToTarget no, no
        # movement no); then `_movementAdjustableStatus` 0 AUTOMATIC = it has a `_mainEffect`, 1 yes, else no. `_eliminatableStatus`
        # 0 AUTOMATIC = the same as that, 1 yes, else no. Written only when false: `adjust` 0 / `elim` 0.
        for gp, d in lst:
            if gp == key and '_movementAdjustableStatus' in d:
                adj = bool(moves) and r['move'] not in ('HARPOON', 'ATTACH', 'NONE')
                st = d['_movementAdjustableStatus']
                adj = adj and (bool(d.get('_mainEffect')) if st == 0 else st == 1)
                el = d.get('_eliminatableStatus', 0)
                elim = adj if el == 0 else el == 1
                if not adj:
                    r['adjust'] = 0
                if not elim:
                    r['elim'] = 0
        land = attach_land([d for gp, d in lst if gp == key])
        if land is not None:
            r['land'] = land
        ground = reach_ground([d for gp, d in lst if gp == key])
        if ground:
            r['ground'] = ground
        if r['move'] == 'ATTACH' and any(d.get('_alwaysHitTraceTargetInTheEnd') or d.get('_alwaysHitTraceTargetWhenReached')
                                         for gp, d in lst if gp == key):
            r['trace'] = 1
        out[key] = dict(sorted(r.items()))
    return out


def attach_land(ds):
    """When the hit of a non-instant AttachToTarget projectile lands, in s after it is fired (None: instant or not
    ATTACH, or nothing lands it). `ds` = the behaviours on the prefab root."""
    att = next((d for d in ds if '_immediatelyReach' in d), None)
    if att is None or att.get('_immediatelyReach'):
        return None
    start = num(att.get('_delayToStart') or 0)
    life = next((num(d['_lifeTime']) for d in ds if d.get('_lifeTimeType') == 1 and '_lifeTime' in d), None)
    at_end = any(d.get('_alwaysReachInTheEnd') for d in ds)
    if att.get('_checkReached'):
        reach = start
        delay = num(att.get('_delayTime') or 0) if att.get('_delayAfterReached') else 0
        stop = reach + delay if delay > 0 else (life if life is not None else None)
    else:
        stop = life
        reach = life if at_end else None
    hit_stop = any(d.get('_onlyCheckHitWhenStop') for d in ds)
    land = stop if hit_stop else reach
    return None if land is None else round(land, 4)


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


MOTIONS = {1, 2, 3}   # the client's MotionMask: WALK_ONLY 1, FLY_ONLY 2, ALL 3


def deref(ref, by_pid):
    """(GameObject path, typetree) a PPtr names in the prefab, or None (a null PPtr: m_PathID 0)."""
    pid = ref.get('m_PathID') if isinstance(ref, dict) else None
    return by_pid.get(pid) if pid else None


def selector_motion(d, by_pid, where):
    """The MotionMask of the units of the other side (the allies, for an enemy) selector `d` takes, 0 for a selector that
    takes only its own side's. A group of selectors (`_rangeSelectorsList`, `_selectorGroup`) takes what any of them takes —
    with `_passOnlyIfSatisfyAll` what all of them take. Stops on a shape this reader does not know."""
    group = d.get('_rangeSelectorsList', d.get('_selectorGroup'))
    if isinstance(group, list):
        ms = []
        for ref in group:
            got = deref(ref, by_pid)
            if got is None:
                raise SystemExit(f'{where}: a selector group names a selector outside the prefab')
            ms.append(selector_motion(got[1], by_pid, where))
        if not ms:
            return 0
        m = ms[0]
        for x in ms[1:]:
            m = (m & x) if d.get('_passOnlyIfSatisfyAll') else (m | x)
        return m
    if '_targetSide' in d and '_targetMotion' in d:
        side, motion = d['_targetSide'], d['_targetMotion']
        if side not in (1, 2, 3) or motion not in MOTIONS | {0}:
            raise SystemExit(f'{where}: a selector with _targetSide {side} / _targetMotion {motion}')
        return motion if side & 2 else 0
    if {k for k in d if k.startswith('_')} == {'_maxTargetNum'}:
        return 1   # a BlockedSelector: the units that block the owner — a flying ally blocks nobody
    raise SystemExit(f'{where}: an attack selector of a shape this reader does not know: {sorted(k for k in d if k.startswith("_"))}')


def trigger_motion(trig_pid, by_pid, where):
    """The MotionMask a mode's `_attackTrigger` finds its input target with: a SelectorTrigger takes the first selector
    component of its GameObject (`Awake`: GetComponent<TargetSelector>, `$comp` order — the range box and validators are
    no selectors); a NeverTrigger (no field of its own) finds nobody, 0."""
    got = by_pid.get(trig_pid) if trig_pid else None
    if got is None:
        return 0
    gp, trig = got
    own = {k for k in trig if k.startswith('_') and k != '_metadata' and k != '$comp'}
    if not own:
        return 0   # NeverTrigger
    if isinstance(trig.get('_triggers'), list):
        # a trigger of triggers (`_checkType` all / any): its `_overrideSelector` when `_isOverrideSelector`, else what
        # its triggers find
        ov = deref(trig.get('_overrideSelector'), by_pid)
        if trig.get('_isOverrideSelector') and ov:
            return selector_motion(ov[1], by_pid, where)
        m = 0
        for ref in trig['_triggers']:
            m |= trigger_motion((ref or {}).get('m_PathID'), by_pid, where)
        return m
    if '_minTargetNum' not in trig:
        raise SystemExit(f'{where}: an attack trigger of a shape this reader does not know: {sorted(own)}')
    go = trig['m_GameObject']['m_PathID']
    sibs = sorted((d for p, (g, d) in by_pid.items() if p != trig_pid and (d.get('m_GameObject') or {}).get('m_PathID') == go),
                  key=lambda d: d.get('$comp', 1 << 30))
    for d in sibs:
        if '_extendable' in d or '_targetOptions' in d or not ({k for k in d if k.startswith('_')} - {'_useBlackboardRangeId'}):
            continue   # the range box (a GlobalRange: no field, the CN client's `_useBlackboardRangeId`), a validator; a
            #            field-less SelfSelector takes the owner (0)
        return selector_motion(d, by_pid, where)
    raise SystemExit(f'{where}: a SelectorTrigger without a selector beside it')


def attack_motion(root, sub):
    """{mode name: MotionMask} of the allies each mode's normal attack (its UnitMode `_attack`) can take, the modes whose
    attack takes some. The client's AbilityStandard.UpdateTargets: the ability's own `_selector` finds the targets (around
    the owner — FROM_OWNER — or the input target), and with `_alwaysIncludeTarget` the input target the mode's
    `_attackTrigger` found takes the last place; without a selector only that input target is cast at. So the mask is the
    selector's, joined with the trigger's when the input target is included."""
    by_pid = {pid: (gp, d) for gp, d, pid in sub}
    root_d = next((d for gp, d, _ in sub if gp == root and isinstance(d.get('_modes'), list)), None)
    out = {}
    for ref in (root_d or {}).get('_modes') or []:
        got = deref(ref, by_pid)
        if got is None:
            continue
        gp, mode = got
        name = gp.split('/')[-1]
        att = deref(mode.get('_attack'), by_pid)
        if att is None:
            continue
        a = att[1]
        where = f'{root} {name} attack'
        sel = deref(a.get('_selector'), by_pid)
        m = selector_motion(sel[1], by_pid, where) if sel else 0
        if a.get('_alwaysIncludeTarget'):
            m |= trigger_motion((mode.get('_attackTrigger') or {}).get('m_PathID'), by_pid, where)
        if m:
            out.setdefault(name, m)
    return out


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
    motion = attack_motion(root, sub)
    if motion:
        out['motion'] = motion
    if skills:
        out['skills'] = dict(sorted(skills.items()))
    if talents:
        out['talents'] = dict(sorted(talents.items()))
    return out


def read_enemies(C, wanted, proj):
    """{prefab root: entry} of the `wanted` enemies in one client's enemy prefab bundles."""
    enemies = {}
    for f in bundles(C, 'battle/enm_pfb*.ab').values():
        tree, _ = load_tree(f, comp_index=True)   # `$comp`: the component order a SelectorTrigger finds its selector in
        for root in sorted({gp.split('/')[0] for gp, _, _ in tree} & wanted):
            sub = [(gp, d, pid) for gp, d, pid in tree if gp == root or gp.startswith(root + '/')]
            enemies[root] = enemy_entry(root, sub, proj)   # {} = read, shoots nothing
    return enemies


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--client', action='append', help='an Arknights_Data folder (default: EN; with --season-new repeatable, default EN then CN)')
    ap.add_argument('--out', default=str(OUT))
    ap.add_argument('--season-new', action='store_true', help="only the seasons' new enemies the earlier run lacks (see the usage)")
    args = ap.parse_args()
    prev = earlier(args.out) if args.season_new else {}
    if args.season_new:
        wanted = enemy_keys(season_new=True) - set(prev.get('enemies') or {})
        enemies, proj = {}, dict(prev.get('projectiles') or {})
        for C in clients(args.client):
            # a later client adds only the enemies and projectiles the earlier ones lack
            p = projectiles(Path(C))
            got = read_enemies(Path(C), wanted - set(enemies), {**p, **proj})
            proj.update({k: v for k, v in p.items() if k not in proj})
            enemies.update(got)
            print(f'{C}: {len(got)} enemies')
    else:
        C = Path((args.client or [client_data()])[0])
        proj = projectiles(C)
        enemies = read_enemies(C, enemy_keys(), proj)
    used = set()
    for e in enemies.values():
        for s in [e.get('attack'), e.get('combat')] + [x.get(k) for x in e.get('modes', []) for k in ('attack', 'combat')] \
                + [s for lst in list(e.get('skills', {}).values()) + list(e.get('talents', {}).values()) for s in lst]:
            if s:
                used.add(s['key'])
    for k in list(used):   # a projectile's sub-projectiles (萨米的意志's 冰凌 → its landing)
        used.update(proj.get(k, {}).get('sub', []))
    if args.season_new:
        # the earlier rows as they were, and their projectiles
        enemies = {**enemies, **(prev.get('enemies') or {})}
        used |= set(prev.get('projectiles') or {})
    out = {'projectiles': {k: proj[k] for k in sorted(used) if k in proj}, 'enemies': dict(sorted(enemies.items()))}
    missing = sorted(used - set(proj))
    if missing:
        print('projectiles not in [uc]projectiles.ab:', ', '.join(missing), file=sys.stderr)
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'{len(out["projectiles"])} projectiles, {len(enemies)} enemies → {args.out}')


if __name__ == '__main__':
    main()
