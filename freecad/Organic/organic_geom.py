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

try:  # OCCT's own measures with an error bound, through pythonocc, which FreeCAD ships (see volume_of)
    from OCC.Core.BRepGProp import brepgprop as _gprop
    from OCC.Core.GProp import GProp_GProps as _GProps
except Exception:  # a FreeCAD without it: the plain measures
    _gprop = None

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


def volume_of(shape, eps=1.0e-5):
    """A solid's volume in mm3, to the relative error eps.

    Shape.Volume is OCCT's plain measure: a fixed number of points to a face, however many
    spans its splines have. On a wall of 78 m with a sampled top it read 0.16 % too much, and
    the area of the wall's plan 0.10 % too much; the adaptive measure used here (Gauss-Kronrod,
    OCCT's own, reached through pythonocc) agreed with the count by strips and with the
    solid's triangles to 0.001 %. It costs time on a large solid (2.6 s on that wall at 1e-5),
    so it is for what is reported and for what is held against a tolerance, not for sorting."""
    if _gprop is not None:
        try:
            props = _GProps()
            _gprop.VolumePropertiesGK(Part.__toPythonOCC__(shape), props, eps)
            return props.Mass()
        except Exception:
            pass
    return shape.Volume


def area_of(shape, eps=1.0e-7):
    """A face's area in mm2, to the relative error eps (see volume_of)."""
    if _gprop is not None:
        try:
            props = _GProps()
            _gprop.SurfaceProperties(Part.__toPythonOCC__(shape), props, eps)
            return props.Mass()
        except Exception:
            pass
    return shape.Area


def baked(shape):
    """A shape with any placement of its own written into its geometry.

    A shape moved as a whole (translate, rotate, or taken from a moved object) carries the
    move as a placement beside its geometry. Two things lose it: assigning the shape to an
    object (the object's placement replaces it), and Edge.split (it cuts the bare curve). A
    slab on a curve 5 m from its building's origin lay at the origin for both reasons."""
    own = shape.Placement
    if own.isIdentity():
        return shape
    out = shape.copy()
    out.Placement = App.Placement()
    out.transformShape(own.toMatrix(), True)  # copy = True: into the geometry
    return out


def pieces_of(edge, span=16):
    """A B-spline edge of many spans as several edges.

    OCCT integrates areas and volumes along each edge with a fixed number of points, so a
    face bounded by one spline of hundreds of spans reports its area percent off, and a
    solid built on it its volume: a 0.45 m wall on a lobed ring read 43.4 m³ against its
    63.0 m³. Split into edges of at most `span` spans, the same shape reads true."""
    edge = baked(edge)
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
# An offset curve is a spline through exact offset points this far apart along the edge (and
# never fewer than OFFSET_MIN_POINTS). Each point makes a span, and OCCT meshes a wall's face
# span by span: with a point every 0.1 m a lobed wall of 32 m went to the map as 51,000
# triangles, at 0.3 m as 25,000. Between its points the spline leaves the true offset by, as
# measured at 1,500 places: 1.3 mm on that wall's tightest bend (0.5 m radius), 0.3 to 0.7 mm
# on smooth curves through clicked points, nothing on an S-curve (0.07 mm, 0.09 mm and nothing
# at 0.1 m). Lines and circles are offset exactly whatever this says.
OFFSET_STEP_MM = 300.0
OFFSET_MIN_POINTS = 64


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
    n = samples or max(OFFSET_MIN_POINTS, int(math.ceil(edge.Length / OFFSET_STEP_MM)))
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
    """A plan outline that has corners (a polygon, a star, a vesica, a seed of life, a run of
    straight walls), closed or open, walked by arc length. It answers what the wall kernels
    ask of an edge (Length, valueAt, tangentAt, curvatureAt, with the parameter the distance
    along it in mm), so a wall keeps the outline's true lines, arcs and corners; fitting one
    spline through a corner rounds it and folds the wall's offsets there."""

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
    """A base curve for a wall: plan_edge's one smooth edge, or, for an outline with corners
    (closed or open), the outline itself as a WirePath. Returns (edge or WirePath, closed)."""
    edges = shape.Edges
    if len(edges) > 1:
        wire = Part.Wire(Part.__sortEdges__(edges))
        if has_corners(wire):
            return WirePath(wire), wire.isClosed()
    return plan_edge(shape, step_m)


def face_offset(face, d_mm):
    """A plan face grown by d (shrunk if negative), its corners kept as corners."""
    if abs(d_mm) < 1e-9:
        return face
    faces = face.makeOffset2D(d_mm, 2).Faces
    if not faces:
        raise ValueError("the offset of %.3f m left nothing" % (d_mm / MM))
    return max(faces, key=lambda f: f.Area)


def _nearest_on(edge, point):
    """(how far `point` is from an edge, mm along the edge from its first parameter to the
    place on it nearest the point)."""
    c = edge.Curve
    u0, u1 = edge.FirstParameter, edge.LastParameter
    u = c.parameter(point)
    if c.isPeriodic():  # a circle answers in 0..2π, an arc's own range may lie beyond it
        period = c.LastParameter - c.FirstParameter
        while u < u0:
            u += period
        while u > u1:
            u -= period
    u = min(max(u, u0), u1)
    return (edge.valueAt(u) - point).Length, (Part.Edge(c, u0, u).Length if u > u0 + 1e-12 else 0.0)


def arc_length_at(edge, point):
    """Metres along a plan edge (or a WirePath) to the point on it nearest `point`."""
    if isinstance(edge, WirePath):  # an outline with corners: the nearest place on any of its runs
        flat = App.Vector(point.x, point.y, edge.valueAt(0.0).z)
        best = None
        for e, forward, start in edge.parts:
            gap, along = _nearest_on(e, flat)
            if best is None or gap < best[0] - 1e-9:
                best = (gap, start + (along if forward else e.Length - along))
        return best[1] / MM
    return _nearest_on(edge, App.Vector(point.x, point.y, edge.valueAt(edge.FirstParameter).z))[1] / MM


def wire_ends(wire):
    """An open wire's first point, its direction there, its last point and its direction there."""
    edges = wire.OrderedEdges
    out = []
    for e, first in ((edges[0], True), (edges[-1], False)):
        forward = e.Orientation != "Reversed"
        u = e.FirstParameter if first == forward else e.LastParameter
        t = e.tangentAt(u)
        out += [e.valueAt(u), t if forward else t * -1.0]
    return out


def open_side(wire, d_left_mm):
    """An open plan wire moved d to the left of its direction (to its right if negative), its
    corners kept as corners. Its ends stand square to the wire's own ends."""
    if abs(d_left_mm) < 1e-9:
        return wire
    start, tan, _end, _tan = wire_ends(wire)
    left = Z.cross(App.Vector(tan.x, tan.y, 0))
    left.normalize()
    want = start + left * d_left_mm
    best = None
    for sign in (1.0, -1.0):  # which sign is "left" depends on the wire's own sense: try both, keep the one that starts there
        try:
            side = wire.makeOffset2D(sign * abs(d_left_mm), 2, False, True, False)
        except Exception:
            continue
        gap = min((v.Point - want).Length for v in side.Vertexes) if side.Vertexes else float("inf")
        if best is None or gap < best[0]:
            best = (gap, side)
    if best is None or best[0] > 0.01:
        raise ValueError("a side %.3f m from the wall's line could not be drawn (a run shorter than the wall is thick?)" % (abs(d_left_mm) / MM))
    return best[1]


def open_band(path, d1_mm, d2_mm):
    """The plan face between two sides of an open outline that has corners: a wall's plan,
    mitred at each corner, cut square at both ends."""
    a, b = open_side(path.wire, d1_mm), open_side(path.wire, d2_mm)
    a0, _t, a1, _t = wire_ends(a)
    b0, _t, b1, _t = wire_ends(b)
    if (a0 - b0).Length + (a1 - b1).Length > (a0 - b1).Length + (a1 - b0).Length:  # the sides may run opposite ways
        b0, b1 = b1, b0
    caps = [Part.LineSegment(a0, b0).toShape(), Part.LineSegment(a1, b1).toShape()]
    return Part.Face(Part.Wire(Part.__sortEdges__(list(a.Edges) + list(b.Edges) + caps)))


def catmull_rom_spans(points, closed=False):
    """The cubic spans of the smooth curve through points that plugin-eco's smooth wall and
    the map's build mode both draw (a uniform Catmull-Rom spline: at each point the curve
    runs parallel to the line between its two neighbours; an open curve's ends take the end
    point twice). Each span from one point to the next as four Bézier poles."""
    n = len(points)
    spans = []
    for i in range(n if closed else n - 1):
        p0 = points[(i - 1) % n] if closed else points[max(i - 1, 0)]
        p1, p2 = points[i], points[(i + 1) % n]
        p3 = points[(i + 2) % n] if closed else points[min(i + 2, n - 1)]
        spans.append((p1, p1 + (p2 - p0) * (1 / 6.0), p2 - (p3 - p1) * (1 / 6.0), p2))
    return spans


def catmull_rom(points, closed=False):
    """That curve as one edge: an exact B-spline of its cubic spans (not a fit)."""
    spans = catmull_rom_spans(points, closed)
    poles = [spans[0][0]]
    for _b0, b1, b2, b3 in spans:
        poles += [b1, b2, b3]
    c = Part.BSplineCurve()
    c.buildFromPolesMultsKnots(poles, [4] + [3] * (len(spans) - 1) + [4], [float(k) for k in range(len(spans) + 1)], False, 3)
    return c.toShape()


def points_curve(points_m, smooth=True, closed=False):
    """A plan curve through points [(x, y), ...] in metres: one smooth curve through them all
    (the Catmull-Rom spline the map's build mode draws, exactly), or straight runs that keep
    the points as corners. Points given twice in a row count once."""
    pts = []
    for x, y in points_m:
        p = V(x, y)
        if not pts or (p - pts[-1]).Length > 1e-6:
            pts.append(p)
    if len(pts) > 2 and (pts[0] - pts[-1]).Length <= 1e-6:  # the first point repeated at the end: closed
        pts.pop()
        closed = True
    if len(pts) < 2:
        raise ValueError("a curve needs at least two different points")
    if len(pts) == 2:
        return Part.Wire(Part.LineSegment(pts[0], pts[1]).toShape())
    if not smooth:
        return Part.makePolygon(pts + ([pts[0]] if closed else []))
    return Part.Wire(catmull_rom(pts, closed))


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


# A shaped top is cut from the wall's prism by the solid above the top line (top_tool, cut_top).
# The prism stands TOP_CLEAR_MM above the top line's highest point: where the two touched, the
# cut failed. The solid reaches TOP_MARGIN_MM beyond the wall's two faces (it was the wall's
# thickness and half a metre more, which folds over itself on a bend tighter than that) and
# TOP_END_MM beyond an open wall's two ends.
TOP_MARGIN_MM = 30.0
TOP_END_MM = 50.0
TOP_CLEAR_MM = 500.0
# Stations added to the top line, and stations to a face, tried in turn until the cut holds
# what the wall must hold; and how closely it must.
TOP_TRIES = ((0, TOP_PIECE_STATIONS), (1, TOP_PIECE_STATIONS), (0, 6), (5, TOP_PIECE_STATIONS), (0, 12), (3, 6))
TOP_TOLERANCE = 5.0e-4


def top_height(kind, height_m, rise_m, waves, f):
    """Wall top above its base at a fraction f of the centreline's length (metres). `kind` is
    one of the named top lines, or the top line itself: a function of f that gives metres
    (a wall whose top follows heights given along it: sampled_top)."""
    if callable(kind):
        return kind(f)
    if kind == "Arch":
        return height_m + rise_m * math.sin(math.pi * f)
    if kind == "Wave":
        return height_m + rise_m * 0.5 * (1 - math.cos(2 * math.pi * max(1, int(waves)) * f))
    if kind == "Slope":
        return height_m + rise_m * f
    return height_m


def through_heights(heights, v, closed):
    """The smooth line through heights given at whole numbers 0, 1, 2, … read at v: between
    two of them the cubic that runs, at each, parallel to the line between its neighbours (a
    Catmull-Rom spline, the same rule as a curve through points). Closed: the last height is
    followed by the first again; open: the ends count twice."""
    n = len(heights)
    if n == 1:
        return heights[0]
    spans = n if closed else n - 1
    v = v % spans if closed else max(0.0, min(float(spans), v))
    i = min(int(math.floor(v)), spans - 1)
    t = v - i
    pick = (lambda k: heights[k % n]) if closed else (lambda k: heights[max(0, min(n - 1, k))])
    p0, p1, p2, p3 = pick(i - 1), pick(i), pick(i + 1), pick(i + 2)
    return 0.5 * (2.0 * p1 + (p2 - p0) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t * t + (3.0 * p1 - p0 - 3.0 * p2 + p3) * t * t * t)


def sampled_top(edge, closed, heights, at_points):
    """A wall's top line given as heights (m above its base): the function of the fraction of
    the centreline's length that top_height asks for.

    at_points: the heights belong to the points the base curve runs through, in their order
    (a curve through points made by points_curve: its parameter counts the points); the top
    line is then the smooth line through those heights, point for point. Otherwise they are
    spread evenly along the centreline's length."""
    heights = [float(h) for h in heights]
    n = len(heights)
    spans = n if closed else n - 1
    length = edge.Length
    u0 = edge.FirstParameter

    def top(f):
        f = f % 1.0 if closed else max(0.0, min(1.0, f))
        v = (edge.getParameterByLength(f * length) - u0) if at_points else f * spans
        return through_heights(heights, v, closed)

    return top


def _across(edge, u):
    """The point of the centreline at u and the horizontal unit vector to its left."""
    tan = edge.tangentAt(u)
    left = Z.cross(App.Vector(tan.x, tan.y, 0))
    left.normalize()
    return edge.valueAt(u), left


def shaped_wall_volume(edge, d1, d2, band_area, below_mm, top, height_m, rise_m, waves, step_mm=25.0):
    """What a wall with a shaped top must hold (mm3), counted without OCCT's booleans: thin
    strips across the band between the centreline's normals, each as tall as the top line at
    its middle, together scaled to the band's own area (which also covers a band whose offset
    had its loops removed)."""
    length = edge.Length
    count = max(200, int(math.ceil(length / step_mm)))
    area = volume = 0.0
    before = None
    for i in range(count + 1):
        f = i / float(count)
        p, left = _across(edge, edge.getParameterByLength(min(length, f * length)))
        here = (p + left * d1, p + left * d2)
        if before is not None:
            # a quadrilateral's area: half the cross product of its diagonals
            strip = abs(0.5 * (here[1] - before[0]).cross(before[1] - here[0]).z)
            area += strip
            volume += strip * (below_mm + top_height(top, height_m, rise_m, waves, f - 0.5 / count) * MM)
        before = here
    return volume * band_area / area


def top_tool(edge, closed, d1, d2, z0, top, height_m, rise_m, waves, count, piece):
    """The solid above a shaped wall top: ruled faces through the top line at `count` stations
    of arc length, `piece` stations to a face, pushed upwards.

    Both top lines are split at the same parameters, so the ruled faces pair up and each stays
    short enough for OCCT to measure (see pieces_of and TOP_PIECE_STATIONS)."""
    length = edge.Length
    places = [(_across(edge, u), f) for u, f in _stations(edge, closed, count)]
    if not closed and TOP_END_MM > 0:
        # past both ends, straight on: the solid's end faces must not lie in the wall's own
        e = TOP_END_MM / length
        (p0, l0), (p1, l1) = places[0][0], places[-1][0]
        places.insert(0, ((p0 - l0.cross(Z) * TOP_END_MM, l0), -e))  # left x Z points along the wall
        places.append(((p1 + l1.cross(Z) * TOP_END_MM, l1), 1.0 + e))
    rows = [[], []]
    for (p, left), f in places:
        z = z0 + top_height(top, height_m, rise_m, waves, f) * MM
        for row, d in zip(rows, (d1 - TOP_MARGIN_MM, d2 + TOP_MARGIN_MM)):
            q = p + left * d
            row.append(App.Vector(q.x, q.y, z))
    params = [f for _place, f in places] + ([1.0] if closed else [])
    n = max(1, int(math.ceil(len(places) / float(piece))))
    cuts = [k / float(n) for k in range(1, n)]
    e0, e1 = spline(rows[0], closed, params), spline(rows[1], closed, params)
    w0 = Part.Wire(e0.split(cuts).Edges) if cuts else Part.Wire(e0)
    w1 = Part.Wire(e1.split(cuts).Edges) if cuts else Part.Wire(e1)
    return Part.makeRuledSurface(w0, w1).extrude(App.Vector(0, 0, BIG))


def cut_top(prism, edge, closed, d1, d2, z0, band_area, below_mm, top, height_m, rise_m, waves):
    """The wall's prism with everything above its shaped top removed.

    OCCT's cut can fail without a word: it hands the prism back whole, or cut under some of
    the faces only, and still calls it valid (a smooth wall through five points stood 8 % too
    full). It did so where the top line touched the prism's flat top at its crests: 24 of 120
    trial walls, none since the prism stands TOP_CLEAR_MM above the top line. The cutting
    solid also runs past the wall's ends, so that its end faces do not lie in the wall's own
    (a precaution: on its own it changed none of the 120). And whatever comes back is held
    against what the wall must hold: other stations are tried where it does not agree, and a
    wall that never agrees is refused rather than drawn."""
    want = shaped_wall_volume(edge, d1, d2, band_area, below_mm, top, height_m, rise_m, waves)
    count = max(48, int(math.ceil(edge.Length / (0.25 * MM))))
    seen = []
    for extra, piece in TOP_TRIES:
        try:
            cut = solid_of(prism.cut(top_tool(edge, closed, d1, d2, z0, top, height_m, rise_m, waves, count + extra, piece)))
        except (Part.OCCError, ValueError) as exc:
            seen.append(str(exc))
            continue
        holds = volume_of(cut)
        if cut.isValid() and len(cut.Solids) == 1 and abs(holds / want - 1.0) < TOP_TOLERANCE:
            return cut
        seen.append("%+.2f %%%s" % (100.0 * (holds / want - 1.0), "" if cut.isValid() else ", not valid"))
    raise ValueError("the wall's %s top could not be cut (against what it must hold: %s)" % ("sampled" if callable(top) else top.lower(), "; ".join(seen)))


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
    shaped = callable(top) or (top != "Flat" and abs(top_rise_m) > 1e-9)
    if isinstance(edge, WirePath):
        # an outline with corners: the band between its two true offsets, corners kept
        if edge.isClosed():
            face = Part.Face(edge.wire)
            sgn = 1.0 if is_ccw(edge) else -1.0
            fa, fb = face_offset(face, -sgn * d1), face_offset(face, -sgn * d2)
            big, small = (fa, fb) if fa.Area > fb.Area else (fb, fa)
            band = face_of(big.cut(small))
        else:
            band = open_band(edge, d1, d2)
        if shaped:
            App.Console.PrintWarning("Organic: a shaped wall top needs a smooth base curve; this one has corners, so its top is flat\n")
            if callable(top):  # heights along it: flat at the lowest of them, so it stays under what it was meant to meet
                height_m = min(top(k / 200.0) for k in range(201))
            top, shaped = "Flat", False
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
    if shaped:
        peak = max(top(k / 400.0) for k in range(401)) if callable(top) else max(height_m, height_m + top_rise_m)
        prism = band.extrude(App.Vector(0, 0, (peak + foundation_m) * MM + TOP_CLEAR_MM))
        wall = cut_top(prism, edge, closed, d1, d2, z0, area_of(band), foundation_m * MM, top, height_m, top_rise_m, top_waves)
    else:
        wall = band.extrude(App.Vector(0, 0, (height_m + foundation_m) * MM))
    voids = []
    for o in openings:
        sill, high = o.get("sill_m", 0.9), o.get("sill_m", 0.9) + o.get("height_m", 1.3)
        # a sill in the wall's own bottom, a head in its flat top: the opening's solid runs on past them (see OPENING_PAST_MM)
        under = OPENING_PAST_MM if abs(sill + foundation_m) <= 1e-9 else 0.0
        over = OPENING_PAST_MM if not shaped and high >= height_m - 1e-9 else 0.0
        voids.append(opening_void(edge, closed, t, d1, d2, under_mm=under, over_mm=over, **o))
    wall = less_openings(wall, voids, [opening_middle(edge, closed, d1, d2, o["position_m"], o.get("height_m", 1.3), o.get("sill_m", 0.9)) for o in openings])
    wall.translate(App.Vector(0, 0, base_z_m * MM))
    return refined(wall)


def path_at(edge, closed, s_mm):
    """The point of a wall's base curve s_mm along it, and the horizontal unit vector to its
    left there. A closed curve goes round; past an open curve's ends it runs straight on."""
    length = edge.Length
    if closed:
        return _across(edge, edge.getParameterByLength(s_mm % length))
    inside = max(0.0, min(length, s_mm))
    p, left = _across(edge, edge.getParameterByLength(inside))
    return p + left.cross(Z) * (s_mm - inside), left  # left x Z points along the wall


def opening_middle(edge, closed, d1, d2, position_m, height_m, sill_m):
    """The middle of an opening: half-way through the wall and half-way up the opening."""
    p, left = path_at(edge, closed, position_m * MM if closed else max(0.0, min(edge.Length, position_m * MM)))
    return p + left * ((d1 + d2) / 2.0) + Z * ((sill_m + height_m / 2.0) * MM)


def less_openings(wall, voids, middles):
    """A wall less its openings' solids: all at once (one cut, however many openings), and one
    after the other where that does not hold. OCCT's cut can hand a solid back whole, or cut
    by some of the solids only, and still call it valid: so every opening's middle that lies
    in the wall before the cut must lie outside it afterwards, and a wall whose opening stays
    shut is refused rather than drawn."""
    if not voids:
        return wall
    was_in = [wall.isInside(p, 0.5, False) for p in middles]
    if len(voids) > 1:
        try:
            cut = wall.cut(voids)
            if cut.isValid() and cut.Solids and cut.Volume < wall.Volume and not any(cut.isInside(p, 0.5, False) for p, was in zip(middles, was_in) if was):
                return solid_of(cut)
        except Part.OCCError:
            pass
    for i, (void, middle, was) in enumerate(zip(voids, middles, was_in)):
        wall = solid_of(wall.cut(void))
        if was and wall.isInside(middle, 0.5, False):
            raise ValueError("the wall's opening %d could not be cut: the wall is still whole at its middle" % (i + 1))
    return wall


def opening_outline(width_m, height_m, sill_m, shape="Arch", under_m=0.0, over_m=0.0):
    """An opening's outline in (along, up) metres: straight runs, arcs, and a closing run. Its
    flat bottom is drawn under_m lower and a flat head over_m higher (see OPENING_PAST_MM)."""
    w, h, s = width_m, height_m, sill_m
    low = s - under_m
    if shape == "Arch":
        spring = max(s, s + h - w / 2)
        return [(-w / 2, low), (w / 2, low), (w / 2, spring)], [((w / 2, spring), (0.0, spring + w / 2), (-w / 2, spring))], [(-w / 2, spring)]
    if shape == "Pointed":
        spring = max(s, s + h - w * math.sqrt(3) / 2)
        c30, s30 = math.cos(math.radians(30)), math.sin(math.radians(30))
        apex = (0.0, spring + w * math.sqrt(3) / 2)
        right = ((w / 2, spring), (-w / 2 + w * c30, spring + w * s30), apex)
        left = (apex, (w / 2 - w * c30, spring + w * s30), (-w / 2, spring))
        return [(-w / 2, low), (w / 2, low), (w / 2, spring)], [right, left], [(-w / 2, spring)]
    return [(-w / 2, low), (w / 2, low), (w / 2, s + h + over_m), (-w / 2, s + h + over_m)], [], []


# A rectangular opening follows its wall (rect_void): its solid reaches this far beyond the
# wall's two faces, and is drawn through stations no further apart than this along the curve.
OPENING_REACH_MM = 200.0
OPENING_STATION_MM = 100.0
# An opening whose sill lies in the wall's own bottom (a door, on a wall without a foundation),
# or whose head lies in a flat wall's top, has its solid run this far on past that plane. Where
# the two shared it, OCCT's cut took nothing at all and said nothing: of a house's 50 openings,
# 11 doors and sliders stayed shut (their solids and the wall "shared 0.000 m3"); every one of
# them was cut once its solid started 50 mm lower.
OPENING_PAST_MM = 50.0


def rect_void(edge, closed, d1, d2, position_m, width_m, height_m, sill_m, under_mm=0.0, over_mm=0.0):
    """The solid a rectangular opening takes out of a wall on a smooth curve: the wall's own
    band between the two normals of the base curve half the width before and half the width
    after the opening's middle, from the sill up by the height. So the width is measured
    along the base curve and each jamb is square to the wall where it stands, however far the
    wall turns over the opening (the map cuts its openings the same way).

    None where the wall does not turn at all over the opening (a straight box says the same),
    and where it turns tighter than the band is wide (the band folds over itself): the caller
    then cuts straight through, square to the wall at the opening's middle."""
    length = edge.Length
    s, half = position_m * MM, width_m * MM / 2.0
    if not closed:
        s = max(0.0, min(length, s))
    n = max(8, int(math.ceil(2.0 * half / OPENING_STATION_MM)))
    places = [path_at(edge, closed, s - half + 2.0 * half * k / n) for k in range(n + 1)]
    bend = max(a[1].getAngle(b[1]) for a, b in zip(places, places[1:])) / (2.0 * half / n)  # the tightest turn between two stations, per mm
    if bend * 2.0 * half < 1e-6:
        return None
    reach = min(OPENING_REACH_MM, 0.5 * (1.0 / bend - max(abs(d1), abs(d2))))
    if reach < 10.0:
        return None
    up = Z * (sill_m * MM - under_mm)
    rows = [[p + left * d + up for p, left in places] for d in (d1 - reach, d2 + reach)]
    outline = [spline(rows[0]), Part.LineSegment(rows[0][-1], rows[1][-1]).toShape(), spline(rows[1]), Part.LineSegment(rows[1][0], rows[0][0]).toShape()]
    try:
        void = Part.Face(Part.Wire(Part.__sortEdges__(outline))).extrude(Z * (height_m * MM + under_mm + over_mm))
    except Part.OCCError:
        return None
    return void if void.isValid() and void.Volume > 0 else None


def opening_void(edge, closed, thickness_mm, d1, d2, position_m, width_m, height_m, sill_m=0.9, shape="Arch", under_mm=0.0, over_mm=0.0):
    """The solid an opening removes.

    A rectangular opening on a smooth curve follows the wall (rect_void). Every other shape,
    and any opening on an outline with corners, is its outline in the plane square to the
    centreline at position_m (metres of arc length, the opening's centre), pushed straight
    through the wall's thickness plus the bow of a curved wall over the opening's width.
    under_mm, over_mm: how far the solid runs on below its sill and above a flat head."""
    if shape == "Rect" and not isinstance(edge, WirePath):
        void = rect_void(edge, closed, d1, d2, position_m, width_m, height_m, sill_m, under_mm, over_mm)
        if void is not None:
            return void
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
        lines, arcs, closing = opening_outline(width_m, height_m, sill_m, shape, under_mm / MM, over_mm / MM if shape == "Rect" else 0.0)
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


def on_plinth(solid, plinth_m):
    """The solid with every flat face it stands on (on Z = 0) carried straight down by
    plinth_m: stem walls under a vault's springings, which reach ground that falls away
    under it. The springing line stays on Z = 0."""
    feet = [f for f in solid.Faces if max(abs(f.BoundBox.ZMin), abs(f.BoundBox.ZMax)) < 1e-6]
    if plinth_m <= 0 or not feet:
        return solid
    return fuse_all([solid] + [f.extrude(Z * (-plinth_m * MM)) for f in feet])


def vault_shape(profile, span_m, rise_m, thickness_m, length_m, ribs=0, rib_width_m=0.3, rib_depth_m=0.15, plinth_m=0.0):
    """A barrel vault along +Y, centred on the origin, springing from Z = 0, with ribs under
    it, and under its springings a plinth of plinth_m (0: none).

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
    if plinth_m > 0:
        solid = on_plinth(refined(solid), plinth_m)  # merged first: one foot under each springing, ribs and all
    solid.translate(Y * (-length_m * MM / 2))
    return refined(solid)


VAULT_STATION_MM = 250.0  # a vault on a curve is lofted through its arch at stations no further apart than this


def vault_section(profile, span_m, rise_m, thickness_m, plinth_m=0.0):
    """A vault's cross-section as one face in the XZ plane: the arch's band and, with a plinth,
    a stem under each springing."""
    band = arch_profile_face(profile, span_m, rise_m, thickness_m)
    if plinth_m <= 0:
        return band
    # the band's outline with each foot (an edge on Z = 0) replaced by three: down, across, up
    down = Z * (-plinth_m * MM)
    edges = []
    for e in band.OuterWire.Edges:
        ends = [v.Point for v in e.Vertexes]
        middle = e.valueAt((e.FirstParameter + e.LastParameter) / 2)
        if len(ends) == 2 and all(abs(p.z) < 1e-6 for p in ends + [middle]):  # a foot lies on Z = 0 (an arch only ends there)
            a, b = ends
            edges += [Part.LineSegment(a, a + down).toShape(), Part.LineSegment(a + down, b + down).toShape(), Part.LineSegment(b + down, b).toShape()]
        else:
            edges.append(e)
    return Part.Face(Part.Wire(Part.__sortEdges__(edges)))


def vault_on_curve(profile, span_m, rise_m, thickness_m, spine, plinth_m=0.0):
    """A vault whose barrel follows an open plan curve (the map's vault on a drawn spine): its
    arch, square to the curve at every place, carried along it; springing from the curve's own
    height, with a plinth under its springings. No ribs.

    The solid is lofted through the arch at stations along the curve. A section square to a
    plan curve sweeps its own area times the length its centroid travels, and the arch's
    centroid lies on the curve: the solid must hold area x length, and is refused when it does
    not (a curve that bends tighter than half the vault's width folds it)."""
    section = vault_section(profile, span_m, rise_m, thickness_m, plinth_m)
    wire = section.OuterWire
    length = spine.Length
    count = max(8, int(math.ceil(length / VAULT_STATION_MM)))
    sections = []
    for i in range(count + 1):
        u = spine.getParameterByLength(min(length, length * i / count))
        p, tan = spine.valueAt(u), spine.tangentAt(u)
        tan = App.Vector(tan.x, tan.y, 0)
        tan.normalize()
        right = tan.cross(Z)  # the section's x: to the right of the way the curve runs (a straight vault along +Y: +X)
        m = App.Matrix(right.x, tan.x, 0, p.x, right.y, tan.y, 0, p.y, 0, 0, 1, p.z, 0, 0, 0, 1)
        at = wire.copy()
        at.transformShape(m, True)  # into the geometry
        sections.append(at)
    solid = solid_of(Part.makeLoft(sections, True, False))
    want = section.Area * length
    if not solid.isValid() or abs(solid.Volume / want - 1.0) > 0.005:
        raise ValueError("the vault could not be carried along this curve (it holds %.2f %% off its section's area times the curve's length%s): "
                         "the curve bends tighter than the vault is wide" % (100.0 * (solid.Volume / want - 1.0), "" if solid.isValid() else ", and is not valid"))
    return refined(solid)


def steps_shape(low_m, high_m, width_m=1.2, count=0, foundation_m=0.3):
    """A flight of steps between two points (x, y, z in metres), as the map's build mode makes
    one: `count` treads from the lower point to the higher (0: as many as the climb needs at
    0.17 m each), the last tread at the higher point's height, every tread a block width_m
    across that stands on the ground foundation_m below the lower point. One solid.
    Returns (solid, count, each step's rise, each tread's run)."""
    low, high = tuple(float(c) for c in low_m), tuple(float(c) for c in high_m)
    if high[2] < low[2]:
        low, high = high, low
    climb = high[2] - low[2]
    run_all = math.hypot(high[0] - low[0], high[1] - low[1])
    if run_all < 0.05:
        raise ValueError("the two ends of the steps stand over each other: they need a run")
    n = int(count) if int(count) >= 1 else max(1, int(math.ceil(abs(climb) / 0.17 - 0.0001)))
    rise, run = climb / n, run_all / n
    width = max(0.3, width_m)
    bottom = low[2] - max(0.05, foundation_m)
    along = App.Vector(high[0] - low[0], high[1] - low[1], 0) * (1.0 / run_all)
    left = Z.cross(along)
    side = [(0.0, bottom), (run_all, bottom)]
    for i in reversed(range(n)):  # down the flight: each riser, then its tread
        top = low[2] + rise * (i + 1)
        side += [(run * (i + 1), top), (run * i, top)]
    outline = []
    for q in side:  # a flight with no climb has risers of no height: the same point twice
        if not outline or math.hypot(q[0] - outline[-1][0], q[1] - outline[-1][1]) > 1e-9:
            outline.append(q)
    corner = App.Vector(low[0], low[1], 0) * MM - left * (width / 2 * MM)
    pts = [corner + along * (s * MM) + Z * (z * MM) for s, z in outline]
    solid = Part.Face(Part.makePolygon(pts + [pts[0]])).extrude(left * (width * MM))
    return solid_of(solid), n, rise, run


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


DOME_WEDGES = 8  # a stretched dome is made of this many wedges about its axis (see dome_shape)


def dome_band(profile, radius_m, rise_m, thickness_m, oculus_m=0.0):
    """A dome's section in the XZ plane, on the side x >= 0 (and outside the opening at its
    crown): what is turned about Z. A sphere's is the ring between two circles about one
    centre; the other meridians' the band between the meridian and its inward offset."""
    t = thickness_m
    if profile == "Sphere":
        rho = (radius_m ** 2 + rise_m ** 2) / (2 * rise_m)
        cz = rise_m - rho
        ring = Part.Face(Part.Wire(Part.makeCircle(rho * MM, V(0, 0, cz), Y))).cut(Part.Face(Part.Wire(Part.makeCircle((rho - t) * MM, V(0, 0, cz), Y))))
        return face_of(ring.common(half_plane_xz(0.0, oculus_m * MM)))
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
    return face_of(Part.Face(wire_of(edges)).common(half_plane_xz(0.0, oculus_m * MM)))


def dome_shape(profile, radius_m, rise_m, thickness_m, oculus_m=0.0, stretch_x=1.0, stretch_y=1.0):
    """A dome shell standing on Z = 0, base circle radius R, crown at H.

    Sphere: a spherical cap less its concentric inner cap (exact). Other meridians: the band
    between the outer meridian and its inward offset, revolved about Z. stretch_x and stretch_y
    (the map's oval dome: 1.2 and 0.75 on an oval plan) stretch the round shell in plan, its
    opening with it; its thickness, measured across, stretches too.
    """
    t = thickness_m
    if abs(stretch_x - 1.0) > 1e-9 or abs(stretch_y - 1.0) > 1e-9:
        if stretch_x <= 0 or stretch_y <= 0:
            raise ValueError("a dome is stretched by a number above 0")
        # Stretched whole, a dome is the right shape with the wrong number: OCCT read a cap
        # shell's volume 1.08 % too large (its triangles enclosed the right one), because it
        # measures a face by a fixed number of points. Wedges cut from the whole dome and then
        # stretched came out not valid. So its section is turned into wedges, each is
        # stretched, and they are joined: one valid solid that reads the closed form to five
        # decimals.
        m = App.Matrix()
        m.scale(stretch_x, stretch_y, 1.0)
        band = dome_band(profile, radius_m, rise_m, t, oculus_m)
        wedges = []
        for k in range(DOME_WEDGES):
            wedge = band.revolve(App.Vector(0, 0, 0), Z, 360.0 / DOME_WEDGES)
            wedge.rotate(App.Vector(0, 0, 0), Z, 360.0 * k / DOME_WEDGES)
            wedges.append(wedge.transformGeometry(m))
        shell = solid_of(wedges[0].fuse(wedges[1:]))
        if not shell.isValid() or len(shell.Solids) != 1:
            raise ValueError("the stretched dome is not one valid solid")
        return shell
    if profile == "Sphere":
        rho = (radius_m ** 2 + rise_m ** 2) / (2 * rise_m)
        centre = V(0, 0, rise_m - rho)
        keep = Part.makeBox(4 * rho * MM, 4 * rho * MM, (rise_m + 1) * MM, V(-2 * rho, -2 * rho, 0))
        shell = Part.makeSphere(rho * MM, centre).common(keep).cut(Part.makeSphere((rho - t) * MM, centre))
    else:
        shell = dome_band(profile, radius_m, rise_m, t).revolve(App.Vector(0, 0, 0), Z, 360)
    if oculus_m > 0:
        shell = shell.cut(Part.makeCylinder(oculus_m * MM, (rise_m + t + 2) * MM, V(0, 0, -1)))
    return refined(shell)


# ---------------------------------------------------------------- leaf shells (plugin-eco eco-shell)
def leaf_plan(spine_m, span_m, outline="Ellipse", asymmetry=1.0):
    """plugin-eco's leafShellPlan: an ellipse outline L/2 x W/2 (or a pointed leaf) and the
    ridge (-L/2, 0), (-L/6, 0.2 W/13), (L/6, -0.15 W/13), (L/2, 0). asymmetry (the map's own
    number) scales how far the ridge's two inner points sit off the spine: 1 is plugin-eco's
    leaf, 0 a straight midrib and two equal halves."""
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
    ridge = [(-hl, 0.0), (-hl / 3, 0.2 * (2 * hw / 13) * asymmetry), (hl / 3, -0.15 * (2 * hw / 13) * asymmetry), (hl, 0.0)]
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
                     veins=False, vein_sources=180, vein_seed=1, asymmetry=1.0):
    """plugin-eco's leaf shell roof as a solid: its height field (eco_shell_height) fitted with a
    B-spline surface, thickened by a true normal offset and cut to the outline. Heights are
    above the object's base. Ribs, every rib_spacing along the spine, are deeper strips that
    bite into the shell from below; with `veins` they follow a leaf's venation instead, grown
    from the stem end (organic_biomimetic.venation), each as wide as Murray's law gives it.
    With a plinth, each tip of the leaf stands on a footing: the leaf's own plan within foot_m
    of the tip, solid from inside the shell down to plinth_m below the base, so a shell whose
    tips come down to the ground reaches it."""
    pts, ridge = leaf_plan(spine_m, span_m, outline, asymmetry)
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
    if isinstance(ring_edge, WirePath):
        # an outline with corners: the eave runs parallel to it, the corners kept (a spline
        # round them makes the cut below ten times slower, and rounds what is square)
        eave_face = face_offset(Part.Face(ring_edge.wire), overhang_m * MM)
    else:
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
    """A floor slab filling a closed centreline (less inset), thickness_m down from its height.
    An outline with corners (a WirePath) keeps them."""
    if isinstance(ring_edge, WirePath):
        face = face_offset(Part.Face(ring_edge.wire), -inset_m * MM)
    else:
        face = region_offset(ring_edge, -inset_m * MM)
    return solid_of(face.extrude(App.Vector(0, 0, -thickness_m * MM)))


def plan_face(closed_edge):
    """The plan face a closed curve encloses (a smooth edge, or an outline with corners)."""
    return Part.Face(closed_edge.wire) if isinstance(closed_edge, WirePath) else Part.Face(wire_of(closed_edge))


def with_holes(solid, hole_edges):
    """A solid with upright holes cut through it: one for each closed plan curve, as far up
    and down as the solid goes (a courtyard through a floor, a chimney through a roof)."""
    for edge in hole_edges:
        solid = solid_of(solid.cut(prism_of(plan_face(edge))))
    return solid


def revolved_shape(profile_rz):
    """A solid of revolution about the vertical axis through its origin: profile_rz is its
    outline as (radius, height) in metres, from one end of the axis to the other, straight
    between the points (a chimney that tapers, a round pier, a turned finial)."""
    pts = [(float(r), float(z)) for r, z in profile_rz]
    if len(pts) < 2 or any(r < 0 for r, _z in pts) or max(r for r, _z in pts) <= 0:
        raise ValueError("a solid of revolution needs at least two (radius, height) points, no radius below zero and one above it")
    ring = [V(0, 0, pts[0][1])] if pts[0][0] > 1e-9 else []
    ring += [V(r, 0, z) for r, z in pts]
    if pts[-1][0] > 1e-9:
        ring.append(V(0, 0, pts[-1][1]))
    face = Part.Face(Part.makePolygon(ring + [ring[0]]))
    return solid_of(face.revolve(App.Vector(), Z, 360))


def field_shell_shape(outline_edge, origin_xy_m, step_m, columns, heights_m, thickness_m, hole_edges=()):
    """A shell whose top is a height field: heights (m) on a square grid of step_m, row after
    row from origin_xy_m (each row along +x, the rows following in +y), `columns` to a row.
    Its plan is the closed curve outline_edge, less an upright hole for each of hole_edges; its
    thickness is measured straight down.

    The top is the smooth surface through the grid's points, cut to the plan; the solid is
    that face pushed straight down by the thickness, so it holds its plan's area times its
    thickness whatever the surface does. (Cutting the plan's prism by the solids above the
    top and below the underside, the other way to the same solid, did not finish in ten
    minutes on a roof of 30 m by 11 m.)
    Returns (solid, the plan's area in mm2)."""
    heights = [float(h) for h in heights_m]
    columns = int(columns)
    rows = len(heights) // columns if columns > 0 else 0
    if columns < 2 or rows < 2 or rows * columns != len(heights):
        raise ValueError("a height field needs at least 2 by 2 heights in whole rows (%d heights in rows of %d)" % (len(heights), columns))
    x0, y0 = origin_xy_m
    plan = plan_face(outline_edge)
    level = plan.BoundBox.ZMin
    for edge in hole_edges:
        hole = plan_face(edge)
        hole.translate(App.Vector(0, 0, level - hole.BoundBox.ZMin))  # a hole drawn at another level is the same hole
        plan = face_of(plan.cut(hole))
    box = plan.BoundBox
    if (box.XMin < x0 * MM - 1.0 or box.XMax > (x0 + (columns - 1) * step_m) * MM + 1.0
            or box.YMin < y0 * MM - 1.0 or box.YMax > (y0 + (rows - 1) * step_m) * MM + 1.0):
        raise ValueError("the height field does not reach as far as the shell's outline")
    surface = Part.BSplineSurface()
    surface.interpolate([[V(x0 + i * step_m, y0 + j * step_m, heights[j * columns + i]) for j in range(rows)] for i in range(columns)])
    top = surface.toShape().common(prism_of(plan))
    if not top.Faces:
        raise ValueError("the height field and the shell's outline do not meet")
    parts = [f.extrude(App.Vector(0, 0, -thickness_m * MM)) for f in top.Faces]
    solid = solid_of(parts[0] if len(parts) == 1 else Part.makeCompound(parts))
    if not solid.isValid():
        raise ValueError("the shell could not be built from this height field")
    return solid, area_of(plan)


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


# ---------------------------------------------------------------- shells given by a formula
# Lane R's pattern cards P-003 to P-006 (Research Architect\patterns, study S-005; the formulas
# are in Spatial Map\spatial-map\ports\FROM-RESEARCH.md): a conoid, a translation shell, a wave
# vault, groined saddles. Each is given by a formula for its underside in its own frame: x
# across, y along, z up, the origin in the middle of its footprint on the ground. Where the
# formula is a polynomial of degree two each way the surface is that polynomial exactly (one
# Bezier patch); the thickness is a true offset, upward along the surface's normal.
def quadratic_patch(xs, ys, heights):
    """The surface whose height is a polynomial of degree two or less each way, exactly, as
    one patch: xs and ys are the three poles' places each way (m; the middle one half-way),
    heights[i][j] the poles' heights (m). A quadratic f on [u0, u1] has the poles f(u0),
    f(u0) + f'(u0) (u1 - u0) / 2, f(u1); u squared has u0 squared, u0 u1, u1 squared."""
    poles = [[V(xs[i], ys[j], heights[i][j]) for j in range(3)] for i in range(3)]
    surface = Part.BSplineSurface()
    surface.buildFromPolesMultsKnots(poles, [3, 3], [3, 3], [0.0, 1.0], [0.0, 1.0], False, False, 2, 2)
    return surface.toShape()


def thicken_up(face, thickness_mm):
    """The solid on a surface: the surface is its underside, its top the surface moved by
    thickness_mm along its upward normal, its sides ruled by the normals along the edge."""
    u0, u1, v0, v1 = face.ParameterRange
    sign = 1.0 if face.normalAt((u0 + u1) / 2, (v0 + v1) / 2).z > 0 else -1.0
    slab = face.makeOffsetShape(sign * thickness_mm, 0.01, fill=True)
    if not slab.Solids:
        raise ValueError("the surface could not be given its thickness")
    solid = slab.Solids[0].toNurbs().Solids[0]
    if not solid.isValid() or solid.Volume <= 0:
        raise ValueError("the surface could not be given its thickness")
    return solid


def conoid_height(x, y, span_m, length_m, rise_m, eave_m):
    """The conoid's underside (m): a straight line sliding from a parabolic arch of rise_m at
    y = -length/2 to a level line at y = +length/2, both ends at eave_m."""
    v = (y + length_m / 2) / length_m
    return eave_m + (1 - v) * rise_m * (1 - (2 * x / span_m) ** 2)


def conoid_shape(span_m, length_m, rise_m, eave_m, thickness_m):
    """A conoid shell: every line across it from the arch to the level end is straight."""
    hs, hl = span_m / 2, length_m / 2
    arch, slide = (0.0, 2.0, 0.0), (1.0, 0.5, 0.0)  # the poles of 1 - (2x/S)^2 and of 1 - v
    face = quadratic_patch((-hs, 0.0, hs), (-hl, 0.0, hl), [[eave_m + rise_m * arch[i] * slide[j] for j in range(3)] for i in range(3)])
    return solid_of(thicken_up(face, thickness_m * MM))


def translation_height(x, y, span_m, length_m, rise_x_m, rise_y_m, eave_m):
    """The translation shell's underside (m): a parabola of rise_x_m across slid along a
    parabola of rise_y_m; the four corners at eave_m."""
    return eave_m + rise_x_m * (1 - (2 * x / span_m) ** 2) + rise_y_m * (1 - (2 * y / length_m) ** 2)


def translation_shell_shape(span_m, length_m, rise_x_m, rise_y_m, eave_m, thickness_m):
    """A translation shell over a rectangle: one arch slid along another, both curving down."""
    hs, hl = span_m / 2, length_m / 2
    arch = (0.0, 2.0, 0.0)
    face = quadratic_patch((-hs, 0.0, hs), (-hl, 0.0, hl), [[eave_m + rise_x_m * arch[i] + rise_y_m * arch[j] for j in range(3)] for i in range(3)])
    return solid_of(thicken_up(face, thickness_m * MM))


def wave_rise(y, rise_m, amplitude_m, waves, length_m):
    """A wave vault's rise at y (m): rise_m at its mean, amplitude_m more at a crest (the
    first at y = -length/2), `waves` whole waves along the length."""
    return rise_m + amplitude_m * math.cos(2 * math.pi * waves * (y + length_m / 2) / length_m)


WAVE_STATIONS = 16  # sections in one wave, at least


def wave_vault_shape(profile, span_m, rise_m, thickness_m, length_m, amplitude_m, waves, plinth_m=0.0):
    """A vault along +Y, centred on the origin, whose rise goes up and down as a wave along its
    length (Eladio Dieste's Gaussian vaults: the wave gives a thin vault depth against
    buckling). Every cross-section is the straight vault's own for the rise there, plinth and
    all; the thickness is measured in the cross-section. Returns (solid, the volume it must
    hold: its sections' areas summed along the length)."""
    if profile == "Semicircle":
        raise ValueError("a semicircle has one rise for its span: choose another profile for a wave vault")
    low = rise_m - abs(amplitude_m)
    if low <= 0.02 * span_m:
        raise ValueError("the wave is deeper than the vault is high: its troughs would lie flat (rise %.2f m, amplitude %.2f m)" % (rise_m, amplitude_m))
    count = max(8, int(math.ceil(length_m * MM / VAULT_STATION_MM)), int(math.ceil(WAVE_STATIONS * abs(waves))))
    count += count % 2  # even: the areas are summed by Simpson's rule
    wires, areas = [], []
    for i in range(count + 1):
        y = -length_m / 2 + length_m * i / count
        section = vault_section(profile, span_m, wave_rise(y, rise_m, amplitude_m, waves, length_m), thickness_m, plinth_m)
        wire = section.OuterWire.copy()
        wire.translate(Y * (y * MM))
        wires.append(wire)
        areas.append(section.Area)
    step = length_m * MM / count
    want = step / 3 * (areas[0] + areas[-1] + 4 * sum(areas[1:-1:2]) + 2 * sum(areas[2:-1:2]))
    solid = solid_of(Part.makeLoft(wires, True, False))
    if not solid.isValid() or abs(solid.Volume / want - 1.0) > 0.005:
        raise ValueError("the wave vault could not be built (it holds %.2f %% off its sections' areas summed along its length%s)"
                         % (100.0 * (solid.Volume / want - 1.0), "" if solid.isValid() else ", and is not valid"))
    return refined(solid), want


GROIN_HALF = math.pi / 8  # half a lobe: four saddles 45° apart make eight lobes


def groined_coefficients(support_r_m, tip_r_m, centre_h_m, tip_h_m):
    """(a, b) of one saddle z = centre + a u^2 - b v^2 (u along its axis, v across): its tip, at
    tip_r_m along the axis, stands tip_h_m high, and the groin where it meets the next saddle
    (22.5° off its axis) reaches the ground at support_r_m."""
    a = (tip_h_m - centre_h_m) / tip_r_m ** 2
    b = (centre_h_m / support_r_m ** 2 + a * math.cos(GROIN_HALF) ** 2) / math.sin(GROIN_HALF) ** 2
    return a, b


def groined_height(x, y, support_r_m, tip_r_m, centre_h_m, tip_h_m):
    """The underside of the groined saddles at (x, y) (m): the highest of the four saddles."""
    a, b = groined_coefficients(support_r_m, tip_r_m, centre_h_m, tip_h_m)
    r, th = math.hypot(x, y), math.atan2(y, x)
    return max(centre_h_m + r * r * (a * math.cos(th - i * math.pi / 4) ** 2 - b * math.sin(th - i * math.pi / 4) ** 2) for i in range(4))


def groined_edge(theta, support_r_m, tip_r_m):
    """How far the roof reaches from its centre in the direction theta (m): to a support at a
    groin, to a tip on a lobe's axis."""
    return support_r_m + (tip_r_m - support_r_m) * abs(math.cos(4 * theta))


def groined_saddles_shape(support_r_m, tip_r_m, centre_h_m, tip_h_m, thickness_m, edge_points=24):
    """Four saddles (hyperbolic paraboloids) about one centre, each turned 45° from the last,
    the roof being the highest of them everywhere: eight lobes that rise to their tips, eight
    groins between them that run down to eight supports on the ground (the type of Candela's
    Los Manantiales). Each lobe is its saddle exactly, made thick along its normal and cut to
    its own eighth by upright planes through the groins and an upright cut along the free edge;
    the eight are one solid."""
    if tip_r_m <= support_r_m or tip_h_m <= centre_h_m or centre_h_m <= 0:
        raise ValueError("groined saddles need their tips further out than their supports and higher than their centre, and the centre above the ground")
    a, b = groined_coefficients(support_r_m, tip_r_m, centre_h_m, tip_h_m)
    margin = 4 * thickness_m + 0.1
    u0, u1 = -margin, tip_r_m + margin
    w = max(groined_edge(p, support_r_m, tip_r_m) * math.sin(p) for p in [GROIN_HALF * k / 16 for k in range(17)]) + margin
    face = quadratic_patch((u0, (u0 + u1) / 2, u1), (-w, 0.0, w),
                           [[centre_h_m + a * du - b * dv for dv in (w * w, -w * w, w * w)] for du in (u0 * u0, u0 * u1, u1 * u1)])
    thick = thicken_up(face, thickness_m * MM)
    edge = [V(groined_edge(p, support_r_m, tip_r_m) * math.cos(p), groined_edge(p, support_r_m, tip_r_m) * math.sin(p))
            for p in [-GROIN_HALF + 2 * GROIN_HALF * k / edge_points for k in range(edge_points + 1)]]
    outline = Part.Face(wire_of([Part.LineSegment(V(0, 0), edge[0]).toShape(), spline(edge), Part.LineSegment(edge[-1], V(0, 0)).toShape()]))
    lobe = solid_of(thick.common(prism_of(outline)))
    lobes = []
    for k in range(8):
        one = lobe.copy()
        one.rotate(App.Vector(), Z, 45.0 * k)
        lobes.append(one)
    return refined(solid_of(fuse_all(lobes)))
