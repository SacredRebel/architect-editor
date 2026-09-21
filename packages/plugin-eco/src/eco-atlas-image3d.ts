/**
 * H14 — photo / sketch → 3D via the Eco atlas (Meshy key stays on atlas).
 *
 * Atlas base: https://eco-village-map.vercel.app
 * Never hard-code a PIN — callers must supply one (~30 credits/job).
 */

export const ECO_ATLAS_BASE = 'https://eco-village-map.vercel.app'

/** JPEG/PNG data URI char ceiling for POST /api/image3d. */
export const ATLAS_IMAGE_MAX_CHARS = 4_000_000

/** Shrink long side before upload. */
export const ATLAS_IMAGE_LONG_SIDE_PX = 1280

/** Poll interval while status is pending/running. */
export const ATLAS_POLL_MS = 5_000

/** Max GLB bytes returned per /api/image3d/part call. */
export const ATLAS_PART_MAX_BYTES = 3_500_000

export type AtlasImage3dKind = 'object' | 'building'

export type AtlasImage3dConfig = {
  ok: boolean
  providers: string[]
  error?: string
}

export type AtlasImage3dSubmitResult = {
  ok: boolean
  provider?: string
  task?: string
  error?: string
}

export type AtlasImage3dStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'

export type AtlasImage3dStatusResult = {
  ok: boolean
  status?: AtlasImage3dStatus
  progress?: number
  bytes?: number
  thumb?: string
  error?: string
}

export type AtlasHttpErrorCode =
  | 'bad_pin'
  | 'no_3d_key'
  | 'bad_image'
  | 'provider_error'
  | string

export class AtlasImage3dError extends Error {
  readonly code: AtlasHttpErrorCode
  readonly httpStatus: number

  constructor(code: AtlasHttpErrorCode, httpStatus: number, message?: string) {
    super(message ?? code)
    this.name = 'AtlasImage3dError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

export type AtlasFetch = typeof fetch

export type AtlasImage3dClientOptions = {
  baseUrl?: string
  fetchFn?: AtlasFetch
  /** Injected sleep for tests (default real delay). */
  sleep?: (ms: number) => Promise<void>
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

function mapHttpError(res: Response, body: Record<string, unknown>): AtlasImage3dError {
  const code = typeof body.error === 'string' ? body.error : `http_${res.status}`
  return new AtlasImage3dError(code, res.status)
}

/**
 * Resize an image File / Blob to ≤ longSide on the longest edge and emit a
 * JPEG data URI under ATLAS_IMAGE_MAX_CHARS. Browser-only (uses canvas).
 */
export async function shrinkImageToDataUri(
  source: Blob | File,
  longSidePx: number = ATLAS_IMAGE_LONG_SIDE_PX,
): Promise<string> {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') {
    throw new Error('shrinkImageToDataUri requires a browser canvas environment')
  }
  const bitmap = await createImageBitmap(source)
  try {
    const scale = Math.min(1, longSidePx / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d unavailable')
    ctx.drawImage(bitmap, 0, 0, w, h)

    let quality = 0.92
    let dataUri = canvas.toDataURL('image/jpeg', quality)
    while (dataUri.length > ATLAS_IMAGE_MAX_CHARS && quality > 0.4) {
      quality -= 0.08
      dataUri = canvas.toDataURL('image/jpeg', quality)
    }
    if (dataUri.length > ATLAS_IMAGE_MAX_CHARS) {
      throw new AtlasImage3dError('bad_image', 400, 'image still too large after shrink')
    }
    return dataUri
  } finally {
    bitmap.close()
  }
}

/** Join sequential part ArrayBuffers into one GLB. */
export function joinGlbParts(parts: ArrayBuffer[]): ArrayBuffer {
  let total = 0
  for (const p of parts) total += p.byteLength
  const out = new Uint8Array(total)
  let o = 0
  for (const p of parts) {
    out.set(new Uint8Array(p), o)
    o += p.byteLength
  }
  return out.buffer
}

/**
 * Atlas image→3D client. PIN is required on every mutating call.
 */
export class AtlasImage3dClient {
  readonly baseUrl: string
  private readonly fetchFn: AtlasFetch
  private readonly sleep: (ms: number) => Promise<void>

  constructor(options: AtlasImage3dClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? ECO_ATLAS_BASE).replace(/\/$/, '')
    this.fetchFn = options.fetchFn ?? fetch
    this.sleep = options.sleep ?? defaultSleep
  }

  async getConfig(): Promise<AtlasImage3dConfig> {
    const res = await this.fetchFn(`${this.baseUrl}/api/image3d/config`)
    const body = await readJson(res)
    if (!res.ok || body.ok === false) {
      throw mapHttpError(res, body)
    }
    const providers = Array.isArray(body.providers)
      ? body.providers.filter((p): p is string => typeof p === 'string')
      : []
    return { ok: true, providers }
  }

  async submit(input: {
    pin: string
    image: string
    kind: AtlasImage3dKind
    name: string
  }): Promise<{ provider: string; task: string }> {
    if (!input.pin.trim()) {
      throw new AtlasImage3dError('bad_pin', 401, 'PIN required — never hard-coded')
    }
    if (!input.image.startsWith('data:image/') || input.image.length > ATLAS_IMAGE_MAX_CHARS) {
      throw new AtlasImage3dError('bad_image', 400, 'image must be JPEG/PNG data URI ≤ 4e6 chars')
    }
    const res = await this.fetchFn(`${this.baseUrl}/api/image3d`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pin: input.pin,
        image: input.image,
        kind: input.kind,
        name: input.name,
      }),
    })
    const body = await readJson(res)
    if (!res.ok || body.ok === false) throw mapHttpError(res, body)
    const provider = typeof body.provider === 'string' ? body.provider : ''
    const task = typeof body.task === 'string' ? body.task : ''
    if (!provider || !task) {
      throw new AtlasImage3dError('provider_error', 502, 'missing provider/task')
    }
    return { provider, task }
  }

  async status(input: {
    pin: string
    provider: string
    task: string
  }): Promise<AtlasImage3dStatusResult> {
    if (!input.pin.trim()) {
      throw new AtlasImage3dError('bad_pin', 401, 'PIN required')
    }
    const res = await this.fetchFn(`${this.baseUrl}/api/image3d/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    const body = await readJson(res)
    if (!res.ok || body.ok === false) throw mapHttpError(res, body)
    return {
      ok: true,
      status: body.status as AtlasImage3dStatus | undefined,
      progress: typeof body.progress === 'number' ? body.progress : undefined,
      bytes: typeof body.bytes === 'number' ? body.bytes : undefined,
      thumb: typeof body.thumb === 'string' ? body.thumb : undefined,
      error: typeof body.error === 'string' ? body.error : undefined,
    }
  }

  async fetchPart(input: {
    pin: string
    provider: string
    task: string
    from: number
    to: number
  }): Promise<ArrayBuffer> {
    if (!input.pin.trim()) {
      throw new AtlasImage3dError('bad_pin', 401, 'PIN required')
    }
    if (input.to - input.from > ATLAS_PART_MAX_BYTES) {
      throw new Error(`part size exceeds ${ATLAS_PART_MAX_BYTES}`)
    }
    const res = await this.fetchFn(`${this.baseUrl}/api/image3d/part`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const body = await readJson(res)
      throw mapHttpError(res, body)
    }
    return res.arrayBuffer()
  }

  /** Poll every ATLAS_POLL_MS until done/failed; then download GLB in parts. */
  async runToGlb(input: {
    pin: string
    image: string
    kind: AtlasImage3dKind
    name: string
    onStatus?: (s: AtlasImage3dStatusResult) => void
  }): Promise<{ provider: string; task: string; glb: ArrayBuffer; bytes: number }> {
    const { provider, task } = await this.submit(input)
    for (;;) {
      const s = await this.status({ pin: input.pin, provider, task })
      input.onStatus?.(s)
      if (s.status === 'failed') {
        throw new AtlasImage3dError('provider_error', 502, s.error ?? 'image3d failed')
      }
      if (s.status === 'done') {
        const total = s.bytes ?? 0
        if (!(total > 0)) {
          throw new AtlasImage3dError('provider_error', 502, 'done but bytes=0')
        }
        const parts: ArrayBuffer[] = []
        for (let from = 0; from < total; from += ATLAS_PART_MAX_BYTES) {
          const to = Math.min(total, from + ATLAS_PART_MAX_BYTES)
          parts.push(
            await this.fetchPart({
              pin: input.pin,
              provider,
              task,
              from,
              to,
            }),
          )
        }
        const glb = joinGlbParts(parts)
        if (glb.byteLength !== total) {
          throw new Error(`joined ${glb.byteLength} B ≠ reported ${total} B`)
        }
        return { provider, task, glb, bytes: total }
      }
      await this.sleep(ATLAS_POLL_MS)
    }
  }
}

export function createAtlasImage3dClient(
  options?: AtlasImage3dClientOptions,
): AtlasImage3dClient {
  return new AtlasImage3dClient(options)
}
