# CI — the quality job goes green

Branch `eco/ci`, from `main` at `c1316e1d`. Asked for by the human on 28 Sep, after the demo merge.

## What was red

- **Runs:** GitHub Actions `CI / quality` failed on every push to `main` since the workflow's first run on `121d1ebc` (H19.0a): runs #2, #3, #5, #7 and #8.
- **Vercel was not affected:** every production deployment was READY.
- **The failing step was Test** (`bun run test`, which is `turbo run test`):
  - `@pascal-app/plugin-geometry` has no test files, and `bun test` exits 1 when it finds none.
  - Turbo stops at the first failed task, so the other packages' tests were cut off.
  - The Build step never ran.

## The fix (`8571285c`)

`plugin-geometry`'s `test` script now runs the check it already had, `test/check-h16-geometry.mjs` (H16.1). The check covers:
- the 20 forms at three sizes;
- the 11 tilings;
- the banned labels.

Any failed assertion throws, so the script exits 1.

## Result on Linux (pull request #4, CI run #9)

| Job | Result |
|---|---|
| quality | **success**, 4 m 31 s: Checks 1 m 40 s · Test 1 m 29 s (18 packages) · Build 1 m 2 s |
| cli-smoke | success, 4 m 14 s |

The preview for `8571285c` is READY: `dpl_FFSfaMmDCgxKF3F6tJZ53iZiAdZh`.

## Why the tests fail on this machine and pass in CI

On this machine (Windows, Bun 1.4.2), 38 tests in 6 packages fail. These are the "38 pre-existing failures" in `demo-done.md`. CI runs the same tests on Linux with Bun 1.3.14, and they pass there. Each cause below was checked in the local run:

| Cause | Tests |
|---|---|
| The checkout path has spaces and `&`. A file URL built from `import.meta.url` becomes `/C:/AI-Work/Ai%20apps%20&%20Codebase/…`, which Windows cannot open or resolve from. | editor 19 · nodes 5 · core 2 · viewer 1 |
| POSIX-only behaviour: file modes, executable bits, symlinks, process identity, and a temp folder Windows keeps locked. | cli 7 |
| The IFC fixtures were checked out as CRLF before `.gitattributes` set LF. Restored from git as LF, the beam test passes 8 of 8. | ifc-converter 2 |
| One test spawns the Bun from an old WinGet install that no longer exists. | nodes 1 |
| The rendered-exits shelf test failed only in the full parallel run; alone it passes 109 of 109. | nodes 1 |

So the failures come from this machine, not from the code.

## Merge

- **Order:** merge commit to `main` once this commit's preview is READY; production READY is recorded after that.
- **Commits:** `8571285c` is the fix. This done-file and the STATUS entry are the next commit.
