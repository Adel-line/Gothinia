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
  sphericalTriangle,
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
const N_SPOKES = 16

/** Constant dressed-stone bar: every mullion, ring-course and cusp bar in the
 *  window is this wide, so the tracery reads as one even skeletal net (the
 *  single most consistent feature of 13th-c. French bar tracery). */
const BAR = 0.05 // half-width; full bar ≈ 0.10

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

  /** Sixteen radial mullions near the centre, doubling to thirty-two in the
   *  outer fan — the spoke-doubling that drives a Notre-Dame / Saint-Denis
   *  rose and produces its dense sunburst of pointed lancets. */
  spokes: N_SPOKES,
  outerSpokes: N_SPOKES * 2,

  bar: BAR,

  // A dense concentric PROGRAM, packed so a thin ~0.10 stone bar (never a wide
  // blank annulus) separates every opening from its neighbours. Reading out:
  //
  //   ring 0  central twelve-foil OCULUS rosette
  //   ring 1  ×16 pointed trefoil-cusped inner lancets
  //   ring 2  ×16 quatrefoil node medallions on the spokes
  //   ring 3  ×32 twin sub-lancets  ┐ the middle order: a tall pointed light
  //   ring 4  ×16 sexfoil head-foils┘ per bay, SUBDIVIDED by its own bar
  //           tracery (two sub-lancets under a foiled circle) beneath a hooded
  //           enclosing arch — arches nested inside arches, after Strasbourg
  //   ring 5  ×16 sexfoil node medallions — the DOUBLING string-course
  //   ring 6  ×32 narrow pointed trefoil-cusped lancets — the outer fan
  //   ring 7  ×32 foiled-circle medallions — the outer wreath
  //   ring 8  ×32 cusped spherical-triangle spandrels filling between the
  //           wreath circles, so no gap is ever left blank
  //   + two molded archivolt rolls on the rim inside plateRadius 4.9
  oculus: { foils: 12, centerDist: 0.24, foilRadius: 0.185 },

  // ring 1 — inner pointed lancets (one per bay)
  bandA: { rIn: 0.55, rSpring: 0.68, rApex: 0.9, cusp: 0.05 },

  // ring 2 — quatrefoil node medallions on every spoke
  node1: { r: 1.1, foils: 4, centerDist: 0.08, foilRadius: 0.11, phase: Math.PI / 4 },

  // rings 3+4 — middle order: a tall enclosing pointed arch per bay, subdivided
  // into twin sub-lancets (ring 3) under a sexfoil head-circle (ring 4); the
  // enclosing arch itself survives only as a raised hood molding.
  bandC: {
    rIn: 1.35,
    rSpring: 1.52,
    rApex: 2.3,
    sub: { rIn: 1.44, rSpring: 1.56, rApex: 1.74, cusp: 0.035 },
    head: { r: 2.0, foils: 6, centerDist: 0.085, foilRadius: 0.105, phase: Math.PI / 6 },
  },

  // ring 5 — sexfoil node medallions on the spokes (the doubling course)
  node2: { r: 2.6, foils: 6, centerDist: 0.095, foilRadius: 0.125, phase: 0 },

  // ring 6 — outer fan of narrow pointed lancets (two per bay = 32)
  bandD: { rIn: 2.9, rSpring: 3.04, rApex: 3.86, cusp: 0.045 },

  // ring 7 — outer wreath of foiled-circle medallions (32, one per outer light)
  wreath: { r: 4.21, foils: 4, centerDist: 0.13, foilRadius: 0.185, phase: Math.PI / 4 },

  // ring 8 — cusped spherical-triangle spandrels between wreath circles
  spandrel: { rInner: 3.9, rOuter: 4.3, halfSpan: 0.46, bulge: 0.2, cusp: 0.14 },

  // ring 8 (inner set) — cusped spandrels on the doubling string-course,
  // pointing outward toward the fan sill from between the sexfoil nodes
  midSpandrel: { rInner: 2.46, rOuter: 2.86, halfSpan: 0.34, bulge: 0.18, cusp: 0.12 },

  // molded archivolt rolls carried on the thick outer rim — clear of the wreath
  // (outer edge ~4.46) and inside the splay reveal (4.86)
  archivolt: [4.58, 4.73],
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
   * Enclosing-arch outlines for the middle (ring 3/4) order. These are NOT
   * holes — they carry a raised hood molding on the plate face, marking the
   * heavier order of tracery that frames each pair of sub-lancets, so every
   * middle bay reads as a light-within-a-light.
   */
  hoodOutlines: THREE.Vector2[][]
}

export function buildOpenings(): RosePlan {
  const openings: Opening[] = []
  const hoodOutlines: THREE.Vector2[][] = []
  const N = ROSE.spokes // 16 inner spokes
  const N2 = ROSE.outerSpokes // 32 outer mullions (the doubling)
  const bay = TAU / N
  const bay2 = TAU / N2
  const H = ROSE.bar // mullion half-width (constant throughout)

  // ---- ring 0: central twelve-foil oculus rosette
  const oc = ROSE.oculus
  openings.push({
    points: multifoilPoints(oc.foils, oc.centerDist, oc.foilRadius),
    center: new THREE.Vector2(0, 0),
    ring: 0,
    index: 0,
  })

  // ---- ring 1: inner pointed trefoil-cusped lancets (one per bay)
  const a = ROSE.bandA
  for (let i = 0; i < N; i++) {
    openings.push({
      points: lightPoints(
        { theta: i * bay, halfW: H },
        { theta: (i + 1) * bay, halfW: H },
        a.rIn,
        a.rSpring,
        a.rApex,
        a.cusp,
      ),
      center: polar(i * bay + bay / 2, (a.rIn + a.rApex) / 2),
      ring: 1,
      index: i,
    })
  }

  // ---- ring 2: quatrefoil node medallions, one on every spoke
  const n1 = ROSE.node1
  for (let i = 0; i < N; i++) {
    openings.push(
      medallion(i * bay, n1.r, n1.foils, n1.centerDist, n1.foilRadius, n1.phase, 2, i),
    )
  }

  // ---- rings 3+4: the middle order. Each bay is a tall pointed enclosing
  // arch (hood molding only) subdivided into twin sub-lancets under a sexfoil
  // head-circle — bar tracery nested inside a light, after Strasbourg.
  const c = ROSE.bandC
  for (let i = 0; i < N; i++) {
    const thetaA = i * bay
    const thetaB = (i + 1) * bay
    const thetaMid = thetaA + bay / 2

    // enclosing arch → raised hood on the plate face (not a hole)
    hoodOutlines.push(
      lightPoints({ theta: thetaA, halfW: H }, { theta: thetaB, halfW: H }, c.rIn, c.rSpring, c.rApex, 0),
    )

    // twin sub-lancets sharing the central sub-mullion (ring 3)
    openings.push({
      points: lightPoints(
        { theta: thetaA, halfW: H },
        { theta: thetaMid, halfW: H },
        c.sub.rIn,
        c.sub.rSpring,
        c.sub.rApex,
        c.sub.cusp,
      ),
      center: polar(thetaA + bay / 4, (c.sub.rIn + c.sub.rApex) / 2),
      ring: 3,
      index: i * 2,
    })
    openings.push({
      points: lightPoints(
        { theta: thetaMid, halfW: H },
        { theta: thetaB, halfW: H },
        c.sub.rIn,
        c.sub.rSpring,
        c.sub.rApex,
        c.sub.cusp,
      ),
      center: polar(thetaB - bay / 4, (c.sub.rIn + c.sub.rApex) / 2),
      ring: 3,
      index: i * 2 + 1,
    })

    // sexfoil head-circle in the pointed head of the enclosing arch (ring 4)
    const hd = c.head
    openings.push(medallion(thetaMid, hd.r, hd.foils, hd.centerDist, hd.foilRadius, hd.phase, 4, i))
  }

  // ---- ring 5: sexfoil node medallions on the spokes — the doubling course
  const n2 = ROSE.node2
  for (let i = 0; i < N; i++) {
    openings.push(
      medallion(i * bay, n2.r, n2.foils, n2.centerDist, n2.foilRadius, n2.phase, 5, i),
    )
  }

  // ---- ring 8 (inner set): cusped spherical-triangle spandrels centred BETWEEN
  // the sexfoil nodes, exactly where each odd outer mullion springs from the
  // string-course. They fill what would otherwise be a plain stone band and
  // make the 16→32 doubling read as a springing of fresh cusped members.
  const ms = ROSE.midSpandrel
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) * bay
    const corners: [THREE.Vector2, THREE.Vector2, THREE.Vector2] = [
      polar(t, ms.rOuter),
      polar(t - bay * ms.halfSpan, ms.rInner),
      polar(t + bay * ms.halfSpan, ms.rInner),
    ]
    openings.push({
      points: sphericalTriangle(corners, ms.bulge, ms.cusp),
      center: polar(t, (ms.rInner + ms.rOuter) / 2),
      ring: 8,
      index: 100 + i,
    })
  }

  // ---- ring 6: outer fan of narrow pointed trefoil-cusped lancets. Thirty-two
  // mullions at every half-bay: the even ones continue the sixteen spokes, the
  // odd ones spring fresh from the ring-5 string-course — the visible doubling.
  const d = ROSE.bandD
  for (let k = 0; k < N2; k++) {
    openings.push({
      points: lightPoints(
        { theta: k * bay2, halfW: H },
        { theta: (k + 1) * bay2, halfW: H },
        d.rIn,
        d.rSpring,
        d.rApex,
        d.cusp,
      ),
      center: polar(k * bay2 + bay2 / 2, (d.rIn + d.rApex) / 2),
      ring: 6,
      index: k,
    })
  }

  // ---- ring 7: outer wreath of foiled-circle medallions, one crowning each
  // outer light (centred on the mid-angle of every outer bay)
  const w = ROSE.wreath
  for (let k = 0; k < N2; k++) {
    openings.push(
      medallion(k * bay2 + bay2 / 2, w.r, w.foils, w.centerDist, w.foilRadius, w.phase, 7, k),
    )
  }

  // ---- ring 8: cusped spherical-triangle spandrels between the wreath
  // circles (centred on the outer mullion angles), filling what would
  // otherwise be blank stone between the round medallions
  const sp = ROSE.spandrel
  for (let k = 0; k < N2; k++) {
    const t = k * bay2
    const corners: [THREE.Vector2, THREE.Vector2, THREE.Vector2] = [
      polar(t, sp.rInner),
      polar(t + bay2 * sp.halfSpan, sp.rOuter),
      polar(t - bay2 * sp.halfSpan, sp.rOuter),
    ]
    openings.push({
      points: sphericalTriangle(corners, sp.bulge, sp.cusp),
      center: polar(t, (sp.rInner + sp.rOuter) / 2),
      ring: 8,
      index: k,
    })
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

  // Carved moldings, dressed by ORDER of tracery so no roll ever overruns its
  // stone bar (a member's roll reaches at most half its mullion, so where two
  // members share a mullion the half-rolls meet cleanly at the centreline as
  // ONE roll — never two independent rolls crossing). Because every bar is now
  // the same constant width, the rolls are scaled to sit within half of it:
  //   · oculus       — the fullest roll (focal, at the heart)
  //   · primary      — the two big lancet fans (ring 1 inner, ring 6 outer)
  //   · subordinate  — node/wreath medallions, sub-lancets, head-foils and
  //                    spandrels: a slim chamfer, so the dense cusping stays
  //                    legible instead of clogging with fat rolls
  const base = buildMoldingProfile(ROSE.plateFront)
  const scaled = (s: number) => base.map((r) => ({ ...r, d: r.d * s }))
  const oculusProfile = scaled(0.34)
  const mainProfile = scaled(0.28)
  const slimProfile = scaled(0.17)
  const hood = buildHoodProfile(ROSE.plateFront, 0.34)
  const archivoltProfile = buildHoodProfile(ROSE.plateFront, 0.5)
  const isPrimary = (o: Opening) => o.ring === 1 || o.ring === 6
  const isSubordinate = (o: Opening) =>
    o.ring === 2 || o.ring === 3 || o.ring === 4 || o.ring === 5 || o.ring === 7 || o.ring === 8
  const ringCircle = (r: number) =>
    ensureWinding(arcPoints(0, 0, r, 0, TAU, 200).slice(0, -1), true)
  const moldingGeometry = mergeGeometries([
    ...openings.filter((o) => o.ring === 0).map((o) => sweepMolding(o.points, oculusProfile)),
    ...openings.filter(isPrimary).map((o) => sweepMolding(o.points, mainProfile)),
    ...openings.filter(isSubordinate).map((o) => sweepMolding(o.points, slimProfile)),
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
  // a radial mullion: the top spoke (90°), landing on a quatrefoil node that
  // sits astride the mullion between the inner lancets and the middle order
  mullion: (() => {
    const p = polar(Math.PI / 2, ROSE.node1.r)
    return [p.x, p.y, zFace] as [number, number, number]
  })(),
  // a cusped middle-order light (a ring-3 sub-lancet), lower right of centre
  trefoil: (() => {
    const bay = TAU / ROSE.spokes
    const p = polar(13 * bay + bay / 4, (ROSE.bandC.sub.rIn + ROSE.bandC.sub.rApex) / 2)
    return [p.x, p.y, zFace] as [number, number, number]
  })(),
  // an outer-fan glass pane (a ring-6 lancet), upper right
  pane: (() => {
    const bay2 = TAU / ROSE.outerSpokes
    const p = polar(4.5 * bay2, (ROSE.bandD.rIn + ROSE.bandD.rApex) / 2)
    return [p.x, p.y, zFace] as [number, number, number]
  })(),
}
