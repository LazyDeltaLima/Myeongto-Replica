// 0.2.0 自选编队 — client side (research 0.2.0 §2; the owner's decisions of 2026-10-05): the 自选编队 tab's model (storage,
// the slots, the picker's operators with the kit list — our picks, shared/local-diy.js, no prototype —, skill / module
// choices without 集成战略 modules, export / import)
// and its server sync (room.diy; welcome.diyKitted), the tab's components (the twelve slots as the official lineup, the
// tier picker choosing several at once, 确认), and the match
// UI of a 自选 piece — the shop / reward card and the detail card show the operator (name, art, class, derived bonds,
// the pick's skill and module) with a 「自选」 badge, the own pieces get a tag, placement reads the operator's position, and
// the bond popup lists the 自选 member (own and a teammate's).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
globalThis.fetch = async (url) => {
  const name = String(url).split('/').pop();
  try {
    const body = readFileSync(path.join(ROOT, 'data', name), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};

const M = await import('../../public/js/ui/diyModel.js');
const { installDiySync, SYNC_DEBOUNCE_MS, flushDiySync, resendDiySync } = await import('../../public/js/ui/loadoutSync.js');
const { createStore } = await import('../../public/js/store.js');
const G = await import('../../public/js/ui/gameLogic.js');
const { ChessCard } = await import('../../public/js/ui/shopBar.js');
const { ChessDetail, resolveDetail } = await import('../../public/js/ui/detailPanel.js');
const { BondPopup } = await import('../../public/js/ui/bondStrip.js');
const { ownerBoard } = await import('../../public/js/ui/watchBonds.js');
const { standInPieces } = await import('../../public/js/screens/game/standInTags.js');
const { FieldedThumb } = await import('../../public/js/ui/gameComponents.js');
const { DiyPanelView, DiyPickerView, pickerStart, detailOpen, undoDetail } = await import('../../public/js/screens/diy.js');
const { data } = await import('../../public/js/data.js');
const { DATA } = await import('../match/harness.js');
const { KITTED_CHARS } = await import('../../server/sim/content/kits/index.js');
const { seasonPicks, allSeasonData } = await import('../helpers/seasonPicks.js');
/** The picks 盟约 offers (the picker runs on 盟约's data; 规程 offers 盟约's own chess too: test/helpers/seasonPicks.js). */
const LOCAL_DIY_PICKS = seasonPicks(DATA.chess);

await data.loadAll('chess', 'bonds', 'assets', 'garrisons', 'items', 'backups');

const D = { chess: DATA.chess, backups: DATA.backups };
const getChess = (id) => (Object.hasOwn(DATA.chess, id) ? DATA.chess[id] : null);
const T5A = 'chess_char_5_diy1_a';
const T5B = 'chess_char_5_diy2_a';
const T6A = 'chess_char_6_diy1_a';
const T6B = 'chess_char_6_diy2_a';
const ASCLN = 'char_4132_ascln'; // 阿斯卡纶: two advanced modules (AMB-X, AMB-Y), melee, 协防干员
const WANG = 'char_2027_wang';   // 望: 炎
const CHEN3 = 'char_1050_chen3'; // 赤刃明霄陈: 炎
const MAIN_PICK = { charId: ASCLN, skillIndex: 2, uniEquipId: 'uniequip_002_ascln' };
const WANG_PICK = { charId: WANG, skillIndex: 0, uniEquipId: 'uniequip_002_wang' };
const KIT = [...KITTED_CHARS];

function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  yield* walk(v.props?.children);
}
const hasClass = (v, c) => typeof v?.props?.class === 'string' && v.props.class.split(/\s+/).includes(c);
/** Render a component tree one level of function components deep at a time (htm vnodes with function types). */
function expand(v, depth = 6) {
  if (Array.isArray(v)) return v.map((x) => expand(x, depth));
  if (!v || typeof v !== 'object') return v;
  if (typeof v.type === 'function' && depth > 0) {
    try { return expand(v.type(v.props || {}), depth - 1); } catch { return v; }
  }
  const children = v.props?.children;
  return children === undefined ? v : { ...v, props: { ...v.props, children: expand(children, depth) } };
}
const textOf = (v) => [...walk(v)].flatMap((n) => (Array.isArray(n.props?.children) ? n.props.children : [n.props?.children])).filter((x) => typeof x === 'string' || typeof x === 'number').join('');

describe('自选编队 model (ui/diyModel.js)', () => {
  test('storage: tolerant parse, junk and hostile keys dropped, round trip', () => {
    assert.deepEqual(M.parseStoredDiy(null), {});
    const raw = { v: 1, picks: { [T5A]: MAIN_PICK, [T6A]: { charId: WANG }, __proto__x: 1, bad: { charId: 'a b' }, [T6B]: { charId: ASCLN, skillIndex: 99 } } };
    assert.deepEqual(M.parseStoredDiy(raw), { [T5A]: MAIN_PICK, [T6A]: { charId: WANG }, [T6B]: { charId: ASCLN } });
    assert.deepEqual(M.toStoredDiy({ [T5A]: MAIN_PICK }), { v: M.DIY_VERSION, picks: { [T5A]: MAIN_PICK } });
    assert.equal(M.diyCount({ [T5A]: MAIN_PICK, [T6A]: null }), 1);
    assert.deepEqual(M.setPick({ [T5A]: MAIN_PICK }, T5A, null), {});
    assert.deepEqual(M.setPick({}, T6A, { charId: WANG }), { [T6A]: { charId: WANG } });
  });

  test('the twelve slots by tier (six per tier, 盟约 too since maintainer decision 2026-11-19), with the 调度中心 level that sells them', () => {
    assert.deepEqual(M.diySlotList(D).map((s) => [s.slotId, s.tier, s.shopLevel]), [5, 6].flatMap((t) => [1, 2, 3, 4, 5, 6].map((n) => [`chess_char_${t}_diy${n}_a`, t, t])));
  });

  test('the picker lists only kitted operators — our picks, no prototype —, marks one a slot of the other tier holds', () => {
    const opts = M.pickOptions(T5A, {}, D, KIT);
    const ids = opts.map((o) => o.charId);
    assert.deepEqual([...ids].sort(), [...LOCAL_DIY_PICKS].sort(), 'our picks');
    assert.ok(ids.every((id) => KIT.includes(id)), 'no operator without a kit');
    assert.ok(opts.every((o) => !o.proto), 'no prototype');
    assert.ok(!ids.includes('char_609_acguad') && !ids.includes('char_601_cguard'), 'the stand-ins (in the kit list) are no picks');
    assert.deepEqual(opts.find((o) => o.charId === ASCLN).bonds, ['emptyShip']);
    assert.deepEqual(opts.find((o) => o.charId === WANG).bonds, ['yanShip']);
    assert.deepEqual(M.pickOptions(T6A, {}, D, KIT).map((o) => o.charId).sort(), [...ids].sort(), 'the same five at tier 6');
    // taken: an owned operator in a slot of the other tier; the tier's own slots are the picker's choices (it fills the
    // whole tier at once — docs/rules/ui.md 「선발 편성 탭」)
    const roster = { [T5B]: { charId: WANG, skillIndex: 0 }, [T6A]: MAIN_PICK };
    const at5 = M.pickOptions(T5A, roster, D, KIT);
    assert.equal(at5.find((o) => o.charId === ASCLN).taken, T6A);
    assert.equal(at5.find((o) => o.charId === WANG).taken, null, 'another slot of the same tier: still a choice');
    assert.equal(at5.find((o) => o.charId === CHEN3).taken, null);
    assert.deepEqual(M.pickOptions(T5A, {}, D, []), [], 'no kit list (not connected): nothing to pick');
  });

  test('each season\'s picker lists that season\'s picks: 规程\'s offers 焰影苇草, 新约能天使 and 缇缇 (盟约\'s chess), each with three skills', () => {
    const seasons = allSeasonData();
    assert.ok(seasons.act3autochess, 'the 规程 data (data/seasons/act3autochess/)');
    for (const [season, d] of Object.entries(seasons)) {
      for (const slot of M.diySlotList(d).map((x) => x.slotId)) {
        const ids = M.pickOptions(slot, {}, d, KIT).map((o) => o.charId);
        assert.deepEqual([...ids].sort(), [...seasonPicks(d.chess)].sort(), `${season} ${slot}: the season's picks`);
        for (const id of ids) assert.deepEqual(M.pickChoices(id, slot, d)?.skills.map((x) => x.index), [0, 1, 2], `${season} ${slot} ${id}: three skills`);
      }
    }
    const act3 = M.pickOptions(T5A, {}, seasons.act3autochess, KIT).map((o) => o.charId);
    for (const id of ['char_1020_reed2', 'char_1041_angel2', 'char_4056_titi']) {
      assert.ok(act3.includes(id) && !LOCAL_DIY_PICKS.includes(id), `${id}: a 规程 pick, 盟约's chess`);
    }
  });

  test('choices: three skills, the elite form\'s modules without the 集成战略 (ISW-A) ones; the default pick', () => {
    const ch = M.pickChoices(ASCLN, T6A, D);
    assert.deepEqual(ch.skills.map((s) => s.index), [0, 1, 2]);
    assert.deepEqual(ch.modules.map((x) => x.uniEquipId), ['uniequip_002_ascln', 'uniequip_003_ascln']);
    assert.equal(ch.stage, 3);
    assert.equal(ch.proto, false);
    assert.equal(M.pickChoices(ASCLN, T5A, D).stage, 1);
    // none of our picks has a mode-only module: the rule on synthetic data (阿斯卡纶's AMB-Y relabelled ISW-A)
    const b2 = structuredClone(D.backups);
    for (const f of Object.values(b2.units[ASCLN].forms)) for (const m of f.modules ?? []) if (m.uniEquipId === 'uniequip_003_ascln') m.typeName = 'ISW-A';
    const isw = M.pickChoices(ASCLN, T6A, { ...D, backups: b2 });
    assert.ok(isw.elite.modules.some((x) => x.typeName === 'ISW-A'), 'the form has one');
    assert.ok(!isw.modules.some((x) => x.rec.typeName === 'ISW-A'), 'never offered');
    assert.deepEqual(M.defaultPick(ASCLN, T5A, D), { charId: ASCLN, skillIndex: 1, uniEquipId: 'uniequip_002_ascln' }, 'S2 (LOCAL_DIY_DEFAULT_SKILL) and the first module');
    assert.equal(M.defaultPick('char_1035_wisdel', T5A, D).skillIndex, 1, '维什戴尔 starts with S2');
    assert.equal(M.defaultPick('char_1052_kalts2', T5A, D).skillIndex, 1, '凯尔希·思衡托 starts with S2');
    assert.equal(M.defaultPick(WANG, T5A, D).skillIndex, 2, 'an unlisted pick starts with its last skill');
  });

  test('sanitize keeps what the server keeps; export / import envelopes', () => {
    assert.deepEqual(M.sanitizeDiyPicks({ [T5A]: MAIN_PICK, [T6A]: { charId: ASCLN, skillIndex: 0 }, [T6B]: { charId: 'char_609_acguad' } }, D, KIT), { [T5A]: MAIN_PICK }, 'a second slot of the operator and a prototype dropped');
    const text = M.serializeDiy({ [T5A]: MAIN_PICK }, { now: 0 });
    const env = JSON.parse(text);
    assert.deepEqual([env.kind, env.v, env.count, env.picks], [M.DIY_EXPORT_KIND, 1, 1, { [T5A]: MAIN_PICK }]);
    assert.deepEqual(M.parseDiyImport(text), { ok: true, picks: { [T5A]: MAIN_PICK } });
    assert.deepEqual(M.parseDiyImport({ v: 1, picks: {} }), { ok: true, picks: {} });
    for (const bad of ['', '{nope', { v: 9, picks: {} }, { kind: 'stronghold.ownership', v: 1, notOwned: [] }, 'x'.repeat(M.DIY_IMPORT_MAX_BYTES + 1), [1]]) {
      assert.equal(M.parseDiyImport(bad).ok, false, JSON.stringify(bad).slice(0, 30));
    }
  });
});

// ---- sync -------------------------------------------------------------------------------------------------------------

function fakeNet() {
  const listeners = new Map();
  const net = {
    status: 'online', sent: [], replies: [],
    on(t, fn) { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(fn); return () => listeners.get(t).delete(fn); },
    emit(t, msg) { for (const fn of listeners.get(t) || []) fn(msg); },
    request(t, fields) {
      net.sent.push({ t, ...fields });
      const r = net.replies.shift();
      return r && r.error ? Promise.reject(Object.assign(new Error(r.error), { code: r.error })) : Promise.resolve({ t: 'ok' });
    },
  };
  return net;
}
function fakeTimers() {
  let now = 0;
  let seq = 0;
  const q = new Map();
  return {
    setTimeout: (fn, ms) => { const id = ++seq; q.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: (id) => q.delete(id),
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...q.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        q.delete(next[0]);
        now = next[1].at;
        next[1].fn();
        for (let i = 0; i < 5; i++) await Promise.resolve();
      }
      now = end;
      for (let i = 0; i < 5; i++) await Promise.resolve();
    },
  };
}

test('diy sync: welcome brings the kit list and sends room.diy; edits are debounced; in a match stored for the next one (told once)', async () => {
  const net = fakeNet();
  const T = fakeTimers();
  const told = [];
  const target = createStore({ diy: { [T5A]: MAIN_PICK }, diyKitted: null, open: false, diySync: 'idle' });
  const s = installDiySync({ net, timers: T, target, notify: (x) => told.push(x) });
  net.emit('welcome', { diyKitted: [ASCLN, WANG, 7] });
  assert.deepEqual(target.get().diyKitted, [ASCLN, WANG]);
  await T.advance(100);
  assert.deepEqual(net.sent, [{ t: 'room.diy', picks: { [T5A]: MAIN_PICK } }]);
  assert.equal(target.get().diySync, 'synced');
  target.set({ diy: { [T5A]: MAIN_PICK, [T6A]: WANG_PICK } });
  await T.advance(SYNC_DEBOUNCE_MS + 10);
  assert.deepEqual(net.sent[1], { t: 'room.diy', picks: { [T5A]: MAIN_PICK, [T6A]: WANG_PICK } });
  net.replies.push({ error: 'ROOM_STARTED' });
  target.set({ diy: {} });
  await T.advance(SYNC_DEBOUNCE_MS + 10);
  assert.equal(target.get().diySync, 'locked');
  assert.deepEqual(told, ['本局的自选编队已锁定，修改将在下一局生效']);
  net.emit('room.state', { inMatch: false });
  await T.advance(SYNC_DEBOUNCE_MS + 10);
  assert.deepEqual(net.sent.at(-1), { t: 'room.diy', picks: {} });
  s.dispose();
});

// docs/rules/ui.md 「규정 선발 편성 확정 화면」 「프리셋 상자와 준비」: 准备就绪 waits for the lineup in flight, and a lineup
// the match refused (the ready overtook it) goes again after 取消准备 — before, it only reached the next match.
test('diy sync: flushDiySync waits for the same lineup in flight; resendDiySync sends a refused one again', async () => {
  const net = fakeNet();
  const T = fakeTimers();
  const held = [];
  const real = net.request;
  net.request = (t, fields) => (net.hold ? new Promise((res) => { net.sent.push({ t, ...fields }); held.push(res); }) : real(t, fields));
  const target = createStore({ diy: {}, diyKitted: null, open: false, diySync: 'idle' });
  const s = installDiySync({ net, timers: T, target, notify: () => {} });
  net.emit('welcome', {});
  await T.advance(100);
  assert.equal(target.get().diySync, 'synced');
  // a request on the wire: a flush of the same content resolves only with its reply
  net.hold = true;
  target.set({ diy: { [T5A]: MAIN_PICK } });
  void flushDiySync();
  await T.advance(0);
  assert.equal(net.sent.length, 2);
  let done = false;
  void flushDiySync().then(() => { done = true; });
  await T.advance(0);
  assert.equal(done, false, 'still waiting for the reply of the request in flight');
  assert.equal(net.sent.length, 2, 'the same lineup is not sent twice');
  held.shift()();
  await T.advance(0);
  assert.equal(done, true);
  net.hold = false;
  await T.advance(SYNC_DEBOUNCE_MS + 10); // the edit's own debounce: already sent
  assert.equal(net.sent.length, 2);
  // refused (the seat readied first): 'locked'; resendDiySync sends the same lineup again, once
  net.replies.push({ error: 'ROOM_STARTED' });
  target.set({ diy: { [T5A]: MAIN_PICK, [T6A]: WANG_PICK } });
  await T.advance(SYNC_DEBOUNCE_MS + 10);
  assert.equal(target.get().diySync, 'locked');
  const n = net.sent.length;
  resendDiySync();
  await T.advance(100);
  assert.deepEqual(net.sent.slice(n), [{ t: 'room.diy', picks: { [T5A]: MAIN_PICK, [T6A]: WANG_PICK } }], 'the refused lineup goes again');
  assert.equal(target.get().diySync, 'synced');
  resendDiySync(); // not locked: nothing
  await T.advance(100);
  assert.equal(net.sent.length, n + 1);
  s.dispose();
});

// ---- the tab --------------------------------------------------------------------------------------------------------------

describe('自选编队 tab (screens/diy.js)', () => {
  /**
   * The tier picker driven like the component (DiyPicker keeps this state): `st` holds order / edits / focus and what
   * the callbacks received; `view()` draws it again.
   */
  const pickerOf = (tier, picks, extra = {}) => {
    const start = pickerStart(tier, picks, D);
    const st = { order: start.order, edits: start.edits, focus: start.order[0] ?? null, query: '', done: [], refused: 0, detail: 0 };
    const view = () => expand(DiyPickerView({ m: null, tier, picks, kitted: KIT, onDone: (l) => st.done.push(l), onClose() {},
      query: st.query, order: st.order, edits: st.edits, focus: st.focus, top: start.order,
      onOrder: (o) => { st.order = o; }, onEdits: (f) => { st.edits = f(st.edits); }, onFocus: (f) => { st.focus = f; },
      onRefuse: () => { st.refused++; }, onNarrowDetail: (v) => { if (v) st.detail++; }, ...extra }));
    const nodes = () => [...walk(view())];
    const row = (charId) => nodes().find((v) => hasClass(v, 'diy-opt') && v.props['data-char'] === charId);
    const tap = (charId) => { const r = row(charId); assert.ok(r, `${charId} is listed`); r.props.onClick({ target: { closest: () => null } }); };
    const click = (key, value) => {
      const node = nodes().find((v) => v.props?.[key] === value && typeof v.props.onClick === 'function' && (key === 'data-testid' || v.props.role === 'radio'));
      assert.ok(node, `${key}=${value} is clickable`);
      node.props.onClick();
    };
    return { st, view, nodes, row, tap, click };
  };
  const numberOf = (r) => textOf([...walk(r)].find((v) => hasClass(v, 'diy-opt__idx')) ?? null);

  for (const tier of [5, 6]) {
    const slot = tier === 5 ? T5A : T6A;
    for (const saved of [null, MAIN_PICK]) {
      test(`the tier ${tier} picker, ${saved ? 'a saved' : 'no'} pick: a row's edits stay with the operator, out of the choice and back`, () => {
        const p = pickerOf(tier, saved ? { [slot]: saved } : {});
        assert.deepEqual(p.st.order, saved ? [ASCLN] : []);
        if (saved) p.tap(ASCLN); // out, to come back below
        p.tap(ASCLN);
        assert.deepEqual(p.st.order, [ASCLN]);
        assert.equal(p.st.focus, ASCLN, 'the detail shows the last row tapped');
        p.click('data-skill', 0);
        p.click('data-module', 'none');
        const edited = { charId: ASCLN, skillIndex: 0, uniEquipId: null };
        assert.deepEqual(p.st.edits[ASCLN], edited);
        p.tap(ASCLN);
        assert.deepEqual(p.st.order, [], 'a second tap takes it out');
        p.tap(ASCLN);
        assert.deepEqual(p.st.edits[ASCLN], edited, 'its edits come back with it');
        // searching it out and back in changes nothing either
        p.st.query = 'no matching operator';
        assert.ok(!p.nodes().some((v) => hasClass(v, 'diy-opt')));
        p.st.query = '阿斯卡纶';
        assert.ok(p.row(ASCLN));
        p.click('data-testid', 'diy-confirm');
        assert.deepEqual(p.st.done, [[edited]]);
        // another operator starts at its default pick
        p.st.query = '';
        p.tap(WANG);
        p.click('data-testid', 'diy-confirm');
        assert.deepEqual(p.st.done.at(-1), [edited, M.defaultPick(WANG, slot, D)]);
      });
    }
  }

  test('the picker: several at once, numbered in the order chosen, six at most (a seventh refused), 清空选择, the other tier greyed', () => {
    const picks = { [T5B]: WANG_PICK, [T5A]: MAIN_PICK, [T6A]: { charId: CHEN3, skillIndex: 0 } };
    const p = pickerOf(5, picks);
    // the tier's operators first, in slot order (T5A before T5B), numbered 1, 2
    assert.deepEqual(p.st.order, [ASCLN, WANG]);
    const rows = p.nodes().filter((v) => hasClass(v, 'diy-opt'));
    assert.deepEqual(rows.slice(0, 2).map((v) => v.props['data-char']), [ASCLN, WANG]);
    assert.deepEqual([numberOf(p.row(ASCLN)), numberOf(p.row(WANG))], ['1', '2']);
    assert.ok(hasClass(p.row(ASCLN), 'is-on') && !hasClass(p.row(ASCLN), 'is-taken'), 'the same tier\'s other slot: a choice, not greyed');
    // the other tier's operator: greyed, its row does nothing
    assert.ok(hasClass(p.row(CHEN3), 'is-taken'));
    p.tap(CHEN3);
    assert.deepEqual(p.st.order, [ASCLN, WANG]);
    // taking the first out renumbers the rest
    p.tap(ASCLN);
    assert.equal(numberOf(p.row(WANG)), '1');
    // fill to six, then a seventh is refused and nothing changes
    const free = rows.map((v) => v.props['data-char']).filter((c) => c !== CHEN3 && c !== WANG);
    for (const c of free.slice(0, 5)) p.tap(c);
    assert.equal(p.st.order.length, 6);
    assert.equal(textOf(p.nodes().find((v) => v.props?.['data-testid'] === 'diy-pick-count')), '6/6');
    const before = [...p.st.order];
    const seventh = free[5];
    assert.ok(seventh, 'a seventh operator to try');
    p.tap(seventh);
    assert.deepEqual([p.st.order, p.st.refused], [before, 1], 'refused: the choice stays as it was');
    // 清空选择 empties the choice (the slots change only on 确认)
    p.click('data-testid', 'diy-pick-clear');
    assert.deepEqual(p.st.order, []);
  });

  test('确认 fills the tier\'s slots 1… in the order chosen and empties the rest (one write); 取消 changes nothing', () => {
    const many = [];
    const closed = [];
    const picks = { [T5B]: WANG_PICK };
    const panel = DiyPanelView({ m: null, picks, legal: picks, kitted: KIT, onSet() { throw new Error('one write'); }, onSetMany: (e) => many.push(e),
      picking: 5, onPicking: (v) => closed.push(v) });
    const picker = [...walk(panel)].find((v) => v.props?.tier === 5 && typeof v.props.onDone === 'function');
    picker.props.onDone([{ ...MAIN_PICK }, WANG_PICK]);
    const slots5 = M.diySlotList(D).filter((s) => s.tier === 5).map((s) => s.slotId);
    assert.deepEqual(many, [slots5.map((id, i) => [id, [MAIN_PICK, WANG_PICK][i] ?? null])]);
    assert.deepEqual(closed, [null]);
    picker.props.onClose();
    assert.equal(many.length, 1);
  });

  test('narrow screens: 详情 › opens the row\'s detail and leaves the choice alone', () => {
    const p = pickerOf(5, {});
    const det = [...walk(p.row(WANG))].find((v) => hasClass(v, 'diy-opt__det'));
    assert.ok(det, 'every row ends with 详情');
    det.props.onClick();
    assert.deepEqual([p.st.focus, p.st.detail, p.st.order], [WANG, 1, []]);
  });

  test('narrow screens: the detail has its own footer — 取消 / 确认 go back to the list, never confirm the lineup', () => {
    const calls = [];
    const p = pickerOf(5, {}, { narrowDetail: true, onNarrowDetail: (v) => calls.push(['back', v]), onDetailCancel: () => calls.push(['cancel']) });
    const ids = p.nodes().map((v) => v.props?.['data-testid']).filter(Boolean);
    assert.ok(!ids.includes('diy-confirm') && !ids.includes('diy-pick-clear'), 'the lineup\'s 清空选择 / 确认 are not in the detail\'s footer');
    assert.ok(!p.nodes().some((v) => hasClass(v, 'diy-pick__back') || hasClass(v, 'diy-pick__x')), 'no 干员列表 / close buttons');
    p.click('data-testid', 'diy-detail-cancel');
    p.click('data-testid', 'diy-detail-ok');
    assert.deepEqual(calls, [['cancel'], ['back', null]]);
    assert.deepEqual(p.st.done, []);
  });

  test('narrow screens: the detail\'s 取消 puts back everything it changed — skill / module, 潜能 / 练度 and the skin', () => {
    const run = (edits, ops, skins, nowOps, nowSkins, nowEdits) => {
      const was = detailOpen(WANG, edits, ops, skins);
      const calls = [];
      let out = nowEdits;
      undoDetail(was, { ops: nowOps, skins: nowSkins }, {
        setEdits: (f) => { out = f(out); }, onOps: (c, patch) => calls.push(['ops', c, patch]),
        setSkin: (c, id) => calls.push(['skin', c, id]), clearSkin: (c) => calls.push(['clear', c]) });
      return { out, calls };
    };
    const pick = { charId: WANG, skillIndex: 0 };
    // opened at defaults, no skin, no entry; then everything changed
    const a = run({}, {}, {}, { [WANG]: { potential: 1, cultivate: 1 } }, { [WANG]: 'skin_x' }, { [WANG]: { charId: WANG, skillIndex: 1 } });
    assert.deepEqual(a.out, {}, 'the entry made in the detail goes');
    const d = detailOpen(WANG, {}, {}, {});
    assert.deepEqual(a.calls, [['ops', WANG, { potential: d.potential, cultivate: d.cultivate }], ['clear', WANG]]);
    // opened with an entry, 潜能 / 练度 and a skin; then changed
    const ops0 = { [WANG]: { potential: 2, cultivate: 1 } };
    const b = run({ [WANG]: pick }, ops0, { [WANG]: 'skin_a' }, {}, { [WANG]: 'skin_b' }, { [WANG]: { ...pick, skillIndex: 2 } });
    assert.deepEqual(b.out, { [WANG]: pick });
    assert.deepEqual(b.calls, [['ops', WANG, { potential: 2, cultivate: 1 }], ['skin', WANG, 'skin_a']]);
    // nothing changed: only the entry is set back (to itself), no store writes
    const c = run({ [WANG]: pick }, ops0, { [WANG]: 'skin_a' }, ops0, { [WANG]: 'skin_a' }, { [WANG]: pick });
    assert.deepEqual([c.out, c.calls], [{ [WANG]: pick }, []]);
  });

  test('twelve slots by tier: an empty one is the official empty slot, a filled one the 干员调配 card; a tap opens the slot\'s tier', () => {
    const opened = [];
    const tree = expand(DiyPanelView({ m: data.get('assets'), picks: { [T5A]: MAIN_PICK, [T6A]: WANG_PICK }, legal: { [T5A]: MAIN_PICK, [T6A]: WANG_PICK }, kitted: KIT,
      onSet() {}, picking: null, onPicking: (v) => opened.push(v) }));
    const slots = [...walk(tree)].filter((v) => hasClass(v, 'diy-slot'));
    assert.deepEqual(slots.map((v) => v.props['data-slot']), [5, 6].flatMap((t) => [1, 2, 3, 4, 5, 6].map((n) => `chess_char_${t}_diy${n}_a`)));
    assert.deepEqual([slots[0].props['data-char'], slots[6].props['data-char']], [ASCLN, WANG]);
    const card = [...walk(slots[0])].find((v) => v.props?.testid === 'diy-slot-card');
    assert.ok(card && card.props.pick === MAIN_PICK && card.props.tier === 5, 'the filled slot draws the shared card (ui/diyCard.js)');
    const fill = [...walk(slots[1])].find((v) => hasClass(v, 'diy-slot__fill'));
    assert.ok(hasClass(slots[1], 'is-empty') && fill);
    fill.props.onClick();
    card.props.onTap(T5A);
    [...walk(slots[7])].find((v) => hasClass(v, 'diy-slot__fill')).props.onClick();
    assert.deepEqual(opened, [5, 5, 6], 'a slot opens its tier\'s picker');
    // no 潜能 / 练度 selects on the tab (the picker's rows carry them) and no 原型 / 已持有 tag (maintainer decision 2026-10-07)
    assert.ok(![...walk(tree)].some((v) => v.type === 'select' || hasClass(v, 'diy-tag')));
  });

  test('the picker detail (upstream 0.2.4): 潜能与练度, 局内数值, and skill numbers at the rank each slot piece fights at', async () => {
    const { getDefaultSource } = await import('../../server/sim/simdata.js');
    const ds = getDefaultSource();
    const pick = { charId: CHEN3, skillIndex: 0, uniEquipId: null };
    const ops = { [CHEN3]: { potential: 6, cultivate: 3 } };
    const view = (previewLevel, o = {}) => expand(DiyPickerView({ m: null, tier: 5, picks: {}, kitted: KIT, onDone() {}, onClose() {},
      query: '', order: [CHEN3], edits: { [CHEN3]: pick }, focus: CHEN3, ops, onOps() {}, previewLevel, onPreviewLevel() {}, ...o }), 8);
    const s1 = (tree) => [...walk(tree)].find((v) => v.props?.role === 'radio' && v.props['data-skill'] === 0);
    // the sim's def of each piece: the slot's `_a` form is skill rank 4, the `_b` (精锐) rank 7 — 潜能 / 练度 never change it
    const simA = ds.getChess(T5A, { diy: pick, potential: 6 });
    const simB = ds.getChess('chess_char_5_diy1_b', { diy: pick, potential: 6 });
    assert.deepEqual([simA.skill.bb.atk, simA.skill.spCost, simA.skill.initSp], [0.65, 27, 6]);
    assert.deepEqual([simB.skill.bb.atk, simB.skill.spCost, simB.skill.initSp], [0.8, 24, 7]);
    for (const [level, sim, lv] of [['elite', simB, 7], ['normal', simA, 4]]) {
      const tree = view(level);
      const stats = [...walk(tree)].find((v) => hasClass(v, 'lo-sec--stats'));
      assert.ok(stats, `${level}: 局内数值 is drawn`);
      assert.equal(stats.props['data-variant'], level);
      // the skill section's level toggle (screens/loadoutSections.js SkillSection): the tab on is the level shown
      const lvTag = [...walk(tree)].find((v) => v.props?.role === 'tab' && v.props['aria-selected'] === 'true' && /Lv\./.test(textOf(v)));
      assert.ok(textOf(lvTag).includes(`Lv.${lv}`), `${level}: the skill heading names rank ${lv}`);
      const row = textOf(s1(tree));
      const desc = [...walk(s1(tree))].find((v) => hasClass(v, 'lo-skill__desc'))?.props.text || '';
      assert.ok(desc.includes(`+${Math.round(sim.skill.bb.atk * 100)}%`), `${level}: S1 shows the sim's ATK +${sim.skill.bb.atk * 100}% (${desc})`);
      assert.ok(row.includes(String(sim.skill.spCost)) && row.includes(String(sim.skill.initSp)), `${level}: S1 shows the sim's SP ${sim.skill.initSp} / ${sim.skill.spCost}`);
    }
    // the 潜能与练度 selects of the pick (an owned operator)
    const cult = (tree) => [...walk(tree)].some((v) => v.type === 'h3' && textOf(v).includes('潜能与练度'));
    assert.ok(cult(view('elite')), 'the cultivation selects');
    assert.ok(!cult(view('elite', { onOps: null })), 'none without a setter');
  });

  test('the shared card: the level column on both screens, the name in bestFit (no ellipsis), the lineup art borrowed by 盟约', () => {
    const card = readFileSync(path.join(ROOT, 'public/js/ui/diyCard.js'), 'utf8');
    assert.match(card, /<\$\{LevelColumn\} /, 'the level column (obj_left_info_part) is part of the card — docs/rules/ui.md 「카드」');
    assert.match(card, /useFitLine\(nameRef, name, CARD_NAME_FIT\)/, 'txt_char_name bestFit — docs/rules/ui.md 「카드」');
    assert.match(card, /CARD_NAME_FIT = Object\.freeze\(\{ min: 6, wrap: false/);
    const css = readFileSync(path.join(ROOT, 'public/css/screens/diychoose.css'), 'utf8');
    assert.doesNotMatch(css.match(/\.dccard__name \{[^}]*\}/)[0], /text-overflow/, 'no ellipsis on the card name');
    for (const f of ['public/js/screens/diyChoose.js', 'public/js/screens/diy.js']) {
      assert.match(readFileSync(path.join(ROOT, f), 'utf8'), /import \{ DiyCard[^}]*\} from '\.\.\/ui\/diyCard\.js'/, `${f} draws the shared card`);
    }
    assert.match(readFileSync(path.join(ROOT, 'public/js/screens/diy.js'), 'utf8'), /const art = withDiyChooseArt\(m, data\.get\('local'\)\);/, "盟约's tab draws 规程's lineup art");
  });

  test('the card portrait keeps its full width and the profession slot draws the square glyph (maintainer report 2026-11-19)', () => {
    const css = readFileSync(path.join(ROOT, 'public/css/screens/diychoose.css'), 'utf8');
    assert.match(css.match(/\.dccard__por img \{[^}]*\}/)[0], /max-width: none/,
      "the portrait (102 in its 80.5 window) is cut to 80.5 by theme.css img { max-width: 100% } without max-width none — docs/rules/ui.md 「카드」");
    const card = readFileSync(path.join(ROOT, 'public/js/ui/diyCard.js'), 'utf8');
    assert.match(card, /const prof = profGlyphUrl\(m, rec\?\.profession\)/,
      'img_profession is a 16 × 16 square: the prof.large glyph, not the wide prof.icon banner — docs/rules/ui.md 「카드」');
  });
});

// ---- match UI -------------------------------------------------------------------------------------------------------------

describe('match UI of a 自选 piece', () => {
  const priv = { diy: { [T5A]: MAIN_PICK, [T6A]: WANG_PICK }, loadout: {}, standIns: [], board: [], hand: [], temp: [] };
  test('gameLogic: the own pick of a slot (normal + elite), the composed record, the own getter', () => {
    assert.deepEqual(G.ownDiyPick(priv, getChess(T5A)), MAIN_PICK);
    assert.deepEqual(G.ownDiyPick(priv, getChess('chess_char_5_diy1_b')), MAIN_PICK, 'the elite too');
    assert.equal(G.ownDiyPick(priv, getChess(T5B)), null, 'a slot not filled');
    assert.equal(G.ownDiyPick(priv, getChess('chess_char_4_22_a')), null);
    const rec = G.ownDiyRecord(getChess(T5A), priv, D);
    assert.deepEqual([rec.name, rec.charId, rec.diyFor, rec.bonds, rec.tier, rec.price], [DATA.backups.units[ASCLN].name, ASCLN, T5A, ['emptyShip'], 5, 4]);
    assert.equal(G.ownDiyRecord(getChess(T5A), priv, D), rec, 'cached');
    const get = G.diyGetter(getChess, priv, D);
    assert.equal(get(T5A), rec);
    assert.equal(get('chess_char_4_22_a'), getChess('chess_char_4_22_a'));
    assert.equal(G.chessLoadout(get('chess_char_5_diy1_b'), priv.loadout, get).skill.skillId, 'skchr_ascln_3', 'the pick\'s skill');
    assert.equal(G.deployedModuleId(get('chess_char_5_diy1_b'), priv, get, D.backups), 'uniequip_002_ascln', 'the pick\'s module on the elite');
    assert.equal(G.cardDiy(getChess(T5A), { unit: { diy: { charId: CHEN3, skillIndex: 2, uniEquipId: 'uniequip_002_chen3' } }, data: D }).charId, CHEN3, 'a teammate\'s unit says it itself');
  });

  test('placement reads the operator\'s position (阿斯卡纶 melee) through the own getter', () => {
    const get = G.diyGetter(getChess, priv, D);
    const ctx = G.placementContext({ priv, stage: null, editable: true, getChess: get, backups: D.backups });
    assert.equal(G.piecePosition(ctx, { kind: 'chess', id: T5A }), 'MELEE');
  });

  // maintainer decision 2026-10-08: no 「自选」 badge on the card — upstream 0def7bab's removed
  test('shop / reward card: the operator\'s name and bonds, the pick\'s skill, no 「自选」 badge', () => {
    const card = ChessCard({ slot: { kind: 'chess', id: T5A, price: 4, basePrice: 4 }, idx: 0, priv, onBuy() {}, onDetail() {} });
    const nodes = [...walk(card)];
    assert.equal(nodes.find((v) => hasClass(v, 'scard__diy')), undefined);
    assert.ok(!JSON.stringify(nodes.map((v) => v?.props?.children ?? null).filter((x) => typeof x === 'string')).includes('自选'), 'no 自选 text');
    assert.equal(nodes.find((v) => hasClass(v, 'scard__name')).props.children, DATA.backups.units[ASCLN].name);
    assert.ok(nodes.some((v) => v.props?.bondId === 'emptyShip'), 'the derived bond');
    assert.equal(nodes.find((v) => v?.type && v.props?.lo).props.lo.skill.skillId, 'skchr_ascln_3');
  });

  test('detail card: own piece / card / a unit carrying diy → the operator, the 「自选」 tag, the pick\'s skill and module', () => {
    const piece = { uid: 7, kind: 'chess', id: 'chess_char_5_diy1_b', golden: true, items: [] };
    const pieces = new Map([[7, { piece, area: 'board', row: 10, col: 4 }]]);
    const r = resolveDetail({ kind: 'piece', uid: 7 }, pieces, { priv, backups: D.backups });
    assert.equal(r.chess.charId, ASCLN);
    assert.deepEqual(r.diy, MAIN_PICK);
    assert.equal(resolveDetail({ kind: 'chess', id: T5A }, new Map(), { priv, backups: D.backups }).chess.charId, ASCLN, 'a shop card');
    assert.equal(resolveDetail({ kind: 'chess', id: T5A, foreign: true }, new Map(), { priv, backups: D.backups }).diy, undefined, 'the banned list / another player\'s card');
    const u = resolveDetail({ kind: 'unit', unit: { id: 3, uid: 33, side: 'ally', kind: 'op', defId: T6A, diy: { charId: CHEN3, skillIndex: 2, uniEquipId: 'uniequip_002_chen3' } } }, new Map(), { priv: null, backups: D.backups });
    assert.equal(u.chess.charId, CHEN3);
    const blocks = ChessDetail({ chess: r.chess, piece, editable: false, bonds: [], loadout: priv.loadout, diy: r.diy });
    const head = blocks.find((b) => b.key === 'head');
    assert.equal([...walk(head)].find((v) => hasClass(v, 'dtag-diy'))?.props.children, '自选');
    assert.equal([...walk(head)].find((v) => hasClass(v, 'dhead__name')).props.children, DATA.backups.units[ASCLN].name);
    const skill = blocks.find((b) => b.key === 'skill');
    assert.ok(JSON.stringify(skill.props).includes('skchr_ascln_3'));
    const mod = blocks.find((b) => b.key === 'module');
    assert.ok(JSON.stringify(mod.props).includes('uniequip_002_ascln'), 'the pick\'s module (elite)');
    assert.ok(!blocks.some((b) => b.key === 'garrison'), 'no 特质');
  });

  // maintainer report 2026-11-24: 规程's leader ranking drew a 自选 row as the slot's glyph 「선」 — the row had no pick
  test('a row naming a 自选 slot and its pick (m.public leaderTop, m.result) draws the operator (FieldedThumb)', () => {
    const srcs = (v) => [...walk(v)].map((n) => n.props?.src).filter((x) => typeof x === 'string');
    const th = expand(FieldedThumb({ u: { id: T6A, diy: { charId: CHEN3, skillIndex: 2, uniEquipId: null } } }));
    assert.ok(srcs(th).some((x) => x.includes(CHEN3)), `the operator's avatar (${srcs(th)})`);
    assert.equal(th.props.title, DATA.backups.units[CHEN3].name);
    const bare = expand(FieldedThumb({ u: { id: T6A } }));
    assert.ok(!srcs(bare).some((x) => x.includes(CHEN3)), 'without the pick only the slot record');
    assert.match(readFileSync(path.join(ROOT, 'public/js/ui/avatarBadges.js'), 'utf8'), /<\$\{FieldedThumb\} u=\$\{u\}/, 'the leader ranking draws its rows through FieldedThumb');
  });

  // maintainer report 2026-10-08: no 「自选」 tag under the own pieces of a filled slot — upstream 0def7bab's removed
  test('own prep pieces of a filled slot get no tag (the 补位 「替补」 tag stays its own)', () => {
    const p = { ...priv, hand: [{ uid: 1, kind: 'chess', id: T5A }, { uid: 2, kind: 'chess', id: 'chess_char_4_22_a' }], temp: [], board: [{ uid: 4, kind: 'chess', id: 'chess_char_6_diy1_b', row: 10, col: 4 }] };
    assert.deepEqual(standInPieces(p, getChess, D.backups), []);
    assert.doesNotMatch(readFileSync(path.join(ROOT, 'public/js/screens/game/standInTags.js'), 'utf8'), /diyPieces|ownDiyRecord|t\('自选'\)/);
  });

  test('bonds: the popup lists the own 自选 member and a teammate\'s by its unit\'s pick', () => {
    const get = G.diyGetter(getChess, priv, D);
    const own = { ...priv, board: [{ uid: 4, kind: 'chess', id: T5A, row: 10, col: 4 }], hand: [{ uid: 5, kind: 'chess', id: T6A }] };
    const empty = G.bondMembers(DATA.bonds.emptyShip, own, [], get);
    const row = empty.find((x) => x.diy);
    assert.deepEqual([row.id, row.name, row.onBoard, row.owned, row.rec.charId], [T5A, DATA.backups.units[ASCLN].name, true, true, ASCLN]);
    const yan = G.bondMembers(DATA.bonds.yanShip, own, [], get);
    assert.deepEqual(yan.filter((x) => x.diy).map((x) => [x.id, x.inHand, x.rec.charId]), [[T6A, true, WANG]], '望 in the hand counts for 炎');
    assert.equal(G.memberHeadCount(empty.filter((x) => x.diy)), 1);
    // a watched teammate: its board from the field units, their picks carried along (watchBonds ownerBoard)
    const field = { units: [{ kind: 'op', ownerId: 'p_2', defId: T5B, diy: { charId: CHEN3, skillIndex: 0, uniEquipId: null } }] };
    const mate = ownerBoard(field, 'p_2');
    assert.deepEqual(mate.board[0].diy, { charId: CHEN3, skillIndex: 0, uniEquipId: null });
    const pieceRecord = (p) => (p.diy ? G.diyRecordFor(getChess(p.id), p.diy, D) : null) || getChess(p.id);
    const rows = G.bondMembers(DATA.bonds.yanShip, mate, [], getChess, () => null, pieceRecord);
    assert.ok(rows.some((x) => x.diy && x.rec.charId === CHEN3), '赤刃明霄陈 is a 炎 member');
    // the popup itself renders the 自选 row with its tag
    const pop = expand(BondPopup({ bondId: 'emptyShip', entry: { count: 1, active: false, tier: 0, layers: 0 }, priv: own, onClose() {} }));
    const mrow = [...walk(pop)].find((v) => hasClass(v, 'bpop__member') && textOf(v).includes(DATA.backups.units[ASCLN].name));
    assert.ok(mrow, 'the 自选 member row');
    assert.ok(![...walk(mrow)].some((v) => hasClass(v, 'bpop__diy')), 'no 「自选」 badge (maintainer decision 2026-10-08)');
  });

  test('the renderer draws the operator (pieceInfo reads m.private.diy; UnitInfo diy is kept)', () => {
    const src = readFileSync(path.join(ROOT, 'public/js/render/app.js'), 'utf8');
    assert.match(src, /const pick = chess && chess\.isDiy \? diyPicks\[chess\.baseId \|\| chess\.chessId\] : null;/);
    assert.match(src, /diyPicks = src\.diy && typeof src\.diy === 'object' \? src\.diy : \{\};/);
    assert.match(readFileSync(path.join(ROOT, 'public/js/render/app/info.js'), 'utf8'), /diy: u\.diy && typeof u\.diy === 'object'/);
  });
});
