/**
 * The rose, set out with compass and rule.
 *
 * The scheme is the south rose of Notre-Dame (c. 1260): a foiled oculus,
 * twelve lights doubling to twenty-four, a ring of quatrefoils and a wreath
 * of trefoils at the rim. Every outline is built from true circles and
 * straight radial bars — no traced pixels — so every line is clean, and every
 * one of the twelve sectors is identical.
 *
 * Units: 100 = the edge of the glazing; +y is down (SVG).
 */

export interface RoseOpening {
  /** exact outline: lines and circular arcs */
  d: string
  /** closed outline sampled as [x, y] pairs (for clearance checks) */
  pts: [number, number][]
  /** 0 oculus, 1 inner lights, 2 outer lights, 3 quatrefoils, 4 roundels, 5 trefoils */
  ring: number
  /** distance of its centre from the rose centre, 0..1 */
  r: number
}

type P = [number, number]
const TAU = Math.PI * 2
const deg = (d: number) => (d * Math.PI) / 180
/** polar → SVG point (angles measured anticlockwise from +x, y down) */
const pol = (a: number, r: number): P => [Math.cos(a) * r, -Math.sin(a) * r]

// Exact SVG commands are recorded alongside the sampled points (the points
// are only used for checking clearances): every curve is drawn as a true arc.
let cmds: string[] = []
const f = (v: number) => v.toFixed(3)

/** Points along a circle from a0 to a1 (radians, either direction). */
function arc(cx: number, cy: number, r: number, a0: number, a1: number, step = 0.6): P[] {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / step))
  const out: P[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  // y-down: increasing angle runs clockwise on screen (sweep-flag 1);
  // split full and large turns so each command is under a half circle
  const parts = Math.ceil(Math.abs(a1 - a0) / Math.PI + 1e-9)
  for (let i = 1; i <= parts; i++) {
    const a = a0 + ((a1 - a0) * i) / parts
    cmds.push(`A${f(r)} ${f(r)} 0 0 ${a1 > a0 ? 1 : 0} ${f(cx + Math.cos(a) * r)} ${f(cy + Math.sin(a) * r)}`)
  }
  return out
}
const lineTo = (p: P) => cmds.push(`L${f(p[0])} ${f(p[1])}`)

/** The intersection of two circles farther from `away`. */
function meet(c1: P, r1: number, c2: P, r2: number, away: P): P {
  const dx = c2[0] - c1[0], dy = c2[1] - c1[1]
  const d = Math.hypot(dx, dy)
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a))
  const mx = c1[0] + (a * dx) / d, my = c1[1] + (a * dy) / d
  const p1: P = [mx + (h * dy) / d, my - (h * dx) / d]
  const p2: P = [mx - (h * dy) / d, my + (h * dx) / d]
  const d1 = Math.hypot(p1[0] - away[0], p1[1] - away[1])
  const d2 = Math.hypot(p2[0] - away[0], p2[1] - away[1])
  return d1 > d2 ? p1 : p2
}

const ang = (c: P, p: P) => Math.atan2(p[1] - c[1], p[0] - c[0])
/** angle a1 brought within ±π of a0, then pushed to go the `dir` way */
function towards(a0: number, a1: number, dir: 1 | -1): number {
  let a = a1
  while (dir > 0 && a <= a0) a += TAU
  while (dir < 0 && a >= a0) a -= TAU
  return a
}

/**
 * Multifoil: n circular lobes of radius rf whose centres lie on a circle of
 * radius c about `ctr`, the first lobe at angle `rot`. The outline is the
 * outer boundary of their union, lobe to lobe through the cusps.
 */
export function multifoil(ctr: P, n: number, c: number, rf: number, rot: number): P[] {
  const cs: P[] = Array.from({ length: n }, (_, k) => {
    const a = rot + (k / n) * TAU
    return [ctr[0] + Math.cos(a) * c, ctr[1] + Math.sin(a) * c]
  })
  const cusps = cs.map((ck, k) => meet(ck, rf, cs[(k + 1) % n], rf, ctr))
  const out: P[] = []
  for (let k = 0; k < n; k++) {
    const from = cusps[(k - 1 + n) % n]
    const to = cusps[k]
    const a0 = ang(cs[k], from)
    out.push(...arc(cs[k][0], cs[k][1], rf, a0, towards(a0, ang(cs[k], to), 1)).slice(0, -1))
  }
  return out
}

/**
 * A light between two radial bars (centred on angle phi, spanning `span`
 * radians between bar centrelines, bars `bar` wide), from rIn up to the
 * springing rS, with a trefoil head: two side lobes and a taller top lobe.
 */
function lobedLight(phi: number, span: number, bar: number, rIn: number, rS: number): P[] {
  const hb = bar / 2
  // a point on the light's side: on the bar at angle th, offset into the light
  const side = (th: number, r: number, inward: 1 | -1): P => {
    const [x, y] = pol(th, r)
    const nx = -Math.sin(th) * inward, ny = -Math.cos(th) * inward // tangential, toward the light
    return [x + nx * hb, y + ny * hb]
  }
  const tA = phi - span / 2 // clockwise bar (right, looking outward)
  const tB = phi + span / 2
  // light-local frame at the springing: u outward along phi, v across
  const U: P = pol(phi, 1)
  const V: P = pol(phi + Math.PI / 2, 1)
  const at = (u: number, v: number): P => [U[0] * u + V[0] * v, U[1] * u + V[1] * v]
  const sR = side(tA, rS, 1)
  const halfW = Math.abs(sR[0] * V[0] + sR[1] * V[1])
  // trefoil head: three equal-ish lobes, all clearly visible
  const b = halfW * 0.5 // side lobes
  const a = halfW * 0.54 // top lobe
  const cR = at(rS, -(halfW - b))
  const cL = at(rS, halfW - b)
  const cT = at(rS + b * 1.3, 0)
  const kR = meet(cR, b, cT, a, at(rS - 10 * halfW, 0))
  const kL = meet(cL, b, cT, a, at(rS - 10 * halfW, 0))

  const out: P[] = []
  // sill: arc along rIn from the left bar to the right bar
  const s0 = side(tB, rIn, -1), s1 = side(tA, rIn, 1)
  const a0 = Math.atan2(s0[1], s0[0])
  out.push(...arc(0, 0, Math.hypot(...s0), a0, towards(a0, Math.atan2(s1[1], s1[0]), 1)))
  // up the right side to the springing
  out.push(sR)
  lineTo(sR)
  // right lobe → cusp → top lobe → cusp → left lobe, all the outer way round
  const r0 = ang(cR, sR)
  out.push(...arc(cR[0], cR[1], b, r0, towards(r0, ang(cR, kR), -1)).slice(1))
  const t0 = ang(cT, kR)
  out.push(...arc(cT[0], cT[1], a, t0, towards(t0, ang(cT, kL), -1)).slice(1))
  const sL = side(tB, rS, -1)
  const l0 = ang(cL, kL)
  out.push(...arc(cL[0], cL[1], b, l0, towards(l0, ang(cL, sL), -1)).slice(1))
  // and back down the left side (the path's close)
  return out
}

// ---- the scheme -------------------------------------------------------------
export const BAR = 2.6 // every bar of tracery, the same dressed width

export function buildRose(): RoseOpening[] {
  const out: RoseOpening[] = []
  const add = (make: () => P[], ring: number) => {
    cmds = []
    const pts = make()
    let cx = 0, cy = 0
    for (const [x, y] of pts) { cx += x; cy += y }
    const d = `M${f(pts[0][0])} ${f(pts[0][1])}` + cmds.join('') + 'Z'
    out.push({ d, pts, ring, r: Math.hypot(cx / pts.length, cy / pts.length) / 100 })
  }

  // oculus: twelve-foil rosette
  add(() => multifoil([0, 0], 12, 9.2, 3.6, 0), 0)

  // twelve inner lights, bars every 30° (one bar straight up)
  for (let k = 0; k < 12; k++) add(() => lobedLight(deg(15 + k * 30), deg(30), BAR, 16.5, 33), 1)

  // twenty-four outer lights, bars every 15°
  for (let k = 0; k < 24; k++) add(() => lobedLight(deg(7.5 + k * 15), deg(15), BAR, 46, 58.5), 2)

  // quatrefoils over the outer lights
  for (let k = 0; k < 24; k++) {
    const a = deg(7.5 + k * 15)
    add(() => multifoil(pol(a, 75.5), 4, 3.1, 3.15, -a + Math.PI / 4), 3)
  }

  // small roundels on the bars, between the quatrefoils
  for (let k = 0; k < 24; k++) {
    const [x, y] = pol(deg(k * 15), 69.3)
    add(() => arc(x, y, 2.1, 0, TAU).slice(0, -1), 4)
  }

  // the wreath: trefoils on the bars, lobe pointing outward
  for (let k = 0; k < 24; k++) {
    const a = deg(k * 15)
    add(() => multifoil(pol(a, 89.4), 3, 3.9, 4.2, -a), 5)
  }
  return out
}

/** Smallest distance between any two outlines (should be ≥ BAR). */
export function minGap(ops: RoseOpening[]): number {
  let best = Infinity
  const segDist = (p: P, a: P, b: P) => {
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
  }
  for (let i = 0; i < ops.length; i++) {
    for (let j = i + 1; j < ops.length; j++) {
      const A = ops[i].pts, B = ops[j].pts
      for (let s = 0; s < A.length; s += 2) {
        for (let t = 0; t < B.length; t++) best = Math.min(best, segDist(A[s], B[t], B[(t + 1) % B.length]))
      }
    }
  }
  return best
}

/** Smallest distance from any outline to the glazing edge (r = 100). */
export function rimGap(ops: RoseOpening[]): number {
  let best = Infinity
  for (const o of ops) for (const [x, y] of o.pts) best = Math.min(best, 100 - Math.hypot(x, y))
  return best
}
