# -*- coding: utf-8 -*-
"""realize — a building drawn in the map, made real: exact solids, a .glb of them and an .ifc.

The map keeps a drawn building as records, not as a mesh: each piece is the Organic workbench's
own object by its own name, each number that object's own property (exchange\\godot\\FORMAT.md,
"built/1"). This script hands such a file to FreeCAD without its window:

    "<FreeCAD>\\bin\\freecadcmd.exe" "<this repository>\\freecad\\realize.py" --pass <records.json> [<out folder>]

It rebuilds the building from the workbench's own objects (Organic\\organic_import.py: what the
"Import from the map" button runs), saves the design, and writes it out as the "Send to the map"
button does (Organic\\organic_export.py). With <name> the records file's own name:

    <out>\\<name>.FCStd        the design: open it in FreeCAD for plans, sections and changes
    <out>\\<name>.glb          the solids' triangles in the building's own frame (metres, glTF
                              Y-up), one node per piece; a node's extras name its piece
    <out>\\<name>.ifc          the same solids as IFC4, each in its class, on the site
    <out>\\<name>.json         where it stands and what it holds (FORMAT.md section 3a), with
                              built_from, source_path and each element's piece
    <out>\\<name>.result.json  what happened here: see below

<out> is the folder "realized" beside the records file unless one is given (the records file
itself is <name>.json: the two must not share a folder). REALIZE_RECORDS and REALIZE_OUT in the
environment say the same as the two arguments, for a caller that cannot pass any.

The result — also printed, on one line that starts with the word REALIZE (FreeCAD prints its
own three lines of greeting after it) — is one JSON object:

    ok          true when the design, the .glb, the .ifc and the .json were written
    complete    true when every piece of the records is in them as a valid solid (or, a curve,
                as the line something stands on) and nothing in the records was left out
    error       why not, when ok is false
    notes       what was not understood, was left out or could not be built, in words: what
                the records say that the files do not. Nothing about the land is in here
    site_notes  what the map's own files say of the place it stands on, in words (on a road,
                on the easement, in an existing building; what the map's build envelope holds
                there), as in the .json's notes; envelope and clearance_m: the same as numbers
    pieces      how many the records hold; made: how many objects they became; solids: how
                many of those are in the .glb
    elements    per solid: name, piece (its id in the records), type, ifcType, volume_m3 (the
                solid's, by OCCT's adaptive measure), mesh_volume_m3, triangles; box_m, the
                solid's own box in the building's frame [[x min, y min, z min], [x max, y max,
                z max]] (x east, y north, z up, before the building is turned; in the map's
                scale, as the .glb is); for a wall openings (how many are cut through it) and
                opening_list (each one's at_m along the base curve, width_m, sill_m, height_m,
                shape, as they stand in the solid); for a floor or a roof holes; and land
                when the records carry the map's reading of the land at that piece (kept as
                written, here and in the .json)
    placement   as written into the .json (coordinates, altitude_m, rotation_deg, ...)
    scale       the map's scale for the building: every length is its number times this
    files       the paths written; seconds: how long it took; records: the file read

The process ends with 0 when ok, with 1 when not. No window, no network. The land files
(for site_notes: the roads, the easement, the existing buildings, and lane C's build envelope)
are read from the exchange folder when they are there; nothing about the land is worked out here.
"""

import json
import os
import sys
import time
import traceback

import FreeCAD as App

OUT = sys.stdout  # as it is now: FreeCAD's IFC exporter leaves another in its place, and what is printed after it is not seen
HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Playground\Architect-editor\freecad"
if os.path.join(HERE, "Organic") not in sys.path:
    sys.path.insert(0, os.path.join(HERE, "Organic"))
import organic_export as ox  # noqa: E402
import organic_import as oi  # noqa: E402

CURVES = ("PlanCurve", "SacredFigure")  # pieces that are lines: they carry solids, they are not sent


def realize(records, out_dir=None, land=None):
    """Rebuild the building of a records file and write it out. Returns the result (see the
    top of this file); raises nothing: what goes wrong is the result's error."""
    t0 = time.time()
    records = os.path.abspath(records)
    out_dir = os.path.abspath(out_dir) if out_dir else os.path.join(os.path.dirname(records), "realized")
    stem = os.path.splitext(os.path.basename(records))[0]
    result = {"ok": False, "complete": False, "records": records, "notes": [], "files": {}}
    doc = None
    try:
        if os.path.normcase(out_dir) == os.path.normcase(os.path.dirname(records)):
            raise ValueError("the out folder is the records file's own: %s.json written there would replace the records" % stem)
        with open(records, encoding="utf-8") as fh:
            data = json.load(fh)
        os.makedirs(out_dir, exist_ok=True)
        doc = App.newDocument("Realize")
        if "UnitSystem" in doc.PropertiesList:
            choice = next((c for c in doc.getEnumerationsOfProperty("UnitSystem") if "MKS" in c or "Meter decimal" in c), None)
            if choice:
                doc.UnitSystem = choice
        made = oi.import_built(doc, records)
        building = made["building"]
        design = os.path.join(out_dir, stem + ".FCStd")
        doc.saveAs(design)  # before it is sent: the .json then names the design (source_path), which the map's O key opens
        report = ox.export_building(building, out_dir, stem=stem, land=land or ox.land_dir(ox.exchange_dir()))
        ids = {obj.Name: key for key, obj in made["made"].items()}
        kinds = {obj.Name: type(obj.Proxy).__name__ for obj in made["made"].values()}
        sent = {row["freecadName"] for row in report["elements"]}
        pieces = data.get("pieces", []) or []
        missing = [key for key, obj in made["made"].items() if kinds[obj.Name] not in CURVES and obj.Name not in sent]
        notes = list(made["notes"])  # the records against the files; what the land says of the place is site_notes
        for key in missing:
            line = "piece %r is not in the .glb: it has no solid" % key
            if not any(repr(key) in n for n in notes):
                notes.append(line)
        result.update({
            "ok": True,
            "complete": len(made["made"]) == len(pieces) and not missing and not made["lost"]
                        and all(obj.Shape.isValid() for obj in made["made"].values() if kinds[obj.Name] not in CURVES),
            "name": made["name"], "format": made["format"], "scale": made["scale"], "notes": notes,
            "pieces": len(pieces), "made": len(made["made"]), "solids": len(report["elements"]),
            "elements": [dict({"name": row["name"], "piece": ids.get(row["freecadName"], ""), "type": kinds.get(row["freecadName"], ""), "ifcType": row["ifcType"],
                               "volume_m3": round(row["volume_m3"], 6), "mesh_volume_m3": round(row["mesh_volume_m3"], 6), "triangles": row["triangles"]},
                              **{k: row[k] for k in ("box_m", "openings", "opening_list", "holes", "land") if k in row})
                         for row in report["elements"]],
            "placement": report["placement"], "clearance_m": report["clearance_m"],
            "site_notes": list(report["notes"]), "envelope": report.get("envelope"),
            "files": dict(report["paths"], design=design),
        })
    except Exception as exc:
        result["error"] = "%s: %s" % (type(exc).__name__, exc)
        result["traceback"] = traceback.format_exc().splitlines()[-6:]
    finally:
        if doc is not None:
            try:
                App.closeDocument(doc.Name)
            except Exception:
                pass
    result["seconds"] = round(time.time() - t0, 1)
    try:
        path = os.path.join(out_dir, stem + ".result.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(result, fh, indent=1)
        result["files"]["result"] = path
    except OSError as exc:  # a folder that cannot be written: the printed line still says what happened
        result.setdefault("error", "the result could not be written: %s" % exc)
        result["ok"] = False
    return result


def say(text):
    OUT.write(text + "\n")
    OUT.flush()


def main(argv):
    rest = argv[argv.index("--pass") + 1:] if "--pass" in argv else []
    records = rest[0] if rest else os.environ.get("REALIZE_RECORDS")
    out_dir = rest[1] if len(rest) > 1 else os.environ.get("REALIZE_OUT")
    if not records:
        say("realize: no records file given (freecadcmd realize.py --pass <records.json> [<out folder>])")
        say("REALIZE " + json.dumps({"ok": False, "complete": False, "error": "no records file given"}))
        return 1
    result = realize(records, out_dir)
    if result["ok"]:
        say("realize: %s: %d of %d pieces made, %d solids written in %.1f s to %s%s"
            % (result.get("name"), result["made"], result["pieces"], result["solids"], result["seconds"], os.path.dirname(result["files"]["glb"]),
               "" if result["complete"] else " (not complete: see the notes)"))
    else:
        say("realize: FAILED: %s" % result.get("error"))
    for note in result["notes"]:
        say("realize: note: %s" % note)
    for note in result.get("site_notes", []):
        say("realize: where it stands: %s" % note)
    say("REALIZE " + json.dumps(result))
    return 0 if result["ok"] else 1


# freecadcmd runs a file it is given under the file's own name (not "__main__"), and runs it again
# when its first run raised; a check that loads this file to call realize() gives it another name
if __name__ in ("__main__", "realize") and not getattr(sys, "_organic_realize_ran", False):
    sys._organic_realize_ran = True
    sys.exit(main(sys.argv))
