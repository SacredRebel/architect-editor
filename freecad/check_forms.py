# -*- coding: utf-8 -*-
"""check_forms — the map's catalogue forms 102 (a dome folded from one sheet) and 107 (a leaf roof on ribs), written as
the map writes them (a record with a Figure), built by the import (what realize.py and "Import from the map" run), and
held against lane R's own reference cases (Spatial Map\\spatial-map\\ports\\FROM-RESEARCH.md, entries 2 and 7) and this
check's own formulas — never against the kernel's numbers:

  D. the folded dome, R's cases A and B: R's printed sheet, strip width, opening and blades are this check's own
     construction's; the piece is one slab per face (Sides x Steps), each face's middle inside it and a point the sheet's
     thickness off it, either side, outside; it holds the faces' area (worked out here) times the thickness; its box is
     R's (R's sheet solidified, then lifted to z = 0) within 5 mm.
  L. the leaf roof on ribs, R's cases C and D: R's printed heights, half-widths and rib lengths are this check's formula's;
     the skin's underside is the formula at 40 places of the leaf, and over each its top a thickness along the normal
     (as R's generator: Blender's Solidify, offset 1); its underside ends at the outline (just above it, 0.01 m inside:
     skin; 0.01 m outside: none) and its top reaches past it no further than its thickness; half-way along every rib,
     and on the midrib, a member hangs under the skin; the skin holds the closed form of a thickness along the normal
     (T A + T²/2 ∫(k1 + k2) dA + T³/3 ∫K dA, its surface's area and curvatures integrated here from the formula).
  R. there and back: the records written back from FreeCAD (what roundtrip.py sends to the map) are the records that
     went, nothing said; an edit in FreeCAD (the leaf's BaseHeight, the dome's Sides) comes back under the map's names
     (Base, Sides) and nothing else changes.
  X. the same file realized as the map's Ctrl+R calls for it (realize.py's own function): complete, one element per
     piece, each of the IFC class its record asks; the domes' elements hold the faces' area times the thickness.

    "<FreeCAD>\\bin\\freecadcmd.exe" check_forms.py [--self-test]      (FORMS_CHECK_SELF_TEST=1 says the same)

--self-test forges faults (the dome's flap 0.30, the ribs at 60 degrees, a skin of 0.15, the leaf's Base not read, nor
read back, a piece missing from the realized file) and each must be rejected by the check meant for it. Ends with 0
when every check (and every forgery) holds.
"""
import json
import math
import os
import re
import runpy
import shutil
import sys
import tempfile
import time

import FreeCAD as App
import Part

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Playground\Architect-editor\freecad"
if os.path.join(HERE, "Organic") not in sys.path:
    sys.path.insert(0, os.path.join(HERE, "Organic"))
import organic_geom as og  # noqa: E402  (its volume_of only: OCCT's adaptive measure, as check_import measures)
import organic_import as oi  # noqa: E402
import organic_leaf as ol  # noqa: E402  (the leaf's files read, and what they say)

OUT = sys.stdout
MM = 1000.0
PLAYGROUND = next((p for p in (os.path.normpath(os.path.join(HERE, "..", "..")), r"C:\Playground") if os.path.isfile(os.path.join(p, "BRAIN.md"))), r"C:\Playground")
RESEARCH_NOTE = os.environ.get("PLAYGROUND_RESEARCH_NOTE", os.path.join(PLAYGROUND, "Spatial Map", "spatial-map", "ports", "FROM-RESEARCH.md"))
APART = 40.0  # metres between the cases in the one test building
BOX_CLOSE = 0.005  # R's box against the solid's
PROBE_CLOSE = 0.001  # a surface read with points against the formula
HALF_CLOSE = 0.0015  # R's printed numbers (four decimals) against this check's formulas
SKIN_M = 0.10  # the leaf's skin in the records written here (R's cases)
# the skin's volume (OCCT's adaptive measure) against the closed form: the surface goes through 25 x 73 points of the
# formula and its offset is approximated as a NURBS surface; +0.001 % on both of R's cases (6 Oct). 0.02 % of the skin
# is 0.02 mm of thickness over the whole of it
VOLUME_CLOSE = 0.0002
LOBE_CLOSE = 0.01  # every vein ends within 1 % of the length of its lobe (the architect, 6 Oct: THE LEAF, part 2)
CORNER_CLOSE = 0.001  # metres: one of lane C's outline points and a corner of the skin are the same point
LEAF_FORGE_LENGTH = 12.0  # the forgeries build the leaf this long (every test of the leaf is a share of its length)
COVER_SHARE = 0.99  # every member of the leaf runs along at least this share of its line (on Johny's leaf: 0.9996 and more, 6 Oct)
LINE_OFF_SHARE = 0.005  # and each line lies within this share of the length of lane C's traced points (0.36 % on Johny's leaf)


def say(text):
    OUT.write(text + "\n")
    OUT.flush()


# ------------------------------------------------------------------ lane R's note
def r_cases():
    """{"fold": {"A": {...}, "B": {...}}, "leaf": {"C": {...}, "D": {...}}} as R's note prints them; {} when it is not there."""
    try:
        text = open(RESEARCH_NOTE, encoding="utf-8").read()
    except OSError:
        return {}

    def section(n):
        found = re.search(r"\n## %d\. .*?(?=\n## |\Z)" % n, text, re.S)
        return found.group(0) if found else ""

    out = {"fold": {}, "leaf": {}}
    for f in re.finditer(r"\*\*Reference case ([AB]) \S+ Radius ([\d.]+), Sides (\d+), Flap ([\d.]+), Oculus ([\d.]+)°, Steps (\d+)\*\*:(.*?)(?:\n\s*\n|\Z)", section(2), re.S):
        body = " ".join(f.group(7).split())
        sheet = re.search(r"sheet ([\d.]+) × ([\d.]+) m", body)
        box = re.search(r"box (?:with a [\d.]+ m sheet: )?([\d.]+) × ([\d.]+) × ([\d.]+) m", body)
        out["fold"][f.group(1)] = {"Radius": float(f.group(2)), "Sides": int(f.group(3)), "Flap": float(f.group(4)), "Oculus": float(f.group(5)), "Steps": int(f.group(6)),
                                   "sheet": (float(sheet.group(1)), float(sheet.group(2))), "strip": float(re.search(r"strip width ([\d.]+) m", body).group(1)),
                                   "opening": float(re.search(r"opening ([\d.]+) m", body).group(1)),
                                   "ground": float(re.search(r"blade ([\d.]+) m at the ground", body).group(1)),
                                   "top": float(re.search(r"([\d.]+) m at the opening", body).group(1)),
                                   "box": tuple(float(v) for v in box.groups())}
    for f in re.finditer(r"\*\*Reference case ([CD]) \S+ Length ([\d.]+), Width ([\d.]+), Taper ([\d.]+), Base ([\d.]+), bump A ([\d.]+) \(Sx ([\d.]+), Sy ([\d.]+)\), "
                         r"(\d+) ribs at ([\d.]+)°\*\*:(.*?)(?:\n\s*\n|\Z)", section(7), re.S):
        body = " ".join(f.group(11).split())
        bold = [float(v) for v in re.findall(r"\*\*([\d.]+)\*\*", body)]
        out["leaf"][f.group(1)] = {"Length": float(f.group(2)), "Width": float(f.group(3)), "Taper": float(f.group(4)), "Base": float(f.group(5)),
                                   "A": float(f.group(6)), "Sx": float(f.group(7)), "Sy": float(f.group(8)), "RibCount": int(f.group(9)), "VeinAngle": float(f.group(10)),
                                   "z": bold[:4], "half_quarter": bold[4], "ribs": (bold[5], bold[6]),
                                   "plan": float(re.search(r"plan area ([\d.]+) m²", body).group(1))}
    return out if out["fold"] and out["leaf"] else {}


# ------------------------------------------------------------------ this check's own formulas (written out again here)
def fold_construction(r, sides, flap, oculus, steps):
    """R's ORI-REVO construction (FROM-RESEARCH.md 2): the faces (quads, metres, the first strip, before turning), the
    sheet, the strip width, the blades, the opening."""
    t0 = math.radians(oculus)
    profile = [(r * math.sin(t0 + (math.pi / 2 - t0) * i / steps), r * math.cos(t0 + (math.pi / 2 - t0) * i / steps)) for i in range(steps + 1)]
    s, c = math.sin(math.pi / sides), math.cos(math.pi / sides)
    u = 2 * max(x for x, _z in profile) * (1 + flap) * s
    h = [0.0]
    for (xa, za), (xb, zb) in zip(profile, profile[1:]):
        h.append(h[-1] + math.sqrt(math.hypot(xb - xa, zb - za) ** 2 - ((xb - xa) * s) ** 2))

    def tip(x, z):
        long = (u + 2 * x * s) / 2
        return (x - long * s, long * c, z)

    quads = [[(xa, 0.0, za), tip(xa, za), tip(xb, zb), (xb, 0.0, zb)] for (xa, za), (xb, zb) in zip(profile, profile[1:])]
    return {"quads": quads, "sheet": (sides * u, h[-1]), "strip": u, "opening": 2 * profile[0][0],
            "ground": (u - 2 * profile[-1][0] * s) / 2, "top": (u - 2 * profile[0][0] * s) / 2}


def quad_area(q):
    a = [q[2][i] - q[0][i] for i in range(3)]
    b = [q[3][i] - q[1][i] for i in range(3)]
    cross = (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
    return 0.5 * math.sqrt(sum(v * v for v in cross))


def leaf_half(y, p):
    t = min(1.0, max(0.0, (y + p["Length"] / 2) / p["Length"]))
    return p["Width"] / 2 * math.sin(math.pi * t) ** p["Taper"]


def leaf_z(x, y, p):
    return p["Base"] + p["A"] * math.exp(-(x / p["Sx"]) ** 2 - (y / p["Sy"]) ** 2)


def leaf_slopes(x, y, p):
    """The formula's first and second derivatives at (x, y): fx, fy, fxx, fyy, fxy (its one bump, P = 2, worked out by hand)."""
    g = p["A"] * math.exp(-(x / p["Sx"]) ** 2 - (y / p["Sy"]) ** 2)
    ax, ay = 2.0 / p["Sx"] ** 2, 2.0 / p["Sy"] ** 2
    return -ax * x * g, -ay * y * g, (ax * ax * x * x - ax) * g, (ay * ay * y * y - ay) * g, ax * ay * x * y * g


def offset_volume(p, t, along=400, across=120):
    """The volume swept by the normals of length t over the formula's surface within the leaf's outline (Steiner):
    t A + t²/2 ∫(k1 + k2) dA + t³/3 ∫K dA, the curvatures signed so that a crown (its normals spreading) adds; the
    midpoint rule over the outline. Returns (the volume, the surface's area, its steepest slope)."""
    ylo, yhi = -p["Length"] / 2 + 0.03 * p["Length"], p["Length"] / 2 - 0.03 * p["Length"]
    vol = area = steep = 0.0
    for j in range(along):
        y = ylo + (yhi - ylo) * (j + 0.5) / along
        h = leaf_half(y, p)
        cell = (2 * h / across) * ((yhi - ylo) / along)
        for i in range(across):
            x = -h + 2 * h * (i + 0.5) / across
            fx, fy, fxx, fyy, fxy = leaf_slopes(x, y, p)
            w = 1 + fx * fx + fy * fy
            mean2 = -((1 + fy * fy) * fxx - 2 * fx * fy * fxy + (1 + fx * fx) * fyy) / w ** 1.5
            gauss = (fxx * fyy - fxy * fxy) / (w * w)
            da = math.sqrt(w) * cell
            area += da
            vol += (t + t * t / 2 * mean2 + t ** 3 / 3 * gauss) * da
            steep = max(steep, math.sqrt(fx * fx + fy * fy))
    return vol, area, steep


def leaf_ribs(p, tip_cut=0.03):
    y0, y1 = -p["Length"] / 2 + tip_cut * p["Length"], p["Length"] / 2 - tip_cut * p["Length"]
    ca, sa = math.cos(math.radians(p["VeinAngle"])), math.sin(math.radians(p["VeinAngle"]))
    out = []
    for j in range(1, p["RibCount"] // 2 + 1):
        ys = y0 + (y1 - y0) * j / (p["RibCount"] // 2 + 1)
        lo, hi = 0.0, p["Width"]
        for _ in range(60):
            mid = (lo + hi) / 2
            if mid * sa < leaf_half(min(y1, ys + mid * ca), p) and ys + mid * ca < y1:
                lo = mid
            else:
                hi = mid
        out.append((ys, lo, sa, ca))
    return out


# ------------------------------------------------------------------ the records as the map writes them, built here
def records(cases, forge=""):
    pieces = []
    for k, (letter, p) in enumerate(sorted(cases["fold"].items())):
        # ifc_type as the map writes it (pieces.gd's ifc_type: none for a FoldedRevolution, Roof for a HeightFieldShell)
        pieces.append({"id": "fold-" + letter, "type": "FoldedRevolution", "name": "Dome folded from one sheet " + letter, "ifc_type": "Building Element Proxy",
                       "params": {"Figure": "FoldedRevolution", "Radius": p["Radius"], "Sides": p["Sides"], "Flap": p["Flap"] + (0.05 if forge == "flap" else 0.0),
                                  "Oculus": p["Oculus"], "Steps": p["Steps"], "Thickness": 0.03},
                       "placement": {"x": APART * k, "y": 0.0, "z": 0.0, "turn": 0.0}})
    for k, (letter, p) in enumerate(sorted(cases["leaf"].items())):
        params = {"Figure": "HeightFieldShell", "Length": p["Length"], "Width": p["Width"], "Taper": p["Taper"], "Base": p["Base"],
                  "Bumps": [{"A": p["A"], "Cx": 0.0, "Cy": 0.0, "Sx": p["Sx"], "Sy": p["Sy"], "P": 2}], "Thickness": 0.15 if forge == "skin" else SKIN_M,
                  "RibCount": p["RibCount"], "VeinAngle": 60.0 if forge == "angle" else p["VeinAngle"], "RibWidth": 0.12, "RibDepth": 0.30,
                  "MidribWidth": 0.16, "MidribDepth": 0.45}
        if forge == "base":
            params.pop("Base")
            params["Bumps"][0]["A"] += p["Base"] - 2.6  # the default Base under the bump: the crown where R has it, everything else off
        pieces.append({"id": "leaf-" + letter, "type": "HeightFieldShell", "name": "Leaf roof on ribs " + letter, "ifc_type": "Roof",
                       "params": params, "placement": {"x": APART * k, "y": APART, "z": 0.0, "turn": 0.0}})
    return {"format": "built/1", "id": "h-forms-check", "name": "The catalogue's forms 102 and 107", "units": "m",
            "placement": {"coordinates": [-119.15536, 34.4331], "altitude_m": 0.0, "rotation_deg": {"x": 0.0, "y": 0.0, "z": 0.0}, "scale": 1.0}, "pieces": pieces}


def built(data):
    """{piece id: (its shape in the building's own frame, the object)}, the import's notes."""
    folder = tempfile.mkdtemp(prefix="organic-forms-")
    path = os.path.join(folder, "forms.json")
    json.dump(data, open(path, "w", encoding="utf-8"), indent=1)
    doc = App.newDocument("FormsCheck")
    try:
        res = oi.import_built(doc, path)
        back = res["building"].Placement.inverse()
        shapes = {}
        for key, obj in res["made"].items():
            shape = obj.Shape.copy()
            shape.Placement = back.multiply(shape.Placement)
            shapes[key] = shape
        return shapes, res
    finally:
        shutil.rmtree(folder, ignore_errors=True)


def close(a, b):
    """Numbers within 1e-9, everything else equal (a record against a record)."""
    if isinstance(a, dict) and isinstance(b, dict):
        return set(a) == set(b) and all(close(a[k], b[k]) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(close(x, y) for x, y in zip(a, b))
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool) and not isinstance(b, bool):
        return abs(a - b) <= 1e-9
    return a == b


def there_and_back(res, data, forge=""):
    """R. The records written back from FreeCAD (organic_records.records_of, what roundtrip.py sends to the map): as
    they went and nothing said; then, with leaf C's BaseHeight 0.2 m higher and dome A's Sides two fewer in FreeCAD, as
    they went but for the map's Base and Sides of those two. forge "back": the import's renaming forgotten on the way."""
    import organic_records as orc

    leaf, dome = res["made"].get("leaf-C"), res["made"].get("fold-A")
    if leaf is None or dome is None:
        return {"made": False}
    same, said = orc.records_of(res, data)
    leaf.BaseHeight = leaf.BaseHeight.Value + 200.0
    dome.Sides = dome.Sides - 2
    leaf.Document.recompute()
    names = oi.PARAM_NAMES
    if forge == "back":
        oi.PARAM_NAMES = {}
    try:
        edited, told = orc.records_of(res, data)
    finally:
        oi.PARAM_NAMES = names
    want = json.loads(json.dumps(data["pieces"]))
    for p in want:
        if p["id"] == "leaf-C":
            p["params"]["Base"] += 0.2
        if p["id"] == "fold-A":
            p["params"]["Sides"] -= 2
    got = {p["id"]: p["params"] for p in edited["pieces"]}
    return {"made": True, "same": same["pieces"] == data["pieces"], "said": said, "edited_only": close(want, edited["pieces"]), "told": told,
            "base": got.get("leaf-C", {}).get("Base"), "sides": got.get("fold-A", {}).get("Sides")}


def realized(data):
    """X. The same file realized as the map's Ctrl+R calls for it: realize.py's own function, in a scratch folder."""
    realize = runpy.run_path(os.path.join(HERE, "realize.py"), run_name="organic_realize")["realize"]
    folder = tempfile.mkdtemp(prefix="organic-forms-realize-")
    try:
        records = os.path.join(folder, "forms.json")
        with open(records, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=1)
        result = realize(records)
        return dict({k: result.get(k) for k in ("ok", "complete", "error", "pieces", "made", "solids", "notes", "seconds")},
                    elements={e["piece"]: e for e in result.get("elements", [])}, asked={p["id"]: p["ifc_type"] for p in data["pieces"]})
    finally:
        shutil.rmtree(folder, ignore_errors=True)


def inside(shape, x, y, z):
    v = App.Vector(x * MM, y * MM, z * MM)
    return any(s.BoundBox.isInside(v) and s.isInside(v, 1e-3, True) for s in shape.Solids)


def column(solid, x, y):
    line = Part.makeLine(App.Vector(x * MM, y * MM, -50 * MM), App.Vector(x * MM, y * MM, 50 * MM))
    zs = sorted(v.Point.z / MM for v in solid.common(line).Vertexes)
    return (zs[0], zs[-1]) if len(zs) >= 2 else None


# ------------------------------------------------------------------ measures
def measure(cases, shapes):
    out = {"fold": {}, "leaf": {}}
    for k, (letter, p) in enumerate(sorted(cases["fold"].items())):
        shape = shapes.get("fold-" + letter)
        mine = fold_construction(p["Radius"], p["Sides"], p["Flap"], p["Oculus"], p["Steps"])
        row = {"mine": {key: mine[key] for key in ("sheet", "strip", "opening", "ground", "top")}, "r": p}
        if shape is None or shape.isNull() or not shape.Solids:
            out["fold"][letter] = dict(row, made=False)
            continue
        x0 = APART * k
        mids, offs, area = 0, 0, 0.0
        for i in range(p["Sides"]):
            ang = 2 * math.pi * i / p["Sides"]
            ca, sa = math.cos(ang), math.sin(ang)
            for q in mine["quads"]:
                t = [(a[0] * ca - a[1] * sa, a[0] * sa + a[1] * ca, a[2]) for a in q]
                area += quad_area(t)
                m = [sum(a[c] for a in t) / 4 for c in range(3)]
                d1 = [t[2][c] - t[0][c] for c in range(3)]
                d2 = [t[3][c] - t[1][c] for c in range(3)]
                n = (d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0])
                ln = math.sqrt(sum(v * v for v in n)) or 1.0
                n = [v / ln for v in n]
                # the face's own slab: the one its middle is in (near the opening a blade and the next strip's face lie
                # almost in one plane, so a point off one face may be in the other's slab: each is asked of its own)
                mid = App.Vector((x0 + m[0]) * MM, m[1] * MM, m[2] * MM)
                own = [sl for sl in shape.Solids if sl.BoundBox.isInside(mid) and sl.isInside(mid, 1e-3, True)]
                mids += len(own) == 1
                offs += sum(any(sl.isInside(App.Vector((x0 + m[0] + n[0] * s * 0.03) * MM, (m[1] + n[1] * s * 0.03) * MM, (m[2] + n[2] * s * 0.03) * MM), 1e-3, True)
                                for sl in own) for s in (-1.0, 1.0))
        bb = shape.BoundBox
        row.update({"made": True, "solids": len(shape.Solids), "valid": all(s.isValid() for s in shape.Solids), "faces": p["Sides"] * p["Steps"],
                    "middles_in": mids, "offs_in": offs, "volume": sum(s.Volume for s in shape.Solids) / 1e9, "want_volume": area * 0.03,
                    "box": (bb.XLength / MM, bb.YLength / MM, bb.ZLength / MM)})
        out["fold"][letter] = row
    for k, (letter, p) in enumerate(sorted(cases["leaf"].items())):
        shape = shapes.get("leaf-" + letter)
        ribs = leaf_ribs(p)
        row = {"r": p, "mine": {"z": [leaf_z(0, 0, p), leaf_z(0, p["Length"] / 4, p), leaf_z(p["Width"] / 2, 0, p), leaf_z(0, p["Length"] / 2 - 0.03 * p["Length"], p)],
                                "half_quarter": leaf_half(-p["Length"] / 4, p), "ribs": (max(r[1] for r in ribs), min(r[1] for r in ribs))}}
        if shape is None or shape.isNull() or not shape.Solids:
            out["leaf"][letter] = dict(row, made=False)
            continue
        x0, y0 = APART * k, APART
        skin = shape.Solids[0]
        under, tops = [], []
        ylo, yhi = -p["Length"] / 2 + 0.03 * p["Length"], p["Length"] / 2 - 0.03 * p["Length"]
        for j in range(8):
            y = ylo + (yhi - ylo) * (j + 0.5) / 8
            for f in (-0.75, -0.4, 0.15, 0.55, 0.85):
                x = f * leaf_half(y, p)
                col = column(skin, x0 + x, y0 + y)
                if col is None:
                    under.append(None)
                    continue
                e = 1e-5
                fx = (leaf_z(x + e, y, p) - leaf_z(x - e, y, p)) / (2 * e)
                fy = (leaf_z(x, y + e, p) - leaf_z(x, y - e, p)) / (2 * e)
                under.append(col[0] - leaf_z(x, y, p))
                tops.append((col[1] - col[0]) - SKIN_M * math.sqrt(1 + fx * fx + fy * fy))  # an offset along the normal, read upright
        # where the outline is at a quarter of the length: 2 mm above the underside 0.01 m either side of it, and a whole
        # column a thickness and 0.01 m out (the top, moved along the normal, reaches past the outline by less than that)
        yq = -p["Length"] / 4
        hw = leaf_half(yq, p)
        edge = (inside(skin, x0 + hw - 0.01, y0 + yq, leaf_z(hw - 0.01, yq, p) + 0.002), inside(skin, x0 + hw + 0.01, y0 + yq, leaf_z(hw + 0.01, yq, p) + 0.002),
                column(skin, x0 + hw + SKIN_M + 0.01, y0 + yq) is not None)
        hung, members = 0, shape.Solids[1:]
        wanted = []
        for ys, lo, sa, ca in ribs:
            for side in (-1.0, 1.0):
                wanted.append((side * lo / 2 * sa, ys + lo / 2 * ca, 0.30))
        wanted += [(0.0, (ylo + yhi) / 2 + 0.37, 0.45), (0.0, ylo + 0.6, 0.45)]  # the midrib, away from the ribs' stations
        for x, y, depth in wanted:
            zz = leaf_z(x, y, p) - depth / 2
            hung += any(s.BoundBox.isInside(App.Vector((x0 + x) * MM, (y0 + y) * MM, zz * MM)) and s.isInside(App.Vector((x0 + x) * MM, (y0 + y) * MM, zz * MM), 1e-3, True)
                        for s in members)
        want_skin, surface, steep = offset_volume(p, SKIN_M)
        home = skin.copy()  # measured where it was built (OCCT's measure of a curved solid loses digits with distance from the origin)
        home.translate(App.Vector(-x0 * MM, -y0 * MM, 0.0))
        row.update({"made": True, "solids": len(shape.Solids), "valid": all(s.isValid() for s in shape.Solids), "under": under, "tops": tops, "edge": edge,
                    "hung": hung, "wanted": len(wanted), "skin_volume": og.volume_of(home) / 1e9, "want_skin": want_skin, "surface": surface, "steep": steep})
        out["leaf"][letter] = row
    return out


# ------------------------------------------------------------------ T. Johny's leaf, as lane C traced it
def test_leaf_files(folder):
    """A TEST leaf — lane A's, NOT Johny's — in lane C's frame and keys (exchange\\house\\leaf\\FRAME.md), for while C's
    files are not there: lane R's sin^0.6 outline with sharp teeth, a vein from the midrib to each tooth organic_leaf
    finds (labelled as FRAME.md labels a lobe: "right 1" … counted from the stem; the midrib's "tip"), four round
    holes, a cupped curl. Written into folder; returns the five paths."""
    teeth_per_side, width = 7, 0.70

    def side(sign, n=150):
        pts = []
        for k in range(n + 1):
            t = k / float(n)
            phase = (t * (teeth_per_side + 0.5)) % 1.0
            bump = 0.10 * (phase if phase < 0.85 else (1.0 - phase) / 0.15 * 0.85)
            h = width / 2.0 * math.sin(math.pi * t) ** 0.6
            pts.append((sign * (h * (1.0 + bump) if 0.04 < t < 0.97 else h), t - 0.5))
        return pts

    outline = side(1.0) + side(-1.0)[::-1][1:-1]  # the first point not repeated (FRAME.md)
    tips = ol.teeth({"outline": outline})
    veins = [{"name": "midrib", "rank": 1, "lobe": "tip", "points": [[0.0, -0.5 + 0.125 * i] for i in range(9)]}]
    for side_name in ("right", "left"):
        for k, tip in enumerate(tips[side_name]):
            start = (0.0, max(-0.45, tip[1] - 0.18))
            veins.append({"name": "%s%d" % (side_name[0].upper(), k + 1), "rank": 2, "lobe": "%s %d" % (side_name, k + 1),
                          "points": [list(start), [(start[0] + tip[0]) / 2.0, (start[1] + tip[1]) / 2.0 + 0.01], [tip[0] * 0.995, tip[1]]]})
    holes = [{"name": "h%d" % (j + 1), "points": [[cx + 0.012 * math.cos(2 * math.pi * i / 12), cy + 0.012 * math.sin(2 * math.pi * i / 12)] for i in range(12)]}
             for j, (cx, cy) in enumerate(((0.12, 0.05), (-0.10, -0.12), (0.07, -0.25), (-0.15, 0.22)))]
    cols, rows, step, x0, y0 = 21, 27, 0.04, -0.40, -0.52
    heights = [0.06 * (1 - ((x0 + i * step) / 0.40) ** 2) + 0.04 * (1 - ((y0 + j * step) / 0.52) ** 2) for j in range(rows) for i in range(cols)]
    head = {"frame": "leaf", "unit": "fraction of blade length", "source": ["none: made by check_forms"], "class": "TEST",
            "method": "a TEST leaf of lane A's check_forms, not Johny's"}
    files = {"outline": dict(head, outline=[list(p) for p in outline], stem=[[0.0, -0.5], [0.01, -0.56], [0.03, -0.62]]),
             "veins": dict(head, veins=veins), "holes": dict(head, holes=holes),
             "profile": dict(head, origin=[x0, y0], step=step, columns=cols, rows=rows, heights=heights),
             "place": dict(head, centre={"easting_m": 0.0, "northing_m": 0.0, "lng": -119.15536, "lat": 34.4331, "crs": "TEST"}, heading_deg=112.0,
                           length_m=50.0, width_m=35.0, length_source="DERIVED", length_method="TEST", matched_to="TEST", ground_m=425.63)}
    paths = {}
    for kind, data in files.items():
        paths[kind] = os.path.join(folder, ol.FILES[kind])
        with open(paths[kind], "w", encoding="utf-8") as fh:
            json.dump(data, fh)
    return paths


def leaf_source():
    """(what it is, the five paths, a scratch folder or None): lane C's files once C's README.md is there (written last:
    the files are whole then), else the test leaf."""
    real = ol.default_paths()
    if os.path.isfile(ol.resolve(ol.LEAF_DIR + "/README.md")) and all(os.path.isfile(ol.resolve(p)) for p in real.values()):
        return "Johny's leaf (lane C's files)", real, None
    folder = tempfile.mkdtemp(prefix="organic-test-leaf-")
    return "lane A's TEST leaf, not Johny's (lane C's files are not there yet: %s)" % ol.resolve(ol.LEAF_DIR), test_leaf_files(folder), folder


def forged_copy(paths, kind, change):
    """The five files copied into a scratch folder, the one of `kind` changed by change(its JSON) -> its JSON."""
    folder = tempfile.mkdtemp(prefix="organic-leaf-forged-")
    out = {}
    for k, p in paths.items():
        out[k] = os.path.join(folder, os.path.basename(ol.resolve(p)))
        with open(ol.resolve(p), encoding="utf-8") as fh:
            data = json.load(fh)
        if k == kind:
            data = change(data)
        with open(out[k], "w", encoding="utf-8") as fh:
            json.dump(data, fh)
    return out, folder


def _ring_of(data):
    """The outline file's ring (the list itself, to change in place) and the table that holds a closed flag."""
    ring = ol._first(data, "outline", "blade", "ring", "points")
    if isinstance(ring, dict):
        return ol._first(ring, "points", "ring", "polyline", "line", "coordinates"), ring
    return ring, data


def forge_open(data):
    """The outline's last tenth of points gone: a trace that stopped short of coming round."""
    ring, holder = _ring_of(data)
    if math.hypot(ring[0][0] - ring[-1][0], ring[0][1] - ring[-1][1]) <= 1e-12:
        ring.pop()
    del ring[-max(3, len(ring) // 10):]
    for d in (data, holder):
        if isinstance(d, dict) and "closed" in d:
            d["closed"] = False
    return data


def forge_crossing(data):
    ring, _holder = _ring_of(data)
    n = len(ring) - 1
    ring[n // 4], ring[n // 2] = ring[n // 2], ring[n // 4]
    return data


def forge_thinned(data):
    """The outline missing one of its points: the one most in line with its neighbours (the leaf hardly changes)."""
    ring, _holder = _ring_of(data)
    closed = math.hypot(ring[0][0] - ring[-1][0], ring[0][1] - ring[-1][1]) <= 1e-12
    n = len(ring) - (1 if closed else 0)

    def bend(i):
        (ax, ay), (bx, by), (cx, cy) = ring[(i - 1) % n], ring[i], ring[(i + 1) % n]
        return abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax))

    drop = min(range(1, n - 1), key=bend)
    del ring[drop]
    return data


def forge_short_veins(data):
    rows = ol._first(data, "veins", "chains", "lines")
    for row in rows:
        if isinstance(row, dict) and int(row.get("rank", 1)) > 1:
            pts = ol._first(row, "points", "polyline", "line")
            (ax, ay), (bx, by) = pts[-2], pts[-1]
            seg = math.hypot(bx - ax, by - ay) or 1.0
            pull = min(0.03, 0.9 * seg) / seg  # 3 % of the length shorter at its end
            pts[-1] = [bx - (bx - ax) * pull, by - (by - ay) * pull]
    return data


def leaf_column(solid, x, y, reach):
    line = Part.makeLine(App.Vector(x * MM, y * MM, -reach * MM), App.Vector(x * MM, y * MM, reach * MM))
    zs = sorted(v.Point.z / MM for v in solid.common(line).Vertexes)
    return (zs[0], zs[-1]) if len(zs) >= 2 else None


def leaf_case(paths, length_m=None, holes_cut=True, back=False, realize=False, truth=None, openings=None):
    """T. The leaf's records as leaf_to_records writes them, built by the import (as realize.py runs it), measured
    against lane C's own files (read here, independently of what the build says of itself). truth: the files the
    measures hold it against when it is built from forged ones (the self-test). openings: the marks named openings in
    the record (None: none named — lane C's choice holds)."""
    from shapely.geometry import Polygon

    l2r = runpy.run_path(os.path.join(HERE, "leaf_to_records.py"), run_name="organic_leaf_records")
    leaf = ol.read_leaf(paths)
    place = ol.place_of(leaf)
    L = float(length_m or place["length_m"])
    built_from, leaf = leaf, ol.read_leaf(truth) if truth else leaf
    data = l2r["records"](built_from, place, L, place["length_source"], 0.0, "0 (check_forms: where it stands is not checked here)")
    if openings is not None:
        data["pieces"][0]["params"]["Openings"] = list(openings)
    orig = ol.leaf_roof_shape
    if not holes_cut:
        ol.leaf_roof_shape = lambda *a, **k: orig(*a, **dict(k, holes_cut=False))
    t0 = time.time()
    try:
        shapes, res = built(data)
    finally:
        ol.leaf_roof_shape = orig
    names = leaf["hole_names"]
    chosen = list(openings) if openings is not None else list(leaf["openings_by_default"])
    out = {"length": L, "seconds": time.time() - t0, "lost": list(res["lost"]), "c_points": leaf["outline_count"], "holes_given": len(leaf["holes"]),
           "chosen": chosen, "through_found": sum(1 for t in leaf["hole_through"] if t)}
    shape, obj = shapes.get("oak-leaf"), res["made"].get("oak-leaf")
    if shape is None or obj is None or not shape.Solids:
        return dict(out, made=False)
    skin = shape.Solids[0]
    ring = [(x * L, y * L) for x, y in leaf["outline"]]
    marks = [(n, [(x * L, y * L) for x, y in h]) for n, h in zip(names, leaf["holes"])]
    cut = [h for n, h in marks if n in chosen]
    corners = [(v.Point.x / MM, v.Point.y / MM) for v in skin.Vertexes]
    matched = sum(1 for x, y in ring if min(math.hypot(x - a, y - b) for a, b in corners) <= CORNER_CLOSE)
    reach = 2.0 * L + 100.0
    holes_seen = []  # (name, asked to be an opening, a line down it meets no solid, the skin beside it)
    for n, h in marks:
        poly = Polygon(h)
        inner = poly.representative_point()
        through = not any(leaf_column(s, inner.x, inner.y, reach) for s in shape.Solids)
        c = poly.centroid
        (vx, vy) = h[0]
        d = math.hypot(vx - c.x, vy - c.y) or 1.0
        beside = leaf_column(skin, vx + (vx - c.x) / d * 0.005 * L, vy + (vy - c.y) / d * 0.005 * L, reach) is not None
        holes_seen.append((n, n in chosen, through, beside))
    members, by_name, k = shape.Solids[1:], {}, 0
    for row in obj.Members:
        name, count = row.rsplit(":", 1)
        by_name[name] = members[k:k + int(count)]
        k += int(count)
    ends, agree = [], []
    for v in leaf["veins"]:
        lobe = ol.vein_lobe(leaf, v)
        if lobe is None and v["rank"] == 1:
            lobe = max(leaf["outline"], key=lambda p: p[1])  # the midrib's lobe: the blade's tip
        named = ol.lobe_point(leaf, v["lobe"])
        if v.get("lobe_tip") is not None and named is not None:
            agree.append(math.hypot(named[0] - v["lobe_tip"][0], named[1] - v["lobe_tip"][1]) <= 1e-9)
        sols = by_name.get("midrib" if v["rank"] == 1 else "vein %s" % v["id"]) or []
        if lobe is None or not sols:
            ends.append((v["id"], None if lobe is None else float("inf")))
            continue
        line = Part.makeLine(App.Vector(lobe[0] * L * MM, lobe[1] * L * MM, -reach * MM), App.Vector(lobe[0] * L * MM, lobe[1] * L * MM, reach * MM))
        ends.append((v["id"], min(line.distToShape(s)[0] for s in sols) / MM))
    out.update({"made": True, "valid": all(s.isValid() for s in shape.Solids), "solids": len(shape.Solids), "matched": matched,
                "faces": len(skin.Faces), "want_faces": 2 + len(ring) + sum(len(h) for h in cut), "holes": holes_seen, "ends": ends,
                "labels_agree": (sum(agree), len(agree)), "plan_area": Polygon(ring, cut).area, "said_area": float(obj.PlanArea),
                "members": list(obj.Members), "width": float(obj.Width.Value) / MM,
                "coverage": dict(getattr(obj.Proxy, "said", {}).get("coverage") or {}), "line_off": dict(getattr(obj.Proxy, "said", {}).get("line_off_m") or {})})
    if back:
        import organic_records as orc

        same, said = orc.records_of(res, data)
        width0 = obj.Width.Value / MM
        obj.Length = obj.Length.Value + 5000.0
        obj.Document.recompute()
        # rebuilt at the new length: not marked invalid, and its width grown with it (a failed rebuild keeps the old shape)
        rebuilt = "Invalid" not in obj.State and abs(obj.Width.Value / MM - width0 * (L + 5.0) / L) <= 1e-6 * L
        edited, told = orc.records_of(res, data)
        want = json.loads(json.dumps(data["pieces"]))
        want[0]["params"]["Length"] = L + 5.0
        out["back"] = {"same": same["pieces"] == data["pieces"] and not said, "edited_only": close(want, edited["pieces"]), "told": told,
                       "length": edited["pieces"][0]["params"]["Length"], "valid_after": rebuilt and obj.Shape.isValid() and bool(obj.Shape.Solids),
                       "state_after": list(obj.State), "width_after": obj.Width.Value / MM, "width_want": width0 * (L + 5.0) / L}
    if realize:
        out["realized"] = realized(data)
    return out


def leaf_refusals(paths):
    """A forged outline must be refused by the reader: open, and crossing itself. {"open": its words, "crossing": …}."""
    out = {}
    for name, change, want in (("open", forge_open, "is open"), ("crossing", forge_crossing, "crosses itself")):
        forged, folder = forged_copy(paths, "outline", change)
        try:
            ol.read_leaf(forged)
            out[name] = (False, "ACCEPTED")
        except ValueError as exc:
            out[name] = (want in str(exc), str(exc)[:140])
        except Exception as exc:  # stopped further on, not by the reader's own test
            out[name] = (False, "not refused by the reader; it broke later: %s: %s" % (type(exc).__name__, str(exc)[:100]))
        finally:
            shutil.rmtree(folder, ignore_errors=True)
    return out


def leaf_judge(t, what, ok):
    """The T lines (the leaf), into ok(cond, msg)."""
    if not t.get("made"):
        ok(False, "T %s: NOT MADE (%s)" % (what, "; ".join(t.get("lost", [])) or "no shape"))
        return
    L = t["length"]
    ok(t["valid"] and t["matched"] == t["c_points"] and t["faces"] == t["want_faces"] and not t["lost"],
       "T %s at %.3f m: the outline file's %d points are the skin's own corners (%d within %.3f m); its rim %d faces "
       "(2 + the outline's and the holes' points: %d); %d solids, all valid; built in %.1f s; the plan area %.3f m² (the outline file's less its holes, "
       "worked out here; the object says %.3f), %.3f m across"
       % (what, L, t["c_points"], t["matched"], CORNER_CLOSE, t["faces"], t["want_faces"], t["solids"], t["seconds"], t["plan_area"], t["said_area"], t["width"]))
    holes = t["holes"]
    ok(all(asked == through and beside for _n, asked, through, beside in holes),
       "T %s: its %d marks cut as asked — openings %s (lane C found %d of them going through; none named: C's choice holds): a line down each "
       "opening meets no solid, a line down each other mark meets the skin (%s), and %.3f m beside each the skin is there (%s)"
       % (what, len(holes), ", ".join(t["chosen"]) or "none", t["through_found"],
          ", ".join("%s %s" % (n, ("cut" if through else "NOT CUT") if asked else ("skin" if not through else "CUT")) for n, asked, through, _b in holes),
          0.005 * L, ", ".join("yes" if b else "NO" for _n, _a, _t, b in holes)))
    o = t.get("opened")
    if o is not None:
        oh = o.get("holes") or []
        ok(o.get("made") and oh and all(asked and through and beside for _n, asked, through, beside in oh),
           "T %s: a mark named an opening is cut through — every mark named one (at %.0f m): %s"
           % (what, o.get("length", 0.0), ", ".join("%s %s" % (n, "cut" if through else "NOT CUT") for n, _a, through, _b in oh) or "NOT MADE"))
    given = [(k, d) for k, d in t["ends"] if d is not None]
    worst = max((d for _k, d in given), default=float("inf"))
    ok(given and worst <= LOBE_CLOSE * L,
       "T %s: every vein ends within 1 %% of the length (%.3f m) of its lobe — %d veins, the farthest %.3f m (%s); the labels counted here name "
       "lane C's own tooth for %d of %d%s"
       % (what, LOBE_CLOSE * L, len(given), worst, ", ".join("%s %.3f" % kd for kd in given[:30]), t.get("labels_agree", (0, 0))[0],
          t.get("labels_agree", (0, 0))[1],
          "; no lobe given for %s" % ", ".join(k for k, d in t["ends"] if d is None) if any(d is None for _k, d in t["ends"]) else ""))
    cover, off = t.get("coverage") or {}, t.get("line_off") or {}
    if cover:
        ok(min(cover.values()) >= COVER_SHARE and max(off.values() or [0.0]) <= LINE_OFF_SHARE * L,
           "T %s: every member runs along its whole line (at least %.0f %% of it; the least %s %.4f) and each line lies within %.1f %% of the length "
           "(%.3f m) of lane C's traced points (the farthest %s %.3f m)"
           % (what, 100 * COVER_SHARE, min(cover, key=cover.get), min(cover.values()), 100 * LINE_OFF_SHARE, LINE_OFF_SHARE * L,
              max(off, key=off.get) if off else "-", max(off.values() or [0.0])))
    b = t.get("back")
    if b is not None:
        ok(b["same"] and b["edited_only"] and len(b["told"]) == 1 and b["valid_after"],
           "T %s there and back: the records come back as they went (%s); its Length 5 m longer in FreeCAD comes back as %.3f m and nothing else (%s), "
           "the leaf built again at it (%s: %.3f m across, %.3f wanted; state %s); said: %s"
           % (what, b["same"], b["length"], b["edited_only"], b["valid_after"], b.get("width_after", 0.0), b.get("width_want", 0.0),
              ",".join(b.get("state_after", [])) or "-", "; ".join(b["told"]) or "nothing"))
    x = t.get("realized")
    if x is not None:
        els = x.get("elements") or {}
        ok(x.get("ok") is True and x.get("complete") is True and list(els) == ["oak-leaf"] and els["oak-leaf"]["ifcType"] == "Roof",
           "T %s realized as the map's Ctrl+R calls for it (realize.py's own function): complete (%s), %d element (%s), %.1f s inside%s"
           % (what, x.get("complete"), len(els), ", ".join("%s %s %.3f m³" % (k, e["ifcType"], e["volume_m3"]) for k, e in els.items()), x.get("seconds") or 0.0,
              "; error: %s" % x["error"] if x.get("error") else ""))
    r = t.get("refused")
    if r is not None:
        ok(all(v[0] for v in r.values()), "T a forged outline is refused: open (%s); crossing itself (%s)" % (r["open"][1], r["crossing"][1]))


def leaf_forged(forge, paths, what):
    """One of the leaf's forged faults, built (at LEAF_FORGE_LENGTH) and judged: the failures it gets."""
    oks, fails = [], []

    def ok(cond, msg):
        (oks if cond else fails).append(msg)

    if forge == "leaf-lax":  # the reader takes any ring: no test for an open or crossing one
        strict = ol.closed_ring
        ol.closed_ring = lambda pts, name, flag=None: list(pts)[:-1] if len(pts) > 1 and tuple(pts[0]) == tuple(pts[-1]) else list(pts)
        try:
            leaf_judge({"made": True, "length": LEAF_FORGE_LENGTH, "valid": True, "matched": 0, "c_points": 0, "faces": 0, "want_faces": 0, "lost": [],
                        "holes": [], "holes_given": 0, "chosen": [], "through_found": 0, "ends": [("x", 0.0)], "seconds": 0.0, "plan_area": 0.0, "said_area": 0.0, "width": 0.0, "solids": 0,
                        "refused": leaf_refusals(paths)}, what, ok)
        finally:
            ol.closed_ring = strict
        return fails
    if forge == "leaf-holes":
        t = leaf_case(paths, LEAF_FORGE_LENGTH, holes_cut=False, openings=ol.read_leaf(paths)["hole_names"])
    else:
        forged, folder = forged_copy(paths, "outline" if forge == "leaf-thinned" else "veins", forge_thinned if forge == "leaf-thinned" else forge_short_veins)
        try:
            t = leaf_case(forged, LEAF_FORGE_LENGTH, truth=paths)
        finally:
            shutil.rmtree(folder, ignore_errors=True)
    leaf_judge(t, what, ok)
    return fails


def judge(facts):
    oks, fails = [], []

    def ok(cond, msg):
        (oks if cond else fails).append(msg)

    for letter, f in sorted(facts["fold"].items()):
        r, mine = f["r"], f["mine"]
        printed = max(abs(mine["sheet"][0] - r["sheet"][0]), abs(mine["sheet"][1] - r["sheet"][1]), abs(mine["strip"] - r["strip"]), abs(mine["opening"] - r["opening"]),
                      abs(mine["ground"] - r["ground"]), abs(mine["top"] - r["top"]))
        ok(printed <= HALF_CLOSE, "D folded dome %s, R's numbers: sheet %.3f x %.3f, strip %.3f, opening %.3f, blades %.3f / %.3f m are this check's construction's within %.4f m"
           % (letter, r["sheet"][0], r["sheet"][1], r["strip"], r["opening"], r["ground"], r["top"], printed))
        if not f.get("made"):
            ok(False, "D folded dome %s: NOT MADE" % letter)
            continue
        box_off = max(abs(a - b) for a, b in zip(f["box"], r["box"]))
        vol_off = f["volume"] / f["want_volume"] - 1.0
        ok(f["valid"] and f["solids"] == f["faces"] and f["middles_in"] == f["faces"] and f["offs_in"] == 0 and abs(vol_off) <= 1e-6 and box_off <= BOX_CLOSE,
           "D folded dome %s (R's Radius %g, %d sides, Flap %g, Oculus %g, %d steps): %d slabs for %d faces; every face's middle in one slab (%d), a thickness off it "
           "either side outside that slab (%d in); %.4f m³ (the faces' area here times 0.03: %.4f, %+.1e); its box %.3f x %.3f x %.3f m, R's %s within %.4f m (allowed %.3f)"
           % (letter, r["Radius"], r["Sides"], r["Flap"], r["Oculus"], r["Steps"], f["solids"], f["faces"], f["middles_in"], f["offs_in"], f["volume"], f["want_volume"], vol_off,
              f["box"][0], f["box"][1], f["box"][2], "x".join("%.3f" % v for v in r["box"]), box_off, BOX_CLOSE))
    for letter, f in sorted(facts["leaf"].items()):
        r, mine = f["r"], f["mine"]
        printed = max([abs(a - b) for a, b in zip(mine["z"], r["z"])] + [abs(mine["half_quarter"] - r["half_quarter"]), abs(mine["ribs"][0] - r["ribs"][0]), abs(mine["ribs"][1] - r["ribs"][1])])
        ok(printed <= HALF_CLOSE, "L leaf roof %s, R's numbers: heights %s, half-width %.4f, ribs %.4f / %.4f m are this check's formula's within %.5f m"
           % (letter, " ".join("%.4f" % v for v in r["z"]), r["half_quarter"], r["ribs"][0], r["ribs"][1], printed))
        if not f.get("made"):
            ok(False, "L leaf roof %s: NOT MADE" % letter)
            continue
        read = [v for v in f["under"] if v is not None]
        worst_under = max((abs(v) for v in read), default=float("inf"))
        worst_top = max((abs(v) for v in f["tops"]), default=float("inf"))
        vol_off = f["skin_volume"] / f["want_skin"] - 1.0
        ok(f["valid"] and len(read) == len(f["under"]) and worst_under <= PROBE_CLOSE and worst_top <= PROBE_CLOSE and f["edge"] == (True, False, False)
           and f["hung"] == f["wanted"] and abs(vol_off) <= VOLUME_CLOSE,
           "L leaf roof %s (R's Length %g, Width %g, Taper %g, Base %g, bump %g, %d ribs at %g°): the skin's underside the formula at %d places within %.5f m and its top a "
           "thickness along the normal over it within %.5f m (allowed %.3f); its underside ends at the outline (0.01 m in: %s; out: %s) and its top reaches no further "
           "than %.2f m past it (%s); a member hangs under the skin at %d of %d places on the ribs' and the midrib's lines; the skin %.4f m³ (a thickness of %.2f along "
           "the normal over its surface of %.3f m², worked out here: %.4f, %+.3f %%, allowed %.2f %%); its steepest slope %.3f, where it is %.4f m thick read upright"
           % (letter, r["Length"], r["Width"], r["Taper"], r["Base"], r["A"], r["RibCount"], r["VeinAngle"], len(read), worst_under, worst_top, PROBE_CLOSE, f["edge"][0],
              f["edge"][1], SKIN_M + 0.01, "none there" if not f["edge"][2] else "SKIN THERE", f["hung"], f["wanted"], f["skin_volume"], SKIN_M, f["surface"], f["want_skin"],
              100 * vol_off, 100 * VOLUME_CLOSE, f["steep"], SKIN_M * math.sqrt(1 + f["steep"] ** 2)))
    b = facts.get("back")
    if b is not None:
        ok(b.get("made") and b["same"] and not b["said"] and b["edited_only"] and len(b["told"]) == 2,
           "R there and back (organic_records.records_of, as roundtrip.py sends it): the pieces come back as they went (%s), nothing said (%d); leaf C's BaseHeight "
           "0.2 m higher and dome A's Sides two fewer in FreeCAD come back as the map's Base %s and Sides %s, nothing else changed (%s); said: %s"
           % (b.get("same"), len(b.get("said") or []), b.get("base"), b.get("sides"), b.get("edited_only"), "; ".join(b.get("told") or []) or "nothing"))
    x = facts.get("realized")
    if x is not None:
        els, asked = x.get("elements") or {}, x.get("asked") or {}
        domes = [abs(els[k]["volume_m3"] / facts["fold"][k[-1]]["want_volume"] - 1.0) for k in els if k.startswith("fold-") and facts["fold"].get(k[-1], {}).get("made")]
        worst = max(domes, default=float("inf"))
        ok(x.get("ok") is True and x.get("complete") is True and sorted(els) == sorted(asked) and all(els[k]["ifcType"] == asked[k] for k in els) and worst <= 1e-5,
           "X the same file realized as the map's Ctrl+R calls for it (realize.py's own function): complete (%s), one element per piece (%d of %d), each of the IFC "
           "class its record asks (%s); the domes' elements hold the faces' area here times 0.03 within %.1e; %.1f s inside%s"
           % (x.get("complete"), len(els), len(asked), ", ".join("%s %s" % (k, els[k]["ifcType"]) for k in sorted(els)), worst, x.get("seconds") or 0.0,
              "; error: %s" % x["error"] if x.get("error") else ""))
    if facts.get("traced") is not None:
        leaf_judge(facts["traced"], facts.get("traced_what", "the leaf"), ok)
    return oks, fails


def run(self_test=None):
    if self_test is None:
        self_test = "--self-test" in sys.argv or os.environ.get("FORMS_CHECK_SELF_TEST") == "1"
    t0 = time.time()
    cases = r_cases()
    if not cases:
        say("check_forms: lane R's note with its reference cases is not there: %s" % RESEARCH_NOTE)
        return False
    data = records(cases)
    shapes, res = built(data)
    facts = measure(cases, shapes)
    facts["back"] = there_and_back(res, data)
    facts["realized"] = realized(data)
    what, leaf_paths, leaf_scratch = leaf_source()
    try:
        facts["traced"] = leaf_case(leaf_paths, back=True, realize=True)
        facts["traced"]["refused"] = leaf_refusals(leaf_paths)
        facts["traced"]["opened"] = leaf_case(leaf_paths, LEAF_FORGE_LENGTH, openings=ol.read_leaf(leaf_paths)["hole_names"])
    except ValueError as exc:  # lane C's files refused by the reader: said, as a failure
        facts["traced"] = {"made": False, "lost": ["the leaf's files were refused: %s" % exc]}
    facts["traced_what"] = what
    oks, fails = judge(facts)
    for m in oks:
        say("OK   " + m)
    for m in fails:
        say("FAIL " + m)
    lost = [n for n in res["lost"]]
    if lost:
        say("FAIL the import said something of the file is not in the building: %s" % "; ".join(lost))
        fails.append("lost")
    say("check_forms %s (%d checks, %.0f s)" % ("OK" if not fails else "FAILED (%d)" % len(fails), len(oks) + len(fails), time.time() - t0))
    if fails or not self_test:
        return not fails
    caught = 0
    forged = [("the dome's flap 0.05 more", "flap", "D folded dome A ("), ("the ribs at 60 degrees", "angle", "L leaf roof C ("),
              ("a skin of 0.15", "skin", "L leaf roof C ("), ("the leaf's Base not read (case D's 2.4 left at the default 2.6)", "base", "L leaf roof D ("),
              ("the leaf's Base not read back (the import's renaming forgotten on the way)", "back", "R "), ("a piece missing from the realized file", "lost", "X "),
              ("Johny's leaf built with the marks named openings not cut", "leaf-holes", "~cut as asked"),
              ("Johny's leaf built from its outline missing one point", "leaf-thinned", "~the outline's"),
              ("Johny's leaf built from veins 3 % of the length short of their lobes", "leaf-short", "~every vein ends within"),
              ("a crossing or open outline let through by the reader", "leaf-lax", "~a forged outline is refused")]
    for name, forge, expect in forged:
        if forge.startswith("leaf-"):
            f = leaf_forged(forge, leaf_paths, what)
        elif forge == "back":
            _shapes, again = built(data)
            _o, f = judge({"fold": {}, "leaf": {}, "back": there_and_back(again, data, forge)})
        elif forge == "lost":
            _o, f = judge({"fold": facts["fold"], "leaf": {}, "realized": dict(facts["realized"], elements={k: v for k, v in facts["realized"]["elements"].items() if k != "leaf-D"})})
        else:
            shapes, _res = built(records(cases, forge))
            _o, f = judge(measure(cases, shapes))
        hit = next((m for m in f if (expect[1:] in m if expect.startswith("~") else m.startswith(expect))), None)
        say("SELF-TEST %s %s%s" % ("OK  " if hit else "FAIL", name, " is rejected (%s)" % hit[:160] if hit else " PASSED the check meant for it (%s)" % expect))
        caught += bool(hit)
    say("check_forms --self-test %s (%d/%d forgeries rejected)" % ("OK" if caught == len(forged) else "FAILED", caught, len(forged)))
    if leaf_scratch:
        shutil.rmtree(leaf_scratch, ignore_errors=True)
    return caught == len(forged)


if __name__ in ("__main__", "check_forms") and not getattr(sys, "_organic_check_forms_ran", False):
    sys._organic_check_forms_ran = True
    result = run()
    if not App.GuiUp:
        os._exit(0 if result else 1)
