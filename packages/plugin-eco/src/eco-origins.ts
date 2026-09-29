/**
 * The origins the eco/1 bridge answers, and nothing else (never "*"):
 *   - the world in production: https://spatial-map.vercel.app
 *   - the world's Vercel previews in this team:
 *     https://spatial-map-<name>-pauls-projects-af8162cc.vercel.app
 *   - local development: http://localhost:<port> and http://127.0.0.1:<port>
 * Pure (no imports), so a check can drive it without a browser.
 */
export const ECO_WORLD_ORIGIN = 'https://spatial-map.vercel.app'

const WORLD_PREVIEW = /^https:\/\/spatial-map-[a-z0-9-]+-pauls-projects-af8162cc\.vercel\.app$/
const LOCAL_DEV = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/

export function isEcoHostOrigin(origin: unknown): origin is string {
  if (typeof origin !== 'string') return false
  return origin === ECO_WORLD_ORIGIN || WORLD_PREVIEW.test(origin) || LOCAL_DEV.test(origin)
}

export type EcoOriginGate = {
  /**
   * Whether a valid eco/1 message from `origin` is admitted: 'hello' opens (or
   * re-opens) the session, 'message' is from the bound host, null is silence.
   */
  admit(origin: string, isHello: boolean): 'hello' | 'message' | null
  /** The origin every reply goes to: the one whose hello was admitted. */
  host(): string | null
}

/**
 * One host per page. The first allowed origin that says hello becomes the host;
 * foreign origins, and other allowed origins once a host is bound, get silence.
 */
export function createEcoOriginGate(
  isAllowed: (origin: unknown) => boolean = isEcoHostOrigin,
): EcoOriginGate {
  let bound: string | null = null
  return {
    admit(origin, isHello) {
      if (!isAllowed(origin)) return null
      if (bound !== null && origin !== bound) return null
      if (isHello) {
        bound = origin
        return 'hello'
      }
      return bound === origin ? 'message' : null
    },
    host: () => bound,
  }
}
