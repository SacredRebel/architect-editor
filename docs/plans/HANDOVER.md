# HANDOVER — architect-editor (lane A · Studio)

**Written:** 29 Sep 2026, from `git log`, the done-files and `STATUS.md` on `main` at `ddc7e541`.
**State:** paused. All lanes are paused except E (architect, 29 Sep).

## 1. What this repository is

The design editor that opens inside the world ("Edit building"). It is a fork of Pascal Editor (`pascalorg/editor`), and this lane's code lives in `packages/plugin-eco` (the `eco/1` bridge, the site, eco forms, the GLB and walk export). Upstream's `AGENTS.md` (symlinked as `CLAUDE.md`) governs the Pascal packages.

- **Production:** https://architect-editor-snowy.vercel.app.
  - Vercel project `architect-editor` (`prj_RiAhhwPxRdwFzypr7ILS0brPomSl`), team `pauls-projects-af8162cc` (`team_sQD34bmYcUr3F9TeGGtIMStm`).
  - `vercel.json` rewrites `/builder/*` to `/*` on this project.
- **The world** opens the editor under `/builder` on its own origin, https://spatial-map.vercel.app. `UNIFY-A.md` (b) calls it "what 'Edit building' opens" (A4, `79dc5f13`), and A4's check treats `/builder/embed/` as the page the world embeds. The world's own routing of `/builder` is lane E's work, not this repository's (`A4-done.md`, open item 4).

## 2. Current state (29 Sep 2026)

**Production:** `main` at `ddc7e541` is live as `dpl_4E7QvZBXydSmv8SvVa7pVdCagbbT`, READY (Vercel, read 29 Sep).

| What is live | Merge | Production | How it was verified |
|---|---|---|---|
| eco/1 answers an allowlist: the world, its `spatial-*` previews, localhost, 127.0.0.1. It replies to the hello's origin only | `d8ecb779` (#7), `ddc7e541` (#8) | `dpl_9QZPXMYxq3XCkYGaZShMtuScrSPR`, `dpl_4E7QvZBXydSmv8SvVa7pVdCagbbT` | `check-bridge-origins` + `--self-test`, inside plugin-eco's `test` script (CI) (`bridge-origins-done.md`) |
| The host's ground under "Edit building": a site root when there is none, the ground kept through scene loads, and the house reference (`refGlb`) drawn | `5bac96f8` (#9) | `dpl_B5ZNCruy8N86UaHfpt8AG5GPhhjr` | `apply-site.test.ts` (CI) and `check-site-root` + `--self-test` on the static build. Production acceptance screenshot not taken (`site-root-done.md`) |
| `/builder` base path, and the site in the editor (terrain, trees, sun, contours) | `79dc5f13` (#5) | `dpl_Gd2hzP9a9Lmrv2y6jr4AmozMZoE9` | `check-a4-builder`, `check-a5-site` (+ `--self-test`) (`A4-A5-landing-done.md`) |
| Demo: light graphics by default; the demo site and house open when the world sends nothing; tools that don't work in light mode are hidden | `0d38a884` (#3) | `dpl_BUYwmDfTxVJCL2KD2Xf7cQChN5GC` | the demo tour against production (`demo-done.md`, record `c1316e1d`) |
| CI quality job green on Linux | `bd81105b` (#4) | `dpl_Hqoy9Nx2WU5twRPjZdERqgbGYud7` | `ci-done.md`. On PR #9 (`0aaa5d81`), quality and cli-smoke both passed |
| Perf: AdaptiveDpr on GPU time, dpr never above the display, shadows redrawn on change, site guides as WebGPU lines | `c00d885f`, `79dc5f13` | `dpl_GZ9asee41gW5m25zNL4yNFQY33JE` | `check-h19-2`, `check-h19-2-guides` (`H19-done.md`) |
| Tools from H10–H16: organic forms, temple forms, geometry kit, body kernel, WebXR (behind a switch), IFC 4.3 export and the Ventura envelope | see §3 | see §3 | each phase's done-file |

## 3. Session log (this lane)

Each row lists: date, what it did, PR, the sha on `main`, and whether production was READY, with its evidence.

Before `5e9249aa`, `main`'s Vercel build was being repaired: the 20–21 Sep `fix(build)` commits, and the H14 merge message says "main builds again". There is no production record for those phases.

| Date | Phase — what it did | PR | On `main` | Production READY |
|---|---|---|---|---|
| 18 Sep | E0 — scaffold `@eco/plugin-eco` behind `NEXT_PUBLIC_ECO` | — | `5ac41df9` | not recorded |
| 18 Sep | E1 — static export, `/embed`, localStorage scene fallback | — | `6ebe213d` | not recorded |
| 18 Sep | E2 — eco/1 postMessage bridge and z-sign conversion | — | `94ee5a31` | not recorded |
| 18 Sep | E3 — EcoSite terrain, guides, ghost, compass | — | `cd20031b` | not recorded |
| 18 Sep | E4 — user GLB assets: place, and scene round-trip | — | `759c7fc6` | not recorded |
| 19 Sep | E5 — Walk mode (ecctrl + rapier) | — | `6cd26254` | not recorded |
| 19 Sep | E6 — GLB + walk export to the world | — | `fab852df` | not recorded |
| 19 Sep | F0 — the loop proven: host harness and round-trip checks | — | `66a8ed92` | not recorded |
| 19 Sep | F4, F1, F2, F5, F3, F6 — snap to ghost; curved walls; shell roofs; GLB by material palette; scene JSON round-trip; orthographic PNGs | — | `a8637282`, `dc861d51`, `913ae4aa`, `f6f00260`, `f6031143`, `1322df68` | not recorded |
| 19–20 Sep | H0 — live loop: embed unblocked, probe, two-room fixture | — | `c63bcae0`, `7ab58ac0`, `5103a538`, `f450ca66` | not recorded |
| 19 Sep | H1 — hard GLB audit, meshopt optimise | — | `f1864047`, `6ddfd87f` | not recorded |
| 19 Sep | H2 — ez-tree oak and chamise placeables | — | `adf4daaf` | not recorded |
| 19–21 Sep | H10 — loft, vaults, shell rise, curved walk rings; leaf shell panel | — | `6b497640`, `1f1c68f0` | not recorded |
| 19–20 Sep | H12 — materials, glass, site sun, presentation; sun wired to the world's lighting contract | — | `11db3188`, `300dcf3b`, `812dc7c2` | not recorded |
| 20 Sep | H3 — Ventura construction takeoff with the Bones engines | — | `209c7775`, `56572231`, `76022475`, `d16a84c2` | not recorded |
| 20 Sep | H11 — image-to-3D shortlist, adapter scaffold | — | `762effaf` | not recorded |
| 20–21 Sep | build fixes: Bun 1.3.14, draco off the client graph, TS errors, Vercel `cursor/*` off | — | `817a7eb6`, `483d8cb8`, `519a4a54`, `58cc8de6`, `7af97e5d`, `21974aa9` | not recorded |
| 21 Sep | H14 — photo and sketch to 3D through the atlas; main builds again (H13 skipped, `H14-done.md`) | — | `5e9249aa` | yes (STATUS at `b611ed8a`) |
| 22 Sep | H16.0 — temple forms | — | `b611ed8a` | yes (`49bc60a8`) |
| 22 Sep | H16.1 — universal geometry kit, floor-plan overlay, scale handle | — | `b98a2927`, `46ca57b9` | yes (`5977fef4`) |
| 22 Sep | H15 — organic authoring, minimal surface, true size | — | `97e5ff19` | yes (`82df4afe`, health `625e1ac0`) |
| 22 Sep | H16.2 — catenary arches, vaults, Poleni thrust line | — | `aa5a96d2` | yes (`7c21db9e`) |
| 22 Sep | H16.3 — half-edge body kernel as `plugin-body` | — | `17a45121` | yes (`284cfd10`) |
| 22 Sep | H16.4 — WebXR 1:1 walk behind a feature switch | — | `31ff0a89` | yes (`931ea8a1`) |
| 22 Sep | H16.5 — IFC 4.3 export, Ventura buildable envelope | — | `da991314` | yes (`e529ab70`) |
| 23 Sep | H17.0 — perf baseline | — | `972886b6` | yes (`17702d28`) |
| 23 Sep | H17.1 — AdaptiveDpr, detect-gpu tiers, shadow discipline | — | `cf50c731` | yes (`f0f3fe5f`) |
| 23 Sep | H18 — walk speeds, fly, teleport, CC0 character | — | `795317fb` | yes, `dpl_CFX5fhGiVAujzzwMUNiVUN8Nikj5` (record `3af08aba`) |
| 26 Sep | lane rule (`.cursor/rules/lane.mdc`) | — | `5d061383` | yes, `dpl_8AiyqUL3y7ioBQE9RxREF7w74eaw` |
| 26 Sep | H19.0a — hygiene: format, types, CI gate, LF | #1 (`eco/h19`) | `121d1ebc` | yes, `dpl_CgqavrZJjN9fzzsMh4AafQmhb449` (record `341c4019`) |
| 27 Sep | H17.0 remeasure tip (preview only) | #2, closed, not merged | `eco/h17-0-remeasure` `1b8cc3ea` | — |
| 28 Sep | H19.0 · H19.1 · H19.2a — re-measure, profile, dpr never above the display | `eco/h19` (#1) | `c00d885f` | yes, `dpl_GZ9asee41gW5m25zNL4yNFQY33JE` |
| 28 Sep | demo — light graphics, demo site, hidden tools | #3 | `0d38a884` | yes, `dpl_BUYwmDfTxVJCL2KD2Xf7cQChN5GC` |
| 28 Sep | ci — `plugin-geometry`'s test runs its check | #4 | `bd81105b` | yes, `dpl_Hqoy9Nx2WU5twRPjZdERqgbGYud7` |
| 28 Sep | A4 · A5 · H19.2 — `/builder`, the site in the editor, H19.2b–d | #5 | `79dc5f13` | yes, `dpl_Gd2hzP9a9Lmrv2y6jr4AmozMZoE9` |
| 29 Sep | UNIFY-0 — FreeCAD scan, the IFC round-trip, P1–P4 (docs) | #6 | `81c1dd3f` | yes, `dpl_GpsDF2PHSUNz3XHamrDX7RTfnEPJ` |
| 29 Sep | bridge origins — eco/1 allowlist | #7 | `d8ecb779` | yes, `dpl_9QZPXMYxq3XCkYGaZShMtuScrSPR` |
| 29 Sep | site root — the host's ground and the house reference | #9 | `5bac96f8` | yes, `dpl_B5ZNCruy8N86UaHfpt8AG5GPhhjr` |
| 29 Sep | origins widened — previews `spatial-*-pauls-projects-af8162cc` | #8 | `ddc7e541` | yes, `dpl_4E7QvZBXydSmv8SvVa7pVdCagbbT` |

H4–H9 from `ECO-DEVPLAN-04.md` were never started; there are no done-files for them.

## 4. Unfinished work — branches not merged into `main`

All of these are on the remote. The one stash, `stash@{0}`, is kept; its files are on `wip/h14-deploy-harness`.

| Branch | Head | What is on it | What is left |
|---|---|---|---|
| `eco/unify-p1` | `788effeb` | IFC P1, work in progress (`aa11d15b` + `788effeb`). A FreeCAD-ready IFC exporter in plugin-eco:<br>• stable UUIDv5 GlobalIds, with the node id as Tag;<br>• north-up axes;<br>• georeference from the site;<br>• stacked storeys;<br>• openings at their centres and sills;<br>• IfcWall with an Axis;<br>• roofs, stairs and items per `UNIFY-A.md`'s table;<br>• eco, temple and body forms as proxies with `Pset_Playground`;<br>• an export summary in the eco panel.<br>Also the converter's opt-in `northUp` reading, and 12 unit tests | **On hold.** Left to do: the export-twice/read-back browser check with `--self-test`, and the FreeCAD 1.1.4 screenshot. The branch predates `5bac96f8` and `ddc7e541`, so merge `main` into it before resuming |
| `wip/h14-deploy-harness` | `1daaefbd` | 6 scripts from `stash@{0}` (21 Sep) that probe the production `/embed` from a local host page over CDP | nothing; reference only |
| `wip/h0-probe-scratch` | `972c506f` | the 15 H0 probe files that `H19-done.md` lists as "not deleted, not committed" | nothing; reference only |
| `eco/a4` | `1d2ac08c` | A4 before the rebase (25 commits). It landed rebased in `79dc5f13`; `A4-A5-landing-done.md` maps the SHAs | nothing |
| `eco/a5-prebase` | `85f44621` | A5 before the rebase (32 commits); landed in `79dc5f13` | nothing |
| `eco/h19-2` | `4b2ae1ba` | H19.2 before the rebase (14 commits); landed in `79dc5f13` | nothing |
| `eco/h17-0-probe` | `a0ca4ca4` | H17.0 probe: `three()` on the `?perf` probe only (2 commits). Measuring is over | nothing |
| `eco/h17-0-remeasure` | `1b8cc3ea` | the H17.0 remeasure tip behind PR #2 (closed) | nothing |

`eco/bridge-origins` (`2ed8424c`) is still on the remote, but it is merged (`d8ecb779`).

## 5. Known bugs and open questions

| Item | Evidence |
|---|---|
| **The GLB and the walk flip z on export; the site context does not.** Unless the world flips eco designs back on import, a design drawn at the site's north boundary lands at its south boundary. Unverified against the world's import | `A5-done.md`, open item 3 (`export-glb.ts` sets `scale.z = -1`; `buildEcoWalk` negates z) |
| Full graphics with a site loaded shows only the sky. Light graphics, the default, draws the scene | `demo-done.md`, "Found and not fixed" |
| Cold first visit: the house appears only after the item models download (11–51 s) | `demo-done.md` |
| A host `eco:load-scene` sent before the editor's first load would be replaced by that load. Not observed | `site-root-done.md`, "Not in this change" |
| Site-root production acceptance (world → Oak Leaf → "Edit building ▸" → screenshot) is not done: it needs the world's build PIN | `site-root-done.md` |
| IFC export on `main` is upstream's and not FreeCAD-ready: random GlobalIds, storeys at 0, misplaced openings, mirrored plan. It is also hidden in light graphics | `UNIFY-A.md` (a); hide `648755a5`; fix on `eco/unify-p1` |
| 235 library finishes exist only on Pascal's CDN (`eco-build.json` `onCdn`). Needs a choice of (a) download, (b) encode, or (c) accept | `A4-done.md`, open item 1 |
| The item catalog names some models by absolute Supabase URL | `A4-done.md`, open item 2 |
| The world has to send `trees` and `sunAt`. The slider's time zone is `America/Los_Angeles` whatever `originLL` is | `A5-done.md`, open item 1 |
| Walls drawn uphill sink into rising ground: up to 4.45 m on a 37% slope | `A5-done.md`, open item 2 |
| Upstream's fill underside is a chord, 7.7 cm off concave ground | `A5-done.md`, open item 4 |
| The 50 fps frame cap (`FrameLimiter`, `maxFps = 50`) hides fps gains | `H19-done.md`, "The cap (line 1)" |
| Five upstream tools still use drei `<Line>`, which is WebGL-only, while active | `H19-done.md` (H19.2 guides) |
| The Organic panel (H15) draws nothing, and Minimal surface depends on it. Both are hidden in light mode. The body kind has no UI tool | `demo-done.md` |
| On this PC only: 38 local test failures (checkout path with spaces and `&`, CRLF fixtures), and port 4173 is taken by another program | `demo-done.md`, `ci-done.md`, `site-root-done.md` |
| The lane file's "standing next brief" (H19 → H20, H21) is stale. The pause supersedes it | `.cursor/rules/lane.mdc` (`5d061383`) against `STATUS.md` |

## 6. Run, build, test and deploy on Johny's Windows PC

**Checkout:** `C:\Playground\Architect-editor`. `C:\Playground` is a junction. Use it rather than the long `C:\AI-Work\Ai apps & Codebase\…` path, whose spaces and `&` break tools.

**Bun:**
- The repo pins `bun@1.3.14` (`package.json` `packageManager`).
- The installed Bun, 1.4.2, is in `%USERPROFILE%\.bun\bin` and is not on PATH in a fresh shell.
- For lockfile-exact work, use `bunx bun@1.3.14 …`.

| Task | Command |
|---|---|
| Install, as Vercel does | `bunx bun@1.3.14 install --frozen-lockfile` |
| Dev server | `bun run dev` (root, turbo). The editor runs at http://localhost:3002: `PORT` comes from `.env.defaults`; a shell `PORT` or `.env.local` wins |
| Lint and types | `bun run checks` (biome check + turbo check-types) |
| Tests | `bun run test`, or `cd packages/plugin-eco && bun run test` (unit tests, then `check-bridge-origins` and its `--self-test`) |
| Production build, exactly as Vercel runs it | `bunx bun@1.3.14 run build --filter=editor` |
| Static `/builder` export | `cd apps/editor && bun run build:static`. Output: `apps/editor/out/builder/…` and `eco-build.json` |
| Browser checks (after `build:static`; they need Chrome) | `bun packages/plugin-eco/test/check-a4-builder.mjs [--self-test]`, `PORT=4192 bun packages/plugin-eco/test/check-a5-site.mjs [--self-test]`, `bun packages/plugin-eco/test/check-site-root.mjs [--self-test]` |
| CI | `.github/workflows/ci.yml`, on pull requests and pushes to `main`. `quality` runs install, checks, `skills:validate`, test and build; `cli-smoke` runs separately |
| Deploy | Push a branch to get a Vercel preview (`cursor/*` is off). Merge to `main` to deploy production. Never `vercel --prod`; never force-push `main` |

**Ports:**
- 3002: the editor in dev.
- 3003: the `apps/ifc-converter` dev server.
- 4173: the default for the browser checks. It is taken on this PC, so use `PORT=4192`.
- Chrome's debugging port: the checks pick a free one.

**Env var names** (names only; local values live in the gitignored `.env.local`):
- Eco: `NEXT_PUBLIC_ECO` (defaults to `'1'` in `next.config.ts`), `NEXT_PUBLIC_ECO_STATIC`, `ECO_STATIC`, `ECO_BASE_PATH`, `NEXT_PUBLIC_ECO_BASE_PATH`, `NEXT_PUBLIC_ECO_MOCK_ATLAS`, `NEXT_PUBLIC_WEBXR`.
- App: `PORT`, `MINT_PASCAL_HOST_ORIGIN`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ASSETS_CDN_URL`.
- Pascal: `PASCAL_DB_PATH`, `PASCAL_DEV_DIAGNOSTICS`, `PASCAL_INSTANCE_ID`, `PASCAL_PORTABLE_BUILD`, `PASCAL_RUNTIME_VERSION`, `PASCAL_SCENE_API_ORIGINS`, `PASCAL_SCENE_API_RATE_LIMIT`, `PASCAL_SCENE_API_TOKEN`.
- Set by Vercel: `NEXT_PUBLIC_VERCEL_*`.
- Upstream's, listed in `turbo.json`: `SKIP_ENV_VALIDATION`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `POSTGRES_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## 7. Contracts with other lanes

| Contract | Defined in |
|---|---|
| **eco/1 postMessage bridge.** Messages: `hello · ready · load-site · load-scene · request-export · scene · glb · dirty · error · close`. Capabilities: `site, scene, assets, glb`. One host per page; replies go to the hello's origin only. Breaking a message shape bumps the version | `packages/plugin-eco/src/bridge-types.ts` (copied verbatim by the world), `bridge.ts` |
| **Who the bridge hears:** `https://spatial-map.vercel.app`, `https://spatial-*-pauls-projects-af8162cc.vercel.app`, `http://localhost[:port]`, `http://127.0.0.1[:port]`. Never `*` | `packages/plugin-eco/src/eco-origins.ts` |
| **EcoSite** (from the world, on `load-site`): `originLL` [lng, lat]; `originElevM`; a terrain heightfield, north row first; guides in [x east, z north]; `refGlb`; `northDeg` (site north stands `northDeg` clockwise from true north); `trees`; `sunAt` | `bridge-types.ts`; north convention in `eco-site-sun.ts` |
| **Design export to the world:** GLB in metres, Y-up, with `extras.walk`. EcoWalk is metres, model-local, x east, y up, z south. Size and texture budget | `bridge-types.ts` (`EcoWalk`), `export-glb.ts`, `export-walk.ts`, `glb-audit.ts` |
| **The `/builder` build for the world (E):** basePath `/builder`, output `out/builder/`, and `eco-build.json` `{basePath, cdn, onCdn}` | `apps/editor/scripts/eco-static-build.mjs`; `apps/editor/vercel.json` (rewrites) |
| **The Atlas (F), image to 3D:** `ECO_ATLAS_BASE` = `https://eco-village-map.vercel.app`, with an export budget | `packages/plugin-eco/src/eco-atlas-image3d.ts`, `eco-image3d-budget.ts` |
| **Lighting:** the world's sun (NOAA) at `sunAt` for `originLL` | `eco-site-sun.ts`, `eco-site-lighting.tsx` (H12 `300dcf3b`) |
| **Proposed, not agreed or built:** pack paths `structures/<id>/model.ifc|glb|scene.json`, and an eco/1 revision (`structureId`, `ifc`, `eco:ifc`) — P2, to be agreed with E | `docs/plans/UNIFY-A.md` (c) |

## 8. Architect decisions that apply here

| Date | Decision | Source |
|---|---|---|
| 18 Sep | The unified builder inside the world: the plugin behind `NEXT_PUBLIC_ECO`, a static export plus `/embed`, and the eco/1 bridge (E0–E6) | `ECO-DEVPLAN-01.md` (`5ac41df9`) |
| 19 Sep | The studio becomes the place the house is designed (F0–F6) | `ECO-DEVPLAN-02.md` (`66a8ed92`) |
| 19–20 Sep | Track A order H0 → H1 → H2 → H10 → H12 → H3 → H9 → H4 → H7 → H5 → H6 → H8, with H11 (image to 3D) as a side track | `ECO-DEVPLAN-04.md` (`762effaf`) |
| 22 Sep | H17 (perf), then H18 (walk feel), only after H16.5 is production READY | `H17-H18-queued.md` (`89e9f172`) |
| 26 Sep | The standing lane rules: commit as Sacred Rebel with no trailer; checks with `--self-test`; licences MIT/BSD/Apache only; one repository | `.cursor/rules/lane.mdc` (`5d061383`) |
| 27 Sep | H19.0: capture the "before" on the same path, and make the perf check a real check | `inbox/2026-09-27-reply-21-H19.0-recapture-the-before.md` (`b88c1166`) |
| 28 Sep | Light graphics by default; hide the tools that don't work in light mode (nothing deleted) | `demo-done.md` (`0d38a884`, `648755a5`) |
| 28 Sep | Cleanup: merge #4, close #2, delete remote branches already in `main` | STATUS at `25823ea2` and `81c1dd3f` |
| 29 Sep | After UNIFY-0: the bridge allowlist first, then P1 (a FreeCAD-ready IFC). The eco/1 revision waits for P2, agreed with E. web-ifc (MPL-2.0) stays an unmodified npm dependency | STATUS's phase line at `d8ecb779`; `UNIFY-A.md` (d) and (e) (`81c1dd3f`) |
| 29 Sep | eco/1 answers an allowlist, never `*`, and replies to the hello's origin | `bridge-origins-done.md` (`2ed8424c`) |
| 29 Sep | Previews widened to `spatial-*-pauls-projects-af8162cc.vercel.app`, the team suffix exact | `bridge-origins-done.md` (`9cbe9afe`, merged `ddc7e541`) |
| 29 Sep | The IFC georeference comes from the pack: `originLL` = the chimney (−119.15536, 34.4331), `originElevM` = 425.90 m | encoded in `eco/unify-p1`'s tests (`788effeb`) |
| 29 Sep | Site-root fix first. Then the lane pauses and IFC P1 goes on hold; `eco/unify-p1` is pushed as-is, with no PR | `site-root-done.md`, STATUS (`0aaa5d81`); `788effeb` on the remote |
| 29 Sep | **Current direction:**<br>• The map moves to Godot 4.7.2 as a desktop app (lane E).<br>• Houses are designed in Blender 5.2.2 and FreeCAD 1.1.4 directly.<br>• Godot, Blender and FreeCAD MCP connectors are installed at user scope for every window.<br>• The browser world stays as the web viewer; the land pack (C) stays the data source; the Atlas (F) stays the web front door.<br>• **All lanes are paused except E** | the architect's handover brief, 29 Sep |

## 9. Next steps for this repository, in priority order

Only when the architect lifts the pause.

1. **Site-root production acceptance.**
   - The path: world → B → Oak Leaf → "Edit building ▸". It needs someone with the world's build PIN.
   - Done means: a screenshot showing the terrain and the Oak Leaf on its site, added to `site-root-done.md`.
2. **Settle the export z-flip with the world** (`A5-done.md`, item 3).
   - Done means: a round-trip check shows that a design drawn at the site's north boundary appears at the north boundary in the world, from the exported GLB and walk.
3. **A host scene sent before the editor's first load.**
   - Done means: a browser check posts `eco:load-scene` before the editor mounts and still finds that scene after the editor's own load, with a `--self-test`.
4. **Full graphics with a site shows only the sky.**
   - Done means: full graphics draws the scene with a site loaded, shown by a check that compares full and light on the same scene.
5. **The 235 CDN-only finishes.**
   - Done means: the architect picks (a), (b) or (c); `eco-build.json`'s `onCdn` is then empty, and `check-a4-builder` allows nothing outside `/builder`.
6. **IFC P1, only if the hold is lifted.**
   - Done means:
     - `eco/unify-p1` has `main` merged in;
     - its export-twice/read-back check and `--self-test` pass;
     - FreeCAD 1.1.4 opens the export north-up, with windows at their sills, storeys stacked, and the same GlobalIds on a second export (screenshot).

## 10. How to resume

1. **Read, and wait for a brief.** Read this file, then `docs/plans/STATUS.md`, then the newest brief in `docs/plans/inbox/`. The standing rules are in `.cursor/rules/lane.mdc`. The lane is paused: start nothing without a new brief.
2. **Check the checkout is healthy.** Work in `C:\Playground\Architect-editor` with Bun on PATH, then run:
   - `bunx bun@1.3.14 install --frozen-lockfile`
   - `bun run checks`
   - `cd packages/plugin-eco && bun run test`

   On this PC, expect only the known local test failures (`demo-done.md`).
3. **Confirm production matches `main` before any change.** Vercel should show production READY at `main`'s head: `ddc7e541` is `dpl_4E7QvZBXydSmv8SvVa7pVdCagbbT` as of 29 Sep. Then open https://architect-editor-snowy.vercel.app once.

## Local-only (not in git)

| What | Where | Why it is not in git |
|---|---|---|
| Secrets for local runs | `.env.local` (repository root) | gitignored; never committed, never printed |
| Claude Code's lane file for this machine | `CLAUDE.local.md` (repository root) | excluded via `.git/info/exclude`. It imports `.cursor/rules/lane.mdc` and adds machine notes |
| `stash@{0}` | the local repository | kept as it was; its six files are on `wip/h14-deploy-harness` (`1daaefbd`) |
| Build output and copied assets | `node_modules`, `.turbo`, `apps/editor/.next`, `apps/editor/out`, `apps/editor/public/decoders/`, `apps/*/public/web-ifc*.wasm` | regenerated by install and build (`postinstall` copies the decoders and wasm) |

No file over ~50 MB needed saving. The FreeCAD 1.1.4 install that UNIFY-0 scanned read-only lives outside the repository, at `C:\AI-Work\Ai apps & Codebase\FreeCAD` (`UNIFY-A.md`).
