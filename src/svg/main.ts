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
import { drawn, ease, el, lerp, ramp, setDraw, setOp } from './dom'
import { ROUND_X, buildArchScene } from './archScene'

/**
 * Prototype: Gothic architecture as a mason's drawing brought to life.
 *
 * Scene 1, the rose: scroll draws the setting-out, then the tracery ring by
 * ring from the centre, then the glass lights up, and the view pulls back to
 * reveal the arch, the string course and the claire-voie, each layer moving at
 * its own rate so the flat drawing reads with depth.
 *
 * Transition: the camera dives into the head of one lancet of the
 * claire-voie, while the rest of the window falls away.
 *
 * Scene 2, the pointed arch (archScene.ts), is drawn inside that lancet head.
 *
 * Everything is a pure function of scroll progress, so scrolling back up
 * reverses it.
 */

// global progress: scene 1 runs 0 → 0.46 (its own timeline is P / 0.46),
// its text holds to 0.5, the dive runs 0.5 → 0.62, scene 2 runs 0.6 → 1
const S1 = 0.46
const S2_START = 0.6

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
// the lancet the camera dives into: lifted out of the row so it can stay
// while the rest of the window falls away
const PICK = cv.lancets.findIndex((l) => l.cx > 0)
const lPick = el('g', {}, svg)
lPick.appendChild(claireGlass[PICK].g)
lPick.appendChild(claireInk[PICK].p)
const foilInk = drawn(cv.foils, 'fine', lClaire)

// frame: arch orders and capitals
const orderInk = ORDERS.map((o) => drawn(archOrder(o), o === 0 ? 'bold' : 'fine', lFrame))
const capInk = drawn(capitals(), 'fine', lFrame)

// ---- scene 2: the pointed arch, inside the picked lancet's head ---------------------
const pick = cv.lancets[PICK]
const ARCH = { x: pick.cx, y: pick.springY, k: pick.w / 100 }
const arch = buildArchScene(svg, ARCH)
/** a camera shot framing a box given in the arch's local units */
const archShot = (x0: number, y0: number, x1: number, y1: number): Shot => ({
  cx: ARCH.x + ((x0 + x1) / 2) * ARCH.k,
  cy: ARCH.y + ((y0 + y1) / 2) * ARCH.k,
  w: (x1 - x0) * ARCH.k,
  h: (y1 - y0) * ARCH.k,
})
const q2 = (q: number) => S2_START + q * (1 - S2_START) // scene-2 local → global
const SHOTS2: [number, Shot][] = [
  // the dive: onto the head of the lancet
  [0.62, archShot(-70, -120, 70, 40)],
  // the compass work, then the whole arch on its piers
  [q2(0.16), archShot(-80, -125, 80, 45)],
  [q2(0.3), archShot(-110, -140, 110, 250)],
  // widen to bring in the round arch beside it
  [q2(0.42), archShot(-110, -150, ROUND_X + 160, 262)],
  [q2(0.8), archShot(-110, -170, ROUND_X + 160, 262)],
  // make room for the text on the left
  [q2(0.88), archShot(-330, -170, ROUND_X + 140, 262)],
  [1.0, archShot(-330, -170, ROUND_X + 140, 262)],
]

// ---- camera -----------------------------------------------------------------------
interface Shot { cx: number; cy: number; w: number; h: number }
const SHOTS: [number, Shot][] = [
  [0.0, { cx: 0, cy: 0, w: 60, h: 60 }],
  [0.3 * S1, { cx: 0, cy: 0, w: 250, h: 250 }],
  [0.55 * S1, { cx: 0, cy: 0, w: 262, h: 262 }],
  [0.82 * S1, { cx: 0, cy: 34, w: 340, h: 440 }],
  // the text panel sits on the left: slide the drawing right of it
  [S1, { cx: -95, cy: 34, w: 560, h: 452 }],
  [0.5, { cx: -95, cy: 34, w: 560, h: 452 }],
]
function camera(p: number): Shot {
  const shots = SHOTS.concat(SHOTS2)
  let i = 0
  while (i < shots.length - 2 && p > shots[i + 1][0]) i++
  const [p0, a] = shots[i]
  const [p1, b] = shots[i + 1]
  const t = ease(ramp(p, p0, p1))
  // zoom in log space so the dolly moves at an even pace
  const lw = (x: number, y: number) => Math.exp(lerp(Math.log(x), Math.log(y), t))
  return { cx: lerp(a.cx, b.cx, t), cy: lerp(a.cy, b.cy, t), w: lw(a.w, b.w), h: lw(a.h, b.h) }
}

// ---- overlay ------------------------------------------------------------------------
const overlay = document.getElementById('overlay')!
const panelHtml = (c: (typeof sections)[number]) => `
  <div class="panel">
    <div class="kicker">${c.kicker}</div>
    <h2>${c.title}</h2>
    <p>${c.body}</p>
  </div>`
overlay.innerHTML =
  `<div class="intro"><div class="kicker">Gothinia</div><div class="cue">Scroll to draw</div></div>` +
  panelHtml(sections[0]) + panelHtml(sections[1])
const intro = overlay.querySelector<HTMLElement>('.intro')!
const [panel, panel2] = overlay.querySelectorAll<HTMLElement>('.panel')
const showPanel = (el: HTMLElement, v: number) => {
  el.style.opacity = String(v)
  el.style.transform = `translateY(calc(-50% + ${(1 - v) * 16}px))`
}

// ---- the timeline: everything from scroll progress -------------------------------

function render(P: number): void {
  // camera → viewBox, fitted to the window (contain)
  const s = camera(P)
  const p = Math.min(1, P / S1) // scene 1's own timeline
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

  // ---- transition: the window falls away round the picked lancet ----------
  const away = 1 - ease(ramp(P, 0.52, 0.6))
  for (const g of [lWall, lShafts, lRose, lFrame]) setOp(g, away)
  setOp(lClaire, 1 - ease(ramp(P, 0.55, 0.61)))
  // the lancet's own glass goes; its outline hands over to the arch
  setOp(claireGlass[PICK].g, Math.min(ease(ramp(p, 0.76 + pick.x * 0.06, 0.82 + pick.x * 0.06)), 1 - ramp(P, 0.6, 0.64)))
  setOp(claireInk[PICK].p, 1 - ramp(P, 0.66, 0.7))

  // ---- scene 2 -------------------------------------------------------------
  const q = ramp(P, S2_START, 1)
  arch.update(q, ramp(P, 0.58, 0.61), P * 900)

  // overlay
  intro.style.opacity = String(1 - ramp(p, 0.01, 0.05))
  showPanel(panel, ramp(p, 0.86, 0.93) * (1 - ramp(P, 0.48, 0.52)))
  showPanel(panel2, ramp(q, 0.86, 0.93))
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
