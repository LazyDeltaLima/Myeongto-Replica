# CLAUDE.md

Guidance for Claude Code (and other coding agents) working in this repository.

## What this is

**Myeongto-Replica**: a Korean-localised hard fork of **Stronghold Protocol**, an unofficial browser remake of Arknights 卫戍协议 (1–4 player co-op: Node ≥ 22 server + browser client, no bundler). Development branch `nas-local`; the public repo `LazyDeltaLima/Myeongto-Replica` receives it as `main`.

Read first:
- `docs/rules/`: our rules and their evidence, one file per domain (`sim`, `diy`, `ui`, `render`, `fx`, `audio`, `upstream`; guide in `README.md`; `docs/LOCAL-PATCH.md` is only an index for old 「LOCAL-PATCH.md 「section」」 references). Read `diy.md` **"새 선발 오퍼레이터 키트 체크리스트"** before touching a 선발(自选) operator kit and `README.md` **"테스트"** for the test baseline (0 failures).
- `docs/ARCHITECTURE.md`: the code map (where each rule lives, "Where to start" table). `CONTRIBUTING.md` for fidelity rules.

## Repo rules

- **Hard fork since 2026-10-07**: upstream `sganggs/Stronghold-Protocol` (remote `upstream`) was merged for the last time at v0.2.0. Never merge upstream again; port individual fixes by `git cherry-pick -x` or by hand.
- Upstream tests are ours: fix or delete tests that disagree with our behaviour; no "intended failures" list.
- Commit subjects are `type(area): …` (older commits use `Local patch: …`): type `fix` (match official behaviour / user report) · `feat` (something the official game lacks) · `docs` · `test` · `refactor` · `chore`; area = a `docs/rules/` file (`sim` `diy` `ui` `render` `fx` `audio` `upstream`) or `i18n` / `tools`.
- Fidelity: official tables (`.cache/gamedata`) → EN client data (UnityPy via `.venv-extract`) → PRTS → namu wiki / community → maintainer memory. Mark unsourced rules `[ASSUMED]`; maintainer decisions get a date. Some decisions are explicitly provisional (e.g. wide skill-range auto-cast, `docs/rules/sim.md` "스킬 범위 발동"); never mark those done.
- `data/*.json` is generated: change `tools/build-data.mjs`, rebuild with `node tools/build-data.mjs --offline`, diff the JSON. Game art in `public/assets/` is never committed.
- The repo is public: no tracked file may name a home directory, a private folder or a machine account (`test/public-repo.test.js`).

## Commands

```bash
npm run dev                # server on :3000 (node --watch)
npm run assets             # (re)fill public/assets from the official sources (docs/ASSETS.md); assets/local extracts are local-only

node --test                                                  # whole suite (browser/asset cases auto-skip) — baseline is 0 failures
node --test test/local-patch-diy.test.js                     # one file
node --test --test-name-pattern="S3" test/local-patch-diy.test.js   # one case
node --test test/content/kits_layout.test.js                 # kit layout / import rules
npm run golden                                               # full golden corpus (npm test only checks a fast subset)
npm run golden:update                                        # ONLY for an intended gameplay change; commit digests with it
npm run lint && npm run check:imports && npm run typecheck
node tools/build-browser-resources.mjs                       # after changing assets/effects (service worker manifest)
node tools/i18n/build-ko-pack.mjs --offline                  # rebuild the Korean pack after adding UI strings
```

Browser suites are opt-in (`SP_E2E=1`, `SP_REAL_E2E=1`, `RENDER_E2E=1`, `SIM_E2E=1`, local Chrome via `CHROME_PATH`).

Env vars: `SP_MAX_BOTS` (AI seats per room), `SP_DEBUG_PAGE=1` (`/debug.html` fx/sound arena), `SP_DEBUG_FUNDS` (pin human funds), `SP_VERIFY`, `SP_COMBAT=server`. Deployed servers leave the debug ones unset.

## Architecture essentials

- **One Node process** (`server/index.js` → `server/http/`): plain `node:http` + `ws`, serves the static client, `data/*.json`, `shared/`, and `server/sim/` read-only at `/sim/`. Rooms (`server/lobby.js`) and matches (`server/match/`) live in memory.
- **Deterministic sim** (`server/sim/`): pure ESM, no Node APIs, no wall clock, no `Math.random` (seeded `rng.js`, 1/30 s ticks). Each browser simulates its own battle from a BattleSpec (`spec.js`); the server validates results and runs bot/dropped-player battles. `tools/check-imports.mjs` enforces the boundary (sim may not import match/net/public/Node builtins; `nodeData.js` is the one exception).
- **Split classes**: `Battle.js`/`battle/`, `Match.js`/`match/match/`, `PlayerState.js`/`match/player/` keep the constructor in one file and methods in a folder installed on the prototype (a method defined twice throws). `public/js/render/fx.js` and `ui/gameLogic.js` are barrels over folders.
- **Content** (`server/sim/content/`): operator kits `kits/ops/<chessId>-<codename>.js`, 선발 operators `op-<codename>.js` registered in `kits/index.js` `OPERATOR_KIT_FILES`; this server only offers the picks in `shared/local-diy.js` `LOCAL_DIY_PICKS`. Enemies by special type in `enemies/`, leaders in `bosses.js`; bonds/garrisons/items/bands each have a `battle.js` and a `meta.js` (prep side).
- **Local-patch hub**: `server/local-patch.js` and `shared/local.js` / `shared/local-diy.js` collect the fork's server-side changes; `// local patch` comments elsewhere point at the `docs/rules/` section that justifies them (do not add new markers; keep existing ones).
- **Protocol**: `shared/protocol.js` is normative (`C2S` validators, `S2C` list). New client message = validator there + handler in `server/match/match/intents.js` (or `server/lobby.js` for `room.*`).
- **i18n**: Chinese is the source language; UI strings are `t('…')` with English in `public/i18n/en.json`. Korean is a built pack: dictionaries in `public/i18n/ko/*.json` → `tools/i18n/build-ko-pack.mjs` → `public/i18n/ko.json`. Server messages travel as ids.
- **Client render**: `public/js/render/fx/` (effects, `kinds.js` maps fx kinds), `public/js/render/fxgame.js` + `fxplayer.js` (play extracted official effect prefabs), `public/js/render/board3d/` (official 3D stage scenes extracted from the client), HUD in `public/js/ui/`.

## Working rules that bit us before

- Unit tests passing via `battleHarness` is not enough: reproduce on the **real match path** (`test/match/harness.js` → `buildBattleSpec` → `createBattleFromSpec`) and in a browser for screen issues. State in a report whether something was verified by data or inferred.
- `node --watch` misses changes under WSL and does not watch `data/`: after editing server/data files compare the server's start time with the file mtime and restart (`touch server/index.js` or manual) before testing.
- Several agent sessions may work in this checkout at once: claim files with the other sessions first, `git add` only your own files, never rewrite a shared file whole (exact replacements only).
- Effects (`fxgame.js`): loads are async (guard units that already died, `gone`), looping prefabs must be bound to an owner or cut by `until`, world-space trails must not follow a moving root (`followWorld`).
- Before adding/editing a 선발 operator kit, walk the checklist in `docs/rules/diy.md` (targetable-only AoE via `canTargetEnemy`, `dealDamage` options, no invented stop conditions).
- Before any rule change, read the owning `docs/design/` section and the official source; after a rule change update `docs/design/`, `docs/history/`, SIM/META/DATA as relevant (`test/docs-consistency.test.js` pins doc sentences), and record the rule or deviation with its evidence in the matching `docs/rules/<domain>.md`.
