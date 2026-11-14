// test/content/hp-loss-sites-list.js — the Battle.loseHp calls that do not pass `silent`, by file under server/sim/content/:
// [how many, why]. Such a call sends 'dmg', which the view draws as a hit of 真实 damage (test/content/hp-loss-sites.test.js).
// 'unchecked: …' = written before this list (2026-11-14); whether the official node draws a hit has not been read. An entry
// that is checked says what the official client shows instead, or the call becomes `silent: true` and the count goes down.

export const LOUD_HP_LOSS = {
  'bonds/nation/egir.js': [1, 'unchecked: the 阿戈尔 devour takes HP from a member'],
  'bosses.js': [4, 'unchecked: damage a boss part or a drone link passes to its leader, and the web\'s bleed'],
  'enemies/leaders.js': [1, 'unchecked: a leader\'s HP cost by an enemy source'],
  'enemies/special.js': [1, 'unchecked: an enemy\'s loss by max HP ratio'],
  'generic.js': [1, 'unchecked: a skill start\'s HP cost read from the blackboard (hp_ratio)'],
  'kits/ops/chess_char_1_18-utage.js': [1, 'unchecked: the skill start\'s HP cost'],
  'kits/ops/chess_char_2_11-kazema.js': [2, 'unchecked: the skill start\'s HP cost and the skill\'s own loss'],
  'kits/ops/chess_char_4_08-rosesa.js': [1, 'unchecked: a loss each tick on the target'],
  'kits/ops/chess_char_4_09-mizuki.js': [1, 'unchecked: S3\'s loss per attack (mizuki_s_3[damage])'],
  'kits/ops/chess_char_5_03-blaze2.js': [2, 'unchecked: the loss per attack and the skill\'s closing loss'],
  'kits/ops/chess_char_5_06-etlchi.js': [1, 'unchecked: the damage passed on to the other unit'],
  'kits/ops/chess_char_5_13-ghost2.js': [1, 'unchecked: the loss per attack by max HP ratio'],
  'kits/ops/op-hodrer.js': [1, 'unchecked: S3\'s loss per attack'],
  'kits/ops/standin-sharp2.js': [1, 'unchecked: the module\'s loss on an enemy'],
};
