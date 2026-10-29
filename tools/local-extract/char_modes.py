#!/usr/bin/env python3
"""Operator attack modes from the local client (local patch, docs/LOCAL-PATCH.md 「스킬 모드 효과음」).

The official client sounds an operator's attacks through its attack mode: a bank `battle.<EVENT>.<charId>.attack.<n>`
where n is the mode's index in the character prefab's `_modes` list (charpack/char_*.ab: Default = 0, then the skill
modes in prefab order, e.g. 维什戴尔 [Default, S2, S2_Overload, S3] → S3's attacks sound `attack.3`). Which skill a mode
belongs to is in its name (`S<n>` + optional suffix), unless the skill's own prefab says otherwise: `skillMode`
[mode | null per skill] from the switch_mode buff in battle/prefabs/[uc]skills.ab (莫斯提马 [Default, S2]: S3 → 1); `skillEnd` [mode | null
per skill] = the mode the skill's buff switches to as it ends (config/buff_template_holder.ab, 蒂比 S2 → S2_Landing). audio_data.json does not carry this order, so the asset plan
(tools/assets/plan.mjs) reads it from tools/assets/local-char-modes.json, which this script writes — with the projectile
keys each mode's attack fires (`_projectileKey` under Modes/<name>/: a ranged mode's impact sound is its projectile's bank
`battle.ON_PROJECTILE_HIT.<key>`):
  { "char_1035_wisdel": { "modes": ["Default", "S2", "S2_Overload", "S3"],
                          "proj": [["projectile_chr_wisdel_default"], ["projectile_chr_wisdel_s2"], …] }, … }

Usage (from the repo root; --client = the EN client's Arknights_Data folder):
  .venv-extract/bin/python tools/local-extract/char_modes.py [--client <…/Arknights_Data>] [--id char_…]…
Without --id every operator of data/chess.json + the 선발 picks of data/backups.json. Everything is (c) Hypergryph; private fan use only.
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
from client_path import client_data  # noqa: E402
DEFAULT_CLIENT = client_data()  # SP_CLIENT / .env / .client (client_path.py); --client overrides


def diy_operators():
    """{charId: [skill prefabId, …]} of the 自选 operators — local patch (2026-10-08, maintainer's request): upstream 0.2.0 moved
    them from data/diy.json (gone) to data/backups.json `diy.operators` (the picks) with their forms under `units.<charId>.forms`
    (`'<phase>/<level>/<skillLevel>/<equip>'` → { skills }), so the 선발 operators (왕, 첸 더 던스트릭, 위셔델 …) were left out of
    every run since the merge and kept their pre-merge bindings. Skill order of the first form that lists skills."""
    path = ROOT / 'data/backups.json'
    if not path.exists():
        return {}
    d = json.loads(path.read_text(encoding='utf-8'))
    ops = (d.get('diy') or {}).get('operators') or {}
    units = d.get('units') or {}
    out = {}
    for cid in ops:
        if not (isinstance(cid, str) and cid.startswith('char_')):
            continue
        forms = (units.get(cid) or {}).get('forms') or {}
        sk = next((f['skills'] for f in forms.values() if isinstance(f, dict) and isinstance(f.get('skills'), list) and f['skills']), [])
        out[cid] = [x.get('prefabId') or x.get('skillId') for x in sk if isinstance(x, dict)]
    return out


def pool_char_ids():
    ids = set(diy_operators())
    chess = json.loads((ROOT / 'data/chess.json').read_text(encoding='utf-8'))
    recs = chess.get('chess', chess)
    for c in (recs.values() if isinstance(recs, dict) else recs):
        if isinstance(c, dict) and isinstance(c.get('charId'), str) and c['charId'].startswith('char_'):
            ids.add(c['charId'])
    return sorted(ids)


def skill_durations():
    """{skill prefabId: table duration} (data/chess.json, then the 自选 picks' forms of data/backups.json): > 0 a timed skill,
    0 / -1 none (an instant cast, charges, the next attack)."""
    out = {}
    d = json.loads((ROOT / 'data/chess.json').read_text(encoding='utf-8'))
    recs = d.get('chess', d) if isinstance(d, dict) else d
    skills = [s for c in (recs.values() if isinstance(recs, dict) else recs) if isinstance(c, dict) for s in c.get('skills') or []]
    path = ROOT / 'data/backups.json'
    if path.exists():
        for u in (json.loads(path.read_text(encoding='utf-8')).get('units') or {}).values():
            for f in ((u or {}).get('forms') or {}).values():
                skills += (f.get('skills') or []) if isinstance(f, dict) else []
    for s in skills:
        if isinstance(s, dict) and isinstance(s.get('duration'), (int, float)):
            out.setdefault(s.get('prefabId') or s.get('skillId'), s['duration'])
    return out


def char_skill_prefabs():
    """{charId: [skill prefabId, …]} in skill order (data/chess.json, then the 선발 picks of data/backups.json)."""
    out = {}
    d = json.loads((ROOT / 'data/chess.json').read_text(encoding='utf-8'))
    recs = d.get('chess', d) if isinstance(d, dict) else d
    for c in (recs.values() if isinstance(recs, dict) else recs):
        if not isinstance(c, dict) or not isinstance(c.get('charId'), str) or c['charId'] in out:
            continue
        sk = c.get('skills')
        if isinstance(sk, list) and sk:
            out[c['charId']] = [s.get('prefabId') or s.get('skillId') for s in sk if isinstance(s, dict)]
    for cid, sk in diy_operators().items():
        if cid not in out and sk:
            out[cid] = sk
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


BUFF_FINISH = 1  # Buff.Event.ON_BUFF_FINISH (the template's eventToActions key)


def buff_templates(client):
    """{templateKey: {event: [action node, …]}} of config/buff_template_holder.ab (PersistentData first), {} without it.
    The nodes are the `$type`-tagged JSON of each event's SerializedState."""
    import aklz4  # noqa: F401  (registers the LZ4AK decoder)
    import UnityPy
    out = {}
    for f in (Path(client) / 'PersistentData/Bundles/config/buff_template_holder.ab',
              Path(client) / 'StreamingAssets/AB/Windows/config/buff_template_holder.ab'):
        if not f.exists():
            continue
        for o in UnityPy.load(str(f)).objects:
            if o.type.name != 'MonoBehaviour':
                continue
            for t in o.read_typetree().get('_templates') or []:
                key = t.get('templateKey')
                if not isinstance(key, str) or key in out:
                    continue
                ev = {}
                for it in (t.get('eventToActions') or {}).get('_items') or []:
                    try:
                        ev[it['key']] = json.loads((it.get('value') or {}).get('SerializedState') or '[]')
                    except (KeyError, TypeError, ValueError):
                        pass
                out[key] = ev
        break
    return out


def skill_end_modes(tree, templates):
    """{skill prefabId: mode index} — 2026-10-29, official client: the mode a skill's own buff switches its owner to as
    it ends (a SwitchMode node with a fixed `_modeIndex` > 0 in the ON_BUFF_FINISH actions of a template its prefab names):
    蒂比 tippi_s_2[switch_mode] → S2_Landing, 蕾缪安 lemuen_s_3 → S3_End. That mode's attack runs at once (its landing / closing
    clip), so its START bank is the skill's end sound (tools/assets/skill-mode-sfx.mjs skillEnds). Only skills with one value."""
    found = {}

    def switches(o, acc):
        if isinstance(o, dict):
            if str(o.get('$type', '')).endswith('+SwitchMode') and not o.get('_loadModeFromBlackboard') and not o.get('_restoreDefault'):
                n = o.get('_modeIndex')
                if isinstance(n, int) and n > 0:
                    acc.add(n)
            for v in o.values():
                switches(v, acc)
        elif isinstance(o, list):
            for v in o:
                switches(v, acc)

    def walk(o, sid):
        if isinstance(o, dict):
            tk = o.get('templateKey')
            if isinstance(tk, str) and tk in templates:
                switches(templates[tk].get(BUFF_FINISH) or [], found.setdefault(sid, set()))
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
# 2026-10-11, official client: an attack mode's hits on its targets — `_inputTargetEffects` (InputTargetEffectOptions,
# a CastEffectOptions: on the ability's main target at its `_startEvent`, client `InputTargetEffectOptions.CreateEffect`)
# are the mode's `input`, not hits
MODE_HIT_KEYS = ('_hitEffects', '_castTargetEffects')
# a 要塞's attack abilities (charpack `Modes/<mode>/Body/Attack/`): the melee ones while it blocks, the ranged ones otherwise
MELEE_ABILITY = re.compile(r'^(Blocked)?MeleeAttack$')
RANGED_ABILITY = re.compile(r'^(Blocked|Self)?RangedAttack$')
# 2026-10-21: an attack ability fired at a placed coordinate token (新约能天使 S3FireToToken: her S3's opening strike, _animKey
# Skill_3_Skill, beside its Common attack) is no attack of the mode: the kit sends it as its own event (render/fx/kitofficial.js
# 'airstrike'), so its casts stay out of the mode's attack lists (its projectile is still listed in `proj`)
TOKEN_FIRE = re.compile(r'FireToToken$')
PROJ_HIT_KEYS = ('_effectsWhenHit', '_effectsWhenReached')
PROJ_SUB_KEYS = ('_projectileKey', '_subProjectileKey', '_childProjectileKey')
# a drone's ability GameObject (Funnel, Funnel_0, Funnel1, S1Funnel2, S2Funnel — not the attack that leads them: M0FunnelsNormalAttack)
FUNNEL = re.compile(r'^(S\d)?Funnel_?\d*$')


def load_tree(path, comp_index=False):
    """[(GameObject path, MonoBehaviour typetree)] of a bundle (unreadable MonoBehaviours skipped). `comp_index`: each
    typetree also gets `$comp`, its index in its GameObject's component list (the order `GetComponent<T>` searches)."""
    import aklz4  # noqa: F401  (registers the LZ4AK decoder)
    import UnityPy
    env = UnityPy.load(str(path))
    go_name, tr_of_go, parent, mb, comp_at = {}, {}, {}, [], {}
    for o in env.objects:
        t = o.type.name
        if t == 'GameObject':
            g = o.read_typetree()
            go_name[o.path_id] = g.get('m_Name')
            if comp_index:
                for i, c in enumerate(g.get('m_Component') or []):
                    comp_at[(c.get('component') or {}).get('m_PathID')] = i
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
    if comp_index:
        for pid, d in mb:
            if pid in comp_at:
                d['$comp'] = comp_at[pid]
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


# 2026-10-21 (maintainer decision 2026-10-21, official client): buffs an ability hands to others, not ones its owner holds — an
# attack's `_activeBuffs` (on its targets) and a PassiveAttachmentAbility's `_additiveActiveBuffs` (field tooltip: "added to
# the target ability as active buffs"; its DoAttach, gives them to its AbilityAttachment): 마운틴's talent
# f12yin_t_1[reduceAtk] → buff_weak sits on the enemy her attack hits (the sim's 'weaken' status draws it), never on her
TARGET_BUFF_KEYS = ('_activeBuffs', '_additiveActiveBuffs')


def held_buff_effects(d):
    """The `overrideEffectKey` effects of the buffs an ability puts on its owner / its selection (buff_effects without
    TARGET_BUFF_KEYS)."""
    return buff_effects({k: v for k, v in d.items() if k not in TARGET_BUFF_KEYS}) if isinstance(d, dict) else []


def add(lst, names):
    for n in names:
        if n and not DIRECTIONAL.search(n) and n not in lst:
            lst.append(n)


class Projectiles:
    """Projectile prefabs ([uc]projectiles.ab, PersistentData first): key → { hit: [...], trail: [...], start: [...],
    zone: [...], onProj, aura: [...] } — `hit` = its `_effectsWhenHit`, `_effectsWhenReached` and a shot's
    `_effectsWhenStop`; `zone` = its `_effectsWhenReached` when `_clearReachedEffectWhenStop` is set (they
    last until the projectile stops: client `EffectBehaviour.OnProjectileReached` / `OnProjectileStop`), `onProj` its
    `_setReachEffectOnProjectile` (1: parented to the projectile's body, moving with it), `aura` a ScalableAuraHitBehaviour's
    `_effectKey` (made under the projectile's body, scaled to its range, ended at its stop)."""
    def __init__(self, client):
        self.roots = {}
        for f in (Path(client) / 'PersistentData/Bundles/battle/prefabs/[uc]projectiles.ab',
                  Path(client) / 'StreamingAssets/AB/Windows/battle/prefabs/[uc]projectiles.ab'):
            if not f.exists():
                continue
            seen = set()
            for gp, d, _ in load_tree(f, comp_index=True)[0]:
                root = gp.split('/')[0]
                if root in self.roots and root not in seen:
                    continue   # the newer bundle already had it
                seen.add(root)
                d['$onRoot'] = gp == root
                self.roots.setdefault(root, []).append(d)

    def effects(self, key, done=None):
        done = done if done is not None else set()
        out = {'hit': [], 'trail': [], 'start': [], 'zone': [], 'aura': [], 'onProj': 0, 'line': [], 'first': [], 'lineHit': None}
        if key in done:
            return out
        done.add(key)
        # the chain graphic the hit plays: ChainLightningHitBehaviour.get_effect = GetComponent — the first
        # ChainLightningEffectBehaviour of the root's components (溯光星源 S1's projectile has two, the first on the hit points)
        graphics = [d for d in self.roots.get(key, []) if '_playSpecialEffectOnFirstOne' in d]
        graphic = min((d for d in graphics if d.get('$onRoot')), key=lambda d: d.get('$comp', 1 << 30), default=None) \
            or (graphics[0] if graphics else None)
        for d in self.roots.get(key, []):
            for k in PROJ_HIT_KEYS:
                add(out['hit'], effect_names(d.get(k)))
            # a chain's graphic (ChainLightningEffectBehaviour, below) is no flying trail: its `_mainEffect` is the line
            if '_playSpecialEffectOnFirstOne' not in d:
                add(out['trail'], effect_names(d.get('_mainEffect')))
            # on the target as the projectile starts (德克萨斯 S2's falling swords: projectile_sword_rain)
            add(out['start'], effect_names(d.get('_effectsToTargetWhenStart')))
            # 2026-10-10, official client: 쏜즈 더 로드스타's token / range lasted the whole battle: the reach
            # effects that end with the projectile, and its scalable aura
            # 2026-10-16: `_effectsWhenStop` play where the projectile stops (client `EffectBehaviour.OnProjectileStop`):
            # a shot stops at its hit (维什戴尔's blasts wisdel_attack_01_hit_02 …). A lasting one's are left out: it stops
            # when it ends, and none of the pool's modes or skills has such (伊内丝's are her talent device's)
            if d.get('_clearReachedEffectWhenStop') == 1:
                add(out['zone'], effect_names(d.get('_effectsWhenReached')))
                out['onProj'] |= 1 if d.get('_setReachEffectOnProjectile') == 1 else 0
            else:
                add(out['hit'], effect_names(d.get('_effectsWhenStop')))
            if '_onlyCheckHitWhenReachTarget' in d and isinstance(d.get('_effectKey'), str) and d['_effectKey']:
                add(out['aura'], [d['_effectKey']])
            # a chain's graphic (ChainLightningEffectBehaviour: 异客 S3 projectile_chr_pasngr_s3, and the chain casters' attack
            # shots projectile_leizi / projectile_chr_pasngr …): `_mainEffect` is one line through the struck units in order
            # (`PlayLineEffect` — the shooter is not on it), `_specialHitEffect` plays on the first one of each
            # chain when `_playSpecialEffectOnFirstOne` is set. 2026-10-16: it was also the trail before, and 异客's attacks /
            # 惊蛰 S2's flew the line as their shot
            # 2026-10-16: only the graphic the hit plays; `lineHit` = its `_playEffectOnHitPoint` (PlayLineEffect: 1 =
            # each unit's hit point, 0 = its transform's position — the feet)
            if d is graphic:
                add(out['line'], effect_names(d.get('_mainEffect')))
                if out['line'] and out['lineHit'] is None:
                    out['lineHit'] = 1 if d.get('_playEffectOnHitPoint') == 1 else 0
                if d.get('_playSpecialEffectOnFirstOne') == 1:
                    add(out['first'], effect_names(d.get('_specialHitEffect')))
            for k in PROJ_SUB_KEYS:
                if isinstance(d.get(k), str) and d[k]:
                    sub = self.effects(d[k], done)
                    for r in out:
                        if r == 'onProj':
                            out[r] |= sub[r]
                        elif r == 'lineHit':
                            out[r] = sub[r] if out[r] is None else out[r]
                        else:
                            add(out[r], sub[r])
        return out


def hit_groups(d):
    """2026-10-16, official client — a MultiHitUberEffectEmitter's per-strike hits, or None: `MultiHitUberEffectEmitter
    .OnCastOnTarget` plays `_hitGroups[n].effects` on the target of the cast's n-th strike (the ability's
    `spellCnt`: 0 at the cast start, +1 after each strike — AbilityStandard `_DoCast`), the last group past the end;
    `_useLoopHitEffect` n modulo the groups, `_useRandomHitEffect` a random group; the emitter's own `_hitEffects` too only
    with `_keepBaseHitEffect`. { g: [[names] per group], loop?, rand?, keep? }"""
    groups = d.get('_hitGroups')
    if not isinstance(groups, list) or not groups:
        return None
    g = []
    for x in groups:
        names = []
        add(names, effect_names((x or {}).get('effects') or []) if isinstance(x, dict) else [])
        g.append(names)
    if not any(g):
        return None
    out = {'g': g}
    for k, f in (('loop', '_useLoopHitEffect'), ('rand', '_useRandomHitEffect'), ('keep', '_keepBaseHitEffect')):
        if d.get(f) == 1:
            out[k] = 1
    return out


def strike_projectiles(d):
    """2026-10-16, official client — the projectile of each strike of a MultiRangedAttack, or None when every strike shoots
    its `_projectileKey`: `MultiRangedAttack.GetProjectileKey` for strike n (`spellCnt`) of `_additionalTimes`
    + 1 is `_hookTheLastProjectile` on the last one (when set), else `_additionalProjectiles[n − 1]` (clamped) with
    `_useMultiAdditionalProjectiles`, else `_additionalProjectile` for n > 0, else `_projectileKey` (伺夜 S3's three arrows
    projectile_chr_vigil_s3_1 / _2 / _3, 至简 S2's projectile_chr_malist_s1s2 then _s2_2)."""
    base = d.get('_projectileKey')
    if not isinstance(base, str) or not base:
        return None
    times = int(d.get('_additionalTimes') or 0)
    multi = [x for x in d.get('_additionalProjectiles') or [] if isinstance(x, str) and x]
    one, last = d.get('_additionalProjectile') or '', d.get('_hookTheLastProjectile') or ''
    keys = []
    for n in range(times + 1):
        if n == times and last:
            keys.append(last)
        elif d.get('_useMultiAdditionalProjectiles') == 1 and multi and n > 0:
            keys.append(multi[min(n - 1, len(multi) - 1)])
        elif n > 0 and one:
            keys.append(one)
        else:
            keys.append(base)
    return keys if any(k != base for k in keys) else None


def shot_groups(projectiles, keys, base_hits, d=None):
    """hitGroups of a MultiRangedAttack's strikes (strike_projectiles): each strike's projectile hits (`g`), trail
    (`shots`) and effects on the target as it leaves (`starts`: 迷迭香's second shot projectile_chr_rosmon_B
    rosmon_attack_B_hit_01), `base` = the ability's own hits (on every strike)."""
    g, shots, starts = [], [], []
    for k in keys:
        e = projectiles.effects(k)
        g.append([x for x in e['hit'] if x not in e['zone']])
        shots.append([x for x in e['trail'] if x not in e['line']])
        starts.append([x for x in e['start'] if x not in e['zone']])
    out = {'g': g, 'base': base_hits, 'shots': shots}
    if any(starts):
        out['starts'] = starts
    # the time between two strikes (`_triggerDelta`, MultiRangedAttack.OnWaitForTriggerDelta)
    dt = (d or {}).get('_triggerDelta')
    if isinstance(dt, (int, float)) and dt > 0:
        out['dt'] = round(float(dt), 4)
    return out


def group_hit_entries(d):
    """The HitEffectOptions entries of a MultiHitUberEffectEmitter's `_hitGroups` (their loop end / aim, as `_hitEffects`')."""
    return [c for x in d.get('_hitGroups') or [] if isinstance(x, dict) for c in x.get('effects') or [] if isinstance(c, dict)]


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


def dir_groups(o, out=None):
    """local patch (maintainer report, maintainer's decision 2026-10-08 「13명 전체」): an effect emitter entry's `_effects` is a
    slot list — 0 UP, 1 RIGHT, 2 DOWN, 3 LEFT (스펙터 디 언체인드 S3 `_up` / `_down`, 백파이프 S3 `_right` / `_left`) — and its
    `_directionType` (UberEffectEmitter.EffectOptions.DirectionType: 0 NONE, 1 L_OR_R, 2 U_OR_D, 3 FOUR_DIR, 4 UD_OR_LR,
    5 FOUR_DIR_FIXED — the enum's values in the official client, 2026-10-10; 6 L_OR_R_NOT_UD is another enum's) says which slot
    plays for the owner's facing (render/fxgame.js dirPick). `add()` drops `_up` / `_down` / `_left` / `_back` names and keeps the others side by
    side, so both copies of 아르케토 S3 `start_02` (UP) / `start_02_B` played at once. The entries naming more than one
    effect: [{ t: directionType, s: [up, right, down, left] }]."""
    out = [] if out is None else out
    if isinstance(o, dict):
        eff = o.get('_effects')
        if isinstance(o.get('_directionType'), int) and isinstance(eff, list) and all(isinstance(e, str) for e in eff):
            slots = (list(eff) + ['', '', '', ''])[:4]
            g = {'t': o['_directionType'], 's': slots}
            if len({e for e in slots if e}) > 1 and g not in out:
                out.append(g)
        for v in o.values():
            dir_groups(v, out)
    elif isinstance(o, list):
        for v in o:
            dir_groups(v, out)
    return out


def own_buff_effects(d, key):
    """`overrideEffectKey`s of one buff list (`_buffs` on the caster, `_activeBuffs` on the targets)."""
    return [b['overrideEffectKey'] for b in (d.get(key) or []) if isinstance(b, dict) and isinstance(b.get('overrideEffectKey'), str) and b['overrideEffectKey']]


END_ABILITY = re.compile(r'^End', re.I)
# a rope / link line a projectile stretches between two units (歌蕾蒂娅 S1 glady_skill_01_line, 溯光星源 S2
# halo2_skill_02_line_01), not the shot that flies [ASSUMED: by name — no prefab field tells them apart]
LINE_FX = re.compile(r'_line(_|$)', re.I)


def skill_effects(tree, projectiles=None):
    """{skill prefabId: { cast, castLoop, buff, target, targetBuff, end?, turn? }} from battle/prefabs/[uc]skills.ab — the
    effects a skill binds itself (local patch, maintainer report 2026-10-07: 德克萨斯 S2 / 戴菲恩 S3 showed the wrong ones by name;
    `zone` 2026-10-10: its projectile's reach effects that last until the projectile stops + its aura — Projectiles):
    cast = its abilities' `_castEffects` with `_oneshot 1` (once, on the caster), castLoop = `_oneshot 0` (while it casts),
    buff = its `_buffs`' effects (on the caster while the buff lasts), targetBuff = its `_activeBuffs`' (on each target hit),
    target = its `_hitEffects` + its projectiles' start / hit effects (on the targets), shot = its projectiles' `_mainEffect`
    (2026-10-16: 号角 S1's projectile_chr_horn_s1 flew as a procedural arrow; a chain's line left out, LINE_FX names last — main()
    keeps it for a skill without duration only, see there) and shotHit = the hits of the ability whose projectile shot[0] is
    (its `_hitEffects` + that projectile's start / hit effects); chain = a lasting projectile's chain graphic { line, first,
    hit: 1 its line through the hit points, 0 the feet }. An ability named End… (戴菲恩 S3 EndAttack: the finishing blow
    after the slashes) goes to `end` { cast, hit } instead. Directional copies are left out."""
    out = {}
    for gp, d, _ in tree:
        sid, _, rest = gp.partition('/')
        if not sid.startswith('sk'):
            continue
        e = out.setdefault(sid, {'cast': [], 'castLoop': [], 'buff': [], 'target': [], 'targetBuff': [], 'end': {'cast': [], 'hit': []}, 'turn': [], 'dirs': []})
        end = any(END_ABILITY.match(x) for x in rest.split('/') if x)
        for c in d.get('_castEffects') or []:
            if isinstance(c, dict):
                add(e['end']['cast'] if end else e['cast'] if c.get('_oneshot', 1) else e['castLoop'], effect_names(c))
        hg = hit_groups(d)
        if not end:   # (2026-10-21) the hits of every component of this GameObject (shotHit below)
            gh = e.setdefault('_gpHits', {}).setdefault(gp, [])
            for k in HIT_KEYS:
                add(gh, effect_names(d.get(k) or []))
        for k in HIT_KEYS:
            if k != '_hitEffects' or not hg or hg.get('keep'):
                add(e['end']['hit'] if end else e['target'], effect_names(d.get(k) or []))
        if hg and not end and 'hitGroups' not in e:
            e['hitGroups'] = hg   # 2026-10-16: the skill's per-strike hits (阿斯卡纶 S1 skchr_ascln_1)
        sp = strike_projectiles(d) if projectiles and not end else None
        if sp and 'hitGroups' not in e:
            own = []
            for k in HIT_KEYS:
                add(own, effect_names(d.get(k) or []))
            e['hitGroups'] = shot_groups(projectiles, sp, own, d)   # its strikes' shots (至简 S2)
        add(e['buff'], own_buff_effects(d, '_buffs'))
        # 2026-10-24 (묶음 S4): an aura ability's own `_effects` (AuraAbility, the list token_auras reads for a summon's skill)
        # sit on the caster while the skill holds the ability — 浊心斯卡蒂 S3 skadi2_skill_03_buff_03, 塞雷娅 S3
        # demkni_skill_03_self, 深靛 S2 indigo_skill_02_buff_04, which the `_buff` / `_range` name rule left out
        if isinstance(d.get('_effects'), list) and ('_buffs' in d or '_passiveBuffs' in d):
            add(e['buff'], [x for x in d['_effects'] if isinstance(x, str) and x])
        add(e['targetBuff'], own_buff_effects(d, '_activeBuffs'))
        if projectiles and isinstance(d.get('_projectileKey'), str) and d['_projectileKey']:
            p = projectiles.effects(d['_projectileKey'])
            add(e['end']['hit'] if end else e['target'], [x for x in p['start'] + p['hit'] if x not in p['zone']])
            if not end:
                fly = [x for x in p['trail'] if x not in p['line']]
                add(e.setdefault('shot', []), fly)
                hits = []
                for k in HIT_KEYS:
                    add(hits, effect_names(d.get(k) or []))
                add(hits, [x for x in p['start'] + p['hit'] if x not in p['zone']])
                e.setdefault('_shots', []).append((fly, hits, gp))
            if p['zone'] or p['aura']:
                z = e.setdefault('zone', {'fx': [], 'aura': [], 'onProj': 0})
                add(z['fx'], p['zone'])
                add(z['aura'], p['aura'])
                z['onProj'] |= p['onProj']
            if p['zone'] and (p['line'] or p['first']):
                c = e.setdefault('chain', {'line': [], 'first': []})
                add(c['line'], p['line'])
                add(c['first'], p['first'])
                if p['lineHit'] is not None and 'hit' not in c:
                    c['hit'] = p['lineHit']
        add(e['turn'], turned(d))
        dir_groups(d, e['dirs'])
    for e in out.values():
        shots = e.pop('_shots', [])
        gp_hits = e.pop('_gpHits', {})
        if e.get('shot'):
            e['shot'].sort(key=lambda x: 1 if LINE_FX.search(x) else 0)
            # the hits of the projectile the shot is (维什戴尔 S1: S1_Common's, not the aftershocks' S1_Shock); none (号角 S1's
            # shell: its flare's hit comes after) leaves the hit to the name rule. (2026-10-21) With the hits of the effect
            # emitter beside the ability on its GameObject: 能天使 S1 skchr_angel_1's UberEffectEmitter `_hitEffects`
            # angle_attack_02_hit (the ability that shoots projectile_angel has none of its own)
            hit = next((h + [x for x in gp_hits.get(g, []) if x not in h] for fly, h, g in shots if e['shot'][0] in fly), [])
            if hit:
                e['shotHit'] = hit
        else:
            e.pop('shot', None)
        if not e['end']['cast'] and not e['end']['hit']:
            del e['end']
        if not e['turn']:
            del e['turn']
        if not e['dirs']:
            del e['dirs']
    return out


def ability_groups(tree, mode_paths, by_pid, projectiles=None):
    """2026-10-21, official client (이펙트 연결 전수 ②): the ability groups of each mode that cast one child per attack —
    client `AbilityRandomGroup` (`_selectMethod`, `_abilities`; `_GetAbilityInternal`): Random (0) any child,
    `_diffFromLastOneIfNotFirst` any but the one just cast (by object), Loop (1) in turn with `m_loopIndex` + 1 read
    first (the first attack after an attach is child 1: `Reset`). Returns (groups, own) — groups[mode] = { pick:
    'random' | 'other' | 'loop', from?: 1, combat?: 1 (a Body/Combat group: the COMBAT state's), groups: [{ anim, cast, hit,
    start }] } with each child's own effects (those not every child has: its `_castEffects`, its hits — `_hitEffects`,
    `_castTargetEffects`, its projectile's hit —, its projectile's `_effectsToTargetWhenStart`), anim = the child's clip key
    (`_animKey`, else its ThreePartOneshotAnimation's `_oneshotAnim`); own[mode] = the set of those names (the mode's lists
    hold the first child's: char_modes reads it as the mode's). castOpt / castTgt of every child go to `timing` / `tgt`."""
    n = len(mode_paths)
    out, own, timing, tgt = [None] * n, [set() for _ in range(n)], [{} for _ in range(n)], []
    for gp, d, _ in tree:
        if not (isinstance(d.get('_selectMethod'), int) and isinstance(d.get('_abilities'), list)):
            continue
        i = next((k for k, mp in enumerate(mode_paths) if mp and (gp == mp or gp.startswith(mp + '/'))), None)
        if i is None:
            continue
        alts = []
        for r in d['_abilities']:
            p = by_pid.get(r.get('m_PathID')) if isinstance(r, dict) else None
            if p and p not in alts:
                alts.append(p)
        if len(alts) < 2:
            continue
        sets = []
        for ap in alts:
            cast, hit, start, anim = [], [], [], ''
            for gq, x, _ in tree:
                if gq != ap and not gq.startswith(ap + '/'):
                    continue
                if gq == ap:
                    for k in ('_animKey', '_oneshotAnim'):
                        if not anim and isinstance(x.get(k), str) and x[k]:
                            anim = x[k]
                add(cast, effect_names(x.get('_castEffects') or []))
                for k in MODE_HIT_KEYS:
                    add(hit, effect_names(x.get(k) or []))
                add(tgt, effect_names(x.get('_castTargetEffects') or []))
                cast_target_timing(x, timing[i])
                for c in x.get('_castEffects') or []:
                    if isinstance(c, dict):
                        for e in c.get('_effects') or []:
                            if isinstance(e, str) and e:
                                timing[i].setdefault(e, cast_timing(c))
                pk = x.get('_projectileKey')
                if projectiles and isinstance(pk, str) and pk:
                    pe = projectiles.effects(pk)
                    add(hit, pe['hit'])
                    add(start, [e for e in pe['start'] if e not in pe['zone']])
            sets.append({'anim': anim, 'cast': cast, 'hit': hit, 'start': start})
        common = {r: set.intersection(*(set(s[r]) for s in sets)) for r in ('cast', 'hit', 'start')}
        groups = [{'anim': s['anim'], **{r: [e for e in s[r] if e not in common[r]] for r in ('cast', 'hit', 'start')}} for s in sets]
        if not any(g['cast'] or g['hit'] or g['start'] for g in groups):
            continue
        for g in groups:
            own[i].update(g['cast'], g['hit'], g['start'])
        loop = d['_selectMethod'] == 1
        other = not loop and d.get('_diffFromLastOneIfNotFirst') == 1 and not d.get('_selectAllAtLeastOnce') and not d.get('_isConfigurableProb')
        e = {'pick': 'loop' if loop else 'other' if other else 'random', **({'from': 1} if loop else {})}
        if '/Body/Combat' in gp[len(mode_paths[i]):]:
            e['combat'] = 1
        e['groups'] = [{k: v for k, v in g.items() if v} for g in groups]
        out[i] = e   # [추정: one group per mode — none has two]
    return out, own, timing, tgt


def mode_parts(tree, mode_paths, projectiles=None):
    """2026-10-21 (이펙트 연결 전수 ①·②): two kinds of ability a mode casts in place of its attack, whose effects are not the
    attack's (before, they went into the mode's lists and played with every attack). Returns (talent, side, gos, projs,
    timing):
      talent[mode] = { 'T.<n>': { cast, trail, hit } } — a mode talent (charpack `Body/Talents/<n>` with `_isModeTalent` 1):
        寒芒克洛丝's 中的 (`_probKey` prob: the client casts it instead of the attack — its arrow projectile_chr_kroos2_2 and
        kroos2_attack_start_02), 圣约送葬人's 受选之人 shot; the sim marks such a swing and its 'atk' events with 'T.<n>'.
      side[mode] = { ally: { cast, trail, hit }, foe: { … } } — the children of the mode's attack (`Body/Attack/<child>`) whose
        own Trigger picks one side (`_targetSide` 1 allies / 2 enemies), when both sides are there: 凯尔希·思衡托 S2 HealAlly /
        AttackEnemy (projectile_chr_kalts2_s2_heal / _dmg, start_heal / start_damage) — the attack takes the one of its target.
      gos = the GameObject paths of those abilities (and below), projs[mode] = their projectile keys, timing[mode] = their
      cast effects' castOpt."""
    n = len(mode_paths)
    talent, side, projs, timing = [None] * n, [None] * n, [set() for _ in range(n)], [{} for _ in range(n)]
    gos = set()
    by_go = {}
    for gp, d, _ in tree:
        by_go.setdefault(gp, []).append(d)

    def collect(i, ap):
        cast, hit, trail = [], [], []
        for gq, comps in by_go.items():
            if gq != ap and not gq.startswith(ap + '/'):
                continue
            gos.add(gq)
            for x in comps:
                add(cast, effect_names(x.get('_castEffects') or []))
                for k in MODE_HIT_KEYS:
                    add(hit, effect_names(x.get(k) or []))
                for c in x.get('_castEffects') or []:
                    if isinstance(c, dict):
                        for e in c.get('_effects') or []:
                            if isinstance(e, str) and e:
                                timing[i].setdefault(e, cast_timing(c))
                pk = x.get('_projectileKey')
                if isinstance(pk, str) and pk:
                    projs[i].add(pk)
                    if projectiles:
                        pe = projectiles.effects(pk)
                        add(trail, pe['trail'])
                        add(hit, pe['hit'])
        return {'cast': cast, 'trail': trail, 'hit': hit}

    for i, mp in enumerate(mode_paths):
        if not mp:
            continue
        tal, sides = {}, {}
        for gp, comps in by_go.items():
            sub = gp[len(mp):] if gp.startswith(mp + '/') else None
            if sub is None:
                continue
            parts = sub.strip('/').split('/')
            if len(parts) == 3 and parts[:2] == ['Body', 'Talents'] and parts[2].isdigit() and any(x.get('_isModeTalent') == 1 for x in comps):
                tal[f'T.{parts[2]}'] = gp
            if len(parts) == 3 and parts[:2] == ['Body', 'Attack']:
                ts = [x.get('_targetSide') for x in by_go.get(gp + '/Trigger', []) if x.get('_targetSide') in (1, 2)]
                if ts:
                    sides.setdefault('ally' if ts[0] == 1 else 'foe', gp)
        if tal:
            talent[i] = {k: collect(i, ap) for k, ap in sorted(tal.items())}
        if len(sides) == 2:
            side[i] = {k: collect(i, ap) for k, ap in sorted(sides.items())}
    return talent, side, gos, projs, timing


def cast_timing(c):
    """{ s, e, o, d?, once?, t?, p? } of a CastEffectOptions entry (castOpt): t = an InputTargetEffectOptions (on the main
    target), p = its `_useInputPos`; t 2 = a CastTargetEffectOptions (on each cast target: cast_target_timing)."""
    opt = {'s': c.get('_startEvent', 2), 'e': c.get('_endEvent', 3), 'o': c.get('_oneshot', 1)}
    if isinstance(c.get('_delayIfFirstAttack'), (int, float)) and c['_delayIfFirstAttack'] > 0:
        opt['d'] = round(float(c['_delayIfFirstAttack']), 4)
    if c.get('_onlyOnce') == 1:
        opt['once'] = 1
    if '_useInputPos' in c:
        opt['t'] = 1
        if c.get('_useInputPos') == 1:
            opt['p'] = 1
    return opt


def cast_target_timing(d, out):
    """2026-10-26: the castOpt of ability `d`'s `_castTargetEffects` into `out` { name: timing } with t: 2 — a
    CastTargetEffectOptions is a CastEffectOptions created on each of the ability's cast targets (client
    `CastTargetEffectOptions.PlayEffect`): at its `_startEvent` (酒神 phatm2_attack_hit_aim_01 ON_CAST_START, 凛御银灰
    svash2_attack_hit_01 ON_SPELL_ON), a loop one until its `_endEvent`."""
    for c in d.get('_castTargetEffects') or []:
        if isinstance(c, dict):
            for x in c.get('_effects') or []:
                if isinstance(x, str) and x:
                    out.setdefault(x, {**cast_timing(c), 't': 2})


def modes_of(path, projectiles=None):
    """{ modes, proj, cast, hit, trail } of a charpack (per mode, in `_modes` order), or None:
    modes = the mode GameObject names; proj = the projectile keys under each mode; cast = the effects its attacks cast on
    the attacker; hit = those on the target (the emitters' hit lists + its own projectile's WhenHit / WhenReached); trail =
    that projectile's main effect (hitGroups: the mode's per-strike hits — hit_groups, 2026-10-16; tgtStart: its shot's effects on the target as it leaves; chain: a chain shot's line through its targets, chainHit: 1 when it runs through their hit points, 0 their feet; shotFrom: the MountPointType it leaves from when not MUZZLE; castOpt: each cast effect's
    start / end events — 2026-10-10); attach = the effects of the mode's own (Talents, GeneralAbilities, its UnitMode's
    `_generalAbilities`) buffs — not the ones they hand to others (TARGET_BUFF_KEYS) — and the effects its abilities attach
    (`_attachEffects`, an ability's `_effects`), shown on the operator while it lasts (the Default mode's too: fxmap.js
    defaultModeEffects, 2026-10-21). proj lists the mode's own shot first. Directional copies (_down_ …) are left out; of alternative attack abilities (Attack_A/B/C)
    only the first counts — an ability group's (ability_groups, 2026-10-21) go to altFx with each child's own effects, and a
    mode with a Body/Combat ability splits its casts / hits into combatSplit."""
    tree, go_name = load_tree(path)
    root = next((d for _, d, _ in tree if isinstance(d.get('_modes'), list) and d['_modes']), None)
    if root is None:
        return None
    by_pid = {pid: gp for gp, _, pid in tree}
    mode_paths = [by_pid.get(r.get('m_PathID')) or '' for r in root['_modes']]
    modes = [p.split('/')[-1] if p else '?' for p in mode_paths]
    n = len(modes)
    proj, cast, hit, trail, attach, chain, tgt_start = ([[] for _ in range(n)] for _ in range(7))
    chain_hit = [None] * n
    strikes = [None] * n   # 2026-10-16: per mode, its attack's per-strike hits (hit_groups) or shots (strike_projectiles)
    multi = {}
    turn = []
    dirs = []
    # local patch (maintainer report 2026-10-08: 스펙터 디 언체인드's 替身): `attachFoe` = the part of `attach` from buffs of
    # an ability that targets enemies (`_targetOptions.targetSide` 2 on the same GameObject — ghost2_t_1[stand]'s
    # beidong_buff_02 shows on the enemies it hits, not on her); `dollBorn` = the 替身's appearance (`[switch2stand]/StandBorn`
    # `_castEffects`: ghost2_birth_01_start, the blue swirl)
    foe_go = {d['m_GameObject']['m_PathID'] for _, d, _ in tree
              if isinstance(d.get('_targetOptions'), dict) and d['_targetOptions'].get('targetSide') == 2}
    mb = {pid: d for _, d, pid in tree}

    def selects_foes(d):
        """2026-10-10, official client: 아스트젠 더 라이트체이서 S3: whether an ability's `_selector`
        (`Ability._selector`) picks enemies — every range selector of its `_rangeSelectorsList` (or the selector itself)
        with a `_targetSide` says 2. halo2's S3 LinkEnemy: HasBuff / NewBuff, `_targetSide 2`, `_maxNum 1` — its buff's
        effect `halo2_skill_03_buff_02` sits on that one enemy (a buff effect's owner is the unit holding the buff)."""
        sel = d.get('_selector')
        sd = mb.get(sel.get('m_PathID')) if isinstance(sel, dict) and sel.get('m_PathID') else None
        if not isinstance(sd, dict):
            return False
        subs = [mb.get(r.get('m_PathID')) for r in sd.get('_rangeSelectorsList') or [] if isinstance(r, dict)]
        sides = [x.get('_targetSide') for x in [sd, *subs] if isinstance(x, dict) and isinstance(x.get('_targetSide'), int)]
        if not sides or any(v != 2 for v in sides):
            return False
        # how many enemies at once (`_limitTargetNum` → `_maxNum`), 0 = no limit
        return int(sd.get('_maxNum') or 0) if sd.get('_limitTargetNum') == 1 else 0
    attach_foe = [[] for _ in range(n)]

    def mode_buffs(i, d):
        """The effects of the buffs ability `d` of mode `i` holds (attach; attachFoe when the ability targets enemies)."""
        own = held_buff_effects(d)
        add(attach[i], own)
        sel = selects_foes(d)
        if d.get('m_GameObject', {}).get('m_PathID') in foe_go or sel is not False:
            add(attach_foe[i], own)
            if sel:
                for x in own:
                    foe_max.setdefault(x, sel)
    # 2026-10-11, official client (docs/rules/fx.md 「입력 대상·루프 타격·클립별 이펙트·배치 이펙트」):
    #  input   — per mode, the `_inputTargetEffects` (their timing in castOpt with t: 1, p: 1 for `_useInputPos`: on the
    #            target's last place when it died);
    #  hitLoop — { name: _endEvent } of the hit entries with `_oneshot` 0 (HitEffectOptions.OnEvent / OnCastFinish:
    #            ended at that event or the cast's finish — 엑시아 angle_attack_01_hit, end 6);
    #  castTgt — the `_castTargetEffects` names (CastTargetEffectOptions.PlayEffect: at the ability's playback speed);
    #  clipFx  — per mode, an UberAnimationEffectEmitter's `_replaceGroup` (OnCastStart: the group of the attack's
    #            clip adds its cast / hit options to that cast — 비나 빅토리아 Attack_1 / Attack_2): { src, loop, groups:
    #            [{ anim, cast, hit }] }
    inputs = [[] for _ in range(n)]
    hit_loop, cast_tgt = {}, []
    clip_fx = [None] * n
    foe_max = {}   # effect → the selector's target limit (attachFoeMax; without one: every enemy the ability hits)
    # 2026-10-10, official client — `CastEffectOptions.OnEvent` / `OnCastStart` / `OnCastFinish`: when
    # each cast effect starts and ends: { name: { s: _startEvent, e: _endEvent, o: _oneshot, d?: _delayIfFirstAttack, once?:
    # _onlyOnce } } per mode (every slot name of the entry, so a directional copy finds its timing). AbilityStandard.Event:
    # 0 ON_ATTACHED, 1 ON_DETACHED, 2 ON_CAST_START (the swing start), 3 ON_CAST_END, 4 ON_SPELL_ON (the strike), 5
    # ON_SPELL_END, 6 ON_ATTACK_FINISH, 7 ON_ATTACK_CHECK_POINT, 8 ON_OVERLOAD (render/fxgame.js onSwing)
    cast_opt = [{} for _ in range(n)]
    # 2026-10-10, official client — `RangedAttack._GetMountPoint`: the shooter's point a mode's shot
    # leaves from, its `_mountPointType` (MountPointType; MUZZLE 2 is the default and left out)
    shot_mp = {}
    hit_aim = []
    # 2026-10-10 (maintainer report: 号角's blocked enemies got her ranged blast): a mode with both melee and ranged
    # attack abilities (要塞: MeleeAttack / BlockedMeleeAttack vs RangedAttack) casts and hits with the effects of the
    # one it uses — `fortress[mode]` = { melee: { cast, hit }, ranged: { cast, hit } } (ranged: + its projectile's hit)
    split = [{'melee': {'cast': [], 'hit': []}, 'ranged': {'cast': [], 'hit': []}} for _ in range(n)]
    # 2026-10-21 (이펙트 연결 전수 ②): a mode with a COMBAT state ability (`UnitMode._combat`, charpack Body/Combat — the attack
    # on an enemy it blocks, Character._FetchCombatTarget) beside its Body/Attack casts and hits with that one's effects on
    # such a swing (the sim's 'swing' 7th field), the attack's (+ its projectile's hit) otherwise: `combatSplit[mode]`
    cpart = [{'attack': {'cast': [], 'hit': []}, 'combat': {'cast': [], 'hit': []}} for _ in range(n)]
    doll_born, doll_back = [], []
    # 2026-10-16 (이펙트 연결 전수 묶음 3): a 驭械术师's drones — per mode, its `Funnel*` abilities (their projectile and mount
    # point) and their FunnelEffectEmitter (same GameObject), and the drone's idle look of a mode without an emitter: the buffs
    # of the mode's `Effect` GameObjects (funnel_entries below)
    fun_ab, fun_em, fun_idle = [{} for _ in range(n)], [{} for _ in range(n)], [[] for _ in range(n)]
    for gp, d, _ in tree:
        if '[switch2stand]/StandBorn' in gp:
            add(doll_born, effect_names(d.get('_castEffects') or []))
        # 2026-10-24 (묶음 S4): and the switch back to the 本体 ([switch2normal]/StandBorn: ghost2_birth_empty_03)
        if '[switch2normal]/StandBorn' in gp:
            add(doll_back, effect_names(d.get('_castEffects') or []))
    # 2026-10-21: a mode talent / a per-side child of the attack (mode_parts) keeps its effects to itself
    talent, side, part_go, part_proj, part_timing = mode_parts(tree, mode_paths, projectiles)
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
        leaf = gp.rpartition('/')[2]
        if FUNNEL.match(leaf):
            if isinstance(d.get('_idleEffect'), list):
                fun_em[i][gp] = d
            elif isinstance(d.get('_projectileKey'), str) and d['_projectileKey']:
                fun_ab[i].setdefault(gp, d)
        if leaf == 'Effect' and i == 0:   # [추정] the drone's own look: only the Default mode's (S2 modes' are skill buffs)
            add(fun_idle[i], buff_effects(d))
        add(turn, turned(d))
        dir_groups(d, dirs)
        for k in found:
            if k not in proj[i]:
                proj[i].append(k)
        if isinstance(d.get('_projectileKey'), str) and d['_projectileKey'] and isinstance(d.get('_mountPointType'), int):
            shot_mp.setdefault((i, d['_projectileKey']), d['_mountPointType'])
        if skipped(gp) or any(TOKEN_FIRE.search(x) for x in gp.split('/')):
            continue
        if gp in part_go:
            continue
        ab = gp.rpartition('/')[2]
        kind = 'melee' if MELEE_ABILITY.match(ab) else 'ranged' if RANGED_ABILITY.match(ab) else None
        if kind and '/Body/Attack/' in gp[len(mode_paths[i]):] + '/':
            part = split[i][kind]
            part['seen'] = True
            add(part['cast'], effect_names(d.get('_castEffects') or []))
            for k in MODE_HIT_KEYS:
                add(part['hit'], effect_names(d.get(k) or []))
            if kind == 'ranged' and projectiles and isinstance(d.get('_projectileKey'), str) and d['_projectileKey']:
                add(part['hit'], projectiles.effects(d['_projectileKey'])['hit'])
        csub = gp[len(mode_paths[i]):] + '/'
        ck = 'combat' if csub.startswith('/Body/Combat/') else 'attack' if csub.startswith('/Body/Attack/') else None
        if ck:
            part = cpart[i][ck]
            part['seen'] = True
            add(part['cast'], effect_names(d.get('_castEffects') or []))
            for k in MODE_HIT_KEYS:
                add(part['hit'], effect_names(d.get(k) or []))
            if projectiles and isinstance(d.get('_projectileKey'), str) and d['_projectileKey']:
                add(part['hit'], projectiles.effects(d['_projectileKey'])['hit'])
        add(cast[i], effect_names(d.get('_castEffects') or []))
        add(inputs[i], effect_names(d.get('_inputTargetEffects') or []))
        add(cast_tgt, effect_names(d.get('_castTargetEffects') or []))
        cast_target_timing(d, cast_opt[i])
        for c in [*(d.get('_castEffects') or []), *(d.get('_inputTargetEffects') or [])]:
            if not isinstance(c, dict):
                continue
            opt = cast_timing(c)
            for x in c.get('_effects') or []:
                if isinstance(x, str) and x:
                    cast_opt[i].setdefault(x, opt)
        hg = hit_groups(d)
        if hg and strikes[i] is None:
            strikes[i] = hg
        sp = strike_projectiles(d)
        if sp and i not in multi:
            multi[i] = (sp, d)
        for c in [*(c for k in MODE_HIT_KEYS for c in d.get(k) or []), *group_hit_entries(d)]:
            if isinstance(c, dict) and c.get('_oneshot', 1) == 0:
                for x in c.get('_effects') or []:
                    if isinstance(x, str) and x:
                        hit_loop.setdefault(x, int(c.get('_endEvent', 3)))
        if isinstance(d.get('_replaceGroup'), list) and d['_replaceGroup'] and clip_fx[i] is None:
            groups = []
            for g in d['_replaceGroup']:
                if not isinstance(g, dict) or not isinstance(g.get('anim'), str):
                    continue
                gc, gh = [], []
                add(gc, effect_names(g.get('effectOptions') or []))
                add(gh, effect_names(g.get('hitEffectOptions') or []))
                for c in g.get('effectOptions') or []:
                    if isinstance(c, dict):
                        for x in c.get('_effects') or []:
                            if isinstance(x, str) and x:
                                cast_opt[i].setdefault(x, cast_timing(c))
                groups.append({'anim': g['anim'], 'cast': gc, 'hit': gh})
            if any(g['cast'] or g['hit'] for g in groups):
                clip_fx[i] = {'src': d.get('_sourceAnimKey') or '', 'loop': int(d.get('_loopType') or 0), 'groups': groups}
        for k in MODE_HIT_KEYS:
            # a MultiHitUberEffectEmitter's own `_hitEffects` play only with `_keepBaseHitEffect` (hit_groups)
            if k != '_hitEffects' or not hg or hg.get('keep'):
                add(hit[i], effect_names(d.get(k) or []))
            # 2026-10-10, official client — `HitEffectOptions.OnCastOnTarget`: a hit effect
            # whose entry has `_useOwnerToTargetDirection` is turned along the attacker → target line (언더플로우 S2
            # udflow_skill_02_hit_01), the others take the attacker's facing (render/fxgame.js `hitAim`)
            for c in d.get(k) or []:
                if isinstance(c, dict) and c.get('_useOwnerToTargetDirection') == 1:
                    add(hit_aim, [x for x in c.get('_effects') or [] if isinstance(x, str) and x])
        for c in group_hit_entries(d):
            if c.get('_useOwnerToTargetDirection') == 1:
                add(hit_aim, [x for x in c.get('_effects') or [] if isinstance(x, str) and x])
        # the mode's own buffs (its Talents abilities: 丰川祥子 S3's oblvns_s_3[eff] → the range effect) show their effect on
        # the operator while the mode lasts; buffs an attack puts on its target (_activeBuffs) are not these. So do the
        # buffs of the mode's GeneralAbilities (local patch, maintainer report: 스펙터 디 언체인드 S2's
        # ghost_s_2[effect] → ghost2_skill_02_buff_02, the red ring on her saw, and buff_03; every operator by the maintainer's
        # decision 2026-10-08 「켜줘」)
        sub = gp[len(mode_paths[i]):] + '/'
        if '/Talents/' in sub or '/GeneralAbilities/' in sub:
            mode_buffs(i, d)
        # effects a mode's abilities attach while they run: an emitter's `_attachEffects`, and an ability's own `_effects`
        # list (비르투오사 S3's GeneralAbilities: cello_skill_03_buff_01 / _front_02 / _range — her range)
        add(attach[i], effect_names(d.get('_attachEffects') or []))
        if isinstance(d.get('_effects'), list) and all(isinstance(x, str) for x in d['_effects']):
            add(attach[i], d['_effects'])
    # 2026-10-21 (maintainer decision 2026-10-21): the abilities a mode attaches with itself are its UnitMode's
    # `_generalAbilities`, wherever they sit — 阵法术师's trait buffs: 卡涅利安 Modes/Default/Trait_Eff and S1_Enhance/Trait_Eff
    # (billro_trait_eff → billro_beidong_buff_03), 蜜蜡 Modes/Default itself (beewax_c_disarmed → beewax_buff_01_start), which
    # the path rule above never saw
    for i, mp in enumerate(mode_paths):
        um = next((x for gp, x, _ in tree if gp == mp and isinstance(x.get('_generalAbilities'), list)), None)
        for r in (um or {}).get('_generalAbilities') or []:
            pid = r.get('m_PathID') if isinstance(r, dict) else None
            if pid and isinstance(mb.get(pid), dict) and not skipped(by_pid.get(pid) or ''):
                mode_buffs(i, mb[pid])
    # the mode's own shot first (projectile_chr_<name>[_default|_s<n>|_<X>]) — drones / talent shots after it; only that
    # projectile's hit / trail effects are the mode's (whitw2's funnels hit with their own when they fire)
    short = re.sub(r'^char_\d+_', '', Path(path).stem)
    main = re.compile(rf'^projectile_chr_{re.escape(short)}(_default|_s\d+|_[a-z])?$', re.I)
    for i in range(n):
        proj[i].sort(key=lambda k: 0 if main.match(k) else 1)
        own_shot = next((k for k in proj[i] if k not in part_proj[i]), None)   # not a mode talent's / a per-side child's
        if projectiles and own_shot:
            e = projectiles.effects(own_shot)
            add(hit[i], e['hit'])
            add(trail[i], e['trail'])
            add(chain[i], e['line'])
            chain_hit[i] = e['lineHit']
            # 2026-10-16: its `_effectsToTargetWhenStart` — on the target as the shot leaves (client EffectBehaviour, played
            # at the projectile's start): 银灰's svrash_attack_01_trail, 迷迭香's rosmon_attack_A_hit_01 …
            add(tgt_start[i], [x for x in e['start'] if x not in e['zone']])
    if projectiles:
        for i, (keys, ab) in multi.items():
            if strikes[i] is None:
                own = set(x for k in keys for x in projectiles.effects(k)['hit'])
                strikes[i] = shot_groups(projectiles, keys, [x for x in hit[i] if x not in own], ab)
    # 2026-10-21: the alternatives of an ability group (ability_groups): each child's own effects leave the mode's lists (which
    # held the first child's) for altFx — the renderer picks the child of the clip the model swings
    alt_fx, alt_own, alt_timing, alt_tgt = ability_groups(tree, mode_paths, by_pid, projectiles)
    add(cast_tgt, alt_tgt)
    for i in range(n):
        for k, v in alt_timing[i].items():
            cast_opt[i].setdefault(k, v)
        mine = alt_own[i]
        if not mine:
            continue
        for lst in (cast[i], hit[i], tgt_start[i], *(x for p in cpart[i].values() for x in (p['cast'], p['hit']))):
            lst[:] = [x for x in lst if x not in mine]
        sg = strikes[i]
        if isinstance(sg, dict):
            for k in ('g', 'starts', 'shots'):
                if isinstance(sg.get(k), list):
                    sg[k] = [[x for x in g if x not in mine] if isinstance(g, list) else g for g in sg[k]]
            if isinstance(sg.get('base'), list):
                sg['base'] = [x for x in sg['base'] if x not in mine]
    for i in range(n):
        for k, v in part_timing[i].items():
            cast_opt[i].setdefault(k, v)
    shot_from = [shot_mp.get((i, proj[i][0])) if proj[i] else None for i in range(n)]
    res = {'modes': modes, 'proj': proj, 'cast': cast, 'hit': hit, 'trail': trail, 'attach': attach}
    if any(cast_opt):
        res['castOpt'] = cast_opt
    # 2026-10-16: a chain shot's line through its targets (Projectiles: the chain graphic), per mode
    if any(chain):
        res['chain'] = chain
        res['chainHit'] = [chain_hit[i] if chain[i] else None for i in range(n)]   # 1: the hit points, 0: the feet
    if any(strikes):
        res['hitGroups'] = strikes
    if any(tgt_start):
        res['tgtStart'] = tgt_start
    if any(inputs):
        res['input'] = inputs
    if hit_loop:
        res['hitLoop'] = hit_loop
    if cast_tgt:
        res['castTgt'] = cast_tgt
    if any(clip_fx):
        res['clipFx'] = clip_fx
    if any(alt_fx):
        res['altFx'] = alt_fx
    if any(talent):
        res['talentAtk'] = talent
    if any(side):
        res['sideFx'] = side
    combat_split = [{k: {'cast': p[k]['cast'], 'hit': p[k]['hit']} for k in ('attack', 'combat')}
                    if p['attack'].get('seen') and p['combat'].get('seen') else None for p in cpart]
    if any(combat_split):
        res['combatSplit'] = combat_split
    # 2026-10-11, official client — `Character.get_startEffect`: the deploy effect is the
    # prefab root's `_startEffect`, else common_char_birth_01 (a token: common_call_start_01); a mode's
    # `_overrideStartEffect` comes first (`Character.GetStartEffect`). The dead effect: `_deadEffect`, else
    # common_char_die_01. `startOnce` = `_onlyPlayStartEffectOnce`.
    if isinstance(root.get('_startEffect'), str) and root['_startEffect']:
        res['start'] = root['_startEffect']
    if root.get('_onlyPlayStartEffectOnce') == 1:
        res['startOnce'] = 1
    if isinstance(root.get('_deadEffect'), str) and root['_deadEffect']:
        res['dead'] = root['_deadEffect']
    # 2026-10-16, official client — `Unit.AttachCommonAbilities`: every ability of the prefab root's
    # `_commonAbilities` is attached with the unit, outside its modes. `common` = the effects of the buffs those abilities
    # put on the unit itself for good (`lifeTimeType` 2 INFINITY): 新约能天使's wings and halo, 引星棘刺's weapon
    # glow. An ability that plays a clip, casts effects or picks targets (凯尔希·思衡托's RespawnBorn) is not such a passive.
    common = []
    for r in root.get('_commonAbilities') or []:
        ap = by_pid.get(r.get('m_PathID')) if isinstance(r, dict) else None
        comps = [x for gp, x, _ in tree if ap and gp == ap]
        if not comps or any(x.get('_animKey') or x.get('_castEffects') or (x.get('_selector') or {}).get('m_PathID')
                            or (x.get('_targetValidator') or {}).get('m_PathID') or '_waitForAttackEvent' in x for x in comps):
            continue
        for x in comps:
            add(common, [b['overrideEffectKey'] for b in x.get('_buffs') or []
                         if isinstance(b, dict) and b.get('lifeTimeType') == 2 and isinstance(b.get('overrideEffectKey'), str)])
    if common:
        res['common'] = common
    mode_start = []
    for mp in mode_paths:
        md = next((x for gp, x, _ in tree if gp == mp and '_overrideStartEffect' in x), None)
        v = md.get('_overrideStartEffect') if md else None
        mode_start.append(v if isinstance(v, str) and v else None)
    if any(mode_start):
        res['modeStart'] = mode_start
    if any(x is not None and x != 2 for x in shot_from):
        res['shotFrom'] = [None if x == 2 else x for x in shot_from]
    if turn:
        res['turn'] = turn
    if dirs:
        res['dirs'] = dirs
    if any(attach_foe):
        res['attachFoe'] = attach_foe
    if foe_max:
        res['attachFoeMax'] = foe_max
    if doll_born:
        res['dollBorn'] = doll_born
    if doll_back:
        res['dollBack'] = doll_back
    if hit_aim:
        res['hitAim'] = hit_aim
    fortress = [{k: {'cast': s[k]['cast'], 'hit': s[k]['hit']} for k in ('melee', 'ranged')}
                if s['melee'].get('seen') and s['ranged'].get('seen') else None for s in split]
    if any(fortress):
        res['fortress'] = fortress
    funnels = [funnel_entries(fun_ab[i], fun_em[i], fun_idle[i], projectiles) for i in range(n)]
    if any(funnels):
        res['funnels'] = funnels
    charge = charge_effects(tree, by_pid)
    if charge:
        res['charge'] = charge
    return res


def charge_effects(tree, by_pid):
    """2026-10-21, official client (이펙트 묶음 D) — a 秘术师's stored attack energies: the charpack's ChargableAttackGroup
    (`_maxChargeTimes`, `_abilities` = its charge abilities) carries a MultiChargeUberEffectEmitter on its GameObject.
    `OnEvent` sets the charge index to `GetChargeTimes()` and, in a charge action (a store),
    `CreateChargeEffects` runs `_chargeEffectGroups[index]`'s entries — ChargeEffectOptions keep what they create
    (`CreateEffect`) until `ClearChargeEffects`: at the next cast on a target that is no store
    (`OnCastOnTarget`, the release) or ON_DETACHED. 深靛: [0] indigo_attack_charge_02 (SPECIAL_1 = mount 6), [1] _03
    (8), [2] _04 (9), [3] _05 (5) — the points the stored projectiles leave from (`_mountPointForProjectiles` [6, 8, 9, 5]).
    Each charge ability's own emitter casts its group's entries with the store (all indigo_attack_charge_01_start).
    Returns { hold: [[names] per index], cast: [names] } or None."""
    groups = [(gp, d) for gp, d, _ in tree if '_maxChargeTimes' in d and isinstance(d.get('_abilities'), list)]
    if not groups:
        return None
    go_of = lambda d: (d.get('m_GameObject') or {}).get('m_PathID')   # noqa: E731
    emitters = {go_of(d): d for _, d, _ in tree if isinstance(d.get('_chargeEffectGroups'), list)}
    comp_go = {pid: go_of(d) for _, d, pid in tree}

    def names(g):
        out = []
        for opt in (g or {}).get('effects') or []:
            if isinstance(opt, dict):
                add(out, [x for x in opt.get('_effects') or [] if isinstance(x, str) and x])
        return out
    hold, cast = [], []
    for _, g in groups:
        em = emitters.get(go_of(g))
        if em:
            hold = [names(x) for x in em['_chargeEffectGroups']]
        for r in g['_abilities']:
            sub = emitters.get(comp_go.get(r.get('m_PathID'))) if isinstance(r, dict) else None
            for x in (sub or {}).get('_chargeEffectGroups') or []:
                add(cast, names(x))
    return {'hold': hold, 'cast': cast} if any(hold) or cast else None


def funnel_entries(abilities, emitters, idle, projectiles):
    """2026-10-16, official client — `FunnelEffectEmitter.OnEvent`: ON_ATTACHED plays its `_idleEffect`
    (and `_idleBackEffect`, shown instead while the owner faces back: `_UpdateIdleEffect`), ON_CAST_START plays its
    `_disappearEffect` and pauses the idle ones (`_setActiveFalseWhenPause`: hidden too), ON_ATTACK_FINISH plays its
    `_appearEffect` and resumes them, ON_DETACHED finishes them; `_PlayEffect` creates each on the owner, facing
    its way. A mode's drones: [{ idle, back, hide, show, over, off, proj, from, speed, trail, hit, seq, overSeq, wait, attach,
    delay, lock }…] by GameObject name, or { idle } first for a mode whose drone is a buff's look (`idle`: its `Effect`
    GameObjects — the 驭械术师 Default modes: 耶拉 kjera_token_default, 洛洛 rockr_token_01, 至简 malist_drone); [] for a mode
    without drones.
    The projectile (2026-10-16, official client): `attach` = its movement is AttachToTarget (set on the target
    each tick, no flight); `delay` = that movement's `_delayTime` with `_delayAfterReached` (OnTick:
    reached, then `EnsureLifeTime(_delayTime)` — it ends that long after its hit); `lock` = its SimpleProjectile
    `_hitNumType` INFINITY (2): it stays on its target and hits on every attack until the target is gone or the skill ends;
    `seq` / `overSeq` = its SequenceEffectBehaviour `_effectGroups` / `_overloadGroups` when there is more than one: each hit
    plays the next group (OnHitTarget steps `m_currentEffectGroupIndex`, back to 0 past the last)."""
    if not abilities and not emitters:
        return []
    out = []
    for gp in sorted(set(abilities) | set(emitters)):
        a, e, x = abilities.get(gp) or {}, emitters.get(gp) or {}, {}
        for k, src in (('idle', '_idleEffect'), ('hide', '_disappearEffect'), ('show', '_appearEffect')):
            if e.get(src):
                x[k] = [v for v in e[src] if isinstance(v, str) and v]
        if e.get('_useIdleBackEffect') == 1 and e.get('_idleBackEffect'):
            x['back'] = [v for v in e['_idleBackEffect'] if isinstance(v, str) and v]
        if e.get('_useOverloadEffect') == 1 and e.get('_overloadIdleEffect'):
            x['over'] = [v for v in e['_overloadIdleEffect'] if isinstance(v, str) and v]
        if e.get('_setActiveFalseWhenPause') == 1:
            x['off'] = 1
        key = a.get('_projectileKey')
        if key:
            x['proj'] = key
            if isinstance(a.get('_mountPointType'), int):
                x['from'] = a['_mountPointType']
            if a.get('_waitForProjectileInvalid') == 1:
                x['wait'] = 1   # its ON_ATTACK_FINISH comes when the projectile ends
            if projectiles:
                pe = projectiles.effects(key)
                x['trail'], x['hit'] = pe['trail'], list(pe['hit'])
                for d in projectiles.roots.get(key, []):
                    if isinstance(d.get('_speed'), (int, float)) and d['_speed'] > 0:
                        x.setdefault('speed', d['_speed'])   # tiles / s
                    if '_followTarget' in d and '_attachToMountPoint' in d:   # AttachToTarget
                        x['attach'] = 1
                        if d.get('_delayAfterReached') == 1 and isinstance(d.get('_delayTime'), (int, float)) and d['_delayTime'] > 0:
                            x['delay'] = round(d['_delayTime'], 4)
                    if '_hitNumType' in d and d['_hitNumType'] == 2:   # SimpleProjectile, LifeType.INFINITY hits
                        x['lock'] = 1
                    for gk, xk in (('_effectGroups', 'seq'), ('_overloadGroups', 'overSeq')):
                        if xk == 'overSeq' and d.get('_enableOverloadEffect') != 1:
                            continue
                        g = [effect_names(e.get('effectsWhenHit') or []) for e in d.get(gk) or [] if isinstance(e, dict)]
                        if len(g) == 1 and xk == 'seq':
                            add(x['hit'], g[0])
                        elif len(g) > 1:
                            x[xk] = g
        out.append(x)
    if idle and not any(x.get('idle') for x in out):
        out.insert(0, {'idle': idle})
    return out


def token_auras(tree, client):
    """2026-10-22 (upstream 5209873f's symptom, docs/rules/fx.md 「소환물 스킬 오라」): the effects a summon's skill keeps on it
    while it stands — the `_effects` of its skill prefab's auras (battle/prefabs/[uc]skills.ab AuraAbility: sktok_vodfox_token/Aura
    vodfox_skill_02_buff, sktok_skadi2_<n>/Aura token_skadi2_skill_0<n>_buff) — and its prefab root's `_startEffect`
    (pkgrps/btl_pfb_tokens_*.ab). A summon's skill follows its owner's skill choice: data/tokens.json `variants[…].skill` /
    `bySkill[i].skill` (its `index` = the owner's skill index, which the unit's snapshot `skillIndex` carries). → { token id:
    { owner, aura?: { owner skill index: [prefab, …] }, start? } } for the tokens with an aura or a start effect.
    2026-10-24 (묶음 S4): every summon's `_startEffect`, not only an aura holder's — 凯尔希·思衡托's 战术锚点
    kalts2_skill_03_indicator_ground_01 (a 自选 summon: data/backups.json tokens, its pack in the CN client only)."""
    assets = json.loads((ROOT / 'data/assets.json').read_text(encoding='utf-8')).get('tokens') or {}
    toks = json.loads((ROOT / 'data/tokens.json').read_text(encoding='utf-8'))
    toks = toks.get('tokens', toks)
    owners = {tid: a['owner'] for tid, a in assets.items() if isinstance(a, dict) and a.get('owner')}
    backups = json.loads((ROOT / 'data/backups.json').read_text(encoding='utf-8')).get('tokens') or {}
    for tid, rec in backups.items():
        o = (rec.get('owners') or [None])[0] if isinstance(rec, dict) else None
        if isinstance(o, str) and o:
            owners.setdefault(tid, o.split('@')[0])
    eff = {}
    for gp, d, *_ in tree:
        if isinstance(d.get('_effects'), list) and ('_buffs' in d or '_passiveBuffs' in d):
            eff.setdefault(gp.split('/')[0], []).extend(x for x in d['_effects'] if isinstance(x, str) and x)
    out = {}
    for tid, a in sorted(assets.items()):
        rec = toks.get(tid)
        if not isinstance(a, dict) or not a.get('owner') or not isinstance(rec, dict):
            continue
        per = {}
        for v in (rec.get('variants') or {}).values():
            for i, sk in [((v.get('skill') or {}).get('index'), v.get('skill') or {})] + [(int(k), b.get('skill') or {}) for k, b in (v.get('bySkill') or {}).items()]:
                pid = sk.get('prefabId') or sk.get('skillId')
                if isinstance(i, int) and pid and eff.get(pid):
                    per.setdefault(str(i), list(dict.fromkeys(eff[pid])))
        if per:
            out[tid] = {'owner': a['owner'], 'aura': dict(sorted(per.items()))}
    from char_points import token_files
    for tid, f in token_files(client, sorted(owners)).items():
        held = []
        for gp, d, *_ in load_tree(str(f))[0]:
            if gp == tid and isinstance(d.get('_startEffect'), str) and d['_startEffect']:
                out.setdefault(tid, {'owner': owners[tid]})['start'] = d['_startEffect']
            # 2026-10-26: a talent ability of the token prefab that holds `_attachEffects` while it casts — 酒神's 本能的召唤
            # (Others/Direction/Talents/1, its 诱导: token_encdool_skill_02_range_01) casts for as long as it stands
            # [추정: the cast lasts its life]; held like a skill aura, under every owner skill that makes the token
            if gp.startswith(f'{tid}/') and '/Talents/' in gp and isinstance(d.get('_attachEffects'), list):
                for a in d['_attachEffects']:   # { _directionType, _effects: [prefab, …], _onlyAttachOnDummy }
                    held.extend(x for x in (a.get('_effects') or [] if isinstance(a, dict) else []) if isinstance(x, str) and x)
        rec = toks.get(tid) or backups.get(tid)
        if held and isinstance(rec, dict):
            idx = set()
            for v in (rec.get('variants') or {}).values():
                if isinstance((v.get('skill') or {}).get('index'), int):
                    idx.add(v['skill']['index'])
                idx.update(int(k) for k in (v.get('bySkill') or {}))
            aura = out.setdefault(tid, {'owner': owners[tid]}).setdefault('aura', {})
            for i in sorted(idx):
                aura[str(i)] = list(dict.fromkeys((aura.get(str(i)) or []) + held))
            out[tid]['aura'] = dict(sorted(aura.items()))
    return {k: out[k] for k in sorted(out)}


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
    end = skill_end_modes(stree, buff_templates(a.client))
    sk_fx = skill_effects(stree, projectiles)
    durations = skill_durations()
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
            se = [end.get(pid) if isinstance(end.get(pid), int) and end[pid] < len(m['modes']) else None for pid in prefabs.get(cid) or []]
            if any(x is not None for x in se):
                m['skillEnd'] = se
            # local patch: the skills' own effects (skills.ab), in skill order; a skill's turned effects join the operator's
            # a skill's shot (skill_effects) flies with its first attack after the cast (render/fxgame.js trailShot): a skill
            # without duration only — a timed one's projectile is an ability of its own (焰影苇草 S2's fireballs, the kit's 'strike')
            sks = [{k: v for k, v in (sk_fx.get(pid) or {}).items() if k not in ('shot', 'shotHit') or not durations.get(pid, 0) > 0}
                   for pid in (prefabs.get(cid) or [])]
            if any(sks):
                m['skills'] = [{k: v for k, v in x.items() if k not in ('turn', 'dirs')} for x in sks]
                turn = list(m.get('turn') or [])
                dirs = list(m.get('dirs') or [])
                for x in sks:
                    add(turn, x.get('turn') or [])
                    dirs += [g for g in x.get('dirs') or [] if g not in dirs]
                if turn:
                    m['turn'] = turn
                if dirs:
                    m['dirs'] = dirs
            out[cid] = m
    doc = {'$comment': 'Operator attack modes (charpack _modes order: index n = audio bank attack.<n>) with their projectiles and '
                       'effect bindings (cast / hit / trail). Written by tools/local-extract/char_modes.py from the local client '
                       '(local patch); read by tools/assets/plan.mjs. The effect part also goes to public/assets/local/fx/modes.json.'}
    doc.update({k: out[k] for k in sorted(out)})
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    if FX_OUT.parent.exists():
        fx = {k: {f: v[f] for f in ('modes', 'skillMode', 'cast', 'castOpt', 'input', 'hit', 'hitGroups', 'tgtStart', 'hitLoop', 'castTgt', 'clipFx', 'altFx', 'talentAtk', 'sideFx', 'combatSplit', 'trail', 'chain', 'chainHit', 'shotFrom', 'attach', 'attachFoe', 'attachFoeMax', 'dollBorn', 'dollBack', 'hitAim', 'fortress', 'funnels', 'charge', 'skills', 'turn', 'dirs', 'start', 'startOnce', 'modeStart', 'dead', 'common') if f in v} for k, v in sorted(out.items())}
        # the summons' skill auras and start effects, keyed by token id (render/fxgame.js tokenAura, flushDeploys); a summon
        # whose pack this client lacks keeps the entry an earlier run wrote (凯尔希·思衡托's, from the CN client)
        old = json.loads(FX_OUT.read_text(encoding='utf-8')) if FX_OUT.exists() else {}
        fx.update({k: v for k, v in old.items() if k.startswith('token_')})
        fx.update(token_auras(stree, a.client))
        FX_OUT.write_text(json.dumps(dict(sorted(fx.items())), ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'{len(out)} operator(s) → {OUT.relative_to(ROOT)}' + (f' + {FX_OUT.relative_to(ROOT)}' if FX_OUT.parent.exists() else '')
          + f'; no charpack: {", ".join(missing) or "none"}')


if __name__ == '__main__':
    main()
