# -*- coding: utf-8 -*-
"""Organic: parametric FreeCAD objects.

Every length is a FreeCAD length property (a metre document shows metres); every object's
Shape is a closed solid, except a plan curve's. Each solid carries an IfcType, which the BIM
IFC exporter writes as that IFC class.
"""

import json
import math
import os

import FreeCAD as App
import Part

import organic_biomimetic as ob
import organic_geom as og
import organic_leaf as ol
import organic_sacred as sacred

MM = og.MM
ICONS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
IFC_TYPES = ["Wall", "Roof", "Slab", "Member", "Covering", "Column", "Stair", "Building Element Proxy", "Curtain Wall", "Railing", "Chimney", "Beam"]


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
               "App::PropertyLinkList", "App::PropertyVector", "App::PropertyPosition")


def link_key(obj, name, value):
    """What a linked curve gives to an object's solid: the curve as it lies in the object's frame."""
    if value is None or not hasattr(value, "Shape") or value.Shape.isNull():
        return (name, None)
    back = obj.Placement.inverse()
    shape = value.Shape
    points = [back.multVec(v.Point) for v in shape.Vertexes] + [back.multVec(e.valueAt((e.FirstParameter + e.LastParameter) / 2)) for e in shape.Edges]
    return (name, value.Name, len(shape.Edges), round(shape.Length, 2), tuple((round(p.x, 2), round(p.y, 2), round(p.z, 2)) for p in points))


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
            own.append(link_key(obj, name, value))
        elif kind == "App::PropertyLinkList":
            own.append((name, tuple(link_key(obj, name, v) for v in (value or []))))
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
        prop(obj, "App::PropertyFloatList", "TopHeights", g, "the top line as heights above the base (m): one for each point of a base curve through points, in "
             "their order (on any other curve: spread evenly along it). When given they are the top line: Height, Top and TopRise are not read")
        length(obj, "Foundation", g, "depth the wall runs below its base", 0.0)
        distance(obj, "BaseOffset", g, "the base's height above the base curve", 0.0)
        g = "Openings"
        prop(obj, "App::PropertyFloatList", "OpeningPositions", g, "centre of each opening along the centreline (m)")
        prop(obj, "App::PropertyFloatList", "OpeningWidths", g, "width of each opening (m)")
        prop(obj, "App::PropertyFloatList", "OpeningHeights", g, "height of each opening (m)")
        prop(obj, "App::PropertyFloatList", "OpeningSills", g, "sill of each opening above the base (m)")
        prop(obj, "App::PropertyStringList", "OpeningShapes", g, "Rect, Arch, Pointed or Round")
        # the map's words for what each opening and the wall are (FORMAT.md, BUILD piece 5): kept, sent on and written
        # back; nothing is built differently by them
        prop(obj, "App::PropertyStringList", "OpeningKinds", g, "what each opening is, in the map's words: Door, Window, Arch, Round window, Oculus, Sliding, "
             "or nothing (a word only: the shape and the sizes are the other lists)")
        prop(obj, "App::PropertyString", "WallKind", "Wall", "what the wall is made of, in the map's words: Rammed earth, Straw bale, Stone, Timber frame, "
             "Glass line, or nothing (a word only: nothing is built differently by it)")
        g = "Joints"
        tip = ("where this wall's %s meets other walls: the end of its left face and of its right face, from the end point, in millimetres "
               "(left and right of the base curve's own direction). Worked out by join_walls; empty: the end is cut square")
        prop(obj, "App::PropertyVectorList", "StartJoint", g, tip % "start")
        prop(obj, "App::PropertyVectorList", "EndJoint", g, tip % "end")
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
        joints = {end: tuple(getattr(obj, name)) for end, name in (("start", "StartJoint"), ("end", "EndJoint")) if len(getattr(obj, name, None) or []) == 2}
        said = {}
        set_local(obj, og.wall_shape(edge, closed, m(obj.Thickness), m(obj.Height), obj.Align, self.top_line(obj, edge, closed) or obj.Top, m(obj.TopRise),
                                     obj.TopWaves, self.openings(obj), m(obj.BaseOffset), m(obj.Foundation), joints, said))
        self.ends_joined = len(joints) if said.get("joined") else 0  # how many of its ends this solid really has shaped (a shaped top keeps them square)

    def top_line(self, obj, edge, closed):
        """The top line as a function, when the wall has TopHeights (else None). On a smooth
        curve through points with one height for each point, the heights belong to the points."""
        heights = [float(h) for h in (getattr(obj, "TopHeights", None) or [])]
        if len(heights) < 2:
            return None
        base = obj.Base
        through_points = (base is not None and type(getattr(base, "Proxy", None)).__name__ == "PlanCurve" and str(base.Kind) == "Points"
                          and bool(base.Smooth) and not isinstance(edge, og.WirePath))
        spans = len(heights) if closed else len(heights) - 1
        at_points = through_points and abs((edge.LastParameter - edge.FirstParameter) - spans) < 1e-6
        return og.sampled_top(edge, closed, heights, at_points)


def _near_on(path, point):
    """(how far a point is from a wall's base path in plan, the path's direction at the place
    nearest it), in the path's own frame. On an outline with corners the direction is None
    where that place is one of its corners: neither of the two runs passes through there."""
    flat = App.Vector(point.x, point.y, path.valueAt(path.FirstParameter).z)
    if isinstance(path, og.WirePath):
        best, last, closed = None, len(path.parts) - 1, path.isClosed()
        for i, (e, forward, start) in enumerate(path.parts):
            gap, along = og._nearest_on(e, flat)
            if best is None or gap < best[0] - 1e-9:
                s = along if forward else e.Length - along  # along this run, the way the path goes
                corner = (s < og.JOIN_MM and (closed or i > 0)) or (e.Length - s < og.JOIN_MM and (closed or i < last))
                best = (gap, None if corner else path.tangentAt(start + s))
        return best
    gap, along = og._nearest_on(path, flat)
    return gap, path.tangentAt(path.getParameterByLength(along))


def join_walls(walls):
    """Shape the ends of walls that end on each other, as the map draws them and the old editor
    did (og.junction_corners): a corner of two walls is whole, a wall that ends on the middle
    of another stops at its face, three walls at a point share it out. Sets StartJoint and
    EndJoint on every open wall among `walls` (an end that meets nothing: emptied, square).

    Walls meet when an end lies within og.JOIN_MM of another wall's end or of its line, in
    plan, and both stand on the same level (their bases at one height). An end that lies on
    a corner of another wall's outline is not joined by that wall: neither of its two runs
    passes through there, and the old editor, whose walls are single runs, has no such case.
    Returns how many
    ends meet other walls and were given their corners. A wall with a shaped top keeps square
    ends all the same, on a smooth curve or one with corners (og.wall_shape): after the walls are built again,
    each wall's Proxy.ends_joined says how many of its ends its solid really has shaped."""
    rows = []
    for w in walls:
        if type(getattr(w, "Proxy", None)).__name__ != "Wall" or w.Base is None:
            continue
        try:
            path, closed = base_edge(w, corners=True)
        except Exception:
            continue
        if path is None:
            continue
        at = w.Placement  # the wall's own frame in the document's: the walls are held against each other there
        u0, u1 = (0.0, path.Length) if isinstance(path, og.WirePath) else (path.FirstParameter, path.LastParameter)
        ends = []
        for u in (u0, u1):
            t = path.tangentAt(u)
            ends.append((at.multVec(path.valueAt(u)), at.Rotation.multVec(App.Vector(t.x, t.y, 0))))
        rows.append({"wall": w, "path": path, "closed": closed, "at": at, "ends": ends, "sides": og.wall_sides(str(w.Align), m(w.Thickness) * MM),
                     "half": m(w.Thickness) * MM / 2.0, "level": ends[0][0].z + m(w.BaseOffset) * MM})

    def ray(key, v, sides, half, with_curve, through):
        # its two faces along the left normal of the direction it leaves the point in (against its curve: the other way round)
        return {"id": key, "v": (v.x, v.y), "left": sides[1] if with_curve else -sides[0], "right": sides[0] if with_curve else -sides[1],
                "half": half, "through": through}

    joined = 0
    for row in rows:
        w = row["wall"]
        if row["closed"]:
            continue
        for index, name in ((0, "StartJoint"), (1, "EndJoint")):
            here, tangent = row["ends"][index]
            rays = [ray("this", tangent if index == 0 else tangent * -1.0, row["sides"], row["half"], index == 0, False)]
            for other in rows:
                if other is row or abs(other["level"] - row["level"]) > 1.0:
                    continue
                (o_start, o_t0), (o_end, o_t1) = other["ends"]
                flat = lambda p: App.Vector(p.x - here.x, p.y - here.y, 0).Length  # noqa: E731
                if not other["closed"] and flat(o_start) < og.JOIN_MM:
                    rays.append(ray(other["wall"].Name + ":start", o_t0, other["sides"], other["half"], True, False))
                elif not other["closed"] and flat(o_end) < og.JOIN_MM:
                    rays.append(ray(other["wall"].Name + ":end", o_t1 * -1.0, other["sides"], other["half"], False, False))
                else:
                    gap, direction = _near_on(other["path"], other["at"].inverse().multVec(here))
                    if gap < og.JOIN_MM and direction is not None:  # (on a corner of an outline nothing passes through: no joint from that wall)
                        direction = other["at"].Rotation.multVec(App.Vector(direction.x, direction.y, 0))
                        rays.append(ray(other["wall"].Name + ":on", direction, other["sides"], other["half"], True, True))
                        rays.append(ray(other["wall"].Name + ":back", direction * -1.0, other["sides"], other["half"], False, True))
            got = og.junction_corners(rays).get("this", {}) if len(rays) > 1 else {}
            corners = []
            if got:
                # (the ray leaves the meeting point: at the wall's end it runs against the curve, so its left is the curve's right)
                left, right = (got.get("left"), got.get("right")) if index == 0 else (got.get("right"), got.get("left"))
                normal = og.Z.cross(tangent)
                normal.normalize()
                square = {"left": normal * row["sides"][1], "right": normal * row["sides"][0]}
                back = row["at"].Rotation.inverted()
                for side, found in (("left", left), ("right", right)):
                    corners.append(back.multVec(App.Vector(found[0], found[1], 0) if found is not None else square[side]))
                joined += 1
            if [tuple(c) for c in corners] != [tuple(c) for c in getattr(w, name)]:
                setattr(w, name, corners)
    return joined


def add_opening(wall, position_m, width_m=1.2, height_m=1.3, sill_m=0.9, shape="Arch"):
    """Append one opening to an Organic wall's lists."""
    wall.OpeningPositions = list(wall.OpeningPositions) + [float(position_m)]
    wall.OpeningWidths = list(wall.OpeningWidths) + [float(width_m)]
    wall.OpeningHeights = list(wall.OpeningHeights) + [float(height_m)]
    wall.OpeningSills = list(wall.OpeningSills) + [float(sill_m)]
    wall.OpeningShapes = list(wall.OpeningShapes) + [str(shape)]


class WallBand(Organic):
    """The band between a wall's top and the underside of the roofs over it, closed either way:
    with glass (a pane Thickness thick on the wall's middle line, a curtain wall) or with the
    wall itself carried up to the roofs (the wall's own section). Johny's answer on his house
    (3 Oct 2026): both, to switch and compare; glass to start with. The band follows the wall's
    path and its top line and stops at the underside of the lowest roof over each place of it;
    where no roof is over the wall there is no band."""

    ifc_type = "Curtain Wall"
    icon = "OrganicWall.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Band"
        prop(obj, "App::PropertyLink", "Wall", g, "the wall the band stands on")
        prop(obj, "App::PropertyLinkList", "Roofs", g, "the roofs whose underside closes the band")
        prop(obj, "App::PropertyEnumeration", "Kind", g, "Glass: a pane on the wall's middle line; Wall: the wall's own section carried up to the roofs",
             enum=["Glass", "Wall"])
        length(obj, "Thickness", g, "the glass pane's thickness (a Wall band has the wall's own)", 0.12)

    def onChanged(self, obj, name):
        # the class follows the kind: a glass band is a curtain wall, the wall carried up is a wall
        if name == "Kind" and "IfcType" in obj.PropertiesList:
            want = "Curtain Wall" if str(obj.Kind) == "Glass" else "Wall"
            if obj.IfcType != want:
                obj.IfcType = want
                paint(obj)

    def execute(self, obj):
        if self.fresh(obj):
            return
        wall = obj.Wall
        if wall is None or type(getattr(wall, "Proxy", None)).__name__ != "Wall":
            obj.Shape = Part.Shape()
            return
        edge, closed = base_edge(wall, corners=True)  # in the wall's own frame
        if edge is None:
            obj.Shape = Part.Shape()
            return
        d1, d2 = og.wall_sides(str(wall.Align), m(wall.Thickness) * MM)
        if str(obj.Kind) == "Glass":
            middle, pane = (d1 + d2) / 2.0, m(obj.Thickness) * MM
            d1, d2 = middle - pane / 2.0, middle + pane / 2.0
        roofs = [r for r in (self.underside(wall, roof) for roof in obj.Roofs or []) if r is not None]
        z0 = edge.valueAt(edge.FirstParameter).z + m(wall.BaseOffset) * MM
        top = wall.Proxy.top_line(wall, edge, closed) or str(wall.Top)
        shape = og.wall_band_shape(edge, closed, d1, d2, z0, top, m(wall.Height), m(wall.TopRise), wall.TopWaves, roofs)
        if shape is None:
            obj.Shape = Part.Shape()
            return
        shape.Placement = obj.Placement.inverse().multiply(wall.Placement)  # from the wall's frame into the band's own
        set_local(obj, shape)

    @staticmethod
    def underside(wall, roof):
        """(the height of a roof's underside over a plan point, its plan as a shapely polygon),
        both in the wall's own frame, from the roof's own numbers: a height field shell's surface
        through its grid (it reaches past the roof's outline) less its thickness, and its outline
        less its holes (og.plan_zone). None for a roof of any other kind: no band is built under
        it (yet)."""
        if roof is None or type(getattr(roof, "Proxy", None)).__name__ != "HeightFieldShell" or roof.Base is None:
            return None
        base = roof.Base
        edge, closed = path_in(base, base.Placement)  # in the curve's own frame: the grid's
        if not closed:
            return None
        surface = og.field_surface((roof.GridOrigin.x / MM, roof.GridOrigin.y / MM), m(roof.GridStep), roof.GridColumns, list(roof.Heights))
        to_wall = wall.Placement.inverse().multiply(base.Placement)
        to_roof = to_wall.inverse()
        zone = og.plan_zone(edge, hole_edges(roof, base.Placement), to_wall)
        thickness, last = m(roof.Thickness) * MM, [None]

        def under(x, y):
            q = to_roof.multVec(App.Vector(x, y, 0.0))
            z, last[0] = og.field_z(surface, q.x, q.y, last[0])
            return to_wall.multVec(App.Vector(q.x, q.y, z - thickness)).z

        return under, zone


class RoofFrame(Organic):
    """A roof shell's frame (Johny's point 7, its first step, 3 Oct 2026): its ribs, its edge
    beam and a ring round each of its holes, hung under its underside (og.roof_frame_shape).
    The ribs stand at stations along the ridge axis, both ends and evenly between by its length
    in plan, and run square to it, both ways, to the edge beam, stopping at a ring where they
    meet a hole. The numbers are the spec's (each "est" there)."""

    ifc_type = "Beam"
    icon = "OrganicRoof.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Roof frame"
        prop(obj, "App::PropertyLink", "Shell", g, "the roof shell (a height field shell) the frame hangs under")
        prop(obj, "App::PropertyVectorList", "RidgePoints", g, "the ridge axis in plan, in the shell's own grid frame, in millimetres: straight runs between the points")
        prop(obj, "App::PropertyInteger", "Ribs", g, "complete transverse ribs: at both ends of the ridge axis and evenly between, by its length in plan", 10)
        length(obj, "RibWidth", g, "a rib's width, centred on its line", 0.16)
        length(obj, "RibDepth", g, "a rib's depth under the shell's underside", 0.36)
        length(obj, "EdgeBeamWidth", g, "the edge beam's width, inward from the shell's outline (a ring's too)", 0.22)
        length(obj, "EdgeBeamDepth", g, "the edge beam's depth under the underside (a ring's too)", 0.45)
        prop(obj, "App::PropertyBool", "Rings", g, "a ring round each hole of the shell, of the edge beam's section", True)

    def execute(self, obj):
        if self.fresh(obj):
            return
        shell = obj.Shell
        if shell is None or type(getattr(shell, "Proxy", None)).__name__ != "HeightFieldShell" or shell.Base is None:
            obj.Shape = Part.Shape()
            return
        base = shell.Base
        edge, closed = path_in(base, base.Placement)  # in the curve's own frame: the shell's grid's
        if not closed:
            raise ValueError("%s needs a closed base curve" % shell.Label)
        surface = og.field_surface((shell.GridOrigin.x / MM, shell.GridOrigin.y / MM), m(shell.GridStep), shell.GridColumns, list(shell.Heights))
        thickness, last = m(shell.Thickness) * MM, [None]

        def under(x, y):
            z, last[0] = og.field_z(surface, x, y, last[0])
            return z - thickness

        said = {}
        shape = og.roof_frame_shape(edge, hole_edges(shell, base.Placement), under, list(obj.RidgePoints), int(obj.Ribs), m(obj.RibWidth) * MM,
                                    m(obj.RibDepth) * MM, m(obj.EdgeBeamWidth) * MM, m(obj.EdgeBeamDepth) * MM, bool(obj.Rings), said)
        self.said = said  # (what was made and left out, for the import's notes and the checks)
        if shape is None:
            obj.Shape = Part.Shape()
            return
        shape.Placement = obj.Placement.inverse().multiply(base.Placement)  # from the curve's frame into the frame's own
        set_local(obj, shape)


# ---------------------------------------------------------------- vaults and arches
class Vault(Organic):
    """A barrel vault (or, short, an arch) along the object's +Y, springing from its base; or,
    with a Base, along that open plan curve (the map's vault on a drawn spine), every section
    square to it. A curve that turns tighter than the vault is wide would fold it: inside the
    curve that is refused; at an end of the curve (the map's own curve turns sharply there)
    the last sections are turned a little off square instead, and ends_turned says so.

    Profiles: Ellipse (plugin-eco's barrel), Semicircle, Segmental and Pointed (exact
    circles), Catenary (the hanging-chain arch, plugin-hagia-sophia's fit) and Parabola.
    Ribs are arches of RibWidth that stand RibDepth under the intrados (a plain straight
    vault's only). With WaveAmplitude and Waves it is a wave vault (lane R's, the map's): its
    rise goes up and down along its length, Rise + WaveAmplitude at a crest (the first at its
    start), Rise - WaveAmplitude at a trough, every section its Profile for the rise there.
    ThrustInMiddleThird is plugin-hagia-sophia's Poleni check on the ring (of a wave vault:
    at its crest and at its trough, the worse of the two)."""

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
        length(obj, "WaveAmplitude", g, "a wave vault: how far the rise goes up and down along the vault, from Rise + this at a crest to Rise - this at a trough (0: a plain vault)", 0.0)
        prop(obj, "App::PropertyInteger", "Waves", g, "a wave vault: whole waves along the vault's length, the first crest at its start (0: a plain vault)", 0)
        prop(obj, "App::PropertyBool", "ThrustInMiddleThird", "Measures", "Poleni: the catenary of the ring's centreline stays within its middle third")
        prop(obj, "App::PropertyFloat", "ThrustDeviation", "Measures", "the largest distance of that catenary from the centreline (m)")
        for p in ("ThrustInMiddleThird", "ThrustDeviation"):
            obj.setEditorMode(p, 1)

    def execute(self, obj):
        if self.fresh(obj):
            return
        spine, closed = base_edge(obj)
        if spine is not None and closed:
            raise ValueError("%s runs along an open curve; this one is closed" % obj.Label)
        amplitude, waves = og.wave_of(str(obj.Profile), m(obj.Rise), m(obj.WaveAmplitude), obj.Waves)
        said = {}
        if amplitude > 0:  # a wave vault: no ribs (they are a plain straight vault's)
            shape, _must = og.wave_vault_shape(obj.Profile, m(obj.Span), m(obj.Rise), m(obj.Thickness), m(obj.VaultLength), amplitude, waves, m(obj.Plinth), spine, said)
        elif spine is not None:
            shape = og.vault_on_curve(obj.Profile, m(obj.Span), m(obj.Rise), m(obj.Thickness), spine, m(obj.Plinth), said)
        else:
            shape = og.vault_shape(obj.Profile, m(obj.Span), m(obj.Rise), m(obj.Thickness), m(obj.VaultLength),
                                   obj.Ribs, m(obj.RibWidth), m(obj.RibDepth), m(obj.Plinth))
        self.ends_turned = list(said.get("turned") or [])  # the ends of its curve where its sections stand off square (og.curve_frames)
        # the thrust line of the plain vault; of a wave vault, at its crest and at its trough: the worse of the two
        rises = (m(obj.Rise) + amplitude, m(obj.Rise) - amplitude) if amplitude > 0 else (m(obj.Rise),)
        read = [og.thrust_line_ok(obj.Profile, m(obj.Span), rise, m(obj.Thickness)) for rise in rises]
        obj.ThrustInMiddleThird, obj.ThrustDeviation = all(bool(ok) for ok, _worst in read), max(float(worst) for _ok, worst in read)
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
        prop(obj, "App::PropertyLinkList", "Holes", g, "closed curves that are holes in the slab (a courtyard, a stair well), cut straight through it")

    def execute(self, obj):
        if self.fresh(obj):
            return
        edge, _closed = base_edge(obj, closed_required=True, corners=True)
        if edge is None:
            return
        shape = og.slab_shape(edge, m(obj.Thickness), m(obj.Inset))
        shape = og.with_holes(shape, hole_edges(obj))
        if m(obj.BaseOffset):
            shape.translate(App.Vector(0, 0, m(obj.BaseOffset) * MM))
        set_local(obj, shape)


def path_in(curve, frame):
    """A curve object's line in the frame `frame` (a placement in the document's own frame):
    one smooth edge, or the outline itself when it has corners; and whether it is closed."""
    outline = getattr(getattr(curve, "Proxy", None), "outline", None)  # a figure's outline, less its construction lines
    local = (outline(curve) if outline else curve.Shape).copy()
    local.Placement = frame.inverse().multiply(local.Placement)
    return og.plan_path(og.baked(local))


def hole_edges(obj, frame=None):
    """An object's Holes as closed plan curves in the object's own frame (or in `frame`)."""
    out = []
    for hole in getattr(obj, "Holes", None) or []:
        if hole is None or not hasattr(hole, "Shape") or hole.Shape.isNull():
            continue
        edge, closed = path_in(hole, obj.Placement if frame is None else frame)
        if not closed:
            raise ValueError("%s: the hole %s is not a closed curve" % (obj.Label, hole.Label))
        out.append(edge)
    return out


class Revolved(Organic):
    """A solid of revolution about its own upright axis: its outline as (radius, height)
    points, straight between them. A chimney that tapers, a round pier."""

    ifc_type = "Building Element Proxy"
    icon = "OrganicDome.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Revolved"
        prop(obj, "App::PropertyVectorList", "Profile", g, "the outline from one end of the axis to the other: each point is (radius, height), in millimetres")
        if not obj.Profile:
            obj.Profile = [App.Vector(600, 0, 0), App.Vector(600, 2000, 0), App.Vector(400, 4000, 0)]

    def execute(self, obj):
        if self.fresh(obj):
            return
        set_local(obj, og.revolved_shape([(p.x / MM, p.y / MM) for p in obj.Profile]))


class HeightFieldShell(Organic):
    """A roof shell whose top is a height field: its heights on a square grid, cut in plan to a
    closed curve, with upright holes. Any roof whose form is a formula over a plan outline (a
    scan or a sculpted surface as well): the formula is worked out on the grid by whoever
    writes the heights, and is kept beside them as words. The thickness is measured straight
    down. The shell lies where its base curve does: the grid is in that curve's own frame."""

    ifc_type = "Roof"
    icon = "OrganicRoof.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Height field shell"
        prop(obj, "App::PropertyLink", "Base", g, "the closed curve the shell is cut to in plan")
        prop(obj, "App::PropertyLinkList", "Holes", g, "closed curves that are holes in the shell (a courtyard, a chimney), cut straight through it")
        length(obj, "Thickness", g, "thickness, straight down from the top", 0.30)
        prop(obj, "App::PropertyVector", "GridOrigin", g, "where the grid's first height stands (x, y), in the base curve's own frame, in millimetres")
        length(obj, "GridStep", g, "distance between two heights of the grid, both ways", 0.25)
        prop(obj, "App::PropertyInteger", "GridColumns", g, "heights in one row of the grid (a row runs along +x; the rows follow in +y)", 2)
        prop(obj, "App::PropertyFloatList", "Heights", g, "the top's heights above the base curve's own level (m), row after row")
        prop(obj, "App::PropertyString", "Formula", g, "the formula the heights were worked out from, as words: kept for the record, not read")
        prop(obj, "App::PropertyFloat", "PlanArea", "Measures", "the shell's area in plan, less its holes (m²)")
        obj.setEditorMode("PlanArea", 1)

    def execute(self, obj):
        if self.fresh(obj):
            return
        base = obj.Base
        if base is None or not hasattr(base, "Shape") or base.Shape.isNull():
            return
        edge, closed = path_in(base, base.Placement)  # in the curve's own frame: the grid's
        if not closed:
            raise ValueError("%s needs a closed base curve" % obj.Label)
        solid, area = og.field_shell_shape(edge, (obj.GridOrigin.x / MM, obj.GridOrigin.y / MM), m(obj.GridStep), obj.GridColumns,
                                           list(obj.Heights), m(obj.Thickness), hole_edges(obj, base.Placement))
        obj.PlanArea = area / 1e6
        solid.Placement = obj.Placement.inverse().multiply(base.Placement)  # from the curve's frame into the shell's own
        set_local(obj, solid)


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
    """The saddle shell, of three kinds. Hypar: one hyperbolic paraboloid (a doubly ruled
    saddle) over a rectangle, its corners up and down by Rise. Groined saddles: saddles about
    one centre, the roof the highest of them everywhere, so that lobes rise to their tips and
    groins run down between them to supports on the ground (eight lobes, four saddles: the type
    of Candela's Los Manantiales; lane R's pattern card P-006). Catenoid: the minimal surface
    of revolution, a tower."""

    ifc_type = "Roof"
    icon = "OrganicSaddle.svg"
    KINDS = ["Hypar", "Groined saddles", "Catenoid"]

    def setup(self, obj):
        super().setup(obj)
        g = "Shell"
        prop(obj, "App::PropertyEnumeration", "Kind", g, "the surface", enum=self.KINDS)
        if list(obj.getEnumerationsOfProperty("Kind")) != self.KINDS:  # a design saved before the groined saddles: its kind is kept
            kind = str(obj.Kind)
            obj.Kind = self.KINDS
            obj.Kind = kind
        length(obj, "SizeX", g, "hypar: size along X; catenoid: waist radius", 8.0)
        length(obj, "SizeY", g, "hypar: size along Y; catenoid: height", 8.0)
        length(obj, "Rise", g, "hypar: corner rise", 1.5)
        length(obj, "Thickness", g, "shell thickness", 0.15)
        length(obj, "SupportRadius", g, "groined saddles: from the centre to a support, the foot of a groin", 6.0)
        length(obj, "TipRadius", g, "groined saddles: from the centre to a lobe's tip", 7.85)
        length(obj, "CentreHeight", g, "groined saddles: height at the centre", 2.4)
        length(obj, "TipHeight", g, "groined saddles: height of a lobe's tip", 4.0)
        prop(obj, "App::PropertyInteger", "Lobes", g, "groined saddles: lobes, an even number from 4 to 16 (8: four saddles)", 8)

    def execute(self, obj):
        if self.fresh(obj):
            return
        if obj.Kind == "Catenoid":
            shape = og.catenoid_shape(m(obj.SizeX), m(obj.SizeY), m(obj.Thickness))
        elif obj.Kind == "Groined saddles":
            shape = og.groined_saddles_shape(m(obj.SupportRadius), m(obj.TipRadius), m(obj.CentreHeight), m(obj.TipHeight), m(obj.Thickness), obj.Lobes)
        else:
            shape = og.hypar_shape(m(obj.SizeX), m(obj.SizeY), m(obj.Rise), m(obj.Thickness))
        set_local(obj, shape)


class Conoid(Organic):
    """A conoid shell (lane R's pattern card P-003): a straight line slides with one end on an
    arch and the other on a level line. In its own frame, x across the span and y along: the
    arch (a parabola of Rise) stands at y = -ShellLength / 2, the level line at +ShellLength / 2,
    both ends Eave above the base. The formula is its underside; its thickness is measured
    square to it, upward."""

    ifc_type = "Roof"
    icon = "OrganicConoid.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Conoid"
        length(obj, "Span", g, "across, between the arch's feet", 9.0)
        length(obj, "ShellLength", g, "along, from the arch to the level line", 12.0)
        length(obj, "Rise", g, "the arch's rise above its feet", 3.0)
        length(obj, "Eave", g, "height of the level line and of the arch's feet above the base", 2.6)
        length(obj, "Thickness", g, "shell thickness, square to the surface", 0.08)

    def execute(self, obj):
        if self.fresh(obj):
            return
        set_local(obj, og.conoid_shape(m(obj.Span), m(obj.ShellLength), m(obj.Rise), m(obj.Eave), m(obj.Thickness)))


class TranslationShell(Organic):
    """A translation shell (lane R's pattern card P-004): one arch slid along another, both
    curving down, over a rectangle; its four corners Eave above the base, its crown Eave +
    RiseX + RiseY. The formula is its underside; its thickness is measured square to it, upward."""

    ifc_type = "Roof"
    icon = "OrganicTranslation.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Translation shell"
        length(obj, "Span", g, "across (x)", 10.0)
        length(obj, "ShellLength", g, "along (y)", 14.0)
        length(obj, "RiseX", g, "rise of the arch across the span", 1.6)
        length(obj, "RiseY", g, "rise of the arch along the length", 2.2)
        length(obj, "Eave", g, "height of the four corners above the base", 2.6)
        length(obj, "Thickness", g, "shell thickness, square to the surface", 0.08)

    def execute(self, obj):
        if self.fresh(obj):
            return
        set_local(obj, og.translation_shell_shape(m(obj.Span), m(obj.ShellLength), m(obj.RiseX), m(obj.RiseY), m(obj.Eave), m(obj.Thickness)))


class LeafRoofTraced(Organic):
    """Johny's oak leaf as a roof (the architect's THE LEAF, part 2, 6 Oct 2026): the leaf lane C traced from his
    photos into exchange\\house\\leaf\\ — its outline and stem, veins, holes and curl, each a share of the blade's
    length — built at Length (metres, tip to stem base; everything scales with it) by organic_leaf.leaf_roof_shape:
    the skin (its underside the curl, cut to the outline with the holes through, its thickness along its normal), the
    midrib and the veins hung under it along C's lines (each rank 2^(-1/3) of the one before: Murray's law), an edge
    beam just inside the outline, the stem continuing the midrib. In C's frame times the length: the origin at the
    middle of the blade's bounding box, +y toward the tip; the curl's zero Eave above the base."""

    ifc_type = "Roof"
    icon = "OrganicLeaf.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Traced leaf"
        length(obj, "Length", g, "the blade's length, tip to stem base: every number of the leaf's files is a share of it", 0.0)
        prop(obj, "App::PropertyString", "LengthSource", g, "the record's length_source (FRAME.md): \"DERIVED\" as lane C says it, or \"yours\" once Johny gives his own", "")
        files = ol.default_paths()
        for kind, name in (("outline", "OutlineFile"), ("veins", "VeinsFile"), ("holes", "HolesFile"), ("profile", "ProfileFile"), ("place", "PlaceFile")):
            prop(obj, "App::PropertyString", name, g, "lane C's %s file, relative to the Playground folder" % kind, files[kind])
        distance(obj, "Eave", g, "the height of the curl's zero above the base (the map's lift)", 0.0)
        prop(obj, "App::PropertyStringList", "Openings", g, "the marks of the leaf cut through, by name (h1 …); empty: lane C's — on Johny's leaf none: "
             "C found no through-hole (leaf-holes.json cut_by_default false); a mark becomes an opening when Johny says so")
        prop(obj, "App::PropertyFloat", "SkinShare", g, "the skin's thickness along its normal, a share of the length (lane R's 0.10 m at 12 m)", ol.SKIN_SHARE)
        prop(obj, "App::PropertyFloat", "MidribWidthShare", g, "the midrib's width, a share of the length (R's 0.16 m at 12 m); each rank after it 2^(-1/3) of the one before", ol.MIDRIB_WIDTH_SHARE)
        prop(obj, "App::PropertyFloat", "MidribDepthShare", g, "the midrib's depth under the skin, a share of the length (R's 0.45 m at 12 m)", ol.MIDRIB_DEPTH_SHARE)
        prop(obj, "App::PropertyFloat", "EdgeWidthShare", g, "the edge beam's width, a share of the length (R's 0.12 m at 12 m)", ol.EDGE_WIDTH_SHARE)
        prop(obj, "App::PropertyFloat", "EdgeDepthShare", g, "the edge beam's depth, a share of the length (R's 0.25 m at 12 m)", ol.EDGE_DEPTH_SHARE)
        # what the record said it was built from: kept with the record, not part of the solid's numbers (a file's own
        # change is found by reading it), and written back as the files are when it was built
        prop(obj, "App::PropertyStringList", "Fingerprints", "From the map", "the leaf's files' SHA-256 (16 digits) as kind=digits")
        prop(obj, "App::PropertyFloat", "PlanArea", "Measures", "the leaf's area in plan, less its holes (m²)")
        length(obj, "Width", "Measures", "the blade's width across, at this length", 0.0)
        prop(obj, "App::PropertyInteger", "OutlinePoints", "Measures", "the outline's points, as lane C traced them")
        prop(obj, "App::PropertyInteger", "HoleCount", "Measures", "the marks cut through (openings)")
        prop(obj, "App::PropertyStringList", "Members", "Measures", "the solids after the skin, in order: name:how many")
        for name in ("PlanArea", "Width", "OutlinePoints", "HoleCount", "Members"):
            obj.setEditorMode(name, 1)

    def paths(self, obj):
        return {"outline": obj.OutlineFile, "veins": obj.VeinsFile, "holes": obj.HolesFile, "profile": obj.ProfileFile, "place": obj.PlaceFile}

    def fresh(self, obj):
        """As every Organic object, and the files read as they are now: a file lane C changes builds the leaf again."""
        self._pending = (shape_key(obj), tuple(sorted(self.files_now(obj).items())))
        return getattr(self, "_key", None) == self._pending and not obj.Shape.isNull()

    def files_now(self, obj):
        out = {}
        for kind, path in self.paths(obj).items():
            try:
                out[kind] = ol.fingerprint(path)
            except OSError:
                out[kind] = "missing"
        return out

    def execute(self, obj):
        if self.fresh(obj):
            return
        if m(obj.Length) <= 0:
            raise ValueError("a traced leaf needs its Length in metres (the record gives lane C's DERIVED one until Johny gives his)")
        said = {}
        shape = ol.leaf_roof_shape(ol.read_leaf(self.paths(obj)), m(obj.Length), m(obj.Eave), obj.SkinShare, obj.MidribWidthShare, obj.MidribDepthShare,
                                   obj.EdgeWidthShare, obj.EdgeDepthShare, openings=list(obj.Openings) or None, said=said)
        obj.PlanArea, obj.Width = said["plan_area_m2"], said["width_m"] * MM
        obj.OutlinePoints, obj.HoleCount = said["outline_points"], said["holes"]
        obj.Members = ["%s:%d" % (name, count) for name, count in said["members"]]
        now = self.files_now(obj)
        given = dict(s.split("=", 1) for s in obj.Fingerprints if "=" in s)
        self.files_changed = [(k, given[k], now.get(k)) for k in sorted(given) if given[k] != now.get(k)]
        obj.Fingerprints = ["%s=%s" % kv for kv in sorted(now.items())]
        self.said = said
        set_local(obj, shape)


# the leaf's bumps when none are given: one at its middle, as the map's catalogue writes form 107 (R's: Sx a third of
# the width, Sy a third of the length)
LEAF_BUMPS = [{"A": 1.2, "Cx": 0.0, "Cy": 0.0, "Sx": 2.3333, "Sy": 4.0, "P": 2}]


class LeafRoofOnRibs(Organic):
    """Lane R's leaf roof on ribs (card P-007; the map's catalogue form 107, written as a HeightFieldShell whose Figure
    is "HeightFieldShell"): a skin over a leaf outline, the bumps' surface its underside and its thickness along its
    upward normal (as R's generator gives it); under it the midrib, the ribs and an edge beam on each side, each hung
    from the skin's underside. In its own frame: x across, y along the midrib from tip to tip, the origin in the middle
    of its footprint on the ground. The record's Base (the height of the surface's flat part) is BaseHeight here: Base
    is the curve a piece stands on everywhere else."""

    ifc_type = "Roof"
    icon = "OrganicLeaf.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Leaf roof"
        length(obj, "Length", g, "tip to tip, along the midrib", 12.0)
        length(obj, "Width", g, "the greatest width", 7.0)
        prop(obj, "App::PropertyFloat", "Taper", g, "the outline: half-width = Width/2 * sin(pi t)^Taper, t from 0 to 1 tip to tip", 0.6)
        prop(obj, "App::PropertyFloat", "TipCut", g, "the outline cut blunt this share of the length from each tip", 0.03)
        distance(obj, "BaseHeight", g, "height of the surface's flat part above the base (the record's Base)", 2.6)
        prop(obj, "App::PropertyString", "Bumps", g, "the surface: BaseHeight plus, for each bump, A exp(-|(x - Cx)/Sx|^P - |(y - Cy)/Sy|^P), "
             'metres; as JSON, [{"A", "Cx", "Cy", "Sx", "Sy", "P"}] (none: flat)', json.dumps(LEAF_BUMPS))
        length(obj, "Thickness", g, "the skin, above the ribs, along its normal", 0.10)
        prop(obj, "App::PropertyInteger", "RibCount", g, "ribs, half on each side of the midrib", 10)
        prop(obj, "App::PropertyFloat", "VeinAngle", g, "between a rib and the midrib, toward the tip (degrees)", 65.0)
        length(obj, "RibWidth", g, "a rib's width", 0.12)
        length(obj, "RibDepth", g, "a rib's depth under the skin", 0.30)
        length(obj, "MidribWidth", g, "the midrib's width", 0.16)
        length(obj, "MidribDepth", g, "the midrib's depth under the skin", 0.45)
        length(obj, "EdgeWidth", g, "an edge beam's width (just inside the outline)", 0.12)
        length(obj, "EdgeDepth", g, "an edge beam's depth under the skin", 0.25)
        prop(obj, "App::PropertyFloat", "PlanArea", "Measures", "the leaf's area in plan (m²)")
        obj.setEditorMode("PlanArea", 1)

    def bumps(self, obj):
        """The bumps as a list of dicts (Bumps empty: none, the leaf is flat)."""
        text = str(obj.Bumps or "").strip()
        try:
            rows = json.loads(text) if text else []
        except ValueError:
            raise ValueError("Bumps is not a list of bumps written as JSON: %s" % text[:80])
        if not isinstance(rows, list) or not all(isinstance(b, dict) and float(b.get("Sx", 0)) > 0 and float(b.get("Sy", 0)) > 0 and "A" in b for b in rows):
            raise ValueError("each bump needs its A, and its Sx and Sy above nought: %s" % text[:80])
        return rows

    def execute(self, obj):
        if self.fresh(obj):
            return
        said = {}
        shape = og.leaf_roof_shape(m(obj.Length), m(obj.Width), float(obj.Taper), float(obj.TipCut), m(obj.BaseHeight), self.bumps(obj), m(obj.Thickness),
                                   int(obj.RibCount), float(obj.VeinAngle), m(obj.RibWidth), m(obj.RibDepth), m(obj.MidribWidth), m(obj.MidribDepth),
                                   m(obj.EdgeWidth), m(obj.EdgeDepth), said)
        obj.PlanArea = said["plan_area_m2"]
        self.said = said
        set_local(obj, shape)


class FoldedRevolution(Organic):
    """Lane R's dome folded from one sheet (card P-002; the map's catalogue form 102): Jun Mitani's ORI-REVO "cylinder
    with flaps" (MIT), as R ported it. Sides strips of flat four-sided faces from the corner lines to the blades' tips;
    the meridian a quarter circle of Radius from Oculus degrees off the pole to the ground, in Steps pieces; each face
    a slab of Thickness, half on each side of it. Its foot ring stands on the base, its axis at the origin."""

    ifc_type = "Roof"
    icon = "OrganicDome.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Folded dome"
        length(obj, "Radius", g, "the dome's radius at the ground", 4.0)
        prop(obj, "App::PropertyInteger", "Sides", g, "sides, each with its blade", 12)
        prop(obj, "App::PropertyFloat", "Flap", g, "the strip's spare width, as a share of the widest ring's side (folded out as the blade)", 0.25)
        prop(obj, "App::PropertyFloat", "Oculus", g, "where the meridian starts, in degrees from the pole (0 closes the top)", 12.0)
        prop(obj, "App::PropertyInteger", "Steps", g, "faces from the opening to the ground", 9)
        length(obj, "Thickness", g, "the sheet's thickness", 0.03)
        length(obj, "SheetWidth", "Measures", "the flat sheet it is folded from: its width (all the strips side by side)", 0.0)
        length(obj, "SheetHeight", "Measures", "the flat sheet: its height (a strip's length)", 0.0)
        for name in ("SheetWidth", "SheetHeight"):
            obj.setEditorMode(name, 1)

    def execute(self, obj):
        if self.fresh(obj):
            return
        said = {}
        shape = og.folded_revolution_shape(m(obj.Radius), int(obj.Sides), float(obj.Flap), float(obj.Oculus), int(obj.Steps), m(obj.Thickness), said)
        obj.SheetWidth, obj.SheetHeight = said["sheet_m"][0] * MM, said["sheet_m"][1] * MM
        self.said = said
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
    """A geodesic dome: an icosahedron's faces cut into Frequency² triangles and pushed out to
    the sphere. As a shell: flat panels with a real thickness, cut level so that Portion of the
    sphere's height stands. As a Frame (lane R's pattern card P-001): a round strut along every
    edge and a ball at every node, whole rows of triangles from the crown, the foot set level;
    StrutList is its cutting list."""

    ifc_type = "Roof"
    icon = "SacredGeodesic.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Geodesic dome"
        length(obj, "Radius", g, "radius of the sphere through its outer vertices", 6.0)
        prop(obj, "App::PropertyInteger", "Frequency", g, "each icosahedron edge cut into this many struts (1-8)", 3)
        length(obj, "Thickness", g, "shell thickness (not read for a frame)", 0.15)
        prop(obj, "App::PropertyFloat", "Portion", g, "how much of the sphere's height stands: 0.5 a hemisphere, 0.625 a five-eighths dome "
             "(a frame stands in whole rows of triangles: the rows whose centres stand, taken together, in this much of the height)", 0.5)
        prop(obj, "App::PropertyBool", "Frame", g, "a frame of struts and node balls instead of a shell", False)
        length(obj, "StrutSection", g, "frame: diameter of a strut", 0.09)
        prop(obj, "App::PropertyFloat", "Hub", g, "frame: diameter of the ball at each node, in strut diameters (0: none)", 1.5)
        prop(obj, "App::PropertyInteger", "Bands", g, "frame: rows of triangles that stand, counted from the crown (0: as many as Portion says)", 0)
        prop(obj, "App::PropertyInteger", "Panels", "Measures", "triangles of the whole sphere at this frequency")
        prop(obj, "App::PropertyInteger", "Struts", "Measures", "frame: number of struts")
        prop(obj, "App::PropertyInteger", "Nodes", "Measures", "frame: number of nodes")
        prop(obj, "App::PropertyInteger", "Rows", "Measures", "frame: rows of triangles that stand")
        prop(obj, "App::PropertyStringList", "StrutList", "Measures", "frame: the struts by length, node to node: how many of each (m)")
        prop(obj, "App::PropertyInteger", "FootNodes", "Measures", "frame: nodes at its foot, set level")
        prop(obj, "App::PropertyFloat", "FootLevelled", "Measures", "frame: how far apart in height its foot nodes stood on the sphere before they were set level (m)")
        for p in ("Panels", "Struts", "Nodes", "Rows", "StrutList", "FootNodes", "FootLevelled"):
            obj.setEditorMode(p, 1)

    def onChanged(self, obj, name):
        """A frame is members, a shell a roof: the class follows Frame, unless it was set to something else."""
        if name == "Frame" and "IfcType" in obj.PropertiesList and "Bands" in obj.PropertiesList:
            want = "Member" if obj.Frame else "Roof"
            if str(obj.IfcType) in ("Roof", "Member") and str(obj.IfcType) != want:
                obj.IfcType = want
                paint(obj)

    def execute(self, obj):
        if self.fresh(obj):
            return
        nu = max(1, min(8, obj.Frequency))
        obj.Panels = 20 * nu * nu
        if obj.Frame:
            if m(obj.StrutSection) <= 0:
                raise ValueError("%s needs a strut section above nought" % obj.Label)
            shape, lengths, nodes, foot, rows, spread = sacred.geodesic_frame(m(obj.Radius), nu, obj.Portion, m(obj.StrutSection), max(0.0, obj.Hub), max(0, obj.Bands))
            count = {}
            for value in lengths:
                count[round(value, 3)] = count.get(round(value, 3), 0) + 1
            obj.Struts, obj.Nodes, obj.Rows, obj.FootNodes, obj.FootLevelled = len(lengths), len(nodes), rows, foot, spread
            obj.StrutList = ["%d x %.3f m" % (n, value) for value, n in sorted(count.items())]
        else:
            shape = sacred.geodesic_dome(m(obj.Radius), nu, m(obj.Thickness), obj.Portion)
            obj.Struts, obj.Nodes, obj.Rows, obj.FootNodes, obj.FootLevelled, obj.StrutList = 0, 0, 0, 0, 0.0, []
        set_local(obj, shape)


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
    """A lattice of laths, of two kinds.

    Over a closed base curve: a net found by the force density method, every node in balance
    between its laths and its load. Standing, it is a gridshell; Hanging, a catenary net.
    Without a base: a circle of radius 6 m.

    On a Shell (any solid shell: a dome, a vault, a leaf, a conoid, a saddle): laths lying on
    its back, every Spacing both ways in the shell's own frame, turned by Turn (45: a
    diagrid), each flat on the shell from edge to edge; in one layer or two; with a beam of
    EdgeBeam along each edge of the skin they lie on (a ring at a dome's foot, another round
    its oculus). It lies where its shell lies (lane R's tool spec, study S-003)."""

    ifc_type = "Member"
    icon = "BioGridshell.svg"

    def setup(self, obj):
        super().setup(obj)
        g = "Net"
        prop(obj, "App::PropertyLink", "Base", g, "the closed boundary the laths end on (a net over a curve)")
        prop(obj, "App::PropertyLink", "Shell", g, "a solid shell the laths lie on (then no base curve is read, nor Rise, nor Hanging)")
        length(obj, "Spacing", g, "distance between laths", 1.0)
        length(obj, "Rise", g, "over a curve: height of the highest node above the boundary (the lowest, below it, when hanging)", 3.0)
        length(obj, "LathWidth", g, "width of a lath, lying in the net", 0.08)
        length(obj, "LathDepth", g, "depth of a lath, square to the net", 0.05)
        prop(obj, "App::PropertyBool", "Hanging", g, "over a curve: hang the net below its boundary instead of standing it above", False)
        length(obj, "EdgeBeam", g, "side of a square beam along the boundary, or along each edge of the shell (0: none)", 0.15)
        prop(obj, "App::PropertyAngle", "Turn", g, "on a shell: the laths' lines turned in plan (45: a diagrid)", 0.0)
        prop(obj, "App::PropertyInteger", "Layers", g, "on a shell: 1, or 2 for a second lath on each", 1)
        prop(obj, "App::PropertyInteger", "Laths", "Measures", "number of laths")
        prop(obj, "App::PropertyFloat", "LathLength", "Measures", "total length of the laths (m; of two layers: one layer's)")
        prop(obj, "App::PropertyFloat", "Residual", "Measures", "over a curve: largest unbalanced force on a node, over the node load")
        prop(obj, "App::PropertyInteger", "Nodes", "Measures", "on a shell: places where two laths' lines cross on it")
        prop(obj, "App::PropertyInteger", "Beams", "Measures", "on a shell: beams along its edges")
        prop(obj, "App::PropertyFloat", "BeamLength", "Measures", "on a shell: length of edge the beams follow (m)")
        for p in ("Laths", "LathLength", "Residual", "Nodes", "Beams", "BeamLength"):
            obj.setEditorMode(p, 1)

    def execute(self, obj):
        if self.fresh(obj):
            return
        shell = getattr(obj, "Shell", None)
        if shell is not None:
            if not hasattr(shell, "Shape") or shell.Shape.isNull() or not shell.Shape.Solids:
                raise ValueError("%s: %s is not a solid shell" % (obj.Label, shell.Label))
            if m(obj.Spacing) <= 0 or m(obj.LathWidth) <= 0 or m(obj.LathDepth) <= 0:
                raise ValueError("%s needs a spacing and a lath section above nought" % obj.Label)
            own = shell.Shape.copy()
            own.Placement = App.Placement()  # the shell in its own frame: the laths' lines run along its own x and y
            got = ob.net_on_shell(own, m(obj.Spacing), m(obj.LathWidth), m(obj.LathDepth), float(obj.Turn), 2 if obj.Layers >= 2 else 1, m(obj.EdgeBeam))
            obj.Laths, obj.LathLength, obj.Residual = got["laths"], got["length_m"], 0.0
            obj.Nodes, obj.Beams, obj.BeamLength = len(got["nodes"]), got["beams"], got["beam_m"]
            self.nodes = got["nodes"]  # in the shell's own frame (m): for whoever wants to look at them
            shape = got["shape"]
            shape.Placement = obj.Placement.inverse().multiply(shell.Placement)  # from the shell's frame into this object's own
            set_local(obj, shape)
            return
        edge, _closed = base_edge(obj, closed_required=True)
        if edge is None:
            edge = og.arc_curve(6.0, 360.0)
        shape, laths, total, residual = ob.net_shape(edge, m(obj.Spacing), m(obj.Rise), m(obj.LathWidth), m(obj.LathDepth),
                                                    obj.Hanging, m(obj.EdgeBeam))
        obj.Laths, obj.LathLength, obj.Residual = laths, total, residual
        obj.Nodes, obj.Beams, obj.BeamLength = 0, 0, 0.0
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
            elif kind == "Vault" and obj.Waves > 0 and m(obj.WaveAmplitude) > 0:
                name = "OrganicWaveVault.svg"
            elif kind == "LeafShell" and str(obj.RibPattern) == "Veins":
                name = "BioVeins.svg"
            elif kind == "Gridshell" and obj.Shell is None and obj.Hanging:
                name = "BioNet.svg"
            elif kind == "GeodesicDome" and obj.Frame:
                name = "SacredFrame.svg"
        except Exception:
            pass
        return os.path.join(ICONS, name)

    def claimChildren(self):
        base = getattr(self.Object, "Base", None)  # a curve that only this object stands on is shown under it (a shell that laths lie on is not: it is a piece of its own)
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
    "Curtain Wall": (0.72, 0.84, 0.90),
    "Railing": (0.62, 0.52, 0.36),
    "Chimney": (0.62, 0.60, 0.56),
    "Beam": (0.76, 0.58, 0.40),
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
