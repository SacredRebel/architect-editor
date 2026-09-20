'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getEcoSiteState, subscribeEcoSite } from './eco-site-store'
import { sunDirectionAt } from './eco-site-sun'
import {
  getEcoPresentationState,
  subscribeEcoPresentation,
} from './eco-presentation-store'

function useSite() {
  return useSyncExternalStore(subscribeEcoSite, getEcoSiteState, getEcoSiteState)
}

function usePres() {
  return useSyncExternalStore(subscribeEcoPresentation, getEcoPresentationState, getEcoPresentationState)
}

/**
 * Hemisphere + directional sun at the site's lat/lon/time.
 * Matches the world's sky so editor and walk look like the same place.
 */
export function EcoSiteLighting() {
  const { site } = useSite()
  const { presentation, timeOfDayHours } = usePres()

  const lights = useMemo(() => {
    const lat = site?.originLL?.[1] ?? 34.448
    const lon = site?.originLL?.[0] ?? -119.243
    const north = site?.northDeg ?? 0
    const when = dateAtLocalHours(timeOfDayHours)
    const dir = sunDirectionAt(lat, lon, when, north)
    return { dir, presentation }
  }, [site, timeOfDayHours, presentation])

  const sunRef = useMemo(() => new THREE.DirectionalLight(0xfff2dd, 1.25), [])
  const hemiRef = useMemo(() => new THREE.HemisphereLight(0xc8d9f0, 0x6a5a48, 0.5), [])

  useFrame(() => {
    const { dir } = lights
    const elev = Math.max(0.05, dir.y)
    sunRef.intensity = lights.presentation ? 1.55 : 1.15
    hemiRef.intensity = lights.presentation ? 0.65 : 0.45
    sunRef.position.set(dir.x * 50, elev * 50, dir.z * 50)
    sunRef.target.position.set(0, 0, 0)
    sunRef.color.set(dir.y > 0.08 ? 0xfff2dd : 0xffb070)
  })

  return (
    <group name="eco-site-lighting">
      <primitive object={hemiRef} />
      <primitive object={sunRef} />
      <primitive object={sunRef.target} />
      <ambientLight intensity={presentation ? 0.12 : 0.2} />
    </group>
  )
}

function dateAtLocalHours(hours: number): Date {
  // Approximate Pacific daylight (UTC-7) for Ojai — good enough for presentation.
  const h = ((hours % 24) + 24) % 24
  const utcH = h + 7
  return new Date(Date.UTC(2026, 5, 21, Math.floor(utcH), Math.round((utcH % 1) * 60), 0))
}
