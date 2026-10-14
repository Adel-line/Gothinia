import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TAU, arcPoints, ensureWinding, multifoilPoints } from '../lib/gothic2d'
import claire from './claireVoie.json'
import { ROSE } from './tracery'

/**
 * The architecture that frames the rose, after the south transept of
 * Notre-Dame (see References/IMG_6251.jpg):
 *
 *   - a moulded wall arch, barely pointed, that hugs the rose — three
 *     receding orders of rolls and hollows, carried down the jambs as wall
 *     shafts with capitals at the springing;
 *   - the window wall inside it, flush with the rose's splayed reveal;
 *   - a deep string course under the rose;
 *   - the claire-voie below it: a row of paired lancets, built from the bay
 *     rhythm measured in the same photo (tools/trace_rose.py).
 *
 * Window plane = XY facing +Z, origin at the rose's centre.
 */

/** Half the clear width of the frame: the rose's reveal plus a hair. */
const HALF = 5.62
/** Distance each arc's centre sits off the axis; small = barely pointed. */
const POINT = 0.8
const ARC_R = HALF + POINT
const APEX = Math.sqrt(ARC_R * ARC_R - POINT * POINT)

export const FRAME = {
  half: HALF,
  apex: APEX,
  /** top of the string course */
  stringTop: -5.62,
  stringBottom: -5.98,
  /** claire-voie glazing field */
  claireTop: -5.98,
  claireBottom: -5.98 - claire.height,
  /** how far the moulded orders reach out into the wall */
  depth: 0.9,
  /** window wall front (meets the rose's splay) and outer wall front */
  innerZ: 0.45,
  outerZ: 0.85,
}

/** Frame centreline, left jamb foot → apex → right jamb foot, with outward normals. */
function framePath(bottom: number): { p: THREE.Vector2[]; n: THREE.Vector2[] } {
  const p: THREE.Vector2[] = []
  const n: THREE.Vector2[] = []
  const jambSteps = 24
  for (let i = 0; i < jambSteps; i++) {
    p.push(new THREE.Vector2(-HALF, bottom + (0 - bottom) * (i / jambSteps)))
    n.push(new THREE.Vector2(-1, 0))
  }
  // left arc: centre on the right of the axis, from the springing up to the apex
  const aEnd = Math.atan2(APEX, -POINT)
  for (let i = 0; i <= 64; i++) {
    const a = Math.PI + (aEnd - Math.PI) * (i / 64)
    const v = new THREE.Vector2(Math.cos(a), Math.sin(a))
    p.push(new THREE.Vector2(POINT + v.x * ARC_R, v.y * ARC_R))
    n.push(v)
  }
  // right arc mirrors it (skip the shared apex point)
  for (let i = 63; i >= 0; i--) {
    const q = p[jambSteps + i]
    const m = n[jambSteps + i]
    p.push(new THREE.Vector2(-q.x, q.y))
    n.push(new THREE.Vector2(-m.x, m.y))
  }
  for (let i = jambSteps - 1; i >= 0; i--) {
    p.push(new THREE.Vector2(HALF, p[i].y))
    n.push(new THREE.Vector2(1, 0))
  }
  // the apex is a point: give its two copies the bisecting normal
  const apexI = jambSteps + 64
  n[apexI] = new THREE.Vector2(0, 1)
  return { p, n }
}

/**
 * Moulding profile across the orders: o = distance out from the clear
 * opening into the wall, z = depth. Three rolls (bowtells), each order
 * standing further forward than the one inside it, divided by hollows.
 */
function orderProfile(): { o: number; z: number }[] {
  const pts: { o: number; z: number }[] = [{ o: 0, z: FRAME.innerZ }]
  const roll = (co: number, cz: number, r: number) => {
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (1 - i / 10)
      pts.push({ o: co + Math.cos(a) * r, z: cz + Math.sin(a) * r * 0.9 })
    }
  }
  const hollow = (co: number, cz: number, r: number) => {
    for (let i = 1; i < 6; i++) {
      const a = Math.PI + Math.PI * (i / 6)
      pts.push({ o: co + Math.cos(a) * r, z: cz + Math.sin(a) * r * 0.6 })
    }
  }
  roll(0.11, 0.5, 0.07)
  hollow(0.27, 0.56, 0.09)
  roll(0.44, 0.63, 0.09)
  hollow(0.62, 0.69, 0.09)
  roll(0.79, 0.77, 0.08)
  pts.push({ o: FRAME.depth, z: FRAME.outerZ })
  return pts
}

/** Sweep a profile along an open path (miter-free: normals come with the path). */
function sweep(path: { p: THREE.Vector2[]; n: THREE.Vector2[] }, prof: { o: number; z: number }[]) {
  const cols = prof.length
  const pos: number[] = []
  const idx: number[] = []
  path.p.forEach((pt, i) => {
    const nn = path.n[i]
    for (const { o, z } of prof) pos.push(pt.x + nn.x * o, pt.y + nn.y * o, z)
  })
  for (let i = 0; i < path.p.length - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j
      const b = a + cols
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** Outline of the frame offset outward by `o`, as a closed CCW polygon. */
function frameOutline(o: number, bottom: number): THREE.Vector2[] {
  const { p, n } = framePath(bottom)
  const pts = p.map((pt, i) => pt.clone().addScaledVector(n[i], o))
  return ensureWinding(pts, true)
}

/** Capital where each roll reaches the springing: bell + square abacus. */
function capitals(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const rolls = [
    { o: 0.11, z: 0.5, r: 0.07 },
    { o: 0.44, z: 0.63, r: 0.09 },
    { o: 0.79, z: 0.77, r: 0.08 },
  ]
  for (const side of [-1, 1]) {
    for (const r of rolls) {
      const x = side * (HALF + r.o)
      const bell = new THREE.CylinderGeometry(r.r * 2.0, r.r * 1.05, 0.26, 16, 1, true)
      bell.translate(x, -0.13, r.z)
      const abacus = new THREE.BoxGeometry(r.r * 4.6, 0.07, r.r * 3.6)
      abacus.translate(x, 0.035, r.z)
      const necking = new THREE.TorusGeometry(r.r * 1.12, 0.018, 6, 20)
      necking.rotateX(Math.PI / 2)
      necking.translate(x, -0.27, r.z)
      parts.push(bell, abacus, necking)
    }
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()))!
}

/** String course: a drip moulding run across the whole wall under the rose. */
function stringCourse(): THREE.BufferGeometry {
  // profile in (z, y): sloped weathering on top, a roll, an undercut hollow
  const top = FRAME.stringTop
  const bot = FRAME.stringBottom
  const s = new THREE.Shape()
  s.moveTo(0.3, top)
  s.lineTo(0.78, top - 0.05)
  s.lineTo(0.9, top - 0.1)
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI / 2 - Math.PI * (i / 8)
    s.lineTo(0.9 + Math.cos(a) * 0.08, top - 0.18 + Math.sin(a) * 0.08)
  }
  s.lineTo(0.8, top - 0.27)
  s.quadraticCurveTo(0.74, bot + 0.02, 0.62, bot)
  s.lineTo(0.3, bot)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: 52, bevelEnabled: false, curveSegments: 8 })
  // extruded along +Z in (x=z, y=y) space: turn it to run along X
  g.rotateY(-Math.PI / 2)
  g.translate(26, 0, 0)
  return g
}

/**
 * The claire-voie's lights, from the rhythm measured in the photo: a bay
 * (two lancets) every 364 px = 1.405 units, eight bays across the frame. In
 * each bay: a heavy mullion, a lancet, a light mullion, a lancet; over each
 * pair a quatrefoil in the head. Heights are measured from the strip's top.
 */
const CLAIRE = {
  majorMullion: 0.3,
  minorMullion: 0.16,
  /** glass apex and foot, below the claire-voie's top edge */
  apex: 1.15,
  foot: 4.88,
  /** quatrefoil over each pair */
  foilDrop: 0.6,
  foilCentre: 0.1,
  foilRadius: 0.105,
}

function lancet(cx: number, w: number, apexY: number, footY: number): THREE.Vector2[] {
  // equilateral pointed head: each arc is struck from the opposite springer
  const rise = w * Math.sin(Math.PI / 3)
  const spring = apexY - rise
  const pts: THREE.Vector2[] = [new THREE.Vector2(cx - w / 2, footY), new THREE.Vector2(cx + w / 2, footY)]
  for (let i = 0; i <= 12; i++) {
    const a = (Math.PI / 3) * (i / 12) // right arc, centre on the left springer
    pts.push(new THREE.Vector2(cx - w / 2 + Math.cos(a) * w, spring + Math.sin(a) * w))
  }
  for (let i = 1; i <= 12; i++) {
    const a = (2 * Math.PI) / 3 + (Math.PI / 3) * (i / 12) // left arc, centre on the right springer
    pts.push(new THREE.Vector2(cx + w / 2 + Math.cos(a) * w, spring + Math.sin(a) * w))
  }
  return pts
}

export function claireOpenings(): THREE.Vector2[][] {
  const C = CLAIRE
  const bays = Math.round(claire.bays)
  const bay = (2 * HALF) / bays
  const w = (bay - C.majorMullion - C.minorMullion) / 2
  const top = FRAME.claireTop
  const out: THREE.Vector2[][] = []
  for (let b = 0; b < bays; b++) {
    const x0 = -HALF + b * bay + C.majorMullion / 2
    const c1 = x0 + w / 2
    const c2 = x0 + w + C.minorMullion + w / 2
    out.push(lancet(c1, w, top - C.apex, top - C.foot))
    out.push(lancet(c2, w, top - C.apex, top - C.foot))
    const mid = new THREE.Vector2((c1 + c2) / 2, top - C.foilDrop)
    out.push(multifoilPoints(4, C.foilCentre, C.foilRadius, mid, Math.PI / 4, 16))
  }
  return out
}

export interface FrameGeometries {
  outerWall: THREE.ExtrudeGeometry
  windowWall: THREE.ExtrudeGeometry
  orders: THREE.BufferGeometry
  capitals: THREE.BufferGeometry
  stringCourse: THREE.BufferGeometry
  clairePlate: THREE.ExtrudeGeometry
  claireGlass: THREE.PlaneGeometry
}

export function buildFrameGeometries(): FrameGeometries {
  const F = FRAME

  // Outer wall: everything outside the moulded orders.
  const wall = new THREE.Shape()
  // wide enough that the pulled-back reading pose never sees past it
  wall.moveTo(-26, -18)
  wall.lineTo(26, -18)
  wall.lineTo(26, 16)
  wall.lineTo(-26, 16)
  wall.closePath()
  wall.holes.push(new THREE.Path(ensureWinding(frameOutline(F.depth, F.claireBottom), false)))
  const outerWall = new THREE.ExtrudeGeometry(wall, { depth: F.outerZ + 0.75, bevelEnabled: false })
  outerWall.translate(0, 0, -0.75)

  // Window wall: inside the frame, above the string course, around the rose.
  const inner = new THREE.Shape(frameOutline(0.02, F.stringTop))
  inner.holes.push(
    new THREE.Path(ensureWinding(arcPoints(0, 0, ROSE.wallHoleRadius, 0, TAU, 128).slice(0, -1), false)),
  )
  const windowWall = new THREE.ExtrudeGeometry(inner, { depth: F.innerZ + 0.75, bevelEnabled: false })
  windowWall.translate(0, 0, -0.75)

  // The moulded orders, swept round the frame from the claire-voie's foot.
  const orders = sweep(framePath(F.claireBottom), orderProfile())

  // Claire-voie: one stone plate pierced by its lancets.
  const top = F.claireTop
  const bottom = F.claireBottom
  const plate = new THREE.Shape(
    ensureWinding(
      [
        new THREE.Vector2(-HALF - 0.05, bottom),
        new THREE.Vector2(HALF + 0.05, bottom),
        new THREE.Vector2(HALF + 0.05, top),
        new THREE.Vector2(-HALF - 0.05, top),
      ],
      true,
    ),
  )
  for (const pts of claireOpenings()) plate.holes.push(new THREE.Path(ensureWinding(pts, false)))
  const claireDepth = 0.32
  const clairePlate = new THREE.ExtrudeGeometry(plate, {
    depth: claireDepth,
    bevelEnabled: false,
    curveSegments: 1,
  })
  clairePlate.translate(0, 0, F.innerZ - 0.1 - claireDepth)

  const claireGlass = new THREE.PlaneGeometry(2 * HALF, claire.height)
  claireGlass.translate(0, (top + bottom) / 2, F.innerZ - 0.1 - claireDepth + 0.1)

  return {
    outerWall,
    windowWall,
    orders,
    capitals: capitals(),
    stringCourse: stringCourse(),
    clairePlate,
    claireGlass,
  }
}
