# -*- coding: utf-8 -*-
"""spec_to_records — a house spec (walls as points, openings, roofs as formulas) as the map's records.

Johny's house comes as a spec: every curved wall a list of points, every opening a centre and
a width, every roof a formula over a plan outline (the layout asked for in
exchange\\house\\concept\\CHATGPT-PROMPTS.md, section 11; the first one is oak_canopy_S01.json).
This writes that spec as a "built/1" records file (exchange\\godot\\FORMAT.md): the pieces of
the Organic workbench by their own names. "Import from the map" and realize.py then make the
solids from the records, as from a building drawn in the map.

    python spec_to_records.py <spec.json> <records.json> [--floor lower=0.30] [--step 0.25]
                              [--name "..."] [--lng .. --lat .. --altitude .. --turn ..] [--pavilion]

Plain Python (any Python 3, FreeCAD's own too): no geometry is made here.

Nothing is designed here. Every number in the records is the spec's own number, or follows
from the spec's numbers by one of the rules below; what the spec says that the records do not
hold is written, line by line, into <records>.notes.txt beside the records.

  numbers    a string that ends in " est" is that number (the spec's mark for an estimate)
  frame      the spec's own: x east, y north, z up, metres, the origin at the chimney's centre
             on the main floor. The building's origin stands on the map's anchor with z = 0 on
             the ground datum there and is not turned, unless --lng, --lat, --altitude, --turn
             say otherwise
  a wall     one PlanCurve through its points, smooth (the spec's rule: "interpolate through
             the ordered sampled points"; the repeated first point of a closed list is dropped
             and the curve closed), at the wall's base level; and one Wall on it with the
             spec's thickness and height. An "outer_face" path is thickened inward (Align
             Right on a clockwise path, Left on an anticlockwise one); a centreline, a glazing
             axis and a rail axis are centred
  its top    a wall with top-edge samples takes them as TopHeights, one for each point of its
             path (the sample's z less the wall's base level)
  openings   on the wall's five lists, in the spec's order: the place is the foot of the
             opening's centre on the wall's path, in metres along the map's drawn points of
             that path; the width (along the path); the sill; the height = head - sill; Rect
  floors     one Slab for each floor outline (on the exterior wall's own path where the two
             are the same points), as thick as the spec's floor zone of that level; a level
             whose zone the spec does not state gets a slab only when --floor <level>=<m>
             states one. Listed holes (the courtyards) are circles cut through it
  chimney    one Revolved from its radius profile
  roofs      one HeightFieldShell for each roof shell: its plan outline as a PlanCurve, the
             top's heights worked out here from the spec's own expression and its clearance
             rule on a square grid (--step), the envelope thickness straight down, and its
             round holes (the courtyards; the chimney cut with its movement clearance)
  frames     one RoofFrame for each roof shell the spec gives ribs: its ridge axis, its rib
             count and section, its edge beam; a ring of the edge beam's section round each hole

--answers <file.json> adds what Johny decided after the spec, in his words (the house's
<records>.answers.json beside its records; FORMAT.md, "Johny's answers on his house S01"):

  decided    written as it is beside the records' placement (where the building stands)
  floors     a level's slab thickness the spec does not state, as --floor does
  floor_cuts a round opening in a level's floor of another piece's own radius where it passes
             the floor (round_of: the chimney): the largest radius of its profile between the
             floor's underside and its top, about its centre
  bands      one WallBand on each wall named, of the kind named, its pane as thick as the
             wall named in glass_from; its Roofs: the roof shells over any point of the wall's
             path. Where the wall's top already stands in the roof over it, that is said
"""

import argparse
import ast
import datetime
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()
if os.path.join(HERE, "Organic") not in sys.path:
    sys.path.insert(0, os.path.join(HERE, "Organic"))
from organic_points import foot_on_map_points, map_points  # noqa: E402  (the map's own sampling of a curve through points)

ANCHOR = (-119.15536, 34.4331)  # the house anchor of the canonical frame (C:\Playground\BRAIN.md §3)
OFF_PATH_M = 0.05  # an opening's centre further than this from its wall's path is named in the notes
LEVEL_WORDS = {"lower": "Lower", "main": "Main", "mezzanine": "Mezzanine"}
WALL_WORDS = {"exterior": ("exterior wall", "Wall"), "partition": ("partition", "Wall"),
              "courtyard_curtain_wall": ("courtyard glazing", "Curtain Wall"), "guard": ("guard", "Railing")}
CENTRED = ("centreline", "glazing_axis", "rail_axis")


# ---------------------------------------------------------------- the spec's numbers
def num(value):
    """A spec number: plain, or a string that ends in " est"."""
    if isinstance(value, str):
        text = value.strip()
        return float(text[:-3] if text.endswith("est") else text)
    return float(value)


def rows(points):
    return [tuple(num(c) for c in p) for p in points]


def ring_of(points):
    """(a closed list's points without the first one repeated at its end, whether it was repeated)."""
    pts = [tuple(p[:2]) for p in points]
    if len(pts) > 2 and math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1]) < 1e-9:
        return pts[:-1], True
    return pts, False


def signed_area(ring):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1])) / 2.0


def inside(p, ring):
    x, y = p
    hit = False
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
            hit = not hit
    return hit


def distance_to_polygon(p, ring):
    """How far a point is from a polygon in plan: 0 inside it, else to its nearest side."""
    if inside(p, ring):
        return 0.0
    best = float("inf")
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        dx, dy = x1 - x0, y1 - y0
        d2 = dx * dx + dy * dy
        t = 0.0 if d2 == 0 else max(0.0, min(1.0, ((p[0] - x0) * dx + (p[1] - y0) * dy) / d2))
        best = min(best, math.hypot(p[0] - x0 - t * dx, p[1] - y0 - t * dy))
    return best


# ---------------------------------------------------------------- the spec's formulas
CALLS = {"exp": math.exp, "sin": math.sin, "cos": math.cos, "sqrt": math.sqrt, "abs": abs, "min": min, "max": max,
         "clamp": lambda v, low, high: max(low, min(high, v))}


def parsed(text):
    """A spec expression read once: numbers, names, + - * / ^, brackets, and exp sin cos sqrt
    abs min max clamp. Anything else in it is refused: nothing of a spec is run as a program."""
    tree = ast.parse(text.replace("^", "**"), mode="eval")
    for node in ast.walk(tree):
        ok = isinstance(node, (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Call, ast.Name, ast.Constant, ast.Load,
                               ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow, ast.USub, ast.UAdd))
        if isinstance(node, ast.Call):
            ok = isinstance(node.func, ast.Name) and node.func.id in CALLS and not node.keywords
        if isinstance(node, ast.Constant):
            ok = isinstance(node.value, (int, float)) and not isinstance(node.value, bool)
        if not ok:
            raise ValueError("the expression %r holds something this does not read (%s)" % (text, type(node).__name__))
    return tree.body


def worked(node, names):
    """The value of a parsed expression with these names."""
    if isinstance(node, ast.Constant):
        return float(node.value)
    if isinstance(node, ast.Name):
        if node.id == "pi":
            return math.pi
        if node.id not in names:
            raise ValueError("the expression names %r, which the spec gives no number for" % node.id)
        return names[node.id]
    if isinstance(node, ast.UnaryOp):
        v = worked(node.operand, names)
        return -v if isinstance(node.op, ast.USub) else v
    if isinstance(node, ast.BinOp):
        a, b = worked(node.left, names), worked(node.right, names)
        if isinstance(node.op, ast.Add):
            return a + b
        if isinstance(node.op, ast.Sub):
            return a - b
        if isinstance(node.op, ast.Mult):
            return a * b
        if isinstance(node.op, ast.Div):
            return a / b
        if a < 0 and b != int(b):  # a root of a number just below nought (sin(pi) is not quite 0)
            if a < -1e-9:
                raise ValueError("a negative number to the power %g" % b)
            a = 0.0
        return a ** b
    return CALLS[node.func.id](*[worked(arg, names) for arg in node.args])


def shell_top(spec, shell_id):
    """The top of a roof shell as a function of (x, y), from the spec's own expressions: the
    shell's raw expression, then its clearance rule where it names one (the smooth maximum
    with a floor that falls off with the distance to the mezzanine floor's polygon)."""
    field = spec["height_fields"][shell_id]
    raw = parsed(field["raw_expression"])
    names = {k: num(v) for k, v in field.get("parameters", {}).items()}
    rule_id = field.get("clearance_rule")
    if not rule_id:
        return lambda x, y: worked(raw, dict(names, x=x, y=y))
    rule = spec["height_fields"][rule_id]
    low, final = parsed(rule["minimum_expression"]), parsed(rule["final_z_expression"])
    rule_names = {k: num(v) for k, v in rule.get("parameters", {}).items()}
    polygon, _repeated = ring_of(rows(spec["floor_outlines"]["mezzanine"]["outline_xy_m"]))  # straight between its points: "polygon"

    def top(x, y):
        z = worked(raw, dict(names, x=x, y=y))
        floor = worked(low, dict(rule_names, distance_to_mezz_polygon=distance_to_polygon((x, y), polygon)))
        return worked(final, dict(rule_names, raw_z=z, minimum_z=floor))

    return top


def formula_words(spec, shell_id):
    """The formula a shell's heights were worked out from, as the spec writes it (for the record)."""
    field = spec["height_fields"][shell_id]
    words = "z = %s; %s" % (field["raw_expression"], ", ".join("%s = %g" % (k, num(v)) for k, v in field.get("parameters", {}).items()))
    rule_id = field.get("clearance_rule")
    if rule_id:
        rule = spec["height_fields"][rule_id]
        words += " | then %s: minimum_z = %s; z = %s; %s" % (rule_id, rule["minimum_expression"], rule["final_z_expression"],
                                                            ", ".join("%s = %g" % (k, num(v)) for k, v in rule.get("parameters", {}).items()))
    return words


# ---------------------------------------------------------------- pieces
def curve_piece(piece_id, name, points, closed, z):
    return {"id": piece_id, "type": "PlanCurve", "name": name,
            "params": {"Kind": "Points", "Points": [[round(x, 6), round(y, 6)] for x, y in points], "Smooth": True, "Closed": bool(closed)},
            "placement": {"x": 0.0, "y": 0.0, "z": round(z, 6)}}


def circle_piece(piece_id, name, centre, radius, z):
    return {"id": piece_id, "type": "PlanCurve", "name": name, "params": {"Kind": "Circle", "Radius": round(radius, 6)},
            "placement": {"x": round(centre[0], 6), "y": round(centre[1], 6), "z": round(z, 6)}}


def profile_radius(profile, z_low, z_high):
    """The largest radius of a [(z, r)] profile (straight between its points) between two heights."""
    pts = sorted(profile)
    at = lambda z: next((r0 + (r1 - r0) * (z - z0) / (z1 - z0) for (z0, r0), (z1, r1) in zip(pts, pts[1:]) if z0 <= z <= z1 and z1 > z0), None)  # noqa: E731
    found = [r for r in (at(z_low), at(z_high)) if r is not None] + [r for z, r in pts if z_low <= z <= z_high]
    if not found:
        raise ValueError("the profile does not reach from %.2f to %.2f" % (z_low, z_high))
    return max(found)


def convert(spec, floors=None, step=0.25, name=None, pavilion=False, lng=ANCHOR[0], lat=ANCHOR[1], altitude=0.0, turn=0.0, source="", answers=None):
    """(the records, the notes: what was read how, and what of the spec the records do not hold).
    answers: what Johny decided after the spec (the --answers file), or None."""
    floors = dict(floors or {})
    answers = answers or {}
    said = {}  # Johny's words for what the answers set, by what they set
    for level, row in (answers.get("floors") or {}).items():
        floors[level] = float(row["thickness_m"])
        said["floor " + level] = row.get("words", "")
    notes, pieces, paths = [], [], {}
    levels = {k: num(v) for k, v in spec["frame"]["levels_m"].items()}

    # ---- walls, with their openings
    openings = {}
    for o in spec.get("3_openings", []):
        openings.setdefault(o["wall"], []).append(o)
    known_walls = set()
    for w in spec.get("2_curved_walls", []):
        wid = w["id"]
        known_walls.add(wid)
        base = num(w["z_base_m"])
        pts, repeated = ring_of(rows(w["points_xy_m"]))
        closed = bool(w.get("closed")) or repeated
        words, ifc = WALL_WORDS.get(w.get("category"), (str(w.get("category", "wall")).replace("_", " "), "Wall"))
        cid = wid + ".path"
        paths[cid] = (pts, closed, base)
        pieces.append(curve_piece(cid, "%s path" % wid, pts, closed, base))
        reference = w.get("reference")
        if reference == "outer_face":
            if not closed:
                notes.append("%s: an outer-face path that is not closed has no inside to thicken towards; it is centred" % wid)
                align = "Center"
            else:
                align = "Right" if signed_area(pts) < 0 else "Left"  # the inside is to the right of a clockwise path
        else:
            align = "Center"
            if reference not in CENTRED:
                notes.append("%s: its reference %r is not one this knows; the wall is centred on its path" % (wid, reference))
        params = {"Base": cid, "Thickness": num(w["thickness_m"]), "Align": align}
        if w.get("top_edge_xyz_m"):
            top = rows(w["top_edge_xyz_m"])
            if repeated:
                top = top[:-1]
            if len(top) != len(pts) or any(math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-6 for a, b in zip(top, pts)):
                raise ValueError("%s: its top-edge samples do not stand on its path's points" % wid)
            params["TopHeights"] = [round(t[2] - base, 6) for t in top]
            params["Height"] = round(max(params["TopHeights"]), 6)
        else:
            height = w["height_m"]
            if isinstance(height, (list, tuple)):
                notes.append("%s: its height is a range (%s) without top-edge samples; the wall is as high as the lower of the two" % (wid, ", ".join(str(h) for h in height)))
                height = min(num(h) for h in height)
            params["Height"] = num(height)
        mine = openings.get(wid, [])
        if mine:
            drawn = map_points(pts, closed)
            lists = {"OpeningPositions": [], "OpeningWidths": [], "OpeningHeights": [], "OpeningSills": [], "OpeningShapes": []}
            for o in mine:
                centre = (num(o["centre_xy_m"][0]), num(o["centre_xy_m"][1]))
                along, off, total = foot_on_map_points(drawn, closed, centre)
                sill, head, width = num(o["sill_m_above_level"]), num(o["head_m_above_level"]), num(o["width_m"])
                if off > OFF_PATH_M:
                    notes.append("%s on %s: its centre (%.2f, %.2f) lies %.3f m off the wall's path; it is set at the nearest place on the path" % (o["id"], wid, centre[0], centre[1], off))
                if abs(num(o.get("level_z_m", base)) - base) > 1e-9:
                    notes.append("%s on %s: its level %.2f is not the wall's base %.2f; its sill and head are taken above the wall's base" % (o["id"], wid, num(o["level_z_m"]), base))
                if not closed and (along - width / 2 < -1e-6 or along + width / 2 > total + 1e-6):
                    notes.append("%s on %s: it runs past the wall's end (%.2f m wide, its middle %.2f m along a wall of %.2f m)" % (o["id"], wid, width, along, total))
                lists["OpeningPositions"].append(round(along, 4))
                lists["OpeningWidths"].append(width)
                lists["OpeningHeights"].append(round(head - sill, 6))
                lists["OpeningSills"].append(sill)
                lists["OpeningShapes"].append("Rect")
                notes.append("read: %s (%s) is opening %d of %s, %.2f m along its path" % (o["id"], o.get("type", "opening"), len(lists["OpeningPositions"]), wid, along))
            params.update(lists)
        pieces.append({"id": wid, "type": "Wall", "name": "%s %s" % (wid, words), "ifc_type": ifc, "params": params})
    for wid in sorted(set(openings) - known_walls):
        notes.append("%d openings name the wall %r, which the spec does not list: left out" % (len(openings[wid]), wid))

    # ---- round holes (courtyards, the chimney's cut), made once and named by floors and roofs
    rounds = {}
    for o in spec.get("roof_oculi_skylights", []):
        if "centre_xy_m" in o and ("radius_m" in o or "radius_at_roof_m" in o):
            radius = num(o["radius_m"]) if "radius_m" in o else num(o["radius_at_roof_m"]) + num(o.get("movement_clearance_m", 0.0))
            rounds[o["id"]] = (tuple(num(c) for c in o["centre_xy_m"][:2]), radius, num(o.get("z_floor_m", 0.0)), o)

    def hole(hole_id, where):
        if hole_id not in rounds:
            notes.append("%s: its hole %s is not a round cut in the spec: not cut (%s)" % (where, hole_id, kind_of(hole_id)))
            return None
        if not any(p["id"] == hole_id for p in pieces):
            centre, radius, z, o = rounds[hole_id]
            pieces.append(circle_piece(hole_id, "%s (%s)" % (hole_id, o.get("kind", "hole")), centre, radius, z))
        return hole_id

    def kind_of(hole_id):
        return next((str(o.get("kind", "")) for o in spec.get("roof_oculi_skylights", []) if o["id"] == hole_id), "not listed")

    # ---- floors
    zones = {level: num(spec["structural_and_coordination"][key]) for level, key in (("main", "main_floor_zone_m"), ("mezzanine", "mezzanine_floor_zone_m"))
             if key in spec.get("structural_and_coordination", {})}
    for level, floor in spec.get("floor_outlines", {}).items():
        z = num(floor.get("z_m", levels.get(level, 0.0)))
        pts, _repeated = ring_of(rows(floor["outline_xy_m"]))
        if level in zones:
            thickness = zones[level]
        elif level in floors:
            thickness = floors[level]
            if said.get("floor " + level) is not None:
                notes.append("%s floor: the spec states no floor zone for this level; its slab is %.2f m thick by Johny's answer (\"%s\")" % (LEVEL_WORDS.get(level, level), thickness, said["floor " + level]))
            else:
                notes.append("%s floor: the spec states no floor zone for this level; its slab is %.2f m thick because --floor %s=%.2f said so" % (LEVEL_WORDS.get(level, level), thickness, level, thickness))
        else:
            notes.append("%s floor: the spec states no floor zone for this level: no slab (state one with --floor %s=<metres>)" % (LEVEL_WORDS.get(level, level), level))
            continue
        cid = next((k for k, (p, closed, base) in paths.items() if closed and abs(base - z) < 1e-9 and len(p) == len(pts)
                    and all(math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9 for a, b in zip(p, pts))), None)
        if cid is None:
            cid = "floor-%s.outline" % level
            pieces.append(curve_piece(cid, "%s floor outline" % LEVEL_WORDS.get(level, level), pts, True, z))
        params = {"Base": cid, "Thickness": thickness}
        holes = [h for h in (hole(h, "%s floor" % LEVEL_WORDS.get(level, level)) for h in floor.get("holes", [])) if h]
        for cut in (answers.get("floor_cuts") or {}).get(level, []):  # a round opening Johny asked for (the chimney's)
            of = cut.get("round_of")
            chimney = spec.get("structural_and_coordination", {}).get("chimney") if of == "chimney" else None
            if not chimney or not chimney.get("radius_profile_z_r_m"):
                notes.append("%s floor: the opening %s round %r is asked for, and the spec has no such piece with a profile: not cut" % (LEVEL_WORDS.get(level, level), cut["id"], of))
                continue
            centre = [num(c) for c in chimney.get("centre_xyz_m", [0, 0, 0])]
            radius = profile_radius([(num(zz) + centre[2], num(r)) for zz, r in chimney["radius_profile_z_r_m"]], z - thickness, z)
            pieces.append(circle_piece(cut["id"], "%s (the %s's opening in the %s floor)" % (cut["id"], of, level), centre[:2], radius, z))
            holes.append(cut["id"])
            notes.append("%s floor: %s, a round opening of the %s's own radius where it passes the floor (%.3f m, its largest between %.2f and %.2f), by Johny's answer (\"%s\")"
                         % (LEVEL_WORDS.get(level, level), cut["id"], of, radius, z - thickness, z, cut.get("words", "")))
        if holes:
            params["Holes"] = holes
        pieces.append({"id": "floor-%s" % level, "type": "Slab", "name": "%s floor" % LEVEL_WORDS.get(level, level), "ifc_type": "Slab", "params": params})

    # ---- the chimney
    chimney = spec.get("structural_and_coordination", {}).get("chimney")
    if chimney and chimney.get("radius_profile_z_r_m"):
        centre = [num(c) for c in chimney.get("centre_xyz_m", [0, 0, 0])]
        profile = [[num(r), num(z)] for z, r in chimney["radius_profile_z_r_m"]]
        pieces.append({"id": "chimney", "type": "Revolved", "name": "Chimney", "ifc_type": "Chimney", "params": {"Profile": profile},
                       "placement": {"x": centre[0], "y": centre[1], "z": centre[2]}})

    # ---- roofs
    leaves = {}  # each roof shell: (its outline as the map draws it, its round holes, its top, its thickness)
    for shell in spec.get("4_roof_shells", []):
        sid = shell["id"]
        outline, _repeated = ring_of(rows(shell["plan_outline_xy_m"]))
        if sid.endswith("PAV") and not pavilion:
            notes.append("%s (%s): not in these records: it stands by the pool, away from the house (--pavilion adds it)" % (sid, shell.get("name", "")))
            continue
        top = shell_top(spec, sid)
        samples = [(x, y, z) for key in ("eave_line_xyz_m", "ridge_axis_xyz_m") for x, y, z in rows(shell.get(key, []))]
        if shell.get("apex_xyz_m"):
            samples.append(tuple(num(c) for c in shell["apex_xyz_m"]))
        if samples:
            worst = max(samples, key=lambda s: abs(top(s[0], s[1]) - s[2]))
            notes.append("read: %s: the spec's expression, worked out here at the spec's own %d eave, ridge and apex samples, is within %.3f m of them (the furthest at (%.2f, %.2f): %.3f here, %.2f there)"
                         % (sid, len(samples), abs(top(worst[0], worst[1]) - worst[2]), worst[0], worst[1], top(worst[0], worst[1]), worst[2]))
        drawn = map_points(outline, True)
        xs, ys = [p[0] for p in drawn], [p[1] for p in drawn]
        x0, y0 = math.floor(min(xs) / step) * step - 2 * step, math.floor(min(ys) / step) * step - 2 * step
        columns = int(math.ceil((max(xs) - x0) / step)) + 3
        count = int(math.ceil((max(ys) - y0) / step)) + 3
        heights = [round(top(x0 + i * step, y0 + j * step), 4) for j in range(count) for i in range(columns)]
        cid = sid + ".outline"
        pieces.append(curve_piece(cid, "%s plan outline" % sid, outline, True, 0.0))
        params = {"Base": cid, "Thickness": num(shell["envelope_thickness_m"]), "GridOrigin": [round(x0, 6), round(y0, 6)], "GridStep": step,
                  "GridColumns": columns, "Heights": heights, "Formula": formula_words(spec, sid)}
        holes = [h for h in (hole(h, sid) for h in shell.get("holes", [])) if h]
        if holes:
            params["Holes"] = holes
        pieces.append({"id": sid, "type": "HeightFieldShell", "name": "%s %s" % (sid, shell.get("name", "roof shell")), "ifc_type": "Roof", "params": params})
        leaves[sid] = (drawn, [rounds[h][:2] for h in holes if h in rounds], top, num(shell["envelope_thickness_m"]))
        if shell.get("rib_count") and shell.get("ridge_axis_xyz_m") and len(shell.get("edge_beam_width_depth_m", [])) == 2:
            beam = [num(v) for v in shell["edge_beam_width_depth_m"]]
            ribs = int(round(num(shell["rib_count"])))
            pieces.append({"id": sid + ".frame", "type": "RoofFrame", "name": "%s frame" % sid, "ifc_type": "Beam",
                           "params": {"Shell": sid, "RidgePoints": [[round(x, 6), round(y, 6)] for x, y, _z in rows(shell["ridge_axis_xyz_m"])],
                                      "Ribs": ribs, "RibWidth": num(shell["rib_width_m"]), "RibDepth": num(shell["rib_depth_below_envelope_m"]),
                                      "EdgeBeamWidth": beam[0], "EdgeBeamDepth": beam[1], "Rings": True}})
            notes.append("%s: its frame from the spec's numbers (each est there): %d ribs %.2f m wide and %.2f m under the envelope, at both ends of "
                         "its ridge axis and evenly between; an edge beam %.2f by %.2f m; a ring of the edge beam's section round each hole "
                         "(the spec gives a ring no section of its own)" % (sid, ribs, num(shell["rib_width_m"]), num(shell["rib_depth_below_envelope_m"]), beam[0], beam[1]))

    # ---- the band between a wall's top and the roofs over it, closed with glass or with the wall (Johny's answer)
    band = answers.get("bands") or {}
    by_wall = {w["id"]: w for w in spec.get("2_curved_walls", [])}
    glass = num(by_wall[band["glass_from"]]["thickness_m"]) if band.get("glass_from") in by_wall else None
    for wid in band.get("walls", []):
        w = by_wall.get(wid)
        if w is None or wid + ".path" not in paths:
            notes.append("the band of %s is asked for, and the spec lists no such wall: left out" % wid)
            continue
        pts, closed, base = paths[wid + ".path"]
        drawn = map_points(pts, closed)
        over = [sid for sid, (ring, _holes, _top, _t) in leaves.items() if any(inside(p, ring) for p in drawn)]
        if not over:
            notes.append("%s: no roof shell is over it: no band" % wid)
            continue
        params = {"Wall": wid, "Roofs": over, "Kind": str(band.get("kind", "Glass"))}
        if glass is not None:
            params["Thickness"] = glass
        pieces.append({"id": wid + ".band", "type": "WallBand", "name": "%s band to the roof" % wid, "params": params})
        # where the wall's own top already stands in a roof over it (the spec's numbers against each other): no band there
        tops = [base + h for h in by_id_params(pieces, wid).get("TopHeights", [])] or [base + by_id_params(pieces, wid)["Height"]] * len(pts)
        thick, align = by_id_params(pieces, wid)["Thickness"], by_id_params(pieces, wid)["Align"]
        worst = None
        for i, (x, y) in enumerate(pts):
            a, b = pts[i - 1] if closed or i else pts[i], pts[(i + 1) % len(pts)] if closed or i < len(pts) - 1 else pts[i]
            tx, ty = b[0] - a[0], b[1] - a[1]
            k = math.hypot(tx, ty) or 1.0
            side = {"Left": 0.5, "Right": -0.5}.get(align, 0.0) * thick  # the wall's middle line, left of its path by this
            mx, my = x - ty / k * side, y + tx / k * side
            under = [(top(mx, my) - t, sid) for sid, (ring, holes_, top, t) in leaves.items() if sid in over and inside((mx, my), ring)
                     and not any(math.hypot(mx - c[0], my - c[1]) < r for c, r in holes_)]
            if under:
                low, sid = min(under)
                if worst is None or tops[i] - low > worst[0]:
                    worst = (tops[i] - low, sid, mx, my)
        if worst is not None and worst[0] > 0.005:
            notes.append("%s: its top stands up to %.2f m into %s's underside, at (%.2f, %.2f) (the spec's own numbers): its band leaves that place out"
                         % (wid, worst[0], worst[1], worst[2], worst[3]))
        notes.append("%s: a band to the roof (%s, %s), by Johny's answer (\"%s\")" % (wid, params["Kind"], ", ".join(over), band.get("words", "")))

    # ---- what the records do not hold
    structure = spec.get("structural_and_coordination", {})
    if structure.get("column_centres_xy_m"):
        notes.append("the %d column centres: not in the records (the spec gives their places, not their height or section)" % len(structure["column_centres_xy_m"]))
    for stair in spec.get("5_stairs", []):
        notes.append("stair %s (%s): not in the records" % (stair["id"], stair.get("name", "")))
    if spec.get("6_outdoor_elements"):
        notes.append("the outdoor elements (%s): not in the records" % ", ".join(sorted(spec["6_outdoor_elements"])))
    if spec.get("1_rooms"):
        notes.append("the %d rooms are names and areas, not pieces: not in the records" % len(spec["1_rooms"]))
    notes.append("materials are named in the spec for every wall and roof; a record has no place for them: not in the records")

    saved = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    records = {
        "format": "built/1",
        "id": "h-" + "".join(c if c.isalnum() else "-" for c in (name or "house").lower()).strip("-"),
        "name": name or str(spec.get("project", "House")),
        "saved": saved,
        "generator": "spec_to_records.py" + (" from %s" % source if source else ""),
        "units": "m",
        "placement": {"coordinates": [lng, lat], "altitude_m": altitude, "rotation_deg": {"x": 0.0, "y": turn, "z": 0.0}, "scale": 1.0},
        "pieces": pieces,
    }
    if answers.get("decided"):  # Johny's decisions about where it stands (FORMAT.md, "decided")
        records["decided"] = answers["decided"]
        for key, row in answers["decided"].items():
            notes.append("decided by %s on %s, %s: \"%s\"" % (row.get("by", "?"), row.get("on", "?"), key, row.get("words", "")))
    return records, notes


def by_id_params(pieces, piece_id):
    """The params of the piece with this id among pieces."""
    return next(p["params"] for p in pieces if p["id"] == piece_id)


def main(argv=None):
    ap = argparse.ArgumentParser(description="A house spec as built/1 records.")
    ap.add_argument("spec")
    ap.add_argument("records")
    ap.add_argument("--floor", action="append", default=[], metavar="LEVEL=METRES", help="the slab thickness of a level whose floor zone the spec does not state")
    ap.add_argument("--step", type=float, default=0.25, help="the roof grids' step in metres (0.25)")
    ap.add_argument("--name", default=None)
    ap.add_argument("--pavilion", action="store_true", help="also the pool pavilion's roof shell")
    ap.add_argument("--lng", type=float, default=ANCHOR[0])
    ap.add_argument("--lat", type=float, default=ANCHOR[1])
    ap.add_argument("--altitude", type=float, default=0.0, help="the building's z = 0 above the ground datum at the anchor (m)")
    ap.add_argument("--turn", type=float, default=0.0, help="degrees anticlockwise")
    ap.add_argument("--answers", default=None, help="what Johny decided after the spec (a <records>.answers.json; see the top of this file)")
    args = ap.parse_args(argv)
    floors = {}
    for item in args.floor:
        level, _eq, metres = item.partition("=")
        floors[level.strip()] = float(metres)
    with open(args.spec, encoding="utf-8") as fh:
        spec = json.load(fh)
    answers = None
    if args.answers:
        with open(args.answers, encoding="utf-8") as fh:
            answers = json.load(fh)
    records, notes = convert(spec, floors, args.step, args.name, args.pavilion, args.lng, args.lat, args.altitude, args.turn, os.path.basename(args.spec), answers)
    out = os.path.abspath(args.records)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(records, fh, indent=1)
    notes_path = os.path.splitext(out)[0] + ".notes.txt"
    with open(notes_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(notes) + "\n")
    kinds = {}
    for p in records["pieces"]:
        kinds[p["type"]] = kinds.get(p["type"], 0) + 1
    print("spec_to_records: %s: %d pieces (%s) written to %s" % (records["name"], len(records["pieces"]), ", ".join("%d %s" % (n, k) for k, n in sorted(kinds.items())), out))
    for note in notes:
        if not note.startswith("read: "):
            print("spec_to_records: not in the records, or read with a rule: %s" % note)
    print("spec_to_records: %d lines in %s" % (len(notes), notes_path))
    return 0


if __name__ == "__main__":
    sys.exit(main())
