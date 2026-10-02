# -*- coding: utf-8 -*-
"""check_site — SulphurMountain-site.FCStd against the live pack.

Runs inside FreeCAD 1.1 (the GUI through the FreeCAD MCP connector, or freecadcmd):

    exec(open(r".../freecad/check_site.py", encoding="utf-8").read())
    # SITE_FCSTD=<path> picks the file; SITE_CHECK_SELF_TEST=1 (or "--self-test" in sys.argv) forges faults

Every expectation is derived here, independently of the macro that built the file:

  A. georeference — the canonical frame, read from C:\\Playground\\BRAIN.md §3 itself: the
     Site's longitude and latitude equal the anchor, its elevation the ground datum there;
     declination 0. The pack's own DEM under the anchor reads that ground within 5 cm. The
     stored UTM 11N equals a transverse Mercator projection computed here (Krüger's series;
     the macro uses Snyder's), which first has to reproduce every UTM in positions.csv.
  B. property line against the 11 survey calls (bearing and distance, not the ring's
     coordinates): every edge's length within 0.03 m of its call, and every edge's
     line bearing, less one common rotation (the survey's basis of bearings), within
     0.015 m sideways over its length. Its perimeter and area against the survey's.
  C. property line in place: each corner within 5 mm of the survey ring, converted
     here with the pack frame's own formula.
  D. terrain, pixel for pixel: 400 mesh vertices against the terrarium tiles decoded by
     Qt (a different PNG decoder from the macro's): at a pixel centre within 5 cm, and
     at that pixel's elevation less the ground datum within 1 cm.
  E. terrain against positions.csv: the mesh height under each placed point against the
     DEM elevation the pack's own script recorded there (RMS ≤ 0.15 m, worst ≤ 0.35 m).
  F. setbacks: the front edge is the one with the most road frontage (recomputed here);
     the buildable area, sampled on a 0.5 m grid from the per-edge distances, matches
     the file's within 1 %.
  G. existing structures: 4 solids — each county footprint and the lidar-only warehouse —
     with footprint area within 0.5 %, base and height within 5 mm of the pack's values.
  H. the 11 boundary dimensions against the call distances within 0.03 m.
  I. north: declination 0 and the north arrow pointing +Y; the unit system in metres.
  J. with the GUI only: each dimension's text as drawn (Draft's text transform in the
     scene graph) runs along its edge of the survey ring, reading from the bottom or
     the right (within 0.5°). Without the GUI nothing is drawn, and J says SKIP.
  K. roads: the county's road centrelines are drawn where the terrain reaches: every
     drawn point within 5 mm in plan of the county's line (converted here), and every
     county vertex on the terrain among the drawn points.

--self-test forges faults into what was read (the boundary moved 1 m east, north
flipped, the retired 425.90 m datum, the origin at the retired models.json point, the
terrain 0.5 m high, a structure gone, the setbacks on the wrong front, UTM easting and
northing swapped, millimetres, a road centreline 2 m off, the roads not drawn, and with
the GUI a dimension label upside down) and must see every one rejected.
"""

import copy
import json
import math
import os
import random
import re
import sys
import time
import urllib.request

import FreeCAD as App

PACK = os.environ.get("SITE_PACK_URL", "https://sulphur-mountain-world.vercel.app/")
FCSTD = os.environ.get("SITE_FCSTD") or os.path.join(
    os.path.expanduser("~"), "Documents", "SulphurMountain", "SulphurMountain-site.FCStd"
)
BRAIN = os.environ.get("PLAYGROUND_BRAIN", r"C:\Playground\BRAIN.md")
SETBACKS_M = {"front": 6.10, "side": 1.52, "rear": 4.57}
FOOT_M = 0.3048


def canonical_frame():
    """(lng, lat, ground m) of the anchor, as BRAIN.md §3 states them."""
    with open(BRAIN, encoding="utf-8") as fh:
        text = fh.read().replace("\u2212", "-").replace("*", "")
    section = text.split("## 3.", 1)[1].split("## 4.", 1)[0]
    origin = re.search(r"lng\s*(-?\d+\.\d+),\s*lat\s*(-?\d+\.\d+)", section)
    ground = re.search(r"(\d+\.\d+)\s*m NAVD88", section)
    if not origin or not ground:
        raise RuntimeError("BRAIN.md §3 no longer states the anchor and its ground datum")
    return float(origin.group(1)), float(origin.group(2)), float(ground.group(1))


ANCHOR_LNG, ANCHOR_LAT, DATUM_M = canonical_frame()


def fetch(path, binary=False, attempts=3):
    req = urllib.request.Request(PACK + path, headers={"User-Agent": "check_site"})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            break
        except OSError as exc:  # timeouts and dropped connections are retried; a 4xx answer is final
            if attempt == attempts - 1 or getattr(exc, "code", 500) < 500:
                raise
            time.sleep(2 + 3 * attempt)
    return data if binary else json.loads(data.decode("utf-8"))


# ------------------------------------------------------------------ independent maths
def pack_to_local(frame, anchor):
    kx, ky = frame["metres_per_deg_lng"], frame["metres_per_deg_lat"]
    cx = (anchor[0] - frame["origin_lng"]) * kx
    cy = (anchor[1] - frame["origin_lat"]) * ky
    to = lambda lng, lat: ((lng - frame["origin_lng"]) * kx - cx, (lat - frame["origin_lat"]) * ky - cy)
    back = lambda x, y: (frame["origin_lng"] + (x + cx) / kx, frame["origin_lat"] + (y + cy) / ky)
    return to, back


def utm(lng, lat, zone=11):
    """WGS84 → UTM (Krüger series, to the 6th order in n): easting, northing (m)."""
    a, f = 6378137.0, 1 / 298.257223563
    n = f / (2 - f)
    A = a / (1 + n) * (1 + n**2 / 4 + n**4 / 64)
    alpha = [n / 2 - 2 * n**2 / 3 + 5 * n**3 / 16, 13 * n**2 / 48 - 3 * n**3 / 5, 61 * n**3 / 240]
    lam0 = math.radians(-183 + 6 * zone)
    phi, lam = math.radians(lat), math.radians(lng) - lam0
    e = 2 * math.sqrt(n) / (1 + n)
    t = math.sinh(math.atanh(math.sin(phi)) - e * math.atanh(e * math.sin(phi)))
    xi, eta = math.atan2(t, math.cos(lam)), math.atanh(math.sin(lam) / math.sqrt(1 + t * t))
    E = eta + sum(alpha[j] * math.cos(2 * (j + 1) * xi) * math.sinh(2 * (j + 1) * eta) for j in range(3))
    N = xi + sum(alpha[j] * math.sin(2 * (j + 1) * xi) * math.cosh(2 * (j + 1) * eta) for j in range(3))
    return 500000 + 0.9996 * A * E, 0.9996 * A * N


def line_azimuth(bearing):
    """A quadrant bearing (N79°58'41"W) → a line azimuth in [0, 180)."""
    m = re.match(r"([NS])\s*(\d+)°\s*(\d+)'\s*(\d+(?:\.\d+)?)\"\s*([EW])", bearing)
    ns, d, mi, s, ew = m.groups()
    a = int(d) + int(mi) / 60 + float(s) / 3600
    az = {("N", "E"): a, ("N", "W"): 360 - a, ("S", "E"): 180 - a, ("S", "W"): 180 + a}[(ns, ew)]
    return az % 180


def segment_distance(p, a, b):
    ax, ay = b[0] - a[0], b[1] - a[1]
    t = max(0.0, min(1.0, ((p[0] - a[0]) * ax + (p[1] - a[1]) * ay) / (ax * ax + ay * ay or 1.0)))
    return math.hypot(p[0] - a[0] - t * ax, p[1] - a[1] - t * ay)


def inside(p, poly):
    x, y, c = p[0], p[1], False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            c = not c
    return c


def shoelace(poly):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(poly, poly[1:] + poly[:1]))) / 2


def tile_pixel(lng, lat, z, size):
    n = 2**z
    x = (lng + 180) / 360 * n * size
    y = (1 - math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) / math.pi) / 2 * n * size
    return x, y


def pixel_centre(px, py, z, size):
    n = 2**z * size
    lng = (px + 0.5) / n * 360 - 180
    lat = math.degrees(2 * math.atan(math.exp(math.pi * (1 - 2 * (py + 0.5) / n))) - math.pi / 2)
    return lng, lat


class QtTiles:
    """Terrarium tiles decoded by Qt's own PNG reader."""

    def __init__(self, template, z):
        from PySide import QtGui

        self.QImage, self.template, self.z, self.cache, self.size = QtGui.QImage, template, z, {}, 256

    def elevation(self, px, py):
        tx, ox = divmod(px, self.size)
        ty, oy = divmod(py, self.size)
        if (tx, ty) not in self.cache:
            data = fetch(self.template.replace("{z}", str(self.z)).replace("{x}", str(tx)).replace("{y}", str(ty)), binary=True)
            image = self.QImage()
            if not image.loadFromData(data, "PNG"):
                raise RuntimeError("Qt could not decode tile %s/%s" % (tx, ty))
            self.cache[(tx, ty)] = image
        rgb = self.cache[(tx, ty)].pixel(ox, oy)
        r, g, b = (rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255
        return r * 256 + g + b / 256.0 - 32768.0


# ------------------------------------------------------------------ read the file
def text_directions(dims):
    """Each dimension's text direction as drawn (degrees from +X), or None where nothing is drawn."""
    if not App.GuiUp:
        return None
    from pivy import coin

    out = []
    for o in dims:
        node = getattr(getattr(getattr(o, "ViewObject", None), "Proxy", None), "textpos", None)
        if node is None:
            return None
        x = node.rotation.getValue().multVec(coin.SbVec3f(1, 0, 0))
        out.append(math.degrees(math.atan2(x[1], x[0])))
    return out


def read_facts(doc):
    def obj(name):
        o = doc.getObject(name)
        if o is None:
            raise RuntimeError("the file has no object %s" % name)
        return o

    site = obj("Site")
    plan = obj("PropertyLinePlan").Shape
    corners = [(v.X / 1000.0, v.Y / 1000.0) for v in plan.Wires[0].OrderedVertexes]
    mesh = obj("Terrain").Mesh
    rng = random.Random(29)
    points = mesh.Points
    sample = [points[rng.randrange(len(points))] for _ in range(400)]
    structures = []
    for o in obj("ExistingGroup").Group:
        bb = o.Shape.BoundBox
        h = (bb.ZMax - bb.ZMin) / 1000.0
        structures.append(
            {
                "label": o.Label,
                "base": bb.ZMin / 1000.0,
                "height": h,
                "area": o.Shape.Volume / 1e9 / h if h > 0 else 0.0,
                "centre": ((bb.XMin + bb.XMax) / 2000.0, (bb.YMin + bb.YMax) / 2000.0),
            }
        )
    arrow = obj("NorthArrow").Shape.Wires[0]
    pts = [v.Point for v in arrow.Vertexes]
    tip = max(pts, key=lambda p: p.y)
    base = App.Vector(sum(p.x for p in pts) / len(pts), sum(p.y for p in pts) / len(pts), 0)
    env = obj("BuildableEnvelope")
    dims = sorted((o for o in doc.Objects if o.Name.startswith("Dimension")), key=lambda o: int(o.Label.split()[-1]))
    roads = [[[(v.X / 1000.0, v.Y / 1000.0) for v in w.OrderedVertexes] for w in o.Shape.Wires]
             for o in doc.Objects if o.Name.startswith("Road") and o.isDerivedFrom("Part::Feature")]
    bb = mesh.BoundBox
    return {
        "roads": roads,
        "terrain_box": (bb.XMin / 1000.0, bb.YMin / 1000.0, bb.XMax / 1000.0, bb.YMax / 1000.0),
        "lng": site.Longitude,
        "lat": site.Latitude,
        "elevation": site.Elevation.Value / 1000.0,
        "declination": site.Declination.Value,
        "utm": (getattr(site, "AnchorUtm11N_E", None), getattr(site, "AnchorUtm11N_N", None)),
        "units": getattr(doc, "UnitSystem", ""),
        "corners": corners,
        "terrain": [(p.x / 1000.0, p.y / 1000.0, p.z / 1000.0) for p in sample],
        "mesh": mesh,
        "structures": structures,
        "envelope_area": env.Shape.Area / 1e6,
        "front": int(env.FrontEdge),
        "dimensions": [o.Distance.Value / 1000.0 for o in dims],
        "labels": text_directions(dims),
        "north": math.degrees(math.atan2(tip.x - base.x, tip.y - base.y)),
    }


def mesh_height(mesh, x, y):
    hit = mesh.nearestFacetOnRay((x * 1000.0, y * 1000.0, 1e6), (0, 0, -1))
    return (tuple(next(iter(hit.values())))[2] / 1000.0) if hit else None


# ------------------------------------------------------------------ judge
def judge(facts, pack, extra):
    fails, oks = [], []

    def ok(cond, msg):
        (oks if cond else fails).append(msg)

    frame = pack["frame"]
    anchor = extra["anchor"]
    to_local, to_ll = pack_to_local(frame, anchor)

    # A. georeference: the canonical frame of BRAIN.md §3
    ok(abs(facts["lng"] - anchor[0]) < 1e-9 and abs(facts["lat"] - anchor[1]) < 1e-9, "A site at the anchor: %.7f, %.7f (BRAIN.md §3: %.5f, %.4f)" % (facts["lng"], facts["lat"], anchor[0], anchor[1]))
    ok(abs(facts["elevation"] - DATUM_M) < 1e-6, "A ground datum %.3f m (BRAIN.md §3: %.2f)" % (facts["elevation"], DATUM_M))
    ok(abs(facts["declination"]) < 1e-9, "A declination %.3f° (true north = +Y)" % facts["declination"])
    ok(abs(extra["anchor_dem"] - DATUM_M) <= 0.05, "A the pack's DEM under the anchor reads %.3f m (BRAIN.md §3: %.2f)" % (extra["anchor_dem"], DATUM_M))
    rows = [r for r in extra["positions"] if r.get("utm")]
    worst_utm = max((math.hypot(utm(r["lng"], r["lat"])[0] - r["utm"][0], utm(r["lng"], r["lat"])[1] - r["utm"][1]) for r in rows), default=float("inf"))
    ok(len(rows) >= 10 and worst_utm <= 0.05, "A the projection computed here reproduces %d UTM pairs of positions.csv (worst %.3f m)" % (len(rows), worst_utm))
    ce, cn = utm(*anchor)
    fe, fn = facts["utm"]
    ok(fe is not None and abs(fe - ce) < 0.05 and abs(fn - cn) < 0.05, "A stored UTM 11N (%s, %s) within 5 cm of that projection (%.3f, %.3f)" % (fe, fn, ce, cn))

    # B. against the survey calls
    corners = facts["corners"]
    calls = extra["calls"]
    ok(len(corners) == len(calls) == 11, "B 11 corners and 11 calls (%d, %d)" % (len(corners), len(calls)))
    if len(corners) == len(calls):
        rows = []
        for i, c in enumerate(calls):
            a, b = corners[i], corners[(i + 1) % len(corners)]
            length = math.hypot(b[0] - a[0], b[1] - a[1])
            az = math.degrees(math.atan2(b[0] - a[0], b[1] - a[1])) % 180
            rot = ((az - line_azimuth(c["bearing"]) + 90) % 180) - 90
            rows.append((length, c["distance_ft"] * FOOT_M, rot))
        mean_rot = sum(r[2] * r[0] for r in rows) / sum(r[0] for r in rows)
        worst_len = max(abs(r[0] - r[1]) for r in rows)
        worst_side = max(abs(math.radians(r[2] - mean_rot)) * r[0] for r in rows)
        ok(worst_len <= 0.03, "B every edge within 0.03 m of its call (worst %.3f m)" % worst_len)
        ok(worst_side <= 0.015, "B every edge's bearing within 15 mm sideways of its call after one common rotation of %.3f° (worst %.4f m)" % (mean_rot, worst_side))
        perimeter = sum(r[0] for r in rows) / FOOT_M
        area = shoelace(corners) / 4046.8564224
        ok(abs(perimeter - extra["perimeter_ft"]) <= 1.0, "B perimeter %.1f ft (survey %s)" % (perimeter, extra["perimeter_ft"]))
        ok(abs(area - extra["area_acres"]) <= 0.005, "B area %.3f ac (survey %s)" % (area, extra["area_acres"]))

    # C. in place
    ring = [to_local(*p) for p in extra["ring"]]
    worst = max(math.hypot(a[0] - b[0], a[1] - b[1]) for a, b in zip(corners, ring)) if len(ring) == len(corners) else float("inf")
    ok(worst <= 0.005, "C every corner within 5 mm of the survey ring (worst %.4f m)" % worst)

    # D. terrain, pixel for pixel
    tiles, z = extra["tiles"], extra["zoom"]
    worst_pos = worst_z = 0.0
    for x, y, zz in facts["terrain"]:
        lng, lat = to_ll(x, y)
        fx, fy = tile_pixel(lng, lat, z, tiles.size)
        px, py = int(math.floor(fx)), int(math.floor(fy))
        clng, clat = pixel_centre(px, py, z, tiles.size)
        cx, cy = to_local(clng, clat)
        worst_pos = max(worst_pos, math.hypot(cx - x, cy - y))
        try:
            worst_z = max(worst_z, abs(tiles.elevation(px, py) - DATUM_M - zz))
        except Exception:  # a vertex over ground the pack has no tile for
            worst_z = float("inf")
    ok(worst_pos <= 0.05, "D 400 terrain vertices at pixel centres (worst %.3f m)" % worst_pos)
    ok(worst_z <= 0.01, "D 400 terrain vertices at their pixel's elevation less %.2f m, decoded by Qt (worst %.4f m)" % (DATUM_M, worst_z))

    # E. terrain against positions.csv
    diffs = []
    xs = [p[0] for p in facts["terrain"]]
    ys = [p[1] for p in facts["terrain"]]
    for row in extra["positions"]:
        x, y = to_local(row["lng"], row["lat"])
        if min(xs) < x < max(xs) and min(ys) < y < max(ys):
            h = mesh_height(facts["mesh"], x, y) if facts.get("mesh") is not None else None
            if h is not None:
                diffs.append(h + facts["terrain_offset"] - (row["elev_m"] - DATUM_M))
    rms = math.sqrt(sum(d * d for d in diffs) / len(diffs)) if diffs else float("inf")
    ok(len(diffs) >= 10 and rms <= 0.15 and max(abs(d) for d in diffs) <= 0.35, "E terrain under %d placed points against positions.csv (RMS %.3f m, worst %.3f m)" % (len(diffs), rms, max(abs(d) for d in diffs) if diffs else float("nan")))

    # F. setbacks
    edges = list(zip(ring, ring[1:] + ring[:1]))
    road_segments = [(to_local(*p), to_local(*q)) for road in extra["roads"] for p, q in road]

    def frontage(a, b):
        near = 0
        for k in range(201):
            p = (a[0] + (b[0] - a[0]) * k / 200, a[1] + (b[1] - a[1]) * k / 200)
            if min(segment_distance(p, q, r) for q, r in road_segments) <= 8.0:
                near += 1
        return math.hypot(b[0] - a[0], b[1] - a[1]) * near / 201

    front = max(range(len(edges)), key=lambda i: frontage(*edges[i]))
    ok(facts["front"] == front + 1, "F front edge %d = the edge with the most road frontage (%d)" % (facts["front"], front + 1))
    n = len(edges)
    dist = [SETBACKS_M["front" if i == front else ("side" if i in ((front + 1) % n, (front - 1) % n) else "rear")] for i in range(n)]
    minx, maxx = min(p[0] for p in ring), max(p[0] for p in ring)
    miny, maxy = min(p[1] for p in ring), max(p[1] for p in ring)
    step, count = 0.5, 0
    yv = miny + step / 2
    while yv < maxy:
        xv = minx + step / 2
        while xv < maxx:
            if inside((xv, yv), ring) and all(segment_distance((xv, yv), a, b) >= d for (a, b), d in zip(edges, dist)):
                count += 1
            xv += step
        yv += step
    area = count * step * step
    ok(abs(facts["envelope_area"] - area) <= 0.01 * area, "F buildable area %.0f m² (%.0f m² sampled here from the per-edge setbacks)" % (facts["envelope_area"], area))

    # G. existing structures
    expected = extra["structures"]
    ok(len(facts["structures"]) == len(expected), "G %d existing structures (pack %d)" % (len(facts["structures"]), len(expected)))
    for e in expected:
        poly = [to_local(*q) for q in e["ring"]]
        area = shoelace(poly)
        cx, cy = sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly)
        s = min(facts["structures"], key=lambda s: math.hypot(s["centre"][0] - cx, s["centre"][1] - cy), default=None)
        good = s is not None and math.hypot(s["centre"][0] - cx, s["centre"][1] - cy) < 5 and abs(s["area"] - area) <= 0.005 * area and abs(s["base"] - (e["base"] - DATUM_M)) <= 0.005 and abs(s["height"] - e["height"]) <= 0.005
        ok(good, "G %s: footprint %.1f m², base %.2f m, height %.2f m" % (e["kind"], area, e["base"], e["height"]))

    # H. dimensions
    dims = facts["dimensions"]
    ok(len(dims) == len(calls) and all(abs(d - c["distance_ft"] * FOOT_M) <= 0.03 for d, c in zip(dims, calls)), "H 11 boundary dimensions within 0.03 m of the calls (%s)" % ", ".join("%.2f" % d for d in dims))

    # I. north and units
    ok(abs(facts["north"]) <= 1.0, "I the north arrow points +Y (%.2f°)" % facts["north"])
    ok(bool(re.search(r"\bm\b|Meter|MKS", facts["units"] or "")) and "mm" not in (facts["units"] or ""), "I unit system in metres (%s)" % facts["units"])

    # K. the county's road centrelines, drawn as far as the terrain reaches
    box = facts["terrain_box"]
    county_lines = [[to_local(*p) for p in line] for line in extra["road_lines"]]
    county_segs = [(a, b) for line in county_lines for a, b in zip(line, line[1:])]
    drawn = [p for road in facts["roads"] for wire in road for p in wire]
    off_line = max((min(segment_distance(p, a, b) for a, b in county_segs) for p in drawn), default=float("inf"))
    on_terrain = [p for line in county_lines for p in line if box[0] + 3 <= p[0] <= box[2] - 3 and box[1] + 3 <= p[1] <= box[3] - 3]
    missed = max((min(math.hypot(p[0] - q[0], p[1] - q[1]) for q in drawn) for p in on_terrain), default=0.0) if drawn else float("inf")
    ok(len(drawn) >= 2 and off_line <= 0.005 and missed <= 0.005,
       "K %d county road centrelines drawn: every drawn point within 5 mm of the county's line (worst %.4f m), every one of its %d vertices on the terrain drawn (worst %.4f m)"
       % (len(facts["roads"]), off_line, len(on_terrain), missed))

    # J. the dimension text as drawn: along its edge, reading from the bottom or the right
    labels = facts.get("labels")
    if labels is not None:
        worst = float("inf") if len(labels) != len(ring) else 0.0
        for i, drawn in enumerate(labels[: len(ring)]):
            a, b = ring[i], ring[(i + 1) % len(ring)]
            edge = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
            readable = edge if -85.0 <= edge < 95.0 else (edge + 180.0 if edge < -85.0 else edge - 180.0)
            worst = max(worst, abs((drawn - readable + 180.0) % 360.0 - 180.0))
        ok(worst <= 0.5, "J %d dimension labels run along their edges and read from the bottom or the right (worst %.2f°)" % (len(labels), worst))
    return oks, fails


def pack_expectations():
    pack = fetch("pack.json")
    survey = fetch("survey.geojson")
    county = fetch("county.geojson")
    roofs = fetch("roofs.geojson")
    lines = fetch("positions.csv", binary=True).decode("utf-8").splitlines()
    head = lines[0].split(",")
    positions = []
    for line in lines[1:]:
        rec = dict(zip(head, line.split(",")))
        try:
            row = {"lng": float(rec["lng"]), "lat": float(rec["lat"]), "elev_m": float(rec["elev_m"])}
        except (KeyError, ValueError):
            continue
        try:
            row["utm"] = (float(rec["utm11_e"]), float(rec["utm11_n"]))
        except (KeyError, ValueError):
            pass
        positions.append(row)
    boundary = next(f for f in survey["features"] if f["properties"].get("layer") == "boundary")
    ring = [tuple(p) for p in boundary["geometry"]["coordinates"][0]]
    ring = ring[:-1] if ring[0] == ring[-1] else ring
    calls = sorted((f["properties"] for f in survey["features"] if f["geometry"]["type"] == "LineString"), key=lambda p: p["n"])
    structures = []
    for f in county["features"]:
        p = f["properties"]
        if p.get("layer") == "footprint":
            lidar = p.get("lidar_2018") or {}
            height = lidar.get("roof_m") or 0.15
            structures.append({"kind": lidar.get("kind", "structure"), "ring": f["geometry"]["coordinates"][0][:-1], "base": float(p["county_base_m"]), "height": float(height)})
    for f in roofs["features"]:
        p = f["properties"]
        if p.get("county_footprint") is None:
            structures.append({"kind": str(p.get("kind")).split(" (")[0], "ring": f["geometry"]["coordinates"][0][:-1], "base": float(p["ground_m"]), "height": float(p["roof_m"])})
    z = int(pack["layers"]["terrain"].get("maxzoom", 17))
    tiles = QtTiles(pack["layers"]["terrain"]["template"], z)
    # the pack's DEM under the anchor, bilinear between the four pixel centres around it
    fx, fy = tile_pixel(ANCHOR_LNG, ANCHOR_LAT, z, tiles.size)
    ix, iy = int(math.floor(fx - 0.5)), int(math.floor(fy - 0.5))
    tx, ty = fx - 0.5 - ix, fy - 0.5 - iy
    anchor_dem = ((tiles.elevation(ix, iy) * (1 - tx) + tiles.elevation(ix + 1, iy) * tx) * (1 - ty)
                  + (tiles.elevation(ix, iy + 1) * (1 - tx) + tiles.elevation(ix + 1, iy + 1) * tx) * ty)
    return pack, {
        "anchor": (ANCHOR_LNG, ANCHOR_LAT),
        "anchor_dem": anchor_dem,
        "positions": positions,
        "ring": ring,
        "calls": calls,
        "perimeter_ft": boundary["properties"]["perimeter_ft"],
        "area_acres": boundary["properties"]["area_acres"],
        "roads": [list(zip(f["geometry"]["coordinates"], f["geometry"]["coordinates"][1:])) for f in county["features"] if f["geometry"]["type"] == "LineString"],
        "road_lines": [[tuple(q[:2]) for q in f["geometry"]["coordinates"]] for f in county["features"]
                       if f["properties"].get("layer") == "road" and f["geometry"]["type"] == "LineString"],
        "structures": structures,
        "tiles": tiles,
        "zoom": z,
    }


def forgeries(facts):
    def f(change):
        g = {k: (copy.deepcopy(v) if k != "mesh" else v) for k, v in facts.items()}
        change(g)
        return g

    def flip(g):
        g["corners"] = [(x, -y) for x, y in g["corners"]]
        g["terrain"] = [(x, -y, z) for x, y, z in g["terrain"]]
        g["north"] = 180.0

    upside_down = []
    if facts.get("labels"):
        upside_down.append(("a dimension label upside down", f(lambda g: g["labels"].__setitem__(0, g["labels"][0] + 180.0))))
    return upside_down + [
        ("the property line 1 m east", f(lambda g: g.__setitem__("corners", [(x + 1.0, y) for x, y in g["corners"]]))),
        ("north flipped", f(flip)),
        ("the retired 425.90 m datum", f(lambda g: g.__setitem__("elevation", 425.90))),
        ("the origin at the retired models.json point", f(lambda g: (g.__setitem__("lng", -119.155333), g.__setitem__("lat", 34.433118)))),
        ("the terrain 0.5 m high", f(lambda g: (g.__setitem__("terrain", [(x, y, z + 0.5) for x, y, z in g["terrain"]]), g.__setitem__("terrain_offset", 0.5)))),
        ("a structure gone", f(lambda g: g.__setitem__("structures", g["structures"][1:]))),
        ("the setbacks on the wrong front", f(lambda g: (g.__setitem__("front", 1), g.__setitem__("envelope_area", g["envelope_area"] * 1.04)))),
        ("UTM easting and northing swapped", f(lambda g: g.__setitem__("utm", tuple(reversed(g["utm"]))))),
        ("millimetres", f(lambda g: g.__setitem__("units", "Standard (mm, kg, s, °)"))),
        ("a road centreline 2 m off", f(lambda g: g.__setitem__("roads", [[[(x + 2.0, y) for x, y in wire] for wire in road] for road in g["roads"]]))),
        ("the roads not drawn", f(lambda g: g.__setitem__("roads", []))),
    ]


def run(path=FCSTD, self_test=None):
    if self_test is None:
        self_test = os.environ.get("SITE_CHECK_SELF_TEST") == "1" or "--self-test" in sys.argv
    target = os.path.normcase(os.path.abspath(path))
    already = next((d for d in App.listDocuments().values() if d.FileName and os.path.normcase(os.path.abspath(d.FileName)) == target), None)
    doc = already or App.openDocument(path, True)
    try:
        facts = read_facts(doc)
        facts["terrain_offset"] = 0.0
        pack, extra = pack_expectations()
        oks, fails = judge(facts, pack, extra)
        for m in oks:
            print("OK  ", m)
        for m in fails:
            print("FAIL", m)
        if facts["labels"] is None:
            print("SKIP J dimension labels: nothing is drawn without the GUI")
        if fails:
            print("check_site FAILED (%d)" % len(fails))
            return False
        print("check_site OK (%d checks)" % len(oks))
        if not self_test:
            return True
        caught = 0
        for name, forged in forgeries(facts):
            _o, f = judge(forged, pack, extra)
            print("SELF-TEST %s %s" % ("OK  " if f else "FAIL", "%s is rejected (%s)" % (name, f[0]) if f else "%s PASSED the check" % name))
            caught += bool(f)
        total = len(forgeries(facts))
        print("check_site --self-test %s (%d/%d forgeries rejected)" % ("OK" if caught == total else "FAILED", caught, total))
        return caught == total
    finally:
        if already is None:
            App.closeDocument(doc.Name)


if __name__ == "__main__":
    result = run()
    if not App.GuiUp:
        sys.exit(0 if result else 1)
