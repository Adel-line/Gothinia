import { el } from './dom'

/**
 * Stained glass, as a material.
 *
 * Every pane is built from the same stack of layers, back to front, all clipped
 * to the pane and all drawn from shared definitions (gradients, patterns,
 * filters, symbols) rather than one-off effects:
 *
 *   1. base      a multi-stop radial gradient in the pane's colour family:
 *                bright and translucent at the heart, dense toward the rim
 *   2. mosaic    a trellis of small pieces, each a slightly different pot-metal
 *                from the same family, with hairline cames between them
 *   3. pigment   broad, irregular clouds of darker and paler glass
 *   4. thickness a shared overlay: luminous centre, dark edge
 *   5. sun       a shared wash across the whole window, in the daylight's direction
 *   6. grain     bubbles and cloudy streaks (feTurbulence) — the one costly layer,
 *                so it is faded out while the camera moves (see `setFx`)
 *   7. paint     grisaille: medallions with pearled rims, fronds, small amber details
 *   8. edge      the glass thins and darkens toward the lead
 *
 * The lead came is separate (and drawn above, with the stone plate over it):
 * a charcoal band with a glint on the lit side.
 *
 * Variation is deterministic: everything comes from a hash of the pane's index,
 * so the window looks the same on every load. Palette after the north rose of
 * Notre-Dame: cobalt and ultramarine, violet, ruby and magenta, with amber and
 * pale glass for the lights.
 */

export type Family = 'blue' | 'violet' | 'ruby' | 'amber' | 'pale' | 'green' | 'multi'

interface FamilySpec {
  /** pot-metal pieces of the mosaic */
  cells: string[]
  /** radial: heart → rim */
  stops: [number, string][]
}

const FAMILIES: Record<Exclude<Family, 'multi'>, FamilySpec> = {
  blue: {
    cells: ['#2b5cf0', '#2744c8', '#3d74ff', '#1f38b4', '#3a86e8', '#2a4fc0', '#2f6fdc', '#a9c4ff'],
    stops: [[0, '#6d9fff'], [0.4, '#3a68f5'], [0.8, '#2338ac'], [1, '#0a1450']],
  },
  violet: {
    cells: ['#7a48ee', '#6638d0', '#9560f2', '#5430b0', '#b074ff', '#4a46d0', '#d04cb0', '#c9b4ff'],
    stops: [[0, '#b27cff'], [0.4, '#8248f0'], [0.8, '#44259f'], [1, '#14083e']],
  },
  // dark, deep reds: crimson and ruby, no pink and no orange
  ruby: {
    cells: ['#b81c2c', '#9c1628', '#c8283a', '#82101f', '#ac1a2c', '#8e1424', '#be2a38', '#a01a2a'],
    stops: [[0, '#e03a4c'], [0.4, '#b81c2c'], [0.8, '#6e0c1c'], [1, '#22040a']],
  },
  amber: {
    cells: ['#f6b42a', '#ee9c1e', '#ffd25a', '#de821a', '#fbc848', '#cc741a'],
    stops: [[0, '#ffe680'], [0.42, '#f7b42c'], [0.8, '#c07412'], [1, '#44240a']],
  },
  pale: {
    cells: ['#f2f0fc', '#dedef6', '#fcf8ff', '#cdcdee', '#ede4f6'],
    stops: [[0, '#ffffff'], [0.5, '#e4e2f8'], [0.85, '#9a9acc'], [1, '#3c3c6a']],
  },
  // bottle and olive greens
  green: {
    cells: ['#3a8a56', '#2b6e48', '#55a06c', '#7a9a48', '#2f7a5a', '#4a9060', '#6aa878', '#bcd8bc'],
    stops: [[0, '#74c890'], [0.42, '#3a8a56'], [0.8, '#1a5238'], [1, '#05200f']],
  },
}
const cellsOf = (f: Family): string[] =>
  f === 'multi'
    ? // mostly the cool blues and violets, with ruby, amber and pale pieces among them
      [...FAMILIES.blue.cells.slice(0, 4), ...FAMILIES.violet.cells.slice(0, 4), ...FAMILIES.ruby.cells.slice(0, 3),
        FAMILIES.amber.cells[0], FAMILIES.amber.cells[2], FAMILIES.pale.cells[0]]
    : FAMILIES[f].cells

/** the colour a family glows with, for light spilling past its edge */
export const glowColour = (f: Family): string => (f === 'multi' ? '#7a5ad8' : FAMILIES[f].stops[1][1])

const LEAD = '#08080f'

// ---- deterministic variation ------------------------------------------------------
/** a small integer hash → 0..1 */
export function hash(n: number): number {
  let x = (n | 0) + 0x9e3779b9
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b)
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

/** mix a #rrggbb colour toward white (k > 0) or black (k < 0) */
function tint(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k)))
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

// ---- daylight -----------------------------------------------------------------------
export interface Daylight {
  /** direction the light travels, radians (0 = toward +x, y down); default: from the upper left */
  angle: number
  /** 0..1 */
  intensity: number
}
const daylight: Daylight = { angle: Math.PI * 0.28, intensity: 0.55 }
const glints: SVGElement[] = []
let sunStops: SVGElement[] = []
let sunGrad: SVGElement | null = null
const GLINT = 0.4

function applyDaylight(): void {
  const { angle, intensity } = daylight
  const dx = Math.cos(angle), dy = Math.sin(angle)
  // the wash runs across the window: bright where the light enters, dim far side
  sunGrad?.setAttribute('x1', String(-dx * 130)); sunGrad?.setAttribute('y1', String(-dy * 130))
  sunGrad?.setAttribute('x2', String(dx * 130)); sunGrad?.setAttribute('y2', String(dy * 130))
  sunStops[0]?.setAttribute('stop-opacity', (0.17 * intensity).toFixed(3))
  sunStops[1]?.setAttribute('stop-opacity', '0')
  sunStops[2]?.setAttribute('stop-opacity', (0.34 * intensity).toFixed(3))
  // lead glints sit on the sides facing the light
  for (const g of glints) g.setAttribute('transform', `translate(${(-dx * GLINT).toFixed(3)} ${(-dy * GLINT).toFixed(3)})`)
}

/** Change the daylight: its direction and strength. Cheap; safe to call every frame. */
export function setDaylight(next: Partial<Daylight>): void {
  Object.assign(daylight, next)
  applyDaylight()
}

// ---- the costly layer: gated on camera motion ---------------------------------------
let distortEl: SVGElement | null = null
let distortScale = 0
/**
 * level 0..1: how settled the view is. Grain (feTurbulence) fades in as the
 * camera comes to rest, and the antique-glass distortion eases in with it;
 * while the camera moves both are off so zooming stays smooth.
 */
export function setFx(level: number, root: SVGElement, distortTarget?: SVGElement): void {
  root.style.setProperty('--fx', level.toFixed(3))
  if (distortEl && distortTarget) {
    const on = level > 0.02
    if (on) {
      const s = (distortScale * level).toFixed(3)
      distortEl.setAttribute('scale', s)
      if (!distortTarget.hasAttribute('filter')) distortTarget.setAttribute('filter', 'url(#gl-distort)')
    } else if (distortTarget.hasAttribute('filter')) distortTarget.removeAttribute('filter')
  }
}

// ---- shared definitions -----------------------------------------------------------------
const made = new WeakSet<Element>()
const cache = new Map<string, string>()
let uid = 0

function ensureDefs(defs: Element): void {
  if (made.has(defs)) return
  made.add(defs)

  // one radial base per family, in three focus variants (the light seems to
  // come from a slightly different place in each pane)
  const foci: [number, number][] = [[50, 50], [40, 36], [60, 62]]
  for (const [name, spec] of Object.entries(FAMILIES)) {
    foci.forEach(([fx, fy], v) => {
      const g = el('radialGradient', { id: `gl-base-${name}-${v}`, cx: '50%', cy: '50%', r: '72%', fx: `${fx}%`, fy: `${fy}%` }, defs)
      for (const [o, c] of spec.stops) el('stop', { offset: o, 'stop-color': c }, g)
    })
  }
  // multi: violet-led, so a pane of mixed pieces still has a ground
  foci.forEach(([fx, fy], v) => {
    const g = el('radialGradient', { id: `gl-base-multi-${v}`, cx: '50%', cy: '50%', r: '72%', fx: `${fx}%`, fy: `${fy}%` }, defs)
    for (const [o, c] of FAMILIES.violet.stops) el('stop', { offset: o, 'stop-color': c }, g)
  })

  // thickness: luminous heart, dense rim — shared by every pane
  const th = el('radialGradient', { id: 'gl-thick', cx: '50%', cy: '50%', r: '70%' }, defs)
  el('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0.1 }, th)
  el('stop', { offset: 0.4, 'stop-color': '#fff', 'stop-opacity': 0 }, th)
  el('stop', { offset: 0.78, 'stop-color': '#000010', 'stop-opacity': 0.2 }, th)
  el('stop', { offset: 1, 'stop-color': '#000010', 'stop-opacity': 0.5 }, th)
  // each piece of glass is a little denser on one side
  const shade = el('linearGradient', { id: 'gl-piece', x1: 0, y1: 0, x2: 1, y2: 1 }, defs)
  el('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0.1 }, shade)
  el('stop', { offset: 0.5, 'stop-color': '#fff', 'stop-opacity': 0 }, shade)
  el('stop', { offset: 1, 'stop-color': '#000010', 'stop-opacity': 0.2 }, shade)

  // the daylight wash, across the whole window in drawing units
  sunGrad = el('linearGradient', { id: 'gl-sun', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 0, y2: 0 }, defs)
  sunStops = [
    el('stop', { offset: 0, 'stop-color': '#ffd890' }, sunGrad),
    el('stop', { offset: 0.5, 'stop-color': '#ffd890' }, sunGrad),
    el('stop', { offset: 1, 'stop-color': '#050514' }, sunGrad),
  ]
  applyDaylight()

  // pigment: soft, irregular blotches of denser and paler glass. Plain gradients
  // that follow each pane's own bounding box — a tiled texture would have to be
  // rasterised again on every frame of a zoom
  for (let v = 0; v < 6; v++) {
    const dark = v < 4
    const g = el('radialGradient', {
      id: `gl-blot-${v}`, cx: `${30 + hash(v * 7 + 1) * 40}%`, cy: `${28 + hash(v * 7 + 2) * 44}%`, r: `${34 + hash(v * 7 + 3) * 24}%`,
      gradientTransform: `rotate(${(hash(v * 7 + 4) * 180).toFixed(0)} .5 .5) translate(${(0.5 - 0.5 * (0.6 + hash(v * 7 + 5) * 0.8)).toFixed(3)} 0) scale(${(0.6 + hash(v * 7 + 5) * 0.8).toFixed(3)} 1)`,
    }, defs)
    // gentle: a faint deepening and a faint lightening, never a stain
    el('stop', { offset: 0, 'stop-color': dark ? '#00001a' : '#fff6e4', 'stop-opacity': dark ? 0.09 : 0.12 }, g)
    el('stop', { offset: 1, 'stop-color': dark ? '#00001a' : '#fff6e4', 'stop-opacity': 0 }, g)
  }

  // grain: bubbles and cloudy streaks — the only feTurbulence in the glass
  const grainF = el('filter', { id: 'gl-grain-f', x: 0, y: 0, width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' }, defs)
  // bubbles only: sparse, tiny, pale. (stitchTiles keeps the tile seamless; no dark streaks)
  el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.8 0.9', numOctaves: 1, seed: 5, stitchTiles: 'stitch', result: 'speck' }, grainF)
  el('feColorMatrix', { in: 'speck', type: 'matrix', values: '0 0 0 0 1  0 0 0 0 0.97  0 0 0 0 0.9  14 0 0 0 -10.9' }, grainF)
  const grain = el('pattern', { id: 'gl-grain', width: 80, height: 80, patternUnits: 'userSpaceOnUse' }, defs)
  el('rect', { width: 80, height: 80, filter: 'url(#gl-grain-f)', fill: '#000' }, grain)

  // optical distortion of antique mouth-blown glass: a gentle wobble in the body of the glass
  // (the lead is drawn straight, above it)
  const dist = el('filter', {
    id: 'gl-distort', filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', x: -140, y: -140, width: 280, height: 280,
  }, defs)
  el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.05 0.06', numOctaves: 2, seed: 4, result: 'warp' }, dist)
  distortEl = el('feDisplacementMap', { in: 'SourceGraphic', in2: 'warp', scale: 0, xChannelSelector: 'R', yChannelSelector: 'G' }, dist)
  distortScale = 0.35

  // painted details, in local units. The fill comes from the <use>, so one drawing
  // serves dark paint on pale glass and pale paint on dark.
  // fleur-de-lis, pointing up, about two units tall
  const fleur = el('g', { id: 'gl-fleur' }, defs)
  el('path', {
    d: 'M0 -1C0.3 -0.62 0.34 -0.18 0.13 0.2L0.13 0.3H-0.13L-0.13 0.2C-0.34 -0.18 -0.3 -0.62 0 -1Z' +
      'M-0.15 0.28C-0.58 0.24 -0.92 -0.06 -0.84 -0.46C-0.79 -0.7 -0.56 -0.74 -0.5 -0.58C-0.46 -0.45 -0.56 -0.38 -0.64 -0.42C-0.6 -0.2 -0.4 0 -0.15 0.06Z' +
      'M0.15 0.28C0.58 0.24 0.92 -0.06 0.84 -0.46C0.79 -0.7 0.56 -0.74 0.5 -0.58C0.46 -0.45 0.56 -0.38 0.64 -0.42C0.6 -0.2 0.4 0 0.15 0.06Z' +
      'M-0.46 0.38H0.46V0.54H-0.46ZM0 0.62C0.22 0.76 0.2 0.92 0 1C-0.2 0.92 -0.22 0.76 0 0.62Z',
  }, fleur)
  // ivy leaf, pointing up, about two units tall, with its veins
  const leaf = el('g', { id: 'gl-leaf' }, defs)
  el('path', {
    d: 'M0 0.95C-0.12 0.52 -0.92 0.5 -0.82 -0.1C-0.77 -0.4 -0.5 -0.5 -0.38 -0.56C-0.32 -0.82 -0.12 -0.96 0 -1C0.12 -0.96 0.32 -0.82 0.38 -0.56C0.5 -0.5 0.77 -0.4 0.82 -0.1C0.92 0.5 0.12 0.52 0 0.95Z',
    stroke: LEAD, 'stroke-width': 0.09, 'stroke-linejoin': 'round',
  }, leaf)
  el('path', {
    d: 'M0 0.9V-0.6M0 0.3L-0.4 -0.1M0 0.3L0.4 -0.1M0 -0.1L-0.25 -0.4M0 -0.1L0.25 -0.4',
    stroke: LEAD, 'stroke-width': 0.06, 'stroke-opacity': 0.7, fill: 'none', 'stroke-linecap': 'round',
  }, leaf)
  // a trefoil of leaves
  const tre = el('g', { id: 'gl-trefoil' }, defs)
  for (const a of [0, 120, 240]) el('use', { href: '#gl-leaf', transform: `rotate(${a}) translate(0 -0.62) scale(0.62)` }, tre)
  // a vine: a stem with leaves along it, in pale grisaille (axis +x, about eight units long)
  const vine = el('g', { id: 'gl-vine' }, defs)
  el('path', { d: 'M0 0C2.2 -1.3 4.4 1.3 7.6 0', stroke: '#e6e2f6', 'stroke-width': 0.34, 'stroke-linecap': 'round', fill: 'none', 'stroke-opacity': 0.9 }, vine)
  for (const [tx, ty, r, sc] of [[2.6, -0.9, 20, 1.2], [5.0, 0.95, 160, 1.05], [7.9, 0, 90, 1.35]] as const) {
    el('use', { href: '#gl-leaf', transform: `translate(${tx} ${ty}) rotate(${r}) scale(${sc})`, fill: '#ece9f8', 'fill-opacity': 0.86 }, vine)
  }
}

/**
 * Hand-cut pieces: a lattice whose corners are jittered (the same at opposite
 * edges of the tile, so it repeats without a seam), each piece its own glass
 * from the family, with a hairline came between.
 */
function mosaic(defs: Element, family: Family, variant: number, cell: number, trellis: boolean): string {
  const v = ((variant % 3) + 3) % 3
  const baseKey = `gl-mosaic-${family}-${v}${trellis ? 't' : ''}`
  if (!cache.has(baseKey)) {
    cache.set(baseKey, baseKey)
    // one tile per family and variant, drawn with a cell of 1 unit
    const cells = cellsOf(family)
    const n = 4
    const p = el('pattern', { id: baseKey, width: n, height: n, patternUnits: 'userSpaceOnUse' }, defs)
    const seed = v * 7919 + family.length * 131
    // a trellis is the regular diamond quarry of the lights; otherwise hand-cut, irregular pieces
    const jit = trellis ? 0.06 : 0.6
    const vx = (i: number, j: number) => i + (hash(seed + (((i % n) + n) % n) * 53 + (((j % n) + n) % n) * 97) - 0.5) * jit
    const vy = (i: number, j: number) => j + (hash(seed + (((i % n) + n) % n) * 211 + (((j % n) + n) % n) * 31 + 7) - 0.5) * jit
    let came = ''
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const base = cells[Math.floor(hash(seed + i * 31 + j * 131 + 3) * cells.length)]
        const fill = tint(base, (hash(seed + i * 7 + j * 13 + 5) - 0.5) * 0.26)
        const pts = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, b]) => `${vx(a, b).toFixed(2)} ${vy(a, b).toFixed(2)}`)
        const d = `M${pts.join('L')}Z`
        el('path', { d, fill, 'fill-opacity': 0.84 }, p)
        el('path', { d, fill: 'url(#gl-piece)' }, p)
        came += d
      }
    }
    // the trellis is leaded in pale strips (as in the north rose); cut pieces in dark came
    if (trellis) el('path', { d: came, fill: 'none', stroke: '#e6e0ff', 'stroke-width': 0.11, 'stroke-opacity': 0.4, 'stroke-linejoin': 'round' }, p)
    el('path', { d: came, fill: 'none', stroke: LEAD, 'stroke-width': trellis ? 0.045 : 0.1, 'stroke-opacity': trellis ? 0.5 : 0.52, 'stroke-linejoin': 'round' }, p)
  }
  // a pane's trellis is the base tile at its own scale and turn: an alias that shares the tile's content
  const key = `${baseKey}-${cell.toFixed(2).replace('.', '_')}`
  if (!cache.has(key)) {
    cache.set(key, key)
    el('pattern', { id: key, href: `#${baseKey}`, patternTransform: `rotate(${trellis ? 45 : 20 + v * 15}) scale(${cell})` }, defs)
  }
  return key
}

/** the trellis of pieces for a family, as a fill */
export function mosaicFill(defs: Element, family: Family, variant: number, cell: number, trellis = false): string {
  ensureDefs(defs)
  return `url(#${mosaic(defs, family, variant, cell, trellis)})`
}
/** the glass grain, as a fill (bubbles and cloudy streaks); wrap it in a `.gl-fx` group */
export const GRAIN_FILL = 'url(#gl-grain)'
/** the shared thickness and daylight overlays */
export const THICK_FILL = 'url(#gl-thick)'
/** broad blotches of darker and paler glass (two variants) */
export const pigmentFill = (v: number) => `url(#gl-blot-${((v % 4) + 4) % 4})`
export const SUN_FILL = 'url(#gl-sun)'
export const LEAD_COLOUR = LEAD

/** the fill a medallion or border should use for a family */
export function glassFill(defs: Element, family: Family, variant = 0): string {
  ensureDefs(defs)
  return `url(#gl-base-${family}-${variant % 3})`
}

// ---- panes -----------------------------------------------------------------------------
export interface PaneGeo {
  /** the pane's outline */
  d: string
  /** where the pane starts along its axis (the sill / base), the axis angle, and its length and width */
  base: [number, number]
  ang: number
  len: number
  wid: number
}

export interface PaneSpec {
  base: Family
  mosaic: Family
  /** which piece-pattern, 0.. */
  variant: number
  /** size of one piece, in drawing units */
  cell: number
  /** a pearled medallion on the axis, in this family, with a painted motif (pale paint on dark glass) */
  medallion?: Family
  motif?: 'fleur' | 'trefoil'
  inkPale?: boolean
  /** pale vines up and down the axis */
  fronds?: boolean
  /** pearls along the rim */
  pearls?: boolean
  /** a regular diamond trellis with pale cames (the lights), rather than irregular cut pieces */
  trellis?: boolean
  /** lead came width; 0 → default */
  lead?: number
}

/** Metrics of an outline given as points: where it sits and how long and wide it is along its radial axis. */
export function paneGeoFromPoints(d: string, pts: [number, number][]): PaneGeo {
  let cx = 0, cy = 0
  for (const [x, y] of pts) { cx += x; cy += y }
  cx /= pts.length; cy /= pts.length
  const ang = Math.atan2(cy, cx)
  const ux = Math.cos(ang), uy = Math.sin(ang)
  let a0 = Infinity, a1 = -Infinity, w0 = Infinity, w1 = -Infinity
  for (const [x, y] of pts) {
    const a = x * ux + y * uy
    const w = -x * uy + y * ux
    a0 = Math.min(a0, a); a1 = Math.max(a1, a)
    w0 = Math.min(w0, w); w1 = Math.max(w1, w)
  }
  const wc = (w0 + w1) / 2
  return { d, base: [ux * a0 - uy * wc, uy * a0 + ux * wc], ang, len: a1 - a0, wid: w1 - w0 }
}

export interface Pane {
  /** the glass itself (everything but the lead) and the lead came: fade both together */
  body: SVGGElement
  lead: SVGGElement
}

/**
 * Build one pane into `body` (the glass) and `lead` (the came). `id` is any
 * number unique to the pane; it keys all the pane's variation.
 */
export function glassPane(
  bodyParent: Element,
  leadParent: Element,
  defs: Element,
  id: number,
  geo: PaneGeo,
  spec: PaneSpec,
): Pane {
  ensureDefs(defs)
  const n = ++uid
  const pid = `gp${n}`
  const h = (k: number) => hash(id * 977 + k * 131)
  el('path', { id: pid, d: geo.d }, defs)
  const cp = el('clipPath', { id: `gc${n}` }, defs)
  el('use', { href: `#${pid}` }, cp)
  const ref = `#${pid}`
  const use = (parent: Element, attrs: Record<string, string | number>) => el('use', { href: ref, ...attrs }, parent)

  const body = el('g', { 'clip-path': `url(#gc${n})` }, bodyParent)
  // 1. base
  use(body, { fill: `url(#gl-base-${spec.base}-${Math.floor(h(1) * 3)})` })
  // 2. mosaic, in one of three variants
  use(body, { fill: `url(#${mosaic(defs, spec.mosaic, spec.variant + Math.floor(h(2) * 3), spec.cell, !!spec.trellis)})` })
  // 3-6. the subtle layers, which fade in only while the view is at rest (see setFx):
  // pigment (two darker clouds and a paler one, placed differently in every pane),
  // the daylight wash, and the grain
  const fx = el('g', { class: 'gl-fx' }, body)
  const b0 = Math.floor(h(3) * 4)
  el('use', { href: ref, fill: `url(#gl-blot-${b0})` }, fx)
  el('use', { href: ref, fill: `url(#gl-blot-${(b0 + 1 + Math.floor(h(10) * 3)) % 4})` }, fx)
  el('use', { href: ref, fill: `url(#gl-blot-${4 + Math.floor(h(11) * 2)})` }, fx)
  el('use', { href: ref, fill: 'url(#gl-sun)' }, fx)
  el('use', { href: ref, fill: GRAIN_FILL, 'fill-opacity': 0.7 }, fx)
  // thickness, over all of it: luminous heart, dense rim
  use(body, { fill: 'url(#gl-thick)' })

  // 7. paint
  const paint = el('g', {}, body)
  const [bx, by] = geo.base
  const ux = Math.cos(geo.ang), uy = Math.sin(geo.ang)
  const at = (t: number) => [bx + ux * geo.len * t, by + uy * geo.len * t] as const
  if (spec.medallion) {
    const [mx, my] = at(0.46)
    const r = Math.min(geo.wid * 0.27, geo.len * 0.16)
    const m = el('g', { transform: `translate(${mx.toFixed(2)} ${my.toFixed(2)})` }, paint)
    el('circle', { r: r + 0.32, fill: LEAD, 'fill-opacity': 0.85 }, m)
    el('circle', { r, fill: `url(#gl-base-${spec.medallion}-${Math.floor(h(4) * 3)})` }, m)
    el('circle', { r, fill: `url(#gl-blot-${Math.floor(h(9) * 4)})` }, m)
    el('circle', { r, fill: 'url(#gl-thick)' }, m)
    // a pearled rim, and a painted rosette at the heart
    el('circle', {
      r: r * 0.84, fill: 'none', stroke: '#efe9ff', 'stroke-width': Math.max(0.4, r * 0.11), 'stroke-linecap': 'round',
      'stroke-dasharray': `0.001 ${((2 * Math.PI * r * 0.84) / Math.round(r * 5.6)).toFixed(3)}`, 'stroke-opacity': 0.88,
    }, m)
    // a painted fleur-de-lis or a trefoil of leaves, dark on pale glass and pale on dark
    el('use', {
      href: spec.motif === 'trefoil' ? '#gl-trefoil' : '#gl-fleur',
      fill: spec.inkPale ? '#f3f0fc' : LEAD, 'fill-opacity': spec.inkPale ? 0.95 : 0.9,
      transform: `scale(${(r * (spec.motif === 'trefoil' ? 0.7 : 0.6)).toFixed(3)})`,
    }, m)
  }
  if (spec.fronds) {
    // a frond up and a frond down the axis, alike but never identical
    const flip = h(6) < 0.5 ? 1 : -1
    for (const [t, dir] of [[0.12, 1], [0.86, -1]] as const) {
      const [fxp, fyp] = at(t)
      const s = (Math.min(geo.len * 0.17, geo.wid * 0.95) * (0.9 + h(7 + t) * 0.25)) / 10
      el('use', {
        href: '#gl-vine',
        transform: `translate(${fxp.toFixed(2)} ${fyp.toFixed(2)}) rotate(${((geo.ang * 180) / Math.PI + (dir === 1 ? 0 : 180)).toFixed(1)}) scale(${s.toFixed(3)} ${(s * flip).toFixed(3)})`,
        opacity: 0.9,
      }, paint)
    }
  }
  // 8. edge: the glass thins and darkens toward the lead
  // (scaled to the pane: a small light must not be swallowed by its own edge)
  const rim = Math.min(1.6, Math.max(0.45, Math.min(geo.wid, geo.len) * 0.09))
  use(body, { fill: 'none', stroke: '#02020c', 'stroke-width': rim * 2.2, 'stroke-opacity': 0.14, 'stroke-linejoin': 'round' })
  use(body, { fill: 'none', stroke: '#02020c', 'stroke-width': rim * 1.0, 'stroke-opacity': 0.2, 'stroke-linejoin': 'round' })
  if (spec.pearls) {
    use(body, {
      fill: 'none', stroke: '#f6f1ff', 'stroke-width': 1.1, 'stroke-linecap': 'round', 'stroke-opacity': 0.8,
      'stroke-dasharray': '0.001 2.3', transform: 'translate(0 0)',
    })
  }

  // the lead came
  const w = (spec.lead || 1.1) * (0.88 + h(8) * 0.28)
  const lead = el('g', { 'clip-path': `url(#gc${n})` }, leadParent)
  use(lead, { fill: 'none', stroke: LEAD, 'stroke-width': w * 2, 'stroke-linejoin': 'round' })
  // a soft glint along the lit side, a dark seam on the other
  const glint = el('g', {}, lead)
  glints.push(glint)
  use(glint, { fill: 'none', stroke: '#b6b8d0', 'stroke-opacity': 0.3, 'stroke-width': 0.42, 'stroke-linejoin': 'round' })
  const seam = el('g', { transform: 'translate(0.5 0.5)' }, lead)
  use(seam, { fill: 'none', stroke: '#000', 'stroke-opacity': 0.5, 'stroke-width': 0.6, 'stroke-linejoin': 'round' })
  applyDaylight()

  return { body, lead }
}

// ---- the rose ---------------------------------------------------------------------------
/** the colours of the rose's panes, ring by ring: after the north rose of Notre-Dame */
export function rosePaneSpec(ring: number, i: number): PaneSpec {
  // classic colours only: blue, dark red and green, with gold and pale glass for the medallions
  const loc = i - [0, 1, 13, 37, 61, 85][ring] // index within the ring, so the alternation staggers
  const onBlue = (n: number): Pick<PaneSpec, 'medallion' | 'inkPale'> => (n % 2 ? { medallion: 'amber' } : { medallion: 'ruby', inkPale: true })
  const onRuby = (n: number): Pick<PaneSpec, 'medallion' | 'inkPale'> => (n % 2 ? { medallion: 'blue', inkPale: true } : { medallion: 'pale' })
  switch (ring) {
    case 0: return { base: 'ruby', mosaic: 'ruby', variant: 0, cell: 1.5, medallion: 'amber', motif: 'fleur', pearls: true, lead: 1.5 }
    case 1: {
      const blue = loc % 2 === 0
      return {
        base: blue ? 'blue' : 'ruby', mosaic: blue ? 'blue' : 'ruby', variant: loc, cell: 2.6, trellis: true,
        ...(blue ? onBlue(loc >> 1) : onRuby(loc >> 1)), motif: 'fleur', fronds: true,
      }
    }
    case 2: {
      const kind = (['blue', 'ruby', 'blue', 'green'] as const)[loc % 4]
      return {
        base: kind, mosaic: kind, variant: loc, cell: 2.3, trellis: true,
        ...(kind === 'ruby' ? onRuby(loc >> 2) : kind === 'blue' ? onBlue(loc >> 2) : { medallion: 'amber' }), motif: 'trefoil', fronds: true,
      }
    }
    case 3: { const f: Family = loc % 2 ? 'blue' : 'ruby'; return { base: f, mosaic: f, variant: loc, cell: 1.5, pearls: true, lead: 1.0 } }
    case 4: { const f: Family = loc % 2 ? 'pale' : 'amber'; return { base: f, mosaic: f, variant: loc, cell: 1.1, lead: 0.9 } }
    default: { const f: Family = loc % 2 ? 'green' : 'blue'; return { base: f, mosaic: f, variant: loc, cell: 1.7, pearls: true, lead: 1.0 } }
  }
}

/** the colours of the claire-voie lancets: blue and dark red in turn, with the odd green one */
export function lancetSpec(i: number): PaneSpec {
  const kind = i % 4 === 1 ? 'ruby' : i % 8 === 6 ? 'green' : 'blue'
  return {
    base: kind, mosaic: kind, variant: i, cell: 2.6, trellis: true, lead: 0.9, fronds: true, motif: 'fleur',
    ...(kind === 'blue' ? { medallion: 'ruby' as Family, inkPale: true } : { medallion: 'amber' as Family }),
  }
}

