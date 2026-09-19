# F4 done

Snap wall/slab drafting to the Eco reference ghost (and site massing guides).

## Built

- **Core seam** `plan-snap-contributions.ts` — plugins register plan segments + horizontal bands; `snapToPlanContributions(point, { radius, suspended })`.
- **Eco** extracts GLB silhouette edges + floor bands (`extract-ghost-plan-edges.ts`), merges with `massing-outline` / `footprint` / `boundary` guides (`eco-ghost-snap.ts`), publishes while ghost is shown.
- **Wall + slab tools** (`packages/nodes`) apply the contribution after built-in snap; **Alt** suspends. Beacon shows on eco snap.
- Legend note for Alt-to-suspend.

## Verified

- `bun test packages/core/src/services/plan-snap-contributions.test.ts`
- `bun run check-types --filter=@eco/plugin-eco`
- Manual: load site with refGlb / massing-outline → wall tool → cursor sticks to outline within ~0.55 m; Alt frees.

## Decision

Plan forbids editing `packages/editor/**`; the snap seam lives in **core** and is consulted from **nodes** tools (not editor packages). Radius 0.55 m so a wall along a leaf edge lands on the edge (≪ 10 cm error once snapped).
