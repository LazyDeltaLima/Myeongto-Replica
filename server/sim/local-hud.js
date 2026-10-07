// Local patch (docs/LOCAL-PATCH.md 「전투 화면 UI」): extra b.snap lists for the official battle HUD.
//
//   ammo: [[id, left, max]] — an allied unit whose ammo skill runs (skills.js kind 'ammo'): the bullets left out of the
//         activation's real total (ammoMax: base + bullets added — 拉特兰, 逃犯引渡手续, refills), for the official
//         bullet bar (one block per bullet, render/hud-bars.js). The unit tuple's SP keeps its draining share (upstream).
//   bsp:  [[id, sp, max]] — an enemy's official SP (`e.mem.lpSp`, content/bosses.js: 管 / 弦 skillSp, 阿利斯泰尔) for the
//         boss SP bar (render/hud-bars.js; only bosses draw it).
// The sim runs in the browser (public/js/battle/runner.js serves server/sim at /sim/), so this is client-side data.

/** The `ammo` list of a snapshot (null when empty). */
export function ammoList(units) {
  return hudLists(units).ammo || null;
}

/** `{ ammo?, bsp? }` of a snapshot — each only when non-empty — in one pass over the units. */
export function hudLists(units) {
  const out = {};
  for (const u of units) {
    if (!u.alive || !u.deployed || u.hidden) continue;
    if (u.side === 'ally') {
      const sk = u.skill;
      if (!sk || sk.noSkill || sk.kind !== 'ammo' || !sk.active) continue;
      const max = Math.max(1, sk.ammoMax || sk.ammo || 0, sk.ammoLeft);
      (out.ammo || (out.ammo = [])).push([u.id, Math.max(0, sk.ammoLeft | 0), max | 0]);
    } else {
      const v = u.mem && u.mem.lpSp;
      if (v && v[1] > 0) (out.bsp || (out.bsp = [])).push([u.id, Math.round(v[0] * 10) / 10, v[1]]);
    }
  }
  return out;
}

/**
 * The 'dmg' event's 5th field (render/fx.js official damage numbers): 1 = a critical hit — PRTS 作战机制 「伤害红字（暴击）」
 * 「单位在造成的伤害不低于预期伤害的1.5倍时，会在造成伤害后弹出红色的数字…官方称呼为Critical」 (client Modifier.isCritical,
 * BattleConsts.MODIFIER_CRIT_THRESHOLD 1.5): the hit `final` (after 脆弱, damage multipliers and 穿透) ≥ 1.5 × its
 * expected damage `expected` (ATK × multiplier through the target's DEF / RES, no 穿透 — research/battle-mechanics-
 * reference.md), so red numbers mostly come with 脆弱 / 增伤 / 穿透; 2 = a hit PRTS 「强制红字」 / the data force to show:
 * 蕾缪安 S3 归乡邀约 (瞄准射击时 — tags 'snipe' and 'bombard'; client lemuen_s3_attack `_forceDisplayDamageNum`);
 * 0 = none. Sourceless and fixed-value DoT damage never counts. A first version (2026-10-07) compared with the ATK alone.
 */
export const CRIT_THRESHOLD = 1.5;
export function damageNumberFlag(dmg, ss, expected, final) {
  const tags = dmg.tags || [];
  if (tags.includes('bombard') || tags.includes('snipe')) return 2;
  if (!ss || dmg.sourceless || tags.includes('dot') || tags.includes('hpLoss')) return 0;
  return expected > 0 && final >= expected * CRIT_THRESHOLD - 1e-6 ? 1 : 0;
}

/**
 * Blocked numbers (PRTS 作战机制 「强制红字与蓝字」: a hit that would show a red number but is stopped by a 屏障 / 护盾 shows
 * a blue number when that block allows it, else a yellow 「BLOCK」; user decision 2026-10-07 「파란 숫자랑 BLOCK 넣어줘」):
 * the 'blk' event [id, damage, shown] (shown 1 = blue — client battle/[pack]common.ab `block_text` #3a35d9 —, 0 = BLOCK).
 * Allowed = the client's BlockDamage `_showDamageNumber` (17 of 115 block nodes): in our roster the shields of xi
 * (enemy_xi_s2), mdrock (enemy_mdrock_s_2) and mousek (mousek_shield) — their sim keys below.
 */
export const BLOCK_SHOWN = new Set(['ab:xiShield', 'ab:sandDef', 'ab:rockPower']);
export function blockedEvent(battle, target, final, flag, key) {
  if (!(flag > 0) || !(final > 0) || !target) return;
  battle._ev(['blk', target.id, Math.round(final), BLOCK_SHOWN.has(key) ? 1 : 0]);
}
