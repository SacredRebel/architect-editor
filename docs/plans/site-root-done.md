# eco/1 — the host's ground lands under "Edit building"

**Branch:** `eco/site-root`, from `main` at `d8ecb779`.
**Brief:** architect → A, 29 Sep: on `eco:load-site`, if the scene has no site node, create one and apply the terrain, the surveyed line, the guides and the house reference there.
**Merge:** the architect merges.

## Why

- **The site came before the scene.**
  - The bridge answers hello as soon as it is installed, which can be before the editor loads its first scene.
  - The world then sends `eco:load-site` into an empty store. `applyEcoSite` found no site root, logged "no site root in scene" and returned. The editor's own first load then replaced the scene anyway.
  - So there was no terrain, and the guides draped on nothing. Case A below reproduces this: the editor records the site arriving with no site root.
  - The same miss happens when the scene holds buildings but no site: a host scene without one, or such a scene saved in the embed's local storage.
- **The house reference never drew.**
  - The ghost minted a new object URL for the site's `refGlb` on every render. Its loader suspends, and each retry rendered with a fresh URL, so the loader's cache never hit.
  - An 812-byte box made 7,143 object URLs in 15 s, each fetched with a 200, and never appeared. With a real massing GLB the blobs also pile up in memory.
  - This is the open item "`eco-ghost` did not appear within 45 s" in `A4-A5-landing-done.md`.

## What changed

- **`packages/plugin-eco/src/apply-site.ts`**
  - **A scene without a site root gets one.**
    - An empty scene gets the editor's own default: site → building → level.
    - A scene whose roots are buildings, or bare levels, gets a site that adopts them. Any other root stays a root.
  - **The ground is written outside undo history.** The ground is the terrain plus a site polygon covering it. It is the host's, not an edit, so loading it is not an undo step and does not mark the design dirty.
  - **The ground goes back onto every scene that replaces the one it was written into:** the editor's own first load, a host scene, or a new scene.
    - A replacement means a new root list with a different site root, or a scene load.
    - Within one scene nothing is re-applied, so a terrain the user sculpts stays theirs.
  - **`window.ecoSiteLandings`** (read-only, for checks, beside `window.ecoHost`) records each landing. Each entry says whether it came from load-site or a new scene, whether the scene had a site root, and what was made.
- **`packages/plugin-eco/src/eco-ghost.tsx`** keeps one object URL per `refGlb`, outside React. The previous URL is revoked when the host sends a different reference.
- **`packages/plugin-eco/src/bridge.ts`** defines `window.ecoSiteLandings`.

## The checks

- **`packages/plugin-eco/src/apply-site.test.ts`** has six tests and runs in plugin-eco's `bun test src`, so CI runs it.
  - **Cases:**
    - an empty scene;
    - the editor's own load after load-site;
    - a host scene without a site;
    - the same site reloaded;
    - the ground is not an undo step;
    - a sculpted terrain stays.
  - **How it compares:** it reads the terrain back as it would be saved (a JSON copy, decoded by core's codec) and compares it with the sent heights less `originElevM`.
  - **It could fail:** against `main`'s `apply-site.ts`, 5 of 6 fail. A watcher that re-applies on every change fails the sixth.
- **`packages/plugin-eco/test/check-site-root.mjs` and `--self-test`** run against the static build in Chrome. The host is played from the page's own origin with a site shaped like the world's: 201×201 samples 1 m apart with metres of relief, 11 guides, and a house reference (a box GLB built in the check).
  - **Three orders:**
    - **A, site first:** hello and the site are posted by a script that runs before the editor's code, the moment the bridge answers.
    - **B:** a scene without a site (a building with a level and a wall as its only root), then the site.
    - **C:** the site, then that scene.
  - **Each case must show:**
    - the editor's record says the case took its path. A: no site root when the site came. B and C: a site made to adopt the building;
    - exactly one site root;
    - its terrain as saved (base64 Int16, decoded in the check) equals the sent heights less `originElevM` on all 40,401 samples;
    - all 11 guides are drawn, every vertex 0.05 m above the sent ground at that point;
    - the house reference is drawn at the box's extents, from one object URL;
    - in B and C, the building stands under the site root with its wall.
  - **`--self-test` rejects 8 forgeries:**
    - the terrain gone;
    - the ground 1 m high;
    - the rows flipped north–south;
    - a second site root;
    - the guides flat on the datum;
    - the house reference missing;
    - a new object URL on every render;
    - case A with a site root already there.
  - **Before the ghost fix**, the same check failed "the house reference" in all three cases, while the terrain and guides passed.

## Results (static build of this branch)

| Check | Result |
|---|---|
| `check-site-root --self-test` | OK. A, B and C pass: every sample matches (worst 0.0000 m), 43 guide vertices sit at +0.05 m (worst 0.000 m), and the house reference is drawn from 1 URL. The self-test rejects 8 of 8 forgeries |
| `check-a4-builder` | OK |
| `check-a5-site` | OK with `PORT=4192`. Another program on this machine listens on port 4173 (IPv4 and IPv6), and the check's `localhost` origin reached it first. Not a code fault |
| plugin-eco `bun run test` | 16 pass, then the origin check and its self-test |
| `bun run checks` | 16 of 16 |
| `bun@1.3.14 run build --filter=editor` | OK: `editor:build` ran, not from cache |

## Not in this change

- **A host `eco:load-scene` sent before the editor's first load would still be replaced by that load.** The embed page loads its saved scene on mount. This hasn't been observed; the world's report was about the site. The fix would be for the embed page to prefer a host scene that has already arrived.
- **Production acceptance is still to do.** The steps: world → B → Oak Leaf → "Edit building ▸" → the editor shows the terrain and the Oak Leaf on its site, with a screenshot. The world's build tools ask for a PIN, which this lane does not enter, so the screenshot is for someone who holds it once the merge is in production.
