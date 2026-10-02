// What every reference case prints with: one line per number, `key = value`, six decimals,
// so a port in another language can be held against the same text.

type Pointish = { x: number; y: number } | readonly [number, number] | readonly number[]

export function num(value: number, digits = 6): string {
  if (!Number.isFinite(value)) return String(value)
  const fixed = value.toFixed(digits)
  return Number(fixed) === 0 ? (0).toFixed(digits) : fixed
}

export function pt(value: Pointish, digits = 6): string {
  const list = Array.isArray(value)
    ? (value as readonly number[])
    : [(value as { x: number; y: number }).x, (value as { x: number; y: number }).y]
  return `(${list.map((entry) => num(entry, digits)).join(', ')})`
}

export function pts(values: readonly Pointish[], digits = 6): string {
  return values.map((value) => pt(value, digits)).join(' ')
}

export function row(key: string, value: number | string | boolean | null | undefined): void {
  const text = typeof value === 'number' ? num(value) : String(value)
  console.log(`${key} = ${text}`)
}

export function title(text: string): void {
  console.log(`# ${text}`)
}
