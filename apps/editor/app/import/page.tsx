'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { ImportClient } from './import-client'

function ImportBody() {
  const searchParams = useSearchParams()
  const src = searchParams.get('src')
  const name = searchParams.get('name')

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-border border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-4 px-6 py-4">
          <nav className="flex items-center gap-4 text-sm">
            <Link
              className="text-muted-foreground transition-colors hover:text-foreground"
              href="/"
            >
              Home
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium text-foreground">Import</span>
          </nav>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-6 py-12">
        <h1 className="mb-2 font-bold text-3xl">Import a scene</h1>
        <p className="mb-8 text-muted-foreground text-sm">
          Review the file before it becomes a scene. Nothing is created until you confirm.
        </p>
        <ImportClient key={src ?? 'none'} name={name} src={src} />
      </main>
    </div>
  )
}

/**
 * `/import?src=<https-url>[&name=<scene name>]` — client page so static export
 * can ship it without `force-dynamic` / server `searchParams`.
 */
export default function ImportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-muted-foreground text-sm">
          Loading…
        </div>
      }
    >
      <ImportBody />
    </Suspense>
  )
}
