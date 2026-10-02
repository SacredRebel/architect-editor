# NEW — for Johny, from lane A (FreeCAD) (newest on top; clear what you have read)

## 2 Oct, 03:40 — your house (concept S01) is built from your spec and stands in the map's folder

Built from the numbers of `oak_canopy_S01.json`, nothing redesigned: 31 walls with their 50 openings, three floors,
the chimney, the three roof leaves with the two courtyards and the chimney's cut.
- Open it in FreeCAD: `Documents\SulphurMountain\Oak-Canopy-S01.FCStd`.
- Pictures (plans, four elevations, two views): `Architect-editor\docs\plans\organic\house\`.
- In the map's folder: `exchange\godot\oak-canopy-s01.glb` (+ `.ifc`, `.json`). The chimney is on the old chimney,
  north is true north, the main floor is level with the ground at the chimney.

**Seven things only you can decide** (each with what was measured):

1. **The land is flatter than the concept assumes.** By the map's own terrain the ground at the foot of your entrance
   stair is 1.0 m below the main floor (the concept: 3.0 m), at the motor court 1.2 m, and along the north side, where
   the three suites have their doors, 1.1 to 1.3 m. So the lower floor lies 1.7 to 2.9 m in the ground, and each suite
   door's sill is 1.7 to 1.95 m below the land in front of it. Lift the house, cut the ground for the drive and the
   suite fronts, or change the lower floor: which?
2. **Oaks.** At this place 69 % of the house's plan lies under what the land data marks as protected oak canopy (trees
   up to 13.7 m, plus 1.5 m). Your spec places no tree. Move or turn the house to the real trees? I can lay the canopy
   outline under the plan for you.
3. **It stands on the old house** (9 % of its plan): that is the concept. Right?
4. **Lower floor slab:** your spec gives 0.30 m for the main floor and the mezzanine and nothing for the lower floor. I
   made it 0.30 m. Right?
5. **Between the walls and the roof:** your wall-top numbers end 0.76 m below the roof's top. The roof skin is 0.38 m, so
   0.38 m stays open under it all round: the height of the ribs. What closes it between the ribs: glass, or the wall up
   to the skin?
6. **The chimney goes through the main floor slab** (they share 3.4 m³): the spec lists no cut. Cut the floor round it?
7. **What next?** Not built yet: the roof's ribs and edge beams (your numbers are enough: 18 + 10 + 10 ribs; say the
   word); the nine columns (places given, no size or height); the two stairs (the straight one tapers from 4.5 to
   3.6 m; the curved one needs a new kind of piece); the glass ribbon between the south leaf and the two north leaves
   (the gap is open now); the pool pavilion's roof and everything outdoors.

Checked two ways: against your spec, solid by solid (every wall face within 1.2 mm, every opening's edges within
0.5 mm, floors 366.67 / 107.97 / 51.18 m² against your 366.7 / 108.0 / 51.1, roof tops within 2 cm of your own
samples), and by 19 deliberately wrong pieces that the check had to refuse, and did.

## 2 Oct, 00:35 — report of the night of 1 Oct (it was never pasted to the architect: here it is, short)

Commits `d2e418c7` (the work), `59f05a4f`, `d6b0e169` on `eco/organic`, pushed as a backup. Nothing on `main`.

**What works**
- **All 27 buttons were pressed in FreeCAD's real window**, each with real clicks. One picture each:
  `Architect-editor\docs\plans\organic\buttons\`. The numbers are the same as without the window.
- Four faults showed only in the window and are fixed. The one that mattered: a wall with a waved or arched top was
  sometimes not cut at all and still called fine (24 of 120 trial walls). Such a wall is now refused, not drawn.
- **Your quick start**: `Architect-editor\freecad\QUICKSTART.md` (also `exchange\house\QUICKSTART-FreeCAD.md`). One
  page with pictures, from an empty FreeCAD to a building in the map.
- **What you draw in the map becomes exact in FreeCAD**: the button "Import from the map", and `realize.py`, which the
  map calls by itself. A small room takes 3 seconds.
- **"Send to the map" now tells you where you may build.** It reads lane C's file of setbacks, protected oaks, steep
  ground, easement and roads at your building and says what lies there. It told me my own test pavilion stood two
  thirds under protected oaks. I moved it (89 m west, 24 m north of the chimney), clear of everything.
- All checks pass in the window and without it: 44, 155, 30 and 27 checks, and 24, 34, 39 and 12 forged faults rejected.

**Three faults of my own, found by the last runs and fixed**: `realize.py` mixed "what the land says here" into its list
of what was lost; one check hung for ten minutes; my checks left their trial files behind.

**Two things I need from you**
1. **May I delete 1.1 GB of old trial files** my checks left in the Windows temp folder (`%TEMP%\organic-*`, 108
   folders from 1 Oct)? From now on the checks remove what they write. Yes or no.
2. For the architect: which stays of two things I drew that lane C already has (my site file's own "typical" setbacks
   against C's envelope; its redrawn footprints and road). I propose my site file draws C's.

The full entry is on top of `Architect-editor\UPDATES.md`.
