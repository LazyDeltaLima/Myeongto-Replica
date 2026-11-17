// test/audio-pick-reach.test.js — every official bank of a 선발 operator is reached by her own sounds, or her own entries name
// its file, or test/audio-pick-reach-list.js says why not (docs/rules/audio.md 「선발 소리 뱅크 커버리지」 「도달 시험」, 2026-11-17).
// test/audio-bank-coverage.test.js counts a bank as played when its file is anywhere in the asset manifest: a bank whose file
// another unit plays (b_char_defboost, a common skill start) passed there while nothing of hers sounded it. Here each pick ×
// skill runs on its season's data (test/helpers/audio-sweep.js) longer than the other sweeps, through the moments they leave
// out: normal attacks before the cast, the whole skill, the enemies killed by her, her summons and herself knocked out. A bank
// none of her three runs sounds and none of her own manifest entries (sfx.units of her or her summons, sfx.kit keys of her
// codes, the common sfx.battle sounds) names fails until it is wired or listed. The runs stand on a board the other sweeps
// lack (onBoard: her hand summons placed as the prep places them, flying dummies; reach: allies wounded now and then, a
// 傀儡师's <替身> time waited out, DP kept up). What still needs another unit, a stage device or a phase change stays out of
// reach: such a bank, wired by her own entries, fails until OUT_OF_REACH of the list gives the reason ('gap:' when the runs do
// reach the moment and our sounds play another file there).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOCAL_DIY_PICKS } from '../shared/local-diy.js';
import { DEFAULT_SEASON } from '../shared/seasons.js';
import { readData, sweepCases, sweepBattle, onBattleClock, OFFICIAL_AUDIO, pickBanks, pickWords, manifestUrls } from './helpers/audio-sweep.js';
import { allSeasonData } from './helpers/seasonPicks.js';
import { MANUAL_STOP, UNREACHED, OUT_OF_REACH } from './audio-pick-reach-list.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NO_DATA = (!existsSync(path.join(ROOT, 'data', 'assets.json')) && 'no data/assets.json')
  || (!existsSync(OFFICIAL_AUDIO) && 'no official audio table (.cache/gamedata, tools/build-data.mjs)');
/** Normal attacks before the cast (a skill cast at once never lets the sweeps hear them), then the skill's sweep window. */
const BEFORE_CAST = 5, CAST = 12;

/**
 * The board the sweep cases lack (2026-11-17): her hand summons, placed as the prep places them, and two flying dummies.
 * A summon whose range is its own tile acts only on an enemy standing there — 望's 棋子 (a trap) goes off on it, 机械师's
 * 结构性原理 blocks and strikes it — so it goes on a dummy's tile (the sweep's dummies at 10,6 / 10,7 / 9,6, the one with
 * open tiles beyond it first: 结构性原理's S3 charge runs along its facing); a summon the prep places only beside her
 * (`ownerBeside`: 涤火杰西卡's 机动盾牌) on the tile she faces, the first dummy's (she turns to it, and her S3 shells need it
 * beside her); any other summon on a free tile facing a dummy beside it — also one the sweep puts on the field for a skill
 * (its NEEDS: Mon3tr's 重构体 at 10,3, where her S3 would take her away from every dummy). The flyers: 望's S2 stones and 跟子
 * go off only on an air unit (her 跟子 land on 11,6 / 9,7 / 11,7); they resist arts (test/helpers/audio-sweep.js), so 弱点伤害
 * (结城理's S3 塔纳托斯) picks physical on them.
 */
const ON_DUMMY = [[10, 7], [10, 6], [9, 6]];
const NEAR = [[11, 6], [11, 7], [9, 5], [10, 8], [11, 5], [12, 6]];
const FLYERS = [[9, 6], [9, 7]];
const FORWARD = { UP: [1, 0], RIGHT: [0, 1], DOWN: [-1, 0], LEFT: [0, -1] };
const facingDummy = (r, c) => Object.keys(FORWARD).find((d) => ON_DUMMY.some(([a, b]) => a === r + FORWARD[d][0] && b === c + FORWARD[d][1])) ?? 'RIGHT';
const SEASONS = NO_DATA ? null : allSeasonData();

/**
 * Case `c` on that board. Her placeable summons are the season's tokens (data/backups.json `tokens`, `placeable`) whose variant
 * of her names her talent or this skill as a source (gamedata placeableTokens, PlayerState.grantTokensFor; the variant of her
 * normal form, the sweep's slot), up to their deploy limit and the tiles there are.
 */
function onBoard(c) {
  const id = c.unit.diy.charId;
  const placed = [];
  const beside = [[c.unit.row, c.unit.col + 1]], dummyTiles = [...ON_DUMMY], near = [...NEAR];
  for (const [tid, t] of Object.entries(SEASONS[c.season ?? DEFAULT_SEASON].backups.tokens ?? {})) {
    if (t.kind !== 'summon' || t.placeable !== true) continue;
    const v = Object.entries(t.variants ?? {}).find(([k]) => k.startsWith(`${id}@`))?.[1];
    const src = v?.bySkill?.[c.skill]?.sources ?? v?.sources ?? [];
    if (!src.includes('talent') && !src.includes('skill')) continue;
    const own = t.rangeGrid?.length === 1 && t.rangeGrid[0][0] === 0 && t.rangeGrid[0][1] === 0;
    for (let n = v.stats?.deployLimit ?? t.deployLimit ?? 1; n > 0; n--) {
      const at = (t.ownerBeside === true ? beside : own ? dummyTiles : near).shift();
      if (!at) break;
      for (const xs of [dummyTiles, near]) { const i = xs.findIndex(([r, k]) => r === at[0] && k === at[1]); if (i >= 0) xs.splice(i, 1); }
      placed.push({ kind: 'token', tokenId: tid, ownerUid: 1, row: at[0], col: at[1], ...(own ? null : { dir: facingDummy(...at) }) });
    }
  }
  const extra = [...(c.extra ?? []).filter((x) => !placed.some((p) => p.tokenId === x.tokenId)), ...placed].map((x, i) => ({ ...x, uid: 2 + i }));
  return { ...c, extra, flyers: FLYERS };
}

/** Every `WOUND_EVERY` s an ally above half HP drops to `WOUNDED` of it: a heal (and its swing) needs an injured ally. */
const WOUND_EVERY = 4, WOUNDED = 0.4;
/** Her player's DP stays at least `DP_FLOOR`: the sweep gains none, and a 商人 that cannot pay leaves (老鲤 at 9 s). */
const DP_FLOOR = 99;

/**
 * Every sound URL case `c`'s battle plays (a loop's too), through its phases. Her allies are wounded now and then (no dummy
 * deals damage, and a 医疗 never swings at a full-HP ally), not always (结城理's 俄耳甫斯 attacks only with no ally under half
 * HP); the skill's end waits for a 傀儡师's <替身> time too (结城理's skills end as they switch, and the switch back is his 总攻击);
 * her DP is kept up (老鲤's S2 mark bursts 5 s after the cast, and with no DP for his 商人 fee he had left before it).
 */
function reach(c, manifest) {
  const { h, u, a, castOnce } = sweepBattle(c, manifest);
  const got = new Set();
  a._play = (url) => { if (typeof url === 'string') got.add(url.toLowerCase()); };
  a._buffer = (url) => { if (typeof url === 'string') got.add(url.toLowerCase()); return Promise.resolve(null); };
  const every = Math.round(WOUND_EVERY / h.b.dt);
  const player = h.b.getPlayer(u.ownerId);
  onBattleClock((tick) => {
    let t = 0, steps = 0;
    const run = (secs, f) => {
      for (let i = 0, n = Math.round(secs / h.b.dt); i < n; i++) {
        f?.();
        if (player && player.dp < DP_FLOOR) player.dp = DP_FLOOR;
        if (steps++ % every === 0) for (const x of h.b.allyUnits) if (x.alive && x.hp > x.s.maxHp / 2) x.hp = x.s.maxHp * WOUNDED;
        h.step();
        tick(t += h.b.dt);
        a.ctx.currentTime = t;
        a.handleBattleEvents(h.events.splice(0));
      }
    };
    run(BEFORE_CAST);
    run(CAST, castOnce);
    for (let i = 0; i < 40 && (u.skill?.active || u.form === 'doll'); i++) run(1); // to its end, at most 40 s more
    run(2);
    for (const e of h.enemies()) { h.b.kill(e, u); run(0.5); }
    run(2);
    for (const x of h.b.allyUnits.filter((x) => x.alive && x !== u)) { h.b.kill(x, null); run(0.3); }
    h.b.kill(u, null);
    run(2);
  });
  return got;
}

/** {charId: Set of sound URLs}: what her own manifest entries name (her and her summons' units, her kit keys, sfx.battle). */
function ownUrls(manifest) {
  const sfx = manifest.audio.sfx;
  const tokens = readData('backups.json').tokens ?? {};
  const urls = (o, out = new Set()) => {
    if (typeof o === 'string') { if (o.endsWith('.mp3')) out.add(o.toLowerCase()); } else if (o && typeof o === 'object') for (const v of Object.values(o)) urls(v, out);
    return out;
  };
  const common = urls(sfx.battle);
  const out = {};
  for (const id of LOCAL_DIY_PICKS) {
    const words = pickWords(id, tokens);
    const own = new Set(common);
    for (const [k, v] of Object.entries(sfx.units)) if (k === id || k.startsWith(`${id}_`) || (k.startsWith('token_') && words.some((w) => w.test(k)))) urls(v, own);
    for (const [k, v] of Object.entries(sfx.kit ?? {})) if (words.some((w) => w.test(k))) urls(v, own);
    out[id] = own;
  }
  return out;
}

describe('every bank of a 선발 operator is reached by her own sounds', { skip: NO_DATA }, () => {
  const manifest = NO_DATA ? null : readData('assets.json');
  /** {charId: { reached, wired, borrowed }}: bank names by what the runs and the manifest say of each. */
  const result = NO_DATA ? {} : (() => {
    const inManifest = manifestUrls(manifest);
    const own = ownUrls(manifest);
    const heard = {};
    for (const c of sweepCases()) if (c.skill != null) for (const url of reach(onBoard(c), manifest)) (heard[c.unit.diy.charId] ??= new Set()).add(url);
    const out = {};
    for (const [id, banks] of Object.entries(pickBanks(LOCAL_DIY_PICKS))) {
      const r = (out[id] = { reached: [], wired: [], borrowed: [] });
      for (const { name, files } of banks) {
        if (!files.some((f) => inManifest.has(f))) continue; // a file no entry plays: audio-bank-coverage-list.js
        if (files.some((f) => heard[id]?.has(f))) r.reached.push(name);
        else if (files.some((f) => own[id].has(f))) r.wired.push(name);
        else r.borrowed.push(name);
      }
    }
    return out;
  })();

  test('a bank only another unit\'s entry plays is sounded by her, or listed', () => {
    const missing = [], stale = [];
    let stops = 0;
    for (const [id, r] of Object.entries(result)) {
      for (const n of r.borrowed) {
        if (MANUAL_STOP.test(n)) { stops++; continue; }
        if (!UNREACHED[id]?.[n]) missing.push(`${id} ${n}`);
      }
      for (const n of Object.keys(UNREACHED[id] ?? {})) if (!r.borrowed.includes(n)) stale.push(`${id} ${n}`);
    }
    assert.deepEqual(missing, [], 'her own runs never sound these banks and no entry of hers names their file (the manifest has it only for another unit): wire it, or say why in test/audio-pick-reach-list.js (docs/rules/audio.md 「선발 소리 뱅크 커버리지」 「도달 시험」)');
    assert.deepEqual(stale, [], 'entries of test/audio-pick-reach-list.js that her runs or her entries cover now: delete them');
    assert.ok(stops > 0, 'the manual-stop rule matched no bank: check MANUAL_STOP');
  });

  test('a bank her entries play and her runs never sound has a reason in OUT_OF_REACH', () => {
    const open = [];
    for (const [id, r] of Object.entries(result)) for (const n of r.wired) if (!MANUAL_STOP.test(n) && !OUT_OF_REACH[id]?.[n]) open.push(`${id} ${n}`);
    assert.deepEqual(open, [], 'her own entries name these banks\' files and her runs never sound them: reach the moment on the runs\' board (onBoard / reach), or say why not in OUT_OF_REACH of test/audio-pick-reach-list.js — \'gap:\' when the runs reach it and our sounds play another file there (docs/rules/audio.md 「선발 소리 뱅크 커버리지」 「도달 시험」)');
  });

  test('a reason of OUT_OF_REACH names a bank her entries play and her runs still miss', () => {
    const stale = [];
    for (const [id, names] of Object.entries(OUT_OF_REACH)) for (const n of Object.keys(names)) if (!result[id]?.wired.includes(n)) stale.push(`${id} ${n}`);
    assert.deepEqual(stale, [], 'entries of OUT_OF_REACH (test/audio-pick-reach-list.js) whose bank her runs reach now, or that no entry of hers plays: delete or move them (docs/rules/audio.md 「선발 소리 뱅크 커버리지」 「도달 시험」)');
  });

  test('the runs reach the moments the other sweeps leave out', () => {
    const has = (id, n) => assert.ok(result[id]?.reached.includes(n), `${id} ${n}`);
    has('char_4056_titi', 'ON_ABILITY_START.char_4056_titi.attack.0'); // a normal attack before the cast
    has('char_1052_kalts2', 'ON_UNIT_DEAD.char_1052_kalts2');          // her knock-out
    has('char_1042_phatm2', 'ON_UNIT_DEAD.token_10055_phatm2_mndclv');   // a summon's
    // the board (onBoard): a hand summon placed in the prep, on a dummy's tile, and an air unit
    has('char_2027_wang', 'ON_ABILITY_START.sktok_wang_1');                       // a placed 棋子 going off
    has('char_2027_wang', 'ON_ABILITY_START.sktok_wang_2.extra.1');               // an S2 跟子 going off on a flyer
    has('char_4230_mcnist', 'ON_ABILITY_HIT.token_10069_mcnist_mcgraf.attack.0'); // 结构性原理 striking what it blocks
    has('char_1034_jesca2', 'ON_BUFF_START.jesca2_jckshd_turnaround');            // 机动盾牌 beside her: she turns to it
    has('char_1034_jesca2', 'ON_PROJECTILE_STOP.projectile_chr_jesca2_s3_bomb');  // and S3 fires its shells
    has('char_4179_monstr', 'ON_ABILITY_START.char_4179_monstr.attack.4');        // S3 takes her to her 重构体, beside the dummies
    has('char_4217_makoto', 'ON_CUSTOM_TRIGGER.makoto_skill_03_1_physical');      // 弱点伤害 on a flyer resisting arts
    // reach: a wounded ally to heal, and the <替身> time's end
    has('char_1052_kalts2', 'ON_ABILITY_ON.char_1052_kalts2.attack.0');
    has('char_4217_makoto', 'ON_CUSTOM_TRIGGER.makoto_allout_start');
    // reach: her DP kept up (a 商人 stays to see his S2 mark burst)
    has('char_322_lmlee', 'ON_PROJECTILE_REACH.projectile_chr_lmlee_s2');
  });

  test('the list names picks and banks that exist, in its grammar', () => {
    const all = pickBanks(LOCAL_DIY_PICKS);
    for (const [id, names] of Object.entries(UNREACHED)) {
      assert.ok(all[id], `${id} is a pick`);
      for (const [n, s] of Object.entries(names)) {
        assert.ok(all[id].some((b) => b.name === n), `${id} ${n} is one of her banks`);
        assert.match(s, /^(none|todo): \S/, `${id} ${n}`);
        assert.ok(!MANUAL_STOP.test(n), `${id} ${n}: the manual-stop rule covers it`);
      }
    }
    for (const [id, names] of Object.entries(OUT_OF_REACH)) {
      assert.ok(all[id], `${id} is a pick`);
      for (const [n, s] of Object.entries(names)) {
        assert.ok(all[id].some((b) => b.name === n), `${id} ${n} is one of her banks`);
        assert.match(s, /\S/, `${id} ${n}: the reason`);
      }
    }
  });
});
