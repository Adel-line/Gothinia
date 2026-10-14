import { drawn, ease, el, ramp, setDraw, setOp } from './dom'

/**
 * Scene 2 — the pointed arch.
 *
 * It is set inside the head of one lancet of the claire-voie, so the camera
 * can dive from the rose straight into it: the lancet's head IS the arch
 * being explained.
 *
 * Local units: the arch's clear span is 100 (springers at x = ±50), its
 * springing at y = 0, +y down. `place` maps them into the drawing's units.
 *
 *   1. the compass strikes the two arcs, each from the opposite springer;
 *   2. the arch becomes stone: voussoirs and piers;
 *   3. a round arch of the same span is drawn beside it — it rises only
 *      half its span; the pointed one rises higher;
 *   4. the same weight is set on both; the line of thrust runs down each.
 *      In the round arch it leans out past the face of its pier (it pushes
 *      the walls apart); in the pointed arch it runs down inside the pier.
 */

export interface ArchPlacement {
  /** drawing-space position of the local origin (centre of the springing line) */
  x: number
  y: number
  /** drawing units per local unit */
  k: number
}

const R = 100 // intrados radius = span (equilateral arch)
const T = 18 // depth of the voussoirs
const APEX = Math.sqrt(R * R - 50 * 50) // 86.6
const APEX_X = Math.sqrt((R + T) ** 2 - 50 * 50) // 106.9
const PIER_FOOT = 230
/** the round arch stands to the right of the pointed one */
export const ROUND_X = 205

export function buildArchScene(parent: Element, place: ArchPlacement) {
  const { k } = place
  const X = (x: number) => (place.x + x * k).toFixed(3)
  const Y = (y: number) => (place.y + y * k).toFixed(3)
  const S = (r: number) => (r * k).toFixed(3)
  const P = (x: number, y: number) => `${X(x)} ${Y(y)}`
  const arc = (r: number, sweep: 0 | 1, x: number, y: number, large = 0) =>
    `A${S(r)} ${S(r)} 0 ${large} ${sweep} ${P(x, y)}`
  const arrow = (x1: number, y1: number, x2: number, y2: number, head = 6) => {
    const a = Math.atan2(y2 - y1, x2 - x1)
    const h1 = [x2 - Math.cos(a - 0.45) * head, y2 - Math.sin(a - 0.45) * head]
    const h2 = [x2 - Math.cos(a + 0.45) * head, y2 - Math.sin(a + 0.45) * head]
    return `M${P(x1, y1)}L${P(x2, y2)}M${P(h1[0], h1[1])}L${P(x2, y2)}L${P(h2[0], h2[1])}`
  }

  const g = el('g', { class: 'layer arch-scene' }, parent)
  const gStone = el('g', {}, g)
  const gInk = el('g', {}, g)
  const gForce = el('g', {}, g)

  // ---- 1. the compass ------------------------------------------------------
  const centres = el('path', {
    d: `M${P(-50, 0)}m${S(-1.6)} 0a${S(1.6)} ${S(1.6)} 0 1 0 ${S(3.2)} 0a${S(1.6)} ${S(1.6)} 0 1 0 ${S(-3.2)} 0` +
      `M${P(50, 0)}m${S(-1.6)} 0a${S(1.6)} ${S(1.6)} 0 1 0 ${S(3.2)} 0a${S(1.6)} ${S(1.6)} 0 1 0 ${S(-3.2)} 0`,
    class: 'dot', opacity: 0,
  }, gInk)
  const span = drawn(`M${P(-50, 0)}L${P(50, 0)}`, 'guide', gInk)
  // right half struck from the LEFT springer, left half from the RIGHT one
  const arcR = drawn(`M${P(50, 0)}${arc(R, 0, 0, -APEX)}`, 'bold', gInk)
  const arcL = drawn(`M${P(-50, 0)}${arc(R, 1, 0, -APEX)}`, 'bold', gInk)
  const armR = el('path', { class: 'ink guide', opacity: 0 }, gInk)
  const armL = el('path', { class: 'ink guide', opacity: 0 }, gInk)
  const arm = (cx: number, a: number) =>
    `M${P(cx, 0)}L${P(cx + Math.cos(a) * R, Math.sin(a) * R)}`

  // ---- 2. stone ---------------------------------------------------------------
  const extr = drawn(`M${P(50 + T, 0)}${arc(R + T, 0, 0, -APEX_X)}${arc(R + T, 0, -50 - T, 0)}`, 'fine', gInk)
  let joints = ''
  for (let j = 1; j <= 4; j++) {
    const a = (-Math.PI / 3) * (j / 5)
    joints += `M${P(-50 + Math.cos(a) * R, Math.sin(a) * R)}L${P(-50 + Math.cos(a) * (R + T), Math.sin(a) * (R + T))}`
    joints += `M${P(50 - Math.cos(a) * R, Math.sin(a) * R)}L${P(50 - Math.cos(a) * (R + T), Math.sin(a) * (R + T))}`
  }
  joints += `M${P(0, -APEX)}L${P(0, -APEX_X)}`
  const jointInk = drawn(joints, 'fine', gInk)
  const piers = (ox: number) =>
    `M${P(ox - 50 - T, 0)}V${Y(PIER_FOOT)}M${P(ox - 50, 0)}V${Y(PIER_FOOT)}` +
    `M${P(ox + 50, 0)}V${Y(PIER_FOOT)}M${P(ox + 50 + T, 0)}V${Y(PIER_FOOT)}` +
    // imposts at the springing
    `M${P(ox - 50 - T - 4, 0)}H${X(ox - 50 + 4)}M${P(ox + 50 - 4, 0)}H${X(ox + 50 + T + 4)}`
  const pierInk = drawn(piers(0), 'fine', gInk)
  const ringFill =
    `M${P(50 + T, 0)}${arc(R + T, 0, 0, -APEX_X)}${arc(R + T, 0, -50 - T, 0)}` +
    `L${P(-50, 0)}${arc(R, 1, 0, -APEX)}${arc(R, 1, 50, 0)}Z` +
    `M${P(-50 - T, 0)}H${X(-50)}V${Y(PIER_FOOT)}H${X(-50 - T)}Z` +
    `M${P(50, 0)}H${X(50 + T)}V${Y(PIER_FOOT)}H${X(50)}Z`
  const stone = el('path', { d: ringFill, class: 'stone', opacity: 0 }, gStone)

  // ---- 3. the round arch beside it ------------------------------------------
  const ox = ROUND_X
  const r0 = 50
  const roundIntr = drawn(`M${P(ox + r0, 0)}${arc(r0, 0, ox - r0, 0)}`, 'bold', gInk)
  const roundExtr = drawn(`M${P(ox + r0 + T, 0)}${arc(r0 + T, 0, ox - r0 - T, 0)}`, 'fine', gInk)
  let rj = ''
  for (let j = 1; j < 7; j++) {
    const a = -Math.PI * (j / 7)
    rj += `M${P(ox + Math.cos(a) * r0, Math.sin(a) * r0)}L${P(ox + Math.cos(a) * (r0 + T), Math.sin(a) * (r0 + T))}`
  }
  const roundJoints = drawn(rj, 'fine', gInk)
  const roundPiers = drawn(piers(ox), 'fine', gInk)
  const roundStone = el('path', {
    d: `M${P(ox + r0 + T, 0)}${arc(r0 + T, 0, ox - r0 - T, 0)}L${P(ox - r0, 0)}${arc(r0, 1, ox + r0, 0)}Z` +
      `M${P(ox - r0 - T, 0)}H${X(ox - r0)}V${Y(PIER_FOOT)}H${X(ox - r0 - T)}Z` +
      `M${P(ox + r0, 0)}H${X(ox + r0 + T)}V${Y(PIER_FOOT)}H${X(ox + r0)}Z`,
    class: 'stone', opacity: 0,
  }, gStone)

  // crown heights, carried across both arches
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
  const labels = [
    label(0, PIER_FOOT + 16, 'Pointed'),
    label(ox, PIER_FOOT + 16, 'Round'),
    label(ox + 94, -APEX + 2.5, 'rises ⅞ of its span', 'side'),
    label(ox + 94, -r0 + 2.5, 'rises ½ its span', 'side'),
  ]

  // ---- 4. weight and thrust ---------------------------------------------------
  const weights = el('path', {
    d: arrow(0, -APEX_X - 46, 0, -APEX_X - 6) + arrow(ox, -r0 - T - 46, ox, -r0 - T - 6),
    class: 'force', opacity: 0,
  }, gForce)
  // lines of thrust: in the pointed arch they stay inside the pier; in the
  // round arch they lean out past its outer face
  const thrustPointed = [1, -1].map((s) =>
    `M${P(0, -APEX - T / 2)}C${P(s * 30, -82)} ${P(s * 56, -42)} ${P(s * 59, 0)}C${P(s * 60.5, 40)} ${P(s * 61, 110)} ${P(s * 61.5, PIER_FOOT - 8)}`).join('')
  const thrustRound = [1, -1].map((s) =>
    `M${P(ox, -r0 - T / 2)}C${P(ox + s * 34, -58)} ${P(ox + s * 58, -36)} ${P(ox + s * 62, 0)}C${P(ox + s * 66, 40)} ${P(ox + s * 80, 110)} ${P(ox + s * 96, PIER_FOOT - 8)}`).join('')
  const flows = [thrustPointed, thrustRound].map((d) =>
    el('path', { d, class: 'flow', opacity: 0, 'stroke-dasharray': `${S(3)} ${S(4)}` }, gForce))
  // outward push at the springing: small for pointed, large for round
  const pushes = el('path', {
    d: arrow(50 + T + 3, -8, 50 + T + 15, -8, 4) + arrow(-50 - T - 3, -8, -50 - T - 15, -8, 4) +
      arrow(ox + r0 + T + 3, -8, ox + r0 + T + 36, -8, 5) + arrow(ox - r0 - T - 3, -8, ox - r0 - T - 36, -8, 5),
    class: 'push', opacity: 0,
  }, gForce)

  setOp(g, 0)

  /** q: this scene's own progress 0..1; fade: its overall opacity;
   *  flowPhase: how far the thrust has travelled (local units) */
  function update(q: number, fade: number, flowPhase: number): void {
    setOp(g, fade)
    // 1. compass
    setOp(centres, ramp(q, 0, 0.03))
    setDraw(span, ease(ramp(q, 0, 0.04)))
    const tR = ease(ramp(q, 0.03, 0.1))
    const tL = ease(ramp(q, 0.09, 0.16))
    setDraw(arcR, tR)
    setDraw(arcL, tL)
    armR.setAttribute('d', arm(-50, (-Math.PI / 3) * tR))
    armL.setAttribute('d', arm(50, Math.PI + (Math.PI / 3) * tL))
    const armsOut = 1 - ramp(q, 0.17, 0.22)
    setOp(armR, Math.min(ramp(q, 0.02, 0.04), armsOut))
    setOp(armL, Math.min(ramp(q, 0.08, 0.1), armsOut))
    // 2. stone
    setDraw(extr, ease(ramp(q, 0.18, 0.27)))
    setDraw(pierInk, ease(ramp(q, 0.2, 0.3)))
    setDraw(jointInk, ease(ramp(q, 0.25, 0.32)))
    setOp(stone, ramp(q, 0.28, 0.36))
    // 3. round arch, and the heights
    setDraw(roundIntr, ease(ramp(q, 0.4, 0.47)))
    setDraw(roundExtr, ease(ramp(q, 0.43, 0.5)))
    setDraw(roundPiers, ease(ramp(q, 0.44, 0.51)))
    setDraw(roundJoints, ease(ramp(q, 0.48, 0.53)))
    setOp(roundStone, ramp(q, 0.5, 0.56))
    setOp(guides, ramp(q, 0.52, 0.6))
    labels.forEach((l, i) => setOp(l, ramp(q, 0.54 + i * 0.015, 0.58 + i * 0.015)))
    // 4. forces
    setOp(weights, ramp(q, 0.62, 0.67))
    flows.forEach((f) => {
      setOp(f, ramp(q, 0.66, 0.72))
      f.style.strokeDashoffset = String(-flowPhase * k)
    })
    setOp(pushes, ramp(q, 0.73, 0.79))
  }

  return { update }
}
