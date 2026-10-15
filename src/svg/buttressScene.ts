import { drawn, ease, el, lerp, ramp, setDraw, setOp } from './dom'

/**
 * Scene 4 — the flying buttress.
 *
 * A cross-section of one bay of the nave from outside:
 *
 *   1. the wall alone: the vault pushes it outward, and it cracks;
 *   2. the buttress is built: a pier standing clear of the wall, two flyers
 *      (the lower carries the vault's thrust, the upper braces the roof against
 *      the wind), and a pinnacle on the pier;
 *   3. the thrust line is drawn: from the vault's springing, through the lower
 *      flyer, into the pier and down to the ground, always inside the stone;
 *   4. the test: take the pinnacle's weight away and the line drifts out through
 *      the pier's face (red: the pier would topple); put it back and it returns.
 *
 * Local units: ground at y = 0, +y down, the nave to the left (x < 0).
 */

export interface ButtressPlacement {
  x: number
  y: number
  k: number
}

const WALL_X0 = -72
const WALL_TOP = -420
const PIER_X0 = 150
const PIER_X1 = 200
const PIER_TOP = -400

/** a point on a quadratic curve */
const bez = (t: number, p0: number, c: number, p2: number) => (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * c + t * t * p2

export function buildButtressScene(parent: Element, place: ButtressPlacement) {
  const { k } = place
  const X = (x: number) => (place.x + x * k).toFixed(3)
  const Y = (y: number) => (place.y + y * k).toFixed(3)
  const S = (r: number) => (r * k).toFixed(3)
  const P = (x: number, y: number) => `${X(x)} ${Y(y)}`
  const arrow = (x1: number, y1: number, x2: number, y2: number, head = 7) => {
    const a = Math.atan2(y2 - y1, x2 - x1)
    const h1 = [x2 - Math.cos(a - 0.45) * head, y2 - Math.sin(a - 0.45) * head]
    const h2 = [x2 - Math.cos(a + 0.45) * head, y2 - Math.sin(a + 0.45) * head]
    return `M${P(x1, y1)}L${P(x2, y2)}M${P(h1[0], h1[1])}L${P(x2, y2)}L${P(h2[0], h2[1])}`
  }

  const g = el('g', { class: 'layer buttress-scene' }, parent)
  const gStone = el('g', { opacity: 0 }, g)
  const gInk = el('g', {}, g)
  const gPin = el('g', {}, g)
  const gForce = el('g', {}, g)

  // ---- the structure ---------------------------------------------------------------
  const ground = `M${P(-130, 0)}H${X(340)}M${P(-140, 9)}H${X(350)}`
  const wall = `M${P(WALL_X0, 0)}V${Y(WALL_TOP)}M${P(0, 0)}V${Y(WALL_TOP)}`
  const cornice = `M${P(WALL_X0 - 8, WALL_TOP)}H${X(8)}V${Y(WALL_TOP - 10)}H${X(WALL_X0 - 8)}Z`
  let parapet = `M${P(WALL_X0 - 4, WALL_TOP - 10)}V${Y(WALL_TOP - 36)}H${X(4)}V${Y(WALL_TOP - 10)}`
  for (let i = 0; i < 5; i++) {
    const x = WALL_X0 + 4 + i * 15
    parapet += `M${P(x, WALL_TOP - 12)}V${Y(WALL_TOP - 24)}A${S(5)} ${S(5)} 0 0 1 ${P(x + 10, WALL_TOP - 24)}V${Y(WALL_TOP - 12)}`
  }
  // the lower flyer: a quadrant arch, stepping down from the wall to the pier
  const loTop = `M${P(0, -340)}Q${P(75, -352)} ${P(150, -290)}`
  const loUnder = `M${P(0, -314)}Q${P(75, -328)} ${P(150, -262)}`
  const loAxis = (t: number): [number, number] => [bez(t, 0, 75, 150), bez(t, -327, -340, -276)]
  let loJoints = ''
  for (let i = 1; i < 8; i++) {
    const t = i / 8
    loJoints += `M${P(bez(t, 0, 75, 150), bez(t, -340, -352, -290))}L${P(bez(t, 0, 75, 150), bez(t, -314, -328, -262))}`
  }
  // the upper flyer: a lighter sloping strut that carries the roof's wind-bracing and its water channel,
  // propped on small arches from the lower one
  const upTop = `M${P(0, -398)}L${P(150, -364)}`
  const upUnder = `M${P(0, -384)}L${P(150, -350)}`
  let upArcade = ''
  for (let i = 0; i < 3; i++) {
    const x0 = 18 + i * 44, x1 = x0 + 34
    const yb = (x: number) => -384 + (34 * x) / 150
    upArcade += `M${P(x0, yb(x0) + 22)}V${Y(yb(x0) + 8)}A${S(17)} ${S(17)} 0 0 1 ${P(x1, yb(x1) + 8)}V${Y(yb(x1) + 22)}`
  }
  const pier = `M${P(PIER_X0 - 10, 0)}V${Y(-60)}L${P(PIER_X0, -90)}V${Y(PIER_TOP)}M${P(PIER_X1 + 10, 0)}V${Y(-60)}L${P(PIER_X1, -90)}V${Y(PIER_TOP)}`
  const pierCap = `M${P(PIER_X0 - 6, PIER_TOP)}H${X(PIER_X1 + 6)}V${Y(PIER_TOP - 10)}H${X(PIER_X0 - 6)}Z`
  let pierCourses = ''
  for (let y = -36; y > PIER_TOP + 20; y -= 36) {
    const w = y > -60 ? 10 : 0
    pierCourses += `M${P(PIER_X0 - w, y)}H${X(PIER_X1 + w)}M${P(PIER_X0 + ((y / 36) % 2 ? 18 : 34), y)}V${Y(y - 36)}`
  }
  let wallCourses = ''
  for (let y = -36; y > WALL_TOP; y -= 36) {
    wallCourses += `M${P(WALL_X0, y)}H${X(0)}M${P(WALL_X0 + ((y / 36) % 2 ? 22 : 44), y)}V${Y(y - 36)}`
  }
  // the aisle roof leaning on the wall below the flyers
  const roof = `M${P(0, -240)}L${P(150, -166)}M${P(0, -228)}L${P(150, -154)}`
  // the pinnacle: shaft with blind arches, spire with crockets, finial
  const shaft = `M${P(PIER_X0 + 8, PIER_TOP - 10)}V${Y(-470)}M${P(PIER_X1 - 8, PIER_TOP - 10)}V${Y(-470)}`
  let blind = ''
  for (const x of [164, 178]) blind += `M${P(x, -418)}V${Y(-446)}A${S(5.5)} ${S(5.5)} 0 0 1 ${P(x + 11, -446)}V${Y(-418)}`
  const spire = `M${P(PIER_X0 + 2, -470)}H${X(PIER_X1 - 2)}M${P(PIER_X0 + 4, -470)}L${P(175, -548)}L${P(PIER_X1 - 4, -470)}`
  let crockets = ''
  for (const t of [0.28, 0.5, 0.72]) {
    for (const s of [-1, 1]) {
      const x = 175 + s * 21 * (1 - t), y = -470 - 78 * t
      crockets += `M${P(x, y)}q${S(s * 7)} ${S(-3)} ${S(s * 6)} ${S(-9)}a${S(2)} ${S(2)} 0 1 ${s === 1 ? 0 : 1} ${S(s * -3)} ${S(-2)}`
    }
  }
  const finial = `M${P(175, -548)}V${Y(-562)}M${P(175, -552)}m${S(-4)} 0a${S(4)} ${S(4)} 0 1 0 ${S(8)} 0a${S(4)} ${S(4)} 0 1 0 ${S(-8)} 0`
  // the vault's rib springing from the inside of the wall
  const rib = `M${P(WALL_X0, -330)}A${S(84)} ${S(84)} 0 0 0 ${P(WALL_X0 - 84, -414)}M${P(WALL_X0, -330)}A${S(120)} ${S(70)} 0 0 0 ${P(WALL_X0 - 130, -392)}M${P(WALL_X0 - 8, -330)}H${X(WALL_X0 + 2)}`
  // cracks that open where the wall is pushed out, with nothing to hold it
  const cracks =
    `M${P(-36, -372)}l${S(7)} ${S(-12)}l${S(-6)} ${S(-9)}l${S(8)} ${S(-12)}M${P(-18, -318)}l${S(-8)} ${S(11)}l${S(7)} ${S(10)}l${S(-6)} ${S(12)}` +
    `M${P(-48, -300)}l${S(6)} ${S(-10)}l${S(-5)} ${S(-9)}`

  // ---- fills ---------------------------------------------------------------------------
  const fillA = el('path', { class: 'stone a', 'fill-rule': 'evenodd' }, gStone)
  const fillB = el('path', { class: 'stone b' }, gStone)
  fillA.setAttribute('d',
    `M${P(WALL_X0, 0)}V${Y(WALL_TOP)}H${X(0)}V${Y(0)}Z` +
      `M${P(0, -340)}Q${P(75, -352)} ${P(150, -290)}V${Y(-262)}Q${P(75, -328)} ${P(0, -314)}Z` +
      `M${P(0, -398)}L${P(150, -364)}V${Y(-350)}L${P(0, -384)}Z` +
      `M${P(PIER_X0 - 10, 0)}V${Y(-60)}L${P(PIER_X0, -90)}V${Y(PIER_TOP)}H${X(PIER_X1)}V${Y(-90)}L${P(PIER_X1 + 10, -60)}V${Y(0)}Z`)
  fillB.setAttribute('d',
    `M${P(WALL_X0 - 8, WALL_TOP)}H${X(8)}V${Y(WALL_TOP - 36)}H${X(WALL_X0 - 4)}V${Y(WALL_TOP - 10)}H${X(WALL_X0 - 8)}Z` +
      `M${P(0, -240)}L${P(150, -166)}V${Y(-154)}L${P(0, -228)}Z`)
  const fillPin = el('path', { class: 'stone b' }, gPin)
  fillPin.setAttribute('d',
    `M${P(PIER_X0 - 6, PIER_TOP)}H${X(PIER_X1 + 6)}V${Y(PIER_TOP - 10)}H${X(PIER_X0 - 6)}Z` +
      `M${P(PIER_X0 + 8, PIER_TOP - 10)}V${Y(-470)}H${X(PIER_X1 - 8)}V${Y(PIER_TOP - 10)}Z` +
      `M${P(PIER_X0 + 4, -470)}L${P(175, -548)}L${P(PIER_X1 - 4, -470)}Z`)

  // ---- ink, drawn on in turn --------------------------------------------------------------
  const ink = (d: string, cls = 'fine', host: Element = gInk) => drawn(d, cls, host)
  const inkGround = ink(ground, 'bold')
  const inkWall = ink(wall + cornice + parapet, 'bold')
  const inkPier = ink(pier, 'bold')
  const inkLower = ink(loTop + loUnder, 'bold')
  const inkUpper = ink(upTop + upUnder + upArcade, 'bold')
  const inkRoof = ink(roof)
  const inkDetail = ink(loJoints + wallCourses + pierCourses, 'faint2')
  const inkRib = ink(rib, 'fine')
  const inkPin = ink(pierCap + shaft + spire + finial, 'bold', gPin)
  const inkPinDetail = ink(blind + crockets, 'fine', gPin)
  const inkCracks = ink(cracks, 'bold')
  inkCracks.style.stroke = '#d0434f'

  const labels = [
    ['Vault', WALL_X0 - 70, -372, 'middle', 0.04],
    ['Lower flyer', 62, -366, 'middle', 0.34],
    ['Upper flyer', 70, -416, 'middle', 0.36],
    ['Pier', 244, -150, 'start', 0.34],
    ['Pinnacle', 218, -520, 'start', 0.38],
  ] as const
  const labelEls = labels.map(([text, x, y, anchor]) => {
    const t = el('text', { x: X(x), y: Y(y), class: 'label side', 'font-size': S(8.5), 'text-anchor': anchor, opacity: 0 }, gInk)
    t.textContent = text
    return t
  })

  // ---- the thrust line ---------------------------------------------------------------------
  /** from the vault's springing, through the lower flyer, into the pier. w: 1 with the pinnacle's weight on it, 0 without */
  const thrustPath = (w: number, upTo = 1): string => {
    const xe = lerp(216, 180, w)
    const a = loAxis(0)
    let d = `M${P(-64, -331)}L${P(a[0], a[1])}`
    const n = 20
    for (let i = 1; i <= n; i++) {
      const p = loAxis((i / n) * 1)
      d += `L${P(p[0], p[1])}`
    }
    d += `C${P(166, -262)} ${P(lerp(213, 178, w), -200)} ${P(xe, -4)}`
    void upTo
    return d
  }
  const mkThrust = (cls: string) => {
    const p = el('path', { d: thrustPath(1), class: cls, opacity: 0, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, gForce)
    return p
  }
  const thrustOk = mkThrust('flow')
  const thrustBad = mkThrust('push')
  const pushes = el('path', { d: arrow(-150, -345, -90, -345, 6) + arrow(-26, -300, 14, -300, 6), class: 'push', opacity: 0 }, gForce)
  const weight = el('path', { d: arrow(175, -612, 175, -574, 7), class: 'force', opacity: 0 }, gPin)
  const outside = el('text', { x: X(222), y: Y(-110), class: 'label side', 'font-size': S(8.5), 'text-anchor': 'start', opacity: 0 }, gInk)
  outside.textContent = 'outside the stone'

  /** swarm targets: the outlines the vault's lines settle onto */
  const targets = [ground, wall + cornice + parapet, loTop + loUnder, upTop + upUnder, pier, pierCap + shaft + spire]
  const ready = Promise.resolve()

  function update(q: number, formed: number, _flow: number): void {
    const vis = formed > 0 ? '' : 'none'
    if (g.style.display !== vis) g.style.display = vis
    setOp(g, formed)

    // 1. the wall alone, pushed outward and cracking
    setDraw(inkWall, ease(ramp(q, 0.01, 0.1)))
    setDraw(inkRib, ease(ramp(q, 0.02, 0.1)))
    setDraw(inkGround, ease(ramp(q, 0.02, 0.1)))
    setOp(pushes, ramp(q, 0.06, 0.1) * (1 - ramp(q, 0.2, 0.26)))
    setDraw(inkCracks, ease(ramp(q, 0.08, 0.14)) )
    inkCracks.style.opacity = String(1 - ramp(q, 0.22, 0.3))
    // 2. the buttress is built, from the ground up
    setDraw(inkPier, ease(ramp(q, 0.16, 0.24)))
    setDraw(inkLower, ease(ramp(q, 0.22, 0.31)))
    setDraw(inkRoof, ease(ramp(q, 0.26, 0.32)))
    setDraw(inkUpper, ease(ramp(q, 0.29, 0.37)))
    setOp(gStone, ramp(q, 0.2, 0.36))
    setDraw(inkPin, ease(ramp(q, 0.32, 0.4)))
    setDraw(inkPinDetail, ease(ramp(q, 0.38, 0.44)))
    setDraw(inkDetail, ease(ramp(q, 0.3, 0.42)))
    // 3 & 4. the thrust line, and the pinnacle test
    const off = ease(ramp(q, 0.56, 0.64))
    const back = ease(ramp(q, 0.7, 0.8))
    const w = Math.min(1, Math.max(0, 1 - off + back))
    const pinOp = 1 - 0.82 * off * (1 - back)
    const d = thrustPath(w)
    thrustOk.setAttribute('d', d)
    thrustBad.setAttribute('d', d)
    const draw = ease(ramp(q, 0.46, 0.54))
    setDraw(thrustOk, draw)
    setDraw(thrustBad, draw)
    const bad = ramp(1 - w, 0.15, 0.7)
    setOp(thrustOk, 1 - bad)
    setOp(thrustBad, bad)
    setOp(weight, ramp(q, 0.48, 0.52) * (1 - off * (1 - back)))
    setOp(gPin, ramp(q, 0.3, 0.4) * pinOp)
    setOp(outside, bad * 0.9)
    labelEls.forEach((l, i) => setOp(l, ramp(q, labels[i][4], labels[i][4] + 0.05) * (1 - ramp(q, 0.84, 0.9))))
  }

  return { update, targets, ready }
}
