// Local patch (docs/LOCAL-PATCH.md 「전투 화면 UI」): extra b.snap lists for the official battle HUD.
//
//   ammo: [[id, left, max]] — an allied unit whose HUD shows the official bullet bar (`char_bullet_bar`, one block per
//         bullet, render/hud-bars.js) — the client's rule (code `Character.get_hudPluginMask`): the skill's
//         `_showSpAsBulletMode` (data `bulletMode`, tools/local-extract/skill_hud.py) while the skill is affecting — a
//         passive one always, any other while it runs (else the SP / SP cast slider) —, and the bar shows (UIHudCharBulletBar
//         .UpdatePlugin):
//           * an ammo skill (skills.js kind 'ammo'; client CastSkillWithLimitTimes): the bullets left out of the
//             activation's real total (ammoMax: base + bullets added — 拉特兰, 逃犯引渡手续, refills). The unit tuple's SP
//             keeps its draining share (upstream), which is what the cast slider of an ammo skill without the flag shows
//             (新约能天使 S2 / S3, 予愿安洁莉娜 S3). A skill whose flag was not read (null) shows its bullets as before;
//           * any other skill: its SP out of its max SP (UIBulletBar.ShowBulletCount(maxSp, sp)) — 琳琅诗怀雅's coins
//             are her SP: her kit keeps them in `mem.coins` (0 before the first one), out of the selected skill's
//             blackboard `sp` (「携带此技能时金币上限为N」; skill table spCost 0) — spBullets().
//   shield: [[id, amount]] — an allied unit's barrier HP (屏障 / 护盾: the buffs' `shield` left, damage.js absorbs them), for
//         the official HP bar's barrier part (client UIHudCharHpSlider + shieldUIController.shieldToShow; render/hud-bars.js
//         shieldedBar). Allies only, as the client (its enemy HP sliders show none). A hit-count barrier (`shieldHits`) has
//         no amount and is not listed.
//   charge: [[id, n]] — an allied unit with `n` ≥ 1 stored charges of an AUTO skill that can be charged more than once
//         (可充能N次: 瑕光 / 塞雷娅 S1 …), for the official mark over it (client UIHudCharSkillMarkPanel.UpdatePlugin: an
//         AUTO skill whose maxChargeTime > 1 and whose prefab leaves `_hideHudSkillStackCount` off — none of the pool sets
//         it — shows `auto_skill_ready` with `text_skill_cnt` = BasicSkill.availableCnt while it is above 0; render/hud-bars.js
//         SkillMark). MANUAL skills show nothing: their mark needs UNIT_HUD_SKILL_CAST_MASK, which 卫戍协议 turns off
//         (AutoChessUIPlugin.OnGameInit DisableFunction 0xF07B). chargeMark().
//   bsp:  [[id, sp, max]] — an enemy's official SP (`e.mem.lpSp`, content/bosses.js: 管 / 弦 skillSp, 阿利斯泰尔) for the
//         boss SP bar (render/hud-bars.js; only bosses draw it).
// The sim runs in the browser (public/js/battle/runner.js serves server/sim at /sim/), so this is client-side data.

/** The `ammo` list of a snapshot (null when empty). */
export function ammoList(units) {
  return hudLists(units).ammo || null;
}

/** `{ ammo?, shield?, charge?, bsp? }` of a snapshot — each only when non-empty — in one pass over the units. */
export function hudLists(units) {
  const out = {};
  for (const u of units) {
    if (!u.alive || !u.deployed || u.hidden) continue;
    if (u.side === 'ally') {
      let sh = 0;
      for (const b of u.buffs || []) if (b && b.shield > 0) sh += b.shield;
      if (sh >= 0.5) (out.shield || (out.shield = [])).push([u.id, Math.round(sh)]);
      const bar = bulletView(u.skill, u);
      if (bar) (out.ammo || (out.ammo = [])).push([u.id, bar[0], bar[1]]);
      const n = chargeMark(u.skill);
      if (n) (out.charge || (out.charge = [])).push([u.id, n]);
    } else {
      const v = u.mem && u.mem.lpSp;
      if (v && v[1] > 0) (out.bsp || (out.bsp = [])).push([u.id, Math.round(v[0] * 10) / 10, v[1]]);
    }
  }
  return out;
}

/**
 * The stored charges the official mark shows over a unit whose skill is `sk` (see the header `charge`), or 0: an AUTO
 * skill of more than one charge, its charges ready now (BasicSkill.availableCnt — the SP over its cost, whole).
 */
export function chargeMark(sk) {
  if (!sk || sk.noSkill || sk.kind === 'passive' || !(sk.maxCharges > 1)) return 0;
  if (String(sk.def?.skillType ?? '').toUpperCase() !== 'AUTO') return 0;
  return Math.max(0, Math.min(sk.maxCharges, sk.charges | 0));
}

/**
 * `[left, max]` of the bullet bar a unit's skill `sk` shows now (see the header), or null: an ammo skill while it runs
 * (unless the client gives it the cast slider: `bulletMode` 0), a skill with `bulletMode` 1 while it is affecting.
 */
export function bulletView(sk, u) {
  if (!sk || sk.noSkill) return null;
  const mode = sk.def?.bulletMode ?? null;
  if (sk.kind === 'ammo') {
    if (!sk.active || mode === 0) return null;
    const max = Math.max(1, sk.ammoMax || sk.ammo || 0, sk.ammoLeft);
    return [Math.max(0, sk.ammoLeft | 0), max | 0];
  }
  if (mode !== 1 || !(sk.kind === 'passive' || sk.active)) return null;
  return spBullets(sk, u);
}

/**
 * The SP of a non-ammo bullet-mode skill as `[sp, maxSp]` (whole numbers, sp ≤ maxSp), or null when it has no max: 琳琅诗怀雅's
 * purse (her kit's `mem.coins`, out of the skill's blackboard `sp`), else the skill's own SP out of its cost.
 */
function spBullets(sk, u) {
  const purse = typeof sk.id === 'string' && sk.id.startsWith('skchr_swire2_');
  const max = Math.floor(Number(purse ? sk.bb?.sp : sk.spCost));
  if (!(max >= 1)) return null;
  const v = Math.floor(Number(purse ? (u?.mem?.coins ?? 0) : sk.sp));
  return [Math.min(max, Math.max(0, Number.isFinite(v) ? v : 0)), max];
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
 * a blue number when that block allows it, else a yellow 「BLOCK」; maintainer decision 2026-10-07 「파란 숫자랑 BLOCK 넣어줘」):
 * the 'blk' event [id, damage, shown] (shown 1 = blue — client battle/[pack]common.ab `block_text` #3a35d9 —, 0 = BLOCK).
 * Allowed = the client's BlockDamage `_showDamageNumber` (17 of 115 block nodes): in our roster the shields of xi
 * (enemy_xi_s2), mdrock (enemy_mdrock_s_2) and mousek (mousek_shield) — their sim keys below.
 */
export const BLOCK_SHOWN = new Set(['ab:xiShield', 'ab:sandDef', 'ab:rockPower']);
export function blockedEvent(battle, target, final, flag, key) {
  if (!(flag > 0) || !(final > 0) || !target) return;
  battle._ev(['blk', target.id, Math.round(final), BLOCK_SHOWN.has(key) ? 1 : 0]);
}
