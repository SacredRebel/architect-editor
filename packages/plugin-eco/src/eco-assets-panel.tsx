'use client'

import { type DragEvent, useCallback, useRef, useState, useSyncExternalStore } from 'react'
import {
  addEcoAsset,
  bytesToBase64,
  type EcoAsset,
  getEcoAssetsState,
  hashBytes,
  placeEcoAsset,
  removeEcoAsset,
  subscribeEcoAssets,
} from './eco-assets-store'

const MAX_BYTES = 8 * 1024 * 1024

function useAssets() {
  return useSyncExternalStore(subscribeEcoAssets, getEcoAssetsState, getEcoAssetsState)
}

async function renderThumbnail(file: File): Promise<string> {
  // Lightweight placeholder thumb — full GLB rasterize is heavier than E4 needs.
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 96
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = '#1f2937'
  ctx.fillRect(0, 0, 96, 96)
  ctx.fillStyle = '#a78bfa'
  ctx.fillRect(20, 28, 56, 40)
  ctx.fillStyle = '#e5e7eb'
  ctx.font = '10px sans-serif'
  ctx.fillText(file.name.slice(0, 12), 8, 88)
  return canvas.toDataURL('image/png')
}

/**
 * "My assets" panel — import ≤8MB GLB/GLTF, place copies into the scene.
 */
export default function EcoAssetsPanel() {
  const { assets, placements } = useAssets()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const ingest = useCallback(async (file: File) => {
    setError(null)
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.glb') && !lower.endsWith('.gltf')) {
      setError('Only .glb / .gltf files are supported.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('File is larger than 8 MB.')
      return
    }
    setBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const hash = await hashBytes(buf)
      const asset: EcoAsset = {
        id: `asset-${hash.slice(0, 12)}`,
        name: file.name.replace(/\.(glb|gltf)$/i, ''),
        hash,
        byteLength: buf.byteLength,
        bytesBase64: bytesToBase64(buf),
        thumbDataUrl: await renderThumbnail(file),
      }
      addEcoAsset(asset)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }, [])

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file) void ingest(file)
    },
    [ingest],
  )

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
      <div style={{ fontWeight: 600 }}>My assets</div>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        style={{
          border: '1px dashed rgba(255,255,255,0.25)',
          borderRadius: 8,
          padding: 16,
          textAlign: 'center',
          opacity: busy ? 0.6 : 1,
        }}
      >
        Drop .glb / .gltf here (≤ 8 MB)
        <div style={{ marginTop: 8 }}>
          <button
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            style={{ padding: '4px 10px', cursor: 'pointer' }}
            type="button"
          >
            Choose file
          </button>
          <input
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void ingest(file)
              e.target.value = ''
            }}
            ref={inputRef}
            type="file"
          />
        </div>
      </div>
      {error && <div style={{ color: '#f87171' }}>{error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {assets.length === 0 && <div style={{ opacity: 0.6 }}>No assets yet.</div>}
        {assets.map((asset) => (
          <div
            key={asset.id}
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              padding: 6,
            }}
          >
            {asset.thumbDataUrl ? (
              <img
                alt=""
                src={asset.thumbDataUrl}
                style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }}
              />
            ) : (
              <div style={{ width: 40, height: 40, background: '#333', borderRadius: 4 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {asset.name}
              </div>
              <div style={{ opacity: 0.55 }}>
                {(asset.byteLength / 1024).toFixed(1)} KB ·{' '}
                {placements.filter((p) => p.assetId === asset.id).length} placed
              </div>
            </div>
            <button onClick={() => placeEcoAsset(asset.id)} type="button">
              Place
            </button>
            <button onClick={() => removeEcoAsset(asset.id)} type="button">
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
