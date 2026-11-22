# Typecheck

`npm run typecheck` runs `tsc --noEmit --checkJs` twice:

- `jsconfig.json`, the server: lib ES2022 and the Node types (`@types/node`), no DOM.
- `jsconfig.browser.json`, what the page loads: lib ES2022 + DOM, no Node types. It extends `jsconfig.json` and lists
  its own `include`; `public/js/` goes here, and `shared/` and the sim files are in both, because both sides run them.

The first slice, in both configs, is the closed set that already typechecks:

- `shared/` except `shared/protocol.js` and `shared/bandBonds.js` (their JSDoc does not match the code yet; see below)
- `server/sim/rng.js`, `server/sim/dir.js`, `server/sim/constants.js` (the last imports `GEO` from shared)
- `types/` — JSDoc for `Unit`, `DamageInfo`, the snapshot tuples, and the protocol message envelope (`types/**/*.js`;
  `types/class-members.d.ts` joins with the first folder that holds a split class, below)

`strict` is off. `tsc` does not read `jsconfig.json` on its own; the script passes `-p`.

## Widen it

Add one file or one folder to `jsconfig.json` `include`, then run `npm run typecheck`. Fix JSDoc that disagrees with the code in that folder. Leave `strict` off until the folder reports nothing. Do not add `@ts-nocheck`.

Suggested order once the sim split settles: `server/sim/grid.js`, `server/sim/body.js`, `server/sim/buffs.js`, then `server/sim/damage.js` against the typedefs in `types/core.js`. The sim does not import `types/`. The typedefs are a reference, not a runtime dependency.

`types/core.js` follows docs/DESIGN.md §5.2, §5.4, §8 and docs/SIM.md §4, §9. Where those two disagree on `DamageInfo.type`, the typedef uses the union `makeDamageInfo` actually builds (`'elemental'` as well as `'element'`).

## Split classes

`Match` (`server/match/Match.js`), `PlayerState` (`server/match/PlayerState.js`) and `Battle` (`server/sim/Battle.js`)
get their methods at load time from part classes (`server/match/match/`, `server/match/player/`, `server/sim/battle/`),
copied onto the prototype. tsc does not see the copy, so:

- `types/class-members.d.ts` merges the parts into the class type (`interface Match extends MatchPlatform, …`). Its
  lists follow the class file's install loop: a new part goes into both.
- every part method carries `@this {Match}` (or `{PlayerState}`, `{Battle}`), with the type from
  `/** @import { Match } from '../Match.js' */` at the top of the part file. A part cannot extend the class in the
  `.d.ts` instead: the class already extends the parts, and two interfaces may not be each other's base. A new part
  method gets the tag too.
- a getter cannot take `@this`: the few part getters (`soloUntimed`, `isHumanActive` …) still see only their own part.
- the same file declares what a class sets outside plain `this.x =` assignments (`SkillRuntime`'s `battle` and `unit`,
  set with `Object.defineProperty`).

`types/class-members.d.ts` imports every part, so a config that includes it checks all of `server/match/` and
`server/sim/`: add it to `include` together with the first of those folders, not before.

## Measuring

To count the errors of folders not yet included, run tsc with a scratch config outside the repository's lists, for
instance `{ "extends": "<repo>/jsconfig.json", "include": ["<repo>/server/**/*.js", "<repo>/shared/**/*.js",
"<repo>/types/**/*"] }` (and the browser one over `public/js/`), then `tsc -p <that file> | grep -c 'error TS'`.

## Not in the first slice

`shared/protocol.js` — the catalogue JSDoc is ahead of a few object literals (`$optional` sits on a `Record` of checkers; `unitStatsEntry` does not list `side` or `silenced`, and the code reads `side`). Fix the comments, then remove it from `exclude`.

`shared/bandBonds.js` — the data-shape JSDoc rejects an empty fallback object and a tuple callback. Same treatment.
