# Typecheck

`npm run typecheck` runs `tsc --noEmit --checkJs` twice, then the strict pass (below):

- `jsconfig.json`, the server: lib ES2022 and the Node types (`@types/node`), no DOM.
- `jsconfig.browser.json`, what the page loads: lib ES2022 + DOM, no Node types. It extends `jsconfig.json` and lists
  its own `include`; `public/js/` goes here, and `shared/` is in both, because both sides run it.

What is checked now:

- `shared/` whole, in both configs
- `server/` whole — `server/sim/`, `server/match/` and the lobby, network and HTTP files — with `types/sim-members.d.ts`
  and `types/class-members.d.ts` (the split classes, below), in the server config. The browser
  config keeps only `server/sim/rng.js`, `detmath.js`, `dir.js` and `constants.js`: the whole sim pulls in its Node-only
  data loader (`simdata.js` imports `nodeData.js` under Node only and reads `process`; `content/support/index.js`
  imports `server/data.js`, which the page gets as a generated stand-in, `server/http/static.js`), and those are its only
  errors without the Node types — the rest of the sim checks the same in both.
- `public/js/` whole in the browser config, with `types/page-members.d.ts` (the effect system's split class and the
  fields other files set on page classes, below) and `types/page-globals.d.ts`. The debug page's arena imports the sim
  by its served URL (`/sim/Battle.js` …): the config's `paths` maps `/sim/dir.js` to the file and every other `/sim/`
  module to `types/sim-url.d.ts`, a loose stand-in (the browser config does not check the whole sim, above).
- What tsc does not see: the props of a component written inside an `html` template (`<${Thumb} id=${x} />`). htm
  builds the vnode at run time from the template's strings, so tsc checks the template's `${…}` values one by one,
  never against the component's `@param` — a misspelt or missing prop there is not an error (`ui/components.js`
  hFresh returns any). A component called as a function (`ChoiceView({ ...props })`) is checked.
- `types/` — JSDoc for `Unit`, `DamageInfo`, the snapshot tuples, and the protocol message envelope (`types/**/*.js`)

`strict` is off in both configs; the folders listed in `jsconfig.strict.json` are checked with it on as well
("Strict" below). `tsc` does not read `jsconfig.json` on its own; the script passes `-p`.

## Widen it

Add one file or one folder to `jsconfig.json` `include`, then run `npm run typecheck`. Fix JSDoc that disagrees with the code in that folder. Leave `strict` off until the folder reports nothing. Do not add `@ts-nocheck`.

The sim does not import `types/`; the typedefs in `types/core.js` are a reference, not a runtime dependency.

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

And in `public/js/ui/`, `screens/` and the rest of `public/js/`:

- a ref or object filled later (`const live = useRef({})`, then `live.current = { pub, … }`): `/** @type {{ current:
  Record<string, any> }} */` on the declaration — `useRef({})` is a ref of `{}`, whose members are all errors.
- a component's props `@param` lists every prop the function destructures; a callback prop with a `() => {}` default
  is typed by its default (no arguments) unless the `@param` gives it.
- a literal fallback passed to a generic (`loadPref(KEY, true)`): the result is the literal (`true`), so a comparison
  with `false` is an error. `loadPref` widens it in its `@returns`.
- a union that differs in one literal field narrows only when each value is its own member: `{ kind: 'cancel' } | {
  kind: 'leave' } | …`, not `{ kind: 'cancel'|'leave' }`.
- `querySelector` / `closest` / `activeElement` give `Element`: cast to `HTMLElement` (or `NodeListOf<HTMLElement>`)
  where the code reads `style`, `dataset`, `value`.
- a store's state outside its initial object (`store.js` `AppState`: ui/chat.js's `chat.blocked`, `chatFactions`): an
  intersection in the store's typedef, so the initial state the code resets to stays as it is; a parameter that takes
  "a store" is `{ get: () => any } & ReturnType<typeof createStore>` (or the `{ set }` it uses: `typeof
  customRulesStore` there is circular, TS2502).
- a prefixed or non-standard DOM member the page feature-tests (`webkitRequestFullscreen`, `ScreenOrientation.lock`,
  `performance.memory`): declared in `types/page-globals.d.ts`.
- a real mistake the types show is not fixed here: it gets a `// @ts-expect-error <why>` on its line (the error is
  then expected, and tsc reports the comment as unused once the code is fixed) and a work line in the maintainer's
  notes. Now: `ui/customRules.js` passes `'ok'`, not a toast kind, so those toasts show as `'info'`.

`types/core.js` follows docs/DESIGN.md §5.2, §5.4, §8 and docs/SIM.md §4, §9. Where those two disagree on `DamageInfo.type`, the typedef uses the union `makeDamageInfo` actually builds (`'elemental'` as well as `'element'`).

## Strict

`tools/typecheck-strict.mjs` (the last step of `npm run typecheck`) checks each config whole with `strict` added and
fails on an error located in a file `jsconfig.strict.json` `include`s; the rest of the program is checked strict too,
but not counted. strict is an option of the whole program, and a folder imports the rest, so a config whose own
`include` were the strict folders would also report every file they import — the list file is read only for its
`include` (run on its own, `tsc -p jsconfig.strict.json` checks the listed folders and their imports, with the
server's options only). A listed file is checked in every config that has it; a listed file neither config has is an
error.

With strict on now: `types/*`, `server/http/`, `public/js/i18n/`, `public/js/screens/game/`, `public/js/render/app/`, `public/js/battle/`, `public/js/debug/`, `public/js/ui/gameLogic/`, `shared/`, the files directly under `server/`
(`server/*.js`), the split classes' parts `server/match/match/` and `server/match/player/`, and the files directly under
`server/match/` but `bot.js` (listed one by one).

Add a folder: `node tools/typecheck-strict.mjs --count` prints the strict errors of every folder not listed yet (its
subfolders apart, the larger count of the two configs); fix the JSDoc of one until it reports nothing, then add its
`<folder>/**/*.js` to `jsconfig.strict.json`. JSDoc and declarations only, as above: the code stays as it is. What
most strict errors were, and the JSDoc that fixed them:

- a parameter without `@param` (most of them, TS7006): an `@param`, or `(/** @type {string} */ x) =>` inline on an
  arrow function's parameter. A callback passed where the parameter's type is known needs none. Some tests read a
  source line as text (`test/ui/playtest-item-detail.test.js` matches `renderInfo`'s `items:` line): there, type the
  value the callback is called on (`@param {{ [key: string]: any, items?: unknown }} u`) instead of the line.
- a variable declared empty (`let timer;`, `let out = null`, `const out = []`) and filled in a closure (TS7034,
  TS7005): `/** @type {…} */` on the declaration. In `let a = null, b;` the statement's `@type` types only `a`: give
  `b` its own inline (`let a = null, /** @type {any} */ b;`).
- a parameter whose default is `null` (`reason = null`): its type is `null` under strict, and every caller passing a
  string is an error; an `@param {string | null} [reason]`.
- a `catch (e)` variable is `unknown` (`e.code`: TS2339 on `{}`): `catch (/** @type {any} */ e)`.
- a value that is not null only because of an earlier check tsc does not follow (`signal` set together with
  `onAbort`, `stack.pop()` after `while (stack.length)`): a cast at the use, `/** @type {AbortSignal} */ (signal)`.
- an object or a frozen table indexed by a string (`MIME[ext]`, `headers['Content-Length'] = …`, TS7053):
  `@type {Readonly<Record<string, string>>}` (or `Record<string, string | number>`) on the declaration.
- an object built with some keys and given more later (`body.hw = …`): the declaration's `@type` lists the later key
  as optional.
- `new Promise((resolve) => … resolve())` (TS2810): `@returns {Promise<void>}` on the function that returns it.
- protocol / data objects read field by field (`ui/gameLogic/`): `Bag` (`{ [key: string]: any }`), `Pub`, `PubPlayer`,
  `PubField` typedefs in `public/js/ui/gameLogic/shared.js` (`/** @import { Bag } from './shared.js' */`). `isObj` is a
  type guard to `Bag` taking `unknown`: after `isObj(x)` an `any` becomes `Bag`, so a value passed on as a typed pick
  (`DiyPick`) needs a cast. A callback on an `any` value has no contextual type (TS7006): `(/** @type {unknown} */ x) =>`.
- a table indexed by a string (`TERRAIN_TIPS[key]`): `@type {Readonly<Record<string, Tip>>}` on the `Object.freeze`
  declaration also types the callbacks inside it.
- `globalThis.PIXI` (TS7017): the script-tag global is declared (`declare var PIXI: any` in
  `types/page-globals.d.ts`). A library without types (`ws`): a loose stand-in in `types/` (`types/ws.d.ts`, in the
  server config's `include`).
- the data records (`shared/`): `ChessRecord`, `SkillRecord`, `ModuleRecord`, `TalentRecord`, `TraitRecord`, `Stats`,
  `ChessStatus` in `shared/loadoutRecord.js` and `UnitForm`, `BackupUnit`, `Backups` (data/backups.json) in
  `shared/standIn.js`, each the fields the shared code reads by name plus `[key: string]: any` for the rest of the
  record; take them with `/** @import { ChessRecord } from '…/shared/loadoutRecord.js' */` rather than `any` or a new
  `Bag`. A JSDoc `object` is `any` with strict off and `object` with it on (TS2339 on every field): one of these.
- a check that takes a wire value (`shared/protocol.js` validators, `isPotential`): `@param {unknown} v`, with a cast
  where only a call proved the type (`Number.isInteger(v) && /** @type {number} */ (v) >= lo`). Keep its result
  `boolean` rather than `v is number`: the guard would also say the value is no number where the check fails. A frozen
  literal list asked about such a value (`ROOM_SIZES.includes(v)`, a list of `4 | 8`): `/** @type {readonly unknown[]}
  */ (ROOM_SIZES).includes(v)`. `isPlain` / `isObj` are guards to `Record<string, any>`, as in `ui/gameLogic/`.
- a loop over a literal list of keys of a typed object (`for (const k of ['chess', 'items']) … c.pool[k]`):
  `/** @type {const} */ (['chess', 'items'])`.
- an object literal frozen through a generic (`deepFreeze`) keeps its literal types under strict (`banCore: null` is
  `null`, `ban: []` is `never[]`): the declaration gets an explicit typedef (`CustomSettings` in `shared/ruleset.js`).
- an inline `@type` on a callback parameter narrower than the array's element (`forms.every((/** @type {UnitForm} */
  f) => …)` over `(UnitForm | null)[]`) is refused (TS2769): cast at the use inside, `/** @type {UnitForm} */ (f).skills`.
- a lobby handler takes the validated message destructured (`create(session, { mode, difficulty, … })`): an `@param`
  with the message's fields as `shared/protocol.js` `C2S` checks them (the message itself is `any` in `onMessage`).
- `.filter(Boolean)` does not narrow (`room.seats.filter(Boolean)` stays `(Seat | null)[]`): a cast on the call,
  `/** @type {Seat[]} */ (room.seats.filter(Boolean))`. A value found with a lookup the code knows succeeds
  (`room.seatOf(id) || room.spectatorOf(id)` of a member): a cast on the expression.
- `x || {}` is a union with `{}`, whose fields are errors: `@type` on the declaration with the fields optional.
- `delete o.f` of a field the type requires (TS2790): `delete /** @type {{ f?: number }} */ (o).f`.
- a method wrapped on another module's prototype (`Match.prototype.finish = function finish(o) …`, local-console.js,
  local-patch.js): the JSDoc goes on the function expression, `= /** @param {…} o */ function finish(o)`; `this` comes
  from the assignment. Wrapped by name in a loop (`PlayerState.prototype[k]`): the prototype cast through `unknown` to
  `Record<string, (...args: any[]) => any>`, and `@this {PlayerState}` on the function.
- the match parts' shared records, typed once where they are made: `Piece` / `PieceLoc` (`player/pieces.js`), `Offer`
  (`player/acquire.js`), `ShopSlot` (`player/economy.js`), `ChessInput` / `PlayerBattleInput` (`player/round.js`),
  `MatchField` (a field of `Match.fields`: the battle, or a client-run field's record), `BossWave`, `SpDraft`
  (`match/common.js`), `PublicFrame` (`match/messaging.js`), `UnitePlan` (`match/settle.js`), `BandSkillMsg`
  (`match/bandSkill.js`); a validated message an intent handler takes is typed with the fields `shared/protocol.js`
  `C2S` checks (`_onProgress`, `voteSurrender`), `_handle`'s whole `msg` stays `any` (its fields depend on `t`).
- a field's battle is a `Battle`; the DeadBattle stand-in is cast through `unknown` where it is made (`_specBattle`,
  `newBattle`: it answers like one), and a server-run field's `f.battle` is cast at the use (`/** @type {Battle} */
  (f.battle).forceEnd(…)`) — only a client-run field has none.
- a value one check proves that tsc does not follow (`_bandSkillBlock` refuses a null state, `only('slot')` proves the
  slot, `Number.isInteger(preferIdx)`): cast at the use, with a comment saying why it holds.
- the plain configurations (no `strictNullChecks`) do not narrow on an optional `undefined` member (`!ps.spectator` of
  `PlayerState | SpectatorSeat`, `tr.error` of the target / `Fail` union): cast there too, or the plain pass fails.
- a multi-line JSDoc cast whose continuation lines lack the ` * ` reads as a broken type (every field `never`): a typedef.
- `{ baseId }` → `{ baseId: /** @type {string} */ (baseId) }` changes the syntax tree (shorthand property): cast the
  whole object (`return /** @type {DiySlot} */ ({ baseId, … })`).
- the data lookups of `server/match/gamedata.js` (`gd.chess(id)`, `item`, `bond`, `band`, `stage` …) return
  `Record<string, any> | null`: an id the code already checked, or took from the data's own lists (`gd.bondIds`,
  `visibleChess`), is cast at the use, `/** @type {Record<string, any>} */ (gd.bond(id)).isCore` — no local alias.
- a `Match` / `PlayerState` field that starts `null` in the constructor gets a value cast there (`this.teamLp = /** @type
  {number | null} */ (null)`, a scheduler handle `/** @type {unknown} */ (null)`); a part that reads it in a phase
  where it is always set casts at the use (`/** @type {SharedBossPool} */ (this.bossPool).hp`).
- `MetaCtx` / `MetaHandlers` / `MetaSource` (`server/match/effectsMeta.js`) type the meta handlers: a handler table is
  `@type {Record<string, MetaHandlers>}`, so its methods' `(ctx, ev)` need no `@param`, and `ctx.source` is a
  `MetaSource` (a field only one kind carries, an effect's `ref`, is cast at the use). `MetaCtx` is
  `ReturnType<typeof makeCtx>`, inferred from the object makeCtx builds; makeCtx calls itself (`teammates`, `player`),
  so those members carry `@returns {MetaCtx[]}` / `{MetaCtx | null}`, which tsc resolves only when asked. The preview
  branch passes its own `teammates` / `player` to `previewContext`, whose argument check would need them while makeCtx's
  return type is still being inferred: there they return `unknown` (as `previewContext` takes them), and only
  `forPlayer` says `MetaCtx` — without that split tsc gives up on the whole return type (TS7023) and `MetaCtx` is `any`.
- a seeded stream is `ReturnType<typeof import('../sim/rng.js').createRng>` (`Rng` in `server/match/pool.js`), not
  `Function` (which has no `shuffle`).
- a helper taking `[value, weight]` pairs (`weightedPick` in `server/match/waves.js`) is `@template T` over
  `Array<[T, unknown]>`; a pairs list built with `.map((x) => [x, w])` is an array of arrays, not of tuples, until its
  declaration says so (`/** @type {Array<[string, number]>} */ const pairs = …`).
- a wrapper of another object's method (`wrap(obj, name, around)` in `server/match/audit.js`) is generic over the object
  and the key, `around` taking `orig: OmitThisParameter<O[K]>` (the original is bound: a part method's `@this` would
  refuse a plain call) and the method's own parameters (`O[K] extends (...a: infer A) => unknown ? A : never`), so each
  wrapper's callback needs no `@param`.
- the records the match builds and reads back get a typedef where they are made: `SpawnSpec` / `SpawnPreview` /
  `RoundPick` / `ScaleMods` (`server/match/waves.js`), `TimelineSample` (a tuple, `[gt, killed, total, resolved,
  left?]`), `RunnerField`, `PacerEntry` (`server/match/fields.js`), `ChoiceCard` (`server/match/choices.js`, a card
  entry read field by field). An object given more keys after its literal (`spec.tag = …`, `e.respawnLeft = …`) takes the
  typedef, or an `@type` listing those keys as optional, on its declaration.
- `Array.isArray(x)` on a `Record<string, any>` parameter narrows the other branch to `any[] | Record<…>`, and an
  array's own property is then an error (setupMatchWaves' factions array carries `schedule`): cast at the use,
  `/** @type {WaveFactions} */ (src).schedule`.
- a check on a method a stand-in may lack (`gd.spDraftCards && …`, TS2774 "always defined"): cast the object there,
  `/** @type {Partial<GameData>} */ (gd).spDraftCards`.
- a compound assignment to a field the type leaves optional takes the cast on its target,
  `/** @type {number} */ (e.skipped) += …`.

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
  `.js` files see. The class's value cast also types what the parts assign later: `Match.fields`, `sp`, `bossWaves`,
  `unitePlan`, `PlayerState.offers`, `loadout`, `ops`, `diy`, `standIns`, `skins` (an `Object.freeze({})` alone is
  `Readonly<{}>`, whose fields are all errors).
- a part's own member of a field the class also has is `T | undefined` (assigned in a method, not the constructor) and
  wins in the merged type: `player/pieces.js`'s `this.temp = new Array(…)` made `temp` `any[] | undefined` everywhere.
  A part that reassigns such a field writes through a cast of `this`, `/** @type {PlayerState} */ (this).temp = …`
  (`personalChoice` in `player/round.js`, `_pubTimer` in `match/platform.js`): no member of the part, the class's type
  stays. A field only a part makes keeps its part member (`_deployChests`: a `@type` on the statement).
- the same files declare what a class gets outside plain `this.x =` assignments in its own file: `SkillRuntime`'s
  `battle` and `unit` and `Unit`'s heavy references (set with `Object.defineProperty`), the fields a battle part or a kit
  sets on one kind of unit (an enemy's `tag`, `route`, `pauseUntil` …, a board piece's `items`), and the `Battle`
  fields a part makes on first use (`_allyTargets ??= new Set()`); in `class-members.d.ts` the same for `Match` and
  `PlayerState` (the console mode's fields from `server/local-console.js`, 规程's `diyLineup` …), `EffectDispatcher`'s
  `preview`, and the lobby's `Lobby` (`restartNotice`, `generation`: `server/index.js`; `feedback`, `moderation`:
  `server/local-patch.js`), `Room` and `Session` (the chat moderation's `browserId` …, the chat's `lastChatAt`). A new
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
PixiJS and pixi-spine come from script tags (`globalThis.PIXI`, any); `types/page-globals.d.ts` declares that global
and the `PIXI.*` names JSDoc uses as types. The server's `ws` has no types either: `types/ws.d.ts` is its loose
stand-in (the server, with the members `server/http/websocket.js` calls, and a socket whose members are all any). If the browser config reports errors inside `public/vendor/`, the copies are older than
their declarations: run `npm run vendor`.

## Measuring

To count the errors of folders not yet included, run tsc with a scratch config outside the repository's lists, for
instance `{ "extends": "<repo>/jsconfig.json", "include": ["<repo>/server/**/*.js", "<repo>/shared/**/*.js",
"<repo>/types/**/*"] }` (and the browser one over `public/js/`), then `tsc -p <that file> | grep -c 'error TS'`. For strict, `node tools/typecheck-strict.mjs --count` counts every
folder not yet listed (above).
