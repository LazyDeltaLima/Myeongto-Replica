// test/render/kit-event-fx.test.js — what an operator with official effects draws for each kit 'fx' event whose procedural
// stand-in fxgame.js standInOff drops (2026-10-16, docs/rules/fx.md 「키트 이벤트의 공식 이펙트」). Every such event of every
// kit has a verdict here or a rule in render/fx/kitofficial.js, so a new kit event cannot silently draw nothing; the rules'
// plans follow the client's buff templates (config/buff_template_holder.ab).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fxSpec } from '../../public/js/render/fx/kinds.js';
import { KIT_OFFICIAL, kitOfficialPlan, kitOperator } from '../../public/js/render/fx/kitofficial.js';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GAME = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));
const KITS = path.join(ROOT, 'server/sim/content/kits');
const STAND_IN = new Set(/const STAND_IN = new Set\(\[([^\]]+)\]/.exec(GAME)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1)));

/**
 * Verdict per kit event and the bundle of the kit that sends it ('*': a shared kit):
 *   ['skill', n]  sent as skill n starts / acts: that skill's own bindings (modes.json skills[n − 1]) draw the moment
 *   ['attack']    an attack's hit: the attack bindings draw it
 *   ['none', …]   the client creates no effect there
 *   ['covered', …] another event of the same moment draws it
 *   ['standIn', …] the event's unit is no operator with official effects (a token, an enemy): its stand-in stays
 *   ['pending', …] not judged yet (the maintainer's open list)
 */
const VERDICT = {
  airstrike: { angel2: ['pending', 'S3 / talent strike: the coordinate token and angel2_skill_3_ground_01'] },
  appear: { angel2: ['covered', "the redeployed operator's own 'deploy' effect [추정]"] },
  bloodBattle: { bldsk: ['skill', 2] },
  burst: { oblvns: ['pending', 'a note hit (her note projectiles)'], wisdel: ['standIn', 'sent by her 残影 token'] },
  cleanse: { '*': ['pending', 'the bond cleanse'] },
  copy: { mlyss: ['pending', 'the 流形 token switch effects (summons)'] },
  dilemma: { mizuki: ['skill', 2] },
  ember: { surtr: ['pending', 'T2 余烬'], reed2: ['pending', 'S2 fireballs on allies (_mainEffect / _coolDownEffect)'] },
  explosion: { lionhd: ['skill', 2] },
  extraAttack: { excu2: ['pending', 'T1 extra shot: excu2_passive[effect]'] },
  flame: { flamtl: ['skill', 3] },
  frostNova: { gnosis: ['skill', 2], sbell2: ['pending', 'snow tiles: sbell2_ground_01–03 (_effectSettings)'] },
  healField: { plosis: ['skill', 2], lumen: ['pending', 'S1 heal field: lumen_skill_01_ranges'] },
  iceSpike: { gnosis: ['skill', 3], sntlla: ['pending', 'S2 icicles'] },
  jungleSoul: { gvial2: ['skill', 3] },
  knack: { reckpr: ['skill', 2] },
  meltdown: { blaze2: ['standIn', "sent on the enemy (the burn burst's own effect; blaze2_t_1 creates none)"] },
  mote: { cetsyr: ['pending', 'S1 start draws its skill; the motes on allies / enemies (T1, S3) are open'] },
  obelisk: { beewax: ['standIn', 'sent by her token'] },
  overclock: { cathy: ['skill', 2], hsguma: ['skill', 3] },
  overload: { rockr: ['pending', 'S2 overload: the drones (_overloadIdleEffect, rockr_stun_01/02)'], rmixer: ['skill', 2], gvial2: ['skill', 2] },
  pulse: { mlyss: ['standIn', 'sent by the 流形 token (summons)'] },
  reborn: { etlchi: ['pending', 'T2 重盈'] },
  redistribute: { cetsyr: ['pending', 'S3 (its skill bindings are empty)'] },
  reweave: { cetsyr: ['pending', 'S2 / S3 start (their skill bindings are empty)'] },
  ripple: { mostma: ['skill', 3], mizuki: ['skill', 3] },
  rockfall: { mudrok: ['pending', 'S3 wake-up: when skills[2].cast (awake) plays'] },
  rockslide: { mudrok: ['skill', 2] },
  saltWard: { rosesa: ['skill', 2] },
  sermon: { rmixer: ['skill', 3] },
  shell: { billro: ['pending', 'billro_s_N[eff_cond] half / full charge buffs (her skill bindings are empty)'] },
  shockBlast: { nymph: ['skill', 2] },
  sleepGuard: { titi: ['pending', 'S3 (its skill bindings are empty): titi_s_3 line / ticker'] },
  snow: { svrash: ['skill', 2], sbell2: ['pending', 'snow tiles: sbell2_ground_01–03 (_effectSettings)'] },
  sonic: { akkord: ['skill', 2] },
  splash: { blaze2: ['attack'] },
  split: { mlyss: ['standIn', 'sent by the 流形 token (summons)'] },
  sword: { qiubai: ['skill', 2] },
  talent: { lemuen: ['pending', 'T2 buff lemuen_talent_buff_02'], whitw2: ['pending', 'T1 stages'] },
  tornadoPulse: { glady: ['pending', 'S3 tornado ticks'] },
  truesilver: { svrash: ['skill', 3] },
  undying: { nearl2: ['none', 'module 骑士家族 nearl2_e_003_tr creates no effect (nearl2_buff_01_start is S3 combo_effect)'] },
  wake: { glady: ['skill', 2], titi: ['pending', 'S3 waking hits'] },
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
const silenced = () => kitEvents().filter(([n]) => STAND_IN.has(fxSpec(n, {}).a) && !new RegExp(`'${n}'`).test(GAME));
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

test("a 'skill' verdict names a skill whose own bindings draw something", () => {
  for (const [n, by] of Object.entries(VERDICT)) {
    for (const [b, v] of Object.entries(by)) {
      if (v[0] !== 'skill') continue;
      const s = MODES[charOf(b)]?.skills?.[v[1] - 1];
      assert.ok(s && ['cast', 'castLoop', 'buff', 'target', 'targetBuff'].some((r) => s[r]?.length), `${n} (${b}): S${v[1]} binds nothing`);
    }
  }
});

test('the rules name prefabs the client binds for that operator', () => {
  // each rule's prefab belongs to its operator's bundle (a typo plays nothing); the names come from the buff templates
  for (const [n, by] of Object.entries(KIT_OFFICIAL)) {
    for (const [b, rule] of Object.entries(by)) {
      assert.equal(typeof rule, 'function');
      const plans = [{ skill: 0 }, { skill: 1 }, { skill: 2, back: true }].map((ctx) => kitOfficialPlan(n, { left: 0, t: 2, id: 1, of: 2 }, b, ctx)).filter(Boolean);
      assert.ok(plans.length, `${n} (${b}) plans nothing`);
      for (const plan of plans) for (const p of plan.play) assert.ok(p.n.startsWith(`${b}_`), `${n} (${b}): ${p.n}`);
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
  // 泥岩: only the last layer's break
  assert.deepEqual(names(kitOfficialPlan('shieldBreak', { id: 1, left: 0 }, 'mudrok')), ['mudrok_buff_01_end']);
  assert.deepEqual(names(kitOfficialPlan('shieldBreak', { id: 1, left: 2 }, 'mudrok')), []);
  // 伊内丝: a new sentry replaces the old one; her recall ('beam') ends it and keeps its own stand-in
  const s = kitOfficialPlan('sentry', { id: 1 }, 'ines');
  assert.deepEqual(s.stop, ['inesSentry']);
  assert.deepEqual(s.play.map((x) => [x.n, x.on, x.life]), [['ines_label_start_01', 'point', 'once'], ['ines_label_01', 'point', 'tag'], ['ines_range_01', 'point', 'tag']]);
  assert.deepEqual(kitOfficialPlan('beam', { id: 1 }, 'ines'), { stop: ['inesSentry'], play: [], pass: true });
  // 烛煌: downed loops until she stands (and gone with her), then the end cast
  const dn = kitOfficialPlan('downed', { id: 1 }, 'blaze2');
  assert.ok(dn.pass && dn.play.every((x) => x.tag === 'blazeDown' && x.leave));
  assert.deepEqual(kitOfficialPlan('revive', { id: 1 }, 'blaze2'), { stop: ['blazeDown'], play: [{ n: 'blaze2_revive_end_start', on: 'op', life: 'once' }], pass: false });
  // on the event's unit: 阿罗玛's landing hit, 妮芙's burst mark for `t`, 隐德来希's candle + its line to the copied enemy
  assert.deepEqual(kitOfficialPlan('splash', { id: 5, src: 1 }, 'aroma').play, [{ n: 'aroma_skill_02_hit_02', on: 'id', life: 'once' }]);
  assert.deepEqual(kitOfficialPlan('soul', { id: 5, src: 1, t: 7 }, 'nymph').play, [{ n: 'nymph_talent_buff_01', on: 'id', life: 7 }]);
  assert.deepEqual(kitOfficialPlan('candle', { id: 5, of: 6, src: 1 }, 'etlchi').play[1], { n: 'etlchi_skill_03_line_01', line: ['of', 'id'] });
  assert.equal(kitOfficialPlan('candle', { id: 5 }, null), null);
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
});

const files = { '/assets/local/fx/index.json': { bundles: { horn: ['horn_buff_01_convert_start', 'horn_skill_02_buff_03_front'], ines: ['ines_label_01'] } } };
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
