import * as THREE from 'three'

/**
 * Molded tracery profiles. Real Rayonnant mullions are not flat plates —
 * they carry a carved cross-section: a splayed chamfer rising from the glass,
 * a fillet step, and a roll (bowtell) cresting at the mullion centreline.
 * We sweep that 2D profile around every glass opening's outline; where two
 * openings share a mullion the two half-profiles meet at the centreline and
 * read as one continuous roll, exactly as dressed stone does.
 *
 * Profile space: `d` = distance outward from the opening edge into the stone,
 * `z` = depth (+z toward the viewer).
 */

interface ProfileRow {
  d: number
  z: number
  /** true = this row starts a new smooth band (hard crease before it) */
  crease: boolean
}

export function buildMoldingProfile(plateFront: number): ProfileRow[] {
  const rows: ProfileRow[] = []
  const push = (d: number, z: number, crease = false) => rows.push({ d, z, crease })

  // splayed chamfer from the glass reveal up toward the light
  push(0.0, 0.04)
  push(0.026, 0.2)
  // fillet riser
  push(0.026, 0.2, true)
  push(0.029, plateFront + 0.024)
  // roll (bowtell): arc cresting at d = 0.08 — the shared mullion centreline
  const cd = 0.08
  const cz = plateFront
  const rr = 0.056
  for (let i = 0; i <= 8; i++) {
    const a = THREE.MathUtils.degToRad(155 - (130 * i) / 8)
    push(cd + Math.cos(a) * rr, cz + Math.sin(a) * rr, i === 0)
  }
  // tail back down onto the plate face (submerges under the neighbouring
  // opening's roll on narrow mullions)
  push(cd + Math.cos(THREE.MathUtils.degToRad(25)) * rr, cz + Math.sin(THREE.MathUtils.degToRad(25)) * rr, true)
  push(0.15, plateFront)
  return rows
}

/**
 * Offset a closed CCW outline outward (away from the opening interior) by
 * `dist`, with miter-clamped corner normals so cusp tips and arch apexes
 * don't spike.
 */
function offsetOutline(pts: THREE.Vector2[], dist: number): THREE.Vector2[] {
  const n = pts.length
  const out: THREE.Vector2[] = []
  const e1 = new THREE.Vector2()
  const e2 = new THREE.Vector2()
  const n1 = new THREE.Vector2()
  const n2 = new THREE.Vector2()
  const m = new THREE.Vector2()

  for (let i = 0; i < n; i++) {
    const p = pts[i]
    e1.subVectors(p, pts[(i - 1 + n) % n])
    e2.subVectors(pts[(i + 1) % n], p)
    // right-hand normals of a CCW outline point away from the interior
    n1.set(e1.y, -e1.x).normalize()
    n2.set(e2.y, -e2.x).normalize()
    m.addVectors(n1, n2)
    if (m.lengthSq() < 0.09) m.copy(n1) // near-reversal (sharp cusp tip)
    m.normalize()
    const scale = 1 / THREE.MathUtils.clamp(m.dot(n1), 0.4, 1)
    out.push(p.clone().addScaledVector(m, dist * scale))
  }
  return out
}

/** Sweep the molding profile around one closed outline. */
export function sweepMolding(outline: THREE.Vector2[], profile: ProfileRow[]): THREE.BufferGeometry {
  // drop consecutive duplicate points — they break normal computation
  const path: THREE.Vector2[] = []
  for (const p of outline) {
    const last = path[path.length - 1]
    if (!last || last.distanceToSquared(p) > 1e-10) path.push(p.clone())
  }
  if (path.length > 1 && path[0].distanceToSquared(path[path.length - 1]) < 1e-10) path.pop()

  const n = path.length
  const R = profile.length
  const positions = new Float32Array(n * R * 3)

  for (let r = 0; r < R; r++) {
    const ring = offsetOutline(path, profile[r].d)
    for (let i = 0; i < n; i++) {
      const o = (r * n + i) * 3
      positions[o] = ring[i].x
      positions[o + 1] = ring[i].y
      positions[o + 2] = profile[r].z
    }
  }

  const indices: number[] = []
  for (let r = 0; r < R - 1; r++) {
    if (profile[r + 1].crease) continue // creases: rows duplicated, band skipped
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n
      const a = r * n + i
      const b = (r + 1) * n + i
      const c = r * n + i2
      const dIdx = (r + 1) * n + i2
      indices.push(a, b, c, b, dIdx, c)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}
