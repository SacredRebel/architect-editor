# -*- coding: utf-8 -*-
"""roundtrip — a map save taken through FreeCAD and back: the map's save -> its drawn buildings' records ->
FreeCAD's objects (the import realize.py and "Import from the map" use) -> records again, read back from those
objects (Organic\\organic_records.py) -> the same save with each piece's numbers as FreeCAD holds them.

    "<FreeCAD>\\bin\\freecadcmd.exe" "<this repository>\\freecad\\roundtrip.py"

ROUNDTRIP_SAVE   the save to take (edits/2; work on a scratch copy: this script never writes it)
ROUNDTRIP_OUT    a folder of this run's own: <building id>.json (the records sent), <building id>.FCStd (FreeCAD's
                 design), <building id>.back.json (the records read back), edits.<…>.geojson (the save that comes
                 back: written with the save's own file name) and roundtrip.json (the counts)
ROUNDTRIP_EDIT   optional, a change made in FreeCAD before the records are read back, to see it come back:
                 "<piece id>:<property>=<number in metres or plain>[;…]"

A drawn building's records are made from the save as the map's own export makes them (godot\\scripts\\built.gd,
records(): format built/1, the building's place, turn and scale; each piece's id, type, name, ifc_type, params and
its own placement; the map's own kinds and fields left out). The save that comes back is the save as it was, with
each piece's params and placement as FreeCAD holds them; every field FreeCAD was not given is the save's own. The
counts say what went and what came back at each step; the process ends with 0 when every piece came back and
nothing changed that FreeCAD was not asked to change.
"""

import copy
import json
import os
import sys
import time
import traceback

import FreeCAD as App

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Playground\Architect-editor\freecad"
if os.path.join(HERE, "Organic") not in sys.path:
    sys.path.insert(0, os.path.join(HERE, "Organic"))
import organic_import as oi  # noqa: E402
import organic_records as orec  # noqa: E402

OUT = sys.stdout
# what the map's export leaves out of a built file (built.gd: the types that are the map's own, and MAP_ONLY)
MAP_OWN_TYPES = ("Pad", "Surface", "Dimension", "Label")
MAP_ONLY = {"LeafShell": ["Base", "Overhang", "Rise"], "Dome": ["Base"], "Steps": ["OnLand"], "Wall": ["OpeningSwings"]}


def say(text):
    OUT.write(text + "\n")
    OUT.flush()


def built_from_save(save, model):
    """The built/1 records of one drawn building of a save, as the map's export (built.gd records()) writes them."""
    props = model["properties"]
    bid = str(props.get("id", ""))
    pieces = []
    for feat in save.get("features", []):
        p = feat.get("properties", {})
        if p.get("layer") != "pieces" or str(p.get("building", "")) != bid:
            continue
        kind = str(p.get("type", ""))
        if kind in MAP_OWN_TYPES:
            continue
        params = copy.deepcopy(p.get("params") or {})
        for field in MAP_ONLY.get(kind, []):
            params.pop(field, None)
        if str(params.get("Base", "x")) == "":
            params.pop("Base")
        if kind == "PlanCurve":
            if str(params.get("Kind", "")) != "Arc":
                params.pop("Angle", None)
            if str(params.get("Kind", "")) != "Points":
                params.pop("Smooth", None)
        if kind == "Wall":
            if str(params.get("WallKind", "")) == "":
                params.pop("WallKind", None)
            if not any(str(k) != "" for k in params.get("OpeningKinds", []) or []):
                params.pop("OpeningKinds", None)
            if not params.get("TopHeights"):
                params.pop("TopHeights", None)
        if kind == "SacredFigure" and "Kind" in params:
            params["Root"] = str(int(float(params.get("Root", 2))))
        if kind == "Vault" and (float(params.get("WaveAmplitude", 0.0)) <= 0.0 or int(params.get("Waves", 0)) < 1):
            params.pop("WaveAmplitude", None)
            params.pop("Waves", None)
        rec = {"id": str(p.get("id")), "type": kind, "name": str(p.get("name", "")), "ifc_type": str(p.get("ifc_type", "")), "params": params}
        if p.get("placement") and "Base" not in params:
            rec["placement"] = copy.deepcopy(p["placement"])
        pieces.append(rec)
    turn = props.get("rotation_deg", {"x": 0.0, "y": 0.0, "z": 0.0})
    return {"format": "built/1", "id": bid, "name": str(props.get("name", bid)), "saved": str(save.get("saved", "")),
            "generator": "roundtrip.py from the map's save", "community": str(save.get("community", "")), "units": "m",
            "placement": {"coordinates": list(model["geometry"]["coordinates"]), "altitude_m": float(props.get("altitude_m", 0.0)),
                          "rotation_deg": turn if isinstance(turn, dict) else {"x": 0.0, "y": float(turn), "z": 0.0}, "scale": float(props.get("scale", 1.0))},
            "pieces": pieces}


def edit(result, words, notes):
    """A change made in FreeCAD before the records are read back: "<piece id>:<property>=<value>[;…]"."""
    for one in [w for w in (words or "").split(";") if w.strip()]:
        key, change = one.split(":", 1)
        name, value = change.split("=", 1)
        obj = result["made"].get(key.strip())
        if obj is None:
            notes.append("edit %r: no piece %s" % (one, key))
            continue
        name = name.strip()
        kind = obj.getTypeIdOfProperty(name)
        if kind in ("App::PropertyLength", "App::PropertyDistance"):
            setattr(obj, name, float(value) * result["scale"] * oi.MM)
        else:
            setattr(obj, name, type(getattr(obj, name))(value))
        notes.append("edited in FreeCAD: %s %s = %s" % (key, name, value))
    obj_doc = next(iter(result["made"].values())).Document if result["made"] else None
    if obj_doc is not None:
        obj_doc.recompute()


def run():
    t0 = time.time()
    save_path, out = os.environ.get("ROUNDTRIP_SAVE", ""), os.environ.get("ROUNDTRIP_OUT", "")
    if not save_path or not out:
        say("roundtrip: give ROUNDTRIP_SAVE (a scratch copy of a map save) and ROUNDTRIP_OUT (a folder of this run's own)")
        return False
    os.makedirs(out, exist_ok=True)
    if os.path.normcase(os.path.abspath(os.path.dirname(save_path))) == os.path.normcase(os.path.abspath(out)):
        say("roundtrip: the out folder is the save's own folder; give a folder of this run's own")
        return False
    save = json.load(open(save_path, encoding="utf-8"))
    back_save = copy.deepcopy(save)
    feats = save.get("features", [])
    counts = {"save": save_path, "features": len(feats), "by_layer": {}, "buildings": []}
    for f in feats:
        layer = str(f.get("properties", {}).get("layer", ""))
        counts["by_layer"][layer] = counts["by_layer"].get(layer, 0) + 1
    ok = True
    for model in [f for f in feats if f.get("properties", {}).get("layer") == "models" and f["properties"].get("drawn")]:
        bid = str(model["properties"]["id"])
        records = built_from_save(save, model)
        rec_path = os.path.join(out, bid + ".json")
        json.dump(records, open(rec_path, "w", encoding="utf-8"), indent=2)
        doc = App.newDocument("RoundTrip")
        notes = []
        try:
            result = oi.import_built(doc, rec_path)
            edit(result, os.environ.get("ROUNDTRIP_EDIT", ""), notes)
            design = os.path.join(out, bid + ".FCStd")
            doc.saveAs(design)
            solids = sum(1 for o in result["made"].values() if type(o.Proxy).__name__ not in ("PlanCurve", "SacredFigure") and o.Shape.Solids)
            orec.WORST.update(m=0.0, where="")
            back, said = orec.records_of(result, records)
            worst = dict(orec.WORST)
            json.dump(back, open(os.path.join(out, bid + ".back.json"), "w", encoding="utf-8"), indent=2)
        finally:
            App.closeDocument(doc.Name)
        by_id = {p["id"]: p for p in back["pieces"]}
        in_save = [f for f in back_save["features"] if f.get("properties", {}).get("layer") == "pieces" and str(f["properties"].get("building", "")) == bid]
        changed = []
        for feat in in_save:
            p = feat["properties"]
            rec = by_id.get(str(p.get("id")))
            if rec is None:
                continue  # a piece of the map's own kind: not sent, kept as it was
            for name, value in (rec.get("params") or {}).items():
                if (p.get("params") or {}).get(name) != value:
                    changed.append("%s %s: %s -> %s" % (p.get("id"), name, json.dumps((p.get("params") or {}).get(name))[:80], json.dumps(value)[:80]))
                p.setdefault("params", {})[name] = value
            if rec.get("placement") is not None and p.get("placement") is not None:
                for k, v in rec["placement"].items():
                    if p["placement"].get(k) != v:
                        changed.append("%s placement %s: %s -> %s" % (p.get("id"), k, p["placement"].get(k), v))
                    p["placement"][k] = v
        row = {"building": bid, "pieces_in_save": model["properties"].get("pieces"), "pieces_layer": len(in_save), "records_sent": len(records["pieces"]),
               "made_in_freecad": len(result["made"]), "solids": solids, "records_back": len(back["pieces"]), "lost_on_the_way_in": result["lost"],
               "said_coming_back": said, "edits_asked_in_freecad": notes, "changed_in_the_save": changed,
               "unchanged_lengths_came_back_within_m": worst["m"], "furthest_at": worst["where"]}
        counts["buildings"].append(row)
        asked = bool(os.environ.get("ROUNDTRIP_EDIT", "").strip())
        ok = ok and row["records_back"] == row["records_sent"] == row["made_in_freecad"] and not result["lost"] and (bool(changed) == asked)
        say("roundtrip %s: %s pieces in the save (%d in its pieces layer) -> %d records sent -> %d made in FreeCAD (%d solids) -> %d records back; "
            "the lengths not changed came back within %.6f m (furthest: %s); changed in the save: %d%s"
            % (bid, row["pieces_in_save"], row["pieces_layer"], row["records_sent"], row["made_in_freecad"], solids, row["records_back"], worst["m"],
               worst["where"] or "none", len(changed), "".join("\n   " + c for c in changed)))
    name = os.path.basename(save_path)
    json.dump(back_save, open(os.path.join(out, name), "w", encoding="utf-8"), indent=2)
    counts["save_back"] = os.path.join(out, name)
    counts["features_back"] = len(back_save.get("features", []))
    counts["seconds"] = round(time.time() - t0, 1)
    counts["ok"] = ok
    json.dump(counts, open(os.path.join(out, "roundtrip.json"), "w", encoding="utf-8"), indent=2)
    say("roundtrip %s: %d features in, %d back (%s); %.1f s" % ("OK" if ok else "FAILED", counts["features"], counts["features_back"],
                                                              ", ".join("%s %d" % kv for kv in sorted(counts["by_layer"].items())), counts["seconds"]))
    return ok


if __name__ in ("__main__", "roundtrip") and not getattr(sys, "_organic_roundtrip_ran", False):
    sys._organic_roundtrip_ran = True
    try:
        result = run()
    except Exception:
        say(traceback.format_exc())
        result = False
    if not App.GuiUp:
        os._exit(0 if result else 1)
