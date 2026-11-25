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
  `/** @type {number} */ (/** @type {unknown} */ (a === u))`, or write the number (`Number(a === u)`) where the code may change.
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
  (`@typedef {RowBatch & { g: PIXI.Graphics, ib: Float32Array }} RowBatchMesh`, the fields' own types) and `@this {RowBatchMesh}` on the methods that use it.
- a `setTimeout` handle is a number with the DOM types: `/** @type {{ unref?: () => void }} */ (/** @type {unknown} */ (t)).unref?.()` for the Node-only call.

And in `public/js/ui/`, `screens/` and the rest of `public/js/`:

- a ref or object filled later (`const live = useRef({})`, then `live.current = { pub, … }`): `/** @type {{ current:
  Record<string, unknown> }} */` (or a typedef of the fields read) on the declaration — `useRef({})` is a ref of `{}`, whose members are all errors.
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

**No `any`** (maintainer decision 2026-11-25): do not write `any` unless it is truly needed. A value of unknown shape is
`unknown`, narrowed where it is read; a record read field by field is a typedef of the fields read plus
`[key: string]: unknown` for the rest; a callback table is the real signature or a generic; `catch (e)` stays `unknown`.
What may stay is one declaration of an outer value with no type (a script-tag global) and the places JSDoc cannot
express, and its line says `any: <why>`. `tools/typecheck-strict.mjs` enforces it in the folders of its `ANY_FREE` list:
an `any` in a type position (a JSDoc `{…}` type, a `types/*.d.ts` declaration) without `any: <why>` on the same line fails
`npm run typecheck`. `node tools/typecheck-strict.mjs --any` prints the count per folder; add a folder to `ANY_FREE` once it
reads 0. Some of the older examples below still show `any` where they were written before this rule; do not copy it.

`tools/typecheck-strict.mjs` (the last step of `npm run typecheck`) checks each config whole with `strict` added and
fails on an error located in a file `jsconfig.strict.json` `include`s; the rest of the program is checked strict too,
but not counted. strict is an option of the whole program, and a folder imports the rest, so a config whose own
`include` were the strict folders would also report every file they import — the list file is read only for its
`include` (run on its own, `tsc -p jsconfig.strict.json` checks the listed folders and their imports, with the
server's options only). A listed file is checked in every config that has it; a listed file neither config has is an
error.

With strict on now: `types/*`, `server/http/`, `public/js/i18n/`, `public/js/screens/game/`, `public/js/render/app/`, `public/js/battle/`, `public/js/debug/`, `public/js/ui/gameLogic/`, `shared/`, the files directly under `server/`
(`server/*.js`), the split classes' parts `server/match/match/` and `server/match/player/`, the files directly under
`server/match/` (`server/match/*.js`), and in `server/sim/content/` the kit registry (`kits/*.js`), the kit helpers
(`kits/shared/`), `garrisons/`, `support/`, `bonds/`, `items/` and `bands/`, the `Battle` parts `server/sim/battle/`, and
the files directly under `server/sim/` (`server/sim/*.js`), the files directly under `server/sim/content/`
(`server/sim/content/*.js`), the enemy kits `server/sim/content/enemies/` and the operator kits
`server/sim/content/kits/ops/`, and in the renderer the 3D board `public/js/render/board3d/` and the effect system's parts
`public/js/render/fx/`, the files directly under `public/js/` (`public/js/*.js`), the screens directly under
`public/js/screens/` (`public/js/screens/*.js`) and, one by one until the whole folder is clean, the files directly under
`public/js/ui/` that are (the list names each).

Add a folder: `node tools/typecheck-strict.mjs --count` prints the strict errors of every folder not listed yet (its
subfolders apart, the larger count of the two configs); fix the JSDoc of one until it reports nothing, then add its
`<folder>/**/*.js` to `jsconfig.strict.json`. JSDoc and declarations only, as above: the code stays as it is. What
most strict errors were, and the JSDoc that fixed them:

- a parameter without `@param` (most of them, TS7006): an `@param`, or `(/** @type {string} */ x) =>` inline on an
  arrow function's parameter. A callback passed where the parameter's type is known needs none. Some tests read a
  source line as text (`test/ui/playtest-item-detail.test.js` matches `renderInfo`'s `items:` line): there, type the
  value the callback is called on (`@param {{ [key: string]: unknown, items?: unknown }} u`) instead of the line.
- a variable declared empty (`let timer;`, `let out = null`, `const out = []`) and filled in a closure (TS7034,
  TS7005): `/** @type {…} */` on the declaration. In `let a = null, b;` the statement's `@type` types only `a`: give
  `b` its own inline (`let a = null, /** @type {Foo | null} */ b;`).
- a parameter whose default is `null` (`reason = null`): its type is `null` under strict, and every caller passing a
  string is an error; an `@param {string | null} [reason]`.
- a `catch (e)` variable is `unknown` (`e.code`: TS2339 on `{}`): leave `e` as `unknown` and narrow it (`e instanceof Error ? e.message : String(e)`; a code field: `(e && typeof e === 'object' && 'code' in e) ? e.code : …`).
- a value that is not null only because of an earlier check tsc does not follow (`signal` set together with
  `onAbort`, `stack.pop()` after `while (stack.length)`): a cast at the use, `/** @type {AbortSignal} */ (signal)`.
- an object or a frozen table indexed by a string (`MIME[ext]`, `headers['Content-Length'] = …`, TS7053):
  `@type {Readonly<Record<string, string>>}` (or `Record<string, string | number>`) on the declaration.
- an object built with some keys and given more later (`body.hw = …`): the declaration's `@type` lists the later key
  as optional.
- `new Promise((resolve) => … resolve())` (TS2810): `@returns {Promise<void>}` on the function that returns it.
- protocol / data objects read field by field (`ui/gameLogic/`): `Bag` (`{ [key: string]: unknown }`), `Pub`, `PubPlayer`,
  `PubField` typedefs in `public/js/ui/gameLogic/shared.js` (`/** @import { Bag } from './shared.js' */`). `isObj` is a
  type guard to `Bag` taking `unknown`: after `isObj(x)` an `any` becomes `Bag`, so a value passed on as a typed pick
  (`DiyPick`) needs a cast. A callback on an `any` value has no contextual type (TS7006): `(/** @type {unknown} */ x) =>`.
- a table indexed by a string (`TERRAIN_TIPS[key]`): `@type {Readonly<Record<string, Tip>>}` on the `Object.freeze`
  declaration also types the callbacks inside it.
- `globalThis.PIXI` (TS7017): the script-tag global is declared (`declare var PIXI` in
  `types/page-globals.d.ts`, typed by the members the code calls; a global with no type at all keeps `any: <why>` on its line). A library without types (`ws`): a loose stand-in in `types/` (`types/ws.d.ts`, in the
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
- a registration helper whose callbacks take a known payload per hook name (items/battle.js `Scope.on`): generic over a
  map of the hook names to their payloads (`@template {keyof ItemHooks} K`, `fn: (c: ItemHooks[K]) => void`, the map in
  items/shared.js built from the payload typedefs of `support/index.js` — `AttackEv`, `FatalEv`, `HealEv`,
  `BeforeStatusEv` joined `DeployEv` … there), so no callback needs an `@param`. `battle.on` itself is generic the same
  way (`HookPayloads` in battle/hooks.js, any other name's payload `any`): the Scope passes its callback on as a
  `HookFn`.
- a table of behaviours (items/effects `BUFFS` through `early(fn)` / `late(fn)`, bands `BY_KEY`, `MARK_BY_KEY`, the prep
  table `K` filled by assignment `K.key = (ps) => ({ … })`): one function typedef (`ItemFn`, `BandFn`, `BandKeyFn`) on the
  wrapper's parameter or the table's `@type {Record<string, …>}` types every entry's parameters, and a prep entry that
  returns `MetaHandlers` types its hooks' `(ctx, ev)` too.
- a ctx two callers build differently (bands/progress.js: a meta handler's `MetaCtx`, the 指令 view's small object of
  match/bandSkill.js): a structural typedef of the reads it takes (`StageCtx`), not either caller's type.
- a lookup that returns its argument when it has no mapping (`canonicalBuffKey`): `@template T @param {T} key @returns
  {T | string}`, so a string stays a string.
- `Array.isArray(x)` on a `Record<string, any>` parameter narrows the other branch to `any[] | Record<…>`, and an
  array's own property is then an error (setupMatchWaves' factions array carries `schedule`): cast at the use,
  `/** @type {WaveFactions} */ (src).schedule`.
- a check on a method a stand-in may lack (`gd.spDraftCards && …`, TS2774 "always defined"): cast the object there,
  `/** @type {Partial<GameData>} */ (gd).spDraftCards`.
- a compound assignment to a field the type leaves optional takes the cast on its target,
  `/** @type {number} */ (e.skipped) += …`.
- a step generator (`server/match/bot.js`: `planLayoutSteps`, `arrangeSteps`, `botPrepBeginSteps` …) says what it
  returns, `@returns {Generator<undefined, LayoutPlan>}`, and what drives it is generic over that return
  (`runSteps`, `scheduleBotPrep`'s `drive`: `@template T`, `Generator<unknown, T>`, the callback taking `T | null`), so
  the rehearsal job reaches `botPrepEndSteps` typed (`Rehearsal`), not as `any`.
- a value cached on a class field that the `.d.ts` declares (`m._botPath`, the field model) gets an explicit typedef
  (`FieldModel`): `ReturnType<typeof fieldModel>` would name itself through the declaration. The AI seat's other memory
  (`_botFocus`, `_botSeenUids` …) is declared in `class-members.d.ts` the same way. The bot's typedefs: `Rec` (a record
  read field by field), `BondPlan`, `BotRoute`, `FieldModel`, `BotCtx`, `LayoutUnit`, `LayoutParams`, `Rehearsal`.
- a function returning its record argument or a copy of it (`rangeRec`) is `@template {Rec | null} R`, so a caller's
  null check still holds on the result; a class extending `Map` takes `@extends {Map<number, string>}`
  (`LayoutPlan`).
- a lookup whose JSDoc is narrower than what it takes (`gd.bandBondIds(null)` answers `[]` for a seat before the band
  draft): widen the `@param` there rather than cast every caller.
- the content helpers (`server/sim/content/support/index.js`) take `Battle` and `Unit`
  (`/** @import { Battle } from '../../Battle.js' */`); a data lookup's scope is `DataScope` (a battle, a prep ctx or a
  data object, read field by field), and a check that is also asked about a stand-in object (a reserve probe
  `{ kind, side, ownerId, def, items }`: `isOp`, `unitBonds`, `isMember`) takes `UnitLike` — `isOp` is a guard generic
  over it, so a `Unit` stays a `Unit`. A JS object literal is no `Record<string, number>` (it has no index signature):
  a buff's `mods` is `Record<string, any>`.
- a battle hook's callback (`battle.on(name, fn)`) takes the payload typedef of `support/index.js` for an engine hook
  (`DeployEv`, `KillEv`, `DeathEv`, `SkillEv`, `StatusEv`, `TickEv`, `BurstEv`, `HitEv`, `DamagedEv`, `LayerGainEv` …,
  as the engine emits them): `on` is generic over the hook name (`HookPayloads`, battle/hooks.js), so a callback needs
  no `@param` once `battle` is a typed `Battle`; the inline `(/** @type {DeployEv} */ { unit, move }) =>` the content
  files wrote before still holds (it is checked against the map). A content hook's own name has an `any` payload.
- a table of installers or handlers typed once on its declaration types every method in it: the IN_BATTLE 特质's
  `@type {Record<string, Installer>}` (`garrisons/shared.js`: `Installer` = (battle, `GarrisonInst[]`)), the prep 特质's
  `@type {Record<string, GarrisonHandlers>}` (`garrisons/prep/shared.js`: a `GarrisonCtx` is a `MetaCtx` whose source is
  the 特质's — `bb`, `bbStr`, `piece` … present — registered with a cast to `MetaHandlers`, since only the garrison
  dispatch runs them), a global handler `@type {MetaHandlers}`.
- state one family of instances keeps (`GarrisonInst`'s optional `locks`, `rate`, `seen` …, set by that family's
  installer before its hooks run) is read through a cast to the family's typedef at the loop or the lookup that knows it
  is set (`/** @type {AmmoInst} */ (list[i])`, `for (const it of /** @type {BlockInst[]} */ (list))`), not one cast per
  field.
- `Unit.buffs` is `object[]`, so a buff's fields read through a cast of `findBuff`'s result,
  `/** @type {{ timeLeft: number } | null} */ (u.findBuff(key))`.
- a shared empty fallback list (`EMPTY`) is `readonly never[]` (a cast on `Object.freeze([])`: the plain pass reads it
  as `readonly any[]`), so `list ?? EMPTY` keeps the list's element type.
- a bond file's installers and tables (`server/sim/content/bonds/shared.js`): a nation / general template's installer is
  `@type {BondInstaller}` on its function declaration (`(battle, pid, bb, members)`), the file's `TEMPLATES`
  `@type {Readonly<Record<string, BondTemplate>>}` (its arrow installers need nothing then), a prep table
  `Readonly<Record<string, PrepTemplate>>` (`bonds/templates.js`: `prep(bondId)` returns `MetaHandlers`, so a part
  written as `/** @returns {MetaHandlers} */ const part = () => ({ onPrice(ctx, ev) … })` types its hooks). A record is
  `BondRec`, a template's numbers `BondBb`; a per-battle state kept in `battleStore` (any) gets its typedef on the
  declaration (`/** @type {IberiaState} */ const st = S.battleStore(…)`, `AddonState`).
- a hook that hands its callback a source it found (`onDealt`, `onUnitHit`, `onUnitDamaged` run it for the source unit
  they keyed it on): `DamagedEv.source` is still `Unit | null`, so the callback casts it once where it reads it,
  `const u = /** @type {Unit} */ (c.source)`.
- a `let` set after closures that read it are made (`spawnGiant`'s `u`, filled by `spawnWalker` before any of them runs):
  `let u = /** @type {Unit} */ (/** @type {unknown} */ (null))`, the assignment cast too — otherwise every closure sees
  `Unit | null`.
- a buff of `Unit.buffs` / `findBuff` (`object`): `BuffRec` (`bonds/shared.js`), cast on the list or the lookup
  (`for (const b of /** @type {BuffRec[]} */ (e.buffs.slice()))`). `Unit.s` is never null once read (its getter's
  `@returns`), `Unit.mem` is `Record<string, any>` (content's scratch space).
- an engine method whose parameter defaults to `null` (`loseHp`'s `tags`, `redeploy`'s `tile`, `isReservedTile`'s `src`,
  `allies(ownerId)`, `allySelectable(a, by)`, `holdProtect`'s `source`, `_setupUnit`'s `kit`, `_safe`'s `owner`,
  `unitsInGrid`'s `side`) takes the `@param` there; `after` / `every` return a
  `Scheduled` (`battle/hooks.js`), whose `cancel` is set after the literal (a cast on it). JSDoc matches a destructured
  parameter (`{ side = null } = {}`) by position, so the parameters before it need their `@param` too.
- the kit helpers (`server/sim/content/kits/shared/`, imported by every kit of `kits/ops/`) share the typedefs of
  `kits/shared/tier1.js`: `KitChess` (the raw loadout-resolved record, maybe absent), `KitDef` (the normalised def),
  `Bb` (a blackboard, `TalentRecord['bb']`), `DmgRec` (`HitEv['dmg']`), `Tile`, `Grid` (`ReadonlyArray<ReadonlyArray<number>>`:
  a kit passes its own frozen offset lists as well as data grids); a builder is `KitBuilder` (`kits/shared/chessPick.js`).
  A helper's types reach the kits' plain pass at once, so a parameter a kit fills with a partial object is typed by
  what the helper reads (`instantKind(def)`: `{ skill?: { maxCharges?: number } | null }`; `pullToward`'s puller
  `{ x, y, side? }`), a tile list a kit passes as `number[][]` takes `@template {ReadonlyArray<number>} T` (`betterEnemyTiles`,
  `bestTile`), and a `ChessDef` field built from the untyped record (`def.talents`) is `any`: its callbacks take an
  inline type. A generic over several builders' return types (`altSkills`) failed with TS2719: they return `KitSkill` (the operator
  kits below).
  A `@type` on a declaration in the middle of a line (`=> { /** @type {…} */ const o = {}; …`) is not read: cast the
  value instead (`const o = /** @type {Record<string, number>} */ ({})`).
- the `Battle` parts (`server/sim/battle/`) share their records as typedefs where they are made: `Hook`, `HookFn`,
  `HookPayloads`, `Scheduled` (hooks.js), `Buff` (status.js: `ReturnType<typeof makeBuff>`; `Unit.buffs` is `object[]`,
  so a list is read through `/** @type {Buff[]} */ (unit.buffs)`), `StatusTpl` / `ValuedTpl` / `ValuedTail` /
  `StatusOpts` (status.js), `BattlePlayer`, `PlayerInput`, `UnitInput`, `AllyDef` (players.js: `Battle.players` is
  `any[]`, cast where a part walks it), `PlayerResult`, `BattleResult`, `UnitEnd`, `UnitStat`, `Shot` (lifecycle.js),
  `LeakEntry` (deploy.js), `SpawnOpts`, `PendingSpawn`, `EnemyMods`, `Bounty` (spawns.js), `RouteSpec` (tiles.js),
  `TokenOpts`, `DeviceOpts` (summons.js), `FieldSnapshot` (events.js). A record a part only passes on to an untyped
  function (a DamageInfo, a profile, heal options) is `object`.
- `@param {object} x` before the `@this` tag swallows the `@this` (`this` is the part class again): put `@this` first
  in such a block.
- a field a part sets on a unit (`_regenAcc`, `_rangeExtend`, `liveRangeGrid`, `quietDeployAt` …) is declared in
  `types/sim-members.d.ts`; a field declared optional there that every enemy gets as it spawns (`atkStandUntil`,
  `colR`, `unbalanceUntil`) is cast at a comparison, `/** @type {number} */ (e.colR) > wide`, as is an optional option
  compared to a number (`/** @type {number} */ (opts.duration) > 0`).
- a part's `this.enemies = this.enemies.filter(…)` made `enemies` a part member inferred from itself (any for every
  reader of `Battle.enemies`): it writes through `/** @type {Battle} */ (this).enemies`, as above.
- `Array.isArray` does not narrow a `readonly` array type (the other branch keeps it): a parameter tested that way is
  `number[]`. A boolean helper that proves a field (`walk(route)` in `groundPathTiles`) is cast to a type predicate,
  `/** @type {(r: RouteSpec | null) => r is RouteSpec & { start: number[] }} */ ((route) => …)`.
- `Battle`'s constructor options are `BattleOpts` and its flags `BattleFlags` (Battle.js: the fields it reads by name plus
  `[key: string]: any` for what parts, content and tests add); `Battle.players` stays `any[]` (content reads fields
  of its own on a player), a part walking it casts to `BattlePlayer[]`.
- the `Unit` fields the constructor starts `null` take their type from a cast on the value (`this.skill = /** @type
  {SkillRuntime | null} */ (null)`, `profile`, `kit`, `swing` (`Swing`, units.js), `blockedBy`, `countdown` …), so a
  part reading one after a check it cannot follow (`_setupUnit` gave it a skill; a closure) casts there,
  `/** @type {SkillRuntime} */ (u.skill).reset(cs)`. A field null exactly while another is (`_ixB` with `_ixT`) is cast
  through `unknown` to its non-null type. `findBuff` keeps `object | null` and `Unit.buffs` `object[]` (content reads
  fields of its own on a buff): read through a cast, as above.
- the sim's small records get a typedef where they are made: `Dir` (dir.js; `isDir` a guard to it, `normDir` returns
  it), `BodyLike` / `TileKeys` (body.js: what the body helpers read of a unit or a kit's stand-in), `TileInfo`,
  `FlowField` (grid.js), `Projectile` (projectiles.js, `ReturnType<ProjectileSystem['add']>`; battle/lifecycle.js
  `Shot` is it), `FearStamp` / `FearMove` (fear.js), `LegPoint` (walk.js), `Checkpoint` (wideStage.js). A table indexed
  by a string (`STATUS`, `STEER_BY_ENEMY`, `DEFAULT_LEGEND`) takes `@type {Readonly<Record<string, …>>}`.
- a seeded stream's `pick` / `weighted` return `T`, not `T | undefined`, as an index does (rng.js): their empty case
  is the caller's, like `arr[i]`. `shuffle` keeps the element type, so a list from `.filter(Boolean)` is cast first.
- a helper that takes a Set, a Map or an array of keys (`bodyInKeys`, `bodyInRange`: `typeof keys.has === 'function'`)
  reads each through a cast to the branch's type; tsc does not narrow a union by `typeof x.has`.
- the battle spec and the result wire helpers (spec.js) read JSON field by field: their inputs are
  `Record<string, any>`, and an object they build key by key (`compactResult`'s `perPlayer` rows, a leak, a unit's
  stats, `battleProgress`'s `out`) takes a `@type` listing the later keys as optional. `(Array.isArray(x) ? x :
  []).map((l) => …)` over an `any` `x` is `any[] | never[]`, whose `map` gives the callback no type (TS7006): an
  inline type on its parameter. A hook handle `battle.on` returned for a callback that is a function is never null:
  cast it where `off` takes it.
- the targeting helpers (targeting.js) take `Unit`; a priority table is `Record<string, (e: Unit) => number>`, and a
  comparator chosen by a conditional (`trigFirst`'s `cmp`) takes its function type on the declaration, which types
  every branch. `Unit.trait` is a `ProfessionState` (`units.js`: the profession helpers' fields, optional, and
  `[key: string]: any` for a kit's own), so a field reads without a cast.
- the profession tables (professions.js): a profile is a `Profile` — `Record<string, any>` plus its callbacks written
  as methods (`dmgMul?(battle, unit, target): number` …), so `P({ dmgMul: (b, u, t) => … })` types the callback's
  parameters, and a method's parameters are compared both ways, so an install helper may take a narrower unit than
  `ProfiledUnit` (`Unit & { profile: Profile }`): one that sets its own `trait` fields first (`installLibrator`'s
  `ramp`, `installHunter`'s rounds) takes the unit with them required (`LibratorUnit`, `HunterUnit`), and its closures
  read them as numbers. The frozen tables keyed by a sub-profession (`SUB`, `PROFESSION_DEFAULTS`, `TUNE`) carry
  `Record<string, …>` on the declaration.
- the skill runtime (skills.js): a field first assigned outside the constructor (`reset`'s `_castStage`,
  `_durationFrom`) is `T | undefined` even with a `@type` on the statement — cast at the
  read, or once where a method reads a field its caller has just set (`_tickBegin`'s `_begin`, `_tickCast`'s
  `_castStage`). The prefab trigger is `SkillTrig` (`NonNullable` of `normSkillCast`'s `trig`); a SkillSpec callback's
  ctx is `SkillCtx` (the fixed fields and `[key: string]: any`); `castPick` stays `any` (each kit its own shape). A
  unit's optional window (`skillStateUntil`, `bornUntil`) compared with `>` is cast to `number` at the comparison (an
  absent one compares false, as the code wants).
- the damage pipeline (damage.js) takes a descriptor as `DamageIn` (`Record<string, any>`: content passes its own
  fields) and reads the normalised one as `DamageInfo` (`ReturnType<typeof makeDamageInfo> & Record<string, any>`,
  cast once where `dealDamage` normalises it). A frozen table read by a string key that varies per entry
  (`ELEMENT[el]`, whose `ally` / `enemy` fields differ by element) is cast to `Readonly<Record<string, any>>` at the
  read. A unit stat a helper adds on first use (`stats.elem`) is written through a cast, `/** @type {{ elem?: number }} */
  (source.stats).elem = …`.
- the data layer (simdata.js) normalises JSON records: their parameters are `Record<string, any> | null | undefined`,
  a value tested by `typeof` first is `unknown`, and the one that takes an array or an object (`pairOf`) or calls
  itself on its fields (`normAttackAnim`, with `@returns {AttackAnim | null}` against TS7023) is `any`. The
  `DataSource` raw lookups that go through `fallback` (`rawChess` …) take `@returns {Record<string, any> | null}`
  (TS7023 otherwise); its def caches stay `Map<any, any>`, so `getChess` / `getToken` still return what they did.
  `freezeDef` is generic (`@template T`). A number from `Number(v)` or null compared with `> 0` is cast at the
  comparison (`normSkillCast`), and a loadout index the `skillIsDefault` check proves is cast at the index.
  `normalizeChess` takes a record: a kit helper's `KitChess` (maybe absent) is cast with `NonNullable` where its
  `def ?? normalizeChess(chess)` falls back.
- the attack loop and the enemy AI (ai.js): the parameters are `Battle` / `Unit`, and a profile `AttackProfile`
  (`Record<string, any>`: effectiveProfile's merge of the profession profile and a skill's overrides, read by key;
  `effectiveProfile` returns it non-null, as its callers hold an armed unit). A projectile's `onHit` takes `ShotHit`
  inline (`addProjectile` takes an `object`, so the callback has no contextual type). The route legs are a tagged
  union (`RouteLeg`), and the array `compileRoute` pushes them into carries `@type {RouteLeg[]}`: without it each
  literal's `t` is a `string`, and a caller's `leg.t !== 'move'` narrows nothing (routePreview.js). An enemy's
  `e.route` is cast to `RouteState` where it is read (null only in `remainingDistance`). A swing at its strike is cast
  from `u.swing` (`Swing | null`) once, and an enemy's with its targets required. `--` on an optional field goes
  through a cast of its object, `/** @type {{ boomerangsOut: number }} */ (u.trait).boomerangsOut--`. Enemy fields
  set outside the spawn (`palsyUntil`, `trace`) are declared in `types/sim-members.d.ts`.
- the enemy abilities (content/enemies.js, bosses.js, local-patch.js): the runtime model of enemies.js's header is
  typed there once — `AbState` (`e.mem.ab`, with its `AbSkill` table and the open `AbCast`), `EnemyAbility` (its
  methods, the kit's own fields beside them), `AbList` (what a kit returns, falsy entries included) and `EnemyKit`.
  A kit's `@returns {AbList}` (or a list's `@type {AbList}`, `push` included) types every method's parameters by
  context; a list built some other way (`.map` of skill pairs, an ability built field by field) gets the type by a
  cast or on its declaration. The kit tables (`KITS`, `BOSS_KITS`, `DEVICE_KITS`) are cast to
  `Readonly<Record<string, EnemyKit>>`. A kit's own state object `P` that starts with `null` fields is
  `Record<string, any>`; an enemy's `e.profile` (`Record<string, any> | null` on Unit, always set on an enemy) is cast
  where a kit writes it. The helpers in enemies/helpers.js the kits call with a typed battle (`targetsNear`,
  `allTargets`, `areaAllies` …, `attach`) carry their `@param`s, so their results are `Unit[]`; the ones with a `null`
  or `[]` default (`canCast`, `hurt`, `elem`, `setForm`, `lpLoss`, `zone`) say what else they take.
- the enemy kit families (content/enemies/*.js): a kit function takes `@type {EnemyKit}` on its declaration, or
  `@type {AbKit}` (`(ab) => AbList`, enemies.js) when it reads only the ability state — another kit calls that one with
  `ab` alone (`kitDeathSpawn()(ab)`), which an `EnemyKit` would refuse (TS2554). Each family's table is cast to
  `Readonly<Record<string, EnemyKit>>` (`Record<…>` where it is not frozen), which types its inline arrow kits. An
  ability building block returns `EnemyAbility` (`@returns` on its arrow or function, which types the methods of the
  literal it returns); an ability built in a `const` first (`const boom = { … }`) takes `@type {EnemyAbility}` there,
  and a list ending in `.filter(Boolean)` is cast before the filter (`/** @type {AbList} */ ([{ … }, rush]).filter(…)`).
  A method a kit adds that other code calls (`refresh`, `liberate`) is declared on `EnemyAbility`, since an index
  signature types no parameters. A buff's `onTick` / `onExpire` callback takes `BuffTick` (enemies/helpers.js) inline.
  `castStrikeAt` returns `number | null` (null: a parallel group, a sequence after a projectile), and a caller that
  compares it with `> 1e-9` casts it to `number` (null compares as no frame). Some tests read kit lines as text
  (`test/docs-consistency.test.js` matches leaders.js `const inR = (b, e, s) =>`): there the `@param`s go on the line
  above.
- the operator kits (`server/sim/content/kits/ops/`): a kit file's `export default` takes `/** @type {KitFns} */`
  (kits/shared/tier1.js: `KitFn` is `(bb, chess, def) => KitSpec`), which types every builder's parameters and what it
  returns: `skill` / `skills` are `KitSkill`s, whose hooks take `SkillCtx`; `attack` is a `KitAttack` (its `onHit` /
  `onEachHit` take `SkillCtx`, its other callbacks are the profile's it overrides, ai.js effectiveProfile); `install`
  and `talents[].install` take `(battle, unit)`; `trait` is a `Profile`. An index signature gives a method no
  contextual type (TS7006 / TS7031 even under `[key: string]: any`), so a hook the engine calls by name is listed in the
  typedef. A builder declared apart (`function pithst(bb, chess, def)`, an exported `tinmanKit`) takes `@type {KitFn}`
  in its block; a kit built in a `const kit = { … }` that gets more keys after takes `@type {KitSpec}` (`KitSpec & {
  skill: KitSkill }` when it then writes `kit.skill.targeting`), a spec built apart `@type {KitSkill}`. The helpers that
  build a `skills` map (`alt` tier4, `altSkills` tier3, `lazySkills` tier5) take builders returning `KitSkill`, and
  `withDefaults` (tier4) takes `KitFns`, so the specs inside them are typed too. A helper of a hook that reads only the
  battle and the unit takes `BattleUnit` (tier1), a skill hook written apart `@param {SkillCtx}`. A buff's `onTick` /
  `onExpire` / `onRemove` take `BuffTickCtx` / `BuffEndCtx` (buffs.js makeBuff; status.js casts them at the call, where
  the check sits outside the closure), so `addBuff(u, { onTick: ({ battle, unit, buff }) => … })` needs nothing; a
  projectile's `onHit` is not typed (`addProjectile` takes `object`; ai.js and enemies/helpers.js type theirs inline):
  an inline type on its parameter. `unit.profile` (`Profile | null`, set before any talent installs) is cast to
  `Profile` where a kit reads it, `unit.skill` to `SkillRuntime` after a check tsc does not follow (an `install` that
  returned without one, a filter that kept armed units), `unit.rangeKeys` (a deployed unit has them) to `number[]`
  where a helper takes `readonly number[]`, `findBuff` / `unit.buffs` through `BuffRec`, and `skill.castPick` (`any`)
  gets an inline `Unit` on its callbacks. A `const x = c.source` read after `byEnemyAttack(c)` is cast once there.
  A `skills` map filled by assignment (`const skills = {}; if (r1) skills[S1] = { … }`, the stand-ins) takes
  `@type {Record<string, KitSkill>}` on the declaration (the plain pass refuses `{}` as `skills` otherwise). A hook
  `HookPayloads` does not list (`beforeAttack`) has an `any` payload, so a callback over `c.targets` takes an inline
  `Unit`; `ammoUsed`'s `left` (`SkillEv`, optional) is cast to `number` at a comparison; a handler registered for both
  `hit` and `damaged` takes `HitEv | DamagedEv`, one that sets `stopPropagation` (battle/hooks.js stops there)
  `HitEv & { stopPropagation?: boolean }`. tier5's `isOp` is no type guard: a value it checked is cast where a `Unit`
  is needed.
  The tier-6 kits (`chess_char_6_*`) declare their builder apart, so each takes `@type {KitFn}` beside `KitFns`; a
  `skills` literal whose hooks destructure a field `SkillCtx` only has through its index signature (`onTick({ dt })`)
  takes `@type {Record<string, KitSkill>}` as well (the plain pass refuses it as `skills` otherwise), a `talents`
  array built apart `@type {KitTalent[]}`; a talent spread in conditionally (`...(c ? [{ install(battle, unit) … }] :
  [])`) gets no contextual type, so its parameters take inline types. A helper whose `true` means "a unit of hers"
  (`mine(t)`) is a `@returns {t is Unit}` predicate, a `reduce(…, null)` takes its seed as `/** @type {Unit | null} */
  (null)`, and a kit's own record kept in `unit.mem` (an S3 drone, a lock) gets a `@typedef` in the file. `attack:
  { funnelMul: null }` turns the profile's drone ramp off (KitAttack allows `null`).
  The 自选 kits (`op-*`) write most of their logic in helpers apart from the builder (`function landing(battle, unit)`,
  `const bbOf = (chess, id) => …`): each takes `@param`s, merged into the JSDoc it already has (a one-line block gets
  the tags at its end); a destructured hook written apart (`({ battle, unit, target }) =>`) takes `@param {SkillCtx}
  ctx`, a helper returning one `@returns {SkillHook}`, one building a skill spec `@returns {KitSkill}`, and a token's
  kit built in the file (`markerKit`, `baseKit`) `@returns {KitSpec}`. `KitAttack` lists `pickEnemies` and
  `boomerangOnward` (its ctx `BoomerangCtx`, ai.js throwBoomerang); a projectile's `onHit` takes `ShotHit` (ai.js); a
  state kept across closures (`let st = null`, S3's per-activation state) takes `@type {… | null}` and a cast where a
  helper reads it only while it is set; `toggleBuff` (tier1) takes `null` mods (a flag-only buff). A destructured
  `onHit` takes the type inline on its pattern (`onHit: (/** @type {ShotHit} */ { target }) =>`); a skill's `activate`
  wrapped through `Object.defineProperty(sk, 'activate', { value(reason, opts) … })` gets no contextual type, so its
  parameters take inline types; `battle.on` returns `Hook | null`, cast to `Hook` where `battle.off` takes it back.
  A table kept per battle (`const STOLEN = new WeakMap()`) takes `@type {WeakMap<Battle, …>}` on the declaration, so
  its getter needs no cast; a profile callback `Profile` does not list (`onEachHit(b, u, victim, hc)` on a trait or a
  profile copy) gets no contextual type and takes inline types (`hc` a `Record<string, any>`, as ai.js builds it); a
  helper whose `true` proves the skill (`activeSkill(a)`) is a `@returns {a is Unit & { skill: SkillRuntime }}`
  predicate; `battle.unitAt` (`Unit | null`) checked by `up(a)` (no guard) is cast to `Unit` where it is read.
- the kit resolver and the generic kit (content/index.js, generic.js): `Kit` (index.js) is the kit contract read by
  key, `Def` a normalised def; the generic skill spec is built as a `Record<string, any>`. A blackboard getter returns
  `number | undefined`, so a `> 0` test on one is cast at the comparison. The guarded `import()` of the domain
  loaders returns `Promise<Record<string, any>>`.
- the summons, the stage devices, the 机变 cards and the coverage report (content/tokens.js, devices.js, choices.js,
  coverage.js): a token kit is a `TokenKit` (tokens.js: `Kit` with its skill hooks taking `SkillCtx` and its `trait` a
  `Profile`), so each kit function's `@returns {TokenKit}` types its `install`, its skill's `onStart` / `onTick` /
  `onHit` and its trait callbacks, and the kit table is `@type {Record<string, TokenKitFn>}`. The device state is
  `DeviceState` (devices.js), whose terrain parts buildTerrain fills after the literal: the literal is cast through
  `unknown` (TS2352 otherwise, a missing field). The card handlers are `@type {MetaHandlers}`, their battle plan
  `BattlePlan` (choices.js); a coverage row is `CoverageRow` (coverage.js). One declaration of two variables
  (`let status, missing = [];`) takes an inline type on each (`let /** @type {…} */ status, /** @type {string[]} */
  missing = [];`) rather than being split, which would change the syntax tree.
- the 3D board (`render/board3d/`): the injected three.js module is `Three` (`typeof import('…/vendor/three.module.js')`,
  board3d/materials.js), its objects `ThreeObj` (any member, as the stand-in's classes); a three.js name the board
  uses goes into `types/vendor/three.module.d.ts` (then `npm run vendor`, or tools/vendor.mjs `vendorTypes`, copies it
  beside the module). The board pack is `BoardPack` (load.js), an atlas region `Surface` / `UvTable` (atlas.js), the
  classified tile `BoardTile` and a drawn device `BoardDevice` (layout.js), a loaded official scene `SceneData`
  (official.js), mesh arrays `MeshData` (scene.js). A field a method sets first (`this.meshes = {}` in `_clear`) is
  `T | undefined` under strict even with its `@type`: cast at the use (`/** @type {Meshes} */ (this.meshes).bg = …`).
- the effect system's parts (`render/fx/`): each pooled record has a typedef where its part makes it (`Particle`,
  `PartOpts`, `Proj`, `Beam`, `Flame`, `Lock`, `Num`, `Label`, `Ring`, `Aura`, `Zone`, `TileFlash`, `Pop`) and
  `FxSystem`'s constructor types its pools with them; a record made with only its sprites is cast whole (`p = /** @type
  {Particle} */ ({ sp, add })`) and `list.shift()` passed on is cast to the record. A part's own `this.x = …` declares
  `x` on the part class, and the part's type then wins over the system's in the merged `FxSystem`
  (types/page-members.d.ts): cast the receiver where a part sets a pool (`/** @type {FxSystem} */ (this)._offNums =
  …`). The kit-event plans are `@type {Record<string, Record<string, KitPlanFn>>}` (kitofficial.js), which types every
  `cite(key, (o, c) => …)` callback through `cite`'s generic. A unit's view (render/units.js) is taken as `any` (a
  view or a plain point record reaches the same helpers).
- the files directly under `public/js/`: the app state is `AppState` (public/js/store.js), typed slot by slot rather
  than `typeof initialState` — under strict a slot that starts `null` or `[]` is `null` / `never[]`, so every read of
  `room` or `match.public` was an error; the server's records in it are `Bag` (`{ [key: string]: any }`). A store made
  from a literal with empty slots gets its typedef as a cast (`createStore(/** @type {ResState} */ ({ … }))`,
  resources.js). A frozen sound / voice table read by a string key is `@type {Readonly<Record<string, …>>}` (audio.js,
  audioOfficial.js, voicePolicy.js); the sound code's tracked unit and fx extra are `SoundUnit` / `FxExtra` (audio.js:
  read field by field) and the manifest helpers take `unknown` (assets.js `isObj` is a guard to `Record<string, any>`).
  `Number.isFinite(x)` does not narrow `x`: cast at the use (`/** @type {number} */ (o.timeout) > 0`). `useReducer((c)
  => c + 1, 0)` called as `force()` (TS2554): type the reducer `(c: number, a: void) => number`. A `const` read inside
  the async IIFE that makes it (`const p = x = (async () => { … x === p … })()`, TS2454): a declared type that admits
  `undefined` turns that check off. A `let` that only a closure fills with a DOM node (`s = ctx.createBufferSource()`
  where `ctx` is any) stays `| null` there: cast the assigned value.
- the screens directly under `public/js/screens/`: a component's props take `@param {{ … }} props`; a `useState(null)`
  or `useRef(null)` slot is `null` under strict, so the initial value is cast (`useState(/** @type {string | null} */
  (null))`, `useRef(/** @type {HTMLElement | null} */ (null))`). A handler written inline in an `html` template has no
  contextual type: an inline type on its parameter (`onChange=${(/** @type {{ currentTarget: HTMLSelectElement }} */ e)
  => …}`); a listener handed to `addEventListener` takes `Event` / `KeyboardEvent` (a narrower `target` refuses the
  overload: cast `e.target` at the use). A record the screen reads method by method takes a loose typedef with
  `[key: string]: any` (game.js `FieldView`, `GameDetail`, `KeyedBox`) rather than `any` on every callback: `view.on(name,
  (e) => …)` is typed by `on`'s own signature. A weak type (`{ from?: string }`, `{ closest?: … }`) refuses a value with
  no property in common (TS2559): list the property in the typedef, cast an `EventTarget` to `Element`. A frozen table
  imported from elsewhere and read by a string (`PROF_NAME`, `DIFFICULTY_NAMES`) is cast at the read,
  `/** @type {Record<string, string>} */ (PROF_NAME)[p]`. A `ui/` function whose parameter defaults to `null`
  refuses a string until its own `@param` says `string | null` (`changedCount`, `joinQueue`, `moduleBadge`,
  `actions.watch` have theirs since their files are listed, and the casts at their calls are gone).
  Many `test/ui/` tests pin a screen's wiring as source text (`onEnemy=${(k, n) => setDetail(…)}`): an `html`
  template's handler can take its type only inline, so those assertions match the source with the inline types taken
  out (`src.replace(INLINE_TYPES, '')`, card-close.test.js and others); elsewhere keep the pinned text as it is — the
  `@param` on the line above (`/** @param {Event & { target: any }} e */`), a `@type` on a destructuring `const`, a cast
  after a `.filter` rather than at each use.
- the files directly under `public/js/ui/`: the shared parts type their records where they are made — `GameLookups`
  (gameComponents.js: useGameData / makeLookups' return type, which also types the lookups' `(id) =>`), `GuardedView`
  (fieldHost.js guardView: what useFieldView hands the match screen), `LoadoutState` / `RosterFilters` (loadoutSync.js,
  a cast on loadoutStore's literal), `PrefTarget` (the store a synced setting lives in, read and written by field name —
  `ReturnType<typeof createStore>` is a store of `unknown`), `DiyPresetState` / `PresetNotice` (diyPresets.js), `Toast`,
  `TipState`, `QueuedDialog`. A file's own `isObj` is a guard (`@returns {v is Record<string, any>}`), so
  `Object.hasOwn(x, k)` after it takes the narrowed value. An arrow function in an object literal with an optional
  parameter (`actions.move(uid, to, dir)`, called with two) takes `@param {string} [dir]` on the property: an inline
  `@type` on the parameter makes it required. A timer handle a `useRef(null)` keeps for `clearTimeout` is `any` (`null`
  is no `number | undefined`, and `undefined` in its place would change the code). A store slot a test pins as text
  (`battleHud`'s `hud`: hud-redraw.test.js matches `Math.floor(s.hud.dp)`) stays `any`; a callback a test pins
  (season-fade.test.js `const choose = (id) => …`) takes the `@param` on the line above.
- the lobby, room and title files directly under `public/js/ui/`: a `useState(null)` / `useRef(null)` that holds a
  value later casts its initial value (`useState(/** @type {string | null} */ (null))`, `useRef(/** @type {HTMLElement
  | null} */ (null))`), and a store made from a literal with `null` fields casts the literal to its typedef
  (customRules.js `DialogState`, feedbackStore). An `html` handler takes its event inline (`(/** @type {Event & {
  target: HTMLInputElement }} */ e) =>`, a file's own `InputEv` when it repeats); a document listener takes `@param
  {PointerEvent} e` above its `const`, and `e.target` is cast to `Node | null` for `contains`. Components that take
  one context share its typedef (the settings tabs' `PaneProps`, the `PANES` table `Record<string, (p: PaneProps) =>
  any>`). A list of literal tuples looped over and indexed (customSummary.js `[['enemies', …], ['leaders', …]]`) is
  cast to its tuple type, and a section read by a string key goes through `Record<string, number>`. A feature test of a
  global the DOM types declare (`globalThis.requestAnimationFrame ? … : setTimeout`, TS2774) casts it to `typeof
  requestAnimationFrame | undefined`. The polyfills (compat.js) are `@this {any}` (`at` sits on the array, string and
  typed-array prototypes) or `@this {ArrayLike<unknown>}`; bytes piped through a `CompressionStream` are
  `Uint8Array<ArrayBuffer>` (one over any buffer is neither a `BlobPart` nor the stream's chunk). The `data-k` refs of
  the alliance scene are `Record<string, any>` (an element, or a list of them).
- the placement and direction parts directly under `public/js/ui/` (facing.js, facingWheel.js, placeArt.js,
  underframe.js, underframeArt.js, consoleLists.js, phaseArt.js, hudArt.js), written without `any`: the field view the
  wheel and the underframe read is `FieldViewLike` (facingWheel.js: its optional hooks `tileScreen` / `holdPiece` /
  `setPieceDir` / `highlightTiles` / `prepField`, the engine's dev hooks `debug`, `[key: string]: unknown` for the rest;
  a `GuardedView` passes), a tile's geometry `TileGeom` / `DirTile` and the selector's `DirBasis` (placeArt.js), the
  pieces and records the facing rules read `FacePiece` / `FaceEntry` / `UnitRecord` / `FaceLookups` (facing.js), the
  console lists' rows and entries `ConsoleChessRow` … `DebugEntry` (consoleLists.js). A hook read inside a closure after
  the check that found it (`raw.debug.tiles.heightAt`) loses the narrowing: make the member the code always calls
  required in the typedef (`cam.project`) or cast at the call; a member only tested for (`if (x.heightAt)`) stays
  optional, or the test reads as always true (TS2774). A `useTileScreen(view, row, col)` given no tile (null) casts
  `row` / `col` where it hands them to `tileScreen`, which answers null for anything but integers.


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
