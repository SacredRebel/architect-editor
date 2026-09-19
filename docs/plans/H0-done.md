# H0 done (partial) — live loop probe

## Repo drawn on

None (operational phase). Follows `docs/plans/F0-loop.md`.

## What happened

1. Confirmed Deployment Protection is no longer presenting a login wall on `architect-editor.vercel.app`.
2. Probed the embed paths the world needs: **`/builder/embed/` and `/embed` both 404** on production, while `/` and `/api/health` work. Local `bun run build --filter=editor` lists `○ /embed` — production looks stale or mis-rooted relative to `origin/main`.
3. World host URL (`?role=builder`) is not in this repo; candidate Vercel apps checked were unrelated.

## Fixes shipped toward unblocking

- `apps/editor/vercel.json` — rewrite `/builder/:path*` → `/:path*` so the world's `/builder/embed` URL hits `/embed` once that route is actually deployed.
- `apps/editor/next.config.ts` — default `NEXT_PUBLIC_ECO=1` so the Eco plugin registers without a dashboard env var.
- `docs/plans/F0-loop.md` — Results table updated with the live probe.

## Still blocked on

- A **fresh Vercel deploy** of `origin/main` that actually serves `/embed` (and thus `/builder/embed` via rewrite).
- The **world production URL** from Sacred Rebel so the studio → draw → send → walk checklist can be completed and the Results table filled with a real walk-through.

## Acceptance

Not met yet — no live door/wall/floor walk-through. Do not start H1 until this passes.
