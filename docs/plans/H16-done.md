# H16.0 — Temple forms (check and merge)

## Source

Branch `eco/h16-temple-forms` @ `6556fae6` — ActArtech MIT plugin vendored as
`packages/plugin-hagia-sophia` (from github.com/ActArtech/editor @ 9a6d5e74).

Credit: ActArtech — panel, README, LICENSE.

## Checks (Agent A)

| Check | Result |
|---|---|
| `cd packages/plugin-hagia-sophia && bun test` | **74 pass** / 0 fail |
| `tsc --noEmit` | green |
| `bun install --frozen-lockfile` | green (lockfile already lists workspace) |
| `bun run build --filter=editor` | green (local; npx bun@1.3.14 blocked by TLS on this agent) |

## Acceptance (code)

- Build palette kinds: `hagia-sophia:dome|arch|pier` + temple column — place tools present
- Temple forms rail: `composeDomedBay` → **13 parts**, one bay tag; Hagia Sophia core span **31.2 m**
- Arch proportion buttons in panel (`ARCH_FORMS`)
- True pendentives: geometry tests assert sphere of radius S/√2, meet ring at crowns

## Screenshot

![20 ft domed bay](./H16-domed-bay.png)

Generated via `bun packages/plugin-hagia-sophia/test/render-h16-bay.mjs` (13-part bay).

## Kind ids

Do **not** rename `hagia-sophia:*`. H16.1+ builds on `src/temple/proportions.ts`.

## Deployment

| Role | State | URL / SHA |
|---|---|---|
| Preview (`eco/h16-temple-forms`) | READY | https://architect-editor-c0zsi9rfd-pauls-projects-af8162cc.vercel.app (`89e9f172`) |
| Production | READY | https://architect-editor-snowy.vercel.app (`b611ed8a`) |

## Commit

Feature `6556fae6` · docs stamp `89e9f172` · merge `b611ed8a`
