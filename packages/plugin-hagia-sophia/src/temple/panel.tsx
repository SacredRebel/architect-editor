'use client'

/**
 * Temple forms — the panel.
 *
 * Puts a whole domed bay on the level at any size, with the Byzantine proportions or your own
 * springing height, turned to any bearing; and gives a selected arch or dome one of the classic
 * proportions. The single pieces (dome, arch, pier, column) are in the Build palette.
 */
import {
  type AnyNode,
  type AnyNodeId,
  generateId,
  levelBaseElevationAt,
  nodeRegistry,
  useScene,
} from '@pascal-app/core'
import { triggerSFX, useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { useState } from 'react'
import {
  ARCH_FORMS,
  type ArchForm,
  archFor,
  composeDomedBay,
  DOME_SHAPES,
  type DomeShape,
  FT,
  feet,
  type DomedBayOptions,
  measureDomedBay,
} from './proportions'
import { archThrustAnalysis } from '../math/arch-profile'

type Units = 'ft' | 'm'

const box: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 }
const row: React.CSSProperties = { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }
const btn: React.CSSProperties = {
  padding: '5px 9px',
  cursor: 'pointer',
  borderRadius: 6,
  border: '1px solid rgba(127,127,127,0.35)',
  background: 'transparent',
  color: 'inherit',
  fontSize: 12,
}
const on: React.CSSProperties = { ...btn, background: 'rgba(127,127,127,0.22)', fontWeight: 600 }
const input: React.CSSProperties = {
  width: 70,
  padding: '4px 6px',
  borderRadius: 6,
  border: '1px solid rgba(127,127,127,0.35)',
  background: 'transparent',
  color: 'inherit',
  fontSize: 12,
}
const muted: React.CSSProperties = { opacity: 0.65, fontSize: 11, lineHeight: 1.45 }

function both(m: number, units: Units): string {
  return units === 'ft' ? `${feet(m)} · ${m.toFixed(2)} m` : `${m.toFixed(2)} m · ${feet(m)}`
}

function partsOfBay(nodes: Record<string, AnyNode>, bay: string): AnyNodeId[] {
  return Object.values(nodes)
    .filter((n) => (n as { metadata?: { templeBay?: string } }).metadata?.templeBay === bay)
    .map((n) => n.id as AnyNodeId)
}

export default function TemplePanel() {
  const [units, setUnits] = useState<Units>('ft')
  const [spanText, setSpanText] = useState('20')
  const [dome, setDome] = useState<DomeShape>('hemisphere')
  const [drum, setDrum] = useState(false)
  const [ownSpring, setOwnSpring] = useState(false)
  const [springText, setSpringText] = useState('10')
  const [bearingText, setBearingText] = useState('0')
  const [note, setNote] = useState('')
  const levelId = useViewer((s) => s.selection.levelId)
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const nodes = useScene((s) => s.nodes)

  const toM = (t: string) => {
    const v = Number.parseFloat(t)
    return Number.isFinite(v) && v > 0 ? (units === 'ft' ? v * FT : v) : null
  }
  const span = toM(spanText)
  const springing = ownSpring ? toM(springText) : null
  const bearing = Number.parseFloat(bearingText)
  const opts: DomedBayOptions | null = span
    ? { span, dome, drum, springing: springing ?? undefined, bearingDeg: Number.isFinite(bearing) ? bearing : 0 }
    : null
  const m = opts ? measureDomedBay(opts) : null

  type Loose = {
    id: string
    type: string
    span?: number
    rise?: number
    thickness?: number
    profileType?: string
    metadata?: { templeBay?: string }
  }
  const byId = nodes as unknown as Record<string, Loose>
  const selected = selectedIds.map((id) => byId[id as string]).filter(Boolean) as Loose[]
  const arch = selected.find((n) => n.type === 'hagia-sophia:arch')
  const domeNode = selected.find((n) => n.type === 'hagia-sophia:dome')
  const bay = selected
    .map((n) => (n as { metadata?: { templeBay?: string } }).metadata?.templeBay)
    .find(Boolean)

  const thrust =
    arch && arch.span && arch.rise && arch.thickness && arch.profileType
      ? archThrustAnalysis({
          profileType: arch.profileType as 'round' | 'pointed' | 'segmental' | 'catenary',
          span: arch.span,
          rise: arch.rise,
          thickness: arch.thickness,
        })
      : null

  const place = (o: DomedBayOptions, label: string) => {
    if (!levelId) {
      setNote('Pick a level first.')
      return
    }
    const target = useEditor.getState().navigationSyncPose?.target ?? [0, 0, 0]
    const center: [number, number] = [target[0], target[2]]
    const meas = measureDomedBay(o)
    const reach = meas.outside / 2
    const all = useScene.getState().nodes as Record<string, AnyNode>
    // stand the bay on the lowest ground under it, so no pier floats
    let base = Number.POSITIVE_INFINITY
    for (const [dx, dz] of [[0, 0], [reach, reach], [reach, -reach], [-reach, reach], [-reach, -reach]] as const) {
      base = Math.min(base, levelBaseElevationAt(all, levelId, center[0] + dx, center[1] + dz))
    }
    const bayId = generateId('temple-bay')
    const parts = composeDomedBay({ ...o, center, base: Number.isFinite(base) ? base : 0, bayId })
    const ops = parts.map((p) => {
      const def = nodeRegistry.get(p.type)
      const node = (def ? def.schema.parse({ ...p, parentId: levelId }) : p) as AnyNode
      return { node, parentId: levelId as AnyNodeId }
    })
    useScene.getState().createNodes(ops)
    useViewer.getState().setSelection({ selectedIds: ops.map((op) => op.node.id as AnyNodeId) })
    triggerSFX('sfx:item-place')
    setNote(`${label}: ${ops.length} parts placed, crown at ${both(meas.crown, units)}. Ctrl+Z takes it back.`)
  }

  const setArch = (form: ArchForm) => {
    if (!arch) return
    const { profileType, rise } = archFor(form, arch.span ?? 3)
    useScene.getState().updateNode(arch.id as AnyNodeId, { profileType, rise } as Partial<AnyNode>)
  }
  const setDomeShape = (shape: DomeShape) => {
    if (!domeNode) return
    const riseRatio = DOME_SHAPES.find((s) => s.id === shape)?.riseRatio ?? 0.5
    useScene.getState().updateNode(domeNode.id as AnyNodeId, { riseRatio } as Partial<AnyNode>)
  }

  const placeCatenaryVault = () => {
    if (!levelId) {
      setNote('Pick a level first.')
      return
    }
    const S = span ?? 20 * FT
    const { rise } = archFor('catenary', S)
    const target = useEditor.getState().navigationSyncPose?.target ?? [0, 0, 0]
    const all = useScene.getState().nodes as Record<string, AnyNode>
    const base = levelBaseElevationAt(all, levelId, target[0], target[2])
    const def = nodeRegistry.get('hagia-sophia:arch')
    const raw = {
      object: 'node',
      type: 'hagia-sophia:arch',
      name: 'Catenary vault',
      parentId: levelId,
      visible: true,
      metadata: { templePart: 'catenary-vault' },
      position: [target[0], Number.isFinite(base) ? base + 2.4 : 2.4, target[2]],
      rotation: [0, 0, 0],
      span: S,
      rise,
      depth: S * 0.75,
      profileType: 'catenary',
      thickness: Math.max(0.2, S * 0.06),
      showThrust: true,
    }
    const node = (def ? def.schema.parse(raw) : raw) as AnyNode
    useScene.getState().createNodes([{ node, parentId: levelId as AnyNodeId }])
    useViewer.getState().setSelection({ selectedIds: [node.id as AnyNodeId] })
    triggerSFX('sfx:item-place')
    setNote(`Catenary vault: span ${both(S, units)}, extruded ${both(S * 0.75, units)}. Green thrust line = Poleni middle third.`)
  }

  const placeCatenaryDome = () => {
    if (!levelId) {
      setNote('Pick a level first.')
      return
    }
    const R = (span ?? 20 * FT) / 2
    const target = useEditor.getState().navigationSyncPose?.target ?? [0, 0, 0]
    const all = useScene.getState().nodes as Record<string, AnyNode>
    const base = levelBaseElevationAt(all, levelId, target[0], target[2])
    const def = nodeRegistry.get('hagia-sophia:dome')
    const raw = {
      object: 'node',
      type: 'hagia-sophia:dome',
      name: 'Catenary dome',
      parentId: levelId,
      visible: true,
      metadata: { templePart: 'catenary-dome' },
      position: [target[0], Number.isFinite(base) ? base + 3 : 3, target[2]],
      rotation: [0, 0, 0],
      radius: R,
      riseRatio: 0.4,
      meridian: 'catenary',
      shellThickness: Math.max(0.1, R * 0.04),
      drumHeight: 0,
      drumRadius: R,
      windowCount: 0,
      windowWidth: 0.4,
      windowHeight: 0.9,
      oculusRadius: 0,
      sectorStart: 0,
      sectorAngle: Math.PI * 2,
    }
    const node = (def ? def.schema.parse(raw) : raw) as AnyNode
    useScene.getState().createNodes([{ node, parentId: levelId as AnyNodeId }])
    useViewer.getState().setSelection({ selectedIds: [node.id as AnyNodeId] })
    triggerSFX('sfx:item-place')
    setNote(`Catenary dome of revolution: diameter ${both(R * 2, units)}, rise ${both(R * 2 * 0.4, units)}.`)
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 14, fontSize: 12 }}>
      <div style={box}>
        <div style={{ ...row, justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Domed bay</div>
          <div style={row}>
            <button style={units === 'ft' ? on : btn} onClick={() => setUnits('ft')} type="button">ft</button>
            <button style={units === 'm' ? on : btn} onClick={() => setUnits('m')} type="button">m</button>
          </div>
        </div>
        <div style={muted}>
          Four piers, four round arches, four pendentives and a dome — cut from one sphere, the way the
          Byzantine builders did it. Every part scales with the span.
        </div>
        <label style={row}>
          <span style={{ width: 92 }}>Clear span</span>
          <input style={input} value={spanText} onChange={(e) => setSpanText(e.target.value)} inputMode="decimal" />
          <span>{units}</span>
        </label>
        <div style={row}>
          <span style={{ width: 92 }}>Dome</span>
          {DOME_SHAPES.map((s) => (
            <button key={s.id} style={dome === s.id ? on : btn} onClick={() => setDome(s.id)} title={s.note} type="button">
              {s.label}
            </button>
          ))}
        </div>
        <label style={row}>
          <span style={{ width: 92 }}>Window ring</span>
          <input type="checkbox" checked={drum} onChange={(e) => setDrum(e.target.checked)} />
          <span style={muted}>a drum of windows under the dome</span>
        </label>
        <div style={row}>
          <span style={{ width: 92 }}>Arches spring</span>
          <button style={!ownSpring ? on : btn} onClick={() => setOwnSpring(false)} type="button">Byzantine</button>
          <button style={ownSpring ? on : btn} onClick={() => setOwnSpring(true)} type="button">at</button>
          {ownSpring ? (
            <>
              <input style={input} value={springText} onChange={(e) => setSpringText(e.target.value)} inputMode="decimal" />
              <span>{units}</span>
            </>
          ) : null}
        </div>
        <label style={row}>
          <span style={{ width: 92 }}>Axis bearing</span>
          <input style={input} value={bearingText} onChange={(e) => setBearingText(e.target.value)} inputMode="decimal" />
          <span>°</span>
          <button style={btn} onClick={() => setBearingText('0')} type="button">N–S</button>
          <button style={btn} onClick={() => setBearingText('90')} type="button">E–W</button>
        </label>
        {m ? (
          <div style={{ ...muted, opacity: 0.85, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10 }}>
            <span>arches spring at</span><span>{both(m.springing, units)}</span>
            <span>dome stands at</span><span>{both(m.ring + m.drum, units)}</span>
            <span>crown</span><span>{both(m.crown, units)}</span>
            <span>outside, pier to pier</span><span>{both(m.outside, units)}</span>
            <span>the one sphere</span><span>radius {both(m.sphere, units)} (span ÷ √2)</span>
          </div>
        ) : (
          <div style={muted}>Type a span.</div>
        )}
        <div style={row}>
          <button style={on} disabled={!opts} onClick={() => opts && place(opts, 'Domed bay')} type="button">
            Place it where the view is centred
          </button>
          <button
            style={btn}
            onClick={() => place({ span: 31.2, dome: 'hemisphere', drum: true, bearingDeg: opts?.bearingDeg ?? 0 }, 'Hagia Sophia core')}
            title="31.2 m square, arches springing at 23.14 m — ActArtech's figures"
            type="button"
          >
            Hagia Sophia core, true size
          </button>
        </div>
        {note ? <div style={muted}>{note}</div> : null}
      </div>

      <div style={box}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>Proportions for what is selected</div>
        {arch ? (
          <div style={row}>
            {ARCH_FORMS.map((f) => (
              <button key={f.id} style={btn} onClick={() => setArch(f.id)} title={f.note} type="button">
                {f.label}
              </button>
            ))}
          </div>
        ) : null}
        {arch && thrust ? (
          <div
            style={{
              ...muted,
              color: thrust.withinMiddleThird ? undefined : '#c92a2a',
              opacity: 1,
            }}
          >
            {thrust.withinMiddleThird
              ? 'Poleni’s test (1748): line of thrust stays in the middle third of the ring.'
              : `Warning — line of thrust leaves the middle third (offset ${(thrust.maxOffset * 1000).toFixed(0)} mm > ${(thrust.middleThirdHalf * 1000).toFixed(0)} mm).`}
          </div>
        ) : null}
        {domeNode ? (
          <div style={row}>
            {DOME_SHAPES.map((s) => (
              <button key={s.id} style={btn} onClick={() => setDomeShape(s.id)} title={s.note} type="button">
                {s.label} dome
              </button>
            ))}
            <button
              style={btn}
              onClick={() =>
                useScene.getState().updateNode(domeNode.id as AnyNodeId, {
                  meridian: 'catenary',
                } as Partial<AnyNode>)
              }
              title="Meridian is an inverted hanging chain, spun into a dome"
              type="button"
            >
              Catenary meridian
            </button>
          </div>
        ) : null}
        {bay ? (
          <button
            style={btn}
            onClick={() => useViewer.getState().setSelection({ selectedIds: partsOfBay(nodes as unknown as Record<string, AnyNode>, bay) })}
            type="button"
          >
            Select the whole bay
          </button>
        ) : null}
        {!arch && !domeNode && !bay ? (
          <div style={muted}>Select an arch or a dome to give it a classic proportion. The single pieces are in Build.</div>
        ) : null}
      </div>

      <div style={box}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>Hanging-chain vault &amp; dome</div>
        <div style={muted}>
          Inverted catenary y = a·cosh(x/a), fitted to the clear span. The vault extrudes it; the dome
          spins the same curve. Hooke 1675; Poleni’s hanging-chain test 1748.
        </div>
        <div style={row}>
          <button style={on} onClick={placeCatenaryVault} type="button">
            Place catenary vault
          </button>
          <button style={btn} onClick={placeCatenaryDome} type="button">
            Place catenary dome
          </button>
        </div>
      </div>

      <div style={muted}>
        Dome, arch, pendentive, pier and column by{' '}
        <a href="https://github.com/ActArtech/editor" target="_blank" rel="noreferrer">ActArtech</a> (MIT), from their
        Hagia Sophia plugin. The bay arithmetic and true pendentives are ours.
      </div>
    </div>
  )
}
