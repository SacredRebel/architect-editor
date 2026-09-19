# H0 status — live loop (in progress)

## Repo drawn on

None (ops). Notion: **Map & Editor — Assets & Tools** (`collection://30011dde-35d4-4dbd-a520-e910b31c8c9f`).

## Correction

Production editor is **`architect-editor-snowy.vercel.app`**, not `architect-editor.vercel.app`. Deploy of `c63bcae0` is live. Check `x-matched-path`, not page HTML for 404s.

## Verified live (2026-09-19)

URL:
`https://spatial-map.vercel.app/?role=builder&builder=https://architect-editor-snowy.vercel.app/embed`

| Check | Result |
|---|---|
| World loads, builder banner | OK |
| 🏗 studio opens snowy `/embed` | OK |
| `eco:ready` + caps `site,scene,assets,glb` | OK |
| Site sent 97×97, 9 guides | OK (`world.studio.siteSent`) |
| Visual guides / Oak Leaf ghost in studio | Unclear — canvas looked empty |
| Draw two rooms + curved wall + door | Not done (cross-origin iframe) |
| Send to world + walk door/wall/floor | Not done |

## Notion Planned + High (DEVPLAN-04 set)

Queried Status=Planned, Usefulness=High:

| Name | Maps to |
|---|---|
| pascalorg/skills (glb-web-export) | H1 |
| pascalorg/plugin-trees | H2 |
| ggooonn/Diffusion-Masterplanning | H9 |
| Mojang/ore-ui (@react-facet) | H4 |
| pascalorg/plugin-boots | H7 |
| aedifex | H5 |
| majidmanzarpour/threejs-game-skills | H8 |
| ecctrl | already E5; still Planned in DB |
| monolith-terrain, jt-gelflow | Track B/C (world / shop) |

Bones / articraft rows not in that Planned+High slice (different Status) — still named in DEVPLAN-04 as H3 / H6.

## Next

Human (or world-side automation): in the open studio, draw two rooms + one door + one curved wall → Eco panel **Send to world** → walk the building. Then fill the remaining Results rows and mark H0 accepted before H1.
