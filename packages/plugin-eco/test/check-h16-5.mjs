#!/usr/bin/env bun
/**
 * H16.5 — IFC 4.3 export + Ventura buildable envelope smoke check.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '../../..')
const fails = []

function ok(cond, msg) {
  if (!cond) fails.push(msg)
  else console.log('OK', msg)
}

const exporter = join(root, 'packages/ifc-exporter')
ok(existsSync(join(exporter, 'src/index.ts')), 'ifc-exporter source')
ok(existsSync(join(exporter, 'NOTICE-web-ifc.md')), 'web-ifc MPL NOTICE')
ok(existsSync(join(exporter, 'package.json')), 'ifc-exporter package.json')

const exporterSrc = readFileSync(join(exporter, 'src/index.ts'), 'utf8')
ok(!exporterSrc.includes('Pset_TR_Zoning'), 'no Turkish Pset_TR_Zoning')
ok(!exporterSrc.includes('TaksMax'), 'no TAKS property')
ok(!exporterSrc.includes('KaksMax'), 'no KAKS property')
ok(exporterSrc.includes('IFC4X3') || exporterSrc.includes('IFC 4.3'), 'IFC 4.3 / IFC4X3')

const pkg = JSON.parse(readFileSync(join(exporter, 'package.json'), 'utf8'))
ok(pkg.dependencies?.['web-ifc'] != null, 'web-ifc dependency unmodified path')

const jurisdiction = readFileSync(
  join(root, 'packages/plugin-eco/src/eco-jurisdiction-ventura.ts'),
  'utf8',
)
ok(jurisdiction.includes('envelope:'), 'Ventura jurisdiction has envelope')
ok(jurisdiction.includes('frontSetbackM'), 'front setback on jurisdiction')
ok(jurisdiction.includes('maxHeightM'), 'height limit on jurisdiction')
ok(!jurisdiction.toLowerCase().includes('taks'), 'no TAKS in jurisdiction')
ok(!jurisdiction.toLowerCase().includes('kaks'), 'no KAKS in jurisdiction')

ok(
  existsSync(join(root, 'packages/plugin-eco/src/envelope/buildable-envelope.ts')),
  'buildable envelope module',
)
ok(
  existsSync(join(root, 'packages/plugin-eco/src/eco-buildable-envelope.tsx')),
  'translucent volume component',
)

const volume = readFileSync(
  join(root, 'packages/plugin-eco/src/eco-buildable-envelope.tsx'),
  'utf8',
)
ok(volume.includes('deriveBuildableEnvelope'), 'volume uses envelope derive')
ok(volume.includes('opacity'), 'translucent material')

const presentation = readFileSync(
  join(root, 'packages/plugin-eco/src/eco-presentation.tsx'),
  'utf8',
)
ok(presentation.includes('EcoBuildableEnvelope'), 'envelope wired into presentation')

const ifcExport = readFileSync(join(root, 'packages/editor/src/lib/ifc-export.ts'), 'utf8')
ok(ifcExport.includes('exportPascalToIfc'), 'editor IFC export helper')

const commands = readFileSync(
  join(root, 'packages/editor/src/components/ui/command-palette/editor-commands.tsx'),
  'utf8',
)
ok(commands.includes('Export IFC 4.3'), 'command palette IFC export')

const editorPkg = JSON.parse(readFileSync(join(root, 'apps/editor/package.json'), 'utf8'))
ok(Boolean(editorPkg.dependencies['@pascal-app/ifc-exporter']), 'apps/editor depends on ifc-exporter')
ok(Boolean(editorPkg.dependencies['web-ifc']), 'apps/editor depends on web-ifc')
ok(existsSync(join(root, 'apps/editor/scripts/copy-web-ifc-wasm.mjs')), 'wasm copy script')

if (fails.length) {
  console.error('FAIL')
  for (const f of fails) console.error('-', f)
  process.exit(1)
}
console.log('check-h16-5 OK')
