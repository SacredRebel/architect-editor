'use client'

import { useState, useSyncExternalStore } from 'react'
import {
  applyOrganicWords,
  generateOrganicBuilding,
  getEcoOrganicBuildingState,
  setTargetGrossSqft,
  subscribeEcoOrganicBuilding,
  undoEcoOrganicBuilding,
  updateOrganicSpecField,
  addSmoothWall,
  bulgeSelectedWall,
  removeOrganicBuilding,
  removeSmoothWall,
} from './eco-organic-building-store'
import { ORGANIC_DEFAULTS, type OrganicSpec } from './eco-organic-spec'
import { formatArea, formatLength } from './eco-true-size'

function useOrg() {
  return useSyncExternalStore(
    subscribeEcoOrganicBuilding,
    getEcoOrganicBuildingState,
    getEcoOrganicBuildingState,
  )
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format = (v: number) => v.toFixed(2),
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  return (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ width: 88 }}>{label}</span>
      <input
        max={max}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        step={step}
        type="range"
        value={value}
        style={{ flex: 1 }}
      />
      <span style={{ width: 48, textAlign: 'right' }}>{format(value)}</span>
    </label>
  )
}

/**
 * H15 — organic building + smooth wall authoring (one undo per slider).
 */
export default function EcoOrganicBuildingPanel() {
  const state = useOrg()
  const [words, setWords] = useState(
    'an organic house with a timber frame, cob walls, hemp insulation and a solar roof',
  )
  const [bulgeM, setBulgeM] = useState(1.5)
  const [spanIdx, setSpanIdx] = useState(1)
  const selected = state.buildings.find((b) => b.id === state.selectedBuildingId) ?? state.buildings[0]
  const order = state.lengthOrder

  const patch = <K extends keyof OrganicSpec>(key: K, value: OrganicSpec[K]) => {
    if (!selected) return
    updateOrganicSpecField(selected.id, key, value)
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
      <div style={{ fontWeight: 600 }}>Organic building (H15)</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={() =>
            generateOrganicBuilding({
              spec: { ...ORGANIC_DEFAULTS, form: 'lobed', lobes: 5 },
              floors: 1,
              targetGrossSqft: state.targetGrossSqft ?? undefined,
            })
          }
          style={{ padding: '6px 10px', cursor: 'pointer' }}
          type="button"
        >
          Grow 5-lobe building
        </button>
        <button onClick={() => undoEcoOrganicBuilding()} style={{ padding: '6px 10px' }} type="button">
          Undo
        </button>
        <button onClick={() => addSmoothWall()} style={{ padding: '6px 10px' }} type="button">
          Add smooth wall + 3 windows
        </button>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>Plain words</span>
        <textarea
          onChange={(e) => setWords(e.target.value)}
          rows={3}
          value={words}
          style={{ padding: 6, resize: 'vertical' }}
        />
        <button
          onClick={() => applyOrganicWords(selected?.id ?? null, words)}
          style={{ padding: '6px 10px', alignSelf: 'flex-start' }}
          type="button"
        >
          Fill fields from words
        </button>
      </label>

      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ width: 88 }}>Target sq ft</span>
        <input
          inputMode="numeric"
          onChange={(e) => {
            const n = Number(e.target.value)
            setTargetGrossSqft(Number.isFinite(n) && n > 0 ? n : null)
          }}
          placeholder="e.g. 5000"
          style={{ flex: 1, padding: '4px 8px' }}
          type="text"
          value={state.targetGrossSqft ?? ''}
        />
      </label>

      {selected ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            borderTop: '1px solid color-mix(in srgb, currentColor 15%, transparent)',
            paddingTop: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>{selected.name}</strong>
            <button onClick={() => removeOrganicBuilding(selected.id)} type="button">
              Remove
            </button>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ width: 88 }}>Form</span>
            <select
              onChange={(e) => patch('form', e.target.value as OrganicSpec['form'])}
              value={selected.spec.form}
            >
              {(['fit', 'lobed', 'oval', 'leaf', 'shell'] as const).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <SliderRow
            label="Lobes"
            max={12}
            min={2}
            onChange={(v) => patch('lobes', Math.round(v))}
            step={1}
            value={selected.spec.lobes}
            format={(v) => String(Math.round(v))}
          />
          <SliderRow
            label="Depth"
            max={0.6}
            min={0}
            onChange={(v) => patch('depth', v)}
            step={0.01}
            value={selected.spec.depth}
          />
          <SliderRow
            label="Turn °"
            max={360}
            min={-360}
            onChange={(v) => patch('turn', v)}
            step={1}
            value={selected.spec.turn}
            format={(v) => `${Math.round(v)}°`}
          />
          <SliderRow
            label="Inset"
            max={10}
            min={0}
            onChange={(v) => patch('inset', v)}
            step={0.1}
            value={selected.spec.inset}
            format={(v) => `${v.toFixed(1)}m`}
          />
          <SliderRow
            label="Height"
            max={9}
            min={2.2}
            onChange={(v) => patch('height', v)}
            step={0.05}
            value={selected.spec.height}
            format={(v) => `${v.toFixed(2)}m`}
          />
          <SliderRow
            label="Rise"
            max={8}
            min={0.3}
            onChange={(v) => patch('rise', v)}
            step={0.05}
            value={selected.spec.rise}
          />
          <SliderRow
            label="Overhang"
            max={3}
            min={0}
            onChange={(v) => patch('overhang', v)}
            step={0.05}
            value={selected.spec.overhang}
          />
          <SliderRow
            label="Thick"
            max={1}
            min={0.12}
            onChange={(v) => patch('thick', v)}
            step={0.01}
            value={selected.spec.thick}
          />
          <SliderRow
            label="Solar"
            max={1}
            min={0}
            onChange={(v) => patch('solar', v)}
            step={0.05}
            value={selected.spec.solar}
          />
          <SliderRow
            label="Glazing"
            max={1}
            min={0}
            onChange={(v) => patch('glazing', v)}
            step={0.05}
            value={selected.spec.glazing}
          />
          <SliderRow
            label="Facing °"
            max={360}
            min={0}
            onChange={(v) => patch('facing', v)}
            step={1}
            value={selected.spec.facing}
            format={(v) => `${Math.round(v)}°`}
          />
          <SliderRow
            label="Door °"
            max={360}
            min={0}
            onChange={(v) => patch('door', v)}
            step={1}
            value={selected.spec.door}
            format={(v) => `${Math.round(v)}°`}
          />

          <div style={{ opacity: 0.85, lineHeight: 1.45, marginTop: 4 }}>
            <div>Floor {formatArea(selected.quantities.floor_m2, order)}</div>
            <div>
              Wall net {selected.quantities.wall_net_m2.toFixed(1)} m² · infill{' '}
              {selected.quantities.infill_m3.toFixed(2)} m³
            </div>
            <div>
              Glazing {selected.quantities.glazing_m2.toFixed(1)} m² · roof{' '}
              {selected.quantities.roof_surface_m2.toFixed(1)} m²
            </div>
            <div>
              Insulation {selected.quantities.insulation_m3.toFixed(2)} m³ · frame{' '}
              {selected.quantities.frame_kg.toFixed(0)} kg
            </div>
            <div>
              Panels {selected.quantities.panels} · {selected.quantities.kWp.toFixed(1)} kWp
            </div>
            <div>Wall length {formatLength(selected.quantities.wall_length_m, order)}</div>
          </div>
        </div>
      ) : (
        <div style={{ opacity: 0.65 }}>No organic building yet.</div>
      )}

      {state.smoothWalls.length > 0 && (
        <div
          style={{
            borderTop: '1px solid color-mix(in srgb, currentColor 15%, transparent)',
            paddingTop: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ fontWeight: 600 }}>Smooth walls</div>
          {state.smoothWalls.map((w) => (
            <div key={w.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ flex: 1 }}>
                {w.name} · {w.openings.filter((o) => o.kind === 'window').length} windows ·{' '}
                {w.controls.length} pts
              </span>
              <button onClick={() => removeSmoothWall(w.id)} type="button">
                Remove
              </button>
            </div>
          ))}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>Bulge span</span>
            <input
              max={8}
              min={0}
              onChange={(e) => setSpanIdx(Number(e.target.value))}
              step={1}
              type="number"
              value={spanIdx}
              style={{ width: 48 }}
            />
            <span>m</span>
            <input
              max={5}
              min={0.1}
              onChange={(e) => setBulgeM(Number(e.target.value))}
              step={0.1}
              type="number"
              value={bulgeM}
              style={{ width: 56 }}
            />
            <button onClick={() => bulgeSelectedWall(spanIdx, bulgeM)} type="button">
              Bulge
            </button>
          </label>
        </div>
      )}
    </div>
  )
}
