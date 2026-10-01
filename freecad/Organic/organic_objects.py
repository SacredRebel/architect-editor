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

import organic_geom as og

MM = og.MM
ICONS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
IFC_TYPES = ["Wall", "Roof", "Slab", "Member", "Covering", "Column", "Building Element Proxy"]


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
    """Assign a shape built in the object's own frame, keeping its placement."""
    pl = obj.Placement
    obj.Shape = shape
    obj.Placement = pl


def set_global(obj, shape):
    """Assign a shape built in document coordinates (it follows a base curve), keeping the
    object's placement: the shape is taken into the placement's frame first."""
    pl = obj.Placement
    s = shape.copy()
    s.transformShape(pl.inverse().toMatrix(), True)
    obj.Shape = s
    obj.Placement = pl


def base_edge(obj, closed_required=False):
    """The object's Base as one smooth horizontal edge and whether it is closed."""
    base = getattr(obj, "Base", None)
    if base is None or not hasattr(base, "Shape") or base.Shape.isNull():
        return None, False
    edge, closed = og.plan_edge(base.Shape)
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

    def dumps(self):
        return None

    def loads(self, state):
        return None

    __getstate__ = dumps

    def __setstate__(self, state):
        return None


# ---------------------------------------------------------------- plan curves
CURVE_KINDS = ["Lobed", "Circle", "Arc", "S-curve", "Oval", "Leaf", "Shell", "Golden spiral", "Log spiral", "Vesica"]
CLOSED_KINDS = {"Lobed", "Circle", "Oval", "Leaf", "Shell", "Vesica"}


class PlanCurve(Organic):
    """A parametric plan curve: plugin-eco's organic perimeters (lobed, oval, leaf, shell),
    arcs and waves for walls, and the sacred-geometry kit's spirals and vesica."""

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

    def execute(self, obj):
        kind, r = obj.Kind, m(obj.Radius)
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
        edge, closed = base_edge(obj)
        if edge is None:
            edge, closed = og.arc_curve(5.0, 120.0), False
            follow = False
        else:
            follow = True
        obj.CentrelineLength = edge.Length / MM
        shape = og.wall_shape(edge, closed, m(obj.Thickness), m(obj.Height), obj.Align, obj.Top, m(obj.TopRise),
                              obj.TopWaves, self.openings(obj), m(obj.BaseOffset), m(obj.Foundation))
        (set_global if follow else set_local)(obj, shape)


def add_opening(wall, position_m, width_m=1.2, height_m=1.3, sill_m=0.9, shape="Arch"):
    """Append one opening to an Organic wall's lists."""
    wall.OpeningPositions = list(wall.OpeningPositions) + [float(position_m)]
    wall.OpeningWidths = list(wall.OpeningWidths) + [float(width_m)]
    wall.OpeningHeights = list(wall.OpeningHeights) + [float(height_m)]
    wall.OpeningSills = list(wall.OpeningSills) + [float(sill_m)]
    wall.OpeningShapes = list(wall.OpeningShapes) + [str(shape)]


# ---------------------------------------------------------------- vaults and arches
class Vault(Organic):
    """A barrel vault (or, short, an arch) along the object's +Y, springing from its base.

    Profiles: Ellipse (plugin-eco's barrel), Semicircle, Segmental and Pointed (exact
    circles), Catenary (the hanging-chain arch, plugin-hagia-sophia's fit) and Parabola.
    Ribs are arches of RibWidth that stand RibDepth under the intrados. ThrustInMiddleThird
    is plugin-hagia-sophia's Poleni check on the ring."""

    ifc_type = "Roof"
    icon = "OrganicVault.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Vault"
        prop(obj, "App::PropertyEnumeration", "Profile", g, "the arch curve",
             enum=["Ellipse", "Semicircle", "Segmental", "Pointed", "Catenary", "Parabola"])
        length(obj, "Span", g, "clear span between the springings", 8.0)
        length(obj, "Rise", g, "rise of the intrados (a semicircle's is half the span)", 3.5)
        length(obj, "Thickness", g, "shell thickness", 0.15)
        length(obj, "VaultLength", g, "length along the barrel", 16.0)
        prop(obj, "App::PropertyInteger", "Ribs", g, "ribs spread along the barrel (0: none)", 5)
        length(obj, "RibWidth", g, "rib width along the barrel", 0.25)
        length(obj, "RibDepth", g, "rib depth under the intrados", 0.15)
        prop(obj, "App::PropertyBool", "ThrustInMiddleThird", "Measures", "Poleni: the catenary of the ring's centreline stays within its middle third")
        prop(obj, "App::PropertyFloat", "ThrustDeviation", "Measures", "the largest distance of that catenary from the centreline (m)")
        for p in ("ThrustInMiddleThird", "ThrustDeviation"):
            obj.setEditorMode(p, 1)

    def execute(self, obj):
        shape = og.vault_shape(obj.Profile, m(obj.Span), m(obj.Rise), m(obj.Thickness), m(obj.VaultLength),
                               obj.Ribs, m(obj.RibWidth), m(obj.RibDepth))
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

    def execute(self, obj):
        set_local(obj, og.dome_shape(obj.Profile, m(obj.Radius), m(obj.Rise), m(obj.Thickness), m(obj.Oculus)))


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

    def execute(self, obj):
        heights = list(obj.RidgeHeights) if len(obj.RidgeHeights) == 4 else [3.0, 7.2, 9.8, 3.0]
        set_local(obj, og.leaf_shell_shape(m(obj.Spine), m(obj.LeafSpan), heights, m(obj.Eave), obj.RiseFactor,
                                           obj.Curvature, m(obj.Thickness), m(obj.RibSpacing), m(obj.RibDepth),
                                           m(obj.RibWidth), obj.Outline))


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
        edge, _closed = base_edge(obj, closed_required=True)
        if edge is None:
            return
        set_global(obj, og.organic_roof_shape(edge, m(obj.Eaves), m(obj.Rise), m(obj.Overhang), m(obj.Thickness)))


class Slab(Organic):
    """A floor slab filling a closed base curve, less an inset, its top at the curve."""

    ifc_type = "Slab"
    icon = "OrganicSlab.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Slab"
        prop(obj, "App::PropertyLink", "Base", g, "the closed curve")
        length(obj, "Thickness", g, "slab thickness below the curve", 0.20)
        length(obj, "Inset", g, "distance in from the curve", 0.0)

    def execute(self, obj):
        edge, _closed = base_edge(obj, closed_required=True)
        if edge is None:
            return
        set_global(obj, og.slab_shape(edge, m(obj.Thickness), m(obj.Inset)))


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
        edge, _closed = base_edge(obj, closed_required=True)
        follow = edge is not None
        if edge is None:
            edge = og.arc_curve(6.0, 360.0)
        if m(obj.BaseOffset):
            edge = edge.copy()
            edge.translate(App.Vector(0, 0, m(obj.BaseOffset) * MM))
        shape = og.soap_film_shape(edge, m(obj.MastHeight), m(obj.MastRadius), m(obj.Thickness))
        (set_global if follow else set_local)(obj, shape)


class MinimalShell(Organic):
    """Two closed-form shells: the catenoid (a minimal surface) and the hypar (a doubly ruled
    saddle)."""

    ifc_type = "Roof"
    icon = "OrganicFilm.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Shell"
        prop(obj, "App::PropertyEnumeration", "Kind", g, "the surface", enum=["Hypar", "Catenoid"])
        length(obj, "SizeX", g, "hypar: size along X; catenoid: waist radius", 8.0)
        length(obj, "SizeY", g, "hypar: size along Y; catenoid: height", 8.0)
        length(obj, "Rise", g, "hypar: corner rise", 1.5)
        length(obj, "Thickness", g, "shell thickness", 0.15)

    def execute(self, obj):
        if obj.Kind == "Catenoid":
            shape = og.catenoid_shape(m(obj.SizeX), m(obj.SizeY), m(obj.Thickness))
        else:
            shape = og.hypar_shape(m(obj.SizeX), m(obj.SizeY), m(obj.Rise), m(obj.Thickness))
        set_local(obj, shape)


# ---------------------------------------------------------------- view
class ViewProviderOrganic:
    def __init__(self, vobj):
        vobj.Proxy = self

    def attach(self, vobj):
        self.Object = vobj.Object

    def getIcon(self):
        proxy = getattr(getattr(self, "Object", None), "Proxy", None)
        return os.path.join(ICONS, getattr(proxy, "icon", "Organic.svg"))

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
    "Member": (0.80, 0.62, 0.45),
}


def make(cls, name, label=None, doc=None):
    """Create an Organic object of cls in doc (the active document by default)."""
    doc = doc or App.ActiveDocument
    obj = doc.addObject("Part::FeaturePython", name)
    cls(obj)
    obj.Label = label or name
    if App.GuiUp and obj.ViewObject is not None:
        ViewProviderOrganic(obj.ViewObject)
        colour = COLOURS.get(getattr(obj, "IfcType", ""), None)
        if colour and "ShapeAppearance" in obj.ViewObject.PropertiesList:
            mat = App.Material()
            mat.DiffuseColor = colour
            obj.ViewObject.ShapeAppearance = [mat]
        if cls is PlanCurve:
            obj.ViewObject.LineColor = (0.2, 0.3, 0.8)
            obj.ViewObject.LineWidth = 2.0
    return obj
