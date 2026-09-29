# A4 · A5 · H19.2 land on main

**Brief** (architect → A, 28 Sep, after the demo):
1. Clean up first.
2. Rebase `eco/a5` on `main` and open one PR: preview READY → merge → production READY. `/builder` is what the world's "Edit building" opens.
3. Then delete `eco/h19-2`, `eco/a4` and `eco/a5`.

## 1. Cleanup

- **PR #4 (`eco/ci`):** merged with a merge commit, **`bd81105b`**. Production READY: `dpl_Hqoy9Nx2WU5twRPjZdERqgbGYud7`. CI's quality job is green on `main` again; it had been red since `121d1ebc`.
- **PR #2** (`eco/h17-0-remeasure`, the measuring tip that was never to be merged): closed.
- **21 remote branches deleted**, after `git fetch --prune`:
  - **the 19 already in `main`** (`git branch -r --merged origin/main`, never `main`):
    - `cursor/eco-h2`, `eco/ci`, `eco/demo`, `eco/h15`, `eco/h19`;
    - `eco/h16-1-geometry`, `eco/h16-2-catenary`, `eco/h16-2-stamp`, `eco/h16-3-body`, `eco/h16-3-stamp`, `eco/h16-4-xr`, `eco/h16-5-ifc`, `eco/h16-temple-forms`;
    - `eco/h17-0-perf-baseline`, `eco/h17-0-stamp`, `eco/h17-1-fixes`, `eco/h17-1-stamp`, `eco/h18-stamp`, `eco/h18-walk`;
  - **the two measuring branches**, not in `main`. Their tips are recorded here so they can be restored: `eco/h17-0-probe` `a0ca4ca4`, `eco/h17-0-remeasure` `1b8cc3ea`.

## 2. The rebase

- **Before:** `eco/a5` (`85f44621`) held `eco/h19-2` and `eco/a4`. That was 31 commits plus one merge on `37a8250e`, 15 commits behind `main`.
- **After:** 25 commits on `main` (`bd81105b`), plus the check update in section 3 (`43ac80d5`).
- **Dropped because the demo already put them on `main`:**
  - `669d9fa4`, now `a35de116`;
  - `f48ecb17`, now `cbeb1af9`;
  - `9dca37fc`, now `f8b80d60`. `main`'s lighting file is A5's plus the light-graphics shadow gate, so replaying it added nothing.
- **Dropped because they only recorded STATUS:** `4b2ae1ba`, `1d2ac08c`, `85f44621`. This file and the STATUS entry replace them.
- **The one conflict:** `7969d78f` (H19.2b) in the viewer.
  - AdaptiveDpr keeps H19.2b's GPU-time budget and stays unmounted with light graphics.
  - `ViewerScene` now receives `frameCap`, the cap the frame limiter uses (60 light, 50 full), instead of the optional `maxFps`. The budget can never be `1000 / undefined`.
- **Merged by git and read line by line:**
  - `bridge.ts`: A4's single origin. The demo's local fallback doesn't use `postMessage`, so the two don't interact.
  - `bootstrap.ts`: A4's imports ahead of the demo's.
  - The viewer's and plugin-eco's export lists.
  - H19.2c's shadow updates. Nothing turns the shadow map on in light mode: the only code that does is the eco sun, and it runs with full graphics only.

**Old and new commits.** `H19-done.md`, `A4-done.md` and `A5-done.md` cite the commits from before the rebase:

| Before | After | Commit |
|---|---|---|
| `d9760995` | `763bc388` | eco(H19.2): harness loads fixtures, counts shadow passes, takes a scene census |
| `36d4f897` | `581a8f7e` | eco(H19.2): the H19 scene as data |
| `669d9fa4` | on `main` as `a35de116` (demo) | fix(H19.2): eco site guides as WebGPU lines |
| `7969d78f` | `15d39267` | fix(H19.2b): AdaptiveDpr decides from GPU render time and render cadence |
| `b9151c50` | `dfa38b5e` | fix(H19.2c): shadow maps redraw on change, not every frame |
| `fc41ce9c` | `6d343c87` | eco(H19.2b): captures before and after, native and 2x |
| `47d1139f` | `df9a2f02` | eco(H19.2): guides captures before and after |
| `ccf39232` | `4b44d48b` | eco(H19.2c): captures before and after |
| `285e2f70` | `8556222a` | eco(H19.2c): shadow discipline checked by behaviour |
| `cb996f73` | `64bd9f3c` | eco(H19.2d): profile loads fixtures and ranks what the camera draws |
| `26693527` | `033746c4` | eco(H19.2d): H19 scene profile of b9151c50, native and 2x |
| `273d912d` | `3ed1dd86` | eco(H19.2): guides, 2b, 2c measured on the H19 scene; 2d profiled |
| `4b2ae1ba` | dropped (STATUS only) | eco(H19.2): record STATUS commit sha |
| `2df4e8f5` | `e208500f` | fix(A4): detect-gpu benchmarks from the bundle, not unpkg |
| `5acf4bb0` | `84aacb10` | fix(A4): Iconify icon data served by the editor itself |
| `8f6b6950` | `33973e65` | fix(A4): public assets and route payloads under the base path |
| `d745d4e7` | `8d497ac0` | feat(A4): the eco/1 bridge talks to one origin from one env |
| `92be9d15` | `5df5ae7b` | eco(A4): check the /builder build: requests and origin |
| `5afe64dc` | `39fbe254` | fix(A4): Draco decoder and Basis transcoder served by the editor itself |
| `618482a4` | `bd63864f` | fix(A4): a file the export lacks stays on the CDN, never a 404 |
| `91c2ddfe` | `0ed4bc21` | fix(A4): IFC export finds web-ifc's wasm under the base path |
| `30087ad4` | `1a6b3c05` | eco(A4): check content, IFC export and decoders under /builder |
| `39c602cc` | `3fee539a` | docs(A4): done-file — the editor under /builder, same origin |
| `1d2ac08c` | dropped (STATUS only) | eco(A4): record STATUS commit sha |
| `f48ecb17` | on `main` as `cbeb1af9` (demo) | eco(A5): EcoSite gains standing trees and the world's sun instant |
| `9dca37fc` | on `main` as `f8b80d60` (demo) | fix(A5): the sun stands in the site's frame, at the instant the world sends |
| `a39fc867` | `4e934c58` | feat(A5): the site as reference layers — standing trees, contours, survey |
| `4a793ab1` | `609817fb` | feat(A5): on a real site, a wall drawn on the ground stands on the slope |
| `12d7bea2` | `15716013` | eco(A5): check the site in the editor against the site as sent |
| `26042fd6` | `3aa7e368` | docs(A5): done-file — the site in the editor |
| `85f44621` | dropped (STATUS only) | eco(A5): record STATUS commit sha |

## 3. The A4 check meets the demo (`43ac80d5`)

Two demo changes on `main` made A4's check fail, though A4 itself hadn't changed: when the world sends nothing the editor opens its demo site, and light graphics (the default) hides Export IFC. The check now accounts for both:

- **CDN files on the blank pages.** The blank `/builder/` pages now open the demo house, and its library finishes are files the build itself declares CDN-only (`eco-build.json` `onCdn`). They are the same 6 files the content case already allowed, so the pages now follow the content rule: those files are listed, and anything else outside `/builder/` still fails.
- **IFC export.** The IFC case now opens with full graphics, set in the viewer's saved preference before the app reads it. It downloads an `.ifc`, and `web-ifc.wasm` is served from `/builder/`.
- **Self-test.** The control page now loads the demo site, so the self-test's page with no content is forged: the control recording with its models, decoders and texture maps removed.
- **Unchanged.** The refused-origin leg still looks for the site's guides. It runs after the pages on the same origin, and the demo house they saved stops the fallback from drawing a site there.

## 4. Checks

| Check | Run on | Result |
|---|---|---|
| `bun run checks` | `43ac80d5` | 16 of 16 |
| `bun run build` | `43ac80d5` | 10 of 10 |
| `check-a4-builder` + `--self-test` | static build of `3aa7e368` with the host origin `http://localhost:4173`; `43ac80d5` changes only the check | OK. The self-test rejects the forged asset (with and without the CDN-only files allowed), a page with no content, and a page where no export ran |
| `check-a5-site` + `--self-test` | same build | OK: walls on the slope meet the ground at every station, worst 3.0 cm. The self-test rejects forged walls, sun, trees and plan |
| `check-h19-2b` + `--self-test` | `3aa7e368` | OK; the forged render-only loop is rejected |
| `check-lighting` · `check-h16-geometry` · plugin-eco `bun test src` | `3aa7e368` | OK · OK · 10 pass |
| CI on pull request #5 (Linux) | `43ac80d5` | quality, cli-smoke and ci green |
| Demo tour on the preview `dpl_BEUtXvhS3aWRctxaNEo4PCeLhLps` | `43ac80d5` | see below |

**Demo tour on the preview** (record: `demo/landing-preview-tour.json`):
- **Model:** the demo house opened in light graphics, built 71 s after load on a first visit.
- **Editing:** walls went 8 → 9.
- **Tabs:** all 18 opened, with no errors.
- **Tools:** the same results as in `demo-done.md`, meshes 227 → 260 → 272 → 434 → 484; the hidden tools are still absent.
- **Errors:** no page errors and no failed requests.

## 5. Merge and production

- **Merge:** pull request #5 (`eco/a5` at `82dc5f8e`) merged with a merge commit, **`79dc5f13`**. Before the merge, CI was green on `82dc5f8e` and its preview was READY (`dpl_huWSj8JkrNDjPxqEExw9877E2TyV`). `bun run build` passed (10 of 10) before the push.
- **Production:** **READY**, `dpl_Gd2hzP9a9Lmrv2y6jr4AmozMZoE9` at `79dc5f13`, served at https://architect-editor-snowy.vercel.app.
- **Production tour:** the demo tour ran once more against production, in a fresh Chrome profile (record: `demo/landing-production-tour.json`):
  - the demo house opened in light graphics, built 4.6 s after load;
  - walls went 8 → 9;
  - all 18 tabs opened, with no errors;
  - every tool gave the same result as in `demo-done.md`;
  - no page errors and no failed requests.
- **Branches deleted:** `eco/h19-2` (`4b2ae1ba`), `eco/a4` (`1d2ac08c`) and `eco/a5` (`82dc5f8e`). The remote now holds only `main`. On this machine, local branches still hold the commits from before the rebase: `eco/h19-2`, `eco/a4` and `eco/a5-prebase`.

## Open

- **IFC export works now** (the A4 check downloads an `.ifc` under `/builder/`), but light graphics still hides it, as the demo recorded. Showing it in light mode is a decision for after the demo.
- **The host's reference massing never appeared.** In the `/builder/embed/` harness, `eco-ghost` did not appear within 45 s, although the host's site and its guides did. This isn't new in this merge; it turned up while choosing the check's origin signal.
- **The bridge answers one origin:** `NEXT_PUBLIC_ECO_HOST_ORIGIN`, default `https://spatial-map.vercel.app` (A4). With this merge, that is the only origin the production editor talks to.
