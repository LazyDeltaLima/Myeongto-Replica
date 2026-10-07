// Dev-only check (local patch): the Chinese still on screen in another language. Our old display-only translator
// (public/js/i18n/i18n.js) is retired — the UI goes through upstream's t() and the game texts through the data overlays
// (docs/I18N.md) — and nothing imports this module: load it by hand on a page in Korean (or any pack), from the
// browser console:
//
//   const { zhLeftovers } = await import('/js/i18n/leftovers.js'); zhLeftovers();
//
// It lists the text nodes and the title / placeholder / aria-label / alt attributes that still hold Han characters
// (player names, chat lines and the font samples are Chinese on purpose: judge the list, do not empty it blindly).
// `watch()` keeps logging what new renders add, until the returned function is called.

const HAN = /[一-鿿]/;
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE']);

/** A short CSS-like path of an element, for the console. */
function where(el) {
  const out = [];
  for (let e = el; e && e.nodeType === 1 && out.length < 4; e = e.parentElement) {
    const cls = typeof e.className === 'string' && e.className.trim() ? `.${e.className.trim().split(/\s+/)[0]}` : '';
    out.unshift(`${e.tagName.toLowerCase()}${cls}`);
  }
  return out.join(' > ');
}

function scan(root, seen, out) {
  if (!root || (root.nodeType === 1 && SKIP.has(root.tagName))) return;
  const visit = (n) => {
    if (n.nodeType === 3) {
      const v = n.data.trim();
      if (v && HAN.test(v) && !seen.has(v)) { seen.add(v); out.push({ text: v, where: where(n.parentElement) }); }
      return;
    }
    if (n.nodeType !== 1 || SKIP.has(n.tagName)) return;
    for (const a of ATTRS) {
      const v = n.getAttribute(a);
      if (v && HAN.test(v) && !seen.has(v)) { seen.add(v); out.push({ text: v, where: `${where(n)} [${a}]` }); }
    }
    for (const c of n.childNodes) visit(c);
  };
  visit(root);
}

/** The Chinese on the page now: `[{ text, where }]` (each text once), also printed as a table. */
export function zhLeftovers(root = document.documentElement) {
  const out = [];
  scan(root, new Set(), out);
  console.table(out);
  return out;
}

/** Log the Chinese that later renders add; returns the function that stops it. */
export function watch(root = document.documentElement) {
  const seen = new Set();
  scan(root, seen, []);
  const obs = new MutationObserver((list) => {
    const out = [];
    for (const m of list) {
      if (m.type === 'characterData') scan(m.target, seen, out);
      else if (m.type === 'attributes') scan(m.target, seen, out);
      else for (const n of m.addedNodes) scan(n, seen, out);
    }
    for (const r of out) console.warn(`[zh] ${r.text}  (${r.where})`);
  });
  obs.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  return () => obs.disconnect();
}
