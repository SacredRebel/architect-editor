'use client'

import { useState } from 'react'
import { FORMS, type FormId } from './catalog'
import { parseLengthInput } from './math'
import {
  adQuadratum,
  cordTriple,
  extremeMean,
  hexCircleLattice,
  regularPentagon,
  rootRectangle,
  twoCircle,
} from './forms'

/**
 * Geometry rail — plain geometric names only.
 */
export default function GeometryPanel() {
  const [selected, setSelected] = useState<FormId>('two-circle')
  const [sizeText, setSizeText] = useState('3')
  const [note, setNote] = useState('')
  const form = FORMS.find((f) => f.id === selected)!

  const place = () => {
    const size = parseLengthInput(sizeText)
    if (size == null || !(size > 0)) {
      setNote('Enter a size (e.g. 10, 32\'6", 3.2m)')
      return
    }
    let summary = ''
    switch (selected) {
      case 'two-circle':
        summary = `lens h/w = ${twoCircle(size).meta?.lensHeightOverWidth?.toFixed(9)}`
        break
      case 'cord-triples':
        summary = `right-angle dot = ${cordTriple(size).meta?.rightAngleDot}`
        break
      case 'turned-square':
        summary = `area step = ${adQuadratum(size, 3).meta?.stepAreaRatio}`
        break
      case 'root-rectangle':
        summary = `√2 ratio = ${rootRectangle(size, 2).meta?.ratio?.toFixed(9)}`
        break
      case 'extreme-mean':
        summary = `φ ≈ ${extremeMean(size).meta?.phiApprox?.toFixed(9)}`
        break
      case 'regular-pentagon':
        summary = `diag/side = ${regularPentagon(size).meta?.diagonalOverSide?.toFixed(9)}`
        break
      case 'hex-circle-lattice':
        summary = `${hexCircleLattice(size, 2).meta?.count} centres`
        break
      default:
        summary = `placed ${form.label} @ ${size} m (construction lines — snap/store wiring follows)`
    }
    setNote(`${form.label}: ${summary}`)
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
      <div style={{ fontWeight: 600 }}>Geometry</div>
      <div style={{ opacity: 0.7, lineHeight: 1.4 }}>
        Construction figures with plain geometric names. Type a size in feet-inches or metres.
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
      <button onClick={place} style={{ padding: '6px 10px', cursor: 'pointer' }} type="button">
        Place construction
      </button>
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
      {note && <div style={{ opacity: 0.9 }}>{note}</div>}
    </div>
  )
}
