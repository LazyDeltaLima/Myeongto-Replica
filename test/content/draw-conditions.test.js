// test/content/draw-conditions.test.js — the draw conditions a record's text states, kept by its handler on the real
// match path, for every season.
//
// 规程's 伊桑 (garrison_200, 「<售出时>随机获得一名当前人数最多盟约的干员（不高于当前调度中心等级；无法获得自身）」) gave
// 6-tier operators at a low 调度中心 level (a CN player's report, 2026-11-14): its handler rolled up to tier 6 and could
// give him back. This file finds every 特质, equipment and 指令 whose text carries such a condition and runs its handler
// over several seeds and 调度中心 levels, then checks what it gave against the condition:
//   不高于当前调度中心等级   every operator / equipment it gives, offers or puts in the shop is of a tier ≤ the level
//   无法获得自身             never the operator the record is on
//   同阶                     (「否则随机获得1名同阶干员」) the operator it gives is of its carrier's tier
// A record with such a text and no way here to set it off fails: add its trigger to RUN below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, give, giveItem, legalTileFor } from '../match/harness.js';
import { registryFor } from '../../server/match/effectsMeta.js';
import { getData } from '../../server/data.js';
import { ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';

const QUIET = { info() {}, warn() {}, error() {} };
const SEASONS = [
  { season: 'act2autochess', data: getData({ log: QUIET }) },
  { season: 'act3autochess', data: ACT3_ON_BASE_FIELD },
];
const CONDITIONS = {
  tierCap: /不高于当前调度中心等级/,
  notSelf: /无法获得自身/,
  sameTier: /(?<!不)同阶干员/,
};
const LEVELS = [2, 4];
const SEEDS = 12;

const plainText = (s) => String(s || '').replace(/<[^>]*>/g, '');
const textOf = (rec) => [rec.desc, rec.descRaw, ...(Array.isArray(rec.skills) ? rec.skills.map((s) => (typeof s === 'string' ? s : s?.desc)) : [])].map(plainText).join('\n');

/** The records of a season whose text states a draw condition: { kind, id, rec, conds }. */
function conditioned(data) {
  const out = [];
  for (const [kind, table] of [['garrison', data.garrisons], ['item', data.items], ['band', data.bands]]) {
    for (const [id, rec] of Object.entries(table || {})) {
      const text = textOf(rec);
      const conds = Object.keys(CONDITIONS).filter((c) => CONDITIONS[c].test(text));
      if (conds.length) out.push({ kind, id, rec, text, conds });
    }
  }
  return out;
}

function setup(data, season, seed, band = null) {
  const h = makeMatch({ mode: 'solo', humans: 1, seed, registry: registryFor(data), fake: true, data, season }).start();
  h.toPrep(1, season === 'act3autochess' ? { band: 'band_amiya' } : undefined);   // 规程 drafts a 指令 first
  const m = h.m;
  const ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean), ...ps.temp.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.temp.fill(null); ps.offers.length = 0;
  ps.funds = 200; ps.layers = {}; ps.pendingFunds = 0; ps.shop.freeRefreshes = 0; ps.counters = {};
  ps.bandId = band;
  ps.recompute();
  return { h, m, ps };
}
const place = (m, ps, id) => give(m, ps, id, 'board', legalTileFor(m, ps, id, new Set([...ps.board.keys()])));

/** What the handler gives, offers or puts in the shop while `fn` runs: [{ kind: 'chess' | 'item', id }]. */
function collect(ps, fn) {
  const got = [];
  const saved = {};
  const wrap = (name, after) => {
    saved[name] = ps[name];
    ps[name] = function (...args) { const r = saved[name].apply(this, args); after(args, r); return r; };
  };
  wrap('acquireChess', ([id]) => got.push({ kind: 'chess', id, via: 'grant' }));
  wrap('acquireItem', ([id]) => got.push({ kind: 'item', id, via: 'grant' }));
  const offered = (_a, offer) => { for (const sl of offer?.slots || []) got.push({ kind: sl.kind, id: sl.id, via: 'offer' }); };
  wrap('pushRewardOffer', offered);
  wrap('pushItemOffer', offered);
  // a shop card it draws (a special refresh, or a card set in place): every slot that is not the card it was
  const before = ps.shop.slots.map((sl) => sl && { ...sl });
  try { fn(); } finally { for (const [k, f] of Object.entries(saved)) ps[k] = f; }
  ps.shop.slots.forEach((sl, i) => {
    const b = before[i];
    if (sl && !sl.sold && (!b || b.id !== sl.id || b.kind !== sl.kind)) got.push({ kind: sl.kind, id: sl.id, via: 'shop' });
  });
  return got;
}

/** A tier-2 operator with a bond the match keeps (规程 bans the drawn-off core bonds' operators), not `not`. */
function carrierFor(m, data, not = null) {
  return Object.values(data.chess).filter((c) => c.visible && !c.isGolden && c.tier === 2 && c.bonds?.length && c.chessId !== not
    && !c.bonds.some((b) => m.disabledBonds?.includes(b)) && (c.garrisonIds || []).every((g) => data.garrisons[g]?.eventType === 'IN_BATTLE'))
    .map((c) => c.chessId).sort()[0];
}

/**
 * How to set a record off on the real match path; returns { got, source } (`source`: the chess record the condition is
 * about — the 特质's operator, the equipment's carrier) or null when this seed cannot (a bond it needs is banned).
 */
const RUN = {
  garrison({ m, ps, data }, r) {
    const chess = Object.values(data.chess).find((c) => !c.isGolden && (c.garrisonIds || []).includes(r.id))
      ?? Object.values(data.chess).find((c) => (c.garrisonIds || []).includes(r.id));
    if (!chess || chess.bonds?.some((b) => m.disabledBonds?.includes(b))) return null;
    const p = place(m, ps, chess.chessId);
    // a second member of its first bond, so a 「most-member bond」 is its own after it leaves
    const mate = Object.values(data.chess).find((c) => c.visible && !c.isGolden && c.baseId !== chess.baseId && c.bonds?.[0] === chess.bonds?.[0]
      && (c.garrisonIds || []).every((g) => data.garrisons[g]?.eventType === 'IN_BATTLE'));
    if (mate) place(m, ps, mate.chessId);
    const ev = r.rec.eventType;
    if (ev === 'SERVER_PREP_START') return { source: chess, got: collect(ps, () => m.dispatch(ps, 'onPrepStart', { round: m.round })) };
    if (ev === 'SERVER_CHESS_SOLD') return { source: chess, got: collect(ps, () => assert.equal(ps.sell(p.uid).ok, true)) };
    throw new Error(`${r.id}: no trigger here for event ${ev}`);
  },
  item({ m, ps, data }, r) {
    const carrier = carrierFor(m, data);
    const target = place(m, ps, carrier);
    const it = giveItem(m, ps, r.id);
    const sells = Number(/每出售(\d+)名干员/.exec(r.text)?.[1]) || 0;
    const got = collect(ps, () => {
      assert.equal(ps.equip(it.uid, target.uid).ok, true, `${r.id} equips`);
      for (let i = 0; i < sells; i++) {
        const other = carrierFor(m, data, carrier);
        const p = give(m, ps, other, 'hand');
        assert.equal(ps.sell(p.uid).ok, true);
      }
    });
    return { source: data.chess[carrier], got };
  },
  band({ m, ps }, r) {
    if (r.id === 'band_kirara') return { source: null, got: collect(ps, () => { ps.spend(20); ps._afterSpend(20, 'test'); }) };
    if (r.id === 'band_chiave') {
      return { source: null, got: collect(ps, () => { for (let i = 0; i < 6; i++) assert.deepEqual(m.handle('p_0', { t: 'g.refresh' }).ok, true); }) };
    }
    throw new Error(`${r.id}: no trigger here for this 指令`);
  },
};

for (const { season, data } of SEASONS) {
  for (const r of conditioned(data)) {
    test(`${season} ${r.id}: ${r.conds.join(' + ')} — ${r.text.split('\n')[0].slice(0, 60)}`, () => {
      let seen = 0;
      for (const level of LEVELS) {
        // SEEDS runs that can set it off (规程 bans the operators of the core bonds a match draws off: 伊桑 needs two)
        for (let seed = 1, runs = 0; seed <= SEEDS * 8 && runs < SEEDS; seed++) {
          const ctx = setup(data, season, seed, r.kind === 'band' ? r.id : null);
          ctx.data = data;
          ctx.ps.shop.level = level;
          const out = RUN[r.kind](ctx, r);
          if (!out) continue;
          runs++;
          const what = `L${level} seed ${seed}`;
          for (const g of out.got) {
            const rec = g.kind === 'chess' ? data.chess[g.id] : data.items[g.id];
            assert.ok(rec, `${what}: ${g.kind} ${g.id}`);
            seen++;
            if (r.conds.includes('tierCap')) assert.ok(rec.tier <= level, `${what}: ${g.via} ${g.id} tier ${rec.tier} > 调度中心 ${level}`);
            if (r.conds.includes('notSelf') && g.kind === 'chess') assert.notEqual(rec.charId, out.source.charId, `${what}: ${g.id} is itself`);
            if (r.conds.includes('sameTier') && g.kind === 'chess' && g.via === 'grant') assert.equal(rec.tier, out.source.tier, `${what}: ${g.id} not of ${out.source.chessId}'s tier`);
          }
        }
      }
      assert.ok(seen > 0, 'it gave something on some seed (not a vacuous pass)');
    });
  }
}

test('the condition phrases are found in both seasons (the scan reads the texts)', () => {
  const ids = SEASONS.map(({ season, data }) => conditioned(data).map((r) => `${season} ${r.id}`)).flat();
  assert.ok(ids.includes('act3autochess garrison_200_a'), ids.join('\n'));
  assert.ok(ids.includes('act2autochess band_kirara'), ids.join('\n'));
  assert.ok(ids.includes('act3autochess chess_item_5_03_e_a'), ids.join('\n'));
});
