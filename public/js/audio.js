// Audio manager (Web Audio): BGM per phase, UI SFX, per-unit battle SFX, operator battle voice. Never throws.
//
// Sources: data/assets.json → audio (docs/ASSETS.md):
//   bgm { lobby, prep, combat, combatAlts?: [ {intro?, loop}, … ], boss: { intro?, loop } },
//   bossBgm { [bossId]: { intro?, loop } },
//   voice { [charId]: { start, faceEnemy, select, place, skill1…skill4, squad, squadFirst, result*, gacha } },
//   sfx.ui { click, buy, sell, refresh, freeze, levelup, merge, equip, ready, timer, yourTurn, … },
//   sfx.battle { deploy, tokenDeploy, charDie, tokenDie?, enemyDie, enemyHit, heal, killCoin, … },
//   sfx.units { [charId|tokenId|enemyId]: { attack?, hit?, skill?, die?, born?, mix?: { [role]: { p?, vol? } } } }.
//
// - The AudioContext is created on the first user gesture (pointerdown/keydown/touchend), so browsers
//   never block or warn; everything requested before that is remembered (BGM) or dropped (SFX).
// - Channels: master → { bgm, sfx, voice, chat } gains; volumes from settings (0..1) + mute. Tab hidden ⇒ suspend
//   (except while `keepAwake` — the 랜덤 매칭 wait: UI sounds only, BGM and voice silent).
// - Chat notification (`chatNotification`, ui/chat.js): another player's new chat line plays the official emote sound
//   (`sfx.ui.emote`) on its own channel (settings 聊天提示音 / 提示音音量), one at a time and at most once per
//   `chatCooldown` s (settings 提示间隔, at least the sound's length + 0.5 s); a line arriving meanwhile is dropped,
//   never queued. A hidden tab plays none, `keepAwake` or not.
// - BGM: `intro` then `loop` (1 s crossfade); switching tracks fades out/in (0.8 s). The same loop URL
//   keeps playing across phases (prep and combat share a track).
// - 开战 BGM: `bgm.combatAlts` are the mode's own battle tracks (塞壬唱片 骑士之日 / 无畏者). The track is fixed per
//   round, not drawn: 无畏者 through rounds 1–7 and 骑士之日 from round 8 on (`combatTrackFor`, the official
//   schedule), so every client of a match hears the same one, a fight never switches track halfway through and the
//   联防 that follows a 作战 keeps its round's track.
// - 干员战斗语音 (`audio.voice`, user request): an operator says the official line of the moment it is in —
//   行动出发 start, 行动开始 faceEnemy, 选中干员 select, 部署 place, 作战中1-4 skillN and the settlement's
//   结算 result* (all battle-only; the 休整期 is silent). Voices are seconds long and a battle deploys eight
//   operators, then fires dozens of skills, so they run on their own channel (own gain, settings 干员语音) through
//   VoiceGate: one line at a time, a global gap, a per-unit per-slot cooldown, and a higher-priority line taking the
//   channel over — the official scheduling of `audio_data.json battleVoice.voiceTypeOptions`.
// - Battle SFX from `b.ev` tuples (`handleBattleEvents`): (2026-10-10, docs/rules/audio.md 「효과음 재생: 피치·
//   동시 재생 상한」) the official SoundFXBank.Play — a bank at its maxSoundAllowed cuts its oldest sound for the new one
//   (popOldest) or drops the new one, and every play draws its pitch in the sound's [minPitch, maxPitch] (manifest
//   `sfx.bank`); no per-unit or per-URL gap. MAX_VOICES concurrent battle sounds at most (SfxLimiter).
// - Impact sounds (user playtest #4 item 6): a 'dmg' plays the `hit` sound of the unit whose hostile attack ('atk' on a
//   unit of the other side) aimed at the target — once, within IMPACT_WINDOW_MS, and only for phys / arts / true damage.
//   A heal "attack" ('atk' of a healer on an ally, chain heals) never makes the healer the author of the next damage
//   on that ally (纯烬艾雅法拉's heals made every later hit on a healed ally ring her impact sound), element gauge fills
//   and DoTs play none, and a chain bounce ('chain' / 'chainHeal': its first id is the previous target) plays no attack
//   sound of that target. An operator's attack / hit sound that is a skill-mode file of its own (official names end in
//   `_n` for the normal attack, `_d` / `_h` / `_s` for its skill modes — the manifest picked 纯烬艾雅法拉's S3 impact
//   p_imp_gtshpbrnch_s as her `hit`) never plays for a normal attack (normalAttackSfx).
// - The official bank mix of a unit's own attack / hit / die / born sound (`mix`, tools/assets/audio.mjs bankMix; community
//   report #30): it plays with chance `p` — 猎狗pro / 深池侦察犬's attack bank is 80 % silence, so they bark on about one
//   attack in five (never replaced by the generic enemy sound) — at its base gain × `vol`, capped at 1: an official volume
//   below 1 is quieter (妖怪's 0.7), none is louder than before (unitGain).
// - Deaths/deployments follow the official per-class defaults (unitSoundClass): only operators play the
//   operator-knocked-down sound; summons use the token sounds; a summon used up by its own effect (fx `consumed`,
//   香槟炸弹) plays its impact sound instead of a death sound.
// - Buffers are fetched once and cached (LRU); failed fetch/decode ⇒ silent (logged once as a warning).
//
// `bgmKeyFor(route, pub)` picks the track for the current screen/phase (main.js calls `audio.install()`,
// which follows the store).

import { PHASE, PREBUILT_INTERVAL } from '../../shared/constants.js';
import { mediaUrl } from './media.js';
import { officialGain, groupGain, battleGain, modeEntry, BATTLE_GROUP, VOICE_GAIN, startSkillLoop, stopSkillLoop, stopSkillLoops, skillLoopOf, loopGain, stopUnitLoops, skillExtrasOf, dollSwitchSfx, bankPlayOf, playPitch, skillEndOf, modeOn, roleGroup, cueSetOf, cueAbility, pickVariant, cuesAt, cueFile } from './audioOfficial.js'; // local patch: official mix + skill-mode sounds + skill loops / extras + bank play values
import { holdSnapshot, sfxOut, snapshotHookOf } from './audioSnapshot.js'; // local patch: mixer snapshots (归溟幽灵鲨's 替身 switch)

/**
 * 2026-10-10: concurrent battle sounds at most [추정: Unity's default real voice count 32 — the client's own
 * setting is not in its data]; the old 8 + 160 ms per unit + 45 ms per URL + 2 per URL had no official basis.
 */
const MAX_VOICES = 32;
/** A bank the manifest has no values for: the official majority (maxSoundAllowed 2, popOldest — 9,950 of 13,000 banks). */
const DEFAULT_BANK = Object.freeze([1, 1, 2, 1]);
/**
 * The bond layer-up cue (`bondUp`, upstream #482; docs/rules/audio.md 「맹약 층 효과음」): the official bank
 * battle.ON_ACT1AUTOCHESS_ADD_BOND holds one sound (maxSoundAllowed 1, popOldest) — one channel, a new cue cuts the one on
 * air, no cooldown. BOND_BANK is its SfxLimiter key; BOND_POP its values when the manifest has none for the file.
 */
const BOND_BANK = 'ui:bondUp';
const BOND_POP = Object.freeze({ max: 1, pop: true });
/** Its volume (the activation cue's since before #482). */
const BOND_VOLUME = 0.7;
/** A second trigger of one preparation update (a layer gain and a bond turning on) within this many ms keeps the cue. */
const BOND_SAME_UPDATE_MS = 400;
/** local patch: a battle 'deploy' this soon (real ms) after a prep drop-in of the same model stays silent (round start). */
const PREP_DEPLOY_OVERLAP_MS = 1500;
/**
 * The battle-start deployment (docs/rules/audio.md 「오퍼레이터 음성」): the sim deploys one piece group every PREBUILT_INTERVAL
 * game s (server/sim/battle/lifecycle.js _prebuiltStep, client `_Prebuilt`) and starts the wave clock one interval after the
 * last — the client's ON_BATTLE_STARTED, which has no event of its own. A field's opening = its first deploys while each
 * comes within one interval (+ OPENING_SLACK_MS of delivery jitter) of the one before; the battle start's line plays
 * when that much time passed after the last.
 */
const OPENING_SLACK_MS = 80;
/** The first of these events in a field ends its opening deployment (the fighting began). */
const OPENING_ENDS = new Set(['atk', 'dmg', 'die', 'leak']);
/**
 * 漏怪: the original Arknights exit alarm (`sfx.battle.leak`, `battle/b_ui/b_ui_alarmenter`) runs **1.44 s**, and the
 * official bank is a one-shot: `battle.ON_ENEMY_REACHED_EXIT` carries `maxSoundAllowed: 1` with `popOldest: true` on the
 * `Battle_UI_Important` mixer, i.e. **never two at once** (a new escape replaces the one still ringing). We keep the
 * "never two at once" half and leave the rest of the cue alone: leaks closer together than the cue is long are the same
 * disaster and share one alarm, so a line that breaks costs one clear ring per 1.5 s instead of a stutter of restarts.
 * (The SFX limiter still applies on top.)
 */
const LEAK_SFX_GAP_MS = 1500;
const BUFFER_CACHE = 180;
/** Decoded-PCM budget of the buffer cache beside its entry count: a voice line decodes to 0.4–1.3 MB (see _buffer). */
const BUFFER_BYTES = 64 * 1024 * 1024;
const XFADE_S = 1;
const FADE_S = 0.8;
/** Voice: shortest gap between two lines, and the crossfade of a higher-priority line taking the channel (official 0.1 s). */
const VOICE_GAP_MS = 1200;
const VOICE_XFADE_S = 0.1;
/** 'atk' projectile kinds whose first id is the previous bounce target (sim ai.js), not the attacker. */
const CHAIN_KINDS = new Set(['chain', 'chainHeal']);
/** 'dmg' types that are an attack's impact (element gauge fills / 元素伤害 carry the element's name instead). */
const IMPACT_TYPES = new Set(['phys', 'arts', 'true']);

/**
 * local patch: the `sfx.kit` key of a kit's skill hit (tools/assets/kit-sfx.mjs) for a battle.fx event, or null.
 * @param {string} fx the fx kind (b.ev ['fx', kind, x, y, extra])
 * @param {any} ex its extra
 * @param {(id: any) => ({ def?: string, skillIndex?: number|null }|undefined)} unitOf the tracked unit of an id
 */
export function kitHitKey(fx, ex, unitOf) {
  if (!ex || typeof ex !== 'object') return null;
  const def = (id) => unitOf(id)?.def || '';
  switch (fx) {
    case 'kitHit': return typeof ex.k === 'string' ? ex.k : null;
    // local patch (maintainer report 2026-10-07): S1's impact is its DoT's (kitHit wang:1, every tick — client
    // wang_stone1_t[damage_audio]); the pop itself sounds through kitStartKey
    case 'zone': return ex.token === 'token_10064_wang_stone1' && [2, 3].includes(ex.skill) ? `wang:${ex.skill}` : null;
    case 'wangLink': return ex.first ? 'wang:link' : null;
    case 'swordStorm': return ex.id != null && def(ex.id) === 'char_1050_chen3' ? 'chen3:s2' : null;
    // local patch (maintainer report 2026-10-07): 蕾缪安 S3 — the bombardment's start (first shell), each landing, the lock
    // mark (S2's aim lock sends the same fx: only while her S3 is equipped)
    case 'bombardShell': return def(ex.id) === 'char_1035_wisdel' ? 'wisdel:s2' : def(ex.id) === 'char_4193_lemuen' && ex.i === 0 ? 'lemuen:s3end' : null;
    case 'bombard': return def(ex.id) === 'char_4193_lemuen' ? 'lemuen:shell' : null;
    case 'lock': { const u = unitOf(ex.src); return u?.def === 'char_4193_lemuen' && u.skillIndex === 2 ? 'lemuen:mark' : null; }
    case 'explode': return def(ex.by) === 'char_1035_wisdel' ? 'wisdel:bomb' : null;
    case 'burst': return def(ex.id) === 'token_10035_wisdel_wward' ? 'wisdel:token' : null;
    case 'oblvnsNote': return ex.e === 'hit' && typeof ex.m === 'string' ? `oblvns:${ex.m}` : null;
    case 'drone': {
      const u = unitOf(ex.id);
      return u?.def === 'char_1038_whitw2' && Number.isInteger(u.skillIndex) ? `whitw2:s${u.skillIndex + 1}` : null;
    }
    // 2026-10-11, docs/rules/audio.md 「재능·소환물 능력 소리」: 실버애쉬 더 레인프로스트 S2's slash — its ability's ON (no attack event);
    // 크루스 더 킨 글린트's 中的 shot — her talent ability's ON (the START: kitStartKey)
    case 'aoe': return ex.skill === 'svash2' && def(ex.id) === 'char_1045_svash2' ? 'svash2:s2' : null;
    case 'crit': return ex.by != null && def(ex.by) === 'char_1021_kroos2' ? 'kroos2:t1' : null;
    default: return null;
  }
}
/**
 * local patch (maintainer report 2026-10-07): the sound a kit plays as its skill goes off, before / beside its impact
 * (kitHitKey) — 望's stone pop: a placed stone's sktok_wang_<n> ON_ABILITY_START (p_atk_stwctp_d / _h / _s); a 跟子 (a
 * projectile of hers) sounds the same file through its projectile_chr_wang_stone<n> bank, but for S2
 * (ON_PROJECTILE_BEHAVIOUR_TRIGGER, p_atk_stwctps_h). A 跟子 landing (summon fx `follower`): ON_PROJECTILE_BORN.
 * 2026-10-11: 크루스 더 킨 글린트's 中的 shot (fx 'crit' `by` her) — her talent ability T.1's START [추정: the sim rolls the talent
 * as the shot lands, so START sounds with its ON there, not at the swing].
 * @param {(id: any) => ({ def?: string }|undefined)} [unitOf] the tracked unit of an id
 * @returns {string|null} sfx.kit key
 */
export function kitStartKey(fx, ex, unitOf = () => undefined) {
  if (!ex || typeof ex !== 'object') return null;
  if (fx === 'zone' && ex.token === 'token_10064_wang_stone1' && [1, 2, 3].includes(ex.skill)) return ex.follower && ex.skill === 2 ? 'wang:2fs' : `wang:${ex.skill}s`;
  if (fx === 'summon' && ex.follower) return 'wang:thrown';
  if (fx === 'crit' && ex.by != null && unitOf(ex.by)?.def === 'char_1021_kroos2') return 'kroos2:t1s';
  return null;
}
/**
 * 2026-10-11, docs/rules/audio.md 「재능·소환물 능력 소리」: the sfx.kit keys of a talent's own attack — sim 'atk' 5th field `signal`
 * (Battle.forceAttack, docs/SIM.md) — of unit model `def`, played instead of its normal attack's cues, or null. 이그제큐터 디 엑스
 * 포에데레's 受选之人 extra shot: ON_ABILITY_START.char_1032_excu2.T.1 (the ability has no ON / HIT bank).
 */
export function talentAttackKeys(def, signal) {
  if (typeof signal !== 'string' || !signal) return null;
  return TALENT_ATTACK_KEYS[def]?.[signal] ?? null;
}
const TALENT_ATTACK_KEYS = Object.freeze({ char_1032_excu2: Object.freeze({ 'T.1': Object.freeze(['excu2:t1']) }) });
/**
 * 2026-10-11, docs/rules/audio.md 「재능·소환물 능력 소리」: the prefab mode a summon attacks in (`sfx.units[def].tm[name]`) — 뮤엘시스's
 * 流形 after its copy (sim fx 'copy' `mode` Melee / Range, its owner `by`): Melee_S3 while her S3 runs, Range_S2 while her S2 runs
 * (buff templates mlyss_wtrman_switch_melee / _range: SwitchMode 5 / 4 when the owner holds mlyss_s_3[buff] / mlyss_s_2[buff];
 * mlyss_s_3[token_buff_melee_finish] / mlyss_s_2[token_buff_range_finish] switch back as it ends). null = its Default.
 * @param {{ tmode?: string|null }} su the tracked summon @param {{ skillOn?: boolean, skillIndex?: number|null }|undefined} owner
 */
export function tokenModeName(su, owner) {
  const m = su?.tmode;
  if (m !== 'Melee' && m !== 'Range') return null;
  if (owner?.skillOn && m === 'Range' && owner.skillIndex === 1) return 'Range_S2';
  if (owner?.skillOn && m === 'Melee' && owner.skillIndex === 2) return 'Melee_S3';
  return m;
}
/**
 * 2026-10-10, docs/rules/audio.md 「버프·커스텀 트리거 소리」: the buff sound of tracked unit `su`'s attack moment `at` ('s' swing,
 * 'a' strike, 'd' its impact; `melee` = a melee strike) — an sfx.kit key (tools/assets/kit-sfx.mjs) or null. 혼 S2 / S3: every
 * strike sounds horn_s_<n>[overload|normal][melee|ranged].attack (buff template horn_s_<n>[signal_melee|signal_ranged], event
 * ON_ABILITY_SPELL_ON); 락락 S2: rockr_s2_common_attack_start / _hit (+ _overload) at the swing / impact. `su.over` = the
 * running skill's 过载 (sim fx 'overload', signalFxKey).
 */
export function signalAttackKey(su, at, melee) {
  if (!su || !su.skillOn) return null;
  if (su.def === 'char_4039_horn' && at === 'a' && (su.skillIndex === 1 || su.skillIndex === 2)) {
    return `horn:${su.skillIndex + 1}:${su.over ? 'overload' : 'normal'}:${melee ? 'melee' : 'ranged'}`;
  }
  if (su.def === 'char_4040_rockr' && su.skillIndex === 1 && (at === 's' || at === 'd')) return `rockr:${at === 's' ? 'atk' : 'hit'}${su.over ? 'o' : ''}`;
  // 2026-10-11: 실버애쉬 더 레인프로스트 S3 — every strike fires projectile_chr_svash2_s3 (skill prefab projectile): its BORN
  if (su.def === 'char_1045_svash2' && su.skillIndex === 2 && at === 'a') return 'svash2:s3born';
  return null;
}
/**
 * 2026-10-10, docs/rules/audio.md 「버프·커스텀 트리거 소리」: the buff / custom-trigger sound a kit's fx stands for (an sfx.kit
 * key) — the 过载 start of 혼 S2 / S3 (horn_s_<n>[overload_start]) and 락락 S2 (rockr_overload_start), 티티 S3's wake-up burst on
 * an enemy (titi_s_3[awake]; 歌蕾蒂娅's own 'wake' names herself, no enemy), 圣聆初雪's snow tiles (snowRefreshed).
 */
export function signalFxKey(fx, ex, unitOf) {
  if (!ex || typeof ex !== 'object' || ex.id == null) return null;
  const u = unitOf(ex.id);
  if (fx === 'snow' && u?.def === 'char_1046_sbell2') return snowRefreshed(u, ex.cells) ? 'sbell2:snow' : null;
  if (fx === 'overload') {
    if (u?.def === 'char_4039_horn' && (u.skillIndex === 1 || u.skillIndex === 2)) return `horn:${u.skillIndex + 1}:ovs`;
    if (u?.def === 'char_4040_rockr') return 'rockr:ovs';
  }
  if (fx === 'wake' && u?.side === 'enemy') return 'titi:awake';
  // 2026-10-11: 뮤엘시스's 流形 — turning melee / ranged on its copy (mlyss_wtrman_s_begin's audio buffs), S3's pull pulse of a
  // melee copy (mlyss_s_3[melee_audio], ON_BUFF_TRIGGER)
  if (u?.def === 'token_10030_mlyss_wtrman') {
    if (fx === 'copy' && (ex.mode === 'Melee' || ex.mode === 'Range')) return ex.mode === 'Melee' ? 'mlyss:melee' : 'mlyss:range';
    if (fx === 'pulse') return 'mlyss:pull';
  }
  return null;
}
/** 圣聆初雪's tile effect by snow layers (render/fx/kitofficial.js SNOW_GROUND: 1 → _01, 2–4 → _02, 5 → _03; 0 none). */
const snowBand = (L) => (L >= 5 ? 3 : L >= 2 ? 2 : L >= 1 ? 1 : 0);
/**
 * 2026-10-16, docs/rules/fx.md 「키트 이벤트의 공식 이펙트」: whether a 'snow' event's `cells` [[x, y, layers]…] create a tile
 * effect anew — AttachListenerToTileAbility `_HoldCastedEffectOnTile` plays its `_audioSignal` (sbell2_snow_refresh_audio, at
 * her) after each effect it creates, not when the tile keeps its prefab nor when a tile empties. The tiles' effects are
 * kept on her audio record `u` (a new one per deployment, as the client clears them when she leaves).
 */
export function snowRefreshed(u, cells) {
  if (!u || !Array.isArray(cells)) return false;
  const tiles = (u.snow ||= new Map());
  let made = false;
  for (const c of cells) {
    if (!Array.isArray(c)) continue;
    const k = `${c[0]},${c[1]}`, b = snowBand(Number(c[2]) || 0);
    if (b && b !== tiles.get(k)) made = true;
    if (b) tiles.set(k, b); else tiles.delete(k);
  }
  return made;
}
/** A 'dmg' later than this (real ms) after the attack aimed at the target is not that attack's impact. */
const IMPACT_WINDOW_MS = 2500;
/**
 * 2026-10-10, docs/rules/audio.md 「공격 소리 신호」: the operators whose kit damage already sounds through
 * sfx.kit (kitHitKey / kitStartKey, tools/assets/kit-sfx.mjs) — their 'dmg' without an attack gets no skill impact cue too.
 */
const KIT_SOUND_DEF = /^(char_\d+_(wang|chen3|wisdel|oblvns|whitw2|lemuen|ghost2)|token_\d+_(wang|wisdel|oblvns|whitw2|lemuen|ghost2)\w*)$/;
/**
 * 2026-10-10: a skill-damage impact (a 'dmg' carrying its attacker with no attack of its own, docs/SIM.md) of one
 * attacker at most this often (real ms) [추정: the client sounds a skill's own impacts through its projectiles / abilities,
 * not per damage tick]. A DoT tick credited to its applier never gets here (2026-10-11: the 'dmg' 7th field, skipped first).
 */
const SKILL_HIT_GAP_MS = 120;
/** 2026-10-10: the game speed assumed before a swing → strike pair measured it (render/app.js local feed: 2). */
const DEFAULT_GAME_SPEED = 2;
/** Official operator sound files of a skill mode: `…_d` / `…_h` / `…_s` (+ digits) — the normal attack's end in `_n`. */
const SKILL_MODE_FILE = /_(d|h|s)\d*\.mp3$/i;

// ---- pure helpers (unit-tested) -----------------------------------------------------------------------

/**
 * BGM key for a route + match phase.
 * @param {'title'|'lobby'|'room'|'game'|string} route
 * @param {any} pub m.public (may be null)
 * @param {0|1|null} [combatTrack] the round's own 开战 track index into `bgm.combatAlts` (combatTrackFor; omitted ⇒
 *   plain 'combat', i.e. the manifest's default combat track)
 * @returns {string|null} 'lobby' | 'prep' | 'combat' | 'combat:<i>' | 'unite' | 'boss' | 'boss:<bossId>' | null
 */
export function bgmKeyFor(route, pub, combatTrack = null) {
  if (route !== 'game') return route === 'title' || route === 'lobby' || route === 'room' ? 'lobby' : null;
  const phase = pub?.phase;
  if (!phase) return 'lobby';
  switch (phase) {
    case PHASE.INFO_CHECK: case PHASE.BAND_DRAFT: case PHASE.BATTLE_CHECK: case PHASE.RESULT: case PHASE.LOBBY:
      return 'lobby';
    case PHASE.UNITE:
      // 联防 has its own track: the official `escaped_single` / `escaped_multi` levels declare
      // `bgmEvent = corrosion` (level_act1autochess_escaped_*.json), so the rescue phase is not the 作战's track.
      // resolveBgm falls back to `bgm.combat` when a manifest predates it.
      return 'unite';
    case PHASE.COMBAT:
      // 开战 BGM: the round's own track — 骑士之日 / 无畏者 are fixed per round, not drawn (combatTrackFor)
      return combatTrack == null ? 'combat' : `combat:${combatTrack ? 1 : 0}`;
    case PHASE.FINAL_ASSAULT:
      return pub.bossId ? `boss:${pub.bossId}` : 'boss';
    case PHASE.HIDDEN_CORE:
      return pub.hiddenBossId ? `boss:${pub.hiddenBossId}` : pub.bossId ? `boss:${pub.bossId}` : 'boss';
    default:
      return 'prep';
  }
}

/**
 * Resolve a BGM key to { intro?, loop } URLs from the manifest: `boss:<id>` falls back to the generic boss track,
 * `combat:<i>` to the i-th `bgm.combatAlts` entry (and to `bgm.combat` when the manifest has none), and `unite`
 * (联防's own track) to `bgm.combat` when the manifest predates it.
 * @param {any} manifest
 * @param {string|null} key
 * @returns {{ intro: string|null, loop: string }|null}
 */
export function resolveBgm(manifest, key) {
  const a = manifest?.audio;
  if (!a || !key) return null;
  let t = null;
  if (key.startsWith('boss:')) t = a.bossBgm?.[key.slice(5)] || a.bgm?.boss;
  else if (key.startsWith('combat:')) t = a.bgm?.combatAlts?.[Number(key.slice('combat:'.length))] || a.bgm?.combat;
  else if (key === 'unite') t = a.bgm?.unite || a.bgm?.combat;
  else t = a.bgm?.[key];
  if (!t || typeof t.loop !== 'string') return null;
  return { intro: typeof t.intro === 'string' ? t.intro : null, loop: t.loop };
}

/**
 * The last round that plays 无畏者 (1–7); from the next round on it is 骑士之日 (8–13) — the official schedule
 * (docs/ASSETS.md "BGM"; the two tracks are the 塞壬唱片 act13side battle themes).
 */
export const COMBAT_TRACK_SWITCH_ROUND = 7;

/**
 * The round's own 开战 track index into `bgm.combatAlts` (plan.mjs order: 0 = `m_bat_kazimierz2_1` 骑士之日,
 * 1 = `m_bat_kazimierz2_2` 无畏者). The mode does not draw these: the official schedule plays one per round, 无畏者
 * through the early rounds (1–7) and 骑士之日 from round 8 to the last normal round (8–13). Everything after that is
 * the boss rounds (最终攻势 / 隐秘核心), which have their own tracks and never ask for `combat:<i>`.
 * @param {number|null|undefined} round m.public.round
 * @returns {0|1|null} null when the round is unknown ⇒ the manifest's plain `combat` track
 */
export function combatTrackFor(round) {
  const r = Number(round);
  if (!Number.isFinite(r) || r < 1) return null;
  return r <= COMBAT_TRACK_SWITCH_ROUND ? 1 : 0;
}

/**
 * Official sound class of a battle unit (audio_data `battle.ON_UNIT_DEAD|BORN.<class>` defaults):
 * 'enemy' | 'char' (operators: b_char_dead “干员被击倒” / b_char_set) | 'token' (summons: b_char_tokendead /
 * b_char_tokenset) | 'device' (stage devices: the act crate trap_1105 dies with b_char_tokendead, no born sound).
 * Band map characters (预备干员-医疗 / Touch, `char_*` ids) are characters although the sim runs them as tokens.
 * @param {{ side?: string, kind?: string, defId?: string, def?: string }|null} info tracked unit (UnitInfo subset)
 */
export function unitSoundClass(info) {
  if (!info) return 'char';
  if (info.side === 'enemy') return 'enemy';
  const id = String(info.defId ?? info.def ?? '');
  if (info.kind === 'device') return 'device';
  if (info.kind === 'token') return /^char_/.test(id) ? 'char' : 'token';
  return 'char';
}

/** URL of the generic token death sound (b_char_tokendead): sfx.battle.tokenDie, else next to charDie. */
function tokenDieUrl(manifest) {
  const b = manifest?.audio?.sfx?.battle;
  if (typeof b?.tokenDie === 'string') return b.tokenDie;
  return typeof b?.charDie === 'string' && /b_char_dead\.mp3$/.test(b.charDie) ? b.charDie.replace(/b_char_dead\.mp3$/, 'b_char_tokendead.mp3') : null;
}

/**
 * Death sound of a battle unit ('die' event): the unit's own ON_UNIT_DEAD sound, else its class default — only
 * operators play the operator-knocked-down sound (charDie). A summon that fired and was used up (香槟炸弹: its
 * explosion is the sound) is silent, and so is an operator leaving without being knocked out, when the event says so
 * (`reason` ≠ 'killed').
 * @param {any} manifest data/assets.json
 * @param {{ side?: string, kind?: string, defId?: string, def?: string, boss?: boolean }|null} info
 * @param {{ consumed?: boolean, reason?: string|null }} [o]
 * @returns {string|null} sound URL
 */
export function deathSfxUrl(manifest, info, { consumed = false, reason = null } = {}) {
  if (!info || consumed) return null;
  const cls = unitSoundClass(info);
  if (cls === 'char' && reason && reason !== 'killed') return null;
  const own = manifest?.audio?.sfx?.units?.[info.def]?.die;
  if (typeof own === 'string') return own;
  const b = manifest?.audio?.sfx?.battle ?? {};
  if (cls === 'enemy') return (info.boss ? b.enemyDieHeavy : null) ?? b.enemyDie ?? null;
  if (cls === 'char') return typeof b.charDie === 'string' ? b.charDie : null;
  return tokenDieUrl(manifest);
}

/**
 * Deployment sound of an allied unit ('deploy' event): its own ON_UNIT_BORN sound, else operators b_char_set
 * (sfx.battle.deploy), summons b_char_tokenset (tokenDeploy); stage devices have none.
 * @returns {string|null}
 */
export function deploySfxUrl(manifest, info) {
  if (!info || info.side === 'enemy') return null;
  const own = manifest?.audio?.sfx?.units?.[info.def]?.born;
  if (typeof own === 'string') return own;
  const b = manifest?.audio?.sfx?.battle ?? {};
  const cls = unitSoundClass(info);
  if (cls === 'device') return null;
  const url = cls === 'token' ? (b.tokenDeploy ?? b.deploy) : b.deploy;
  return typeof url === 'string' ? url : null;
}

/**
 * Whether a unit's manifest `attack` / `hit` sound may play for its normal attacks: an operator's (`char_*`) sound file
 * of one of its skill modes (`_d` / `_h` / `_s`, see header) may not. Enemy files use `_h` for heavy weapons (always
 * allowed), and so may summons.
 * @param {string} defId the unit's model id (sfx.units key)
 * @param {string} url
 */
export function normalAttackSfx(defId, url) {
  return typeof url === 'string' && !(typeof defId === 'string' && defId.startsWith('char_') && SKILL_MODE_FILE.test(url));
}

/**
 * Gain of a unit's own sound with its manifest mix (sfx.units[id].mix[role]: the official bank's volume): `base` × `vol`,
 * never above `base` (a bank louder than 1 plays as before — community report #30 asked for quieter, not louder).
 * @param {number} base the role's base gain (attack / hit 0.55, die / born / skill 0.8)
 * @param {{ vol?: number }|null|undefined} mix
 */
export function unitGain(base, mix) {
  const v = mix && Number(mix.vol);
  return Number.isFinite(v) && v >= 0 ? base * Math.min(1, v) : base;
}

/**
 * Whether a unit's own sound plays this time: its official bank's chance `mix.p` (sounds with a file over all the weights;
 * 猎狗pro's attack bank 20 of 100). `roll` ∈ [0, 1).
 */
export function unitSoundPlays(mix, roll) {
  const p = mix && Number(mix.p);
  return !(Number.isFinite(p) && p >= 0 && p < 1) || roll < p;
}

/**
 * Voice priorities — the official battle voice types (`audio_data.json battleVoice.voiceTypeOptions`) mapped onto the
 * manifest's slots: BATTLE_START 100, BATTLE_FACE_ENEMY 90, SKILL_ACTIVE 70, PASSIVE_IMP 60, PASSIVE_NOR 50,
 * PLACE_CHAR 20, FOCUS_CHAR 10. The settlement lines are no battle voice of the official scheduler: they sit at 85,
 * above 作战中 (70) but below 接敌 (90), so a battle's last word is never cut off by an ordinary line. The four prep
 * slots (部署 / 编入队伍 / 任命队长 / 干员报到) keep their levels although the 休整期 is silent (see the header).
 */
export const VOICE_PRIORITY = Object.freeze({
  start: 100, faceEnemy: 90,
  skill1: 70, skill2: 70, skill3: 70, skill4: 70,
  resultFour: 85, resultThree: 85, resultTwo: 85, resultLose: 85,
  gacha: 60, squadFirst: 45, squad: 30, place: 20, select: 10,
});

/** Per-unit per-slot cooldowns (ms): the official 10 s of the 作战中 (passive skill) lines, 3 s between 接敌 lines. */
export const VOICE_COOLDOWN_MS = Object.freeze({
  start: 0, faceEnemy: 3000,
  skill1: 10000, skill2: 10000, skill3: 10000, skill4: 10000,
  resultFour: 0, resultThree: 0, resultTwo: 0, resultLose: 0,
  gacha: 0, squadFirst: 0, squad: 0, place: 0, select: 1500,
});

/**
 * The settlement slot of a finished 作战: 完美作战 ⇒ 3星结束行动 (绝境 / 终极 ⇒ 完成高难行动 instead), a leaked enemy
 * ⇒ 非3星结束行动, nothing killed at all ⇒ 行动失败.
 * @param {{perfect?:boolean, leaked?:number, killed?:number, total?:number, hard?:boolean}} [o]
 * @returns {'resultFour'|'resultThree'|'resultTwo'|'resultLose'}
 */
export function resultVoiceSlot(o = {}) {
  const leaked = Number.isFinite(o.leaked) ? o.leaked : 0;
  const killed = Number.isFinite(o.killed) ? o.killed : 0;
  const total = Number.isFinite(o.total) ? o.total : 0;
  if (o.perfect) return o.hard ? 'resultFour' : 'resultThree';
  if (total > 0 && killed <= 0) return 'resultLose';
  if (leaked > 0) return 'resultTwo';
  return o.hard ? 'resultFour' : 'resultThree';
}

/**
 * Who says a battle's **result** line (结算): an operator of THAT battle's own field. Never the field the player happens
 * to be looking at (review on #73): reading the tracked units of the field on screen made a teammate's operator say the
 * viewer's 作战结束 line while the viewer was watching them.
 * `pp` is that battle's own `perPlayer` entry (BattleResult, sim/Battle.js): `unitsEnd` lists what stood on its field
 * when the battle ended. Its `defId` names the CHESS (`chess_char_*`) or a summon piece (`token_*`, which does not talk);
 * the voice bank belongs to the operator (`char_*`), so `charOf` maps a chess id to its charId (the chess record's
 * `charId`). Without it only ids that already are a charId count — a real result then has no speaker, which is how the
 * line stayed silent in every battle until 0.1.4's fix.
 * Survivors speak first — the line reports how the battle went, and a wiped-out squad is the only case where a fallen
 * operator ends up saying it. Ties are drawn like every other unit sound.
 * @param {{ unitsEnd?: Array<{ defId?: string|null, alive?: boolean }> } | null | undefined} pp that battle's perPlayer
 * @param {() => number} [random]
 * @param {((defId: string) => string|null|undefined) | null} [charOf] chess id → charId
 * @returns {string|null} charId, or null when that battle fielded no operator at all
 */
export function resultSpeaker(pp, random = Math.random, charOf = null) {
  const ops = [];
  for (const u of Array.isArray(pp?.unitsEnd) ? pp.unitsEnd : []) {
    if (!u || typeof u.defId !== 'string') continue;
    const id = u.defId.startsWith('char_') ? u.defId : charOf ? charOf(u.defId) : null;
    if (typeof id === 'string' && id.startsWith('char_')) ops.push({ id, alive: !!u.alive });
  }
  const standing = ops.filter((o) => o.alive);
  const pool = standing.length ? standing : ops;   // only a wiped-out squad is spoken for by a fallen operator
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))].id;
}

/** Gestures that may unlock audio: iOS Safari only accepts touchend / click / keydown; pointerdown covers the rest. */
const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'];

/**
 * Concurrency of battle SFX. 2026-10-10, docs/rules/audio.md 「효과음 재생: 피치·동시 재생 상한」: the official
 * SoundFXBank.Play (클라 코드 RVA 0x34B22A0) — a bank (`key`) at its maxSoundAllowed (> 0) stops its oldest sounds for the new
 * one when popOldest, else refuses the new one; 0 = no cap. Beside it one cap for all battle sounds (MAX_VOICES). No per-unit
 * or per-URL gap (the client has none). Pure bookkeeping: `acquire` hands out a slot whose `cut` the caller sets (popOldest
 * calls it), `release(slot)` when the sound ends.
 */
export class SfxLimiter {
  /** @param {{ maxVoices?: number }} [o] */
  constructor(o = {}) {
    this.maxVoices = o.maxVoices ?? MAX_VOICES;
    this.active = 0;
    this.byBank = new Map(); // bank key → slots, oldest first
  }

  /**
   * A slot for a new sound of bank `key`, or null when it may not play.
   * @param {string} key the bank (a unit model + role, a named battle sound, a kit key …)
   * @param {number} [max] maxSoundAllowed (0 = no cap)
   * @param {boolean} [pop] popOldest
   * @returns {{ key: string, cut: (() => void)|null, done: boolean }|null}
   */
  acquire(key, max = DEFAULT_BANK[2], pop = true) {
    const list = this.byBank.get(key);
    if (max > 0 && list && list.length >= max) {
      if (!pop) return null;
      while (list.length >= max) { const old = list[0]; this.release(old); try { old.cut?.(); } catch { /* ignore */ } }
    }
    if (this.active >= this.maxVoices) return null;
    const slot = { key, cut: null, done: false };
    if (!this.byBank.has(key)) this.byBank.set(key, []);
    this.byBank.get(key).push(slot);
    this.active += 1;
    return slot;
  }

  /** A sound started by acquire ended (or was cut). */
  release(slot) {
    if (!slot || slot.done) return;
    slot.done = true;
    this.active = Math.max(0, this.active - 1);
    const list = this.byBank.get(slot.key);
    const i = list ? list.indexOf(slot) : -1;
    if (i >= 0) list.splice(i, 1);
    if (list && !list.length) this.byBank.delete(slot.key);
  }

  /** Sounds of bank `key` playing now. */
  count(key) { return this.byBank.get(key)?.length || 0; }

  /** Cut every sound of bank `key` (playing or still loading). */
  cut(key) {
    for (const slot of [...(this.byBank.get(key) || [])]) { this.release(slot); try { slot.cut?.(); } catch { /* ignore */ } }
  }
}

/**
 * Voice gate: one line at a time, a global gap between two lines, a per-unit per-slot cooldown, and takeover by a
 * clearly more important line (the caller fades the playing one out first). Pure — the clock is passed in.
 */
export class VoiceGate {
  /** @param {{ gapMs?: number, preemptMargin?: number, maxUnits?: number }} [o] */
  constructor(o = {}) {
    this.gapMs = Number.isFinite(o.gapMs) ? o.gapMs : VOICE_GAP_MS;
    // a line only takes the channel over when its priority beats the playing one by this margin: an equal-priority
    // line (two 作战中 of different operators) waits for its turn instead of cutting the other off
    this.preemptMargin = Number.isFinite(o.preemptMargin) ? o.preemptMargin : 10;
    this.maxUnits = Number.isFinite(o.maxUnits) ? o.maxUnits : 400;
    this.playing = null;      // { slot, pri } of the line on air
    this.lastAt = -Infinity;
    this.unitUntil = new Map();
  }

  /** Drop all state (a new field must not inherit the previous battle's cooldowns). */
  reset() {
    this.playing = null;
    this.lastAt = -Infinity;
    this.unitUntil.clear();
  }

  /**
   * May a `slot` line from `unitKey` start now?
   * @param {string} slot
   * @param {string|number|null} unitKey the cooldown key (a battle unit id; null = no per-unit cooldown)
   * @param {number} now ms
   * @returns {'play'|'preempt'|'drop'}
   */
  request(slot, unitKey, now) {
    const pri = VOICE_PRIORITY[slot] ?? 0;
    if (this.playing) {
      if (pri < this.playing.pri + this.preemptMargin) return 'drop';
      return 'preempt';                       // a clearly more important line takes the channel
    }
    if (now - this.lastAt < this.gapMs) return 'drop';
    if (unitKey != null && now < (this.unitUntil.get(`${unitKey}:${slot}`) || 0)) return 'drop';
    return 'play';
  }

  /** Record a line that started (call right after request() answered play / preempt). */
  start(slot, unitKey, now) {
    this.playing = { slot, pri: VOICE_PRIORITY[slot] ?? 0 };
    this.lastAt = now;
    const cd = VOICE_COOLDOWN_MS[slot] ?? 0;
    if (unitKey != null && cd > 0) {
      if (this.unitUntil.size > this.maxUnits) this.unitUntil.clear();
      this.unitUntil.set(`${unitKey}:${slot}`, now + cd);
    }
  }

  /** The line ended (naturally, by takeover or by a stop). */
  release() { this.playing = null; }
}

// ---- manager -----------------------------------------------------------------------------------------------

/**
 * Could Web Audio decode this response? A host without the `/media/` route answers 404; some static hosts answer a
 * missing path with 200 + the SPA's index.html instead, and fetching *that* would fail to decode as silently as a
 * 404 would — so the fallback looks at the declared type too.
 *
 * A response that declares no type at all is not treated as wrong: absence of a header is not evidence of an HTML
 * page, and fetch stubs / minimal hosts legitimately omit it.
 * @param {{ ok?: boolean, headers?: { get?: (n: string) => string | null } }} res
 */
function isAudioResponse(res) {
  if (!res || !res.ok) return false;
  const type = res.headers?.get?.('content-type');
  return !type || /^\s*audio\//i.test(type);
}
export class AudioManager {
  /**
   * @param {{ getManifest?: () => any, win?: any }} [opts]
   */
  constructor(opts = {}) {
    this.getManifest = typeof opts.getManifest === 'function' ? opts.getManifest : () => null;
    this.random = typeof opts.random === 'function' ? opts.random : Math.random;   // a unit sound's chance (mix.p)
    this.win = opts.win ?? (typeof window !== 'undefined' ? window : null);
    this.ctx = null;
    this.master = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.voiceGain = null;
    this.bus = null;          // local patch: BattleGameSound — the channels a mixer snapshot filters (audioSnapshot.js)
    this.sfxOutside = null;   // local patch: sfx outside it (Independent banks, UI one-shots)
    this.chatGain = null;
    this.volumes = { bgm: 0.6, sfx: 0.8, voice: 0.8, chat: 0.5, muted: false };
    this.awake = false;       // keepAwake: a hidden tab keeps the context running (UI sounds only)
    this.chatOn = true;          // settings chatSound
    this.chatCooldown = 2;       // settings chatCooldown (s)
    this.chatNode = null;        // the notification on air
    this.chatPending = false;    // its buffer is loading
    this.chatToken = 0;          // bumped by stopChatNotification: a load in flight then plays nothing
    this.chatLast = null;        // { at, ms }: start time and length of the last notification (the gap counts from it)
    this.buffers = new Map(); // url → Promise<AudioBuffer|null> (insertion order = LRU)
    this.bufBytes = new Map(); // url → decoded PCM bytes (the byte budget of the LRU, see _buffer)
    this.warned = new Set();
    this.limiter = new SfxLimiter();
    this.voiceGate = new VoiceGate();
    this.voiceNode = null;    // { src, gain, url, token } of the line on air
    this.voiceToken = 0;
    this.startVoiceDone = false; // 行动出发 of this field (the first operator deployed says it)
    this.uiVoices = 0;
    this.bondCue = null;      // { scope: 'prep' | 'battle', at } of the last bond layer-up cue (BOND_BANK)
    this.wantBgm = null;      // desired key (kept while locked)
    this.bgm = null;          // { key, loopUrl, nodes: [{src, gain}], gain }
    this.bgmToken = 0;
    this.units = new Map();   // battle unit id → defId
    this.lastAttacker = new Map(); // target id → { def, at } of the hostile attack last aimed at it (its impact sound)
    this.chainStruck = new Map(); // unit id → time a chain bounce struck it (sim 'atk' 'chain': its 'dmg' is a bounce's)
    this.consumed = new Set();     // summons used up by their own effect (香槟炸弹 exploded): no death sound
    this.installed = false;
    this._unlock = this._unlock.bind(this);
    this._onVis = this._onVis.bind(this);
  }

  /** Attach gesture unlock + visibility handling. Idempotent. */
  install() {
    if (this.installed || !this.win) return;
    this.installed = true;
    try {
      for (const ev of UNLOCK_EVENTS) this.win.addEventListener(ev, this._unlock, { capture: true, passive: true });
      this.win.document?.addEventListener?.('visibilitychange', this._onVis);
      // iOS / iPadOS: a phone call, Siri or another app puts the context into 'interrupted'; coming back to the page
      // (pageshow / focus) resumes it (plus the next gesture, below)
      this.win.addEventListener?.('pageshow', this._onVis);
      this.win.addEventListener?.('focus', this._onVis);
    } catch { /* ignore */ }
  }

  get unlocked() { return !!this.ctx; }

  /**
   * First user gesture: create the context. The gesture listeners stay until the context actually runs — iOS Safari
   * only counts touchend / click (not pointerdown / touchstart) as activation, so a context created on pointerdown can
   * stay 'suspended' until the finger lifts. A 1-sample silent buffer is played inside the gesture (older WebKit only
   * unlocks output after something was started in a gesture).
   */
  _unlock() {
    if (this.ctx) {
      const st = this.ctx.state;
      if (st === 'running') { this._dropUnlock(); return; }
      if (!this.win?.document?.hidden) {
        this._primeOutput();
        const p = this.ctx.resume?.();
        if (p && typeof p.then === 'function') p.then(() => { if (this.ctx?.state === 'running') this._dropUnlock(); }, () => {});
      }
      return;
    }
    try {
      const AC = this.win?.AudioContext || this.win?.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.bgmGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.voiceGain = this.ctx.createGain();
      // the chat notification is not part of the battle mix: straight to the master, outside the snapshot bus
      this.chatGain = this.ctx.createGain();
      this.chatGain.connect(this.master);
      // local patch (report follow-up): the channels meet on `bus` (BattleGameSound) so a mixer snapshot can filter
      // them (audioSnapshot.js); `sfxOutside` carries the sfx outside that bus straight to the master
      this.bus = this.ctx.createGain();
      this.sfxOutside = this.ctx.createGain();
      this.bgmGain.connect(this.bus);
      this.sfxGain.connect(this.bus);
      this.voiceGain.connect(this.bus);
      this.bus.connect(this.master);
      this.sfxOutside.connect(this.master);
      this.master.connect(this.ctx.destination);
      // iOS / iPadOS: a call, Siri or another app's audio moves a running context to 'interrupted' (or 'suspended');
      // a resume without a gesture may then be refused — listen for the next gesture again (dropped once it runs)
      try {
        this.ctx.addEventListener?.('statechange', () => {
          const s = this.ctx?.state;
          if (s && s !== 'running' && s !== 'closed' && !this.win?.document?.hidden) this._armUnlock();
        });
      } catch { /* ignore */ }
      this._applyVolumes();
      this._primeOutput();
      if (this.ctx.state === 'running') this._dropUnlock();
      else {
        const p = this.ctx.resume?.();
        if (p && typeof p.then === 'function') p.then(() => { if (this.ctx?.state === 'running') this._dropUnlock(); }, () => {});
      }
      if (this.wantBgm) { const k = this.wantBgm; this.wantBgm = null; this.playBgm(k); }
    } catch (err) {
      this._warn('ctx', err);
      this.ctx = null;
    }
  }

  /** (Re-)attach the gesture listeners after the context stopped running while visible (see _unlock / _onVis). */
  _armUnlock() {
    if (!this._unlockDropped || !this.win) return;
    this._unlockDropped = false;
    try { for (const ev of UNLOCK_EVENTS) this.win.addEventListener(ev, this._unlock, { capture: true, passive: true }); } catch { /* ignore */ }
  }

  /** Remove the first-gesture listeners (the context runs). */
  _dropUnlock() {
    if (this._unlockDropped || !this.win) return;
    this._unlockDropped = true;
    try { for (const ev of UNLOCK_EVENTS) this.win.removeEventListener(ev, this._unlock, { capture: true }); } catch { /* ignore */ }
  }

  /** Start a silent 1-sample buffer (inside a user gesture: unlocks output on older WebKit). */
  _primeOutput() {
    try {
      const c = this.ctx;
      if (!c || typeof c.createBuffer !== 'function') return;
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, c.sampleRate || 44100);
      src.connect(c.destination);
      src.start ? src.start(0) : src.noteOn?.(0);
    } catch { /* ignore */ }
  }

  /**
   * Keep the context running while the tab is hidden (랜덤 매칭: the match-found cue has to reach a player who waits on
   * another tab, maintainer decision 2026-10-14). A hidden tab then hears the UI sounds only: BGM and voice stay
   * silent there (_applyVolumes). Off again ⇒ a hidden tab suspends as before.
   * @param {boolean} on
   */
  keepAwake(on) {
    if (this.awake === !!on) return;
    this.awake = !!on;
    this._onVis();
  }

  _onVis() {
    try {
      if (!this.ctx) return;
      this._applyVolumes();
      if (this.win?.document?.hidden && !this.awake) this.ctx.suspend().catch(() => {});
      else if (this.ctx.state !== 'running') {
        // back on the page: resume, and keep a gesture ready in case the browser wants one first (iOS after a call)
        this._armUnlock();
        this.ctx.resume().then(() => { if (this.ctx?.state === 'running') this._dropUnlock(); }, () => {});
      }
    } catch { /* ignore */ }
  }

  _warn(key, err) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    try { console.warn(`[audio] ${key} unavailable`, err?.message || err || ''); } catch { /* ignore */ }
  }

  /**
   * Set channel volumes (0..1) and mute, and the chat notification's switch and gap (the settings store's shape).
   * @param {{ bgm?: number, sfx?: number, voice?: number, chatVolume?: number, muted?: boolean, chatSound?: boolean,
   *   chatCooldown?: number }} v
   */
  setVolumes(v) {
    const n = (x, d) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : d);
    this.volumes = {
      bgm: n(v?.bgm, this.volumes.bgm),
      sfx: n(v?.sfx, this.volumes.sfx),
      voice: n(v?.voice, this.volumes.voice),
      chat: n(v?.chatVolume, this.volumes.chat),
      muted: typeof v?.muted === 'boolean' ? v.muted : this.volumes.muted,
    };
    if (typeof v?.chatSound === 'boolean') this.chatOn = v.chatSound;
    if (Number.isFinite(v?.chatCooldown)) this.chatCooldown = Math.max(1, Math.min(5, Math.round(v.chatCooldown)));
    if (!this.chatOn || this.volumes.muted || this.volumes.chat <= 0) this.stopChatNotification();
    if (this.volumes.muted || this.volumes.sfx <= 0) this.stopBondCue();
    this._applyVolumes();
  }

  _applyVolumes() {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.volumes.muted ? 0 : 1, t, 0.03);
      const away = this.awake && !!this.win?.document?.hidden; // keepAwake in a hidden tab: UI sounds only
      // perceptual curve
      this.bgmGain.gain.setTargetAtTime(away ? 0 : this.volumes.bgm ** 2 * 0.55, t, 0.05);
      this.sfxGain.gain.setTargetAtTime(this.volumes.sfx ** 2, t, 0.03); // local patch: the mixer groups carry the SFX bus (audioOfficial.js)
      this.sfxOutside?.gain.setTargetAtTime(this.volumes.sfx ** 2, t, 0.03); // local patch: the same channel outside the snapshot bus
      // no 0.9: a voice line is already mastered as loud as the rest of the official mix (settings 干员语音 tunes it)
      this.voiceGain.gain.setTargetAtTime(away ? 0 : this.volumes.voice ** 2 * VOICE_GAIN, t, 0.03); // local patch: the Voice group
      this.chatGain?.gain.setTargetAtTime(this.volumes.chat ** 2, t, 0.03);
    } catch { /* ignore */ }
  }

  /** Fetch + decode (cached, LRU). Resolves null on failure. */
  _buffer(url) {
    if (!this.ctx || typeof url !== 'string' || !url) return Promise.resolve(null);
    const hit = this.buffers.get(url);
    if (hit) {
      this.buffers.delete(url);
      this.buffers.set(url, hit);
      return hit;
    }
    const p = (async () => {
      try {
        // Extension-less URL first so download managers leave the BGM alone; a host without /media/ still works.
        const media = mediaUrl(url);
        let res = await fetch(media);
        if (media !== url && !isAudioResponse(res)) {
          // Drop the unusable response (404, or a 200 that is really index.html) before trying the original URL.
          try { await res.body?.cancel?.(); } catch { /* the fallback request matters more than draining this one */ }
          res = await fetch(url);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ab = await res.arrayBuffer();
        return await new Promise((resolve) => {
          try {
            const r = this.ctx.decodeAudioData(ab, resolve, () => resolve(null));
            if (r && typeof r.then === 'function') r.then(resolve, () => resolve(null));
          } catch { resolve(null); }
        });
      } catch (err) {
        this._warn(url, err);
        return null;
      }
    })();
    this.buffers.set(url, p);
    p.then((buf) => {
      if (!buf) return;
      try {
        this.bufBytes.set(url, (buf.length || 0) * (buf.numberOfChannels || 1) * 4);
        this._trimBuffers();
      } catch { /* ignore */ }
    }, () => {});
    this._trimBuffers();
    return p;
  }

  /**
   * Evict least-recently-used buffers until both the entry count and the decoded-PCM budget hold. The count alone is
   * not enough once voice lines are in the cache: 180 of them are ~100 MB of PCM (a voice decodes to 0.4–1.3 MB).
   */
  _trimBuffers() {
    let bytes = 0;
    for (const n of this.bufBytes.values()) bytes += n;
    if (this.buffers.size <= BUFFER_CACHE && bytes <= BUFFER_BYTES) return;
    for (const url of [...this.buffers.keys()]) {
      if (this.buffers.size <= BUFFER_CACHE && bytes <= BUFFER_BYTES) break;
      // never evict the playing BGM (a voice keeps its own reference to its buffer)
      if (this.bgm && url === this.bgm.loopUrl) continue;
      bytes -= this.bufBytes.get(url) || 0;
      this.buffers.delete(url);
      this.bufBytes.delete(url);
    }
  }

  /** Preload a list of URLs (e.g. UI SFX) once unlocked. */
  preload(urls) {
    if (!this.ctx) return;
    for (const u of Array.isArray(urls) ? urls : []) this._buffer(u);
  }

  // ---- BGM ------------------------------------------------------------------------------------------------

  /**
   * Switch BGM (null stops). Same loop URL ⇒ no restart.
   * @param {string|null} key see bgmKeyFor
   */
  playBgm(key) {
    try {
      if (!this.ctx) { this.wantBgm = key; return; }
      const track = resolveBgm(this.getManifest(), key);
      if (this.bgm && track && this.bgm.loopUrl === track.loop) { this.bgm.key = key; return; }
      if (!track && !this.bgm) return;
      const token = ++this.bgmToken;
      this._fadeOutBgm();
      if (!track) return;
      this._startBgm(key, track, token);
    } catch (err) { this._warn('bgm', err); }
  }

  async _startBgm(key, track, token) {
    const [intro, loop] = await Promise.all([track.intro ? this._buffer(track.intro) : null, this._buffer(track.loop)]);
    if (token !== this.bgmToken || !this.ctx || !loop) return;
    try {
      const ctx = this.ctx;
      const gain = ctx.createGain();
      gain.connect(this.bgmGain);
      const t0 = ctx.currentTime + 0.05;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(1, t0 + FADE_S);
      const nodes = [];
      let loopAt = t0;
      if (intro) {
        const s = ctx.createBufferSource();
        s.buffer = intro;
        const g = ctx.createGain();
        s.connect(g); g.connect(gain);
        s.start(t0);
        const end = t0 + intro.duration;
        const xf = Math.min(XFADE_S, intro.duration / 2);
        g.gain.setValueAtTime(1, Math.max(t0, end - xf));
        g.gain.linearRampToValueAtTime(0, end);
        nodes.push({ src: s, gain: g });
        loopAt = end - xf;
      }
      const s = ctx.createBufferSource();
      s.buffer = loop;
      s.loop = true;
      const g = ctx.createGain();
      s.connect(g); g.connect(gain);
      if (intro) {
        g.gain.setValueAtTime(0, loopAt);
        g.gain.linearRampToValueAtTime(1, loopAt + Math.min(XFADE_S, intro.duration / 2));
      }
      s.start(loopAt);
      nodes.push({ src: s, gain: g });
      this.bgm = { key, loopUrl: track.loop, nodes, gain };
    } catch (err) { this._warn('bgm-start', err); }
  }

  _fadeOutBgm() {
    const cur = this.bgm;
    this.bgm = null;
    if (!cur || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      cur.gain.gain.cancelScheduledValues(t);
      cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
      cur.gain.gain.linearRampToValueAtTime(0, t + FADE_S);
      for (const n of cur.nodes) { try { n.src.stop(t + FADE_S + 0.05); } catch { /* ignore */ } }
      setTimeout(() => { try { cur.gain.disconnect(); } catch { /* ignore */ } }, (FADE_S + 0.3) * 1000);
    } catch { /* ignore */ }
  }

  // ---- SFX ------------------------------------------------------------------------------------------------

  /**
   * Play one sound. 2026-10-10, docs/rules/audio.md 「효과음 재생: 피치·동시 재생 상한」: its bank's values
   * (manifest `sfx.bank[url]` = [minPitch, maxPitch, maxSoundAllowed, popOldest], audioOfficial.js bankPlayOf) — a random
   * pitch in the range on every play (playbackRate, like Unity's AudioSource.pitch it also changes the length), and for a
   * `limited` (battle) sound its bank's cap: `bank` names the bank (default: the URL), `pop` = a kit key's { max, pop }
   * when the table has no values for the file. `channel` holds a UI sound to its bank's cap the same way, under that key
   * (the bond layer-up cue, BOND_BANK).
   */
  _play(url, { volume = 1, rate = null, limited = false, bank = null, unitKey = null, pop = null, delay: ownDelay = null, channel = null } = {}) {
    if (!this.ctx || !url || this.volumes.muted || this.volumes.sfx <= 0) return;
    const info = bankPlayOf(this.getManifest(), url) ?? (pop && Number.isInteger(pop.max) ? [1, 1, pop.max, pop.pop ? 1 : 0] : DEFAULT_BANK);
    const pitch = Number.isFinite(rate) && rate > 0 ? rate : playPitch(info, Math.random);
    // 2026-10-10, docs/rules/audio.md 「공격 소리 신호」: the sound's own delay — SoundFXBank.Play (RVA 0x34B22A0)
    // waits `delay / Time.timeScale` (a battle sound: the game speed; a UI one plays at time scale 1)
    const d0 = Number.isFinite(ownDelay) ? ownDelay : info.length > 4 ? info[4] : 0; // a cue's own bank delay first (_playCue)
    const delay = d0 > 0 ? d0 / (limited ? this.gameSpeed() : 1) : 0;
    let slot = null;
    const capped = limited || channel != null;
    if (capped) { slot = this.limiter.acquire(String(channel ?? bank ?? unitKey ?? url), info[2], !!info[3]); if (!slot) return; }
    else if (this.uiVoices >= 12) return;
    else this.uiVoices += 1;
    let done = false, s = null, g = null, unsnap = null;
    const end = () => {
      if (done) return;
      done = true;
      unsnap?.(); // local patch: a hook's mixer snapshot ends with it (audioSnapshot.js)
      if (capped) this.limiter.release(slot); else this.uiVoices = Math.max(0, this.uiVoices - 1);
      try { g?.disconnect(); } catch { /* ignore */ }
    };
    if (slot) slot.cut = () => { try { s?.stop(); } catch { /* ignore */ } end(); };   // local patch: popOldest
    this._buffer(url).then((buf) => {
      if (done) return;   // local patch: cut while it loaded
      if (!buf || !this.ctx) { end(); return; }
      try {
        s = this.ctx.createBufferSource();
        s.buffer = buf;
        s.playbackRate.value = pitch;
        g = this.ctx.createGain();
        g.gain.value = Math.max(0, Math.min(1.5, volume));
        s.connect(g); g.connect(sfxOut(this, url, !limited)); // local patch: outside the snapshot bus (audioSnapshot.js)
        s.onended = end;
        setTimeout(end, (buf.duration / pitch + delay) * 1000 + 250); // safety if onended never fires
        if (delay > 0) s.start(this.ctx.currentTime + delay); else s.start();
        const hook = snapshotHookOf(this, url); // local patch: 归溟幽灵鲨's switch sinks the rest of the mix (audioSnapshot.js)
        if (hook) unsnap = holdSnapshot(this, hook);
      } catch { end(); }
    }, end);
  }

  /**
   * UI sound by name (sfx.ui keys). Unknown names are ignored. `bondUp` plays on its own channel (_bondCue).
   * @param {string} name
   * @param {{ volume?: number, scope?: 'prep' | 'battle' }} [o]
   */
  sfx(name, o = {}) {
    try {
      const url = this.getManifest()?.audio?.sfx?.ui?.[name];
      if (typeof url !== 'string') return;
      if (name === 'bondUp') this._bondCue(url, o.volume ?? BOND_VOLUME, o.scope);
      else this._play(url, { volume: o.volume ?? 0.9 });
    } catch { /* ignore */ }
  }

  // ---- bond layer-up cue (upstream #482) -------------------------------------------------------------------------

  /**
   * A bond's layers rose by `add` (m.layer in 回合开始 / 机变 / 休整期, a battle's 'layer' tuple): one cue per real gain,
   * however many layers and whether or not the bond is active. `scope` is where it came from ('prep' | 'battle').
   * @param {string} bondId
   * @param {number} add
   * @param {'prep' | 'battle'} [scope]
   */
  layerGain(bondId, add, scope = 'prep') {
    if (typeof bondId === 'string' && bondId && Number.isFinite(add) && add > 0) this.sfx('bondUp', { scope });
  }

  /**
   * True while a cue of `scope` started less than `ms` ago: one preparation update can both add layers (m.layer) and turn
   * a bond on (screens/game.js) — the second trigger keeps the cue on air instead of cutting it and starting it again.
   * A later gain still replaces the cue at once.
   */
  bondCueRecent(scope, ms = BOND_SAME_UPDATE_MS) {
    const c = this.bondCue;
    if (!c || c.scope !== scope) return false;
    return (typeof performance !== 'undefined' ? performance.now() : Date.now()) - c.at < ms;
  }

  /** Cut the bond cue (playing or loading) — only one of `scope` when it is given. */
  stopBondCue(scope = null) {
    if (scope && this.bondCue?.scope !== scope) return;
    this.bondCue = null;
    this.limiter.cut(BOND_BANK);
  }

  _bondCue(url, volume, scope) {
    if (!this.ctx || this.volumes.muted || this.volumes.sfx <= 0) return;
    this.bondCue = { scope: scope === 'battle' ? 'battle' : 'prep', at: typeof performance !== 'undefined' ? performance.now() : Date.now() };
    // the bank's cap (1, popOldest) cuts the cue on air, or one still loading, for this one
    this._play(url, { volume, channel: BOND_BANK, pop: BOND_POP });
  }

  // ---- chat notification ------------------------------------------------------------------------------------

  /** Stop the notification on air and drop one still loading. */
  stopChatNotification() {
    this.chatToken += 1;
    this.chatPending = false;
    const node = this.chatNode;
    this.chatNode = null;
    if (node) { try { node.stop(); } catch { /* already ended */ } }
  }

  /**
   * Play the chat notification (the emote sound) on the chat channel. `preview` (the settings' volume slider) plays it
   * even while switched off, cuts the one on air and leaves the gap alone. Resolves whether it played.
   * @param {{ preview?: boolean }} [o]
   * @returns {Promise<boolean>}
   */
  async chatNotification({ preview = false } = {}) {
    const url = this.getManifest()?.audio?.sfx?.ui?.emote;
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const blocked = () => !this.ctx || this.ctx.state !== 'running' || !!this.win?.document?.hidden
      || this.volumes.muted || this.volumes.chat <= 0 || (!preview && !this.chatOn);
    if (typeof url !== 'string' || blocked()) return false;
    if (preview) this.stopChatNotification();
    else if (this.chatPending || this.chatNode
      || (this.chatLast && now() < this.chatLast.at + Math.max(this.chatCooldown * 1000, this.chatLast.ms + 500))) return false;
    const token = this.chatToken;
    const asked = now();
    this.chatPending = true;
    try {
      const buf = await this._buffer(url);
      // a first load slower than 2 s is late news: drop it rather than ring long after the line
      if (token !== this.chatToken || !buf || now() - asked > 2000 || blocked()) return false;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.chatGain);
      src.onended = () => {
        if (this.chatNode === src) this.chatNode = null;
        try { src.disconnect(); } catch { /* ignore */ }
      };
      this.chatNode = src;
      src.start();
      if (!preview) this.chatLast = { at: now(), ms: buf.duration * 1000 };
      return true;
    } catch (err) {
      this._warn('chat', err);
      return false;
    } finally {
      if (token === this.chatToken) this.chatPending = false;
    }
  }

  /** Battle sound by name (sfx.battle keys), limited like unit sounds. */
  battle(name, o = {}) {
    try {
      const url = this.getManifest()?.audio?.sfx?.battle?.[name];
      const volume = Object.hasOwn(BATTLE_GROUP, name) ? battleGain(name) : (o.volume ?? 0.7); // local patch: official mix
      if (typeof url === 'string') this._play(url, { volume, limited: true, bank: `b:${name}` }); // one bank per name
    } catch { /* ignore */ }
  }

  /**
   * Per-unit sound (attack/on/hit/skill/die/born) through its bank's cap.
   * @param {string} defId charId/tokenId/enemyId (or chess id — mapped via its spine/char id by the caller)
   * @param {'attack'|'on'|'hit'|'skill'|'die'|'born'} kind `on`: (2026-10-10) the ability's ON bank beside its
   *   START swing (both sound, docs/rules/audio.md 「START·ON·HIT」)
   * @param {number|string} unitId battle unit id
   * @returns {boolean} whether a unit-specific sound exists
   */
  unit(defId, kind, unitId, skillIndex, mode = null) {
    try {
      const u = this.getManifest()?.audio?.sfx?.units?.[defId];
      // 2026-10-10: a running skill mode with its own attack sounds only its own ON bank (none = none)
      if (kind === 'on') { const mo = modeOn(u, mode); if (mo !== undefined) return this._unitOn(defId, u, mo, mode); }
      // local patch: an attack / impact made while skill `mode` (its index) runs sounds that skill's mode (audioOfficial.js)
      const m = kind === 'attack' || kind === 'hit' ? modeEntry(u, mode, kind) : null;
      // local patch (maintainer report): a mode whose ability has no impact bank sounds none (缄默德克萨斯 S2, modes[i].noHit)
      if (kind === 'hit' && !m && Number.isInteger(mode) && u?.modes?.[mode]?.noHit) return true;
      // DESIGN §16: the equipped skill's own ON_SKILL_START sound (`skills[index]`) when the manifest has it
      const own = kind === 'skill' && Number.isInteger(skillIndex) && u?.skills ? u.skills[skillIndex] : null;
      const url = m ? m[kind] : typeof own === 'string' ? own : u?.[kind];
      if (typeof url !== 'string') return false;
      if (!m && (kind === 'attack' || kind === 'hit') && !normalAttackSfx(defId, url)) return false;
      // the official bank's mix (header): a silent roll still counts as the unit's own sound (no generic fallback)
      const mix = m ? m.mix?.[kind] : kind === 'skill' ? null : u?.mix?.[kind];
      if (!unitSoundPlays(mix, this.random())) return true;
      // local patch: the official mixer group × bank volume (audioOfficial.js) instead of unitGain(0.55 | 0.8, mix)
      const volume = officialGain(defId, kind, u, kind === 'skill' ? u?.skillMix?.[skillIndex] : mix, m ? { grp: m.grp, mode: true } : { skillIndex });
      // 2026-10-10: the bank — every unit of a model shares it (one per role / skill / mode, like the client's
      // battle.<EVENT>.<id>.<ability>), not one per unit
      this._play(url, { volume, limited: true, bank: `${defId}:${kind}${kind === 'skill' ? `:${skillIndex ?? ''}` : m ? `:m${mode}` : ''}` });
      return true;
    } catch { return false; }
  }

  /** 2026-10-10: a running mode's own ON sound (`modes[i].on`, null = the mode has none). */
  _unitOn(defId, u, url, mode) {
    if (typeof url !== 'string') return false;
    const m = u.modes[mode];
    this._play(url, { volume: officialGain(defId, 'on', u, m.mix?.on, { grp: m.grp, mode: true }), limited: true, bank: `${defId}:on:m${mode}` });
    return true;
  }

  // ---- attack sound signals (2026-10-10, docs/rules/audio.md 「공격 소리 신호」) ---------------------------------

  /**
   * The battle's game speed (game seconds per real second) for a sound's delay (SoundFXBank.Play: `delay / Time.timeScale`):
   * the one set (setGameSpeed: the field's speed), else the one measured from swings (`swing` windup → its strike), else 2.
   */
  gameSpeed() {
    const v = Number.isFinite(this._speed) && this._speed > 0 ? this._speed : Number.isFinite(this._speedEst) && this._speedEst > 0 ? this._speedEst : DEFAULT_GAME_SPEED;
    return Math.max(0.25, Math.min(16, v));
  }

  /** Set the battle's game speed (null = measure it from the swings). */
  setGameSpeed(v) { this._speed = Number.isFinite(v) && v > 0 ? v : null; }

  /**
   * Play one cue of unit model `def` (audioOfficial.js cueFile: one file of the bank, drawn by weight): its chance, its mixer
   * group × bank volume, its bank's cap (`def:at:url`). Returns whether a cue was there.
   */
  _playCue(def, c, mode) {
    if (!c) return false;
    // one draw per play, like SoundFXBank._GenerateWeightedRandomSound: the empty assets' share is silence (`p`), the rest
    // picks the file by weight
    const r = this.random();
    const p = Number.isFinite(c.p) ? c.p : 1;
    if (!unitSoundPlays(Number.isFinite(c.p) ? { p } : null, r)) return true;
    const f = cueFile(c, () => Math.min(0.999999, p > 0 ? r / p : r));
    if (!f) return false;
    const role = c.at === 'd' ? 'hit' : 'attack';
    const volume = groupGain(typeof c.g === 'string' ? c.g : roleGroup(def, role, mode)) * (f.vol > 0 ? f.vol : 1);
    this._play(f.url, { volume, limited: true, bank: `${def}:${c.at}:${f.url}`, delay: f.delay });
    return true;
  }

  /**
   * The swing of tracked unit `su` (id `id`) as it starts — its mode's cue set, the ability (melee 'combat' / ranged
   * 'attack') and the group child it sounds (audioOfficial.js pickVariant) — or null without cues (the role path).
   * `kind` = the swing / strike's projectile kind ('none' = a melee strike).
   */
  _swingOf(su, kind, now, windup = 0) {
    const ue = this.getManifest()?.audio?.sfx?.units?.[su.def];
    const mode = su.skillOn ? su.skillIndex : null;
    // an enemy in another prefab mode (enemyMode): that mode's attack signals
    const em = Number.isInteger(su.emode) && su.emode > 0 ? ue?.em?.[su.emode] : null;
    // 2026-10-11: a summon in a named prefab mode (tokenModeName: 뮤엘시스's 流形 after its copy)
    const tn = !em && su.tmode ? tokenModeName(su, this.units.get(su.tby)) : null;
    const tm = tn ? ue?.tm?.[tn] : null;
    const set = em && Array.isArray(em.cues) ? { cues: em.cues, sel: em.sel, mode: true }
      : tm && Array.isArray(tm.cues) ? { cues: tm.cues, sel: tm.sel, mode: false } : cueSetOf(ue, mode);
    if (!set) return null;
    const melee = kind === 'none' || kind == null;
    const ab = cueAbility(set, melee);
    const key = `${em ? `e${su.emode}` : tm ? `t${tn}` : set.mode ? mode : 'd'}:${ab ?? ''}`;
    const mem = ((su.vm ||= new Map()).get(key)) || {};
    su.vm.set(key, mem);
    const k = pickVariant(set.sel, ab, { melee, mem, random: this.random });
    return { set, mode, ab, k, at: now, windup: Number(windup) > 0 ? Number(windup) : 0, n: 0, h: 0 };
  }

  /**
   * 2026-10-10, docs/rules/audio.md 「공격 소리 신호」: the impact of damage unit `au` deals with no attack of its own
   * (a kit's skill damage, an enemy skill's): its running skill's impact sound — the skill prefab's projectile HIT / REACH or
   * its ability's HIT (`kd[skill]`), else its mode's impact; an enemy's from the skill it cast last (3 s). Not for the kits
   * whose damage sounds through sfx.kit, nor more often than SKILL_HIT_GAP_MS.
   */
  _skillImpact(au, now) {
    if (KIT_SOUND_DEF.test(String(au.def)) || now - (au.kdAt ?? -Infinity) < SKILL_HIT_GAP_MS) return false;
    const ue = this.getManifest()?.audio?.sfx?.units?.[au.def];
    let c = null;
    if (au.side === 'enemy') {
      if (au.eskill && now - au.eskill.at <= 3000) c = (ue?.sk?.[au.eskill.name] || []).find((x) => x.at === 'd') ?? null;
    } else if (au.skillOn && Number.isInteger(au.skillIndex)) {
      const kd = ue?.kd?.[au.skillIndex];
      c = Array.isArray(kd) && kd.length ? kd[0] : null;
      if (!c) {
        const set = cueSetOf(ue, au.skillIndex);
        if (set?.mode) c = cuesAt(set, 'd', cueAbility(set, false), null, undefined)[0] ?? null;
      }
    }
    if (!c) return false;
    au.kdAt = now;
    return this._playCue(au.def, c, true);
  }

  /**
   * A unit whose model reports no Spine clip events (spineEvent: no model drawn — the fallback diamond, a crowded low-quality
   * field, a renderer that does not report them) gets a strike in their place [추정: the event sits in the attack clip, so it
   * sounds near the strike]: during skill k the unit's `Skill_<k>_<n>` events in turn (마운틴 S2 / S3 punches — their mode
   * signals have no bank), otherwise its `Attack_<n>` / `Attact_<n>` ones (파투스's reload).
   */
  _spineStrike(su) {
    if (su.spineLive) return;
    const sp = this.getManifest()?.audio?.sfx?.units?.[su.def]?.spine;
    if (!sp || typeof sp !== 'object') return;
    const re = su.skillOn && Number.isInteger(su.skillIndex) ? new RegExp(`^Skill_${su.skillIndex + 1}_\\d+$`) : /^Atta(c|ck)?t?_\d+$/i;
    const names = Object.keys(sp).filter((n) => re.test(n)).sort();
    if (!names.length) return;
    const key = su.skillOn ? `s${su.skillIndex}` : 'd';
    const mem = (su.spineLoop ||= {});
    const i = (mem[key] = ((mem[key] ?? -1) + 1) % names.length);
    this._playCue(su.def, { ...sp[names[i]], at: 'a' }, !!su.skillOn);
  }

  /** Play the cues at moment `at` of swing `sw` (spell index `sp`). */
  _swingCues(su, sw, at, sp, keep = null) {
    let any = false;
    for (const c of cuesAt(sw.set, at, sw.ab, sw.k, sp)) if (!keep || keep(c)) any = this._playCue(su.def, c, sw.set.mode) || any;
    return any;
  }

  /**
   * A unit's spine-event sound (`sfx.units[def].spine[event]`, battle.ON_SPINE_EVENT_TRIGGER.<id>.<event> — 마운틴 S2 / S3
   * punches, 파투스 reload, 필라에's shield): the renderer calls this when the unit's Spine clip reaches that event (render/spine.js
   * onEvent; the client's SpineAnimator._PlayBattleAudio RVA 0x3520A10 sounds `<entity id>.<event name>` for every event of
   * the clip). `event` null = the unit's model is up and reports its events from now on (no strike stand-in, _spineStrike).
   * Returns whether one played.
   */
  spineEvent(unitId, event) {
    try {
      const su = this.units.get(unitId);
      if (!su) return false;
      su.spineLive = true;
      if (typeof event !== 'string' || !event) return false;
      const c = this.getManifest()?.audio?.sfx?.units?.[su.def]?.spine?.[event];
      return c ? this._playCue(su.def, { ...c, at: 'a' }, !!su.skillOn) : false;
    } catch { return false; }
  }

  /**
   * docs/rules/audio.md 「적 소리」: the renderer saw enemy `unitId` (model `defId`) switch to prefab mode `modeIndex` (the
   * `_modes` order of its prefab, from `prevModeIndex`; render/fxgame.js — IMPL contract 「적 모드 전환」). Its attacks sound
   * that mode's signals from now on (`sfx.units[def].em[mode]`, mode 0 = its Default cues). The client's switch
   * (`Unit.SwitchMode` RVA 0x76E1D0 → InactiveMode / ActivateMode) sounds nothing of its own: the change clip's spine events
   * (spineEvent) and the mode's abilities do. Returns whether the unit's attack sounds changed.
   */
  enemyMode(unitId, defId, modeIndex, prevModeIndex) {
    try {
      const su = this.units.get(unitId);
      if (!su || su.side !== 'enemy' || !Number.isInteger(modeIndex) || modeIndex < 0) return false;
      if (typeof defId === 'string' && defId && su.def !== defId && su.defId !== defId) return false;
      const prev = Number.isInteger(su.emode) ? su.emode : Number.isInteger(prevModeIndex) ? prevModeIndex : 0;
      su.emode = modeIndex;
      if (prev === modeIndex) return false;
      su.sw = null; su.vm = null; // a new mode run: its groups start over (a conditional group's first attack)
      const em = this.getManifest()?.audio?.sfx?.units?.[su.def]?.em;
      return !!(em?.[modeIndex] || em?.[prev]);
    } catch { return false; }
  }

  // ---- operator battle voice ----------------------------------------------------------------------------------

  /**
   * Play an operator's battle line (`audio.voice[charId][slot]`; a slot with several lines draws one at random).
   * Only in battle: every caller is a running battle's own event stream or its settlement (user request — the 休整期
   * is silent). The line must pass VoiceGate: one at a time, a global gap, a per-unit cooldown, higher priority wins.
   * @param {string} charId e.g. 'char_263_skadi'
   * @param {'start'|'faceEnemy'|'select'|'place'|'skill1'|'skill2'|'skill3'|'skill4'|'squad'|'squadFirst'
   *   |'resultFour'|'resultThree'|'resultTwo'|'resultLose'|'gacha'} slot
   * @param {{ unitKey?: string|number|null, volume?: number }} [o] `unitKey` = the cooldown key (a battle unit id)
   * @returns {boolean} whether such a line exists and started
   */
  voice(charId, slot, o = {}) {
    try {
      if (!this.ctx || !this.voiceGain || this.volumes.muted || this.volumes.voice <= 0) return false;
      if (typeof charId !== 'string' || typeof slot !== 'string') return false;
      // local patch: the dub the player picked (public/js/voice.js voiceTable: audio.voice Korean / audio.voiceJp, null = off)
      const table = this.voiceTable ? this.voiceTable() : this.getManifest()?.audio?.voice;
      const line = table?.[charId]?.[slot];
      const url = Array.isArray(line) ? line[Math.floor(Math.random() * line.length)] : line;
      if (typeof url !== 'string' || !url) return false;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      // local patch: `o.type` = the official voice type for voicePolicy.js's gate (upstream's ignores it)
      const verdict = this.voiceGate.request(slot, o.unitKey ?? null, now, o.type);
      if (verdict === 'drop') return false;
      if (verdict === 'preempt') this._stopVoice();
      this.voiceGate.start(slot, o.unitKey ?? null, now, o.type);
      const token = ++this.voiceToken;
      this._playVoice(url, token, o.volume);
      return true;
    } catch (err) { this._warn('voice', err); return false; }
  }

  /** Fetch/decode and start one voice line through the voice channel. */
  _playVoice(url, token, volume) {
    // `token` is the line's own `voiceToken`. Every deferred step below — the decode, a failed fetch, `onended` and the
    // safety timer — can land AFTER this line was taken over or stopped: `voiceToken` has moved on and the channel then
    // belongs to the line that replaced it. So each step re-checks its token and, when it is stale, touches NOTHING:
    // `_stopVoice` (takeover / stop) and `setFieldUnits` released the gate themselves. An unconditional release here let
    // a stale callback free the channel the NEW line had just taken, and the next line walked in on top of it (review
    // on #73).
    this._buffer(url).then((buf) => {
      if (token !== this.voiceToken) return;   // taken over / stopped while it decoded: not ours to release
      if (!buf || !this.ctx || !this.voiceGain) { this.voiceGate.release(); return; }
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const gain = this.ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1.5, Number.isFinite(volume) ? volume : 1));
        src.connect(gain); gain.connect(this.voiceGain);
        const node = { src, gain, url, token };
        let done = false;
        const end = () => {
          if (done) return;
          done = true;
          // this line's own end (natural, or the safety timer): only the line that still owns the channel may free it.
          // A stale end is the takeover's leftovers — `_stopVoice` already faded it out and released the gate.
          if (token === this.voiceToken) {
            if (this.voiceNode === node) this.voiceNode = null;
            this.voiceGate.release();
          }
          try { gain.disconnect(); } catch { /* ignore */ }
        };
        src.onended = end;
        setTimeout(end, (buf.duration + 0.3) * 1000); // safety if onended never fires
        src.start();
        this.voiceNode = node;
        this.voiceGate.lineLength?.(buf.duration * 1000); // 2026-10-10: its type's cooldown runs from its end (voicePolicy.js)
      } catch (err) {
        this._warn('voice-play', err);
        if (token === this.voiceToken) this.voiceGate.release();
      }
    }, () => { if (token === this.voiceToken) this.voiceGate.release(); });
  }

  /** Fade the line on air out (a higher priority line is taking the channel over). */
  _stopVoice() {
    const cur = this.voiceNode;
    this.voiceNode = null;
    this.voiceToken += 1;              // a line still decoding must not start afterwards
    this.voiceGate.release();
    if (!cur || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      cur.gain.gain.cancelScheduledValues(t);
      cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
      cur.gain.gain.linearRampToValueAtTime(0, t + VOICE_XFADE_S);
      cur.src.stop(t + VOICE_XFADE_S + 0.02);
    } catch { /* ignore */ }
  }

  // ---- battle events ------------------------------------------------------------------------------------------

  /**
   * (Re)arm the battle start's line `ms` from now (audio.js deploy: one PREBUILT_INTERVAL after the opening's last deploy +
   * OPENING_SLACK_MS): when no further opening deploy came by then, the opening is over and voicePolicy.battleStart picks
   * one of its own operators to say 部署.
   */
  _armBattleStartLine(ms) {
    const op = this._opening;
    if (!op || this.startVoiceDone) return;
    if (op.pending) { clearTimeout(op.pending); this._openingTimers?.delete(op.pending); }
    const timer = setTimeout(() => {
      this._openingTimers?.delete(timer);
      if (this._opening !== op) return;
      op.pending = null; op.over = true;
      this.startVoiceDone = true;
      const ops = op.ids.map((id) => ({ id, u: this.units.get(id) }))
        .filter(({ u: o }) => o && o.side !== 'enemy' && o.kind !== 'token' && o.kind !== 'device' && unitSoundClass(o) === 'char')
        .map(({ id, u: o }) => ({ id, def: o.def, ownerId: o.ownerId }));
      const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
      for (const l of this.voicePolicy?.battleStart(t, ops) || []) this.voice(l.def, l.slot, { unitKey: l.id, type: l.type });
    }, ms);
    op.pending = timer;
    (this._openingTimers ||= new Set()).add(timer);
  }

  /** Reset the unit map for a new field (m.field.units = UnitInfo[]). */
  setFieldUnits(units) {
    this.stopBondCue(); // upstream #482: no layer-up cue carries into a new field
    this.units.clear();
    this.lastAttacker.clear();
    this.chainStruck.clear();
    this.consumed.clear();
    // a new field is a new battle: the first operator deployed says 行动出发 again and no cooldown carries over
    this.startVoiceDone = false;
    this._opening = null; // a new field's opening deployment (OPENING_SLACK_MS); none of the last one's pending line
    for (const timer of this._openingTimers || []) clearTimeout(timer);
    this._openingTimers?.clear();
    try { this.voiceGate.reset(); this._stopVoice(); this.voicePolicy?.reset(); } catch { /* ignore */ } // local patch: voicePolicy
    stopSkillLoops(this); // local patch: no skill loop carries into a new field
    this._skillEarly = null; // local patch: nor a skill event held for its unit's spawn
    const hadEnemy = !!this._enemies?.size; // 2026-10-10: the new field's enemies (noEnemyMs)
    this._enemies = new Set();
    for (const u of Array.isArray(units) ? units : []) this._track(u);
    if (hadEnemy && !this._enemies.size) this._noEnemySince = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  /** 2026-10-10: an enemy is on the field. */
  _enemyIn(id) { (this._enemies ||= new Set()).add(id); }

  /** 2026-10-10: an enemy left the field (killed / leaked) at `now`. */
  _enemyOut(id, now) { if (this._enemies?.delete(id) && !this._enemies.size) this._noEnemySince = now; }

  /**
   * 2026-10-10: how long (ms) no enemy has been on the field (the client's BattleController.timeDeltaNoEnemy,
   * the 行动开始 condition — voice.js voiceForRoutePreview); Infinity before any.
   */
  noEnemyMs(now = typeof performance !== 'undefined' ? performance.now() : Date.now()) {
    return this._enemies?.size ? 0 : now - (this._noEnemySince ?? -Infinity);
  }

  _track(u) {
    if (!u || typeof u !== 'object' || u.id == null) return;
    // UnitInfo.spine is the model id (charId / tokenId / enemyId) — the key of sfx.units; kind/defId pick the
    // official class sounds (operator vs summon vs device)
    const prev = this.units.get(u.id);
    this.units.set(u.id, { def: u.spine || u.defId, defId: u.defId ?? null, kind: u.kind ?? null, side: u.side, boss: !!u.boss,
      skillIndex: Number.isInteger(u.skillIndex) ? u.skillIndex : null, ownerId: u.ownerId ?? null, // ownerId (the battle start's own pieces)
      spineLive: !!prev?.spineLive && prev.def === (u.spine || u.defId) }); // its model still reports its clip events (spineEvent)
    if (u.side === 'enemy') this._enemyIn(u.id); // 2026-10-10: the time without an enemy (noEnemyMs)
  }

  /** Play a resolved battle sound for a unit event, limited like unit sounds. */
  _playUnitUrl(url, bank, volume = 0.8) {
    if (typeof url === 'string') this._play(url, { volume, limited: true, bank }); // `bank` (was a unit key)
  }

  /**
   * local patch (maintainer report 2026-10-07): the deploy sound of an allied unit — its own ON_UNIT_BORN sound
   * (望 b_char_stwctpbn, 余 p_skill_frbytrtn_bn …), else b_char_set / b_char_tokenset (deploySfxUrl) — through the
   * official mix. A battle 'deploy' and a prep drop-in (screens/game.js 'pieceDeploy') both come here.
   * @param {{ def?: string, defId?: string|null, kind?: string|null, side?: string }} u tracked unit (`def` = model id)
   * @param {number|string} [_key] the battle unit id / prep piece uid (unused since 2026-10-10: the sound's bank is the model's)
   * @returns {boolean} whether a sound was started
   */
  playDeploySfx(u, _key) {
    const m = this.getManifest();
    const url = deploySfxUrl(m, u);
    if (!url) return false;
    const own = url === m?.audio?.sfx?.units?.[u.def]?.born;
    const mix = own ? m.audio.sfx.units[u.def].mix?.born : null;
    if (!unitSoundPlays(mix, this.random())) return false;
    // local patch: the official mix (audioOfficial.js) instead of unitGain(0.8, mix) / 0.5
    this._playUnitUrl(url, own ? `${u.def}:born` : `b:born:${unitSoundClass(u)}`, own ? officialGain(u.def, 'born', m.audio.sfx.units[u.def], mix) : battleGain('deploy')); // the bank
    return true;
  }

  /**
   * local patch (maintainer report 2026-10-07): an own prep piece dropped in (bought, a reward, moved onto the board or
   * back to the bench — render/app.js prepDeployed): its deploy sound. `unit` is the view's piece info.
   * @param {{ kind?: string, defId?: string, spine?: string|null }} unit
   * @param {number|string} uid
   */
  prepDeploy(unit, uid) {
    try {
      if (!this.ctx || !unit || unit.kind === 'item') return;
      const def = unit.spine || unit.defId;
      if (typeof def !== 'string') return;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (this.playDeploySfx({ def, defId: unit.defId ?? null, kind: unit.kind === 'token' ? 'token' : 'char', side: 'ally' }, `prep:${uid}`)) {
        (this._prepDeployAt ||= new Map()).set(def, now);
        if (this._prepDeployAt.size > 40) this._prepDeployAt.delete(this._prepDeployAt.keys().next().value);
      }
    } catch (err) { this._warn('prep-deploy', err); }
  }

  /** local patch (maintainer report): replay the 'skill' events held for unit `id` until its spawn / deploy. */
  _flushSkillEarly(id) {
    const held = this._skillEarly?.get(id);
    this._skillEarly?.delete(id);
    if (held?.length) this.handleBattleEvents(held);
  }

  /**
   * Play sfx.kit key `hk` (null = nothing) — its mixer group (sfx.kitGrp), its bank's popOldest (sfx.kitLimit), one bank per key.
   * Returns whether the key has a sound.
   */
  _kitSound(hk) {
    const sfx = hk ? this.getManifest()?.audio?.sfx : null;
    const url = sfx?.kit?.[hk];
    if (typeof url !== 'string') return false;
    this._play(url, { volume: groupGain(sfx.kitGrp?.[hk] ?? 'Battle_P_SImp'), limited: true, bank: `kit:${hk}`, pop: sfx.kitLimit?.[hk] ?? null });
    return true;
  }

  /** local patch (maintainer report): play a dollkeeper switch's sounds (audioOfficial.js dollSwitchSfx) as sfx.kit keys. */
  _dollSwitch(id, ds) {
    const sfx = this.getManifest()?.audio?.sfx;
    const gain = (k) => groupGain(sfx?.kitGrp?.[k] ?? 'Battle_Skill_Important');
    if (ds.stop) stopSkillLoop(this, `${id}:doll`);
    for (const k of ds.play) if (typeof sfx?.kit?.[k] === 'string') this._play(sfx.kit[k], { volume: gain(k), limited: true, bank: `kit:${k}` });
    if (ds.hold && typeof sfx?.kit?.[ds.hold.key] === 'string') startSkillLoop(this, `${id}:doll`, sfx.kit[ds.hold.key], gain(ds.hold.key), { loop: false, fade: ds.hold.fade });
  }

  /**
   * React to `b.ev` tuples (DESIGN §8.2).
   * @param {any[]} ev
   */
  handleBattleEvents(ev) {
    if (!this.ctx || !Array.isArray(ev)) return;
    try {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      for (const e of ev) {
        if (!Array.isArray(e)) continue;
        const kind = e[0];
        if (kind === 'spawn') {
          this._track(e[1]);
          // local patch (maintainer report): a skill that starts on deployment (缄默德克萨斯 S1–S3, Skill.reset activateOnDeploy)
          // sends its 'skill' before the unit's 'spawn' — held until then; with a 'deploy' in this batch, until that sounds
          const id = e[1]?.id;
          if (this._skillEarly?.has(id) && !ev.some((x) => Array.isArray(x) && x[0] === 'deploy' && x[1] === id)) this._flushSkillEarly(id);
          continue;
        }
        if (OPENING_ENDS.has(kind)) { if (this._opening) this._opening.over = true; else this._opening = { at: -Infinity, n: 0, over: true }; }
        if (kind === 'skill' && !this.units.has(e[1])) { // local patch: before its unit's spawn (see 'spawn')
          if (e[1] != null) { const m = (this._skillEarly ||= new Map()); m.set(e[1], [...(m.get(e[1]) || []), e]); }
          continue;
        }
        if (kind === 'skill') { // local patch: the running skill (its mode sounds, audioOfficial.js)
          const su = this.units.get(e[1]);
          if (su) {
            su.skillOn = !!e[2];
            su.sw = null; su.vm = null; // 2026-10-10: a new mode run — its groups start over (a conditional group's first attack)
            // 2026-10-10: its 过载 ends with the skill (락락: rockr_s_2[overload] ON_BUFF_FINISH → rockr_overload_finish)
            if (su.over && su.def === 'char_4040_rockr') this._kitSound('rockr:ovf');
            su.over = false;
            const ue = this.getManifest()?.audio?.sfx?.units?.[su.def];
            const loop = skillLoopOf(ue, su.skillIndex); // its looping bank (music, field)
            if (loop && e[2]) startSkillLoop(this, e[1], loop.url, loopGain(loop));
            else if (!e[2]) stopSkillLoop(this, e[1]);
            // local patch (maintainer report): its extra one-shots (耀骑士临光 S3, 塑心 S3's melody — held ones cut at its end)
            if (e[2]) {
              skillExtrasOf(ue, su.skillIndex).forEach((x, k) => {
                const gain = loopGain(x);
                if (Number.isFinite(x.stop)) startSkillLoop(this, `${e[1]}:x${k}`, x.url, gain, { loop: false, fade: x.stop });
                else this._play(x.url, { volume: gain, limited: true, bank: `${su.def}:x${su.skillIndex}:${k}` });
              });
            } else skillExtrasOf(ue, su.skillIndex).forEach((x, k) => stopSkillLoop(this, `${e[1]}:x${k}`));
            // modes[i].deferStart: a fallback start sound — it plays only for a skill that ended without an attack (its
            // attacks sound the skill's own attack sound, as the official ability signals do)
            if (!e[2] && su.startHeld) this.unit(su.def, 'skill', e[1], su.skillIndex ?? undefined);
            su.startHeld = false;
            // 2026-10-10, docs/rules/audio.md 「스킬 종료음」: its ON_SKILL_FINISH / ON_ABILITY_END bank as it ends
            const fin = !e[2] ? skillEndOf(ue, su.skillIndex) : null;
            if (fin) this._play(fin.url, { volume: loopGain(fin), limited: true, bank: `${su.def}:end:${su.skillIndex}` });
          }
        }
        if (kind === 'swing') {
          // 2026-10-10, docs/rules/audio.md 「공격 소리 신호」: a normal attack's swing starts — its START banks now
          // (AbilityStandard.OnCastStart RVA 0x34F0A90), its group child chosen for the whole attack (sim ai.js 'swing')
          const su = this.units.get(e[1]);
          if (!su) continue;
          su.sw = this._swingOf(su, e[3], now, e[2]);
          if (su.sw) this._swingCues(su, su.sw, 's');
          this._kitSound(signalAttackKey(su, 's', e[3] === 'none' || e[3] == null)); // 2026-10-10: its buff's swing sound
          continue;
        }
        if (kind === 'atk') {
          // a chain bounce: its first id is the previous target, whose attack sound this is not (see header)
          if (CHAIN_KINDS.has(e[3])) { this.lastAttacker.delete(e[2]); this.chainStruck.set(e[2], now); continue; }
          const src = this.units.get(e[1]);
          if (!src) continue;
          // only a hostile attack authors the target's next impact (a heal — an ally aiming at an ally — never does)
          const tgt = this.units.get(e[2]);
          const mode = src.skillOn ? src.skillIndex : null; // local patch: the running skill's mode sounds (audioOfficial.js)
          // 2026-10-11, docs/rules/audio.md 「재능·소환물 능력 소리」: a talent's own attack (sim 'atk' 5th field, docs/SIM.md) — its
          // T.<n> banks once per moment instead of the normal attack's cues; its impact is no normal attack's (`talent`)
          const tk = e.length > 4 ? talentAttackKeys(src.def, e[4]) : null;
          if (tk) {
            if (src.lastTalentAt !== now) for (const k of tk) this._kitSound(k);
            src.lastTalentAt = now;
            if (tgt && tgt.side !== src.side) this.lastAttacker.set(e[2], { def: src.def, at: now, mode, id: e[1], talent: true });
            continue;
          }
          src.startHeld = false; // local patch
          // 2026-10-10, docs/rules/audio.md 「공격 소리 신호」: the strike of the open swing (else a swing of its own
          // now: a kit's attack without one) — its ON banks and its projectiles' BORN; the spell index for a multi-hit attack
          let sw = src.sw;
          const open = sw && sw.mode === mode && now - sw.at <= (sw.windup / this.gameSpeed()) * 1000 + 600;
          if (open && sw.n === 0 && sw.windup >= 0.15 && now - sw.at > 20) {
            const est = (sw.windup * 1000) / (now - sw.at); // the game speed, measured (gameSpeed)
            if (est >= 0.25 && est <= 16) this._speedEst = Number.isFinite(this._speedEst) ? this._speedEst * 0.7 + est * 0.3 : est;
          }
          if (!open) {
            sw = this._swingOf(src, e[3], now);
            src.sw = sw;
            if (sw) this._swingCues(src, sw, 's');
          }
          if (sw) {
            // one strike per moment: the client emits ON once per spell (AbilityStandard.DoEmitAudioSignalForSpellOn), not once
            // per target — the sim's 'atk' of each target of the same strike shares its time
            if (!(open && src.lastAtkAt === now && sw.n > 0)) {
              this._swingCues(src, sw, 'a', sw.n++);
              this._spineStrike(src);
              this._kitSound(signalAttackKey(src, 'a', e[3] === 'none' || e[3] == null)); // 2026-10-10: its buff's strike sound
            }
            src.lastAtkAt = now;
            if (tgt && tgt.side !== src.side) this.lastAttacker.set(e[2], { def: src.def, at: now, mode, sw, id: e[1] });
            if (src.side === 'enemy' && !sw.set.cues.some((c) => c.at === 's' || c.at === 'a')) this.battle('enemyHit', { volume: 0.35 });
            continue;
          }
          if (tgt && tgt.side !== src.side) this.lastAttacker.set(e[2], { def: src.def, at: now, mode, id: e[1] });
          if (!this.unit(src.def, 'attack', e[1], undefined, mode) && src.side === 'enemy') this.battle('enemyHit', { volume: 0.35 });
          this.unit(src.def, 'on', e[1], undefined, mode); // 2026-10-10: its ON bank too (START and ON both sound)
        } else if (kind === 'dmg') {
          if (!IMPACT_TYPES.has(e[3])) continue;
          // 2026-10-11 (user report: 아스카론's 死亡拘审 ticks sounded as her attack, docs/rules/audio.md 「지속 피해 틱」): a damage-over-time
          // tick (the sim's 7th field, damage.js dotFlag) is a buff's damage in the client — no ability HIT, no sound — and
          // neither an attack's impact (it must not take the one lastAttacker keeps for the real hit) nor a skill impact
          if (e[6] === 1) continue;
          const by = this.lastAttacker.get(e[1]);
          // 2026-10-10, docs/rules/audio.md 「공격 소리 신호」: the attacker the sim names (6th field, docs/SIM.md) —
          // the impact of its normal attack aimed at this target, or a splash of it (the same moment as its strike / impact), else
          // its skill's own damage (a kit's dealDamage: no attack of its own) → the skill's impact sound
          const aid = e.length > 5 ? e[5] : undefined;
          if (aid != null) {
            const au = this.units.get(aid);
            if (!au) continue;
            const own = by && by.id === aid && now - by.at <= IMPACT_WINDOW_MS ? by : null;
            if (own) this.lastAttacker.delete(e[1]);
            if (own?.talent) continue; // 2026-10-11: a talent attack's impact (its ability has no HIT bank)
            const splash = !own && au.sw && (now - (au.lastAtkAt ?? -Infinity) <= 100 || now - (au.lastImpactAt ?? -Infinity) <= 100);
            // 2026-10-16 (docs/rules/audio.md 「연쇄 공격 소리」): a chain bounce's unit — the shot's per-target HIT sounds
            // only (its REACH sounded at the first unit), and its chain sound once per moment
            const bounce = this.chainStruck.get(e[1]) === now;
            if (bounce) this.chainStruck.delete(e[1]);
            if (own || splash) {
              const sw = own ? own.sw : au.sw;
              au.lastImpactAt = now;
              if (sw && bounce) {
                this._swingCues(au, sw, 'd', sw.h++, (c) => !c.r);
                if (au.lastChainAt !== now) { au.lastChainAt = now; this._swingCues(au, sw, 'c'); }
              } else if (sw) this._swingCues(au, sw, 'd', sw.h++);
              else this.unit(au.def, 'hit', `h${e[1]}`, undefined, own.mode);
              if (own) this._kitSound(signalAttackKey(au, 'd', false)); // 2026-10-10: its buff's impact sound (its own target)
            } else this._skillImpact(au, now);
            continue;
          }
          if (!by) continue;
          this.lastAttacker.delete(e[1]); // one impact per attack
          if (now - by.at > IMPACT_WINDOW_MS || by.talent) continue;
          if (by.sw) { const au = this.units.get(by.id); if (au) this._swingCues(au, by.sw, 'd', by.sw.h++); }
          else this.unit(by.def, 'hit', `h${e[1]}`, undefined, by.mode); // local patch: by.mode
        } else if (kind === 'heal') {
          this.battle('heal', { volume: 0.35 });
        } else if (kind === 'skill' && e[2]) {
          const u = this.units.get(e[1]);
          if (u) {
            const ue = this.getManifest()?.audio?.sfx?.units?.[u.def]; // local patch
            if (modeEntry(ue, u.skillIndex)?.deferStart) u.startHeld = true; // local patch
            else if (!skillLoopOf(ue, u.skillIndex)?.start) this.unit(u.def, 'skill', e[1], u.skillIndex ?? undefined); // local patch: a start bank that loops plays as the loop
            // 作战中N: the equipped skill's own slot (0-based; 作战中4 is the fallback of a 4th slot)
            if (unitSoundClass(u) === 'char') {
              const n = Number.isInteger(u.skillIndex) ? Math.min(4, u.skillIndex + 1) : 1;
              const pick = this.voicePolicy?.skill(u); // local patch: official type + a random 作战中 (voicePolicy.js)
              if (pick) this.voice(u.def, pick.slot, { unitKey: e[1], type: pick.type });
              else this.voice(u.def, `skill${n}`, { unitKey: e[1] });
            }
          }
        } else if (kind === 'engage') {
          // 行动开始: the first attack a unit makes on an enemy (the sim's ENGAGE, official ENCOUNTER_ENEMY, 3 s apart)
          // 2026-10-10: with the official rules (voicePolicy.js) never from an engagement — the client says it on an
          // enemy route preview cursor, and not at all in 卫戍协议 (voice.js voiceForRoutePreview)
          const u = this.units.get(e[1]);
          if (u && unitSoundClass(u) === 'char' && !this.voicePolicy) this.voice(u.def, 'faceEnemy', { unitKey: e[1] });
        } else if (kind === 'die') {
          stopUnitLoops(this, e[1]); // local patch: its loop and held one-shots
          const u = this.units.get(e[1]);
          if (!u) continue;
          if (u.side === 'enemy') this._enemyOut(e[1], now);
          const consumed = this.consumed.delete(e[1]);
          const m = this.getManifest();
          const url = deathSfxUrl(m, u, { consumed, reason: typeof e[2] === 'string' ? e[2] : null });
          if (!url) continue;
          const own = url === m?.audio?.sfx?.units?.[u.def]?.die;
          const mix = own ? m.audio.sfx.units[u.def].mix?.die : null;
          if (!unitSoundPlays(mix, this.random())) continue;
          // local patch: the official mix (audioOfficial.js) instead of unitGain(0.8, mix) / 0.7
          this._playUnitUrl(url, own ? `${u.def}:die` : `b:die:${unitSoundClass(u)}`, own ? officialGain(u.def, 'die', m.audio.sfx.units[u.def], mix) : battleGain(u.side === 'enemy' ? 'enemyDie' : 'charDie')); // the bank
        } else if (kind === 'leak') {
          // 漏怪: an enemy reached its goal (Battle.leak emits the sim's own EV.LEAK — it is NOT a `die`, so until now a
          // leak was completely silent, for the player's own field and for a 联防 the helpers could not hold alike).
          // The cue is the ORIGINAL Arknights stage alarm — the one an enemy entering the exit plays in any normal
          // stage (manifest `sfx.battle.leak`, bank battle.ON_ENEMY_REACHED_EXIT, file b_ui_alarmenter).
          // `LEAK_SFX_GAP_MS` keeps it to one alarm at a time (the official bank's own maxSoundAllowed 1).
          this._enemyOut(e[1], now); // 2026-10-10: the time without an enemy (noEnemyMs)
          if (now - (this.lastLeakSfxAt ?? -Infinity) < LEAK_SFX_GAP_MS) continue;
          if (typeof this.getManifest()?.audio?.sfx?.battle?.leak !== 'string') continue;
          this.lastLeakSfxAt = now;
          this.battle('leak', { volume: 0.85 });
        } else if (kind === 'deploy') {
          const u = this.units.get(e[1]);
          if (!u || u.side === 'enemy' || e[2] === 1) continue;   // (e[2] 1: a flight's landing, sim moveRedeploy inPlace — silent)
          // the opening deployment (OPENING_SLACK_MS): the sim brings it in one piece group per PREBUILT_INTERVAL, each
          // piece sounds with its own 'deploy'
          let opening = false;
          const step = (PREBUILT_INTERVAL * 1000) / this.gameSpeed() + OPENING_SLACK_MS;
          if (unitSoundClass(u) !== 'device') {
            const op = this._opening;
            if (!op) { this._opening = { at: now, ids: [e[1]], over: false }; opening = true; }
            else if (!op.over && now - op.at <= step) { op.at = now; op.ids.push(e[1]); opening = true; }
            if (opening && this.voicePolicy) this._armBattleStartLine(step); // summons come last: they move it on too
          }
          if (this._skillEarly?.has(e[1])) this._flushSkillEarly(e[1]); // local patch: its deploy-time skill (see 'spawn')
          const m = this.getManifest();
          const url = deploySfxUrl(m, u);
          // the battle start's line (the opening deployment, below) and the 部署 line of a later deployment
          // (a knocked-out operator redeploying in the same battle is one of the others; a summon says nothing).
          // Kept ahead of the deploy-SFX guards below: the voice channel is independent of the unit sound's roll.
          // local patch (maintainer's decision 2026-10-08 「C」): a 复活 (M3茧甲 / 埃芒加德 reviveNow — a redeploy in the
          // knock-out's tick, its 'revive' fx in the same batch) keeps the drop and b_char_set but says no 部署 line
          const revived = ev.some((x) => Array.isArray(x) && x[0] === 'fx' && x[1] === 'revive' && x[4]?.id === e[1]);
          if (unitSoundClass(u) === 'char' && !revived && this.voicePolicy) {
            // 2026-10-10, docs/rules/audio.md 「오퍼레이터 음성」: the battle start — one random own piece's 部署
            // (voicePolicy.js battleStart; no 行动出发 in 卫戍协议) at the client's ON_BATTLE_STARTED: one PREBUILT_INTERVAL
            // after the opening's last deploy (each opening deploy moves it on); the rest of the opening stays silent, a
            // later deployment (a redeploy) says its 部署
            if (!opening && !this._opening?.pending && this.voicePolicy.place(now)) this.voice(u.def, 'place', { unitKey: e[1], type: 'PLACE_CHAR' });
          } else if (unitSoundClass(u) === 'char' && !revived) { // upstream's own rule (no voicePolicy installed)
            if (!this.startVoiceDone) {
              this.startVoiceDone = true;
              if (!this.voice(u.def, 'start')) this.voice(u.def, 'place', { unitKey: e[1] });
            } else this.voice(u.def, 'place', { unitKey: e[1] });
          }
          if (!url) continue;
          // local patch (maintainer report 2026-10-07): a piece dropped in by the prep just before the battle began sounded there
          const prep = this._prepDeployAt?.get(u.def);
          if (prep != null && now - prep < PREP_DEPLOY_OVERLAP_MS) continue;
          // local patch (maintainer report 2026-10-07): 望's 跟子 is a projectile of hers (PRTS) — it lands with
          // ON_PROJECTILE_BORN (kitStartKey 'wang:thrown', its summon fx `follower` in the same tick), not as a stone's birth
          if (ev.some((x) => Array.isArray(x) && x[0] === 'fx' && x[1] === 'summon' && x[4]?.follower && x[4].id === e[1])) continue;
          this.playDeploySfx(u, e[1]);
        } else if (kind === 'fx') {
          // 2026-10-10, docs/rules/audio.md 「적 소리」: an enemy skill's cast (sim fx 'enemySkill' { id, ability }) —
          // its ability's START / ON banks and projectiles' BORN now, its impacts on the damage it deals (_skillImpact)
          if (e[1] === 'enemySkill' && e[4]?.id != null && typeof e[4].ability === 'string') {
            const eu = this.units.get(e[4].id);
            const cues = eu ? this.getManifest()?.audio?.sfx?.units?.[eu.def]?.sk?.[e[4].ability.toLowerCase()] : null;
            if (eu && Array.isArray(cues)) {
              for (const c of cues) if (c.at !== 'd') this._playCue(eu.def, c, true);
              eu.eskill = { name: e[4].ability.toLowerCase(), at: now };
            }
          }
          // local patch (maintainer report): a dollkeeper's form switch (归溟幽灵鲨: to the 替身 and back, audioOfficial.js)
          const ds = e[4]?.id != null ? dollSwitchSfx(this.units.get(e[4].id)?.def, e[1]) : null;
          if (ds) this._dollSwitch(e[4].id, ds);
          // local patch: a kit's skill hit — its official hit sound (sfx.kit, tools/assets/kit-sfx.mjs), one at a time per key
          // local patch (maintainer report 2026-10-07): the skill's going-off sound first (kitStartKey), then its impact
          const unitOf = (id) => this.units.get(id);
          // 2026-10-10: a 过载 starts — the running skill's attacks sound its overloaded buff banks from now (signalAttackKey)
          if (e[1] === 'overload' && e[4]?.id != null) { const ou = unitOf(e[4].id); if (ou) ou.over = true; }
          // 2026-10-11: a summon's prefab mode from now on (tokenModeName) — 流形's copy names it, a split copy keeps its origin's
          if ((e[1] === 'copy' || e[1] === 'split') && e[4]?.id != null) {
            const tu = unitOf(e[4].id);
            const from = e[1] === 'split' ? unitOf(e[4].src) : null;
            const tmode = e[1] === 'copy' ? e[4].mode : from?.tmode;
            if (tu && (tmode === 'Melee' || tmode === 'Range')) { tu.tmode = tmode; tu.tby = e[1] === 'copy' ? e[4].by ?? null : from.tby; tu.sw = null; tu.vm = null; }
          }
          for (const hk of [kitStartKey(e[1], e[4], unitOf), kitHitKey(e[1], e[4], unitOf), signalFxKey(e[1], e[4], unitOf)]) this._kitSound(hk);
          // a summon used up by its own effect (香槟炸弹 exploding: `consumed`): its impact sound now, no death sound
          const ex = e[4];
          if (!ex || typeof ex !== 'object' || !ex.consumed || ex.id == null) continue;
          const u = this.units.get(ex.id);
          if (!u || u.side === 'enemy') continue;
          this.consumed.add(ex.id);
          if (this.consumed.size > 200) this.consumed.delete(this.consumed.values().next().value);
          this.unit(u.def, 'hit', `${ex.id}:boom`);
        } else if (kind === 'bounty') {
          this.battle('killCoin');
        } else if (kind === 'layer') {
          // upstream #482: a bond's layers rose in this battle ([layer, playerId, bondId, add], sim battle/economy.js)
          this.layerGain(e[2], e[3], 'battle');
        }
      }
    } catch (err) { this._warn('events', err); }
  }
}

/** The phases a battle runs in (its skills' loops may play); 结算 stops the client's combat (match/settle.js). */
const BATTLE_PHASES = new Set([PHASE.COMBAT, PHASE.UNITE, PHASE.FINAL_ASSAULT, PHASE.HIDDEN_CORE]);

let manifestGetter = () => null;
/** App-wide audio manager. */
export const audio = new AudioManager({ getManifest: () => manifestGetter() });

/**
 * Wire the singleton to the app (called once by main.js): manifest source, settings and store-driven BGM.
 * @param {{ getManifest: () => any, subscribe: (fn: (s:any, prev:any) => void) => () => void, getState: () => any,
 *   selectRoute: (s:any) => string, settings?: { bgm:number, sfx:number, voice:number, muted:boolean } }} deps
 */
export function installAudio(deps) {
  try {
    manifestGetter = typeof deps?.getManifest === 'function' ? deps.getManifest : manifestGetter;
    audio.install();
    if (deps?.settings) audio.setVolumes(deps.settings);
    if (typeof deps?.subscribe === 'function' && typeof deps?.getState === 'function') {
      const sync = (s) => {
        try {
          const pub = s.match?.public ?? null;
          // 开战 BGM: the round's own track out of bgm.combatAlts (骑士之日 / 无畏者 are fixed per round, not drawn),
          // so every client of a room hears the same one, a mid-fight re-render (or a teammate view) never switches,
          // and the next round moves on by the table. 联防 shares its round ⇒ same key ⇒ the loop keeps playing.
          audio.playBgm(bgmKeyFor(deps.selectRoute(s), pub, combatTrackFor(pub?.round)));
          // a skill's held sounds never outlive its battle: a battle that ends sends no skill off / 'die' for the units
          // still on the field, so 薄绿's field loop played on through the 休整期 (maintainer report 2026-10-10)
          if (!pub?.phase || !BATTLE_PHASES.has(pub.phase)) stopSkillLoops(audio);
          // upstream #482: the layer-up cue stays in the game screen; a battle's cue ends with its battle (a prep gain's
          // m.layer can come before the m.public of the phase it belongs to — only the battle's cue is cut)
          if (deps.selectRoute(s) !== 'game') audio.stopBondCue();
          else if (!pub?.phase || !BATTLE_PHASES.has(pub.phase)) audio.stopBondCue('battle');
        } catch { /* ignore */ }
      };
      sync(deps.getState());
      return deps.subscribe((s, prev) => {
        if (s.match?.public?.phase !== prev?.match?.public?.phase || s.room !== prev?.room || s.session !== prev?.session
          || s.match?.public?.bossId !== prev?.match?.public?.bossId) sync(s);
      });
    }
  } catch (err) { console.warn('[audio] install failed', err); }
  return () => {};
}
