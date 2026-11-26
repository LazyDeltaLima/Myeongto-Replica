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
  type Sprite = any; // any: a class of the script-tag PixiJS build, which has no types here
  type Graphics = any; // any: a class of the script-tag PixiJS build, which has no types here
  type Renderer = any; // any: a class of the script-tag PixiJS build, which has no types here
  type BaseTexture = any; // any: a class of the script-tag PixiJS build, which has no types here
  type Text = any; // any: a class of the script-tag PixiJS build, which has no types here
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
// read by the report (diag.js browserEnv): Chrome's device memory class, an iPhone home-screen app
interface Navigator {
  deviceMemory?: number;
  standalone?: boolean;
}
interface Performance {
  memory?: { usedJSHeapSize: number, totalJSHeapSize: number, jsHeapSizeLimit: number };
}
interface Window {
  __debug?: any;
}

// The field view on screen (ui/fieldHost.js; diag.js and ui/perfHud.js read it), and the page's handle for tests and
// the console (main.js): the app store, the socket, the data store, and `import` of a module of this page by its path
// from /js/.
declare var __SP_VIEW__: { kind?: string, raw?: any } | null | undefined;
// `'fallback'` keeps the render engine away (ui/fieldHost.js renderMode; dev and the mock harness).
declare var __SP_RENDER__: string | undefined;
// a screen check sets it before the page loads to see the entry film under automation (ui/entryFilm.js playEntryFilm)
declare var __SP_ENTRY_FILM__: boolean | undefined;
declare var __SP__: { store: unknown, net: unknown, data: unknown, version: number, import: (p: string) => Promise<unknown> } | undefined;
// the effect layer's own draw path (render/fxsubmit.js): its test switches — three.js's source unchanged with every uniform set
// per draw, the mat4s that go into the block too, and the dev pixel check's three.js-against-itself reference
declare var __SP_FX_SUBMIT_PLAIN__: unknown;
declare var __SP_FX_SUBMIT_MATS__: unknown;
declare var __SP_FX_SUBMIT_REF__: unknown;
// the effect layer's dev switch (render/fxgame.js update): false draws through three.js, 'check' each pass both ways
declare var __SP_FX_SUBMIT__: unknown;
