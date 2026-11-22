# Typecheck

`npm run typecheck` runs `tsc --noEmit --checkJs` twice:

- `jsconfig.json`, the server: lib ES2022 and the Node types (`@types/node`), no DOM.
- `jsconfig.browser.json`, what the page loads: lib ES2022 + DOM, no Node types. It extends `jsconfig.json` and lists
  its own `include`; `public/js/` goes here, and `shared/` is in both, because both sides run it.

What is checked now:

- `shared/` except `shared/bandBonds.js` (its JSDoc does not match the code yet; see below), in both configs
- `server/` whole — `server/sim/`, `server/match/` and the lobby, network and HTTP files — with `types/sim-members.d.ts`
  and `types/class-members.d.ts` (the split classes, below), in the server config. The browser
  config keeps only `server/sim/rng.js`, `detmath.js`, `dir.js` and `constants.js`: the whole sim pulls in its Node-only
  data loader (`simdata.js` imports `nodeData.js` under Node only and reads `process`; `content/support/index.js`
  imports `server/data.js`, which the page gets as a generated stand-in, `server/http/static.js`), and those are its only
  errors without the Node types — the rest of the sim checks the same in both.
- `public/js/render/` and `public/js/battle/` in the browser config, with `types/page-members.d.ts` (the effect
  system's split class and the fields other files set on page classes, below) and `types/page-globals.d.ts`. tsc
  checks every file they import as well, so the page modules they reach (`audio.js`, `assets.js`, `data.js`,
  `diag.js`, `resources.js`, `store.js`, `voice*.js`, `net.js`, `gpu.js`, `ui/components.js` …) are clean too; the
  rest of `public/js/` (`ui/`, `screens/`, `main.js` …) is not yet included.
- `types/` — JSDoc for `Unit`, `DamageInfo`, the snapshot tuples, and the protocol message envelope (`types/**/*.js`)

`strict` is off. `tsc` does not read `jsconfig.json` on its own; the script passes `-p`.

## Widen it

Add one file or one folder to `jsconfig.json` `include`, then run `npm run typecheck`. Fix JSDoc that disagrees with the code in that folder. Leave `strict` off until the folder reports nothing. Do not add `@ts-nocheck`.

Next: the rest of `public/js/` (`ui/`, `screens/`, `main.js` …) in the browser config. The sim does not import `types/`; the typedefs in `types/core.js` are a reference, not a runtime dependency.

What most errors of a new folder were in `server/sim/`, and the JSDoc that fixed them:

- an options parameter with a default (`{ to, stop = 1 } = {}`): tsc takes its type from the default, so a property
  without one, or a value of another type (a function where the default is `false`), is an error. Give the parameter
  an `@param` with the full object type; tsc matches a destructured parameter to the `@param` at its position, so
  the parameters before it need theirs too.
- an object or array built empty and filled later (`const out = {}`, `const list = [{ … }]` then `list.push(other)`):
  `/** @type {…} */` on the declaration.
- a sort comparator that subtracts booleans (`(a === u) - (b === u)`): a cast on each side,
  `/** @type {any} */ (a === u)`, so the code stays as it is.
- an `@` in prose (`by @name`) is read as a tag: quote it in backticks.

And in `server/match/` and the rest of `server/`:

- a result that is one of two shapes (`{ ok: true, loadout }` or `{ error, detail }`, `OK` or `fail(…)`): with
  `strict` off, tsc does not narrow on `res.ok` / `res.error`, so reading a key one shape lacks is an error. Each shape
  lists the other's keys as `?: undefined` (`shared/protocol.js` checkLoadout …, the `Ok` / `Fail` typedefs of
  `server/match/match/common.js` and `player/common.js`); a variable that starts as `OK` and may become a `fail(…)`
  gets `/** @type {Ok | Fail} */`.
- an `Object.freeze`d defaults object (`LOBBY_DEFAULTS`, `NET_DEFAULTS`) has literal types (`60000`), so an options
  parameter typed `Partial<typeof …>` refuses another number: a typedef of the options, or `Record<keyof typeof …, number>`.
- a `new Set([PHASE.A, PHASE.B])` is a set of those literals; `.has(m.phase)` (a string) is an error: `Set<string>`.

And in `public/js/render/` and `battle/`:

- a JSDoc block that drifted away from its function (lines inserted between) types nothing and may not even parse
  (`quality: => string` is not a type: `() => string`); move it back onto the function.
- a table of tuples (`const DIRS = [['S', 0, -1], …]`) is an array of `(string | number)[]`: `@type {[string, number,
  number][]}` on it, or a cast on an inline literal.
- a field set outside the class body (`v._tween = …` in app.js, `this.kids ||= []`, `({ g: this.g } = …)`): on an
  exported class, declare it in `types/page-members.d.ts`; on a module-private one, a typedef of the class with the field
  (`@typedef {RowBatch & { g: any, ib: any }} RowBatchMesh`) and `@this {RowBatchMesh}` on the methods that use it.
- a `setTimeout` handle is a number with the DOM types: `/** @type {any} */ (t)?.unref?.()` for the Node-only call.

`types/core.js` follows docs/DESIGN.md §5.2, §5.4, §8 and docs/SIM.md §4, §9. Where those two disagree on `DamageInfo.type`, the typedef uses the union `makeDamageInfo` actually builds (`'elemental'` as well as `'element'`).

## Split classes

`Match` (`server/match/Match.js`), `PlayerState` (`server/match/PlayerState.js`) and `Battle` (`server/sim/Battle.js`)
get their methods at load time from part classes (`server/match/match/`, `server/match/player/`, `server/sim/battle/`),
copied onto the prototype. tsc does not see the copy, so:

- `types/class-members.d.ts` (`Match`, `PlayerState`) and `types/sim-members.d.ts` (`Battle`) merge the parts into the
  class type (`interface Match extends MatchPlatform, …`). Each list follows the class file's install loop: a new part
  goes into both.
- every part method carries `@this {Match}` (or `{PlayerState}`, `{Battle}`), with the type from
  `/** @import { Match } from '../Match.js' */` at the top of the part file. A part cannot extend the class in the
  `.d.ts` instead: the class already extends the parts, and two interfaces may not be each other's base. A new part
  method gets the tag too.
- a part getter (`soloUntimed`, `isHumanActive` …) takes `@this` like a method. A default parameter does not see it
  (`deployMapFor(ps, field = this.deployFieldOf(ps))`): cast `this` there.
- a part's own `this.x = …` makes `x` a member of the PART as well, and when the class declares `x` with a JSDoc
  `@type` on the statement, the parts' member wins in the merged type (tsc 5.9: `Match.phase` became
  `"SETTLE" | "RESULT"`, from settle.js; a declaration in the `.d.ts` interface body loses the same way). Type such a
  field with a cast on the value instead
  (`this.phase = /** @type {string} */ (PHASE.LOBBY)`), which keeps the class's own declaration. `skipLibCheck` hides
  the resulting `TS2430` in the `.d.ts` (a part's literal `phase` against the class's `string`); it changes nothing the
  `.js` files see.
- the same files declare what a class gets outside plain `this.x =` assignments in its own file: `SkillRuntime`'s
  `battle` and `unit` and `Unit`'s heavy references (set with `Object.defineProperty`), the fields a battle part or a kit
  sets on one kind of unit (an enemy's `tag`, `route`, `pauseUntil` …, a board piece's `items`), and the `Battle`
  fields a part makes on first use (`_allyTargets ??= new Set()`); in `class-members.d.ts` the same for `Match` and
  `PlayerState` (the console mode's fields from `server/local-console.js`, 规程's `diyLineup` …), `EffectDispatcher`'s
  `preview`, and the lobby's `Lobby` (`restartNotice`, `generation`: `server/index.js`), `Room` and `Session`. A new
  such field goes there too; tsc names it.

`types/class-members.d.ts` imports every match part, so a config that includes it checks all of `server/match/`.
`types/sim-members.d.ts` imports only `server/sim/`.

The page's one split class, `FxSystem` (`public/js/render/fx/system.js`, its parts `FX_PARTS` beside it), works the
same way: `types/page-members.d.ts` merges the parts into the class (keep its list the same as `FX_PARTS`), and every
part member carries `@this {FxSystem}` (`/** @import { FxSystem } from './system.js' */` at the top of the part).

## Vendored modules and globals

The page imports its libraries from `public/vendor/` (git-ignored copies `tools/vendor.mjs` makes on `npm install`),
and tsc would check those builds too (three.js alone gave over a thousand errors). tsc takes a sibling `.d.ts` over a
`.js`, so `tools/vendor.mjs` also copies `types/vendor/<name>.d.ts` next to each module it vendors: Preact, its hooks
and htm re-export the npm packages' own types (Preact 11); three.js has none, so `three.module.d.ts` is a loose stand-in
that lists the names `public/js` uses (each class takes any arguments and has any member; a new name goes there).
PixiJS and pixi-spine come from script tags (`globalThis.PIXI`, any); `types/page-globals.d.ts` declares the `PIXI.*`
names JSDoc uses as types. If the browser config reports errors inside `public/vendor/`, the copies are older than
their declarations: run `npm run vendor`.

## Measuring

To count the errors of folders not yet included, run tsc with a scratch config outside the repository's lists, for
instance `{ "extends": "<repo>/jsconfig.json", "include": ["<repo>/server/**/*.js", "<repo>/shared/**/*.js",
"<repo>/types/**/*"] }` (and the browser one over `public/js/`), then `tsc -p <that file> | grep -c 'error TS'`.

## Not in the first slice

`shared/bandBonds.js` — the data-shape JSDoc rejects an empty fallback object and a tuple callback. Fix the comments,
then remove it from `exclude`.
