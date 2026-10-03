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
  M. moved: what a kernel moves or turns as a whole is where it says, in the object's own
     frame, with the building 116 m out and turned: the vault centred on its origin, a solid
     standing on its face or vertex (twice the inradius; a √(2/3)), the five-eighths dome on
     its cut, the catenoid on the ground, a slab on a ring 5 m off lying there, a wall with
     its base lifted, a turned S-curve. (An object's placement replaces its shape's own.)
     And a vault's plinth: its springings carried 0.6 m straight down, no wider.
  O. the Organic toolbar against closed forms: the curved wall t H R θ; the opening's volume
     as the integral of the chord through the wall's ring over the opening's outline; the
     arch's height (rise + ring) and its thrust line; the dome's and the saddle's boxes; the
     wave vault on its walls (their feet on the ground, its crest rise + wave + shell over
     its springings); the conoid's and the translation shell's boxes, their formulas made
     thick along their normals, worked out here; the saddle shell's groined kind on its
     supports, the top above a tip worked out here; the
     slab π r² t; the grown building's parts; the site of a new building against BRAIN.md §3,
     and where it stands after a click on the land (there) or on anything else (the origin);
     a wall on a line of straight runs through given points (t H L, its corners kept); the
     files and the placement "Send to the map" writes, and the same triangles for every
     element when the building is sent again from another place, turned another way.
     ("Import from the map", the toolbar's other way, has its own check: check_import.py.)
  S. the Sacred toolbar: the seed of life's outline 4 π r; the icosahedron 5 (3 + √5) / 12 a³;
     the geodesic dome's vertices on its sphere and its shell inside the sphere's; the
     geodesic frame against lane R's construction built here (its struts, every node ball on
     R's node, its cutting list, a member); this
     workbench's own sun (NOAA's equations) against the land pack's (astronomy-engine) at all
     eight stations of the year, within 0.1°; the sun rose's azimuths against the pack's file,
     and its size against the building it is drawn for (it shows beyond it);
     "Turn to the sun": the building's own -Y axis at the pack's bearing, its parts carried
     along; the snap against the ratios and the module worked out here; the report's rows.
  B. the Biomimetic toolbar: the net's nodes in balance (forces summed here) and on the
     membrane's paraboloid, its laths' volume w d L; the gridshell pressed with a dome
     selected: laths lying on it, its nodes on the dome's ellipse, one ring beam at its foot,
     b² 2π (R + b / 2); the hanging net below its ring; the
     cellular wall one solid, its open share by its volume against points sampled through
     it; the veined leaf a shell and its ribs under it; the branching column's tips n^levels,
     level, within the crown.

--self-test forges faults into what was read (a solid not valid, a hole in a mesh, a part
left at the document's origin, a shape that changes when the building turns, a solid's own
move dropped, a slab left at the origin, a vault's plinth left out, a click on the land
ignored, a building set on a clicked wall, corners rounded off, the sun rose hidden under its
building, the wall half as thick, the opening twice as wide, an element meshed anew by where
its building stands, the sun 1° off, the building turned the wrong way, a
part left behind by the turn, a snap off its module, a report row missing, the net out of
balance, the net off its paraboloid, the cells closed, a rib above the shell, a column tip
short, the wave vault on the ground without its walls, the conoid made thick straight up,
the translation shell's crown a thickness low, groined saddles off their supports, a strut of
the frame missing, a frame node 1 mm off R's, a lath node off the dome, the dome's ring beam
left out) and must see every one rejected by the check meant for it.
"""

import copy
import json
import math
import os
import pathlib
import re
import shutil
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

# the folders this check sends its trial buildings into: taken away again once they have been read, unless
# ORGANIC_CHECK_KEEP=1 asks to look at them
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
import organic_sacred as sacred  # noqa: E402

# The land pack (lane C's; knowledge\DATA-INVENTORY.md section 3): its own folder on this PC is read
# first (the dataset of record), its published copy only where that folder is not there.
LOCAL_PACK = r"C:\Playground\Sulphur - Spatial - Map\sulphur-mountain-world"
PACK = os.environ.get("SITE_PACK_URL") or ((pathlib.Path(LOCAL_PACK).as_uri() + "/") if os.path.isdir(LOCAL_PACK) else "https://sulphur-mountain-world.vercel.app/")
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


def conoid_box(span, length, rise, eave, t):
    """The box (x0, x1, y0, y1, z0, z1, m) of lane R's conoid made thick t along its upward
    normal n ~ (-fx, -fy, 1): furthest out across where its arch's feet are steepest, along
    where its level end leans out most (the axis), highest over the arch's crown."""
    sx = 4 * rise / span  # -fx at an arch foot
    ly = rise / length  # -fy on the axis at the level end, and at the crown
    x = span / 2 + t * sx / math.sqrt(1 + sx * sx)
    return (-x, x, -length / 2, length / 2 + t * ly / math.sqrt(1 + ly * ly), eave, eave + rise + t / math.sqrt(1 + ly * ly))


def translation_box(span, length, rise_x, rise_y, eave, t):
    """The box of lane R's translation shell made thick t along its upward normal: furthest out
    at the middle of each edge, highest over its crown."""
    sx, sy = 4 * rise_x / span, 4 * rise_y / length
    x, y = span / 2 + t * sx / math.sqrt(1 + sx * sx), length / 2 + t * sy / math.sqrt(1 + sy * sy)
    return (-x, x, -y, y, eave, eave + rise_x + rise_y + t)


def groined_tip_top(support, tip, centre, tip_h, t, lobes=8):
    """The top of groined saddles above a lobe's tip (m): the saddle moved t along its normal,
    read above the tip (the point of the saddle on its axis whose normal passes over the tip)."""
    half = math.pi / lobes
    a = (tip_h - centre) / tip ** 2
    u = tip
    for _ in range(200):
        u = tip + t * 2 * a * u / math.sqrt(1 + 4 * a * a * u * u)
    return centre + a * u * u + t / math.sqrt(1 + 4 * a * a * u * u)


def r_geodesic(frequency, rows):
    """Lane R's geodesic dome frame (pattern card P-001), built here as R's note says: an
    icosahedron with a vertex at the crown, its upper ring at z = 1/√5 (radius 2/√5) at 0°, 72°,
    ..., its lower ring at -1/√5 turned 36°; each face divided `frequency` times, the points
    pushed onto the unit sphere; the triangles sorted by the height of their centres and the
    first `rows` rows kept (5, 15, 25 ... in the cap, 10 x frequency in the belt); the foot
    nodes (on edges of one triangle) set to their mean height. Returns (nodes [(x, y, z)], struts
    [(i, j)], foot node indices), on the unit sphere."""
    f = int(frequency)
    zr, rr = 1 / math.sqrt(5), 2 / math.sqrt(5)
    top, bottom = (0.0, 0.0, 1.0), (0.0, 0.0, -1.0)
    upper = [(rr * math.cos(math.radians(72 * k)), rr * math.sin(math.radians(72 * k)), zr) for k in range(5)]
    lower = [(rr * math.cos(math.radians(72 * k + 36)), rr * math.sin(math.radians(72 * k + 36)), -zr) for k in range(5)]
    faces = []
    for k in range(5):
        n = (k + 1) % 5
        faces += [(top, upper[k], upper[n]), (upper[k], lower[k], upper[n]), (upper[n], lower[k], lower[n]), (bottom, lower[n], lower[k])]
    index, verts, tris = {}, [], []

    def vid(p):
        ln = math.sqrt(sum(c * c for c in p))
        q = tuple(c / ln for c in p)
        key = tuple(round(c, 7) for c in q)
        if key not in index:
            index[key] = len(verts)
            verts.append(q)
        return index[key]

    for a, b, c in faces:
        pt = lambda i, j: vid(tuple((a[t] * (f - i - j) + b[t] * i + c[t] * j) / f for t in range(3)))  # noqa: E731
        for i in range(f):
            for j in range(f - i):
                tris.append((pt(i, j), pt(i + 1, j), pt(i, j + 1)))
                if i + j < f - 1:
                    tris.append((pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)))
    order = sorted(range(len(tris)), key=lambda n: (-sum(verts[v][2] for v in tris[n]) / 3, -n))
    counts = [5 * (2 * n + 1) for n in range(f)] + [10 * f] * f
    kept = [tris[n] for n in order[:sum(counts[:rows])]]
    edges = {}
    for t in kept:
        for i, j in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            edges[(min(i, j), max(i, j))] = edges.get((min(i, j), max(i, j)), 0) + 1
    foot = sorted({v for e, n in edges.items() if n == 1 for v in e})
    used = sorted({v for e in edges for v in e})
    level = sum(verts[v][2] for v in foot) / len(foot) if foot else None
    nodes = {v: (verts[v][0], verts[v][1], level if v in foot else verts[v][2]) for v in used}
    return nodes, sorted(edges), foot


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


def true_box(shape):
    """A shape's box from its geometry. Asked without saying so, OCCT takes the triangles the
    shape was last drawn or measured with when it has any: in the window a displayed solid's
    box was up to 66 mm off its true one, and a plain BoundBox takes spline faces untrimmed."""
    return shape.optimalBoundingBox(False, False)


def solid_facts(obj, building):
    shape = obj.Shape
    rel = building.Placement.inverse().multiply(obj.Placement)
    local = shape.copy()
    local.Placement = App.Placement()
    bb = true_box(local)
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

        made = {}
        for name, case in (("Organic_LeafShell", "Leaf shell roof"), ("Organic_Vault", "Ribbed vault"), ("Organic_Arch", "Catenary arch"),
                           ("Organic_Dome", "Dome"), ("Organic_Hypar", "Saddle shell"), ("Sacred_Solid", "Regular solid"),
                           ("Sacred_Geodesic", "Geodesic dome"), ("Bio_Column", "Branching column"), ("Bio_VeinLeaf", "Veined leaf shell"),
                           ("Organic_WaveVault", "Wave vault"), ("Organic_Conoid", "Conoid roof"), ("Organic_Translation", "Translation shell"),
                           ("Sacred_GeodesicFrame", "Geodesic frame")):
            obj = press(name, doc)[0]
            made[case] = obj
            out[case] = solid_facts(obj, b)
            if case == "Wave vault":
                out[case].update(amplitude=oo.m(obj.WaveAmplitude), waves=obj.Waves, rise=oo.m(obj.Rise), plinth=oo.m(obj.Plinth), thickness=oo.m(obj.Thickness))
            if case in ("Conoid roof", "Translation shell"):
                out[case].update({p: oo.m(getattr(obj, p)) for p in ("Span", "ShellLength", "Rise", "RiseX", "RiseY", "Eave", "Thickness") if p in obj.PropertiesList})
            if case == "Geodesic frame":  # its node balls' centres, in the building's own frame
                back = b.Placement.inverse()
                balls = [back.multVec(s.CenterOfMass) for s in obj.Shape.Solids if len(s.Faces) == 1 and type(s.Faces[0].Surface).__name__ == "Sphere"]
                out[case].update(struts=obj.Struts, nodes=obj.Nodes, rows=obj.Rows, ifc=str(obj.IfcType), cutting=list(obj.StrutList), radius=oo.m(obj.Radius),
                                 hub=obj.Hub * oo.m(obj.StrutSection), centres=[(p.x / MM, p.y / MM, p.z / MM) for p in balls])
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
                out[case].update(ribs=len(solids) - 1, ribs_valid=all(s.isValid() for s in solids[1:]),
                                 rib_top=max(true_box(s).ZMax for s in solids[1:]) / MM if len(solids) > 1 else float("nan"),
                                 shell_top=true_box(solids[0]).ZMax / MM)

        # the saddle shell's other kind, and laths lying on the dome
        groined = press("Organic_Hypar", doc)[0]
        groined.Kind = "Groined saddles"
        doc.recompute()
        out["Groined saddles"] = dict(solid_facts(groined, b), **{p: oo.m(getattr(groined, p)) for p in ("SupportRadius", "TipRadius", "CentreHeight", "TipHeight", "Thickness")})
        out["Groined saddles"]["lobes"] = groined.Lobes
        dome = made["Dome"]
        laths = press("Bio_Gridshell", doc, selected=[dome])[0]
        out["Gridshell on a dome"] = dict(solid_facts(laths, b), laths=laths.Laths, nodes=list(getattr(laths.Proxy, "nodes", [])), beams=laths.Beams, edge=laths.BeamLength,
                                          beam=oo.m(laths.EdgeBeam), profile=str(dome.Profile), radius=oo.m(dome.Radius), dome_rise=oo.m(dome.Rise),
                                          shell=laths.Shell.Name if laths.Shell is not None else None, dome=dome.Name,
                                          beam_volumes=[og.volume_of(s) / 1e9 for s in laths.Shape.Solids[laths.Laths:]])
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

        # a line of straight runs through given points (what a wall drawn in the map stands on), and a wall on it
        line = press("Organic_PlanCurve", doc)[0]
        line.Kind, line.Smooth = "Points", False
        line.Points = [App.Vector(x * MM, y * MM, 0) for x, y in CORNER_POINTS]
        doc.recompute()
        out["A wall on corner points"] = dict(solid_facts(press("Organic_Wall", doc, selected=[line])[0], b), edges=len(line.Shape.Edges))

        rose = press("Sacred_SunRose", doc)[0]
        reach = 0.0  # how far the building's solids reach from its origin in plan, from their own corners
        for o in b.Group:
            if getattr(o, "Shape", None) is not None and o.Shape.Solids and o.Name != rose.Name:
                bb = true_box(o.Shape)
                reach = max([reach] + [math.hypot(x - b.Placement.Base.x, y - b.Placement.Base.y) for x in (bb.XMin, bb.XMax) for y in (bb.YMin, bb.YMax)])
        out["Sun rose"] = {"sunrise": list(rose.Sunrise), "sunset": list(rose.Sunset), "source": rose.Source, "horizon": str(rose.Horizon),
                           "turn": math.degrees(rose.Placement.Rotation.Angle), "error": "Invalid" in rose.State,
                           "at": ((rose.Placement.Base - b.Placement.Base).Length) / MM, "lnglat": oc.place_of(doc, rose),
                           "size": oo.m(rose.Size), "reach": reach / MM}

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
            folder = scratch("organic-toolbar-")
            rep = oc.ALL["Organic_ExportGodot"].send([b2], folder)
            out["Send to the map"] = {"files": sorted(os.listdir(folder)), "elements": len(rep["elements"]), "placement": rep["placement"],
                                      "base": (b2.Placement.Base.x / MM, b2.Placement.Base.y / MM, b2.Placement.Base.z / MM),
                                      "yaw": math.degrees(math.atan2(b2.Placement.Rotation.multVec(App.Vector(1, 0, 0)).y,
                                                                     b2.Placement.Rotation.multVec(App.Vector(1, 0, 0)).x)),
                                      "meshes": [(r["name"], r["triangles"], r["mesh_volume_m3"]) for r in rep["elements"]]}
            # the same building somewhere else, turned another way, sent again: the same triangles
            b2.Placement = App.Placement(b2.Placement.Base + App.Vector(7300.0, -4100.0, 900.0), App.Rotation(og.Z, ox.yaw_of(b2.Placement) + 37.0))
            doc2.recompute()
            again = oc.ALL["Organic_ExportGodot"].send([b2], scratch("organic-toolbar-"))
            out["Send to the map"]["resent"] = [(r["name"], r["triangles"], r["mesh_volume_m3"]) for r in again["elements"]]
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
        def tried(label, cls, name, setup, solid=True, many=False):
            obj = oo.make(cls, name, label, doc)
            try:
                setup(obj)
                doc.recompute()
                s = obj.Shape
                if many:  # several solids by design (a frame, laths): every one valid
                    good = "Invalid" not in obj.State and not s.isNull() and len(s.Solids) >= 2 and all(p.isValid() for p in s.Solids)
                else:
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
        for freq, portion, bands in ((1, 0.5, 0), (2, 0.5, 0), (3, 0.375, 0), (4, 0.625, 0), (3, 0.625, 3), (3, 1.0, 0)):
            def setup(o, freq=freq, portion=portion, bands=bands):
                o.Frequency, o.Portion, o.Bands, o.Frame = freq, portion, bands, True
            tried("geodesic frame frequency %d, portion %.3f%s" % (freq, portion, ", %d rows" % bands if bands else ""), oo.GeodesicDome, "Frame", setup, many=True)
        for lobes in (4, 6, 8, 12, 16):
            def setup(o, lobes=lobes):
                o.Kind, o.Lobes = "Groined saddles", lobes
            tried("saddle shell as groined saddles of %d lobes" % lobes, oo.MinimalShell, "Shell", setup)
        for kind, cls in (("conoid", oo.Conoid), ("translation shell", oo.TranslationShell)):
            tried(kind, cls, "Shell", lambda o: None)
        # laths on shells of every kind: the shells first, then laths on each (a diagrid of two layers on one)
        shells = {"a conoid": oo.make(oo.Conoid, "Conoid", "conoid", doc), "a ribbed vault": oo.make(oo.Vault, "Vault", "vault", doc),
                  "a leaf shell": oo.make(oo.LeafShell, "Leaf", "leaf", doc), "a saddle": oo.make(oo.MinimalShell, "Saddle", "saddle", doc),
                  "groined saddles": oo.make(oo.MinimalShell, "Groined", "groined", doc), "a dome with an oculus": oo.make(oo.Dome, "Dome", "dome", doc)}
        shells["groined saddles"].Kind = "Groined saddles"
        shells["a dome with an oculus"].Profile, shells["a dome with an oculus"].Oculus = "Catenary", 0.8 * MM
        doc.recompute()
        for label, shell in shells.items():
            def setup(o, shell=shell, diagrid=label == "a conoid"):
                o.Shell = shell
                if diagrid:
                    o.Turn, o.Layers = 45.0, 2
            tried("laths on %s%s" % (label, ", a diagrid of two layers" if label == "a conoid" else ""), oo.Gridshell, "Laths", setup, many=True)
    finally:
        App.closeDocument(doc.Name)
    return out


def moves():
    """Objects whose shape is moved or turned as a whole by its kernel, or stands on a curve
    away from the building's origin: their boxes in their own frame, in metres. (An object's
    placement replaces its shape's own, so such a move is lost unless it is in the geometry.)"""
    doc, b = scene(True)
    out = {}
    try:
        def box(obj):
            s = obj.Shape.copy()
            s.Placement = App.Placement()
            bb = true_box(s)
            return (bb.XMin / MM, bb.YMin / MM, bb.ZMin / MM, bb.XMax / MM, bb.YMax / MM, bb.ZMax / MM)

        def made(label, cls, setup):
            obj = oc.place(oo.make(cls, "Moved", label, doc), doc)
            setup(obj)
            doc.recompute()
            out[label] = box(obj)
            return obj

        made("vault", oo.Vault, lambda o: None)
        made("vault on a plinth", oo.Vault, lambda o: setattr(o, "Plinth", 600.0))
        made("icosahedron on a face", oo.SacredSolid, lambda o: setattr(o, "Kind", "Icosahedron"))

        def vertex(o):
            o.Kind, o.Standing = "Tetrahedron", "On a vertex"
        made("tetrahedron on a vertex", oo.SacredSolid, vertex)
        made("geodesic dome, five eighths", oo.GeodesicDome, lambda o: setattr(o, "Portion", 0.625))
        made("catenoid", oo.MinimalShell, lambda o: setattr(o, "Kind", "Catenoid"))
        made("groined saddles", oo.MinimalShell, lambda o: setattr(o, "Kind", "Groined saddles"))

        def frame(o):
            o.Radius, o.Frequency, o.Portion, o.Frame = 5000.0, 3, 0.625, True
        made("geodesic frame", oo.GeodesicDome, frame)
        made("conoid", oo.Conoid, lambda o: None)
        ring = oc.place(oo.make(oo.PlanCurve, "Ring", "ring", doc), doc)
        ring.Kind, ring.Radius = "Circle", 1200.0
        ring.Placement = b.Placement.multiply(App.Placement(App.Vector(0, -5000, 180), App.Rotation()))
        arc = oc.place(oo.make(oo.PlanCurve, "Arc", "arc", doc), doc)
        arc.Kind = "Arc"
        doc.recompute()

        def on_ring(o):
            o.Base, o.Thickness = ring, 620.0
        made("slab on a ring 5 m off", oo.Slab, on_ring)

        def lifted(o):
            o.Base, o.BaseOffset = arc, 500.0
        made("wall, its base 0.5 m up", oo.Wall, lifted)

        def turned(o):
            o.Kind, o.Turn = "S-curve", 90.0
        made("S-curve turned 90°", oo.PlanCurve, turned)
    finally:
        App.closeDocument(doc.Name)
    return out


def kept():
    """A building moved and turned: its solids go with it and are not built again (building a
    house again at every move costs as long as building it); a changed number, or a changed
    base curve, does build them again."""
    doc, b = scene(False)
    out = {}
    try:
        ring = oc.place(oo.make(oo.PlanCurve, "Ring", "ring", doc), doc)
        ring.Kind, ring.Radius = "Circle", 3000.0
        doc.recompute()
        wall = oc.place(oo.make(oo.Wall, "Wall", "wall", doc), doc)
        wall.Base = ring
        dome = oc.place(oo.make(oo.Dome, "Dome", "dome", doc), doc)
        doc.recompute()
        n0 = (wall.Proxy.builds, dome.Proxy.builds)
        centre = true_box(wall.Shape).Center
        volume = wall.Shape.Volume
        to = App.Placement(App.Vector(7000, -3000, 500), App.Rotation(App.Vector(0, 0, 1), 75.0))
        b.Placement = to
        doc.recompute()
        out["builds after the move"] = (wall.Proxy.builds - n0[0], dome.Proxy.builds - n0[1])
        out["carried"] = (true_box(wall.Shape).Center - to.multVec(centre)).Length / MM  # the circle wall's box centre is its own centre: it turns with the building
        out["volume after the move"] = wall.Shape.Volume / volume
        out["valid after the move"] = bool(wall.Shape.isValid())
        wall.Height = 3500.0
        doc.recompute()
        out["builds after a taller wall"] = wall.Proxy.builds - n0[0]
        out["volume after a taller wall"] = wall.Shape.Volume / volume
        ring.Radius = 4000.0
        doc.recompute()
        out["builds after a wider ring"] = wall.Proxy.builds - n0[0]
        out["line after a wider ring"] = wall.CentrelineLength
    finally:
        App.closeDocument(doc.Name)
    return out


def clicked():
    """New organic building pressed after a click: on the land (a terrain mesh) the building
    stands at the clicked point; on anything else it stands at the document's origin."""
    import Mesh

    SCENES[0] += 1
    doc = App.newDocument("ToolbarCheck%d" % SCENES[0], "Toolbar check %d" % SCENES[0], True, True)
    out = {}
    try:
        land = doc.addObject("Mesh::Feature", "Terrain")
        mesh = Mesh.Mesh()
        a, b, c, d = App.Vector(-20e3, -20e3, 0), App.Vector(20e3, -20e3, 2e3), App.Vector(20e3, 20e3, 4e3), App.Vector(-20e3, 20e3, 2e3)
        mesh.addFacet(a, b, c)
        mesh.addFacet(a, c, d)
        land.Mesh = mesh
        box = doc.addObject("Part::Box", "Box")
        doc.recompute()
        on_land = oc.ALL["Organic_NewBuilding"].make(doc, picked=[(land, App.Vector(5e3, 7e3, 2.6e3))])[0]
        on_box = oc.ALL["Organic_NewBuilding"].make(doc, picked=[(box, App.Vector(3e3, 3e3, 10e3))])[0]
        out["on the land"] = tuple(v / MM for v in on_land.Placement.Base)
        out["on a box"] = tuple(v / MM for v in on_box.Placement.Base)
        # a wall in the building on the land (a straight run of 8 m), clicked near its foot, then at window height
        line = oc.ALL["Organic_PlanCurve"].make(doc)[0]
        line.Kind, line.Smooth, line.Points = "Points", False, [App.Vector(0, 0, 0), App.Vector(8e3, 0, 0)]
        line.Placement = on_box.Placement
        doc.recompute()
        wall = oc.ALL["Organic_Wall"].make(doc, selected=[line])[0]
        doc.recompute()
        oc.ALL["Organic_Opening"].make(doc, picked=[(wall, wall.Placement.multVec(App.Vector(2e3, -150, 300)))])
        oc.ALL["Organic_Opening"].make(doc, picked=[(wall, wall.Placement.multVec(App.Vector(6e3, -150, 1500)))])
        doc.recompute()
        out["openings"] = [tuple(round(v, 6) for v in o) for o in zip(wall.OpeningPositions, wall.OpeningWidths, wall.OpeningHeights, wall.OpeningSills)]
        out["wall valid"] = bool(wall.Shape.isValid()) and len(wall.Shape.Solids) == 1
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
    try:
        return {"origin": pressed(False), "turned": pressed(True), "options": options(), "moves": moves(), "kept": kept(), "refused": refused(), "clicked": clicked(),
                "net": net_facts(), "sun": sun_facts(), "anchor": canonical_frame()}
    finally:
        tidy()


# ------------------------------------------------------------------ judge
SOLID_CASES = ["Curved wall", "Opening", "Leaf shell roof", "Ribbed vault", "Catenary arch", "Dome", "Saddle shell", "Regular solid",
               "Geodesic dome", "Branching column", "Veined leaf shell", "Floor slab", "Shell roof on a closed wall", "Minimal surface",
               "Gridshell", "Hanging net", "Cellular wall", "A wall on a figure", "A wall on a hexagon", "A wall on a vesica", "A wall on corner points",
               "Wave vault", "Conoid roof", "Translation shell", "Geodesic frame", "Groined saddles", "Gridshell on a dome"]
CORNER_POINTS = [(0.0, 0.0), (5.0, 0.0), (8.0, 4.0), (8.0, 9.0), (3.0, 11.0)]  # metres: four straight runs, three corners, not closed
COMPOUNDS = {"Branching column", "Veined leaf shell", "Gridshell", "Hanging net", "Geodesic frame", "Gridshell on a dome"}  # several solids by design
OFFSETS = {"Wave vault": (0.0, 0.0, 2.2)}  # every command makes its object at the building's own origin, but the wave vault, whose springings stand on its walls


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

    # M. a shape's own move is kept (boxes in the object's own frame, the building 116 m out and turned)
    mv = facts["moves"]
    near = lambda got, want, tol=0.003: got is not None and all(abs(g - w) <= tol for g, w in zip(got, want))
    pick = lambda label, idx: tuple(mv[label][i] for i in idx) if label in mv else None
    ok(near(pick("vault", (1, 4, 2, 5)), (-8.0, 8.0, 0.0, 3.65)),
       "M the vault lies centred on its own origin: y %s, z %s (16 m long, rise 3.5 + shell 0.15)" % (pick("vault", (1, 4)), pick("vault", (2, 5))))
    bare_x = pick("vault", (0, 3))
    ok(bare_x is not None and near(pick("vault on a plinth", (0, 3, 1, 4, 2, 5)), bare_x + (-8.0, 8.0, -0.6, 3.65)),
       "M a vault's plinth carries its springings 0.6 m straight down: z %s, x %s (the bare vault's x %s)"
       % (pick("vault on a plinth", (2, 5)), pick("vault on a plinth", (0, 3)), bare_x))
    tall = 2 * 3.0 * math.sqrt(3) / 12 * (3 + math.sqrt(5))  # twice the inradius of an icosahedron of edge 3
    ok(near(pick("icosahedron on a face", (2, 5)), (0.0, tall)),
       "M the icosahedron stands on a face: z %s (twice its inradius: %.4f)" % (pick("icosahedron on a face", (2, 5)), tall))
    ok(near(pick("tetrahedron on a vertex", (2, 5)), (0.0, 3.0 * math.sqrt(2.0 / 3.0))),
       "M the tetrahedron stands on a vertex: z %s (its height a √(2/3) = %.4f)" % (pick("tetrahedron on a vertex", (2, 5)), 3.0 * math.sqrt(2.0 / 3.0)))
    ok(near(pick("geodesic dome, five eighths", (2, 5)), (0.0, 7.5)),
       "M the five-eighths geodesic dome stands on its cut: z %s (1.25 R = 7.5)" % (pick("geodesic dome, five eighths", (2, 5)),))
    ok(near(pick("catenoid", (2, 5)), (0.0, 8.0)), "M the catenoid stands on the ground: z %s (its height 8)" % (pick("catenoid", (2, 5)),))
    tip_top = groined_tip_top(6.0, 7.85, 2.4, 4.0, 0.15)
    ok(near(pick("groined saddles", (0, 3, 1, 4, 2, 5)), (-7.85, 7.85, -7.85, 7.85, 0.0, tip_top)),
       "M groined saddles stand on their eight supports, on the ground: x %s, y %s, z %s (their tips 7.85 m out; the top above a tip %.4f m, worked out here)"
       % (pick("groined saddles", (0, 3)), pick("groined saddles", (1, 4)), pick("groined saddles", (2, 5)), tip_top))
    nodes, _struts, _foot = r_geodesic(3, 5)
    height = 5.0 * (max(z for _x, _y, z in nodes.values()) - min(z for _x, _y, z in nodes.values()))
    ok(near(pick("geodesic frame", (2, 5)), (-0.0675, height + 0.0675)),
       "M the geodesic frame stands on its levelled foot: z %s (its foot nodes on z = 0, its crown %.4f m up by R's construction worked out here; balls of 0.135 m)"
       % (pick("geodesic frame", (2, 5)), height))
    box = conoid_box(9.0, 12.0, 3.0, 2.6, 0.08)
    ok(near(pick("conoid", (0, 3, 1, 4, 2, 5)), box, 0.002),
       "M the conoid in its own frame: x %s, y %s, z %s (worked out here from its formula and its normals: %s)"
       % (pick("conoid", (0, 3)), pick("conoid", (1, 4)), pick("conoid", (2, 5)), tuple(round(v, 4) for v in box)))
    ok(near(pick("slab on a ring 5 m off", (0, 3, 1, 4, 2, 5)), (-1.2, 1.2, -6.2, -3.8, -0.44, 0.18), 0.006),
       "M a slab on a ring 5 m from its building's origin and 0.18 m up lies there: x %s, y %s, z %s"
       % (pick("slab on a ring 5 m off", (0, 3)), pick("slab on a ring 5 m off", (1, 4)), pick("slab on a ring 5 m off", (2, 5))))
    ok(near(pick("wall, its base 0.5 m up", (2, 5)), (0.5, 3.2)), "M a wall with its base 0.5 m up stands there: z %s" % (pick("wall, its base 0.5 m up", (2, 5)),))
    ok(near(pick("S-curve turned 90°", (0, 3, 1, 4)), (-1.5, 1.5, 0.0, 12.0), 0.01),
       "M an S-curve turned 90° runs along y: x %s, y %s" % (pick("S-curve turned 90°", (0, 3)), pick("S-curve turned 90°", (1, 4))))

    kp = facts["kept"]
    ok(kp["builds after the move"] == (0, 0) and kp["carried"] <= 1e-3 and abs(kp["volume after the move"] - 1.0) <= 1e-9 and kp["valid after the move"],
       "M a building moved and turned 75°: its wall and its dome go with it (the wall's centre within %.6f m of where the move puts it) and are not built again (%d and %d builds)"
       % ((kp["carried"],) + kp["builds after the move"]))
    ok(kp["builds after a taller wall"] == 1 and abs(kp["volume after a taller wall"] - 3.5 / 2.7) <= 1e-6
       and kp["builds after a wider ring"] == 2 and abs(kp["line after a wider ring"] - 2 * math.pi * 4.0) <= 0.01,
       "M a changed number builds the solid again (a wall 3.5 m high for 2.7: %.4f times the volume, 3.5 / 2.7 = %.4f), and so does a changed base curve (its line %.3f m, 2 π 4 = %.3f)"
       % (kp["volume after a taller wall"], 3.5 / 2.7, kp["line after a wider ring"], 2 * math.pi * 4.0))

    # O. the Organic toolbar
    alng, alat, aelev = facts["anchor"]
    nb = here["New organic building"]
    ok(abs(nb["lng"] - alng) < 1e-9 and abs(nb["lat"] - alat) < 1e-9 and abs(nb["elevation"] - aelev) < 1e-6 and nb["buildings"] == 1 and nb["in_site"],
       "O New organic building: one building in a site at %.5f, %.4f, %.2f m (BRAIN.md §3: %.5f, %.4f, %.2f)" % (nb["lng"], nb["lat"], nb["elevation"], alng, alat, aelev))
    ck = facts["clicked"]
    ok(math.dist(ck["on the land"], (5.0, 7.0, 2.6)) <= 1e-9 and math.dist(ck["on a box"], (0.0, 0.0, 0.0)) <= 1e-9,
       "O New organic building after a click on the land stands where the land was clicked (%.1f, %.1f, %+.1f m); after a click on anything else, at the origin (%.1f, %.1f, %.1f)"
       % (ck["on the land"] + ck["on a box"]))
    op = ck.get("openings", [])
    ok(ck.get("wall valid") and len(op) == 2 and math.dist(op[0], (2.0, 1.0, 2.2, 0.0)) <= 1e-6 and math.dist(op[1], (6.0, 1.2, 1.3, 0.9)) <= 1e-6,
       "O Opening after a click on a wall: near its foot (0.3 m up) a door, 1.0 x 2.2 m from the floor, 2.0 m along; higher (1.5 m up) a window, 1.2 x 1.3 m, sill 0.9 m, 6.0 m along (%s)" % (op,))
    pc = here["Plan curve"]
    ok(not pc["error"] and pc["closed"] and pc["length"] > 30, "O Plan curve: a closed lobed plan, %.2f m round" % pc["length"])
    cp = here["A wall on corner points"]
    runs = sum(math.dist(p, q) for p, q in zip(CORNER_POINTS, CORNER_POINTS[1:]))
    exact = 0.30 * 2.70 * runs  # a band of constant width about a line with mitred corners: width x the line's length
    ok(cp["edges"] == len(CORNER_POINTS) - 1 and abs(cp["volume"] - exact) <= 0.0005 * exact,
       "O A wall on a line through %d given points, straight runs: %.4f m³ (t H L = %.4f, L = %.3f m): its %d corners are corners"
       % (len(CORNER_POINTS), cp["volume"], exact, runs, len(CORNER_POINTS) - 2))
    w = here["Curved wall"]
    exact = 0.30 * 2.70 * 6.0 * math.radians(120.0)
    ok(abs(w["volume"] - exact) <= 0.001 * exact, "O Curved wall: %.4f m³ (t H R θ = %.4f)" % (w["volume"], exact))
    o = here["Opening"]
    took = opening_volume(5.85, 6.15, 1.2, 1.3, 0.9)
    ok(o["openings"] == 1 and abs(o["removed"] - took) <= 0.002 * took,
       "O Opening: it takes %.4f m³ out of the wall (the chord through the ring, integrated over the arch: %.4f)" % (o["removed"], took))
    ar = here["Catenary arch"]
    ok(abs(ar["box"][5] - (3.81 + 0.6)) <= 0.002 and abs(ar["box"][1] + 0.6) <= 0.001 and abs(ar["box"][4] - 0.6) <= 0.001 and ar["thrust"] and ar["deviation"] <= 0.6 / 6,
       "O Catenary arch: %.3f m high (rise 3.81 + ring 0.6), 1.2 m deep about its own origin (y %.3f..%.3f), its thrust line %.4f m from the ring's middle (within the middle third: %s)"
       % (ar["box"][5], ar["box"][1], ar["box"][4], ar["deviation"], ar["thrust"]))
    d = here["Dome"]
    ok(max(abs(d["box"][0] + 5), abs(d["box"][3] - 5), abs(d["box"][1] + 5), abs(d["box"][4] - 5), abs(d["box"][2]), abs(d["box"][5] - 5.5)) <= 0.005,
       "O Dome: 10 m across, 5.5 m high (%.3f..%.3f, %.3f..%.3f, %.3f..%.3f)" % (d["box"][0], d["box"][3], d["box"][1], d["box"][4], d["box"][2], d["box"][5]))
    s = here["Saddle shell"]
    # z = k x y, k = rise / (a/2 b/2); at a corner the shell's normal leans out, and its thickness with it
    k = 1.5 / 16.0
    lean = math.sqrt(1 + 2 * (4 * k) ** 2)
    side = 8.0 + 2 * 0.15 * (4 * k) / lean
    foot = 0.15 * (1 - 1 / lean)  # its low corners: the shell's thickness, less its lean, above the ground
    ok(abs((s["box"][3] - s["box"][0]) - side) <= 0.005 and abs((s["box"][4] - s["box"][1]) - side) <= 0.005
       and abs(s["box"][5] - (2 * 1.5 + 0.15)) <= 0.005 and abs(s["box"][2] - foot) <= 0.005,
       "O Saddle shell: 8 m by 8 m, standing on its two low corners (%.3f m up; worked out here %.3f), its high ones %.3f m up (twice the rise + the shell); "
       "with its thickness leaning out, %.3f m by %.3f m (worked out here: %.3f)"
       % (s["box"][2], foot, s["box"][5], s["box"][3] - s["box"][0], s["box"][4] - s["box"][1], side))
    wv = here["Wave vault"]
    crest = wv["rise"] + wv["amplitude"] + wv["thickness"]
    ok(wv["waves"] == 3 and abs(wv["amplitude"] - 0.6) <= 1e-9 and abs(wv["box"][2] + wv["plinth"]) <= 0.002 and abs(wv["box"][5] - crest) <= 0.002
       and math.dist(wv["offset"], (0.0, 0.0, wv["plinth"])) <= 0.001,
       "O Wave vault: three waves of ±%.1f m on a rise of %.1f m, standing on its walls with their feet on the ground: in its own frame z %.3f..%.3f "
       "(its walls %.1f m deep; its crest rise + wave + shell = %.3f), its springings %.1f m above the building's floor"
       % (wv["amplitude"], wv["rise"], wv["box"][2], wv["box"][5], wv["plinth"], crest, wv["offset"][2]))
    for case, box in (("Conoid roof", conoid_box(9.0, 12.0, 3.0, 2.6, 0.08)), ("Translation shell", translation_box(10.0, 14.0, 1.6, 2.2, 2.6, 0.08))):
        f = here[case]
        got = (f["box"][0], f["box"][3], f["box"][1], f["box"][4], f["box"][2], f["box"][5])
        ok(near(got, box, 0.002),
           "O %s: x %.4f..%.4f, y %.4f..%.4f, z %.4f..%.4f (worked out here from its formula, made thick along its normal: %s)"
           % ((case,) + got + (", ".join("%.4f" % v for v in box),)))
    gs = here["Groined saddles"]
    tip_top = groined_tip_top(gs["SupportRadius"], gs["TipRadius"], gs["CentreHeight"], gs["TipHeight"], gs["Thickness"], gs["lobes"])
    got = (gs["box"][0], gs["box"][3], gs["box"][1], gs["box"][4], gs["box"][2], gs["box"][5])
    ok(gs["lobes"] == 8 and near(got, (-gs["TipRadius"], gs["TipRadius"], -gs["TipRadius"], gs["TipRadius"], 0.0, tip_top), 0.002),
       "O Saddle shell, its other kind, groined saddles: %d lobes, %.2f m across from tip to tip, standing on its supports (z %.4f), its top above a tip %.4f m (worked out here: %.4f)"
       % (gs["lobes"], got[1] - got[0], got[4], got[5], tip_top))
    gf = here["Geodesic frame"]
    r_nodes, r_struts, r_foot = r_geodesic(3, 5)
    level = min(z for _x, _y, z in r_nodes.values())
    want = [(x * gf["radius"], y * gf["radius"], (z - level) * gf["radius"]) for x, y, z in r_nodes.values()]
    worst = max((min(math.dist(w, c) for c in gf["centres"]) for w in want), default=float("inf")) if gf["centres"] else float("inf")
    cut = {}
    for i, j in r_struts:
        n = round(gf["radius"] * math.dist(r_nodes[i], r_nodes[j]), 3)
        cut[n] = cut.get(n, 0) + 1
    listed = {}
    for row in gf["cutting"]:
        count, value = row.split(" x ")
        listed[round(float(value.split()[0]), 3)] = int(count)
    ok(gf["struts"] == len(r_struts) and gf["nodes"] == len(r_nodes) == len(gf["centres"]) and gf["rows"] == 5 and gf["ifc"] == "Member" and worst <= 1e-6 and listed == cut,
       "O Geodesic frame: %d struts and %d node balls (lane R's construction worked out here: %d and %d, %d of them at its levelled foot); every ball within %.2g m "
       "of R's node; its cutting list %s; a member, not a roof" % (gf["struts"], len(gf["centres"]), len(r_struts), len(r_nodes), len(r_foot), worst, ", ".join(gf["cutting"])))
    gd_ = here["Gridshell on a dome"]
    big, rise, side = gd_["radius"], gd_["dome_rise"], gd_["beam"]
    off = max([abs((math.hypot(x, y) / big) ** 2 + (z / rise) ** 2 - 1.0) for x, y, z in gd_["nodes"]] or [float("inf")])
    ring = side * side * 2 * math.pi * (big + side / 2)
    ok(gd_["shell"] == gd_["dome"] and gd_["profile"] == "Ellipse" and gd_["laths"] > 0 and off <= 2e-5 and gd_["beams"] == 1 and len(gd_["beam_volumes"]) == 1
       and abs(gd_["beam_volumes"][0] - ring) <= 5e-4 * ring,
       "B Gridshell pressed with the dome selected: %d laths lying on it, its %d nodes on the dome's ellipse (r / %.0f)² + (z / %.1f)² = 1 (worst %.2g); one ring beam at its foot, "
       "%s m³ (b² 2π (R + b / 2) = %.5f)" % (gd_["laths"], len(gd_["nodes"]), big, rise, off, ", ".join("%.5f" % v for v in gd_["beam_volumes"]) or "none", ring))
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
        ok(len(sm["meshes"]) == len(sm["resent"]) == 3
           and all(a[0] == b[0] and a[1] == b[1] and abs(a[2] - b[2]) <= 1e-6 * a[2] for a, b in zip(sm["meshes"], sm["resent"])),
           "O Sent again %s from 8 m away and turned 37° more, every element has the triangles it had (%s; then %s)"
           % (where, ", ".join("%s %d" % (n, t) for n, t, _v in sm["meshes"]), ", ".join("%d" % t for _n, t, _v in sm["resent"])))

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
        ok(abs(ro["size"] - max(12.0, math.ceil(1.6 * ro["reach"]))) <= 1e-6 and ro["size"] > ro["reach"],
           "S Sun rose %s: its north ray, %.0f m, shows beyond the building, which reaches %.1f m from its origin (1.6 times that, rounded up; 12 m at least)"
           % (where, ro["size"], ro["reach"]))
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
        ("a solid's own move dropped", "M the icosahedron stands on a face", f(lambda g: g["moves"].__setitem__("icosahedron on a face", (-2.78, -2.58, -2.267, 2.78, 2.58, 2.267)))),
        ("a slab left at the origin", "M a slab on a ring", f(lambda g: g["moves"].__setitem__("slab on a ring 5 m off", (-1.2, -1.2, -0.62, 1.2, 1.2, 0.0)))),
        ("a vault's plinth left out", "M a vault's plinth", f(lambda g: g["moves"].__setitem__("vault on a plinth", g["moves"]["vault"]))),
        ("a solid built again at every move", "M a building moved and turned", f(lambda g: g["kept"].__setitem__("builds after the move", (1, 1)))),
        ("a solid left behind by a move", "M a building moved and turned", f(lambda g: g["kept"].__setitem__("carried", 7.6))),
        ("a changed number not built", "M a changed number", f(lambda g: g["kept"].update({"builds after a taller wall": 0, "volume after a taller wall": 1.0}))),
        ("a changed base curve not built", "M a changed number", f(lambda g: g["kept"].update({"builds after a wider ring": 1, "line after a wider ring": 2 * math.pi * 3.0}))),
        ("the building left at the origin though the land was clicked", "O New organic building after a click", f(lambda g: g["clicked"].__setitem__("on the land", (0.0, 0.0, 0.0)))),
        ("a building set on a wall that was clicked", "O New organic building after a click", f(lambda g: g["clicked"].__setitem__("on a box", (3.0, 3.0, 10.0)))),
        ("a door where a window was meant", "O Opening after a click", f(lambda g: g["clicked"]["openings"].__setitem__(1, (6.0, 1.0, 2.2, 0.0)))),
        ("the corners of a line through points rounded off", "O A wall on a line through", f(lambda g: g["origin"]["A wall on corner points"].update(edges=1, volume=g["origin"]["A wall on corner points"]["volume"] * 0.992))),
        ("the sun rose hidden under its building", "S Sun rose at the origin: its north ray", f(lambda g: g["origin"]["Sun rose"].__setitem__("size", 12.0))),
        ("the wall half as thick", "O Curved wall", f(lambda g: g["origin"]["Curved wall"].__setitem__("volume", g["origin"]["Curved wall"]["volume"] / 2))),
        ("the opening twice as wide", "O Opening", f(lambda g: g["origin"]["Opening"].__setitem__("removed", g["origin"]["Opening"]["removed"] * 2))),
        ("the building not at the anchor", "O New organic building", f(lambda g: g["origin"]["New organic building"].__setitem__("lng", -119.155333))),
        ("the placement written off by a metre", "O Send to the map at the spot", f(lambda g: g["turned"]["Send to the map"]["placement"]["offset_m"].__setitem__("east", g["turned"]["Send to the map"]["placement"]["offset_m"]["east"] + 1.0))),
        ("an element meshed anew by where its building stands", "O Sent again at the spot",
         f(lambda g: g["turned"]["Send to the map"]["resent"].__setitem__(0, (g["turned"]["Send to the map"]["resent"][0][0], g["turned"]["Send to the map"]["resent"][0][1] + 96, g["turned"]["Send to the map"]["resent"][0][2])))),
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
        ("the wave vault standing on the ground without its walls", "O Wave vault", f(lambda g: g["origin"]["Wave vault"].__setitem__("offset", (0.0, 0.0, 0.0)))),
        ("the conoid made thick straight up", "O Conoid roof",
         f(lambda g: g["origin"]["Conoid roof"].__setitem__("box", (-4.5, -6.0, 2.6, 4.5, 6.0, 5.68)))),
        ("the translation shell's crown a thickness low", "O Translation shell",
         f(lambda g: g["origin"]["Translation shell"].__setitem__("box", g["origin"]["Translation shell"]["box"][:5] + (g["origin"]["Translation shell"]["box"][5] - 0.08,)))),
        ("groined saddles off their supports", "O Saddle shell, its other kind",
         f(lambda g: g["origin"]["Groined saddles"].__setitem__("box", g["origin"]["Groined saddles"]["box"][:2] + (0.1,) + g["origin"]["Groined saddles"]["box"][3:]))),
        ("a strut of the geodesic frame missing", "O Geodesic frame", f(lambda g: g["origin"]["Geodesic frame"].__setitem__("struts", 164))),
        ("a node of the geodesic frame 1 mm off R's", "O Geodesic frame",
         f(lambda g: g["origin"]["Geodesic frame"]["centres"].__setitem__(0, tuple(c + 0.001 for c in g["origin"]["Geodesic frame"]["centres"][0])))),
        ("a lath node off the dome", "B Gridshell pressed with the dome selected",
         f(lambda g: g["origin"]["Gridshell on a dome"]["nodes"].__setitem__(0, tuple(c * 1.001 for c in g["origin"]["Gridshell on a dome"]["nodes"][0])))),
        ("the dome's ring beam left out", "B Gridshell pressed with the dome selected",
         f(lambda g: g["origin"]["Gridshell on a dome"].update(beams=0, beam_volumes=[]))),
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
    print("check_toolbar OK (%d checks; %d commands pressed in two places; the %dth, Import from the map, is held by check_import)"
          % (len(oks), len(oc.ALL) - 1, len(oc.ALL)))
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
