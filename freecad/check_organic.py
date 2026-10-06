# -*- coding: utf-8 -*-
"""check_organic — the Organic workbench's solids, and the building it sent to the map.

Runs inside FreeCAD 1.1 (the GUI through the FreeCAD MCP connector, or freecadcmd):

    exec(open(r".../freecad/check_organic.py", encoding="utf-8").read())
    # ORGANIC_CHECK_SELF_TEST=1 (or "--self-test" in sys.argv) forges faults;
    # ORGANIC_DESIGN=<.FCStd> and ORGANIC_EXPORT=<.glb> pick the design and its export

Every expectation is derived here, not taken from the workbench's own constants:

  A. kernels against closed forms: a wall on an arc (t H R θ) and on a circle (2π R t H), a
     straight wall less a rectangular opening, a semicircular vault (π/2 (Ro² - Ri²) L), the
     same on a plinth (two stems t L p more, its lowest point p below the springings), a
     hemispherical dome (2/3 π (R³ - (R-t)³)); a straight vault of every profile built section
     by section, as a vault along a curve and a wave vault are (each section's area in closed
     form: a circle arch's ring, a pointed arch's two rings, and for a hanging chain, a
     parabola and an ellipse the band t L + t² φ with its toes and its plinth); walls with a shaped top on an arc and on
     smooth curves through points, open and closed (t L times the top line's mean height,
     L the curve's cubic spans integrated here); a top cut that does nothing refused by the
     kernel, not drawn; lane R's shells given by a formula, R's cases A and B: the conoid and
     the translation shell against their parallel bodies (the integral over their plan of
     (t - t² H + t³ K / 3) √(1 + fx² + fy²), H and K their curvatures, worked out here), the
     groined saddles of 4, 6, 8 and 12 lobes against the height of each lobe's saddle moved t
     along its normal less its own, integrated over the lobe's plan here (FreeCAD's own
     Volume of the lobes first made by a boolean read 3.2 % short); and every kernel, the leaf
     shell and the organic roof included, a valid solid whose triangles enclose OCCT's volume
     within 0.5 %.
  G. laths on shells (the Biomimetic tab's gridshell on a shell): the top of a shell found
     face by face, against a boolean of the solid with the upright line, at 90 places on a
     hemisphere, a conoid and a wave vault; laths on a hemisphere, each one valid, its nodes
     on the sphere, each lath's volume w d ρ θ (Pappus: its middle line's circle and the arc
     between its two end faces, read off it); on it and on the Dome button's own dome (an
     ellipse, its crown a pole) every lath whole from foot to foot: one on each grid line that
     crosses the dome with the whole of a lath's width (|c| + w / 2 < R), both its ends within
     0.1 m of the foot (the ring's); the ring beam at its foot, b² 2π (R + b / 2);
     a conoid's leaning end face found to be a side, with no lath on it, and laths along the
     conoid's own straight lines valid solids (OCCT's swept section could not close them).
  B. the GLB, read back: one node per element of the design's building, named and classed
     as in FreeCAD; each mesh's enclosed volume (the divergence theorem over its own
     triangles) within 1 % of the element's solid.
  C. where it stands, stated explicitly. The canonical origin and ground are read from
     C:\\Playground\\BRAIN.md §3 itself; the design's origin from its BIM Site and the
     building's own placement from the design; metres per degree from WGS84's radii of
     curvature at the site. The sidecar's placement (coordinates lng/lat, altitude_m above
     the datum, rotation_deg.y anticlockwise: the words of FORMAT.md's edits/2) is that
     placement; its offset_m and elevation_m say the same; the GLB's own block equals it; the
     building's own origin lies within its footprint (the offset is not baked into the
     geometry around the anchor); and every element's GLB points, turned and moved by the
     sidecar's placement, have bounds within 3 cm of the element's FreeCAD bounds.
  D. on the site, in the map's own files and in the land pack: every element inside the
     surveyed boundary; every element that reaches the ground (its lowest point within 1 m
     of the building's lowest) standing in the terrain of the map's site GLB there (its base
     between 1.5 m below that ground and 0.02 m above it, nowhere in the air; heights from
     the ground at the anchor, whatever zero the land file was exported on; until 1 Oct this
     let 0.3 m through, and a vault's springing stood 0.15 m in the air; deeper only where
     the design's building says Johny decided it, FORMAT.md "decided": below_land, and never
     in the air all the same); an existing building stood on only where the design says it
     replaces that one (by its name; its county footprint is the one on its mesh); oaks of
     the build envelope that lane C's land\\oaks-removed.geojson marks out of date (their
     middle inside it) said, not counted as no-building, the export reading them the same
     way; the footprint not on a road
     and not on the access easement, by the map's own meshes and by the pack's centrelines
     and surveyed easement, the two agreeing; not inside an existing building, by the
     map's file and by the county's footprints; and inside the map's own build envelope
     (lane C's build-envelope.geojson: the county's setbacks, the oak protection zones, the
     steep ground), read here by ray casting at every vertex and held against what the export
     itself read of it and wrote into the sidecar.
  E. the IFC, read back by IfcOpenShell: the site's latitude, longitude and elevation equal
     to BRAIN.md's to 1e-6° and 1 mm; the IfcBuilding placed on that site by the same offset
     and turn, its elements placed under it, its reference height and its Organic_Placement
     property set equal to the sidecar; the same elements in their IFC classes; every
     element's world bounds within 3 cm of its GLB bounds on the site; and the file held
     against its own schema by IfcOpenShell's validation (nothing said), which is shown to
     speak: of the file's own text with the building's GlobalId taken out it must say so.

It also notes, without judging, where the land file's own zero lies and what FORMAT.md states.

--self-test forges faults into what was read and must see every one rejected by the check
that is there to catch it: the GLB Z-up, the GLB in millimetres, the building in the retired
models.json frame, on the retired 425.90 m datum, north mirrored, an element missing, a hole
in a mesh, the building 2 m in the air, back on the driveway, inside the existing house, the
offset baked into the geometry around the anchor, the turn written the wrong way round, the
IFC's latitude in whole seconds, the IFC building left on the anchor, the IFC classes lost, a
wall half as thick, the land file's roads off the pack's, an element's base 0.15 m above the
ground, the plinth left out of the vault, a wave top and an arch top left uncut on smooth
walls through points (what OCCT returned until 1 Oct), the kernel taking a cut that did nothing,
the export's reading of the build envelope another building's, the building under the protected
oaks (where the pavilion stood until the night of 1 Oct), the groined saddles made by a boolean,
a conoid made thick straight up, a top the face-by-face finder misses, a lath node 5 mm off the
hemisphere, a lath half as deep, laths stopping short of the foot, a lath in two at a dome's
crown, the ring beam left out, a lath on the conoid's leaning end face, a building decided
to replace the house standing on the shed, one decided to stand below the land with an
element in the air, a building under the house zone's oaks with lane C's overlay not read.
"""

import copy
import json
import math
import os
import pathlib
import re
import struct
import sys
import urllib.request

import FreeCAD as App
import Part

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Playground\Architect-editor\freecad"
sys.path.insert(0, os.path.join(HERE, "Organic"))
import organic_geom as og  # noqa: E402  (the kernels under test)

PLAYGROUND = next((p for p in (os.path.normpath(os.path.join(HERE, "..", "..")), r"C:\Playground") if os.path.isfile(os.path.join(p, "BRAIN.md"))), r"C:\Playground")  # the Playground folder (it moved on 6 Oct; C:\Playground is its address)
EXCHANGE = os.environ.get("ORGANIC_EXCHANGE_DIR", os.path.join(PLAYGROUND, "exchange", "godot"))
DESIGN = os.environ.get("ORGANIC_DESIGN") or os.path.join(os.path.expanduser("~"), "Documents", "SulphurMountain", "Organic-test-pavilion.FCStd")
EXPORT = os.environ.get("ORGANIC_EXPORT") or os.path.join(EXCHANGE, "organic-test-pavilion.glb")
LAND = os.environ.get("ORGANIC_LAND_DIR") or EXCHANGE  # the map's land files; apart from EXCHANGE only for a trial export
SITE_GLB = os.path.join(LAND, "sulphur-mountain-site.glb")
EXISTING_GLB = os.path.join(LAND, "sulphur-mountain-buildings-existing.glb")
ENVELOPE = os.path.join(LAND, "build-envelope.geojson")  # lane C's: where one may build (setbacks, oaks, steep ground, easement, roads)
OAKS_REMOVED = os.path.join(LAND, "land", "oaks-removed.geojson")  # lane C's overlay from Johny's word (no survey): the oaks there were cut
# The land pack (lane C's; knowledge\DATA-INVENTORY.md section 3): its own folder on this PC is read
# first (the dataset of record), its published copy only where that folder is not there.
LOCAL_PACK = os.path.join(PLAYGROUND, "Sulphur - Spatial - Map", "sulphur-mountain-world")
PACK = os.environ.get("SITE_PACK_URL") or ((pathlib.Path(LOCAL_PACK).as_uri() + "/") if os.path.isdir(LOCAL_PACK) else "https://sulphur-mountain-world.vercel.app/")
GROUND_ABOVE = 0.02  # metres an element's base may read above the land file's triangles and still count as standing in the ground
BRAIN = os.environ.get("PLAYGROUND_BRAIN", os.path.join(PLAYGROUND, "BRAIN.md"))
MM = 1000.0
# where the first pavilion stood (29 Sep), in metres from the anchor: on the driveway
DRIVEWAY_SPOT = (-77.52, -33.00)
# where the second stood (1 Oct): clear of the road, the easement and the buildings, and under protected oaks
OAK_SPOT = (-112.0, 31.0)
SHED_SPOT = (-23.5, -39.8)  # the middle of the shed, an existing building (its outline in lane C's build envelope, read 3 Oct)
HOUSE_OAK_SPOT = (-3.8, 9.3)  # the middle of a protected canopy inside the house zone (tree 2344 in lane C's build envelope, read 3 Oct)
# two smooth plan curves through points (metres), as drawn by clicking: an open one and a ring
GARDEN_POINTS = [(-2.0, 7.5), (0.25, 8.3), (2.5, 7.5), (4.75, 6.7), (7.0, 7.5)]
RING_POINTS = [(5.0, 0.0), (2.5, 4.0), (-2.5, 4.0), (-5.0, 0.0), (-2.5, -4.0), (2.5, -4.0)]


# ------------------------------------------------------------------ independent pieces
def smooth_length(points, closed, steps=400):
    """The length (metres) of the smooth curve through points: a uniform Catmull-Rom spline
    (an open curve takes its end points twice), each span's speed integrated by Simpson's rule."""
    n = len(points)
    total = 0.0
    for i in range(n if closed else n - 1):
        if closed:
            p0, p1, p2, p3 = (points[(i + k) % n] for k in (-1, 0, 1, 2))
        else:
            p0, p1, p2, p3 = (points[min(n - 1, max(0, i + k))] for k in (-1, 0, 1, 2))

        def speed(t):
            d = [0.5 * ((-a + c) + 2 * (2 * a - 5 * b + 4 * c - e) * t + 3 * (-a + 3 * b - 3 * c + e) * t * t)
                 for a, b, c, e in zip(p0, p1, p2, p3)]
            return math.hypot(d[0], d[1])

        h = 1.0 / steps
        total += h / 3 * (speed(0.0) + speed(1.0) + sum((4 if k % 2 else 2) * speed(k * h) for k in range(1, steps)))
    return total


def circle_band(span, rise, t):
    """The section (m²) of a vault on a circle arch: what lies above the springing line between
    the arch's circle and the same circle t larger. (A disc of radius r above a line h over
    its centre holds r² acos(h / r) - h sqrt(r² - h²).)"""
    half = span / 2
    rho = (half * half + rise * rise) / (2 * rise)
    h = rho - rise  # how far the centre lies under the springing line
    part = lambda r: r * r * math.acos(h / r) - h * math.sqrt(r * r - h * h)  # noqa: E731
    return part(rho + t) - part(rho)


def circle_foot(span, rise, t):
    """How wide such a vault's foot is on the springing line (m): from the arch's springing out
    to where the larger circle comes down (t on a semicircle, more on a flatter arch)."""
    half = span / 2
    rho = (half * half + rise * rise) / (2 * rise)
    return math.sqrt((rho + t) ** 2 - (rho - rise) ** 2) - half


def pointed_band(span, rise, t):
    """The section (m²) of a vault on a pointed arch: two arcs about (±d, 0) through the
    springings and the apex, and the same two t larger. (A disc of radius r on the far side
    of an upright line d from its centre holds r² acos(d / r) - d sqrt(r² - d²); the half of
    it above the springing line, twice.)"""
    half = span / 2
    d = (rise * rise - half * half) / span
    part = lambda r: r * r * math.acos(d / r) - d * math.sqrt(r * r - d * d)  # noqa: E731
    return part(half + d + t) - part(half + d)


def offset_band(length, slope, t, plinth=0.0):
    """The section (m²) of a vault whose outside lies t off its inside line along its normal:
    t times the line's length, plus t² times half the angle it turns through (it leaves one
    springing at `slope` and reaches the other at minus that); the two toes, where the outside
    is carried on straight to the springing line (t² / slope together; none on an upright
    springing); and under each foot, t / sin φ wide, a stem `plinth` deep."""
    phi = math.atan(slope) if slope != float("inf") else math.pi / 2
    toes = 0.0 if slope == float("inf") else t * t / slope
    return t * length + t * t * phi + toes + 2 * plinth * t / math.sin(phi)


def chain_line(span, rise):
    """(the length, the slope at its springing) of the hanging chain z = a (cosh(span / 2a) -
    cosh(x / a)) that rises `rise` over `span`; a found here by halving."""
    lo, hi = 1e-6 * span, 1e6 * span
    for _ in range(200):
        mid = math.sqrt(lo * hi)
        over = span / 2 / mid
        if over > 700.0 or mid * (math.cosh(over) - 1.0) > rise:
            lo = mid
        else:
            hi = mid
    a = math.sqrt(lo * hi)
    return 2 * a * math.sinh(span / 2 / a), math.sinh(span / 2 / a)


def parabola_line(span, rise):
    """(the length, the slope at its springing) of the parabola z = rise (1 - (2x / span)²)."""
    half, m = span / 2, 4 * rise / span
    return half * math.sqrt(1 + m * m) + half / m * math.asinh(m), m


def ellipse_line(span, rise, steps=20000):
    """(the length, the slope at its springing: upright) of the half ellipse x = span / 2 cos k,
    z = rise sin k, its speed summed here by Simpson's rule."""
    speed = lambda k: math.hypot(span / 2 * math.sin(k), rise * math.cos(k))  # noqa: E731
    h = math.pi / steps
    return h / 3 * (speed(0.0) + speed(math.pi) + sum((4 if k % 2 else 2) * speed(k * h) for k in range(1, steps))), float("inf")


def parallel_volume(slopes, x0, x1, y0, y1, t, n=400):
    """The volume (m³) of a surface z = f(x, y) over a rectangle made thick t along its upward
    normal (the parallel body): the integral of (t - t² H + t³ K / 3) W, W = √(1 + fx² + fy²),
    H and K its mean and Gaussian curvature taken with the upward normal (H < 0 where it bends
    down: the body grows outward there). slopes(x, y) gives fx, fy, fxx, fyy, fxy; midpoint
    rule, n × n."""
    hx, hy = (x1 - x0) / n, (y1 - y0) / n
    total = 0.0
    for i in range(n):
        x = x0 + (i + 0.5) * hx
        for j in range(n):
            fx, fy, fxx, fyy, fxy = slopes(x, y0 + (j + 0.5) * hy)
            w2 = 1.0 + fx * fx + fy * fy
            w = math.sqrt(w2)
            h = ((1 + fy * fy) * fxx - 2 * fx * fy * fxy + (1 + fx * fx) * fyy) / (2 * w2 * w)
            k = (fxx * fyy - fxy * fxy) / (w2 * w2)
            total += (t - t * t * h + t ** 3 * k / 3) * w
    return total * hx * hy


def conoid_slopes(span, length, rise):
    """The slopes of lane R's conoid, z = eave + (1 - v) rise (1 - (2x / span)²), v = (y + length / 2) / length."""
    def slopes(x, y):
        a, da, dda = 1 - (2 * x / span) ** 2, -8 * x / span ** 2, -8 / span ** 2
        g, dg = (length / 2 - y) / length, -1.0 / length
        return rise * g * da, rise * a * dg, rise * g * dda, 0.0, rise * da * dg
    return slopes


def translation_slopes(span, length, rise_x, rise_y):
    """The slopes of lane R's translation shell, z = eave + rise_x (1 - (2x / span)²) + rise_y (1 - (2y / length)²)."""
    return lambda x, y: (-8 * rise_x * x / span ** 2, -8 * rise_y * y / length ** 2, -8 * rise_x / span ** 2, -8 * rise_y / length ** 2, 0.0)


def groined_volume(support, tip, centre, tip_h, t, lobes=8, n=400):
    """The volume (m³) of lane R's groined saddles: over one lobe's plan (between its two groins,
    out to its free edge r = support + (tip - support) |cos(lobes θ / 2)|), the height of its
    saddle moved t along the saddle's normal less the saddle's own, times the lobes. The moved
    saddle is read above each place by stepping to the point of the saddle whose normal passes
    over it. Polar midpoint rule, n × n."""
    half = math.pi / lobes
    a = (tip_h - centre) / tip ** 2
    b = (centre / support ** 2 + a * math.cos(half) ** 2) / math.sin(half) ** 2
    total = 0.0
    for i in range(n):
        th = -half + 2 * half * (i + 0.5) / n
        edge = support + (tip - support) * abs(math.cos(lobes * th / 2))
        for j in range(n):
            r = edge * (j + 0.5) / n
            x, y = r * math.cos(th), r * math.sin(th)
            u, v = x, y
            for _ in range(80):
                k = math.sqrt(1 + 4 * a * a * u * u + 4 * b * b * v * v)
                nu, nv = x + t * 2 * a * u / k, y - t * 2 * b * v / k
                done = abs(nu - u) + abs(nv - v) < 1e-13
                u, v = nu, nv
                if done:
                    break
            k = math.sqrt(1 + 4 * a * a * u * u + 4 * b * b * v * v)
            total += ((a * u * u - b * v * v + t / k) - (a * x * x - b * y * y)) * r * (edge / n) * (2 * half / n)
    return total * lobes


def lattice_facts():
    """G. Laths lying on shells, read here: the top of a shell found face by face against a
    boolean of the solid with the upright line; laths on a hemisphere, each lath's volume, its
    nodes, the ring at its foot; a conoid's leaning end face, and laths along its own straight
    lines."""
    import random

    import organic_biomimetic as ob

    rng = random.Random(11)
    shells = {"hemisphere": og.dome_shape("Sphere", 5.0, 5.0, 0.15), "conoid": og.conoid_shape(9.0, 12.0, 3.0, 2.6, 0.08),
              "wave vault": og.wave_vault_shape("Catenary", 8.0, 2.4, 0.12, 18.0, 0.6, 3, 2.2)[0]}
    out = {"tops": []}
    for name, shell in shells.items():
        tops = ob.Tops(shell)
        b = shell.BoundBox
        for _ in range(30):
            x, y = rng.uniform(b.XMin, b.XMax), rng.uniform(b.YMin, b.YMax)
            hits = tops.crossings(x, y)
            zs = [v.Point.z for v in shell.common(Part.makeLine(App.Vector(x, y, b.ZMin - 1000.0), App.Vector(x, y, b.ZMax + 1000.0))).Vertexes]
            out["tops"].append((name, hits[0][0] / MM if hits else None, max(zs) / MM if zs else None))
    def ends(s):
        caps = [f.CenterOfMass for f in s.Faces if type(f.Surface).__name__ == "Plane"]
        return {"caps": [(p.x / MM, p.y / MM, p.z / MM) for p in caps], "low": min(p.z for p in caps) / MM if caps else float("inf"),
                "high": max(p.z for p in caps) / MM if caps else float("inf")}

    got = ob.net_on_shell(shells["hemisphere"], 1.0, 0.08, 0.05, 0.0, 1, 0.15)
    solids = got["shape"].Solids
    laths = [dict(ends(s), valid=s.isValid(), volume=og.volume_of(s) / 1e9) for s in solids[:got["laths"]]]
    out["hemisphere"] = {"radius": 5.0, "width": 0.08, "depth": 0.05, "spacing": 1.0, "laths": laths, "nodes": got["nodes"],
                         "beams": [{"valid": s.isValid(), "volume": og.volume_of(s) / 1e9} for s in solids[got["laths"]:]], "side": 0.15}
    # the Dome button's own dome, an ellipse 5.5 m high on a 5 m radius: its crown a pole, where a lath once came in two
    solids = ob.laths_on(og.dome_shape("Ellipse", 5.0, 5.5, 0.30), 1.0, 0.08, 0.05, 0.0, 1)[0]
    out["ellipse dome"] = {"radius": 5.0, "width": 0.08, "spacing": 1.0, "laths": [ends(s) for s in solids]}
    conoid = shells["conoid"]
    solids, _nodes, _total, faces, tops = ob.laths_on(conoid, 1.0, 0.08, 0.05, 0.0, 1)
    # the faces of the conoid seen from above and what the finder makes of them: its back, or one of its sides
    seen = {}
    for k in range(len(conoid.Faces)):
        if tops.rows[k]["side"] is not None:
            seen[k] = "side" if tops.rows[k]["side"] else "back"
    b = conoid.BoundBox
    end = [k for k, f in enumerate(conoid.Faces) if abs(f.BoundBox.YMin - b.YMin) < 1.0 and f.BoundBox.YLength < 50.0 and f.BoundBox.ZLength > 1000.0]  # the arch's end face, 2 cm deep
    out["conoid"] = {"faces": sorted(faces), "seen": seen, "end": end, "laths": len(solids), "valid": all(s.isValid() and len(s.Solids) == 1 for s in solids)}
    return out



def wgs84_metres_per_degree(lat):
    """East and north metres per degree at a latitude, from WGS84's radii of curvature."""
    a, e2 = 6378137.0, 6.69437999014e-3
    s = math.sin(math.radians(lat))
    n = a / math.sqrt(1 - e2 * s * s)
    m = a * (1 - e2) / (1 - e2 * s * s) ** 1.5
    return math.radians(1) * n * math.cos(math.radians(lat)), math.radians(1) * m


def canonical_frame():
    """(lng, lat, ground m) of the anchor, as BRAIN.md §3 states them."""
    with open(BRAIN, encoding="utf-8") as fh:
        text = fh.read().replace("−", "-").replace("*", "")
    section = text.split("## 3.", 1)[1].split("## 4.", 1)[0]
    origin = re.search(r"lng\s*(-?\d+\.\d+),\s*lat\s*(-?\d+\.\d+)", section)
    ground = re.search(r"(\d+\.\d+)\s*m NAVD88", section)
    if not origin or not ground:
        raise RuntimeError("BRAIN.md §3 no longer states the anchor and its ground datum")
    return float(origin.group(1)), float(origin.group(2)), float(ground.group(1))


def format_md_anchor():
    """What exchange/godot/FORMAT.md states for the origin and its ground (lane C's file), or None."""
    try:
        with open(os.path.join(LAND, "FORMAT.md"), encoding="utf-8") as fh:
            text = fh.read().replace("−", "-").replace("*", "")
    except OSError:
        return None
    origin = re.search(r"lng\s*(-?\d+\.\d+),\s*lat\s*(-?\d+\.\d+)", text)
    ground = re.search(r"Ground datum:\s*(\d+\.\d+)\s*m", text)
    return (float(origin.group(1)), float(origin.group(2)), float(ground.group(1))) if origin and ground else None


def glb(path):
    with open(path, "rb") as fh:
        data = fh.read()
    if data[:4] != b"glTF":
        raise RuntimeError("%s is not a GLB" % path)
    jlen = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20 + jlen])
    blen = struct.unpack_from("<I", data, 20 + jlen)[0]
    return gltf, data[28 + jlen:28 + jlen + blen]


def accessor(gltf, blob, index):
    import numpy as np

    acc = gltf["accessors"][index]
    view = gltf["bufferViews"][acc["bufferView"]]
    comps = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[acc["type"]]
    dtype = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[acc["componentType"]]
    item = np.dtype(dtype).itemsize * comps
    stride = view.get("byteStride", item)
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    raw = np.frombuffer(blob, dtype=np.uint8, count=stride * (acc["count"] - 1) + item, offset=start)
    rows = np.lib.stride_tricks.as_strided(raw, shape=(acc["count"], item), strides=(stride, 1))
    return np.ascontiguousarray(rows).view(dtype).reshape(acc["count"], comps).astype(float)


def node_matrix(node):
    """A glTF node's own transform as a 4 x 4 matrix."""
    import numpy as np

    if "matrix" in node:
        return np.array(node["matrix"], dtype=float).reshape(4, 4).T
    x, y, z, w = node.get("rotation", (0.0, 0.0, 0.0, 1.0))
    m = np.eye(4)
    m[:3, :3] = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                          [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                          [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]) * np.array(node.get("scale", (1.0, 1.0, 1.0)), dtype=float)
    m[:3, 3] = node.get("translation", (0.0, 0.0, 0.0))
    return m


def node_meshes(gltf, blob):
    """{node name: (positions, triangles, extras)} for every node with a mesh, its points taken
    through the node transforms above it (the file's own frame)."""
    import numpy as np

    out = {}

    def walk(index, parent):
        n = gltf["nodes"][index]
        world = parent @ node_matrix(n)
        if "mesh" in n:
            pos_all, tri_all = [], []
            base = 0
            for prim in gltf["meshes"][n["mesh"]]["primitives"]:
                p = accessor(gltf, blob, prim["attributes"]["POSITION"])
                i = accessor(gltf, blob, prim["indices"]).astype(int).reshape(-1, 3) if "indices" in prim else np.arange(len(p)).reshape(-1, 3)
                pos_all.append(p @ world[:3, :3].T + world[:3, 3])
                tri_all.append(i + base)
                base += len(p)
            out[n.get("name", "")] = (np.vstack(pos_all), np.vstack(tri_all), n.get("extras", {}))
        for child in n.get("children", []):
            walk(child, world)

    for root in gltf["scenes"][gltf.get("scene", 0)]["nodes"]:
        walk(root, np.eye(4))
    return out


def root_extras(gltf):
    roots = gltf["scenes"][gltf.get("scene", 0)]["nodes"]
    return gltf["nodes"][roots[0]].get("extras", {}) if roots else {}


def root_is_plain(gltf):
    """Whether the scene's root node carries no transform of its own."""
    roots = gltf["scenes"][gltf.get("scene", 0)]["nodes"]
    return len(roots) == 1 and not any(k in gltf["nodes"][roots[0]] for k in ("matrix", "translation", "rotation", "scale"))


def enclosed_volume(pos, tri):
    a, b, c = pos[tri[:, 0]], pos[tri[:, 1]], pos[tri[:, 2]]
    return float((a * (b[:, [1, 2, 0]] * c[:, [2, 0, 1]] - b[:, [2, 0, 1]] * c[:, [1, 2, 0]])).sum() / 6.0)


def terrain_height(tpos, ttri, x, z):
    """The map's ground (glTF y) under a point (x, z), by barycentric lookup in its triangles."""
    import numpy as np

    a, b, c = tpos[ttri[:, 0]], tpos[ttri[:, 1]], tpos[ttri[:, 2]]
    x0, x1 = np.minimum(np.minimum(a[:, 0], b[:, 0]), c[:, 0]), np.maximum(np.maximum(a[:, 0], b[:, 0]), c[:, 0])
    z0, z1 = np.minimum(np.minimum(a[:, 2], b[:, 2]), c[:, 2]), np.maximum(np.maximum(a[:, 2], b[:, 2]), c[:, 2])
    for k in np.nonzero((x0 <= x) & (x <= x1) & (z0 <= z) & (z <= z1))[0]:
        (ax, ay, az), (bx, by, bz), (cx, cy, cz) = a[k], b[k], c[k]
        det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
        if abs(det) < 1e-12:
            continue
        l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det
        l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det
        l3 = 1 - l1 - l2
        if min(l1, l2, l3) >= -1e-9:
            return l1 * ay + l2 * by + l3 * cy
    return None


def inside(p, poly):
    x, y, c = p[0], p[1], False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            c = not c
    return c


def placed(pos, place, anchor, k):
    """A GLB mesh's points (the building's own frame, glTF axes) on the site: metres east and
    north of the anchor and above its ground, by a placement's coordinates, altitude and turn
    (the final transform of the .glb, as FORMAT.md's edits/2 has it)."""
    import numpy as np

    alng, alat, _aelev = anchor
    t = math.radians(place["rotation_deg"]["y"])  # anticlockwise seen from above
    lx, ly, lz = pos[:, 0], -pos[:, 2], pos[:, 1]
    return np.column_stack([(place["coordinates"][0] - alng) * k[0] + lx * math.cos(t) - ly * math.sin(t),
                            (place["coordinates"][1] - alat) * k[1] + lx * math.sin(t) + ly * math.cos(t),
                            place["altitude_m"] + lz])


def base_gaps(world, tpos, ttri, zero, samples=60):
    """How an element's base stands against the map's ground: the least and the greatest of
    (base point - the ground under it) over its points within 5 cm of its lowest, as metres.
    `world` is (n, 3) east, north, up from the anchor and its ground. None when the land
    file has no ground under it."""
    low = world[world[:, 2] <= world[:, 2].min() + 0.05]
    gaps = []
    for e, n, u in low[:: max(1, len(low) // samples)]:
        g = terrain_height(tpos, ttri, e, -n)
        if g is not None and zero is not None:
            gaps.append(float(u - (g - zero)))
    return (min(gaps), max(gaps)) if gaps else None


def convex_hull(points):
    """The convex hull of plan points (n, 2), counter-clockwise (the monotone chain)."""
    import numpy as np

    pts = np.unique(np.round(np.asarray(points, dtype=float), 4), axis=0)
    pts = pts[np.lexsort((pts[:, 1], pts[:, 0]))]
    if len(pts) < 3:
        return pts

    def half(seq):
        out = []
        for p in seq:
            while len(out) >= 2 and (out[-1][0] - out[-2][0]) * (p[1] - out[-2][1]) - (out[-1][1] - out[-2][1]) * (p[0] - out[-2][0]) <= 0:
                out.pop()
            out.append(p)
        return out[:-1]

    return np.array(half(pts) + half(pts[::-1]))


def point_segment(p, a, b):
    import numpy as np

    ab = b - a
    t = np.clip(((p - a) * ab).sum(-1) / np.maximum((ab * ab).sum(-1), 1e-18), 0.0, 1.0)
    return np.linalg.norm(p - (a + t[..., None] * ab), axis=-1)


def clearance(hull, pieces):
    """The least distance in plan between a convex polygon (m, 2) and convex pieces (n, k, 2):
    triangles (k = 3) or segments (k = 2). 0 where one overlaps it (separating axes)."""
    import numpy as np

    pieces = np.asarray(pieces, dtype=float)
    he = np.roll(hull, -1, axis=0) - hull
    hn = np.column_stack([-he[:, 1], he[:, 0]])
    hp = hull @ hn.T
    hmin, hmax = hp.min(axis=0), hp.max(axis=0)
    best = float("inf")
    for start in range(0, len(pieces), 4000):
        part = pieces[start:start + 4000]
        pp = part @ hn.T
        apart = ((pp.max(axis=1) < hmin) | (pp.min(axis=1) > hmax)).any(axis=1)
        pe = np.roll(part, -1, axis=1) - part
        pn = np.stack([-pe[..., 1], pe[..., 0]], axis=-1)
        on_h = np.einsum("mj,nkj->nkm", hull, pn)
        on_p = np.einsum("nvj,nkj->nkv", part, pn)
        apart |= ((on_p.max(axis=2) < on_h.min(axis=2)) | (on_p.min(axis=2) > on_h.max(axis=2))).any(axis=1)
        if not apart.all():
            return 0.0
        d1 = point_segment(hull[:, None, None, :], part[None], np.roll(part, -1, axis=1)[None])
        d2 = point_segment(part[:, :, None, :], hull[None, None], np.roll(hull, -1, axis=0)[None, None])
        best = min(best, float(d1.min()), float(d2.min()))
    return best


def ring_clearance(hull, ring):
    """The least distance in plan between a convex polygon and a closed ring's area."""
    import numpy as np

    r = np.asarray(ring, dtype=float)
    edges = np.stack([r, np.roll(r, -1, axis=0)], axis=1)
    d = clearance(hull, edges)
    return 0.0 if d > 0 and inside(tuple(hull[0]), [tuple(p) for p in r]) else d


def plan(pos, tri):
    """A mesh's triangles in plan, (n, 3, 2) as (east, north), less those seen edge-on."""
    import numpy as np

    t = np.stack([pos[tri][:, :, 0], -pos[tri][:, :, 2]], axis=2)
    a, b, c = t[:, 0], t[:, 1], t[:, 2]
    area = np.abs((b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0])) / 2
    return t[area > 1e-6]


def ifc_facts(path):
    import numpy as np
    import ifcopenshell
    import ifcopenshell.geom
    import ifcopenshell.util.element
    import ifcopenshell.util.placement
    import ifcopenshell.util.unit

    f = ifcopenshell.open(path)
    scale = ifcopenshell.util.unit.calculate_unit_scale(f)  # the file's length unit, in metres
    site = f.by_type("IfcSite")[0]
    building = f.by_type("IfcBuilding")[0]
    elements, unread = {}, []
    seen = set()

    def chain(lp):
        out = []
        while lp is not None and lp.is_a("IfcLocalPlacement") and lp.id() not in out:
            out.append(lp.id())
            lp = lp.PlacementRelTo
        return out

    under = True
    for e in f.by_type("IfcElement"):
        if e.GlobalId in seen or e.is_a("IfcOpeningElement"):
            continue
        seen.add(e.GlobalId)
        under = under and building.ObjectPlacement.id() in chain(e.ObjectPlacement)
        # the Brep's own points, read as data (no geometry engine), then the element's placement
        local = []
        for rep in (e.Representation.Representations if e.Representation else []):
            for item in rep.Items:
                shell = getattr(item, "Outer", None)
                for face in (shell.CfsFaces if shell is not None else []):
                    for bound in face.Bounds:
                        local.extend(p.Coordinates for p in getattr(bound.Bound, "Polygon", []) or [])
        if not local:
            try:
                local = np.array(ifcopenshell.geom.create_shape(ifcopenshell.geom.settings(), e).geometry.verts, dtype=float).reshape(-1, 3) / scale
            except Exception as exc:
                unread.append("%s %s: %s" % (e.is_a(), e.Name, exc))
                continue
        local = np.array(local, dtype=float).reshape(-1, 3)
        m = ifcopenshell.util.placement.get_local_placement(e.ObjectPlacement)
        world = (local @ m[:3, :3].T + m[:3, 3]) * scale
        elements[e.Name] = {"class": e.is_a(), "min": tuple(float(v) for v in world.min(axis=0)), "max": tuple(float(v) for v in world.max(axis=0))}
    to_deg = lambda c: math.copysign(sum(abs(v) / d for v, d in zip(c, (1, 60, 3600, 3600e6))), c[0] if c[0] else (c[1] or c[2]))
    # the building on the site: its placement relative to the site's
    rel = np.linalg.inv(ifcopenshell.util.placement.get_local_placement(site.ObjectPlacement)) @ ifcopenshell.util.placement.get_local_placement(building.ObjectPlacement)
    bld = {"east": float(rel[0, 3]) * scale, "north": float(rel[1, 3]) * scale, "up": float(rel[2, 3]) * scale,
           "yaw": math.degrees(math.atan2(rel[1, 0], rel[0, 0])),  # anticlockwise seen from above
           "onSite": building.ObjectPlacement.PlacementRelTo is not None and building.ObjectPlacement.PlacementRelTo.id() == site.ObjectPlacement.id(),
           "elementsUnder": under,
           "refHeight": float(building.ElevationOfRefHeight) * scale if building.ElevationOfRefHeight is not None else None,
           "pset": dict(ifcopenshell.util.element.get_psets(building).get("Organic_Placement", {}))}
    # what IfcOpenShell's own schema check says of the file (every attribute's type, every entity the schema asks for)
    import ifcopenshell.validate

    logger = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(f, logger)
    statements = [str(s.get("message", "")).replace("\n", " ")[:160] for s in logger.statements]
    # and that this validation can speak of this file at all: the file's own text with the building's GlobalId taken out,
    # read into memory (nothing is written), must be said to be at fault
    speaks = None
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        hit = re.search(r"(#\d+=\s*IFCBUILDING\()'[^']*'", text)
        if hit:
            probe = ifcopenshell.validate.json_logger()
            ifcopenshell.validate.validate(ifcopenshell.file.from_string(text[:hit.start()] + hit.group(1) + "$" + text[hit.end():]), probe)
            speaks = [str(s.get("message", "")).replace("\n", " ")[:80] for s in probe.statements]
    except Exception as exc:
        speaks = None
        unread.append("the text with a fault put in could not be validated: %s" % exc)
    return {"lat": to_deg(site.RefLatitude), "lng": to_deg(site.RefLongitude), "elev": float(site.RefElevation or 0.0) * scale,
            "elements": elements, "unread": unread, "building": bld, "schema": f.schema, "statements": statements, "speaks": speaks}


def fetch(path):
    req = urllib.request.Request(PACK + path, headers={"User-Agent": "check_organic"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except OSError:
            if attempt == 2:
                raise


def rings_of(geometry):
    kind, c = geometry["type"], geometry["coordinates"]
    return [c[0]] if kind == "Polygon" else [poly[0] for poly in c] if kind == "MultiPolygon" else []


def lines_of(geometry):
    kind, c = geometry["type"], geometry["coordinates"]
    return [c] if kind == "LineString" else list(c) if kind == "MultiLineString" else []


def polygons_of(geometry):
    """A geometry's polygons, each as its rings (the outline first, then its holes)."""
    kind, c = geometry["type"], geometry["coordinates"]
    return [c] if kind == "Polygon" else list(c) if kind == "MultiPolygon" else []


def in_rings(points, rings):
    """Which of the points (n, 2) lie in a polygon given by its rings: an odd number of its
    edges crossed by a ray to the east (the outline and the holes counted alike)."""
    import numpy as np

    x, y = points[:, 0], points[:, 1]
    odd = np.zeros(len(points), dtype=bool)
    for ring in rings:
        for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
            if y0 != y1:
                odd ^= ((y0 > y) != (y1 > y)) & (x < x0 + (y - y0) * (x1 - x0) / (y1 - y0))
    return odd


def ring_middle(ring):
    """The middle (the centroid, by the shoelace sums) of a closed ring of (x, y) points, summed
    from its own first point: summed in raw degrees (−119.155, 34.433) round a canopy 1e-4 of a
    degree across, the products lost every digit, and the middle of 21 of the 22 out-of-date
    oak zones at Johny's house fell up to 1.4 km away."""
    ox, oy = ring[0]
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
        x0, y0, x1, y1 = x0 - ox, y0 - oy, x1 - ox, y1 - oy
        c = x0 * y1 - x1 * y0
        a, cx, cy = a + c, cx + (x0 + x1) * c, cy + (y0 + y1) * c
    if abs(a) < 1e-30:
        return sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)
    return ox + cx / (3.0 * a), oy + cy / (3.0 * a)


def envelope_shares(envelope, lnglat, replaces=(), removed=()):
    """What the map's build envelope holds at a set of points (n, 2 as lng, lat), worked out
    here by ray casting: (the share of them in its buildable area, {kind: (share, reason)} for
    every other kind that holds any of them, {kind: (share, reason)} that holds any of them and
    is out of date there, {name: share} of the existing buildings it replaces), leaving out the
    house zone, which is a reference. Out of date: an oak_protection polygon whose middle lies in
    a polygon of lane C's oaks-removed overlay (removed: [(reason, polygons)]); replaced: an
    existing_building whose name is in replaces. Neither of the two is among the first."""
    import numpy as np

    lo, hi = lnglat.min(axis=0), lnglat.max(axis=0)
    hits, reasons, stale, stale_reasons, replaced = {}, {}, {}, {}, {}
    for kind, reason, polygons, name in envelope:
        if kind == "house_zone":
            continue
        for rings in polygons:
            outline = np.asarray([p[:2] for p in rings[0]], dtype=float)
            if (outline.max(axis=0) < lo).any() or (outline.min(axis=0) > hi).any():
                continue
            got = in_rings(lnglat, [[tuple(p[:2]) for p in ring] for ring in rings])
            if not got.any():
                continue
            if kind == "existing_building" and name in replaces:
                replaced[name] = got if name not in replaced else (replaced[name] | got)
                continue
            if kind == "oak_protection" and removed:
                middle = np.array([ring_middle([tuple(p[:2]) for p in rings[0]])])
                gone = next((why for why, polys in removed for poly in polys if in_rings(middle, [[tuple(p[:2]) for p in r] for r in poly])[0]), None)
                if gone is not None:
                    stale[kind] = got if kind not in stale else (stale[kind] | got)
                    stale_reasons.setdefault(kind, gone)
                    continue
            hits[kind] = got if kind not in hits else (hits[kind] | got)
            reasons.setdefault(kind, reason)
    n = float(len(lnglat))
    buildable = float(hits["buildable_envelope"].sum()) / n if "buildable_envelope" in hits else 0.0
    return (buildable, {k: (float(v.sum()) / n, reasons[k]) for k, v in sorted(hits.items()) if k != "buildable_envelope"},
            {k: (float(v.sum()) / n, stale_reasons[k]) for k, v in sorted(stale.items())}, {k: float(v.sum()) / n for k, v in sorted(replaced.items())})


# ------------------------------------------------------------------ read everything
def read_facts():
    import numpy as np

    facts = {}
    # A. kernels, built here
    def mesh_vol(shape):
        v = 0.0
        for fc in shape.Faces:
            pts, tris = fc.tessellate(2.0)
            for i, j, k in tris:
                v += pts[i].dot(pts[j].cross(pts[k]))
        return v / 6e9

    line = Part.LineSegment(og.V(0, 0), og.V(10, 0)).toShape()
    lob = og.lobed_curve(6.8, 5, 0.35)
    garden, _open = og.plan_path(og.points_curve(GARDEN_POINTS, smooth=True))
    ring, _closed = og.plan_path(og.points_curve(RING_POINTS, smooth=True, closed=True))
    kernels = {
        "arc wall": (og.wall_shape(og.arc_curve(5.0, 90.0), False, 0.3, 3.0), 0.3 * 3.0 * 5.0 * math.pi / 2),
        "circle wall": (og.wall_shape(og.arc_curve(4.0, 360.0), True, 0.3, 3.0), 2 * math.pi * 4.0 * 0.3 * 3.0),
        "wall less a window": (og.wall_shape(line, False, 0.3, 3.0, openings=[dict(position_m=5.0, width_m=1.2, height_m=1.5, sill_m=0.9, shape="Rect")]), 0.3 * 3.0 * 10.0 - 1.2 * 1.5 * 0.3),
        "semicircular vault": (og.vault_shape("Semicircle", 6.0, 3.0, 0.3, 8.0), math.pi / 2 * (3.3 ** 2 - 3.0 ** 2) * 8.0),
        "semicircular vault on a plinth": (og.vault_shape("Semicircle", 6.0, 3.0, 0.3, 8.0, plinth_m=0.6),
                                           math.pi / 2 * (3.3 ** 2 - 3.0 ** 2) * 8.0 + 2 * 0.3 * 8.0 * 0.6),
        "hemispherical dome": (og.dome_shape("Sphere", 5.0, 5.0, 0.3), 2 / 3 * math.pi * (5.0 ** 3 - 4.7 ** 3)),
        "arc wall, wave top": (og.wall_shape(og.arc_curve(4.2, 250.0), False, 0.35, 2.5, top="Wave", top_rise_m=0.35, top_waves=3, foundation_m=0.6),
                               0.35 * 4.2 * math.radians(250.0) * (2.5 + 0.35 / 2 + 0.6)),
        "lobed wall, wave top": (og.wall_shape(lob, True, 0.45, 3.2, top="Wave", top_rise_m=0.6, top_waves=5), None),
        "smooth wall through points, wave top": (og.wall_shape(garden, False, 0.3, 1.8, top="Wave", top_rise_m=0.3, top_waves=2),
                                                 0.3 * smooth_length(GARDEN_POINTS, False) * (1.8 + 0.3 / 2)),
        "smooth ring through points, arch top": (og.wall_shape(ring, True, 0.3, 1.8, top="Arch", top_rise_m=0.9),
                                                 0.3 * smooth_length(RING_POINTS, True) * (1.8 + 0.9 * 2 / math.pi)),
        "catenary vault, ribs": (og.vault_shape("Catenary", 6.0, 4.0, 0.25, 8.0, ribs=3), None),
        # the vault built section by section (how a vault along a curve and a wave vault are made), here straight and
        # plain, every profile against its own section's closed form times its length
        "semicircular vault, section by section": (og.sectioned_vault("Semicircle", 6.0, 3.0, 0.3, 8.0)[0], circle_band(6.0, 3.0, 0.3) * 8.0),
        "segmental vault on a plinth, section by section": (og.sectioned_vault("Segmental", 6.0, 2.0, 0.25, 8.0, plinth_m=0.6)[0],
                                                            (circle_band(6.0, 2.0, 0.25) + 2 * circle_foot(6.0, 2.0, 0.25) * 0.6) * 8.0),
        "pointed vault, section by section": (og.sectioned_vault("Pointed", 6.0, 4.0, 0.25, 8.0)[0], pointed_band(6.0, 4.0, 0.25) * 8.0),
        "catenary vault on a plinth, section by section": (og.sectioned_vault("Catenary", 6.0, 4.0, 0.25, 8.0, plinth_m=0.6)[0],
                                                           offset_band(*chain_line(6.0, 4.0), 0.25, 0.6) * 8.0),
        "flat catenary vault, section by section": (og.sectioned_vault("Catenary", 4.0, 1.0, 0.15, 8.0)[0], offset_band(*chain_line(4.0, 1.0), 0.15) * 8.0),
        "parabolic vault on a plinth, section by section": (og.sectioned_vault("Parabola", 6.0, 3.0, 0.2, 8.0, plinth_m=0.6)[0],
                                                            offset_band(*parabola_line(6.0, 3.0), 0.2, 0.6) * 8.0),
        "elliptic vault, section by section": (og.sectioned_vault("Ellipse", 6.0, 2.5, 0.15, 8.0)[0], offset_band(*ellipse_line(6.0, 2.5), 0.15) * 8.0),
        # lane R's shells given by a formula (FROM-RESEARCH.md 3, 4, 6; R's cases A and B, R's thicknesses): each against
        # its volume worked out here, the conoid and the translation shell as parallel bodies, the groined saddles over their plan
        "conoid (R's case A)": (og.conoid_shape(9.0, 12.0, 3.0, 2.6, 0.08), parallel_volume(conoid_slopes(9.0, 12.0, 3.0), -4.5, 4.5, -6.0, 6.0, 0.08)),
        "conoid (R's case B)": (og.conoid_shape(6.0, 8.0, 2.0, 2.4, 0.08), parallel_volume(conoid_slopes(6.0, 8.0, 2.0), -3.0, 3.0, -4.0, 4.0, 0.08)),
        "translation shell (R's case A)": (og.translation_shell_shape(10.0, 14.0, 1.6, 2.2, 2.6, 0.08),
                                           parallel_volume(translation_slopes(10.0, 14.0, 1.6, 2.2), -5.0, 5.0, -7.0, 7.0, 0.08)),
        "translation shell (R's case B)": (og.translation_shell_shape(6.0, 6.0, 1.2, 1.2, 2.4, 0.08),
                                           parallel_volume(translation_slopes(6.0, 6.0, 1.2, 1.2), -3.0, 3.0, -3.0, 3.0, 0.08)),
        "groined saddles, eight lobes (R's case A)": (og.groined_saddles_shape(6.0, 7.85, 2.4, 4.0, 0.05), groined_volume(6.0, 7.85, 2.4, 4.0, 0.05)),
        "groined saddles at Los Manantiales' size (R's case B)": (og.groined_saddles_shape(16.2, 21.2, 5.8, 9.9, 0.05), groined_volume(16.2, 21.2, 5.8, 9.9, 0.05)),
        "groined saddles, four lobes": (og.groined_saddles_shape(6.0, 7.85, 2.4, 4.0, 0.05, 4), groined_volume(6.0, 7.85, 2.4, 4.0, 0.05, 4)),
        "groined saddles, six lobes, 0.08 m thick": (og.groined_saddles_shape(6.0, 7.85, 2.4, 4.0, 0.08, 6), groined_volume(6.0, 7.85, 2.4, 4.0, 0.08, 6)),
        "groined saddles, twelve lobes": (og.groined_saddles_shape(6.0, 7.85, 2.4, 4.0, 0.05, 12), groined_volume(6.0, 7.85, 2.4, 4.0, 0.05, 12)),
        "leaf shell": (og.leaf_shell_shape(16.0, 10.0, (0.4, 5.4, 6.0, 0.4), 0.4, 1.0, 0.2, 0.15, 2.0, outline="Pointed"), None),
        "leaf shell on footings": (og.leaf_shell_shape(16.0, 10.0, (0.4, 5.4, 6.0, 0.4), 0.4, 1.0, 0.2, 0.15, 2.0, outline="Pointed", plinth_m=0.6), None),
        "organic roof": (og.organic_roof_shape(lob, 3.2, 2.4, 0.8, 0.2), None),
    }
    facts["kernels"] = {k: {"valid": s.isValid(), "solids": len(s.Solids), "volume": s.Volume / 1e9, "mesh": mesh_vol(s), "closed_form": cf,
                            "zmin": s.optimalBoundingBox(False, False).ZMin / MM} for k, (s, cf) in kernels.items()}
    # a top cut that does nothing (the cutting solid moved a kilometre aside): what the kernel does with it,
    # as it is and with its own comparison switched off
    real_tool, real_tolerance = og.top_tool, og.TOP_TOLERANCE

    def idle_tool(*args):
        tool = real_tool(*args)
        tool.translate(App.Vector(og.BIG, 0, 0))
        return tool

    facts["idle_cut"] = {}
    og.top_tool = idle_tool
    try:
        for key, tolerance in (("guarded", real_tolerance), ("unguarded", 1.0e9)):
            og.TOP_TOLERANCE = tolerance
            try:
                s = og.wall_shape(garden, False, 0.3, 1.8, top="Wave", top_rise_m=0.3, top_waves=2)
                facts["idle_cut"][key] = {"refused": False, "volume": s.Volume / 1e9, "said": ""}
            except ValueError as exc:
                facts["idle_cut"][key] = {"refused": True, "volume": None, "said": str(exc)}
    finally:
        og.top_tool, og.TOP_TOLERANCE = real_tool, real_tolerance
    facts["idle_cut"]["closed_form"] = 0.3 * smooth_length(GARDEN_POINTS, False) * (1.8 + 0.3 / 2)
    # G. laths on shells
    facts["lattice"] = lattice_facts()
    # the design
    target = os.path.normcase(os.path.abspath(DESIGN))
    doc = next((d for d in App.listDocuments().values() if d.FileName and os.path.normcase(os.path.abspath(d.FileName)) == target), None)
    opened = doc is None
    doc = doc or App.openDocument(DESIGN, True)
    try:
        building = next(o for o in doc.Objects if getattr(o, "IfcType", "") == "Building")
        elements = [o for o in building.Group if hasattr(o, "Shape") and o.Shape.Solids]
        site = next(o for o in doc.Objects if getattr(o, "IfcType", "") == "Site")
        facts["design"] = {}
        for o in elements:
            # from the geometry: a plain BoundBox takes B-spline faces untrimmed, and asked without saying so
            # OCCT reads the triangles the window drew the solid with (in the window the leaf roof's box was 66 mm off)
            bb = o.Shape.optimalBoundingBox(False, False)
            facts["design"][o.Label] = {"class": str(o.IfcType), "volume": o.Shape.Volume / 1e9,
                                        "min": (bb.XMin / MM, bb.YMin / MM, bb.ZMin / MM), "max": (bb.XMax / MM, bb.YMax / MM, bb.ZMax / MM)}
        facts["design_origin"] = (float(site.Longitude), float(site.Latitude), site.Elevation.Value / MM)
        # Johny's decisions about where it stands, as the design holds them from its records (not as they were sent)
        facts["decided"] = json.loads(building.MapDecided) if getattr(building, "MapDecided", "") else {}
        ax = building.Placement.Rotation.multVec(App.Vector(1, 0, 0))
        base = building.Placement.Base
        facts["design_building"] = {"base": (base.x / MM, base.y / MM, base.z / MM), "yaw": math.degrees(math.atan2(ax.y, ax.x))}
    finally:
        if opened:
            App.closeDocument(doc.Name)
    # B-D. the GLB, what is written beside it, and the map's own files
    gltf, blob = glb(EXPORT)
    facts["glb"] = {name: {"pos": p, "tri": t, "extras": ex} for name, (p, t, ex) in node_meshes(gltf, blob).items()}
    facts["glb_placement"] = root_extras(gltf).get("placement")
    facts["glb_root_plain"] = root_is_plain(gltf)
    with open(os.path.splitext(EXPORT)[0] + ".json", encoding="utf-8") as fh:
        facts["sidecar"] = json.load(fh)
    sg, sb = glb(SITE_GLB)
    site_nodes = node_meshes(sg, sb)
    terrain = next(v for k, v in site_nodes.items() if k.startswith("terrain"))
    facts["terrain"] = (terrain[0], terrain[1])
    facts["terrain_zero"] = terrain_height(terrain[0], terrain[1], 0.0, 0.0)  # the land file's ground at the anchor
    facts["map_roads"] = np.concatenate([plan(p, t) for k, (p, t, _e) in site_nodes.items() if k.startswith("road")])
    facts["map_easement"] = np.concatenate([plan(p, t) for k, (p, t, _e) in site_nodes.items() if k.startswith("easement")])
    eg, eb = glb(EXISTING_GLB)
    facts["map_existing"] = {k: plan(p, t) for k, (p, t, _e) in node_meshes(eg, eb).items()}
    facts["envelope"] = None  # lane C's build envelope, as the map shades it: (kind, reason, polygons, name) per feature
    if os.path.isfile(ENVELOPE):
        with open(ENVELOPE, encoding="utf-8") as fh:
            facts["envelope"] = [((f.get("properties") or {}).get("kind"), (f.get("properties") or {}).get("reason", ""), polygons_of(f["geometry"]),
                                  (f.get("properties") or {}).get("name")) for f in json.load(fh)["features"]]
    # lane C's overlay from Johny's word (no survey): the oaks whose middle lies in it are out of date in the data
    facts["oaks_removed"] = []
    if os.path.isfile(OAKS_REMOVED):
        with open(OAKS_REMOVED, encoding="utf-8") as fh:
            facts["oaks_removed"] = [((f.get("properties") or {}).get("reason", ""), polygons_of(f["geometry"])) for f in json.load(fh)["features"]
                                     if (f.get("properties") or {}).get("kind") == "oaks_removed"]
    facts["anchor"] = canonical_frame()
    facts["format_md"] = format_md_anchor()
    survey = fetch("survey.geojson")
    ring = next(f for f in survey["features"] if f["properties"].get("layer") == "boundary")["geometry"]["coordinates"][0]
    facts["ring_lnglat"] = [tuple(p) for p in ring[:-1]]
    facts["pack_easement"] = [[tuple(p[:2]) for p in r[:-1]] for f in survey["features"] if f["properties"].get("layer") == "easement" for r in rings_of(f["geometry"])]
    county = fetch("county.geojson")
    facts["pack_roads"] = [[tuple(p[:2]) for p in l] for f in county["features"] if f["properties"].get("layer") == "road" for l in lines_of(f["geometry"])]
    facts["pack_footprints"] = [[tuple(p[:2]) for p in r[:-1]] for f in county["features"] if f["properties"].get("layer") == "footprint" for r in rings_of(f["geometry"])]
    # E. the IFC
    facts["ifc"] = ifc_facts(os.path.splitext(EXPORT)[0] + ".ifc")
    return facts


# ------------------------------------------------------------------ judge
def turn_gap(a, b):
    return abs((a - b + 180.0) % 360.0 - 180.0)


def judge(facts):
    import numpy as np

    oks, fails = [], []

    def ok(cond, msg):
        (oks if cond else fails).append(msg)

    # A
    for name, k in facts["kernels"].items():
        good = k["valid"] and k["solids"] == 1 and abs(k["mesh"] - k["volume"]) <= 0.005 * k["volume"]
        msg = "A %s: valid %s, %d solid, OCCT %.4f m³, its triangles %.4f m³" % (name, k["valid"], k["solids"], k["volume"], k["mesh"])
        if k["closed_form"] is not None:
            good = good and abs(k["volume"] - k["closed_form"]) <= 0.001 * k["closed_form"]
            msg += ", closed form %.4f m³" % k["closed_form"]
        ok(good, msg)
    feet, bare = facts["kernels"]["leaf shell on footings"], facts["kernels"]["leaf shell"]
    ok(abs(feet["zmin"] + 0.6) <= 0.005 and feet["volume"] > bare["volume"],
       "A leaf shell on footings: its lowest point at %.3f m (the footings reach 0.6 m below the base), %.3f m³ more than the bare shell"
       % (feet["zmin"], feet["volume"] - bare["volume"]))
    stem, arch = facts["kernels"]["semicircular vault on a plinth"], facts["kernels"]["semicircular vault"]
    ok(abs(stem["zmin"] + 0.6) <= 0.005 and abs(arch["zmin"]) <= 0.005 and abs((stem["volume"] - arch["volume"]) - 2 * 0.3 * 8.0 * 0.6) <= 0.001,
       "A vault on a plinth: its lowest point at %.3f m (the bare vault's at %.3f m), %.4f m³ more than the bare vault (two stems t L p = %.4f m³)"
       % (stem["zmin"], arch["zmin"], stem["volume"] - arch["volume"], 2 * 0.3 * 8.0 * 0.6))
    idle = facts["idle_cut"]["guarded"]
    ok(idle["refused"],
       "A a top cut that does nothing is refused, not drawn: %s"
       % (("the kernel said: " + idle["said"]) if idle["refused"]
          else "the kernel returned a wall of %.4f m³ where t L (H + rise / 2) = %.4f m³" % (idle["volume"], facts["idle_cut"]["closed_form"])))

    # G. laths on shells
    lat = facts["lattice"]
    pairs = lat["tops"]
    differ = [p for p in pairs if (p[1] is None) != (p[2] is None)]
    worst = max([abs(a - b) for _n, a, b in pairs if a is not None and b is not None] or [0.0])
    ok(not differ and worst <= 1e-6 and len(pairs) >= 90,
       "G the top of a shell found face by face: at %d places on a hemisphere, a conoid and a wave vault, the same height as a boolean of the solid "
       "with the upright line (worst %.2g m), and nothing where that finds nothing (%d places disagree)" % (len(pairs), worst, len(differ)))
    hs = lat["hemisphere"]
    big, w, d = hs["radius"], hs["width"], hs["depth"]
    off = max([abs(math.sqrt(x * x + y * y + z * z) - big) for x, y, z in hs["nodes"]] or [float("inf")])
    gaps = []
    for lath in hs["laths"]:
        caps = lath["caps"]
        if len(caps) != 2:
            gaps.append(float("inf"))
            continue
        (x1, y1, z1), (x2, y2, z2) = caps
        # its line lies in an upright plane x = c or y = c, on the circle the sphere has there; its section's middle runs on that
        # circle grown by 1 + d / 2R: Pappus gives its volume as w d times that circle's arc between its two end faces
        across = 0 if abs(x1 - x2) < abs(y1 - y2) else 1
        p1, p2 = ((y1, z1), (y2, z2)) if across == 0 else ((x1, z1), (x2, z2))
        rho = (math.hypot(*p1) + math.hypot(*p2)) / 2.0
        theta = abs(math.atan2(p1[0] * p2[1] - p1[1] * p2[0], p1[0] * p2[0] + p1[1] * p2[1]))
        gaps.append(abs(lath["volume"] - w * d * rho * theta) / (w * d * rho * theta))
    ok(hs["laths"] and all(lath["valid"] for lath in hs["laths"]) and off <= 1e-6 and max(gaps) <= 5e-4,
       "G laths on a hemisphere of radius %.0f m, 1 m apart: %d laths, each one valid solid; its %d nodes on the sphere (worst %.2g m); each lath's volume "
       "w d ρ θ, its middle line's circle and the arc between its two end faces read off it (worst %.3f %%)"
       % (big, len(hs["laths"]), len(hs["nodes"]), off, 100 * max(gaps or [float("inf")])))
    # a line x = c or y = c crosses a dome on a circle of radius R once, from foot to foot: one lath on each line with the
    # whole of the lath's width on the dome (|c| + w / 2 < R), both its ends at the foot (a lath in two ends on the back)
    whole = []
    for name in ("hemisphere", "ellipse dome"):
        dome = lat[name]
        lines = 2 * sum(1 for i in range(-50, 51) if abs(i * dome["spacing"]) + dome["width"] / 2 < dome["radius"])
        whole.append((name, len(dome["laths"]), lines, [z for lath in dome["laths"] for z in (lath["low"], lath["high"])]))
    ok(all(got == lines and heights and max(heights) <= 0.1 for _n, got, lines, heights in whole),
       "G every lath on a dome runs whole from its foot to its foot, inside the ring beam (%.2f m high): %s"
       % (hs["side"], "; ".join("on the %s %d laths, one on each line 1 m apart that crosses it with the whole of a lath's width (%d), their ends "
                                "%.3f to %.3f m above the foot" % (n, got, lines, min(heights or [float("nan")]), max(heights or [float("nan")]))
                                for n, got, lines, heights in whole)))
    side = hs["side"]
    ring = side * side * 2 * math.pi * (big + side / 2)
    beams = hs["beams"]
    ok(len(beams) == 1 and beams[0]["valid"] and abs(beams[0]["volume"] - ring) <= 5e-4 * ring,
       "G the ring beam at the hemisphere's foot: one closed beam of %.2f m standing on the ground outside the shell, %s m³ (b² 2π (R + b / 2) = %.5f)"
       % (side, ", ".join("%.5f" % b["volume"] for b in beams) or "none", ring))
    cn = lat["conoid"]
    ok(cn["end"] and all(cn["seen"].get(k) == "side" for k in cn["end"]) and not set(cn["end"]) & set(cn["faces"]) and cn["valid"] and cn["laths"] > 0,
       "G a conoid's leaning end face is one of its sides, not its back (face %s: %s): no lath lies on it (they lie on face %s); and %d laths along its own "
       "straight lines are valid solids (OCCT's swept section could not close them)" % (cn["end"], [cn["seen"].get(k) for k in cn["end"]], cn["faces"], cn["laths"]))

    design, meshes = facts["design"], facts["glb"]
    # B
    ok(sorted(design) == sorted(meshes), "B the GLB's nodes are the building's elements (%s)" % ", ".join(sorted(meshes)))
    for name, d in design.items():
        m = meshes.get(name)
        if m is None:
            continue
        vol = enclosed_volume(m["pos"], m["tri"])
        ok(m["extras"].get("ifcType") == d["class"] and abs(vol - d["volume"]) <= 0.01 * d["volume"],
           "B %s: class %s, mesh encloses %.3f m³ against the solid's %.3f m³" % (name, m["extras"].get("ifcType"), vol, d["volume"]))

    # C: where it stands, derived from the design and from BRAIN.md
    anchor = facts["anchor"]
    alng, alat, aelev = anchor
    dlng, dlat, delev = facts["design_origin"]
    k = wgs84_metres_per_degree(alat)
    kx, ky = k
    shift = ((dlng - alng) * kx, (dlat - alat) * ky, delev - aelev)  # the design's frame against the canonical one
    base, yaw = facts["design_building"]["base"], facts["design_building"]["yaw"]
    want = {"east": base[0] + shift[0], "north": base[1] + shift[1], "up": base[2] + shift[2], "yaw": yaw}
    place = (facts["sidecar"] or {}).get("placement") or {}
    stated = all(key in place for key in ("coordinates", "altitude_m", "rotation_deg", "elevation_m", "offset_m", "datum_m"))
    ok(stated, "C the sidecar states the placement: coordinates, altitude_m, rotation_deg, elevation_m, offset_m, datum_m")
    if not stated:
        return oks, fails
    east, north, up = (place["coordinates"][0] - alng) * kx, (place["coordinates"][1] - alat) * ky, place["altitude_m"]
    turn = place["rotation_deg"]
    ok(math.hypot(east - want["east"], north - want["north"]) <= 0.03 and abs(up - want["up"]) <= 0.01
       and turn_gap(turn["y"], want["yaw"]) <= 0.01 and turn["x"] == 0 and turn["z"] == 0,
       "C the sidecar's placement (lng %.7f, lat %.7f, altitude %+.2f m, rotation y %+.2f°: %.2f m E, %.2f m N of the anchor) is the design building's own "
       "(%.2f m E, %.2f m N, %+.2f m, turned %+.2f°)" % (place["coordinates"][0], place["coordinates"][1], up, turn["y"], east, north,
                                                         want["east"], want["north"], want["up"], want["yaw"]))
    off = place["offset_m"]
    ok(math.hypot(off["east"] - east, off["north"] - north) <= 0.02 and abs(off["up"] - up) <= 0.001
       and abs(place["datum_m"] - aelev) <= 1e-9 and abs(place["elevation_m"] - (aelev + up)) <= 0.001,
       "C the sidecar's offset_m (%.3f E, %.3f N, %.3f up) and elevation_m (%.3f m on the %.2f m datum) say the same as its coordinates and altitude_m"
       % (off["east"], off["north"], off["up"], place["elevation_m"], place["datum_m"]))
    ok(facts["glb_placement"] == place and facts["glb_root_plain"], "C the GLB carries the same placement in its root node's extras, and no transform on the root")
    if meshes:
        lo = np.min([m["pos"].min(axis=0) for m in meshes.values()], axis=0)
        hi = np.max([m["pos"].max(axis=0) for m in meshes.values()], axis=0)
        ok(lo[0] - 5 <= 0 <= hi[0] + 5 and lo[2] - 5 <= 0 <= hi[2] + 5,
           "C the building's own origin lies within its footprint (the geometry spans x %.1f..%.1f m, y %.1f..%.1f m about it): no offset baked in"
           % (lo[0], hi[0], -hi[2], -lo[2]))
    world, worst = {}, 0.0
    for name, d in design.items():
        m = meshes.get(name)
        if m is None:
            worst = float("inf")
            continue
        world[name] = placed(m["pos"], place, anchor, k)
        lo, hi = world[name].min(axis=0), world[name].max(axis=0)
        exp = [d["min"][i] + shift[i] for i in range(3)] + [d["max"][i] + shift[i] for i in range(3)]
        worst = max(worst, max(abs(a - b) for a, b in zip(list(lo) + list(hi), exp)))
    ok(worst <= 0.03, "C every element's GLB points, turned and moved by the sidecar's placement, within 3 cm of its FreeCAD bounds (worst %.4f m)" % worst)

    # D: on the site
    ring = [((lng - alng) * kx, (lat - alat) * ky) for lng, lat in facts["ring_lnglat"]]
    outside = 0
    for w in world.values():
        for e, n, _u in w[:: max(1, len(w) // 200)]:
            outside += not inside((e, n), ring)
    ok(bool(world) and outside == 0, "D every element inside the surveyed boundary (%d sampled vertices outside)" % outside)
    tpos, ttri = facts["terrain"]
    zero = facts["terrain_zero"]  # heights are taken from the ground at the anchor, in both files
    rows = []
    floor = min(float(w[:, 2].min()) for w in world.values()) if world else 0.0
    for name, w in world.items():
        if w[:, 2].min() > floor + 1.0:
            continue  # it rests on other elements, not on the ground
        rows.append((name,) + (base_gaps(w, tpos, ttri, zero) or (float("inf"), float("inf"))))
    decided = facts.get("decided") or {}
    below = decided.get("below_land")  # Johny's decision (FORMAT.md, "decided"): what lies below the ground is as he wants it for now
    deep = [r for r in rows if r[1] < -1.5]
    good = bool(rows) and all(hi_ <= GROUND_ABOVE for _n, _lo, hi_ in rows) and (below is not None or not deep)
    ok(good, "D every element that reaches the ground stands in the map's own terrain (its base from 1.5 m below the ground%s to %.2f m above it, nowhere in the air): %s%s"
       % (" or deeper, as decided" if below is not None else "", GROUND_ABOVE, "; ".join("%s %+.2f..%+.2f m" % r for r in rows),
          "; deeper than 1.5 m: %s, below the land as %s decided on %s" % (", ".join(r[0] for r in deep), below.get("by", "?"), below.get("on", "?")) if below is not None and deep else ""))
    if not world:
        return oks, fails
    hull = convex_hull(np.vstack([w[:, :2] for w in world.values()]))
    # the roads and the easement: the map's own meshes, and the pack's centrelines and survey
    road_map, ease_map = clearance(hull, facts["map_roads"]), clearance(hull, facts["map_easement"])
    lines = [np.array([((lng - alng) * kx, (lat - alat) * ky) for lng, lat in l]) for l in facts["pack_roads"]]
    segments = np.concatenate([np.stack([l[:-1], l[1:]], axis=1) for l in lines]) if lines else np.zeros((0, 2, 2))
    ease_rings = [[((lng - alng) * kx, (lat - alat) * ky) for lng, lat in r] for r in facts["pack_easement"]]
    road_pack = clearance(hull, segments)
    ease_pack = min([ring_clearance(hull, r) for r in ease_rings] or [float("inf")])
    verts = facts["map_roads"].reshape(-1, 2)
    half = float(point_segment(verts[:, None, :], segments[None, :, 0], segments[None, :, 1]).min(axis=1).max()) if len(segments) and len(verts) else float("inf")
    ok(road_map > 0 and ease_map > 0,
       "D not on a road, by the map's own file: the footprint is %.1f m from its roads and %.1f m from its access easement" % (road_map, ease_map))
    ok(road_pack > half and ease_pack > 0 and len(ease_rings) > 0,
       "D not on a road, by the land pack: the footprint is %.1f m from the county's centrelines and %.1f m from the surveyed easement" % (road_pack, ease_pack))
    ok(half <= 5.0 and abs(road_map - (road_pack - half)) <= 1.0 and abs(ease_map - ease_pack) <= 0.5,
       "D the map's roads lie along the pack's centrelines (%.2f m to either side), and both files give the same distances (roads %.1f against %.1f m, easement %.1f against %.1f m)"
       % (half, road_map, road_pack - half, ease_map, ease_pack))
    # the existing buildings: the map's layer, and the county's footprints. One that this building replaces (Johny's
    # decision, by its name in the map's layer) may be stood on; its county footprint is the one that lies on its mesh
    replaces = [str(n) for n in ((decided.get("replaces") or {}).get("existing") or [])]
    there = {name: clearance(hull, tris) for name, tris in facts["map_existing"].items()}
    rings = [[((lng - alng) * kx, (lat - alat) * ky) for lng, lat in r] for r in facts["pack_footprints"]]
    theirs = [i for i, r in enumerate(rings) for name in replaces if name in facts["map_existing"]
              and clearance(convex_hull(np.array(r[:-1] if r[0] == r[-1] else r)), facts["map_existing"][name]) <= 0.0]
    foot = [ring_clearance(hull, r) for i, r in enumerate(rings) if i not in theirs]
    others = {n: d for n, d in there.items() if n not in replaces}
    ok(bool(there) and bool(foot) and min(others.values() or [float("inf")]) > 0 and min(foot) > 0 and all(n in there for n in replaces),
       "D not inside the existing buildings: %s by the map's file; %.1f m from the nearest county footprint%s"
       % (", ".join("%.1f m from %s" % (d, n) for n, d in sorted(others.items())) or "none read", min(foot) if foot else float("nan"),
          "".join("; it replaces the %s (%s, %s: %d county footprint on it), %.1f m from it" % (n, decided["replaces"].get("by", "?"), decided["replaces"].get("on", "?"),
                                                                                              len(theirs), there.get(n, float("nan"))) for n in replaces)))
    # the map's build envelope (lane C's file: the county's setbacks, the oaks, the steep ground): read here by ray
    # casting at every vertex of the GLB set on the land by the sidecar, and held against what the export read of it
    envelope, told = facts.get("envelope"), (facts["sidecar"] or {}).get("envelope")
    if envelope is None:
        ok(False, "D inside the map's buildable envelope: its file (build-envelope.geojson) is not in the land folder")
    else:
        spots = np.vstack([w[:, :2] for w in world.values()])
        buildable, barred, stale, replaced = envelope_shares(envelope, np.column_stack([alng + spots[:, 0] / kx, alat + spots[:, 1] / ky]),
                                                             replaces, facts.get("oaks_removed") or [])
        barred = {key: v for key, v in barred.items() if v[0] > 0.0005}
        stale = {key: v for key, v in stale.items() if v[0] > 0.0005}
        replaced = {key: v for key, v in replaced.items() if v > 0.0005}
        said = {key: row["share"] for key, row in ((told or {}).get("no_building") or {}).items() if row["share"] > 0.0005}
        said_stale = {key: row["share"] for key, row in ((told or {}).get("stale") or {}).items() if row["share"] > 0.0005}
        said_replaced = {key: v for key, v in ((told or {}).get("replaced") or {}).items() if v > 0.0005}
        same = lambda a, b: sorted(a) == sorted(b) and all(abs(a[key] - (b[key][0] if isinstance(b[key], tuple) else b[key])) <= 0.005 for key in b)  # noqa: E731
        ok(told is not None and told.get("buildable") is not None and abs(told["buildable"] - buildable) <= 0.005
           and same(said, barred) and same(said_stale, stale) and same(said_replaced, replaced),
           "D the export reads the map's build envelope as it is read here: %.1f %% of the building's points in the buildable area (the export: %s), no building at %s (the export: %s); "
           "out of date at %s (the export: %s); replaced: %s (the export: %s)"
           % (100 * buildable, "%.1f %%" % (100 * told["buildable"]) if told and told.get("buildable") is not None else "nothing",
              ", ".join("%s %.1f %%" % (key, 100 * v[0]) for key, v in barred.items()) or "none of them",
              ", ".join("%s %.1f %%" % (key, 100 * v) for key, v in sorted(said.items())) or "none of them",
              ", ".join("%s %.1f %%" % (key, 100 * v[0]) for key, v in stale.items()) or "none", ", ".join("%s %.1f %%" % (key, 100 * v) for key, v in sorted(said_stale.items())) or "none",
              ", ".join("%s %.1f %%" % (key, 100 * v) for key, v in replaced.items()) or "none", ", ".join("%s %.1f %%" % (key, 100 * v) for key, v in sorted(said_replaced.items())) or "none"))
        ok(buildable >= 0.9995 and not barred,
           "D inside the map's buildable envelope and in none of its no-building zones: %.1f %% of its points in the buildable area%s%s%s"
           % (100 * buildable, "".join("; %.0f %% in %s (%s)" % (100 * v[0], key, v[1]) for key, v in barred.items()),
              "".join("; %.0f %% in %s that is out of date there, not a fault (%s)" % (100 * v[0], key, v[1]) for key, v in stale.items()),
              "".join("; %.0f %% on the %s it replaces" % (100 * v, key) for key, v in replaced.items())))

    # E
    ifc = facts["ifc"]
    ok(abs(ifc["lat"] - alat) < 1e-6 and abs(ifc["lng"] - alng) < 1e-6 and abs(ifc["elev"] - aelev) < 1e-3,
       "E IFC site at %.7f, %.7f, %.3f m (BRAIN.md §3: %.4f, %.5f, %.2f m)" % (ifc["lat"], ifc["lng"], ifc["elev"], alat, alng, aelev))
    b = ifc["building"]
    ok(b["onSite"] and b["elementsUnder"] and math.hypot(b["east"] - want["east"], b["north"] - want["north"]) <= 0.03 and abs(b["up"] - want["up"]) <= 0.01
       and turn_gap(b["yaw"], want["yaw"]) <= 0.01
       and math.hypot(b["east"] - off["east"], b["north"] - off["north"]) <= 0.001 and abs(b["up"] - off["up"]) <= 0.001,
       "E the IfcBuilding's placement on the site is the building's: %.3f m E, %.3f m N, %+.3f m, turned %+.2f° (relative to the site: %s; its elements under it: %s)"
       % (b["east"], b["north"], b["up"], b["yaw"], b["onSite"], b["elementsUnder"]))
    ps = b["pset"]
    ok(b["refHeight"] is not None and abs(b["refHeight"] - place["elevation_m"]) <= 0.001
       and all(abs(float(ps.get(key, float("nan"))) - val) <= tol for key, val, tol in (
           ("Longitude", place["coordinates"][0], 1e-8), ("Latitude", place["coordinates"][1], 1e-8), ("AltitudeM", place["altitude_m"], 1e-3),
           ("ElevationM", place["elevation_m"], 1e-3), ("RotationDegY", turn["y"], 1e-4),
           ("OffsetEastM", off["east"], 1e-3), ("OffsetNorthM", off["north"], 1e-3), ("OffsetUpM", off["up"], 1e-3))),
       "E the IfcBuilding's reference height and its Organic_Placement property set equal the sidecar (%s)"
       % ", ".join("%s %s" % (key, ps[key]) for key in ("Longitude", "Latitude", "AltitudeM", "ElevationM", "RotationDegY") if key in ps))
    classes = {n: e["class"] for n, e in ifc["elements"].items()}
    want_classes = {n: "Ifc" + d["class"].replace(" ", "") for n, d in design.items()}
    ok(classes == want_classes and not ifc.get("unread"), "E IFC elements and classes: %s%s" % (
        ", ".join("%s %s" % kv for kv in sorted(classes.items())) or "none read",
        "; unread: " + "; ".join(ifc["unread"]) if ifc.get("unread") else ""))
    worst = 0.0 if len(ifc["elements"]) == len(design) else float("inf")
    for name, e in ifc["elements"].items():
        w = world.get(name)
        if w is None:
            worst = float("inf")
            continue
        worst = max(worst, max(abs(a - c) for a, c in zip(e["min"] + e["max"], list(w.min(axis=0)) + list(w.max(axis=0)))))
    ok(worst <= 0.03, "E every IFC element's world bounds within 3 cm of its GLB bounds on the site (worst %.4f m)" % worst)
    said, speaks = ifc.get("statements"), ifc.get("speaks")
    ok(said == [] and bool(speaks),
       "E the IFC holds against its own schema (%s), by IfcOpenShell's validation: %s; of the same text with the building's GlobalId taken out, read into memory, it says: %s"
       % (ifc.get("schema", "?"), "nothing said" if said == [] else "not read" if said is None else "%d statements, the first: %s" % (len(said), said[0]),
          "NOTHING (it cannot be trusted to speak)" if not speaks else "; ".join(speaks[:2])))
    return oks, fails


# ------------------------------------------------------------------ forgeries
def forgeries(facts):
    import numpy as np

    shared = ("terrain", "map_roads", "map_easement", "map_existing", "envelope")
    anchor = facts["anchor"]
    k = wgs84_metres_per_degree(anchor[1])

    def f(change):
        g = copy.deepcopy({key: v for key, v in facts.items() if key not in shared})
        for key in shared:
            g[key] = facts[key]
        change(g)
        return g

    def each_mesh(g, fn):
        for m in g["glb"].values():
            m["pos"] = fn(m["pos"])

    first = sorted(facts["glb"])[0]

    def hole(g):
        m = g["glb"][first]
        m["tri"] = m["tri"][: int(len(m["tri"]) * 0.9)]

    def lose_classes(g):
        for e in g["ifc"]["elements"].values():
            e["class"] = "IfcBuildingElementProxy"

    def whole_seconds(g):
        lat = g["ifc"]["lat"]
        g["ifc"]["lat"] = math.copysign(int(abs(lat) * 3600) / 3600.0, lat)

    def thinner(g):
        g["kernels"]["arc wall"]["volume"] /= 2
        g["kernels"]["arc wall"]["mesh"] /= 2

    def without_toes(g):
        """A vault built section by section whose outside stops square at its springings, where
        the plain vault's is carried on to the springing line: the two toes less (t² / slope,
        along its 8 m), by every measure of it."""
        kernel = g["kernels"]["flat catenary vault, section by section"]
        toes = 0.15 * 0.15 / chain_line(4.0, 1.0)[1] * 8.0
        kernel["volume"] -= toes
        kernel["mesh"] -= toes

    def written(g, de=0.0, dn=0.0, du=0.0):
        """What the export wrote, moved: the sidecar, the GLB's own block, the IFC."""
        for pl in (g["sidecar"]["placement"], g["glb_placement"]):
            pl["coordinates"] = [pl["coordinates"][0] + de / k[0], pl["coordinates"][1] + dn / k[1]]
            pl["altitude_m"] += du
            pl["elevation_m"] += du
            pl["offset_m"] = {"east": pl["offset_m"]["east"] + de, "north": pl["offset_m"]["north"] + dn, "up": pl["offset_m"]["up"] + du}
        b = g["ifc"]["building"]
        b["east"], b["north"], b["up"] = b["east"] + de, b["north"] + dn, b["up"] + du
        b["refHeight"] += du
        ps = b["pset"]
        ps["Longitude"], ps["Latitude"] = ps["Longitude"] + de / k[0], ps["Latitude"] + dn / k[1]
        ps["AltitudeM"], ps["ElevationM"] = ps["AltitudeM"] + du, ps["ElevationM"] + du
        ps["OffsetEastM"], ps["OffsetNorthM"], ps["OffsetUpM"] = ps["OffsetEastM"] + de, ps["OffsetNorthM"] + dn, ps["OffsetUpM"] + du
        for e in g["ifc"]["elements"].values():
            e["min"] = (e["min"][0] + de, e["min"][1] + dn, e["min"][2] + du)
            e["max"] = (e["max"][0] + de, e["max"][1] + dn, e["max"][2] + du)

    def moved(g, de=0.0, dn=0.0, du=0.0):
        """The whole building somewhere else, the design and everything written agreeing."""
        d = g["design_building"]
        d["base"] = (d["base"][0] + de, d["base"][1] + dn, d["base"][2] + du)
        for e in g["design"].values():
            e["min"] = (e["min"][0] + de, e["min"][1] + dn, e["min"][2] + du)
            e["max"] = (e["max"][0] + de, e["max"][1] + dn, e["max"][2] + du)
        written(g, de, dn, du)

    def stand_at(g, east, north):
        """The whole building at another spot, on the map's ground there."""
        pl = g["sidecar"]["placement"]
        here = ((pl["coordinates"][0] - anchor[0]) * k[0], (pl["coordinates"][1] - anchor[1]) * k[1])
        tpos, ttri = g["terrain"]
        g0, g1 = terrain_height(tpos, ttri, here[0], -here[1]), terrain_height(tpos, ttri, east, -north)
        moved(g, east - here[0], north - here[1], (g1 - g0) if g0 is not None and g1 is not None else 0.0)

    def baked(g):
        """The first export's way: the offset in the geometry, the origin left at the anchor."""
        pl = g["sidecar"]["placement"]
        for m in g["glb"].values():
            w = placed(m["pos"], pl, anchor, k)
            m["pos"] = np.column_stack([w[:, 0], w[:, 2], -w[:, 1]])
        zero = {"coordinates": [anchor[0], anchor[1]], "altitude_m": 0.0, "elevation_m": anchor[2],
                "rotation_deg": {"x": 0.0, "y": 0.0, "z": 0.0}, "offset_m": {"east": 0.0, "north": 0.0, "up": 0.0}}
        g["sidecar"]["placement"].update(copy.deepcopy(zero))
        g["glb_placement"].update(copy.deepcopy(zero))
        g["design_building"] = {"base": (0.0, 0.0, 0.0), "yaw": 0.0}
        b = g["ifc"]["building"]
        b.update(east=0.0, north=0.0, up=0.0, yaw=0.0, refHeight=anchor[2])
        b["pset"].update(Longitude=anchor[0], Latitude=anchor[1], AltitudeM=0.0, ElevationM=anchor[2], RotationDegY=0.0,
                         OffsetEastM=0.0, OffsetNorthM=0.0, OffsetUpM=0.0)

    def wrong_turn(g):
        """The turn written clockwise-positive: the sign FORMAT.md's edits/2 does not use."""
        for pl in (g["sidecar"]["placement"], g["glb_placement"]):
            pl["rotation_deg"]["y"] = -pl["rotation_deg"]["y"]
        g["ifc"]["building"]["yaw"] = -g["ifc"]["building"]["yaw"]
        g["ifc"]["building"]["pset"]["RotationDegY"] = -g["ifc"]["building"]["pset"]["RotationDegY"]

    def ifc_on_anchor(g):
        g["ifc"]["building"].update(east=0.0, north=0.0, up=0.0)

    def roads_off(g):
        g["map_roads"] = facts["map_roads"] + np.array([8.0, 0.0])

    def floating(g):
        """One element lifted until its base stands 0.15 m above the ground under it (the
        entrance vault before it had a plinth, where the ground falls away), the design and
        the IFC agreeing. Less than the 0.3 m this check let through until 1 Oct."""
        tpos, ttri = g["terrain"]
        rows = {n: base_gaps(placed(m["pos"], g["sidecar"]["placement"], anchor, k), tpos, ttri, g["terrain_zero"]) for n, m in g["glb"].items()}
        name = max((n for n in sorted(rows) if rows[n] and rows[n][1] <= GROUND_ABOVE), key=lambda n: rows[n][1])
        lift = 0.15 - rows[name][1]
        g["glb"][name]["pos"] = g["glb"][name]["pos"] + np.array([0.0, lift, 0.0])
        for e in (g["design"][name], g["ifc"]["elements"][name]):
            e["min"], e["max"] = (e["min"][0], e["min"][1], e["min"][2] + lift), (e["max"][0], e["max"][1], e["max"][2] + lift)

    def no_stem(g):
        """The plinth left out of the vault kernel: the bare vault under the plinth's name."""
        g["kernels"]["semicircular vault on a plinth"] = dict(g["kernels"]["semicircular vault"],
                                                               closed_form=g["kernels"]["semicircular vault on a plinth"]["closed_form"])

    def uncut(g, name, height, rise, mean):
        """A shaped top left uncut, as OCCT left it until 1 Oct: the wall a valid solid at its
        highest point all along (t L (H + rise) where the top's mean height is `mean`)."""
        kernel = g["kernels"][name]
        kernel["volume"] *= (height + rise) / mean
        kernel["mesh"] *= (height + rise) / mean

    def unguarded(g):
        """The kernel's own comparison switched off: what it then returned for the idle cut."""
        g["idle_cut"]["guarded"] = g["idle_cut"]["unguarded"]

    def by_boolean(g):
        """The groined saddles as they were first made: each lobe its saddle made thick and cut
        by a boolean, whose one long cut edge FreeCAD's own Volume read 3.2 % short (11.853 m³
        where the adaptive measure said 12.239)."""
        kernel = g["kernels"]["groined saddles, eight lobes (R's case A)"]
        kernel["volume"] = 11.85305

    def straight_up(g):
        """A conoid made thick straight up, as R's note reads: its volume t times its plan."""
        kernel = g["kernels"]["conoid (R's case A)"]
        kernel["volume"] = kernel["mesh"] = 0.08 * 9.0 * 12.0

    def off_sphere(g):
        x, y, z = g["lattice"]["hemisphere"]["nodes"][0]
        g["lattice"]["hemisphere"]["nodes"][0] = (x * 1.001, y * 1.001, z * 1.001)

    def shallow(g):
        g["lattice"]["hemisphere"]["laths"][0]["volume"] /= 2

    def on_the_end(g):
        g["lattice"]["conoid"]["faces"] = sorted(set(g["lattice"]["conoid"]["faces"]) | set(g["lattice"]["conoid"]["end"]))

    def in_two(g):
        """The lath across the ellipse dome's crown as the seeds once left it: two laths, each from
        the foot to the crown (5.525 m, the lath's middle there)."""
        laths = g["lattice"]["ellipse dome"]["laths"]
        laths[0]["high"] = 5.525
        laths.append(dict(laths[0]))

    def missed_top(g):
        row = next(r for r in g["lattice"]["tops"] if r[1] is not None)
        g["lattice"]["tops"][g["lattice"]["tops"].index(row)] = (row[0], None, row[2])

    return [
        ("the GLB Z-up", "C every element", f(lambda g: each_mesh(g, lambda p: p[:, [0, 2, 1]] * np.array([1, -1, 1])))),
        ("the GLB in millimetres", "B ", f(lambda g: each_mesh(g, lambda p: p * 1000.0))),
        ("the building in the retired models.json frame", "C the sidecar's placement", f(lambda g: g.__setitem__("design_origin", (-119.155333, 34.433118, g["design_origin"][2])))),
        ("the building on the retired 425.90 m datum", "C the sidecar's placement", f(lambda g: written(g, du=0.27))),
        ("north mirrored", "C every element", f(lambda g: each_mesh(g, lambda p: p * np.array([1, 1, -1])))),
        ("an element missing", "B the GLB's nodes", f(lambda g: g["glb"].pop(first))),
        ("a hole in a mesh", "B ", f(hole)),
        ("the building 2 m in the air", "D every element that reaches the ground", f(lambda g: moved(g, du=2.0))),
        ("the building back on the driveway", "D not on a road", f(lambda g: stand_at(g, *DRIVEWAY_SPOT))),
        ("the building inside the existing house", "D not inside the existing buildings", f(lambda g: stand_at(g, 3.0, 0.0))),
        ("the offset baked into the geometry around the anchor", "C the building's own origin", f(baked)),
        ("the turn written the wrong way round", "C the sidecar's placement", f(wrong_turn)),
        ("the IFC's latitude in whole seconds", "E IFC site", f(whole_seconds)),
        ("the IFC building left on the anchor", "E the IfcBuilding's placement", f(ifc_on_anchor)),
        ("the IFC classes lost", "E IFC elements and classes", f(lose_classes)),
        ("an IFC that breaks its own schema", "E the IFC holds against its own schema", f(lambda g: g["ifc"]["statements"].append("forged: IfcWall.Name is not of type IfcLabel"))),
        ("a validation that says nothing of a broken file", "E the IFC holds against its own schema", f(lambda g: g["ifc"].__setitem__("speaks", []))),
        ("a wall half as thick", "A arc wall", f(thinner)),
        ("a vault built section by section without its toes", "A flat catenary vault, section by section", f(without_toes)),
        ("the land file's roads 8 m off the pack's", "D the map's roads lie along", f(roads_off)),
        ("an element's base 0.15 m above the ground", "D every element that reaches the ground", f(floating)),
        ("the plinth left out of the vault", "A vault on a plinth", f(no_stem)),
        ("a wave top left uncut on a smooth wall through points", "A smooth wall through points, wave top",
         f(lambda g: uncut(g, "smooth wall through points, wave top", 1.8, 0.3, 1.8 + 0.3 / 2))),
        ("an arch top left uncut on a smooth ring through points", "A smooth ring through points, arch top",
         f(lambda g: uncut(g, "smooth ring through points, arch top", 1.8, 0.9, 1.8 + 0.9 * 2 / math.pi))),
        ("the kernel taking a cut that did nothing", "A a top cut that does nothing", f(unguarded)),
        ("the groined saddles made by a boolean (FreeCAD's own Volume 3.2 % short)", "A groined saddles, eight lobes (R's case A)", f(by_boolean)),
        ("a conoid made thick straight up", "A conoid (R's case A)", f(straight_up)),
        ("a top that the face-by-face finder misses", "G the top of a shell found face by face", f(missed_top)),
        ("a lath node 5 mm off the hemisphere", "G laths on a hemisphere", f(off_sphere)),
        ("a lath half as deep", "G laths on a hemisphere", f(shallow)),
        ("the ring beam left out", "G the ring beam", f(lambda g: g["lattice"]["hemisphere"].__setitem__("beams", []))),
        ("laths stopping short of the foot (their edges tested straight across in plan: up to 0.70 m above it)", "G every lath on a dome runs whole",
         f(lambda g: g["lattice"]["hemisphere"]["laths"][0].__setitem__("low", 0.697))),
        ("a lath in two at a dome's crown (Newton from the far side of its pole ran off the face: 19 laths on the ellipse dome)", "G every lath on a dome runs whole",
         f(in_two)),
        ("a lath on the conoid's leaning end face", "G a conoid's leaning end face", f(on_the_end)),
        ("the export's reading of the build envelope another building's", "D the export reads the map's build envelope",
         f(lambda g: g["sidecar"]["envelope"].__setitem__("buildable", 0.5))),
        ("the building under the protected oaks (where the pavilion stood until the night of 1 Oct)", "D inside the map's buildable envelope", f(lambda g: stand_at(g, *OAK_SPOT))),
        ("a building decided to replace the house, standing on the shed", "D not inside the existing buildings",
         f(lambda g: (g.__setitem__("decided", {"replaces": {"existing": ["house"], "by": "a forged decision", "on": "-"}}), stand_at(g, *SHED_SPOT)))),
        ("a building decided to stand below the land, with an element 0.15 m in the air", "D every element that reaches the ground",
         f(lambda g: (g.__setitem__("decided", {"below_land": {"by": "a forged decision", "on": "-"}}), floating(g)))),
        ("the building under the house zone's oaks with lane C's overlay not read", "D inside the map's buildable envelope",
         f(lambda g: (g.__setitem__("oaks_removed", []), stand_at(g, *HOUSE_OAK_SPOT)))),
    ]


def run(self_test=None):
    if self_test is None:
        self_test = os.environ.get("ORGANIC_CHECK_SELF_TEST") == "1" or "--self-test" in sys.argv
    facts = read_facts()
    oks, fails = judge(facts)
    for m in oks:
        print("OK  ", m)
    for m in fails:
        print("FAIL", m)
    # notes on the map's own files: not this export's to pass or fail
    zero, anchor, stated = facts["terrain_zero"], facts["anchor"], facts["format_md"]
    if zero is not None and abs(zero) > 0.05:
        print("NOTE the land file's ground at the anchor is at y = %+.3f: its zero is %.3f m NAVD88, the canonical zero %.2f m"
              % (zero, anchor[2] - zero, anchor[2]))
    if stated is not None and (abs(stated[0] - anchor[0]) > 1e-9 or abs(stated[1] - anchor[1]) > 1e-9 or abs(stated[2] - anchor[2]) > 1e-9):
        print("NOTE FORMAT.md states lng %.5f, lat %.4f, ground %.2f m; BRAIN.md §3 states %.5f, %.4f, %.2f m" % (stated + anchor))
    told = (facts["sidecar"] or {}).get("clearance_m")
    if told:
        print("NOTE the export itself reported: %s" % ", ".join("%.1f m from the nearest %s" % (v, key.replace("_", " ")) for key, v in sorted(told.items())))
    if fails:
        print("check_organic FAILED (%d of %d)" % (len(fails), len(oks) + len(fails)))
        return False
    print("check_organic OK (%d checks)" % len(oks))
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
    print("check_organic --self-test %s (%d/%d forgeries rejected)" % ("OK" if caught == len(forged) else "FAILED", caught, len(forged)))
    return caught == len(forged)


if __name__ == "__main__":
    result = run()
    if not App.GuiUp:
        sys.exit(0 if result else 1)
