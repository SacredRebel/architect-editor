# E5 done

Walk mode in the Eco site panel: toggle loads `@react-three/rapier` + `ecctrl` lazily, spawns a floating capsule at the origin facing editor north (+Z), WASD / Shift run / Space jump / C first↔third person. Colliders: heightfield from site terrain (column-major) + cuboids for walls/slabs; flat ground fallback when no terrain. Constants match the world: walk 1.6, run 5.2, jump 5.4, gravity 18, capsule 1.8, eye 1.68. Exiting Walk restores the editor camera controls.

Files: `packages/plugin-eco/src/{eco-walk-store,eco-colliders,eco-walk,eco-presentation,eco-legend-panel,eco-ui}*`, deps `ecctrl@2.0.2` + `@react-three/rapier@2.2.0`.

Verified: `bun run check-types --filter=@eco/plugin-eco`. Manual: static build → draw a two-level box on the hill → Eco site → Walk → walk in / jump; C toggles camera; uncheck Walk returns editor camera.
