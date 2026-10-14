import * as THREE from 'three'

/**
 * Layout texture for drawn stained glass: for every point of a glazed field,
 * how far it lies inside its opening and which opening it belongs to. The
 * glass shader composes borders, grounds and medallions from it, so every
 * opening's design follows its own outline exactly — whatever the tracery.
 *
 * Built once at load from the same opening polygons as the stone: the
 * polygons are rasterised, and an exact Euclidean distance transform
 * (Felzenszwalb & Huttenlocher) gives the distance to the stone.
 *
 * Channels (8-bit, linearly filtered):
 *   R  distance to the stone, world units / DIST_RANGE
 *   G  that distance / the opening's deepest point (0 at edge … 1 at core)
 *   B  per-opening hash (picks its colour scheme)
 *   A  the opening's deepest point, world units / DEPTH_RANGE
 */
export const DIST_RANGE = 0.25
export const DEPTH_RANGE = 0.8

export interface GlassRect {
  x0: number
  y0: number
  w: number
  h: number
}

/** Squared-distance 1D transform (in place on f, scratch arrays reused). */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0
  v[0] = 0
  z[0] = -Infinity
  z[1] = Infinity
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = Infinity
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
  }
}

export function buildGlassLayout(
  openings: THREE.Vector2[][],
  rect: GlassRect,
  width: number,
  height: number,
): THREE.DataTexture {
  // ---- rasterise: each opening filled with its index as colour -----------
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const toPx = (p: THREE.Vector2): [number, number] => [
    ((p.x - rect.x0) / rect.w) * width,
    (1 - (p.y - rect.y0) / rect.h) * height,
  ]
  openings.forEach((pts, i) => {
    const id = i + 1
    ctx.fillStyle = `rgb(${id & 255},${(id >> 8) & 255},0)`
    ctx.beginPath()
    pts.forEach((p, j) => {
      const [x, y] = toPx(p)
      if (j === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.fill()
  })
  const img = ctx.getImageData(0, 0, width, height).data

  // ---- distance to stone, in pixels ----------------------------------------
  const N = width * height
  const ids = new Int32Array(N)
  const grid = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    const inside = img[i * 4 + 3] === 255 // only fully covered pixels
    ids[i] = inside ? img[i * 4] + (img[i * 4 + 1] << 8) : 0
    grid[i] = inside ? 1e20 : 0
  }
  const m = Math.max(width, height)
  const f = new Float64Array(m)
  const d = new Float64Array(m)
  const v = new Int32Array(m)
  const z = new Float64Array(m + 1)
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x]
    edt1d(f, height, d, v, z)
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y]
  }
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) f[x] = grid[row + x]
    edt1d(f, width, d, v, z)
    for (let x = 0; x < width; x++) grid[row + x] = d[x]
  }

  // ---- deepest point of each opening ---------------------------------------
  const unit = rect.w / width // world units per pixel
  const depth = new Float64Array(openings.length + 1)
  for (let i = 0; i < N; i++) {
    const dist = Math.sqrt(grid[i]) * unit
    grid[i] = dist
    if (dist > depth[ids[i]]) depth[ids[i]] = dist
  }

  // ---- pack (row 0 of the texture = bottom of the field) -------------------
  const out = new Uint8Array(N * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = y * width + x
      const dst = ((height - 1 - y) * width + x) * 4
      const id = ids[src]
      const dist = grid[src]
      const deep = Math.max(depth[id], 1e-4)
      out[dst] = Math.min(255, Math.round((dist / DIST_RANGE) * 255))
      out[dst + 1] = Math.round(Math.min(1, dist / deep) * 255)
      out[dst + 2] = id ? Math.round(((Math.imul(id, 2654435761) >>> 0) / 4294967296) * 255) : 0
      out[dst + 3] = Math.min(255, Math.round((deep / DEPTH_RANGE) * 255))
    }
  }
  const tex = new THREE.DataTexture(out, width, height, THREE.RGBAFormat)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}
