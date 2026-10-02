# -*- coding: utf-8 -*-
"""Organic: the Sacred tab's kernels. Proportion systems, plan figures, regular solids, the sun.

Parameters are in metres and degrees; shapes are in FreeCAD's millimetres. Everything here is
measurable geometry: each figure is the construction its name says, and each number can be
checked against a closed form.

Sources. The constants, the two-circle figure, root rectangles, the pentagon, the spirals and
the regular solids' vertices come from this repository's plugin-geometry (MIT); its turned
squares, Fibonacci squares and circle lattice are wrong there and are built correctly here.
The sun's position is plugin-eco's NOAA port (MIT). The rising and setting azimuths on the
site are the land pack's own (sky-events.json), with an astronomical fallback.
"""

import datetime
import json
import math
import urllib.request

import FreeCAD as App
import Part

import organic_geom as og

MM = og.MM
V = og.V
Z = og.Z
PHI = (1 + 5 ** 0.5) / 2
SQRT2, SQRT3, SQRT5 = 2 ** 0.5, 3 ** 0.5, 5 ** 0.5
FOOT = 0.3048  # the default module: the pack's construction grid is 30 of these (9.144 m)
PACK = "https://sulphur-mountain-world.vercel.app/"

# ---------------------------------------------------------------- proportion systems
# Each ratio is short : long, as a number <= 1.
SYSTEMS = {
    "Golden (phi)": [("1 : 1", 1.0), ("1 : sqrt(phi)", PHI ** -0.5), ("1 : phi", 1 / PHI), ("1 : sqrt5", 1 / SQRT5),
                     ("1 : phi^2", PHI ** -2), ("1 : phi^3", PHI ** -3)],
    "Root 2 (ad quadratum)": [("1 : 1", 1.0), ("1 : sqrt2", 1 / SQRT2), ("1 : 2", 0.5), ("1 : 1+sqrt2", 1 / (1 + SQRT2)),
                              ("1 : 2 sqrt2", 1 / (2 * SQRT2)), ("1 : 4", 0.25)],
    "Root 3 (ad triangulum)": [("1 : 1", 1.0), ("sqrt3 : 2", SQRT3 / 2), ("1 : sqrt3", 1 / SQRT3), ("1 : 2", 0.5),
                               ("1 : 3", 1 / 3.0), ("1 : 2 sqrt3", 1 / (2 * SQRT3))],
    # Alberti, De re aedificatoria IX: three short, three middle, three long areas
    "Musical (Alberti)": [("1 : 1", 1.0), ("3 : 4", 0.75), ("2 : 3", 2 / 3.0), ("9 : 16", 9 / 16.0), ("1 : 2", 0.5),
                          ("4 : 9", 4 / 9.0), ("3 : 8", 3 / 8.0), ("1 : 3", 1 / 3.0), ("1 : 4", 0.25)],
    # Palladio, I quattro libri I.21: the seven shapes of rooms (the circle aside)
    "Palladio": [("1 : 1", 1.0), ("3 : 4", 0.75), ("1 : sqrt2", 1 / SQRT2), ("2 : 3", 2 / 3.0), ("3 : 5", 0.6), ("1 : 2", 0.5)],
    "Fibonacci": [("1 : 1", 1.0), ("2 : 3", 2 / 3.0), ("5 : 8", 0.625), ("8 : 13", 8 / 13.0), ("3 : 5", 0.6), ("1 : 2", 0.5),
                  ("13 : 21", 13 / 21.0)],
}
SYSTEM_NAMES = list(SYSTEMS)


def nearest_ratio(a, b, system):
    """The system's ratio nearest to a : b (taken short : long).
    Returns (name, value, deviation), deviation = (measured - value) / value."""
    lo, hi = sorted((abs(float(a)), abs(float(b))))
    r = lo / hi if hi else 0.0
    name, value = min(SYSTEMS[system], key=lambda nv: abs(r - nv[1]))
    return name, value, (r - value) / value


def snap_to_module(length_m, module_m):
    """The nearest whole number of modules (at least one), and the length that is."""
    n = max(1, int(round(length_m / module_m)))
    return n, n * module_m


def snap_pair(long_m, short_m, system, module_m):
    """The long side on a whole number of modules; the short side at the system's nearest ratio."""
    _n, long_new = snap_to_module(max(long_m, short_m), module_m)
    _name, value, _dev = nearest_ratio(short_m, long_m, system)
    return long_new, long_new * value


# ---------------------------------------------------------------- plan figures
def circle(r_m, cx=0.0, cy=0.0):
    return Part.makeCircle(r_m * MM, V(cx, cy), Z)


def polyline(points, closed=True):
    pts = [V(x, y) for x, y in points]
    return Part.makePolygon(pts + [pts[0]] if closed else pts)


def line(p, q):
    return Part.LineSegment(V(*p), V(*q)).toShape()


def arc3(p, m, q):
    return Part.Arc(V(*p), V(*m), V(*q)).toShape()


def vesica(r):
    """The vesica piscis: two circles of radius r, each through the other's centre.
    Outline: the lens. Its width is r, its height r sqrt3."""
    lens = og.vesica_curve(r)
    h = r * SQRT3 / 2
    return lens, [circle(r, -r / 2, 0), circle(r, r / 2, 0), line((0, -h), (0, h)), line((-r / 2, 0), (r / 2, 0))]


def circle_lattice(r, rings):
    """Centres of the overlapping-circle lattice: each circle of radius r passes through its
    neighbours' centres (spacing r), in hexagonal rings about the origin."""
    d = lambda k: (math.cos(math.radians(60 * k)), math.sin(math.radians(60 * k)))
    pts = [(0.0, 0.0)]
    for ring in range(1, rings + 1):
        for k in range(6):
            (ax, ay), (bx, by) = d(k), d(k + 2)
            for j in range(ring):
                pts.append((r * (ring * ax + j * bx), r * (ring * ay + j * by)))
    return pts


def hexafoil(r):
    """The outer boundary of six circles of radius r whose centres stand r from the origin:
    six arcs, each from one neighbour's crossing over the far point 2r to the next."""
    edges = []
    for k in range(6):
        a = math.radians(60 * k)
        p = (r * SQRT3 * math.cos(a - math.pi / 6), r * SQRT3 * math.sin(a - math.pi / 6))
        q = (r * SQRT3 * math.cos(a + math.pi / 6), r * SQRT3 * math.sin(a + math.pi / 6))
        edges.append(arc3(p, (2 * r * math.cos(a), 2 * r * math.sin(a)), q))
    return Part.Wire(edges)


def seed_of_life(r):
    """Seven circles of radius r: one, and six round it through its centre.
    Outline: the six-lobed boundary of the outer six."""
    return hexafoil(r), [circle(r, x, y) for x, y in circle_lattice(r, 1)]


def flower_of_life(r, rings=2):
    """The overlapping-circle lattice to `rings` rings (two rings: 19 circles), in its
    enclosing circle of radius (rings + 1) r, which is the outline."""
    return Part.Wire(circle((rings + 1) * r)), [circle(r, x, y) for x, y in circle_lattice(r, rings)]


def golden_rectangle(short, squares=6):
    """A rectangle short x short phi (the outline), cut into whirling squares, with the
    golden spiral drawn as a quarter circle in each square."""
    x, y, w, h = 0.0, 0.0, short * PHI, short
    outline = polyline([(x, y), (x + w, y), (x + w, y + h), (x, y + h)])
    extra = []
    for k in range(int(squares)):
        step = k % 4
        s = h if step in (0, 2) else w
        if s <= 1e-9:
            break
        if step == 0:  # the square on the left
            sq, c, a0 = (x, y), (x + s, y), 180.0
            x, w = x + s, w - s
        elif step == 1:  # on top
            sq, c, a0 = (x, y + h - s), (x, y + h - s), 90.0
            h = h - s
        elif step == 2:  # on the right
            sq, c, a0 = (x + w - s, y), (x + w - s, y + h), 0.0
            w = w - s
        else:  # at the bottom
            sq, c, a0 = (x, y), (x + s, y + s), -90.0
            y, h = y + s, h - s
        extra.append(polyline([sq, (sq[0] + s, sq[1]), (sq[0] + s, sq[1] + s), (sq[0], sq[1] + s)]))
        pt = lambda deg: (c[0] + s * math.cos(math.radians(deg)), c[1] + s * math.sin(math.radians(deg)))
        extra.append(arc3(pt(a0), pt(a0 - 45.0), pt(a0 - 90.0)))
    return outline, extra


def root_rectangle(short, root=2):
    """A rectangle short x short sqrt(root), root 2, 3 or 5 (the outline), with the square it
    grows from and the diagonal that gives its long side."""
    long_side = short * math.sqrt(root)
    outline = polyline([(0, 0), (long_side, 0), (long_side, short), (0, short)])
    prev = short * math.sqrt(root - 1)  # the rectangle before it: its diagonal is this one's long side
    return outline, [line((prev, 0), (prev, short)), line((0, 0), (prev, short))]


def turned_squares(side, steps=4):
    """Ad quadratum: a square (the outline) and, inside it, squares turned 45 degrees, each
    through the mid-sides of the one before; every step halves the area."""
    h = side / 2
    squares = []
    for i in range(int(steps) + 1):
        if i % 2 == 0:
            squares.append(polyline([(-h, -h), (h, -h), (h, h), (-h, h)]))
        else:
            squares.append(polyline([(h * SQRT2, 0), (0, h * SQRT2), (-h * SQRT2, 0), (0, -h * SQRT2)]))
        h = h / SQRT2
    return squares[0], squares[1:]


def regular_polygon(radius, sides):
    """A regular polygon in its circumscribed circle, a vertex to the north."""
    n = max(3, int(sides))
    pts = [(radius * math.cos(math.pi / 2 + 2 * math.pi * i / n), radius * math.sin(math.pi / 2 + 2 * math.pi * i / n)) for i in range(n)]
    return polyline(pts), [circle(radius)]


def star_polygon(radius, points, step=2):
    """The star {n/k}: its outer boundary (the outline), with the chords joining every k-th
    vertex of the regular n-gon."""
    n, k = max(5, int(points)), max(2, int(step))
    if 2 * k >= n:
        k = max(2, (n - 1) // 2)
    inner = radius * math.cos(math.pi * k / n) / math.cos(math.pi * (k - 1) / n)
    outer = [(radius * math.cos(math.pi / 2 + 2 * math.pi * i / n), radius * math.sin(math.pi / 2 + 2 * math.pi * i / n)) for i in range(n)]
    pts = []
    for i in range(n):
        pts.append(outer[i])
        a = math.pi / 2 + 2 * math.pi * (i + 0.5) / n
        pts.append((inner * math.cos(a), inner * math.sin(a)))
    return polyline(pts), [line(outer[i], outer[(i + k) % n]) for i in range(n)] + [circle(radius)]


def module_grid(module, cells_x, cells_y):
    """A grid of square modules, cells_x by cells_y; the outline is its edge."""
    w, h = module * int(cells_x), module * int(cells_y)
    extra = [line((module * i, 0), (module * i, h)) for i in range(1, int(cells_x))]
    extra += [line((0, module * j), (w, module * j)) for j in range(1, int(cells_y))]
    return polyline([(0, 0), (w, 0), (w, h), (0, h)]), extra


FIGURES = ["Vesica piscis", "Seed of life", "Flower of life", "Golden rectangle", "Root rectangle", "Turned squares",
           "Polygon", "Star", "Module grid"]


def figure(kind, size, count=6, step=2, root=2, cells_y=0):
    """(outline wire, construction shapes) of a named figure. `size` is its radius, short side
    or module; `count` its rings, squares, steps, sides, points or cells."""
    if kind == "Vesica piscis":
        return vesica(size)
    if kind == "Seed of life":
        return seed_of_life(size)
    if kind == "Flower of life":
        return flower_of_life(size, max(1, min(6, int(count))))
    if kind == "Golden rectangle":
        return golden_rectangle(size, count)
    if kind == "Root rectangle":
        return root_rectangle(size, root if root in (2, 3, 5) else 2)
    if kind == "Turned squares":
        return turned_squares(size, count)
    if kind == "Star":
        return star_polygon(size, count, step)
    if kind == "Module grid":
        return module_grid(size, max(1, int(count)), max(1, int(cells_y or count)))
    return regular_polygon(size, count)


# ---------------------------------------------------------------- regular solids
SOLIDS = ["Tetrahedron", "Cube", "Octahedron", "Dodecahedron", "Icosahedron"]


def _cyclic(v):
    return [v, (v[1], v[2], v[0]), (v[2], v[0], v[1])]


def platonic_vertices(kind, edge):
    """Vertices of a regular solid of that edge, centred on the origin (plugin-geometry's
    coordinates: Euclid XIII)."""
    e = edge
    if kind == "Tetrahedron":
        s = e / math.sqrt(8)
        return [(s, s, s), (s, -s, -s), (-s, s, -s), (-s, -s, s)]
    if kind == "Cube":
        return [(x * e / 2, y * e / 2, z * e / 2) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    if kind == "Octahedron":
        a = e / SQRT2
        return [(a, 0, 0), (-a, 0, 0), (0, a, 0), (0, -a, 0), (0, 0, a), (0, 0, -a)]
    if kind == "Icosahedron":
        out = []
        for sy in (-1, 1):
            for sz in (-1, 1):
                out += _cyclic((0.0, sy * e / 2, sz * PHI * e / 2))
        return out
    out = [(x, y, z) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    for sy in (-1, 1):
        for sz in (-1, 1):
            out += _cyclic((0.0, sy / PHI, sz * PHI))
    return [(x * e * PHI / 2, y * e * PHI / 2, z * e * PHI / 2) for x, y, z in out]


def solid_from_triangles(points_m, triangles):
    """A closed solid from outward-wound triangles (the mesh-to-shape path, which sews them),
    its coplanar triangles merged into faces."""
    shape = Part.Shape()
    shape.makeShapeFromMesh(([V(*p) for p in points_m], [tuple(t) for t in triangles]), 0.01)
    return og.solid_of(Part.makeSolid(shape).removeSplitter())


def hull_triangles(points):
    """The convex hull's triangles, wound outward."""
    from scipy.spatial import ConvexHull

    hull = ConvexHull(points)
    c = [sum(p[i] for p in points) / len(points) for i in range(3)]
    out = []
    for a, b, d in hull.simplices:
        pa, pb, pd = points[a], points[b], points[d]
        n = ((pb[1] - pa[1]) * (pd[2] - pa[2]) - (pb[2] - pa[2]) * (pd[1] - pa[1]),
             (pb[2] - pa[2]) * (pd[0] - pa[0]) - (pb[0] - pa[0]) * (pd[2] - pa[2]),
             (pb[0] - pa[0]) * (pd[1] - pa[1]) - (pb[1] - pa[1]) * (pd[0] - pa[0]))
        out.append((int(a), int(b), int(d)) if sum(n[i] * (pa[i] - c[i]) for i in range(3)) > 0 else (int(a), int(d), int(b)))
    return out


PLATONIC_VOLUME = {  # of unit edge: the closed forms
    "Tetrahedron": 1 / (6 * SQRT2), "Cube": 1.0, "Octahedron": SQRT2 / 3,
    "Dodecahedron": (15 + 7 * SQRT5) / 4, "Icosahedron": 5 * (3 + SQRT5) / 12,
}


def platonic_solid(kind, edge, standing="On a face"):
    """A regular solid of that edge, standing on Z = 0 on a face or on a vertex, or centred."""
    pts = platonic_vertices(kind, edge)
    tris = hull_triangles(pts)
    solid = solid_from_triangles(pts, tris)
    if standing == "Centred":
        return solid
    if standing == "On a vertex":
        down = App.Vector(*pts[0])
    else:
        a, b, c = (App.Vector(*pts[i]) for i in tris[0])
        down = (b - a).cross(c - a)
    solid.rotate(App.Vector(), App.Rotation(down, App.Vector(0, 0, -1)).Axis, math.degrees(App.Rotation(down, App.Vector(0, 0, -1)).Angle))
    solid.translate(App.Vector(0, 0, -solid.BoundBox.ZMin))
    return solid


def geodesic_mesh(frequency):
    """A geodesic sphere of unit radius: an icosahedron, a vertex up, each face cut into
    frequency^2 triangles (class I), every vertex pushed out to the sphere.
    Returns (points, triangles wound outward)."""
    nu = max(1, int(frequency))
    ico = platonic_vertices("Icosahedron", 2.0)
    top = App.Vector(*ico[0])
    rot = App.Rotation(top, App.Vector(0, 0, 1))
    ico = [tuple(rot.multVec(App.Vector(*p))) for p in ico]
    index, points, tris = {}, [], []

    def vertex(p):
        ln = math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2)
        q = (p[0] / ln, p[1] / ln, p[2] / ln)
        key = (round(q[0], 7), round(q[1], 7), round(q[2], 7))
        if key not in index:
            index[key] = len(points)
            points.append(q)
        return index[key]

    for a, b, c in hull_triangles(ico):
        pa, pb, pc = ico[a], ico[b], ico[c]
        grid = {}
        for i in range(nu + 1):
            for j in range(nu + 1 - i):
                k = nu - i - j
                grid[(i, j)] = vertex(tuple((pa[t] * k + pb[t] * i + pc[t] * j) / nu for t in range(3)))
        for i in range(nu):
            for j in range(nu - i):
                tris.append((grid[(i, j)], grid[(i + 1, j)], grid[(i, j + 1)]))
                if i + j < nu - 1:
                    tris.append((grid[(i + 1, j)], grid[(i + 1, j + 1)], grid[(i, j + 1)]))
    return points, tris


def geodesic_dome(radius, frequency=3, thickness=0.15, portion=0.5):
    """A geodesic dome shell: the geodesic sphere of that radius less the one `thickness`
    inside it, the lower part cut away so that `portion` of the sphere's height stands on
    Z = 0 (0.5: a hemisphere; 0.625: a five-eighths dome)."""
    pts, tris = geodesic_mesh(frequency)
    outer = solid_from_triangles([(x * radius, y * radius, z * radius) for x, y, z in pts], tris)
    ri = radius - thickness
    inner = solid_from_triangles([(x * ri, y * ri, z * ri) for x, y, z in pts], tris)
    cut = radius * (1 - 2 * max(0.1, min(1.0, portion)))
    keep = Part.makeBox(4 * radius * MM, 4 * radius * MM, 4 * radius * MM, V(-2 * radius, -2 * radius, cut))
    shell = outer.cut(inner).common(keep) if portion < 0.999 else outer.cut(inner)
    shell.translate(V(0, 0, -cut))
    return og.solid_of(shell)


# ---------------------------------------------------------------- the sun
def sun_position(lat, lng, when):
    """The sun at a place and an instant (a UTC datetime): (altitude, azimuth clockwise from
    true north, declination), in degrees. plugin-eco's port of NOAA's equations."""
    rad, deg = math.radians, math.degrees
    unix_ms = (when - datetime.datetime(1970, 1, 1)).total_seconds() * 1000.0
    t = (unix_ms / 86400000.0 + 2440587.5 - 2451545.0) / 36525.0
    l0 = (280.46646 + t * (36000.76983 + 0.0003032 * t)) % 360.0
    m = 357.52911 + t * (35999.05029 - 0.0001537 * t)
    e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
    c = (math.sin(rad(m)) * (1.914602 - t * (0.004817 + 0.000014 * t)) + math.sin(rad(2 * m)) * (0.019993 - 0.000101 * t)
         + math.sin(rad(3 * m)) * 0.000289)
    omega = 125.04 - 1934.136 * t
    lam = l0 + c - 0.00569 - 0.00478 * math.sin(rad(omega))
    eps = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - 0.001813 * t))) / 60.0) / 60.0 + 0.00256 * math.cos(rad(omega))
    decl = deg(math.asin(math.sin(rad(eps)) * math.sin(rad(lam))))
    y = math.tan(rad(eps / 2)) ** 2
    eot = 4 * deg(y * math.sin(2 * rad(l0)) - 2 * e * math.sin(rad(m)) + 4 * e * y * math.sin(rad(m)) * math.cos(2 * rad(l0))
                  - 0.5 * y * y * math.sin(4 * rad(l0)) - 1.25 * e * e * math.sin(2 * rad(m)))
    minutes = when.hour * 60 + when.minute + when.second / 60.0
    tst = (minutes + eot + 4 * lng + 1440.0) % 1440.0
    ha = tst / 4.0 - 180.0
    cos_z = math.sin(rad(lat)) * math.sin(rad(decl)) + math.cos(rad(lat)) * math.cos(rad(decl)) * math.cos(rad(ha))
    zen = deg(math.acos(max(-1.0, min(1.0, cos_z))))
    den = math.cos(rad(lat)) * math.sin(rad(zen))
    if abs(den) < 1e-9:
        az = 180.0 if lat > 0 else 0.0
    else:
        a0 = deg(math.acos(max(-1.0, min(1.0, (math.sin(rad(lat)) * math.cos(rad(zen)) - math.sin(rad(decl))) / den))))
        az = (a0 + 180.0) % 360.0 if ha > 0 else (540.0 - a0) % 360.0
    h = 90.0 - zen
    if h > 5.0:
        refr = 0.0
    elif h > -0.575:
        refr = (1735.0 + h * (-518.2 + h * (103.4 + h * (-12.79 + 0.711 * h)))) / 3600.0
    else:
        refr = -20.772 / math.tan(rad(h)) / 3600.0
    return h + refr, az, decl


def rise_azimuth(lat, declination, horizon_alt=-0.833):
    """The azimuth, east of true north, where the sun's centre crosses that altitude rising
    (-0.833 degrees: the upper limb on a flat horizon, with refraction). Setting: 360 less it."""
    rad = math.radians
    x = (math.sin(rad(declination)) - math.sin(rad(lat)) * math.sin(rad(horizon_alt))) / (math.cos(rad(lat)) * math.cos(rad(horizon_alt)))
    return math.degrees(math.acos(max(-1.0, min(1.0, x))))


# The year's eight stations, under the land pack's own keys (sky-events.json): the solstices
# and equinoxes, and the cross-quarter days between them on their calendar dates.
EVENTS = [("march_equinox", "March equinox"), ("june_solstice", "June solstice"), ("september_equinox", "September equinox"),
          ("december_solstice", "December solstice"), ("imbolc", "Imbolc"), ("beltane", "Beltane"), ("lunasa", "Lunasa"),
          ("samhain", "Samhain")]
CROSS_QUARTER = {"imbolc": (2, 1), "beltane": (5, 1), "lunasa": (8, 1), "samhain": (11, 1)}


def azimuths_on(lat, lng, day):
    """Where the sun rises and sets on a flat horizon on a calendar day of the place (a date):
    (sunrise, sunset) azimuths, from this module's own sun. The place's day runs by its mean
    solar time (longitude / 15 hours from UTC); the declination is taken at each event's hour."""
    noon = datetime.datetime(day.year, day.month, day.day, 12) - datetime.timedelta(hours=lng / 15.0)
    rad = math.radians
    out = []
    for sign in (-1.0, 1.0):
        when = noon + datetime.timedelta(hours=6.0 * sign)
        for _again in range(2):
            decl = sun_position(lat, lng, when)[2]
            x = (math.sin(rad(-0.833)) - math.sin(rad(lat)) * math.sin(rad(decl))) / (math.cos(rad(lat)) * math.cos(rad(decl)))
            when = noon + datetime.timedelta(hours=sign * math.degrees(math.acos(max(-1.0, min(1.0, x)))) / 15.0)
        az = rise_azimuth(lat, sun_position(lat, lng, when)[2])
        out.append(az if sign < 0 else 360.0 - az)
    return tuple(out)


def event_days(lat, lng, year):
    """The calendar day of the place for each of the year's eight stations, from this module's
    own sun: the solstices where the declination turns, the equinoxes on the day (by the
    place's mean solar time) in which it crosses zero, the cross-quarters on their dates."""
    start = datetime.datetime(year, 1, 1, 12) - datetime.timedelta(hours=lng / 15.0)  # mean noons of the place
    decl = [sun_position(lat, lng, start + datetime.timedelta(days=d))[2] for d in range(366)]
    day = lambda i: (datetime.date(year, 1, 1) + datetime.timedelta(days=i))

    def crossing(lo, hi):
        """The day on which the declination crosses zero between two noons."""
        i = next(k for k in range(lo, hi) if (decl[k] > 0) != (decl[k + 1] > 0))
        a, b = start + datetime.timedelta(days=i), start + datetime.timedelta(days=i + 1)
        for _step in range(40):
            mid = a + (b - a) / 2
            if (sun_position(lat, lng, mid)[2] > 0) == (decl[i] > 0):
                a = mid
            else:
                b = mid
        local = a + datetime.timedelta(hours=lng / 15.0)
        return local.date()

    out = {"june_solstice": day(max(range(366), key=lambda i: decl[i])), "december_solstice": day(min(range(366), key=lambda i: decl[i])),
           "march_equinox": crossing(60, 110), "september_equinox": crossing(240, 290)}
    for key, (month, dom) in CROSS_QUARTER.items():
        out[key] = datetime.date(year, month, dom)
    return out


def computed_azimuths(lat, lng, year, days=None):
    """Flat-horizon rising and setting azimuths at the year's eight stations, from this
    module's own sun: {event: (sunrise, sunset)}. `days` gives each event's calendar day
    ({event: date}); without it they are found here (event_days)."""
    days = days or event_days(lat, lng, year)
    return {key: azimuths_on(lat, lng, days[key]) for key, _label in EVENTS}


def pack_sky(url=PACK):
    """The land pack's sky-events.json."""
    req = urllib.request.Request(url + "sky-events.json", headers={"User-Agent": "Organic-workbench"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def pack_azimuths(lng, lat, horizon="Flat", sky=None):
    """The land pack's own rising and setting azimuths for its observer nearest a point.
    Returns ({event: (sunrise, sunset)}, metres to that observer, the year, {event: date}).
    horizon: "Flat" for a level horizon, "Terrain" for the ridge line the pack measured from
    that observer."""
    sky = sky or pack_sky()
    kx, ky = 91916.198, 110930.184
    nearest = min(sky["observers"], key=lambda o: math.hypot((o["lng"] - lng) * kx, (o["lat"] - lat) * ky))
    block = "true" if horizon.startswith("Terrain") else "flat"
    events = nearest["events"]
    out = {key: (events[key]["sunrise"][block]["azimuth_deg"], events[key]["sunset"][block]["azimuth_deg"]) for key, _label in EVENTS}
    days = {key: datetime.date(*(int(v) for v in events[key]["calendar_day"].split("-"))) for key, _label in EVENTS}
    return out, math.hypot((nearest["lng"] - lng) * kx, (nearest["lat"] - lat) * ky), sky.get("year"), days


def site_azimuths(lng, lat, horizon="Terrain", year=None):
    """Azimuths for the sun rose: the pack's when it answers, else computed here.
    Returns ({event: (sunrise, sunset)}, a line saying where they came from)."""
    try:
        az, dist, yr, _days = pack_azimuths(lng, lat, horizon)
        return az, "the land pack's sky-events.json for %s, %s, its observer %.0f m away" % (
            yr, "over the ridge line seen from there" if horizon.startswith("Terrain") else "on a level horizon", dist)
    except Exception as exc:
        yr = year or datetime.datetime.now(datetime.timezone.utc).year
        return computed_azimuths(lat, lng, yr), "computed here for %d on a level horizon (the land pack did not answer: %s)" % (yr, exc)


CARDINAL = {"True north": 0.0, "East": 90.0, "South": 180.0, "West": 270.0}
DIRECTIONS = list(CARDINAL) + ["%s %s" % (label, part) for _key, label in EVENTS for part in ("sunrise", "sunset")]


def bearing_of(direction, azimuths):
    """The bearing, clockwise from true north, of a named direction (DIRECTIONS)."""
    if direction in CARDINAL:
        return CARDINAL[direction]
    key = next(k for k, label in EVENTS if direction.startswith(label))
    return azimuths[key][0 if direction.endswith("sunrise") else 1]


def sun_rose(azimuths, length=12.0):
    """A rose of lines from the origin: the four cardinal directions (north the longest, with
    an arrow head), the rising and setting of the solstices and equinoxes (long rays) and of
    the cross-quarter days (short rays)."""
    def ray(bearing, ln):
        a = math.radians(bearing)
        return (ln * math.sin(a), ln * math.cos(a))

    shapes = [line((0, 0), ray(b, length * (1.0 if b == 0 else 0.6))) for b in (0.0, 90.0, 180.0, 270.0)]
    tip = ray(0.0, length)
    shapes.append(polyline([tip, (tip[0] - 0.04 * length, tip[1] - 0.12 * length), (tip[0] + 0.04 * length, tip[1] - 0.12 * length)]))
    for key, _label in EVENTS:
        reach = 0.6 if key in CROSS_QUARTER else 0.85
        for b in azimuths[key]:
            shapes.append(line(ray(b, 0.25 * length), ray(b, reach * length)))
    shapes.append(circle(0.25 * length))
    return Part.makeCompound(shapes)


def turn_for(direction_bearing, axis="+Y"):
    """The turn (degrees anticlockwise seen from above) that points a building's own axis at
    a bearing: +Y its back, -Y its front, +X and -X its ends."""
    own = {"+Y": 0.0, "+X": 90.0, "-Y": 180.0, "-X": 270.0}[axis]  # the axis's bearing when the building is not turned
    yaw = (own - direction_bearing) % 360.0
    return yaw - 360.0 if yaw > 180.0 else yaw


# ---------------------------------------------------------------- proportions of what is built
# Each object's dimensions that make a proportion: (label, governing property, its factor,
# dependent property, its factor). A snap keeps the governing one, on whole modules, and
# sets the dependent one.
PAIRS = {
    "Vault": [("span : rise", "Span", 1.0, "Rise", 1.0), ("span : length", "Span", 1.0, "VaultLength", 1.0)],
    "Dome": [("diameter : rise", "Radius", 2.0, "Rise", 1.0)],
    "GeodesicDome": [],
    "LeafShell": [("spine : span", "Spine", 1.0, "LeafSpan", 1.0)],
    "MinimalShell": [("x : y", "SizeX", 1.0, "SizeY", 1.0)],
    "BranchingColumn": [("height : crown", "Height", 1.0, "Spread", 2.0)],
    "Gridshell": [],
    "SacredFigure": [],
}


def kind_of(obj):
    return type(getattr(obj, "Proxy", None)).__name__


def metres(q):
    return float(q.Value) / MM if hasattr(q, "Value") else float(q)


def pairs_of(obj):
    """[(label, a metres, b metres)] for an object's proportion pairs, then for its box:
    plan length to width, and width to height."""
    out = [(label, metres(getattr(obj, pa)) * fa, metres(getattr(obj, pb)) * fb) for label, pa, fa, pb, fb in PAIRS.get(kind_of(obj), [])
           if hasattr(obj, pa) and hasattr(obj, pb)]
    shape = getattr(obj, "Shape", None)
    if shape is not None and not shape.isNull() and shape.Solids:
        local = shape.copy()
        local.Placement = App.Placement()  # the object's own axes, however it stands
        bb = local.optimalBoundingBox()
        long_side, short_side = sorted((bb.XLength / MM, bb.YLength / MM), reverse=True)
        out += [("its box, length : width", long_side, short_side), ("its box, width : height", short_side, bb.ZLength / MM)]
    return out


def best_ratio(a, b):
    """The nearest named ratio in any system: (system, name, value, deviation)."""
    found = [(system,) + nearest_ratio(a, b, system) for system in SYSTEM_NAMES]
    return min(found, key=lambda f: abs(f[3]))


def proportion_rows(objects, system, module_m):
    """The report: a header row and one row per proportion of each object."""
    rows = [("Object", "Proportion", "Long (m)", "Short (m)", "Long (modules)", "Short (modules)", "Measured 1 : x",
             "Nearest in %s" % system, "Off by (%)", "Nearest of all", "In", "Off by (%)")]
    for obj in objects:
        for label, a, b in pairs_of(obj):
            lo, hi = sorted((abs(a), abs(b)))
            if lo <= 0:
                continue
            name, _value, dev = nearest_ratio(a, b, system)
            best_system, best_name, _bv, best_dev = best_ratio(a, b)
            rows.append((obj.Label, label, round(hi, 3), round(lo, 3), round(hi / module_m, 2), round(lo / module_m, 2),
                         round(hi / lo, 4), name, round(100 * dev, 2), best_name, best_system, round(100 * best_dev, 2)))
    return rows


def snap_object(obj, system, module_m):
    """Set an object's proportions: each governing dimension onto whole modules, each
    dependent one to the system's ratio nearest what it had (the longer staying the longer).
    Returns [(label, the ratio's name, governing before, after, dependent before, after)]."""
    changes, done = [], set()
    for label, pa, fa, pb, fb in PAIRS.get(kind_of(obj), []):
        if not (hasattr(obj, pa) and hasattr(obj, pb)):
            continue
        a0, b0 = metres(getattr(obj, pa)) * fa, metres(getattr(obj, pb)) * fb
        _n, a1 = snap_to_module(a0, module_m)
        name, value, _dev = nearest_ratio(a0, b0, system)
        b1 = a1 * value if b0 <= a0 else a1 / value
        if pa not in done:
            setattr(obj, pa, a1 / fa * MM)
            done.add(pa)
        setattr(obj, pb, b1 / fb * MM)
        changes.append((label, name, a0, a1, b0, b1))
    return changes
