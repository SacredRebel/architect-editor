# STATUS — Agent A
updated: 2026-09-28
phase: **A5 recorded on `eco/a5`** · stopped after A5, as briefed
state: A5 closed. The site arrives as reference layers. The sun stands in the site's frame at the sent instant. A wall drawn on the pad stands on the real slope. H19.2a still waits on the `eco/h19` PR, which the human merges in the browser; `eco/h19-2`, `eco/a4` and `eco/a5` rebase onto that merge.

## Production SHAs

| Phase | Feature | Merge | Production |
|---|---|---|---|
| H17.0 | perf baseline | `972886b6` | READY |
| H17.1 | AdaptiveDpr / detect-gpu / shadows | `cf50c731` | READY |
| H18 | walk feel | `795317fb` | READY https://architect-editor-snowy.vercel.app |
| lane | `.cursor/rules/lane.mdc` | `5d061383` | on main |
| **H19.0a** | hygiene (format · types · CI checks · LF) | **`121d1ebc`** | READY https://architect-editor-snowy.vercel.app |
| **H19.0 · H19.1 · H19.2a** | re-measure · profile · dpr never above the display | `eco/h19` @ `37a8250e`, preview READY | PR in the browser, merge commit |
| **H19.2** | H19 scene · guides · 2b · 2c · 2d profile | `eco/h19-2` · done **`273d912d`** (pre-rebase) | after the H19.2a merge |
| **A4** | the editor under `/builder`, same origin | `eco/a4` · done **`39c602cc`** (pre-rebase), preview READY | after the H19.2a merge |
| **A5** | the site in the editor | `eco/a5` · done **`26042fd6`** (pre-rebase) | after the H19.2a merge |

## A5 — the site in the editor (`check-a5-site`, realistic site, Chrome 154)

| Line | Result |
|---|---|
| Sun at the sent `sunAt` (2026-12-21 13:00 PST, `northDeg` 12) | 0.061° from an independent solar algorithm; the pre-A5 conversion: 111.4° |
| Wall drawn downhill on the pad (8.06 m, ground −1.12 m) | both faces meet the ground at 25/25 stations, worst 3.0 cm |
| Wall drawn uphill (4.30 m, ground +0.38 m) | flat at its first point's ground, buried up to 0.40 m, as upstream elects: open item |
| Standing trees | 12/12 at the sent positions, bases within 1.0 cm of the ground |
| Plan | 17 contour levels, 4,259 vertices on level; survey line and canopies exact |
| `--self-test` (the site drawn wrongly) | walls, sun, trees and plan each rejected |

## A4 — requests under `/builder` (local static server, Chrome 154)

| Case | Result |
|---|---|
| `/builder/` · `/builder/embed/`, both builds | zero outside `/builder`, zero 404 |
| Export IFC from `/builder/embed/` | `.ifc` downloaded, `/builder/web-ifc.wasm` 200 — a 404 on a chunk path before `91c2ddfe` |
| Bridge origin | a hello from any origin but `NEXT_PUBLIC_ECO_HOST_ORIGIN` (default `https://spatial-map.vercel.app`) is ignored |
| H19 house over the bridge + a KTX2 finish | same-origin, and the decoders are served from `/builder/decoders/`; the exception is 6 requests to upstream default finishes that exist only on Pascal's CDN (235 such files) |

## H19 numbers (H19 scene unless marked; 20 s path; local production builds; same Chrome)

| Line | Before → after |
|---|---|
| guides (drei Line → Line2NodeMaterial) | fps 42.8 → 50.0 · p1 10.0 → 29.9 · interval p99 99.9 → 33.4 ms (three pairs agree) |
| 2b at 1× | `renderMs` no change (four pairs, under 0.26 ms, signs disagree) |
| 2b at emulated 2×, `high` | dpr 1.5 → 1.25 · fps 39.4 → 46.5 · `renderMs` 11.3 → 7.9 ms |
| 2c | shadow passes 2.0 → 0.154/frame · draws 573 → 254 · encode 2.1 → 1.3 ms · GPU no change |
| 2d | batched items cost 0.20 ms in all (under the floor): instancing not taken · no reallocations mid-orbit at 1× or 2× |

fps is upstream's `FrameLimiter` cap (50). Noise floor: 0.26 ms; timestamps step 0.0655 ms.

## Gate (on `12d7bea2`)

| Check | Result |
|---|---|
| `bun run checks` · `bun run build` | green (Bun 1.4.2 installed; pin 1.3.14) |
| `check-a5-site` · `check-a4-builder` | OK on this branch's check build, each with `--self-test` OK |
| `check-h17-perf` · `check-h19-2` · `check-h19-2-guides` · `check-h19-2b` · `check-h19-2c` | OK, each with `--self-test` OK |
| `check-h17-1` | OK — shadow discipline by behaviour; no `--self-test` of its own (its shadow line is `check-h19-2c`'s) |
| `check-lighting` · `check-h12` · the other headless eco checks | OK |
| `check-roundtrip` · `check-h10` · `check-scene-roundtrip` | fail identically on the A4 code: pre-existing |

## Open for the architect

- **A5: the world has to send `EcoSite.trees` and `EcoSite.sunAt`.** Both are optional and additive, so the version stays `eco/1`. See `A5-done.md`.
- **A5: walls drawn uphill are buried.** Upstream elects a terrain wall's plane at the ground under its first point. Electing the highest ground under the wall would give feet on the ground from either end, but it changes every terrain wall upstream.
- **A5: the GLB and walk export flip z; the site context does not.** The scene is already the world frame: the world's own massing ghost goes in unflipped. Unless the world flips eco designs back, designs land mirrored north–south. I have not changed the export; it needs the world's import behaviour.
- **A4: 235 library files exist only on Pascal's CDN.** These are the wood, flooring and roofing finishes. Upstream's defaults and curated items use them, so any house requests some. The options are:
  - (a) download them, which needs the human's approval and a recorded licence;
  - (b) encode them from the committed `.webp` originals;
  - (c) accept the CDN.

  See `A4-done.md`.
- A4: local perf captures through the bridge now need `NEXT_PUBLIC_ECO_HOST_ORIGIN` set to the capture origin.
- The H19 brief file and the "direction note" have not arrived in `docs/plans/inbox/`.
- PR #2 (`eco/h17-0-remeasure` @ `1b8cc3ea`, an empty commit from the Cursor session) is still open.
- Biggest remaining GPU line on the H19 scene: the translucent buildable envelope (0.62 ms).

commit: A5 done `26042fd6` on `eco/a5` · A4 done `39c602cc` on `eco/a4` · H19.2 done `273d912d` on `eco/h19-2` (all pre-rebase) · H19.2a `eco/h19` @ `37a8250e`
queue: stopped after A5, as briefed; waiting on the H19.2a merge and the next brief
