#!/usr/bin/env python3
"""Local patch: read the official UI geometry of a local Arknights client (docs/LOCAL-PATCH.md 「크기 단위」).

The official-look UI work (shop, prep HUD, bond popup, …) takes its sizes from the client prefabs: RectTransforms in
the 1280×720 canvas unit, Image sprites, legacy Text font size / alignment. Two reads:

  prefab  <bundle> <GameObject name> [--all]
      the RectTransform tree under that GameObject: anchors, anchoredPosition, sizeDelta, pivot, scale, and per node
      the Image sprite (+ preserveAspect, type), Text font size / best fit / alignment / line spacing, layout fields;
      a Text whose font is empty (font=?) takes it by name at run time — `dynFont=` prints that name (DynFontLoader).
      --all prints every GameObject of that name (default: the first, usually the prefab root).
  layout  <bundle> <GameObject name> [--canvas WxH --match M] [--screen WxH] [--css-px-per-unit K] [--out FILE]
      the same tree solved into absolute rects (ui_layout.py: anchors, pivots, scales, the stock layout groups,
      layout elements and content size fitters in Unity's order) as JSON, with each node's Image (sprite, type,
      9-slice border, preserveAspect, colour) and Text (font, size, colour, alignment, line spacing). What the tool
      cannot know is the string 「모름」, never a default: a Text's preferred size, a GridLayoutGroup, a rotation, a
      game script (listed per node under `unknown`). The canvas is the root's CanvasScaler, else --canvas / --match
      (the battle UI page: 1280x720, match 0 — docs/rules/ui.md 「크기 단위」); --screen gives screen px per unit
      (CanvasScaler ScaleWithScreenSize × --ui-scale, the PC setting, default 1) or --px-per-unit measured on a
      screenshot, --offset where the screen's top left sits in the image; --parent-rect lays a row prefab into a
      slot of another layout. The output format: "Output (layout)" below.
  draw    <layout.json> <image> <out.png> [--only REGEX] [--max-depth N] [--labels]
      the layout's `screen` rects as boxes over a screenshot (a node whose rect is 「모름」 is left out).
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

Output (layout), schema 1 — kept stable for the tools that read it (a change bumps `schema`):
  {schema, tool, bundle, root, canvas: {reference, match, screenMatchMode, uiScale, refPixelsPerUnit, source, units,
   screen, pxPerUnit, offset, cssPxPerUnit, parentRect}, unknownClasses: {class: count}, unresolved: count,
   nodes: [{path, name, depth, active, activeInHierarchy,
            rect: {x, y, w, h}            canvas units, origin at the canvas's top left, y down (the axis-aligned box
                                          after scales); a value the tool cannot solve is "모름"
            worldScale: [x, y]            the product of the scales above (only when not [1, 1]; a Text's size is
                                          scaled by it, cssSize includes it)
            screen: {x, y, w, h}          screenshot px (with --screen), css: {x, y, w, h} (with --css-px-per-unit)
            local: {anchorMin, anchorMax, anchoredPosition, sizeDelta, pivot, scale}   as serialized
            driven: {anchors, anchoredPosition, sizeDelta}   what a layout group / size fitter set (null = that axis
                                          untouched)
            image: {sprite, type, preserveAspect, color: [#rrggbb, alpha], spriteRect, border: [left, bottom, right,
                    top], texture, fill, fillCenter, pixelsPerUnitMultiplier, class}
            text: {font, dynFont, size, cssSize, style, align, lineSpacing, color, hOverflow, vOverflow, richText,
                   alignByGeometry, bestFit: [min, max], text}
            rawImage, tmp, mask, effects, canvasGroup: {alpha}, animated,
            layout: {group: {kind, padding: [l, r, t, b], spacing, childAlignment, controlSize: [w, h],
                             forceExpand, useScale, reverse}, element: {ignoreLayout, min, preferred, flexible,
                             priority}, fitter: [horizontal, vertical]},
            unknown: [class]              game scripts on the node (their effect on the rect is not known)
            unsure: [text]                those whose name says they may move rects
            unresolved: [text]}]}         why a value is "모름"
  Paths are unique: a repeated sibling name is suffixed #2, #3, … in prefab order.
"""
import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import aklz4  # noqa: F401,E402  (registers the client's LZ4 variant with UnityPy)
import UnityPy  # noqa: E402

from client_path import ROOT, client_data  # noqa: E402
import ui_layout  # noqa: E402
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
    if m.get('_fontName'):  # a Text with an empty m_Font takes its font by name at run time (DynFontLoader)
        out.append(f"dynFont={m['_fontName']}")
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


DATA_ROOTS = ('StreamingAssets', 'PersistentData')
CAB_INDEXES = [ROOT / '.cache/fx-cab-index-cn.json', ROOT / '.cache/fx-cab-index.json']


def data_root_of(path):
    """The client's Arknights_Data folder above a bundle path (the CAB index paths are relative to it)."""
    parts = os.path.abspath(path).split(os.sep)
    for i in range(len(parts) - 1, 0, -1):
        if parts[i] in DATA_ROOTS:
            return os.sep.join(parts[:i])
    return None


class Refs:
    """PPtrs of the prefab's file: its own objects, and those of the files it names (MonoScripts, sprites of a common
    bundle), found through a CAB index of the same client."""

    def __init__(self, bundle, path, cab_index, scripts):
        self.b = bundle
        self.root = data_root_of(path)
        self.cab = {}
        for p in ([cab_index] if cab_index else CAB_INDEXES):
            try:
                idx = json.loads(open(p, encoding='utf-8').read())
            except OSError:
                continue
            if self.root and all(os.path.exists(os.path.join(self.root, rel)) for rel in list(idx.values())[:3]):
                self.cab = idx
                break
        self.files = {}
        self.scripts = scripts
        self.script_names = {}

    def externals(self, fid):
        o = next(iter(self.b.objs.values()))
        ex = o.assets_file.externals
        if not 0 < fid <= len(ex):
            return None
        m = re.search(r'(CAB-[0-9a-f]+)', ex[fid - 1].path)
        return m.group(1) if m else None

    def ext_objects(self, cab):
        if cab not in self.files:
            rel = self.cab.get(cab)
            self.files[cab] = {o.path_id: o for o in UnityPy.load(os.path.join(self.root, rel)).objects} if rel else None
        return self.files[cab]

    def obj(self, ref):
        """The object a PPtr names; False for a null reference, None when its file cannot be found."""
        if not isinstance(ref, dict) or not ref.get('m_PathID'):
            return False
        fid = ref.get('m_FileID', 0)
        if fid == 0:
            return self.b.objs.get(ref['m_PathID'])
        cab = self.externals(fid)
        objs = self.ext_objects(cab) if cab else None
        return objs.get(ref['m_PathID']) if objs else None

    def script(self, ref):
        key = (ref.get('m_FileID'), ref.get('m_PathID'))
        if key in self.script_names:
            return self.script_names[key]
        o = self.obj(ref)
        if not o and self.scripts:
            o = self.scripts.get(ref.get('m_PathID'))
        if not o:
            cab = self.externals(ref.get('m_FileID', 0)) or '?'
            sys.exit(f'the class of a component is in {cab}, which no CAB index of this client lists: give --scripts '
                     f'<that bundle> or --cab-index (fx_extract.py --build-cab-index); without the class names the '
                     f'layout cannot be solved')
        d = o.read_typetree()
        name = f"{d['m_Namespace']}.{d['m_ClassName']}" if d.get('m_Namespace') else d['m_ClassName']
        self.script_names[key] = name
        return name

    def name(self, ref):
        o = self.obj(ref)
        if o is False:
            return None
        if o is None:
            return ui_layout.MOREUM
        try:
            return o.read_typetree().get('m_Name')
        except Exception:
            return ui_layout.MOREUM

    def sprite(self, ref):
        o = self.obj(ref)
        if o is False or o is None:
            return o
        d = o.read_typetree()
        r, b, rd = d['m_Rect'], d.get('m_Border'), d.get('m_RD', {})
        out = {'name': d['m_Name'], 'rect': [r['x'], r['y'], r['width'], r['height']], 'pixelsPerUnit': d.get('m_PixelsToUnits', 100)}
        if b is not None:
            out['border'] = [b['x'], b['y'], b['z'], b['w']]
        t = rd.get('textureRect')
        if t:
            out['texture'] = [t['width'], t['height']]
        return out


def read_tree(b, refs, go):
    """A GameObject and its children as ui_layout's plain dicts."""
    rt, comps = None, []
    for c in b.components(go):
        t = c.type.name
        if t in ('RectTransform', 'Transform'):
            d = c.read_typetree()
            if t == 'RectTransform':
                q = d.get('m_LocalRotation', {'x': 0, 'y': 0, 'z': 0, 'w': 1})
                rt = {'amin': [d['m_AnchorMin']['x'], d['m_AnchorMin']['y']], 'amax': [d['m_AnchorMax']['x'], d['m_AnchorMax']['y']],
                      'pos': [d['m_AnchoredPosition']['x'], d['m_AnchoredPosition']['y']],
                      'size': [d['m_SizeDelta']['x'], d['m_SizeDelta']['y']], 'pivot': [d['m_Pivot']['x'], d['m_Pivot']['y']],
                      'scale': [d['m_LocalScale']['x'], d['m_LocalScale']['y']],
                      'rotated': abs(q['x']) + abs(q['y']) + abs(q['z']) > 1e-6}
            else:
                rt = {'amin': [0.5, 0.5], 'amax': [0.5, 0.5], 'pos': [0, 0], 'size': [0, 0], 'pivot': [0.5, 0.5], 'norect': True}
            kids = d['m_Children']
        elif t == 'MonoBehaviour':
            try:
                d = c.read_typetree()
            except Exception:
                comps.append({'cls': ui_layout.MOREUM, 'enabled': True, 'f': {}})
                continue
            comps.append({'cls': refs.script(d['m_Script']), 'enabled': bool(d.get('m_Enabled', 1)), 'f': d})
        else:
            try:
                d = c.read_typetree()
            except Exception:
                d = {}
            comps.append({'cls': t, 'enabled': bool(d.get('m_Enabled', 1)), 'f': d})
    children = []
    for ch in kids if rt else []:
        t = b.tree(ch['m_PathID'])
        g = b.tree(t['m_GameObject']['m_PathID']) if t else None
        if g:
            children.append(read_tree(b, refs, g))
    return {'name': go['m_Name'], 'active': bool(go.get('m_IsActive', 1)), 'rt': rt or {'amin': [0.5, 0.5], 'amax': [0.5, 0.5], 'pos': [0, 0], 'size': [0, 0], 'pivot': [0.5, 0.5], 'norect': True},
            'comps': comps, 'children': children}


def pair(s, kind=float, n=2):
    v = [kind(x) for x in re.split('[x,]', s)]
    if len(v) != n:
        raise argparse.ArgumentTypeError(f'{s!r}: {n} numbers')
    return v


def cmd_layout(a):
    path = bundle_path(a.bundle, a.client)
    b = Bundle(path)
    scripts = None
    if a.scripts:
        scripts = {o.path_id: o for o in UnityPy.load(bundle_path(a.scripts, a.client)).objects if o.type.name == 'MonoScript'}
    refs = Refs(b, path, a.cab_index, scripts)
    roots = [o.read_typetree() for o in b.env.objects if o.type.name == 'GameObject' and o.read_typetree().get('m_Name') == a.name]
    if not roots:
        sys.exit(f'no GameObject named {a.name!r}')
    if a.index >= len(roots):
        sys.exit(f'{a.name!r}: {len(roots)} GameObjects of that name, --index {a.index} is past them')
    tree = read_tree(b, refs, roots[a.index])
    scaler = next((c for c in tree['comps'] if c['cls'] == 'UnityEngine.UI.CanvasScaler' and c['enabled']), None)
    if a.canvas:
        reference, source = a.canvas, 'arguments'
        mode = a.match_mode
        match = a.match
    elif scaler:
        f = scaler['f']
        if f.get('m_UiScaleMode') != 1:
            sys.exit(f"the root's CanvasScaler is not ScaleWithScreenSize (m_UiScaleMode {f.get('m_UiScaleMode')}): give --canvas")
        reference, source = [f['m_ReferenceResolution']['x'], f['m_ReferenceResolution']['y']], 'CanvasScaler on the root'
        mode, match = f.get('m_ScreenMatchMode'), f.get('m_MatchWidthOrHeight')
    else:
        sys.exit(f'no CanvasScaler on {a.name!r}: give --canvas WxH and --match M (the battle UI page: --canvas 1280x720 '
                 f'--match 0, docs/rules/ui.md 「크기 단위」)')
    ref_ppu = a.ref_ppu or (scaler['f'].get('m_ReferencePixelsPerUnit') if scaler else None) or 100
    ref_ppu_source = 'argument' if a.ref_ppu else ('CanvasScaler' if scaler and scaler['f'].get('m_ReferencePixelsPerUnit') else 'Unity default')
    ppu = None
    if a.screen:
        if a.px_per_unit:
            ppu = a.px_per_unit
        else:
            if match is None and mode == 0 and abs(a.screen[0] / a.screen[1] - reference[0] / reference[1]) > 1e-3:
                sys.exit('the screen is not the canvas\'s shape: give --match (0 width … 1 height)')
            ppu = ui_layout.canvas_scale(reference, a.screen, match or 0, mode, a.ui_scale)
        units = [a.screen[0] / ppu, a.screen[1] / ppu]
    else:
        units = list(reference)
    nodes = ui_layout.solve(tree, units, ref_ppu=ref_ppu, sprite=refs.sprite, name=refs.name, parent_rect=a.parent_rect,
                            px_per_unit=ppu, offset=a.offset, css_px_per_unit=a.css_px_per_unit)
    unknown = {}
    for n in nodes:
        for c in n.get('unknown', []):
            unknown[c] = unknown.get(c, 0) + 1
    out = {
        'schema': ui_layout.SCHEMA, 'tool': 'ui_inspect.py layout', 'bundle': a.bundle, 'root': a.name,
        'canvas': {'reference': list(reference), 'match': match, 'screenMatchMode': mode, 'uiScale': a.ui_scale,
                   'refPixelsPerUnit': ref_ppu, 'refPixelsPerUnitSource': ref_ppu_source, 'source': source,
                   'units': [ui_layout.rnd(v, 3) for v in units], 'screen': a.screen, 'pxPerUnit': ppu and round(ppu, 6),
                   'offset': list(a.offset), 'cssPxPerUnit': a.css_px_per_unit, 'parentRect': a.parent_rect},
        'unknownClasses': dict(sorted(unknown.items())),
        'unresolved': sum(1 for n in nodes if n.get('unresolved')),
        'nodes': nodes,
    }
    text = json.dumps(out, ensure_ascii=False, indent=1)
    if a.out:
        with open(a.out, 'w', encoding='utf-8') as fh:
            fh.write(text + '\n')
    else:
        print(text)


def cmd_draw(a):
    from PIL import Image, ImageDraw
    lay = json.loads(open(a.layout, encoding='utf-8').read())
    img = Image.open(a.image).convert('RGB')
    dr = ImageDraw.Draw(img)
    pal = [(255, 64, 64), (64, 255, 64), (64, 160, 255), (255, 220, 0), (255, 64, 255), (0, 255, 255)]
    only = re.compile(a.only) if a.only else None
    n = 0
    for node in lay['nodes']:
        r = node.get('screen')
        if not r or not all(isinstance(r[k], (int, float)) for k in 'xywh'):
            continue
        if (only and not only.search(node['path'])) or (a.max_depth is not None and node['depth'] > a.max_depth):
            continue
        if not node['activeInHierarchy'] and not a.inactive:
            continue
        c = pal[node['depth'] % len(pal)]
        dr.rectangle([r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']], outline=c, width=1)
        if a.labels:
            dr.text((r['x'] + 2, r['y'] + 1), node['name'], fill=c)
        n += 1
    img.save(a.out)
    print(f'{n} boxes → {a.out}')


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
    q = sub.add_parser('layout')
    q.add_argument('bundle')
    q.add_argument('name')
    q.add_argument('--index', type=int, default=0, help='which GameObject of that name (default the first, usually the prefab root)')
    q.add_argument('--canvas', type=pair, metavar='WxH', help='the reference resolution, when the root has no CanvasScaler')
    q.add_argument('--match', type=float, help='CanvasScaler match (0 width … 1 height), with --canvas')
    q.add_argument('--match-mode', type=int, default=0, help='CanvasScaler screenMatchMode with --canvas (0 match width or height)')
    q.add_argument('--screen', type=pair, metavar='WxH', help='the screen the prefab is laid into, in px')
    q.add_argument('--ui-scale', type=float, default=1.0, help='the PC UI scale setting (0.9–1.0, default 1)')
    q.add_argument('--px-per-unit', type=float, help='screen px per canvas unit measured on a screenshot (replaces the CanvasScaler sum)')
    q.add_argument('--offset', type=pair, default=(0, 0), metavar='X,Y', help="where the screen's top left sits in the image (a crop: negative)")
    q.add_argument('--parent-rect', type=lambda s: pair(s, n=4), metavar='X,Y,W,H', help='the rect (canvas units, top left) the root is laid into, default the canvas')
    q.add_argument('--css-px-per-unit', type=float, help='our CSS px per canvas unit, for the css rects')
    q.add_argument('--ref-ppu', type=float, help='the canvas reference pixels per unit (default the CanvasScaler\'s, else 100)')
    q.add_argument('--scripts', help='the bundle holding the MonoScripts, when no CAB index lists it')
    q.add_argument('--cab-index', help='the CAB index of this client (default .cache/fx-cab-index-cn.json or fx-cab-index.json, whichever fits)')
    q.add_argument('--out', help='write the JSON here (default stdout)')
    q.set_defaults(fn=cmd_layout)
    q = sub.add_parser('draw')
    q.add_argument('layout')
    q.add_argument('image')
    q.add_argument('out')
    q.add_argument('--only', help='a regex over node paths')
    q.add_argument('--max-depth', type=int)
    q.add_argument('--labels', action='store_true')
    q.add_argument('--inactive', action='store_true', help='draw inactive nodes too')
    q.set_defaults(fn=cmd_draw)
    q = sub.add_parser('sprites')
    q.add_argument('bundle')
    q.add_argument('substr', nargs='*')
    q.set_defaults(fn=cmd_sprites)
    a = p.parse_args()
    a.fn(a)


if __name__ == '__main__':
    main()
