#!/usr/bin/env python3
"""Which pool skills draw their unit's HUD as bullets, from the local client's skill prefabs (battle/prefabs/[uc]skills.ab).

A skill prefab's root MonoBehaviour (the skill class, BasicSkill and its subclasses) carries `_showSpAsBulletMode`. The
client picks the unit's HUD row from it (client code `Character.get_hudPluginMask`): while the skill is affecting (a
passive skill always, any other while it runs) the flag puts the bullet bar (`char_bullet_bar`, UIHudCharBulletBar)
in place of the SP cast slider. The bullet bar shows an ammo skill's (CastSkillWithLimitTimes) bullets left out of its
total, and for any other skill the unit's SP out of its max SP, one block per point (UIHudCharBulletBar.UpdatePlugin →
UIBulletBar.ShowBulletCount) — e.g. 琳琅诗怀雅's coins, which are her SP. docs/rules/ui.md 「탄환형 스킬」.

Output tools/assets/local-skill-hud.json (tools/build-data.mjs folds it into every skill record as `bulletMode`):

  { "skills": { "skchr_angel2_1": 1, "skchr_angel2_2": 0, … } }   (1 = `_showSpAsBulletMode` on; a skill not read is absent)

Usage (from the repo root; --client = an Arknights_Data folder, repeatable: the first client that has a skill decides it —
the EN client first, then the CN client for the operators the EN one lacks; the hot-update copy of the bundle under
PersistentData/Bundles is read before the installed one):
  .venv-extract/bin/python tools/local-extract/skill_hud.py [--client <EN …/Arknights_Data>] [--client <CN …/Arknights_Data>]
Everything read is (c) Hypergryph; only this flag is kept.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from char_modes import char_skill_prefabs, load_tree  # noqa: E402
from client_path import client_data  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tools/assets/local-skill-hud.json'
BUNDLE = 'battle/prefabs/[uc]skills.ab'


def skill_bundle(client):
    """The skill bundle of an Arknights_Data folder (the hot-update copy first), or None."""
    for p in (Path(client) / 'PersistentData/Bundles' / BUNDLE, Path(client) / 'StreamingAssets/AB/Windows' / BUNDLE):
        if p.exists():
            return p
    return None


def bullet_flags(path, want):
    """{skill prefabId: 0 | 1} of the root skill components in the bundle at `path`, for the prefabs in `want`."""
    out = {}
    tree = load_tree(str(path))[0]
    for gp, d, _pid in tree:
        if gp in want and '_showSpAsBulletMode' in d:
            out[gp] = 1 if d.get('_showSpAsBulletMode') else 0
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--client', action='append', help='an Arknights_Data folder (repeatable; default: client_path.py)')
    ap.add_argument('--out', default=str(OUT))
    args = ap.parse_args()
    want = set()
    for prefabs in char_skill_prefabs().values():
        want.update(p for p in prefabs if p)
    out = {}
    for client in args.client or [client_data()]:
        path = skill_bundle(client)
        if path is None:
            print(f'no skill bundle under {client}', file=sys.stderr)
            continue
        found = bullet_flags(path, want - set(out))
        out.update(found)
        print(f'{client}: {len(found)} skills ({sum(found.values())} with bullets)')
    if not out:
        sys.exit('no skill read')
    Path(args.out).write_text(json.dumps({'skills': dict(sorted(out.items()))}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    missing = sorted(want - set(out))
    print(f'{len(out)} of {len(want)} skills -> {args.out}' + (f'; not found: {", ".join(missing)}' if missing else ''))


if __name__ == '__main__':
    main()
