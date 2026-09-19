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
3. Confirm site arrives — **partially verified** (see Results)
4. Draw two rooms + door + one curved wall — **blocked in automation** (cross-origin iframe; needs human or world-side driver)
5. Send to world → walk in / through door / into wall / on floor — **not yet**

## Results

| Path | Status |
|---|---|
| Wrong host `architect-editor.vercel.app` | Misleading — do not use for Eco |
| `architect-editor-snowy.vercel.app/embed` | 200, `X-Matched-Path: /embed` |
| Live URL used | `https://spatial-map.vercel.app/?role=builder&builder=https://architect-editor-snowy.vercel.app/embed` |
| Studio opens | Yes — “the studio · Sulphur Mountain”, wall tool available |
| `eco:ready` | Yes — caps `site`, `scene`, `assets`, `glb` from snowy origin |
| Site sent | Yes — `world.studio.siteSent` = **97×97**, **9 guides** |
| Oak Leaf `refGlb` | Not confirmed in remaining `opts.site` (cleared after send); canvas looked empty of ghost — **needs visual confirm** |
| Draw → send → walk | **Not completed** — iframe is cross-origin; browser automation cannot drive walls/doors inside the embed |

### What looked right

- Builder role banner, studio overlay, correct embed URL via `?builder=`
- Handshake: `eco:ready` with full caps
- World records site send at 97×97 with 9 guides (survey-scale heightfield)

### What looked wrong / incomplete

- Studio canvas appeared empty (no obvious terrain guides / Oak Leaf ghost in the first screenshot after open). Possible camera/level issue or site apply not painting overlays — **verify before H1**.
- Full draw / export / walk-through still needs a human pass (or a world-side scripted driver).

## Local stand-in (still valid)

```bash
cd apps/editor && bun run build:static && npx serve out
# open http://localhost:3000/eco-host-harness.html
```

`bun packages/plugin-eco/test/check-roundtrip.mjs` — pass.
