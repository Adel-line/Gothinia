import './svg.css'
import { sections } from '../content/sections'
import {
  ORDERS,
  PLATE_R,
  REVEAL_R,
  FRAME,
  U,
  archOrder,
  archBand,
  archJoints,
  ashlar,
  circle,
  claireVoie,
  construction,
  dogtooth,
  nookShafts,
  plateFill,
  roseJoints,
  roseOpenings,
  stringCourse,
} from './geometry'
import { drawn, ease, ease5, el, monotone, ramp, setDraw, setOp, setShow, smoothDamp } from './dom'
import { ROUND_X, buildArchScene } from './archScene'

/**
 * Prototype: Gothic architecture as a mason's drawing brought to life.
 *
 * Scene 1, the rose: scroll draws the setting-out, then the tracery ring by
 * ring from the centre, then the glass lights up, and the view pulls back to
 * reveal the arch, the string course and the claire-voie, each layer moving at
 * its own rate so the flat drawing reads with depth.
 *
 * Transition: the glass dims, then every line of the window breaks into
 * fragments that drift and reform as the two arches of scene 2.
 *
 * Scene 2, the pointed arch (archScene.ts), ends with its windows glazed.
 *
 * Everything is a pure function of scroll progress, so scrolling back up
 * reverses it.
 */

// global progress: scene 1 runs 0 → 0.46 (its own timeline is P / 0.46),
// its text holds to 0.5; the lines break up and reform 0.535 → 0.67;
// scene 2 runs 0.68 → 1
const S1 = 0.46
const S2_START = 0.68
// the rose's lines break apart and reform as the arches between these
const FRAG_START = 0.535
const FRAG_END = 0.67

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
const toothLine = drawn(dogtooth(SPAN), 'fine', lWall)

// light shafts falling from the rose into the nave (towards the viewer)
const shafts = [
  'M-60 -20L-20 -60L-120 420L-330 420Z',
  'M-10 -30L40 -40L60 420L-120 420Z',
  'M30 10L80 -10L260 420L120 420Z',
].map((d) => el('path', { d, fill: 'url(#shaft)', opacity: 0 }, lShafts))

// rose: halo, glass (with a blurred copy for glow), stone plate, ink
const halo = el('circle', { r: PLATE_R * 1.5, fill: 'url(#halo)', opacity: 0 }, lRose)
// light bleeding past the rim of each pane: stacked soft strokes, not a blur
// filter (a live filter re-rasterises the whole rose on every camera move)
const bleed = el('g', { opacity: 0, 'stroke-linejoin': 'round', fill: 'none' }, lRose)
const glassAll = el('g', { id: 'glass-all' }, lRose)
const panes = roseOpenings.map((o, i) => {
  const { ground, border } = paneColours(o.ring, i)
  const cid = `c${i}`
  el('clipPath', { id: cid }, defs).appendChild(el('path', { d: o.d }))
  const g = el('g', { 'clip-path': `url(#${cid})`, opacity: 0 }, glassAll)
  el('path', { d: o.d, fill: ground }, g)
  el('path', { d: o.d, fill: 'url(#quarry)' }, g)
  el('path', { d: o.d, fill: 'none', stroke: border, 'stroke-width': o.ring === 0 ? 5 : 3.2 }, g)
  el('path', { d: o.d, fill: 'url(#pane-light)' }, g)
  for (const [w, a] of [[9, 0.07], [5, 0.1]]) el('path', { d: o.d, stroke: ground, 'stroke-width': w, 'stroke-opacity': a }, bleed)
  return { g, r: o.r }
})
const stone = el('path', { d: plateFill(), class: 'stone', 'fill-rule': 'evenodd', opacity: 0 }, lRose)
// the rim: a ring of voussoirs between the plate and the reveal
const rimBand = el('path', { d: circle(REVEAL_R) + circle(PLATE_R), class: 'stone b', 'fill-rule': 'evenodd', opacity: 0 }, lRose)
const rimJoints = drawn(roseJoints(), 'faint2', lRose)

const setOut = el('g', { class: 'setout' }, lRose)
const setRings = construction.rings.map((r) => drawn(circle(r), 'guide', setOut))
const setRadii = construction.radii.map((d) => drawn(d, 'guide', setOut))

const roseInk = roseOpenings.map((o) => ({ p: drawn(o.d, 'fine', lRose), r: o.r }))
const rims = [U * 1.0, PLATE_R, REVEAL_R].map((r) => drawn(circle(r), 'fine', lRose))

// claire-voie: paired lancets, each pair under an arch whose head is a pierced plate
const cv = claireVoie()
const bayPlates = el('path', { d: cv.bays.map((b) => b.plate).join(''), class: 'stone a', 'fill-rule': 'evenodd', opacity: 0 }, lClaire)
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
// the oculus in each head: a ruby light with a cobalt quatrefoil at its heart
const oculusGlass = cv.bays.map((b, i) => {
  const g = el('g', { opacity: 0 }, lClaire)
  el('path', { d: b.oculus, fill: i % 2 ? GLASS.cobalt : GLASS.ruby }, g)
  el('path', { d: b.foil, fill: i % 2 ? GLASS.ruby : GLASS.cobalt, stroke: GLASS.gold, 'stroke-width': 0.5 }, g)
  return { g, x: b.x }
})
const claireInk = cv.lancets.map((l) => ({ p: drawn(l.d, 'fine', lClaire), x: l.x }))
const bayInk = cv.bays.map((b) => ({ p: drawn(b.arch + b.oculus, 'fine', lClaire), x: b.x }))
const foilInk = drawn(cv.bays.map((b) => b.foil).join(''), 'fine', lClaire)

// frame: the arch as moulded stone — bands between the orders, voussoir joints,
// nook shafts with their capitals and bases
const nooks = nookShafts()
const bandA = el('path', { d: archBand(0, 5) + archBand(13, 21), class: 'stone a', opacity: 0 }, lFrame)
const bandB = el('path', { d: archBand(5, 13) + archBand(21, 29), class: 'stone b', opacity: 0 }, lFrame)
const shaftFill = el('path', { d: nooks.fill, class: 'stone a', opacity: 0 }, lFrame)
const orderInk = ORDERS.map((o) => drawn(archOrder(o), o === 0 ? 'bold' : 'fine', lFrame))
const jointInk = drawn(archJoints(), 'faint2', lFrame)
const capInk = drawn(nooks.ink, 'fine', lFrame)

// ---- scene 2: the pointed arch, where the rose stood ------------------------------
// the pair of arches (local x −68 … ROUND_X + 68, y −150 … 250) is centred
// on the rose's place in the drawing, at about the rose's size
const AK = 0.8
const ARCH = { x: -(ROUND_X / 2) * AK, y: 34 - 50 * AK, k: AK }
const arch = buildArchScene(svg, defs, ARCH)
const fragments = buildFragments()
/** a camera shot framing a box given in the arch's local units */
const archShot = (x0: number, y0: number, x1: number, y1: number): Shot => ({
  cx: ARCH.x + ((x0 + x1) / 2) * ARCH.k,
  cy: ARCH.y + ((y0 + y1) / 2) * ARCH.k,
  w: (x1 - x0) * ARCH.k,
  h: (y1 - y0) * ARCH.k,
})
const q2 = (q: number) => S2_START + q * (1 - S2_START) // scene-2 local → global
const WIDE = archShot(-110, -175, ROUND_X + 190, 268)
const SHOTS2: [number, Shot][] = [
  // the text goes, the camera centres on where the arches will stand
  [0.56, WIDE],
  [q2(0.04), WIDE],
  // close on the pointed arch for the compass work, then back out
  [q2(0.09), archShot(-95, -125, 95, 45)],
  [q2(0.21), archShot(-95, -125, 95, 45)],
  [q2(0.3), WIDE],
  [q2(0.86), WIDE],
  // make room for the text on the left
  [q2(0.93), archShot(-380, -175, ROUND_X + 170, 268)],
  [1.0, archShot(-380, -175, ROUND_X + 170, 268)],
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
// one monotone cubic per channel through every shot: the dolly keeps a
// continuous velocity through the waypoints and only comes to rest on a hold
const ALL_SHOTS = SHOTS.concat(SHOTS2)
const keys = ALL_SHOTS.map(([p]) => p)
const camCx = monotone(keys, ALL_SHOTS.map(([, s]) => s.cx))
const camCy = monotone(keys, ALL_SHOTS.map(([, s]) => s.cy))
// zoom in log space so the dolly moves at an even pace
const camLw = monotone(keys, ALL_SHOTS.map(([, s]) => Math.log(s.w)))
const camLh = monotone(keys, ALL_SHOTS.map(([, s]) => Math.log(s.h)))
function camera(p: number): Shot {
  return { cx: camCx(p), cy: camCy(p), w: Math.exp(camLw(p)), h: Math.exp(camLh(p)) }
}


// ---- fragments: the rose's lines breaking up and reforming -------------------------
/**
 * Short pieces of line sampled along every outline of the window, each sent
 * to a point on the arches' outlines. Each piece first loosens and drifts
 * (outer parts first), then sweeps along a curve to its new place, turning
 * to lie along the new line. Drawn as one path, rebuilt each frame only
 * while the transition is running.
 */
function buildFragments() {
  const N = 2200
  const LEN = 3 // drawing units per piece
  const sampler = el('path', {}, defs)
  /** N points spread over the outlines in proportion to their length */
  function sample(ds: string[]): { x: number; y: number; a: number; r: number }[] {
    const lens = ds.map((d) => {
      sampler.setAttribute('d', d)
      return sampler.getTotalLength()
    })
    const total = lens.reduce((a, b) => a + b, 0)
    const out: { x: number; y: number; a: number; r: number }[] = []
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    ds.forEach((d, i) => {
      sampler.setAttribute('d', d)
      const n = Math.round((lens[i] / total) * N)
      for (let j = 0; j < n; j++) {
        const at = ((j + rnd() * 0.8) / n) * lens[i]
        const p0 = sampler.getPointAtLength(at)
        const p1 = sampler.getPointAtLength(Math.min(lens[i], at + 0.5))
        out.push({ x: p0.x, y: p0.y, a: Math.atan2(p1.y - p0.y, p1.x - p0.x), r: Math.hypot(p0.x, p0.y) })
      }
    })
    return out
  }
  const from = sample([
    ...roseOpenings.map((o) => o.d),
    circle(U), circle(PLATE_R), circle(REVEAL_R),
    ...ORDERS.map((o) => archOrder(o)),
    ...cv.lancets.map((l) => l.d),
    ...cv.bays.map((b) => b.arch),
  ])
  const to = sample(arch.targets)
  // pair them roughly left-to-right so the flow has a direction, not a scramble
  const byX = (a: { x: number }, b: { x: number }) => a.x - b.x
  from.sort(byX)
  to.sort(byX)
  let seed = 11
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const pieces = from.map((f, i) => {
    const t = to[Math.floor((i / from.length) * to.length)]
    const mx = (f.x + t.x) / 2
    const my = (f.y + t.y) / 2
    const bend = (rnd() - 0.5) * 140
    const d = Math.hypot(t.x - f.x, t.y - f.y) || 1
    return {
      f, t,
      // control point: off to one side of the straight path, lifted a little
      cx: mx + (-(t.y - f.y) / d) * bend,
      cy: my + ((t.x - f.x) / d) * bend - 30,
      // loosening drift
      dx: (rnd() - 0.5) * 10,
      dy: (rnd() - 0.5) * 10 - 4,
      // outer parts of the window go first
      delay: (1 - Math.min(1, f.r / 260)) * 0.45 + rnd() * 0.15,
      spin: (rnd() - 0.5) * 2.5,
      // a piece of line has no direction: turn the short way (at most a quarter turn)
      turn: ((((t.a - f.a) % Math.PI) + Math.PI * 1.5) % Math.PI) - Math.PI / 2,
    }
  })
  const path = el('path', { class: 'ink fine fragments' }, svg)
  path.style.visibility = 'hidden'

  function update(P: number): void {
    const u = ramp(P, FRAG_START, FRAG_END)
    if (u <= 0 || u >= 1) {
      setShow(path, 0)
      return
    }
    // the lines loosen into pieces (cross-fading with the solid drawing),
    // and the last stretch hands over to the drawn arches
    setShow(path, ramp(P, FRAG_START, FRAG_START + 0.012) * (1 - ramp(P, FRAG_END - 0.02, FRAG_END)))
    let d = ''
    for (const pc of pieces) {
      const loose = ease5(ramp(u, pc.delay * 0.6, pc.delay * 0.6 + 0.12))
      const go = ease5(ramp(u, pc.delay, pc.delay + 0.4))
      // quadratic Bézier from source to target via the control point
      const a = 1 - go
      let x = a * a * pc.f.x + 2 * a * go * pc.cx + go * go * pc.t.x
      let y = a * a * pc.f.y + 2 * a * go * pc.cy + go * go * pc.t.y
      const drift = loose * (1 - go)
      x += pc.dx * drift
      y += pc.dy * drift
      const ang = pc.f.a + pc.turn * go + pc.spin * Math.sin(Math.PI * go)
      const ex = Math.cos(ang) * LEN * 0.5
      const ey = Math.sin(ang) * LEN * 0.5
      d += `M${(x - ex).toFixed(2)} ${(y - ey).toFixed(2)}L${(x + ex).toFixed(2)} ${(y + ey).toFixed(2)}`
    }
    path.setAttribute('d', d)
  }
  return { update }
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
  const dim = 1 - ease(ramp(P, 0.5, 0.54)) // the glass dims before the lines break
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
  setDraw(rimJoints, ease(ramp(p, 0.34, 0.46)))
  setOp(stone, ramp(p, 0.3, 0.42))
  setOp(rimBand, ramp(p, 0.34, 0.46))

  // 2. the glass lights up, centre outward
  panes.forEach(({ g, r }) => setOp(g, ease(ramp(p, 0.36 + r * 0.14, 0.42 + r * 0.14))))
  setOp(bleed, ramp(p, 0.42, 0.58))
  setOp(halo, ramp(p, 0.45, 0.62))

  // 3. the pull-back: arch, string course, claire-voie, wall
  orderInk.forEach((o, i) => setDraw(o, ease(ramp(p, 0.55 + i * 0.025, 0.7 + i * 0.025))))
  setOp(bandA, ramp(p, 0.66, 0.76) * dim)
  setOp(bandB, ramp(p, 0.68, 0.78) * dim)
  setDraw(jointInk, ease(ramp(p, 0.7, 0.82)))
  setOp(shaftFill, ramp(p, 0.7, 0.76) * dim)
  setDraw(capInk, ease(ramp(p, 0.7, 0.82)))
  setDraw(stringLine, ease(ramp(p, 0.62, 0.74)))
  setDraw(toothLine, ease(ramp(p, 0.68, 0.8)))
  claireInk.forEach(({ p: path, x }) => setDraw(path, ease(ramp(p, 0.66 + x * 0.06, 0.74 + x * 0.06))))
  bayInk.forEach(({ p: path, x }) => setDraw(path, ease(ramp(p, 0.7 + x * 0.06, 0.8 + x * 0.06))))
  setOp(bayPlates, ramp(p, 0.76, 0.84) * dim)
  setDraw(foilInk, ramp(p, 0.78, 0.86))
  claireGlass.forEach(({ g, x }) => setOp(g, ease(ramp(p, 0.76 + x * 0.06, 0.82 + x * 0.06)) * dim))
  oculusGlass.forEach(({ g, x }) => setOp(g, ease(ramp(p, 0.8 + x * 0.06, 0.86 + x * 0.06)) * dim))
  setDraw(wallLines, ease(ramp(p, 0.7, 0.9)))
  shafts.forEach((sh, i) => setOp(sh, ease(ramp(p, 0.8 + i * 0.03, 0.92 + i * 0.03))))

  // ---- transition: the glass dims, the lines break up and reform -----------
  // glass, light and wall fade first, leaving the drawing...
  for (const g of [lWall, lShafts]) setOp(g, dim)
  glassAll.style.opacity = String(dim)
  setOp(bleed, ramp(p, 0.42, 0.58) * dim)
  setOp(halo, ramp(p, 0.45, 0.62) * dim)
  setOp(stone, ramp(p, 0.3, 0.42) * dim)
  setOp(rimBand, ramp(p, 0.34, 0.46) * dim)
  // ...then the fragments take over the lines exactly where they lie
  const solid = 1 - ramp(P, FRAG_START, FRAG_START + 0.012)
  for (const g of [lRose, lFrame, lClaire]) setShow(g, solid)
  fragments.update(P)

  // ---- scene 2 -------------------------------------------------------------
  const q = ramp(P, S2_START, 1)
  arch.update(q, ramp(P, FRAG_END - 0.02, FRAG_END + 0.01), P * 900)

  // overlay
  intro.style.opacity = String(1 - ramp(p, 0.01, 0.05))
  showPanel(panel, ramp(p, 0.86, 0.93) * (1 - ramp(P, 0.48, 0.52)))
  showPanel(panel2, ramp(q, 0.86, 0.93))
}

// ---- scroll: a critically damped spring toward the scroll position -----------------
// (time-based, so it feels the same at 60 or 144 Hz, and a run of wheel clicks
// flows into one glide instead of a series of jerks)
let target = 0
let current = 0
const vel = { v: 0 }
let last = performance.now()
let drawn_ = -1
let drawnW = 0
let drawnH = 0
const readScroll = () => {
  const max = document.documentElement.scrollHeight - innerHeight
  target = max > 0 ? scrollY / max : 0
}
addEventListener('scroll', readScroll, { passive: true })
addEventListener('resize', readScroll)
readScroll()
current = target
const tick = (now: number) => {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  if (current !== target) {
    current = smoothDamp(vel, current, target, 0.32, dt)
    if (Math.abs(target - current) < 2e-6 && Math.abs(vel.v) < 1e-4) { current = target; vel.v = 0 }
  }
  // nothing moved: leave the frame as it is
  if (current !== drawn_ || innerWidth !== drawnW || innerHeight !== drawnH) {
    drawn_ = current
    drawnW = innerWidth
    drawnH = innerHeight
    render(current)
  }
  requestAnimationFrame(tick)
}
render(current)
requestAnimationFrame(tick)
