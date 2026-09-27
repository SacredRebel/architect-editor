# STATUS — Agent A
updated: 2026-09-27
phase: **H19.0a hygiene on `eco/h19`** — checks + build green; measurement next
state: Lane rule on main. Formatting + type gate landed on `eco/h19`. H19.0 measurement is next (change nothing else).

## Production SHAs (prior)

| Phase | Feature | Merge | Production |
|---|---|---|---|
| H17.0 | perf baseline | `972886b6` | READY |
| H17.1 | AdaptiveDpr / detect-gpu / shadows | `cf50c731` | READY |
| H18 | walk feel | `795317fb` | READY https://architect-editor-snowy.vercel.app |
| lane | `.cursor/rules/lane.mdc` | `5d061383` | on main (rules only) |

## H19.0a (this branch)

| Slice | Commit | Notes |
|---|---|---|
| format / import order | `1416c8d3` | Biome only; build green before/after |
| type + sole biome error | `3535b230` | geometry + editor app types |
| CI gate + `.cache/` ignore | this commit | `bun run checks` in CI |

Branch: `eco/h19` — verify head with `git rev-parse HEAD`

**READY meaning (from H19 on):** `bun run checks` **and** `bun run build` both green.

## What's next

1. **H19.0** — re-run H17.0 baseline harness; before/after table in `H17-done.md`.
2. H19.1 profile → H19.2 residuals → H19.3 navmesh → H19.4 character.

See `docs/plans/H19-done.md`.

commit: branch `eco/h19` (not merged)
queue: H19.0 measurement
