#!/usr/bin/env python3
"""The client-only effect binding rows of this server's operators (docs/rules/fx.md 「바인딩 표」, maintainer decision 2026-10-22).

The buff templates' rows come from a public dataset (tools/build-fx-templates.mjs → tools/assets/fx-templates.json, tracked).
What only the client holds is read here and written to a git-ignored file beside the extracted effects,
public/assets/local/fx/bindings.json — never tracked. Rows, in the same shape as the template table:
  { key, src, moment, kind, fx, target, life, conds, char?, tpl?, cn? }
    src 'abilityBuff'  a buff an ability holds (charpack / [uc]skills: `_buffs`, `_passiveBuffs`, `_activeBuffs`,
                       `_additiveActiveBuffs` …): key = its buffKey, fx = its overrideEffectKey (none: its template's
                       effectKey, `tpl`), moment = the field, target OWNER / TARGET (the fields that hand it to others)
        'ability'      an ability's emitters (`_castEffects`, `_hitEffects` … — moment `<field>@<event>`), its other effect
                       fields and the CreateEffect nodes of its serialized actions: key = the GameObject path
        'projectile'   a projectile prefab's effect fields (`_mainEffect`, `_effectsWhenReached` …): key = the projectile
        'token'        a token prefab's emitters and effect fields: key = the GameObject path
  `char` the operator / token the row belongs to (a projectile only a buff template fires: that template's key). Every string field that names an extracted effect prefab counts, so a
  field this script does not know still yields a row (moment = its field path).
Also `refs` {char: [buff / template keys its prefabs name]} — where the pool's use of a buff template starts.

Usage (from the repo root): .venv-extract/bin/python tools/local-extract/fx_bindings.py [--client <EN Arknights_Data>]
  [--cn <CN Arknights_Data>] [--out <file>]
Operators, skills, projectiles and tokens the EN client lacks are read from --cn when given (rows `cn: true`).
Then run `node tools/build-fx-plays.mjs` (the plays of the render plans' client keys, public/assets/local/fx/plays.json).
Everything read is (c) Hypergryph; private fan use only.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from client_path import client_data  # noqa: E402
from char_modes import load_tree, pool_char_ids, char_skill_prefabs  # noqa: E402
from enemy_bindings import EVENTS  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/local/fx/bindings.json'
FX_INDEX = ROOT / 'public/assets/local/fx/index.json'
# the template table (its `templates`: the pool's templates) and the public datasets it was built from (en_US first)
FX_TEMPLATES = ROOT / 'tools/assets/fx-templates.json'
TEMPLATE_DATA = [ROOT / '.cache/gamedata-en/battle/buff_template_data.json', ROOT / '.cache/gamedata/battle/buff_template_data.json']
BASES = ('PersistentData/Bundles', 'StreamingAssets/AB/Windows')   # first wins (hot update)
# Buff.LifeTimeType as the client serializes it
LIFE = ['IMMEDIATELY', 'LIMITED', 'INFINITY', 'CUSTOM']
# the fields whose buffs go on the ability's targets, not its owner
TARGET_FIELDS = {'_activeBuffs', '_additiveActiveBuffs', '_activeBuffsToMainTarget', '_buffsWhenReachedTarget', '_projectileBuffs',
                 '_buffsToBlockee', '_buffsToTarget'}
SKIP = {'m_GameObject', 'm_Script', 'm_Enabled', 'm_Name', 'm_EditorHideFlags', 'm_EditorClassIdentifier'}
COND = re.compile(r'^(If(?!Else$|Conditions$|Not$)|Check|Filter|Compare|Is|Dice)')


def bundle(game, rel):
    for b in BASES:
        p = Path(game) / b / rel
        if p.exists():
            return p
    return None


def bundles(game, pattern):
    out, seen = [], set()
    for b in BASES:
        for f in sorted((Path(game) / b).glob(pattern)):
            if f.name not in seen:
                seen.add(f.name)
                out.append(f)
    return out


def roots_of(files, want=None):
    """{root name: [(path, MonoBehaviour)]} of the bundles (the first bundle that has a root wins)."""
    out = {}
    for f in files:
        here = {}
        for gp, d, _ in load_tree(str(f))[0]:
            r = gp.split('/')[0]
            if (want is None or want(r)) and r not in out:
                here.setdefault(r, []).append((gp, d))
        out.update(here)
    return out


def type_of(o):
    return str(o.get('$type') or '').split(',')[0].split('+')[-1]


def cond_name(o):
    t = type_of(o)
    if t == 'CheckCharacterDefaultDirection':
        return f"{t}({'@' + str(o.get('_bbKey')) if o.get('_useBB') else o.get('_direction')})"
    if t == 'CheckSkillIndex':
        return f"{t}({o.get('_skillIndex')})"
    if t == 'CheckUnitCurrentMode':
        return f"{t}({'@' + o['_loadCurModeBbKey'] if o.get('_loadCurModeBbKey') else o.get('_checkCurModeIndex')})"
    if t == 'FilterByBuffStackCount':
        n = '@' + o['_stackCountKey'] if o.get('_stackCountKey') else o.get('_stackCount')
        return f"{t}({o.get('_condType')} {n}{' ' + o['_buffKey'] if o.get('_buffKey') else ''})"
    if t == 'CheckContainsBuff':
        return f"{t}({('&' if o.get('isAND') else '|').join(o.get('_buffKeys') or [])})"
    if t == 'CheckContainsDerviedBuff':
        return f"{t}({o.get('_derviedBuffKey')})"
    return t


def neg(c):
    return c[1:] if c.startswith('!') else '!' + c


def life_of(b):
    t = b.get('lifeTimeType')
    t = LIFE[t] if isinstance(t, int) and 0 <= t < len(LIFE) else t
    if t == 'LIMITED':
        return f"LIMITED:@{b['durationKey']}" if b.get('durationKey') else f"LIMITED:{round(b.get('lifeTime') or 0, 3)}"
    return t


class Rows:
    def __init__(self, known):
        self.rows, self.refs, self.known = [], {}, known

    def add(self, **r):
        self.rows.append({k: v for k, v in r.items() if v is not None and v != ''})

    def ref(self, char, key):
        if key:
            self.refs.setdefault(char, set()).add(key)

    # ---- serialized action lists (the template node language, inside an ability) ----
    def nodes(self, lst, conds, ctx):
        cur = list(conds)
        for o in lst if isinstance(lst, list) else [lst]:
            if not isinstance(o, dict):
                continue
            t = type_of(o)
            if t == 'IfNot':
                if len(cur) > len(conds):
                    cur[-1] = neg(cur[-1])
                continue
            if t in ('IfElse', 'IfConditions'):
                cs = [o.get('_conditionNode')] if t == 'IfElse' else (o.get('_conditionsNode') or [])
                names = [cond_name(c) for c in (cs if isinstance(cs, list) else [cs]) if isinstance(c, dict)]
                c = names[0] if len(names) == 1 else f"{'Any' if o.get('_isAnd') is False else 'All'}({','.join(names)})"
                self.nodes(o.get('_succeedNodes') or [], cur + [c], ctx)
                self.nodes(o.get('_failNodes') or [], cur + [neg(c)], ctx)
                continue
            if COND.match(t):
                cur.append(cond_name(o))
                continue
            if t.startswith('Create') and 'Effect' in t and not t.startswith(('CreateBuff', 'CreateCard')):
                kind = 'line' if 'Line' in t else 'tile' if 'Tile' in t else 'effect'
                fxs = o.get('_effectKeys') if isinstance(o.get('_effectKeys'), list) else [o.get('_effectKey') or (
                    '@' + o['_blackboardKey'] if o.get('_blackboardKey') else None)]
                for fx in fxs:
                    if fx:
                        self.add(key=ctx['key'], src=ctx['src'], moment=ctx['moment'], kind=kind, fx=fx, target=o.get('_targetType'),
                                 life='hold' if o.get('_createEffectHoldBySource') or o.get('_holdIt') else 'once', conds=list(cur),
                                 char=ctx['char'], cn=ctx['cn'] or None)
            if t.startswith('CreateBuff') and isinstance(o.get('_buff'), dict):
                b = o['_buff']
                self.ref(ctx['char'], b.get('buffKey'))
                self.ref(ctx['char'], b.get('templateKey') if b.get('templateKey') != 'empty' else None)
                fx = (o.get('_effectKey') if t == 'CreateBuffWithOverrideEffect' else None) or b.get('overrideEffectKey')
                self.add(key=b.get('buffKey'), src='abilityBuff', moment=ctx['moment'], kind='buff', fx=fx, target=o.get('_buffOwner'),
                         life=life_of(b), conds=list(cur), char=ctx['char'], at=ctx['key'],
                         tpl=b.get('templateKey') if b.get('templateKey') not in (None, '', 'empty') else None, cn=ctx['cn'] or None)
            for k, v in o.items():
                if k in ('$type', '_buff'):
                    continue
                sub = v if isinstance(v, list) else [v]
                # buffs a node hands out other than by CreateBuff (SummonEnemiesOnAttackRange `_buffs` …)
                for b in sub:
                    if isinstance(b, dict) and not b.get('$type') and isinstance(b.get('buffKey'), str) and 'lifeTimeType' in b:
                        self.ref(ctx['char'], b['buffKey'])
                        tpl = b.get('templateKey') if b.get('templateKey') not in (None, '', 'empty') else None
                        self.ref(ctx['char'], tpl)
                        self.add(key=b['buffKey'], src='abilityBuff', moment=ctx['moment'], kind='buff', fx=b.get('overrideEffectKey') or None,
                                 target=o.get('_target') or o.get('_targetType'), life=life_of(b), conds=list(cur), char=ctx['char'], at=ctx['key'],
                                 tpl=tpl, cn=ctx['cn'] or None)
                if any(isinstance(x, dict) and x.get('$type') for x in sub):
                    m = re.match(r'^_([a-zA-Z]+)Nodes$', k)   # a branching node's branch (SwitchDirection `_rightNodes` …)
                    self.nodes(sub, cur + [f'{t}({m.group(1).upper()})'] if m else cur, ctx)

    # ---- one MonoBehaviour of a prefab ----
    def mb(self, gp, d, src, char, cn):
        def buff(b, field):
            key = b.get('buffKey') or b.get('templateKey')
            self.ref(char, key)
            tpl = b.get('templateKey') if b.get('templateKey') not in (None, '', 'empty') else None
            self.ref(char, tpl)
            self.add(key=key, src='abilityBuff', moment=field, kind='buff', fx=b.get('overrideEffectKey') or None,
                     target='TARGET' if field in TARGET_FIELDS else 'OWNER', life=life_of(b), conds=[], char=char, at=gp, tpl=tpl,
                     cn=cn or None)

        def walk(o, path, top):
            if isinstance(o, dict):
                if 'buffKey' in o and ('templateKey' in o or 'overrideEffectKey' in o):
                    buff(o, top)
                    return
                if isinstance(o.get('_effects'), list) and any(isinstance(x, str) and x for x in o['_effects']):
                    ev = o.get('_startEvent')
                    mom = f"{path}@{EVENTS[ev]}" if isinstance(ev, int) and 0 <= ev < len(EVENTS) else path
                    for fx in o['_effects']:
                        if isinstance(fx, str) and fx:
                            self.add(key=gp, src=src, moment=mom, kind='effect', fx=fx,
                                     life='once' if o.get('_oneshot') else 'cast', conds=[], char=char, cn=cn or None)
                for k, v in o.items():
                    if k in SKIP or k == '_effects':
                        continue
                    if k == 'SerializedState' and isinstance(v, str) and v.startswith('['):
                        try:
                            lst = json.loads(v)
                        except ValueError:
                            continue
                        ev = o.get('actionEvent') if isinstance(o.get('actionEvent'), int) else None
                        self.nodes(lst, [], {'key': gp, 'src': src, 'moment': f"{top}#{ev}" if ev is not None else top, 'char': char, 'cn': cn})
                        continue
                    walk(v, f"{path}.{k}" if path else k, top or k)
            elif isinstance(o, list):
                for v in o:
                    walk(v, path, top)
            elif isinstance(o, str) and o:
                field = path.rsplit('.', 1)[-1]
                if o.lower() in self.known or ('ffect' in field and not o.startswith(('projectile_', 'Torappu'))):
                    self.add(key=gp, src=src, moment=path, kind='effect', fx=o, conds=[], char=char, cn=cn or None)
                if re.search(r'\[[^\]]+\]$', o) or field in ('_buffKey', 'buffKey', '_templateKey', 'templateKey'):
                    self.ref(char, o)

        for k, v in d.items():
            if k not in SKIP:
                walk(v, k, k)


def strings(o, out):
    if isinstance(o, dict):
        for v in o.values():
            strings(v, out)
    elif isinstance(o, list):
        for v in o:
            strings(v, out)
    elif isinstance(o, str):
        out.add(o)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--client', default=client_data())
    ap.add_argument('--cn', default=None, help='the CN client Arknights_Data (for what the EN client lacks)')
    ap.add_argument('--out', default=str(OUT))
    a = ap.parse_args()
    known = set()
    if FX_INDEX.exists():
        for names in json.loads(FX_INDEX.read_text(encoding='utf-8')).get('bundles', {}).values():
            known.update(n.lower() for n in names)
    R = Rows(known)
    games = [(a.client, False)] + ([(a.cn, True)] if a.cn else [])
    chars = pool_char_ids()
    skills = char_skill_prefabs()
    data = json.loads((ROOT / 'data/backups.json').read_text(encoding='utf-8'))
    tokens = sorted(set(json.loads((ROOT / 'data/tokens.json').read_text(encoding='utf-8'))) | set(data.get('tokens') or {}))
    named, named_by = set(), {}   # every string the pool's prefabs hold (projectile keys among them) → the first holder

    def note(d, who):
        for x in strings(d, set()):
            named.add(x)
            named_by.setdefault(x, who)
    missing = {'char': [], 'skill': [], 'token': [], 'projectile': []}

    # operators: charpack/<charId>.ab
    left = list(chars)
    for game, cn in games:
        nxt = []
        for cid in left:
            f = bundle(game, f'charpack/{cid}.ab')
            if not f:
                nxt.append(cid)
                continue
            for gp, d, _ in load_tree(str(f))[0]:
                R.mb(gp, d, 'ability', cid, cn)
                note(d, cid)
        left = nxt
    missing['char'] = left

    # skills: battle/prefabs/[uc]skills.ab
    want = {p: cid for cid, lst in skills.items() for p in lst if p}
    left = set(want)
    for game, cn in games:
        if not left:
            break
        roots = roots_of(bundles(game, 'battle/prefabs/[[]uc[]]skills.ab'), lambda r: r in left)
        for r, lst in roots.items():
            for gp, d in lst:
                R.mb(gp, d, 'ability', want[r], cn)
                note(d, want[r])
        left -= set(roots)
    missing['skill'] = sorted(left)

    # tokens: pkgrps/btl_pfb_tokens_*.ab
    left = set(tokens)
    for game, cn in games:
        if not left:
            break
        roots = roots_of(bundles(game, 'pkgrps/btl_pfb_tokens_*.ab'), lambda r: r in left)
        for r, lst in roots.items():
            for gp, d in lst:
                R.mb(gp, d, 'token', r, cn)
                note(d, r)
        left -= set(roots)
    missing['token'] = sorted(left)

    # the projectiles the pool's buff templates fire (凛御银灰 S3 svash2_s_3[bird_on_self] → projectile_chr_svash2_s3_bird_self)
    if FX_TEMPLATES.exists():
        pool_tpls = set(json.loads(FX_TEMPLATES.read_text(encoding='utf-8')).get('templates') or {})
        for f in TEMPLATE_DATA:
            if not f.exists():
                continue
            for k, v in json.loads(f.read_text(encoding='utf-8')).items():
                if k in pool_tpls:
                    for x in strings(v, set()):
                        if x.startswith('projectile_'):
                            named.add(x)
                            named_by.setdefault(x, k)
    # projectiles the pool names (and the ones those name): battle/prefabs/[uc]projectiles.ab (EN first)
    proj = {}
    for game, cn in games:
        for r, lst in roots_of(bundles(game, 'battle/prefabs/[[]uc[]]projectiles.ab')).items():
            proj.setdefault(r, (lst, cn))
    queue = sorted((k for k in named if k in proj), reverse=True)
    done = set()
    while queue:
        k = queue.pop()
        if k in done:
            continue
        done.add(k)
        lst, cn = proj[k]
        for gp, d in lst:
            R.mb(gp, d, 'projectile', named_by.get(k), cn)
            for s in strings(d, set()):
                if s in proj and s not in done:
                    named_by.setdefault(s, named_by.get(k))
                    queue.append(s)
    missing['projectile'] = sorted(k for k in named if k.startswith('projectile_') and k not in proj)
    rows, seen = [], set()
    for r in R.rows:
        k = json.dumps(r, sort_keys=True, ensure_ascii=False)
        if k not in seen:
            seen.add(k)
            rows.append(r)
    doc = {
        '$comment': 'Client-only effect binding rows (abilityBuff / ability / projectile / token) of the pool operators, written by '
                    'tools/local-extract/fx_bindings.py from the local client. Git-ignored like the extracted effects; '
                    'test/render/fx-bindings.test.js reads it when present. (c) Hypergryph; private fan use only.',
        'missing': missing,
        'projectiles': sorted(done),
        'refs': {k: sorted(v) for k, v in sorted(R.refs.items())},
        'rows': rows,
    }
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')).replace('},{"key"', '},\n{"key"') + '\n', encoding='utf-8')
    cnt = {}
    for r in rows:
        cnt[r['src']] = cnt.get(r['src'], 0) + 1
    print(f"{len(rows)} rows {cnt} → {out}; missing: " + ', '.join(f'{k} {len(v)}' for k, v in missing.items()))


if __name__ == '__main__':
    main()
