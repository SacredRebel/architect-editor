# F3 done

Scene arrives editable: full `eco:scene` round-trip + generator docs.

## Built

- `eco-scene.ts` — serialize/restore Pascal graph extras: `ecoShells`, `ecoMaterials`, `ecoAssets` (stable sorted ids/keys).
- Bridge `eco:load-scene` / scene export use `exportEcoScenePayload` + `restoreEcoSceneExtras`.
- `docs/eco-scene.md` — field meanings, units, editor frame, worked two-room example.
- `test/check-scene-roundtrip.mjs` — walls (incl. curve), slabs, door, window, shell, asset, materials; load→export×2 identical.

## Verified

- `bun packages/plugin-eco/test/check-scene-roundtrip.mjs`
- `bun run check-types --filter=@eco/plugin-eco`

## Decision

Eco extras live beside the Pascal SceneGraph in the same JSON blob so the world writes one document. Round-trip equality uses key-sorted stringify so insertion order cannot flake the acceptance check.
