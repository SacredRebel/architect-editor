WebXR (H16.4)
==============

Ported from pascalorg/editor PR #890 tip `516d76eb745f58741b6ec9b2b73abfdd32e91656`
(`t3code/add-webxr-project-structure`), including `packages/viewer/src/xr/**`,
viewer immersive session wiring, and `wiki/architecture/xr.md`.

Runtime plugin: `@webxr/plugin` from
`github:sudhir9297/webxr-pascal-plugin#31063230d0cd5b244b04eca12c6e31b5b757cb5e`
(MIT). IWER emulator patch: `patches/iwer@2.3.0.patch` (upstream).

Feature switch: `NEXT_PUBLIC_WEBXR` (defaults on for this eco fork; set `0` to
disable plugin discovery). Immersive session still requires installing the
WebXR plugin on the scene.
