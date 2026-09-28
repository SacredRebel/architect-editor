/**
 * NOAA solar position — ported from spatial-map `src/world/sun.ts`
 * (lighting contract commit af1f0bd). Accurate to well under a degree.
 *
 * World frame: x east, y up, z = −north.
 * Editor scene: the site's world frame — x east, y up, z = −(site north)
 * (`siteToWorldXz` negates the site's z-north for terrain, guides and the
 * ghost). Site north is `northDeg` clockwise from true north.
 */

const D2R = Math.PI / 180
const R2D = 180 / Math.PI

/** Default eco / Sulphur Mountain site from the lighting contract. */
export const ECO_DEFAULT_LAT = 34.4331
export const ECO_DEFAULT_LNG = -119.1554
export const ECO_DEFAULT_TZ = 'America/Los_Angeles'

export interface SunPos {
  /** degrees above the horizon; negative is below */
  altitude: number
  /** degrees clockwise from north */
  azimuth: number
}

/** days since the J2000.0 epoch */
function julianCenturies(date: Date): number {
  return (date.getTime() / 86400000 + 2440587.5 - 2451545) / 36525
}

export function sunPosition(date: Date, lat: number, lng: number): SunPos {
  const t = julianCenturies(date)
  const meanLong = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360
  const meanAnom = 357.52911 + t * (35999.05029 - 0.0001537 * t)
  const ecc = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
  const centre =
    Math.sin(meanAnom * D2R) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * meanAnom * D2R) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * meanAnom * D2R) * 0.000289
  const trueLong = meanLong + centre
  const omega = 125.04 - 1934.136 * t
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * D2R)
  const meanObliq = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
  const obliq = meanObliq + 0.00256 * Math.cos(omega * D2R)
  const decl = Math.asin(Math.sin(obliq * D2R) * Math.sin(appLong * D2R)) * R2D

  const y = Math.tan((obliq / 2) * D2R) ** 2
  const eqTime =
    4 *
    R2D *
    (y * Math.sin(2 * meanLong * D2R) -
      2 * ecc * Math.sin(meanAnom * D2R) +
      4 * ecc * y * Math.sin(meanAnom * D2R) * Math.cos(2 * meanLong * D2R) -
      0.5 * y * y * Math.sin(4 * meanLong * D2R) -
      1.25 * ecc * ecc * Math.sin(2 * meanAnom * D2R))

  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60
  const trueSolar = (minutes + eqTime + 4 * lng + 1440) % 1440
  const hourAngle = trueSolar / 4 < 0 ? trueSolar / 4 + 180 : trueSolar / 4 - 180

  const latR = lat * D2R
  const declR = decl * D2R
  const haR = hourAngle * D2R
  const cosZen = Math.sin(latR) * Math.sin(declR) + Math.cos(latR) * Math.cos(declR) * Math.cos(haR)
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZen))) * R2D
  let az: number
  const denom = Math.cos(latR) * Math.sin(zenith * D2R)
  if (Math.abs(denom) > 1e-9) {
    const c = (Math.sin(latR) * Math.cos(zenith * D2R) - Math.sin(declR)) / denom
    az = Math.acos(Math.min(1, Math.max(-1, c))) * R2D
    az = hourAngle > 0 ? (az + 180) % 360 : (540 - az) % 360
  } else {
    az = lat > 0 ? 180 : 0
  }

  // refraction lifts the sun a little near the horizon; ignore it above 5 degrees
  const alt0 = 90 - zenith
  const refr =
    alt0 > 5
      ? 0
      : alt0 > -0.575
        ? (1735 + alt0 * (-518.2 + alt0 * (103.4 + alt0 * (-12.79 + alt0 * 0.711)))) / 3600
        : -20.772 / Math.tan(alt0 * D2R) / 3600
  return { altitude: alt0 + (isFinite(refr) ? refr : 0), azimuth: az }
}

/** the sun as a unit vector in the world frame (x east, y up, z = -north) */
export function sunVector(p: SunPos): { x: number; y: number; z: number } {
  const alt = p.altitude * D2R
  const az = p.azimuth * D2R
  const horiz = Math.cos(alt)
  return { x: horiz * Math.sin(az), y: Math.sin(alt), z: -horiz * Math.cos(az) }
}

/**
 * The instant that is a given wall-clock time at a place.
 * Slider hours mean local civil time in `timeZone`, not the browser's zone.
 */
export function instantAt(hours: number, timeZone: string, day: Date = new Date()): Date {
  const parts = (d: Date) => {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    const o: Record<string, string> = {}
    for (const p of f.formatToParts(d)) if (p.type !== 'literal') o[p.type] = p.value
    return o
  }
  const offsetMs = (d: Date) => {
    const p = parts(d)
    return (
      Date.UTC(
        +(p.year ?? '0'),
        +(p.month ?? '1') - 1,
        +(p.day ?? '1'),
        +(p.hour ?? '0'),
        +(p.minute ?? '0'),
        +(p.second ?? '0'),
      ) -
      Math.floor(d.getTime() / 1000) * 1000
    )
  }
  const today = parts(day)
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  const wall = Date.UTC(
    +(today.year ?? '0'),
    +(today.month ?? '1') - 1,
    +(today.day ?? '1'),
    h,
    m,
    0,
  )
  let guess = new Date(wall - offsetMs(day))
  guess = new Date(wall - offsetMs(guess))
  return guess
}

/** Wall-clock hours of `date` in `timeZone`, fractional (15:30 → 15.5). */
export function localHoursAt(date: Date, timeZone: string): number {
  const o: Record<string, string> = {}
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  for (const p of f.formatToParts(date)) if (p.type !== 'literal') o[p.type] = p.value
  return +(o.hour ?? '0') + +(o.minute ?? '0') / 60 + +(o.second ?? '0') / 3600
}

/** The world's `sunAt` as a Date, or null when absent or unreadable. */
export function parseSunAt(sunAt: string | undefined): Date | null {
  if (typeof sunAt !== 'string') return null
  const date = new Date(sunAt)
  return Number.isFinite(date.getTime()) ? date : null
}

/**
 * The instant the site is lit at (A5). The world's `sunAt` exactly, while the
 * time slider still reads its local time; the slider's hours on `sunAt`'s date
 * once it moves; the slider's hours today when nothing was sent.
 */
export function litInstant(
  sunAt: string | undefined,
  hours: number,
  timeZone: string = ECO_DEFAULT_TZ,
): Date {
  const sent = parseSunAt(sunAt)
  if (!sent) return instantAt(hours, timeZone)
  if (Math.abs(localHoursAt(sent, timeZone) - hours) < 1e-6) return sent
  return instantAt(hours, timeZone, sent)
}

/**
 * The sun as a unit vector in the editor's scene frame (x site east, y up,
 * z = −site north). Site north stands `northDeg` clockwise from true north,
 * so a sun at true azimuth A stands at A − northDeg from site north.
 *
 * A5: the sun was placed with +z as north — mirrored against the terrain,
 * guides and ghost, which are all in this frame — and turned by +northDeg.
 */
export function sunSceneVector(p: SunPos, northDeg = 0): { x: number; y: number; z: number } {
  return sunVector({ altitude: p.altitude, azimuth: p.azimuth - northDeg })
}

/** Unit vector toward the sun in the editor's scene frame (see `sunSceneVector`). */
export function sunDirectionAt(
  latDeg: number,
  lonDeg: number,
  when: Date,
  northDeg = 0,
): { x: number; y: number; z: number } {
  return sunSceneVector(sunPosition(when, latDeg, lonDeg), northDeg)
}

/** @deprecated Prefer sunPosition (degrees). Kept for call sites expecting radians. */
export function solarPosition(
  latDeg: number,
  lonDeg: number,
  when: Date,
): { altitude: number; azimuth: number } {
  const p = sunPosition(when, latDeg, lonDeg)
  return { altitude: p.altitude * D2R, azimuth: p.azimuth * D2R }
}
