// The shop card frame goes by the piece's tier, as the client's card does (docs/rules/ui.md 「상점 화면」, card frame):
// tier 6 → frame_lv3 (orange), tier 5 → frame_lv2 (gold), every other card → frame_lv1. The selected / merge-ready card
// has its own marks (game-shop.css) and no frame of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const css = fs.readFileSync(path.join(ROOT, 'public/css/shop-art.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of every rule whose selector list matches `re`. */
const rules = (re) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => re.test(m[1])).map((m) => ({ sel: m[1].trim(), body: m[2] }));

test('shop card frame: tier 5 gold, tier 6 orange, frame_lv1 for the rest', () => {
  const frameRules = rules(/\.scard[^,{]*::before/).filter((r) => /--sa-card-frame/.test(r.body));
  const by = (n) => frameRules.filter((r) => r.body.includes(`--sa-card-frame${n}`)).map((r) => r.sel);
  assert.ok(by(1).some((s) => /\.scard:not\(\.scard--sold\)::before/.test(s)), 'every card starts on frame_lv1');
  assert.ok(by(2).some((s) => /\.scard--t5\b/.test(s)), 'tier 5 takes frame_lv2');
  assert.ok(by(3).some((s) => /\.scard--t6\b/.test(s)), 'tier 6 takes frame_lv3');
  for (const n of [2, 3]) {
    for (const s of by(n)) assert.doesNotMatch(s, /is-armed|is-merge/, `frame_lv${n} is a tier frame, not a selection mark: ${s}`);
  }
});
