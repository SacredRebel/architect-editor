# F0.3 / H0 — against the real world (loop log)

## Hosts (corrected 2026-09-19)

| Role | URL |
|---|---|
| World | `https://spatial-map.vercel.app/` |
| Editor (production) | `https://architect-editor-snowy.vercel.app/` — **not** `architect-editor.vercel.app` |
| H0 override (until world ships permanent fix) | `?role=builder&builder=https://architect-editor-snowy.vercel.app/embed` |

Note: `/embed` on snowy returns **200** with `x-matched-path: /embed`. Earlier 404 conclusions from the wrong host were incorrect (RSC payload contains a not-found string on every page).

## Checklist

1. Open world with `?role=builder` (+ builder override) — **done**
2. Walk to house, press **🏗 studio** — **done** (iframe `architect-editor-snowy.vercel.app/embed`)
3. Confirm site arrives — **done** (payload + handshake)
4. Draw two rooms + door + one curved wall — **blocked in automation** (cross-origin iframe)
5. Send to world → walk in / through door / into wall / on floor — **not yet**

## Results

| Path | Status |
|---|---|
| Wrong host `architect-editor.vercel.app` | Misleading — do not use for Eco |
| `architect-editor-snowy.vercel.app/embed` | 200, `X-Matched-Path: /embed` |
| Live URL used | `https://spatial-map.vercel.app/?role=builder&builder=https://architect-editor-snowy.vercel.app/embed` |
| Studio opens | Yes — “the studio · Sulphur Mountain”, wall tool available |
| `eco:ready` | Yes — caps `site`, `scene`, `assets`, `glb` from snowy origin |
| Site sent | Yes — `world.studio.siteSent` = **97×97**, **9 guides**, step 1.5 m, `originOffsetM [-72,72]` |
| Oak Leaf `refGlb` | Yes in live `opts.site()` — ~2.15 MB base64 |
| Massing outline | World-local bbox ≈ x∈[-18,25] z∈[-15,26] (on terrain) |
| Studio canvas | First pass looked empty — **camera not framed** on site (default pose at empty space). Fix: `applyEcoSite` emits `camera-controls:fit-scene` onto massing-outline |
| Draw → send → walk | **Not completed** — needs human (or world-side driver) after frame fix deploys |

### What looked right

- Builder role banner, studio overlay, correct embed URL via `?builder=`
- Handshake: `eco:ready` with full caps
- Live site payload: 9 guides (boundary, 2×easement, 3×footprint, 2×road, massing-outline) + refGlb

### What looked wrong / incomplete

- Empty studio viewport until camera fit (fixed in plugin-eco; needs snowy redeploy)
- Full draw / export / walk-through still needs a human pass

## Notion (DEVPLAN-04 tool set)

Filter **Status=Planned** + **Usefulness=High** on [Map & Editor — Assets & Tools](https://app.notion.com/p/0228b7fa879e474f89f5efdf9a955d0e) → see `docs/plans/notion-assets-planned-high.md` (10 rows). Bones/articraft sit outside that filter (Evaluated/Medium, Watch/Low) but remain H3/H6.

## Local stand-in (still valid)

```bash
cd apps/editor && bun run build:static && npx serve out
# open http://localhost:3000/eco-host-harness.html
```

`bun packages/plugin-eco/test/check-roundtrip.mjs` — pass.
