// Server → client texts in the player's language (docs/I18N.md): m.toast / m.ticker frames carry the Chinese `text`
// (older clients) plus `msgid` + `params`, a config.broadcasts line its `args`; the client renders them with
// translateWire / ui/lang.js tickerText; error codes through ui/toasts.js describeError.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MatchMessaging } from '../server/match/match/messaging.js';
import { addMessages, setLang, setMessages, translateWire, msg, dn, registerLangs } from '../shared/i18n.js';
import { langMetaOf } from '../shared/packs.js';
import { makeMatch, give, giveItem, DATA } from './match/harness.js';
import { createRegistry } from '../server/match/effectsMeta.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EN_UI = JSON.parse(readFileSync(path.join(ROOT, 'public/i18n/en.json'), 'utf8'));
const realFetch = globalThis.fetch;

let lang;
let data;
let toasts;
before(async () => {
  // the client data store (singleton) reads data/ through fetch: serve it from the repo
  globalThis.fetch = async (url) => {
    const abs = path.join(ROOT, String(url).replace(/^\//, ''));
    if (!existsSync(abs)) return { ok: false, status: 404, json: async () => null };
    const text = readFileSync(abs, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  };
  lang = await import('../public/js/ui/lang.js');
  ({ data } = await import('../public/js/data.js'));
  toasts = await import('../public/js/ui/toasts.js');
  await data.loadAll('config', 'chess', 'tokens', 'bonds');
  addMessages('en', EN_UI);
});
after(() => { globalThis.fetch = realFetch; setLang('zh'); setMessages('en', {}); });

/** A Match-shaped stub for the messaging methods. */
function stubMatch() {
  const sent = [];
  const broadcast = [];
  return {
    sent, bc: broadcast,
    disposed: false,
    players: new Map([['p1', { playerId: 'p1', connected: true }]]),
    spectators: new Map(),
    gd: { config: DATA.config },
    sendTo(id, m) { sent.push([id, m]); return true; },
    broadcast(m) { broadcast.push(m); },
  };
}

test('m.toast frames: a string stays { text }; a msg() adds msgid + params beside its Chinese text', () => {
  const m = stubMatch();
  const ps = m.players.get('p1');
  MatchMessaging.prototype.toast.call(m, ps, 'warn', '整备区已满，获得的装备已销毁');
  MatchMessaging.prototype.toast.call(m, ps, 'warn', msg('{names}只能部署在召唤者攻击范围内，已退回整备区', { names: ['医疗探机', '狼影'].map(dn) }));
  assert.deepEqual(m.sent[0][1], { t: 'm.toast', kind: 'warn', text: '整备区已满，获得的装备已销毁' });
  assert.deepEqual(m.sent[1][1], {
    t: 'm.toast', kind: 'warn', text: '医疗探机、狼影只能部署在召唤者攻击范围内，已退回整备区',
    msgid: '{names}只能部署在召唤者攻击范围内，已退回整备区', params: { names: [{ dn: '医疗探机' }, { dn: '狼影' }] },
  });
});

test('m.ticker frames: broadcast lines carry their args; CUSTOM lines a msgid', () => {
  const m = stubMatch();
  MatchMessaging.prototype.tickerFor.call(m, 'GOLDEN_CHAR', ['阿米娅', '琳琅诗怀雅'], { playerId: 'p1' });
  MatchMessaging.prototype.tickerText.call(m, msg('{name}博士中途退出了模拟', { name: '阿米娅' }), 5);
  const [gold, custom] = m.bc;
  assert.equal(gold.type, 'GOLDEN_CHAR');
  assert.deepEqual(gold.args, ['阿米娅', '琳琅诗怀雅']);
  assert.ok(gold.text.includes('阿米娅') && gold.text.includes('琳琅诗怀雅'), gold.text);
  assert.deepEqual({ ...custom }, { t: 'm.ticker', text: '阿米娅博士中途退出了模拟', msgid: '{name}博士中途退出了模拟', params: { name: '阿米娅' }, id: null, type: 'CUSTOM', priority: 5, playerId: null });
});

test('client: the same frames in English — msgid + params, broadcast template + args (player names never translated)', async () => {
  setLang('en');
  await data.setLocale('en');
  try {
    const toastFrame = { text: '医疗探机只能部署在召唤者攻击范围内，已退回整备区', msgid: '{names}只能部署在召唤者攻击范围内，已退回整备区', params: { names: [{ dn: '医疗探机' }] } };
    assert.equal(translateWire(toastFrame), "Medic Drone can only be deployed within the summoner's attack range and returned to the Bench");
    assert.equal(translateWire({ text: '整备区已满，获得的装备已销毁' }), EN_UI['整备区已满，获得的装备已销毁'], 'a static server text is its own msgid');
    const m = stubMatch();
    MatchMessaging.prototype.tickerFor.call(m, 'GOLDEN_CHAR', ['阿米娅', '琳琅诗怀雅'], { playerId: 'p1' });
    const line = lang.tickerText(m.bc[0]);
    assert.ok(line.includes('阿米娅'), `player name kept: ${line}`);
    assert.ok(line.includes('Swire the Elegant Wit'), `operator name translated: ${line}`);
    assert.ok(!/[一-鿿]/.test(line.replace('阿米娅', '')), line);
    // an older server (no args): the Chinese line as it came
    assert.equal(lang.tickerText({ text: m.bc[0].text, id: m.bc[0].id }), m.bc[0].text);
    // error codes: ERR_TEXT / net.js CLIENT_ERR_TEXT are msgids
    assert.equal(toasts.describeError({ code: 'HAND_FULL', msg: '整备区已满' }), 'Bench is full');
    assert.equal(toasts.describeError('NO_FUNDS'), EN_UI['资金不足']);
  } finally {
    setLang('zh');
    await data.setLocale('zh');
  }
});

test('client: a CHAR_DAMAGE line shows its amount compactly (fmtNum) — 万 in Chinese, 만 in Korean, K / M in English', async () => {
  const lines = () => {
    const m = stubMatch();
    for (const hit of ['200000', '1000000']) MatchMessaging.prototype.tickerFor.call(m, 'CHAR_DAMAGE', ['阿米娅', '琳琅诗怀雅', hit], { playerId: 'p1', param: hit });
    return m.bc.map((f) => lang.tickerText(f));
  };
  const [zh2, zh10] = lines();
  assert.ok(zh2.endsWith('20万') && zh10.endsWith('100万'), `${zh2} / ${zh10}`);
  setLang('en');
  await data.setLocale('en');
  try {
    const [en2, en10] = lines();
    assert.ok(/\b200K\b/.test(en2) && /\b1M\b/.test(en10), `${en2} / ${en10}`);
    assert.ok(!en2.includes('200000') && !en10.includes('1000000'));
    const KO = JSON.parse(readFileSync(path.join(ROOT, 'public/i18n/ko.json'), 'utf8'));
    registerLangs([langMetaOf({ ...KO._meta, lang: 'ko' })]);
    setLang('ko');
    await data.setLocale('ko');
    const [ko2, ko10] = lines();
    assert.ok(ko2.includes('대미지 20만') && ko10.includes('대미지 100만'), `${ko2} / ${ko10}`);
  } finally {
    setLang('zh');
    await data.setLocale('zh');
  }
});

test('a real match: 精打细算玩偶\'s effect entry (named by its trap icon) shows the item\'s text in English; the AI teammates\' names follow the language, a Doctor\'s does not', async () => {
  await data.loadAll('items', 'effects', 'bands', 'garrisons');
  const { effectDesc } = await import('../public/js/ui/effectsList.js');
  const { BOT_NAMES, playerName, nameParam } = await import('../shared/botNames.js');
  const { wireMessage } = await import('../shared/i18n.js');
  const h = makeMatch({ mode: 'solo', seed: 5, registry: createRegistry({ log: { warn() {}, error() {}, info() {} } }), fake: true }).start();
  h.toPrep(1);
  const m = h.m;
  const ps = h.ps('p_0');
  const a = give(m, ps, Object.values(DATA.chess).find((c) => c.visible && !c.isGolden && m.pool.has(c.chessId)).chessId);
  const doll = giveItem(m, ps, 'chess_item_2_05_e_a');
  assert.deepEqual(m.handle('p_0', { t: 'g.equip', itemUid: doll.uid, targetUid: a.uid }), { ok: true });
  const entry = JSON.parse(JSON.stringify(ps.effectsView().find((e) => e.id === `doll:${doll.uid}`)));
  m.dispose();
  assert.equal(effectDesc(entry), DATA.items.chess_item_2_05_e_a.desc, 'Chinese: as sent');
  const ticker = JSON.parse(JSON.stringify(wireMessage(msg('{name}博士中途退出了模拟', { name: nameParam(BOT_NAMES[0]) }))));
  setLang('en');
  await data.setLocale('en');
  try {
    assert.equal(effectDesc(entry), data.lookup('items', 'chess_item_2_05_e_a').desc);
    assert.ok(!/[一-鿿]/.test(effectDesc(entry)), effectDesc(entry));
    assert.deepEqual(BOT_NAMES.map(playerName), BOT_NAMES.map((n) => EN_UI[n]));
    assert.ok(BOT_NAMES.every((n) => EN_UI[n] && !/[一-鿿]/.test(EN_UI[n])));
    assert.equal(playerName('阿米娅'), '阿米娅', 'a name a Doctor typed stays as typed');
    assert.equal(nameParam('阿米娅'), '阿米娅');
    assert.ok(translateWire(ticker).includes('AI·Warfarin'), translateWire(ticker));
    const { switcherLabel } = await import('../public/js/ui/gameLogic/watch.js');
    const pub = { players: [{ playerId: 'p_0', seat: 0, name: 'P0' }, { playerId: 'ai_0', seat: 1, name: BOT_NAMES[0], isBot: true }], fields: [{ fieldId: 'n:ai_0', kind: 'normal', players: ['ai_0'] }] };
    assert.equal(switcherLabel(pub, 'n:ai_0', 'p_0'), 'AI·Warfarin', 'the 观战 caption of a watched AI teammate');
    assert.equal(switcherLabel({ ...pub, fields: [] }, 'n:ai_0', 'p_0'), 'AI·Warfarin', 'its field gone');
  } finally {
    setLang('zh');
    await data.setLocale('zh');
  }
});

test('a real match: 歌蕾蒂娅 grants a chess → 「歌蕾蒂娅：获得X」 in Chinese, "Gladiia: obtained …" in English', async () => {
  const h = makeMatch({ mode: 'solo', seed: 11, registry: createRegistry({ log: { warn() {}, error() {}, info() {} } }), fake: true }).start();
  h.toPrep(1);
  const m = h.m;
  const ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.temp.fill(null); ps.offers.length = 0; ps.bandId = null; ps.recompute();
  const prepFree = (c) => (c.garrisonIds || []).every((g) => DATA.garrisons[g].eventType === 'IN_BATTLE');
  const row = Object.values(DATA.chess).filter((c) => c.visible && !c.isGolden && prepFree(c)).map((c) => c.chessId).sort().slice(0, 2);
  give(m, ps, 'chess_char_4_12_a', 'board', [10, 4]);
  give(m, ps, row[0], 'board', [10, 6]);
  give(m, ps, row[1], 'board', [10, 8]);
  const n0 = h.allTo('p_0', 'm.toast').length;
  m.dispatch(ps, 'onPrepStart', { round: m.round }); // 歌蕾蒂娅's 「<进入休整期时>」
  const frame = h.allTo('p_0', 'm.toast').slice(n0).find((t) => t.msgid === '{who}：获得{name}');
  assert.ok(frame, JSON.stringify(h.allTo('p_0', 'm.toast').slice(n0)));
  assert.ok(frame.text.startsWith('歌蕾蒂娅：获得'), frame.text);
  assert.deepEqual(frame.params.who, { dn: '歌蕾蒂娅' });
  setLang('en');
  await data.setLocale('en');
  try {
    const en = translateWire(JSON.parse(JSON.stringify(frame)));
    assert.match(en, /^Gladiia: obtained [A-Z]/, en);
    assert.ok(!/[一-鿿]/.test(en), en);
  } finally {
    setLang('zh');
    await data.setLocale('zh');
    m.dispose();
  }
});

test('server-sent game texts in English: 机变 cards, the draft name, effect entries and offer labels come from the localized data; a reworded text stays as sent; Chinese unchanged', async () => {
  await data.loadAll('choices', 'effects', 'items', 'bands', 'garrisons');
  const { resolveSpCard } = await import('../public/js/ui/choiceOverlay.js');
  const { effectDesc } = await import('../public/js/ui/effectsList.js');
  const { offerHeader } = await import('../public/js/ui/gameLogic/shop.js');
  const HAN = /[一-鿿]/;
  const raw = data.getRaw('choices');
  // a 战术决策 card as server/match/choices.js tacticCard sends it (the card's Chinese name and plain text)
  const tac = raw.cards.tactic.find((c) => c.effectId && c.name && c.desc && data.lookupRaw('effects', c.effectId)?.descRaw);
  const card = { kind: 'tactic', id: tac.effectId, name: tac.name, desc: tac.desc };
  const reworded = { ...card, desc: `${tac.desc}（服务器改写）` };
  const zh = resolveSpCard(card, 'tactic');
  assert.equal(zh.name, tac.name, 'Chinese: the name as sent');
  const eff = data.lookupRaw('effects', tac.effectId);
  const entry = { id: tac.effectId, iconId: tac.effectId, iconKind: 'choice', name: eff.name, desc: eff.descRaw };
  assert.equal(effectDesc(entry), eff.descRaw, 'Chinese: the description as sent');
  const band = data.list('bands').find((b) => b && b.effectName);
  const offer = { source: 'special', label: band.effectName, slots: [{ kind: 'chess', id: 'x' }] };
  assert.equal(offerHeader(offer).title, band.effectName);
  setLang('en');
  await data.setLocale('en');
  try {
    const en = resolveSpCard(card, 'tactic');
    assert.ok(en.name && !HAN.test(en.name), `card name: ${en.name}`);
    if (zh.desc === data.lookupRaw('effects', tac.effectId).descRaw) assert.equal(en.desc, data.lookup('effects', tac.effectId).descRaw, 'card text: the localized record');
    assert.equal(resolveSpCard(reworded, 'tactic').desc, reworded.desc, 'a reworded text stays as the server sent it');
    assert.equal(effectDesc(entry), data.lookup('effects', tac.effectId).descRaw);
    assert.equal(effectDesc({ ...entry, desc: `${eff.descRaw}！` }), `${eff.descRaw}！`);
    assert.ok(!HAN.test(offerHeader(offer).title), offerHeader(offer).title);
    assert.equal(lang.sentText(raw.families.bounty.name, raw.families.bounty.name, data.get('choices').families.bounty.name), 'Bounty Decision');
  } finally {
    setLang('zh');
    await data.setLocale('zh');
  }
});
