# F2 done

Shell roofs (Oak Leaf leaves) as Eco plugin geometry.

## Built

- `eco-shell-store` + **Add leaf shell** in Eco panel (26×13 demo: eave 3 m, ridge to 9.8 m).
- `eco-shell-geometry` — ridge→outline strips, smooth curl height, two-sided thickness, optional ribs.
- Rendered in presentation (`EcoShells`); **no Walk colliders**.
- GLB export includes shell meshes; **walk solids stay empty** for shells.
- `test/check-shell.mjs` — bbox ±10 cm, zero solids.

## Verified

- `bun packages/plugin-eco/test/check-shell.mjs`
- `bun run check-types --filter=@eco/plugin-eco`

## Decision

Shells live in the plugin store (not Pascal roof nodes) so F2 stays inside `plugin-eco` and never pollutes walk solids. A walkable terrace is a separate slab the user places.
