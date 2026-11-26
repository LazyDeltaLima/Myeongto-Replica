// test/render/eskill-spell-fx.test.js — an enemy skill's cast effects of its spell and of its end at those moments
// (2026-11-27, docs/rules/fx.md 「적 범위 공격의 경고 칸」 「시전 이펙트의 때」): a cast effect bound to ON_SPELL_ON (opt `s` 4)
// comes as the ability's spell does — the frame it waits for (content/enemies/helpers.js castStrikeAt) — and one bound to
// ON_CAST_END (`s` 3) as the cast ends (castLength, a channel's `dur`). The sim's 'enemySkill' carries both (`spell` / `len`,
// content/enemies.js castView); until 2026-11-27 the view played them all as the cast began ('自在''s ShieldBurst hit 14.7 s
// early, 卢西恩's blink start before the blink).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { UF } from '../../shared/constants.js';
import { getData } from '../../server/data.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';
import { castStrikeAt, castLength } from '../../server/sim/content/enemies/helpers.js';

const MODES = new URL('../../public/assets/local/fx/enemy-modes.json', import.meta.url);
const HAVE = existsSync(MODES);
const quiet = { warn() {}, error() {}, info() {} };
const D = getData({ log: quiet });
const D3 = getData({ season: 'act3autochess', log: quiet });
const SPELL_ON = 4, CAST_END = 3;
const WALL = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e9, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
const modes = () => JSON.parse(readFileSync(MODES, 'utf8'));
const fetch0 = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = fetch0; });

/** A still wall at (10, 5) blocking enemy `id` there; every event logged with its battle time. */
function field(id) {
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    kind: 'normal', sharedBoss: null, enemies: [], defs: { chess: { t_wall: WALL }, enemies: { [id]: D.enemies[id] } },
    kits: { t_wall: () => ({ trait: { noAttack: true } }) },
    units: [{ chessId: 't_wall', row: 10, col: 5, uid: 1 }],
  });
  h.step();
  const b = h.battle, ev0 = b._ev.bind(b), rec = [];
  b._ev = (e) => { rec.push([b.time, e]); return ev0(e); };
  const e = h.spawn(id, { pos: [10, 5], routeIndex: 0, mods: { speedMul: 0 }, tag: null });
  return { h, e, rec };
}
const viewOf = (u) => ({ id: u.id, x: u.x, y: u.y, alive: true, isEnemy: u.side === 'enemy', form: null, flags: 0, statuses: new Set(),
  info: { id: u.id, side: u.side === 'enemy' ? 'enemy' : 'ally', defId: u.defId ?? 'char_x', form: null } });
const fxIs = (e, kind, k) => e[0] === 'fx' && e[1] === kind && (k == null || e[4]?.kind === k || e[4]?.ability === k);

/** @type {Record<string, Record<string, { cast?: string[], hit?: string[], castTgt?: string[], buff?: string[], opt?: object }>>} */
const PARTS = {};
const XI = 'enemy_1517_xi', LU = 'enemy_2016_csphtm', EEL = 'enemy_9037_aceel', S = 'eel_spell', C = 'eel_start';
if (HAVE) { const m = modes(); PARTS[XI] = { shieldburst: m[XI]?.skills?.shieldburst }; PARTS[LU] = { blink: m[LU]?.skills?.blink }; }
// 假想敌：鳍's 离子环波 shape (no extracted binding needed)
PARTS[EEL] = { discharge: { cast: [C, S], opt: { [C]: { s: 2, e: 3, o: 1 }, [S]: { s: SPELL_ON, e: 3, o: 1 } } } };
/**
 * A dry layer on the binding parts of PARTS (the layer module loads its bindings once: every case's part is in them;
 * their names served from one bundle); `play(list, t0, t1)` hands it the events `[t, ev]` from `t0`, stepping its clock
 * in frames, and returns every prefab it started with its time from `t0`.
 */
async function layerOn(unitDef = (info) => D.enemies[/** @type {{ defId: string }} */ (info).defId] || null) {
  const names = [...new Set(Object.values(PARTS).flatMap((sk) => Object.values(sk)).flatMap((part) => [...(part.cast || []), ...(part.hit || []), ...(part.castTgt || []), ...(part.buff || [])]))];
  const m = { $fx: Object.fromEntries(names.map((n) => [n, ['b', n]])),
    ...Object.fromEntries(Object.entries(PARTS).map(([id, skills]) => [id, { modes: [{ name: 'Mode', anim: ['Attack'] }], skills }])) };
  const files = { '/assets/local/fx/index.json': { bundles: { b: names } }, '/assets/local/fx/enemy-modes.json': m };
  // (served for the test's whole run: the layer fetches a prefab's JSON as it starts it)
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  const seen = [];
  let clock = 0;
  const L = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, unitDef, trace: (p) => seen.push({ ...p, t: clock }) });
  await new Promise((r) => setTimeout(r, 10));
  const CAM = { dist: 20 }, VP = { width: 100, height: 100 };
  return {
    L,
    /** @param {[number, unknown[]][]} list @param {number} t0 @param {number} t1 @param {Map<unknown, object>} views @param {(t: number) => void} [each] */
    play(list, t0, t1, views, each = () => {}) {
      let at = t0;
      L.update(0, CAM, VP);
      const step = (t) => { while (t - at > 1e-9) { const d = Math.min(1 / 60, t - at); L.update(d, CAM, VP); at += d; clock = at - t0; each(clock); } };
      for (const [t, x] of list) {
        if (t < t0 - 1e-9) continue;
        step(t);
        L.onEvent(x, views);
      }
      step(t1);
      return seen.filter((p) => p.kind === 'spawn');
    },
  };
}

test('“自在” (real kit): ShieldBurst\'s enemy_xi_skill_02_hit (ON_SPELL_ON) at the spell, 14.7 s into its 15 s channel — its other cast effects as it starts', { skip: !HAVE && 'no extracted effects' }, async () => {
  const part = PARTS[XI].shieldburst;
  assert.ok(part && part.opt?.enemy_xi_skill_02_hit?.s === SPELL_ON, 'enemy-modes.json binds enemy_xi_skill_02_hit to ShieldBurst\'s ON_SPELL_ON');
  const { h, e, rec } = field(XI);
  h.runUntil(() => rec.some(([, x]) => fxIs(x, 'enemySkill', 'ShieldBurst')), 80);
  h.run(16);
  const [t0, cast] = rec.find(([, x]) => fxIs(x, 'enemySkill', 'ShieldBurst'));
  assert.equal(cast[4].dur, 15, 'the channel\'s 15 s (content/enemies.js chanView)');
  assert.ok(Math.abs(cast[4].spell - 14.7) < 1e-6, `the spell 14.7 s in: Skill_02_End's attack event (content/enemies.js castView; ${cast[4].spell})`);
  const wall = h.allies()[0];
  const { play } = await layerOn();
  const spawns = play(rec, t0, t0 + 16, new Map([[e.id, viewOf(e)], [wall.id, viewOf(wall)]]));
  const of = (n) => spawns.filter((p) => p.names[0] === n);
  assert.equal(of('enemy_xi_skill_02_hit').length, 1, `enemy_xi_skill_02_hit once (${JSON.stringify(of('enemy_xi_skill_02_hit'))})`);
  assert.ok(Math.abs(of('enemy_xi_skill_02_hit')[0].t - 14.7) < 0.05, `at the spell, not as the cast starts (${of('enemy_xi_skill_02_hit')[0].t.toFixed(3)} s)`);
  for (const n of part.cast.filter((c) => (part.opt?.[c]?.s ?? 2) === 2)) {
    assert.ok(of(n).length >= 1 && of(n)[0].t < 0.05, `${n} (ON_CAST_START) as the cast starts (${JSON.stringify(of(n))})`);
  }
});

test('卢西恩 (real kit): blink\'s enemy_csphtm_skill_01_start (ON_CAST_END) as the cast ends — after the blink, not before it', { skip: !HAVE && 'no extracted effects' }, async () => {
  const part = PARTS[LU].blink;
  assert.ok(part && part.opt?.enemy_csphtm_skill_01_start?.s === CAST_END, 'enemy-modes.json binds enemy_csphtm_skill_01_start to blink\'s ON_CAST_END');
  const { h, e, rec } = field(LU);
  h.runUntil(() => rec.some(([, x]) => fxIs(x, 'enemySkill', 'blink')), 40);
  h.run(1);
  const [t0, cast] = rec.find(([, x]) => fxIs(x, 'enemySkill', 'blink'));
  const [tb] = rec.find(([t, x]) => t >= t0 && fxIs(x, 'blink'));
  assert.ok(cast[4].len > 0 && t0 + cast[4].len > tb + 1e-6, `the cast ends (len ${cast[4].len}) after the blink (${(tb - t0).toFixed(3)} s in)`);
  const wall = h.allies()[0];
  const { play } = await layerOn();
  const spawns = play(rec, t0, t0 + 1, new Map([[e.id, viewOf(e)], [wall.id, viewOf(wall)]]));
  const st = spawns.filter((p) => p.names[0] === 'enemy_csphtm_skill_01_start');
  assert.equal(st.length, 1, `the start effect once (${JSON.stringify(st)})`);
  assert.ok(st[0].t > tb - t0 + 1e-6 && Math.abs(st[0].t - cast[4].len) < 0.03, `at the cast's end, after the blink (${st[0].t.toFixed(3)} s; blink ${(tb - t0).toFixed(3)} s)`);
});

// a cast that is no channel (the sim sends no 'enemySkillEnd' for it): 假想敌：鳍's 离子环波 shape — its ON_SPELL_ON start
// effect at the spell 2.433 s in; a stun before it cuts the cast (the spell's effect never comes); a later fx of the cast
// (its 'explode' at the spell, `ability` on it) plays none of its cast effects again
test('a cast that is no channel: its spell\'s effect at `spell`, none after a stun before it, none again at the cast\'s later fx', async () => {
  const ev = (k, o) => ['fx', k, 0, 0, o];
  const run = async (stunAt) => {
    const { play } = await layerOn(() => null);
    const foe = { id: 1, x: 0, y: 0, alive: true, isEnemy: true, form: null, flags: 0, statuses: new Set(), info: { id: 1, side: 'enemy', defId: EEL, form: null } };
    const list = [[0, ev('enemySkill', { id: 1, ability: 'Discharge', n: 1, spell: 2.433, len: 2.933 })], [2.433, ev('explode', { id: 1, r: 1, kind: 'aceelDischarge', ability: 'Discharge', caster: 1 })]];
    return play(list, 0, 3.5, new Map([[1, foe]]), (t) => { foe.flags = stunAt != null && t >= stunAt && t < stunAt + 0.3 ? UF.STUNNED : 0; });
  };
  const of = (sp, n) => sp.filter((p) => p.names[0] === n);
  const plain = await run(null);
  assert.equal(of(plain, C).length, 1, `the start effect once — not again at the cast's 'explode' (${JSON.stringify(of(plain, C))})`);
  assert.ok(of(plain, C)[0].t < 0.05);
  assert.equal(of(plain, S).length, 1, `the spell's effect once (${JSON.stringify(of(plain, S))})`);
  assert.ok(Math.abs(of(plain, S)[0].t - 2.433) < 0.03, `at the spell (${of(plain, S)[0].t.toFixed(3)} s)`);
  const cut = await run(1);
  assert.equal(of(cut, S).length, 0, `a stun 1 s in cuts the cast: no spell effect (${JSON.stringify(of(cut, S))})`);
});

// Every enemy ability whose cast effects start at ON_SPELL_ON / ON_CAST_END: the sim's 'enemySkill' can time that moment
// (castView reads castStrikeAt / castLength of its data `skillCast` record — a time > 0). Listed: the ones another path
// times or that the sim casts some other way.
const ELSEWHERE = {
  'enemy_10027_vtsk:appear': '“帝国的甲胄”\'s 出场: the sim casts no Appear (content/local-patch.js barrage, no \'enemySkill\'): its cast effects never play',
  'enemy_10027_vtsk:attack': '“帝国的甲胄”\'s attack ability: a normal attack\'s cast effects at its own phases (fxgame.js playCast, castPhase)',
  'enemy_10123_uareap:mainmultirangedattack': '破城者\'s SkyProjectile child: the skill\'s own record times it (skyprojectile)',
  'enemy_10098_crhro:reborn': 'a 重生 ability: fxgame.js erebornAbility plays its effects at the 重生\'s start and end',
  'enemy_1539_reid:reborn': 'a 重生 ability: fxgame.js erebornAbility plays its effects at the 重生\'s start and end',
  'enemy_1362_dfat:stunattack': '萨卡兹子裔责罚者\'s StunAttack: the sim sends its strike as an \'explode\' (fxgame.js SPELL_BLASTS)',
  'enemy_1362_dfat_2:stunattack': '萨卡兹子裔惩戒者\'s StunAttack: the sim sends its strike as an \'explode\' (fxgame.js SPELL_BLASTS)',
};
test('every enemy ability with ON_SPELL_ON / ON_CAST_END cast effects has a cast the sim can time (docs/rules/fx.md 「적 범위 공격의 경고 칸」)', { skip: !HAVE && 'no extracted effects' }, () => {
  const seen = [];
  for (const [id, b] of Object.entries(modes())) {
    if (id.startsWith('$')) continue;
    const parts = [...Object.entries(b.skills || {}), ...(b.modes || []).flatMap((m) => Object.entries(m?.skills || {}))];
    for (const [sk, p] of parts) {
      if (sk.includes('/')) continue;   // a child of a group: its group's own entry carries its effects
      const evs = new Set((p.cast || []).map((n) => p.opt?.[n]?.s).filter((s) => s === SPELL_ON || s === CAST_END));
      if (!evs.size) continue;
      const key = `${id}:${sk}`;
      if (seen.includes(key)) continue;
      seen.push(key);
      if (ELSEWHERE[key]) continue;
      const u = D.enemies[id] || D3.enemies[id];
      const s = (u?.skills || []).find((x) => String(x.prefabKey).toLowerCase() === sk);
      const cast = u?.skillCast?.[sk];
      assert.ok(s && cast, `${key}: cast effects at ON_SPELL_ON / ON_CAST_END, but no skill with a data skillCast record — the view plays them as the cast starts (content/enemies.js castView; docs/rules/fx.md 「적 범위 공격의 경고 칸」 「시전 이펙트의 때」): time that moment, or list it here with the path that does`);
      const e = /** @type {never} */ ({ s: { interval: Number(u.stats?.bat) || 1 } });
      if (evs.has(SPELL_ON)) assert.ok((castStrikeAt(e, cast, s.bb) ?? 0) > 0, `${key}: no spell time from its skillCast record (castStrikeAt) — its ON_SPELL_ON effects keep the cast's start`);
      if (evs.has(CAST_END) && !cast.chan) assert.ok(castLength(e, cast, s.bb) > 0, `${key}: no cast length from its skillCast record (castLength) — its ON_CAST_END effects keep the cast's start`);
    }
  }
  for (const k of ['enemy_1517_xi:shieldburst', 'enemy_2016_csphtm:blink', 'enemy_1535_wlfmster:fearcage']) assert.ok(seen.includes(k), `the sweep reached ${k} (${seen.join(', ')})`);
  for (const k of Object.keys(ELSEWHERE)) assert.ok(seen.includes(k), `${k} is listed but has no ON_SPELL_ON / ON_CAST_END cast effects any more: drop it`);
});
