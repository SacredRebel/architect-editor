# H0 status — live loop (in progress)

## Repo drawn on

None (ops + camera frame). Notion inventory: `docs/plans/notion-assets-planned-high.md`  
(`collection://30011dde-35d4-4dbd-a520-e910b31c8c9f`).

## Correction

Production editor is **`architect-editor-snowy.vercel.app`**, not `architect-editor.vercel.app`. Deploy of `c63bcae0`/`7ab58ac0` is live. Check `x-matched-path`, not page HTML for 404s.

World default iframe still same-origin `/builder/embed/` — use until world ships permanent fix:

`https://spatial-map.vercel.app/?role=builder&builder=https://architect-editor-snowy.vercel.app/embed`

## Verified live (2026-09-19)

| Check | Result |
|---|---|
| World loads, builder banner | OK |
| 🏗 studio opens snowy `/embed` | OK |
| `eco:ready` + caps `site,scene,assets,glb` | OK |
| Site sent 97×97, 9 guides, refGlb ~2.15 MB | OK (`opts.site()`) |
| Massing on terrain patch | OK |
| Visual guides / ghost in studio | Empty viewport — camera not framed (bug) |
| Frame fix in plugin-eco | `applyEcoSite` → `camera-controls:fit-scene` on massing |
| Draw two rooms + curved wall + door | Not done (cross-origin iframe) |
| Send to world + walk door/wall/floor | Not done |

## Notion Planned + High → phases

See `notion-assets-planned-high.md`. Short path: H1 skills, H2 trees, H3 bones (bones is Evaluated/Medium in Notion but still H3).

## Next

1. Deploy frame fix to snowy.
2. Re-open studio — confirm guides + Oak Leaf ghost visible.
3. Human: draw two rooms + door + one curved wall → **Send to world** → walk building.
4. Fill remaining Results; accept H0 before H1.
