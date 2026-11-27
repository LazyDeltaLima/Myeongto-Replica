// server/match/player/basics.js — PlayerState methods: the basics — seat flags and counts (isHumanActive,
// botControlled, deployCap, deployCount, tempEmpty), the prep that resolves a temp piece (tempDue, _putTemp: every
// write into a temp slot), the operator loadout (DESIGN §16: setLoadout, loadoutFor; 0.2.2 潜能 / 练度: cultivationFor), the not-owned operators fielded
// as their stand-ins (0.2.0 补位: setNotOwned, fieldsStandIn, fieldRecord), the operator skins (setSkins, skinFor), the deploy map on the field the
// player deploys on (Match.deployFieldOf) and the withdrawal of pieces a terrain / deploy-field change left on tiles
// they may no longer occupy (_evictIllegal), dirty.
// Installed on PlayerState.prototype by server/match/PlayerState.js (a method container: never instantiated; `this` is
// the player state).

/** @import { PlayerState } from '../PlayerState.js' */
/** @import { ChessRecord } from '../../../shared/loadoutRecord.js' */
/** @import { Piece } from './pieces.js' */
import { PHASE, ERR } from '../../../shared/constants.js';
import { msg, dn } from '../../../shared/i18n.js';
import { checkLoadout, checkLoadoutOps, cultivationCharIds, checkNotOwned, resolveLoadout, checkSkinSelection, operatorCharIds } from '../../../shared/protocol.js';
import { cultivationOf } from '../../../shared/potential.js';
import { tileKey, boardOrder, freeSlot } from '../board.js';
import { TEMP_SIZE } from './common.js';

/** The charIds a player may set a potential / 练度 for, per game-data object (shared/protocol.js cultivationCharIds). */
const OPS_IDS = new WeakMap();
/** @param {{ chess?: Record<string, any>, backups?: any } | null | undefined} raw */
function opsCharIds(raw) {
  if (!raw || typeof raw !== 'object') return new Set();
  let ids = OPS_IDS.get(raw);
  if (!ids) { ids = cultivationCharIds(raw.chess, raw.backups); OPS_IDS.set(raw, ids); }
  return ids;
}

export class PlayerBasics {
  /** @this {PlayerState} */
  get isHumanActive() { return !this.isBot && !this.left; }
  /**
   * The engine acts for this seat (AI teammate or "AI 托管"; a departed human is eliminated, so nothing is left to do).
   * @this {PlayerState}
   */
  get botControlled() { return this.isBot || this.left || this.autoplay; }

  /** @this {PlayerState} */
  get deployCap() { return Math.max(1, this.gd.deployCap + this.deployCapBonus, this.deployCapMin); }
  /** @this {PlayerState} */
  get deployCount() { let n = 0; for (const p of this.board.values()) if (p.kind === 'chess') n++; return n; }
  /**
   * 规程's 装备区 (GameData.equipHandSize): the five visible temp slots are the equipment zone — equipment and 秘术 only,
   * kept like the hand (no deadline) — and the hand holds operators and summon stacks only; what does not fit its own
   * zone waits in the hidden queue behind the five (temp[5…]) until its deadline (official client: separate char / equip
   * hand areas, full and overflow flags per area; where the overflow is shown is the server's [ASSUMED·서버]).
   * @this {PlayerState}
   */
  get bagMode() { return this.gd.equipHandSize > 0; }
  /**
   * temp index `i` is a slot of the 装备区 (bagMode's five visible slots), not overflow.
   * @param {number} i
   * @this {PlayerState}
   */
  isBagSlot(i) { return this.bagMode && Number.isInteger(i) && i >= 0 && i < TEMP_SIZE; }
  /**
   * The zone a piece of `kind` waits in: 'bag' (规程's 装备区, items) or 'hand'.
   * @param {string} kind
   * @this {PlayerState}
   */
  zoneOf(kind) { return this.bagMode && kind === 'item' ? 'bag' : 'hand'; }
  /**
   * A free slot of the zone of `kind` (hand, or 规程's 装备区 for items): its index, else -1.
   * @param {string} kind
   * @this {PlayerState}
   */
  freeZoneSlot(kind) {
    if (this.zoneOf(kind) === 'hand') return freeSlot(this.hand);
    for (let i = TEMP_SIZE - 1; i >= 0; i--) if (this.temp[i] == null) return i;
    return -1;
  }
  /**
   * The refusal of a buy / pick into a full zone: HAND_FULL, or BAG_FULL for an item in 规程's 装备区.
   * @param {string} kind
   * @this {PlayerState}
   */
  zoneFullError(kind) { return this.zoneOf(kind) === 'bag' ? ERR.BAG_FULL : ERR.HAND_FULL; }
  /**
   * No overflow is waiting: the whole temp row, or in bagMode the hidden queue (the 装备区 is no overflow).
   * @this {PlayerState}
   */
  get tempEmpty() { return this.overflowPieces().length === 0; }
  /**
   * The pieces that overflowed (temp; in bagMode only the queue behind the 装备区), in temp order.
   * @this {PlayerState}
   */
  overflowPieces() { return (this.bagMode ? this.temp.slice(TEMP_SIZE) : this.temp).filter(Boolean); }

  /**
   * Index of the prep whose deadline resolves a temp piece (compare with `prepsEnded`): recorded when the piece entered
   * temp (_putTemp); a piece put there by other means counts as due at the current (or next) prep.
   * @param {Piece | null | undefined} piece
   * @returns {number}
   * @this {PlayerState}
   */
  tempDue(piece) {
    const due = piece ? this._tempDue.get(piece.uid) : undefined;
    return Number.isInteger(due) ? /** @type {number} */ (due) : this.prepsEnded;
  }

  /**
   * Due prep of a piece entering temp now: the current prep while the player can still act on it (PREP, not ready);
   * after Ready or at the prep end (onPrepEnd grants) the next one; outside PREP (COMBAT, SETTLE, ROUND_START, 机变)
   * the next prep to end — `prepsEnded` then already names it.
   * @this {PlayerState}
   */
  _tempDueNow() {
    return this.prepsEnded + (this.m.phase === PHASE.PREP && this.ready ? 1 : 0);
  }

  /**
   * Every write of a piece into a temp slot goes through here (records its due prep).
   * @param {number} i @param {Piece} piece
   * @this {PlayerState}
   */
  _putTemp(i, piece) {
    this.temp[i] = piece;
    // a slot of 规程's 装备区 is no overflow: nothing there is due
    if (this.isBagSlot(i)) this._tempDue.delete(piece.uid);
    else this._tempDue.set(piece.uid, this._tempDueNow());
  }

  /**
   * Replace the operator loadout (DESIGN §16) — and, when `ops` is given, the per-operator 潜能 / 练度 (0.2.2; null = none
   * set, undefined = unchanged) — after re-checking them against this match's data. Accepts the checked form
   * `{ id: { skill, module|null } }` or raw `room.loadout` entries, and the checked or raw `ops`. Returns false (nothing
   * changes) when either does not fit the data; bots keep the defaults.
   * @param {any} loadout
   * @param {any} [ops]
   * @returns {boolean}
   * @this {PlayerState}
   */
  setLoadout(loadout, ops = undefined) {
    if (this.isBot) return false;
    let opsRes = null;
    if (ops !== undefined) {
      /** @type {Record<string, { potential?: number, cultivate?: number }>} */
      const raw = {};
      if (ops && typeof ops === 'object' && !Array.isArray(ops)) {
        for (const [id, e] of Object.entries(ops)) {
          if (!e || typeof e !== 'object') continue;
          /** @type {{ potential?: number, cultivate?: number }} */
          const x = {};
          if (Number.isInteger(e.potential)) x.potential = e.potential;
          if (Number.isInteger(e.cultivate)) x.cultivate = e.cultivate;
          if (Object.keys(x).length) raw[id] = x;
        }
      }
      const ids = opsCharIds(this.gd.raw);
      opsRes = checkLoadoutOps(raw, (id) => ids.has(id));
      if (!opsRes || !opsRes.ok) {
        this.m.log?.warn?.(`[match ${this.m.roomCode}] operator settings of ${this.playerId} ignored: ${opsRes && opsRes.detail}`);
        return false;
      }
    }
    /** @type {Record<string, { skill?: number, module?: string }>} */
    const entries = {};
    if (loadout && typeof loadout === 'object' && !Array.isArray(loadout)) {
      for (const [id, e] of Object.entries(loadout)) {
        if (!e || typeof e !== 'object') continue;
        /** @type {{ skill?: number, module?: string }} */
        const x = {};
        if (Number.isInteger(e.skill)) x.skill = e.skill;
        if (typeof e.module === 'string') x.module = e.module;
        if (Object.keys(x).length) entries[id] = x;
      }
    }
    const res = checkLoadout(entries, (id) => this.gd.chess(id));
    if (!res || !res.ok) {
      this.m.log?.warn?.(`[match ${this.m.roomCode}] loadout of ${this.playerId} ignored: ${res && res.detail}`);
      return false;
    }
    /** @type {Record<string, Readonly<{ skill: number, module: string | null }>>} */
    const out = {};
    for (const [id, e] of Object.entries(res.loadout)) out[id] = Object.freeze({ skill: e.skill, module: e.module ?? null });
    this.loadout = Object.freeze(out);
    if (opsRes) {
      /** @type {Record<string, Readonly<{ potential: number, cultivate: number }>>} */
      const o = {};
      for (const [id, e] of Object.entries(opsRes.ops)) o[id] = Object.freeze({ potential: e.potential, cultivate: e.cultivate });
      this.ops = Object.freeze(o);
    }
    return true;
  }

  /**
   * The potential / 练度 this player's piece of chess record `chessRecord` fights at (0.2.2; shared/potential.js
   * cultivationOf over `this.ops` — defaults 潜能 6, 精英2 Lv.60): the operator the player owns — the chess fielded as
   * itself, an owned 自选 pick (its charId) — or null for a 补位 stand-in and a prototype 自选 pick.
   * @param {ChessRecord|null} chessRecord
   * @returns {{ potential: number, cultivate: number } | null}
   * @this {PlayerState}
   */
  cultivationFor(chessRecord) {
    if (!chessRecord || this.fieldsStandIn(chessRecord)) return null;
    const rec = chessRecord.isDiy && typeof chessRecord.chessId === 'string' ? this.gd.chess(chessRecord.chessId) || chessRecord : chessRecord;
    return cultivationOf(rec, this.ops);
  }

  /**
   * The skill index / module a chess record fights with under this player's loadout (DESIGN §16) — for a chess this
   * player fields as its stand-in (0.2.0 补位) the stand-in's backup selection, whatever the loadout says; for a slotted
   * 自选 slot (0.2.0, player/diy.js) its pick's skill and module (the composed record's defaults — the loadout never names
   * a DIY slot: shared/protocol.js checkLoadout).
   * @param {ChessRecord|null} chessRecord
   * @this {PlayerState}
   */
  loadoutFor(chessRecord) {
    if (this.fieldsStandIn(chessRecord)) {
      return { ...resolveLoadout(null, this.gd.standIn(/** @type {string} */ (/** @type {ChessRecord} */ (chessRecord).chessId)), (id) => this.gd.standIn(id) || this.gd.chess(id)), potential: null, cultivate: null };
    }
    const rec = chessRecord && chessRecord.isDiy && typeof chessRecord.chessId === 'string' ? this.gd.chess(chessRecord.chessId) || chessRecord : chessRecord;
    // 0.2.2: with the operator's potential / 练度 (null for a prototype 自选 pick) — the 自选 summons' hand count reads it
    const cv = this.cultivationFor(chessRecord);
    return { ...resolveLoadout(this.loadout, rec, (id) => this.gd.chess(id)), potential: cv ? cv.potential : null, cultivate: cv ? cv.cultivate : null };
  }

  /**
   * Replace the not-owned list (0.2.0 补位; the seat's list at the match start — the setting never changes during a
   * match): keeps the droppable chess (checkNotOwned) whose stand-in this match's data has. Bots own every operator.
   * @param {any} list base chess ids
   * @returns {boolean} false when the list is malformed (nothing changes) or the player is a bot
   * @this {PlayerState}
   */
  setNotOwned(list) {
    if (this.isBot) return false;
    const res = checkNotOwned(list, (id) => this.gd.chess(id));
    if (!res || !res.ok) {
      this.m.log?.warn?.(`[match ${this.m.roomCode}] not-owned list of ${this.playerId} ignored: ${res && res.detail}`);
      return false;
    }
    const ids = res.notOwned.filter((id) => !!this.gd.standIn(id));
    this.standIns = Object.freeze(ids);
    this._standInSet = new Set(ids);
    return true;
  }

  /**
   * Whether this player's piece of chess record (or id) `rec` fights as its stand-in (0.2.0 补位): its base chess is
   * in `standIns` and the data has the stand-in. Normal and elite alike (the elite uses the same backup).
   * @param {ChessRecord|string|null} rec
   * @this {PlayerState}
   */
  fieldsStandIn(rec) {
    if (!this._standInSet || this._standInSet.size === 0 || !rec) return false;
    const r = typeof rec === 'string' ? this.gd.chess(rec) : rec;
    if (!r || typeof r.chessId !== 'string') return false;
    return this._standInSet.has(r.baseId || r.chessId) && !!this.gd.standIn(r.chessId);
  }

  /**
   * The record this player's piece of chess record `rec` fights with (0.2.0 补位): the stand-in record
   * (gd.standIn — the chess's identity, the stand-in's body) when the player fields its stand-in; for a DIY slot record
   * the player's 自选 record of that slot (this.gd — a caller holding the match's own record of the slot gets the
   * operator); else `rec` itself. Rules about the unit's body read it (placement class, summon / bot ranges), and so
   * does what shows the piece (the scouting art, the elite / gift tickers' names — the owner's recall of 2026-10-06: the official
   * mode shows the stand-in everywhere); rules about the chess (price, bonds, 特质, merges, pools) keep reading gd.chess.
   * @param {ChessRecord|null} rec
   * @this {PlayerState}
   */
  fieldRecord(rec) {
    if (rec && this.fieldsStandIn(rec)) return this.gd.standIn(/** @type {string} */ (rec.chessId)) || rec;
    if (rec && rec.isDiy && !rec.diyFor && typeof rec.chessId === 'string') return this.gd.chess(rec.chessId) || rec;
    return rec;
  }

  /**
   * What this player's chess id fields as, for a page that draws it by id (the settlement's rows, unitTally.js rowOf;
   * the leader ranking, views.js _leaderTopView; the elite's bubble, acquire.js): `diy` = a 自选 slot's pick (the id is
   * the slot), `standInFor` = the replaced operator's charId of a 补位 stand-in; {} when the id draws itself.
   * @param {string} chessId
   * @returns {{ diy?: { charId: string, skillIndex: number, uniEquipId: string|null }, standInFor?: string }}
   * @this {PlayerState}
   */
  fieldedAs(chessId) {
    const pick = typeof this.diyPickOf === 'function' ? this.diyPickOf(chessId) : null;
    if (pick) return { diy: { charId: pick.charId, skillIndex: pick.skillIndex, uniEquipId: pick.uniEquipId } };
    if (this.fieldsStandIn(chessId)) {
      const si = this.gd.standIn(chessId);
      if (si && typeof si.standInFor === 'string') return { standInFor: si.standInFor };
    }
    return {};
  }

  /**
   * Operator skins (docs/rules/upstream.md 「오퍼레이터 스킨」): replace this player's outfits `{ [charId]: skinId }`. A
   * malformed map (shared/protocol.js isSkinSelection) is refused whole and leaves `this.skins` as it was; a charId this
   * match's content does not have is dropped; an empty map clears. Bots wear the default models. No dirty() here: the
   * constructor calls it too — Match.setSkins marks the views.
   * @param {any} skins
   * @returns {boolean} false when refused (nothing changes)
   * @this {PlayerState}
   */
  setSkins(skins) {
    if (this.isBot) return false;
    const ids = operatorCharIds(this.m.gd.raw);
    const res = checkSkinSelection(skins, (id) => ids.has(id));
    if (!res.ok) return false;
    this.skins = Object.freeze({ ...res.skins });
    return true;
  }

  /**
   * The outfit this player wears for a chess piece, or null — the one rule the battle input and every view ask, so a
   * piece's skin cannot differ between the prep board, a teammate's scout and the field. Keyed by the operator of the
   * piece's body: a 补位 stand-in's body (fieldRecord), a 自选 slot's pick (`charId`, which wins when given — a slot's
   * own record has none). [ASSUMED·자료 없음: the official mode has no outfit choice to compare; a stand-in wears the
   * outfit chosen for its body's operator, as upstream]
   * @param {ChessRecord|string|null} rec a chess record or id @param {string|null} [charId]
   * @returns {string|null}
   * @this {PlayerState}
   */
  skinFor(rec, charId = null) {
    const skins = this.skins;
    if (!skins) return null;
    let key = typeof charId === 'string' && charId ? charId : null;
    if (!key) {
      const r = this.fieldRecord(typeof rec === 'string' ? this.gd.chess(rec) : rec);
      key = r && typeof r.charId === 'string' && r.charId ? r.charId : null;
    }
    return key && Object.hasOwn(skins, key) ? skins[key] : null;
  }

  /**
   * Deploy classes of the board tiles (server/match/board.js buildDeployMap) on the field the player deploys on now
   * (Match.deployFieldOf: the own board, or its half of the boss field in a boss round — user playtest #5 item 7).
   * A change of that field (the boss round begins, a re-pairing) re-checks the board's legality like a terrain change.
   * @this {PlayerState}
   */
  deployMap() {
    /** @type {'normal'|'bossL'|'bossR'} */
    const field = typeof this.m.deployFieldOf === 'function' ? this.m.deployFieldOf(this) : 'normal';
    if (this._deployMap && this._deployField !== undefined && this._deployField !== field) {
      this._deployMap = null;
      this._legalityStale = true;
    }
    // 宝藏探机's chests close their tiles (Match.deployMapFor): one placed or touched changes the map
    /** @type {string} */
    const chests = typeof this.bandChestsNow === 'function' ? this.bandChestsNow().map((x) => x.id).join() : '';
    if (this._deployMap && (this._deployChests ?? '') !== chests) this._deployMap = null;
    /** @type {string | undefined} */
    this._deployChests = chests;
    if (!this._deployMap) this._deployMap = this.m.deployMapFor(this, field);
    /** @type {'normal'|'bossL'|'bossR'|undefined} */
    this._deployField = field;
    return this._deployMap;
  }
  /**
   * The board's terrain changed (terrain 机变 cards, content device / tile overrides): legality is re-checked at the
   * next recompute() / battleInput() — after the whole change, so an intermediate state of a card that toggles several
   * devices never moves a piece.
   * @this {PlayerState}
   */
  invalidateDeployMap() { this._deployMap = null; this._legalityStale = true; }

  /**
   * After a terrain change, pieces standing on tiles they may no longer occupy (a melee operator on a tile that became
   * a 射击台, anything on a tile that became undeployable) are withdrawn like 撤退: an operator goes to the hand
   * (overflow temp — a passive move; the player re-places it during the prep), its summons leave the board with it; a
   * summon returns to its owner's stack. Nothing is lost: with the hand and the visible temp row both full the piece
   * joins the expandable overflow queue (PRTS 卫戍协议/帮助 §手牌区).
   * @returns {number} pieces moved
   * @this {PlayerState}
   */
  _evictIllegal() {
    this._legalityStale = false;
    const names = [];
    let moved = 0;
    for (const kind of ['chess', 'token']) {
      for (const { r, c, piece } of boardOrder(this.board)) {
        if (piece.kind !== kind || this._legal(piece, r, c)) continue;
        const key = tileKey(r, c);
        this.board.delete(key);
        const ok = kind === 'chess' ? !!this.stow(piece, { allowTemp: true }) : this._returnToken(piece);
        if (!ok) { this.board.set(key, piece); continue; }
        moved++;
        if (kind === 'chess') {
          this.removeTokensOf(piece.uid);
          const rec = this.gd.chess(piece.id);
          names.push(rec && rec.name ? rec.name : piece.id);
        }
      }
    }
    if (names.length) this.m.toast(this, 'warn', msg('地形变化：{names}无法停留在原位置，已撤回整备区', { names: names.map(dn) }));
    return moved;
  }

  /** @this {PlayerState} */
  dirty() { this.m.markPrivate(this); }
}
