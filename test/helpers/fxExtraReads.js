// test/helpers/fxExtraReads.js — static scan for reads of `x` / `y` from a sim 'fx' event's extra (its 5th slot).
//
// Battle.fx (server/sim/battle/events.js) puts the position in the tuple — ['fx', kind, x, y, extra] — and strips x / y
// from `extra`, so a client handler that reads `e[4].x` (or `o.x` where `o = e[4]`, or a parameter handed `e[4]`) always
// gets undefined: 规程 萨尔贡 6's 流沙 floor fell back to its stand-in circle that way (2026-11-14 report), and the test
// that built its event by hand with x / y in the extra passed.
//
// The scan follows the extra through one file's scopes (eslint-scope): `X[4]` (any tuple X), a variable or assignment
// whose value is one (`e[4] || {}`, `typeof e[4] === 'object' ? e[4] : null`), and a parameter of a function called with
// one — a local function by its binding, a method (`this.simFx(…)`, `obj.zone(…)`) by its name in any scanned file. It
// reports `.x` / `.y` / `['x']` member reads of those and `{ x, y }` patterns destructuring them. Event tuples other than
// 'fx' with a 5th slot are not told apart: a hit on one is listed with its reason by the caller.

import fs from 'node:fs';
import * as acorn from 'acorn';
import * as eslintScope from 'eslint-scope';

const KEYS = new Set(['x', 'y']);

function unwrap(n) {
  while (n && (n.type === 'ChainExpression' || n.type === 'TSNonNullExpression')) n = n.expression;
  return n;
}

function propName(m) {
  if (!m.computed && m.property.type === 'Identifier') return m.property.name;
  if (m.computed && m.property.type === 'Literal') return m.property.value;
  return null;
}

/** Depth-first walk over an ESTree, calling enter(node, parent) once per node. */
function walk(root, enter) {
  const stack = [[root, null]];
  while (stack.length) {
    const [n, p] = stack.pop();
    enter(n, p);
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'range') continue;
      const c = n[k];
      if (Array.isArray(c)) { for (let i = c.length - 1; i >= 0; i--) if (c[i] && typeof c[i].type === 'string') stack.push([c[i], n]); }
      else if (c && typeof c.type === 'string') stack.push([c, n]);
    }
  }
}

function functionName(fn, parent) {
  if (fn.id?.name) return fn.id.name;
  if (parent?.type === 'MethodDefinition' || parent?.type === 'Property') return propName({ computed: parent.computed, property: parent.key });
  if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
  return '(anonymous)';
}

/**
 * @param {string[]} files absolute paths
 * @returns {{ file: string, line: number, fn: string, key: string, text: string }[]}
 */
export function scanFxExtraReads(files) {
  const units = files.map((file) => {
    const src = fs.readFileSync(file, 'utf8');
    const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true, ranges: true, allowHashBang: true });
    const scopes = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module', fallback: 'iteration' });
    const parents = new Map();
    walk(ast, (n, p) => { parents.set(n, p); });
    // identifier node → its Variable (declarations and resolved references)
    const idVar = new Map();
    for (const sc of scopes.scopes) {
      for (const v of sc.variables) for (const id of v.identifiers) idVar.set(id, v);
      for (const r of sc.references) if (r.resolved) idVar.set(r.identifier, r.resolved);
    }
    return { file, src, ast, scopes, parents, idVar };
  });

  // method / function name → [{ unit, fn }] across all files (for calls through a member: this.simFx(…))
  const byName = new Map();
  for (const u of units) {
    walk(u.ast, (n, p) => {
        if (n.type !== 'FunctionExpression' && n.type !== 'FunctionDeclaration' && n.type !== 'ArrowFunctionExpression') return;
        const name = functionName(n, p);
        if (name === '(anonymous)') return;
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push({ u, fn: n });
      });
  }

  const extraVars = new Set(); // eslint-scope Variable objects bound to an extra
  const extraPatterns = []; // [unit, pattern node] of an ObjectPattern bound to an extra

  function varOf(u, id) {
    return u.idVar.get(id) || null;
  }

  function isExtra(u, n) {
    n = unwrap(n);
    if (!n) return false;
    if (n.type === 'MemberExpression' && n.computed && n.property.type === 'Literal' && n.property.value === 4) return true;
    if (n.type === 'Identifier') { const v = varOf(u, n); return !!(v && extraVars.has(v)); }
    if (n.type === 'LogicalExpression') return n.operator === '&&' ? isExtra(u, n.right) : isExtra(u, n.left) || isExtra(u, n.right);
    if (n.type === 'ConditionalExpression') return isExtra(u, n.consequent) || isExtra(u, n.alternate);
    if (n.type === 'AssignmentExpression' && n.operator === '=') return isExtra(u, n.right);
    return false;
  }

  function bindTarget(u, target) {
    if (!target) return false;
    if (target.type === 'AssignmentPattern') target = target.left;
    if (target.type === 'Identifier') {
      const v = varOf(u, target);
      if (v && !extraVars.has(v)) { extraVars.add(v); return true; }
      return false;
    }
    if (target.type === 'ObjectPattern' && !extraPatterns.some(([, p]) => p === target)) { extraPatterns.push([u, target]); return true; }
    return false;
  }

  function calleeFns(u, callee) {
    callee = unwrap(callee);
    if (callee.type === 'Identifier') {
      const v = varOf(u, callee);
      const out = [];
      for (const d of v?.defs || []) {
        if (d.type === 'FunctionName') out.push({ u, fn: d.node });
        else if (d.type === 'Variable' && d.node.init && /Function/.test(d.node.init.type)) out.push({ u, fn: d.node.init });
      }
      return out;
    }
    if (callee.type === 'MemberExpression') {
      const name = propName(callee);
      return (name && byName.get(name)) || [];
    }
    return [];
  }

  // fixpoint: grow the set of extra bindings until nothing new is bound
  for (let changed = true; changed;) {
    changed = false;
    for (const u of units) {
      walk(u.ast, (n) => {
          if (n.type === 'VariableDeclarator' && n.init && isExtra(u, n.init)) changed = bindTarget(u, n.id) || changed;
          else if (n.type === 'AssignmentExpression' && n.operator === '=' && n.left.type === 'Identifier' && isExtra(u, n.right)) changed = bindTarget(u, n.left) || changed;
          else if (n.type === 'CallExpression' || n.type === 'NewExpression') {
            n.arguments.forEach((a, i) => {
              if (a.type === 'SpreadElement' || !isExtra(u, a)) return;
              for (const t of calleeFns(u, n.callee)) changed = bindTarget(t.u, t.fn.params[i]) || changed;
            });
          }
        });
    }
  }

  const hits = [];
  const fnOf = (u, n) => {
    for (let p = u.parents.get(n); p; p = u.parents.get(p)) if (/Function/.test(p.type)) return functionName(p, u.parents.get(p));
    return '(top level)';
  };
  const record = (u, n, key) => {
    const line = n.loc.start.line;
    hits.push({ file: u.file, line, fn: fnOf(u, n), key, text: u.src.split('\n')[line - 1].trim() });
  };
  for (const u of units) {
    walk(u.ast, (n) => {
        if (n.type === 'MemberExpression' && KEYS.has(propName(n)) && isExtra(u, n.object)) record(u, n, propName(n));
        else if (n.type === 'VariableDeclarator' && n.id.type === 'ObjectPattern' && isExtra(u, n.init)) {
          for (const p of n.id.properties) if (p.type === 'Property' && KEYS.has(propName({ computed: p.computed, property: p.key }))) record(u, p, propName({ computed: p.computed, property: p.key }));
        }
      });
  }
  for (const [u, pat] of extraPatterns) {
    for (const p of pat.properties) if (p.type === 'Property' && KEYS.has(propName({ computed: p.computed, property: p.key }))) record(u, p, propName({ computed: p.computed, property: p.key }));
  }
  const seen = new Set();
  return hits.filter((h) => { const k = `${h.file}:${h.line}:${h.key}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
}
