// server/sim/content/bonds.js — the bonds (盟约), battle side + prep side (DESIGN §7, research 02).
//
// Entry point imported by content/index.js. bonds/dispatch.js picks each bond's code by the buff templates of its record
// (the nation bonds in bonds/nation/, the add-on bonds in bonds/addon/, another season's add-on template in
// bonds/general/, the prep templates no one bond owns in bonds/templates.js), plus support/meta.js (shared prep→battle
// `contentInfo`). The parts are loaded with guarded dynamic imports: one failing to load never disables the other.
// Membership (own bonds, 变形同构体 grants, 调和 enjoying active core bonds) lives in support/index.js.

async function load(path) {
  try {
    return await import(path);
  } catch (e) {
    console.error(`[content] failed to load ${path}: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`);
    return {};
  }
}

const [dispatch, supportMeta] = await Promise.all([load('./bonds/dispatch.js'), load('./support/meta.js')]);

export function install(battle) {
  if (typeof dispatch.install === 'function') dispatch.install(battle);
}

export function registerMeta(registry, data) {
  let first = null;
  if (typeof supportMeta.registerSupportMeta === 'function') {
    try { supportMeta.registerSupportMeta(registry); } catch (e) { first = e; }
  }
  if (typeof dispatch.registerMeta === 'function') {
    try { dispatch.registerMeta(registry, data ?? undefined); } catch (e) { first = first ?? e; }
  }
  if (first) throw first;
}
