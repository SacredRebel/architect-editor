# -*- coding: utf-8 -*-
"""check_organic — the Organic workbench's solids, and the building it sent to the map.

Runs inside FreeCAD 1.1 (the GUI through the FreeCAD MCP connector, or freecadcmd):

    exec(open(r".../freecad/check_organic.py", encoding="utf-8").read())
    # ORGANIC_CHECK_SELF_TEST=1 (or "--self-test" in sys.argv) forges faults;
    # ORGANIC_DESIGN=<.FCStd> and ORGANIC_EXPORT=<.glb> pick the design and its export

Every expectation is derived here, not taken from the workbench's own constants:

  A. kernels against closed forms: a wall on an arc (t H R θ) and on a circle (2π R t H), a
     straight wall less a rectangular opening, a semicircular vault (π/2 (Ro² - Ri²) L), a
     hemispherical dome (2/3 π (R³ - (R-t)³)); and every kernel, the leaf shell and the
     organic roof included, a valid solid whose triangles enclose OCCT's volume within 0.5 %.
  B. the GLB, read back: one node per element of the design's building, named and classed
     as in FreeCAD; each mesh's enclosed volume (the divergence theorem over its own
     triangles) within 1 % of the element's solid.
  C. the frame: the exchange origin read from exchange/godot/FORMAT.md, the design's origin
     from its BIM Site, their offset from WGS84's radii of curvature at the site; every
     element's GLB bounds (x east, y up, z south, metres) within 3 cm of its FreeCAD bounds
     moved by that offset.
  D. on the site, in the map's own files: every element inside the surveyed boundary (the
     pack's survey ring, in that frame); and every element that reaches the ground (its
     lowest point within 1 m of the building's lowest) meeting the terrain of the map's site
     GLB there: its lowest points between 1.5 m below that ground and 0.3 m above it.
  E. the IFC, read back by IfcOpenShell: the same elements in their IFC classes, the site's
     latitude, longitude and elevation equal to FORMAT.md's to 1e-6° and 1 mm, and every
     element's world bounds within 3 cm of its GLB bounds.

--self-test forges faults into what was read (the GLB Z-up, the GLB in millimetres, the
building at the pack's chimney instead of the exchange anchor, north mirrored, an element
missing, a hole in a mesh, the building 2 m in the air, the IFC's latitude in whole
seconds, the IFC classes lost, a wall half as thick) and must see every one rejected.
"""

import copy
import json
import math
import os
import re
import struct
import sys
import urllib.request

import FreeCAD as App
import Part

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Playground\Architect-editor\freecad"
sys.path.insert(0, os.path.join(HERE, "Organic"))
import organic_geom as og  # noqa: E402  (the kernels under test)

EXCHANGE = os.environ.get("ORGANIC_EXCHANGE_DIR", r"C:\Playground\exchange\godot")
DESIGN = os.environ.get("ORGANIC_DESIGN") or os.path.join(os.path.expanduser("~"), "Documents", "SulphurMountain", "Organic-test-pavilion.FCStd")
EXPORT = os.environ.get("ORGANIC_EXPORT") or os.path.join(EXCHANGE, "organic-test-pavilion.glb")
SITE_GLB = os.path.join(EXCHANGE, "sulphur-mountain-site.glb")
PACK = os.environ.get("SITE_PACK_URL", "https://sulphur-mountain-world.vercel.app/")
MM = 1000.0


# ------------------------------------------------------------------ independent pieces
def wgs84_metres_per_degree(lat):
    """East and north metres per degree at a latitude, from WGS84's radii of curvature."""
    a, e2 = 6378137.0, 6.69437999014e-3
    s = math.sin(math.radians(lat))
    n = a / math.sqrt(1 - e2 * s * s)
    m = a * (1 - e2) / (1 - e2 * s * s) ** 1.5
    return math.radians(1) * n * math.cos(math.radians(lat)), math.radians(1) * m


def exchange_anchor():
    """The exchange frame's origin as FORMAT.md states it in prose."""
    with open(os.path.join(EXCHANGE, "FORMAT.md"), encoding="utf-8") as fh:
        text = fh.read()
    mo = re.search(r"lng\s*(-?\d+\.\d+),\s*lat\s*(-?\d+\.\d+),\s*elevation\s*(\d+(?:\.\d+)?)\s*m", text)
    if not mo:
        raise RuntimeError("FORMAT.md no longer states the anchor as 'lng .., lat .., elevation .. m'")
    return float(mo.group(1)), float(mo.group(2)), float(mo.group(3))


def glb(path):
    with open(path, "rb") as fh:
        data = fh.read()
    if data[:4] != b"glTF":
        raise RuntimeError("%s is not a GLB" % path)
    jlen = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20 + jlen])
    blen = struct.unpack_from("<I", data, 20 + jlen)[0]
    return gltf, data[28 + jlen:28 + jlen + blen]


def accessor(gltf, blob, index):
    import numpy as np

    acc = gltf["accessors"][index]
    view = gltf["bufferViews"][acc["bufferView"]]
    comps = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[acc["type"]]
    dtype = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[acc["componentType"]]
    item = np.dtype(dtype).itemsize * comps
    stride = view.get("byteStride", item)
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    raw = np.frombuffer(blob, dtype=np.uint8, count=stride * (acc["count"] - 1) + item, offset=start)
    rows = np.lib.stride_tricks.as_strided(raw, shape=(acc["count"], item), strides=(stride, 1))
    return np.ascontiguousarray(rows).view(dtype).reshape(acc["count"], comps).astype(float)


def node_meshes(gltf, blob):
    """{node name: (positions, triangles, extras)} for every node with a mesh (no transforms here)."""
    import numpy as np

    out = {}
    for n in gltf["nodes"]:
        if "mesh" not in n:
            continue
        pos_all, tri_all = [], []
        base = 0
        for prim in gltf["meshes"][n["mesh"]]["primitives"]:
            p = accessor(gltf, blob, prim["attributes"]["POSITION"])
            i = accessor(gltf, blob, prim["indices"]).astype(int).reshape(-1, 3) if "indices" in prim else np.arange(len(p)).reshape(-1, 3)
            pos_all.append(p)
            tri_all.append(i + base)
            base += len(p)
        out[n.get("name", "")] = (np.vstack(pos_all), np.vstack(tri_all), n.get("extras", {}))
    return out


def enclosed_volume(pos, tri):
    a, b, c = pos[tri[:, 0]], pos[tri[:, 1]], pos[tri[:, 2]]
    return float((a * (b[:, [1, 2, 0]] * c[:, [2, 0, 1]] - b[:, [2, 0, 1]] * c[:, [1, 2, 0]])).sum() / 6.0)


def terrain_height(tpos, ttri, x, z):
    """The map's ground (glTF y) under a point (x, z), by barycentric lookup in its triangles."""
    import numpy as np

    a, b, c = tpos[ttri[:, 0]], tpos[ttri[:, 1]], tpos[ttri[:, 2]]
    x0, x1 = np.minimum(np.minimum(a[:, 0], b[:, 0]), c[:, 0]), np.maximum(np.maximum(a[:, 0], b[:, 0]), c[:, 0])
    z0, z1 = np.minimum(np.minimum(a[:, 2], b[:, 2]), c[:, 2]), np.maximum(np.maximum(a[:, 2], b[:, 2]), c[:, 2])
    for k in np.nonzero((x0 <= x) & (x <= x1) & (z0 <= z) & (z <= z1))[0]:
        (ax, ay, az), (bx, by, bz), (cx, cy, cz) = a[k], b[k], c[k]
        det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
        if abs(det) < 1e-12:
            continue
        l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det
        l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det
        l3 = 1 - l1 - l2
        if min(l1, l2, l3) >= -1e-9:
            return l1 * ay + l2 * by + l3 * cy
    return None


def inside(p, poly):
    x, y, c = p[0], p[1], False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            c = not c
    return c


def ifc_facts(path):
    import numpy as np
    import ifcopenshell
    import ifcopenshell.geom
    import ifcopenshell.util.placement

    import ifcopenshell.util.unit

    f = ifcopenshell.open(path)
    scale = ifcopenshell.util.unit.calculate_unit_scale(f)  # the file's length unit, in metres
    site = f.by_type("IfcSite")[0]
    elements, unread = {}, []
    seen = set()
    for e in f.by_type("IfcElement"):
        if e.GlobalId in seen or e.is_a("IfcOpeningElement"):
            continue
        seen.add(e.GlobalId)
        # the Brep's own points, read as data (no geometry engine), then the element's placement
        local = []
        for rep in (e.Representation.Representations if e.Representation else []):
            for item in rep.Items:
                shell = getattr(item, "Outer", None)
                for face in (shell.CfsFaces if shell is not None else []):
                    for bound in face.Bounds:
                        local.extend(p.Coordinates for p in getattr(bound.Bound, "Polygon", []) or [])
        if not local:
            try:
                local = np.array(ifcopenshell.geom.create_shape(ifcopenshell.geom.settings(), e).geometry.verts, dtype=float).reshape(-1, 3) / scale
            except Exception as exc:
                unread.append("%s %s: %s" % (e.is_a(), e.Name, exc))
                continue
        local = np.array(local, dtype=float).reshape(-1, 3)
        m = ifcopenshell.util.placement.get_local_placement(e.ObjectPlacement)
        world = (local @ m[:3, :3].T + m[:3, 3]) * scale
        elements[e.Name] = {"class": e.is_a(), "min": tuple(float(v) for v in world.min(axis=0)), "max": tuple(float(v) for v in world.max(axis=0))}
    to_deg = lambda c: math.copysign(sum(abs(v) / d for v, d in zip(c, (1, 60, 3600, 3600e6))), c[0] if c[0] else (c[1] or c[2]))
    return {"lat": to_deg(site.RefLatitude), "lng": to_deg(site.RefLongitude), "elev": float(site.RefElevation or 0.0) * scale,
            "elements": elements, "unread": unread}


def fetch(path):
    req = urllib.request.Request(PACK + path, headers={"User-Agent": "check_organic"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except OSError:
            if attempt == 2:
                raise


# ------------------------------------------------------------------ read everything
def read_facts():
    import numpy as np

    facts = {}
    # A. kernels, built here
    def mesh_vol(shape):
        v = 0.0
        for fc in shape.Faces:
            pts, tris = fc.tessellate(2.0)
            for i, j, k in tris:
                v += pts[i].dot(pts[j].cross(pts[k]))
        return v / 6e9

    line = Part.LineSegment(og.V(0, 0), og.V(10, 0)).toShape()
    lob = og.lobed_curve(6.8, 5, 0.35)
    kernels = {
        "arc wall": (og.wall_shape(og.arc_curve(5.0, 90.0), False, 0.3, 3.0), 0.3 * 3.0 * 5.0 * math.pi / 2),
        "circle wall": (og.wall_shape(og.arc_curve(4.0, 360.0), True, 0.3, 3.0), 2 * math.pi * 4.0 * 0.3 * 3.0),
        "wall less a window": (og.wall_shape(line, False, 0.3, 3.0, openings=[dict(position_m=5.0, width_m=1.2, height_m=1.5, sill_m=0.9, shape="Rect")]), 0.3 * 3.0 * 10.0 - 1.2 * 1.5 * 0.3),
        "semicircular vault": (og.vault_shape("Semicircle", 6.0, 3.0, 0.3, 8.0), math.pi / 2 * (3.3 ** 2 - 3.0 ** 2) * 8.0),
        "hemispherical dome": (og.dome_shape("Sphere", 5.0, 5.0, 0.3), 2 / 3 * math.pi * (5.0 ** 3 - 4.7 ** 3)),
        "lobed wall, wave top": (og.wall_shape(lob, True, 0.45, 3.2, top="Wave", top_rise_m=0.6, top_waves=5), None),
        "catenary vault, ribs": (og.vault_shape("Catenary", 6.0, 4.0, 0.25, 8.0, ribs=3), None),
        "leaf shell": (og.leaf_shell_shape(16.0, 10.0, (0.4, 5.4, 6.0, 0.4), 0.4, 1.0, 0.2, 0.15, 2.0, outline="Pointed"), None),
        "organic roof": (og.organic_roof_shape(lob, 3.2, 2.4, 0.8, 0.2), None),
    }
    facts["kernels"] = {k: {"valid": s.isValid(), "volume": s.Volume / 1e9, "mesh": mesh_vol(s), "closed_form": cf} for k, (s, cf) in kernels.items()}
    # the design
    target = os.path.normcase(os.path.abspath(DESIGN))
    doc = next((d for d in App.listDocuments().values() if d.FileName and os.path.normcase(os.path.abspath(d.FileName)) == target), None)
    opened = doc is None
    doc = doc or App.openDocument(DESIGN, True)
    try:
        building = next(o for o in doc.Objects if getattr(o, "IfcType", "") == "Building")
        elements = [o for o in building.Group if hasattr(o, "Shape") and o.Shape.Solids]
        site = next(o for o in doc.Objects if getattr(o, "IfcType", "") == "Site")
        facts["design"] = {}
        for o in elements:
            bb = o.Shape.optimalBoundingBox()  # BoundBox takes B-spline faces untrimmed
            facts["design"][o.Label] = {"class": str(o.IfcType), "volume": o.Shape.Volume / 1e9,
                                        "min": (bb.XMin / MM, bb.YMin / MM, bb.ZMin / MM), "max": (bb.XMax / MM, bb.YMax / MM, bb.ZMax / MM)}
        facts["design_origin"] = (float(site.Longitude), float(site.Latitude), site.Elevation.Value / MM)
    finally:
        if opened:
            App.closeDocument(doc.Name)
    # B-D. the GLB and the map's site
    gltf, blob = glb(EXPORT)
    facts["glb"] = {name: {"pos": p, "tri": t, "extras": ex} for name, (p, t, ex) in node_meshes(gltf, blob).items()}
    sg, sb = glb(SITE_GLB)
    terrain = next(v for k, v in node_meshes(sg, sb).items() if k.startswith("terrain"))
    facts["terrain"] = (terrain[0], terrain[1])
    facts["anchor"] = exchange_anchor()
    survey = fetch("survey.geojson")
    ring = next(f for f in survey["features"] if f["properties"].get("layer") == "boundary")["geometry"]["coordinates"][0]
    facts["ring_lnglat"] = [tuple(p) for p in ring[:-1]]
    # E. the IFC
    facts["ifc"] = ifc_facts(os.path.splitext(EXPORT)[0] + ".ifc")
    return facts


# ------------------------------------------------------------------ judge
def judge(facts):
    import numpy as np

    oks, fails = [], []

    def ok(cond, msg):
        (oks if cond else fails).append(msg)

    # A
    for name, k in facts["kernels"].items():
        good = k["valid"] and abs(k["mesh"] - k["volume"]) <= 0.005 * k["volume"]
        msg = "A %s: valid %s, OCCT %.4f m³, its triangles %.4f m³" % (name, k["valid"], k["volume"], k["mesh"])
        if k["closed_form"] is not None:
            good = good and abs(k["volume"] - k["closed_form"]) <= 0.001 * k["closed_form"]
            msg += ", closed form %.4f m³" % k["closed_form"]
        ok(good, msg)

    design, meshes = facts["design"], facts["glb"]
    # B
    ok(sorted(design) == sorted(meshes), "B the GLB's nodes are the building's elements (%s)" % ", ".join(sorted(meshes)))
    for name, d in design.items():
        m = meshes.get(name)
        if m is None:
            continue
        vol = enclosed_volume(m["pos"], m["tri"])
        ok(m["extras"].get("ifcType") == d["class"] and abs(vol - d["volume"]) <= 0.01 * d["volume"],
           "B %s: class %s, mesh encloses %.3f m³ against the solid's %.3f m³" % (name, m["extras"].get("ifcType"), vol, d["volume"]))

    # C
    alng, alat, aelev = facts["anchor"]
    dlng, dlat, delev = facts["design_origin"]
    kx, ky = wgs84_metres_per_degree((alat + dlat) / 2)
    east, north, up = (dlng - alng) * kx, (dlat - alat) * ky, delev - aelev
    worst = 0.0
    for name, d in design.items():
        m = meshes.get(name)
        if m is None:
            worst = float("inf")
            continue
        lo, hi = m["pos"].min(axis=0), m["pos"].max(axis=0)
        # glTF (x, y, z) = (east, up, south): the FreeCAD bounds moved and turned
        exp_lo = (d["min"][0] + east, d["min"][2] + up, -(d["max"][1] + north))
        exp_hi = (d["max"][0] + east, d["max"][2] + up, -(d["min"][1] + north))
        worst = max(worst, max(abs(a - b) for a, b in zip(list(lo) + list(hi), exp_lo + exp_hi)))
    ok(worst <= 0.03, "C every element's GLB bounds within 3 cm of its FreeCAD bounds moved by (%.3f E, %.3f N, %.3f up) m to FORMAT.md's origin (worst %.4f m)" % (east, north, up, worst))

    # D
    ring = [((lng - alng) * kx, (lat - alat) * ky) for lng, lat in facts["ring_lnglat"]]
    outside = 0
    for m in meshes.values():
        for x, _y, z in m["pos"][:: max(1, len(m["pos"]) // 200)]:
            outside += not inside((x, -z), ring)
    ok(outside == 0, "D every element inside the surveyed boundary (%d sampled vertices outside)" % outside)
    tpos, ttri = facts["terrain"]
    rows = []
    floor = min(float(m["pos"][:, 1].min()) for m in meshes.values()) if meshes else 0.0
    for name, m in meshes.items():
        p = m["pos"]
        if p[:, 1].min() > floor + 1.0:
            continue  # it rests on other elements, not on the ground
        low = p[p[:, 1] <= p[:, 1].min() + 0.05]
        gaps = []
        for x, y, z in low[:: max(1, len(low) // 12)]:
            g = terrain_height(tpos, ttri, x, z)
            if g is not None:
                gaps.append(y - g)
        rows.append((name, min(gaps) if gaps else float("inf"), max(gaps) if gaps else float("inf")))
    good = bool(rows) and all(-1.5 <= lo_ and hi_ <= 0.3 for _n, lo_, hi_ in rows)
    ok(good, "D every element that reaches the ground meets the map's own terrain (lowest points from 1.5 m below to 0.3 m above it): %s"
       % "; ".join("%s %+.2f..%+.2f m" % r for r in rows))

    # E
    ifc = facts["ifc"]
    ok(abs(ifc["lat"] - alat) < 1e-6 and abs(ifc["lng"] - alng) < 1e-6 and abs(ifc["elev"] - aelev) < 1e-3,
       "E IFC site at %.7f, %.7f, %.3f m (FORMAT.md %.5f, %.4f, %.2f m)" % (ifc["lat"], ifc["lng"], ifc["elev"], alat, alng, aelev))
    classes = {n: e["class"] for n, e in ifc["elements"].items()}
    want = {n: "Ifc" + d["class"].replace(" ", "") for n, d in design.items()}
    ok(classes == want and not ifc.get("unread"), "E IFC elements and classes: %s%s" % (
        ", ".join("%s %s" % kv for kv in sorted(classes.items())) or "none read",
        "; unread: " + "; ".join(ifc["unread"]) if ifc.get("unread") else ""))
    worst = 0.0 if len(ifc["elements"]) == len(design) else float("inf")
    for name, e in ifc["elements"].items():
        m = meshes.get(name)
        if m is None:
            worst = float("inf")
            continue
        lo, hi = m["pos"].min(axis=0), m["pos"].max(axis=0)
        # IFC (x east, y north, z up) against glTF (x east, y up, z south)
        glo = (lo[0], -hi[2], lo[1])
        ghi = (hi[0], -lo[2], hi[1])
        worst = max(worst, max(abs(a - b) for a, b in zip(e["min"] + e["max"], glo + ghi)))
    ok(worst <= 0.03, "E every IFC element's world bounds within 3 cm of its GLB bounds (worst %.4f m)" % worst)
    return oks, fails


# ------------------------------------------------------------------ forgeries
def forgeries(facts):
    import numpy as np

    def f(change):
        g = copy.deepcopy({k: v for k, v in facts.items() if k != "terrain"})
        g["terrain"] = facts["terrain"]
        change(g)
        return g

    def each_mesh(g, fn):
        for m in g["glb"].values():
            m["pos"] = fn(m["pos"])

    first = sorted(facts["glb"])[0]

    def hole(g):
        m = g["glb"][first]
        m["tri"] = m["tri"][: int(len(m["tri"]) * 0.9)]

    def lose_classes(g):
        for e in g["ifc"]["elements"].values():
            e["class"] = "IfcBuildingElementProxy"

    def whole_seconds(g):
        lat = g["ifc"]["lat"]
        g["ifc"]["lat"] = math.copysign(int(abs(lat) * 3600) / 3600.0, lat)

    def thinner(g):
        g["kernels"]["arc wall"]["volume"] /= 2
        g["kernels"]["arc wall"]["mesh"] /= 2

    return [
        ("the GLB Z-up", f(lambda g: each_mesh(g, lambda p: p[:, [0, 2, 1]] * np.array([1, -1, 1])))),
        ("the GLB in millimetres", f(lambda g: each_mesh(g, lambda p: p * 1000.0))),
        ("the building at the pack's chimney, not the exchange anchor", f(lambda g: g.__setitem__("design_origin", (g["anchor"][0], g["anchor"][1], g["anchor"][2])))),
        ("north mirrored", f(lambda g: each_mesh(g, lambda p: p * np.array([1, 1, -1])))),
        ("an element missing", f(lambda g: g["glb"].pop(first))),
        ("a hole in a mesh", f(hole)),
        ("the building 2 m in the air", f(lambda g: each_mesh(g, lambda p: p + np.array([0, 2.0, 0])))),
        ("the IFC's latitude in whole seconds", f(whole_seconds)),
        ("the IFC classes lost", f(lose_classes)),
        ("a wall half as thick", f(thinner)),
    ]


def run(self_test=None):
    if self_test is None:
        self_test = os.environ.get("ORGANIC_CHECK_SELF_TEST") == "1" or "--self-test" in sys.argv
    facts = read_facts()
    oks, fails = judge(facts)
    for m in oks:
        print("OK  ", m)
    for m in fails:
        print("FAIL", m)
    if fails:
        print("check_organic FAILED (%d)" % len(fails))
        return False
    print("check_organic OK (%d checks)" % len(oks))
    if not self_test:
        return True
    caught = 0
    forged = forgeries(facts)
    for name, g in forged:
        _o, f = judge(g)
        print("SELF-TEST %s %s" % ("OK  " if f else "FAIL", "%s is rejected (%s)" % (name, f[0]) if f else "%s PASSED the check" % name))
        caught += bool(f)
    print("check_organic --self-test %s (%d/%d forgeries rejected)" % ("OK" if caught == len(forged) else "FAILED", caught, len(forged)))
    return caught == len(forged)


if __name__ == "__main__":
    result = run()
    if not App.GuiUp:
        sys.exit(0 if result else 1)
