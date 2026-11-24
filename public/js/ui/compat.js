// Small polyfills for the older browsers the client supports (Safari / iOS 15.0–15.3, Firefox ESR, older Chromium on
// Android tablets). Imported first by main.js (and the dev harnesses), so every later module — including the ones
// loaded on demand (render engine, battle sim) — sees them. Each one is installed only when the browser lacks it
// (feature detection, never UA sniffing) and is a faithful subset of the standard behaviour:
//   Object.hasOwn                       Safari < 15.4, Firefox < 92
//   Array/String/TypedArray .at()       Safari < 15.4, Firefox < 90
//   Array .findLast / .findLastIndex    Safari < 15.4, Firefox < 104
//   structuredClone                     Safari < 15.4, Firefox < 94 (JSON-safe values + Map/Set/Date; enough for
//                                       the plain state objects the client clones)
//   globalThis.queueMicrotask           very old WebViews
// `installCompat(target)` is exported for tests (it patches the given global object instead).

/**
 * Install the polyfills on `g` (default globalThis). Returns the names that were missing and got installed.
 * @param {any} [g]
 * @returns {string[]}
 */
export function installCompat(g = globalThis) {
  /** @type {string[]} */
  const added = [];
  /**
   * @param {any} obj the global or a prototype
   * @param {string} name
   * @param {Function} fn
   */
  const def = (obj, name, fn) => {
    if (!obj || typeof obj[name] === 'function') return;
    try {
      Object.defineProperty(obj, name, { value: fn, writable: true, configurable: true, enumerable: false });
      added.push(name);
    } catch { /* frozen: leave it */ }
  };
  const O = g.Object || Object;
  def(O, 'hasOwn', /** @param {unknown} obj @param {PropertyKey} key */ function hasOwn(obj, key) {
    if (obj == null) throw new TypeError('Cannot convert undefined or null to object');
    return Object.prototype.hasOwnProperty.call(Object(obj), key);
  });
  /**
   * @this {any} the array, string or typed array whose prototype it is on
   * @param {unknown} i
   */
  function at(i) {
    const len = this.length >>> 0;
    let k = Math.trunc(Number(i)) || 0;
    if (k < 0) k += len;
    if (k < 0 || k >= len) return undefined;
    return typeof this === 'string' || this instanceof String ? String(this).charAt(k) : this[k];
  }
  def((g.Array || Array).prototype, 'at', at);
  def((g.String || String).prototype, 'at', at);
  const TA = g.Int8Array ? Object.getPrototypeOf(g.Int8Array.prototype) : null;
  if (TA) def(TA, 'at', at);
  def((g.Array || Array).prototype, 'findLast', /** @this {ArrayLike<unknown>} @param {ArrayPredicate} fn @param {unknown} [thisArg] */ function findLast(fn, thisArg) {
    for (let i = (this.length >>> 0) - 1; i >= 0; i--) if (fn.call(thisArg, this[i], i, this)) return this[i];
    return undefined;
  });
  def((g.Array || Array).prototype, 'findLastIndex', /** @this {ArrayLike<unknown>} @param {ArrayPredicate} fn @param {unknown} [thisArg] */ function findLastIndex(fn, thisArg) {
    for (let i = (this.length >>> 0) - 1; i >= 0; i--) if (fn.call(thisArg, this[i], i, this)) return i;
    return -1;
  });
  def(g, 'structuredClone', /** @param {unknown} value */ function structuredClone(value) { return cloneValue(value, new Map()); });
  def(g, 'queueMicrotask', /** @param {() => void} fn */ function queueMicrotask(fn) { Promise.resolve().then(fn).catch((err) => setTimeout(() => { throw err; })); });
  return added;
}

/** @typedef {(v: unknown, i: number, a: ArrayLike<unknown>) => unknown} ArrayPredicate */

/**
 * Deep clone of plain data (objects, arrays, Map, Set, Date, RegExp, typed arrays), cycles preserved.
 * @param {any} v any value structuredClone is given
 * @param {Map<unknown, unknown>} seen
 * @returns {any}
 */
function cloneValue(v, seen) {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'function' || typeof v === 'symbol') throw new TypeError('structuredClone: value could not be cloned');
    return v;
  }
  if (seen.has(v)) return seen.get(v);
  let out;
  if (v instanceof Date) out = new Date(v.getTime());
  else if (v instanceof RegExp) out = new RegExp(v.source, v.flags);
  else if (ArrayBuffer.isView(v)) out = new (/** @type {any} */ (v).constructor)(v);
  else if (v instanceof ArrayBuffer) out = v.slice(0);
  else if (v instanceof Map) {
    out = new Map();
    seen.set(v, out);
    for (const [k, x] of v) out.set(cloneValue(k, seen), cloneValue(x, seen));
    return out;
  } else if (v instanceof Set) {
    out = new Set();
    seen.set(v, out);
    for (const x of v) out.add(cloneValue(x, seen));
    return out;
  } else if (Array.isArray(v)) {
    out = new Array(v.length);
    seen.set(v, out);
    for (let i = 0; i < v.length; i++) out[i] = cloneValue(v[i], seen);
    return out;
  } else {
    out = /** @type {Record<string, unknown>} */ ({});
    seen.set(v, out);
    for (const k of Object.keys(v)) out[k] = cloneValue(v[k], seen);
    return out;
  }
  seen.set(v, out);
  return out;
}

export const installedPolyfills = installCompat();
