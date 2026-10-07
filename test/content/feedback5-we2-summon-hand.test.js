// test/content/feedback5-we2-summon-hand.test.js — 0.2.0 WE2 #21: the hand count of every 自选 summoner's placeable summon
// is its deploy limit (PRTS 卫戍协议/帮助 §战斗部署 "根据召唤物部署数量上限（非初始持有量），发送等量召唤物至手牌区"), and the
// data's deploy limit / holding carry the tokens' own talent additions (tools/build-data.mjs tokenTalentDeckBonus: the
// hidden "TOKEN数" talent max_deploy_count / max_deck_stack_cnt on top of the attribute frame). On this server the only
// 自选 summoner with a placeable summon is 望 ("可以使用6枚棋子", TRP-X +1); upstream's other summoners are gone.
// #24: a summon no owner shows (displayTokenDict: the variants' `display` source) is its skill's own object, never a hand
// card.
// Run: node --test test/content/feedback5-we2-summon-hand.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getData } from '../../server/data.js';
import { GameData } from '../../server/match/gamedata.js';
import { diyGameData } from '../../server/match/player/diy.js';
import { diyRecord, diySlot } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const DATA = { chess: CHESS, backups: BACKUPS };
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const STAGE = { 5: 1, 6: 3 };
const statusOf = (tier, elite) => (elite ? `2/60/7/${STAGE[tier]}` : '2/1/4/0');

/** The official hand count of `charId`'s summon under a module at its stage (null module = none). */
function official(charId, mod) {
  switch (charId) {
    case 'char_2027_wang': return mod === 'uniequip_002_wang' ? 7 : 6;                     // TRP-X +1
    default: return 1;
  }
}

const gd = new GameData(getData({ log: { warn() {}, error() {}, info() {} } }), 'mode_multi_hard');

test('every 自选 summoner: the hand count of each placeable summon in every form, skill and module is the official one', () => {
  const owners = new Map();   // charId → placeable token ids it makes
  for (const [tid, t] of Object.entries(BACKUPS.tokens)) {
    if (t.kind !== 'summon' || t.placeable !== true) continue;
    for (const key of Object.keys(t.variants)) {
      const cid = key.split('@')[0];
      if (!owners.has(cid)) owners.set(cid, new Set());
      owners.get(cid).add(tid);
    }
  }
  assert.deepEqual([...owners.keys()], ['char_2027_wang']);
  let checked = 0;
  for (const [charId] of owners) {
    if (!BACKUPS.diy.ownedPool.includes(charId)) continue;
    for (const tier of [5, 6]) {
      for (const elite of [false, true]) {
        const form = BACKUPS.units[charId].forms[statusOf(tier, elite)];
        for (const mod of elite ? [null, ...(form.modules ?? []).map((m) => m.uniEquipId)] : [null]) {
          for (const s of form.skills) {
            const pick = { charId, skillIndex: s.index, uniEquipId: mod };
            const slot = diySlot(SLOT[tier], DATA);
            const id = elite ? slot.goldenId : slot.baseId;
            const rec = diyRecord(SLOT[tier], pick, { elite, data: DATA });
            assert.ok(rec, `${charId} T${tier} ${elite ? 'elite' : 'normal'} ${mod} S${s.index + 1}`);
            const view = diyGameData(gd, new Map([[id, rec]]));
            for (const { tokenId, count } of view.placeableTokens(id, { skillIndex: s.index, moduleId: mod })) {
              assert.equal(count, official(charId, mod), `${charId} T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'} S${s.index + 1}: ${tokenId}`);
              checked++;
            }
          }
        }
      }
    }
  }
  assert.equal(checked, 18, "2 tiers × (3 normal + 3 skills × (no module, TRP-X) elite)");
});

test('the data: deploy limit / holding = the attribute frame + the token talents\' max_deploy_count / max_deck_stack_cnt (a module token part of the same talent replaces it)', () => {
  const v = (tid, owner) => BACKUPS.tokens[tid].variants[owner];
  // 望's 棋子: the rank-2 talent (+1) is a potential talent — potential 0 keeps 6
  assert.equal(v('token_10064_wang_stone1', 'char_2027_wang@2/1/4/0').stats.deployLimit, 6);
  assert.equal(v('token_10064_wang_stone1', 'char_2027_wang@2/60/7/3').byModule.uniequip_002_wang.stats.deployLimit, 7);
  // the chess summons of tokens.json have no such talent: 凯瑟琳's 爬行号 2 of 3, everyone else 1
  const tokens = load('tokens');
  assert.equal(tokens.token_10041_cathy_catsld.variants.chess_char_4_11_a.stats.deployLimit, 2);
  assert.equal(tokens.token_10000_silent_healrb.variants.chess_char_2_02_a.stats.deployLimit, 1);
});

test('#24 a summon no owner shows is never a hand card: every placeable summon is displayed, every undisplayed one HIDDEN', () => {
  const shows = (v) => (v.sources ?? []).includes('display') || Object.values(v.bySkill ?? {}).some((a) => (a.sources ?? []).includes('display'));
  for (const t of [...Object.values(load('tokens')), ...Object.values(BACKUPS.tokens)]) {
    if (t.kind !== 'summon') continue;
    if (t.placeable) assert.ok(Object.values(t.variants).some(shows), `${t.tokenId} ${t.name}: placeable and displayed`);
    else if (!Object.values(t.variants).some(shows)) assert.equal(t.displayType, 'HIDDEN', `${t.tokenId} ${t.name}: undisplayed ⇒ HIDDEN`);
  }
});
