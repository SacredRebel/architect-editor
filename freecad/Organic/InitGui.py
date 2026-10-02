# -*- coding: utf-8 -*-
# Organic workbench: organic architecture as real solids, in metres, sent to the map.

import os

import FreeCAD as App
import FreeCADGui as Gui


class OrganicWorkbench(Gui.Workbench):
    MenuText = "Organic"
    ToolTip = ("Organic architecture that works: curved walls, shells, vaults, leaf roofs and domes as real "
               "solids in metres; figures of proportion, regular solids and the sun's directions; nets, "
               "cellular walls, veined shells and branching columns; and one button that stands the "
               "building on the site in the Godot map")
    Icon = os.path.join(App.getUserAppDataDir(), "Mod", "Organic", "icons", "Organic.svg")

    def Initialize(self):
        import organic_commands

        for title, names in (("Organic", organic_commands.NAMES), ("Sacred", organic_commands.SACRED_NAMES),
                             ("Biomimetic", organic_commands.BIO_NAMES)):
            self.appendToolbar(title, names)
            self.appendMenu(title, names)

    def Activated(self):
        pass

    def Deactivated(self):
        pass

    def GetClassName(self):
        return "Gui::PythonWorkbench"


Gui.addWorkbench(OrganicWorkbench())
