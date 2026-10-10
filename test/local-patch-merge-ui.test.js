// Local patch (docs/LOCAL-PATCH.md 「0.2.0 병합」): 0.2.0 features that landed beside ours on the screen.
// The official-look detail card (ui/detailArt.js) of a 0.2.0 补位 stand-in and of a 自选 piece — on a tap and while the
// piece is dragged / waits for its direction:
// - a stand-in's card showed the chess it replaces (art, name, stats) with the stand-in's skill tab, no 「替补」.
// - maintainer report 2026-10-08: dragging a 自选 piece showed the bare slot record 「自选干员」 (stats —) — placingDetail
//     resolved without the player's m.private.
// - the card's 自选 stats are the battle's (server/sim/simdata.js getDiy) — checked equal, pinned here.
// the round-start banner of an eliminated player / spectator seat says 观战中, not 获得 +0. The boss round's pair
// wears one frame (ours), not ours + upstream's .team__frame. (the 「自选」 tag: test/ui/diy-ui.test.js;
// test/ui/gameLogic.test.js, test/local-patch-battleover.test.js.)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.fetch = async (url) => {
  const name = String(url).split('/').pop();
  try {
    const body = readFileSync(path.join(ROOT, 'data', name), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};

const { options } = await import('../public/vendor/preact.module.js');
const G = await import('../public/js/ui/gameLogic.js');
const { ChessDetailArt, placingDetail } = await import('../public/js/ui/detailArt.js');
const { RoundStartBanner } = await import('../public/js/ui/phaseArt.js');
const { data } = await import('../public/js/data.js');
const { DATA } = await import('./match/harness.js');
const { DataSource } = await import('../server/sim/simdata.js');
const { loadGenerated } = await import('../server/sim/nodeData.js');

await data.loadAll('chess', 'bonds', 'assets', 'garrisons', 'items', 'backups');

const D = { chess: DATA.chess, backups: DATA.backups };
const EXUSIAI = 'chess_char_3_01_a'; // 能天使: droppable — fielded as its stand-in when not owned
const WANG = 'char_2027_wang';
const CHEN3 = 'char_1050_chen3';

function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  yield* walk(v.props?.children);
}
const hasClass = (v, c) => typeof v?.props?.class === 'string' && v.props.class.split(/\s+/).includes(c);
const textOf = (v) => [...walk(v)].map((x) => x.props?.children).flat().filter((x) => typeof x === 'string' || typeof x === 'number').join('');
/** Call a hook-using component outside a render: point preact's hooks at a throwaway component first. */
const render = (Comp, props) => { options.__r?.({ __c: { props, setState() {}, __h: [] } }); return Comp(props); };
const statLine = (nodes, k) => {
  const line = nodes.find((v) => v?.type && v.props?.k === k);
  return line ? String(line.props.v) : null;
};
const card = (detail, extra = {}) => [...walk(render(ChessDetailArt, { chess: detail.chess, piece: detail.piece, editable: true, bonds: [], loadout: null, standIn: detail.standIn || null, diy: detail.diy || null, onSell() {}, ...extra }))];

describe('detail card (official look): 补位 stand-in and 自选 piece', () => {
  const pick = { charId: WANG, skillIndex: 2, uniEquipId: null };
  const priv = {
    playerId: 'p_0', standIns: [EXUSIAI], diy: { chess_char_6_diy1_a: pick }, loadout: null,
    hand: [{ uid: 1, kind: 'chess', id: EXUSIAI, items: [] }, { uid: 4, kind: 'chess', id: 'chess_char_6_diy1_b', golden: true, items: [] }], temp: [], board: [],
  };
  const pieces = G.indexPieces(priv);

  test('a stand-in\'s card shows the stand-in — name, 「替补」, 「X的替补」, its art and stats — the chess\'s tier stays', () => {
    const d = placingDetail({ uid: 1 }, pieces, { priv, backups: D.backups });
    const si = G.standInOf(DATA.chess[EXUSIAI], D.backups);
    assert.ok(si && si.standInFor, 'the stand-in record');
    assert.deepEqual([d.standIn?.charId, d.standIn?.standInFor], [si.charId, si.standInFor], 'resolved with the stand-in');
    const nodes = card(d);
    assert.equal(textOf(nodes.find((v) => hasClass(v, 'dart__name'))), si.name);
    assert.equal(textOf(nodes.find((v) => hasClass(v, 'dtag-standin'))), '替补');
    assert.equal(textOf(nodes.find((v) => hasClass(v, 'dart__for'))), G.standInForText(DATA.chess[EXUSIAI].name));
    const rec = G.standInLoadout(si, (id) => DATA.chess[id], D.backups).record;
    assert.equal(statLine(nodes, '攻击'), String(rec.stats.atk), 'the stand-in\'s attack');
    assert.notEqual(rec.stats.atk, DATA.chess[EXUSIAI].stats.atk, 'not the replaced operator\'s');
    assert.equal(nodes.find((v) => v?.type?.name === 'TierChip')?.props.tier, DATA.chess[EXUSIAI].tier);
    // the art is the stand-in's (its charId), not the replaced operator's
    const bg = nodes.find((v) => hasClass(v, 'dart__bg'));
    const img = [...walk(bg)].find((v) => v?.props?.src);
    if (img) assert.ok(!String(img.props.src).includes(DATA.chess[EXUSIAI].charId), `art ${img.props.src}`);
  });

  test('drag-hold card of a 自选 piece: the operator, as on a tap (maintainer report 2026-10-08)', () => {
    const held = placingDetail({ uid: 4 }, pieces, { priv, backups: D.backups });
    const tap = G.ownDiyRecord(DATA.chess.chess_char_6_diy1_b, priv, D);
    assert.equal(held.chess.charId, WANG);
    assert.deepEqual(held.diy, pick);
    assert.equal(held.chess.name, tap.name);
    // without the player's data it is the bare slot record — what the drag used to show
    assert.notEqual(placingDetail({ uid: 4 }, pieces).chess.charId, WANG);
    const src = readFileSync(path.join(ROOT, 'public/js/screens/game.js'), 'utf8');
    assert.equal((src.match(/placingDetail\(drag \|\| facing, placeCtx\.pieces, \{ priv, backups: gd\.backups \}\)/g) || []).length, 2);
  });

  test('a 自选 card\'s stats, skill and module are the battle\'s', async () => {
    const ds = new DataSource(await loadGenerated(), null);
    for (const [slot, p] of [['chess_char_6_diy1_b', pick], ['chess_char_6_diy1_b', { charId: CHEN3, skillIndex: 2, uniEquipId: 'uniequip_002_chen3' }],
      ['chess_char_5_diy1_b', { charId: 'char_4132_ascln', skillIndex: 2, uniEquipId: 'uniequip_002_ascln' }]]) {
      const pv = { ...priv, diy: { [slot.replace(/_b$/, '_a')]: p } };
      const d = placingDetail({ uid: 9 }, G.indexPieces({ ...pv, hand: [{ uid: 9, kind: 'chess', id: slot, golden: true, items: [] }] }), { priv: pv, backups: D.backups });
      const def = ds.getDiy(slot, p);
      const nodes = card(d);
      assert.equal(statLine(nodes, '攻击'), String(def.stats.atk), `${p.charId} atk`);
      assert.equal(statLine(nodes, '防御'), String(def.stats.def), `${p.charId} def`);
      const lo = G.chessLoadout(d.chess, null, G.pickGetter((id) => DATA.chess[id], p, D));
      assert.equal(lo.skill.skillId, def.skill.skillId ?? def.skill.id);
    }
  });
});

describe('round-start banner and the boss round\'s player list', () => {
  test('a watcher\'s round-start banner says 观战中 instead of 获得 +0', () => {
    const watcher = [...walk(render(RoundStartBanner, { round: 4, gold: 0, watching: true }))];
    const root = watcher[0];
    assert.match(root.props['aria-label'], /观战中/);
    assert.ok(watcher.some((v) => hasClass(v, 'is-watch') && textOf(v).includes('观战中')));
    assert.ok(!watcher.some((v) => hasClass(v, 'is-gold')), 'no 获得 box');
    const player = [...walk(render(RoundStartBanner, { round: 4, gold: 7 }))];
    assert.ok(player.some((v) => hasClass(v, 'is-gold') && textOf(v).includes('获得')));
    assert.ok(!player.some((v) => hasClass(v, 'is-watch')));
    const src = readFileSync(path.join(ROOT, 'public/js/screens/game.js'), 'utf8');
    assert.match(src, /<\$\{RoundStartBanner\} key=\$\{banner\.key\} round=\$\{pub\?\.round\} gold=\$\{roundGold\} watching=\$\{spectator \|\| !alive\}/);
  });

  test('in the official HUD look the pair\'s avatars keep one frame — upstream\'s .team__frame is hidden, ours is green', () => {
    const css = readFileSync(path.join(ROOT, 'public/css/hud-art.css'), 'utf8');
    assert.match(css, /\.gm\.has-hud-art\.has-hud-team \.team__frame \{ display: none; \}/);
    assert.match(css, /\.gm\.has-hud-art\.has-hud-team \.team__row\.is-team \.team__btn::after \{ background: #59ffd2; \}/);
  });
});

describe('detail card (official look): 0.2.2 潜能 / 练度 (upstream 7a0937e3)', () => {
  test('the card\'s stats are the operator\'s at the player\'s 潜能 / 练度 (DetailPanel cultOpts), as ChessDetail and the battle', async () => {
    await data.loadAll('effects');
    const chess = DATA.chess.chess_char_1_06_a; // 刺玫 (the upstream potential-ui test's operator)
    const ops = { [chess.charId]: { potential: 1, cultivate: 0 } };
    const at = (cultOpts) => statLine(card({ chess, piece: null }, { cultOpts }), '攻击');
    const want = (o) => String(Math.round(G.chessLoadout(chess, null, (id) => DATA.chess[id], { ...o, effects: data.get('effects') }).record.stats.atk)); // the card rounds
    assert.equal(at({ ops }), want({ ops }), '潜能1 / 练度0');
    assert.equal(at({ ops: {} }), want({ ops: {} }), 'the defaults (满潜能, 练度 3)');
    assert.notEqual(at({ ops }), at({ ops: {} }));
    assert.equal(at({ cultivation: { potential: 1, cultivate: 0 } }), want({ ops }), 'a teammate\'s unit at its own');
  });
});
