'use client'

import { EcoExitButton } from '@eco/plugin-eco'
import { Editor, ItemsPanel } from '@pascal-app/editor'
import { Hammer, Layers, Package, Settings } from 'lucide-react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useEffect } from 'react'
import { BuildTab } from '@/components/build-tab'
import {
  CommunityViewerToolbarLeft,
  CommunityViewerToolbarRight,
} from '@/components/viewer-toolbar'
import { detectEcoEmbedded, ecoPublicPath } from '@/lib/eco-mode'

const GeometryFloorplanOverlay = dynamic(
  () => import('@pascal-app/plugin-geometry').then((m) => m.geometryFloorplanOverlay()),
  { ssr: false },
)

function EditorItemsPanel() {
  return <ItemsPanel showSourceFilter={false} showTagFilters={false} />
}

const SIDEBAR_TABS = [
  {
    id: 'site',
    label: 'Scene',
    component: () => null,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Layers className="h-5 w-5" />,
    icon: (
      <Image
        alt=""
        className="h-8 w-8 object-contain"
        height={32}
        src={ecoPublicPath('/icons/scene.webp')}
        width={32}
      />
    ),
  },
  {
    id: 'build',
    label: 'Build',
    component: BuildTab,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Hammer className="h-5 w-5" />,
    icon: (
      <Image
        alt=""
        className="h-8 w-8 object-contain"
        height={32}
        src={ecoPublicPath('/icons/build.webp')}
        width={32}
      />
    ),
  },
  {
    id: 'items',
    label: 'Items',
    component: EditorItemsPanel,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Package className="h-5 w-5" />,
    icon: (
      <Image
        alt=""
        className="h-8 w-8 object-contain"
        height={32}
        src={ecoPublicPath('/icons/couch.webp')}
        width={32}
      />
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    component: () => null,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Settings className="h-5 w-5" />,
    icon: (
      <Image
        alt=""
        className="h-8 w-8 object-contain"
        height={32}
        src={ecoPublicPath('/icons/settings.webp')}
        width={32}
      />
    ),
  },
]

/**
 * Embed entry for the world host iframe — full-viewport editor, no marketing
 * chrome. Persistence uses the Editor's built-in localStorage path (no
 * `onSave` / server scene API). Sets `window.ecoEmbedded` when framed.
 */
export default function EmbedPage() {
  useEffect(() => {
    detectEcoEmbedded()
  }, [])

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <EcoExitButton />
      <Editor
        floorplanSceneSlot={<GeometryFloorplanOverlay />}
        layoutVersion="v2"
        projectId="eco-embed"
        sidebarTabs={SIDEBAR_TABS}
        viewerToolbarLeft={<CommunityViewerToolbarLeft />}
        viewerToolbarRight={<CommunityViewerToolbarRight />}
      />
    </div>
  )
}
