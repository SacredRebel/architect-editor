'use client'

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { getEcoSiteState, subscribeEcoSite } from './eco-site-store'
import { ECO_BASE_EXPOSURE, EcoSky } from './eco-site-sky'
import {
  ECO_DEFAULT_LAT,
  ECO_DEFAULT_LNG,
  ECO_DEFAULT_TZ,
  instantAt,
} from './eco-site-sun'
import {
  getEcoPresentationState,
  subscribeEcoPresentation,
} from './eco-presentation-store'

function useSite() {
  return useSyncExternalStore(subscribeEcoSite, getEcoSiteState, getEcoSiteState)
}

function usePres() {
  return useSyncExternalStore(
    subscribeEcoPresentation,
    getEcoPresentationState,
    getEcoPresentationState,
  )
}

type PmremLike = {
  fromEquirectangular: (tex: THREE.Texture) => { texture: THREE.Texture }
  dispose: () => void
}

async function createPmrem(gl: THREE.WebGLRenderer): Promise<PmremLike | null> {
  try {
    const anyGl = gl as THREE.WebGLRenderer & { isWebGPURenderer?: boolean }
    if (anyGl.isWebGPURenderer) {
      const { PMREMGenerator } = await import('three/webgpu')
      return new PMREMGenerator(gl) as unknown as PmremLike
    }
    return new THREE.PMREMGenerator(gl)
  } catch {
    return null
  }
}

/**
 * World lighting contract (spatial-map af1f0bd / docs/lighting-contract.md).
 *
 * Order: SRGB + ACES + exposure first, then PMREM sky at origin, NOAA sun,
 * intensity/colour, shadows. Hemisphere is skylight fill only — never the IBL.
 */
export function EcoSiteLighting() {
  const { site } = useSite()
  const { timeOfDayHours } = usePres()
  const gl = useThree((s) => s.gl) as THREE.WebGLRenderer
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)

  const sky = useMemo(() => new EcoSky(), [])
  const groupRef = useRef<THREE.Group>(null)
  const pmremRef = useRef<PmremLike | null>(null)
  const envRef = useRef<THREE.Texture | null>(null)
  const lastKey = useRef('')
  const [pmremTick, setPmremTick] = useState(0)
  const prevTone = useRef<{
    colorSpace: THREE.ColorSpace
    toneMapping: THREE.ToneMapping
    exposure: number
    environment: THREE.Texture | null
    environmentIntensity: number
    background: THREE.Color | THREE.Texture | null
  } | null>(null)

  const lat = site?.originLL?.[1] ?? ECO_DEFAULT_LAT
  const lng = site?.originLL?.[0] ?? ECO_DEFAULT_LNG
  const northDeg = site?.northDeg ?? 0

  useLayoutEffect(() => {
    prevTone.current = {
      colorSpace: gl.outputColorSpace,
      toneMapping: gl.toneMapping,
      exposure: gl.toneMappingExposure,
      environment: scene.environment,
      environmentIntensity: scene.environmentIntensity,
      background: scene.background as THREE.Color | THREE.Texture | null,
    }
    // Contract §1 — before any material judgement.
    gl.outputColorSpace = THREE.SRGBColorSpace
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = ECO_BASE_EXPOSURE
    if (gl.shadowMap) {
      gl.shadowMap.enabled = true
      gl.shadowMap.type = THREE.PCFSoftShadowMap
    }

    let cancelled = false
    void createPmrem(gl).then((pmrem) => {
      if (cancelled) {
        pmrem?.dispose()
        return
      }
      pmremRef.current = pmrem
      lastKey.current = ''
      setPmremTick((n) => n + 1)
      invalidate()
    })

    invalidate()
    return () => {
      cancelled = true
      const prev = prevTone.current
      if (prev) {
        gl.outputColorSpace = prev.colorSpace
        gl.toneMapping = prev.toneMapping
        gl.toneMappingExposure = prev.exposure
        if (scene.environment === envRef.current || scene.environment === sky.equirect) {
          scene.environment = prev.environment
          scene.environmentIntensity = prev.environmentIntensity
        }
        if (scene.background === sky.equirect) {
          scene.background = prev.background
        }
      }
      envRef.current?.dispose()
      envRef.current = null
      pmremRef.current?.dispose()
      pmremRef.current = null
      sky.dispose()
    }
  }, [gl, scene, sky, invalidate])

  useEffect(() => {
    const when = instantAt(timeOfDayHours, ECO_DEFAULT_TZ)
    const key = `${lat.toFixed(5)},${lng.toFixed(5)},${northDeg},${timeOfDayHours.toFixed(3)},${when.toISOString()},${pmremTick}`
    if (key === lastKey.current) return
    lastKey.current = key

    const fillWas = sky.skylightScale
    sky.set(when, lat, lng, northDeg)

    let pmremOk = false
    const pmrem = pmremRef.current
    const equirect = sky.equirect
    if (pmrem && equirect) {
      try {
        // Equirect bake is direction-only (= sampled at the origin).
        const built = pmrem.fromEquirectangular(equirect)
        envRef.current?.dispose()
        envRef.current = built.texture
        scene.environment = built.texture
        scene.environmentIntensity = 1
        sky.skylightScale = 0.4
        pmremOk = true
      } catch {
        pmremOk = false
      }
    }
    if (!pmremOk && equirect) {
      scene.environment = equirect
      scene.environmentIntensity = 1
      sky.skylightScale = 0.55
    }
    if (equirect) scene.background = equirect
    if (sky.skylightScale !== fillWas) {
      sky.ambient.intensity *= sky.skylightScale / fillWas
    }
    gl.toneMappingExposure = ECO_BASE_EXPOSURE * sky.exposure
    invalidate()
  }, [lat, lng, northDeg, timeOfDayHours, sky, scene, gl, invalidate, pmremTick])

  useFrame(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = ECO_BASE_EXPOSURE * sky.exposure

    // Visual dome rides the camera; IBL was baked as directions from the origin.
    sky.mesh.position.copy(camera.position)

    const root = groupRef.current
    if (!root) return
    scene.traverse((obj) => {
      const light = obj as THREE.Light
      if (!light.isLight) return
      if (obj === root || root.getObjectById(obj.id)) return
      light.intensity = 0
    })
  }, -2)

  return (
    <group name="eco-site-lighting" ref={groupRef}>
      <primitive object={sky.mesh} />
      <primitive object={sky.sun} />
      <primitive object={sky.sun.target} />
      <primitive object={sky.ambient} />
    </group>
  )
}
