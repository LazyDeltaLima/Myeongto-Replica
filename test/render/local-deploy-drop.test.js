// test/render/local-deploy-drop.test.js — local patch (official deploy, research/2026-10-07-deploy-drop):
// an allied unit with a Spine model drops in by its own Start clip — no alpha fade-in, no mint pillar (fx.deploy skips a
// `bornOfficial` view), dark for the first BORN_TINT_S; deployed before its model is in (a battle start builds and deploys
// its views in one frame) the ring and shadow show first and the whole clip plays once the model is in (BORN_LEAD_S).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { spineEntry, hasBackSpine } from '../../public/js/assets.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const M = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const TEXAS = 'char_102_texas';   // Start clip: falls from ~3.3 body heights, lands at 0.35 s (start-clip-survey.tsv)

let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => { await tick(); await tick(); };
const cam = () => presetCamera('normal', { width: 1280, height: 720 });
let clockT = 0;
const frames = (v, n, dt = 1 / 60) => { for (let i = 0; i < n; i++) { clockT += dt; v.update(dt, cam(), clockT); } };

function store({ models = true } = {}) {
  return {
    picture: () => null,
    image: async () => null,
    hasBack: (id) => hasBackSpine(M, id),
    spineEntry: (id, o) => (models ? spineEntry(M, id, o) : null),
    spine: {
      acquire: async (e) => ({ animations: Object.keys(e.animations || {}).map((name) => ({ name })) }),
      release: () => {},
    },
  };
}
const unit = (s, extra = {}) => new UnitView(fakeViewCtx(fake.P, { assets: s, cam }),
  { id: 5, side: 'ally', kind: 'chess', defId: TEXAS, spine: TEXAS, tier: 1, x: 5, y: 10, maxHp: 1000, dir: 'RIGHT', ...extra });

describe('official deploy drop-in (units.js onDeploy)', () => {
  test('fixture: 德克萨斯 has a Start clip (the fall lives in it)', () => {
    const e = spineEntry(M, TEXAS, { back: false });
    assert.ok(e && e.anims?.deploy === 'Start' && e.animations.Start > 0.3);
  });

  test('deployed before its model loaded (battle start): ring + shadow first, then the whole Start clip from its start', async () => {
    const v = unit(store());
    assert.equal(v.actor, null, 'model still loading');
    assert.equal(v.onDeploy(), true, 'the official drop-in');
    assert.equal(v.bornOfficial, true);
    assert.equal(v.fadeIn, 1, 'no alpha fade-in');
    frames(v, 1);
    assert.equal(v.body.alpha, 0, 'no body (nor diamond) yet');
    assert.equal(v.hud.alpha, 0, 'no bars yet');
    assert.ok(v.shadow.alpha > 0.4, 'the shadow is there');
    await settle();
    assert.ok(v.actor, 'model in');
    assert.equal(v.swapT, 1, 'shown at once when it appears (no cross-fade)');
    assert.notEqual(v.actor.mode, 'deploy', 'Start waits for BORN_LEAD_S');
    frames(v, 3);
    assert.equal(v.body.alpha, 0);
    frames(v, 4);                                       // 0.13 s since the deploy
    assert.equal(v.body.alpha, 1, 'the body shows');
    assert.equal(v.actor.mode, 'deploy', 'Start plays');
    assert.ok(v.actor.deployElapsed() < 0.05, `from its start (${v.actor.deployElapsed()})`);
    frames(v, 1);
    const dark = v._tint;
    assert.ok(((dark >> 16) & 255) < 255, `dark first frames (tint ${dark?.toString(16)})`);
    frames(v, 12);
    assert.equal(v._tint, 0xffffff, 'normal colour after BORN_TINT_S');
    frames(v, 60);
    assert.notEqual(v.actor.mode, 'deploy', 'the clip ends');
  });

  test('a long frame (the battle switch) neither uses up the wait nor skips the fall (user 2026-10-08)', async () => {
    const v = unit(store());
    v.onDeploy();
    frames(v, 1, 1.4);                                  // a 1.4 s hitch: still waiting (not the diamond)
    assert.equal(v.body.alpha, 0);
    await settle();
    frames(v, 8);                                       // past BORN_LEAD_S
    assert.equal(v.actor.mode, 'deploy', 'Start plays');
    frames(v, 1, 0.8);                                  // another hitch while it falls
    assert.equal(v.actor.mode, 'deploy', 'the fall goes on');
    assert.ok(v.actor.deployElapsed() < 0.2, `advanced by one capped step (${v.actor.deployElapsed()})`);
  });

  test('a model that never comes: the diamond after BORN_WAIT_MAX_S', () => {
    const s = store();
    s.spine.acquire = () => new Promise(() => {});
    const v = unit(s);
    assert.equal(v.onDeploy(), true);
    frames(v, 30);
    assert.equal(v.body.alpha, 0);
    frames(v, 40);                                      // > 1 s
    assert.equal(v.body.alpha, 1, 'the diamond shows');
  });

  test('a model already shown plays Start at once; enemies and model-less views keep the old fade', async () => {
    const v = unit(store());
    await settle();
    frames(v, 30);
    assert.equal(v.onDeploy(), true);
    assert.equal(v.actor.mode, 'deploy');
    const e = unit(store(), { side: 'enemy', kind: 'enemy', id: 6 });
    await settle();
    assert.equal(e.onDeploy(), false);
    assert.equal(e.fadeIn, 0);
    const n = unit(store({ models: false }), { id: 7 });
    await settle();
    assert.equal(n.onDeploy(), false, 'the diamond keeps the old look (and fx.deploy)');
    assert.equal(n.bornOfficial, false);
  });

  test('the opening deployment one by one (2-4, owner 2026-10-08): the n-th waits n × BORN_STAGGER_S wholly hidden, then drops', async () => {
    const { BORN_STAGGER_S } = await import('../../public/js/render/units.js');
    assert.equal(BORN_STAGGER_S, 0.12, 'official 「왕 S3.mp4」: rings ~0.12 s apart');
    const v = unit(store());
    await settle();
    frames(v, 30);                                      // model in (a battle view built before the deploy)
    assert.equal(v.onDeploy({ order: 2 }), true);
    frames(v, 1);
    assert.notEqual(v.actor.mode, 'deploy', 'not its turn yet');
    assert.equal(v.body.alpha, 0, 'no body');
    assert.equal(v.hud.alpha, 0, 'no bars');
    assert.equal(v.shadow.alpha, 0, 'no shadow');
    assert.ok(!v._facing?.root?.visible, 'no ground ring');
    frames(v, 12);                                      // 0.22 s
    assert.notEqual(v.actor.mode, 'deploy');
    frames(v, 2, 1 / 30);                               // past 2 × 0.12 s
    assert.equal(v.actor.mode, 'deploy', 'its drop starts');
    assert.equal(v.body.alpha, 1);
    assert.ok(v.shadow.alpha > 0.4);
    assert.ok(v.actor.deployElapsed() < 0.1, `from the clip's start (${v.actor.deployElapsed()})`);
    // a long hitch uses at most 0.25 s of the wait; the first of the opening and a later deploy do not wait
    const w = unit(store(), { id: 8 });
    w.onDeploy({ order: 4 });                           // 0.48 s, model still loading
    frames(w, 1, 1.4);
    assert.ok(w._bornHold > 0.2, `a hitch does not use it up (${w._bornHold})`);
    const f = unit(store(), { id: 9 });
    await settle();
    frames(f, 30);
    f.onDeploy({ order: 0 });
    assert.equal(f.actor.mode, 'deploy', 'the first drops at once');
    const p = new UnitView(fakeViewCtx(fake.P, { assets: store(), cam }), { id: 10, side: 'ally', kind: 'chess', defId: TEXAS, spine: TEXAS, tier: 1, x: 5, y: 10, maxHp: 1, dir: 'RIGHT' }, { prep: true });
    await settle();
    frames(p, 30);
    p.onDeploy({ order: 3 });
    assert.equal(p.actor.mode, 'deploy', 'a prep piece never waits');
    // app.js numbers the allied deploys of the battle's first game second (not a scouted board, not a device)
    const app = readFileSync(path.join(ROOT, 'public/js/render/app.js'), 'utf8');
    assert.match(app, /const order = v && !battleMeta\?\.prep && v\.info\?\.side === 'ally' && v\.info\.kind !== 'device' && now <= OPENING_DROP_GT \? openingDrops\+\+ : 0;\n\s+if \(v\) \{ v\.onDeploy\?\.\(\{ order \}\);/);
    assert.match(app, /renderT0Battle = null;\n\s+openingDrops = 0;/);
  });

  test('fx.deploy draws nothing for a bornOfficial view; app.js drops a bench arrival / board return in too', () => {
    const fx = readFileSync(path.join(ROOT, 'public/js/render/fx/arrivals.js'), 'utf8'); // fx.js split in 0.2.0
    assert.match(fx, /deploy\(view\) \{\n\s+if \(!view\) return;\n\s+if \(view\.bornOfficial\) return;/);
    const app = readFileSync(path.join(ROOT, 'public/js/render/app.js'), 'utf8');
    assert.match(app, /\(e\.area === 'hand' \|\| e\.area === 'temp'\) && !before\.some\(\(g\) => g\.uid === e\.uid\)\) \{ v\.onDeploy\?\.\(\); fx\.deploy\(v\); prepDeployed\(e, info\); \}/);
    // user 2026-10-08: a board → bench return drops in silently; the board sounds again when the prep returns after a battle
    assert.match(app, /prevBoard\.has\(e\.uid\) && v\.onDeploy\) dropped = v\.onDeploy\(\);/);
    assert.match(app, /const backFromBattle = !prepPieces\.length && promoBase\.length > 0;/);
    // user 2026-10-08: back from a battle / a scouted board the lineup drops in again (board pieces with their sound)
    assert.match(app, /else if \(backFromBattle\) \{ v\.onDeploy\?\.\(\); fx\.deploy\(v\); if \(e\.area === 'board'\) prepDeployed\(e, info\); \}/);
    // a bench → board move the direction wheel held on its tile drops in when the state shows it on the board
    assert.match(app, /pending\.has\(key\) && !moved && !splitLanded\(e, pending\.get\(key\)\.board, list\) && !\(e\.area === 'board' && !prevBoard\.has\(e\.uid\)\)/);
    // a scouted prep board drops in (scoutSeen: only new / moved pieces on a re-entry), board pieces with their sound
    assert.match(app, /if \(scoutSeen\.prev\?\.get\(id\) !== k\) \{\n\s+v\.onDeploy\?\.\(\); fx\.deploy\(v\);\n\s+if \(info\.y !== GEO\.HAND_ROW && info\.y !== GEO\.TEMP_ROW\) emit\('pieceDeploy'/);
    // user report 2026-10-07 #1: round 1's first piece (nothing before it, a sync already ran) drops in — with its sound
    assert.match(app, /\(before\.length \|\| prepSynced\) && \(e\.area === 'hand'/);
    assert.match(app, /if \(prepPieces\.length === seen\.size\) prepSynced = true;/);
    assert.match(app, /function prepDeployed\(e, info\) \{\n\s+if \(info\.kind !== 'item'\) emit\('pieceDeploy'/);
    assert.match(app, /if \(dropped === true\) \{ v\._tween = null;/);
  });
});
