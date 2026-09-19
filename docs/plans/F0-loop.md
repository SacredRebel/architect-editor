# F0.3 — against the real world (loop log)

## Blocker (owner action)

The world's studio loads `/builder/embed/`. That is currently blocked by **Vercel Deployment Protection** on the `architect-editor` project — the iframe gets a login wall and the `eco/1` handshake never starts.

**Owner:** Settings → Deployment Protection → switch off for this project (or allow the world origin).

Until that is done, step 5 of the real-world checklist cannot run.

## Checklist (run when Protection is off)

1. Open the world with `?role=builder`, walk to the house, press **🏗 studio**
2. Confirm the site arrives — 97 × 97, survey boundary, Oak Leaf as ghost
3. Draw two rooms with one door
4. **Send to world**
5. **Walk into it. Go through the door. Walk into a wall.**

Record what happened here — including anything that looked right and was not. Fix before F1.

## Local stand-in (available now)

```bash
cd apps/editor && bun run build:static && npx serve out
# open http://localhost:3000/eco-host-harness.html
```

Harness knocks hello → loads realistic site → draw in embed → **Request eco:glb** → inspect SVG walk rings + log.

Headless data path: `bun packages/plugin-eco/test/check-roundtrip.mjs` (caps, terrain ±1 cm, two-room door gap, z-south, extras.walk).

## Results so far

| Path | Status |
|---|---|
| `check-roundtrip.mjs` | Pass (2026-09-19) |
| Host harness (manual) | Ready to exercise after static build |
| World studio live | **Blocked** — Deployment Protection |

_No live walk-through notes yet — waiting on Protection off._
