# -*- coding: utf-8 -*-
"""PICTURE_DESIGN=<.FCStd> PICTURE_OUT=<path without .png> [PICTURE_TITLE=...] freecadcmd picture_realized.py

The realized design opened afterwards, without FreeCAD's window: freecadcmd opens <name>.FCStd from built\\realized,
takes every solid made from a record (MapPiece), and draws it from the south-west and from above (matplotlib, its
triangles shaded by one light, nearest drawn last). PICTURE_DESIGN, PICTURE_OUT, PICTURE_TITLE in the environment."""
import math
import os
import sys
import traceback

LOG = open(os.environ.get("PICTURE_OUT", "picture") + ".log", "w", encoding="utf-8", buffering=1)


def say(text):
    LOG.write(text + "\n")


try:
    import FreeCAD as App
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.collections import PolyCollection

    design = os.environ["PICTURE_DESIGN"]
    out = os.environ["PICTURE_OUT"]
    title = os.environ.get("PICTURE_TITLE", os.path.basename(design))
    doc = App.openDocument(design)
    colours = {"Wall": (0.86, 0.80, 0.70), "WallBand": (0.70, 0.84, 0.92), "Slab": (0.72, 0.72, 0.70), "HeightFieldShell": (0.66, 0.55, 0.45),
               "Revolved": (0.60, 0.50, 0.45), "RoofFrame": (0.76, 0.58, 0.40)}
    tris = []  # (points, colour, kind)
    kinds = {}
    for o in doc.Objects:
        if not getattr(o, "MapPiece", "") or type(getattr(o, "Proxy", None)).__name__ in ("PlanCurve", "SacredFigure"):
            continue
        shape = o.Shape
        if shape.isNull() or not shape.Solids:
            continue
        kind = type(o.Proxy).__name__
        kinds[kind] = kinds.get(kind, 0) + 1
        v, t = shape.tessellate(30.0)
        pts = [(p.x / 1000.0, p.y / 1000.0, p.z / 1000.0) for p in v]
        for a, b, c in t:
            tris.append(((pts[a], pts[b], pts[c]), colours.get(kind, (0.8, 0.8, 0.8))))
    say("%d solids by kind %s, %d triangles" % (sum(kinds.values()), kinds, len(tris)))
    light = (-0.45, -0.35, 0.82)
    n_l = math.sqrt(sum(c * c for c in light))
    light = tuple(c / n_l for c in light)

    def view(ax, yaw_deg, pitch_deg, label):
        yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
        # the camera looks along d; right and up span the picture
        d = (math.cos(pitch) * math.sin(yaw), math.cos(pitch) * math.cos(yaw), -math.sin(pitch))
        right = (math.cos(yaw), -math.sin(yaw), 0.0)
        up = (right[1] * d[2] - right[2] * d[1], right[2] * d[0] - right[0] * d[2], right[0] * d[1] - right[1] * d[0])
        polys, faces, depth = [], [], []
        for (p, q, r), col in tris:
            e1 = (q[0] - p[0], q[1] - p[1], q[2] - p[2])
            e2 = (r[0] - p[0], r[1] - p[1], r[2] - p[2])
            n = (e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
            ln = math.sqrt(sum(c * c for c in n)) or 1.0
            n = tuple(c / ln for c in n)
            lit = 0.35 + 0.65 * abs(sum(n[i] * light[i] for i in range(3)))
            polys.append([(sum(x[i] * right[i] for i in range(3)), sum(x[i] * up[i] for i in range(3))) for x in (p, q, r)])
            faces.append(tuple(min(1.0, c * lit) for c in col))
            depth.append(sum(sum(x[i] * d[i] for i in range(3)) for x in (p, q, r)) / 3.0)
        order = sorted(range(len(polys)), key=lambda i: -depth[i])
        ax.add_collection(PolyCollection([polys[i] for i in order], facecolors=[faces[i] for i in order], edgecolors="none"))
        ax.autoscale()
        ax.set_aspect("equal")
        ax.axis("off")
        ax.set_title(label, fontsize=11)

    fig, axes = plt.subplots(1, 2, figsize=(18, 8.5), dpi=110, gridspec_kw={"width_ratios": [1.35, 1.0]})
    view(axes[0], 45.0, 32.0, "from the south-west")
    view(axes[1], 0.0, 89.9, "from above (north up)")
    fig.suptitle(title, fontsize=13)
    fig.tight_layout()
    fig.savefig(out + ".png")
    say("wrote %s.png" % out)
except Exception:
    say(traceback.format_exc())
os._exit(0)
