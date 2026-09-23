/**
 * H18 — walk-mode preferences (persisted). Quality tier lives on useViewer (H17).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type WalkCameraMode = 'first' | 'third'

type WalkSettingsState = {
  speedMultiplier: number
  mouseSensitivity: number
  invertY: boolean
  fov: number
  showHud: boolean
  showHelp: boolean
  cameraMode: WalkCameraMode
  shadowsInWalk: boolean
  setSpeedMultiplier: (v: number) => void
  setMouseSensitivity: (v: number) => void
  setInvertY: (v: boolean) => void
  setFov: (v: number) => void
  setShowHud: (v: boolean) => void
  setShowHelp: (v: boolean) => void
  setCameraMode: (v: WalkCameraMode) => void
  setShadowsInWalk: (v: boolean) => void
  toggleHelp: () => void
  toggleCameraMode: () => void
}

export const useWalkSettings = create<WalkSettingsState>()(
  persist(
    (set, get) => ({
      speedMultiplier: 1,
      mouseSensitivity: 1,
      invertY: false,
      fov: 60,
      showHud: true,
      showHelp: false,
      cameraMode: 'first',
      shadowsInWalk: true,
      setSpeedMultiplier: (speedMultiplier) => set({ speedMultiplier }),
      setMouseSensitivity: (mouseSensitivity) => set({ mouseSensitivity }),
      setInvertY: (invertY) => set({ invertY }),
      setFov: (fov) => set({ fov }),
      setShowHud: (showHud) => set({ showHud }),
      setShowHelp: (showHelp) => set({ showHelp }),
      setCameraMode: (cameraMode) => set({ cameraMode }),
      setShadowsInWalk: (shadowsInWalk) => set({ shadowsInWalk }),
      toggleHelp: () => set({ showHelp: !get().showHelp }),
      toggleCameraMode: () =>
        set({ cameraMode: get().cameraMode === 'first' ? 'third' : 'first' }),
    }),
    { name: 'pascal-walk-settings' },
  ),
)
