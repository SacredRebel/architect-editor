# Demo — ship to production tonight

Branch `eco/demo`, from `main` after the H19.2a merge (`c00d885f`). Merged as **`0d38a884`**; production **READY**.

The brief (architect, 28 Sep):

> 1. Merge H19.2a first … 2. One graphics setting in the editor: 'light' by default, 'full' behind it. Light means shadows off, SSAO and any post-processing off, pixel ratio 1, the FrameLimiter cap raised to 60. Nothing deleted. 3. What's shown works: open each plugin-eco tool once on the preview (organic geometry, catenary, body, XR, IFC, temple forms). Anything that errors or does nothing is hidden (not deleted) in light mode; list them. 4. A model loads and can be edited … 5. Proof: screenshots … typecheck, build and tests pass; no new measurement tonight.

## 1. H19.2a is in production

- **Merge:** local `main` reset to `origin/main` (`341c4019`). My earlier local merge was discarded.
- **Commit:** `eco/h19` (`37a8250e`) merged with a merge commit, **`c00d885f`**. Its tree is identical to the discarded local merge.
- **Gate before push:** `bun run checks` and `bun run build` green.
- **Production:** **READY**, `dpl_GZ9asee41gW5m25zNL4yNFQY33JE` at `c00d885f`.

## 2. One graphics setting (`de8098e0`)

`useViewer.graphics` is `'light'` (the default) or `'full'`, persisted with the display preferences. The Display menu opens with **Graphics: Light / Full**. In light mode, Shadows and Quality read "Full graphics".

| | Light (default) | Full |
|---|---|---|
| Shadows | off: the renderer's shadow map is disabled, and eco site lighting no longer forces it on | the Shadows toggle; eco sun shadows as before |
| Post-processing (SSGI/AO, denoise, ink, outline) | off | on |
| Pixel ratio | 1 (adaptive DPR not mounted) | the quality tier's range, adaptive |
| Frame cap | 60 | 50 |

A cap a host passes explicitly is kept in both modes. Nothing is removed.

## 3. The tools, opened once on the preview

The first audit ran on preview `dpl_7hpHN4gaQmjT1C7DwnwV3sGbgv8t` (`a35de116`), before hiding. Its record is `demo/audit-before-hiding.json`.

The tour script is `packages/plugin-eco/test/demo-tour.mjs`. It opens each rail tab and runs each tool's action once. It records:
- mesh and draw counts before and after;
- downloads;
- HTTP 4xx/5xx;
- console errors.

| Tool | What was run | What happened | Light mode |
|---|---|---|---|
| **Catenary** | Eco site → Add catenary arch | an arch, meshes 227 → 260, no errors | shown |
| **Organic geometry** (Eco site, H10) | Add lofted leaf surface; Add barrel vault + ribs | meshes 260 → 272 and 272 → 434, no errors | shown |
| **Organic geometry** (Organic panel, H15) | Grow 5-lobe building (and, by the same store, Add smooth wall + 3 windows) | the panel shows the building's parameters and quantities (1,082.9 sq ft, 14 solar panels), but **nothing is drawn**: meshes 432 → 432. Nothing in the 3D view reads the organic-building store; only the panels and the GLB export do. | **hidden** (does nothing on screen) |
| **Organic geometry** (Minimal surface) | Make from closed curve | needs an organic building and writes to the same undrawn store | **hidden** |
| **Temple forms** | Place it where the view is centred; Place catenary vault | "Domed bay: 13 parts placed", meshes 434 → 484; "Catenary vault: span 20′, extruded 15′", selected as an Arch; no errors | shown |
| **IFC** | Settings → Export IFC 4.3 | **errors**: web-ifc asks for `/_next/static/immutable/chunks/web-ifc.wasm` twice, both 404, the wasm compile fails, and no file downloads | **hidden** (Settings button and command palette) |
| **XR** | WebXR panel; toolbar Enter VR | "Immersive VR is unavailable. Connect a headset and open the editor over HTTPS." Both buttons are disabled, so it does nothing here. | **hidden** (panel and toolbar button) |
| **Body** | — | `plugin-body`'s `body` kind has no tool, so nothing in the UI creates one (the Build palette lists only kinds with a floor-plan tool). Nothing is shown. | nothing to hide |

The hidden list, in light mode only (all back with full graphics; nothing deleted or unregistered, `648755a5`):
1. **Organic** panel — draws nothing.
2. **Minimal surface** panel — draws nothing.
3. **WebXR** panel and the toolbar's **Enter VR** — do nothing without a headset.
4. **Export IFC 4.3**, in Settings and the command palette — errors (wasm 404).

Every other rail tab opens with no crashed panel and no console error: Scene, Build, Items, Settings, Nature, Environment, Temple forms, Geometry, Pools, Streetscape, Eco site, My assets, Materials, Drawings, Construction, Leaf shell, Photo → 3D, Plugins.

The IFC fix exists. Commit `91c2ddfe` on `eco/a4` passes web-ifc its wasm path; A4's check showed the export working under `/builder`. It was left out tonight because it needs the A4 decoder-path setting with it.

## 4. A model loads and can be edited (`2f920917`, `4561bf0e`)

- Whatever the world's studio sends over eco/1 opens as before.
- **When nothing arrives** (no scene and no site within 3 s of the editor coming up, and the editor holds no design), the editor opens `public/demo/site-house.json`: the H19 scene, a four-room house with 20 items and 30 trees on a site. Sources and licences are in `public/demo/NOTICE.md`.
- It goes through the bridge's own load path. No hello is sent, so the world's hello is still accepted and anything the world sends replaces it.
- The fixture is fetched at startup, alongside the editor's own load.

On the final preview, in a fresh browser profile, the house was in the store after **2.0 s** and built after **11.1 s**. One wall was then drawn with the wall tool (B, two clicks, Escape), and the walls went 8 → 9.

Built means every wall's object is registered and nothing is left dirty. Earlier cold runs took 14–31 s: the house's parts wait for the item models, which a first visit downloads.

## Found while doing this, and fixed on this branch

- **With a site loaded, production could not draw at all.** drei's `<Line>` brings the WebGL-only `LineMaterial` into the WebGPU node builder, so every frame's render failed (324 errors in 18 s on the first preview). That is the H19.2 guides fix, `669d9fa4`, cherry-picked as **`a35de116`**.
- **The sun lit the site from the wrong side.** `main` places the eco sun with +z as north, mirrored against the terrain, guides and ghost. On the `a35de116` preview it stood north-west (z = −455) at 15:00, and the house read flat blue. That is A5's fix, `f48ecb17` + `9dca37fc`, cherry-picked as **`cbeb1af9`** + **`f8b80d60`**, with its `check-lighting` lines. When A5 resumes, its rebase skips these identical patches.

## Found and not fixed tonight

- **Full graphics with a site loaded shows only the sky.**
  - The house is built (every wall registered, nothing dirty), but the full post-processing pipeline draws the eco sky over it.
  - Light mode draws the scene.
  - Before this merge `main` had only full graphics, so production showed only the sky whenever a site loaded.
  - Light is now the default in production; full stays behind it, as briefed.
- **Cold first visit.** The house appears only after the item models download: 11–31 s on the previews and 51 s on production's first visit, depending on the CDN.

## 5. Proof

Screenshots are in `docs/plans/demo/`. They were taken on the final preview, **`dpl_5sTZbhRoymUj9g2YNA2xDPLoF9CD` (`4561bf0e`)**, in light mode, 1600 × 1000, with a fresh Chrome profile. Record: `demo/tour.json`, with 0 page errors and 0 failed requests over the whole run.

| Shot | What |
|---|---|
| `01-model.jpg` | the demo site and house, opened by the fallback |
| `02-edited.jpg` | after drawing a wall beside the house |
| `03-display-graphics.jpg` | the Display menu: Graphics — Light |
| `10-…` to `27-…` | each visible rail tab's panel: Scene, Build, Items, Settings, Nature, Environment, Temple forms, Geometry, Pools, Streetscape, Eco site, My assets, Materials, Drawings, Construction, Leaf shell, Photo → 3D, Plugins |
| `40-catenary-add-catenary-arch.jpg`, `41-…lofted-leaf…`, `42-…barrel-vault…` | the Eco site tools after running |
| `46-temple-forms-…centred.jpg`, `47-…catenary-vault.jpg` | the temple forms after placing |
| `43`–`45`, `48`–`50` | the hidden tools' steps: their buttons are absent in light mode |

### Gate (on `4561bf0e`; Bun 1.4.2 installed, pin 1.3.14)

| Check | Result |
|---|---|
| typecheck (`bun run checks`: Biome + types, 16 of 16) | **green** |
| `bun run build` | **green**, 10 of 10 |
| tests (`turbo run test --continue`) | **13 of 20 packages green.** 7 fail: ifc-converter 2, viewer 1, core 2, cli 7, editor 19, nodes 8 (`main`: 10), and plugin-geometry, which has no test files (Bun 1.4.2 exits 1). Compared by test name against `main` (`c00d885f`, same install), all 38 also fail there, so none is new on this branch. |
| `check-lighting`, plugin-eco `bun test src` | OK |

## Commits

| Commit | What |
|---|---|
| `de8098e0` | one graphics setting — light by default, full behind it |
| `2f920917` | a site and house open when the world sends nothing |
| `a35de116` | eco site guides as WebGPU lines (cherry-pick of `669d9fa4`) |
| `cbeb1af9` | EcoSite gains standing trees and the world's sun instant (cherry-pick of `f48ecb17`) |
| `f8b80d60` | the sun stands in the site's frame (cherry-pick of `9dca37fc`) |
| `648755a5` | tools that error or do nothing are hidden with light graphics |
| `4561bf0e` | fetch the demo site with the editor's first load, wait 3 s for the world |

## Merge and production

- **Merge:** `gh` was not signed in, so the human merged pull request #3 (`eco/demo` into `main`) with a merge commit, **`0d38a884`** (parents `c00d885f` and `129625b9`). Its tree is identical to `129625b9`, the last preview's commit.
- **Production:** **READY**, `dpl_BUYwmDfTxVJCL2KD2Xf7cQChN5GC` at `0d38a884`, served at https://architect-editor-snowy.vercel.app.
- **Production, opened once** with the same tour (fresh Chrome profile, 1600 × 1000). The record is `demo/production-tour.json`, with one screenshot, `demo/production-01-model.jpg`:
  - graphics light; the demo site and house opened by the fallback, in the store after 2.4 s and built after **50.8 s** on this first visit to the new deployment (11.1 s on the final preview);
  - one wall drawn with the wall tool, walls 8 → 9;
  - all 18 visible rail tabs opened, with no crashed panel and no error;
  - the catenary arch, leaf surface, barrel vault and temple forms ran as on the preview (meshes 227 → 260 → 272 → 434 → 484); the hidden tools' buttons are absent;
  - 0 page errors, 0 failed requests and 0 downloads over the whole run.

A4 and A5 resume after the demo.
