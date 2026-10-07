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
    """A flat face's area in mm2, to the relative error eps (see volume_of).

    For flat faces only: there it agreed with the face's own outline counted by points to the
    last digit. On a curved face it is not to be trusted: the side of a wall 12.9 m long on a
    curve through eight points, with a door cut into it, read 45.40 m2 at eps 1e-5 and 1e-7,
    42.72 at 1e-3 and 41.37 at 1e-9, each time saying its error was nought; the face's
    triangles (0.05 mm) and its top edge times its height less the door both say 41.09."""
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


# ---------------------------------------------------------------- walls that end on each other
# The rule is the old editor's (ports\FROM-ARCHITECT-EDITOR.md, entry 1 (7)) and the map's own
# (Pieces.junction_corners in the map's pieces.gd): where walls meet at a point, each wall's
# faces end where they cross its neighbours' faces, and its end is two faces through the
# meeting point. So a corner of two walls is whole (no notch outside, nothing counted twice
# inside), a wall that ends on the middle of another stops at that wall's face, and three
# walls at a point share it out between them.
MITRE_LIMIT = 10.0  # no crossing farther from the meeting point than this many half thicknesses: that face ends square
JOIN_MM = 50.0  # two wall ends closer than this are one meeting point (what the map's joining snap leaves between them)
JOINT_CLEAR_MM = 5.0  # a wall's side is taken back this far beyond where its end's corners reach
JOINT_BEHIND_MM = 1.0  # and each side must end at least this far behind its own corner, seen along the wall


def junction_corners(rays):
    """Where the faces of the walls that meet at a point cross.

    rays: one for each wall end at the point, two (there and back) for a wall that passes
    through it: {"id", "v": (x, y) its direction leaving the point, "left", "right": its two
    faces along the left normal of v, "half": half its thickness, "through": bool}, lengths
    in one unit. Taken in order round the point, each ray's left face is cut by the right
    face of the next one anticlockwise; a crossing farther off than MITRE_LIMIT half
    thicknesses (of the thicker of the two) is none, and parallel faces do not cross.
    Returns {id: {"left": (x, y), "right": (x, y)}} from the point, each only where there is
    a crossing; a wall that passes through takes nothing."""
    order = sorted(rays, key=lambda r: math.atan2(r["v"][1], r["v"][0]))
    found = {}
    if len(order) < 2:
        return found
    for i, one in enumerate(order):
        two = order[(i + 1) % len(order)]
        l1, l2 = math.hypot(*one["v"]), math.hypot(*two["v"])
        if l1 < 1e-12 or l2 < 1e-12:
            continue
        v1, v2 = (one["v"][0] / l1, one["v"][1] / l1), (two["v"][0] / l2, two["v"][1] / l2)
        p1 = (-v1[1] * one["left"], v1[0] * one["left"])
        p2 = (-v2[1] * two["right"], v2[0] * two["right"])
        det = v1[0] * v2[1] - v1[1] * v2[0]
        if abs(det) < 1e-9:
            continue
        k = ((p2[0] - p1[0]) * v2[1] - (p2[1] - p1[1]) * v2[0]) / det
        x = (p1[0] + v1[0] * k, p1[1] + v1[1] * k)
        if math.hypot(*x) > MITRE_LIMIT * max(one["half"], two["half"]):
            continue
        if not one.get("through"):
            found.setdefault(one["id"], {})["left"] = x
        if not two.get("through"):
            found.setdefault(two["id"], {})["right"] = x
    return found


def _shortened(edge, at, clear_mm):
    """(an edge without its first clear_mm from the end of it that lies at `at`, where it now
    ends on that side); None when the edge is not that long."""
    if clear_mm <= 1e-9:
        return edge, at
    if clear_mm > edge.Length - 1.0:
        return None
    first = (edge.valueAt(edge.FirstParameter) - at).Length <= (edge.valueAt(edge.LastParameter) - at).Length
    u = edge.getParameterByLength(clear_mm if first else edge.Length - clear_mm)
    piece = Part.Edge(edge.Curve, u, edge.LastParameter) if first else Part.Edge(edge.Curve, edge.FirstParameter, u)
    return piece, edge.valueAt(u)


def _trimmed_side(base, side, clear_s, clear_e, first_at, last_at):
    """A wall's side without what lies over the first clear_s and the last clear_e millimetres
    of its base curve: (its edges, its new first point, its new last point), first and last as
    the base runs. The side is an edge under a smooth base (it keeps the base's parameters) or
    a wire under an outline with corners (cut back along its first and last runs). None when
    an end run is shorter than what is to be taken off it."""
    if not isinstance(base, WirePath):
        u0, u1 = base.FirstParameter, base.LastParameter
        fa = (base.getParameterByLength(clear_s) - u0) / (u1 - u0)
        fb = (base.getParameterByLength(base.Length - clear_e) - u0) / (u1 - u0)
        s0, s1 = side.FirstParameter, side.LastParameter
        piece = Part.Edge(side.Curve, s0 + fa * (s1 - s0), s0 + fb * (s1 - s0))
        return [piece], piece.valueAt(piece.FirstParameter), piece.valueAt(piece.LastParameter)
    edges = list(side.OrderedEdges)
    p0, _t0, p1, _t1 = wire_ends(side)
    if (p0 - first_at).Length > (p1 - first_at).Length:  # the side's edges run against the base: take them the base's way
        edges.reverse()
    got = _shortened(edges[0], first_at, clear_s)
    if got is None:
        return None
    edges[0], new_first = got
    got = _shortened(edges[-1], last_at, clear_e)
    if got is None:
        return None
    edges[-1], new_last = got
    return edges, new_first, new_last


def open_band_joined(base, d1, d2, joints):
    """An open wall's plan face between its two sides (left offsets d1 < d2 in mm), its ends
    shaped where they meet other walls.

    joints: {"start": (left corner, right corner) or None, "end": the same}: where the wall's
    left face and its right face end, as vectors from the end point, left and right of the
    base curve's own direction (junction_corners finds them; a face without a crossing is
    given its square end). A joined end is two faces through the end point: in one line when
    the two corners and the point are, a V when they are not (walls of different thickness,
    three walls at a point). Each side is taken back to just beyond its corners' reach and
    runs straight from there to its corner. An end without a joint is cut square.

    None when the corners reach further along the wall than it (or its end run) is long: the
    caller then leaves both ends square."""
    is_path = isinstance(base, WirePath)
    length = base.Length
    u_s, u_e = (0.0, length) if is_path else (base.FirstParameter, base.LastParameter)
    (p_s, n_s), (p_e, n_e) = _across(base, u_s), _across(base, u_e)
    out_s, out_e = n_s.cross(Z) * -1.0, n_e.cross(Z)  # the way out of the wall at each end (left x Z runs along the wall)

    def clear_of(corners, out):
        return 0.0 if not corners else max(abs(c.dot(out)) for c in corners) + JOINT_CLEAR_MM

    at_s, at_e = joints.get("start"), joints.get("end")
    clear_s, clear_e = clear_of(at_s, out_s), clear_of(at_e, out_e)
    for _ in range(8):
        if clear_s + clear_e > length - 10.0:
            return None
        edges, ends = [], []
        for d in (d1, d2):
            side = open_side(base.wire, d) if is_path else _side(base, d, False)
            got = _trimmed_side(base, side, clear_s, clear_e, p_s + n_s * d, p_e + n_e * d)
            if got is None:
                return None
            edges += got[0]
            ends.append((got[1], got[2]))
        (a0, a1), (b0, b1) = ends  # the right side's two ends, the left side's
        # each side must end behind its corner, seen along the wall: on a bend a side's end does not lie square
        # behind the wall's own end (the inner side's runs ahead of it), and a side that passed its corner would
        # fold the outline over itself. Where one does not, both are taken back further and the band is made again
        short_s = max([JOINT_BEHIND_MM - (p_s + c - q).dot(out_s) for c, q in ((at_s[1], a0), (at_s[0], b0))]) if at_s else 0.0
        short_e = max([JOINT_BEHIND_MM - (p_e + c - q).dot(out_e) for c, q in ((at_e[1], a1), (at_e[0], b1))]) if at_e else 0.0
        if short_s <= 0.0 and short_e <= 0.0:
            break
        clear_s += max(0.0, short_s) + (JOINT_CLEAR_MM if short_s > 0.0 else 0.0)
        clear_e += max(0.0, short_e) + (JOINT_CLEAR_MM if short_e > 0.0 else 0.0)
    else:
        return None
    for pa, pb, point, corners in ((a0, b0, p_s, at_s), (a1, b1, p_e, at_e)):
        if corners:
            left, right = corners
            run = [pa, point + right, point, point + left, pb]
        else:
            run = [pa, pb]
        for q0, q1 in zip(run, run[1:]):
            if (q1 - q0).Length > 1e-6:
                edges.append(Part.LineSegment(q0, q1).toShape())
    try:
        # (through wire_of: a side that is one long spline is split, or FreeCAD's own Volume reads the wall percent short,
        # see pieces_of; a wall 12.9 m long on a curve through eight points read 4 % short with each side in one piece)
        face = Part.Face(wire_of(edges))
    except Part.OCCError:
        return None
    return face if face.isValid() and face.Area > 0 else None


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
    spread evenly along the centreline's length.

    Past an open wall's ends (where only the top's tools reach) the line runs on at its slope
    there: held level, it bent the tool's spline at the end, and the top lay up to 6 mm under
    the line within the last quarter metre of a steep wall (1.7 mm on a gentle one)."""
    heights = [float(h) for h in heights]
    n = len(heights)
    spans = n if closed else n - 1
    length = edge.Length
    u0 = edge.FirstParameter

    def on(f):
        v = (edge.getParameterByLength(f * length) - u0) if at_points else f * spans
        return through_heights(heights, v, closed)

    def top(f):
        if closed:
            return on(f % 1.0)
        if f < 0.0:
            return on(0.0) + f * (on(1e-4) - on(0.0)) / 1e-4
        if f > 1.0:
            return on(1.0) + (f - 1.0) * (on(1.0) - on(1.0 - 1e-4)) / 1e-4
        return on(f)

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


# A wall on an outline with corners (a WirePath) has its shaped top too (E's piece 6, 3 Oct 2026:
# it was made flat at its lowest, and a retaining wall with heights along it lost its last one).
# Its top is level along lines across it: square to each run inside the run, along the mitre at
# each corner (the line that halves the corner), at the corner's own height, the same line for the
# two runs that meet there. From a corner to the first square line the lines turn evenly from the
# one to the other; that line stands off the corner twice as far as the mitre reaches along the run.
# The turn is laid out in TURN_LINES steps at least: with the mitre and the square line alone, a
# spline through them, OCCT's common with the piece of the tool there came back empty (a steep
# right angle standing left of its line: the cut held 8 to 21 % too much, at every try).
TURN_LINES = 5


def _level(v):
    """A vector laid flat and made a unit long."""
    w = App.Vector(v.x, v.y, 0.0)
    w.normalize()
    return w


def corner_mitre(t_in, t_out):
    """Where an outline turns from the direction t_in to t_out (flat unit vectors): the vector
    along the corner's mitre to the left of the outline that reaches a point one millimetre to
    the left of it (the mitre's unit vector over the cosine of half the turn)."""
    l_in, l_out = Z.cross(t_in), Z.cross(t_out)
    m = l_in + l_out
    if m.Length < 1e-6:
        raise ValueError("the outline turns straight back on itself at a corner")
    m.normalize()
    return m * (1.0 / m.dot(l_in))


def corner_sections(path, closed, offsets, step_mm, end_mm=0.0):
    """The lines across a wall on an outline with corners along which its shaped top is level,
    run by run: [[(f, s, base, across, kind)]], f the fraction of the outline's length where a
    line crosses it (s, in mm), a point d mm to the left of the outline on it at base + across * d.
    kind: "square" inside a run (one at least every step_mm) and at an open end, "mitre" at a
    corner (the two runs that meet there share it), "turn" between a mitre and the next line
    (blended evenly from the one to the other, TURN_LINES steps at least), "past" end_mm on
    past an open end, straight on (no part of the wall). `offsets`: how far to the left (mm)
    the lines are to reach; the first square line off a corner stands twice as far from it as
    the mitre reaches along the run there, so a line through the points at one offset runs on
    evenly enough that a spline through it does not turn back. ValueError where a run is too
    short for its corners: the wall's sides would cross over it."""
    length = path.Length
    runs = []
    for e, forward, start in path.parts:
        a, b = e.tangentAt(e.FirstParameter), e.tangentAt(e.LastParameter)
        t0, t1 = (a, b) if forward else (b * -1.0, a * -1.0)
        runs.append((start, e.Length, _level(t0), _level(t1)))
    n = len(runs)
    corner = [None] * n  # at each run's start: (the corner, its mitre's vector to the left)
    for i in range(n):
        if i or closed:
            corner[i] = (path.valueAt(runs[i][0]), corner_mitre(runs[i - 1][3], runs[i][2]))
    out = []
    for i, (start, run, t0, t1) in enumerate(runs):
        at0, at1 = corner[i], (corner[(i + 1) % n] if closed or i < n - 1 else None)
        reach0 = max([0.0] + [at0[1].dot(t0) * d for d in offsets]) if at0 else 0.0  # how far the mitres reach into the run
        reach1 = max([0.0] + [-at1[1].dot(t1) * d for d in offsets]) if at1 else 0.0
        lo = start + (max(2.0 * reach0, 1.0) if at0 else 0.0)
        hi = start + run - (max(2.0 * reach1, 1.0) if at1 else 0.0)
        if hi - lo >= 1.0:
            k = max(1, int(math.ceil((hi - lo) / step_mm)))
            places = [lo + (hi - lo) * j / k for j in range(k + 1)]
        else:  # the two corners' turns meet: only an open end's own square line between them
            places = [s for s, at in ((start, at0), (start + run, at1)) if at is None]
        lines = [(start / length, start, at0[0], at0[1], "mitre")] if at0 else []
        for s in places:
            p, left = _across(path, s)
            lines.append((s / length, s, p, left, "square"))
        if at1:
            lines.append(((start + run) / length, start + run, at1[0], at1[1], "mitre"))
        turned = lines[:1]  # from a mitre to the next line the lines turn evenly, each laid out
        for a, b in zip(lines, lines[1:]):
            if "mitre" in (a[4], b[4]):
                k = max(TURN_LINES, int(math.ceil((b[1] - a[1]) / step_mm)))
                for j in range(1, k):
                    t = j / float(k)
                    turned.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t, "turn"))
            turned.append(b)
        lines = turned
        if not closed and end_mm > 0 and i == 0:
            f, s, p, left, _kind = lines[0]
            lines.insert(0, (-end_mm / length, s, p - t0 * end_mm, left, "past"))
        if not closed and end_mm > 0 and i == n - 1:
            f, s, p, left, _kind = lines[-1]
            lines.append((1.0 + end_mm / length, s, p + t1 * end_mm, left, "past"))
        for a, b in zip(lines, lines[1:]):
            way = _level(path.tangentAt(min(max(0.5 * (a[1] + b[1]), start), start + run)))
            if any(((b[2] + b[3] * d) - (a[2] + a[3] * d)).dot(way) < 0.5 for d in offsets):
                raise ValueError("a run %.3f m long is too short for the corners at its ends: the wall's sides would cross over it" % (run / MM))
        out.append(lines)
    return out


def corner_wall_volume(path, closed, d1, d2, band_area, below_mm, top, height_m, rise_m, waves, count, step_mm=25.0):
    """shaped_wall_volume on an outline with corners: strips between the lines along which the
    top is level (corner_sections, laid as corner_top_tool lays them), from face to face, one at
    least every step_mm, each as tall as the top at its middle; inside a run the lines square to
    it, from a corner's mitre to the first square line the two blended; together scaled to the
    band's own area."""
    area = volume = 0.0
    for lines in corner_sections(path, closed, (d1 - TOP_MARGIN_MM, d2 + TOP_MARGIN_MM), path.Length / float(count)):
        lines = [x for x in lines if x[4] != "past"]
        cuts = []
        for a, b in zip(lines, lines[1:]):
            k = max(1, int(math.ceil((b[1] - a[1]) / step_mm)))
            for j in range(k):
                t = j / float(k)
                if a[4] == b[4] == "square":
                    p, across = _across(path, a[1] + (b[1] - a[1]) * t)
                else:
                    p, across = a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t
                cuts.append((a[0] + (b[0] - a[0]) * t, p + across * d1, p + across * d2))
        f, _s, p, across, _kind = lines[-1]
        cuts.append((f, p + across * d1, p + across * d2))
        for (fa, a1, a2), (fb, b1, b2) in zip(cuts, cuts[1:]):
            strip = abs(0.5 * (b2 - a1).cross(a2 - b1).z)
            area += strip
            volume += strip * (below_mm + top_height(top, height_m, rise_m, waves, 0.5 * (fa + fb)) * MM)
    return volume * band_area / area


def corner_top_tool(path, closed, d1, d2, z0, top, height_m, rise_m, waves, count, piece):
    """top_tool on an outline with corners: run by run, ruled faces between two lines through
    the points of corner_sections TOP_MARGIN_MM beyond the wall's two faces, each point at the
    top's height at its line (the top level along it), `piece` lines to a face, pushed upwards.
    The two runs at a corner share its mitre, so their faces meet there."""
    offsets = (d1 - TOP_MARGIN_MM, d2 + TOP_MARGIN_MM)
    solids = []
    for lines in corner_sections(path, closed, offsets, path.Length / float(count), 0.0 if closed else TOP_END_MM):
        params = [x[0] for x in lines]
        rows = [[], []]
        for f, _s, p, across, _kind in lines:
            z = z0 + top_height(top, height_m, rise_m, waves, f) * MM
            for row, d in zip(rows, offsets):
                q = p + across * d
                row.append(App.Vector(q.x, q.y, z))
        n = max(1, int(math.ceil(len(params) / float(piece))))
        cuts = [params[0] + (params[-1] - params[0]) * k / n for k in range(1, n)]
        e0, e1 = spline(rows[0], False, params), spline(rows[1], False, params)
        w0 = Part.Wire(e0.split(cuts).Edges) if cuts else Part.Wire(e0)
        w1 = Part.Wire(e1.split(cuts).Edges) if cuts else Part.Wire(e1)
        solids.extend(Part.makeRuledSurface(w0, w1).extrude(App.Vector(0, 0, BIG)).Solids)
    return Part.makeCompound(solids)


def top_tool(edge, closed, d1, d2, z0, top, height_m, rise_m, waves, count, piece):
    """The solid above a shaped wall top: ruled faces through the top line at `count` stations
    of arc length, `piece` stations to a face, pushed upwards (on an outline with corners:
    corner_top_tool).

    Both top lines are split at the same parameters, so the ruled faces pair up and each stays
    short enough for OCCT to measure (see pieces_of and TOP_PIECE_STATIONS)."""
    if isinstance(edge, WirePath):
        return corner_top_tool(edge, closed, d1, d2, z0, top, height_m, rise_m, waves, count, piece)
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
    count = max(48, int(math.ceil(edge.Length / (0.25 * MM))))
    if isinstance(edge, WirePath):
        want = corner_wall_volume(edge, closed, d1, d2, band_area, below_mm, top, height_m, rise_m, waves, count)
    else:
        want = shaped_wall_volume(edge, d1, d2, band_area, below_mm, top, height_m, rise_m, waves)
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


def plan_band(edge, closed, d1, d2, joined=None):
    """A wall's plan: the band between its two faces, d1 and d2 to the left of its base curve
    (mm), as a face at the curve's own level. joined: an open wall's band with its ends already
    shaped where it meets other walls (open_band_joined), taken as it is."""
    if isinstance(edge, WirePath):
        # an outline with corners: the band between its two true offsets, corners kept
        if edge.isClosed():
            face = Part.Face(edge.wire)
            sgn = 1.0 if is_ccw(edge) else -1.0
            fa, fb = face_offset(face, -sgn * d1), face_offset(face, -sgn * d2)
            big, small = (fa, fb) if fa.Area > fb.Area else (fb, fa)
            return face_of(big.cut(small))
        return joined if joined is not None else open_band(edge, d1, d2)
    if closed:
        fa = Part.Face(wire_of(_side(edge, d1, closed)))
        fb = Part.Face(wire_of(_side(edge, d2, closed)))
        if not (fa.isValid() and fb.isValid()):
            # an offset folded where the curve bends tighter than half the wall:
            # OCCT's region offset removes the loops (left of a counter-clockwise ring is inside)
            sgn = 1.0 if is_ccw(edge) else -1.0
            fa, fb = region_offset(edge, -sgn * d1), region_offset(edge, -sgn * d2)
        big, small = (fa, fb) if fa.Area > fb.Area else (fb, fa)
        return face_of(big.cut(small))
    if joined is not None:
        return joined
    a, b = _side(edge, d1, closed), _side(edge, d2, closed)
    pa0, pa1 = a.valueAt(a.FirstParameter), a.valueAt(a.LastParameter)
    pb0, pb1 = b.valueAt(b.FirstParameter), b.valueAt(b.LastParameter)
    return Part.Face(wire_of([a, Part.LineSegment(pa1, pb1).toShape(), b, Part.LineSegment(pb0, pa0).toShape()]))


def wall_shape(edge, closed, thickness_m, height_m, align="Center", top="Flat", top_rise_m=0.0,
               top_waves=1, openings=(), base_z_m=0.0, foundation_m=0.0, joints=None, said=None):
    """A wall of constant thickness on a horizontal centreline, with a shaped top and openings.

    The plan is the band between the two offset curves (exact offsets of the centreline), so
    a curved wall has true concentric faces. It is extruded from the foundation to its
    highest point, and a shaped top is cut by a ruled surface through the top line.
    Openings are measured from the wall's base (base_z_m), not from the foundation.

    On an outline with corners (a WirePath) the top is level along each corner's mitre, at the
    corner's height (corner_top_tool).

    joints: where an open wall's ends meet other walls ({"start": (left corner, right corner),
    "end": the same}, see open_band_joined). A wall with a shaped top keeps its ends square,
    on any base: its top line is given along its own length only.
    said: a dict to be told what was done with the joints: said["joined"] is whether the
    wall's ends were shaped by them (False: they were given and the ends are square all the same).
    """
    t = thickness_m * MM
    z0 = edge.valueAt(edge.FirstParameter).z
    d1, d2 = wall_sides(align, t)
    shaped = callable(top) or (top != "Flat" and abs(top_rise_m) > 1e-9)
    joined = None
    if joints and not closed and (joints.get("start") or joints.get("end")):
        if not shaped:
            joined = open_band_joined(edge, d1, d2, joints)
            if joined is None:
                App.Console.PrintWarning("Organic: where this wall meets another its corners reach further than it is long; its ends are left square\n")
    if said is not None:
        said["joined"] = joined is not None
    band = plan_band(edge, closed, d1, d2, joined)
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


BAND_FOLD = 0.8  # no band or hung member where its side on the inside of a turn lies further into it than this share of the turn's radius: it would fold over itself
BAND_STEP_MM = 100.0  # the lines across a band or a hung member stand no further apart than this along it
# no member of a building is a kilometre long: a curve that long had its metres taken as millimetres (V() takes metres;
# on 6 Oct a leaf's midrib given to it in millimetres came out 11.28 km long and held OCCT's ruled faces for 15 minutes)
MEMBER_LONGEST_MM = 1.0e6
BAND_LOW_MM = 5.0  # no band where the roof's underside stands less than this over the wall's top (at the band's middle)
BAND_EDGE_MM = 1.0  # where a band or a member ends or steps, found to this
BAND_STRIP_MM = 25.0  # what a band or a member must hold is counted in strips no wider than this across it
BAND_TOLERANCE = 0.005  # how far (a share of it) its solid may lie from what its strips say it holds


def _place(edge, closed, length, f):
    """(f as a fraction of the curve, the curve's parameter, its point, the unit vector to its left) at f (any number on a
    closed curve)."""
    g = f % 1.0 if closed else min(1.0, max(0.0, f))
    u = edge.getParameterByLength(g * length)
    p, left = _across(edge, u)
    return g, u, p, left


def _folds(edge, d1, d2):
    """folds(u, p, left): whether a thing between d1 and d2 (mm to the left of `edge`) would fold at u: its side on the
    inside of the turn there lies further into it than BAND_FOLD of the radius."""
    def folds(u, p, left):
        try:
            k = edge.curvatureAt(u)
            if k <= 1e-9:
                return False
            into = left.dot(edge.centerOfCurvatureAt(u) - p) > 0  # the turn's centre lies to the left
        except (Part.OCCError, AttributeError):  # (no centre where the curve runs straight)
            return False
        return d2 * k > BAND_FOLD if into else -d1 * k > BAND_FOLD
    return folds


def _stretches(length, closed, state, step_mm=None):
    """Where a thing along a curve `length` mm long is, and in which state: [(from, to, state, ring)] as fractions of the
    curve (on a closed one they may run past 1), from state(f), None where it is not there: places at even steps (no
    further apart than BAND_STEP_MM, 96 at least), each change found to BAND_EDGE_MM by halving. A closed curve in one
    state all round is one ring; a stretch shorter than ten times BAND_EDGE_MM is left out."""
    count = max(96, int(math.ceil(length / (step_mm or BAND_STEP_MM))))
    steps = [i / float(count) for i in range(count + (0 if closed else 1))]
    states = [state(f) for f in steps]
    if all(s is None for s in states):
        return []

    def change(fa, fb, was):
        """Between fa (in the state `was`) and fb (another): (the last fraction as at fa, the first as at fb)."""
        while (fb - fa) * length > BAND_EDGE_MM:
            fm = 0.5 * (fa + fb)
            if state(fm) == was:
                fa = fm
            else:
                fb = fm
        return fa, fb

    n = len(steps)
    if all(s == states[0] for s in states):
        return [(0.0, 1.0, states[0], closed)]
    if closed:  # the walk round begins just after a change, so that no stretch runs over the seam unseen
        k0 = next(i for i in range(n) if states[i] != states[i - 1])
        order = [(k0 + i) % n for i in range(n)]
        fs = [steps[i] + (1.0 if i < k0 else 0.0) for i in order]
    else:
        order, fs = list(range(n)), list(steps)
    ss = [states[i] for i in order]
    changes = []  # (the walk's index where the new state begins, the last fraction of the old, the first of the new)
    for j in range(1, n + 1 if closed else n):
        prev, cur = j - 1, j % n
        if ss[prev] != ss[cur]:
            changes.append((j,) + change(fs[prev], fs[cur] + (1.0 if j == n else 0.0), ss[prev]))
    if closed:  # the walk began just after the change at its end: that change opens the first stretch
        starts = [(0, changes[-1][2] - 1.0)] + [(j, fb) for j, _fa, fb in changes[:-1]]
        ends = [fa for _j, fa, _fb in changes]
    else:
        starts = [(0, 0.0)] + [(j, fb) for j, _fa, fb in changes]
        ends = [fa for _j, fa, _fb in changes] + [1.0]
    return [(fa, fb, ss[j % n], False) for (j, fa), fb in zip(starts, ends)
            if ss[j % n] is not None and (fb - fa) * length > 10.0 * BAND_EDGE_MM]


def _lined_solid(made, ring, length):
    """A solid through lines across it: made = [(f, (foot a, foot b), (head a, head b))], f a fraction of a curve `length`
    mm long; four ruled faces through the lines (bottom, the two sides, top; across, each face runs straight from line to
    line), ruled edge by edge (between two wires of many edges, a flat bottom came out not valid), and a flat face at each
    end (none on a ring). Returns (the solid, what its strips say it holds, mm³): strips no wider than BAND_STRIP_MM
    between the lines, each as tall as its middle."""
    params = [m[0] for m in made] + ([made[0][0] + 1.0] if ring else [])
    rows = [[m[1][0] for m in made], [m[1][1] for m in made], [m[2][1] for m in made], [m[2][0] for m in made]]  # feet a, b; heads b, a
    pieces = max(1, int(math.ceil(len(params) / float(TOP_PIECE_STATIONS))))
    cuts = [params[0] + (params[-1] - params[0]) * i / pieces for i in range(1, pieces)]
    edges = []
    for row in rows:
        e = spline(row, ring, params)
        edges.append(list(e.split(cuts).Edges) if cuts else [e])
    faces = []
    for r0, r1 in zip(edges, edges[1:] + edges[:1]):  # bottom (feet a to b), side b (foot to head), top (heads b to a), side a (head to foot)
        for e0, e1 in zip(r0, r1):
            faces.append(Part.makeRuledSurface(e0, e1))
    for m in ((made[0], made[-1]) if not ring else ()):
        faces.append(Part.Face(Part.makePolygon([m[1][0], m[1][1], m[2][1], m[2][0], m[1][0]])))
    shell = Part.Shell(faces)
    shell.sewShape()
    solid = Part.Solid(shell)
    if solid.Volume < 0:
        solid.reverse()
    want = 0.0
    for m0, m1 in zip(made, made[1:] + (made[:1] if ring else [])):
        j = max(1, int(math.ceil(((m1[0] - m0[0]) % 1.0 if ring else m1[0] - m0[0]) * length / BAND_STRIP_MM)))
        for i in range(j):
            t0, t1 = i / float(j), (i + 1) / float(j)
            q = [m0[1][0] + (m1[1][0] - m0[1][0]) * t for t in (t0, t1)], [m0[1][1] + (m1[1][1] - m0[1][1]) * t for t in (t0, t1)]
            quad = [q[0][0], q[1][0], q[1][1], q[0][1]]
            strip = abs(sum(quad[c].x * quad[(c + 1) % 4].y - quad[(c + 1) % 4].x * quad[c].y for c in range(4))) / 2.0
            tm = 0.5 * (t0 + t1)
            foot = 0.5 * ((m0[1][0].z + (m1[1][0].z - m0[1][0].z) * tm) + (m0[1][1].z + (m1[1][1].z - m0[1][1].z) * tm))
            head = 0.5 * ((m0[2][0].z + (m1[2][0].z - m0[2][0].z) * tm) + (m0[2][1].z + (m1[2][1].z - m0[2][1].z) * tm))
            want += strip * (head - foot)
    return solid, want


def _lined_runs(runs, line, steps_of, length, what, step_mm=None):
    """The solids of a band or a member from its stretches: runs = [(from, to, state, ring)], line(f, state) the line across
    at f; each stretch's lines no further apart than BAND_STEP_MM (on a ring: steps_of, its even places). Returns (the
    solids, what their strips say, the lines made), and raises when a solid is not valid or does not hold what its strips
    say (`what` names it)."""
    solids, want, lines_made = [], 0.0, 0
    for fa, fb, st, ring in runs:
        if ring:
            made = [line(f, st) for f in steps_of]
        else:
            k = max(2, int(math.ceil((fb - fa) * length / (step_mm or BAND_STEP_MM))))
            made = [line(fa + (fb - fa) * j / k, st) for j in range(k + 1)]
        lines_made += len(made)
        solid, holds = _lined_solid(made, ring, length)
        solids.append(solid)
        want += holds
    holds = sum(volume_of(s) for s in solids)
    if solids and (not all(s.isValid() for s in solids) or abs(holds - want) > BAND_TOLERANCE * want):
        raise ValueError("%s could not be made: %d solid(s), valid %s, %.4f m³ where its strips say %.4f"
                         % (what, len(solids), all(s.isValid() for s in solids), holds / 1e9, want / 1e9))
    return solids, want, holds, lines_made


def wall_band_shape(edge, closed, d1, d2, z0, top, height_m, rise_m, waves, roofs, said=None):
    """The band between a wall's top and the underside of the roofs over it (Johny's answer
    5 on his house, 3 Oct 2026: closed with glass or with the wall carried up, both, to
    compare): the plan between d1 and d2 (mm to the left of the wall's base curve), from the
    wall's top line (z0 in mm, plus the top as wall_shape reads it: a function of the fraction
    along the wall, or a name with height_m, rise_m and waves) up to the underside of the
    lowest roof over it. roofs: [(under, zone)] in this frame: under(x, y) the height of a
    roof's underside over a plan point in mm (it answers past the roof's plan too), zone the
    roof's plan as a shapely polygon, its outline less its holes (plan_zone).

    Made from its own faces, with no boolean (four ways of cutting it out of a prism by tools
    failed in silence on Johny's mezzanine wall: empty, in pieces, 2 to 3 % short piece by
    piece, or kept whole where most of it lies under no roof). Along the wall, the roof the
    band runs up to: of the roofs over its line across (those whose plan meets it anywhere
    between the band's two sides: a courtyard wall stands right under the rim of the roof's
    hole over the courtyard, half its band under the roof), the lowest at the band's middle.
    There is a band where there is such a roof and its underside stands at least BAND_LOW_MM
    over the wall's top at the middle, and where the wall does not turn tighter than the band
    can follow (its side on the inside of the turn further into it than BAND_FOLD of the
    radius would fold over itself; the mezzanine's outline turns on 35 mm where it closes).
    The band is made in stretches, one for each roof it runs up to, each ending square where
    there is no band any more or where the roof over it changes (a step: the spec's own
    "stepped glazing at shell seams"; a smooth line through the step overshot), found to
    BAND_EDGE_MM (_stretches). A stretch is lines across it at least every BAND_STEP_MM: the
    band's two sides, the wall's top there (level across), and over each side its roof's
    underside (read on past the roof's edge where a side lies beyond it); four ruled faces
    through those lines and a flat face at each end (_lined_solid). A band that runs all round
    a closed wall up to one roof is one ring. What the solids hold is held against strips
    counted along the same lines.
    said: a dict to be told the stretches (from, to, as fractions of the wall, and the roof's
    index), the lines, what the strips say and what the solids hold. Returns a solid, a
    compound of solids, or None (no band anywhere along the wall)."""
    if not roofs:
        return None
    if isinstance(edge, WirePath):
        raise ValueError("a band to the roof on a wall with corners is not built yet")
    from shapely.geometry import LineString

    zones = [zone for _under, zone in roofs]
    length = edge.Length
    folds = _folds(edge, d1, d2)

    def roof_at(f):
        """The index of the roof the band runs up to at f, or None where there is no band."""
        g, u, p, left = _place(edge, closed, length, f)
        if folds(u, p, left):
            return None
        qa, qb = p + left * d1, p + left * d2
        across = LineString([(qa.x, qa.y), (qb.x, qb.y)])
        middle = p + left * (0.5 * (d1 + d2))
        lows = []
        for r, zone in enumerate(zones):
            if zone.intersects(across):  # a roof is over the band where its plan meets the line across it
                try:
                    lows.append((roofs[r][0](middle.x, middle.y), r))
                except ValueError:
                    continue
        if not lows:
            return None
        head, r = min(lows)
        return r if head - (z0 + top_height(top, height_m, rise_m, waves, g) * MM) >= BAND_LOW_MM else None

    def line(f, r):
        """The band's line across at f, up to roof r: (f, its two sides' feet, their heads)."""
        g, _u, p, left = _place(edge, closed, length, f)
        bottom = z0 + top_height(top, height_m, rise_m, waves, g) * MM
        feet, zs = [], []
        for d in (d1, d2):
            q = p + left * d
            feet.append(App.Vector(q.x, q.y, bottom))
            try:
                zs.append(roofs[r][0](q.x, q.y))
            except ValueError:
                zs.append(None)
        if zs[0] is None and zs[1] is None:
            raise ValueError("the underside of the roof over the band could not be read at %.3f of the wall" % g)
        zs = [z if z is not None else next(o for o in zs if o is not None) for z in zs]
        return f, feet, [App.Vector(q.x, q.y, max(z, bottom + 1.0)) for q, z in zip(feet, zs)]

    runs = _stretches(length, closed, roof_at)
    if not runs:
        return None
    count = max(96, int(math.ceil(length / BAND_STEP_MM)))
    solids, want, holds, lines_made = _lined_runs(runs, line, [i / float(count) for i in range(count)], length, "the band")
    if said is not None:
        said.update({"stretches": [(round(a, 4), round(b, 4), r) for a, b, r, _ring in runs], "lines": lines_made, "want_m3": round(want / 1e9, 4),
                     "holds_m3": round(holds / 1e9, 4), "solids": len(solids)})
    if not solids:
        return None
    return solids[0] if len(solids) == 1 else Part.makeCompound(solids)


def hung_member_shape(edge, closed, d1, d2, under, depth_mm, said=None, what="the member", zone=None, step_mm=None):
    """A member hung under a roof's underside along a plan curve (a rib, an edge beam, a ring:
    RoofFrame): between d1 and d2 (mm to the left of `edge`), its top on the underside at its
    two sides (under(x, y), mm; straight across), its bottom depth_mm under its top, straight
    down. Made from its own faces as the band to the roof is (_stretches, _lined_solid);
    where the curve turns tighter than it can follow it leaves a gap, and where its middle line
    lies outside `zone` (a shapely polygon, when given) there is none of it; all round a closed
    curve it is one ring. said: told its stretches, lines, what its strips say and what it holds.
    step_mm: its lines across no further apart than this (BAND_STEP_MM when not given; a small
    leaf's toothed edge needs them closer, its teeth being as small as the leaf).
    Returns its solids (a list, empty where there is none)."""
    from shapely.geometry import Point

    length = edge.Length
    if length > MEMBER_LONGEST_MM:
        raise ValueError("%s would be %.0f m long: its curve is not in millimetres" % (what, length / MM))
    folds = _folds(edge, d1, d2)

    def there(f):
        _g, u, p, left = _place(edge, closed, length, f)
        if folds(u, p, left):
            return None
        if zone is not None:
            q = p + left * (0.5 * (d1 + d2))
            if not zone.contains(Point(q.x, q.y)):
                return None
        return True

    def line(f, _state):
        _g, _u, p, left = _place(edge, closed, length, f)
        heads = []
        for d in (d1, d2):
            q = p + left * d
            heads.append(App.Vector(q.x, q.y, under(q.x, q.y)))
        return f, [h - App.Vector(0, 0, depth_mm) for h in heads], heads

    runs = _stretches(length, closed, there, step_mm)
    count = max(96, int(math.ceil(length / (step_mm or BAND_STEP_MM))))
    solids, want, holds, lines_made = _lined_runs(runs, line, [i / float(count) for i in range(count)], length, what, step_mm)
    if said is not None:
        said.update({"stretches": [(round(a, 4), round(b, 4)) for a, b, _s, _ring in runs], "lines": lines_made,
                     "want_m3": round(want / 1e9, 6), "holds_m3": round(holds / 1e9, 6), "solids": len(solids)})
    return solids


RIB_REACH_MM = 1000.0  # a rib whose station lies further than this outside its shell's plan (less the edge beam) is left out, and said


def ridge_stations(points_mm, count):
    """Stations at both ends of a ridge axis (straight runs between its points, in plan) and evenly between, by its
    length in plan: [(the station, the unit vector square to the axis there, to its left)]; at a point of the axis, square
    to the mean of its two runs."""
    pts = [App.Vector(p.x, p.y, 0.0) for p in points_mm]
    runs = [(a, b, (b - a).Length) for a, b in zip(pts, pts[1:]) if (b - a).Length > 1e-6]
    total = sum(l for _a, _b, l in runs)
    if count < 1 or not runs:
        return []
    out = []
    for k in range(count):
        s = total * k / float(count - 1) if count > 1 else total / 2.0
        at = 0.0
        for i, (a, b, l) in enumerate(runs):
            if s <= at + l + 1e-6 or i == len(runs) - 1:
                t = min(1.0, max(0.0, (s - at) / l))
                p = a + (b - a) * t
                d = b - a
                d.normalize()
                if t > 1.0 - 1e-9 and i < len(runs) - 1:  # on a point of the axis: the mean of its two runs
                    e = runs[i + 1][1] - runs[i + 1][0]
                    e.normalize()
                    d = d + e
                    d.normalize()
                out.append((p, App.Vector(-d.y, d.x, 0.0)))
                break
            at += l
    return out


def roof_frame_shape(outline, holes, under, ridge, ribs, rib_w, rib_d, edge_w, edge_d, rings, said=None):
    """A roof's frame under its shell (RoofFrame; Johny's point 7, its first step): its edge beam along the outline,
    inside it, edge_w wide and edge_d deep; a ring round each hole, outside it, of the same section (when `rings`); and
    `ribs` complete transverse ribs, rib_w wide and rib_d deep, from their stations on the ridge axis (ridge_stations)
    square to it, both ways, to the edge beam, stopping at a ring where they meet a hole: the transverse line's piece
    through the station of the plan less the edge beam and less the holes grown by the rings (shapely), each piece a
    member. Every member hangs under the underside (hung_member_shape): under(x, y), mm, in the outline's own frame
    (holes, ridge points too). Returns a compound of all their solids; `said` is told what was made: the stations, the
    rib pieces and their lengths, the members' volumes, and what was left out and why."""
    from shapely.geometry import LineString, Point, Polygon
    from shapely.ops import unary_union

    def ring_of(edge):
        return [(q.x, q.y) for q in edge.discretize(Distance=20.0)]

    report = {"stations": 0, "ribs": [], "edge": None, "rings": [], "left_out": []}
    solids = []
    whole = Polygon(ring_of(outline)).buffer(0)
    cut = [Polygon(ring_of(h)).buffer(0) for h in holes]
    # the edge beam: inside the outline (left of a counter-clockwise one); none where its middle line runs over a hole (a
    # hole that cuts the outline: there the hole's ring frames the notch)
    sgn = 1.0 if is_ccw(outline) else -1.0
    a, b = (0.0, edge_w) if sgn > 0 else (-edge_w, 0.0)
    said_e = {}
    solids += hung_member_shape(outline, True, a, b, under, edge_d, said_e, "the edge beam", whole.difference(unary_union(cut)) if cut else None)
    report["edge"] = said_e
    # the rings: outside each hole (right of a counter-clockwise one), where their middle line lies within the outline
    grown = []
    for h, hole in zip(holes, cut):
        if rings:
            sgn = 1.0 if is_ccw(h) else -1.0
            a, b = (-edge_w, 0.0) if sgn > 0 else (0.0, edge_w)
            said_r = {}
            solids += hung_member_shape(h, True, a, b, under, edge_d, said_r, "a ring", whole)
            report["rings"].append(said_r)
        grown.append(hole.buffer(edge_w if rings else 0.0))
    # the ribs: each transverse line's piece through its station, of the plan less the edge beam, less the holes and rings
    plan = whole.buffer(-edge_w)
    stations = ridge_stations(ridge, ribs)
    report["stations"] = len(stations)
    for k, (p, across) in enumerate(stations):
        far = 1.0e6
        full = LineString([(p.x - across.x * far, p.y - across.y * far), (p.x + across.x * far, p.y + across.y * far)])
        pieces = plan.intersection(full)
        parts = [g for g in getattr(pieces, "geoms", [pieces]) if g.geom_type == "LineString" and not g.is_empty]
        if not parts:
            report["left_out"].append("rib %d: its line does not cross the plan" % (k + 1))
            continue
        here = Point(p.x, p.y)
        mine = min(parts, key=lambda g: g.distance(here))
        if mine.distance(here) > RIB_REACH_MM:  # (a station a little outside: on a leaf whose ridge is its own edge the ribs start at the edge beam)
            report["left_out"].append("rib %d: its station lies %.2f m outside the plan, further than %.1f m" % (k + 1, mine.distance(here) / MM, RIB_REACH_MM / MM))
            continue
        rib = mine.difference(unary_union(grown)) if grown else mine
        for g in getattr(rib, "geoms", [rib]):
            if g.geom_type != "LineString" or g.length < 100.0:
                continue
            (x0, y0), (x1, y1) = g.coords[0], g.coords[-1]
            e = Part.LineSegment(App.Vector(x0, y0, 0.0), App.Vector(x1, y1, 0.0)).toShape()
            said_k = {}
            got = hung_member_shape(e, False, -rib_w / 2.0, rib_w / 2.0, under, rib_d, said_k, "rib %d" % (k + 1))
            solids += got
            report["ribs"].append((k + 1, round(g.length / MM, 3), said_k.get("holds_m3")))
    if said is not None:
        said.update(report)
    return Part.makeCompound(solids) if solids else None


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
        if profile == "Segmental":
            rise_m = min(rise_m, half)  # at most a semicircle, as the map draws it (higher, the circle would bulge wider than its span)
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


# A vault along a curve, and a wave vault, are made section by section, without OCCT's loft and
# without its surface through points. Both of those go through an approximation that sags between
# the first sections of a long vault: a wave vault of 73 sections lay 13.7 mm under its wave
# half-way between the first two, a plain vault along 30 m of curve 1 mm beside its curve, while
# every section itself was met and the volume agreed to 0.001 %, so nothing said it was off. And
# it never finishes when the sections change form (a wave so deep that the arch at its trough is
# nearly flat). Here each section is worked out as points, and the surfaces through them are
# plain cubic interpolations of curves: each section's line through its points, then each of
# those lines' poles through the stations, at even parameters both ways.
VAULT_STATION_MM = 250.0  # the stations of a straight vault built section by section are no further apart than this
CURVE_STATION_MM = 125.0  # and along a curve than this (the map's own curve turns sharply in its first and last half metre)
WAVE_STATIONS = 32  # sections to one wave, at least (the map's own count)
WAVE_TROUGH_M = 0.2  # a wave never takes a vault's rise below this: the map's own limit
ARCH_POINTS = 32  # places along a section's inside line
SECTION_FACE_STATIONS = 16  # stations to one face at most (FreeCAD's own Volume gives a face a fixed number of points: see pieces_of)
SECTION_FACE_PLACES = 11  # and places across a section (three faces to a line of 32: none of their seams runs along the crown)


def _even_keys(dense, count):
    """count + 1 places at even steps of length along a line given densely as (key, x, z): the
    keys there."""
    lengths = [0.0]
    for a, b in zip(dense, dense[1:]):
        lengths.append(lengths[-1] + math.hypot(b[1] - a[1], b[2] - a[2]))
    out, k = [], 0
    for i in range(count + 1):
        want = lengths[-1] * i / count
        while k < len(lengths) - 2 and lengths[k + 1] < want:
            k += 1
        f = 0.0 if lengths[k + 1] == lengths[k] else (want - lengths[k]) / (lengths[k + 1] - lengths[k])
        out.append(dense[k][0] + (dense[k + 1][0] - dense[k][0]) * min(1.0, max(0.0, f)))
    return out


def arch_section(profile, span_m, rise_m, thickness_m, count=ARCH_POINTS):
    """An arch's section as points, in its own plane (x across, z up, metres; its springings at
    (-span/2, 0) and (span/2, 0)): (the inside line, the outside line, the left toe, the right
    toe). A line is a list of runs of points from left to right; a run is smooth (a pointed
    arch has two to a line, meeting at its apex). The outside line lies thickness_m off the
    inside line along its normal; of a circle it is the same circle, larger, down to the
    springing line. A toe is where the outside line, carried on straight along its own
    direction, meets the springing line (its own end, when it ends there)."""
    half, t = span_m / 2.0, thickness_m
    if profile in ("Catenary", "Parabola", "Ellipse"):
        if profile == "Catenary":
            a = catenary_parameter(span_m, rise_m)
            at = lambda k: (k, a * (math.cosh(half / a) - math.cosh(k / a)), 1.0, -math.sinh(k / a))  # noqa: E731  (x, z, the way the line runs)
            keys = [-half + span_m * i / 2000.0 for i in range(2001)]
        elif profile == "Parabola":
            at = lambda k: (k, rise_m * (1 - (k / half) ** 2), 1.0, -2.0 * rise_m * k / (half * half))  # noqa: E731
            keys = [-half + span_m * i / 2000.0 for i in range(2001)]
        else:  # the key is the angle, from pi at the left springing down to 0
            at = lambda k: (half * math.cos(k), rise_m * math.sin(k), half * math.sin(k), -rise_m * math.cos(k))  # noqa: E731
            keys = [math.pi * (1 - i / 2000.0) for i in range(2001)]
        chosen = _even_keys([(k,) + at(k)[:2] for k in keys], count)
        inside, outside = [], []
        for k in chosen:
            x, z, tx, tz = at(k)
            n = math.hypot(tx, tz)
            inside.append((x, z))
            outside.append((x - t * tz / n, z + t * tx / n))  # to the left of the way the line runs: up and out
        inside[0], inside[-1] = (-half, 0.0), (half, 0.0)
        toes = []
        for (ox, oz), k, back in ((outside[0], chosen[0], -1.0), (outside[-1], chosen[-1], 1.0)):
            _x, _z, tx, tz = at(k)
            n = math.hypot(tx, tz)
            dx, dz = back * tx / n, back * tz / n  # on along its own direction, away from the arch
            if oz <= 1e-9:
                toes.append((ox, 0.0))
            elif dz >= -1e-6:
                raise ValueError("the arch is too flat at its springing for its thickness: its outside never comes down to the springing line")
            else:
                toes.append((ox + dx * oz / -dz, 0.0))
        return [inside], [outside], toes[0], toes[1]
    if profile in ("Semicircle", "Segmental"):
        h = half if profile == "Semicircle" else min(rise_m, half)
        rho = (half * half + h * h) / (2.0 * h)
        cz = h - rho  # the centre: on the springing line for a semicircle, under it for a segment
        lines = []
        for r in (rho, rho + t):
            top = math.acos(max(-1.0, min(1.0, -cz / r)))  # how far from the upright the circle meets the springing line
            run = [(r * math.sin(-top + 2.0 * top * i / count), cz + r * math.cos(-top + 2.0 * top * i / count)) for i in range(count + 1)]
            run[0], run[-1] = (run[0][0], 0.0), (run[-1][0], 0.0)
            lines.append(run)
        return [lines[0]], [lines[1]], lines[1][0], lines[1][-1]
    if profile == "Pointed":
        h = max(rise_m, half * 1.0001)
        d = (h * h - half * half) / span_m
        rho = half + d
        lines = []
        for r in (rho, rho + t):  # two arcs, about (d, 0) and (-d, 0), meeting over the middle
            apex = math.sqrt(r * r - d * d)
            end = math.atan2(apex, -d)  # the left arc runs from the angle pi, on the springing line, down to this one
            n = max(2, count // 2)
            left = [(d + r * math.cos(math.pi - (math.pi - end) * i / n), r * math.sin(math.pi - (math.pi - end) * i / n)) for i in range(n + 1)]
            left[0], left[-1] = (d - r, 0.0), (0.0, apex)
            lines.append([left, [(-x, z) for x, z in reversed(left)]])
        return lines[0], lines[1], lines[1][0][0], lines[1][1][-1]
    raise ValueError("%s is not an arch this kernel knows" % profile)


def curve_through(points, parameters):
    """The cubic through points at even parameters (OCCT's plain interpolation of a curve), its
    two ends leaving in the direction the points themselves show there (each end's slope from
    its first five points). Left without the two directions the curve has no curvature at its
    ends and lies off between its first points: a wave's crest 0.1 mm low, a vault's axis 0.4 mm
    beside its curve. Where the points set out slowly and then stride (the inner edge of a
    vault at the turned end of its curve), five points make that slope too small, or backward:
    an end then leaves along its first two points."""
    pts = list(points)
    c = Part.BSplineCurve()
    if len(pts) >= 5:
        h = parameters[1] - parameters[0]
        start = (pts[0] * -25.0 + pts[1] * 48.0 + pts[2] * -36.0 + pts[3] * 16.0 + pts[4] * -3.0) * (1.0 / (12.0 * h))
        end = (pts[-1] * 25.0 + pts[-2] * -48.0 + pts[-3] * 36.0 + pts[-4] * -16.0 + pts[-5] * 3.0) * (1.0 / (12.0 * h))
        first, last = (pts[1] - pts[0]) * (1.0 / h), (pts[-1] - pts[-2]) * (1.0 / h)
        if start.dot(first) < 0.5 * first.dot(first):
            start = first
        if end.dot(last) < 0.5 * last.dot(last):
            end = last
        if start.Length > 1e-9 and end.Length > 1e-9:  # (a line that stays in one place has no direction to give)
            c.interpolate(Points=pts, Parameters=list(parameters), InitialTangent=start, FinalTangent=end, Scale=False)
            return c
    c.interpolate(Points=pts, Parameters=list(parameters))
    return c


def surface_through(grid):
    """The surface through a grid of points [row][column] (mm), cubic both ways, rows and
    columns each at even parameters 0 to 1: every row's line through its points, then each
    pole of those lines through the rows. Curve interpolations only (see the note above)."""
    rows, cols = len(grid), len(grid[0])
    u = [i / float(rows - 1) for i in range(rows)]
    v = [j / float(cols - 1) for j in range(cols)]
    lines = [curve_through(row, v) for row in grid]
    first = lines[0]
    if any(line.NbPoles != first.NbPoles for line in lines):
        raise ValueError("the sections are not of one make")
    rails = [curve_through([line.getPole(k + 1) for line in lines], u) for k in range(first.NbPoles)]
    if any(rail.NbPoles != rails[0].NbPoles for rail in rails):
        raise ValueError("the sections' lines are not of one make along the vault")
    poles = [[rails[k].getPole(n + 1) for k in range(first.NbPoles)] for n in range(rails[0].NbPoles)]
    surface = Part.BSplineSurface()
    surface.buildFromPolesMultsKnots(poles, rails[0].getMultiplicities(), first.getMultiplicities(), rails[0].getKnots(), first.getKnots(),
                                     False, False, rails[0].Degree, first.Degree)
    return surface


def _cuts(count, piece):
    """0 to 1 cut at grid places, no more than `piece` steps to a part."""
    parts = int(math.ceil(count / float(piece)))
    marks = sorted({int(round(count * k / float(parts))) for k in range(parts + 1)})
    return [mark / float(count) for mark in marks]


def vault_by_sections(profile, span_m, rises_m, thickness_m, frames, plinth_m=0.0):
    """A vault through its sections: rises_m[i] is the rise at station i, frames[i] its
    (origin, right) there (mm vectors: a section's x runs along `right`, its z upward); the
    stations stand at even steps. The inside and the outside are each a surface through all
    the sections' points; the feet, the toes, the plinth's faces and the two ends are flat or
    ruled faces between the same lines; every face spans a few stations only; all are sewn
    into one solid. A vault whose springing, shoulder or toe line runs backward anywhere (the
    sections cross each other there) raises VaultFolds."""
    made = {}  # a rise comes more than once (a plain vault has one; a wave goes up as it came down)
    for rise in rises_m:
        if round(rise, 12) not in made:
            made[round(rise, 12)] = arch_section(profile, span_m, rise, thickness_m)
    sections = [made[round(rise, 12)] for rise in rises_m]
    place = lambda i, q: frames[i][0] + frames[i][1] * (q[0] * MM) + Z * (q[1] * MM)  # noqa: E731
    n = len(sections)
    u = [i / float(n - 1) for i in range(n)]
    u_cuts = _cuts(n - 1, SECTION_FACE_STATIONS)
    faces, skins = [], []
    for which in (0, 1):  # the inside, the outside
        for run in range(len(sections[0][which])):
            grid = [[place(i, q) for q in sections[i][which][run]] for i in range(n)]
            surface = surface_through(grid)
            v_cuts = _cuts(len(grid[0]) - 1, SECTION_FACE_PLACES)
            skins.append((surface, v_cuts))
            for ua, ub in zip(u_cuts, u_cuts[1:]):
                for va, vb in zip(v_cuts, v_cuts[1:]):
                    faces.append(surface.toShape(ua, ub, va, vb))
    down = Z * (-plinth_m * MM)
    forward = [Z.cross(right) for _origin, right in frames]  # the way each section faces
    ends = {0: [], n - 1: []}  # the straight pieces of the two end faces
    for side in (0, 1):  # left, right
        corner = lambda i, line: sections[i][line][0][0] if side == 0 else sections[i][line][-1][-1]  # noqa: E731
        spring_at = [place(i, corner(i, 0)) for i in range(n)]
        shoulder_at = [place(i, corner(i, 1)) for i in range(n)]
        toe_at = [place(i, sections[i][2 + side]) for i in range(n)]
        has_toe = any((a - b).Length > 1e-3 for a, b in zip(toe_at, shoulder_at))
        spring, shoulder = curve_through(spring_at, u), curve_through(shoulder_at, u)
        toe = curve_through(toe_at, u) if has_toe else shoulder
        for rail in (spring, shoulder, toe) if GUARD_FOLDS else ():  # each must run forward all the way: one that turns back has folded the vault
            for i in range(n - 1):
                for part in (0.0, 0.25, 0.5, 0.75, 1.0):
                    if rail.getD1((i + part) / float(n - 1))[1].dot(forward[i if part < 0.5 else i + 1]) <= 0:
                        raise VaultFolds(i + part)
        for ua, ub in zip(u_cuts, u_cuts[1:]):
            e_spring, e_toe = Part.Edge(spring, ua, ub), Part.Edge(toe, ua, ub)
            if has_toe:  # the toe: the outside carried straight on down to the springing line
                faces.append(Part.makeRuledSurface(Part.Edge(shoulder, ua, ub), e_toe))
            if plinth_m > 0:
                low_in, low_out = e_spring.copy(), e_toe.copy()
                low_in.translate(down)
                low_out.translate(down)
                faces += [e_spring.extrude(down), e_toe.extrude(down), Part.makeRuledSurface(low_in, low_out)]
            else:  # the foot, in the springing line's plane
                faces.append(Part.makeRuledSurface(e_spring, e_toe))
        for i in ends:
            chain = [spring_at[i]] + ([spring_at[i] + down, toe_at[i] + down] if plinth_m > 0 else []) + [toe_at[i]] + ([shoulder_at[i]] if has_toe else [])
            ends[i] += [Part.LineSegment(p, q).toShape() for p, q in zip(chain, chain[1:]) if (q - p).Length > 1e-6]
    for i, at in ((0, 0.0), (n - 1, 1.0)):
        edges = list(ends[i])
        for surface, v_cuts in skins:
            line = surface.uIso(at)
            edges += [Part.Edge(line, va, vb) for va, vb in zip(v_cuts, v_cuts[1:])]  # cut where the surface's own faces are
        faces.append(Part.Face(Part.Wire(Part.__sortEdges__(edges))))
    shell = Part.Shell(faces)
    shell.sewShape()
    solid = Part.Solid(shell)
    if solid.Volume < 0:
        solid.reverse()
    return solid


def section_area(profile, span_m, rise_m, thickness_m, plinth_m=0.0):
    """A section's area in mm2, counted from its own points (2,000 along its inside line), the
    plinth's two stems with it."""
    inside, outside, tl, tr = arch_section(profile, span_m, rise_m, thickness_m, 2000)
    ring = [q for run in inside for q in run] + [tr] + [q for run in reversed(outside) for q in reversed(run)] + [tl]
    area = 0.5 * abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1])))
    return (area + plinth_m * (abs(tr[0] - inside[-1][-1][0]) + abs(inside[0][0][0] - tl[0]))) * MM * MM


# A vault's sections stand square to its curve. Where the curve turns more between two sections
# than the vault's width allows (the turn, times how far the vault reaches to either side, against
# the distance between the two), the inner edge of the second lies behind that of the first: the
# vault folds over itself. The map's smooth curve turns sharpest at its two ends, whatever is
# drawn: its end point counts twice, so the curve leaves it at half speed, on a radius of
# |u|² / (4 |v| sin θ) (u its first span, v its second, θ the turn between them: 1.6 m for two
# spans of 4.3 m that turn 41°), and is straighter within 0.8 m. The map does not measure a
# curve's first and last 0.6 m, so it draws a wide vault there all the same.
FOLD_LIMIT = 0.98  # between two sections a curve may turn up to this much of what would fold the vault
# at an end of the curve the last sections turn no more than this much of it from one to the next: the vault's inner
# edge then sets out at a quarter of the curve's own pace or more, which a smooth line through its points can follow
END_TURN = 0.75
GUARD_FOLDS = True  # (off only for a check's forged fault: every section stays square to the curve, nothing is refused, and a vault may fold)


def curve_frames(spine, count, reach_m):
    """Where count + 1 sections stand at even steps along an open plan curve, for a vault that
    reaches reach_m to either side of it: ([(origin, right)], how far each section is turned
    off square to the curve (radians), what was turned).

    Every section is square to the curve. A stretch between two sections over which the curve
    turns more than the vault's width allows would fold the vault. Inside the curve that is
    refused, with the place and the radius (as the map refuses it). At an end of the curve the
    sections are turned instead, as little as it takes: over the stretches there that would
    fold (or the last stretch alone, when it turns more than END_TURN of what would fold the
    vault) each section turns from its neighbour by END_TURN of it and no more, so the last
    ones, and the end face with them, stand a little off square. `turned` says it, one row for
    each such end: {"end", "length_m" (those stretches), "angle_deg" (the most a section is
    turned), "radius_m" (the tightest of those stretches), "reach_m"}."""
    length = spine.Length
    step = length / count / MM  # metres
    at, heading = [], []
    for i in range(count + 1):
        u = spine.getParameterByLength(min(length, length * i / count))
        p, tan = spine.valueAt(u), spine.tangentAt(u)
        tan = App.Vector(tan.x, tan.y, 0)
        tan.normalize()
        at.append((p, tan))
        angle = math.atan2(tan.y, tan.x)
        heading.append(angle if not heading else heading[-1] + math.remainder(angle - heading[-1], 2 * math.pi))
    frames = [(p, tan.cross(Z)) for p, tan in at]  # a section's x: to the right of the way the curve runs
    lean, turned = [0.0] * (count + 1), []
    turn = [abs(heading[i + 1] - heading[i]) for i in range(count)]  # from each section to the next
    if not GUARD_FOLDS:
        return frames, lean, turned
    folds = [t * reach_m > FOLD_LIMIT * step for t in turn]
    first = next((i for i in range(count) if not folds[i]), count)  # the first stretch that does not fold, and the last
    last = next((i for i in range(count - 1, -1, -1) if not folds[i]), -1)
    inside = [i for i in range(first, last + 1) if folds[i]] if first <= last else list(range(count))
    if inside:
        worst = max(inside, key=lambda i: turn[i])
        raise ValueError("the curve bends tighter than the vault is wide: %.2f m along, it turns on a radius of %.2f m, and the vault reaches %.2f m to either side of it "
                         "(its inner side would fold over itself): a narrower span, or a gentler curve" % (step * (worst + 0.5), step / turn[worst], reach_m))
    most = END_TURN / reach_m * step
    start = range(0, first) if first > 0 else range(0, 1 if turn[0] > most else 0)
    end = range(last + 1, count) if last < count - 1 else range(count - 1 if turn[count - 1] > most else count, count)
    face = list(heading)  # the way each section faces
    for i in reversed(start):  # (the section that ends these stretches inside the curve stays square)
        face[i] = min(max(heading[i], face[i + 1] - most), face[i + 1] + most)
    for i in end:
        face[i + 1] = min(max(heading[i + 1], face[i] - most), face[i] + most)
    for name, stretches in (("start", start), ("end", end)):
        if not len(stretches):
            continue
        for i in set(stretches) | {j + 1 for j in stretches}:
            lean[i] = heading[i] - face[i]
            if abs(lean[i]) > 1e-12:
                frames[i] = (at[i][0], App.Vector(math.sin(face[i]), -math.cos(face[i]), 0))
        tightest = step / max(turn[i] for i in stretches)
        for i in stretches:  # the inner edge must still run forward
            if math.cos(max(abs(lean[i]), abs(lean[i + 1]))) * step - reach_m * abs(face[i + 1] - face[i]) < (1.0 - FOLD_LIMIT) * step:
                raise ValueError("the curve bends tighter than the vault is wide over the %s %.2f m of it (on a radius of %.2f m; the vault reaches %.2f m to either side of it), "
                                 "too far for its sections there to be turned without folding: a narrower span, or a gentler curve"
                                 % ("first" if name == "start" else "last", step * len(stretches), tightest, reach_m))
        turned.append({"end": name, "length_m": step * len(stretches), "angle_deg": math.degrees(max(abs(lean[j]) for i in stretches for j in (i, i + 1))),
                       "radius_m": tightest, "reach_m": reach_m})
    return frames, lean, turned


class VaultFolds(ValueError):
    """A vault built section by section whose edge runs backward: .station is where (a section's
    number, with the part of the way to the next)."""

    def __init__(self, station):
        ValueError.__init__(self, "the vault folds over itself")
        self.station = station


def sectioned_vault(profile, span_m, rise_m, thickness_m, length_m, amplitude_m=0.0, waves=0, plinth_m=0.0, spine=None, said=None):
    """A vault built section by section: along +Y, centred on the origin, length_m long; or,
    with a spine, along that open plan curve, each section square to it (the curve's length
    rules; see curve_frames for a curve that turns tighter than the vault is wide). With an
    amplitude and whole waves its rise goes up and down along it (wave_rise). Springing from
    Z = 0 (the curve's own height), a plinth under its springings. No ribs.
    said: a dict that is given "turned", curve_frames' rows (none: []).

    Returns (solid, the volume it must hold: its sections' areas summed along its length. A
    section square to a plan curve sweeps its area times the length its centroid travels, and
    an arch's centroid lies over the curve; one turned off square, that times the cosine of
    the turn). The solid is refused when it does not hold that."""
    length = spine.Length if spine is not None else length_m * MM
    count = max(8, int(math.ceil(length / (CURVE_STATION_MM if spine is not None else VAULT_STATION_MM))), int(math.ceil(WAVE_STATIONS * abs(waves))))
    count += count % 2  # even: the areas are summed by Simpson's rule
    rises = [wave_rise(length * i / count, rise_m, amplitude_m, waves, length) if waves else rise_m for i in range(count + 1)]
    lean, turned = [0.0] * (count + 1), []
    if spine is None:
        frames = [(Y * (length * i / count - length / 2), App.Vector(1, 0, 0)) for i in range(count + 1)]
    else:
        reach = max(max(abs(tl[0]), abs(tr[0])) for _in, _out, tl, tr in (arch_section(profile, span_m, r, thickness_m, 8) for r in (min(rises), max(rises))))
        frames, lean, turned = curve_frames(spine, count, reach)
    if said is not None:
        said["turned"] = turned
    try:
        solid = vault_by_sections(profile, span_m, rises, thickness_m, frames, plinth_m)
    except VaultFolds as fold:
        raise ValueError("the curve bends tighter than the vault is wide: %.2f m along, the vault's inner edge would run backward (it would fold over itself): "
                         "a narrower span, or a gentler curve" % (length / count / MM * fold.station))
    area = {}
    for rise in rises:
        if round(rise, 12) not in area:
            area[round(rise, 12)] = section_area(profile, span_m, rise, thickness_m, plinth_m)
    areas = [area[round(rise, 12)] * math.cos(lean[i]) for i, rise in enumerate(rises)]
    step = length / count
    want = step / 3 * (areas[0] + areas[-1] + 4 * sum(areas[1:-1:2]) + 2 * sum(areas[2:-1:2]))
    if not solid.isValid() or len(solid.Solids) != 1 or abs(solid.Volume / want - 1.0) > 0.005:
        raise ValueError("the vault could not be built section by section (it holds %.2f %% off its sections' areas summed along its length%s)"
                         % (100.0 * (solid.Volume / want - 1.0), "" if solid.isValid() else ", and is not valid"))
    return solid, want


def vault_on_curve(profile, span_m, rise_m, thickness_m, spine, plinth_m=0.0, said=None):
    """A vault whose barrel follows an open plan curve (the map's vault on a drawn spine): its
    arch, square to the curve at every place, carried along it; springing from the curve's own
    height, with a plinth under its springings. No ribs. A curve that bends tighter inside
    than the vault reaches from it is refused, with the place and the radius; one that does so
    at an end has its last sections turned (curve_frames; said["turned"] names it)."""
    return sectioned_vault(profile, span_m, rise_m, thickness_m, 0.0, 0.0, 0, plinth_m, spine, said)[0]


def wave_rise(s, rise_m, amplitude_m, waves, length_m):
    """A wave vault's rise s along it from its start (s and the length in one unit): rise_m at
    its mean, amplitude_m more at a crest (the first at the start), `waves` whole waves along
    the length. Lane R's formula (a straight vault: s = y + length / 2), and the map's."""
    return rise_m + amplitude_m * math.cos(2 * math.pi * waves * s / length_m)


def wave_of(profile, rise_m, amplitude_m, waves):
    """(the wave's amplitude as it is built, its whole waves) for a vault's WaveAmplitude and
    Waves, by the map's own rule: no wave with fewer than one wave or without an amplitude;
    none on a semicircle, which has one rise for its span; the amplitude cut back so that a
    trough keeps WAVE_TROUGH_M of rise. (0.0, 0) when there is no wave."""
    count = int(waves)
    if count < 1 or amplitude_m <= 0 or profile == "Semicircle":
        return 0.0, 0
    amplitude = min(float(amplitude_m), max(0.0, max(WAVE_TROUGH_M, rise_m) - WAVE_TROUGH_M))
    return (amplitude, count) if amplitude > 1e-9 else (0.0, 0)


def wave_vault_shape(profile, span_m, rise_m, thickness_m, length_m, amplitude_m, waves, plinth_m=0.0, spine=None, said=None):
    """A vault whose rise goes up and down as a wave along its length (Eladio Dieste's Gaussian
    vaults: the wave gives a thin vault depth against buckling). Along +Y, centred on the
    origin, length_m long; or, with a spine, along that open plan curve, square to it at every
    place (the curve's length rules, and the wave is counted along it from its start). Every
    cross-section is its profile's own arch for the rise there, plinth and all; the thickness
    is measured in the cross-section. Returns (solid, the volume it must hold: see
    sectioned_vault, and there for `said`)."""
    if profile == "Semicircle":
        raise ValueError("a semicircle has one rise for its span: choose another profile for a wave vault")
    if rise_m - abs(amplitude_m) < WAVE_TROUGH_M - 1e-9:
        raise ValueError("the wave is deeper than the vault is high: a trough must keep %.1f m of rise (rise %.2f m, amplitude %.2f m)" % (WAVE_TROUGH_M, rise_m, amplitude_m))
    return sectioned_vault(profile, span_m, rise_m, thickness_m, length_m, amplitude_m, waves, plinth_m, spine, said)


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
    if profile == "Segmental":
        rise_m = min(rise_m, span_m / 2)
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


def field_plan(outline_edge, hole_edges=()):
    """A height field shell's plan: the face its closed outline encloses, less an upright hole
    for each of hole_edges, at the outline's own level (a hole drawn at another level is the
    same hole)."""
    plan = plan_face(outline_edge)
    level = plan.BoundBox.ZMin
    for edge in hole_edges:
        hole = plan_face(edge)
        hole.translate(App.Vector(0, 0, level - hole.BoundBox.ZMin))
        plan = face_of(plan.cut(hole))
    return plan


def plan_zone(outline_edge, hole_edges=(), frame=None):
    """A height field shell's plan as a shapely polygon, its outline less its holes, their
    points 20 mm apart, moved by `frame` (a Placement) when one is given: for asking whether a
    plan point lies under the roof. Shapely's and not OCCT's: OCCT's flat booleans with these
    plans gave the wrong answer in silence (the main wall's band against the roofs' plans: 0.07
    m² under them where shapely finds all its 9.13 m²; a courtyard wall's: nothing, 1.03)."""
    from shapely.geometry import Polygon

    def ring(edge):
        points = edge.discretize(Distance=20.0)
        if frame is not None:
            points = [frame.multVec(q) for q in points]
        return [(q.x, q.y) for q in points]

    zone = Polygon(ring(outline_edge)).buffer(0)
    for edge in hole_edges:
        zone = zone.difference(Polygon(ring(edge)).buffer(0))
    return zone


def field_surface(origin_xy_m, step_m, columns, heights_m):
    """The smooth surface through a height field: heights (m) on a square grid of step_m, row
    after row from origin_xy_m (each row along +x, the rows following in +y), `columns` to a
    row; a bicubic spline through them, its first parameter running with x, its second with y."""
    heights = [float(h) for h in heights_m]
    columns = int(columns)
    rows = len(heights) // columns if columns > 0 else 0
    if columns < 2 or rows < 2 or rows * columns != len(heights):
        raise ValueError("a height field needs at least 2 by 2 heights in whole rows (%d heights in rows of %d)" % (len(heights), columns))
    x0, y0 = origin_xy_m
    surface = Part.BSplineSurface()
    surface.interpolate([[V(x0 + i * step_m, y0 + j * step_m, heights[j * columns + i]) for j in range(rows)] for i in range(columns)])
    return surface


def field_z(surface, x, y, start=None):
    """The height (mm) of a height field's surface (field_surface) over the plan point (x, y),
    in mm: Newton's steps from start (u, v), else from where x and y lie in its parameters'
    range, to the point of it over (x, y). Past the grid's own edge, the height of the nearest
    point of its edge. Returns (z, (u, v))."""
    u0, u1, v0, v1 = surface.bounds()
    a, b = surface.value(u0, v0), surface.value(u1, v1)
    if start is None:
        u, v = u0 + (u1 - u0) * (x - a.x) / (b.x - a.x), v0 + (v1 - v0) * (y - a.y) / (b.y - a.y)
        u, v = min(max(u, u0), u1), min(max(v, v0), v1)
    else:
        u, v = start
    for _ in range(40):
        q = surface.value(u, v)
        ex, ey = x - q.x, y - q.y
        if ex * ex + ey * ey < 1e-6:  # a thousandth of a millimetre
            return q.z, (u, v)
        du, dv = surface.getDN(u, v, 1, 0), surface.getDN(u, v, 0, 1)
        det = du.x * dv.y - du.y * dv.x
        u = min(max(u + (ex * dv.y - ey * dv.x) / det, u0), u1)
        v = min(max(v + (du.x * ey - du.y * ex) / det, v0), v1)
    if not (min(a.x, b.x) <= x <= max(a.x, b.x) and min(a.y, b.y) <= y <= max(a.y, b.y)):
        return surface.value(u, v).z, (u, v)  # past the grid: its edge
    raise ValueError("no point of the height field stands over (%.2f, %.2f) m" % (x / MM, y / MM))


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
    surface = field_surface(origin_xy_m, step_m, columns, heights_m)
    x0, y0 = origin_xy_m
    rows = len(heights_m) // int(columns)
    plan = field_plan(outline_edge, hole_edges)
    box = plan.BoundBox
    if (box.XMin < x0 * MM - 1.0 or box.XMax > (x0 + (int(columns) - 1) * step_m) * MM + 1.0
            or box.YMin < y0 * MM - 1.0 or box.YMax > (y0 + (rows - 1) * step_m) * MM + 1.0):
        raise ValueError("the height field does not reach as far as the shell's outline")
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
# Bezier patch); the thickness is a true offset, upward along the surface's normal. (Lane R's
# note says "straight up"; R's own assets are thickened along the normal, and so are these:
# exchange\godot\FORMAT.md, "Lane R's shells and lattices as record kinds".)
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
    if span_m <= 0 or length_m <= 0 or thickness_m <= 0 or rise_m < 0:
        raise ValueError("a conoid needs a span, a length and a thickness above nought, and a rise that is not below it")
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
    if span_m <= 0 or length_m <= 0 or thickness_m <= 0 or rise_x_m < 0 or rise_y_m < 0:
        raise ValueError("a translation shell needs a span, a length and a thickness above nought, and rises that are not below it")
    hs, hl = span_m / 2, length_m / 2
    arch = (0.0, 2.0, 0.0)
    face = quadratic_patch((-hs, 0.0, hs), (-hl, 0.0, hl), [[eave_m + rise_x_m * arch[i] + rise_y_m * arch[j] for j in range(3)] for i in range(3)])
    return solid_of(thicken_up(face, thickness_m * MM))


GROIN_GRID = 12  # steps each way to one of a lobe's patches
GROIN_LOBES = (4, 16)  # the fewest and the most lobes (two saddles to eight)


def groined_coefficients(support_r_m, tip_r_m, centre_h_m, tip_h_m, lobes=8):
    """(a, b) of one saddle z = centre + a u^2 - b v^2 (u along its axis, v across): its tip, at
    tip_r_m along the axis, stands tip_h_m high, and the groin where it meets the next saddle
    (half a lobe off its axis: 22.5° for eight lobes) reaches the ground at support_r_m."""
    half = math.pi / lobes
    a = (tip_h_m - centre_h_m) / tip_r_m ** 2
    b = (centre_h_m / support_r_m ** 2 + a * math.cos(half) ** 2) / math.sin(half) ** 2
    return a, b


def groined_height(x, y, support_r_m, tip_r_m, centre_h_m, tip_h_m, lobes=8):
    """The underside of the groined saddles at (x, y) (m): the highest of the saddles."""
    a, b = groined_coefficients(support_r_m, tip_r_m, centre_h_m, tip_h_m, lobes)
    r, th = math.hypot(x, y), math.atan2(y, x)
    turn = 2 * math.pi / lobes
    return max(centre_h_m + r * r * (a * math.cos(th - i * turn) ** 2 - b * math.sin(th - i * turn) ** 2) for i in range(lobes // 2))


def groined_edge(theta, support_r_m, tip_r_m, lobes=8):
    """How far the roof reaches from its centre in the direction theta (m): to a support at a
    groin, to a tip on a lobe's axis."""
    return support_r_m + (tip_r_m - support_r_m) * abs(math.cos(lobes * theta / 2.0))


def _between(b0, b1, l0, l1, n):
    """A grid of plan points (n + 1) x (n + 1) filling the four-sided region between four lines
    of n + 1 points: b0 and b1 run one way (the grid's first and last row), l0 and l1 the
    other (its first and last column); each inner point is blended from the four."""
    x00, x10, x01, x11 = b0[0], b0[n], b1[0], b1[n]
    grid = []
    for j in range(n + 1):
        q = j / float(n)
        row = []
        for i in range(n + 1):
            p = i / float(n)
            row.append(tuple((1 - q) * b0[i][k] + q * b1[i][k] + (1 - p) * l0[j][k] + p * l1[j][k]
                             - ((1 - p) * (1 - q) * x00[k] + p * (1 - q) * x10[k] + (1 - p) * q * x01[k] + p * q * x11[k]) for k in (0, 1)))
        grid.append(row)
    return grid


def groined_saddles_shape(support_r_m, tip_r_m, centre_h_m, tip_h_m, thickness_m, lobes=8):
    """Saddles (hyperbolic paraboloids) about one centre, each turned from the last, the roof
    being the highest of them everywhere: `lobes` lobes that rise to their tips, as many groins
    between them that run down to supports on the ground (eight lobes, four saddles: the type
    of Candela's Los Manantiales; lane R's pattern card P-006).

    Built from patches, with no boolean. A lobe is the region between its two groins and its
    free edge: three four-sided patches underneath, on its saddle's own heights; the same three
    on top, on the saddle moved thickness_m along its normal, read above the same plan points;
    an upright face along its free edge. All lobes are sewn into one solid: its sides are
    upright, its groins lie in upright planes.

    (The lobe was first its saddle made thick and cut to its eighth by a boolean: a valid solid
    with the right volume by the adaptive measure, which FreeCAD's own Volume read 3 % short,
    and 19 % at Los Manantiales' size: one face to a lobe, its edge a long cut curve.)"""
    lobes = int(lobes)
    if lobes % 2 or not GROIN_LOBES[0] <= lobes <= GROIN_LOBES[1]:
        raise ValueError("groined saddles have an even number of lobes, from %d (two saddles) to %d" % GROIN_LOBES)
    if tip_r_m <= support_r_m or tip_h_m <= centre_h_m or centre_h_m <= 0 or support_r_m <= 0:
        raise ValueError("groined saddles need their tips further out than their supports and higher than their centre, and the centre above the ground")
    if thickness_m <= 0:
        raise ValueError("a shell needs a thickness")
    half, n, t = math.pi / lobes, GROIN_GRID, thickness_m
    a, b = groined_coefficients(support_r_m, tip_r_m, centre_h_m, tip_h_m, lobes)

    def under(x, y):
        return centre_h_m + a * x * x - b * y * y

    def top(x, y):
        """The height over (x, y) of the saddle moved t along its normal: the point (u, v) of
        the saddle whose normal passes over (x, y), u - 2atu/k = x and v + 2btv/k = y
        (k = √(1 + 4a²u² + 4b²v²)), found by Newton's steps. (Plain stepping closed in by only
        a factor 2bt a step: with narrow lobes and a thick shell it did not finish.)"""
        u, v = x, y
        for _ in range(60):
            k2 = 1.0 + 4 * a * a * u * u + 4 * b * b * v * v
            k = math.sqrt(k2)
            f1, f2 = u - 2 * a * t * u / k - x, v + 2 * b * t * v / k - y
            if abs(f1) + abs(f2) < 1e-13:
                break
            j11 = 1 - 2 * a * t * (k2 - 4 * a * a * u * u) / (k2 * k)
            j12 = 2 * a * t * u * 4 * b * b * v / (k2 * k)
            j21 = -2 * b * t * v * 4 * a * a * u / (k2 * k)
            j22 = 1 + 2 * b * t * (k2 - 4 * b * b * v * v) / (k2 * k)
            det = j11 * j22 - j12 * j21
            if abs(det) < 1e-12:
                raise ValueError("the shell is too thick for how sharply its saddles bend")
            u -= (f1 * j22 - f2 * j12) / det
            v -= (j11 * f2 - j21 * f1) / det
        else:
            raise ValueError("the shell is too thick for how sharply its saddles bend")
        return under(u, v) + t / math.sqrt(1.0 + 4 * a * a * u * u + 4 * b * b * v * v)

    line = lambda p0, p1: [(p0[0] + (p1[0] - p0[0]) * i / float(n), p0[1] + (p1[1] - p0[1]) * i / float(n)) for i in range(n + 1)]  # noqa: E731
    rim = lambda th: (groined_edge(th, support_r_m, tip_r_m, lobes) * math.cos(th), groined_edge(th, support_r_m, tip_r_m, lobes) * math.sin(th))  # noqa: E731
    centre, tip, hub = (0.0, 0.0), (tip_r_m, 0.0), (0.6 * support_r_m, 0.0)  # the hub: where the lobe's three patches meet, on its axis
    faces = []
    for side in (-1.0, 1.0):
        foot = (support_r_m * math.cos(half), side * support_r_m * math.sin(half))  # the support at this side's groin
        mid = (foot[0] / 2.0, foot[1] / 2.0)
        # between the groin's outer half, the axis from the hub to the tip, and this side's half of the free edge
        outer = _between(line(mid, foot), line(hub, tip), line(mid, hub), [rim(side * half * (1 - j / float(n))) for j in range(n + 1)], n)
        grids = [outer]
        if side < 0:  # the patch at the centre, once: between the two groins' inner halves and the hub
            other = (mid[0], -mid[1])
            grids.append(_between(line(centre, mid), line(other, hub), line(centre, other), line(mid, hub), n))
        for grid in grids:
            low = surface_through([[V(x, y, under(x, y)) for x, y in row] for row in grid])
            high = surface_through([[V(x, y, top(x, y)) for x, y in row] for row in grid])
            faces += [low.toShape(), high.toShape()]
            if grid is outer:  # the free edge: the grid's last column, the same plan points under and on top
                faces.append(Part.makeRuledSurface(low.vIso(1.0).toShape(), high.vIso(1.0).toShape()))
    whole = []
    for k in range(lobes):
        for face in faces:
            one = face.copy()
            if k:
                one.rotate(App.Vector(), Z, 360.0 * k / lobes)
            whole.append(one)
    shell = Part.Shell(whole)
    shell.sewShape()
    solid = Part.Solid(shell)
    if solid.Volume < 0:
        solid.reverse()
    if not solid.isValid() or len(solid.Solids) != 1:
        raise ValueError("the groined saddles could not be closed into one solid from these numbers")
    return solid


# ---------------------------------------------------------------- lane R's leaf roof on ribs and dome folded from one sheet
# Cards P-007 and P-002 (Spatial Map\spatial-map\ports\FROM-RESEARCH.md, entries 7 and 2; R's generators
# Research Architect\assets\3d\_generators\build_leaf_roof.py and assets\3d\folded-dome-orirevo-12-01\build_folded_dome.py),
# the map's catalogue forms 107 and 102. Each in its own frame as R gives it: x across, y along, z up, metres, the origin in
# the middle of its footprint on the ground.
LEAF_NU, LEAF_NV = 24, 72  # the skin's grid: across, along (R draws it on 12 x 36; the surface here goes through twice as many)


def leaf_half(y_m, length_m, width_m, taper):
    """The leaf's half-width at y (m): Width/2 * sin(pi t)^Taper, t = 0 to 1 tip to tip along Length."""
    t = min(1.0, max(0.0, (y_m + length_m / 2.0) / length_m))
    return width_m / 2.0 * math.sin(math.pi * t) ** taper


def bumps_height(x_m, y_m, base_m, bumps):
    """The height-field family's surface (m): Base + the sum of A exp(-|(x - Cx)/Sx|^P - |(y - Cy)/Sy|^P)."""
    z = base_m
    for b in bumps:
        p = float(b.get("P", 2))
        z += float(b["A"]) * math.exp(-abs((x_m - float(b.get("Cx", 0.0))) / float(b["Sx"])) ** p - abs((y_m - float(b.get("Cy", 0.0))) / float(b["Sy"])) ** p)
    return z


def leaf_ribs(length_m, width_m, taper, tip_cut, rib_count, vein_deg):
    """R's ribs on the right of the midrib (the left mirrors them): [(station y, length, end x, end y)], m. Even stations
    along the midrib; each leaves it at vein_deg toward the tip and runs to the edge, found by sixty halvings (as R's
    generator and the map's port find it)."""
    y0, y1 = -length_m / 2.0 + tip_cut * length_m, length_m / 2.0 - tip_cut * length_m
    each = int(rib_count) // 2
    ca, sa = math.cos(math.radians(vein_deg)), math.sin(math.radians(vein_deg))
    out = []
    for j in range(1, each + 1):
        ys = y0 + (y1 - y0) * j / (each + 1.0)
        lo, hi = 0.0, width_m
        for _ in range(60):
            mid = (lo + hi) / 2.0
            if mid * sa < leaf_half(min(y1, ys + mid * ca), length_m, width_m, taper) and ys + mid * ca < y1:
                lo = mid
            else:
                hi = mid
        out.append((ys, lo, lo * sa, ys + lo * ca))
    return out


def leaf_roof_shape(length_m, width_m, taper, tip_cut, base_m, bumps, thickness_m, rib_count, vein_deg, rib_w_m, rib_d_m,
                    mid_w_m, mid_d_m, edge_w_m, edge_d_m, said=None):
    """Lane R's leaf roof on ribs (card P-007, the map's form 107): the skin over a leaf outline (cut blunt tip_cut of the
    length from each tip), its underside the bumps' surface, its thickness along its upward normal; under it the midrib
    tip to tip, rib_count ribs (half on each side) from even stations at vein_deg toward the tip to the edge, and an edge
    beam just inside the outline on each side. Every member hangs under the skin's underside (hung_member_shape: across
    it, its top straight from side to side, each side on the underside; R's generator keeps a member's top level at the
    lower of its two sides: the two differ by its width times half the slope across it). The skin is the first solid.
    said: told the reference numbers R's note prints (heights, half-widths, rib lengths, plan area). Returns a compound."""
    if length_m <= 0 or width_m <= 0 or thickness_m <= 0 or not (0.0 <= tip_cut < 0.5):
        raise ValueError("a leaf roof needs a length, a width and a thickness above nought, and its tips cut less than half its length")
    y0, y1 = -length_m / 2.0 + tip_cut * length_m, length_m / 2.0 - tip_cut * length_m

    def z(x, y):
        return bumps_height(x, y, base_m, bumps)

    grid = []
    for j in range(LEAF_NV + 1):
        y = y0 + (y1 - y0) * j / float(LEAF_NV)
        h = leaf_half(y, length_m, width_m, taper)
        grid.append([App.Vector((2.0 * i / LEAF_NU - 1.0) * h * MM, y * MM, z((2.0 * i / LEAF_NU - 1.0) * h, y) * MM) for i in range(LEAF_NU + 1)])
    skin = thicken_up(surface_through(grid).toShape(), thickness_m * MM)

    def under(x, y):
        return z(x / MM, y / MM) * MM

    solids = [skin]
    solids += hung_member_shape(Part.LineSegment(App.Vector(0, y0 * MM, 0), App.Vector(0, y1 * MM, 0)).toShape(), False, -mid_w_m * MM / 2, mid_w_m * MM / 2, under,
                                mid_d_m * MM, what="the midrib")
    ribs = leaf_ribs(length_m, width_m, taper, tip_cut, rib_count, vein_deg)
    for ys, lo, ex, ey in ribs:
        if lo <= 1e-6:
            continue
        for side in (-1.0, 1.0):
            e = Part.LineSegment(App.Vector(0, ys * MM, 0), App.Vector(side * ex * MM, ey * MM, 0)).toShape()
            solids += hung_member_shape(e, False, -rib_w_m * MM / 2, rib_w_m * MM / 2, under, rib_d_m * MM, what="a rib")
    for side in (-1.0, 1.0):
        pts = [App.Vector(side * max(leaf_half(y, length_m, width_m, taper) - edge_w_m / 2.0, 0.0) * MM, y * MM, 0)
               for y in (y0 + (y1 - y0) * k / 48.0 for k in range(49))]
        curve = Part.BSplineCurve()
        curve.interpolate(pts)
        solids += hung_member_shape(curve.toShape(), False, -edge_w_m * MM / 2, edge_w_m * MM / 2, under, edge_d_m * MM, what="an edge beam")
    if said is not None:
        plan = sum(2 * leaf_half(y0 + (y1 - y0) * (k + 0.5) / 2000.0, length_m, width_m, taper) * (y1 - y0) / 2000.0 for k in range(2000))
        said.update({"z_centre": z(0.0, 0.0), "z_midrib_quarter": z(0.0, length_m / 4.0), "z_edge_at_widest": z(width_m / 2.0, 0.0), "z_tip": z(0.0, y1),
                     "half_width_at_quarter": leaf_half(-length_m / 4.0, length_m, width_m, taper), "half_width_at_middle": leaf_half(0.0, length_m, width_m, taper),
                     "longest_rib_m": max((r[1] for r in ribs), default=0.0), "shortest_rib_m": min((r[1] for r in ribs), default=0.0),
                     "ribs": [(round(r[0], 4), round(r[1], 4)) for r in ribs], "plan_area_m2": plan, "midrib_length_m": y1 - y0, "solids": len(solids)})
    return Part.makeCompound(solids)


def folded_revolution_shape(radius_m, sides, flap, oculus_deg, steps, thickness_m, said=None):
    """Lane R's dome folded from one sheet (card P-002, the map's form 102): Jun Mitani's ORI-REVO "cylinder with flaps"
    (MIT), as R ported it. The meridian is a quarter circle of radius_m from oculus_deg off the pole to the ground in
    `steps` straight pieces; each of the `sides` strips is a row of flat four-sided faces from the corner line to the
    blade's tip (the spare width of the strip folded out as a blade along the next side). Each face is a slab of
    thickness_m, half on each side of it (as R's sheet). The foot ring stands at z = 0 (as the map draws it). said: told the
    sheet, the strip's width, the blades, the opening and the largest difference between a face on the sheet and in space.
    Returns a compound of one slab per face."""
    n, k = int(sides), int(steps)
    if radius_m <= 0 or thickness_m <= 0 or n < 3 or k < 1 or flap < 0 or not (0.0 <= oculus_deg < 90.0):
        raise ValueError("a folded dome needs a radius and a thickness above nought, three sides or more, a step, a flap not below nought "
                         "and an opening of less than 90 degrees")
    t0, t1 = math.radians(oculus_deg), math.pi / 2.0
    profile = [(radius_m * math.sin(t0 + (t1 - t0) * i / float(k)), radius_m * math.cos(t0 + (t1 - t0) * i / float(k))) for i in range(k + 1)]
    s, c = math.sin(math.pi / n), math.cos(math.pi / n)
    u = 2.0 * max(abs(x) for x, _z in profile) * (1.0 + flap) * s  # one strip's width on the flat sheet
    h = [0.0]
    for (xa, za), (xb, zb) in zip(profile, profile[1:]):
        piece = math.hypot(xb - xa, zb - za)
        h.append(h[-1] + math.sqrt(piece * piece - ((xb - xa) * s) ** 2))

    def tip(x, zz):
        long = (u + 2.0 * x * s) / 2.0  # the side of the polygon at this height, and its blade
        return (x - long * s, long * c, zz)

    worst, slabs, half = 0.0, [], thickness_m / 2.0
    for j in range(k):
        (xa, za), (xb, zb) = profile[j], profile[j + 1]
        quad = [(xa, 0.0, za), tip(xa, za), tip(xb, zb), (xb, 0.0, zb)]
        flat = [((u - 2 * xa * s) / 2, h[j]), (u, h[j]), (u, h[j + 1]), ((u - 2 * xb * s) / 2, h[j + 1])]
        for a, b in ((0, 1), (1, 2), (2, 3), (3, 0), (0, 2), (1, 3)):
            worst = max(worst, abs(math.dist(quad[a], quad[b]) - math.dist(flat[a], flat[b])))
        for i in range(n):
            ang = 2.0 * math.pi * i / n
            ca, sa = math.cos(ang), math.sin(ang)
            pts = [App.Vector((p[0] * ca - p[1] * sa) * MM, (p[0] * sa + p[1] * ca) * MM, p[2] * MM) for p in quad]
            normal = (pts[2] - pts[0]).cross(pts[3] - pts[1])
            if normal.Length < 1e-9:
                continue
            normal.normalize()
            if normal.z < 0:
                normal = normal * -1.0
            low = [p - normal * (half * MM) for p in pts]
            high = [p + normal * (half * MM) for p in pts]
            faces = [Part.Face(Part.makePolygon(low + low[:1])), Part.Face(Part.makePolygon(high + high[:1]))]
            for q in range(4):
                faces.append(Part.Face(Part.makePolygon([low[q], low[(q + 1) % 4], high[(q + 1) % 4], high[q], low[q]])))
            slab = Part.Solid(Part.Shell(faces))
            if slab.Volume < 0:
                slab.reverse()
            slabs.append(slab)
    if said is not None:
        said.update({"sheet_m": [n * u, h[-1]], "strip_width_m": u, "blade_at_ground_m": (u - 2 * profile[-1][0] * s) / 2.0,
                     "blade_at_opening_m": (u - 2 * profile[0][0] * s) / 2.0, "opening_diameter_m": 2 * profile[0][0], "worst_stretch_m": worst,
                     "faces": len(slabs), "face_area_m2": sum(sl.Volume for sl in slabs) / 1e9 / thickness_m})
    return Part.makeCompound(slabs)
