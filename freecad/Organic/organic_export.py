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

MM = 1000.0
# The canonical frame (BRAIN.md §3): the anchor, and the ground there from the map's DEM.
ANCHOR = {"lng": -119.15536, "lat": 34.4331, "elevation_m": 425.63}
# the land pack's frame (pack.json): metres per degree, equirectangular at the site
METRES_PER_DEG = (91916.198, 110930.184)
DEFAULT_EXCHANGE_DIR = r"C:\Playground\exchange\godot"
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
def tessellate(obj, tolerance_mm):
    """A solid's triangles in document coordinates (mm): points, per-point normals, triangles.

    Vertex normals average the triangle normals within one face, so curved faces shade
    smoothly and edges between faces stay sharp."""
    points, normals, indices = [], [], []
    for face in global_shape(obj).Faces:
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
        points.extend(pts)
        normals.extend(acc)
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
def plan_triangles(path, prefix):
    """The triangles of a land file's nodes whose name starts with prefix, in plan: an array
    (n, 3, 2) of (east, north) metres from the anchor. None when the file is not there."""
    import numpy as np

    t = node_triangles(path, prefix)
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


def node_triangles(path, prefix):
    """The triangles of a land file's nodes whose name starts with prefix: an array (n, 3, 3)
    in the file's own frame (glTF: x east, y up, z south). None when the file is not there."""
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
        if "mesh" in node and node.get("name", "").startswith(prefix):
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


def site_clearance(out_dir, footprint):
    """Metres from the building's footprint to what the map already shows there: the roads,
    the access easement and the existing buildings (0: it stands on one). Read from the land
    files in the exchange folder; a kind is left out when its file is not there.
    footprint: (east, north) points in metres from the anchor."""
    try:
        import numpy as np
        import shapely
    except ImportError:
        return {}
    hull = shapely.MultiPoint([tuple(p) for p in footprint]).convex_hull
    out = {}
    for key, name, prefix in (("road", SITE_FILE, "road"), ("easement", SITE_FILE, "easement"), ("existing_building", EXISTING_FILE, "")):
        tris = plan_triangles(os.path.join(out_dir, name), prefix)
        if tris is None or not len(tris):
            continue
        a, b, c = tris[:, 0], tris[:, 1], tris[:, 2]
        area = np.abs((b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0])) / 2
        tris = tris[area > 1e-6]  # a wall seen from above is a line
        if len(tris):
            out[key] = round(float(shapely.distance(hull, shapely.polygons(tris)).min()), 2)
    return out


# ---------------------------------------------------------------- IFC
def dms(value):
    """Decimal degrees as IFC's compound angle: degrees, minutes, seconds, millionths."""
    sign = -1 if value < 0 else 1
    v = abs(value)
    d = int(v)
    mnt = int((v - d) * 60)
    s = (v - d - mnt / 60.0) * 3600
    sec = int(s)
    micro = int(round((s - sec) * 1e6))
    if micro >= 1000000:
        sec, micro = sec + 1, micro - 1000000
    return tuple(sign * c for c in (d, mnt, sec, micro))


def axis_placement(f, m):
    """A 4 x 4 matrix (the file's length unit) as an IfcAxis2Placement3D."""
    return f.createIfcAxis2Placement3D(
        f.createIfcCartesianPoint([float(v) for v in m[:3, 3]]),
        f.createIfcDirection([float(v) for v in m[:3, 2]]),
        f.createIfcDirection([float(v) for v in m[:3, 0]]))


def place_in_ifc(path, placement, anchor, project_name=None):
    """State where the building stands, in an IFC whose geometry is in the building's frame.

    The exporter writes the site's latitude and longitude in whole seconds (up to ~7 m off
    here), so they are rewritten with their millionths. The site keeps the anchor; the
    building gets its placement on the site (the offset and the turn); every other product is
    placed relative to the spatial element that holds it, so the whole building follows."""
    import ifcopenshell
    import ifcopenshell.guid
    import ifcopenshell.util.element
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
    local = {i: to_building @ m for i, m in world.items()}  # every product in the building's frame

    off = placement["offset_m"]
    yaw = math.radians(placement["rotation_deg"]["y"])
    turn = np.eye(4)
    turn[:3, :3] = [[math.cos(yaw), -math.sin(yaw), 0.0], [math.sin(yaw), math.cos(yaw), 0.0], [0.0, 0.0, 1.0]]
    turn[:3, 3] = [off["east"] / scale, off["north"] / scale, off["up"] / scale]
    site_lp = f.createIfcLocalPlacement(None, axis_placement(f, np.eye(4)))
    building_lp = f.createIfcLocalPlacement(site_lp, axis_placement(f, turn))
    site.ObjectPlacement = site_lp
    building.ObjectPlacement = building_lp
    done = {site.id(): (site_lp, None), building.id(): (building_lp, np.eye(4))}

    def settle(p, trail=()):
        if p.id() in done:
            return done[p.id()]
        holder = ifcopenshell.util.element.get_container(p) or ifcopenshell.util.element.get_aggregate(p)
        parent_lp, parent_m = building_lp, np.eye(4)
        if holder is not None and holder.id() in local and holder.id() != site.id() and holder.id() not in trail:
            parent_lp, parent_m = settle(holder, trail + (p.id(),))
        m = local[p.id()]
        p.ObjectPlacement = f.createIfcLocalPlacement(parent_lp, axis_placement(f, np.linalg.inv(parent_m) @ m))
        done[p.id()] = (p.ObjectPlacement, m)
        return done[p.id()]

    for p in products:
        settle(p)

    values = (("Longitude", placement["coordinates"][0]), ("Latitude", placement["coordinates"][1]),
              ("AltitudeM", placement["altitude_m"]), ("ElevationM", placement["elevation_m"]),
              ("RotationDegY", placement["rotation_deg"]["y"]),
              ("OffsetEastM", off["east"]), ("OffsetNorthM", off["north"]), ("OffsetUpM", off["up"]))
    props = [f.createIfcPropertySingleValue(name, None, f.create_entity("IfcReal", float(value)), None) for name, value in values]
    pset = f.createIfcPropertySet(ifcopenshell.guid.new(), building.OwnerHistory, "Organic_Placement", None, props)
    f.createIfcRelDefinesByProperties(ifcopenshell.guid.new(), building.OwnerHistory, None, None, [building], pset)
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
}


def export_building(target, out_dir=None, name=None, anchor=None):
    """Write <name>.glb, <name>.ifc and <name>.json for a building into the exchange folder.
    Returns the report written as the .json, with the three paths added under "paths"."""
    targets = target if isinstance(target, (list, tuple)) else [target]
    doc = targets[0].Document
    elements = elements_of(targets)
    if not elements:
        raise ValueError("nothing to export: no visible solids under the selection")
    anchor = anchor or ANCHOR
    origin = document_origin(doc)
    label = name or (targets[0].Label if len(targets) == 1 else doc.Label)
    stem = file_stem(label)
    out_dir = out_dir or exchange_dir()
    os.makedirs(out_dir, exist_ok=True)
    glb, ifc, side = (os.path.join(out_dir, stem + ext) for ext in (".glb", ".ifc", ".json"))

    meshes = []
    for el in elements:
        bb = el.Shape.BoundBox
        meshes.append(tessellate(el, max(2.0, min(10.0, 0.001 * bb.DiagonalLength))))  # mm; a thin shell needs it fine
    frame, note = building_frame(targets, [p for m in meshes for p in m[0]])
    placement = placement_of(frame, origin, anchor)
    notes = [note] if note else []
    if abs(origin.get("declination", 0.0)) > 1e-9:
        notes.append("the document's Site states a declination of %g°: +Y is taken as true north all the same" % origin["declination"])

    parts, rows = [], []
    for el, mesh in zip(elements, meshes):
        tri = to_gltf(mesh, frame)
        vol = el.Shape.Volume / 1e9
        extras = {"ifcType": str(getattr(el, "IfcType", "")), "freecadName": el.Name, "volume_m3": round(vol, 4)}
        parts.append((el.Label, tri, colour_of(el), extras))
        rows.append({"name": el.Label, "freecadName": el.Name, "ifcType": extras["ifcType"], "volume_m3": vol,
                     "mesh_volume_m3": mesh_volume(tri[0], tri[2]), "triangles": len(tri[2])})

    # where its footprint stands among what the map already shows
    off, yaw = placement["offset_m"], math.radians(placement["rotation_deg"]["y"])
    cos, sin = math.cos(yaw), math.sin(yaw)
    footprint = [(off["east"] + cos * x - sin * (-z), off["north"] + sin * x + cos * (-z)) for _n, tri, _c, _e in parts for x, _y, z in tri[0]]
    clearance = site_clearance(land_dir(out_dir), footprint)
    on = [k for k, v in clearance.items() if v <= 0.0]
    if on:
        notes.append("it stands on: %s" % ", ".join({"road": "a road", "easement": "the access easement", "existing_building": "an existing building"}[k] for k in on))
    ground = ground_at(land_dir(out_dir), off["east"], off["north"])
    above = None if ground is None else round(off["up"] - ground, 2)
    if above is not None and abs(above) > 1.0:
        notes.append("its floor is %.1f m %s the map's ground there" % (abs(above), "above" if above > 0 else "below"))

    stamp = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    source = os.path.basename(doc.FileName) if doc.FileName else doc.Label
    write_glb(glb, parts, label, {"placement": placement, "frame": FRAME_NOTE, "source": source, "exported": stamp})
    write_ifc(ifc, elements, frame, placement, anchor, label)
    report = {"name": label, "placement": placement, "clearance_m": clearance, "floor_above_ground_m": above, "notes": notes, "frame": FRAME_NOTE,
              "files": {"glb": stem + ".glb", "ifc": stem + ".ifc"}, "source": source, "exported": stamp,
              "generator": "FreeCAD %s, Organic workbench" % ".".join(App.Version()[:3]), "elements": rows}
    with open(side, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
    return dict(report, paths={"glb": glb, "ifc": ifc, "json": side})
