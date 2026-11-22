// The page's script-tag globals for the browser typecheck (types/README.md 「Vendored modules and globals」).
// PixiJS 7 (public/vendor/pixi.min.js) and pixi-spine are loaded by a script tag, not imported: the code reaches them
// as `globalThis.PIXI` (any). These names are the ones JSDoc uses as types; each is any, so the vendored build is not
// checked. A new one goes here (tsc names it: TS2694).

declare namespace PIXI {
  type Container = any;
  type Texture = any;
  type Mesh = any;
}
