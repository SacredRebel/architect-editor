# F0 done

Prove the loop between a world-like host and the editor embed.

## Built

- **Carryovers:** `E2_CAPS` → `CAPS` (exported); deleted `fixture.glb.b64.txt` (base64 from `fixture.glb` at serve/test time); `[eco:bridge]` logs gated by `?ecoDebug=1` / `localStorage eco:debug=1`.
- **F0.1** `test/host-harness.html` — knocks `eco:hello` every 500 ms ≤20×, loads realistic 97×97 @ 1.5 m site (`realistic-site.mjs`) with four guides + optional `refGlb`, **Request eco:glb** button, logs all messages with timestamps, draws walk rings as SVG. Copied to `out/eco-host-harness.html` by `build:static`.
- **F0.2** `test/check-roundtrip.mjs` — asserts caps, harness contract, terrain samples ±1 cm via `terrainFieldFromEcoSite`, boundary guide z-south, two rooms + shared door wall → ≥3 floors / 2 shared solids / wall foot·head / GLB `extras.walk`. (Headless data path; no Playwright added — ask before adding a browser dep.)
- **F0.3** `docs/plans/F0-loop.md` — real-world loop blocked on Vercel Deployment Protection; local harness path documented.

## Verified

- `bun packages/plugin-eco/test/check-roundtrip.mjs`
- `bun packages/plugin-eco/test/check-export.mjs`
- `bun run check-types --filter=@eco/plugin-eco`
- `bun run build --filter=editor`

## Decision

Round-trip automation covers site apply + design export without a browser runner; the HTML harness is the interactive world stand-in until Deployment Protection is off.
