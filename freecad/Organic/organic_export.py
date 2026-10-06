# -*- coding: utf-8 -*-
"""Organic: send a building to the map.

One call writes three files into the exchange folder (exchange\\godot\\ by default):
<name>.glb, <name>.ifc and <name>.json.

The building keeps its own origin. Its geometry is written in its own frame, in metres, and
where it stands is stated beside it, the same in three places:

  <name>.json   "placement": coordinates [lng, lat], altitude_m, rotation_deg, elevation_m, offset_m
  <name>.glb    the same block in the root node's extras; the root has no transform
  <name>.ifc    IfcSite at the anchor (RefLatitude / RefLongitude / RefElevation); the
                IfcBuilding's placement on that site is the offset and the turn; its elements
                are placed relative to it; the same numbers in the property set Organic_Placement

The words are those of exchange/godot/FORMAT.md's edits/2 records, which say the same thing
about any .glb on the map (where its own origin stands):

  coordinates   WGS84 longitude and latitude of the building's own origin
  altitude_m    height of the building's own z = 0 above the ground datum at the anchor
  rotation_deg  Euler degrees in glTF's axes; y is the turn seen from above, anticlockwise
                positive; x and z are 0 (a tilt stays in the geometry)
  elevation_m   the same height as NAVD88 metres (altitude_m + datum_m)
  offset_m      the same place as metres east, north and up from the anchor

Axes of the geometry: in the GLB glTF's, +X the building's x, +Y up, +Z the building's -y (east,
up, south when it is not turned); in the IFC the building's x, y, z.

The site's frame is the canonical one (C:\\Playground\\BRAIN.md §3): the anchor at lng
-119.15536, lat 34.4331, on the ground there, 425.63 m NAVD88; +X east, +Y true north. A
document's frame is the one its BIM Site states (the site template's and New organic
building's are the canonical one); a document on another origin is moved by the difference.
"""

import datetime
import json
import math
import os
import re
import struct

import FreeCAD as App

import organic_geom as og

MM = 1000.0
# The canonical frame (BRAIN.md §3): the anchor, and the ground there from the map's DEM.
ANCHOR = {"lng": -119.15536, "lat": 34.4331, "elevation_m": 425.63}
# the land pack's frame (pack.json): metres per degree, equirectangular at the site
METRES_PER_DEG = (91916.198, 110930.184)
# the map's exchange folder: beside this repository when it is there (the repository sits in the Playground folder,
# wherever that moves: 6 Oct the folder moved and C:\Playground pointed at an empty one for a while), else the fixed address
DEFAULT_EXCHANGE_DIR = next((p for p in (os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "exchange", "godot")),)
                             if os.path.isfile(os.path.join(p, "FORMAT.md"))), r"C:\Playground\exchange\godot")
# the land files the map reads beside a building (lane C's, exchange/godot/FORMAT.md)
SITE_FILE = "sulphur-mountain-site.glb"
EXISTING_FILE = "sulphur-mountain-buildings-existing.glb"
Z = App.Vector(0, 0, 1)


def settings():
    return App.ParamGet("User parameter:BaseApp/Preferences/Mod/Organic")


def exchange_dir():
    return os.environ.get("ORGANIC_EXCHANGE_DIR") or settings().GetString("ExchangeDir", "") or DEFAULT_EXCHANGE_DIR


def land_dir(out_dir=None):
    """Where the map's land files are read from: the exchange folder itself, unless
    ORGANIC_LAND_DIR names another (a trial export into a scratch folder)."""
    return os.environ.get("ORGANIC_LAND_DIR") or out_dir or exchange_dir()


def document_origin(doc):
    """The geographic point at a document's origin: its BIM Site's, else the anchor."""
    for o in doc.Objects:
        if hasattr(o, "Longitude") and hasattr(o, "Latitude") and (o.Longitude or o.Latitude):
            elev = getattr(o, "Elevation", None)
            elev_m = elev.Value / MM if elev is not None and hasattr(elev, "Value") and elev.Value else ANCHOR["elevation_m"]
            return {"lng": float(o.Longitude), "lat": float(o.Latitude), "elevation_m": elev_m,
                    "declination": float(getattr(o, "Declination", 0.0) or 0.0)}
    return dict(ANCHOR, declination=0.0)


def frame_offset(origin, anchor=ANCHOR):
    """Metres to add to document coordinates (east, north, up) to reach the canonical frame."""
    kx, ky = METRES_PER_DEG
    return ((origin["lng"] - anchor["lng"]) * kx, (origin["lat"] - anchor["lat"]) * ky,
            origin["elevation_m"] - anchor["elevation_m"])


def file_stem(label):
    s = re.sub(r"[^a-z0-9._-]+", "-", label.strip().lower()).strip("-.")
    return s or "organic-building"


def elements_of(target):
    """The visible solids under a building (a BIM building, a group, an App::Part) or a list."""
    seen, out = set(), []

    def walk(o):
        if o.Name in seen:
            return
        seen.add(o.Name)
        group = getattr(o, "Group", None)
        if group:
            for c in group:
                walk(c)
            return
        shape = getattr(o, "Shape", None)
        if shape is None or shape.isNull() or not shape.Solids:
            return
        if App.GuiUp and getattr(o, "ViewObject", None) is not None and not o.ViewObject.Visibility:
            return
        out.append(o)

    for t in target if isinstance(target, (list, tuple)) else [target]:
        walk(t)
    return out


def colour_of(obj):
    """The colour an element shows in FreeCAD; without a window, the one its IFC class gets."""
    try:
        mats = obj.ViewObject.ShapeAppearance
        return tuple(mats[0].DiffuseColor[:3])
    except Exception:
        pass
    try:
        import organic_objects

        return organic_objects.COLOURS.get(str(getattr(obj, "IfcType", "")), (0.8, 0.8, 0.8))
    except Exception:
        return (0.8, 0.8, 0.8)


# ---------------------------------------------------------------- the building's own frame
def global_shape(obj):
    """An object's shape in document coordinates. Inside an App::Part an object's own
    placement is local to the part; a BIM building's parts are in document coordinates."""
    shape = obj.Shape
    try:
        extra = obj.getGlobalPlacement().multiply(obj.Placement.inverse())
    except Exception:
        return shape
    if extra.Base.Length < 1e-9 and abs(extra.Rotation.Angle) < 1e-12:
        return shape
    moved = shape.copy()
    moved.Placement = extra.multiply(moved.Placement)
    return moved


def building_of(targets):
    """The BIM building among the targets, or the one that holds them; None for loose objects."""
    for t in targets:
        if getattr(t, "IfcType", "") == "Building":
            return t
    for t in targets:
        for parent in getattr(t, "InList", []):
            if getattr(parent, "IfcType", "") == "Building":
                return parent
    return None


def yaw_of(placement):
    """A placement's turn about the vertical, degrees counter-clockwise seen from above."""
    ax = placement.Rotation.multVec(App.Vector(1, 0, 0))
    return math.degrees(math.atan2(ax.y, ax.x)) if abs(ax.x) + abs(ax.y) > 1e-9 else 0.0


def building_frame(targets, points):
    """(the building's own frame as a placement in document coordinates, a note or None).

    A BIM building's own placement: its position, and its turn about the vertical (a tilt
    stays in the geometry). Loose objects, and a building whose origin lies away from what it
    holds (its parts were moved, not the building), take the middle of their footprint: the
    building then still lands where it stands, and turns about itself on the map."""
    xs, ys, zs = [p.x for p in points], [p.y for p in points], [p.z for p in points]
    mid = App.Vector((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs))
    b = building_of(targets)
    if b is None:
        return App.Placement(mid, App.Rotation()), "no building selected: the origin is the middle of the footprint, at its lowest point"
    pl = b.getGlobalPlacement() if hasattr(b, "getGlobalPlacement") else b.Placement
    turn = App.Rotation(Z, yaw_of(pl))
    reach = 0.25 * max(max(xs) - min(xs), max(ys) - min(ys)) + 5 * MM
    if not (min(xs) - reach <= pl.Base.x <= max(xs) + reach and min(ys) - reach <= pl.Base.y <= max(ys) + reach):
        far = math.hypot(pl.Base.x - mid.x, pl.Base.y - mid.y) / MM
        return (App.Placement(App.Vector(mid.x, mid.y, pl.Base.z), turn),
                "the building's own origin is %.0f m from what it holds (move the building, not its parts): "
                "the origin written is the middle of the footprint" % far)
    return App.Placement(pl.Base, turn), None


def placement_of(frame, origin, anchor=ANCHOR):
    """Where a building's frame stands on the site: the block written beside the geometry, in
    the words of exchange/godot/FORMAT.md's edits/2 records (the lng/lat, altitude and turn of
    a .glb's own origin), with its NAVD88 elevation and its metres from the anchor."""
    off = frame_offset(origin, anchor)
    east, north, up = frame.Base.x / MM + off[0], frame.Base.y / MM + off[1], frame.Base.z / MM + off[2]
    kx, ky = METRES_PER_DEG
    yaw = yaw_of(frame)
    yaw = yaw + 360.0 if yaw <= -180.0 else yaw
    return {
        "coordinates": [round(anchor["lng"] + east / kx, 9), round(anchor["lat"] + north / ky, 9)],
        "altitude_m": round(up, 4),
        "rotation_deg": {"x": 0.0, "y": round(yaw, 6) + 0.0, "z": 0.0},
        "elevation_m": round(anchor["elevation_m"] + up, 4),
        "offset_m": {"east": round(east, 4), "north": round(north, 4), "up": round(up, 4)},
        "anchor": [anchor["lng"], anchor["lat"]],
        "datum_m": anchor["elevation_m"],
        "metres_per_degree": list(METRES_PER_DEG),
    }


# ---------------------------------------------------------------- GLB
MESH_ANGLE = 0.5  # radians: the most two neighbouring triangles on a curved face may turn against each other


def own_shape(obj):
    """(an element's solid in its own frame: a copy, without the triangles FreeCAD's window
    drew it with; where that frame stands in the document)."""
    whole = global_shape(obj)
    own = whole.copy()
    own.Placement = App.Placement()
    return own, whole.Placement


def mesh_tolerance(shape):
    """How far an element's triangles may lie from its solid (mm): a thousandth of its size,
    from 4 to 12. The size is the solid's own, measured on its geometry: a box round the solid
    where it stands turned, or one taken from the window's triangles, gave another number for
    the same element, and so another mesh."""
    return max(4.0, min(12.0, 0.001 * shape.optimalBoundingBox(False, False).DiagonalLength))


def tessellate(obj, tolerance_mm=None):
    """A solid's triangles in document coordinates (mm): points, per-point normals, triangles.

    The solid is meshed whole and in its own frame, on a copy (so the triangles FreeCAD's
    window drew it with are not taken: in the window they were, and a building weighed twice
    what it did from the console), no further from the solid than the tolerance and turning no
    more than MESH_ANGLE from one triangle to the next; the triangles are then set where the
    solid stands. An element so has the same triangles wherever its building stands, however
    it is turned, sent from the window or from the console. Face by face, OCCT meshed a spline
    wall in squares a span wide: 92,000 triangles for a 32 m wall, where 25,000 show the same.

    Vertex normals average the triangle normals within one face, so curved faces shade
    smoothly and edges between faces stay sharp."""
    shape, at = own_shape(obj)
    if tolerance_mm is None:
        tolerance_mm = mesh_tolerance(shape)
    try:
        import MeshPart

        MeshPart.meshFromShape(Shape=shape, LinearDeflection=tolerance_mm, AngularDeflection=MESH_ANGLE, Relative=False)  # leaves its triangles on the faces
    except Exception:
        pass  # without the mesher module the faces are meshed one by one below, heavier but the same solid
    points, normals, indices = [], [], []
    for face in shape.Faces:
        pts, tris = face.tessellate(tolerance_mm)
        if not tris:
            continue
        acc = [App.Vector() for _ in pts]
        for a, b, c in tris:
            n = (pts[b] - pts[a]).cross(pts[c] - pts[a])
            acc[a] += n
            acc[b] += n
            acc[c] += n
        base = len(points)
        points.extend(at.multVec(p) for p in pts)
        normals.extend(at.Rotation.multVec(n) for n in acc)
        indices.extend((base + a, base + b, base + c) for a, b, c in tris)
    return points, normals, indices


def to_gltf(mesh, frame):
    """Document-frame triangles in the building's own frame, with glTF axes, in metres. The
    axis change (x, y, z) -> (x, z, -y) is a rotation, so triangle winding stays outward."""
    points, normals, indices = mesh
    inv = frame.inverse()
    positions, out_normals = [], []
    for p, n in zip(points, normals):
        q = inv.multVec(p)
        r = inv.Rotation.multVec(n)
        ln = r.Length or 1.0
        positions.append((q.x / MM, q.z / MM, -q.y / MM))
        out_normals.append((r.x / ln, r.z / ln, -r.y / ln))
    return positions, out_normals, indices


def mesh_volume(positions, indices):
    """The volume a closed triangle mesh encloses (divergence theorem), in m³."""
    v = 0.0
    for a, b, c in indices:
        (x1, y1, z1), (x2, y2, z2), (x3, y3, z3) = positions[a], positions[b], positions[c]
        v += x1 * (y2 * z3 - z2 * y3) - y1 * (x2 * z3 - z2 * x3) + z1 * (x2 * y3 - y2 * x3)
    return v / 6.0


def write_glb(path, parts, root_name, root_extras):
    """parts: [(name, (positions, normals, indices), rgb, extras)]."""
    blob = bytearray()
    views, accessors, meshes, materials, nodes = [], [], [], [], []

    def view(data, target):
        blob.extend(b"\0" * ((-len(blob)) % 4))
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(data), "target": target})
        blob.extend(data)
        return len(views) - 1

    for name, (pos, nor, idx), rgb, extras in parts:
        if not idx:
            continue
        pv = view(struct.pack("<%df" % (3 * len(pos)), *[c for p in pos for c in p]), 34962)
        nv = view(struct.pack("<%df" % (3 * len(nor)), *[c for n in nor for c in n]), 34962)
        iv = view(struct.pack("<%dI" % (3 * len(idx)), *[i for t in idx for i in t]), 34963)
        lo = [min(p[k] for p in pos) for k in range(3)]
        hi = [max(p[k] for p in pos) for k in range(3)]
        accessors.append({"bufferView": pv, "componentType": 5126, "count": len(pos), "type": "VEC3", "min": lo, "max": hi})
        accessors.append({"bufferView": nv, "componentType": 5126, "count": len(nor), "type": "VEC3"})
        accessors.append({"bufferView": iv, "componentType": 5125, "count": 3 * len(idx), "type": "SCALAR"})
        materials.append({"name": name, "pbrMetallicRoughness": {"baseColorFactor": [rgb[0], rgb[1], rgb[2], 1.0],
                                                                  "metallicFactor": 0.0, "roughnessFactor": 0.9}})
        meshes.append({"name": name, "primitives": [{"attributes": {"POSITION": len(accessors) - 3, "NORMAL": len(accessors) - 2},
                                                     "indices": len(accessors) - 1, "material": len(materials) - 1}]})
        nodes.append({"name": name, "mesh": len(meshes) - 1, "extras": extras})
    nodes.append({"name": root_name, "children": list(range(len(nodes))), "extras": root_extras})
    gltf = {
        "asset": {"version": "2.0", "generator": "FreeCAD Organic workbench"},
        "scene": 0,
        "scenes": [{"name": root_name, "nodes": [len(nodes) - 1]}],
        "nodes": nodes, "meshes": meshes, "materials": materials,
        "accessors": accessors, "bufferViews": views, "buffers": [{"byteLength": len(blob)}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    js += b" " * ((-len(js)) % 4)
    blob.extend(b"\0" * ((-len(blob)) % 4))
    with open(path, "wb") as fh:
        fh.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(js) + 8 + len(blob)))
        fh.write(struct.pack("<I4s", len(js), b"JSON"))
        fh.write(js)
        fh.write(struct.pack("<I4s", len(blob), b"BIN\0"))
        fh.write(bytes(blob))


def read_glb(path):
    """(gltf json, binary chunk) of a .glb file."""
    with open(path, "rb") as fh:
        data = fh.read()
    magic, _version, _total = struct.unpack("<4sII", data[:12])
    if magic != b"glTF":
        raise ValueError("%s is not a GLB" % path)
    jlen, _jt = struct.unpack("<I4s", data[12:20])
    gltf = json.loads(data[20:20 + jlen])
    blen, _bt = struct.unpack("<I4s", data[20 + jlen:28 + jlen])
    return gltf, data[28 + jlen:28 + jlen + blen]


# ---------------------------------------------------------------- what stands there already
def plan_triangles(path, prefix, exact=False):
    """The triangles of a land file's nodes whose name starts with prefix (exact: is prefix), in
    plan: an array (n, 3, 2) of (east, north) metres from the anchor. None when the file is not there."""
    import numpy as np

    t = node_triangles(path, prefix, exact)
    return None if t is None else np.stack([t[:, :, 0], -t[:, :, 2]], axis=2)  # glTF (x, y, z) = (east, up, south)


def ground_at(out_dir, east, north):
    """The map's ground at a spot, in metres above its ground at the anchor: the terrain of the
    land file the map itself shows. None when the file is not there or does not reach the spot."""
    import numpy as np

    t = node_triangles(os.path.join(out_dir, SITE_FILE), "terrain")
    if t is None or not len(t):
        return None
    a, b, c = t[:, 0], t[:, 1], t[:, 2]
    det = (b[:, 2] - c[:, 2]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 2] - c[:, 2])
    det = np.where(np.abs(det) < 1e-12, np.nan, det)

    def height(x, z):
        l1 = ((b[:, 2] - c[:, 2]) * (x - c[:, 0]) + (c[:, 0] - b[:, 0]) * (z - c[:, 2])) / det
        l2 = ((c[:, 2] - a[:, 2]) * (x - c[:, 0]) + (a[:, 0] - c[:, 0]) * (z - c[:, 2])) / det
        hit = np.nonzero((l1 >= -1e-9) & (l2 >= -1e-9) & (1 - l1 - l2 >= -1e-9))[0]
        if not len(hit):
            return None
        k = hit[0]
        return float(l1[k] * a[k, 1] + l2[k] * b[k, 1] + (1 - l1[k] - l2[k]) * c[k, 1])

    here, zero = height(east, -north), height(0.0, 0.0)
    return None if here is None or zero is None else here - zero


def node_triangles(path, prefix, exact=False):
    """The triangles of a land file's nodes whose name starts with prefix (exact: is prefix): an
    array (n, 3, 3) in the file's own frame (glTF: x east, y up, z south). None when the file is not there."""
    import numpy as np

    if not os.path.isfile(path):
        return None
    gltf, blob = read_glb(path)
    kinds = {5126: "<f4", 5125: "<u4", 5123: "<u2", 5121: "u1"}
    comps = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}

    def accessor(i):
        acc = gltf["accessors"][i]
        view = gltf["bufferViews"][acc["bufferView"]]
        dt = np.dtype(kinds[acc["componentType"]])
        n = comps[acc["type"]]
        stride = view.get("byteStride") or dt.itemsize * n
        start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        raw = np.frombuffer(blob, dtype=np.uint8, count=stride * (acc["count"] - 1) + dt.itemsize * n, offset=start)
        rows = np.lib.stride_tricks.as_strided(raw, shape=(acc["count"], dt.itemsize * n), strides=(stride, 1))
        return np.ascontiguousarray(rows).view(dt).reshape(acc["count"], n).astype(float)

    def local(node):
        if "matrix" in node:
            return np.array(node["matrix"], dtype=float).reshape(4, 4).T
        m = np.eye(4)
        x, y, z, w = node.get("rotation", (0.0, 0.0, 0.0, 1.0))
        m[:3, :3] = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
        m[:3, :3] = m[:3, :3] * np.array(node.get("scale", (1.0, 1.0, 1.0)), dtype=float)
        m[:3, 3] = node.get("translation", (0.0, 0.0, 0.0))
        return m

    out = []

    def walk(index, parent):
        node = gltf["nodes"][index]
        world = parent @ local(node)
        name = node.get("name", "")
        if "mesh" in node and (name == prefix if exact else name.startswith(prefix)):
            for prim in gltf["meshes"][node["mesh"]]["primitives"]:
                pos = accessor(prim["attributes"]["POSITION"])
                pos = pos @ world[:3, :3].T + world[:3, 3]
                idx = accessor(prim["indices"]).astype(int).reshape(-1, 3) if "indices" in prim else np.arange(len(pos)).reshape(-1, 3)
                out.append(pos[idx])
        for child in node.get("children", []):
            walk(child, world)

    scene = gltf["scenes"][gltf.get("scene", 0)]
    for root in scene["nodes"]:
        walk(root, np.eye(4))
    return np.concatenate(out) if out else np.zeros((0, 3, 3))


def site_clearance(out_dir, footprint, replaces=()):
    """Metres from the building's footprint to what the map already shows there: the roads,
    the access easement and the existing buildings (0: it stands on one), as a dict; and, as a
    second dict, the existing buildings it replaces (its `decided` names them), each by its
    own name: those are not among the existing buildings of the first. Read from the land
    files in the exchange folder; a kind is left out when its file is not there.
    footprint: (east, north) points in metres from the anchor."""
    try:
        import numpy as np
        import shapely
    except ImportError:
        return {}, {}
    hull = shapely.MultiPoint([tuple(p) for p in footprint]).convex_hull

    def gap(tris):
        if tris is None or not len(tris):
            return None
        a, b, c = tris[:, 0], tris[:, 1], tris[:, 2]
        area = np.abs((b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0])) / 2
        tris = tris[area > 1e-6]  # a wall seen from above is a line
        return round(float(shapely.distance(hull, shapely.polygons(tris)).min()), 2) if len(tris) else None

    out, replaced = {}, {}
    for key, prefix in (("road", "road"), ("easement", "easement")):
        d = gap(plan_triangles(os.path.join(out_dir, SITE_FILE), prefix))
        if d is not None:
            out[key] = d
    path = os.path.join(out_dir, EXISTING_FILE)
    if os.path.isfile(path):
        gltf, _blob = read_glb(path)
        for name in sorted({n.get("name", "") for n in gltf.get("nodes", []) if "mesh" in n}):
            d = gap(plan_triangles(path, name, exact=True))
            if d is None:
                continue
            if name in replaces:
                replaced[name] = d
            else:
                out["existing_building"] = d if "existing_building" not in out else min(out["existing_building"], d)
    return out, replaced


ENVELOPE_FILE = "build-envelope.geojson"
# the envelope's kinds that are a place to build in, or only a reference; every other kind says "no building"
ENVELOPE_OPEN = ("buildable_envelope", "house_zone")
# lane C's overlay from Johny's word (3 Oct 2026, no survey): the oaks inside it were cut, the data there is out of date
OAKS_REMOVED_FILE = os.path.join("land", "oaks-removed.geojson")


def oaks_removed(out_dir):
    """The polygons of lane C's land\\oaks-removed.geojson, each with its own reason: [(shapely
    polygon, reason)], or [] when the file is not there. An oak_protection polygon whose middle
    lies in one is out of date (FORMAT.md, "Johny's answers on his house S01")."""
    path = os.path.join(out_dir, OAKS_REMOVED_FILE)
    if not os.path.isfile(path):
        return []
    try:
        from shapely.geometry import shape as as_shape
    except ImportError:
        return []
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    return [(as_shape(f["geometry"]), (f.get("properties") or {}).get("reason", "")) for f in data.get("features", [])
            if (f.get("properties") or {}).get("kind") == "oaks_removed" and f.get("geometry")]


def envelope_at(out_dir, footprint, anchor=ANCHOR, replaces=()):
    """What the map's build envelope (lane C's build-envelope.geojson: the county's setbacks,
    the oak protection zones, the steep ground, the easement, the roads, the existing
    buildings) holds at a building's footprint. footprint: (east, north) points in metres from
    the anchor, one per vertex of the building.

    Returns None when the file is not there, else {"file", "points", "buildable": the share of
    the footprint's points inside the buildable envelope (None when the file has none),
    "no_building": {kind: {"share", "reason"}} for every kind that says no building and holds
    a point of it, "stale": {kind: {"share", "reason"}} for the oak_protection polygons that
    lane C's land\\oaks-removed.geojson marks as out of date (their middle inside it; its own
    reason), "replaced": {name: share} for the existing buildings it replaces (replaces: their
    names)}; neither of the last two is in no_building. The land's own analysis is lane C's:
    this reads it, and works out nothing of its own about the land."""
    path = os.path.join(out_dir, ENVELOPE_FILE)
    if not os.path.isfile(path):
        return None
    try:
        import shapely
        from shapely.geometry import shape as as_shape
    except ImportError:
        return None
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    kx, ky = METRES_PER_DEG
    points = shapely.points([(anchor["lng"] + e / kx, anchor["lat"] + n / ky) for e, n in footprint])
    reach = shapely.box(*shapely.total_bounds(points))
    removed = oaks_removed(out_dir)
    inside, reasons, stale, stale_reasons, replaced = {}, {}, {}, {}, {}
    for feature in data.get("features", []):
        props = feature.get("properties") or {}
        kind = props.get("kind")
        if not kind or kind == "house_zone":
            continue
        shape = as_shape(feature["geometry"])
        if not shape.intersects(reach):
            continue
        shapely.prepare(shape)
        hit = shapely.contains(shape, points)
        if not hit.any():
            continue
        if kind == "existing_building" and props.get("name") in replaces:
            replaced[props["name"]] = hit if props["name"] not in replaced else (replaced[props["name"]] | hit)
            continue
        if kind == "oak_protection":
            gone = next((why for zone, why in removed if zone.contains(shape.centroid)), None)
            if gone is not None:
                stale[kind] = hit if kind not in stale else (stale[kind] | hit)
                stale_reasons.setdefault(kind, gone)
                continue
        inside[kind] = hit if kind not in inside else (inside[kind] | hit)
        reasons.setdefault(kind, props.get("reason", ""))
    kinds = {(f.get("properties") or {}).get("kind") for f in data.get("features", [])}
    total = float(len(footprint))
    return {
        "file": ENVELOPE_FILE, "points": len(footprint),
        "buildable": (round(float(inside["buildable_envelope"].sum()) / total, 4) if "buildable_envelope" in inside else 0.0) if "buildable_envelope" in kinds else None,
        "no_building": {k: {"share": round(float(v.sum()) / total, 4), "reason": reasons[k]} for k, v in sorted(inside.items()) if k not in ENVELOPE_OPEN},
        "stale": {k: {"share": round(float(v.sum()) / total, 4), "reason": stale_reasons[k]} for k, v in sorted(stale.items())},
        "replaced": {k: round(float(v.sum()) / total, 4) for k, v in sorted(replaced.items())},
    }


def ground_heights(out_dir, points):
    """The map's ground at many (east, north) spots (metres from the anchor), as ground_at reads
    one: the terrain of the land file the map shows, its triangles read once. None where it does
    not reach."""
    import numpy as np

    t = node_triangles(os.path.join(out_dir, SITE_FILE), "terrain")
    if t is None or not len(t):
        return [None] * len(points)
    a, b, c = t[:, 0], t[:, 1], t[:, 2]
    det = (b[:, 2] - c[:, 2]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 2] - c[:, 2])
    det = np.where(np.abs(det) < 1e-12, np.nan, det)

    def height(x, z):
        l1 = ((b[:, 2] - c[:, 2]) * (x - c[:, 0]) + (c[:, 0] - b[:, 0]) * (z - c[:, 2])) / det
        l2 = ((c[:, 2] - a[:, 2]) * (x - c[:, 0]) + (a[:, 0] - c[:, 0]) * (z - c[:, 2])) / det
        hit = np.nonzero((l1 >= -1e-9) & (l2 >= -1e-9) & (1 - l1 - l2 >= -1e-9))[0]
        if not len(hit):
            return None
        k = hit[0]
        return float(l1[k] * a[k, 1] + l2[k] * b[k, 1] + (1 - l1[k] - l2[k]) * c[k, 1])

    zero = height(0.0, 0.0)
    out = []
    for e, n in points:
        here = height(e, -n)
        out.append(None if here is None or zero is None else here - zero)
    return out


LAND_LAYER = "Land data (not the house)"  # the group the land's own outlines are drawn in: not part of any building, never sent
LAND_COLOURS = {"oak_protection": (0.20, 0.55, 0.25), "stale": (0.62, 0.66, 0.60), "oaks_removed": (0.85, 0.55, 0.10)}


def land_layer(doc, kinds=("oak_protection",), centre_m=(0.0, 0.0), radius_m=40.0, out_dir=None, anchor=ANCHOR):
    """What lane C's build envelope says near a place, drawn on the map's ground as outlines the
    designer can show or hide (Johny, 3 Oct 2026, of the oak canopy at his house: "lay the canopy
    outline as a toggle anyway so he sees what the data says"). Every polygon of the kinds asked
    for whose middle lies within radius_m of centre_m (east, north metres from the anchor), each
    labelled with the envelope's own reason; an oak that lane C's land\\\\oaks-removed.geojson marks
    as out of date is labelled so and drawn grey, and the overlay itself is drawn too. In the
    document's own frame (its Site), in a group of its own that is not part of any building and
    is never sent to the map. Drawn again: the old group is emptied first. Returns the group."""
    import Part
    from shapely.geometry import Polygon, shape as as_shape

    land = land_dir(out_dir)
    with open(os.path.join(land, ENVELOPE_FILE), encoding="utf-8") as fh:
        data = json.load(fh)
    removed = oaks_removed(land)
    kx, ky = METRES_PER_DEG
    east0, north0, up0 = frame_offset(document_origin(doc), anchor)
    rows = []  # (label, colour, rings in east/north metres)
    for feature in data.get("features", []):
        props = feature.get("properties") or {}
        if props.get("kind") not in kinds:
            continue
        geometry = as_shape(feature["geometry"])
        mid = geometry.centroid
        e, n = (mid.x - anchor["lng"]) * kx, (mid.y - anchor["lat"]) * ky
        if math.hypot(e - centre_m[0], n - centre_m[1]) > radius_m:
            continue
        gone = next((why for zone, why in removed if zone.contains(mid)), None)
        polygons = list(geometry.geoms) if geometry.geom_type == "MultiPolygon" else [geometry]
        rings = [[((x - anchor["lng"]) * kx, (y - anchor["lat"]) * ky) for x, y in ring.coords] for p in polygons for ring in [p.exterior] + list(p.interiors)]
        what = props.get("reason", props.get("kind"))
        if "tree_id" in props:
            what = "tree %s: %s" % (props["tree_id"], what)
        rows.append(("%s%s" % (what, " (out of date here: %s)" % gone if gone else ""), LAND_COLOURS["stale" if gone else props["kind"]] if props["kind"] in LAND_COLOURS else (0.3, 0.3, 0.3), rings))
    for zone, why in removed:
        if zone.distance(Polygon([(anchor["lng"] + (centre_m[0] + dx) / kx, anchor["lat"] + (centre_m[1] + dy) / ky) for dx, dy in ((-radius_m, -radius_m), (radius_m, -radius_m), (radius_m, radius_m), (-radius_m, radius_m))])) == 0:
            rings = [[((x - anchor["lng"]) * kx, (y - anchor["lat"]) * ky) for x, y in zone.exterior.coords]]
            rows.append(("lane C's overlay: %s" % why, LAND_COLOURS["oaks_removed"], rings))
    group = doc.getObject(doc.getObjectsByLabel(LAND_LAYER)[0].Name) if doc.getObjectsByLabel(LAND_LAYER) else None
    if group is None:
        group = doc.addObject("App::DocumentObjectGroup", "LandData")
        group.Label = LAND_LAYER
    for old in list(group.Group):
        group.removeObject(old)
        doc.removeObject(old.Name)
    points = [p for _l, _c, rings in rows for ring in rings for p in ring]
    heights = iter(ground_heights(land, points))
    for label, colour, rings in rows:
        wires = []
        for ring in rings:
            pts = [App.Vector((e - east0) * MM, (n - north0) * MM, ((next(heights) or 0.0) - up0) * MM + 20.0) for e, n in ring]  # 2 cm over the ground
            wires.append(Part.makePolygon(pts))
        obj = doc.addObject("Part::Feature", "LandOutline")
        obj.Shape = Part.Compound(wires)
        obj.Label = label[:180]
        group.addObject(obj)
        if App.GuiUp and obj.ViewObject is not None:
            obj.ViewObject.LineColor = colour
            obj.ViewObject.LineWidth = 2.0
    return group


# ---------------------------------------------------------------- IFC
def dms(value):
    """Decimal degrees as IFC's compound angle: degrees, minutes, seconds, millionths of a
    second. IfcOpenShell's own dd2dms does the splitting; where it rounds up to a whole
    second it leaves 1,000,000 millionths, which is carried here."""
    import ifcopenshell.util.geolocation as geo

    parts = [int(c) for c in geo.dd2dms(value, use_us=True)]
    sign = -1 if any(c < 0 for c in parts) else 1
    d, mnt, sec, micro = (abs(c) for c in parts)
    if micro >= 1000000:
        sec, micro = sec + 1, micro - 1000000
    if sec >= 60:
        mnt, sec = mnt + 1, sec - 60
    if mnt >= 60:
        d, mnt = d + 1, mnt - 60
    return tuple(sign * c for c in (d, mnt, sec, micro))


def place_in_ifc(path, placement, anchor, project_name=None):
    """State where the building stands, in an IFC whose geometry is in the building's frame.

    The exporter writes the site's latitude and longitude in whole seconds (up to ~7 m off
    here), so they are rewritten with their millionths. The site keeps the anchor; the
    building gets its placement on the site (the offset and the turn); every other product
    keeps its place in the building's own frame, so the whole building follows.

    The placements and the property set are written by IfcOpenShell's own calls
    (api.geometry.edit_object_placement, api.pset), which set each product relative to what
    holds it (FreeCAD's exporter writes every placement absolute). Until 2 Oct 2026 this was
    done by hand here; the two gave the same file (every product's world placement to 1e-14),
    so the hand-written one went."""
    import ifcopenshell
    import ifcopenshell.api.geometry
    import ifcopenshell.api.pset
    import ifcopenshell.util.placement
    import ifcopenshell.util.unit
    import numpy as np

    f = ifcopenshell.open(path)
    scale = ifcopenshell.util.unit.calculate_unit_scale(f)  # the file's length unit, in metres
    site = f.by_type("IfcSite")[0]
    building = f.by_type("IfcBuilding")[0]
    site.RefLatitude = dms(anchor["lat"])
    site.RefLongitude = dms(anchor["lng"])
    site.RefElevation = anchor["elevation_m"] / scale
    building.ElevationOfRefHeight = placement["elevation_m"] / scale
    if project_name:
        for project in f.by_type("IfcProject"):
            project.Name = project_name  # the exporter names it after its hidden document

    products = [p for p in f.by_type("IfcProduct") if p.ObjectPlacement is not None]
    world = {p.id(): ifcopenshell.util.placement.get_local_placement(p.ObjectPlacement) for p in products}
    to_building = np.linalg.inv(world.get(building.id(), np.eye(4)))

    off = placement["offset_m"]
    yaw = math.radians(placement["rotation_deg"]["y"])
    turn = np.eye(4)  # the building's own frame on the site, in metres
    turn[:3, :3] = [[math.cos(yaw), -math.sin(yaw), 0.0], [math.sin(yaw), math.cos(yaw), 0.0], [0.0, 0.0, 1.0]]
    turn[:3, 3] = [off["east"], off["north"], off["up"]]
    ifcopenshell.api.geometry.edit_object_placement(f, product=site, matrix=np.eye(4), is_si=True)
    ifcopenshell.api.geometry.edit_object_placement(f, product=building, matrix=turn, is_si=True)
    for p in products:
        if p.id() in (site.id(), building.id()):
            continue
        local = to_building @ world[p.id()]  # where it stands in the building's frame
        local[:3, 3] *= scale
        ifcopenshell.api.geometry.edit_object_placement(f, product=p, matrix=turn @ local, is_si=True)

    values = (("Longitude", placement["coordinates"][0]), ("Latitude", placement["coordinates"][1]),
              ("AltitudeM", placement["altitude_m"]), ("ElevationM", placement["elevation_m"]),
              ("RotationDegY", placement["rotation_deg"]["y"]),
              ("OffsetEastM", off["east"]), ("OffsetNorthM", off["north"]), ("OffsetUpM", off["up"]))
    pset = ifcopenshell.api.pset.add_pset(f, product=building, name="Organic_Placement")
    ifcopenshell.api.pset.edit_pset(f, pset=pset, properties={name: f.create_entity("IfcReal", float(value)) for name, value in values})
    f.write(path)


def write_ifc(path, elements, frame, placement, anchor, building_label):
    """IFC4 through FreeCAD's BIM exporter, from copies in a hidden document taken into the
    building's own frame; then the building's place on the site is written into the file."""
    import Arch
    import importers.exportIFC as exportIFC

    inv = frame.inverse()
    prev = App.ActiveDocument
    tmp = App.newDocument("OrganicIfcExport", building_label, True, True)
    App.setActiveDocument(tmp.Name)  # Arch.makeBuilding and makeSite build in the active document
    try:
        copies = []
        for el in elements:
            f = tmp.addObject("Part::Feature", el.Name)
            f.Label = el.Label
            s = global_shape(el).copy()
            s.Placement = inv.multiply(s.Placement)
            f.Shape = s
            f.addProperty("App::PropertyString", "IfcType", "IFC", "IFC class")
            f.IfcType = str(getattr(el, "IfcType", "Building Element Proxy"))
            if App.GuiUp and f.ViewObject is not None and el.ViewObject is not None:
                try:
                    f.ViewObject.ShapeAppearance = el.ViewObject.ShapeAppearance
                except Exception:
                    pass
            copies.append(f)
        bld = Arch.makeBuilding(copies, name="Building")
        bld.Label = building_label
        site = Arch.makeSite([bld], name="Site")
        site.Label = "Sulphur Mountain site"
        site.Longitude, site.Latitude = anchor["lng"], anchor["lat"]
        site.Elevation = anchor["elevation_m"] * MM
        tmp.recompute()
        exportIFC.export([site], path)
    finally:
        App.closeDocument(tmp.Name)
        if prev is not None:
            App.setActiveDocument(prev.Name)
            if App.GuiUp:
                import FreeCADGui as Gui

                Gui.setActiveDocument(prev.Name)
    place_in_ifc(path, placement, anchor, building_label)


# ---------------------------------------------------------------- the button
FRAME_NOTE = {
    "doc": "C:/Playground/BRAIN.md section 3 (the canonical frame); exchange/godot/FORMAT.md (edits/2 and section 3)",
    "units": "m",
    "geometry": "in the building's own frame: its origin stands at placement.coordinates, its z = 0 at placement.elevation_m",
    "glb_axes": "glTF Y-up: +X the building's x, +Y up, +Z the building's -y (east, up, south when it is not turned)",
    "ifc": "IfcSite at the anchor; the IfcBuilding's placement on the site is offset_m and the turn; elements relative to the building",
    "rotation_deg": "Euler degrees in glTF's axes; y is the turn seen from above, anticlockwise positive",
    "altitude_m": "height of the building's z = 0 above the ground datum at the anchor (datum_m)",
    "level_above_ground_m": "height of the building's z = 0 above the map's ground at its origin (the land file beside this one)",
    "box_m": "each element's solid in the building's own frame, before the building is turned: [[x min, y min, z min], [x max, y max, z max]], x east, y north, z up",
    "volume_m3": "each element's solid by OCCT's adaptive measure (to 1e-5 of it); mesh_volume_m3 is what its triangles in the .glb enclose",
}


def box_in(el, frame):
    """An element's solid in its building's own frame: [[x min, y min, z min], [x max, y max,
    z max]] in metres, the shape the map reads (exchange/godot/FORMAT.md, BUILD piece 4).
    Measured on the solid itself, not on its triangles."""
    shape = global_shape(el).copy()
    shape.Placement = frame.inverse().multiply(shape.Placement)
    b = shape.optimalBoundingBox(False, False)
    return [[round(v / MM, 4) for v in (b.XMin, b.YMin, b.ZMin)], [round(v / MM, 4) for v in (b.XMax, b.YMax, b.ZMax)]]


def openings_of(el):
    """What is cut through an element, for whoever holds it against the map's piece: a wall's
    openings as they stand in the solid (metres along its base curve to each one's middle,
    its width along the curve, its sill and height above the wall's base, its shape), and how
    many closed curves are cut through a floor or a roof. {} for anything else."""
    out = {}
    proxy = getattr(el, "Proxy", None)
    if "OpeningPositions" in el.PropertiesList and hasattr(proxy, "openings"):
        cut = proxy.openings(el)
        out["openings"] = len(cut)
        if cut:
            kinds = list(getattr(el, "OpeningKinds", []) or [])  # the map's word for each opening (BUILD piece 5), where it gave one
            out["opening_list"] = [dict({"at_m": round(o["position_m"], 4), "width_m": round(o["width_m"], 4), "sill_m": round(o["sill_m"], 4),
                                         "height_m": round(o["height_m"], 4), "shape": str(o["shape"])}, **({"kind": kinds[i]} if i < len(kinds) and kinds[i] else {}))
                                    for i, o in enumerate(cut)]
    if str(getattr(el, "WallKind", "") or ""):  # the map's word for what the wall is made of (BUILD piece 5)
        out["wall_kind"] = str(el.WallKind)
    if "Holes" in el.PropertiesList:
        out["holes"] = len(el.Holes or [])
    return out


def export_building(target, out_dir=None, name=None, anchor=None, stem=None, land=None):
    """Write <name>.glb, <name>.ifc and <name>.json for a building into the exchange folder.
    Returns the report written as the .json, with the three paths added under "paths".

    The files are named after the building (its label, in small letters) unless `stem` names
    them; the map's land files are read from the folder written to unless `land` names theirs."""
    targets = target if isinstance(target, (list, tuple)) else [target]
    doc = targets[0].Document
    elements = elements_of(targets)
    if not elements:
        raise ValueError("nothing to export: no visible solids under the selection")
    anchor = anchor or ANCHOR
    origin = document_origin(doc)
    label = name or (targets[0].Label if len(targets) == 1 else doc.Label)
    stem = stem or file_stem(label)
    out_dir = out_dir or exchange_dir()
    land = land or land_dir(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    glb, ifc, side = (os.path.join(out_dir, stem + ext) for ext in (".glb", ".ifc", ".json"))

    meshes = []
    for el in elements:
        meshes.append(tessellate(el))
    frame, note = building_frame(targets, [p for m in meshes for p in m[0]])
    placement = placement_of(frame, origin, anchor)
    notes = [note] if note else []
    if abs(origin.get("declination", 0.0)) > 1e-9:
        notes.append("the document's Site states a declination of %g°: +Y is taken as true north all the same" % origin["declination"])

    parts, rows = [], []
    for el, mesh in zip(elements, meshes):
        tri = to_gltf(mesh, frame)
        vol = og.volume_of(el.Shape) / 1e9  # Shape.Volume reads a splined solid up to some tenths of a percent off
        extras = {"ifcType": str(getattr(el, "IfcType", "")), "freecadName": el.Name, "volume_m3": round(vol, 4)}
        row = {"name": el.Label, "freecadName": el.Name, "ifcType": extras["ifcType"], "volume_m3": vol,
               "mesh_volume_m3": mesh_volume(tri[0], tri[2]), "triangles": len(tri[2]), "box_m": box_in(el, frame)}
        row.update(openings_of(el))
        piece = str(getattr(el, "MapPiece", "") or "")
        if piece:  # a piece that was drawn in the map: its id there, so the map can hold this solid against it
            extras["piece"] = row["piece"] = piece
        if getattr(el, "MapLand", ""):  # what the map read of the land at this piece, kept as it was written
            row["land"] = json.loads(el.MapLand)
        parts.append((el.Label, tri, colour_of(el), extras))
        rows.append(row)

    # where its footprint stands among what the map already shows; what Johny decided about that (FORMAT.md, "decided")
    building = building_of(targets)
    decided = json.loads(building.MapDecided) if getattr(building, "MapDecided", "") else None
    replaces = [str(n) for n in ((decided or {}).get("replaces") or {}).get("existing", [])]
    off, yaw = placement["offset_m"], math.radians(placement["rotation_deg"]["y"])
    cos, sin = math.cos(yaw), math.sin(yaw)
    footprint = [(off["east"] + cos * x - sin * (-z), off["north"] + sin * x + cos * (-z)) for _n, tri, _c, _e in parts for x, _y, z in tri[0]]
    clearance, replaced = site_clearance(land, footprint, replaces)
    on = [k for k, v in clearance.items() if v <= 0.0]
    if on:
        notes.append("it stands on: %s" % ", ".join({"road": "a road", "easement": "the access easement", "existing_building": "an existing building"}[k] for k in on))
    for name, d in sorted(replaced.items()):
        notes.append("it replaces the existing %s (%s: %s), and %s" % (name, decided["replaces"].get("by", "decided"), decided["replaces"].get("on", ""),
                                                                    "stands on it" if d <= 0.0 else "stands %.1f m from it" % d))
    ground = ground_at(land, off["east"], off["north"])
    above = None if ground is None else round(off["up"] - ground, 2)
    if above is not None and abs(above) > 1.0:
        notes.append("its level (z = 0) is %.1f m %s the map's ground there" % (abs(above), "above" if above > 0 else "below"))
    # what the map's own build envelope says of that footprint (lane C's file: setbacks, oaks, steep ground)
    envelope = envelope_at(land, footprint, anchor, replaces)
    if envelope is not None:
        if envelope["buildable"] is not None and envelope["buildable"] < 0.9995:
            notes.append("by the map's build envelope, %.0f %% of it (its points in plan) lies outside the area that may be built on" % (100.0 * (1.0 - envelope["buildable"])))
        for row in envelope["no_building"].values():
            notes.append("by the map's build envelope, %.0f %% of it (its points in plan) lies where there is to be no building: %s"
                         % (100.0 * row["share"], row["reason"]))
        for kind, row in envelope["stale"].items():
            notes.append("by the map's build envelope, %.0f %% of it (its points in plan) lies in %s that is out of date there: %s"
                         % (100.0 * row["share"], kind, row["reason"]))

    stamp = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    source = os.path.basename(doc.FileName) if doc.FileName else doc.Label
    write_glb(glb, parts, label, {"placement": placement, "frame": FRAME_NOTE, "source": source, "exported": stamp})
    write_ifc(ifc, elements, frame, placement, anchor, label)
    report = {"name": label, "placement": placement, "clearance_m": clearance, "envelope": envelope, "level_above_ground_m": above, "notes": notes, "frame": FRAME_NOTE,
              "files": {"glb": stem + ".glb", "ifc": stem + ".ifc"}, "source": source, "exported": stamp,
              "generator": "FreeCAD %s, Organic workbench" % ".".join(App.Version()[:3]), "elements": rows}
    if doc.FileName:  # the design itself: what the map opens for "edit in its source app" (FORMAT.md)
        report["source_path"] = os.path.abspath(doc.FileName)
    built = getattr(building_of(targets), "MapFile", "")
    if built:  # a building that was drawn in the map and rebuilt here: the file it came from
        report["built_from"] = os.path.basename(built)
    if getattr(building_of(targets), "MapLand", ""):
        report["land"] = json.loads(building_of(targets).MapLand)
    if decided is not None:  # Johny's decisions about where it stands, as they came with its records
        report["decided"] = decided
    if replaced:
        report["replaced_m"] = replaced
    with open(side, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
    return dict(report, paths={"glb": glb, "ifc": ifc, "json": side})
