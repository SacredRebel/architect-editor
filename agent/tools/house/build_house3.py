# -*- coding: utf-8 -*-
"""In FreeCAD's window, through the connector: Johny's house S01 rebuilt from its records (with his answers of 3 Oct), the
land data's oak outlines laid beside it as a layer he can show or hide, saved as his design, and sent to the map with the
button's own code. exec(open(<this>).read()); then _build_house3(). Prints what it did; the window is left with the design open
only if keep=True."""
import hashlib
import os
import runpy
import time

import FreeCAD as App
import FreeCADGui as Gui

RECORDS = r"C:\Playground\exchange\house\models\oak-canopy-s01.json"
DESIGN = r"C:\Users\paul\Documents\SulphurMountain\Oak-Canopy-S01.FCStd"


def _build_house3(keep=False, send=True):
    mw = Gui.getMainWindow()
    g = mw.geometry()
    print("window as found:", (g.x(), g.y(), g.width(), g.height()), "minimized", mw.isMinimized(), "workbench", Gui.activeWorkbench().name(),
          "documents", list(App.listDocuments()))
    runpy.run_path(r"C:\Playground\Architect-editor\freecad\InstallOrganic.FCMacro", run_name="organic_install")
    mod = os.path.join(App.getUserAppDataDir(), "Mod", "Organic")
    src = r"C:\Playground\Architect-editor\freecad\Organic"
    diff = [n for n in sorted(os.listdir(src)) if os.path.isfile(os.path.join(src, n)) and (
        not os.path.isfile(os.path.join(mod, n)) or hashlib.sha1(open(os.path.join(src, n), "rb").read()).hexdigest() != hashlib.sha1(open(os.path.join(mod, n), "rb").read()).hexdigest())]
    import organic_commands as oc
    import organic_export as ox
    import organic_geom as og
    print("installed copy equals the repository:", not diff, diff)
    doc = App.newDocument("OakCanopyS01")
    doc.Label = "Oak-Canopy-S01"
    if "UnitSystem" in doc.PropertiesList:
        choice = next((c for c in doc.getEnumerationsOfProperty("UnitSystem") if "MKS" in c or "Meter decimal" in c), None)
        if choice:
            doc.UnitSystem = choice
    t0 = time.time()
    oc.ALL["Organic_ImportMap"].make(doc, path=RECORDS)
    res = oc.ALL["Organic_ImportMap"].last
    print("imported in %.1f s: %d made" % (time.time() - t0, len(res["made"])))
    for n in res["notes"]:
        print("   note:", n)
    print("lost:", res["lost"])
    building = res["building"]
    print("decided on the building:", getattr(building, "MapDecided", "")[:300])
    solids = [o for o in res["made"].values() if type(o.Proxy).__name__ != "PlanCurve"]
    bad = [o.Label for o in solids if not o.Shape.isValid() or not o.Shape.Solids]
    print("solids:", len(solids), "| not valid or empty:", bad)
    for o in solids:
        if type(o.Proxy).__name__ == "WallBand":
            print("   band %s: %s, %d solid(s), %.4f m3, class %s" % (o.MapPiece, o.Kind, len(o.Shape.Solids), sum(og.volume_of(s) for s in o.Shape.Solids) / 1e9, o.IfcType))
    t0 = time.time()
    layer = ox.land_layer(doc, kinds=("oak_protection",), centre_m=(0.0, 0.0), radius_m=45.0)
    stale = sum(1 for o in layer.Group if "out of date" in o.Label)
    print("land layer in %.1f s: %d outlines (%d marked out of date), group %r" % (time.time() - t0, len(layer.Group), stale, layer.Label))
    doc.recompute()
    t0 = time.time()
    doc.saveAs(DESIGN)
    print("saved in %.1f s: %s, %.2f MB" % (time.time() - t0, DESIGN, os.path.getsize(DESIGN) / 1e6))
    if send:
        t0 = time.time()
        rep = oc.ALL["Organic_ExportGodot"].send([building])
        print("sent in %.1f s: %s" % (time.time() - t0, rep["paths"]))
        print("   envelope:", {k: rep["envelope"].get(k) for k in ("buildable", "no_building", "stale", "replaced")} if rep.get("envelope") else None)
        print("   clearance:", rep.get("clearance_m"), "| replaced:", rep.get("replaced_m"), "| level above ground:", rep.get("level_above_ground_m"))
        for n in rep["notes"]:
            print("   note:", n[:300])
    globals()["_house_doc"] = doc.Name
    if not keep:
        App.closeDocument(doc.Name)
    g = mw.geometry()
    print("window now:", (g.x(), g.y(), g.width(), g.height()), "minimized", mw.isMinimized(), "workbench", Gui.activeWorkbench().name(), "documents", list(App.listDocuments()))


globals()["_build_house3"] = _build_house3
