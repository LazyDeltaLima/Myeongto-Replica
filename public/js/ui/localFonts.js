// Fonts that only the local client extraction provides (data/local-assets.json group `fonts`, tools/local-extract/
// extract.py FONT_NAMES). The official HUD numbers name Novecentowide-Medium (the client's HUD Text nodes pick their
// font by name at runtime: the bond disc count, the bond dialog's 层数 / member count, the round / HP / kill counters —
// docs/rules/ui.md 「HUD 숫자 글꼴」); the public font source has the Normal weight only (tools/assets/fonts.mjs). When
// the manifest lists the file, it is registered as 'Novecento Wide' weight 500, so the CSS that asks for that weight
// gets it; without it the same CSS falls back to the Normal face (no synthetic bold under 600).
//
//   import { installLocalFonts } from './ui/localFonts.js'
//   data.load('local').then((m) => installLocalFonts(m))

/** Local fonts the page registers: manifest name → @font-face family / weight. */
export const LOCAL_FONTS = Object.freeze([
  Object.freeze({ group: 'fonts', name: 'Novecentowide-Medium', family: 'Novecento Wide', weight: '500' }),
]);

/**
 * Register the LOCAL_FONTS the manifest lists (each once per document); returns the families · weights added.
 * @param {any} manifest data/local-assets.json
 * @param {any} [doc] the document (its `fonts` set)
 * @param {any} [Face] the FontFace constructor
 * @returns {string[]}
 */
export function installLocalFonts(manifest, doc = globalThis.document, Face = globalThis.FontFace) {
  const set = doc && doc.fonts;
  if (!set || typeof set.add !== 'function' || typeof Face !== 'function') return [];
  const added = [];
  for (const f of LOCAL_FONTS) {
    const e = manifest?.groups?.[f.group]?.[f.name];
    const path = e && typeof e.path === 'string' && e.path.startsWith('/assets/local/') ? e.path : null;
    if (!path) continue;
    const key = `${f.family} ${f.weight}`;
    if (installed.has(set) && installed.get(set).has(key)) continue;
    let face;
    try {
      face = new Face(f.family, `url("${path}")`, { weight: f.weight, style: 'normal', display: 'swap' });
    } catch { continue; }
    set.add(face);
    // a failed load leaves the face unusable and the browser keeps the Normal one
    try { face.load?.()?.catch?.(() => {}); } catch { /* ignore */ }
    if (!installed.has(set)) installed.set(set, new Set());
    installed.get(set).add(key);
    added.push(key);
  }
  return added;
}

/** @type {WeakMap<object, Set<string>>} the faces registered per font set */
const installed = new WeakMap();
