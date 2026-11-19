"""Absolute rects of an official UI prefab: the RectTransform tree solved the way Unity's UGUI lays it out.

`ui_inspect.py layout` reads a prefab into plain dicts and hands them here; this module needs no UnityPy, so it is
tested with hand-made trees (test/local-extract-ui-layout.test.js). It solves what the stock UGUI components decide:

  - anchors, anchoredPosition, sizeDelta, pivot, localScale (rotation is not solved: such a node is 「모름」);
  - HorizontalLayoutGroup / VerticalLayoutGroup (padding, spacing, child alignment, control / force expand / scale,
    reverse), LayoutElement, ContentSizeFitter (min / preferred), and the layout sizes Image gives (sprite size, or
    its 9-slice border for Sliced / Tiled), in Unity's order: the horizontal pass, then the vertical one.

What it cannot know is written as the string 「모름」 (MOREUM) in place of a number, never a default (CONTRIBUTING
section 2, a generator stops on what it does not know): a Text's preferred size (it needs the font and the string), a
GridLayoutGroup, a node with a rotation, and every component that is not a stock one it knows — a game script may
lay out its children or report a layout size of its own. Such a component is listed per node (`unknown`), and
where the solved numbers depend on it the axis is 「모름」 with the reason in `unresolved`.

Node input (one dict per GameObject):
  {name, active, rt: {amin, amax, pos, size, pivot, scale, rotated}, comps: [{cls, enabled, f: {fields}}], children}
`cls` is the component's class (`UnityEngine.UI.Image`, a game class, or a built-in type name such as `CanvasGroup`),
`f` its serialized fields as the bundle stores them. See `solve` for the output.
"""
import math

MOREUM = '모름'
SCHEMA = 1

ALIGN = ['UpperLeft', 'UpperCenter', 'UpperRight', 'MiddleLeft', 'MiddleCenter', 'MiddleRight', 'LowerLeft', 'LowerCenter', 'LowerRight']
IMAGE_TYPE = ['Simple', 'Sliced', 'Tiled', 'Filled']
FIT = ['Unconstrained', 'MinSize', 'PreferredSize']
FONT_STYLE = ['Normal', 'Bold', 'Italic', 'BoldAndItalic']
H_OVERFLOW = ['Wrap', 'Overflow']
V_OVERFLOW = ['Truncate', 'Overflow']

UI = 'UnityEngine.UI.'
HLG, VLG, GLG = UI + 'HorizontalLayoutGroup', UI + 'VerticalLayoutGroup', UI + 'GridLayoutGroup'
LE, CSF, IMAGE, TEXT = UI + 'LayoutElement', UI + 'ContentSizeFitter', UI + 'Image', UI + 'Text'
# stock components that neither report a layout size nor move a rect (the built-in types are not MonoBehaviours)
INERT = {
    'CanvasRenderer', 'CanvasGroup', 'Canvas', 'RectTransform',
    UI + 'RawImage', UI + 'Mask', UI + 'RectMask2D', UI + 'Shadow', UI + 'Outline', UI + 'Button', UI + 'Toggle',
    UI + 'ToggleGroup', UI + 'GraphicRaycaster', UI + 'CanvasScaler', UI + 'Selectable',
    'UnityEngine.EventSystems.EventTrigger',
}
# stock components that report a layout size but whose values are all -1 (no say)
SILENT_ELEMENT = {UI + 'ScrollRect'}
# what a component that moves its own or its children's rects is usually called (a game script with such a name
# gets `unsure` on its node: the solved numbers are what the stock components alone would give)
DRIVER_HINTS = ('Layout', 'Fitter', 'BestFit', 'Scroll', 'Recycle', 'Follower', 'Size', 'Grid', 'Table', 'Pager', 'Slider', 'Scrollbar')
# built-in types that animate a subtree (an animation may move rects at run time)
ANIMATED = {'Animation', 'Animator'}


GROUP_FIELDS = ('m_Padding', 'm_ChildAlignment', 'm_Spacing', 'm_ChildForceExpandWidth', 'm_ChildForceExpandHeight',
                'm_ChildControlWidth', 'm_ChildControlHeight', 'm_ChildScaleWidth', 'm_ChildScaleHeight', 'm_ReverseArrangement')
LE_FIELDS = ('m_IgnoreLayout', 'm_MinWidth', 'm_MinHeight', 'm_PreferredWidth', 'm_PreferredHeight', 'm_FlexibleWidth',
             'm_FlexibleHeight', 'm_LayoutPriority')


def solvable_group(c):
    """A horizontal / vertical group whose fields are all there (a missing one makes the group 「모름」, not a default)."""
    return c['cls'] in (HLG, VLG) and all(k in c['f'] for k in GROUP_FIELDS)


def num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def rnd(v, nd=2):
    if not num(v):
        return MOREUM
    r = round(v, nd)
    return 0.0 if r == 0 else r


def color(c):
    if not isinstance(c, dict) or not all(k in c for k in 'rgba'):
        return MOREUM
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(c[k] * 255))) for k in 'rgb'), rnd(c['a'], 3)


def enum(table, v):
    if isinstance(v, int) and 0 <= v < len(table):
        return table[v]
    return f'{MOREUM}({v})'


class Node:
    def __init__(self, d, parent, path):
        self.name = d['name']
        self.parent = parent
        self.path = path
        self.active_self = bool(d.get('active', True))
        self.active = self.active_self and (parent.active if parent else True)
        rt = d['rt']
        self.serialized = rt
        self.amin = list(rt['amin'])
        self.amax = list(rt['amax'])
        self.pos = list(rt['pos'])
        self.size = list(rt['size'])
        self.pivot = list(rt['pivot'])
        self.scale = list(rt.get('scale', [1, 1]))
        self.rotated = bool(rt.get('rotated'))
        self.comps = [c for c in d.get('comps', [])]
        self.children = []
        self.unresolved = []          # reasons an axis is 「모름」
        self.unsure = []               # game scripts that may move this rect or its children
        self.known_axis = [True, True]  # False: this node's own placement on that axis is 「모름」
        self.driven = {}               # what the solver changed: {field: [x, y]}
        if rt.get('norect'):           # a plain Transform: no rect of its own
            self.known_axis = [False, False]
            self.unresolved.append(f'{path}: no RectTransform')

    def comp(self, cls):
        for c in self.comps:
            if c['cls'] == cls and c.get('enabled', True):
                return c
        return None

    def layout_group(self):
        for cls in (HLG, VLG, GLG):
            c = self.comp(cls)
            if c:
                return c
        return None

    def unknown_classes(self):
        return [c['cls'] for c in self.comps if c['cls'] not in KNOWN]


KNOWN = INERT | SILENT_ELEMENT | ANIMATED | {HLG, VLG, GLG, LE, CSF, IMAGE, TEXT}


def build(d, parent=None, path=None):
    """The node tree; a path names a node uniquely (a repeated sibling name gets #2, #3, … in the order of the
    prefab)."""
    n = Node(d, parent, path if path is not None else d['name'])
    seen = {}
    for c in d.get('children', []):
        k = seen[c['name']] = seen.get(c['name'], 0) + 1
        n.children.append(build(c, n, f"{n.path}/{c['name']}" + (f'#{k}' if k > 1 else '')))
    return n


def walk(n):
    yield n
    for c in n.children:
        yield from walk(c)


# ---------------------------------------------------------------- layout inputs (LayoutUtility / ILayoutElement)

def rect_children(n):
    """LayoutGroup.rectChildren: active children whose LayoutElement does not ignore layout."""
    out = []
    for c in n.children:
        if not c.active:
            continue
        ignorers = [k for k in c.comps if k['cls'] == LE]     # ILayoutIgnorer: enabled or not, as Unity reads it
        if ignorers and all(k['f'].get('m_IgnoreLayout') for k in ignorers):
            continue
        out.append(c)
    return out


def element_values(n, axis, ctx):
    """[(priority, min, preferred, flexible)] of the ILayoutElement components on n; a value None = 「모름」;
    a component of unknown priority gives priority None."""
    out = []
    xy = 'Width' if axis == 0 else 'Height'
    for c in n.comps:
        if not c.get('enabled', True):
            continue
        cls, f = c['cls'], c['f']
        if cls == LE:
            if all(k in f for k in LE_FIELDS):
                out.append((f['m_LayoutPriority'], f[f'm_Min{xy}'], f[f'm_Preferred{xy}'], f[f'm_Flexible{xy}']))
            else:
                out.append((None, None, None, None))
        elif cls in (HLG, VLG) and solvable_group(c):
            t = group_inputs(n, axis, ctx)
            out.append((0, *t))
        elif cls in (HLG, VLG, GLG):
            out.append((0, None, None, None))
        elif cls == IMAGE:
            out.append((0, 0, image_preferred(c, axis, ctx), -1))
        elif cls == TEXT:
            out.append((0, 0, None, -1))
        elif cls in SILENT_ELEMENT or cls in INERT or cls in ANIMATED or cls == CSF:
            continue
        else:
            out.append((None, None, None, None))
    return out


def layout_property(vals, i, default):
    """LayoutUtility.GetLayoutProperty over vals[k][i]: the highest priority with a value >= 0 wins, ties take the
    largest. None when a component that could win is 「모름」."""
    best, best_pri, unknown_pri = default, None, None
    for v in vals:
        pri, val = v[0], v[i]
        if pri is None or val is None:
            p = pri if pri is not None else math.inf
            unknown_pri = p if unknown_pri is None else max(unknown_pri, p)
            continue
        if val < 0:
            continue
        if best_pri is None or pri > best_pri:
            best, best_pri = val, pri
        elif pri == best_pri and val > best:
            best = val
    if unknown_pri is not None and (best_pri is None or unknown_pri >= best_pri):
        return None
    return best


def element_sizes(n, axis, ctx):
    """(min, preferred, flexible) as LayoutUtility.GetMinSize / GetPreferredSize / GetFlexibleSize give them."""
    vals = element_values(n, axis, ctx)
    mn = layout_property(vals, 1, 0)
    pr = layout_property(vals, 2, 0)
    fl = layout_property(vals, 3, 0)
    pref = None if mn is None or pr is None else max(mn, pr)
    return mn, pref, fl


def image_preferred(c, axis, ctx):
    f = c['f']
    sp = f.get('m_Sprite')
    if sp is None:
        return None
    s = ctx['sprite'](sp)
    if s is False:          # an empty sprite reference: Image.preferredWidth is 0
        return 0
    if s is None or 'rect' not in s:
        return None
    t = f.get('m_Type')
    if 'pixelsPerUnit' not in s:
        return None
    ppu = s['pixelsPerUnit'] / ctx['ref_ppu']
    if t in (1, 2):
        if f.get('m_PixelsPerUnitMultiplier', 1) != 1:
            return None
        b = s.get('border') or [0, 0, 0, 0]       # left, bottom, right, top
        return ((b[0] + b[2]) if axis == 0 else (b[1] + b[3])) / ppu
    if t in (0, 3):
        return s['rect'][2 + axis] / ppu
    return None


def child_sizes(g, ch, axis, ctx):
    """HorizontalOrVerticalLayoutGroup.GetChildSizes."""
    f = g['f']
    control = f['m_ChildControlWidth' if axis == 0 else 'm_ChildControlHeight']
    expand = f['m_ChildForceExpandWidth' if axis == 0 else 'm_ChildForceExpandHeight']
    if not control:
        if ch.comp(CSF) and ch.comp(CSF)['f'].get('m_HorizontalFit' if axis == 0 else 'm_VerticalFit') != 0:
            return None, None, None       # its own fitter runs after the group: the size the group reads is stale
        if not num(ch.size[axis]):
            return None, None, None
        mn = ch.size[axis]
        mn, pr, fl = mn, mn, 0
    else:
        mn, pr, fl = element_sizes(ch, axis, ctx)
    if expand and fl is not None:
        fl = max(fl, 1)
    return mn, pr, fl


def group_inputs(n, axis, ctx):
    """HorizontalOrVerticalLayoutGroup.CalcAlongAxis: the group's own (min, preferred, flexible), memoised per pass."""
    memo = ctx['memo']
    key = (id(n), axis)
    if key in memo:
        return memo[key]
    memo[key] = (None, None, None)   # a cycle reads as 「모름」
    g = n.comp(HLG) or n.comp(VLG)
    vertical = g['cls'] == VLG
    f = g['f']
    pad = f.get('m_Padding', {})
    combined = (pad.get('m_Left', 0) + pad.get('m_Right', 0)) if axis == 0 else (pad.get('m_Top', 0) + pad.get('m_Bottom', 0))
    use_scale = f.get('m_ChildScaleWidth' if axis == 0 else 'm_ChildScaleHeight', 0)
    spacing = f.get('m_Spacing', 0)
    along_other = vertical != (axis == 1)
    tmin = tpref = combined
    tflex = 0
    kids = rect_children(n)
    for ch in kids:
        mn, pr, fl = child_sizes(g, ch, axis, ctx)
        if use_scale:
            s = ch.scale[axis]
            mn, pr, fl = (None if v is None else v * s for v in (mn, pr, fl))
        if along_other:
            tmin = None if mn is None or tmin is None else max(mn + combined, tmin)
            tpref = None if pr is None or tpref is None else max(pr + combined, tpref)
            tflex = None if fl is None or tflex is None else max(fl, tflex)
        else:
            tmin = None if mn is None or tmin is None else tmin + mn + spacing
            tpref = None if pr is None or tpref is None else tpref + pr + spacing
            tflex = None if fl is None or tflex is None else tflex + fl
    if not along_other and kids:
        tmin = None if tmin is None else tmin - spacing
        tpref = None if tpref is None else tpref - spacing
    if tmin is not None and tpref is not None:
        tpref = max(tmin, tpref)
    memo[key] = (tmin, tpref, tflex)
    return memo[key]


# ---------------------------------------------------------------- layout control (SetLayoutHorizontal / Vertical)

def rect_size(n, axis, parent_size):
    if parent_size is None or not num(n.size[axis]):
        return None
    return parent_size * (n.amax[axis] - n.amin[axis]) + n.size[axis]


def set_child(ch, axis, pos, size, scale_factor):
    """LayoutGroup.SetChildAlongAxisWithScale: anchors to the top left, the position (and the size when controlled)."""
    ch.amin = [0, 1]
    ch.amax = [0, 1]
    ch.driven['anchors'] = True
    if size is not None:
        ch.size[axis] = size
        ch.driven.setdefault('sizeDelta', [None, None])[axis] = size
    s = ch.size[axis]
    if pos is None or not num(s):
        ch.pos[axis] = None
    elif axis == 0:
        ch.pos[axis] = pos + s * ch.pivot[axis] * scale_factor
    else:
        ch.pos[axis] = -pos - s * (1 - ch.pivot[axis]) * scale_factor
    ch.driven.setdefault('anchoredPosition', [None, None])[axis] = ch.pos[axis]


def mark(ch, axis, why):
    ch.known_axis[axis] = False
    ch.pos[axis] = None
    ch.unresolved.append(why)


def lay_children(n, axis, size, ctx):
    """HorizontalOrVerticalLayoutGroup.SetChildrenAlongAxis."""
    g = n.comp(HLG) or n.comp(VLG)
    f = g['f']
    vertical = g['cls'] == VLG
    pad = f.get('m_Padding', {})
    pad_start = pad.get('m_Left', 0) if axis == 0 else pad.get('m_Top', 0)
    combined = (pad.get('m_Left', 0) + pad.get('m_Right', 0)) if axis == 0 else (pad.get('m_Top', 0) + pad.get('m_Bottom', 0))
    control = f['m_ChildControlWidth' if axis == 0 else 'm_ChildControlHeight']
    use_scale = f.get('m_ChildScaleWidth' if axis == 0 else 'm_ChildScaleHeight', 0)
    spacing = f.get('m_Spacing', 0)
    align = f.get('m_ChildAlignment', 0)
    align_on = ((align % 3) if axis == 0 else (align // 3)) * 0.5
    along_other = vertical != (axis == 1)
    kids = rect_children(n)
    if f.get('m_ReverseArrangement'):
        kids = kids[::-1]
    axis_name = 'x' if axis == 0 else 'y'
    why = f"{g['cls'].rsplit('.', 1)[1]} on {n.path} ({axis_name})"

    def start_offset(required_wo_pad):
        return pad_start + (size - (required_wo_pad + combined)) * align_on

    if size is None:
        for ch in kids:
            mark(ch, axis, f'{why}: the group\'s own size is 「모름」')
        return
    if along_other:
        inner = size - combined
        for ch in kids:
            mn, pr, fl = child_sizes(g, ch, axis, ctx)
            if None in (mn, pr, fl):
                mark(ch, axis, f'{why}: a layout size of {ch.path} is 「모름」')
                continue
            sf = ch.scale[axis] if use_scale else 1
            required, hi = inner, (size if fl > 0 else pr)      # Mathf.Clamp(inner, min, hi)
            if required < mn:
                required = mn
            elif required > hi:
                required = hi
            off = start_offset(required * sf)
            if control:
                set_child(ch, axis, off, required, sf)
            else:
                set_child(ch, axis, off + (required - ch.size[axis]) * align_on, None, sf)
        return
    tmin, tpref, tflex = group_inputs(n, axis, ctx)
    if None in (tmin, tpref, tflex):
        for ch in kids:
            mark(ch, axis, f'{why}: a layout size of a child is 「모름」')
        return
    pos = pad_start
    mult = 0
    surplus = size - tpref
    if surplus > 0:
        if tflex == 0:
            pos = start_offset(tpref - combined)
        elif tflex > 0:
            mult = surplus / tflex
    lerp = 0
    if tmin != tpref:
        lerp = min(1, max(0, (size - tmin) / (tpref - tmin)))
    for ch in kids:
        mn, pr, fl = child_sizes(g, ch, axis, ctx)
        sf = ch.scale[axis] if use_scale else 1
        csize = mn + (pr - mn) * lerp + fl * mult
        if control:
            set_child(ch, axis, pos, csize, sf)
        else:
            set_child(ch, axis, pos + (csize - ch.size[axis]) * align_on, None, sf)
        pos += csize * sf + spacing


def control_pass(n, axis, parent_size, ctx):
    """One axis of LayoutRebuilder: self controllers (ContentSizeFitter) first, then the layout group, then the children."""
    size = rect_size(n, axis, parent_size)
    if n.active:
        fit = n.comp(CSF)
        mode = fit['f'].get('m_HorizontalFit' if axis == 0 else 'm_VerticalFit') if fit else 0
        if mode not in (0, 1, 2):
            n.size[axis] = None
            n.unresolved.append(f"ContentSizeFitter on {n.path}: fit {mode!r} 「모름」")
            size = None
        elif mode:
            mn, pr, _ = element_sizes(n, axis, ctx)
            want = mn if mode == 1 else pr
            if want is None or parent_size is None:
                n.size[axis] = None
                n.unresolved.append(f"ContentSizeFitter on {n.path} ({'x' if axis == 0 else 'y'}): its {FIT[mode]} is 「모름」")
                size = None
            else:
                n.size[axis] = want - parent_size * (n.amax[axis] - n.amin[axis])
                n.driven.setdefault('sizeDelta', [None, None])[axis] = n.size[axis]
                size = want
        g = n.layout_group()
        if g and solvable_group(g):
            lay_children(n, axis, size, ctx)
        elif g:
            what = 'GridLayoutGroup' if g['cls'] == GLG else f"{g['cls'].rsplit('.', 1)[1]} with a field missing"
            for ch in rect_children(n):
                mark(ch, axis, f'{what} on {n.path}: not solved')
                ch.size[axis] = None
    for ch in n.children:
        control_pass(ch, axis, size, ctx)


# ---------------------------------------------------------------- absolute rects

def place(n, pmin, psize, tf, out_rect):
    """The node's rect in canvas units (y up, origin bottom left) through the scale chain; per-axis None = 「모름」.
    tf = (sx, sy, tx, ty) maps the parent's local space to the canvas."""
    lo, hi, piv, size = [None, None], [None, None], [None, None], [None, None]
    for a in (0, 1):
        if pmin[a] is None or psize[a] is None or n.pos[a] is None or not num(n.size[a]) or not n.known_axis[a]:
            continue
        ref_min = pmin[a] + n.amin[a] * psize[a]
        ref_max = pmin[a] + n.amax[a] * psize[a]
        size[a] = (ref_max - ref_min) + n.size[a]
        piv[a] = ref_min + (ref_max - ref_min) * n.pivot[a] + n.pos[a]
    sx, sy, tx, ty = tf
    ntf = [None, None, None, None]
    if n.rotated:
        n.unresolved.append(f'{n.path}: rotated (not solved)')
    for a, (s, t) in enumerate(((sx, tx), (sy, ty))):
        if piv[a] is None or s is None or t is None or n.rotated:
            continue
        ns = s * n.scale[a]
        nt = t + s * piv[a]
        ntf[a], ntf[2 + a] = ns, nt
        lmin = -size[a] * n.pivot[a]
        e0, e1 = nt + ns * lmin, nt + ns * (lmin + size[a])
        lo[a], hi[a] = min(e0, e1), max(e0, e1)
    out_rect[id(n)] = (lo, hi, ntf[:2])
    cmin = [(-size[a] * n.pivot[a]) if size[a] is not None else None for a in (0, 1)]
    for ch in n.children:
        place(ch, cmin, size, tuple(ntf), out_rect)


# ---------------------------------------------------------------- describing the components

def flag(f, key):
    return bool(f[key]) if key in f else MOREUM


def describe(n, ctx):
    d = {}
    for c in n.comps:
        cls, f = c['cls'], c['f']
        en = c.get('enabled', True)
        if cls == IMAGE or ('m_Sprite' in f and 'm_Type' in f):
            s = ctx['sprite'](f.get('m_Sprite')) if f.get('m_Sprite') is not None else None
            img = {
                'sprite': (s or {}).get('name') if s else (None if s is False else MOREUM),
                'type': enum(IMAGE_TYPE, f.get('m_Type')),
                'preserveAspect': flag(f, 'm_PreserveAspect'),
                'color': color(f.get('m_Color')),
            }
            if s:
                img['spriteRect'] = [rnd(v) for v in s['rect'][2:]] if 'rect' in s else MOREUM
                img['border'] = [rnd(v) for v in s['border']] if 'border' in s else MOREUM
                if 'texture' in s:
                    img['texture'] = [rnd(v) for v in s['texture']]
            if f.get('m_Type') == 3:
                img['fill'] = {'method': f.get('m_FillMethod', MOREUM), 'amount': rnd(f.get('m_FillAmount')), 'origin': f.get('m_FillOrigin', MOREUM)}
            if f.get('m_Type') in (1, 2):
                img['fillCenter'] = flag(f, 'm_FillCenter')
                img['pixelsPerUnitMultiplier'] = rnd(f.get('m_PixelsPerUnitMultiplier'))
            if cls != IMAGE:
                img['class'] = cls
            if not en:
                img['enabled'] = False
            d['image'] = img
        elif cls == UI + 'RawImage':
            d['rawImage'] = {'texture': ctx['name'](f.get('m_Texture')), 'uv': f.get('m_UVRect', MOREUM), 'color': color(f.get('m_Color'))}
        elif cls == TEXT:
            fd = f.get('m_FontData')
            if not isinstance(fd, dict):
                d['text'] = MOREUM
                continue
            t = {
                'font': ctx['name'](fd.get('m_Font')),
                'size': fd.get('m_FontSize', MOREUM),
                'style': enum(FONT_STYLE, fd.get('m_FontStyle')),
                'align': enum(ALIGN, fd.get('m_Alignment')),
                'lineSpacing': rnd(fd.get('m_LineSpacing')),
                'color': color(f.get('m_Color')),
                'hOverflow': enum(H_OVERFLOW, fd.get('m_HorizontalOverflow')),
                'vOverflow': enum(V_OVERFLOW, fd.get('m_VerticalOverflow')),
                'richText': flag(fd, 'm_RichText'),
                'alignByGeometry': flag(fd, 'm_AlignByGeometry'),
            }
            if fd.get('m_BestFit'):
                t['bestFit'] = [fd.get('m_MinSize', MOREUM), fd.get('m_MaxSize', MOREUM)]
            if f.get('m_Text'):
                t['text'] = f['m_Text'][:80]
            d['text'] = t
        elif 'm_fontSize' in f and 'm_text' in f:       # TextMeshPro (a game class to this tool: its fields only)
            d['tmp'] = {'class': cls, 'font': ctx['name'](f.get('m_fontAsset')), 'size': f.get('m_fontSize'),
                        'color': color(f.get('m_fontColor')), 'lineSpacing': f.get('m_lineSpacing', MOREUM),
                        'text': (f.get('m_text') or '')[:80]}
        elif cls in (HLG, VLG):
            pad = f.get('m_Padding', {})
            d.setdefault('layout', {})['group'] = {
                'kind': 'horizontal' if cls == HLG else 'vertical',
                'padding': [pad.get('m_Left', MOREUM), pad.get('m_Right', MOREUM), pad.get('m_Top', MOREUM), pad.get('m_Bottom', MOREUM)],
                'spacing': rnd(f.get('m_Spacing')), 'childAlignment': enum(ALIGN, f.get('m_ChildAlignment')),
                'controlSize': [flag(f, 'm_ChildControlWidth'), flag(f, 'm_ChildControlHeight')],
                'forceExpand': [flag(f, 'm_ChildForceExpandWidth'), flag(f, 'm_ChildForceExpandHeight')],
                'useScale': [flag(f, 'm_ChildScaleWidth'), flag(f, 'm_ChildScaleHeight')],
                'reverse': flag(f, 'm_ReverseArrangement'), **({} if en else {'enabled': False}),
            }
        elif cls == GLG:
            pad = f.get('m_Padding', {})
            d.setdefault('layout', {})['group'] = {
                'kind': 'grid', 'solved': False,
                'padding': [pad.get('m_Left', MOREUM), pad.get('m_Right', MOREUM), pad.get('m_Top', MOREUM), pad.get('m_Bottom', MOREUM)],
                'cellSize': f.get('m_CellSize', MOREUM), 'spacing': f.get('m_Spacing', MOREUM),
                'startCorner': f.get('m_StartCorner', MOREUM), 'startAxis': f.get('m_StartAxis', MOREUM),
                'childAlignment': enum(ALIGN, f.get('m_ChildAlignment')),
                'constraint': f.get('m_Constraint', MOREUM), 'constraintCount': f.get('m_ConstraintCount', MOREUM),
            }
        elif cls == LE:
            d.setdefault('layout', {})['element'] = {
                'ignoreLayout': flag(f, 'm_IgnoreLayout'),
                'min': [rnd(f.get('m_MinWidth')), rnd(f.get('m_MinHeight'))],
                'preferred': [rnd(f.get('m_PreferredWidth')), rnd(f.get('m_PreferredHeight'))],
                'flexible': [rnd(f.get('m_FlexibleWidth')), rnd(f.get('m_FlexibleHeight'))],
                'priority': f.get('m_LayoutPriority', MOREUM), **({} if en else {'enabled': False}),
            }
        elif cls == CSF:
            d.setdefault('layout', {})['fitter'] = [enum(FIT, f.get('m_HorizontalFit')), enum(FIT, f.get('m_VerticalFit'))]
        elif cls in (UI + 'Mask', UI + 'RectMask2D'):
            d['mask'] = {'kind': cls.rsplit('.', 1)[1], **({'showGraphic': flag(f, 'm_ShowMaskGraphic')} if cls == UI + 'Mask' else {})}
        elif cls in (UI + 'Shadow', UI + 'Outline'):
            d.setdefault('effects', []).append({'kind': cls.rsplit('.', 1)[1], 'color': color(f.get('m_EffectColor')),
                                                 'distance': f.get('m_EffectDistance', MOREUM)})
        elif cls == 'CanvasGroup':
            d['canvasGroup'] = {'alpha': rnd(f.get('m_Alpha'), 3)}
        elif cls in ANIMATED:
            d['animated'] = True
        if '_fontName' in f:            # a game script that gives a Text its font by name at run time
            d['dynFont'] = f['_fontName']
    if 'dynFont' in d and isinstance(d.get('text'), dict):
        d['text']['dynFont'] = d.pop('dynFont')
    return d


# ---------------------------------------------------------------- canvas

def canvas_scale(reference, screen, match, mode, ui_scale):
    """CanvasScaler ScaleWithScreenSize: screen px per canvas unit (× the PC UI scale setting)."""
    rw, rh = reference
    sw, sh = screen
    if mode == 0:
        lw, lh = math.log2(sw / rw), math.log2(sh / rh)
        f = 2 ** (lw + (lh - lw) * match)
    elif mode == 1:
        f = min(sw / rw, sh / rh)
    elif mode == 2:
        f = max(sw / rw, sh / rh)
    else:
        raise ValueError(f'screenMatchMode {mode}: 「모름」')
    return f * ui_scale


def solve(tree, canvas_units, ref_ppu=100, sprite=None, name=None, parent_rect=None, px_per_unit=None, offset=(0, 0),
          css_px_per_unit=None):
    """Lay the tree out in a canvas of `canvas_units` (w, h) and return the node list.

    parent_rect: (x, y, w, h) in canvas units, top-left origin, the rect the root is laid into (a slot of another
    prefab); default the whole canvas. Output rects are canvas units with the origin at the canvas's top left, y down;
    `screen` = offset + rect × px_per_unit (a screenshot), `css` = rect × css_px_per_unit (our pages).
    """
    ctx = {'memo': {}, 'ref_ppu': ref_ppu, 'sprite': sprite or (lambda ref: None), 'name': name or (lambda ref: MOREUM)}
    root = build(tree)
    cw, ch = canvas_units
    if parent_rect is None:
        parent_rect = (0, 0, cw, ch)
    px, py, pw, ph = parent_rect
    for axis, psize in ((0, pw), (1, ph)):
        ctx['memo'] = {}
        control_pass(root, axis, psize, ctx)
    rects = {}
    place(root, [px, ch - py - ph], [pw, ph], (1, 1, 0, 0), rects)
    out = []
    for n in walk(root):
        lo, hi, ws = rects[id(n)]
        r = {
            'x': rnd(lo[0], 3) if lo[0] is not None else MOREUM,
            'y': rnd(ch - hi[1], 3) if hi[1] is not None else MOREUM,
            'w': rnd(hi[0] - lo[0], 3) if lo[0] is not None else MOREUM,
            'h': rnd(hi[1] - lo[1], 3) if lo[1] is not None else MOREUM,
        }
        node = {
            'path': n.path, 'name': n.name, 'depth': n.path.count('/'),
            'active': n.active_self, 'activeInHierarchy': n.active,
            'rect': r,
        }
        if ws != [1, 1]:
            node['worldScale'] = [rnd(v, 4) for v in ws]
        if px_per_unit:
            node['screen'] = scaled(r, px_per_unit, offset)
        if css_px_per_unit:
            node['css'] = scaled(r, css_px_per_unit, (0, 0))
        s = n.serialized
        node['local'] = {'anchorMin': list(s['amin']), 'anchorMax': list(s['amax']), 'anchoredPosition': [rnd(v) for v in s['pos']],
                         'sizeDelta': [rnd(v) for v in s['size']], 'pivot': list(s['pivot']), 'scale': list(s.get('scale', [1, 1]))}
        if n.driven:
            dv = {}
            if n.driven.get('anchors'):
                dv['anchors'] = [[0, 1], [0, 1]]
            for k in ('anchoredPosition', 'sizeDelta'):
                if k in n.driven:
                    dv[k] = [rnd(v) if v is not None else None for v in n.driven[k]]
            node['driven'] = dv
        node.update(describe(n, ctx))
        unk = n.unknown_classes()
        if unk:
            node['unknown'] = unk
            hints = [c for c in unk if any(h in c.rsplit('.', 1)[-1] for h in DRIVER_HINTS)]
            if hints:
                node['unsure'] = [f'{c}: may move this rect or its children' for c in hints]
        if n.unresolved:
            node['unresolved'] = list(dict.fromkeys(n.unresolved))
        t = node.get('text')
        if css_px_per_unit and isinstance(t, dict) and num(t.get('size')):
            t['cssSize'] = rnd(t['size'] * abs(ws[1]) * css_px_per_unit) if num(ws[1]) else MOREUM
        out.append(node)
    return out


def scaled(r, k, off):
    def m(v, o):
        return rnd(o + v * k, 2) if num(v) else MOREUM
    return {'x': m(r['x'], off[0]), 'y': m(r['y'], off[1]), 'w': m(r['w'], 0), 'h': m(r['h'], 0)}
