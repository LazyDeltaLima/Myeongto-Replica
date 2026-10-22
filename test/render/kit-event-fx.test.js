// test/render/kit-event-fx.test.js — what an operator with official effects draws for each kit 'fx' event whose procedural
// stand-in fxgame.js standInOff drops (2026-10-16, docs/rules/fx.md 「키트 이벤트의 공식 이펙트」). Every such event of every
// kit has a verdict here or a rule in render/fx/kitofficial.js, so a new kit event cannot silently draw nothing; the rules'
// plans follow the client's buff templates (config/buff_template_holder.ab).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fxSpec } from '../../public/js/render/fx/kinds.js';
import { KIT_OFFICIAL, kitOfficialPlan, kitOperator } from '../../public/js/render/fx/kitofficial.js';
import { createFxLayer, buffProgressOn } from '../../public/js/render/fxgame.js';
import { activationEffects } from '../../public/js/render/fxmap.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GAME = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));
const KITS = path.join(ROOT, 'server/sim/content/kits');
// the extracted effects (git-ignored, `npm run setup`): the skill activation's name rules need the bundle's prefab list
const FX_INDEX = path.join(ROOT, 'public/assets/local/fx/index.json');
const BUNDLES = existsSync(FX_INDEX) ? JSON.parse(readFileSync(FX_INDEX, 'utf8')).bundles : null;
const STAND_IN = new Set(/const STAND_IN = new Set\(\[([^\]]+)\]/.exec(GAME)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1)));

/**
 * Verdict per kit event and the bundle of the kit that sends it ('*': a shared kit):
 *   ['skill', n]  sent as skill n starts / acts: that skill's own bindings (modes.json skills[n − 1]) or the activation's
 *                 name rules (fxmap.js activationEffects) draw the moment
 *   ['attack']    an attack's hit: the attack bindings draw it
 *   ['none', …]   the client creates no effect there
 *   ['covered', …] another event of the same moment draws it
 *   ['standIn', …] the event's unit is no operator with official effects (a token, an enemy): its stand-in stays
 *   ['pending', …] not judged yet (the maintainer's open list)
 */
const VERDICT = {
  appear: { angel2: ['covered', "the redeployed operator's own 'deploy' effect [추정]"] },
  bloodBattle: { bldsk: ['skill', 2] },
  burst: { oblvns: ['covered', "the note's 'oblvnsNote' hit (noteFx: projectile_chr_oblvns_s1_N `_effectsWhenHit`)"], wisdel: ['standIn', 'sent by her 残影 token'] },
  cleanse: { '*': ['covered', "流明's cleansing heal: its S2 hit / S3 attack hit (lumen_s_2 / lumen_s_3[ammo] create no effect of their own)"] },
  dilemma: { mizuki: ['skill', 2] },
  ember: { surtr: ['covered', "the 'healFree' status of her 余烬 buff (fxstatus.js SOURCE_FX: surtr_t_2 surtr_buff_01_start)"] },
  explosion: { lionhd: ['skill', 2] },
  extraAttack: { excu2: ['attack', "the T1 shot's 'atk' (signal T.1): charpack Modes/*/Body/Talents/1's cast / hit are in the mode's bindings"] },
  flame: { flamtl: ['skill', 3] },
  frostNova: { gnosis: ['skill', 2], sbell2: ['skill', 1, 'its cast; the snow tiles it lays are the open snow-tile item (snow)'] },
  healField: { plosis: ['skill', 2] },
  iceSpike: { gnosis: ['skill', 3] },
  jungleSoul: { gvial2: ['skill', 3] },
  knack: { reckpr: ['skill', 2] },
  meltdown: { blaze2: ['standIn', "sent on the enemy (the burn burst's own effect; blaze2_t_1 creates none)"] },
  obelisk: { beewax: ['standIn', 'sent by her token'] },
  overclock: { cathy: ['skill', 2], hsguma: ['skill', 3] },
  overload: { rmixer: ['skill', 2], gvial2: ['skill', 2] },
  pulse: { mlyss: ['standIn', 'sent by the 流形 token (summons)'] },
  reweave: { cetsyr: ['skill', 3, "the name rules' S3 buffs (charpack S3 AuraHeal / skchr_cetsyr_3 Encourage passives); S2: cetsyr_skill_02_trail_start"] },
  ripple: { mostma: ['skill', 3], mizuki: ['skill', 3] },
  rockslide: { mudrok: ['skill', 2] },
  saltWard: { rosesa: ['skill', 2] },
  sermon: { rmixer: ['skill', 3] },
  shockBlast: { nymph: ['skill', 2] },
  sleepGuard: { titi: ['skill', 2, 'S2 start; an S3 doze (titi_s_3[doze] → doze[inf]) creates no effect of hers: the sleep status draws it'] },
  snow: { svrash: ['skill', 2] },
  sonic: { akkord: ['skill', 2] },
  splash: { blaze2: ['attack'] },
  split: { mlyss: ['standIn', 'sent by the 流形 token (summons)'] },
  sword: { qiubai: ['skill', 2] },
  truesilver: { svrash: ['skill', 3] },
  undying: { nearl2: ['none', 'module 骑士家族 nearl2_e_003_tr creates no effect (nearl2_buff_01_start is S3 combo_effect)'] },
  wake: { glady: ['skill', 2] },
};

/** The kit events per sending kit: [event, bundle] (bundle = the kit's codename; '*' for shared/). */
function kitEvents() {
  const out = new Map();
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!f.endsWith('.js')) continue;
      const rel = path.relative(KITS, p);
      const bundle = rel.startsWith('ops') ? f.replace(/\.js$/, '').replace(/^.*-|^op-/, '') : '*';
      for (const m of readFileSync(p, 'utf8').matchAll(/\.fx\(\s*'([A-Za-z0-9_]+)'/g)) out.set(`${m[1]}|${bundle}`, [m[1], bundle]);
    }
  };
  walk(KITS);
  return [...out.values()];
}
// (2026-10-21) the element bursts' branch (the sim's fx 'burst' with an `element`, damage.js — fxgame.js burstFx) is not a kit
// event's: 丰川祥子's / 维什戴尔's 'burst' carries none and goes on to the stand-in rules
const GAME_KIT = GAME.replace(/if \(e\[1\] === 'burst' && e\[4\]\?\.element\)[^\n]*/, '');
const silenced = () => kitEvents().filter(([n]) => STAND_IN.has(fxSpec(n, {}).a) && !new RegExp(`'${n}'`).test(GAME_KIT));
const charOf = (bundle) => Object.keys(MODES).find((k) => k.endsWith(`_${bundle}`));

test('every kit event whose stand-in an operator with official effects drops has a rule or a verdict', () => {
  const missing = [];
  for (const [n, b] of silenced()) if (!KIT_OFFICIAL[n]?.[b] && !VERDICT[n]?.[b]) missing.push(`${n} (${b})`);
  assert.deepEqual(missing, [], 'judge these in render/fx/kitofficial.js or in VERDICT');
  // no stale verdicts, and a pair is either drawn by a rule or judged, never both
  const sent = new Set(silenced().map(([n, b]) => `${n}|${b}`));
  for (const [n, by] of Object.entries(VERDICT)) {
    for (const b of Object.keys(by)) {
      assert.ok(sent.has(`${n}|${b}`), `${n} (${b}) is no longer sent (or no longer silenced)`);
      assert.ok(!KIT_OFFICIAL[n]?.[b], `${n} (${b}) has a rule and a verdict`);
    }
  }
});

test("a 'skill' verdict names a skill whose activation draws something", () => {
  for (const [n, by] of Object.entries(VERDICT)) {
    for (const [b, v] of Object.entries(by)) {
      if (v[0] !== 'skill') continue;
      const s = MODES[charOf(b)]?.skills?.[v[1] - 1];
      assert.ok(s, `${n} (${b}): no S${v[1]}`);
      if (['cast', 'castLoop', 'buff', 'target', 'targetBuff'].some((r) => s[r]?.length)) continue;
      // no binding of its own: the name rules of the activation (only checkable with the effects extracted)
      if (!BUNDLES?.[b]) continue;
      const a = activationEffects(MODES[charOf(b)], BUNDLES[b], v[1] - 1, new Set());
      assert.ok(a.start.length || a.loops.length, `${n} (${b}): S${v[1]} draws nothing`);
    }
  }
});

test('the rules name prefabs the client binds for that operator', () => {
  // each rule's prefab belongs to its operator's bundle (a typo plays nothing); the names come from the buff templates
  for (const [n, by] of Object.entries(KIT_OFFICIAL)) {
    for (const [b, rule] of Object.entries(by)) {
      assert.equal(typeof rule, 'function');
      const plans = [{ skill: 0 }, { skill: 1 }, { skill: 2, back: true }].map((ctx) => kitOfficialPlan(n, { left: 0, t: 2, id: 1, of: 2, n: 2, cap: 3, name: 'extradition', cells: [[1, 1, 1], [2, 1, 3], [3, 1, 5], [4, 1, 0]], skill: 'swire2_3', targets: [2], token: 'token_10058_sbell2_icetgt', ids: [2], off: [3], picks: [2] }, b, ctx)).filter(Boolean);
      assert.ok(plans.length, `${n} (${b}) plans nothing`);
      for (const plan of plans) {
        for (const p of plan.play) {
          if (!p.off) assert.ok(p.bundle ? p.n.includes(`_${b}_`) : p.n.startsWith(`${b}_`), `${n} (${b}): ${p.n}`);
          if (p.ready) assert.ok(p.ready.startsWith(`${b}_`), `${n} (${b}): ${p.ready}`);
          for (const x of [p.rope, p.pass?.n, p.harpoon?.moving, p.end, ...(p.hit || [])].filter(Boolean)) assert.ok(x.startsWith(`${b}_`), `${n} (${b}): ${x}`);
        }
      }
    }
  }
});

test('kitOfficialPlan: the moments and lifetimes of the templates', () => {
  const names = (p) => p.play.map((x) => x.n);
  // 号角 血战: two 4 s convert effects, the rest for the deployment
  const bb = kitOfficialPlan('bloodBattle', { id: 1 }, 'horn');
  assert.deepEqual(bb.play.map((x) => [x.n, x.life]), [
    ['horn_buff_01_convert_start', 4], ['horn_buff_01_convert_start_02', 4],
    ['horn_buff_01_convert_start_03', 'deployed'], ['horn_buff_01_start_front', 'deployed'],
  ]);
  // 号角 过载: S2 / S3, _back facing UP, until the skill ends; S1 has none
  assert.deepEqual(names(kitOfficialPlan('overload', { id: 1 }, 'horn', { skill: 1 })), ['horn_skill_02_buff_03_front']);
  assert.deepEqual(names(kitOfficialPlan('overload', { id: 1 }, 'horn', { skill: 2, back: true })), ['horn_skill_03_buff_02_03_back']);
  assert.equal(kitOfficialPlan('overload', { id: 1 }, 'horn', { skill: 1 }).play[0].life, 'skill');
  assert.equal(kitOfficialPlan('overload', { id: 1 }, 'horn', { skill: 0 }), null);
  // another operator's overload has no rule (its skill draws it)
  assert.equal(kitOfficialPlan('overload', { id: 1 }, 'rmixer', { skill: 1 }), null);
  // 泥岩: only the last layer's break; a gained layer's begin cast (its loop: fxstatus.js LAYER_FX)
  assert.deepEqual(names(kitOfficialPlan('shieldBreak', { id: 1, left: 0 }, 'mudrok')), ['mudrok_buff_01_end']);
  assert.deepEqual(names(kitOfficialPlan('shieldBreak', { id: 1, left: 2 }, 'mudrok')), []);
  assert.deepEqual(kitOfficialPlan('stacks', { id: 1, buff: 'mudrok:layers', n: 2 }, 'mudrok').play, [{ n: 'mudrok_buff_01_begin', on: 'op', life: 'once' }]);
  assert.equal(kitOfficialPlan('stacks', { id: 5, src: 1, buff: 'billro:mark', n: 5 }, 'billro'), null, "the mark's stacks are fxstatus.js STACK_FX's");
  // 伊内丝: a new sentry replaces the old one; her recall ('beam', 2026-10-21) ends it and flies it back to her —
  // projectile_chr_ines_guard_back with its line, a hit on each enemy it passes, its reach effects on her as it lands
  const s = kitOfficialPlan('sentry', { id: 1 }, 'ines');
  assert.deepEqual(s.stop, ['inesSentry']);
  assert.deepEqual(s.play.map((x) => [x.n, x.on, x.life]), [['ines_label_start_01', 'point', 'once'], ['ines_label_01', 'point', 'tag'], ['ines_range_01', 'point', 'tag']]);
  const rc = kitOfficialPlan('beam', { id: 1, hits: [5] }, 'ines');
  assert.deepEqual(rc.stop, ['inesSentry']);
  assert.equal(rc.pass, false);
  assert.deepEqual(rc.play[0], { n: 'ines_skill_03_label_trail_01', fly: 10, from: 'point', rope: 'ines_skill_03_pullLabel_line_01', pass: { n: 'ines_skill_03_label_hit_01', on: 'hits' } });
  assert.deepEqual(rc.play.slice(1).map((x) => [x.n, x.on, x.after]), [['ines_skill_03_getLabel_01', 'op', 'fly'], ['ines_skill_03_getLabel_range_01', 'op', 'fly']]);
  // 琳琅诗怀雅 S3's end: her S3_End mode's casts (2026-10-21), and a coin at each paid enemy, 0.07 s apart; her other coin
  // events have no rule
  const ends = ['swire2_skill_03_start_03', 'swire2_skill_03_start_03_02', 'swire2_skill_03_range'].map((n) => ({ n, cast: true }));
  assert.deepEqual(kitOfficialPlan('coin', { id: 1, n: 0, skill: 'swire2_3', targets: [5, 6] }, 'swire2').play,
    [...ends, { n: 'swire2_skill_03_trail', fly: 8, to: 'targets', gap: 0.07, hit: ['swire2_skill_03_hit_02'] }]);
  assert.equal(kitOfficialPlan('coin', { id: 1, n: 3 }, 'swire2'), null);
  assert.deepEqual(kitOfficialPlan('coin', { id: 1, n: 0, skill: 'swire2_3', targets: [] }, 'swire2').play, ends);
  // 歌蕾蒂娅 S3's end: the 捕网 harpoon out 0.3 s and back 1 s, its reach effect where it lands
  const gp = kitOfficialPlan('pull', { id: 1 }, 'glady');
  assert.deepEqual(gp.play[0], { n: 'glady_skill_03_line', harpoon: { out: 0.3, back: 1, moving: 'glady_skill_03_range_04' } });
  assert.deepEqual(gp.play[1], { n: 'glady_skill_03_range_05', on: 'point', life: 'once', after: 'fly' });
  // 烛煌: downed loops until she stands (and gone with her), then the end cast
  const dn = kitOfficialPlan('downed', { id: 1 }, 'blaze2');
  assert.ok(dn.pass && dn.play.every((x) => x.tag === 'blazeDown' && x.leave));
  assert.deepEqual(kitOfficialPlan('revive', { id: 1 }, 'blaze2'), { stop: ['blazeDown'], play: [{ n: 'blaze2_revive_end_start', on: 'op', life: 'once' }], pass: false });
  // on the event's unit: 阿罗玛's landing hit, 妮芙's burst mark for `t`, 隐德来希's candle + its line to the copied enemy
  assert.deepEqual(kitOfficialPlan('splash', { id: 5, src: 1 }, 'aroma').play, [{ n: 'aroma_skill_02_hit_02', on: 'id', life: 'once' }]);
  assert.deepEqual(kitOfficialPlan('soul', { id: 5, src: 1, t: 7 }, 'nymph').play, [{ n: 'nymph_talent_buff_01', on: 'id', life: 7 }]);
  assert.deepEqual(kitOfficialPlan('candle', { id: 5, of: 6, src: 1 }, 'etlchi').play[1], { n: 'etlchi_skill_03_line_01', line: ['of', 'id'] });
  assert.equal(kitOfficialPlan('candle', { id: 5 }, null), null);
  // 魔王's motes: the hit of the talent's motes on an operator, of S2's on an enemy; S1's own start is its skill's
  assert.deepEqual(names(kitOfficialPlan('mote', { id: 5, src: 1 }, 'cetsyr')), ['cetsyr_hit_01']);
  assert.deepEqual(names(kitOfficialPlan('mote', { id: 5, src: 1 }, 'cetsyr', { foe: true })), ['cetsyr_skill_02_hit_01']);
  assert.deepEqual(names(kitOfficialPlan('mote', { id: 1, src: 1 }, 'cetsyr')), []);
  assert.deepEqual(names(kitOfficialPlan('redistribute', { id: 1 }, 'cetsyr')), ['cetsyr_skill_03_burst_01']);
  // 卡涅利安: [half] or, cast with every charge, [full] + [half] for the skill; S3 with [full2] / [half2]; S2 keeps its stand-in
  assert.deepEqual(names(kitOfficialPlan('shell', { id: 1, charged: 0 }, 'billro')), ['billro_skill_01_buff_01_02']);
  // (charged: S1_Enhance keeps the trait's billro_beidong_buff_03 — default-mode-fx.test.js)
  assert.deepEqual(names(kitOfficialPlan('shell', { id: 1, charged: 1 }, 'billro')), ['billro_skill_01_buff_02', 'billro_skill_01_buff_01_02', 'billro_beidong_buff_03']);
  assert.ok(kitOfficialPlan('shell', { id: 1, charged: 1 }, 'billro').play.every((x) => x.life === 'skill'));
  assert.deepEqual(names(kitOfficialPlan('sandChainsCharged', { id: 1 }, 'billro')), ['billro_skill_02_buff_02', 'billro_skill_02_buff_01_02']);
  assert.equal(kitOfficialPlan('sandChains', { id: 1 }, 'billro').pass, true);
  assert.deepEqual(names(kitOfficialPlan('devour', { id: 1, charged: 0 }, 'billro')), ['billro_skill_03_buff_02_01', 'billro_skill_03_buff_01_01_02']);
  assert.equal(kitOfficialPlan('devour', { id: 1, charged: 1 }, 'billro').play.length, 4);
  // … and outside the skill by the charges stored (eff_cond's off-skill branch): 2 → [full] + [half], 1 → [half] _buff_01
  // (S3 _buff_01_01), 0 / -1 (the skill runs) → none
  const chg = (n, skill) => kitOfficialPlan('charges', { id: 1, n }, 'billro', { skill }).play.map((x) => (x.off ? `${x.slot} off` : `${x.slot} ${x.n}`));
  assert.deepEqual(chg(2, 0), ['chargeA billro_skill_01_buff_02', 'chargeB billro_skill_01_buff_01_02']);
  assert.deepEqual(chg(1, 1), ['chargeA billro_skill_02_buff_01', 'chargeB off']);
  assert.deepEqual(chg(2, 2), ['chargeA billro_skill_03_buff_01_02', 'chargeB billro_skill_03_buff_01_01_02']);
  assert.deepEqual(chg(1, 2), ['chargeA billro_skill_03_buff_01_01', 'chargeB off']);
  assert.deepEqual(chg(-1, 0), ['chargeA off', 'chargeB off']);
  assert.ok(kitOfficialPlan('charges', { id: 1, n: 2 }, 'billro').play.every((x) => x.off || x.on === 'op'));
  // 魔王's motes always on: one orbiting projectile effect per mote there, spread over the cap; the cool-down ready
  // effect where one comes back; S2 / S3 their own projectiles
  const mo = (o) => kitOfficialPlan('motes', { id: 1, ...o }, 'cetsyr').play.filter((x) => !x.off);
  assert.deepEqual(mo({ n: 2, cap: 3, sk: 0, r: 1.15, spd: 30 }).map((x) => [x.slot, x.n, x.ready, x.orbit]), [
    ['mote0', 'cetsyr_trail_01', 'cetsyr_trail_start', { r: 1.15, spd: 30, phase: 0 }],
    ['mote1', 'cetsyr_trail_01', 'cetsyr_trail_start', { r: 1.15, spd: 30, phase: 120 }],
  ]);
  assert.equal(kitOfficialPlan('motes', { id: 1, n: 2, cap: 3 }, 'cetsyr').play.filter((x) => x.off).length, 10);
  assert.deepEqual(mo({ n: 6, cap: 6, sk: 2, r: 2, spd: 0.9 }).map((x) => [x.n, x.ready, x.orbit.r, x.orbit.spd]).at(-1), ['cetsyr_skill_02_trail_01', 'cetsyr_skill_02_trail_start', 2, 0.9]);
  assert.deepEqual(mo({ n: 1, cap: 3 })[0].orbit, { r: 1, spd: 150, phase: 0 }, "without the sim's orbit: the prefab's");
  assert.deepEqual(mo({ n: 3, cap: 3, sk: 3 }).map((x) => [x.n, x.ready]).at(0), ['cetsyr_skill_03_trail_01', null]);
  // 缇缇 S3: the waking enemy's hit, a line from it to each enemy it puts to sleep for the line's own duration
  assert.deepEqual(kitOfficialPlan('wake', { id: 5, src: 1, to: [6, 7] }, 'titi').play, [
    { n: 'titi_skill_03_hit_02', on: 'id', life: 'once' }, { n: 'titi_skill_03_line_01', line: ['id', 'to'], life: 'once' },
  ]);
  // 泥岩 S3: the sleep and its range until the wake ('stone' keeps its stand-in), then the wake casts and the awake buff
  const stone = kitOfficialPlan('stone', { id: 1, form: 'dormant' }, 'mudrok');
  assert.ok(stone.pass && stone.play.every((x) => x.tag === 'mudSleep' && x.leave));
  assert.deepEqual(names(stone), ['mudrok_skill_03_sleep', 'mudrok_skill_03_range']);
  const rf = kitOfficialPlan('rockfall', { id: 1, form: null }, 'mudrok');
  assert.deepEqual(rf.stop, ['mudSleep']);
  assert.deepEqual(rf.play.map((x) => [x.n, x.life]), [['mudrok_skill_03_awake', 'once'], ['mudrok_skill_03_awake_02', 'once'], ['mudrok_skill_03_buff', 'skill']]);
  // 新约能天使: S3's shot flies to her coordinate and its reach effect waits for it; the talent bomb hits the marked enemy
  const as = kitOfficialPlan('airstrike', { id: 1, signal: 'fireToToken' }, 'angel2');
  assert.deepEqual(as.play, [{ n: 'angel2_skill_3_begin_start_001', on: 'op', life: 'once' }, { n: 'angel2_skill_3_begin_trail_01', fly: 10 }, { n: 'angel2_skill_3_begin_range_01', on: 'point', life: 'once', after: 'fly' }]);
  assert.deepEqual(kitOfficialPlan('airstrike', { id: 1, tgt: 9 }, 'angel2').play, [{ n: 'angel2_buff_01_trail_01', on: 'tgt', life: 'once' }]);
  // … and her S3 attacks no longer play that cast (char_modes.py TOKEN_FIRE: S3FireToToken is not one of the mode's attacks)
  assert.ok(!MODES.char_1041_angel2.cast.flat().includes('angel2_skill_3_begin_start_001'));
  // 缪尔赛思's 流形: its switch in the token's bundle, by the copied operator's range; her id is `by`, not the copied `src`
  assert.deepEqual(kitOfficialPlan('copy', { id: 4, src: 7, by: 1, mode: 'Range' }, 'mlyss').play,
    [{ n: 'token_10030_mlyss_wtrman_c1_to_c3', bundle: 'mlyss_token', on: 'id', life: 'once' }]);
  assert.equal(kitOfficialPlan('copy', { id: 4, mode: 'Melee' }, 'mlyss').play[0].n, 'token_10030_mlyss_wtrman_c1_to_c2');
  assert.equal(kitOperator({ id: 4, src: 7, by: 1 }, 'copy'), 1);
  // 焰影苇草's fireball circles its carrier for her skill; 流明's rain on the target for its life
  assert.deepEqual(kitOfficialPlan('ember', { id: 3, src: 1 }, 'reed2').play, [{ n: 'reed2_skill_02_fireball_01', on: 'id', life: 'skill', orbit: { r: 1, spd: 150 } }]);
  // 圣聆初雪's snow: one effect per changed tile by its layers (1 → _01, 2–4 → _02, 5 → _03), ended at 0; its stand-in
  // zone only for the talent's own layers
  assert.deepEqual(kitOfficialPlan('snow', { id: 1, cells: [[3, 2, 1], [4, 2, 4], [5, 2, 5], [6, 2, 0]] }, 'sbell2').play, [
    { n: 'sbell2_ground_01', on: 'point', at: [3, 2], slot: 'snow3,2' }, { n: 'sbell2_ground_02', on: 'point', at: [4, 2], slot: 'snow4,2' },
    { n: 'sbell2_ground_03', on: 'point', at: [5, 2], slot: 'snow5,2' }, { slot: 'snow6,2', off: true },
  ]);
  assert.equal(kitOfficialPlan('snow', { id: 1 }, 'svrash'), null);
  assert.equal(fxSpec('snow', { cells: [[3, 2, 0]] }).a, 'none');
  assert.equal(fxSpec('snow', { cells: [[3, 2, 1]], tiles: 1 }).a, 'zone');
  assert.equal(fxSpec('snow', {}).a, 'zone');
  assert.deepEqual(kitOfficialPlan('healField', { id: 1, tgt: 3, t: 4 }, 'lumen').play, [{ n: 'lumen_skill_01_range', on: 'tgt', life: 4 }]);
  // 蕾缪安's 引渡 only (her other talent moments have no rule)
  assert.equal(kitOfficialPlan('talent', { id: 1, name: 'other' }, 'lemuen'), null);
  assert.deepEqual(names(kitOfficialPlan('talent', { id: 1, name: 'extradition' }, 'lemuen')), ['lemuen_talent_buff_02']);
  // the operator of an event: src, then by, then id
  assert.equal(kitOperator({ id: 5, src: 1 }), 1);
  assert.equal(kitOperator({ id: 5, by: 2 }), 2);
  assert.equal(kitOperator({ id: 5 }), 5);
});

test('the kits send what the rules read', () => {
  const src = (f) => readFileSync(path.join(KITS, 'ops', f), 'utf8');
  assert.match(src('chess_char_4_18-mudrok.js'), /battle\.fx\('shieldBreak', \{ x: unit\.x, y: unit\.y, id: unit\.id, left \}\)/);
  assert.match(src('chess_char_4_10-aroma.js'), /battle\.fx\('splash', \{ x: e\.x, y: e\.y, id: e\.id, src: unit\.id \}\)/);
  assert.match(src('chess_char_5_22-nymph.js'), /battle\.fx\('soul', \{ x: e\.x, y: e\.y, id: e\.id, src: unit\.id, t: /);
  assert.match(src('chess_char_5_06-etlchi.js'), /battle\.fx\('candle', \{ x: cd\.x, y: cd\.y, id: cd\.id, of: e\.id, src: unit\.id \}\)/);
  assert.match(src('chess_char_5_03-blaze2.js'), /battle\.fx\('downed', /);
  for (const f of ['chess_char_4_25-cetsyr.js', 'chess_char_5_09-cetsyr.js']) {
    for (const m of src(f).matchAll(/battle\.fx\('mote', \{[^}]*\}/g)) assert.match(m[0], /src: unit\.id/, `${f}: ${m[0]}`);
  }
  assert.match(src('chess_char_4_18-mudrok.js'), /battle\.fx\('stacks', \{ x: unit\.x, y: unit\.y, id: unit\.id, buff: 'mudrok:layers', n, /);
  assert.match(src('chess_char_4_24-billro.js'), /battle\.fx\('charges', \{ x: unit\.x, y: unit\.y, id: unit\.id, n \}\)/);
  assert.match(src('chess_char_4_24-billro.js'), /battle\.fx\('stacks', \{ x: e\.x, y: e\.y, id: e\.id, src: unit\.id, buff: BILLRO_MARK, n: m\.stacks \}\)/);
  for (const f of ['chess_char_4_25-cetsyr.js', 'chess_char_5_09-cetsyr.js']) assert.match(src(f), /battle\.fx\('motes', \{ x: unit\.x, y: unit\.y, id: unit\.id, n, cap(: cnt)?, sk, r(: orbit)?, spd(: [^}]+)? \}\)/, f);
  assert.match(src('chess_char_4_24-billro.js'), /battle\.fx\('shell', \{[^}]*charged: /);
  assert.match(src('chess_char_4_24-billro.js'), /battle\.fx\('devour', \{[^}]*charged: /);
  assert.match(src('chess_char_5_02-titi.js'), /battle\.fx\('wake', \{[^}]*, to \}\);\s*sleepOthers\(e, to\)/);
  assert.match(src('chess_char_6_13-angel2.js'), /battle\.fx\('airstrike', \{ x: c\.x, y: c\.y, id: unit\.id, r: AIRSTRIKE_RADIUS, tgt: c\.id \}\)/);
  assert.match(src('chess_char_6_14-lumen.js'), /battle\.fx\('healField', \{ x: target\.x, y: target\.y, id: unit\.id, tgt: target\.id, t: life \}\)/);
  assert.match(src('chess_char_6_11-mlyss.js'), /battle\.fx\('copy', \{[^}]*mode: [^}]*by: unit\.id \}\)/);
  assert.match(src('chess_char_5_02-titi.js'), /battle\.fx\('sleepGuard', \{ x: a\.x, y: a\.y, id: a\.id, src: unit\.id \}\)/);
});

// (one index for the file: the layer module loads it once)
const files = { '/assets/local/fx/index.json': { bundles: {
  horn: ['horn_buff_01_convert_start', 'horn_skill_02_buff_03_front'], ines: ['ines_label_01'],
  cetsyr: ['cetsyr_trail_01', 'cetsyr_trail_start', 'cetsyr_skill_02_trail_01', 'cetsyr_skill_02_trail_start'],
  billro: ['billro_skill_01_buff_01', 'billro_skill_01_buff_02', 'billro_skill_01_buff_01_02'],
  mudrok: ['mudrok_buff_01_begin', 'mudrok_buff_01_hit'], common: ['common_buff_parry_01'],
} } };
const settle = () => new Promise((r) => setTimeout(r, 5));

test('fxgame.js: a planned event is taken from its stand-in only when one of its prefabs is extracted', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high' });
    await settle();
    const horn = { id: 1, x: 0, y: 0, alive: true, info: { id: 1, side: 'ally', defId: 'char_4039_horn', skillIndex: 1 } };
    const ines = { id: 2, x: 3, y: 0, alive: true, info: { id: 2, side: 'ally', defId: 'char_4087_ines' } };
    const views = new Map([[1, horn], [2, ines]]);
    const bb = ['fx', 'bloodBattle', 0, 0, { x: 0, y: 0, id: 1 }];
    layer.onEvent(bb, views);
    assert.equal(layer.ownsFx(bb), true);
    const ov = ['fx', 'overload', 0, 0, { x: 0, y: 0, id: 1 }];
    layer.onEvent(ov, views);
    assert.equal(layer.ownsFx(ov), true);
    // facing UP: the _back variant, not extracted here → nothing of it plays; the event stays silenced (standInOff)
    horn.dir = 'UP';
    const ov2 = ['fx', 'overload', 0, 0, { x: 0, y: 0, id: 1 }];
    layer.onEvent(ov2, views);
    assert.equal(layer.ownsFx(ov2), true, 'standInOff still drops the stand-in');
    const st = ['fx', 'sentry', 3, 0, { x: 3, y: 0, id: 2 }];
    layer.onEvent(st, views);
    assert.equal(layer.ownsFx(st), true);
    // her recall ends it and keeps its own (informational) beam
    const beam = ['fx', 'beam', 3, 0, { x: 3, y: 0, tx: 3, ty: 0, id: 2 }];
    layer.onEvent(beam, views);
    assert.equal(layer.ownsFx(beam), false);
  } finally { globalThis.fetch = fetch0; }
});

test('fxgame.js: slots on and around a unit, 泥岩\'s block effect', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const plays = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', trace: (p) => plays.push(p) });
    await settle();
    const op = (id, defId) => ({ id, x: id, y: 0, alive: true, info: { id, side: 'ally', defId, skillIndex: 0 } });
    const views = new Map([[1, op(1, 'char_4134_cetsyr')], [2, op(2, 'char_426_billro')], [3, op(3, 'char_311_mudrok')], [4, op(4, 'char_1014_nearl2')]]);
    const ev = (name, o) => layer.onEvent(['fx', name, 0, 0, { x: 0, y: 0, ...o }], views);
    const got = () => plays.splice(0).filter((p) => p.kind === 'spawn').map((p) => p.names[0]).sort();
    // (sent without awaiting: node has no WebP, the first spawn's check fails the layer for later events)
    ev('motes', { id: 1, n: 3, cap: 3, sk: 0 });
    assert.deepEqual(got(), ['cetsyr_trail_01', 'cetsyr_trail_01', 'cetsyr_trail_01', 'cetsyr_trail_start', 'cetsyr_trail_start', 'cetsyr_trail_start']);
    ev('motes', { id: 1, n: 2, cap: 3, sk: 0 });
    assert.deepEqual(got(), [], 'the two left keep running');
    ev('motes', { id: 1, n: 3, cap: 3, sk: 0 });
    assert.deepEqual(got(), ['cetsyr_trail_01', 'cetsyr_trail_start'], 'one comes back');
    ev('motes', { id: 1, n: 6, cap: 6, sk: 2 });
    assert.deepEqual(got(), [...Array(6).fill('cetsyr_skill_02_trail_01'), ...Array(3).fill('cetsyr_skill_02_trail_start')], 'S2: six, three new');
    ev('charges', { id: 2, n: 1 });
    assert.deepEqual(got(), ['billro_skill_01_buff_01']);
    ev('charges', { id: 2, n: 2 });
    assert.deepEqual(got(), ['billro_skill_01_buff_01_02', 'billro_skill_01_buff_02']);
    ev('charges', { id: 2, n: -1 });
    assert.deepEqual(got(), []);
    ev('stacks', { id: 3, buff: 'mudrok:layers', n: 2, max: 3 });
    assert.deepEqual(got(), ['mudrok_buff_01_begin']);
    ev('parry', { id: 3, buff: 'mudrok:layers' });
    assert.deepEqual(got(), ['mudrok_buff_01_hit'], "her layers' blackboard `effect`");
    ev('parry', { id: 4, buff: 'nearl2:shield' });
    assert.deepEqual(got(), ['common_buff_parry_01']);
  } finally { globalThis.fetch = fetch0; }
});

test('kitOfficialPlan: talent casts and 烛煌 S2\'s burning tiles (2026-10-16, 묶음 3)', () => {
  const names = (p) => p.play.map((x) => x.n);
  // 卡涅利安 生命之餐: _01, cast with every charge _02; 风笛 精密填弹: the splash hit on the extra enemy
  assert.deepEqual(names(kitOfficialPlan('talent', { id: 1, name: 'meal', charged: 0 }, 'billro')), ['billro_beidong_buff_01']);
  assert.deepEqual(names(kitOfficialPlan('talent', { id: 1, name: 'meal', charged: 1 }, 'billro')), ['billro_beidong_buff_02']);
  assert.deepEqual(kitOfficialPlan('talent', { id: 5, src: 1, name: 'splash' }, 'bpipe').play, [{ n: 'bpipe_attack_02_hit', on: 'id', life: 'once' }]);
  // 灵知 殊途同归: the infinite wrapper's cast effect for the deployment
  assert.deepEqual(kitOfficialPlan('kitHit', { id: 1, k: 'gnosis:t2' }, 'gnosis').play, [{ n: 'gnosis_beidong_buff', on: 'op', life: 'deployed' }]);
  // one slot per tile: on → the plot effect on that tile, off → ended
  assert.deepEqual(kitOfficialPlan('burnTiles', { id: 1, cells: [[5, 10, 1], [6, 10, 0]] }, 'blaze2').play, [
    { n: 'blaze2_skill_02_hit_plot', on: 'point', at: [5, 10], slot: 'burn5,10' }, { slot: 'burn6,10', off: true },
  ]);
});

test('歌蕾蒂娅 S3: glady_s3[effect]\'s glady_skill_03_buff on the target the kit binds (`tgt`), for the skill', () => {
  const plan = kitOfficialPlan('tornado', { id: 1, tgt: 2 }, 'glady', { skill: 2 });
  assert.deepEqual(plan.play, [{ n: 'glady_skill_03_buff', on: 'tgt', life: 'skill' }]);
  assert.match(readFileSync(path.join(KITS, 'ops/chess_char_4_12-glady.js'), 'utf8'), /battle\.fx\('tornado', \{ x: t\.x, y: t\.y, id: unit\.id, tgt: t\.id,/);
});

test('纯烬艾雅法拉 S2: the barrier\'s range effect follows what it can still absorb and ends when it is spent', () => {
  const inst = (buff) => ({ def: { animSrc: [{ buff }] }, prog: [], setBuffProgress(k, r) { this.prog.push([k, r]); } });
  const KEY = 'agoat2_s_2[shield]';
  const range = { owner: 7, until: 20, inst: inst(KEY) }, other = { owner: 8, until: 20, inst: inst(KEY) };
  const held = { owner: 7, until: null, inst: inst(KEY) }, plain = { owner: 7, until: 20, inst: inst('x') };
  const list = [range, other, held, plain];
  buffProgressOn(list, { id: 7, key: KEY, r: 0.4 }, 5);
  assert.deepEqual([range.inst.prog, range.until, held.until], [[[KEY, 0.4]], 20, null], 'a level, no end');
  buffProgressOn(list, { id: 7, key: KEY, r: 0 }, 6);
  assert.deepEqual([range.until, held.until, other.until, plain.until], [6, 6, 20, 20], 'spent: hers end now, nothing else');
  assert.deepEqual([other.inst.prog, plain.inst.prog], [[], []]);
  // the kit sends r 0 as the pool runs out (its veil is then gone), and the plan cites the ability whose _effects it is
  assert.match(readFileSync(path.join(KITS, 'ops/chess_char_6_20-agoat2.js'), 'utf8'), /const r = v\.pool0 > 0 \? Math\.ceil\(\(v\.pool \/ v\.pool0\) \* 100 - 1e-9\) \/ 100 : 0;/);
  assert.deepEqual(KIT_OFFICIAL.shield.agoat2.src, ['skchr_agoat2_2/Shield/Aura', KEY]);
});
