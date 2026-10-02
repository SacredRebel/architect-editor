# -*- coding: utf-8 -*-
"""Organic: rebuild a building that was drawn in the map.

The map's build mode keeps a drawn building as parameters, not as a mesh: each piece is
{type, params}, the type one of this workbench's own objects (PlanCurve, Wall, Slab, ...) and
the params that object's own properties by their own names, in metres and degrees. A building
saved that way is one file, exchange\\godot\\built\\<name>.json, format "built/1" (the contract:
exchange\\godot\\FORMAT.md, "What Johny builds in the map").

This module reads such a file and makes the same pieces out of the same objects the toolbar's
buttons make: a property in the file is that property in FreeCAD, set to the same number. So
what was drawn in the map is real solids here, and gives plans.

The frame of a built file is the building's own: x east, y north, z up, metres, before the
building is turned. Where the building stands is its "placement", in the words of a building
sent to the map (coordinates [lng, lat], altitude_m above the 425.63 m datum, rotation_deg.y
anticlockwise) with the map's own "scale" (one number: every length times it).

Nothing is dropped in silence: a type or a parameter this module does not know is named in
the notes it returns, and the building is still made from what it does know.
"""

import json
import math
import os

import FreeCAD as App

import organic_export as ox
import organic_geom as og
import organic_objects as oo

MM = og.MM
FORMATS = ("built/1",)
# the pieces a built file may hold: the workbench's own classes, by their own names
TYPES = ("PlanCurve", "Wall", "Slab", "ShellRoof", "LeafShell", "Vault", "Dome", "Steps", "SoapFilm", "MinimalShell",
         "SacredFigure", "SacredSolid", "GeodesicDome", "Gridshell", "CellularWall", "BranchingColumn")
ALIASES = {"Step": "Slab"}  # a step is a slab that is named a step
LABELS = {"PlanCurve": "Plan curve", "Wall": "Curved wall", "Slab": "Floor slab", "ShellRoof": "Shell roof", "LeafShell": "Leaf shell roof",
          "Vault": "Ribbed vault", "Dome": "Dome", "Steps": "Steps", "SoapFilm": "Minimal surface", "MinimalShell": "Saddle shell", "SacredFigure": "Plan figure",
          "SacredSolid": "Regular solid", "GeodesicDome": "Geodesic dome", "Gridshell": "Gridshell", "CellularWall": "Cellular wall",
          "BranchingColumn": "Branching column"}
# What the map writes on a piece for its own use, which says nothing the piece's other numbers do
# not say (FORMAT.md, "What the map adds"): the outline a leaf or a dome was fitted over, and how.
# The leaf's spine, span, ridge and place, the dome's radius, stretch and place are worked out
# from these by the map and stand in the record too; a vault on a curve takes its length from it.
PASSED_OVER = {"LeafShell": ("Base", "Overhang", "Rise"), "Dome": ("Base",)}
# lists of plain numbers that are metres (a list has no unit of its own)
METRE_LISTS = ("OpeningPositions", "OpeningWidths", "OpeningHeights", "OpeningSills", "RidgeHeights")
STEP = 0.2  # metres: the map draws a curve as points no further apart than this, and measures along them


def built_dir():
    """Where the map saves what was built in it."""
    return os.path.join(ox.exchange_dir(), "built")


class Notes(list):
    """What is said about a built file while it is read. Most of it is something of the file
    that is not in the building (not understood, left out, could not be built): lost(). The
    rest is only worth knowing (the map's scale, a file that states no place): info()."""

    def __init__(self):
        super().__init__()
        self.known = []

    def info(self, text):
        self.known.append(text)
        self.append(text)

    def lost(self):
        return [n for n in self if n not in self.known]


# ---------------------------------------------------------------- where it stands
def building_placement(doc, placement, notes):
    """(a built file's placement as a FreeCAD placement in the document's own frame, its scale)."""
    if not placement:
        (notes.info if hasattr(notes, "info") else notes.append)("the file states no placement: the building is made at the document's origin")
        return App.Placement(), 1.0
    known = {"coordinates", "altitude_m", "elevation_m", "rotation_deg", "offset_m", "scale", "anchor", "datum_m", "metres_per_degree"}
    left = sorted(k for k in placement if k not in known)
    if left:
        notes.append("placement: not understood, left out: %s" % ", ".join(left))
    origin = ox.document_origin(doc)
    kx, ky = ox.METRES_PER_DEG
    datum = float(placement.get("datum_m", ox.ANCHOR["elevation_m"]))
    if placement.get("coordinates") is not None:
        lng, lat = float(placement["coordinates"][0]), float(placement["coordinates"][1])
        east, north = (lng - origin["lng"]) * kx, (lat - origin["lat"]) * ky
    elif placement.get("offset_m"):
        shift = ox.frame_offset(origin)  # the document's own origin against the anchor
        east, north = float(placement["offset_m"].get("east", 0.0)) - shift[0], float(placement["offset_m"].get("north", 0.0)) - shift[1]
    else:
        east = north = 0.0
        notes.append("placement: neither coordinates nor offset_m: the building is made at the document's origin")
    if placement.get("altitude_m") is not None:
        up = float(placement["altitude_m"]) + datum - origin["elevation_m"]
    elif placement.get("elevation_m") is not None:
        up = float(placement["elevation_m"]) - origin["elevation_m"]
    else:
        up = 0.0
    turn = placement.get("rotation_deg") or {}
    yaw = float(turn.get("y", 0.0)) if isinstance(turn, dict) else float(turn)
    if isinstance(turn, dict) and (abs(float(turn.get("x", 0.0))) > 1e-9 or abs(float(turn.get("z", 0.0))) > 1e-9):
        notes.append("placement: a building is turned about the vertical only; rotation_deg.x and .z are left out")
    scale = float(placement.get("scale", 1.0) or 1.0)
    return App.Placement(App.Vector(east * MM, north * MM, up * MM), App.Rotation(og.Z, yaw)), scale


# ---------------------------------------------------------------- one piece
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


def set_params(obj, params, made, scale, notes, where):
    """Set an object's properties from a piece's params: the same names, metres into lengths,
    names into choices, a piece's id into a link. What is not a property of the object is named."""
    for name, value in params.items():
        if name in PASSED_OVER.get(type(obj.Proxy).__name__, ()):
            continue
        if name not in obj.PropertiesList:
            notes.append("%s: %s is not a property of a %s; left out" % (where, name, type(obj.Proxy).__name__))
            continue
        kind = obj.getTypeIdOfProperty(name)
        try:
            if kind == "App::PropertyLink":
                if value in (None, ""):  # the map writes an empty Base on a piece that stands on no curve
                    continue
                target = made.get(str(value))
                if target is None:
                    notes.append("%s: %s names %r, which is not a piece made before it" % (where, name, value))
                else:
                    setattr(obj, name, target)
            elif "ReadOnly" in obj.getEditorMode(name):
                continue  # something the object works out itself (a length, a measure): not set
            elif kind in ("App::PropertyLength", "App::PropertyDistance"):
                setattr(obj, name, float(value) * scale * MM)
            elif kind == "App::PropertyEnumeration":
                options = obj.getEnumerationsOfProperty(name)
                match = next((o for o in options if o.lower() == str(value).strip().lower()), None)
                if match is None:
                    notes.append("%s: %s %r is not one of %s; %s is kept" % (where, name, value, ", ".join(options), getattr(obj, name)))
                else:
                    setattr(obj, name, match)
            elif kind == "App::PropertyVectorList":
                setattr(obj, name, [App.Vector(float(p[0]) * scale * MM, float(p[1]) * scale * MM, (float(p[2]) if len(p) > 2 else 0.0) * scale * MM) for p in value])
            elif kind in ("App::PropertyPosition", "App::PropertyVector"):  # a point [x, y, z] in metres
                setattr(obj, name, App.Vector(float(value[0]) * scale * MM, float(value[1]) * scale * MM, (float(value[2]) if len(value) > 2 else 0.0) * scale * MM))
            elif kind == "App::PropertyFloatList":
                k = scale if name in METRE_LISTS else 1.0
                setattr(obj, name, [float(v) * k for v in value])
            elif kind == "App::PropertyStringList":
                setattr(obj, name, [str(v) for v in value])
            elif kind == "App::PropertyInteger":
                setattr(obj, name, int(round(float(value))))
            elif kind == "App::PropertyBool":
                setattr(obj, name, bool(value))
            elif kind in ("App::PropertyFloat", "App::PropertyAngle"):
                setattr(obj, name, float(value))
            elif kind == "App::PropertyString":
                setattr(obj, name, str(value))
            else:
                notes.append("%s: %s is a %s, which a built file cannot set; left out" % (where, name, kind))
        except (TypeError, ValueError, IndexError) as exc:
            notes.append("%s: %s could not be set to %r (%s)" % (where, name, value, exc))


def piece_placement(building, placement, scale, notes, where):
    """A piece's own place in its building: x east, y north, z up (metres), and its turn in
    degrees anticlockwise (the map writes "turn"; "rot" is read as the same)."""
    placement = placement or {}
    left = sorted(k for k in placement if k not in ("x", "y", "z", "turn", "rot"))
    if left:
        notes.append("%s: placement: not understood, left out: %s" % (where, ", ".join(left)))
    local = App.Placement(App.Vector(float(placement.get("x", 0.0)) * scale * MM, float(placement.get("y", 0.0)) * scale * MM, float(placement.get("z", 0.0)) * scale * MM),
                          App.Rotation(og.Z, float(placement.get("turn", placement.get("rot", 0.0)))))
    return building.Placement.multiply(local)


def make_building(doc, label):
    """A BIM building on the document's site (made on the anchor frame when there is none)."""
    import Arch

    App.setActiveDocument(doc.Name)  # Arch builds in the active document, whichever one it is given
    site = next((o for o in doc.Objects if hasattr(o, "Longitude") and hasattr(o, "Latitude") and o.Name.startswith("Site")), None)
    if site is None:
        site = Arch.makeSite([], name="Site")
        site.Label = "Site (anchor frame)"
        site.Longitude, site.Latitude = ox.ANCHOR["lng"], ox.ANCHOR["lat"]
        site.Elevation = ox.ANCHOR["elevation_m"] * MM
        site.Declination = 0.0
    b = Arch.makeBuilding([], name="OrganicBuilding")
    b.Label = label
    site.addObject(b)
    return b


def import_built(doc, source):
    """Rebuild a building from a built file (a path) or its contents (a dict) in doc.
    Returns {"building", "made": {id: object}, "notes": [str], "lost": [str], "name", "format",
    "path", "scale"}: notes is everything said, lost the part of it that names something of the
    file which is not in the building."""
    path = None
    if isinstance(source, dict):
        data = source
    else:
        path = os.path.abspath(source)
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    notes = Notes()
    fmt = str(data.get("format", ""))
    if fmt not in FORMATS:
        notes.append("the file says format %r; this reads %s: taken as that" % (fmt, ", ".join(FORMATS)))
    known = {"format", "id", "name", "saved", "generator", "community", "actor", "units", "placement", "pieces", "land"}
    left = sorted(k for k in data if k not in known)
    if left:
        notes.append("the file: not understood, left out: %s" % ", ".join(left))
    if str(data.get("units", "m")).lower() not in ("m", "metre", "metres", "meter", "meters"):
        notes.append("the file states units %r; a built file is in metres and is read as metres" % data.get("units"))
    name = str(data.get("name") or (os.path.splitext(os.path.basename(path))[0] if path else "Building from the map"))
    b = make_building(doc, name)
    b.Placement, scale = building_placement(doc, data.get("placement"), notes)
    if abs(scale - 1.0) > 1e-9:
        notes.info("the map shows this building at %g times its numbers: every length here is its number times %g" % (scale, scale))
    for prop, value in (("MapFile", path or ""), ("MapFormat", fmt), ("MapId", str(data.get("id", ""))), ("MapSaved", str(data.get("saved", ""))),
                        ("MapLand", json.dumps(data["land"], sort_keys=True) if data.get("land") is not None else "")):
        if prop not in b.PropertiesList:
            b.addProperty("App::PropertyString", prop, "From the map", "the built file this building was made from")
        setattr(b, prop, value)

    made, drawn = {}, {}
    pieces = data.get("pieces", []) or []
    # what stands on nothing first (curves, figures, domes), whatever the order in the file: walls,
    # floors and roofs name a piece as their Base
    order = [p for p in pieces if "Base" not in (p.get("params") or {})] + [p for p in pieces if "Base" in (p.get("params") or {})]
    for i, piece in enumerate(order):
        asked = str(piece.get("type", ""))
        kind = ALIASES.get(asked, asked)
        key = str(piece.get("id", "%s-%d" % (asked or "piece", i + 1)))
        where = "%s %r" % (asked or "piece", key)
        left = sorted(k for k in piece if k not in ("id", "type", "name", "params", "placement", "ifc_type", "layer", "building", "land"))
        if left:
            notes.append("%s: not understood, left out: %s" % (where, ", ".join(left)))
        if kind not in TYPES:
            notes.append("%s: this type is not known here and was not made (known: %s)" % (where, ", ".join(TYPES)))
            continue
        cls = getattr(oo, kind)
        params = dict(piece.get("params") or {})
        try:
            obj = oo.make(cls, kind, str(piece.get("name") or LABELS[kind]), doc)
            obj.addProperty("App::PropertyString", "MapPiece", "From the map", "the id of this piece in the built file it was made from")
            obj.MapPiece = key  # carried into what is sent back, so the map can hold each solid against the piece it drew
            if piece.get("land") is not None:  # what the map read of the land at this piece: kept as it is, for the record
                obj.addProperty("App::PropertyString", "MapLand", "From the map", "what the map read of the land where this piece stands (as written in the built file)")
                obj.MapLand = json.dumps(piece["land"], sort_keys=True)
            if kind == "PlanCurve" and "Points" in params and "Kind" not in params:
                params["Kind"] = "Points"
            set_params(obj, params, made, scale, notes, where)
            if kind == "PlanCurve" and str(obj.Kind) == "Points" and abs(oo.m(obj.Inset)) > 1e-9:
                notes.append("%s: Inset %.3f m on a curve through points is left out (its points say where it lies)" % (where, oo.m(obj.Inset)))
            if kind == "Vault" and obj.Base is not None and obj.Ribs > 0:
                notes.append("%s: its %d ribs are left out (ribs are a straight vault's; this one follows a curve)" % (where, obj.Ribs))
            based = getattr(obj, "Base", None) if "Base" in obj.PropertiesList else None
            if based is not None and piece.get("placement"):
                notes.append("%s: it stands on %s, which says where it lies; its own placement is left out" % (where, based.Label))
            obj.Placement = b.Placement if based is not None else piece_placement(b, piece.get("placement"), scale, notes, where)
            b.addObject(obj)
            if piece.get("ifc_type") and "IfcType" in obj.PropertiesList and str(piece["ifc_type"]) in oo.IFC_TYPES and str(piece["ifc_type"]) != obj.IfcType:
                obj.IfcType = str(piece["ifc_type"])
                oo.paint(obj)
        except Exception as exc:
            notes.append("%s: could not be made (%s)" % (where, exc))
            continue
        if key in made:
            notes.append("%s: this id is used twice; the later piece keeps it" % where)
        made[key] = obj
        if kind == "PlanCurve" and str(obj.Kind) == "Points" and obj.Smooth:
            drawn[obj.Name] = (map_points((params.get("Points") or []), bool(params.get("Closed", False))), bool(params.get("Closed", False)))
    doc.recompute()

    # a curve that something stands on is hidden, as the buttons leave it; an opening on a smooth
    # curve through points is set where the map measured it (along the map's own points)
    for key, obj in made.items():
        kind = type(obj.Proxy).__name__
        base = getattr(obj, "Base", None) if "Base" in obj.PropertiesList else None
        if base is not None and App.GuiUp and base.ViewObject is not None:
            base.ViewObject.Visibility = False
        if kind in ("Wall", "CellularWall") and base is not None and base.Name in drawn and getattr(obj, "OpeningPositions", None):
            pts, closed = drawn[base.Name]
            edge, _closed = oo.base_edge(obj, corners=True)
            origin = obj.Placement.inverse().multiply(base.Placement)  # the curve's own frame in the wall's
            moved = []
            for s in obj.OpeningPositions:
                x, y = along_map_points(pts, closed, s / scale)
                moved.append(og.arc_length_at(edge, origin.multVec(App.Vector(x * scale * MM, y * scale * MM, 0.0))))
            obj.OpeningPositions = moved
    doc.recompute()
    for key, obj in made.items():
        shape = obj.Shape
        solid = type(obj.Proxy).__name__ not in ("PlanCurve", "SacredFigure")
        if "Invalid" in obj.State or shape.isNull() or (solid and (not shape.Solids or not shape.isValid())):
            notes.append("%s %r (%s): it could not be built from these numbers" % (type(obj.Proxy).__name__, key, obj.Label))
    return {"building": b, "made": made, "notes": list(notes), "lost": notes.lost(), "name": name, "format": fmt, "path": path, "scale": scale}
