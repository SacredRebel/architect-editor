'use client'

import { heightAt, terrainFieldOf, useScene } from '@pascal-app/core'
import { useMemo, useSyncExternalStore } from 'react'
import { DoubleSide, ExtrudeGeometry, Shape } from 'three'
import { deriveBuildableEnvelope } from './envelope/buildable-envelope'
import { getEcoSiteState, subscribeEcoSite } from './eco-site-store'

function useEcoSiteStore() {
  return useSyncExternalStore(subscribeEcoSite, getEcoSiteState, getEcoSiteState)
}

/**
 * Translucent Ventura buildable volume — parcel eroded by front/side/rear
 * setbacks, extruded to the height limit. Toggled from the Eco legend.
 */
export function EcoBuildableEnvelope() {
  const { showEnvelope } = useEcoSiteStore()
  const siteNode = useScene((s) => {
    const id = s.rootNodeIds.find((rid) => s.nodes[rid]?.type === 'site')
    return id ? s.nodes[id] : null
  })

  const field = useMemo(() => {
    if (siteNode?.type !== 'site') return null
    return terrainFieldOf({ id: siteNode.id, terrain: siteNode.terrain })
  }, [siteNode])

  const mesh = useMemo(() => {
    if (!showEnvelope || siteNode?.type !== 'site') return null
    const points = siteNode.polygon?.points
    if (!points || points.length < 3) return null

    const envelope = deriveBuildableEnvelope(points)
    if (envelope.isDegenerate || envelope.polygon.length < 3) return null

    // Sample terrain height under the eroded footprint centroid so the
    // volume sits on the ground instead of floating at y=0 on hills.
    let baseY = 0
    if (field) {
      let sx = 0
      let sz = 0
      for (const [x, z] of envelope.polygon) {
        sx += x
        sz += z
      }
      const n = envelope.polygon.length
      baseY = heightAt(field, sx / n, sz / n)
    }

    const shape = new Shape()
    const [x0, z0] = envelope.polygon[0]!
    shape.moveTo(x0, -z0)
    for (let i = 1; i < envelope.polygon.length; i += 1) {
      const [x, z] = envelope.polygon[i]!
      shape.lineTo(x, -z)
    }
    shape.closePath()

    const geometry = new ExtrudeGeometry(shape, {
      depth: envelope.heightM,
      bevelEnabled: false,
    })
    // Shape is in XY; rotate so extrusion rises along world +Y and plan is XZ.
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(0, baseY, 0)

    return { geometry, heightM: envelope.heightM, areaM2: envelope.areaM2 }
  }, [showEnvelope, siteNode, field])

  if (!mesh) return null

  return (
    <mesh name="eco-buildable-envelope" geometry={mesh.geometry} renderOrder={2}>
      <meshBasicMaterial
        color="#38bdf8"
        transparent
        opacity={0.18}
        side={DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}
