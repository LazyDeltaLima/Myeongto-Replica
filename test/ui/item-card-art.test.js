// An item's card in the operator card's official form (GitHub #3 follow-up, maintainer decision 2026-10-14): in the
// client every 装备 / 奇术 is a trap (items.json `trapId`, `Trap : Token : Character`) and a press on it opens
// UICharacterInfoPanel like an operator's — the maintainer's capture of 不屈弹射器 shows the class box, the name, the
// tier | LV 1, 攻击 / 防御 / 法抗 / 阻挡 / 费用 0, the 攻击范围 tile, 生命 100/100 and the tab 技能 (the item's art, its
// name, 被动, the effect). ui/detailArt.js ItemDetailArt; detailPanel.js picks it while the HUD has its official look.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(read(p));
const EXCEL = new URL('../../.cache/gamedata/excel/', import.meta.url);
const haveTables = existsSync(new URL('character_table.json', EXCEL)) && existsSync(new URL('skill_table.json', EXCEL)) && existsSync(new URL('range_table.json', EXCEL));

describe('the trap behind an item', () => {
  test('itemTrapStats: LV 1, HP 100, everything else 0, a 奇术 costs 5', async () => {
    const { itemTrapStats } = await import('../../public/js/ui/detailArt.js');
    assert.deepEqual(itemTrapStats({ itemType: 'EQUIP' }), { level: 1, maxHp: 100, atk: 0, def: 0, res: 0, blockCnt: 0, cost: 0 });
    assert.equal(itemTrapStats({ itemType: 'MAGIC' }).cost, 5);
  });

  test('every item\'s trap in the official tables has those numbers, PASSIVE skills and the item\'s range', { skip: !haveTables && 'no downloaded tables (.cache/gamedata)' }, async () => {
    const { itemTrapStats } = await import('../../public/js/ui/detailArt.js');
    const ct = JSON.parse(readFileSync(new URL('character_table.json', EXCEL), 'utf8'));
    const st = JSON.parse(readFileSync(new URL('skill_table.json', EXCEL), 'utf8'));
    const rt = JSON.parse(readFileSync(new URL('range_table.json', EXCEL), 'utf8'));
    const items = Object.values(json('data/items.json'));
    assert.ok(items.length > 100);
    for (const it of items) {
      const c = ct[it.trapId];
      assert.ok(c, `${it.id}: trap ${it.trapId}`);
      assert.equal(c.profession, 'TRAP', it.id);
      const p = c.phases[0];
      const a = p.attributesKeyFrames[0].data;
      const s = itemTrapStats(it);
      assert.deepEqual([a.maxHp, a.atk, a.def, a.magicResistance, a.blockCnt, a.cost], [s.maxHp, s.atk, s.def, s.res, s.blockCnt, s.cost], it.id);
      assert.equal(p.attributesKeyFrames[0].level, s.level, it.id);
      for (const sk of c.skills || []) assert.equal(st[sk.skillId]?.levels?.[0]?.skillType, 'PASSIVE', `${it.id} ${sk.skillId}`);
      const grid = (rt[p.rangeId]?.grids || []).map((g) => `${g.row},${g.col}`).sort();
      assert.deepEqual((it.rangeGrid || []).map(([r, cc]) => `${r},${cc}`).sort(), grid, `${it.id} range ${p.rangeId}`);
    }
  });
});

describe('the card', () => {
  test('DetailPanel renders ItemDetailArt in the .dpanel--chess family while the HUD has its official look', () => {
    const js = read('public/js/ui/detailPanel.js');
    assert.match(js, /const artItem = detail\.type === 'item' && !!hudArt\(\)\.cls;/);
    assert.match(js, /\(artDevice \|\| artEnemy \|\| artItem\) && 'dpanel--chess'/, 'no box, presses pass through to the board');
    assert.match(js, /\$\{detail\.type === 'item' \? html`<\$\{artItem \? ItemDetailArt : ItemDetail\} item=/);
  });

  test('ItemDetailArt: class box, name, tier | LV, the trap\'s stats, 攻击范围, HP bar, tabs 技能 / 天赋 / 说明', async () => {
    const js = read('public/js/ui/detailArt.js');
    const body = js.slice(js.indexOf('export function ItemDetailArt('), js.indexOf('/** The first vnode under'));
    assert.ok(body.length > 0);
    for (const cls of ["'dart', 'is-item'", 'dart__bg', 'dart__head', 'dart__prof', 'dart__name', 'dart__tier', 'dart__lv', 'dart__mid', 'dart__stats', 'dart__range', 'dart__hp', 'dart__tabs', 'dart__pane']) assert.ok(body.includes(cls), cls);
    for (const k of ['攻击', '防御', '法抗', '阻挡', '费用', '攻击范围', '生命', '被动']) assert.ok(body.includes(`t('${k}')`), k);
    assert.match(body, /label: N_\('技能'\)/);
    assert.match(body, /item\?\.canGiveBond \? \{ id: 'talents', label: N_\('天赋'\)/, 'a 变形同构体 keeps its pairings');
    assert.match(body, /label: N_\('说明'\)/);
    assert.match(body, /itemIconUrl\(m, item\)/, 'the item\'s art is the skill icon');
    assert.match(body, /item\?\.effectName \|\| item\?\.name/);
    assert.match(body, /piece && editable && onDestroy \?/, '销毁 only for a caller that passes it (the underframe\'s in the match)');
    const { ItemDetailArt } = await import('../../public/js/ui/detailArt.js');
    assert.equal(typeof ItemDetailArt, 'function');
    const css = read('public/css/hud-art.css');
    assert.match(css, /\.dart\.is-item \.dart__prof \{/);
    assert.match(css, /\.dart__pane--skill \.dskill__icon--item \{/);
  });
});
