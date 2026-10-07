# -*- coding: utf-8 -*-
"""Organic: Johny's oak leaf as a roof (the architect's THE LEAF, part 2, 6 Oct 2026).

The leaf is the one lane C traced from Johny's photos (exchange\\house\\Oak Leaf\\) into the files of
exchange\\house\\leaf\\: its outline and stem (leaf-outline.json), its midrib and lateral veins with the lobe each
ends in and a width rank (leaf-veins.json), its holes (leaf-holes.json), its curl as a heights grid
(leaf-profile.json) and its place on the land (leaf-place.json). Every number in them is a share of the blade's
length from tip to stem base (C's frame: the origin at the middle of the blade's bounding box, +y from the stem base
toward the tip along the midrib, +x to the right looking at the top face); here one number, Length in metres, makes
them metres, and everything scales with it. Their keys are the ones the architect locked in
exchange\\house\\leaf\\FRAME.md (6 Oct, 17:45): every file says "frame": "leaf" and its unit, a ring's first point is
not repeated, a vein's lobe is a label ("tip", or a side's lobe counted from the stem).

The roof: the skin, its underside the surface through the curl's heights (organic_geom.field_surface, as A's
HeightFieldShell reads a grid), cut to the outline with the holes cut through, its thickness along its upward normal;
under it the midrib and the lateral veins as members hung from the skin's underside along C's own polylines
(organic_geom.hung_member_shape), an edge beam just inside the outline, and the stem a short member continuing the
midrib past the blade. Nothing else: no posts, no columns, no walls (the floor plan under it is Johny's).

Kept apart from lane R's formula leaf (LeafRoofOnRibs): that one is a sin^Taper outline under a sum of bumps, with
even stations; this one is data — read, checked, scaled — and none of R's parameters means anything for it.

Everything here takes metres; the kernel's V() takes metres too (on 6 Oct millimetres given to it made a midrib
11.28 km long). Points in millimetres are App.Vector."""

import hashlib
import json
import math
import os

import FreeCAD as App
import Part

import organic_geom as og

MM = og.MM
V = og.V

# lane C's leaf folder (the architect's queue, 6 Oct: THE LEAF, part 1), relative to the Playground folder
LEAF_DIR = "exchange/house/leaf"
FILES = {"outline": "leaf-outline.json", "veins": "leaf-veins.json", "holes": "leaf-holes.json", "profile": "leaf-profile.json",
         "place": "leaf-place.json"}

# The sizes are shares of the length, so the roof scales whole with it. They are lane R's (card P-007, the leaf roof on
# ribs at 12 m: a skin of 0.10 m, a midrib 0.16 x 0.45 m, an edge beam 0.12 x 0.25 m), each divided by 12.
SKIN_SHARE = 0.10 / 12.0
MIDRIB_WIDTH_SHARE, MIDRIB_DEPTH_SHARE = 0.16 / 12.0, 0.45 / 12.0
EDGE_WIDTH_SHARE, EDGE_DEPTH_SHARE = 0.12 / 12.0, 0.25 / 12.0
# A vein of the next rank by Murray's law for a vessel that splits in two equal ones (r_child^3 = r_parent^3 / 2):
# 2^(-1/3) = 0.794 of the one it leaves, in width and in depth (R's ribs under its midrib are 0.75 and 0.67 of it).
MURRAY = 2.0 ** (-1.0 / 3.0)
# a member's lines across no further apart than this share of the length (and never more than the kernel's 0.1 m): the
# outline's points stand about 1 % of the length apart (300 round a perimeter of about 3 lengths), its teeth as small;
# at 12 m the kernel's own 0.1 m gave an edge beam 0.6 % off what its strips hold (6 Oct, the test leaf)
STEP_SHARE = 0.0025
# a ring's closing step (its last point back to its first) longer than this share of the length, and than five of
# its median steps, is a trace that stopped short: the ring is open
OPEN_GAP_SHARE = 0.02
# a tooth of the outline (a lobe's tip): standing out at least this share of the length above the outline
# TOOTH_REACH points either side of it — lane C's own rule: no needle narrower than 0.5 % of the length
TOOTH_SHARE, TOOTH_REACH = 0.005, 4
# a vein's line (and the midrib's, the stem's): lane C's traced line taken again every LINE_SPACING_SHARE of the length
# and eased LINE_PASSES times. The spline through C's own points loops (vein L-B came out 78 m long for 26 m) and kinks
# (R-C turned 137 times tighter than its member can follow); OCCT's approximation within 0.1 m was worse (166 m off).
# Eased so, no vein turns tighter than 0.55 of what its member can follow, and none lies more than 0.36 % of the length
# off C's line (0.18 m at 50.7 m; 6 Oct, Johny's leaf)
LINE_SPACING_SHARE, LINE_PASSES = 0.01, 4
# the edge beam's middle line drawn in by this share of its width (see _edge_beam_line)
EDGE_INSET = 0.7
# where a member's middle line may stray outside the grid of heights (a spline through the outline's points bulges a
# little past a sharp tooth), as a share of the length; further out is an error
GRID_SLACK_SHARE = 0.01


# ---------------------------------------------------------------- where the files are
def playground_dir():
    """The Playground folder: the one this repository sits in (wherever it moves), else C:\\Playground."""
    here = os.path.dirname(os.path.abspath(__file__))  # <Playground>\Architect-editor\freecad\Organic
    for p in (os.path.normpath(os.path.join(here, "..", "..", "..")), r"C:\Playground"):
        if os.path.isfile(os.path.join(p, "BRAIN.md")):
            return p
    return r"C:\Playground"


def resolve(path):
    """A file as a record names it: relative to the Playground folder (forward slashes), or absolute."""
    p = str(path).replace("/", os.sep)
    return p if os.path.isabs(p) else os.path.join(playground_dir(), p)


def default_paths(folder=LEAF_DIR):
    """{kind: the path a record writes} for the five files of a leaf folder."""
    return {k: folder.rstrip("/\\").replace("\\", "/") + "/" + name for k, name in FILES.items()}


def fingerprint(path):
    """The first 16 hex digits of a file's SHA-256: a record says which files it was built from."""
    with open(resolve(path), "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()[:16]


# ---------------------------------------------------------------- reading lane C's files
def _load(path):
    try:
        with open(resolve(path), encoding="utf-8") as fh:
            return json.load(fh)
    except OSError:
        raise ValueError("the leaf's file is not there: %s" % resolve(path))
    except ValueError as exc:
        raise ValueError("the leaf's file is not JSON: %s (%s)" % (resolve(path), exc))


def _first(d, *keys):
    if isinstance(d, dict):
        for k in keys:
            if k in d and d[k] is not None:
                return d[k]
    return None


def _points(value, what):
    """[(x, y)] from [[x, y], ...], [{"x", "y"}, ...] or {"points": ...}."""
    if isinstance(value, dict):
        value = _first(value, "points", "ring", "polyline", "line", "coordinates")
    if not isinstance(value, (list, tuple)):
        raise ValueError("%s: no points" % what)
    out = []
    for p in value:
        if isinstance(p, dict):
            p = (p.get("x"), p.get("y"))
        try:
            out.append((float(p[0]), float(p[1])))
        except (TypeError, ValueError, IndexError):
            raise ValueError("%s: a point that is not two numbers: %r" % (what, p))
    return out


def closed_ring(points, what, closed_flag=None):
    """A ring's points as lane C writes them (FRAME.md: the first point not repeated — a repeated one is taken off),
    refused when it is open or crosses itself. Open: its file says closed: false, or the step from its last point back
    to its first is longer than five of its median steps and than OPEN_GAP_SHARE of the length (a trace that stopped
    short of coming round)."""
    from shapely.geometry import LinearRing, Polygon
    from shapely.validation import explain_validity

    pts = list(points)
    if closed_flag is False:
        raise ValueError("%s is open: its file says closed: false" % what)
    if len(pts) > 1 and math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1]) <= 1e-12:
        pts = pts[:-1]
    if len(pts) < 3:
        raise ValueError("%s has %d points: a ring needs three or more" % (what, len(pts)))
    steps = sorted(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))
    median = steps[len(steps) // 2]
    gap = math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1])
    if gap > max(5.0 * median, OPEN_GAP_SHARE):
        raise ValueError("%s is open: its last point is %.4f of the length from its first, its points %.4f apart (the median step)" % (what, gap, median))
    ring = LinearRing(pts)
    if not ring.is_simple:
        why = explain_validity(Polygon(pts))
        raise ValueError("%s crosses itself (%s)" % (what, why))
    return pts


def signed_area(ring):
    return 0.5 * sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]))


def _framed(d, path, frame_wanted="leaf"):
    """A leaf file in the frame it says it is in: the four shape files in the leaf frame, a fraction of the blade's
    length (FRAME.md); the place file in the map's frame, metres (as lane C writes it: a place is on the land).
    Refused if it says another."""
    if not isinstance(d, dict):
        raise ValueError("the leaf's file is not a table: %s" % resolve(path))
    frame, unit = str(d.get("frame", "")).strip().lower(), str(d.get("unit", "")).strip().lower()
    good = (frame == "leaf" and "fraction" in unit and "length" in unit) if frame_wanted == "leaf" else (frame == "map" and unit in ("metres", "meters", "m"))
    if not good:
        raise ValueError("the leaf's file says frame %r and unit %r: %s is wanted: %s"
                         % (d.get("frame"), d.get("unit"), "the leaf frame in fractions of the blade's length" if frame_wanted == "leaf" else "the map's frame in metres",
                            resolve(path)))
    return d


def read_leaf(paths=None):
    """The leaf as lane C wrote it (exchange\\house\\leaf\\FRAME.md), in shares of the length: {"outline": [(x, y)]
    anticlockwise, "stem": [(x, y)], "veins": [{"id", "points", "rank", "lobe"}], "holes": [[(x, y)]], "hole_names",
    "profile": {"origin", "step", "columns", "rows", "heights"}, "place": the file as it is, "classes": {kind: C's class
    and method}, "paths", "fingerprints"}. Raises ValueError, naming the file and what is wrong, on anything it cannot
    take as it is (nothing is mended or made up)."""
    paths = dict(default_paths(), **(paths or {}))
    leaf = {"paths": paths, "fingerprints": {k: fingerprint(p) for k, p in paths.items() if os.path.isfile(resolve(p))}, "classes": {}}

    def load(kind):
        d = _framed(_load(paths[kind]), paths[kind], "map" if kind == "place" else "leaf")
        leaf["classes"][kind] = "%s: %s" % (d.get("class", "?"), d.get("method", ""))
        return d

    o = load("outline")
    outline = closed_ring(_points(o.get("outline"), "the outline"), "the outline (%s)" % paths["outline"], o.get("closed"))
    leaf["outline_as_given"] = list(outline)  # C's lobe_vertex numbers count these
    if signed_area(outline) < 0:  # anticlockwise: the inside on the left of the way round
        outline = outline[::-1]
    leaf["outline"] = outline
    leaf["outline_count"] = len(outline)
    leaf["stem"] = _points(o["stem"], "the stem") if o.get("stem") is not None else []

    v = load("veins")
    veins = []
    for i, row in enumerate(v.get("veins") or []):
        if not isinstance(row, dict):
            raise ValueError("vein %d is not a table (name, rank, lobe, points): %s" % (i + 1, paths["veins"]))
        key = str(_first(row, "name", "id") or "vein %d" % (i + 1))
        pts = _points(row.get("points"), "vein %s" % key)
        if len(pts) < 2:
            raise ValueError("vein %s has %d point: a vein needs two or more" % (key, len(pts)))
        if row.get("rank") is None:
            raise ValueError("vein %s has no width rank (%s)" % (key, paths["veins"]))
        tip = row.get("lobe_tip")
        veins.append({"id": key, "points": pts, "rank": int(row["rank"]), "lobe": row.get("lobe"), "lobe_vertex": row.get("lobe_vertex"),
                      "lobe_tip": _points([tip], "vein %s's lobe_tip" % key)[0] if tip is not None else None})
    if sum(1 for x in veins if x["rank"] == 1) != 1:
        raise ValueError("the veins have %d of rank 1: one midrib is wanted (%s)" % (sum(1 for x in veins if x["rank"] == 1), paths["veins"]))
    leaf["veins"] = sorted(veins, key=lambda x: x["rank"])

    h = load("holes")
    holes, names, through = [], [], []
    for i, row in enumerate(h.get("holes") or []):
        name = str(row.get("name", "h%d" % (i + 1))) if isinstance(row, dict) else "h%d" % (i + 1)
        holes.append(closed_ring(_points(row, "hole %s" % name), "hole %s (%s)" % (name, paths["holes"]), row.get("closed") if isinstance(row, dict) else None))
        names.append(name)
        through.append(bool(row.get("through", True)) if isinstance(row, dict) else True)
    leaf["holes"], leaf["hole_names"], leaf["hole_through"] = holes, names, through
    # which are openings when nobody says: the ones C found to go through, or all when C's file says cut_by_default
    leaf["openings_by_default"] = [n for n, t in zip(names, through) if t or h.get("cut_by_default") is True]

    p = load("profile")
    try:
        columns, rows, step = int(p["columns"]), int(p["rows"]), float(p["step"])
        origin = _points([p["origin"]], "the grid's origin")[0]
        heights = [float(z) for z in p["heights"]]
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("the curl's grid is not origin, step, columns, rows and heights in numbers (%s): %s" % (paths["profile"], exc))
    if columns < 2 or rows < 2 or step <= 0 or len(heights) != columns * rows:
        raise ValueError("the curl's grid: %d heights for %d columns x %d rows, step %g (%s)" % (len(heights), columns, rows, step, paths["profile"]))
    leaf["profile"] = {"origin": origin, "step": step, "columns": columns, "rows": rows, "heights": heights}

    leaf["place"] = load("place")
    _inside_checks(leaf)
    return leaf


def _inside_checks(leaf):
    """What must lie where: the holes inside the outline, the veins on the leaf, the grid over all of the outline."""
    from shapely.geometry import LineString, Polygon

    blade = Polygon(leaf["outline"])
    for name, hole in zip(leaf["hole_names"], leaf["holes"]):
        if not blade.contains(Polygon(hole)):
            raise ValueError("hole %s is not inside the outline" % name)
    for v in leaf["veins"]:
        if not blade.buffer(0.01).contains(LineString(v["points"])):
            raise ValueError("vein %s runs outside the outline" % v["id"])
    g = leaf["profile"]
    x0, y0 = g["origin"]
    x1, y1 = x0 + (g["columns"] - 1) * g["step"], y0 + (g["rows"] - 1) * g["step"]
    xs, ys = [p[0] for p in leaf["outline"]], [p[1] for p in leaf["outline"]]
    if min(xs) < x0 - 1e-9 or max(xs) > x1 + 1e-9 or min(ys) < y0 - 1e-9 or max(ys) > y1 + 1e-9:
        raise ValueError("the curl's grid (x %.4f to %.4f, y %.4f to %.4f) does not reach over the whole outline (x %.4f to %.4f, y %.4f to %.4f)"
                         % (x0, x1, y0, y1, min(xs), max(xs), min(ys), max(ys)))


def _number(value):
    """A number from 12.5, "12.5" or {"value": 12.5, …}; None when there is none."""
    if isinstance(value, dict):
        value = _first(value, "value", "m", "deg")
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def place_of(leaf):
    """Where lane C put the leaf (leaf-place.json, FRAME.md): {"lng", "lat", "easting_m", "northing_m", "heading_deg"
    (the tip's compass heading, clockwise from north), "length_m", "width_m", "length_source", "length_method",
    "ground_m" (or None)}. Raises ValueError naming what the file does not say."""
    p = leaf["place"]
    centre = p.get("centre") if isinstance(p.get("centre"), dict) else {}
    out = {"lng": _number(centre.get("lng")), "lat": _number(centre.get("lat")), "easting_m": _number(centre.get("easting_m")),
           "northing_m": _number(centre.get("northing_m")), "heading_deg": _number(p.get("heading_deg")), "length_m": _number(p.get("length_m")),
           "width_m": _number(p.get("width_m")), "length_source": str(p.get("length_source", "")), "length_method": str(p.get("length_method", "")),
           "ground_m": _number(p.get("ground_m"))}
    missing = [k for k in ("lng", "lat", "heading_deg", "length_m") if out[k] is None] + ([] if out["length_source"] else ["length_source"])
    if missing:
        raise ValueError("the leaf's place file does not say %s: %s" % (", ".join(missing), resolve(leaf["paths"]["place"])))
    return out


def teeth(leaf):
    """The outline's teeth (the lobes' tips) on each side, counted from the stem: {"left": [(x, y)], "right": […]}
    (C's frame: +x to the right with the tip up). A tooth stands out (|x|) at least TOOTH_SHARE above the outline
    TOOTH_REACH points either side of it, and is the farthest out among them."""
    ring = leaf["outline"]
    n = len(ring)
    out = {"left": [], "right": []}
    for i, (x, y) in enumerate(ring):
        near = [abs(ring[(i + k) % n][0]) for k in range(-TOOTH_REACH, TOOTH_REACH + 1)]
        if abs(x) >= max(near) and abs(x) - min(near) >= TOOTH_SHARE and abs(x) > 1e-9:
            out["right" if x > 0 else "left"].append((x, y))
    for side in out:
        out[side].sort(key=lambda p: p[1])
    return out


def lobe_point(leaf, lobe):
    """Where a vein's lobe is (shares of the length), from its label (FRAME.md): "tip" — the blade's tip (its point
    farthest along +y); "left 3", "L3", "right 1" … — that side's tooth, counted from the stem (teeth()). None when the
    label says neither."""
    import re

    if lobe is None:
        return None
    label = str(lobe).strip().lower()
    if label == "tip":
        return max(leaf["outline"], key=lambda p: p[1])
    found = re.match(r"^(left|right|l|r)\W*(\d+)$", label)
    if not found:
        return None
    side = "left" if found.group(1).startswith("l") else "right"
    k = int(found.group(2))
    tips = teeth(leaf)[side]
    return tips[k - 1] if 1 <= k <= len(tips) else None


def vein_lobe(leaf, vein):
    """Where a vein's lobe is (shares of the length): lane C's own lobe_tip when its file gives it, else the label read
    here (lobe_point)."""
    return vein["lobe_tip"] if vein.get("lobe_tip") is not None else lobe_point(leaf, vein.get("lobe"))


# ---------------------------------------------------------------- the roof
def height_over(surface, box_mm, slack_mm):
    """z(x, y), mm: the surface's height over a plan point, found by Newton's method on (u, v) (the grid's surface runs
    its first parameter with x and its second with y). A point up to slack_mm outside the grid takes the height at the
    grid's edge; further out it is an error."""
    u0, u1, v0, v1 = surface.bounds()
    x0, x1, y0, y1 = box_mm

    def z(x, y):
        u = u0 + (u1 - u0) * (x - x0) / (x1 - x0)
        v = v0 + (v1 - v0) * (y - y0) / (y1 - y0)
        u, v = min(max(u, u0), u1), min(max(v, v0), v1)
        p = surface.value(u, v)
        for _ in range(30):
            ex, ey = p.x - x, p.y - y
            if abs(ex) < 1e-4 and abs(ey) < 1e-4:
                return p.z
            du, dv = surface.getDN(u, v, 1, 0), surface.getDN(u, v, 0, 1)
            det = du.x * dv.y - du.y * dv.x
            if abs(det) < 1e-12:
                break
            nu, nv = u - (ex * dv.y - ey * dv.x) / det, v - (ey * du.x - ex * du.y) / det
            nu, nv = min(max(nu, u0), u1), min(max(nv, v0), v1)
            if abs(nu - u) < 1e-15 and abs(nv - v) < 1e-15:
                break  # held at the grid's edge
            u, v = nu, nv
            p = surface.value(u, v)
        if math.hypot(p.x - x, p.y - y) <= slack_mm:
            return p.z
        raise ValueError("the curl's surface has no height over (%.3f, %.3f) m: %.3f m outside its grid" % (x / MM, y / MM, math.hypot(p.x - x, p.y - y) / MM))
    return z


def skin_of(face, thickness_mm):
    """The skin: the underside face pushed up its normal by the thickness, its rims filled along the normals (OCCT's
    offset) — kept as OCCT makes it. organic_geom.thicken_up makes that solid NURBS (for booleans; this skin meets
    none): on 6 Oct, on the test leaf, the NURBS skin failed OCCT's check under any placement at 50 m ("Unorientable")
    and was refused outright at 12 m. The offset solid itself holds what its thickness says (on Johny's leaf 0.9993 to
    0.9995 of thickness x area at 12 to 60 m) — but OCCT's check refuses the FIRST offset made over a fresh face at some
    lengths (45 and 55.7 m on 7 Oct), and passes every one made again over the same face (and fix() mends the first):
    so it is made again when the check refuses it, then mended, then refused. Checked where it was built and placed."""
    u0, u1, v0, v1 = face.ParameterRange
    sign = 1.0 if face.normalAt((u0 + u1) / 2, (v0 + v1) / 2).z > 0 else -1.0
    placement = App.Placement(App.Vector(1000.0, -2000.0, 300.0), App.Rotation(App.Vector(0, 0, 1), 37.0))

    def sound(s):
        placed = s.copy()
        placed.Placement = placement
        return s.isValid() and placed.isValid()

    last = None
    for _attempt in range(3):
        slab = face.makeOffsetShape(sign * thickness_mm, 0.01, fill=True)
        if not slab.Solids:
            continue
        solid = slab.Solids[0]
        if solid.Volume < 0:
            solid.reverse()
        if sound(solid):
            return solid
        last = solid
    if last is not None:
        mended = last.copy()
        mended.fix(1e-7, 1e-7, 1e-7)
        if sound(mended):
            return mended
    raise ValueError("the leaf's skin is not a sound solid (OCCT's check, where it was built and placed elsewhere; made three times and mended)")


def _resampled(pts, spacing):
    """A polyline's points again, evenly every `spacing` along it (its ends kept)."""
    seg = [math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:])]
    total = sum(seg)
    n = max(2, int(math.ceil(total / spacing)))
    out, acc, i = [], 0.0, 0
    for k in range(n + 1):
        s = total * k / n
        while i < len(seg) - 1 and acc + seg[i] < s:
            acc += seg[i]
            i += 1
        t = min(max((s - acc) / seg[i], 0.0), 1.0) if seg[i] else 0.0
        out.append((pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t))
    return out


def _eased_line(points_m, spacing_m):
    """An edge along lane C's traced line (metres): the line taken again every spacing_m along it, eased LINE_PASSES
    times (each point to a quarter of each neighbour and half itself; the two ends kept), a spline through that — the
    tracing's own zigzags out, the vein kept. Returns (the edge, the farthest the edge lies off C's polyline, m)."""
    pts = list(points_m)
    if len(pts) == 2:
        return Part.LineSegment(V(pts[0][0], pts[0][1], 0.0), V(pts[1][0], pts[1][1], 0.0)).toShape(), 0.0
    eased = _resampled(pts, spacing_m)
    for _ in range(LINE_PASSES):
        eased = [eased[0]] + [((a[0] + 2 * b[0] + c[0]) / 4.0, (a[1] + 2 * b[1] + c[1]) / 4.0) for a, b, c in zip(eased, eased[1:], eased[2:])] + [eased[-1]]
    edge = og.spline([V(x, y, 0.0) for x, y in eased])
    wire = Part.makePolygon([V(x, y, 0.0) for x, y in pts])
    off = max(wire.distToShape(Part.Vertex(edge.valueAt(edge.FirstParameter + (edge.LastParameter - edge.FirstParameter) * k / 200.0)))[0]
              for k in range(201))
    return edge, off / MM


def _edge_beam_line(ring_m, width_m, spacing_m):
    """The edge beam's middle line: the outline drawn in by EDGE_INSET of the beam's width (which rounds every sinus to
    that radius), then its outer corners rounded to the beam's width (shapely: in by the width, out by the width) — a
    line the beam follows without folding anywhere (no turn tighter than EDGE_INSET of its width; it folds at 0.625),
    its outer side EDGE_INSET - 0.5 of its width inside the outline everywhere, cutting across the teeth narrower than
    itself. Inside by construction: no cut by the outline is needed (OCCT's common of the ring with the plan's prism
    gave nothing on Johny's leaf, and cutting the outside away instead took 200 s and gave the wrong volume; 6 Oct).
    Its points taken again every spacing_m."""
    from shapely.geometry import Polygon

    q = Polygon(ring_m).buffer(-(EDGE_INSET + 1.0) * width_m).buffer(width_m)
    if q.is_empty:
        raise ValueError("the leaf is too narrow for its edge beam")
    if q.geom_type == "MultiPolygon":
        q = max(q.geoms, key=lambda g: g.area)
    pts = _resampled(list(q.exterior.coords), spacing_m)[:-1]
    if signed_area(pts) < 0:
        pts = pts[::-1]
    return og.spline([V(x, y, 0.0) for x, y in pts], closed=True)


def leaf_roof_shape(leaf, length_m, eave_m=0.0, skin_share=SKIN_SHARE, midrib_width_share=MIDRIB_WIDTH_SHARE,
                    midrib_depth_share=MIDRIB_DEPTH_SHARE, edge_width_share=EDGE_WIDTH_SHARE, edge_depth_share=EDGE_DEPTH_SHARE,
                    openings=None, holes_cut=True, said=None):
    """Johny's leaf as a roof at length_m (metres, tip to stem base), in its own frame (C's, times the length): the skin
    first, then the members in the order said["members"] gives ([name, how many solids], the midrib first, the veins by
    rank, the edge beam, the stem). eave_m lifts the curl's zero. openings: the names of the marks cut through (None:
    lane C's — the ones it found to go through, or all when its file says cut_by_default; on Johny's leaf none).
    holes_cut False only for a check's forged fault. Returns a compound."""
    from shapely.geometry import Polygon

    L = float(length_m)
    if not (L > 0) or skin_share <= 0:
        raise ValueError("a leaf roof needs a length and a skin above nought")
    ring = [(x * L, y * L) for x, y in leaf["outline"]]
    names = leaf.get("hole_names") or ["h%d" % (i + 1) for i in range(len(leaf["holes"]))]
    chosen = list(leaf.get("openings_by_default", names) if openings is None else openings)
    unknown = [n for n in chosen if n not in names]
    if unknown:
        raise ValueError("no mark of the leaf is called %s (its marks: %s)" % (", ".join(unknown), ", ".join(names)))
    holes = [[(x * L, y * L) for x, y in h] for n, h in zip(names, leaf["holes"]) if n in chosen] if holes_cut else []
    g = leaf["profile"]
    rows = len(g["heights"]) // g["columns"]
    origin = (g["origin"][0] * L, g["origin"][1] * L)
    step = g["step"] * L
    surface = og.field_surface(origin, step, g["columns"], [z * L + eave_m for z in g["heights"]])

    plan = Part.Face(Part.makePolygon([V(x, y, 0.0) for x, y in ring + ring[:1]]))
    for h in holes:
        plan = og.face_of(plan.cut(Part.Face(Part.makePolygon([V(x, y, 0.0) for x, y in h + h[:1]]))))
    prism = og.prism_of(plan)
    under_face = surface.toShape().common(prism)
    if len(under_face.Faces) != 1:
        raise ValueError("the curl's surface cut to the outline is %d faces, not one" % len(under_face.Faces))
    skin = skin_of(under_face.Faces[0], skin_share * L * MM)

    box = (origin[0] * MM, (origin[0] + (g["columns"] - 1) * step) * MM, origin[1] * MM, (origin[1] + (rows - 1) * step) * MM)
    under = height_over(surface, box, GRID_SLACK_SHARE * L * MM)
    zone = Polygon([(x * MM, y * MM) for x, y in ring], [[(x * MM, y * MM) for x, y in h] for h in holes])

    members, member_names, cover, off = [], [], {}, {}
    step = min(og.BAND_STEP_MM, STEP_SHARE * L * MM)

    def hang(name, edge, closed, d1, d2, depth_mm, where, clip=True, zoned=True):
        told = {}
        got = og.hung_member_shape(edge, closed, d1, d2, where, depth_mm, said=told, what=name, zone=zone if zoned else None, step_mm=step)
        cover[name] = sum(b - a for a, b in told.get("stretches", []))  # the share of its line the member runs along
        if clip:  # the outline and the holes cut it too
            kept = []
            for s in got:
                c = s.common(prism)
                kept += [x for x in c.Solids if x.Volume > 1.0]
            got = kept
        members.extend(got)
        member_names.append([name, len(got)])

    for v in leaf["veins"]:
        w = midrib_width_share * L * MURRAY ** (v["rank"] - 1) * MM
        d = midrib_depth_share * L * MURRAY ** (v["rank"] - 1) * MM
        name = "midrib" if v["rank"] == 1 else "vein %s" % v["id"]
        edge, off[name] = _eased_line([(x * L, y * L) for x, y in v["points"]], LINE_SPACING_SHARE * L)
        hang(name, edge, False, -w / 2, w / 2, d, under)
    ew, ed = edge_width_share * L * MM, edge_depth_share * L * MM
    hang("edge beam", _edge_beam_line(ring, ew / MM, 0.5 * LINE_SPACING_SHARE * L), True, -ew / 2, ew / 2, ed, under, clip=False)
    if len(leaf["stem"]) >= 2:
        mid = next(v for v in leaf["veins"] if v["rank"] == 1)["points"]
        base = (mid[0][0] * L * MM, mid[0][1] * L * MM)
        top = under(*base)
        w, d = midrib_width_share * L * MM, midrib_depth_share * L * MM
        edge, off["stem"] = _eased_line([(x * L, y * L) for x, y in leaf["stem"]], LINE_SPACING_SHARE * L)
        hang("stem", edge, False, -w / 2, w / 2, d, lambda x, y: top, clip=False, zoned=False)

    if said is not None:
        blade = Polygon(ring, holes)
        xs, ys = [p[0] for p in ring], [p[1] for p in ring]
        said.update({"length_m": L, "width_m": max(xs) - min(xs), "blade_extent_m": max(ys) - min(ys), "plan_area_m2": blade.area,
                     "outline_points": len(ring), "holes": len(holes), "openings": chosen, "marks": len(leaf["holes"]), "veins": len(leaf["veins"]),
                     "members": member_names, "coverage": cover, "line_off_m": off,
                     "skin_m": skin_share * L, "midrib_m": [midrib_width_share * L, midrib_depth_share * L],
                     "edge_beam_m": [edge_width_share * L, edge_depth_share * L],
                     "under_face_vertices": len(under_face.Faces[0].OuterWire.Vertexes)})
    return Part.makeCompound([skin] + members)
