// Local patch: what this server adds to the shared constants and the wire protocol, kept out of the upstream files
// (shared/constants.js, shared/protocol.js) so that merging upstream releases stays conflict-free. protocol.js only
// imports extendProtocol and calls it once at its end.
//
//   room chat      room.chat { text } → room.chat { seq, playerId, name, text, at, faction, kind?, spectator? };
//                  room.chatlog { lines } (the recent lines, to a member who joins or resyncs)
//   chat faction   room.chatFaction { faction } → room.factions { factions: { [playerId]: factionId } } (all members,
//                  whenever it changes, and to whoever joins); cleared when the match ends
//   emote sets     g.emote { id, set? } — 'user' pictures (shared/emote-art.js), missing = official
//   console        room.setConsole { on } (a solo room, before its match → room.state `console`) · con.funds { on } ·
//                  con.addChess { chessId, golden? } · con.addDiy { charId, tier, golden?, skill?, module? } · con.addItem { itemId, golden? } ·
//                  con.addEnemy { enemyKey, count? } · con.clearEnemies { enemyKey? } · con.jumpRound { round } · con.presetBoard { bondId?, layers } ·
//                  con.setBoss { final?, hidden? } · con.setLayers { bondId, layers } · con.resetLayers {} · con.end { to, victory? } —
//                  콘솔 모드: a console match's player, or any player in local debug mode (server/local-console.js)
//   restart        server.restart { inMs, mark? } (every connected socket; inMs null = called off) + welcome `restart: { inMs }`
//                  while a countdown runs — the deploy's server-restart notice (server/local-restart.js)
//   generation     server.gen { id, state } (every connected socket when the server starts draining) + welcome
//                  `gen: { id, state }` on a named server — deploys that keep running matches (server/local-generation.js)
//   feedback       fb.send { id, kind, text, diag?, battles?, match?, public? } → ok — the settlement screen's 피드백 보내기, stored in
//                  the server's inbox (server/local-feedback.js); welcome `feedback: true` while the inbox is on, `feedbackIssues`
//                  (a repository's issue list) while reports sent with `public` become issues there (server/feedback-relay.js)

import { EMOTE_SETS } from './emote-art.js';
import { APP_VERSION } from './constants.js';
import { N_ } from './i18n.js';
import { DEFAULT_SEASON, seasonOf } from './seasons.js';

// local version (docs/rules/README.md 「버전 표기」): since 1.2.0 it is APP_VERSION (shared/constants.js) itself — the hard
// fork has no upstream base to show beside it. Kept for /healthz `local` and the feedback records, which the operator's deploy and
// feedback scripts read (a server before 1.2.0 sends its own number there and the upstream base as `app`).
/** @returns {string} the version */
export const localVersion = () => APP_VERSION;

/**
 * The strengthened (进阶) form a normal item really has, or null. An item that never merges (upgradeNum 100: 寻呼模块,
 * 信标, 拟态物质, 突变细胞, 人事部文档, 变形同构体) has none: 盟约's table still lists a golden record for them with the same
 * text, 规程's dropped it; the merge never reaches it (PlayerState._itemMergeable's `n < 100`). The console offers only these.
 * @param {any} rec items.json record
 * @returns {string|null}
 */
export function strengthenedItemId(rec) {
  if (!rec || rec.isGolden) return null;
  const n = rec.upgradeNum;
  if (Number.isInteger(n) && n >= 100) return null;
  const gid = rec.upgradeChessId || rec.goldenId;
  return gid && gid !== rec.id ? gid : null;
}

// the deploy's restart countdown (server/local-restart.js, public/js/ui/restartNotice.js): in its last RESTART_FINAL_MIN
// minutes no new match starts and the connection banner counts down (maintainer 2026-10-09: 「재시작 직전 5분 전에 판을 막고,
// 5분부터는 띠도 표시」)
export const RESTART_FINAL_MIN = 5;

// room chat: a line's length in code points, the per-player gap between lines, the lines a (re)joining member gets back
export const CHAT_MAX_LEN = 120;
export const CHAT_COOLDOWN_MS = 700;
export const CHAT_HISTORY = 40;

// feedback (server/local-feedback.js, public/js/ui/feedback.js): the kinds, the text's length in code points, and the
// sizes of the attachments in UTF-16 units — the whole fb.send frame must stay under the socket's 64 KB inbound limit
// (server/http/websocket.js): text ≤ 2000 code points (≤ 8 KB as UTF-8 JSON), diag ≤ 14000, battles ≤ 38000 base64
export const FEEDBACK_KINDS = Object.freeze(['bug', 'idea', 'other']);
export const FEEDBACK_TEXT_MAX = 2000;
export const FEEDBACK_DIAG_MAX = 14000;
export const FEEDBACK_BATTLES_MAX = 38000;

// b.snap unit flag bit beside shared/constants.js UF: the see-through state (UF.STEALTH) is 迷彩 (위장, buffs.js camou),
// not 隐匿 — render/units.js shows its own icon (docs/LOCAL-PATCH.md "위장 아이콘"). Set only when no 隐匿 is in effect.
export const UF_CAMOU = 1024;
// …and 起飞 (an airborne operator, buffs.js `liftoff`: 予愿安洁莉娜's skills, 凯尔希·思衡托's talent, 蒂比 …): render/units.js draws it at the
// flyers' height (FLY_HOVER) — the client lifts it as it does a flying unit (maintainer decision 2026-10-11; evidence: 予愿安洁莉娜 S3's
// range ring is authored 0.666 below / 0.414 in front of her feet, which puts it on her tile only from that height — docs/rules/render.md
// 「이륙 높이」)
export const UF_LIFTOFF = 2048;

// chat faction: a colored tag a player may pick for their chat lines and avatar, cleared when the match ends;
// `bond` is the nation bond whose icon (data/assets.json bonds) shows it. Every season's (the colors are ours, not the
// official game's — 乌萨斯 / 伊比利亚 / 莱塔尼亚 maintainer decision 2026-11-13); a season offers its own nation bonds
// (chatFactionsOf: 盟约 the first eight, 规程 has no 拉特兰 and adds the last three — maintainer decision 2026-11-13).
export const CHAT_FACTIONS = Object.freeze([
  { id: 'yan', name: N_('炎国'), color: '#ff3b42', bond: 'yanShip' },
  { id: 'sargon', name: N_('萨尔贡'), color: '#b87850', bond: 'sargonShip' },
  { id: 'victoria', name: N_('维多利亚'), color: '#ff782f', bond: 'victoriaShip' },
  { id: 'kjerag', name: N_('谢拉格'), color: '#43acec', bond: 'kjeragShip' },
  { id: 'laterano', name: N_('拉特兰'), color: '#ff4d91', bond: 'lateranoShip' },
  { id: 'aegir', name: N_('阿戈尔'), color: '#009fb2', bond: 'egirShip' },
  { id: 'siracusa', name: N_('叙拉古'), color: '#4776df', bond: 'siracusaShip' },
  { id: 'kazimierz', name: N_('卡西米尔'), color: '#d8b400', bond: 'kazimierzShip' },
  { id: 'ursus', name: N_('乌萨斯'), color: '#c8ccd2', bond: 'ursusShip' },
  { id: 'iberia', name: N_('伊比利亚'), color: '#2fb67a', bond: 'iberiaShip' },
  { id: 'lethania', name: N_('莱塔尼亚'), color: '#9a6ae0', bond: 'lethaniaShip' },
].map((f) => Object.freeze(f)));
/** Chat faction record of an id (any season's), or null (safe for any input). */
export const chatFaction = (id) => (typeof id === 'string' && CHAT_FACTIONS.find((f) => f.id === id)) || null;

/** The chat factions of each season: its nation bonds (bonds.json `bondType` SEASON — test/chat-factions.test.js). */
const SEASON_CHAT_FACTIONS = Object.freeze({
  act2autochess: Object.freeze(['yan', 'sargon', 'victoria', 'kjerag', 'laterano', 'aegir', 'siracusa', 'kazimierz'].map(chatFaction)),
  act3autochess: Object.freeze(['yan', 'sargon', 'victoria', 'kjerag', 'aegir', 'siracusa', 'kazimierz', 'ursus', 'iberia', 'lethania'].map(chatFaction)),
});
/** The chat factions a season offers (the default season's for an unknown one). @param {unknown} season */
export const chatFactionsOf = (season) => SEASON_CHAT_FACTIONS[seasonOf(season)] || SEASON_CHAT_FACTIONS[DEFAULT_SEASON];
/** A chat faction of that season, or null. @param {unknown} id @param {unknown} season */
export const seasonChatFaction = (id, season) => (typeof id === 'string' && chatFactionsOf(season).find((f) => f.id === id)) || null;

const isStr = (v, max) => typeof v === 'string' && v.length <= max;
const optional = (check) => (v) => v === undefined || check(v);

/** Server → client message types this patch adds (protocol.js S2C). */
export const LOCAL_S2C = Object.freeze(['room.chat', 'room.chatlog', 'room.factions', 'server.restart', 'server.gen']);

/**
 * Add this patch's messages to the protocol tables (called once by shared/protocol.js, after both are defined). An
 * upstream g.emote spec keeps its own fields; only the optional `set` is added.
 * @param {Record<string, any>} C2S
 * @param {string[]} S2C
 */
export function extendProtocol(C2S, S2C) {
  // the server trims a line to CHAT_MAX_LEN code points (UTF-16 ×2 here, plus room for whitespace it collapses)
  C2S['room.chat'] = { text: (v) => isStr(v, CHAT_MAX_LEN * 4) };
  C2S['room.chatFaction'] = { faction: (v) => !!chatFaction(v) };
  // 콘솔 모드 (server/local-console.js consoleIntent checks who may send them: a console match's player, or local debug mode)
  C2S['room.setConsole'] = { on: (v) => typeof v === 'boolean' };
  C2S['con.funds'] = { on: (v) => typeof v === 'boolean' };
  C2S['con.end'] = { to: (v) => v === 'lobby' || v === 'result', victory: (v) => typeof v === 'boolean', $optional: ['victory'] };
  C2S['con.addDiy'] = {
    charId: (v) => typeof v === 'string' && /^char_[A-Za-z0-9_]{1,40}$/.test(v),
    tier: (v) => v === 5 || v === 6,
    golden: (v) => typeof v === 'boolean',
    skill: (v) => Number.isInteger(v) && v >= 0 && v <= 2,
    module: (v) => typeof v === 'string' && /^[A-Za-z0-9_\-]{1,64}$/.test(v),
    $optional: ['golden', 'skill', 'module'],
  };
  C2S['con.addChess'] = {
    chessId: (v) => typeof v === 'string' && /^chess_[A-Za-z0-9_]{1,60}$/.test(v),
    golden: (v) => typeof v === 'boolean',
    $optional: ['golden'],
  };
  C2S['con.addItem'] = {
    itemId: (v) => typeof v === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(v),
    golden: (v) => typeof v === 'boolean',
    $optional: ['golden'],
  };
  C2S['con.addEnemy'] = {
    enemyKey: (v) => typeof v === 'string' && /^enemy_[A-Za-z0-9_]{1,60}$/.test(v),
    count: (v) => Number.isInteger(v) && v >= 1 && v <= 20,
    $optional: ['count'],
  };
  C2S['con.clearEnemies'] = { enemyKey: (v) => typeof v === 'string' && /^enemy_[A-Za-z0-9_]{1,60}$/.test(v), $optional: ['enemyKey'] };
  C2S['con.jumpRound'] = { round: (v) => Number.isInteger(v) && v >= 1 && v <= 99 };
  C2S['con.presetBoard'] = {
    bondId: (v) => typeof v === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(v),
    layers: (v) => ['keep', 'normal', 'strong', 'max'].includes(v), // server/local-debug-board.js DEBUG_LAYER_LEVELS
    $optional: ['bondId'],
  };
  C2S['con.setBoss'] = {
    final: (v) => typeof v === 'string' && /^boss_[A-Za-z0-9_]{1,40}$/.test(v),
    hidden: (v) => typeof v === 'string' && /^boss_[A-Za-z0-9_]{1,40}$/.test(v),
    $optional: ['final', 'hidden'],
  };
  C2S['con.setLayers'] = {
    bondId: (v) => typeof v === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(v),
    layers: (v) => Number.isInteger(v) && v >= 0 && v <= 99999,
  };
  C2S['con.resetLayers'] = {};
  // the settlement screen's feedback (server/local-feedback.js checks the sender and cleans the text)
  C2S['fb.send'] = {
    id: (v) => typeof v === 'string' && /^[a-z0-9]{8}$/.test(v),
    kind: (v) => FEEDBACK_KINDS.includes(v),
    text: (v) => isStr(v, FEEDBACK_TEXT_MAX * 2) && v.trim().length > 0,
    diag: (v) => isStr(v, FEEDBACK_DIAG_MAX),
    battles: (v) => isStr(v, FEEDBACK_BATTLES_MAX) && /^[A-Za-z0-9+/]*={0,2}$/.test(v),
    match: (v) => isStr(v, 32) && /^[a-z0-9-]*$/.test(v),
    public: (v) => v === true,
    $optional: ['diag', 'battles', 'match', 'public'],
  };
  if (C2S['g.emote']) C2S['g.emote'] = { ...C2S['g.emote'], set: optional((v) => EMOTE_SETS.includes(v)) };
  for (const t of LOCAL_S2C) if (!S2C.includes(t)) S2C.push(t);
}
