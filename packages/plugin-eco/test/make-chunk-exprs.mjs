import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
const dir = path.dirname(fileURLToPath(import.meta.url))
const parts = JSON.parse(readFileSync(path.join(dir, "h0-b64-chunks.json"), "utf8"))
for (let i = 0; i < parts.length; i++) {
  const expr = `window.__h0b64 += ${JSON.stringify(parts[i])}; window.__h0b64.length`
  writeFileSync(path.join(dir, `h0-inject-${i}.js`), expr)
  console.log("wrote", i, expr.length)
}
