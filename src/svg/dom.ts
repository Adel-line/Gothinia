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

/** A line that draws itself: pathLength 1, dash offset from 1 to 0. */
export function drawn(d: string, cls: string, parent: Element): SVGPathElement {
  return el('path', { d, class: `ink ${cls}`, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, parent)
}

export const setDraw = (p: SVGPathElement, t: number) => {
  p.setAttribute('stroke-dashoffset', String(1 - t))
  // an undrawn line must vanish entirely: a round cap would still leave a dot
  p.style.visibility = t <= 0 ? 'hidden' : ''
}
export const setOp = (e: Element, t: number) => e.setAttribute('opacity', t.toFixed(3))
