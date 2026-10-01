# -*- coding: utf-8 -*-
# Organic workbench: organic architecture as real solids, in metres, sent to the map.

import os

import FreeCAD as App
import FreeCADGui as Gui


class OrganicWorkbench(Gui.Workbench):
    MenuText = "Organic"
    ToolTip = ("Organic architecture that works: curved walls, shells, vaults, leaf roofs and domes as real "
               "solids in metres, and one button that stands the building on the site in the Godot map")
    Icon = os.path.join(App.getUserAppDataDir(), "Mod", "Organic", "icons", "Organic.svg")

    def Initialize(self):
        import organic_commands

        self.appendToolbar("Organic", organic_commands.NAMES)
        self.appendMenu("Organic", organic_commands.NAMES)

    def Activated(self):
        pass

    def Deactivated(self):
        pass

    def GetClassName(self):
        return "Gui::PythonWorkbench"


Gui.addWorkbench(OrganicWorkbench())
