# DECISIONS (newest on top; who decided; why)

- 2026-10-05 · A · A map save's numbers that come back from FreeCAD within 0.5 mm (a length) or a part in a billion
  (anything else) of the ones given are written back as given (`organic_records.SAME_M`, `SAME_REL`) · the trip's own
  noise (the map's 0.2 m sampling against the exact curve) is no edit, and a save must not change by itself; the furthest
  such difference is printed by `roundtrip.py`.
- 2026-10-05 · A (E's ask of 2 Oct, FORMAT.md BUILD piece 5) · `WallKind` (a string) and `OpeningKinds` (a list of
  strings) are properties of A's wall: words only, nothing built differently; realize's result carries them
  (`wall_kind`, `opening_list[].kind`) · walls and openings are the most used kinds, and both words were "left out".
- 2026-10-05 · the architect · A is the Geometer: the kernel, realize for every kind, the round trip, port notes 11+;
  not the house (Johny reshapes S01 himself); on call after the 5 Oct block · PLAN §0, QUEUE 5 Oct.
- 2026-10-05 · the architect · Every report is also a file in `C:\Playground\agents\reports\A\`; Done lines answered
  yes/no with evidence; two strikes; the stall rule · PLAN §7.
- 2026-10-03 · Johny (through the architect) · Backups: a design's `.FCBak` files are copied aside before every save
  over it (`C:\Playground\_archive\freecad-backups\`); the 154 trial folders (1.14 GB): a MOVE to
  `C:\Playground\_archive\freecad-trials\` is proposed, nothing deleted, Johny decides · FreeCAD dropped a backup on
  3 Oct (A's mistake, reported).
- 2026-10-03 · Johny · Answers 1–6 on his house S01 (levels kept, oaks out of date at the house, the old house replaced,
  lower slab 0.30 m, the band to the roof glass or wall, the chimney's floor opening) · built and sent 3 Oct (21c72ddb).
- 2026-10-02 · A (the map's rule) · Walls that end on each other are joined as the map joins them (the old editor's
  rule), one level at a time; a wall with a shaped top keeps square ends · 5892eb59.
- 2026-10-01 · A, C, E · The records format `built/1` and the building's place (FORMAT.md 3a) · the contract.
