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
function pointed(s: number, n = 18): [number, number][] {
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
function semi(p: V3, q: V3, h: number, n = 32): V3[] {
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
  wallLines: V3[][]
  piers: V3[][]
  platePolys: V3[][]
  lancets: V3[][][] // per side: lancet polygons
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
  // courses: the rim of each cell, shrunk toward the crown
  const courses: V3[][] = []
  for (const rim of [wallW, wallE, transverseS, transverseN]) {
    for (const l of [0.2, 0.4, 0.6, 0.8]) courses.push(rim.map((p) => lerp3(p, crown, l)))
  }
  const ring = (r: number, y: number): V3[] =>
    Array.from({ length: 21 }, (_, i) => [Math.cos((i / 20) * Math.PI * 2) * r, y, Math.sin((i / 20) * Math.PI * 2) * r + zm] as V3)
  const boss = [ring(11, CROWN - 1), ring(4.5, CROWN - 2)]

  // piers at the four corners: a shaft, a capital, a base
  const piers: V3[][] = []
  for (const [px, pz] of [[-A, z0], [A, z0]] as const) {
    for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      piers.push([[px + ox * PIER, -FLOOR + 10, pz + oz * PIER], [px + ox * PIER, -12, pz + oz * PIER]])
    }
    const sq = (h: number, y: number): V3[] => [[-h, y, -h], [h, y, -h], [h, y, h], [-h, y, h], [-h, y, -h]].map(([x, yy, z]) => [px + x, yy, pz + z] as V3)
    piers.push(sq(PIER, -12), sq(PIER_CAP, -12), sq(PIER_CAP, -2), sq(PIER_CAP + 1.5, 0))
    piers.push(sq(PIER + 2, -FLOOR + 10), sq(PIER + 3.5, -FLOOR + 4), sq(PIER + 3.5, -FLOOR))
  }

  // the walls: arcade below, clerestory above the string course
  const wallLines: V3[][] = []
  const plates: V3[][] = []
  const lancets: V3[][][] = [[], []]
  const oculi: V3[] [] = []
  const onWall = (s: -1 | 1, pts: [number, number][]): V3[] => pts.map(([u, y]) => [s * A, y, zm + u])
  for (const [si, s] of ([-1, 1] as const).entries()) {
    const aw = pointed(A - PIER - 2)
    wallLines.push(onWall(s, aw.map(([u, y]) => [u, y + ARCADE_SPRING])))
    wallLines.push(onWall(s, [[-A, SILL], [A, SILL]]), onWall(s, [[-A, SILL - 7], [A, SILL - 7]]))
    // plate: stone from the string course up to the wall arch, pierced by the windows
    plates.push(onWall(s, [...ARCH, [A, SILL], [-A, SILL]]))
    for (const uc of [-27, 27]) {
      const l = lancet(uc, 40, SILL + 6, 6)
      lancets[si].push(onWall(s, l))
      plates.push(onWall(s, l))
      wallLines.push(onWall(s, [...l, l[0]]))
    }
    const o = circle2(0, 88, 15)
    oculi.push(onWall(s, o))
    plates.push(onWall(s, o))
    wallLines.push(onWall(s, [...o, o[0]]))
  }

  // the thrust: down each half-rib from the crown, then down the pier to the floor
  const flow: V3[][] = []
  const halves: [V3[], V3][] = [[d1.slice(0, m + 1).reverse(), SW], [d1.slice(m), NE], [d2.slice(0, m + 1).reverse(), SE], [d2.slice(m), NW]]
  for (const [rib, foot] of halves) {
    flow.push([...rib, [foot[0], -FLOOR * 0.5, foot[2]] as V3, [foot[0], -FLOOR + 4, foot[2]] as V3])
  }
  return {
    z0, transverseS, transverseN, wallW, wallE, d1, d2, cells, courses, boss, wallLines, piers,
    platePolys: plates, lancets, oculi, flow,
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
    courses: SVGPathElement; walls: SVGPathElement; piers: SVGPathElement; ribs: SVGPathElement
    ribHi: SVGPathElement; boss: SVGPathElement; flow: SVGPathElement
  }
  // far to near, so nearer bays paint over farther ones
  const els: BayEls[] = []
  for (let k = BAYS - 1; k >= 0; k--) {
    const bg = el('g', {}, g)
    const mk = (cls: string, extra: Record<string, string | number> = {}) => el('path', { class: cls, ...extra }, bg)
    els[k] = {
      g: bg,
      webA: mk('stone a'), webB: mk('stone b'),
      plate: mk('stone b', { 'fill-rule': 'evenodd' }),
      glassB: mk('', { fill: GLASS.cobalt }), glassR: mk('', { fill: GLASS.ruby }),
      courses: mk('ink faint2'), walls: mk('ink fine fadeout'), piers: mk('ink fine fadeout'), ribs: mk('ink fine'),
      ribHi: mk('ink rib'), boss: mk('ink fine'), flow: mk('flow', { 'stroke-dasharray': '7 8' }),
    }
  }

  /** every piece of line-work at a pose, per kind (used to draw and as the swarm's landing outlines) */
  function build(p: Pose, k: number, full: boolean) {
    const P = makeProjector(p)
    const G = geos[k]
    const join = (ls: V3[][]) => ls.map((l) => P.line(l)).join('')
    const ribs = join([G.transverseS, G.transverseN, G.d1, G.d2])
    const walls = join([G.wallW, G.wallE, ...G.wallLines])
    const piers = join(G.piers)
    const boss = join(G.boss)
    if (!full) return { ribs, walls, piers, boss }
    return {
      ribs, walls, piers, boss,
      webA: P.poly(G.cells[0]) + P.poly(G.cells[1]),
      webB: P.poly(G.cells[2]) + P.poly(G.cells[3]),
      plate: G.platePolys.map((q) => P.poly(q)).join(''),
      glassB: G.lancets.flat().filter((_, i) => i % 4 < 2).map((q) => P.poly(q)).join('') + G.oculi.map((q) => P.poly(q)).join(''),
      glassR: G.lancets.flat().filter((_, i) => i % 4 >= 2).map((q) => P.poly(q)).join(''),
      courses: join(G.courses),
      ribHi: join([G.d1, G.d2]),
      flow: join(G.flow),
    }
  }

  /** the outlines the swarm lands on: the vault as it first appears */
  function targets(): string[] {
    const out: string[] = []
    for (let k = 0; k < BAYS; k++) {
      const b = build(POSE0, k, false)
      out.push(b.ribs, b.walls, b.piers, b.boss)
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
      if (!visible) {
        if (E.g.style.display !== 'none') E.g.style.display = 'none'
        continue
      }
      if (E.g.style.display === 'none') E.g.style.display = ''
      // atmosphere: distant bays recede
      setOp(E.g, Math.max(0.12, Math.min(1, 1.25 - Math.max(0, zrel) / 1500)))
      const b = build(p, k, true)
      const set = (e: SVGPathElement, d: string | undefined) => {
        const cur = e.getAttribute('d')
        if (cur !== (d ?? '')) e.setAttribute('d', d ?? '')
      }
      set(E.webA, b.webA); set(E.webB, b.webB); set(E.plate, b.plate)
      set(E.glassB, b.glassB); set(E.glassR, b.glassR)
      set(E.courses, b.courses); set(E.walls, b.walls); set(E.piers, b.piers); set(E.ribs, b.ribs)
      set(E.ribHi, b.ribHi); set(E.boss, b.boss); set(E.flow, b.flow)
      setOp(E.webA, stone); setOp(E.webB, stone); setOp(E.plate, stone)
      setOp(E.courses, courses)
      setOp(E.ribHi, hi)
      setOp(E.flow, flows)
      E.flow.style.strokeDashoffset = String(-flowPhase)
      setOp(E.glassB, glass * 0.92); setOp(E.glassR, glass * 0.92)
    }
  }

  return { update, targets }
}
