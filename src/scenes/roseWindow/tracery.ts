import * as THREE from 'three'

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

const TAU = Math.PI * 2

// ---------------------------------------------------------------------------
// Radial layout (world units; the rose is ~10 units across)
// ---------------------------------------------------------------------------
export const ROSE = {
  plateRadius: 4.9,
  wallHoleRadius: 4.82,
  stoneDepth: 0.6,
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

// ---------------------------------------------------------------------------
// 2D helpers
// ---------------------------------------------------------------------------

function polar(angle: number, radius: number): THREE.Vector2 {
  return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius)
}

function arcPoints(
  cx: number,
  cy: number,
  radius: number,
  a1: number,
  a2: number,
  segments: number,
): THREE.Vector2[] {
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= segments; i++) {
    const a = a1 + ((a2 - a1) * i) / segments
    pts.push(new THREE.Vector2(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius))
  }
  return pts
}

/** Signed angle from `base` to `a`, normalised to (-PI, PI]. */
function angleDelta(base: number, a: number): number {
  let d = (a - base) % TAU
  if (d > Math.PI) d -= TAU
  if (d <= -Math.PI) d += TAU
  return d
}

function ensureWinding(points: THREE.Vector2[], ccw: boolean): THREE.Vector2[] {
  const area = THREE.ShapeUtils.area(points)
  if ((area > 0) !== ccw) points.reverse()
  return points
}

/**
 * Point at radius `r` on the straight edge running parallel to the mullion
 * centreline at angle `thetaM`, offset by `halfWidth` to `side` (+1 = toward
 * increasing angle). Straight offset lines give the mullions constant width,
 * the way a stonecutter would actually dress them.
 */
function edgePoint(thetaM: number, side: 1 | -1, r: number, halfWidth: number): THREE.Vector2 {
  const u = new THREE.Vector2(Math.cos(thetaM), Math.sin(thetaM))
  const n = new THREE.Vector2(-u.y, u.x)
  const along = Math.sqrt(Math.max(r * r - halfWidth * halfWidth, 0))
  return u.multiplyScalar(along).addScaledVector(n, side * halfWidth)
}

// ---------------------------------------------------------------------------
// Pointed arch head — two intersecting circular arcs
// ---------------------------------------------------------------------------

/**
 * Head of a pointed arch from `sStart` to `sEnd` (traversed in that order),
 * bulging away from the origin. Both centres lie on the springing chord at
 * ±e from its midpoint; `apexHeight` is the rise above the chord midpoint.
 * With half-span h: e = (H² - h²) / 2h, radius = h + e — the classical
 * two-centre construction (H = h·√3 would be the equilateral arch).
 * Optionally cusps each arc at its midpoint to form a trefoil head.
 */
function pointedHead(
  sStart: THREE.Vector2,
  sEnd: THREE.Vector2,
  apexHeight: number,
  cuspDepth: number,
): THREE.Vector2[] {
  const mid = sStart.clone().add(sEnd).multiplyScalar(0.5)
  const xhat = sStart.clone().sub(sEnd)
  const h = xhat.length() / 2
  xhat.normalize()
  const yhat = new THREE.Vector2(-xhat.y, xhat.x)
  if (yhat.dot(mid) < 0) yhat.negate() // rise away from the window centre

  const H = Math.max(apexHeight, h * 1.02) // pointed arches rise above the semicircle
  const e = (H * H - h * h) / (2 * h)
  const Ra = h + e
  const ya = Math.sqrt(Ra * Ra - e * e)

  const local = (x: number, y: number) =>
    mid.clone().addScaledVector(xhat, x).addScaledVector(yhat, y)

  const sampleBranch = (cx: number, a1: number, a2: number, segments: number) => {
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= segments; i++) {
      const a = a1 + ((a2 - a1) * i) / segments
      pts.push(local(cx + Math.cos(a) * Ra, Math.sin(a) * Ra))
    }
    return pts
  }

  const alpha = Math.atan2(ya, e)
  // rising branch: sStart (local +h,0) -> apex, centred at (-e, 0)
  const branch1 = sampleBranch(-e, 0, alpha, 16)
  // falling branch: apex -> sEnd (local -h,0), centred at (+e, 0)
  const branch2 = sampleBranch(e, Math.PI - alpha, Math.PI, 16)

  if (cuspDepth > 0) {
    const throat = local(0, H * 0.3) // cusps point at the throat of the light
    for (const branch of [branch1, branch2]) {
      const i = Math.floor(branch.length / 2)
      const q = branch[i]
      const inward = throat.clone().sub(q).normalize()
      branch[i] = q.clone().addScaledVector(inward, cuspDepth)
    }
  }

  return [...branch1, ...branch2.slice(1)]
}

// ---------------------------------------------------------------------------
// Openings
// ---------------------------------------------------------------------------

/**
 * Multifoil oculus: n semicircular foils whose arcs meet at inward-pointing
 * cusps — the cusp is the exact intersection of adjacent foil circles.
 */
function multifoilPoints(n: number, d: number, rf: number): THREE.Vector2[] {
  const halfStep = Math.PI / n
  // cusp = OUTER intersection of adjacent foil circles (the union boundary)
  const cuspRadius = d * Math.cos(halfStep) + Math.sqrt(rf * rf - d * d * Math.sin(halfStep) ** 2)

  const pts: THREE.Vector2[] = []
  for (let i = 0; i < n; i++) {
    const theta = (i / n) * TAU
    const c = polar(theta, d)
    const cuspNext = polar(theta + halfStep, cuspRadius)
    const psi = Math.abs(angleDelta(theta, Math.atan2(cuspNext.y - c.y, cuspNext.x - c.x)))
    // foil arc sweeps symmetrically through its outward direction, cusp to cusp
    const arc = arcPoints(c.x, c.y, rf, theta - psi, theta + psi, 30)
    pts.push(...arc.slice(0, -1))
  }
  return ensureWinding(pts, true)
}

interface BandSpec {
  count: number
  rIn: number
  rSpring: number
  rApex: number
  mullionWidth: number
  cuspDepth: number
}

/** One wedge-shaped light between two radial mullions, with a pointed head. */
function wedgeLightPoints(band: BandSpec, i: number): THREE.Vector2[] {
  const sector = TAU / band.count
  const thetaA = i * sector // mullion on the low-angle side
  const thetaB = (i + 1) * sector
  const halfW = band.mullionWidth / 2

  const cA = edgePoint(thetaA, 1, band.rIn, halfW)
  const cB = edgePoint(thetaB, -1, band.rIn, halfW)
  const sA = edgePoint(thetaA, 1, band.rSpring, halfW)
  const sB = edgePoint(thetaB, -1, band.rSpring, halfW)

  const springMid = sA.clone().add(sB).multiplyScalar(0.5)
  const apexHeight = band.rApex - springMid.length()

  const pts: THREE.Vector2[] = [
    // sill: arc along the inner ring from A to B (CCW, interior on the left)
    ...arcPoints(0, 0, band.rIn, Math.atan2(cA.y, cA.x), Math.atan2(cB.y, cB.x), 8),
    // jamb up to the B springer (straight line implied), then the pointed head
    ...pointedHead(sB, sA, apexHeight, band.cuspDepth),
    // closing straight edge sA -> cA is implied by the closed shape
  ]
  return ensureWinding(pts, true)
}

export function buildOpenings(): Opening[] {
  const openings: Opening[] = []

  const { foils, centerDist, foilRadius } = ROSE.oculus
  openings.push({
    points: multifoilPoints(foils, centerDist, foilRadius),
    center: new THREE.Vector2(0, 0),
    ring: 0,
    index: 0,
  })

  for (const [ring, band] of [ROSE.band1, ROSE.band2].entries()) {
    for (let i = 0; i < band.count; i++) {
      const thetaC = (i + 0.5) * (TAU / band.count)
      openings.push({
        points: wedgeLightPoints(band, i),
        center: polar(thetaC, (band.rIn + band.rApex) / 2),
        ring: ring + 1,
        index: i,
      })
    }
  }
  return openings
}

// ---------------------------------------------------------------------------
// Geometry assembly
// ---------------------------------------------------------------------------

export function buildRoseGeometries(): {
  stoneGeometry: THREE.ExtrudeGeometry
  wallGeometry: THREE.ExtrudeGeometry
  openings: Opening[]
} {
  const openings = buildOpenings()

  // Stone plate: one shape, every opening a hole — the framework of rings
  // and mullions is the negative space between them.
  const plate = new THREE.Shape(
    ensureWinding(arcPoints(0, 0, ROSE.plateRadius, 0, TAU, 128).slice(0, -1), true),
  )
  for (const o of openings) {
    plate.holes.push(new THREE.Path(ensureWinding(o.points.map((p) => p.clone()), false)))
  }
  const stoneGeometry = new THREE.ExtrudeGeometry(plate, {
    depth: ROSE.stoneDepth,
    bevelEnabled: true,
    bevelThickness: 0.045,
    bevelSize: 0.035,
    bevelSegments: 2,
  })
  stoneGeometry.translate(0, 0, -ROSE.stoneDepth / 2)

  // Surrounding wall with a circular reveal the rose sits inside.
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
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 1,
  })
  wallGeometry.translate(0, 0, -0.75) // tracery sits recessed inside the reveal

  return { stoneGeometry, wallGeometry, openings }
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
