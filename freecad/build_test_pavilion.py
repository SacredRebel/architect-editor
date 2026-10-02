# -*- coding: utf-8 -*-
"""build_test_pavilion — the test building, built again and sent to the map.

A test building, not a house design: a curved room wall with a wave top and five openings, a
garden wall on an S-curve with an arched gate, a leaf-shell roof on footings, and a ribbed
catenary vault as the way in. It makes the same objects as the Organic toolbar's buttons, with
the same properties, so the result is the one a user gets by pressing them.

Runs inside FreeCAD 1.1 (the window through the FreeCAD MCP connector, or freecadcmd):

    exec(open(r".../freecad/build_test_pavilion.py", encoding="utf-8").read())
    build()

Where it stands: SPOT metres east and north of the anchor (C:\\Playground\\BRAIN.md §3), its
floor on the map's own ground there, turned TURN degrees clockwise. The spot is the flattest
one on the parcel where a footprint of 11 m radius stays 3 m clear of the roads and of the
access easement, 6 m clear of the existing buildings and 6.1 m inside the surveyed boundary;
check_organic measures the building's real footprint against the map's files and the land pack.
"""

import os
import sys
import time

import FreeCAD as App

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Playground\Architect-editor\freecad"
if os.path.join(HERE, "Organic") not in sys.path:
    sys.path.insert(0, os.path.join(HERE, "Organic"))
import organic_export as ox  # noqa: E402
import organic_objects as oo  # noqa: E402

MM = 1000.0
SPOT = (-112.0, 31.0)  # metres east, north of the anchor
TURN = 30.0            # degrees clockwise seen from above: the spine points to bearing 120°
DESIGN = os.environ.get("ORGANIC_DESIGN") or os.path.join(os.path.expanduser("~"), "Documents", "SulphurMountain", "Organic-test-pavilion.FCStd")


def build(spot=SPOT, turn=TURN, design=DESIGN, send=True, out_dir=None):
    """Build the pavilion in a new document, save it, and send it to the map. Returns the
    export's report (None when send is False)."""
    import Arch

    t0 = time.time()
    out_dir = out_dir or ox.exchange_dir()
    for d in list(App.listDocuments().values()):  # a copy left open would be reused under another name
        if d.FileName and os.path.normcase(os.path.abspath(d.FileName)) == os.path.normcase(os.path.abspath(design)):
            App.closeDocument(d.Name)
    doc = App.newDocument("OrganicTestPavilion")
    if "UnitSystem" in doc.PropertiesList:
        choice = next((c for c in doc.getEnumerationsOfProperty("UnitSystem") if "MKS" in c or "Meter decimal" in c), None)
        if choice:
            doc.UnitSystem = choice
    App.setActiveDocument(doc.Name)

    # 1. a building on the site (the toolbar's New organic building), put on its spot
    site = Arch.makeSite([], name="Site")
    site.Label = "Site (anchor frame)"
    site.Longitude, site.Latitude = ox.ANCHOR["lng"], ox.ANCHOR["lat"]
    site.Elevation = ox.ANCHOR["elevation_m"] * MM
    site.Declination = 0.0
    b = Arch.makeBuilding([], name="OrganicBuilding")
    b.Label = "Organic test pavilion"
    site.addObject(b)
    floor = ox.ground_at(ox.land_dir(out_dir), spot[0], spot[1])
    if floor is None:
        raise RuntimeError("the map's land file in %s has no ground under %.1f m E, %.1f m N" % (ox.land_dir(out_dir), spot[0], spot[1]))
    b.Placement = App.Placement(App.Vector(spot[0] * MM, spot[1] * MM, floor * MM), App.Rotation(App.Vector(0, 0, 1), -turn))

    def place(obj, local=None):
        obj.Placement = b.Placement.multiply(local if local is not None else obj.Placement)
        b.addObject(obj)
        return obj

    # 2. the room: an arc, a wall on it, openings
    c1 = place(oo.make(oo.PlanCurve, "PlanCurve", "Plan curve", doc))
    c1.Kind, c1.Radius, c1.Angle, c1.Turn = "Arc", 4.2 * MM, 250.0, 325.0
    doc.recompute()
    w1 = place(oo.make(oo.Wall, "Wall", "Room wall", doc))
    w1.Base = c1
    w1.Thickness, w1.Height, w1.Top, w1.TopRise, w1.TopWaves, w1.Foundation = 0.35 * MM, 2.5 * MM, "Wave", 0.35 * MM, 3, 0.6 * MM
    w1.OpeningPositions = [2.8, 6.2, 9.2, 12.2, 15.6]
    w1.OpeningWidths = [0.9, 0.8, 1.1, 0.8, 0.9]
    w1.OpeningHeights = [1.4, 0.8, 2.2, 0.8, 1.4]
    w1.OpeningSills = [0.9, 1.2, 0.0, 1.2, 0.9]
    w1.OpeningShapes = ["Arch", "Round", "Pointed", "Round", "Arch"]
    # 3. the garden wall: an S-curve, a wall with an arch top and an arched gate
    c2 = place(oo.make(oo.PlanCurve, "PlanCurve", "Plan curve", doc), App.Placement(App.Vector(-5.5 * MM, 6.8 * MM, 0), App.Rotation()))
    c2.Kind, c2.Length, c2.Amplitude, c2.Waves = "S-curve", 11.0 * MM, 1.2 * MM, 1.0
    doc.recompute()
    w2 = place(oo.make(oo.Wall, "Wall", "Garden wall", doc))
    w2.Base = c2
    w2.Thickness, w2.Height, w2.Top, w2.TopRise, w2.Foundation = 0.3 * MM, 1.8 * MM, "Arch", 0.9 * MM, 0.6 * MM
    oo.add_opening(w2, 5.6, 1.2, 1.9, 0.0, "Arch")
    # 4. the leaf shell roof, on a footing under each tip that reaches the ground
    leaf = place(oo.make(oo.LeafShell, "LeafShell", "Leaf shell roof", doc))
    leaf.Outline, leaf.Spine, leaf.LeafSpan = "Pointed", 16.0 * MM, 10.5 * MM
    leaf.RidgeHeights = [0.4, 5.4, 6.2, 0.4]
    leaf.Eave, leaf.Curvature, leaf.Thickness, leaf.RibSpacing, leaf.RibDepth = 0.4 * MM, 0.2, 0.15 * MM, 2.0 * MM, 0.12 * MM
    leaf.Plinth = 0.6 * MM
    # 5. the vault: the way in
    v = place(oo.make(oo.Vault, "Vault", "Entrance vault", doc), App.Placement(App.Vector(0, -4.6 * MM, 0), App.Rotation()))
    v.Profile, v.Span, v.Rise, v.Thickness, v.VaultLength = "Catenary", 2.8 * MM, 3.0 * MM, 0.2 * MM, 5.0 * MM
    v.Ribs, v.RibWidth, v.RibDepth = 3, 0.25 * MM, 0.12 * MM
    doc.recompute()
    if App.GuiUp:
        for c in (c1, c2):
            c.ViewObject.Visibility = False

    solids = [o for o in b.Group if hasattr(o, "Shape") and o.Shape.Solids]
    bad = [o.Label for o in solids if not o.Shape.isValid() or len(o.Shape.Solids) != 1]
    for o in solids:
        print("%-18s %-5s %-10s volume %8.3f m³" % (o.Label, o.IfcType, type(o.Proxy).__name__, o.Shape.Volume / 1e9))
    print("built in %.1f s at %.1f m E, %.1f m N, floor %+.2f m from the anchor's ground, turned %.1f°; not one valid solid: %s"
          % (time.time() - t0, spot[0], spot[1], floor, turn, bad or "none"))
    if bad or len(solids) != 4:
        raise RuntimeError("the pavilion is not four valid solids: %s" % (", ".join(bad) or "%d solids" % len(solids)))
    os.makedirs(os.path.dirname(design), exist_ok=True)
    doc.saveAs(design)
    print("saved", design)
    if not send:
        return None
    report = ox.export_building(b, out_dir)
    at, off = report["placement"], report["placement"]["offset_m"]
    print("sent to %s" % os.path.dirname(report["paths"]["glb"]))
    print("placement: lng %.7f, lat %.7f, altitude %+.2f m (elevation %.2f m), rotation y %+.1f deg (%.2f m E, %.2f m N of the anchor)"
          % (at["coordinates"][0], at["coordinates"][1], at["altitude_m"], at["elevation_m"], at["rotation_deg"]["y"], off["east"], off["north"]))
    print("clear of: %s" % ", ".join("%s %.1f m" % kv for kv in sorted(report["clearance_m"].items())))
    for note in report["notes"]:
        print("note:", note)
    for row in report["elements"]:
        print("  %-18s %-5s solid %.3f m³, its triangles %.3f m³ (%d)" % (row["name"], row["ifcType"], row["volume_m3"], row["mesh_volume_m3"], row["triangles"]))
    return report


if __name__ == "__main__":
    build()
