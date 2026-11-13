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

import { PHASE, PREBUILT_INTERVAL, UF } from '../../shared/constants.js';
import { enemyRecordMode } from '../../shared/skill-modes.js'; // 2026-10-23: an ally from an enemy record (炎佑)
import { mediaUrl } from './media.js';
import { officialGain, groupGain, battleGain, modeEntry, BATTLE_GROUP, VOICE_GAIN, startSkillLoop, stopSkillLoop, stopSkillLoops, skillLoopOf, loopGain, stopUnitLoops, skillExtrasOf, castCuesOf, skillBeginOf, dollSwitchSfx, bankPlayOf, playPitch, skillEndOf, modeOn, roleGroup, cueSetOf, cueAbility, pickVariant, cuesAt, cueFile } from './audioOfficial.js'; // local patch: official mix + skill-mode sounds + skill loops / extras + bank play values
import { holdSnapshot, sfxOut, snapshotHookOf } from './audioSnapshot.js'; // local patch: mixer snapshots (归溟幽灵鲨's 替身 switch)

/**
 * 2026-10-10: concurrent battle sounds at most the client's real voice count (its AudioManager setting m_RealVoiceCount, 32);
 * the old 8 + 160 ms per unit + 45 ms per URL + 2 per URL had no official basis.
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
/** The Spine clip events the client sounds (AnimationConsts ON_PLAY_AUDIO_EVENT[_1–3]; AudioManager.spineEvent). */
const SPINE_AUDIO_EVENT = /^OnPlayAudio(?:_[1-3])?$/;
/**
 * The `sfx.kit` key of a 卫戍协议 template effect (sim status event 'tplfx') whose buff carries an `audioSignal`, played
 * as it starts (bank battle.ON_BUFF_START.<signal>). The mode's templates have one: 卡西米尔 [ex]'s [ex_damage_effect].
 */
export const TPL_FX_SOUNDS = Object.freeze({ common_071_bond_kazimierz_hit_01_new: 'kazimierz:ex' });
/** 昆图斯's 物种爆发: dslily_doom[effect] lasts 3.2 s from the Doom's ON_SPELL_ON and triggers every 1 s (its BuffData). */
const DSLILY_DOOM_TICKS = Object.freeze([1, 2, 3]);
/** “萨米的意志”'s Doom: enemy_smdeer_doom[audio] (1.8 s from ON_CAST_START) plays its sound as it ends. */
const SMDEER_DOOM_AFTER = 1.8;
/** “帝国的甲胄”'s barrage: Skills/Appear/effect puts enemy_vtsk_skillRange on its target, whose 0.8 s inner buff ends into the
 *  range tile effect and its sound (2026-11-03, EN client prefab + buff templates). */
const VTSK_RANGE_AFTER = 0.8;
/**
 * The 'dmg' 9th field's moments whose buff template plays a sound on the target: 克莱门莎 T1's won roll, 酒神 S2's 本能的召唤 ticks, 引星棘刺 S2's
 * ticks (thorn2_s2_projectile_hit); 2026-11-07: 旅骨's ticks (S1 hbound_s_1[dot], S2 only the heavy enemies' hbound_s_2[heavy_damage]).
 */
const MOMENT_SOUNDS = Object.freeze({
  'clemnt_t1[dice_damage]': 'clemnt:t1', 'phatm2_s_2[damage]': 'phatm2:s2dmg', thorn2_s2_damage: 'thorn2:s2hit',
  'hbound_s_1[dot]': 'hbound:s1dot', 'hbound_s_2[heavy_damage]': 'hbound:s2dot',
  // 2026-11-13: 结城理 S2's execute (makoto_skill_02_hit_01_finish's OnPlayAudioPlayer), S3 塔纳托斯's 弱点 hit by the type it was
  // dealt as (makoto_s3_1_standin ON_CALCULATE_DAMAGE CheckDamageType → PlayAudio)
  makoto_s2_fear_aura_inst_kill: 'makoto:execute', 'makoto_s3_1_standin[phys]': 'makoto:s3phys', 'makoto_s3_1_standin[arts]': 'makoto:s3arts',
});
/** Skill abilities with `_fireAttackFinishEvent`: their ON_ABILITY_ATTACK_FINISH as the end clip starts (docs/rules/audio.md 「스킬 시전 능력 소리」). */
const ATTACK_FINISH_SOUNDS = Object.freeze({ char_388_mint: Object.freeze({ 1: 'mint:s2end' }), char_484_robrta: Object.freeze({ 1: 'robrta:s2end' }) });
const REBORN_SOUNDS = Object.freeze({ enemy_1512_mcmstr: 'mcmstr:reborn' });
const STATUE_SOUNDS = Object.freeze({ enemy_1172_dugago: 'dugago:reborn', enemy_1172_dugago_2: 'dugago:reborn' });
const REVIVE_SOUNDS = Object.freeze({
  enemy_1288_duskls: 'duskls:revive', enemy_1288_duskls_2: 'duskls:revive', enemy_1292_duskld: 'duskld:revive', enemy_9010_acpupp: 'acpupp:revive',
});
/** An enemy's kit buff whose end sounds: 喷气人's flight (ab:takeoff) ends into balloon_s[land] (its audioSignal). */
const ENEMY_STATUS_OFF_SOUNDS = Object.freeze({ enemy_2004_balloon: Object.freeze({ 'ab:takeoff': 'balloon:land' }) });
export function enemyStatusOffSound(key, holderDef) { return ENEMY_STATUS_OFF_SOUNDS[holderDef]?.[key] ?? null; }
/**
 * 2026-11-12, docs/rules/audio.md 「원소 폭발 소리」: the `sfx.kit` keys of an element burst (sim fx 'burst' { id, element }) as it
 * starts, by the sim's element (burn 灼燃 = FIRE, erosion 侵蚀 = WATER, neural 神经损伤 = SANITY, apoptosis 凋亡 = DARK, rampage
 * 狂躁 = ANGER). Both sides sound, except an operator's 狂躁 (ep_break_anger_char creates no buff with a signal).
 */
const BURST_SOUNDS = Object.freeze({
  burn: Object.freeze(['ep:fire', 'ep:fireshow']), erosion: Object.freeze(['ep:water']), neural: Object.freeze(['ep:sanity']),
  apoptosis: Object.freeze(['ep:dark']), rampage: Object.freeze(['ep:anger']),
});
export function elementBurstSounds(ex, unitOf) {
  const keys = ex && BURST_SOUNDS[ex.element];
  if (!keys) return [];
  return ex.element === 'rampage' && unitOf(ex.id)?.side !== 'enemy' ? [] : keys;
}
/**
 * 2026-11-12: a 萨卡兹子裔's knock-out sound (sim 'die' with reason 'killed'): the template that summons its 重生造物 sounds
 * as it falls (enemy_vampires[bloodsucker_summon] — 战士 / 工匠 / 链术师 / 集恨者 —, enemy_dthrow_summon[dzoms] — 轰击者 /
 * 责罚者; EN client prefabs), not when the summon comes `delay` s later.
 */
const REBORN_SUMMON_SOUNDS = Object.freeze({
  enemy_1222_dpvt: 'bloodsucker:summon', enemy_1222_dpvt_2: 'bloodsucker:summon', enemy_1223_dmech: 'bloodsucker:summon',
  enemy_1223_dmech_2: 'bloodsucker:summon', enemy_1225_dkmage: 'bloodsucker:summon', enemy_1225_dkmage_2: 'bloodsucker:summon',
  enemy_1226_dklord: 'bloodsucker:summon', enemy_1226_dklord_2: 'bloodsucker:summon',
  enemy_1361_dthrow: 'dzoms:summon', enemy_1361_dthrow_2: 'dzoms:summon', enemy_1362_dfat: 'dzoms:summon', enemy_1362_dfat_2: 'dzoms:summon',
});
export function knockOutSound(def, reason) { return reason === 'killed' ? REBORN_SUMMON_SOUNDS[def] ?? null : null; }
const MNCTUR = /^enemy_10163_mnctur/;
/**
 * 2026-11-12: 神勇的帕拉杜利斯's charge ending (sim fx 'enemySkill' rushEndNormal): its collision's sound when it struck a unit
 * in this batch (its 'dmg', 6th field = the attacker — in Run it has no attack, so its only damage is the collision; the
 * sim plays rushEndNormal right after it), none when it reached the spot with nobody met.
 */
export function mncturHitSound(ex, unitOf, batch) {
  if (!ex || ex.ability !== 'rushEndNormal' || !MNCTUR.test(unitOf(ex.id)?.def || '') || !Array.isArray(batch)) return null;
  return batch.some((x) => Array.isArray(x) && x[0] === 'dmg' && x[5] === ex.id) ? 'mnctur:hit' : null;
}
/**
 * 2026-11-03, docs/rules/audio.md 「적 버프·커스텀 트리거 소리」: the `sfx.kit` keys (with a delay in game seconds, or null) an
 * enemy's buff or custom-trigger sound plays on for a sim fx event, from the EN client's enemy prefabs and buff templates —
 * a prisoner's 【解放】 (fx 'liberate', `forced` when another freed it), 阿利斯泰尔's piece picked up and vest taken, 绯红歌伶's
 * war song, a hand of 假想敌：胄 shot down, “余音”'s ensembles · pulse · hit switch, 昆图斯's and “萨米的意志”'s dooms; 灼藤's
 * first burst, “萨科塔之眼”'s bullet theft, “帝国的甲胄”'s barrage range.
 * @returns {([string, number|null]|[string, null, number])[]} a third field: once per unit, `n` units
 */
export function enemyBuffSounds(fx, ex, unitOf) {
  if (!ex || typeof ex !== 'object') return [];
  const def = (id) => unitOf(id)?.def || '';
  switch (fx) {
    case 'liberate': return ex.forced ? [['liberty:force', null], ['liberty:state', null]] : [['liberty:state', null]];
    case 'equip': return ex.kind === 'pickup' ? [['vtmstr:equip', null]] : [];
    case 'vest': return def(ex.id) === 'enemy_9032_aclionk' ? [['vtlionk:shld', null]] : [];
    case 'telegraph':
      if (ex.kind === 'songOfWar') return [['csdcr:skill', null]];
      if (ex.kind === 'speciesBurst') return DSLILY_DOOM_TICKS.map((t) => ['dslily:doom', t]);
      if (ex.kind === 'reborn') return def(ex.id) === 'enemy_1535_wlfmster' ? [['wlfmster:reborn', null]] : [];
      if (ex.kind === 'barrage') return def(ex.id) === 'enemy_10027_vtsk' ? [['vtsk:range', VTSK_RANGE_AFTER]] : [];
      return ex.kind === 'samiDoom' ? [['smdeer:doom', SMDEER_DOOM_AFTER]] : [];
    case 'phase': {
      if (ex.kind === 'float') return def(ex.id) === 'enemy_10045_parrot' ? [['parrot:fly', null]] : [];   // floating again
      if (ex.kind === 'shotDown') { const d = def(ex.id); return d === 'enemy_9014_acstma' ? [['acstma:stun', null]] : d === 'enemy_9015_acstmb' ? [['acstmb:stun', null]] : []; }
      // acdums_t_1's switch after its hits (not the form a summon starts in or a 管 / 弦 hands it): to Passion switch_a
      if (ex.hit && (ex.kind === 'echo_gold' || ex.kind === 'echo_dark')) return [[ex.kind === 'echo_gold' ? 'acdums:switcha' : 'acdums:switchb', null]];
      // 2026-11-12: 神勇的帕拉杜利斯 setting off on its charge (Skills/rush's ActionToOwner: SwitchMode Run, PlayAudio)
      if (ex.form === 'Run' && MNCTUR.test(def(ex.id))) return [['mnctur:run', null]];
      return [];
    }
    // 2026-11-12: 魂灵法骸 / 魂灵残迹 taking a soul (…[captureSoul]: soulBuff with its audioSignal, below 3 souls)
    case 'capture': { const d = def(ex.id); return /^enemy_1431_lrmzrd/.test(d) ? [['lrmzrd:capture', null]] : /^enemy_1429_lrwzrd/.test(d) ? [['lrwzrd:capture', null]] : []; }
    case 'explode': return ex.kind === 'echoPulse' ? [['acdums:aoe', null]] : ex.kind === 'boil' && ex.n > 0 ? [['cjhot:hit', null, ex.n]]
      : ex.kind === 'flameVine' ? [['ftsjc:aoe', null]] : [];
    case 'steal': return /^enemy_10084_hlegle/.test(def(ex.from)) ? [['hlegle:steal', null]] : [];
    case 'pulse': return ex.n > 0 && /^enemy_1234_dsubrl/.test(def(ex.id)) ? [['dsubrl:hit', null, ex.n]] : [];
    case 'link': return ex.kind === 'faithLink' && ex.n > 0 ? [['achunt:chain', null, ex.n]] : [];
    case 'revive': { // the end of a 重生 (archetypes.js reborn / statue / husk)
      const k = ex.kind === 'reborn' ? REBORN_SOUNDS[def(ex.id)] : ex.kind === 'fly' ? STATUE_SOUNDS[def(ex.id)] : ex.form === 'revived' ? REVIVE_SOUNDS[def(ex.id)] : null;
      return k ? [[k, null]] : [];
    }
    case 'enemySkill':
      if (def(ex.id) !== 'enemy_9023_acdums') return [];
      return ex.ability === 'PassionSkill' ? [['acdums:passion', null], ['acdums:passion2', null]]
        : ex.ability === 'DepassionSkill' ? [['acdums:depassion', null], ['acdums:depassion2', null]] : [];
    default: return [];
  }
}
/** 2026-11-12: 暴走食人花 (and the main story's 食人花, whose banks are the same) — its digesting (AudioManager._seasonState). */
const TRWLPL = /^enemy_10003_trwlpl/;
/** 2026-11-12: 赘生甲壳 (the ally-side TRAP a 微核沉积者 leaves): its own ON_UNIT_BORN / ON_UNIT_DEAD banks. */
const DSSHELL = 'trap_156_dsshell';
/** 2026-11-12: 机械师 (char_4230_mcnist) and 淬羽赫默 (char_1031_slent2), the 规程 chess picks whose kit events sound sfx.kit keys. */
const MCNIST = 'char_4230_mcnist';
const SLENT2 = 'char_1031_slent2';
/** 机械师 S3's cross lands this long after its throw (op-mcnist.js X6_DELAY, game seconds). */
const MCNIST_CROSS_AFTER = 0.8;
/**
 * 2026-11-12, docs/rules/audio.md 「규정 새 적 소리 — 셋째」·diy.md 「선발 추가 …」 소리: the `sfx.kit` keys (with a delay in game
 * seconds, or null) a sim fx event of the 悬赏 enemies, 赘生甲壳's makers and the 规程 chess picks plays —
 * 遮天面包机's bomb dropped (`telegraph` nsbomb: enemy_nsbomb[passive] → TriggerAbility Bomb, ON of T.Passive) and landed
 * (`explode` nsbomb: projectile_enemy_nsbomb REACH, target or none); 聆风猎手's Blink (`teleport` shkrbt: Skills/Blink START,
 * then shkrbt_blink_end [추정·CN: the end's moment — no EN node carries the signal, BlinkState / BlinkNode sound nothing; the
 * sim's blink is instant, so both at once]); 淬羽赫默 S3's 不死 (`undying` from her: slent2_s_3's buff with
 * audioSignal slent2_shallow_grave_audio); 机械师 S2's 屏障 breaking while S2 runs (`shieldBreak` on: mcnist_s_2_shield's burst
 * branch, PlayAudio mcnist_s_2_shield — its other branch has none), S3's charge (`charge`: the projectile's BORN — and its
 * REACH on the landing 'aoe', AudioManager) and cross (`aoe` mcnist:cross → mcnist_skill_attack_hit as it lands
 * [추정·CN: no client node found carrying the signal — sounded once, as the cross lands]); 염괴포 taking an enemy aboard (`cannon`
 * carry 1: cnnon_carry_enemy's audioSignal — the 规程 shot EnemyCannon00D and its _small_death shell have no banks).
 * @returns {[string, number|null][]}
 */
export function seasonSounds(fx, ex, unitOf) {
  if (!ex || typeof ex !== 'object') return [];
  const def = (id) => unitOf(id)?.def || '';
  switch (fx) {
    case 'telegraph': return ex.kind === 'nsbomb' ? [['nsbomb:drop', null]] : [];
    case 'explode': return ex.kind === 'nsbomb' ? [['nsbomb:reach', null]] : [];
    case 'teleport': return ex.kind === 'shkrbt' ? [['shkrbt:blink', null], ['shkrbt:blinkend', null]] : [];
    case 'undying': return def(ex.src) === SLENT2 ? [['slent2:grave', null]] : [];
    case 'shieldBreak': return ex.on && def(ex.src) === MCNIST ? [['mcnist:s2shield', null]] : [];
    case 'cannon': return ex.carry === 1 ? [['cnnon:carry', null]] : [];   // 염괴포 takes an enemy aboard (its shot / landing: no banks)
    case 'charge': return def(ex.src) === MCNIST && mcnistChargeSounds(ex) ? [['mcnist:s3born', null]] : [];
    case 'aoe': return ex.skill === 'mcnist:cross' && def(ex.id) === MCNIST ? [['mcnist:s3hit', MCNIST_CROSS_AFTER]] : [];
    default: return [];
  }
}
/** 2026-11-13: 结城理 (char_4217_makoto), the 自选 傀儡师 whose <替身> fights as the picked skill's persona. */
const MAKOTO = 'char_4217_makoto';
/** His switch to the <替身>, per skill index: the SwitchEnd gun and the persona's range appearing (S1 俄耳甫斯 has no range sound). */
const MAKOTO_GUN = Object.freeze(['makoto:s1gun', 'makoto:s2gun', 'makoto:s3gun']);
const MAKOTO_RANGE = Object.freeze([null, 'makoto:s2range', 'makoto:s3range1']);
/**
 * Game seconds after the sim's fx (CN client): makoto[switch2stand_s<n>]'s SwitchEnd starts after the 1 s SwitchOut step
 * (S3's change to 俄耳甫斯: after the 0.5 s ChangeBegin) — its AudioOnEventBehaviour on ON_CAST_START; the mode switches 0.99 s
 * into SwitchEnd (makoto_delayed_switchend), which shows the mode's range attach effect — its `_start` prefab's OnPlayAudioPlayer
 * (no `_delayToEmit`) — as render/fxmap.js DOLL_SWITCH_FX draws it; makoto_talent_finish_01's damage sound waits its
 * `_delayToEmit` 0.45 s, makoto_skill_01_heal_01's 0.5 s; S3's heal sounds as makoto_s3_2_be_healed (0.5 s) finishes.
 */
const MAKOTO_AT = Object.freeze({ gun: 1, range: 1.99, s3gun: 0.5, s3range: 1.49, alloutHit: 0.45, s1heal: 0.5, s3heal: 0.5 });
/**
 * 2026-11-13, docs/rules/audio.md 「유키 마코토 페르소나 소리」: the `sfx.kit` keys (with a delay in game seconds, or null) a sim fx
 * event of 结城理 `su` (the tracked unit of the fx's `id`) plays — to the <替身> (`substitute`: the gun of the picked skill's
 * persona, makoto[switch2stand_s<n>]/SwitchEnd, then its range — S2 / S3), S3's change to 俄耳甫斯 (`persona` orpheus:
 * makoto[switch2stand_s3_2]'s gun and range), the switch back (`swap`: always the 总攻击 — every 自选 form has S.E.E.S.队长 —
 * makoto[switch2normal_allout]/AlloutAttack's start and makoto_talent_finish_01's flash and damage), S3 俄耳甫斯's heal
 * landing (`kitHit` makoto:heal: makoto_s3_2_be_healed ON_BUFF_FINISH PlayAudio).
 * @returns {[string, number|null][]}
 */
export function makotoSounds(fx, ex, su) {
  if (!ex || typeof ex !== 'object' || su?.def !== MAKOTO) return [];
  const i = Number.isInteger(su.skillIndex) ? su.skillIndex : -1;
  switch (fx) {
    case 'substitute': return /** @type {[string, number][]} */ ([[MAKOTO_GUN[i], MAKOTO_AT.gun], [MAKOTO_RANGE[i], MAKOTO_AT.range]].filter(([k]) => typeof k === 'string'));
    case 'persona': return ex.form === 'orpheus' ? [['makoto:s3orpheus', MAKOTO_AT.s3gun], ['makoto:s3range2', MAKOTO_AT.s3range]] : [];
    case 'swap': return [['makoto:allout', null], ['makoto:alloutFlash', null], ['makoto:alloutHit', MAKOTO_AT.alloutHit]];
    case 'kitHit': return ex.k === 'makoto:heal' ? [['makoto:s3heal', MAKOTO_AT.s3heal]] : [];
    default: return [];
  }
}
/** 2026-11-13: the sim fx that switch a 傀儡师's form (professions.js installDollkeeper; op-makoto.js toOrpheus 'persona'). */
const DOLL_FORM_FX = new Set(['substitute', 'persona', 'swap', 'dollEnd']);
/**
 * 2026-11-12: whether 机械师 S3's charge (sim fx 'charge' { dir, left }) flies a projectile with banks. mcnist_s_3_projectile_real
 * picks it by the 结构性原理's deploy direction and its left / right facing (CheckFaceLOrR): UP → _up facing left, else
 * _up_right; DOWN → _down / _down_right; sideways → the plain one / _right. _up_right and _down_right have no banks (zh_CN
 * audio_data), so an up / down charge facing right is silent.
 */
export function mcnistChargeSounds(ex) {
  return !((ex.dir === 'UP' || ex.dir === 'DOWN') && !ex.left);
}
/**
 * 2026-11-12: an enemy skill whose ON sounds once per shot, not as it is cast — the 'atk' kind each shot sends (sim) → the
 * skill (sfx.units[def].sk key). 破城者's SkyProjectile: a sequence whose MultiRangedAttack (child 2, ON SkyProjectile.2)
 * fires each missile; its START (child 1) as it is cast.
 */
const ENEMY_SHOT_SKILLS = Object.freeze({ uareapMissile: 'skyprojectile' });
const ENEMY_SHOT_OF = Object.freeze(Object.fromEntries(Object.entries(ENEMY_SHOT_SKILLS).map(([k, v]) => [v, k])));
/**
 * 2026-11-01: the `sfx.kit` key of a kit buff (sim 'status' key, `<base>:<source id>` for one per applier) whose client buff
 * carries an `audioSignal` — Entity.OnBuffStart / OnBuffShowEffect sound it on the holder as it starts. 冻河 (CN buff
 * templates): her S1 屏障 tocka_s1[shield], S2 attack speed tocka_s2[auto_skill], S3 ATK tocka_s3[bonus] (on the ally and
 * on her) — the SHOW_EFFECT banks too: Entity.OnBuffStart → AddBuffEffect sounds them at the buff's start.
 */
const STATUS_SOUNDS = Object.freeze({
  'tocka:shield': 'tocka:s1shield', 'tocka:auto': 'tocka:s2auto', 'tocka:bonus': 'tocka:s3bonus',
  // 2026-11-12: 假想敌：镜眼's slow on an arts attacker (acrefm[atk-spd-down], EXTEND: a refresh is no new start — nor here, the
  // sim's 'status' on comes only as it is first put on)
  'ab:acrefmSlow': 'acrefm:slow',
});
/**
 * A catalogue status by its applier's model (the sim 'status' 5th field): 予愿安洁莉娜 S2's sweep — 浮空 / 缚地 on each enemy
 * it reaches (aglna2_s_2[enemy] CreateBuff audioSignal …[levitate] / …[ground_bound]) [하한: an enemy already 浮空 / 缚地 when
 * it is reached sends no new 'status', and stays silent].
 */
const SOURCE_STATUS_SOUNDS = Object.freeze({ char_1015_aglna2: Object.freeze({ levitate: 'aglna2:levitate', groundbind: 'aglna2:groundbind' }) });
export function statusSoundKey(key, sourceDef = null) {
  if (typeof key !== 'string') return null;
  return STATUS_SOUNDS[key] ?? STATUS_SOUNDS[key.replace(/:\d+$/, '')] ?? SOURCE_STATUS_SOUNDS[sourceDef]?.[key] ?? null;
}

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
    case 'zone': return ex.token === 'token_10064_wang_stone1' && [2, 3].includes(ex.skill) ? `wang:${ex.skill}`
      // 2026-10-29: 引星棘刺 S3's alchemy unit thrown at an operator (its projectile_chr_thorn2_s3 stopping there)
      : ex.thrown && def(ex.id) === 'char_1039_thorn2' ? 'thorn2:s3'
      // 2026-11-04: 引星棘刺 S2's alchemy unit landing (projectile_chr_thorn2_s2 REACH), not the zone's per-second updates
      : ex.reach && def(ex.id) === 'char_1039_thorn2' ? 'thorn2:s2'
      // 2026-11-01: 塔露拉's footprint on a newly leased tile (castedTimeThreshold 1: not a re-lease) [추정·CN: whether a
      // re-lease counts as another cast — TimedTileLeaseAbility is CN-only]
      : ex.n === 1 && def(ex.id) === 'char_4247_oxi' ? 'oxi:field'
      // 2026-11-07: 克里斯汀 S2's orb landing (the kit sends this as it lands; its REACH)
      : ex.skill === 'christ' && def(ex.id) === 'char_4198_christ' ? 'christ:s2reach' : null;
    case 'wangLink': return ex.first ? 'wang:link' : null;
    case 'swordStorm': return ex.id != null && def(ex.id) === 'char_1050_chen3' ? 'chen3:s2' : null;
    // local patch (maintainer report 2026-10-07): 蕾缪安 S3 — the bombardment's start (first shell), each landing, the lock
    // mark (S2's aim lock sends the same fx: only while her S3 is equipped)
    case 'bombardShell': return def(ex.id) === 'char_1035_wisdel' ? 'wisdel:s2' : def(ex.id) === 'char_1034_jesca2' ? 'jesca2:s3shell' : def(ex.id) === 'char_4193_lemuen' && ex.i === 0 ? 'lemuen:s3end'
      : emppnt(unitOf(ex.id)) ? 'emppnt:aim' : null;
    // 2026-11-04: 涤火杰西卡 S3's shell exploding (its projectile's STOP)
    case 'bombard': return def(ex.id) === 'char_4193_lemuen' ? 'lemuen:shell' : def(ex.id) === 'char_1034_jesca2' ? 'jesca2:s3bomb' : null;
    // 2026-11-01: 蕾缪安 S2's aimed shot (its Aim ability's projectile_chr_lemuen_s2 HIT; the ON: signalFxKey)
    case 'crit': { const u = unitOf(ex.src); return u?.def === 'char_4193_lemuen' && u.skillIndex === 1 ? 'lemuen:s2hit' : null; }
    case 'lock': { const u = unitOf(ex.src); return u?.def === 'char_4193_lemuen' && u.skillIndex === 2 ? 'lemuen:mark'
      : u?.def === 'char_4231_clemnt' ? 'clemnt:s3reach' : null; } // 2026-10-29: 克莱门莎 S3's shell reaching the marked enemy
    // 2026-10-29: 克莱门莎 S2 — the carriage fired, the vortex fired where it stops; S3 — each shell's impact (its audio behaviour)
    case 'anchor': return def(ex.id) === 'char_4231_clemnt' ? 'clemnt:s2cab' : null;
    case 'tide': return def(ex.id) === 'char_4231_clemnt' ? 'clemnt:s2tide' : null;
    // 2026-11-01: 塔露拉 S3 — a 簇火 exploding (its projectile's HIT; the blast names its wave `w`, S2's retaliation does not)
    case 'blast': return def(ex.id) === 'char_4231_clemnt' ? 'clemnt:s3hit' : ex.w != null && def(ex.id) === 'char_4247_oxi' ? 'oxi:s3hit' : null;
    // 2026-11-01: 冻河 — S3's triggered effect put on an ally (tocka_s3[trigger], audioSignal tocka_s3_trigger_start_audio), S2's
    // projectile reaching its ally (projectile_chr_tocka_s2 HIT)
    case 'tockaFx': return def(ex.src) !== 'char_4244_tocka' ? null : ex.s === 3 ? 'tocka:s3trigger' : ex.s === 2 && ex.shot ? 'tocka:s2hit' : null;
    case 'explode': return def(ex.by) === 'char_1035_wisdel' ? 'wisdel:bomb'
      // 2026-11-07: 가상적: 관's and 현's shot arriving (projectile_enemy_acduml / _acdumm REACH, its burst)
      : ex.kind === 'acdumlHit' ? 'acduml:reach' : ex.kind === 'acdummHit' ? 'acdumm:reach' : null;
    // 2026-11-07: their strike: 관's phase 2 START (attack.0.1 / .2, one file), 현's ON (.attack.0.1 / .2, one file); 관's phase 1 has no bank for it
    case 'beam': return ex.kind === 'acdumlStrike' && def(ex.from) === 'enemy_9021_acduml_2' ? 'acduml:strike2' : ex.kind === 'acdummStrike' ? 'acdumm:strike' : null;
    case 'burst': return def(ex.id) === 'token_10035_wisdel_wward' ? 'wisdel:token' : null;
    // 2026-11-01 (the linking sheet, tools/local-extract/link_sheet.py): 赤刃明霄陈 T2's held dodge gained (chen3_t2[evade]
    // ON_BUFF_ENABLE — Buff.OnEnable runs it as the buff is enabled) [추정·엔진: not again on a re-enable after a stun or
    // silence — the kit does not disable the buff]
    case 'evadeReady': return def(ex.id) === 'char_1050_chen3' ? 'chen3:t2evade' : null;
    // 凯尔希·思衡托 S3: the transport's start (StartTransporting START), her flight reaching the anchor (its REACH)
    case 'kalts2Takeoff': return def(ex.id) === 'char_1052_kalts2' ? 'kalts2:s3start' : null;
    case 'teleport': return def(ex.id) === 'char_1052_kalts2' ? 'kalts2:s3reach' : null;
    // 本能的召唤's attract projectile reaching the enemy it lures
    case 'lure': return def(ex.src) === 'token_10054_phatm2_encdool' ? 'phatm2:lurehit' : null;
    // 予愿安洁莉娜 (CN client): S2's sweep fired (its BORN), S3's flight body (BORN) — the way home opens on her
    // Skill_3_Restart_Begin instead (RestoreAbility; AudioWhenPlayAnimation aglna2_restart) [추정·CN: the way home is the
    // same projectile, not a new one]
    case 'dash': return def(ex.id) === 'char_1015_aglna2' ? 'aglna2:s2fly' : null;
    case 'aglnaFlight': return ex.on !== 1 || def(ex.id) !== 'char_1015_aglna2' ? null : ex.signal === 'comeback' ? 'aglna2:restart' : 'aglna2:s3fly';
    case 'oblvnsNote': return ex.e === 'hit' && typeof ex.m === 'string' ? `oblvns:${ex.m}` : null;
    case 'drone': {
      const u = unitOf(ex.id);
      // 2026-10-22: 洛洛 S2's released drone hitting (rockr_s_2[funnel_hit_audio] on its target: the _overload signal
      // while she holds rockr_s_2[overload] — `over`, signalFxKey 'overload')
      if (u?.def === 'char_4040_rockr') return u.over ? 'rockr:funnelo' : 'rockr:funnel';
      // 2026-10-29: 耶拉 S2 — only Funnel_0's projectile (drone `i` 0) has banks; 荒芜拉普兰德 S3 — a locked wolf's strike is its
      // attached projectile (`lock`), a roaming one's pulse its cruise projectile
      if (u?.def === 'char_4013_kjera') return ex.i === 0 ? 'kjera:s2' : null;
      if (u?.def === 'char_1038_whitw2' && u.skillIndex === 2 && ex.lock) return 'whitw2:s3lock';
      return u?.def === 'char_1038_whitw2' && Number.isInteger(u.skillIndex) ? `whitw2:s${u.skillIndex + 1}` : null;
    }
    // 2026-10-29: 荒芜拉普兰德 S3 — a roaming wolf marks the enemy it found (whitw2_find_target_mark, its show effect)
    case 'droneLock': return def(ex.src) === 'char_1038_whitw2' ? 'whitw2:mark' : null;
    // 2026-10-29: 新约能天使's 火力电台 bombing landing (projectile_chr_angel2_t1 REACH; S3's fire-to-token strike has no `tgt`)
    case 'airstrike': return ex.tgt != null && def(ex.id) === 'char_1041_angel2' ? 'angel2:t1' : null;
    // 2026-10-22: 协律 S2's sonic boom at each other operator in range (akkord_s_2[aoe_damage] PlayAudio akkord_aoe_audio at
    // that operator, whether or not an enemy is caught)
    case 'sonic': return def(ex.id) === 'char_4051_akkord' ? 'akkord:s2' : null;
    // 2026-10-11, docs/rules/audio.md 「재능·소환물 능력 소리」: 실버애쉬 더 레인프로스트 S2's slash — its ability's ON (no attack event);
    // 2026-11-03: a waiting operator's slash as it redeploys (svash2_s_2[build][effect] PlayAudio svash2_s_2[range] at it — the
    // hits: aoeHitKey); 菲莱 S2's blast at her (philae_s_2[cd] audioSignal philae_aoe); 风丸's 折纸生花 as a <替身> appears —
    // the talent ability Talents/1 (ActiveBuffAbility kazema_standin[damage]) of the summoned <替身> (its AppearTalent) or of
    // her stand-in state [추정·엔진: kazema_switchend's OnRallyPointLikeReborn at the end of kazema[switch2stand] is the moment; how a plain Talent casts from it was not followed]
    case 'aoe': return ex.skill === 'svash2' ? (def(ex.id) === 'char_1045_svash2' ? 'svash2:s2' : 'svash2:range')
      : ex.skill === 'philae_2' && def(ex.id) === 'char_4148_philae' ? 'philae:aoe'
      : ex.skill === 'origami' ? (def(ex.id) === 'char_4016_kazema' ? 'kazema:t1' : def(ex.id) === 'token_10022_kazema_shadow' ? 'kazema:t1token' : null)
      // 2026-11-03: 铁钳号·原型机's projectile reaching its target (projectile_chr_ironmn_pile3 REACH; the kit's blast there)
      : ex.skill === 'ironmn:crab' && def(ex.id) === 'token_10027_ironmn_pile3' ? 'ironmn:pile3hit'
      // 2026-11-03: 遥 S2's extra damage at a healed unit, enemies or none (haruka_s_2 ON_AFTER_OUTPUT_HEAL PlayAudio)
      : ex.skill === 'haruka:s2' && def(ex.id) === 'char_4202_haruka' ? 'haruka:s2'
      // 2026-11-03: 怒潮凛冬's 高台 splash — Headb2AttackHighlandAOEBase._TriggerAOEFromTile plays `_aoeAudioSignal` at every
      // 高台 tile it takes effect on, enemies or none (Default / S1 / S2 attacks and S3's spread alike)
      : ex.skill === 'headb2:highland' && def(ex.id) === 'char_1051_headb2' ? 'headb2:highland'
      // 2026-11-04 (maintainer report: no impact on 怒潮凛冬 S3): each hammer is one spell of skchr_headb2_3 — its ON bank, by spell
      // count from 0 (`.0`–`.4`), once per hammer, enemies or none. S3 makes no normal attack, so the mode's cues never run
      : ex.skill === 'headb2:hammer' && def(ex.id) === 'char_1051_headb2' && Number.isInteger(ex.spell) ? `headb2:s3hit${ex.spell}`
      // 2026-11-07: 莉赛尔 S2's shot landing (each projectile's REACH, enemies or none); 米特姆 S1's blast at her 小车 (mitm_s_1 PlayAudio explode)
      : ex.skill === 'liesel' && def(ex.id) === 'char_4031_liesel' ? 'liesel:s2reach'
      : ex.skill === 'mitm:s1' && def(ex.id) === 'char_4147_mitm' ? 'mitm:s1'
      : null;
    // 2026-11-07: 米特姆's 樱桃三号 — S2's form (mitm_s_2[to_token] PlayAudio state_change), its way back (trshrb_switch START); 罗贝塔's machine
    // running (PassiveBuffAbility audioSignal); 可露希尔 — S1's shield on a 援军, her 指挥中心 into its 战术点形态
    case 'mitmSkill': return def(ex.id) === 'token_10037_mitm_trshrb' ? 'mitm:s2' : null;
    case 'mitmReborn': return def(ex.id) === 'token_10037_mitm_trshrb' ? 'mitm:reborn' : null;
    case 'machRun': return ex.form === 'running' && def(ex.id) === 'token_10018_robrta_mach' ? 'robrta:run' : null;
    case 'shield': return def(ex.src) === 'char_4228_closur' ? 'closur:s1block' : null;
    case 'disappear': return def(ex.id) === 'token_10066_closur_ourbase' ? 'closur:fakedeath' : null;
    // 2026-11-03: 魔王's 微尘 reaching an operator (an enemy under S2) — its projectile's HIT (cetsyrMoteKey)
    case 'mote': return ex.src !== ex.id ? cetsyrMoteKey(unitOf(ex.src), 'hit') : null;
    // 2026-10-29: 歌蕾蒂娅 S3's tornado forming — its Chant's ON (docs/rules/audio.md 「스킬 시전 능력 소리」)
    case 'tornado': return def(ex.id) === 'char_474_glady' ? 'glady:s3' : null;
    // 2026-10-30: 叙拉古 [ex]'s proc — act2autochess_bond_eff_siracusa[ex][buff] PlayAudio siracusa_ex_attack on the target
    // after its effect (the bond's only 'bondProc')
    case 'bondProc': return ex.src === 'bond:siracusaShip' ? 'siracusa:ex' : null;
    // 2026-10-30: a hit a block layer stops whole (BlockDamage.Execute: with the block effect it plays ON_DAMAGE_BLOCK at the
    // holder) — not a barrier layer the hit broke through (`whole` 0)
    case 'parry': return ex.whole === 0 ? null : 'block';
    default: return null;
  }
}
/**
 * local patch (maintainer report 2026-10-07): the sound a kit plays as its skill goes off, before / beside its impact
 * (kitHitKey) — 望's stone pop: a placed stone's sktok_wang_<n> ON_ABILITY_START (p_atk_stwctp_d / _h / _s); a 跟子 (a
 * projectile of hers) sounds the same file through its projectile_chr_wang_stone<n> bank, but for S2
 * (ON_PROJECTILE_BEHAVIOUR_TRIGGER, p_atk_stwctps_h). A 跟子 landing (summon fx `follower`): ON_PROJECTILE_BORN.
 * 2026-11-01: 魂灵之影's strike — its skill's RangedAttack ON (the shot; its HIT is kitHitKey's 'wisdel:token'); 凯尔希·思衡托's
 * S3 landing — the respawn's RespawnBorn buff (beside the flight's REACH); 本能的召唤's attract ability on each enemy it lures.
 * @param {(id: any) => ({ def?: string }|undefined)} [unitOf] the tracked unit of an id
 * @returns {string|null} sfx.kit key
 */
export function kitStartKey(fx, ex, unitOf = () => undefined) {
  if (!ex || typeof ex !== 'object') return null;
  if (fx === 'zone' && ex.token === 'token_10064_wang_stone1' && [1, 2, 3].includes(ex.skill)) return ex.follower && ex.skill === 2 ? 'wang:2fs' : `wang:${ex.skill}s`;
  if (fx === 'summon' && ex.follower) return 'wang:thrown';
  const def = (id) => unitOf(id)?.def || '';
  if (fx === 'burst' && def(ex.id) === 'token_10035_wisdel_wward') return 'wisdel:tokenon';
  if (fx === 'teleport' && def(ex.id) === 'char_1052_kalts2') return 'kalts2:respawn';
  if (fx === 'lure' && def(ex.src) === 'token_10054_phatm2_encdool') return 'phatm2:lure';
  return null;
}
/**
 * 2026-10-22 (maintainer request): 帝国炮火先兆者 / 中枢先兆者 (enemy_1112_emppnt / _2) — their shell attack's own banks, which
 * their unit cues cannot play (the shell lands 3 s later as 无来源 damage, content/enemies/fly.js kitShell): the attack's
 * ON_ABILITY_END (e_atk_aim) as it fires [추정·엔진: at the shot — the client sounds it at the cast's end, a moment the sim lacks], and for each unit
 * the landing hits (the 无来源 'dmg' of the 'bombard' moment: AudioManager `_shellAt`) its ON_ABILITY_HIT (e_atk_energyshotcast)
 * and the projectile's ON_PROJECTILE_HIT (e_imp_grenade_n) — the client's HIT signals are per unit hit (each bank keeps 2 at
 * once, popOldest); a shell that hits nobody is silent (the projectile has no REACH bank).
 */
const emppnt = (u) => typeof (u?.defId ?? u?.def) === 'string' && (u.defId ?? u.def).startsWith('enemy_1112_emppnt');
/**
 * 2026-10-11, docs/rules/audio.md 「재능·소환물 능력 소리」: the sfx.kit keys of a talent's own attack — sim 'atk' 5th field `signal`
 * (Battle.forceAttack, docs/SIM.md) — of unit model `def`, played instead of its normal attack's cues, or null. 이그제큐터 디 엑스
 * 포에데레's 受选之人 extra shot: ON_ABILITY_START.char_1032_excu2.T.1 (the ability has no ON / HIT bank). 2026-10-30: 크루스 더 킨
 * 글린트's 中的 shot (outside her skills): ON_ABILITY_ON.char_1021_kroos2.T.1 at its strike (its START at the swing:
 * talentSwingKeys; its arrow projectile_chr_kroos2_2 has no HIT bank).
 */
export function talentAttackKeys(def, signal) {
  if (typeof signal !== 'string' || !signal) return null;
  return TALENT_ATTACK_KEYS[def]?.[signal] ?? null;
}
const TALENT_ATTACK_KEYS = Object.freeze({
  char_1032_excu2: Object.freeze({ 'T.1': Object.freeze(['excu2:t1']) }),
  char_1021_kroos2: Object.freeze({ 'T.1': Object.freeze(['kroos2:t1']) }),
  // 2026-11-07: 慕斯's 连击 — its ability's HIT at each of its two hits (no START / ON bank)
  char_185_frncat: Object.freeze({ 'T.1': Object.freeze(['frncat:t1hit']) }),
});
/**
 * 2026-10-30, docs/rules/audio.md 「재능·소환물 능력 소리」: the sfx.kit keys a talent ability sounds as its swing starts — sim
 * 'swing' 9th field `signal` (the client casts it in place of the attack, chosen at the cast start: its START,
 * AbilityStandard.OnCastStart) — or null. 크루스 더 킨 글린트's 中的: ON_ABILITY_START.char_1021_kroos2.T.1.
 */
export function talentSwingKeys(def, signal) {
  if (typeof signal !== 'string' || !signal) return null;
  return TALENT_SWING_KEYS[def]?.[signal] ?? null;
}
const TALENT_SWING_KEYS = Object.freeze({ char_1021_kroos2: Object.freeze({ 'T.1': Object.freeze(['kroos2:t1s']) }) });
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
 * 2026-11-03, docs/rules/audio.md 「재능·소환물 능력 소리」: whether 뮤엘시스's S3 starting (tracked unit `su`, id `id`) sounds
 * mlyss_s_3[range_audio] — mlyss_s_3[buff] gives each of her 流形 mlyss_s_3[token_range_trigger], which creates that audio buff
 * on a ranged copy (mlyss_wtrman_range[mark]) that is no split one (mlyss_wtrman_summon[override]); the bank sounds once
 * at a time (maxSoundAllowed 1, no popOldest). `units` are the tracked units (`tby` her id, `tmode`, `split`, `gone`).
 */
export function mlyssS3Range(su, id, units) {
  if (su?.def !== 'char_249_mlyss' || su.skillIndex !== 2) return false;
  for (const t of units.values()) if (t.tby === id && t.tmode === 'Range' && !t.split && !t.gone) return true;
  return false;
}
/**
 * 2026-10-10, docs/rules/audio.md 「버프·커스텀 트리거 소리」: the buff sound of tracked unit `su`'s attack moment `at` ('s' swing,
 * 'a' strike, 'd' its impact; `melee` = a melee strike) — an sfx.kit key (tools/assets/kit-sfx.mjs) or null. 혼 S2 / S3: every
 * strike sounds horn_s_<n>[overload|normal][melee|ranged].attack (buff template horn_s_<n>[signal_melee|signal_ranged], event
 * ON_ABILITY_SPELL_ON); 락락 S2: rockr_s2_common_attack_start / _hit (+ _overload) at the strike / impact. `su.over` = the
 * running skill's 过载 (sim fx 'overload', signalFxKey).
 */
export function signalAttackKey(su, at, melee) {
  if (!su || !su.skillOn) return null;
  if (su.def === 'char_4039_horn' && at === 'a' && (su.skillIndex === 1 || su.skillIndex === 2)) {
    return `horn:${su.skillIndex + 1}:${su.over ? 'overload' : 'normal'}:${melee ? 'melee' : 'ranged'}`;
  }
  // (2026-10-21, official client) the start at her strike: rockr_s_2[attack_start_audio] is the S2 Attack's
  // BuffToOwnerDuringAbility (OnEvent) with _startEvent ON_SPELL_ON (4); the hit is its `_activeBuffs` on the target
  if (su.def === 'char_4040_rockr' && su.skillIndex === 1 && (at === 'a' || at === 'd')) return `rockr:${at === 'a' ? 'atk' : 'hit'}${su.over ? 'o' : ''}`;
  // 2026-11-02: 실버애쉬 더 레인프로스트 S3 — the S3 mode's attack sends his bird (svash2_s_3[trigger_self] → BirdAttack →
  // svash2_s_3[bird_on_self]): projectile_chr_svash2_s3_bird_self's HIT at the impact (the aura's BORN: the skill's start)
  if (su.def === 'char_1045_svash2' && su.skillIndex === 2 && at === 'd') return 'svash2:s3hit';
  // 2026-10-29: 维什戴尔 S3 — the attack's AimEff (a child of its all-children group, no clip) marks the target as the attack
  // starts (AimEff has no _waitForAttackEvent, MainAttack does): wisdel_s_3_mark[target]'s audioSignal WISDEL_S3_MARK
  if (su.def === 'char_1035_wisdel' && su.skillIndex === 2 && at === 's') return 'wisdel:s3mark';
  // 2026-11-03: 贝洛内 S2 — the S2 mode's Attack BuffToOwner (`_runActionOnEvent` ON_SPELL_ON) gives him demetr_s2[audio]
  // (audioSignal demetr_s2_attack_spell_on_audio) at each shot; the mode has no attack bank of its own
  if (su.def === 'char_4037_demetr' && su.skillIndex === 1 && at === 'a') return 'demetr:s2atk';
  return null;
}
/**
 * 2026-10-29, docs/rules/audio.md 「스킬·재능 투사체 소리」: the sfx.kit key of impact `h` (0, 1 … of the swing) of tracked unit
 * `su`'s attack that a skill prefab shoots with another projectile — 至简 S2's second shot (skchr_malist_2
 * `_additionalProjectile` projectile_chr_malist_s2_2; the first, …_s1s2, has no bank) — or null. `skill`: the skill the swing
 * was cast under (a charge skill ends on its strike, before the shot lands).
 */
export function strikeImpactKey(su, h, skill = su?.skillOn ? su.skillIndex : null) {
  if (su?.def === 'char_4054_malist' && skill === 1 && h === 1) return 'malist:s2';
  // 2026-11-04: 维什戴尔 S1's shot — S1_Common's projectile_chr_wisdel_s1 HIT, on each target (its aftershocks: 'wisdel:bomb', the kit)
  if (su?.def === 'char_1035_wisdel' && skill === 0) return 'wisdel:s1';
  return null;
}
/**
 * 2026-10-29: the sfx.kit key of an unreleased drone's additional damage ('dmg' 7th field 2, server/sim/damage.js dotFlag) of a
 * 驭械术师 `su` — the Default mode's Funnel projectile HIT (至简's has no bank), or null. During a skill: the mode the skill runs
 * in (2026-11-04, official client): 耶拉 and 洛洛's S1 have no mode of their own, the Default's Funnel; 荒芜拉普兰德's S1 mode has
 * S1Funnel1–3, of which only _s1_1 has a bank; her S2 (_s2_1–6) and 洛洛's S2 (S2Funnel) have no HIT bank.
 */
export function funnelHitKey(su) {
  if (!su) return null;
  return su.skillOn ? FUNNEL_SKILL_HIT_KEYS[su.def]?.[su.skillIndex] ?? null : FUNNEL_HIT_KEYS[su.def] ?? null;
}
const FUNNEL_HIT_KEYS = Object.freeze({ char_4013_kjera: 'kjera:funnel', char_1038_whitw2: 'whitw2:funnel', char_4040_rockr: 'rockr:funnelN' });
const FUNNEL_SKILL_HIT_KEYS = Object.freeze({ char_4013_kjera: Object.freeze({ 0: 'kjera:funnel' }), char_1038_whitw2: Object.freeze({ 0: 'whitw2:funnelS1' }), char_4040_rockr: Object.freeze({ 0: 'rockr:funnelN' }) });
/**
 * 2026-10-29: 溯光星源 S3's LinkEnemy — each enemy newly linked this skill run (fx 'link' `ids`) takes halo2_s_3_link, whose
 * audioSignal sounds (ON_BUFF_START): how many plays, remembered on her tracked unit (`haloLinked`, cleared as the skill starts).
 */
export function haloLinkCount(su, ids) {
  if (su?.def !== 'char_1047_halo2' || su.skillIndex !== 2 || !su.skillOn || !Array.isArray(ids)) return 0;
  const seen = su.haloLinked ??= new Set();
  let n = 0;
  for (const id of ids) if (!seen.has(id)) { seen.add(id); n++; }
  return n;
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
    if (u?.def === 'char_4247_oxi') return 'oxi:s3ovs';   // 2026-11-01: 塔露拉 S3 (AudioOnEventBehaviour oxi_s_3_overload)
  }
  // 2026-11-03: 维什戴尔 S2's 过载 (wisdel_s_2[overload_start] ON_BUFF_START PlayAudio WISDEL_S_OVERLOAD)
  if (fx === 'wisdelOverload' && u?.def === 'char_1035_wisdel') return 'wisdel:s2ovs';
  if (fx === 'wake' && u?.side === 'enemy') return 'titi:awake';
  // 2026-11-03: 真言's 侵入点 mark (Talents/2 TileListener: AttachListenerToTileAbility._HoldCastedEffectOnTile plays its
  // `_effectSettings` audioSignal mantra_t_tile at the tile with the mark effect) and an S3 溢出麻痹 bounce on its holder
  // (mantra_s_3[enemy_trigger]'s projectile ON_HIT_OBJECT PlayProjectileAudio mantra_s_3_element; the jumps: kitHit)
  if (fx === 'mantraGate' && u?.def === 'char_4204_mantra') return 'mantra:t2';
  if (fx === 'mantraArc' && u?.def === 'char_4204_mantra') return 'mantra:s3';
  // 2026-11-03: 遥 — a bubble given (haruka_t_1 ON_BUFF_START PlayAudio haruka_shield_start_ally at its holder), an enemy
  // levitated by S3 (haruka_s_3_debuff's ON_BUFF_START, audioSignal haruka_shield_start_enemy; its ticks: kitHit)
  if (fx === 'shield' && ex.kind === 'bubble') return 'haruka:t1';
  if (fx === 'levitate' && ex.src != null && unitOf(ex.src)?.def === 'char_4202_haruka') return 'haruka:lev';
  // 2026-11-03: 逻各斯 S1's execution (logos_s_1 PlayAudio logos_s1_kill at the enemy) and T1's shot landing (its HIT)
  if (fx === 'logosExecute' && u?.def === 'char_4133_logos') return 'logos:s1kill';
  if (fx === 'logosLexicon' && u?.def === 'char_4133_logos') return 'logos:t1hit';
  // 2026-11-03: 贝洛内 S3 — a FlyToTargetSecond 【移动】 (`second`) and the RespawnEnd 【返回】 (`back`) sound their ability
  // START; the first move, FlyToTarget, has no bank. Mon3tr S3 — the move onto her 重构体 (monstr_s_3[respawn]) and the
  // return (RespawnEnd, `back`). Their attacks in between: shared/skill-modes.js SKILL_SUB_MODES
  if (fx === 'teleport' && u?.def === 'char_4037_demetr') return ex.back ? 'demetr:s3back' : ex.second ? 'demetr:s3fly' : null;
  if (fx === 'teleport' && u?.def === 'char_4179_monstr') return ex.back ? 'monstr:s3back' : 'monstr:s3move';
  // 2026-11-03: 维伊's store — MergeableChargeUberEffectEmitter sounds the merge signal for the store that makes a 转置能量
  // (`merged`), the normal one for the others
  if (fx === 'mysticStore' && u?.def === 'char_4226_veen') return ex.merged ? 'veen:merge' : 'veen:store';
  // 2026-11-04: 黑键's store — the Charge ON of the running mode's ExChargeAttack (S1 / S3 their own, else Default)
  if (fx === 'mysticStore' && u?.def === 'char_4046_ebnhlz') return u.skillOn && u.skillIndex === 0 ? 'ebnhlz:charge1' : u.skillOn && u.skillIndex === 2 ? 'ebnhlz:charge3' : 'ebnhlz:charge';
  // 2026-11-04: 黍 — T1's DoFarm sowing new tiles (AttachListenerToTileAbility.AttachToTile sounds its spell-on signal only for
  // a tile not cast on before: the kit's 'healField' carries new tiles only; the bank keeps one at a time), S3's put-back of a
  // marked enemy (shu_s_3[enemy][mark] ON_BUFF_TRIGGER; `ex.id` is the enemy)
  if (fx === 'healField' && u?.def === 'char_2025_shu') return 'shu:t1';
  if (fx === 'teleport' && ex.src != null && unitOf(ex.src)?.def === 'char_2025_shu') return 'shu:back';
  // 2026-11-04: 老鲤 — S2's mark bursting (lmlee_s_2[paper]'s finish emits projectile_chr_lmlee_s2: its REACH), T2's guard
  // taken (lmlee_tr → lmlee_t_2[bounce], audioSignal lmlee_telent_2_start)
  if (fx === 'explode' && ex.skill === 'lmlee_2' && u?.def === 'char_322_lmlee') return 'lmlee:s2burst';
  if (fx === 'shield' && ex.kind === 'lmlee' && u?.def === 'char_322_lmlee') return 'lmlee:t2';
  // 2026-11-04: 涤火杰西卡 turning to a 机动盾牌 placed beside her (jesca2_jckshd_dir_set → [effect] on her, its audioSignal)
  if (fx === 'buff' && ex.kind === 'turn' && u?.def === 'char_1034_jesca2') return 'jesca2:turn';
  // 2026-11-04: 琳琅诗怀雅 S1's HealAlly child of her attack group — as it starts and as its heal lands
  if (fx === 'swire2Heal' && u?.def === 'char_1033_swire2') return 'swire2:heal';
  if (fx === 'coin' && ex.heal != null && ex.skill === 'swire2_1' && u?.def === 'char_1033_swire2') return 'swire2:healhit';
  // 2026-11-04: the throw of her S2 (SpawnToken child), 新约能天使 S3's opening strike at her 浮空炮台 (S3FireToToken child)
  if (fx === 'swire2Throw' && u?.def === 'char_1033_swire2') return 'swire2:throw';
  if (fx === 'airstrike' && ex.signal === 'fireToToken' && u?.def === 'char_1041_angel2') return 'angel2:s3fire';
  if (fx === 'charges' && u?.def === 'char_426_billro' && Number.isInteger(u.skillIndex)) return billroChargeKey(u, Number(ex.n) || 0, !!ex.full);
  if (fx === 'charges' && (u?.def === 'char_206_gnosis' || u?.def === 'char_4042_lumen')) return chargeStageKey(u, Number(ex.n) || 0);
  // 2026-10-22: 刺玫 S2's counter on the attacker of her protégé (vendla_s_2[extra_damage]'s audioSignal, on the attacker)
  if (fx === 'counter' && u?.def === 'char_494_vendla') return 'vendla:s2';
  // 2026-10-22: 蕾缪安 S3's lock — its cast on a target puts lemuen_s3_audio_triggered there (UNIQUE, INFINITY: once per
  // enemy, a second lock on it is silent: UNIQUE adds only to an empty group, INFINITY outlives the skill); `ex.id` is the enemy
  if (fx === 'lock' && ex.hold && ex.src != null && unitOf(ex.src)?.def === 'char_4193_lemuen' && u && !u.lemS3) {
    u.lemS3 = true;
    return 'lemuen:s3lock';
  }
  // 2026-11-01: 蕾缪安 S2's Aim (M2Attack's first child, attack.2.1) — its START as the aim begins, its ON at the shot
  if (fx === 'lemuenAim' && ex.on === 1 && u?.def === 'char_4193_lemuen') return 'lemuen:aim';
  if (fx === 'crit' && ex.src != null) { const s = unitOf(ex.src); if (s?.def === 'char_4193_lemuen' && s.skillIndex === 1) return 'lemuen:snipe'; }
  // 2026-10-22: 佩佩 S3 — each attack's pepe_s_3_fx on its main target (the kit's 'stacks', `n` = her stacks before this
  // attack's): PlayAudio pepe_s3_hit_03 at ≥ max_stack_cnt, _02 at ≥ 2, else _01 (as render/fx/kitofficial.js stacks.pepe)
  if (fx === 'stacks' && ex.buff === 'pepe:tremor') {
    const n = Number(ex.n) || 0;
    return `pepe:s3:${Number(ex.max) > 0 && n >= Number(ex.max) ? 3 : n >= 2 ? 2 : 1}`;
  }
  // 2026-10-11: 뮤엘시스's 流形 — turning melee / ranged on its copy (mlyss_wtrman_s_begin's audio buffs), S3's pull pulse of a
  // melee copy (mlyss_s_3[melee_audio], ON_BUFF_TRIGGER)
  if (u?.def === 'token_10030_mlyss_wtrman') {
    if (fx === 'copy' && (ex.mode === 'Melee' || ex.mode === 'Range')) return ex.mode === 'Melee' ? 'mlyss:melee' : 'mlyss:range';
    if (fx === 'pulse') return 'mlyss:pull';
  }
  return null;
}
/**
 * 2026-10-22, docs/rules/audio.md 「버프·커스텀 트리거 소리」: 卡涅利安's charge stages — billro_s_N[eff_cond] (every 0.1 s) keeps
 * derived buffs on her: outside the skill, 2 charges create [full] (audioSignal billro_s_N_reach_enhance) + [half] unless
 * [full] is there, 1 charge creates [half] (billro_s_N_reach_half) unless [half] is there, 0 finishes them; while the skill
 * runs it keeps [half] (and with every charge stored [full]) without a sound. `n` is the kit's 'charges' (-1 while it runs,
 * `full` = a charged cast); which buffs she holds is kept on her audio record `u`.
 */
export function billroChargeKey(u, n, full = false) {
  const st = (u.bstage ||= { full: false, half: false });
  const s = `billro:s${u.skillIndex + 1}`;
  if (n < 0) { st.half = true; st.full = !!full; return null; }
  if (n === 0) { st.half = st.full = false; return null; }
  if (n >= 2) { if (st.full) return null; st.full = st.half = true; return `${s}:full`; }
  if (st.half) return null;
  st.half = true; st.full = false;
  return `${s}:half`;
}
/**
 * 2026-10-22, docs/rules/audio.md 「버프·커스텀 트리거 소리」: 灵知 / 流明 S2's charge stages — gnosis_s_2[eff_cond] /
 * lumen_s_2[eff_cond] (every 0.1 s): 1 charge creates [effect1] (audioSignal gnosis_s_2[audio1] / lumen_s_2[audio1]) unless
 * held, 2 charges replace it by [effect2] ([audio2]) unless held; a cast clears both (*_enhance_judge), and 流明's 0 charges
 * too. `n` is the kit's 'charges' (-1 at a cast); the stage she holds is kept on her audio record `u`.
 */
export function chargeStageKey(u, n) {
  const s = u.def === 'char_206_gnosis' ? 'gnosis' : 'lumen';
  if (n <= 0) { u.cstage = 0; return null; }
  const k = n >= 2 ? 2 : 1;
  if ((u.cstage ?? 0) === k) return null;
  u.cstage = k;
  return `${s}:s2:${k}`;
}
/**
 * 2026-11-03, docs/rules/audio.md 「버프·커스텀 트리거 소리」: the sfx.kit key of 魔王's 微尘 (`at` 'hit': one reaching its unit; 'ready':
 * one back in her orbit, CoolDownAfterHitBehaviour's ON_CUSTOM_TRIGGER <projectile>_cooldown_ready) — the projectile of the
 * running skill: projectile_chr_cetsyr_talent_s1 / _s2 / _s3 under S1 / S2 / S3, else projectile_chr_cetsyr_talent (S3's
 * has no cooldown_ready bank: its motes never leave). `u` is her tracked unit.
 */
export function cetsyrMoteKey(u, at) {
  if (u?.def !== 'char_4134_cetsyr') return null;
  const s = u.skillOn && Number.isInteger(u.skillIndex) ? u.skillIndex + 1 : 0;
  if (at === 'ready') return s === 3 ? null : `cetsyr:ready${s || ''}`;
  return `cetsyr:hit${s || ''}`;
}
/**
 * 2026-11-03: how many of 魔王's 微尘 came back since her last 'motes' (`n` of `cap`, skill look `sk`), remembered on her
 * tracked unit `u` (a new deployment starts over: 'deploy' clears it); a change of cap or look is no return.
 */
export function motesBack(u, ex) {
  if (u?.def !== 'char_4134_cetsyr' || !ex) return 0;
  const prev = u.motes, n = Number(ex.n) || 0;
  u.motes = { n, cap: ex.cap, sk: ex.sk };
  return prev && prev.cap === ex.cap && prev.sk === ex.sk && n > prev.n ? n - prev.n : 0;
}
/**
 * 2026-11-03: the per-enemy sound of a kit blast (fx 'aoe' with `n` = the enemies it hit) — 菲莱 S2's philae_s_2[ep] on each
 * enemy (audioSignal philae_aoe_hit), a redeployed operator's 凛御银灰 S2 slash: its AOEDamage `_buffs` svash2_s_2[signal]
 * (audioSignal svash2_s_2[hit]) on each enemy, 斥罪 S2's pulse: judge_s_2[audio] on each enemy — or null.
 */
export function aoeHitKey(ex, unitOf) {
  if (!ex || !(Number(ex.n) > 0)) return null;
  const d = unitOf(ex.id)?.def;
  if (ex.skill === 'philae_2' && d === 'char_4148_philae') return 'philae:aoehit';
  if (ex.skill === 'svash2' && d && d !== 'char_1045_svash2') return 'svash2:s2redhit';
  if (ex.skill === 'judge:atonement' && d === 'char_4065_judge') return 'judge:s2hit'; // 2026-11-03: judge_s_2[aoe]'s `_buffs`
  return null;
}
/**
 * 2026-11-03: the sound tracked unit `su`'s strike starts that sounds later — 蕾缪安's attacks outside her S3 (charpack
 * Modes/Default/Body/Attack and Modes/S2/Body/M2Attack/Normal: BuffToOwner on ON_SPELL_END of lemuen_attack_end_audio, 0.76 s,
 * whose bank is its ON_BUFF_FINISH) — { key, after } (s) or null. Her S2 aim is no 'atk' (its own channel).
 */
export function strikeAfterKey(su) {
  if (su?.def === 'char_4193_lemuen' && (!su.skillOn || su.skillIndex === 1)) return LEMUEN_ATTACK_END;
  return null;
}
const LEMUEN_ATTACK_END = Object.freeze({ key: 'lemuen:atkend', after: 0.76 });
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
 * attacker at most this often (real ms) [추정·자료 없음: the client sounds a skill's own impacts through its projectiles / abilities,
 * not per damage tick]. A DoT tick credited to its applier never gets here (2026-10-11: the 'dmg' 7th field, skipped first).
 */
const SKILL_HIT_GAP_MS = 120;
/** The kits whose instant skill ends as it fires: what it fired lands a moment later, and its impact is still that skill's (雪猎 S2's arrows). */
const LANDS_AFTER_SKILL = new Set(['char_4211_snhunt']), SKILL_LANDS_MS = 600;
/** The attack child of a 猎手 that loads a round (AbilitySelectableGroup `_abilityConfigs`). */
const RELOAD_CHILD = 'Reload';
/**
 * 2026-10-22: the sfx.kit key of a skill's own damage (_skillImpact) whose client sound is a buff's audio signal on each enemy
 * it hits, not an ability's HIT — 隐德来希 S2's blood sickles (etlchi_s_2's AOEDamage gives each enemy etlchi_s_2[audio]).
 * Keyed by model, then skill index; '' = no sound here, the kit's own event sounds it (圣聆初雪 S2: her snow ticks and the
 * talent's entry damage, kitHit 'sbell2:s2dot' / 'sbell2:enter' — buff damage, no ability HIT).
 */
const SKILL_DAMAGE_KEYS = Object.freeze({ char_4010_etlchi: Object.freeze({ 1: 'etlchi:s2' }), char_1046_sbell2: Object.freeze({ 1: '' }),
  // 2026-10-29: 克莱门莎 S3's shells — clemnt_s3[rocket_damage]'s buff damage (no ability HIT; their sound is 'clemnt:s3hit')
  char_4231_clemnt: Object.freeze({ 2: '' }),
  // 2026-11-04: 引星棘刺 S2's ticks sound thorn2_s2_damage's PlayAudio (the 'dmg' 9th field), 乌尔比安 S3's anchor its REACH (the kit's kitHit)
  char_1039_thorn2: Object.freeze({ 1: '' }), char_4145_ulpia: Object.freeze({ 2: '' }),
  // 2026-11-07: damage of a buff template is no ability's or projectile's HIT: 斥罪 S2's pulse (judge_s_2[aoe]; its own judge_s_2[audio]: fx 'aoe'), 焰影苇草 S3's ticks and
  // splash (reed2_t_1[skill_3_dot] / [skill_3_aoe], no PlayAudio), 缇缇 S3's waking damage (titi_s_3[dmg_ticker]; its titi_s_3[awake]: fx 'wake') and T1 while it runs
  char_4065_judge: Object.freeze({ 1: '' }), char_1020_reed2: Object.freeze({ 2: '' }), char_4056_titi: Object.freeze({ 2: '' }),
  // 2026-11-08: 国度's kit damage is buff damage in every skill — 实质坍缩's tick (dminon_t_1[dmg]), S3's spread (dminon_s_3[spread]);
  // their own banks (ON_CUSTOM_TRIGGER dminon_talent_hit / dminon_s3_expand) are not wired yet (test/audio-bank-coverage-list.js)
  char_4246_dminon: Object.freeze({ 0: '', 1: '', 2: '' }) });
/** The sfx.kit key of unit model `def`'s skill damage during skill `skillIndex` (SKILL_DAMAGE_KEYS: '' silent), or null. */
export function skillDamageKey(def, skillIndex) {
  return SKILL_DAMAGE_KEYS[def]?.[skillIndex] ?? null;
}
/**
 * 2026-10-22, docs/rules/audio.md 「지속 피해 틱」: the sfx.kit key of a damage-over-time tick (the 'dmg' 7th field) of unit
 * model `def`, or null — the ticks whose buff plays a sound: 锡人's alchemy unit (tinman_s_2[buff] ON_BUFF_TRIGGER on each
 * enemy inside: PlayAudio tinman_s_2[audio], then the damage). Every other tick stays silent.
 */
export function dotTickKey(def) {
  return def === 'char_4151_tinman' ? 'tinman:s2' : null;
}
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
 * (联防's own track) to `bgm.combat` when the manifest predates it. 2026-11-11: `season` (shared/seasons.js id — the
 * room's, else the one picked on the title; ui/season.js activeSeason) reads that season's own tracks first
 * (`audio.seasonBgm[season]`: `lobby`, `combatAlts`, `bossBgm` — tools/assets/plan.mjs SEASON_BGM), the default's
 * where it has none.
 * @param {any} manifest
 * @param {string|null} key
 * @param {string|null} [season]
 * @returns {{ intro: string|null, loop: string }|null}
 */
export function resolveBgm(manifest, key, season = null) {
  const a = manifest?.audio;
  if (!a || !key) return null;
  const sb = typeof season === 'string' && season ? a.seasonBgm?.[season] ?? null : null;
  let t = null;
  if (key.startsWith('boss:')) t = sb?.bossBgm?.[key.slice(5)] || a.bossBgm?.[key.slice(5)] || a.bgm?.boss;
  else if (key.startsWith('combat:')) {
    const i = Number(key.slice('combat:'.length));
    t = sb?.combatAlts?.[i] || a.bgm?.combatAlts?.[i] || a.bgm?.combat;
  } else if (key === 'unite') t = sb?.unite || a.bgm?.unite || a.bgm?.combat;
  else t = sb?.[key] || a.bgm?.[key];
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
  // 2026-11-12, docs/rules/audio.md 「규정 새 적 소리」: a walking ally (UnitInfo `walks`: 莱塔尼亚's summons, 谢拉格's giant) is
  // an enemy unit on the player's side — the client's Enemy.PlayAudioSignal keys its born / dead banks by the class ('enemy',
  // its own id only when its prefab has a start / dead effect, which theirs have not), whatever its side: no born bank,
  // ON_UNIT_DEAD.enemy as it falls
  if (info.walks) return 'enemy';
  const id = String(info.defId ?? info.def ?? '');
  if (info.kind === 'device') return 'device';
  if (info.kind === 'token') return /^char_/.test(id) ? 'char' : 'token';
  return 'char';
}

/** 2026-10-29: 克莱门莎 S3 — the cancels of the fall sounds a unit's shells scheduled (her 'die' runs them; a new field clears). */
/**
 * 2026-11-11: the ability a walking ally's form switch casts, by the form it switches to (sim fx 'phase' `form`) —
 * 谢拉格's giant 不眠雪山 (CN prefab enemy_9024_acsgnt: Switch2Snowy into SnowyMountain, Switch2Giant back).
 */
const WALKER_SWITCH = Object.freeze({ enemy_9024_acsgnt: Object.freeze({ SnowyMountain: 'switch2snowy', Giant: 'switch2giant' }) });
/** 假想敌：鳍 (隐秘核心): its storm talent's sound as it comes (AudioManager 'spawn'). */
const ACEEL_STORM = 'enemy_9037_aceel_2';

function shellFalls(mgr, id) {
  const m = (mgr._shellFalls ||= new Map());
  if (!m.has(id)) m.set(id, []);
  return m.get(id);
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
  if (cls === 'device' || cls === 'enemy') return null;   // (an enemy unit has no ON_UNIT_BORN.enemy bank: a walking ally)
  const url = cls === 'token' ? (b.tokenDeploy ?? b.deploy) : b.deploy;
  return typeof url === 'string' ? url : null;
}

/**
 * docs/rules/audio.md 「더빙 효과음」: the file a dub plays in place of a unit's deploy (`born`) / skill start (`skill`,
 * by its skill index) — `sfx.units[def].dub[lang]` (浊心斯卡蒂: the tide / deploy sound with her line mixed in; the client
 * replaces the bank, VoiceLangManager.TryHookAudioByFxLang) — one line drawn at random; null without a dub or with the
 * voice off (the base sound then).
 * @param {any} entry sfx.units[def] @param {'born'|'skill'} kind @param {number|null|undefined} skillIndex
 * @param {string|null|undefined} lang the voice language (public/js/voice.js: 'kr' | 'jp' | 'off') @param {() => number} [random]
 * @returns {string|null}
 */
export function unitDub(entry, kind, skillIndex, lang, random = Math.random) {
  if (typeof lang !== 'string' || lang === 'off') return null;
  const d = entry?.dub?.[lang];
  const e = kind === 'born' ? d?.born : kind === 'skill' && Number.isInteger(skillIndex) ? d?.skills?.[skillIndex] : null;
  const list = (Array.isArray(e?.url) ? e.url : [e?.url]).filter((u) => typeof u === 'string' && u);
  return list.length ? list[Math.min(list.length - 1, Math.floor(random() * list.length))] : null;
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
 * SoundFXBank.Play — a bank (`key`) at its maxSoundAllowed (> 0) stops its oldest sounds for the new
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
   * @param {{ getManifest?: => any, win?: any }} [opts]
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
    this.bgmSeason = null;    // the season whose tracks the key resolves to (resolveBgm)
    this.bgm = null;          // { key, loopUrl, nodes: [{src, gain}], gain }
    this.bgmToken = 0;
    this.lastBgmKey = null;   // the key the screen asked for last (ui/entryFilm.js holdBgm starts it after the film)
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
      if (this.wantBgm) { const k = this.wantBgm; this.wantBgm = null; this.playBgm(k, this.bgmSeason); }
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
   * @param {string|null} [season] the season whose tracks it plays (resolveBgm)
   */
  playBgm(key, season = null) {
    try {
      this.lastBgmKey = key;
      this.bgmSeason = typeof season === 'string' && season ? season : null;
      if (!this.ctx) { this.wantBgm = key; return; }
      const track = resolveBgm(this.getManifest(), key, this.bgmSeason);
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
    // 2026-10-10, docs/rules/audio.md 「공격 소리 신호」: the sound's own delay — SoundFXBank.Play
    // waits `delay / Time.timeScale` (a battle sound: the game speed; a UI one plays at time scale 1)
    const d0 = Number.isFinite(ownDelay) ? ownDelay : info.length > 4 ? info[4] : 0; // a cue's own bank delay first (_playCue)
    const delay = d0 > 0 ? d0 / (limited ? this.gameSpeed() : 1) : 0;
    let slot = null;
    const capped = limited || channel != null;
    if (capped) { slot = this.limiter.acquire(String(channel ?? bank ?? unitKey ?? url), info[2], !!info[3]); if (!slot) return; }
    else if (this.uiVoices >= 12) return;
    else this.uiVoices += 1;
    let done = false, s = null, g = null, unsnap = null, at = null;
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
        at = this.ctx.currentTime + delay;
        if (delay > 0) s.start(at); else s.start();
        const hook = snapshotHookOf(this, url); // local patch: 归溟幽灵鲨's switch sinks the rest of the mix (audioSnapshot.js)
        if (hook) unsnap = holdSnapshot(this, hook);
      } catch { end(); }
    }, end);
    // 2026-10-29: cancels it while it has not started yet (still loading or waiting its delay); a playing one is left
    return () => { if (done || (at != null && at <= this.ctx.currentTime)) return; try { s?.stop(); } catch { /* ignore */ } end(); };
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
      // docs/rules/audio.md 「더빙 효과음」: the chosen dub's copy of the skill start (浊心斯卡蒂: the tide with her line)
      const dub = kind === 'skill' && !m ? unitDub(u, 'skill', skillIndex, this.voiceLang?.(), this.random) : null;
      // 2026-11-03: a listed skill without a start sound of its own sounds none (not the unit's first skill's)
      if (kind === 'skill' && Number.isInteger(skillIndex) && u?.skills && typeof own !== 'string' && dub == null) return false;
      const url = m ? m[kind] : dub ?? (typeof own === 'string' ? own : u?.[kind]);
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
  _playCue(def, c, mode, after = 0, held = null) {
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
    const delay = (Number(f.delay) > 0 ? Number(f.delay) : 0) + (after > 0 ? after : 0); // `after`: castCuesOf
    const cancel = this._play(f.url, { volume, limited: true, bank: `${def}:${c.at}:${f.url}`, delay: delay > 0 ? delay : f.delay });
    if (held && cancel) held.push(cancel);   // (`held`: the caller may cancel it before it starts — a cast lost in its begin clip)
    return true;
  }

  /**
   * The swing of tracked unit `su` (id `id`) as it starts — its mode's cue set, the ability (melee 'combat' / ranged
   * 'attack') and the group child it sounds (audioOfficial.js pickVariant) — or null without cues (the role path).
   * `kind` = the swing / strike's projectile kind ('none' = a melee strike); `signal` = the child ability the sim says took
   * the swing ('swing' 9th field: an AbilityFirstSucceedGroup's, pickVariant `first`).
   */
  _swingOf(su, kind, now, windup = 0, signal = null) {
    const ue = this.getManifest()?.audio?.sfx?.units?.[su.def];
    const mode = su.skillOn ? su.skillIndex : null;
    // an enemy in another prefab mode (enemyMode): that mode's attack signals
    const em = Number.isInteger(su.emode) && su.emode > 0 ? ue?.em?.[su.emode] : null;
    // 2026-10-11: a summon in a named prefab mode (tokenModeName: 뮤엘시스's 流形 after its copy)
    const tn = !em && su.tmode ? tokenModeName(su, this.units.get(su.tby)) : null;
    const tm = tn ? ue?.tm?.[tn] : null;
    // 2026-11-13, docs/rules/audio.md 「유키 마코토 페르소나 소리」: a mode its form holds (a 傀儡师's <替身>: 结城理's personas,
    // shared/skill-modes.js FORM_HELD_MODES) — its signals, whatever skill runs (the one that switched him ended at once)
    const hm = !em && !tm && typeof su.hform === 'string' && Number.isInteger(su.skillIndex) ? ue?.hm?.[su.skillIndex]?.[su.hform] : null;
    const set = em && Array.isArray(em.cues) ? { cues: em.cues, sel: em.sel, mode: true }
      : tm && Array.isArray(tm.cues) ? { cues: tm.cues, sel: tm.sel, mode: false }
        : hm && Array.isArray(hm.cues) ? { cues: hm.cues, sel: hm.sel, mode: true } : cueSetOf(ue, mode, su.skillOn ? su.sub : null);
    if (!set) return null;
    const melee = kind === 'none' || kind == null;
    const ab = cueAbility(set, melee);
    const key = `${em ? `e${su.emode}` : tm ? `t${tn}` : hm ? `h${su.hform}` : set.mode ? `${mode}${su.skillOn && su.sub ? `/${su.sub}` : ''}` : 'd'}:${ab ?? ''}`;
    const mem = ((su.vm ||= new Map()).get(key)) || {};
    su.vm.set(key, mem);
    const k = pickVariant(set.sel, ab, { melee, mem, random: this.random, signal });
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
    if (au.side === 'enemy' || au.walks) {
      // 2026-11-07: a cast with a telegraph (검은 뿔의 루울's 8 s charge) lands past those 3 s: its first damage is still that skill's
      if (au.eskill && (au.eskill.held || now - au.eskill.at <= 3000)) c = (ue?.sk?.[au.eskill.name] || []).find((x) => x.at === 'd') ?? null;
      if (au.eskill) au.eskill.held = false;
    } else if ((au.skillOn || (LANDS_AFTER_SKILL.has(au.def) && now - (au.skillOffAt ?? -Infinity) <= SKILL_LANDS_MS)) && Number.isInteger(au.skillIndex)) {
      const sk = skillDamageKey(au.def, au.skillIndex);
      if (sk != null) { au.kdAt = now; return this._kitSound(sk || null); }
      const kd = ue?.kd?.[au.skillIndex];
      c = Array.isArray(kd) && kd.length ? kd[0] : null;
      if (!c) {
        const set = cueSetOf(ue, au.skillIndex, au.sub);
        if (set?.mode) c = cuesAt(set, 'd', cueAbility(set, false), null, undefined)[0] ?? null;
      }
    }
    if (!c) return false;
    au.kdAt = now;
    return this._playCue(au.def, c, true);
  }

  /**
   * 2026-11-04, docs/rules/audio.md 「스킬 타격음 전수」: a strike whose mode has no impact of its own, cast during skill `sw.mode`,
   * sounds the skill's (`kd`: its projectile's HIT / REACH or its ability's HIT — 斥罪 S1, 鸿雪 S2, 艾雅法拉 S2, 塑心 S1, 妮芙 S2,
   * whose skill can end before the shot lands, so the swing says which skill). Once per target: a strike's second damage
   * instance is the same HIT. Not for the kits whose damage sounds through sfx.kit.
   */
  _strikeSkillImpact(au, sw, target, now) {
    if (!sw.set?.mode || !Number.isInteger(sw.mode) || KIT_SOUND_DEF.test(String(au.def)) || skillDamageKey(au.def, sw.mode) != null) return false;
    const c = this.getManifest()?.audio?.sfx?.units?.[au.def]?.kd?.[sw.mode]?.[0];
    if (!c || (au.kdTarget === target && au.kdTargetAt === now)) return false;
    au.kdTarget = target;
    au.kdTargetAt = now;
    return this._playCue(au.def, c, true);
  }

  /**
   * 2026-11-05, docs/rules/audio.md 「공격 소리 신호」: the START of unit `su`'s `Reload` attack child, if it has one (雪猎: its only bank,
   * p_atk_sncrbwrld). That child is an attack group's, so a swing never picks it (test/audio-cond-group-list.js).
   */
  _reloadCue(su) {
    const ue = su ? this.getManifest()?.audio?.sfx?.units?.[su.def] : null;
    const k = ue?.sel?.attack?.sig?.[RELOAD_CHILD];
    const c = k != null ? ue.cues?.find((x) => x.at === 's' && x.k === k) : null;
    return c ? this._playCue(su.def, c, false) : false;
  }

  /**
   * A unit whose model reports no Spine clip events (spineEvent: no model drawn — the fallback diamond, a crowded low-quality
   * field, a renderer that does not report them; the client always has its model) gets a strike in their place (the event sits in the attack clip, so it
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
   * A unit's spine-event sound (`sfx.units[def].spine[value]`, battle.ON_SPINE_EVENT_TRIGGER.<id>.<value> — 마운틴 S2 / S3
   * punches, 파투스 reload, 필라에's shield): the renderer calls this when the unit's Spine clip reaches event `event` with
   * string value `value` (render/spine.js onEvent). The client's SpineAnimator._OnEvent sounds only the audio events
   * (OnPlayAudio, OnPlayAudio_1–3: AnimationConsts) and names the signal by the event's string (Spine Event.String, not its
   * name; → _PlayBattleAudio `{0}.{1}`; an empty string sounds nothing). `event` null = the unit's model is up and reports
   * its events from now on (no strike stand-in, _spineStrike). Returns whether one played.
   */
  spineEvent(unitId, event, value = null) {
    try {
      const su = this.units.get(unitId);
      if (!su) return false;
      su.spineLive = true;
      if (typeof event !== 'string' || !SPINE_AUDIO_EVENT.test(event) || typeof value !== 'string' || !value) return false;
      const c = this.getManifest()?.audio?.sfx?.units?.[su.def]?.spine?.[value];
      return c ? this._playCue(su.def, { ...c, at: 'a' }, !!su.skillOn) : false;
    } catch { return false; }
  }

  /**
   * 2026-10-23, docs/rules/audio.md 「적 소리」: the skill of an ally built from an enemy record (`su.erec`, shared/skill-modes.js —
   * 炎佑's 祛恶之焰 = its Skill_2) sounds that enemy ability's banks (sfx.units[id].sk): START as it starts, the looping ON
   * (`loop`) held while it runs and cut as it ends — its ON_ABILITY_END bank is only a ctrlStop of that loop (0.2 s fade).
   * 2026-11-11: a walking ally's 'skill' names its ability (`ability`: 谢拉格's giant's Skills/Attract → `attract`).
   */
  _enemyRecordSkill(id, su, ue, on, now, ability = null) {
    const key = `${id}:esk`;
    if (!on) { stopSkillLoop(this, key); su.eskill = null; return; }
    const name = String(ability ?? su.erec?.skill ?? '').split('/').pop().toLowerCase();
    if (!name) return;
    const cues = ue?.sk?.[name];
    if (!Array.isArray(cues)) return;
    for (const c of cues) {
      if (c.at === 'd') continue;
      if (!c.loop) { this._playCue(su.def, c, true); continue; }
      const f = cueFile(c, this.random);
      if (f) startSkillLoop(this, key, f.url, groupGain(c.g) * (f.vol > 0 ? f.vol : 1), { fade: 0.2 });
    }
    su.eskill = { name, at: now };
  }

  /**
   * docs/rules/audio.md 「적 소리」: the renderer saw enemy `unitId` (model `defId`) switch to prefab mode `modeIndex` (the
   * `_modes` order of its prefab, from `prevModeIndex`; render/fxgame.js — IMPL contract 「적 모드 전환」). Its attacks sound
   * that mode's signals from now on (`sfx.units[def].em[mode]`, mode 0 = its Default cues). The client's switch
   * (`Unit.SwitchMode` → InactiveMode / ActivateMode) sounds nothing of its own: the change clip's spine events
   * (spineEvent) and the mode's abilities do. Returns whether the unit's attack sounds changed.
   */
  enemyMode(unitId, defId, modeIndex, prevModeIndex) {
    try {
      const su = this.units.get(unitId);
      if (!su || (su.side !== 'enemy' && !su.walks) || !Number.isInteger(modeIndex) || modeIndex < 0) return false;
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
    this._shellFalls?.clear();
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
    this._skillSeen = new Set(); // 2026-11-05: the units whose skill state its events said since this field (syncRunningSkills)
    this._skillsUnsynced = true;
    const hadEnemy = !!this._enemies?.size; // 2026-10-10: the new field's enemies (noEnemyMs)
    this._enemies = new Set();
    for (const u of Array.isArray(units) ? units : []) this._track(u);
    if (hadEnemy && !this._enemies.size) this._noEnemySince = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  /**
   * 2026-11-05, docs/rules/audio.md 「스킬 타격음 전수」: a field entered late (watching another field, a reconnect, a tab brought back)
   * replays no 'skill' event, so a skill that runs already would sound its unit's normal attack until it ends. `early`: the events
   * buffered before the entry; the last of each unit's says whether its skill runs. Silent: that start sounded for nobody here, only
   * a looping bank is picked up.
   */
  resumeSkills(early) {
    const on = new Map();
    for (const e of Array.isArray(early) ? early : []) {
      if (!Array.isArray(e)) continue;
      if (e[0] === 'skill') on.set(e[1], !!e[2]);
      else if (e[0] === 'die') on.set(e[1], false);
    }
    for (const [id, running] of on) {
      this._skillSeen?.add(id);
      if (running) this._resumeSkill(id);
    }
  }

  /**
   * 2026-11-05: the same from a field's first snapshot (`units`: its tuples), for the skills cast before the buffer began. UF.SKILL
   * leaves out passives, which sound the same either way (test/audio-late-entry.test.js). Once per field: later, the events say it,
   * and right after an 'off' the flag can still be set.
   */
  syncRunningSkills(units) {
    if (!this._skillsUnsynced || !Array.isArray(units)) return;
    this._skillsUnsynced = false;
    for (const t of units) if (Array.isArray(t) && ((t[7] | 0) & UF.SKILL) && !this._skillSeen?.has(t[0])) this._resumeSkill(t[0]);
  }

  _resumeSkill(id) {
    const su = this.units.get(id);
    if (!su || su.side === 'enemy' || su.skillOn) return;
    su.skillOn = true;
    const loop = skillLoopOf(this.getManifest()?.audio?.sfx?.units?.[su.def], su.skillIndex);
    if (loop) startSkillLoop(this, id, loop.url, loopGain(loop));
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
    // 2026-10-23: an ally from an enemy record attacks in its one prefab mode (炎佑: mode 2, the only attack with banks)
    const rec = u.side !== 'enemy' ? enemyRecordMode(u.defId) : null;
    this.units.set(u.id, { def: u.spine || u.defId, defId: u.defId ?? null, kind: u.kind ?? null, side: u.side, boss: !!u.boss,
      skillIndex: Number.isInteger(u.skillIndex) ? u.skillIndex : null, ownerId: u.ownerId ?? null, // ownerId (the battle start's own pieces)
      emode: rec ? rec.mode : undefined, erec: rec,
      // 2026-11-11: a walking ally built from an enemy record (UnitInfo `walks`: 规程's 莱塔尼亚 summons, 谢拉格's giant) sounds
      // as that enemy — its prefab mode (enemyMode), its abilities' banks (_enemyRecordSkill, _skillImpact)
      walks: !!u.walks,
      // 2026-11-13: a 傀儡师's form (UnitInfo `form`: 'doll' / 结城理's 'orpheus'), whose held mode its attacks sound (sfx.units[id].hm)
      hform: typeof u.form === 'string' ? u.form : null,
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
    // docs/rules/audio.md 「더빙 효과음」: the chosen dub's copy of its deploy sound (浊心斯卡蒂: with her 部署 line)
    const dub = u?.side === 'enemy' ? null : unitDub(m?.audio?.sfx?.units?.[u?.def], 'born', null, this.voiceLang?.(), this.random);
    const url = dub ?? deploySfxUrl(m, u);
    if (!url) return false;
    const own = !!dub || url === m?.audio?.sfx?.units?.[u.def]?.born;
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
  _kitSound(hk, delay = null, held = null) {
    const sfx = hk ? this.getManifest()?.audio?.sfx : null;
    const url = sfx?.kit?.[hk];
    if (typeof url !== 'string') return false;
    const cancel = this._play(url, { volume: groupGain(sfx.kitGrp?.[hk] ?? 'Battle_P_SImp'), limited: true, bank: `kit:${hk}`, pop: sfx.kitLimit?.[hk] ?? null, delay });
    if (held && cancel) held.push(cancel); // `held`: the caller's list of sounds it may cancel before they start
    return true;
  }

  /**
   * 2026-11-11: 假想敌：茧 (隐秘核心)'s 悲惨之雨 on a field (sim fx 'zone' acspiderRain { field, id, dur }) — its tile listeners'
   * end sound (`_effectSettings` endAudioSignal acid_rain; bank ON_CUSTOM_TRIGGER.acid_rain, one at a time and no pop) as the
   * rain ends: `dur` after it, at once when the 茧 dies or a new rain on that field takes its place (render/fxgame.js
   * acRainFx ends the floor at the same moments). [추정·엔진: the delay in game seconds, as 克莱门莎's falls]
   */
  _acidRain(o) {
    const field = o.field ?? '-';
    this._acidRainCut((r, f) => f === field);
    const held = [];
    const dur = Math.max(0, Number(o.dur) || 0);
    if (!this._kitSound('acspider:rainend', dur, held)) return;
    (this._acidRains ||= new Map()).set(field, { by: o.id ?? null, held, until: (this.ctx?.currentTime ?? 0) + dur });
  }

  /**
   * 2026-11-12, docs/rules/audio.md 「규정 새 적 소리 — 셋째」: the sounds that need what a unit did before — 机械师 S3's charge
   * landing (the 'aoe' mcnist:charge: its projectile's REACH, when the 'charge' before it flew one with banks,
   * mcnistChargeSounds) and 暴走食人花 back from digesting (its 'phase' with no form after its `eat` one: enemy_trwlpl_s
   * ON_BUFF_FINISH → enemy_trwlpl_eat_complete; `su.digesting` also says whether a kill is the vomit — 'die').
   */
  _seasonState(fx, ex, unitOf) {
    if (!ex || typeof ex !== 'object') return;
    if (fx === 'charge' && unitOf(ex.src)?.def === MCNIST) (this._mcnistCharge ||= new Map()).set(ex.src, mcnistChargeSounds(ex));
    if (fx === 'aoe' && ex.skill === 'mcnist:charge' && unitOf(ex.id)?.def === MCNIST) {
      if (this._mcnistCharge?.get(ex.id) !== false) this._kitSound('mcnist:s3reach');
      this._mcnistCharge?.delete(ex.id);
    }
    if (fx === 'phase' && ex.id != null) {
      const u = unitOf(ex.id);
      if (!u || !TRWLPL.test(u.def || '')) return;
      if (ex.form === 'eat') u.digesting = true;
      else if (ex.form == null && u.digesting) { u.digesting = false; this._kitSound('trwlpl:digested'); }
    }
  }

  /** The rains `pick` chooses that have not ended yet end now: their end sound at once instead of when due. */
  _acidRainCut(pick) {
    if (!this._acidRains) return;
    for (const [f, r] of this._acidRains) {
      if (!pick(r, f)) continue;
      this._acidRains.delete(f);
      if ((this.ctx?.currentTime ?? 0) >= r.until) continue;   // already sounded
      for (const cancel of r.held) cancel();
      this._kitSound('acspider:rainend');
    }
  }

  /** 2026-11-03: sfx.kit key `hk` `n` times at once, at most its bank's own limit (sfx.kitLimit, else 2). */
  _kitSounds(hk, n) {
    const max = this.getManifest()?.audio?.sfx?.kitLimit?.[hk]?.max ?? 2;
    for (let i = 0; i < Math.min(n, max); i++) if (!this._kitSound(hk)) break;
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
          // 2026-11-04, docs/rules/audio.md 「스킬 타격음 전수」: the opening's units are already tracked (field.units), so a skill that
          // starts on deployment arrives first and this 'spawn' must not forget it (宴 S2, 予愿安洁莉娜 S1 sounded their normal attack)
          const was = this.units.get(e[1]?.id);
          const started = was?.skillOn && ev.some((x) => Array.isArray(x) && x[0] === 'skill' && x[1] === e[1]?.id && x[2]);
          this._track(e[1]);
          if (started) this.units.get(e[1].id).skillOn = true;
          // 2026-11-11: 假想敌：鳍 (隐秘核心)'s storm talent starts as it comes (aceel[thurder-trigger] audioSignal Aceel_ThurderEnv)
          if (e[1]?.defId === ACEEL_STORM) this._kitSound('aceel:thunder');
          if (e[1]?.defId === DSSHELL) this._kitSound('dsshell:born');   // 2026-11-12: ON_UNIT_BORN.trap_156_dsshell
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
          this._skillSeen?.add(e[1]);
          const su = this.units.get(e[1]);
          if (su) {
            if (su.skillOn && !e[2]) su.skillOffAt = now;
            su.skillOn = !!e[2];
            su.sw = null; su.vm = null; // 2026-10-10: a new mode run — its groups start over (a conditional group's first attack)
            su.sub = null; // 2026-10-29: a mode it switched to on the way ends with the skill run (SKILL_SUB_MODES)
            su.haloLinked = null; // 2026-10-29: 溯光星源 S3's linked enemies of this run (haloLinkCount)
            // 2026-10-10: its 过载 ends with the skill (락락: rockr_s_2[overload] ON_BUFF_FINISH → rockr_overload_finish)
            if (su.over && su.def === 'char_4040_rockr') this._kitSound('rockr:ovf');
            su.over = false;
            const ue = this.getManifest()?.audio?.sfx?.units?.[su.def];
            if (su.erec) this._enemyRecordSkill(e[1], su, ue, !!e[2], now);
            else if (su.walks) this._enemyRecordSkill(e[1], su, ue, !!e[2], now, typeof e[3] === 'string' ? e[3] : null);
            const loop = skillLoopOf(ue, su.skillIndex); // its looping bank (music, field)
            if (loop && e[2]) startSkillLoop(this, e[1], loop.url, loopGain(loop));
            else if (!e[2]) stopSkillLoop(this, e[1]);
            // 2026-11-12, docs/rules/audio.md 「스킬 효과음」: a cast with a begin clip casts its skill ability once the clip has
            // played (`begin`, skill-mode-sfx.mjs skillBeginLeads) — the ability's START waits it, and a cast lost meanwhile
            // (the sim's 'skill' off before the start) never sounds it
            for (const cancel of su.beginHeld ?? []) cancel();
            su.beginHeld = null;
            const lead = e[2] ? skillBeginOf(ue, su.skillIndex) : 0;
            const held = lead > 0 ? (su.beginHeld = []) : null;
            // local patch (maintainer report): its extra one-shots (耀骑士临光 S3, 塑心 S3's melody — held ones cut at its end)
            if (e[2]) {
              skillExtrasOf(ue, su.skillIndex).forEach((x, k) => {
                const gain = loopGain(x);
                if (Number.isFinite(x.stop)) startSkillLoop(this, `${e[1]}:x${k}`, x.url, gain, { loop: false, fade: x.stop });
                else {
                  const cancel = this._play(x.url, { volume: gain, limited: true, bank: `${su.def}:x${su.skillIndex}:${k}`, delay: lead > 0 ? lead : null });
                  if (held && cancel) held.push(cancel);
                }
              });
            } else skillExtrasOf(ue, su.skillIndex).forEach((x, k) => stopSkillLoop(this, `${e[1]}:x${k}`));
            // 2026-10-29, docs/rules/audio.md 「스킬 시전 능력 소리」: its skill ability's own START / ON / HIT (the sim's
            // [strike, end] in e[4], which counts the begin clip; its START waits the clip too — `lead`)
            if (e[2]) for (const { cue, after } of castCuesOf(ue, su.skillIndex, e[4], lead)) this._playCue(su.def, cue, true, after, cue.at === 's' ? held : null);
            if (e[2] && mlyssS3Range(su, e[1], this.units)) this._kitSound('mlyss:s3range');
            // modes[i].deferStart: a fallback start sound — it plays only for a skill that ended without an attack (its
            // attacks sound the skill's own attack sound, as the official ability signals do)
            if (!e[2] && su.startHeld) this.unit(su.def, 'skill', e[1], su.skillIndex ?? undefined);
            su.startHeld = false;
            // 2026-10-10, docs/rules/audio.md 「스킬 종료음」: its ON_SKILL_FINISH / ON_ABILITY_END bank as it ends
            // (2026-10-29: `mode` = the START of the mode its end switches to — 蒂比's landing, 蕾缪安 S3's closing call — which
            // a unit leaving the field in this batch never casts)
            const fin = !e[2] ? skillEndOf(ue, su.skillIndex) : null;
            if (fin && !(fin.mode && ev.some((x) => x[0] === 'die' && x[1] === e[1]))) this._play(fin.url, { volume: loopGain(fin), limited: true, bank: `${su.def}:end:${su.skillIndex}` });
            // 2026-10-29, docs/rules/audio.md 「스킬 시전 능력 소리」: 薄绿 S2 — its skill ability's ON_ABILITY_ATTACK_FINISH as the
            // end clip starts (the skill's three-part animation fires the attack-finish event then), not at the burst 0.6 s later
            if (!e[2] && ATTACK_FINISH_SOUNDS[su.def]?.[su.skillIndex] && !ev.some((x) => x[0] === 'die' && x[1] === e[1])) this._kitSound(ATTACK_FINISH_SOUNDS[su.def][su.skillIndex]);
          }
        }
        if (kind === 'swing') {
          // 2026-10-10, docs/rules/audio.md 「공격 소리 신호」: a normal attack's swing starts — its START banks now
          // (AbilityStandard.OnCastStart), its group child chosen for the whole attack (sim ai.js 'swing')
          const su = this.units.get(e[1]);
          if (!su) continue;
          // 2026-10-30: a talent ability cast in place of the attack (9th field) — its own START, none of the attack's cues
          const tsk = e.length > 8 ? talentSwingKeys(su.def, e[8]) : null;
          if (tsk) { su.sw = null; for (const k of tsk) this._kitSound(k); continue; }
          su.sw = this._swingOf(su, e[3], now, e[2], e.length > 8 ? e[8] : null);
          if (su.sw) this._swingCues(su, su.sw, 's');
          this._kitSound(signalAttackKey(su, 's', e[3] === 'none' || e[3] == null)); // 2026-10-10: its buff's swing sound
          continue;
        }
        if (kind === 'atk') {
          // a chain bounce: its first id is the previous target, whose attack sound this is not (see header)
          if (CHAIN_KINDS.has(e[3])) { this.lastAttacker.delete(e[2]); this.chainStruck.set(e[2], now); continue; }
          const src = this.units.get(e[1]);
          if (!src) continue;
          // 2026-11-12: a shot of an enemy skill (ENEMY_SHOT_SKILLS — 破城者's missiles): that skill's ON, not the normal attack's
          // cues; its impact is the skill's (_skillImpact, the cast's eskill)
          const shot = ENEMY_SHOT_SKILLS[e[3]];
          if (shot) {
            const cues = this.getManifest()?.audio?.sfx?.units?.[src.def]?.sk?.[shot];
            if (Array.isArray(cues)) for (const c of cues) if (c.at === 'a') this._playCue(src.def, c, true);
            if (src.eskill?.name === shot) src.eskill.at = now;
            continue;
          }
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
            sw = this._swingOf(src, e[3], now, 0, e.length > 4 ? e[4] : null);
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
              const later = strikeAfterKey(src); // 2026-11-03: a buff its strike starts that sounds as it ends
              if (later) this._kitSound(later.key, later.after);
            }
            src.lastAtkAt = now;
            // 2026-10-22: a shell fired at a spot (kind 'mortar') hits by itself 3 s later as 无来源 damage, sounding its own banks
            // (kitHitKey 'bombard') — no impact of this attack for that damage to take (at a high game speed it fell inside the window)
            if (tgt && tgt.side !== src.side && e[3] !== 'mortar') this.lastAttacker.set(e[2], { def: src.def, at: now, mode, sw, id: e[1] });
            // (2026-10-22: a shell fired at a spot — kind 'mortar' — sounds its own banks: kitHitKey 'emppnt:aim')
            if (src.side === 'enemy' && e[3] !== 'mortar' && !sw.set.cues.some((c) => c.at === 's' || c.at === 'a')) this.battle('enemyHit', { volume: 0.35 });
            continue;
          }
          if (tgt && tgt.side !== src.side && e[3] !== 'mortar') this.lastAttacker.set(e[2], { def: src.def, at: now, mode, id: e[1] });
          if (!this.unit(src.def, 'attack', e[1], undefined, mode) && src.side === 'enemy' && e[3] !== 'mortar') this.battle('enemyHit', { volume: 0.35 });
          this.unit(src.def, 'on', e[1], undefined, mode); // 2026-10-10: its ON bank too (START and ON both sound)
        } else if (kind === 'dmg') {
          // the 9th field's moments whose buff plays a sound on the target (MOMENT_SOUNDS)
          if (Array.isArray(e[8])) for (const m of e[8]) if (Array.isArray(m) && MOMENT_SOUNDS[m[0]]) this._kitSound(MOMENT_SOUNDS[m[0]]);
          if (!IMPACT_TYPES.has(e[3])) continue;
          // 2026-10-11 (user report: 아스카론's 死亡拘审 ticks sounded as her attack, docs/rules/audio.md 「지속 피해 틱」): a damage-over-time
          // tick (the sim's 7th field, damage.js dotFlag) is a buff's damage in the client — no ability HIT, no sound — and
          // neither an attack's impact (it must not take the one lastAttacker keeps for the real hit) nor a skill impact
          // 2026-10-22: … unless its buff plays a sound of its own (dotTickKey: 锡人's alchemy unit)
          if (e[6] === 1) { if (e.length > 5 && e[5] != null) this._kitSound(dotTickKey(this.units.get(e[5])?.def)); continue; }
          // 2026-10-29 (docs/rules/audio.md 「스킬·재능 투사체 소리」): an unreleased drone's additional damage — its own Funnel
          // projectile's HIT, not one of the attack's impacts
          if (e[6] === 2) { if (e.length > 5 && e[5] != null) this._kitSound(funnelHitKey(this.units.get(e[5]))); continue; }
          // 2026-11-04 (maintainer report: Mon3tr S3's impact sound over and over): an HP loss (the 7th field 3, Battle.loseHp) and
          // a unit's damage to itself are no hit — they must not sound one, nor take the impact of a real one (lastAttacker)
          if (e[6] === 3 || (e.length > 5 && e[5] != null && e[5] === e[1])) continue;
          // 2026-10-22: a unit 帝国炮火先兆者's shell hit as it landed (the 'bombard' of this moment; its damage has no source)
          if (e.length > 5 && e[5] == null && this._shellAt === now) { this._kitSound('emppnt:hit'); this._kitSound('emppnt:shell'); continue; }
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
            // 2026-11-04 (docs/rules/audio.md 「스킬 타격음 전수」): a charge skill ends on its strike and takes the open swing with it, so
            // the strike's other hits take the swing of its first impact (至简 S2's second shot, 艾雅法拉 S2's splash)
            const heir = !own && !au.sw && Number.isInteger(au.impactSw?.mode) && now - (au.lastImpactAt ?? -Infinity) <= 100 ? au.impactSw : null;
            const splash = !own && (au.sw || heir) && (now - (au.lastAtkAt ?? -Infinity) <= 100 || now - (au.lastImpactAt ?? -Infinity) <= 100);
            // 2026-10-16 (docs/rules/audio.md 「연쇄 공격 소리」): a chain bounce's unit — the shot's per-target HIT sounds
            // only (its REACH sounded at the first unit), and its chain sound once per moment
            const bounce = this.chainStruck.get(e[1]) === now;
            if (bounce) this.chainStruck.delete(e[1]);
            if (own || splash) {
              const sw = own ? own.sw : au.sw || heir;
              au.lastImpactAt = now;
              au.impactSw = sw;
              if (sw && bounce) {
                this._swingCues(au, sw, 'd', sw.h++, (c) => !c.r);
                if (au.lastChainAt !== now) { au.lastChainAt = now; this._swingCues(au, sw, 'c'); }
              } else if (sw) {
                this._kitSound(strikeImpactKey(au, sw.h, sw.mode));
                if (!this._swingCues(au, sw, 'd', sw.h++)) this._strikeSkillImpact(au, sw, e[1], now);
              }
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
          // 2026-11-13: 结城理 S1 俄耳甫斯's heal — its hit effect makoto_skill_01_heal_01 on the ally, whose OnPlayAudioPlayer waits 0.5 s
          const hu = e[3] != null ? this.units.get(e[3]) : null;
          if (hu?.def === MAKOTO && hu.hform === 'doll' && hu.skillIndex === 0) this._kitSound('makoto:s1heal', MAKOTO_AT.s1heal, (hu.mkHeld ||= []));
        } else if (kind === 'skill' && e[2]) {
          const u = this.units.get(e[1]);
          if (u) {
            const ue = this.getManifest()?.audio?.sfx?.units?.[u.def]; // local patch
            if (modeEntry(ue, u.skillIndex)?.deferStart) u.startHeld = true; // local patch
            else if (!skillLoopOf(ue, u.skillIndex)?.start) this.unit(u.def, 'skill', e[1], u.skillIndex ?? undefined); // local patch: a start bank that loops plays as the loop
            // 2026-11-01: 予愿安洁莉娜 S1 opens on Skill_1_Begin (AudioWhenPlayAnimation aglna2_born, CN client) [추정·CN: S1's
            // take-off plays that clip at the cast — the S1 mode turns Born into it]
            if (u.def === 'char_1015_aglna2' && u.skillIndex === 0) this._kitSound('aglna2:born');
            // 2026-11-02: 凛御银灰 S3's own buff svash2_s_3[self_bird_onuse] casts BirdAura_Self as it starts — the aura
            // projectile_chr_svash2_s3's BORN (no `_preDelay`, no `_waitForAttackEvent`: at once)
            if (u.def === 'char_1045_svash2' && u.skillIndex === 2) this._kitSound('svash2:s3born');
            // 2026-11-03: 铁钳号·原型机's skill — its sktok_ironmn_pile3 ability START (a summon: no unit entry of its own)
            if (u.def === 'token_10027_ironmn_pile3') this._kitSound('ironmn:pile3s');
            // 作战中N: the equipped skill's own slot (0-based; 作战中4 is the fallback of a 4th slot)
            if (unitSoundClass(u) === 'char') {
              const n = Number.isInteger(u.skillIndex) ? Math.min(4, u.skillIndex + 1) : 1;
              const pick = this.voicePolicy?.skill(u); // local patch: official type + a random 作战中 (voicePolicy.js)
              if (pick) { if (pick.slot) this.voice(u.def, pick.slot, { unitKey: e[1], type: pick.type }); } // slot null: no line
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
          for (const cancel of this.units.get(e[1])?.beginHeld ?? []) cancel(); // 2026-11-12: a skill START still waiting its begin clip
          for (const cancel of this.units.get(e[1])?.mkHeld ?? []) cancel(); // 2026-11-13: 结城理's switch / heal sounds still due
          for (const cancel of this._shellFalls?.get(e[1]) ?? []) cancel(); // 2026-10-29: 克莱门莎 S3's falls still due
          this._shellFalls?.delete(e[1]);
          this._acidRainCut((r) => r.by === e[1]); // 2026-11-11: its rain ends with the 茧
          const u = this.units.get(e[1]);
          if (!u) continue;
          u.gone = true; // 2026-11-03 (mlyssS3Range)
          if (u.side === 'enemy') this._enemyOut(e[1], now);
          this._kitSound(knockOutSound(u.def, typeof e[2] === 'string' ? e[2] : null)); // 2026-11-12: a 萨卡兹子裔's summon sound
          // 2026-11-12: 暴走食人花 killed while digesting (enemy_trwlpl_s ON_BEFORE_TRY_SET_HP_ZERO out of mode 0 → eat_failed)
          if (u.digesting && e[2] === 'killed') this._kitSound('trwlpl:vomit');
          // 2026-11-12: 赘生甲壳 broken or eaten — its own ON_UNIT_DEAD bank, not a summon's (a death reason only: Entity.IfReasonIsDeath)
          if (u.defId === DSSHELL) { if (e[2] === 'killed') this._kitSound('dsshell:dead'); continue; }
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
          if (u) { u.motes = null; u.gone = false; } // 2026-11-03: a new deployment (motesBack, mlyssS3Range)
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
          // 2026-11-01: 予愿安洁莉娜's Born clip (AudioWhenPlayAnimation aglna2_born, CN client) beside the deploy sound
          if (u.def === 'char_1015_aglna2') this._kitSound('aglna2:born');
          // 2026-11-04: 黑键's passive ebnhlz_c (CommonAbilities/Passive PassiveBuffAbility, audioSignal buff_ebnhlz[audio]) starts
          // on him as he enters the field
          if (u.def === 'char_4046_ebnhlz') this._kitSound('ebnhlz:born');
        } else if (kind === 'fx') {
          if (e[1] === 'bombard' && e[4]?.kind === 'emppnt') this._shellAt = now;   // 2026-10-22: its hits follow in this batch (dmg)
          // 2026-10-10, docs/rules/audio.md 「적 소리」: an enemy skill's cast (sim fx 'enemySkill' { id, ability }) —
          // its ability's START / ON banks and projectiles' BORN now, its impacts on the damage it deals (_skillImpact)
          if (e[1] === 'enemySkill' && e[4]?.id != null && typeof e[4].ability === 'string') {
            const eu = this.units.get(e[4].id);
            const cues = eu ? this.getManifest()?.audio?.sfx?.units?.[eu.def]?.sk?.[e[4].ability.toLowerCase()] : null;
            if (eu && Array.isArray(cues)) {
              // (2026-11-12: a skill whose ON sounds per shot — ENEMY_SHOT_SKILLS — sounds it on each shot's 'atk')
              const perShot = !!ENEMY_SHOT_OF[e[4].ability.toLowerCase()];
              for (const c of cues) if (c.at !== 'd' && !(perShot && c.at === 'a')) this._playCue(eu.def, c, true);
              eu.eskill = { name: e[4].ability.toLowerCase(), at: now };
            }
          }
          if (e[1] === 'telegraph' && e[4]?.caster != null) { const eu = this.units.get(e[4].caster); if (eu?.eskill) eu.eskill.held = true; }
          // local patch (maintainer report): a dollkeeper's form switch (归溟幽灵鲨: to the 替身 and back, audioOfficial.js)
          const ds = e[4]?.id != null ? dollSwitchSfx(this.units.get(e[4].id)?.def, e[1]) : null;
          if (ds) this._dollSwitch(e[4].id, ds);
          // local patch: a kit's skill hit — its official hit sound (sfx.kit, tools/assets/kit-sfx.mjs), one at a time per key
          // local patch (maintainer report 2026-10-07): the skill's going-off sound first (kitStartKey), then its impact
          const unitOf = (id) => this.units.get(id);
          // 2026-11-04: 遥's ShieldOnly child (nothing to attack or heal: the attack is the bubble) — its START in the running mode
          if (e[1] === 'shield' && e[4]?.only != null) {
            const hu = unitOf(e[4].only);
            const hs = hu ? this._swingOf(hu, 'bullet', now, 0, 'ShieldOnly') : null;
            if (hs) this._swingCues(hu, hs, 's');
          }
          // 2026-10-10: a 过载 starts — the running skill's attacks sound its overloaded buff banks from now (signalAttackKey)
          if (e[1] === 'overload' && e[4]?.id != null) { const ou = unitOf(e[4].id); if (ou) ou.over = true; }
          // 2026-10-29: the running skill switches its owner's mode on the way (维什戴尔's 过载, 乌尔比安 S3's anchor —
          // shared/skill-modes.js SKILL_SUB_MODES): its attacks sound that mode's signals until the skill ends (cueSetOf)
          if (e[4]?.id != null) {
            const ou = unitOf(e[4].id);
            if (ou?.skillOn && ou.sub !== e[1] && this.getManifest()?.audio?.sfx?.units?.[ou.def]?.modes?.[ou.skillIndex]?.sub?.[e[1]]) { ou.sub = e[1]; ou.sw = null; ou.vm = null; }
          }
          // 2026-10-11: a summon's prefab mode from now on (tokenModeName) — 流形's copy names it, a split copy keeps its origin's
          if ((e[1] === 'copy' || e[1] === 'split') && e[4]?.id != null) {
            const tu = unitOf(e[4].id);
            const from = e[1] === 'split' ? unitOf(e[4].src) : null;
            const tmode = e[1] === 'copy' ? e[4].mode : from?.tmode;
            if (tu && (tmode === 'Melee' || tmode === 'Range')) { tu.tmode = tmode; tu.tby = e[1] === 'copy' ? e[4].by ?? null : from.tby; tu.sw = null; tu.vm = null; }
            if (tu && e[1] === 'split') tu.split = true; // 2026-11-03: a split copy (mlyssS3Range)
          }
          for (const hk of [kitStartKey(e[1], e[4], unitOf), kitHitKey(e[1], e[4], unitOf), signalFxKey(e[1], e[4], unitOf)]) {
            this._kitSound(hk);
            // 2026-10-29: 耶拉 S2's Funnel_0 — its TriggerAudioSignalBehaviour after each hit (`_preDelay` 0.6 s) [추정·엔진: the
            // ability's playback speed, which divides it, taken as 1]
            if (hk === 'kjera:s2') this._kitSound('kjera:s2end', 0.6);
            // 2026-10-29: 克莱门莎 S3 — the shell's fall sound 0.5 s before each of its `n` impacts, 1 s apart from `dur` after it
            // reached (the prefab's fall behaviour: 0.5 s after it reached, then every 1 s). The shell stops with her
            // (`_stopWhenSourceInvalid`): her 'die' cancels the falls not yet sounded
            if (hk === 'clemnt:s3reach') {
              const held = shellFalls(this, e[4].src);
              for (let n = 0; n < (Number(e[4].n) || 3); n++) this._kitSound('clemnt:s3fall', Math.max(0, (Number(e[4].dur) || 0) - 0.5) + n, held);
            }
          }
          // 2026-10-29: 荒芜拉普兰德 S3's wolves released (each cruise projectile's BORN), 溯光星源 S3's newly linked enemies
          if (e[1] === 'drones' && e[4]?.id != null && unitOf(e[4].id)?.def === 'char_1038_whitw2' && unitOf(e[4].id)?.skillIndex === 2) {
            for (let i = 0; i < Math.max(1, Number(e[4].n) || 1); i++) if (!this._kitSound('whitw2:s3born')) break;
          }
          // 2026-11-05: 雪猎's Reload child casts once per round, with no round or no target (the sim's 猎手 reload says so: `cast`)
          if ((e[1] === 'hunterReload' || e[1] === 'hunterRound') && e[4]?.cast && e[4].id != null) this._reloadCue(unitOf(e[4].id));
          // 2026-11-01: 塔露拉 S3's wave — each lane's 簇火 fired at once (its BORN), at most the bank's own limit
          if (e[1] === 'oxiWave' && e[4]?.id != null && unitOf(e[4].id)?.def === 'char_4247_oxi') {
            const max = this.getManifest()?.audio?.sfx?.kitLimit?.['oxi:s3fire']?.max ?? 2;
            for (let i = 0; i < Math.min(Math.max(1, (Number(e[4].z) - Number(e[4].a) + 1) || 1), max); i++) if (!this._kitSound('oxi:s3fire')) break;
          }
          if (e[1] === 'link' && e[4]?.id != null) for (let i = haloLinkCount(unitOf(e[4].id), e[4].ids); i > 0; i--) this._kitSound('halo2:s3link');
          for (const [k, d, n] of enemyBuffSounds(e[1], e[4], unitOf)) if (n) this._kitSounds(k, n); else this._kitSound(k, d);
          for (const [k, d] of seasonSounds(e[1], e[4], unitOf)) this._kitSound(k, d);   // 2026-11-12
          // 2026-11-13: a 傀儡师's form from now on (its attacks: the held mode's signals, _swingOf) and 结城理's switch / heal sounds
          if (DOLL_FORM_FX.has(e[1]) && e[4]?.id != null) {
            const fu = unitOf(e[4].id);
            if (fu) { fu.hform = typeof e[4].form === 'string' ? e[4].form : null; fu.sw = null; fu.vm = null; }
            // (what the last form had still due ends with it — S3's heals: the kit drops them on the way back)
            for (const cancel of fu?.mkHeld ?? []) cancel();
            if (fu) fu.mkHeld = null;
          }
          const mu = e[4]?.id != null ? unitOf(e[4].id) : null;
          for (const [k, d] of makotoSounds(e[1], e[4], mu)) this._kitSound(k, d, (mu.mkHeld ||= []));
          this._seasonState(e[1], e[4], unitOf);
          if (e[1] === 'burst') for (const k of elementBurstSounds(e[4], unitOf)) this._kitSound(k);   // 2026-11-12
          if (e[1] === 'enemySkill') this._kitSound(mncturHitSound(e[4], unitOf, ev));                  // 2026-11-12
          if (e[1] === 'zone' && e[4]?.kind === 'acspiderRain') this._acidRain(e[4]);
          // 2026-11-11: 谢拉格's giant switching form (sim fx 'phase' { id, form } at the switch's start) — that ability's banks
          if (e[1] === 'phase' && e[4]?.id != null && typeof e[4].form === 'string') {
            const wu = unitOf(e[4].id);
            const ab = wu?.walks ? WALKER_SWITCH[wu.def]?.[e[4].form] : null;
            const cues = ab ? this.getManifest()?.audio?.sfx?.units?.[wu.def]?.sk?.[ab] : null;
            if (Array.isArray(cues)) for (const c of cues) if (c.at !== 'd') this._playCue(wu.def, c, true);
          }
          // 2026-11-03, docs/rules/audio.md 「버프·커스텀 트리거 소리」: one sound per unit, at most the bank's own limit — a blast's
          // enemies (aoeHitKey), the enemies a waking one puts to sleep (缇缇 S3: titi_s_3[effect_line] PlayAudio
          // titi_s_3[spread_from] on each), 魔王's 微尘 back in her orbit (motesBack)
          if (e[1] === 'aoe') this._kitSounds(aoeHitKey(e[4], unitOf), Number(e[4]?.n) || 0);
          if (e[1] === 'wake' && e[4]?.id != null && unitOf(e[4].id)?.side === 'enemy' && Array.isArray(e[4].to)) this._kitSounds('titi:spread', e[4].to.length);
          if (e[1] === 'motes' && e[4]?.id != null) { const mu = unitOf(e[4].id); this._kitSounds(cetsyrMoteKey(mu, 'ready'), motesBack(mu, e[4])); }
          // 2026-11-01: 予愿安洁莉娜 S2 — Skill_2_Begin (ChantWithProjectileBeforeSkill `_afterEndAnim`) plays as the glide's
          // 吟唱 ends, `chant` s on: its AudioWhenPlayAnimation signal [추정·CN: at the clip's start — the class is CN-only]
          if (e[1] === 'dash' && e[4]?.id != null && unitOf(e[4].id)?.def === 'char_1015_aglna2') this._kitSound('aglna2:s2begin', Math.max(0, Number(e[4].chant) || 0));
          // 2026-11-01: 本能的召唤 leaving (token_phatm2_encdool_kill ON_BUFF_FINISH): its Boom first when a lured enemy reached
          // it (`boom`: the BUFF_TRIGGER path), the boom_start, then each enemy of its x-1 starting phatm2_s_2[damage] (`n`)
          if (e[1] === 'aoe' && e[4]?.skill === 'phatm2:call') {
            if (e[4].boom) this._kitSound('phatm2:boom');
            this._kitSound('phatm2:boomstart');
            const max = this.getManifest()?.audio?.sfx?.kitLimit?.['phatm2:boomhit']?.max ?? 2;
            for (let i = 0; i < Math.min(Number(e[4].n) || 0, max); i++) if (!this._kitSound('phatm2:boomhit')) break;
          }
          // 2026-10-22: a kitHit for `n` units at once (圣聆初雪 S2's tick) — one per unit, at most the bank's own limit
          // (布丽吉德's `n` is which of the cut's three prefabs, not a count)
          if (e[1] === 'kitHit' && Number(e[4]?.n) > 1 && e[4].k !== 'brigid:cut') {
            const hk = kitHitKey(e[1], e[4], unitOf);
            const max = this.getManifest()?.audio?.sfx?.kitLimit?.[hk]?.max ?? 2;
            for (let i = 1; i < Math.min(Number(e[4].n), max); i++) this._kitSound(hk);
          }
          // a summon used up by its own effect (香槟炸弹 exploding: `consumed`): its impact sound now, no death sound
          const ex = e[4];
          if (!ex || typeof ex !== 'object' || !ex.consumed || ex.id == null) continue;
          const u = this.units.get(ex.id);
          if (!u || u.side === 'enemy') continue;
          this.consumed.add(ex.id);
          if (this.consumed.size > 200) this.consumed.delete(this.consumed.values().next().value);
          this.unit(u.def, 'hit', `${ex.id}:boom`);
        } else if (kind === 'tplfx') {
          // 2026-11-01: a template effect whose buff also carries an audio signal (['tplfx', target, effectKey, source])
          this._kitSound(TPL_FX_SOUNDS[e[2]] ?? null);
        } else if (kind === 'status' && e[3]) {
          // 2026-11-01: a kit buff whose client buff carries an audio signal, as it starts on its holder (statusSoundKey)
          this._kitSound(statusSoundKey(e[2], e.length > 4 && e[4] != null ? this.units.get(e[4])?.def : null));
        } else if (kind === 'status') {
          // 2026-11-03: an enemy's kit buff whose end sounds (enemyStatusOffSound)
          this._kitSound(enemyStatusOffSound(e[2], this.units.get(e[1])?.def));
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
 * @param {{ getManifest: => any, subscribe: (fn: (s:any, prev:any) => void) => => void, getState: => any,
 *   selectRoute: (s:any) => string, selectSeason?: (s:any) => string|null,
 *   settings?: { bgm:number, sfx:number, voice:number, muted:boolean } }} deps
 */
export function installAudio(deps) {
  try {
    manifestGetter = typeof deps?.getManifest === 'function' ? deps.getManifest : manifestGetter;
    audio.install();
    if (deps?.settings) audio.setVolumes(deps.settings);
    if (typeof deps?.subscribe === 'function' && typeof deps?.getState === 'function') {
      const seasonOf = (s) => (typeof deps.selectSeason === 'function' ? deps.selectSeason(s) : null);
      const sync = (s) => {
        try {
          const pub = s.match?.public ?? null;
          // 开战 BGM: the round's own track out of bgm.combatAlts (骑士之日 / 无畏者 are fixed per round, not drawn),
          // so every client of a room hears the same one, a mid-fight re-render (or a teammate view) never switches,
          // and the next round moves on by the table. 联防 shares its round ⇒ same key ⇒ the loop keeps playing.
          // 2026-11-11: in the season's own tracks (the room's, else the picked one — resolveBgm)
          audio.playBgm(bgmKeyFor(deps.selectRoute(s), pub, combatTrackFor(pub?.round)), seasonOf(s));
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
          || s.match?.public?.bossId !== prev?.match?.public?.bossId || seasonOf(s) !== seasonOf(prev)) sync(s);
      });
    }
  } catch (err) { console.warn('[audio] install failed', err); }
  return () => {};
}
