import { ease, ease5, el, lerp, ramp, setOp } from './dom'

/**
 * Scene 3 — the rib vault.
 *
 * A nave of quadripartite bays, built in 3D and drawn in perspective as the
 * viewer walks down it looking up. Each bay is a square of plan 2a × 2a:
 *
 *   – two semicircular diagonal ribs cross and meet at a boss;
 *   – pointed transverse and wall arches (struck from centres a/2 either side
 *     of the axis) rise to exactly the same crown height, because a pointed
 *     arch can be made to reach any height over any span — which is why the
 *     ribs, the arches and the crossing can all meet at one level;
 *   – thin webbing is laid between the ribs, so the whole weight runs down the
 *     ribs to the four piers, and the wall between them is free to be glass.
 *
 * Units: a = 100 (half the nave's width); x across, y up, z down the nave;
 * the ribs spring at y = 0 and the floor is at y = −FLOOR. The projection
 * lands directly in drawing units, so the page camera sits still on this
 * scene and the walk is made here, from `q`.
 */

type V3 = [number, number, number]

const A = 100 // half-width of the nave = half-length of a bay
const BAY = 2 * A
const FLOOR = 330 // springing to floor
const CROWN = Math.SQRT2 * A // every crown reaches this height
const BAYS = 9
/** the far end of the nave sinks into darkness: how much of a bay still shows at depth z */
const fogVis = (z: number) => Math.exp(-Math.max(0, z - 200) / 360)
const GROUND = [0x0d, 0x0b, 0x09], PIER_STONE = [0x22, 0x1c, 0x16]
const F = 470 // focal length, in drawing units
const NEAR = 14
const PIER = 8 // half-width of a pier
const ABACUS = 14 // half-width of the square slab the arcade arches land on
const COLUMN_N = 32 // facets round a column
const PIER_CAP = 12 // half-width of the capital

const GLASS = { cobalt: '#1d3a9e', ruby: '#9c1a24' }

// ---- curves -------------------------------------------------------------------
/** A pointed arch of half-span s: arcs of radius 1.5 s struck from ±s/2 about the axis. Points (x, y). */
function pointed(s: number, n = 40): [number, number][] {
  const r = 1.5 * s
  const phiA = Math.acos(0.5 * s / r)
  const out: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const p = (i / n) * phiA
    out.push([0.5 * s - r * Math.cos(p), r * Math.sin(p)]) // left half, spring → crown
  }
  for (let i = n - 1; i >= 0; i--) {
    const p = (i / n) * phiA
    out.push([-0.5 * s + r * Math.cos(p), r * Math.sin(p)]) // right half, crown → spring
  }
  return out
}
const ARCH = pointed(A)

/** A semicircular rib over the plan chord p → q (peak height `h`). */
function semi(p: V3, q: V3, h: number, n = 64): V3[] {
  const out: V3[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const f = (1 - Math.cos(Math.PI * t)) / 2
    out.push([lerp(p[0], q[0], f), Math.sin(Math.PI * t) * h, lerp(p[2], q[2], f)])
  }
  return out
}

const lerp3 = (p: V3, q: V3, t: number): V3 => [lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)]

/** a lancet in the wall plane, as (u, y): equilateral head */
function lancet(uc: number, w: number, ySill: number, ySpring: number, n = 10): [number, number][] {
  const out: [number, number][] = [[uc - w / 2, ySill], [uc - w / 2, ySpring]]
  for (let i = 1; i <= n; i++) {
    const phi = Math.PI - (i / n) * (Math.PI / 3)
    out.push([uc + w / 2 + w * Math.cos(phi), ySpring + w * Math.sin(phi)])
  }
  for (let i = 1; i <= n; i++) {
    const phi = Math.PI / 3 - (i / n) * (Math.PI / 3)
    out.push([uc - w / 2 + w * Math.cos(phi), ySpring + w * Math.sin(phi)])
  }
  out.push([uc + w / 2, ySill])
  return out
}
const circle2 = (u: number, y: number, r: number, n = 22): [number, number][] =>
  Array.from({ length: n }, (_, i) => [u + Math.cos((i / n) * Math.PI * 2) * r, y + Math.sin((i / n) * Math.PI * 2) * r])

// ---- one bay's geometry (world space, built once) --------------------------------------
const SILL = -62 // clerestory sill
const ARCADE_SPRING = -270
const TRI_SILL = -130 // triforium sill, just over the arcade's crown
const TRI_SPRING = -102 // where the triforium heads spring
/** the height of a course and the length of a stone, in the wall's coursing */
const COURSE = 18
const STONE = 44
const TRI_N = 4 // openings in each bay of the triforium
const TRI_PIER = 12 // width of the stone between them
/** how deep each kind of opening runs into the wall */
const DEPTH = { arcade: PIER_CAP, triforium: 10, clerestory: 10 }
/** how far each opening narrows toward the glass */
const SPLAY = { arcade: 0, triforium: 2, clerestory: 3 }

/**
 * A pier as a stack of rings [half-width, height, round (0) | square (1) | half-round on the nave side (2)], bottom to top.
 * Both below and above the arcade the pier is a round column on one axis.
 */
type Ring = [number, number, 0 | 1 | 2]
interface Pier { px: number; pz: number; rings: Ring[] }

/**
 * The pier as solid stone, seen from the eye at (0, ye, zc): a list of
 * pieces, each the faces of one stage that are turned toward the eye, in the
 * order to paint them (the stages farthest above or below the eye first), so
 * nearer stone covers what is behind it and no hidden edge is drawn.
 */
function pierPieces(pr: Pier, ye: number, zc: number): V3[][][] {
  const { px, pz, rings } = pr
  const eye: V3 = [0, ye, zc]
  /** the ring as a circle of N points, or a square when flagged, anticlockwise seen from above */
  const sx = px < 0 ? 1 : -1 // toward the nave
  const rect = ([h, y, mode]: Ring): V3[] => {
    if (mode === 1) return [[px + h, y, pz - h], [px + h, y, pz + h], [px - h, y, pz + h], [px - h, y, pz - h]]
    // an engaged shaft is a half-round: its flat back lies against the wall
    const half = mode === 2
    const n = half ? COLUMN_N / 2 + 1 : COLUMN_N
    const t0 = half ? (sx > 0 ? -Math.PI / 2 : Math.PI / 2) : 0
    return Array.from({ length: n }, (_, i): V3 => {
      const t = t0 + (i / COLUMN_N) * Math.PI * 2
      return [px + h * Math.cos(t), y, pz + h * Math.sin(t)]
    })
  }
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  const mid = (q: V3[]): V3 => q.reduce((m, v) => [m[0] + v[0] / q.length, m[1] + v[1] / q.length, m[2] + v[2] / q.length], [0, 0, 0] as V3)
  const pieces: { key: number; order: number; faces: V3[][] }[] = []
  const dist = (y0: number, y1: number) => (ye >= Math.min(y0, y1) && ye <= Math.max(y0, y1) ? 0 : Math.min(Math.abs(y0 - ye), Math.abs(y1 - ye)))
  for (let r = 0; r < rings.length - 1; r++) {
    const a = rect(rings[r]), b = rect(rings[r + 1])
    const y0 = rings[r][1], y1 = rings[r + 1][1]
    if (y0 === y1) {
      // a level step: the wider ring's top (or underside) shows if it faces the eye
      const up = rings[r][0] > rings[r + 1][0]
      if (up ? ye > y0 : ye < y0) pieces.push({ key: Math.abs(y0 - ye), order: 1, faces: [up ? a : b] })
      continue
    }
    const centre = mid([...a, ...b])
    const N = a.length
    const vis = a.map((_, i) => {
      const j = (i + 1) % N
      const q = [a[i], a[j], b[j], b[i]]
      const c = mid(q)
      let n = cross(sub(q[1], q[0]), sub(q[3], q[0]))
      const out = sub(c, centre)
      if (dot(n, [out[0], 0, out[2]]) < 0) n = [-n[0], -n[1], -n[2]]
      return dot(n, sub(eye, c)) > 1e-6
    })
    // the turned-toward-eye facets form runs; each run is one face, so the
    // column shows only its outline and no facet seams
    const faces: V3[][] = []
    if (vis.every(Boolean)) faces.push(a, b)
    else if (rings[r][2] === 1 && rings[r + 1][2] === 1) {
      // a square block keeps its arrises: one face per visible side
      for (let i = 0; i < N; i++) if (vis[i]) faces.push([a[i], a[(i + 1) % N], b[(i + 1) % N], b[i]])
    } else {
      for (let s0 = 0; s0 < N; s0++) {
        if (!vis[s0] || vis[(s0 + N - 1) % N]) continue
        let len = 0
        while (vis[(s0 + len) % N]) len++
        const lo: V3[] = [], hi: V3[] = []
        for (let k = 0; k <= len; k++) { lo.push(a[(s0 + k) % N]); hi.unshift(b[(s0 + k) % N]) }
        faces.push([...lo, ...hi])
      }
    }
    pieces.push({ key: dist(y0, y1), order: 0, faces })
  }
  // the top of the stack: shows only from above
  const top = rings[rings.length - 1]
  if (ye > top[1]) pieces.push({ key: Math.abs(top[1] - ye), order: 1, faces: [rect(top)] })
  pieces.sort((p, q) => q.key - p.key || p.order - q.order)
  return pieces.map((p) => p.faces)
}

/**
 * A rib as solid stone: a band of width 2w hanging d below the web along its
 * curve. The curve lies in a vertical plane with horizontal normal h; the
 * soffit (the underside) is the curve moved d toward the arch's centre.
 */
interface Rib {
  /** the edges of the soffit, its centre roll, and the two lines where the rib meets the web */
  sA: V3[]; sB: V3[]; roll: V3[]; wA: V3[]; wB: V3[]
  h: V3
  mid: V3
}
function rib(curve: V3[], h: V3, w: number, d: number, box?: { x: [number, number]; z: [number, number] }): Rib {
  const n = curve.length
  const a = curve[0], b = curve[n - 1]
  const mid: V3 = [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2]
  const off = (p: V3, v: V3, k: number): V3 => [p[0] + v[0] * k, p[1] + v[1] * k, p[2] + v[2] * k]
  // toward the arch's centre: in the rib's plane, square to the curve
  const inward = curve.map((p, i) => {
    const q0 = curve[Math.max(0, i - 1)], q1 = curve[Math.min(n - 1, i + 1)]
    const t: V3 = [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]]
    let v: V3 = [h[1] * t[2] - h[2] * t[1], h[2] * t[0] - h[0] * t[2], h[0] * t[1] - h[1] * t[0]]
    const l = Math.hypot(...v) || 1
    v = [v[0] / l, v[1] / l, v[2] / l]
    const c: V3 = [mid[0] - p[0], mid[1] - p[1], mid[2] - p[2]]
    return v[0] * c[0] + v[1] * c[1] + v[2] * c[2] < 0 ? ([-v[0], -v[1], -v[2]] as V3) : v
  })
  // the soffit hangs below the curve, so at a springer, where the curve leans, it would
  // dip beneath the capital it sits on: it stops on the capital's top instead
  // a band that would stray outside the bay's own footprint (into the wall, past the
  // transverse arch) is folded back onto its edge, so it ends on the capital, not beside it
  const sit = (q: V3): V3 => [
    box ? Math.min(box.x[1], Math.max(box.x[0], q[0])) : q[0],
    Math.max(0, q[1]),
    box ? Math.min(box.z[1], Math.max(box.z[0], q[2])) : q[2],
  ]
  return {
    sA: curve.map((p, i) => sit(off(off(p, inward[i], d), h, w))),
    sB: curve.map((p, i) => sit(off(off(p, inward[i], d), h, -w))),
    roll: curve.map((p, i) => sit(off(p, inward[i], d))),
    wA: curve.map((p) => sit(off(p, h, w))),
    wB: curve.map((p) => sit(off(p, h, -w))),
    h, mid,
  }
}
/** rib sizes: the transverse arches are the heaviest, the wall ribs the lightest */
const RIB_T = { w: 6, d: 9 }
const RIB_D = { w: 4.5, d: 6.5 }
const RIB_W = { w: 3, d: 4.5 }

/**
 * The depth of an opening: its outline on the face of the wall (x = ±A) run
 * back through the wall's thickness, splayed so the opening narrows toward the
 * glass. Each straight piece of the outline gives one face of the reveal, with
 * its normal pointing into the opening, so only the faces turned toward the
 * eye are painted. `order` is the line where the reveal steps back, a third of
 * the way in.
 */
interface Reveal { quads: V3[][]; n: V3[]; front: V3[]; back: V3[]; order: V3[]; closed: boolean; corners: number[] }
/** at each point of an outline, the mitred direction into the shape, of length 1 across each side */
function mitre(pts: [number, number][], closed: boolean): [number, number][] {
  const N = pts.length
  const cu = pts.reduce((a, [u]) => a + u / N, 0), cy = pts.reduce((a, [, y]) => a + y / N, 0)
  // each segment's normal, pointing into the shape
  const segN = (i: number): [number, number] => {
    const j = (i + 1) % N
    const du = pts[j][0] - pts[i][0], dy = pts[j][1] - pts[i][1]
    const l = Math.hypot(du, dy) || 1
    let nu = -dy / l, ny = du / l
    const mu = (pts[i][0] + pts[j][0]) / 2, my = (pts[i][1] + pts[j][1]) / 2
    if (nu * (cu - mu) + ny * (cy - my) < 0) { nu = -nu; ny = -ny }
    return [nu, ny]
  }
  return pts.map((_, i): [number, number] => {
    const has0 = closed || i > 0, has1 = closed || i < N - 1
    const a = has0 ? segN((i - 1 + N) % N) : segN(i), b = has1 ? segN(i) : a
    const mu = a[0] + b[0], my = a[1] + b[1]
    const l = Math.hypot(mu, my) || 1
    const k = 1 / Math.max(0.5, (mu / l) * a[0] + (my / l) * a[1])
    return [(mu / l) * k, (my / l) * k]
  })
}
/** an outline moved d into itself */
const inset = (pts: [number, number][], d: number): [number, number][] => {
  const n = mitre(pts, true)
  return pts.map(([u, y], i) => [u + n[i][0] * d, y + n[i][1] * d])
}

function reveal(s: -1 | 1, zm: number, pts: [number, number][], depth: number, splay: number, closed: boolean): Reveal {
  const N = pts.length
  const cu = pts.reduce((a, [u]) => a + u / N, 0), cy = pts.reduce((a, [, y]) => a + y / N, 0)
  // at each point, the direction the splay draws it in
  const ptN = mitre(pts, closed)
  const at = (f: number) => pts.map(([u, y], i): V3 => [s * (A + depth * f), y + ptN[i][1] * splay * f, zm + u + ptN[i][0] * splay * f])
  const front = at(0), back = at(1), order = at(0.35)
  const axis: V3 = [s * (A + depth / 2), cy, zm + cu]
  const quads: V3[][] = [], n: V3[] = []
  for (let i = 0; i < (closed ? N : N - 1); i++) {
    const j = (i + 1) % N
    const q = [front[i], front[j], back[j], back[i]]
    const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], e2 = [q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]]
    let v: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
    const c = lerp3(q[0], q[2], 0.5)
    if (v[0] * (axis[0] - c[0]) + v[1] * (axis[1] - c[1]) + v[2] * (axis[2] - c[2]) < 0) v = [-v[0], -v[1], -v[2]]
    quads.push(q)
    n.push(v)
  }
  // the sharp corners of the outline (a sill's ends, a head's apex), where the reveal has an arris
  const corners: number[] = []
  for (let i = closed ? 0 : 1; i < (closed ? N : N - 1); i++) {
    const a = pts[(i - 1 + N) % N], b = pts[i], c = pts[(i + 1) % N]
    const t1 = Math.atan2(b[1] - a[1], b[0] - a[0]), t2 = Math.atan2(c[1] - b[1], c[0] - b[0])
    const turn = Math.abs(((t2 - t1 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI)
    if (turn > 1.2) corners.push(i)
  }
  return { quads, n, front, back, order, closed, corners }
}

/** the part of the line p→q inside a convex outline (Cyrus–Beck), or null */
function clipToConvex(poly: [number, number][], p: [number, number], q: [number, number]): [[number, number], [number, number]] | null {
  const n = poly.length
  const cu = poly.reduce((a, [u]) => a + u / n, 0), cy = poly.reduce((a, [, y]) => a + y / n, 0)
  let t0 = 0, t1 = 1
  const d = [q[0] - p[0], q[1] - p[1]]
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n]
    let nu = -(b[1] - a[1]), ny = b[0] - a[0]
    if (nu * (cu - a[0]) + ny * (cy - a[1]) < 0) { nu = -nu; ny = -ny }
    const num = nu * (p[0] - a[0]) + ny * (p[1] - a[1]), den = nu * d[0] + ny * d[1]
    if (Math.abs(den) < 1e-9) { if (num < 0) return null; continue }
    const t = -num / den
    if (den > 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return null
  }
  return [[p[0] + d[0] * t0, p[1] + d[1] * t0], [p[0] + d[0] * t1, p[1] + d[1] * t1]]
}

/**
 * Stained glass for a light, as in the arch scene: a cobalt ground leaded in
 * diamond quarries inside a ruby border. Each layer is a list of outlines in
 * the plane of the glass; `lead` is the leading, as lines, and `panes` the
 * lights themselves (each takes its own sheen).
 */
interface Glass { cobalt: P2[][]; ruby: P2[][]; lead: P2[][]; panes: P2[][] }
type P2 = [number, number]
type Glass3 = Record<keyof Glass, V3[][]>
function stainedGlass(out: P2[], step: number): Glass {
  const n = out.length
  const mid: P2 = [out.reduce((a, [u]) => a + u / n, 0), out.reduce((a, [, y]) => a + y / n, 0)]
  const inner = inset(out, step * 0.5)
  const lead: P2[][] = [[...inner, inner[0]]]
  // the quarries: two families of diagonals, clipped to the field inside the border
  for (const dir of [1, -1]) {
    for (let c = -120; c <= 120; c += step) {
      const p: P2 = [mid[0] + c - 80 * dir, mid[1] - 80], q: P2 = [mid[0] + c + 80 * dir, mid[1] + 80]
      const seg = clipToConvex(inner, p, q)
      if (seg) lead.push(seg)
    }
  }
  return { cobalt: [out], ruby: [out, inner], lead, panes: [out] }
}

interface BayGeo {
  z0: number
  transverseS: V3[]
  transverseN: V3[]
  wallW: V3[]
  wallE: V3[]
  d1: V3[]
  d2: V3[]
  cells: V3[][] // W, E, S, N
  courses: V3[][]
  /** the coursing of the walls: faint bed and stagger joints on the wall faces */
  bricks: V3[][]
  boss: V3[][]
  ribs: Rib[]
  wallLines: V3[][]
  piers: Pier[]
  platePolys: V3[][]
  /** the triforium's wall: the plate over the arcade with its openings */
  plateLow: V3[][]
  reveals: Reveal[]
  /** the stained glass of every window, at the back of the wall */
  glass: Glass3
  flow: V3[][]
  /** shafts of daylight from the clerestory lights, [gold, blue] */
  rays: [V3[][], V3[][]]
}

/** convex hull (monotone chain) of tagged points in the (u, y) plane */
function hull2<T extends [number, number, number]>(pts: T[]): T[] {
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cr = (o: T, a: T, b: T) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo: T[] = [], hi: T[] = []
  for (const p of P) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p) }
  for (const p of P.slice().reverse()) { while (hi.length > 1 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p) }
  return lo.slice(0, -1).concat(hi.slice(0, -1))
}

function bayGeo(k: number): BayGeo {
  const z0 = k * BAY
  const zm = z0 + A
  const tr = (z: number): V3[] => ARCH.map(([x, y]) => [x, y, z])
  const wall = (s: -1 | 1): V3[] => ARCH.map(([u, y]) => [s * A, y, zm + u])
  const SW: V3 = [-A, 0, z0], SE: V3 = [A, 0, z0], NW: V3 = [-A, 0, z0 + BAY], NE: V3 = [A, 0, z0 + BAY]
  const d1 = semi(SW, NE, CROWN), d2 = semi(SE, NW, CROWN)
  const m = (d1.length - 1) / 2
  const rev = (a: V3[]) => a.slice().reverse()
  const transverseS = tr(z0), transverseN = tr(z0 + BAY), wallW = wall(-1), wallE = wall(1)
  const cells: V3[][] = [
    // west: wall SW→NW, then NW→crown along d2, crown→SW along d1
    [...wallW, ...rev(d2.slice(m)), ...rev(d1.slice(0, m + 1))],
    [...wallE, ...rev(d1.slice(m)), ...rev(d2.slice(0, m + 1))],
    [...transverseS, ...d2.slice(0, m + 1), ...rev(d1.slice(0, m + 1))],
    [...transverseN, ...rev(d1.slice(m)), ...d2.slice(m)],
  ]
  const crown = d1[m]
  // courses of the webbing: each follows its cell's rim, raised toward the
  // crown, and runs from one diagonal rib to the other, ending on both
  const half = { SW: d1.slice(0, m + 1), NE: rev(d1.slice(m)), SE: d2.slice(0, m + 1), NW: rev(d2.slice(m)) }
  /** the point on a half-rib (springer → crown) at height y */
  const onRib = (hr: V3[], y: number): V3 => {
    const f = (2 / Math.PI) * Math.asin(Math.min(1, y / CROWN)) * m
    const i = Math.min(m - 1, Math.floor(f))
    return lerp3(hr[i], hr[i + 1], f - i)
  }
  const courses: V3[][] = []
  for (const [rim, a, b] of [[wallW, half.SW, half.NW], [wallE, half.SE, half.NE], [transverseS, half.SW, half.SE], [transverseN, half.NW, half.NE]] as const) {
    for (const l of [0.33, 0.66]) {
      const y = l * CROWN
      const s0 = lerp3(rim[0], crown, l), s1 = lerp3(rim[rim.length - 1], crown, l)
      const e0 = onRib(a, y), e1 = onRib(b, y)
      courses.push(rim.map((p, i) => {
        const t = i / (rim.length - 1)
        const q = lerp3(p, crown, l)
        return [q[0] + (1 - t) * (e0[0] - s0[0]) + t * (e1[0] - s1[0]), q[1] + (1 - t) * (e0[1] - s0[1]) + t * (e1[1] - s1[1]), q[2] + (1 - t) * (e0[2] - s0[2]) + t * (e1[2] - s1[2])]
      }))
    }
  }
  const ring = (r: number, y: number): V3[] =>
    Array.from({ length: 21 }, (_, i) => [Math.cos((i / 20) * Math.PI * 2) * r, y, Math.sin((i / 20) * Math.PI * 2) * r + zm] as V3)
  // the boss: a carved stone at the crossing, at the level of the ribs' soffits
  const boss = [ring(10, CROWN - RIB_D.d - 1.5), ring(5, CROWN - RIB_D.d - 2.5)]
  const s2 = Math.SQRT1_2
  const inBay = { x: [-A, A] as [number, number], z: [z0, z0 + BAY] as [number, number] }
  // painted in this order: wall ribs, diagonals, then the far transverse arch
  // (this bay's near one belongs to the bay in front, except for the first)
  const ribs: Rib[] = [
    // a wall rib stands proud of the wall: its band lies wholly on the nave side
    rib(wallW.map(([x, y, z]): V3 => [x + RIB_W.w, y, z]), [1, 0, 0], RIB_W.w, RIB_W.d, inBay),
    rib(wallE.map(([x, y, z]): V3 => [x - RIB_W.w, y, z]), [-1, 0, 0], RIB_W.w, RIB_W.d, inBay),
    rib(d1, [s2, 0, -s2], RIB_D.w, RIB_D.d, inBay), rib(d2, [s2, 0, s2], RIB_D.w, RIB_D.d, inBay),
    rib(transverseN, [0, 0, 1], RIB_T.w, RIB_T.d),
    ...(k === 0 ? [rib(transverseS, [0, 0, 1], RIB_T.w, RIB_T.d)] : []),
  ]

  // piers at the bay's front corners: a shaft, a capital where the arcade
  // springs, a capital under the vault, and a moulded base on a plinth
  const piers: Pier[] = ([[-A, z0], [A, z0]] as const).map(([px, pz]) => ({
    px, pz,
    // only the first pair, at the head of the nave, stand free: every later pier is
    // built into the arcade wall, so its round parts show only on the nave side;
    // the first pair are round from base to vault capital
    rings: ([
      // plinth, base, shaft up to the arcade capital
      [PIER + 8, -FLOOR, 0], [PIER + 8, -FLOOR + 11, 0], [PIER + 5.5, -FLOOR + 11, 0],
      [PIER + 5.5, -FLOOR + 26, 0], [PIER, -FLOOR + 26, 0],
      // arcade capital: bell and abacus; the arcade arches land on it
      [PIER, ARCADE_SPRING - 16, 0], [PIER + 2, ARCADE_SPRING - 16, 0], [PIER + 2, ARCADE_SPRING - 13, 0],
      [PIER, ARCADE_SPRING - 13, 0], [PIER_CAP, ARCADE_SPRING - 5, 0], [PIER_CAP, ARCADE_SPRING - 4, 0],
      [ABACUS, ARCADE_SPRING - 4, 1], [ABACUS, ARCADE_SPRING - 2, 1], [ABACUS - 2.5, ARCADE_SPRING, 1],
      // the vaulting shaft, engaged in the wall, runs on up to the vault capital
      [PIER, ARCADE_SPRING, 2], [PIER, -12, 2], [PIER_CAP, -2, 2], [PIER_CAP + 1.5, -2, 2], [PIER_CAP + 1.5, 0, 2],
    ] as Ring[]).map(([h, y, m]): Ring => [h, y, k === 0 ? (m === 2 ? 0 : m) : (m === 0 ? 2 : m)]),
  }))

  // the walls: arcade below, clerestory above the string course
  const wallLines: V3[][] = []
  const bricks: V3[][] = []
  const plates: V3[][] = []
  const plateLow: V3[][] = []
  const reveals: Reveal[] = []
  const glass: Glass3 = { cobalt: [], ruby: [], lead: [], panes: [] }
  /** glaze an opening: its outline drawn in by the splay, at the back of a wall `depth` thick */
  const glaze = (s: -1 | 1, pts: P2[], depth: number, splay: number, step: number) => {
    const gl = stainedGlass(inset(pts, splay), step)
    const back = (q: P2[]): V3[] => q.map(([u, y]) => [s * (A + depth), y, zm + u])
    for (const key of Object.keys(glass) as (keyof Glass)[]) glass[key].push(...gl[key].map(back))
  }
  const onWall = (s: -1 | 1, pts: [number, number][]): V3[] => pts.map(([u, y]) => [s * A, y, zm + u])
  const rays: [V3[][], V3[][]] = [[], []]
  // daylight through a clerestory light falls inward and down: the sweep of the opening
  const RAY_DROP = 230, RAY_IN = 0.62, RAY_FWD = 0.1
  const shaft = (s: -1 | 1, uc: number, l: [number, number][], into: V3[][]) => {
    const x0 = s * (A + DEPTH.clerestory)
    // tag 0: at the glass; tag 1: carried down the ray
    const pts: [number, number, number][] = [...l.map(([u, y]): [number, number, number] => [u, y, 0]), ...l.map(([u, y]): [number, number, number] => [uc + (u - uc) * 0.7 + RAY_FWD * RAY_DROP, y - RAY_DROP, 1])]
    into.push(hull2(pts).map(([u, y, t]): V3 => [x0 - s * RAY_IN * RAY_DROP * t, y, zm + u]))
  }
  for (const s of [-1, 1] as const) {
    // the coursing: beds across the whole face between the piers, and stagger joints
    // between them, half a stone out of step from one course to the next. The face's
    // own outline and its openings trim them (see the clip on the bay's bricks).
    for (let i = 0, y = ARCADE_SPRING; y < 150; i++, y += COURSE) {
      bricks.push(onWall(s, [[-A + PIER, y], [A - PIER, y]]))
      for (let u = -A + PIER + (i % 2 ? STONE / 2 : STONE); u < A - PIER; u += STONE) bricks.push(onWall(s, [[u, y], [u, y + COURSE]]))
    }
    // the arcade: a pointed arch from capital to capital
    const aw = pointed(A - PIER - 2).map(([u, y]): [number, number] => [u, y + ARCADE_SPRING])
    // its jambs run straight down to the floor, so the opening is closed all round
    const awf: [number, number][] = [[aw[0][0], -FLOOR], ...aw, [aw[aw.length - 1][0], -FLOOR]]
    wallLines.push(onWall(s, awf))
    reveals.push(reveal(s, zm, awf, DEPTH.arcade, SPLAY.arcade, false))
    // the wall over the arcade, up to the clerestory sill: solid, pierced by the triforium
    plateLow.push(onWall(s, [[-A + PIER, SILL], [-A + PIER, ARCADE_SPRING], ...aw, [A - PIER, ARCADE_SPRING], [A - PIER, SILL]]))
    // triforium: a string course, then five pointed openings on colonnettes
    wallLines.push(onWall(s, [[-A + PIER, TRI_SILL], [A - PIER, TRI_SILL]]))
    const tw = (2 * (A - PIER) - (TRI_N + 1) * TRI_PIER) / TRI_N
    for (let i = 0; i < TRI_N; i++) {
      const uc = -A + PIER + TRI_PIER + tw / 2 + i * (tw + TRI_PIER)
      const t = lancet(uc, tw, TRI_SILL, TRI_SPRING)
      plateLow.push(onWall(s, t))
      wallLines.push(onWall(s, [...t, t[0]]))
      reveals.push(reveal(s, zm, t, DEPTH.triforium, SPLAY.triforium, true))
      glaze(s, t, DEPTH.triforium, SPLAY.triforium, 8)
    }
    // clerestory sill: two strings, the whole width of the bay between the piers
    wallLines.push(onWall(s, [[-A + PIER, SILL], [A - PIER, SILL]]), onWall(s, [[-A + PIER, SILL - 7], [A - PIER, SILL - 7]]))
    // the floor, along the foot of the arcade from plinth to plinth
    wallLines.push(onWall(s, [[-A + PIER + 2, -FLOOR], [A - PIER - 2, -FLOOR]]))
    // clerestory: stone from the sill up to the wall arch, pierced by two lancets and an oculus
    plates.push(onWall(s, [[-A + PIER, SILL], [-A + PIER, 0], ...ARCH, [A - PIER, 0], [A - PIER, SILL]]))
    // where the wall meets the pier, from the arcade capital up to the vault capital
    for (const u of [-A + PIER, A - PIER]) wallLines.push(onWall(s, [[u, ARCADE_SPRING], [u, -12]]))
    for (const uc of [-27, 27]) {
      const l = lancet(uc, 40, SILL, 6)
      const r = reveal(s, zm, l, DEPTH.clerestory, SPLAY.clerestory, true)
      glaze(s, l, DEPTH.clerestory, SPLAY.clerestory, 11)
      // the light comes from one side only: the right-hand windows
      if (s === 1) shaft(s, uc, l, rays[uc < 0 ? 0 : 1])
      plates.push(onWall(s, l))
      wallLines.push(onWall(s, [...l, l[0]]))
      reveals.push(r)
    }
    const o = circle2(0, 88, 15)
    const ro = reveal(s, zm, o, DEPTH.clerestory, SPLAY.clerestory, true)
    glaze(s, o, DEPTH.clerestory, SPLAY.clerestory, 9)
    plates.push(onWall(s, o))
    wallLines.push(onWall(s, [...o, o[0]]))
    reveals.push(ro)
  }

  // the thrust: down each half-rib from the crown, then down the pier to the floor
  const flow: V3[][] = []
  const halves: [V3[], V3][] = [[d1.slice(0, m + 1).reverse(), SW], [d1.slice(m), NE], [d2.slice(0, m + 1).reverse(), SE], [d2.slice(m), NW]]
  for (const [rib, foot] of halves) {
    flow.push([...rib, [foot[0], -FLOOR * 0.5, foot[2]] as V3, [foot[0], -FLOOR + 4, foot[2]] as V3])
  }
  return {
    z0, transverseS, transverseN, wallW, wallE, d1, d2, cells, courses, boss, ribs, wallLines, piers,
    platePolys: plates, plateLow, bricks, reveals, glass, flow, rays,
  }
}

// ---- projection -----------------------------------------------------------------
interface Pose { zc: number; ye: number; pitch: number; yaw: number }

export const POSE0: Pose = { zc: -250, ye: -300, pitch: 0.42, yaw: 0 }
function pose(q: number): Pose {
  const w = ease(ramp(q, 0.04, 0.96))
  const turn = ease5(ramp(q, 0.12, 0.96))
  // walk in, look up, and turn toward the wall to bring its windows round to face us
  return { zc: lerp(POSE0.zc, -30, w), ye: lerp(POSE0.ye, -290, w), pitch: lerp(POSE0.pitch, 0.64, turn), yaw: lerp(0, -0.56, turn) }
}

function makeProjector(p: Pose) {
  const c = Math.cos(p.pitch), s = Math.sin(p.pitch)
  const cyw = Math.cos(p.yaw), syw = Math.sin(p.yaw)
  const cam = (v: V3): V3 => {
    const dy = v[1] - p.ye, dz = v[2] - p.zc
    const x1 = v[0] * cyw - dz * syw, z1 = v[0] * syw + dz * cyw
    return [x1, dy * c - z1 * s, dy * s + z1 * c]
  }
  const sc = (v: V3) => `${((F * v[0]) / v[2]).toFixed(1)} ${((-F * v[1]) / v[2]).toFixed(1)}`
  const cut = (a: V3, b: V3): V3 => {
    const t = (NEAR - a[2]) / (b[2] - a[2])
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), NEAR]
  }
  /** a polyline, cut at the near plane */
  const line = (pts: V3[]): string => {
    let d = ''
    let pen = false
    let prev = cam(pts[0])
    for (let i = 1; i < pts.length; i++) {
      const cur = cam(pts[i])
      const ia = prev[2] >= NEAR, ib = cur[2] >= NEAR
      if (ia && ib) {
        if (!pen) d += `M${sc(prev)}`
        d += `L${sc(cur)}`
        pen = true
      } else if (ia) {
        if (!pen) d += `M${sc(prev)}`
        d += `L${sc(cut(prev, cur))}`
        pen = false
      } else if (ib) {
        d += `M${sc(cut(prev, cur))}L${sc(cur)}`
        pen = true
      } else pen = false
      prev = cur
    }
    return d
  }
  /** a closed polygon, clipped to the near plane (Sutherland–Hodgman) */
  const poly = (pts: V3[]): string => {
    const cs = pts.map(cam)
    const out: V3[] = []
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i], b = cs[(i + 1) % cs.length]
      const ia = a[2] >= NEAR, ib = b[2] >= NEAR
      if (ia) out.push(a)
      if (ia !== ib) out.push(cut(a, b))
    }
    return out.length < 3 ? '' : `M${out.map(sc).join('L')}Z`
  }
  return { line, poly }
}

// ---- the scene ----------------------------------------------------------------------
export function buildVaultScene(parent: Element, defs: Element) {
  const g = el('g', { class: 'layer vault-scene' }, parent)
  // the walls and piers dissolve toward the bottom of the screen, rather than running off it
  const fade = el('linearGradient', { id: 'vault-fade', gradientUnits: 'userSpaceOnUse', x1: 0, y1: -60, x2: 0, y2: 330 }, defs)
  el('stop', { offset: 0, 'stop-color': '#d9ccb2' }, fade)
  el('stop', { offset: 1, 'stop-color': '#d9ccb2', 'stop-opacity': 0 }, fade)
  // beams fade from the glass as they travel
  for (const [id, c] of [['gold', '#ffcf86'], ['blue', '#7f9bff']]) {
    const gr = el('linearGradient', { id: `vault-ray-${id}`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs)
    el('stop', { offset: 0, 'stop-color': c, 'stop-opacity': 0.26 }, gr)
    el('stop', { offset: 0.55, 'stop-color': c, 'stop-opacity': 0.07 }, gr)
    el('stop', { offset: 1, 'stop-color': c, 'stop-opacity': 0 }, gr)
  }
  const geos = Array.from({ length: BAYS }, (_, k) => bayGeo(k))

  interface BayEls {
    g: SVGGElement
    webA: SVGPathElement; webB: SVGPathElement; plate: SVGPathElement; plateLow: SVGPathElement
    /** the stained glass: ground, border, leading, and a sheen on each pane */
    glass: { cobalt: SVGPathElement; ruby: SVGPathElement; lead: SVGPathElement; panes: SVGPathElement[] }
    /** the openings' reveals: each its faces and its edges, clipped to its own opening */
    revs: [SVGPathElement, SVGPathElement, SVGPathElement, SVGPathElement][]
    courses: SVGPathElement; walls: SVGPathElement
    bricks: SVGPathElement; wallClip: [SVGPathElement, SVGPathElement]
    /** per rib: its visible side, its soffit, and its ink */
    ribs: [SVGPathElement, SVGPathElement, SVGPathElement][]
    rays: [SVGPathElement, SVGPathElement]
    ribHi: SVGPathElement; bossFill: SVGPathElement; boss: SVGPathElement; flow: SVGPathElement
    /** a veil of the ground colour over this bay and all beyond it */
    veil: SVGRectElement
  }
  // the ribs in painting order: wall ribs, diagonals and the gilded roll on
  // them, then the transverse arches, which stand in front at the springers
  const ribEls = (n: number, mk: (cls: string) => SVGPathElement) => {
    const ribs: BayEls['ribs'] = []
    let ribHi: SVGPathElement | undefined
    for (let i = 0; i < n; i++) {
      ribs.push([mk('rib-side'), mk('rib-soffit'), mk('ink fine')])
      if (i === 3) ribHi = mk('ink rib')
    }
    return { ribs, ribHi: ribHi! }
  }
  // far to near, so nearer bays paint over farther ones
  const els: BayEls[] = []
  for (let k = BAYS - 1; k >= 0; k--) {
    const bg = el('g', {}, g)
    const mk = (cls: string, extra: Record<string, string | number> = {}) => el('path', { class: cls, ...extra }, bg)
    els[k] = {
      g: bg,
      // the panels are tinted so each plane of the vault reads on its own: the
      // webbing in warm sandstone, alternating from bay to bay, the triforium wall
      // a shade lighter than the clerestory above it
      webA: mk('stone a', { style: `fill:${k % 2 ? '#2d2418' : '#1b160f'}` }),
      webB: mk('stone b', { style: `fill:${k % 2 ? '#1b160f' : '#2d2418'}` }),
      // through the openings: the glass at the back of the wall, then the reveals, then the wall's face
      glass: {
        cobalt: mk('', { fill: GLASS.cobalt }), ruby: mk('', { fill: GLASS.ruby, 'fill-rule': 'evenodd' }), lead: mk('lead'),
        panes: geos[k].glass.panes.map(() => mk('', { fill: 'url(#pane-light)' })),
      },
      // (the reveals' edges go under the face too: where a reveal runs on behind it, so do they)
      revs: geos[k].reveals.map((_, i) => {
        const id = `vault-win-${k}-${i}`
        const win = el('path', {}, el('clipPath', { id }, defs))
        const clip = { 'clip-path': `url(#${id})` }
        return [mk('reveal', clip), mk('ink fine fadeout', clip), mk('ink fadeout step', clip), win] as [SVGPathElement, SVGPathElement, SVGPathElement, SVGPathElement]
      }),
      plateLow: mk('stone b', { 'fill-rule': 'evenodd', style: 'fill:#251d14' }),
      plate: mk('stone b', { 'fill-rule': 'evenodd', style: 'fill:#15120e' }),
      // the coursing is trimmed to the stone of the wall: the plates, openings cut out
      ...(() => {
        const cp = el('clipPath', { id: `vault-wall-${k}` }, defs)
        const wallClip = [el('path', { 'clip-rule': 'evenodd' }, cp), el('path', { 'clip-rule': 'evenodd' }, cp)] as [SVGPathElement, SVGPathElement]
        return { wallClip, bricks: mk('ink faint2', { 'clip-path': `url(#vault-wall-${k})` }) }
      })(),
      courses: mk('ink faint2'), walls: mk('ink fine fadeout'),
      ...ribEls(geos[k].ribs.length, mk),
      bossFill: mk('rib-soffit'), boss: mk('ink fine'), flow: mk('flow', { 'stroke-dasharray': '7 8' }),
      // daylight through the glass, added to what is behind it
      rays: [
        mk('', { fill: 'url(#vault-ray-gold)', style: 'mix-blend-mode:screen', 'pointer-events': 'none' }),
        mk('', { fill: 'url(#vault-ray-blue)', style: 'mix-blend-mode:screen', 'pointer-events': 'none' }),
      ],
      // painted after the bay, so the veils over the far bays add up: fog
      veil: el('rect', { x: -4000, y: -4000, width: 8000, height: 8000, fill: '#0d0b09', 'pointer-events': 'none' }, g),
    }
  }
  // the piers stand in front of everything a bay draws: their capitals hide the
  // feet of the ribs that spring from them, and their shafts the wall behind.
  // Each pier is a stack of solid pieces, painted in order (see pierPieces).
  const pierG: SVGGElement[] = []
  const pierPaths: SVGPathElement[][] = []
  for (let k = BAYS - 1; k >= 0; k--) {
    pierG[k] = el('g', {}, g)
    pierPaths[k] = []
  }
  // the thrust is drawn over the stone it runs through
  const flowG = el('g', {}, g)
  for (let k = BAYS - 1; k >= 0; k--) flowG.appendChild(els[k].flow)
  const pierPath = (k: number, i: number) =>
    (pierPaths[k][i] ??= el('path', { class: 'solid', 'stroke-linejoin': 'round' }, pierG[k]))

  /** every piece of line-work at a pose, per kind (used to draw and as the swarm's landing outlines) */
  function build(p: Pose, k: number, full: boolean) {
    const P = makeProjector(p)
    const G = geos[k]
    const join = (ls: V3[][]) => ls.map((l) => P.line(l)).join('')
    // each rib: the side turned to the eye, the soffit, and their edges
    const eye: V3 = [0, p.ye, p.zc]
    const ribParts = G.ribs.map((r) => {
      const c = r.sA[Math.floor(r.sA.length / 2)]
      const aFaces = r.h[0] * (eye[0] - c[0]) + r.h[2] * (eye[2] - c[2]) > 0
      const [s, w] = aFaces ? [r.sA, r.wA] : [r.sB, r.wB]
      return {
        side: P.poly([...w, ...s.slice().reverse()]),
        soffit: P.poly([...r.sA, ...r.sB.slice().reverse()]),
        ink: join([r.sA, r.sB, w]),
      }
    })
    const ribs = ribParts.map((r) => r.ink).join('')
    // the openings' reveals: the faces turned to the eye, and their edges.
    // The back edge and the step of the order are drawn only along the faces
    // that show; where the reveal turns out of sight its arris closes the run.
    const revs = G.reveals.map((r) => {
      const revFaces: string[] = []
      const revInk: V3[][] = []
      const revStep: V3[][] = []
      const vis = r.quads.map((q, i) => {
        const c = lerp3(q[0], q[2], 0.5), n = r.n[i]
        return n[0] * (eye[0] - c[0]) + n[1] * (eye[1] - c[1]) + n[2] * (eye[2] - c[2]) > 0
      })
      vis.forEach((v, i) => { if (v) revFaces.push(P.poly(r.quads[i])) })
      const m = vis.length
      // runs of visible faces, as [first face, count]; face i runs from point i to i + 1
      const pts = r.front.length
      const runs: [number, number][] = []
      if (r.closed && vis.every(Boolean)) runs.push([0, m])
      else {
        for (let i = 0; i < m; i++) {
          const before = r.closed ? vis[(i - 1 + m) % m] : i > 0 && vis[i - 1]
          if (!vis[i] || before) continue
          let n = 1
          while (n < m && vis[(i + n) % m] && (r.closed || i + n < m)) n++
          runs.push([i, n])
        }
      }
      const pick = (line: V3[], i0: number, n: number) => Array.from({ length: n + 1 }, (_, k) => line[(i0 + k) % pts])
      for (const [i0, n] of runs) {
        revInk.push(pick(r.back, i0, n))
        revStep.push(pick(r.order, i0, n))
        // each end of a run is closed by the reveal's edge there, front to back:
        // an arris at a corner, the outline of the curve where it turns out of
        // sight. Whatever of it runs on behind the face of the wall is covered by it.
        if (n < m || !r.closed) {
          for (const e of [i0, (i0 + n) % pts]) revInk.push([r.front[e], r.back[e]])
        }
      }
      // an arris where two faces that both show meet at a corner
      for (const i of r.corners) if (vis[i] && vis[(i - 1 + m) % m]) revInk.push([r.front[i], r.back[i]])
      // only what shows through its own opening: the window it is seen through
      const f = r.front
      const win = r.closed ? f : [...f, [f[f.length - 1][0], -FLOOR, f[f.length - 1][2]] as V3, [f[0][0], -FLOOR, f[0][2]] as V3]
      return { fill: revFaces.join(''), ink: join(revInk), step: join(revStep), win: P.poly(win) }
    })
    const revealInk = revs.map((r) => r.ink).join('')
    const walls = join(G.wallLines)
    const pieces = G.piers.flatMap((q) => pierPieces(q, p.ye, p.zc)).map((faces) => faces.map((f) => P.poly(f)).join(''))
    const piers = pieces.join('')
    const boss = join(G.boss)
    if (!full) return { ribs, walls, piers, boss, pieces, ribParts, revs, revealInk }
    return {
      ribs, walls, piers, boss, pieces, ribParts, revs, revealInk,
      bossFill: P.poly(G.boss[0]),
      webA: P.poly(G.cells[0]) + P.poly(G.cells[1]),
      webB: P.poly(G.cells[2]) + P.poly(G.cells[3]),
      plate: G.platePolys.map((q) => P.poly(q)).join(''),
      plateLow: G.plateLow.map((q) => P.poly(q)).join(''),
      bricks: join(G.bricks),
      glass: {
        cobalt: G.glass.cobalt.map((q) => P.poly(q)).join(''),
        ruby: G.glass.ruby.map((q) => P.poly(q)).join(''),
        lead: join(G.glass.lead),
        panes: G.glass.panes.map((q) => P.poly(q)),
      },
      courses: join(G.courses),
      ribHi: join([G.ribs[2].roll, G.ribs[3].roll]),
      flow: join(G.flow),
      rays: G.rays.map((r) => r.map((q) => P.poly(q)).join('')),
    }
  }

  /** the outlines the swarm lands on: the vault as it first appears */
  function targets(): string[] {
    const out: string[] = []
    for (let k = 0; k < BAYS; k++) {
      const b = build(POSE0, k, false)
      out.push(b.ribs, b.walls, b.revealInk, b.piers, b.boss)
    }
    return out.filter(Boolean)
  }

  /**
   * q: scene progress 0..1; formed: 0..1 how far the landed swarm has been
   * taken over by the drawn lines; flowPhase: how far the thrust has travelled.
   */
  function update(q: number, formed: number, flowPhase: number): void {
    setOp(g, formed)
    const p = pose(q)
    const stone = ease(ramp(q, 0.06, 0.2))
    const courses = ease(ramp(q, 0.14, 0.3))
    const hi = ease(ramp(q, 0.3, 0.4)) * (1 - 0.6 * ramp(q, 0.7, 0.8))
    const flows = ease(ramp(q, 0.38, 0.5)) * (1 - ramp(q, 0.66, 0.74))
    const glass = ease(ramp(q, 0.68, 0.84))
    for (let k = 0; k < BAYS; k++) {
      const E = els[k]
      const G = geos[k]
      const zrel = G.z0 + A - p.zc
      const visible = formed > 0 && zrel > -A - 40 && zrel < 2200
      for (const e of [E.g, E.veil, pierG[k], E.flow]) {
        const d = visible ? '' : 'none'
        if (e.style.display !== d) e.style.display = d
      }
      if (!visible) continue
      // atmosphere: distant bays recede. Only the ink fades; the stone stays
      // solid, so no bay is ever seen through another
      const atm = Math.max(0.12, Math.min(1, 1.25 - Math.max(0, zrel) / 1500))
      // the veil over this bay thins the light by what is lost between it and the bay in front
      const vis = fogVis(zrel), visFront = k === 0 ? 1 : fogVis(G.z0 - BAY + A - p.zc)
      setOp(E.veil, 1 - vis / visFront)
      // the piers stand above the veils, so their stone is darkened to match
      const mix = PIER_STONE.map((c, i) => Math.round(c + (GROUND[i] - c) * (1 - vis)))
      const pierFill = `rgb(${mix.join(',')})`
      // the fine work (courses, the reveals' inner edges) is left out of the distance
      const near = Math.max(0, Math.min(1, 1.6 - Math.max(0, zrel) / 600))
      const b = build(p, k, true)
      const set = (e: SVGPathElement, d: string | undefined) => {
        const cur = e.getAttribute('d')
        if (cur !== (d ?? '')) e.setAttribute('d', d ?? '')
      }
      set(E.webA, b.webA); set(E.webB, b.webB); set(E.plate, b.plate); set(E.plateLow, b.plateLow)
      set(E.wallClip[0], b.plate); set(E.wallClip[1], b.plateLow); set(E.bricks, b.bricks)
      if (b.glass) {
        set(E.glass.cobalt, b.glass.cobalt); set(E.glass.ruby, b.glass.ruby); set(E.glass.lead, b.glass.lead)
        E.glass.panes.forEach((e, i) => set(e, b.glass?.panes[i]))
      }
      for (const e of [E.glass.cobalt, E.glass.ruby, E.glass.lead, ...E.glass.panes]) setOp(e, glass)
      set(E.courses, b.courses); set(E.walls, b.walls)
      b.revs.forEach((r, i) => {
        const [fill, ink, step, win] = E.revs[i]
        set(fill, r.fill); set(ink, r.ink); set(step, r.step); set(win, r.win)
        // the step of the order: a darker, finer line, so it gives depth without standing out
        setOp(fill, stone); setOp(ink, atm * near); setOp(step, 0.4 * atm * near)
      })
      b.ribParts.forEach((r, i) => {
        const [side, soffit, ink] = E.ribs[i]
        set(side, r.side); set(soffit, r.soffit); set(ink, r.ink)
        setOp(side, stone); setOp(soffit, stone); setOp(ink, atm)
      })
      set(E.ribHi, b.ribHi); set(E.bossFill, b.bossFill); set(E.boss, b.boss); set(E.flow, b.flow)
      b.pieces.forEach((d, i) => {
        const e = pierPath(k, i)
        if (e.getAttribute('d') !== d) e.setAttribute('d', d)
        e.setAttribute('fill-opacity', stone.toFixed(3))
        e.setAttribute('stroke-opacity', (atm * vis).toFixed(3))
        e.style.fill = pierFill
      })
      for (let i = b.pieces.length; i < pierPaths[k].length; i++) pierPaths[k][i].setAttribute('d', '')
      setOp(E.webA, stone); setOp(E.webB, stone); setOp(E.plate, stone); setOp(E.plateLow, stone)
      setOp(E.walls, atm); setOp(E.boss, atm); setOp(E.bossFill, stone)
      setOp(E.courses, courses * atm * near); setOp(E.bricks, 0.4 * courses * atm * near)
      setOp(E.ribHi, hi * atm)
      setOp(E.flow, flows * atm)
      E.rays.forEach((e, i) => { set(e, b.rays?.[i]); setOp(e, glass * near * near * atm) })
      E.flow.style.strokeDashoffset = String(-flowPhase)
    }
  }

  return { update, targets }
}
