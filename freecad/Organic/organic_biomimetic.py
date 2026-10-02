# -*- coding: utf-8 -*-
"""Organic: the Biomimetic tab's kernels. Structure the way living things build it.

Parameters are in metres; shapes are in FreeCAD's millimetres. Each kernel is a method that
can be measured:

  net        a net of laths found by the force density method (Schek 1974; Linkwitz): every
             free node in equilibrium between its neighbours and its load. Hung, it is a
             catenary net; turned over, a gridshell that carries the same load in compression.
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
