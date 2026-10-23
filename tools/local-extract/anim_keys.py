#!/usr/bin/env python3
"""The clip keys of this server's operators, from the local client (docs/rules/render.md 「Spine 클립 커버리지」).

The client plays a Spine clip by key only. Abilities, modes and skill prefabs name keys; the skin's key table
(chararts `DefaultSkin` SpineAnimator `_animations`: animKey → animName) turns each into a clip name, and its
`_mixSettings` put a clip between two others. tools/assets/anim-keys.mjs builds the render roles from these keys
(tools/assets/spine.mjs). What is read, per operator:

  skin    { keys: { animKey: animName } (the pairs whose name differs), mix: [[source, target, mix]] }
  modes   [ { name, pairs: { from: to } (`_replaceAnimPairs` of the mode's animator hooker), exclude: [keys],
              combat: <ability path> (UnitMode `_combat`), abilities: { <path under the mode>: ability } } ]
  skills  [ { id, begin?, beginDown?, end? (the skill's `_beginAnim` when `_playSkillBeginAnim`, `_endAnim`),
              defaultMode? (`_defaultModeIndex` ≥ 0), mode? (the switch_mode its buff names),
              abilities: { <path under the prefab, '' = its root>: ability } } ]
  ability { key ('' = no clip), end, down, downEnd, up, upEnd, charge (AbstractAnimatedAbility `_animKey` …, the other
            empty ones left out),
            three: { begin, oneshot, end, first } (ThreePartOneshotAnimation), chan: { begin, loop, end }
            (a ThreePart channel's `_default`), emit: [keys] (AnimationEmitBehaviour `_settings[].anim`),
            hook: { from: to } (its `_hookSettings`), src (`_sourceAnimKey`),
            turns: { anims: [keys], loop } (UberAnimationEffectEmitter `_replaceGroup[].anim`, `_loopType` 0 LOOP / 1 RANDOM),
            group: { of: [child paths], method?, diff?, seq? } (AbilityRandomGroup `_abilities` / `_selectMethod` /
            `_diffFromLastOneIfNotFirst`, AbilitySelectableGroup `_abilityConfigs[]._ability` / `_selectAbilitySequentially`) }

The output is client-only data and is never tracked (maintainer decision 2026-10-22): .cache/anim-keys.json.

Usage (from the repo root; ~2 min): .venv-extract/bin/python tools/local-extract/anim_keys.py [--client <EN Arknights_Data>]
  [--cn <CN Arknights_Data>] [--out <file>]
Operators and skills the EN client lacks are read from --cn when given (`cn: true`).
Everything read is (c) Hypergryph; private fan use only.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from client_path import client_data  # noqa: E402
from char_modes import load_tree, char_skill_prefabs, skills_tree, skill_switch_modes  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.cache/anim-keys.json'
BASES = ('PersistentData/Bundles', 'StreamingAssets/AB/Windows')   # first wins (hot update)
# AbstractAnimatedAbility field → output key
KEYS = {'_animKey': 'key', '_endAnimKey': 'end', '_downAnimKey': 'down', '_downEndAnimKey': 'downEnd', '_upAnimKey': 'up',
        '_upEndAnimKey': 'upEnd', '_chargeAnimKey': 'charge'}


def bundle(game, rel):
    for b in BASES:
        p = Path(game) / b / rel
        if p.exists():
            return p
    return None


def s(v):
    return v if isinstance(v, str) and v else None


def ability_of(d, out):
    """Fold the clip fields of one MonoBehaviour `d` into `out` (the record of its GameObject); True when it had any."""
    got = False
    if '_animKey' in d:
        out['key'] = s(d.get('_animKey')) or ''   # '' = the ability plays no clip (a stance stays on)
        for k, o in KEYS.items():
            if s(d.get(k)):
                out[o] = d[k]
        got = True
    if s(d.get('_oneshotAnim')):
        out['three'] = {'begin': s(d.get('_beginAnim')), 'oneshot': d['_oneshotAnim'], 'end': s(d.get('_endAnim')),
                        'first': int(bool(d.get('_onlyPlayBeginAnimWhenFirstAttack')))}
        got = True
    df = d.get('_default')
    if isinstance(df, dict) and any(s(df.get(k)) for k in ('beginAnim', 'loopAnim', 'endAnim')):
        out['chan'] = {'begin': s(df.get('beginAnim')), 'loop': s(df.get('loopAnim')), 'end': s(df.get('endAnim'))}
        got = True
    if isinstance(d.get('_settings'), list) and any(isinstance(x, dict) and 'anim' in x for x in d['_settings']):
        out['emit'] = [x['anim'] for x in d['_settings'] if isinstance(x, dict) and s(x.get('anim'))]
        hook = {h['fromAnimKey']: h['toAnimKey'] for h in d.get('_hookSettings') or []
                if isinstance(h, dict) and s(h.get('fromAnimKey')) and s(h.get('toAnimKey'))}
        if hook:
            out['hook'] = hook
        got = True
    if s(d.get('_sourceAnimKey')):
        out['src'] = d['_sourceAnimKey']
        got = True
    rg = d.get('_replaceGroup')
    if isinstance(rg, list) and any(isinstance(x, dict) and s(x.get('anim')) for x in rg):
        out['turns'] = {'anims': [x['anim'] for x in rg if isinstance(x, dict) and s(x.get('anim'))], 'loop': d.get('_loopType')}
        got = True
    return got


def group_of(d, rel_of):
    """The `group` record of an ability group MonoBehaviour `d` (children by path through `rel_of`: MonoBehaviour path id →
    path), or None."""
    if isinstance(d.get('_abilities'), list) and '_selectMethod' in d:
        of = [rel_of.get((r or {}).get('m_PathID')) for r in d['_abilities']]
        return {'of': of, 'method': d.get('_selectMethod'), 'diff': int(bool(d.get('_diffFromLastOneIfNotFirst')))}
    if isinstance(d.get('_abilityConfigs'), list) and d.get('_selectAbilitySequentially'):
        of = [rel_of.get(((c or {}).get('_ability') or {}).get('m_PathID')) for c in d['_abilityConfigs']]
        return {'of': of, 'seq': 1}
    return None


def abilities_under(tree, base):
    """{path relative to `base` ('' = base itself): ability} of the GameObjects at or below `base`."""
    out = {}
    under = [(gp, d, pid) for gp, d, pid in tree if gp == base or gp.startswith(base + '/')]
    rel = lambda gp: gp[len(base) + 1:] if gp != base else ''  # noqa: E731
    rel_of = {pid: rel(gp) for gp, _, pid in under if pid is not None}
    for gp, d, _ in under:
        rec = out.setdefault(rel(gp), {})
        ability_of(d, rec)
        g = group_of(d, rel_of)
        if g and any(x is not None for x in g['of']):
            rec['group'] = g
    return {k: v for k, v in sorted(out.items()) if v}


def skin_of(path):
    """The skin key table of a chararts bundle: { keys, mix } of its DefaultSkin, or None."""
    tree, _ = load_tree(str(path))
    for gp, d, _ in tree:
        if gp == 'DefaultSkin' and isinstance(d.get('_animations'), list):
            keys = {a['animKey']: a['animName'] for a in d['_animations']
                    if isinstance(a, dict) and s(a.get('animKey')) and s(a.get('animName')) and a['animKey'] != a['animName']}
            mix = [[m.get('sourceAnimName'), m.get('targetAnimName'), m.get('mixAnimName')] for m in d.get('_mixSettings') or []
                   if isinstance(m, dict)]
            return {'keys': keys, 'mix': mix}
    return None


def pack_of(path):
    """{ modes, dead? } of a charpack bundle, or None (no `_modes`)."""
    tree, _ = load_tree(str(path))
    root = next((d for _, d, _ in tree if isinstance(d.get('_modes'), list) and d['_modes']), None)
    if root is None:
        return None
    gp_of = {pid: gp for gp, _, pid in tree}
    by_pid = {pid: d for _, d, pid in tree}
    modes = []
    for ref in root['_modes']:
        mp = gp_of.get(ref.get('m_PathID')) or ''
        m = {'name': mp.split('/')[-1] if mp else '?', 'pairs': {}, 'exclude': []}
        for gp, d, _ in tree:
            if gp != mp:
                continue
            hook = by_pid.get((d.get('_animatorHooker') or {}).get('m_PathID'))
            for src in (d, hook):
                if not isinstance(src, dict):
                    continue
                for p in src.get('_replaceAnimPairs') or []:
                    if isinstance(p, dict) and s(p.get('fromAnimKey')) and s(p.get('toAnimKey')):
                        m['pairs'][p['fromAnimKey']] = p['toAnimKey']
                for k in src.get('_excludeAnimKeys') or []:
                    if s(k) and k not in m['exclude']:
                        m['exclude'].append(k)
            cb = gp_of.get((d.get('_combat') or {}).get('m_PathID'))
            if cb and cb.startswith(mp + '/'):
                m['combat'] = cb[len(mp) + 1:]
        m['abilities'] = abilities_under(tree, mp) if mp else {}
        if not m['exclude']:
            del m['exclude']
        modes.append(m)
    out = {'modes': modes}
    if root.get('_useSpecificDeadAnim'):
        out['dead'] = 1
    return out


def skill_of(sid, comps):
    """{ id, begin?, … abilities } of one skill prefab's [(GameObject path, MonoBehaviour, its path id)]."""
    e = {'id': sid}
    for gp, d, _ in comps:
        if gp != sid:
            continue
        if '_playSkillBeginAnim' in d:
            if d.get('_playSkillBeginAnim') and s(d.get('_beginAnim')):
                e['begin'] = d['_beginAnim']
            if s(d.get('_beginAnimDown')):
                e['beginDown'] = d['_beginAnimDown']
            if s(d.get('_endAnim')):
                e['end'] = d['_endAnim']
        if isinstance(d.get('_defaultModeIndex'), int) and d['_defaultModeIndex'] >= 0:
            e['defaultMode'] = d['_defaultModeIndex']
    e['abilities'] = abilities_under(comps, sid)
    return e


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--client', default=client_data())
    ap.add_argument('--cn', default=None, help='the CN client Arknights_Data (for what the EN client lacks)')
    ap.add_argument('--out', default=str(OUT))
    a = ap.parse_args()
    games = [(a.client, False)] + ([(a.cn, True)] if a.cn else [])
    ids = sorted(json.loads((ROOT / 'data/assets.json').read_text(encoding='utf-8'))['chars'])
    prefabs = char_skill_prefabs()
    ops, missing = {}, []
    for cid in ids:
        for game, cn in games:
            pk, sk = bundle(game, f'charpack/{cid}.ab'), bundle(game, f'chararts/{cid}.ab')
            if not pk:
                continue
            rec = pack_of(pk) or {'modes': []}
            rec['skin'] = (skin_of(sk) if sk else None) or {'keys': {}, 'mix': []}
            if cn:
                rec['cn'] = True
            ops[cid] = rec
            break
        else:
            missing.append(cid)
    for game, cn in games:
        want = {p: cid for cid, ps in prefabs.items() if cid in ops and bool(ops[cid].get('cn')) == cn for p in ps if p}
        if not want:
            continue
        tree = skills_tree(game)
        switch = skill_switch_modes(tree)
        comps = {}
        for gp, d, pid in tree:
            r = gp.split('/')[0]
            if r in want:
                comps.setdefault(r, []).append((gp, d, pid))
        for cid in {want[p] for p in want}:
            out = []
            for p in prefabs[cid]:
                e = skill_of(p, comps.get(p, [])) if p else {'id': None, 'abilities': {}}
                if p in switch:
                    e['mode'] = switch[p]
                out.append(e)
            ops[cid]['skills'] = out
    doc = {'$comment': 'Clip keys of the operators (abilities, modes, skill prefabs, the skin key table), written by '
                       'tools/local-extract/anim_keys.py from the local client. Client-only, never tracked.',
           'ops': ops}
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(doc, ensure_ascii=False, indent=1, sort_keys=True) + '\n', encoding='utf-8')
    print(f'{len(ops)} operators -> {a.out}' + (f'; no charpack: {", ".join(missing)}' if missing else ''))


if __name__ == '__main__':
    main()
