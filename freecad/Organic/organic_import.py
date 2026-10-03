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
import os

import FreeCAD as App

import organic_export as ox
import organic_geom as og
import organic_objects as oo
from organic_points import STEP, along_map_points, map_points  # noqa: F401  (the map's own sampling of a curve through points)

MM = og.MM
FORMATS = ("built/1",)
# the pieces a built file may hold: the workbench's own classes, by their own names
TYPES = ("PlanCurve", "Wall", "Slab", "ShellRoof", "LeafShell", "Vault", "Dome", "Steps", "SoapFilm", "MinimalShell", "Conoid", "TranslationShell",
         "SacredFigure", "SacredSolid", "GeodesicDome", "Gridshell", "CellularWall", "BranchingColumn", "Revolved", "HeightFieldShell")
# A kind under another name: a step is a slab that is named a step; lane R's groined saddles are
# the saddle shell of that kind; the wave vault of the map's catalogue is a vault (FORMAT.md,
# "Lane R's shells and lattices as record kinds").
ALIASES = {"Step": "Slab", "GroinedSaddles": "MinimalShell", "WaveVault": "Vault"}
# what such a name says of the piece beyond its type, where its params do not say it themselves
PRESETS = {"GroinedSaddles": {"Kind": "Groined saddles"}, "WaveVault": {"Ribs": 0}}
LABELS = {"PlanCurve": "Plan curve", "Wall": "Curved wall", "Slab": "Floor slab", "ShellRoof": "Shell roof", "LeafShell": "Leaf shell roof",
          "Vault": "Ribbed vault", "Dome": "Dome", "Steps": "Steps", "SoapFilm": "Minimal surface", "MinimalShell": "Saddle shell", "SacredFigure": "Plan figure",
          "SacredSolid": "Regular solid", "GeodesicDome": "Geodesic dome", "Gridshell": "Gridshell", "CellularWall": "Cellular wall",
          "BranchingColumn": "Branching column", "Revolved": "Solid of revolution", "HeightFieldShell": "Height field shell",
          "Conoid": "Conoid roof", "TranslationShell": "Translation shell", "GroinedSaddles": "Groined saddles", "WaveVault": "Wave vault"}
# What the map writes on a piece for its own use, which says nothing the piece's other numbers do
# not say (FORMAT.md, "What the map adds"): the outline a leaf or a dome was fitted over, and how.
# The leaf's spine, span, ridge and place, the dome's radius, stretch and place are worked out
# from these by the map and stand in the record too; a vault on a curve takes its length from it.
# And "Supports": the posts and walls the map draws under a roof from its catalogue so that it
# stands at its height, drawing aids that are not part of the piece (a vault's walls are its Plinth).
PASSED_OVER = {"LeafShell": ("Base", "Overhang", "Rise"), "Dome": ("Base",), "Conoid": ("Supports",), "TranslationShell": ("Supports",), "Vault": ("Supports",),
               "MinimalShell": ("Supports",), "GeodesicDome": ("Supports",)}
# The forms of the map's catalogue that this workbench builds (lane R's pattern cards): on these
# the map writes "Figure", its own name for the form, which is the type itself. Any other piece
# with a Figure is one of the catalogue's forms that this workbench does not build (lane C's: a
# Merkaba, a torus knot; lane R's leaf on ribs, written by its own parameters): named, not made.
FIGURES = ("GeodesicDome", "Conoid", "TranslationShell", "GroinedSaddles", "WaveVault")
# lists of plain numbers that are metres (a list has no unit of its own)
METRE_LISTS = ("OpeningPositions", "OpeningWidths", "OpeningHeights", "OpeningSills", "RidgeHeights", "TopHeights", "Heights")


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
            elif kind == "App::PropertyLinkList":  # several pieces by their ids (the holes of a floor or of a roof)
                found = []
                for one in (value if isinstance(value, (list, tuple)) else [value]):
                    target = made.get(str(one))
                    if target is None:
                        notes.append("%s: %s names %r, which is not a piece made before it" % (where, name, one))
                    else:
                        found.append(target)
                setattr(obj, name, found)
            elif "ReadOnly" in obj.getEditorMode(name):
                continue  # something the object works out itself (a length, a measure): not set
            elif kind in ("App::PropertyLength", "App::PropertyDistance"):
                want = float(value) * scale * MM
                setattr(obj, name, want)
                got = getattr(obj, name).Value
                if abs(got - want) > 1e-6:  # FreeCAD keeps a length at nought or above (a slab's Inset of -0.1 became 0) and says nothing
                    notes.append("%s: %s cannot be %g m (a length here is never below nought): it is %g m" % (where, name, float(value), got / MM / scale))
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


def import_built(doc, source, join=True):
    """Rebuild a building from a built file (a path) or its contents (a dict) in doc.
    join: walls that end on each other are joined there (off only for a check's forged fault).
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
    # floors and roofs name a piece as their Base; laths name the shell they lie on, which may stand on a curve itself
    rank = lambda p: 2 if "Shell" in (p.get("params") or {}) else 1 if "Base" in (p.get("params") or {}) else 0  # noqa: E731
    order = sorted(pieces, key=rank)
    for i, piece in enumerate(order):
        asked = str(piece.get("type", ""))
        kind = ALIASES.get(asked, asked)
        key = str(piece.get("id", "%s-%d" % (asked or "piece", i + 1)))
        where = "%s %r" % (asked or "piece", key)
        left = sorted(k for k in piece if k not in ("id", "type", "name", "params", "placement", "ifc_type", "layer", "building", "land"))
        if left:
            notes.append("%s: not understood, left out: %s" % (where, ", ".join(left)))
        params = dict(piece.get("params") or {})
        figure = params.pop("Figure", None)
        if figure is not None and not (str(figure) == asked and asked in FIGURES):
            notes.append("%s: it is the form %r of the map's catalogue, which this workbench does not build, and was not made (of the catalogue's forms it builds: %s)"
                         % (where, str(figure), ", ".join(FIGURES)))
            continue
        if kind not in TYPES:
            notes.append("%s: this type is not known here and was not made (known: %s)" % (where, ", ".join(TYPES + tuple(sorted(ALIASES)))))
            continue
        cls = getattr(oo, kind)
        for name, value in PRESETS.get(asked, {}).items():
            params.setdefault(name, value)
        try:
            obj = oo.make(cls, kind, str(piece.get("name") or LABELS.get(asked) or LABELS[kind]), doc)
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
            if kind == "Vault":
                asked, waves = oo.m(obj.WaveAmplitude), int(obj.Waves)
                wave, _count = og.wave_of(str(obj.Profile), oo.m(obj.Rise), asked, waves)
                if obj.Ribs > 0 and (obj.Base is not None or wave > 0):
                    notes.append("%s: its %d ribs are left out (ribs are a plain straight vault's; this one %s)"
                                 % (where, obj.Ribs, "follows a curve" if obj.Base is not None else "is a wave vault"))
                # what the map draws too is said, and is not a loss
                if asked > 0 and waves >= 1 and str(obj.Profile) == "Semicircle":
                    notes.info("%s: a semicircle has one rise for its span: its wave of %.2f m is not there (nor is it on the map)" % (where, asked))
                elif wave > 0 and wave < asked - 1e-9:
                    notes.info("%s: its wave of %.2f m is taken as %.2f m: a trough keeps %.1f m of rise (as on the map)" % (where, asked, wave, og.WAVE_TROUGH_M))
                if str(obj.Profile) == "Segmental" and oo.m(obj.Rise) > oo.m(obj.Span) / 2 + 1e-9:
                    notes.info("%s: a segmental arch is at most a semicircle: its rise of %.2f m is taken as %.2f m (as on the map)" % (where, oo.m(obj.Rise), oo.m(obj.Span) / 2))
            if kind == "MinimalShell" and str(obj.Kind) == "Groined saddles" and obj.Lobes != 8:  # built as asked; what the map shows is said
                notes.info("%s: its %d lobes are built as asked; the map's own drawing of groined saddles shows eight, whatever Lobes says" % (where, obj.Lobes))
            based = next((getattr(obj, link) for link in ("Shell", "Base") if link in obj.PropertiesList and getattr(obj, link) is not None), None)
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
    # walls that end on each other are joined there, by the map's own rule (the old editor's): a corner is whole, a
    # wall that ends on another stops at its face
    meet = oo.join_walls(list(made.values())) if join else 0
    doc.recompute()
    # said of the solids as they now are: a wall with a shaped top on a smooth curve keeps square ends
    joined = sum(int(getattr(obj.Proxy, "ends_joined", 0)) for obj in made.values() if type(obj.Proxy).__name__ == "Wall")
    ends = lambda n: "1 wall end meets other walls and is" if n == 1 else "%d wall ends meet other walls and are" % n  # noqa: E731
    if joined:
        notes.info("%s joined there, as the map joins them" % ends(joined))
    if meet > joined:
        notes.info("%s left square, where the map joins them: a wall with a shaped top on a smooth curve has no joined end, nor has a wall shorter than its "
                   "corners reach" % ends(meet - joined))
    for key, obj in made.items():
        shape = obj.Shape
        kind = type(obj.Proxy).__name__
        solid = kind not in ("PlanCurve", "SacredFigure")
        if "Invalid" in obj.State or shape.isNull() or (solid and (not shape.Solids or not shape.isValid())):
            why = refusal(obj)
            notes.append("%s %r (%s): it could not be built from these numbers%s" % (kind, key, obj.Label, ": " + why if why else ""))
            continue
        for row in getattr(obj.Proxy, "ends_turned", None) or []:  # a vault too wide for the turn its curve makes at an end
            notes.info("%s %r (%s): at its %s its curve turns on a radius of %.2f m over %.2f m, and the vault reaches %.2f m to either side of it: its sections there "
                       "are turned up to %.1f° off square to the curve, so that its inner edge keeps running forward and does not fold over itself (the map draws them square)"
                       % (kind, key, obj.Label, row["end"], row["radius_m"], row["length_m"], row["reach_m"], row["angle_deg"]))
    return {"building": b, "made": made, "notes": list(notes), "lost": notes.lost(), "name": name, "format": fmt, "path": path, "scale": scale}


def refusal(obj):
    """Why an object could not be built: the words its own making refused it with, as FreeCAD
    keeps them on the object ("" when it keeps none)."""
    try:
        said = str(obj.getStatusString())
    except Exception:
        return ""
    return "" if said in ("", "Valid", "Touched", "Invalid", "Error") else said
