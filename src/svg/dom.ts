/** Shared helpers for the drawn scenes. */

export const ramp = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)))
export const ease = (x: number) => x * x * (3 - 2 * x)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const NS = 'http://www.w3.org/2000/svg'
export function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  parent?: Element,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  parent?.appendChild(e)
  return e
}

/**
 * Attribute writes are skipped when nothing changed: most of the drawing is
 * static in any one frame, and untouched attributes cost nothing to restyle.
 */
interface Cached {
  _dash?: string
  _vis?: string
  _op?: string
}

/** A line that draws itself: pathLength 1, dash offset from 1 to 0. */
export function drawn(d: string, cls: string, parent: Element): SVGPathElement {
  return el('path', { d, class: `ink ${cls}`, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, parent)
}

export const setDraw = (p: SVGPathElement, t: number) => {
  const c = p as SVGPathElement & Cached
  const dash = (1 - t).toFixed(4)
  if (c._dash !== dash) {
    c._dash = dash
    p.setAttribute('stroke-dashoffset', dash)
  }
  // an undrawn line must vanish entirely: a round cap would still leave a dot
  const vis = t <= 0 ? 'hidden' : ''
  if (c._vis !== vis) {
    c._vis = vis
    p.style.visibility = vis
  }
}

export const setOp = (e: Element, t: number) => {
  const c = e as Element & Cached
  const op = t.toFixed(3)
  if (c._op !== op) {
    c._op = op
    e.setAttribute('opacity', op)
  }
}

/** Like setOp, and hides the element outright at zero (nothing left to paint). */
export const setShow = (e: SVGElement, t: number) => {
  setOp(e, t)
  const vis = t <= 0 ? 'hidden' : ''
  if (e.style.visibility !== vis) e.style.visibility = vis
}

// ---- easing -------------------------------------------------------------------
/** Ken Perlin's smootherstep: zero velocity *and* acceleration at both ends. */
export const ease5 = (x: number) => x * x * x * (x * (x * 6 - 15) + 10)

/**
 * Monotone cubic Hermite (Fritsch–Carlson) through keyframes: the curve has
 * continuous velocity at every key (no stop-start), never overshoots, and
 * holds exactly flat across keys with equal values.
 */
export function monotone(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1e-9))
  const m: number[] = [d[0]]
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]))
  m.push(d[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue }
    const a = m[i] / d[i], b = m[i + 1] / d[i]
    const h = Math.hypot(a, b)
    if (h > 3) { m[i] = (3 * a * d[i]) / h; m[i + 1] = (3 * b * d[i]) / h }
  }
  let seg = 0
  return (x: number) => {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[n - 1]) return ys[n - 1]
    while (seg > 0 && x < xs[seg]) seg--
    while (x > xs[seg + 1]) seg++
    const h = xs[seg + 1] - xs[seg]
    const t = (x - xs[seg]) / h
    const t2 = t * t, t3 = t2 * t
    return (
      (2 * t3 - 3 * t2 + 1) * ys[seg] + (t3 - 2 * t2 + t) * h * m[seg] +
      (-2 * t3 + 3 * t2) * ys[seg + 1] + (t3 - t2) * h * m[seg + 1]
    )
  }
}

/**
 * Critically damped spring toward a target (Unity's SmoothDamp): frame-rate
 * independent, starts and stops with zero jerk, and keeps its velocity if
 * the target moves mid-flight (so a run of wheel clicks flows together).
 */
export function smoothDamp(state: { v: number }, current: number, target: number, smoothTime: number, dt: number): number {
  const w = 2 / smoothTime
  const x = w * dt
  const k = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = current - target
  const temp = (state.v + w * change) * dt
  state.v = (state.v - w * temp) * k
  let out = target + (change + temp) * k
  // never overshoot the target
  if ((target - current > 0) === (out > target)) { out = target; state.v = 0 }
  return out
}
