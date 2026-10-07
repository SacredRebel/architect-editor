# -*- coding: utf-8 -*-
"""leaf_to_records — Johny's oak leaf as records the map takes (the architect's THE LEAF, part 2, 6 Oct 2026).

Reads lane C's leaf folder (organic_leaf.read_leaf: refused, with the reason, if anything in it is off), writes the
records file — format built/1, one piece of type LeafRoofTraced at C's place: the building at the blade's centre,
turned so that the leaf's +y points at the tip's heading (rotation_y_of_heading applies the one formula, lane E's
importer line), standing on
the map's own land there (FRAME.md lets A read it there; lane C's ground_m is said beside it); the piece's params are
FRAME.md's — Length (lane C's DERIVED length, or Johny's given here), length_source ("DERIVED" as C says, or "yours")
and the files it is built from, with their fingerprints — then realizes it as the map's Ctrl+R does (realize.py's own function): the design, the .glb (the
drop-check's file), the .ifc, the sidecar and the result, in <the records' folder>\\realized\\.

    "<FreeCAD>\\bin\\freecadcmd.exe" leaf_to_records.py

LEAF_RECORDS_LEAF    the leaf folder, relative to the Playground folder or absolute (default exchange/house/leaf)
LEAF_RECORDS_OUT     the records file (default <Playground>\\exchange\\house\\models\\oak-leaf-roof-01.json)
LEAF_RECORDS_LENGTH  Johny's length in metres, when he gives one (default: lane C's DERIVED length)
LEAF_RECORDS_NO_REALIZE=1  write the records only
Prints LEAF_RECORDS {json} last; ends with 0 when the records were written and, unless told not to, realized complete."""
import datetime
import json
import os
import runpy
import sys
import traceback

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Playground\Architect-editor\freecad"
if os.path.join(HERE, "Organic") not in sys.path:
    sys.path.insert(0, os.path.join(HERE, "Organic"))
import organic_export as ox  # noqa: E402
import organic_leaf as ol  # noqa: E402

OUT = sys.stdout
NAME = "oak-leaf-roof-01"


def say(text):
    OUT.write(text + "\n")
    OUT.flush()


def rotation_y_of_heading(heading_deg):
    """The record's rotation_deg.y for leaf-place.json's heading_deg, by the one formula — lane E's, written at the
    importer line that converts it: Spatial Map\\spatial-map\\godot\\scripts\\records_tools.gd, import_records(),
    the comment "THE ONE FORMULA" (E's commit 88f86a0; FRAME.md "Conversions"). The same arithmetic, applied here and
    wrapped to -180 .. 180."""
    return (-float(heading_deg) + 180.0) % 360.0 - 180.0


def records(leaf, place, length_m, length_source, ground_m, ground_said):
    """The built/1 records of the leaf (a dict): the building at C's centre, turned by rotation_y_of_heading, standing
    on ground_m (m above the map's ground at the anchor); one piece whose params are FRAME.md's: Length, length_source
    and the files it was built from (with their fingerprints)."""
    paths = leaf["paths"]
    params = {"Length": round(length_m, 4), "length_source": length_source,
              "OutlineFile": paths["outline"], "VeinsFile": paths["veins"], "HolesFile": paths["holes"], "ProfileFile": paths["profile"],
              "PlaceFile": paths["place"], "Fingerprints": ["%s=%s" % kv for kv in sorted(leaf["fingerprints"].items())]}
    return {"format": "built/1", "id": "h-" + NAME, "name": "Oak leaf roof 01",
            "saved": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "generator": "leaf_to_records.py (lane A) from lane C's leaf folder %s; the ground %s" % (os.path.dirname(paths["outline"]), ground_said),
            "units": "m",
            "placement": {"coordinates": [place["lng"], place["lat"]], "altitude_m": round(ground_m, 3),
                          "rotation_deg": {"x": 0.0, "y": round(rotation_y_of_heading(place["heading_deg"]), 4), "z": 0.0}, "scale": 1.0},
            "pieces": [{"id": "oak-leaf", "type": "LeafRoofTraced", "name": "Oak leaf roof", "ifc_type": "Roof", "params": params,
                        "placement": {"x": 0.0, "y": 0.0, "z": 0.0, "turn": 0.0}}]}


def run():
    folder = os.environ.get("LEAF_RECORDS_LEAF", ol.LEAF_DIR)
    out = os.environ.get("LEAF_RECORDS_OUT") or os.path.join(ol.playground_dir(), "exchange", "house", "models", NAME + ".json")
    result = {"ok": False, "records": out}
    try:
        if not os.path.isfile(ol.resolve(folder.rstrip("/\\") + "/README.md")):  # C writes it last: the files are whole then
            raise ValueError("lane C's leaf folder has no README.md yet (written last): its files may not be whole: %s" % ol.resolve(folder))
        leaf = ol.read_leaf(ol.default_paths(folder))
        place = ol.place_of(leaf)
        given = os.environ.get("LEAF_RECORDS_LENGTH")
        length_m, source = (float(given), "yours") if given else (place["length_m"], place["length_source"])
        kx, ky = ox.METRES_PER_DEG
        east, north = (place["lng"] - ox.ANCHOR["lng"]) * kx, (place["lat"] - ox.ANCHOR["lat"]) * ky
        # the ground: the map's own land at the centre (FRAME.md: A may read it there), so the leaf stands on the ground
        # the map shows; lane C's ground_m beside it, said
        ground = ox.ground_at(ox.exchange_dir(), east, north)
        if ground is None:
            raise ValueError("the map's ground is not there at %.1f m E, %.1f m N" % (east, north))
        ground_said = "the map's own land there, %.3f m above its ground at the anchor" % ground
        if place["ground_m"] is not None:
            ground_said += " (lane C's ground_m %.3f m, %.3f m above the anchor's %.2f: %+.3f m from the map's)" % (
                place["ground_m"], place["ground_m"] - ox.ANCHOR["elevation_m"], ox.ANCHOR["elevation_m"], place["ground_m"] - ox.ANCHOR["elevation_m"] - ground)
        data = records(leaf, place, length_m, source, ground, ground_said)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=1)
        result.update({"ok": True, "length_m": length_m, "length_source": source, "east_m": round(east, 3), "north_m": round(north, 3),
                       "c_easting_m": place["easting_m"], "c_northing_m": place["northing_m"],
                       "ground_m": round(ground, 3), "turn_deg": data["placement"]["rotation_deg"]["y"], "fingerprints": leaf["fingerprints"]})
        say("leaf_to_records: %s written: Length %.3f m (%s), at %.2f m E, %.2f m N (lane C's easting/northing %s, %s), the tip toward %.2f deg (rotation_deg.y %.2f), the ground %s"
            % (out, length_m, source, east, north, place["easting_m"], place["northing_m"], place["heading_deg"],
               data["placement"]["rotation_deg"]["y"], ground_said))
        if os.environ.get("LEAF_RECORDS_NO_REALIZE") != "1":
            realize = runpy.run_path(os.path.join(HERE, "realize.py"), run_name="organic_realize")["realize"]
            done = realize(out, os.path.join(os.path.dirname(out), "realized"))
            result["realized"] = {k: done.get(k) for k in ("ok", "complete", "error", "made", "pieces", "solids", "notes", "seconds", "files")}
            result["ok"] = bool(done.get("ok") and done.get("complete"))
            say("leaf_to_records: realized %s in %.1f s: %s of %s pieces, %s solids%s"
                % ("complete" if done.get("complete") else "NOT complete", done.get("seconds", 0.0), done.get("made"), done.get("pieces"),
                   done.get("solids"), "; " + "; ".join(done.get("notes") or []) if done.get("notes") else ""))
    except Exception as exc:
        result["error"] = "%s: %s" % (type(exc).__name__, exc)
        result["traceback"] = traceback.format_exc().splitlines()[-6:]
        say("leaf_to_records: FAILED: %s" % result["error"])
    say("LEAF_RECORDS " + json.dumps(result))
    return result["ok"]


if __name__ in ("__main__", "leaf_to_records") and not getattr(sys, "_organic_leaf_records_ran", False):
    sys._organic_leaf_records_ran = True
    ok = run()
    import FreeCAD as App
    if not App.GuiUp:
        os._exit(0 if ok else 1)
