import { ease, el, ramp, setDraw, setOp } from './dom'
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
  const gStone = el('g', {}, g)
  const gGlow = el('g', { opacity: 0, filter: 'url(#glow)' }, g)
  const gGlass = el('g', {}, g)
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

  // ---- 2. stone -----------------------------------------------------------------
  const pierFill = (c: number, half: number) =>
    `M${P(c - half - T, 0)}H${X(c - half)}V${Y(PIER_FOOT)}H${X(c - half - T)}Z` +
    `M${P(c + half, 0)}H${X(c + half + T)}V${Y(PIER_FOOT)}H${X(c + half)}Z`
  const stone = el('path', {
    d: `${outlines[1][0]}L${P(-50, 0)}${arc(R, 1, 0, -APEX)}${arc(R, 1, 50, 0)}Z` + pierFill(0, 50) +
      `${outlines[4][0]}L${P(ox - r0, 0)}${arc(r0, 1, ox + r0, 0)}Z` + pierFill(ox, r0),
    class: 'stone', opacity: 0,
  }, gStone)

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
    d: arrow(0, -APEX_X - 46, 0, -APEX_X - 6) + arrow(ox, -r0 - T - 46, ox, -r0 - T - 6),
    class: 'force', opacity: 0,
  }, gForce)
  const thrustPointed = [1, -1].map((s) =>
    `M${P(0, -APEX - T / 2)}C${P(s * 30, -82)} ${P(s * 56, -42)} ${P(s * 59, 0)}C${P(s * 60.5, 40)} ${P(s * 61, 110)} ${P(s * 61.5, PIER_FOOT - 8)}`).join('')
  const thrustRound = [1, -1].map((s) =>
    `M${P(ox, -r0 - T / 2)}C${P(ox + s * 34, -58)} ${P(ox + s * 58, -36)} ${P(ox + s * 62, 0)}C${P(ox + s * 66, 40)} ${P(ox + s * 80, 110)} ${P(ox + s * 96, PIER_FOOT - 8)}`).join('')
  const flows = [thrustPointed, thrustRound].map((d) =>
    el('path', { d, class: 'flow', opacity: 0, 'stroke-dasharray': `${S(3)} ${S(4)}` }, gForce))
  const pushes = el('path', {
    d: arrow(50 + T + 3, -8, 50 + T + 15, -8, 4) + arrow(-50 - T - 3, -8, -50 - T - 15, -8, 4) +
      arrow(ox + r0 + T + 3, -8, ox + r0 + T + 36, -8, 5) + arrow(ox - r0 - T - 3, -8, ox - r0 - T - 36, -8, 5),
    class: 'push', opacity: 0,
  }, gForce)

  // ---- 5. glass ----------------------------------------------------------------------
  // each window: a ruby border, a cobalt ground leaded in diamonds, three
  // medallions down the light (a gold ring round ruby, a quatrefoil at the
  // heart), and the iron saddle bars that hold the panels
  const lead = { stroke: GLASS.lead, 'stroke-width': S(0.9) }
  const windowGlass = (id: string, opening: string, cx: number, top: number) => {
    el('clipPath', { id }, defs).appendChild(el('path', { d: opening }))
    const w = el('g', { id: `${id}-g`, 'clip-path': `url(#${id})` }, gGlass)
    el('path', { d: opening, fill: GLASS.cobalt }, w)
    el('path', { d: opening, fill: 'url(#quarry)' }, w)
    // ruby border band, with a lead came on its inner edge
    el('path', { d: opening, fill: 'none', stroke: GLASS.lead, 'stroke-width': S(17.8) }, w)
    el('path', { d: opening, fill: 'none', stroke: GLASS.ruby, 'stroke-width': S(16) }, w)
    const h = PIER_FOOT - top
    const medY = [top + 0.27 * h, top + 0.55 * h, top + 0.83 * h]
    medY.forEach((my, i) => {
      el('path', { d: dot(cx, my, 31), fill: GLASS.gold, ...lead }, w)
      el('path', { d: dot(cx, my, 26.5), fill: i === 1 ? GLASS.deep : GLASS.ruby, ...lead }, w)
      const foil = multifoil([cx, my], 4, 8.5, 9.5, Math.PI / 4)
      el('path', {
        d: 'M' + foil.map(([fx, fy]) => P(fx, fy)).join('L') + 'Z',
        fill: i === 1 ? GLASS.ruby : GLASS.cobalt, ...lead,
      }, w)
      el('path', { d: dot(cx, my, 3.2), fill: GLASS.gold, ...lead }, w)
    })
    let bars = ''
    for (let y = top + 40; y < PIER_FOOT; y += 46) bars += `M${P(cx - 60, y)}H${X(cx + 60)}`
    el('path', { d: bars, stroke: GLASS.lead, 'stroke-width': S(1.6), fill: 'none' }, w)
    el('path', { d: opening, fill: 'url(#pane-light)' }, w)
    el('use', { href: `#${id}-g` }, gGlow)
  }
  windowGlass('arch-glass-p', `M${P(-50, PIER_FOOT)}V${Y(0)}${arc(R, 1, 0, -APEX)}${arc(R, 1, 50, 0)}V${Y(PIER_FOOT)}Z`, 0, -APEX)
  windowGlass('arch-glass-r', `M${P(ox - r0, PIER_FOOT)}V${Y(0)}${arc(r0, 1, ox + r0, 0)}V${Y(PIER_FOOT)}Z`, ox, -r0)
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
  function update(q: number, formed: number, flowPhase: number): void {
    setOp(g, formed)
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
    setOp(stone, ramp(q, 0.26, 0.34))
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
    setOp(gGlass, lit > 0 ? 1 : 0)
    setOp(gGlow, 0.7 * ease(ramp(q, 0.8, 0.9)))
  }

  return { update, targets }
}
