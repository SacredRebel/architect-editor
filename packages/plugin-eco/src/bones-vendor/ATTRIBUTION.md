# Bones engine vendor (MIT)

Vendored pure framing/takeoff modules from [pascalorg/plugin-bones](https://github.com/pascalorg/plugin-bones)
at git SHA `5679260261ee1c733656ff6dfb99e30bb24b58a7` (same pin as `@pascal-app/plugin-bones` in this package).

**Included (loaded when Construction panel opens):** `computeLevel`, `computeTakeoff`,
`FramingNode` parse, and their pure dependency closure + engine JSON tables under
`data/` (framing-tables, fastening-schedule, wall-assemblies, mep-rules, lgs-profiles, …).

**Eco default jurisdiction:** Ventura County is **inlined** in
`src/jurisdiction/profiles.ts` (`VENTURA_PROFILE`) from
`packages/plugin-eco/data/jurisdiction/ventura-county.json`. National
`jurisdictions-climate.json` / `jurisdictions-adoption.json` remain in `data/` for
upstream parity but are **not imported** on the Eco default load path.

**Excluded:** React panels, renderers, placement tools, store, and other UI.

**Load timing:** Eco bridges these via dynamic `import()` in `eco-bones-engines.ts`
so the editor page-open chunk does not pay for the construction engines closure.

See `LICENSE` (Copyright (c) 2026 Julien Brissonneau).
