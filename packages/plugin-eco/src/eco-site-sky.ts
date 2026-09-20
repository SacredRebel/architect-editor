/**
 * Sky / sun lights — ported from spatial-map `src/world/sky.ts`
 * (lighting contract commit af1f0bd).
 *
 * Visible dome uses an equirectangular bake of the same colourAt() the world
 * shader draws (WebGPU-safe; no raw ShaderMaterial). Environment is PMREM'd
 * from that bake at the origin — never a HemisphereLight stand-in for IBL.
 */

import * as THREE from 'three'
import {
  ECO_DEFAULT_LAT,
  ECO_DEFAULT_LNG,
  sunPosition,
  sunVector,
  type SunPos,
} from './eco-site-sun'

const L = (r: number, g: number, b: number) =>
  new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace)

const KEYS = {
  day: {
    zenith: L(0.1046, 0.2938, 1.0495),
    away: L(0.3302, 0.6515, 1.6601),
    sun: L(0.43, 0.78, 1.82),
    glow: L(1.6, 1.25, 0.9),
    glowK: 0.5,
  },
  dusk: {
    zenith: L(0.0406, 0.0768, 0.1634),
    away: L(0.3243, 0.2591, 0.201),
    sun: L(0.8359, 0.1957, 0.0528),
    glow: L(1.17, 0.3, 0.08),
    glowK: 1.3,
  },
  night: {
    zenith: L(0.0087, 0.0125, 0.026),
    away: L(0.0174, 0.023, 0.0406),
    sun: L(0.0174, 0.023, 0.0406),
    glow: L(0, 0, 0),
    glowK: 0,
  },
}
const GROUND = L(0.1098, 0.0971, 0.0705)

const TOTAL_RAYLEIGH = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5]
const MIE_CONST = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14]
const RAYLEIGH_ZENITH = 8.4e3
const MIE_ZENITH = 1.25e3

/** Atmosphere — contract §7 / California dry-season valley. */
export const ECO_SUNLIGHT_AIR = { turbidity: 4, rayleigh: 1.0, mieCoefficient: 0.005 }

const SUN_INTENSITY = 3.6
const SKYLIGHT_INTENSITY = 1.5
/** Midday toneMappingExposure multiplier — contract §1. */
export const ECO_BASE_EXPOSURE = 0.75

export function sunTransmission(
  sun: THREE.Vector3,
  air = ECO_SUNLIGHT_AIR,
): [number, number, number] {
  const s = sun.clone().normalize()
  const sunfade = 1 - Math.min(1, Math.max(0, 1 - Math.exp(s.y / 450000)))
  const rayleighCoefficient = air.rayleigh - (1 - sunfade)
  const c = 0.2 * air.turbidity * 10e-18
  const zenithAngle = Math.acos(Math.max(0, s.y))
  const inverse =
    1 /
    (Math.cos(zenithAngle) +
      0.15 * Math.pow(93.885 - (zenithAngle * 180) / Math.PI, -1.253))
  return TOTAL_RAYLEIGH.map(
    (b, i) =>
      Math.exp(
        -(
          b * rayleighCoefficient * RAYLEIGH_ZENITH * inverse +
          0.434 * c * MIE_CONST[i]! * air.mieCoefficient * MIE_ZENITH * inverse
        ),
      ),
  ) as [number, number, number]
}

type SkyKeys = {
  zenith: THREE.Color
  away: THREE.Color
  toward: THREE.Color
  glow: THREE.Color
  glowK: number
  sunDir: THREE.Vector3
}

function colourAt(keys: SkyKeys, dir: THREE.Vector3): THREE.Color {
  const d = dir.clone().normalize()
  const s = keys.sunDir.clone().normalize()
  const h = Math.max(-1, Math.min(1, d.y))
  const dxz = new THREE.Vector2(d.x + 1e-5, d.z).normalize()
  const sxz = new THREE.Vector2(s.x + 1e-5, s.z).normalize()
  const toward = 0.5 + 0.5 * dxz.dot(sxz)
  const horizon = keys.away.clone().lerp(keys.toward, Math.pow(toward, 4))
  const t = Math.pow(1 - Math.max(h, 0), 2.2)
  const sky = keys.zenith.clone().lerp(horizon, t)
  const c = Math.max(d.dot(s), 0)
  const glow = keys.glow
    .clone()
    .multiplyScalar(keys.glowK * (0.5 * Math.pow(c, 32) + 0.5 * Math.pow(c, 400)))
  if (h < 0) {
    return horizon.clone().multiplyScalar(0.85).lerp(GROUND, Math.min(1, Math.max(0, -h * 3)))
  }
  return sky.add(glow)
}

function bakeEquirect(keys: SkyKeys, width = 256, height = 128): THREE.DataTexture {
  const data = new Float32Array(width * height * 4)
  const dir = new THREE.Vector3()
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height
    const elev = (0.5 - v) * Math.PI
    const cosE = Math.cos(elev)
    const sinE = Math.sin(elev)
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width
      const az = u * Math.PI * 2 - Math.PI
      // equirect: +z forward at u=0.5; eco +z = north
      dir.set(Math.sin(az) * cosE, sinE, Math.cos(az) * cosE)
      const col = colourAt(keys, dir)
      const i = (y * width + x) * 4
      data[i] = col.r
      data[i + 1] = col.g
      data[i + 2] = col.b
      data[i + 3] = 1
    }
  }
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.LinearSRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function toEcoDir(
  world: { x: number; y: number; z: number },
  northDeg: number,
): THREE.Vector3 {
  const xEast = world.x
  const yUp = world.y
  const zNorth = -world.z
  const th = (-northDeg * Math.PI) / 180
  const cos = Math.cos(th)
  const sin = Math.sin(th)
  return new THREE.Vector3(xEast * cos - zNorth * sin, yUp, xEast * sin + zNorth * cos).normalize()
}

/**
 * Contract sky + sun + skylight fill. Hemisphere is skylight only (§5);
 * IBL comes from PMREM of the baked dome, never from the hemi alone.
 */
export class EcoSky {
  mesh: THREE.Mesh
  sun = new THREE.DirectionalLight(0xffffff, 3)
  ambient = new THREE.HemisphereLight(0xbcd6ff, 0x6b6550, 1)
  horizon = new THREE.Color()
  zenith = new THREE.Color()
  dir = new THREE.Vector3(0, 1, 0)
  exposure = 1
  skylightScale = 1
  equirect: THREE.DataTexture | null = null
  private keys: SkyKeys = {
    zenith: KEYS.day.zenith.clone(),
    away: KEYS.day.away.clone(),
    toward: KEYS.day.sun.clone(),
    glow: KEYS.day.glow.clone(),
    glowK: KEYS.day.glowK,
    sunDir: new THREE.Vector3(0, 1, 0),
  }
  private domeMat: THREE.MeshBasicMaterial

  constructor(radius = 800) {
    this.domeMat = new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: true,
    })
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), this.domeMat)
    this.mesh.name = 'eco-sky'
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -1000

    this.sun.name = 'eco-sun'
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(4096, 4096)
    const c = this.sun.shadow.camera as THREE.OrthographicCamera
    c.near = 1
    c.far = 2200
    c.left = c.bottom = -320
    c.right = c.top = 320
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.6

    this.ambient.name = 'eco-skylight'
  }

  set(
    date: Date,
    lat: number = ECO_DEFAULT_LAT,
    lng: number = ECO_DEFAULT_LNG,
    northDeg = 0,
  ): { pos: SunPos; horizon: THREE.Color; zenith: THREE.Color } {
    const p = sunPosition(date, lat, lng)
    const worldV = sunVector(p)
    const sunDir = toEcoDir(worldV, northDeg)
    this.dir.copy(sunDir).setY(Math.max(sunDir.y, 0.02)).normalize()
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.dir, 900)
    this.keys.sunDir.copy(sunDir)

    const n = THREE.MathUtils.smoothstep(p.altitude, -10, -1)
    const d = THREE.MathUtils.smoothstep(p.altitude, 1, 24)
    const mix3 = (k: 'zenith' | 'away' | 'sun' | 'glow') =>
      KEYS.night[k].clone().lerp(KEYS.dusk[k], n).lerp(KEYS.day[k], d)
    this.keys.zenith.copy(mix3('zenith'))
    this.keys.away.copy(mix3('away'))
    this.keys.toward.copy(mix3('sun'))
    this.keys.glow.copy(mix3('glow'))
    this.keys.glowK =
      KEYS.night.glowK +
      (KEYS.dusk.glowK - KEYS.night.glowK) * n +
      (KEYS.day.glowK - KEYS.dusk.glowK) * d

    const t = sunTransmission(sunDir)
    const peak = Math.max(t[0], t[1], t[2], 1e-3)
    this.sun.color.setRGB(t[0] / peak, t[1] / peak, t[2] / peak, THREE.LinearSRGBColorSpace)

    const side = new THREE.Vector3(-sunDir.z, 0, sunDir.x)
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0)
    side.normalize()
    this.horizon.copy(
      colourAt(
        this.keys,
        side.multiplyScalar(Math.cos(0.03)).add(new THREE.Vector3(0, Math.sin(0.03), 0)),
      ),
    )
    this.zenith.copy(colourAt(this.keys, new THREE.Vector3(0, 1, 0)))

    const day = THREE.MathUtils.smoothstep(p.altitude, -6, 10)
    const up = THREE.MathUtils.smoothstep(p.altitude, -1, 6)
    this.sun.intensity = 0.02 + SUN_INTENSITY * up * (0.35 + 0.65 * Math.min(1, peak * 1.25))

    const zp = Math.max(this.zenith.r, this.zenith.g, this.zenith.b, 1e-3)
    const hp = Math.max(this.horizon.r, this.horizon.g, this.horizon.b, 1e-3)
    this.ambient.color
      .setRGB(this.zenith.r / zp, this.zenith.g / zp, this.zenith.b / zp, THREE.LinearSRGBColorSpace)
      .lerp(
        new THREE.Color().setRGB(
          this.horizon.r / hp,
          this.horizon.g / hp,
          this.horizon.b / hp,
          THREE.LinearSRGBColorSpace,
        ),
        0.35,
      )
    this.ambient.groundColor.set('#8a7f62')
    this.ambient.intensity = (0.1 + SKYLIGHT_INTENSITY * day) * this.skylightScale
    this.exposure = 1 + 0.9 * (1 - THREE.MathUtils.smoothstep(p.altitude, -2, 30))

    this.equirect?.dispose()
    this.equirect = bakeEquirect(this.keys)
    // Dome mesh is a PMREM/fromScene stand-in; backdrop uses scene.background
    // (equirect), not a UV-sphere diffuse map.
    this.domeMat.color.copy(this.zenith).multiplyScalar(0.35)
    this.domeMat.needsUpdate = true

    return { pos: p, horizon: this.horizon, zenith: this.zenith }
  }

  dispose() {
    this.equirect?.dispose()
    this.equirect = null
    this.mesh.geometry.dispose()
    this.domeMat.dispose()
  }
}
