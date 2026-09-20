# F0.3 / H0 — against the real world (loop log)

## Hosts (corrected 2026-09-19)

| Role | URL |
|---|---|
| World | `https://spatial-map.vercel.app/` |
| Editor (production) | `https://architect-editor-snowy.vercel.app/` — **not** `architect-editor.vercel.app` |
| Studio iframe (world default since `1baefa4`) | `https://architect-editor-snowy.vercel.app/embed` |
| Override | `?builder=` still works if needed |

**404 check:** use the `x-matched-path` response header. Do **not** grep the body for “This page could not be found” — that string is in the RSC payload of every page, including `/`.

## Checklist

1. Open world with `?role=builder` — **done** (iframe points at snowy `/embed` by default)
2. Walk to house, press **🏗 studio** — **done**
3. Confirm site arrives — **done** (payload + handshake)
4. Draw two rooms + door + one curved wall — **blocked in automation** (cross-origin iframe)
5. Send to world → walk in / through door / into wall / on floor — **not yet**
6. Optional: `window.world.probeModel(url)` on the exported GLB — confirm `{ floors, solids }` match what was drawn

## Results

| Path | Status |
|---|---|
| Wrong host `architect-editor.vercel.app` | Misleading — do not use for Eco |
| `architect-editor-snowy.vercel.app/embed` | 200, `x-matched-path: /embed` |
| Live URL | `https://spatial-map.vercel.app/?role=builder` (builder override only if needed) |
| Studio opens | Yes — “the studio · Sulphur Mountain”, wall tool available |
| `eco:ready` | Yes — caps `site`, `scene`, `assets`, `glb` from snowy origin |
| Site sent | Yes — `world.studio.siteSent` = **97×97**, **9 guides**, step 1.5 m, `originOffsetM [-72,72]` |
| Oak Leaf `refGlb` | Yes in live `opts.site()` — ~2.15 MB base64 |
| Massing outline | World-local bbox ≈ x∈[-18,25] z∈[-15,26] (on terrain) |
| Studio canvas | Camera fit via `camera-controls:fit-scene` after massing load |
| Draw → send → walk | **Not completed** — needs human pass |

### What looked right

- Builder role banner, studio overlay, correct embed URL
- Handshake: `eco:ready` with full caps
- Live site payload: 9 guides + refGlb

### What looked wrong / incomplete

- Full draw / export / walk-through still needs a human pass
- Until then we do not know exported walk data matches what was drawn — `probeModel` is the check once a URL exists

## Notion (DEVPLAN-04 tool set)

Filter **Status=Planned** + **Usefulness=High** on [Map & Editor — Assets & Tools](https://app.notion.com/p/0228b7fa879e474f89f5efdf9a955d0e) → see `docs/plans/notion-assets-planned-high.md` (10 rows). Bones/articraft sit outside that filter (Evaluated/Medium, Watch/Low) but remain H3/H6.

## Local stand-in (still valid)

```bash
cd apps/editor && bun run build:static && npx serve out
# open http://localhost:3000/eco-host-harness.html
```

`bun packages/plugin-eco/test/check-roundtrip.mjs` — pass.

## H12 (materials / presentation)

Baseline PNGs: `docs/plans/h12-baseline/{before,after}.png`. See `H12-done.md`.
Leaf shell compat **161 816 → 220 984** (still under 500 KB without meshopt).
