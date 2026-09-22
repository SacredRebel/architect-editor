'use client'

import { type ChangeEvent, useCallback, useRef, useState, useSyncExternalStore } from 'react'
import {
  AtlasImage3dClient,
  AtlasImage3dError,
  createAtlasImage3dClient,
  shrinkImageToDataUri,
  type AtlasImage3dKind,
  type AtlasImage3dStatusResult,
} from './eco-atlas-image3d'
import {
  addEcoAsset,
  bytesToBase64,
  hashBytes,
  placeEcoAsset,
  type EcoAsset,
} from './eco-assets-store'
import { guessServiceHeightM, prepareImage3dGlb } from './eco-image3d-export'

type FlowKind = 'photo' | 'sketch'

/**
 * H14 — Photo → prop and Sketch → massing through the atlas.
 * Always asks for PIN; never stores Meshy keys locally.
 */
export default function EcoImage3dPanel() {
  const [pin, setPin] = useState('')
  const [heightM, setHeightM] = useState('')
  const [busy, setBusy] = useState<FlowKind | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const sketchRef = useRef<HTMLInputElement>(null)
  const clientRef = useRef<AtlasImage3dClient | null>(null)

  const client = () => {
    if (!clientRef.current) clientRef.current = createAtlasImage3dClient()
    return clientRef.current
  }

  const runFlow = useCallback(
    async (flow: FlowKind, file: File) => {
      setError(null)
      setStatus(null)
      setProgress(null)
      const trimmedPin = pin.trim()
      if (!trimmedPin) {
        setError('Enter your atlas PIN first (~30 credits / job). Never hard-coded.')
        return
      }

      const kind: AtlasImage3dKind = flow === 'photo' ? 'object' : 'building'
      const name = file.name.replace(/\.(png|jpe?g|webp)$/i, '') || (flow === 'photo' ? 'prop' : 'massing')

      setBusy(flow)
      try {
        setStatus('Checking atlas…')
        const cfg = await client().getConfig()
        if (!cfg.providers.length) {
          throw new AtlasImage3dError('no_3d_key', 501, 'Atlas has no 3D key configured')
        }

        setStatus('Shrinking image…')
        const image = await shrinkImageToDataUri(file)

        setStatus(`Submitting ${kind} job…`)
        const { provider, task, glb } = await client().runToGlb({
          pin: trimmedPin,
          image,
          kind,
          name,
          onStatus: (s: AtlasImage3dStatusResult) => {
            setProgress(typeof s.progress === 'number' ? s.progress : null)
            setStatus(`${s.status ?? '…'}${s.progress != null ? ` ${Math.round(s.progress)}%` : ''}`)
          },
        })

        setStatus('Preparing GLB (scale / axis / meshopt)…')
        const knownMeters = Number(heightM)
        const meters =
          Number.isFinite(knownMeters) && knownMeters > 0
            ? knownMeters
            : guessServiceHeightM(kind)
        const prepared = await prepareImage3dGlb(glb, {
          knownDimension: { axis: 'y', meters },
          optimiseProfile: 'image3d',
        })

        const hash = await hashBytes(prepared.buffer)
        const role = flow === 'photo' ? 'prop' : 'massing'
        const asset: EcoAsset = {
          id: `asset-${hash.slice(0, 12)}`,
          name: `${name} (${role})`,
          hash,
          byteLength: prepared.buffer.byteLength,
          bytesBase64: bytesToBase64(prepared.buffer),
          thumbDataUrl: '',
          role,
          sourceProvider: provider,
          sourceKind: kind,
        }
        addEcoAsset(asset)
        placeEcoAsset(asset.id)
        setStatus(
          flow === 'photo'
            ? `Prop placed · ${provider}/${task} · ${(prepared.buffer.byteLength / 1024).toFixed(0)} KB`
            : `Massing ref placed (locked, not walkable) · ${provider}/${task}`,
        )
      } catch (err) {
        if (err instanceof AtlasImage3dError) {
          setError(`${err.code}: ${err.message}`)
        } else {
          setError(err instanceof Error ? err.message : 'Image→3D failed')
        }
      } finally {
        setBusy(null)
      }
    },
    [pin, heightM],
  )

  const onPick = (flow: FlowKind) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void runFlow(flow, file)
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
      <div style={{ fontWeight: 600 }}>Photo / sketch → 3D (H14)</div>
      <div
        style={{
          opacity: 0.75,
          lineHeight: 1.4,
          padding: '6px 8px',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 6,
        }}
      >
        Runs through the Eco atlas (Meshy). Ask for a PIN every time — ~30 credits/job. Free-tier
        Meshy outputs are <strong>CC BY 4.0</strong>; paid keeps rights. Sketch massing is a locked
        semi-transparent reference for tracing walls — <strong>not walkable</strong>, excluded from
        walk export.
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>Atlas PIN</span>
        <input
          autoComplete="off"
          onChange={(e) => setPin(e.target.value)}
          placeholder="required — never stored as a default"
          type="password"
          value={pin}
          style={{ padding: '4px 8px' }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>Known height (m) — optional; else service guess</span>
        <input
          inputMode="decimal"
          onChange={(e) => setHeightM(e.target.value)}
          placeholder="e.g. 0.9 chair / 3.2 storey"
          type="text"
          value={heightM}
          style={{ padding: '4px 8px' }}
        />
      </label>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          disabled={busy !== null}
          onClick={() => photoRef.current?.click()}
          style={{ padding: '6px 10px', cursor: 'pointer' }}
          type="button"
        >
          {busy === 'photo' ? 'Working…' : 'Photo → prop'}
        </button>
        <button
          disabled={busy !== null}
          onClick={() => sketchRef.current?.click()}
          style={{ padding: '6px 10px', cursor: 'pointer' }}
          type="button"
        >
          {busy === 'sketch' ? 'Working…' : 'Sketch → massing'}
        </button>
        <input
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          hidden
          onChange={onPick('photo')}
          ref={photoRef}
          type="file"
        />
        <input
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          hidden
          onChange={onPick('sketch')}
          ref={sketchRef}
          type="file"
        />
      </div>

      {progress != null && (
        <div style={{ opacity: 0.7 }}>Progress {Math.round(progress)}%</div>
      )}
      {status && <div style={{ opacity: 0.85 }}>{status}</div>}
      {error && <div style={{ color: '#f87171' }}>{error}</div>}
    </div>
  )
}

/** Keep React Compiler happy — subscribe unused but documents live store. */
export function useEcoImage3dPanelMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => true,
  )
}
