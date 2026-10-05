# -*- coding: utf-8 -*-
"""The kinds table: every record the map wrote (its built\\<name>.json, format built/1) held against what realize.py made
of it (built\\realized\\<name>.result.json), per type and per wall kind, opening kind, wall top, IFC class.

    python kinds_table.py <scratch exchange> [<scratch exchange> …]   (each one the x\\ folder of agent\\tools\\map_check.ps1)

Plain Python (no FreeCAD). Prints the table and the files it read."""
import collections
import glob
import json
import os
import sys

rows = collections.OrderedDict()
files = []


def row(key):
    return rows.setdefault(key, {"records": 0, "realized": 0, "made": 0, "notes": set(), "from": set()})


for x in sys.argv[1:]:
    run = os.path.basename(os.path.dirname(os.path.abspath(x))) or x
    for rec_path in sorted(glob.glob(os.path.join(x, "built", "*.json"))):
        if rec_path.endswith(".earthworks.json"):
            continue
        data = json.load(open(rec_path, encoding="utf-8"))
        if data.get("format") != "built/1":
            continue
        name = os.path.splitext(os.path.basename(rec_path))[0]
        res_path = os.path.join(x, "built", "realized", name + ".result.json")
        res = json.load(open(res_path, encoding="utf-8")) if os.path.exists(res_path) else None
        files.append("%s %s: %d records -> %s" % (run, name, len(data["pieces"]), "not realized" if res is None else
                     "made %s of %s, %s solids, complete %s, %d notes" % (res.get("made"), res.get("pieces"), res.get("solids"), res.get("complete"), len(res.get("notes", [])))))
        notes = (res or {}).get("notes", [])
        for p in data["pieces"]:
            t, prm = p["type"], p.get("params", {})
            keys = [t]
            if t == "Wall":
                keys.append("Wall · kind %s" % (prm.get("WallKind") or "(none)"))
                keys.append("Wall · top %s%s" % (prm.get("Top", "Flat"), " + TopHeights" if prm.get("TopHeights") else ""))
                keys += ["Wall · opening %s" % (k or "(no kind)") for k in prm.get("OpeningKinds", []) or []]
                keys += ["Wall · opening shape %s" % s for s in prm.get("OpeningShapes", []) or []]
            if p.get("ifc_type") and p["ifc_type"] not in ("Wall", "Slab", "Roof", "Stair", "Column", "Building Element Proxy"):
                keys.append("%s · IFC %s" % (t, p["ifc_type"]))
            if t in ("SacredFigure", "PlanCurve"):
                keys.append("%s · %s" % (t, prm.get("Kind", "Points")))
            said = [n for n in notes if repr(p["id"]) in n]
            lost = [n for n in said if any(w in n for w in ("not made", "could not", "left out", "not known", "not a property"))]
            for k in keys:
                r = row(k)
                r["records"] += 1
                r["from"].add(run)
                if res is not None:
                    r["realized"] += 1
                    r["made"] += 0 if lost else 1
                    r["notes"].update(n[:160] for n in lost[:2])
print("\n".join(files))
for k, r in rows.items():
    print("%-40s records %3d  realized %3d  made %3d  %s  %s" % (k, r["records"], r["realized"], r["made"], ",".join(sorted(r["from"])), " | ".join(sorted(r["notes"]))[:300]))
