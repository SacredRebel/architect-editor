# F0.3 / H0 — against the real world (loop log)

## Status (2026-09-19, H0)

**Deployment Protection:** appears **off** — `https://architect-editor.vercel.app/` loads the editor (no login wall).

**New blocker found while probing for H0:**

| URL | Result |
|---|---|
| `https://architect-editor.vercel.app/` | 200 — editor shell (“No buildings yet”) |
| `https://architect-editor.vercel.app/api/health` | 200 |
| `https://architect-editor.vercel.app/privacy` | 200 |
| `https://architect-editor.vercel.app/embed` | **404** |
| `https://architect-editor.vercel.app/builder/embed/` | **404** (308 → `/builder/embed` → 404) |
| `https://architect-editor.vercel.app/scenes` | **404** |
| `https://architect-editor.vercel.app/import` | **404** |

The world iframes **`/builder/embed/`**. That path is not on the live deploy, so the `eco/1` handshake cannot start even with Protection off. Routes exist on `origin/main` (`apps/editor/app/embed` since E1) — production looks like an incomplete or stale build / wrong project root, not a Protection issue.

**Also needed from owner:** the **world** production URL (`?role=builder` → house → 🏗 studio). It is not in this repo; probes of `eco-atlas` / `lemurialife` / `eco-village` were unrelated products.

## Checklist (run when embed is live + world URL known)

1. Open the world with `?role=builder`, walk to the house, press **🏗 studio**
2. Confirm the site arrives — 97 × 97, survey boundary, Oak Leaf as ghost
3. Draw two rooms with one door (**one wall curved** — F1 through the real bridge)
4. **Send to world**
5. **Walk into it. Go through the door. Walk into a wall. Stand on the floor.**

## Local stand-in (available now)

```bash
cd apps/editor && bun run build:static && npx serve out
# open http://localhost:3000/eco-host-harness.html
```

Headless: `bun packages/plugin-eco/test/check-roundtrip.mjs`.

## Results so far

| Path | Status |
|---|---|
| `check-roundtrip.mjs` | Pass (2026-09-19) |
| Host harness (manual) | Ready after static build |
| World studio live | **Blocked** — `/builder/embed` 404 on `architect-editor.vercel.app`; world URL TBD |

### Live probe notes (H0 attempt)

- Protection no longer shows a login wall on the editor origin.
- Cannot complete studio → draw → send → walk until `/builder/embed` (or a rewrite to a working `/embed`) is served and the world host URL is known.
- No walk-through of door/wall/floor yet — iframe never mounts.
