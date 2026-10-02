# -*- coding: utf-8 -*-
"""draw_placement — pictures of a building sent to the map, drawn from the files themselves.

    ORGANIC_HEADLESS=picture   "<FreeCAD>\\bin\\freecadcmd.exe" freecad\\run_headless.py
    or, inside FreeCAD:        draw()

Two PNGs in docs/plans/freecad/:

    <name>-site.png    the parcel in plan: the surveyed boundary, the map's roads, access easement
                       and existing buildings, and the building where its placement puts it
    <name>-views.png   the building alone: plan, the entrance side, and a view from above

Everything is read back from the exchange folder (the .glb, its .json, the map's land files) and
the land pack's survey; nothing is taken from the FreeCAD document. These are drawings of the
files, not screenshots of the map: the map's own pictures are lane E's.
"""

import json
import math
import os
import pathlib
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Playground\Architect-editor\freecad"
if os.path.join(HERE, "Organic") not in sys.path:
    sys.path.insert(0, os.path.join(HERE, "Organic"))
import organic_export as ox  # noqa: E402

# The land pack (lane C's; knowledge\DATA-INVENTORY.md section 3): its own folder on this PC is read
# first (the dataset of record), its published copy only where that folder is not there.
LOCAL_PACK = r"C:\Playground\Sulphur - Spatial - Map\sulphur-mountain-world"
PACK = os.environ.get("SITE_PACK_URL") or ((pathlib.Path(LOCAL_PACK).as_uri() + "/") if os.path.isdir(LOCAL_PACK) else "https://sulphur-mountain-world.vercel.app/")
OUT = os.path.join(os.path.dirname(HERE), "docs", "plans", "freecad")
DRIVEWAY_SPOT = (-77.52, -33.00)  # where the first pavilion stood (29 Sep), metres from the anchor


def elements(glb_path):
    """[(name, triangles (n, 3, 3) in the building's own frame as (x, y, z up), rgb)]."""
    import numpy as np

    gltf, _blob = ox.read_glb(glb_path)
    out = []
    for node in gltf["nodes"]:
        if "mesh" not in node:
            continue
        t = ox.node_triangles(glb_path, node["name"])
        mat = gltf["materials"][gltf["meshes"][node["mesh"]]["primitives"][0]["material"]]
        out.append((node["name"], np.stack([t[:, :, 0], -t[:, :, 2], t[:, :, 1]], axis=2), tuple(mat["pbrMetallicRoughness"]["baseColorFactor"][:3])))
    return out


def on_site(tris, placement):
    """Triangles in the building's own frame as (east, north, up) metres from the anchor."""
    import numpy as np

    off, yaw = placement["offset_m"], math.radians(placement["rotation_deg"]["y"])
    c, s = math.cos(yaw), math.sin(yaw)
    return np.stack([off["east"] + c * tris[:, :, 0] - s * tris[:, :, 1], off["north"] + s * tris[:, :, 0] + c * tris[:, :, 1], off["up"] + tris[:, :, 2]], axis=2)


def boundary():
    """The surveyed boundary as (east, north) metres from the anchor, or None when offline."""
    try:
        req = urllib.request.Request(PACK + "survey.geojson", headers={"User-Agent": "draw_placement"})
        with urllib.request.urlopen(req, timeout=30) as r:
            survey = json.loads(r.read().decode("utf-8"))
    except OSError:
        return None
    ring = next(f for f in survey["features"] if f["properties"].get("layer") == "boundary")["geometry"]["coordinates"][0]
    kx, ky = ox.METRES_PER_DEG
    return [((lng - ox.ANCHOR["lng"]) * kx, (lat - ox.ANCHOR["lat"]) * ky) for lng, lat in ring]


def shaded(ax, parts, azimuth, elevation, title, layered=False):
    """Draw triangles as seen from a direction (the eye stands at azimuth, clockwise from the
    building's -y side, elevation above the horizon): far ones first, lit from the upper left
    and a little from the eye. With `layered`, each part is drawn whole in the order given
    (what lies just under a surface is then covered by it, not mixed into it)."""
    import numpy as np
    from matplotlib.collections import PolyCollection

    a, e = math.radians(azimuth), math.radians(elevation)
    eye = np.array([math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)])
    right = np.array([math.cos(a), math.sin(a), 0.0])
    up = np.cross(eye, right)
    light = np.array([-0.45, -0.55, 0.70])
    light /= np.linalg.norm(light)
    layers = []
    for _name, tris, rgb in parts:
        n = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
        facing = n @ eye > 1e-6  # the solids are closed: what faces away is hidden behind what faces the eye
        tris, n = tris[facing], n[facing]
        shade = 0.34 + 0.44 * np.clip(n @ light, 0.0, 1.0) + 0.22 * np.clip(n @ eye, 0.0, 1.0)
        layers.append((np.stack([tris @ right, tris @ up], axis=2), np.clip(np.outer(shade, rgb), 0.0, 1.0), tris.mean(axis=1) @ eye))
    if not layered:
        layers = [tuple(np.concatenate([layer[k] for layer in layers]) for k in range(3))]
    for polys, colours, depth in layers:
        order = np.argsort(depth)
        ax.add_collection(PolyCollection(polys[order], facecolors=colours[order], edgecolors="none", antialiaseds=False))
    polys = np.concatenate([layer[0] for layer in layers])
    ax.set_xlim(polys[:, :, 0].min() - 1, polys[:, :, 0].max() + 1)
    ax.set_ylim(polys[:, :, 1].min() - 1, polys[:, :, 1].max() + 1)
    ax.set_aspect("equal")
    ax.set_title(title, fontsize=10)
    ax.tick_params(labelsize=7)
    ax.grid(True, linewidth=0.3, alpha=0.5)


def draw(export=None, out_dir=OUT, land=None):
    """Write the two pictures for an export (its .glb path); returns their paths."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np
    from matplotlib.collections import PolyCollection

    export = export or os.path.join(ox.exchange_dir(), "organic-test-pavilion.glb")
    land = land or ox.land_dir(os.path.dirname(export))
    stem = os.path.splitext(os.path.basename(export))[0]
    with open(os.path.splitext(export)[0] + ".json", encoding="utf-8") as fh:
        side = json.load(fh)
    place = side["placement"]
    parts = elements(export)
    os.makedirs(out_dir, exist_ok=True)

    # ---- the site
    fig, axes = plt.subplots(1, 2, figsize=(13.5, 6.6), dpi=130)
    here = (place["offset_m"]["east"], place["offset_m"]["north"])
    ring = boundary()
    terrain = ox.node_triangles(os.path.join(land, ox.SITE_FILE), "terrain")
    for ax, half in ((axes[0], None), (axes[1], 32.0)):
        if terrain is not None and len(terrain):
            pts = terrain.reshape(-1, 3)
            ax.tricontourf(pts[:, 0], -pts[:, 2], np.arange(len(pts)).reshape(-1, 3), pts[:, 1], levels=24, cmap="Greys", alpha=0.35)
            ax.tricontour(pts[:, 0], -pts[:, 2], np.arange(len(pts)).reshape(-1, 3), pts[:, 1],
                          levels=np.arange(math.floor(pts[:, 1].min() / 5) * 5, pts[:, 1].max(), 5.0 if half is None else 1.0), colors="k", linewidths=0.25, alpha=0.45)
        for prefix, colour, label in (("road", "#6b6b6b", "roads (the map's file)"), ("easement", "#c9a35a", "access easement")):
            tris = ox.plan_triangles(os.path.join(land, ox.SITE_FILE), prefix)
            if tris is not None and len(tris):
                ax.add_collection(PolyCollection(tris, facecolors=colour, edgecolors="none", label=label))
        tris = ox.plan_triangles(os.path.join(land, ox.EXISTING_FILE), "")
        if tris is not None and len(tris):
            ax.add_collection(PolyCollection(tris, facecolors="#3b3b3b", edgecolors="none", label="existing buildings"))
        if ring:
            ax.plot([p[0] for p in ring], [p[1] for p in ring], color="#b03030", linewidth=1.2, label="surveyed boundary")
        for _name, tris, rgb in sorted(parts, key=lambda part: part[1][:, :, 2].max()):  # seen from above: the highest part last
            w = on_site(tris, place)
            ax.add_collection(PolyCollection(w[:, :, :2], facecolors=rgb, edgecolors="none"))
        ax.plot([0], [0], marker="+", color="k", markersize=10)
        ax.annotate("anchor", (0, 0), textcoords="offset points", xytext=(6, 6), fontsize=8)
        t = np.linspace(0, 2 * math.pi, 73)
        ax.plot(DRIVEWAY_SPOT[0] + 10 * np.cos(t), DRIVEWAY_SPOT[1] + 10 * np.sin(t), color="#d02020", linestyle="--", linewidth=1.0)
        ax.annotate("29 Sep spot: on the road", DRIVEWAY_SPOT, textcoords="offset points", xytext=(8, -16), fontsize=8, color="#d02020")
        ax.annotate("the pavilion now", here, textcoords="offset points", xytext=(10, 12), fontsize=8, color="#1a5a1a")
        ax.set_aspect("equal")
        ax.tick_params(labelsize=7)
        ax.set_xlabel("metres east of the anchor", fontsize=8)
        ax.set_ylabel("metres north of the anchor", fontsize=8)
        if half is None:
            xs = [p[0] for p in ring] if ring else [-300, 150]
            ys = [p[1] for p in ring] if ring else [-200, 200]
            ax.set_xlim(min(xs) - 25, max(xs) + 25)
            ax.set_ylim(min(ys) - 25, max(ys) + 25)
            ax.set_title("The parcel: north up, contours every 5 m", fontsize=10)
            ax.legend(loc="lower left", fontsize=7, framealpha=0.9)
        else:
            ax.set_xlim(here[0] - half, here[0] + half)
            ax.set_ylim(here[1] - half, here[1] + half)
            ax.set_title("Where it stands: contours every 1 m", fontsize=10)
    clear = side.get("clearance_m", {})
    fig.suptitle("%s — %.1f m E, %.1f m N of the anchor, its level (z = 0) at %.2f m, turned %.0f° %s; clear of: %s"
                 % (side["name"], here[0], here[1], place["elevation_m"], abs(place["rotation_deg"]["y"]),
                    "clockwise" if place["rotation_deg"]["y"] < 0 else "anticlockwise",
                    ", ".join("%s %.0f m" % (k.replace("_", " "), v) for k, v in sorted(clear.items()))), fontsize=10)
    fig.tight_layout(rect=(0, 0, 1, 0.96))
    site_png = os.path.join(out_dir, stem + "-site.png")
    fig.savefig(site_png)
    plt.close(fig)

    # ---- the building alone
    fig, axes = plt.subplots(1, 3, figsize=(15, 5.4), dpi=130)
    shaded(axes[0], parts, 0.0, 90.0, "Plan (the building's own axes, metres)")
    shaded(axes[1], parts, 0.0, 0.0, "The entrance side")
    shaded(axes[2], parts, -35.0, 32.0, "From above the entrance")
    fig.suptitle("%s — drawn from %s as sent to the map (%d triangles)" % (side["name"], os.path.basename(export), sum(len(t) for _n, t, _c in parts)), fontsize=10)
    fig.tight_layout(rect=(0, 0, 1, 0.95))
    views_png = os.path.join(out_dir, stem + "-views.png")
    fig.savefig(views_png)
    plt.close(fig)
    print("drew", site_png)
    print("drew", views_png)
    return site_png, views_png


if __name__ == "__main__":
    draw()
