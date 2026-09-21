# H14 — photo and sketch → 3D through the atlas

## H13 status

**Skipped.** Searched `docs/plans/STATUS.md`, `ECO-DEVPLAN*`, `F0-done.md` /
`F0-loop`, `H1*` done/eval notes, and commit messages for `H13` / `H13.1–H13.3`.
No H13 brief or incomplete checklist exists in-repo. This brief’s former H13.4
work is delivered here as **H14**.

## What shipped

| Piece | Detail |
|---|---|
| Atlas client | `eco-atlas-image3d.ts` — config / submit / poll 5s / part fetch / join |
| Export budget | `eco-image3d-budget.ts` + `optimiseGlb('image3d')` — ≤5 MB, WebP ≤1024, **no Draco / no KTX2**, meshopt OK |
| Photo → prop | `EcoImage3dPanel` + asset `role: 'prop'` via H11 `prepareImage3dGlb` |
| Sketch → massing | Same panel, `kind: 'building'`, layer `eco-massing-refs`, opacity ~0.45, **locked**, UI says not walkable |
| Walk export | Massing placements `excludeFromWalkExport` — skipped in `addPlacedAssets` |
| PIN | Always required in UI + client; never hard-coded |
| Licence | Meshy **free tier → CC BY 4.0**; paid keeps rights (see below) |

Lighting contract untouched. No `MESHY_API_KEY` / local Meshy route — atlas holds the key.
Oak Leaf redesign still held.

## Licence note (Meshy)

Atlas image→3D currently exposes provider `meshy`.

- **Free / hobby tier outputs** are licensed **CC BY 4.0** (attribution required when redistributing).
- **Paid Meshy plans** keep commercial rights per Meshy’s then-current terms — the editor does not re-license those assets.

Always prompt for the atlas PIN (~30 credits/job).

## Checks

```bash
bun packages/plugin-eco/test/check-h14.mjs
bun packages/plugin-eco/test/render-h14-flows.mjs
```

Screenshots:

- `docs/plans/H14-photo-prop.png`
- `docs/plans/H14-sketch-massing.png`

## Also checked

- **H10 shell sliders** (leaf span, spine, rise, curvature) — already present in `eco-shell-panel.tsx` / `eco-shell-store.ts`.
- Embed / Vercel bones-dep: not re-run this pass; H14 is the priority. Tip on `main` already includes `21974aa9` (drop duplicate plugin-bones).

## Commit

`eco(H14): …`
