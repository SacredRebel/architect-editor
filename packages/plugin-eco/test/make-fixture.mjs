/**
 * Generate a tiny box GLB (base64) for E3 bridge harness / refGlb tests.
 * Usage: bun packages/plugin-eco/test/make-fixture.mjs
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

// Bun lacks browser FileReader; GLTFExporter binary path needs it.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    result = null
    onloadend = null
    onerror = null
    readAsArrayBuffer(blob) {
      Promise.resolve(blob.arrayBuffer()).then(
        (buf) => {
          this.result = buf
          this.onloadend?.({ target: this })
        },
        (err) => this.onerror?.(err),
      )
    }
  }
}

const dir = path.dirname(fileURLToPath(import.meta.url))

const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(2, 1, 3),
  new THREE.MeshStandardMaterial({ color: 0x8866aa }),
)
mesh.position.set(0, 0.5, 0)
const scene = new THREE.Scene()
scene.add(mesh)

const exporter = new GLTFExporter()
const result = await new Promise((resolve, reject) => {
  exporter.parse(
    scene,
    (gltf) => resolve(gltf),
    (err) => reject(err),
    { binary: true },
  )
})

if (!(result instanceof ArrayBuffer)) {
  throw new Error('Expected binary GLB ArrayBuffer')
}

const bytes = Buffer.from(result)
const b64 = bytes.toString('base64')
writeFileSync(path.join(dir, 'fixture.glb'), bytes)
writeFileSync(path.join(dir, 'fixture.glb.b64.txt'), b64)
console.log(`wrote fixture.glb (${bytes.length} bytes) and fixture.glb.b64.txt`)
if (bytes.length > 200_000) {
  console.warn('WARNING: fixture exceeds 200KB commit limit')
}
