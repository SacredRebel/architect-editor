# -*- coding: utf-8 -*-
"""Organic: the toolbar's commands."""

import math
import os

import FreeCAD as App
import FreeCADGui as Gui
import Part

import organic_export as ox
import organic_geom as og
import organic_objects as oo

ICONS = oo.ICONS
MM = og.MM


def icon(name):
    return os.path.join(ICONS, name)


def active_doc():
    doc = App.ActiveDocument
    if doc is None:
        doc = App.newDocument("OrganicDesign")
    if "UnitSystem" in doc.PropertiesList:
        choice = next((c for c in doc.getEnumerationsOfProperty("UnitSystem") if "MKS" in c or "Meter decimal" in c), None)
        if choice and doc.UnitSystem != choice:
            doc.UnitSystem = choice
    return doc


def active_building(doc):
    """The BIM building the user made active (double-click in the tree), else the only one."""
    try:
        view = Gui.ActiveDocument.ActiveView
        b = view.getActiveObject("Arch")
        if b is not None:
            return b
    except Exception:
        pass
    buildings = [o for o in doc.Objects if getattr(o, "IfcType", "") == "Building"]
    return buildings[0] if len(buildings) == 1 else None


def place(obj, doc):
    """Put a new object in the active building, at the building's placement."""
    b = active_building(doc)
    if b is not None:
        obj.Placement = b.Placement.multiply(obj.Placement)
        b.addObject(obj)
    return obj


def is_kind(obj, kind):
    """Whether obj is an Organic object of that class (by name: a reloaded module's classes
    are new objects, so isinstance fails on what was made before the reload)."""
    return type(getattr(obj, "Proxy", None)).__name__ == kind


def selected_curves():
    """The curves in the selection: plan curves, sketches, wires; a selected wall gives its base."""
    out = []
    for s in Gui.Selection.getSelection():
        shape = getattr(s, "Shape", None)
        if shape is None or shape.isNull():
            continue
        if is_kind(s, "Wall"):
            out.append(s.Base)
        elif not shape.Solids and shape.Edges:
            out.append(s)
    return [c for c in out if c is not None]


def arc_length_at(edge, point):
    """Metres along an edge to the point on it nearest `point`."""
    c = edge.Curve
    u0, u1 = edge.FirstParameter, edge.LastParameter
    u = c.parameter(App.Vector(point.x, point.y, edge.valueAt(u0).z))
    if c.isPeriodic():  # a circle answers in 0..2π, an arc's own range may lie beyond it
        period = c.LastParameter - c.FirstParameter
        while u < u0:
            u += period
        while u > u1:
            u -= period
    u = min(max(u, u0), u1)
    return Part.Edge(c, u0, u).Length / MM if u > u0 + 1e-12 else 0.0


def finish(doc, objs, label):
    doc.recompute()
    Gui.Selection.clearSelection()
    for o in objs:
        Gui.Selection.addSelection(o)
    App.Console.PrintMessage("Organic: %s\n" % label)


class Command:
    """A toolbar button: resources plus one action in one undo step."""

    pixmap = "Organic.svg"
    menu = ""
    tip = ""

    def GetResources(self):
        return {"Pixmap": icon(self.pixmap), "MenuText": self.menu, "ToolTip": self.tip}

    def IsActive(self):
        return True

    def Activated(self):
        doc = active_doc()
        doc.openTransaction(self.menu)
        try:
            objs = self.make(doc)
            doc.commitTransaction()
        except Exception as exc:
            doc.abortTransaction()
            App.Console.PrintError("Organic: %s failed: %s\n" % (self.menu, exc))
            raise
        finish(doc, objs or [], self.menu)

    def make(self, doc):
        raise NotImplementedError


# ---------------------------------------------------------------- the building
class NewBuilding(Command):
    pixmap = "OrganicBuilding.svg"
    menu = "New organic building"
    tip = ("A BIM building on a georeferenced site (the land pack's chimney frame: metres, +Y true north, "
           "Z = 0 at the 425.90 m datum). Double-click it in the tree to make it active: new Organic "
           "objects go into it, at its placement. Move the building to put it on the site.")

    def make(self, doc):
        import Arch

        site = next((o for o in doc.Objects if hasattr(o, "Longitude") and hasattr(o, "Latitude") and o.Name.startswith("Site")), None)
        if site is None:
            site = Arch.makeSite([], name="Site")
            site.Label = "Site (chimney frame)"
            site.Longitude, site.Latitude = ox.PACK_CHIMNEY["lng"], ox.PACK_CHIMNEY["lat"]
            site.Elevation = ox.PACK_CHIMNEY["elevation_m"] * MM
            site.Declination = 0.0
        b = Arch.makeBuilding([], name="OrganicBuilding")
        b.Label = "Organic building"
        site.addObject(b)
        try:
            Gui.ActiveDocument.ActiveView.setActiveObject("Arch", b)
        except Exception:
            pass
        return [b]


# ---------------------------------------------------------------- plan curves
class PlanCurve(Command):
    pixmap = "OrganicCurve.svg"
    menu = "Plan curve"
    tip = ("A parametric plan curve: lobed, circle, arc, S-curve, oval, leaf, shell (plugin-eco's organic "
           "plans) or the geometry kit's golden and log spirals and vesica. Set Kind in its properties; "
           "walls, roofs, slabs and films follow it.")

    def make(self, doc):
        c = oo.make(oo.PlanCurve, "PlanCurve", "Plan curve", doc)
        return [place(c, doc)]


# ---------------------------------------------------------------- walls
class Wall(Command):
    pixmap = "OrganicWall.svg"
    menu = "Curved wall"
    tip = ("A wall of real thickness on each selected curve (Organic curve, sketch, Draft B-spline, "
           "arc...), open or closed; without a selection, on a new arc. Thickness, height, a shaped "
           "top (arch, wave, slope) and openings are properties.")

    def make(self, doc):
        curves = selected_curves()
        if not curves:
            c = oo.make(oo.PlanCurve, "PlanCurve", "Wall curve", doc)
            c.Kind = "Arc"
            c.Radius = 6.0 * MM
            place(c, doc)
            curves = [c]
        walls = []
        for c in curves:
            w = oo.make(oo.Wall, "Wall", "Curved wall", doc)
            w.Base = c
            walls.append(place(w, doc))
            if c.ViewObject is not None:
                c.ViewObject.Visibility = False
        return walls


class Opening(Command):
    pixmap = "OrganicOpening.svg"
    menu = "Opening"
    tip = ("An arched opening in the selected Organic wall, centred where you clicked it (or at the middle "
           "of the wall). Edit its width, height, sill and shape (Rect, Arch, Pointed, Round) in the "
           "wall's Openings lists.")

    def make(self, doc):
        done = []
        for sel in Gui.Selection.getSelectionEx():
            w = sel.Object
            if not is_kind(w, "Wall"):
                continue
            edge, _closed = oo.base_edge(w)
            if edge is None:
                edge = og.arc_curve(5.0, 120.0)
            pos = arc_length_at(edge, sel.PickedPoints[0]) if sel.PickedPoints else edge.Length / MM / 2
            oo.add_opening(w, pos)
            done.append(w)
        if not done:
            raise ValueError("select an Organic wall (click on it where the opening goes)")
        return done


# ---------------------------------------------------------------- vaults, arches, domes, shells
class Vault(Command):
    pixmap = "OrganicVault.svg"
    menu = "Ribbed vault"
    tip = ("A barrel vault with ribs (plugin-eco's barrel: 8 m span, 3.5 m rise, 16 m long, 5 ribs). "
           "Profiles: ellipse, semicircle, segmental, pointed, catenary, parabola.")

    def make(self, doc):
        return [place(oo.make(oo.Vault, "Vault", "Ribbed vault", doc), doc)]


class ArchCmd(Command):
    pixmap = "OrganicArch.svg"
    menu = "Catenary arch"
    tip = ("A free-standing arch (a short vault): plugin-hagia-sophia's defaults, 7.62 m span, 3.81 m rise, "
           "0.6 m ring, 1.2 m deep, on a catenary. ThrustInMiddleThird reports the Poleni check.")

    def make(self, doc):
        a = oo.make(oo.Vault, "Arch", "Catenary arch", doc)
        a.Profile = "Catenary"
        a.Span, a.Rise, a.Thickness, a.VaultLength = 7.62 * MM, 3.81 * MM, 0.6 * MM, 1.2 * MM
        a.Ribs = 0
        a.IfcType = "Member"
        return [place(a, doc)]


class Dome(Command):
    pixmap = "OrganicDome.svg"
    menu = "Dome"
    tip = "A dome shell: ellipse, sphere, catenary, parabola or onion meridian, with an optional oculus."

    def make(self, doc):
        return [place(oo.make(oo.Dome, "Dome", "Dome", doc), doc)]


class LeafShell(Command):
    pixmap = "OrganicLeaf.svg"
    menu = "Leaf shell roof"
    tip = ("plugin-eco's leaf shell as a solid: 26 m spine, 13 m span, ridge heights 3 / 7.2 / 9.8 / 3 m, "
           "3 m eave, curl 0.15, 0.12 m thick, ribs every 2.5 m. Ellipse or pointed outline.")

    def make(self, doc):
        return [place(oo.make(oo.LeafShell, "LeafShell", "Leaf shell roof", doc), doc)]


class ShellRoof(Command):
    pixmap = "OrganicRoof.svg"
    menu = "Shell roof on a closed wall"
    tip = ("plugin-eco's organic-building roof over each selected closed curve or Organic wall: "
           "eaves + rise (1 - ρ^2.2) from the pole to the wall, drooping to the overhang.")

    def make(self, doc):
        out = []
        for c in selected_curves():
            r = oo.make(oo.ShellRoof, "ShellRoof", "Shell roof", doc)
            r.Base = c
            wall = next((w for w in c.InList if is_kind(w, "Wall")), None)
            if wall is not None:
                r.Eaves = wall.Height
            out.append(place(r, doc))
        if not out:
            raise ValueError("select a closed curve or an Organic wall on one")
        return out


class Slab(Command):
    pixmap = "OrganicSlab.svg"
    menu = "Floor slab"
    tip = "A floor slab filling each selected closed curve or Organic wall's curve."

    def make(self, doc):
        out = []
        for c in selected_curves():
            s = oo.make(oo.Slab, "Slab", "Floor slab", doc)
            s.Base = c
            out.append(place(s, doc))
        if not out:
            raise ValueError("select a closed curve or an Organic wall on one")
        return out


class SoapFilm(Command):
    pixmap = "OrganicFilm.svg"
    menu = "Minimal surface"
    tip = ("A membrane (minimal surface) on the selected closed curve, lifted by a mast ring; without a "
           "selection, on a 6 m circle. The same Kind of shell also comes as a catenoid or a hypar.")

    def make(self, doc):
        curves = selected_curves()
        out = []
        for c in curves or [None]:
            f = oo.make(oo.SoapFilm, "SoapFilm", "Minimal surface", doc)
            if c is not None:
                f.Base = c
            out.append(place(f, doc))
        return out


class Hypar(Command):
    pixmap = "OrganicFilm.svg"
    menu = "Saddle shell"
    tip = "A hyperbolic-paraboloid shell (switch Kind to Catenoid for the minimal-surface tower)."

    def make(self, doc):
        return [place(oo.make(oo.MinimalShell, "SaddleShell", "Saddle shell", doc), doc)]


# ---------------------------------------------------------------- grow a building
class Grow(Command):
    pixmap = "OrganicGrow.svg"
    menu = "Grow organic building"
    tip = ("plugin-eco's 'Grow 5-lobe building' as FreeCAD solids: a lobed plan (R 8 m, 5 lobes, depth "
           "0.35) inset by 1.3 m, a 0.45 m wall 3.2 m high with a door at bearing 0 and windows facing "
           "south, a shell roof rising 2.4 m with a 0.8 m overhang, and a floor slab.")

    def make(self, doc):
        spec = dict(lobes=5, depth=0.35, turn=0.0, inset=0.5, height=3.2, rise=2.4, overhang=0.8, thick=0.45,
                    glazing=0.25, facing=180.0, door=0.0, radius=8.0)
        c = oo.make(oo.PlanCurve, "PlanCurve", "Organic plan", doc)
        c.Kind, c.Radius, c.Lobes, c.Depth = "Lobed", spec["radius"] * MM, spec["lobes"], spec["depth"]
        c.Inset = (spec["inset"] + spec["overhang"]) * MM
        place(c, doc)
        doc.recompute()
        w = oo.make(oo.Wall, "Wall", "Organic wall", doc)
        w.Base, w.Thickness, w.Height = c, spec["thick"] * MM, spec["height"] * MM
        edge, _closed = og.plan_edge(c.Shape)
        pts = [(p.x / MM, p.y / MM) for p in edge.discretize(Number=241)[:-1]]
        pole = og.pole_of_inaccessibility(pts)
        door = og.along_for_bearing(edge, pole, spec["door"])
        oo.add_opening(w, door, 1.0, 2.1, 0.0, "Rect")
        n = max(1, round(3 + spec["glazing"] * 4))
        for i in range(n):
            bearing = (spec["facing"] - 40 + 80 * (i + 0.5) / n) % 360
            along = og.along_for_bearing(edge, pole, bearing)
            if abs(along - door) < 1.5:
                continue
            oo.add_opening(w, along, 1.2, 1.3, 0.9, "Rect")
        place(w, doc)
        r = oo.make(oo.ShellRoof, "ShellRoof", "Shell roof", doc)
        r.Base, r.Eaves, r.Rise, r.Overhang = c, spec["height"] * MM, spec["rise"] * MM, spec["overhang"] * MM
        place(r, doc)
        s = oo.make(oo.Slab, "Slab", "Floor slab", doc)
        s.Base, s.Inset = c, spec["thick"] / 2 * MM
        place(s, doc)
        if c.ViewObject is not None:
            c.ViewObject.Visibility = False
        return [w, r, s]


# ---------------------------------------------------------------- to the map
class ExportGodot(Command):
    pixmap = "OrganicExport.svg"
    menu = "Send to the map"
    tip = ("Writes the selected building (or objects) to the exchange folder for the Godot map "
           "(exchange\\godot\\): <name>.glb, <name>.ifc and <name>.json, in the exchange frame "
           "(FORMAT.md: metres, Y-up, origin at the chimney anchor), placed where it stands on the site.")

    def Activated(self):
        sel = Gui.Selection.getSelection()
        if not sel:
            b = active_building(App.ActiveDocument) if App.ActiveDocument else None
            sel = [b] if b is not None else []
        if not sel:
            App.Console.PrintError("Organic: select the building to send\n")
            return
        rep = ox.export_building(sel[0] if len(sel) == 1 else sel)
        App.Console.PrintMessage("Organic: sent %s — %d elements to %s\n" % (rep["name"], len(rep["elements"]), os.path.dirname(rep["glb"])))
        return rep


COMMANDS = [
    ("Organic_NewBuilding", NewBuilding()),
    ("Organic_Grow", Grow()),
    ("Organic_PlanCurve", PlanCurve()),
    ("Organic_Wall", Wall()),
    ("Organic_Opening", Opening()),
    ("Organic_LeafShell", LeafShell()),
    ("Organic_ShellRoof", ShellRoof()),
    ("Organic_Vault", Vault()),
    ("Organic_Arch", ArchCmd()),
    ("Organic_Dome", Dome()),
    ("Organic_SoapFilm", SoapFilm()),
    ("Organic_Hypar", Hypar()),
    ("Organic_Slab", Slab()),
    ("Organic_ExportGodot", ExportGodot()),
]

for _name, _cmd in COMMANDS:
    Gui.addCommand(_name, _cmd)

NAMES = [n for n, _c in COMMANDS]
