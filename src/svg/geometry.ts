import traced from '../scenes/roseWindow/roseTracery.json'

/**
 * Geometry for the drawn rose window, in SVG units: origin at the rose's
 * centre, +y DOWN, 100 units = the edge of the glazing.
 *
 * The rose's openings are the real ones, traced from a photograph of the
 * south rose of Notre-Dame (tools/trace_rose.py). Everything around it —
 * arch, string course, claire-voie, wall — is drawn with compass and rule
 * the way a mason would set it out.
 */

export const U = 100 // svg units per traced unit
const W = U / 4.5 // svg units per world unit of the 3D version's frame

export interface Opening {
  d: string
  /** distance of the opening's centre from the rose's centre, 0..1 */
  r: number
  theta: number
  /** which ring it belongs to: 0 oculus … 5 outer trefoils */
  ring: number
}

function ringOf(r: number): number {
  if (r < 0.1) return 0
  if (r < 0.45) return 1
  if (r < 0.65) return 2
  if (r < 0.76) return 3
  if (r < 0.86) return 4
  return 5
}

const f = (v: number) => v.toFixed(2)

export const roseOpenings: Opening[] = traced.openings.map((o) => {
  const p = o.points
  let d = `M${f(p[0] * U)} ${f(-p[1] * U)}`
  for (let i = 2; i < p.length; i += 2) d += `L${f(p[i] * U)} ${f(-p[i + 1] * U)}`
  return { d: d + 'Z', r: o.r, theta: o.theta, ring: ringOf(o.r) }
})

export const PLATE_R = traced.plateRadius * U // 109
export const REVEAL_R = 5.56 * W // the circular reveal in the wall, ~124

/** Stone plate: a disc with every opening cut out (fill-rule evenodd). */
export function plateFill(): string {
  const R = PLATE_R
  return `M${-R} 0A${R} ${R} 0 1 0 ${R} 0A${R} ${R} 0 1 0 ${-R} 0Z` + roseOpenings.map((o) => o.d).join('')
}

export function circle(r: number): string {
  return `M${f(-r)} 0A${f(r)} ${f(r)} 0 1 0 ${f(r)} 0A${f(r)} ${f(r)} 0 1 0 ${f(-r)} 0Z`
}

/** The mason's setting-out: concentric rings and the twelve radii. */
export const construction = {
  rings: [0.12, 0.42, 0.66, 0.78, 0.9, 1.0].map((r) => r * U),
  radii: Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2 + Math.PI / 24
    const long = i % 2 === 0
    const r0 = (long ? 0.12 : 0.42) * U
    const r1 = 1.0 * U
    return `M${f(Math.cos(a) * r0)} ${f(Math.sin(a) * r0)}L${f(Math.cos(a) * r1)} ${f(Math.sin(a) * r1)}`
  }),
}

// ---- the frame --------------------------------------------------------------
export const FRAME = {
  half: 5.62 * W, // 125
  point: 0.8 * W, // arcs struck from centres this far off the axis
  stringTop: 5.62 * W,
  stringBottom: 5.98 * W,
  claireTop: 5.98 * W,
  claireBottom: (5.98 + 4.97) * W,
  footY: (5.98 + 4.97) * W,
}

/** One order of the wall arch, `o` units out from the clear opening. */
export function archOrder(o: number): string {
  const { half, point, footY } = FRAME
  const R = half + point + o
  const x = half + o
  const apex = Math.sqrt(R * R - point * point)
  return `M${f(-x)} ${f(footY)}L${f(-x)} 0A${f(R)} ${f(R)} 0 0 1 0 ${f(-apex)}A${f(R)} ${f(R)} 0 0 1 ${f(x)} 0L${f(x)} ${f(footY)}`
}
export const ORDERS = [0, 5, 13, 21, 29]

/** Capitals where each order springs: a bell and an abacus. */
export function capitals(): string {
  let d = ''
  for (const s of [-1, 1]) {
    for (const o of [5, 13, 21]) {
      const x = s * (FRAME.half + o)
      d += `M${f(x - 3.4)} -1.6h6.8v1.6h-6.8Z` // abacus
      d += `M${f(x - 2.6)} 0L${f(x - 1.4)} 5.4h2.8L${f(x + 2.6)} 0` // bell
    }
  }
  return d
}

export function stringCourse(span: number): string {
  const { stringTop: t, stringBottom: b } = FRAME
  return `M${-span} ${f(t)}H${span}M${-span} ${f(t + 2.4)}H${span}M${-span} ${f(b)}H${span}`
}

// ---- claire-voie: paired lancets, eight bays -----------------------------------
function lancet(cx: number, w: number, apexY: number, footY: number): string {
  // equilateral head: each arc struck from the opposite springer
  const rise = w * Math.sin(Math.PI / 3)
  const spring = apexY + rise
  return `M${f(cx - w / 2)} ${f(footY)}L${f(cx - w / 2)} ${f(spring)}A${f(w)} ${f(w)} 0 0 1 ${f(cx)} ${f(apexY)}A${f(w)} ${f(w)} 0 0 1 ${f(cx + w / 2)} ${f(spring)}L${f(cx + w / 2)} ${f(footY)}Z`
}

function quatrefoil(cx: number, cy: number, r: number): string {
  const c = r * 0.55
  let d = ''
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const x = cx + Math.cos(a) * c
    const y = cy + Math.sin(a) * c
    d += `M${f(x - r * 0.5)} ${f(y)}a${f(r * 0.5)} ${f(r * 0.5)} 0 1 0 ${f(r)} 0a${f(r * 0.5)} ${f(r * 0.5)} 0 1 0 ${f(-r)} 0`
  }
  return d
}

export interface Lancet {
  d: string
  /** 0..1 across the row, for staggering */
  x: number
}

export function claireVoie(): { lancets: Lancet[]; foils: string } {
  const bays = 8
  const span = 2 * FRAME.half
  const bay = span / bays
  const major = 0.3 * W
  const minor = 0.16 * W
  const w = (bay - major - minor) / 2
  const top = FRAME.claireTop
  const apexY = top + 1.15 * W
  const footY = top + 4.88 * W
  const lancets: Lancet[] = []
  let foils = ''
  for (let b = 0; b < bays; b++) {
    const x0 = -FRAME.half + b * bay + major / 2
    const c1 = x0 + w / 2
    const c2 = x0 + w + minor + w / 2
    lancets.push({ d: lancet(c1, w, apexY, footY), x: (c1 + FRAME.half) / span })
    lancets.push({ d: lancet(c2, w, apexY, footY), x: (c2 + FRAME.half) / span })
    foils += quatrefoil((c1 + c2) / 2, top + 0.6 * W, 0.12 * W)
  }
  return { lancets, foils }
}

/** Ashlar courses on the wall either side of the frame (+ a few joints). */
export function ashlar(span: number, top: number, bottom: number): string {
  const course = 0.38 * W * 1.6
  const clear = FRAME.half + 34
  let d = ''
  let row = 0
  for (let y = top; y < bottom; y += course, row++) {
    d += `M${-span} ${f(y)}H${f(-clear)}M${f(clear)} ${f(y)}H${span}`
    const len = 1.05 * W * 1.6
    for (let x = clear + ((row * 37) % 23); x < span; x += len * (0.8 + ((row * 13 + x) % 7) / 14)) {
      d += `M${f(x)} ${f(y)}v${f(course)}M${f(-x)} ${f(y)}v${f(course)}`
    }
  }
  return d
}
