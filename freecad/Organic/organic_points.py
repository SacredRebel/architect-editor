# -*- coding: utf-8 -*-
"""Organic: a curve through points as the map draws it, and distances along it.

Plain Python, no FreeCAD: what reads a built file (organic_import.py) and what writes one
from a house spec (..\\spec_to_records.py) both measure an opening's place with these, so
the two cannot drift apart.

The map's build mode draws a smooth curve through points as a uniform Catmull-Rom spline (at
each point the curve runs parallel to the line between its two neighbours; an open curve's
ends take the end point twice), as straight pieces no longer than STEP, and it measures an
opening's place along those pieces (exchange\\godot\\FORMAT.md, "built/1").
"""

import math

STEP = 0.2  # metres: the map draws a curve as points no further apart than this, and measures along them


def map_points(points, closed):
    """A Points curve as the map draws it: its smooth curve as points no more than STEP apart
    (the map's own sampling), in metres. The map measures an opening's place along these."""
    p = []
    for q in points:
        v = (float(q[0]), float(q[1]))
        if not p or ((p[-1][0] - v[0]) ** 2 + (p[-1][1] - v[1]) ** 2) ** 0.5 > 0.01:
            p.append(v)
    n = len(p)
    if n < 2:
        return list(p)
    if n == 2:
        closed = False
    out = []
    for i in range(n if closed else n - 1):
        p0 = p[(i - 1) % n] if closed else p[max(i - 1, 0)]
        p1, p2 = p[i], p[(i + 1) % n]
        p3 = p[(i + 2) % n] if closed else p[min(i + 2, n - 1)]
        k = max(2, int(math.ceil(((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2) ** 0.5 / STEP)))
        for j in range(k):
            t = float(j) / k
            out.append(tuple(0.5 * ((2.0 * p1[c]) + (p2[c] - p0[c]) * t + (2.0 * p0[c] - 5.0 * p1[c] + 4.0 * p2[c] - p3[c]) * t * t
                                    + (3.0 * p1[c] - p0[c] - 3.0 * p2[c] + p3[c]) * t * t * t) for c in (0, 1)))
    if not closed:
        out.append(p[-1])
    return out


def along_map_points(pts, closed, s):
    """The point s metres along the map's points of a curve (the short way round a closed one)."""
    ring = pts + ([pts[0]] if closed else [])
    total = sum(((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5 for a, b in zip(ring, ring[1:]))
    if total <= 0:
        return pts[0]
    s = s % total if closed else max(0.0, min(total, s))
    for a, b in zip(ring, ring[1:]):
        d = ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5
        if s <= d and d > 0:
            return (a[0] + (b[0] - a[0]) * s / d, a[1] + (b[1] - a[1]) * s / d)
        s -= d
    return ring[-1]


def foot_on_map_points(pts, closed, point):
    """Where a point falls on the map's points of a curve: (metres along them to the nearest
    place, how far the point is from that place, the length of the whole run). The other way
    round from along_map_points."""
    ring = pts + ([pts[0]] if closed else [])
    best, at, total = None, 0.0, 0.0
    for a, b in zip(ring, ring[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        d = (dx * dx + dy * dy) ** 0.5
        t = 0.0 if d <= 0 else max(0.0, min(1.0, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (d * d)))
        off = ((point[0] - a[0] - dx * t) ** 2 + (point[1] - a[1] - dy * t) ** 2) ** 0.5
        if best is None or off < best:
            best, at = off, total + d * t
        total += d
    return at, best, total
