# Temple forms (`@pascal-app/plugin-hagia-sophia`)

Domes, arches, pendentives, piers and columns for the editor, and a domed bay at any size.

## Where it comes from

The five kinds and their geometry are **ActArtech's** Hagia Sophia plugin, taken from
[ActArtech/editor](https://github.com/ActArtech/editor) branch `feat/hagia-sophia-ground-floor`
at commit `9a6d5e74` (MIT, like the editor it forks). Their research dossier and design notes
are in [`docs/`](./docs). The kind ids (`hagia-sophia:*`) are unchanged, so scenes and MCP
scripts written for their plugin still load.

What was added here:

| | |
|---|---|
| `src/temple/proportions.ts` | the domed bay composed from one sphere; arch forms (Roman, Gothic equilateral, golden, segmental); dome shapes (hemisphere, saucer, golden); the true pendentive grid |
| true pendentives | `squareSide` on the pendentive: the corner of the sphere of radius side/√2, whose sections are the four arches' soffits. Unset, the pendentive is ActArtech's octant, as before |
| `src/temple/place-tool.tsx`, `tools/` | click-to-place for dome, arch, pier and column from the Build palette, at house scale; R / T turn |
| `src/temple/parametrics.ts` | the inspector: every dimension, with a round arch kept round as its span changes |
| `src/temple/panel.tsx` | the **Temple forms** rail panel: place a domed bay at any span and bearing, the Hagia Sophia core at true size, classic proportions for a selected arch or dome |
| floor plans | the pier plan now turns the same way as the pier; the true pendentive draws its corner |

## The bay

Four piers stand on the corners of a square of side S. The sphere of radius S/√2, centred on the
square at the springing line, meets each wall of the square in a semicircle of radius S/2: those
are the round arches' soffits. It meets the level plane S/2 above the springing in the circle of
radius S/2: the dome stands there. The rest of the sphere inside the square is the four
pendentives. The Byzantine proportions (springing at 0.742 S, piers 0.385 S) come from the
Hagia Sophia figures in ActArtech's constants; a custom springing height can replace them.

## Checks

`bun test` in this package: ActArtech's 58 checks and 16 more for the bay, the proportions and the
true pendentive.
