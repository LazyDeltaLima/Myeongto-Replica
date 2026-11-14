// test/render/fx-submit.test.js — render/fxsubmit.js blockSource: the effect program's plain uniforms it is told to take
// move into one std140 block, declared the same in both stages where the first of them stood; samplers and the rest stay
// (docs/rules/render.md 「이펙트 그리기 전용 경로」). The pictures themselves: fx-submit.browser.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockSource } from '../../public/js/render/fxsubmit.js';

const VS = `#version 300 es
precision highp float;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec4 uTint; uniform highp int uPFlags; uniform sampler2D uMain;
#define uOn ((uPFlags & 1) != 0)
void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(uTint.xyz, 1.0); }`;
const FS = `#version 300 es
precision highp float;
uniform vec4 uTint; uniform vec2 uSpeed; uniform sampler2D uMain;
out vec4 c;
void main() { c = uTint * texture(uMain, uSpeed); }`;

test('blockSource moves the taken plain uniforms into one block, the same in both stages', () => {
  const take = (n, type) => !type.startsWith('mat') && n !== 'uSkip';
  const r = blockSource(VS, FS, take);
  assert.deepEqual(r.members, ['uTint', 'uPFlags', 'uSpeed']);
  const block = 'layout(std140) uniform FxDraw {\n  vec4 uTint;\n  int uPFlags;\n  vec2 uSpeed;\n};';
  for (const src of [r.vs, r.fs]) {
    assert.equal(src.split(block).length, 2, 'one block, the whole member list, in each stage');
    assert.match(src, /uniform sampler2D uMain;/, 'samplers stay uniforms');
    assert.doesNotMatch(src.replace(block, ''), /uniform (vec4|int|highp int|vec2) (uTint|uPFlags|uSpeed);/);
  }
  // the matrices are not taken here (fxsubmit.js keeps them plain: in a block they changed the shader's arithmetic)
  assert.match(r.vs, /uniform mat4 modelViewMatrix;\nuniform mat4 projectionMatrix;/);
  // where the first taken one stood: before the #define that reads uPFlags
  assert.ok(r.vs.indexOf('FxDraw') < r.vs.indexOf('#define uOn'));
});

test('blockSource refuses one name with two types', () => {
  assert.throws(() => blockSource('uniform vec4 uA;', 'uniform vec2 uA;', () => true), /uA/);
});
