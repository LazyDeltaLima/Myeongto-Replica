// htm as the page loads it (public/vendor/htm.module.js): the package's own types (see preact.module.d.ts). The
// package's declaration file is CommonJS for tsc (no "type": "module"), so its default export sits one level down.
import htmPackage from 'htm';

declare const htm: typeof htmPackage.default;
export default htm;
