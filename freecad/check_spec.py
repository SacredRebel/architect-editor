# -*- coding: utf-8 -*-
"""check_spec — a house built from a spec, held against the spec itself.

    "<FreeCAD>\\bin\\freecadcmd.exe" check_spec.py --pass <spec.json> <design.FCStd | records.json> [--without=<id>,<id>] [--self-test]

(SPEC_CHECK_SPEC, SPEC_CHECK_DESIGN, SPEC_CHECK_WITHOUT and SPEC_CHECK_SELF_TEST=1 in the
environment say the same, for a caller that cannot pass arguments: the window through the
FreeCAD MCP connector.) --without names pieces of the spec that were left out of the design
on purpose (the pool pavilion's roof): they are named in the result and not looked at.

The spec is Johny's (exchange\\house\\concept\\<name>.json: walls as points, openings, roofs as
formulas). The design is what "Import from the map" or realize.py made of the records that
spec_to_records.py wrote from it; a records file given instead is built here first. Nothing
of the records is read to judge: every number below is taken from the spec, and every
measure from the solids, by walking each solid with points (is this point in it or not):

  H. the house is whole: every wall, floor and roof shell of the spec, and the chimney, is one
     valid solid in the design.
  V. every solid measures the same two ways: FreeCAD's own Volume (a fixed number of points to
     a face) within 1 % of OCCT's adaptive measure. A face that spans one long spline, or one
     that folds, shows as a gap between the two: a joined wall 12.9 m long with each of its
     sides in one face read 4 % short by the first, and was sound by every other count.
  W. every wall, at every point of its path that no opening covers: its two faces stand where
     the spec's rule puts them (an outer-face path: the path itself and the thickness inward
     of it; a centreline, a glazing axis, a rail axis: half the thickness either side), and
     its top is at the spec's height, or at the spec's top-edge sample of that point.
  J. where walls end on each other (found from the spec alone: an end within 0.05 m of
     another wall's end or line, on the same level) they are joined as the map joins them:
     round every such meeting point, nothing of the spec's own walls is lost and no two walls
     share space. (The wall's faces are not held to the plain rule within reach of such an end.)
  O. every opening: its two jambs stand half its width either side of the foot of the spec's
     centre, measured along the wall's path; its sill and its head are at the spec's heights.
  F. every floor: its area is the spec's gross area of that level, its top at the level, its
     thickness the spec's floor zone, and each courtyard the spec lists is open through it.
  C. the chimney: its radius at every height of the spec's profile, its base and its top.
  R. every roof shell: its top at the spec's own eave, ridge and apex samples; its top at 150
     places of its plan against the spec's expression; its thickness straight down; nothing
     of it over a courtyard or the chimney's cut, nor outside its plan outline; and it holds
     its plan's area (worked out here from the outline and the round holes) times its thickness.

How close: 0.01 m for faces, jambs, sills, heads and tops of walls; 0.03 m for a roof's top
(its heights stand on a grid of 0.25 m: the grid's own sag at a crease); 0.15 m² for a floor.

--self-test builds forged pieces (a wall thickened outward, an opening 0.4 m along, a roof
5 cm too high, a floor without its courtyard, walls with butt ends where they meet, a joined
wall with each side in one face, ...) through the same import, measures them the same way,
and must see every one rejected by the check meant for it.
"""

import copy
import json
import math
import os
import random
import sys
import time

import FreeCAD as App
import Part

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Playground\Architect-editor\freecad"
for folder in (os.path.join(HERE, "Organic"), HERE):
    if folder not in sys.path:
        sys.path.insert(0, folder)
import organic_geom as og  # noqa: E402
import organic_import as oi  # noqa: E402
import spec_to_records as s2r  # noqa: E402

OUT = sys.stdout  # as it is now: FreeCAD's IFC exporter leaves another in its place
MM = 1000.0
CLOSE = 0.01  # metres: faces, jambs, sills, heads, wall tops
ROOF_CLOSE = 0.03
FLOOR_CLOSE = 0.15  # m²
REACH = 0.10  # metres either side of where a face should be that it is looked for
JOIN = 0.05  # metres: two wall ends closer than this are one meeting point (the map's rule, and the old editor's)
PLAIN = 0.01  # how far FreeCAD's own Volume may lie from the adaptive measure (a sampled top or a roof leaf reads up to 0.4 % off by it)
num, rows, ring_of = s2r.num, s2r.rows, s2r.ring_of


def say(text):
    OUT.write(text + "\n")
    OUT.flush()


# ------------------------------------------------------------------ a path through points
class Path:
    """The smooth curve through a spec's points (the rule: at each point parallel to the line
    between its two neighbours; an open curve's ends count twice), walked by metres."""

    def __init__(self, pts, closed, per=200):
        self.pts, self.closed, self.per = list(pts), closed, per
        n = len(self.pts)
        self.rows = []  # (x, y, tx, ty, metres along)
        s = 0.0
        last = None
        spans = n if closed else n - 1
        for i in range(spans):
            p0 = self.pts[(i - 1) % n] if closed else self.pts[max(i - 1, 0)]
            p1, p2 = self.pts[i], self.pts[(i + 1) % n]
            p3 = self.pts[(i + 2) % n] if closed else self.pts[min(i + 2, n - 1)]
            for j in range(per + (1 if i == spans - 1 else 0)):
                t = j / float(per)
                x, y = (0.5 * (2 * p1[c] + (p2[c] - p0[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t ** 3) for c in (0, 1))
                dx, dy = (0.5 * ((p2[c] - p0[c]) + 2 * (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t + 3 * (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t * t) for c in (0, 1))
                if last is not None:
                    s += math.hypot(x - last[0], y - last[1])
                last = (x, y)
                d = math.hypot(dx, dy) or 1.0
                self.rows.append((x, y, dx / d, dy / d, s))
        self.total = s
        area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(self.pts, self.pts[1:] + self.pts[:1])) / 2.0
        self.inward = 1.0 if area > 0 else -1.0  # the inside of a closed path: to its left when it runs anticlockwise

    def at_point(self, i):
        """Metres along the path to its i-th point."""
        return self.rows[min(i * self.per, len(self.rows) - 1)][4]

    def at(self, s):
        """((x, y), the unit vector to the left of the path) s metres along it."""
        s = s % self.total if self.closed else max(0.0, min(self.total, s))
        lo, hi = 0, len(self.rows) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if self.rows[mid][4] <= s:
                lo = mid
            else:
                hi = mid
        a, b = self.rows[lo], self.rows[hi]
        f = 0.0 if b[4] <= a[4] else (s - a[4]) / (b[4] - a[4])
        tx, ty = a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f
        d = math.hypot(tx, ty) or 1.0
        return (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f), (-ty / d, tx / d)

    def foot(self, q):
        """(metres along the path to the place nearest q, how far q is from it)."""
        best = (float("inf"), 0.0)
        for a, b in zip(self.rows, self.rows[1:]):
            dx, dy = b[0] - a[0], b[1] - a[1]
            d2 = dx * dx + dy * dy
            t = 0.0 if d2 == 0 else max(0.0, min(1.0, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / d2))
            off = math.hypot(q[0] - a[0] - dx * t, q[1] - a[1] - dy * t)
            if off < best[0]:
                best = (off, a[4] + (b[4] - a[4]) * t)
        return best[1], best[0]

    def tightest(self, i):
        """The radius of the tightest bend of the path at its i-th point (either side of it)."""
        n = len(self.pts)
        radii = []
        for span, t in ((i, 0.0), ((i - 1) % n if self.closed else i - 1, 1.0)):
            if span < 0 or span >= (n if self.closed else n - 1):
                continue
            p0 = self.pts[(span - 1) % n] if self.closed else self.pts[max(span - 1, 0)]
            p1, p2 = self.pts[span], self.pts[(span + 1) % n]
            p3 = self.pts[(span + 2) % n] if self.closed else self.pts[min(span + 2, n - 1)]
            d1 = [0.5 * ((p2[c] - p0[c]) + 2 * (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t + 3 * (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t * t) for c in (0, 1)]
            d2 = [0.5 * (2 * (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) + 6 * (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t) for c in (0, 1)]
            k = abs(d1[0] * d2[1] - d1[1] * d2[0]) / (math.hypot(*d1) ** 3 or 1.0)
            radii.append(1.0 / k if k > 1e-9 else float("inf"))
        return min(radii) if radii else float("inf")

    def dense(self):
        return [(r[0], r[1]) for r in self.rows]


# ------------------------------------------------------------------ walking a solid with points
def is_in(shape, x, y, z):
    return bool(shape.isInside(App.Vector(x * MM, y * MM, z * MM), 1e-3, False))


def edge_between(shape, point, step, expect, reach=REACH, inside_first=True):
    """Where a solid's face lies on the line through `point` along `step` (a unit vector),
    looked for from `expect - reach` to `expect + reach` metres along it: the place where
    in-the-solid changes, to a millimetre. None when it does not change there as it should
    (inside_first: in the solid before the face, out of it after)."""
    def probe(d):
        return is_in(shape, point[0] + step[0] * d, point[1] + step[1] * d, point[2] + step[2] * d)

    lo, hi = expect - reach, expect + reach
    if probe(lo) != inside_first or probe(hi) == inside_first:
        return None
    for _ in range(8):
        mid = (lo + hi) / 2.0
        if probe(mid) == inside_first:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0


def column_of(shape, x, y):
    """(the top, the underside) of a solid on the upright line through (x, y), in metres; None where it has nothing."""
    line = Part.makeLine(App.Vector(x * MM, y * MM, -50 * MM), App.Vector(x * MM, y * MM, 50 * MM))
    zs = [v.Point.z / MM for v in shape.common(line).Vertexes]
    return (max(zs), min(zs)) if len(zs) >= 2 else None


def box_of(shape):
    b = shape.optimalBoundingBox(False, False)
    return tuple(v / MM for v in (b.XMin, b.XMax, b.YMin, b.YMax, b.ZMin, b.ZMax))


def worst(values):
    return max((abs(v) for v in values), default=0.0)


# ------------------------------------------------------------------ what the spec says, piece by piece
def spec_pieces(spec, answers=None):
    """{id: (kind, what the spec says of it)} for everything the house check looks at; with
    Johny's answers (the records' .answers.json), the round openings he asked for in a floor
    (each with its radius worked out here from the piece it is round) and the bands."""
    answers = answers or {}
    out = {}
    for w in spec.get("2_curved_walls", []):
        out[w["id"]] = ("wall", w)
    chimney = spec.get("structural_and_coordination", {}).get("chimney")
    zones = {level: num(spec["structural_and_coordination"][key]) for level, key in (("main", "main_floor_zone_m"), ("mezzanine", "mezzanine_floor_zone_m"))
             if key in spec.get("structural_and_coordination", {})}
    zones.update({level: float(row["thickness_m"]) for level, row in (answers.get("floors") or {}).items()})
    for level, floor in spec.get("floor_outlines", {}).items():
        cuts = []
        z = num(floor.get("z_m", spec["frame"]["levels_m"].get(level, 0.0)))
        for cut in (answers.get("floor_cuts") or {}).get(level, []):
            if cut.get("round_of") == "chimney" and chimney and level in zones:
                centre = [num(c) for c in chimney.get("centre_xyz_m", [0, 0, 0])]
                radius = s2r.profile_radius([(num(zz) + centre[2], num(r)) for zz, r in chimney["radius_profile_z_r_m"]], z - zones[level], z)
                cuts.append((cut["id"], (centre[0], centre[1]), radius))
        out["floor-" + level] = ("floor", dict(floor, level=level, cuts=cuts))
    if chimney:
        out["chimney"] = ("chimney", chimney)
    for shell in spec.get("4_roof_shells", []):
        out[shell["id"]] = ("roof", shell)
    band = answers.get("bands") or {}
    walls = {w["id"]: w for w in spec.get("2_curved_walls", [])}
    glass = num(walls[band["glass_from"]]["thickness_m"]) if band.get("glass_from") in walls else None
    for wid in band.get("walls", []):
        if wid in walls:
            out[wid + ".band"] = ("band", {"wall": walls[wid], "kind": str(band.get("kind", "Glass")), "glass": glass})
    return out


def round_holes(spec):
    out = {}
    for o in spec.get("roof_oculi_skylights", []):
        if "centre_xy_m" in o and ("radius_m" in o or "radius_at_roof_m" in o):
            radius = num(o["radius_m"]) if "radius_m" in o else num(o["radius_at_roof_m"]) + num(o.get("movement_clearance_m", 0.0))
            out[o["id"]] = (tuple(num(c) for c in o["centre_xy_m"][:2]), radius)
    return out


_MEETINGS = {}


def spec_meetings(spec):
    """Where the spec's open walls end on other walls of their level, from the spec alone.
    Returns (skip, meetings): skip = {wall id: {"start": metres, "end": metres}}, how far from
    such an end the wall's faces are not the plain rule's (absent where the end meets nothing);
    meetings = [{"key", "at": (x, y), "level", "ends": [(wall id, "start" | "end")], "passing":
    [wall id], "thick": the thickest wall there}]."""
    if id(spec) in _MEETINGS:
        return _MEETINGS[id(spec)]
    walls = {}
    for w in spec.get("2_curved_walls", []):
        pts, repeated = ring_of(rows(w["points_xy_m"]))
        closed = bool(w.get("closed")) or repeated
        walls[w["id"]] = {"pts": pts, "closed": closed, "path": Path(pts, closed, per=60), "t": num(w["thickness_m"]), "level": num(w["z_base_m"])}
    meetings = []
    for wid, w in walls.items():
        if w["closed"]:
            continue
        for which, point in (("start", w["pts"][0]), ("end", w["pts"][-1])):
            here = next((m for m in meetings if m["level"] == w["level"] and math.dist(m["at"], point) < JOIN), None)
            if here is None:
                here = {"at": point, "level": w["level"], "ends": [], "passing": [], "gap": 0.0}
                meetings.append(here)
            here["gap"] = max(here["gap"], math.dist(here["at"], point))  # ends up to JOIN apart count as one point: each wall is cut about its own
            here["ends"].append((wid, which))
    for m in meetings:
        mine = {wid for wid, _which in m["ends"]}
        for oid, o in walls.items():
            if oid in mine or o["level"] != m["level"]:
                continue
            if o["path"].foot(m["at"])[1] < JOIN:
                m["passing"].append(oid)
    meetings = [m for m in meetings if len(m["ends"]) + len(m["passing"]) > 1]
    skip = {}
    for m in meetings:
        m["thick"] = max(walls[wid]["t"] for wid in [e[0] for e in m["ends"]] + m["passing"])
        m["key"] = "%s at (%.2f, %.2f)" % (" + ".join(sorted(e[0] for e in m["ends"])), m["at"][0], m["at"][1])
        for wid, which in m["ends"]:
            skip.setdefault(wid, {})[which] = 0.05 + 2.0 * m["thick"]
    _MEETINGS[id(spec)] = (skip, meetings)
    return skip, meetings


def in_plain_band(rows_, t, point, margin=0.004):
    """Whether a point lies in an open wall's plain band by the spec's rule (its centreline, half the thickness either
    side, cut square at its two ends), keeping `margin` clear of the band's edges. rows_: the centreline as Path.rows."""
    best = None
    for i, (a, b) in enumerate(zip(rows_, rows_[1:])):
        dx, dy = b[0] - a[0], b[1] - a[1]
        d2 = dx * dx + dy * dy
        if d2 == 0:
            continue
        f = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / d2
        beyond = (i == 0 and f < 0) or (i == len(rows_) - 2 and f > 1)
        f = max(0.0, min(1.0, f))
        off = math.hypot(point[0] - a[0] - dx * f, point[1] - a[1] - dy * f)
        if best is None or off < best[0]:
            best = (off, beyond)
    return best is not None and not best[1] and best[0] <= t / 2.0 - margin


def measure_meeting(spec, meeting, shapes):
    """Round one meeting point: places on a grid of 2 cm, 1 m above the walls' base, asked whether they lie in each
    wall that ends there and whether the spec's own plain band of any of them holds them."""
    by_id = {w["id"]: w for w in spec["2_curved_walls"]}
    ids = [wid for wid, _which in meeting["ends"]]
    plain = {wid: (Path(ring_of(rows(by_id[wid]["points_xy_m"]))[0], False, per=40).rows, num(by_id[wid]["thickness_m"])) for wid in ids}
    cx, cy = meeting["at"]
    z = meeting["level"] + 1.0
    r = 2.0 * meeting["thick"]
    step = 0.02
    passing = [shapes[wid] for wid in meeting["passing"] if wid in shapes]
    asked = lost = shared = butt = wedge = 0
    n = int(r / step)
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            x, y = cx + i * step + 0.003, cy + j * step + 0.007  # (off the walls' own lines, which run through the point)
            if math.hypot(x - cx, y - cy) > r:
                continue
            inside = sum(1 for wid in ids if is_in(shapes[wid], x, y, z))
            through = any(is_in(s, x, y, z) for s in passing)
            banded = any(in_plain_band(p, t, (x, y)) for p, t in plain.values())
            asked += 1
            lost += banded and inside == 0 and not through
            shared += inside >= 2
            butt += banded and through  # what a butt end would share with the wall it lands on
            wedge += inside >= 1 and through  # what the joined end shares with it
    # (two ends that are not quite on one point are each cut about their own: a sliver as wide as the gap between them)
    return {"asked": asked, "lost": lost, "shared": shared, "butt": butt, "wedge": wedge, "ends": len(ids), "passing": len(meeting["passing"]),
            "allowed": 0.01 * asked + meeting["gap"] * meeting["thick"] / (step * step)}


def measure_wall(spec, w, shape):
    base = num(w["z_base_m"])
    pts, repeated = ring_of(rows(w["points_xy_m"]))
    closed = bool(w.get("closed")) or repeated
    path = Path(pts, closed)
    meets = spec_meetings(spec)[0].get(w["id"], {})  # how far from each end the faces are a joint's, not the plain rule's
    t = num(w["thickness_m"])
    outer = w.get("reference") == "outer_face" and closed
    side = path.inward  # +1: the inside is to the path's left
    # the wall's two faces as metres to the left of the path, and its middle
    faces = sorted((0.0, side * t)) if outer else (-t / 2.0, t / 2.0)
    middle = (faces[0] + faces[1]) / 2.0
    tops = None
    if w.get("top_edge_xyz_m"):
        tops = [r[2] - base for r in rows(w["top_edge_xyz_m"])]
        if repeated:
            tops = tops[:-1]
    height = None if tops else (min(num(h) for h in w["height_m"]) if isinstance(w["height_m"], (list, tuple)) else num(w["height_m"]))
    mine = [o for o in spec.get("3_openings", []) if o["wall"] == w["id"]]
    spans = []
    for o in mine:
        s0, off = path.foot((num(o["centre_xy_m"][0]), num(o["centre_xy_m"][1])))
        spans.append((s0, num(o["width_m"]), off, o))

    def covered(s, margin=0.15):
        """The opening that covers the place s metres along the path (with a margin), or None."""
        for s0, width, _off, o in spans:
            d = abs(s - s0)
            if closed:
                d = min(d, path.total - d)
            if d < width / 2.0 + margin:
                return o
        return None

    out = {"valid": bool(shape.isValid()), "solids": len(shape.Solids), "box": box_of(shape), "volume": og.volume_of(shape) / 1e9, "length": path.total,
           "faces": [], "tops": [], "points": 0, "covered": 0, "tight": 0, "joined": 0, "lost": [], "openings": {}}
    count = len(pts)
    reach = min(REACH, t / 2.0 - 0.005)

    def at_point(i):
        """Metres along the path to its i-th point; an open wall's two ends are read 3 cm inside it (its end face is neither in nor out)."""
        s = path.at_point(i)
        return s if closed else max(0.03, min(path.total - 0.03, s))

    for i in range(count):
        # the two faces: at the point and half-way to the next one (a wall on straight runs between its points is off there)
        for half in (0, 1):
            if half and not closed and i == count - 1:
                continue
            s = at_point(i) if not half else (path.at_point(i) + (path.at_point(i + 1) if i + 1 < count else path.total)) / 2.0
            if covered(s) is not None:
                out["covered"] += 1
                continue
            if (meets.get("start") and s < meets["start"]) or (meets.get("end") and s > path.total - meets["end"]):
                out["joined"] += 1  # within reach of an end that meets other walls: looked at by check J, not here
                continue
            (x, y), left = path.at(s)
            out["points"] += 1
            if min(path.tightest(i), path.tightest((i + 1) % count if closed else min(i + 1, count - 1))) < t + 0.05:
                out["tight"] += 1  # the wall's far face folds on a bend tighter than the wall is thick: not measured here
                continue
            lo = edge_between(shape, (x, y, base + 0.20), (left[0], left[1], 0.0), faces[0], reach, inside_first=False)
            hi = edge_between(shape, (x, y, base + 0.20), (left[0], left[1], 0.0), faces[1], reach, inside_first=True)
            if lo is None or hi is None:
                out["lost"].append("%s point %d (%.2f, %.2f): a face is not within %.3f m of where the spec puts it" % ("half-way after" if half else "at", i, x, y, reach))
            else:
                out["faces"].append((lo - faces[0], hi - faces[1]))
        # the top: at the point (a top-edge sample belongs to its point)
        s = at_point(i)
        (x, y), left = path.at(s)
        want = tops[i] if tops else height
        over = covered(s)
        if over is None:
            top = edge_between(shape, (x + left[0] * middle, y + left[1] * middle, base), (0.0, 0.0, 1.0), want, REACH, inside_first=True)
        elif num(over["head_m_above_level"]) > want - 0.05:
            out["open_top"] = out.get("open_top", 0) + 1  # an opening that runs to the wall's top stands here: no top to measure
            continue
        else:  # above an opening's head the wall is a band: looked for closer
            top = edge_between(shape, (x + left[0] * middle, y + left[1] * middle, base), (0.0, 0.0, 1.0), want, 0.03, inside_first=True)
        if top is None:
            out["lost"].append("at point %d (%.2f, %.2f): the top is not within %.2f m of %.2f m above the base" % (i, x, y, REACH if over is None else 0.03, want))
        else:
            out["tops"].append(top - want)
    for s0, width, off, o in spans:
        sill, head = num(o["sill_m_above_level"]), num(o["head_m_above_level"])
        mid_z = base + (sill + head) / 2.0

        def spot(s, z):
            (x, y), left = path.at(s)
            return (x + left[0] * middle, y + left[1] * middle, z)

        got = {"off": off, "width": width, "open": not is_in(shape, *spot(s0, mid_z)), "lost": []}
        # jambs: along the path at mid thickness; the line is walked by metres along the path, so by points
        jambs = []
        for sign in (-1.0, 1.0):
            want = s0 + sign * width / 2.0
            if not closed and (want < 0.02 or want > path.total - 0.02):
                jambs.append(None)  # the opening reaches the wall's end: no jamb there
                continue
            lo, hi = want - sign * 0.04, want + sign * 0.04  # lo in the opening, hi in the wall (a mullion between two bays is under 0.10 m)
            if is_in(shape, *spot(lo, mid_z)) or not is_in(shape, *spot(hi, mid_z)):
                got["lost"].append("its jamb %.2f m along is not within 0.04 m of there" % want)
                jambs.append(None)
                continue
            for _ in range(8):
                mid = (lo + hi) / 2.0
                if is_in(shape, *spot(mid, mid_z)):
                    hi = mid
                else:
                    lo = mid
            jambs.append((lo + hi) / 2.0 - want)
        got["jambs"] = jambs
        got["sill"] = None
        got["to_floor"] = None if sill >= 0.02 else not is_in(shape, *spot(s0, base + 0.02))  # a door is open down to the floor
        if sill >= 0.02:
            at = edge_between(shape, spot(s0, base), (0.0, 0.0, 1.0), sill, min(REACH, sill - 0.005), inside_first=True)
            if at is None:
                got["lost"].append("its sill is not within %.2f m of %.2f m" % (REACH, sill))
            else:
                got["sill"] = at - sill
        at = edge_between(shape, spot(s0, base), (0.0, 0.0, 1.0), head, 0.03, inside_first=False)
        got["head"] = None if at is None else at - head
        got["head_at_top"] = at is None and not is_in(shape, *spot(s0, base + head + 0.03))  # nothing of the wall above the head: it runs to the top
        if at is None and not got["head_at_top"]:
            got["lost"].append("its head is not within 0.03 m of %.2f m" % head)
        out["openings"][o["id"]] = got
    return out


def measure_floor(spec, floor, shape):
    level = floor["level"]
    z = num(floor.get("z_m", spec["frame"]["levels_m"].get(level, 0.0)))
    box = box_of(shape)
    holes = round_holes(spec)
    out = {"valid": bool(shape.isValid()), "solids": len(shape.Solids), "box": box, "volume": og.volume_of(shape) / 1e9, "top": box[5], "bottom": box[4], "holes": {}}
    asked = [(hid, centre, r, True) for hid, centre, r in floor.get("cuts", [])]  # the openings Johny asked for (the chimney's)
    for hid, (cx, cy), r, cut in [(hid, holes[hid][0], holes[hid][1], False) for hid in floor.get("holes", []) if hid in holes] + asked:
        mid = (box[4] + box[5]) / 2.0
        rim = []
        for k in range(8 if not cut else 16):
            a = 2 * math.pi * (k + 0.25) / (8 if not cut else 16)
            at = edge_between(shape, (cx, cy, mid), (math.cos(a), math.sin(a), 0.0), r, REACH, inside_first=False)
            rim.append(None if at is None else at - r)
        out["holes"][hid] = {"open": not is_in(shape, cx, cy, mid), "rim": rim, "cut": cut, "radius": r}
    return out


def measure_chimney(spec, chimney, shape):
    cx, cy, _cz = (num(c) for c in chimney.get("centre_xyz_m", [0, 0, 0]))
    profile = [(num(z), num(r)) for z, r in chimney["radius_profile_z_r_m"]]
    box = box_of(shape)
    radii = []
    for (z0, r0), (z1, r1) in zip(profile, profile[1:]):
        for f in (0.25, 0.75):
            z, r = z0 + (z1 - z0) * f, r0 + (r1 - r0) * f
            for k in range(4):
                a = 2 * math.pi * (k + 0.37) / 4
                at = edge_between(shape, (cx, cy, z), (math.cos(a), math.sin(a), 0.0), r, REACH, inside_first=True)
                radii.append(None if at is None else at - r)
    return {"valid": bool(shape.isValid()), "solids": len(shape.Solids), "box": box, "volume": og.volume_of(shape) / 1e9,
            "radii": radii, "base": box[4], "top": box[5], "want_base": profile[0][0], "want_top": profile[-1][0]}


def measure_roof(spec, shell, shape):
    sid = shell["id"]
    outline, _repeated = ring_of(rows(shell["plan_outline_xy_m"]))
    path = Path(outline, True, per=120)
    ring = path.dense()
    holes = {h: round_holes(spec)[h] for h in shell.get("holes", []) if h in round_holes(spec)}
    expression = s2r.shell_top(spec, sid)
    thickness = num(shell["envelope_thickness_m"])

    def in_hole(x, y, margin):
        return any(math.hypot(x - c[0], y - c[1]) < r + margin for c, r in holes.values())

    out = {"valid": bool(shape.isValid()), "solids": len(shape.Solids), "box": box_of(shape), "volume": og.volume_of(shape) / 1e9,
           "samples": [], "skipped": 0, "field": [], "holes": {}, "outside": 0, "outside_tried": 0}
    # the spec's own samples: an eave sample stands on the outline itself, so the roof is read 2 cm inside it
    eaves = rows(shell.get("eave_line_xyz_m", []))
    if eaves and math.hypot(eaves[0][0] - eaves[-1][0], eaves[0][1] - eaves[-1][1]) < 1e-9:
        eaves = eaves[:-1]
    samples = []
    for x, y, z in eaves:
        s, _off = path.foot((x, y))
        (px, py), left = path.at(s)
        samples.append(("eave", px + left[0] * path.inward * 0.02, py + left[1] * path.inward * 0.02, z))
        # and 10 cm outside the outline there is no roof
        out["outside_tried"] += 1
        if column_of(shape, px - left[0] * path.inward * 0.10, py - left[1] * path.inward * 0.10) is not None:
            out["outside"] += 1
    samples += [("ridge", x, y, z) for x, y, z in rows(shell.get("ridge_axis_xyz_m", []))]
    if shell.get("apex_xyz_m"):
        samples.append(("apex",) + tuple(num(c) for c in shell["apex_xyz_m"]))
    for kind, x, y, z in samples:
        if in_hole(x, y, 0.05) or not s2r.inside((x, y), ring):
            out["skipped"] += 1
            continue
        col = column_of(shape, x, y)
        out["samples"].append((kind, x, y, z, None if col is None else col[0], expression(x, y)))
    # the top against the spec's expression, and the thickness, at places of the plan
    rnd = random.Random(7)
    xs, ys = [p[0] for p in ring], [p[1] for p in ring]
    tried = 0
    while len(out["field"]) < 150 and tried < 5000:
        tried += 1
        x, y = rnd.uniform(min(xs), max(xs)), rnd.uniform(min(ys), max(ys))
        if not s2r.inside((x, y), ring) or in_hole(x, y, 0.05) or s2r.distance_to_polygon((x, y), ring) == 0.0 and min(math.hypot(x - a, y - b) for a, b in ring) < 0.05:
            continue
        col = column_of(shape, x, y)
        out["field"].append((x, y, None if col is None else col[0], None if col is None else col[0] - col[1], expression(x, y)))
    for hid, ((cx, cy), r) in holes.items():
        inside_plan = s2r.inside((cx, cy), ring)
        open_at = [column_of(shape, cx + (r - 0.05) * math.cos(a), cy + (r - 0.05) * math.sin(a)) is None for a in (2 * math.pi * k / 12 for k in range(12))]
        out["holes"][hid] = {"centre_open": column_of(shape, cx, cy) is None, "rim_open": all(open_at), "centre_in_plan": inside_plan}
    # what it must hold: the plan (the outline less the round holes), worked out here, times the thickness
    from shapely.geometry import Point, Polygon

    plan = Polygon(ring)
    for (cx, cy), r in holes.values():
        plan = plan.difference(Point(cx, cy).buffer(r, quad_segs=256))
    out["plan_area"] = plan.area
    out["thickness"] = thickness
    return out


BAND_EDGE = 0.10  # metres along the wall: a place this near where its band starts or ends (by the rule below) is not looked at
BAND_LOW = 0.005  # metres: no band where the underside of the lowest roof over it stands less than this over the wall's top, at its middle
BAND_UNSURE = 0.03  # metres: nor is a place looked at whose underside stands within this of BAND_LOW over the wall's top (the roofs' own tolerance)
BAND_FOLD = 0.8  # no band where its side on the inside of a turn lies further into the turn than this share of its radius
BAND_ACROSS = 9  # places across a band asked whether a roof's plan holds them
BAND_BEND_REACH = 0.5  # metres along the wall: a band's faces are not looked at this near a turn of the spec's path tighter than the band is wide


def measure_band(spec, said, shape):
    """A band between a wall's top and the roofs over it (Johny's answer 5), by the format's
    rule, worked out here from the spec alone: at a line across the wall, a roof is over the
    band when its plan (the spec's outline less its round holes) holds any of BAND_ACROSS
    places from one of the band's faces to the other (a courtyard wall stands under the rim of
    the roof's hole over the courtyard); there is a band where a roof is over it and the
    underside of the lowest such roof (the spec's own expression less the roof's thickness) at
    the band's middle stands at least BAND_LOW over the wall's top, and where the wall does not
    turn tighter than the band can follow (its side on the inside of the turn no further into
    it than BAND_FOLD of the radius, the turn read off the spec's own curve); it runs up to that
    lowest roof, and steps where the roof over it changes (the spec's "stepped glazing at shell
    seams"). At the wall's own
    points and half-way between them (where the spec's top line is exact), on the upright line
    through the band's middle: where there is a band, where it starts (the wall's top) and where
    it ends (that underside); where there is none, that nothing is there. A place within
    BAND_EDGE along the wall of where the band starts, ends or steps, or whose underside stands within
    BAND_UNSURE of BAND_LOW over the wall's top, is not looked at. And the band's two faces at
    mid height: a glass pane on the wall's middle, or the wall's own two faces; not within
    BAND_BEND_REACH of a turn of the spec's path tighter than the band is wide, where the wall's
    base curve (fitted through points 0.2 m apart) and the band with it leave the spec's line."""
    w, kind, glass = said["wall"], said["kind"], said["glass"]
    base = num(w["z_base_m"])
    pts, repeated = ring_of(rows(w["points_xy_m"]))
    closed = bool(w.get("closed")) or repeated
    path = Path(pts, closed)
    t = num(w["thickness_m"])
    outer = w.get("reference") == "outer_face" and closed
    faces = sorted((0.0, path.inward * t)) if outer else (-t / 2.0, t / 2.0)
    middle = (faces[0] + faces[1]) / 2.0
    if kind == "Glass":
        faces = (middle - glass / 2.0, middle + glass / 2.0)
    tops = [r[2] - base for r in rows(w["top_edge_xyz_m"])][:len(pts)] if w.get("top_edge_xyz_m") else None
    height = None if tops else (min(num(h) for h in w["height_m"]) if isinstance(w["height_m"], (list, tuple)) else num(w["height_m"]))
    holes = round_holes(spec)
    leaves = []
    for shell in spec.get("4_roof_shells", []):
        ring = Path(ring_of(rows(shell["plan_outline_xy_m"]))[0], True, per=120).dense()
        leaves.append((shell["id"], ring, [holes[h] for h in shell.get("holes", []) if h in holes], s2r.shell_top(spec, shell["id"]), num(shell["envelope_thickness_m"])))
    n, per, walk = len(pts), path.per, path.rows
    count = len(walk) - 1 if closed else len(walk)  # a closed path's last row is its first again

    def row(r):
        return walk[r % count] if closed else walk[max(0, min(count - 1, r))]

    def top_at(r):
        """The wall's top above its base at row r of the path: the smooth line through the heights at its points."""
        if tops is None:
            return height
        r = r % count if closed else max(0, min(count - 1, r))
        i, j = divmod(r, per)
        if not closed and i >= n - 1:
            i, j = n - 2, per
        u = j / float(per)
        p0, p1, p2, p3 = (tops[(i + k) % n] if closed else tops[max(0, min(n - 1, i + k))] for k in (-1, 0, 1, 2))
        return 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u ** 3)

    def turn(r):
        """How the path turns at row r, per metre (to its left: more than nought)."""
        a, b = row(r - 1), row(r + 1)
        ds = b[4] - a[4]
        if closed and ds <= 0:
            ds += path.total
        return math.asin(max(-1.0, min(1.0, a[2] * b[3] - a[3] * b[2]))) / ds if ds > 0 else 0.0

    def state(r):
        """("band", (head, foot, roof)) where the rule puts a band at row r; else ("none" | "turn" | "unsure", None)."""
        x, y, tx, ty, _s = row(r)
        left = (-ty, tx)
        k = turn(r)
        if max(faces[0] * k, faces[1] * k) > BAND_FOLD:
            return "turn", None
        across = [(x + left[0] * d, y + left[1] * d) for d in (faces[0] + (faces[1] - faces[0]) * j / (BAND_ACROSS - 1.0) for j in range(BAND_ACROSS))]
        over = [(top, thick, sid) for sid, ring, hs, top, thick in leaves
                if any(s2r.inside(q, ring) and not any(math.hypot(q[0] - c[0], q[1] - c[1]) < rad for c, rad in hs) for q in across)]
        if not over:
            return "none", None
        mx, my = x + left[0] * middle, y + left[1] * middle
        head, roof = min((top(mx, my) - thick, sid) for top, thick, sid in over)
        foot = base + top_at(r)
        if abs(head - foot - BAND_LOW) < BAND_UNSURE:
            return "unsure", None
        return ("band", (head, foot, roof)) if head - foot >= BAND_LOW else ("none", None)

    def tightest_near(r, reach):
        """The radius of the tightest turn of the path within `reach` metres either side of row r."""
        k = abs(turn(r))
        for step in (1, -1):
            s0, j = row(r)[4], r
            for _ in range(len(walk)):
                j += step
                d = row(j)[4] - s0
                if closed:
                    d = (d + path.total / 2.0) % path.total - path.total / 2.0
                if abs(d) > reach or (not closed and (j <= 0 or j >= count - 1)):
                    break
                k = max(k, abs(turn(j)))
        return 1.0 / k if k > 1e-9 else float("inf")

    def along(r, ds):
        """The row about ds metres along the path from row r."""
        s0, step, j = row(r)[4], (1 if ds > 0 else -1), r
        for _ in range(len(walk)):
            j += step
            d = row(j)[4] - s0
            if closed:
                d = (d + path.total / 2.0) % path.total - path.total / 2.0
            if abs(d) >= abs(ds) or (not closed and (j <= 0 or j >= count - 1)):
                return j
        return j

    out = {"valid": bool(shape.isValid()) if not shape.isNull() else False, "solids": len(shape.Solids), "box": box_of(shape) if shape.Solids else (0,) * 6,
           "volume": sum(og.volume_of(s) for s in shape.Solids) / 1e9, "kind": kind, "glass": glass,
           "feet": [], "heads": [], "missing": [], "stray": [], "none": 0, "turns": 0, "near_edge": 0, "faces": [], "tight": 0}
    for i in range(n):
        for half in (False, True):
            if half and not closed and i == n - 1:
                continue
            r = min(i * per + (per // 2 if half else 0), len(walk) - 1)
            x, y, tx, ty, _s = row(r)
            left = (-ty, tx)
            mx, my = x + left[0] * middle, y + left[1] * middle
            here, got = state(r)
            key = lambda st: (st[0], st[1][2] if st[1] else None)  # noqa: E731  (a band up to another roof is another stretch: it steps there)
            if here == "unsure" or any(key(state(along(r, d))) != key((here, got)) for d in (-BAND_EDGE, -BAND_EDGE / 2.0, BAND_EDGE / 2.0, BAND_EDGE)):
                out["near_edge"] += 1
                continue
            col = column_of(shape, mx, my) if shape.Solids else None
            if here in ("none", "turn"):
                out["none" if here == "none" else "turns"] += 1
                if col is not None and col[0] - col[1] > 0.005:
                    out["stray"].append("(%.2f, %.2f)" % (mx, my))
                continue
            head, foot, roof = got
            if col is None:
                out["missing"].append("(%.2f, %.2f) under %s" % (mx, my, roof))
                continue
            out["feet"].append(col[1] - foot)
            out["heads"].append(col[0] - head)
            # its two faces half-way up, on the line square to the wall through its path; not within BAND_BEND_REACH of a
            # turn tighter than the band is wide (there the wall's base curve, fitted through points 0.2 m apart, leaves the
            # spec's own, and the band with it)
            if tightest_near(r, BAND_BEND_REACH) < max(abs(faces[0]), abs(faces[1])) + 0.05:
                out["tight"] += 1
                continue
            z = (foot + head) / 2.0
            reach = min(REACH, (faces[1] - faces[0]) / 2.0 - 0.005)
            lo = edge_between(shape, (x, y, z), (left[0], left[1], 0.0), faces[0], reach, inside_first=False)
            hi = edge_between(shape, (x, y, z), (left[0], left[1], 0.0), faces[1], reach, inside_first=True)
            if lo is not None and hi is not None:
                out["faces"].append((lo - faces[0], hi - faces[1]))
            else:
                out["missing"].append("(%.2f, %.2f): a face is not within %.3f m of where it should be" % (mx, my, reach))
    return out


MEASURES = {"wall": measure_wall, "floor": measure_floor, "chimney": measure_chimney, "roof": measure_roof, "band": measure_band}


# ------------------------------------------------------------------ the design
def shapes_of(doc):
    """{piece id: its solid in the building's own frame} for every object made from a records file."""
    out = {}
    building = next((o for o in doc.Objects if getattr(o, "IfcType", "") == "Building"), None)
    back = building.Placement.inverse() if building is not None else App.Placement()
    for o in doc.Objects:
        key = str(getattr(o, "MapPiece", "") or "")
        if not key or type(getattr(o, "Proxy", None)).__name__ in ("PlanCurve", "SacredFigure"):
            continue
        shape = o.Shape.copy()
        shape.Placement = back.multiply(shape.Placement)
        out[key] = og.baked(shape)
    return out


def built(records, only=None, join=True):
    """A records file (or its contents) built in a document of its own: (the document, {id: solid})."""
    data = records if isinstance(records, dict) else json.load(open(records, encoding="utf-8"))
    if only:
        by_id = {p["id"]: p for p in data["pieces"]}
        want, todo = set(), list(only)
        while todo:  # the pieces asked for and every piece they stand on or name (a band: its wall and its roofs, and theirs)
            key = todo.pop()
            if key in want or key not in by_id:
                continue
            want.add(key)
            params = by_id[key].get("params", {})
            todo.extend(params[link] for link in ("Base", "Wall") if params.get(link))
            todo.extend(list(params.get("Holes", [])) + list(params.get("Roofs", [])))
        data = dict(data, pieces=[p for p in data["pieces"] if p["id"] in want])
    doc = App.newDocument("SpecCheck")
    oi.import_built(doc, data, join)
    return doc, shapes_of(doc)


def gather(spec, shapes, only=None, without=(), answers=None):
    facts = {"pieces": {}, "missing": [], "without": [], "areas": {k: num(v) for k, v in spec.get("level_gross_areas_m2", {}).items()},
             "zones": {level: num(spec["structural_and_coordination"][key]) for level, key in (("main", "main_floor_zone_m"), ("mezzanine", "mezzanine_floor_zone_m"))
                       if key in spec.get("structural_and_coordination", {})},
             "levels": {k: num(v) for k, v in spec["frame"]["levels_m"].items()}, "kinds": {}, "meetings": {}}
    for level, row in ((answers or {}).get("floors") or {}).items():  # a level's slab thickness by Johny's answer
        facts["zones"].setdefault(level, float(row["thickness_m"]))
        facts.setdefault("zone_words", {})[level] = row.get("words", "")
    for key, (kind, said) in spec_pieces(spec, answers).items():
        if only and key not in only:
            continue
        if key in without:
            facts["without"].append(key)
            continue
        facts["kinds"][key] = kind
        shape = shapes.get(key)
        if shape is None or shape.isNull() or not shape.Solids:
            facts["missing"].append(key)
            if kind != "band":
                continue
            shape = Part.Shape()  # a band that came out empty is still walked: where it should stand, it is missing
        t0 = time.time()
        facts["pieces"][key] = MEASURES[kind](spec, said, shape)
        if shape.Solids:
            facts["pieces"][key]["plain"] = shape.Volume / 1e9  # FreeCAD's own measure, beside the adaptive one in "volume"
        facts["pieces"][key]["seconds"] = time.time() - t0
        if kind == "wall":
            facts["pieces"][key]["thickness"] = num(said["thickness_m"])
        if kind == "floor":
            facts["pieces"][key]["level"] = said["level"]
    for meeting in spec_meetings(spec)[1]:
        ids = [wid for wid, _which in meeting["ends"]]
        if all(wid in facts["pieces"] for wid in ids) and (not only or all(wid in only for wid in ids)) and all(wid in shapes for wid in meeting["passing"]):
            facts["meetings"][meeting["key"]] = measure_meeting(spec, meeting, shapes)
    return facts


# ------------------------------------------------------------------ the judgement
def judge(facts):
    oks, fails = [], []

    def ok(cond, msg):
        (oks if cond else fails).append(msg)

    pieces, kinds = facts["pieces"], facts["kinds"]
    of = lambda kind: [k for k in kinds if kinds[k] == kind and k in pieces]  # noqa: E731

    # H. whole
    broken = [k for k, p in pieces.items() if not p["valid"] or (p["solids"] != 1 and kinds[k] != "band")]
    ok(not facts["missing"] and not broken,
       "H the house is whole: %d walls, %d floors, %d roof shells and the chimney of the spec are each one valid solid%s (missing: %s; not valid: %s; left out on purpose and not looked at: %s)"
       % (len(of("wall")), len(of("floor")), len(of("roof")),
          "; %d bands to the roof, each one or more valid solids (one for each stretch under a roof)" % len(of("band")) if of("band") else "",
          ", ".join(facts["missing"]) or "none", ", ".join(broken) or "none", ", ".join(facts.get("without", [])) or "none"))

    # V. each solid's volume two ways. FreeCAD's own Volume gives a face a fixed number of points: a face that spans one long
    # spline (a joined wall's side left in one piece read 4 % short) or one that folds shows as a gap between the two
    apart = {k: p["plain"] / p["volume"] - 1.0 for k, p in pieces.items() if p.get("volume") and "plain" in p}
    far = sorted(k for k, v in apart.items() if abs(v) > PLAIN)
    ok(bool(apart) and not far,
       "V every solid measures the same two ways: FreeCAD's own Volume lies within %.2f %% of OCCT's adaptive measure on each of %d solids (allowed %.0f %%; further: %s)"
       % (100 * worst(apart.values()), len(apart), 100 * PLAIN, ", ".join("%s %+.2f %%" % (k, 100 * apart[k]) for k in far) or "none"))

    # W. walls
    walls = of("wall")
    if walls:
        face_off = [v for k in walls for pair in pieces[k]["faces"] for v in pair]
        top_off = [v for k in walls for v in pieces[k]["tops"]]
        lost = ["%s %s" % (k, text) for k in walls for text in pieces[k]["lost"]]
        bad = sorted({k for k in walls if worst([v for pair in pieces[k]["faces"] for v in pair]) > CLOSE})
        ok(not lost and not bad and face_off,
           "W faces: at %d points of %d wall paths both faces stand where the spec's rule puts them, within %.4f m (allowed %.2f); not measured: %d points on a bend tighter than the wall is thick, %d within reach of an end that meets other walls (off: %s; lost: %s)"
           % (len(face_off) // 2, len(walls), worst(face_off), CLOSE, sum(pieces[k]["tight"] for k in walls), sum(pieces[k].get("joined", 0) for k in walls),
              ", ".join(bad) or "none", "; ".join(lost[:3]) or "none"))
        bad = sorted({k for k in walls if worst(pieces[k]["tops"]) > CLOSE})
        ok(not lost and not bad and top_off,
           "W tops: at %d points the wall's top is at the spec's height or at its top-edge sample of that point, within %.4f m (allowed %.2f); %d points stand in an opening that runs to the top (off: %s; lost: %s)"
           % (len(top_off), worst(top_off), CLOSE, sum(pieces[k].get("open_top", 0) for k in walls), ", ".join(bad) or "none", "; ".join(lost[:3]) or "none"))

    # J. where walls end on each other
    meetings = facts.get("meetings", {})
    if meetings:
        asked = sum(m["asked"] for m in meetings.values())
        lost_m = {k: m["lost"] for k, m in meetings.items() if m["lost"] > m["allowed"]}
        shared_m = {k: m["shared"] for k, m in meetings.items() if m["shared"] > m["allowed"]}
        on_wall = {k: m for k, m in meetings.items() if m["passing"]}
        deep = {k: "%d of %d" % (m["wedge"], m["butt"]) for k, m in on_wall.items() if m["wedge"] > 0.6 * m["butt"] + 3}
        ok(asked > 0 and not lost_m and not shared_m and not deep,
           "J where walls end on each other: %d meeting points of %d wall ends; of %d places asked round them, %d of the spec's own walls lie in no wall and %d lie in two walls that end there (allowed at each point: 1 %% of its places, and the sliver between two ends that are not quite on one point); "
           "%d ends land on a passing wall and stop at its face: they share %d places with it where butt ends would share %d (lost at: %s; shared at: %s; too deep in a passing wall: %s)"
           % (len(meetings), sum(m["ends"] for m in meetings.values()), asked, sum(m["lost"] for m in meetings.values()), sum(m["shared"] for m in meetings.values()),
              len(on_wall), sum(m["wedge"] for m in on_wall.values()), sum(m["butt"] for m in on_wall.values()),
              "; ".join("%s (%d)" % kv for kv in lost_m.items()) or "none", "; ".join("%s (%d)" % kv for kv in shared_m.items()) or "none",
              "; ".join("%s (%s)" % kv for kv in deep.items()) or "none"))

    # O. openings
    openings = [(k, oid, o) for k in walls for oid, o in pieces[k]["openings"].items()]
    if openings:
        shut = ["%s on %s" % (oid, k) for k, oid, o in openings if not o["open"]]
        lost = ["%s on %s: %s" % (oid, k, text) for k, oid, o in openings for text in o["lost"]]
        jambs = [v for _k, _oid, o in openings for v in o["jambs"] if v is not None]
        bad = sorted({oid for _k, oid, o in openings if worst([v for v in o["jambs"] if v is not None]) > CLOSE})
        ok(not shut and not lost and not bad and jambs,
           "O jambs: %d openings are open at their middle, and their %d jambs stand half the spec's width either side of the foot of the spec's centre, along the wall's path, within %.4f m (allowed %.2f) (shut: %s; off: %s; lost: %s)"
           % (len(openings), len(jambs), worst(jambs), CLOSE, ", ".join(shut) or "none", ", ".join(bad) or "none", "; ".join(lost[:3]) or "none"))
        sills = [o["sill"] for _k, _oid, o in openings if o["sill"] is not None]
        heads = [o["head"] for _k, _oid, o in openings if o["head"] is not None]
        bad = sorted({oid for _k, oid, o in openings if (o["sill"] is not None and abs(o["sill"]) > CLOSE) or (o["head"] is not None and abs(o["head"]) > CLOSE) or o["to_floor"] is False})
        ok(not lost and not bad and heads,
           "O sills and heads: %d sills and %d heads are at the spec's heights, within %.4f m (allowed %.2f); %d openings with no sill are open down to the floor; %d run to their wall's top (off: %s; lost: %s)"
           % (len(sills), len(heads), worst(sills + heads), CLOSE, sum(1 for _k, _oid, o in openings if o["to_floor"]), sum(1 for _k, _oid, o in openings if o["head_at_top"]),
              ", ".join(bad) or "none", "; ".join(lost[:3]) or "none"))

    # F. floors
    for k in of("floor"):
        p = pieces[k]
        level = p["level"]
        zone = facts["zones"].get(level)
        thick = p["top"] - p["bottom"]
        area = p["volume"] / thick if thick > 0 else 0.0
        gross = facts["areas"].get(level)
        asked = {hid: h for hid, h in p["holes"].items() if h.get("cut")}  # the openings Johny asked for, not in the spec's gross area
        want = None if gross is None else gross - sum(math.pi * h["radius"] ** 2 for h in asked.values())
        holes_ok = all(h["open"] and all(v is not None and abs(v) <= CLOSE for v in h["rim"]) for h in p["holes"].values())
        ok(want is not None and abs(area - want) <= FLOOR_CLOSE and abs(p["top"] - facts["levels"][level]) < 1e-4 and (zone is None or abs(thick - zone) < 1e-4) and holes_ok,
           "F the %s floor: %.2f m² (the spec's gross area of that level: %s%s), its top at %.2f (the level: %.2f), %.2f m thick (%s); %d openings through it, their rims within %.4f m of their radius%s"
           % (level, area, "%.1f" % gross if gross is not None else "not stated",
              "".join(", less %s's %.2f m²" % (hid, math.pi * h["radius"] ** 2) for hid, h in asked.items()), p["top"], facts["levels"][level], thick,
              ("Johny's answer: %.2f" % zone if level in facts.get("zone_words", {}) else "the spec's floor zone: %.2f" % zone) if zone is not None else "the spec states no floor zone for this level",
              len(p["holes"]), worst([v for h in p["holes"].values() for v in h["rim"] if v is not None]),
              "".join("; %s, the chimney's own radius at the floor (%.3f m), by Johny's answer" % (hid, h["radius"]) for hid, h in asked.items())))

    # C. the chimney
    for k in of("chimney"):
        p = pieces[k]
        radii = [v for v in p["radii"] if v is not None]
        ok(len(radii) == len(p["radii"]) and worst(radii) <= CLOSE and abs(p["base"] - p["want_base"]) < 1e-4 and abs(p["top"] - p["want_top"]) < 1e-4,
           "C the chimney: its radius at %d places of the spec's profile within %.4f m (allowed %.2f), from %.2f to %.2f (the spec: %.2f to %.2f), %.3f m³"
           % (len(radii), worst(radii), CLOSE, p["base"], p["top"], p["want_base"], p["want_top"], p["volume"]))

    # R. roofs
    for k in of("roof"):
        p = pieces[k]
        read = [s for s in p["samples"] if s[4] is not None]
        gone = len(p["samples"]) - len(read)
        # a sample the spec's own expression does not meet is the spec against itself: named, not held against the roof
        own = [s for s in read if abs(s[5] - s[3]) > 0.02]
        held = [s for s in read if abs(s[5] - s[3]) <= 0.02]
        off = worst([s[4] - s[3] for s in held])
        ok(held and gone == 0 and off <= ROOF_CLOSE,
           "R %s samples: its top at %d of the spec's own eave, ridge and apex samples is within %.3f m of them (allowed %.2f); %d samples lie in a hole or outside its plan; %d where the spec's own expression is more than 0.02 m from its sample%s"
           % (k, len(held), off, ROOF_CLOSE, p["skipped"], len(own),
              "".join(" ((%.2f, %.2f): sample %.2f, expression %.3f, roof %.3f)" % (s[1], s[2], s[3], s[5], s[4]) for s in own[:2])))
        field = [f for f in p["field"] if f[2] is not None]
        ok(len(field) == len(p["field"]) and len(field) >= 100 and worst([f[2] - f[4] for f in field]) <= ROOF_CLOSE and worst([f[3] - p["thickness"] for f in field]) <= 0.002,
           "R %s field: at %d places of its plan its top is within %.3f m of the spec's expression (allowed %.2f) and it is %.2f m thick straight down within %.4f m"
           % (k, len(field), worst([f[2] - f[4] for f in field]), ROOF_CLOSE, p["thickness"], worst([f[3] - p["thickness"] for f in field])))
        holes_ok = all(h["rim_open"] and (h["centre_open"] or not h["centre_in_plan"]) for h in p["holes"].values())
        want = p["plan_area"] * p["thickness"]
        ok(holes_ok and p["outside"] == 0 and abs(p["volume"] / want - 1.0) <= 5e-4,
           "R %s plan: nothing of it over %s, nor 0.10 m outside its outline at %d places (%d found); it holds %.3f m³ (its plan %.3f m², worked out here from the outline and the round holes, times %.2f = %.3f)"
           % (k, " or ".join(sorted(p["holes"])) or "any hole (it has none)", p["outside_tried"], p["outside"], p["volume"], p["plan_area"], p["thickness"], want))

    # B. the bands between the walls' tops and the roofs (Johny's answer 5): as built, and as the other kind
    for k in of("band"):
        p = pieces[k]
        name = "%s as %s" % (k.split(" ")[0], "glass" if p["kind"] == "Glass" else "the wall carried up")
        ok(p["feet"] and not p["missing"] and not p["stray"] and worst(p["feet"]) <= CLOSE and worst(p["heads"]) <= ROOF_CLOSE,
           "B %s: at %d places it stands on its wall's top (within %.4f m) and reaches the underside of the lowest roof over it (within %.3f m; allowed %.2f and %.2f); "
           "at %d places no roof is over it or the underside comes down to the wall, and at %d the wall turns tighter than it can follow, and there is no band "
           "(a band where there is none: %s); %d places within %.2f m of where it starts or ends not looked at (missing: %s)"
           % (name, len(p["feet"]), worst(p["feet"]), worst(p["heads"]), CLOSE, ROOF_CLOSE, p["none"], p["turns"], ", ".join(p["stray"][:3]) or "none", p["near_edge"], BAND_EDGE,
              "; ".join(p["missing"][:3]) or "none"))
        ok(p["faces"] and not p["missing"] and worst([v for pair in p["faces"] for v in pair]) <= CLOSE,
           "B %s, its two faces: at %d places half-way up they stand where %s puts them, within %.4f m (allowed %.2f); %d places within 0.5 m of a bend tighter than it is wide not looked at"
           % (name, len(p["faces"]), "a pane of %.2f m on the wall's middle" % p["glass"] if p["kind"] == "Glass" else "the wall's own two faces",
              worst([v for pair in p["faces"] for v in pair]), CLOSE, p["tight"]))
    return oks, fails


# ------------------------------------------------------------------ forgeries: forged pieces, built and measured
def forged_builds(spec, records, answers=None):
    """(name, the check meant for it, the id of the piece (or the ids, with "butt" for walls built
    without their joints), the forged records) for each fault."""
    by_id = lambda data: {p["id"]: p for p in data["pieces"]}  # noqa: E731
    out = []

    def forge(name, expect, key, change):
        data = copy.deepcopy(records)
        change(by_id(data))
        out.append((name, expect, key, data))

    walls = [w["id"] for w in spec.get("2_curved_walls", [])]
    outer = next((w["id"] for w in spec["2_curved_walls"] if w.get("reference") == "outer_face" and not w.get("top_edge_xyz_m")), None)
    sampled = next((w["id"] for w in spec["2_curved_walls"] if w.get("top_edge_xyz_m") and w.get("reference") != "outer_face"), None)
    plain = next((w["id"] for w in spec["2_curved_walls"] if w.get("reference") == "centreline" and not any(o["wall"] == w["id"] for o in spec["3_openings"])), None)
    curvy = next((w["id"] for w in spec["2_curved_walls"] if w.get("reference") == "centreline" and w.get("closed")), None)  # a ring: far from its points' straight runs
    holed = next((w["id"] for w in spec["2_curved_walls"] if w.get("reference") == "centreline" and any(o["wall"] == w["id"] for o in spec["3_openings"])), None)
    roof = next((s["id"] for s in spec["4_roof_shells"] if any(p["id"] == s["id"] for p in records["pieces"]) and by_id(records)[s["id"]]["params"].get("Holes")), None)
    floor = next((p["id"] for p in records["pieces"] if p["type"] == "Slab" and p["params"].get("Holes")), None)
    if outer:
        forge("%s thickened outward, not inward" % outer, "W faces", outer, lambda p: p[outer]["params"].update(Align="Left" if p[outer]["params"]["Align"] == "Right" else "Right"))
        forge("%s 0.05 m thinner" % outer, "W faces", outer, lambda p: p[outer]["params"].update(Thickness=p[outer]["params"]["Thickness"] - 0.05))
        forge("%s 0.04 m lower" % outer, "W tops", outer, lambda p: p[outer]["params"].update(Height=p[outer]["params"]["Height"] - 0.04))
        if by_id(records)[outer]["params"].get("OpeningPositions"):
            forge("the first opening of %s 0.40 m further along" % outer, "O jambs", outer,
                  lambda p: p[outer]["params"].update(OpeningPositions=[p[outer]["params"]["OpeningPositions"][0] + 0.4] + p[outer]["params"]["OpeningPositions"][1:]))
            forge("the first opening of %s 0.10 m wider" % outer, "O jambs", outer,
                  lambda p: p[outer]["params"].update(OpeningWidths=[p[outer]["params"]["OpeningWidths"][0] + 0.1] + p[outer]["params"]["OpeningWidths"][1:]))
            forge("the last opening of %s 0.05 m lower at its head" % outer, "O sills and heads", outer,
                  lambda p: p[outer]["params"].update(OpeningHeights=p[outer]["params"]["OpeningHeights"][:-1] + [p[outer]["params"]["OpeningHeights"][-1] - 0.05]))
            forge("%s without its openings" % outer, "O jambs", outer,
                  lambda p: [p[outer]["params"].pop(n) for n in ("OpeningPositions", "OpeningWidths", "OpeningHeights", "OpeningSills", "OpeningShapes")])
    if sampled:
        forge("the top of %s 0.05 m higher all round" % sampled, "W tops", sampled, lambda p: p[sampled]["params"].update(TopHeights=[h + 0.05 for h in p[sampled]["params"]["TopHeights"]]))
        forge("the top of %s flat at its highest sample" % sampled, "W tops", sampled, lambda p: p[sampled]["params"].pop("TopHeights"))
    if plain:
        forge("%s standing left of its centreline" % plain, "W faces", plain, lambda p: p[plain]["params"].update(Align="Left"))
    if curvy:
        forge("%s on straight runs between its points" % curvy, "W faces", curvy, lambda p: p[p[curvy]["params"]["Base"]]["params"].update(Smooth=False))
    if holed:
        forge("the door of %s with a sill of 0.30 m" % holed, "O sills and heads", holed, lambda p: p[holed]["params"].update(OpeningSills=[0.3] + p[holed]["params"]["OpeningSills"][1:]))
    if floor:
        forge("the %s without its courtyards" % floor, "F the", floor, lambda p: p[floor]["params"].pop("Holes"))
        forge("the %s 0.05 m thicker" % floor, "F the", floor, lambda p: p[floor]["params"].update(Thickness=p[floor]["params"]["Thickness"] + 0.05))
    if any(p["id"] == "chimney" for p in records["pieces"]):
        forge("the chimney 0.05 m thinner at its second height", "C the chimney", "chimney",
              lambda p: p["chimney"]["params"].update(Profile=[p["chimney"]["params"]["Profile"][0], [p["chimney"]["params"]["Profile"][1][0] - 0.05, p["chimney"]["params"]["Profile"][1][1]]] + p["chimney"]["params"]["Profile"][2:]))
    if roof:
        forge("%s 0.05 m too high" % roof, "R %s samples" % roof, roof, lambda p: p[roof]["params"].update(Heights=[h + 0.05 for h in p[roof]["params"]["Heights"]]))
        forge("%s 0.03 m thinner" % roof, "R %s field" % roof, roof, lambda p: p[roof]["params"].update(Thickness=p[roof]["params"]["Thickness"] - 0.03))
        forge("%s without its holes" % roof, "R %s plan" % roof, roof, lambda p: p[roof]["params"].pop("Holes"))
        forge("%s with its grid one step to the east" % roof, "R %s field" % roof, roof,
              lambda p: p[roof]["params"].update(GridOrigin=[p[roof]["params"]["GridOrigin"][0] + p[roof]["params"]["GridStep"], p[roof]["params"]["GridOrigin"][1]]))
    # Johny's answers: the chimney's opening in a floor, the bands to the roof
    for level, cuts in ((answers or {}).get("floor_cuts") or {}).items():
        fid = "floor-" + level
        for cut in cuts:
            forge("the %s floor without %s, the chimney's opening" % (level, cut["id"]), "F the %s floor" % level, fid,
                  lambda p, fid=fid, cid=cut["id"]: p[fid]["params"].update(Holes=[h for h in p[fid]["params"]["Holes"] if h != cid]))
    band = next((p["id"] for p in records["pieces"] if p["type"] == "WallBand" and p["params"].get("Kind", "Glass") == "Glass"), None)
    if band:
        forge("%s under no roof" % band, "B %s as glass:" % band, band, lambda p: p[band]["params"].update(Roofs=[]))
        forge("%s under the first of its roofs only" % band, "B %s as glass:" % band, band, lambda p: p[band]["params"].update(Roofs=p[band]["params"]["Roofs"][:1]))
        forge("%s carried up as the wall, where glass is asked" % band, "B %s as glass, its two faces" % band, band, lambda p: p[band]["params"].update(Kind="Wall"))
        forge("%s with a pane of 0.20 m" % band, "B %s as glass, its two faces" % band, band, lambda p: p[band]["params"].update(Thickness=0.20))
    del walls
    meeting = next((m for m in spec_meetings(spec)[1] if len(m["ends"]) >= 2), None)
    if meeting:
        ids = sorted(wid for wid, _which in meeting["ends"])
        out.append(("%s with butt ends where they meet" % ", ".join(ids), "J where walls end on each other", tuple(ids) + ("butt",), copy.deepcopy(records)))
    # the longest wall that ends on another, built with each of its sides in one face (no long spline split)
    run = lambda wid: sum(math.dist(a, b) for a, b in zip(rows(by_wall[wid]["points_xy_m"]), rows(by_wall[wid]["points_xy_m"])[1:]))  # noqa: E731
    by_wall = {w["id"]: w for w in spec.get("2_curved_walls", [])}
    joined = [(run(wid), wid, m) for m in spec_meetings(spec)[1] for wid, _which in m["ends"]]
    if joined:
        length, long_wall, at = max(joined, key=lambda row: row[0])
        ids = sorted({wid for wid, _which in at["ends"]} | set(at["passing"]))
        out.append(("%s, %.1f m long and joined at an end, with each of its sides in one face" % (long_wall, length), "V every solid measures the same two ways",
                    tuple(ids) + ("whole",), copy.deepcopy(records)))
    return out


def other_kind(spec, answers, facts):
    """The bands built again as the other kind (the wall carried up where the design has glass,
    or the other way), apart from the design, through the same import, and measured the same
    way into facts: Johny's answer 5 asks for both, to switch between and compare."""
    band = (answers or {}).get("bands") or {}
    if not band.get("walls"):
        return
    flipped = copy.deepcopy(answers)
    flipped["bands"]["kind"] = "Wall" if str(band.get("kind", "Glass")) == "Glass" else "Glass"
    records, _notes = s2r.convert(spec, answers=flipped)
    ids = [wid + ".band" for wid in flipped["bands"]["walls"]]
    doc, shapes = built(records, only=ids)
    try:
        alt = gather(spec, shapes, only=ids, answers=flipped)
    finally:
        App.closeDocument(doc.Name)
    for k in ids:
        name = "%s as %s" % (k, flipped["bands"]["kind"])
        if k in alt["pieces"]:
            facts["pieces"][name] = alt["pieces"][k]
            facts["kinds"][name] = "band"
        if k in alt["missing"]:
            facts["missing"].append(name)


def self_test(spec, facts, design_floors, answers=None):
    records, _notes = s2r.convert(spec, floors=design_floors, answers=answers)
    caught, forged = 0, forged_builds(spec, records, answers)
    for name, expect, key, data in forged:
        doc = None
        try:
            keys = [k for k in key if k not in ("butt", "whole")] if isinstance(key, tuple) else [key]
            split = og.pieces_of
            if isinstance(key, tuple) and "whole" in key:
                og.pieces_of = lambda edge, span=16: [og.baked(edge)]  # forged: no long spline is split, so each side of a wall is one face
            try:
                doc, shapes = built(data, only=keys, join=not (isinstance(key, tuple) and "butt" in key))
            finally:
                og.pieces_of = split
            g = copy.deepcopy(facts)
            one = gather(spec, shapes, only=keys, answers=answers)
            for k in keys:
                g["pieces"].pop(k, None)
            g["pieces"].update(one["pieces"])
            g["missing"] = [k for k in g["missing"] if k not in keys] + one["missing"]
            g["kinds"].update(one["kinds"])
            g["meetings"].update(one["meetings"])
        finally:
            if doc is not None:
                App.closeDocument(doc.Name)
        _o, f = judge(g)
        hit = next((m for m in f if m.startswith(expect)), None)
        if hit:
            say("SELF-TEST OK   %s is rejected (%s)" % (name, hit[:170]))
        elif f:
            say("SELF-TEST FAIL %s is rejected, but not by the check meant for it (%s...): %s" % (name, expect, f[0][:170]))
        else:
            say("SELF-TEST FAIL %s PASSED the check" % name)
        caught += bool(hit)
    say("check_spec --self-test %s (%d/%d forged pieces rejected)" % ("OK" if caught == len(forged) and forged else "FAILED", caught, len(forged)))
    return caught == len(forged) and bool(forged)


def run(spec_path=None, design=None, test=None):
    rest = sys.argv[sys.argv.index("--pass") + 1:] if "--pass" in sys.argv else []
    rest_files = [a for a in rest if not a.startswith("--")]
    spec_path = spec_path or (rest_files[0] if rest_files else os.environ.get("SPEC_CHECK_SPEC"))
    design = design or (rest_files[1] if len(rest_files) > 1 else os.environ.get("SPEC_CHECK_DESIGN"))
    if test is None:
        test = "--self-test" in sys.argv or os.environ.get("SPEC_CHECK_SELF_TEST") == "1"
    without = next((a.split("=", 1)[1] for a in rest if a.startswith("--without=")), os.environ.get("SPEC_CHECK_WITHOUT", ""))
    without = [k.strip() for k in without.split(",") if k.strip()]
    answers_path = next((a.split("=", 1)[1] for a in rest if a.startswith("--answers=")), os.environ.get("SPEC_CHECK_ANSWERS", ""))
    if not spec_path or not design:
        say("check_spec: give the spec and the design (freecadcmd check_spec.py --pass <spec.json> <design.FCStd | records.json> [--answers=<.answers.json>] [--self-test])")
        return False
    with open(spec_path, encoding="utf-8") as fh:
        spec = json.load(fh)
    answers = None
    if answers_path:  # what Johny decided after the spec, as spec_to_records.py read it
        with open(answers_path, encoding="utf-8") as fh:
            answers = json.load(fh)
    t0 = time.time()
    doc, opened = None, False
    if design.lower().endswith(".json"):
        doc, shapes = built(design)
    else:
        doc = next((d for d in App.listDocuments().values() if os.path.normcase(d.FileName or "") == os.path.normcase(os.path.abspath(design))), None)
        if doc is None:
            doc, opened = App.openDocument(os.path.abspath(design)), True
        shapes = shapes_of(doc)
    try:
        facts = gather(spec, shapes, without=without, answers=answers)
    finally:
        if doc is not None and (opened or design.lower().endswith(".json")):
            App.closeDocument(doc.Name)
    other_kind(spec, answers, facts)
    say("check_spec: %s against %s%s: %d pieces measured in %.0f s" % (os.path.basename(design), os.path.basename(spec_path),
                                                                       " and %s" % os.path.basename(answers_path) if answers else "", len(facts["pieces"]), time.time() - t0))
    for key, p in facts["pieces"].items():
        b = p["box"]
        say("   %-16s %-8s %9.3f m³  x %7.2f..%7.2f  y %7.2f..%7.2f  z %6.2f..%6.2f  (%.0f s)%s"
            % (key, facts["kinds"][key], p["volume"], b[0], b[1], b[2], b[3], b[4], b[5], p.get("seconds", 0.0), "  %d openings" % len(p["openings"]) if p.get("openings") else ""))
    oks, fails = judge(facts)
    for m in oks:
        say("OK   " + m)
    for m in fails:
        say("FAIL " + m)
    if fails:
        say("check_spec FAILED (%d of %d)" % (len(fails), len(oks) + len(fails)))
        return False
    say("check_spec OK (%d checks)" % len(oks))
    if not test:
        return True
    floors = {p["level"]: round(p["top"] - p["bottom"], 6) for k, p in facts["pieces"].items() if facts["kinds"][k] == "floor" and p["level"] not in facts["zones"]}
    return self_test(spec, facts, floors, answers)


if __name__ in ("__main__", "check_spec") and not getattr(sys, "_organic_check_spec_ran", False):
    sys._organic_check_spec_ran = True
    result = run()
    if not App.GuiUp:
        sys.exit(0 if result else 1)
