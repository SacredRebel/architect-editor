# STATUS — Agent A
updated: 2026-09-27
phase: **H19.0 measured on `eco/h19`** · next H19.1 profile
state: Hygiene on main (READY = checks + build). After numbers captured; residual p1 for H19.1.

## Production SHAs

| Phase | Feature | Merge | Production |
|---|---|---|---|
| H17.0 | perf baseline | `972886b6` | READY |
| H17.1 | AdaptiveDpr / detect-gpu / shadows | `cf50c731` | READY |
| H18 | walk feel | `795317fb` | READY https://architect-editor-snowy.vercel.app |
| lane | `.cursor/rules/lane.mdc` | `5d061383` | on main |
| **H19.0a** | hygiene (format · types · CI checks · LF) | **`121d1ebc`** | READY https://architect-editor-snowy.vercel.app · Vercel success on merge · preview `eco/h19` 200 |
| **H19.0** | re-measure (before/after) | on `eco/h19` | measurement only — docs + harness + `h19-0-after.json` |

PR: https://github.com/SacredRebel/architect-editor/pull/1 (merge commit, not squash)

H19.0a commits kept in history: `1416c8d3` format · `3535b230` types · `992bf63e` CI/LF · `3039f529` overlay null (no invented scale)

## H19.0 numbers

| Metric | Before | After |
|---|---|---|
| FPS median | 14.99 | **59.88** |
| FPS p1 | 12 | **30.12** |

## Gate

| Check | Result |
|---|---|
| `bun run checks` | green (required for READY) |
| `bun run build` | green |
| `check-h17-perf` | before + after OK |
| Preview | READY branch alias eco-h19 |
| Production | READY `121d1ebc` |

## What's next

1. **H19.1** — profile (before H19.2 chooses)
2. H19.2 → H19.3 → H19.4

commit: main `121d1ebc` · H19.0 on `eco/h19`
queue: H19.1 on `eco/h19`
