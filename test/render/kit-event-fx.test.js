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
import { KIT_OFFICIAL, kitOfficialPlan, kitOperator, tplPlays } from '../../public/js/render/fx/kitofficial.js';
import { keyPlays, HIT_KEYS } from '../helpers/fxBindings.js';
import { createFxLayer, buffProgressOn } from '../../public/js/render/fxgame.js';
import { activationEffects } from '../../public/js/render/fxmap.js';
// the fixed plays of the client keys the cases assert (they run without the client-only rows)
import { PLAYS as FIXED } from '../helpers/fxPlays.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GAME = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));
const KITS = path.join(ROOT, 'server/sim/content/kits');
// the extracted effects (git-ignored, `npm run setup`): the skill activation's name rules need the bundle's prefab list
const FX_INDEX = path.join(ROOT, 'public/assets/local/fx/index.json');
const BUNDLES = existsSync(FX_INDEX) ? JSON.parse(readFileSync(FX_INDEX, 'utf8')).bundles : null;
// the plans' client keys → prefabs (tools/build-fx-plays.mjs, from the binding tables on disk; a key only the client-only rows
// hold is missing without them)
const PLAYS = keyPlays();
const LOCAL_ROWS = existsSync(path.join(ROOT, 'public/assets/local/fx/bindings.json'));
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
      const o = { left: 0, t: 2, id: 1, of: 2, n: 2, cap: 3, name: 'extradition', cells: [[1, 1, 1], [2, 1, 3], [3, 1, 5], [4, 1, 0]], skill: 'swire2_3', targets: [2], token: 'token_10058_sbell2_icetgt', ids: [2], off: [3], picks: [2] };
      // ('hit' rules answer their own moment keys)
      const plans = [{ skill: 0 }, { skill: 1 }, { skill: 2, back: true }].map((c) => ({ ...c, plays: PLAYS }))
        .flatMap((ctx) => (n === 'hit' ? HIT_KEYS : [undefined]).map((k) => kitOfficialPlan(n, { ...o, k }, b, ctx))).filter(Boolean);
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
  assert.deepEqual(names(kitOfficialPlan('overload', { id: 1 }, 'horn', { skill: 1, plays: FIXED })), ['horn_skill_02_buff_03_front']);
  assert.deepEqual(names(kitOfficialPlan('overload', { id: 1 }, 'horn', { skill: 2, back: true, plays: FIXED })), ['horn_skill_03_buff_02_03_back']);
  assert.equal(kitOfficialPlan('overload', { id: 1 }, 'horn', { skill: 1, plays: FIXED }).play[0].life, 'skill');
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
  // (2026-10-24, 묶음 S4) the standing sentry's stop effect first
  assert.deepEqual(rc.play[0], { n: 'ines_skill_03_pullLabel_01', on: 'point', life: 'once' });
  assert.deepEqual(rc.play[1], { n: 'ines_skill_03_label_trail_01', fly: 10, from: 'point', rope: 'ines_skill_03_pullLabel_line_01', pass: { n: 'ines_skill_03_label_hit_01', on: 'hits' } });
  assert.deepEqual(rc.play.slice(2).map((x) => [x.n, x.on, x.after]), [['ines_skill_03_getLabel_01', 'op', 'fly'], ['ines_skill_03_getLabel_range_01', 'op', 'fly']]);
  // 琳琅诗怀雅 S3's end: her S3_End mode's casts (2026-10-21), and a coin at each paid enemy, 0.07 s apart; her other coin
  // events have no rule
  // (2026-10-23) by their client keys: the S3_End trigger's held casts, the coin projectile's `_mainEffect` / `_effectsWhenHit`
  const ends = ['swire2_skill_03_range', 'swire2_skill_03_start_03', 'swire2_skill_03_start_03_02'].map((n) => ({ n, cast: true }));
  assert.deepEqual(kitOfficialPlan('coin', { id: 1, n: 0, skill: 'swire2_3', targets: [5, 6] }, 'swire2', { plays: FIXED }).play,
    [...ends, { n: 'swire2_skill_03_trail', fly: 8, to: 'targets', gap: 0.07, hit: ['swire2_skill_03_hit_02'] }]);
  assert.equal(kitOfficialPlan('coin', { id: 1, n: 3 }, 'swire2'), null);
  assert.deepEqual(kitOfficialPlan('coin', { id: 1, n: 0, skill: 'swire2_3', targets: [] }, 'swire2', { plays: FIXED }).play, ends);
  assert.deepEqual(kitOfficialPlan('coin', { id: 1, n: 0, skill: 'swire2_3', targets: [5] }, 'swire2').play, [], 'without the plays: none');
  // 歌蕾蒂娅 S3's end: the 捕网 harpoon out 0.3 s and back 1 s, its reach effect where it lands
  const gp = kitOfficialPlan('pull', { id: 1 }, 'glady');
  assert.deepEqual(gp.play[0], { n: 'glady_skill_03_line', harpoon: { out: 0.3, back: 1, moving: 'glady_skill_03_range_04' } });
  assert.deepEqual(gp.play[1], { n: 'glady_skill_03_range_05', on: 'point', life: 'once', after: 'fly' });
  // 烛煌: downed loops until she stands (and gone with her), then the end cast
  const dn = kitOfficialPlan('downed', { id: 1 }, 'blaze2', { plays: FIXED });
  assert.ok(dn.pass && dn.play.length === 2 && dn.play.every((x) => x.tag === 'blazeDown' && x.leave));
  assert.deepEqual(kitOfficialPlan('revive', { id: 1 }, 'blaze2'), { stop: ['blazeDown'], play: [{ n: 'blaze2_revive_end_start', on: 'op', life: 'once' }], pass: false });
  // on the event's unit: 阿罗玛's landing hit, 妮芙's burst mark for `t`, 隐德来希's candle + its line to the copied enemy
  assert.deepEqual(kitOfficialPlan('splash', { id: 5, src: 1 }, 'aroma').play, [{ n: 'aroma_skill_02_hit_02', on: 'id', life: 'once' }]);
  assert.deepEqual(kitOfficialPlan('soul', { id: 5, src: 1, t: 7 }, 'nymph', { plays: FIXED }).play, [{ n: 'nymph_talent_buff_01', on: 'id', life: 7 }]);
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
  // 灵知 / 流明 S2: one stage at a time by the charges stored ([effect1] / [effect2] through the table), a cast ends it — 灵知's
  // with the judge's range (_02 cast with every charge stored); outside S2's install the sim sends none
  const stage = (b, o) => kitOfficialPlan('charges', { id: 1, ...o }, b, { skill: 1, plays: PLAYS }).play.flatMap((q) => (q.tpl ? tplPlays(q, PLAYS) : [q]))
    .map((x) => (x.off ? `${x.slot} off` : `${x.slot ?? x.life} ${x.n}`));
  assert.deepEqual(stage('gnosis', { n: 1 }), ['charge gnosis_skill_02_buff_01']);
  assert.deepEqual(stage('gnosis', { n: 2 }), ['charge gnosis_skill_02_buff_02']);
  assert.deepEqual(stage('gnosis', { n: -1, charged: 1 }), ['charge off', 'once gnosis_skill_02_range_02']);
  assert.deepEqual(stage('gnosis', { n: -1, charged: 0 }), ['charge off', 'once gnosis_skill_02_range_01']);
  assert.deepEqual(stage('lumen', { n: 1 }), ['charge lumen_skill_02_buff']);
  assert.deepEqual(stage('lumen', { n: 2 }), ['charge lumen_skill_02_buff_02']);
  assert.deepEqual(stage('lumen', { n: 0 }), ['charge off']);
  assert.deepEqual(stage('lumen', { n: -1 }), ['charge off']);
  // (the name rules no longer loop them through the instant cast: fxgame.js KIT_OWNED)
  for (const [b, pre] of [['gnosis', ['gnosis_skill_02_buff_01', 'gnosis_skill_02_buff_02', 'gnosis_skill_02_range_01', 'gnosis_skill_02_range_02']], ['lumen', ['lumen_skill_02_buff', 'lumen_skill_02_buff_02']]]) {
    assert.match(readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8'), new RegExp(pre.map((n) => `'${n}'`).join(',\\s*')), b);
  }
  // 寒芒克洛丝 S2: the warmed buffs come with 'quadShot' only — neither its mode's attach list nor the `_buff` name rule starts
  // them with the skill (2026-10-23: buff_01 / _02 from the start, then all three again over them)
  const kroos = ['kroos2_skill_02_buff_01', 'kroos2_skill_02_buff_02', 'kroos2_skill_02_buff_03'];
  assert.match(readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8'), new RegExp(kroos.map((n) => `'${n}'`).join(',\\s*')));
  const kb = { modes: ['Default', 'S1', 'S2'], skillMode: [1, 2], attach: [[], [], [kroos[0]]], skills: [{}, {}] };
  assert.deepEqual(activationEffects(kb, kroos, 1).loops, kroos.slice(0, 2), 'without the kit-owned set: the name rule loops two');
  assert.deepEqual(activationEffects(kb, kroos, 1, new Set(kroos)).loops, []);
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
  const as = kitOfficialPlan('airstrike', { id: 1, signal: 'fireToToken' }, 'angel2', { plays: FIXED });
  assert.deepEqual(as.play, [{ n: 'angel2_skill_3_begin_start_001', on: 'op', life: 'once' }, { n: 'angel2_skill_3_begin_trail_01', fly: 10 }, { n: 'angel2_skill_3_begin_range_01', on: 'point', life: 'once', after: 'fly' }]);
  assert.deepEqual(kitOfficialPlan('airstrike', { id: 1, tgt: 9 }, 'angel2').play, [{ n: 'angel2_buff_01_trail_01', on: 'tgt', life: 'once' }]);
  // 寒檀 S2's icicle: projectile_chr_sntlla_s2's `_effectsWhenReached` where it lands (its `_effectsWhenHit` is no kit event's)
  assert.deepEqual(kitOfficialPlan('iceSpike', { id: 1, x: 2, y: 3 }, 'sntlla', { plays: FIXED }).play, [{ n: 'sntlla_skill_02_start_01', on: 'point', life: 'once' }]);
  // … and her S3 attacks no longer play that cast (char_modes.py TOKEN_FIRE: S3FireToToken is not one of the mode's attacks)
  assert.ok(!MODES.char_1041_angel2.cast.flat().includes('angel2_skill_3_begin_start_001'));
  // 缪尔赛思's 流形: its switch in the token's bundle, by the copied operator's range; her id is `by`, not the copied `src`
  assert.deepEqual(kitOfficialPlan('copy', { id: 4, src: 7, by: 1, mode: 'Range' }, 'mlyss', { plays: FIXED }).play,
    [{ n: 'token_10030_mlyss_wtrman_c1_to_c3', bundle: 'mlyss_token', on: 'id', life: 'once' }]);
  assert.equal(kitOfficialPlan('copy', { id: 4, mode: 'Melee' }, 'mlyss', { plays: FIXED }).play[0].n, 'token_10030_mlyss_wtrman_c1_to_c2');
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
  assert.deepEqual(kitOfficialPlan('healField', { id: 1, tgt: 3, t: 4 }, 'lumen', { plays: PLAYS }).play, [{ n: 'lumen_skill_01_range', on: 'tgt', life: 4 }]);
  // 蕾缪安's 引渡 only (her other talent moments have no rule)
  assert.equal(kitOfficialPlan('talent', { id: 1, name: 'other' }, 'lemuen'), null);
  assert.deepEqual(names(kitOfficialPlan('talent', { id: 1, name: 'extradition' }, 'lemuen', { plays: PLAYS })), ['lemuen_talent_buff_02']);
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
  assert.match(src('chess_char_4_01-rmixer.js'), /battle\.fx\('reload', \{ x: cand\[0\]\.x, y: cand\[0\]\.y, id: cand\[0\]\.id, n, src: unit\.id \}\)/);
  assert.match(src('chess_char_4_19-flamtl.js'), /battle\.fx\('riposte', \{ x: unit\.x, y: unit\.y, id: unit\.id, /);
  assert.match(src('chess_char_2_06-papyrs.js'), /battle\.fx\('buff', \{ x: lock\.x, y: lock\.y, id: lock\.id, kind: 'lock', src: unit\.id \}\)/);
  assert.match(src('chess_char_6_14-lumen.js'), /battle\.fx\('emergency', \{ x: t\.x, y: t\.y, id: t\.id, src: unit\.id \}\)/);
  assert.match(src('chess_char_6_01-lemuen.js'), /battle\.fx\('lock', \{ x: A\.e\.x, y: A\.e\.y, id: A\.e\.id, src: unit\.id \}\)/);
  assert.match(src('chess_char_6_01-lemuen.js'), /battle\.fx\('lemuenAim', \{ x: unit\.x, y: unit\.y, id: unit\.id, signal: 'aim', on: 0 \}\)/);
  assert.match(src('chess_char_6_16-halo2.js'), /battle\.fx\('link', \{ x: ctx\.targets\[0\]\.x, y: ctx\.targets\[0\]\.y, id: unit\.id, ids: ctx\.targets\.map\(\(e\) => e\.id\) \}\)/);
  assert.match(src('chess_char_4_04-ines.js'), /const ax = from\.x, ay = from\.y[\s\S]*battle\.fx\('beam', \{ x: ax, y: ay, /);
});

test('蕾缪安 S2 (2026-10-24, 묶음 S2): the aim\'s crosshair on its target and the line from her until the aim ends; S3 locks are fxgame.js\'s', () => {
  const a = kitOfficialPlan('lock', { id: 7, src: 3 }, 'lemuen', { skill: 1 });
  assert.deepEqual(a.stop, ['lemuenAim']);
  assert.deepEqual(a.play, [
    { n: 'lemuen_skill_02_crosshair_02', on: 'id', life: 'tag', tag: 'lemuenAim' },
    { n: 'lemuen_skill_02_trail_01', line: ['src', 'id'], tag: 'lemuenAim' },
  ]);
  assert.equal(kitOperator({ id: 7, src: 3 }, 'lock'), 3);
  assert.equal(kitOfficialPlan('lock', { id: 7, src: 3 }, 'lemuen', { skill: 2 }), null);
  assert.equal(kitOfficialPlan('lemuenAim', { id: 3, on: 1 }, 'lemuen'), null);
  assert.deepEqual(kitOfficialPlan('lemuenAim', { id: 3, on: 0 }, 'lemuen').stop, ['lemuenAim']);
  // 莎草 S2: the locked ally's mark for the skill; 流明 T2: the emergency heal's flash on her, the mark kept
  assert.deepEqual(kitOfficialPlan('buff', { id: 7, src: 3, kind: 'lock' }, 'papyrs', { plays: PLAYS }).play, [{ on: 'id', life: 'skill', n: 'papyrs_skill2_mark_01' }]);
  assert.equal(kitOperator({ id: 7, src: 3, kind: 'lock' }, 'buff'), 3);
  const em = kitOfficialPlan('emergency', { id: 7, src: 3 }, 'lumen');
  assert.equal(em.pass, true);
  assert.deepEqual(em.play, [{ n: 'lumen_buff_01_hit', on: 'id', life: 'once' }], 'on the ally it heals (묶음 S3)');
  // a plan's `stop` also ends its tagged lines (fxgame.js officialKitFx → startLine meta)
  assert.match(GAME, /for \(const l of elines\.values\(\)\) if \(l\.tag === tag && l\.owner === opId\) l\.until = Math\.min\(l\.until, clockS\);/);
  assert.match(GAME, /const meta = p\.tag \|\| p\.life === 'skill' \? \{ tag: p\.tag \?\? null, owner: opId, skill: p\.life === 'skill' \} : null;/);
});

test('溯光星源 S3 and 伊内丝 S3 (2026-10-24, 묶음 S4): one line through the locks for the skill; the recalled sentry stops where it stood', () => {
  const l = kitOfficialPlan('link', { id: 3, ids: [7, 8] }, 'halo2', { skill: 2 });
  assert.deepEqual(l.stop, ['halo2Link']);
  assert.deepEqual(l.play, [{ n: 'halo2_skill_03_line_01', line: ['ids'], tag: 'halo2Link', life: 'skill' }]);
  assert.equal(kitOperator({ id: 3, ids: [7, 8] }, 'link'), 3);
  assert.equal(kitOfficialPlan('link', { id: 3, ids: [7, 8] }, 'halo2', { skill: 1 }), null, 'her S2 pull keeps its stand-in');
  assert.deepEqual(kitOfficialPlan('beam', { id: 3, x: 1, y: 2, tx: 4, ty: 2, hits: [] }, 'ines').play[0], { n: 'ines_skill_03_pullLabel_01', on: 'point', life: 'once' });
  // a one-field line runs through its list in order; a `life: 'skill'` line ends with the operator's skill
  assert.match(GAME, /p\.line\.length === 1 \? \[o\[p\.line\[0\]\]\]\.flat\(\)\.map\(\(id, i, a\) => \[id, a\[i \+ 1\]\]\)\.slice\(0, -1\)/);
  assert.match(GAME, /if \(l\.skill && l\.owner === \(v\.id \?\? v\.info\.id\)\) l\.until = Math\.min\(l\.until, clockS\);/);
});

test('焰尾 T1 and 信仰搅拌机 S1 (2026-10-24, 묶음 S1): a dodge flashes and holds the evade buff until the riposte, a reload tips its ally', () => {
  const d = kitOfficialPlan('dodge', { id: 1 }, 'flamtl', { plays: PLAYS });
  assert.equal(d.pass, true, 'the dodge keeps its text');
  assert.deepEqual(d.play.map((p) => [p.n, p.on, p.life ?? null, p.slot ?? null]), [
    ['flamtl_flash_01', 'op', 'once', null], ['flamtl_buff_01', 'op', null, 'flamtlEvade'],
  ]);
  assert.deepEqual(kitOfficialPlan('riposte', { id: 1 }, 'flamtl').play, [{ slot: 'flamtlEvade', off: true }]);
  assert.equal(kitOfficialPlan('dodge', { id: 1 }, 'chen3'), null, "another operator's dodge has no rule");
  // the event's operator is the 信仰搅拌机 (`src`), the tip goes on the reloaded ally (`id`)
  assert.equal(kitOperator({ id: 7, src: 3, n: 1 }, 'reload'), 3);
  assert.deepEqual(kitOfficialPlan('reload', { id: 7, src: 3, n: 1 }, 'rmixer', { plays: PLAYS }).play, [{ on: 'id', n: 'rmixer_skill_01_tip_01', life: 'once' }]);
});

// (one index for the file: the layer module loads it once)
const files = { '/assets/local/fx/index.json': { bundles: {
  horn: ['horn_buff_01_convert_start', 'horn_skill_02_buff_03_front'], ines: ['ines_label_01'],
  cetsyr: ['cetsyr_trail_01', 'cetsyr_trail_start', 'cetsyr_skill_02_trail_01', 'cetsyr_skill_02_trail_start'],
  billro: ['billro_skill_01_buff_01', 'billro_skill_01_buff_02', 'billro_skill_01_buff_01_02'],
  mudrok: ['mudrok_buff_01_begin', 'mudrok_buff_01_hit'], common: ['common_buff_parry_01'], podego: ['common_heal_hit_01'],
  pfx_enemy_14: ['enemy_xi_skill_02_buff_hit', 'enemy_xi_skill_02_buff_03'], pfx_enemy_8: ['enemy_mdrock_skill_01_buff_hit', 'enemy_mdrock_skill_buff_05'],
  pfx_enemy_6: ['enemy_hummbd_die_02'],
  // 묶음 S3: the 'dmg' / 'heal' moments' prefabs
  bubble: ['bubble_talent_buff'], skadi2: ['skadi2_skill_01_hit', 'skadi2_skill_01_hit_02'], reed2: ['reed2_treat_01'],
  excu2: ['excu2_skill_03_aim_01'], thorn2: ['thorn2_skill_hit'], lumen: ['lumen_buff_01_hit'],
  // 묶음 S6
  snhunt: ['snhunt_talent_01_hit', 'snhunt_talent_01_hit_02'], vulpis: ['vulpis_buff_01'], vendla: ['vendla_attack_hit_02'],
  ascln: ['ascln_skill_02_death_01'],
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

test('fxgame.js: slots on and around a unit, 泥岩\'s and “自在”\'s block effects', async () => {
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
    // 2026-10-23: and the layer graph's CreateEffect common_heal_hit_01 after it (from a bundle that holds it)
    assert.deepEqual(got(), ['common_heal_hit_01', 'mudrok_buff_01_hit'], "her layers' blackboard `effect`, then the heal hit");
    ev('parry', { id: 4, buff: 'nearl2:shield' });
    assert.deepEqual(got(), ['common_buff_parry_01']);
    // “自在”'s amount barrier: the block effect only for a hit taken whole, the last layer's break its _buff_03
    views.set(5, { id: 5, x: 5, y: 0, alive: true, info: { id: 5, side: 'enemy', defId: 'enemy_1517_xi' } });
    ev('parry', { id: 5, buff: 'ab:xiShield[a]', whole: 1, broke: 0 });
    assert.deepEqual(got(), ['enemy_xi_skill_02_buff_hit']);
    ev('parry', { id: 5, buff: 'ab:xiShield[b]', whole: 0, broke: 1 });
    assert.deepEqual(got(), [], 'a middle layer drained by a bigger hit: no block, no break effect');
    ev('parry', { id: 5, buff: 'ab:xiShield[c]', whole: 1, broke: 1 });
    assert.deepEqual(got(), ['enemy_xi_skill_02_buff_03', 'enemy_xi_skill_02_buff_hit']);
    // the enemy 泥岩: its last layer's break, and its barrier's own 'shieldBreak' then draws no 2D shatter
    views.set(6, { id: 6, x: 6, y: 0, alive: true, info: { id: 6, side: 'enemy', defId: 'enemy_1511_mdrock' } });
    ev('parry', { id: 6, buff: 'ab:rockPower[3]', whole: 0, broke: 1 });
    assert.deepEqual(got(), ['enemy_mdrock_skill_buff_05']);
    const br = ['fx', 'shieldBreak', 0, 0, { x: 0, y: 0, id: 6 }];
    layer.onEvent(br, views);
    assert.equal(layer.ownsFx(br), true);
    const br2 = ['fx', 'shieldBreak', 0, 0, { x: 0, y: 0, id: 6 }];
    layer.onEvent(br2, views);
    assert.equal(layer.ownsFx(br2), false, 'once: a later break without its official effect keeps the stand-in');
    // 远眺 killed (not silenced): enemy_hummbd_t's death effect instead of the 2D ring
    views.set(7, { id: 7, x: 7, y: 0, alive: false, info: { id: 7, side: 'enemy', defId: 'enemy_1407_hummbd' } });
    const ex = ['fx', 'explode', 7, 0, { x: 7, y: 0, r: 1, kind: 'expose', id: 7 }];
    layer.onEvent(ex, views);
    assert.deepEqual(got(), ['enemy_hummbd_die_02']);
    assert.equal(layer.ownsFx(ex), true);
  } finally { globalThis.fetch = fetch0; }
});

test('fxgame.js (2026-10-24, 묶음 S3): the moments a \'dmg\' / \'heal\' names play on their owner\'s target, a timed slot per attacker', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const plays = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', trace: (p) => plays.push(p) });
    await settle();
    const unit = (id, defId, side = 'ally') => ({ id, x: id, y: 0, alive: true, info: { id, side, defId, skillIndex: 0 } });
    const views = new Map([[1, unit(1, 'char_381_bubble')], [2, unit(2, 'char_1012_skadi2')], [3, unit(3, 'char_1020_reed2')],
      [4, unit(4, 'char_1032_excu2')], [5, unit(5, 'char_4042_lumen')], [6, unit(6, 'char_285_medic2')], [9, unit(9, 'enemy_1007_slime', 'enemy')]]);
    const got = () => plays.splice(0).filter((p) => p.kind === 'spawn').map((p) => `${p.names[0]}@${p.on}`).sort();
    // 泡泡 T1: the hit she takes from 9 → the debuff on 9, one slot per attacker (a second hit keeps it)
    layer.onEvent(['dmg', 1, 50, 'phys', 0, 9, 0, null, [['bubble_t_1[atk_down]', 1, 5]]], views);
    assert.deepEqual(got(), ['bubble_talent_buff@9']);
    layer.onEvent(['dmg', 1, 50, 'phys', 0, 9, 0, null, [['bubble_t_1[atk_down]', 1, 5]]], views);
    assert.deepEqual(got(), [], 'kept (its life runs from the latest hit)');
    // 浊心斯卡蒂 S1: the protected ally's hit → _hit on her, _hit_02 on the ally
    layer.onEvent(['dmg', 6, 80, 'phys', 0, 9, 0, null, [['skadi2_s_1[protect]', 2]]], views);
    assert.deepEqual(got(), ['skadi2_skill_01_hit@2', 'skadi2_skill_01_hit_02@6']);
    // 焰影苇草: the trait heal on the ally, 映耀's share on her
    layer.onEvent(['heal', 6, 40, 3, [['trait', 3]]], views);
    layer.onEvent(['heal', 3, 10, 3, [['reed2_t_2', 3]]], views);
    assert.deepEqual(got(), ['reed2_treat_01@3', 'reed2_treat_01@6']);
    // 圣约送葬人 S3's mark on the enemy; another operator's key of the same name plays nothing of hers
    layer.onEvent(['dmg', 9, 300, 'phys', 0, 4, 0, 0, [['excu2_s_3[mark]', 4]]], views);
    layer.onEvent(['dmg', 9, 300, 'phys', 0, 1, 0, 0, [['excu2_s_3[mark]', 1]]], views);
    assert.deepEqual(got(), ['excu2_skill_03_aim_01@9']);
    // 流明 T2: the emergency flash on the ally she heals (lumen_t_2[listener]'s BUFF_OWNER)
    layer.onEvent(['fx', 'emergency', 6, 0, { x: 6, y: 0, id: 6, src: 5 }], views);
    assert.deepEqual(got(), ['lumen_buff_01_hit@6']);
  } finally { globalThis.fetch = fetch0; }
});

test('fxgame.js (2026-10-24, 묶음 S6): moments behind a condition the sim decided — the target\'s flight, a slot per enemy', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const plays = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', trace: (p) => plays.push(p) });
    await settle();
    const unit = (id, defId, side = 'ally', flying = false) => ({ id, x: id, y: 0, alive: true, flying, info: { id, side, defId, skillIndex: 0 } });
    const views = new Map([[1, unit(1, 'char_4211_snhunt')], [2, unit(2, 'char_4026_vulpis')], [3, unit(3, 'char_494_vendla')],
      [4, unit(4, 'char_4132_ascln')], [6, unit(6, 'char_285_medic2')], [8, unit(8, 'enemy_1106_byd_flyb', 'enemy', true)],
      [9, unit(9, 'enemy_1007_slime', 'enemy')]]);
    const got = () => plays.splice(0).filter((p) => p.kind === 'spawn').map((p) => `${p.names[0]}@${p.on}`).sort();
    // 雪猎 T1 裂云兽: _hit_02 on a flying target, _hit on a ground one
    layer.onEvent(['dmg', 8, 200, 'phys', 0, 1, 0, null, [['snhunt_t[effect]', 1]]], views);
    layer.onEvent(['dmg', 9, 200, 'phys', 0, 1, 0, null, [['snhunt_t[effect]', 1]]], views);
    assert.deepEqual(got(), ['snhunt_talent_01_hit@9', 'snhunt_talent_01_hit_02@8']);
    // 忍冬 T1 追凶: vulpis_buff_01 renewed on each addition — one slot per enemy
    layer.onEvent(['dmg', 9, 30, 'arts', 0, 2, 0, null, [['vulpis_t_1[vfx]', 2, 10]]], views);
    layer.onEvent(['dmg', 9, 30, 'arts', 0, 2, 0, null, [['vulpis_t_1[vfx]', 2, 10]]], views);
    layer.onEvent(['dmg', 8, 30, 'arts', 0, 2, 0, null, [['vulpis_t_1[vfx]', 2, 10]]], views);
    assert.deepEqual(got(), ['vulpis_buff_01@8', 'vulpis_buff_01@9']);
    // 刺玫's trait heal on the ally; 阿斯卡纶 S2 on the enemy its blow felled
    layer.onEvent(['heal', 6, 40, 3, [['trait', 3]]], views);
    layer.onEvent(['dmg', 9, 500, 'phys', 0, 6, 0, null, [['ascln_s_2[enemy]', 4]]], views);
    assert.deepEqual(got(), ['ascln_skill_02_death_01@9', 'vendla_attack_hit_02@6']);
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

test('歌蕾蒂娅 S3: glady_s3[effect]\'s glady_skill_03_buff on the target the kit binds (`tgt`), for the skill', { skip: !LOCAL_ROWS && 'the key\'s row is a client-only row' }, () => {
  const plan = kitOfficialPlan('tornado', { id: 1, tgt: 2 }, 'glady', { skill: 2, plays: PLAYS });
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

test('a `tpl` play: the key\'s held prefabs for its life (or the key\'s LIMITED seconds), its once prefabs, its end with life unit', () => {
  const plays = { keys: { a: { held: ['a_buff'], once: ['a_start'], end: ['a_end'] }, b: { held: ['b_buff'], once: [], end: [], lim: 3 } } };
  assert.deepEqual(tplPlays({ tpl: 'a', on: 'id', life: 'unit' }, plays), [
    { on: 'id', n: 'a_buff', life: 'unit', end: 'a_end' }, { on: 'id', n: 'a_start', life: 'once' },
  ]);
  assert.deepEqual(tplPlays({ tpl: 'a', on: 'op', life: 'skill' }, plays), [{ on: 'op', n: 'a_buff', life: 'skill' }, { on: 'op', n: 'a_start', life: 'once' }]);
  assert.deepEqual(tplPlays({ tpl: 'b', on: 'op' }, plays), [{ on: 'op', n: 'b_buff', life: 3 }]);
  assert.deepEqual(tplPlays({ tpl: 'c', on: 'op' }, plays), [], 'a key the file lacks plays nothing');
  assert.deepEqual(tplPlays({ tpl: 'a', on: 'op' }, null), [], 'no file');
  assert.deepEqual(kitOfficialPlan('talent', { id: 1, name: 'extradition' }, 'lemuen', { plays: null }).play, [], 'the event keeps its stand-in');
});

test('the plans by client key play what their hand prefabs played (묶음 K2: the effect event golden does not move)', { skip: !LOCAL_ROWS && 'needs the client-only rows' }, () => {
  const p = (ev, o, b, c = {}) => kitOfficialPlan(ev, o, b, { ...c, plays: PLAYS }).play;
  assert.deepEqual(p('shield', { id: 1, duration: 12 }, 'agoat2'), [{ on: 'op', life: 12, n: 'agoat2_skill_02_range_01' }]);
  assert.deepEqual(p('summon', { id: 4, token: 'token_10058_sbell2_icetgt' }, 'sbell2'), [{ on: 'id', life: 'unit', n: 'sbell2_tile_frozen', end: 'sbell2_tile_defrost' }]);
  assert.deepEqual(p('kalts2Takeoff', { id: 1, picks: [2] }, 'kalts2'), [{ on: 'picks', n: 'kalts2_skill_03_teleport_02', life: 'once' }]);
  assert.deepEqual(p('reborn', { id: 1 }, 'etlchi'), [{ on: 'op', life: 3, n: 'etlchi_innate_hit_01' }]);
});
