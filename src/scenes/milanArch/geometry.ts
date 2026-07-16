import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { buildHoodProfile, buildMoldingProfile, sweepMolding } from '../lib/molding'
import { archOutline, ensureWinding, multifoilPoints } from '../lib/gothic2d'

/**
 * Nave arcade elevation after the Duomo di Milano: a tiered wall seen from
 * the side aisle — tall pointed arcade arches on clustered piers, a cornice,
 * then a clerestory of twin cusped lancets under quatrefoils, glazed and
 * glowing. Same construction kit as the rose: one pierced extruded plate,
 * two-centre arch heads, hood moldings marking the heavier order.
 */

export const ARCADE = {
  bayWidth: 3.2,
  bays: 5,
  wallHalfWidth: 9.5,
  wallBottom: -4.8,
  wallTop: 7.6,
  floorY: -4.5,
  plateFront: 0.235,
  plateBack: -0.6,
  glassZ: -0.12,
  arch: { span: 2.4, sill: -4.5, spring: 0.9, apex: 3.3 },
  pier: { shaftTop: 0.55, capTop: 1.0, upperR: 0.2 },
  cornices: [3.95, 7.15],
  clerestory: {
    outline: { span: 1.7, sill: 4.35, spring: 6.0, apex: 6.85 },
    lancet: { span: 0.6, dx: 0.43, sill: 4.42, spring: 5.55, apex: 6.1, cusp: 0.045 },
    quatrefoil: { y: 6.3, d: 0.09, rf: 0.09 },
  },
  farWallZ: -5,
}

export interface ArchOpening {
  points: THREE.Vector2[]
  center: THREE.Vector2
  ring: number
  index: number
}

export function bayCenters(): number[] {
  const xs: number[] = []
  for (let i = 0; i < ARCADE.bays; i++) {
    xs.push((i - (ARCADE.bays - 1) / 2) * ARCADE.bayWidth)
  }
  return xs
}

/** Pier centreline x positions (bay boundaries, including outer edges). */
export function pierXs(): number[] {
  const xs: number[] = []
  for (let i = 0; i <= ARCADE.bays; i++) {
    xs.push((i - ARCADE.bays / 2) * ARCADE.bayWidth)
  }
  return xs
}

export function buildArcadeGeometries(): {
  wallGeometry: THREE.ExtrudeGeometry
  moldingGeometry: THREE.BufferGeometry
  glassOpenings: ArchOpening[]
  farLancets: THREE.Vector2[][]
} {
  const A = ARCADE
  const glassOpenings: ArchOpening[] = []
  const arcadeHoles: THREE.Vector2[][] = []
  const hoodsHeavy: THREE.Vector2[][] = []
  const hoodsLight: THREE.Vector2[][] = []

  for (const [i, cx] of bayCenters().entries()) {
    // arcade arch: a hole straight through the wall into the dark nave
    const arch = archOutline(cx, A.arch.span, A.arch.sill, A.arch.spring, A.arch.apex)
    arcadeHoles.push(arch)
    hoodsHeavy.push(arch)

    // clerestory: twin cusped lancets + diagonal quatrefoil, framed by a
    // first-order arch that survives only as a hood molding
    const c = A.clerestory
    hoodsHeavy.push(archOutline(cx, c.outline.span, c.outline.sill, c.outline.spring, c.outline.apex))
    for (const side of [-1, 1] as const) {
      const l = archOutline(
        cx + side * c.lancet.dx,
        c.lancet.span,
        c.lancet.sill,
        c.lancet.spring,
        c.lancet.apex,
        c.lancet.cusp,
      )
      glassOpenings.push({
        points: l,
        center: new THREE.Vector2(cx + side * c.lancet.dx, (c.lancet.sill + c.lancet.apex) / 2),
        ring: 1,
        index: i * 3 + (side + 1) / 2,
      })
      hoodsLight.push(l)
    }
    const qCenter = new THREE.Vector2(cx, c.quatrefoil.y)
    glassOpenings.push({
      points: multifoilPoints(4, c.quatrefoil.d, c.quatrefoil.rf, qCenter, Math.PI / 4, 18),
      center: qCenter,
      ring: 1,
      index: i * 3 + 2,
    })
  }

  // ---- wall plate with all openings as holes
  const wall = new THREE.Shape()
  wall.moveTo(-A.wallHalfWidth, A.wallBottom)
  wall.lineTo(A.wallHalfWidth, A.wallBottom)
  wall.lineTo(A.wallHalfWidth, A.wallTop)
  wall.lineTo(-A.wallHalfWidth, A.wallTop)
  wall.closePath()
  for (const hole of [...arcadeHoles, ...glassOpenings.map((o) => o.points)]) {
    wall.holes.push(new THREE.Path(ensureWinding(hole.map((p) => p.clone()), false)))
  }
  const wallGeometry = new THREE.ExtrudeGeometry(wall, {
    depth: A.plateFront - A.plateBack,
    bevelEnabled: false,
  })
  wallGeometry.translate(0, 0, A.plateBack)

  // ---- moldings: rim profile around every opening, hoods over the orders
  const profile = buildMoldingProfile(A.plateFront)
  const hood = buildHoodProfile(A.plateFront, 1.4)
  const hoodSmall = buildHoodProfile(A.plateFront, 0.7)
  const moldingGeometry = mergeGeometries([
    ...arcadeHoles.map((pts) => sweepMolding(pts, profile)),
    ...glassOpenings.map((o) => sweepMolding(o.points, profile)),
    ...hoodsHeavy.map((pts) => sweepMolding(pts, hood)),
    ...hoodsLight.map((pts) => sweepMolding(pts, hoodSmall)),
  ])!

  // ---- faint far-aisle lancets, seen through the arcade in the dark
  // (springers kept above y = 0 so pointedHead's away-from-origin rule
  // makes the heads rise, not dip)
  const farLancets = bayCenters().map((cx) => archOutline(cx * 1.15, 1.3, -3.4, 0.2, 1.2))

  return { wallGeometry, moldingGeometry, glassOpenings, farLancets }
}

const zFace = ARCADE.plateFront + 0.12

export const archAnchors: Record<string, [number, number, number]> = {
  apex: [0, ARCADE.arch.apex + 0.12, zFace],
  pier: [-ARCADE.bayWidth / 2, -1.9, 0.7],
  capital: [ARCADE.bayWidth / 2, (ARCADE.pier.shaftTop + ARCADE.pier.capTop) / 2, 0.7],
  clerestory: [
    -ARCADE.clerestory.lancet.dx,
    (ARCADE.clerestory.lancet.sill + ARCADE.clerestory.lancet.apex) / 2,
    zFace,
  ],
}
