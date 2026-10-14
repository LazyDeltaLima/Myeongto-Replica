// feedback6 R21C — the owner's report of 2026-10-07 「自选编队的干员在局内对应盟约展开的名单里没有显示出来」: the bond
// popup's member list (ui/bondStrip.js BondPopup over gameLogic bondMembers) listed every regular member, dimmed while not
// owned, but the player's 自选 picks (m.private.diy) only once owned (board, hand, 临时整备区) — a pick not bought yet, or
// not in the shop yet (the tier-5 / tier-6 slots from 调度中心 level 5 / 6), never showed. Now each pick is a row of every
// bond its operator carries: the operator's name and portrait (its normal-form composed record, one row per slot) —
// upstream adds a 「自选」 tag, we do not (docs/rules/upstream.md J-2) — dimmed until owned, counted by neither 在场 nor the 成员 header until it is on the board (or in the
// hand, for a bond that counts the hand), left out when all its bonds are off this match (m.private.diyBanned), as banned
// members are (owner, 2026-10-13: the client's dialog lists neither). A watched
// teammate's popup lists their 自选 pieces on the field (their picks are not on the client) and such a row opens THEIR
// operator's card, not the empty 甄选干员 slot's.
// Ported from upstream 41fd3c7e onto our five picks (shared/local-diy.js): each carries one bond, so 赤刃明霄陈 (炎) stands
// for upstream's 推进之王 (维多利亚) and 阿斯卡纶 (无) for 煌 (炎 + 维多利亚); no pick of ours carries two bonds.
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

const G = await import('../../public/js/ui/gameLogic.js');
const { BondPopup } = await import('../../public/js/ui/bondStrip.js');
const { resolveDetail } = await import('../../public/js/ui/detailPanel.js');
const { ownerBoard } = await import('../../public/js/ui/watchBonds.js');
const { data } = await import('../../public/js/data.js');
const { DATA } = await import('../match/harness.js');

await data.loadAll('chess', 'bonds', 'assets', 'garrisons', 'items', 'backups');

const D = { chess: DATA.chess, backups: DATA.backups };
const getChess = (id) => (Object.hasOwn(DATA.chess, id) ? DATA.chess[id] : null);
const T5A = 'chess_char_5_diy1_a';
const T5A_ELITE = 'chess_char_5_diy1_b';
const T5B = 'chess_char_5_diy2_a';
const T5B_ELITE = 'chess_char_5_diy2_b';
const SIEGE = 'char_1050_chen3'; // 赤刃明霄陈: 炎 (upstream's 推进之王)
const HUANG = 'char_4132_ascln'; // 阿斯卡纶: 无 (upstream's 煌)
const SIEGE_PICK = { charId: SIEGE, skillIndex: 2, uniEquipId: 'uniequip_002_chen3' };
const HUANG_PICK = { charId: HUANG, skillIndex: 0, uniEquipId: null };
const SIEGE_NAME = DATA.backups.units[SIEGE].name;
const HUANG_NAME = DATA.backups.units[HUANG].name;
const PIPER = 'chess_char_4_17_a'; // 星熊 (炎), droppable: her stand-in is 预备干员-重装 (upstream: 风笛 / 维多利亚)
const PIPER_STANDIN = 'char_610_acfend';
const ENTRY = { count: 0, active: false, tier: 0, layers: 0 };

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

/** The own m.private: 赤刃明霄陈 in the first tier-5 slot, 阿斯卡纶 in the second, nothing bought. */
const privOf = (extra = {}) => ({
  playerId: 'p_1', diy: { [T5A]: SIEGE_PICK, [T5B]: HUANG_PICK }, diyBanned: [], loadout: {}, standIns: [], board: [], hand: [], temp: [], ...extra,
});
/** The member rows as the own popup reads them (the own getter: gameLogic/diy.js diyGetter). */
const rowsOf = (bondId, priv) => G.bondMembers(DATA.bonds[bondId], priv, [], G.diyGetter(getChess, priv, D));
const popup = (props) => expand(BondPopup({ entry: ENTRY, onClose() {}, ...props }));
const memberButtons = (pop) => [...walk(pop)].filter((v) => hasClass(v, 'bpop__member'));
const piece = (uid, id, at = null) => ({ uid, kind: 'chess', id, items: [], ...(at ? { row: at[0], col: at[1] } : {}) });

describe('feedback6 R21C: the 自选 picks in the bond popup\'s member list', () => {
  test('an unowned pick is a dimmed row of its operator\'s bond (not bought, not in the shop yet); 在场 and the 成员 header count it for nothing', () => {
    const priv = privOf();
    const vic = rowsOf('yanShip', priv);
    const n = DATA.bonds.yanShip.visibleMembers.length;
    const siege = vic.find((r) => r.id === T5A);
    assert.ok(siege, 'the unbought 赤刃明霄陈 is a 炎 row');
    assert.deepEqual([siege.diy, siege.name, siege.tier, siege.owned, siege.onBoard, siege.inHand, siege.rec.charId],
      [true, SIEGE_NAME, 5, false, false, false, SIEGE]);
    assert.equal(vic.length, n + 1, 'the members + 赤刃明霄陈 (阿斯卡纶 is no 炎 operator)');
    assert.equal(G.memberHeadCount(vic), 0);
    assert.equal(G.memberHeadCount(vic, true), 0, 'nor when the bond counts the hand');
    // the order rule (on board, owned, tier, id): after the unowned tier-5 members, before the tier-6 ones
    const ids = vic.map((r) => r.id);
    assert.ok(ids.indexOf('chess_char_5_23_a') < ids.indexOf(T5A) && ids.indexOf(T5A) < ids.indexOf('chess_char_6_03_a'), ids.join(' '));
    const empty = rowsOf('emptyShip', priv).map((r) => r.id);
    assert.ok(empty.includes(T5B) && !empty.includes(T5A), '无: 阿斯卡纶 only');
    assert.ok(empty.indexOf('chess_char_5_10_a') < empty.indexOf(T5B) && empty.indexOf(T5B) < empty.indexOf('chess_char_6_12_a'), empty.join(' '));
    assert.deepEqual(rowsOf('victoriaShip', priv).filter((r) => r.diy), [], '维多利亚: neither');
    assert.equal(rowsOf('yanShip', privOf({ diy: {} })).length, n, 'no picks: the members alone');

    // the popup: the operator's name and portrait (no 「自选」 tag — J-2), dimmed like an unowned member, header 0 / n + 1
    const calls = [];
    const pop = popup({ bondId: 'yanShip', priv, onMember: (...a) => calls.push(a) });
    const btn = memberButtons(pop).find((v) => v.props['data-diy'] === SIEGE);
    assert.ok(btn, 'the 赤刃明霄陈 row');
    assert.ok(textOf(btn).includes(SIEGE_NAME));
    assert.ok(!hasClass(btn, 'is-on') && !hasClass(btn, 'is-owned'));
    assert.ok([...walk(btn)].some((v) => hasClass(v, 'uthumb') && hasClass(v, 'is-dim')), 'dimmed');
    assert.ok(![...walk(btn)].some((v) => hasClass(v, 'bpop__diy')), 'no 自选 tag (J-2, the owner\'s decision of 2026-10-08)');
    const head = [...walk(pop)].find((v) => v.type === 'h4' && textOf(v).startsWith('成员'));
    assert.ok(textOf(head).includes(`0/${n + 1}`), textOf(head));
    // a tap opens the operator's card, as a member's does
    btn.props.onClick();
    assert.deepEqual(calls, [[T5A, null]]);
    const card = resolveDetail({ kind: 'chess', id: T5A, owner: 'p_1', items: null, standInFor: null, diy: null }, new Map(), { priv, backups: D.backups });
    assert.equal(card.chess.charId, SIEGE);
    assert.deepEqual(card.diy, SIEGE_PICK);
  });

  test('owned → on: in the hand, the 临时整备区, on the board (normal or elite) the pick is one row, drawn as its normal form; the header follows', () => {
    const steps = [
      ['not bought', privOf(), { owned: false, onBoard: false, inHand: false }, [0, 0]],
      ['in the hand', privOf({ hand: [piece(1, T5A)] }), { owned: true, onBoard: false, inHand: true }, [0, 1]],
      ['in the 临时整备区', privOf({ temp: [piece(1, T5A)] }), { owned: true, onBoard: false, inHand: false }, [0, 0]],
      ['on the board', privOf({ board: [piece(1, T5A, [10, 4])] }), { owned: true, onBoard: true, inHand: false }, [1, 1]],
      ['the elite on the board, a normal copy in the hand', privOf({ board: [piece(1, T5A_ELITE, [10, 4])], hand: [piece(2, T5A)] }), { owned: true, onBoard: true, inHand: true }, [1, 1]],
    ];
    for (const [label, priv, want, [head, headHand]] of steps) {
      const rows = rowsOf('yanShip', priv);
      const mine = rows.filter((r) => r.id === T5A);
      assert.equal(mine.length, 1, `${label}: one row`);
      const [r] = mine;
      assert.deepEqual({ owned: r.owned, onBoard: r.onBoard, inHand: r.inHand }, want, label);
      assert.deepEqual([r.diy, r.rec.charId, r.rec.isGolden, r.name], [true, SIEGE, false, SIEGE_NAME], `${label}: the operator, normal form (one row per member)`);
      assert.equal(G.memberHeadCount(rows), head, `${label}: 成员 header`);
      assert.equal(G.memberHeadCount(rows, true), headHand, `${label}: 成员 header of a bond that counts the hand`);
      if (r.owned) assert.equal(rows[0].id, T5A, `${label}: owned rows first`);
    }
    // the popup: on the board → lit, not dimmed
    const pop = popup({ bondId: 'yanShip', priv: steps[4][1], entry: { ...ENTRY, count: 1 } });
    const btn = memberButtons(pop).find((v) => v.props['data-diy'] === SIEGE);
    assert.ok(hasClass(btn, 'is-on'));
    assert.ok(![...walk(btn)].some((v) => hasClass(v, 'is-dim')));
    assert.ok(![...walk(btn)].some((v) => hasClass(v, 'is-golden')), 'the normal portrait, as a member row');
  });

  test('each pick is a row of its own operator\'s bond only (阿斯卡纶: 无); a 补位 stand-in of the same bond keeps its row', () => {
    const priv = privOf({ standIns: [PIPER], board: [piece(1, PIPER, [10, 4])] });
    const r = rowsOf('emptyShip', priv).find((x) => x.id === T5B);
    assert.ok(r, '阿斯卡纶 is a 无 row');
    assert.deepEqual([r.diy, r.name, r.owned, r.onBoard], [true, HUANG_NAME, false, false]);
    assert.ok(!rowsOf('yanShip', priv).some((x) => x.id === T5B), 'not a 炎 row');
    const pop = popup({ bondId: 'yanShip', priv, entry: { ...ENTRY, count: 1 } });
    const buttons = memberButtons(pop);
    const si = buttons.find((v) => v.props['data-standin'] === PIPER_STANDIN);
    assert.ok(si && hasClass(si, 'is-on'), '星熊 on the board, drawn as her stand-in');
    assert.deepEqual(buttons.filter((v) => v.props['data-diy']).map((v) => v.props['data-diy']), [SIEGE], 'the 炎 pick listed beside the stand-in');
    // bought and deployed: on
    const owned = privOf({ board: [piece(3, T5B_ELITE, [10, 5])] });
    const rows = rowsOf('emptyShip', owned);
    assert.deepEqual(rows.filter((x) => x.diy && x.onBoard).map((x) => x.id), [T5B]);
    assert.equal(G.memberHeadCount(rows), 1);
  });

  test('a pick whose bonds are all off this match (m.private.diyBanned: never in the shop) is left out like a banned member', () => {
    const priv = privOf({ diyBanned: [T5A] });
    assert.equal(rowsOf('yanShip', priv).some((x) => x.id === T5A), false, '赤刃明霄陈 is not listed');
    assert.ok(rowsOf('emptyShip', priv).some((x) => x.id === T5B), '阿斯卡纶 keeps its stock and its row');
    assert.equal(memberButtons(popup({ bondId: 'yanShip', priv })).some((v) => v.props['data-diy'] === SIEGE), false);
    // banned members are left out too (m.public.bannedChess), the rest stay
    const [m0] = DATA.bonds.yanShip.visibleMembers;
    const rows = G.bondMembers(DATA.bonds.yanShip, privOf(), [m0], G.diyGetter(getChess, privOf(), D));
    assert.equal(rows.some((x) => x.id === m0), false);
    assert.equal(rows.length, DATA.bonds.yanShip.visibleMembers.length, 'the other members + 赤刃明霄陈');
  });

  test('a watched teammate: their 自选 pieces on the field are rows (their picks are not sent), ours never are; the row opens THEIR operator\'s card', () => {
    // their elite 阿斯卡纶 on the field (UnitInfo diy, kept by ui/watchBonds.js ownerBoard); the board BondPopup gets for them
    const field = { units: [{ id: 9, kind: 'op', ownerId: 'p_2', defId: T5B_ELITE, diy: HUANG_PICK }] };
    const mate = ownerBoard(field, 'p_2');
    const pieceRecord = (p) => (p.diy ? G.diyRecordFor(getChess(p.id), p.diy, D) : null) || getChess(p.id);
    const get = G.diyGetter(getChess, mate, D);
    const yan = G.bondMembers(DATA.bonds.emptyShip, mate, [], get, () => null, pieceRecord);
    const r = yan.find((x) => x.diy);
    assert.deepEqual([r.id, r.name, r.onBoard, r.owned, r.rec.charId, r.rec.isGolden], [T5B, HUANG_NAME, true, true, HUANG, false]);
    assert.deepEqual(r.pick, HUANG_PICK, 'the unit\'s pick, for the card');
    const vic = G.bondMembers(DATA.bonds.yanShip, mate, [], get, () => null, pieceRecord);
    assert.deepEqual(vic.filter((x) => x.diy).map((x) => x.id), [], 'only what their field shows — never our own picks');
    assert.equal(G.bondMembers(DATA.bonds.victoriaShip, null, [], getChess).length, DATA.bonds.victoriaShip.visibleMembers.length, 'no board on screen');

    // the popup row hands the unit's pick on; the card composes their 阿斯卡纶, not the empty 甄选干员 slot
    const calls = [];
    const pop = popup({ bondId: 'emptyShip', priv: mate, owner: 'Mate', entry: { ...ENTRY, count: 1 }, onMember: (...a) => calls.push(a) });
    const btn = memberButtons(pop).find((v) => v.props['data-diy'] === HUANG);
    assert.ok(btn && hasClass(btn, 'is-on'));
    btn.props.onClick();
    assert.deepEqual(calls, [[T5B, null, null, HUANG_PICK]]);
    const own = privOf(); // our own 阿斯卡纶 pick is in the same slot: the card must still be theirs
    const card = resolveDetail({ kind: 'chess', id: T5B, owner: 'p_2', items: null, standInFor: null, diy: HUANG_PICK }, new Map(), { priv: own, backups: D.backups });
    assert.deepEqual([card.chess.charId, card.chess.name, card.diy], [HUANG, HUANG_NAME, HUANG_PICK]);
    const alien = resolveDetail({ kind: 'chess', id: T5A, owner: 'p_2', diy: HUANG_PICK }, new Map(), { priv: own, backups: D.backups });
    assert.equal(alien.chess.charId, HUANG, 'their pick, whatever our own slot holds');
    const bare = resolveDetail({ kind: 'chess', id: T5B, owner: 'p_2' }, new Map(), { priv: own, backups: D.backups });
    assert.equal(bare.diy, undefined, 'without a pick (the banned list, an older caller) the slot\'s own card, as before');
    // the game screen hands the pick on to the card
    const src = readFileSync(path.join(ROOT, 'public/js/screens/game.js'), 'utf8');
    assert.match(src, /onMember=\$\{\(id, items, standInFor, diy\) => setDetail\(\{ kind: 'chess', id, owner: bondPop\.ownerId, items: items \|\| null, standInFor: standInFor \|\| null, diy: diy \|\| null, from: 'bond' \}\)\}/);
  });

  test('a 自选 piece wearing 变形同构体 + a bond item is its operator in that bond\'s list, not the empty slot (owner\'s report 2026-10-13: 「自」)', () => {
    const ISO = 'chess_item_6_09_e_a'; // 变形同构体
    const HAMMER = 'chess_item_1_01_e_a'; // 维式重锤 → 维多利亚
    const getItem = (id) => data.lookup('items', id);
    const wear = (p) => ({ ...p, items: [{ uid: 90, id: ISO }, { uid: 91, id: HAMMER }] });
    // own: 赤刃明霄陈 (炎) on the board, elite, wearing the pair → a 维多利亚 row of 赤刃明霄陈's normal form
    const priv = privOf({ board: [wear(piece(4, T5A_ELITE, [10, 5]))] });
    const rows = G.bondMembers(DATA.bonds.victoriaShip, priv, [], G.diyGetter(getChess, priv, D), getItem);
    const r = rows.find((x) => x.id === T5A);
    assert.ok(r, rows.map((x) => x.id).join(' '));
    assert.deepEqual([r.granted, r.diy, r.name, r.tier, r.onBoard, r.rec.charId, r.rec.isGolden], [true, true, SIEGE_NAME, 5, true, SIEGE, false]);
    assert.deepEqual(r.items, [ISO, HAMMER]);
    const btn = memberButtons(popup({ bondId: 'victoriaShip', priv })).find((v) => v.props['data-diy'] === SIEGE);
    assert.ok(btn && hasClass(btn, 'is-granted') && hasClass(btn, 'is-on'), 'the row draws 赤刃明霄陈 (UnitThumb rec)');
    const raw = [...walk(BondPopup({ bondId: 'victoriaShip', entry: ENTRY, onClose() {}, priv }))].find((v) => v.props?.['data-diy'] === SIEGE);
    const thumb = [...walk(raw)].find((v) => v.props && 'rec' in v.props);
    assert.equal(thumb?.props.rec?.charId, SIEGE, 'UnitThumb gets the composed record');
    // a watched teammate's: the unit's pick names the operator, and the row hands it on to the card
    const mate = ownerBoard({ units: [{ id: 9, kind: 'op', ownerId: 'p_2', defId: T5B, diy: HUANG_PICK, items: [ISO, HAMMER] }] }, 'p_2');
    const pieceRecord = (p) => (p.diy ? G.diyRecordFor(getChess(p.id), p.diy, D) : null) || getChess(p.id);
    const m = G.bondMembers(DATA.bonds.victoriaShip, mate, [], G.diyGetter(getChess, mate, D), getItem, pieceRecord).find((x) => x.id === T5B);
    assert.deepEqual([m?.granted, m?.diy, m?.name, m?.rec.charId], [true, true, HUANG_NAME, HUANG]);
    assert.deepEqual(m.pick, HUANG_PICK);
    // a plain wearer stays a plain row
    const plain = G.bondMembers(DATA.bonds.victoriaShip, privOf({ board: [wear(piece(5, 'chess_char_1_01_a', [10, 6]))] }), [], getChess, getItem);
    const w = plain.find((x) => x.granted);
    assert.ok(w && !w.diy && !('rec' in w));
  });
});
