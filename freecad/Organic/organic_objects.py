# -*- coding: utf-8 -*-
"""Organic: parametric FreeCAD objects.

Every length is a FreeCAD length property (a metre document shows metres); every object's
Shape is a closed solid, except a plan curve's. Each solid carries an IfcType, which the BIM
IFC exporter writes as that IFC class.
"""

import math
import os

import FreeCAD as App
import Part

import organic_biomimetic as ob
import organic_geom as og
import organic_sacred as sacred

MM = og.MM
ICONS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
IFC_TYPES = ["Wall", "Roof", "Slab", "Member", "Covering", "Column", "Stair", "Building Element Proxy"]


def m(q):
    """A length or float property, in metres."""
    return float(q.Value) / MM if hasattr(q, "Value") else float(q)


def prop(obj, kind, name, group, tip, value=None, enum=None):
    if name in obj.PropertiesList:
        return
    obj.addProperty(kind, name, group, tip)
    if enum is not None:
        setattr(obj, name, enum)
    if value is not None:
        setattr(obj, name, value)


def length(obj, name, group, tip, metres):
    prop(obj, "App::PropertyLength", name, group, tip, metres * MM)


def distance(obj, name, group, tip, metres):
    prop(obj, "App::PropertyDistance", name, group, tip, metres * MM)


def set_local(obj, shape):
    """Assign a shape built in the object's own frame, keeping the object's placement.

    A shape that was moved or turned as a whole (translate, rotate, or built on a moved edge)
    carries that move as its own placement, and an object's placement replaces its shape's:
    the move would be lost (a vault was not centred, a solid did not stand on its face, a slab
    on a curve 5 m away lay at the origin). The move is written into the geometry first."""
    pl = obj.Placement
    obj.Shape = og.baked(shape)
    obj.Placement = pl
    proxy = getattr(obj, "Proxy", None)
    if proxy is not None:  # what this solid was built from, and how often it has been built
        proxy._key = getattr(proxy, "_pending", None)
        proxy.builds = getattr(proxy, "builds", 0) + 1


SKIPPED_GROUPS = ("Base", "Measures", "IFC", "Attachment", "From the map", "")
KEYED_TYPES = ("App::PropertyLength", "App::PropertyDistance", "App::PropertyAngle", "App::PropertyFloat", "App::PropertyInteger", "App::PropertyBool",
               "App::PropertyEnumeration", "App::PropertyString", "App::PropertyFloatList", "App::PropertyStringList", "App::PropertyVectorList", "App::PropertyLink",
               "App::PropertyVector", "App::PropertyPosition")


def shape_key(obj):
    """Everything an object's solid is made from: its own numbers and, in the object's own
    frame, the curve it stands on. Where the object stands is not among them."""
    own = []
    for name in sorted(obj.PropertiesList):
        kind = obj.getTypeIdOfProperty(name)
        if kind not in KEYED_TYPES or obj.getGroupOfProperty(name) in SKIPPED_GROUPS:
            continue
        value = getattr(obj, name)
        if kind == "App::PropertyLink":
            if value is None or not hasattr(value, "Shape") or value.Shape.isNull():
                own.append((name, None))
                continue
            back = obj.Placement.inverse()
            shape = value.Shape
            points = [back.multVec(v.Point) for v in shape.Vertexes] + [back.multVec(e.valueAt((e.FirstParameter + e.LastParameter) / 2)) for e in shape.Edges]
            own.append((name, value.Name, len(shape.Edges), round(shape.Length, 2), tuple((round(p.x, 2), round(p.y, 2), round(p.z, 2)) for p in points)))
        elif kind in ("App::PropertyLength", "App::PropertyDistance", "App::PropertyAngle"):
            own.append((name, round(float(value.Value if hasattr(value, "Value") else value), 6)))
        elif kind == "App::PropertyVectorList":
            own.append((name, tuple((round(v.x, 6), round(v.y, 6), round(v.z, 6)) for v in value)))
        elif kind in ("App::PropertyVector", "App::PropertyPosition"):
            own.append((name, (round(value.x, 6), round(value.y, 6), round(value.z, 6))))
        elif kind in ("App::PropertyFloatList", "App::PropertyStringList"):
            own.append((name, tuple(value)))
        else:
            own.append((name, value))
    return tuple(own)


def base_edge(obj, closed_required=False, corners=False):
    """The object's Base as one smooth horizontal edge in the object's own frame, and whether
    it is closed. With `corners`, a closed outline that has corners comes back as it is (an
    og.WirePath), for walls, which keep them.

    Solids are built there, near the origin, wherever the building stands and however it is
    turned: OCCT's booleans and its volume integration lose accuracy with distance from the
    origin (a wave-topped wall built 116 m out and turned 30° could not be finished)."""
    base = getattr(obj, "Base", None)
    if base is None or not hasattr(base, "Shape") or base.Shape.isNull():
        return None, False
    outline = getattr(getattr(base, "Proxy", None), "outline", None)  # a figure's outline, less its construction lines
    local = (outline(base) if outline else base.Shape).copy()
    local.Placement = obj.Placement.inverse().multiply(local.Placement)
    edge, closed = (og.plan_path if corners else og.plan_edge)(og.baked(local))  # the curve itself in this frame
    if closed_required and not closed:
        raise ValueError("%s needs a closed base curve" % obj.Label)
    return edge, closed


class Organic:
    """Shared by every Organic object: the IFC class, and saving nothing but properties."""

    ifc_type = "Building Element Proxy"
    icon = "Organic.svg"

    def __init__(self, obj):
        obj.Proxy = self
        self.Type = type(self).__name__
        self.setup(obj)

    def setup(self, obj):
        prop(obj, "App::PropertyEnumeration", "IfcType", "IFC", "IFC class written on export", enum=IFC_TYPES)
        if self.ifc_type in IFC_TYPES and obj.IfcType == IFC_TYPES[0] and self.ifc_type != IFC_TYPES[0]:
            obj.IfcType = self.ifc_type

    def onDocumentRestored(self, obj):
        self.setup(obj)
        dress_later(obj.Document)

    def fresh(self, obj):
        """Whether the solid is still what its numbers and its base curve say: then only its
        place changed (the building was moved or turned), and it is not built again. A move
        would otherwise cost as long as building everything (half a minute for a small house)."""
        self._pending = shape_key(obj)
        return getattr(self, "_key", None) == self._pending and not obj.Shape.isNull()

    def dumps(self):
        return None

    def loads(self, state):
        return None

    __getstate__ = dumps

    def __setstate__(self, state):
        return None


# ---------------------------------------------------------------- plan curves
CURVE_KINDS = ["Lobed", "Circle", "Arc", "S-curve", "Oval", "Leaf", "Shell", "Golden spiral", "Log spiral", "Vesica", "Points"]
CLOSED_KINDS = {"Lobed", "Circle", "Oval", "Leaf", "Shell", "Vesica"}
DEFAULT_POINTS = [(0.0, 0.0), (4.0, 0.0), (7.0, 2.5), (7.0, 6.0)]  # metres: what a Points curve shows before it is given its own


class PlanCurve(Organic):
    """A parametric plan curve: plugin-eco's organic perimeters (lobed, oval, leaf, shell),
    arcs and waves for walls, the sacred-geometry kit's spirals and vesica, and a curve
    through given points (smooth, or straight runs that keep the points as corners): what a
    wall drawn in the map or listed in a house spec stands on."""

    ifc_type = "Building Element Proxy"
    icon = "OrganicCurve.svg"

    def setup(self, obj):
        g = "Curve"
        prop(obj, "App::PropertyEnumeration", "Kind", g, "the plan figure", enum=CURVE_KINDS)
        length(obj, "Radius", g, "radius (lobed, circle, arc, oval, leaf, shell, vesica); start radius for spirals", 8.0)
        prop(obj, "App::PropertyInteger", "Lobes", g, "number of lobes", 5)
        prop(obj, "App::PropertyFloat", "Depth", g, "lobe depth as a fraction of the radius (0-0.6)", 0.35)
        prop(obj, "App::PropertyAngle", "Turn", g, "rotation of the figure", 0.0)
        length(obj, "Inset", g, "closed figures: every point moved toward the centroid (plugin-eco's wall ring inset)", 0.0)
        prop(obj, "App::PropertyAngle", "Angle", g, "arc sweep", 120.0)
        length(obj, "Length", g, "S-curve length", 12.0)
        length(obj, "Amplitude", g, "S-curve amplitude", 1.5)
        prop(obj, "App::PropertyFloat", "Waves", g, "S-curve waves", 1.0)
        prop(obj, "App::PropertyFloat", "Turns", g, "spiral turns", 1.5)
        prop(obj, "App::PropertyFloat", "Pitch", g, "log spiral growth per quarter turn", 1.2)
        g = "Points"
        prop(obj, "App::PropertyVectorList", "Points", g, "Points: the points the curve goes through, in the curve's own frame (x east, y north), in millimetres")
        prop(obj, "App::PropertyBool", "Smooth", g, "Points: one smooth curve through the points, as the map draws it (off: straight runs, the points are corners)", True)
        prop(obj, "App::PropertyBool", "Closed", g, "Points: join the last point back to the first", False)

    def execute(self, obj):
        kind, r = obj.Kind, m(obj.Radius)
        if kind == "Points":  # the points say where it lies: Turn and Inset are not applied (the map's build mode does the same)
            pts = [(p.x / MM, p.y / MM) for p in obj.Points] or DEFAULT_POINTS
            set_local(obj, og.points_curve(pts, obj.Smooth, obj.Closed))
            return
        if kind == "Circle":
            pts = og.perimeter_points("Fit", r)
        elif kind in ("Lobed", "Oval", "Leaf", "Shell"):
            pts = og.perimeter_points(kind, r, obj.Lobes, obj.Depth, 0.0)
        else:
            pts = None
        if pts is not None:
            pts = og.inset_ring(pts, m(obj.Inset))
            pts = [og.rotate_xy(p, float(obj.Turn)) for p in pts]
            shape = og.through_points(pts, closed=True)
        elif kind == "Arc":
            shape = og.arc_curve(r, float(obj.Angle), float(obj.Turn))
        elif kind == "S-curve":
            shape = og.s_curve(m(obj.Length), m(obj.Amplitude), obj.Waves)
            shape.rotate(App.Vector(), og.Z, float(obj.Turn))
        elif kind == "Golden spiral":
            shape = og.golden_spiral(r, obj.Turns)
            shape.rotate(App.Vector(), og.Z, float(obj.Turn))
        elif kind == "Log spiral":
            shape = og.log_spiral(r, obj.Turns, obj.Pitch)
            shape.rotate(App.Vector(), og.Z, float(obj.Turn))
        else:  # Vesica
            shape = og.vesica_curve(r)
            shape.rotate(App.Vector(), og.Z, float(obj.Turn))
        set_local(obj, shape if shape.ShapeType == "Wire" else Part.Wire(shape))


# ---------------------------------------------------------------- walls
class Wall(Organic):
    """A curved wall of real thickness on a base curve (any open or closed plan curve: an
    Organic curve, a sketch, a Draft B-spline), with a shaped top and openings.

    Openings are lists read together, one entry per opening, in metres: the centre's
    distance along the centreline, the width, the height, the sill, and the shape
    (Rect, Arch, Pointed, Round)."""

    ifc_type = "Wall"
    icon = "OrganicWall.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Wall"
        prop(obj, "App::PropertyLink", "Base", g, "the plan curve the wall follows")
        length(obj, "Thickness", g, "wall thickness", 0.30)
        length(obj, "Height", g, "wall height above its base", 2.70)
        prop(obj, "App::PropertyEnumeration", "Align", g, "the wall's side of its base curve", enum=["Center", "Left", "Right"])
        prop(obj, "App::PropertyEnumeration", "Top", g, "the top line", enum=["Flat", "Arch", "Wave", "Slope"])
        distance(obj, "TopRise", g, "the top line's rise above Height", 0.0)
        prop(obj, "App::PropertyInteger", "TopWaves", g, "waves along a Wave top", 3)
        length(obj, "Foundation", g, "depth the wall runs below its base", 0.0)
        distance(obj, "BaseOffset", g, "the base's height above the base curve", 0.0)
        g = "Openings"
        prop(obj, "App::PropertyFloatList", "OpeningPositions", g, "centre of each opening along the centreline (m)")
        prop(obj, "App::PropertyFloatList", "OpeningWidths", g, "width of each opening (m)")
        prop(obj, "App::PropertyFloatList", "OpeningHeights", g, "height of each opening (m)")
        prop(obj, "App::PropertyFloatList", "OpeningSills", g, "sill of each opening above the base (m)")
        prop(obj, "App::PropertyStringList", "OpeningShapes", g, "Rect, Arch, Pointed or Round")
        prop(obj, "App::PropertyFloat", "CentrelineLength", "Measures", "length of the centreline (m)")
        obj.setEditorMode("CentrelineLength", 1)

    def openings(self, obj):
        n = len(obj.OpeningPositions)
        out = []
        for i in range(n):
            pick = lambda lst, d: lst[i] if i < len(lst) else d
            out.append(dict(position_m=obj.OpeningPositions[i], width_m=pick(obj.OpeningWidths, 1.2),
                            height_m=pick(obj.OpeningHeights, 1.3), sill_m=pick(obj.OpeningSills, 0.9),
                            shape=pick(obj.OpeningShapes, "Arch")))
        return out

    def execute(self, obj):
        if self.fresh(obj):
            return
        edge, closed = base_edge(obj, corners=True)
        if edge is None:
            edge, closed = og.arc_curve(5.0, 120.0), False
        obj.CentrelineLength = edge.Length / MM
        set_local(obj, og.wall_shape(edge, closed, m(obj.Thickness), m(obj.Height), obj.Align, obj.Top, m(obj.TopRise),
                                     obj.TopWaves, self.openings(obj), m(obj.BaseOffset), m(obj.Foundation)))


def add_opening(wall, position_m, width_m=1.2, height_m=1.3, sill_m=0.9, shape="Arch"):
    """Append one opening to an Organic wall's lists."""
    wall.OpeningPositions = list(wall.OpeningPositions) + [float(position_m)]
    wall.OpeningWidths = list(wall.OpeningWidths) + [float(width_m)]
    wall.OpeningHeights = list(wall.OpeningHeights) + [float(height_m)]
    wall.OpeningSills = list(wall.OpeningSills) + [float(sill_m)]
    wall.OpeningShapes = list(wall.OpeningShapes) + [str(shape)]


# ---------------------------------------------------------------- vaults and arches
class Vault(Organic):
    """A barrel vault (or, short, an arch) along the object's +Y, springing from its base; or,
    with a Base, along that open plan curve (the map's vault on a drawn spine).

    Profiles: Ellipse (plugin-eco's barrel), Semicircle, Segmental and Pointed (exact
    circles), Catenary (the hanging-chain arch, plugin-hagia-sophia's fit) and Parabola.
    Ribs are arches of RibWidth that stand RibDepth under the intrados (a straight vault's
    only). ThrustInMiddleThird is plugin-hagia-sophia's Poleni check on the ring."""

    ifc_type = "Roof"
    icon = "OrganicVault.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Vault"
        prop(obj, "App::PropertyLink", "Base", g, "an open plan curve the barrel follows (none: straight, VaultLength along its own Y)")
        prop(obj, "App::PropertyEnumeration", "Profile", g, "the arch curve",
             enum=["Ellipse", "Semicircle", "Segmental", "Pointed", "Catenary", "Parabola"])
        length(obj, "Span", g, "clear span between the springings", 8.0)
        length(obj, "Rise", g, "rise of the intrados (a semicircle's is half the span)", 3.5)
        length(obj, "Thickness", g, "shell thickness", 0.15)
        length(obj, "VaultLength", g, "length along the barrel", 16.0)
        prop(obj, "App::PropertyInteger", "Ribs", g, "ribs spread along the barrel (0: none)", 5)
        length(obj, "RibWidth", g, "rib width along the barrel", 0.25)
        length(obj, "RibDepth", g, "rib depth under the intrados", 0.15)
        length(obj, "Plinth", g, "depth of a plinth under the springings, below the base: for ground that falls away (0: none)", 0.0)
        prop(obj, "App::PropertyBool", "ThrustInMiddleThird", "Measures", "Poleni: the catenary of the ring's centreline stays within its middle third")
        prop(obj, "App::PropertyFloat", "ThrustDeviation", "Measures", "the largest distance of that catenary from the centreline (m)")
        for p in ("ThrustInMiddleThird", "ThrustDeviation"):
            obj.setEditorMode(p, 1)

    def execute(self, obj):
        if self.fresh(obj):
            return
        spine, closed = base_edge(obj)
        if spine is not None:
            if closed:
                raise ValueError("%s runs along an open curve; this one is closed" % obj.Label)
            shape = og.vault_on_curve(obj.Profile, m(obj.Span), m(obj.Rise), m(obj.Thickness), spine, m(obj.Plinth))
        else:
            shape = og.vault_shape(obj.Profile, m(obj.Span), m(obj.Rise), m(obj.Thickness), m(obj.VaultLength),
                                   obj.Ribs, m(obj.RibWidth), m(obj.RibDepth), m(obj.Plinth))
        ok, worst = og.thrust_line_ok(obj.Profile, m(obj.Span), m(obj.Rise), m(obj.Thickness))
        obj.ThrustInMiddleThird, obj.ThrustDeviation = bool(ok), float(worst)
        set_local(obj, shape)


# ---------------------------------------------------------------- domes
class Dome(Organic):
    """A dome shell standing on its base: Ellipse (plugin-hagia-sophia's circular meridian),
    Sphere (an exact cap), Catenary, Parabola or Onion, with an optional oculus."""

    ifc_type = "Roof"
    icon = "OrganicDome.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Dome"
        prop(obj, "App::PropertyEnumeration", "Profile", g, "the meridian", enum=["Ellipse", "Sphere", "Catenary", "Parabola", "Onion"])
        length(obj, "Radius", g, "base radius", 5.0)
        length(obj, "Rise", g, "height of the crown above the base", 5.5)
        length(obj, "Thickness", g, "shell thickness", 0.30)
        length(obj, "Oculus", g, "radius of the opening at the crown (0: none)", 0.0)
        prop(obj, "App::PropertyFloat", "StretchX", g, "an oval plan: the round dome stretched this much along its own X (the map's oval: 1.2)", 1.0)
        prop(obj, "App::PropertyFloat", "StretchY", g, "and this much along its own Y (the map's oval: 0.75)", 1.0)

    def execute(self, obj):
        if self.fresh(obj):
            return
        set_local(obj, og.dome_shape(obj.Profile, m(obj.Radius), m(obj.Rise), m(obj.Thickness), m(obj.Oculus), obj.StretchX, obj.StretchY))


# ---------------------------------------------------------------- leaf shells
class LeafShell(Organic):
    """plugin-eco's leaf shell roof, as a solid: an outline (the eco ellipse, or pointed),
    a ridge along the spine with a height at each of its four points, the eave height at
    the outline, a curl, a true thickness, and ribs across the spine."""

    ifc_type = "Roof"
    icon = "OrganicLeaf.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Leaf shell"
        prop(obj, "App::PropertyEnumeration", "Outline", g, "the plan outline", enum=["Ellipse", "Pointed"])
        length(obj, "Spine", g, "length along the ridge", 26.0)
        length(obj, "LeafSpan", g, "width across the spine", 13.0)
        prop(obj, "App::PropertyFloatList", "RidgeHeights", g, "heights at the ridge's four points above the base (m)", [3.0, 7.2, 9.8, 3.0])
        length(obj, "Eave", g, "eave height above the base", 3.0)
        prop(obj, "App::PropertyFloat", "RiseFactor", g, "scales the ridge above the eave", 1.0)
        prop(obj, "App::PropertyFloat", "Curvature", g, "mid-span curl (0: straight falloff)", 0.15)
        length(obj, "Thickness", g, "shell thickness", 0.12)
        length(obj, "RibSpacing", g, "ribs across the spine every (0: none)", 2.5)
        length(obj, "RibDepth", g, "rib depth under the shell", 0.10)
        length(obj, "RibWidth", g, "rib width", 0.12)
        length(obj, "Plinth", g, "depth of a footing under each tip, below the base (0: none)", 0.0)
        length(obj, "Foot", g, "length of each footing along the spine (0: 6 % of the spine)", 0.0)
        prop(obj, "App::PropertyEnumeration", "RibPattern", g, "straight ribs across the spine, or ribs grown as a leaf's veins", enum=["Straight", "Veins"])
        prop(obj, "App::PropertyInteger", "VeinSources", g, "veins: how many points the veins grow towards (more: a finer pattern)", 180)
        prop(obj, "App::PropertyInteger", "VeinSeed", g, "veins: another number, another pattern", 1)
        prop(obj, "App::PropertyFloat", "Asymmetry", g, "how far the midrib swings off the spine: 1 the leaf as it grows, 0 a straight midrib and two equal halves", 1.0)

    def execute(self, obj):
        if self.fresh(obj):
            return
        heights = list(obj.RidgeHeights) if len(obj.RidgeHeights) == 4 else [3.0, 7.2, 9.8, 3.0]
        set_local(obj, og.leaf_shell_shape(m(obj.Spine), m(obj.LeafSpan), heights, m(obj.Eave), obj.RiseFactor,
                                           obj.Curvature, m(obj.Thickness), m(obj.RibSpacing), m(obj.RibDepth),
                                           m(obj.RibWidth), obj.Outline, m(obj.Plinth), m(obj.Foot),
                                           obj.RibPattern == "Veins", max(20, obj.VeinSources), obj.VeinSeed, obj.Asymmetry))


# ---------------------------------------------------------------- roofs, slabs, films on a closed base
class ShellRoof(Organic):
    """plugin-eco's organic-building roof over a closed base curve: eaves + rise (1 - ρ^2.2)
    from the pole of inaccessibility to the wall, drooping past it to the overhang."""

    ifc_type = "Roof"
    icon = "OrganicRoof.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Shell roof"
        prop(obj, "App::PropertyLink", "Base", g, "the closed wall centreline")
        length(obj, "Eaves", g, "eave height above the base curve", 3.2)
        length(obj, "Rise", g, "rise of the crown above the eaves", 2.4)
        length(obj, "Overhang", g, "reach beyond the wall centreline", 0.8)
        length(obj, "Thickness", g, "roof thickness", 0.20)

    def execute(self, obj):
        if self.fresh(obj):
            return
        edge, _closed = base_edge(obj, closed_required=True, corners=True)
        if edge is None:
            return
        set_local(obj, og.organic_roof_shape(edge, m(obj.Eaves), m(obj.Rise), m(obj.Overhang), m(obj.Thickness)))


class Slab(Organic):
    """A floor slab filling a closed base curve, less an inset, its top at the curve."""

    ifc_type = "Slab"
    icon = "OrganicSlab.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Slab"
        prop(obj, "App::PropertyLink", "Base", g, "the closed curve")
        length(obj, "Thickness", g, "slab thickness below its top", 0.20)
        length(obj, "Inset", g, "distance in from the curve", 0.0)
        distance(obj, "BaseOffset", g, "the slab's top above its curve (a raised floor, a step)", 0.0)

    def execute(self, obj):
        if self.fresh(obj):
            return
        edge, _closed = base_edge(obj, closed_required=True, corners=True)
        if edge is None:
            return
        shape = og.slab_shape(edge, m(obj.Thickness), m(obj.Inset))
        if m(obj.BaseOffset):
            shape.translate(App.Vector(0, 0, m(obj.BaseOffset) * MM))
        set_local(obj, shape)


class Steps(Organic):
    """A flight of steps between two points of its building's own frame, as the map's build
    mode draws one: Count treads from the lower point to the higher, the last at the higher
    point's height, every tread a block that stands on the ground Foundation below the lower."""

    ifc_type = "Stair"
    icon = "OrganicSlab.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Steps"
        prop(obj, "App::PropertyPosition", "From", g, "one end, in the steps' own frame (their building's)", App.Vector(0, 0, 0))
        prop(obj, "App::PropertyPosition", "To", g, "the other end; the lower of the two is the foot", App.Vector(3000, 0, 1000))
        length(obj, "Width", g, "width of the flight (0.3 m at least)", 1.2)
        prop(obj, "App::PropertyInteger", "Count", g, "number of steps (0: as many as the climb needs at 0.17 m each)", 0)
        length(obj, "Foundation", g, "how far the flight reaches below its lower end, into the ground (0.05 m at least)", 0.3)
        prop(obj, "App::PropertyInteger", "StepCount", "Measures", "the steps it has")
        prop(obj, "App::PropertyFloat", "Rise", "Measures", "each step's rise (m)")
        prop(obj, "App::PropertyFloat", "Run", "Measures", "each tread's run (m)")
        for p in ("StepCount", "Rise", "Run"):
            obj.setEditorMode(p, 1)

    def execute(self, obj):
        if self.fresh(obj):
            return
        shape, count, rise, run = og.steps_shape(tuple(c / MM for c in obj.From), tuple(c / MM for c in obj.To), m(obj.Width), obj.Count, m(obj.Foundation))
        obj.StepCount, obj.Rise, obj.Run = count, rise, run
        set_local(obj, shape)


class SoapFilm(Organic):
    """A minimal-surface membrane on a closed base curve, lifted by a mast ring over the
    pole, with a real thickness. Without a base: a circle of radius 6 m."""

    ifc_type = "Roof"
    icon = "OrganicFilm.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Soap film"
        prop(obj, "App::PropertyLink", "Base", g, "the closed boundary")
        length(obj, "MastHeight", g, "height of the mast ring above the boundary", 3.0)
        length(obj, "MastRadius", g, "radius of the mast ring", 0.6)
        length(obj, "Thickness", g, "membrane thickness", 0.08)
        distance(obj, "BaseOffset", g, "the boundary's height above its curve", 0.0)

    def execute(self, obj):
        if self.fresh(obj):
            return
        edge, _closed = base_edge(obj, closed_required=True)
        if edge is None:
            edge = og.arc_curve(6.0, 360.0)
        if m(obj.BaseOffset):
            edge = edge.copy()
            edge.translate(App.Vector(0, 0, m(obj.BaseOffset) * MM))
        set_local(obj, og.soap_film_shape(edge, m(obj.MastHeight), m(obj.MastRadius), m(obj.Thickness)))


class MinimalShell(Organic):
    """Two closed-form shells: the catenoid (a minimal surface) and the hypar (a doubly ruled
    saddle)."""

    ifc_type = "Roof"
    icon = "OrganicSaddle.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Shell"
        prop(obj, "App::PropertyEnumeration", "Kind", g, "the surface", enum=["Hypar", "Catenoid"])
        length(obj, "SizeX", g, "hypar: size along X; catenoid: waist radius", 8.0)
        length(obj, "SizeY", g, "hypar: size along Y; catenoid: height", 8.0)
        length(obj, "Rise", g, "hypar: corner rise", 1.5)
        length(obj, "Thickness", g, "shell thickness", 0.15)

    def execute(self, obj):
        if self.fresh(obj):
            return
        if obj.Kind == "Catenoid":
            shape = og.catenoid_shape(m(obj.SizeX), m(obj.SizeY), m(obj.Thickness))
        else:
            shape = og.hypar_shape(m(obj.SizeX), m(obj.SizeY), m(obj.Rise), m(obj.Thickness))
        set_local(obj, shape)


# ---------------------------------------------------------------- the Sacred tab
class SacredFigure(Organic):
    """A plan figure of proportion: its outline (which walls, slabs, roofs and nets can stand
    on) and the construction that makes it. Size is its radius, short side or module; Count
    its rings, squares, steps, sides, points or cells."""

    ifc_type = "Building Element Proxy"
    icon = "SacredFigure.svg"

    def setup(self, obj):
        g = "Figure"
        prop(obj, "App::PropertyEnumeration", "Kind", g, "the figure", enum=sacred.FIGURES)
        length(obj, "Size", g, "radius of its circles or polygon; short side of a rectangle; the module of a grid", 4.0)
        prop(obj, "App::PropertyInteger", "Count", g, "rings (flower), squares (golden), steps (turned squares), sides (polygon), points (star), cells along X (grid)", 6)
        prop(obj, "App::PropertyInteger", "Step", g, "star: join every Step-th point", 2)
        prop(obj, "App::PropertyEnumeration", "Root", g, "root rectangle: 1 : sqrt of", enum=["2", "3", "5"])
        prop(obj, "App::PropertyInteger", "CellsY", g, "grid: cells along Y (0: as many as along X)", 0)
        prop(obj, "App::PropertyAngle", "Turn", g, "rotation of the figure", 0.0)
        prop(obj, "App::PropertyBool", "Construction", g, "draw the construction lines with the outline", True)
        prop(obj, "App::PropertyFloat", "OutlineArea", "Measures", "area inside the outline (m²)")
        prop(obj, "App::PropertyFloat", "OutlineLength", "Measures", "length of the outline (m)")
        for p in ("OutlineArea", "OutlineLength"):
            obj.setEditorMode(p, 1)

    def figure(self, obj):
        outline, extra = sacred.figure(obj.Kind, m(obj.Size), obj.Count, obj.Step, int(obj.Root), obj.CellsY)
        shapes = [outline] + (list(extra) if obj.Construction else [])
        for s in shapes:
            s.rotate(App.Vector(), og.Z, float(obj.Turn))
        return shapes

    def execute(self, obj):
        shapes = self.figure(obj)
        obj.OutlineLength = shapes[0].Length / MM
        obj.OutlineArea = Part.Face(shapes[0]).Area / MM / MM
        set_local(obj, Part.makeCompound(shapes))

    def outline(self, obj):
        """The outline alone, in document coordinates: what a wall or a roof takes as its base."""
        wire = self.figure(obj)[0]
        wire.Placement = obj.Placement.multiply(wire.Placement)
        return wire


class SacredSolid(Organic):
    """One of the five regular solids, of a given edge, standing on a face or a vertex."""

    ifc_type = "Building Element Proxy"
    icon = "SacredSolid.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Solid"
        prop(obj, "App::PropertyEnumeration", "Kind", g, "the solid", enum=sacred.SOLIDS)
        length(obj, "Edge", g, "length of an edge", 3.0)
        prop(obj, "App::PropertyEnumeration", "Standing", g, "how it stands on its base", enum=["On a face", "On a vertex", "Centred"])
        prop(obj, "App::PropertyFloat", "Circumradius", "Measures", "radius of the sphere through its vertices (m)")
        obj.setEditorMode("Circumradius", 1)

    def execute(self, obj):
        if self.fresh(obj):
            return
        e = m(obj.Edge)
        obj.Circumradius = max(math.sqrt(x * x + y * y + z * z) for x, y, z in sacred.platonic_vertices(obj.Kind, e))
        set_local(obj, sacred.platonic_solid(obj.Kind, e, obj.Standing))


class GeodesicDome(Organic):
    """A geodesic dome shell: an icosahedron's faces cut into Frequency² triangles and pushed
    out to the sphere, with a real thickness; Portion of the sphere's height stands."""

    ifc_type = "Roof"
    icon = "SacredGeodesic.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Geodesic dome"
        length(obj, "Radius", g, "radius of the sphere through its outer vertices", 6.0)
        prop(obj, "App::PropertyInteger", "Frequency", g, "each icosahedron edge cut into this many struts (1-8)", 3)
        length(obj, "Thickness", g, "shell thickness", 0.15)
        prop(obj, "App::PropertyFloat", "Portion", g, "how much of the sphere's height stands: 0.5 a hemisphere, 0.625 a five-eighths dome", 0.5)
        prop(obj, "App::PropertyInteger", "Panels", "Measures", "triangles of the whole sphere at this frequency")
        obj.setEditorMode("Panels", 1)

    def execute(self, obj):
        if self.fresh(obj):
            return
        nu = max(1, min(8, obj.Frequency))
        obj.Panels = 20 * nu * nu
        set_local(obj, sacred.geodesic_dome(m(obj.Radius), nu, m(obj.Thickness), obj.Portion))


class SunRose(Organic):
    """Where the sun rises and sets on the land through the year, drawn from the rose's own
    spot: true north, the cardinal directions, the solstices and equinoxes (long rays) and
    the cross-quarter days (short rays). The azimuths are the land pack's own."""

    ifc_type = "Building Element Proxy"
    icon = "SacredSun.svg"
    HORIZONS = ["Terrain (the ridge line seen from there)", "Flat (a level horizon)"]

    def setup(self, obj):
        g = "Sun"
        length(obj, "Size", g, "length of the north ray", 12.0)
        prop(obj, "App::PropertyEnumeration", "Horizon", g, "the horizon the sun is seen to rise and set over", enum=self.HORIZONS)
        prop(obj, "App::PropertyFloatList", "Sunrise", g, "sunrise azimuths, degrees from true north (in the order of Events)")
        prop(obj, "App::PropertyFloatList", "Sunset", g, "sunset azimuths, degrees from true north (in the order of Events)")
        prop(obj, "App::PropertyStringList", "Events", g, "the year's stations", [label for _key, label in sacred.EVENTS])
        prop(obj, "App::PropertyString", "Source", g, "where the azimuths come from")
        prop(obj, "App::PropertyString", "ReadFor", g, "the horizon and place the stored azimuths were read for")
        for p in ("Sunrise", "Sunset", "Events", "Source", "ReadFor"):
            obj.setEditorMode(p, 1)

    def place_of(self, obj):
        """(lng, lat) of the rose, from the document's site and the rose's own position."""
        import organic_export as ox

        origin = ox.document_origin(obj.Document)
        kx, ky = ox.METRES_PER_DEG
        return origin["lng"] + obj.Placement.Base.x / MM / kx, origin["lat"] + obj.Placement.Base.y / MM / ky

    def azimuths(self, obj):
        return {key: (obj.Sunrise[i], obj.Sunset[i]) for i, (key, _label) in enumerate(sacred.EVENTS)}

    def execute(self, obj):
        lng, lat = self.place_of(obj)
        wanted = "%s|%.5f|%.5f" % (obj.Horizon, lng, lat)
        if obj.ReadFor != wanted or len(obj.Sunrise) != len(sacred.EVENTS):
            az, source = sacred.site_azimuths(lng, lat, obj.Horizon)
            obj.Sunrise = [float(az[key][0]) for key, _label in sacred.EVENTS]
            obj.Sunset = [float(az[key][1]) for key, _label in sacred.EVENTS]
            obj.Source, obj.ReadFor = source, wanted
        rose = sacred.sun_rose(self.azimuths(obj), m(obj.Size))
        base = obj.Placement.Base
        obj.Shape = rose
        obj.Placement = App.Placement(base, App.Rotation())  # the rose never turns with a building: its north is true north


class Proportions(Organic):
    """The proportion system and the module this document's buildings are set out in. The
    Sacred tab's snap and report read them here."""

    icon = "SacredSnap.svg"

    def setup(self, obj):
        g = "Proportions"
        prop(obj, "App::PropertyEnumeration", "System", g, "the family of ratios", enum=sacred.SYSTEM_NAMES)
        length(obj, "Module", g, "the base module every governing dimension is a whole number of", sacred.FOOT)

    def execute(self, obj):
        pass


# ---------------------------------------------------------------- the Biomimetic tab
class Gridshell(Organic):
    """A net of laths over a closed base curve, found by the force density method: every
    node in balance between its laths and its load. Standing, it is a gridshell; Hanging, a
    catenary net. Without a base: a circle of radius 6 m."""

    ifc_type = "Member"
    icon = "BioGridshell.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Net"
        prop(obj, "App::PropertyLink", "Base", g, "the closed boundary the laths end on")
        length(obj, "Spacing", g, "distance between laths", 1.0)
        length(obj, "Rise", g, "height of the highest node above the boundary (the lowest, below it, when hanging)", 3.0)
        length(obj, "LathWidth", g, "width of a lath, lying in the net", 0.08)
        length(obj, "LathDepth", g, "depth of a lath, square to the net", 0.05)
        prop(obj, "App::PropertyBool", "Hanging", g, "hang the net below its boundary instead of standing it above", False)
        length(obj, "EdgeBeam", g, "side of a square beam along the boundary (0: none)", 0.15)
        prop(obj, "App::PropertyInteger", "Laths", "Measures", "number of laths")
        prop(obj, "App::PropertyFloat", "LathLength", "Measures", "total length of the laths (m)")
        prop(obj, "App::PropertyFloat", "Residual", "Measures", "largest unbalanced force on a node, over the node load")
        for p in ("Laths", "LathLength", "Residual"):
            obj.setEditorMode(p, 1)

    def execute(self, obj):
        if self.fresh(obj):
            return
        edge, _closed = base_edge(obj, closed_required=True)
        if edge is None:
            edge = og.arc_curve(6.0, 360.0)
        shape, laths, total, residual = ob.net_shape(edge, m(obj.Spacing), m(obj.Rise), m(obj.LathWidth), m(obj.LathDepth),
                                                    obj.Hanging, m(obj.EdgeBeam))
        obj.Laths, obj.LathLength, obj.Residual = laths, total, residual
        set_local(obj, shape)


class CellularWall(Organic):
    """A wall on a base curve opened into Voronoi cells between ribs, as bone and dragonfly
    wings are: one solid. Without a base: an arc of radius 5 m."""

    ifc_type = "Wall"
    icon = "BioCells.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Cellular wall"
        prop(obj, "App::PropertyLink", "Base", g, "the plan curve the wall follows")
        length(obj, "Thickness", g, "wall thickness", 0.30)
        length(obj, "Height", g, "wall height above its base", 3.0)
        prop(obj, "App::PropertyEnumeration", "Align", g, "the wall's side of its base curve", enum=["Center", "Left", "Right"])
        length(obj, "Cell", g, "size of a cell", 0.8)
        length(obj, "Rib", g, "width of the ribs between cells", 0.12)
        length(obj, "Margin", g, "solid band at the foot, the top and the ends", 0.3)
        prop(obj, "App::PropertyInteger", "Seed", g, "another number, another pattern", 1)
        length(obj, "Foundation", g, "depth the wall runs below its base", 0.0)
        distance(obj, "BaseOffset", g, "the base's height above the base curve", 0.0)
        prop(obj, "App::PropertyFloat", "OpenFraction", "Measures", "the cells' share of the wall face")
        obj.setEditorMode("OpenFraction", 1)

    def execute(self, obj):
        if self.fresh(obj):
            return
        edge, closed = base_edge(obj, corners=True)
        if edge is None:
            edge, closed = og.arc_curve(5.0, 120.0), False
        shape, cells, face = ob.cellular_wall_shape(edge, closed, m(obj.Thickness), m(obj.Height), m(obj.Cell), m(obj.Rib), m(obj.Margin),
                                                    obj.Seed, obj.Align, m(obj.BaseOffset), m(obj.Foundation))
        obj.OpenFraction = cells / face if face else 0.0
        set_local(obj, shape)


class BranchingColumn(Organic):
    """A column that branches like a tree: at each level every branch splits and fans out,
    thinning by r_parent^e = n r_child^e. Its tips stand level at Height, each under a cap."""

    ifc_type = "Column"
    icon = "BioColumn.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Branching column"
        length(obj, "Height", g, "height of the tips above the base", 5.0)
        length(obj, "Trunk", g, "height of the first fork", 2.2)
        prop(obj, "App::PropertyInteger", "Levels", g, "how many times it forks (1-4)", 2)
        prop(obj, "App::PropertyInteger", "Branches", g, "branches at each fork (2-5)", 3)
        length(obj, "Spread", g, "radius of the crown: no tip stands further from the trunk's axis", 2.5)
        length(obj, "TrunkRadius", g, "radius of the trunk at its foot", 0.18)
        prop(obj, "App::PropertyFloat", "Exponent", g, "e in r_parent^e = n r_child^e: 3 Murray's law, 2 Leonardo's rule, 2.3 measured on trees", 2.3)
        length(obj, "TipRadius", g, "smallest radius of a branch", 0.04)
        prop(obj, "App::PropertyAngle", "Fan", g, "how widely a fork's branches fan out about their branch", 110.0)
        prop(obj, "App::PropertyVectorList", "Tips", "Measures", "where the tips stand, in the column's own frame (mm)")
        obj.setEditorMode("Tips", 1)

    def execute(self, obj):
        if self.fresh(obj):
            return
        shape, tips = ob.branching_column(m(obj.Height), m(obj.Trunk), max(1, min(4, obj.Levels)), max(2, min(5, obj.Branches)),
                                          m(obj.Spread), m(obj.TrunkRadius), max(1.5, obj.Exponent), m(obj.TipRadius), float(obj.Fan))
        obj.Tips = [og.V(*t) for t in tips]
        set_local(obj, shape)


# ---------------------------------------------------------------- view
class ViewProviderOrganic:
    def __init__(self, vobj):
        vobj.Proxy = self

    def attach(self, vobj):
        self.Object = vobj.Object

    def getIcon(self):
        """The picture of the button that made the object: an arch is a short vault, a veined
        leaf a leaf shell, a hanging net a gridshell, each with its own button."""
        obj = getattr(self, "Object", None)
        proxy = getattr(obj, "Proxy", None)
        name = getattr(proxy, "icon", "Organic.svg")
        kind = type(proxy).__name__
        try:
            if kind == "Vault" and str(obj.IfcType) == "Member":
                name = "OrganicArch.svg"
            elif kind == "LeafShell" and str(obj.RibPattern) == "Veins":
                name = "BioVeins.svg"
            elif kind == "Gridshell" and obj.Hanging:
                name = "BioNet.svg"
        except Exception:
            pass
        return os.path.join(ICONS, name)

    def claimChildren(self):
        base = getattr(self.Object, "Base", None)
        return [base] if base is not None and getattr(base, "InList", None) and len(base.InList) == 1 else []

    def dumps(self):
        return None

    def loads(self, state):
        return None

    __getstate__ = dumps

    def __setstate__(self, state):
        return None


COLOURS = {
    "Wall": (0.87, 0.80, 0.66),
    "Roof": (0.55, 0.66, 0.50),
    "Slab": (0.70, 0.70, 0.70),
    "Stair": (0.70, 0.70, 0.70),
    "Member": (0.80, 0.62, 0.45),
    "Column": (0.72, 0.56, 0.40),
}
LINE_COLOURS = {"PlanCurve": (0.2, 0.3, 0.8), "SacredFigure": (0.70, 0.45, 0.05), "SunRose": (0.85, 0.45, 0.0)}


def paint(obj):
    """Give an Organic object the colour of its IFC class (walls sand, roofs green, slabs
    grey, members and columns wood) and a curve its line colour. In the window only."""
    if not App.GuiUp or obj.ViewObject is None:
        return
    view = obj.ViewObject
    colour = COLOURS.get(str(getattr(obj, "IfcType", "")), None)
    if colour and "ShapeAppearance" in view.PropertiesList:
        mat = App.Material()
        mat.DiffuseColor = colour
        view.ShapeAppearance = [mat]
    kind = type(getattr(obj, "Proxy", None)).__name__
    if kind in LINE_COLOURS:
        view.LineColor = LINE_COLOURS[kind]
        view.LineWidth = 2.0


def dress(doc):
    """Make a design that was built without the window look as one built in it does: every
    Organic object gets its icon and its class colour, the BIM site and building their own
    view providers (so the tree nests the building's parts under it). What already has a
    view provider is left as it is. Returns how many objects were dressed."""
    if not App.GuiUp or doc is None:
        return 0
    done = 0
    for obj in doc.Objects:
        view = getattr(obj, "ViewObject", None)
        if view is None or getattr(view, "Proxy", None) not in (None, 0):
            continue
        try:
            if hasattr(getattr(obj, "Proxy", None), "ifc_type"):  # an Organic object (by what it carries: a reloaded module's classes are new ones)
                ViewProviderOrganic(view)
                paint(obj)
                if type(obj.Proxy).__name__ == "PlanCurve" and any(type(getattr(p, "Proxy", None)).__name__ in ("Wall", "CellularWall", "Slab") for p in obj.InList):
                    view.Visibility = False  # a curve a wall or a slab stands on is hidden, as the buttons leave it
                done += 1
            elif getattr(obj, "IfcType", "") == "Site":
                import ArchSite

                ArchSite._ViewProviderSite(view)
                done += 1
            elif getattr(obj, "IfcType", "") in ("Building", "Building Storey", "Building Part"):
                import ArchBuildingPart

                ArchBuildingPart.ViewProviderBuildingPart(view)
                view.Visibility = True
                done += 1
        except Exception as exc:  # a view is a courtesy: never stop a design from opening
            App.Console.PrintWarning("Organic: %s could not be dressed for the window (%s)\n" % (obj.Label, exc))
    return done


_DRESSING = set()


def dress_later(doc):
    """Dress a restored document once it is fully open (its view objects exist by then)."""
    if not App.GuiUp or doc is None or doc.Name in _DRESSING:
        return
    _DRESSING.add(doc.Name)
    try:
        from PySide import QtCore
    except ImportError:
        return
    name = doc.Name

    def run():
        _DRESSING.discard(name)
        try:
            dress(App.getDocument(name))
        except Exception:
            pass

    QtCore.QTimer.singleShot(0, run)


def make(cls, name, label=None, doc=None):
    """Create an Organic object of cls in doc (the active document by default)."""
    doc = doc or App.ActiveDocument
    obj = doc.addObject("Part::FeaturePython", name)
    cls(obj)
    obj.Label = label or name
    if App.GuiUp and obj.ViewObject is not None:
        ViewProviderOrganic(obj.ViewObject)
        paint(obj)
    return obj
