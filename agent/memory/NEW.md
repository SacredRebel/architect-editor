# NEW — for Johny, from lane A (FreeCAD) (newest on top; clear what you have read)

## 6 Oct, 01:40 — Ctrl+R works from your shortcut; two more roof forms become real in FreeCAD (A, the Geometer)

1. **Ctrl+R works from your desktop shortcut, with FreeCAD closed:** a test house made real in 44 s (11 of 11 pieces,
   every solid within 2 cm of what the map drew). Started through `C:\Playground` instead, the same in 47 s. (E's new
   map finds FreeCAD from either place now.)
2. **The catalogue's leaf roof on ribs and the dome folded from one sheet are now built in FreeCAD**, from lane R's own
   numbers: checked against R's four reference cases (every number R printed, within half a millimetre). 7 of the
   catalogue's 22 forms are built now — all of R's; the 15 still missing are the rare sacred solids and figures (Merkaba,
   Klein bottle …). The table: `Architect-editor\docs\plans\engine\KINDS.md`.
   **For E:** the map does not yet let the leaf roof on ribs through to FreeCAD. Its `Base` is a height (2.6), and the map
   takes it for the name of a curve twice: `draw_tools.gd _refusal` refuses the export ("names a plan curve that is not in
   its building"), and `built.gd records()` leaves out its placement. FORMAT.md, "Forms 102 and 107 as A builds them".
3. **Waiting:** your first Ctrl+S (then the round trip on a copy of it); the trial folders' move (your yes or no).

## 6 Oct, 00:20 — C:\Playground is empty for now; the band's rules are written for E (A, the Geometer)

1. **`C:\Playground` shows an empty folder right now.** After the move it still points at the old place
   (`C:\AI-Work\Ai apps & Codebase\Playground`, left empty); everything is in
   `C:\AI-Work\Sacred-Rebel Ai\Ai apps & Codebase\Playground`. E re-points it today (the architect's ruling 6). Until then
   I stopped, as the new rule says, and wrote nothing through it.
2. **The band to the roof (glass or wall) is written out for E**, so the map can draw it itself when it takes in your S01:
   every number it needs is in `exchange\godot\FORMAT.md` ("`WallBand`, every field and the rule").
3. **Waiting:** E's new shortcut, then I time Ctrl+R from it and from the real folder. Your first Ctrl+S, then the round
   trip on a copy of it (the map's autosaves of your session yesterday evening hold five small test buildings; I left
   them alone). The trial folders' move: still your yes or no.

## 5 Oct, 16:15 — the engine underneath the map: Ctrl+R proven, every kind checked, the way back (A, the Geometer)

1. **Ctrl+R works on this PC with FreeCAD closed, when the map is started from its real folder.** Started as
   `C:\AI-Work\Ai apps & Codebase\Playground\exchange\godot\build\Sulphur Mountain.exe`, the map found FreeCAD by itself
   and made a test house real in 45 s (11 of 11 pieces; every solid within 0.006 m of what the map drew). Your S01 (80
   pieces) takes 87.5 s by the same command; the map waits up to 240 s. Pictures:
   `Architect-editor\docs\plans\engine\ctrl-r-in-the-exe-real-path.jpg` (the map's own line: "realized in 45 s") and
   `ctrl-r-s01-realized.png` (S01 as FreeCAD made it, opened afterwards).
   **For E:** started through `C:\Playground\exchange\godot\build\Sulphur Mountain.exe` (C:\Playground is a junction to
   the real folder), the map looks for `C:\FreeCAD\bin\freecadcmd.exe` and says "not found". FreeCAD is at
   **`C:\AI-Work\Ai apps & Codebase\FreeCAD\bin\freecadcmd.exe`**: add that path to the list in `built.gd`
   (`freecad_cmd()`), or let the desktop shortcut point at the real path.
2. **Every kind the map makes goes through FreeCAD.** 17 of the 19 types the map sends are built: walls of every kind,
   all six openings, floors, all roofs, steps and both stairs, columns, piers, tree columns, beams, ring beams, the pool,
   spa, fire lounge, pergola, tank, solar frame and fence, figures as lines. Fixed today: a wall's material word (straw
   bale, rammed earth …) and each opening's word (door, window, sliding …) were dropped on the way in; now they are kept
   and travel on. Not built yet: 17 rare catalogue forms (Merkaba, Klein bottle, the folded dome, the catalogue's leaf
   roof on ribs …). Not sent by the map at all: the earth of pads, pits and terraces, and paths (the map keeps those).
   The table: `Architect-editor\docs\plans\engine\KINDS.md`.
3. **The way back.** A save of the map taken through FreeCAD and back comes back with every edit in it: 16 records in,
   16 back, nothing changed that FreeCAD did not change; a change made in FreeCAD (a wall's height, a floor's
   thickness) arrived in the save. Tested on a save the map's own check wrote; your own first Ctrl+S does not exist
   yet — I run it on a scratch copy of it as soon as it does.
4. **The old trial folders (1.14 GB):** the proposal of 3 Oct below stands — move them to
   `C:\Playground\_archive\freecad-trials\`, nothing deleted. Your yes or no.
5. Not the house any more (the architect, 5 Oct): the roof frames I had begun (your point 7) stay in the repository as
   they were (commit `2a1d621c`), not sent to the map.

## 3 Oct, 14:45 — your answers are in the house, and it is in the map again

Your house S01 is built again from your spec with your answers, and sent to the map's folder
(`exchange\godot\oak-canopy-s01.glb`, `.ifc`, `.json`). Open it in FreeCAD:
`Documents\SulphurMountain\Oak-Canopy-S01.FCStd`. Pictures: `Architect-editor\docs\plans\organic\house\answers\`.

1. **Levels: the house stays where it is.** Where a sill lies below the land in front of it, it is shown as it is.
   Eight places (opening, floor, room: how deep its sill lies under the land):
   - O01 door, lower floor, Suite 1 bedroom: 1.68 m
   - O02 window, lower floor, Suite 1 bedroom: 0.99 m
   - O03 door, lower floor, Suite 2 bedroom: 1.81 m
   - O04 window, lower floor, Suite 2 bedroom: 1.16 m
   - O05 door, lower floor, Suite 3 bedroom: 1.91 m
   - O06 window, lower floor, Suite 3 bedroom: 1.28 m
   - O12 slider, main floor, Kitchen: 0.13 m
   - O46 slider, main floor, Courtyard 2: 0.01 m

   The whole lower floor lies 1.7 to 2.9 m in the ground. The ground work (steps, cut pads, lower floors) comes when you
   edit in the map and with its earthworks; your decision travels with the house, so the map's check does not call this
   a fault.
2. **Oaks:** at the house the oak check now says "out of date there" (lane C's file of the trees you had cut), not a
   fault: 68 % of the house's plan lies in protection zones that are out of date. The canopy outlines the land data
   still holds are in the design as their own group, **"Land data (not the house)"** (39 outlines, 22 marked out of
   date): select it in FreeCAD's tree and press the space bar to show or hide it. It is not part of the house and is
   not sent to the map.
3. **The old house:** the new one replaces it and stands on it (9 % of its plan); the old footprint stays on the map
   as today (the X key).
4. **Lower floor slab:** 0.30 m.
5. **The band between the wall tops and the roof:** built on the four walls your spec carries to the roof (the main
   outer wall, the mezzanine's, the two courtyard walls), as glass to start with. To compare: click a band in the tree
   ("… band to the roof"), set **Kind** to **Wall** in its properties (or back to **Glass**), then Recompute.
   It runs up to the lowest roof over it and **steps where the roof over it changes** (your spec's "stepped glazing at
   shell seams"): the main wall's band is in 3 pieces, the mezzanine's in 5. Courtyard 1's runs all round; courtyard
   2's runs round most of it and stops where its wall reaches into the roof (0.42 m at its highest, your spec's own
   numbers). The mezzanine's outline turns very tightly in two places (once where its line closes, on a 35 mm radius):
   there the band leaves a gap of 15 to 19 cm. Glass in all: 3.85 m³ (main), 2.97 (mezzanine), 0.58 and 0.70
   (courtyards).
6. **The chimney:** the main floor has a clean round opening round it, the chimney's own size (radius 1.90 m).
7. Next, in your order: the roof ribs and edge beams, the nine columns, the two stairs, the glass ribbon between the
   leaves, the pool pavilion's roof, then the outdoors; one line here after each.

Also new today: a wall drawn in the map with corners (a retaining wall, for example) keeps the heights you give its top;
before, such a wall came back flat.

## 3 Oct, 14:45 — the backups and the old trial files: what they are, and what may go (you decide)

**First, a mistake of mine.** Saving your house today (14:24) made FreeCAD drop the oldest of its two backups of it,
`Oak-Canopy-S01.20261002-024624.FCBak` (2 Oct 02:46, the first build, before its walls were joined), and write a new
one of the 05:11 save in its place. FreeCAD keeps two backups per design and removes the oldest past the Recycle Bin; I
did not copy it aside first, though the backups were yours to decide on. What it was built from is kept: the records of
2 Oct, now beside today's as `exchange\house\models\oak-canopy-s01.2026-10-02.json` (the notes file written with them
was replaced by today's). I am sorry; from now on a backup is copied aside before its design is saved over.

Nothing else is deleted. Read only, on 3 Oct:

**The `.FCBak` files beside your designs** (`Documents\SulphurMountain`; FreeCAD writes one each time a design is
saved over):
- `Oak-Canopy-S01.20261002-045348.FCBak` (17.8 MB, 2 Oct 04:53) and `…-051124.FCBak` (18.0 MB, 2 Oct 05:11, written
  today from the save before): earlier saves of your house, the same 77 pieces; today's design (14:24) has your
  answers in it.
- `Organic-test-pavilion.20261001-193255.FCBak` and `…-215910.FCBak` (22.2 and 22.1 MB, 1 Oct): earlier saves of the
  test pavilion, the same 14 pieces as now.
- `SulphurMountain-site.20260929-202409.FCBak` (2.2 MB, 29 Sep): the site template before the anchor was settled; it
  still holds the old datum (425.90 m, retired on 1 Oct) and an early "Organic building" object; the design now has the
  anchor (425.63 m) and the county's road. `…-20261001-201935.FCBak` (2.1 MB, 1 Oct): the same 37 pieces as now.

**The old trial folders:** 154 folders `organic-*` in `%TEMP%`, 1.14 GB, from 1 Oct 18:12 to 2 Oct 23:13, each left by
a check that was stopped before it cleared up after itself (the checks remove their own when they finish): 12
`organic-realize-*` (712 MB: each a realized sample, its 60 MB design among it), 41 `organic-toolbar-*` (286 MB: each
button's export), 22 `organic-import-out-*` (139 MB) and 79 `organic-import-*` (0.2 MB, the records written for an
import). Any check makes all of them again.

**What they teach** (written at the top of `knowledge\LESSONS.md`, read in the order they were made, against the
commits of those two days): the test building's wall was sent with a volume that changed with where it stood (FreeCAD's
quick measure; the exact one since 2 Oct); it stood on the old house and under protected oaks before its place was
chosen from the land's build envelope; the vault along a curve and the oval dome failed at their first runs and the dome
read 1 % too much before it was built from its sections; the joints and wave-vault cases are the checks of 2 Oct being
written. Nothing in them is needed for the design as it is. Also: saving over a design drops its oldest backup; the
oldest site backup shows the retired datum, which the anchor rule already covers.

**Proposal (the architect's, 3 Oct): move, not delete.** The 154 trial folders (1.14 GB) to
`C:\Playground\_archive\freecad-trials\`, as they are. The backups stay where they are until you say; from now on a
backup is copied aside to `C:\Playground\_archive\freecad-backups\` before its design is saved over. Your yes or no on
the move; nothing is deleted.

## 2 Oct, 23:45 — new buttons: the shells and lattices from lane R's studies

- **Organic toolbar:** **Wave vault** (a vault whose rise goes up and down along its length), **Conoid roof** (an
  arch at one end running out to a straight line at the other), **Translation shell** (one arch slid along another).
  The **Saddle shell** has a second kind, **Groined saddles**: saddles round one centre, as at Candela's Los
  Manantiales (8 lobes = four saddles; 4 to 16).
- **Sacred toolbar:** **Geodesic frame**: a dome of struts and node balls (a 5/8 or 3/8 dome), with its cutting list
  (how many struts of each length).
- **Biomimetic toolbar:** **Gridshell** now also works on a shell: select a dome, a vault, a leaf, a conoid or a
  saddle, press it, and laths lie on its back both ways (turn them 45° for a diagonal grid, two layers, a beam
  along its edges).
- Pictures: `Architect-editor\docs\plans\organic\generators\`.
- In the FreeCAD window open now, the new buttons sit at the end of each toolbar row; after FreeCAD's next start
  they are in their places.
- Each one is checked against lane R's own numbers and against formulas worked out in the checks, in FreeCAD's window
  too. Nothing was sent to the map and nothing of your house changed.
- Still with you: the backup-file question just below, the seven questions on the house, and the 1.1 GB of old trial
  files.

## 2 Oct, 07:40 — the house sent again with its walls joined; a wave vault; one small question

- **Your house (S01) was sent to the map's folder again at 05:15.** Where its walls end on each other (21 wall
  ends at 8 places, all inner walls) they are now joined, as the map draws them, instead of running into each
  other. Nothing else in it changed. Its pictures are retaken: `Architect-editor\docs\plans\organic\house\`.
- **New in the Ribbed vault:** two more numbers in its property list, `WaveAmplitude` and `Waves`, make it a wave
  vault: its rise goes up and down along its length. A vault can also follow a curve you draw. If that curve bends
  tighter than the vault is wide, FreeCAD does not build a folded vault: it says where the bend is, on what radius,
  and how far the vault reaches ("a narrower span, or a gentler curve"). Pictures:
  `Architect-editor\docs\plans\organic\vault\`.
- **One question.** FreeCAD keeps a backup each time a design is saved over. Six such files lie beside your
  designs in `Documents\SulphurMountain` (two of the house, two of the test pavilion, two of the site template,
  84 MB together, names ending in `.FCBak`). They are older saves of designs that are there in full. Keep them, or
  may I delete them? I delete nothing without your yes.
- Still with you: the seven questions on the house, just below, and the yes or no on the 1.1 GB of old trial files.

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
