# `@pascal-app/ifc-exporter`

Pascal scene graph → IFC 4.3 (IFC4X3) SPF export. Pure logic — no DOM, no React.

Ported for Eco H16.5 from empatidesign/editor (`constructionos/taks-kaks-panel`, MIT).
Turkish zoning Psets (`Pset_TR_Zoning` / TAKS / KAKS) are **not** emitted — the
Ventura buildable envelope lives in `@eco/plugin-eco` as a translucent volume.

Uses [web-ifc](https://github.com/ThatOpen/engine_web-ifc) unmodified (MPL-2.0);
see `NOTICE-web-ifc.md`.

```ts
import { exportPascalToIfc } from '@pascal-app/ifc-exporter'

const { data, warnings, stats } = await exportPascalToIfc({ nodes, rootNodeIds })
// data is Uint8Array SPF bytes
```
