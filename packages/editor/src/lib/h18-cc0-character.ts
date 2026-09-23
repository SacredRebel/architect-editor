/**
 * H18 — minimal CC0 procedural walk character (original Pascal geometry).
 * Not Mixamo. A fuller Quaternius/KayKit rigged pack can replace this later;
 * licence for this mesh: CC0 (public domain dedication by Sacred Rebel / eco fork).
 */
import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from 'three'

const bodyMat = () =>
  new MeshStandardMaterial({
    color: new Color('#6b7c8a'),
    roughness: 0.85,
    metalness: 0.05,
    name: 'h18-cc0-body',
  })

const accentMat = () =>
  new MeshStandardMaterial({
    color: new Color('#c4a574'),
    roughness: 0.7,
    metalness: 0.02,
    name: 'h18-cc0-skin',
  })

/** ~1.7 m tall low-poly humanoid for third-person; excluded from GLB export. */
export function createCc0WalkCharacter(): Group {
  const root = new Group()
  root.name = 'h18-cc0-character'
  root.userData.h18Character = true
  root.userData.excludeFromExport = true

  const torso = new Mesh(new BoxGeometry(0.35, 0.55, 0.22), bodyMat())
  torso.position.y = 1.05
  torso.castShadow = true
  root.add(torso)

  const head = new Mesh(new CapsuleGeometry(0.12, 0.08, 4, 8), accentMat())
  head.position.y = 1.48
  head.castShadow = true
  root.add(head)

  const legGeo = new CapsuleGeometry(0.07, 0.35, 4, 8)
  for (const x of [-0.1, 0.1]) {
    const leg = new Mesh(legGeo, bodyMat())
    leg.position.set(x, 0.45, 0)
    leg.castShadow = true
    root.add(leg)
  }

  const armGeo = new CapsuleGeometry(0.05, 0.28, 4, 8)
  for (const x of [-0.28, 0.28]) {
    const arm = new Mesh(armGeo, accentMat())
    arm.position.set(x, 1.15, 0)
    arm.castShadow = true
    root.add(arm)
  }

  return root
}

export function isH18Character(object: Object3D): boolean {
  return Boolean(object.userData?.h18Character || object.userData?.excludeFromExport)
}
