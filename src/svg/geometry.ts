import { buildRose } from './rose'

/**
 * Geometry for the drawn rose window, in SVG units: origin at the rose's
 * centre, +y DOWN, 100 units = the edge of the glazing.
 *
 * Everything — the rose (rose.ts, after the south rose of Notre-Dame), the
 * arch, string course, claire-voie and wall — is set out with compass and
 * rule the way a mason would, so every line is a true arc or straight.
 */

export const U = 100 // svg units: 100 = the edge of the glazing
const W = U / 4.5 // svg units per world unit of the 3D version's frame

interface Opening {
  d: string
  /** distance of the opening's centre from the rose's centre, 0..1 */
  r: number
  /** which ring it belongs to: 0 oculus … 5 outer trefoils */
  ring: number
}

const f = (v: number) => v.toFixed(2)

export const roseOpenings: Opening[] = buildRose().map(({ d, r, ring }) => ({ d, r, ring }))

export const PLATE_R = 1.09 * U // the plate runs out to the rim rolls
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
  rings: [0.135, 0.435, 0.665, 0.755, 0.894, 1.0].map((r) => r * U),
  radii: Array.from({ length: 24 }, (_, i) => {
    // the bars: every 30° from the oculus, every 15° beyond the first ring
    const a = (i / 24) * Math.PI * 2
    const long = i % 2 === 0
    const r0 = (long ? 0.135 : 0.435) * U
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

/** The stone between two orders of the arch, as one closed horseshoe. */
export function archBand(o0: number, o1: number): string {
  const { half, point, footY } = FRAME
  const geo = (o: number) => {
    const R = half + point + o
    return { R, x: half + o, apex: Math.sqrt(R * R - point * point) }
  }
  const a = geo(o0), b = geo(o1)
  return (
    `M${f(-b.x)} ${f(footY)}L${f(-b.x)} 0A${f(b.R)} ${f(b.R)} 0 0 1 0 ${f(-b.apex)}A${f(b.R)} ${f(b.R)} 0 0 1 ${f(b.x)} 0L${f(b.x)} ${f(footY)}` +
    `H${f(a.x)}L${f(a.x)} 0A${f(a.R)} ${f(a.R)} 0 0 0 0 ${f(-a.apex)}A${f(a.R)} ${f(a.R)} 0 0 0 ${f(-a.x)} 0L${f(-a.x)} ${f(footY)}Z`
  )
}

/** Voussoir joints through every band of the arch, staggered band to band. */
export function archJoints(): string {
  const { half, point } = FRAME
  let d = ''
  for (let i = 0; i < ORDERS.length - 1; i++) {
    const o0 = ORDERS[i], o1 = ORDERS[i + 1]
    const R0 = half + point + o0, R1 = half + point + o1
    const theta = Math.acos(point / R0) // angle from the springing to the crown, about the arc's centre
    const n = 10
    for (let k = 0; k < n; k++) {
      const t = ((k + (i % 2 ? 0.5 : 0)) / n) * theta
      if (t <= 0 || t >= theta) continue
      for (const s of [-1, 1]) {
        // the arc that springs on this side is struck from the far side of the axis
        const cx = -s * point
        const x0 = cx + s * Math.cos(t) * R0, y0 = -Math.sin(t) * R0
        const x1 = cx + s * Math.cos(t) * R1, y1 = -Math.sin(t) * R1
        d += `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`
      }
    }
    // the crown joint
    const a0 = Math.sqrt(R0 * R0 - point * point), a1 = Math.sqrt(R1 * R1 - point * point)
    if (i % 2 === 0) d += `M0 ${f(-a0)}L0 ${f(-a1)}`
  }
  return d
}

/**
 * Nook shafts at each step of the jamb: where an order springs, a shaft with a
 * foliate bell capital (crockets) and an attic base on a plinth.
 */
export function nookShafts(): { fill: string; ink: string } {
  const { footY } = FRAME
  let fill = '', ink = ''
  const sw = 2.3
  const crocket = (x: number, y0: number, h: number, dir: 1 | -1) =>
    `M${f(x)} ${f(y0)}V${f(y0 - h + 0.9)}a0.95 0.95 0 1 ${dir === 1 ? 1 : 0} ${f(dir * 0.95)} -0.95`
  for (const s of [-1, 1]) {
    for (const o of [5, 13, 21]) {
      const x = s * (FRAME.half + o)
      const yTop = 5.2, yBase = footY - 9
      fill += `M${f(x - sw)} ${f(yTop)}H${f(x + sw)}V${f(yBase)}H${f(x - sw)}Z`
      ink += `M${f(x - sw)} ${f(yTop + 7)}V${f(yBase)}M${f(x + sw)} ${f(yTop + 7)}V${f(yBase)}`
      // abacus, bell, astragal, and three crockets
      ink += `M${f(x - 3.7)} 0h7.4v2.4h-7.4Z`
      ink += `M${f(x - 3)} 2.4C${f(x - 3)} 5.8 ${f(x - sw)} 7 ${f(x - sw)} 8.6M${f(x + 3)} 2.4C${f(x + 3)} 5.8 ${f(x + sw)} 7 ${f(x + sw)} 8.6`
      ink += `M${f(x - 2.7)} 8.6h5.4M${f(x - 2.7)} 9.8h5.4`
      ink += crocket(x - 1.7, 8.2, 4.4, -1) + crocket(x, 8.4, 5.2, 1) + crocket(x + 1.7, 8.2, 4.4, 1)
      // drum joints
      for (let y = yTop + 38; y < yBase - 6; y += 38) ink += `M${f(x - sw)} ${f(y)}H${f(x + sw)}`
      // attic base on a plinth
      ink += `M${f(x - sw)} ${f(yBase)}q-1.4 0.3 -1.4 1.6t1.4 1.9h${f(2 * sw)}q1.4 -0.3 1.4 -1.9t-1.4 -1.6`
      ink += `M${f(x - 4.4)} ${f(yBase + 3.5)}v3.5h8.8v-3.5`
    }
  }
  return { fill, ink }
}

/** A dogtooth band along the string course. */
export function dogtooth(span: number): string {
  const { stringTop: t, stringBottom: b } = FRAME
  const y0 = t + 2.4, step = 4.4
  let d = `M${-span} ${f(b)}`
  for (let x = -span; x < span; x += step) d += `L${f(x + step / 2)} ${f(y0 + 0.5)}L${f(x + step)} ${f(b)}`
  return d
}

/** Voussoirs round the rose: a ring of radial joints between the plate and the reveal. */
export function roseJoints(): string {
  let d = ''
  const n = 48
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n
    d += `M${f(Math.cos(a) * PLATE_R)} ${f(Math.sin(a) * PLATE_R)}L${f(Math.cos(a) * REVEAL_R)} ${f(Math.sin(a) * REVEAL_R)}`
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
  /** centre line, clear width, and the springing of its pointed head */
  cx: number
  w: number
  springY: number
}

export interface Bay {
  /** the arch that holds a pair of lancets, down to the sill */
  arch: string
  /** the stone plate in its head: arch head minus the lancet heads and the oculus (even-odd) */
  plate: string
  /** the pierced oculus */
  oculus: string
  /** its glass: a lobed light */
  foil: string
  cx: number
  cy: number
  /** 0..1 across the row, for staggering */
  x: number
}

export function claireVoie(): { lancets: Lancet[]; bays: Bay[] } {
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
  const out: Bay[] = []
  const head = (cx: number, ww: number, ay: number, sy: number) =>
    `M${f(cx - ww / 2)} ${f(sy)}A${f(ww)} ${f(ww)} 0 0 1 ${f(cx)} ${f(ay)}A${f(ww)} ${f(ww)} 0 0 1 ${f(cx + ww / 2)} ${f(sy)}Z`
  for (let b = 0; b < bays; b++) {
    const x0 = -FRAME.half + b * bay + major / 2
    const c1 = x0 + w / 2
    const c2 = x0 + w + minor + w / 2
    const springY = apexY + w * Math.sin(Math.PI / 3)
    for (const c of [c1, c2]) {
      lancets.push({ d: lancet(c, w, apexY, footY), x: (c + FRAME.half) / span, cx: c, w, springY })
    }
    // one arch over the pair, its head pierced by an oculus
    const m = 1.5
    const xl = c1 - w / 2 - m, xr = c2 + w / 2 + m, ww = xr - xl, mid = (xl + xr) / 2
    const apex = springY - ww * Math.sin(Math.PI / 3)
    const oy = apex + (apexY - apex) * 0.62
    const or = 3.6
    const arch = `M${f(xl)} ${f(footY)}V${f(springY)}A${f(ww)} ${f(ww)} 0 0 1 ${f(mid)} ${f(apex)}A${f(ww)} ${f(ww)} 0 0 1 ${f(xr)} ${f(springY)}V${f(footY)}`
    const oculus = `M${f(mid - or)} ${f(oy)}a${f(or)} ${f(or)} 0 1 0 ${f(2 * or)} 0a${f(or)} ${f(or)} 0 1 0 ${f(-2 * or)} 0Z`
    out.push({
      arch,
      plate: head(mid, ww, apex, springY) + head(c1, w, apexY, springY) + head(c2, w, apexY, springY) + oculus,
      oculus,
      foil: quatrefoil(mid, oy, or * 0.86),
      cx: mid, cy: oy, x: (mid + FRAME.half) / span,
    })
  }
  return { lancets, bays: out }
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
