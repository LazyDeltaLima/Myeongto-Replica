// render/fxgolden.js — local patch (docs/LOCAL-PATCH.md 「정예 기물 금빛」, user request 2026-10-08): the official golden glow
// of an elite (精锐 / golden) operator during the prep.
//
// The client's prep pieces are dummies (metadata: CreateDummyOnTile → _CreateGoldEffectIfNeed) and an elite one loops the
// effect AutoChessBattleMiscConfig.effectConfig.goldenEffectId — battle_misc_table miscConfig.AUTOCHESS.act1autochess /
// act2autochess: "trap_acgarm_buff_loop_01" (battle/prefabs/effects/trap.ab; _spawnLocation 1 = feet, a 4 s loop: a gold
// glow and sparks at sortingOrder -1 behind the model, rising flecks at 0). Battle units are real characters, not
// dummies — no glow in battle. Played through render/fxgame.js statusOn / statusOff as the status key 'golden'
// (fxstatus.js leaves that key alone); while it plays, units.js hides the procedural elite aura.
// [추정] on the bench as well as the board (the hand pieces are dummies too: placeToHand).

/** [bundle, prefab] of the elite glow. */
export const GOLDEN_FX = Object.freeze(['trap', 'trap_acgarm_buff_loop_01']);

/** Sync the elite glow on the field's views (Map): on for a live elite ally operator in the prep, off otherwise. */
export function syncGoldenFx(views, fxGame, prep) {
  if (!fxGame || typeof fxGame.statusOn !== 'function') return;
  const [bundle, name] = GOLDEN_FX;
  for (const v of views.values()) {
    if (!v || typeof v.flags !== 'number') continue;
    const want = prep && v.prep && v.golden && !v.isEnemy && !v.isToken && v.alive && !v.remove && !v.destroyed;
    const on = !!v._fxStatusOn?.has('golden');
    if (want && !on) { if (fxGame.statusReady(bundle, name)) fxGame.statusOn(v, bundle, name, 'golden', 0, null, true); }
    else if (!want && on) fxGame.statusOff(v, 'golden');
  }
}
