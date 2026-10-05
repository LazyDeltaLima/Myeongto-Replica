// Leak alarm (local patch, docs/LOCAL-PATCH.md): the official client plays battle.ON_ENEMY_REACHED_EXIT
// (b_ui_alarmenter, Battle_UI_Important, one at a time) when an enemy reaches a protection point; upstream had no
// sound for it. The 卫戍协议 bank set has no own variant (act1vhalfidle's ON_..._LOSE_LIFE_POINT uses the same file).
// The client plays `sfx.battle.leak` on the battle's 'leak' event (public/js/audio.js handleBattleEvents).

const BANK = 'battle.ON_ENEMY_REACHED_EXIT';
const FALLBACK = 'battle/b_ui/b_ui_alarmenter.mp3';

/**
 * @param {{ bank: (name: string) => string[] }} audio indexed audio_data (tools/assets/audio.mjs indexAudio)
 * @param {(paths: string[]) => any} soundLeaf plan.mjs leaf builder
 */
export function leakSfx(audio, soundLeaf) {
  const paths = audio.bank(BANK);
  return soundLeaf(paths && paths.length ? paths : [FALLBACK]);
}
