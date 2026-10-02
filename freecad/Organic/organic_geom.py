# -*- coding: utf-8 -*-
"""Organic: geometry kernels. Parameters are in metres; the shapes are in FreeCAD's millimetres.

Every kernel returns a closed Part solid (or a compound of solids), so the results take
booleans, report volumes, and export to IFC and GLB like any Part solid.

Ported from this repository's plugin-eco (walls, leaf shells, organic buildings, vaults,
minimal surfaces) and plugin-hagia-sophia (arches, domes). Those build display meshes with
a copied, not offset, underside; here every thickness is a true offset and every result is
a closed solid.
"""

import math

import FreeCAD as App
import Part

MM = 1000.0
Z = App.Vector(0, 0, 1)
Y = App.Vector(0, 1, 0)
BIG = 1.0e6  # mm: 1 km, for trimming boxes
# A shaped wall top is cut by ruled faces of at most this many stations each. At 16, OCCT read
# a wave-topped arc wall's volume up to 0.18 % off, and differently for each direction the arc
# starts in; at 8 it reads the closed form (t L (H + rise/2)) to four decimals in every direction.
TOP_PIECE_STATIONS = 8


def V(x, y, z=0.0):
    """A point given in metres, as FreeCAD's millimetres."""
    return App.Vector(x * MM, y * MM, z * MM)


def spline(points, closed=False, parameters=None):
    """An interpolating B-spline edge through points (mm).

    Two splines through corresponding points with the same parameters correspond parameter
    for parameter, so a ruled surface between them does not twist.
    """
    pts = list(points)
    if closed and (pts[0] - pts[-1]).Length < 1e-6:
        pts = pts[:-1]
    c = Part.BSplineCurve()
    if parameters is None:
        c.interpolate(Points=pts, PeriodicFlag=closed)
    else:
        c.interpolate(Points=pts, Parameters=list(parameters), PeriodicFlag=closed)
    return c.toShape()


def pieces_of(edge, span=16):
    """A B-spline edge of many spans as several edges.

    OCCT integrates areas and volumes along each edge with a fixed number of points, so a
    face bounded by one spline of hundreds of spans reports its area percent off, and a
    solid built on it its volume: a 0.45 m wall on a lobed ring read 43.4 m³ against its
    63.0 m³. Split into edges of at most `span` spans, the same shape reads true."""
    c = edge.Curve
    if not isinstance(c, Part.BSplineCurve) or c.NbPoles <= 2 * span:
        return [edge]
    n = int(math.ceil(c.NbPoles / float(span)))
    u0, u1 = edge.FirstParameter, edge.LastParameter
    return list(edge.split([u0 + (u1 - u0) * k / n for k in range(1, n)]).Edges)


def wire_of(edges):
    """A wire through edges, long splines split (see pieces_of), for making faces."""
    out = []
    for e in edges if isinstance(edges, (list, tuple)) else [edges]:
        out.extend(pieces_of(e))
    return Part.Wire(Part.__sortEdges__(out))


def solid_of(shape):
    """The single solid of a boolean result, or a compound of its solids."""
    solids = shape.Solids
    if len(solids) == 1:
        return solids[0]
    if not solids:
        raise ValueError("the construction produced no solid")
    return Part.makeCompound(solids)


def refined(solid):
    """The solid with the seams its booleans left merged away. OCCT's merge can give up on a
    solid that is sound (a wave-topped wall did, 116 m from the origin and turned 30°): the
    solid is then kept as it is, seams and all."""
    try:
        merged = solid.removeSplitter()
        if merged.isValid() and len(merged.Solids) == len(solid.Solids):
            return solid_of(merged)
    except Part.OCCError:
        pass
    return solid_of(solid)


def fuse_all(shapes):
    shapes = [s for s in shapes if s is not None]
    return shapes[0] if len(shapes) == 1 else shapes[0].fuse(shapes[1:])


def half_plane_xz(z_min_mm=0.0, x_min_mm=-BIG):
    """A large rectangle in the XZ plane holding z >= z_min and x >= x_min."""
    return Part.Face(Part.makePolygon([
        App.Vector(x_min_mm, 0, z_min_mm), App.Vector(BIG, 0, z_min_mm),
        App.Vector(BIG, 0, BIG), App.Vector(x_min_mm, 0, BIG), App.Vector(x_min_mm, 0, z_min_mm)]))


def face_of(shape):
    faces = shape.Faces
    if not faces:
        raise ValueError("the profile vanished")
    return faces[0] if len(faces) == 1 else Part.makeCompound(faces)


def prism_of(face_xy):
    """A tall prism over a plan face, for trimming shells to an outline."""
    p = face_xy.copy()
    p.translate(App.Vector(0, 0, -BIG / 2 - p.BoundBox.ZMin))
    return p.extrude(App.Vector(0, 0, BIG))


def smoothstep(x):
    t = max(0.0, min(1.0, x))
    return t * t * (3 - 2 * t)


def thicken_surface(face, depth_mm, overlap_mm=0.0):
    """A solid under a surface: its normal offset where OCCT manages it (as NURBS: offset
    surfaces defeat booleans), else a vertical extrusion. With overlap, the solid starts
    that far below the surface, so ribs made this way bite into the shell above them."""
    if overlap_mm:
        face = face.copy()
        face.translate(App.Vector(0, 0, -overlap_mm))
    try:
        sign = -1.0 if face.normalAt(0.5, 0.5).z > 0 else 1.0
        slab = face.makeOffsetShape(sign * depth_mm, 0.01, fill=True)
        if slab.Solids and slab.Solids[0].isValid() and slab.Solids[0].Volume > 0:
            return slab.Solids[0].toNurbs().Solids[0]
    except Exception:
        pass
    return face.extrude(App.Vector(0, 0, -depth_mm))


def surface_from_grid(grid):
    """A B-spline surface interpolating a rectangular grid of points (mm)."""
    s = Part.BSplineSurface()
    s.interpolate(grid)
    return s.toShape()


# ---------------------------------------------------------------- offsets
# Part.OffsetCurve edges make faces that OCCT's booleans treat as self-intersecting: a cut or
# a common on them silently does nothing. Offsets here are exact lines and circles, or
# B-splines interpolated through offset points at the base curve's own parameters.
def offset_edge(edge, d_mm, normal, closed=False, samples=None):
    """The edge offset by d towards tangent x normal (the convention of Part.OffsetCurve)."""
    if abs(d_mm) < 1e-9:
        return edge.copy()
    c = edge.Curve
    u0, u1 = edge.FirstParameter, edge.LastParameter
    if isinstance(c, (Part.Line, Part.LineSegment)):
        p0, p1 = edge.valueAt(u0), edge.valueAt(u1)
        n = (p1 - p0).cross(normal)
        n.normalize()
        return Part.LineSegment(p0 + n * d_mm, p1 + n * d_mm).toShape()
    if isinstance(c, Part.Circle) and abs(abs(c.Axis.dot(normal)) - 1) < 1e-9:
        c2 = c.copy()
        # tangent x normal points away from the centre when the circle turns about normal
        c2.Radius = c.Radius + d_mm if c.Axis.dot(normal) > 0 else c.Radius - d_mm
        if c2.Radius <= 0:
            raise ValueError("the offset passes the circle's centre")
        return Part.Edge(c2, u0, u1)
    n = samples or max(64, int(math.ceil(edge.Length / 100.0)))  # a point every 0.1 m
    params = [u0 + (u1 - u0) * i / n for i in range(n + 1)]
    pts = []
    for u in params[:-1] if closed else params:
        tan = edge.tangentAt(u)
        off = tan.cross(normal)
        off.normalize()
        pts.append(edge.valueAt(u) + off * d_mm)
    return spline(pts, closed=closed, parameters=params)


# ---------------------------------------------------------------- plan curves
def plan_edge(shape, step_m=0.2):
    """One smooth horizontal edge along a base curve (edge, wire, sketch) and whether it is
    closed. A single horizontal edge is kept exactly. Anything else is fitted, through points
    every step_m of arc length, with one B-spline at the height of its first point."""
    edges = shape.Edges
    if not edges:
        raise ValueError("the base curve has no edges")
    z0 = edges[0].valueAt(edges[0].FirstParameter).z
    if len(edges) == 1:
        e = edges[0]
        if all(abs(p.z - z0) < 1e-6 for p in e.discretize(9)):
            return e, e.isClosed()
    wire = Part.Wire(Part.__sortEdges__(edges))
    closed = wire.isClosed()
    n = max(24, int(math.ceil(wire.Length / (step_m * MM))))
    pts = [App.Vector(p.x, p.y, z0) for p in wire.discretize(Number=n + 1)]
    return spline(pts, closed=closed), closed


class WirePath:
    """A closed plan outline that has corners (a polygon, a star, a vesica, a seed of life),
    walked by arc length. It answers what the wall kernels ask of an edge (Length, valueAt,
    tangentAt, curvatureAt, with the parameter the distance along it in mm), so a wall keeps
    the outline's true lines, arcs and corners; fitting one spline through a corner rounds it
    and folds the wall's offsets there."""

    def __init__(self, wire):
        self.wire = wire
        self.parts, at = [], 0.0
        for e in wire.OrderedEdges:
            self.parts.append((e, e.Orientation != "Reversed", at))
            at += e.Length
        self.Length = at
        self.FirstParameter, self.LastParameter = 0.0, at

    def _at(self, s):
        s = s % self.Length if self.wire.isClosed() else max(0.0, min(self.Length, s))
        e, forward, start = next(p for p in reversed(self.parts) if s >= p[2] - 1e-9)
        along = max(0.0, min(e.Length, s - start))
        return e, e.getParameterByLength(along if forward else e.Length - along), forward

    def getParameterByLength(self, s):
        return s

    def valueAt(self, s):
        e, u, _forward = self._at(s)
        return e.valueAt(u)

    def tangentAt(self, s):
        e, u, forward = self._at(s)
        t = e.tangentAt(u)
        return t if forward else t * -1.0

    def curvatureAt(self, s):
        e, u, _forward = self._at(s)
        return e.curvatureAt(u)

    def isClosed(self):
        return self.wire.isClosed()

    def discretize(self, Number=97):
        return self.wire.discretize(Number=Number)


def has_corners(wire, degrees=2.0):
    """Whether a wire's edges meet anywhere at an angle (more than `degrees`)."""
    edges = wire.OrderedEdges
    if len(edges) < 2:
        return False
    ends = []
    for e in edges:
        forward = e.Orientation != "Reversed"
        a, b = e.tangentAt(e.FirstParameter), e.tangentAt(e.LastParameter)
        ends.append((a, b) if forward else (b * -1.0, a * -1.0))
    joints = list(zip(ends, ends[1:] + (ends[:1] if wire.isClosed() else [])))
    return any(a[1].getAngle(b[0]) > math.radians(degrees) for a, b in joints)


def plan_path(shape, step_m=0.2):
    """A base curve for a wall: plan_edge's one smooth edge, or, for a closed outline with
    corners, the outline itself as a WirePath. Returns (edge or WirePath, closed)."""
    edges = shape.Edges
    if len(edges) > 1:
        wire = Part.Wire(Part.__sortEdges__(edges))
        if wire.isClosed() and has_corners(wire):
            return WirePath(wire), True
    return plan_edge(shape, step_m)


def face_offset(face, d_mm):
    """A plan face grown by d (shrunk if negative), its corners kept as corners."""
    if abs(d_mm) < 1e-9:
        return face
    faces = face.makeOffset2D(d_mm, 2).Faces
    if not faces:
        raise ValueError("the offset of %.3f m left nothing" % (d_mm / MM))
    return max(faces, key=lambda f: f.Area)


def arc_curve(radius_m, angle_deg, start_deg=0.0):
    """A circular arc in plan about the origin (a full circle at 360°)."""
    if angle_deg >= 359.999:
        return Part.makeCircle(radius_m * MM, App.Vector(), Z)
    return Part.makeCircle(radius_m * MM, App.Vector(), Z, start_deg, start_deg + angle_deg)


def s_curve(length_m, amplitude_m, waves=1.0, samples=96):
    """A sine curve in plan along +X: y = A sin(2π waves x / L)."""
    pts = [V(length_m * i / samples, amplitude_m * math.sin(2 * math.pi * waves * i / samples)) for i in range(samples + 1)]
    return spline(pts)


def through_points(points_m, closed=False):
    """A smooth plan curve through control points [(x, y), ...] in metres (a smooth wall's
    controls: the B-spline stands in for plugin-eco's Catmull-Rom)."""
    return spline([V(x, y) for x, y in points_m], closed=closed)


def rotate_xy(p, deg, about=(0.0, 0.0)):
    a = math.radians(deg)
    x, y = p[0] - about[0], p[1] - about[1]
    return (about[0] + x * math.cos(a) - y * math.sin(a), about[1] + x * math.sin(a) + y * math.cos(a))


def perimeter_points(form, radius_m=8.0, lobes=5, depth=0.35, turn_deg=0.0):
    """plugin-eco's organic-building perimeters (eco-organic-plan.ts), as plan points in metres.

    lobed r(θ) = R (1 - d/2 + (d/2) cos(n θ)); oval 1.2R x 0.75R; leaf x = 1.1R cos t,
    y = 0.55R sin t (1 - 0.35 cos t); shell: a spiral r = R (0.25 + 0.75 u) over 1.15 + d turns;
    fit: the circle R.
    """
    pts = []
    if form == "Oval":
        pts = [(radius_m * 1.2 * math.cos(2 * math.pi * i / 36), radius_m * 0.75 * math.sin(2 * math.pi * i / 36)) for i in range(36)]
    elif form == "Leaf":
        for i in range(40):
            t = 2 * math.pi * i / 40
            pts.append((1.1 * radius_m * math.cos(t), 0.55 * radius_m * math.sin(t) * (1 - 0.35 * math.cos(t))))
    elif form == "Shell":
        turns = 1.15 + depth
        for i in range(48):
            u = i / 47
            a = 2 * math.pi * turns * u
            r = radius_m * (0.25 + 0.75 * u)
            pts.append((r * math.cos(a), r * math.sin(a)))
    elif form == "Fit":
        pts = [(radius_m * math.cos(2 * math.pi * i / 40), radius_m * math.sin(2 * math.pi * i / 40)) for i in range(40)]
    else:
        n = 48 if lobes <= 6 else 8 * int(lobes)
        for i in range(n):
            a = 2 * math.pi * i / n
            r = radius_m * (1 - depth * 0.5 + depth * 0.5 * math.cos(a * lobes))
            pts.append((r * math.cos(a), r * math.sin(a)))
    return [rotate_xy(p, turn_deg) for p in pts]


def lobed_curve(radius_m, lobes, depth, rotation_deg=0.0):
    """A closed lobed plan (plugin-eco's lobed perimeter)."""
    return through_points(perimeter_points("Lobed", radius_m, lobes, depth, rotation_deg), closed=True)


def ring_centroid(pts):
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
        c = x0 * y1 - x1 * y0
        a += c
        cx += (x0 + x1) * c
        cy += (y0 + y1) * c
    if abs(a) < 1e-12:
        return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
    return (cx / (3 * a), cy / (3 * a))


def inset_ring(pts, inset_m):
    """plugin-eco's insetRing: each point moved toward the centroid by inset (not an offset)."""
    if inset_m <= 0:
        return list(pts)
    c = ring_centroid(pts)
    out = []
    for x, y in pts:
        dx, dy = x - c[0], y - c[1]
        ln = math.hypot(dx, dy) or 1.0
        s = max(0.05, (ln - inset_m) / ln)
        out.append((c[0] + dx * s, c[1] + dy * s))
    return out


def point_in_ring(x, y, pts):
    inside = False
    for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            inside = not inside
    return inside


def dist_to_ring(x, y, pts):
    best = float("inf")
    for (ax, ay), (bx, by) in zip(pts, pts[1:] + pts[:1]):
        ex, ey = bx - ax, by - ay
        t = max(0.0, min(1.0, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey or 1.0)))
        best = min(best, math.hypot(x - ax - t * ex, y - ay - t * ey))
    return best


def pole_of_inaccessibility(pts, grid=24):
    """plugin-eco's grid search for the point inside furthest from the ring."""
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    best, best_d = ring_centroid(pts), -1.0
    for i in range(grid + 1):
        for j in range(grid + 1):
            x = min(xs) + (max(xs) - min(xs)) * i / grid
            y = min(ys) + (max(ys) - min(ys)) * j / grid
            if point_in_ring(x, y, pts):
                d = dist_to_ring(x, y, pts)
                if d > best_d:
                    best, best_d = (x, y), d
    return best


def bearing_of(frm, to):
    """0 = north (+Y), 90 = east (+X)."""
    return math.degrees(math.atan2(to[0] - frm[0], to[1] - frm[1])) % 360.0


def along_for_bearing(edge, pole_xy, bearing_deg, samples=240):
    """The arc length (m) along a closed wall centreline where its bearing from the pole is
    nearest bearing_deg (plugin-eco's alongForBearing, on the true curve)."""
    best, best_diff = 0.0, 999.0
    length = edge.Length
    for i in range(samples):
        s = length * (i + 0.5) / samples
        p = edge.valueAt(edge.getParameterByLength(s))
        d = abs((bearing_of(pole_xy, (p.x / MM, p.y / MM)) - bearing_deg + 180.0) % 360.0 - 180.0)
        if d < best_diff:
            best, best_diff = s / MM, d
    return best


def golden_spiral(start_radius_m, turns, samples_per_turn=48):
    """A golden spiral in plan, r = a φ^(2θ/π): a quarter turn grows it by φ."""
    phi = (1 + 5 ** 0.5) / 2
    n = max(8, int(turns * samples_per_turn))
    pts = []
    for i in range(n + 1):
        th = 2 * math.pi * turns * i / n
        r = start_radius_m * phi ** (2 * th / math.pi)
        pts.append(V(r * math.cos(th), r * math.sin(th)))
    return spline(pts)


def log_spiral(start_radius_m, turns, pitch=1.2, samples_per_turn=48):
    """plugin-geometry's log spiral: r = a e^(bθ), b = ln(pitch) / (π/2)."""
    b = math.log(pitch) / (math.pi / 2)
    n = max(8, int(turns * samples_per_turn))
    pts = []
    for i in range(n + 1):
        th = 2 * math.pi * turns * i / n
        r = start_radius_m * math.exp(b * th)
        pts.append(V(r * math.cos(th), r * math.sin(th)))
    return spline(pts)


def vesica_curve(radius_m):
    """The vesica piscis: the lens shared by two circles of radius R whose centres are R apart."""
    r = radius_m * MM
    h = r * math.sqrt(3) / 2
    top, bottom = App.Vector(0, h, 0), App.Vector(0, -h, 0)
    right = Part.Arc(bottom, App.Vector(r / 2, 0, 0), top).toShape()
    left = Part.Arc(top, App.Vector(-r / 2, 0, 0), bottom).toShape()
    return Part.Wire([right, left])


def region_offset(closed_edge, d_mm):
    """The face a closed plan curve encloses, grown by d (shrunk if negative).

    OCCT's own 2D offset removes the loops a plain offset makes where the curve bends
    tighter than d (between a lobed plan's lobes), then the result is taken to NURBS,
    because offset curves defeat booleans."""
    face = Part.Face(wire_of(closed_edge))
    if abs(d_mm) < 1e-9:
        return face
    grown = face.makeOffset2D(d_mm, 0)
    faces = grown.toNurbs().Faces
    if not faces:
        raise ValueError("the offset of %.3f m left nothing" % (d_mm / MM))
    return max(faces, key=lambda f: f.Area)


def is_ccw(closed_edge):
    pts = closed_edge.discretize(Number=97)[:-1]
    return sum(a.x * b.y - b.x * a.y for a, b in zip(pts, pts[1:] + pts[:1])) > 0


# ---------------------------------------------------------------- walls
def _side(edge, d_left_mm, closed=False):
    """The curve offset d to the left of the edge's direction."""
    return offset_edge(edge, -d_left_mm, Z, closed)


def _stations(edge, closed, count):
    """Arc-length stations along the edge: (parameter, fraction of length)."""
    length = edge.Length
    n = count if closed else count + 1
    return [(edge.getParameterByLength(min(length, i / count * length)), i / count) for i in range(n)]


def wall_sides(align, thickness_mm):
    """The left offsets (mm) of a wall's two faces, for a centreline alignment."""
    if align == "Left":
        return 0.0, thickness_mm
    if align == "Right":
        return -thickness_mm, 0.0
    return -thickness_mm / 2, thickness_mm / 2


def top_height(kind, height_m, rise_m, waves, f):
    """Wall top above its base at a fraction f of the centreline's length (metres)."""
    if kind == "Arch":
        return height_m + rise_m * math.sin(math.pi * f)
    if kind == "Wave":
        return height_m + rise_m * 0.5 * (1 - math.cos(2 * math.pi * max(1, int(waves)) * f))
    if kind == "Slope":
        return height_m + rise_m * f
    return height_m


def wall_shape(edge, closed, thickness_m, height_m, align="Center", top="Flat", top_rise_m=0.0,
               top_waves=1, openings=(), base_z_m=0.0, foundation_m=0.0):
    """A wall of constant thickness on a horizontal centreline, with a shaped top and openings.

    The plan is the band between the two offset curves (exact offsets of the centreline), so
    a curved wall has true concentric faces. It is extruded from the foundation to its
    highest point, and a shaped top is cut by a ruled surface through the top line.
    Openings are measured from the wall's base (base_z_m), not from the foundation.
    """
    t = thickness_m * MM
    z0 = edge.valueAt(edge.FirstParameter).z
    d1, d2 = wall_sides(align, t)
    if isinstance(edge, WirePath):
        # an outline with corners: the band between its two true offsets, corners kept
        face = Part.Face(edge.wire)
        sgn = 1.0 if is_ccw(edge) else -1.0
        fa, fb = face_offset(face, -sgn * d1), face_offset(face, -sgn * d2)
        big, small = (fa, fb) if fa.Area > fb.Area else (fb, fa)
        band = face_of(big.cut(small))
        if top != "Flat" and abs(top_rise_m) > 1e-9:
            App.Console.PrintWarning("Organic: a shaped wall top needs a smooth base curve; this one has corners, so its top is flat\n")
            top = "Flat"
    elif closed:
        fa = Part.Face(wire_of(_side(edge, d1, closed)))
        fb = Part.Face(wire_of(_side(edge, d2, closed)))
        if not (fa.isValid() and fb.isValid()):
            # an offset folded where the curve bends tighter than half the wall:
            # OCCT's region offset removes the loops (left of a counter-clockwise ring is inside)
            sgn = 1.0 if is_ccw(edge) else -1.0
            fa, fb = region_offset(edge, -sgn * d1), region_offset(edge, -sgn * d2)
        big, small = (fa, fb) if fa.Area > fb.Area else (fb, fa)
        band = face_of(big.cut(small))
    else:
        a, b = _side(edge, d1, closed), _side(edge, d2, closed)
        pa0, pa1 = a.valueAt(a.FirstParameter), a.valueAt(a.LastParameter)
        pb0, pb1 = b.valueAt(b.FirstParameter), b.valueAt(b.LastParameter)
        band = Part.Face(wire_of([a, Part.LineSegment(pa1, pb1).toShape(), b, Part.LineSegment(pb0, pa0).toShape()]))
    band.translate(App.Vector(0, 0, -foundation_m * MM))
    peak = max(height_m, height_m + top_rise_m) if top != "Flat" else height_m
    wall = band.extrude(App.Vector(0, 0, (peak + foundation_m) * MM))
    if top != "Flat" and abs(top_rise_m) > 1e-9:
        margin = t + 0.5 * MM
        count = max(48, int(math.ceil(edge.Length / (0.25 * MM))))
        st = _stations(edge, closed, count)
        rows = [[], []]
        for u, f in st:
            p, tan = edge.valueAt(u), edge.tangentAt(u)
            left = Z.cross(App.Vector(tan.x, tan.y, 0))
            left.normalize()
            z = z0 + top_height(top, height_m, top_rise_m, top_waves, f) * MM
            for row, d in zip(rows, (d1 - margin, d2 + margin)):
                q = p + left * d
                row.append(App.Vector(q.x, q.y, z))
        params = [f for _u, f in st] + ([1.0] if closed else [])
        # both top lines split at the same parameters, so the ruled faces pair up and each
        # stays short enough for OCCT to measure (see pieces_of and TOP_PIECE_STATIONS)
        n = max(1, int(math.ceil(len(st) / float(TOP_PIECE_STATIONS))))
        cuts = [k / n for k in range(1, n)]
        e0, e1 = spline(rows[0], closed, params), spline(rows[1], closed, params)
        w0 = Part.Wire(e0.split(cuts).Edges) if cuts else Part.Wire(e0)
        w1 = Part.Wire(e1.split(cuts).Edges) if cuts else Part.Wire(e1)
        top_face = Part.makeRuledSurface(w0, w1)
        wall = solid_of(wall.cut(top_face.extrude(App.Vector(0, 0, BIG))))
    for o in openings:
        wall = solid_of(wall.cut(opening_void(edge, closed, t, d1, d2, **o)))
    wall.translate(App.Vector(0, 0, base_z_m * MM))
    return refined(wall)


def opening_outline(width_m, height_m, sill_m, shape="Arch"):
    """An opening's outline in (along, up) metres: straight runs, arcs, and a closing run."""
    w, h, s = width_m, height_m, sill_m
    if shape == "Arch":
        spring = max(s, s + h - w / 2)
        return [(-w / 2, s), (w / 2, s), (w / 2, spring)], [((w / 2, spring), (0.0, spring + w / 2), (-w / 2, spring))], [(-w / 2, spring)]
    if shape == "Pointed":
        spring = max(s, s + h - w * math.sqrt(3) / 2)
        c30, s30 = math.cos(math.radians(30)), math.sin(math.radians(30))
        apex = (0.0, spring + w * math.sqrt(3) / 2)
        right = ((w / 2, spring), (-w / 2 + w * c30, spring + w * s30), apex)
        left = (apex, (w / 2 - w * c30, spring + w * s30), (-w / 2, spring))
        return [(-w / 2, s), (w / 2, s), (w / 2, spring)], [right, left], [(-w / 2, spring)]
    return [(-w / 2, s), (w / 2, s), (w / 2, s + h), (-w / 2, s + h)], [], []


def opening_void(edge, closed, thickness_mm, d1, d2, position_m, width_m, height_m, sill_m=0.9, shape="Arch"):
    """The solid an opening removes: its outline in the plane square to the centreline at
    position_m (metres of arc length, the opening's centre), pushed through the wall's
    thickness plus the bow of a curved wall over the opening's width."""
    length_m = edge.Length / MM
    pos = position_m % length_m if closed else max(0.0, min(length_m, position_m))
    u = edge.getParameterByLength(pos * MM)
    p = edge.valueAt(u)
    tan = edge.tangentAt(u)
    tan = App.Vector(tan.x, tan.y, 0)
    tan.normalize()
    left = Z.cross(tan)
    try:
        k = edge.curvatureAt(u)
    except Exception:
        k = 0.0
    w = width_m * MM
    sag = (w * w * k / 8.0) if k > 1e-12 else 0.0
    depth = thickness_mm + 2 * sag + 0.4 * MM
    centre = p + left * ((d1 + d2) / 2) - left * (depth / 2)

    def at(a, up):
        return centre + tan * (a * MM) + Z * (up * MM)

    if shape == "Round":
        r = width_m / 2
        wire = Part.Wire(Part.makeCircle(r * MM, at(0.0, sill_m + r), left))
    else:
        lines, arcs, closing = opening_outline(width_m, height_m, sill_m, shape)
        edges = [Part.LineSegment(at(*q0), at(*q1)).toShape() for q0, q1 in zip(lines, lines[1:])]
        edges += [Part.Arc(at(*q0), at(*qm), at(*q1)).toShape() for q0, qm, q1 in arcs]
        edges.append(Part.LineSegment(at(*(closing[0] if closing else lines[-1])), at(*lines[0])).toShape())
        wire = Part.Wire(Part.__sortEdges__(edges))
    return Part.Face(wire).extrude(left * depth)


# ---------------------------------------------------------------- arches and vaults (XZ plane)
def catenary_parameter(span_m, rise_m):
    """a such that a (cosh(L / 2a) - 1) = h (plugin-hagia-sophia fits the same curve)."""
    half = span_m / 2
    lo, hi = 1e-4 * span_m, 1e4 * span_m
    for _ in range(200):
        mid = math.sqrt(lo * hi)
        if mid * (math.cosh(min(700.0, half / mid)) - 1) > rise_m:
            lo = mid
        else:
            hi = mid
    return math.sqrt(lo * hi)


def arch_intrados(profile, span_m, rise_m, samples=96):
    """The intrados as points (x, z) in metres from (-L/2, 0) over the crown to (+L/2, 0)."""
    half = span_m / 2
    xs = [-half + span_m * i / samples for i in range(samples + 1)]
    if profile == "Catenary":
        a = catenary_parameter(span_m, rise_m)
        return [(x, a * (math.cosh(half / a) - math.cosh(x / a))) for x in xs]
    if profile == "Parabola":
        return [(x, rise_m * (1 - (x / half) ** 2)) for x in xs]
    if profile == "Ellipse":  # plugin-eco's barrel: base + rise sqrt(1 - v^2)
        return [(half * math.cos(math.pi * (1 - i / samples)), rise_m * math.sin(math.pi * (1 - i / samples))) for i in range(samples + 1)]
    raise ValueError(profile)


def _circle_arc_xz(centre, radius, a0, a1):
    """An arc in the XZ plane (angles in radians from +X towards +Z)."""
    am = (a0 + a1) / 2
    pt = lambda a: V(centre[0] + radius * math.cos(a), 0, centre[1] + radius * math.sin(a))
    return Part.Arc(pt(a0), pt(am), pt(a1)).toShape()


def arch_profile_face(profile, span_m, rise_m, thickness_m, inner_extra_m=0.0):
    """The arch's cross-section in the XZ plane: the band from the intrados (lowered by
    inner_extra_m, for ribs) to thickness_m above it, standing on Z = 0.

    Semicircle, segmental and pointed arches are exact circles (the extrados concentric);
    catenary, parabola and ellipse are splines with a sampled normal offset.
    """
    half = span_m / 2
    t = thickness_m
    if profile in ("Semicircle", "Segmental", "Pointed"):
        if profile == "Semicircle":
            rise_m = half
        if profile == "Pointed":
            rise_m = max(rise_m, half * 1.0001)
            d = (rise_m ** 2 - half ** 2) / span_m
            rho = half + d
            rin, rout = rho - inner_extra_m, rho + t
            a_in = math.acos(max(-1.0, min(1.0, d / rin)))
            a_out = math.acos(max(-1.0, min(1.0, d / rout)))
            edges = [
                _circle_arc_xz((d, 0.0), rin, math.pi, math.pi - a_in),
                _circle_arc_xz((-d, 0.0), rin, a_in, 0.0),
                Part.LineSegment(V(-d + rin, 0, 0), V(-d + rout, 0, 0)).toShape(),
                _circle_arc_xz((-d, 0.0), rout, 0.0, a_out),
                _circle_arc_xz((d, 0.0), rout, math.pi - a_out, math.pi),
                Part.LineSegment(V(d - rout, 0, 0), V(d - rin, 0, 0)).toShape(),
            ]
            return Part.Face(Part.Wire(Part.__sortEdges__(edges)))
        rho = (half ** 2 + rise_m ** 2) / (2 * rise_m)
        cz = rise_m - rho
        rin, rout = rho - inner_extra_m, rho + t
        disc = Part.Face(Part.Wire(Part.makeCircle(rout * MM, V(0, 0, cz), Y))).cut(
            Part.Face(Part.Wire(Part.makeCircle(rin * MM, V(0, 0, cz), Y))))
        return face_of(disc.common(half_plane_xz(0.0)))
    pts = arch_intrados(profile, span_m, rise_m)
    ext = 2 * (t + inner_extra_m) + 0.1
    (x0, z0), (x1, z1) = pts[0], pts[1]
    (xa, za), (xb, zb) = pts[-2], pts[-1]
    l0, l1 = math.hypot(x1 - x0, z1 - z0), math.hypot(xb - xa, zb - za)
    start = (x0 - (x1 - x0) / l0 * ext, z0 - (z1 - z0) / l0 * ext)
    end = (xb + (xb - xa) / l1 * ext, zb + (zb - za) / l1 * ext)
    base = spline([V(x, 0, z) for x, z in [start] + pts + [end]])
    inner = offset_edge(base, -inner_extra_m * MM, Y) if inner_extra_m else base
    outer = offset_edge(base, t * MM, Y)
    i0, i1 = inner.valueAt(inner.FirstParameter), inner.valueAt(inner.LastParameter)
    o0, o1 = outer.valueAt(outer.FirstParameter), outer.valueAt(outer.LastParameter)
    band = Part.Face(wire_of([inner, Part.LineSegment(i1, o1).toShape(), outer, Part.LineSegment(o0, i0).toShape()]))
    return face_of(band.common(half_plane_xz(0.0)))


def vault_shape(profile, span_m, rise_m, thickness_m, length_m, ribs=0, rib_width_m=0.3, rib_depth_m=0.15):
    """A barrel vault along +Y, centred on the origin, standing on Z = 0, with ribs under it.

    A rib is the arch from rib_depth below the intrados to half-way into the shell, so it
    fuses into the shell instead of sharing its curved faces (which defeats booleans)."""
    shell = arch_profile_face(profile, span_m, rise_m, thickness_m).extrude(Y * (length_m * MM))
    parts = [shell]
    if ribs and ribs > 0 and rib_depth_m > 0:
        rib_face = arch_profile_face(profile, span_m, rise_m, thickness_m / 2, inner_extra_m=rib_depth_m)
        w = min(rib_width_m, length_m / max(1, ribs))
        for k in range(int(ribs)):
            y0 = (length_m - w) * (k / (ribs - 1) if ribs > 1 else 0.5)
            rib = rib_face.extrude(Y * (w * MM))
            rib.translate(Y * (y0 * MM))
            parts.append(rib)
    solid = fuse_all(parts)
    solid.translate(Y * (-length_m * MM / 2))
    return refined(solid)


def thrust_line_ok(profile, span_m, rise_m, thickness_m):
    """plugin-hagia-sophia's Poleni check: a catenary through the ring's centreline springings
    and crown stays within its middle third (max normal offset <= thickness / 6)."""
    if profile == "Semicircle":
        rise_m = span_m / 2
    mid_span, mid_rise = span_m + thickness_m, rise_m + thickness_m / 2
    a = catenary_parameter(mid_span, mid_rise)
    half = mid_span / 2
    worst = 0.0
    for i in range(1, 64):
        x = -half + mid_span * i / 64
        yc = a * (math.cosh(half / a) - math.cosh(x / a))
        if profile == "Catenary":
            ya = yc
        elif profile == "Parabola":
            ya = mid_rise * (1 - (x / half) ** 2)
        elif profile == "Ellipse":
            ya = mid_rise * math.sqrt(max(0.0, 1 - (x / half) ** 2))
        elif profile == "Pointed":
            h = max(rise_m, span_m / 2 * 1.0001)
            d = (h ** 2 - (span_m / 2) ** 2) / span_m
            rho = span_m / 2 + d + thickness_m / 2
            cx = d if x < 0 else -d
            ya = math.sqrt(max(0.0, rho ** 2 - (x - cx) ** 2))
        else:
            rho = ((span_m / 2) ** 2 + rise_m ** 2) / (2 * rise_m) + thickness_m / 2
            cz = rise_m - ((span_m / 2) ** 2 + rise_m ** 2) / (2 * rise_m)
            ya = cz + math.sqrt(max(0.0, rho ** 2 - x ** 2))
        worst = max(worst, abs(ya - yc))
    return worst <= thickness_m / 6, worst


# ---------------------------------------------------------------- domes
def dome_outer_profile(profile, radius_m, rise_m, samples=96):
    """The outer meridian (r, z) in metres, from the base (R, 0) to the crown (0, H)."""
    rs = [radius_m * (1 - i / samples) for i in range(samples + 1)]
    if profile == "Catenary":
        a = catenary_parameter(2 * radius_m, rise_m)
        return [(r, a * (math.cosh(radius_m / a) - math.cosh(r / a))) for r in rs]
    if profile == "Parabola":
        return [(r, rise_m * (1 - (r / radius_m) ** 2)) for r in rs]
    if profile == "Ellipse":  # plugin-hagia-sophia's "circular" meridian: x = R cos t, y = H sin t
        return [(radius_m * math.cos(math.pi / 2 * i / samples), rise_m * math.sin(math.pi / 2 * i / samples)) for i in range(samples + 1)]
    if profile == "Onion":
        out = []
        for i in range(samples + 1):
            s = i / samples
            out.append((max(0.0, radius_m * (1 + 0.18 * math.sin(math.pi * s)) * (1 - s ** 1.6) ** 0.9), rise_m * s))
        out[-1] = (0.0, rise_m)
        return out
    raise ValueError(profile)


def dome_shape(profile, radius_m, rise_m, thickness_m, oculus_m=0.0):
    """A dome shell standing on Z = 0, base circle radius R, crown at H.

    Sphere: a spherical cap less its concentric inner cap (exact). Other meridians: the band
    between the outer meridian and its inward offset, revolved about Z.
    """
    t = thickness_m
    if profile == "Sphere":
        rho = (radius_m ** 2 + rise_m ** 2) / (2 * rise_m)
        centre = V(0, 0, rise_m - rho)
        keep = Part.makeBox(4 * rho * MM, 4 * rho * MM, (rise_m + 1) * MM, V(-2 * rho, -2 * rho, 0))
        shell = Part.makeSphere(rho * MM, centre).common(keep).cut(Part.makeSphere((rho - t) * MM, centre))
    else:
        pts = dome_outer_profile(profile, radius_m, rise_m)
        (r0, z0), (r1, z1) = pts[0], pts[1]
        l0 = math.hypot(r1 - r0, z1 - z0)
        ext = 2 * t + 0.1
        pts = [(r0 - (r1 - r0) / l0 * ext, z0 - (z1 - z0) / l0 * ext)] + pts
        outer = spline([V(r, 0, z) for r, z in pts])
        inner = offset_edge(outer, t * MM, Y)
        i0, i1 = inner.valueAt(inner.FirstParameter), inner.valueAt(inner.LastParameter)
        o0, o1 = outer.valueAt(outer.FirstParameter), outer.valueAt(outer.LastParameter)
        edges = [outer, Part.LineSegment(o1, App.Vector(0, 0, i1.z)).toShape()]
        if abs(i1.x) > 1e-6:
            edges.append(Part.LineSegment(App.Vector(0, 0, i1.z), i1).toShape())
        edges += [inner, Part.LineSegment(i0, o0).toShape()]
        band = face_of(Part.Face(wire_of(edges)).common(half_plane_xz(0.0, 0.0)))
        shell = band.revolve(App.Vector(0, 0, 0), Z, 360)
    if oculus_m > 0:
        shell = shell.cut(Part.makeCylinder(oculus_m * MM, (rise_m + t + 2) * MM, V(0, 0, -1)))
    return refined(shell)


# ---------------------------------------------------------------- leaf shells (plugin-eco eco-shell)
def leaf_plan(spine_m, span_m, outline="Ellipse"):
    """plugin-eco's leafShellPlan: an ellipse outline L/2 x W/2 (or a pointed leaf) and the
    ridge (-L/2, 0), (-L/6, 0.2 W/13), (L/6, -0.15 W/13), (L/2, 0)."""
    hl, hw = max(2.0, spine_m) / 2, max(1.0, span_m) / 2
    if outline == "Pointed":
        pts = []
        for i in range(64):
            a = 2 * math.pi * i / 64
            x = hl * math.cos(a)
            u = (x + hl) / (2 * hl)
            pts.append((x, hw * math.copysign(abs(math.sin(math.pi * u ** 0.8)) ** 0.8, math.sin(a))))
    else:
        pts = [(hl * math.cos(2 * math.pi * i / 64), hw * math.sin(2 * math.pi * i / 64)) for i in range(64)]
    ridge = [(-hl, 0.0), (-hl / 3, 0.2 * (2 * hw / 13)), (hl / 3, -0.15 * (2 * hw / 13)), (hl, 0.0)]
    return pts, ridge


def _closest_on_polyline(x, y, poly):
    best = (poly[0][0], poly[0][1], 0.0, float("inf"))
    walked = 0.0
    for (ax, ay), (bx, by) in zip(poly, poly[1:]):
        ex, ey = bx - ax, by - ay
        ln2 = ex * ex + ey * ey
        ln = math.sqrt(ln2) or 1.0
        u = max(0.0, min(1.0, ((x - ax) * ex + (y - ay) * ey) / (ln2 or 1.0)))
        qx, qy = ax + ex * u, ay + ey * u
        d = math.hypot(x - qx, y - qy)
        if d < best[3]:
            best = (qx, qy, walked + u * ln, d)
        walked += ln
    return best


def eco_shell_height(x, y, outline, ridge, ridge_heights, eave, curvature):
    """plugin-eco's shellHeightAt, unchanged: ridge height near the spine, the eave at the far
    outline, a smoothstep between, and a curl lifting mid-span."""
    qx, qy, along, d = _closest_on_polyline(x, y, ridge)
    lengths = [math.hypot(bx - ax, by - ay) for (ax, ay), (bx, by) in zip(ridge, ridge[1:])]
    target = max(0.0, min(sum(lengths) or 1.0, along))
    ridge_h = ridge_heights[-1]
    for i, ln in enumerate(lengths):
        if target <= ln or i == len(lengths) - 1:
            u = 0.0 if ln < 1e-9 else target / ln
            ridge_h = ridge_heights[i] + (ridge_heights[i + 1] - ridge_heights[i]) * u
            break
        target -= ln
    max_lat = max(0.01, max(math.hypot(ox - qx, oy - qy) for ox, oy in outline))
    w = smoothstep(d / max_lat)
    curl = math.sin((1 - w) * math.pi) * curvature * (ridge_h - eave)
    return ridge_h * (1 - w) + eave * w + curl * (1 - w)


def smooth_ridge(ridge, heights, per_segment=12):
    """The ridge through its points as a Catmull-Rom curve, with its heights on a monotone
    cubic (Fritsch-Carlson: no overshoot). plugin-eco interpolates both linearly; on a real
    surface its kinks at the inner ridge points show as creases across the leaf."""
    n = len(ridge)
    d = [heights[i + 1] - heights[i] for i in range(n - 1)]
    m = [d[0]] + [0.0 if d[i - 1] * d[i] <= 0 else 2.0 / (1.0 / d[i - 1] + 1.0 / d[i]) for i in range(1, n - 1)] + [d[-1]]
    pts, hs = [], []
    ext = [ridge[0]] + list(ridge) + [ridge[-1]]
    for i in range(n - 1):
        p0, p1, p2, p3 = ext[i], ext[i + 1], ext[i + 2], ext[i + 3]
        for k in range(per_segment + (1 if i == n - 2 else 0)):
            t = k / per_segment
            t2, t3 = t * t, t * t * t
            pts.append(tuple(0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                                    + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in range(2)))
            h00, h10, h01, h11 = 2 * t3 - 3 * t2 + 1, t3 - 2 * t2 + t, -2 * t3 + 3 * t2, t3 - t2
            hs.append(h00 * heights[i] + h10 * m[i] + h01 * heights[i + 1] + h11 * m[i + 1])
    return pts, hs


def leaf_shell_shape(spine_m=26.0, span_m=13.0, ridge_heights=(3.0, 7.2, 9.8, 3.0), eave_m=3.0,
                     rise=1.0, curvature=0.15, thickness_m=0.12, rib_spacing_m=2.5, rib_depth_m=0.1,
                     rib_width_m=0.12, outline="Ellipse", plinth_m=0.0, foot_m=0.0,
                     veins=False, vein_sources=180, vein_seed=1):
    """plugin-eco's leaf shell roof as a solid: its height field (eco_shell_height) fitted with a
    B-spline surface, thickened by a true normal offset and cut to the outline. Heights are
    above the object's base. Ribs, every rib_spacing along the spine, are deeper strips that
    bite into the shell from below; with `veins` they follow a leaf's venation instead, grown
    from the stem end (organic_biomimetic.venation), each as wide as Murray's law gives it.
    With a plinth, each tip of the leaf stands on a footing: the leaf's own plan within foot_m
    of the tip, solid from inside the shell down to plinth_m below the base, so a shell whose
    tips come down to the ground reaches it."""
    pts, ridge = leaf_plan(spine_m, span_m, outline)
    heights = [eave_m + (h - eave_m) * (rise if rise > 0 else 1.0) for h in ridge_heights]
    ridge, heights = smooth_ridge(ridge, heights)
    hl, hw = max(2.0, spine_m) / 2, max(1.0, span_m) / 2
    nx, ny = 36, 18
    grid = []
    for i in range(nx + 1):
        x = -hl * 1.06 + 2 * hl * 1.06 * i / nx
        grid.append([V(x, y, eco_shell_height(x, y, pts, ridge, heights, eave_m, curvature))
                     for y in (-hw * 1.1 + 2 * hw * 1.1 * j / ny for j in range(ny + 1))])
    face = surface_from_grid(grid)
    outline_face = Part.Face(Part.makePolygon([V(x, y) for x, y in pts] + [V(*pts[0])]))
    prism = prism_of(outline_face)
    shell = thicken_surface(face, thickness_m * MM).common(prism)
    if not veins and rib_spacing_m and rib_spacing_m > 0 and rib_depth_m > 0:
        deep = thicken_surface(face, (thickness_m / 2 + rib_depth_m) * MM, overlap_mm=thickness_m / 2 * MM)
        strips = []
        n = int(2 * hl // rib_spacing_m)
        for k in range(1, n + 1):
            x = -hl + k * rib_spacing_m
            if x >= hl - 0.5 * rib_spacing_m:
                break
            strips.append(Part.makeBox(rib_width_m * MM, 2 * hw * 1.2 * MM, BIG, V(x - rib_width_m / 2, -hw * 1.2, -BIG / 2 / MM)))
        if strips:
            shell = shell.fuse(deep.common(fuse_all(strips)).common(prism))
    if plinth_m and plinth_m > 0:
        foot = foot_m if foot_m and foot_m > 0 else max(0.8, 0.06 * 2 * hl)
        top = max(heights) + 1.0
        mid = face.copy()
        mid.translate(App.Vector(0, 0, -thickness_m / 2 * MM))
        below = mid.extrude(App.Vector(0, 0, -(top + plinth_m + 1.0) * MM))  # all that lies under the shell
        keep = Part.makeBox(4 * hl * MM, 4 * hw * MM, (top + plinth_m) * MM, V(-2 * hl, -2 * hw, -plinth_m))
        feet = [Part.makeBox(foot * MM, 2 * hw * 1.2 * MM, BIG, V(x0, -hw * 1.2, -BIG / 2 / MM)) for x0 in (-hl, hl - foot)]
        shell = shell.fuse(below.common(fuse_all(feet)).common(prism).common(keep))
    shell = refined(shell)
    if veins and rib_depth_m > 0:
        import organic_biomimetic as ob  # it builds on this module

        # The vein ribs are swept solids beside the shell, a compound with it, not cut from a
        # thickened surface as the straight ribs are: that boolean took two minutes for a leaf.
        step = max(0.3, 0.028 * 2 * hl)
        nodes, parent = ob.venation(pts, (-hl * 0.97, 0.0), sources=int(vein_sources), seed=vein_seed,
                                    step_m=step, kill_m=1.2 * step, reach_m=2 * hl)
        widths = ob.murray_widths(parent, tip_m=rib_width_m * 0.6, widest_m=rib_width_m * 4)
        top_at = lambda x, y: eco_shell_height(x, y, pts, ridge, heights, eave_m, curvature)
        return Part.makeCompound([shell] + ob.vein_ribs(nodes, parent, widths, top_at, thickness_m, rib_depth_m))
    return shell


# ---------------------------------------------------------------- organic roofs (plugin-eco organic building)
def ring_radius(pole, ring_pts, ux, uy):
    """Distance from the pole along (ux, uy) to the ring (plugin-eco's ray cast)."""
    best = None
    for (ax, ay), (bx, by) in zip(ring_pts, ring_pts[1:] + ring_pts[:1]):
        ex, ey = bx - ax, by - ay
        den = ux * ey - uy * ex
        if abs(den) < 1e-12:
            continue
        fx, fy = ax - pole[0], ay - pole[1]
        t = (fx * ey - fy * ex) / den
        u = (fx * uy - fy * ux) / den
        if t > 1e-4 and 0 <= u <= 1 and (best is None or t < best):
            best = t
    return best


def organic_roof_height(x, y, pole, ring_pts, eaves, rise):
    """plugin-eco's organicShellHeight: eaves + rise (1 - ρ^2.2), drooping past the wall."""
    dx, dy = x - pole[0], y - pole[1]
    r = math.hypot(dx, dy)
    if r < 1e-6:
        return eaves + rise
    wall_r = ring_radius(pole, ring_pts, dx / r, dy / r) or max(r, 1.0)
    rho = min(1.5, r / wall_r)
    if rho <= 1:
        return eaves + rise * (1 - rho ** 2.2)
    return eaves - min(1.0, rho - 1) * rise * 0.15


def eave_ring(ring_pts, pole, overhang_m):
    """The wall ring pushed out from the pole by the overhang: plugin-eco moves rings along
    the ray from the centre too, and on a ring star-shaped about its pole this never folds
    (a normal offset does, between lobes tighter than the overhang)."""
    out = []
    for x, y in ring_pts:
        dx, dy = x - pole[0], y - pole[1]
        r = math.hypot(dx, dy) or 1.0
        out.append((x + dx / r * overhang_m, y + dy / r * overhang_m))
    return out


def organic_roof_shape(ring_edge, eaves_m, rise_m, overhang_m, thickness_m):
    """The organic building's shell roof as a solid over a closed wall centreline (a
    horizontal edge): the height field above the edge's height, thickened, cut to the eave
    ring."""
    z0 = ring_edge.valueAt(ring_edge.FirstParameter).z / MM
    ring_pts = [(p.x / MM, p.y / MM) for p in ring_edge.discretize(Number=241)[:-1]]
    pole = pole_of_inaccessibility(ring_pts)
    eave = eave_ring(ring_pts[::2], pole, overhang_m)
    eave_face = Part.Face(wire_of(spline([V(x, y, z0) for x, y in eave], closed=True)))
    bb = eave_face.BoundBox
    nx = ny = 40
    grid = []
    for i in range(nx + 1):
        x = (bb.XMin - 500 + (bb.XLength + 1000) * i / nx) / MM
        grid.append([V(x, y, z0 + organic_roof_height(x, y, pole, ring_pts, eaves_m, rise_m))
                     for y in ((bb.YMin - 500 + (bb.YLength + 1000) * j / ny) / MM for j in range(ny + 1))])
    face = surface_from_grid(grid)
    prism = prism_of(eave_face)
    roof = thicken_surface(face, thickness_m * MM).common(prism)
    if not (roof.Solids and roof.isValid()):
        roof = face.extrude(App.Vector(0, 0, -thickness_m * MM)).common(prism)
    return refined(roof)


def slab_shape(ring_edge, thickness_m, inset_m=0.0):
    """A floor slab filling a closed centreline (less inset), thickness_m down from its height."""
    return solid_of(region_offset(ring_edge, -inset_m * MM).extrude(App.Vector(0, 0, -thickness_m * MM)))


# ---------------------------------------------------------------- minimal surfaces
def soap_film_shape(boundary_edge, mast_height_m=3.0, mast_radius_m=0.6, thickness_m=0.08,
                    rings=8, columns=32, iterations=150):
    """A soap film on a closed horizontal boundary, lifted by a mast ring over its pole.

    plugin-eco relaxes a grid pinned at the centre with the boundary and the centre at one
    height, so its film stays flat. Here the inner ring stands mast_height above the boundary
    and the grid relaxes by Laplacian averaging with the seam wrapped: the tent-like surface
    a membrane takes between the two rings (for a circle, the catenoid's shape near its
    waist). Lofted through its rings, thickened, it is a closed solid."""
    z0 = boundary_edge.valueAt(boundary_edge.FirstParameter).z / MM
    length = boundary_edge.Length
    boundary = []
    for j in range(columns):
        p = boundary_edge.valueAt(boundary_edge.getParameterByLength(length * j / columns))
        boundary.append((p.x / MM, p.y / MM))
    pole = pole_of_inaccessibility(boundary)
    grid = []
    for i in range(rings + 1):
        f = i / rings
        row = []
        for j, (bx, by) in enumerate(boundary):
            ang = math.atan2(by - pole[1], bx - pole[0])
            ix, iy = pole[0] + mast_radius_m * math.cos(ang), pole[1] + mast_radius_m * math.sin(ang)
            row.append([ix + (bx - ix) * f, iy + (by - iy) * f, mast_height_m * (1 - f)])
        grid.append(row)
    for _ in range(iterations):
        for i in range(1, rings):
            for j in range(columns):
                a, b = grid[i][(j - 1) % columns], grid[i][(j + 1) % columns]
                c, d = grid[i - 1][j], grid[i + 1][j]
                grid[i][j][2] = (a[2] + b[2] + c[2] + d[2]) / 4
    wires = [Part.Wire(spline([V(x, y, z0 + z) for x, y, z in row], closed=True)) for row in grid]
    surface = Part.makeLoft(wires, False, False)
    face = surface.Faces[0]
    try:
        slab = face.makeOffsetShape(-thickness_m * MM, 0.01, fill=True)
        solid = slab.Solids[0].toNurbs().Solids[0]
        if solid.Volume <= 0:
            raise ValueError
    except Exception:
        solid = face.makeOffsetShape(thickness_m * MM, 0.01, fill=True).Solids[0].toNurbs().Solids[0]
    return solid_of(solid)


def catenoid_shape(waist_m, height_m, thickness_m):
    """A catenoid shell (a minimal surface): r(z) = c cosh(z / c), c = waist radius."""
    c = waist_m
    samples = 64
    pts = [(c * math.cosh((-height_m / 2 + height_m * i / samples) / c), -height_m / 2 + height_m * i / samples) for i in range(samples + 1)]
    outer = spline([V(r, 0, z) for r, z in pts])
    inner = offset_edge(outer, thickness_m * MM, Y)
    o0, o1 = outer.valueAt(outer.FirstParameter), outer.valueAt(outer.LastParameter)
    i0, i1 = inner.valueAt(inner.FirstParameter), inner.valueAt(inner.LastParameter)
    if i0.x > o0.x:
        inner = offset_edge(outer, -thickness_m * MM, Y)
        i0, i1 = inner.valueAt(inner.FirstParameter), inner.valueAt(inner.LastParameter)
    band = Part.Face(wire_of([outer, Part.LineSegment(o1, i1).toShape(), inner, Part.LineSegment(i0, o0).toShape()]))
    clip = Part.Face(Part.makePolygon([V(0, 0, -height_m / 2), V(BIG / MM, 0, -height_m / 2), V(BIG / MM, 0, height_m / 2), V(0, 0, height_m / 2), V(0, 0, -height_m / 2)]))
    shell = face_of(band.common(clip)).revolve(App.Vector(0, 0, 0), Z, 360)
    shell.translate(V(0, 0, height_m / 2))
    return solid_of(shell)


def hypar_shape(size_x_m, size_y_m, rise_m, thickness_m):
    """A hyperbolic paraboloid shell (a doubly ruled saddle) over a x b, corners +/- rise."""
    a, b = size_x_m / 2, size_y_m / 2
    p = [V(-a, -b, rise_m), V(a, -b, -rise_m), V(a, b, rise_m), V(-a, b, -rise_m)]
    face = Part.makeRuledSurface(Part.LineSegment(p[0], p[1]).toShape(), Part.LineSegment(p[3], p[2]).toShape())
    solid = thicken_surface(face, thickness_m * MM)
    solid.translate(V(0, 0, rise_m + thickness_m))
    return solid_of(solid)
