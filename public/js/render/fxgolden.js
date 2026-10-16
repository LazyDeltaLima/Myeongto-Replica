// render/fxgolden.js — local patch (docs/LOCAL-PATCH.md 「정예 기물 금빛」, maintainer request 2026-10-08): the official golden glow
// of an elite (精锐 / golden) operator during the prep.
//
// The client's prep pieces are dummies (metadata: CreateDummyOnTile → _CreateGoldEffectIfNeed) and an elite one loops the
// effect AutoChessBattleMiscConfig.effectConfig.goldenEffectId — battle_misc_table miscConfig.AUTOCHESS.act1autochess /
// act2autochess: "trap_acgarm_buff_loop_01" (battle/prefabs/effects/trap.ab; _spawnLocation 1 = feet, a 4 s loop: a gold
// glow and sparks at sortingOrder -1 behind the model, rising flecks at 0). Battle units are real characters, not
// dummies — no glow in battle. Played through render/fxgame.js statusOn / statusOff as the status key 'golden'
// (fxstatus.js leaves that key alone). While it cannot play (quality 'low' turns the official effects off, or the
// prefab is not installed) the view's `goldenFallback` is set and units.js draws the gold ground ring instead
// (render/elite-mark.js; maintainer decision 2026-10-17 — the procedural aura it replaces also showed in battle).
// [추정] on the bench as well as the board (the hand pieces are dummies too: placeToHand).

/** [bundle, prefab] of the elite glow. */
export const GOLDEN_FX = Object.freeze(['trap', 'trap_acgarm_buff_loop_01']);

/**
 * Sync the elite glow on the field's views (Map): on for a live elite ally operator in the prep, off otherwise; such a
 * piece whose glow cannot play gets `goldenFallback` (the ground ring).
 */
export function syncGoldenFx(views, fxGame, prep) {
  const fx = fxGame && typeof fxGame.statusOn === 'function' ? fxGame : null;
  const [bundle, name] = GOLDEN_FX;
  const ready = !!fx && fx.statusReady(bundle, name);
  for (const v of views.values()) {
    if (!v || typeof v.flags !== 'number') continue;
    const want = prep && v.prep && v.golden && !v.isEnemy && !v.isToken && v.alive && !v.remove && !v.destroyed;
    v.goldenFallback = want && !ready;
    if (!fx) continue;
    const on = !!v._fxStatusOn?.has('golden');
    if (want && !on) { if (ready) fx.statusOn(v, bundle, name, 'golden', 0, null, true); }
    else if (!want && on) fx.statusOff(v, 'golden');
  }
}
