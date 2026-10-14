import { drawn, ease, el, ramp, setDraw, setOp } from './dom'
import { GRAIN_FILL, THICK_FILL, glassFill, mosaicFill, pigmentFill } from './glass'
import type { Family } from './glass'
import { multifoil } from './rose'

/**
 * Scene 2 — the pointed arch.
 *
 * The rose's lines break apart and reform as these two windows (main.ts
 * does the fragments; `targets` are the outlines they settle onto). Then:
 *
 *   1. the compass shows how the pointed arch is struck: each half from the
 *      opposite springer;
 *   2. the arches become stone;
 *   3. crown heights are carried across: a round arch rises half its span,
 *      the pointed one nearly seven-eighths;
 *   4. the same weight is set on both; the line of thrust runs down each —
 *      inside the pier for the pointed arch, leaning out past it for the
 *      round one, which pushes its walls apart;
 *   5. the forces fade and both windows fill with glass.
 *
 * Local units: each arch's clear span is 100 (springers at ±50 from its
 * centre line), springing at y = 0, +y down. `place` maps them into the
 * drawing's units.
 */

export interface ArchPlacement {
  /** drawing-space position of the local origin (centre of the pointed arch's springing line) */
  x: number
  y: number
  /** drawing units per local unit */
  k: number
}

const R = 100 // intrados radius = span (equilateral arch)
const T = 18 // depth of the voussoirs
const APEX = Math.sqrt(R * R - 50 * 50) // 86.6
const APEX_X = Math.sqrt((R + T) ** 2 - 50 * 50) // 106.9
export const PIER_FOOT = 230
/** the round arch stands to the right of the pointed one */
export const ROUND_X = 205

const GLASS = {
  cobalt: '#1d3a9e',
  deep: '#132a7a',
  ruby: '#9c1a24',
  gold: '#c98a22',
  lead: '#05060c',
}

export function buildArchScene(parent: Element, defs: Element, place: ArchPlacement) {
  const { k } = place
  const X = (x: number) => (place.x + x * k).toFixed(3)
  const Y = (y: number) => (place.y + y * k).toFixed(3)
  const S = (r: number) => (r * k).toFixed(3)
  const P = (x: number, y: number) => `${X(x)} ${Y(y)}`
  const arc = (r: number, sweep: 0 | 1, x: number, y: number) =>
    `A${S(r)} ${S(r)} 0 0 ${sweep} ${P(x, y)}`
  const arrow = (x1: number, y1: number, x2: number, y2: number, head = 6) => {
    const a = Math.atan2(y2 - y1, x2 - x1)
    const h1 = [x2 - Math.cos(a - 0.45) * head, y2 - Math.sin(a - 0.45) * head]
    const h2 = [x2 - Math.cos(a + 0.45) * head, y2 - Math.sin(a + 0.45) * head]
    return `M${P(x1, y1)}L${P(x2, y2)}M${P(h1[0], h1[1])}L${P(x2, y2)}L${P(h2[0], h2[1])}`
  }
  const dot = (x: number, y: number, r: number) =>
    `M${P(x - r, y)}a${S(r)} ${S(r)} 0 1 0 ${S(2 * r)} 0a${S(r)} ${S(r)} 0 1 0 ${S(-2 * r)} 0`

  const g = el('g', { class: 'layer arch-scene' }, parent)
  const gWall = el('g', { mask: 'url(#arch-wall-mask)' }, g)
  const gStone = el('g', {}, g)
  const gGlow = el('g', { opacity: 0, fill: 'none', 'stroke-linejoin': 'round' }, g)
  const gGlass = el('g', { class: 'iso' }, g)
  const gInk = el('g', {}, g)
  const gForce = el('g', {}, g)

  // ---- outlines (what the rose's fragments reform into) ---------------------
  const ox = ROUND_X
  const r0 = 50
  const piers = (c: number, half: number) =>
    `M${P(c - half - T, 0)}V${Y(PIER_FOOT)}M${P(c - half, 0)}V${Y(PIER_FOOT)}` +
    `M${P(c + half, 0)}V${Y(PIER_FOOT)}M${P(c + half + T, 0)}V${Y(PIER_FOOT)}` +
    `M${P(c - half - T - 4, 0)}H${X(c - half + 4)}M${P(c + half - 4, 0)}H${X(c + half + T + 4)}`
  let joints = ''
  for (let j = 1; j <= 4; j++) {
    const a = (-Math.PI / 3) * (j / 5)
    joints += `M${P(-50 + Math.cos(a) * R, Math.sin(a) * R)}L${P(-50 + Math.cos(a) * (R + T), Math.sin(a) * (R + T))}`
    joints += `M${P(50 - Math.cos(a) * R, Math.sin(a) * R)}L${P(50 - Math.cos(a) * (R + T), Math.sin(a) * (R + T))}`
  }
  joints += `M${P(0, -APEX)}L${P(0, -APEX_X)}`
  for (let j = 1; j < 7; j++) {
    const a = -Math.PI * (j / 7)
    joints += `M${P(ox + Math.cos(a) * r0, Math.sin(a) * r0)}L${P(ox + Math.cos(a) * (r0 + T), Math.sin(a) * (r0 + T))}`
  }
  const outlines: [string, string][] = [
    [`M${P(50, 0)}${arc(R, 0, 0, -APEX)}${arc(R, 0, -50, 0)}`, 'bold'], // pointed intrados
    [`M${P(50 + T, 0)}${arc(R + T, 0, 0, -APEX_X)}${arc(R + T, 0, -50 - T, 0)}`, 'fine'],
    [piers(0, 50), 'fine'],
    [`M${P(ox + r0, 0)}${arc(r0, 0, ox - r0, 0)}`, 'bold'], // round intrados
    [`M${P(ox + r0 + T, 0)}${arc(r0 + T, 0, ox - r0 - T, 0)}`, 'fine'],
    [piers(ox, r0), 'fine'],
    [joints, 'fine'],
  ]
  /** outlines for the fragments to settle onto (joints come in afterwards) */
  const targets = outlines.slice(0, 6).map(([d]) => d)
  const outlineInk = el('g', {}, gInk)
  const jointInk = el('g', { opacity: 0 }, gInk)
  outlines.forEach(([d, cls], i) => el('path', { d, class: `ink ${cls}` }, i === 6 ? jointInk : outlineInk))

  // ---- 1. the compass ---------------------------------------------------------
  const centres = el('path', { d: dot(-50, 0, 1.6) + dot(50, 0, 1.6), class: 'dot', opacity: 0 }, gInk)
  const span = el('path', { d: `M${P(-50, 0)}L${P(50, 0)}`, class: 'ink guide', opacity: 0 }, gInk)
  const trace = (d: string) =>
    el('path', { d, class: 'ink bold trace', pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, gInk)
  // right half struck from the LEFT springer, left half from the RIGHT one
  const arcR = trace(`M${P(50, 0)}${arc(R, 0, 0, -APEX)}`)
  const arcL = trace(`M${P(-50, 0)}${arc(R, 1, 0, -APEX)}`)
  const armR = el('path', { class: 'ink guide', opacity: 0 }, gInk)
  const armL = el('path', { class: 'ink guide', opacity: 0 }, gInk)
  const arm = (cx: number, a: number) => `M${P(cx, 0)}L${P(cx + Math.cos(a) * R, Math.sin(a) * R)}`

  // ---- 2. stone: voussoirs and coursed piers, in two alternating tones -----------------
  const COURSE = PIER_FOOT / 10
  const stoneA = el('path', { class: 'stone a' }, gStone)
  const stoneB = el('path', { class: 'stone b' }, gStone)
  const stoneBase = el('path', { class: 'stone' }, gStone)
  // the ring between intrados and extrados, as separate wedges
  const wedge = (cx: number, side: 1 | -1, rIn: number, rOut: number, a0: number, a1: number, a1Out = a1) => {
    const pos = (rho: number, a: number) => P(cx + side * (rho * Math.cos(a) - (cx === 0 ? 50 : 0)), rho * Math.sin(a))
    const fwd = side === 1 ? 0 : 1
    return `M${pos(rIn, a0)}${`A${S(rIn)} ${S(rIn)} 0 0 ${fwd} ${pos(rIn, a1)}`}L${pos(rOut, a1Out)}A${S(rOut)} ${S(rOut)} 0 0 ${1 - fwd} ${pos(rOut, a0)}Z`
  }
  let wedgesA = '', wedgesB = ''
  for (const side of [1, -1] as const) {
    for (let j = 0; j < 5; j++) {
      const a0 = (-Math.PI / 3) * (j / 5)
      const a1 = j === 4 ? -Math.PI / 3 : (-Math.PI / 3) * ((j + 1) / 5)
      const a1o = j === 4 ? -Math.acos(50 / (R + T)) : a1
      const w = wedge(0, side, R, R + T, a0, a1, a1o)
      if (j % 2) wedgesB += w; else wedgesA += w
    }
  }
  for (let j = 0; j < 7; j++) {
    const w = wedge(ox, 1, r0, r0 + T, (-Math.PI * j) / 7, (-Math.PI * (j + 1)) / 7)
    if (j % 2) wedgesB += w; else wedgesA += w
  }
  // jambs: one stone deep, a course at a time
  const jambs: [number, number][] = [[-50 - T, 0], [50, 0], [ox - r0 - T, 0], [ox + r0, 0]] // [x, _]
  let coursesA = '', coursesB = '', coursesBase = ''
  for (const [jx] of jambs) {
    for (let i = 0; i < 10; i++) {
      const r = `M${P(jx, i * COURSE)}H${X(jx + T)}V${Y((i + 1) * COURSE)}H${X(jx)}Z`
      if (i % 2) coursesB += r; else coursesA += r
    }
    coursesBase += `M${P(jx - 3, PIER_FOOT - 13)}H${X(jx + T + 3)}V${Y(PIER_FOOT)}H${X(jx - 3)}Z`
  }
  stoneA.setAttribute('d', wedgesA + coursesA)
  stoneB.setAttribute('d', wedgesB + coursesB)
  stoneBase.setAttribute('d', coursesBase)
  const stone = gStone
  setOp(stone, 0)

  // ---- 2b. the masonry laid out in ink: drawn in after the stone ---------------------
  const detail = (d: string, cls = 'fine') => drawn(d, cls, gInk)
  const jambX = (c: number, half: number): [number, number][] => [[c - half - T, 1], [c + half, -1]]

  // coursing in the piers, broken where the shaft stands in front
  let courseD = ''
  for (const [c, half] of [[0, 50], [ox, r0]]) {
    for (const [jx] of jambX(c, half)) {
      const x0 = jx + T / 2
      for (let i = 1; i < 10; i++) {
        const y = i * COURSE
        if (i === 9) continue // the plinth takes this one
        courseD += `M${P(jx, y)}H${X(x0 - 3.2)}M${P(x0 + 3.2, y)}H${X(jx + T)}`
        const jx1 = i % 2 ? jx + T * 0.2 : jx + T * 0.8
        courseD += `M${P(jx1, y)}V${Y(y + COURSE)}`
      }
    }
  }
  const courseInk = detail(courseD, 'faint2')

  // voussoir joints and the roll mouldings that run round the ring
  const ringArc = (rho: number, pointed: boolean) =>
    pointed
      ? `M${P(rho - 50, 0)}${arc(rho, 0, 0, -Math.sqrt(rho * rho - 2500))}${arc(rho, 0, 50 - rho, 0)}`
      : `M${P(ox + rho, 0)}${arc(rho, 0, ox - rho, 0)}`
  const mouldD =
    ringArc(R + 6, true) + ringArc(R + 12, true) + ringArc(r0 + 6, false) + ringArc(r0 + 12, false)
  const mouldInk = detail(mouldD, 'faint2')

  // capitals: foliate bells (with crockets) for the pointed arch, cushions for the round one
  const crocket = (x: number, y0: number, h: number, dir: 1 | -1) =>
    `M${P(x, y0)}V${Y(y0 - h + 1.2)}a${S(1.3)} ${S(1.3)} 0 1 ${dir === 1 ? 1 : 0} ${S(dir * 1.3)} ${S(-1.3)}`
  const gothicCap = (x: number) =>
    `M${P(x - 5.6, 5)}C${P(x - 5.6, 11)} ${P(x - 3.1, 14)} ${P(x - 3.1, 18)}` +
    `M${P(x + 5.6, 5)}C${P(x + 5.6, 11)} ${P(x + 3.1, 14)} ${P(x + 3.1, 18)}` +
    `M${P(x - 3.5, 18)}H${X(x + 3.5)}M${P(x - 3.5, 19.8)}H${X(x + 3.5)}` +
    crocket(x - 3.6, 16.5, 8, -1) + crocket(x, 17, 9.5, 1) + crocket(x + 3.6, 16.5, 8, 1)
  const cushionCap = (x: number) =>
    `M${P(x - 6.8, 5)}V${Y(10)}C${P(x - 6.8, 16)} ${P(x - 4.6, 17.6)} ${P(x - 3.8, 19)}H${X(x + 3.8)}` +
    `C${P(x + 4.6, 17.6)} ${P(x + 6.8, 16)} ${P(x + 6.8, 10)}V${Y(5)}` +
    `M${P(x - 6.8, 10)}A${S(3.4)} ${S(3.4)} 0 0 0 ${P(x, 10)}A${S(3.4)} ${S(3.4)} 0 0 0 ${P(x + 6.8, 10)}`
  let capD = ''
  for (const [c, half, cap] of [[0, 50, gothicCap], [ox, r0, cushionCap]] as const) {
    for (const [jx] of jambX(c, half)) {
      const x0 = jx + T / 2
      // impost slab, chamfered, running a little into the opening
      const x1 = jx === c - half - T ? jx - 4 : jx - 4
      capD += `M${P(x1, 0)}V${Y(5)}H${X(x1 + T + 8)}V${Y(0)}M${P(x1, 2.5)}H${X(x1 + T + 8)}`
      capD += cap(x0)
    }
  }
  const capInk = detail(capD)

  // shafts, bases and the stylobate they stand on
  const base = (x: number, w: number) => {
    const y = PIER_FOOT - 20
    return (
      `M${P(x - w, y)}Q${P(x - w - 2.8, y + 0.8)} ${P(x - w - 2.6, y + 3.2)}Q${P(x - w - 2.4, y + 5.4)} ${P(x - w - 0.6, y + 5.4)}` +
      `H${X(x + w + 0.6)}Q${P(x + w + 2.4, y + 5.4)} ${P(x + w + 2.6, y + 3.2)}Q${P(x + w + 2.8, y + 0.8)} ${P(x + w, y)}` +
      `M${P(x - w - 4.2, y + 5.4)}V${Y(y + 11)}H${X(x + w + 4.2)}V${Y(y + 5.4)}`
    )
  }
  let shaftD = ''
  for (const [c, half, w] of [[0, 50, 3], [ox, r0, 3.8]] as const) {
    for (const [jx] of jambX(c, half)) {
      const x0 = jx + T / 2
      shaftD += `M${P(x0 - w, 19.8)}V${Y(PIER_FOOT - 20)}M${P(x0 + w, 19.8)}V${Y(PIER_FOOT - 20)}`
      // drum joints, a third of the way down each course
      for (let i = 2; i < 9; i += 2) shaftD += `M${P(x0 - w, i * COURSE)}H${X(x0 + w)}`
      shaftD += base(x0, w)
    }
  }
  const shaftInk = detail(shaftD)
  const groundD =
    `M${P(-130, PIER_FOOT)}H${X(ox + 130)}M${P(-138, PIER_FOOT + 7)}H${X(ox + 138)}` +
    `M${P(-146, PIER_FOOT + 14)}H${X(ox + 146)}`
  const groundInk = detail(groundD, 'bold')

  // hood moulds: a label with returns and stops over the pointed arch (a crocketed
  // finial at its crown), a chevron band over the round one
  const hoodP = (rho: number) =>
    `M${P(rho - 50, 14)}V${Y(0)}` + arc(rho, 0, 0, -Math.sqrt(rho * rho - 2500)) + arc(rho, 0, 50 - rho, 0) + `V${Y(14)}`
  const stops = (c: number, a: number, b: number) =>
    // the returns end in blocks carved with a rosette
    [1, -1].map((sd) => `M${P(c + sd * a, 14)}H${X(c + sd * b)}`).join('') +
    [1, -1].map((sd) => dot(c + sd * (a + b) / 2, 7, 2.1)).join('')
  const crocketOn = (rho: number, a: number, sd: 1 | -1) => {
    // a hook on the hood's back, curling toward the crown
    const bx = sd * (-50 + rho * Math.cos(a)), by = rho * Math.sin(a)
    const nx = sd * Math.cos(a), ny = Math.sin(a) // outward
    const tx = sd * Math.sin(a), ty = -Math.cos(a) // along the arc, toward the crown
    const ex = bx + nx * 3.6 + tx * 4.6, ey = by + ny * 3.6 + ty * 4.6
    return `M${P(bx, by)}Q${P(bx + nx * 7, by + ny * 7)} ${P(ex, ey)}` + dot(ex, ey, 0.9)
  }
  const RH = R + T + 9
  let crockets = ''
  for (const sd of [1, -1] as const) for (const a of [-0.28, -0.62, -0.95]) crockets += crocketOn(RH, a, sd)
  const apexH = Math.sqrt(RH * RH - 2500)
  const finial =
    `M${P(0, -apexH)}C${P(-5.5, -apexH - 3.5)} ${P(-5.5, -apexH - 10)} ${P(0, -apexH - 15)}C${P(5.5, -apexH - 10)} ${P(5.5, -apexH - 3.5)} ${P(0, -apexH)}Z` +
    `M${P(0, -apexH - 3)}V${Y(-apexH - 11)}`
  const hoodRing = (rho: number) => {
    // chevron: teeth alternate between two radii around the semicircle
    const n = 16
    let d = ''
    for (let k = 0; k <= 2 * n; k++) {
      const a = (-Math.PI * k) / (2 * n)
      const rr = rho + (k % 2 ? 6 : 0)
      d += `${k ? 'L' : 'M'}${P(ox + rr * Math.cos(a), rr * Math.sin(a))}`
    }
    return d
  }
  const hoodD =
    hoodP(R + T + 4) + hoodP(RH) + stops(0, 50 + T + 4, 50 + T + 9) +
    `M${P(ox + r0 + T + 3, 14)}V${Y(0)}${arc(r0 + T + 3, 0, ox - r0 - T - 3, 0)}V${Y(14)}` +
    `M${P(ox + r0 + T + 9, 14)}V${Y(0)}${arc(r0 + T + 9, 0, ox - r0 - T - 9, 0)}V${Y(14)}` +
    hoodRing(r0 + T + 3) + stops(ox, r0 + T + 3, r0 + T + 9)
  const hoodInk = detail(hoodD)
  const finialInk = detail(crockets + finial)

  // the wall the arches stand in, laid in courses and faded at the edges;
  // each opening (with its hood) is cut out so the lines stop at the stone
  const wallClip = el('clipPath', { id: 'arch-wall-clip' }, defs)
  const sil = (c: number, out: number, rr: number, pointed: boolean) =>
    `M${P(c - out, PIER_FOOT)}V${Y(14)}H${X(c - rr)}V${Y(0)}` +
    (pointed ? arc(RH, 1, 0, -apexH) + arc(RH, 1, rr, 0) : arc(rr, 1, c + rr, 0)) +
    `V${Y(14)}H${X(c + out)}V${Y(PIER_FOOT)}Z`
  el('path', {
    d: `M${P(-260, -230)}H${X(ox + 260)}V${Y(PIER_FOOT)}H${X(-260)}Z` + sil(0, 50 + T, RH - R + 50, true) + sil(ox, r0 + T, r0 + T + 9, false),
    'clip-rule': 'evenodd',
  }, wallClip)
  let wallD = ''
  for (let i = -8; i < 10; i++) {
    const y = i * COURSE
    wallD += `M${P(-250, y)}H${X(ox + 250)}`
    let x = -250 + ((i * 53) % 37)
    for (let n = 0; x < ox + 250; n++) {
      wallD += `M${P(x, y)}V${Y(y + COURSE)}`
      x += 34 + ((i * 7 + n * 13) % 5) * 7
    }
  }
  const wallInk = el('g', { 'clip-path': 'url(#arch-wall-clip)' }, gWall)
  const wallPath = drawn(wallD, 'faint2', wallInk)
  const wallFade = el('radialGradient', {
    id: 'arch-wall-fade', gradientUnits: 'userSpaceOnUse', cx: X(ox / 2), cy: Y(40), r: S(330),
  }, defs)
  el('stop', { offset: 0.4, 'stop-color': '#fff' }, wallFade)
  el('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 0 }, wallFade)
  const wallMask = el('mask', { id: 'arch-wall-mask', maskUnits: 'userSpaceOnUse', x: X(-300), y: Y(-260), width: S(ox + 600), height: S(600) }, defs)
  el('rect', { x: X(-300), y: Y(-260), width: S(ox + 600), height: S(600), fill: 'url(#arch-wall-fade)' }, wallMask)

  // ---- 3. heights ----------------------------------------------------------------
  const guides = el('path', {
    d: `M${P(-80, -APEX)}H${X(ox + 90)}M${P(-80, -r0)}H${X(ox + 90)}M${P(-80, 0)}H${X(ox + 90)}`,
    class: 'ink guide dashed', opacity: 0,
  }, gInk)
  const label = (x: number, y: number, text: string, cls = '') => {
    const t = el('text', {
      x: X(x), y: Y(y), class: `label ${cls}`, 'font-size': S(7.5), opacity: 0,
      'text-anchor': cls === 'side' ? 'start' : 'middle',
    }, gInk)
    t.textContent = text
    return t
  }
  const names = [label(0, PIER_FOOT + 16, 'Pointed'), label(ox, PIER_FOOT + 16, 'Round')]
  const heights = [
    label(ox + 94, -APEX + 2.5, 'rises ⅞ of its span', 'side'),
    label(ox + 94, -r0 + 2.5, 'rises ½ its span', 'side'),
  ]

  // ---- 4. weight and thrust ---------------------------------------------------------
  const weights = el('path', {
    d: arrow(0, -APEX_X - 60, 0, -APEX_X - 26) + arrow(ox, -r0 - T - 62, ox, -r0 - T - 20),
    class: 'force', opacity: 0,
  }, gForce)
  const thrustPointed = [1, -1].map((s) =>
    `M${P(0, -APEX - T / 2)}C${P(s * 30, -82)} ${P(s * 56, -42)} ${P(s * 59, 0)}C${P(s * 60.5, 40)} ${P(s * 61, 110)} ${P(s * 61.5, PIER_FOOT - 8)}`).join('')
  const thrustRound = [1, -1].map((s) =>
    `M${P(ox, -r0 - T / 2)}C${P(ox + s * 34, -58)} ${P(ox + s * 58, -36)} ${P(ox + s * 62, 0)}C${P(ox + s * 66, 40)} ${P(ox + s * 80, 110)} ${P(ox + s * 96, PIER_FOOT - 8)}`).join('')
  const flows = [thrustPointed, thrustRound].map((d) =>
    el('path', { d, class: 'flow', opacity: 0, 'stroke-dasharray': `${S(3)} ${S(4)}` }, gForce))
  const pushes = el('path', {
    d: arrow(50 + T + 12, -8, 50 + T + 22, -8, 4) + arrow(-50 - T - 12, -8, -50 - T - 22, -8, 4) +
      arrow(ox + r0 + T + 12, -8, ox + r0 + T + 40, -8, 5) + arrow(ox - r0 - T - 12, -8, ox - r0 - T - 36, -8, 5),
    class: 'push', opacity: 0,
  }, gForce)

  // ---- 5. glass ----------------------------------------------------------------------
  // each window: a ruby border, a cobalt ground leaded in diamonds, three
  // medallions down the light (a gold ring round ruby, a quatrefoil at the
  // heart), and the iron saddle bars that hold the panels
  const lead = { stroke: GLASS.lead, 'stroke-width': S(0.9) }
  const windowGlass = (id: string, opening: string, cx: number, top: number, n: number) => {
    el('clipPath', { id }, defs).appendChild(el('path', { d: opening }))
    const w = el('g', { id: `${id}-g`, 'clip-path': `url(#${id})` }, gGlass)
    const layer = (fill: string, extra: Record<string, string | number> = {}) => el('path', { d: opening, fill, ...extra }, w)
    // the ground: cobalt, in hand-cut pieces, with the glass's own mottling
    layer(glassFill(defs, 'blue', n))
    layer(mosaicFill(defs, 'blue', n * 3, 3.9 * k, false))
    layer(pigmentFill(n))
    // ruby border band, with a lead came on its inner edge
    const band = (stroke: string, width: number, extra: Record<string, string | number> = {}) =>
      layer('none', { stroke, 'stroke-width': S(width), ...extra })
    band(GLASS.lead, 17.8)
    band(glassFill(defs, 'ruby', n), 16)
    band(mosaicFill(defs, 'ruby', n * 3 + 1, 4.2 * k), 16, { 'stroke-opacity': 0.8 })
    const h = PIER_FOOT - top
    const medY = [top + 0.27 * h, top + 0.55 * h, top + 0.83 * h]
    // a medallion disc: glass of a family, mottled and thickened like any other pane
    const disc = (d: string, family: Family, v: number, extra: Record<string, string | number> = {}) => {
      el('path', { d, fill: glassFill(defs, family, v), ...lead, ...extra }, w)
      el('path', { d, fill: pigmentFill(v + n) }, w)
      el('path', { d, fill: THICK_FILL }, w)
    }
    medY.forEach((my, i) => {
      disc(dot(cx, my, 31), 'amber', i)
      disc(dot(cx, my, 26.5), i === 1 ? 'blue' : 'ruby', i + 1)
      const foil = multifoil([cx, my], 4, 8.5, 9.5, Math.PI / 4)
      disc('M' + foil.map(([fx, fy]) => P(fx, fy)).join('L') + 'Z', i === 1 ? 'ruby' : 'blue', i + 2)
      disc(dot(cx, my, 3.2), 'amber', i)
    })
    let bars = ''
    for (let y = top + 40; y < PIER_FOOT; y += 46) bars += `M${P(cx - 60, y)}H${X(cx + 60)}`
    el('path', { d: bars, stroke: GLASS.lead, 'stroke-width': S(1.6), fill: 'none' }, w)
    layer(THICK_FILL)
    // bubbles and cloudy streaks, only while the view is at rest
    el('path', { d: opening, fill: GRAIN_FILL, 'fill-opacity': 0.7 }, el('g', { class: 'gl-fx' }, w))
    // light spilling out of the window: stacked soft strokes, no blur filter
    for (const [sw, a] of [[22, 0.04], [13, 0.06], [6, 0.1]]) {
      el('path', { d: opening, stroke: '#4a66e0', 'stroke-width': S(sw), 'stroke-opacity': a }, gGlow)
    }
  }
  windowGlass('arch-glass-p', `M${P(-50, PIER_FOOT)}V${Y(0)}${arc(R, 1, 0, -APEX)}${arc(R, 1, 50, 0)}V${Y(PIER_FOOT)}Z`, 0, -APEX, 1)
  windowGlass('arch-glass-r', `M${P(ox - r0, PIER_FOOT)}V${Y(0)}${arc(r0, 1, ox + r0, 0)}V${Y(PIER_FOOT)}Z`, ox, -r0, 2)
  // the glass lights from the sill up, like a window catching the sun
  const glassMask = el('mask', { id: 'arch-glass-mask', maskUnits: 'userSpaceOnUse', x: X(-200), y: Y(-250), width: S(700), height: S(600) }, defs)
  const fade = el('linearGradient', { id: 'arch-glass-edge', x1: 0, y1: 0, x2: 0, y2: 1 }, defs)
  el('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0 }, fade)
  el('stop', { offset: 0.08, 'stop-color': '#fff' }, fade)
  const maskRect = el('rect', { x: X(-200), width: S(700), fill: 'url(#arch-glass-edge)' }, glassMask)
  gGlass.setAttribute('mask', 'url(#arch-glass-mask)')

  setOp(g, 0)

  /**
   * q: this scene's own progress 0..1; formed: 0..1 how far the reformed
   * outlines have taken over from the fragments; flowPhase: how far the
   * thrust has travelled (local units).
   */
  function update(q: number, formed: number, flowPhase: number, out = 0): void {
    // leaving: glass, stone, wall and forces dim first; the ink lines go when the swarm takes them
    const fills = 1 - ramp(out, 0, 0.5)
    setOp(g, formed * (1 - ramp(out, 0.5, 1)))
    setOp(gWall, fills)
    setOp(gForce, fills)
    // 1. compass: each half retraced as its arm sweeps
    const compassOut = 1 - ramp(q, 0.24, 0.3)
    setOp(centres, Math.min(ramp(q, 0.03, 0.06), compassOut))
    setOp(span, Math.min(ramp(q, 0.03, 0.06), compassOut))
    const tR = ease(ramp(q, 0.06, 0.13))
    const tL = ease(ramp(q, 0.13, 0.2))
    setDraw(arcR, tR)
    setDraw(arcL, tL)
    setOp(arcR, compassOut)
    setOp(arcL, compassOut)
    armR.setAttribute('d', arm(-50, (-Math.PI / 3) * tR))
    armL.setAttribute('d', arm(50, Math.PI + (Math.PI / 3) * tL))
    const armsOut = 1 - ramp(q, 0.21, 0.25)
    setOp(armR, Math.min(ramp(q, 0.05, 0.07), armsOut))
    setOp(armL, Math.min(ramp(q, 0.12, 0.14), armsOut))
    // the rest of the drawing steps back while the compass works
    setOp(outlineInk, 1 - 0.6 * Math.min(ramp(q, 0.03, 0.06), 1 - ramp(q, 0.22, 0.28)))
    // 2. stone
    setOp(jointInk, ramp(q, 0.26, 0.32))
    setOp(stone, ramp(q, 0.26, 0.34) * fills)
    // the masonry draws itself in: courses, mouldings, capitals, shafts, hood, wall
    setDraw(groundInk, ease(ramp(q, 0.28, 0.36)))
    setDraw(courseInk, ease(ramp(q, 0.3, 0.4)))
    setDraw(mouldInk, ease(ramp(q, 0.32, 0.42)))
    setDraw(capInk, ease(ramp(q, 0.34, 0.43)))
    setDraw(shaftInk, ease(ramp(q, 0.36, 0.46)))
    setDraw(hoodInk, ease(ramp(q, 0.38, 0.48)))
    setDraw(finialInk, ease(ramp(q, 0.44, 0.5)))
    setDraw(wallPath, ease(ramp(q, 0.4, 0.62)))
    // 3. heights
    setOp(guides, Math.min(ramp(q, 0.34, 0.4), 1 - ramp(q, 0.7, 0.76)))
    names.forEach((l, i) => setOp(l, ramp(q, 0.36 + i * 0.02, 0.4 + i * 0.02)))
    heights.forEach((l, i) => setOp(l, Math.min(ramp(q, 0.38 + i * 0.02, 0.42 + i * 0.02), 1 - ramp(q, 0.7, 0.76))))
    // 4. forces, then let them go
    const forcesOut = 1 - ramp(q, 0.68, 0.74)
    setOp(weights, Math.min(ramp(q, 0.46, 0.5), forcesOut))
    flows.forEach((f) => {
      setOp(f, Math.min(ramp(q, 0.49, 0.54), forcesOut))
      f.style.strokeDashoffset = String(-flowPhase * k)
    })
    setOp(pushes, Math.min(ramp(q, 0.55, 0.6), forcesOut))
    // 5. glass rises from the sill
    const lit = ease(ramp(q, 0.72, 0.84))
    const yTop = PIER_FOOT + 20 - lit * (PIER_FOOT + APEX + 60)
    maskRect.setAttribute('y', Y(yTop))
    maskRect.setAttribute('height', S(PIER_FOOT + 60 - yTop))
    setOp(gGlass, (lit > 0 ? 1 : 0) * fills)
    setOp(gGlow, 0.7 * ease(ramp(q, 0.8, 0.9)) * fills)
  }

  /** every line of the drawing, for the swarm to melt */
  const sources = [...outlines.map(([d]) => d), courseD, mouldD, capD, shaftD, groundD, hoodD, crockets + finial]
  return { update, targets, sources }
}
