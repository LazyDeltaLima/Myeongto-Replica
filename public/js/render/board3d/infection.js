// render/board3d/infection.js — local patch (src/docs/LOCAL-PATCH.md 「공식 맵 렌더링」): the 活性源石 tile's own effect on
// the official stage scene. The tile (`tile_infection`, act1autochess_m04) is a plain sand tile whose decal (frame, dashed
// rings, crystal, WARNING sticker) is part of the scene; its Tile component spawns `_effect` map_promote_01
// (battle/prefabs/effects/map.ab, EN client): under static_offset (+0.29) / fixed (+0.129) four built-in Quads standing
// around the tile, material map_promote_04 — Torappu/Particles/Dissolve/Dissolve(CustomData), read from the compiled
// shader: uvMain = uv · _MainTex_ST.xy + _MainTex_ST.zw + time · (_MainUSpeed, _MainVSpeed); rgb = 2 · tex.rgb ·
// _MainColor.rgb; alpha = saturate(2 · tex.a · _MainColor.a · _Opacity · saturate((dissolve.r − _DissolveIntensity) /
// _BorderWidth)); Blend SrcAlpha OneMinusSrcAlpha (_DstBlend 10), Cull Off, ZWrite Off, ZTest LEqual. Values:
// _MainColor (0.963, 0.120, 0.064, 1), _MainTex flow_26 ST (0.27, 1, −1.2259, 0), _MainUSpeed 0.5, _DissolveTex mask_123
// ST (1, 1, 0, 0), _DissolveIntensity 0.044, _BorderWidth 0.409, _Opacity 1; no animation clip — thin red streaks that
// run up the walls. Textures: tools/local-extract/boardfx_extract.py (manifest group board/fx); without them nothing is
// drawn. [추정] it stands on every 活性源石 tile all the time (a Tile `_effect`, like the gates' tile_start / tile_end).
//
//   const fx = new InfectionFx(THREE, parent)
//   fx.setTiles([[r, c, z]…])   fx.setImages({ flow, mask })   fx.update(t)   fx.dispose()

/** The four quads of map_promote_01 in board space (x = col, y = row, z = up) relative to the tile centre; corners in
 *  Unity Quad order with uv (0,0) (1,0) (1,1) (0,1) — uv.x runs DOWN each wall, uv.y along it. */
export const PROMOTE_QUADS = Object.freeze([
  [[0.462, -0.5, 0.87], [0.462, -0.5, -0.13], [0.462, 0.5, -0.13], [0.462, 0.5, 0.87]],
  [[-0.56, -0.5, 1.7086], [-0.56, -0.5, -0.1906], [-0.56, 0.5, -0.1906], [-0.56, 0.5, 1.7086]],
  [[0.45, -0.5, 2.4229], [0.45, -0.5, -0.3609], [-0.55, -0.5, -0.3609], [-0.55, -0.5, 2.4229]],
  [[0.443, 0.494, 0.3829], [0.443, 0.494, -0.1429], [-0.557, 0.494, -0.1429], [-0.557, 0.494, 0.3829]],
]);
const QUAD_UV = [0, 0, 1, 0, 1, 1, 0, 1];
/** map_promote_04's material values. */
export const PROMOTE = Object.freeze({ color: [0.963235, 0.119574, 0.063744], st: [0.27, 1, -1.225937, 0], uSpeed: 0.5, dissolve: 0.044, border: 0.409 });

/** Positions / uvs / indices of the effect on `tiles` ([[r, c, z]…]: z = the tile's top). */
export function promoteData(tiles) {
  const list = (Array.isArray(tiles) ? tiles : []).filter((t) => Array.isArray(t) && Number.isFinite(t[0]) && Number.isFinite(t[1]));
  if (!list.length) return null;
  const n = list.length * PROMOTE_QUADS.length;
  const position = new Float32Array(n * 12), uv = new Float32Array(n * 8), index = new Uint16Array(n * 6);
  let q = 0;
  for (const [r, c, z = 0] of list) {
    for (const quad of PROMOTE_QUADS) {
      quad.forEach(([x, y, h], k) => position.set([c + x, r + y, (Number(z) || 0) + h], q * 12 + k * 3));
      uv.set(QUAD_UV, q * 8);
      const b = q * 4;
      index.set([b, b + 1, b + 2, b, b + 2, b + 3], q * 6);
      q++;
    }
  }
  return { position, uv, index };
}

const VERT = /* glsl */`
uniform float uTime;
varying vec2 vMain;
varying vec2 vMask;
void main() {
  vMain = vec2(uv.x * ${PROMOTE.st[0]} + (${PROMOTE.st[2]}) + uTime * ${PROMOTE.uSpeed.toFixed(3)}, uv.y * ${PROMOTE.st[1].toFixed(1)});
  vMask = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG = /* glsl */`
uniform sampler2D uMain;
uniform sampler2D uMask;
varying vec2 vMain;
varying vec2 vMask;
void main() {
  float k = clamp((texture2D(uMask, vMask).r - ${PROMOTE.dissolve}) / ${PROMOTE.border}, 0.0, 1.0);
  vec4 t = texture2D(uMain, vMain);
  float a = clamp(2.0 * t.a * k, 0.0, 1.0);
  if (a < 0.004) discard;
  gl_FragColor = vec4(min(2.0 * t.rgb * vec3(${PROMOTE.color.join(', ')}), vec3(1.0)), a);  // gamma space, as official.js
}`;

export class InfectionFx {
  constructor(THREE, parent) {
    const T = THREE;
    this.T = T;
    this.parent = parent;
    this.material = new T.ShaderMaterial({
      uniforms: { uMain: { value: null }, uMask: { value: null }, uTime: { value: 0 } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: true, side: T.DoubleSide, fog: false, toneMapped: false,
      blending: T.NormalBlending,
    });
    this.mesh = new T.Mesh(new T.BufferGeometry(), this.material);
    this.mesh.renderOrder = 6;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.key = '';
    this.rev = 0; // bumped by every change of what is drawn (the board redraws: scene.js BOARD_REDRAW_MAX_S)
    parent?.add?.(this.mesh);
  }

  _texture(img, repeat) {
    const T = this.T;
    const tex = new T.Texture(img);
    tex.colorSpace = T.NoColorSpace ?? tex.colorSpace;
    tex.wrapS = tex.wrapT = repeat ? T.RepeatWrapping : T.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  /** The client textures (flow_26, mask_123); until both are set nothing is drawn. */
  setImages({ flow, mask } = {}) {
    const U = this.material.uniforms;
    if (flow && (flow.width || flow.naturalWidth)) { U.uMain.value?.dispose?.(); U.uMain.value = this._texture(flow, true); }
    if (mask && (mask.width || mask.naturalWidth)) { U.uMask.value?.dispose?.(); U.uMask.value = this._texture(mask, false); }
    this._sync();
  }

  /** The 活性源石 tiles shown ([[r, c, z]…], null clears). */
  setTiles(tiles) {
    const data = promoteData(tiles);
    const key = data ? Array.from(data.position).join(',') : '';
    if (key !== this.key) {
      this.key = key;
      this.mesh.geometry.dispose();
      const g = new this.T.BufferGeometry();
      if (data) {
        g.setAttribute('position', new this.T.BufferAttribute(data.position, 3));
        g.setAttribute('uv', new this.T.BufferAttribute(data.uv, 2));
        g.setIndex(new this.T.BufferAttribute(data.index, 1));
      }
      this.mesh.geometry = g;
    }
    this._sync();
  }

  _sync() {
    this.rev++;
    const U = this.material.uniforms;
    this.mesh.visible = !!this.key && !!U.uMain.value && !!U.uMask.value;
  }

  update(t) { if (this.mesh.visible) this.material.uniforms.uTime.value = t % 1000; }

  dispose() {
    this.parent?.remove?.(this.mesh);
    this.mesh.geometry.dispose();
    this.material.uniforms.uMain.value?.dispose?.();
    this.material.uniforms.uMask.value?.dispose?.();
    this.material.dispose();
  }
}
