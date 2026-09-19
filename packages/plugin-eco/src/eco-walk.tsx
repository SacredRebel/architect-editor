'use client'

import { terrainFieldOf, useScene } from '@pascal-app/core'
import { KeyboardControls, PerspectiveCamera } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Euler, MathUtils, Vector3 } from 'three'
import { useEcoStructureColliders } from './eco-colliders'
import { getEcoWalkState, subscribeEcoWalk, toggleWalkFirstPerson } from './eco-walk-store'

const WALK = 1.6
const RUN = 5.2
const JUMP = 5.4
const GRAVITY = 18
const CAPSULE_HEIGHT = 1.8
const CAPSULE_RADIUS = 0.3
const CAPSULE_HALF = (CAPSULE_HEIGHT - CAPSULE_RADIUS * 2) / 2
const EYE = 1.68
const FLOAT_HEIGHT = 0.1

const keyboardMap = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'leftward', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'rightward', keys: ['ArrowRight', 'KeyD'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'run', keys: ['ShiftLeft', 'ShiftRight', 'Shift'] },
]

function useWalkStore() {
  return useSyncExternalStore(subscribeEcoWalk, getEcoWalkState, getEcoWalkState)
}

type RapierMods = typeof import('@react-three/rapier')
type EcctrlComponent = typeof import('ecctrl')['Ecctrl']

function WalkCamera({
  targetRef,
  firstPerson,
}: {
  targetRef: React.RefObject<{ currPos: Vector3 } | null>
  firstPerson: boolean
}) {
  const { camera, controls } = useThree()
  // Default look toward editor north (+Z); Three.js forward is −Z, so yaw = π.
  const lookEuler = useRef(new Euler(0, Math.PI, 0, 'YXZ'))
  const tmp = useRef(new Vector3())

  useEffect(() => {
    const c = controls as { enabled?: boolean } | null
    if (c && 'enabled' in c) c.enabled = false
    return () => {
      if (c && 'enabled' in c) c.enabled = true
    }
  }, [controls])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyC' && !e.repeat) toggleWalkFirstPerson()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (e.buttons !== 1 && document.pointerLockElement == null) return
      lookEuler.current.y -= e.movementX * 0.002
      lookEuler.current.x -= e.movementY * 0.002
      lookEuler.current.x = MathUtils.clamp(lookEuler.current.x, -1.2, 1.2)
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  useFrame(() => {
    const handle = targetRef.current
    if (!handle) return
    const pos = handle.currPos
    const eyeY = pos.y - CAPSULE_HALF - FLOAT_HEIGHT + EYE
    if (firstPerson) {
      camera.position.set(pos.x, eyeY, pos.z)
      tmp.current.set(0, 0, -1).applyEuler(lookEuler.current)
      camera.lookAt(pos.x + tmp.current.x, eyeY + tmp.current.y, pos.z + tmp.current.z)
    } else {
      tmp.current.set(0, 1.6, 4).applyEuler(new Euler(0, lookEuler.current.y, 0))
      camera.position.set(pos.x + tmp.current.x, eyeY + 0.4, pos.z + tmp.current.z)
      camera.lookAt(pos.x, eyeY, pos.z)
    }
  })

  return <PerspectiveCamera far={500} fov={60} makeDefault near={0.05} />
}

function TerrainHeightfield({
  HeightfieldCollider,
  RigidBody,
  CuboidCollider,
}: {
  HeightfieldCollider: RapierMods['HeightfieldCollider']
  RigidBody: RapierMods['RigidBody']
  CuboidCollider: RapierMods['CuboidCollider']
}) {
  const siteNode = useScene((s) => {
    const id = s.rootNodeIds.find((rid) => s.nodes[rid]?.type === 'site')
    return id ? s.nodes[id] : null
  })

  const field = useMemo(() => {
    if (siteNode?.type !== 'site') return null
    return terrainFieldOf({ id: siteNode.id, terrain: siteNode.terrain })
  }, [siteNode])

  if (!field || field.cols < 2 || field.rows < 2) {
    return (
      <RigidBody colliders={false} position={[0, -0.05, 0]} type="fixed">
        <CuboidCollider args={[100, 0.05, 100]} />
      </RigidBody>
    )
  }

  // Rapier wants column-major heights; TerrainField is row-major samples.
  const nrows = field.rows - 1
  const ncols = field.cols - 1
  const heights: number[] = []
  for (let c = 0; c < field.cols; c++) {
    for (let r = 0; r < field.rows; r++) {
      heights.push(field.heights[r * field.cols + c]! * field.step)
    }
  }
  const scaleX = ncols * field.spacing
  const scaleZ = nrows * field.spacing
  const cx = field.origin[0] + scaleX / 2
  const cz = field.origin[1] + scaleZ / 2

  return (
    <RigidBody colliders={false} position={[cx, 0, cz]} type="fixed">
      <HeightfieldCollider args={[nrows, ncols, heights, { x: scaleX, y: 1, z: scaleZ }]} />
    </RigidBody>
  )
}

function StructureColliders({
  CuboidCollider,
  RigidBody,
}: {
  CuboidCollider: RapierMods['CuboidCollider']
  RigidBody: RapierMods['RigidBody']
}) {
  const specs = useEcoStructureColliders()
  return (
    <>
      {specs.map((spec) => (
        <RigidBody
          key={spec.key}
          colliders={false}
          position={spec.position}
          rotation={spec.rotation}
          type="fixed"
        >
          <CuboidCollider args={spec.args} />
        </RigidBody>
      ))}
    </>
  )
}

function WalkInner({ rapier, Ecctrl }: { rapier: RapierMods; Ecctrl: EcctrlComponent }) {
  const { firstPerson } = useWalkStore()
  const ecctrlRef = useRef<{ currPos: Vector3 } | null>(null)
  const { Physics, RigidBody, CuboidCollider, HeightfieldCollider } = rapier

  return (
    <Physics gravity={[0, -GRAVITY, 0]} timeStep="vary">
      <KeyboardControls map={keyboardMap}>
        <Ecctrl
          ref={ecctrlRef as never}
          capsuleHalfHeight={CAPSULE_HALF}
          capsuleRadius={CAPSULE_RADIUS}
          enableToggleRun={false}
          floatHeight={FLOAT_HEIGHT}
          jumpVel={JUMP}
          maxRunVel={RUN}
          maxWalkVel={WALK}
          position={[0, EYE + 0.5, 0]}
          // Face editor north (+Z): default forward is −Z.
          rotation={[0, Math.PI, 0]}
        >
          <mesh castShadow>
            <capsuleGeometry args={[CAPSULE_RADIUS, CAPSULE_HALF * 2, 4, 8]} />
            <meshStandardMaterial color="#e2e8f0" opacity={firstPerson ? 0.15 : 0.85} transparent />
          </mesh>
        </Ecctrl>
      </KeyboardControls>
      <WalkCamera firstPerson={firstPerson} targetRef={ecctrlRef} />
      <TerrainHeightfield
        CuboidCollider={CuboidCollider}
        HeightfieldCollider={HeightfieldCollider}
        RigidBody={RigidBody}
      />
      <StructureColliders CuboidCollider={CuboidCollider} RigidBody={RigidBody} />
    </Physics>
  )
}

/**
 * Lazy Walk mode — rapier wasm + ecctrl load only after Walk is toggled on.
 */
export function EcoWalk() {
  const { enabled } = useWalkStore()
  const [mods, setMods] = useState<{
    rapier: RapierMods
    Ecctrl: EcctrlComponent
  } | null>(null)

  useEffect(() => {
    if (!enabled || mods) return
    let cancelled = false
    void Promise.all([import('@react-three/rapier'), import('ecctrl')]).then(([rapier, ecctrl]) => {
      if (cancelled) return
      setMods({ rapier, Ecctrl: ecctrl.Ecctrl })
    })
    return () => {
      cancelled = true
    }
  }, [enabled, mods])

  if (!enabled || !mods) return null

  return (
    <Suspense fallback={null}>
      <WalkInner Ecctrl={mods.Ecctrl} rapier={mods.rapier} />
    </Suspense>
  )
}
