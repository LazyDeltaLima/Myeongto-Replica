// server/match/pool.js — the SHARED chess pool (copies per base chess, across all players), per-match bans,
// copy-weighted shop rolls (research 00-INDEX §3, §6; DESIGN §6.2).
//
// Model:
//   * Every visible (non-hidden, non-DIY) base chess that is not banned this match has `cap` copies
//     (GameData.poolCopies: the 独立模拟 (solo) table config.economy.poolCopies[tier] with its per-operator
//     poolCopiesOverrides, × coopPoolMultiplier in a 同盟模拟 co-op match). `left[baseId]` = the signed capacity minus
//     the copies owned; the public left() and the rolls clamp a deficit to zero.
//   * Owning a piece takes copies: a normal piece holds 1, an elite holds 3 (merge of 3 normals). Shop displays
//     do NOT reserve copies; buying fails (SOLD_OUT) when left = 0.
//   * Pieces remember how many copies they hold (`piece.poolCopies`), so selling / elimination / temp wipes return
//     exactly what was taken — hidden/banned chess hold 0. An acquired piece takes its full copies even past the cap
//     (`take(…, { overdraw: true })`: a grant, a merge's or promotion's elite, 拟态物质's copy beyond the stock), so the
//     raw balance can go negative and selling one copy does not reopen the stock while ownership stays above the cap.
//   * Invariant (tests): left ≤ cap and left + Σ held copies == cap for every base chess.
//
// Rolls: each chess slot draws ONE copy uniformly from all remaining copies of eligible chess with tier ≤ shop level
// ("copy-weighted"; duplicates within a roll allowed). The item slot picks a tier with the same tier shares, then a
// uniform shop-eligible item of that tier that the shared equipment stock (SharedItemPool, below) still covers (falling
// back to lower tiers). A roll may add entries outside the pool
// (`extra`, after its own): one player's 自选 stock (0.2.0, player/diy.js diyRollEntries) — weighted by its copies like
// any chess, drawn by that player's shop only.

/**
 * Per-match disabled bond set D and banned chess (research 01 A2): D = uniform sample of `core` core bonds and `addon`
 * add-on bonds among weight > 0 bonds that are active in the mode. A visible chess is banned iff every one of its
 * bonds is in D ∪ mode.inactiveBondIds.
 * @param {import('./gamedata.js').GameData} gd
 * @param {Function} rng seeded rng (createRng)
 * @returns {{ drawn: string[], staticOff: string[], banned: string[] }}
 */
export function drawDisabledBonds(gd, rng) {
  const { core: nCore, addon: nAddon } = gd.bans(gd.difficulty);
  const staticOff = [...gd.modeInactiveBonds].filter((b) => gd.bond(b)).sort();
  const eligible = gd.bondIds.filter((b) => {
    const bond = gd.bond(b);
    return bond && Number(bond.weight) > 0 && !gd.modeInactiveBonds.has(b);
  });
  const core = eligible.filter((b) => gd.bond(b).isCore);
  const addon = eligible.filter((b) => !gd.bond(b).isCore);
  const drawn = [...sample(core, nCore, rng), ...sample(addon, nAddon, rng)].sort();
  const off = new Set([...drawn, ...staticOff]);
  const banned = [];
  for (const id of gd.visibleChess) {
    const c = gd.chess(id);
    const bonds = Array.isArray(c.bonds) ? c.bonds : [];
    if (bonds.length > 0 && bonds.every((b) => off.has(b))) banned.push(id);
  }
  return { drawn, staticOff, banned };
}

function sample(arr, n, rng) {
  const a = arr.slice();
  rng.shuffle(a);
  return a.slice(0, Math.max(0, Math.min(n, a.length)));
}

export class SharedPool {
  /**
   * @param {import('./gamedata.js').GameData} gd
   * @param {{ banned?: Iterable<string> }} [opts]
   */
  constructor(gd, { banned = [] } = {}) {
    this.gd = gd;
    const ban = new Set(banned);
    /** @type {Map<string, { cap: number, left: number, tier: number }>} */
    this.entries = new Map();
    for (const id of gd.visibleChess) {
      if (ban.has(id)) continue;
      const cap = gd.poolCopies(id);
      if (cap <= 0) continue;
      this.entries.set(id, { cap, left: cap, tier: gd.tierOf(id) });
    }
    this.banned = [...ban].sort();
  }

  /** Whether a base chess is part of this match's pool (visible, not banned). */
  has(baseId) { return this.entries.has(baseId); }
  cap(baseId) { return this.entries.get(baseId)?.cap ?? 0; }
  left(baseId) { return Math.max(0, this.entries.get(baseId)?.left ?? 0); }

  /**
   * Take up to n copies; returns the number actually taken (0 when not in the pool / empty). `overdraw`: take all n
   * even past the stock (an owned piece always occupies its copies).
   */
  take(baseId, n = 1, { overdraw = false } = {}) {
    const e = this.entries.get(baseId);
    if (!e || !(n > 0)) return 0;
    const k = overdraw ? Math.floor(n) : Math.min(Math.max(0, e.left), Math.floor(n));
    e.left -= k;
    return k;
  }

  /** Return n copies (clamped at the cap). Returns the number actually returned. */
  give(baseId, n = 1) {
    const e = this.entries.get(baseId);
    if (!e || !(n > 0)) return 0;
    const k = Math.min(e.cap - e.left, Math.floor(n));
    e.left += k;
    return k;
  }

  /**
   * Remaining copies of eligible chess (tier ≤ maxTier, or exactly `tier`): the pool's entries, then `extra` ([id, entry]
   * pairs of the same shape — a player's 自选 stock) under the same filters. `ignoreCounts`: every eligible identity
   * once, whatever its copies left (拟态物质's draw).
   */
  _eligible({ maxTier = 6, tier = null, filter = null, extra = null, ignoreCounts = false } = {}) {
    const out = [];
    const scan = (list) => {
      for (const [id, e] of list) {
        if (!ignoreCounts && e.left <= 0) continue;
        if (tier != null ? e.tier !== tier : e.tier > maxTier) continue;
        if (filter && !filter(id, e)) continue;
        out.push([id, ignoreCounts ? 1 : e.left]);
      }
    };
    scan(this.entries);
    if (extra) scan(extra);
    return out;
  }

  /**
   * Copy-weighted roll: one copy uniformly among remaining copies of eligible chess. Returns a base id or null.
   * @param {Function} rng
   * @param {{ maxTier?: number, tier?: number|null, filter?: (id: string, e: object) => boolean,
   *   extra?: Iterable<[string, { left: number, tier: number }]>|null, ignoreCounts?: boolean }} [opts]
   */
  roll(rng, opts = {}) {
    const el = this._eligible(opts);
    let total = 0;
    for (const [, n] of el) total += n;
    if (total <= 0) return null;
    let r = rng() * total;
    for (const [id, n] of el) { r -= n; if (r < 0) return id; }
    return el[el.length - 1][0];
  }

  /** Tier shares of a copy-weighted roll at shop level `maxTier` (current remaining copies). */
  tierShares(maxTier) {
    const t = {};
    let total = 0;
    for (const [, e] of this.entries) {
      if (e.tier > maxTier || e.left <= 0) continue;
      t[e.tier] = (t[e.tier] || 0) + e.left;
      total += e.left;
    }
    const out = {};
    for (const k of Object.keys(t)) out[k] = total > 0 ? t[k] / total : 0;
    return out;
  }

  /**
   * Item roll for the shop's item slot: tier by the chess tier shares at this level, uniform item within the tier,
   * falling back to lower tiers when a tier has no item. With `stock` (SharedItemPool) an item the shared equipment
   * stock cannot cover is left out of its tier first. Returns an item id or null.
   */
  rollItem(rng, maxTier, stock = null) {
    const shares = this.tierShares(maxTier);
    const tiers = Object.keys(shares).map(Number).sort((a, b) => a - b);
    let tier = null;
    if (tiers.length) {
      let r = rng();
      for (const t of tiers) { r -= shares[t]; if (r < 0) { tier = t; break; } }
      if (tier == null) tier = tiers[tiers.length - 1];
    } else {
      tier = 1 + Math.floor(rng() * Math.max(1, maxTier));
    }
    for (let t = tier; t >= 1; t--) {
      const list = (this.gd.shopItemsByTier[t] || []).filter((id) => !stock || stock.canGain(id));
      if (list.length) return stock ? stock.pick(rng, list) : list[Math.floor(rng() * list.length)];
    }
    for (let t = tier + 1; t <= 6; t++) {
      const list = (this.gd.shopItemsByTier[t] || []).filter((id) => !stock || stock.canGain(id));
      if (list.length) return stock ? stock.pick(rng, list) : list[Math.floor(rng() * list.length)];
    }
    return null;
  }

  /** { baseId: left } snapshot (tests / diagnostics). */
  snapshot() {
    const o = {};
    for (const [id, e] of this.entries) o[id] = Math.max(0, e.left);
    return o;
  }

  totalLeft() {
    let n = 0;
    for (const e of this.entries.values()) n += Math.max(0, e.left);
    return n;
  }
}

/**
 * Shared shop-equipment stock (upstream 6bfc0827, GitHub #466): every shop item has a match-wide cap, counted live from
 * what every player owns — hand, temp area and the items equipped on board pieces (the bench's pieces carry theirs
 * too). A normal item occupies 1, an advanced (golden) one 2. Shop / choice displays reserve nothing. Caps
 * (config.economy.itemPoolCopies by tier 4/6/7/8/7/3 + itemPoolCopiesOverrides, e.g. 商业包装方案 2) are the 路标月报#2
 * measurements (路标档案馆, bilibili BV1eLXXBqEgF, 2026-03-29, ~1:30) and are the same in solo and co-op. Items that
 * are not shop items (effect-only special equipment) have no cap. [ASSUMED] An item that is consumed, destroyed or
 * removed by an elimination no longer occupies stock (the video shows the ownership model, not every removal path):
 * this is a concurrent cap, never a limit on appearances or purchases per match.
 * The four uncapped 〈获得时〉 fixed-equipment traits (SERVER_GAIN_EQUIP: 诗怀雅 / 卡涅利安 and 蜜蜡 (shared garrison 49) /
 * 耶拉 / 缪尔赛思 — 路标月报#2 item 7) carry `noPool` and hold no stock (acquireItem marks them; held() skips them),
 * upstream PR #496 (GitHub #488). Pool-draw traits (洛洛 / 焰尾, SERVER_POOL_*) stay pool-bound like any acquisition.
 */
export class SharedItemPool {
  /** @param {any} gd @param {() => Iterable<any>} players every seat of the match (eliminated ones hold nothing) */
  constructor(gd, players) { this.gd = gd; this.players = players; }
  /** The cap of an item's base, or null (uncapped). */
  cap(id) { return this.gd.itemPoolCopies(id); }
  /** Copies one piece of `id` occupies: an advanced (golden) item is the merge of two. */
  need(id) { return this.gd.isGolden(id) ? 2 : 1; }
  held(id) {
    const base = this.gd.baseIdOf(id);
    let count = 0;
    const see = (p) => {
      if (!p) return;
      if (p.kind === 'item' && !p.noPool && this.gd.baseIdOf(p.id) === base) count += this.need(p.id);
      for (const item of p.items || []) if (!item.noPool && this.gd.baseIdOf(item.id) === base) count += this.need(item.id);
    };
    for (const ps of this.players()) {
      for (const p of ps.hand) see(p);
      for (const p of ps.temp) see(p);
      for (const p of ps.board.values()) see(p);
    }
    return count;
  }
  left(id) { const cap = this.cap(id); return cap == null ? Infinity : Math.max(0, cap - this.held(id)); }
  canGain(id) { return this.left(id) >= this.need(id); }
  /**
   * One id of `ids` the stock can cover: uniform, or by `weights` (Map id → weight). The stock gates eligibility, not
   * probability — the measured table alone does not give shop odds.
   */
  pick(rng, ids, weights = null) {
    const list = [...new Set(ids)].filter((id) => this.canGain(id));
    const pairs = list.map((id) => [id, weights ? Math.max(0, Number(weights.get(id)) || 0) : 1]);
    const total = pairs.reduce((n, p) => n + p[1], 0);
    if (!(total > 0)) return null;
    let r = rng() * total;
    for (const [id, weight] of pairs) if ((r -= weight) < 0) return id;
    return pairs.at(-1)?.[0] || null;
  }
}
