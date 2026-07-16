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
 * Procedural Rayonnant rose window (after the west rose of Sainte-Chapelle,
 * simplified). Everything is constructed with real Gothic tracery logic:
 *
 *  - the whole design radiates from a central multifoil oculus;
 *  - each light (glass opening) has a pointed head built as TWO INTERSECTING
 *    CIRCULAR ARCS whose centres sit on the springing line (the true
 *    two-centre arch construction — e = 0 gives a semicircle, e = half-span
 *    the equilateral arch);
 *  - the inner ring of sixteen lights is cusped into trefoil heads;
 *  - the stone framework is ONE plate with the openings as literal holes,
 *    so mullions and rings emerge from the spacing between lights, exactly
 *    as pierced plate tracery does.
 *
 * The plan is built in 2D (window plane = XY, facing +Z) and extruded.
 */

// ---------------------------------------------------------------------------
// Radial layout (world units; the rose is ~10 units across)
// ---------------------------------------------------------------------------
export const ROSE = {
  plateRadius: 4.9,
  wallHoleRadius: 5.56,
  stoneDepth: 0.6,
  /** front face of the pierced plate; molding rolls crest ~0.06 above it */
  plateFront: 0.235,
  plateBack: -0.3,
  glassZ: -0.12,
  oculus: { foils: 8, centerDist: 0.64, foilRadius: 0.28 },
  band1: { count: 16, rIn: 1.3, rSpring: 2.3, rApex: 2.75, mullionWidth: 0.16, cuspDepth: 0.09 },
  band2: { count: 32, rIn: 3.0, rSpring: 4.0, rApex: 4.45, mullionWidth: 0.12, cuspDepth: 0 },
}

export interface Opening {
  /** Closed 2D outline in the window plane. */
  points: THREE.Vector2[]
  /** Representative centre, used for colour seeding and glass expansion. */
  center: THREE.Vector2
  /** 0 = oculus, 1 = inner band, 2 = outer band. */
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
 * One radial light between two straight (offset-radial) edges, with a
 * pointed head. The sides may belong to different orders of mullion, which
 * is what lets the same function cut first-order lights and the twin
 * sub-lancets inside them.
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
    // jamb up to the B springer (straight line implied), then the pointed head
    ...pointedHead(sB, sA, apexHeight, cuspDepth),
    // closing straight edge sA -> cA is implied by the closed shape
  ]
  return ensureWinding(pts, true)
}

export interface RosePlan {
  openings: Opening[]
  /**
   * First-order arch outlines (band-1 bays and band-2 lights). These are NOT
   * holes — they get a raised hood molding swept along them on the plate
   * face, marking the heavier order of tracery that frames the sub-lights.
   */
  hoodOutlines: THREE.Vector2[][]
}

export function buildOpenings(): RosePlan {
  const openings: Opening[] = []
  const hoodOutlines: THREE.Vector2[][] = []

  const { foils, centerDist, foilRadius } = ROSE.oculus
  openings.push({
    points: multifoilPoints(foils, centerDist, foilRadius),
    center: new THREE.Vector2(0, 0),
    ring: 0,
    index: 0,
  })

  // ---- band 1: each bay is subdivided Rayonnant-fashion into twin trefoil-
  // headed sub-lancets under a rotated quatrefoil, all inside a cusped
  // first-order arch that survives as a hood molding on the plate face.
  const b1 = ROSE.band1
  const bay = TAU / b1.count
  const mainHalf = b1.mullionWidth / 2
  const subHalf = 0.045
  for (let i = 0; i < b1.count; i++) {
    const thetaA = i * bay
    const thetaB = (i + 1) * bay
    const thetaC = thetaA + bay / 2

    hoodOutlines.push(
      lightPoints(
        { theta: thetaA, halfW: mainHalf },
        { theta: thetaB, halfW: mainHalf },
        b1.rIn,
        b1.rSpring,
        b1.rApex,
        b1.cuspDepth,
      ),
    )

    const lanc = { rIn: b1.rIn + 0.04, rSpring: 1.95, rApex: 2.28, cusp: 0.05 }
    openings.push({
      points: lightPoints(
        { theta: thetaA, halfW: mainHalf + 0.005 },
        { theta: thetaC, halfW: subHalf },
        lanc.rIn,
        lanc.rSpring,
        lanc.rApex,
        lanc.cusp,
      ),
      center: polar(thetaC - bay / 4, (lanc.rIn + lanc.rApex) / 2),
      ring: 1,
      index: i * 3,
    })
    openings.push({
      points: lightPoints(
        { theta: thetaC, halfW: subHalf },
        { theta: thetaB, halfW: mainHalf + 0.005 },
        lanc.rIn,
        lanc.rSpring,
        lanc.rApex,
        lanc.cusp,
      ),
      center: polar(thetaC + bay / 4, (lanc.rIn + lanc.rApex) / 2),
      ring: 1,
      index: i * 3 + 1,
    })
    // quatrefoil in the head, lobes on the diagonal
    const qCenter = polar(thetaC, 2.42)
    openings.push({
      points: multifoilPoints(4, 0.1, 0.1, qCenter, Math.PI / 4, 18),
      center: qCenter,
      ring: 1,
      index: i * 3 + 2,
    })
  }

  // ---- band 2: single lights, now with trefoil-cusped heads and their own
  // (lighter) first-order hoods.
  const b2 = ROSE.band2
  const sector = TAU / b2.count
  const b2Half = b2.mullionWidth / 2
  for (let i = 0; i < b2.count; i++) {
    const points = lightPoints(
      { theta: i * sector, halfW: b2Half },
      { theta: (i + 1) * sector, halfW: b2Half },
      b2.rIn,
      b2.rSpring,
      b2.rApex,
      0.055,
    )
    openings.push({
      points,
      center: polar((i + 0.5) * sector, (b2.rIn + b2.rApex) / 2),
      ring: 2,
      index: i,
    })
    hoodOutlines.push(points)
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

  // Stone plate: one shape, every opening a hole — the framework of rings
  // and mullions is the negative space between them. No bevel: the opening
  // rims are dressed by the swept moldings instead.
  const plate = new THREE.Shape(
    ensureWinding(arcPoints(0, 0, ROSE.plateRadius, 0, TAU, 128).slice(0, -1), true),
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
  // plus raised hood moldings along the first-order arches and three plain
  // concentric ring ribs — the heavier orders of tracery that give the
  // framework its layered, carved density.
  const profile = buildMoldingProfile(ROSE.plateFront)
  const hood = buildHoodProfile(ROSE.plateFront, 1)
  const hoodSmall = buildHoodProfile(ROSE.plateFront, 0.7)
  const ringCircle = (r: number) =>
    ensureWinding(arcPoints(0, 0, r, 0, TAU, 160).slice(0, -1), true)
  const moldingGeometry = mergeGeometries([
    ...openings.map((o) => sweepMolding(o.points, profile)),
    ...hoodOutlines.map((pts, i) => sweepMolding(pts, i < ROSE.band1.count ? hood : hoodSmall)),
    sweepMolding(ringCircle(1.08), hood),
    sweepMolding(ringCircle(2.82), hood),
    sweepMolding(ringCircle(4.55), hood),
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
  // mullion between band-1 lights 3 and 4, i.e. the spoke at 90° (top)
  mullion: [0, (ROSE.band1.rIn + ROSE.band1.rSpring) / 2 + 0.15, zFace],
  // band-1 trefoil light centred at 281.25° (lower right, clear of the panel)
  trefoil: (() => {
    const p = polar((12.5 / 16) * TAU, 2.05)
    return [p.x, p.y, zFace] as [number, number, number]
  })(),
  // band-2 glass pane centred at 39.375° (upper right)
  pane: (() => {
    const p = polar((3.5 / 32) * TAU, 3.6)
    return [p.x, p.y, zFace] as [number, number, number]
  })(),
}
