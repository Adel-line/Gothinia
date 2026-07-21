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
  const smooth = [...branch1, ...branch2.slice(1)]

  if (cuspDepth <= 0) return smooth

  // Scallop the smooth head into a foiled head: N round lobes that meet at
  // SHARP, symmetric, evenly-spaced cusps — a stonecutter's trefoil, not a
  // single blunt dent. The apex sits at the crest of the middle lobe so the
  // arch stays pointed; cusps fall on the springing sides.
  const nFoils = 3
  const throat = local(0, H * 0.35) // cusps point in toward the light
  const cum = [0]
  for (let i = 1; i < smooth.length; i++) cum.push(cum[i - 1] + smooth[i].distanceTo(smooth[i - 1]))
  const L = cum[cum.length - 1]
  const at = (t: number): THREE.Vector2 => {
    const target = THREE.MathUtils.clamp(t, 0, 1) * L
    let i = 1
    while (i < cum.length - 1 && cum[i] < target) i++
    const f = (target - cum[i - 1]) / Math.max(cum[i] - cum[i - 1], 1e-9)
    return smooth[i - 1].clone().lerp(smooth[i], f)
  }
  const gap = 0.05 / nFoils // arc-length half-width of each cusp notch
  const perLobe = 7
  const out: THREE.Vector2[] = []
  for (let lobe = 0; lobe < nFoils; lobe++) {
    const a = lobe === 0 ? 0 : lobe / nFoils + gap
    const b = lobe === nFoils - 1 ? 1 : (lobe + 1) / nFoils - gap
    for (let s = 0; s <= perLobe; s++) out.push(at(a + ((b - a) * s) / perLobe))
    if (lobe < nFoils - 1) {
      const p = at((lobe + 1) / nFoils)
      const inward = throat.clone().sub(p).normalize()
      out.push(p.clone().addScaledVector(inward, cuspDepth)) // sharp inward cusp tip
    }
  }
  return out
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
