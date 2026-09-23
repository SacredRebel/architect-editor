'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useXR } from '@react-three/xr'
import { type RefObject, useEffect, useRef } from 'react'
import { type Mesh, type Object3D, Quaternion, Vector3 } from 'three'
import { useXRPlayerMode, XR_PLAYER_MODES } from '../../mode-switching/store/player-mode'
import { resolveRoomScaleOriginCorrection } from '../lib/capsule-collision'
import { setActiveHumanColliders } from '../store/collision-store'

function collectColliders(root: Object3D) {
  const colliders: Mesh[] = []
  root.traverse((object) => {
    const mesh = object as Mesh
    if (
      mesh.isMesh &&
      mesh.visible &&
      mesh.geometry?.boundsTree &&
      mesh.userData.excludeFromBvh !== true
    ) {
      colliders.push(mesh)
    }
  })
  return colliders
}

export function HumanCollisionRig({ sceneRootRef }: { sceneRootRef: RefObject<Object3D | null> }) {
  const camera = useThree((state) => state.camera)
  const origin = useXR((state) => state.origin)
  const mode = useXRPlayerMode((state) => state.mode)
  const colliders = useRef<Mesh[]>([])
  const collected = useRef(false)
  const hasViewerPose = useRef(false)
  const previousLocalPosition = useRef(new Vector3())
  const currentLocalPosition = useRef(new Vector3())
  const currentWorldPosition = useRef(new Vector3())
  const previousWorldPosition = useRef(new Vector3())
  const physicalMovement = useRef(new Vector3())
  const originWorldRotation = useRef(new Quaternion())
  const originCorrection = useRef(new Vector3())

  useEffect(() => {
    if (mode !== XR_PLAYER_MODES.HUMAN) {
      colliders.current = []
      collected.current = false
      hasViewerPose.current = false
      setActiveHumanColliders([])
    }
  }, [mode])

  const rescanAt = useRef(0)

  useFrame((state) => {
    if (mode !== XR_PLAYER_MODES.HUMAN || !origin || !sceneRootRef.current) return
    // Eco site terrain often mounts after the first human-mode frame. Re-scan
    // periodically until the collider set stops growing.
    if (!collected.current || state.clock.elapsedTime >= rescanAt.current) {
      const next = collectColliders(sceneRootRef.current)
      if (next.length > colliders.current.length || !collected.current) {
        colliders.current = next
        if (next.length > 0) {
          collected.current = true
          setActiveHumanColliders(next)
        }
      }
      rescanAt.current = state.clock.elapsedTime + 0.5
    }

    camera.getWorldPosition(currentWorldPosition.current)
    currentLocalPosition.current.copy(currentWorldPosition.current)
    origin.worldToLocal(currentLocalPosition.current)
    if (!hasViewerPose.current) {
      previousLocalPosition.current.copy(currentLocalPosition.current)
      previousWorldPosition.current.copy(currentWorldPosition.current)
      hasViewerPose.current = true
      return
    }

    physicalMovement.current.copy(currentLocalPosition.current).sub(previousLocalPosition.current)
    origin.getWorldQuaternion(originWorldRotation.current)
    physicalMovement.current.applyQuaternion(originWorldRotation.current)
    previousWorldPosition.current.copy(currentWorldPosition.current).sub(physicalMovement.current)
    resolveRoomScaleOriginCorrection(
      colliders.current,
      previousWorldPosition.current,
      currentWorldPosition.current,
      originCorrection.current,
    )
    origin.position.add(originCorrection.current)
    previousLocalPosition.current.copy(currentLocalPosition.current)
  })

  useEffect(() => () => setActiveHumanColliders([]), [])
  return null
}
