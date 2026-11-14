/**
 * The effect canvases' draws submitted without three.js's generic per-draw path (docs/rules/render.md 「이펙트 그리기 전용
 * 경로」). In a crowded boss round the effect layer draws some 300 times a frame, every draw a material of its own, and
 * three.js walked each material's ~55 uniforms, re-derived its program key and re-checked its vertex bindings at every
 * draw: about 70 % of the layer's time, little of it WebGL.
 *
 * The same pictures, drawn here:
 * - the program is three.js's own effect program (the source it compiled for PROGRAM_VARIANTS, read back from the
 *   context) with the material's plain uniforms and the object's matrices moved into one std140 block, `FxDraw`: a frame
 *   packs every draw's block into one buffer and a draw binds its range. The samplers stay uniforms, on fixed units;
 * - the draw list is three.js's: the same traversal (visible, layers, frustum), the same sort (WebGLRenderList's
 *   painterSortStable / reversePainterSortStable on the same z), opaque before transparent, a double-sided transparent
 *   material drawn back faces then front faces (WebGLRenderer.renderObject), onBeforeRender at the same point;
 * - vertex buffers and vertex arrays are this module's (three.js keeps its own private), uploaded by the same rules
 *   (WebGLAttributes: whole buffer, or the merged update ranges), the textures three.js's (`properties`, initTexture),
 *   the GL state through three.js's state cache (state.setMaterial, useProgram, bindTexture) so the two never disagree.
 *
 * A pass it cannot draw exactly — a skinned mesh, a material that is not an effect material or the occluders', a line,
 * a program not linked yet — goes to three.js whole (renderer.render) for that frame. After a pass of its own, the next
 * three.js call first resets three.js's state cache (resetState: it does not know the vertex array bound here).
 */

const CAMERA = ['projectionMatrix', 'viewMatrix', 'cameraPosition', 'isOrthographic'];
const OBJECT = ['modelMatrix', 'modelViewMatrix', 'normalMatrix'];
const DECL = /\buniform\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+(\w+)\s*;/g;
const MARK = '/*@FxDraw@*/';
const BLOCK = 'FxDraw';
const NO_CHILDREN = Object.freeze([]);

/**
 * A program's two stages with the plain uniforms `take(name, type)` accepts moved into one std140 block, declared where
 * the first of them was in each stage (the same members in the same order in both, as linking requires).
 * @returns {{ vs: string, fs: string, members: string[] }}
 */
export function blockSource(vs, fs, take) {
  const types = new Map();
  const cut = (src) => {
    let first = true;
    return src.replace(DECL, (m, type, name) => {
      if (type.startsWith('sampler') || !take(name, type)) return m;
      if (types.has(name) && types.get(name) !== type) throw new Error(`[fx] uniform ${name} is ${types.get(name)} and ${type}`);
      types.set(name, type);
      if (!first) return '';
      first = false;
      return MARK;
    });
  };
  const v = cut(vs), f = cut(fs);
  const block = `layout(std140) uniform ${BLOCK} {\n${[...types].map(([n, t]) => `  ${t} ${n};`).join('\n')}\n};`;
  return { vs: v.replace(MARK, block), fs: f.replace(MARK, block), members: [...types.keys()] };
}

// WebGL enums (WebGL 2): the uniform types a block member can have here
const GL = {
  FLOAT: 0x1406, VEC2: 0x8b50, VEC3: 0x8b51, VEC4: 0x8b52, INT: 0x1404, IVEC2: 0x8b53, IVEC3: 0x8b54, IVEC4: 0x8b55,
  BOOL: 0x8b56, BVEC2: 0x8b57, BVEC3: 0x8b58, BVEC4: 0x8b59, MAT2: 0x8b5a, MAT3: 0x8b5b, MAT4: 0x8b5c,
};
const W_F = 1, W_V2 = 2, W_V3 = 3, W_V4 = 4, W_I = 5, W_IV4 = 6, W_M3 = 7, W_M4 = 8, W_IV2 = 9, W_IV3 = 10;
const WRITER = {
  [GL.FLOAT]: W_F, [GL.VEC2]: W_V2, [GL.VEC3]: W_V3, [GL.VEC4]: W_V4, [GL.INT]: W_I, [GL.BOOL]: W_I,
  [GL.IVEC2]: W_IV2, [GL.BVEC2]: W_IV2, [GL.IVEC3]: W_IV3, [GL.BVEC3]: W_IV3, [GL.IVEC4]: W_IV4, [GL.BVEC4]: W_IV4,
  [GL.MAT3]: W_M3, [GL.MAT4]: W_M4,
};

// three.js's render-list order (WebGLRenderList painterSortStable / reversePainterSortStable, r186)
function opaqueSort(a, b) {
  return a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder || a.material.id - b.material.id || a.z - b.z || a.id - b.id;
}
function transparentSort(a, b) {
  return a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder || b.z - a.z || a.id - b.id;
}

const OCC_VS = `#version 300 es
precision highp float;
uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix;
in vec3 position;
void main() { vec4 mvPosition = vec4(position, 1.0); mvPosition = modelViewMatrix * mvPosition; gl_Position = projectionMatrix * mvPosition; }`;
const OCC_FS = `#version 300 es
precision highp float;
out highp vec4 pc_fragColor;
void main() { pc_fragColor = vec4(1.0); }`;

export class FxSubmit {
  /**
   * @param {any} THREE the three.js module
   * @param {any} renderer the layer's WebGLRenderer
   * @param {{ probes: any[], occMaterial?: any }} o probes: the PROGRAM_VARIANTS scenes (fxplayer.js programVariants), whose
   *   first mesh's material is an effect material three.js compiles for this renderer (fxgame.js ensure / prewarm)
   */
  constructor(THREE, renderer, o) {
    this.THREE = THREE; this.r = renderer; this.gl = renderer.getContext(); this.state = renderer.state;
    this.props = renderer.properties;
    this.probes = o.probes; this.occMaterial = o.occMaterial || null;
    this.frag = o.probes[0]?.children[0]?.material?.fragmentShader;
    this.matNames = new Set(Object.keys(o.probes[0]?.children[0]?.material?.uniforms || {}));
    this.enabled = true;
    this.dirty = false;        // three.js's state cache needs a reset before its next call
    this.failed = new Set();   // program keys that did not link
    this.progs = new Map();    // 'n0' / 'n1' (normals) / 'occ' → program record
    this.bufs = new WeakMap(); // BufferAttribute / InterleavedBuffer → { buf, type, bpe, version, size }
    this.vaos = new WeakMap(); // geometry → Map(program record → vao record)
    this.recs = new WeakMap(); // mesh → { mat, prog, refs }
    this.disposeGeo = (e) => this.dropGeometry(e.target);
    this.items = []; this.pool = [];
    this.ubo = null; this.uboCap = 0; this.uboData = null; this.f32 = null; this.i32 = null;
    this.stamp = 0; this.bufGen = 0;   // bufGen: buffers made or dropped (a vertex array checks its buffers only then)
    this.v4 = new THREE.Vector4(); this.proj = new THREE.Matrix4(); this.frustum = new THREE.Frustum();
    this.clearColor = new THREE.Color();
    const gl = this.gl;
    this.align = gl.getParameter(gl.UNIFORM_BUFFER_OFFSET_ALIGNMENT) || 256;
    this.bindPoint = Math.max(0, (gl.getParameter(gl.MAX_UNIFORM_BUFFER_BINDINGS) || 24) - 1);
    this.parallel = gl.getExtension('KHR_parallel_shader_compile');
    this.units = new Array(32).fill(undefined);
    this.calls = 0;
    this.stats = { own: 0, three: 0, why: '' };
    /** @type {any} */ this.scene = null; this.why = ''; this.nPool = 0;
    /** @type {any} */ this.vao = null; /** @type {any} */ this.progCam = null;
    /** @type {any} */ this.checks = null; /** @type {Uint8Array|null} */ this.pa = null; /** @type {Uint8Array|null} */ this.pb = null;   // passes drawn here / by three.js this frame, the last fallback's reason
  }

  /**
   * Start linking one program not linked yet whose three.js source is there (fxgame.js prewarm, after three.js linked the
   * PROGRAM_VARIANTS probes and the occluders' material): its first draw in a battle does not wait for a link. One a call —
   * Firefox links on its WebGL thread, one link one frozen frame (docs/rules/render.md 「이펙트 셰이더 유지」).
   * @returns {boolean} whether it started one
   */
  warm() {
    const quad = this.probes[0]?.children[0]?.material, rim = this.probes[4]?.children[0]?.material;
    for (const [key, mat] of [['n0', quad], ['occ', this.occMaterial], ['n1', rim]]) {
      if (!mat || this.progs.has(key) || this.failed.has(key)) continue;
      if (key !== 'occ' && !this.props.get(mat).currentProgram) continue;
      this.program(key, mat);
      return true;
    }
    return false;
  }

  /** Before three.js draws or compiles on this renderer. */
  yieldToThree() {
    if (this.dirty) { this.r.resetState(); this.dirty = false; }
  }

  /** The pass through three.js itself. */
  three(scene, camera, clear, why) {
    this.yieldToThree();
    this.stats.three++; this.stats.why = why; (this.stats.whys ||= {})[why] = (this.stats.whys[why] || 0) + 1;
    this.r.autoClear = clear;
    this.r.render(scene, camera);
    return this.r.info.render.calls;
  }

  /**
   * Draw `scene` like `renderer.render(scene, camera)` with `renderer.autoClear = clear`.
   * @returns {number} the draw calls
   */
  render(scene, camera, clear) {
    if (!this.enabled) return this.three(scene, camera, clear, 'off');
    if (scene.matrixWorldAutoUpdate === true) scene.updateMatrixWorld();
    if (camera.parent === null && camera.matrixWorldAutoUpdate === true) camera.updateMatrixWorld();
    this.proj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.proj, this.THREE.WebGLCoordinateSystem, camera.reversedDepth);
    this.items.length = 0; this.nPool = 0; this.why = '';
    if (!this.collect(scene, camera, 0)) return this.three(scene, camera, clear, this.why);
    const items = this.items;
    // programs: every one this pass needs linked, or three.js draws it
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.key === 'three') continue;
      const p = this.progs.get(it.key)?.ready ? this.progs.get(it.key) : this.program(it.key, it.material);
      if (!p) return this.three(scene, camera, clear, `program ${it.key}`);
      it.prog = p;
    }
    this.scene = scene;
    this.stamp++;
    // three.js's two lists, each in its order
    const opaque = [], transparent = [];
    for (const it of items) (it.material.transparent === true ? transparent : opaque).push(it);
    if (opaque.length > 1) opaque.sort(opaqueSort);
    if (transparent.length > 1) transparent.sort(transparentSort);
    const gl = this.gl, state = this.state;
    // uploads first, no vertex array bound (an index upload would land in the one bound)
    gl.bindVertexArray(null); this.vao = null;
    for (const it of items) if (it.prog) this.upload(it.object.geometry, it.prog);
    if (clear) {
      this.r.setClearColor(this.r.getClearColor(this.clearColor), this.r.getClearAlpha());
      state.buffers.depth.setTest(true); state.buffers.depth.setMask(true); state.buffers.color.setMask(true);
      this.r.clear(this.r.autoClearColor, this.r.autoClearDepth, this.r.autoClearStencil);
    }
    this.calls = 0;
    this.units.fill(undefined);
    this.progCam = null;
    this.drawList(opaque, camera);
    this.drawList(transparent, camera);
    state.buffers.depth.setTest(true); state.buffers.depth.setMask(true); state.buffers.color.setMask(true);
    state.setPolygonOffset(false);
    gl.bindVertexArray(null); this.vao = null;
    this.dirty = true;
    this.stats.own++;
    return this.calls;
  }

  /** three.js's projectObject: the meshes it would draw, or false (and `why`) for one this module cannot draw. */
  collect(o, camera, groupOrder) {
    if (o.visible === false) return true;
    if (o.layers.test(camera.layers)) {
      if (o.isGroup) groupOrder = o.renderOrder;
      else if (o.isMesh) {
        if (!o.frustumCulled || o.intersectsFrustum(this.frustum)) {
          const m = o.material;
          if (Array.isArray(m)) { this.why = 'material array'; return false; }
          if (o.isInstancedMesh || o.isBatchedMesh) { this.why = o.type; return false; }
          if (m.visible) {
            let key;
            if (m === this.occMaterial) key = 'occ';
            else if (o.isSkinnedMesh) key = 'three';   // three.js draws it at its place in the order (drawList)
            else if (m.isShaderMaterial && m.fragmentShader === this.frag && !m.uniformsGroups?.length && !(m.transmission > 0)) key = o.geometry.attributes.normal ? 'n1' : 'n0';
            else { this.why = `material ${m.type}`; return false; }
            // the sort depth as three.js takes it: an object's own bounding sphere when it has one (a SkinnedMesh's, from
            // its skinned vertices), else its geometry's
            let sphere;
            if (o.boundingSphere !== undefined) { if (o.boundingSphere === null) o.computeBoundingSphere(); sphere = o.boundingSphere; }
            else { const g = o.geometry; if (g.boundingSphere === null) g.computeBoundingSphere(); sphere = g.boundingSphere; }
            this.v4.copy(sphere.center).applyMatrix4(o.matrixWorld).applyMatrix4(this.proj);
            const it = this.pool[this.nPool] ||= {};
            this.nPool++;
            it.object = o; it.material = m; it.groupOrder = groupOrder; it.renderOrder = o.renderOrder; it.z = this.v4.z; it.id = o.id; it.key = key; it.prog = null;
            this.items.push(it);
          }
        }
      } else if (o.isLine || o.isPoints || o.isSprite || o.isLight || o.isLOD) { this.why = o.type; return false; }
    }
    const ch = o.children;
    for (let i = 0; i < ch.length; i++) if (!this.collect(ch[i], camera, groupOrder)) return false;
    return true;
  }

  /**
   * The program record for a key, or null while it is not linked (or never will be). Its source is three.js's program for
   * that variant on this renderer — the material's own, else the PROGRAM_VARIANTS probe's (a double-sided quad, 0; a
   * one-sided mesh with normals, 4); with neither compiled yet, three.js draws the pass and compiles it.
   */
  program(key, material) {
    let p = this.progs.get(key);
    if (p) return p.ready ? p : this.poll(p);
    if (this.failed.has(key)) return null;
    let src;
    if (key === 'occ') src = { vs: OCC_VS, fs: OCC_FS, members: null };
    else {
      let prog = this.props.get(material).currentProgram;
      if (!prog?.program) prog = this.props.get(this.probes[key === 'n1' ? 4 : 0]?.children[0]?.material ?? material).currentProgram;
      if (!prog?.program) return null;
      const gl = this.gl;
      const vs = gl.getShaderSource(prog.vertexShader), fs = gl.getShaderSource(prog.fragmentShader);
      // one program serves every side: the variants differ only by three.js's FLIP_SIDED / DOUBLE_SIDED defines, which
      // nothing in the effect shader reads (checked here, so a change of the shader cannot make it wrong unseen)
      if (/gl_FrontFacing|(ifdef|defined\s*\()\s*(FLIP|DOUBLE)_SIDED/.test(vs + fs)) {
        console.warn('[fx] submit: the effect shader reads the face side; drawn by three.js'); this.failed.add(key); return null;
      }
      const take = (name) => OBJECT.includes(name) || this.matNames.has(name);
      // (test switch globalThis.__SP_FX_SUBMIT_PLAIN__: three.js's source unchanged, every uniform set per draw — no block)
      if (globalThis.__SP_FX_SUBMIT_PLAIN__) {
        const names = new Set();
        for (const m of (vs + fs).matchAll(DECL)) if (!m[1].startsWith('sampler') && take(m[2])) names.add(m[2]);
        src = { vs, fs, members: [...names], plain: true };
      } else try {
        // (test switch globalThis.__SP_FX_SUBMIT_MATS__: the mat4s named there go into the block too)
        const inMat = String(globalThis.__SP_FX_SUBMIT_MATS__ || '').split(',');
        src = blockSource(vs, fs, (name, type) => (!type.startsWith('mat') || inMat.includes(name)) && take(name));
      }
      catch (err) { console.warn('[fx] submit: no block source', err); this.failed.add(key); return null; }
    }
    p = this.link(key, src);
    if (!p) return null;
    this.progs.set(key, p);
    return p.ready ? p : this.poll(p);
  }

  link(key, src) {
    const gl = this.gl;
    const sh = (type, text) => { const s = gl.createShader(type); gl.shaderSource(s, text); gl.compileShader(s); return s; };
    const vs = sh(gl.VERTEX_SHADER, src.vs), fs = sh(gl.FRAGMENT_SHADER, src.fs);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    return { key, prog, vs, fs, members: src.members, plain: !!src.plain, ready: false, src };
  }

  /** A linked program's layout (once): block offsets and writers, sampler units, attribute locations. */
  poll(p) {
    const gl = this.gl;
    if (this.parallel && !gl.getProgramParameter(p.prog, this.parallel.COMPLETION_STATUS_KHR)) return null;
    if (!gl.getProgramParameter(p.prog, gl.LINK_STATUS)) {
      console.warn(`[fx] submit: program ${p.key} did not link`, gl.getProgramInfoLog(p.prog), gl.getShaderInfoLog(p.vs), gl.getShaderInfoLog(p.fs));
      this.failed.add(p.key); this.progs.delete(p.key);
      gl.deleteProgram(p.prog); gl.deleteShader(p.vs); gl.deleteShader(p.fs);
      return null;
    }
    this.state.useProgram(p.prog);
    p.cam = CAMERA.map((n) => gl.getUniformLocation(p.prog, n));
    p.mv = gl.getUniformLocation(p.prog, 'modelViewMatrix');   // the occluders' (no block)
    // samplers: unit k for the k-th, set once
    p.samplers = []; p.units = [];
    const nu = gl.getProgramParameter(p.prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nu; i++) {
      const info = gl.getActiveUniform(p.prog, i);
      if (info.type !== gl.SAMPLER_2D) continue;
      const loc = gl.getUniformLocation(p.prog, info.name);
      gl.uniform1i(loc, p.samplers.length);
      p.samplers.push(info.name);
    }
    if (p.plain) {
      p.layout = []; p.locs = [];
      p.members.forEach((n, i) => {
        const loc = gl.getUniformLocation(p.prog, n);
        if (!loc) return;
        let type = 0;
        for (let k = 0; k < nu; k++) { const info = gl.getActiveUniform(p.prog, k); if (info.name === n) type = info.type; }
        p.layout.push(WRITER[type], i * 16, type === GL.MAT3 ? 3 : 4, i); p.locs.push(loc, type);
      });
      p.size = p.stride = Math.ceil((p.members.length * 64) / this.align) * this.align;
      p.obj = OBJECT.map((n) => p.members.indexOf(n));
    } else if (p.members) {   // the block
      const bi = gl.getUniformBlockIndex(p.prog, BLOCK);
      gl.uniformBlockBinding(p.prog, bi, this.bindPoint);
      p.size = gl.getActiveUniformBlockParameter(p.prog, bi, gl.UNIFORM_BLOCK_DATA_SIZE);
      p.stride = Math.ceil(p.size / this.align) * this.align;
      const idx = gl.getUniformIndices(p.prog, p.members);
      const offs = gl.getActiveUniforms(p.prog, idx, gl.UNIFORM_OFFSET), types = gl.getActiveUniforms(p.prog, idx, gl.UNIFORM_TYPE);
      const mstr = gl.getActiveUniforms(p.prog, idx, gl.UNIFORM_MATRIX_STRIDE);
      p.layout = [];   // [writer, word offset, matrix column stride in words, member index]
      p.members.forEach((n, i) => {
        if (idx[i] === gl.INVALID_INDEX || idx[i] == null) return;
        const w = WRITER[types[i]];
        if (!w) throw new Error(`[fx] submit: block member ${n} type 0x${types[i].toString(16)}`);
        p.layout.push(w, offs[i] >> 2, mstr[i] >> 2, i);
      });
      p.obj = OBJECT.map((n) => p.members.indexOf(n));
    }
    // the matrices stay plain uniforms, set per draw: in a block they changed what the effect shader computes (ANGLE / D3D11:
    // 1–4 / 255 on a few pixels a frame, the same source with plain uniforms 0)
    p.mats = [];
    if (!p.plain && p.members) {
      for (let i = 0; i < nu; i++) {
        const info = gl.getActiveUniform(p.prog, i);
        if (info.type !== gl.FLOAT_MAT4 && info.type !== gl.FLOAT_MAT3) continue;
        const n = info.name, k = OBJECT.indexOf(n);
        if ((k < 0 && !this.matNames.has(n)) || p.members.includes(n)) continue;
        const m3 = info.type === gl.FLOAT_MAT3;
        // last: the values the program holds (a WebGL call costs more than comparing 16 numbers)
        p.mats.push({ loc: gl.getUniformLocation(p.prog, n), m3, obj: k, name: n, last: new Float64Array(m3 ? 9 : 16).fill(NaN) });
      }
    }
    // attributes
    p.attrs = [];
    const na = gl.getProgramParameter(p.prog, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < na; i++) {
      const info = gl.getActiveAttrib(p.prog, i);
      const loc = gl.getAttribLocation(p.prog, info.name);
      if (loc < 0) continue;
      const ls = info.type === gl.FLOAT_MAT4 ? 4 : info.type === gl.FLOAT_MAT3 ? 3 : info.type === gl.FLOAT_MAT2 ? 2 : 1;
      p.attrs.push({ name: info.name, loc, ls });
    }
    p.ready = true;
    return p;
  }

  /** WebGLAttributes.update: this module's buffer for an attribute (its InterleavedBuffer when interleaved). */
  buffer(a, target) {
    const src = a.isInterleavedBufferAttribute ? a.data : a;
    const gl = this.gl;
    let b = this.bufs.get(src);
    if (b && b.version >= src.version && b.size === src.array.byteLength) return b;
    const array = src.array;
    if (!b || b.size !== array.byteLength) {
      if (b) gl.deleteBuffer(b.buf);
      const buf = gl.createBuffer();
      gl.bindBuffer(target, buf);
      gl.bufferData(target, array, src.usage);
      src.onUploadCallback?.();
      b = { buf, type: glType(gl, array, src), bpe: array.BYTES_PER_ELEMENT, version: src.version, size: array.byteLength };
      this.bufs.set(src, b);
      this.bufGen++;
      return b;
    }
    gl.bindBuffer(target, b.buf);
    const ranges = src.updateRanges;
    if (!ranges || ranges.length === 0) gl.bufferSubData(target, 0, array);
    else {
      ranges.sort((x, y) => x.start - y.start);
      let k = 0;
      for (let i = 1; i < ranges.length; i++) {
        const pr = ranges[k], r = ranges[i];
        if (r.start <= pr.start + pr.count + 1) pr.count = Math.max(pr.count, r.start + r.count - pr.start);
        else ranges[++k] = r;
      }
      ranges.length = k + 1;
      for (const r of ranges) gl.bufferSubData(target, r.start * array.BYTES_PER_ELEMENT, array, r.start, r.count);
      src.clearUpdateRanges();
    }
    src.onUploadCallback?.();
    b.version = src.version;
    return b;
  }

  upload(g, p) {
    const gl = this.gl;
    for (const a of p.attrs) { const ga = g.attributes[a.name]; if (ga) this.buffer(ga, gl.ARRAY_BUFFER); }
    if (g.index) this.buffer(g.index, gl.ELEMENT_ARRAY_BUFFER);
  }

  /** The vertex array of a geometry for a program, made again when an attribute, the index or a buffer changed. */
  vertexArray(g, p, object, material) {
    let m = this.vaos.get(g);
    if (!m) { m = new Map(); this.vaos.set(g, m); g.addEventListener('dispose', this.disposeGeo); }
    let v = m.get(p);
    const gl = this.gl;
    if (v && v.stamp === this.stamp) return v;
    if (v) {
      const deep = v.gen !== this.bufGen;
      let same = v.index === g.index && (!deep || !g.index || this.bufs.get(g.index)?.buf === v.ibuf);
      for (let i = 0; same && i < p.attrs.length; i++) {
        const ga = g.attributes[p.attrs[i].name];
        same = ga === v.src[i] && (!deep || !ga || this.bufs.get(ga.isInterleavedBufferAttribute ? ga.data : ga)?.buf === v.buf[i]);
      }
      if (same) { v.stamp = this.stamp; v.gen = this.bufGen; return v; }
      gl.deleteVertexArray(v.vao);
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao); this.vao = vao;
    v = { vao, src: [], buf: [], index: g.index, ibuf: null, stamp: this.stamp, gen: this.bufGen, defaults: null };
    const defs = material.defaultAttributeValues;
    for (const a of p.attrs) {
      const ga = g.attributes[a.name];
      const b = ga && this.bufs.get(ga.isInterleavedBufferAttribute ? ga.data : ga);
      v.src.push(ga); v.buf.push(b ? b.buf : null);
      if (!b) {
        const d = defs?.[a.name];
        if (d) (v.defaults ||= []).push(a.loc, d);
        continue;
      }
      const integer = b.type === gl.INT || b.type === gl.UNSIGNED_INT || ga.gpuType === this.THREE.IntType;
      const size = ga.itemSize / a.ls;
      let stride, offset, div = 0;
      if (ga.isInterleavedBufferAttribute) {
        stride = ga.data.stride * b.bpe; offset = ga.offset * b.bpe;
        if (ga.data.isInstancedInterleavedBuffer) {
          div = ga.data.meshPerAttribute;
          if (object.isInstancedMesh !== true && g._maxInstanceCount === undefined) g._maxInstanceCount = ga.data.meshPerAttribute * ga.data.count;
        }
      } else {
        stride = ga.itemSize * b.bpe; offset = 0;
        if (ga.isInstancedBufferAttribute) {
          div = ga.meshPerAttribute;
          if (object.isInstancedMesh !== true && g._maxInstanceCount === undefined) g._maxInstanceCount = ga.meshPerAttribute * ga.count;
        }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, b.buf);
      for (let i = 0; i < a.ls; i++) {
        const loc = a.loc + i;
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribDivisor(loc, div);
        if (integer) gl.vertexAttribIPointer(loc, size, b.type, stride, offset + size * i * b.bpe);
        else gl.vertexAttribPointer(loc, size, b.type, ga.normalized, stride, offset + size * i * b.bpe);
      }
    }
    if (g.index) { const b = this.bufs.get(g.index); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.buf); v.ibuf = b.buf; }
    m.set(p, v);
    return v;
  }

  dropGeometry(g) {
    g.removeEventListener('dispose', this.disposeGeo);
    const m = this.vaos.get(g), gl = this.gl;
    if (m) { for (const v of m.values()) gl.deleteVertexArray(v.vao); this.vaos.delete(g); this.vao = undefined; }
    // as three.js does on a geometry's dispose: its attributes' buffers go (a shared one is made again by the next user)
    const drop = (a) => { const src = a.isInterleavedBufferAttribute ? a.data : a; const b = this.bufs.get(src); if (b) { gl.deleteBuffer(b.buf); this.bufs.delete(src); this.bufGen++; } };
    for (const k in g.attributes) drop(g.attributes[k]);
    if (g.index) drop(g.index);
  }

  /** Pack the blocks of a list's effect draws into the uniform buffer, then draw the list. */
  drawList(list, camera) {
    if (!list.length) return;
    const gl = this.gl, state = this.state;
    // objects' matrices and onBeforeRender at three.js's point (renderObject), then the blocks
    let bytes = 0;
    for (const it of list) {
      const o = it.object;
      if (!it.prog) continue;   // three.js's own (drawThree)
      if (Object.hasOwn(o, 'onBeforeRender')) o.onBeforeRender(this.r, this.scene, camera, o.geometry, it.material, null);
      o.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, o.matrixWorld);
      o.normalMatrix.getNormalMatrix(o.modelViewMatrix);
      if (it.prog.members) { it.off = bytes; bytes += it.prog.stride; }
    }
    if (bytes) {
      this.ensureUbo(bytes);
      for (const it of list) if (it.prog?.members) this.pack(it);
      gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
      gl.bufferData(gl.UNIFORM_BUFFER, this.f32, gl.DYNAMIC_DRAW, 0, bytes >> 2);   // new storage: the last pass's draws may still read the old
    }
    for (const it of list) {
      const o = it.object, m = it.material, g = o.geometry, p = it.prog;
      if (!p) { this.drawThree(o, camera); continue; }
      const cw = o.matrixWorld.determinantAffine() < 0;
      if (state.useProgram(p.prog) || this.progCam !== p) {
        this.progCam = p;
        if (p.cam[0]) gl.uniformMatrix4fv(p.cam[0], false, camera.projectionMatrix.elements);
        if (p.cam[1]) gl.uniformMatrix4fv(p.cam[1], false, camera.matrixWorldInverse.elements);
        if (p.cam[2]) { const e = camera.matrixWorld.elements; gl.uniform3f(p.cam[2], e[12], e[13], e[14]); }
        if (p.cam[3]) gl.uniform1i(p.cam[3], camera.isOrthographicCamera === true ? 1 : 0);
      }
      // the draw range (renderBufferDirect)
      const index = g.index, pos = g.attributes.position;
      let start = g.drawRange.start, end = g.drawRange.start + g.drawRange.count;
      if (index !== null) { start = Math.max(start, 0); end = Math.min(end, index.count); }
      else if (pos) { start = Math.max(start, 0); end = Math.min(end, pos.count); }
      const count = end - start;
      if (count < 0 || count === Infinity) continue;
      const v = this.vertexArray(g, p, o, m);
      const inst = g.isInstancedBufferGeometry ? Math.min(g.instanceCount, g._maxInstanceCount !== undefined ? g._maxInstanceCount : Infinity) : -1;
      if (count === 0 || inst === 0) continue;   // three.js draws nothing either (renderInstances / a zero count)
      if (this.vao !== v.vao) { gl.bindVertexArray(v.vao); this.vao = v.vao; }
      if (v.defaults) for (let i = 0; i < v.defaults.length; i += 2) { const d = v.defaults[i + 1]; (d.length === 2 ? gl.vertexAttrib2fv : d.length === 3 ? gl.vertexAttrib3fv : gl.vertexAttrib4fv).call(gl, v.defaults[i], d); }
      if (p.plain) { this.setPlain(it, p); this.textures(it, p); }
      else if (p.members) {
        gl.bindBufferRange(gl.UNIFORM_BUFFER, this.bindPoint, this.ubo, it.off, p.size);
        for (const q of p.mats) {
          const v = q.obj === 0 ? o.matrixWorld : q.obj === 1 ? o.modelViewMatrix : q.obj === 2 ? o.normalMatrix : m.uniforms[q.name]?.value;
          if (!v) continue;
          const e = v.elements, last = q.last;
          let same = true;
          for (let k = 0; k < last.length; k++) if (last[k] !== e[k]) { same = false; break; }
          if (same) continue;
          last.set(e);
          if (q.m3) gl.uniformMatrix3fv(q.loc, false, e); else gl.uniformMatrix4fv(q.loc, false, e);
        }
        this.textures(it, p);
      } else if (p.mv) gl.uniformMatrix4fv(p.mv, false, o.modelViewMatrix.elements);
      const ib = index && this.bufs.get(index);
      const passes = m.transparent === true && m.side === this.THREE.DoubleSide && m.forceSinglePass === false ? 2 : 1;
      for (let pass = 0; pass < passes; pass++) {
        if (passes === 2) m.side = pass === 0 ? this.THREE.BackSide : this.THREE.FrontSide;
        state.setMaterial(m, cw);
        if (ib) {
          if (inst > 0) gl.drawElementsInstanced(gl.TRIANGLES, count, ib.type, start * ib.bpe, inst);
          else gl.drawElements(gl.TRIANGLES, count, ib.type, start * ib.bpe);
        } else if (inst > 0) gl.drawArraysInstanced(gl.TRIANGLES, start, count, inst);
        else gl.drawArrays(gl.TRIANGLES, start, count);
        this.calls++;
      }
      if (passes === 2) m.side = this.THREE.DoubleSide;
      if (Object.hasOwn(o, 'onAfterRender')) o.onAfterRender(this.r, this.scene, camera, g, m, null);
    }
  }

  /** The plain test program's uniforms, from the draw's packed block (no cache: every one, every draw). */
  setPlain(it, p) {
    const gl = this.gl, f = this.f32, I = this.i32, base = it.off >> 2, L = p.layout;
    for (let k = 0, j = 0; k < L.length; k += 4, j += 2) {
      const at = base + L[k + 1], loc = p.locs[j], t = p.locs[j + 1];
      switch (t) {
        case GL.FLOAT: gl.uniform1f(loc, f[at]); break;
        case GL.VEC2: gl.uniform2f(loc, f[at], f[at + 1]); break;
        case GL.VEC3: gl.uniform3f(loc, f[at], f[at + 1], f[at + 2]); break;
        case GL.VEC4: gl.uniform4f(loc, f[at], f[at + 1], f[at + 2], f[at + 3]); break;
        case GL.INT: case GL.BOOL: gl.uniform1i(loc, I[at]); break;
        case GL.IVEC4: gl.uniform4i(loc, I[at], I[at + 1], I[at + 2], I[at + 3]); break;
        case GL.MAT3: gl.uniformMatrix3fv(loc, false, f.subarray(at, at + 9)); break;
        case GL.MAT4: gl.uniformMatrix4fv(loc, false, f.subarray(at, at + 16)); break;
        default: break;
      }
    }
  }

  /**
   * One object through three.js at its place in the order (a skinned mesh: its bones, its program): renderer.render(object)
   * draws it alone, its children taken off for the moment (they are this pass's own items). three.js's state cache is reset
   * before (it does not know what was bound here), this module's after.
   */
  drawThree(o, camera) {
    this.r.resetState();
    const ch = o.children;
    o.children = NO_CHILDREN;
    try { this.r.autoClear = false; this.r.render(o, camera); } finally { o.children = ch; }
    this.calls += this.r.info.render.calls;
    this.vao = null; this.units.fill(undefined); this.progCam = null;
    this.stats.objects = (this.stats.objects || 0) + 1;
  }

  ensureUbo(bytes) {
    if (this.uboCap >= bytes) return;
    let cap = Math.max(this.uboCap || 65536, 65536);
    while (cap < bytes) cap *= 2;
    const gl = this.gl;
    if (!this.ubo) this.ubo = gl.createBuffer();
    this.uboCap = cap;
    const ab = new ArrayBuffer(cap);
    this.f32 = new Float32Array(ab); this.i32 = new Int32Array(ab);
  }

  /** One draw's block: the material's uniforms by name, the object's matrices. */
  pack(it) {
    const o = it.object, m = it.material, p = it.prog;
    let rec = this.recs.get(o);
    if (!rec || rec.mat !== m || rec.prog !== p || rec.u !== m.uniforms) {
      const refs = p.members.map((n) => (OBJECT.includes(n) ? null : m.uniforms[n] || null));
      rec = { mat: m, prog: p, u: m.uniforms, refs, holes: refs.some((r, i) => !r && !OBJECT.includes(p.members[i])) };
      this.recs.set(o, rec);
    }
    const refs = rec.refs, L = p.layout, f = this.f32, I = this.i32, base = it.off >> 2;
    if (rec.holes) f.fill(0, base, base + (p.stride >> 2));   // a member the material lacks reads 0
    const obj = p.obj;
    for (let k = 0; k < L.length; k += 4) {
      const w = L[k], at = base + L[k + 1], ms = L[k + 2], mi = L[k + 3];
      let v;
      if (mi === obj[0]) v = o.matrixWorld;
      else if (mi === obj[1]) v = o.modelViewMatrix;
      else if (mi === obj[2]) v = o.normalMatrix;
      else { const r = refs[mi]; if (!r) continue; v = r.value; }
      if (v === undefined || v === null) continue;
      switch (w) {
        case W_F: f[at] = +v; break;
        case W_I: I[at] = typeof v === 'boolean' ? (v ? 1 : 0) : v | 0; break;
        case W_V2: if (v.x !== undefined) { f[at] = v.x; f[at + 1] = v.y; } else { f[at] = v[0]; f[at + 1] = v[1]; } break;
        case W_V3:
          if (v.x !== undefined) { f[at] = v.x; f[at + 1] = v.y; f[at + 2] = v.z; }
          else if (v.r !== undefined) { f[at] = v.r; f[at + 1] = v.g; f[at + 2] = v.b; }
          else { f[at] = v[0]; f[at + 1] = v[1]; f[at + 2] = v[2]; }
          break;
        case W_V4: if (v.x !== undefined) { f[at] = v.x; f[at + 1] = v.y; f[at + 2] = v.z; f[at + 3] = v.w; } else { f[at] = v[0]; f[at + 1] = v[1]; f[at + 2] = v[2]; f[at + 3] = v[3]; } break;
        case W_IV2: I[at] = v.x | 0; I[at + 1] = v.y | 0; break;
        case W_IV3: I[at] = v.x | 0; I[at + 1] = v.y | 0; I[at + 2] = v.z | 0; break;
        case W_IV4: if (v.x !== undefined) { I[at] = v.x | 0; I[at + 1] = v.y | 0; I[at + 2] = v.z | 0; I[at + 3] = v.w | 0; } else { I[at] = v[0] | 0; I[at + 1] = v[1] | 0; I[at + 2] = v[2] | 0; I[at + 3] = v[3] | 0; } break;
        case W_M3: { const e = v.elements; for (let c = 0; c < 3; c++) { const d = at + c * ms; f[d] = e[c * 3]; f[d + 1] = e[c * 3 + 1]; f[d + 2] = e[c * 3 + 2]; } break; }
        case W_M4: { const e = v.elements; if (ms === 4) for (let q = 0; q < 16; q++) f[at + q] = e[q]; else for (let c = 0; c < 4; c++) for (let q = 0; q < 4; q++) f[at + c * ms + q] = e[c * 4 + q]; break; }
        default: break;
      }
    }
  }

  /** The draw's textures on the program's units (three.js's setTexture2D: upload when its version moved, else bind). */
  textures(it, p) {
    const u = it.material.uniforms, gl = this.gl, state = this.state, units = this.units;
    for (let k = 0; k < p.samplers.length; k++) {
      const t = u[p.samplers[k]]?.value || null;
      let glt;
      if (t) {
        const tp = this.props.get(t);
        if (t.version > 0 && tp.__version !== t.version && t.image != null && t.image.complete !== false) {
          this.r.initTexture(t);   // three.js uploads it (on unit 0) and unbinds that unit
          units[0] = undefined;
        }
        glt = tp.__webglTexture;
      }
      if (units[k] !== glt || glt === undefined) { state.bindTexture(gl.TEXTURE_2D, glt, gl.TEXTURE0 + k); units[k] = glt; }
    }
  }

  /**
   * Dev check (globalThis.__SP_FX_SUBMIT__ = 'check'): the pass through three.js, then here, each on a cleared canvas, and
   * their pixels compared (`checks`: passes, those drawn here and compared, pixels that differ, the largest channel
   * difference). The frame then shows this module's picture of that pass alone.
   */
  check(scene, camera) {
    const gl = this.gl, w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, n = w * h * 4;
    if (!this.pa || this.pa.length !== n) { this.pa = new Uint8Array(n); this.pb = new Uint8Array(n); }
    const c = this.checks ||= { passes: 0, own: 0, diffPx: 0, maxDiff: 0, draws: 0, first: null };
    this.three(scene, camera, true, 'check');
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, this.pa);
    const own0 = this.stats.own;
    // (globalThis.__SP_FX_SUBMIT_REF__ = 'three': three.js against itself, the comparison's own noise)
    const calls = globalThis.__SP_FX_SUBMIT_REF__ === 'three' ? (this.stats.own++, this.three(scene, camera, true, 'check')) : this.render(scene, camera, true);
    c.passes++;
    if (this.stats.own === own0) return calls;   // three.js drew it: nothing to compare
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, this.pb);
    const a = this.pa, b = this.pb;
    let px = 0, mx = 0;
    for (let i = 0; i < n; i += 4) {
      const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]), Math.abs(a[i + 3] - b[i + 3]));
      if (d) { px++; if (d > mx) mx = d; }
    }
    c.own++; c.diffPx += px; c.draws += calls;
    if (mx > c.maxDiff) c.maxDiff = mx;
    if (px && !c.first) c.first = { px, mx, items: this.items.length, calls };
    return calls;
  }

  dispose() {
    const gl = this.gl;
    for (const p of this.progs.values()) { gl.deleteProgram(p.prog); gl.deleteShader(p.vs); gl.deleteShader(p.fs); }
    this.progs.clear();
    if (this.ubo) gl.deleteBuffer(this.ubo);
    this.ubo = null;
  }
}

function glType(gl, array, src) {
  if (array instanceof Float32Array) return gl.FLOAT;
  if (typeof globalThis.Float16Array !== 'undefined' && array instanceof globalThis.Float16Array) return gl.HALF_FLOAT;
  if (array instanceof Uint16Array) return src.isFloat16BufferAttribute ? gl.HALF_FLOAT : gl.UNSIGNED_SHORT;
  if (array instanceof Int16Array) return gl.SHORT;
  if (array instanceof Uint32Array) return gl.UNSIGNED_INT;
  if (array instanceof Int32Array) return gl.INT;
  if (array instanceof Int8Array) return gl.BYTE;
  return gl.UNSIGNED_BYTE;
}
