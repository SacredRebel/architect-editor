# -*- coding: utf-8 -*-
"""check_toolbar — every button of the Organic workbench, pressed.

Runs inside FreeCAD 1.1 (the window through the FreeCAD MCP connector, or freecadcmd):

    exec(open(r".../freecad/check_toolbar.py", encoding="utf-8").read())
    # TOOLBAR_CHECK_SELF_TEST=1 (or "--self-test" in sys.argv) forges faults

It runs each command's own make() — the code its button runs — in a fresh document, twice:
with the building at the document's origin, and with the building where a real one stands
(116 m out, 6 m down, turned 30°). Without a window the selection is handed to make()
directly; what is left to the window is the button itself, its icon, and the clicked point.

Every expectation is derived here, not taken from the workbench:

  P. pressed: every command makes what it says; every solid is valid and closed (its
     triangles enclose its OCCT volume within 0.5 %); every object is made at the building
     (its own origin is the building's, plus the command's own offset); and it is the same
     shape wherever the building stands (its volume there within 0.05 % of the one at the
     origin). Every option of every list (plan curves, wall tops and sides, opening shapes,
     vault and dome profiles, leaf outlines, figures, solids) makes a valid shape.
  O. the Organic toolbar against closed forms: the curved wall t H R θ; the opening's volume
     as the integral of the chord through the wall's ring over the opening's outline; the
     arch's height (rise + ring) and its thrust line; the dome's and the saddle's boxes; the
     slab π r² t; the grown building's parts; the site of a new building against BRAIN.md §3;
     the files and the placement "Send to the map" writes.
  S. the Sacred toolbar: the seed of life's outline 4 π r; the icosahedron 5 (3 + √5) / 12 a³;
     the geodesic dome's vertices on its sphere and its shell inside the sphere's; this
     workbench's own sun (NOAA's equations) against the land pack's (astronomy-engine) at all
     eight stations of the year, within 0.1°; the sun rose's azimuths against the pack's file;
     "Turn to the sun": the building's own -Y axis at the pack's bearing, its parts carried
     along; the snap against the ratios and the module worked out here; the report's rows.
  B. the Biomimetic toolbar: the net's nodes in balance (forces summed here) and on the
     membrane's paraboloid, its laths' volume w d L; the hanging net below its ring; the
     cellular wall one solid, its open share by its volume against points sampled through
     it; the veined leaf a shell and its ribs under it; the branching column's tips n^levels,
     level, within the crown.

--self-test forges faults into what was read (a solid not valid, a hole in a mesh, a part
left at the document's origin, a shape that changes when the building turns, the wall half
as thick, the opening twice as wide, the sun 1° off, the building turned the wrong way, a
part left behind by the turn, a snap off its module, a report row missing, the net out of
balance, the net off its paraboloid, the cells closed, a rib above the shell, a column tip
short) and must see every one rejected by the check meant for it.
"""

import copy
import json
import math
import os
import re
import sys
import tempfile
import urllib.request

import FreeCAD as App
import Part

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Playground\Architect-editor\freecad"
sys.path.insert(0, os.path.join(HERE, "Organic"))
import organic_biomimetic as ob  # noqa: E402
import organic_commands as oc  # noqa: E402
import organic_export as ox  # noqa: E402
import organic_geom as og  # noqa: E402
import organic_objects as oo  # noqa: E402
import organic_sacred as sacred  # noqa: E402

PACK = os.environ.get("SITE_PACK_URL", "https://sulphur-mountain-world.vercel.app/")
BRAIN = os.environ.get("PLAYGROUND_BRAIN", r"C:\Playground\BRAIN.md")
MM = 1000.0
PHI = (1 + 5 ** 0.5) / 2
SPOT = App.Placement(App.Vector(-112e3, 31e3, -6.07e3), App.Rotation(App.Vector(0, 0, 1), -30.0))


# ------------------------------------------------------------------ independent pieces
def canonical_frame():
    with open(BRAIN, encoding="utf-8") as fh:
        text = fh.read().replace("−", "-").replace("*", "")
    section = text.split("## 3.", 1)[1].split("## 4.", 1)[0]
    origin = re.search(r"lng\s*(-?\d+\.\d+),\s*lat\s*(-?\d+\.\d+)", section)
    ground = re.search(r"(\d+\.\d+)\s*m NAVD88", section)
    return float(origin.group(1)), float(origin.group(2)), float(ground.group(1))


def fetch(path):
    req = urllib.request.Request(PACK + path, headers={"User-Agent": "check_toolbar"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except OSError:
            if attempt == 2:
                raise


def mesh_volume(shape, tol=2.0):
    v = 0.0
    for fc in shape.Faces:
        pts, tris = fc.tessellate(tol)
        for i, j, k in tris:
            v += pts[i].dot(pts[j].cross(pts[k]))
    return v / 6e9


def opening_volume(r_in, r_out, width, height, sill, steps=400):
    """What an arched opening takes out of a wall on a circle: the opening's outline (a
    rectangle under a half circle) is pushed straight through, so at each height the wall's
    ring loses the part within half the outline's width of the opening's axis:
    the integral over the height of the integral over the radius of 2 r asin(c / r)."""
    spring = max(sill, sill + height - width / 2)
    total = 0.0
    dz = (sill + height - sill) / steps
    for i in range(steps):
        z = sill + (i + 0.5) * dz
        c = width / 2 if z <= spring else math.sqrt(max(0.0, (width / 2) ** 2 - (z - spring) ** 2))
        dr = (r_out - r_in) / steps
        total += sum(2 * r * math.asin(min(1.0, c / r)) * dr for r in (r_in + (k + 0.5) * dr for k in range(steps))) * dz
    return total


def nearest(ratios, a, b):
    lo, hi = sorted((a, b))
    return min(ratios, key=lambda v: abs(lo / hi - v))


GOLDEN = [1.0, PHI ** -0.5, 1 / PHI, 5 ** -0.5, PHI ** -2, PHI ** -3]  # short : long, the system the snap is tried in


# ------------------------------------------------------------------ pressing the buttons
def press(name, doc, **kw):
    made = oc.ALL[name].make(doc, **kw)
    doc.recompute()
    return made


SCENES = [0]


def scene(turned):
    SCENES[0] += 1
    doc = App.newDocument("ToolbarCheck%d" % SCENES[0], "Toolbar check %d" % SCENES[0], True, True)
    b = press("Organic_NewBuilding", doc)[0]
    if b.Document.Name != doc.Name:
        raise RuntimeError("New organic building was made in %s, not in the document it was given" % b.Document.Name)
    if turned:
        b.Placement = SPOT
    return doc, b


def solid_facts(obj, building):
    shape = obj.Shape
    rel = building.Placement.inverse().multiply(obj.Placement)
    local = shape.copy()
    local.Placement = App.Placement()
    bb = local.optimalBoundingBox()
    return {
        "label": obj.Label, "error": "Invalid" in obj.State, "solids": len(shape.Solids),
        "valid": bool(shape.Solids) and all(s.isValid() for s in shape.Solids),
        "volume": shape.Volume / 1e9, "mesh": mesh_volume(shape),
        "offset": (rel.Base.x / MM, rel.Base.y / MM, rel.Base.z / MM), "twist": math.degrees(rel.Rotation.Angle),
        "box": (bb.XMin / MM, bb.YMin / MM, bb.ZMin / MM, bb.XMax / MM, bb.YMax / MM, bb.ZMax / MM),
    }


def circle_curve(doc, radius_m):
    c = press("Organic_PlanCurve", doc)[0]
    c.Kind, c.Radius = "Circle", radius_m * MM
    doc.recompute()
    return c


def pressed(turned):
    """Press every button in one document; returns {case: facts}."""
    import numpy as np

    doc, b = scene(turned)
    out = {}
    try:
        site = next(o for o in doc.Objects if getattr(o, "IfcType", "") == "Site")
        out["New organic building"] = {"lng": float(site.Longitude), "lat": float(site.Latitude), "elevation": site.Elevation.Value / MM,
                                       "buildings": len([o for o in doc.Objects if oc.is_building(o)]), "in_site": b in site.Group}
        curve = press("Organic_PlanCurve", doc)[0]
        out["Plan curve"] = {"closed": curve.Shape.isClosed(), "length": curve.Shape.Length / MM, "error": "Invalid" in curve.State}

        wall = press("Organic_Wall", doc, selected=[])[0]
        out["Curved wall"] = solid_facts(wall, b)
        before = wall.Shape.Volume / 1e9
        press("Organic_Opening", doc, picked=[(wall, None)])
        out["Opening"] = dict(solid_facts(wall, b), removed=before - wall.Shape.Volume / 1e9, openings=len(wall.OpeningPositions))

        for name, case in (("Organic_LeafShell", "Leaf shell roof"), ("Organic_Vault", "Ribbed vault"), ("Organic_Arch", "Catenary arch"),
                           ("Organic_Dome", "Dome"), ("Organic_Hypar", "Saddle shell"), ("Sacred_Solid", "Regular solid"),
                           ("Sacred_Geodesic", "Geodesic dome"), ("Bio_Column", "Branching column"), ("Bio_VeinLeaf", "Veined leaf shell")):
            obj = press(name, doc)[0]
            out[case] = solid_facts(obj, b)
            if case == "Catenary arch":
                out[case].update(thrust=bool(obj.ThrustInMiddleThird), deviation=float(obj.ThrustDeviation))
            if case == "Geodesic dome":
                pts = [v.Point for v in obj.Shape.Vertexes]
                centre = obj.Placement.multVec(App.Vector(0, 0, 0))
                out[case].update(reach=max((p - centre).Length for p in pts) / MM, radius=oo.m(obj.Radius), thickness=oo.m(obj.Thickness))
            if case == "Branching column":
                out[case].update(tips=[(t.x / MM, t.y / MM, t.z / MM) for t in obj.Tips], levels=obj.Levels, branches=obj.Branches,
                                 spread=oo.m(obj.Spread), height=oo.m(obj.Height))
            if case == "Veined leaf shell":
                solids = obj.Shape.Solids
                top = max(s.BoundBox.ZMax for s in solids[:1])
                out[case].update(ribs=len(solids) - 1, ribs_valid=all(s.isValid() for s in solids[1:]),
                                 rib_top=max(s.optimalBoundingBox().ZMax for s in solids[1:]) / MM if len(solids) > 1 else float("nan"),
                                 shell_top=solids[0].optimalBoundingBox().ZMax / MM)

        ring = circle_curve(doc, 8.0)
        slab = press("Organic_Slab", doc, selected=[ring])[0]
        out["Floor slab"] = solid_facts(slab, b)
        roof = press("Organic_ShellRoof", doc, selected=[ring])[0]
        out["Shell roof on a closed wall"] = solid_facts(roof, b)
        film = press("Organic_SoapFilm", doc, selected=[])[0]
        out["Minimal surface"] = solid_facts(film, b)

        grid = press("Bio_Gridshell", doc, selected=[])[0]
        out["Gridshell"] = dict(solid_facts(grid, b), laths=grid.Laths, lath_length=grid.LathLength, residual=grid.Residual,
                                width=oo.m(grid.LathWidth), depth=oo.m(grid.LathDepth), beam=oo.m(grid.EdgeBeam), rise=oo.m(grid.Rise))
        net = press("Bio_Net", doc, selected=[])[0]
        out["Hanging net"] = dict(solid_facts(net, b), rise=oo.m(net.Rise))
        cells = press("Bio_Cells", doc, selected=[])[0]
        out["Cellular wall"] = dict(solid_facts(cells, b), open=cells.OpenFraction, sampled=open_share(cells),
                                    plain=oo.m(cells.Thickness) * oo.m(cells.Height) * cells.Base.Shape.Length / MM,
                                    margin=oo.m(cells.Margin), height=oo.m(cells.Height), length=cells.Base.Shape.Length / MM)

        figure = press("Sacred_Figure", doc)[0]
        out["Plan figure"] = {"kind": str(figure.Kind), "size": oo.m(figure.Size), "length": figure.OutlineLength, "area": figure.OutlineArea,
                              "error": "Invalid" in figure.State}
        fwall = press("Organic_Wall", doc, selected=[figure])[0]
        out["A wall on a figure"] = solid_facts(fwall, b)
        for kind, case in (("Polygon", "A wall on a hexagon"), ("Vesica piscis", "A wall on a vesica")):
            fig = press("Sacred_Figure", doc)[0]
            fig.Kind = kind
            doc.recompute()
            out[case] = solid_facts(press("Organic_Wall", doc, selected=[fig])[0], b)

        rose = press("Sacred_SunRose", doc)[0]
        out["Sun rose"] = {"sunrise": list(rose.Sunrise), "sunset": list(rose.Sunset), "source": rose.Source, "horizon": str(rose.Horizon),
                           "turn": math.degrees(rose.Placement.Rotation.Angle), "error": "Invalid" in rose.State,
                           "at": ((rose.Placement.Base - b.Placement.Base).Length) / MM, "lnglat": oc.place_of(doc, rose)}

        vault = next(o for o in doc.Objects if oc.is_kind(o, "Vault") and o.Label == "Ribbed vault")
        before = (oo.m(vault.Span), oo.m(vault.Rise), oo.m(vault.VaultLength))
        props = press("Sacred_Snap", doc, selected=[vault])[0]
        out["Snap to proportion"] = {"before": before, "after": (oo.m(vault.Span), oo.m(vault.Rise), oo.m(vault.VaultLength)),
                                     "system": str(props.System), "module": oo.m(props.Module), "valid": vault.Shape.isValid()}
        sheet = press("Sacred_Report", doc, selected=[vault])[0]
        rows = []
        r = 1
        while sheet.getContents("A%d" % r):
            rows.append([sheet.getContents("%s%d" % (chr(ord("A") + c), r)).lstrip("'") for c in range(12)])
            r += 1
        out["Proportions report"] = {"rows": rows}

        # Grow, in its own building, then turned to the sun, then sent
        doc2, b2 = scene(turned)
        try:
            grown = press("Organic_Grow", doc2)
            out["Grow organic building"] = {"parts": [solid_facts(o, b2) for o in grown], "openings": len(grown[0].OpeningPositions)}
            child = b2.Placement.inverse().multiply(grown[0].Placement)
            press("Sacred_Orient", doc2, selected=[b2], direction="June solstice sunrise", axis="-Y")
            front = b2.Placement.Rotation.multVec(App.Vector(0, -1, 0))
            after = b2.Placement.inverse().multiply(grown[0].Placement)
            out["Turn to the sun"] = {"bearing": math.degrees(math.atan2(front.x, front.y)) % 360.0, "lnglat": oc.place_of(doc2, b2),
                                      "carried": (after.Base - child.Base).Length / MM + abs(after.Rotation.Angle - child.Rotation.Angle),
                                      "moved": (b2.Placement.Base - (SPOT.Base if turned else App.Vector())).Length / MM}
            folder = tempfile.mkdtemp(prefix="organic-toolbar-")
            rep = oc.ALL["Organic_ExportGodot"].send([b2], folder)
            out["Send to the map"] = {"files": sorted(os.listdir(folder)), "elements": len(rep["elements"]), "placement": rep["placement"],
                                      "base": (b2.Placement.Base.x / MM, b2.Placement.Base.y / MM, b2.Placement.Base.z / MM),
                                      "yaw": math.degrees(math.atan2(b2.Placement.Rotation.multVec(App.Vector(1, 0, 0)).y,
                                                                     b2.Placement.Rotation.multVec(App.Vector(1, 0, 0)).x))}
        finally:
            App.closeDocument(doc2.Name)
    finally:
        App.closeDocument(doc.Name)
    return out


def open_share(wall, samples=1500):
    """The share of a cellular wall's face that is open, by points: taken on the wall's middle
    surface, inside its margins, and asked whether they lie in the solid."""
    import random

    rng = random.Random(7)
    edge, _closed = oo.base_edge(wall)
    length, height, margin = edge.Length, oo.m(wall.Height) * MM, oo.m(wall.Margin) * MM
    local = wall.Shape.copy()
    local.Placement = App.Placement()
    hit = 0
    for _ in range(samples):
        p = edge.valueAt(edge.getParameterByLength(rng.uniform(margin, length - margin)))
        hit += not local.isInside(App.Vector(p.x, p.y, p.z + rng.uniform(margin, height - margin)), 0.01, True)
    inner = (length - 2 * margin) * (height - 2 * margin)
    return hit / samples * inner / (length * height)


def options():
    """Every option of every list, built at the origin: {label: (valid, one solid or a wire)}."""
    doc, _b = scene(False)
    out = {}
    try:
        def tried(label, cls, name, setup, solid=True):
            obj = oo.make(cls, name, label, doc)
            try:
                setup(obj)
                doc.recompute()
                s = obj.Shape
                good = "Invalid" not in obj.State and not s.isNull() and (len(s.Solids) == 1 and s.isValid() if solid else bool(s.Edges))
            except Exception as exc:
                good = False
                label += " (%s)" % exc
            out[label] = good

        for kind in oo.CURVE_KINDS:
            tried("plan curve %s" % kind, oo.PlanCurve, "PlanCurve", lambda o, k=kind: setattr(o, "Kind", k), solid=False)
        arc = oo.make(oo.PlanCurve, "PlanCurve", "arc", doc)
        arc.Kind = "Arc"
        doc.recompute()
        for top in ("Flat", "Arch", "Wave", "Slope"):
            for align in ("Center", "Left", "Right"):
                def setup(o, top=top, align=align):
                    o.Base, o.Top, o.Align, o.TopRise = arc, top, align, 0.5 * MM
                tried("wall %s top, %s" % (top, align), oo.Wall, "Wall", setup)
        for shape in ("Rect", "Arch", "Pointed", "Round"):
            def setup(o, shape=shape):
                o.Base = arc
                oo.add_opening(o, 3.0, 1.0, 1.4, 0.8, shape)
            tried("opening %s" % shape, oo.Wall, "Wall", setup)
        for profile in ("Ellipse", "Semicircle", "Segmental", "Pointed", "Catenary", "Parabola"):
            tried("vault %s" % profile, oo.Vault, "Vault", lambda o, p=profile: setattr(o, "Profile", p))
        for profile in ("Ellipse", "Sphere", "Catenary", "Parabola", "Onion"):
            tried("dome %s" % profile, oo.Dome, "Dome", lambda o, p=profile: setattr(o, "Profile", p))
        tried("dome with an oculus", oo.Dome, "Dome", lambda o: setattr(o, "Oculus", 0.8 * MM))
        tried("saddle shell as a catenoid", oo.MinimalShell, "Shell", lambda o: setattr(o, "Kind", "Catenoid"))
        for kind in sacred.FIGURES:
            tried("figure %s" % kind, oo.SacredFigure, "Figure", lambda o, k=kind: setattr(o, "Kind", k), solid=False)
            fig = oo.make(oo.SacredFigure, "Figure", "figure", doc)
            fig.Kind = kind
            if kind == "Flower of life":
                fig.Count = 2
            doc.recompute()

            def setup(o, fig=fig):
                o.Base = fig
                oo.add_opening(o, 2.0, 1.0, 1.4, 0.8, "Arch")
            tried("a wall with an opening on the figure %s" % kind, oo.Wall, "Wall", setup)
        for kind in sacred.SOLIDS:
            for standing in ("On a face", "On a vertex", "Centred"):
                def setup(o, kind=kind, standing=standing):
                    o.Kind, o.Standing = kind, standing
                tried("solid %s, %s" % (kind, standing.lower()), oo.SacredSolid, "Solid", setup)
        for freq, portion in ((1, 0.5), (2, 0.5), (4, 0.625), (3, 1.0)):
            def setup(o, freq=freq, portion=portion):
                o.Frequency, o.Portion = freq, portion
            tried("geodesic dome frequency %d, portion %.3f" % (freq, portion), oo.GeodesicDome, "Geodesic", setup)
    finally:
        App.closeDocument(doc.Name)
    return out


def refused():
    """The commands that need a selection, pressed without one: each must say so."""
    doc, _b = scene(False)
    out = {}
    try:
        for name, kw in (("Organic_ShellRoof", {"selected": []}), ("Organic_Slab", {"selected": []}), ("Organic_Opening", {"picked": []})):
            try:
                press(name, doc, **kw)
                out[name] = None
            except ValueError as exc:
                out[name] = str(exc)
    finally:
        App.closeDocument(doc.Name)
    return out


def net_facts():
    """The force density net on a circle of radius 6 m, 1 m apart, 3 m high: its nodes."""
    ring, _z0 = ob.ring_points(og.arc_curve(6.0, 360.0))
    nodes, fixed, edges, _lines = ob.net_topology(ring, 1.0)
    xyz, load = ob.force_density(nodes, fixed, edges, 3.0)
    return {"xyz": [tuple(float(c) for c in p) for p in xyz], "fixed": list(fixed), "edges": [tuple(e) for e in edges], "load": load}


def sun_facts():
    """The pack's sun and this workbench's, at the pack's observer nearest the anchor."""
    import datetime

    sky = fetch("sky-events.json")
    alng, alat, _ = canonical_frame()
    obs = min(sky["observers"], key=lambda o: math.hypot((o["lng"] - alng) * 91916.198, (o["lat"] - alat) * 110930.184))
    out = {"observer": obs["id"], "year": sky["year"], "events": {}}
    for key in obs["events"]:
        e = obs["events"][key]
        day = datetime.date(*(int(v) for v in e["calendar_day"].split("-")))
        mine = sacred.azimuths_on(obs["lat"], obs["lng"], day)
        out["events"][key] = {"day": e["calendar_day"], "pack": (e["sunrise"]["flat"]["azimuth_deg"], e["sunset"]["flat"]["azimuth_deg"]),
                              "true": (e["sunrise"]["true"]["azimuth_deg"], e["sunset"]["true"]["azimuth_deg"]), "mine": mine}
    own = sacred.event_days(obs["lat"], obs["lng"], sky["year"])
    out["own_days"] = {k: v.isoformat() for k, v in own.items()}
    out["sky"] = sky
    return out


def read_facts():
    return {"origin": pressed(False), "turned": pressed(True), "options": options(), "refused": refused(), "net": net_facts(),
            "sun": sun_facts(), "anchor": canonical_frame()}


# ------------------------------------------------------------------ judge
SOLID_CASES = ["Curved wall", "Opening", "Leaf shell roof", "Ribbed vault", "Catenary arch", "Dome", "Saddle shell", "Regular solid",
               "Geodesic dome", "Branching column", "Veined leaf shell", "Floor slab", "Shell roof on a closed wall", "Minimal surface",
               "Gridshell", "Hanging net", "Cellular wall", "A wall on a figure", "A wall on a hexagon", "A wall on a vesica"]
COMPOUNDS = {"Branching column", "Veined leaf shell", "Gridshell", "Hanging net"}  # several solids by design
OFFSETS = {}  # every command makes its object at the building's own origin


def pack_azimuth(sky, lnglat, key, part, block):
    obs = min(sky["observers"], key=lambda o: math.hypot((o["lng"] - lnglat[0]) * 91916.198, (o["lat"] - lnglat[1]) * 110930.184))
    return obs["events"][key][part][block]["azimuth_deg"]


def judge(facts):
    oks, fails = [], []

    def ok(cond, msg):
        (oks if cond else fails).append(msg)

    here, there = facts["origin"], facts["turned"]
    # P. pressed
    for case in SOLID_CASES:
        for where, f in (("at the origin", here.get(case)), ("at the spot, turned", there.get(case))):
            if f is None:
                ok(False, "P %s %s: nothing was made" % (case, where))
                continue
            want_one = case not in COMPOUNDS
            ok(not f["error"] and f["valid"] and (f["solids"] == 1 if want_one else f["solids"] >= 2)
               and abs(f["mesh"] - f["volume"]) <= 0.005 * f["volume"],
               "P %s %s: recomputed %s, %d solid%s, valid %s, %.4f m³, its triangles %.4f m³"
               % (case, where, "with an error" if f["error"] else "cleanly", f["solids"], "" if f["solids"] == 1 else "s", f["valid"], f["volume"], f["mesh"]))
            off = OFFSETS.get(case, (0.0, 0.0, 0.0))
            ok(math.dist(f["offset"], off) <= 0.001 and f["twist"] <= 0.001,
               "P %s %s: made at the building (%.3f, %.3f, %.3f m from its origin, turned %.3f° against it)" % ((case, where) + f["offset"] + (f["twist"],)))
        a, b = here.get(case), there.get(case)
        if a and b:
            ok(abs(a["volume"] - b["volume"]) <= 0.0005 * a["volume"],
               "P %s: the same shape wherever the building stands (%.4f m³ at the origin, %.4f m³ at the spot, turned)" % (case, a["volume"], b["volume"]))
    bad = sorted(k for k, good in facts["options"].items() if not good)
    ok(not bad and len(facts["options"]) >= 60, "P every option of every list makes a valid shape (%d tried%s)" % (len(facts["options"]), "; not: " + "; ".join(bad) if bad else ""))
    said = facts["refused"]
    ok(all(said.get(k) for k in ("Organic_ShellRoof", "Organic_Slab", "Organic_Opening")),
       "P pressed without a selection, the shell roof, the slab and the opening say what to select (%s)" % "; ".join("%s: %s" % kv for kv in sorted(said.items())))

    # O. the Organic toolbar
    alng, alat, aelev = facts["anchor"]
    nb = here["New organic building"]
    ok(abs(nb["lng"] - alng) < 1e-9 and abs(nb["lat"] - alat) < 1e-9 and abs(nb["elevation"] - aelev) < 1e-6 and nb["buildings"] == 1 and nb["in_site"],
       "O New organic building: one building in a site at %.5f, %.4f, %.2f m (BRAIN.md §3: %.5f, %.4f, %.2f)" % (nb["lng"], nb["lat"], nb["elevation"], alng, alat, aelev))
    pc = here["Plan curve"]
    ok(not pc["error"] and pc["closed"] and pc["length"] > 30, "O Plan curve: a closed lobed plan, %.2f m round" % pc["length"])
    w = here["Curved wall"]
    exact = 0.30 * 2.70 * 6.0 * math.radians(120.0)
    ok(abs(w["volume"] - exact) <= 0.001 * exact, "O Curved wall: %.4f m³ (t H R θ = %.4f)" % (w["volume"], exact))
    o = here["Opening"]
    took = opening_volume(5.85, 6.15, 1.2, 1.3, 0.9)
    ok(o["openings"] == 1 and abs(o["removed"] - took) <= 0.002 * took,
       "O Opening: it takes %.4f m³ out of the wall (the chord through the ring, integrated over the arch: %.4f)" % (o["removed"], took))
    ar = here["Catenary arch"]
    ok(abs(ar["box"][5] - (3.81 + 0.6)) <= 0.002 and abs((ar["box"][4] - ar["box"][1]) - 1.2) <= 0.001 and ar["thrust"] and ar["deviation"] <= 0.6 / 6,
       "O Catenary arch: %.3f m high (rise 3.81 + ring 0.6), %.3f m deep, its thrust line %.4f m from the ring's middle (within the middle third: %s)"
       % (ar["box"][5], ar["box"][4] - ar["box"][1], ar["deviation"], ar["thrust"]))
    d = here["Dome"]
    ok(max(abs(d["box"][0] + 5), abs(d["box"][3] - 5), abs(d["box"][1] + 5), abs(d["box"][4] - 5), abs(d["box"][2]), abs(d["box"][5] - 5.5)) <= 0.005,
       "O Dome: 10 m across, 5.5 m high (%.3f..%.3f, %.3f..%.3f, %.3f..%.3f)" % (d["box"][0], d["box"][3], d["box"][1], d["box"][4], d["box"][2], d["box"][5]))
    s = here["Saddle shell"]
    # z = k x y, k = rise / (a/2 b/2); at a corner the shell's normal leans out, and its thickness with it
    k = 1.5 / 16.0
    side = 8.0 + 2 * 0.15 * (4 * k) / math.sqrt(1 + 2 * (4 * k) ** 2)
    ok(abs((s["box"][3] - s["box"][0]) - side) <= 0.005 and abs((s["box"][4] - s["box"][1]) - side) <= 0.005 and abs(s["box"][5] - 1.5) <= 0.005,
       "O Saddle shell: 8 m by 8 m, its corners 1.5 m up; with its thickness leaning out at the corners %.3f m by %.3f m (worked out here: %.3f)"
       % (s["box"][3] - s["box"][0], s["box"][4] - s["box"][1], side))
    sl = here["Floor slab"]
    exact = math.pi * 64 * 0.2
    ok(abs(sl["volume"] - exact) <= 0.001 * exact, "O Floor slab on a circle of radius 8 m: %.4f m³ (π r² t = %.4f)" % (sl["volume"], exact))
    sr = here["Shell roof on a closed wall"]
    ok(abs(sr["box"][5] - (3.2 + 2.4)) <= 0.05 and sr["box"][3] - sr["box"][0] >= 16.0 + 2 * 0.8 - 0.1,
       "O Shell roof: its crown %.2f m up (eaves 3.2 + rise 2.4), %.2f m across (the ring 16 m + the overhangs)" % (sr["box"][5], sr["box"][3] - sr["box"][0]))
    gr = here["Grow organic building"]
    ok(len(gr["parts"]) == 3 and all(p["valid"] and p["solids"] == 1 and not p["error"] for p in gr["parts"]) and gr["openings"] >= 3
       and all(p["valid"] and p["solids"] == 1 for p in there["Grow organic building"]["parts"]),
       "O Grow organic building: a wall with %d openings, a shell roof and a slab, each one valid solid, at the origin and at the spot" % gr["openings"])
    for where, f in (("at the origin", here), ("at the spot, turned", there)):
        sm = f["Send to the map"]
        pl = sm["placement"]
        ok(len(sm["files"]) == 3 and sorted(os.path.splitext(n)[1] for n in sm["files"]) == [".glb", ".ifc", ".json"] and sm["elements"] == 3
           and math.dist((pl["offset_m"]["east"], pl["offset_m"]["north"], pl["offset_m"]["up"]), sm["base"]) <= 0.001
           and abs((pl["rotation_deg"]["y"] - sm["yaw"] + 180) % 360 - 180) <= 0.001,
           "O Send to the map %s: %s; the placement written is the building's own (%.2f E, %.2f N, %+.2f m, turned %+.2f°)"
           % (where, ", ".join(sm["files"]), pl["offset_m"]["east"], pl["offset_m"]["north"], pl["offset_m"]["up"], pl["rotation_deg"]["y"]))

    # S. the Sacred toolbar
    fg = here["Plan figure"]
    ok(not fg["error"] and fg["kind"] == "Seed of life" and abs(fg["length"] - 4 * math.pi * fg["size"]) <= 1e-6 * fg["size"],
       "S Plan figure: the seed of life of radius %.1f m, its outline %.4f m (six arcs of 120°: 4 π r = %.4f)" % (fg["size"], fg["length"], 4 * math.pi * fg["size"]))
    hx = here["A wall on a hexagon"]
    exact = 6 * 4.0 * 0.30 * 2.70  # between two offsets of a polygon, corners kept: perimeter x thickness
    ok(abs(hx["volume"] - exact) <= 0.001 * exact, "S A wall on a hexagon of radius 4 m: %.4f m³ (perimeter x t x H = %.4f): its corners are corners" % (hx["volume"], exact))
    vs = here["A wall on a vesica"]
    lens = lambda rho: 2 * rho * rho * math.acos(4.0 / (2 * rho)) - 2.0 * math.sqrt(4 * rho * rho - 16.0)  # two circles of radius rho, centres 4 m apart
    exact = (lens(4.15) - lens(3.85)) * 2.70
    ok(abs(vs["volume"] - exact) <= 0.001 * exact, "S A wall on a vesica of radius 4 m: %.4f m³ (the lens of r + t/2 less the lens of r - t/2, x H = %.4f)" % (vs["volume"], exact))
    rs = here["Regular solid"]
    exact = 5 * (3 + 5 ** 0.5) / 12 * 27.0
    ok(abs(rs["volume"] - exact) <= 1e-6 * exact, "S Regular solid: an icosahedron of edge 3 m, %.5f m³ (5 (3 + √5) / 12 a³ = %.5f)" % (rs["volume"], exact))
    gd = here["Geodesic dome"]
    shell = 2 / 3.0 * math.pi * (gd["radius"] ** 3 - (gd["radius"] - gd["thickness"]) ** 3)
    ok(abs(gd["reach"] - gd["radius"]) <= 0.001 and abs(gd["box"][5] - gd["radius"]) <= 0.001 and abs(gd["box"][2]) <= 0.001 and 0.9 * shell <= gd["volume"] < shell,
       "S Geodesic dome: its vertices on the sphere of %.1f m (farthest %.4f), a hemisphere %.3f m high, its shell %.3f m³ inside the sphere's %.3f"
       % (gd["radius"], gd["reach"], gd["box"][5], gd["volume"], shell))
    sun = facts["sun"]
    worst, at = 0.0, ""
    for key, e in sun["events"].items():
        for i, part in enumerate(("sunrise", "sunset")):
            gap = abs(e["mine"][i] - e["pack"][i])
            if gap > worst:
                worst, at = gap, "%s %s" % (key, part)
    ok(len(sun["events"]) == 8 and worst <= 0.1,
       "S the sun worked out here (NOAA's equations) against the land pack's (astronomy-engine), on its days, all eight stations of %s: worst %.3f° (%s)"
       % (sun["year"], worst, at))
    for where, f in (("at the origin", here), ("at the spot", there)):
        ro = f["Sun rose"]
        block = "true" if ro["horizon"].startswith("Terrain") else "flat"
        gaps = [abs(ro[part][i] - pack_azimuth(sun["sky"], ro["lnglat"], key, part, block))
                for i, (key, _label) in enumerate(sacred.EVENTS) for part in ("sunrise", "sunset")] if len(ro["sunrise"]) == 8 else [float("inf")]
        ok(not ro["error"] and max(gaps) <= 1e-9 and ro["turn"] <= 1e-9 and ro["at"] <= 1e-6 and "land pack" in ro["source"],
           "S Sun rose %s: sixteen azimuths as the pack's file has them for the observer nearest it (worst %.2g°), at the building, not turned with it (%.3g°)"
           % (where, max(gaps), ro["turn"]))
        tu = f["Turn to the sun"]
        want = pack_azimuth(sun["sky"], tu["lnglat"], "june_solstice", "sunrise", "true")
        ok(abs((tu["bearing"] - want + 180) % 360 - 180) <= 1e-6 and tu["carried"] <= 1e-6 and tu["moved"] <= 1e-6,
           "S Turn to the sun %s: the building's front faces bearing %.2f° (the pack's June solstice sunrise over the ridge: %.2f°), about its own origin (moved %.3f m), its parts carried along (left behind by %.3f)"
           % (where, tu["bearing"], want, tu["moved"], tu["carried"]))
    sn = here["Snap to proportion"]
    span = max(1, round(sn["before"][0] / sn["module"])) * sn["module"]
    rise = span * nearest(GOLDEN, sn["before"][1], sn["before"][0])
    length = span / nearest(GOLDEN, sn["before"][0], sn["before"][2])
    ok(sn["system"].startswith("Golden") and sn["valid"] and math.dist(sn["after"], (span, rise, length)) <= 1e-6,
       "S Snap to proportion: the vault's span %.4f m (%d modules of %.4f), rise %.4f, length %.4f (worked out here: %.4f, %.4f, %.4f)"
       % (sn["after"][0], round(span / sn["module"]), sn["module"], sn["after"][1], sn["after"][2], span, rise, length))
    rp = here["Proportions report"]["rows"]
    body = rp[1:]
    measured = [float(r[6]) for r in body] if len(body) == 4 else []
    ok(len(body) == 4 and abs(measured[0] - sn["after"][0] / sn["after"][1]) <= 1e-3 and abs(measured[1] - sn["after"][2] / sn["after"][0]) <= 1e-3
       and all(abs(float(r[8])) <= 0.01 for r in body[:2]),
       "S Proportions report: %d rows for the vault; span to rise 1 : %s, length to span 1 : %s, both on the system's ratios"
       % (len(body), body[0][6] if body else "-", body[1][6] if len(body) > 1 else "-"))

    # B. the Biomimetic toolbar
    net = facts["net"]
    xyz, fixed = net["xyz"], net["fixed"]
    force = [[0.0, 0.0, net["load"]] for _ in xyz]
    for a, b in net["edges"]:
        for i, j in ((a, b), (b, a)):
            for c in range(3):
                force[i][c] += xyz[j][c] - xyz[i][c]
    free = [i for i in range(len(xyz)) if not fixed[i]]
    unbalanced = max(math.sqrt(sum(c * c for c in force[i])) for i in free) / net["load"]
    top = max(xyz[i][2] for i in free)
    off = math.sqrt(sum((xyz[i][2] - top * (1 - (xyz[i][0] ** 2 + xyz[i][1] ** 2) / 36.0)) ** 2 for i in free) / len(free))
    ok(unbalanced <= 1e-9 and abs(top - 3.0) <= 1e-9 and off <= 0.02 * 3.0,
       "B the net over a circle: %d free nodes each in balance (the largest unbalanced force %.1e of a node's load), 3 m high, on the membrane's paraboloid (rms %.3f m off)"
       % (len(free), unbalanced, off))
    g = here["Gridshell"]
    laths = g["width"] * g["depth"] * g["lath_length"]
    beam = g["beam"] ** 2 * 2 * math.pi * 6.0
    ok(g["laths"] == g["solids"] - 1 and abs(g["volume"] - (laths + beam)) <= 0.02 * (laths + beam) and g["residual"] <= 1e-9
       and abs(g["box"][5] - (g["rise"] + g["depth"] / 2)) <= 0.02,
       "B Gridshell: %d laths, %.1f m of them; %.3f m³ (w d L %.3f + its edge beam %.3f); its crown %.3f m up" % (g["laths"], g["lath_length"], g["volume"], laths, beam, g["box"][5]))
    hn = here["Hanging net"]
    ok(abs(hn["box"][2] + hn["rise"] + g["depth"] / 2) <= 0.02 and hn["box"][5] <= g["beam"] / 2 + 0.03,
       "B Hanging net: it hangs %.3f m below its ring and nowhere rises above it (%.3f m)" % (-hn["box"][2], hn["box"][5]))
    cw = here["Cellular wall"]
    by_volume = 1 - cw["volume"] / cw["plain"]
    ok(0.2 <= by_volume <= 0.7 and abs(by_volume - cw["sampled"]) <= 0.03 and abs(cw["open"] - by_volume) <= 0.01,
       "B Cellular wall: one solid, %.1f %% open by its volume against the plain wall's t H L, %.1f %% by points sampled through it" % (100 * by_volume, 100 * cw["sampled"]))
    vl = here["Veined leaf shell"]
    ok(vl["ribs"] >= 20 and vl["ribs_valid"] and vl["rib_top"] < vl["shell_top"],
       "B Veined leaf shell: a shell and %d vein ribs, every one a valid solid, the highest rib (%.2f m) under the shell's top (%.2f m)" % (vl["ribs"], vl["rib_top"], vl["shell_top"]))
    bc = here["Branching column"]
    tips = bc["tips"]
    ok(len(tips) == bc["branches"] ** bc["levels"] and all(abs(t[2] - bc["height"]) <= 1e-6 for t in tips)
       and max(math.hypot(t[0], t[1]) for t in tips) <= bc["spread"] + 1e-6 and abs(bc["box"][5] - bc["height"]) <= 0.002 and abs(bc["box"][2]) <= 0.002,
       "B Branching column: %d tips (%d ^ %d), level at %.2f m (the lowest at %.2f), the farthest %.2f m from the trunk's axis (the crown: %.2f m)"
       % (len(tips), bc["branches"], bc["levels"], bc["height"], min(t[2] for t in tips) if tips else float("nan"),
          max(math.hypot(t[0], t[1]) for t in tips) if tips else float("nan"), bc["spread"]))
    return oks, fails


# ------------------------------------------------------------------ forgeries
def forgeries(facts):
    def f(change):
        g = copy.deepcopy({k: v for k, v in facts.items() if k != "sun"})
        g["sun"] = dict(facts["sun"])
        g["sun"]["events"] = copy.deepcopy(facts["sun"]["events"])
        change(g)
        return g

    def sun_off(g):
        e = g["sun"]["events"]["june_solstice"]
        e["mine"] = (e["mine"][0] + 1.0, e["mine"][1])

    def unbalance(g):
        p = g["net"]["xyz"]
        i = next(k for k, fx in enumerate(g["net"]["fixed"]) if not fx)
        p[i] = (p[i][0], p[i][1], p[i][2] + 0.05)

    def flatten(g):
        top = max(p[2] for p in g["net"]["xyz"])
        g["net"]["xyz"] = [(x, y, z * (0.7 + 0.3 * z / top)) for x, y, z in g["net"]["xyz"]]
        g["net"]["load"] *= 1.0

    return [
        ("a solid not valid", "P Dome at the origin", f(lambda g: g["origin"]["Dome"].__setitem__("valid", False))),
        ("a hole in a mesh", "P Ribbed vault at the origin", f(lambda g: g["origin"]["Ribbed vault"].__setitem__("mesh", g["origin"]["Ribbed vault"]["mesh"] * 0.9))),
        ("a part left at the document's origin", "P Leaf shell roof at the spot, turned: made at the building", f(lambda g: g["turned"]["Leaf shell roof"].update(offset=(112.0, -31.0, 6.07), twist=30.0))),
        ("a shape that changes when the building turns", "P Curved wall: the same shape", f(lambda g: g["turned"]["Curved wall"].__setitem__("volume", g["turned"]["Curved wall"]["volume"] * 1.002))),
        ("an option that fails", "P every option", f(lambda g: g["options"].__setitem__("vault Pointed", False))),
        ("the wall half as thick", "O Curved wall", f(lambda g: g["origin"]["Curved wall"].__setitem__("volume", g["origin"]["Curved wall"]["volume"] / 2))),
        ("the opening twice as wide", "O Opening", f(lambda g: g["origin"]["Opening"].__setitem__("removed", g["origin"]["Opening"]["removed"] * 2))),
        ("the building not at the anchor", "O New organic building", f(lambda g: g["origin"]["New organic building"].__setitem__("lng", -119.155333))),
        ("the placement written off by a metre", "O Send to the map at the spot", f(lambda g: g["turned"]["Send to the map"]["placement"]["offset_m"].__setitem__("east", g["turned"]["Send to the map"]["placement"]["offset_m"]["east"] + 1.0))),
        ("the sun 1° off", "S the sun worked out here", f(sun_off)),
        ("the rose turned with the building", "S Sun rose at the spot", f(lambda g: g["turned"]["Sun rose"].__setitem__("turn", 30.0))),
        ("the building turned the wrong way", "S Turn to the sun at the origin", f(lambda g: g["origin"]["Turn to the sun"].__setitem__("bearing", (360.0 - g["origin"]["Turn to the sun"]["bearing"]) % 360.0))),
        ("a part left behind by the turn", "S Turn to the sun at the spot", f(lambda g: g["turned"]["Turn to the sun"].__setitem__("carried", 0.5))),
        ("a snap off its module", "S Snap to proportion", f(lambda g: g["origin"]["Snap to proportion"].__setitem__("after", (8.0,) + tuple(g["origin"]["Snap to proportion"]["after"][1:])))),
        ("a report row missing", "S Proportions report", f(lambda g: g["origin"]["Proportions report"]["rows"].pop())),
        ("the icosahedron a dodecahedron", "S Regular solid", f(lambda g: g["origin"]["Regular solid"].__setitem__("volume", (15 + 7 * 5 ** 0.5) / 4 * 27.0))),
        ("the net out of balance", "B the net over a circle", f(unbalance)),
        ("the net off its paraboloid", "B the net over a circle", f(flatten)),
        ("the cells closed", "B Cellular wall", f(lambda g: g["origin"]["Cellular wall"].__setitem__("volume", g["origin"]["Cellular wall"]["plain"]))),
        ("a rib above the shell", "B Veined leaf shell", f(lambda g: g["origin"]["Veined leaf shell"].__setitem__("rib_top", g["origin"]["Veined leaf shell"]["shell_top"] + 0.1))),
        ("a column tip short", "B Branching column", f(lambda g: g["origin"]["Branching column"]["tips"].__setitem__(0, (0.5, 0.5, 4.5)))),
    ]


def run(self_test=None):
    if self_test is None:
        self_test = os.environ.get("TOOLBAR_CHECK_SELF_TEST") == "1" or "--self-test" in sys.argv
    facts = read_facts()
    oks, fails = judge(facts)
    for m in oks:
        print("OK  ", m)
    for m in fails:
        print("FAIL", m)
    sun = facts["sun"]
    late = [k for k in sun["own_days"] if sun["own_days"][k] != sun["events"][k]["day"]]
    for k in late:
        print("NOTE the land pack sets %s on %s; by the land's own day (mean solar time) it falls on %s" % (k, sun["events"][k]["day"], sun["own_days"][k]))
    if fails:
        print("check_toolbar FAILED (%d of %d)" % (len(fails), len(oks) + len(fails)))
        return False
    print("check_toolbar OK (%d checks; %d commands pressed in two places)" % (len(oks), len(oc.ALL)))
    if not self_test:
        return True
    caught = 0
    forged = forgeries(facts)
    for name, expect, g in forged:
        _o, f = judge(g)
        hit = next((m for m in f if m.startswith(expect)), None)
        if hit:
            print("SELF-TEST OK   %s is rejected (%s)" % (name, hit))
        elif f:
            print("SELF-TEST FAIL %s is rejected, but not by the check meant for it (%s...): %s" % (name, expect, f[0]))
        else:
            print("SELF-TEST FAIL %s PASSED the check" % name)
        caught += bool(hit)
    print("check_toolbar --self-test %s (%d/%d forgeries rejected)" % ("OK" if caught == len(forged) else "FAILED", caught, len(forged)))
    return caught == len(forged)


if __name__ == "__main__":
    result = run()
    if not App.GuiUp:
        sys.exit(0 if result else 1)
