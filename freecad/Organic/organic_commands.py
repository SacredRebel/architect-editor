# -*- coding: utf-8 -*-
"""Organic: the toolbars' commands.

Three toolbars: Organic (walls, shells, vaults, domes, the building and the way to the map),
Sacred (plan figures, regular solids, the sun, proportions) and Biomimetic (nets, cellular
walls, veined shells, branching columns).

A command's work is its make(): it takes the document and, where it acts on a selection, the
selected objects, so it runs the same from a button and from a script without a window.
"""

import math
import os

import FreeCAD as App
import FreeCADGui as Gui

import organic_export as ox
import organic_geom as og
import organic_import as oi
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
    """The BIM building the user made active in this document (double-click in the tree), else
    the only one it has. A building made active in another open document is not this one's."""
    if App.GuiUp:
        try:
            b = Gui.getDocument(doc.Name).ActiveView.getActiveObject("Arch")
            if b is not None and b.Document.Name == doc.Name:
                return b
        except Exception:
            pass
    buildings = [o for o in doc.Objects if is_building(o)]
    return buildings[0] if len(buildings) == 1 else None


def make_active(building):
    """Make a building the one new Organic objects go into (as a double-click in the tree does)."""
    if App.GuiUp:
        try:
            Gui.getDocument(building.Document.Name).ActiveView.setActiveObject("Arch", building)
        except Exception:
            pass


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


class PickWatch:
    """Remembers where the last click in the 3D view landed. FreeCAD keeps the clicked point
    of a solid's face in the selection itself, but not that of a terrain mesh: this hears it."""

    def __init__(self):
        self.last = None

    def addSelection(self, doc, obj, sub, pnt):
        clicked = pnt is not None and any(abs(c) > 1e-9 for c in pnt)  # a selection made in the tree carries (0, 0, 0)
        self.last = (doc, obj, App.Vector(*pnt)) if clicked else None

    def removeSelection(self, doc, obj, sub):
        self.last = None

    def clearSelection(self, doc):
        self.last = None


try:
    _WATCH
except NameError:
    _WATCH = None
if App.GuiUp:
    if _WATCH is not None:  # this module loaded again: the old ear is taken off first
        try:
            Gui.Selection.removeObserver(_WATCH)
        except Exception:
            pass
    _WATCH = PickWatch()
    Gui.Selection.addObserver(_WATCH)


def picks():
    """[(object, the point clicked on it or None)] for what is selected in the window."""
    if not App.GuiUp:
        return []
    out = []
    for s in Gui.Selection.getSelectionEx():
        point = s.PickedPoints[0] if s.PickedPoints else None
        heard = _WATCH.last if _WATCH is not None else None
        if point is None and heard is not None and heard[0] == s.Object.Document.Name and heard[1] == s.Object.Name:
            point = heard[2]
        out.append((s.Object, point))
    return out


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


arc_length_at = og.arc_length_at  # metres along a wall's line to the point clicked on it


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
           "+Y true north, Z = 0 on the ground there, 425.63 m). Click the land first (the site template's "
           "terrain) and the building stands where you clicked, on the ground there; without a click it "
           "stands at the origin. Double-click it in the tree to make it active: new Organic objects go "
           "into it, at its placement.")

    def make(self, doc, picked=None):
        b = oi.make_building(doc, "Organic building")
        spot = next((p for o, p in (picks() if picked is None else picked) if p is not None and o.isDerivedFrom("Mesh::Feature")), None)
        if spot is not None:  # the land (a terrain mesh) was clicked first: the building stands there, on the ground that was clicked
            b.Placement = App.Placement(App.Vector(spot.x, spot.y, spot.z), App.Rotation())
            say("the building stands where the land was clicked: %.2f m east, %.2f m north of the document's origin, %+.2f m" % (spot.x / MM, spot.y / MM, spot.z / MM))
        make_active(b)
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


DOOR = dict(width_m=1.0, height_m=2.2, sill_m=0.0, shape="Arch")   # the map's build mode sets the same door
DOOR_BELOW = 0.6  # metres above the wall's base: a click below this is a door, above it a window


class Opening(Command):
    pixmap = "OrganicOpening.svg"
    menu = "Opening"
    tip = ("An arched opening in the selected Organic wall, centred where you clicked it: a door (1.0 x 2.2 m "
           "from the floor) when you click the wall near its foot, a window (1.2 x 1.3 m, sill 0.9 m) when "
           "you click higher up; a window at the middle of the wall when it was selected in the tree. Edit "
           "width, height, sill and shape (Rect, Arch, Pointed, Round) in the wall's Openings lists.")

    def make(self, doc, picked=None):
        done = []
        for w, point in (picks() if picked is None else picked):
            if not is_kind(w, "Wall"):
                continue
            edge, _closed = oo.base_edge(w, corners=True)  # in the wall's own frame, as the click must be
            if edge is None:
                edge = og.arc_curve(5.0, 120.0)
            door = False
            if point is not None:
                local = w.Placement.inverse().multVec(point)
                pos = arc_length_at(edge, local)
                door = (local.z - edge.valueAt(edge.FirstParameter).z) / MM - oo.m(w.BaseOffset) < DOOR_BELOW
            else:
                pos = edge.Length / MM / 2
            oo.add_opening(w, pos, **(DOOR if door else {}))
            say("%s: a %s, %.2f m along it" % (w.Label, "door" if door else "window", pos))
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
        oo.paint(a)  # a member's colour, not the roof's it was made with
        return [place(a, doc)]


class WaveVault(Command):
    pixmap = "OrganicWaveVault.svg"
    menu = "Wave vault"
    tip = ("A vault whose rise goes up and down as a wave along its length (Eladio Dieste's Gaussian vaults: the "
           "wave gives a thin vault depth against buckling). A hanging-chain section everywhere, 8 m span, rise "
           "2.4 m ± 0.6 m, three waves over 18 m, on walls 2.2 m high under its springings. It is the Ribbed "
           "vault with two more numbers: WaveAmplitude and Waves.")
    WALLS = 2.2  # metres: the walls under its springings (the vault's own Plinth), so that it stands on the ground

    def make(self, doc):
        v = oo.make(oo.Vault, "WaveVault", "Wave vault", doc)
        v.Profile = "Catenary"
        v.Span, v.Rise, v.Thickness, v.VaultLength = 8.0 * MM, 2.4 * MM, 0.12 * MM, 18.0 * MM
        v.Ribs = 0
        v.WaveAmplitude, v.Waves = 0.6 * MM, 3
        v.Plinth = self.WALLS * MM
        v.Placement = App.Placement(App.Vector(0, 0, self.WALLS * MM), App.Rotation())  # its springings that high: its walls' feet on the ground
        return [place(v, doc)]


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
    pixmap = "OrganicSaddle.svg"
    menu = "Saddle shell"
    tip = ("A saddle shell. Its Kind says which: Hypar, one hyperbolic paraboloid over a rectangle; Groined "
           "saddles, saddles about one centre whose lobes rise to their tips and whose groins run down to "
           "supports on the ground (eight lobes: four saddles, Candela's Los Manantiales; Lobes may be 4 to 16); "
           "Catenoid, the minimal-surface tower.")

    def make(self, doc):
        return [place(oo.make(oo.MinimalShell, "SaddleShell", "Saddle shell", doc), doc)]


class ConoidCmd(Command):
    pixmap = "OrganicConoid.svg"
    menu = "Conoid roof"
    tip = ("A conoid shell: a straight line slides with one end on an arch and the other on a level line (the "
           "north-light roof). 9 m span, 12 m long, the arch rising 3 m, eaves 2.6 m, 0.08 m thick.")

    def make(self, doc):
        return [place(oo.make(oo.Conoid, "Conoid", "Conoid roof", doc), doc)]


class Translation(Command):
    pixmap = "OrganicTranslation.svg"
    menu = "Translation shell"
    tip = ("A translation shell: one arch slid along another, both curving down, over a rectangle. 10 m by 14 m, "
           "rising 1.6 m across and 2.2 m along, its corners 2.6 m up, 0.08 m thick.")

    def make(self, doc):
        return [place(oo.make(oo.TranslationShell, "TranslationShell", "Translation shell", doc), doc)]


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


# ---------------------------------------------------------------- from the map, to the map
class ImportMap(Command):
    pixmap = "OrganicImport.svg"
    menu = "Import from the map"
    tip = ("Rebuilds a building that was drawn in the map (exchange\\godot\\built\\<name>.json: its plan "
           "curves, walls with their openings, floors and steps, roofs, domes, vaults) out of this "
           "toolbar's own objects, at its place on the site: every number set in the map is the same "
           "property here, every wall a real solid. Says what it did not understand.")

    def make(self, doc, path=None):
        if path is None:
            if not App.GuiUp:
                raise ValueError("no file given")
            folder = oi.built_dir()
            path = ask_file(self.menu, folder if os.path.isdir(folder) else ox.exchange_dir(), "Buildings drawn in the map (*.json)")
            if not path:
                return []
        res = oi.import_built(doc, path)
        b = res["building"]
        make_active(b)
        at = b.Placement
        say("%s: %d elements rebuilt from %s; it stands %.2f m east, %.2f m north of the document's origin, %+.2f m, turned %.1f°"
            % (res["name"], len(res["made"]), os.path.basename(path), at.Base.x / MM, at.Base.y / MM, at.Base.z / MM, ox.yaw_of(at)))
        for note in res["notes"]:
            App.Console.PrintWarning("Organic: %s\n" % note)
        self.last = res
        return [b]


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
    tip = ("A geodesic dome shell of real thickness: radius, frequency (how finely the icosahedron is cut) and how much "
           "of the sphere stands. Frame turns it into struts and node balls (the Geodesic frame button makes that).")

    def make(self, doc):
        return [place(oo.make(oo.GeodesicDome, "GeodesicDome", "Geodesic dome", doc), doc)]


class GeodesicFrame(Command):
    pixmap = "SacredFrame.svg"
    menu = "Geodesic frame"
    tip = ("A geodesic dome as a frame: a strut along every edge, a ball at every node, the foot set level. "
           "10 m across at frequency 3, five rows of triangles (the five-eighths dome): 165 struts of three "
           "lengths. StrutList is its cutting list.")

    def make(self, doc):
        d = oo.make(oo.GeodesicDome, "GeodesicFrame", "Geodesic frame", doc)
        d.Radius, d.Frequency, d.Portion, d.StrutSection = 5.0 * MM, 3, 0.625, 0.09 * MM
        d.Frame = True
        return [place(d, doc)]


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
            reach = 0.0  # how far the building reaches from its origin in plan: the rose shows beyond it
            for el in ox.elements_of(b):
                bb = el.Shape.optimalBoundingBox(False, False)  # from the geometry: a plain BoundBox reads the window's triangles when there are any
                reach = max([reach] + [math.hypot(x - b.Placement.Base.x, y - b.Placement.Base.y) for x in (bb.XMin, bb.XMax) for y in (bb.YMin, bb.YMax)])
            if reach > 0:
                rose.Size = max(12.0, math.ceil(1.6 * reach / MM)) * MM
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


def show_table(title, rows, note=""):
    """A small window with a table (its first row the headings), beside the design, not modal."""
    try:
        from PySide import QtCore, QtWidgets
    except ImportError:
        return None
    dlg = QtWidgets.QDialog(Gui.getMainWindow())
    dlg.setObjectName("OrganicTable")
    dlg.setWindowTitle(title)
    dlg.setAttribute(QtCore.Qt.WA_DeleteOnClose, True)
    layout = QtWidgets.QVBoxLayout(dlg)
    table = QtWidgets.QTableWidget(max(0, len(rows) - 1), len(rows[0]) if rows else 0, dlg)
    if rows:
        table.setHorizontalHeaderLabels([str(c) for c in rows[0]])
    for r, row in enumerate(rows[1:]):
        for c, value in enumerate(row):
            item = QtWidgets.QTableWidgetItem(str(value))
            item.setFlags(item.flags() & ~QtCore.Qt.ItemIsEditable)
            table.setItem(r, c, item)
    table.resizeColumnsToContents()
    layout.addWidget(table)
    if note:
        layout.addWidget(QtWidgets.QLabel(note, dlg))
    close = QtWidgets.QPushButton("Close", dlg)
    close.clicked.connect(dlg.close)
    layout.addWidget(close)
    dlg.resize(min(1300, table.horizontalHeader().length() + 90), min(640, 150 + 31 * max(1, len(rows) - 1)))
    dlg.show()
    return dlg


def ask_file(title, folder, pattern):
    """A file chosen in the usual window; None when it is closed."""
    try:
        from PySide import QtWidgets
    except ImportError:
        return None
    path, _filter = QtWidgets.QFileDialog.getOpenFileName(Gui.getMainWindow(), title, folder, pattern)
    return path or None


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
                # as text: a sheet shows a number rounded to the user's decimals (2.24 for 1 : 2.2361)
                sheet.set("%s%d" % (chr(ord("A") + c), r + 1), "'" + str(value))
        for c, width in enumerate((150, 170, 80, 80, 110, 110, 110, 160, 80, 110, 110, 80)):
            sheet.setColumnWidth(chr(ord("A") + c), width)
        say("proportions report: %d rows, system %s, module %.4f m" % (len(rows) - 1, p.System, oo.m(p.Module)))
        if App.GuiUp:  # shown at once in a small window: opening the sheet itself would leave this workbench
            try:
                self.window.close()  # the one before, if it is still open
            except Exception:
                pass
            self.window = show_table("Proportions report: %s, module %.4f m" % (p.System, oo.m(p.Module)), rows,
                                     "Kept in the document as the spreadsheet \"Proportions report\".")
        return [sheet]


# ================================================================ the Biomimetic tab
def shells_in(selected):
    """The solid shells among objects, for laths to lie on: any solid that is not itself a
    lattice or a wall (a dome, a vault, a leaf, a conoid, a saddle, a shell roof)."""
    out = []
    for s in selected:
        shape = getattr(s, "Shape", None)
        if shape is None or shape.isNull() or not shape.Solids or is_building(s):
            continue
        if any(is_kind(s, kind) for kind in ("Gridshell", "Wall", "CellularWall", "Slab", "Steps", "BranchingColumn")):
            continue
        out.append(s)
    return out


class GridshellCmd(Command):
    pixmap = "BioGridshell.svg"
    menu = "Gridshell"
    tip = ("On each selected shell (a dome, a vault, a leaf, a conoid, a saddle): laths lying on its back both "
           "ways, with a beam along its edges; Turn 45 makes a diagrid, Layers 2 a second lath on each. On each "
           "selected closed curve (without a selection, a 6 m circle): a gridshell of laths in the form a net "
           "takes when every node is in balance, turned over so it stands in compression. Spacing, rise, lath "
           "size and the edge beam are properties.")
    hanging = False

    def make(self, doc, selected=None):
        chosen = selection() if selected is None else selected
        out = []
        for s in ([] if self.hanging else shells_in(chosen)):  # laths on a shell: where the shell lies
            g = oo.make(oo.Gridshell, "Gridshell", self.menu, doc)
            g.Shell = s
            g.Placement = s.Placement
            for parent in s.InList:
                if is_building(parent):
                    parent.addObject(g)
            out.append(g)
        if out:
            return out
        for c in curves_in(chosen) or [None]:
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
    ("Organic_WaveVault", WaveVault()),
    ("Organic_Arch", ArchCmd()),
    ("Organic_Dome", Dome()),
    ("Organic_SoapFilm", SoapFilm()),
    ("Organic_Hypar", Hypar()),
    ("Organic_Conoid", ConoidCmd()),
    ("Organic_Translation", Translation()),
    ("Organic_Slab", Slab()),
    ("Organic_ExportGodot", ExportGodot()),
    ("Organic_ImportMap", ImportMap()),
]
SACRED_COMMANDS = [
    ("Sacred_Figure", Figure()),
    ("Sacred_Solid", Solid()),
    ("Sacred_Geodesic", Geodesic()),
    ("Sacred_GeodesicFrame", GeodesicFrame()),
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

# FreeCAD keeps the first object a command name was registered with, for as long as it runs. When
# this module is loaded again (the installer does, to update a running FreeCAD), each button
# keeps its object and that object is given this code, so the toolbar runs what the files say.
try:
    _REGISTERED
except NameError:
    _REGISTERED = {}
if App.GuiUp:
    for _name, _cmd in list(ALL.items()):
        if _name in _REGISTERED:
            _REGISTERED[_name].__class__ = type(_cmd)
            ALL[_name] = _REGISTERED[_name]
        else:
            Gui.addCommand(_name, _cmd)
            _REGISTERED[_name] = _cmd
    COMMANDS = [(n, ALL[n]) for n, _c in COMMANDS]
    SACRED_COMMANDS = [(n, ALL[n]) for n, _c in SACRED_COMMANDS]
    BIO_COMMANDS = [(n, ALL[n]) for n, _c in BIO_COMMANDS]

NAMES = [n for n, _c in COMMANDS]
SACRED_NAMES = [n for n, _c in SACRED_COMMANDS]
BIO_NAMES = [n for n, _c in BIO_COMMANDS]
