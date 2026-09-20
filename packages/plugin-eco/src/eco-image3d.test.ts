import { expect, test } from 'bun:test'
import {
  IMAGE3D_BANNED_IDS,
  IMAGE3D_MODELS,
  IMAGE3D_QUALITY_FIRST_PICK,
  IMAGE3D_SCOPE_NOTE,
  IMAGE3D_WIRE_FIRST,
  createImage3dBackend,
  image3dModelForTier,
  isBannedImage3dId,
} from './eco-image3d'
import { scaleFactorForKnownDimension } from './eco-image3d-export'

test('quality first pick is TRELLIS.2; wire is TripoSG', () => {
  expect(IMAGE3D_QUALITY_FIRST_PICK).toBe('trellis2')
  expect(IMAGE3D_WIRE_FIRST).toBe('triposg')
  expect(image3dModelForTier('quality').hfRepo).toBe('microsoft/TRELLIS.2-4B')
  expect(image3dModelForTier('wire').hfRepo).toBe('VAST-AI/TripoSG')
  expect(image3dModelForTier('preview').hfRepo).toBe('stabilityai/TripoSR')
})

test('shortlist is MIT-only and excludes InstantMesh', () => {
  expect(IMAGE3D_MODELS.every((m) => m.licence === 'MIT')).toBe(true)
  expect(IMAGE3D_MODELS.some((m) => m.id.includes('instant'))).toBe(false)
  expect(isBannedImage3dId('TencentARC/InstantMesh')).toBe(true)
  expect(isBannedImage3dId('apple/Sharp')).toBe(true)
  expect(isBannedImage3dId('VAST-AI/TripoSG')).toBe(false)
  expect(IMAGE3D_BANNED_IDS).toContain('instantmesh')
})

test('scope note forbids walkable buildings', () => {
  expect(IMAGE3D_SCOPE_NOTE).toContain('not walk')
})

test('scale factor from known dimension', () => {
  // Unit cube on Y, want 0.9 m seat height → factor 0.9
  expect(scaleFactorForKnownDimension([1, 1, 1], { axis: 'y', meters: 0.9 })).toBeCloseTo(0.9)
  expect(() => scaleFactorForKnownDimension([1, 0, 1], { axis: 'y', meters: 1 })).toThrow()
})

test('deferred backend refuses inference without weights', async () => {
  const backend = createImage3dBackend('wire')
  expect(backend.status).toBe('deferred')
  expect(backend.id).toBe('triposg')
  await expect(
    backend.infer({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
      knownDimension: { axis: 'y', meters: 1 },
    }),
  ).rejects.toThrow(/deferred/i)
})
