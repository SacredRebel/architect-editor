'use client'

import { useMemo } from 'react'
import { useScene } from '@pascal-app/core'
import {
  ecoConstructionCsv,
  getEcoJurisdiction,
  runEcoConstructionTakeoff,
  type TakeoffBasis,
} from './eco-construction'

function basisColor(basis: TakeoffBasis): string {
  if (basis === 'takeoff') return '#6bcb77'
  if (basis === 'estimate') return '#ffd93d'
  return '#aaa'
}

/**
 * Construction takeoff panel — Ventura County jurisdiction + basis-labeled CSV.
 */
export default function EcoConstructionPanel() {
  const nodes = useScene((s) => s.nodes)
  const result = useMemo(
    () => runEcoConstructionTakeoff(nodes as Record<string, Record<string, unknown>>),
    [nodes],
  )
  const j = result.jurisdiction
  const c = j.climate

  const downloadCsv = () => {
    const csv = ecoConstructionCsv(result)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'eco-construction-takeoff.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
      <div style={{ fontWeight: 600 }}>Construction takeoff</div>
      <div style={{ opacity: 0.7, lineHeight: 1.4 }}>
        Geometry metrics plus Bones <code>computeLevel</code>/<code>computeTakeoff</code> when
        Pascal wall/slab/level nodes are present. Every row carries an honest <code>basis</code>{' '}
        — member counts are <code>takeoff</code>; massing rules of thumb stay <code>estimate</code>.
      </div>

      <div
        style={{
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 6,
          padding: 8,
          background: result.bones.ok ? 'rgba(107,203,119,0.08)' : 'rgba(255,217,61,0.08)',
          lineHeight: 1.4,
        }}
      >
        {result.bones.ok ? (
          <>
            Bones engines: <strong>{result.bones.memberCount}</strong> members on{' '}
            <code>{result.bones.levelId}</code> → {result.bones.takeoffRowCount} takeoff rows
          </>
        ) : (
          <>
            Bones engines not run — {result.bones.reason}. Massing estimates kept.
          </>
        )}
      </div>

      <div
        style={{
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 6,
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          background: 'rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ fontWeight: 600 }}>{j.name}</div>
        <div>{j.residentialCode}</div>
        <div style={{ opacity: 0.75 }}>Effective: {j.codeEffective}</div>
        <div style={{ marginTop: 4, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          <div>
            Frost line: <strong>{c.frostLineIn} in</strong> (negligible)
          </div>
          <div>
            Min embed: <strong>{c.footingEmbedmentMinIn} in</strong>
          </div>
          <div>
            Snow: <strong>{c.groundSnowLoadPsf} psf</strong>
          </div>
          <div>
            Wind Vult: <strong>{c.ultimateWindMph} mph</strong>
          </div>
          <div>
            Seismic SDC: <strong>{c.seismicSdc}</strong>
          </div>
          <div>
            Hold-downs: <strong>{c.seismicHoldDowns ? 'yes' : 'no'}</strong>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            WUI / HFA: <strong>{c.wui ? 'yes' : 'no'}</strong> — Chapter 7A / VCWUIC class
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={downloadCsv} type="button">
          Download CSV
        </button>
        <span style={{ opacity: 0.65 }}>
          {result.metrics.floorAreaM2} m² floor · {result.metrics.exteriorWallLfM} m exterior wall
        </span>
      </div>

      <div style={{ overflow: 'auto', maxHeight: 420 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ textAlign: 'left', opacity: 0.7 }}>
              <th style={{ padding: '4px 2px' }}>Section</th>
              <th style={{ padding: '4px 2px' }}>Item</th>
              <th style={{ padding: '4px 2px' }}>Qty</th>
              <th style={{ padding: '4px 2px' }}>Basis</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r, i) => (
              <tr key={`${r.section}-${r.item}-${i}`} style={{ verticalAlign: 'top' }}>
                <td style={{ padding: '4px 2px', opacity: 0.75 }}>{r.section}</td>
                <td style={{ padding: '4px 2px' }}>
                  <div>{r.item}</div>
                  <div style={{ opacity: 0.55, fontSize: 10 }}>{r.detail}</div>
                </td>
                <td style={{ padding: '4px 2px', whiteSpace: 'nowrap' }}>
                  <strong>{r.quantity}</strong> {r.unit}
                </td>
                <td style={{ padding: '4px 2px' }}>
                  <span style={{ color: basisColor(r.basis), fontWeight: 600 }}>{r.basis}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ opacity: 0.55, fontSize: 10, lineHeight: 1.35 }}>
        Profile id {getEcoJurisdiction().id}. Drafting aid — verify with Ventura County Building &
        Safety / AHJ. Data file:{' '}
        <code>packages/plugin-eco/data/jurisdiction/ventura-county.json</code> (no network fetch).
      </div>
    </div>
  )
}
