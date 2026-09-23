/**
 * The inspector for the temple kinds: every dimension as a number in metres, and a derive that
 * keeps a round arch round and a golden dome golden while you change its width.
 */
import type { ParametricDescriptor } from '@pascal-app/core'
import type { HsColumnNode } from '../schema'
import type { HsArchNode } from '../kinds/hs-arch/schema'
import type { HsDomeNode } from '../kinds/hs-dome/schema'
import type { HsPendentiveNode } from '../kinds/hs-pendentive/schema'
import type { HsPierNode } from '../kinds/hs-pier/schema'

export const domeParametrics: ParametricDescriptor<HsDomeNode> = {
  groups: [
    {
      label: 'Dome',
      fields: [
        { key: 'radius', label: 'Radius', kind: 'number', unit: 'm', min: 0.3, max: 60, step: 0.05 },
        { key: 'riseRatio', label: 'Height ÷ width', kind: 'number', min: 0.05, max: 1, step: 0.01 },
        {
          key: 'meridian',
          label: 'Meridian',
          kind: 'enum',
          options: ['circular', 'catenary'],
          display: 'segmented',
        },
        { key: 'shellThickness', label: 'Rim band', kind: 'number', unit: 'm', min: 0.02, max: 3, step: 0.01 },
        { key: 'oculusRadius', label: 'Oculus radius', kind: 'number', unit: 'm', min: 0, max: 10, step: 0.05 },
      ],
    },
    {
      label: 'Drum and windows',
      defaultExpanded: false,
      fields: [
        { key: 'drumHeight', label: 'Drum height', kind: 'number', unit: 'm', min: 0, max: 20, step: 0.05 },
        { key: 'drumRadius', label: 'Drum radius', kind: 'number', unit: 'm', min: 0.3, max: 60, step: 0.05 },
        { key: 'windowCount', label: 'Windows', kind: 'number', min: 0, max: 128, step: 1 },
        { key: 'windowWidth', label: 'Window width', kind: 'number', unit: 'm', min: 0.1, max: 5, step: 0.05 },
        { key: 'windowHeight', label: 'Window height', kind: 'number', unit: 'm', min: 0.1, max: 8, step: 0.05 },
      ],
    },
    {
      label: 'Sweep',
      defaultExpanded: false,
      fields: [
        { key: 'sectorStart', label: 'Start (rad)', kind: 'number', min: -Math.PI * 2, max: Math.PI * 2, step: 0.01 },
        { key: 'sectorAngle', label: 'Angle (rad) — π is a half dome', kind: 'number', min: 0.1, max: Math.PI * 2, step: 0.01 },
      ],
    },
  ],
  // a drum that was the dome's width stays the dome's width
  derive: (next, patch, prev) =>
    patch.radius !== undefined && prev && Math.abs(prev.drumRadius - prev.radius) < 1e-6
      ? { drumRadius: next.radius }
      : {},
}

export const archParametrics: ParametricDescriptor<HsArchNode> = {
  groups: [
    {
      label: 'Arch',
      fields: [
        {
          key: 'profileType',
          label: 'Profile',
          kind: 'enum',
          options: ['round', 'pointed', 'segmental', 'catenary'],
          display: 'segmented',
        },
        { key: 'span', label: 'Span', kind: 'number', unit: 'm', min: 0.3, max: 60, step: 0.05 },
        { key: 'rise', label: 'Rise', kind: 'number', unit: 'm', min: 0.1, max: 60, step: 0.05 },
        { key: 'depth', label: 'Depth (vault)', kind: 'number', unit: 'm', min: 0.05, max: 40, step: 0.05 },
        { key: 'thickness', label: 'Ring', kind: 'number', unit: 'm', min: 0.05, max: 5, step: 0.01 },
        { key: 'showThrust', label: 'Show line of thrust (Poleni)', kind: 'boolean' },
      ],
    },
  ],
  // a round arch stays a semicircle; a pointed/catenary one keeps its rise-to-span proportion
  derive: (next, patch, prev) => {
    if (patch.span === undefined || !prev || prev.span <= 0) return {}
    if (next.profileType === 'round') return { rise: next.span / 2 }
    if (next.profileType === 'pointed' || next.profileType === 'catenary')
      return { rise: (prev.rise / prev.span) * next.span }
    return {}
  },
  invariants: [
    (n) =>
      n.profileType === 'pointed' && n.rise <= n.span / 2
        ? [{ field: 'rise', msg: 'a pointed arch needs a rise above half its span', severity: 'warning' as const }]
        : [],
    (n) => {
      // Lazy import avoided: inline middle-third check via geometry helper would cycle;
      // panel shows the Poleni warning. Keep a cheap thickness sanity here.
      if (n.thickness > n.rise * 0.5)
        return [
          {
            field: 'thickness',
            msg: 'ring thicker than half the rise — check the line of thrust',
            severity: 'warning' as const,
          },
        ]
      return []
    },
  ],
}

export const pierParametrics: ParametricDescriptor<HsPierNode> = {
  groups: [
    {
      label: 'Pier',
      fields: [
        { key: 'height', label: 'Height', kind: 'number', unit: 'm', min: 0.3, max: 60, step: 0.05 },
        { key: 'impostSize', label: 'Impost overhang', kind: 'number', unit: 'm', min: 0, max: 5, step: 0.01 },
        { key: 'impostThickness', label: 'Impost height', kind: 'number', unit: 'm', min: 0.02, max: 5, step: 0.01 },
      ],
    },
  ],
}

export const pendentiveParametrics: ParametricDescriptor<HsPendentiveNode> = {
  groups: [
    {
      label: 'Pendentive',
      fields: [
        { key: 'quadrant', label: 'Corner', kind: 'enum', options: ['ne', 'nw', 'se', 'sw'], display: 'segmented' },
        { key: 'squareSide', label: 'Bay side (true pendentive)', kind: 'number', unit: 'm', min: 0.3, max: 60, step: 0.05 },
        { key: 'sphereRadius', label: 'Sphere radius (octant)', kind: 'number', unit: 'm', min: 0.3, max: 60, step: 0.05 },
      ],
    },
  ],
}

export const columnParametrics: ParametricDescriptor<HsColumnNode> = {
  groups: [
    {
      label: 'Column',
      fields: [
        { key: 'variant', label: 'Stone', kind: 'enum', options: ['nave_verde', 'porphyry_exedra', 'aisle_verde', 'aisle_pillar', 'gallery_verde'], display: 'select' },
        { key: 'shaftHeight', label: 'Shaft height', kind: 'number', unit: 'm', min: 0.3, max: 30, step: 0.05 },
        { key: 'shaftRadius', label: 'Shaft radius', kind: 'number', unit: 'm', min: 0.03, max: 3, step: 0.01 },
        { key: 'capitalHeight', label: 'Capital height', kind: 'number', unit: 'm', min: 0.05, max: 5, step: 0.01 },
        { key: 'flutes', label: 'Flutes', kind: 'number', min: 0, max: 32, step: 1 },
        { key: 'entasis', label: 'Entasis (swell)', kind: 'number', min: 0, max: 0.05, step: 0.005 },
      ],
    },
  ],
}
