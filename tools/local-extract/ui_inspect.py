#!/usr/bin/env python3
"""Local patch: read the official UI geometry of a local Arknights client (docs/LOCAL-PATCH.md 「크기 단위」).

The official-look UI work (shop, prep HUD, bond popup, …) takes its sizes from the client prefabs: RectTransforms in
the 1280×720 canvas unit, Image sprites, legacy Text font size / alignment. Two reads:

  prefab  <bundle> <GameObject name> [--all]
      the RectTransform tree under that GameObject: anchors, anchoredPosition, sizeDelta, pivot, scale, and per node
      the Image sprite (+ preserveAspect, type), Text font size / best fit / alignment / line spacing, layout fields.
      --all prints every GameObject of that name (default: the first, usually the prefab root).
  sprites <bundle> [substring ...]
      every Sprite (name containing one of the substrings, case-insensitive; none = all): its rect, the packed
      texture rect and offset. A tight-packed sprite has a texture smaller than its rect — the web PNGs are that
      texture, so the transparent margin must be put back when drawing (bond glyphs: rect 128, texture ~100).

<bundle> is a path, or a path under the client's Bundles folder (default
<client>/PersistentData/Bundles, the client as in client_path.py, --client to change), e.g.
  python -I tools/local-extract/ui_inspect.py prefab 'ui/autochess/[uc]autochessbattle.ab' autochess_hud_bond_item
  python -I tools/local-extract/ui_inspect.py sprites 'ui/autochess/[uc]autochesscommon.ab' Ship

Text alignment (legacy UnityEngine.UI.Text m_Alignment): 0 UpperLeft 1 UpperCenter 2 UpperRight 3 MiddleLeft
4 MiddleCenter 5 MiddleRight 6 LowerLeft 7 LowerCenter 8 LowerRight. Run inside src/.venv-extract (UnityPy).
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import aklz4  # noqa: F401,E402  (registers the client's LZ4 variant with UnityPy)
import UnityPy  # noqa: E402

from client_path import client_data  # noqa: E402
DEFAULT_CLIENT = client_data('PersistentData', 'Bundles')  # SP_CLIENT / .env / .client (client_path.py); --client overrides
ALIGN = ['UpperLeft', 'UpperCenter', 'UpperRight', 'MiddleLeft', 'MiddleCenter', 'MiddleRight', 'LowerLeft', 'LowerCenter', 'LowerRight']
IMAGE_TYPE = ['Simple', 'Sliced', 'Tiled', 'Filled']


def bundle_path(p, client):
    return p if os.path.exists(p) else os.path.join(client, p)


def v2(v):
    return f"({round(v['x'], 2):g},{round(v['y'], 2):g})"


class Bundle:
    def __init__(self, path):
        self.env = UnityPy.load(path)
        self.objs = {o.path_id: o for o in self.env.objects}

    def tree(self, pid):
        o = self.objs.get(pid)
        if o is None:
            return None
        try:
            return o.read_typetree()
        except Exception:
            return None

    def name_of(self, ref):
        pid = ref.get('m_PathID') if isinstance(ref, dict) else None
        if not pid:
            return None
        d = self.tree(pid)
        return d.get('m_Name') if d else f'<{pid}>'

    def components(self, go):
        for c in go.get('m_Component', []):
            pid = c['component']['m_PathID']
            o = self.objs.get(pid)
            if o is not None:
                yield o


def mono_fields(b, m):
    out = []
    if 'm_Sprite' in m:
        out.append(f"sprite={b.name_of(m['m_Sprite'])}")
        if m.get('m_Type'):
            out.append(f"type={IMAGE_TYPE[m['m_Type']] if m['m_Type'] < 4 else m['m_Type']}")
        if m.get('m_PreserveAspect'):
            out.append('preserveAspect')
        col = m.get('m_Color')
        if col and (col['r'], col['g'], col['b'], col['a']) != (1, 1, 1, 1):
            out.append('color=#%02x%02x%02x/%.2f' % (round(col['r'] * 255), round(col['g'] * 255), round(col['b'] * 255), col['a']))
    fd = m.get('m_FontData')
    if fd:
        a = fd.get('m_Alignment', 0)
        out.append(f"font={b.name_of(fd.get('m_Font')) or '?'} size={fd['m_FontSize']}"
                   + (f" bestFit={fd['m_MinSize']}-{fd['m_MaxSize']}" if fd.get('m_BestFit') else '')
                   + f" align={ALIGN[a] if a < 9 else a} lineSpacing={round(fd.get('m_LineSpacing', 1), 2):g}")
        col = m.get('m_Color')
        if col:
            out.append('color=#%02x%02x%02x/%.2f' % (round(col['r'] * 255), round(col['g'] * 255), round(col['b'] * 255), col['a']))
        if m.get('m_Text'):
            out.append(f"text={m['m_Text']!r}"[:80])
    for k in ('m_fontSize', 'm_text'):  # TextMeshPro
        if k in m and m[k] not in ('', None):
            out.append(f"{k}={m[k]!r}"[:80])
    for k in ('m_Spacing', 'm_ChildAlignment', 'm_PreferredWidth', 'm_PreferredHeight', 'm_MinWidth', 'm_MinHeight', 'm_FlexibleWidth'):
        if k in m and m[k] not in (0, -1, 0.0, -1.0):
            out.append(f"{k[2:]}={m[k]}")
    if 'm_Padding' in m and isinstance(m['m_Padding'], dict) and any(m['m_Padding'].values()):
        out.append(f"padding={m['m_Padding']}")
    return out


def walk(b, go, depth):
    rt = None
    extra = []
    for c in b.components(go):
        t = c.type.name
        if t == 'RectTransform':
            rt = c.read_typetree()
        elif t == 'MonoBehaviour':
            try:
                extra += mono_fields(b, c.read_typetree())
            except Exception:
                pass
    if rt is None:
        print('  ' * depth + go['m_Name'] + ' (no RectTransform)')
        return
    active = '' if go.get('m_IsActive', 1) else ' [inactive]'
    print('  ' * depth + go['m_Name'] + active,
          'amin', v2(rt['m_AnchorMin']), 'amax', v2(rt['m_AnchorMax']), 'pos', v2(rt['m_AnchoredPosition']),
          'size', v2(rt['m_SizeDelta']), 'piv', v2(rt['m_Pivot']),
          *([] if (rt['m_LocalScale']['x'], rt['m_LocalScale']['y']) == (1, 1) else ['scale', v2(rt['m_LocalScale'])]),
          *extra)
    for ch in rt['m_Children']:
        t = b.tree(ch['m_PathID'])
        if t:
            g = b.tree(t['m_GameObject']['m_PathID'])
            if g:
                walk(b, g, depth + 1)


def cmd_prefab(a):
    b = Bundle(bundle_path(a.bundle, a.client))
    roots = [o.read_typetree() for o in b.env.objects if o.type.name == 'GameObject' and o.read_typetree().get('m_Name') == a.name]
    if not roots:
        sys.exit(f'no GameObject named {a.name!r}')
    for go in roots if a.all else roots[:1]:
        walk(b, go, 0)
        print()


def cmd_sprites(a):
    b = Bundle(bundle_path(a.bundle, a.client))
    subs = [s.lower() for s in a.substr]
    for o in b.env.objects:
        if o.type.name != 'Sprite':
            continue
        d = o.read_typetree()
        n = d['m_Name']
        if subs and not any(s in n.lower() for s in subs):
            continue
        rd = d['m_RD']
        r, t, off = d['m_Rect'], rd['textureRect'], rd.get('textureRectOffset', {'x': 0, 'y': 0})
        tight = abs(r['width'] - t['width']) > 0.5 or abs(r['height'] - t['height']) > 0.5
        print(f"{n}: rect {r['width']:g}×{r['height']:g}  texture {t['width']:.2f}×{t['height']:.2f} at offset {v2(off)}"
              + ('  (tight-packed: web PNG lacks the margin)' if tight else '')
              + (f"  border {d['m_Border']}" if any(d.get('m_Border', {}).values()) else ''))


def main():
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('--client', default=DEFAULT_CLIENT, help='the client Bundles folder')
    sub = p.add_subparsers(dest='cmd', required=True)
    q = sub.add_parser('prefab')
    q.add_argument('bundle')
    q.add_argument('name')
    q.add_argument('--all', action='store_true')
    q.set_defaults(fn=cmd_prefab)
    q = sub.add_parser('sprites')
    q.add_argument('bundle')
    q.add_argument('substr', nargs='*')
    q.set_defaults(fn=cmd_sprites)
    a = p.parse_args()
    a.fn(a)


if __name__ == '__main__':
    main()
