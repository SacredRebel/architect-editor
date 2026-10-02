// Holds the port note against the code it describes: every block of reference numbers in the
// note must be, line for line, what the old editor's own functions print today.
//
//   bun ports/refcases/verify.ts [--note <path>] [--self-test] [--fill]
//
// A block in the note opens with ```refcase <name> and closes with ```; <name>.ts beside this
// file prints it. --self-test forges two faults in the note's text (a changed digit, a line
// taken out) and must see both rejected. --fill writes into every block what the code prints
// now: the numbers are never typed by hand.
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const here = import.meta.dir
const repo = resolve(here, '..', '..')
const args = process.argv.slice(2)
const noteArg = args.indexOf('--note')
const notePath =
  noteArg >= 0 && args[noteArg + 1]
    ? resolve(args[noteArg + 1]!)
    : 'C:\\Playground\\Spatial Map\\spatial-map\\ports\\FROM-ARCHITECT-EDITOR.md'

type Block = { name: string; lines: string[]; at: number }

function blocksOf(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const open = /^```refcase\s+(\S+)\s*$/.exec(lines[i]!)
    if (!open) continue
    const body: string[] = []
    let j = i + 1
    while (j < lines.length && lines[j] !== '```') {
      body.push(lines[j]!)
      j += 1
    }
    blocks.push({ name: open[1]!, lines: body, at: i + 1 })
    i = j
  }
  return blocks
}

const printed = new Map<string, string[]>()

// A block named records/<name> is the record of that name in lane A's vocabulary
// (records/<name>.json, a built/1 file) made by FreeCAD's kernel through freecad/realize.py:
// what the port note says a record means, held against the solids FreeCAD makes of it.
const FREECADCMD =
  process.env.FREECADCMD ?? 'C:\\AI-Work\\Ai apps & Codebase\\FreeCAD\\bin\\freecadcmd.exe'

// The box of every piece of a realized .glb, in the record's own frame (x east, y north, z up):
// the file is glTF, Y up, with +Z the building's −y.
function glbBoxes(path: string): Map<string, string> {
  const boxes = new Map<string, string>()
  if (!existsSync(path)) return boxes
  const raw = readFileSync(path)
  const jsonLength = raw.readUInt32LE(12)
  const gltf = JSON.parse(raw.subarray(20, 20 + jsonLength).toString('utf8')) as {
    nodes: Array<{ mesh?: number; extras?: { piece?: string } }>
    meshes: Array<{ primitives: Array<{ attributes: { POSITION: number } }> }>
    accessors: Array<{ min?: number[]; max?: number[] }>
  }
  const f = (value: number) => (Math.abs(value) < 5e-5 ? 0 : value).toFixed(4)
  for (const node of gltf.nodes) {
    const piece = node.extras?.piece
    if (node.mesh === undefined || !piece) continue
    const accessor = gltf.accessors[gltf.meshes[node.mesh]!.primitives[0]!.attributes.POSITION]
    if (!accessor?.min || !accessor.max) continue
    const [x0, up0, s0] = accessor.min as [number, number, number]
    const [x1, up1, s1] = accessor.max as [number, number, number]
    boxes.set(piece, `x ${f(x0)}..${f(x1)} y ${f(-s1)}..${f(-s0)} z ${f(up0)}..${f(up1)}`)
  }
  return boxes
}

function runRecords(name: string): string[] {
  const records = join(here, `${name}.json`)
  if (!existsSync(records)) throw new Error(`no such records file: ${records}`)
  if (!existsSync(FREECADCMD)) throw new Error(`FreeCAD is not at ${FREECADCMD} (set FREECADCMD)`)
  const out = mkdtempSync(join(tmpdir(), 'port-records-'))
  try {
    const result = Bun.spawnSync(
      [FREECADCMD, join(repo, 'freecad', 'realize.py'), '--pass', records, out],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const line = result.stdout
      .toString()
      .split(/\r?\n/)
      .find((entry) => entry.startsWith('REALIZE '))
    if (!line) throw new Error(`realize.py printed no REALIZE line for ${name}`)
    const made = JSON.parse(line.slice('REALIZE '.length)) as {
      ok: boolean
      complete: boolean
      pieces: number
      solids: number
      notes: string[]
      elements: Array<{ piece: string; type: string; ifcType: string; volume_m3: number }>
    }
    const lines = [
      `ok = ${made.ok}`,
      `complete = ${made.complete}`,
      `pieces = ${made.pieces}`,
      `solids = ${made.solids}`,
      `notes = ${made.notes.length}`,
    ]
    const boxes = glbBoxes(join(out, `${name.replace(/^records\//, '')}.glb`))
    for (const element of [...made.elements].sort((a, b) => (a.piece < b.piece ? -1 : 1))) {
      lines.push(`${element.piece} = ${element.type}, Ifc${element.ifcType}, ${element.volume_m3.toFixed(6)} m3`)
      const box = boxes.get(element.piece)
      if (box) lines.push(`${element.piece}.box = ${box}`)
    }
    return lines
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
}

function run(name: string): string[] {
  const cached = printed.get(name)
  if (cached) return cached
  if (name.startsWith('records/')) {
    const made = runRecords(name)
    printed.set(name, made)
    return made
  }
  const file = join(here, `${name}.ts`)
  if (!existsSync(file)) throw new Error(`no such reference case: ${file}`)
  // from the viewer package: its own setup loads three before the mesh builders ask for it
  const result = Bun.spawnSync(['bun', file], {
    cwd: join(repo, 'packages', 'viewer'),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (result.exitCode !== 0) {
    throw new Error(`${name}.ts ended with ${result.exitCode}: ${result.stderr.toString().slice(0, 400)}`)
  }
  const lines = result.stdout.toString().replace(/\r\n/g, '\n').split('\n')
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  printed.set(name, lines)
  return lines
}

// A line `K.by_equation = …` is K worked out from the note's equations alone. It must give the
// number of the line `K = …` that the old editor's code printed: the same words, every number
// within 2e-6.
const NUMBER = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g

function equationFaults(lines: readonly string[]): { pairs: number; faults: string[] } {
  const said = new Map<string, string>()
  for (const line of lines) {
    const at = line.indexOf(' = ')
    if (at > 0) said.set(line.slice(0, at), line.slice(at + 3))
  }
  const faults: string[] = []
  let pairs = 0
  for (const [key, value] of said) {
    if (!key.endsWith('.by_equation')) continue
    pairs += 1
    const base = key.slice(0, -'.by_equation'.length)
    const code = said.get(base)
    if (code === undefined) {
      faults.push(`${key}: there is no line ${base} to hold it against`)
      continue
    }
    const a = value.match(NUMBER) ?? []
    const b = code.match(NUMBER) ?? []
    const sameWords = value.replace(NUMBER, '#') === code.replace(NUMBER, '#')
    const sameNumbers =
      a.length === b.length && a.every((entry, i) => Math.abs(Number(entry) - Number(b[i])) <= 2e-6)
    if (!sameWords || !sameNumbers) {
      faults.push(`${base}: the code prints ${JSON.stringify(code)}, the note's equation gives ${JSON.stringify(value)}`)
    }
  }
  return { pairs, faults }
}

function compare(block: Block): string | null {
  const now = run(block.name)
  const equations = equationFaults(now)
  if (equations.faults.length > 0) return `an equation of the note does not give the code's number: ${equations.faults[0]}`
  const count = Math.max(now.length, block.lines.length)
  for (let i = 0; i < count; i += 1) {
    if (now[i] !== block.lines[i]) {
      return `line ${i + 1} of the block (the note's line ${block.at + 1 + i}): the note says ${JSON.stringify(block.lines[i] ?? '(nothing)')}, the code prints ${JSON.stringify(now[i] ?? '(nothing)')}`
    }
  }
  return null
}

function judge(text: string, quiet = false): { ok: number; failed: number } {
  const blocks = blocksOf(text)
  let ok = 0
  let failed = 0
  for (const block of blocks) {
    const fault = compare(block)
    if (fault) {
      failed += 1
      if (!quiet) console.log(`FAIL ${block.name}: ${fault}`)
    } else {
      ok += 1
      const pairs = equationFaults(block.lines).pairs
      if (!quiet) {
        console.log(
          `OK   ${block.name}: ${block.lines.length} lines, as the code prints them${pairs > 0 ? `; ${pairs} numbers worked out again from the note's equations agree` : ''}`,
        )
      }
    }
  }
  return { ok, failed }
}

if (!existsSync(notePath)) {
  console.log(`the note is not there: ${notePath}`)
  process.exit(1)
}
let text = readFileSync(notePath, 'utf8')
if (args.includes('--fill')) {
  // write into every block what the code prints now (the prose around the blocks is not touched)
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const open = /^```refcase\s+(\S+)\s*$/.exec(lines[i]!)
    out.push(lines[i]!)
    if (!open) continue
    let j = i + 1
    while (j < lines.length && lines[j] !== '```') j += 1
    out.push(...run(open[1]!))
    out.push('```')
    i = j
  }
  text = out.join('\n')
  writeFileSync(notePath, text, 'utf8')
  console.log(`filled ${blocksOf(text).length} blocks in ${notePath}`)
}
const blocks = blocksOf(text)
const result = judge(text)
const named = new Set(blocks.map((block) => block.name))
const loose = readdirSync(here)
  .filter((file) => /^\d.*\.ts$/.test(file))
  .map((file) => file.replace(/\.ts$/, ''))
  .filter((name) => !named.has(name))
if (loose.length > 0) console.log(`NOTE reference cases not yet in the note: ${loose.join(', ')}`)
if (blocks.length === 0) {
  console.log('verify FAILED: the note holds no reference block')
  process.exit(1)
}
if (result.failed > 0) {
  console.log(`verify FAILED (${result.failed} of ${blocks.length} blocks)`)
  process.exit(1)
}
console.log(`verify OK (${result.ok} blocks, ${blocks.reduce((sum, block) => sum + block.lines.length, 0)} lines)`)

if (args.includes('--self-test')) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const first = blocks[0]!
  // the first line of the first block that holds a digit other than 0
  const target = first.lines.findIndex((line) => /=.*[1-9]/.test(line))
  const at = first.at + target // index in `lines` of that line
  const digitChanged = [...lines]
  digitChanged[at] = digitChanged[at]!.replace(/([1-9])(?=[^1-9]*$)/, (d) => String((Number(d) % 9) + 1))
  const lineGone = [...lines]
  lineGone.splice(at, 1)
  const forged: Array<[string, string]> = [
    ['a digit changed in the note', digitChanged.join('\n')],
    ['a line taken out of the note', lineGone.join('\n')],
  ]
  let caught = 0
  for (const [what, forgedText] of forged) {
    const verdict = judge(forgedText, true)
    const rejected = verdict.failed > 0
    console.log(`SELF-TEST ${rejected ? 'OK  ' : 'FAIL'} ${what} is ${rejected ? 'rejected' : 'NOT rejected'}`)
    caught += rejected ? 1 : 0
  }
  // a wrong equation: what one equation of the note gives, moved by a millimetre
  const withEquations = blocks.find((block) => block.lines.some((line) => /\.by_equation = .*\d/.test(line)))
  let total = forged.length
  if (withEquations) {
    total += 1
    const wrong = [...withEquations.lines]
    const index = wrong.findIndex((line) => /\.by_equation = .*\d/.test(line))
    wrong[index] = wrong[index]!.replace(/(-?\d+\.\d+)(?!.*\d)/, (value) => (Number(value) + 0.001).toFixed(6))
    const rejected = equationFaults(wrong).faults.length > 0
    console.log(`SELF-TEST ${rejected ? 'OK  ' : 'FAIL'} an equation of the note 1 mm off the code is ${rejected ? 'rejected' : 'NOT rejected'}`)
    caught += rejected ? 1 : 0
  }
  console.log(`verify --self-test ${caught === total ? 'OK' : 'FAILED'} (${caught}/${total} forged faults rejected)`)
  if (caught !== total) process.exit(1)
}
