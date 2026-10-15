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
const F = 470 // focal length, in drawing units
const NEAR = 14
const PIER = 6 // half-width of a pier
const PIER_CAP = 9 // half-width of the capital

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
const TRI_PIER = 5 // width of a triforium colonnette
/** how deep each kind of opening runs into the wall */
const DEPTH = { arcade: PIER_CAP, triforium: 10, clerestory: 10 }
/** how far each opening narrows toward the glass */
const SPLAY = { arcade: 0, triforium: 2, clerestory: 3 }

/**
 * A pier as a stack of rings [half-width, height, engaged?], bottom to top.
 * Below the arcade the pier stands free, square; above it the vaulting shaft
 * is engaged in the wall, so only its half on the nave side exists.
 */
type Ring = [number, number, boolean]
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
  const sx = px < 0 ? 1 : -1 // toward the nave
  /** the ring's four corners, anticlockwise seen from above */
  const rect = ([h, y, eng]: Ring): V3[] => {
    const x0 = eng ? (sx > 0 ? px : px - h) : px - h
    const x1 = eng ? (sx > 0 ? px + h : px) : px + h
    return [[x0, y, pz - h], [x1, y, pz - h], [x1, y, pz + h], [x0, y, pz + h]]
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
    const faces: V3[][] = []
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4
      const q = [a[i], a[j], b[j], b[i]]
      const c = mid(q)
      let n = cross(sub(q[1], q[0]), sub(q[3], q[0]))
      const out = sub(c, centre)
      if (dot(n, [out[0], 0, out[2]]) < 0) n = [-n[0], -n[1], -n[2]]
      if (dot(n, sub(eye, c)) > 1e-6) faces.push(q)
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
function rib(curve: V3[], h: V3, w: number, d: number): Rib {
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
  return {
    sA: curve.map((p, i) => off(off(p, inward[i], d), h, w)),
    sB: curve.map((p, i) => off(off(p, inward[i], d), h, -w)),
    roll: curve.map((p, i) => off(p, inward[i], d)),
    wA: curve.map((p) => off(p, h, w)),
    wB: curve.map((p) => off(p, h, -w)),
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
function reveal(s: -1 | 1, zm: number, pts: [number, number][], depth: number, splay: number, closed: boolean): Reveal {
  const N = pts.length
  const cu = pts.reduce((a, [u]) => a + u / N, 0), cy = pts.reduce((a, [, y]) => a + y / N, 0)
  // each segment's normal in the wall, pointing into the opening
  const segN = (i: number): [number, number] => {
    const j = (i + 1) % N
    const du = pts[j][0] - pts[i][0], dy = pts[j][1] - pts[i][1]
    const l = Math.hypot(du, dy) || 1
    let nu = -dy / l, ny = du / l
    const mu = (pts[i][0] + pts[j][0]) / 2, my = (pts[i][1] + pts[j][1]) / 2
    if (nu * (cu - mu) + ny * (cy - my) < 0) { nu = -nu; ny = -ny }
    return [nu, ny]
  }
  // at each point, the direction the splay draws it in: the mitre of its two segments
  const ptN = pts.map((_, i): [number, number] => {
    const has0 = closed || i > 0, has1 = closed || i < N - 1
    const a = has0 ? segN((i - 1 + N) % N) : segN(i), b = has1 ? segN(i) : a
    const mu = a[0] + b[0], my = a[1] + b[1]
    const l = Math.hypot(mu, my) || 1
    const k = 1 / Math.max(0.5, (mu / l) * a[0] + (my / l) * a[1]) // mitre length
    return [(mu / l) * k, (my / l) * k]
  })
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
    if (turn > 0.45) corners.push(i)
  }
  return { quads, n, front, back, order, closed, corners }
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
  boss: V3[][]
  ribs: Rib[]
  wallLines: V3[][]
  piers: Pier[]
  platePolys: V3[][]
  lancets: V3[][][] // per side: lancet glass, at the back of the wall
  reveals: Reveal[]
  oculi: V3[][]
  flow: V3[][]
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
    for (const l of [0.2, 0.4, 0.6, 0.8]) {
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
  // painted in this order: wall ribs, diagonals, then the far transverse arch
  // (this bay's near one belongs to the bay in front, except for the first)
  const ribs: Rib[] = [
    rib(wallW, [1, 0, 0], RIB_W.w, RIB_W.d), rib(wallE, [-1, 0, 0], RIB_W.w, RIB_W.d),
    rib(d1, [s2, 0, -s2], RIB_D.w, RIB_D.d), rib(d2, [s2, 0, s2], RIB_D.w, RIB_D.d),
    rib(transverseN, [0, 0, 1], RIB_T.w, RIB_T.d),
    ...(k === 0 ? [rib(transverseS, [0, 0, 1], RIB_T.w, RIB_T.d)] : []),
  ]

  // piers at the bay's front corners: a shaft, a capital where the arcade
  // springs, a capital under the vault, and a moulded base on a plinth
  const piers: Pier[] = ([[-A, z0], [A, z0]] as const).map(([px, pz]) => ({
    px, pz,
    rings: [
      // plinth, base, shaft up to the arcade capital
      [PIER + 3.5, -FLOOR, false], [PIER + 3.5, -FLOOR + 4, false], [PIER + 2, -FLOOR + 4, false],
      [PIER + 2, -FLOOR + 10, false], [PIER, -FLOOR + 10, false],
      // arcade capital: bell and abacus; the arcade arches land on it
      [PIER, ARCADE_SPRING - 10, false], [PIER_CAP, ARCADE_SPRING - 2, false], [PIER_CAP, ARCADE_SPRING, false],
      // the vaulting shaft, engaged in the wall, runs on up to the vault capital
      [PIER, ARCADE_SPRING, true], [PIER, -12, true], [PIER_CAP, -2, true], [PIER_CAP + 1.5, -2, true], [PIER_CAP + 1.5, 0, true],
    ],
  }))

  // the walls: arcade below, clerestory above the string course
  const wallLines: V3[][] = []
  const plates: V3[][] = []
  const lancets: V3[][][] = [[], []]
  const oculi: V3[] [] = []
  const reveals: Reveal[] = []
  const onWall = (s: -1 | 1, pts: [number, number][]): V3[] => pts.map(([u, y]) => [s * A, y, zm + u])
  for (const [si, s] of ([-1, 1] as const).entries()) {
    // the arcade: a pointed arch from capital to capital
    const aw = pointed(A - PIER - 2).map(([u, y]): [number, number] => [u, y + ARCADE_SPRING])
    wallLines.push(onWall(s, aw))
    reveals.push(reveal(s, zm, aw, DEPTH.arcade, SPLAY.arcade, false))
    // the wall over the arcade, up to the clerestory sill: solid, pierced by the triforium
    plates.push(onWall(s, [[-A + PIER, SILL], [-A + PIER, ARCADE_SPRING], ...aw, [A - PIER, ARCADE_SPRING], [A - PIER, SILL]]))
    // triforium: a string course, then five pointed openings on colonnettes
    wallLines.push(onWall(s, [[-A + PIER, TRI_SILL], [A - PIER, TRI_SILL]]))
    const tw = (2 * (A - PIER) - 6 * TRI_PIER) / 5
    for (let i = 0; i < 5; i++) {
      const uc = -A + PIER + TRI_PIER + tw / 2 + i * (tw + TRI_PIER)
      const t = lancet(uc, tw, TRI_SILL, TRI_SPRING)
      plates.push(onWall(s, t))
      wallLines.push(onWall(s, [...t, t[0]]))
      reveals.push(reveal(s, zm, t, DEPTH.triforium, SPLAY.triforium, true))
    }
    // clerestory sill: two strings, the whole width of the bay between the piers
    wallLines.push(onWall(s, [[-A + PIER, SILL], [A - PIER, SILL]]), onWall(s, [[-A + PIER, SILL - 7], [A - PIER, SILL - 7]]))
    // the floor, along the foot of the arcade from plinth to plinth
    wallLines.push(onWall(s, [[-A + PIER + 3.5, -FLOOR], [A - PIER - 3.5, -FLOOR]]))
    // clerestory: stone from the sill up to the wall arch, pierced by two lancets and an oculus
    plates.push(onWall(s, [[-A + PIER, SILL], [-A + PIER, 0], ...ARCH, [A - PIER, 0], [A - PIER, SILL]]))
    // where the wall meets the pier, from the arcade capital up to the vault capital
    for (const u of [-A + PIER, A - PIER]) wallLines.push(onWall(s, [[u, ARCADE_SPRING], [u, -12]]))
    for (const uc of [-27, 27]) {
      const l = lancet(uc, 40, SILL, 6)
      const r = reveal(s, zm, l, DEPTH.clerestory, SPLAY.clerestory, true)
      lancets[si].push(r.back)
      plates.push(onWall(s, l))
      wallLines.push(onWall(s, [...l, l[0]]))
      reveals.push(r)
    }
    const o = circle2(0, 88, 15)
    const ro = reveal(s, zm, o, DEPTH.clerestory, SPLAY.clerestory, true)
    oculi.push(ro.back)
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
    platePolys: plates, lancets, oculi, reveals, flow,
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
  const geos = Array.from({ length: BAYS }, (_, k) => bayGeo(k))

  interface BayEls {
    g: SVGGElement
    webA: SVGPathElement; webB: SVGPathElement; plate: SVGPathElement
    glassB: SVGPathElement; glassR: SVGPathElement
    /** the openings' reveals: each its faces and its edges, clipped to its own opening */
    revs: [SVGPathElement, SVGPathElement, SVGPathElement][]
    courses: SVGPathElement; walls: SVGPathElement
    /** per rib: its visible side, its soffit, and its ink */
    ribs: [SVGPathElement, SVGPathElement, SVGPathElement][]
    ribHi: SVGPathElement; bossFill: SVGPathElement; boss: SVGPathElement; flow: SVGPathElement
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
      webA: mk('stone a'), webB: mk('stone b'),
      // through the openings: the glass at the back of the wall, then the reveals, then the wall's face
      glassB: mk('', { fill: GLASS.cobalt }), glassR: mk('', { fill: GLASS.ruby }),
      // (the reveals' edges go under the face too: where a reveal runs on behind it, so do they)
      revs: geos[k].reveals.map((_, i) => {
        const id = `vault-win-${k}-${i}`
        const win = el('path', {}, el('clipPath', { id }, defs))
        const clip = { 'clip-path': `url(#${id})` }
        return [mk('rib-soffit', clip), mk('ink fine fadeout', clip), win] as [SVGPathElement, SVGPathElement, SVGPathElement]
      }),
      plate: mk('stone b', { 'fill-rule': 'evenodd' }),
      courses: mk('ink faint2'), walls: mk('ink fine fadeout'),
      ...ribEls(geos[k].ribs.length, mk),
      bossFill: mk('rib-soffit'), boss: mk('ink fine'), flow: mk('flow', { 'stroke-dasharray': '7 8' }),
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
        ink: join([r.sA, r.sB, r.roll, w]),
      }
    })
    const ribs = ribParts.map((r) => r.ink).join('')
    // the openings' reveals: the faces turned to the eye, and their edges.
    // The back edge and the step of the order are drawn only along the faces
    // that show; where the reveal turns out of sight its arris closes the run.
    const revs = G.reveals.map((r) => {
      const revFaces: string[] = []
      const revInk: V3[][] = []
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
        revInk.push(pick(r.back, i0, n), pick(r.order, i0, n))
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
      return { fill: revFaces.join(''), ink: join(revInk), win: P.poly(win) }
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
      glassB: G.lancets.flat().filter((_, i) => i % 4 < 2).map((q) => P.poly(q)).join('') + G.oculi.map((q) => P.poly(q)).join(''),
      glassR: G.lancets.flat().filter((_, i) => i % 4 >= 2).map((q) => P.poly(q)).join(''),
      courses: join(G.courses),
      ribHi: join([G.ribs[2].roll, G.ribs[3].roll]),
      flow: join(G.flow),
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
      for (const e of [E.g, pierG[k], E.flow]) {
        const d = visible ? '' : 'none'
        if (e.style.display !== d) e.style.display = d
      }
      if (!visible) continue
      // atmosphere: distant bays recede. Only the ink fades; the stone stays
      // solid, so no bay is ever seen through another
      const atm = Math.max(0.12, Math.min(1, 1.25 - Math.max(0, zrel) / 1500))
      const b = build(p, k, true)
      const set = (e: SVGPathElement, d: string | undefined) => {
        const cur = e.getAttribute('d')
        if (cur !== (d ?? '')) e.setAttribute('d', d ?? '')
      }
      set(E.webA, b.webA); set(E.webB, b.webB); set(E.plate, b.plate)
      set(E.glassB, b.glassB); set(E.glassR, b.glassR)
      set(E.courses, b.courses); set(E.walls, b.walls)
      b.revs.forEach((r, i) => {
        const [fill, ink, win] = E.revs[i]
        set(fill, r.fill); set(ink, r.ink); set(win, r.win)
        setOp(fill, stone); setOp(ink, atm)
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
        e.setAttribute('stroke-opacity', atm.toFixed(3))
      })
      for (let i = b.pieces.length; i < pierPaths[k].length; i++) pierPaths[k][i].setAttribute('d', '')
      setOp(E.webA, stone); setOp(E.webB, stone); setOp(E.plate, stone)
      setOp(E.walls, atm); setOp(E.boss, atm); setOp(E.bossFill, stone)
      setOp(E.courses, courses * atm)
      setOp(E.ribHi, hi * atm)
      setOp(E.flow, flows * atm)
      E.flow.style.strokeDashoffset = String(-flowPhase)
      setOp(E.glassB, glass); setOp(E.glassR, glass)
    }
  }

  return { update, targets }
}
