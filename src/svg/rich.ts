import { FRAME, PLATE_R, REVEAL_R, archOrder, circle, plateFill, roseOpenings, type Opening } from './geometry'

/**
 * The rose as it really looks: carved stone, faceted glass, light spilling
 * onto the wall.
 *
 * Composed once as a detailed SVG (lighting filters for the carved bevels,
 * noise for the stone's grain, blurred glass for the glow) and flattened
 * into one high-resolution image. The scroll timeline then only reveals and
 * fades that image, so the expensive filters never re-run while the camera
 * moves.
 */

/** Area covered by the render, in drawing units (the wall inside the arch). */
export const RICH_RECT = { x: -132, y: -150, w: 264, h: 282 }
const PX_PER_UNIT = 9.5

// ---- glass -------------------------------------------------------------------
// light centre → deep edge, the way pot-metal glass glows when backlit
const GLASS: Record<string, [string, string]> = {
  cobalt: ['#6a95ff', '#15329e'],
  deep: ['#4268e6', '#0c1d74'],
  sky: ['#8fb6ff', '#2546b6'],
  murrey: ['#b763d6', '#45136a'],
  ruby: ['#ff4a5e', '#7a0c1c'],
  gold: ['#f6c04a', '#8f5208'],
  emerald: ['#36b874', '#0b4d2a'],
}
const GROUND_WEIGHTS: [string, number][] = [
  ['cobalt', 48], ['deep', 22], ['sky', 12], ['murrey', 8], ['ruby', 6], ['gold', 2], ['emerald', 2],
]

function hash(a: number, b: number): number {
  let h = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
function pick(h: number): string {
  let t = h * 100
  for (const [k, w] of GROUND_WEIGHTS) if ((t -= w) < 0) return k
  return 'cobalt'
}

const n = (v: number) => v.toFixed(2)

function bbox(pts: number[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i])
    y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1])
  }
  return { x0, y0, x1, y1 }
}

/** Centroid and the largest circle around it that stays inside the outline. */
function inscribed(pts: number[]): { cx: number; cy: number; r: number } {
  let cx = 0, cy = 0
  const m = pts.length / 2
  for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cy += pts[i + 1] }
  cx /= m; cy /= m
  let r = Infinity
  for (let i = 0; i < pts.length; i += 2) {
    const j = (i + 2) % pts.length
    // distance from centre to segment i..j
    const ax = pts[i], ay = pts[i + 1], bx = pts[j], by = pts[j + 1]
    const dx = bx - ax, dy = by - ay
    const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / (dx * dx + dy * dy || 1)))
    r = Math.min(r, Math.hypot(cx - ax - t * dx, cy - ay - t * dy))
  }
  return { cx, cy, r }
}

/** One opening's glass: lead backing, faceted diamond quarries, a thin border (and a medallion at the centre). */
function pane(o: Opening, i: number): string {
  const cell = [6, 7, 6, 5, 5, 4.5][o.ring]
  const h = cell / 2 // half-diagonal
  const gap = 0.42 // lead between quarries
  const b = bbox(o.pts)
  let s = `<g clip-path="url(#o${i})"><path d="${o.d}" fill="#06070e"/>`
  for (let row = Math.floor(b.y0 / h) - 1, j = 0; row * h <= b.y1 + h; row++, j++) {
    const y = row * h
    const off = (row & 1) * h
    for (let x = Math.floor((b.x0 - off) / (2 * h)) * 2 * h + off; x <= b.x1 + h; x += 2 * h) {
      const k = pick(hash(Math.round(x * 10) + i * 7919, Math.round(y * 10)))
      const e = h - gap
      s += `<path d="M${n(x - e)} ${n(y)}L${n(x)} ${n(y - e)}L${n(x + e)} ${n(y)}L${n(x)} ${n(y + e)}Z" fill="url(#g-${k})"/>`
    }
  }
  // border band of the opening, in ruby (gold round the oculus)
  const bw = o.ring === 0 ? 1.8 : o.ring >= 3 ? 0.7 : 0.95
  const rim = o.ring === 0 ? 'gold' : 'ruby'
  s += `<path d="${o.d}" fill="none" stroke="#06070e" stroke-width="${n(bw * 2 + 1.2)}"/>`
  s += `<path d="${o.d}" fill="none" stroke="url(#g-${rim})" stroke-width="${n(bw * 2)}"/>`
  // the oculus carries a medallion
  if (o.ring === 0) {
    const c = inscribed(o.pts)
    const r = Math.min(c.r * 0.72, 10)
    if (r > 2) {
      s += `<circle cx="${n(c.cx)}" cy="${n(c.cy)}" r="${n(r + 0.9)}" fill="#06070e"/>`
      s += `<circle cx="${n(c.cx)}" cy="${n(c.cy)}" r="${n(r)}" fill="url(#g-gold)"/>`
      s += `<circle cx="${n(c.cx)}" cy="${n(c.cy)}" r="${n(r * 0.62)}" fill="#06070e"/>`
      s += `<circle cx="${n(c.cx)}" cy="${n(c.cy)}" r="${n(r * 0.62 - 0.45)}" fill="url(#g-ruby)"/>`
    }
  }
  return s + '</g>'
}

// ---- stone -------------------------------------------------------------------
// bevel: the stone's own shape, softened, lit by the low sun from the upper
// left — highlights on the top edges, shade below — with fine grain
const BEVEL = `
  <filter id="bevel" x="-2%" y="-2%" width="104%" height="104%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="0.75" result="b"/>
    <feDiffuseLighting in="b" surfaceScale="2.6" diffuseConstant="1.25" lighting-color="#ffffff" result="diff">
      <feDistantLight azimuth="225" elevation="42"/>
    </feDiffuseLighting>
    <feSpecularLighting in="b" surfaceScale="2.6" specularConstant="0.8" specularExponent="14" lighting-color="#ffe0b0" result="spec">
      <feDistantLight azimuth="225" elevation="36"/>
    </feSpecularLighting>
    <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
    <feBlend in="SourceGraphic" in2="diff" mode="multiply" result="shaded"/>
    <feComposite in="shaded" in2="specIn" operator="arithmetic" k2="1" k3="0.5" result="lit"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="4" result="noise"/>
    <feColorMatrix in="noise" type="saturate" values="0" result="grain"/>
    <feComposite in="lit" in2="grain" operator="arithmetic" k1="0.55" k2="0.72" result="grained"/>
    <feComposite in="grained" in2="SourceAlpha" operator="in"/>
  </filter>
  <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="1.3"/>
    <feOffset dx="1.6" dy="2.2"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.75"/></feComponentTransfer>
  </filter>
  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="5"/>
  </filter>
  <filter id="spill" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="14"/>
  </filter>`

/** Ashlar blocks with a small gap, so the bevel catches every block's arrises. */
function wallBlocks(): string {
  const course = 15
  let s = ''
  for (let y = RICH_RECT.y, row = 0; y < RICH_RECT.y + RICH_RECT.h; y += course, row++) {
    let x = RICH_RECT.x - hash(row, 3) * 20
    while (x < RICH_RECT.x + RICH_RECT.w) {
      const len = 28 + hash(row, Math.round(x)) * 20
      const tone = 0.9 + hash(Math.round(x), row) * 0.16
      const c = Math.round(118 * tone)
      s += `<rect x="${n(x + 0.3)}" y="${n(y + 0.3)}" width="${n(len - 0.6)}" height="${n(course - 0.6)}" rx="0.5" fill="rgb(${c},${Math.round(c * 0.95)},${Math.round(c * 0.88)})"/>`
      x += len
    }
  }
  return s
}

/** The 16 voussoirs of the reveal round the rose. */
function voussoirs(): string {
  let s = ''
  const r0 = PLATE_R
  const r1 = REVEAL_R
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2 + 0.006
    const a1 = ((i + 1) / 16) * Math.PI * 2 - 0.006
    const p = (r: number, a: number) => `${n(Math.cos(a) * r)} ${n(Math.sin(a) * r)}`
    const tone = 0.85 + hash(i, 9) * 0.15
    const c = Math.round(104 * tone)
    s += `<path d="M${p(r0, a0)}L${p(r1, a0)}A${r1} ${r1} 0 0 1 ${p(r1, a1)}L${p(r0, a1)}A${r0} ${r0} 0 0 0 ${p(r0, a0)}Z" fill="rgb(${c},${Math.round(c * 0.95)},${Math.round(c * 0.89)})"/>`
  }
  return s
}

function richSvg(): string {
  const R = RICH_RECT
  const W = Math.round(R.w * PX_PER_UNIT)
  const H = Math.round(R.h * PX_PER_UNIT)
  const grads = Object.entries(GLASS)
    .map(([k, [a, b]]) => `<radialGradient id="g-${k}" cx="45%" cy="40%" r="75%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`)
    .join('')
  const clips = roseOpenings.map((o, i) => `<clipPath id="o${i}"><path d="${o.d}"/></clipPath>`).join('')
  // the wall inside the arch, less the circular reveal
  const archIn = archOrder(0).replace(/L([-\d.]+) [\d.]+$/, `L$1 ${FRAME.stringTop}`) + `L${-FRAME.half} ${FRAME.stringTop}Z`
  const glass = roseOpenings.map(pane).join('')
  const plate = plateFill()
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${R.x} ${R.y} ${R.w} ${R.h}">
  <defs>${BEVEL}${grads}${clips}
    <clipPath id="wall-clip"><path clip-rule="evenodd" d="${archIn}${circle(REVEAL_R - 0.3)}"/></clipPath>
    <radialGradient id="reveal-shade" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${REVEAL_R}">
      <stop offset="${n(PLATE_R / REVEAL_R)}" stop-color="#000" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="sun" gradientUnits="userSpaceOnUse" cx="-120" cy="-150" r="320">
      <stop offset="0" stop-color="#ffd59a" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#ffd59a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="cobalt-spill" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="175">
      <stop offset="0.65" stop-color="#3550c8" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#3550c8" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="wall-shade" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="200">
      <stop offset="0.6" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.6"/>
    </radialGradient>
    <g id="glass">${glass}</g>
  </defs>

  <!-- wall inside the arch: dressed ashlar, darker away from the window -->
  <g clip-path="url(#wall-clip)">
    <rect x="${R.x}" y="${R.y}" width="${R.w}" height="${R.h}" fill="#5f584e"/>
    <g filter="url(#bevel)">${wallBlocks()}</g>
    <rect x="${R.x}" y="${R.y}" width="${R.w}" height="${R.h}" fill="url(#sun)" style="mix-blend-mode:soft-light"/>
    <rect x="${R.x}" y="${R.y}" width="${R.w}" height="${R.h}" fill="url(#cobalt-spill)" style="mix-blend-mode:screen"/>
    <rect x="${R.x}" y="${R.y}" width="${R.w}" height="${R.h}" fill="url(#wall-shade)"/>
  </g>
  <!-- the reveal: voussoirs stepping in to the rose, in shade -->
  <g filter="url(#bevel)">${voussoirs()}</g>
  <path d="${circle(REVEAL_R)}" fill="url(#reveal-shade)"/>

  <!-- glass, and its light thrown onto the wall -->
  <use href="#glass" filter="url(#spill)" opacity="0.85" style="mix-blend-mode:screen"/>
  <use href="#glass"/>

  <!-- tracery: its shadow on the glass, then the carved stone -->
  <path d="${plate}" fill-rule="evenodd" filter="url(#shadow)"/>
  <path d="${plate}" fill-rule="evenodd" fill="#9a8f7e" filter="url(#bevel)"/>
  <g filter="url(#bevel)" fill="none" stroke="#958a79">
    <path d="${circle(101.4)}" stroke-width="2.6"/>
    <path d="${circle(106.6)}" stroke-width="3.2"/>
  </g>

  <path d="${plate}" fill-rule="evenodd" fill="url(#sun)" style="mix-blend-mode:soft-light"/>
  <!-- the glass's glow over its own stone edges -->
  <use href="#glass" filter="url(#glow)" opacity="0.55" style="mix-blend-mode:screen"/>
</svg>`
}

/**
 * Renders the rich rose to a PNG and returns its URL (or the SVG's own URL if
 * the browser won't flatten it). Resolves once it's ready.
 */
export async function buildRichRose(): Promise<string> {
  const svg = richSvg()
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const img = new Image()
  img.src = svgUrl
  await img.decode()
  try {
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || Math.round(RICH_RECT.w * PX_PER_UNIT)
    canvas.height = img.naturalHeight || Math.round(RICH_RECT.h * PX_PER_UNIT)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
    if (!blob) throw new Error('toBlob failed')
    URL.revokeObjectURL(svgUrl)
    return URL.createObjectURL(blob)
  } catch {
    return svgUrl
  }
}
