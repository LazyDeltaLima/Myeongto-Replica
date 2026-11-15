#!/usr/bin/env python3
"""The client buff table (local patch, docs/rules/fx.md 「바인딩 표」): the rows a `loadFromDB` buff reads its shape from.

A buff written with `loadFromDB: true` (peak_performance[inf], weak[limit], stun …) takes its template, effect and
blackboard defaults from the client's buff table (class `Torappu.Battle.BuffDB`), not from the fields written beside it —
its `templateKey` there may be `empty`. The table is the TextAsset `dyn/gamedata/buff_table<hash>.bytes` in one of the
anonymous bundles (`anon/*.bin`, the name changes with each client update): a 128-byte signature, then a FlatBuffer whose
root table's field 0 is the entry vector {0: key, 1: BuffData}; BuffData's fields are numbered in the order the EN client's
class `Torappu.BuffData` declares them (NAMES). The CN client's class has more fields (`isGroundBoundable`,
`remainingTimeKey` …), so its table is numbered otherwise: read the EN client only — a CN folder stops with an error.

    from buff_db import buff_db
    buff_db('<Arknights_Data>')['peak_performance[inf]']['templateKey']   # 'peak_performance'

Nothing is written; the rows are (c) Hypergryph and stay in memory. Needs UnityPy + lz4 (requirements.txt).
"""
import struct
from pathlib import Path

BASES = ('PersistentData/Bundles', 'StreamingAssets/AB/Windows')   # first wins (hot update)
NAMES = ['attributes', 'buffKey', 'loadFromDB', 'isDurableBuff', 'isDamageMissable', 'isSilenceable', 'isStunnable',
         'isFreezable', 'isLevitatable', 'statusResistable', 'templateKey', 'disableOverride', 'overrideKey', 'overrideType',
         'maxStackCnt', 'refreshRemainingTimeWhenStackMax', 'clearAllStackCntWhenTimeUp', 'maxValidStackCnt',
         'independentCharacterSource', 'overrideEffectKey', 'overrideOnEventPriority', 'onEventPriority', 'audioSignal',
         'lifeTimeType', 'takeSnapshotWhenExtend', 'durationKey', 'lifeTime', 'triggerLifeType', 'triggerCnt',
         'triggerInterval', 'waitFirstTriggerInterval', 'firstTriggerInterval', 'priority', 'priorityBBKeys',
         'stripBlackboardParamsWithBuffKey', 'blackboard', 'enableInitDirectionFromSource']
STRINGS = {1, 10, 12, 19, 22, 25}
FLOATS = {26, 29, 31}
INTS = {14, 17, 28, 32}
BOOLS = {2, 3, 4, 5, 6, 7, 8, 11, 15, 16, 18, 20, 24, 30, 34, 36}
BYTES = {9, 13, 21, 23, 27}   # enums stored as one byte
HEADER = 128


def table_bytes(client):
    """The buff table's bytes of an Arknights_Data folder (the hot-update copy first), or None."""
    import aklz4  # noqa: F401  (registers the LZ4AK decoder)
    import UnityPy
    for d in BASES:
        for f in sorted((Path(client) / d / 'anon').glob('*.bin')):
            try:
                env = UnityPy.load(str(f))
            except Exception:   # an anonymous bundle this UnityPy cannot open holds no table
                continue
            for path, o in env.container.items():
                name = path.rsplit('/', 1)[-1]
                if path.startswith('dyn/gamedata/') and name.startswith('buff_table') and name.endswith('.bytes'):
                    t = o.read()
                    data = getattr(t, 'm_Script', None)
                    if isinstance(data, str):
                        data = data.encode('utf-8', 'surrogateescape')
                    return bytes(data)
    return None


def decode(raw):
    """{key: row} of the table's bytes (the BuffData fields NAMES, the ones written; `attributes` left out)."""
    B = raw[HEADER:]
    u32 = lambda o: struct.unpack_from('<I', B, o)[0]
    i32 = lambda o: struct.unpack_from('<i', B, o)[0]
    u16 = lambda o: struct.unpack_from('<H', B, o)[0]
    f32 = lambda o: struct.unpack_from('<f', B, o)[0]

    def field(t, i):
        v = t - i32(t)
        n = u16(v) // 2 - 2
        off = u16(v + 4 + 2 * i) if i < n else 0
        return t + off if off else None

    def string(p):
        q = p + u32(p)
        return B[q + 4:q + 4 + u32(q)].decode('utf-8')

    def vector(p):
        v = p + u32(p)
        return [v + 4 + 4 * k for k in range(u32(v))]

    def blackboard(p):
        out = []
        for e in vector(p):
            t = e + u32(e)
            k, val, sv = field(t, 0), field(t, 1), field(t, 2)
            out.append({'key': string(k) if k else None, 'value': f32(val) if val else 0.0, **({'valueStr': string(sv)} if sv else {})})
        return out

    table = {}
    for e in vector(field(u32(0), 0)):
        t = e + u32(e)
        p = field(t, 1)
        d = p + u32(p)
        row = {}
        for i, n in enumerate(NAMES):
            q = field(d, i)
            if q is None or n == 'attributes':
                continue
            if i in STRINGS:
                row[n] = string(q)
            elif i in FLOATS:
                row[n] = round(f32(q), 6)
            elif i in INTS:
                row[n] = i32(q)
            elif i in BOOLS:
                row[n] = bool(B[q])
            elif i in BYTES:
                row[n] = B[q]
            elif n == 'blackboard':
                row[n] = blackboard(q)
            elif n == 'priorityBBKeys':
                row[n] = [string(x) for x in vector(q)]
        table[string(field(t, 0))] = row
    return table


def buff_db(client):
    """{buff key: row} of the client's buff table, {} when the folder has none."""
    raw = table_bytes(client) if client else None
    return decode(raw) if raw else {}


if __name__ == '__main__':
    import json
    import sys
    db = buff_db(sys.argv[1])
    print(f'{len(db)} rows')
    for k in sys.argv[2:]:
        print(k, json.dumps(db.get(k), ensure_ascii=False))
