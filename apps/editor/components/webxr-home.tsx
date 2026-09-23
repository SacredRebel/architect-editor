'use client'

import { PascalWebXRButton } from '@webxr/plugin/pascal-editor'
import type { ComponentProps, ReactNode } from 'react'
import { Editor } from '@pascal-app/editor'
import {
  useWebXRInstalled,
  WebXRFeatureConsumer,
  WebXRFeatureRuntime,
} from '@/components/webxr-feature-gate'

type ShellProps = {
  immersive?: ComponentProps<typeof Editor>['immersive']
  vrButton?: ReactNode
}

/** Mounts WebXR only when the WebXR plugin is installed on the scene. */
export function WebXREditorShell({
  children,
}: {
  children: (props: ShellProps) => ReactNode
}) {
  const webXRInstalled = useWebXRInstalled()
  return (
    <WebXRFeatureRuntime enabled={webXRInstalled}>
      <WebXRFeatureConsumer>
        {(vr) =>
          children({
            immersive: vr?.immersive,
            vrButton: vr ? (
              <PascalWebXRButton
                className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-accent disabled:opacity-50"
                feature={vr}
              />
            ) : null,
          })
        }
      </WebXRFeatureConsumer>
    </WebXRFeatureRuntime>
  )
}
