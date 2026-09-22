/**
 * What the Build palette puts down: the same kinds at the size of a house rather than a basilica.
 * (The kinds' own defaults stay ActArtech's Hagia Sophia measurements, for the generators.)
 */
import { archFor, FT } from './proportions'

export const DOME_PRESET = () => ({
  radius: 10 * FT,
  riseRatio: 0.5,
  shellThickness: 0.12,
  drumHeight: 0,
  drumRadius: 10 * FT,
  windowCount: 0,
  windowWidth: 0.4,
  windowHeight: 0.9,
  oculusRadius: 0,
  sectorStart: 0,
  sectorAngle: Math.PI * 2,
})

export const ARCH_PRESET = () => {
  const span = 10 * FT
  const { profileType, rise } = archFor('gothic', span)
  return { span, rise, profileType, depth: 0.6, thickness: 0.4 }
}

export const PIER_PRESET = () => ({
  footprint: [
    [-0.3, -0.3],
    [0.3, -0.3],
    [0.3, 0.3],
    [-0.3, 0.3],
  ] as [number, number][],
  height: 2.7,
  impostSize: 0.1,
  impostThickness: 0.15,
  batter: 0,
})

export const COLUMN_PRESET = () => ({
  variant: 'aisle_verde',
  shaftHeight: 2.6,
  capitalHeight: 0.45,
  shaftRadius: 0.16,
  flutes: 0,
  entasis: 0.03,
})
