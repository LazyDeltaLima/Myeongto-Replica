// render/board3d/tileOverlay.js — local patch (src/docs/LOCAL-PATCH.md 「배치 UI」): the official placement overlays drawn
// in the 3D board itself, so they lie on the tiles (tops and the sides of raised tiles) under the Pixi units.
//
//   tint     the deployable tiles while a piece is dragged (render/app.js highlight group 'legal'): the tile column is
//            MULTIPLIED green, so the floor pattern shows through. Measured on the official KR client (gameplay capture,
//            2000×1125): a grey high-ground top 128,125,113 → 66,130,66 and a sand tile → ≈ 144,230,89, i.e. × ≈ (0.58, 1.1,
//            0.58) — a 2× modulate (src·dst + dst·src) with src = (0.29, 0.55, 0.29). [추정] the mechanism: the client's
//            tile highlight is native code (shader Torappu/Scene/Special/HighlightTile exists, its material is made at run
//            time); the colour is fitted to the capture.
//   bench    the bench slots (hand pads) while a piece is dragged: the same 2× modulate in a teal tone. The client gives
//            valid bench tiles their own highlight + emission colour (AutoChessGameMode
//            AUTOCHESS_VALID_HANDTILE_CUSTOM_HIGHLIGHT / _EMISSION — static readonly, set in native code: no value in the
//            data); fitted to the maintainer's KR capture (2026-10-07, an item dragged): the bench plank 245,198,138 (ours,
//            untinted) → 140,215,177, × (0.57, 1.09, 1.28).
//   stripes  range previews (the direction wheel's 'facing', a selected piece's 'selRange' …): the client's attack-range
//            material (battle/[pack]common.ab `range_material`, shader Torappu/Battle/AttackRange): texture
//            `sprite_attack_range` (white diagonal stripes, 3 per tile) × colour, alpha _Color.a 0.749, alpha blend, no
//            depth write, scrolling (_AnimationSpeed 0.5). Colour orange 255,140,0 (the capture: 225,148,20 over the green
//            tint = 0.75 · orange + 0.25 · green) [추정: set at run time]. Without the extracted texture a procedural copy
//            (same stripes) is used.
//
//   const ov = new TileOverlay(THREE, scene)
//   ov.setTint(tiles | null, heightAt)        [[r, c]] board tiles; heightAt(r, c) = top height (tiles.heightAt)
//   ov.setBenchTint(tiles | null, heightAt)
//   ov.setStripes(tiles | null, heightAt)
//   ov.setStripeImage(img)                    HTMLImageElement of sprite_attack_range (optional)
//   ov.update(timeSec) · ov.dispose()
// Geometry is rebuilt only when a set changes (a few hundred vertices); nothing is allocated per frame.

/** 2× modulate source colour of the deploy tint (× 0.58, 1.1, 0.58). */
export const TINT = Object.freeze([0.29, 0.55, 0.29]);
/** 2× modulate source colour of the bench tint (× 0.58, 1.1, 1.3 — teal; fitted to the KR capture). */
export const BENCH_TINT = Object.freeze([0.29, 0.55, 0.65]);
/** Attack-range stripes: colour (sRGB 0..1), alpha (range_material _Color.a), scroll speed (uv / s, _AnimationSpeed). */
export const STRIPES = Object.freeze({ color: [1, 0.55, 0], alpha: 0.749, speed: 0.5 });
/** Lift of the overlays above coplanar board surfaces (depth units, polygon offset). */
const OFFSET = { tint: [-1, -4], stripes: [-2, -8] };
const RAISED = 0.01;

/**
 * Positions / uvs of the tile columns: a top quad at the tile's height and, for a raised tile, its 4 sides down to the
 * ground. uv = world (x + 0.5, y + 0.5 + z): continuous across tiles and up the sides (the stripes run on).
 * @returns {{ position: Float32Array, uv: Float32Array, index: Uint16Array|Uint32Array } | null}
 */
export function columnData(tiles, heightAt) {
  const list = [];
  const seen = new Set();
  for (const t of Array.isArray(tiles) ? tiles : []) {
    const r = Array.isArray(t) ? t[0] : t?.row, c = Array.isArray(t) ? t[1] : t?.col;
    if (!Number.isInteger(r) || !Number.isInteger(c) || seen.has(r * 64 + c)) continue;
    seen.add(r * 64 + c);
    let h = 0;
    try { h = Math.max(0, Number(heightAt?.(r, c)) || 0); } catch { h = 0; }
    list.push([r, c, h]);
  }
  if (!list.length) return null;
  const quads = list.reduce((n, [, , h]) => n + (h > RAISED ? 5 : 1), 0);
  const position = new Float32Array(quads * 12), uv = new Float32Array(quads * 8);
  const index = quads * 4 > 65535 ? new Uint32Array(quads * 6) : new Uint16Array(quads * 6);
  let q = 0;
  const quad = (pts) => {
    for (let k = 0; k < 4; k++) {
      const [x, y, z] = pts[k];
      position.set([x, y, z], q * 12 + k * 3);
      uv[q * 8 + k * 2] = x + 0.5;
      uv[q * 8 + k * 2 + 1] = y + 0.5 + z;
    }
    const b = q * 4;
    index.set([b, b + 1, b + 2, b, b + 2, b + 3], q * 6);
    q++;
  };
  for (const [r, c, h] of list) {
    const x0 = c - 0.5, x1 = c + 0.5, y0 = r - 0.5, y1 = r + 0.5;
    quad([[x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]]);
    if (h > RAISED) {
      quad([[x0, y0, 0], [x1, y0, 0], [x1, y0, h], [x0, y0, h]]);   // −y (front)
      quad([[x1, y0, 0], [x1, y1, 0], [x1, y1, h], [x1, y0, h]]);   // +x
      quad([[x1, y1, 0], [x0, y1, 0], [x0, y1, h], [x1, y1, h]]);   // +y
      quad([[x0, y1, 0], [x0, y0, 0], [x0, y0, h], [x0, y1, h]]);   // −x
    }
  }
  return { position, uv, index };
}

/** Procedural copy of sprite_attack_range: 3 soft white diagonal stripes per tile on transparent (64 px, tiles seamlessly). */
export function stripeCanvas(doc = globalThis.document) {
  const n = 64;
  const cv = doc?.createElement?.('canvas');
  if (!cv) return null;
  cv.width = n; cv.height = n;
  const g = cv.getContext('2d');
  if (!g) return null;
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      // "/" stripes as drawn (x + y constant along a stripe, like the client's sprite; the texture's flipY keeps it "/" in uv)
      const f = (((x + y) / n) * 3) % 1;
      const a = Math.max(0, Math.min(1, (0.5 - Math.abs(f - 0.25) * 2) * 6 + 0.5));
      const i = (y * n + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const TINT_FRAG = /* glsl */`
uniform vec3 uTint;
void main() { gl_FragColor = vec4(uTint, 1.0); }`;
const STRIPE_FRAG = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uShift;
varying vec2 vUv;
void main() {
  float a = texture2D(uMap, vec2(vUv.x + uShift, vUv.y)).a * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}`;

export class TileOverlay {
  constructor(THREE, parent) {
    const T = THREE;
    this.T = T;
    this.parent = parent;
    this.time = 0;
    this.tint = this._mesh(new T.ShaderMaterial({
      uniforms: { uTint: { value: new T.Vector3(...TINT) } }, vertexShader: VERT, fragmentShader: TINT_FRAG,
      transparent: true, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
      blending: T.CustomBlending, blendEquation: T.AddEquation, blendSrc: T.DstColorFactor, blendDst: T.SrcColorFactor,
      blendSrcAlpha: T.ZeroFactor, blendDstAlpha: T.OneFactor,
      polygonOffset: true, polygonOffsetFactor: OFFSET.tint[0], polygonOffsetUnits: OFFSET.tint[1],
    }), 900);
    this.bench = this._mesh(this.tint.material.clone(), 900);
    this.bench.material.uniforms = { uTint: { value: new T.Vector3(...BENCH_TINT) } };
    const cv = stripeCanvas();
    this.stripeTex = cv ? this._texture(new T.CanvasTexture(cv)) : null;
    this.stripes = this._mesh(new T.ShaderMaterial({
      uniforms: { uMap: { value: this.stripeTex }, uColor: { value: new T.Vector3(...STRIPES.color) }, uAlpha: { value: STRIPES.alpha }, uShift: { value: 0 } },
      vertexShader: VERT, fragmentShader: STRIPE_FRAG,
      transparent: true, depthWrite: false, depthTest: true, fog: false, toneMapped: false, blending: T.NormalBlending,
      polygonOffset: true, polygonOffsetFactor: OFFSET.stripes[0], polygonOffsetUnits: OFFSET.stripes[1],
    }), 901);
    this.keys = { tint: '', bench: '', stripes: '' };
  }

  _texture(tex) {
    const T = this.T;
    tex.wrapS = T.RepeatWrapping; tex.wrapT = T.RepeatWrapping;
    tex.colorSpace = T.NoColorSpace ?? tex.colorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = T.LinearMipmapLinearFilter;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  _mesh(material, order) {
    const m = new this.T.Mesh(new this.T.BufferGeometry(), material);
    m.renderOrder = order;
    m.frustumCulled = false;
    m.visible = false;
    m.castShadow = false; m.receiveShadow = false;
    this.parent?.add?.(m);
    return m;
  }

  _set(which, tiles, heightAt) {
    const mesh = this[which];
    const data = columnData(tiles, heightAt);
    const key = data ? Array.from(data.position).join(',') : '';
    if (key === this.keys[which]) return;
    this.keys[which] = key;
    const T = this.T;
    mesh.geometry.dispose();
    const g = new T.BufferGeometry();
    if (data) {
      g.setAttribute('position', new T.BufferAttribute(data.position, 3));
      g.setAttribute('uv', new T.BufferAttribute(data.uv, 2));
      g.setIndex(new T.BufferAttribute(data.index, 1));
    }
    mesh.geometry = g;
    mesh.visible = !!data && (which !== 'stripes' || !!this.stripes.material.uniforms.uMap.value);
  }

  /** Deployable tiles of the dragged piece (null / [] clears). */
  setTint(tiles, heightAt) { this._set('tint', tiles, heightAt); }

  /** Bench slots that take the dragged piece (null / [] clears). */
  setBenchTint(tiles, heightAt) { this._set('bench', tiles, heightAt); }

  /** Range preview tiles (null / [] clears). */
  setStripes(tiles, heightAt) { this._set('stripes', tiles, heightAt); }

  /** The client's stripe texture (replaces the procedural copy). */
  setStripeImage(img) {
    if (!img || !(img.width || img.naturalWidth)) return;
    const tex = this._texture(new this.T.Texture(img));
    const old = this.stripes.material.uniforms.uMap.value;
    this.stripes.material.uniforms.uMap.value = tex;
    this.stripeTex = tex;
    if (old && old !== tex) old.dispose();
  }

  update(t) {
    this.time = t;
    if (this.stripes.visible) this.stripes.material.uniforms.uShift.value = -((t * STRIPES.speed) % 1);
  }

  dispose() {
    for (const m of [this.tint, this.bench, this.stripes]) {
      this.parent?.remove?.(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    this.stripeTex?.dispose?.();
  }
}
