# -*- coding: utf-8 -*-
"""run_headless — the lane's builds and checks without the FreeCAD window.

    "<FreeCAD>\\bin\\freecadcmd.exe" freecad\\run_headless.py

ORGANIC_HEADLESS names the steps, in order, separated by commas (default: check):

    install    copy freecad/Organic into FreeCAD's user Mod folder (InstallOrganic.FCMacro)
    pavilion   build the test building and send it to the map (build_test_pavilion.py)
    check      check_organic
    selftest   check_organic and its forgeries
    toolbar    check_toolbar and its forgeries: every button's own code, pressed
    import     check_import and its forgeries: a building drawn in the map, rebuilt here
    forms      check_forms and its forgeries: the catalogue's forms 102 and 107 against lane R's cases
    picture   draw the building sent to the map from its own files (draw_placement.py)
    tools      draw what the Sacred and the Biomimetic toolbars make (draw_tools.py)
    site       build the site template into SITE_FCSTD (SulphurMountainSite.FCMacro): a trial
               only, because colours, line styles and the dimension text need the window
    sitecheck  check_site and its forgeries on SITE_FCSTD; without the window its check J
               (how the dimension text is drawn) says SKIP

What is printed also goes to the file ORGANIC_HEADLESS_LOG names. The process ends with 0 when
every step passed.
"""

import os
import runpy
import sys
import traceback

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Playground\Architect-editor\freecad"


class Tee:
    def __init__(self, *streams):
        self.streams = streams

    def write(self, text):
        for s in self.streams:
            try:
                s.write(text)
            except UnicodeEncodeError:  # a console that has no θ or π: say the line without them
                s.write(text.encode(getattr(s, "encoding", None) or "ascii", "replace").decode(getattr(s, "encoding", None) or "ascii"))
            except Exception:
                pass

    def flush(self):
        for s in self.streams:
            try:
                s.flush()
            except Exception:
                pass


def step(name):
    if name == "install":
        runpy.run_path(os.path.join(HERE, "InstallOrganic.FCMacro"), run_name="organic_install")
        return True
    if name == "pavilion":
        runpy.run_path(os.path.join(HERE, "build_test_pavilion.py"), run_name="organic_pavilion")["build"]()
        return True
    if name in ("check", "selftest"):
        return bool(runpy.run_path(os.path.join(HERE, "check_organic.py"), run_name="organic_check")["run"](self_test=name == "selftest"))
    if name == "toolbar":
        return bool(runpy.run_path(os.path.join(HERE, "check_toolbar.py"), run_name="organic_check_toolbar")["run"](self_test=True))
    if name == "import":
        return bool(runpy.run_path(os.path.join(HERE, "check_import.py"), run_name="organic_check_import")["run"](self_test=True))
    if name == "forms":
        return bool(runpy.run_path(os.path.join(HERE, "check_forms.py"), run_name="organic_check_forms")["run"](self_test=True))
    if name == "site":
        runpy.run_path(os.path.join(HERE, "SulphurMountainSite.FCMacro"), run_name="site_macro")
        return True
    if name == "sitecheck":
        return bool(runpy.run_path(os.path.join(HERE, "check_site.py"), run_name="site_check")["run"](self_test=True))
    if name == "tools":
        runpy.run_path(os.path.join(HERE, "draw_tools.py"), run_name="organic_tools")["draw"]()
        return True
    if name == "picture":
        runpy.run_path(os.path.join(HERE, "draw_placement.py"), run_name="organic_picture")["draw"]()
        return True
    raise ValueError("no such step: %s" % name)


def main():
    log = os.environ.get("ORGANIC_HEADLESS_LOG")
    out = sys.stdout
    handle = open(log, "w", encoding="utf-8") if log else None
    if handle:
        sys.stdout = Tee(out, handle)
    failed = []
    try:
        for name in [s.strip() for s in os.environ.get("ORGANIC_HEADLESS", "check").split(",") if s.strip()]:
            print("=== %s" % name)
            try:
                if not step(name):
                    failed.append(name)
            except SystemExit as exc:
                if exc.code not in (0, None):
                    failed.append(name)
            except Exception:
                traceback.print_exc(file=sys.stdout)
                failed.append(name)
        print("=== %s" % ("all steps passed" if not failed else "FAILED: " + ", ".join(failed)))
    finally:
        sys.stdout.flush()
        sys.stdout = out
        if handle:
            handle.close()
    return 1 if failed else 0


if not getattr(sys, "_organic_headless_ran", False):  # freecadcmd runs a file again when its first run raised
    sys._organic_headless_ran = True
    sys.exit(main())
