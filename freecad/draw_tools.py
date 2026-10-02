# -*- coding: utf-8 -*-
"""draw_tools — what the Sacred and the Biomimetic toolbars make, drawn.

    ORGANIC_HEADLESS=tools   "<FreeCAD>\\bin\\freecadcmd.exe" freecad\\run_headless.py
    or, inside FreeCAD:      draw()

Two PNGs in docs/plans/freecad/: sacred-tab.png and biomimetic-tab.png. Every panel is the
object its button makes, with the button's own values, built here in a document that is thrown
away: nothing is written to the map's folder. These are drawings of the solids' own triangles
and of the figures' own curves, not screenshots of FreeCAD's window.
"""

import math
import os
import sys

import FreeCAD as App

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Playground\Architect-editor\freecad"
for _p in (HERE, os.path.join(HERE, "Organic")):
    if _p not in sys.path:
        sys.path.insert(0, _p)
import draw_placement  # noqa: E402
import organic_commands as oc  # noqa: E402
import organic_objects as oo  # noqa: E402

OUT = draw_placement.OUT
MM = 1000.0


def triangles(obj, tolerance_mm=6.0, solids=None):
    """An object's triangles in its own frame, (n, 3, 3) metres; of some of its solids only
    (a slice) when `solids` is given."""
    import numpy as np

    shape = obj.Shape.copy()
    shape.Placement = App.Placement()
    out = []
    for part in (shape.Solids[solids] if solids is not None else [shape]):
        for face in part.Faces:
            pts, tris = face.tessellate(tolerance_mm)
            out.extend([[tuple(pts[i]) for i in t] for t in tris])
    return np.array(out, dtype=float) / MM


def lines(obj):
    """A figure's curves in its own frame: [[(x, y), ...], ...] metres."""
    shape = obj.Shape.copy()
    shape.Placement = App.Placement()
    return [[(p.x / MM, p.y / MM) for p in e.discretize(Number=max(2, int(e.Length / 60.0) + 2))] for e in shape.Edges]


def colour(obj):
    return oo.COLOURS.get(str(getattr(obj, "IfcType", "")), (0.78, 0.74, 0.66))


def sheet(path, title, panels, columns):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    rows = int(math.ceil(len(panels) / float(columns)))
    fig, axes = plt.subplots(rows, columns, figsize=(4.6 * columns, 4.2 * rows), dpi=120)
    axes = list(axes.flat) if hasattr(axes, "flat") else [axes]
    for ax in axes[len(panels):]:
        ax.axis("off")
    for ax, (label, kind, data, view) in zip(axes, panels):
        if kind == "lines":
            for k, pts in enumerate(data["curves"]):
                outline = k < data["outline"]
                ax.plot([p[0] for p in pts], [p[1] for p in pts], color="#8a5a14" if outline else "#b99a5a", linewidth=2.2 if outline else 0.8)
            ax.set_aspect("equal")
            ax.set_title(label, fontsize=10)
            ax.tick_params(labelsize=7)
            ax.grid(True, linewidth=0.3, alpha=0.5)
        else:
            draw_placement.shaded(ax, data, view[0], view[1], label, layered=kind == "layers")
    fig.suptitle(title, fontsize=12)
    fig.tight_layout(rect=(0, 0, 1, 0.96))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fig.savefig(path)
    plt.close(fig)
    print("drew", path)
    return path


def draw(out_dir=OUT):
    doc = App.newDocument("OrganicToolsDrawn", "Organic tools drawn", True, True)
    try:
        press = lambda name, **kw: oc.ALL[name].make(doc, **kw)

        def solid(name, setup=None, **kw):
            obj = press(name, **kw)[0]
            if setup:
                setup(obj)
            doc.recompute()
            return [(obj.Label, triangles(obj), colour(obj))]

        def figure(kind, size=4.0, count=6, step=2, root="2", cells_y=0):
            f = press("Sacred_Figure")[0]
            f.Kind, f.Size, f.Count, f.Step, f.Root, f.CellsY = kind, size * MM, count, step, root, cells_y
            doc.recompute()
            return {"curves": lines(f), "outline": len(f.Proxy.figure(f)[0].Edges)}

        sacred = [
            ("Vesica piscis", "lines", figure("Vesica piscis"), None),
            ("Seed of life", "lines", figure("Seed of life"), None),
            ("Flower of life, 2 rings", "lines", figure("Flower of life", 2.0, 2), None),
            ("Golden rectangle and its spiral", "lines", figure("Golden rectangle", 4.0, 7), None),
            ("Root rectangle, 1 : √3", "lines", figure("Root rectangle", 4.0, 6, 2, "3"), None),
            ("Turned squares (ad quadratum)", "lines", figure("Turned squares", 8.0, 5), None),
            ("Star, 8 points, every 3rd", "lines", figure("Star", 4.0, 8, 3), None),
            ("Module grid, 5 by 3 of 1.2192 m (4 ft)", "lines", figure("Module grid", 1.2192, 5, 2, "2", 3), None),
        ]
        for kind in ("Tetrahedron", "Octahedron", "Dodecahedron", "Icosahedron"):
            sacred.append((kind + ", edge 3 m", "solid", solid("Sacred_Solid", lambda o, k=kind: setattr(o, "Kind", k)), (-30.0, 22.0)))
        sacred.append(("Geodesic dome, frequency 3", "solid", solid("Sacred_Geodesic"), (-30.0, 24.0)))
        sacred.append(("Geodesic dome, frequency 4, five eighths", "solid",
                       solid("Sacred_Geodesic", lambda o: (setattr(o, "Frequency", 4), setattr(o, "Portion", 0.625))), (-30.0, 20.0)))
        rose = press("Sacred_SunRose")[0]
        doc.recompute()
        sacred.append(("Sun rose: north up; %s" % rose.Horizon.split(" (")[0].lower() + " horizon", "lines", {"curves": lines(rose), "outline": 5}, None))
        wall_on = press("Sacred_Figure")[0]
        wall_on.Kind, wall_on.Size = "Vesica piscis", 6000.0
        doc.recompute()
        wall = press("Organic_Wall", selected=[wall_on])[0]
        doc.recompute()
        sacred.append(("A wall on a vesica's outline", "solid", [(wall.Label, triangles(wall), colour(wall))], (-35.0, 35.0)))
        first = sheet(os.path.join(out_dir, "sacred-tab.png"), "The Sacred toolbar: plan figures, regular solids, the sun's directions", sacred, 4)

        bio = [
            ("Gridshell over a 6 m circle", "solid", solid("Bio_Gridshell", selected=[]), (-30.0, 28.0)),
            ("Hanging net, the same balance in tension", "solid", solid("Bio_Net", selected=[]), (-30.0, 18.0)),
            ("Cellular wall on an arc", "solid", solid("Bio_Cells", selected=[]), (150.0, 12.0)),
            ("Branching column, 3 x 3", "solid", solid("Bio_Column"), (-25.0, 12.0)),
            ("Branching column, 2 x 2 x 2", "solid", solid("Bio_Column", lambda o: (setattr(o, "Levels", 3), setattr(o, "Branches", 2))), (-25.0, 12.0)),
        ]
        leaf = press("Bio_VeinLeaf")[0]
        doc.recompute()
        skin = ("shell", triangles(leaf, solids=slice(0, 1)), colour(leaf))
        ribs = ("vein ribs", triangles(leaf, solids=slice(1, None)), (0.80, 0.86, 0.70))  # lighter, to read against the shell
        bio.append(("Veined leaf shell, from below: its ribs", "layers", [skin, ribs], (-20.0, -55.0)))
        bio.append(("Veined leaf shell, from above", "layers", [ribs, skin], (-30.0, 30.0)))
        lobed = press("Organic_PlanCurve")[0]
        doc.recompute()
        bio.append(("Gridshell over a lobed plan", "solid", solid("Bio_Gridshell", selected=[lobed]), (-30.0, 30.0)))
        second = sheet(os.path.join(out_dir, "biomimetic-tab.png"), "The Biomimetic toolbar: nets, cells, veins, branches", bio, 4)
    finally:
        App.closeDocument(doc.Name)
    return first, second


if __name__ == "__main__":
    draw()
