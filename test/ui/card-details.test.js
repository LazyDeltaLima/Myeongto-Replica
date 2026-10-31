// Details of the official-form cards (GitHub #3 follow-up, maintainer decision 2026-10-14; docs/rules/ui.md
// 「상세 카드 세부」): the operator card's bond boxes hold the bond's icon and name only (the client's camp_tag_group_*:
// camp_tag + text_camp, both #d0d0d0); the 攻击范围 cells take the client's UICharacterAttackRangeWidget sprites; a
// summon's card takes the official form (a token is a character of the client: the same UICharacterInfoPanel).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

describe('bond boxes on the operator card', () => {
  test('no count, tier pips or active mark; icon and name in the prefab\'s #d0d0d0', () => {
    const css = read('public/css/hud-art.css');
    assert.match(css, /\.dart__tiles \.dbond \.dbond__count, \.dart__tiles \.dbond \.dbond__tiers \{ display: none; \}/);
    assert.doesNotMatch(css, /\.dart__tiles \.dbond\.is-active \{/, 'no active underline');
    assert.match(css, /\.dart__tiles \.dbond \.dbond__name \{ font-size: \.17rem; color: #d0d0d0; \}/);
    assert.match(css, /\.dart__tiles \.dbond \.dbond__icon img \{ filter: brightness\(0\) invert\(\.816\); \}/);
  });

  test('the boxes are still ChessDetail\'s bond chips: a press opens the bond popup, the title keeps the count', () => {
    const art = read('public/js/ui/detailArt.js');
    assert.match(art, /const chips = findByClass\(by\.get\('head'\), 'dbonds'\);/);
    const panel = read('public/js/ui/detailPanel.js');
    assert.match(panel, /onClick=\$\{\(\) => onBond\(id\)\}/);
    assert.match(panel, /t\('：在场 \{count\}\/\{cap\}', \{ count, cap \}\)/);
  });
});

describe('attack-range cells on the official-form cards', () => {
  test('the client\'s sprites: own cell white, range cells #fe7800 edge round rgba(253,122,63,.4), empty cells clear', () => {
    const css = read('public/css/hud-art.css');
    assert.match(css, /\.dart__range \.rgrid i \{\n  box-sizing: border-box; width: var\(--rg\); height: var\(--rg\);\n  border: max\(1px, calc\(var\(--rg\) \/ 8\)\) solid transparent; background: none;\n\}/);
    assert.match(css, /\.dart__range \.rgrid i\.on \{ border-color: #fe7800; background: rgba\(253, 122, 63, \.4\); \}/);
    assert.match(css, /\.dart__range \.rgrid i\.self \{ border-color: #fff; background: #fff; \}/);
    assert.doesNotMatch(css, /\.dart__range[^{]*\{[^}]*mint/, 'no mint in the card\'s range tile');
  });

  test('every official-form card with a range draws it in the .dart__range tile', () => {
    const js = read('public/js/ui/detailArt.js');
    for (const fn of ['ChessDetailArt', 'DeviceDetailArt', 'ItemDetailArt']) {
      const i = js.indexOf(`export function ${fn}(`);
      const body = js.slice(i, js.indexOf('\nexport function', i + 10));
      assert.match(body, /class="dart__tile dart__range"><\$\{RangeGrid\}/, fn);
    }
  });
});

describe('a summon\'s card in the official form', () => {
  test('DetailPanel renders TokenDetailArt in the .dpanel--chess family while the HUD has its official look', () => {
    const js = read('public/js/ui/detailPanel.js');
    assert.match(js, /const artToken = detail\.type === 'token' && !!hudArt\(\)\.cls;/);
    assert.match(js, /\(artDevice \|\| artEnemy \|\| artItem \|\| artToken\) && 'dpanel--chess'/, 'no box, presses pass through to the board');
    assert.match(js, /\$\{detail\.type === 'token' \? html`<\$\{artToken \? TokenDetailArt : TokenDetail\} token=/);
  });

  test('TokenDetailArt: class box, name, tier | LV, stats, 攻击范围, HP bar, no bond boxes, tabs 技能 / 特性 / 天赋 / 说明', async () => {
    const js = read('public/js/ui/detailArt.js');
    const i = js.indexOf('export function TokenDetailArt(');
    const body = js.slice(i, js.indexOf('\n/**', i));
    assert.ok(i > 0 && body.length > 0);
    for (const cls of ["'dart', 'is-token'", 'dart__bg', 'dart__head', 'dart__prof', 'dart__name', 'dart__tier', 'dart__lv', 'dart__mid', 'dart__stats', 'dart__tile dart__range', 'dart__hp', 'dart__tabs', 'dart__pane']) assert.ok(body.includes(cls), cls);
    for (const k of ['攻击', '防御', '法抗', '阻挡', '费用', '攻击范围', '生命', '召唤物']) assert.ok(body.includes(`t('${k}')`), k);
    for (const k of ['技能', '特性', '天赋', '说明']) assert.match(body, new RegExp(`label: N_\\('${k}'\\)`), k);
    assert.ok(!body.includes('dbond'), 'no bond boxes');
    assert.match(body, /tokenVariantFor\(token, ownerId\)/, 'the owner\'s variant');
    assert.match(body, /summonDeployHint\(token\)/, 'our 说明 hint stays');
    const { TokenDetailArt } = await import('../../public/js/ui/detailArt.js');
    assert.equal(typeof TokenDetailArt, 'function');
    const css = read('public/css/hud-art.css');
    assert.match(css, /\.dart\.is-summon \.dart__prof img \{/);
  });

  test('TokenDetailArt reads a talent list only: 炎佑\'s enemy-shaped `{ bb, bbStr }` talents do not crash the card', () => {
    const tokens = JSON.parse(read('data/tokens.json'));
    const shaped = Object.values(tokens).filter((x) => x && x.talents != null && !Array.isArray(x.talents)).map((x) => x.tokenId);
    assert.ok(shaped.includes('enemy_9012_acloon'), 'the data still has an object-shaped talents record');
    const js = read('public/js/ui/detailArt.js');
    const i = js.indexOf('export function TokenDetailArt(');
    const body = js.slice(i, js.indexOf('\n/**', i));
    assert.match(body, /\(Array\.isArray\(rec\.talents\) \? rec\.talents : \[\]\)\.filter\(/);
    assert.doesNotMatch(body, /\(rec\.talents \|\| \[\]\)/);
  });
});

describe('the class box of a TRAP / TOKEN character', () => {
  // the client's status subpanel gives TOKEN and TRAP one sprite, icon_profession_token_lighten of
  // arts/ui/[uc]battlecommon.ab (maintainer decision 2026-10-14): the device, item and summon cards draw it
  test('ClassBox: the local-client sprite as the whole box, else the fallback in the plain box', async () => {
    const js = read('public/js/ui/detailArt.js');
    assert.match(js, /export const TRAP_CLASS_SPRITE = 'icon_profession_token_lighten';/);
    assert.match(js, /const src = localAsset\('ui\/battlecommon', TRAP_CLASS_SPRITE\);/);
    assert.match(js, /cx\('dart__prof', ok && 'is-sprite'\)/);
    assert.match(js, /onError=\$\{\(\) => setBad\(src\)\}/, 'a sprite that fails to load falls back');
    const fn = (name) => { const i = js.indexOf(`export function ${name}(`); return js.slice(i, js.indexOf('\nexport function', i + 10)); };
    assert.match(fn('DeviceDetailArt'), /<\$\{ClassBox\} fallback=\$\{html`<\$\{Icon\} name="info" \/>`\} \/>/, 'device: info glyph fallback');
    assert.match(fn('ItemDetailArt'), /<\$\{ClassBox\} fallback=\$\{html`<\$\{Icon\} name="info" \/>`\} \/>/, 'item: info glyph fallback');
    assert.match(fn('TokenDetailArt'), /<\$\{ClassBox\} fallback=\$\{html`<\$\{Img\} src=\$\{tokenAvatarUrl\(m, token\?\.tokenId\)\}/, 'summon: avatar fallback');
    assert.match(fn('TokenDetailArt'), /mapChar\n\s+\? html`<span class="dart__prof"><i style=\$\{prof/, 'a map character keeps its profession icon');
    assert.match(fn('ChessDetailArt'), /body\.profession === 'TOKEN' \|\| body\.profession === 'TRAP'\n\s+\? html`<\$\{ClassBox\}/);
    const { ClassBox } = await import('../../public/js/ui/detailArt.js');
    assert.equal(typeof ClassBox, 'function');
    const css = read('public/css/hud-art.css');
    assert.match(css, /\.dart \.dart__head > \.dart__prof\.is-sprite \{ border: 0; background: none; box-shadow: none; overflow: visible; \}/);
    assert.match(css, /\.dart__prof\.is-sprite > \.dart__profsprite \{ width: 100%; height: 100%; object-fit: contain; \}/);
    // after every rule it overrides (same specificity or lower)
    const at = css.indexOf('.dart__prof.is-sprite {');
    for (const r of ['.dart.is-item.is-golden .dart__prof {', '.dart.is-token .dart__prof {', '.dart.is-summon .dart__prof {']) assert.ok(css.indexOf(r) >= 0 && css.indexOf(r) < at, r);
  });

  test('the extractor keeps the sprite in its ui/battlecommon job', () => {
    const py = read('tools/local-extract/extract.py');
    const job = py.slice(py.indexOf("('arts/ui/[uc]battlecommon.ab', 'ui/battlecommon'"), py.indexOf("('battle/[pack]common.ab'"));
    assert.match(job, /\|icon_profession_token_lighten\)\$'\),/);
  });
});
