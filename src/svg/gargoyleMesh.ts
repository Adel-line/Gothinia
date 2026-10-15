/**
 * The gargoyle as a small sculpture: built in 3D from simple solids, then drawn as
 * flat-shaded facets in SVG (the painter's algorithm: cull what faces away, sort the
 * rest back to front, fill each by how squarely it faces the light).
 *
 * Solids (the same trick as Zdog: build organic forms from a few primitives):
 *   ellipsoid  – haunches, shoulders, skull, jaws
 *   tube       – a swept circle of changing radius along a smooth path: limbs, neck,
 *                tail, horns, fangs, claws, wing bones (a cone is a tube that ends in 0)
 *   box        – the corbel
 *   membrane   – the wing: a scalloped fan of triangles, seen from both sides
 *
 * Model space: +X the way it faces, +Y up, +Z toward the viewer (before the camera turns).
 */

export type V3 = [number, number, number]
export type Tag = 'stone' | 'wing' | 'bone' | 'dark'

export interface Face {
  v: V3[]
  /** a point inside the solid, to tell which way the face's normal should point */
  inside: V3 | null
  tag: Tag
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: V3) => Math.hypot(a[0], a[1], a[2])
const norm = (a: V3): V3 => {
  const l = len(a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

// ---- solids ----------------------------------------------------------------------------
/** An ellipsoid, tipped about Z (nose up or down) and turned about Y. */
export function ellipsoid(c: V3, r: V3, tilt = 0, turn = 0, tag: Tag = 'stone', nu = 14, nv = 10): Face[] {
  const faces: Face[] = []
  const ct = Math.cos(tilt), st = Math.sin(tilt), cy = Math.cos(turn), sy = Math.sin(turn)
  const pt = (u: number, v: number): V3 => {
    let p: V3 = [r[0] * Math.sin(v) * Math.cos(u), r[1] * Math.cos(v), r[2] * Math.sin(v) * Math.sin(u)]
    p = [p[0] * cy + p[2] * sy, p[1], -p[0] * sy + p[2] * cy] // turn about Y
    p = [p[0] * ct - p[1] * st, p[0] * st + p[1] * ct, p[2]] // tilt about Z
    return add(p, c)
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const u0 = (i / nu) * Math.PI * 2, u1 = ((i + 1) / nu) * Math.PI * 2
      const v0 = (j / nv) * Math.PI, v1 = ((j + 1) / nv) * Math.PI
      faces.push({ v: [pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1)], inside: c, tag })
    }
  }
  return faces
}

/** A smooth path through points (Catmull–Rom), sampled `m` times per span. */
function spline(pts: V3[], radii: number[], m: number): { c: V3[]; r: number[] } {
  const c: V3[] = []
  const r: number[] = []
  const P = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))]
  const R = (i: number) => radii[Math.max(0, Math.min(radii.length - 1, i))]
  const cr = (a: number, b: number, cc: number, d: number, t: number) =>
    0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t * t + (-a + 3 * b - 3 * cc + d) * t * t * t)
  for (let i = 0; i < pts.length - 1; i++) {
    for (let k = 0; k < m; k++) {
      const t = k / m
      c.push([0, 1, 2].map((a) => cr(P(i - 1)[a], P(i)[a], P(i + 1)[a], P(i + 2)[a], t)) as V3)
      r.push(Math.max(0, cr(R(i - 1), R(i), R(i + 1), R(i + 2), t)))
    }
  }
  c.push(pts[pts.length - 1])
  r.push(radii[radii.length - 1])
  return { c, r }
}

/** A swept circle along a smooth path, with a radius at each given point; a radius of 0 closes it to a point. */
export function tube(pts: V3[], radii: number[], tag: Tag = 'stone', sides = 8, m = 3): Face[] {
  const { c, r } = spline(pts, radii, m)
  const n = c.length
  // rotation-minimising frames, so the tube doesn't twist
  const tan = c.map((_, i) => norm(sub(c[Math.min(n - 1, i + 1)], c[Math.max(0, i - 1)])))
  let u: V3 = norm(cross(tan[0], Math.abs(tan[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
  const rings: V3[][] = []
  for (let i = 0; i < n; i++) {
    u = norm(sub(u, mul(tan[i], dot(u, tan[i]))))
    const w = cross(tan[i], u)
    const ring: V3[] = []
    for (let a = 0; a < sides; a++) {
      const th = (a / sides) * Math.PI * 2
      ring.push(add(c[i], add(mul(u, Math.cos(th) * r[i]), mul(w, Math.sin(th) * r[i]))))
    }
    rings.push(ring)
  }
  const faces: Face[] = []
  for (let i = 0; i < n - 1; i++) {
    const mid = lerp3(c[i], c[i + 1], 0.5)
    for (let a = 0; a < sides; a++) {
      const b = (a + 1) % sides
      faces.push({ v: [rings[i][a], rings[i][b], rings[i + 1][b], rings[i + 1][a]], inside: mid, tag })
    }
  }
  // a blunt end gets a cap
  if (r[n - 1] > 0.6) faces.push({ v: rings[n - 1].slice(), inside: c[n - 2], tag })
  if (r[0] > 0.6) faces.push({ v: rings[0].slice().reverse(), inside: c[1], tag })
  return faces
}

export function box(c: V3, h: V3, tag: Tag = 'stone'): Face[] {
  const p = (sx: number, sy: number, sz: number): V3 => [c[0] + sx * h[0], c[1] + sy * h[1], c[2] + sz * h[2]]
  const quads = [
    [p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), p(1, -1, 1)], [p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1), p(-1, -1, -1)],
    [p(-1, 1, -1), p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1)], [p(-1, -1, 1), p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1)],
    [p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1)], [p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1)],
  ]
  return quads.map((v) => ({ v, inside: c, tag }))
}

/** The wing: a fan of triangles from the wrist, scalloped between the finger tips. Both sides show. */
export function membrane(wrist: V3, tips: V3[], root: V3, shoulder: V3, scallop = 0.18): Face[] {
  const chain: V3[] = []
  tips.forEach((t, i) => {
    chain.push(t)
    if (i < tips.length - 1) chain.push(lerp3(lerp3(t, tips[i + 1], 0.5), wrist, scallop))
  })
  chain.push(lerp3(tips[tips.length - 1], root, 0.5))
  chain.push(root)
  const faces: Face[] = []
  for (let i = 0; i < chain.length - 1; i++) faces.push({ v: [wrist, chain[i], chain[i + 1]], inside: null, tag: 'wing' })
  faces.push({ v: [wrist, root, shoulder], inside: null, tag: 'wing' })
  return faces
}

// ---- the gargoyle -----------------------------------------------------------------------
/**
 * Crouched on a corbel and leaning out over the edge: haunches folded under, arms braced
 * forward on the ledge, neck stretched, head tipped down, jaws wide, wings swept back.
 */
/** the mouth's front, where the water leaves, and an eye (model space) */
export const MOUTH: V3 = [146, 30, 0]
export const EYE: V3 = [108, 57, 11]

export function buildGargoyle(): Face[] {
  const F: Face[] = []
  const push = (fs: Face[]) => F.push(...fs)

  // the corbel it crouches on (its top is Y = 0)
  push(box([22, -6, 0], [62, 6, 34]))
  push(box([22, -17, 0], [52, 5, 28]))
  push(box([22, -29, 0], [38, 7, 20]))
  push(box([22, -40, 0], [22, 4, 12]))

  // the body
  push(ellipsoid([-2, 36, 0], [36, 24, 23], -0.14))
  push(ellipsoid([-26, 34, 0], [20, 22, 21])) // pelvis
  push(ellipsoid([26, 42, 0], [18, 20, 20], -0.2)) // chest and shoulders
  // haunches: thigh, shin, foot, toes
  for (const z of [1, -1]) {
    push(ellipsoid([-26, 24, 23 * z], [22, 19, 13], 0.3))
    push(tube([[-18, 20, 24 * z], [-2, 10, 28 * z], [-30, 6, 25 * z]], [10, 8, 4.5]))
    push(ellipsoid([-36, 3, 25 * z], [13, 4, 6.5]))
    for (const dz of [-3.5, 0, 3.5]) push(tube([[-46, 3, (25 + dz) * z], [-54, 1.5, (25 + dz * 1.4) * z]], [2.2, 0], 'bone', 5, 2))
  }
  // arms braced on the ledge, with long clawed hands
  for (const z of [1, -1]) {
    push(ellipsoid([24, 44, 20 * z], [12, 13, 9], 0.2))
    push(tube([[24, 44, 20 * z], [38, 24, 28 * z], [58, 6, 24 * z]], [9, 8, 5.5]))
    push(ellipsoid([66, 3, 24 * z], [12, 3.8, 7]))
    for (const dz of [-4, 0, 4]) {
      push(tube([[72, 3, (24 + dz) * z], [84, 2, (24 + dz * 1.3) * z], [90, -3, (24 + dz * 1.4) * z]], [2.6, 2, 0], 'bone', 5, 2))
    }
  }
  // the neck and head, thrust out over the edge and tipped down; jaws wide
  push(tube([[30, 50, 0], [54, 56, 0], [76, 54, 0], [94, 50, 0]], [14, 12.5, 11, 10]))
  push(ellipsoid([100, 52, 0], [19, 16, 15], -0.3)) // skull
  push(ellipsoid([126, 44, 0], [25, 10, 10], -0.42)) // upper jaw / snout
  push(ellipsoid([120, 22, 0], [22, 6.5, 8.5], 0.6)) // lower jaw, dropped open
  push(ellipsoid([122, 34, 0], [15, 8, 8], 0.1, 0, 'dark', 10, 6)) // the dark of the mouth
  for (const z of [1, -1]) {
    push(ellipsoid([104, 62, 9 * z], [12, 4.5, 5.5], -0.35)) // brow ridge
    push(ellipsoid([108, 57, 11 * z], [4, 2.8, 2.8], 0, 0, 'dark', 8, 6)) // eye socket
    // horns: stout, curving back and up
    push(tube([[92, 62, 8 * z], [86, 78, 10 * z], [72, 88, 10.5 * z], [58, 88, 9 * z]], [6.5, 4.6, 2.8, 0], 'bone', 6, 3))
    // ears
    push(tube([[86, 62, 14 * z], [80, 78, 19 * z]], [5, 0], 'stone', 5, 2))
    // fangs: upper pointing down, lower pointing up
    push(tube([[134, 40, 6.5 * z], [136, 26, 6.5 * z]], [3, 0], 'bone', 5, 2))
    push(tube([[122, 39, 8 * z], [123, 28, 8 * z]], [2.5, 0], 'bone', 5, 2))
    push(tube([[134, 24, 5.5 * z], [135, 38, 5.5 * z]], [2.7, 0], 'bone', 5, 2))
  }
  // spines along the back
  for (let i = 0; i < 6; i++) {
    const x = -34 + i * 14, y = 55 + Math.sin(i / 1.2) * 3
    push(tube([[x, y - 4, 0], [x - 5, y + 8, 0]], [3.2, 0], 'stone', 5, 2))
  }
  // the tail, curling down behind it
  push(tube([[-44, 36, 0], [-66, 30, 0], [-82, 14, 0], [-80, -6, 0], [-68, -22, 0]], [9, 7, 5, 3.2, 1]))

  // the wings, folded and swept back and up
  for (const z of [1, -1]) {
    const S: V3 = [8, 52, 12 * z], E: V3 = [-6, 78, 26 * z], W: V3 = [-30, 90, 38 * z]
    const tips: V3[] = [[-74, 76, 52 * z], [-84, 54, 50 * z], [-68, 34, 42 * z], [-44, 28, 30 * z]]
    const R: V3 = [-22, 44, 14 * z]
    push(membrane(W, tips, R, S))
    push(tube([S, E, W], [4, 3, 2.2], 'stone', 6, 3))
    for (const t of tips) push(tube([W, lerp3(W, t, 0.55), t], [1.8, 1.4, 0.4], 'stone', 5, 2))
  }

  return F
}

// ---- rendering --------------------------------------------------------------------------
export interface Camera {
  /** turn about the vertical axis: negative brings the head toward the viewer */
  yaw: number
  /** looking down on it by this much */
  pitch: number
}

export interface Rendered {
  /** facets, back to front, merged into runs of one tone */
  runs: { d: string; fill: string }[]
  /** every facet's outline as one path (stroked behind the fills for a silhouette line) */
  outline: string
  /** where a model-space point lands on screen (x right, y down) */
  project: (p: V3) => [number, number]
}

const PALETTES: Record<Tag, [number, number, number][]> = {
  stone: [[12, 9, 7], [46, 37, 28], [108, 92, 70], [226, 210, 176]],
  wing: [[10, 8, 7], [36, 29, 23], [84, 72, 56], [176, 160, 132]],
  bone: [[48, 40, 31], [120, 108, 88], [196, 184, 156], [244, 234, 208]],
  dark: [[5, 5, 8], [5, 5, 8], [5, 5, 8], [5, 5, 8]],
}
const LEVELS = 14

function colour(tag: Tag, t: number): string {
  const p = PALETTES[tag]
  const x = Math.min(0.999, Math.max(0, t)) * (p.length - 1)
  const i = Math.floor(x)
  const f = x - i
  const c = [0, 1, 2].map((k) => Math.round(p[i][k] + (p[i + 1][k] - p[i][k]) * f))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

/** Where a model-space point lands on screen (x right, y down) for a camera; cheap, needs no mesh. */
export function cameraProjection(cam: Camera): (p: V3) => [number, number] {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch)
  return (p) => {
    const x = p[0] * cy + p[2] * sy
    const z = -p[0] * sy + p[2] * cy
    return [x, -(p[1] * cp - z * sp)]
  }
}

export function renderGargoyle(faces: Face[], cam: Camera, light: V3 = [-0.55, 0.75, 0.5]): Rendered {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch)
  /** model → [screen x, screen y (down), depth (toward the viewer)] */
  const tr = (p: V3): V3 => {
    const x = p[0] * cy + p[2] * sy
    const z = -p[0] * sy + p[2] * cy
    return [x, -(p[1] * cp - z * sp), z * cp + p[1] * sp]
  }
  const rot = (n: V3): V3 => {
    const x = n[0] * cy + n[2] * sy
    const z = -n[0] * sy + n[2] * cy
    return [x, n[1] * cp - z * sp, z * cp + n[1] * sp] // (x, up, toward viewer)
  }
  const L = norm(light)
  type Item = { pts: [number, number][]; depth: number; tone: number; tag: Tag }
  const items: Item[] = []
  for (const f of faces) {
    // the face's normal, from its corners
    let n: V3 = [0, 0, 0]
    for (let i = 0; i < f.v.length; i++) {
      const a = f.v[i], b = f.v[(i + 1) % f.v.length]
      n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])])
    }
    n = norm(n)
    const centre = f.v.reduce<V3>((s, v) => add(s, v), [0, 0, 0]).map((x) => x / f.v.length) as V3
    if (f.inside) {
      if (dot(n, sub(centre, f.inside)) < 0) n = mul(n, -1)
    }
    let toward = rot(n)[2]
    if (!f.inside && toward < 0) {
      n = mul(n, -1) // a membrane shows its other side
      toward = -toward
    }
    if (toward <= 0.001) continue // faces away
    const lit = Math.max(0, dot(n, L))
    // a little light from below and behind so the shadows are never dead
    const tone = Math.pow(Math.min(1, 0.07 + 0.9 * lit + 0.07 * Math.max(0, -n[1])), 1.25)
    const pts = f.v.map((v) => tr(v))
    items.push({ pts: pts.map(([x, y]) => [x, y] as [number, number]), depth: pts.reduce((s, p) => s + p[2], 0) / pts.length, tone, tag: f.tag })
  }
  items.sort((a, b) => a.depth - b.depth)
  const fmt = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z'
  const runs: { d: string; fill: string }[] = []
  let outline = ''
  let last = ''
  for (const it of items) {
    const q = Math.round(it.tone * (LEVELS - 1)) / (LEVELS - 1)
    const key = `${it.tag}:${q}`
    const d = fmt(it.pts)
    outline += d
    if (key === last) runs[runs.length - 1].d += d
    else runs.push({ d, fill: colour(it.tag, q) })
    last = key
  }
  return { runs, outline, project: (p) => { const t = tr(p); return [t[0], t[1]] } }
}
