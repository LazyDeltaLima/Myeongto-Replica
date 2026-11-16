#!/usr/bin/env python3
"""The clip keys of this server's operators, from the local client (docs/rules/render.md 「Spine 클립 커버리지」).

The client plays a Spine clip by key only. Abilities, modes and skill prefabs name keys; the skin's key table
(chararts `DefaultSkin` SpineAnimator `_animations`: animKey → animName) turns each into a clip name, and its
`_mixSettings` put a clip between two others. tools/assets/anim-keys.mjs builds the render roles from these keys
(tools/assets/spine.mjs). What is read, per operator:

  skin    { keys: { animKey: animName } (the pairs whose name differs), mix: [[source, target, mix]] }
  modes   [ { name, pairs: { from: to } (`_replaceAnimPairs` of the mode's animator hooker), exclude: [keys],
              combat: <ability path> (UnitMode `_combat`), abilities: { <path under the mode>: ability } } ]
  skills  [ { id, begin?, beginDown?, end? (the skill's `_beginAnim` when `_playSkillBeginAnim`, `_beginAnimDown`, `_endAnim`),
              defaultMode? (`_defaultModeIndex` ≥ 0), mode? (the switch_mode its buff names),
              downMode?, downBy? (the mode its buff template switches to when the owner faces down: down_modes),
              abilities: { <path under the prefab, '' = its root>: ability } } ]
  ability { key ('' = no clip), end, down, downEnd, up, upEnd, charge (AbstractAnimatedAbility `_animKey` …, the other
            empty ones left out), dby (when down / downEnd play: down_by),
            three: { begin, oneshot, end, first, down? { begin, oneshot, end, by } } (ThreePartOneshotAnimation, its
            `_down` bundle under `_overrideDownAnimation`), chan: { begin, loop, end, down?, wait? }
            (a ThreePart channel's `_default`, its `_down` likewise; wait 1 = `_waitForAttachFinishEvent`: its loop lasts until
            the owner's attack-finish event, not `m_loopTime`), fin: { proj, life } (beside a waiting channel: the ability's
            RangedAttack sends that event as its projectile `proj` ends, `_waitForProjectileInvalid` with
            `_fireAttackFinishWhenProjectileInvalid` — `life` the projectile prefab's LIMITED `_lifeTime`), emit: [keys] (AnimationEmitBehaviour `_settings[].anim`),
            hook: { from: to } (its `_hookSettings`), src (`_sourceAnimKey`),
            turns: { anims: [keys], loop } (UberAnimationEffectEmitter `_replaceGroup[].anim`, `_loopType` 0 LOOP / 1 RANDOM),
            group: { of: [child paths], method?, diff?, seq? } (AbilityRandomGroup `_abilities` / `_selectMethod` /
            `_diffFromLastOneIfNotFirst`, AbilitySelectableGroup `_abilityConfigs[]._ability` / `_selectAbilitySequentially`) }

Summons (`tokens`): the same `modes` and `skin` from their token prefabs (pkgrps/btl_pfb_tokens_*.ab), for the summons of
data/assets.json whose prefab has modes.

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
from char_modes import load_tree, char_skill_prefabs, skills_tree, skill_switch_modes, pool_char_ids  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.cache/anim-keys.json'
# the buff templates (public datasets, en_US first: tools/build-data.mjs), for the modes a skill switches to by facing
TEMPLATE_DATA = [ROOT / '.cache/gamedata-en/battle/buff_template_data.json', ROOT / '.cache/gamedata/battle/buff_template_data.json']
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


def down_by(d):
    """When an ability plays its `_downAnimKey` / `_downEndAnimKey` (AbstractAnimatedAbility.CheckDownAttack): 'face' = its
    owner faces down as it casts (`_faceToTarget`), 'deploy' = the owner was deployed facing down; '+face' = also when
    it faces its first cast target downward (`_faceToFirstCastTarget` with `_checkFaceToFirstCastTargetDownAttack`)."""
    by = 'face' if d.get('_faceToTarget') else 'deploy'
    if by == 'deploy' and d.get('_faceToFirstCastTarget') and d.get('_checkFaceToFirstCastTargetDownAttack'):
        by += '+face'
    return by


def down_modes(tpl):
    """(mode index, 'deploy' | 'face') that buff template `tpl` switches to when its owner was deployed facing down
    (CheckCharacterDefaultDirection) or faces down (CheckFaceDirection) — an IfElse on DOWN whose branch is a SwitchMode
    (跃跃 S2 `caper_s_2` → `S2[Down]`) — or None."""
    found = []

    def kind(o):
        return str(o.get('$type', '')).split(',')[0].split('+')[-1]

    def walk(o):
        if isinstance(o, dict):
            c = o.get('_conditionNode')
            if kind(o) == 'IfElse' and isinstance(c, dict) and c.get('_direction') == 'DOWN' and not c.get('_useBB'):
                by = {'CheckCharacterDefaultDirection': 'deploy', 'CheckFaceDirection': 'face'}.get(kind(c))
                sw = [n for n in o.get('_succeedNodes') or [] if isinstance(n, dict) and kind(n) == 'SwitchMode'
                      and not n.get('_loadModeFromBlackboard') and isinstance(n.get('_modeIndex'), int)]
                if by and sw:
                    found.append((sw[0]['_modeIndex'], by))
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(tpl)
    return found[0] if found else None


def skill_templates(comps):
    """The buff template keys a skill prefab's [(GameObject path, MonoBehaviour, path id)] name, in order."""
    out = []

    def walk(o):
        if isinstance(o, dict):
            tk = o.get('templateKey')
            if isinstance(tk, str) and tk and tk not in out:
                out.append(tk)
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    for _, d, _ in comps:
        walk(d)
    return out


def ability_of(d, out):
    """Fold the clip fields of one MonoBehaviour `d` into `out` (the record of its GameObject); True when it had any."""
    got = False
    if '_animKey' in d:
        out['key'] = s(d.get('_animKey')) or ''   # '' = the ability plays no clip (a stance stays on)
        for k, o in KEYS.items():
            if s(d.get(k)):
                out[o] = d[k]
        if s(d.get('_downAnimKey')) or s(d.get('_downEndAnimKey')):
            out['dby'] = down_by(d)
        got = True
    if s(d.get('_oneshotAnim')):
        out['three'] = {'begin': s(d.get('_beginAnim')), 'oneshot': d['_oneshotAnim'], 'end': s(d.get('_endAnim')),
                        'first': int(bool(d.get('_onlyPlayBeginAnimWhenFirstAttack')))}
        dn = d.get('_down') if isinstance(d.get('_down'), dict) else {}
        if d.get('_overrideDownAnimation') and s(dn.get('oneshotAnim')):
            # ThreePartOneshotAnimation._GetAnimBundle: its `_down` bundle when its owner faces down (`_faceToTarget`) or
            # was deployed facing down
            out['three']['down'] = {'begin': s(dn.get('beginAnim')), 'oneshot': dn['oneshotAnim'], 'end': s(dn.get('endAnim')),
                                    'by': 'face' if d.get('_faceToTarget') else 'deploy'}
        got = True
    df = d.get('_default')
    if isinstance(df, dict) and any(s(df.get(k)) for k in ('beginAnim', 'loopAnim', 'endAnim')):
        out['chan'] = {'begin': s(df.get('beginAnim')), 'loop': s(df.get('loopAnim')), 'end': s(df.get('endAnim'))}
        dn = d.get('_down') if isinstance(d.get('_down'), dict) else {}
        if d.get('_overrideDownAnimation') and any(s(dn.get(k)) for k in ('beginAnim', 'loopAnim', 'endAnim')):
            # ThreePartChannelingAnimation._GetAnimBundle: its `_down` bundle when its owner was deployed facing down
            out['chan']['down'] = {'begin': s(dn.get('beginAnim')), 'loop': s(dn.get('loopAnim')), 'end': s(dn.get('endAnim')), 'by': 'deploy'}
        if d.get('_waitForAttachFinishEvent'):
            # ThreePartChannelingAnimation.DoPlayAnimation: the loop waits for the owner's entity event ON_ATTACK_FINISH (at
            # most 360 s) instead of `m_loopTime`
            out['chan']['wait'] = 1
        got = True
    if d.get('_waitForProjectileInvalid') and d.get('_fireAttackFinishWhenProjectileInvalid') and s(d.get('_projectileKey')):
        # RangedAttack.OnWaitForPostDelay: as its projectiles are no longer valid it sends that event (kept below only beside
        # a waiting channel)
        out['fin'] = {'proj': d['_projectileKey']}
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
    for rec in out.values():
        if 'fin' in rec and not (rec.get('chan') or {}).get('wait'):
            del rec['fin']
    return {k: v for k, v in sorted(out.items()) if v}


def fins(rec):
    """The `fin` records of an operator record's modes and skills."""
    for part in (rec.get('modes') or []) + (rec.get('skills') or []):
        for ab in (part.get('abilities') or {}).values():
            if 'fin' in ab:
                yield ab['fin']


def put_fin_lives(ops, games):
    """Give each `fin` its projectile's life (enemy_projectiles.projectiles: the LIMITED `_lifeTime`), from the first client
    that has the prefab; one no client has, or one without a life, stops the run (its channel would wait for nothing)."""
    left = [f for rec in ops.values() for f in fins(rec)]
    if not left:
        return
    import enemy_projectiles as ep
    for game, _ in games:
        allp = ep.projectiles(Path(game))
        for f in left:
            p = allp.get(f['proj'])
            if 'life' not in f and p and isinstance(p.get('life'), (int, float)) and p['life'] > 0:
                f['life'] = round(p['life'], 4)
        if all('life' in f for f in left):
            return
    raise SystemExit('anim_keys: no projectile life for ' + ', '.join(sorted({f['proj'] for f in left if 'life' not in f}))
                     + ' (a waiting channel ends with it: docs/rules/render.md 「스킬 끝 채널의 루프」)')


def skin_of(path, tree=None, at='DefaultSkin'):
    """The skin key table of a chararts bundle (or of `tree` at GameObject path `at`: a token prefab's
    `<id>/Graphic/DefaultSkin`): { keys, mix } of its DefaultSkin, or None."""
    if tree is None:
        tree, _ = load_tree(str(path))
    for gp, d, _ in tree:
        if gp == at and isinstance(d.get('_animations'), list):
            keys = {a['animKey']: a['animName'] for a in d['_animations']
                    if isinstance(a, dict) and s(a.get('animKey')) and s(a.get('animName')) and a['animKey'] != a['animName']}
            mix = [[m.get('sourceAnimName'), m.get('targetAnimName'), m.get('mixAnimName')] for m in d.get('_mixSettings') or []
                   if isinstance(m, dict)]
            return {'keys': keys, 'mix': mix}
    return None


def pack_of(path, tree=None):
    """{ modes, dead? } of a charpack bundle (or of `tree`, a token prefab's components), or None (no `_modes`)."""
    if tree is None:
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
            # only the hooker the UnitMode names (`_animatorHooker`; Unit.get_animatorHooker reads that field of the current
            # mode, nothing else): a hooker component that merely sits on the mode's GameObject is not used (森蚺's
            # Default mode carries an unreferenced Idle→Skill_2_Idle hooker — the robot-only clip)
            if '_animatorHooker' not in d:
                continue
            hook = by_pid.get((d.get('_animatorHooker') or {}).get('m_PathID'))
            if isinstance(hook, dict):
                for p in hook.get('_replaceAnimPairs') or []:
                    if isinstance(p, dict) and s(p.get('fromAnimKey')) and s(p.get('toAnimKey')):
                        m['pairs'][p['fromAnimKey']] = p['toAnimKey']
                for k in hook.get('_excludeAnimKeys') or []:
                    if s(k) and k not in m['exclude']:
                        m['exclude'].append(k)
            cb = gp_of.get((d.get('_combat') or {}).get('m_PathID'))
            if cb and cb.startswith(mp + '/'):
                m['combat'] = cb[len(mp) + 1:]
            # the keys of the mode's own attack and combat abilities, by reference: two of a mode's GameObjects can share a
            # name (缪尔赛思's 流形 Melee: both `Body/wtrman_melee_Attack`), so their paths do not tell them apart
            for f, o in (('_attack', 'attackKey'), ('_combat', 'combatKey')):
                ab = by_pid.get((d.get(f) or {}).get('m_PathID'))
                if isinstance(ab, dict) and s(ab.get('_animKey')):
                    m[o] = ab['_animKey']
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


def target_ids():
    """The operators to read: the manifest's and every chess / 선발 operator of the data. Not the manifest alone: a hidden season's
    piece enters it only once its kit is listed and fetch-assets ran, so a run before that left its row out and its clips kept the
    roles of the name rule, with nothing to say so."""
    return sorted(set(json.loads((ROOT / 'data/assets.json').read_text(encoding='utf-8'))['chars']) | set(pool_char_ids()))


def switch_modes(tpl):
    """The mode indices a buff template's SwitchMode nodes name (both branches of an IfElse: 流形's mlyss_wtrman_switch_melee
    → 5 Melee_S3 while her S3 runs, else 2 Melee), in order; a mode read from the blackboard is left out."""
    found = []

    def walk(o):
        if isinstance(o, dict):
            if str(o.get('$type', '')).split(',')[0].endswith('+SwitchMode') and not o.get('_loadModeFromBlackboard') \
                    and isinstance(o.get('_modeIndex'), int) and o['_modeIndex'] not in found:
                found.append(o['_modeIndex'])
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(tpl)
    return found


def token_switches(sub, tid, n, templates):
    """[{ key, to: [mode indices], from? }] of a token prefab's abilities that play a clip (`_animKey`) and switch the token's
    mode through their `_activeBuffs`' templates (switch_modes); `from`: the mode the ability sits under (`Modes/<name>/…`),
    absent for one outside the modes (CommonAbilities: from any). 流形: SwitchToMelee Change_A → Melee / Melee_S3 (the
    copy in battle), Recharge's mlyss_wtrman_switch_melee A_Start → the same modes (its reborn); its plain reborn's mode
    comes from the blackboard (`mode` 1) and is read from the buff's blackboard instead."""
    out = []
    for gp, d, _ in sub:
        if not s(d.get('_animKey')) or not isinstance(d.get('_activeBuffs'), list):
            continue
        to = []
        for b in d['_activeBuffs']:
            if not isinstance(b, dict):
                continue
            for i in switch_modes(templates.get(b.get('templateKey')) or {}):
                if i < n and i not in to:
                    to.append(i)
            bb = {x.get('key'): x.get('value') for x in b.get('blackboard') or [] if isinstance(x, dict)}
            tpl = json.dumps(templates.get(b.get('templateKey')) or {})
            if isinstance(bb.get('mode'), (int, float)) and '"_loadModeFromBlackboard": true' in tpl and 0 <= int(bb['mode']) < n:
                if int(bb['mode']) not in to:
                    to.append(int(bb['mode']))
        if not to:
            continue
        e = {'key': d['_animKey'], 'to': to}
        rel = gp[len(tid) + 1:]
        if rel.startswith('Modes/'):
            e['from'] = rel.split('/')[1]
        out.append(e)
    return out


def tokens_of(games, templates):
    """{ token id: { modes, skin, cn? } } of the summons in data/assets.json with a Spine model, read from their token prefabs
    (pkgrps/btl_pfb_tokens_*.ab) as an operator's from its charpack and chararts: the prefab root's `_modes` with each
    mode's animator hooker pairs (pack_of) and `<id>/Graphic/DefaultSkin`'s key table (skin_of) — 缪尔赛思's 流形 rests in
    Idle_1 (Default), A_Idle (Melee), B_Idle (Range). Summons without modes are left out (their roles stay the name rule's)."""
    from char_points import token_files
    assets = json.loads((ROOT / 'data/assets.json').read_text(encoding='utf-8')).get('tokens') or {}
    want = sorted(tid for tid, a in assets.items() if isinstance(a, dict) and a.get('spine'))
    out, trees = {}, {}
    for game, cn in games:
        left = [tid for tid in want if tid not in out]
        if not left:
            break
        for tid, f in sorted(token_files(game, left).items()):
            if f not in trees:
                trees[f] = load_tree(str(f))[0]
            sub = [x for x in trees[f] if x[0] == tid or x[0].startswith(tid + '/')]
            rec = pack_of(None, sub)
            if not rec:
                continue
            rec['skin'] = skin_of(None, sub, f'{tid}/Graphic/DefaultSkin') or {'keys': {}, 'mix': []}
            sw = token_switches(sub, tid, len(rec['modes']), templates)
            if sw:
                rec['switches'] = sw
            if cn:
                rec['cn'] = True
            out[tid] = rec
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--client', default=client_data())
    ap.add_argument('--cn', default=None, help='the CN client Arknights_Data (for what the EN client lacks)')
    ap.add_argument('--out', default=str(OUT))
    a = ap.parse_args()
    games = [(a.client, False)] + ([(a.cn, True)] if a.cn else [])
    ids = target_ids()
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
    templates = {}
    for f in reversed(TEMPLATE_DATA):   # en_US last: it wins
        if f.exists():
            templates.update(json.loads(f.read_text(encoding='utf-8')))
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
                dm = next(filter(None, (down_modes(templates.get(k)) for k in skill_templates(comps.get(p, [])))), None)
                if dm:
                    e['downMode'], e['downBy'] = dm
                out.append(e)
            ops[cid]['skills'] = out
    put_fin_lives(ops, games)
    toks = tokens_of(games, templates)
    doc = {'$comment': 'Clip keys of the operators (abilities, modes, skill prefabs, the skin key table) and of the summons '
                       '(their prefab modes and skin key table), written by tools/local-extract/anim_keys.py from the local '
                       'client. Client-only, never tracked.',
           'ops': ops, 'tokens': toks}
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(doc, ensure_ascii=False, indent=1, sort_keys=True) + '\n', encoding='utf-8')
    print(f'{len(ops)} operators, {len(toks)} summons -> {a.out}' + (f'; no charpack: {", ".join(missing)}' if missing else ''))


if __name__ == '__main__':
    main()
