# Contributing

Myeongto-Replica is a Korean-localised hard fork of [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol),
an unofficial browser remake of Arknights 卫戍协议. Issues and pull requests are welcome: bugs, rules that differ from the
official game, operator kits, translations, documentation. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first (the code
map: which rule lives in which file), then this page. This page is also the guide for coding agents working in the
repository; there is no separate agent file.

Languages: code, comments and the repository documents are English; game terms are quoted in the official Chinese
(自选, 跟子, 联防) so they can be searched in the data; player-facing strings are Chinese through `t('…')` with the English in
`public/i18n/en.json` and the Korean built into `public/i18n/ko.json`; issues and pull requests may be written in Korean or
English; `docs/rules/` (this fork's rules and their evidence) is written in Korean and names operators, enemies, strategies,
items, skills and game terms by their official Korean names (`public/i18n/ko/data.json` maps the Chinese to them), with
the data id where a search needs it (maintainer decision 2026-10-29; `docs/rules/README.md` 「쓰는 법」).

## 1. Setup

Node.js 22 or 24 (CI runs both).

```bash
git clone https://github.com/LazyDeltaLima/Myeongto-Replica.git
cd Myeongto-Replica
npm install        # postinstall copies pixi / preact / three into public/vendor
npm run setup      # art and audio (optional: tests that need them skip when they are missing)
npm run dev        # the server with node --watch: http://localhost:3000
```

`npm run doctor` checks the Node version, the assets and the port. The official tables are downloaded by
`tools/build-data.mjs` into `.cache/gamedata/`; you only need them to change data. Environment variables the server reads:
`SP_MAX_BOTS` (AI seats per room), `SP_MAX_BOTS_TOTAL` / `SP_MAX_BOTS_PER_ADDR` (AI seats on the server / from
one network, counting rooms with a connected human), `SP_BOT_EMOTES=0` (silences the AI teammates' emote reactions, on by default),
`SP_DEBUG_PAGE=1` (`/debug.html`, the effect and sound arena), `SP_DEBUG_FUNDS`
(pins the human players' funds), `SP_VERIFY`, `SP_COMBAT=server`, `SP_SEASONS` (comma-separated season ids of `shared/seasons.js`
that are not public yet, offered to rooms: a season being built), `SP_SHUTDOWN_TIMEOUT_MS` (how long a SIGINT / SIGTERM
shutdown may take before the process exits 1, 1000–300000, default 5000). A deployed server leaves the debug ones unset.

## 2. Tests

Run the files your change touches, then everything before a pull request. The baseline is **0 failures**: a test that
disagrees with this fork's behaviour is fixed or deleted, never listed as an intended failure.

```bash
node --test test/local-patch-diy.test.js                            # one file
node --test --test-name-pattern="S3" test/local-patch-diy.test.js   # one case
node --test                                                         # everything (browser / asset cases skip by themselves)
node --test test/content/kits_layout.test.js                        # kit layout and import rules
npm run golden                                                      # the full golden corpus: fixed-seed battles and matches
GOLDEN_FULL=1 node --test test/golden.test.js                       # the same through node:test
npm run golden:update                                               # ONLY for an intended gameplay change
npm run lint && npm run check:imports && npm run typecheck          # lint, import boundaries, types
```

Browser suites are opt-in and need a local Chrome (`CHROME_PATH` when it is not on the default path):

```bash
SP_E2E=1 node --test test/ui/mock.e2e.test.js                    # UI end to end (no assets needed)
SP_REAL_E2E=1 node --test test/ui/real.e2e.test.js               # a real match (needs the downloaded assets)
RENDER_E2E=1 node --test 'test/render/*.browser.test.js'         # rendering
SIM_E2E=1 node --test 'test/sim/*.browser.test.js'               # the battle simulation in a browser
```

Under WSL, run them against the Windows Chrome (the GPU; a WSL Chromium renders WebGL in software and the GPU-only
render cases fail there) with WSL's mirrored networking, one file at a time:
`CHROME_PATH="$PWD/test/helpers/wsl-windows-chrome.sh" SP_E2E=1 node --test --test-concurrency=1 …`
(the script's header explains the profile folder and the cleanup).

**Golden results** ([test/golden/README.md](test/golden/README.md)): a refactor never changes `test/golden/*.json`. An
intended gameplay change runs `npm run golden:update` and commits the digests with the change, naming in the message
which scenarios moved and why.

**Rebuild steps** after certain changes:

```bash
node tools/build-data.mjs --offline             # after changing tools/build-data.mjs: data/*.json is generated, diff the JSON
node tools/i18n/build-ko-pack.mjs --offline     # after adding UI strings: public/i18n/ko/*.json → public/i18n/ko.json
node tools/build-browser-resources.mjs          # after changing assets or effects (the service worker manifest)
```

## 3. Fidelity

This is a remake of the official mode; the official game decides.

- **Sources, in order**: the official tables (`.cache/gamedata/excel/`: character_table, skill_table, uniequip_table /
  battle_equip_table, activity_table's act2autochess, enemy_database, the level files), the EN client data (extracted
  locally, `docs/ASSETS.md`), [PRTS](https://prts.wiki/) (operator pages, the 备注 notes of skills and talents, the 卫戍协议
  pages), then community wikis, then the maintainer's memory of the game. Numbers come from the blackboards, never from
  memory. Screenshots or recordings of the official game are valuable: attach them to the issue or pull request.
- **Client evidence** is cited by what the official client does — the table or prefab field, the class and method
  name — never by how it was read: no code addresses, no code excerpts, no wording about the tools
  that read it (maintainer decision 2026-10-22). `test/public-repo.test.js` refuses that wording and code addresses.
- **What no source settles** is implemented the simplest way closest to the official game and marked `[ASSUMED]` in the
  code and the pull request, with the reason no source settles it (`docs/rules/README.md`: server-side rule, engine
  internals, CN-only, needs an official recording, no source, or not yet checked against the client; maintainer
  decision 2026-10-26). Known official behaviour is implemented as it is, not left as an assumption. A decision the
  maintainer takes is cited as "maintainer decision YYYY-MM-DD". A decision the maintainer calls provisional stays marked so in `docs/rules/` and is never presented as settled.
- **Rules that differ from upstream or from the official game** are recorded with their evidence in
  [docs/rules/](docs/rules/README.md), one file per domain (`sim`, `diy`, `ui`, `render`, `fx`, `audio`, `upstream`).
  Before changing a rule read the owning section of `docs/design/` and the official source; after the change update
  `docs/design/`, `docs/history/`, docs/SIM.md / META.md / DATA.md as relevant (`test/docs-consistency.test.js` pins
  sentences of them) and the matching `docs/rules/<domain>.md`.
- **Copyright**: do not paste skill descriptions, story text or other copyrighted text at length into code, documents or
  pull requests (quote briefly and cite). Never commit game assets: `public/assets/` is git-ignored.
- **Data**: never hand-edit `data/*.json`. Change `tools/build-data.mjs`, rebuild with `node tools/build-data.mjs --offline`
  and compare the JSON to confirm only the intended part moved.

## 4. Fork rules

- **Hard fork since 2026-10-07**: upstream (`sganggs/Stronghold-Protocol`, remote `upstream`) was merged for the last time
  at v0.2.0. Upstream is never merged again; an individual upstream fix is ported with `git cherry-pick -x` or by hand
  and recorded in `docs/rules/upstream.md`. Upstream's tests are ours to change.
- **Commit subjects** are `type(area): …`. Type: `fix` (matches the official behaviour, or a maintainer report) · `feat`
  (something the official game lacks) · `docs` · `test` · `refactor` · `chore`. Area: a `docs/rules/` file (`sim` `diy`
  `ui` `render` `fx` `audio` `upstream`) or `i18n` / `tools`. Older commits read `Local patch: …`.
- **Plain messages**: a commit message says what changed and why, with the issue number when there is one. No attribution
  trailers (`Co-Authored-By:`, `Generated with …`, session links); merged pull requests are credited in the CHANGELOG.
- **Issue numbers**: `#N` is an issue or pull request of this repository; the upstream's read `upstream #N` /
  `upstream PR #N` (older commits wrote the upstream's as `GitHub #N`). A commit that fixes an issue says `Fixes #N` in
  its message, so the issue closes when the commit reaches `main`; an issue a release settles without such a commit is
  closed by the release's version commit (`Closes #N`). A release's CHANGELOG entry closes each item with the numbers it
  comes from, in parentheses and linked to the issue's full address (the lobby leaves them out), and ends with a 「기여」
  group: the merged pull requests with their authors, and the fixed reports with their reporters — a report the feedback
  relay filed is credited by its receipt number, not a name.
- **The repository is public**: no tracked file may name a home directory, a private folder or a machine account
  (`test/public-repo.test.js`). Notes that are not in the repository are referred to as the maintainer's notes. The same test refuses work-process wording — a decision is cited as "maintainer decision YYYY-MM-DD", never a "user" decision; no session names or internal decision numbers; client evidence without code addresses or wording about how the client was read (section 3) — and, through `SP_PUBLIC_SCAN_WORDS`, the maintainer's private names (`tools/public-scan.mjs`; the list stays outside the repository).
- **`// local patch` comments** mark the fork's older changes and point at the `docs/rules/` section that justifies them.
  Do not add new ones; keep the existing ones, and drop a marker when the line it marks is rewritten (keep the reasoning).
- **Server-side hubs** of the fork's changes: `server/local-patch.js`, `shared/local.js`, `shared/local-diy.js`.

## 5. Pull requests

- One change per pull request; one operator per kit pull request.
- Describe what changed and why, the sources (table fields, PRTS links), the `[ASSUMED]` items, which tests ran, and
  which golden scenarios moved. Screenshots for UI changes. Say whether a behaviour was verified against data or
  inferred.
- A rule change updates the documents it makes wrong (section 3).
- Player-facing text is Chinese wrapped in `t('…')`, with the English in `public/i18n/en.json` and the Korean in
  `public/i18n/ko/*.json` (then rebuild the pack, section 2); server messages travel as ids ([docs/I18N.md](docs/I18N.md)).
  A new language is one file in `public/i18n/` and no code: `node tools/i18n.mjs template <code>`, translate,
  `node tools/i18n.mjs check <code>` (docs/I18N.md "Adding a language"; packs in general: [docs/PACKS.md](docs/PACKS.md)).
- The code is GPL-3.0-or-later. The project stays non-commercial: no advertising, payment or donation features.

## 6. Pitfalls that cost us before

- A unit test through `battleHarness` is not enough: reproduce on the **real match path**
  (`test/match/harness.js` → `buildBattleSpec` → `createBattleFromSpec`) and, for screen issues, in a browser.
- `node --watch` does not watch `data/`: restart the server after rebuilding data files before testing.
- The sim (`server/sim/`) is deterministic and shared with the browser: pure ESM, no Node APIs, no wall clock, no
  `Math.random` (the seeded `rng.js`); `npm run check:imports` enforces the boundary. Split classes (`Battle.js` /
  `battle/`, `Match.js` / `match/match/`, `PlayerState.js` / `match/player/`) install their methods on the prototype,
  and a method defined twice throws.
- Never hand a live engine object (a `Match`, a room, the server, the game data `gd`, a socket) to `assert.equal` /
  `deepEqual` of `node:assert/strict`: when it fails, Node 22 inspects the object at depth 1000 and diffs it with a
  quadratic, off-heap Myers diff even when a message is given (one such failure took a test process to 30 GB). Compare
  identity with `assert.ok(a === b, '…')`. Timing tests that use real timers leave a margin of seconds, not hundreds
  of milliseconds: a full `node --test` run on a loaded machine lags the event loop that much.
- A new client message is a validator in `shared/protocol.js` (`C2S`) plus a handler in `server/match/match/intents.js`
  (or `server/lobby.js` for `room.*`).
- Effects (`public/js/render/fxgame.js`): prefab loads are async, so guard units that died meanwhile (`gone`); a looping
  prefab is bound to an owner or cut by `until`; a world-space trail must not follow a moving root (`followWorld`).
- Per-frame rendering (`render/units.js` updates, the HUD, the effect players) is written for the worst case — an
  8-player field, many units showing the same thing, a phone — from the first version (maintainer decision 2026-10-31):
  - nothing is rebuilt, allocated or rasterised in a frame whose inputs did not change: keep the last value and skip
    (`RadialFill`, `downLabel`);
  - what many units can show at once is drawn without per-unit stencil masks, filters, `Graphics` redraws or `Text`:
    sprites of shared textures, atlases (`hudRings`) or small meshes (under 100 vertices, batched with the sprites);
  - look for the existing primitive first (`hud-bars.js` `RadialFill`, `texOf`; `textures.js` `hudRings`, `ringArc`,
    `downLabel`) before writing another;
  - a change to the per-frame drawing path is measured with many copies on screen, before and after (draw calls per
    frame and ms, on a GPU), and a change meant to keep the picture is compared pixel by pixel with the previous
    version; the numbers go in the commit message (a redeploy countdown drawn with a stencil mask cost 36 draw calls
    for 12 operators, the batched mesh 1).
- Before adding or editing a 自选 operator kit, walk the checklist in `docs/rules/diy.md`
  (「새 선발 오퍼레이터 키트 체크리스트」): targetable-only AoE through `canTargetEnemy`, the `dealDamage` options, no invented
  stop conditions.

## 7. Adding an operator (自选)

This server offers the operators listed in `shared/local-diy.js` (`LOCAL_DIY_PICKS`); adding one is the maintainer's
decision. Every operator needs a kit file; the full guide is "How to add an operator (自选)" in
[server/sim/content/kits/README.md](server/sim/content/kits/README.md). In short:

1. Add the charId to `LOCAL_DIY_PICKS` and run `node tools/build-data.mjs --offline`: `data/backups.json` gains the
   operator's `units[charId]` (the numbers, skills, talents and modules of every form) and its `tokens` (summons). Check
   them against the official tables and PRTS.
2. Create `server/sim/content/kits/ops/op-<codename>.js` (codename = the charId without `char_<n>_`); the default export
   has one key, the charId.
3. Add the file name to `OPERATOR_KIT_FILES` in `server/sim/content/kits/index.js`.
4. Write tests the way `test/local-patch-diy.test.js` does (every form, every module, every skill, one case through the
   real match path), run `node --test test/content/kits_layout.test.js`, then `npm run golden:update` (only
   `test/golden/diy.json` should gain scenarios).
5. Tick the fidelity checklist of the kits README and the `docs/rules/diy.md` checklist in the pull request.
