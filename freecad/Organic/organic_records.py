# -*- coding: utf-8 -*-
"""Organic: a building's records written back from its FreeCAD objects — the other way round from
organic_import.import_built ("Import from the map"), for the round trip map -> FreeCAD -> map.

import_built sets each piece's params on the object's property of the same name (metres into
lengths, ids into links). records_of reads the same names back the same way: lengths into metres
(divided by the map's scale, as the import multiplied), a link as the id of the piece it names, an
opening on a smooth curve through points where the map measures it (along the map's own points of
the curve, organic_points.foot_on_map_points: the import's along_map_points the other way round).

What FreeCAD does not hold is written as the map gave it: a field the object has no property for,
one it works out itself (read only), one the import passes over (organic_import.PASSED_OVER), a
catalogue Figure, and the building's own placement (FreeCAD does not move a building here).

A number FreeCAD holds within SAME_M (lengths, metres) or within a part in a billion (any other
number) of the one it was given is written as it was given: the trip's own noise is not an edit.
The map's measure of an opening and FreeCAD's measure along the exact curve differ by the map's
0.2 m sampling (well under SAME_M on the map's curves); what is further off than that is an edit
and is written as FreeCAD has it.
"""

import json
import math

import FreeCAD as App

import organic_geom as og
import organic_import as oi
import organic_objects as oo
from organic_points import foot_on_map_points, map_points

MM = og.MM
SAME_M = 0.0005  # metres: a length or a place back within this of the one given is the one given
SAME_REL = 1e-9  # any other number: within this part of itself


def _same(old, new, length):
    """Whether a number came back as it went: within SAME_M (a length) or SAME_REL of itself."""
    if isinstance(old, bool) or isinstance(new, bool) or not isinstance(old, (int, float)) or not isinstance(new, (int, float)):
        return old == new
    return abs(new - old) <= (SAME_M if length else SAME_REL * max(1.0, abs(old)))


WORST = {"m": 0.0, "where": ""}  # the furthest a length came back from the one given, while still the one given (measured, then kept)


def _kept(old, new, length, where=""):
    """new, unless it is old come back (then old, as it was written): numbers, and lists of numbers or of points."""
    if isinstance(old, list) and isinstance(new, list) and len(old) == len(new):
        out = [_kept(a, b, length, where) for a, b in zip(old, new)]
        return old if all(a is o for a, o in zip(out, old)) else out
    if _same(old, new, length):
        if length and isinstance(old, (int, float)) and not isinstance(old, bool) and abs(new - old) > WORST["m"]:
            WORST.update(m=abs(new - old), where=where)
        return old
    return new


def _value(obj, name, old, scale, made_ids):
    """The value of one property, as a record writes it (the inverse of organic_import.set_params), and whether it is
    a length. None when FreeCAD holds nothing of it (the record's own value is kept then)."""
    kind = obj.getTypeIdOfProperty(name)
    value = getattr(obj, name)
    if kind == "App::PropertyLink":
        return (made_ids.get(value.Name, "") if value is not None else ""), False
    if kind == "App::PropertyLinkList":
        return [made_ids.get(v.Name, v.Label) for v in value], False
    if kind in ("App::PropertyLength", "App::PropertyDistance"):
        return value.Value / MM / scale, True
    if kind == "App::PropertyEnumeration":
        return str(value), False
    if kind == "App::PropertyVectorList":
        width = len(old[0]) if isinstance(old, list) and old and isinstance(old[0], list) else 2
        return [[p.x / MM / scale, p.y / MM / scale, p.z / MM / scale][:max(2, width)] for p in value], True
    if kind in ("App::PropertyPosition", "App::PropertyVector"):
        width = len(old) if isinstance(old, list) else 3
        return [value.x / MM / scale, value.y / MM / scale, value.z / MM / scale][:max(2, width)], True
    if kind == "App::PropertyFloatList":
        k = scale if name in oi.METRE_LISTS else 1.0
        return [float(v) / k for v in value], name in oi.METRE_LISTS
    if kind == "App::PropertyStringList":
        return [str(v) for v in value], False
    if kind == "App::PropertyInteger":
        return int(value), False
    if kind == "App::PropertyBool":
        return bool(value), False
    if kind == "App::PropertyAngle":
        return float(getattr(value, "Value", value)), False
    if kind == "App::PropertyFloat":
        return float(value), False
    if kind == "App::PropertyString":
        return str(value), False
    return None, False


def _map_positions(obj, positions_m, scale):
    """A wall's openings on a smooth curve through points, from FreeCAD's measure (metres along its base edge, the
    map's scale in them) back to the map's (metres along the map's own points of the curve, without the scale): the
    import's conversion the other way round."""
    base = obj.Base
    closed = bool(base.Closed)
    pts = map_points([[p.x / MM / scale, p.y / MM / scale] for p in base.Points], closed)
    edge, _closed = oo.base_edge(obj, corners=True)
    if not hasattr(edge, "getParameterByLength"):  # a curve with corners: the import measured it as the map does
        return [s / scale for s in positions_m]
    back = base.Placement.inverse().multiply(obj.Placement)  # the wall's own frame -> the curve's
    out = []
    for s in positions_m:
        d = s * MM
        d = d % edge.Length if closed else max(0.0, min(edge.Length, d))
        p = back.multVec(edge.valueAt(edge.getParameterByLength(d)))
        at, _off, _total = foot_on_map_points(pts, closed, (p.x / MM / scale, p.y / MM / scale))
        out.append(at)
    return out


def records_of(result, source):
    """The built file (format built/1) that a building's FreeCAD objects say now. result: what import_built returned
    (its building, made, scale); source: the built file it was made from (a dict). Returns (the records, notes):
    each piece of source with its id, type, name and ifc_type as given, its params read back from its object, its
    placement read back where it has one of its own; notes say what was written from FreeCAD and differs from what
    went in (the edits), and any piece of the source FreeCAD did not make, or object it made that no piece names."""
    building, made, scale = result["building"], result["made"], float(result.get("scale", 1.0) or 1.0)
    made_ids = {obj.Name: key for key, obj in made.items()}
    notes = []
    pieces = []
    for piece in source.get("pieces", []) or []:
        key = str(piece.get("id", ""))
        obj = made.get(key)
        rec = json.loads(json.dumps(piece))
        if obj is None:
            notes.append("%s %r: not made in FreeCAD; written back as it went" % (piece.get("type", "piece"), key))
            pieces.append(rec)
            continue
        cls = type(obj.Proxy).__name__
        params = rec.get("params") or {}
        for name, old in list(params.items()):
            if name == "Figure" or name in oi.PASSED_OVER.get(cls, ()) or name not in obj.PropertiesList or "ReadOnly" in obj.getEditorMode(name):
                continue  # FreeCAD holds nothing of it: as the map gave it
            new, length = _value(obj, name, old, scale, made_ids)
            if new is None:
                continue
            if name == "OpeningPositions" and cls in ("Wall", "CellularWall") and getattr(obj, "Base", None) is not None \
                    and type(obj.Base.Proxy).__name__ == "PlanCurve" and str(obj.Base.Kind) == "Points" and obj.Base.Smooth:
                new = _map_positions(obj, list(obj.OpeningPositions), scale)
            kept = _kept(old, new, length, "%s %s" % (key, name))
            if kept is not old:
                notes.append("%s %r: %s %s in FreeCAD (was %s)" % (piece.get("type", cls), key, name, json.dumps(kept)[:120], json.dumps(old)[:120]))
            params[name] = kept
        if piece.get("placement") and not any(link in obj.PropertiesList and getattr(obj, link) is not None for link in ("Shell", "Base")):
            local = building.Placement.inverse().multiply(obj.Placement)
            said = {"x": local.Base.x / MM / scale, "y": local.Base.y / MM / scale, "z": local.Base.z / MM / scale,
                    "turn": math.degrees(math.atan2(local.Rotation.multVec(App.Vector(1, 0, 0)).y, local.Rotation.multVec(App.Vector(1, 0, 0)).x))}
            for k, old in list(rec["placement"].items()):
                word = "turn" if k in ("turn", "rot") else k
                if word in said:
                    kept = old if _same(old, said[word], word != "turn") or (word == "turn" and abs((said[word] - old + 180.0) % 360.0 - 180.0) <= 1e-6) else said[word]
                    if kept is not old:
                        notes.append("%s %r: placement %s %s in FreeCAD (was %s)" % (piece.get("type", cls), key, k, kept, old))
                    rec["placement"][k] = kept
        pieces.append(rec)
    named = set(made)
    for o in building.Group if hasattr(building, "Group") else []:
        if getattr(o, "MapPiece", "") and str(o.MapPiece) not in named:
            notes.append("%s (%s): an object of this building that no piece of the file names; not written" % (o.Label, o.Name))
    out = dict(json.loads(json.dumps({k: v for k, v in source.items() if k != "pieces"})), pieces=pieces)
    return out, notes
