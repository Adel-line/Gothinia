import * as THREE from 'three'

/**
 * Shared 2D Gothic construction kit. Every scene's tracery is drawn as
 * closed outlines in a wall plane (XY, facing +Z) with these primitives:
 * true two-centre pointed arches, exact multifoil cusping, and straight
 * offset-mullion edges — then extruded or swept into stone.
 */

export const TAU = Math.PI * 2

export function polar(angle: number, radius: number): THREE.Vector2 {
  return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius)
}

export function arcPoints(
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
export function angleDelta(base: number, a: number): number {
  let d = (a - base) % TAU
  if (d > Math.PI) d -= TAU
  if (d <= -Math.PI) d += TAU
  return d
}

export function ensureWinding(points: THREE.Vector2[], ccw: boolean): THREE.Vector2[] {
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
export function edgePoint(thetaM: number, side: 1 | -1, r: number, halfWidth: number): THREE.Vector2 {
  const u = new THREE.Vector2(Math.cos(thetaM), Math.sin(thetaM))
  const n = new THREE.Vector2(-u.y, u.x)
  const along = Math.sqrt(Math.max(r * r - halfWidth * halfWidth, 0))
  return u.multiplyScalar(along).addScaledVector(n, side * halfWidth)
}

/**
 * Head of a pointed arch from `sStart` to `sEnd` (traversed in that order),
 * bulging away from the origin — springing lines above/right of the origin
 * rise upward/outward, which holds for radial rose wedges and for arcade
 * arches whose springers sit above y = 0 in scene-local coordinates.
 * Both centres lie on the springing chord at ±e from its midpoint;
 * `apexHeight` is the rise above the chord midpoint. With half-span h:
 * e = (H² - h²) / 2h, radius = h + e — the classical two-centre construction
 * (H = h·√3 would be the equilateral arch). Optionally cusps each arc at its
 * midpoint to form a trefoil head.
 */
export function pointedHead(
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
  if (yhat.dot(mid) < 0) yhat.negate() // rise away from the scene origin

  const H = Math.max(apexHeight, h * 1.02) // pointed arches rise above the semicircle
  if (import.meta.env?.DEV && apexHeight < h * 1.15) {
    // apexHeight this close to h yields a near-semicircular "drop" arch, not
    // a Gothic point — the caller's rSpring/rApex span doesn't match its
    // width and needs retuning (see tracery.ts's archApex for the pattern).
    console.warn(
      `pointedHead: apexHeight ${apexHeight.toFixed(3)} is too small for half-span ${h.toFixed(3)} ` +
        `(ratio ${(apexHeight / h).toFixed(2)}, want >~1.3) — arch will render nearly round, not pointed.`,
    )
  }
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

/**
 * Multifoil: n semicircular foils whose arcs meet at inward-pointing cusps —
 * the cusp is the exact intersection of adjacent foil circles. `center` and
 * `phase` place and rotate it, so the same construction serves a rose
 * oculus and the small quatrefoils in sub-tracery heads.
 */
export function multifoilPoints(
  n: number,
  d: number,
  rf: number,
  center = new THREE.Vector2(0, 0),
  phase = 0,
  segments = 30,
): THREE.Vector2[] {
  const halfStep = Math.PI / n
  // cusp = OUTER intersection of adjacent foil circles (the union boundary)
  const cuspRadius = d * Math.cos(halfStep) + Math.sqrt(rf * rf - d * d * Math.sin(halfStep) ** 2)

  const pts: THREE.Vector2[] = []
  for (let i = 0; i < n; i++) {
    const theta = phase + (i / n) * TAU
    const c = polar(theta, d).add(center)
    const cuspNext = polar(theta + halfStep, cuspRadius).add(center)
    const psi = Math.abs(angleDelta(theta, Math.atan2(cuspNext.y - c.y, cuspNext.x - c.x)))
    // foil arc sweeps symmetrically through its outward direction, cusp to cusp
    const arc = arcPoints(c.x, c.y, rf, theta - psi, theta + psi, segments)
    pts.push(...arc.slice(0, -1))
  }
  return ensureWinding(pts, true)
}

/**
 * Cusped spherical triangle (the "curvilinear triangle" that fills the
 * spandrels of a rose between three tangent circles, and the corners between
 * an outer wreath and its bounding ring). Given three corners, each side is
 * drawn as a circular arc bulging INWARD toward the centroid, so the three
 * sides meet at sharp points — a genuine spandrel opening, never a blank gap.
 * `bulge` is the sagitta of each concave side as a fraction of that side's
 * length; `cuspDepth` optionally nicks a foil-cusp into the middle of each
 * side so the triangle reads as a cusped trefoil-triangle.
 */
export function sphericalTriangle(
  corners: [THREE.Vector2, THREE.Vector2, THREE.Vector2],
  bulge: number,
  cuspDepth = 0,
  segments = 12,
): THREE.Vector2[] {
  const centroid = corners[0].clone().add(corners[1]).add(corners[2]).multiplyScalar(1 / 3)
  const pts: THREE.Vector2[] = []
  for (let e = 0; e < 3; e++) {
    const a = corners[e]
    const b = corners[(e + 1) % 3]
    const mid = a.clone().add(b).multiplyScalar(0.5)
    const toC = centroid.clone().sub(mid)
    const len = a.distanceTo(b)
    if (toC.lengthSq() < 1e-9 || len < 1e-6) {
      pts.push(a.clone())
      continue
    }
    toC.normalize()
    // apex of the concave arc, pulled toward the centroid
    const apex = mid.clone().addScaledVector(toC, bulge * len)
    // circle through a, apex, b — sample it as the side
    const arc = arcThroughThree(a, apex, b, segments)
    if (cuspDepth > 0) {
      const i = Math.floor(arc.length / 2)
      arc[i] = arc[i].clone().addScaledVector(toC, cuspDepth * len)
    }
    // drop the last point; the next side starts at b
    for (let i = 0; i < arc.length - 1; i++) pts.push(arc[i])
  }
  return ensureWinding(pts, true)
}

/** Sample the circular arc that passes through p0 -> p1 -> p2 (in order). */
function arcThroughThree(
  p0: THREE.Vector2,
  p1: THREE.Vector2,
  p2: THREE.Vector2,
  segments: number,
): THREE.Vector2[] {
  const ax = p0.x, ay = p0.y, bx = p1.x, by = p1.y, cx = p2.x, cy = p2.y
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
  if (Math.abs(d) < 1e-9) return [p0.clone(), p1.clone(), p2.clone()] // collinear
  const a2 = ax * ax + ay * ay
  const b2 = bx * bx + by * by
  const c2 = cx * cx + cy * cy
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d
  const center = new THREE.Vector2(ux, uy)
  const r = center.distanceTo(p0)
  const a0 = Math.atan2(ay - uy, ax - ux)
  const aMid = Math.atan2(by - uy, bx - ux)
  const aEnd = Math.atan2(cy - uy, cx - ux)
  const norm = (x: number) => ((x % TAU) + TAU) % TAU
  // sweep CCW from a0 unless p1 isn't reached before p2 that way, then CW
  const midCcw = norm(aMid - a0)
  const endCcw = norm(aEnd - a0)
  const total = midCcw <= endCcw ? endCcw : endCcw - TAU
  const out: THREE.Vector2[] = []
  for (let i = 0; i <= segments; i++) {
    const t = a0 + (total * i) / segments
    out.push(new THREE.Vector2(ux + Math.cos(t) * r, uy + Math.sin(t) * r))
  }
  return out
}

/**
 * A pointed-arch opening in wall coordinates: flat sill, straight jambs,
 * two-centre head. Returns a closed CCW outline.
 */
export function archOutline(
  cx: number,
  span: number,
  ySill: number,
  ySpring: number,
  yApex: number,
  cuspDepth = 0,
): THREE.Vector2[] {
  const s = span / 2
  const sA = new THREE.Vector2(cx - s, ySpring)
  const sB = new THREE.Vector2(cx + s, ySpring)
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(cx - s, ySill),
    new THREE.Vector2(cx + s, ySill),
    ...pointedHead(sB, sA, yApex - ySpring, cuspDepth),
  ]
  return ensureWinding(pts, true)
}
