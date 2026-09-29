# eco/1 — the bridge answers an allowlist

**Branch:** `eco/bridge-origins`, from `main` at `28002bcb`.
**Brief:** architect → A, 29 Sep, item 1.
**Merge:** the architect merges.

## Why

After A4 the bridge answered a single origin: `NEXT_PUBLIC_ECO_HOST_ORIGIN`, by default https://spatial-map.vercel.app. So E's done-checks from localhost, and E's Vercel previews, got silence.

## What changed

- **`packages/plugin-eco/src/eco-origins.ts`** (new, with no imports) holds the allowlist and a one-host gate. The allowlist, never "*":
  - `https://spatial-map.vercel.app`: the world in production;
  - `https://spatial-map-<name>-pauls-projects-af8162cc.vercel.app`: the world's previews in this team. The team suffix must match exactly, and `<name>` is lowercase letters, digits and hyphens;
  - `http://localhost[:port]` and `http://127.0.0.1[:port]`: local development.
- **`bridge.ts`** passes every valid eco/1 message through the gate.
  - The first allowed origin to say hello becomes the host.
  - Silence goes to foreign origins, and to any other allowed origin once a host is bound, hello included.
  - Every reply goes to the host's origin: the bridge's single `postMessage` targets `gate.host()`.
- **The build setting is gone:** `NEXT_PUBLIC_ECO_HOST_ORIGIN` is no longer read, and `eco-build.json` no longer records a `hostOrigin`. The A5 check no longer needs a special build.
- **`window.ecoHost`**, read-only, gives checks the bound host, beside the existing `window.ecoEmbedded`.

## The check — `packages/plugin-eco/test/check-bridge-origins.mjs`

It runs inside plugin-eco's `test` script, so CI runs it on every pull request.

- **29 origins.** Two independent answers must agree on each: the bridge's gate, and an oracle written here from the brief's words that reads each origin with `URL()`.
  - The table has the world, its previews, localhost and 127.0.0.1, plus 21 foreign or look-alike origins.
  - The look-alikes include: another team's suffix, the suffix followed by another domain, explicit ports, `http` to the world, uppercase, IPv6 loopback, `https://localhost`, `null` and `*`.
  - Result: 8 answered, 21 silent.
- **Session:**
  - after an allowed hello binds the host, another allowed origin gets silence, hello or not;
  - the host can say hello again;
  - replies target the host.
- **Source:** the bridge has exactly one `postMessage`, and its target is the bound host, never "*".
- **`--self-test`** forges three faults, and each is rejected:
  - a policy that also admits `https://evil.example`;
  - a gate that lets a second allowed origin take the session;
  - a bridge source that posts to "*".

## End to end — A4's `/builder` check, updated

The static server also listens on IPv6 loopback, which gives it an origin off the list.

- **Refused:** a hello from `http://[::1]:4173` gets no `eco:ready`, and the editor binds no host (`window.ecoHost` is null).
- **Accepted:** a hello from `http://localhost:4173` gets `eco:ready`, the editor's host is that origin, and the site the host then sends draws its guides.
- **Why the signal changed:** the refused case no longer asks for "no guides", because with nothing from the world the editor may open its demo site. The editor's own record of its host replaces that signal. That retires the saved-design caveat noted in `A4-A5-landing-done.md`.

## Results (static build of this branch, no host setting)

| Check | Result |
|---|---|
| `check-bridge-origins` + `--self-test` | OK: 29 origins agree (8 answered, 21 silent); session and source OK. The self-test rejects all three forgeries |
| `check-a4-builder` | OK. `[::1]`: no `eco:ready`, no host. `localhost`: `eco:ready`, host `http://localhost:4173`, guides drawn (1). Pages, IFC and content cases as before |
| `check-a4-builder --self-test` | OK |
| `check-a5-site` + `--self-test` | OK. The site is sent from localhost, with no special build; the self-test rejects forged walls, sun, trees and plan |
| plugin-eco `bun run test` | 10 pass, then the origin check and its self-test |
| `bun run checks` | 16 of 16 |

## Note for the architect: E's preview URLs

In the team's Vercel deployment list, the world's per-deployment preview URLs read `spatial-<hash>-pauls-projects-af8162cc.vercel.app`. Vercel shortened the project name there, so `spatial-map-*` does not match them. Its branch aliases, `spatial-map-git-<branch>-pauls-projects-af8162cc.vercel.app`, do match. If E's checks run from per-deployment URLs, widening the prefix to `spatial-` (team suffix unchanged) is a one-line change in `eco-origins.ts` and its check's oracle. It is the architect's call.
