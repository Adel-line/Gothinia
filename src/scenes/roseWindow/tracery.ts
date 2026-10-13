import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { buildHoodProfile, sweepMolding } from '../lib/molding'
import { TAU, arcPoints, ensureWinding } from '../lib/gothic2d'
import traced from './roseTracery.json'

/**
 * The south rose of Notre-Dame de Paris (begun c. 1260), traced from a
 * photograph by tools/trace_rose.py rather than invented: twelve lobed inner
 * lights doubling to twenty-four, medallions and foiled lights out to the rim.
 *
 * Every opening is a hole in ONE stone plate, so the bars, rings and
 * spandrels are simply the stone left between real openings — nothing is
 * layered on top, so nothing can overlap or cut into anything else. The bars'
 * rounded edges come from a normal map computed from distance-to-glass (see
 * the tool), which gives every bar the same roll however narrow it is.
 *
 * The plate is built in 2D (window plane = XY, facing +Z) and extruded.
 */

/** World units per normalised traced unit (1.0 = edge of the glazing). */
const SCALE = 4.5

export const ROSE = {
  /** Glass-and-tracery texture covers this radius (normalised plateRadius). */
  textureRadius: traced.plateRadius * SCALE,
  plateRadius: traced.plateRadius * SCALE,
  wallHoleRadius: 5.56,
  /** About 0.4 m of stone at the rose's real scale (~1.33 m per unit). */
  plateFront: 0.15,
  plateBack: -0.15,
  /** Glass sits in a rebate just behind the middle of the bars. */
  glassZ: -0.04,
}

export interface Opening {
  points: THREE.Vector2[]
  center: THREE.Vector2
}

export function buildOpenings(): Opening[] {
  return traced.openings.map((o) => {
    const pts: THREE.Vector2[] = []
    for (let i = 0; i < o.points.length; i += 2) {
      pts.push(new THREE.Vector2(o.points[i] * SCALE, o.points[i + 1] * SCALE))
    }
    const center = new THREE.Vector2(
      Math.cos(o.theta) * o.r * SCALE,
      Math.sin(o.theta) * o.r * SCALE,
    )
    return { points: pts, center }
  })
}

export function buildRoseGeometries(): {
  stoneGeometry: THREE.ExtrudeGeometry
  moldingGeometry: THREE.BufferGeometry
  splayGeometry: THREE.BufferGeometry
  wallGeometry: THREE.ExtrudeGeometry
  openings: Opening[]
} {
  const openings = buildOpenings()

  // One plate, every opening a hole. Groups: 0 = front/back faces (UVs are
  // world XY, used by the moulding normal map), 1 = the hole walls.
  const plate = new THREE.Shape(
    ensureWinding(arcPoints(0, 0, ROSE.plateRadius, 0, TAU, 200).slice(0, -1), true),
  )
  for (const o of openings) {
    plate.holes.push(new THREE.Path(ensureWinding(o.points.map((p) => p.clone()), false)))
  }
  const stoneGeometry = new THREE.ExtrudeGeometry(plate, {
    depth: ROSE.plateFront - ROSE.plateBack,
    bevelEnabled: false,
    curveSegments: 1,
  })
  stoneGeometry.translate(0, 0, ROSE.plateBack)

  // Two rolls on the rim, outside the outermost glass (normalised 1.0).
  const archivoltProfile = buildHoodProfile(ROSE.plateFront, 0.5)
  const ringCircle = (r: number) => ensureWinding(arcPoints(0, 0, r, 0, TAU, 200).slice(0, -1), true)
  const moldingGeometry = mergeGeometries(
    [4.6, 4.76].map((r) => sweepMolding(ringCircle(r), archivoltProfile)),
  )!

  // Splayed (conical) reveal stepping the thick wall down to the plate rim.
  const splayProfile = [
    new THREE.Vector2(ROSE.plateRadius - 0.04, ROSE.plateBack + 0.1),
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
  const wallGeometry = new THREE.ExtrudeGeometry(wall, { depth: 1.2, bevelEnabled: false })
  wallGeometry.translate(0, 0, -0.75) // wall front face at z = 0.45

  return { stoneGeometry, moldingGeometry, splayGeometry, wallGeometry, openings }
}

// Callout anchors, picked by the tracing tool from the real openings.
const zFace = ROSE.plateFront + 0.02
const anchor = ([x, y]: number[]): [number, number, number] => [x * SCALE, y * SCALE, zFace]

export const roseAnchors: Record<string, [number, number, number]> = {
  oculus: anchor(traced.anchors.oculus),
  /** the bar between two of the twelve inner lights */
  mullion: anchor(traced.anchors.mullion),
  /** one of the foiled lights at the rim */
  trefoil: anchor(traced.anchors.trefoil),
  /** a medallion light in the outer order */
  pane: anchor(traced.anchors.pane),
}
