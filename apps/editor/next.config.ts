import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const appDirectory = path.dirname(fileURLToPath(import.meta.url))
const portableBuild = process.env.PASCAL_PORTABLE_BUILD === '1'
const ecoStatic = process.env.ECO_STATIC === '1'
const ecoBasePath = process.env.ECO_BASE_PATH || '/builder'
// SacredRebel fork: Eco bridge is the product. Default on unless explicitly disabled.
const ecoPublic = process.env.NEXT_PUBLIC_ECO ?? '1'
// SacredRebel eco fork ships VR. Set NEXT_PUBLIC_WEBXR=0 to disable registration.
// Runtime still requires installing the WebXR plugin on the scene.
const webxrPublic = process.env.NEXT_PUBLIC_WEBXR ?? '1'

if (ecoStatic && portableBuild) {
  throw new Error('ECO_STATIC and PASCAL_PORTABLE_BUILD cannot both be set')
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_ECO: ecoPublic,
    NEXT_PUBLIC_WEBXR: webxrPublic,
  },
  ...(ecoStatic
    ? {
        output: 'export' as const,
        basePath: ecoBasePath,
        assetPrefix: ecoBasePath,
        trailingSlash: true,
      }
    : portableBuild
      ? { output: 'standalone' as const, outputFileTracingRoot: path.join(appDirectory, '../..') }
      : {}),
  logging: {
    browserToTerminal: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // MCP / package metadata returns `/editor/<id>` (hosted route). This open-source
  // app serves saved scenes at `/scene/<id>` — redirect so links and bookmarks work.
  // Static export cannot use async redirects(); skip them for ECO_STATIC.
  ...(ecoStatic
    ? {}
    : {
        async redirects() {
          return [
            {
              source: '/editor/:id',
              destination: '/scene/:id',
              permanent: false,
            },
          ]
        },
      }),
  transpilePackages: [
    'three',
    '@pascal-app/viewer',
    '@pascal-app/core',
    '@pascal-app/editor',
    '@pascal-app/mcp',
    '@pascal-app/plugin-pool',
    '@pascal-app/plugin-streetscape',
    '@pascal-app/plugin-trees',
    '@eco/plugin-eco',
    '@mint/pascal-plugin',
    '@pascal-app/plugin-bones',
    '@pascal-app/plugin-environment',
    '@pascal-app/plugin-hagia-sophia',
    '@pascal-app/plugin-geometry',
    '@pascal-app/plugin-body',
    '@pascal-app/ifc-exporter',
    '@webxr/plugin',
    '@dgreenheck/ez-tree',
  ],
  // Node Draco WASM bindings require `fs`; keep them off the client graph.
  serverExternalPackages: ['draco3dgltf'],
  turbopack: {
    resolveAlias: {
      react: './node_modules/react',
      three: './node_modules/three',
      '@react-three/fiber': './node_modules/@react-three/fiber',
      '@react-three/drei': './node_modules/@react-three/drei',
      draco3dgltf: './lib/stubs/draco3dgltf.js',
    },
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  images: {
    unoptimized:
      ecoStatic ||
      portableBuild ||
      (process.env.NEXT_PUBLIC_ASSETS_CDN_URL?.startsWith('http://localhost') ?? false),
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
}

export default nextConfig
