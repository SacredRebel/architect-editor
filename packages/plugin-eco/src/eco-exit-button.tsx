'use client'

import { useEffect, useState } from 'react'
import { isEcoBridgeReady, requestEcoClose } from './bridge'

/**
 * Exit control shown only when the editor is framed and the host has said hello.
 * Sends `eco:close` — the host owns dismissing the overlay.
 * Inline styles so we do not depend on the editor Tailwind content scan.
 */
export function EcoExitButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const embedded = window.self !== window.top
    if (!embedded) return

    setVisible(isEcoBridgeReady())
    const id = window.setInterval(() => {
      setVisible(isEcoBridgeReady())
    }, 250)
    return () => window.clearInterval(id)
  }, [])

  if (!visible) return null

  return (
    <button
      onClick={() => requestEcoClose()}
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        zIndex: 80,
        padding: '6px 12px',
        fontSize: 12,
        fontWeight: 600,
        borderRadius: 6,
        border: '1px solid rgba(128,128,128,0.45)',
        background: 'rgba(20,20,20,0.92)',
        color: '#f5f5f5',
        cursor: 'pointer',
        pointerEvents: 'auto',
      }}
      type="button"
    >
      Exit to world
    </button>
  )
}
