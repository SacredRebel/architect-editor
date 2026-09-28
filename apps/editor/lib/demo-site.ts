import type { EcoSite } from '@eco/plugin-eco'
import { useScene } from '@pascal-app/core'
import { ecoAssetPrefix, ecoPublicPath } from './eco-mode'

/**
 * How long the world's studio has, once the editor is up, to send a scene or a
 * site. Short: anything it sends later still replaces the fixture.
 */
const WAIT_FOR_WORLD_MS = 3000
const STRUCTURE = new Set(['site', 'building', 'level'])

/** The two bridge calls the fallback needs, passed in so this file never imports the plugin. */
type EcoBridge = {
  hasEcoHostContent(): boolean
  applyEcoPayloadsLocally(payload: { scene?: unknown; site?: EcoSite }): void
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The editor holds a design when it has any node beyond site / building / level. */
function sceneHasDesign(): boolean {
  return Object.values(useScene.getState().nodes).some((node) => !STRUCTURE.has(node.type))
}

function editorUp(): boolean {
  return Object.values(useScene.getState().nodes).some((node) => node.type === 'site')
}

/**
 * Demo: whatever the world's studio sends opens as it always has. When it
 * sends nothing — no scene and no site within a few seconds of the editor
 * coming up — and the editor holds no design, open the site/house fixture
 * (`public/demo/site-house.json`, see its NOTICE.md) through the bridge's own
 * load path. No hello is sent, so the world's hello is still accepted later,
 * and anything it sends replaces the fixture.
 */
export async function startDemoSiteFallback(bridge: EcoBridge): Promise<void> {
  if (typeof window === 'undefined') return
  // Fetched now, alongside the editor's own first load, so it is ready to open.
  const fixtureText = fetch(ecoPublicPath('/demo/site-house.json'))
    .then((response) => (response.ok ? response.text() : null))
    .catch(() => null)
  const deadline = Date.now() + 60_000
  while (!editorUp() && Date.now() < deadline) await sleep(250)
  await sleep(WAIT_FOR_WORLD_MS)
  if (bridge.hasEcoHostContent() || sceneHasDesign()) return

  const text = await fixtureText
  if (!text) return
  const fixture = JSON.parse(
    text.replaceAll('{{origin}}', `${window.location.origin}${ecoAssetPrefix}`),
  ) as { postMessages: { t: string; scene?: unknown; site?: EcoSite }[] }
  const scene = fixture.postMessages.find((m) => m.t === 'eco:load-scene')?.scene
  const site = fixture.postMessages.find((m) => m.t === 'eco:load-site')?.site
  // The world may have spoken while the fixture was on its way.
  if (bridge.hasEcoHostContent() || sceneHasDesign()) return
  bridge.applyEcoPayloadsLocally({ scene, site })
  console.info('[demo] no scene or site from the world — opened the demo site and house')
}
