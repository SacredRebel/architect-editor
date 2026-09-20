/**
 * INTERIM STUB — site sun direction from lat/lon/time + northDeg.
 *
 * Rough solar model for presentation only. NOT the world lighting contract
 * (sun position model, sky/IBL, tone-mapping, exposure). Keep for wiring;
 * replace / drive from the contract when it lands — do not polish further.
 */

const DEG = Math.PI / 180

/**
 * Unit vector toward the sun in editor frame (y up, +z north).
 * `northDeg` is degrees clockwise from true north to editor +z.
 */
export function sunDirectionAt(
  latDeg: number,
  lonDeg: number,
  when: Date,
  northDeg = 0,
): { x: number; y: number; z: number } {
  const { altitude, azimuth } = solarPosition(latDeg, lonDeg, when)
  // Local ENU: x east, y up, z north — azimuth from south? Use meteorological:
  // azimuth 0 = north, clockwise. Convert to vector.
  const cosAlt = Math.cos(altitude)
  const xEast = cosAlt * Math.sin(azimuth)
  const yUp = Math.sin(altitude)
  const zNorth = cosAlt * Math.cos(azimuth)
  // Rotate about Y by -northDeg so editor +z aligns with site north.
  const th = -northDeg * DEG
  const cos = Math.cos(th)
  const sin = Math.sin(th)
  const x = xEast * cos - zNorth * sin
  const z = xEast * sin + zNorth * cos
  const len = Math.hypot(x, yUp, z) || 1
  return { x: x / len, y: yUp / len, z: z / len }
}

/** Solar altitude (rad above horizon) and azimuth (rad from north, CW). */
export function solarPosition(
  latDeg: number,
  lonDeg: number,
  when: Date,
): { altitude: number; azimuth: number } {
  const lat = latDeg * DEG
  const day = julianDay(when)
  const n = day - 2451545.0
  const L = (280.46 + 0.9856474 * n) * DEG
  const g = (357.528 + 0.9856003 * n) * DEG
  const lambda =
    L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG
  const epsilon = (23.439 - 0.0000004 * n) * DEG
  const sinDec = Math.sin(epsilon) * Math.sin(lambda)
  const dec = Math.asin(sinDec)
  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda))

  const gmst = (18.697374558 + 24.06570982441908 * n) % 24
  const lst = (gmst + lonDeg / 15) * (Math.PI / 12)
  const ha = lst - ra

  const sinAlt =
    Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha)
  const altitude = Math.asin(Math.min(1, Math.max(-1, sinAlt)))
  const cosAz =
    (Math.sin(dec) - Math.sin(lat) * sinAlt) / (Math.cos(lat) * Math.cos(altitude) || 1e-9)
  const az = Math.acos(Math.min(1, Math.max(-1, cosAz)))
  const azimuth = Math.sin(ha) > 0 ? 2 * Math.PI - az : az
  return { altitude, azimuth }
}

function julianDay(when: Date): number {
  const y = when.getUTCFullYear()
  const m = when.getUTCMonth() + 1
  const D =
    when.getUTCDate() +
    (when.getUTCHours() + when.getUTCMinutes() / 60 + when.getUTCSeconds() / 3600) / 24
  let yy = y
  let mm = m
  if (mm <= 2) {
    yy -= 1
    mm += 12
  }
  const A = Math.floor(yy / 100)
  const B = 2 - A + Math.floor(A / 4)
  return Math.floor(365.25 * (yy + 4716)) + Math.floor(30.6001 * (mm + 1)) + D + B - 1524.5
}
