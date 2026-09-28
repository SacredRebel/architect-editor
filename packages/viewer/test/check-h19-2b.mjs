#!/usr/bin/env bun
/**
 * H19.2b — AdaptiveDpr decides from GPU render time, not the display timer.
 *
 * Drives the real controller (src/lib/dpr-controller.ts) two ways:
 *   1. forged render times: 30 ms against a 20 ms budget must step down to the
 *      floor; 1 ms must never climb past the ceiling;
 *   2. a closed loop against a GPU whose render passes cost k·dpr² and whose
 *      presentation costs p·dpr² that render timestamps do not see; frames
 *      arrive every max(budget, (k+p)·dpr²). The simulated steady state must
 *      equal the dpr derived in closed form from the same rule, after a heavy
 *      load and on recovery.
 *
 * --self-test swaps in the H17.1 loop (display timer, always climbs), one that
 * ignores the ceiling, and one that reads render time only (never cadence);
 * each must FAIL while the real controller passes.
 */
import { createDprController } from '../src/lib/dpr-controller.ts'

const BUDGET = 20 // ms at the 50 fps cap
const DOWN_AT = 0.8
const UP_AT = 0.5
const MISS_AT = 1.1
const GPU_SHARE = 0.4
const STEP = 0.25
const FLOOR = 1

function check(make, label) {
  const fails = []
  const ok = (cond, msg) => {
    if (!cond) fails.push(`${label}: ${msg}`)
    else console.log('OK', `${label}: ${msg}`)
  }

  // 1a. Forged 30 ms at ceiling 1.5: must step down, and keep stepping to the floor.
  {
    const c = make({ ceiling: 1.5, budgetMs: BUDGET })
    let firstDown = null
    let min = c.dpr
    for (let i = 0; i < 400; i++) {
      const before = c.dpr
      const next = c.sample(30, BUDGET)
      if (next !== null && next < before && firstDown === null) {
        firstDown = { at: i + 1, from: before, to: next }
      }
      min = Math.min(min, c.dpr)
    }
    ok(
      firstDown !== null,
      `forged 30 ms steps down (${firstDown ? `${firstDown.from} -> ${firstDown.to} after ${firstDown.at} samples` : 'never'})`,
    )
    ok(c.dpr === FLOOR && min >= FLOOR, `forged 30 ms settles at the floor ${FLOOR} (got ${c.dpr}, min ${min})`)
  }
  // 1b. Forged 1 ms at the cap: never past the ceiling.
  {
    const c = make({ ceiling: 1.5, budgetMs: BUDGET })
    let max = c.dpr
    for (let i = 0; i < 400; i++) {
      c.sample(1, BUDGET)
      max = Math.max(max, c.dpr)
    }
    ok(max <= 1.5 && c.dpr === 1.5, `forged 1 ms stays at the ceiling 1.5 (max ${max})`)
  }

  // 2. Closed loop; expected dpr in closed form from the same rule.
  const grid = (ceiling) => {
    const g = []
    for (let d = ceiling; d > FLOOR - 1e-9; d = Math.round((d - STEP) * 100) / 100) g.push(d)
    if (g[g.length - 1] !== FLOOR) g.push(FLOOR)
    return g // descending from the ceiling
  }
  const interval = (k, p, d) => Math.max(BUDGET, (k + p) * d * d)
  const stepsDown = (k, p, d) => {
    const render = k * d * d
    const cadence = interval(k, p, d)
    return render > DOWN_AT * BUDGET || (cadence > MISS_AT * BUDGET && render >= GPU_SHARE * cadence)
  }
  const expectAfterLoad = (k, p, ceiling) => {
    for (const d of grid(ceiling)) if (!stepsDown(k, p, d)) return d
    return FLOOR
  }
  const expectRecovery = (k, p, ceiling) => {
    const g = grid(ceiling).reverse()
    let d = g[0]
    for (let i = 1; i < g.length; i++) {
      const missing = interval(k, p, d) > MISS_AT * BUDGET
      if (!missing && k * g[i] * g[i] < UP_AT * BUDGET) d = g[i]
      else break
    }
    return d
  }
  const run = (c, k, p, n) => {
    for (let i = 0; i < n; i++) {
      const jitter = 1 + ((i % 7) - 3) * 0.01
      c.sample(k * c.dpr * c.dpr * jitter, interval(k, p, c.dpr) * jitter)
    }
  }
  const cases = []
  for (const ceiling of [1.5, 2]) {
    for (const k of [2, 5, 8, 12, 20]) cases.push([ceiling, k, 0])
    // Presentation the timestamps cannot see, as measured at 2x on the H19 box.
    for (const k of [3.5, 5]) cases.push([ceiling, k, Number((k * 0.8).toFixed(2))])
  }
  for (const [ceiling, k, p] of cases) {
    const tag = `ceiling ${ceiling}, k ${k}, p ${p}`
    const c = make({ ceiling, budgetMs: BUDGET })
    run(c, k, p, 1200)
    const want = expectAfterLoad(k, p, ceiling)
    ok(c.dpr === want, `${tag}: loop ${c.dpr} = closed form ${want}`)
    if (p > 0) {
      ok(
        interval(k, p, c.dpr) <= MISS_AT * BUDGET || c.dpr === FLOOR,
        `${tag}: frames back at the cap (${interval(k, p, c.dpr).toFixed(1)} ms at dpr ${c.dpr})`,
      )
    }
    // Recovery: a heavy spell pins it to the floor, then the load lightens.
    const r = make({ ceiling, budgetMs: BUDGET })
    run(r, 40, 0, 600)
    run(r, k, p, 1200)
    const back = expectRecovery(k, p, ceiling)
    ok(r.dpr === back, `${tag}: recovery ${r.dpr} = closed form ${back}`)
  }
  return fails
}

// The H17.1 loop: judged by the display timer, every window reads "fast".
function makeDisplayTimer({ ceiling }) {
  let dpr = 1
  let n = 0
  return {
    get dpr() {
      return dpr
    },
    sample() {
      if (++n % 45 !== 0 || dpr >= ceiling) return null
      dpr = Math.min(ceiling, dpr + 0.25)
      return dpr
    },
  }
}
// The real controller with no ceiling.
const makeNoCeiling = (opts) => createDprController({ ...opts, ceiling: 4 })
// The real controller fed render time only: it never sees the cadence.
function makeRenderOnly(opts) {
  const c = createDprController(opts)
  return {
    get dpr() {
      return c.dpr
    },
    sample: (ms) => c.sample(ms),
  }
}

if (process.argv.includes('--self-test')) {
  console.log('check-h19-2b --self-test')
  if (check(createDprController, 'control').length) {
    console.error('SELF-TEST FAIL: the real controller should pass')
    process.exit(1)
  }
  console.log('SELF-TEST OK: real controller passes')
  const forges = [
    ['forge-display-timer', makeDisplayTimer, 'forged 30 ms steps down'],
    ['forge-no-ceiling', makeNoCeiling, 'stays at the ceiling'],
    ['forge-render-only', makeRenderOnly, 'frames back at the cap'],
  ]
  for (const [name, make, needle] of forges) {
    const fails = check(make, name)
    if (!fails.some((f) => f.includes(needle))) {
      console.error(`SELF-TEST FAIL: ${name} was not rejected on "${needle}"`, fails)
      process.exit(1)
    }
    console.log(`SELF-TEST OK: ${name} rejected`)
  }
  console.log('check-h19-2b --self-test OK')
  process.exit(0)
}

const fails = check(createDprController, 'controller')
if (fails.length) {
  console.error('FAIL')
  for (const f of fails) console.error('-', f)
  process.exit(1)
}
console.log('check-h19-2b OK')
