// test/audio-cond-group-list.js — every attack group with a condition per child (AbilitySelectableGroup `_abilityConfigs`), read
// from the official client; pinned by test/audio-cond-group.test.js (docs/rules/audio.md 「공격 소리 신호」, 2026-11-04).
//
// `plain`: the child(ren) an attack sounds when the sim says nothing — the unconditional one; `melee` for a melee strike when it
// differs. `others`: each other child, as it sounds —
//   'signal: …'  the sim names it (a kit's 'swing' hook sets `c.signal`, or `forceAttack` `{ signal }`);
//   'key <k>: …' a kit moment sounds the sfx.kit key <k> (tools/assets/kit-sfx.mjs);
//   'same: …'    it sounds what `plain` sounds, or the sim never reaches a difference;
//   'none: …'    never sounded, with the reason.
// A new group: read its children's triggers and selectors (tools/local-extract/link_sheet.py prints them, 「attack groups」).

export const COND_GROUPS = Object.freeze({
  'char_1033_swire2|HealAlly,Attack': { plain: ['Attack'], others: { HealAlly: 'key swire2:heal: coin buff and an injured ally — the kit casts it apart (fx swire2Heal)' } },
  'char_1033_swire2|SpawnToken,Attack': { plain: ['Attack'], others: { SpawnToken: 'key swire2:throw: coin and a free tile — the kit throws it apart (fx swire2Throw)' } },
  'char_1034_jesca2|ExtraBomb,S3Attack': { plain: ['S3Attack'], others: { ExtraBomb: 'key jesca2:s3shell: on jesca2_s_3_trigger[extra_bomb] — the kit fires it apart (fx bombardShell)' } },
  'char_1041_angel2|S3FireToToken,Common': { plain: ['Common'], others: { S3FireToToken: 'key angel2:s3fire: S3\'s opening strike at her 浮空炮台 (fx airstrike, signal fireToToken)' } },
  'char_1041_angel2|RangedAttack': { plain: ['RangedAttack'], others: {} },
  'char_1052_kalts2|AttackEnemy,HealAlly': { plain: ['AttackEnemy'], others: { HealAlly: "signal: with no enemy to select, op-kalts2.js s2CanAttack's forceAttack" } },
  'char_4039_horn|BlockedMeleeAttack,RangedAttack,MeleeAttack': { plain: ['RangedAttack'], melee: 'MeleeAttack', others: { BlockedMeleeAttack: 'same: the melee child at a blocked enemy, the same bank' } },
  'char_4039_horn|BlockedRangedAttack,RangedAttack,SelfRangedAttack': { plain: ['RangedAttack'], others: { BlockedRangedAttack: 'same: only child 2 has banks', SelfRangedAttack: 'same: only child 2 has banks' } },
  'char_4042_lumen|Special,Common': { plain: ['Common'], others: { Special: 'signal: S3 at an ally with an abnormal status (kit swing hook)' } },
  'char_4182_oblvns|RangedMulti,RangedAlways': { plain: ['RangedMulti'], others: { RangedAlways: 'none: the no-target fallback (its selector takes a tile); an attack of ours always has a target' } },
  'char_4202_haruka|AttackAndShield,ShieldOnly': { plain: ['AttackAndShield'], others: { ShieldOnly: 'signal: nothing to attack or heal, the attack is the bubble (fx shield `only`, audio.js)' } },
  'char_4207_branch|FirstAttack,AbilityName': { plain: ['AbilityName'], others: { FirstAttack: 'same: `first` picks it on the mode\'s first attack' } },
  'char_420_flamtl|Attack_T1+,Attack_T1,Attack': { plain: ['Attack'], others: { 'Attack_T1+': 'same: the sounds of Attack_T1, the swing names that one', Attack_T1: 'signal: on flamtl_t_1[evade], after a dodge (kit swing hook)' } },
  'char_4211_snhunt|Attack,ReloadAttack,Reload': { plain: ['Attack'], others: { ReloadAttack: 'same: the same banks as Attack', Reload: 'signal: no round or no target — the 猎手 reload\'s fx hunterReload / hunterRound `cast`, one START per round (audio.js _reloadCue)' } },
  'char_4217_makoto|HealAlly_Lt50Per,MagicAttack': { plain: ['MagicAttack'], others: { HealAlly_Lt50Per: 'signal: an ally under 50 % HP in range (AdvancedSelectorWithinHpRatio _maxHpRatio 0.5; op-makoto.js persona s1heal)' } },
  'char_4226_veen|AttackWithMergeBall,AttackBase': { plain: ['AttackWithMergeBall', 'AttackBase'], others: {} },
  'char_4247_oxi|BuffedAttack,Attack': { plain: ['Attack'], others: { BuffedAttack: 'signal: on oxi_s_2_stack (kit swing hook)' } },
  'char_427_vigil|Attack_A,Attack_B,Attack_C': { plain: ['Attack_A', 'Attack_B', 'Attack_C'], others: {} },
  'char_431_ashlok|BlockedMeleeAttack,RangedAttack,MeleeAttack': { plain: ['RangedAttack'], melee: 'MeleeAttack', others: { BlockedMeleeAttack: 'same: the melee child at a blocked enemy, the same bank' } },
  'enemy_10162_mnctpt|Special,Normal': { plain: ['Normal'], others: { Special: 'same: the same banks as Normal' } },
  'enemy_9021_acduml|AttackEnemy,AbilityName': { plain: ['AttackEnemy'], others: { AbilityName: 'same: the same banks as AttackEnemy' } },
  'enemy_9021_acduml_2|AttackEnemy,AbilityName': { plain: ['AttackEnemy'], others: { AbilityName: 'same: the same banks as AttackEnemy' } },
  // (both children share a name: the first selects an enemy, the second any side — our enemy attacks at a target, the first)
  'enemy_9022_acdumm|AbilityName,AbilityName': { plain: ['AbilityName'], others: {} },
});
