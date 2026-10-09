#!/usr/bin/env python3
"""Local patch (docs/LOCAL-PATCH.md 「공식 맵 렌더링」): the textures of the 活性源石 (tile_infection) effects.

Two client effects, both rebuilt in the browser from the numbers in public/js/render/board3d/infection.js and
public/js/render/infectionMark.js (their geometry / colours / clips are written there; only the textures come from here):

  map_promote_01                   the tile's `_effect` (battle/prefabs/effects/map.ab): four built-in Quads standing
                                   around the tile, material map_promote_04 (Torappu/Particles/Dissolve/Dissolve(CustomData))
                                   → _MainTex flow_26 (red streaks in alpha), _DissolveTex mask_123 (fade along the wall)
  common_acute_infection_buff_01   the tile buff's overrideEffectKey (battle/prefabs/effects/common.ab): the red 「!!!」 on
                                   a unit that touched the tile → kuangre_01 (the icon) and star_02 (its glow)

Output: public/assets/local/board/fx/<name>.png and the manifest group `board/fx` in data/local-assets.json (re-read
right before writing; the other groups are kept). The textures sit in other bundles, found through the CAB index of
fx_extract.py (`fx_extract.py --build-cab-index .cache/fx-cab-index.json` once).

  python -I tools/local-extract/boardfx_extract.py [--game <Arknights_Data>] [--cab-index .cache/fx-cab-index.json]
Run inside src/.venv-extract (UnityPy).
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aklz4  # noqa: F401,E402  (registers the client's LZ4 variant with UnityPy)
import UnityPy  # noqa: E402
import extract  # noqa: E402  (merge_manifest)

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_GAME = str(ROOT / '.client' / 'Arknights_Data')  # the client folder: .client/ in the repository (a link to the install, git-ignored), or --game
SUB = 'board/fx'
# (bundle under PersistentData/Bundles or StreamingAssets/AB/Windows, material, texture slots to export)
WANT = [
    ('battle/prefabs/effects/map.ab', 'map_promote_04', ('_MainTex', '_DissolveTex')),
    ('battle/prefabs/effects/common.ab', 'kuangre_01_ab', ('_MainTex',)),
    ('battle/prefabs/effects/common.ab', 'star_02_ab', ('_MainTex',)),
]


def bundle_path(game, rel):
    for base in ('PersistentData/Bundles', 'StreamingAssets/AB/Windows'):
        p = Path(game) / base / rel
        if p.exists():
            return p
    raise FileNotFoundError(rel)


def load_with_deps(path, game, cab):
    """The bundle plus the bundles its external CABs live in (two levels: textures of materials of prefabs)."""
    env = UnityPy.load(str(path))
    seen = {str(path)}
    for _ in range(2):
        for f in list(env.files.values()):
            for sf in getattr(f, 'files', {}).values():
                for e in getattr(sf, 'externals', []):
                    rel = cab.get(e.path.split('/')[-1])
                    full = str(Path(game) / rel) if rel else None
                    if full and full not in seen:
                        seen.add(full)
                        try:
                            env.load_file(full)
                        except Exception as ex:  # a missing dependency only loses its textures
                            print(f'warn: dependency {rel}: {ex}', file=sys.stderr)
    return env


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--game', default=DEFAULT_GAME)
    ap.add_argument('--cab-index', default=str(ROOT / '.cache/fx-cab-index.json'))
    ap.add_argument('--out', default=str(ROOT / 'public/assets/local'))
    ap.add_argument('--manifest', default=str(ROOT / 'data/local-assets.json'))
    args = ap.parse_args()
    cab = json.loads(Path(args.cab_index).read_text(encoding='utf-8'))
    out_dir = Path(args.out) / SUB
    out_dir.mkdir(parents=True, exist_ok=True)
    group = {}
    envs = {}
    for rel, mat_name, slots in WANT:
        env = envs.get(rel) or load_with_deps(bundle_path(args.game, rel), args.game, cab)
        envs[rel] = env
        mat = next((o.read() for o in env.objects if o.type.name == 'Material' and o.read().m_Name == mat_name), None)
        if mat is None:
            print(f'FAIL {rel}: no material {mat_name}')
            continue
        for slot, tv in mat.m_SavedProperties.m_TexEnvs:
            if slot not in slots or not tv.m_Texture.m_PathID:
                continue
            tex = tv.m_Texture.read()
            img = tex.image
            name = extract.safe_name(tex.m_Name)
            img.save(out_dir / f'{name}.png')
            group[name] = {'path': f'/assets/local/{SUB}/{name}.png', 'w': img.size[0], 'h': img.size[1], 'kind': 'Texture2D'}
            print(f'{mat_name}.{slot} → {name}.png {img.size[0]}×{img.size[1]}')
    old = {}
    if Path(args.manifest).exists():
        try:
            old = json.loads(Path(args.manifest).read_text(encoding='utf-8')).get('groups') or {}
        except (OSError, ValueError) as ex:
            print(f'warn: previous manifest unreadable ({ex})', file=sys.stderr)
    groups = extract.merge_manifest(old, {SUB: group} if group else {}, {SUB} if group else set())
    count = sum(len(v) for v in groups.values())
    doc = {'version': 1, 'source': 'local-client', 'count': count, 'groups': groups}
    Path(args.manifest).write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{len(group)} textures → {out_dir} ({SUB} in {args.manifest})')


if __name__ == '__main__':
    main()
