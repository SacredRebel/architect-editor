# -*- coding: utf-8 -*-
"""Pictures of Johny's answers in the house, taken in FreeCAD's window from the open design (its document's name in
_house_doc): the house from the south-west; the bands to the roof as glass and as the wall carried up (the roofs hidden);
the main floor's opening round the chimney; the land data's oak outlines under the roof plan. Every picture waits until
the camera stands still; the design is left as it was saved (the bands set back to glass, every solid shown, the land
layer as it was, no clipping plane). exec(open(<this>).read()); then _answers_pictures(_house_doc)."""
import os
import time

import FreeCAD as App
import FreeCADGui as Gui

OUT = r"C:\Playground\Architect-editor\docs\plans\organic\house\answers"


def _answers_pictures(doc_name, out=OUT):
    doc = App.getDocument(doc_name)
    Gui.setActiveDocument(doc.Name)
    Gui.Selection.clearSelection()
    view = Gui.getDocument(doc.Name).ActiveView
    view.setCameraType("Orthographic")
    os.makedirs(out, exist_ok=True)
    by_piece = {str(getattr(o, "MapPiece", "")): o for o in doc.Objects if getattr(o, "MapPiece", "")}
    solids = {k: o for k, o in by_piece.items() if type(o.Proxy).__name__ != "PlanCurve"}
    bands = [o for o in solids.values() if type(o.Proxy).__name__ == "WallBand"]
    land = next((o for o in doc.Objects if o.Label == "Land data (not the house)"), None)
    land_was = bool(land.ViewObject.Visibility) if land is not None else None

    def settle(limit=6.0):
        cam = view.getCameraNode()
        last, still, t0 = None, 0, time.time()
        while time.time() - t0 < limit:
            Gui.updateGui()
            time.sleep(0.04)
            now = (tuple(cam.position.getValue().getValue()), tuple(cam.orientation.getValue().getValue()), cam.height.getValue() if hasattr(cam, "height") else 0.0)
            still = still + 1 if now == last else 0
            last = now
            if still >= 6:
                return True
        return False

    def show(only=None, hide=()):
        for k, o in solids.items():
            o.ViewObject.Visibility = (only is None or k in only) and k not in hide

    def look_along(d):
        d = App.Vector(*d)
        d.normalize()
        right = d.cross(App.Vector(0, 0, 1))
        right.normalize()
        up = right.cross(d)
        up.normalize()
        return App.Rotation(right, up, d * -1.0, "ZXY")

    def shot(name, look, width=2400, height=1600):
        Gui.Selection.clearSelection()
        view.setCameraOrientation(App.Rotation(0, 0, 0, 1) if look == "top" else look_along(look))
        a = settle()
        view.fitAll()
        b = settle()
        path = os.path.join(out, name)
        view.saveImage(path, width, height, "White")
        return os.path.basename(path), os.path.getsize(path), a and b

    roofs = [k for k in solids if k.startswith("RS-")]
    made = []
    try:
        if land is not None:
            land.ViewObject.Visibility = False
        show()
        made.append(shot("oak-canopy-s01-answers-from-south-west.png", (1.0, 1.0, -0.6)))
        show(hide=roofs)
        made.append(shot("oak-canopy-s01-bands-glass-without-roofs.png", (1.0, 1.0, -0.75)))
        made.append(shot("oak-canopy-s01-bands-glass-from-north-east.png", (-1.0, -1.0, -0.6)))
        for b in bands:
            b.Kind = "Wall"
        doc.recompute()
        made.append(shot("oak-canopy-s01-bands-wall-without-roofs.png", (1.0, 1.0, -0.75)))
        for b in bands:
            b.Kind = "Glass"
        doc.recompute()
        show(only=["floor-main"])
        made.append(shot("oak-canopy-s01-main-floor-chimney-opening.png", "top"))
        show(only=roofs)
        if land is not None:
            land.ViewObject.Visibility = True
        made.append(shot("oak-canopy-s01-roof-plan-with-oak-data.png", "top"))
    finally:
        for b in bands:
            if str(b.Kind) != "Glass":
                b.Kind = "Glass"
        doc.recompute()
        show()
        if land is not None:
            land.ViewObject.Visibility = land_was
        if view.hasClippingPlane():
            view.toggleClippingPlane(0)
    for name, size, stood in made:
        print("%-56s %.2f MB  camera stood still: %s" % (name, size / 1e6, stood))
    print("bands back to glass:", all(str(b.Kind) == "Glass" for b in bands), "| solids shown:", sum(1 for o in solids.values() if o.ViewObject.Visibility), "of", len(solids),
          "| land layer shown:", land.ViewObject.Visibility if land is not None else None)
    return made


globals()["_answers_pictures"] = _answers_pictures
