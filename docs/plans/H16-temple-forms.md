# H16 — Temple forms (landed by the architect, not by Agent A)

ActArtech's Hagia Sophia plugin (MIT) is in `packages/plugin-hagia-sophia`, with:

- Build palette: **Dome, Arch, Pier, Temple column** (click to place at house scale, R / T turn)
- Rail panel **Temple forms**: a domed bay at any span (ft or m), Byzantine or own springing,
  hemisphere / saucer / golden dome, optional window ring, turned to any bearing; the Hagia
  Sophia core at true size; Roman / Gothic / golden / segmental arch and dome proportions for
  what is selected; select the whole bay
- True pendentives (`squareSide`), cut from the sphere whose sections are the arches
- Inspector fields for every kind

Checks: `cd packages/plugin-hagia-sophia && bun test` (74), `tsc --noEmit`.

Agent A: this package is yours to maintain from here. Do not rename the `hagia-sophia:*` kinds.
The next geometry work (the universal geometry kit, H16.1+) builds on `src/temple/proportions.ts`.
