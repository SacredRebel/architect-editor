# -*- coding: utf-8 -*-
"""Organic: the Biomimetic tab's kernels. Structure the way living things build it.

Parameters are in metres; shapes are in FreeCAD's millimetres. Each kernel is a method that
can be measured:

  net        a net of laths found by the force density method (Schek 1974; Linkwitz): every
             free node in equilibrium between its neighbours and its load. Hung, it is a
             catenary net; turned over, a gridshell that carries the same load in compression.
  laths      a lattice lying on the back of any shell: laths both ways at a spacing, each flat on
             the shell from edge to edge, and a beam along each of the shell's edges.
  cells      a wall opened into cells: the Voronoi diagram of scattered seeds on the wall's
             unrolled face, each cell drawn back by half a rib and rounded, as in bone,
             dragonfly wings and dried mud.
  veins      a branching rib pattern grown by space colonisation (Runions, Fuhrer, Lane,
             Federl, Rolland-Lagan, Prusinkiewicz 2005: auxin sources draw the nearest vein
             tips towards them and are spent when reached), its widths by Murray's law.
  column     a column that branches like a tree: each branch splits into n and fans out about
             its own direction, its radius by r_parent^e = n r_child^e.

Sources. The force density and space colonisation methods are from the papers named above,
written here. The branch fan and the pipe-model radius follow the method of three.js's
TreeGenerator (MIT) in Johny's tool pool. Voronoi cells are scipy.spatial's (BSD), polygon
offsets and unions shapely's (BSD); both ship with FreeCAD 1.1.
"""

import math
import random

import FreeCAD as App
import Part

import numpy as np

import organic_geom as og

MM = og.MM
V = og.V
Z = og.Z


# ---------------------------------------------------------------- nets and gridshells
def ring_points(edge, count=240):
    """A closed plan curve as points (x, y) in metres, and its height (m)."""
    pts = edge.discretize(Number=count + 1)[:-1]
    return [(p.x / MM, p.y / MM) for p in pts], pts[0].z / MM


def _crossings(ring, axis, value):
    """Where the line x = value (axis 0) or y = value (axis 1) crosses a ring: the other
    coordinate of each crossing, sorted."""
    out = []
    for a, b in zip(ring, ring[1:] + ring[:1]):
        da, db = a[axis] - value, b[axis] - value
        if (da > 0) != (db > 0):
            t = da / (da - db)
            out.append(a[1 - axis] + (b[1 - axis] - a[1 - axis]) * t)
    return sorted(out)


def net_topology(ring, spacing_m):
    """A square net inside a closed ring: (nodes [(x, y)], fixed flags, edges [(i, j)], lines).

    Grid lines every spacing_m in both directions, centred on the ring's box. A node stands at
    every grid crossing inside the ring (free) and wherever a grid line meets the ring (fixed).
    `lines` are the laths: the node indices along each grid line, between two fixed ends."""
    xs, ys = [p[0] for p in ring], [p[1] for p in ring]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    s = float(spacing_m)
    gx = [cx + s * i for i in range(-int((cx - min(xs)) // s), int((max(xs) - cx) // s) + 1)]
    gy = [cy + s * j for j in range(-int((cy - min(ys)) // s), int((max(ys) - cy) // s) + 1)]
    nodes, fixed, index = [], [], {}

    def node(p, is_fixed, key=None):
        if key is not None and key in index:
            return index[key]
        nodes.append(p)
        fixed.append(is_fixed)
        if key is not None:
            index[key] = len(nodes) - 1
        return len(nodes) - 1

    lines = []
    for axis, mine, others in ((0, gx, gy), (1, gy, gx)):
        for i, value in enumerate(mine):
            cross = _crossings(ring, axis, value)
            for lo, hi in zip(cross[0::2], cross[1::2]):
                inner = [(j, o) for j, o in enumerate(others) if lo + 0.2 * s < o < hi - 0.2 * s]
                if not inner:
                    continue
                chain = [node((value, lo) if axis == 0 else (lo, value), True)]
                for j, o in inner:
                    key = (i, j) if axis == 0 else (j, i)
                    chain.append(node((value, o) if axis == 0 else (o, value), False, key))
                chain.append(node((value, hi) if axis == 0 else (hi, value), True))
                lines.append(chain)
    edges = [(a, b) for chain in lines for a, b in zip(chain, chain[1:])]
    return nodes, fixed, edges, lines


def force_density(nodes, fixed, edges, rise_m):
    """The net in equilibrium (force density 1 in every lath, one equal load on every free
    node), scaled so that its highest node stands rise_m above the fixed ones.
    Returns (xyz as an (n, 3) array, the load on a free node in the net's own units)."""
    import numpy as np

    n = len(nodes)
    xyz = np.zeros((n, 3))
    xyz[:, :2] = np.array(nodes, dtype=float)
    free = [i for i in range(n) if not fixed[i]]
    if not free:
        return xyz, 0.0
    slot = {i: k for k, i in enumerate(free)}
    d = np.zeros((len(free), len(free)))
    rhs = np.zeros((len(free), 3))
    for a, b in edges:
        for i, j in ((a, b), (b, a)):
            if i in slot:
                d[slot[i], slot[i]] += 1.0
                if j in slot:
                    d[slot[i], slot[j]] -= 1.0
                else:
                    rhs[slot[i]] += xyz[j]
    xyz[free, :2] = np.linalg.solve(d, rhs[:, :2])
    z = np.linalg.solve(d, np.ones(len(free)))  # the shape under a unit load on every node
    load = rise_m / z.max()
    xyz[free, 2] = z * load
    return xyz, float(load)


def equilibrium_residual(xyz, fixed, edges, load):
    """The largest unbalanced force on a free node, over the node load: each lath pulls with
    its own length (force density 1); the load is `load` on every free node."""
    import numpy as np

    force = np.zeros_like(xyz)
    for a, b in edges:
        force[a] += xyz[b] - xyz[a]
        force[b] += xyz[a] - xyz[b]
    force[:, 2] += load
    worst = max((float(np.linalg.norm(force[i])) for i in range(len(xyz)) if not fixed[i]), default=0.0)
    return worst / load if load else 0.0


def lath(points, width_m, depth_m, closed=False):
    """A lath through points (mm vectors): a rectangle width x depth swept along the smooth
    curve through them, as one solid. Its width lies level and square to the path at the
    start and is carried along without twist, so a lath in a net lies flat in the net.

    A rectangle, as timber laths are, and not a round: OCCT meshes a round swept along a
    spline into some 200,000 triangles (a 14 m lath, at 5 mm), a rectangle into a few hundred."""
    path = og.spline(points, closed=closed) if len(points) > 2 else Part.LineSegment(points[0], points[1]).toShape()
    p0, t0 = path.valueAt(path.FirstParameter), path.tangentAt(path.FirstParameter)
    side = t0.cross(Z)
    if side.Length < 1e-9:
        side = App.Vector(1, 0, 0)
    side.normalize()
    up = side.cross(t0)
    up.normalize()
    hw, hd = width_m * MM / 2, depth_m * MM / 2
    corners = [p0 + side * hw + up * hd, p0 - side * hw + up * hd, p0 - side * hw - up * hd, p0 + side * hw - up * hd]
    return og.solid_of(Part.Wire(path).makePipeShell([Part.makePolygon(corners + [corners[0]])], True, False))


def net_shape(ring_edge, spacing_m=1.0, rise_m=3.0, lath_width_m=0.08, lath_depth_m=0.05, hanging=False, edge_beam_m=0.0):
    """A net of laths over a closed plan curve, as a compound of solids (one per lath; they
    cross at the nodes, so the compound's volume counts each crossing twice).

    The form is the force density solution; `hanging` hangs it below the curve (a catenary
    net), else it stands above it (a gridshell). With an edge beam, a square beam of that
    size follows the curve.
    Returns (the compound, number of laths, their total length in m, the equilibrium residual)."""
    import numpy as np

    ring, z0 = ring_points(ring_edge)
    nodes, fixed, edges, lines = net_topology(ring, spacing_m)
    if not lines:
        raise ValueError("the curve is too small for laths %.2f m apart" % spacing_m)
    xyz, load = force_density(nodes, fixed, edges, rise_m)
    sign = -1.0 if hanging else 1.0
    solids = [lath([V(xyz[i][0], xyz[i][1], z0 + sign * xyz[i][2]) for i in chain], lath_width_m, lath_depth_m) for chain in lines]
    if edge_beam_m and edge_beam_m > 0:
        solids.append(lath([V(x, y, z0) for x, y in ring[::4]], edge_beam_m, edge_beam_m, closed=True))
    length = sum(float(np.linalg.norm(xyz[a] - xyz[b])) for a, b in edges)
    return Part.makeCompound(solids), len(lines), length, equilibrium_residual(xyz, fixed, edges, load)


# ---------------------------------------------------------------- laths on any shell
# Lane R's tool spec (study S-003): a lattice on a dome "or any Organic shell": laths at a
# spacing, a ring beam at the base, a compression ring at an opening. The laths lie on the
# shell's back: the part of it that is seen from above and is not one of its sides.
TOP_SEEDS = 8  # places each way on a face from which the search for its point over a plan place starts
SIDE_DEPTH = 2.0  # a face is a side of the shell, not its back, when this many of its own widths behind it is still in the solid
RING_POINTS = 48  # places along each edge of a face's boundary, in the face's own parameters
LATH_PIECE = 6  # stations to one face of a lath at most (FreeCAD's own Volume gives a face a fixed number of points)
STATION_MM = 250.0  # a lath's line is read off the shell at places no further apart than this
CREASE_DEG = 20.0  # two neighbouring places whose normals differ by more than this have a crease between them
CORNER_DEG = 30.0  # an edge that turns more than this at a point has a corner there: a beam ends, another begins
SKIN_BEND_DEG = 45.0  # a face carries the skin on across an edge when the two bend less than this there
SKIN_UPRIGHT = 0.05  # and when it is not upright there (its outward normal rises at least this much): a plinth's side does not


class Tops:
    """The back of a solid shell on upright lines: for a place (x, y) in mm, the highest point
    of the solid there that lies on its back, the face it lies on and the upward normal there.

    Found on each face by its own surface: from where the last place asked was found on it (or
    from the nearest of a few places kept of the face), Newton's steps to the point of the
    surface that stands over (x, y); it counts when it lies within the face. Whether it does is
    asked of the face's boundary as a polygon in the face's own parameters, and of the kernel
    itself only close to that boundary (the kernel's own answer took 1.3 ms on a leaf shell's
    top, against 0.01 ms for the point). A boolean of the solid with the line took 13 ms a
    place on a conoid and 80 ms on a wave vault, and found the same heights.

    A side of the shell is not its back: a face that still has the solid behind it SIDE_DEPTH
    of its own widths in (the end face of a shell made thick along its normal leans, and is
    seen from above; a lath does not lie on it). Of a face that an upright line meets twice
    (a dome wider above its foot) the part nearest to where it looked last is found."""

    def __init__(self, shape):
        self.rows = []
        for f in shape.Faces:
            s = f.Surface
            u0, u1, v0, v1 = f.ParameterRange
            du, dv = (u1 - u0) or 1.0, (v1 - v0) or 1.0
            seeds = []
            for i in range(TOP_SEEDS + 1):
                for j in range(TOP_SEEDS + 1):
                    u, v = u0 + du * i / float(TOP_SEEDS), v0 + dv * j / float(TOP_SEEDS)
                    q = s.value(u, v)
                    seeds.append((q.x, q.y, u, v))
            xs, ys = [q[0] for q in seeds], [q[1] for q in seeds]
            b = f.BoundBox
            periods = []
            for closes, period in (("isUPeriodic", "UPeriod"), ("isVPeriodic", "VPeriod")):
                try:
                    periods.append(getattr(s, period)() if getattr(s, closes)() else None)
                except Exception:
                    periods.append(None)
            row = {"face": f, "surface": s, "range": (u0, u1, v0, v1), "periods": tuple(periods), "seeds": seeds, "last": None, "side": None,
                   "box": (min(min(xs), b.XMin) - 1.0, max(max(xs), b.XMax) + 1.0, min(min(ys), b.YMin) - 1.0, max(max(ys), b.YMax) + 1.0)}
            row.update(self._boundary(f, u0, v0, du, dv))
            self.rows.append(row)
        self.asked = 0  # places asked
        self.exact = 0  # of them, those the kernel itself had to say of whether they lie within a face

    @staticmethod
    def _boundary(f, u0, v0, du, dv):
        """The face's boundary in its own parameters, each scaled to 0..1: its segments, how far
        they may lie off the true boundary, and whether the face is its whole rectangle. No
        polygon for a face with a seam or a point for an edge (a sphere, a cone): the kernel
        says of those, and is quick about it."""
        none = {"ring": None, "rect": False, "band": 0.0}
        segs, sag = [], 0.0
        try:
            for w in f.Wires:
                for e in w.OrderedEdges:
                    if e.Degenerated or e.isSeam(f):
                        return none
                    c2, a, b = f.curveOnSurface(e)
                    pts = []
                    for i in range(2 * RING_POINTS + 1):
                        p = c2.value(a + (b - a) * i / (2.0 * RING_POINTS))
                        pts.append(((p.x - u0) / du, (p.y - v0) / dv))
                    for i in range(0, 2 * RING_POINTS, 2):
                        p, m, q = pts[i], pts[i + 1], pts[i + 2]
                        segs.append((p[0], p[1], q[0], q[1]))
                        cx, cy = q[0] - p[0], q[1] - p[1]
                        length = math.hypot(cx, cy)
                        if length > 1e-15:
                            sag = max(sag, abs((m[0] - p[0]) * cy - (m[1] - p[1]) * cx) / length)
        except Exception:
            return none
        if not segs:
            return none
        ring = np.array(segs, dtype=float)
        on_box = np.all((np.abs(ring[:, [0, 2]] * (1 - ring[:, [0, 2]])) < 1e-7) | (np.abs(ring[:, [1, 3]] * (1 - ring[:, [1, 3]])) < 1e-7))
        return {"ring": ring, "rect": bool(on_box) and sag < 1e-9 and len(f.Wires) == 1, "band": 4.0 * sag + 1e-7}

    def _within(self, row, u, v):
        """Whether (u, v) lies within the face."""
        u0, u1, v0, v1 = row["range"]
        if not (u0 - 1e-9 <= u <= u1 + 1e-9 and v0 - 1e-9 <= v <= v1 + 1e-9):
            return False
        if row["rect"]:
            return True
        ring = row["ring"]
        if ring is None:
            self.exact += 1
            return row["face"].isPartOfDomain(u, v)
        p, q = (u - u0) / ((u1 - u0) or 1.0), (v - v0) / ((v1 - v0) or 1.0)
        x1, y1, x2, y2 = ring[:, 0], ring[:, 1], ring[:, 2], ring[:, 3]
        dx, dy = x2 - x1, y2 - y1
        t = np.clip(((p - x1) * dx + (q - y1) * dy) / np.maximum(dx * dx + dy * dy, 1e-30), 0.0, 1.0)
        if float(np.min(np.hypot(p - (x1 + t * dx), q - (y1 + t * dy)))) < row["band"]:
            self.exact += 1  # too close to the boundary for its polygon to say
            return row["face"].isPartOfDomain(u, v)
        cross = (y1 > q) != (y2 > q)
        if not np.any(cross):
            return False
        at = x1[cross] + (q - y1[cross]) * dx[cross] / dy[cross]
        return int(np.count_nonzero(at > p)) % 2 == 1

    @staticmethod
    def _over(row, x, y, u, v):
        """Newton from (u, v) to the point of the face's surface over (x, y): (u, v, z, the
        upward normal there) or None."""
        s = row["surface"]
        u0, u1, v0, v1 = row["range"]
        du, dv = (u1 - u0) or 1.0, (v1 - v0) or 1.0
        pu, pv = row["periods"]
        inward = lambda a, lo, hi, step: a + step if a - lo < hi - a else a - step  # noqa: E731  (a little way into the range)
        nudged = 0
        for _ in range(24):
            q = s.value(u, v)
            ex, ey = x - q.x, y - q.y
            a, b = s.getDN(u, v, 1, 0), s.getDN(u, v, 0, 1)
            if ex * ex + ey * ey < 1e-12:
                n = a.cross(b)
                if n.Length < 1e-9 * (a.Length * b.Length + 1e-30):  # a pole (a sphere's crown): its normal a hair's breadth away
                    a, b = s.getDN(inward(u, u0, u1, 1e-7 * du), inward(v, v0, v1, 1e-7 * dv), 1, 0), s.getDN(inward(u, u0, u1, 1e-7 * du), inward(v, v0, v1, 1e-7 * dv), 0, 1)
                    n = a.cross(b)
                    if n.Length < 1e-30:
                        return None
                n.normalize()
                return u, v, q.z, (n if n.z >= 0 else n * -1.0)
            det = a.x * b.y - a.y * b.x
            if abs(det) < 1e-9 * (a.Length * b.Length + 1e-30):
                if nudged == 3:
                    return None  # the surface stands upright here: no point of it is over a plan place
                nudged += 1  # or this is a pole, where one of its directions has no length: step off it and go on
                u, v = inward(u, u0, u1, 1e-4 * du), inward(v, v0, v1, 1e-4 * dv)
                continue
            # a step no longer than a quarter of the face each way (near a pole one of them is huge)
            u += max(-0.25 * du, min(0.25 * du, (ex * b.y - ey * b.x) / det))
            v += max(-0.25 * dv, min(0.25 * dv, (a.x * ey - a.y * ex) / det))
            # round a surface that closes on itself (a sphere about its axis) the step goes on past the seam; else it is
            # kept within the face's own range, and a little beyond (a step from far off overshoots a narrow face)
            u = u0 + (u - u0) % pu if pu else min(max(u, u0 - 0.02 * du), u1 + 0.02 * du)
            v = v0 + (v - v0) % pv if pv else min(max(v, v0 - 0.02 * dv), v1 + 0.02 * dv)
        return None

    def crossings(self, x, y):
        """Where the upright line through (x, y) meets the solid's faces, highest first:
        [(z, face index, the upward normal, u, v)] (of each face one place at most; a face
        that stands upright has none)."""
        out = []
        for k, row in enumerate(self.rows):
            x0, x1, y0, y1 = row["box"]
            if not (x0 <= x <= x1 and y0 <= y <= y1):
                continue
            got = None
            if row["last"] is not None:
                got = self._over(row, x, y, *row["last"])
                if got is not None and not self._within(row, got[0], got[1]):
                    got = None
            if got is None:
                # the two nearest kept places that stand apart: every place kept on a pole (a dome's crown) stands at one,
                # and from it, on the far side, Newton runs on over the pole and off the face (it left a lath across the
                # crown of an ellipse dome in two pieces)
                tried = []
                for seed in sorted(row["seeds"], key=lambda q: (q[0] - x) ** 2 + (q[1] - y) ** 2):
                    if any(abs(seed[0] - a) < 1.0 and abs(seed[1] - b) < 1.0 for a, b in tried):
                        continue
                    tried.append((seed[0], seed[1]))
                    got = self._over(row, x, y, seed[2], seed[3])
                    if got is not None and self._within(row, got[0], got[1]):
                        break
                    got = None
                    if len(tried) == 2:
                        break
            if got is not None:
                row["last"] = (got[0], got[1])
                out.append((got[2], k, got[3], got[0], got[1]))
        out.sort(key=lambda hit: -hit[0])
        return out

    def is_side(self, k):
        """Whether face k is a side of the shell: asked once, from its own middle, along its
        outward normal there turned about (into the solid), SIDE_DEPTH of its own widths."""
        row = self.rows[k]
        if row["side"] is None:
            f = row["face"]
            u0, u1, v0, v1 = row["range"]
            um, vm = (u0 + u1) / 2.0, (v0 + v1) / 2.0
            around = sum(e.Length for e in f.Edges)
            width = 2.0 * f.Area / around if around > 0 else 0.0
            q = f.valueAt(um, vm) - f.normalAt(um, vm) * (SIDE_DEPTH * width)
            above = sum(1 for hit in self.crossings(q.x, q.y) if hit[0] > q.z + 1e-6)
            row["side"] = above % 2 == 1
        return row["side"]

    def at(self, x, y):
        """(z, face index, normal) of the shell's back at (x, y) mm, or None where it has none."""
        self.asked += 1
        hits = self.crossings(x, y)
        if not hits:
            return None
        z, k, normal, u, v = hits[0]
        if self.rows[k]["face"].normalAt(u, v).z < -1e-6:
            return None  # the highest face found here looks down: what lies above it was not found, so no back is said to be here
        if self.is_side(k):
            return None
        return z, k, normal


def _slope(points, u, i):
    """dP/du at the i-th of three or more points given at parameters u: of the parabola through
    it and its two neighbours (at an end, the end's own two), their spacing as it is."""
    j = min(max(i - 1, 0), len(points) - 3)
    (pa, pb, pc), (a, b, c) = points[j:j + 3], u[j:j + 3]
    t = u[i]
    return pa * ((2 * t - b - c) / ((a - b) * (a - c))) + pb * ((2 * t - a - c) / ((b - a) * (b - c))) + pc * ((2 * t - a - b) / ((c - a) * (c - b)))


def lath_through(points, normals, width_mm, depth_mm, lift_mm=0.0, closed=False):
    """A lath as one solid: a rectangle width x depth at every point of its line (mm vectors),
    its underside on the line (lifted lift_mm along the normal), its width square to the line
    and to the normal there, so it lies flat on the surface the normals are of and turns with
    it. Four lines through the rectangles' corners (cubic, sharing their parameters: the
    length along the lath's own line), ruled faces between them in pieces of a few stations, a
    flat face at each end; a closed one (its last point its first) has none.

    Not a section swept along a path: OCCT's pipe could not close a lath that runs straight (a
    conoid's own straight lines), and keeps a section level where a shell tilts it."""
    n = len(points)
    if n < 2:
        raise ValueError("a lath needs two points at least")
    u = [0.0]  # the parameters the lath's lines share: the length along its own line, 0 to 1
    for p, q in zip(points, points[1:]):
        u.append(u[-1] + max((q - p).Length, 1e-6))
    u = [v / u[-1] for v in u]
    corners = [[], [], [], []]
    for i in range(n):
        if closed:  # its first point is its last: the neighbours of either are the second and the last but one
            tan = points[(i + 1) % (n - 1)] - points[(i - 1) % (n - 1)]
        else:  # the line's own direction at its place: the parabola through the place and its neighbours, the places' uneven spacing counted
            tan = _slope(points, u, i) if n > 2 else points[1] - points[0]
        side = tan.cross(App.Vector(normals[i]))
        if side.Length < 1e-9 or tan.Length < 1e-9:
            raise ValueError("a lath's line stands still, or runs along its own normal")
        side.normalize()
        up = side.cross(tan)
        up.normalize()
        base = points[i] + up * lift_mm
        for k, (sw, sd) in enumerate(((-0.5, 0.0), (0.5, 0.0), (0.5, 1.0), (-0.5, 1.0))):
            corners[k].append(base + side * (sw * width_mm) + up * (sd * depth_mm))
    if closed:
        for k in range(4):
            corners[k][-1] = corners[k][0]
    if n == 2:
        rails = [Part.LineSegment(c[0], c[1]) for c in corners]
        cuts = [(0.0, 1.0)]
        edge = lambda rail, ua, ub: rail.toShape()  # noqa: E731
    else:
        # the places need not be evenly spaced (a lath's last lies wherever the shell ends): at even parameters a
        # line through uneven places swings out, 0.23 m at one lath's foot; and each end leaves in the direction its
        # own last three places show (left free, an end bent too little, 0.14 % of a lath's volume on a hemisphere)
        rails = []
        for c in corners:
            rail = Part.BSplineCurve()
            if closed:
                rail.interpolate(Points=c[:-1], Parameters=u, PeriodicFlag=True)
            else:
                rail.interpolate(Points=c, Parameters=u, InitialTangent=_slope(c, u, 0), FinalTangent=_slope(c, u, n - 1), Scale=False)
            rails.append(rail)
        parts = int(math.ceil((n - 1) / float(LATH_PIECE)))
        marks = sorted({int(round((n - 1) * k / float(parts))) for k in range(parts + 1)})
        cuts = [(u[a], u[b]) for a, b in zip(marks, marks[1:])]
        edge = lambda rail, ua, ub: Part.Edge(rail, ua, ub)  # noqa: E731
    faces = []
    for ua, ub in cuts:
        for k in range(4):
            faces.append(Part.makeRuledSurface(edge(rails[k], ua, ub), edge(rails[(k + 1) % 4], ua, ub)))
    if not closed:
        for i in (0, n - 1):
            ring = [corners[k][i] for k in range(4)]
            faces.append(Part.Face(Part.makePolygon(ring + [ring[0]])))
    shell = Part.Shell(faces)
    shell.sewShape()
    solid = Part.Solid(shell)
    if solid.Volume < 0:
        solid.reverse()
    return solid


def laths_on(shell, spacing_m=1.0, width_m=0.08, depth_m=0.05, turn_deg=0.0, layers=1):
    """Laths lying on the back of any solid shell: lines every spacing_m both ways in plan (in
    the shell's own frame, about the middle of its box), turned turn_deg (45: a diagrid), each
    lath following the shell's own back from edge to edge, flat on it, its underside on the
    shell, the whole of its width on the shell. A lath ends at a crease of the shell (a groin, a
    ridge) and another begins. With two layers a second lath lies on each.
    Returns (the laths as solids, the nodes [(x, y, z) in mm: where two lines cross on the
    shell], the laths' total length in mm (one layer's), the indices of the faces they lie on,
    the Tops asked)."""
    tops = Tops(shell)
    b = shell.BoundBox
    cx, cy = (b.XMin + b.XMax) / 2.0, (b.YMin + b.YMax) / 2.0
    reach = math.hypot(b.XLength, b.YLength) / 2.0
    s = spacing_m * MM
    per = max(1, int(math.ceil(s / STATION_MM)))
    sub = s / per
    n = int(reach // s) + 1
    ca, sa = math.cos(math.radians(turn_deg)), math.sin(math.radians(turn_deg))
    w, d = width_m * MM, depth_m * MM
    held = {}

    def top(p, q):
        key = (round(p, 4), round(q, 4))
        if key not in held:
            held[key] = tops.at(cx + p * ca - q * sa, cy + p * sa + q * ca)
        return held[key]

    solids, nodes, total, faces = [], [], 0.0, set()
    for family in (0, 1):
        at = (lambda fixed, t: (fixed, t)) if family == 0 else (lambda fixed, t: (t, fixed))
        plane = App.Vector(ca, sa, 0.0) if family == 0 else App.Vector(-sa, ca, 0.0)  # square to the upright plane this family's laths lie in

        def on(fixed, t):
            """The shell's back under a lath's middle here, where its two edges lie on the shell too.
            Its edges are where its width reaches: square to its line and to the shell's normal. (Taken
            straight across in plan, they left a steep dome's outline long before the lath did: on a
            hemisphere of 5 m laths stopped up to 0.70 m above its foot; now 0.05 m, inside the ring.)"""
            p, q = at(fixed, t)
            mid = top(p, q)
            if mid is None:
                return None
            across = plane.cross(mid[2]).cross(mid[2])
            if across.Length < 1e-9:
                return None
            across.normalize()
            dx, dy = across.x * w / 2, across.y * w / 2
            dp, dq = dx * ca + dy * sa, -dx * sa + dy * ca  # into the grid's own directions
            if top(p + dp, q + dq) is None or top(p - dp, q - dq) is None:
                return None
            return mid

        def last_on(fixed, inside, outside):
            lo, hi = inside, outside
            for _ in range(10):
                mid = (lo + hi) / 2.0
                if on(fixed, mid) is None:
                    hi = mid
                else:
                    lo = mid
            return lo

        for i in range(-n, n + 1):
            fixed = i * s
            runs, run = [], []
            for j in range(-(n + 1) * per, (n + 1) * per + 1):  # a step past the box each way: every run ends on a place off the shell
                t = j * sub
                if on(fixed, t) is not None:
                    if not run:
                        start = last_on(fixed, t, t - sub)
                        if t - start > 1.0:
                            run.append(start)
                    run.append(t)
                elif run:
                    end = last_on(fixed, run[-1], t)
                    if end - run[-1] > 1.0:
                        run.append(end)
                    runs.append(run)
                    run = []
            for run in runs:
                if run[-1] - run[0] < 0.2 * s or len(run) < 2:
                    continue
                # a crease between two places (a groin, a ridge): the lath ends there and another begins
                parts, part = [], [run[0]]
                for t0, t1 in zip(run, run[1:]):
                    n0, n1 = on(fixed, t0)[2], on(fixed, t1)[2]
                    if n0.getAngle(n1) > math.radians(CREASE_DEG):
                        lo, hi = t0, t1
                        for _ in range(10):
                            mid = (lo + hi) / 2.0
                            got = on(fixed, mid)
                            if got is None:
                                break
                            if got[2].getAngle(n0) < got[2].getAngle(n1):
                                lo = mid
                            else:
                                hi = mid
                        if lo - part[-1] > 1.0:
                            part.append(lo)
                        parts.append(part)
                        part = [hi] if t1 - hi > 1.0 else []
                    part.append(t1)
                parts.append(part)
                for part in parts:
                    if len(part) < 2 or part[-1] - part[0] < 0.1 * s:
                        continue
                    # an end lies wherever the shell ends: a place closer to it than a third of a step is left out
                    if len(part) > 2 and part[1] - part[0] < 0.3 * sub:
                        del part[1]
                    if len(part) > 2 and part[-1] - part[-2] < 0.3 * sub:
                        del part[-2]
                    pts, nrm = [], []
                    for t in part:
                        z, face, normal = on(fixed, t)
                        p, q = at(fixed, t)
                        pts.append(App.Vector(cx + p * ca - q * sa, cy + p * sa + q * ca, z))
                        nrm.append(normal)
                        faces.add(face)
                    for layer in range(max(1, int(layers))):
                        solids.append(lath_through(pts, nrm, w, d, layer * d))
                    total += sum((q - p).Length for p, q in zip(pts, pts[1:]))
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            got = top(i * s, j * s)
            if got is not None:
                nodes.append((cx + i * s * ca - j * s * sa, cy + i * s * sa + j * s * ca, got[0]))
    if not solids:
        raise ValueError("the shell is too small for laths %.2f m apart" % spacing_m)
    return solids, nodes, total, faces, tops


def _edge_faces(shell):
    """{an edge's own number: [(face index, the edge)]} for every edge of the shell that is a
    line of its own (not a face's seam, not a point)."""
    out = {}
    for k, f in enumerate(shell.Faces):
        for e in f.Edges:
            if e.Length < 1.0 or e.Degenerated or e.isSeam(f):
                continue
            out.setdefault(e.hashCode(), []).append((k, e))
    return out


def _outward(face, point):
    u, v = face.Surface.parameter(point)
    return face.normalAt(u, v)


def skin_of(shell, faces):
    """The skin the laths lie on, whole: the faces they lie on and every face that carries on
    from one of them across an edge without a sharp bend and without standing upright (a foot
    panel of a geodesic shell too small for a lath to reach; the toe of a vault, but not the
    side of the plinth under it). Indices into shell.Faces."""
    skin = set(faces)
    pairs = [rows for rows in _edge_faces(shell).values() if len(rows) == 2]
    said = {}
    grew = True
    while grew:
        grew = False
        for n, ((ka, e), (kb, _same)) in enumerate(pairs):
            if (ka in skin) == (kb in skin):
                continue
            if n not in said:
                p = e.valueAt((e.FirstParameter + e.LastParameter) / 2.0)
                inside, other = (ka, kb) if ka in skin else (kb, ka)
                na, nb = _outward(shell.Faces[inside], p), _outward(shell.Faces[other], p)
                said[n] = na.getAngle(nb) < math.radians(SKIN_BEND_DEG) and nb.z > SKIN_UPRIGHT
            if said[n]:
                skin.add(kb if ka in skin else ka)
                grew = True
    return skin


def skin_edges(shell, skin):
    """The edges round a skin: those of its faces that only one of them has. As chains of (face
    index, edge, its first point, its last point), each chain's edges following each other."""
    alone = []
    for rows in _edge_faces(shell).values():
        mine = [row for row in rows if row[0] in skin]
        if len(mine) == 1:
            k, e = mine[0]
            alone.append((k, e, e.valueAt(e.FirstParameter), e.valueAt(e.LastParameter)))
    ends = lambda row: (row[2], row[3])  # noqa: E731
    chains = []
    while alone:
        chain = [alone.pop(0)]
        grew = True
        while grew:
            grew = False
            for n, row in enumerate(alone):
                if any((p - q).Length < 1e-3 for p in ends(chain[-1]) for q in ends(row)):
                    chain.append(alone.pop(n))
                    grew = True
                    break
                if any((p - q).Length < 1e-3 for p in ends(chain[0]) for q in ends(row)):
                    chain.insert(0, alone.pop(n))
                    grew = True
                    break
        chains.append(chain)
    return chains


def edge_beams(shell, skin, side_m):
    """A square beam of side_m lying on a skin along each of its edges, inside the edge: its
    foot on the skin, one of its sides on the edge (at a dome's foot: a ring round it, standing
    on the ground the dome stands on). Where the edge has a corner, or the skin a crease, one
    beam ends and the next begins (they share the corner); an edge that closes without a
    corner has one beam that closes too.
    Returns (the beams as solids, the length of edge they follow in mm)."""
    b = side_m * MM
    out, total = [], 0.0
    for chain in skin_edges(shell, skin):
        rows = []  # each edge's places in the chain's own direction: (point, the skin's outward normal, the way the edge runs)
        for k, e, first, last in chain:
            f = shell.Faces[k]
            count = max(2, int(math.ceil(e.Length / STATION_MM)))
            t0, t1 = e.FirstParameter, e.LastParameter
            row = []
            for i in range(count + 1):
                t = t0 + (t1 - t0) * i / float(count)
                p = e.valueAt(t)
                row.append((p, _outward(f, p), e.tangentAt(t)))  # the face's own outward normal: the same side of the skin all round its edge
            if rows:
                flip = (last - rows[-1][-1][0]).Length < (first - rows[-1][-1][0]).Length
            elif len(chain) > 1:
                flip = min((first - q).Length for q in chain[1][2:4]) < min((last - q).Length for q in chain[1][2:4])
            else:
                flip = False
            if flip:
                row = [(p, nrm, tan * -1.0) for p, nrm, tan in reversed(row)]
            rows.append(row)
        # which way is into the skin: asked once, of the face the first edge is of
        f0 = shell.Faces[chain[0][0]]
        p, nrm, tan = rows[0][1]
        cand = nrm.cross(tan)
        cand.normalize()
        u, v = f0.Surface.parameter(p + cand * 20.0)
        sign = 1.0 if f0.isPartOfDomain(u, v) else -1.0
        smooth = lambda a, c: a[2].getAngle(c[2]) < math.radians(CORNER_DEG) and a[1].getAngle(c[1]) < math.radians(CREASE_DEG)  # noqa: E731
        runs = [list(rows[0])]
        for row in rows[1:]:
            if (row[0][0] - runs[-1][-1][0]).Length < 1e-3 and smooth(runs[-1][-1], row[0]):
                runs[-1] += row[1:]
            else:  # a corner, or a crease of the skin: one beam ends here, the next begins
                runs.append(list(row))
        closed = (runs[0][0][0] - runs[-1][-1][0]).Length < 1e-3
        if closed and len(runs) > 1 and smooth(runs[-1][-1], runs[0][0]):
            runs[0] = runs.pop() + runs[0][1:]
        whole = closed and len(runs) == 1 and smooth(runs[0][-1], runs[0][0])
        for run in runs:
            if len(run) < 2:
                continue
            line = []
            for p, nrm, tan in run:
                inward = nrm.cross(tan) * sign
                inward.normalize()
                line.append(p + inward * (b / 2.0))
            try:
                out.append(lath_through(line, [nrm for _p, nrm, _tan in run], b, b, 0.0, closed=whole))
                total += sum((q[0] - p[0]).Length for p, q in zip(run, run[1:]))
            except Exception as exc:  # a beam is the shell's trim: said, and the laths stand without it
                App.Console.PrintWarning("Organic: a beam along a shell's edge could not be made (%s)\n" % exc)
    return out, total


def net_on_shell(shell, spacing_m=1.0, lath_width_m=0.08, lath_depth_m=0.05, turn_deg=0.0, layers=1, edge_beam_m=0.0):
    """A lattice lying on the back of any solid shell (a dome, a vault, a leaf, a conoid, a
    saddle, a shell roof): laths every spacing_m both ways, turned turn_deg in plan (45: a
    diagrid), in one layer or two, and with edge_beam_m a square beam of that side along each
    edge of the skin they lie on (a ring at a dome's foot, another round its oculus). A
    compound of solids: the laths cross at the nodes, the beams meet at the corners.
    Returns {"shape", "laths" (their number), "length_m" (one layer's), "nodes" [(x, y, z) m],
    "beams", "beam_m" (the length of edge they follow), "skin" (the face indices)}."""
    solids, nodes, total, faces, _tops = laths_on(shell, spacing_m, lath_width_m, lath_depth_m, turn_deg, layers)
    skin = skin_of(shell, faces)
    beams, around = edge_beams(shell, skin, edge_beam_m) if edge_beam_m and edge_beam_m > 0 else ([], 0.0)
    return {"shape": Part.makeCompound(solids + beams), "laths": len(solids), "length_m": total / MM, "nodes": [(x / MM, y / MM, z / MM) for x, y, z in nodes],
            "beams": len(beams), "beam_m": around / MM, "skin": sorted(skin)}


# ---------------------------------------------------------------- cellular walls
def scatter(length_m, height_m, cell_m, seed=1):
    """Seed points on the unrolled wall face, no two nearer than 0.7 of the cell size
    (dart throwing with a fixed seed: the same wall every time)."""
    rng = random.Random(int(seed))
    want = max(4, int(round(length_m * height_m / (cell_m * cell_m))))
    pts, tries = [], 0
    while len(pts) < want and tries < 200 * want:
        tries += 1
        p = (rng.uniform(0, length_m), rng.uniform(0, height_m))
        if all(math.hypot(p[0] - q[0], p[1] - q[1]) >= 0.7 * cell_m for q in pts):
            pts.append(p)
    return pts


def cell_polygons(length_m, height_m, cell_m=0.8, rib_m=0.12, margin_m=0.3, seed=1, periodic=False):
    """The cells of a wall face length x height as shapely polygons in (along, up) metres:
    the Voronoi cells of scattered seeds, kept inside the face less its margin, each drawn
    back by half a rib and its corners rounded. On a closed wall the pattern runs round
    without a seam (a cell may reach past the face's ends)."""
    import numpy as np
    from scipy.spatial import Voronoi
    from shapely.geometry import Polygon, box

    seeds = scatter(length_m, height_m, cell_m, seed)
    pts = list(seeds)
    for x, y in seeds:  # mirror images bound the outer cells; round a closed wall they repeat
        pts += [(x, -y), (x, 2 * height_m - y)]
        pts += [(x - length_m, y), (x + length_m, y)] if periodic else [(-x, y), (2 * length_m - x, y)]
    vor = Voronoi(np.array(pts))
    frame = box(-length_m if periodic else margin_m, margin_m, 2 * length_m if periodic else length_m - margin_m, height_m - margin_m)
    round_m = min(0.2 * cell_m, 0.5 * rib_m + 0.05)
    out = []
    for k in range(len(seeds)):
        region = vor.regions[vor.point_region[k]]
        if not region or -1 in region:
            continue
        cell = Polygon([tuple(vor.vertices[i]) for i in region]).intersection(frame)
        cell = cell.buffer(-(rib_m / 2 + round_m)).buffer(round_m, quad_segs=4)
        for part in getattr(cell, "geoms", [cell]):
            if not part.is_empty and part.area > 0.02 * cell_m * cell_m:
                out.append(part)
    return out


def cellular_wall_shape(edge, closed, thickness_m, height_m, cell_m=0.8, rib_m=0.12, margin_m=0.3, seed=1,
                        align="Center", base_z_m=0.0, foundation_m=0.0):
    """A wall on a plan curve, opened into Voronoi cells between ribs: one solid.
    Returns (the solid, the cells' total area in m², the wall face's area in m²)."""
    wall = og.wall_shape(edge, closed, thickness_m, height_m, align, foundation_m=foundation_m)
    length_m = edge.Length / MM
    cells = cell_polygons(length_m, height_m, cell_m, rib_m, margin_m, seed, periodic=closed)
    t = thickness_m * MM
    d1, d2 = og.wall_sides(align, t)
    voids = []
    for cell in cells:
        c = cell.centroid
        at = c.x % length_m if closed else max(0.0, min(length_m, c.x))
        u = edge.getParameterByLength(at * MM)
        p, tan = edge.valueAt(u), edge.tangentAt(u)
        tan = App.Vector(tan.x, tan.y, 0)
        tan.normalize()
        left = Z.cross(tan)
        try:
            k = edge.curvatureAt(u)
        except Exception:
            k = 0.0
        width = (cell.bounds[2] - cell.bounds[0]) * MM
        depth = t + 2 * (width * width * k / 8.0 if k > 1e-12 else 0.0) + 0.4 * MM
        start = p + left * ((d1 + d2) / 2) - left * (depth / 2)
        ring = [start + tan * ((x - c.x) * MM) + Z * (y * MM) for x, y in list(cell.exterior.coords)[:-1]]
        voids.append(Part.Face(Part.makePolygon(ring + [ring[0]])).extrude(left * depth))
    if voids:
        wall = og.solid_of(wall.cut(Part.makeCompound(voids)))
    wall.translate(App.Vector(0, 0, base_z_m * MM))
    return og.refined(wall), sum(c.area for c in cells), length_m * height_m


# ---------------------------------------------------------------- veins
def venation(outline, root, sources=180, seed=1, step_m=0.4, kill_m=0.5, reach_m=6.0, limit=600):
    """A vein pattern inside an outline [(x, y)], grown from a root point by space colonisation.

    Auxin sources are scattered in the outline. In each round every source pulls on the vein
    node nearest to it (within reach); each pulled node grows a new node one step towards the
    mean of its sources; sources a vein has come within kill distance of are spent.
    Returns (nodes [(x, y)], parent index of each node, -1 for the root)."""
    import numpy as np

    rng = random.Random(int(seed))
    xs, ys = [p[0] for p in outline], [p[1] for p in outline]
    src, tries = [], 0
    while len(src) < sources and tries < 100 * sources:
        tries += 1
        p = (rng.uniform(min(xs), max(xs)), rng.uniform(min(ys), max(ys)))
        if og.point_in_ring(p[0], p[1], outline) and og.dist_to_ring(p[0], p[1], outline) > 0.5 * kill_m:
            src.append(p)
    src = np.array(src, dtype=float).reshape(-1, 2)
    nodes, parent = [tuple(float(c) for c in root)], [-1]
    for _round in range(limit):
        if not len(src):
            break
        pts = np.array(nodes)
        dist = np.linalg.norm(src[:, None, :] - pts[None, :, :], axis=2)
        src = src[dist.min(axis=1) > kill_m]
        if not len(src):
            break
        dist = np.linalg.norm(src[:, None, :] - pts[None, :, :], axis=2)
        nearest = dist.argmin(axis=1)
        grown = 0
        for i in sorted(set(int(k) for k in nearest)):
            mine = src[(nearest == i) & (dist[np.arange(len(src)), nearest] <= reach_m)]
            if not len(mine):
                continue
            pull = mine - pts[i]
            pull = (pull / np.linalg.norm(pull, axis=1, keepdims=True)).sum(axis=0)
            ln = float(np.linalg.norm(pull))
            if ln < 1e-9:
                continue
            q = (float(pts[i][0] + pull[0] / ln * step_m), float(pts[i][1] + pull[1] / ln * step_m))
            if not og.point_in_ring(q[0], q[1], outline):
                continue
            if float(np.linalg.norm(np.array(nodes) - np.array(q), axis=1).min()) < 0.25 * step_m:
                continue  # its sources pull the same way again: no new node
            nodes.append(q)
            parent.append(i)
            grown += 1
        if not grown:
            break
    return nodes, parent


def murray_widths(parent, tip_m=0.06, exponent=3.0, widest_m=0.6):
    """Each vein node's width: the tips tip_m wide, every other node w^e = the sum of its
    children's w^e (Murray's law, e = 3: the flow a vessel carries goes with its radius cubed)."""
    n = len(parent)
    children = [[] for _ in range(n)]
    for i, p in enumerate(parent):
        if p >= 0:
            children[p].append(i)
    width = [0.0] * n
    for i in range(n - 1, -1, -1):  # a node is always made after its parent
        width[i] = tip_m if not children[i] else min(widest_m, sum(width[c] ** exponent for c in children[i]) ** (1.0 / exponent))
    return width


def vein_chains(parent):
    """The vein tree as branches: each a list of node indices from the root or a fork to the
    next fork or tip."""
    children = [[] for _ in parent]
    for i, p in enumerate(parent):
        if p >= 0:
            children[p].append(i)
    chains, starts = [], [0]
    while starts:
        start = starts.pop()
        for c in children[start]:
            chain = [start, c]
            while len(children[chain[-1]]) == 1:
                chain.append(children[chain[-1]][0])
            chains.append(chain)
            if children[chain[-1]]:
                starts.append(chain[-1])
    return chains


def vein_ribs(nodes, parent, widths, top_at, thickness_m, depth_m):
    """Ribs under a shell along a vein pattern: one solid per branch, a rectangle as wide as
    the branch and depth_m deep under the shell, swept along it; it reaches half-way into
    the shell, so shell and ribs read as one piece.

    top_at(x, y) is the height of the shell's upper surface; the ribs hang square to it."""
    def under(i):
        x, y = nodes[i]
        e = 0.05
        hx = (top_at(x + e, y) - top_at(x - e, y)) / (2 * e)
        hy = (top_at(x, y + e) - top_at(x, y - e)) / (2 * e)
        ln = math.sqrt(hx * hx + hy * hy + 1.0)
        d = 0.75 * thickness_m + 0.5 * depth_m  # the rib's middle, below the upper surface along its normal
        return V(x + hx / ln * d, y + hy / ln * d, top_at(x, y) - d / ln)

    ribs = []
    for chain in vein_chains(parent):
        pts = [under(i) for i in chain]
        for _pass in range(2):  # the grown path zigzags: ease it, ends kept
            pts = [pts[0]] + [(a + b * 2 + c) * 0.25 for a, b, c in zip(pts, pts[1:], pts[2:])] + [pts[-1]]
        width = widths[chain[1]]
        try:
            rib = lath(pts, width, depth_m + 0.5 * thickness_m)
            if not rib.isValid():
                raise ValueError("the sweep folded")
        except Exception:
            rib = lath([pts[0], pts[-1]], width, depth_m + 0.5 * thickness_m)
        ribs.append(rib)
    return ribs


# ---------------------------------------------------------------- branching columns
def branching_column(height_m=5.0, trunk_m=2.2, levels=2, branches=3, spread_m=2.5, trunk_radius_m=0.18,
                     exponent=2.3, tip_radius_m=0.04, fan_deg=110.0):
    """A column that branches like a tree, standing on Z = 0, its tips level at height_m.

    The trunk rises trunk_m; at each of `levels` every branch splits into `branches`. The first
    set stands evenly round the trunk; later sets fan out about their branch's own direction.
    The steps outwards shorten by 0.6 each level and add up to spread_m, so no tip stands
    further out than that. A branch thins by a tenth along its length, and where it splits
    r_parent^e = n r_child^e (e = 3 is Murray's law, 2 is Leonardo's rule; trees measure
    near 2.3). Every fork has a knuckle (a ball a fifth wider than the branch that ends in
    it) and every tip a level cap to bear on.

    The result is a compound of solids, one per branch, knuckle and cap, not their union:
    OCCT's booleans fail on branches meeting in a point (one such union ended the program).
    They overlap inside the knuckles and caps, so the compound's volume counts that twice.
    Returns (the compound, the tips [(x, y, z)] in metres)."""
    levels, n = max(1, int(levels)), max(2, int(branches))
    ratio = n ** (-1.0 / exponent)
    weights = [0.6 ** k for k in range(levels)]
    reach = [spread_m * w / sum(weights) for w in weights]
    radii = [trunk_radius_m * 0.9]
    for _level in range(levels):
        radii.append(max(tip_radius_m, max(tip_radius_m, radii[-1] * ratio) * 0.9))
    cap = 2.0 * radii[-1]  # the caps' height
    rise = (height_m - cap / 2 - trunk_m) / levels
    parts, tips = [], []

    def member(a, b, r0, r1):
        axis = App.Vector(*b) - App.Vector(*a)
        if abs(r0 - r1) < 1e-9:
            parts.append(Part.makeCylinder(r0 * MM, axis.Length * MM, V(*a), axis))
        else:
            parts.append(Part.makeCone(r0 * MM, r1 * MM, axis.Length * MM, V(*a), axis))

    def grow(base, level, r, azimuth):
        if level == levels:
            parts.append(Part.makeCylinder(1.5 * r * MM, cap * MM, V(base[0], base[1], height_m - cap), Z))
            tips.append((base[0], base[1], height_m))
            return
        parts.append(Part.makeSphere(1.2 * r * MM, V(*base)))
        r0 = max(tip_radius_m, r * ratio)
        r1 = max(tip_radius_m, r0 * 0.9)
        for k in range(n):
            a = azimuth + (360.0 * k / n if level == 0 else (k - (n - 1) / 2.0) * fan_deg / (n - 1))
            end = (base[0] + reach[level] * math.cos(math.radians(a)), base[1] + reach[level] * math.sin(math.radians(a)), base[2] + rise)
            member(base, end, r0, r1)
            grow(end, level + 1, r1, a)

    top = (0.0, 0.0, trunk_m)
    member((0.0, 0.0, 0.0), top, trunk_radius_m, radii[0])
    grow(top, 0, radii[0], 90.0)
    return Part.makeCompound(parts), tips
