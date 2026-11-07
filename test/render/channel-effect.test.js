// test/render/channel-effect.test.js — a skill ability's ChannelingEffectEmitter (modes.json `skills[i].channel`): 星熊 S3's
// hsguma_skill_03_start on her from the first strike to the skill's end. Before, the `_start` name rule played it once at the
// skill's start and its 2.5 s ran out with 22 s of the skill to go. docs/rules/fx.md 「채널 공격의 이펙트」.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { activationEffects } from '../../public/js/render/fxmap.js';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const NAME = 'hsguma_skill_03_start';
const OP = 'char_136_hsguma';
const settle = () => new Promise((r) => setTimeout(r, 20));
const MODES_FILE = new URL('../../public/assets/local/fx/modes.json', import.meta.url);

test('the extraction reads 星熊 S3\'s emitter as her `channel`, and only hers in the pool', { skip: !existsSync(MODES_FILE) }, () => {
  const modes = JSON.parse(readFileSync(MODES_FILE, 'utf8'));
  const got = Object.entries(modes).flatMap(([id, m]) => (m.skills || []).flatMap((s, i) => (s?.channel ? [[id, i, s.channel]] : [])));
  assert.deepEqual(got, [[OP, 2, [NAME]]]);
});

test('a channel effect is no activation effect, though its name is a `_start`', () => {
  const pre = ['x_skill_01_start', 'x_skill_01_buff'];
  assert.ok(activationEffects({ skills: [{}] }, pre, 0).start.includes('x_skill_01_start'), 'the name rule would take it');
  const a = activationEffects({ skills: [{ channel: ['x_skill_01_start'] }] }, pre, 0);
  assert.deepEqual(a.start, []);
  assert.deepEqual(a.loops, ['x_skill_01_buff']);
});

test('the layer holds it from the event\'s strike time, and a skill cut before that strike plays none', async () => {
  const files = {
    '/assets/local/fx/index.json': { bundles: { hsguma: [NAME, 'hsguma_skill_03_buff'] } },
    '/assets/local/fx/modes.json': { [OP]: { modes: ['Default'], skills: [{}, {}, { cast: [], castLoop: [], buff: ['hsguma_skill_03_buff'], target: [], targetBuff: [], channel: [NAME] }] } },
  };
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const plays = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', trace: (q) => plays.push(q), dry: true });
    await settle();
    const op = { id: 1, x: 1, y: 0, alive: true, info: { id: 1, side: 'ally', kind: 'op', defId: OP, spine: OP, skillIndex: 2 } };
    const views = new Map([[1, op]]);
    const held = () => plays.filter((q) => q.names?.includes(NAME));
    const step = (dt) => layer.update(dt, null, null);
    layer.onEvent(['skill', 1, 1, null, [0.4, 25]], views);
    await settle();
    assert.equal(held().length, 0, 'not at the skill\'s start');
    step(0.2);
    assert.equal(held().length, 0, 'not before the strike');
    step(0.3);
    await settle();
    assert.equal(held().length, 1, 'at the strike');
    assert.equal(held()[0].kind, 'skillBuff', 'held with her buffs: stopBuffs ends it as the skill ends');
    step(5);
    assert.equal(held().length, 1, 'once');
    plays.length = 0;
    layer.onEvent(['skill', 1, 1, null, [0.4, 25]], views);
    layer.onEvent(['skill', 1, 0], views);
    step(1);
    await settle();
    assert.equal(held().length, 0, 'cut before its strike');
  } finally { globalThis.fetch = fetch0; }
});
