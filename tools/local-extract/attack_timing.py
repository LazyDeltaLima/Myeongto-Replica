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
                                                "time": 0, "face": 1, "det": 0 }, … ] } },   (+ "begin", "esc": a ThreePart attack; "combat": the mode's separate Combat ability)
    "enemies": { "enemy_1001_bigbo": { "combat": { … }, "attack": { … } },
                 "enemy_2025_syufo": { "attack": { … }, "mode0": "Fly", "modes": { "Normal": { "combat": { … } } } } },
    "tokens": { "token_10015_dusk_drgn": { "modes": ["Default"], "attack": [ { … } ] } } }

`attack[i]` = the attack ability of mode i (null when the mode has none), its clip renamed by the mode's
`_replaceAnimPairs`; a summon's the same, from its prefab in pkgrps/btl_pfb_tokens_*.ab (data/tokens.json and the summons of
data/backups.json); an enemy's `combat` / `attack` = the abilities of
its first mode used while blocked / unblocked (either may be missing); `modes` = the same of each later mode of a prefab
with several (`mode0` = the first one's name).

Usage (from the repo root; --client = an Arknights_Data folder, repeatable: the first client that has an operator's pack
or an enemy decides it — by default the EN client, then the CN one for what the EN one lacks (client_path.py); an
operator or enemy neither client has keeps the row of the earlier run):
  .venv-extract/bin/python tools/local-extract/attack_timing.py [--client <EN …/Arknights_Data>] [--client <CN …/Arknights_Data>] [--id char_…]…
--id reads only those operators (no enemies): every other row stays as the earlier run wrote it. --season-new reads only
the enemies a season's data/seasons/<id>/enemies.json adds (the CN client's for those EN lacks), the other rows as they were.
Everything read is (c) Hypergryph; only these numbers are kept.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from char_modes import load_tree, pool_char_ids  # noqa: E402
from char_points import token_files  # noqa: E402
from client_path import skin_keys  # noqa: E402
from client_path import clients, earlier, enemy_keys, kept, kept_all  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tools/assets/local-attack-timing.json'

# MonoBehaviour field → output key
FIELDS = {
    '_animKey': 'anim', '_maxAnimScale': 'max', '_preDelay': 'pre', '_waitForAttackEvent': 'wait',
    '_selectTargetTiming': 'sel', '_interuptIfTargetDead': 'dead', '_timeMode': 'time',
    # 1: a mode switch that detaches the ability cuts its swing (`Ability.DoDetach`); 0: the swing plays out
    '_interruptAbilityOnDetach': 'det',
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
        # (`FirstAttack`: only while its buff holds, branch_s_2[first] — the mode's other attacks are the child beside it)
        sub.sort(key=lambda r: (r.count('/'), r.rsplit('/', 1)[-1] == 'FirstAttack', not re.search(r'attack|combat', r.rsplit('/', 1)[-1], re.I), r))
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
    return modes_entry(tree)


def token_entries(files):
    """{token id: its row as op_entry's} of {token id: its bundle}; one bundle holds many summons."""
    out, trees = {}, {}
    for tid, f in files.items():
        if f not in trees:
            trees[f] = load_tree(f)[0]
        sub = [x for x in trees[f] if x[0] == tid or x[0].startswith(tid + '/')]
        e = modes_entry(sub)
        if e:
            # its born state lasts its Born clip at its own speed, not the common 1 s (Character.PlayBornAnimationAndEffect)
            if any(d.get('_useRealBornTimeFromAnim') for _, d, _ in sub):
                e['realBorn'] = 1
            out[tid] = e
    return out


def all_token_ids():
    """The summons this server's data names (`token_…`: the map characters and 炎佑 have prefabs of another kind)."""
    ids = set()
    # (a season not public yet has its own data/seasons/<id>/tokens.json: a full run would drop its summons' rows)
    for f in [ROOT / 'data/tokens.json', *sorted((ROOT / 'data/seasons').glob('*/tokens.json'))]:
        toks = json.loads(f.read_text(encoding='utf-8'))
        ids |= set(toks.get('tokens', toks))
    ids |= set(json.loads((ROOT / 'data/backups.json').read_text(encoding='utf-8')).get('tokens') or {})
    return sorted(k for k in ids if k.startswith('token_'))


def modes_entry(tree):
    """{ modes, attack } of a prefab's GameObjects: the attack ability of each of its `_modes`, or None without modes."""
    modes = mode_paths(tree)
    if not modes:
        return None
    attack = []
    for p in modes:
        cands = under(tree, p) if p else {}
        a = pick(cands) if p else None
        # a 要塞's group: `pick` takes its melee child, a ranged swing plays `Body/Attack/RangedAttack`'s clip
        ranged = cands.get('Body/Attack/RangedAttack')
        if a and ranged and ranged.get('anim') and ranged.get('anim') != a.get('anim'):
            a = {**a, 'ranged': ranged}
        # the mode's `_replaceAnimPairs` (维什戴尔 S2: Attack → Skill_2_Loop) rename the clip it plays
        renamed = mode_renamer(tree, p)
        a = renamed(a)
        # a mode with both a `_attack` and a `_combat` ability (`Body/Attack…` and `Body/Combat…`): the second holds its own
        # cooldown and clip, used while the unit blocks (Character._FetchCombatTarget; docs/rules/sim.md 「일반 공격 타이밍」).
        # (`pick` takes a direct Body/Combat over the children of an Attack group with no clip of its own: 丰川祥子 `RangedMulti`)
        side = lambda name: {r: v for r, v in cands.items() if r == f'Body/{name}' or r.startswith(f'Body/{name}/')}
        attack_ab, combat_ab = pick(side('Attack')) if side('Attack') else None, pick(side('Combat')) if side('Combat') else None
        if attack_ab and attack_ab.get('anim') and combat_ab and combat_ab.get('anim'):
            a = {**renamed(attack_ab), 'combat': renamed(combat_ab)}
        attack.append(a)
    return {'modes': [p.split('/')[-1] if p else '?' for p in modes], 'attack': attack}


def mode_renamer(tree, p):
    """The clip renames of mode GameObject `p`'s `_replaceAnimPairs` (维什戴尔 S2: Attack → Skill_2_Loop): ability fields → the same, `anim` renamed."""
    rep = next((d.get('_replaceAnimPairs') for gp, d, _ in tree if gp == p and isinstance(d.get('_replaceAnimPairs'), list)), None)
    return lambda ab: {**ab, 'anim': next((r['toAnimKey'] for r in rep or [] if isinstance(r, dict) and r.get('fromAnimKey') == ab['anim'] and r.get('toAnimKey')), ab['anim'])} if ab and ab.get('anim') else ab


def enemy_mode_abilities(cands, renamed=lambda ab: ab):
    """{combat, attack} of an enemy mode's animated abilities (under(): `Body/Combat`, `Body/Attack`, else the first child of
    either), their clips renamed by the mode's `_replaceAnimPairs` (`renamed`: mode_renamer)."""
    e = {}
    for key, names in (('combat', ('Body/Combat', 'Combat')), ('attack', ('Body/Attack', 'Attack'))):
        a = next((cands[n] for n in names if n in cands), None)
        if a is None:
            sub_names = sorted(r for r in cands if any(r.startswith(n + '/') and '/' not in r[len(n) + 1:] for n in names))
            a = cands[sub_names[0]] if sub_names else None
        if a is not None:
            e[key] = renamed(a)
    return e


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
        e = enemy_mode_abilities(under(sub, base), mode_renamer(sub, base))
        # the prefab's later modes (`_modes` after the first): each attaches its own attack / combat abilities, ready, when
        # the enemy switches to it (`Unit.SwitchMode`; docs/rules/sim.md 「일반 공격 타이밍」) — `modes` {mode name: its
        # abilities as the first mode's, {} = none}
        if modes and len(modes) > 1:
            e['mode0'] = modes[0].split('/')[-1] if modes[0] else '?'
            e['modes'] = {p.split('/')[-1]: enemy_mode_abilities(under(sub, p), mode_renamer(sub, p)) for p in modes[1:] if p}
        sk = enemy_skills(sub, modes)
        if sk:
            e['skills'] = sk
        if e:
            out[root] = e
    return out


# EnemySkill MonoBehaviour field → output key (its family mask, whether the main attack's cooldown restarts as its cast
# ends and with what `waitFirstPeriod`)
SKILL_FIELDS = {'_familyMask': 'family', '_resetMainAbilityCdWhenCastEnd': 'resetMain', '_resetCdWaitFirstPeriod': 'waitFirst'}


def group_kind(d):
    """'seq' / 'par' / 'sel' for an AbilitySequenceGroup / AbilityParallelGroup / AbilitySelectableGroup MonoBehaviour, else None
    (told apart by a serialized field of each class)."""
    if '_alwaysNext' in d and isinstance(d.get('_abilities'), list):
        return 'seq'
    if '_finishAllAbilitiesIfOneFinish' in d and isinstance(d.get('_abilities'), list):
        return 'par'
    if isinstance(d.get('_abilityConfigs'), list) and '_selectAbilitySequentially' in d:
        return 'sel'
    return None


def is_buff_ability(d):
    """An ActiveBuffAbility MonoBehaviour (its `_waitForCasting` beside `_buffs`, no `_timeMode`)."""
    return '_waitForCasting' in d and '_buffs' in d and '_timeMode' not in d


def cast_fields(d, by_pid, depth=0):
    """How long ability MonoBehaviour `d` casts, as data/enemies.json `skillCast` reads it (docs/rules/sim.md 「적 스킬 =
    일반 공격 차례」 시전 길이):
      an animated ability — its clip (`anim`, `max`, `wait`, `pre`), `time` = `_timeMode` (the attack time it plays to, the
        client's `AbstractAnimatedAbility.get_cooldown`: 0 the enemy's attack time, 1 the clip, 2 `_cooldown` → `cd`, 3 the
        blackboard's `_cooldownKey` → `cdKey`), `proj` 1 when it waits for its projectile to vanish (RangedAttack
        `_waitForProjectileInvalid`);
      `kind` 'buff' — an ActiveBuffAbility (`wfc` 1 with `_waitForCasting`: it waits out its life time, else one tick before
        and one after its spell);
      `kind` 'seq' / 'par' / 'sel' — a group, `subs` = its children's records in `_abilities` order (a selectable group's
        are not read: `subs` empty)."""
    kind = group_kind(d)
    if kind:
        rec = {'kind': kind}
        if kind != 'sel' and depth < 4:
            rec['subs'] = [cast_fields(by_pid[r['m_PathID']], by_pid, depth + 1) for r in d['_abilities']
                           if isinstance(r, dict) and r.get('m_PathID') in by_pid]
        return rec
    if is_buff_ability(d):
        return {'kind': 'buff', **({'wfc': 1} if d.get('_waitForCasting') else {})}
    rec = {}
    a = ability(d)
    if a and a.get('anim'):
        rec.update({k: a[k] for k in ('anim', 'max', 'wait', 'pre') if k in a})
    if '_timeMode' in d:
        rec['time'] = num(d['_timeMode'])
        if rec['time'] == 2:
            rec['cd'] = num(d.get('_cooldown') or 0)
        elif rec['time'] == 3:
            rec['cdKey'] = d.get('_cooldownKey') or 'duration'
    if d.get('_waitForProjectileInvalid'):
        rec['proj'] = 1
    return rec


def enemy_skills(sub, modes):
    """{skill GameObject name: fields} of an enemy prefab's EnemySkill components (the MonoBehaviour with `_familyMask`,
    `<root>/Modes/<mode>/Skills/<name>`): its family mask and main-attack reset flags, and the clip of the animated ability
    on the same GameObject (`anim`, `max`, `wait`, `pre` as for the attack; none when the ability plays no clip) and its
    `_timeMode` (`time`; with `cd` = `_cooldown` for 2, `cdKey` = `_cooldownKey` for 3). The
    client casts such a skill in place of a normal attack (the client's `Enemy.AttackWrapper.SearchTarget` / `Cast`) and
    restarts its cooldown when the cast ends (`EnemySkill._OnCastFinish`). A name in several modes: the first mode's
    (the prefab's `_modes` order), the others only when they differ (`alt`)."""
    order = {p: i for i, p in enumerate(modes or []) if p}
    rank = lambda gp: min((i for p, i in order.items() if gp.startswith(p + '/')), default=len(order))
    by_gp = {}
    for gp, d, _ in sub:
        by_gp.setdefault(gp, []).append(d)
    by_pid = {pid: d for _, d, pid in sub}
    out = {}
    for gp in sorted((gp for gp, ds in by_gp.items() if any('_familyMask' in d for d in ds)), key=lambda g: (rank(g), g)):
        ds = by_gp[gp]
        s = next(d for d in ds if '_familyMask' in d)
        rec = {o: num(s[k]) if isinstance(s.get(k), (int, float)) else 0 for k, o in SKILL_FIELDS.items()}
        # the skill's ability: a group, an ActiveBuffAbility or an animated ability (cast_fields)
        raw = next((d for d in ds if isinstance(d, dict) and (group_kind(d) or is_buff_ability(d))), None) \
            or next((d for d in ds if isinstance(d, dict) and '_timeMode' in d), None)
        if raw is not None:
            rec.update(cast_fields(raw, by_pid))
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


def charpack(client, cid):
    """charpack/<cid>.ab of an Arknights_Data folder (the hot-update copy first), or None."""
    for d in ('PersistentData/Bundles', 'StreamingAssets/AB/Windows'):
        f = Path(client) / d / f'charpack/{cid}.ab'
        if f.exists():
            return f
    return None


def enemy_bundles(client):
    """{bundle name: path} of an Arknights_Data folder's enemy prefab bundles (PersistentData, the newer copy, wins)."""
    files = {}
    for base in (Path(client) / 'StreamingAssets/AB/Windows/battle', Path(client) / 'PersistentData/Bundles/battle'):
        for f in sorted(base.glob('enm_pfb*.ab')):
            files[f.name] = f
    return files


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--client', action='append', help='an Arknights_Data folder (repeatable; default: EN, then CN — client_path.py)')
    ap.add_argument('--out', default=str(OUT))
    ap.add_argument('--id', action='append', default=[], help='only this operator (repeatable): every other row, the enemies too, stays as the earlier run wrote it')
    ap.add_argument('--season-new', action='store_true', help="only the enemies of data/seasons/*/enemies.json that data/enemies.json lacks and the earlier run has no row for (EN, then CN): every other row stays as the earlier run wrote it")
    args = ap.parse_args()
    if args.season_new and args.id:
        ap.error('--season-new reads enemies only: no --id')
    prev = earlier(args.out)
    cids = [] if args.season_new else [i for i in args.id if not i.startswith('token_')] if args.id else all_char_ids()
    wanted = enemy_keys(season_new=args.season_new)
    if args.season_new:
        wanted -= set(prev.get('enemies') or {})
    ops, read, enemies, tokens = {}, set(), {}, {}
    # (--id token_…: that summon's row only; an operator's id reads the operator)
    token_ids = [] if args.season_new else [i for i in args.id if i.startswith('token_')] if args.id else all_token_ids()
    for client in clients(args.client):
        n_ops, n_enemies = len(ops), len(enemies)
        for cid in cids:
            f = None if cid in read else charpack(client, cid)
            if f is None:
                continue
            read.add(cid)
            e = op_entry(f)
            if e:
                ops[cid] = e
        # an enemy's prefab key is its own: a later client adds only the enemies the earlier ones lack
        for f in ([] if args.id else enemy_bundles(client).values()):
            enemies.update({k: v for k, v in enemy_entries(f, wanted).items() if k not in enemies})
        n_tokens = len(tokens)
        tokens.update(token_entries(token_files(client, [t for t in token_ids if t not in tokens])))
        print(f'{client}: {len(ops) - n_ops} operators, {len(enemies) - n_enemies} enemies, {len(tokens) - n_tokens} summons')
    for cid in sorted(set(cids) - read):
        print('missing', cid, file=sys.stderr)
    part = args.id or args.season_new
    old_ops = kept_all(prev.get('ops') or {}, read) if part else kept(prev.get('ops') or {}, read, cids)
    old_enemies = kept_all(prev.get('enemies') or {}, enemies) if part else kept(prev.get('enemies') or {}, enemies, wanted)
    old_tokens = kept_all(prev.get('tokens') or {}, tokens) if part else kept(prev.get('tokens') or {}, tokens, token_ids)
    ops.update(old_ops)
    # `clip`: the clip the key plays when it is not the key itself (the skin's key table; docs/rules/sim.md 「일반 공격 타이밍」)
    table = skin_keys()
    for cid, row in ops.items():
        for ab in row.get('attack') or []:
            for a in (ab, (ab or {}).get('ranged'), (ab or {}).get('combat')):
                if a and a.get('anim') and table.get(cid, {}).get(a['anim'], a['anim']) != a['anim']:
                    a['clip'] = table[cid][a['anim']]
    enemies.update(old_enemies)
    tokens.update(old_tokens)
    out = {'ops': dict(sorted(ops.items())), 'enemies': dict(sorted(enemies.items())), 'tokens': dict(sorted(tokens.items()))}
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':'), sort_keys=False) + '\n', encoding='utf-8')
    old = [*old_ops, *old_enemies, *old_tokens]
    print(f'{len(ops)} operators, {len(enemies)} enemies, {len(tokens)} summons → {args.out}'
          + (f'; read {", ".join(sorted(read))}, the other {len(old)} rows kept' if args.id else f'; kept from the earlier run: {", ".join(old)}' if old else ''))


if __name__ == '__main__':
    main()
