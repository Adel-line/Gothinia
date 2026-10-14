import { ease5, el, lerp, ramp, setShow } from './dom'

/**
 * The swarm: a drawing's lines melt, gather and land as the next drawing.
 *
 * Short pieces of line are sampled along every outline of the old drawing and
 * dealt out to points on the outlines of the new one. Each piece then lives
 * through three states, blended continuously (so scrolling either way is
 * seamless):
 *
 *   melt   — the piece stretches into a drip and falls, lowest lines first,
 *            into a pool along the bottom *of the screen*;
 *   swarm  — the pool lifts into a loose cloud that drifts. Its home is the
 *            screen, not the drawing, so it holds its place as the camera
 *            zooms and the viewer feels the zoom through it;
 *   land   — pieces stream out of the cloud along curves, turning to lie along
 *            the new line, building the new drawing from the ground up.
 *
 * Drawn as one path, rebuilt each frame only while the transition runs.
 */

/** the visible part of the drawing, in drawing units */
export interface View { x: number; y: number; w: number; h: number }

interface Pt { x: number; y: number; a: number }

const TAU = Math.PI * 2

/** turn `a0` toward `a1` by the short way round (lines have no direction, so a half turn is none) */
function turn(a0: number, a1: number): number {
  return ((((a1 - a0) % Math.PI) + Math.PI * 1.5) % Math.PI) - Math.PI / 2
}

export function buildSwarm(
  svg: Element,
  defs: Element,
  sources: string[],
  targets: string[],
  view0: View,
  opts: { count?: number; len?: number; seed?: number } = {},
) {
  const N = opts.count ?? 2600
  const LEN = opts.len ?? 3
  let seed = opts.seed ?? 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

  const sampler = el('path', {}, defs)
  /** about N points spread over the outlines in proportion to their length */
  function sample(ds: string[], n: number): Pt[] {
    const lens = ds.map((d) => {
      sampler.setAttribute('d', d)
      return sampler.getTotalLength()
    })
    const total = lens.reduce((a, b) => a + b, 0) || 1
    const out: Pt[] = []
    ds.forEach((d, i) => {
      sampler.setAttribute('d', d)
      const m = Math.round((lens[i] / total) * n)
      for (let j = 0; j < m; j++) {
        const at = ((j + rnd() * 0.8) / m) * lens[i]
        const p0 = sampler.getPointAtLength(at)
        const p1 = sampler.getPointAtLength(Math.min(lens[i], at + 0.5))
        out.push({ x: p0.x, y: p0.y, a: Math.atan2(p1.y - p0.y, p1.x - p0.x) })
      }
    })
    return out
  }

  const from = sample(sources, N)
  const to = sample(targets, N)
  // pair them left to right, so the stream has a direction rather than a scramble
  from.sort((a, b) => a.x - b.x)
  to.sort((a, b) => a.x - b.x)
  const n = Math.min(from.length, to.length)

  let y0 = Infinity, y1 = -Infinity, t0 = Infinity, t1 = -Infinity
  for (const p of from) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y) }
  for (const p of to) { t0 = Math.min(t0, p.y); t1 = Math.max(t1, p.y) }

  const pieces = Array.from({ length: n }, (_, i) => {
    const f = from[i]
    const t = to[Math.floor((i / n) * to.length)]
    const yn = (f.y - y0) / (y1 - y0 || 1) // 0 top … 1 bottom
    const tn = (t.y - t0) / (t1 - t0 || 1)
    return {
      f, t,
      // where it pools, as fractions of the screen
      pu: Math.min(1.04, Math.max(-0.04, (f.x - view0.x) / view0.w)),
      poolV: 0.9 + rnd() * 0.09,
      cloudV: 0.46 + rnd() * 0.34,
      cloudU: 0.5 + (rnd() - 0.5) * 0.72,
      ph: rnd() * TAU,
      ph2: rnd() * TAU,
      sway: (rnd() - 0.5) * 2,
      // lowest lines melt first
      dm: (1 - yn) * 0.15 + rnd() * 0.04,
      // the new drawing builds from the ground up
      dl: 0.46 + (1 - tn) * 0.15 + rnd() * 0.04,
      bend: (rnd() - 0.5) * 1.6,
      flowA: (rnd() - 0.5) * 1.1, // a swarm piece lies roughly along its drift
      dropA: turn(f.a, Math.PI / 2),
    }
  })

  const path = el('path', { class: 'ink fine fragments' }, svg)
  path.style.visibility = 'hidden'

  /**
   * u: transition progress 0..1; view: what the camera sees right now;
   * show: 0..1 overall visibility (the caller cross-fades it with the drawings).
   */
  function update(u: number, view: View, show: number): void {
    if (u <= 0 || u >= 1 || show <= 0) {
      setShow(path, 0)
      return
    }
    setShow(path, show)
    const tau = u * 6
    let d = ''
    for (const p of pieces) {
      // ---- melt: drip down to the pool, then the cloud ---------------------------
      const m = ramp(u, p.dm, p.dm + 0.24)
      const mm = m * m * (1.4 - 0.4 * m) // gravity: slow to start, quick to finish
      const lift = ease5(ramp(u, 0.38, 0.62)) // pool → cloud
      const su = lerp(p.pu, p.cloudU, lift) + 0.05 * Math.sin(tau * 0.9 + p.ph) * lift + 0.012 * Math.sin(tau * 2.2 + p.ph2)
      const sv = lerp(p.poolV, p.cloudV, lift) + 0.025 * Math.sin(tau * 1.3 + p.ph2) + 0.01 * Math.sin(tau * 3 + p.ph)
      const sx = view.x + su * view.w
      const sy = view.y + sv * view.h
      let x = p.f.x + (sx - p.f.x) * lerp(m, mm, 0.35) + Math.sin(m * Math.PI * 2 + p.ph) * 3 * m * (1 - m) * p.sway
      let y = p.f.y + (sy - p.f.y) * mm
      // ---- land: out of the cloud along a curve to the new line --------------------
      const l = ease5(ramp(u, p.dl, p.dl + 0.34))
      let ang = p.f.a + p.dropA * ramp(m, 0, 0.45)
      ang += turn(ang, p.flowA) * ramp(m, 0.55, 1)
      let stretch = 1 + 4.5 * Math.sin(Math.PI * Math.min(1, m * 1.15)) * (1 - ramp(m, 0.7, 1) * 0.7)
      if (l > 0) {
        const dx = p.t.x - x, dy = p.t.y - y
        const dist = Math.hypot(dx, dy) || 1
        const cx = (x + p.t.x) / 2 - (dy / dist) * dist * 0.3 * p.bend
        const cy = (y + p.t.y) / 2 + (dx / dist) * dist * 0.3 * p.bend - dist * 0.08
        const a = 1 - l
        const nx = a * a * x + 2 * a * l * cx + l * l * p.t.x
        const ny = a * a * y + 2 * a * l * cy + l * l * p.t.y
        // piece leans along its travel, then settles onto the line
        const trav = Math.atan2(ny - y, nx - x)
        ang = ang + turn(ang, trav) * Math.sin(Math.PI * l) * 0.8
        ang = ang + turn(ang, p.t.a) * ease5(ramp(l, 0.55, 1))
        stretch += 2.2 * Math.sin(Math.PI * l)
        x = nx
        y = ny
      }
      const h = (LEN * stretch) / 2
      const ex = Math.cos(ang) * h
      const ey = Math.sin(ang) * h
      d += `M${(x - ex).toFixed(1)} ${(y - ey).toFixed(1)}L${(x + ex).toFixed(1)} ${(y + ey).toFixed(1)}`
    }
    path.setAttribute('d', d)
  }

  return { update }
}
