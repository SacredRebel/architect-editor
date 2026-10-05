# PORT-NOTE — a function of the Pascal-fork editor carried into the map by logic   (`/port-note`)

Input: a function of this repository's editor (`packages\core`, `packages\editor`, `apps\editor`, `packages\plugin-eco`)
that the map does not have. Output: one entry in `C:\Playground\Spatial Map\spatial-map\ports\FROM-ARCHITECT-EDITOR.md`.

1. **Is it missing?** Read `C:\Playground\agents\FUNCTION-INVENTORY.md` and `BUILD-MODE-SPEC.md`; grep the map
   (`godot\scripts\*.gd`, `godot\ui\*.gd`, `godot\ui\ports\*.gd`) for it. Read the note's existing entries (never repeat).
2. **Read the source** — the function's own code, its numbers and rules; not the docs' summary.
3. **Write the entry** in the note's own shape: number (next free), name, where it lives in the fork (files, functions),
   the logic in plain words with every number, a reference case (inputs → the outputs the fork gives), and what the map
   has today. The entry is a spec E/U can build from without reading TypeScript.
4. **A reference case that can fail** — where the note has a refcase check (`ports\refcases\`, `bun ports/refcases/
   verify.ts --self-test`), add the case's numbers there too.
5. **Commit in the map's repository: only this file** — `git --no-optional-locks -C "C:\Playground\Spatial Map\spatial-map"
   add ports/FROM-ARCHITECT-EDITOR.md` then commit that path as Sacred Rebel; no push there.
6. **Record** — the entry numbers in the report and the root UPDATES line.
