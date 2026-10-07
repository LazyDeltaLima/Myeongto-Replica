// Local patch (docs/LOCAL-PATCH.md 「전투 화면 UI」): extra b.snap lists for the official battle HUD.
//
//   ammo: [[id, left, max]] — an allied unit whose ammo skill runs (skills.js kind 'ammo'): the bullets left out of the
//         activation's real total (ammoMax: base + bullets added — 拉特兰, 逃犯引渡手续, refills), for the official
//         bullet bar (one block per bullet, render/hud-bars.js). The unit tuple's SP keeps its draining share (upstream).
// The sim runs in the browser (public/js/battle/runner.js serves server/sim at /sim/), so this is client-side data.

/** The `ammo` list of a snapshot (null when empty). */
export function ammoList(units) {
  let out = null;
  for (const u of units) {
    if (!u.alive || !u.deployed || u.hidden || u.side !== 'ally') continue;
    const sk = u.skill;
    if (!sk || sk.noSkill || sk.kind !== 'ammo' || !sk.active) continue;
    const max = Math.max(1, sk.ammoMax || sk.ammo || 0, sk.ammoLeft);
    (out || (out = [])).push([u.id, Math.max(0, sk.ammoLeft | 0), max | 0]);
  }
  return out;
}
