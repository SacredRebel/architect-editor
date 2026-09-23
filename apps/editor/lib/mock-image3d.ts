/**
 * H15.1 — local mocked atlas for photo/sketch → 3D (no live PIN).
 * Tiny box GLB so the panel can run end-to-end against /api/image3d/* .
 */

import { Document, NodeIO } from '@gltf-transform/core'

const tasks = new Map<
  string,
  { status: 'pending' | 'running' | 'done' | 'failed'; progress: number; glb: Uint8Array; kind: string }
>()

async function makeBoxGlb(kind: 'object' | 'building'): Promise<Uint8Array> {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const material = doc.createMaterial(kind === 'building' ? 'massing' : 'prop').setBaseColorFactor([
    kind === 'building' ? 0.55 : 0.75,
    kind === 'building' ? 0.5 : 0.65,
    0.4,
    1,
  ])
  // Unit box centred; prepareImage3dGlb will scale + ground-seat.
  const size = kind === 'building' ? 1 : 0.5
  const positions = new Float32Array([
    -size, 0, -size, size, 0, -size, size, 0, size, -size, 0, size,
    -size, size * 2, -size, size, size * 2, -size, size, size * 2, size, -size, size * 2, size,
  ])
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
  ])
  const pos = doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer)
  const idx = doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer)
  const prim = doc.createPrimitive().setAttribute('POSITION', pos).setIndices(idx).setMaterial(material)
  const mesh = doc.createMesh(kind).addPrimitive(prim)
  const node = doc.createNode(kind).setMesh(mesh)
  const scene = doc.createScene('mock').addChild(node)
  doc.getRoot().setDefaultScene(scene)
  const io = new NodeIO()
  return await io.writeBinary(doc)
}

function okJson(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export async function handleMockImage3d(
  req: Request,
  path: 'config' | 'submit' | 'status' | 'part',
): Promise<Response> {
  if (path === 'config') {
    return okJson({ ok: true, providers: ['mock'] })
  }

  if (path === 'submit') {
    const body = (await req.json().catch(() => ({}))) as {
      pin?: string
      image?: string
      kind?: string
      name?: string
    }
    if (!body.pin || !String(body.pin).trim()) {
      return okJson({ ok: false, error: 'bad_pin' }, 401)
    }
    if (!body.image || typeof body.image !== 'string') {
      return okJson({ ok: false, error: 'bad_image' }, 400)
    }
    const kind = body.kind === 'building' ? 'building' : 'object'
    const task = `mock-${crypto.randomUUID()}`
    const glb = await makeBoxGlb(kind)
    tasks.set(task, { status: 'running', progress: 10, glb, kind })
    // Advance quickly so polls finish in one or two ticks
    setTimeout(() => {
      const t = tasks.get(task)
      if (t) {
        t.progress = 100
        t.status = 'done'
      }
    }, 50)
    return okJson({ ok: true, provider: 'mock', task })
  }

  if (path === 'status') {
    const body = (await req.json().catch(() => ({}))) as { task?: string; pin?: string }
    if (!body.pin) return okJson({ ok: false, error: 'bad_pin' }, 401)
    const t = body.task ? tasks.get(body.task) : undefined
    if (!t) return okJson({ ok: false, error: 'unknown_task' }, 404)
    return okJson({
      ok: true,
      status: t.status,
      progress: t.progress,
      bytes: t.status === 'done' ? t.glb.byteLength : undefined,
    })
  }

  if (path === 'part') {
    const body = (await req.json().catch(() => ({}))) as {
      task?: string
      pin?: string
      from?: number
      to?: number
    }
    if (!body.pin) return okJson({ ok: false, error: 'bad_pin' }, 401)
    const t = body.task ? tasks.get(body.task) : undefined
    if (!t || t.status !== 'done') return okJson({ ok: false, error: 'not_ready' }, 409)
    const from = Math.max(0, body.from ?? 0)
    const to = Math.min(t.glb.byteLength, body.to ?? t.glb.byteLength)
    const slice = t.glb.subarray(from, to)
    return new Response(slice, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(slice.byteLength),
      },
    })
  }

  return okJson({ ok: false, error: 'not_found' }, 404)
}
