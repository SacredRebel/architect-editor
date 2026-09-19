/**
 * Build a >1.5 MB GLB stand-in for Oak Leaf size-reduction proof (no binary in git).
 * High-poly lobes ≈ Oak Leaf massing scale (~40×4×25 m).
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { ensureFileReaderPolyfill } from '../src/export-glb.ts'

const out = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), 'oak-leaf-standin.glb')

ensureFileReaderPolyfill()

const mat = new THREE.MeshStandardMaterial({ color: 0xc4a574, roughness: 0.65, metalness: 0.05 })
const group = new THREE.Group()
group.name = 'OakLeafStandIn'

const body = new THREE.Mesh(new THREE.BoxGeometry(40, 4, 25, 64, 8, 48), mat)
body.name = 'massing-body'
body.position.y = 2
group.add(body)

for (let i = 0; i < 4; i++) {
  const lobe = new THREE.Mesh(new THREE.SphereGeometry(6, 96, 64), mat.clone())
  lobe.name = `lobe-${i}`
  lobe.position.set(Math.cos((i / 4) * Math.PI * 2) * 12, 3, Math.sin((i / 4) * Math.PI * 2) * 8)
  group.add(lobe)
}

// Extra detail so raw export exceeds ~1.5 MB like the real Oak Leaf.
for (let i = 0; i < 12; i++) {
  const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 18, 32, 24), mat.clone())
  rib.name = `rib-${i}`
  rib.rotation.z = Math.PI / 2
  rib.position.set((i - 5.5) * 3, 2.2, ((i % 3) - 1) * 4)
  group.add(rib)
}

const scene = new THREE.Scene()
scene.name = 'oak-standin'
scene.add(group)

const exporter = new GLTFExporter()
const glb = await new Promise((resolve, reject) => {
  exporter.parse(
    scene,
    (result) => {
      if (result instanceof ArrayBuffer) resolve(result)
      else reject(new Error('expected binary'))
    },
    reject,
    { binary: true },
  )
})

writeFileSync(out, Buffer.from(glb))
console.log(JSON.stringify({ wrote: out, bytes: glb.byteLength }))
