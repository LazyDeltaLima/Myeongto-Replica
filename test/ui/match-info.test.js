// GitHub issue #8 item 1 (v0.1.1): "选策略时没法返回查看禁用的干员和盟约" — once the match moved on from the briefing to the
// strategy draft there was no way to see the disabled bonds and the banned operators again, though players choose a
// strategy partly by them. ui/matchInfo.js is now the one implementation of the briefing's bond rows (greyed: the drawn
// set D, drawn as the client's stage-info bond items; briefingBondTip — the mode's static inactive bonds are left out as
// the client's view leaves them out, and the rows sort as the client sorts them), the legend
// and 本局禁用干员 grouped by greyed bond as the client groups them (by tier within a group): the briefing renders it (MatchInfo), the draft's 本局信息 dialog renders the same blocks
// (MatchInfoDialog), and the in-game 本局信息 tab reads the same model (matchInfoModel). The dialog's status line repeats
// the turn and its countdown (bandDraft.js draftInfoStatus) and a turn change closes it. Browser: test/ui/match-info.e2e.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

globalThis.fetch = async (url) => {
  const name = String(url).split('/').pop();
  try {
    const body = readFileSync(path.join(ROOT, 'data', name), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};

const { matchInfoModel, MatchBondRow, MatchLegend, BannedOperators, BannedGroups, MatchInfo, MatchInfoDialog, InfoBond, InfoTitle, ChessIcon,
  BondGroups, BondGroupsView, IncompleteTip, groupRows } = await import('../../public/js/ui/matchInfo.js');
const { briefingBondTip } = await import('../../public/js/ui/gameLogic.js');
const { Tooltip, Modal, Button } = await import('../../public/js/ui/components.js');
const { draftInfoStatus } = await import('../../public/js/screens/bandDraft.js');
const { data, getMode } = await import('../../public/js/data.js');
const { DATA, makeMatch } = await import('../match/harness.js');

await data.loadAll('chess', 'bonds', 'assets', 'config');
const DATA_BOND = (id) => data.lookup('bonds', id);
const SRC = (modeId) => ({ bonds: data.list('bonds'), chess: (id) => data.lookup('chess', id), mode: getMode(modeId) });

function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  if (typeof v.type === 'function' && !v.props?.children) return;
  yield* walk(v.props?.children);
}
const hasClass = (v, c) => typeof v?.props?.class === 'string' && v.props.class.split(/\s+/).includes(c);
const textOf = (v) => [...walk(v)].flatMap((n) => (Array.isArray(n.props?.children) ? n.props.children : [n.props?.children])).filter((x) => typeof x === 'string' || typeof x === 'number').join('');
const OFF_FUNNY = ['lateranoShip', 'egirShip', 'kazimierzShip', 'skillfulShip', 'arcaneShip', 'miraShip', 'investShip', 'raidShip', 'soloShip', 'suntShip'];

// a synthetic match: 萨尔贡 + 坚守 drawn (D), 奥术 switched off by the mode, banned operators out of tier order + an unknown id
const PUB = {
  modeId: 'mode_multi_hard', drawnDisabledBonds: ['sargonShip', 'steadShip'], disabledBonds: ['arcaneShip', 'sargonShip', 'steadShip'],
  bannedChess: ['chess_char_5_02_a', 'chess_char_1_17_a', 'chess_nope_a', 'chess_char_3_09_a', 'chess_char_1_02_a'],
};
const MODE = { inactiveBondIds: ['arcaneShip'] };
const model = () => matchInfoModel(PUB, { bonds: data.list('bonds'), chess: (id) => data.lookup('chess', id), mode: MODE });

// The client's order and filter of the stage-info bond items / groups (AutoChessStageInfoGroupViewModel._LoadBondDataFromIdRange,
// AutoChessStageInfoBondViewModel.CompareTo): a bond the mode switches off is skipped, then not banned first, identifier, bondId.
const CLIENT_ORDER = 'docs/rules/ui.md 「본판 정보의 맹약·결장 오퍼레이터를 공식 정보 화면 모양으로」: the rows are the bonds the mode keeps, those outside D first, then D, each by identifier then bondId';
function assertClientOrder(m, what) {
  const off = m.sets.off;
  for (const [row, isCore] of [[m.core, true], [m.addon, false]]) {
    assert.ok(row.every((b) => !off.has(b.bondId)), `${what}: a mode-off bond in a row — ${CLIENT_ORDER}`);
    const want = m.bonds.filter((b) => !!b.isCore === isCore && !off.has(b.bondId)).sort((a, b) => Number(m.sets.drawn.has(a.bondId)) - Number(m.sets.drawn.has(b.bondId)) || a.identifier - b.identifier);
    assert.deepEqual(row.map((b) => b.bondId), want.map((b) => b.bondId), `${what}: ${CLIENT_ORDER}`);
  }
  const groups = m.bannedGroups.map((g) => g.bond);
  assert.deepEqual(groups.map((b) => b.bondId), [...groups].sort((a, b) => a.identifier - b.identifier).map((b) => b.bondId), `${what}: groups by identifier — ${CLIENT_ORDER}`);
  assert.deepEqual(groups.map((b) => b.bondId).sort(), [...m.sets.drawn].sort(), `${what}: one group per bond of D, none for a mode-off bond — ${CLIENT_ORDER}`);
}

test('matchInfoModel: D and the mode-off bonds, the client\'s order, banned operators by tier (known, listed only), banned members per bond', () => {
  const m = model();
  assert.deepEqual([...m.sets.drawn].sort(), ['sargonShip', 'steadShip'], 'D = drawnDisabledBonds minus the static list');
  assert.deepEqual([...m.sets.off], ['arcaneShip'], 'the mode\'s inactive bonds');
  assert.equal(m.stateOf('arcaneShip'), 'off');
  assert.equal(m.stateOf('sargonShip'), 'drawn');
  assert.equal(m.stateOf('yanShip'), null);
  // the client's order: outside D first, then D (萨尔贡, 坚守), each by identifier; 奥术 (mode-off) is in neither row;
  // 调和 sits at its identifier (20), not ahead of the add-on row by its bondOrder
  assert.deepEqual(m.core.map((b) => b.name), ['炎', '维多利亚', '谢拉格', '拉特兰', '阿戈尔', '叙拉古', '卡西米尔', '萨尔贡']);
  assert.deepEqual(m.addon.map((b) => b.name), ['精准', '迅捷', '灵巧', '助力', '远见', '奇迹', '投资人', '突袭', '不屈', '调和', '协防干员', '独行', '绝技', '坚守']);
  assert.equal(m.core.length + m.addon.length, Object.keys(DATA.bonds).length - 1, 'every bond but the mode-off one, once');
  assert.equal(m.bonds.length, Object.keys(DATA.bonds).length, 'bonds: every record');
  assert.ok(m.core.every((b) => b.isCore) && m.addon.every((b) => !b.isCore));
  assertClientOrder(m, 'synthetic');
  // tiers 1, 1, 3, 5 — ties keep the server's order; the unknown id is dropped; only those under a bond of D are listed
  const known = ['chess_char_1_17_a', 'chess_char_1_02_a', 'chess_char_3_09_a', 'chess_char_5_02_a'];
  const underD = (id) => DATA.chess[id].bonds.some((b) => m.sets.drawn.has(b));
  assert.deepEqual(m.banned, known.filter(underD));
  assert.ok(known.some((id) => !underD(id)) && m.banned.length > 0, 'the fixture has listed and unlisted banned operators');
  assert.equal(m.perBond.get('arcaneShip'), 2, '深靛 + 海霓 (counted over every known banned id)');
  assert.equal(m.perBond.get('preciShip'), 2, '深靛 + 缇缇');
  assert.equal(m.perBond.get('yanShip'), 0);
  // an older payload without drawnDisabledBonds: disabledBonds minus the static list
  const old = matchInfoModel({ disabledBonds: ['arcaneShip', 'sargonShip'] }, { bonds: data.list('bonds'), chess: (id) => data.lookup('chess', id), mode: MODE });
  assert.deepEqual([...old.sets.drawn], ['sargonShip']);
  // nothing loaded yet: empty, never throws
  const empty = matchInfoModel(null);
  assert.deepEqual([empty.bonds.length, empty.banned.length, empty.sets.drawn.size, empty.sets.off.size], [0, 0, 0, 0]);
});

test('MatchBondRow: greyed by state (the stage-info banned item), the tip with the banned-member count', () => {
  const m = model();
  const row = MatchBondRow({ title: '附加盟约', micro: 'ADD-ON BONDS', bonds: m.addon, model: m });
  const head = [...walk(row)].find((v) => v.type === InfoTitle);
  assert.deepEqual([head.props.kind, head.props.title, head.props.micro], ['temp', '附加盟约', 'ADD-ON BONDS'], 'the client\'s temp_bond_title bar');
  const cell = (id) => [...walk(row)].find((v) => v.props?.['data-bond'] === id);
  const item = (id) => [...walk(cell(id))].find((v) => v.type === InfoBond);
  const tipOf = (id) => [...walk(row)].find((v) => v.type === Tooltip && v.key === id);
  // 奥术: switched off by the mode — not in the row at all (the client view skips it)
  assert.equal(cell('arcaneShip'), undefined);
  assert.equal(tipOf('arcaneShip'), undefined);
  // 坚守: drawn (D) — greyed as well, marked incomplete, the 阵容不完整 tip
  assert.ok(hasClass(cell('steadShip'), 'is-off') && hasClass(cell('steadShip'), 'is-incomplete'));
  assert.equal(item('steadShip').props.off, true);
  assert.equal(tipOf('steadShip').props.text, briefingBondTip('坚守', 'drawn', m.perBond.get('steadShip')));
  assert.match(tipOf('steadShip').props.text, /部分盟约所含干员阵容不完整/);
  // 精准: enabled — a lit item; the tip still counts its 2 banned members
  assert.ok(!hasClass(cell('preciShip'), 'is-off'));
  assert.equal(item('preciShip').props.off, false);
  assert.equal(tipOf('preciShip').props.text, '精准：部分盟约所含干员阵容不完整（2 名干员无法出现）');
  // 助力: untouched — lit, the plain name
  assert.equal(item('deputShip').props.off, false);
  assert.equal(tipOf('deputShip').props.text, '助力');
  // the item: the glyph, the banned mark only when greyed, the name
  const lit = InfoBond({ bond: DATA_BOND('deputShip'), off: false });
  const grey = InfoBond({ bond: DATA_BOND('steadShip'), off: true });
  assert.ok(!hasClass(lit, 'is-off') && hasClass(grey, 'is-off'));
  assert.equal([...walk(lit)].some((v) => hasClass(v, 'ibd__mark') || hasClass(v, 'ibd__x')), false);
  assert.equal([...walk(grey)].some((v) => hasClass(v, 'ibd__mark') || hasClass(v, 'ibd__x')), true);
  assert.match(textOf(grey), /坚守/);
});

test('MatchLegend: the grey of D only (the mode-off bonds are not shown, so no "或本模式禁用")', () => {
  const t = textOf(MatchLegend({ model: model() }));
  assert.match(t, /^灰色：部分盟约所含干员阵容不完整（仍可通过其他盟约的干员或装备激活）$/);
  const hard = matchInfoModel({ drawnDisabledBonds: ['sargonShip'] }, SRC('mode_multi_hard'));
  assert.doesNotMatch(textOf(MatchLegend({ model: hard })), /本模式禁用/);
});

test('BannedOperators: the count, one group per greyed bond (the bond, then its banned operators by tier); none ⇒ 本局没有禁用干员', () => {
  const m = model();
  // every drawn bond (even without banned members) by identifier, no mode-off bond
  assert.deepEqual(m.bannedGroups.map((g) => g.bond.bondId), ['sargonShip', 'steadShip']);
  for (const g of m.bannedGroups) {
    assert.deepEqual(g.chess, m.banned.filter((id) => DATA.bonds[g.bond.bondId].visibleMembers.includes(id)), 'its members, in the tier order');
  }
  assert.deepEqual([...new Set(m.bannedGroups.flatMap((g) => g.chess))].sort(), [...m.banned].sort(), 'the count = the listed operators');
  const block = BannedOperators({ model: m });
  const head = [...walk(block)].find((v) => v.type === InfoTitle);
  assert.deepEqual([head.props.kind, head.props.title, head.props.micro, textOf(head.props.extra)], ['chess', '本局禁用干员', 'BANNED OPERATORS', String(m.banned.length)]);
  const inner = [...walk(block)].find((v) => v.type === BannedGroups);
  assert.equal(inner.props.model, m);
  const groups = [...walk(BannedGroups({ model: m }))].filter((v) => hasClass(v, 'brief-bgroup'));
  assert.deepEqual(groups.map((v) => v.props['data-bond']), m.bannedGroups.map((g) => g.bond.bondId));
  for (const [i, gv] of groups.entries()) {
    const bond = [...walk(gv)].find((v) => v.type === InfoBond);
    assert.deepEqual([bond.props.bond, bond.props.off, bond.props.small], [m.bannedGroups[i].bond, true, true]);
    const thumbs = [...walk(gv)].filter((v) => v.type === ChessIcon);
    assert.deepEqual(thumbs.map((v) => v.props.id), m.bannedGroups[i].chess);
    assert.ok(thumbs.every((v) => v.props.banned === true), 'drawn banned (the red corner, the tier on the bottom-left)');
  }
  // the in-game tab's: each operator a button that opens its card
  const opened = [];
  const btns = [...walk(BannedGroups({ model: m, onChess: (id) => opened.push(id) }))].filter((v) => v.type === 'button' && hasClass(v, 'ibanned__one'));
  assert.deepEqual(btns.map((v) => v.props['data-chess']), m.bannedGroups.flatMap((g) => g.chess));
  btns[0].props.onClick();
  assert.deepEqual(opened, [m.bannedGroups.flatMap((g) => g.chess)[0]]);
  const none = BannedOperators({ model: matchInfoModel({}, SRC('mode_single_normal')) });
  assert.match(textOf(none), /本局没有禁用干员/);
  assert.equal([...walk(none)].filter((v) => v.type === ChessIcon).length, 0);
});

test('MatchInfo = 核心盟约, 附加盟约, the legend, 本局禁用干员 (one model); MatchInfoDialog = the same in a Modal with 关闭 and the status line', () => {
  const m = model();
  const parts = MatchInfo({ model: m }).filter((v) => v && typeof v === 'object');
  assert.deepEqual(parts.map((v) => v.type), [MatchBondRow, MatchBondRow, MatchLegend, BannedOperators]);
  assert.deepEqual(parts.slice(0, 2).map((v) => [v.props.title, v.props.bonds]), [['核心盟约', m.core], ['附加盟约', m.addon]]);
  assert.ok(parts.every((v) => v.props.model === m));
  const onClose = () => {};
  const dlg = MatchInfoDialog({ open: true, onClose, model: m, status: '轮到你决策' });
  assert.equal(dlg.type, Modal);
  assert.equal(dlg.props.open, true);
  assert.equal(dlg.props.onClose, onClose, 'Esc and a tap outside close it (components.js Modal)');
  assert.equal(dlg.props.title, '本局信息', 'the default title (确定自选编队\'s 本局信息)');
  assert.equal(MatchInfoDialog({ open: true, onClose, model: m, title: '盟约信息' }).props.title, '盟约信息', 'the draft titles it as its button');
  assert.equal(dlg.props.class, 'minfo-dlg');
  const inner = [...walk(dlg.props.children)].find((v) => v.type === MatchInfo);
  assert.equal(inner?.props.model, m, 'the very blocks of the briefing');
  const close = [...walk(dlg.props.actions)].find((v) => v.type === Button);
  assert.equal(close.props.onClick, onClose);
  assert.match(textOf(close), /关闭/);
  assert.match(textOf(dlg.props.actions), /轮到你决策/);
  const shut = MatchInfoDialog({ open: false, onClose, model: m });
  assert.equal(shut.props.open, false);
  assert.equal([...walk(shut.props.children)].find((v) => v.type === MatchInfo), undefined, 'nothing built while closed');
  assert.equal(MatchInfoDialog({ open: true, onClose, model: null }).props.open, false, 'no model: stays closed');
});

test('a real 标准 match (solo and co-op): the mode\'s 10 inactive bonds are left out, the client\'s order, the banned operators under D by tier', () => {
  for (const [mode, modeId] of [['solo', 'mode_single_funny'], ['coop', 'mode_multi_funny']]) {
    const h = makeMatch({ mode, difficulty: 'FUNNY', humans: 1, seed: 11 }).start();
    const pub = h.m.publicView();
    assert.equal(pub.modeId, modeId);
    const m = matchInfoModel(pub, SRC(pub.modeId));
    assert.deepEqual([...m.sets.off].sort(), [...OFF_FUNNY].sort(), `${modeId}: 标准模拟's inactiveBondIdList`);
    assert.equal(m.sets.drawn.size, 1, '标准 draws one add-on bond');
    assert.ok([...m.sets.drawn].every((b) => !OFF_FUNNY.includes(b) && !DATA.bonds[b].isCore));
    assert.ok(pub.bannedChess.every((id) => DATA.chess[id]), 'every banned operator is known');
    // listed: the banned operators with a bond of D — one banned only through the mode-off bonds is under no group
    assert.deepEqual([...m.banned].sort(), pub.bannedChess.filter((id) => DATA.chess[id].bonds.some((b) => m.sets.drawn.has(b))).sort());
    assert.ok(pub.bannedChess.length > m.banned.length, '标准 bans operators through its mode-off bonds alone');
    // grouped as the client: each listed operator under every one of its drawn bonds, each drawn bond has a group
    for (const id of m.banned) {
      assert.deepEqual(m.bannedGroups.filter((g) => g.chess.includes(id)).map((g) => g.bond.bondId).sort(), DATA.chess[id].bonds.filter((b) => m.sets.drawn.has(b)).sort(), `${id}: under each drawn bond`);
    }
    assertClientOrder(m, modeId);
    assert.deepEqual(m.banned.map((id) => DATA.chess[id].tier), [...m.banned.map((id) => DATA.chess[id].tier)].sort((a, b) => a - b));
    for (const id of m.banned) assert.ok(DATA.chess[id].bonds.every((b) => m.stateOf(b)), `${id}: every bond greyed`);
    assert.equal(m.core.length + m.addon.length, Object.keys(DATA.bonds).length - OFF_FUNNY.length, 'the 10 mode-off bonds are in no row');
    assert.equal(m.addon.filter((b) => m.stateOf(b.bondId)).length + m.core.filter((b) => m.stateOf(b.bondId)).length, 1);
    assert.doesNotMatch(textOf(MatchLegend({ model: m })), /本模式禁用/);
    h.m.dispose();
  }
  // 绝境: 3 core + 4 add-on drawn, nothing switched off by the mode
  const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, bots: 1, seed: 4 }).start();
  const m = matchInfoModel(h.m.publicView(), SRC('mode_multi_hard'));
  assert.equal(m.sets.off.size, 0);
  assert.deepEqual([m.core.filter((b) => m.stateOf(b.bondId)).length, m.addon.filter((b) => m.stateOf(b.bondId)).length], [3, 4]);
  assert.deepEqual([...m.banned].sort(), [...h.m.bannedChess].sort());
  assert.deepEqual(m.bannedGroups.map((g) => g.bond.bondId).sort(), [...m.sets.drawn].sort(), '绝境: exactly the 7 drawn bonds');
  assertClientOrder(m, 'mode_multi_hard');
  // the drawn ones close each row
  for (const row of [m.core, m.addon]) assert.ok(row.every((b, i) => !m.stateOf(b.bondId) || row.slice(i).every((x) => m.stateOf(x.bondId))));
  for (const id of m.banned) assert.ok(m.bannedGroups.some((g) => g.chess.includes(id)), `${id} listed`);
  h.m.dispose();
});

test('draftInfoStatus: the dialog repeats the turn and its seconds (warning at ≤ 10 s), or my pick', () => {
  assert.deepEqual(draftInfoStatus({ myTurn: true, secs: 24 }), { text: '轮到你决策', secs: 24, tone: 'gold' });
  assert.deepEqual(draftInfoStatus({ myTurn: true, secs: 7 }), { text: '轮到你决策', secs: 7, tone: 'warn' });
  assert.deepEqual(draftInfoStatus({ myTurn: false, turnName: '凯尔希', secs: 30 }), { text: '凯尔希 决策中', secs: 30, tone: 'gold' });
  assert.deepEqual(draftInfoStatus({ myTurn: true, secs: null }), { text: '轮到你决策', secs: null, tone: 'gold' }, 'untimed: no seconds');
  assert.deepEqual(draftInfoStatus({ myTurn: false, turnName: null }), { text: '等待轮到你', secs: null, tone: 'dim' });
  assert.deepEqual(draftInfoStatus({ myPick: 'band_bldsk', pickName: '华法琳', myTurn: false, waiting: true }),
    { text: '已选择「华法琳」，等待其他博士', secs: null, tone: 'mint' });
  assert.equal(draftInfoStatus({ myPick: 'band_bldsk', pickName: '华法琳', myTurn: false }).text, '已选择「华法琳」');
});

test('the briefing, the strategy draft and the in-game 本局信息 tab all read ui/matchInfo.js (no second copy to drift)', () => {
  const brief = read('public/js/screens/briefing.js');
  // (+ the 规程 solo two-column view's blocks: BondGroups, IncompleteTip, BannedOperators, InfoBond, stageArt)
  assert.match(brief, /import \{ MatchInfo, matchInfoModel, BondGroups, IncompleteTip, BannedOperators, InfoBond, stageArt \} from '\.\.\/ui\/matchInfo\.js';/);
  assert.match(brief, /<section class="brief__right">\s*<\$\{MatchInfo\} model=\$\{info\} \/>\s*<\/section>/);
  // (+ the viewer's 自选 pieces out of the shop: priv / diyData, 0.2.0 WE2)
  assert.match(brief, /const info = matchInfoModel\(pub, \{ bonds: gd\.list\('bonds'\), chess: gd\.chess, mode, priv, diyData: \{ chess: data\.get\('chess'\), backups: data\.get\('backups'\) \} \}\);/);
  assert.doesNotMatch(brief, /brief-legend|brief-banned|function BondRow|bannedPerBond|disabledBondSets/, 'no own copy of the blocks');
  const draft = read('public/js/screens/bandDraft.js');
  // (+ ChessIcon: the 自选预设 row draws its picks as the stage info draws operators)
  assert.match(draft, /import \{ MatchInfoDialog, matchInfoModel, ChessIcon \} from '\.\.\/ui\/matchInfo\.js';/);
  assert.match(draft, /const info = infoOpen \? matchInfoModel\(pub, \{ bonds: gd\.list\('bonds'\), chess: gd\.chess, mode, priv, diyData: \{ chess: data\.get\('chess'\), backups: data\.get\('backups'\) \} \}\) : null;/);
  // 敌方情报 | 盟约信息 in one row, each dialog titled as its button (docs/rules/ui.md 「전략 선택 중 적 정보·전장 다시 보기」)
  assert.match(draft, /export function DraftInfoButtons\(\{ onIntel, onInfo \}\) \{[\s\S]*?<div class="draft-order__infos">\s*<\$\{Button\}[^>]*data-testid="match-intel-open"[^>]*onClick=\$\{onIntel\}>\$\{t\('敌方情报'\)\}<\/\/>\s*<\$\{Button\}[^>]*data-testid="match-info-open"[^>]*onClick=\$\{onInfo\}>\$\{t\('盟约信息'\)\}<\/\/>\s*<\/div>/);
  // every start step with the order list (盟约 2/2, 规程 2/3 and 3/3) draws that one row and opens both dialogs titled as
  // their buttons — the 3/3 screen kept the old single 本局信息 button once (maintainer report 2026-11-18)
  for (const [file, src] of [['bandDraft.js', draft], ['diyChoose.js', read('public/js/screens/diyChoose.js')]]) {
    assert.match(src, /<\$\{DraftInfoButtons\} onIntel=\$\{\(\) => \{ setInfoOpen\(false\); setIntelOpen\(true\); \}\} onInfo=\$\{\(\) => \{ setIntelOpen\(false\); setInfoOpen\(true\); \}\} \/>/,
      `${file}: the 敌方情报 | 盟约信息 row (docs/rules/ui.md 「전략 선택 중 적 정보·전장 다시 보기」)`);
    assert.match(src, /<\$\{MatchInfoDialog\} open=\$\{infoOpen\} onClose=\$\{\(\) => setInfoOpen\(false\)\} model=\$\{info\} title=\$\{t\('盟约信息'\)\} hideTitle=\$\{true\}/, `${file}: 盟约信息 dialog`);
    assert.match(src, /<\$\{MatchIntelDialog\} open=\$\{intelOpen\} onClose=\$\{\(\) => setIntelOpen\(false\)\} pub=\$\{pub\} season=/, `${file}: 敌方情报 dialog`);
    assert.doesNotMatch(src, /t\('本局信息'\)/, `${file}: no button left with the old 本局信息 name`);
  }
  // a turn change or my pick closes it; the draft's end unmounts the screen
  assert.match(draft, /const turnKey = `\$\{draft\.turnPid \|\| ''\}\|\$\{myPick \|\| ''\}`;\n\s*useEffect\(\(\) => \{ setInfoOpen\(false\); setIntelOpen\(false\); \}, \[turnKey\]\);/);
  const drawer = read('public/js/ui/enemyDrawer.js');
  // (+ BannedGroups: its banned operators grouped and drawn as the briefing draws them)
  // (+ BondGroupsView: 规程 solo's two core bond groups, read-only)
  // (+ InfoBond: the 核心盟约 / 附加盟约 rows, DrawerBondRow — the test below)
  assert.match(drawer, /import \{ matchInfoModel, DiyBannedLine, BannedGroups, BondGroupsView, InfoBond \} from '\.\/matchInfo\.js';/);
  assert.match(drawer, /\$\{model\.groups \? html`<h4 class="ihead">\$\{t\('核心盟约'\)\}<\/h4><div class="igroups-core"><\$\{BondGroupsView\} model=\$\{model\} \/><\/div>`/);
  assert.match(drawer, /<\$\{BannedGroups\} model=\$\{model\} onChess=\$\{onChess\} \/>/);
  assert.match(drawer, /matchInfoModel\(pub, \{\s*bonds: data\.list\('bonds'\), chess: \(id\) => data\.lookup\('chess', id\), mode: data\.get\('config'\)\?\.modes\?\.\[pub\?\.modeId\],/);
  assert.doesNotMatch(drawer, /bannedPerBond|disabledBondSets/, 'the drawer derives nothing on its own');
});

// The in-game 本局信息 tab: 核心盟约 / 附加盟约 rows above the banned operators (maintainer decision 2026-11-18; the official
// in-game player-info dialog has none), the bonds at the banned groups' bond size, greyed as the briefing greys them.
const DRAWER_RULE = 'docs/rules/ui.md 「본판 정보의 맹약·결장 오퍼레이터를 공식 정보 화면 모양으로」 (판 안 서랍)';
test('the in-game 本局信息 tab on a real match: 核心盟约, 附加盟约, then 本局禁用干员; each bond as the banned groups draw theirs', async () => {
  const { InfoTab, DrawerBondRow } = await import('../../public/js/ui/enemyDrawer.js');
  const heads = (tab) => [...walk(tab)].filter((v) => hasClass(v, 'ihead')).map((v) => textOf(v).replace(/\d+$/, '').trim());
  const h = makeMatch({ mode: 'solo', difficulty: 'HARD', humans: 1, seed: 3 }).start();
  const pub = h.m.publicView();
  const tab = InfoTab({ pub, priv: null, onChess: () => {} });
  assert.deepEqual(heads(tab), ['核心盟约', '附加盟约', '本局禁用干员情况'], `the two bond rows above the banned operators — ${DRAWER_RULE}`);
  const rows = [...walk(tab)].filter((v) => v.type === DrawerBondRow);
  const mi = matchInfoModel(pub, SRC(pub.modeId));
  assert.deepEqual(rows.map((r) => r.props.bonds.map((b) => b.bondId)), [mi.core, mi.addon].map((l) => l.map((b) => b.bondId)), 'the model\'s rows, in the client\'s order');
  let greyed = 0;
  for (const r of rows) {
    const out = DrawerBondRow(r.props);
    assert.ok(hasClass(out, 'ibonds'));
    for (const b of r.props.bonds) {
      const state = mi.stateOf(b.bondId);
      const tip = [...walk(out)].find((v) => v.type === Tooltip && v.key === b.bondId);
      assert.equal(tip?.props.text, briefingBondTip(b.name, state, mi.perBond.get(b.bondId) || 0), `${b.bondId}: the briefing's tip`);
      const item = [...walk(tip)].find((v) => v.type === InfoBond);
      assert.deepEqual([item.props.off, item.props.small], [!!state, true], `${b.bondId}: greyed for D, the banned groups' small item — ${DRAWER_RULE}`);
      if (state) greyed++;
    }
  }
  assert.ok(greyed > 0, 'a HARD match greys some bond (the case really ran)');
  h.m.dispose();
  // 规程 solo: the two groups stand for the 核心盟约 row (no second core row), 附加盟约 stays
  const core = data.list('bonds').filter((b) => b.isCore).map((b) => b.bondId);
  const half = Math.floor(core.length / 2);
  const solo = { ...pub, bondGroups: { groups: [core.slice(0, half), core.slice(half)], picked: 0 } };
  const tab2 = InfoTab({ pub: solo, priv: null, onChess: () => {} });
  assert.deepEqual(heads(tab2), ['核心盟约', '附加盟约', '本局禁用干员情况']);
  assert.ok([...walk(tab2)].some((v) => v.type === BondGroupsView), 'the groups block');
  assert.deepEqual([...walk(tab2)].filter((v) => v.type === DrawerBondRow).map((r) => r.props.bonds.every((b) => !b.isCore)), [true], `only the 附加盟约 row — ${DRAWER_RULE}`);
  // CSS: one unit for the rows and the banned groups (same bond size); the name in flow, so long names push the items apart
  const css = read('public/css/screens/game-panels.css');
  assert.match(css, /^\.igroups, \.ibonds \{ --ou: [^}]+\}/m, `the rows share the banned groups' --ou — ${DRAWER_RULE}`);
  assert.match(css, /^\.ibonds \{ display: flex; flex-wrap: wrap;/m, 'the rows wrap (phones)');
  assert.match(css, /^\.ibonds \.ibd \{[^}]*width: auto; min-width: calc\(var\(--ou\) \* 110\)/m);
  assert.match(css, /^\.ibonds \.ibd \.ibd__name \{ position: static;[^}]*width: auto;/m, `a name widens its item (카시미어 / 라이타니엔 ran together) — ${DRAWER_RULE}`);
});

// 规程 solo (m.public bondGroups, server phases.js pickBondGroup): the briefing shows the core bonds as the client's two groups
// (auto_chess_single_mode_bond_group) and the draft's dialog / the in-game tab the same read-only. docs/rules/ui.md
// 「1인 규정 브리핑 두 단」.
const GROUPS_RULE = 'docs/rules/ui.md 「1인 규정 브리핑 두 단」';
const { ACT3 } = await import('../helpers/seasonPieces.js');
const { createRegistry } = await import('../../server/match/effectsMeta.js');
const quietLog = { error() {}, warn() {}, info() {}, log() {} };
const act3Src = (modeId) => ({ bonds: Object.values(ACT3.bonds), chess: (id) => ACT3.chess[id] || null, mode: ACT3.config.modes[modeId] });
const act3Solo = (modeId, seed) => makeMatch({ mode: 'solo', modeId, seed, registry: createRegistry({ data: ACT3, log: quietLog }), data: ACT3, season: 'act3autochess' });

test('규정 solo on the real match path: the model carries the two groups and follows a pick; MatchInfo shows them read-only, the tip after 附加盟约, no legend', () => {
  for (const [modeId, half] of [['mode_single_5', 5], ['mode_single_4', 4]]) {
    const h = act3Solo(modeId, 7).start();
    const { m } = h;
    let pub = m.publicView();
    let mi = matchInfoModel(pub, act3Src(modeId));
    assert.deepEqual(mi.groups, pub.bondGroups, `${modeId}: m.public bondGroups as they come — ${GROUPS_RULE}`);
    assert.deepEqual(mi.groups.groups.map((g) => g.length), [half, half]);
    assert.equal(mi.groups.picked, 0, 'the left group until a pick');
    assert.ok(mi.groups.groups[1].every((id) => mi.stateOf(id) === 'drawn') && mi.groups.groups[0].every((id) => !mi.stateOf(id)), 'the right group is the absent one');
    assert.equal(mi.addonIncomplete, mi.addon.some((b) => mi.stateOf(b.bondId)));
    // the briefing's pick (g.bondGroup) swaps them
    assert.deepEqual(m.handle('p_0', { t: 'g.bondGroup', idx: 1 }), { ok: true });
    pub = m.publicView();
    mi = matchInfoModel(pub, act3Src(modeId));
    assert.equal(mi.groups.picked, 1);
    assert.ok(mi.groups.groups[0].every((id) => mi.stateOf(id) === 'drawn') && mi.groups.groups[1].every((id) => !mi.stateOf(id)), 'after the pick the left group is absent');
    const parts = MatchInfo({ model: mi }).filter((v) => v && typeof v === 'object');
    assert.deepEqual(parts.map((v) => v.type === MatchBondRow || v.type === BannedOperators ? v.type : v.type === 'div' ? 'div' : v.type),
      ['div', MatchBondRow, BannedOperators], `${modeId}: the groups block, 附加盟约, 本局禁用干员 — no MatchLegend (${GROUPS_RULE})`);
    const head = [...walk(parts[0])].find((v) => v.type === InfoTitle);
    assert.deepEqual([head.props.kind, head.props.title, head.props.bar], ['perm', '核心盟约', 'img_group_title'], 'the 核心盟约 bar as the official screen');
    const view = [...walk(parts[0])].find((v) => v.type === BondGroupsView);
    assert.equal(view?.props.model, mi, 'read-only groups (no detail)');
    assert.equal(parts[1].props.bonds, mi.addon);
    assert.equal(parts[1].props.extra?.type === IncompleteTip, mi.addonIncomplete, 'the tip only when an add-on bond is in D');
    m.dispose();
  }
  // no groups elsewhere: 盟约 solo keeps the core row and the legend
  const h = makeMatch({ mode: 'solo', difficulty: 'HARD', humans: 1, seed: 3 }).start();
  const plain = matchInfoModel(h.m.publicView(), SRC(h.m.publicView().modeId));
  assert.equal(plain.groups, null);
  assert.deepEqual(MatchInfo({ model: plain }).filter((v) => v && typeof v === 'object').map((v) => v.type), [MatchBondRow, MatchBondRow, MatchLegend, BannedOperators]);
  h.m.dispose();
});

test('BondGroups: item i of a group in item_container_(i+1) (1·3·5 on top, 2·4 under), the picked panel lit, a panel press picks, an icon is no button (no detail)', () => {
  assert.deepEqual(groupRows(['a', 'b', 'c', 'd', 'e']), [['a', 'c', 'e'], ['b', 'd']]);
  assert.deepEqual(groupRows(['a', 'b', 'c', 'd']), [['a', 'c'], ['b', 'd']]);
  const h = act3Solo('mode_single_5', 11).start();
  const mi = matchInfoModel(h.m.publicView(), act3Src('mode_single_5'));
  const picks = [];
  const v = BondGroups({ model: mi, onPick: (i) => picks.push(i), hint: 'hint' });
  assert.equal(v.props.role, 'radiogroup');
  const panels = [...walk(v)].filter((x) => hasClass(x, 'bgrp__panel'));
  assert.deepEqual(panels.map((x) => [x.props['data-group'], hasClass(x, 'is-picked'), x.props['aria-checked']]), [[0, true, 'true'], [1, false, 'false']]);
  for (const [i, p] of panels.entries()) {
    const rows = [...walk(p)].filter((x) => hasClass(x, 'bgrp__row'));
    const ids = rows.map((r) => [...walk(r)].filter((x) => hasClass(x, 'bgrp__cell')).map((x) => x.props['data-bond']));
    assert.deepEqual(ids, groupRows(mi.groups.groups[i]), `group ${i}: the client's item containers — ${GROUPS_RULE}`);
    const items = [...walk(p)].filter((x) => x.type === InfoBond);
    assert.ok(items.every((x) => x.props.off === (i !== 0)), `group ${i}: ${i ? 'greyed' : 'lit'}`);
  }
  panels[1].props.onClick();
  assert.deepEqual(picks, [1], 'a press on the panel picks it');
  assert.equal([...walk(v)].some((x) => x.type === 'button'), false, 'an icon is no button: it opens no detail, a press on it picks its panel (maintainer decision 2026-11-18)');
  // read-only: no radio, no buttons, no hint
  const ro = BondGroups({ model: mi });
  assert.equal(ro.props.role, null);
  assert.equal([...walk(ro)].some((x) => x.type === 'button' || hasClass(x, 'bgrp__hint')), false);
  assert.equal(BondGroups({ model: matchInfoModel({}, SRC('mode_single_normal')) }), null, 'no groups, nothing');
  h.m.dispose();
});

test('the title icons as the official screens: 核心盟约 the starburst, 附加盟约 the wing (all modes); img_group_title sliced', async () => {
  const orig = globalThis.fetch;
  const entry = (n) => ({ path: `/assets/local/ui/outer/${n}.png`, w: 40, h: 40, kind: 'Sprite' });
  const names = ['img_title_icon_perm_bond', 'img_title_icon_temp_bond', 'img_group_title', 'img_group_title_perm_bond'];
  globalThis.fetch = async (url) => (String(url).endsWith('/local-assets.json')
    ? { ok: true, status: 200, json: async () => ({ version: 1, groups: { 'ui/outer': Object.fromEntries(names.map((n) => [n, entry(n)])) } }) }
    : orig(url));
  try {
    await data.invalidate('local');
    await data.load('local');
    const iconOf = (kind) => [...walk(InfoTitle({ kind, title: 'x', micro: 'X' }))].find((v) => hasClass(v, 'brief-h__icon'))?.props.src;
    assert.match(iconOf('perm'), /img_title_icon_temp_bond\.png$/, '核心盟约 (perm_bond_title) shows the starburst — docs/rules/ui.md 「본판 정보의 맹약·결장 오퍼레이터를 공식 정보 화면 모양으로」');
    assert.match(iconOf('temp'), /img_title_icon_perm_bond\.png$/, '附加盟约 (temp_bond_title) shows the wing');
    assert.ok(hasClass(InfoTitle({ kind: 'temp', title: 'x', micro: 'X' }), 'is-sliced'), 'img_group_title is sliced (its logo once)');
    assert.ok(!hasClass(InfoTitle({ kind: 'perm', title: 'x', micro: 'X' }), 'is-sliced'));
    assert.ok(hasClass(InfoTitle({ kind: 'perm', title: 'x', micro: 'X', bar: 'img_group_title' }), 'is-sliced'));
  } finally {
    globalThis.fetch = orig;
    await data.invalidate('local');
  }
});
