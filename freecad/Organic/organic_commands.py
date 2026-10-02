# -*- coding: utf-8 -*-
"""Organic: the toolbars' commands.

Three toolbars: Organic (walls, shells, vaults, domes, the building and the way to the map),
Sacred (plan figures, regular solids, the sun, proportions) and Biomimetic (nets, cellular
walls, veined shells, branching columns).

A command's work is its make(): it takes the document and, where it acts on a selection, the
selected objects, so it runs the same from a button and from a script without a window.
"""

import os

import FreeCAD as App
import FreeCADGui as Gui
import Part

import organic_export as ox
import organic_geom as og
import organic_objects as oo
import organic_sacred as sacred

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


def is_building(obj):
    return getattr(obj, "IfcType", "") == "Building"


def active_building(doc):
    """The BIM building the user made active (double-click in the tree), else the only one."""
    if App.GuiUp:
        try:
            b = Gui.ActiveDocument.ActiveView.getActiveObject("Arch")
            if b is not None:
                return b
        except Exception:
            pass
    buildings = [o for o in doc.Objects if is_building(o)]
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


def selection():
    """What is selected in the window (nothing without one)."""
    return list(Gui.Selection.getSelection()) if App.GuiUp else []


def picks():
    """[(object, the point clicked on it or None)] for what is selected in the window."""
    if not App.GuiUp:
        return []
    return [(s.Object, s.PickedPoints[0] if s.PickedPoints else None) for s in Gui.Selection.getSelectionEx()]


def curves_in(selected):
    """The curves among objects: plan curves, figures, sketches, wires; a wall gives its base."""
    out = []
    for s in selected:
        shape = getattr(s, "Shape", None)
        if shape is None or shape.isNull():
            continue
        if is_kind(s, "Wall") or is_kind(s, "CellularWall"):
            out.append(s.Base)
        elif not shape.Solids and shape.Edges:
            out.append(s)
    return [c for c in out if c is not None]


def arc_length_at(edge, point):
    """Metres along an edge to the point on it nearest `point`."""
    if isinstance(edge, og.WirePath):  # an outline with corners: the nearest of points 5 cm apart along it
        n = max(8, int(edge.Length / 50.0))
        flat = App.Vector(point.x, point.y, edge.valueAt(0.0).z)
        return min((edge.Length * k / n for k in range(n)), key=lambda s: (edge.valueAt(s) - flat).Length) / MM
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
    if App.GuiUp:
        Gui.Selection.clearSelection()
        for o in objs:
            Gui.Selection.addSelection(o)
    App.Console.PrintMessage("Organic: %s\n" % label)


def say(text):
    App.Console.PrintMessage("Organic: %s\n" % text)


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
    tip = ("A BIM building on a georeferenced site (the canonical frame: metres, the origin at the anchor, "
           "+Y true north, Z = 0 on the ground there, 425.63 m). Double-click it in the tree to make it "
           "active: new Organic objects go into it, at its placement. Move the building to put it on the site.")

    def make(self, doc):
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
        b.Label = "Organic building"
        site.addObject(b)
        if App.GuiUp:
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
def default_arc(doc, label, radius_m):
    c = oo.make(oo.PlanCurve, "PlanCurve", label, doc)
    c.Kind = "Arc"
    c.Radius = radius_m * MM
    return place(c, doc)


class Wall(Command):
    pixmap = "OrganicWall.svg"
    menu = "Curved wall"
    tip = ("A wall of real thickness on each selected curve (Organic curve, sketch, Draft B-spline, "
           "arc...), open or closed; without a selection, on a new arc. Thickness, height, a shaped "
           "top (arch, wave, slope) and openings are properties.")

    def make(self, doc, selected=None):
        curves = curves_in(selection() if selected is None else selected) or [default_arc(doc, "Wall curve", 6.0)]
        walls = []
        for c in curves:
            w = oo.make(oo.Wall, "Wall", "Curved wall", doc)
            w.Base = c
            walls.append(place(w, doc))
            if App.GuiUp and c.ViewObject is not None:
                c.ViewObject.Visibility = False
        return walls


class Opening(Command):
    pixmap = "OrganicOpening.svg"
    menu = "Opening"
    tip = ("An arched opening in the selected Organic wall, centred where you clicked it (or at the middle "
           "of the wall). Edit its width, height, sill and shape (Rect, Arch, Pointed, Round) in the "
           "wall's Openings lists.")

    def make(self, doc, picked=None):
        done = []
        for w, point in (picks() if picked is None else picked):
            if not is_kind(w, "Wall"):
                continue
            edge, _closed = oo.base_edge(w, corners=True)  # in the wall's own frame, as the click must be
            if edge is None:
                edge = og.arc_curve(5.0, 120.0)
            pos = arc_length_at(edge, w.Placement.inverse().multVec(point)) if point is not None else edge.Length / MM / 2
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

    def make(self, doc, selected=None):
        out = []
        for c in curves_in(selection() if selected is None else selected):
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

    def make(self, doc, selected=None):
        out = []
        for c in curves_in(selection() if selected is None else selected):
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

    def make(self, doc, selected=None):
        out = []
        for c in curves_in(selection() if selected is None else selected) or [None]:
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
        edge, _closed = og.plan_edge(c.Shape)  # in document coordinates: the bearings are true bearings
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
        if App.GuiUp and c.ViewObject is not None:
            c.ViewObject.Visibility = False
        return [w, r, s]


# ---------------------------------------------------------------- to the map
class ExportGodot(Command):
    pixmap = "OrganicExport.svg"
    menu = "Send to the map"
    tip = ("Writes the selected building (or objects) to the exchange folder for the Godot map "
           "(exchange\\godot\\): <name>.glb, <name>.ifc and <name>.json. The building keeps its own origin "
           "(metres, Y-up); where it stands on the site (longitude, latitude, elevation, turn) is written "
           "beside it and as the IFC building's placement. Says so if it stands on a road, the easement "
           "or an existing building.")

    def Activated(self):
        doc = App.ActiveDocument
        sel = selection()
        if not sel:
            b = active_building(doc) if doc else None
            sel = [b] if b is not None else []
        if not sel:
            App.Console.PrintError("Organic: select the building to send\n")
            return
        return self.send(sel)

    def send(self, selected, out_dir=None):
        rep = ox.export_building(selected[0] if len(selected) == 1 else selected, out_dir)
        at, off = rep["placement"], rep["placement"]["offset_m"]
        turn = at["rotation_deg"]["y"]
        say("sent %s — %d elements to %s" % (rep["name"], len(rep["elements"]), os.path.dirname(rep["paths"]["glb"])))
        say("it stands %.1f m east, %.1f m north of the anchor, its level (z = 0) at %.2f m, turned %.1f° %s (lng %.7f, lat %.7f)"
            % (off["east"], off["north"], at["elevation_m"], abs(turn), "clockwise" if turn < 0 else "anticlockwise",
               at["coordinates"][0], at["coordinates"][1]))
        for kind, metres in sorted(rep["clearance_m"].items()):
            say("%.1f m clear of the nearest %s" % (metres, kind.replace("_", " ")))
        for note in rep["notes"]:
            App.Console.PrintWarning("Organic: %s\n" % note)
        return rep


# ================================================================ the Sacred tab
class Figure(Command):
    pixmap = "SacredFigure.svg"
    menu = "Plan figure"
    tip = ("A figure of proportion in plan: vesica piscis, seed and flower of life, golden and root "
           "rectangles, turned squares, polygons, stars, a module grid. Set Kind in its properties. "
           "Its outline carries walls, slabs, roofs and nets like any plan curve; its construction "
           "lines are a guide.")

    def make(self, doc):
        f = oo.make(oo.SacredFigure, "Figure", "Plan figure", doc)
        f.Kind = "Seed of life"
        return [place(f, doc)]


class Solid(Command):
    pixmap = "SacredSolid.svg"
    menu = "Regular solid"
    tip = "One of the five regular solids (tetrahedron, cube, octahedron, dodecahedron, icosahedron) of a given edge, on a face or a vertex."

    def make(self, doc):
        s = oo.make(oo.SacredSolid, "RegularSolid", "Regular solid", doc)
        s.Kind = "Icosahedron"
        return [place(s, doc)]


class Geodesic(Command):
    pixmap = "SacredGeodesic.svg"
    menu = "Geodesic dome"
    tip = "A geodesic dome shell of real thickness: radius, frequency (how finely the icosahedron is cut) and how much of the sphere stands."

    def make(self, doc):
        return [place(oo.make(oo.GeodesicDome, "GeodesicDome", "Geodesic dome", doc), doc)]


def place_of(doc, obj=None):
    """(lng, lat) of an object's own origin (the document's origin without one)."""
    origin = ox.document_origin(doc)
    kx, ky = ox.METRES_PER_DEG
    base = obj.Placement.Base if obj is not None else App.Vector()
    return origin["lng"] + base.x / MM / kx, origin["lat"] + base.y / MM / ky


class SunRoseCmd(Command):
    pixmap = "SacredSun.svg"
    menu = "Sun rose"
    tip = ("Where the sun rises and sets through the year, drawn at the active building's spot: true north, "
           "east, south, west, the solstices and equinoxes and the cross-quarter days. The azimuths are the "
           "land pack's own, over the ridge line seen from there or on a level horizon (Horizon).")

    def make(self, doc):
        rose = oo.make(oo.SunRose, "SunRose", "Sun rose", doc)
        b = active_building(doc)
        if b is not None:  # at the building, but of the site: it does not turn when the building does
            rose.Placement = App.Placement(b.Placement.Base, App.Rotation())
        site = next((o for o in doc.Objects if getattr(o, "IfcType", "") == "Site"), None)
        if site is not None:
            site.addObject(rose)
        return [rose]


AXES = {"its front (the -Y side)": "-Y", "its back (the +Y side)": "+Y", "its +X end": "+X", "its -X end": "-X"}


def ask(title, label, items):
    """One choice from a list, asked in a small window; None when it is closed."""
    try:
        from PySide import QtWidgets as widgets
    except ImportError:
        from PySide import QtGui as widgets
    item, ok = widgets.QInputDialog.getItem(Gui.getMainWindow(), title, label, list(items), 0, False)
    return item if ok else None


class Orient(Command):
    pixmap = "SacredOrient.svg"
    menu = "Turn to the sun"
    tip = ("Turns the active (or selected) building about its own origin so that one of its sides faces a "
           "direction: true north, east, south, west, or the sunrise or sunset of a solstice, an equinox "
           "or a cross-quarter day, as the land pack gives it for that spot.")

    def make(self, doc, selected=None, direction=None, axis=None, horizon="Terrain"):
        chosen = selection() if selected is None else selected
        b = next((o for o in chosen if is_building(o)), None) or active_building(doc)
        if b is None:
            raise ValueError("select a building, or double-click one to make it active")
        if direction is None:
            if not App.GuiUp:
                raise ValueError("no direction given")
            direction = ask(self.menu, "Turn %s towards:" % b.Label, sacred.DIRECTIONS)
            side = ask(self.menu, "Which of its sides should face there?", AXES) if direction else None
            if not direction or not side:
                return []
            axis = AXES[side]
        lng, lat = place_of(doc, b)
        azimuths, source = ({}, "a fixed direction") if direction in sacred.CARDINAL else sacred.site_azimuths(lng, lat, horizon)
        bearing = sacred.bearing_of(direction, azimuths)
        yaw = sacred.turn_for(bearing, axis or "-Y")
        b.Placement = App.Placement(b.Placement.Base, App.Rotation(og.Z, yaw))
        say("%s: its %s side now faces %s, bearing %.2f° from true north (%s)" % (b.Label, axis or "-Y", direction, bearing, source))
        return [b]


def proportions_of(doc):
    """The document's proportion settings, made on first use."""
    p = next((o for o in doc.Objects if is_kind(o, "Proportions")), None)
    if p is None:
        p = oo.make(oo.Proportions, "Proportions", "Proportions (system and module)", doc)
    return p


def organic_solids(doc, selected):
    """The objects a proportion command works on: the selection, a selected building's
    contents, or every Organic solid in the document."""
    chosen = []
    for o in selected:
        chosen += [c for c in ox.elements_of(o)] if is_building(o) else [o]
    if not chosen:
        chosen = [o for o in doc.Objects if hasattr(getattr(o, "Proxy", None), "ifc_type")]
    return [o for o in chosen if getattr(o, "Shape", None) is not None and not o.Shape.isNull() and o.Shape.Solids]


class Snap(Command):
    pixmap = "SacredSnap.svg"
    menu = "Snap to proportion"
    tip = ("Sets the selected Organic objects (or all of them) to the document's proportion system: each "
           "governing dimension onto whole modules, each dependent one to the system's nearest ratio "
           "(a vault's rise to its span, a leaf's span to its spine...). The system and the module are "
           "the properties of the document's Proportions object.")

    def make(self, doc, selected=None):
        p = proportions_of(doc)
        done = []
        for obj in organic_solids(doc, selection() if selected is None else selected):
            for label, name, a0, a1, b0, b1 in sacred.snap_object(obj, p.System, oo.m(p.Module)):
                say("%s, %s: %.3f : %.3f m -> %.3f : %.3f m (%s)" % (obj.Label, label, a0, b0, a1, b1, name))
                done.append(obj)
        if not done:
            say("nothing selected has a proportion to set (vaults, domes, leaf shells, saddle shells and branching columns do)")
        return [p] + done


class Report(Command):
    pixmap = "SacredReport.svg"
    menu = "Proportions report"
    tip = ("A spreadsheet of the proportions of the selected objects (or all of them): each one's dimensions "
           "in metres and in modules, the ratio measured, the nearest ratio of the document's system and of "
           "any system, and how far off it is.")

    def make(self, doc, selected=None):
        import Spreadsheet  # noqa: F401  (registers the sheet type)

        p = proportions_of(doc)
        rows = sacred.proportion_rows(organic_solids(doc, selection() if selected is None else selected), p.System, oo.m(p.Module))
        sheet = doc.getObject("ProportionsReport") or doc.addObject("Spreadsheet::Sheet", "ProportionsReport")
        sheet.Label = "Proportions report"
        sheet.clearAll()
        for r, row in enumerate(rows):
            for c, value in enumerate(row):
                sheet.set("%s%d" % (chr(ord("A") + c), r + 1), str(value))
        say("proportions report: %d rows, system %s, module %.4f m" % (len(rows) - 1, p.System, oo.m(p.Module)))
        return [sheet]


# ================================================================ the Biomimetic tab
class GridshellCmd(Command):
    pixmap = "BioGridshell.svg"
    menu = "Gridshell"
    tip = ("A gridshell of laths over each selected closed curve (without a selection, a 6 m circle): the "
           "form a net takes when every node is in balance, turned over so it stands in compression. "
           "Spacing, rise, lath size and an edge beam are properties.")
    hanging = False

    def make(self, doc, selected=None):
        out = []
        for c in curves_in(selection() if selected is None else selected) or [None]:
            g = oo.make(oo.Gridshell, "Gridshell", self.menu, doc)
            g.Hanging = self.hanging
            if c is not None:
                g.Base = c
            out.append(place(g, doc))
        return out


class NetCmd(GridshellCmd):
    pixmap = "BioNet.svg"
    menu = "Hanging net"
    tip = ("A catenary net hung from each selected closed curve (without a selection, a 6 m circle): the same "
           "balance of forces as the gridshell, in tension. The classic way to find a shell's form.")
    hanging = True


class Cells(Command):
    pixmap = "BioCells.svg"
    menu = "Cellular wall"
    tip = ("A wall on each selected curve (without a selection, a new arc) opened into cells between ribs, "
           "as bone and dragonfly wings are: Voronoi cells, each drawn back by half a rib and rounded. "
           "Cell size, rib width, the solid margin and the pattern's seed are properties.")

    def make(self, doc, selected=None):
        curves = curves_in(selection() if selected is None else selected) or [default_arc(doc, "Wall curve", 5.0)]
        out = []
        for c in curves:
            w = oo.make(oo.CellularWall, "CellularWall", "Cellular wall", doc)
            w.Base = c
            out.append(place(w, doc))
            if App.GuiUp and c.ViewObject is not None:
                c.ViewObject.Visibility = False
        return out


class VeinLeaf(Command):
    pixmap = "BioVeins.svg"
    menu = "Veined leaf shell"
    tip = ("A leaf shell roof whose ribs are grown as a leaf's veins: from the stem end towards points "
           "scattered over the leaf, each vein as wide as the ones it feeds require (Murray's law). "
           "VeinSources and VeinSeed change the pattern.")

    def make(self, doc):
        leaf = oo.make(oo.LeafShell, "LeafShell", "Veined leaf shell", doc)
        leaf.RibPattern = "Veins"
        leaf.Outline = "Pointed"
        return [place(leaf, doc)]


class Column(Command):
    pixmap = "BioColumn.svg"
    menu = "Branching column"
    tip = ("A column that branches like a tree to carry a roof at many points: height, the first fork, how "
           "often and into how many it forks, the crown's radius, and the law its branches thin by.")

    def make(self, doc):
        return [place(oo.make(oo.BranchingColumn, "BranchingColumn", "Branching column", doc), doc)]


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
SACRED_COMMANDS = [
    ("Sacred_Figure", Figure()),
    ("Sacred_Solid", Solid()),
    ("Sacred_Geodesic", Geodesic()),
    ("Sacred_SunRose", SunRoseCmd()),
    ("Sacred_Orient", Orient()),
    ("Sacred_Snap", Snap()),
    ("Sacred_Report", Report()),
]
BIO_COMMANDS = [
    ("Bio_Gridshell", GridshellCmd()),
    ("Bio_Net", NetCmd()),
    ("Bio_Cells", Cells()),
    ("Bio_VeinLeaf", VeinLeaf()),
    ("Bio_Column", Column()),
]
ALL = dict(COMMANDS + SACRED_COMMANDS + BIO_COMMANDS)

if App.GuiUp:
    for _name, _cmd in ALL.items():
        Gui.addCommand(_name, _cmd)

NAMES = [n for n, _c in COMMANDS]
SACRED_NAMES = [n for n, _c in SACRED_COMMANDS]
BIO_NAMES = [n for n, _c in BIO_COMMANDS]
