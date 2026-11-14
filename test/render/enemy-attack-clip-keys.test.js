// test/render/enemy-attack-clip-keys.test.js — the screen draws an enemy's attack with the clip the sim times it by: the
// attack ability's key through the prefab animator's key table (docs/rules/render.md 「적 공격 클립은 키 표로」; the sim's side
// docs/rules/sim.md 「일반 공격 타이밍」 「적 클립의 키 표」). Until 2026-11-14 the model roles guessed the clip by its name
// (tools/assets/anim-roles.mjs): 14 of 515 enemies drew another clip — 大鲍勃's Attack instead of Attack2 (1 s of a 1.9 s
// swing), 碎骨's blocked swing on Attack instead of Combat_NoPre, 暴走食人花 on Attack_Die … — and no enemy's blocked
// (`_combat`) clip was drawn: the sim's enemy 'swing' had no 7th field.
// Run: node --test test/render/enemy-attack-clip-keys.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { putEnemyAttackKeys } from '../../tools/assets/anim-overrides.mjs';
import { FORMS } from '../../public/js/render/units.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const read = (rel) => JSON.parse(fs.readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8'));
const ASSETS = read('data/assets.json').enemies;
const SEASONS = fs.readdirSync(new URL('../../data/seasons/', import.meta.url)).sort()
  .filter((s) => fs.existsSync(new URL(`../../data/seasons/${s}/enemies.json`, import.meta.url)));
const DATA = [['data', read('data/enemies.json')], ...SEASONS.map((s) => [s, read(`data/seasons/${s}/enemies.json`)])];
const WHY = 'the model roles must play the clip the sim times the swing by (data/enemies.json attackAnim — the key table): '
  + 'rebuild data/assets.json with `node tools/fetch-assets.mjs --offline` (tools/assets/spine.mjs overlayEnemyAttackKeys) — '
  + 'docs/rules/render.md 「적 공격 클립은 키 표로」';

/**
 * Models whose roles may differ from the key table, with the reason (none now). Key `<enemy id> <spine|spineLocal>`.
 * @type {Record<string, string>}
 */
const EXCEPT = {};

/** Every enemy's own models (the web one unless it stands in for another enemy, the local client's) with its record. */
function* ownModels() {
  const seen = new Set();
  for (const [season, j] of DATA) {
    for (const [id, e] of Object.entries(j.enemies ?? j)) {
      if (seen.has(id) || !e?.attackAnim?.clip) continue;
      seen.add(id);
      const a = ASSETS[id];
      for (const which of ['spine', 'spineLocal']) {
        const m = a?.[which];
        if (!m?.anims || (which === 'spine' && a.spineAliasOf)) continue;
        yield { id, season, which, m, rec: e.attackAnim, has: (n) => Object.hasOwn(m.animations || {}, n) };
      }
    }
  }
}

test('every enemy model plays its key table\'s attack clip and its blocked (_combat) clip — both seasons, every own model', () => {
  const bad = [], seen = new Map();
  let n = 0;
  for (const { id, season, which, m, rec, has } of ownModels()) {
    const k = `${id} ${which}`;
    if (Object.hasOwn(EXCEPT, k)) continue;
    const atk = m.anims.attack;
    if (has(rec.clip)) {
      n++;
      if (atk?.loop !== rec.clip) bad.push(`${k} (${season}): attack ${atk?.loop} — the key table's ${rec.clip}`);
      else seen.set(k, atk.loop);
    }
    const c = rec.combat?.clip;
    if (c && has(c)) {
      const got = atk?.combat?.loop ?? atk?.loop;
      if (got !== c) bad.push(`${k} (${season}): blocked ${got} — the key table's ${c}`);
      else seen.set(`${k} combat`, got);
    }
  }
  assert.ok(n > 250, `${n} models checked`);   // 302 on 2026-11-14
  assert.deepEqual(bad, [], `${WHY}\n${bad.join('\n')}`);
  // the cases that drew another clip until 2026-11-14 (the sweep really ran over them)
  assert.equal(seen.get('enemy_1001_bigbo spine'), 'Attack2', '大鲍勃');
  assert.equal(seen.get('enemy_1500_skulsr spine combat'), 'Combat_NoPre', '碎骨 blocked');
  assert.equal(seen.get('enemy_10003_trwlpl_2 spine'), 'Attack_Begin', '暴走食人花 (the name guess took Attack_Die)');
  assert.equal(seen.get('enemy_1512_mcmstr spine'), 'Attack_2', '巨大的丑东西 ranged');
  assert.equal(seen.get('enemy_1512_mcmstr spine combat'), 'Attack_1', '巨大的丑东西 blocked');
  for (const k of Object.keys(EXCEPT)) assert.ok([...ownModels()].some((x) => `${x.id} ${x.which}` === k), `EXCEPT ${k}: no such model`);
});

test('an enemy form named after its prefab mode (render/units.js FORMS) attacks with that mode\'s key table clip', () => {
  const bad = [], ok = [];
  for (const [, j] of DATA) {
    for (const [id, e] of Object.entries(j.enemies ?? j)) {
      for (const [mode, rec] of Object.entries(e?.attackAnim?.modes || {})) {
        const r = FORMS[id]?.[mode]?.roles;
        if (!r || !r.attack || !rec?.clip) continue;
        (r.attack.loop === rec.clip ? ok : bad).push(`${id} ${mode}: ${r.attack.loop} — the key table's ${rec.clip}`);
      }
    }
  }
  assert.deepEqual(bad, [], `the form's attack clip is the mode's (enemies.json attackAnim.modes) — docs/rules/render.md 「적 공격 클립은 키 표로」\n${bad.join('\n')}`);
  assert.ok(ok.some((s) => s.startsWith('enemy_9023_acdums Depression: Attack_B')), `“断弦之音” Depression checked (${ok.length} forms)`);
});

test('putEnemyAttackKeys: the table\'s clip replaces a guess (its begin / end / via dropped), keeps a matching triple, adds or drops the blocked clip', () => {
  const entry = (attack, names) => ({ anims: { attack }, animations: Object.fromEntries(names.map((n) => [n, 1])) });
  const a = entry({ begin: 'Attack_Begin', loop: 'Attack_Die', end: 'Attack_End', via: 'attackAny' }, ['Attack_Begin', 'Attack_Die', 'Attack_End']);
  assert.deepEqual(putEnemyAttackKeys(a, { clip: 'Attack_Begin' }), ['attack Attack_Begin']);
  assert.deepEqual(a.anims.attack, { begin: null, loop: 'Attack_Begin', end: null });
  const b = entry({ begin: 'Attack_Begin', loop: 'Attack_Loop', end: 'Attack_End' }, ['Attack_Begin', 'Attack_Loop', 'Attack_End']);
  assert.deepEqual(putEnemyAttackKeys(b, { clip: 'Attack_Loop' }), [], 'the same loop: the triple stays');
  const c = entry({ begin: null, loop: 'Attack', end: null }, ['Attack', 'Attack_2']);
  assert.deepEqual(putEnemyAttackKeys(c, { clip: 'Attack_2', combat: { clip: 'Attack' } }), ['attack Attack_2', 'combat Attack']);
  assert.deepEqual(c.anims.attack, { begin: null, loop: 'Attack_2', end: null, combat: { loop: 'Attack' } });
  assert.deepEqual(putEnemyAttackKeys(c, { clip: 'Attack_2', combat: { clip: 'Attack_2' } }), ['combat (the attack clip)']);
  assert.equal(c.anims.attack.combat, undefined);
  const d = entry({ begin: null, loop: 'Attack', end: null }, ['Attack']);
  assert.deepEqual(putEnemyAttackKeys(d, { clip: 'Attack2', combat: { clip: 'Combat_NoPre' } }), [], 'clips the skeleton lacks are left out');
});

test('碎骨 (real kit and data): its blocked swings carry the 7th field 1 (its _combat ability), its unblocked ones none', () => {
  const WALL = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
  const swings = (pos, units) => {
    const h = makeBattle({
      content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
      defs: { chess: { t_wall: WALL } }, kits: { t_wall: () => ({ trait: { noAttack: true } }) }, units, enemies: [],
    });
    h.step();
    const e = h.spawn('enemy_1500_skulsr', { pos, routeIndex: 0, mods: { speedMul: 0 } });
    h.runUntil(() => e.stats.attacks >= 3, 30);
    return h.eventsOf('swing').filter((x) => x[1] === e.id);
  };
  const blocked = swings([9, 5], [{ chessId: 't_wall', row: 9, col: 5 }]);
  assert.ok(blocked.length >= 3, JSON.stringify(blocked));
  // (its first swing starts in the tick it appears, before the wall's block is taken: its attack ability, no field)
  assert.ok(blocked.slice(1).every((x) => x[6] === 1), `blocked: the renderer's combat clip (render/app.js 'swing' e[6]) — ${JSON.stringify(blocked)}`);
  const free = swings([9, 7], [{ chessId: 't_wall', row: 9, col: 5 }]);
  assert.ok(free.length >= 2, JSON.stringify(free));
  assert.ok(free.every((x) => x[6] === undefined), `unblocked: its attack clip — ${JSON.stringify(free)}`);
});

test('“断弦之音” (real kit): its dark form tells the model Depression (FORMS: the mode\'s *_B clips), its gold one the first mode', () => {
  const h = makeBattle({ content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600, units: [], enemies: [], captureNoisy: true });
  h.step();
  const e = h.spawn('enemy_9023_acdums', { pos: [9, 5], routeIndex: 0, mods: { speedMul: 0 } });
  h.step();
  bossesMod.setEchoForm(h.b, e, 'dark');
  bossesMod.setEchoForm(h.b, e, 'gold', true);
  const forms = h.eventsOf('fx').filter((x) => x[1] === 'phase' && x[4]?.id === e.id).map((x) => [x[4].kind, x[4].form]);
  assert.deepEqual(forms.slice(-2), [['echo_dark', 'Depression'], ['echo_gold', null]], JSON.stringify(forms));
  assert.ok(FORMS.enemy_9023_acdums?.Depression, 'render/units.js FORMS draws it');
});
