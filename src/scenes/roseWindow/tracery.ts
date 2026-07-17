import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { buildHoodProfile, buildMoldingProfile, sweepMolding } from '../lib/molding'
import {
  TAU,
  arcPoints,
  edgePoint,
  ensureWinding,
  multifoilPoints,
  pointedHead,
  polar,
} from '../lib/gothic2d'

/**
 * Procedural Rayonnant rose window, rebuilt after the north transept rose of
 * Notre-Dame de Paris (and the glazing of Sainte-Chapelle). The point of the
 * rebuild is *architectural hierarchy*: a real rose is not one repeated motif
 * on a wheel, it is a sequence of concentric ORDERS that grow as they radiate,
 * threaded onto radial mullions and pinned at every ring by foiled circles.
 *
 * Reading from the centre outward, on a strict sixteen-fold division:
 *
 *   0  central octofoil OCULUS
 *   A  sixteen small trefoil-headed PETAL lights (the inner wreath)
 *   1  a ring of sixteen cusped QUATREFOIL medallions, one on every radial
 *      mullion — the nodes where the spokes cross the first string-course
 *   C  sixteen taller cinquefoil-cusped lights (the middle order)
 *   2  a ring of sixteen SEXFOIL medallions on the mullions
 *   D  sixteen first-order arches, each PROPERLY SUBDIVIDED into twin
 *      trefoil sub-lancets beneath a small quatrefoil — the largest lights
 *      carry the densest tracery, exactly as bar tracery does
 *      + a thick, deep dressed-stone RIM carrying two molded archivolt rolls
 *
 * Everything is still one pierced stone plate with the openings cut as holes,
 * so the mullions, ring courses and spandrels are the negative space between
 * lights — genuine plate/bar tracery logic, not a drawn pattern. The plan is
 * built in 2D (window plane = XY, facing +Z) and extruded; carved moldings are
 * swept around every opening and along the heavier orders.
 */

// ---------------------------------------------------------------------------
// Radial layout (world units; the rose is ~9.8 units across the glazed field)
// ---------------------------------------------------------------------------
export const ROSE = {
  plateRadius: 4.9,
  wallHoleRadius: 5.56,
  stoneDepth: 0.6,
  /** front face of the pierced plate; molding rolls crest ~0.06 above it */
  plateFront: 0.235,
  /** deep back face — a thick wall gives the openings a real splayed reveal
      and long raking shadows, so the tracery reads as carved stone, not a cut
      sheet of card */
  plateBack: -0.55,
  glassZ: -0.12,

  /** N-fold symmetry. Sixteen radial mullions (spokes). */
  spokes: 16,

  // Concentric orders are spaced so a clear annulus of solid stone separates
  // every ring from its neighbours: each band's apex/sill and each node ring
  // are kept ~0.23 apart (hole-to-hole), so the swept moldings read as
  // distinct carved bars instead of a tangle.
  //
  //   order        radial hole span      stone gap to next
  //   oculus       0.00 – 0.68
  //   (gap 0.27)
  //   bandA        0.95 – 1.60
  //   (gap 0.23)   node1 ring 1.83 – 2.17
  //   (gap 0.23)   bandC 2.40 – 3.05
  //   (gap 0.24)   node2 ring 3.29 – 3.61
  //   (gap 0.24)   bandD 3.85 – 4.52
  //   (gap ~0.10)  archivolt rolls on the rim, inside plateRadius 4.9
  oculus: { foils: 8, centerDist: 0.4, foilRadius: 0.28 },

  // inner wreath of petal lights
  bandA: { rIn: 0.95, rSpring: 1.3, rApex: 1.6, mullionWidth: 0.12, cusp: 0.05 },
  // first node ring — quatrefoils on the spokes (extent ~0.17)
  node1: { r: 2.0, foils: 4, centerDist: 0.07, foilRadius: 0.1, phase: Math.PI / 4 },
  // middle order lights
  bandC: { rIn: 2.4, rSpring: 2.8, rApex: 3.05, mullionWidth: 0.13, cusp: 0.06 },
  // second node ring — sexfoils on the spokes (extent ~0.16)
  node2: { r: 3.45, foils: 6, centerDist: 0.06, foilRadius: 0.1, phase: 0 },
  // outer order: first-order arches subdivided into twin sub-lancets
  bandD: {
    rIn: 3.85,
    rSpring: 4.18,
    rApex: 4.52,
    mullionWidth: 0.15,
    subHalf: 0.05,
    sub: { rIn: 3.9, rSpring: 4.06, rApex: 4.26, cusp: 0.04 },
    quatrefoil: { r: 4.36, foils: 4, centerDist: 0.05, foilRadius: 0.07, phase: 0 },
  },
  // molded archivolt rolls carried on the thick outer rim, clear of the outer
  // lights (4.52) and inside the splay reveal (4.86)
  archivolt: [4.62, 4.74],
}

export interface Opening {
  /** Closed 2D outline in the window plane. */
  points: THREE.Vector2[]
  /** Representative centre, used for colour seeding and glass expansion. */
  center: THREE.Vector2
  /** ring family (0 = oculus … 6 = outer sub-tracery), seeds pane colour. */
  ring: number
  index: number
}

interface LightSide {
  /** angle of the mullion centreline this edge runs along */
  theta: number
  /** half the width of that mullion (edge offset from its centreline) */
  halfW: number
}

/**
 * One radial light between two straight (offset-radial) mullion edges, with a
 * two-centre pointed head. The sides may belong to different orders of
 * mullion, which is what lets the same routine cut a first-order light and the
 * twin sub-lancets inside it.
 */
function lightPoints(
  sideA: LightSide,
  sideB: LightSide,
  rIn: number,
  rSpring: number,
  rApex: number,
  cuspDepth: number,
): THREE.Vector2[] {
  const cA = edgePoint(sideA.theta, 1, rIn, sideA.halfW)
  const cB = edgePoint(sideB.theta, -1, rIn, sideB.halfW)
  const sA = edgePoint(sideA.theta, 1, rSpring, sideA.halfW)
  const sB = edgePoint(sideB.theta, -1, rSpring, sideB.halfW)

  const springMid = sA.clone().add(sB).multiplyScalar(0.5)
  const apexHeight = rApex - springMid.length()

  const pts: THREE.Vector2[] = [
    // sill: arc along the inner ring from A to B (CCW, interior on the left)
    ...arcPoints(0, 0, rIn, Math.atan2(cA.y, cA.x), Math.atan2(cB.y, cB.x), 8),
    // jamb up to the B springer, then the pointed (optionally cusped) head
    ...pointedHead(sB, sA, apexHeight, cuspDepth),
  ]
  return ensureWinding(pts, true)
}

/** A cusped foiled circle (qu/cinq/sexfoil medallion) centred on a spoke. */
function medallion(
  theta: number,
  r: number,
  foils: number,
  centerDist: number,
  foilRadius: number,
  phase: number,
  ring: number,
  index: number,
): Opening {
  const center = polar(theta, r)
  return {
    points: multifoilPoints(foils, centerDist, foilRadius, center, phase, 20),
    center,
    ring,
    index,
  }
}

export interface RosePlan {
  openings: Opening[]
  /**
   * First-order arch outlines (the band-D enclosing arches). These are NOT
   * holes — they carry a raised hood molding on the plate face, marking the
   * heavier order of tracery that frames the twin sub-lancets.
   */
  hoodOutlines: THREE.Vector2[][]
}

export function buildOpenings(): RosePlan {
  const openings: Opening[] = []
  const hoodOutlines: THREE.Vector2[][] = []
  const N = ROSE.spokes
  const bay = TAU / N

  // ---- 0: central octofoil oculus
  const oc = ROSE.oculus
  openings.push({
    points: multifoilPoints(oc.foils, oc.centerDist, oc.foilRadius),
    center: new THREE.Vector2(0, 0),
    ring: 0,
    index: 0,
  })

  // ---- A: inner wreath of trefoil-headed petal lights (one per bay)
  const a = ROSE.bandA
  const aHalf = a.mullionWidth / 2
  for (let i = 0; i < N; i++) {
    const thetaA = i * bay
    const thetaB = (i + 1) * bay
    openings.push({
      points: lightPoints(
        { theta: thetaA, halfW: aHalf },
        { theta: thetaB, halfW: aHalf },
        a.rIn,
        a.rSpring,
        a.rApex,
        a.cusp,
      ),
      center: polar(thetaA + bay / 2, (a.rIn + a.rApex) / 2),
      ring: 1,
      index: i,
    })
  }

  // ---- 1: quatrefoil node ring, one medallion on every spoke
  const n1 = ROSE.node1
  for (let i = 0; i < N; i++) {
    openings.push(
      medallion(i * bay, n1.r, n1.foils, n1.centerDist, n1.foilRadius, n1.phase, 2, i),
    )
  }

  // ---- C: middle order — taller cinquefoil-cusped lights (one per bay)
  const c = ROSE.bandC
  const cHalf = c.mullionWidth / 2
  for (let i = 0; i < N; i++) {
    const thetaA = i * bay
    const thetaB = (i + 1) * bay
    openings.push({
      points: lightPoints(
        { theta: thetaA, halfW: cHalf },
        { theta: thetaB, halfW: cHalf },
        c.rIn,
        c.rSpring,
        c.rApex,
        c.cusp,
      ),
      center: polar(thetaA + bay / 2, (c.rIn + c.rApex) / 2),
      ring: 3,
      index: i,
    })
  }

  // ---- 2: sexfoil node ring on the spokes
  const n2 = ROSE.node2
  for (let i = 0; i < N; i++) {
    openings.push(
      medallion(i * bay, n2.r, n2.foils, n2.centerDist, n2.foilRadius, n2.phase, 4, i),
    )
  }

  // ---- D: outer order — first-order arches subdivided into twin trefoil
  // sub-lancets under a small quatrefoil; the enclosing arch survives as a
  // hood molding, so each outer bay reads as a light within a light.
  const d = ROSE.bandD
  const dHalf = d.mullionWidth / 2
  for (let i = 0; i < N; i++) {
    const thetaA = i * bay
    const thetaB = (i + 1) * bay
    const thetaC = thetaA + bay / 2

    // first-order enclosing arch (hood only, not a hole)
    hoodOutlines.push(
      lightPoints(
        { theta: thetaA, halfW: dHalf },
        { theta: thetaB, halfW: dHalf },
        d.rIn,
        d.rSpring,
        d.rApex,
        0,
      ),
    )

    // twin sub-lancets
    openings.push({
      points: lightPoints(
        { theta: thetaA, halfW: dHalf + 0.01 },
        { theta: thetaC, halfW: d.subHalf },
        d.sub.rIn,
        d.sub.rSpring,
        d.sub.rApex,
        d.sub.cusp,
      ),
      center: polar(thetaC - bay / 4, (d.sub.rIn + d.sub.rApex) / 2),
      ring: 5,
      index: i * 2,
    })
    openings.push({
      points: lightPoints(
        { theta: thetaC, halfW: d.subHalf },
        { theta: thetaB, halfW: dHalf + 0.01 },
        d.sub.rIn,
        d.sub.rSpring,
        d.sub.rApex,
        d.sub.cusp,
      ),
      center: polar(thetaC + bay / 4, (d.sub.rIn + d.sub.rApex) / 2),
      ring: 5,
      index: i * 2 + 1,
    })

    // small quatrefoil in the head of the enclosing arch
    const q = d.quatrefoil
    openings.push(
      medallion(thetaC, q.r, q.foils, q.centerDist, q.foilRadius, q.phase, 6, i),
    )
  }

  return { openings, hoodOutlines }
}

// ---------------------------------------------------------------------------
// Geometry assembly
// ---------------------------------------------------------------------------

export function buildRoseGeometries(): {
  stoneGeometry: THREE.ExtrudeGeometry
  moldingGeometry: THREE.BufferGeometry
  splayGeometry: THREE.BufferGeometry
  wallGeometry: THREE.ExtrudeGeometry
  openings: Opening[]
} {
  const { openings, hoodOutlines } = buildOpenings()

  // Stone plate: one shape, every opening a hole — the framework of rings,
  // mullions and spandrels is the negative space between them. No bevel: the
  // opening rims are dressed by the swept moldings instead. The plate is now
  // thick (front → deep back) so each hole is a real reveal.
  const plate = new THREE.Shape(
    ensureWinding(arcPoints(0, 0, ROSE.plateRadius, 0, TAU, 160).slice(0, -1), true),
  )
  for (const o of openings) {
    plate.holes.push(new THREE.Path(ensureWinding(o.points.map((p) => p.clone()), false)))
  }
  const stoneGeometry = new THREE.ExtrudeGeometry(plate, {
    depth: ROSE.plateFront - ROSE.plateBack,
    bevelEnabled: false,
  })
  stoneGeometry.translate(0, 0, ROSE.plateBack)

  // Carved profile (chamfer, fillet, twin ribs) swept around every opening,
  // plus the first-order hood moldings over the outer band's enclosing
  // arches, and the concentric archivolt rolls on the thick outer rim.
  // Narrow the rim profile a touch so the swept roll sits on the slender bars
  // between the now well-separated openings rather than overrunning them.
  const profile = buildMoldingProfile(ROSE.plateFront).map((r) => ({ ...r, d: r.d * 0.7 }))
  const hood = buildHoodProfile(ROSE.plateFront, 0.85)
  const archivoltProfile = buildHoodProfile(ROSE.plateFront, 1.1)
  const ringCircle = (r: number) =>
    ensureWinding(arcPoints(0, 0, r, 0, TAU, 200).slice(0, -1), true)
  const moldingGeometry = mergeGeometries([
    ...openings.map((o) => sweepMolding(o.points, profile)),
    ...hoodOutlines.map((pts) => sweepMolding(pts, hood)),
    ...ROSE.archivolt.map((r) => sweepMolding(ringCircle(r), archivoltProfile)),
  ])!

  // Splayed (conical) reveal stepping the thick wall down to the tracery rim.
  const splayProfile = [
    new THREE.Vector2(4.86, -0.05),
    new THREE.Vector2(5.14, 0.16),
    new THREE.Vector2(5.2, 0.2),
    new THREE.Vector2(5.6, 0.45),
  ]
  const splayGeometry = new THREE.LatheGeometry(splayProfile, 96)
  splayGeometry.rotateX(Math.PI / 2)

  // Surrounding wall with a circular reveal the splay sits inside.
  const wall = new THREE.Shape()
  wall.moveTo(-16, -13)
  wall.lineTo(16, -13)
  wall.lineTo(16, 13)
  wall.lineTo(-16, 13)
  wall.closePath()
  wall.holes.push(
    new THREE.Path(ensureWinding(arcPoints(0, 0, ROSE.wallHoleRadius, 0, TAU, 96).slice(0, -1), false)),
  )
  const wallGeometry = new THREE.ExtrudeGeometry(wall, {
    depth: 1.2,
    bevelEnabled: false,
  })
  wallGeometry.translate(0, 0, -0.75) // wall front face at z = 0.45

  return { stoneGeometry, moldingGeometry, splayGeometry, wallGeometry, openings }
}

// ---------------------------------------------------------------------------
// Callout anchors — derived from the same layout constants, so they always
// land on geometry.
// ---------------------------------------------------------------------------

const zFace = ROSE.stoneDepth / 2 + 0.05

export const roseAnchors: Record<string, [number, number, number]> = {
  oculus: [0, 0, zFace],
  // a radial mullion: the top spoke (90°), between the oculus and band A
  mullion: (() => {
    const p = polar(Math.PI / 2, (ROSE.bandA.rIn + ROSE.oculus.foilRadius + 0.4))
    return [p.x, p.y, zFace] as [number, number, number]
  })(),
  // a cusped middle-order light (band C), lower right, clear of the panel
  trefoil: (() => {
    const bay = TAU / ROSE.spokes
    const p = polar(13.5 * bay, (ROSE.bandC.rIn + ROSE.bandC.rApex) / 2)
    return [p.x, p.y, zFace] as [number, number, number]
  })(),
  // an outer sub-lancet glass pane (band D), upper right
  pane: (() => {
    const bay = TAU / ROSE.spokes
    const p = polar(2.25 * bay, (ROSE.bandD.sub.rIn + ROSE.bandD.sub.rApex) / 2)
    return [p.x, p.y, zFace] as [number, number, number]
  })(),
}
