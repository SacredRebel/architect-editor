# -*- coding: utf-8 -*-
"""Organic: send a building to the map.

One call writes three files into the exchange folder (exchange\\godot\\ by default):
<name>.glb, <name>.ifc and <name>.json.

The frame is the exchange folder's own (its FORMAT.md): metres; glTF Y-up; the origin at
the chimney anchor lng -119.15536, lat 34.4331, 425.90 m NAVD88; +X east, +Y up, +Z south.
A building is designed in its document's frame (the site macro's: the land pack's chimney,
lng -119.155333, lat 34.433118) and moved by the difference between the two origins, so it
lands where it stands on the site. Positions are kept: nothing is re-centred.
"""

import datetime
import json
import math
import os
import re
import struct

import FreeCAD as App

MM = 1000.0
# exchange\godot\FORMAT.md: "anchored on the property's chimney (real-world lng -119.15536,
# lat 34.4331, elevation 425.90 m NAVD88)", at the glTF origin
EXCHANGE_ANCHOR = {"lng": -119.15536, "lat": 34.4331, "elevation_m": 425.90}
# the land pack's models.json origin of oak-leaf-massing: the site macro's (0, 0, 0)
PACK_CHIMNEY = {"lng": -119.155333, "lat": 34.433118, "elevation_m": 425.90}
# the land pack's frame (pack.json): metres per degree, equirectangular at the site
METRES_PER_DEG = (91916.198, 110930.184)
DEFAULT_EXCHANGE_DIR = r"C:\Playground\exchange\godot"


def settings():
    return App.ParamGet("User parameter:BaseApp/Preferences/Mod/Organic")


def exchange_dir():
    return os.environ.get("ORGANIC_EXCHANGE_DIR") or settings().GetString("ExchangeDir", "") or DEFAULT_EXCHANGE_DIR


def document_origin(doc):
    """The geographic point at a document's origin: its BIM Site's, else the pack chimney."""
    for o in doc.Objects:
        if hasattr(o, "Longitude") and hasattr(o, "Latitude") and (o.Longitude or o.Latitude):
            elev = getattr(o, "Elevation", None)
            elev_m = elev.Value / MM if elev is not None and hasattr(elev, "Value") and elev.Value else PACK_CHIMNEY["elevation_m"]
            return {"lng": float(o.Longitude), "lat": float(o.Latitude), "elevation_m": elev_m}
    return dict(PACK_CHIMNEY)


def frame_offset(origin, anchor=EXCHANGE_ANCHOR):
    """Metres to add to document coordinates (east, north, up) to reach the exchange frame."""
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
    try:
        mats = obj.ViewObject.ShapeAppearance
        return tuple(mats[0].DiffuseColor[:3])
    except Exception:
        return (0.8, 0.8, 0.8)


# ---------------------------------------------------------------- GLB
def tessellate(obj, offset_m, tolerance_mm):
    """A solid's triangles in the exchange frame with glTF axes.

    Vertex normals average the triangle normals within one face, so curved faces shade
    smoothly and edges between faces stay sharp. The axis change (x, y, z) -> (x, z, -y)
    is a rotation, so triangle winding stays outward."""
    dx, dy, dz = offset_m
    positions, normals, indices = [], [], []
    for face in obj.Shape.Faces:
        pts, tris = face.tessellate(tolerance_mm)
        if not tris:
            continue
        acc = [App.Vector() for _ in pts]
        for a, b, c in tris:
            n = (pts[b] - pts[a]).cross(pts[c] - pts[a])
            acc[a] += n
            acc[b] += n
            acc[c] += n
        base = len(positions)
        for p, n in zip(pts, acc):
            ln = n.Length or 1.0
            positions.append((p.x / MM + dx, p.z / MM + dz, -(p.y / MM + dy)))
            normals.append((n.x / ln, n.z / ln, -n.y / ln))
        indices.extend((base + a, base + b, base + c) for a, b, c in tris)
    return positions, normals, indices


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


def write_ifc(path, elements, offset_m, anchor, building_label):
    """IFC4 through FreeCAD's BIM exporter, from copies in a hidden document, moved into the
    exchange frame. The exporter writes the site's latitude and longitude in whole seconds
    (up to ~7 m off here), so they are rewritten with their millionths afterwards."""
    import Arch
    import importers.exportIFC as exportIFC

    prev = App.ActiveDocument
    tmp = App.newDocument("OrganicIfcExport", building_label, True, True)  # the IFC project takes its label
    App.setActiveDocument(tmp.Name)  # Arch.makeBuilding and makeSite build in the active document
    try:
        copies = []
        for el in elements:
            f = tmp.addObject("Part::Feature", el.Name)
            f.Label = el.Label
            s = el.Shape.copy()
            s.translate(App.Vector(offset_m[0] * MM, offset_m[1] * MM, offset_m[2] * MM))
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
    import ifcopenshell

    f = ifcopenshell.open(path)
    for s in f.by_type("IfcSite"):
        s.RefLatitude = dms(anchor["lat"])
        s.RefLongitude = dms(anchor["lng"])
        s.RefElevation = anchor["elevation_m"]
    f.write(path)


# ---------------------------------------------------------------- the button
def export_building(target, out_dir=None, name=None, anchor=None):
    """Write <name>.glb, <name>.ifc and <name>.json for a building into the exchange folder.
    Returns a report: the paths, the frame offset, and each element's volume in FreeCAD and
    in the GLB's own triangles."""
    targets = target if isinstance(target, (list, tuple)) else [target]
    doc = targets[0].Document
    elements = elements_of(targets)
    if not elements:
        raise ValueError("nothing to export: no visible solids under the selection")
    anchor = anchor or EXCHANGE_ANCHOR
    origin = document_origin(doc)
    offset = frame_offset(origin, anchor)
    label = name or (targets[0].Label if len(targets) == 1 else doc.Label)
    stem = file_stem(label)
    out_dir = out_dir or exchange_dir()
    os.makedirs(out_dir, exist_ok=True)
    glb, ifc, side = (os.path.join(out_dir, stem + ext) for ext in (".glb", ".ifc", ".json"))

    parts, rows = [], []
    for el in elements:
        bb = el.Shape.BoundBox
        tol = max(2.0, min(10.0, 0.001 * bb.DiagonalLength))  # mm; a thin shell needs it fine
        tri = tessellate(el, offset, tol)
        vol = el.Shape.Volume / 1e9
        extras = {"ifcType": str(getattr(el, "IfcType", "")), "freecadName": el.Name, "volume_m3": round(vol, 4)}
        parts.append((el.Label, tri, colour_of(el), extras))
        rows.append({"name": el.Label, "freecadName": el.Name, "ifcType": extras["ifcType"], "volume_m3": vol,
                     "mesh_volume_m3": mesh_volume(tri[0], tri[2]), "triangles": len(tri[2])})
    stamp = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    frame = {
        "doc": "exchange/godot/FORMAT.md",
        "origin": anchor,
        "units": "m",
        "glb_axes": "glTF Y-up: +X east, +Y up, +Z south",
        "ifc_axes": "+X east, +Y north, +Z up",
        "positioned": "at its real place on the site; not re-centred",
    }
    root_extras = {"frame": frame, "designedIn": {"origin": origin, "offsetToExchange_m": list(offset)},
                   "source": doc.FileName or doc.Label, "exported": stamp}
    write_glb(glb, parts, label, root_extras)
    write_ifc(ifc, elements, offset, anchor, label)
    report = {"name": label, "glb": glb, "ifc": ifc, "json": side, "frame": frame, "designedIn": root_extras["designedIn"],
              "source": root_extras["source"], "exported": stamp, "generator": "FreeCAD %s, Organic workbench" % ".".join(App.Version()[:3]),
              "elements": rows}
    with open(side, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
    return report
