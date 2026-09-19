import { LocalScenePage } from './local-scene-page'

/**
 * Always a thin server shell around the client loader so static export can
 * emit `/scene/local` via `generateStaticParams` without `force-dynamic`
 * (Next requires that export to be a compile-time string literal).
 */
export function generateStaticParams() {
  return [{ id: 'local' }]
}

export default function ScenePage() {
  return <LocalScenePage />
}
