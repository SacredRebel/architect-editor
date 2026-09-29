import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const b64 = readFileSync(path.join(dir, 'h0-two-rooms.b64.txt'), 'utf8').trim()
const expr = `(async () => {
  const b64 = ${JSON.stringify(b64)};
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bin], { type: 'model/gltf-binary' }));
  const r = await window.world.probeModel(url);
  URL.revokeObjectURL(url);
  return r;
})()`
writeFileSync(path.join(dir, 'h0-probe-expr.js'), expr)
console.log('expr chars', expr.length)
