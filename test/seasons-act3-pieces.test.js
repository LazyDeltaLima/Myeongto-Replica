// 卫戍协议：规程 (shared/seasons.js `act3autochess`, not public): every piece of its shop, both forms, at the skill that
// season gives it, plays a kit written for that skill and fights — the skill starts and its hits land (or heal), with no
// handler error. The operators without a kit yet are listed with the work that writes theirs, so a new kit joins the
// battles below by leaving the list.
//
// A kit that writes one `skill` (no `skills` map) wrote it for the chess's default skill of the season it was written
// for: such a kit is only taken when 规程 gives the same skill (a tier change can move the default skill).

import test from 'node:test';
import assert from 'node:assert/strict';
import { getData } from '../server/data.js';
import { ACT3 } from './helpers/seasonPieces.js';
import { makeBattle } from './helpers/battleHarness.js';
import { skillSpecSource } from '../server/sim/content/index.js';

const BASE = getData({ log: { warn() {}, error() {}, info() {} } });

/** charId → the bundle that writes its kit (no kit yet: the generic kit plays it). */
const NO_KIT = Object.freeze({
  char_1031_slent2: 'sim-H', char_4088_hodrer: 'sim-H', char_4230_mcnist: 'sim-H',
  char_4245_alga: 'sim-I', char_002_amiya: 'sim-I', char_219_meteo: 'sim-I',
  char_347_jaksel: 'sim-J', char_4041_chnut: 'sim-J', char_333_sidero: 'sim-J', char_618_acrbot: 'sim-J',
});

const PIECES = Object.values(ACT3.chess).filter((r) => r.chessType !== 'DIY');
const skillIdOf = (r) => r.skill?.skillId ?? r.skill?.id ?? r.skill ?? null;

/** The default season's chess skills of an operator (charId → Set). */
const BASE_SKILLS = new Map();
for (const r of Object.values(BASE.chess)) {
  if (r.chessType === 'DIY') continue;
  if (!BASE_SKILLS.has(r.charId)) BASE_SKILLS.set(r.charId, new Set());
  BASE_SKILLS.get(r.charId).add(skillIdOf(r));
}

const ENEMIES = [{ key: 'enemy_1422_lrsldr', time: 0, route: 0, count: 8, interval: 1.2 }, { key: 'enemy_1422_lrsldr', time: 1, route: 1, count: 6, interval: 1.6 }];
// a wounded ally next to the piece (another 规程 piece: 艾丝黛尔)
const HURT = { chessId: 'chess_char_1_02_a', row: 10, col: 5, uid: 51, carryState: { hpPct: 0.3 } };
/**
 * What a skill needs on the field (charId → units): 华法琳 S1, 塞雷娅 S1 and 铃兰 S3 heal an ally that is hurt
 * (铃兰 S3 stops her attacks and heals and slows instead); Mon3tr's S3 needs her placed 重构体 (test/content/op_monstr.test.js);
 * 凯瑟琳's S2 stops her attacks and works through her placed device, which shields the operator it faces
 * (test/content/facing.test.js) — that shield is her hit.
 */
const PLACED = {
  char_171_bldsk: [HURT], char_202_demkni: [HURT], char_358_lisa: [HURT],
  char_4179_monstr: [{ kind: 'token', tokenId: 'token_10050_monstr_prosts', ownerUid: 1, row: 10, col: 5, uid: 50 }],
  char_4162_cathy: [{ ...HURT, row: 10, col: 6 }, { kind: 'token', tokenId: 'token_10041_cathy_catsld', ownerUid: 1, row: 10, col: 5, uid: 50, dir: 'RIGHT' }],
};
const SHIELDS = { char_4162_cathy: 'cathy:shield' };

test('规程: an operator without a kit is listed with the work that writes it; the others play their own skill spec', () => {
  const none = new Set();
  for (const rec of PIECES) {
    const h = makeBattle({ seed: 5, defs: { chess: ACT3.chess, tokens: ACT3.tokens }, units: [{ chessId: rec.chessId, row: 10, col: 4, uid: 1 }] });
    const def = h.unit(1).def;
    const src = skillSpecSource(def);
    const label = `${rec.chessId} ${rec.name} ${skillIdOf(rec)}`;
    assert.equal(def.charId, rec.charId, label);
    if (src === 'none' || src === 'generic') { none.add(rec.charId); continue; }
    assert.ok(src === 'skills' || src === 'kit', `${label}: ${src}`);
    if (src === 'kit') {
      // one `skill` only: written for the default season's chess skill of this operator, which must be 规程's too
      assert.ok(BASE_SKILLS.get(rec.charId)?.has(skillIdOf(rec)), `${label}: the kit's one skill spec was written for ${[...(BASE_SKILLS.get(rec.charId) ?? [])]}`);
    }
  }
  assert.deepEqual([...none].sort(), Object.keys(NO_KIT).sort());
});

test('规程: every piece with a kit, both forms, casts its season skill and hits (or heals), with no handler error', () => {
  const sum = (list) => list.reduce((a, d) => a + (d.amount ?? 0), 0);
  let fought = 0;
  for (const rec of PIECES) {
    if (NO_KIT[rec.charId]) continue;
    const label = `${rec.chessId} ${rec.name} ${skillIdOf(rec)}`;
    const h = makeBattle({
      seed: 5, timeLimit: 60, captureNoisy: true, defs: { chess: ACT3.chess, tokens: ACT3.tokens }, enemies: ENEMIES,
      units: [{ chessId: rec.chessId, row: 10, col: 4, uid: 1, carryState: { sp: 999 } }, ...(PLACED[rec.charId] ?? [])],
    });
    h.run(25);
    const u = h.unit(1);
    assert.deepEqual(h.battle.errors, [], `${label}: no handler error`);
    const casts = h.hooksOf('skillStart').filter((s) => s.unit === u).length;
    const dealt = sum(h.hooksOf('damaged').filter((d) => d.target?.side === 'enemy'));
    const healed = sum(h.hooksOf('heal'));
    const shield = SHIELDS[rec.charId] ? h.b.allyUnits.some((x) => x !== u && x.findBuff(SHIELDS[rec.charId])) : false;
    // a PASSIVE skill is never cast, it only has to hit
    const passive = u.skill?.kind === 'passive';
    assert.ok(passive || casts > 0, `${label}: the skill starts (${JSON.stringify({ casts, dealt, healed })})`);
    assert.ok(dealt > 0 || healed > 0 || shield, `${label}: it hits, heals or shields (${JSON.stringify({ casts, dealt, healed })})`);
    fought++;
  }
  assert.equal(fought, PIECES.filter((r) => !NO_KIT[r.charId]).length);
  assert.ok(fought >= 266, `${fought} pieces fought`);
});
