# H16 — Temple forms + universal geometry kit

## H16.0 — Temple forms

Branch `eco/h16-temple-forms` → merge `b611ed8a`. ActArtech MIT plugin as
`packages/plugin-hagia-sophia` (dome, arch, pendentive, pier, column + Temple forms panel).

| Check | Result |
|---|---|
| `bun test` in plugin-hagia-sophia | **74 pass** |
| production | READY at https://architect-editor-snowy.vercel.app (`b611ed8a`) |

Screenshot: ![20 ft domed bay](./H16-domed-bay.png)

Do **not** rename `hagia-sophia:*` kind ids. Credit ActArtech in panel / README / LICENSE.

## H16.1 — Universal geometry kit

Branch `eco/h16-1-geometry` → merge `46ca57b9` (feature `be4929ce`).

Package `packages/plugin-geometry`: 20 plain-named construction forms, Geometry rail panel,
place / bearing / lock, plan-snap, walls-from-figure, user forms, 3D construction lines,
**floorplan 2D overlay**, **drag scale handle** (2D + 3D), fuller **13 Archimedean** vertex sets.

| Check | Result |
|---|---|
| `bun packages/plugin-geometry/test/check-h16-geometry.mjs` | **OK** (20 forms, 13 Archimedean, 11 tilings) |
| `bun install --frozen-lockfile` + `bun run build --filter=editor` | green (local bun; npx bun@1.3.14 TLS-blocked on agent) |
| preview (`be4929ce`) | READY branch alias `architect-editor-git-eco-h16-1-geometry-…` |
| production | READY https://architect-editor-snowy.vercel.app (`46ca57b9`) |

### Deferred

- **Soap-film / minimal surface on a closed curve** — reuses H15.3’s generator (placeholder guide in kit until then).

### Banned UI labels

No “sacred”, “divine”, Flower of Life, Metatron, Seed of Life, vesica piscis, or Platonic as labels
(keywords only). Enforced by `check-h16-geometry`.

## Later (after H15)

H16.2 catenary arches · H16.3 curved solids · H16.4 VR · H16.5 IFC + envelope — see the H16 brief;
queued notes in `H17-H18-queued.md`.
