// test/audio-enemy-silence-list.js — enemies whose strikes land silent in test/audio-enemy-sweep.test.js though their banks name
// an impact, each with why. An entry that no longer applies fails the test. (The sweep counts sounds on the 'dmg' event: a strike's ON or a
// projectile's REACH sounds on its own event.)

const ON_STRIKE = 'its strike sounds at the attack (an ON bank); the impact cue belongs to a mode or group child this attack is not';
const AT_BURST = 'its shot is the kit\'s (bosses.js pipeCore): the projectile\'s REACH sounds at the burst (fx explode), the damage after it plays nothing';

export const ENEMY_SILENT = Object.freeze({
  enemy_1172_dugago: ON_STRIKE,
  enemy_1172_dugago_2: ON_STRIKE,
  // its damage here is the aura's (enemy_dsubrl_aoe[hit], fx pulse sounds it): it makes no attack, so no combat HIT
  enemy_1234_dsubrl: 'its damage is the aura pulse, sounded by fx pulse; it makes no attack here',
  enemy_1234_dsubrl_2: 'its damage is the aura pulse, sounded by fx pulse; it makes no attack here',
  enemy_9015_acstmb: ON_STRIKE,
  enemy_9021_acduml: AT_BURST,
  enemy_9021_acduml_2: AT_BURST,
  enemy_9022_acdumm: AT_BURST,
});
