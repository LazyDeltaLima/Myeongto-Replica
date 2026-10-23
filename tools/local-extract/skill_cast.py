#!/usr/bin/env python3
"""How each pool skill is cast, from the local client's skill prefabs (battle/prefabs/[uc]skills.ab).

A skill prefab's root MonoBehaviour is its skill class (docs/rules/sim.md 「즉발 스킬의 시전」):
  * `ReplacementSkill` (it has `_cancelIfSearchTargetFailed`) — the cast replaces the unit's next attack: that attack goes
    out as the skill ability (the client's `ReplacementSkill.ApplyModification` / `Character.get_attack`);
  * `CastSkill` (it has `_switchToState`) — the skill ability is cast at once; `_switchToState` 1 puts the unit in its
    Skill state until that ability ends (`Character.States.SkillState._StartSkill`), 0 casts it without a state change;
    `_resetAbilityCooldownWhenCastEnd` 1 makes the ability ready again as it ends (`CastSkill.OnCastFinish`).
The skill ability is the animated ability on the root (`AbstractAnimatedAbility`: `_animKey`, `_timeMode`, `_cooldown`,
`_maxAnimScale`, `_preDelay`, `_waitForAttackEvent`), else the first one below it (a group: 引星棘刺 S2 Mark / Token, 锡人 S2
HitEnemy / HitTile play one clip). Its time (the client's `AbstractAnimatedAbility.get_cooldown` / `DoAttach` /
`UpdatePlaybackSpeed`): `_timeMode` 0 FROM_ATTACK_SPEED = the unit's attack interval, 1 FROM_ANIMATION = its clip length,
2 SPECIFIED = `_cooldown`, 3 LOAD_FROM_BLACKBOARD = the blackboard value `_cooldownKey`; the clip is scaled to that time
within [0.1, `_maxAnimScale`] as an attack's; its facing flags (`face`, as tools/local-extract/attack_timing.py: 1 its
main target, 2 its deploy direction, 3 front, 4 its first cast target, 0 none) say where the unit turns as the cast
starts (`AbstractAnimatedAbility.DealWithFaceDirection`, docs/rules/render.md 「공격 방향」). tools/build-data.mjs folds this, with the clip lengths of data/assets.json,
into every skill record of data/chess.json / data/backups.json (`cast`). `word` 0 = the skill's `_playCharWordVoice` is
off (no 作战中 line as it is cast; the record's `charWord: false`; any skill class). Output tools/assets/local-skill-cast.json:

  { "skills": { "skchr_thorn2_1": { "cls": "replace", "ability": { "anim": "Skill", "time": 0, "max": 1, "wait": 1, … } },
                "skchr_texas_2": { "cls": "cast", "state": 1, "reset": 0, "ability": { … } }, … } }

Usage (from the repo root; --client = the EN client's Arknights_Data folder; ~1 min to read the bundle):
  .venv-extract/bin/python tools/local-extract/skill_cast.py [--client <…/Arknights_Data>]
Everything read is (c) Hypergryph; only these flags and numbers are kept.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from char_modes import char_skill_prefabs, skills_tree  # noqa: E402
from client_path import client_data  # noqa: E402

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


def skill_entry(sid, comps):
    """{cls, state?, reset?, ability} of one skill prefab's components [(GameObject path, MonoBehaviour)], or None."""
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
        e = {'cls': 'cast', 'state': int(sk.get('_switchToState') or 0),
             'reset': int(sk.get('_resetAbilityCooldownWhenCastEnd') or 0), **word}
    else:
        return word or None
    ab = next((a for a in map(ability, root) if a is not None), None)
    if ab is None:
        subs = sorted((gp, a) for gp, a in ((gp, ability(d)) for gp, d in comps if gp != sid) if a is not None)
        ab = subs[0][1] if subs else None
    e['ability'] = ab
    return e


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--client', default=client_data())
    ap.add_argument('--out', default=str(OUT))
    args = ap.parse_args()
    want = set()
    for prefabs in char_skill_prefabs().values():
        want.update(p for p in prefabs if p)
    tree = skills_tree(args.client)
    if not tree:
        sys.exit(f'no skill bundle under {args.client}')
    comps = {}
    for gp, d, _pid in tree:
        root = gp.split('/')[0]
        if root in want:
            comps.setdefault(root, []).append((gp, d))
    out = {}
    for sid in sorted(comps):
        e = skill_entry(sid, comps[sid])
        if e:
            out[sid] = e
    Path(args.out).write_text(json.dumps({'skills': out}, ensure_ascii=False, indent=1, sort_keys=True) + '\n', encoding='utf-8')
    print(f'{len(out)} of {len(want)} skills -> {args.out}')


if __name__ == '__main__':
    main()
