// 规程's 更换指令 screen (ui/choiceOverlay.js, ui/gameLogic/draft.js normalizePersonalChoice; docs/rules/ui.md 「규정 액티브
// 전략 — 초상·클릭·드래그」): the personal choice `kind` 'bandSkill' (server/match/match/bandSkill.js offerBandSkillChoice /
// bandCommandCard) is its own screen — title 更换指令, the source and 「被动效果保留」 in the notice, the 指令 it replaces over
// the cards, and each card the official card_small_item with the strategy's portrait, its name · stage under the 指令's
// name and the 指令's cost in the cost slot — not the 教鞭 overlay with 悬赏 cards; after the pick the HUD portrait is the
// taken strategy's (m.private.bandSkill.commandBandId).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
// the browser data store reads the data files from disk: the 规程 season's strategies and items, the rest the default's
const SEASON = new Set(['bands.json', 'items.json']);
globalThis.fetch = async (url) => {
  const name = String(url).split('?')[0].split('/').pop();
  try {
    const body = read(SEASON.has(name) ? `data/seasons/act3autochess/${name}` : `data/${name}`);
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};

const { ChoiceView, resolveSpCard, currentCommand } = await import('../../public/js/ui/choiceOverlay.js');
const { normalizePersonalChoice } = await import('../../public/js/ui/gameLogic.js');
const { PHASE } = await import('../../shared/constants.js');
const { data } = await import('../../public/js/data.js');
await data.loadAll('bands', 'items', 'effects', 'choices', 'assets');

/** Every vnode of a preact tree (htm output), depth first. */
function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  yield* walk(v.props?.children);
}
const hasClass = (v, c) => typeof v?.props?.class === 'string' && v.props.class.split(/\s+/).includes(c);
const text = (v) => [...walk(v)].flatMap((n) => [n.props?.children].flat(Infinity)).filter((x) => typeof x === 'string' || typeof x === 'number').join('');
const find = (tree, c) => [...walk(tree)].filter((n) => hasClass(n, c));

// three cards as the server sends them (bandCommandCard): 焰尾 骑士团长 (one stage, cost 6), 但书 条文修正 (two stages)
const band = (id) => data.lookup('bands', id);
const card = (bandId, stage) => {
  const b = band(bandId);
  const st = b.skills[stage];
  return { kind: 'bandSkill', id: st.effectId, bandId, bandName: b.name, iconId: b.iconId, name: st.name, desc: st.desc, descRaw: st.descRaw,
    stage, stageCount: b.skills.length, type: st.type, cost: Number(st.cost) || 0 };
};
const pub = { phase: PHASE.PREP, round: 6, deadline: 0, players: [{ playerId: 'a', seat: 0, name: 'A' }] };
const priv = (o = {}) => ({
  playerId: 'a', alive: true, bandId: 'band_ursus', funds: 13,
  bandSkill: { stage: 0, stageCount: 1, type: 'ACTIVE', commandBandId: null },
  personalChoice: { id: 'c1', round: 6, kind: 'bandSkill', choiceEvent: 'skill_change_1', sourceItemId: 'chess_item_5_06_e_a',
    cards: [card('band_kazimier', 0), card('band_jenga', 0)] },
  ...o,
});

test('the bandSkill personal choice is the 更换指令 screen with the source and the 指令 it replaces', () => {
  const sp = normalizePersonalChoice(pub, priv(), 'a');
  assert.equal(sp.family, 'command');
  assert.equal(sp.name, '更换指令');
  assert.equal(sp.id, 'c1');
  assert.deepEqual(sp.command, { sourceItemId: 'chess_item_5_06_e_a', ownBandId: 'band_ursus', currentBandId: 'band_ursus', currentStage: 0 });
  // a 指令 taken before: that one is replaced
  const taken = normalizePersonalChoice(pub, priv({ bandSkill: { stage: 1, commandBandId: 'band_jenga' } }), 'a');
  assert.equal(taken.command.currentBandId, 'band_jenga');
  assert.equal(taken.command.currentStage, 1);
  // the 教鞭 choice stays as it was
  const bounty = normalizePersonalChoice(pub, priv({ personalChoice: { id: 'c2', round: 6, cards: [{ kind: 'bounty', id: 'x' }] } }), 'a');
  assert.equal(bounty.family, 'bounty');
  assert.equal(bounty.command, undefined);
});

test('the screen: title, the source in the notice, the current 指令 line, 指令 cards (not 悬赏)', () => {
  const sp = normalizePersonalChoice(pub, priv(), 'a');
  const tree = ChoiceView({ pub, sp, myId: 'a', solo: true, personal: true });
  assert.equal(text(find(tree, 'spov__name')[0]), '更换指令');
  const notice = text(find(tree, 'spov__notice')[0]);
  assert.ok(notice.includes(data.lookup('items', 'chess_item_5_06_e_a').name), notice);
  assert.ok(notice.includes('被动效果保留'), notice);
  const now = text(find(tree, 'spov__now')[0]);
  const ursus = band('band_ursus');
  assert.ok(now.includes(ursus.skills[0].name) && now.includes(ursus.name), now);
  const cards = find(tree, 'spcard');
  assert.equal(cards.length, 2);
  assert.ok(cards.every((c) => hasClass(c, 'spcard--command') && !hasClass(c, 'spcard--bounty')));
  // 焰尾: the 指令's name, the strategy's name, its cost 6, the text without its leading 【name】 line
  const k = cards[0];
  assert.equal(text(find(k, 'spcard__name')[0]), band('band_kazimier').skills[0].name);
  assert.equal(text(find(k, 'spcard__band')[0]), band('band_kazimier').name, 'one stage: no stage shown');
  assert.equal(text(find(k, 'spcard__cost')[0]), '6');
  const desc = [...walk(k)].find((n) => hasClass(n, 'spcard__desc'));
  assert.ok(!/^【/.test(desc.props.text), desc.props.text);
  assert.ok(/点击使用/.test(desc.props.text));
  // 但书: two stages — 「1/2阶段」 by the strategy's name
  assert.ok(text(find(cards[1], 'spcard__band')[0]).includes('1/2阶段'));
});

test('the card fields come from the strategy record; a strategy without an active stage has no current 指令', () => {
  const r = resolveSpCard(card('band_kazimier', 0), 'command');
  assert.equal(r.kind, 'command');
  assert.equal(r.cost, 6);
  assert.equal(r.bandName, band('band_kazimier').name);
  assert.equal(r.stage, null);
  assert.deepEqual(resolveSpCard(card('band_jenga', 1), 'command').stage, { n: 2, of: 2 });
  const passive = data.list('bands').find((b) => Array.isArray(b.skills) && b.skills.length && !b.skills.some((s) => s?.type === 'ACTIVE'));
  assert.ok(passive, 'a passive 规程 strategy');
  assert.equal(currentCommand({ currentBandId: passive.bandId, currentStage: 0, ownBandId: passive.bandId }), null);
  // a passive 指令 taken from another strategy (maintainer decision 2026-11-15) is the one the pick replaces
  assert.deepEqual(currentCommand({ currentBandId: passive.bandId, currentStage: 0, ownBandId: 'band_jenga' }),
    { bandId: passive.bandId, bandName: passive.name, name: passive.skills[0].name });
  const sp = normalizePersonalChoice(pub, priv({ bandId: passive.bandId, bandSkill: { stage: 0, type: 'PASSIVE', commandBandId: null } }), 'a');
  assert.equal(text(find(ChoiceView({ pub, sp, myId: 'a', solo: true, personal: true }), 'spov__now')[0]), '当前没有指令');
});

test('after the pick the HUD portrait, name and stage text are the taken strategy\'s', () => {
  const src = read('public/js/ui/bandSkill.js');
  assert.match(src, /const bandId = bs\.commandBandId \|\| priv\.bandId;/);
  assert.match(src, /data\.lookup\('bands', bandId\)/);
  assert.match(src, /bandIconUrl\(data\.get\('assets'\), bandId\)/);
  assert.ok(!/lookup(Raw)?\('bands', priv\.bandId\)/.test(src), 'no lookup by the own strategy left');
});
