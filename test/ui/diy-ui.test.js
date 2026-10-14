// 0.2.0 自选编队 — client side (research 0.2.0 §2; the owner's decisions of 2026-10-05): the 自选编队 tab's model (storage,
// the slots, the picker's operators with the kit list — our picks, shared/local-diy.js, no prototype —, skill / module
// choices without 集成战略 modules, export / import)
// and its server sync (room.diy; welcome.diyKitted), the tab's components (four slots, the picker, 确认), and the match
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
const { installDiySync, SYNC_DEBOUNCE_MS } = await import('../../public/js/ui/loadoutSync.js');
const { createStore } = await import('../../public/js/store.js');
const G = await import('../../public/js/ui/gameLogic.js');
const { ChessCard } = await import('../../public/js/ui/shopBar.js');
const { ChessDetail, resolveDetail } = await import('../../public/js/ui/detailPanel.js');
const { BondPopup } = await import('../../public/js/ui/bondStrip.js');
const { ownerBoard } = await import('../../public/js/ui/watchBonds.js');
const { standInPieces } = await import('../../public/js/screens/game/standInTags.js');
const { DiyPanelView, DiyPickerView } = await import('../../public/js/screens/diy.js');
const { data } = await import('../../public/js/data.js');
const { DATA } = await import('../match/harness.js');
const { KITTED_CHARS } = await import('../../server/sim/content/kits/index.js');
const { LOCAL_DIY_PICKS } = await import('../../shared/local-diy.js');

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

  test('the four slots by tier, with the 调度中心 level that sells them', () => {
    assert.deepEqual(M.diySlotList(D).map((s) => [s.slotId, s.tier, s.shopLevel]), [[T5A, 5, 5], [T5B, 5, 5], [T6A, 6, 6], [T6B, 6, 6]]);
  });

  test('the picker lists only kitted operators — our picks, no prototype —, marks one another slot holds', () => {
    const opts = M.pickOptions(T5A, {}, D, KIT);
    const ids = opts.map((o) => o.charId);
    assert.deepEqual([...ids].sort(), [...LOCAL_DIY_PICKS].sort(), 'our picks');
    assert.ok(ids.every((id) => KIT.includes(id)), 'no operator without a kit');
    assert.ok(opts.every((o) => !o.proto), 'no prototype');
    assert.ok(!ids.includes('char_609_acguad') && !ids.includes('char_601_cguard'), 'the stand-ins (in the kit list) are no picks');
    assert.deepEqual(opts.find((o) => o.charId === ASCLN).bonds, ['emptyShip']);
    assert.deepEqual(opts.find((o) => o.charId === WANG).bonds, ['yanShip']);
    assert.deepEqual(M.pickOptions(T6A, {}, D, KIT).map((o) => o.charId).sort(), [...ids].sort(), 'the same five at tier 6');
    // taken: an owned operator in any other slot
    const roster = { [T5B]: { charId: WANG, skillIndex: 0 }, [T6A]: MAIN_PICK };
    const at5 = M.pickOptions(T5A, roster, D, KIT);
    assert.equal(at5.find((o) => o.charId === ASCLN).taken, T6A);
    assert.equal(at5.find((o) => o.charId === WANG).taken, T5B);
    assert.equal(at5.find((o) => o.charId === CHEN3).taken, null);
    assert.deepEqual(M.pickOptions(T5A, {}, D, []), [], 'no kit list (not connected): nothing to pick');
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
  assert.deepEqual(told, ['选择策略已结束，本局的自选编队已锁定，修改将在下一局生效']);
  net.emit('room.state', { inMatch: false });
  await T.advance(SYNC_DEBOUNCE_MS + 10);
  assert.deepEqual(net.sent.at(-1), { t: 'room.diy', picks: {} });
  s.dispose();
});

// ---- the tab --------------------------------------------------------------------------------------------------------------

describe('自选编队 tab (screens/diy.js)', () => {
  for (const slotId of [T5A, T6A]) {
    for (const saved of [null, MAIN_PICK]) {
      test(`the picker: ${slotId}, ${saved ? 'saved' : 'empty'} slot retains edits when reselecting its operator`, () => {
        const picks = saved ? { [slotId]: saved } : {};
        const done = [];
        let draft = saved ? { ...saved } : null;
        let filter = 'all';
        let query = '';
        const view = () => expand(DiyPickerView({ m: null, slot: { slotId }, picks, kitted: KIT,
          onDone: (p) => done.push(p), onClose() {}, filter, query, draft,
          onFilter: (f) => { filter = f; }, onQuery: (q) => { query = q; }, onDraft: (d) => { draft = d; } }));
        const click = (key, value) => {
          const node = [...walk(view())].find((v) => v.props?.[key] === value && typeof v.props.onClick === 'function');
          assert.ok(node, `${key}=${value} is clickable`);
          node.props.onClick();
        };
        click('data-char', ASCLN);
        click('data-skill', 0);
        click('data-module', 'none');
        const edited = { charId: ASCLN, skillIndex: 0, uniEquipId: null };
        assert.deepEqual(draft, edited);
        click('data-char', ASCLN);
        assert.deepEqual(draft, edited, 'reselecting keeps both the skill and explicit no-module choice');
        // Searching the operator out and back in must not change the draft either (no 原型 / 已持有 filter here since 2026-10-07).
        query = 'no matching operator';
        assert.ok(![...walk(view())].some((v) => hasClass(v, 'diy-opt')));
        query = '阿斯卡纶';
        click('data-char', ASCLN);
        assert.deepEqual(draft, edited);
        click('data-testid', 'diy-confirm');
        assert.deepEqual(done, [edited]);
        assert.deepEqual(picks, saved ? { [slotId]: saved } : {}, 'the saved picks stay unchanged until the parent saves');
        // Switching operators still initializes the new pick, and returning restores the saved/default pick.
        query = '';
        click('data-char', WANG);
        assert.deepEqual(draft, M.defaultPick(WANG, slotId, D));
        click('data-char', ASCLN);
        assert.deepEqual(draft, saved || M.defaultPick(ASCLN, slotId, D));
      });
    }
  }

  test('four slots by tier: an empty slot to fill, a filled one shows the operator, its skill and module — no 原型 / 已持有 tag', () => {
    const tree = expand(DiyPanelView({ m: data.get('assets'), picks: { [T5A]: MAIN_PICK, [T6A]: WANG_PICK }, legal: { [T5A]: MAIN_PICK, [T6A]: WANG_PICK }, kitted: KIT, onSet() {}, picking: null, onPicking() {} }));
    const slots = [...walk(tree)].filter((v) => hasClass(v, 'diy-slot'));
    assert.deepEqual(slots.map((v) => v.props['data-slot']), [T5A, T5B, T6A, T6B]);
    const first = slots[0];
    assert.equal(first.props['data-char'], ASCLN);
    const txt = textOf(first);
    assert.ok(txt.includes(DATA.backups.units[ASCLN].name) && txt.includes('S3') && txt.includes('AMB-X'), txt);
    assert.equal(slots[2].props['data-char'], WANG);
    // every pick here is an owned 6★ (no prototypes): no 原型 / 已持有 tag on any slot (maintainer decision 2026-10-07)
    for (const v of slots) assert.ok(!textOf(v).includes('已持有') && !textOf(v).includes('原型') && ![...walk(v)].some((x) => hasClass(x, 'diy-tag')), v.props['data-slot']);
    assert.ok(hasClass(slots[1], 'is-empty') && textOf(slots[1]).includes('选择干员'));
  });

  test('the picker: the slot\'s operators; choosing one and its skill / module confirms the pick', () => {
    const done = [];
    let draft = { ...MAIN_PICK };
    const view = () => expand(DiyPickerView({ m: null, slot: { slotId: T5A, tier: 5, shopLevel: 5 }, picks: { [T5A]: MAIN_PICK }, kitted: KIT, onDone: (p) => done.push(p), onClose() {},
      filter: 'all', query: '', draft, onFilter() {}, onQuery() {}, onDraft: (d) => { draft = d; } }));
    let tree = view();
    const opts = [...walk(tree)].filter((v) => hasClass(v, 'diy-opt'));
    assert.deepEqual(opts.map((v) => v.props['data-char']).sort(), [...LOCAL_DIY_PICKS].sort());
    // no 全部 / 原型 / 已持有 filter chips and no kind tags (maintainer decision 2026-10-07)
    assert.ok(![...walk(tree)].some((v) => v.props?.['data-filter'] != null || hasClass(v, 'lo-chip') || hasClass(v, 'diy-tag')), 'no filter chips, no tags');
    // the current pick is shown with its three skills and its modules (none + X + Y)
    const skills = [...walk(tree)].filter((v) => v.props?.role === 'radio' && v.props['data-skill'] != null);
    assert.deepEqual(skills.map((v) => v.props['data-skill']), [0, 1, 2]);
    assert.equal(skills.find((v) => v.props['aria-checked'] === 'true').props['data-skill'], 2);
    const mods = [...walk(tree)].filter((v) => v.props?.role === 'radio' && v.props['data-module'] != null);
    assert.deepEqual(mods.map((v) => v.props['data-module']), ['none', 'uniequip_002_ascln', 'uniequip_003_ascln']);
    // another skill and no module, then 确认
    skills.find((v) => v.props['data-skill'] === 0).props.onClick();
    tree = view();
    [...walk(tree)].find((v) => v.props?.role === 'radio' && v.props['data-module'] === 'none').props.onClick();
    tree = view();
    [...walk(tree)].find((v) => v.props?.['data-testid'] === 'diy-confirm').props.onClick();
    assert.deepEqual(done, [{ charId: ASCLN, skillIndex: 0, uniEquipId: null }]);
    // another operator: its default pick (S3, its first module) until changed
    [...walk(tree)].find((v) => hasClass(v, 'diy-opt') && v.props['data-char'] === WANG).props.onClick();
    tree = view();
    assert.deepEqual([...walk(tree)].filter((v) => v.props?.role === 'radio' && v.props['data-module'] != null).map((v) => v.props['data-module']), ['none', 'uniequip_002_wang']);
    [...walk(tree)].find((v) => v.props?.['data-testid'] === 'diy-confirm').props.onClick();
    assert.deepEqual(done.at(-1), { charId: WANG, skillIndex: 2, uniEquipId: 'uniequip_002_wang' });
  });

  test('the picker of a filled slot carries 清空 (the draft\'s preset slot opens it — maintainer request 2026-10-13)', () => {
    let cleared = 0;
    const view = (picks, onClear) => expand(DiyPickerView({ m: null, slot: { slotId: T5A, tier: 5, shopLevel: 5 }, picks, kitted: KIT, onDone() {}, onClose() {},
      onClear, filter: 'all', query: '', draft: picks[T5A] ? { ...picks[T5A] } : null, onFilter() {}, onQuery() {}, onDraft() {} }));
    const clear = (tree) => [...walk(tree)].find((v) => v.props?.['data-testid'] === 'diy-pick-clear');
    clear(view({ [T5A]: MAIN_PICK }, () => cleared++)).props.onClick();
    assert.equal(cleared, 1);
    assert.equal(clear(view({}, () => cleared++)), undefined, 'an empty slot: nothing to clear');
    assert.equal(clear(view({ [T5A]: MAIN_PICK }, null)), undefined, 'no handler: no button');
    // the panel: 清空 empties the slot and closes the picker
    const set = [];
    const closed = [];
    const panel = DiyPanelView({ m: null, picks: { [T5A]: MAIN_PICK }, legal: { [T5A]: true }, kitted: KIT, onSet: (id, p) => set.push([id, p]),
      picking: T5A, onPicking: (v) => closed.push(v) });
    const picker = [...walk(panel)].find((v) => v.props?.slot?.slotId === T5A && typeof v.props.onDone === 'function');
    picker.props.onClear();
    assert.deepEqual(set, [[T5A, null]]);
    assert.deepEqual(closed, [null]);
  });

  test('the picker detail (upstream 0.2.4): 潜能与练度, 局内数值, and skill numbers at the rank each slot piece fights at', async () => {
    const { getDefaultSource } = await import('../../server/sim/simdata.js');
    const ds = getDefaultSource();
    const pick = { charId: CHEN3, skillIndex: 0, uniEquipId: null };
    const ops = { [CHEN3]: { potential: 6, cultivate: 3 } };
    const view = (previewLevel, o = {}) => expand(DiyPickerView({ m: null, slot: { slotId: T5A, tier: 5, shopLevel: 5 }, picks: {}, kitted: KIT, onDone() {}, onClose() {},
      filter: 'all', query: '', draft: pick, onFilter() {}, onQuery() {}, onDraft() {}, ops, onOps() {}, previewLevel, onPreviewLevel() {}, ...o }), 8);
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
      const lvTag = [...walk(tree)].find((v) => hasClass(v, 'diy-pick__lv'));
      assert.equal(lvTag.props['data-variant'], level);
      assert.ok(textOf(lvTag).includes(`Lv.${lv}`), `${level}: the skill heading names rank ${lv}`);
      const row = textOf(s1(tree));
      const desc = [...walk(s1(tree))].find((v) => hasClass(v, 'diy-choice__desc'))?.props.text || '';
      assert.ok(desc.includes(`+${Math.round(sim.skill.bb.atk * 100)}%`), `${level}: S1 shows the sim's ATK +${sim.skill.bb.atk * 100}% (${desc})`);
      assert.ok(row.includes(String(sim.skill.spCost)) && row.includes(String(sim.skill.initSp)), `${level}: S1 shows the sim's SP ${sim.skill.initSp} / ${sim.skill.spCost}`);
    }
    // the 潜能与练度 selects of the pick (an owned operator)
    const cult = (tree) => [...walk(tree)].some((v) => v.type === 'h3' && textOf(v).includes('潜能与练度'));
    assert.ok(cult(view('elite')), 'the cultivation selects');
    assert.ok(!cult(view('elite', { onOps: null })), 'none without a setter');
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
