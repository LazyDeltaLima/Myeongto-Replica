// server/sim/content/kits/ops/chess_char_2_11-kazema.js — 风丸 (char_4016_kazema) kit, tier 2.
// Conventions of the tier-2 kits: ../shared/tier2.js; kit contract and rules: ../README.md.

import { num, talentBb, traitBb, up, cheb, freeTileAround } from '../shared/tier1.js';

export default {
  // ---------------------------------------------------------------------------------------------------------------
  // 2_11 风丸 纸艺·双影: lose hp_ratio of current HP, ATK +atk, summon the <替身> (overrideTokenKey) on a free melee tile
  // around her for the skill's duration [ASSUMED lifetime]. 折纸生花: whenever a <替身> appears (the summon, and the
  // dollkeeper substitution) ground enemies on its tile and the 8 around take damage_scale × its ATK arts at once (official
  // kazema_standin[damage]: an IMMEDIATELY buff whose ON_BUFF_FINISH AOEDamage, range x-4, selects WALK_ONLY targets —
  // never air units; until 2026-11-03 air units too).
  // Trait substitution: she fights with the <替身>'s stats (the engine already swaps in its HP; the kit swaps ATK/DEF
  // with flat deltas so %-buffs still apply). Elite module (PUM-X, trait atk): while substituted, ATK +atk.
  // S1 纸艺·迅击 (alt, attack SP): the next attack hits at atk_scale × ATK and she loses hp_ratio of her MAX HP (PRTS:
  // ten casts knock her out — the loss can be fatal and so sets off the <替身> substitution).
  chess_char_2_11_a: (bb, chess) => {
    const t = talentBb(chess, 0);
    const tb = traitBb(chess);
    const tokId = chess?.skill?.overrideTokenKey ?? (chess?.tokens ?? []).find((x) => /shadow|doll/.test(String(x))) ?? 'token_10022_kazema_shadow';
    const ds = num(t.damage_scale);
    const origami = (battle, src, atk) => {
      battle.fx('aoe', { x: src.x, y: src.y, radius: 1.5, id: src.id, skill: 'origami' });
      if (!(ds > 0)) return;
      for (const e of battle.enemies) {
        if (!e.alive || e.hidden || e.isFlying || e.s.flags.untargetable || cheb(src, e) > 1) continue;
        battle.dealDamage(src, e, { amount: atk * ds, type: 'arts', isSkill: true, canDodge: false, tags: ['talent'] });
      }
    };
    return {
      // PRTS 特性备注 「<替身>状态下可对空，由技能产生的召唤物不可对空」: the trait's <替身> state targets flyers (targeting.js
      // canTargetEnemy reads `dollHitsFly` with Unit.trait.doll); S2's summoned <替身> (a token with its own profile) does not
      trait: { dollHitsFly: true },
      skill: {
        kind: 'duration', mods: { atkPct: num(bb.atk) },
        onStart({ battle, unit }) {
          const loss = unit.hp * num(bb.hp_ratio);
          // (silent: kazema_s_2's DamageViaCurHpRatio creates no effect — docs/rules/fx.md 「효과 없는 주기적 유실」)
          if (loss > 0 && unit.hp - loss >= 1) battle.loseHp(unit, loss, { silent: true, source: unit });
          const tile = freeTileAround(battle, unit, (r, c) => battle.grid.canStand(r, c));
          if (!tile) return;
          const doll = battle.spawnToken(unit, tokId, tile[0], tile[1], {});
          if (!doll) return;
          unit.mem.doll = doll;
          battle.fx('summon', { x: doll.x, y: doll.y, id: doll.id, token: tokId });
          origami(battle, doll, doll.s.atk);
        },
        onEnd({ battle, unit }) {
          const d = unit.mem.doll;
          if (d && d.alive) battle.retreat(d, { reason: 'expired', permanent: true });
          unit.mem.doll = null;
        },
      },
      skills: {
        skchr_kazema_1: {
          kind: 'instant', attack: { atkScale: num(bb.atk_scale, 1) },
          onAttack({ battle, unit }) {
            const loss = unit.s.maxHp * num(bb.hp_ratio);
            // (silent: kazema_s_1's DamageViaMaxHpRatio creates no effect)
            if (loss > 0 && unit.alive) battle.loseHp(unit, loss, { silent: true, source: unit, tags: ['skill'] });
          },
        },
      },
      talents: [{ install(battle, unit) {
        const bonus = num(tb.atk);
        battle.on('tick', () => {
          const sub = up(unit) && !!unit.findBuff('trait:substitute');
          if (sub && !unit.mem.kzSub) {
            unit.mem.kzSub = true;
            const ts = battle.tokenDef(tokId, unit)?.stats ?? null; // the owner's module variant (DESIGN §16)
            const mods = {};
            if (num(ts?.atk) > 0) mods.atkFlat = num(ts.atk) - unit.base.atk;
            if (ts && Number.isFinite(ts.def)) mods.defFlat = ts.def - unit.base.def;
            if (bonus > 0) mods.atkPct = bonus;
            battle.addBuff(unit, { key: 'kazema:doll', mods, tags: ['trait'] });
            origami(battle, unit, unit.s.atk);
          } else if (!sub && unit.mem.kzSub) {
            unit.mem.kzSub = false;
            battle.removeBuff(unit, 'kazema:doll');
          }
        }, { owner: unit });
      } }],
    };
  },
};
