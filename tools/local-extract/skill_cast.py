#!/usr/bin/env python3
"""How each pool skill is cast, from the local client's skill prefabs (battle/prefabs/[uc]skills.ab).

A skill prefab's root MonoBehaviour is its skill class (docs/rules/sim.md 「즉발 스킬의 시전」):
  * `ReplacementSkill` (it has `_cancelIfSearchTargetFailed`) — the cast replaces the unit's next attack: that attack goes
    out as the skill ability (the client's `ReplacementSkill.ApplyModification` / `Character.get_attack`);
  * `CastSkill` (it has `_switchToState`) — the skill ability is cast at once; `_switchToState` 1 puts the unit in its
    Skill state until that ability ends (`Character.States.SkillState._StartSkill`), 0 casts it without a state change;
    `_resetAbilityCooldownWhenCastEnd` 1 makes the ability ready again as it ends (`CastSkill.OnCastFinish`).
The skill ability is the animated ability on the root (`AbstractAnimatedAbility`: `_animKey`, `_timeMode`, `_cooldown`,
`_maxAnimScale`, `_preDelay`, `_waitForAttackEvent`), else the first child of the root group (`_abilities` order) with a
clip of its own (见行者 S2 knock_back `Skill`, not the clip-less aura), else the first one below it by path (引星棘刺 S2
Mark / Token, 锡人 S2 HitEnemy / HitTile play one clip) that the skill casts as it starts — through the root's groups, or
triggered by the skill's own buffs as it starts (`cast_extras`, `start_triggered`; an ability a behaviour casts later or no
node names is not: skill_entry) —, else none (a clip-less root ability: the record has no `ability`). Its time (the client's `AbstractAnimatedAbility.get_cooldown` / `DoAttach` /
`UpdatePlaybackSpeed`): `_timeMode` 0 FROM_ATTACK_SPEED = the unit's attack interval, 1 FROM_ANIMATION = its clip length,
2 SPECIFIED = `_cooldown`, 3 LOAD_FROM_BLACKBOARD = the blackboard value `_cooldownKey`; the clip is scaled to that time
within [0.1, `_maxAnimScale`] as an attack's; its facing flags (`face`, as tools/local-extract/attack_timing.py: 1 its
main target, 2 its deploy direction, 3 front, 4 its first cast target, 0 none) say where the unit turns as the cast
starts (`AbstractAnimatedAbility.DealWithFaceDirection`, docs/rules/render.md 「공격 방향」). tools/build-data.mjs folds this, with the clip lengths of data/assets.json,
into every skill record of data/chess.json / data/backups.json (`cast`). `word` 0 = the skill's `_playCharWordVoice` is
off (no 作战中 line as it is cast; the record's `charWord: false`; any skill class). `born` 0 = the cast is refused while the
unit is in its born state after a deployment: `CastSkill.UseSkill` checks `_canSwitchDuringBorn` (`_switchToState` 1) or
`_canCastDuringBorn` (0) against `Character.CheckIsBornState`; the other skill classes do not check it. `range` 0 = the
skill shows no range of its own, so the selection menu has no skill range toggle (`CastSkill.get_rangeToShow`,
docs/rules/ui.md 「선택 메뉴」): CastSkill `_hideRangeToShow`, or `_forceUseBaseShowRange` when the base path ends at the
unit's own mode — no ability `_selector` and no `_rangeIdModeIndex` above 0 (the Default mode); 圣约送葬人 S1 / S3 point
at their skill modes 1 / 3, another range, and keep the toggle. `aim` 0 (CastSkill) = the skill ability is cast at the
unit's own place — no `_trigger` (`CastSkill.DoCast` → `CastDirectly`) or an extra its start buff triggers at the unit —, so its
`_faceToTarget` turns nothing (skill_entry; docs/rules/render.md 「공격 방향」). `aimBy` (CastSkill with a `_trigger` whose root
is an AbilitySelectableGroup) = its configs' triggers in order, as `trig`: the skill ability is cast at the first one's target
that holds one (path_route). `trig` (CastSkill with a `_trigger`) = the target
trigger the automatic operations search before a cast and its selector / range box (trigger_entry; docs/rules/sim.md 「스킬
프리팹의 대상 트리거」). Output
tools/assets/local-skill-cast.json:

  { "skills": { "skchr_thorn2_1": { "cls": "replace", "ability": { "anim": "Skill", "time": 0, "max": 1, "wait": 1, … } },
                "skchr_texas_2": { "cls": "cast", "state": 1, "reset": 0, "ability": { … } },
                "skchr_vendla_2": { …, "group": "seq", "subs": [{ "anim": 1, "wait": 1 }, { "anim": 0, "wait": 0 }] }, … } }

Usage (from the repo root; ~1 min to read a bundle; --client = an Arknights_Data folder, repeatable: the first client
that has a skill decides it — by default the EN client, then the CN one for the operators the EN one lacks
(client_path.py); a skill neither client has keeps the row of the earlier run):
  .venv-extract/bin/python tools/local-extract/skill_cast.py [--client <EN …/Arknights_Data>] [--client <CN …/Arknights_Data>] [--id char_…]…
--id reads only those operators' skills: every other row stays as the earlier run wrote it.
Everything read is (c) Hypergryph; only these flags and numbers are kept.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from char_modes import buff_templates, char_skill_prefabs, load_tree, skill_bundle  # noqa: E402
from client_path import clients, earlier, kept, kept_all, skills_of, skin_keys  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tools/assets/local-skill-cast.json'

# skill-ability MonoBehaviour field → output key
FIELDS = {
    '_animKey': 'anim', '_timeMode': 'time', '_cooldown': 'cd', '_cooldownKey': 'cdKey', '_maxAnimScale': 'max',
    '_preDelay': 'pre', '_waitForAttackEvent': 'wait',
}
# the facing flags in the order DealWithFaceDirection tests them → `face` 1..4 (0: none set)
FACE_FLAGS = ('_faceToTarget', '_faceToDefault', '_faceToFront', '_faceToFirstCastTarget')


def num(v):
    f = float(v)
    return int(f) if f == int(f) else round(f, 4)


def ability(d):
    """The timing fields of an animated ability MonoBehaviour, or None."""
    if not isinstance(d, dict) or '_animKey' not in d or '_timeMode' not in d:
        return None
    out = {}
    for k, o in FIELDS.items():
        v = d.get(k)
        if k in ('_animKey', '_cooldownKey'):
            out[o] = v if isinstance(v, str) else ''
        elif isinstance(v, (int, float)):
            out[o] = num(v)
    if any(f in d for f in FACE_FLAGS):
        out['face'] = next((i + 1 for i, f in enumerate(FACE_FLAGS) if d.get(f)), 0)
    return out


def group_children(sid, comps):
    """(group MonoBehaviour, [child MonoBehaviour in `_abilities` order]) of a skill whose root ability is a group, else
    (None, [])."""
    by_pid = {pid: d for _gp, d, pid in comps}
    grp = next((d for gp, d, _pid in comps if gp == sid and isinstance(d.get('_abilities'), list) and d['_abilities']), None)
    if grp is None:
        return None, []
    kids = [by_pid.get(ref.get('m_PathID')) if isinstance(ref, dict) else None for ref in grp['_abilities']]
    return (grp, kids) if all(k is not None for k in kids) else (None, [])


def group_subs(sid, comps):
    """`group` / `subs` of a skill whose root ability is a group (`_abilities`): the children in that order, which number
    the ability's sound signals (`<skillId>.<i+1>`, the client's group `DoSetData`). `group` 'seq' = an `AbilitySequenceGroup`
    (`_alwaysNext`: each child is cast as the one before it finishes), 'par' = the others (every child at once); a child is
    `{ anim: 0|1, wait: 0|1 }` (anim 1 = an animated ability with its own `_animKey`, 0 = no clip: a buff or a clip-less
    attack)."""
    grp, kids = group_children(sid, comps)
    if grp is None:
        return {}
    subs = [{'anim': int(bool(d.get('_animKey'))), 'wait': int(bool(d.get('_waitForAttackEvent')))} for d in kids]
    return {'group': 'seq' if '_alwaysNext' in grp else 'par', 'subs': subs}


# Buff.Event keys of a template's `eventToActions` that run as the skill starts: ON_BUFF_START 0 (a buff of the skill's own
# ability starts with it), ON_SKILL_START 33
START_EVENTS = (0, 33)


def triggered(nodes, out, at_self=None):
    """The `_abilityName` of every TriggerAbility node in `nodes` (nested condition nodes too) → `out`; with `at_self`, the
    names whose node casts the ability at its owner's own place → `at_self` too: `_castDirectly` (`Ability.CastDirectly`,
    the input target is the owner's map position) or `_targetType` BUFF_OWNER (`CastToTarget` the buff's owner — a buff of
    the skill's own ability is on the unit itself; the client's `Nodes.TriggerAbility.Execute`)."""
    if isinstance(nodes, dict):
        if str(nodes.get('$type', '')).endswith('+TriggerAbility') and isinstance(nodes.get('_abilityName'), str):
            out.add(nodes['_abilityName'])
            if at_self is not None and (nodes.get('_castDirectly') or nodes.get('_targetType') == 'BUFF_OWNER'):
                at_self.add(nodes['_abilityName'])
        for v in nodes.values():
            triggered(v, out, at_self)
    elif isinstance(nodes, list):
        for v in nodes:
            triggered(v, out, at_self)
    return out


def cast_extras(sid, sk, comps3, templates, at_self=None):
    """{GameObject path: True|False} of the skill's `_extraAbilities`: True when the skill's own buffs (the `_buffs` of its root
    ability and of its root group's children) trigger that ability as the skill starts (a TriggerAbility naming it by GameObject
    or `namedAsAlias` in their template's ON_BUFF_START / ON_SKILL_START). `BasicSkill.OnBorn` attaches the extra abilities as the
    unit is deployed; they are not the skill's ability (`get_ability`), and the other ones are cast later — at the skill's end
    (灵知 S3, 薄绿 S2 FinalAttack, ON_SKILL_FINISH), every `interval` (车尔尼 S2 FinalAttack, ON_BUFF_TRIGGER), on a hit
    (棘刺 S2 Thorn, ON_TAKE_DAMAGE) —, so they say nothing of how the skill is cast. Those the start triggers (菲莱 S1
    SkillAnimation, 归溟幽灵鲨 S1 ExchangeHp, 贝洛内 S3 FlyToTarget: the cast waits for their clip as for the root's own — docs/rules/sim.md
    「즉발 스킬의 시전」) stand for the skill ability. `at_self` (a set): the paths of those the start casts at the unit's own place
    (triggered)."""
    by_pid = {pid: (gp, d) for gp, d, pid in comps3}
    extras = {}
    for ref in sk.get('_extraAbilities') or []:
        hit = by_pid.get(ref.get('m_PathID')) if isinstance(ref, dict) else None
        if hit:
            gp, d = hit
            extras[gp] = {gp.split('/')[-1], (d.get('_metadata') or {}).get('namedAsAlias') or ''} - {''}
    if not extras:
        return {}
    own = [d for gp, d, _pid in comps3 if gp == sid] + group_children(sid, comps3)[1]
    names, selfs = set(), set()
    for d in own:
        for b in d.get('_buffs') or []:
            tpl = templates.get(b.get('templateKey')) if isinstance(b, dict) else None
            for ev in START_EVENTS:
                triggered((tpl or {}).get(ev), names, selfs)
    if at_self is not None:
        at_self.update(gp for gp, ns in extras.items() if ns & selfs)
    return {gp: bool(ns & names) for gp, ns in extras.items()}


# the fields of a SelectorTrigger (`TargetTrigger`); any other field is a subclass this tool does not know (HunterBulletTrigger …)
SELECTOR_TRIGGER = {'_keepTarget', '_minTargetNum', '_overrideSearchTargetTick'}
# AdvancedSelector (and subclass) fields that narrow the targets beyond side / motion / range (their default leaves them off)
# and that trigger_entry does not read into `trig` — `filter` 1. `_ignoreTargetFree` / `_onlyIgnoreSomeOfTargetFreeCase`
# are here too: only with both on do `_abnormalFlag` / `_abnormalCombo` count (`TargetOptions._VerifyAdvanced` →
# `Entity.IsStillTargetFreeWithImmuneFlag`); every trigger read so far has them off, so those two fields change nothing.
SELECTOR_FILTERS = {
    '_buffs': [], '_filterTag': '', '_filterTagList': [], '_CheckNotInElementBreak': 0, '_secondaryFilter': 0,
    '_checkUnitType': 0, '_filterTokenHost': 0, '_ignoreTargetFree': 0, '_onlyIgnoreSomeOfTargetFreeCase': 0,
    '_excludeSomeAbnormalFlags': 0, '_ignoreAllyTargetFree': 0, '_ignoreHealFree': 0, '_abilityInputTargetAsSortSource': 0,
    '_sortByTauntAtLast': 0,
}
# `AbnormalFlag` HEAL_FREE (禁疗)
HEAL_FREE = 7


def ally_filters(d, comps3):
    """The ally selector filters trigger_entry reads (docs/rules/sim.md 「스킬 프리팹의 대상 트리거」), or None for one it does
    not know: `exclSelf` (`_excludeOwner`: `AdvancedSelector.OnPostFilter` drops the owner from an ally selection), `prof`
    (`_needProfessionMask` → `_professionMask`: `TargetOptions._VerifyAdvanced` keeps a character of those professions),
    `notBuff` + `buffSrc` (AdvancedSelectorWithTagAndBuffKey `_buffKeyExcluded` `_buffKey`: `_CheckBuff` drops a unit holding
    it — from the owner only with `_filterBuffSource`), and a FilterBuffTargetValidator of `_validatorFilterSettings`
    (AdvancedSelectorWithValidatorFilter.ValidateTarget: the validator must say `isMatched`; `Validate` = its `_targetOptions`
    — `prof`, `noHeal` for an excluded HEAL_FREE — and, with `_excludeKey`, none of its `_buffs`)."""
    out = {}
    if d.get('_excludeOwner'):
        out['exclSelf'] = 1
    if d.get('_needProfessionMask'):
        out['prof'] = int(d.get('_professionMask') or 0)
    if d.get('_buffKey'):
        if not d.get('_buffKeyExcluded') or d.get('_checkOrInsteadOfAnd'):
            return None
        out['notBuff'] = [d['_buffKey']]
        if d.get('_filterBuffSource'):
            out['buffSrc'] = 1
    by_pid = {p: v for _gp, v, p in comps3}
    for s in d.get('_validatorFilterSettings') or []:
        v = by_pid.get(((s or {}).get('validator') or {}).get('m_PathID'))
        o = (v or {}).get('_targetOptions') or {}
        if (not v or '_excludeKey' not in v or not s.get('isMatched') or s.get('ignoreTargetSide') or v.get('_hostAsTarget')
                or not v.get('_excludeKey') or v.get('_filterBuffSource') or o.get('targetSide') != d.get('_targetSide')
                or o.get('containSomeAbnormalFlags') or o.get('checkUnitType') or o.get('purposeMask')
                or (o.get('excludeSomeAbnormalFlags') and o.get('excludeAbnormalFlag') != HEAL_FREE)):
            return None
        if o.get('professionMask'):
            out['prof'] = int(o['professionMask'])
        if o.get('excludeSomeAbnormalFlags'):
            out['noHeal'] = 1
        out['notBuff'] = out.get('notBuff', []) + [k for k in v.get('_buffs') or [] if isinstance(k, str)]
    return out


def own_fields(d):
    return {k for k in d if k.startswith('_') and k != '_metadata'}


def trigger_entry(sk, comps3):
    """`trig` of a CastSkill with a `_trigger` (the target trigger the automatic operations search before a cast:
    `CastSkill.get_canCastCheck` is false when its `Search(false)` is — docs/rules/sim.md 「스킬 프리팹의 대상 트리거」), or None
    without one. `sel`: 'never' (NeverTrigger: no field of its own — never finds a target), else the selector the
    SelectorTrigger takes (`Awake`: GetComponent<TargetSelector> — the first selector component of its GameObject, `$comp`):
    'range' (AdvancedSelector and its subclasses: `_targetSide`) / 'blocked' (BlockedOrAdvancedSelector,
    `_limitedMaxTargetNumToBlockedCnt`: the enemies the owner blocks first, in range or not) with `side` (1 ally, 2 enemy), `motion`
    (`_targetMotion` bits: 1 ground, 2 air), `post` (`_postFilter`: the FilterUtil.FilterType that orders the targets — the
    first is `SelectorTrigger.target`, the one the skill ability is cast at), an ally selector's filters (ally_filters) and
    `filter` 1 when a field narrows the targets in a way this tool does not read (SELECTOR_FILTERS); a TileSelector is a
    'range' one too (`tile` 1: HATRED_DES, its tile options left out);
    'group' (GroupSelector), 'self' (SelfSelector: no field — the owner), 'selfIf'
    (SelfSelectorInCertainCondition: the owner while `notBuff` keys are all absent / its HP ratio is ≤ `hpAtMost`; `cond` 1 =
    another condition). The range box (`_extendable`: `extend` 1 = the unit's 攻击距离 grows it; a ConstBoxRange's own
    `rangeId`, else the skill ability's range — the skill's rangeId, or the unit's own without one, `BasicSkill.AssignData`).
    `min` = `_minTargetNum`. '?' = a trigger or selector of a shape this tool does not know (tools/build-data.mjs stops on it)."""
    ref = sk.get('_trigger')
    pid = ref.get('m_PathID') if isinstance(ref, dict) else None
    if not pid:
        return None
    by_pid = {p: (gp, d) for gp, d, p in comps3}
    if pid not in by_pid:
        return {'sel': '?'}
    gp, trig = by_pid[pid]
    f = own_fields(trig)
    if not f:
        return {'sel': 'never'}
    if f != SELECTOR_TRIGGER:
        return {'sel': '?'}
    out = {'min': int(trig.get('_minTargetNum') or 0)}
    sibs = sorted((d for g, d, p in comps3 if g == gp and p != pid), key=lambda d: d.get('$comp', 1 << 30))
    rng = next((d for d in sibs if '_extendable' in d), None)
    if rng is not None:
        out['extend'] = int(bool(rng.get('_extendable')))
        if isinstance(rng.get('_rangeId'), str) and rng['_rangeId']:
            out['rangeId'] = rng['_rangeId']
    for d in sibs:
        f = own_fields(d)
        if d is rng or '_targetOptions' in d:   # the range, a validator (FilterBuffTargetValidator)
            continue
        if not f:
            return {**out, 'sel': 'self'}
        if '_tileSortType' in d:
            # a TileSelector finds units the way every RangeSelector does (`RangeSelector.DoFindTargets_DISPOSE`: the range
            # box by its own side / motion) and orders them HATRED_DES (`TileSelector.OnPostFilter(List<Entity>)`: FilterType
            # 4, max 128) — its `_options` / `_filterType` choose tiles only (FindTiles)
            e = {**out, 'sel': 'range', 'side': int(d.get('_targetSide') or 0), 'motion': int(d.get('_targetMotion') or 0),
                 'post': 4, 'tile': 1}
            if d.get('_needProfessionMask') or d.get('_checkUnitType'):
                e['filter'] = 1
            return e
        if '_rangeSelectorsList' in d:
            return {**out, 'sel': 'group'}
        if '_checkHpRatioCondition' in d:
            e = {**out, 'sel': 'selfIf'}
            if d.get('_checkNotContainBuffs'):
                e['notBuff'] = [k for k in d.get('_buffKeys') or [] if isinstance(k, str)]
            if d.get('_checkHpRatioCondition'):
                e['hpAtMost'] = num(d.get('_maxRatio') or 0)
            if d.get('_checkContainBuffs') or d.get('_checkBuffStackCount'):
                e['cond'] = 1
            return e
        if '_targetSide' in d:
            e = {**out, 'sel': 'blocked' if '_limitedMaxTargetNumToBlockedCnt' in d else 'range',
                 'side': int(d.get('_targetSide') or 0), 'motion': int(d.get('_targetMotion') or 0),
                 'post': int(d.get('_postFilter') or 0)}
            if any(k in d and d[k] not in (v, None) for k, v in SELECTOR_FILTERS.items()):
                e['filter'] = 1
            ally = ally_filters(d, comps3) if e['side'] == 1 else None
            if ally is None and e['side'] == 1:
                e['filter'] = 1
            elif ally:
                e.update(ally)
            elif d.get('_needProfessionMask') or d.get('_buffKey') or d.get('_validatorFilterSettings'):
                e['filter'] = 1   # an enemy selector's profession / buff filter: not read
            return e
    return {**out, 'sel': '?'}


def path_route(sid, comps3, path):
    """How the skill's root ability reaches the ability at GameObject `path` (an ability found below the root by path —
    skill_entry): 'group' through sequence / parallel groups' `_abilities` (`AbilitySequenceGroup`: `_alwaysNext`,
    `AbilityParallelGroup`: `_alsoInterruptSubAbilities`; both cast a child the way they were cast — `CastDirectly` directly,
    `CastToTarget` at that target, the next child of a sequence too), ('pick', configs) an `AbilitySelectableGroup` config
    (`_abilityConfigs`: `_DoCastInternal` → `AbilityConfigs.TryCastToTarget` casts the first ready config whose own `_trigger`
    holds a target at that target — `_useInputTarget` 0 —, `TryCastDirectly` directly), or None (another way: a buff node, a
    behaviour, the unit's mode)."""
    by_pid = {pid: (gp, d) for gp, d, pid in comps3}

    def walk(gp, seen):
        for g, d, _pid in comps3:
            if g != gp:
                continue
            if isinstance(d.get('_abilityConfigs'), list) and gp == sid:
                for c in d['_abilityConfigs']:
                    hit = by_pid.get((c.get('_ability') or {}).get('m_PathID')) if isinstance(c, dict) else None
                    if hit and hit[0] == path:
                        return ('pick', d['_abilityConfigs'])
            if isinstance(d.get('_abilities'), list) and ('_alwaysNext' in d or '_alsoInterruptSubAbilities' in d):
                for ref in d['_abilities']:
                    hit = by_pid.get(ref.get('m_PathID')) if isinstance(ref, dict) else None
                    if not hit or hit[0] in seen:
                        continue
                    if hit[0] == path:
                        return 'group'
                    if walk(hit[0], seen | {hit[0]}) == 'group':
                        return 'group'
        return None
    return walk(sid, {sid})


def path_names(comps3, path):
    """The names a TriggerAbility node finds the ability at GameObject `path` by: its GameObject name and `namedAsAlias`."""
    d = next((d for gp, d, _pid in comps3 if gp == path and '_animKey' in d), {})
    return {path.split('/')[-1], (d.get('_metadata') or {}).get('namedAsAlias') or ''} - {''}


def start_triggered(sid, comps3, templates):
    """(names, selfs): the abilities the skill's own buffs (`_buffs` of its root abilities and of its root group's children)
    trigger as the skill starts — a TriggerAbility in their template's ON_BUFF_START / ON_SKILL_START —, and those of them it
    casts at the unit's own place (`_castDirectly` or `_targetType` BUFF_OWNER; triggered)."""
    own = [d for gp, d, _pid in comps3 if gp == sid] + group_children(sid, comps3)[1]
    names, selfs = set(), set()
    for d in own:
        for b in d.get('_buffs') or []:
            tpl = templates.get(b.get('templateKey')) if isinstance(b, dict) else None
            for ev in START_EVENTS:
                triggered((tpl or {}).get(ev), names, selfs)
    return names, selfs


def started_at_self(sid, comps3, templates, path):
    """True when the skill's own buffs cast the ability at GameObject `path` at the unit's own place as the skill starts
    (start_triggered; 可露希尔 S1 ApplyShield, 缇缇 S2 GlobalUnique)."""
    return bool(path_names(comps3, path) & start_triggered(sid, comps3, templates)[1])


def skill_entry(sid, comps3, templates):
    """{cls, state?, reset?, ability, group?, subs?} of one skill prefab's components [(GameObject path, MonoBehaviour,
    path id)], or None. `templates`: the buff templates (char_modes.buff_templates), for cast_extras."""
    comps = [(gp, d) for gp, d, _pid in comps3]
    root = [d for gp, d in comps if gp == sid]
    sk = next((d for d in root if '_maxTriggerTime' in d), None)
    if sk is None:
        return None
    # BasicSkill `_playCharWordVoice` 0: the skill casts without the operator's 作战中 line (the client's
    # VoicePlayer._OnSkillCasted; 浊心斯卡蒂's skills — their start sound is a dubbed bank instead, soundFxVoiceLang)
    word = {} if sk.get('_playCharWordVoice', 1) else {'word': 0}
    if '_cancelIfSearchTargetFailed' in sk:
        e = {'cls': 'replace', **word}
    elif '_switchToState' in sk:
        state = int(sk.get('_switchToState') or 0)
        e = {'cls': 'cast', 'state': state, 'reset': int(sk.get('_resetAbilityCooldownWhenCastEnd') or 0), **word}
        # only CastSkill (and its subclasses) carries the born flags: AppearSkill / ToggleSkill / AttachOrDetachSkill cast in it
        # BasicSkill `_playSkillBeginAnim` with a `_beginAnim` (`_beginAnimDown` for a unit deployed facing down,
        # `get_beginAnim`): the Skill state's OnEnter plays that clip and starts the skill only once it has played
        # (`OnBeforeSkillStart` → `PlayBeginAnimation` → `DoStartSkill`); a `_switchToState` 0 cast starts at once. A skill with
        # a 吟唱 (a ChantBeforeSkill behaviour on its root: `_buffsWhenStartChant`; `BasicSkill.get_hasChant`) runs
        # `ChantBeforeSkill.StartChant` there instead — its own begin / loop / end clips over the chant's time, never `_beginAnim`
        # (予愿安洁莉娜 S2: Skill_2_Takeoff_*, the kit's 吟唱) —, so it has no begin clip here
        chant = any('_buffsWhenStartChant' in d for gp, d in comps if gp == sid)
        if state and not chant and sk.get('_playSkillBeginAnim') and (sk.get('_beginAnim') or sk.get('_beginAnimDown')):
            e['begin'] = sk.get('_beginAnim') or ''
            if sk.get('_beginAnimDown'):
                e['beginDown'] = sk['_beginAnimDown']
        flag = '_canSwitchDuringBorn' if state else '_canCastDuringBorn'
        if flag in sk and not sk.get(flag):
            e['born'] = 0
        selector = any(isinstance(d.get('_selector'), dict) and d['_selector'].get('m_PathID') for d in root)
        if sk.get('_hideRangeToShow') or (sk.get('_forceUseBaseShowRange') and not selector and int(sk.get('_rangeIdModeIndex', -1)) <= 0):
            e['range'] = 0
        tr = trigger_entry(sk, comps3)
        if tr:
            e['trig'] = tr
    else:
        return word or None
    # `aim` 0 (a CastSkill): its skill ability is cast at the unit's own place, so a `_faceToTarget` ability does not turn
    # the unit (docs/rules/render.md 「공격 방향」): `CastSkill.DoCast` casts it `CastToTarget(_trigger.target)` only with a
    # `_trigger` that holds a target, else `CastDirectly` — the input target is `GetCastDirectlyMapPosition`, the owner's
    # own position (a sequence / parallel group casts its children directly too), and `DealWithFaceDirection` →
    # `Entity.FaceToTarget` ignores a point under 0.2 tiles away. A root or root-group ability with no `_trigger`, and an
    # extra the skill's start buffs trigger at the unit (cast_extras at_self), say 0; so does an ability found below the root
    # by path that the root's groups reach with no `_trigger` (path_route) or that the start buffs cast at the unit
    # (started_at_self); one an AbilitySelectableGroup root picks with a `_trigger` names the configs' triggers (`aimBy`); any
    # other says nothing
    trig = isinstance(sk.get('_trigger'), dict) and bool(sk['_trigger'].get('m_PathID'))
    aim = None
    ab = next((a for a in map(ability, root) if a is not None), None)
    if ab is None:
        # a group root: its first child with a clip of its own, in the group's order (执律者 S2: knock_back `Skill`, not the
        # clip-less aura that sorts first by name)
        ab = next((a for a in map(ability, group_children(sid, comps3)[1]) if a is not None and a.get('anim')), None)
    if ab is not None and e['cls'] == 'cast' and not trig:
        aim = 0
    if ab is None:
        at_self = set()
        extras = cast_extras(sid, sk, comps3, templates, at_self)
        later = [gp for gp, now in extras.items() if not now]
        # only an ability the skill itself casts as it starts stands for its skill ability: one its root's groups reach
        # (path_route), an extra or another ability its start buffs trigger (cast_extras, start_triggered). Another one is
        # cast later by something else — a behaviour's field (予愿安洁莉娜 S3 RestoreAbility: `_restoreAbility` of the
        # skill's MoveLikeRespawnByProjectileBehaviour, cast as she flies home) — or by nothing (凯尔希·思衡托 S2 S3_Spawn:
        # a copy of 维什戴尔 S3's, which only her `wisdel_s_3[trigger_spawn]` names); with none left the skill ability is
        # the root's own clip-less one (a buff ability: no clip, no turn — the record has no `ability`)
        names = start_triggered(sid, comps3, templates)[0]
        started = [gp for gp, now in extras.items() if now]

        def cast_at_start(gp):
            return (any(gp == x or gp.startswith(x + '/') for x in started) or bool(path_names(comps3, gp) & names)
                    or path_route(sid, comps3, gp) is not None)
        subs = sorted((gp, a) for gp, a in ((gp, ability(d)) for gp, d in comps if gp != sid and not any(gp == x or gp.startswith(x + '/') for x in later))
                      if a is not None and cast_at_start(gp))
        ab = subs[0][1] if subs else None
        if ab is not None and e['cls'] == 'cast':
            # how the root reaches it (path_route): through groups or an AbilitySelectableGroup — cast directly without a
            # `_trigger`; with one, at that trigger's target (the default: `trig`), or at the first picked config's (`aimBy`) —,
            # or an extra / child ability the skill's start buffs cast at the unit
            path = subs[0][0]
            route = path_route(sid, comps3, path)
            if any(path == x or path.startswith(x + '/') for x in at_self) or started_at_self(sid, comps3, templates, path):
                aim = 0
            elif route is not None and not trig:
                aim = 0
            elif isinstance(route, tuple):
                e['aimBy'] = [trigger_entry({'_trigger': c.get('_trigger')}, comps3) or {'sel': 'never'}
                              if not c.get('_useInputTarget') else {'sel': '?'} for c in route[1]]
    if aim == 0:
        e['aim'] = 0
    # the ThreePart component that plays the clip of an ability with no `_animKey` (ThreePartChannelingAnimation `_default`,
    # ThreePartOneshotAnimation `_beginAnim` / `_oneshotAnim`): the clip's OnAttack frame is what the ability waits for
    if ab is not None and not ab.get('anim'):
        for d in root:
            ch = d.get('_default')
            if isinstance(ch, dict) and ch.get('beginAnim'):
                ab['chan'] = {'begin': ch['beginAnim'], 'loop': ch.get('loopAnim') or '', 'end': ch.get('endAnim') or ''}
            elif d.get('_oneshotAnim'):
                ab['three'] = {'begin': d.get('_beginAnim') or '', 'oneshot': d['_oneshotAnim']}
    e['ability'] = ab
    e.update(group_subs(sid, comps3))
    return e


def resolve_clips(entry, keys):
    """The clip names of `entry`'s ability through its operator's skin key table: `clip` (when it is not the key), chan / three;
    the begin clips (`begin`, `beginDown`) too."""
    for k in ('begin', 'beginDown'):
        if entry.get(k):
            entry[k] = keys.get(entry[k], entry[k])
    ab = entry.get('ability')
    if not isinstance(ab, dict):
        return
    if ab.get('anim') and keys.get(ab['anim'], ab['anim']) != ab['anim']:
        ab['clip'] = keys[ab['anim']]
    for part in ('chan', 'three'):
        if isinstance(ab.get(part), dict):
            ab[part] = {k: keys.get(v, v) for k, v in ab[part].items()}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--client', action='append', help='an Arknights_Data folder (repeatable; default: EN, then CN — client_path.py)')
    ap.add_argument('--out', default=str(OUT))
    ap.add_argument('--id', action='append', default=[], help='only the skills of this operator (repeatable): every other row stays as the earlier run wrote it')
    args = ap.parse_args()
    want = set()
    for prefabs in char_skill_prefabs().values():
        want.update(p for p in prefabs if p)
    if args.id:
        want = skills_of(args.id, char_skill_prefabs())
    comps, templates = {}, {}
    for client in clients(args.client):
        for k, v in buff_templates(client).items():
            templates.setdefault(k, v)
        # (`$comp`: the component order, which `SelectorTrigger.Awake`'s GetComponent<TargetSelector> follows — trigger_entry)
        bundle = skill_bundle(client)
        tree = load_tree(str(bundle), comp_index=True)[0] if bundle else []
        if not tree:
            print(f'no skill bundle under {client}', file=sys.stderr)
            continue
        found = {}
        for gp, d, _pid in tree:
            root = gp.split('/')[0]
            if root in want and root not in comps:
                found.setdefault(root, []).append((gp, d, _pid))
        comps.update(found)
        print(f'{client}: {len(found)} skills')
    if not comps:
        sys.exit('no skill read')
    out = {}
    table = skin_keys()
    owner = {p: cid for cid, prefabs in char_skill_prefabs().items() for p in prefabs if p}
    for sid in sorted(comps):
        e = skill_entry(sid, comps[sid], templates)
        if e:
            resolve_clips(e, table.get(owner.get(sid), {}))
            out[sid] = e
    prev = earlier(args.out).get('skills') or {}
    old = kept_all(prev, comps) if args.id else kept(prev, comps, want)
    out.update(old)
    Path(args.out).write_text(json.dumps({'skills': out}, ensure_ascii=False, indent=1, sort_keys=True) + '\n', encoding='utf-8')
    print(f'{len(out) - len(old)} of {len(want)} skills read -> {args.out}'
          + (f'; the other {len(old)} rows kept' if args.id else f'; kept from the earlier run: {", ".join(old)}' if old else ''))


if __name__ == '__main__':
    main()
