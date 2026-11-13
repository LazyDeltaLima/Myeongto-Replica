// 规程's 「{showtag_value_1}」 (shared/showTag.js): the server's numbers (m.private showTags, an item piece's showTag) from
// real buys, refreshes and 获得时 runs on the season's data, and the card texts filled with them — no 特质 or item text of
// the season, Chinese or Korean, shows the variable's name (docs/rules/ui.md 「규정 특질 문구의 숫자」).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACT3, ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';
import { makeMatch, give, giveItem } from '../match/harness.js';
import { createRegistry } from '../../server/match/effectsMeta.js';
import { fillShowTag, hasShowTag } from '../../shared/showTag.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const json = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
globalThis.fetch = async (url) => {
  const name = String(url).split('/').pop();
  try {
    const body = readFileSync(path.join(ROOT, 'data', name), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};
const { garrisonText, itemText, resolveDetail } = await import('../../public/js/ui/detailPanel.js');
const { parseRichText, richTextPlain } = await import('../../public/js/ui/richText.js');
const { data } = await import('../../public/js/data.js');

const OK = { ok: true };
const quiet = { error() {}, warn() {}, info() {}, log() {} };

function setup({ funds = 60, seed = 7 } = {}) {
  const reg = createRegistry({ data: ACT3_ON_BASE_FIELD, log: quiet });
  const h = makeMatch({ mode: 'solo', humans: 1, seed, registry: reg, fake: true, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
  h.toPrep(1, { band: 'band_amiya' });
  const m = h.m;
  const ps = h.ps('p_0');
  ps.bandId = null; ps.counters = {}; ps.funds = funds; ps.offers.length = 0; ps.ready = false;
  for (const l of [...ps.board.keys()]) ps.board.delete(l);
  ps.hand.fill(null); ps.temp.fill(null);
  ps.recompute();
  return { h, m, ps };
}
const card = (m, id) => ({ kind: 'chess', id, basePrice: m.gd.chessPrice(id), frozen: false, sold: false });
function buyOne(m, ps, id) {
  const i = ps._shopKinds().indexOf('chess');
  ps.shop.slots[i] = card(m, id);
  assert.deepEqual(m.handle('p_0', { t: 'g.buy', slot: i }), OK);
  const p = ps.hand.find((x) => x && x.id === id);
  if (p) ps.hand[ps.hand.indexOf(p)] = null;
}

test('m.private showTags: this round\'s funds spent, refreshes and operators gained, from real buys and refreshes', () => {
  const { m, ps } = setup();
  const tags = () => ps.privateView().showTags;
  assert.deepEqual(Object.values(tags()).filter((v) => v !== 0 && v !== 1), [], 'a new round: counts 0, growing 特质 their first value');
  const cheap = Object.values(ACT3.chess).find((c) => c.visible && !c.isGolden && !c.isDiy && c.tier === 1).chessId;
  const f0 = ps.funds;
  buyOne(m, ps, cheap);
  buyOne(m, ps, cheap);
  assert.deepEqual(m.handle('p_0', { t: 'g.refresh' }), OK);
  assert.deepEqual(m.handle('p_0', { t: 'g.refresh' }), OK);
  assert.deepEqual(m.handle('p_0', { t: 'g.refresh' }), OK);
  const t = tags();
  const spent = f0 - ps.funds;
  assert.ok(spent > 0);
  // 아스트젠 더 라이트체이서 (溯光星源) 「本回合每消耗3资金(已消耗{showtag_value_1}资金)」
  assert.equal(t.garrison_121_a, spent);
  assert.equal(t.garrison_121_b, spent);
  for (const g of ['garrison_36_a', 'garrison_125_a', 'garrison_128_b']) assert.equal(t[g], 2, `${g}: 已获得 2名`);
  for (const g of ['garrison_91_a', 'garrison_236_b']) assert.equal(t[g], 3, `${g}: 已刷新 3次`);
});

test('m.private showTags: a growing 获得时 特质 shows the value its next run gives (极光 1, 2, 3 …; 忍冬 1, 1, 2 …)', () => {
  const { m, ps } = setup();
  const seen50 = [];
  const seen74 = [];
  for (let i = 0; i < 3; i++) {
    const t = ps.privateView().showTags;
    seen50.push(t.garrison_50_a);
    seen74.push(t.garrison_74_b);
    const before = [ps.layers.kjeragShip ?? 0, ps.shop.freeRefreshes];
    for (const id of ['chess_char_3_07_a', 'chess_char_3_13_a']) {
      const p = give(m, ps, id, 'hand');
      m.dispatch(ps, 'onGain', { piece: p });
      ps.hand[ps.hand.indexOf(p)] = null;
      ps.returnCopies(p);
    }
    assert.deepEqual([(ps.layers.kjeragShip ?? 0) - before[0], ps.shop.freeRefreshes - before[1]], [seen50[i], seen74[i]], 'the shown number is the one given');
  }
  assert.deepEqual(seen50, [1, 2, 3]);
  assert.deepEqual(seen74, [1, 1, 2]);
});

test('定期存折: the piece view carries the funds it gives now (0, +1 a round held)', () => {
  const { m, ps } = setup();
  const p = giveItem(m, ps, 'chess_item_3_15_e_a', 'hand');
  // (规程 moves an item to its 装备区, the temp row)
  const find = (uid) => { const v = ps.privateView(); return [...v.hand, ...v.temp].find((x) => x && x.uid === uid); };
  const view = () => find(p.uid);
  assert.equal(view().showTag, 0);
  p.boughtRound = m.round - 3;
  assert.equal(view().showTag, 3);
  const other = Object.values(ACT3.items).find((x) => x && !hasShowTag(x.desc));
  const q = giveItem(m, ps, other.id, 'hand');
  assert.equal(find(q.uid).showTag, undefined, 'an item without the number has none');
});

// every record of the season (and the base data) whose text carries the variable, in Chinese and in Korean
const ko = json('data/i18n/ko.act3autochess.json').files;
const koBase = json('data/i18n/ko.json').files;
/** The Chinese record and the Korean one (the season's overlay over the default pack's, as public/js/data.js applies them). */
function texts(file, rec, id) {
  return [rec, { ...rec, ...(koBase[file]?.[id] || {}), ...(ko[file]?.[id] || {}) }];
}
const TAGGED = {
  garrisons: Object.values(ACT3.garrisons).filter((g) => hasShowTag(g.desc)),
  items: Object.values(ACT3.items).filter((x) => hasShowTag(x.desc)),
  effects: Object.values(ACT3.effects).filter((x) => hasShowTag(x.desc)),
};

test('every 特质 text with the number reads the player\'s value, and without one never shows the variable', () => {
  assert.equal(TAGGED.garrisons.length, 16, 'eight 特质, normal and elite');
  for (const g of TAGGED.garrisons) {
    for (const rec of texts('garrisons', g, g.garrisonId)) {
      const filled = garrisonText(rec, { [g.garrisonId]: 37 });
      assert.ok(!filled.includes('{'), `${g.garrisonId}: ${filled}`);
      assert.ok(filled.includes('37'), `${g.garrisonId} shows the value: ${filled}`);
      const bare = garrisonText(rec, null);
      assert.ok(!bare.includes('showtag') && !bare.includes('{'), `${g.garrisonId} without a value: ${bare}`);
      assert.ok(!/[(（]\s*[)）]/.test(richTextPlain(bare)), `${g.garrisonId}: no empty brackets left: ${bare}`);
    }
  }
  // the counter clause goes; a growing 特质 shows its first value
  const astgenne = ACT3.garrisons.garrison_121_a;
  assert.equal(garrisonText(astgenne, { garrison_121_a: 6 }).includes('(已消耗6资金)'), true);
  assert.equal(richTextPlain(garrisonText(astgenne, null)), '<休整期结束时>本回合每消耗3资金，使已激活的【奥术】层数+2（每回合至多叠加18层）');
  assert.equal(richTextPlain(garrisonText(ACT3.garrisons.garrison_50_a, null)), '<获得时>【谢拉格】层数+1（每次触发后升级，至多叠加12层）');
});

test('定期存折\'s text: the piece\'s funds, else what it gives in the round it comes; the effect records too', () => {
  assert.equal(TAGGED.items.length, 1);
  for (const it of TAGGED.items) {
    for (const rec of texts('items', it, it.id)) {
      assert.ok(itemText(rec, { showTag: 4 }).includes('4') && !itemText(rec, { showTag: 4 }).includes('{'));
      assert.ok(!itemText(rec, null).includes('{'), itemText(rec, null));
    }
  }
  assert.equal(richTextPlain(itemText(ACT3.items.chess_item_3_15_e_a, null)), '装备时销毁，获得0资金（持有时每回合+1）');
  // the effect records (eff_acarm129 …) reach the screen through RichText only: its parse never shows the variable
  for (const e of TAGGED.effects) for (const rec of texts('effects', e, e.effectId)) {
    const plain = parseRichText(rec.descRaw || rec.desc).map((s) => s.text || '').join('');
    assert.ok(!plain.includes('showtag'), `${e.effectId}: ${plain}`);
  }
});

test('fillShowTag: a number fills; without one the bracketed counter clause goes, any other place takes the fallback', () => {
  assert.equal(fillShowTag('a(已消耗{showtag_value_1}资金)b', 5), 'a(已消耗5资金)b');
  assert.equal(fillShowTag('a(소모: 자금 {showtag_value_1}) b', null), 'a b');
  assert.equal(fillShowTag('层数+{showtag_value_1}（每次）', null, 1), '层数+1（每次）');
  assert.equal(fillShowTag('no tag', 3), 'no tag');
});

test('resolveDetail: the own operator\'s card reads m.private showTags; another player\'s does not', async () => {
  await data.loadAll('chess', 'garrisons', 'assets');
  const priv = { playerId: 'p_0', showTags: { garrison_121_a: 9 } };
  const piece = { uid: 5, kind: 'chess', id: 'chess_char_6_16_a', items: [] };
  const pieces = new Map([[5, { piece }]]);
  assert.equal(resolveDetail({ kind: 'piece', uid: 5 }, pieces, { priv }).showTags, priv.showTags);
  assert.equal(resolveDetail({ kind: 'chess', id: 'chess_char_6_16_a' }, pieces, { priv }).showTags, priv.showTags, 'a shop card');
  assert.equal(resolveDetail({ kind: 'chess', id: 'chess_char_6_16_a', owner: 'p_1' }, pieces, { priv }).showTags, undefined);
  assert.equal(resolveDetail({ kind: 'unit', unit: { id: 1, uid: 77, side: 'player', defId: 'chess_char_6_16_a' } }, pieces, { priv }).showTags, undefined);
});
