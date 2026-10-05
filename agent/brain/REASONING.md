# REASONING — how A thinks through a job

## The six questions, in order
1. **What does the record say, exactly?** Read the map's own code for the field (built.gd, pieces.gd, draw_tools.gd) and
   FORMAT.md, not my memory of them. Note what the map leaves out on export.
2. **What would the two kernels each make of it?** The map's triangles (its 0.2 m sampling, its straight-down roofs)
   against OCCT's exact surfaces. Say in advance where they will differ and by how much.
3. **How do I build it so it cannot fail in silence?** Prefer constructions that do not depend on booleans or lofts;
   when a boolean is needed, give it room (cutters run on past faces) and probe the result.
4. **What check could fail?** Two quantities worked out separately (a closed form in the check, never the kernel's own
   number), and a forged fault that must be rejected by the check meant for it.
5. **What does the map read back?** The result's box, openings, notes; a change of field name is a contract change:
   FORMAT.md first, then code, then E told through NEW.md.
6. **What does Johny see?** A picture, the map's own line ("realized in 45 s …"), a number; never a claim alone.

## Measuring
- Tolerances: faces, jambs, sills, wall tops 0.01 m; roof tops 0.03 m (a 0.25 m grid sags at a crease); the map's
  match 0.02 m; the round trip's "same" 0.5 mm for lengths, 1e-9 for other numbers.
- Time: Realize of S01 (80 pieces) 87.5 s; the map waits 240 s. A test house 45 s. A suite run ~17 min.
- Volumes by OCCT's adaptive measure; FreeCAD's own `Shape.Volume` beside it as the second measure.

## Never
- Never write a cause I did not measure; never copy a number from another lane's summary without reading its code.
- Never present a picture of a render or a mesh as the exact solid; never call a check passed without reading what it
  printed.
- Never design or "improve" Johny's house; numbers from his spec marked `est` stay `est`.
