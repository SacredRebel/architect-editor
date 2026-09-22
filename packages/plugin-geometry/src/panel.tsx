'use client'

import {
  type AnyNode,
  type AnyNodeId,
  generateId,
  useScene,
} from '@pascal-app/core'
import { triggerSFX, useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { useState, useSyncExternalStore } from 'react'
import { buildForm } from './build'
import { FORMS, type FormId } from './catalog'
import { roomProportionCheck } from './forms'
import { parseLengthInput } from './math'
import {
  addPlacedFigure,
  addUserForm,
  clearPlacedFigures,
  getGeometryState,
  removePlacedFigure,
  setSelectedFigure,
  subscribeGeometry,
  updatePlacedFigure,
} from './store'

const btn: React.CSSProperties = {
  padding: '5px 9px',
  cursor: 'pointer',
  borderRadius: 6,
  border: '1px solid rgba(127,127,127,0.35)',
  background: 'transparent',
  color: 'inherit',
  fontSize: 12,
}

function useGeometry() {
  return useSyncExternalStore(subscribeGeometry, getGeometryState, getGeometryState)
}

/**
 * Geometry rail — plain geometric names only.
 */
export default function GeometryPanel() {
  const [selected, setSelected] = useState<FormId>('two-circle')
  const [sizeText, setSizeText] = useState('3')
  const [bearingText, setBearingText] = useState('0')
  const [extraText, setExtraText] = useState('8')
  const [note, setNote] = useState('')
  const [userName, setUserName] = useState('')
  const form = FORMS.find((f) => f.id === selected)!
  const { figures, selectedId, userForms } = useGeometry()
  const levelId = useViewer((s) => s.selection.levelId)

  const place = () => {
    const size = parseLengthInput(sizeText)
    if (size == null || !(size > 0)) {
      setNote('Enter a size (e.g. 10, 32\'6", 3.2m)')
      return
    }
    const bearing = Number.parseFloat(bearingText)
    const target = useEditor.getState().navigationSyncPose?.target ?? [0, 0, 0]
    const origin: [number, number] = [target[0], target[2]]
    const n = Number.parseInt(extraText, 10)
    const built = buildForm(selected, {
      size,
      origin,
      bearingDeg: Number.isFinite(bearing) ? bearing : 0,
      n: Number.isFinite(n) ? n : undefined,
      sides: Number.isFinite(n) ? n : undefined,
      rings: Number.isFinite(n) ? n : undefined,
      steps: Number.isFinite(n) ? n : undefined,
    })
    const id = generateId('geom')
    addPlacedFigure({
      id,
      formId: selected,
      label: form.label,
      size,
      origin,
      bearingDeg: Number.isFinite(bearing) ? bearing : 0,
      locked: false,
      figure: built.figure,
      solid: built.solid,
    })
    triggerSFX('sfx:item-place')
    setNote(`${form.label}: ${built.summary}`)
  }

  const makeWalls = () => {
    if (!levelId) {
      setNote('Pick a level first.')
      return
    }
    const fig = figures.find((f) => f.id === selectedId) ?? figures[figures.length - 1]
    if (!fig) {
      setNote('Place a construction first.')
      return
    }
    const closed = fig.figure.polylines.find(
      (p) => p.length >= 4 && Math.hypot(p[0]![0] - p[p.length - 1]![0], p[0]![1] - p[p.length - 1]![1]) < 1e-6,
    )
    if (!closed) {
      setNote('Select a closed figure (grid cell, polygon, rectangle).')
      return
    }
    const thickness =
      (useEditor.getState().toolDefaults.wall as { thickness?: number } | undefined)?.thickness ??
      0.15
    const ops: { node: AnyNode; parentId: AnyNodeId }[] = []
    for (let i = 0; i < closed.length - 1; i++) {
      const a = closed[i]!
      const b = closed[i + 1]!
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-4) continue
      const id = generateId('wall') as AnyNodeId
      ops.push({
        parentId: levelId as AnyNodeId,
        node: {
          object: 'node',
          id,
          type: 'wall',
          name: 'Wall',
          parentId: levelId,
          visible: true,
          metadata: { fromGeometry: fig.id },
          children: [],
          start: [a[0], a[1]],
          end: [b[0], b[1]],
          thickness,
          frontSide: 'unknown',
          backSide: 'unknown',
        } as AnyNode,
      })
    }
    if (!ops.length) {
      setNote('No wall segments.')
      return
    }
    useScene.getState().createNodes(ops)
    useViewer.getState().setSelection({ selectedIds: ops.map((op) => op.node.id as AnyNodeId) })
    triggerSFX('sfx:item-place')
    setNote(`Made ${ops.length} walls from ${fig.label}.`)
  }

  const saveUser = () => {
    const name = userName.trim()
    if (!name) {
      setNote('Name your form first.')
      return
    }
    const size = parseLengthInput(sizeText) ?? 3
    addUserForm({
      id: generateId('user-form'),
      name,
      formId: selected,
      size,
    })
    setNote(`Saved “${name}” (user).`)
    setUserName('')
  }

  const checkRoom = () => {
    const w = parseLengthInput(sizeText)
    const d = parseLengthInput(extraText)
    if (w == null || d == null || !(w > 0) || !(d > 0)) {
      setNote('Room check needs width (Size) and depth (Extra).')
      return
    }
    const r = roomProportionCheck(w, d)
    setNote(
      `Room ${w.toFixed(2)}×${d.toFixed(2)} → Alberti ${r.bestAlberti} (Δ${r.albertiErr.toFixed(3)}), Palladio ${r.bestPalladio} (Δ${r.palladioErr.toFixed(3)})`,
    )
  }

  const rebuildSelected = (patch: { size?: number; bearingDeg?: number; origin?: [number, number] }) => {
    const fig = figures.find((f) => f.id === selectedId)
    if (!fig || fig.locked) {
      setNote(fig?.locked ? 'Unlock the figure first.' : 'Select a placed figure.')
      return
    }
    const size = patch.size ?? fig.size
    const bearingDeg = patch.bearingDeg ?? fig.bearingDeg
    const origin = patch.origin ?? fig.origin
    const built = buildForm(fig.formId, { size, origin, bearingDeg })
    updatePlacedFigure(fig.id, {
      size,
      bearingDeg,
      origin,
      figure: built.figure,
      solid: built.solid,
    })
    setNote(`Updated ${fig.label}: ${built.summary}`)
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
      <div style={{ fontWeight: 600 }}>Geometry</div>
      <div style={{ opacity: 0.7, lineHeight: 1.4 }}>
        Construction figures with plain geometric names. Type a size in feet-inches or metres.
        Drag the blue scale handle on a selected figure (2D or 3D). Minimal-surface soap-film
        awaits H15.3.
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>Form</span>
        <select
          onChange={(e) => setSelected(e.target.value as FormId)}
          value={selected}
          style={{ padding: 6 }}
        >
          {FORMS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
          {userForms.map((u) => (
            <option key={u.id} value={u.formId}>
              {u.name} (user)
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>Size</span>
        <input
          onChange={(e) => setSizeText(e.target.value)}
          value={sizeText}
          placeholder="3 or 10' or 3.2m"
          style={{ padding: '4px 8px' }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>Bearing °</span>
        <input
          onChange={(e) => setBearingText(e.target.value)}
          value={bearingText}
          style={{ padding: '4px 8px' }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>Extra (n / sides / rings / depth)</span>
        <input
          onChange={(e) => setExtraText(e.target.value)}
          value={extraText}
          style={{ padding: '4px 8px' }}
        />
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button onClick={place} style={btn} type="button">
          Place construction
        </button>
        <button onClick={makeWalls} style={btn} type="button">
          Make walls from this
        </button>
        <button onClick={checkRoom} style={btn} type="button">
          Check room ratios
        </button>
        <button onClick={() => clearPlacedFigures()} style={btn} type="button">
          Clear all
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          onChange={(e) => setUserName(e.target.value)}
          value={userName}
          placeholder="Add your own…"
          style={{ flex: 1, padding: '4px 8px' }}
        />
        <button onClick={saveUser} style={btn} type="button">
          Save
        </button>
      </div>
      <div style={{ opacity: 0.85, lineHeight: 1.45 }}>
        <div>
          <strong>{form.label}</strong>
        </div>
        <div>
          {form.book} —{' '}
          <a href={form.link} rel="noreferrer" target="_blank">
            free scan
          </a>
        </div>
        <div>{form.note}</div>
      </div>
      {figures.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontWeight: 600 }}>Placed ({figures.length})</div>
          {figures.map((f) => (
            <div key={f.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                type="button"
                style={{
                  ...btn,
                  flex: 1,
                  textAlign: 'left',
                  fontWeight: f.id === selectedId ? 600 : 400,
                  opacity: f.id === selectedId ? 1 : 0.7,
                }}
                onClick={() => setSelectedFigure(f.id)}
              >
                {f.label}
                {f.locked ? ' · locked' : ''}
              </button>
              <button
                type="button"
                style={btn}
                onClick={() => updatePlacedFigure(f.id, { locked: !f.locked })}
              >
                {f.locked ? 'Unlock' : 'Lock'}
              </button>
              <button type="button" style={btn} onClick={() => removePlacedFigure(f.id)}>
                ✕
              </button>
            </div>
          ))}
          {selectedId && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button
                type="button"
                style={btn}
                onClick={() => {
                  const fig = figures.find((f) => f.id === selectedId)
                  if (!fig) return
                  rebuildSelected({ size: fig.size * 1.1 })
                }}
              >
                Scale +10%
              </button>
              <button
                type="button"
                style={btn}
                onClick={() => {
                  const fig = figures.find((f) => f.id === selectedId)
                  if (!fig) return
                  rebuildSelected({ size: fig.size / 1.1 })
                }}
              >
                Scale −10%
              </button>
              <button
                type="button"
                style={btn}
                onClick={() => {
                  const fig = figures.find((f) => f.id === selectedId)
                  if (!fig) return
                  rebuildSelected({ bearingDeg: fig.bearingDeg + 15 })
                }}
              >
                Turn +15°
              </button>
              <button
                type="button"
                style={btn}
                onClick={() => {
                  const target = useEditor.getState().navigationSyncPose?.target ?? [0, 0, 0]
                  rebuildSelected({ origin: [target[0], target[2]] })
                }}
              >
                Move to view
              </button>
            </div>
          )}
        </div>
      )}
      {note && <div style={{ opacity: 0.9 }}>{note}</div>}
    </div>
  )
}
