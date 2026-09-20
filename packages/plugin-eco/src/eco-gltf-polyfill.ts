/**
 * GLTFExporter needs FileReader + OffscreenCanvas to emit DataTexture normal maps
 * in Bun/Node (no document). Browser already has both.
 */
import { deflateSync } from 'node:zlib'

function crc32(buf: Uint8Array): number {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
  }
  return ~c >>> 0
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBuf = new TextEncoder().encode(type)
  const len = new Uint8Array(4)
  new DataView(len.buffer).setUint32(0, data.length, false)
  const crcBuf = new Uint8Array(4)
  const crcData = new Uint8Array(typeBuf.length + data.length)
  crcData.set(typeBuf)
  crcData.set(data, typeBuf.length)
  new DataView(crcBuf.buffer).setUint32(0, crc32(crcData), false)
  const out = new Uint8Array(4 + typeBuf.length + data.length + 4)
  out.set(len, 0)
  out.set(typeBuf, 4)
  out.set(data, 4 + typeBuf.length)
  out.set(crcBuf, 4 + typeBuf.length + data.length)
  return out
}

/** Minimal RGB/RGBA → PNG (8-bit). */
export function encodePngRgba(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const raw = new Uint8Array((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1)
    raw[row] = 0
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), row + 1)
  }
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = new Uint8Array(13)
  const dv = new DataView(ihdr.buffer)
  dv.setUint32(0, width, false)
  dv.setUint32(4, height, false)
  ihdr[8] = 8
  ihdr[9] = 6 // RGBA
  const parts = [sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', new Uint8Array(0))]
  let total = 0
  for (const p of parts) total += p.length
  const out = new Uint8Array(total)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

type FakeImageData = { data: Uint8ClampedArray; width: number; height: number }

function installImageData(): void {
  if (typeof globalThis.ImageData !== 'undefined') return
  ;(globalThis as unknown as { ImageData: unknown }).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    constructor(a: Uint8ClampedArray | number, b?: number, c?: number) {
      if (typeof a === 'number') {
        this.width = a
        this.height = b ?? 0
        this.data = new Uint8ClampedArray(this.width * this.height * 4)
      } else {
        this.data = a
        this.width = b ?? 0
        this.height = c ?? 0
      }
    }
  }
}

function installOffscreenCanvas(): void {
  if (typeof globalThis.OffscreenCanvas !== 'undefined') return
  if (typeof document !== 'undefined') return

  class FakeCanvas2D {
    canvas: FakeOffscreenCanvas
    private _sx = 1
    private _sy = 1
    private _tx = 0
    private _ty = 0
    constructor(canvas: FakeOffscreenCanvas) {
      this.canvas = canvas
    }
    translate(x: number, y: number) {
      this._tx += x
      this._ty += y
    }
    scale(x: number, y: number) {
      this._sx *= x
      this._sy *= y
    }
    putImageData(imageData: FakeImageData, dx: number, dy: number) {
      const { width, height } = this.canvas
      if (!this.canvas.pixels || this.canvas.pixels.length !== width * height * 4) {
        this.canvas.pixels = new Uint8ClampedArray(width * height * 4)
      }
      const dst = this.canvas.pixels
      const src = imageData.data
      // Honour vertical flip from GLTFExporter (translate+scale).
      const flipY = this._sy < 0
      for (let y = 0; y < imageData.height; y++) {
        const sy = flipY ? imageData.height - 1 - y : y
        for (let x = 0; x < imageData.width; x++) {
          const si = (sy * imageData.width + x) * 4
          const dx2 = x + dx
          const dy2 = y + dy
          if (dx2 < 0 || dy2 < 0 || dx2 >= width || dy2 >= height) continue
          const di = (dy2 * width + dx2) * 4
          dst[di] = src[si]!
          dst[di + 1] = src[si + 1]!
          dst[di + 2] = src[si + 2]!
          dst[di + 3] = src[si + 3]!
        }
      }
    }
    getImageData(sx: number, sy: number, sw: number, sh: number): FakeImageData {
      const { width, height, pixels } = this.canvas
      const data = new Uint8ClampedArray(sw * sh * 4)
      if (!pixels) return { data, width: sw, height: sh }
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const srcX = sx + x
          const srcY = sy + y
          if (srcX < 0 || srcY < 0 || srcX >= width || srcY >= height) continue
          const si = (srcY * width + srcX) * 4
          const di = (y * sw + x) * 4
          data[di] = pixels[si]!
          data[di + 1] = pixels[si + 1]!
          data[di + 2] = pixels[si + 2]!
          data[di + 3] = pixels[si + 3]!
        }
      }
      return { data, width: sw, height: sh }
    }
    drawImage() {
      /* unused for DataTexture path */
    }
  }

  class FakeOffscreenCanvas {
    private _width = 1
    private _height = 1
    pixels: Uint8ClampedArray | null = null
    constructor(w = 1, h = 1) {
      this._width = w
      this._height = h
    }
    get width() {
      return this._width
    }
    set width(v: number) {
      this._width = v
      this.pixels = null
    }
    get height() {
      return this._height
    }
    set height(v: number) {
      this._height = v
      this.pixels = null
    }
    getContext(type: string) {
      if (type !== '2d') return null
      return new FakeCanvas2D(this)
    }
    convertToBlob(opts?: { type?: string }): Promise<Blob> {
      const w = this.width
      const h = this.height
      const px = this.pixels ?? new Uint8ClampedArray(w * h * 4)
      const png = encodePngRgba(w, h, px)
      const copy = new Uint8Array(png.byteLength)
      copy.set(png)
      return Promise.resolve(new Blob([copy.buffer], { type: opts?.type ?? 'image/png' }))
    }
  }

  ;(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = FakeOffscreenCanvas
}

/** Ensure FileReader + canvas exist for GLTFExporter in Bun/Node. */
export function ensureGltfExportPolyfills(): void {
  if (typeof globalThis.FileReader === 'undefined') {
    ;(globalThis as unknown as { FileReader: unknown }).FileReader = class FileReader {
      result: ArrayBuffer | null = null
      onloadend: ((ev: { target: FileReader }) => void) | null = null
      onerror: ((err: unknown) => void) | null = null
      readAsArrayBuffer(blob: Blob) {
        void blob.arrayBuffer().then(
          (buf) => {
            this.result = buf
            this.onloadend?.({ target: this as unknown as FileReader })
          },
          (err) => this.onerror?.(err),
        )
      }
    }
  }
  installImageData()
  installOffscreenCanvas()
}
