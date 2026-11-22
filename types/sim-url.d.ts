// The sim modules the debug page's arena imports by their served URL (public/js/debug/arena.js: `/sim/Battle.js`,
// `/sim/simdata.js`, `/sim/content/support/index.js`; jsconfig.browser.json `paths` maps them here, and `/sim/dir.js`
// to the file itself). A loose stand-in, like types/vendor/three.module.d.ts: the browser config does not check the
// whole sim (its data loader is Node-only, types/README.md 「What is checked now」). A new name goes here.

export const Battle: any;
export const DataSource: any;
export const withUnitLoadouts: any;
export const setSimData: any;
export const setGameData: any;
