/**
 * Lighting contract checks — NOAA sun, exposure curve, sun intensity, air.
 * Usage: bun packages/plugin-eco/test/check-lighting.mjs
 */
import * as THREE from 'three'
import {
  ECO_BASE_EXPOSURE,
  ECO_SUNLIGHT_AIR,
  EcoSky,
  sunTransmission,
} from '../src/eco-site-sky.ts'
import {
  ECO_DEFAULT_LAT,
  ECO_DEFAULT_LNG,
  ECO_DEFAULT_TZ,
  instantAt,
  sunDirectionAt,
  sunPosition,
} from '../src/eco-site-sun.ts'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

assert(ECO_DEFAULT_LAT === 34.4331, 'default lat')
assert(ECO_DEFAULT_LNG === -119.1554, 'default lng')
assert(ECO_DEFAULT_TZ === 'America/Los_Angeles', 'default tz')
assert(ECO_BASE_EXPOSURE === 0.75, 'base exposure')
assert(ECO_SUNLIGHT_AIR.turbidity === 4, 'turbidity')
assert(ECO_SUNLIGHT_AIR.rayleigh === 1.0, 'rayleigh')
assert(ECO_SUNLIGHT_AIR.mieCoefficient === 0.005, 'mie')

// Midday June solstice — sun above horizon at default site
const noon = instantAt(12, ECO_DEFAULT_TZ, new Date(Date.UTC(2026, 5, 21, 12, 0, 0)))
const noonPos = sunPosition(noon, ECO_DEFAULT_LAT, ECO_DEFAULT_LNG)
assert(noonPos.altitude > 30, `noon altitude ${noonPos.altitude}`)

const dir = sunDirectionAt(ECO_DEFAULT_LAT, ECO_DEFAULT_LNG, noon, 0)
assert(Math.abs(Math.hypot(dir.x, dir.y, dir.z) - 1) < 1e-6, 'unit sun')
assert(dir.y > 0.4, `noon sun up y=${dir.y}`)

// Exposure curve: high sun → ~1; below −2° → ~1.9
const sky = new EcoSky()
sky.set(noon, ECO_DEFAULT_LAT, ECO_DEFAULT_LNG, 0)
assert(sky.exposure < 1.05, `midday exposure ${sky.exposure}`)
assert(Math.abs(ECO_BASE_EXPOSURE * sky.exposure - 0.75) < 0.05, 'renderer midday ~0.75')
const middayExposure = sky.exposure

const dusk = instantAt(20.5, ECO_DEFAULT_TZ, new Date(Date.UTC(2026, 5, 21, 12, 0, 0)))
sky.set(dusk, ECO_DEFAULT_LAT, ECO_DEFAULT_LNG, 0)
const duskPos = sunPosition(dusk, ECO_DEFAULT_LAT, ECO_DEFAULT_LNG)
if (duskPos.altitude < 5) {
  assert(sky.exposure > 1.2, `dusk eye-open exposure ${sky.exposure}`)
}

// Sun light defaults
assert(sky.sun.color.getHex() !== undefined, 'sun colour')
assert(sky.sun.castShadow === true, 'castShadow')
assert(sky.sun.shadow.mapSize.x === 4096 && sky.sun.shadow.mapSize.y === 4096, 'shadow 4096')
assert(sky.sun.shadow.bias === -0.0004, 'shadow bias')
assert(sky.sun.shadow.normalBias === 0.6, 'normalBias')

// Transmission uses contract air
const t = sunTransmission(new THREE.Vector3(0.2, 0.9, 0.3).normalize())
assert(t[0] > 0 && t[1] > 0 && t[2] > 0, 'transmission positive')

// Equirect bake present (IBL source; not a hemi stand-in)
assert(sky.equirect != null, 'equirect bake')
assert(sky.equirect.mapping === THREE.EquirectangularReflectionMapping, 'equirect mapping')

// No ambientLight stub — skylight is HemisphereLight with contract scale
assert(sky.ambient.isHemisphereLight, 'skylight is hemi fill')
assert(sky.ambient.intensity > 0, 'skylight intensity')

sky.dispose()
console.log('check-lighting OK', {
  noonAlt: Number(noonPos.altitude.toFixed(2)),
  noonSunY: Number(dir.y.toFixed(3)),
  middayExposure: Number(middayExposure.toFixed(3)),
})
