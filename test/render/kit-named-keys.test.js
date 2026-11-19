// test/render/kit-named-keys.test.js — a client key a kit names plays without a hand table row (docs/rules/fx.md 「클라 키로 재생」):
// a 'hit' moment (kitofficial.js momentPlan), a status named after its key (fxstatus.js namedSpec), both from
// tools/build-fx-plays.mjs (`moment`, `b`).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildPlays, kitMomentKeys, kitNamedKeys, momentOf, bindingRows, stripComments, PLAYS_FILE } from '../../tools/build-fx-plays.mjs';
import { KIT_OFFICIAL, kitOfficialPlan } from '../../public/js/render/fx/kitofficial.js';
import { KEY_FX, syncStatusFx, wantedStatusFx, wornPrefabs } from '../../public/js/render/fxstatus.js';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { kitOwned, wiringReport, prefabLinks } from '../../tools/fx-wiring-report.mjs';

const row = (key, fx, moment, target, conds = []) => ({ key, src: 'template', moment, kind: 'effect', fx, target, life: '', conds });

test('momentOf: one prefab on the unit hit, or a hand plan', () => {
  assert.equal(momentOf('a', [row('a', 'x_hit', 'ON_BUFF_TRIGGER', 'BUFF_OWNER')]), 'x_hit');
  assert.equal(momentOf('a', [row('a', 'x_hit', 'ON_TAKE_DAMAGE', 'MODIFIER_TARGET', ['Dice'])]), 'x_hit', 'its condition is the sim\'s');
  assert.equal(momentOf('a', [row('a', 'x_hit', 'ON_BUFF_START', 'TARGET'), row('a', 'x_hit', 'ON_BUFF_START', 'TARGET', ['Dice'])]), 'x_hit');
  assert.equal(momentOf('a', [row('a', 'x_1', 'ON_BUFF_START', 'TARGET'), row('a', 'x_2', 'ON_BUFF_START', 'TARGET')]), null, 'two prefabs: the rows leave it open');
  assert.equal(momentOf('a', [row('a', 'x_1', 'ON_TAKE_DAMAGE', 'BUFF_SOURCE'), row('a', 'x_2', 'ON_TAKE_DAMAGE', 'BUFF_OWNER')]), null, 'one on the giver');
  assert.equal(momentOf('a', [row('a', 'x_1', 'ON_OUTPUT_MODIFIER', 'BUFF_OWNER')]), null, 'the owner of an output buff deals the hit');
  assert.equal(momentOf('a', [{ ...row('a', 'x_1', 'ON_BUFF_START', 'TARGET'), kind: 'buff' }]), null, 'a buff lasts: no moment');
  assert.equal(momentOf('a', [row('a', 'x_1', 'ON_BUFF_START', 'BUFF_OWNER'), { ...row('a', 'x_2', '_buffs', 'OWNER'), kind: 'buff' }]), null, 'the buff has an effect of its own');
  assert.equal(momentOf('b', [row('a', 'x_1', 'ON_BUFF_START', 'TARGET')]), null);
  const index = { bundles: { x: ['x_1'] } };
  assert.equal(momentOf('a', [row('a', 'x_1', 'ON_BUFF_START', 'TARGET'), row('a', 'y_2', 'ON_BUFF_START', 'TARGET')], index), 'x_1', 'prefabs not extracted do not count');
});

test('kitNamedKeys: the kits\' string literals that are keys, not comments, operators or skills', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'kit-keys-'));
  try {
    mkdirSync(path.join(dir, 'ops'));
    writeFileSync(path.join(dir, 'ops', 'op-x.js'), [
      "// 'x_t_1[comment]' in a line comment", "/* 'x_t_1[block]' */",
      "battle.dealDamage(u, t, { moment: 'x_t_1[moment]' }); // 'x_t_1[tail]'",
      "const key = 'x_s_2[buff]', other = 'not_a_row', sk = 'skchr_x_1', c = 'char_1_x', st = 'stun';",
    ].join('\n'));
    const rows = ['x_t_1[comment]', 'x_t_1[block]', 'x_t_1[tail]', 'x_t_1[moment]', 'x_s_2[buff]', 'skchr_x_1', 'char_1_x', 'stun'].map((k) => ({ key: k }));
    assert.deepEqual(kitNamedKeys(rows, dir), ['x_s_2[buff]', 'x_t_1[moment]']);
    const tables = { template: [row('x_t_1[moment]', 'x_hit', 'ON_BUFF_TRIGGER', 'BUFF_OWNER'),
      { ...row('x_s_2[buff]', 'x_buff', '_buffs', 'OWNER'), kind: 'buff', life: 'LIMITED:@duration' }], local: null, index: { bundles: { x: ['x_hit', 'x_buff'] } } };
    const { keys } = buildPlays(tables, dir);
    assert.deepEqual([keys['x_t_1[moment]'].b, keys['x_t_1[moment]'].moment], ['x', 'x_hit']);
    assert.deepEqual([keys['x_s_2[buff]'].b, keys['x_s_2[buff]'].held], ['x', ['x_buff']]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const PLAYS = { keys: {
  'x_t_1': { held: [], once: [], end: [], b: 'x', moment: 'x_hit' },
  'x_s_2[buff]': { held: ['x_buff'], once: [], end: [], b: 'x' },
  'x_s_3[cond]': { held: [], once: [], end: [], b: 'x', when: [{ role: 'held', n: 'x_cond', if: ['Dice'] }] },
  'cited_only': { held: ['y_buff'], once: [], end: [] },
} };

test("a 'hit' moment with no rule plays its one prefab on the unit hit; a rule comes first", () => {
  const plan = kitOfficialPlan('hit', { k: 'x_t_1', id: 5 }, 'x', { plays: PLAYS });
  assert.deepEqual(plan.play.map((p) => [p.n, p.on, p.life]), [['x_hit', 'id', 'once']]);
  assert.equal(kitOfficialPlan('hit', { k: 'x_t_1', id: 5 }, 'other', { plays: PLAYS }), null, 'another operator\'s key');
  assert.equal(kitOfficialPlan('hit', { k: 'x_t_1', id: 5 }, 'x', {}), null, 'no plays file');
  assert.equal(kitOfficialPlan('hit', { k: 'cited_only', id: 5 }, 'x', { plays: PLAYS }), null);
  assert.equal(kitOfficialPlan('stacks', { k: 'x_t_1', id: 5 }, 'x', { plays: PLAYS }), null, 'only the moments');
  const hand = kitOfficialPlan('hit', { k: 'bubble_t_1[atk_down]', by: 4, life: 5 }, 'bubble', { plays: { keys: { 'bubble_t_1[atk_down]': { b: 'bubble', moment: 'wrong' } } } });
  assert.deepEqual(hand.play.map((p) => p.n), ['bubble_talent_buff']);
});

// The client rows (public/assets/local/fx/bindings.json, git-ignored) settle some keys the template rows alone answer
// otherwise (a template CreateEffect key the operator's binding replaces): without them there is nothing to compare.
const NO_CLIENT_ROWS = !bindingRows().local && 'needs the client binding rows (extracted locally)';

test('every moment the rows answer agrees with its hand plan: the rule reads the rows as those plans do', { skip: NO_CLIENT_ROWS }, () => {
  const { template, local } = bindingRows();
  const rows = [...template, ...(local || [])];
  const compared = [];
  for (const [bundle, rule] of Object.entries(KIT_OFFICIAL.hit)) {
    for (const k of new Set(rows.map((r) => r.key))) {
      let hand;
      try { hand = rule({ k, id: 1, src: 2, by: 3, life: 5 }, { skill: 0, back: false, foe: false }); } catch { continue; }
      const once = hand?.play?.filter((p) => p.life === 'once') ?? [];
      if (!once.length) continue;
      const auto = momentOf(k, rows);
      if (!auto) continue;
      compared.push(k);
      assert.ok(once.some((p) => p.n === auto), `${bundle} ${k}: the rows give ${auto}, its plan ${once.map((p) => p.n)}`);
      for (const p of once.filter((q) => q.n === auto)) assert.ok(['id', 'op'].includes(p.on), `${k}: on ${p.on}`);
    }
  }
  assert.ok(compared.length >= 10, `compared ${compared.length}`);
});

const held = (statuses, plays = PLAYS) => [...wantedStatusFx({ flags: 0, isEnemy: false, statuses: new Set(statuses), statusFrom: new Map() }, new Map(), null, plays).keys()];

test('a status named after a key a kit names draws what the buff holds, without a table row', () => {
  assert.deepEqual(held(['x_s_2[buff]']), ['x/x_buff']);
  assert.deepEqual(held(['x_s_2[buff]:12']), ['x/x_buff'], 'one per applier');
  assert.deepEqual(held(['x_s_3[cond]']), ['x/x_cond'], 'behind conditions: the sim gave the buff');
  assert.deepEqual(held(['cited_only']), [], 'a key only a hand table cites');
  assert.deepEqual(held(['talent:unknown']), []);
  assert.deepEqual(held(['x_s_2[buff]'], null), [], 'no plays file');
  assert.deepEqual(held(['stun']), ['stun'], 'the catalogue status');
  assert.deepEqual(held(['talent:demetr:means'], { keys: { 'talent:demetr:means': { held: ['other'], b: 'other' }, 'demetr_t1[def_dec_core]': { held: ['demetr_buff_01'], once: [], end: [] } } }), ['demetr/demetr_buff_01'], 'a KEY_FX row comes first');
});

test('a status named after its client key draws what the same buff\'s KEY_FX row draws', () => {
  const plays = buildPlays();
  const compared = [];
  for (const [status, spec] of Object.entries(KEY_FX)) {
    const t = Array.isArray(spec) ? spec[1] : null;
    if (!t?.tpl || spec[2] !== 'own' || !plays.keys[t.tpl]) continue;
    const named = { keys: { ...plays.keys, [t.tpl]: { ...plays.keys[t.tpl], b: spec[0] } } };
    const hand = held([status], named);
    if (!hand.length) continue;
    compared.push(t.tpl);
    assert.deepEqual(held([t.tpl], named).sort(), hand.sort(), `${status} = ${t.tpl}`);
  }
  if (plays.keys['logos_t_2[core]']?.held?.length) assert.ok(compared.length >= 5, `compared ${compared.length}`);
});

test('the wiring report: prefabs nothing reaches, and a drawn prefab the name rule also plays', () => {
  const modes = { char_1_x: { modes: [], skills: [{}, {}, {}] } };
  const tables = { template: [{ key: 'x_s_1', fx: 'x_skill_01_buff', moment: '_buffs', target: 'OWNER', kind: 'buff' }], local: null,
    index: { bundles: { x: ['x_skill_01_buff', 'x_orphan', 'x_emitted', 'x_named'] }, emitted: { x: ['x_emitted'] } } };
  const hand = [{ table: 'KEY_FX', entry: 'x:buff', src: ['x_s_1'], plays: [{ n: 'x_skill_01_buff', life: 'held' }] }];
  const r = wiringReport({ tables, modes, hand, names: new Set(['x_named']) }).x;
  assert.equal(r.char, 'char_1_x');
  assert.deepEqual(r.nameless, ['x_orphan']);
  assert.deepEqual(r.overlap.map((o) => [o.fx, o.skill, o.tables]), [['x_skill_01_buff', 1, ['KEY_FX x:buff']]]);
  const quiet = wiringReport({ tables, modes, hand, owned: new Set(['x_skill_01_buff']) }).x;
  assert.deepEqual(quiet.overlap, [], 'KIT_OWNED silences the name rule');
  assert.deepEqual(wiringReport({ tables, modes, hand, names: new Set(['x_named']), linked: new Set(['x_orphan']) }).x.nameless, [], 'another prefab starts it');
  assert.deepEqual([...prefabLinks({ right: 'a', back: { effect: 'b' }, swFace: { down: 'c', oneShot: 1 }, rgroup: { pick: ['d'] }, three: { up: 'e', start: 1 }, equipFx: { hooks: [['u', 1, 'f']] }, sms: [{ states: [{ name: 'g' }] }], lineDyn: { end: 'h' } })].sort(), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
});

test('the wiring report reads KIT_OWNED from fxgame.js', () => {
  const owned = kitOwned();
  assert.ok(owned.has('yu_skill3_range_01') && owned.has('oxi_buff_03') && owned.size > 50);
  assert.ok(!owned.has('2026-10-11'), 'not its comments');
});

test('kitMomentKeys: a key handed over as a moment, not a buff the unit wears', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'kit-moments-'));
  try {
    writeFileSync(path.join(dir, 'op-x.js'), [
      "battle.heal(u, u, 1, { self: true, moment: 'x_a' });",
      "const moment = hit ? 'x_b' : 'x_c';",
      "dmg.moment ||= 'x_d';",
      "battle.hitFx(e, 'x_e', unit, 3);",
      "battle.fx('kitHit', { id: u.id, k: 'x_f' });",
      "battle.fx('stacks', { id: u.id, buff: 'x_g', n: 1 });",
      "battle.addBuff(u, { key: 'x_h', visible: true }); // moment: 'x_i'",
      "const KEYS = ['x_j']; battle.removeBuff(u, 'x_k');",
    ].join('\n'));
    const rows = 'abcdefghijk'.split('').map((c) => ({ key: `x_${c}` }));
    assert.deepEqual(kitMomentKeys(rows, dir), ['x_a', 'x_b', 'x_c', 'x_d', 'x_e', 'x_f', 'x_g']);
    const tables = { template: [{ ...row('x_h', 'x_worn', '_buffs', 'OWNER'), kind: 'buff' }, { ...row('x_a', 'x_not', '_buffs', 'OWNER'), kind: 'buff' }], local: null,
      index: { bundles: { x: ['x_worn', 'x_not'] } } };
    const { keys } = buildPlays(tables, dir);
    assert.equal(keys.x_h.worn, true);
    assert.equal(keys.x_a.worn, undefined, 'held by the rows, but the kit only sends its moment');
    assert.deepEqual([...wornPrefabs({ keys })], ['x_worn']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('wornPrefabs: a held prefab of a worn key, behind conditions too; no plays, none', () => {
  const plays = { keys: { a: { held: ['a_buff'], b: 'a', worn: true }, c: { held: [], when: [{ role: 'held', n: 'c_buff' }, { role: 'once', n: 'c_hit' }], b: 'c', worn: true }, d: { held: ['d_buff'], b: 'd' } } };
  assert.deepEqual([...wornPrefabs(plays)].sort(), ['a_buff', 'c_buff']);
  assert.equal(wornPrefabs(plays), wornPrefabs(plays), 'kept per document');
  assert.equal(wornPrefabs(null).size, 0);
});

test('a skill does not start a prefab its kit\'s status draws: the status alone, once (바이슨 S2)', async () => {
  const files = {
    '/assets/local/fx/index.json': { bundles: { x: ['x_skill_02_buff', 'x_skill_02_buff_02', 'x_skill_02_range'] } },
    '/assets/local/fx/modes.json': { char_1_x: { modes: ['Default'], skills: [{}, {}, {}] } },
    '/assets/local/fx/plays.json': { keys: {
      'x_s_2[self]': { held: ['x_skill_02_buff_02'], once: [], end: [], b: 'x', worn: true },
      'x_s_2[ally]': { held: ['x_skill_02_buff'], once: [], end: [], b: 'x', worn: true },
    } },
    '/assets/local/fx/enemy-index.json': { bundles: {} },
    '/assets/local/fx/enemy-modes.json': { $fx: {} },
  };
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(`${p.kind}:${p.names.join('+')}`) });
    await new Promise((r) => setTimeout(r, 10));
    const v = { id: 1, x: 0, y: 0, alive: true, flags: 0, statuses: new Set(['x_s_2[self]']), info: { id: 1, side: 'ally', defId: 'char_1_x', spine: 'char_1_x', skillIndex: 1 } };
    const views = new Map([[1, v]]);
    layer.onEvent(['skill', 1, 1], views);
    syncStatusFx(views, layer, {});
    await new Promise((r) => setTimeout(r, 10));
    syncStatusFx(views, layer, {});
    assert.deepEqual(seen.filter((s) => s.includes('buff')), ['status:x_skill_02_buff_02'], 'its copy of the name rule gone, the ally\'s not on the caster');
    assert.ok(seen.some((s) => s.includes('x_skill_02_range')), 'the rest of the skill stays');
  } finally { globalThis.fetch = fetch0; }
});

test('the wiring report: a named key\'s prefab the name rule also plays', () => {
  const modes = { char_1_x: { modes: [], skills: [{}, {}, {}] } };
  const tables = { template: [], local: null, index: { bundles: { x: ['x_skill_01_buff'] } } };
  const plays = { keys: { x_k: { held: ['x_skill_01_buff'], once: [], end: [], b: 'x' }, other: { held: ['x_skill_01_buff'], once: [], end: [] } } };
  const r = wiringReport({ tables, modes, plays }).x;
  assert.deepEqual(r.overlap.map((o) => [o.fx, o.tables]), [['x_skill_01_buff', ['named key x_k']]]);
});

test('the kits as they are: buffs worn, moments not', { skip: !existsSync(PLAYS_FILE) && 'needs the extracted effects' }, () => {
  const { keys } = JSON.parse(readFileSync(PLAYS_FILE, 'utf8'));
  for (const k of ['bison_s_2[self]', 'bison_s_2[ally]', 'nothin_s_2[a]', 'nothin_s_2[b]', 'nothin_s_2[c]', 'nothin_t_1', 'nothin_t_1[eff]', 'oxi_s_2_stack']) assert.equal(keys[k]?.worn, true, k);
  for (const k of ['gvial2_s_1', 'bubble_t_1[atk_down]', 'excu2_s_3[mark]', 'indigo_s_2[damage]', 'oxi_t_1_arcane_stack', 'vulpis_t_1[vfx]']) assert.equal(keys[k]?.worn, undefined, k);
});

describe('the kit source scanner (build-fx-plays.mjs)', () => {
  const kitDir = (src) => {
    const d = mkdtempSync(path.join(tmpdir(), 'kit-scan-'));
    writeFileSync(path.join(d, 'op-x.js'), src);
    return d;
  };
  const rows = ['x_s2[held]', 'x_s2[hit]', 'x_s2[buff]', 'x_s2[lost]'].map((key) => row(key, 'x_fx', 'ON_BUFF_START', 'OWNER'));

  test('stripComments: a path with a star in a line comment opens nothing; strings and regular expressions stay', () => {
    assert.equal(stripComments("// Modes/*/Body\nconst A = 'a'; /** doc */ const B = 'b';\n").trim(), "const A = 'a';  const B = 'b';");
    assert.equal(stripComments("const u = 'http://x'; // gone\n"), "const u = 'http://x'; \n");
    assert.equal(stripComments('const q = "/* not one */";'), 'const q = "/* not one */";');
    assert.equal(stripComments('const r = /\\/*x/.test(s); // gone'), 'const r = /\\/*x/.test(s); ');
    assert.equal(stripComments('const d = a / b; // gone'), 'const d = a / b; ');
    assert.equal(stripComments('const t = `a//b`;'), 'const t = `a//b`;');
    assert.equal(stripComments('/* a */ x /* b */'), ' x ');
  });

  test('a kit whose header comment holds `/*` keeps the keys below it (우쿠시크: its plays went missing)', () => {
    const d = kitDir("// charpack (Modes/*/Body/Talents/1)\nconst HELD = 'x_s2[held]';\n/** a doc comment closes the old pattern's match */\nconst LATER = 'x_s2[lost]';\n");
    try {
      assert.deepEqual(kitNamedKeys(rows, d), ['x_s2[held]', 'x_s2[lost]']);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  test('a moment handed over by a constant counts as a moment, not as a buff it wears', () => {
    const d = kitDir("const HIT = 'x_s2[hit]', OTHER = 'x_s2[buff]';\nb.heal(u, x, 1, { moment: HIT });\nb.fx('kitHit', { k: OTHER });\nb.addBuff(u, { key: 'x_s2[held]' });\n");
    try {
      assert.deepEqual(kitMomentKeys(rows, d), ['x_s2[buff]', 'x_s2[hit]']);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});

describe('fx-wiring-report keyless', () => {
  const tables = {
    template: [{ key: 'x_s2[camo]', src: 'template', moment: 'ON_BUFF_TRIGGER', kind: 'buff', fx: 'x_skill_02_buff_01', target: 'BUFF_OWNER' }],
    local: [], index: { bundles: { x: ['x_skill_02_buff_01'] }, emitted: {} },
  };

  test('a template row\'s prefab whose key no kit names is told, though a name rule reaches the prefab', () => {
    const r = wiringReport({ tables, modes: {}, plays: { keys: {} }, patterns: [/_skill_/] });
    assert.deepEqual(r.x.keyless, [{ key: 'x_s2[camo]', fx: 'x_skill_02_buff_01', moment: 'ON_BUFF_TRIGGER' }]);
    assert.deepEqual(r.x.unplayed, []);
  });

  test('named by a kit, or drawn by a hand table: nothing to tell', () => {
    const named = wiringReport({ tables, modes: {}, plays: { keys: { 'x_s2[camo]': { b: 'x', held: [], once: [], end: [] } } }, patterns: [/_skill_/] });
    assert.equal(named.x, undefined);
    const hand = wiringReport({ tables, modes: {}, plays: { keys: {} }, patterns: [/_skill_/], hand: [{ table: 'T', entry: 'e', plays: [{ n: 'x_skill_02_buff_01' }] }] });
    assert.equal(hand.x, undefined);
  });
});

test('the report names a row\'s prefab extracted nowhere, of an operator whose bundle is (矩 S1\'s totter_skill_01_* went unseen)', () => {
  const row = (fx, char = 'char_1_x', moment = '_effects') => ({ key: 'skchr_x_1', src: 'ability', moment, kind: 'effect', fx, conds: [], char });
  const tables = {
    template: [], index: { bundles: { x: ['x_a'] }, emitted: {} },
    local: [row('x_a'), row('other_b'), row('common_empty'), row('cnt', 'char_1_x', '_affectedCardCntKey'), row('card_uid_1', 'char_1_x', '_affectedCardUIDKey_1'), row('plugin_c', 'char_1_x', '_cardEffectPluginName'), row('y_d', 'char_2_y')],
  };
  const r = wiringReport({ tables, modes: {}, plays: { keys: {} }, names: new Set(['x_a']) });
  assert.deepEqual(r.x.foreign.map((f) => f.fx), ['other_b']);
  assert.equal(r.y, undefined, 'an operator not extracted yet is its own bundle\'s job');
});
