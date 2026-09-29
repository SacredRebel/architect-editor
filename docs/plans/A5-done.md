# A5 — the site in the editor

Branch `eco/a5`, from `eco/a4` @ `1d2ac08c`.

The brief (architect, 28 Sep):

> A5 — the site in the editor: load-site renders terrain, trees and the survey line as reference layers; plan view shows contours and the survey; the sun matches the one sent. Check: a wall drawn on the pad stands on the real slope — its base height against the terrain height sampled independently at the same points.

## Result

- **Terrain** stays in the site node, where every tool, wall, item and the walk stand on it. The plan's contours are drawn from the sent heights, so they stay the survey's even if the ground is sculpted.
- **Standing trees** are a reference layer in 3D and in the plan. They stand on the terrain the editor draws. They take no raycast and cast shadows. They are not scene nodes, so they are never exported, selected or edited.
- **The survey line** (the `boundary` guide) and the other guides show in 3D, as before, and now in the plan.
- **Contours** show in the plan every metre, with every fifth bold and labelled.
- **Legend toggles** for standing trees and contours sit beside the guide toggles.
- **The sun** now matches the one sent, 0.061° from an independent solar algorithm. Before A5 it stood in a mirrored frame, 111° away at the same instant. It lights the site at `sunAt` when the world sends one.
- **A wall drawn on the pad** stands on the real slope. Drawn downhill from its high end, both faces meet the ground at all 25 stations, worst 3.0 cm. Drawn uphill, it follows upstream's model to 0.1 cm: one flat base at the first point's ground, running into the rising ground. That is open item 2.

## The contract: two optional EcoSite fields (`f48ecb17`)

| Field | Shape | The editor |
|---|---|---|
| `trees` | `{ pt: [x east, z north], heightM, canopyM, species? }[]`, local metres like the guides | draws them as reference; malformed entries are dropped |
| `sunAt` | ISO 8601 instant | lights the site at the lighting contract's NOAA sun for `originLL` at that instant; the time slider starts at its local time |

Both are additive, so the version stays `eco/1`. The world has to send them (open item 1). Until it does, there are no standing trees, and the sun follows the slider today, as before.

## The sun (`9dca37fc`)

The editor's scene is the site's world frame: x east, y up, z = −(site north).
- `siteToWorldXz` puts the terrain, guides and ghost there.
- The compass reads north toward −z.
- The world's own massing GLB (the ghost) goes in without a flip and lines up with them.

The sun alone took +z as north. The error was one reflection: mirrored north–south, and turned by +`northDeg`, where site north stands `northDeg` clockwise of true north.

`sunSceneVector` places the sun at azimuth A − `northDeg` in the scene frame. The light, the sky's glow and the baked sky all use it, and so does `sunDirectionAt`. The presentation framing now converts the massing outline into the scene frame as well.

`check-lighting` gains two lines:
- The noon sun at 34° N must stand toward +z. The pre-A5 code fails this: run from `HEAD`, it gives z = −0.174.
- Turning `northDeg` by 90° must map (x, y, z) to (z, y, −x), which pins the direction of the turn.

## Walls on the slope (`4a793ab1`)

Upstream gives a wall on the ground one flat base, the ground under its first point. It offers `fillToTerrain` (the panel's "follows terrain") to carry the wall down wherever the ground falls away; without it, a wall across a slope floats over the low side.

How the default is applied:
- While an EcoSite is loaded, `toolDefaults.wall` carries `fillToTerrain`.
- The 3D tool and the plan both spread those defaults into each new wall, in the same history step, so there is no extra undo entry.
- The wall tool clears its defaults when it closes, so the flag is put back whenever they change. It is removed when the site goes, and it is never persisted.
- Walls off the ground are unaffected: `terrainSupportLift` is null off the site datum.

## The check — `packages/plugin-eco/test/check-a5-site.mjs` (`12d7bea2`)

The check serves the static build under `/builder`, built with `NEXT_PUBLIC_ECO_HOST_ORIGIN=http://localhost:4173`. It opens the editor in its own Chrome and sends `eco:load-site` over the bridge from that origin: the realistic site (97 × 97 at 1.5 m, `northDeg` 12), 12 standing trees, and `sunAt` 2026-12-21T21:00:00Z.

Everything the editor draws is compared against the sent site sampled by the check itself: bilinear over the sent heights, independent of the editor's terrain field.

| Group | Derived here | Read from the editor | Result |
|---|---|---|---|
| Downhill wall, drawn with the wall tool (B, two clicks with Alt held so the massing snap stays out, Escape); 8.06 m, ground −1.12 m start→end | ground under each face at 25 stations; plane = ground under the start + stored offset | each face's foot and head, from a cross-section of the rendered mesh at each station | meets the ground at 50/50 face points, worst foot 3.0 cm, worst head 0.1 cm |
| Uphill wall, same way; 4.30 m, ground +0.38 m | same | same | foot = plane at 50/50 face points (buried up to 0.40 m), worst 0.1 cm, head 0.0 cm |
| Both walls | — | the stored node | `fillToTerrain` true; hosted on `ground` |
| Sun | NOAA's fractional-year formulae for `originLL` at `sunAt` (not the editor's port), turned into the scene frame: az 197.34°, alt 30.09° | the `eco-sun` light's direction | 0.061° apart; the pre-A5 conversion would be 111.4° away |
| Standing trees | the sent trees' positions and heights; the ground under each | instance matrices of the trunks and canopies | 12 of 12, at the sent positions; bases within 1.0 cm; heights within the 1 cm limit |
| Plan: contours | every whole metre the sent heights span: 17 levels, 412–428 m | every contour polyline in the plan's SVG | 17 levels drawn; 4,259 vertices, each on its level (worst 0.0000 cm) |
| Plan: survey, canopies | the sent boundary and trees | the plan's polylines and circles | exact (0 m) |

Why the walls are measured on their faces: upstream's fill samples the ground every 0.25 m along each face, so the faces' feet follow the slope. Its underside cap is an ear-cut of a long, thin strip, and it runs close to a chord between the wall's corners. A ray at the centreline measured that chord, 7.7 cm off the ground at mid-wall. The faces are what meets the ground and what the eye sees.

Tolerances:
- **5 cm** on ground heights. It covers the 1 cm terrain quantisation, the editor's interpolation against bilinear (trees: 1.0 cm), and the fill's 0.25 m sampling.
- **1°** on the sun. The two solar algorithms agree to 0.06°. A wrong frame or a wrong sign costs tens of degrees at this instant; that is why a low winter sun was chosen.

`--self-test` first runs everything, which must pass. It then re-sends the site as the editor would have drawn it wrongly: rows flipped north–south, north turned 180°, guides and trees mirrored. It judges the result against the original site, and every group failed:

| Group | Rejected with |
|---|---|
| walls | foot 161.4 cm off |
| sun | 119.82° off |
| trees | 80 m from where they were sent |
| plan | contour vertices up to 232.68 cm off their level |

### Runs

Chrome 154.0.8037.58, 28 Sep, one static build of this branch (check build):

- `check-a5-site`: **OK**; `--self-test`: **OK**.
- `check-a4-builder` on the same build: **OK**, and `--self-test` **OK**. The pages are still zero-outside and zero-404, and so is the IFC export. The H19 content case is unchanged: the same six CDN-only finishes.

## Commits

| Commit | What |
|---|---|
| `f48ecb17` | EcoSite gains standing trees and the world's sun instant |
| `9dca37fc` | the sun stands in the site's frame, at the instant the world sends |
| `a39fc867` | the site as reference layers — standing trees, contours, survey |
| `4a793ab1` | on a real site, a wall drawn on the ground stands on the slope |
| `12d7bea2` | check the site in the editor against the site as sent |

## Gate

Run on `12d7bea2`. Bun 1.4.2 is installed; the pin is 1.3.14.

| Check | Result |
|---|---|
| `bun run checks` | green. Biome: 2,677 files, 0 errors (19 warnings and 7 infos, lint preferences, none failing). Types: 16 of 16. |
| `bun run build` | green: 10 of 10 tasks |
| `check-a5-site`, and with `--self-test` | OK (above) |
| `check-a4-builder`, and with `--self-test` | OK on this branch's build |
| `check-lighting` · `check-h12` · plugin-eco `bun test src` (10) | OK |
| `check-h17-perf` · `check-h19-2` · `check-h19-2-guides` · `check-h19-2b` · `check-h19-2c` | OK, each with `--self-test` OK |
| `check-h17-1` | OK (no `--self-test` of its own; its shadow line is `check-h19-2c`'s) |
| `check-roundtrip` · `check-h10` · `check-scene-roundtrip` | fail, and fail identically on the A4 code: pre-existing, not A5 |

The other 17 headless eco checks pass.

## Open for the architect

1. **The world has to send `trees` and `sunAt`.**
   - They are in `bridge-types.ts`, which the world side copies verbatim.
   - The editor's local time for the slider is `America/Los_Angeles` (`ECO_DEFAULT_TZ`) whatever `originLL` is. The instant itself is exact.
2. **Walls drawn uphill.**
   - Upstream elects a terrain wall's plane at the ground under its first point.
   - Drawn from the high end, the wall's feet follow the slope to the ground everywhere.
   - Drawn from the low end, the wall stays flat and runs into the rising ground. On the steepest 12 m line across this pad (37%), its far end would sit 4.45 m below ground. That is more than a storey: the default level height is 2.5 m.
   - Electing the highest ground under the wall would give feet on the ground from either end. That changes every terrain wall upstream and how chained walls share one plane, so it is your call.
3. **The GLB and the walk flip z on export; the site context does not.**
   - `export-glb.ts` sets `design.scale.z = -1` ("Editor +z north → world +z south"), and `buildEcoWalk` negates z.
   - But the editor's scene is already the world frame. The ghost, the world's own massing GLB, goes in without a flip and lines up with the terrain and guides.
   - Unless the world flips eco designs back on import, a design drawn at the site's north boundary lands at its south boundary.
   - I have not changed the export. It needs the world's import behaviour and a round-trip check against it.
4. **Upstream's fill underside.** It is a chord between the wall's corners, a few cm off the ground between them (7.7 cm here). It is hidden below ground on convex ground. On concave ground it is enclosed by the faces, which do meet the ground.

## Carried

- **The `eco/h19` merge** (H19.2a) is still waiting on the human. `eco/h19-2`, `eco/a4` and `eco/a5` rebase onto it. Their pre-rebase heads will be pushed as `-prebase` branches.
- **A4's open items stand:**
  - the 235 CDN-only library files;
  - catalog Supabase URLs;
  - the capture origin env.
- **The `eco/a4` preview** (`dpl_CPCBpVBxRCnor5qrCmaXfjyTVBSx`) is READY. It serves `/decoders/NOTICE.md`, which only `copy-decoders.mjs` writes, so the decoder copy runs on Vercel's Bun 1.3.14 build.
- **`check-h0` rewrites the tracked `test/h0-two-rooms.glb`** each run. A sweep of the headless checks did so today, and I restored it to the committed bytes (16,612 B). `h0-*` stays untouched.
