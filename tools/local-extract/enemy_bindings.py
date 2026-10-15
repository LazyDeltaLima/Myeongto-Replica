#!/usr/bin/env python3
"""Enemy effect bindings from the local client (2026-10-10, docs/rules/fx.md 「적 이펙트 바인딩」).

The official client binds an enemy's effects in its battle prefab (battle/enm_pfb_*.ab), the same way as an operator's
charpack: the root's `_startEffect` / `_deadEffect` (born / death; a UnitMode's `_overrideStartEffect` /
`_overrideDeadEffect`), each ability's emitters (`_castEffects` on the caster from `_startEvent` to `_endEvent`,
`_hitEffects` / `_inputTargetEffects` / `_castTargetEffects` on its targets, `_attachEffects` while attached), its
projectile (`_projectileKey` fired from `_mountPointType`: the projectile prefab's `_mainEffect` trail, `_effectsWhenHit`,
`_effectsWhenReached` …, battle/prefabs/[uc]projectiles.ab) and its buffs (`overrideEffectKey`, or the buff template's
`effectKey` / CreateEffect nodes — config/buff_template_holder.ab). The model points (Graphic animator `_muzzleTransform`,
`_hitTransform`, `_headTransform`, `_specialPointN`) are read like tools/local-extract/char_points.py. The enemy-side tokens a
boss puts down (data/waves.json template devices, data/enemies.json `devices[]`: 子代, 黄金回响) are read the same way from
pkgrps/btl_pfb_tokens_*.ab, with their skill prefabs of battle/prefabs/[uc]skills.ab (2026-10-15, docs/rules/fx.md
「보스 토큰·장비 이펙트」).

Writes
  tools/assets/local-enemy-bindings.json     the bindings per enemy id of data/enemies.json and token key (review copy, git)
  public/assets/local/fx/enemy-modes.json    the render table (render/fxgame.js): per enemy its modes (attack clip names,
                                             melee / ranged cast + hit effects, projectile), born / death, skills by
                                             name, auras and points; `$fx` = every effect name (lower case) → [bundle,
                                             prefab] where it is extracted
and with --extract the effect prefabs into public/assets/local/fx/<bundle>/ through fx_extract.py (new files only; their
list goes to public/assets/local/fx/enemy-index.json, the operators' index.json is left as it is). Bundles: an effect of
battle/prefabs/effects/<name>.ab → `<name>`, of pkgrps/btl_pfb_fx_<x>.ab → `pfx_<x>`. Effect names are matched without case
(the enemy prefabs name `…_B_hit_01`, the bundles' containers are lower case — the client looks them up lower-cased
[추정: by the names]).

Usage (from the repo root):
  .venv-extract/bin/python tools/local-extract/enemy_bindings.py [--game <Arknights_Data>] [--cache <dir>] [--extract]
                           [--all] [--id enemy_…]…
--cache keeps the slow reads (enemy prefabs, projectiles, points, the effect name index: ~5 min) as pickles / JSON there;
--extract without --all extracts the effects of the enemies that appear (data/waves.json, data/bosses.json, the random
squads' template slots) — --all every enemy. Everything is (c) Hypergryph; private fan use only.
"""
import argparse
import json
import pickle
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from client_path import client_data  # noqa: E402
from char_modes import load_tree  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tools/assets/local-enemy-bindings.json'
FX_DIR = ROOT / 'public/assets/local/fx'
FX_OUT = FX_DIR / 'enemy-modes.json'
ENEMY_INDEX = 'enemy-index.json'
BASES = ('StreamingAssets/AB/Windows', 'PersistentData/Bundles')   # later wins = PersistentData (hot updates)
EMIT_KEYS = ('_castEffects', '_hitEffects', '_attachEffects', '_inputTargetEffects', '_castTargetEffects')
# AbilityStandard.Event / UberEffectEmitter DirectionType / Entity.MountPointType / AdvancedMovement.MoveType (dump.cs values)
EVENTS = ['ON_ATTACHED', 'ON_DETACHED', 'ON_CAST_START', 'ON_CAST_END', 'ON_SPELL_ON', 'ON_SPELL_END', 'ON_ATTACK_FINISH',
          'ON_ATTACK_CHECK_POINT', 'ON_OVERLOAD']
MOUNTS = ['FOOT', 'HIT', 'MUZZLE', 'HEAD', 'UI', 'SPECIAL_0', 'SPECIAL_1', 'GROUND'] + [f'SPECIAL_{i}' for i in range(2, 16)]
MOVES = ['NONE', 'TRACE_TARGET_WITH_SPEED', 'TRACE_TARGET_WITHIN_TIME', 'TWO_POINTS', 'FIXED_DIRECTION', 'FIXED_DISTANCE',
         'FUNC_ANGLE_AND_TIME']
SKIP_KEYS = {'m_GameObject', 'm_Script', 'm_Enabled', 'm_Name', 'm_EditorHideFlags', 'm_EditorClassIdentifier'}
BUFF_KEYS = ('_buffs', '_activeBuffs', '_passiveBuffs', '_projectileBuffs', '_buffsWhenReachedTarget', '_buffsToBlockee')
PROJ_FX = (('_mainEffect', 'trail'), ('_effectsWhenStart', 'start'), ('_effectsWhenReached', 'reached'), ('_effectsWhenHit', 'hit'),
           ('_effectsToTargetWhenStart', 'targetStart'), ('_effectsToTileWhenStart', 'tileStart'), ('_effectsWhenStop', 'stop'),
           ('_effectOnTrigger', 'trigger'))
# statuses render/fxstatus.js already draws from the sim's status events (STATUS_FX): not an enemy's own aura
STATUS_DRAWN = {'common_invisible', 'common_buff_micai_01', 'common_levitate_01'}
# a hit's buff effect fxstatus.js draws from the sim's status (its stun: buff_stun — 子代's 摄食 trap_tentac_s[stun]): not
# bound again as the hit's buff (two marks on one unit; the client holds one per name, `Entity.AddBuffEffect`)
STATUS_HIT_DRAWN = {'buff_stun'}


def bundle_files(game, pattern):
    files = {}
    for b in BASES:
        for f in sorted((Path(game) / b).glob(pattern)):
            files[str(f.relative_to(Path(game) / b))] = f
    return files


def cached(cache, name, build):
    """build() once, kept as `name` (a pickle) in the --cache folder."""
    if cache is None:
        return build()
    p = cache / name
    if p.exists():
        with open(p, 'rb') as f:
            return pickle.load(f)
    v = build()
    with open(p, 'wb') as f:
        pickle.dump(v, f)
    return v


def read_enemies(game):
    trees, src = {}, {}
    for _rel, f in bundle_files(game, 'battle/enm_pfb*.ab').items():
        roots = defaultdict(list)
        for gp, d, pid in load_tree(f)[0]:
            roots[gp.split('/')[0]].append((gp, d, pid))
        for r, lst in roots.items():
            trees[r], src[r] = lst, str(f.relative_to(game))
    return {'trees': trees, 'src': src}


def read_tokens(game, keys):
    """The enemy-side tokens a boss puts on the field (`keys`: data/waves.json template devices, data/enemies.json
    `devices[]` — 子代 trap_039_dstnta, 黄金回响 trap_185_vtlntw): their prefabs in pkgrps/btl_pfb_tokens_*.ab (the hot
    update's PersistentData copy wins), read like an enemy's."""
    trees, src = {}, {}
    for _rel, f in bundle_files(game, 'pkgrps/btl_pfb_tokens_*.ab').items():
        roots = defaultdict(list)
        for gp, d, pid in load_tree(f)[0]:
            r = gp.split('/')[0]
            if r in keys:
                roots[r].append((gp, d, pid))
        for r, lst in roots.items():
            trees[r], src[r] = lst, str(f.relative_to(game))
    return {'trees': trees, 'src': src}


def read_skill_prefabs(game, keys):
    """{skill prefab: [(path, MonoBehaviour, pathId)]} of battle/prefabs/[uc]skills.ab — a token's skills (sktok_dstnta: 子代's
    摄食) are prefabs of their own there, not abilities of the token prefab."""
    out = {}
    for _rel, f in bundle_files(game, 'battle/prefabs/[[]uc[]]skills.ab').items():
        for gp, d, pid in load_tree(f)[0]:
            r = gp.split('/')[0]
            if r in keys:
                out.setdefault(r, []).append((gp, d, pid))
    return out


def device_keys():
    """{token key: [skill prefab, …]} of the enemy-side tokens of data/waves.json (template `devices[]`) and data/enemies.json
    (`devices[]`) — build-data's templateDevice records (`skill.prefabId` / `skillId`)."""
    acc = {}

    def take(d):
        if isinstance(d, dict) and isinstance(d.get('key'), str) and d['key'].startswith('trap_'):
            sk = d.get('skill') or {}
            p = sk.get('prefabId') or sk.get('skillId') if isinstance(sk, dict) else None
            lst = acc.setdefault(d['key'], [])
            if p and p not in lst:
                lst.append(p)

    def walk(o):
        if isinstance(o, dict):
            for d in o.get('devices') or [] if isinstance(o.get('devices'), list) else []:
                take(d)
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    for name in ('waves.json', 'enemies.json'):
        p = ROOT / 'data' / name
        if p.exists():
            walk(json.loads(p.read_text(encoding='utf-8')))
    return acc


def read_projectiles(game):
    roots = {}
    for f in (Path(game) / 'PersistentData/Bundles/battle/prefabs/[uc]projectiles.ab',
              Path(game) / 'StreamingAssets/AB/Windows/battle/prefabs/[uc]projectiles.ab'):
        if not f.exists():
            continue
        seen = set()
        for gp, d, _ in load_tree(f)[0]:
            r = gp.split('/')[0]
            if r in roots and r not in seen:
                continue
            seen.add(r)
            roots.setdefault(r, []).append((gp, d))
    return roots


def read_fx_index(game):
    """{effect name (lower case): {bundle, path}} of every effect bundle (battle/prefabs/effects, pkgrps/btl_pfb_fx_*)."""
    import aklz4  # noqa: F401
    import UnityPy
    idx, files = {}, {}
    for pat in ('battle/prefabs/effects/*.ab', 'pkgrps/btl_pfb_fx_*.ab'):
        files.update(bundle_files(game, pat))
    for rel, f in files.items():
        for path in UnityPy.load(str(f)).container.keys():
            if path.endswith('.prefab'):
                idx.setdefault(path.rsplit('/', 1)[-1][:-7].lower(), {'bundle': rel, 'path': path})
    return idx


def read_buff_templates(game):
    """{templateKey: {effectKey, eventToActions: {event: [action, …]}}} of config/buff_template_holder.ab (the EN client's
    own templates; each event's SerializedState is a JSON string)."""
    import aklz4  # noqa: F401
    import UnityPy
    f = None
    for b in reversed(BASES):
        p = Path(game) / b / 'config/buff_template_holder.ab'
        if p.exists():
            f = p
            break
    if f is None:
        return {}
    out = {}
    for o in UnityPy.load(str(f)).objects:
        if o.type.name != 'MonoBehaviour':
            continue
        try:
            d = o.read_typetree()
        except Exception:
            continue
        for t in d.get('_templates') or []:
            ev = {}
            for it in (t.get('eventToActions') or {}).get('_items') or []:
                v = it.get('value') or {}
                try:
                    ev[str(it.get('key'))] = json.loads(v.get('SerializedState') or 'null')
                except Exception:
                    continue
            out[t['templateKey']] = {'effectKey': t.get('effectKey') or '', 'eventToActions': ev}
    return out


def points_of_bundle(f):
    """{prefab root: {muzzle|hit|head|sp<N>: {F?/B?: {bone?, rot?, at: [x, y] skeleton units}}}} of one enemy bundle — the
    reading of char_points.py (the enemies' SkeletonDataAsset sits in another bundle: its scale 0.01 is assumed, as every
    operator's [추정])."""
    import aklz4  # noqa: F401
    import UnityPy
    env = UnityPy.load(str(f))
    objs = {o.path_id: o for o in env.objects}
    cache = {}

    def tt(pid):
        if pid not in cache:
            cache[pid] = objs[pid].read_typetree()
        return cache[pid]
    go_mbs, anims, tr_of_go = {}, [], {}
    for pid, o in objs.items():
        t = o.type.name
        if t == 'Transform':
            tr_of_go[tt(pid)['m_GameObject']['m_PathID']] = pid
        elif t == 'MonoBehaviour':
            try:
                d = tt(pid)
            except Exception:
                continue
            go_mbs.setdefault(d['m_GameObject']['m_PathID'], []).append(d)
            if '_faceSwitcher' in d and ('_front' in d or '_hitTransform' in d):
                anims.append(d)

    def root_of(go):
        tr, name = tr_of_go.get(go), None
        while tr in objs:
            d = tt(tr)
            name = tt(d['m_GameObject']['m_PathID'])['m_Name']
            tr = d['m_Father']['m_PathID']
        return name
    out = {}
    for an in anims:
        root = root_of(an['m_GameObject']['m_PathID'])
        if '_front' in an:
            sides = [('F', an.get('_front') or {}, ''), ('B', an.get('_back') or {}, '')]
            names = {'muzzle': 'muzzlaTransform', 'hit': 'hitTransform', 'head': 'headTransform'}
        else:
            sides = [('FB', an, '_')]
            names = {'muzzle': '_muzzleTransform', 'hit': '_hitTransform', 'head': '_headTransform'}
        pts = {}
        for side, rec, pre in sides:
            fields = dict(names)
            fields.update({f'sp{n}': f'{pre}specialPoint{n}' for n in range(16)})
            for key, fld in fields.items():
                ref = rec.get(fld)
                if not (isinstance(ref, dict) and ref.get('m_FileID') == 0 and ref.get('m_PathID') in objs):
                    continue
                tr = ref['m_PathID']
                pos = tt(tr)['m_LocalPosition']
                pt = {}
                for d in go_mbs.get(tt(tr)['m_GameObject']['m_PathID'], []):
                    if isinstance(d.get('boneName'), str) and d['boneName']:
                        pt['bone'] = d['boneName']
                        if d.get('followBoneRotation'):
                            pt['rot'] = 1
                pt['at'] = [round(pos['x'] / 0.01, 2), round(pos['y'] / 0.01, 2)]
                for s1 in side:
                    pts.setdefault(key, {})[s1] = pt
        if root and pts:
            out.setdefault(root, pts)
    return out


def read_points(game, pattern='battle/enm_pfb*.ab', keys=None):
    out = {}
    for _rel, f in bundle_files(game, pattern).items():
        for k, v in points_of_bundle(f).items():
            if keys is None or k in keys:
                out[k] = v
    return out


def enum(lst, v):
    return lst[v] if isinstance(v, int) and 0 <= v < len(lst) else v


def strs(v):
    return [x for x in (v if isinstance(v, list) else [v]) if isinstance(x, str) and x]


def emitter(e):
    """One emitter entry (UberEffectEmitter / SpineEffectPreset options) → compact dict; `slots` = the raw slot list (0 UP,
    1 RIGHT, 2 DOWN, 3 LEFT) when a direction type picks one."""
    r = {'fx': strs(e.get('_effects'))}
    if not r['fx']:
        return None
    for k, n in (('_oneshot', 'oneshot'), ('_startEvent', 'start'), ('_endEvent', 'end')):
        if k in e:
            r[n] = e[k]
    if e.get('_directionType'):
        r['dir'] = e['_directionType']
        r['slots'] = [x if isinstance(x, str) else '' for x in (e.get('_effects') or [])]
    if e.get('_useFourDirectionalFace'):
        r['turn4'] = 1
    if e.get('_onlyOnce'):
        r['onlyOnce'] = 1
    if e.get('_delayIfFirstAttack'):
        r['delayIfFirstAttack'] = round(e['_delayIfFirstAttack'], 3)
    if e.get('_useOwnerToTargetDirection'):
        r['aim'] = 1
    return r


def buff(b):
    r = {'key': b.get('buffKey') or b.get('templateKey')}
    if b.get('templateKey') and b.get('templateKey') != r['key']:
        r['tmpl'] = b['templateKey']
    if b.get('overrideEffectKey'):
        r['fx'] = b['overrideEffectKey']
    if b.get('audioSignal'):
        r['audio'] = b['audioSignal']
    # its life (2026-10-10 — how long a buff's line effect stays): BuffData.lifeTimeType LIMITED = 1 → `lifeTime` s,
    # IMMEDIATELY = 0 → 0 (it ends as it starts); INFINITY / CUSTOM: none
    if b.get('lifeTimeType') == 1 and (b.get('lifeTime') or 0) > 0:
        r['life'] = round(b['lifeTime'], 3)
    elif b.get('lifeTimeType') == 0:
        r['life'] = 0
    return r


def walk_strings(o, path, out):
    if isinstance(o, dict):
        for k, v in o.items():
            if k not in SKIP_KEYS:
                walk_strings(v, path + (k,), out)
    elif isinstance(o, list):
        for v in o:
            walk_strings(v, path, out)
    elif isinstance(o, str) and o:
        out.append(('.'.join(path), o))


def enemy_record(root, tree, fx_index, proj_keys, skills=None):
    """The bindings of one prefab `tree` (root `root`); `skills` {skill prefab: tree} adds a token's skill prefabs as its
    abilities `Skills/<prefab>[/…]` (their emitters sit on the prefab's root)."""
    by_pid = {pid: gp for gp, _, pid in tree}
    rootmb = next((d for gp, d, _ in tree if isinstance(d.get('_modes'), list)), None)
    rec = {'modes': [], 'abilities': []}
    if rootmb:
        for k in ('_startEffect', '_deadEffect'):
            if rootmb.get(k):
                rec[k.strip('_')] = rootmb[k]
        # a `Trap` root (a token class with fields only Trap has: `_withdrawable`, `_hitRangeId`) — its dead effect has no default
        if '_withdrawable' in rootmb or '_hitRangeId' in rootmb:
            rec['trap'] = 1
    mode_paths = [by_pid.get(r.get('m_PathID')) for r in (rootmb or {}).get('_modes') or []]
    mode_mb = {gp: d for gp, d, _ in tree if gp in mode_paths and '_overrideStartEffect' in d}
    for i, mp in enumerate(mode_paths):
        d = mode_mb.get(mp) or {}
        m = {'i': i, 'name': (mp or '?').split('/')[-1], 'path': (mp or '?')[len(root) + 1:]}
        for k in ('_overrideStartEffect', '_overrideDeadEffect'):
            if d.get(k):
                m[k[1:]] = d[k]
        if d.get('_addIndexToSignalId'):
            m['addIndexToSignalId'] = 1
        if d.get('_includeIndexZero'):
            m['includeIndexZero'] = 1
        rec['modes'].append(m)
    # the root's `_commonAbilities` (CommonAbilities/…, or elsewhere: 黄金回响's Others/Direction/commonAbility)
    common = {by_pid.get(r.get('m_PathID')) for r in (rootmb or {}).get('_commonAbilities') or [] if isinstance(r, dict)}
    items = [(gp, gp[len(root) + 1:] if gp != root else '', d) for gp, d, _pid in tree]
    for sk, st in (skills or {}).items():
        items += [(None, f'Skills/{sk}' + (gp[len(sk):] if gp != sk else ''), d) for gp, d, _pid in st]
    abil = {}
    for gp, rel, d in items:
        if rel.startswith('Graphic') or rel.startswith('Shadow') or (gp is not None and gp in mode_paths) or not rel:
            continue
        mi = next((k for k, mp in enumerate(mode_paths) if mp and gp and gp.startswith(mp + '/')), None)
        a = abil.setdefault(rel, {'path': rel})
        if mi is not None:
            a['mode'] = mi
        if gp is not None and gp in common:
            a['common'] = 1
        for k in EMIT_KEYS:
            lst = [x for x in (emitter(e) for e in d.get(k) or [] if isinstance(e, dict)) if x]
            if lst:
                a.setdefault(k.strip('_'), []).extend(lst)
        for k in BUFF_KEYS:
            lst = [buff(b) for b in d.get(k) or [] if isinstance(b, dict) and (b.get('buffKey') or b.get('templateKey'))]
            if lst:
                a.setdefault(k.strip('_'), []).extend(lst)
        if d.get('_projectileKey'):
            p = {'key': d['_projectileKey'], 'mount': enum(MOUNTS, d.get('_mountPointType'))}
            ex = strs([x.get('_projectileKey') if isinstance(x, dict) else x for x in d.get('_extraProjectileKeys') or []])
            if ex:
                p['extra'] = ex
            if d.get('_duoProjectileKey'):
                p['duo'] = d['_duoProjectileKey']
            a.setdefault('projectiles', []).append(p)
        for k in ('_addEnemyIdToSignalId', '_addSpellCntToSignalId', '_addSpellCntToAllSignalId', '_addSpellCntToLastSignalId',
                  '_addSpellCntToAllHitSignalId'):
            if d.get(k) and k[1:] not in a.get('signalFlags', []):
                a.setdefault('signalFlags', []).append(k[1:])
        if d.get('_animKey') and 'anim' not in a:
            a['anim'] = d['_animKey']
        found = []
        walk_strings(d, (), found)
        handled = set()
        for k in EMIT_KEYS:
            for e in d.get(k) or []:
                if isinstance(e, dict):
                    handled.update(strs(e.get('_effects')))
        for k, v in found:
            if v in handled or k.endswith('overrideEffectKey') or k in ('_projectileKey', '_duoProjectileKey'):
                continue
            if v.lower() in fx_index:
                a.setdefault('otherFx', []).append({'field': k, 'fx': v})
            elif v in proj_keys and not k.startswith('_extraProjectileKeys'):
                a.setdefault('otherProjectiles', []).append({'field': k, 'key': v})
    for _rel, a in abil.items():
        if len(a) > 1 and not (set(a) <= {'path', 'mode', 'anim', 'common'}):
            rec['abilities'].append(a)
    return rec


def template_info(key, BT, FX, proj_keys, depth=0, seen=None):
    """A buff template's effects: `fx` (its effectKey + the CreateEffect-like nodes of ON_BUFF_START), `line`
    (CreateLineEffect of ON_BUFF_START: from the buff's source to its owner — not drawn here), `onEvent` { Buff.Event
    number: [effects] } (the nodes of the other events — ON_BUFF_FINISH 1, ON_BUFF_TRIGGER 2, ON_OWNER_KILLED 3,
    ON_TAKE_DAMAGE 10 …: played once when that event runs, `Nodes.CreateEffect.Execute` RVA 0xB90880 — not the buff's own
    effect; decompile check round 2, 2026-10-11: they used to be mixed into `fx`, 머드락's shield heal common_heal_hit_01
    (ON_TAKE_DAMAGE) and 티티's sleeping hit titi_attack_hit_01 (ON_BUFF_TRIGGER) among them), projectiles; nested templates
    followed to depth 3 (a nested template's start effects count for the event that adds it)."""
    seen = seen if seen is not None else set()
    if not key or key in seen or key not in BT or depth > 3:
        return None
    seen.add(key)
    t = BT[key]
    out = {}

    def add(f, v, ev='0'):
        if ev != '0' and f in ('fx', 'line'):
            lst = out.setdefault('onEvent', {}).setdefault(ev, [])
        else:
            lst = out.setdefault(f, [])
        if v not in lst:
            lst.append(v)
    if t.get('effectKey'):
        add('fx', t['effectKey'])
        if depth == 0:
            add('key', t['effectKey'])   # the buff's own effect (held with it); `fx` also lists its start nodes' effects

    def walk(o, ev):
        if isinstance(o, dict):
            typ = str(o.get('$type') or '')
            # an ability the buff's end casts (ON_BUFF_FINISH 1, Nodes.TriggerAbility: 子代's tentac_grow ends into Grow) — the
            # buff's own effect lasts until that ability starts
            if depth == 0 and ev == '1' and typ.endswith('TriggerAbility') and isinstance(o.get('_abilityName'), str) and o['_abilityName']:
                out.setdefault('finish', o['_abilityName'])
            for k, v in o.items():
                if isinstance(v, str) and v:
                    if v.lower() in FX:
                        add('line' if 'LineEffect' in typ else 'fx', v, ev)
                    elif v in proj_keys:
                        add('projectiles', v)
                    elif v in BT and v != key:
                        sub = template_info(v, BT, FX, proj_keys, depth + 1, seen)
                        for f, lst in (sub or {}).items():
                            if f == 'onEvent':
                                for e2, l2 in lst.items():
                                    for x in l2:
                                        add('fx', x, e2)
                                continue
                            for x in lst:
                                if f != 'key':
                                    add(f, x, ev)
                else:
                    walk(v, ev)
        elif isinstance(o, list):
            for v in o:
                walk(v, ev)
    for ev, acts in (t.get('eventToActions') or {}).items():
        walk(acts, str(ev))
    return out or None


def proj_record(key, roots):
    if key not in roots:
        return None
    r = {'key': key}
    for _gp, d in roots[key]:
        for k, name in PROJ_FX:
            v = strs(d.get(k))
            if v:
                r.setdefault(name, [])
                r[name] += [x for x in v if x not in r[name]]
        if '_moveType' in d:
            r['move'] = enum(MOVES, d['_moveType'])
            for k in ('_speed', '_distance', '_fallingTime', '_fallingSpeed', '_delayToStart'):
                if d.get(k):
                    r[k[1:]] = round(d[k], 3)
        elif '_speed' in d and 'move' not in r:   # another mover (paracurve, a ray / link): its speed
            r['move'] = 'OTHER'
            r['speed'] = round(d['_speed'], 3)
            if d.get('_raiseHeight'):
                r['raise'] = round(d['_raiseHeight'], 3)
        if d.get('_linkDuration'):
            r['link'] = round(d['_linkDuration'], 3)
        if '_lifeTime' in d:
            r['lifeTime'] = round(d['_lifeTime'], 3)
        for k in ('_projectileKey', '_subProjectileKey', '_childProjectileKey'):
            if isinstance(d.get(k), str) and d[k]:
                r.setdefault('sub', []).append(d[k])
    return r


def used_enemies():
    """Enemy ids that appear in the game: data/waves.json (spawns, branches, overrides), data/bosses.json, the random
    squads' template slots (data/enemies.json `templateSlot`), and the enemy-side tokens (device_keys)."""
    acc = set()

    def keys_in(o):
        if isinstance(o, dict):
            if isinstance(o.get('key'), str) and o['key'].startswith('enemy_'):
                acc.add(o['key'])
            for v in o.values():
                keys_in(v)
        elif isinstance(o, list):
            for v in o:
                keys_in(v)
        elif isinstance(o, str) and re.match(r'^enemy_\d+_\w+$', o):
            acc.add(o)
    for name in ('waves.json', 'bosses.json', 'factions.json'):
        p = ROOT / 'data' / name
        if p.exists():
            keys_in(json.loads(p.read_text(encoding='utf-8')))
    E = json.loads((ROOT / 'data/enemies.json').read_text(encoding='utf-8'))
    for eid, e in (E.items() if isinstance(E, dict) else []):
        if isinstance(e, dict) and e.get('templateSlot'):
            acc.add(eid)
        for s in (e.get('summons') or []) if isinstance(e, dict) else []:
            k = s.get('key') if isinstance(s, dict) else s
            if isinstance(k, str):
                acc.add(k)
    return acc | set(device_keys())


# ---- the render table ------------------------------------------------------------------------------------------------

def opt_of(em):
    o = {'s': em.get('start', 2), 'e': em.get('end', 3), 'o': em.get('oneshot', 1)}
    if em.get('delayIfFirstAttack'):
        o['d'] = em['delayIfFirstAttack']
    if em.get('onlyOnce'):
        o['once'] = 1
    return o


def uniq(lst):
    return list(dict.fromkeys(x for x in lst if x))


def emit_part(abilities, projs):
    """{cast, opt, hit, aim?, dirs?, proj?, hitBuff?, attach?} of the abilities of one attack (or one skill)."""
    cast, opt, hit, aim, dirs, attach, hit_buff, lines, hopt = [], {}, [], [], [], [], [], [], {}
    buff_life = {}
    proj = None
    for a in abilities:
        for em in a.get('castEffects') or []:
            names = uniq(em['fx'])
            cast += names
            for n in names:
                opt.setdefault(n, opt_of(em))
            if em.get('slots') and len(set(x for x in em['slots'] if x)) > 1:
                dirs.append({'t': em['dir'], 's': em['slots'][:4] + [''] * (4 - len(em['slots'][:4]))})
        for k in ('hitEffects', 'inputTargetEffects', 'castTargetEffects'):
            for em in a.get(k) or []:
                hit += em['fx']
                # `_onlyOnce`: the first hit of the cast only, held until its end event (子代's 摄食 trap_dstnta_attack_01_hit on
                # the held operator until ON_CAST_END 3)
                if em.get('onlyOnce'):
                    for n in em['fx']:
                        hopt.setdefault(n, {'e': em.get('end', 3), 'once': 1})
                if em.get('aim'):
                    aim += em['fx']
                if em.get('slots') and len(set(x for x in em['slots'] if x)) > 1:
                    dirs.append({'t': em['dir'], 's': em['slots'][:4] + [''] * (4 - len(em['slots'][:4]))})
        for em in a.get('attachEffects') or []:
            attach += em['fx']
        # a buff the attack / skill puts on its targets: its own effect (overrideEffectKey, else the template's effectKey) —
        # not the effects its nodes create later (a shield's break, a trap's end)
        for b in a.get('activeBuffs') or []:
            names = [n for n in strs(b.get('fx')) or ((b.get('template') or {}).get('key') or []) if n not in STATUS_HIT_DRAWN]
            hit_buff += names
            # 2026-10-11, decompile check round 2 — client `Entity.AddBuffEffect` / `RemoveBuffEffect` (RVA 0x35F3CA0 /
            # 0x36001C0): the buff's effect stays on its owner while the buff lasts, one per name (`BuffEffectHolder.refCounter`):
            # `hitBuffLife` { name: the buff's life } (LIMITED `lifeTime` s, IMMEDIATELY 0; none = no limit)
            for n in names:
                if 'life' in b:
                    buff_life.setdefault(n, b['life'])
            # 2026-10-10: its template's CreateLineEffect lines (from the buff's source to its owner, while the buff lasts —
            # the line prefab's LineEffectEmitterDynamic `_buffKeyForFinish`): { fx, life? (the buff's lifeTime) }
            for n in (b.get('template') or {}).get('line') or []:
                if all(x['fx'] != n for x in lines):
                    lines.append({'fx': n, **({'life': b['life']} if 'life' in b else {})})
        for p in a.get('projectiles') or []:
            if proj is None and p['key'] in projs:
                pr = projs[p['key']]
                proj = {'key': p['key'], 'mount': MOUNTS.index(p['mount']) if p['mount'] in MOUNTS else None}
                for f in ('trail', 'hit', 'reached', 'targetStart', 'start', 'tileStart'):
                    if pr.get(f):
                        proj[f] = pr[f]
                for f in ('move', 'speed', 'raise', 'link', 'fallingTime'):
                    if f in pr:
                        proj[f] = pr[f]
                # 2026-10-10: the sub-projectiles it places (`_subProjectileKey` …: 萨米的意志's 冰凌 projectile_enemy_smdeer leaves a
                # projectile_enemy_smdeer_2 on each tile it passes) with their own effects and life
                subs = []
                for sk in pr.get('sub') or []:
                    sp = projs.get(sk) or {}
                    rec = {'key': sk}
                    for f in ('trail', 'hit', 'reached', 'targetStart', 'start'):
                        if sp.get(f):
                            rec[f] = sp[f]
                    if sp.get('lifeTime'):
                        rec['life'] = sp['lifeTime']
                    if all(x['key'] != sk for x in subs):
                        subs.append(rec)
                if subs:
                    proj['sub'] = subs
    part = {'cast': uniq(cast), 'opt': opt, 'hit': uniq(hit)}
    if aim:
        part['aim'] = uniq(aim)
    if hopt:
        part['hopt'] = hopt
    if dirs:
        part['dirs'] = dirs
    if attach:
        part['attach'] = uniq(attach)
    if hit_buff:
        part['hitBuff'] = uniq(hit_buff)
        life = {n: buff_life[n] for n in part['hitBuff'] if n in buff_life}
        if life:
            part['hitBuffLife'] = life
    if lines:
        part['line'] = lines
    if proj:
        part['proj'] = proj
    return part


def names_of_part(p):
    out = list(p.get('cast', [])) + list(p.get('hit', [])) + list(p.get('attach', [])) + list(p.get('hitBuff', []))
    out += [x['fx'] for x in p.get('line', [])]
    pr = p.get('proj') or {}
    for f in ('trail', 'hit', 'reached', 'targetStart', 'start', 'tileStart'):
        out += pr.get(f, [])
    for sp in pr.get('sub', []):
        for f in ('trail', 'hit', 'reached', 'targetStart', 'start'):
            out += sp.get(f, [])
    for d in p.get('dirs', []):
        out += [x for x in d['s'] if x]
    return out


def skill_keys(path):
    """The names an enemy skill / talent ability is looked up by (lower case): the GameObject name under Skills / Skill /
    Talents / CommonAbilities (enemies.json skills[].prefabKey: `boomb` ↔ `Skills/Boomb`), its sub-path, the parent's name."""
    parts = path.split('/')
    for i, p in enumerate(parts):
        if p in ('Skills', 'Skill', 'Talents', 'Talent', 'CommonAbilities', 'CommonAbility', 'GeneralAbilities'):
            rest = parts[i + 1:]
            if not rest:
                return []
            keys = ['/'.join(rest).lower(), rest[-1].lower(), rest[0].lower()]
            return list(dict.fromkeys(keys))
    # a token mode's own ability beside its attack (子代's Modes/Default/Body/Grow — cast by its talent buff's end, its
    # clip Start_02): by its name
    if len(parts) >= 4 and parts[0] == 'Modes' and parts[2] == 'Body' and parts[3] not in ('Combat', 'Attack', 'Passive'):
        rest = parts[3:]
        return list(dict.fromkeys(['/'.join(rest).lower(), rest[-1].lower(), rest[0].lower()]))
    return []


def render_entry(r, projs):
    """enemy-bindings record → the render table entry."""
    modes = []
    for m in r['modes']:
        ab = [a for a in r['abilities'] if a.get('mode') == m['i']]
        rel = lambda a, m=m: a['path'][len(m['path']) + 1:] if a['path'].startswith(m['path'] + '/') else a['path']  # noqa: E731
        melee = [a for a in ab if re.match(r'^(Body/)?Combat(/|$)', rel(a))]
        ranged = [a for a in ab if re.match(r'^(Body/)?Attack(/|$)', rel(a))]
        e = {'name': m['name'], 'anim': uniq(a.get('anim') for a in melee + ranged)}
        if melee:
            e['melee'] = emit_part(melee, projs)
        if ranged:
            e['ranged'] = emit_part(ranged, projs)
        for k in ('overrideStartEffect', 'overrideDeadEffect'):
            if m.get(k):
                e['start' if k == 'overrideStartEffect' else 'dead'] = m[k]
        att = uniq(x for a in ab if not re.match(r'^(Body/)?(Combat|Attack)(/|$)', rel(a)) and not skill_keys(a['path'])
                   for em in a.get('attachEffects') or [] for x in em['fx'])
        if att:
            e['attach'] = att
        modes.append(e)
    out = {'modes': modes}
    for k in ('startEffect', 'deadEffect'):
        if r.get(k):
            out['start' if k == 'startEffect' else 'dead'] = r[k]
    # 2026-10-10, decompile check — client `Enemy.get_deadEffect` (RVA 0x730300, played by `DeadState._PlayAnimation`): the
    # current mode's `_overrideDeadEffect`, else the root's `_deadEffect`, else common_enemy_die_01; an enemy-side token is a
    # Character — `Character.get_deadEffect`'s default common_char_die_01 — unless it is a `Trap` (`Trap.get_deadEffect`, RVA
    # 0x84C240 in the 2026-10-14 client, returns the field as it is: '' = no dead effect; 子代) (docs/rules/fx.md 「보스 토큰·장비 이펙트」)
    out.setdefault('dead', '' if r.get('trap') else 'common_char_die_01' if r.get('token') else 'common_enemy_die_01')
    skills = {}
    groups = defaultdict(list)
    for a in r['abilities']:
        for k in skill_keys(a['path']):
            groups[k].append(a)
    for k, lst in groups.items():
        part = emit_part(lst, projs)
        buffs = uniq(x for a in lst for b in (a.get('buffs') or []) + (a.get('passiveBuffs') or [])
                     for x in (strs(b.get('fx')) or ((b.get('template') or {}).get('key') or [])))
        if buffs:
            part['buff'] = buffs
        if any(part.get(f) for f in ('cast', 'hit', 'attach', 'hitBuff', 'buff', 'proj', 'line')):
            part['anim'] = next((a['anim'] for a in lst if a.get('anim')), None)
            if part['anim'] is None:
                del part['anim']
            skills[k] = part
    if skills:
        out['skills'] = skills
    # an effect-only buff (template 'empty' — no stat, only its effect) of a talent / common ability: held while the enemy
    # stands [추정: those abilities attach at the birth]; the statuses render/fxstatus.js draws are left to it
    # the root's `_commonAbilities` wherever they sit (黄金回响's Others/Direction/commonAbility: trap_vtlntw_buff_01 and _02, two
    # buffs of one key — BuffData.OverrideType DEFAULT keeps both: `Buff.OverrideGroup._DoAddInternal` RVA 0x39DF310 queues
    # every one, 2026-10-14 client)
    ab_aura = [a for a in r['abilities'] if a.get('common') or re.match(r'^(Talents?|CommonAbilit(y|ies))/', a['path'])]
    aura = uniq(b.get('fx') for a in ab_aura
                for b in a.get('buffs') or [] if b.get('tmpl') == 'empty' and b.get('fx') and b['fx'] not in STATUS_DRAWN)
    # a talent buff whose end casts one of its abilities (its template's ON_BUFF_FINISH TriggerAbility): its effect is held
    # until that ability starts — `auraEnd` { effect: ability key } (子代's tentac_grow: trap_dstnta_idle_01_start until Grow)
    aura_end = {}
    for a in ab_aura:
        for b in a.get('buffs') or []:
            fin = (b.get('template') or {}).get('finish')
            if fin and b.get('fx') and b['fx'] not in STATUS_DRAWN:
                aura.append(b['fx'])
                aura_end.setdefault(b['fx'], fin.lower())
    aura = uniq(aura)
    if aura:
        out['aura'] = aura
    if aura_end:
        out['auraEnd'] = aura_end
    # what a talent hands to the operators (a `…[char]` buff — the client's naming of a buff for characters): its template's
    # effects, held on the operator (render/fxstatus.js KEY_FX: 阿利斯泰尔's pieces — enemy_vtswd_buff_01 …) [추정: by the name]
    handed = uniq(x for a in r['abilities'] if re.match(r'^Talents?/', a['path'])
                  for b in a.get('buffs') or [] if str(b.get('key') or '').endswith('[char]')
                  for x in (b.get('template') or {}).get('fx') or [])
    if handed:
        out['handed'] = handed
    if r.get('points'):
        out['points'] = r['points']
    return out


def entry_names(e):
    out = [e.get('start'), e.get('dead')] + list(e.get('aura', [])) + list(e.get('handed', []))
    for m in e['modes']:
        out += [m.get('start'), m.get('dead')] + list(m.get('attach', []))
        for k in ('melee', 'ranged'):
            if m.get(k):
                out += names_of_part(m[k])
    for p in (e.get('skills') or {}).values():
        out += names_of_part(p) + list(p.get('buff', []))
    return [x for x in out if x]


def out_bundle(rel):
    """The extracted bundle name of a client effect bundle path."""
    m = re.search(r'btl_pfb_fx_(\w+)\.ab$', rel)
    if m:
        return 'pfx_' + m.group(1)
    return Path(rel).stem.replace('[uc]', '')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--game', default=client_data(), help='the client\'s Arknights_Data folder (default: client_path.py)')
    ap.add_argument('--cache', help='folder for the slow reads (pickles), reused by later runs')
    ap.add_argument('--cab-index', default=str(ROOT / '.cache/fx-cab-index.json'), help='fx_extract.py CAB index')
    ap.add_argument('--extract', action='store_true', help='extract the effect prefabs not extracted yet (fx_extract.py)')
    ap.add_argument('--all', action='store_true', help='with --extract: every enemy\'s effects, not only the ones that appear')
    ap.add_argument('--id', action='append', default=[], help='only these enemies (extraction)')
    a = ap.parse_args()
    game = a.game
    cache = Path(a.cache) if a.cache else None
    if cache:
        cache.mkdir(parents=True, exist_ok=True)
    E = json.loads((ROOT / 'data/enemies.json').read_text(encoding='utf-8'))
    P = cached(cache, 'enemies.pkl', lambda: read_enemies(game))
    PR = cached(cache, 'proj.pkl', lambda: read_projectiles(game))
    PTS = cached(cache, 'points.pkl', lambda: read_points(game))
    if cache and (cache / 'fx_index.json').exists():
        FX = {k.lower(): v for k, v in json.loads((cache / 'fx_index.json').read_text()).items()}
    else:
        FX = read_fx_index(game)
        if cache:
            (cache / 'fx_index.json').write_text(json.dumps(FX))
    BT = cached(cache, 'buff_templates.pkl', lambda: read_buff_templates(game))
    DEV = device_keys()
    TOK = cached(cache, 'tokens.pkl', lambda: read_tokens(game, set(DEV)))
    SKP = cached(cache, 'skill_prefabs.pkl', lambda: read_skill_prefabs(game, {k for v in DEV.values() for k in v}))
    PTS = dict(PTS, **cached(cache, 'token_points.pkl', lambda: read_points(game, 'pkgrps/btl_pfb_tokens_*.ab', set(DEV))))
    proj_keys = set(PR)
    res, projs = {}, {}
    units = [(eid, eid if eid in P['trees'] else (e.get('spine') or eid), P) for eid, e in sorted(E.items())]
    units += [(k, k, TOK) for k in sorted(DEV) if k not in E]
    for eid, root, src in units:
        tree = src['trees'].get(root)
        r = {'prefab': root, 'bundle': src['src'].get(root)}
        if src is TOK:
            r['token'] = 1
        if not tree:
            r['missing'] = True
            res[eid] = r
            continue
        sk = {k: SKP[k] for k in DEV.get(eid, []) if k in SKP} if src is TOK else None
        r.update(enemy_record(root, tree, FX, proj_keys, sk))
        if PTS.get(root):
            r['points'] = PTS[root]
        pk = []
        for ab in r['abilities']:
            for p in ab.get('projectiles') or []:
                pk += [p['key']] + p.get('extra', []) + ([p['duo']] if p.get('duo') else [])
            pk += [x['key'] for x in ab.get('otherProjectiles') or []]
            for kk in ('buffs', 'activeBuffs', 'passiveBuffs', 'projectileBuffs', 'buffsWhenReachedTarget', 'buffsToBlockee'):
                for b in ab.get(kk) or []:
                    t = template_info(b.get('tmpl') or b.get('key'), BT, FX, proj_keys)
                    if t:
                        b['template'] = t
                        pk += t.get('projectiles', [])
        todo = list(dict.fromkeys(pk))
        while todo:
            k = todo.pop(0)
            if k in projs:
                continue
            pr = proj_record(k, PR)
            projs[k] = pr or {'key': k, 'missing': True}
            todo += [s for s in (pr or {}).get('sub', []) if s not in projs]
        r['projectileKeys'] = list(dict.fromkeys(pk))
        res[eid] = r
    doc = {'$comment': 'Official enemy effect bindings (EN client battle/enm_pfb_*.ab, [uc]projectiles.ab, config/buff_template_holder.ab). '
                       'Per enemy id of data/enemies.json: prefab root + bundle, modes (UnitMode: _overrideStart/DeadEffect), '
                       'abilities (GameObject path; emitters castEffects/hitEffects/attachEffects/inputTargetEffects/castTargetEffects '
                       'with start/end AbilityStandard.Event, oneshot, dir / slots; buffs with overrideEffectKey (fx) and their template '
                       'effects; projectiles with _mountPointType), points (Graphic mount transforms). Written by '
                       'tools/local-extract/enemy_bindings.py; the render table goes to public/assets/local/fx/enemy-modes.json.',
           '$projectiles': dict(sorted(projs.items()))}
    doc.update(res)
    lines = [f' {json.dumps(k)}: {json.dumps(v, ensure_ascii=False, separators=(",", ":"))}' for k, v in doc.items()]
    OUT.write_text('{\n' + ',\n'.join(lines) + '\n}\n', encoding='utf-8')

    table = {eid: render_entry(r, projs) for eid, r in res.items() if not r.get('missing')}
    # the extracted effects (operators' index.json + ours), by lower-case name
    have = {}
    for name in ('index.json', ENEMY_INDEX):
        p = FX_DIR / name
        if p.exists():
            for b, lst in (json.loads(p.read_text()).get('bundles') or {}).items():
                for n in lst:
                    have.setdefault(n.lower(), [b, n])
    if a.extract:
        ids = set(a.id) if a.id else (set(table) if a.all else used_enemies() & set(table))
        want = defaultdict(set)
        for eid in sorted(ids):
            for n in entry_names(table.get(eid) or {'modes': []}):
                if n.lower() in have or n.lower() not in FX:
                    continue
                want[FX[n.lower()]['bundle']].add(n)
        import fx_extract
        ex = fx_extract.Extractor(game, a.cab_index)
        for rel in sorted(want):
            print(f'[enemy] {rel}: {len(want[rel])} prefab(s)')
            ex.run(out_bundle(rel), set(want[rel]), pack=rel, index=ENEMY_INDEX)
        p = FX_DIR / ENEMY_INDEX
        if p.exists():
            for b, lst in (json.loads(p.read_text()).get('bundles') or {}).items():
                for n in lst:
                    have.setdefault(n.lower(), [b, n])
    names = set()
    for e in table.values():
        names.update(x.lower() for x in entry_names(e))
    fx_map = {n: have[n] for n in sorted(names) if n in have}
    FX_DIR.mkdir(parents=True, exist_ok=True)
    out = {'$comment': 'Enemy effect bindings for render/fxgame.js (tools/local-extract/enemy_bindings.py; local, not committed).',
           '$fx': fx_map}
    out.update({k: table[k] for k in sorted(table)})
    FX_OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    missing = sorted(n for n in names if n not in have)
    print(f'[enemy] {len(res)} enemies, {len(projs)} projectiles; effects {len(fx_map)} extracted / {len(names)} named'
          f' ({len(missing)} not extracted) -> {OUT.relative_to(ROOT)}, {FX_OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
