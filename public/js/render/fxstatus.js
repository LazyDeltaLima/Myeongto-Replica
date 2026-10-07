// render/fxstatus.js — local patch (docs/LOCAL-PATCH.md 「전투 화면 UI」 ⑤): the official status effects on battle units.
//
// The client shows a status by an effect prefab, not an icon row (user captures 9 / 10: a snowflake over 寒冷 enemies,
// the ice block of 冻结, a fist over 战栗; 隐匿 / 迷彩 have no icon). The prefabs live in battle/prefabs/effects/buff.ab and
// common.ab (extracted by tools/local-extract/fx_extract.py --bundle buff / common); each is a loop ( _isLoop 1) placed at
// its `_spawnLocation` (EN client data: 1 feet, 2 body / HIT point, 4 head, 5 ground centre). The sim status → prefab
// mapping is by the prefab names (the client builds them from the status — metadata COMMON_EFFECT_PREFIX; the mapping
// code is native) [추정 where marked]:
//   stun 晕眩 → buff_stun (head)              freeze 冻结 → buff_autochess_frozen (feet: the block around the model)
//   cold 寒冷 → buff_cold (head)              sleep 沉睡 → buff_sleep (body)
//   silence 沉默 → buff_silence (head)        fear 恐惧 → common_buff_fear (head)
//   tremble 战栗 → common_buff_thrill (head, the fist — user capture 10)   disarm 缴械 → common_disarm_icon (head)
//   slow 减速 → buff_slowdown (feet)          sluggish 迟缓 → buff_sluggish (feet)
//   aspdDown → buff_attack_speed_reduction_01 (feet)   weaken 虚弱 → buff_weak (head)
//   defDown → buff_defdown (head)             resDown → buff_magic_resistance_down (head)
//   fragile 脆弱 (all kinds) → 'buff_ fragile_01' (feet)   levitate 浮空 → common_levitate_01 (ground)
//   stealth 隐匿 → enemies common_invisible (feet; its ColorModifier greys the model to α .894 — units.js), allies
//     common_stealth [추정]       camou 迷彩 → common_buff_micai_01 (body) [추정: _01 of the three]
//   lemuen:wanted 通缉 (蕾缪安's talent) → lemuen/lemuen_talent_buff_01 (head) [추정 height]
//   reed2:scorch 灼痕 (焰影苇草's talent) → reed2/reed2_debuff_01 (body) [추정 height]
// A status the client draws (in this table, its prefab extracted, the effect layer on — not quality 'low', WebP) loses its
// icon (units.js reads `view._fxStatusOn`); the rest keep the drawn icons (bind, taunt, invulnerable, shield, palsy, the
// element bursts, 禁疗, 折射, 替身 …: no client prefab matched by name). Synced once per frame from the views' flags and
// 'status' keys (render/app.js).

import { UF } from '../../../shared/constants.js';
import { UF_CAMOU } from '../../../shared/local.js';

/** The client's HEAD_POINT sits a little over the drawn head (the 战栗 fist of capture 10 floats above it) [추정 share]. */
const HEAD = 1.1;
/** status → [bundle, prefab, height share (0 feet, .5 body, HEAD head)]; `stealth` takes the side's prefab. */
export const STATUS_FX = Object.freeze({
  stun: ['buff', 'buff_stun', HEAD], freeze: ['buff', 'buff_autochess_frozen', 0], cold: ['buff', 'buff_cold', HEAD],
  sleep: ['buff', 'buff_sleep', 0.5], silence: ['buff', 'buff_silence', HEAD], fear: ['common', 'common_buff_fear', HEAD],
  tremble: ['common', 'common_buff_thrill', HEAD], disarm: ['common', 'common_disarm_icon', HEAD],
  slow: ['buff', 'buff_slowdown', 0], sluggish: ['buff', 'buff_sluggish', 0], aspdDown: ['buff', 'buff_attack_speed_reduction_01', 0],
  weaken: ['buff', 'buff_weak', HEAD], defDown: ['buff', 'buff_defdown', HEAD], resDown: ['buff', 'buff_magic_resistance_down', HEAD],
  fragile: ['buff', 'buff_ fragile_01', 0], levitate: ['common', 'common_levitate_01', 0],
  stealth: ['common', 'common_invisible', 0], stealthAlly: ['common', 'common_stealth', 0], camou: ['common', 'common_buff_micai_01', 0.5],
  // local patch (user report 2026-10-07): 蕾缪安's talent 跨境追缉许可 'lemuen:wanted' — the client's char_lemuen_range_aim[effect]
  // buff (overrideEffectKey lemuen_talent_buff_01, the crosshair on the wanted enemy) [추정: at the head]
  wanted: ['lemuen', 'lemuen_talent_buff_01', HEAD],
  // local patch (user report 2026-10-07, video: orange X strokes on her marked enemies): 焰影苇草's 灼痕 'reed2:scorch' —
  // buff reed2_t_1 effectKey reed2_debuff_01 [추정: on the body]
  scorch: ['reed2', 'reed2_debuff_01', 0.5],
});
const ALIAS = Object.freeze({ artsFragile: 'fragile', physFragile: 'fragile', elemFragile: 'fragile' });

/** The STATUS_FX key of a sim 'status' key ('tremble', 'skill:haini_slow', 'talent:weak_fragile' …), or null. */
export function statusFxKey(key) {
  if (typeof key !== 'string' || !key) return null;
  if (STATUS_FX[key] && key !== 'stealthAlly') return key;
  if (ALIAS[key]) return ALIAS[key];
  const tail = key.includes(':') ? key.slice(key.lastIndexOf(':') + 1) : key;
  if (STATUS_FX[tail] && tail !== 'stealthAlly') return tail;
  if (ALIAS[tail]) return ALIAS[tail];
  // keyword fallbacks as render/style.js STATUS_GUESS (the content buffs' own keys)
  if (/trembl/i.test(tail)) return 'tremble';
  if (/fear/i.test(tail)) return 'fear';
  if (/fragil|vulner/i.test(tail)) return 'fragile';
  if (/aspd/i.test(tail)) return /gain|up/i.test(tail) ? null : 'aspdDown';
  if (/slugg/i.test(tail)) return 'sluggish';
  if (/slow/i.test(tail)) return 'slow';
  if (/silen/i.test(tail)) return 'silence';
  if (/weak/i.test(tail)) return 'weaken';
  if (/stun|daze/i.test(tail)) return 'stun';
  if (/sleep|slumber/i.test(tail)) return 'sleep';
  if (/levit/i.test(tail)) return 'levitate';
  if (/disarm/i.test(tail)) return 'disarm';
  return null;
}

const WANT = new Set();

/** The statuses `v` should show now (STATUS_FX keys; `stealth` already resolved to the side's prefab key). */
export function wantedStatusFx(v, out = WANT) {
  out.clear();
  const f = v.flags | 0;
  if (f & UF.STUNNED) out.add('stun');
  if (f & UF.FROZEN) out.add('freeze');
  if (f & UF.COLD) out.add('cold');
  if (f & UF.SLEEP) out.add('sleep');
  if (f & UF.STEALTH) out.add(f & UF_CAMOU ? 'camou' : v.isEnemy ? 'stealth' : 'stealthAlly');
  if (v.statuses) {
    for (const k of v.statuses) {
      const s = statusFxKey(k);
      if (s === 'stealth' || s === 'camou') continue; // by the flags above (side, 迷彩)
      if (s) out.add(s);
    }
  }
  return out;
}

/**
 * Sync every live unit's status effects with `fxGame` (render/fxgame.js statusOn / statusOff). `views`: the field's
 * views (Map). Units not in battle (prep), dead or culled show none.
 */
export function syncStatusFx(views, fxGame, battle) {
  if (!fxGame || typeof fxGame.statusOn !== 'function') return;
  for (const v of views.values()) {
    if (!v || typeof v.flags !== 'number') continue;
    const on = v._fxStatusOn;
    const live = battle && v.alive && !v.prep && !v.remove;
    const want = live ? wantedStatusFx(v) : (WANT.clear(), WANT);
    for (const k of want) {
      if (on && on.has(k)) continue;
      const [bundle, name, frac] = STATUS_FX[k];
      if (fxGame.statusReady(bundle, name)) fxGame.statusOn(v, bundle, name, k, frac);
    }
    if (on) for (const k of [...on]) if (!want.has(k)) fxGame.statusOff(v, k);
  }
}

/** Whether `view` shows the icon key `icon` (render/style.js STATUS_ICON value) as an official effect (units.js hides it). */
export function iconShownAsFx(view, rawKey) {
  const on = view._fxStatusOn;
  if (!on || !on.size) return false;
  const k = statusFxKey(rawKey);
  return !!k && on.has(k);
}
