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
  /** which solid this face belongs to (so the line drawing can trace where parts meet) */
  prim: number
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
/** every solid gets its own number */
let PRIM = 0
/** tessellation multiplier: finer meshes make smoother outlines (used when drawing lines) */
let DETAIL = 1
/** An ellipsoid, tipped about Z (nose up or down) and turned about Y. */
export function ellipsoid(c: V3, r: V3, tilt = 0, turn = 0, tag: Tag = 'stone', nu0 = 14, nv0 = 10): Face[] {
  const faces: Face[] = []
  const nu = Math.max(6, Math.round(nu0 * DETAIL)), nv = Math.max(4, Math.round(nv0 * DETAIL))
  const prim = ++PRIM
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
      faces.push({ prim, v: [pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1)], inside: c, tag })
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
export function tube(pts: V3[], radii: number[], tag: Tag = 'stone', sides0 = 8, m0 = 3): Face[] {
  const sides = Math.max(5, Math.round(sides0 * DETAIL)), m = Math.max(2, Math.round(m0 * DETAIL))
  const { c, r } = spline(pts, radii, m)
  const prim = ++PRIM
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
      faces.push({ prim, v: [rings[i][a], rings[i][b], rings[i + 1][b], rings[i + 1][a]], inside: mid, tag })
    }
  }
  // a blunt end gets a cap
  if (r[n - 1] > 0.6) faces.push({ prim, v: rings[n - 1].slice(), inside: c[n - 2], tag })
  if (r[0] > 0.6) faces.push({ prim, v: rings[0].slice().reverse(), inside: c[1], tag })
  return faces
}

export function box(c: V3, h: V3, tag: Tag = 'stone'): Face[] {
  const p = (sx: number, sy: number, sz: number): V3 => [c[0] + sx * h[0], c[1] + sy * h[1], c[2] + sz * h[2]]
  const quads = [
    [p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), p(1, -1, 1)], [p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1), p(-1, -1, -1)],
    [p(-1, 1, -1), p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1)], [p(-1, -1, 1), p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1)],
    [p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1)], [p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1)],
  ]
  const prim = ++PRIM
  return quads.map((v) => ({ prim, v, inside: c, tag }))
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
  const prim = ++PRIM
  for (let i = 0; i < chain.length - 1; i++) faces.push({ prim, v: [wrist, chain[i], chain[i + 1]], inside: null, tag: 'wing' })
  faces.push({ prim, v: [wrist, root, shoulder], inside: null, tag: 'wing' })
  return faces
}

// ---- the gargoyle -----------------------------------------------------------------------
/**
 * Crouched on a corbel and leaning out over the edge: haunches folded under, arms braced
 * forward on the ledge, neck stretched, head tipped down, jaws wide, wings swept back.
 */
/** the mouth's front, where the water leaves, and an eye (model space) */
export const MOUTH: V3 = [148, 30, 0]
export const EYE: V3 = [111, 59, 11.5]

export function buildGargoyle(detail = 1): Face[] {
  DETAIL = detail
  PRIM = 0
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
  push(ellipsoid([100, 53, 0], [21, 18, 16], -0.3)) // skull
  push(ellipsoid([128, 45, 0], [26, 11, 10.5], -0.42)) // upper jaw / snout
  push(ellipsoid([118, 29, 0], [22, 7, 9], 0.42)) // lower jaw, hinged under the skull and dropped open
  push(ellipsoid([123, 36, 0], [15, 8, 8], 0.1, 0, 'dark', 10, 6)) // the dark of the mouth
  for (const z of [1, -1]) {
    push(ellipsoid([107, 65, 9 * z], [14, 5.5, 6.5], -0.3)) // brow ridge
    push(ellipsoid([111, 59, 11.5 * z], [5, 3.4, 3.4], 0, 0, 'dark', 8, 6)) // eye socket
    // horns: stout, curving back and up
    push(tube([[92, 64, 8 * z], [86, 80, 10 * z], [72, 90, 10.5 * z], [58, 90, 9 * z]], [6.5, 4.6, 2.8, 0], 'bone', 6, 3))
    // ears
    push(tube([[86, 64, 14 * z], [80, 80, 19 * z]], [5, 0], 'stone', 5, 2))
    // fangs: upper pointing down, lower pointing up
    push(tube([[136, 41, 6.5 * z], [138, 24, 6.5 * z]], [3.6, 0], 'bone', 5, 2))
    push(tube([[122, 40, 8 * z], [123, 27, 8 * z]], [3, 0], 'bone', 5, 2))
    push(tube([[136, 24, 5.5 * z], [137, 40, 5.5 * z]], [3.2, 0], 'bone', 5, 2))
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


// ---- as a line drawing -------------------------------------------------------------------
export interface Ink {
  /** the silhouette, filled flat */
  fill: string
  /** the darkest parts (eye sockets, the mouth), filled solid */
  dark: string
  /** lines on the outline against the background (drawn heavier) */
  outer: string
  /** lines where one part passes in front of another, and sharp creases */
  inner: string
  /** hatching in the shadows */
  hatch: string
}

/**
 * The same sculpture as an ink drawing: only the lines that show (hidden-line removal by a
 * depth buffer), outline heavier than interior, shadow as hatching instead of fill.
 */
export function renderGargoyleInk(
  faces: Face[],
  cam: Camera,
  opts: { scale?: number; crease?: number; hatchGap?: number; light?: V3 } = {},
): Ink {
  const scale = opts.scale ?? 3 // buffer pixels per model unit
  const creaseCos = Math.cos(((opts.crease ?? 52) * Math.PI) / 180)
  const hatchGap = Math.max(2, Math.round((opts.hatchGap ?? 4.6) * scale))
  const L = norm(opts.light ?? [-0.55, 0.75, 0.5])
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch)
  const tr = (p: V3): V3 => {
    const x = p[0] * cy + p[2] * sy
    const z = -p[0] * sy + p[2] * cy
    return [x, -(p[1] * cp - z * sp), z * cp + p[1] * sp]
  }
  const rot = (n: V3): V3 => {
    const x = n[0] * cy + n[2] * sy
    const z = -n[0] * sy + n[2] * cy
    return [x, n[1] * cp - z * sp, z * cp + n[1] * sp]
  }
  interface F2 { pts: V3[]; keys: string[]; front: boolean; n: V3; tone: number; prim: number; dark: boolean }
  const fs: F2[] = []
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const f of faces) {
    let n: V3 = [0, 0, 0]
    for (let i = 0; i < f.v.length; i++) {
      const a = f.v[i], b = f.v[(i + 1) % f.v.length]
      n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])])
    }
    n = norm(n)
    const centre = f.v.reduce<V3>((s, v) => add(s, v), [0, 0, 0]).map((x) => x / f.v.length) as V3
    if (f.inside && dot(n, sub(centre, f.inside)) < 0) n = mul(n, -1)
    let nc = rot(n)
    if (!f.inside && nc[2] < 0) {
      n = mul(n, -1)
      nc = rot(n)
    }
    const front = nc[2] > 0.001
    const lit = Math.max(0, dot(n, L))
    const tone = Math.pow(Math.min(1, 0.07 + 0.9 * lit + 0.07 * Math.max(0, -n[1])), 1.25)
    const pts = f.v.map(tr)
    if (front) for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    fs.push({ pts, keys: f.v.map((v) => `${Math.round(v[0] * 40)},${Math.round(v[1] * 40)},${Math.round(v[2] * 40)}`), front, n: nc, tone, prim: f.prim, dark: f.tag === 'dark' })
  }
  const W = Math.ceil((x1 - x0) * scale) + 6, H = Math.ceil((y1 - y0) * scale) + 6
  const zb = new Float32Array(W * H).fill(-1e9)
  const tb = new Float32Array(W * H)
  const ib = new Int32Array(W * H).fill(-1)
  const db = new Uint8Array(W * H)
  const px = (x: number) => (x - x0) * scale + 3
  const py = (y: number) => (y - y0) * scale + 3
  const mx = (i: number) => (i - 3) / scale + x0
  const my = (j: number) => (j - 3) / scale + y0
  const tri = (a: V3, b: V3, c: V3, tone: number, prim: number, dark: boolean) => {
    const ax = px(a[0]), ay = py(a[1]), bx = px(b[0]), by = py(b[1]), cx = px(c[0]), cy2 = py(c[1])
    const den = (by - cy2) * (ax - cx) + (cx - bx) * (ay - cy2)
    if (Math.abs(den) < 1e-9) return
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)))
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy2))), maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy2)))
    for (let j = minY; j <= maxY; j++) {
      for (let i = minX; i <= maxX; i++) {
        const l1 = ((by - cy2) * (i + 0.5 - cx) + (cx - bx) * (j + 0.5 - cy2)) / den
        const l2 = ((cy2 - ay) * (i + 0.5 - cx) + (ax - cx) * (j + 0.5 - cy2)) / den
        const l3 = 1 - l1 - l2
        if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue
        const d = l1 * a[2] + l2 * b[2] + l3 * c[2]
        const k = j * W + i
        if (d > zb[k]) {
          zb[k] = d
          tb[k] = tone
          ib[k] = prim
          db[k] = dark ? 1 : 0
        }
      }
    }
  }
  for (const f of fs) {
    if (!f.front) continue
    tri(f.pts[0], f.pts[1], f.pts[2], f.tone, f.prim, f.dark)
    if (f.pts.length > 3) tri(f.pts[0], f.pts[2], f.pts[3], f.tone, f.prim, f.dark)
  }

  // the silhouette, filled flat: every front face with one winding, so nonzero fill unites them
  const fmt = (x: number, y: number) => `${x.toFixed(1)} ${y.toFixed(1)}`
  let fill = ''
  for (const f of fs) {
    if (!f.front) continue
    let area = 0
    for (let i = 0; i < f.pts.length; i++) {
      const a = f.pts[i], b = f.pts[(i + 1) % f.pts.length]
      area += a[0] * b[1] - b[0] * a[1]
    }
    const pts = area < 0 ? f.pts.slice().reverse() : f.pts
    fill += 'M' + pts.map((p) => fmt(p[0], p[1])).join('L') + 'Z'
  }

  // edges: which faces share each one
  const edges = new Map<string, { a: V3; b: V3; fs: number[] }>()
  fs.forEach((f, fi) => {
    for (let i = 0; i < f.pts.length; i++) {
      const j = (i + 1) % f.pts.length
      const k1 = f.keys[i], k2 = f.keys[j]
      if (k1 === k2) continue
      const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`
      const e = edges.get(key)
      if (e) e.fs.push(fi)
      else edges.set(key, { a: f.pts[i], b: f.pts[j], fs: [fi] })
    }
  })
  let outer = '', inner = ''
  const EPS = 2.4
  for (const e of edges.values()) {
    const front = e.fs.filter((i) => fs[i].front)
    if (!front.length) continue
    let candidate = false
    if (e.fs.length === 1) candidate = true // an open edge
    else if (front.length === 1) candidate = true // silhouette: one side faces us, the other away
    else if (front.length === 2 && dot(fs[front[0]].n, fs[front[1]].n) < creaseCos) candidate = true // a crease
    if (!candidate) continue
    const ax = px(e.a[0]), ay = py(e.a[1]), bx = px(e.b[0]), by = py(e.b[1])
    const len = Math.hypot(bx - ax, by - ay)
    const steps = Math.max(1, Math.ceil(len))
    const nx = -(by - ay) / (len || 1), ny = (bx - ax) / (len || 1)
    let run: { kind: 0 | 1; from: number } | null = null
    const flush = (to: number) => {
      if (!run) return
      const t0 = run.from / steps, t1 = to / steps
      const seg = `M${fmt(mx(ax + (bx - ax) * t0), my(ay + (by - ay) * t0))}L${fmt(mx(ax + (bx - ax) * t1), my(ay + (by - ay) * t1))}`
      if (run.kind) outer += seg
      else inner += seg
      run = null
    }
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t
      const d = e.a[2] + (e.b[2] - e.a[2]) * t
      const i = Math.round(x), j = Math.round(y)
      let vis = false
      let out: 0 | 1 = 0
      if (i >= 0 && j >= 0 && i < W && j < H) {
        vis = d >= zb[j * W + i] - EPS
        const at = (k: number) => {
          const ii = Math.round(x + nx * k), jj = Math.round(y + ny * k)
          return ii < 0 || jj < 0 || ii >= W || jj >= H || zb[jj * W + ii] < -1e8
        }
        out = at(2.5) || at(-2.5) ? 1 : 0
      }
      if (vis && (!run || run.kind !== out)) {
        flush(s)
        run = { kind: out, from: s }
      } else if (!vis) flush(s)
    }
    flush(steps)
  }

  // where one part meets or passes in front of another: trace the boundaries between solids in the
  // id buffer, chain them into lines, simplify and smooth them
  const corner = (i: number, j: number) => i * (H + 1) + j
  const adj = new Map<number, number[]>()
  const link = (a: number, b: number) => {
    let la = adj.get(a)
    if (!la) adj.set(a, (la = []))
    la.push(b)
    let lb = adj.get(b)
    if (!lb) adj.set(b, (lb = []))
    lb.push(a)
  }
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i
      if (ib[k] < 0) continue
      if (i + 1 < W && ib[k + 1] >= 0 && ib[k + 1] !== ib[k]) link(corner(i + 1, j), corner(i + 1, j + 1))
      if (j + 1 < H && ib[k + W] >= 0 && ib[k + W] !== ib[k]) link(corner(i, j + 1), corner(i + 1, j + 1))
    }
  }
  const seen = new Set<string>()
  const ekey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)
  const cx = (c: number) => Math.floor(c / (H + 1))
  const cyy = (c: number) => c % (H + 1)
  const chains: number[][] = []
  for (const [start, ns] of adj) {
    for (const first of ns) {
      if (seen.has(ekey(start, first))) continue
      const chain = [start, first]
      seen.add(ekey(start, first))
      // walk on while the corner joins exactly two lines
      for (let guard = 0; guard < 20000; guard++) {
        const at = chain[chain.length - 1]
        const nxt = (adj.get(at) ?? []).filter((n) => !seen.has(ekey(at, n)))
        if ((adj.get(at) ?? []).length !== 2 || !nxt.length) break
        seen.add(ekey(at, nxt[0]))
        chain.push(nxt[0])
      }
      chains.push(chain)
    }
  }
  const rdp = (pts: [number, number][], eps: number): [number, number][] => {
    if (pts.length < 3) return pts
    const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1]
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1
    let dmax = 0, idx = 0
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / l
      if (d > dmax) { dmax = d; idx = i }
    }
    if (dmax <= eps) return [pts[0], pts[pts.length - 1]]
    return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)]
  }
  let contours = ''
  for (const chain of chains) {
    if (chain.length < 6 * scale / 2) continue // specks
    const simple = rdp(chain.map((c) => [cx(c), cyy(c)] as [number, number]), 0.9)
    // round the corners: quadratic through the midpoints
    let d = `M${fmt(mx(simple[0][0]), my(simple[0][1]))}`
    for (let i = 1; i < simple.length - 1; i++) {
      const m0 = [(simple[i][0] + simple[i + 1][0]) / 2, (simple[i][1] + simple[i + 1][1]) / 2]
      d += `Q${fmt(mx(simple[i][0]), my(simple[i][1]))} ${fmt(mx(m0[0]), my(m0[1]))}`
    }
    const last = simple[simple.length - 1]
    d += `L${fmt(mx(last[0]), my(last[1]))}`
    contours += d
  }
  // the darkest parts, solid: rows of dark pixels
  let dark = ''
  for (let j = 0; j < H; j++) {
    let start = -1
    for (let i = 0; i <= W; i++) {
      const on = i < W && zb[j * W + i] > -1e8 && db[j * W + i] === 1
      if (on && start < 0) start = i
      if (!on && start >= 0) {
        dark += `M${fmt(mx(start), my(j))}L${fmt(mx(i), my(j))}L${fmt(mx(i), my(j + 1))}L${fmt(mx(start), my(j + 1))}Z`
        start = -1
      }
    }
  }

  // hatching: diagonal lines, kept only where the visible surface is in shadow; deeper shadow is cross-hatched
  let hatch = ''
  const hatchPass = (dir: 1 | -1, thr: number) => {
    for (let c = -H; c < W + H; c += hatchGap) {
      let start = -1
      let last = -1
      for (let i = 0; i < W; i++) {
        const j = dir === 1 ? i - c : c - i
        let on = false
        if (j >= 0 && j < H) {
          const k = j * W + i
          on = zb[k] > -1e8 && tb[k] < thr
        }
        if (on) {
          if (start < 0) start = i
          last = i
        } else if (start >= 0) {
          if (last - start > scale * 1.6) {
            const j0 = dir === 1 ? start - c : c - start, j1 = dir === 1 ? last - c : c - last
            hatch += `M${fmt(mx(start), my(j0))}L${fmt(mx(last), my(j1))}`
          }
          start = -1
        }
      }
      if (start >= 0 && last - start > scale * 1.6) {
        const j0 = dir === 1 ? start - c : c - start, j1 = dir === 1 ? last - c : c - last
        hatch += `M${fmt(mx(start), my(j0))}L${fmt(mx(last), my(j1))}`
      }
    }
  }
  hatchPass(1, 0.24)
  hatchPass(-1, 0.09)
  return { fill, dark, outer, inner: inner + contours, hatch }
}
