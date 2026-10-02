# -*- coding: utf-8 -*-
"""check_import — a building drawn in the map, rebuilt in FreeCAD by "Import from the map".

Runs inside FreeCAD 1.1 (the window through the FreeCAD MCP connector, or freecadcmd):

    exec(open(r".../freecad/check_import.py", encoding="utf-8").read())
    # IMPORT_CHECK_SELF_TEST=1 (or "--self-test" in sys.argv) forges faults

It writes a built file (format built/1, exchange\\godot\\FORMAT.md: "What Johny builds in the
map": pieces of {type, params} in this workbench's own property names) into a scratch folder,
presses the button's own make() on it, and holds what stands in FreeCAD against numbers worked
out here from the file's own numbers, not taken from the workbench:

  I. where the building stands: metres east and north of the anchor from the file's longitude
     and latitude by WGS84's radii of curvature, its height from altitude_m, its turn
     anticlockwise; the file kept on the building; every piece made, every solid valid.
  W. walls: a closed room of straight runs (perimeter x thickness x height, less its door and
     its window, each open where the file's metres along the line put it); an L of two runs
     standing left of its line (8 t - t², the corner mitred); a smooth wall through five points
     with a waved top (the map's curve: its cubic spans integrated here; t L (H + rise / 2) less
     its opening, which stands where the map measured it along its own drawn points); a wall on
     a petal plan, turned, at its own place (the petal's formula integrated here).
  S. slabs: the room's floor inset from the wall's line ((a - 2 i)(b - 2 i) t); a round step
     (a "Step" is a slab: π r² t) lowered by its BaseOffset; a bench raised by its own.
  R. roofs and shells: the shell roof over the room (its crown eaves + rise, its eave the
     overhang beyond the line all round); a hemispherical dome (2/3 π (R³ - (R - t)³)) at its
     place; a semicircular vault on a plinth turned a quarter turn (π/2 (Ro² - Ri²) L +
     2 t L p; its box turned with it); a leaf roof at its place and turn, its ridge heights.
  P. the map's second piece of work, as its records are: a dome on an oval (the round cap
     shell times its two stretches, in the turned oval's box); a leaf fitted over an outline
     with a straight midrib (the same either side of its spine, which the leaf as it grows is
     not); a vault along a drawn curve (its section's area times the curve's length); a flight
     of steps (their count from the climb at 0.17 m each, every tread down to the ground).
  X. a building the map shows larger (scale 1.5): every length is its number times the scale.
  N. nothing dropped in silence: the sample's one unknown type and one unknown parameter are
     both named in the notes, and nothing else is.
  T. there and back: the imported building sent to the map again says the same longitude,
     latitude, altitude and turn the file said, and names the file it came from.
  Z. realized: the same file through realize.py (what the map calls, FreeCAD without its
     window): the design, the .glb, the .ifc, the .json and the result written; every solid of
     the file a node of the .glb under its piece's own id, its triangles (read back here from
     the file's bytes) enclosing the solid's volume within 1 %; the place the file's; the
     records and the saved design named; and it says it is not complete, and why.

--self-test forges faults into what was read and must see every one rejected by the check
meant for it.
"""

import copy
import json
import math
import os
import re
import runpy
import shutil
import struct
import sys
import tempfile

import FreeCAD as App
import Part

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Playground\Architect-editor\freecad"
sys.path.insert(0, os.path.join(HERE, "Organic"))
import organic_commands as oc  # noqa: E402

# the folders this check writes its trial files into (the realized sample's design alone is 60 MB): they are
# taken away again once everything in them has been read, unless ORGANIC_CHECK_KEEP=1 asks to look at them
SCRATCH = []


def scratch(prefix):
    folder = tempfile.mkdtemp(prefix=prefix)
    SCRATCH.append(folder)
    return folder


def tidy():
    keep = os.environ.get("ORGANIC_CHECK_KEEP") == "1"
    while SCRATCH:
        folder = SCRATCH.pop()
        if keep:
            print("kept", folder)
        else:
            shutil.rmtree(folder, ignore_errors=True)

BRAIN = os.environ.get("PLAYGROUND_BRAIN", r"C:\Playground\BRAIN.md")
SAMPLE = os.path.join(HERE, "samples", "built-sample.json")
MM = 1000.0
GARDEN = [[-2.0, 7.5], [0.25, 8.3], [2.5, 7.5], [4.75, 6.7], [7.0, 7.5]]
PETAL = {"R": 3.0, "lobes": 5, "depth": 0.2, "turn": 20.0, "x": -12.0, "y": -6.0}
OVAL = {"R": 2.0, "turn": 25.0, "x": -14.0, "y": 6.0}
SPINE = [[0.0, 0.0], [4.0, 1.5], [8.0, 0.0]]
# what the map may write of the land at a piece (agents\LAND-LAYERS-SPEC.md, the Probe): numbers made up for this
# sample, to see them carried through as they are, not readings of the land
LAND_AT_THE_WALL = {"slope_pct": 6.5, "sun_dec_h": 5.2, "fire_ring": "5-30 ft"}
LAND_AT_THE_BUILDING = {"envelope_reason": "", "setback_m": 22.7}


# ------------------------------------------------------------------ the sample, and its own numbers
def sample():
    """A building as the map's build mode keeps one: pieces of {type, params} in the Organic
    workbench's own names, metres in the building's own frame. Not a design: one of each kind,
    with numbers a closed form can be worked out from."""
    return {
        "format": "built/1",
        "id": "h-sample",
        "name": "Built sample",
        "saved": "2026-10-02T00:00:00Z",
        "generator": "lane A's sample of the format (not drawn in the map)",
        "placement": {"coordinates": [-119.156578501, 34.433379455], "altitude_m": -6.0673, "rotation_deg": {"x": 0.0, "y": 40.0, "z": 0.0}, "scale": 1.0},
        "land": LAND_AT_THE_BUILDING,
        "pieces": [
            {"id": "c-room", "type": "PlanCurve", "name": "Room line",
             "params": {"Kind": "Points", "Points": [[0.0, 0.0], [8.0, 0.0], [8.0, 5.0], [0.0, 5.0]], "Closed": True, "Smooth": False}},
            {"id": "w-room", "type": "Wall", "name": "Room wall",
             "params": {"Base": "c-room", "Thickness": 0.3, "Height": 2.8, "Align": "Center", "Top": "Flat", "TopRise": 0.0, "TopWaves": 3, "Foundation": 0.5, "BaseOffset": 0.0,
                        "OpeningPositions": [4.0, 10.5], "OpeningWidths": [1.0, 1.2], "OpeningHeights": [2.1, 1.2], "OpeningSills": [0.0, 0.9], "OpeningShapes": ["Rect", "Rect"]}},
            {"id": "s-floor", "type": "Slab", "name": "Floor", "params": {"Base": "c-room", "Thickness": 0.25, "Inset": 0.15}},
            {"id": "c-wing", "type": "PlanCurve", "name": "Wing line",
             "params": {"Kind": "Points", "Points": [[8.0, 5.0], [12.0, 5.0], [12.0, 9.0]], "Closed": False, "Smooth": False}},
            {"id": "w-wing", "type": "Wall", "name": "Wing wall", "params": {"Base": "c-wing", "Thickness": 0.25, "Height": 2.2, "Align": "Left", "Foundation": 0.0}},
            {"id": "c-garden", "type": "PlanCurve", "name": "Garden line", "params": {"Kind": "Points", "Points": GARDEN, "Closed": False}},
            {"id": "w-garden", "type": "Wall", "name": "Garden wall",
             "params": {"Base": "c-garden", "Thickness": 0.3, "Height": 1.6, "Top": "Wave", "TopRise": 0.3, "TopWaves": 2, "Foundation": 0.0,
                        "OpeningPositions": [6.0], "OpeningWidths": [1.0], "OpeningHeights": [1.2], "OpeningSills": [0.0], "OpeningShapes": ["Rect"]},
             "land": LAND_AT_THE_WALL},
            {"id": "c-petal", "type": "PlanCurve", "name": "Petal line",
             "params": {"Kind": "Lobed", "Radius": PETAL["R"], "Lobes": PETAL["lobes"], "Depth": PETAL["depth"], "Turn": PETAL["turn"]},
             "placement": {"x": PETAL["x"], "y": PETAL["y"]}},
            {"id": "w-petal", "type": "Wall", "name": "Petal wall", "params": {"Base": "c-petal", "Thickness": 0.3, "Height": 2.4, "Foundation": 0.0}},
            {"id": "r-room", "type": "ShellRoof", "name": "Room roof", "params": {"Base": "c-room", "Eaves": 2.8, "Rise": 1.4, "Overhang": 0.5, "Thickness": 0.18}},
            {"id": "c-step", "type": "PlanCurve", "name": "Step line", "params": {"Kind": "Circle", "Radius": 0.9}, "placement": {"x": 4.0, "y": -0.9}},
            {"id": "s-step", "type": "Step", "name": "Door step", "params": {"Base": "c-step", "Thickness": 0.3, "BaseOffset": -0.15}},
            {"id": "c-bench", "type": "PlanCurve", "name": "Bench line", "params": {"Kind": "Circle", "Radius": 0.6, "Colour": "oak"}, "placement": {"x": -5.0, "y": -3.0}},
            {"id": "s-bench", "type": "Slab", "name": "Bench", "params": {"Base": "c-bench", "Thickness": 0.45, "BaseOffset": 0.45}},
            {"id": "d-dome", "type": "Dome", "name": "Garden dome", "params": {"Base": "", "Profile": "Sphere", "Radius": 2.5, "Rise": 2.5, "Thickness": 0.2, "Oculus": 0.0},
             "placement": {"x": -5.0, "y": 2.5}},
            # the map's second piece of work (1 Oct, 22:20), as its records are: a dome on an oval, a leaf fitted over an
            # outline with a straight midrib, a vault along a drawn curve, a flight of steps; "turn" for a piece's turn
            {"id": "c-oval", "type": "PlanCurve", "name": "Oval line", "params": {"Kind": "Oval", "Radius": OVAL["R"], "Turn": OVAL["turn"]},
             "placement": {"x": OVAL["x"], "y": OVAL["y"]}},
            {"id": "d-oval", "type": "Dome", "name": "Oval dome",
             "params": {"Base": "c-oval", "Profile": "Sphere", "Radius": OVAL["R"], "Rise": 1.5, "Thickness": 0.2, "Oculus": 0.0, "StretchX": 1.2, "StretchY": 0.75},
             "placement": {"x": OVAL["x"], "y": OVAL["y"], "z": 0.0, "turn": OVAL["turn"]}},
            {"id": "l-even", "type": "LeafShell", "name": "Even leaf",
             "params": {"Base": "c-petal", "Outline": "Ellipse", "Spine": 9.0, "LeafSpan": 5.0, "RidgeHeights": [2.8, 3.6, 4.2, 2.8], "Eave": 2.8, "RiseFactor": 1.0,
                        "Curvature": 0.15, "Thickness": 0.12, "RibSpacing": 0.0, "Plinth": 0.0, "Rise": 1.4, "Overhang": 0.6, "Asymmetry": 0.0},
             "placement": {"x": 22.0, "y": 9.0, "z": 0.0, "turn": 0.0}},
            {"id": "c-spine", "type": "PlanCurve", "name": "Vault spine", "params": {"Kind": "Points", "Points": SPINE, "Closed": False},
             "placement": {"x": 18.0, "y": -9.0}},
            {"id": "v-bent", "type": "Vault", "name": "Bent vault",
             "params": {"Base": "c-spine", "Profile": "Semicircle", "Span": 2.4, "Rise": 1.2, "Thickness": 0.2, "VaultLength": 8.6, "Ribs": 0, "Plinth": 0.3}},
            {"id": "st-1", "type": "Steps", "name": "Garden steps",
             "params": {"From": [10.0, -4.0, 0.0], "To": [13.0, -4.0, 1.02], "Width": 1.2, "Count": 0, "Foundation": 0.3, "Rise": 0.17, "Run": 0.5}},
            {"id": "v-vault", "type": "Vault", "name": "Store vault",
             "params": {"Profile": "Semicircle", "Span": 3.0, "Rise": 1.5, "Thickness": 0.2, "VaultLength": 6.0, "Ribs": 0, "Plinth": 0.4},
             "placement": {"x": 15.0, "y": 0.0, "rot": 90.0}},
            {"id": "l-leaf", "type": "LeafShell", "name": "Porch leaf",
             "params": {"Outline": "Pointed", "Spine": 10.0, "LeafSpan": 6.0, "RidgeHeights": [0.5, 3.0, 3.6, 0.5], "Eave": 0.5, "Thickness": 0.12,
                        "RibSpacing": 1.5, "Plinth": 0.5, "RibPattern": "Straight"},
             "placement": {"x": 0.0, "y": -9.0, "rot": 15.0}},
            {"id": "x-pool", "type": "Pool", "name": "Pool", "params": {"Depth": 1.5}, "placement": {"x": 25.0, "y": 2.0}},
        ],
    }


def scaled_sample():
    """A second building, shown by the map at one and a half times its numbers."""
    return {
        "format": "built/1", "id": "h-scaled", "name": "Scaled sample",
        "placement": {"coordinates": [-119.15536, 34.4331], "altitude_m": 0.0, "rotation_deg": {"x": 0.0, "y": 0.0, "z": 0.0}, "scale": 1.5},
        "pieces": [
            {"id": "c", "type": "PlanCurve", "params": {"Kind": "Points", "Points": [[0.0, 0.0], [4.0, 0.0]], "Closed": False, "Smooth": False}},
            {"id": "w", "type": "Wall", "params": {"Base": "c", "Thickness": 0.2, "Height": 2.0, "Foundation": 0.0,
                                                   "OpeningPositions": [1.0], "OpeningWidths": [0.8], "OpeningHeights": [1.0], "OpeningSills": [0.5], "OpeningShapes": ["Rect"]}},
            {"id": "r", "type": "PlanCurve", "params": {"Kind": "Circle", "Radius": 1.0}, "placement": {"x": 3.0, "y": 2.0}},
            {"id": "s", "type": "Slab", "params": {"Base": "r", "Thickness": 0.2}},
        ],
    }


def canonical_frame():
    with open(BRAIN, encoding="utf-8") as fh:
        text = fh.read().replace("−", "-").replace("*", "")
    section = text.split("## 3.", 1)[1].split("## 4.", 1)[0]
    origin = re.search(r"lng\s*(-?\d+\.\d+),\s*lat\s*(-?\d+\.\d+)", section)
    ground = re.search(r"(\d+\.\d+)\s*m NAVD88", section)
    return float(origin.group(1)), float(origin.group(2)), float(ground.group(1))


def wgs84_metres_per_degree(lat):
    """Metres per degree of longitude and of latitude at a latitude, from the ellipsoid's radii."""
    a, f = 6378137.0, 1 / 298.257223563
    e2 = f * (2 - f)
    s = math.sin(math.radians(lat))
    n = a / math.sqrt(1 - e2 * s * s)
    m = a * (1 - e2) / (1 - e2 * s * s) ** 1.5
    return math.radians(1.0) * n * math.cos(math.radians(lat)), math.radians(1.0) * m


def smooth_point(p, i, t):
    """The map's smooth curve through open points p, on its span i at t in 0..1: the formula of
    the map's own pieces.gd (through_points), written out again here."""
    n = len(p)
    p0, p1, p2, p3 = p[max(i - 1, 0)], p[i], p[i + 1], p[min(i + 2, n - 1)]
    return tuple(0.5 * ((2.0 * p1[c]) + (p2[c] - p0[c]) * t + (2.0 * p0[c] - 5.0 * p1[c] + 4.0 * p2[c] - p3[c]) * t * t
                        + (3.0 * p1[c] - p0[c] - 3.0 * p2[c] + p3[c]) * t * t * t) for c in (0, 1))


def smooth_length(p, steps=4000):
    """The length of that curve, its spans cut finely."""
    total = 0.0
    for i in range(len(p) - 1):
        last = smooth_point(p, i, 0.0)
        for k in range(1, steps + 1):
            q = smooth_point(p, i, k / steps)
            total += math.dist(last, q)
            last = q
    return total


def along_the_map(p, s, step=0.2):
    """The point s metres along the curve as the map draws it: points no more than 0.2 m apart
    on each span (the map's own count), straight between them."""
    pts = []
    for i in range(len(p) - 1):
        k = max(2, int(math.ceil(math.dist(p[i], p[i + 1]) / step)))
        pts += [smooth_point(p, i, j / k) for j in range(k)]
    pts.append(tuple(p[-1]))
    for a, b in zip(pts, pts[1:]):
        d = math.dist(a, b)
        if s <= d:
            return (a[0] + (b[0] - a[0]) * s / d, a[1] + (b[1] - a[1]) * s / d)
        s -= d
    return pts[-1]


def petal_points(n=20000):
    """The petal plan's own formula, r(θ) = R (1 - d/2 + (d/2) cos(n θ)), turned and set at its place."""
    out = []
    t = math.radians(PETAL["turn"])
    for i in range(n):
        a = 2 * math.pi * i / n
        r = PETAL["R"] * (1 - PETAL["depth"] / 2 + PETAL["depth"] / 2 * math.cos(a * PETAL["lobes"]))
        x, y = r * math.cos(a), r * math.sin(a)
        out.append((PETAL["x"] + x * math.cos(t) - y * math.sin(t), PETAL["y"] + x * math.sin(t) + y * math.cos(t)))
    return out


# ------------------------------------------------------------------ read what was made
def box_in(building, obj):
    """An object's shape in the building's own frame: (xmin, ymin, zmin, xmax, ymax, zmax) m."""
    shape = obj.Shape.copy()
    shape.Placement = building.Placement.inverse().multiply(shape.Placement)
    bb = shape.optimalBoundingBox(False, False)  # from the geometry, never from triangles a window drew
    return tuple(v / MM for v in (bb.XMin, bb.YMin, bb.ZMin, bb.XMax, bb.YMax, bb.ZMax))


def inside(building, obj, x, y, z):
    """Whether a point of the building's frame (metres) lies in an object's solid."""
    return bool(obj.Shape.isInside(building.Placement.multVec(App.Vector(x * MM, y * MM, z * MM)), 0.5, True))


def piece_facts(b, obj):
    rel = b.Placement.inverse().multiply(obj.Placement)
    rx = rel.Rotation.multVec(App.Vector(1, 0, 0))
    if obj.Shape.isNull():  # a piece that could not be built: said as such, not a stop
        return {"label": obj.Label, "class": type(obj.Proxy).__name__, "ifc": str(getattr(obj, "IfcType", "")), "error": True, "solids": 0, "valid": False,
                "volume": float("nan"), "length": float("nan"), "box": NAN6, "at": tuple(v / MM for v in rel.Base),
                "turn": math.degrees(math.atan2(rx.y, rx.x)), "in_building": obj in b.Group}
    return {"label": obj.Label, "class": type(obj.Proxy).__name__, "ifc": str(getattr(obj, "IfcType", "")), "error": "Invalid" in obj.State,
            "solids": len(obj.Shape.Solids), "valid": bool(obj.Shape.isValid()), "volume": obj.Shape.Volume / 1e9, "length": obj.Shape.Length / MM,
            "box": box_in(b, obj), "at": tuple(v / MM for v in rel.Base), "turn": math.degrees(math.atan2(rx.y, rx.x)), "in_building": obj in b.Group}


def imported(doc, data, name):
    folder = scratch("organic-import-")
    path = os.path.join(folder, name)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=1)
    command = oc.ALL["Organic_ImportMap"]
    command.make(doc, path=path)
    doc.recompute()
    return command.last


def read_facts():
    try:
        return gather()
    finally:
        tidy()


def gather():
    data = sample()
    doc = App.newDocument("ImportCheck", "Import check", True, True)
    facts = {"sample": data, "file": "built-sample.json"}
    try:
        res = imported(doc, data, facts["file"])
        b = res["building"]
        ax = b.Placement.Rotation.multVec(App.Vector(1, 0, 0))
        site = next(o for o in doc.Objects if getattr(o, "IfcType", "") == "Site")
        facts["building"] = {"label": b.Label, "base": tuple(v / MM for v in b.Placement.Base), "yaw": math.degrees(math.atan2(ax.y, ax.x)),
                             "map_file": os.path.basename(getattr(b, "MapFile", "")), "map_format": getattr(b, "MapFormat", ""), "map_id": getattr(b, "MapId", ""),
                             "site": (float(site.Longitude), float(site.Latitude), site.Elevation.Value / MM), "in_site": b in site.Group}
        facts["notes"] = list(res["notes"])
        facts["made"] = {key: piece_facts(b, obj) for key, obj in res["made"].items()}
        room, garden, leaf = res["made"]["w-room"], res["made"]["w-garden"], res["made"]["l-leaf"]
        facts["made"]["w-room"].update(
            openings=len(room.OpeningPositions), positions=list(room.OpeningPositions),
            door_open=not inside(b, room, 4.0, 0.0, 1.0), door_twin_solid=inside(b, room, 4.0, 5.0, 1.0),          # 4.0 m along is on the south run
            window_open=not inside(b, room, 8.0, 2.5, 1.5), window_twin_solid=inside(b, room, 0.0, 2.5, 1.5),      # 10.5 m along is on the east run
            under_door_solid=inside(b, room, 4.0, 0.0, -0.25))                                                     # the foundation runs on under the door
        hole, solid = along_the_map(GARDEN, 6.0), along_the_map(GARDEN, 7.5)
        facts["made"]["w-garden"].update(line=garden.CentrelineLength, top=str(garden.Top), position=list(garden.OpeningPositions),
                                         open_there=not inside(b, garden, hole[0], hole[1], 0.6), solid_beside=inside(b, garden, solid[0], solid[1], 0.6),
                                         curve_edges=len(garden.Base.Shape.Edges))
        facts["made"]["l-leaf"].update(ridge=list(leaf.RidgeHeights), outline=str(leaf.Outline))
        # the map's second piece: a leaf with a straight midrib (and the same leaf with the swing it grows with), the steps' own count
        even, flight, bent = res["made"]["l-even"], res["made"]["st-1"], res["made"]["v-bent"]
        third = -even.Spine.Value / MM / 6  # where the midrib's first inner point stands along the spine

        def lean():
            """How much higher the leaf's top stands 1 m to the left of its spine than 1 m to the right, there."""
            own = even.Shape.copy()
            own.Placement = App.Placement()
            tops = []
            for y in (1.0, -1.0):
                inside = own.common(Part.makeLine(App.Vector(third * MM, y * MM, -50 * MM), App.Vector(third * MM, y * MM, 50 * MM)))
                tops.append(max(v.Point.z for v in inside.Vertexes) / MM)
            return tops[0] - tops[1]

        facts["made"]["l-even"].update(asymmetry=float(even.Asymmetry), lean=lean())
        even.Asymmetry = 1.0
        doc.recompute()
        facts["made"]["l-even"]["lean_as_it_grows"] = lean()
        even.Asymmetry = 0.0
        doc.recompute()
        facts["made"]["st-1"].update(count=int(flight.StepCount), rise=float(flight.Rise), run=float(flight.Run))
        facts["made"]["v-bent"].update(base=bent.Base.Label if bent.Base is not None else None)
        # there and back
        out = scratch("organic-import-out-")
        rep = oc.ALL["Organic_ExportGodot"].send([b], out)
        facts["back"] = {"placement": rep["placement"], "built_from": rep.get("built_from"), "elements": len(rep["elements"]), "files": sorted(os.listdir(out))}
        # a building the map shows larger
        res2 = imported(doc, scaled_sample(), "scaled-sample.json")
        b2 = res2["building"]
        wall, slab = res2["made"]["w"], res2["made"]["s"]
        facts["scaled"] = {"wall": piece_facts(b2, wall), "slab": piece_facts(b2, slab), "notes": list(res2["notes"]), "position": list(wall.OpeningPositions),
                           "open_there": not inside(b2, wall, 1.5, 0.0, 1.5), "solid_before": inside(b2, wall, 0.5, 0.0, 1.5), "scale": res2["scale"]}
    finally:
        App.closeDocument(doc.Name)
    # Z. the same file realized, as the map calls for it: realize.py's own function, the design saved, the files read back here
    realize = runpy.run_path(os.path.join(HERE, "realize.py"), run_name="organic_realize")["realize"]
    folder = scratch("organic-realize-")
    records = os.path.join(folder, facts["file"])
    with open(records, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=1)
    result = realize(records)
    out = os.path.join(folder, "realized")
    stem = os.path.splitext(facts["file"])[0]
    facts["realized"] = {"result": {k: result.get(k) for k in ("ok", "complete", "error", "notes", "site_notes", "envelope", "pieces", "made", "solids", "scale")},
                         "files": sorted(os.listdir(out)) if os.path.isdir(out) else [], "stem": stem, "nodes": {}, "sidecar": {}, "written": {}}
    if result.get("ok"):
        facts["realized"]["nodes"] = glb_nodes(os.path.join(out, stem + ".glb"))
        with open(os.path.join(out, stem + ".json"), encoding="utf-8") as fh:
            side = json.load(fh)
        facts["realized"]["sidecar"] = {"placement": side["placement"], "built_from": side.get("built_from"), "source_path": side.get("source_path"),
                                        "source_there": os.path.isfile(side.get("source_path", "")),
                                        "source_is_design": os.path.normcase(side.get("source_path", "")) == os.path.normcase(os.path.join(out, stem + ".FCStd")),
                                        "pieces": sorted(e.get("piece", "") for e in side["elements"]),
                                        "land": {e.get("piece"): e["land"] for e in side["elements"] if e.get("land") is not None}, "building_land": side.get("land"),
                                        "notes": side.get("notes"), "envelope": side.get("envelope")}
        with open(os.path.join(out, stem + ".result.json"), encoding="utf-8") as fh:
            written = json.load(fh)
        facts["realized"]["written"] = {"ok": written.get("ok"), "complete": written.get("complete"), "notes": written.get("notes"),
                                        "site_notes": written.get("site_notes"), "elements": {e["piece"]: e for e in written.get("elements", [])}}
    with open(SAMPLE, encoding="utf-8") as fh:
        facts["repo_sample"] = json.load(fh)
    facts["anchor"] = canonical_frame()
    return facts


def glb_nodes(path):
    """A .glb read back here, by its own bytes: {piece id: {name, triangles, volume (m³, enclosed
    by its triangles: the divergence theorem), box}} for every node that carries a mesh."""
    with open(path, "rb") as fh:
        raw = fh.read()
    jlen = struct.unpack("<I", raw[12:16])[0]
    gltf = json.loads(raw[20:20 + jlen])
    blob = raw[28 + jlen:]
    out = {}

    def numbers(index, fmt, width):
        acc = gltf["accessors"][index]
        view = gltf["bufferViews"][acc["bufferView"]]
        start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        return struct.unpack_from("<%d%s" % (acc["count"] * width, fmt), blob, start)

    for node in gltf["nodes"]:
        if "mesh" not in node:
            continue
        prim = gltf["meshes"][node["mesh"]]["primitives"][0]
        p = numbers(prim["attributes"]["POSITION"], "f", 3)
        idx = numbers(prim["indices"], "I", 1)
        volume = 0.0
        for a, b, c in zip(idx[0::3], idx[1::3], idx[2::3]):
            ax, ay, az, bx, by, bz, cx, cy, cz = p[3 * a], p[3 * a + 1], p[3 * a + 2], p[3 * b], p[3 * b + 1], p[3 * b + 2], p[3 * c], p[3 * c + 1], p[3 * c + 2]
            volume += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)
        key = (node.get("extras") or {}).get("piece") or "no piece: %s" % node.get("name")
        out[key] = {"name": node.get("name"), "triangles": len(idx) // 3, "volume": volume / 6.0,
                    "box": (min(p[0::3]), min(p[1::3]), min(p[2::3]), max(p[0::3]), max(p[1::3]), max(p[2::3]))}
    return out


# ------------------------------------------------------------------ judge
def near(got, want, tol):
    return got is not None and len(got) == len(want) and all(abs(g - w) <= tol for g, w in zip(got, want))


NAN6 = (float("nan"),) * 6


def judge(facts):
    oks, fails = [], []

    def ok(cond, msg):
        (oks if cond else fails).append(msg)

    data, made, b = facts["sample"], facts["made"], facts["building"]
    par = {p["id"]: p.get("params", {}) for p in data["pieces"]}
    spot = {p["id"]: p.get("placement", {}) for p in data["pieces"]}
    alng, alat, aelev = facts["anchor"]

    # I. where it stands
    kx, ky = wgs84_metres_per_degree(alat)
    lng, lat = data["placement"]["coordinates"]
    east, north, up = (lng - alng) * kx, (lat - alat) * ky, data["placement"]["altitude_m"]
    ok(b["in_site"] and abs(b["site"][0] - alng) < 1e-9 and abs(b["site"][1] - alat) < 1e-9 and abs(b["site"][2] - aelev) < 1e-6
       and math.hypot(b["base"][0] - east, b["base"][1] - north) <= 0.03 and abs(b["base"][2] - up) <= 0.001,
       "I the building stands where the file says: %.2f m east, %.2f m north of the anchor, %+.3f m (from its longitude and latitude by WGS84: %.2f, %.2f; its altitude_m %+.3f)"
       % (b["base"][0], b["base"][1], b["base"][2], east, north, up))
    ok(abs((b["yaw"] - data["placement"]["rotation_deg"]["y"] + 180) % 360 - 180) <= 1e-6,
       "I turned %.2f° anticlockwise (the file's rotation_deg.y: %.2f)" % (b["yaw"], data["placement"]["rotation_deg"]["y"]))
    ok(b["label"] == data["name"] and b["map_file"] == facts["file"] and b["map_format"] == "built/1" and b["map_id"] == data["id"],
       "I the building is named %r and keeps the file and the id it came from (%s, %s, %s)" % (b["label"], b["map_file"], b["map_format"], b["map_id"]))
    ok(facts["repo_sample"] == data, "I the sample kept in the repository (freecad/samples/built-sample.json) is the one checked here")
    want = [p["id"] for p in data["pieces"] if p["type"] != "Pool"]
    solids = [k for k in want if not k.startswith("c-")]
    ok(sorted(made) == sorted(want) and all(made[k]["in_building"] and not made[k]["error"] for k in want)
       and all(made[k]["valid"] and made[k]["solids"] == 1 for k in solids),
       "I every piece rebuilt in the building: %d of %d, %d curves and %d solids, each one valid solid (%s)"
       % (len(made), len(want), len(made) - len([k for k in solids if k in made]), len([k for k in solids if k in made]),
          ", ".join("%s: %s" % (k, made[k]["class"]) for k in solids if k in made)))

    # W. walls
    room, e = made.get("w-room", {}), par["w-room"]
    pts = par["c-room"]["Points"]
    perimeter = sum(math.dist(p, q) for p, q in zip(pts, pts[1:] + pts[:1]))
    took = sum(w * h * e["Thickness"] for w, h in zip(e["OpeningWidths"], e["OpeningHeights"]))
    exact = perimeter * e["Thickness"] * (e["Height"] + e["Foundation"]) - took
    half = e["Thickness"] / 2
    ok(room and abs(room["volume"] - exact) <= 0.001 * exact
       and near(room["box"], (-half, -half, -e["Foundation"], 8.0 + half, 5.0 + half, e["Height"]), 0.003),
       "W the room wall: %.4f m³ (perimeter %.1f x t x (H + foundation), less a door and a window: %.4f), from %.2f m below its base to %.2f m above"
       % (room.get("volume", float("nan")), perimeter, exact, e["Foundation"], e["Height"]))
    ok(room and room["openings"] == 2 and near(room["positions"], e["OpeningPositions"], 1e-6) and room["door_open"] and room["door_twin_solid"]
       and room["under_door_solid"] and room["window_open"] and room["window_twin_solid"],
       "W its door 4.0 m and its window 10.5 m along the line from its first point: each open there, solid in the run opposite, the foundation on under the door")
    wing, e = made.get("w-wing", {}), par["w-wing"]
    t = e["Thickness"]
    exact = (8.0 * t - t * t) * e["Height"]
    ok(wing and abs(wing["volume"] - exact) <= 0.001 * exact and near(wing["box"], (8.0, 5.0, 0.0, 12.0, 9.0, e["Height"]), 0.003),
       "W the wing wall, two runs standing left of their line: %.4f m³ ((8 t - t²) H = %.4f), inside its corner (x %.2f..%.2f, y %.2f..%.2f)"
       % (wing.get("volume", float("nan")), exact, wing.get("box", NAN6)[0], wing.get("box", NAN6)[3], wing.get("box", NAN6)[1], wing.get("box", NAN6)[4]))
    garden, e = made.get("w-garden", {}), par["w-garden"]
    length = smooth_length(GARDEN)
    exact = e["Thickness"] * length * (e["Height"] + e["TopRise"] / 2) - e["OpeningWidths"][0] * e["OpeningHeights"][0] * e["Thickness"]
    ok(garden and garden["curve_edges"] == 1 and abs(garden["line"] - length) <= 1e-4 * length and abs(garden["volume"] - exact) <= 0.004 * exact
       and abs(garden["box"][5] - (e["Height"] + e["TopRise"])) <= 0.01,
       "W the garden wall on the map's smooth curve through 5 points: %.4f m long (its cubic spans, integrated here: %.4f), %.4f m³ (t L (H + rise / 2) less its opening = %.4f), its waves up to %.2f m"
       % (garden.get("line", float("nan")), length, garden.get("volume", float("nan")), exact, garden.get("box", NAN6)[5]))
    ok(garden and garden["open_there"] and garden["solid_beside"] and abs(garden["position"][0] - 6.0) <= 0.02,
       "W its opening stands where the map measured it, 6.0 m along the map's own drawn points (%.4f m along the true curve): open there, solid 1.5 m further"
       % (garden["position"][0] if garden else float("nan")))
    petal, e = made.get("w-petal", {}), par["w-petal"]
    ring = petal_points()
    length = sum(math.dist(p, q) for p, q in zip(ring, ring[1:] + ring[:1]))
    exact = e["Thickness"] * e["Height"] * length
    half = e["Thickness"] / 2
    xs, ys = [p[0] for p in ring], [p[1] for p in ring]
    ok(petal and abs(petal["volume"] - exact) <= 0.005 * exact
       and near(petal["box"], (min(xs) - half, min(ys) - half, 0.0, max(xs) + half, max(ys) + half, e["Height"]), 0.02),
       "W the petal wall on a lobed plan of radius %.1f m, turned %.0f°, at (%.1f, %.1f): %.4f m³ (t H L = %.4f, L = %.3f m from the petal's formula), x %.2f..%.2f (worked out here: %.2f..%.2f)"
       % (PETAL["R"], PETAL["turn"], PETAL["x"], PETAL["y"], petal.get("volume", float("nan")), exact, length,
          petal.get("box", NAN6)[0], petal.get("box", NAN6)[3], min(xs) - half, max(xs) + half))

    # S. slabs
    floor, e = made.get("s-floor", {}), par["s-floor"]
    i = e["Inset"]
    exact = (8.0 - 2 * i) * (5.0 - 2 * i) * e["Thickness"]
    ok(floor and abs(floor["volume"] - exact) <= 0.001 * exact and near(floor["box"], (i, i, -e["Thickness"], 8.0 - i, 5.0 - i, 0.0), 0.003),
       "S the floor on the room's line, inset %.2f m: %.4f m³ ((a - 2 i)(b - 2 i) t = %.4f), its top on the line" % (i, floor.get("volume", float("nan")), exact))
    for key, word in (("s-step", "the door step (a Step is a slab)"), ("s-bench", "the bench")):
        slab, e, c = made.get(key, {}), par[key], key.replace("s-", "c-")
        r, at = par[c]["Radius"], spot[c]
        exact = math.pi * r * r * e["Thickness"]
        ok(slab and slab["class"] == "Slab" and abs(slab["volume"] - exact) <= 0.001 * exact
           and near(slab["box"], (at["x"] - r, at["y"] - r, e["BaseOffset"] - e["Thickness"], at["x"] + r, at["y"] + r, e["BaseOffset"]), 0.005),
           "S %s, round: %.4f m³ (π r² t = %.4f), about (%.1f, %.1f), its top %+.2f m from its line (BaseOffset)"
           % (word, slab.get("volume", float("nan")), exact, at["x"], at["y"], e["BaseOffset"]))

    # R. roofs and shells
    roof, e = made.get("r-room", {}), par["r-room"]
    o = e["Overhang"]
    ok(roof and abs(roof["box"][5] - (e["Eaves"] + e["Rise"])) <= 0.05 and near(roof["box"][:2] + roof["box"][3:5], (-o, -o, 8.0 + o, 5.0 + o), 0.01),
       "R the shell roof over the room: its crown %.2f m up (eaves %.1f + rise %.1f), its eave %.2f m beyond the wall's line all round (x %.2f..%.2f, y %.2f..%.2f)"
       % (roof.get("box", NAN6)[5], e["Eaves"], e["Rise"], o, roof.get("box", NAN6)[0], roof.get("box", NAN6)[3], roof.get("box", NAN6)[1], roof.get("box", NAN6)[4]))
    dome, e, at = made.get("d-dome", {}), par["d-dome"], spot["d-dome"]
    big, t = e["Radius"], e["Thickness"]
    exact = 2 / 3.0 * math.pi * (big ** 3 - (big - t) ** 3)
    ok(dome and abs(dome["volume"] - exact) <= 0.001 * exact
       and near(dome["box"], (at["x"] - big, at["y"] - big, 0.0, at["x"] + big, at["y"] + big, e["Rise"]), 0.005),
       "R the dome, a hemisphere: %.4f m³ (2/3 π (R³ - (R - t)³) = %.4f), about (%.1f, %.1f)" % (dome.get("volume", float("nan")), exact, at["x"], at["y"]))
    vault, e, at = made.get("v-vault", {}), par["v-vault"], spot["v-vault"]
    ri, t, length, p = e["Span"] / 2, e["Thickness"], e["VaultLength"], e["Plinth"]
    exact = math.pi / 2 * ((ri + t) ** 2 - ri ** 2) * length + 2 * t * length * p
    ok(vault and abs(vault["volume"] - exact) <= 0.001 * exact and abs(vault["turn"] - at["rot"]) <= 1e-6
       and near(vault["box"], (at["x"] - length / 2, at["y"] - ri - t, -p, at["x"] + length / 2, at["y"] + ri + t, ri + t), 0.005),
       "R the vault on its plinth, turned a quarter turn: %.4f m³ (π/2 (Ro² - Ri²) L + 2 t L p = %.4f), its barrel along x (x %.2f..%.2f), from %.2f m below its springings"
       % (vault.get("volume", float("nan")), exact, vault.get("box", NAN6)[0], vault.get("box", NAN6)[3], p))
    leaf, e, at = made.get("l-leaf", {}), par["l-leaf"], spot["l-leaf"]
    ok(leaf and near(leaf["at"], (at["x"], at["y"], 0.0), 1e-6) and abs(leaf["turn"] - at["rot"]) <= 1e-6 and near(leaf["ridge"], e["RidgeHeights"], 1e-9)
       and leaf["outline"] == "Pointed" and abs(leaf["box"][2] + e["Plinth"]) <= 0.01 and abs(leaf["box"][5] - max(e["RidgeHeights"])) <= 0.25,
       "R the leaf roof at (%.1f, %.1f) turned %.2f°, its ridge %s m, from %.3f m (footings %.2f m down) to %.3f m up (its highest ridge point %.1f)"
       % (leaf.get("at", NAN6)[0], leaf.get("at", NAN6)[1], leaf.get("turn", float("nan")), leaf.get("ridge"), leaf.get("box", NAN6)[2], e["Plinth"],
          leaf.get("box", NAN6)[5], max(e["RidgeHeights"])))

    # P. the map's second piece of work: a dome on an oval, a leaf with a straight midrib, a vault along a curve, steps
    oval, e, at = made.get("d-oval", {}), par["d-oval"], spot["d-oval"]
    big, high, t = e["Radius"], e["Rise"], e["Thickness"]
    rho = (big * big + high * high) / (2 * high)
    cap = lambda r, h: math.pi * h * h * (3 * r - h) / 3  # a sphere's cap of height h
    exact = (cap(rho, high) - cap(rho - t, high - t)) * e["StretchX"] * e["StretchY"]
    a, b, th = big * e["StretchX"], big * e["StretchY"], math.radians(at["turn"])
    hx, hy = math.hypot(a * math.cos(th), b * math.sin(th)), math.hypot(a * math.sin(th), b * math.cos(th))
    ok(oval and abs(oval["volume"] - exact) <= 0.002 * exact and abs(oval["turn"] - at["turn"]) <= 1e-6
       and near(oval["box"], (at["x"] - hx, at["y"] - hy, 0.0, at["x"] + hx, at["y"] + hy, high), 0.01),
       "P the dome on an oval, stretched %.2f by %.2f and turned %.0f°: %.4f m³ (the round cap shell times the two stretches = %.4f), %.2f by %.2f m in plan about (%.1f, %.1f) (the turned oval's box, worked out here: %.2f by %.2f)"
       % (e["StretchX"], e["StretchY"], at["turn"], oval.get("volume", float("nan")), exact, oval.get("box", NAN6)[3] - oval.get("box", NAN6)[0],
          oval.get("box", NAN6)[4] - oval.get("box", NAN6)[1], at["x"], at["y"], 2 * hx, 2 * hy))
    even = made.get("l-even", {})
    ok(even and even["asymmetry"] == 0.0 and abs(even["lean"]) <= 0.0005 and abs(even["lean_as_it_grows"]) >= 0.003,
       "P the leaf with a straight midrib (Asymmetry 0) is the same either side of its spine: a third along, its top 1 m to the left stands %+.4f m above its top 1 m to the right (the same leaf with the swing it grows with: %+.4f m)"
       % (even.get("lean", float("nan")), even.get("lean_as_it_grows", float("nan"))))
    bent, e = made.get("v-bent", {}), par["v-bent"]
    ri, t, p = e["Span"] / 2, e["Thickness"], e["Plinth"]
    section = math.pi / 2 * ((ri + t) ** 2 - ri ** 2) + 2 * t * p
    length = smooth_length(SPINE)
    exact = section * length
    ok(bent and bent["base"] == "Vault spine" and abs(bent["volume"] - exact) <= 0.005 * exact and abs(bent["box"][2] + p) <= 0.005 and abs(bent["box"][5] - (ri + t)) <= 0.005,
       "P the vault along a drawn curve: %.4f m³ (its section π/2 (Ro² - Ri²) + 2 t p = %.4f m² times the curve's length, %.4f m integrated here: %.4f), from %.2f m below its springings to %.2f m above"
       % (bent.get("volume", float("nan")), section, length, exact, p, ri + t))
    flight, e = made.get("st-1", {}), par["st-1"]
    climb, run_all = e["To"][2] - e["From"][2], math.dist(e["From"][:2], e["To"][:2])
    count = max(1, int(math.ceil(climb / 0.17 - 0.0001)))
    rise, run = climb / count, run_all / count
    exact = run * e["Width"] * (count * e["Foundation"] + rise * count * (count + 1) / 2)
    ok(flight and flight["class"] == "Steps" and flight["ifc"] == "Stair" and flight["count"] == count and abs(flight["rise"] - rise) <= 1e-9 and abs(flight["run"] - run) <= 1e-9
       and abs(flight["volume"] - exact) <= 0.0005 * exact
       and near(flight["box"], (e["From"][0], e["From"][1] - e["Width"] / 2, e["From"][2] - e["Foundation"], e["To"][0], e["To"][1] + e["Width"] / 2, e["To"][2]), 0.002),
       "P the steps: %s of %.3f m each over a run of %.2f m (the climb %.2f m at 0.17 m a step: %d), %.4f m³ (each tread down to the ground: %.4f), an IfcStair"
       % (flight.get("count"), flight.get("rise", float("nan")), flight.get("run", float("nan")), climb, count, flight.get("volume", float("nan")), exact))

    # X. a building the map shows larger
    sc = facts["scaled"]
    k = 1.5
    wall = (4.0 * k) * (0.2 * k) * (2.0 * k) - (0.8 * k) * (1.0 * k) * (0.2 * k)
    slab = math.pi * (1.0 * k) ** 2 * (0.2 * k)
    ok(abs(sc["scale"] - k) <= 1e-9 and abs(sc["wall"]["volume"] - wall) <= 0.001 * wall and near(sc["wall"]["box"], (0.0, -0.1 * k, 0.0, 4.0 * k, 0.1 * k, 2.0 * k), 0.003)
       and abs(sc["position"][0] - 1.0 * k) <= 1e-6 and sc["open_there"] and sc["solid_before"]
       and abs(sc["slab"]["volume"] - slab) <= 0.001 * slab and near(sc["slab"]["box"][:2] + sc["slab"]["box"][3:5], (3.0 * k - k, 2.0 * k - k, 3.0 * k + k, 2.0 * k + k), 0.008)
       and any("1.5 times" in n for n in sc["notes"]),
       "X a building the map shows at 1.5 times its numbers: its wall %.4f m³ (6.0 x 0.3 x 3.0 less an opening 1.2 x 1.5 x 0.3: %.4f), the opening 1.5 m along, its slab %.4f m³ (π 1.5² 0.3 = %.4f) about (4.5, 3.0); and it says so"
       % (sc["wall"]["volume"], wall, sc["slab"]["volume"], slab))

    # N. nothing dropped in silence
    notes = facts["notes"]
    pool = [x for x in notes if "x-pool" in x and "not known" in x]
    colour = [x for x in notes if "c-bench" in x and "Colour" in x and "left out" in x]
    ok(len(pool) == 1 and len(colour) == 1 and len(notes) == 2 and "x-pool" not in made,
       "N what was not understood is said, and nothing else: %s" % ("; ".join(notes) or "no note at all"))

    # T. there and back
    back = facts.get("back", {})
    pl = back.get("placement", {})
    ok(bool(pl) and math.dist(pl["coordinates"], data["placement"]["coordinates"]) <= 2e-7 and abs(pl["altitude_m"] - data["placement"]["altitude_m"]) <= 0.001
       and abs((pl["rotation_deg"]["y"] - data["placement"]["rotation_deg"]["y"] + 180) % 360 - 180) <= 1e-4
       and back.get("built_from") == facts["file"] and back.get("elements") == len(solids),
       "T sent to the map again it says the same place the file said (lng %.7f, lat %.7f, altitude %+.3f m, turned %.2f°), %s solids, and names %s"
       % (pl.get("coordinates", [0, 0])[0], pl.get("coordinates", [0, 0])[1], pl.get("altitude_m", float("nan")), pl.get("rotation_deg", {}).get("y", float("nan")),
          back.get("elements"), back.get("built_from")))

    # Z. realized: the same file through realize.py, as the map calls for it
    z = facts.get("realized", {})
    res, nodes, side, written = z.get("result", {}), z.get("nodes", {}), z.get("sidecar", {}), z.get("written", {})
    stem = z.get("stem", "")
    notes = res.get("notes") or []
    ok(res.get("ok") is True and res.get("complete") is False and not res.get("error")
       and z.get("files") == sorted(stem + ext for ext in (".FCStd", ".glb", ".ifc", ".json", ".result.json"))
       and res.get("pieces") == len(data["pieces"]) and res.get("made") == len(want) and res.get("solids") == len(solids)
       and len(notes) == 2 and any("x-pool" in n for n in notes) and any("Colour" in n for n in notes)
       and written.get("ok") is True and written.get("complete") is False and written.get("notes") == notes,
       "Z realized without the window: %s written; %s of %s pieces made, %s solids; not complete, and it says why (%d notes: the pool, the colour), on its line and in its result file"
       % (", ".join(z.get("files", [])) or "nothing", res.get("made"), res.get("pieces"), res.get("solids"), len(notes)))
    worst = max([abs(nodes[k]["volume"] / made[k]["volume"] - 1.0) for k in solids if k in nodes and k in made] or [float("nan")])
    ok(sorted(nodes) == sorted(solids) and worst <= 0.01
       and all(nodes[k]["triangles"] == written["elements"].get(k, {}).get("triangles") and nodes[k]["name"] == made[k]["label"] for k in solids)
       and side.get("pieces") == sorted(solids),
       "Z every solid of the file is a node of its .glb under its piece's own id, named as in the file, its triangles (counted here: %d) enclosing its solid's volume (worst %.2f %% off; 1 %% allowed)"
       % (sum(n["triangles"] for n in nodes.values()), 100 * worst))
    pl = side.get("placement", {})
    ok(bool(pl) and math.dist(pl["coordinates"], data["placement"]["coordinates"]) <= 2e-7 and abs(pl["altitude_m"] - data["placement"]["altitude_m"]) <= 0.001
       and abs((pl["rotation_deg"]["y"] - data["placement"]["rotation_deg"]["y"] + 180) % 360 - 180) <= 1e-4
       and side.get("built_from") == facts["file"] and side.get("source_there") and side.get("source_is_design"),
       "Z it stands where the file says (lng %.7f, lat %.7f, altitude %+.3f m, turned %.2f°), names the records it came from (%s) and the design saved beside it (%s, there: %s)"
       % (pl.get("coordinates", [0, 0])[0], pl.get("coordinates", [0, 0])[1], pl.get("altitude_m", float("nan")), pl.get("rotation_deg", {}).get("y", float("nan")),
          side.get("built_from"), os.path.basename(side.get("source_path") or "none"), side.get("source_there")))
    carried = {p["id"]: p["land"] for p in data["pieces"] if "land" in p}
    ok(side.get("land") == carried and side.get("building_land") == data.get("land"),
       "Z what the map read of the land is carried through as written: at %d piece (%s) and at the building (%s)"
       % (len(side.get("land") or {}), json.dumps(side.get("land")), json.dumps(side.get("building_land"))))
    site = res.get("site_notes")
    ok(isinstance(site, list) and site == side.get("notes") and written.get("site_notes") == site and res.get("envelope") == side.get("envelope")
       and not any(n in notes for n in site),
       "Z what the map's files say of the place is kept apart from what was lost: %d line(s) about the place, the .json's own (%s), none of them among the %d notes"
       % (len(site or []), "; ".join(n[:70] for n in (site or [])) or "the land's files hold nothing against it, or are not in the folder", len(notes)))
    return oks, fails


# ------------------------------------------------------------------ forgeries
def forgeries(facts):
    def f(change):
        g = copy.deepcopy(facts)
        change(g)
        return g

    def box(g, key, **moved):
        b = list(g["made"][key]["box"])
        for i, v in moved.items():
            b[int(i[1:])] = v
        g["made"][key]["box"] = tuple(b)

    def mirrored(g):  # north mirrored: every y of the room wall's box the other way round
        b = g["made"]["w-room"]["box"]
        g["made"]["w-room"]["box"] = (b[0], -b[4], b[2], b[3], -b[1], b[5])

    def fitted(g):  # the smooth wall on a fitted curve of another length, in several pieces
        w = g["made"]["w-garden"]
        w.update(line=w["line"] * 1.004, curve_edges=4)

    def unscaled(g):
        s = g["scaled"]
        s["wall"].update(volume=4.0 * 0.2 * 2.0 - 0.8 * 1.0 * 0.2, box=(0.0, -0.1, 0.0, 4.0, 0.1, 2.0))
        s["position"] = [1.0]

    return [
        ("north mirrored", "W the room wall", f(mirrored)),
        ("the turn clockwise", "I turned", f(lambda g: g["building"].__setitem__("yaw", -g["building"]["yaw"]))),
        ("the altitude dropped", "I the building stands", f(lambda g: g["building"].__setitem__("base", g["building"]["base"][:2] + (0.0,)))),
        ("the building a metre east", "I the building stands", f(lambda g: g["building"].__setitem__("base", (g["building"]["base"][0] + 1.0,) + g["building"]["base"][1:]))),
        ("a curve not made", "I every piece rebuilt", f(lambda g: g["made"].pop("c-wing"))),
        ("the door measured from the wall's other end", "W its door", f(lambda g: g["made"]["w-room"].update(door_open=False, door_twin_solid=False))),
        ("the window left out", "W its door", f(lambda g: g["made"]["w-room"].update(openings=1, positions=[4.0], window_open=False))),
        ("a wall half as thick", "W the room wall", f(lambda g: g["made"]["w-room"].__setitem__("volume", g["made"]["w-room"]["volume"] / 2))),
        ("the L standing right of its line", "W the wing wall", f(lambda g: g["made"]["w-wing"].update(volume=(8.0 * 0.25 + 0.25 ** 2) * 2.2, box=(8.0, 4.75, 0.0, 12.25, 9.0, 2.2)))),
        ("the smooth wall on a fitted curve, not the map's", "W the garden wall", f(fitted)),
        ("the garden wall's opening 0.4 m off", "W its opening", f(lambda g: g["made"]["w-garden"].update(open_there=False, position=[6.4]))),
        ("the petal plan not turned", "W the petal wall", f(lambda g: box(g, "w-petal", i0=g["made"]["w-petal"]["box"][0] + 0.12, i3=g["made"]["w-petal"]["box"][3] + 0.12))),
        ("the floor not inset", "S the floor", f(lambda g: g["made"]["s-floor"].update(volume=8.0 * 5.0 * 0.25, box=(0.0, 0.0, -0.25, 8.0, 5.0, 0.0)))),
        ("the step left at the origin", "S the door step", f(lambda g: g["made"]["s-step"].__setitem__("box", (-0.9, -0.9, -0.45, 0.9, 0.9, -0.15)))),
        ("the bench not raised", "S the bench", f(lambda g: box(g, "s-bench", i2=-0.45, i5=0.0))),
        ("the vault not turned", "R the vault", f(lambda g: g["made"]["v-vault"].update(turn=0.0, box=(13.3, -3.0, -0.4, 16.7, 3.0, 1.7)))),
        ("the dome off its place", "R the dome", f(lambda g: box(g, "d-dome", i0=-2.5, i3=2.5))),
        ("the leaf's ridge the toolbar's own", "R the leaf roof", f(lambda g: g["made"]["l-leaf"].__setitem__("ridge", [3.0, 7.2, 9.8, 3.0]))),
        ("the roof's eave on the wall's line", "R the shell roof", f(lambda g: box(g, "r-room", i0=0.0, i1=0.0, i3=8.0, i4=5.0))),
        ("the oval dome left round", "P the dome on an oval", f(lambda g: g["made"]["d-oval"].update(
            volume=g["made"]["d-oval"]["volume"] / (1.2 * 0.75), box=(OVAL["x"] - 2.0, OVAL["y"] - 2.0, 0.0, OVAL["x"] + 2.0, OVAL["y"] + 2.0, 1.5)))),
        ("a piece's turn not read", "P the dome on an oval", f(lambda g: g["made"]["d-oval"].update(turn=0.0, box=(OVAL["x"] - 2.4, OVAL["y"] - 1.5, 0.0, OVAL["x"] + 2.4, OVAL["y"] + 1.5, 1.5)))),
        ("the leaf's midrib left swinging", "P the leaf with a straight midrib", f(lambda g: g["made"]["l-even"].__setitem__("lean", g["made"]["l-even"]["lean_as_it_grows"]))),
        ("the vault on a curve built straight", "P the vault along a drawn curve", f(lambda g: g["made"]["v-bent"].update(base=None, volume=g["made"]["v-bent"]["volume"] * 8.6 / smooth_length(SPINE)))),
        ("the steps one short", "P the steps", f(lambda g: g["made"]["st-1"].update(count=5, rise=1.02 / 5, run=0.6))),
        ("the map's scale not applied", "X a building the map shows", f(unscaled)),
        ("a note swallowed", "N what was not understood", f(lambda g: g["notes"].pop())),
        ("the way back a metre off", "T sent to the map again", f(lambda g: g["back"]["placement"].__setitem__("coordinates", [g["back"]["placement"]["coordinates"][0] + 1.0 / 91916.198, g["back"]["placement"]["coordinates"][1]]))),
        ("the sample in the repository another one", "I the sample kept", f(lambda g: g["repo_sample"].__setitem__("name", "another"))),
        ("realize calling itself complete with a piece left out", "Z realized without the window", f(lambda g: g["realized"]["result"].__setitem__("complete", True))),
        ("the realized .ifc not written", "Z realized without the window", f(lambda g: g["realized"]["files"].remove(g["realized"]["stem"] + ".ifc"))),
        ("a solid missing from the realized .glb", "Z every solid of the file", f(lambda g: g["realized"]["nodes"].pop("d-dome"))),
        ("a realized solid without its piece's id", "Z every solid of the file",
         f(lambda g: g["realized"]["nodes"].__setitem__("no piece: Garden dome", g["realized"]["nodes"].pop("d-dome")))),
        ("a hole in a realized mesh", "Z every solid of the file", f(lambda g: g["realized"]["nodes"]["w-petal"].__setitem__("volume", g["realized"]["nodes"]["w-petal"]["volume"] * 0.9))),
        ("the realized building a metre east", "Z it stands where the file says",
         f(lambda g: g["realized"]["sidecar"]["placement"].__setitem__("coordinates", [g["realized"]["sidecar"]["placement"]["coordinates"][0] + 1.0 / 91916.198,
                                                                                          g["realized"]["sidecar"]["placement"]["coordinates"][1]]))),
        ("the realized design not saved", "Z it stands where the file says", f(lambda g: g["realized"]["sidecar"].__setitem__("source_there", False))),
        ("a piece's land readings dropped on the way", "Z what the map read of the land", f(lambda g: g["realized"]["sidecar"]["land"].clear())),
        ("a land reading changed on the way", "Z what the map read of the land", f(lambda g: g["realized"]["sidecar"]["land"]["w-garden"].__setitem__("slope_pct", 7.0))),
        ("a line about the place among what was lost", "Z realized without the window",
         f(lambda g: g["realized"]["result"]["notes"].append("by the map's build envelope, 66 % of it (its points in plan) lies under protected oaks"))),
        ("a line about the place that the .json does not have", "Z what the map's files say of the place",
         f(lambda g: g["realized"]["result"]["site_notes"].append("it stands on a road"))),
    ]


def write_sample():
    os.makedirs(os.path.dirname(SAMPLE), exist_ok=True)
    with open(SAMPLE, "w", encoding="utf-8") as fh:
        json.dump(sample(), fh, indent=1)
        fh.write("\n")
    print("wrote", SAMPLE)


def run(self_test=None):
    if self_test is None:
        self_test = os.environ.get("IMPORT_CHECK_SELF_TEST") == "1" or "--self-test" in sys.argv
    if not os.path.isfile(SAMPLE) or os.environ.get("IMPORT_CHECK_WRITE_SAMPLE") == "1":
        write_sample()
    facts = read_facts()
    oks, fails = judge(facts)
    for m in oks:
        print("OK  ", m)
    for m in fails:
        print("FAIL", m)
    if fails:
        print("check_import FAILED (%d of %d)" % (len(fails), len(oks) + len(fails)))
        return False
    print("check_import OK (%d checks)" % len(oks))
    if not self_test:
        return True
    caught = 0
    forged = forgeries(facts)
    for name, expect, g in forged:
        _o, f = judge(g)
        hit = next((m for m in f if m.startswith(expect)), None)
        if hit:
            print("SELF-TEST OK   %s is rejected (%s)" % (name, hit[:150]))
        elif f:
            print("SELF-TEST FAIL %s is rejected, but not by the check meant for it (%s...): %s" % (name, expect, f[0][:150]))
        else:
            print("SELF-TEST FAIL %s PASSED the check" % name)
        caught += bool(hit)
    print("check_import --self-test %s (%d/%d forgeries rejected)" % ("OK" if caught == len(forged) else "FAILED", caught, len(forged)))
    return caught == len(forged)


if __name__ == "__main__":
    result = run()
    if not App.GuiUp:
        sys.exit(0 if result else 1)
