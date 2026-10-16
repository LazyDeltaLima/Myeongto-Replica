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
# 2026-10-11, decompile check round 2: an attack mode's hits on its targets — `_inputTargetEffects` (InputTargetEffectOptions,
# a CastEffectOptions: on the ability's main target at its `_startEvent`, client `InputTargetEffectOptions.CreateEffect`, RVA
# 0xB1B5F0) are the mode's `input`, not hits
MODE_HIT_KEYS = ('_hitEffects', '_castTargetEffects')
# a 要塞's attack abilities (charpack `Modes/<mode>/Body/Attack/`): the melee ones while it blocks, the ranged ones otherwise
MELEE_ABILITY = re.compile(r'^(Blocked)?MeleeAttack$')
RANGED_ABILITY = re.compile(r'^(Blocked|Self)?RangedAttack$')
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
        # the chain graphic the hit plays: ChainLightningHitBehaviour.get_effect (RVA 0xA6A130) = GetComponent — the first
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
            # 2026-10-10, decompile check: 쏜즈 더 로드스타's token / range lasted the whole battle: the reach
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
            # (`PlayLineEffect`, RVA 0xA68660 — the shooter is not on it), `_specialHitEffect` plays on the first one of each
            # chain when `_playSpecialEffectOnFirstOne` is set. 2026-10-16: it was also the trail before, and 异客's attacks /
            # 惊蛰 S2's flew the line as their shot
            # 2026-10-16: only the graphic the hit plays; `lineHit` = its `_playEffectOnHitPoint` (PlayLineEffect 0xA68660: 1 =
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
    """2026-10-16, decompile check — a MultiHitUberEffectEmitter's per-strike hits, or None: `MultiHitUberEffectEmitter
    .OnCastOnTarget` (RVA 0xCBB0B0) plays `_hitGroups[n].effects` on the target of the cast's n-th strike (the ability's
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
    """2026-10-16, decompile check — the projectile of each strike of a MultiRangedAttack, or None when every strike shoots
    its `_projectileKey`: `MultiRangedAttack.GetProjectileKey` (RVA 0xBF5730) for strike n (`spellCnt`) of `_additionalTimes`
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
    5 FOUR_DIR_FIXED — the enum's values, decompile check 2026-10-10; 6 L_OR_R_NOT_UD is another enum's) says which slot
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
                e.setdefault('_shots', []).append((fly, hits))
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
        if e.get('shot'):
            e['shot'].sort(key=lambda x: 1 if LINE_FX.search(x) else 0)
            # the hits of the projectile the shot is (维什戴尔 S1: S1_Common's, not the aftershocks' S1_Shock); none (号角 S1's
            # shell: its flare's hit comes after) leaves the hit to the name rule
            hit = next((h for fly, h in shots if e['shot'][0] in fly), [])
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


def cast_timing(c):
    """{ s, e, o, d?, once?, t?, p? } of a CastEffectOptions entry (castOpt): t = an InputTargetEffectOptions (on the main
    target), p = its `_useInputPos`."""
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


def modes_of(path, projectiles=None):
    """{ modes, proj, cast, hit, trail } of a charpack (per mode, in `_modes` order), or None:
    modes = the mode GameObject names; proj = the projectile keys under each mode; cast = the effects its attacks cast on
    the attacker; hit = those on the target (the emitters' hit lists + its own projectile's WhenHit / WhenReached); trail =
    that projectile's main effect (hitGroups: the mode's per-strike hits — hit_groups, 2026-10-16; tgtStart: its shot's effects on the target as it leaves; chain: a chain shot's line through its targets, chainHit: 1 when it runs through their hit points, 0 their feet; shotFrom: the MountPointType it leaves from when not MUZZLE; castOpt: each cast effect's
    start / end events — 2026-10-10); attach = the effects of the mode's own (Talents) buffs and the effects its abilities
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
        """2026-10-10, decompile check: 아스트젠 더 라이트체이서 S3: whether an ability's `_selector`
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
    # 2026-10-11, decompile check round 2 (docs/rules/fx.md 「입력 대상·루프 타격·클립별 이펙트·배치 이펙트」):
    #  input   — per mode, the `_inputTargetEffects` (their timing in castOpt with t: 1, p: 1 for `_useInputPos`: on the
    #            target's last place when it died);
    #  hitLoop — { name: _endEvent } of the hit entries with `_oneshot` 0 (HitEffectOptions.OnEvent / OnCastFinish, RVA
    #            0xAE5C60 / 0xAE5490: ended at that event or the cast's finish — 엑시아 angle_attack_01_hit, end 6);
    #  castTgt — the `_castTargetEffects` names (CastTargetEffectOptions.PlayEffect, 0xB18810: at the ability's playback speed);
    #  clipFx  — per mode, an UberAnimationEffectEmitter's `_replaceGroup` (OnCastStart 0xAED700: the group of the attack's
    #            clip adds its cast / hit options to that cast — 비나 빅토리아 Attack_1 / Attack_2): { src, loop, groups:
    #            [{ anim, cast, hit }] }
    inputs = [[] for _ in range(n)]
    hit_loop, cast_tgt = {}, []
    clip_fx = [None] * n
    foe_max = {}   # effect → the selector's target limit (attachFoeMax; without one: every enemy the ability hits)
    # 2026-10-10, decompile check — client `CastEffectOptions.OnEvent` / `OnCastStart` / `OnCastFinish`: when
    # each cast effect starts and ends: { name: { s: _startEvent, e: _endEvent, o: _oneshot, d?: _delayIfFirstAttack, once?:
    # _onlyOnce } } per mode (every slot name of the entry, so a directional copy finds its timing). AbilityStandard.Event:
    # 0 ON_ATTACHED, 1 ON_DETACHED, 2 ON_CAST_START (the swing start), 3 ON_CAST_END, 4 ON_SPELL_ON (the strike), 5
    # ON_SPELL_END, 6 ON_ATTACK_FINISH, 7 ON_ATTACK_CHECK_POINT, 8 ON_OVERLOAD (render/fxgame.js onSwing)
    cast_opt = [{} for _ in range(n)]
    # 2026-10-10, decompile check — client `RangedAttack._GetMountPoint`: the shooter's point a mode's shot
    # leaves from, its `_mountPointType` (MountPointType; MUZZLE 2 is the default and left out)
    shot_mp = {}
    hit_aim = []
    # 2026-10-10 (maintainer report: 号角's blocked enemies got her ranged blast): a mode with both melee and ranged
    # attack abilities (要塞: MeleeAttack / BlockedMeleeAttack vs RangedAttack) casts and hits with the effects of the
    # one it uses — `fortress[mode]` = { melee: { cast, hit }, ranged: { cast, hit } } (ranged: + its projectile's hit)
    split = [{'melee': {'cast': [], 'hit': []}, 'ranged': {'cast': [], 'hit': []}} for _ in range(n)]
    doll_born = []
    # 2026-10-16 (이펙트 연결 전수 묶음 3): a 驭械术师's drones — per mode, its `Funnel*` abilities (their projectile and mount
    # point) and their FunnelEffectEmitter (same GameObject), and the drone's idle look of a mode without an emitter: the buffs
    # of the mode's `Effect` GameObjects (funnel_entries below)
    fun_ab, fun_em, fun_idle = [{} for _ in range(n)], [{} for _ in range(n)], [[] for _ in range(n)]
    for gp, d, _ in tree:
        if '[switch2stand]/StandBorn' in gp:
            add(doll_born, effect_names(d.get('_castEffects') or []))
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
        if skipped(gp):
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
        add(cast[i], effect_names(d.get('_castEffects') or []))
        add(inputs[i], effect_names(d.get('_inputTargetEffects') or []))
        add(cast_tgt, effect_names(d.get('_castTargetEffects') or []))
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
            # 2026-10-10, decompile check — client `HitEffectOptions.OnCastOnTarget`, RVA 0xAE54D0: a hit effect
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
            add(attach[i], buff_effects(d))
            sel = selects_foes(d)
            if d.get('m_GameObject', {}).get('m_PathID') in foe_go or sel is not False:
                add(attach_foe[i], buff_effects(d))
                if sel:
                    for x in buff_effects(d):
                        foe_max.setdefault(x, sel)
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
    # 2026-10-11, decompile check round 2 — client `Character.get_startEffect` (RVA 0x7085E0): the deploy effect is the
    # prefab root's `_startEffect`, else common_char_birth_01 (a token: common_call_start_01); a mode's
    # `_overrideStartEffect` comes first (`Character.GetStartEffect`, 0x6F74B0). The dead effect: `_deadEffect`, else
    # common_char_die_01. `startOnce` = `_onlyPlayStartEffectOnce`.
    if isinstance(root.get('_startEffect'), str) and root['_startEffect']:
        res['start'] = root['_startEffect']
    if root.get('_onlyPlayStartEffectOnce') == 1:
        res['startOnce'] = 1
    if isinstance(root.get('_deadEffect'), str) and root['_deadEffect']:
        res['dead'] = root['_deadEffect']
    # 2026-10-16, decompile check — client `Unit.AttachCommonAbilities` (RVA 0x84DF50): every ability of the prefab root's
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
    if hit_aim:
        res['hitAim'] = hit_aim
    fortress = [{k: {'cast': s[k]['cast'], 'hit': s[k]['hit']} for k in ('melee', 'ranged')}
                if s['melee'].get('seen') and s['ranged'].get('seen') else None for s in split]
    if any(fortress):
        res['fortress'] = fortress
    funnels = [funnel_entries(fun_ab[i], fun_em[i], fun_idle[i], projectiles) for i in range(n)]
    if any(funnels):
        res['funnels'] = funnels
    return res


def funnel_entries(abilities, emitters, idle, projectiles):
    """2026-10-16, decompile check — client `FunnelEffectEmitter.OnEvent` (RVA 0xCB4EB0): ON_ATTACHED plays its `_idleEffect`
    (and `_idleBackEffect`, shown instead while the owner faces back: `_UpdateIdleEffect` 0xCB6180), ON_CAST_START plays its
    `_disappearEffect` and pauses the idle ones (`_setActiveFalseWhenPause`: hidden too), ON_ATTACK_FINISH plays its
    `_appearEffect` and resumes them, ON_DETACHED finishes them; `_PlayEffect` (0xCB5EF0) creates each on the owner, facing
    its way. A mode's drones: [{ idle, back, hide, show, over, off, proj, from, speed, trail, hit, seq, overSeq, wait, attach,
    delay, lock }…] by GameObject name, or { idle } first for a mode whose drone is a buff's look (`idle`: its `Effect`
    GameObjects — the 驭械术师 Default modes: 耶拉 kjera_token_default, 洛洛 rockr_token_01, 至简 malist_drone); [] for a mode
    without drones.
    The projectile (2026-10-16 decompile check): `attach` = its movement is AttachToTarget (dump.cs class at line 451030 — set
    on the target each tick, no flight); `delay` = that movement's `_delayTime` with `_delayAfterReached` (OnTick 0xA98890:
    reached, then `EnsureLifeTime(_delayTime)` — it ends that long after its hit); `lock` = its SimpleProjectile
    `_hitNumType` INFINITY (2): it stays on its target and hits on every attack until the target is gone or the skill ends;
    `seq` / `overSeq` = its SequenceEffectBehaviour `_effectGroups` / `_overloadGroups` when there is more than one: each hit
    plays the next group (OnHitTarget 0xA88320 steps `m_currentEffectGroupIndex`, back to 0 past the last)."""
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
        fx = {k: {f: v[f] for f in ('modes', 'skillMode', 'cast', 'castOpt', 'input', 'hit', 'hitGroups', 'tgtStart', 'hitLoop', 'castTgt', 'clipFx', 'trail', 'chain', 'chainHit', 'shotFrom', 'attach', 'attachFoe', 'attachFoeMax', 'dollBorn', 'hitAim', 'fortress', 'funnels', 'skills', 'turn', 'dirs', 'start', 'startOnce', 'modeStart', 'dead', 'common') if f in v} for k, v in sorted(out.items())}
        FX_OUT.write_text(json.dumps(fx, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'{len(out)} operator(s) → {OUT.relative_to(ROOT)}' + (f' + {FX_OUT.relative_to(ROOT)}' if FX_OUT.parent.exists() else '')
          + f'; no charpack: {", ".join(missing) or "none"}')


if __name__ == '__main__':
    main()
