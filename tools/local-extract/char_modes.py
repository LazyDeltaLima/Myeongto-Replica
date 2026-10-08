#!/usr/bin/env python3
"""Operator attack modes from the local client (local patch, docs/LOCAL-PATCH.md 「스킬 모드 효과음」).

The official client sounds an operator's attacks through its attack mode: a bank `battle.<EVENT>.<charId>.attack.<n>`
where n is the mode's index in the character prefab's `_modes` list (charpack/char_*.ab: Default = 0, then the skill
modes in prefab order, e.g. 维什戴尔 [Default, S2, S2_Overload, S3] → S3's attacks sound `attack.3`). Which skill a mode
belongs to is in its name (`S<n>` + optional suffix), unless the skill's own prefab says otherwise: `skillMode`
[mode | null per skill] from the switch_mode buff in battle/prefabs/[uc]skills.ab (莫斯提马 [Default, S2]: S3 → 1). audio_data.json does not carry this order, so the asset plan
(tools/assets/plan.mjs) reads it from tools/assets/local-char-modes.json, which this script writes — with the projectile
keys each mode's attack fires (`_projectileKey` under Modes/<name>/: a ranged mode's impact sound is its projectile's bank
`battle.ON_PROJECTILE_HIT.<key>`):
  { "char_1035_wisdel": { "modes": ["Default", "S2", "S2_Overload", "S3"],
                          "proj": [["projectile_chr_wisdel_default"], ["projectile_chr_wisdel_s2"], …] }, … }

Usage (from the repo root; --client = the EN client's Arknights_Data folder):
  .venv-extract/bin/python tools/local-extract/char_modes.py [--client /mnt/d/YostarGames/Arknights_EN/Arknights_Data] [--id char_…]…
Without --id every operator of data/chess.json + data/diy.json. Everything is (c) Hypergryph; private fan use only.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tools/assets/local-char-modes.json'
# the effect bindings for the game's effect layer (render/fxgame.js), beside the extracted effects (git-ignored like them)
FX_OUT = ROOT / 'public/assets/local/fx/modes.json'
DEFAULT_CLIENT = '/mnt/d/YostarGames/Arknights_EN/Arknights_Data'


def pool_char_ids():
    ids = set()
    chess = json.loads((ROOT / 'data/chess.json').read_text(encoding='utf-8'))
    recs = chess.get('chess', chess)
    for c in (recs.values() if isinstance(recs, dict) else recs):
        if isinstance(c, dict) and isinstance(c.get('charId'), str) and c['charId'].startswith('char_'):
            ids.add(c['charId'])
    diy = ROOT / 'data/diy.json'
    if diy.exists():
        d = json.loads(diy.read_text(encoding='utf-8'))
        recs = (d.get('chess') or {})
        for c in (recs.values() if isinstance(recs, dict) else recs):
            if isinstance(c, dict) and isinstance(c.get('charId'), str) and c['charId'].startswith('char_'):
                ids.add(c['charId'])
    return sorted(ids)


def char_skill_prefabs():
    """{charId: [skill prefabId, …]} in skill order (data/chess.json, then data/diy.json for the rest)."""
    out = {}
    for f in ('data/chess.json', 'data/diy.json'):
        path = ROOT / f
        if not path.exists():
            continue
        d = json.loads(path.read_text(encoding='utf-8'))
        recs = d.get('chess', d) if isinstance(d, dict) else d
        for c in (recs.values() if isinstance(recs, dict) else recs):
            if not isinstance(c, dict) or not isinstance(c.get('charId'), str) or c['charId'] in out:
                continue
            sk = c.get('skills')
            if isinstance(sk, list) and sk:
                out[c['charId']] = [s.get('prefabId') or s.get('skillId') for s in sk if isinstance(s, dict)]
    return out


SKILL_MODE_NAME = re.compile(r'^Sk?\d')


def skills_tree(client):
    """[(GameObject path, MonoBehaviour)] of battle/prefabs/[uc]skills.ab (the skill prefabs; ~1 min to read), [] without it."""
    path = Path(client) / 'StreamingAssets/AB/Windows/battle/prefabs/[uc]skills.ab'
    return load_tree(str(path))[0] if path.exists() else []


def skill_switch_modes(tree):
    """{skill prefabId: mode index} — the mode a skill's own buff switches to (templateKey switch_mode*, blackboard
    `mode`) in battle/prefabs/[uc]skills.ab. Only skills with one such value."""
    found = {}

    def walk(o, sid):
        if isinstance(o, dict):
            tk = o.get('templateKey')
            if isinstance(tk, str) and 'switch_mode' in tk:
                for b in o.get('blackboard') or []:
                    if isinstance(b, dict) and b.get('key') == 'mode':
                        found.setdefault(sid, set()).add(int(b['value']))
            for v in o.values():
                walk(v, sid)
        elif isinstance(o, list):
            for v in o:
                walk(v, sid)

    for gp, d, _pid in tree:
        walk(d, gp.split('/')[0])
    return {k: next(iter(v)) for k, v in found.items() if len(v) == 1}


def skill_modes_of(modes, prefabs, switch):
    """[mode index | None] per skill: its prefab's switch_mode value when that names a skill mode (`S…`); 莫斯提马
    [Default, S2] — S3 switches to mode 1, her S2 none. None = the name rule (shared/skill-modes.js)."""
    res = []
    for pid in prefabs:
        n = switch.get(pid)
        res.append(n if isinstance(n, int) and 0 < n < len(modes) and SKILL_MODE_NAME.match(modes[n]) else None)
    return res if any(x is not None for x in res) else None


DIRECTIONAL = re.compile(r'_(up|down|left|back)(_|$)', re.I)
# sibling attack abilities the Selector picks one of per attack (wisdel Attack_A/B/C, siege2 Attack_1/2): the first stands for all
ALTERNATIVE = re.compile(r'^(attack|combat)_?([a-z]|\d+)$', re.I)
HIT_KEYS = ('_hitEffects', '_inputTargetEffects', '_castTargetEffects')
PROJ_HIT_KEYS = ('_effectsWhenHit', '_effectsWhenReached')
PROJ_SUB_KEYS = ('_projectileKey', '_subProjectileKey', '_childProjectileKey')
# operators whose mode GeneralAbilities buffs' effects join the mode's `attach` (session L 2026-10-08: 스펙터 디 언체인드 only
# until the user decides on the others the rule would change — research/2026-10-08-mount-points/README.md)
GENERAL_BUFF_CHARS = {'char_1023_ghost2'}


def load_tree(path):
    """[(GameObject path, MonoBehaviour typetree)] of a bundle (unreadable MonoBehaviours skipped)."""
    import aklz4  # noqa: F401  (registers the LZ4AK decoder)
    import UnityPy
    env = UnityPy.load(str(path))
    go_name, tr_of_go, parent, mb = {}, {}, {}, []
    for o in env.objects:
        t = o.type.name
        if t == 'GameObject':
            go_name[o.path_id] = o.read_typetree().get('m_Name')
        elif t == 'Transform':
            d = o.read_typetree()
            tr_of_go[d['m_GameObject']['m_PathID']] = o.path_id
            parent[o.path_id] = (d['m_GameObject']['m_PathID'], d['m_Father']['m_PathID'])
        elif t == 'MonoBehaviour':
            try:
                d = o.read_typetree()
            except Exception:
                continue
            mb.append((o.path_id, d))
    cache = {}

    def go_path(go):
        if go in cache:
            return cache[go]
        parts, tr = [], tr_of_go.get(go)
        while tr:
            g, father = parent[tr]
            parts.append(go_name.get(g) or '?')
            tr = father if father in parent else None
        cache[go] = '/'.join(reversed(parts))
        return cache[go]
    return [(go_path(d.get('m_GameObject', {}).get('m_PathID')), d, pid) for pid, d in mb], go_name


def effect_names(v):
    """Effect prefab names of an emitter list / projectile field (strings, or entries naming one)."""
    out = []
    items = v if isinstance(v, list) else [v]
    for x in items:
        if isinstance(x, str):
            out.append(x)
        elif isinstance(x, dict):
            if isinstance(x.get('_effects'), list):
                out += [e for e in x['_effects'] if isinstance(e, str)]
            for k in ('_effectKey', 'effectKey', '_key', '_effect'):
                if isinstance(x.get(k), str):
                    out.append(x[k])
    return out


def buff_effects(o, out=None):
    """The `overrideEffectKey` effect names of the buffs a MonoBehaviour declares."""
    out = [] if out is None else out
    if isinstance(o, dict):
        for k, v in o.items():
            if k == 'overrideEffectKey' and isinstance(v, str) and v:
                out.append(v)
            else:
                buff_effects(v, out)
    elif isinstance(o, list):
        for v in o:
            buff_effects(v, out)
    return out


def add(lst, names):
    for n in names:
        if n and not DIRECTIONAL.search(n) and n not in lst:
            lst.append(n)


class Projectiles:
    """Projectile prefabs ([uc]projectiles.ab, PersistentData first): key → { hit: [...], trail: [...] }."""
    def __init__(self, client):
        self.roots = {}
        for f in (Path(client) / 'PersistentData/Bundles/battle/prefabs/[uc]projectiles.ab',
                  Path(client) / 'StreamingAssets/AB/Windows/battle/prefabs/[uc]projectiles.ab'):
            if not f.exists():
                continue
            seen = set()
            for gp, d, _ in load_tree(f)[0]:
                root = gp.split('/')[0]
                if root in self.roots and root not in seen:
                    continue   # the newer bundle already had it
                seen.add(root)
                self.roots.setdefault(root, []).append(d)

    def effects(self, key, done=None):
        done = done if done is not None else set()
        out = {'hit': [], 'trail': [], 'start': []}
        if key in done:
            return out
        done.add(key)
        for d in self.roots.get(key, []):
            for k in PROJ_HIT_KEYS:
                add(out['hit'], effect_names(d.get(k)))
            add(out['trail'], effect_names(d.get('_mainEffect')))
            # on the target as the projectile starts (德克萨斯 S2's falling swords: projectile_sword_rain)
            add(out['start'], effect_names(d.get('_effectsToTargetWhenStart')))
            for k in PROJ_SUB_KEYS:
                if isinstance(d.get(k), str) and d[k]:
                    sub = self.effects(d[k], done)
                    for r in out:
                        add(out[r], sub[r])
        return out


def turned(o, out=None):
    """Effect names of the emitter entries that turn to the unit's facing (`_useFourDirectionalFace: 1` — the client turns
    the prefab's 'rotation_z' pivot: 野鬃 S2's thrust is stored pointing up)."""
    out = [] if out is None else out
    if isinstance(o, dict):
        if o.get('_useFourDirectionalFace') == 1 and isinstance(o.get('_effects'), list):
            add(out, [e for e in o['_effects'] if isinstance(e, str)])
        for v in o.values():
            turned(v, out)
    elif isinstance(o, list):
        for v in o:
            turned(v, out)
    return out


def own_buff_effects(d, key):
    """`overrideEffectKey`s of one buff list (`_buffs` on the caster, `_activeBuffs` on the targets)."""
    return [b['overrideEffectKey'] for b in (d.get(key) or []) if isinstance(b, dict) and isinstance(b.get('overrideEffectKey'), str) and b['overrideEffectKey']]


END_ABILITY = re.compile(r'^End', re.I)


def skill_effects(tree, projectiles=None):
    """{skill prefabId: { cast, castLoop, buff, target, targetBuff, end?, turn? }} from battle/prefabs/[uc]skills.ab — the
    effects a skill binds itself (local patch, user report 2026-10-07: 德克萨斯 S2 / 戴菲恩 S3 showed the wrong ones by name):
    cast = its abilities' `_castEffects` with `_oneshot 1` (once, on the caster), castLoop = `_oneshot 0` (while it casts),
    buff = its `_buffs`' effects (on the caster while the buff lasts), targetBuff = its `_activeBuffs`' (on each target hit),
    target = its `_hitEffects` + its projectiles' start / hit effects (on the targets). An ability named End… (戴菲恩 S3
    EndAttack: the finishing blow after the slashes) goes to `end` { cast, hit } instead. Directional copies are left out."""
    out = {}
    for gp, d, _ in tree:
        sid, _, rest = gp.partition('/')
        if not sid.startswith('sk'):
            continue
        e = out.setdefault(sid, {'cast': [], 'castLoop': [], 'buff': [], 'target': [], 'targetBuff': [], 'end': {'cast': [], 'hit': []}, 'turn': []})
        end = any(END_ABILITY.match(x) for x in rest.split('/') if x)
        for c in d.get('_castEffects') or []:
            if isinstance(c, dict):
                add(e['end']['cast'] if end else e['cast'] if c.get('_oneshot', 1) else e['castLoop'], effect_names(c))
        for k in HIT_KEYS:
            add(e['end']['hit'] if end else e['target'], effect_names(d.get(k) or []))
        add(e['buff'], own_buff_effects(d, '_buffs'))
        add(e['targetBuff'], own_buff_effects(d, '_activeBuffs'))
        if projectiles and isinstance(d.get('_projectileKey'), str) and d['_projectileKey']:
            p = projectiles.effects(d['_projectileKey'])
            add(e['end']['hit'] if end else e['target'], p['start'] + p['hit'])
        add(e['turn'], turned(d))
    for e in out.values():
        if not e['end']['cast'] and not e['end']['hit']:
            del e['end']
        if not e['turn']:
            del e['turn']
    return out


def modes_of(path, projectiles=None):
    """{ modes, proj, cast, hit, trail } of a charpack (per mode, in `_modes` order), or None:
    modes = the mode GameObject names; proj = the projectile keys under each mode; cast = the effects its attacks cast on
    the attacker; hit = those on the target (the emitters' hit lists + its own projectile's WhenHit / WhenReached); trail =
    that projectile's main effect; attach = the effects of the mode's own (Talents) buffs and the effects its abilities
    attach (`_attachEffects`, an ability's `_effects`), shown on the operator while it lasts. proj lists the mode's own shot first. Directional copies (_down_ …) are left out; of alternative attack abilities (Attack_A/B/C)
    only the first counts."""
    tree, go_name = load_tree(path)
    root = next((d for _, d, _ in tree if isinstance(d.get('_modes'), list) and d['_modes']), None)
    if root is None:
        return None
    by_pid = {pid: gp for gp, _, pid in tree}
    mode_paths = [by_pid.get(r.get('m_PathID')) or '' for r in root['_modes']]
    modes = [p.split('/')[-1] if p else '?' for p in mode_paths]
    n = len(modes)
    proj, cast, hit, trail, attach = ([[] for _ in range(n)] for _ in range(5))
    turn = []
    # alternatives: the first sibling (by name) of each parent stands for all
    alt_first = {}
    for gp, _, _ in tree:
        par, _, name = gp.rpartition('/')
        if ALTERNATIVE.match(name):
            alt_first[par] = min(alt_first.get(par, name), name)

    def skipped(gp):
        parts = gp.split('/')
        for k in range(1, len(parts)):
            par, name = '/'.join(parts[:k]), parts[k]
            if ALTERNATIVE.match(name) and alt_first.get(par) != name:
                return True
        return False

    def keys(o, out):
        if isinstance(o, dict):
            for k, v in o.items():
                if k in ('_projectileKey', '_duoProjectileKey') and isinstance(v, str) and v:
                    out.append(v)
                else:
                    keys(v, out)
        elif isinstance(o, list):
            for v in o:
                keys(v, out)
    for gp, d, _ in tree:
        i = next((k for k, mp in enumerate(mode_paths) if mp and (gp == mp or gp.startswith(mp + '/'))), None)
        if i is None:
            continue
        found = []
        keys(d, found)
        add(turn, turned(d))
        for k in found:
            if k not in proj[i]:
                proj[i].append(k)
        if skipped(gp):
            continue
        add(cast[i], effect_names(d.get('_castEffects') or []))
        for k in HIT_KEYS:
            add(hit[i], effect_names(d.get(k) or []))
        # the mode's own buffs (its Talents abilities: 丰川祥子 S3's oblvns_s_3[eff] → the range effect) show their effect on
        # the operator while the mode lasts; buffs an attack puts on its target (_activeBuffs) are not these. So do the
        # buffs of the mode's GeneralAbilities for GENERAL_BUFF_CHARS (local patch, user report 4 #4-7, session L
        # 2026-10-08: 스펙터 디 언체인드 S2's ghost_s_2[effect] → ghost2_skill_02_buff_02, the red ring on her saw, and buff_03)
        sub = gp[len(mode_paths[i]):] + '/'
        if '/Talents/' in sub or ('/GeneralAbilities/' in sub and Path(path).stem in GENERAL_BUFF_CHARS):
            add(attach[i], buff_effects(d))
        # effects a mode's abilities attach while they run: an emitter's `_attachEffects`, and an ability's own `_effects`
        # list (비르투오사 S3's GeneralAbilities: cello_skill_03_buff_01 / _front_02 / _range — her range)
        add(attach[i], effect_names(d.get('_attachEffects') or []))
        if isinstance(d.get('_effects'), list) and all(isinstance(x, str) for x in d['_effects']):
            add(attach[i], d['_effects'])
    # the mode's own shot first (projectile_chr_<name>[_default|_s<n>|_<X>]) — drones / talent shots after it; only that
    # projectile's hit / trail effects are the mode's (whitw2's funnels hit with their own when they fire)
    short = re.sub(r'^char_\d+_', '', Path(path).stem)
    main = re.compile(rf'^projectile_chr_{re.escape(short)}(_default|_s\d+|_[a-z])?$', re.I)
    for i in range(n):
        proj[i].sort(key=lambda k: 0 if main.match(k) else 1)
        if projectiles and proj[i]:
            e = projectiles.effects(proj[i][0])
            add(hit[i], e['hit'])
            add(trail[i], e['trail'])
    res = {'modes': modes, 'proj': proj, 'cast': cast, 'hit': hit, 'trail': trail, 'attach': attach}
    if turn:
        res['turn'] = turn
    return res


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--client', default=DEFAULT_CLIENT)
    ap.add_argument('--id', action='append', default=[])
    a = ap.parse_args()
    pack = Path(a.client) / 'StreamingAssets/AB/Windows/charpack'
    ids = a.id or pool_char_ids()
    out = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    out.pop('$comment', None)
    missing = []
    projectiles = Projectiles(a.client)
    prefabs = char_skill_prefabs()
    stree = skills_tree(a.client)
    switch = skill_switch_modes(stree)
    sk_fx = skill_effects(stree, projectiles)
    for cid in ids:
        f = pack / f'{cid}.ab'
        if not f.exists():
            missing.append(cid)
            continue
        try:
            m = modes_of(f, projectiles)
        except Exception as e:  # a pack that fails to load is reported, the old entry kept
            print(f'FAIL {cid}: {e}', file=sys.stderr)
            continue
        if m:
            sm = skill_modes_of(m['modes'], prefabs.get(cid) or [], switch)
            if sm:
                m['skillMode'] = sm
            # local patch: the skills' own effects (skills.ab), in skill order; a skill's turned effects join the operator's
            sks = [sk_fx.get(pid) or {} for pid in (prefabs.get(cid) or [])]
            if any(sks):
                m['skills'] = [{k: v for k, v in x.items() if k != 'turn'} for x in sks]
                turn = list(m.get('turn') or [])
                for x in sks:
                    add(turn, x.get('turn') or [])
                if turn:
                    m['turn'] = turn
            out[cid] = m
    doc = {'$comment': 'Operator attack modes (charpack _modes order: index n = audio bank attack.<n>) with their projectiles and '
                       'effect bindings (cast / hit / trail). Written by tools/local-extract/char_modes.py from the local client '
                       '(local patch); read by tools/assets/plan.mjs. The effect part also goes to public/assets/local/fx/modes.json.'}
    doc.update({k: out[k] for k in sorted(out)})
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    if FX_OUT.parent.exists():
        fx = {k: {f: v[f] for f in ('modes', 'skillMode', 'cast', 'hit', 'trail', 'attach', 'skills', 'turn') if f in v} for k, v in sorted(out.items())}
        FX_OUT.write_text(json.dumps(fx, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'{len(out)} operator(s) → {OUT.relative_to(ROOT)}' + (f' + {FX_OUT.relative_to(ROOT)}' if FX_OUT.parent.exists() else '')
          + f'; no charpack: {", ".join(missing) or "none"}')


if __name__ == '__main__':
    main()
