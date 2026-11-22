// The page's script-tag globals for the browser typecheck (types/README.md 「Vendored modules and globals」).
// PixiJS 7 (public/vendor/pixi.min.js) and pixi-spine are loaded by a script tag, not imported: the code reaches them
// as `globalThis.PIXI` (any). These names are the ones JSDoc uses as types; each is any, so the vendored build is not
// checked. A new one goes here (tsc names it: TS2694). The global itself is any too, so `globalThis.PIXI` is not an
// implicit any under strict (TS7017).

declare var PIXI: any;
declare namespace PIXI {
  type Container = any;
  type Texture = any;
  type Mesh = any;
}

// Prefixed, non-standard and removed DOM members the page feature-tests before use (ui/device.js fullscreen, the
// orientation lock, ui/perfHud.js Chrome's heap figures), and the debug page's console handle (debug.js).
interface Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
}
interface HTMLElement {
  webkitRequestFullscreen?: () => void;
}
interface ScreenOrientation {
  lock?: (orientation: string) => Promise<void>;
}
interface Performance {
  memory?: { usedJSHeapSize: number, totalJSHeapSize: number, jsHeapSizeLimit: number };
}
interface Window {
  __debug?: any;
}
