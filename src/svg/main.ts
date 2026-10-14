import './svg.css'
import { sections } from '../content/sections'
import {
  ORDERS,
  PLATE_R,
  REVEAL_R,
  FRAME,
  U,
  archOrder,
  ashlar,
  capitals,
  circle,
  claireVoie,
  construction,
  plateFill,
  roseOpenings,
  stringCourse,
} from './geometry'

/**
 * Prototype: the rose window as a mason's drawing brought to life.
 *
 * Scroll draws the setting-out, then the tracery ring by ring from the centre,
 * then the glass lights up, and the view pulls back to reveal the arch, the
 * string course and the claire-voie, each layer moving at its own rate so the
 * flat drawing reads with depth. Everything is a pure function of scroll
 * progress, so scrolling back up reverses it.
 */

// ---- helpers ------------------------------------------------------------------
const ramp = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)))
const ease = (x: number) => x * x * (3 - 2 * x)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// ---- palette: deep pot-metal glass; stone is ink on dark ---------------------
const GLASS = {
  cobalt: '#1d3a9e',
  cobaltDeep: '#132a7a',
  ruby: '#9c1a24',
  gold: '#c98a22',
  emerald: '#1f6b3c',
  murrey: '#5a2160',
}
/** ground + border per ring: blue dominant, ruby to punctuate */
function paneColours(ring: number, i: number): { ground: string; border: string } {
  switch (ring) {
    case 0: return { ground: GLASS.ruby, border: GLASS.gold }
    case 1: return { ground: GLASS.cobalt, border: GLASS.ruby }
    case 2: return { ground: i % 2 ? GLASS.cobaltDeep : GLASS.cobalt, border: GLASS.ruby }
    case 3: return { ground: GLASS.ruby, border: GLASS.cobalt }
    case 4: return { ground: i % 3 === 0 ? GLASS.emerald : GLASS.cobalt, border: GLASS.gold }
    default: return { ground: i % 2 ? GLASS.murrey : GLASS.cobalt, border: GLASS.ruby }
  }
}

// ---- build the drawing ----------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg'
function el<K extends keyof SVGElementTagNameMap>(
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
function drawn(d: string, cls: string, parent: Element): SVGPathElement {
  return el('path', { d, class: `ink ${cls}`, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, parent)
}

const svg = el('svg', { class: 'stage', preserveAspectRatio: 'xMidYMid meet' })
document.getElementById('app')!.appendChild(svg)

const defs = el('defs', {}, svg)
defs.innerHTML = `
  <pattern id="quarry" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <path d="M0 0H7M0 0V7" stroke="#05060c" stroke-width="0.55" opacity="0.85"/>
  </pattern>
  <radialGradient id="pane-light" cx="50%" cy="45%" r="60%">
    <stop offset="0" stop-color="#fff" stop-opacity="0.22"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.35"/>
  </radialGradient>
  <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="6"/>
  </filter>
  <linearGradient id="shaft" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#5b74d6" stop-opacity="0.32"/>
    <stop offset="0.5" stop-color="#7b5fb0" stop-opacity="0.12"/>
    <stop offset="1" stop-color="#7b5fb0" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="wall-fade" gradientUnits="userSpaceOnUse" cx="0" cy="20" r="330">
    <stop offset="0.35" stop-color="#fff" stop-opacity="1"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </radialGradient>
  <mask id="wall-mask" maskUnits="userSpaceOnUse" x="-500" y="-400" width="1000" height="900">
    <rect x="-500" y="-400" width="1000" height="900" fill="url(#wall-fade)"/>
  </mask>
  <radialGradient id="halo" cx="50%" cy="50%" r="50%">
    <stop offset="0.55" stop-color="#2b3f9a" stop-opacity="0.35"/>
    <stop offset="1" stop-color="#2b3f9a" stop-opacity="0"/>
  </radialGradient>`

// layers, back to front; each moves at its own rate as the view pulls back
const lWall = el('g', { class: 'layer', mask: 'url(#wall-mask)' }, svg)
const lShafts = el('g', { class: 'layer shafts' }, svg)
const lClaire = el('g', { class: 'layer' }, svg)
const lRose = el('g', { class: 'layer' }, svg)
const lFrame = el('g', { class: 'layer' }, svg)

// wall
const SPAN = 420
const wallLines = drawn(ashlar(SPAN, -260, FRAME.footY), 'faint', lWall)
const stringLine = drawn(stringCourse(SPAN), 'fine', lWall)

// light shafts falling from the rose into the nave (towards the viewer)
const shafts = [
  'M-60 -20L-20 -60L-120 420L-330 420Z',
  'M-10 -30L40 -40L60 420L-120 420Z',
  'M30 10L80 -10L260 420L120 420Z',
].map((d) => el('path', { d, fill: 'url(#shaft)', opacity: 0 }, lShafts))

// rose: halo, glass (with a blurred copy for glow), stone plate, ink
const halo = el('circle', { r: PLATE_R * 1.5, fill: 'url(#halo)', opacity: 0 }, lRose)
const glassAll = el('g', { id: 'glass-all' }, lRose)
const glowUse = el('use', { href: '#glass-all', filter: 'url(#glow)', opacity: 0, class: 'glow' }, lRose)
lRose.insertBefore(glowUse, glassAll)
const panes = roseOpenings.map((o, i) => {
  const { ground, border } = paneColours(o.ring, i)
  const cid = `c${i}`
  el('clipPath', { id: cid }, defs).appendChild(el('path', { d: o.d }))
  const g = el('g', { 'clip-path': `url(#${cid})`, opacity: 0 }, glassAll)
  el('path', { d: o.d, fill: ground }, g)
  el('path', { d: o.d, fill: 'url(#quarry)' }, g)
  el('path', { d: o.d, fill: 'none', stroke: border, 'stroke-width': o.ring === 0 ? 5 : 3.2 }, g)
  el('path', { d: o.d, fill: 'url(#pane-light)' }, g)
  return { g, r: o.r }
})
const stone = el('path', { d: plateFill(), class: 'stone', 'fill-rule': 'evenodd', opacity: 0 }, lRose)

const setOut = el('g', { class: 'setout' }, lRose)
const setRings = construction.rings.map((r) => drawn(circle(r), 'guide', setOut))
const setRadii = construction.radii.map((d) => drawn(d, 'guide', setOut))

const roseInk = roseOpenings.map((o) => ({ p: drawn(o.d, 'fine', lRose), r: o.r }))
const rims = [U * 1.0, PLATE_R, REVEAL_R].map((r) => drawn(circle(r), 'fine', lRose))

// claire-voie
const cv = claireVoie()
const claireGlass = cv.lancets.map((l, i) => {
  const cid = `l${i}`
  el('clipPath', { id: cid }, defs).appendChild(el('path', { d: l.d }))
  const g = el('g', { 'clip-path': `url(#${cid})`, opacity: 0 }, lClaire)
  el('path', { d: l.d, fill: i % 4 === 1 ? GLASS.ruby : GLASS.cobalt }, g)
  el('path', { d: l.d, fill: 'url(#quarry)' }, g)
  el('path', { d: l.d, fill: 'none', stroke: i % 4 === 1 ? GLASS.cobalt : GLASS.ruby, 'stroke-width': 2.6 }, g)
  el('path', { d: l.d, fill: 'url(#pane-light)' }, g)
  return { g, x: l.x }
})
const claireInk = cv.lancets.map((l) => ({ p: drawn(l.d, 'fine', lClaire), x: l.x }))
const foilInk = drawn(cv.foils, 'fine', lClaire)

// frame: arch orders and capitals
const orderInk = ORDERS.map((o) => drawn(archOrder(o), o === 0 ? 'bold' : 'fine', lFrame))
const capInk = drawn(capitals(), 'fine', lFrame)

// ---- camera -----------------------------------------------------------------------
interface Shot { cx: number; cy: number; w: number; h: number }
const SHOTS: [number, Shot][] = [
  [0.0, { cx: 0, cy: 0, w: 60, h: 60 }],
  [0.3, { cx: 0, cy: 0, w: 250, h: 250 }],
  [0.55, { cx: 0, cy: 0, w: 262, h: 262 }],
  [0.82, { cx: 0, cy: 34, w: 340, h: 440 }],
  // the text panel sits on the left: slide the drawing right of it
  [1.0, { cx: -95, cy: 34, w: 560, h: 452 }],
]
function camera(p: number): Shot {
  let i = 0
  while (i < SHOTS.length - 2 && p > SHOTS[i + 1][0]) i++
  const [p0, a] = SHOTS[i]
  const [p1, b] = SHOTS[i + 1]
  const t = ease(ramp(p, p0, p1))
  // zoom in log space so the dolly moves at an even pace
  const lw = (x: number, y: number) => Math.exp(lerp(Math.log(x), Math.log(y), t))
  return { cx: lerp(a.cx, b.cx, t), cy: lerp(a.cy, b.cy, t), w: lw(a.w, b.w), h: lw(a.h, b.h) }
}

// ---- overlay ------------------------------------------------------------------------
const content = sections[0]
const overlay = document.getElementById('overlay')!
overlay.innerHTML = `
  <div class="intro"><div class="kicker">Gothinia</div><div class="cue">Scroll to draw</div></div>
  <div class="panel">
    <div class="kicker">${content.kicker}</div>
    <h2>${content.title}</h2>
    <p>${content.body}</p>
  </div>`
const intro = overlay.querySelector<HTMLElement>('.intro')!
const panel = overlay.querySelector<HTMLElement>('.panel')!

// ---- the timeline: everything from scroll progress -------------------------------
const setDraw = (p: SVGPathElement, t: number) => p.setAttribute('stroke-dashoffset', String(1 - t))
const setOp = (e: Element, t: number) => e.setAttribute('opacity', t.toFixed(3))

function render(p: number): void {
  // camera → viewBox, fitted to the window (contain)
  const s = camera(p)
  const A = innerWidth / innerHeight
  const vw = s.w / s.h > A ? s.w : s.h * A
  const vh = vw / A
  svg.setAttribute('viewBox', `${s.cx - vw / 2} ${s.cy - vh / 2} ${vw} ${vh}`)
  // keep lines hairline-thin on screen at every zoom
  svg.style.setProperty('--px', String(vw / innerWidth))

  // depth: as the view pulls back, nearer layers travel further (a dolly,
  // not a zoom) — the frame is nearest, the wall behind the rose furthest
  const back = ease(ramp(p, 0.52, 0.85))
  const depth = (g: Element, k: number) =>
    g.setAttribute('transform', `translate(0 34) scale(${1 + k * (1 - back)}) translate(0 -34)`)
  depth(lFrame, 0.1)
  depth(lClaire, 0.05)
  depth(lWall, -0.04)
  depth(lShafts, 0.14)

  // 1. setting-out, then the tracery ring by ring from the centre
  setRings.forEach((c, i) => setDraw(c, ease(ramp(p, 0.0 + i * 0.03, 0.08 + i * 0.03))))
  setRadii.forEach((c, i) => setDraw(c, ease(ramp(p, 0.04 + (i % 12) * 0.006, 0.14 + (i % 12) * 0.006))))
  setOp(setOut, 0.55 * (1 - ramp(p, 0.3, 0.42)))
  roseInk.forEach(({ p: path, r }) => setDraw(path, ease(ramp(p, 0.02 + r * 0.24, 0.1 + r * 0.24))))
  rims.forEach((c, i) => setDraw(c, ease(ramp(p, 0.26 + i * 0.03, 0.36 + i * 0.03))))
  setOp(stone, ramp(p, 0.3, 0.42))

  // 2. the glass lights up, centre outward
  panes.forEach(({ g, r }) => setOp(g, ease(ramp(p, 0.36 + r * 0.14, 0.42 + r * 0.14))))
  setOp(glowUse, 0.75 * ramp(p, 0.42, 0.58))
  setOp(halo, ramp(p, 0.45, 0.62))

  // 3. the pull-back: arch, string course, claire-voie, wall
  orderInk.forEach((o, i) => setDraw(o, ease(ramp(p, 0.55 + i * 0.025, 0.7 + i * 0.025))))
  setDraw(capInk, ramp(p, 0.68, 0.74))
  setDraw(stringLine, ease(ramp(p, 0.62, 0.74)))
  claireInk.forEach(({ p: path, x }) => setDraw(path, ease(ramp(p, 0.66 + x * 0.06, 0.74 + x * 0.06))))
  setDraw(foilInk, ramp(p, 0.74, 0.8))
  claireGlass.forEach(({ g, x }) => setOp(g, ease(ramp(p, 0.76 + x * 0.06, 0.82 + x * 0.06))))
  setDraw(wallLines, ease(ramp(p, 0.7, 0.9)))
  shafts.forEach((sh, i) => setOp(sh, ease(ramp(p, 0.8 + i * 0.03, 0.92 + i * 0.03))))

  // overlay
  intro.style.opacity = String(1 - ramp(p, 0.01, 0.05))
  const pv = ramp(p, 0.86, 0.93)
  panel.style.opacity = String(pv)
  panel.style.transform = `translateY(calc(-50% + ${(1 - pv) * 16}px))`
}

// ---- scroll: eased toward the target so wheel steps glide ------------------------
let target = 0
let current = 0
const readScroll = () => {
  const max = document.documentElement.scrollHeight - innerHeight
  target = max > 0 ? scrollY / max : 0
}
addEventListener('scroll', readScroll, { passive: true })
addEventListener('resize', () => { readScroll(); render(current) })
readScroll()
current = target
const tick = () => {
  current += (target - current) * 0.12
  if (Math.abs(target - current) < 1e-5) current = target
  render(current)
  requestAnimationFrame(tick)
}
render(current)
requestAnimationFrame(tick)
