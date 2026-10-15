import { drawn, ease, el, ramp, setDraw, setOp } from './dom'

/**
 * Scene 4 — the flying buttress and the gargoyle.
 *
 * A cross-section of one bay of the nave, outside the vault of scene 3:
 *
 *   – the nave wall, with the vault's rib springing against it on the inside;
 *   – the flying arch, which carries the vault's outward thrust over the aisle
 *     roof to the buttress pier, and down to the ground;
 *   – the pier, topped by a pinnacle whose weight presses the thrust downward;
 *   – the water: rain collects in a channel along the top of the arch and runs
 *     to a gargoyle on the pier, which throws it well clear of the wall.
 *
 * Local units: ground at y = 0, +y down, the nave to the left (x < 0). `place`
 * maps them into the drawing.
 */

export interface GargoylePlacement {
  x: number
  y: number
  k: number
}


// the structure, in local units
const WALL_X0 = -72
const WALL_TOP = -420
const PIER_X0 = 150
const PIER_X1 = 200
const PIER_TOP = -400
/** where the gargoyle leaves the pier: the root of its neck */
const G_O: [number, number] = [PIER_X1, -312]

const bez = (t: number, p0: number, c: number, p2: number) => (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * c + t * t * p2
const topAt = (x: number) => -372 + (40 * x) / 150
const underY = (t: number) => bez(t, -326, -338, -262)

export function buildGargoyleScene(parent: Element, place: GargoylePlacement) {
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
  /** a path given in the gargoyle's own frame (origin at the root of its neck) */
  const G = (d: string) => d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (_, a, b) => P(G_O[0] + +a, G_O[1] + +b))

  const g = el('g', { class: 'layer gargoyle-scene' }, parent)
  const gStone = el('g', { opacity: 0 }, g)
  const gGargFill = el('g', { opacity: 0 }, g)
  const gInk = el('g', {}, g)
  const gWater = el('g', {}, g)
  const gForce = el('g', {}, g)

  // ---- the structure ---------------------------------------------------------------
  const ground = `M${P(-130, 0)}H${X(470)}M${P(-140, 9)}H${X(480)}`
  const wall = `M${P(WALL_X0, 0)}V${Y(WALL_TOP)}M${P(0, 0)}V${Y(WALL_TOP)}`
  const cornice = `M${P(WALL_X0 - 8, WALL_TOP)}H${X(8)}V${Y(WALL_TOP - 10)}H${X(WALL_X0 - 8)}Z`
  let parapet = `M${P(WALL_X0 - 4, WALL_TOP - 10)}V${Y(WALL_TOP - 36)}H${X(4)}V${Y(WALL_TOP - 10)}`
  // a row of blind trefoil-headed panels
  for (let i = 0; i < 5; i++) {
    const x = WALL_X0 + 4 + i * 15
    parapet += `M${P(x, WALL_TOP - 12)}V${Y(WALL_TOP - 24)}A${S(5)} ${S(5)} 0 0 1 ${P(x + 10, WALL_TOP - 24)}V${Y(WALL_TOP - 12)}`
  }
  // the flying arch: a straight, sloping top with its channel, and a curved soffit
  const archTop = `M${P(0, topAt(0))}L${P(150, topAt(150))}`
  const archUnder = `M${P(0, -326)}Q${P(75, -338)} ${P(150, -262)}`
  const channel = `M${P(0, topAt(0) + 6)}L${P(150, topAt(150) + 6)}M${P(0, topAt(0) - 5)}L${P(150, topAt(150) - 5)}`
  let joints = ''
  for (let i = 1; i < 8; i++) {
    const t = i / 8
    joints += `M${P(150 * t, topAt(150 * t))}L${P(bez(t, 0, 75, 150), underY(t))}`
  }
  // the pier: plinth, setbacks, courses, and a cornice under the pinnacle
  const pier = `M${P(PIER_X0 - 10, 0)}V${Y(-60)}L${P(PIER_X0, -90)}V${Y(PIER_TOP)}M${P(PIER_X1 + 10, 0)}V${Y(-60)}L${P(PIER_X1, -90)}V${Y(PIER_TOP)}`
  const pierCap = `M${P(PIER_X0 - 6, PIER_TOP)}H${X(PIER_X1 + 6)}V${Y(PIER_TOP - 10)}H${X(PIER_X0 - 6)}Z`
  let pierCourses = ''
  for (let y = -36; y > PIER_TOP + 20; y -= 36) {
    const w = y > -60 ? 10 : 0
    pierCourses += `M${P(PIER_X0 - w, y)}H${X(PIER_X1 + w)}`
    pierCourses += `M${P(PIER_X0 + ((y / 36) % 2 ? 18 : 34), y)}V${Y(y - 36)}`
  }
  let wallCourses = ''
  for (let y = -36; y > WALL_TOP; y -= 36) {
    wallCourses += `M${P(WALL_X0, y)}H${X(0)}M${P(WALL_X0 + ((y / 36) % 2 ? 22 : 44), y)}V${Y(y - 36)}`
  }
  // the aisle roof, leaning against the wall
  const roof = `M${P(0, -262)}L${P(150, -178)}M${P(0, -250)}L${P(150, -166)}`
  let tiles = ''
  for (let i = 1; i < 12; i++) {
    const x = (150 * i) / 12, y = -262 + (84 * i) / 12
    tiles += `M${P(x, y)}L${P(x - 2, y + 11)}`
  }
  // the pinnacle: a shaft with blind arches, a spire with crockets, a finial
  const shaft = `M${P(PIER_X0 + 8, PIER_TOP - 10)}V${Y(-470)}M${P(PIER_X1 - 8, PIER_TOP - 10)}V${Y(-470)}`
  let blind = ''
  for (const x of [164, 178]) blind += `M${P(x, -418)}V${Y(-446)}A${S(5.5)} ${S(5.5)} 0 0 1 ${P(x + 11, -446)}V${Y(-418)}`
  const spireBase = `M${P(PIER_X0 + 2, -470)}H${X(PIER_X1 - 2)}`
  const spire = `M${P(PIER_X0 + 4, -470)}L${P(175, -548)}L${P(PIER_X1 - 4, -470)}`
  let crockets = ''
  for (const t of [0.28, 0.5, 0.72]) {
    for (const s of [-1, 1]) {
      const x = 175 + s * 21 * (1 - t), y = -470 - 78 * t
      crockets += `M${P(x, y)}q${S(s * 7)} ${S(-3)} ${S(s * 6)} ${S(-9)}a${S(2)} ${S(2)} 0 1 ${s === 1 ? 0 : 1} ${S(s * -3)} ${S(-2)}`
    }
  }
  const finial = `M${P(175, -548)}V${Y(-562)}M${P(175, -552)}m${S(-4)} 0a${S(4)} ${S(4)} 0 1 0 ${S(8)} 0a${S(4)} ${S(4)} 0 1 0 ${S(-8)} 0`

  // ---- the gargoyle ---------------------------------------------------------------------
  // A beast hunched on a corbel and leaning out of the pier, head thrust forward and tipped
  // down toward where the water falls. Modelled, not just outlined: a humped shoulder blade,
  // neck folds, a jaw muscle, a heavy brow over a slanted eye, a bat ear, swept-back horns,
  // a spined back, a folded wing at the shoulder, jaws wide on fangs and a forked tongue
  // (the water leaves through them), and a thick foreleg gripping the corbel.
  // (Absolute commands only: G() maps point pairs.)
  const garSilhouette = G(
    'M0 -22C12 -28 26 -34 40 -38C50 -42 60 -42 68 -38C76 -34 82 -30 90 -30' +
      'C98 -30 104 -34 112 -34C120 -34 126 -30 130 -26C132 -24 132 -20 131 -17L137 -14' +
      'C148 -10 160 -4 170 4C174 8 174 14 170 17C167 19 163 19 160 18' +
      'L160 24L156 18L152 19L150 30L147 20L143 21L141 27L138 22L132 24' +
      'C122 30 124 36 128 40L134 39L136 32L140 40L146 39L149 31L152 40L160 39L164 46' +
      'C166 50 162 54 156 54L130 52C118 50 108 44 100 38' +
      'C92 36 86 40 80 46C72 50 60 46 50 40L0 28Z',
  )
  const hornBack = G('M114 -34C112 -52 104 -66 90 -74C102 -62 106 -50 106 -34Z')
  const hornFront = G('M122 -33C124 -48 130 -58 140 -62C136 -52 134 -44 132 -33Z')
  const ear = G('M98 -32L86 -54L106 -40Z')
  const browWedge = G('M108 -30C118 -34 128 -30 134 -20L124 -26C118 -28 112 -27 108 -26Z')
  // a folded wing at the shoulder, curved and scalloped, with its bones
  const wing = G('M50 -40C46 -62 38 -84 24 -100C22 -90 16 -84 10 -80Q16 -74 12 -68Q20 -66 20 -58Q30 -58 38 -50Z')
  const wingBones = G('M24 -100L10 -80M24 -100L12 -68M24 -100L20 -58M24 -100C34 -80 40 -62 46 -44')
  // the foreleg: shoulder, elbow, a long hand with claws hooked over the corbel's edge
  const legFill = G('M52 6C44 18 42 34 48 46C54 56 64 60 72 62L90 62C95 62 95 68 90 69L72 69C60 67 50 62 42 52C32 38 34 20 42 12Z')
  const forelimb = G('M52 6C44 18 42 34 48 46C54 56 64 60 72 62M42 12C36 24 36 38 44 50C50 58 60 64 72 66')
  const claws = G('M72 62L90 62C95 62 95 68 90 69L72 69M90 63L97 70M85 64L91 73M79 65L84 75')
  const corbel = G('M-14 64L90 64L90 70L84 70L84 76L76 76L70 86L40 94L10 86L-8 76L-14 76Z')
  const corbelLeaf = G('M40 94C34 102 40 110 48 106C44 102 44 98 42 95')
  // the face
  const eyeSocket = G('M114 -22C118 -27 126 -27 129 -21C125 -18 118 -18 114 -22Z')
  const pupil = G('M121 -27L122 -19')
  const browRidge = G('M108 -30C118 -34 128 -30 134 -20')
  const wrinkles = G('M146 -8C149 -4 149 0 146 4M154 -4C157 0 157 4 154 8M138 -12C141 -8 141 -4 139 0')
  const nostril = G('M162 6C165 4 168 6 167 9C164 10 162 9 162 6Z')
  const cheek = G('M108 -28C118 -10 120 8 114 24')
  const tongue = G('M128 40C142 36 156 42 168 50M168 50C172 54 176 54 180 52M168 50C172 47 176 46 180 47')
  const spines = G('M8 -26L2 -40L18 -32M22 -32L16 -48L32 -38M38 -38L34 -54L48 -44M54 -42L52 -58L64 -46M72 -36L74 -50L82 -38')
  const beard = G('M150 52L146 62L155 53M136 54L132 64L141 55M122 52L118 62L127 53')
  // the body: shoulder blade, neck folds, ribs
  const flank = G('M62 -34C66 -12 68 14 62 38M88 -26C92 -8 90 12 84 30M20 -6Q28 -12 36 -6M18 6Q26 0 34 6M20 18Q28 12 36 18')
  // pale glints where light would catch: horns, ear, brow, fangs, shoulder
  const glints = G('M114 -34C112 -52 104 -66 90 -74M122 -33C124 -48 130 -58 140 -62M108 -30C118 -34 128 -30 134 -20M147 20L150 29M141 27L143 22M40 -38C50 -42 60 -42 68 -38')
  // the groove along its back, which takes the water in through the neck
  const groove = G('M0 -22C12 -28 26 -34 40 -38C46 -40 52 -40 58 -39')
  // hatching in the shadows: under the jaw, down the throat, along the belly
  let hatchD = ''
  for (let x = -6; x < 170; x += 4.2) hatchD += G(`M${x} 10L${x - 14} 46`)

  // fills (stone), under the ink
  const fillA = el('path', { class: 'stone a', 'fill-rule': 'evenodd' }, gStone)
  const fillB = el('path', { class: 'stone b' }, gStone)
  fillA.setAttribute('d',
    `M${P(WALL_X0, 0)}V${Y(WALL_TOP)}H${X(0)}V${Y(0)}Z` +
      `M${P(0, topAt(0))}L${P(150, topAt(150))}V${Y(-262)}Q${P(75, -338)} ${P(0, -326)}Z` +
      `M${P(PIER_X0 - 10, 0)}V${Y(-60)}L${P(PIER_X0, -90)}V${Y(PIER_TOP)}H${X(PIER_X1)}V${Y(-90)}L${P(PIER_X1 + 10, -60)}V${Y(0)}Z` +
      `M${P(PIER_X0 + 8, PIER_TOP - 10)}V${Y(-470)}H${X(PIER_X1 - 8)}V${Y(PIER_TOP - 10)}Z`)
  fillB.setAttribute('d',
    `M${P(WALL_X0 - 8, WALL_TOP)}H${X(8)}V${Y(WALL_TOP - 36)}H${X(WALL_X0 - 4)}V${Y(WALL_TOP - 10)}H${X(WALL_X0 - 8)}Z` +
      `M${P(PIER_X0 - 6, PIER_TOP)}H${X(PIER_X1 + 6)}V${Y(PIER_TOP - 10)}H${X(PIER_X0 - 6)}Z` +
      `M${P(PIER_X0 + 4, -470)}L${P(175, -548)}L${P(PIER_X1 - 4, -470)}Z` +
      `M${P(0, -262)}L${P(150, -178)}V${Y(-166)}L${P(0, -250)}Z` +
      '')
  // the beast: wing behind, then corbel, leg and body, horns on top
  el('path', { class: 'stone d', d: wing }, gGargFill)
  el('path', { class: 'stone b', d: corbel }, gGargFill)
  el('path', { class: 'stone c', d: garSilhouette }, gGargFill)
  el('path', { class: 'stone a', d: legFill }, gGargFill)
  el('path', { class: 'stone a', d: hornBack + hornFront + ear }, gGargFill)
  // light from the upper left, shadow under the jaw: a gradient and hatching, clipped to the body
  const clipId = 'garg-clip'
  el('clipPath', { id: clipId }, g).appendChild(el('path', { d: garSilhouette }))
  const light = el('linearGradient', {
    id: 'garg-light', gradientUnits: 'userSpaceOnUse', x1: X(G_O[0] + 20), y1: Y(G_O[1] - 52), x2: X(G_O[0] + 150), y2: Y(G_O[1] + 54),
  }, g)
  el('stop', { offset: 0, 'stop-color': '#d9c7a4', 'stop-opacity': 0.3 }, light)
  el('stop', { offset: 0.5, 'stop-color': '#d9c7a4', 'stop-opacity': 0 }, light)
  el('stop', { offset: 0.5, 'stop-color': '#000008', 'stop-opacity': 0 }, light)
  el('stop', { offset: 1, 'stop-color': '#000008', 'stop-opacity': 0.55 }, light)
  const shadow = el('linearGradient', {
    id: 'garg-shadow', gradientUnits: 'userSpaceOnUse', x1: 0, y1: Y(G_O[1] + 4), x2: 0, y2: Y(G_O[1] + 48),
  }, g)
  el('stop', { offset: 0, 'stop-color': '#050509', 'stop-opacity': 0 }, shadow)
  el('stop', { offset: 1, 'stop-color': '#050509', 'stop-opacity': 0.75 }, shadow)
  const shaded = el('g', { 'clip-path': `url(#${clipId})`, opacity: 0 }, gGargFill)
  el('path', { d: garSilhouette, fill: 'url(#garg-light)' }, shaded)
  el('path', { d: hatchD, class: 'ink faint2', style: 'stroke:url(#garg-shadow);stroke-opacity:1' }, shaded)
  // the eye: a socket, and a faint ember in it once the rain begins
  el('path', { d: eyeSocket, fill: '#06060a' }, gGargFill)
  el('path', { d: browWedge, fill: '#08080c' }, gGargFill)
  el('path', { d: nostril, fill: '#06060a' }, gGargFill)
  const ember = el('g', { opacity: 0 }, gGargFill)
  const glow = el('radialGradient', { id: 'garg-ember' }, g)
  el('stop', { offset: 0, 'stop-color': '#ffb040', 'stop-opacity': 0.9 }, glow)
  el('stop', { offset: 1, 'stop-color': '#c04010', 'stop-opacity': 0 }, glow)
  el('circle', { cx: X(G_O[0] + 122), cy: Y(G_O[1] - 22.5), r: S(6), fill: 'url(#garg-ember)' }, ember)
  el('circle', { cx: X(G_O[0] + 122), cy: Y(G_O[1] - 22.5), r: S(1.5), fill: '#ffd070' }, ember)

  // ink, drawn on in turn
  const ink = (d: string, cls = 'fine', parent: Element = gInk) => drawn(d, cls, parent)
  const inkGround = ink(ground, 'bold')
  const inkWall = ink(wall + cornice + parapet, 'bold')
  const inkArch = ink(archTop + archUnder, 'bold')
  const inkPier = ink(pier + pierCap, 'bold')
  const inkRoof = ink(roof)
  const inkSpire = ink(shaft + spireBase + spire + finial, 'bold')
  const inkJoints = ink(joints + channel, 'faint2')
  const inkCourses = ink(wallCourses + pierCourses + tiles + blind, 'faint2')
  const inkCrockets = ink(crockets)
  const inkGarg = ink(garSilhouette + hornBack + hornFront + ear + corbel + forelimb + wing, 'bold')
  const inkGargDetail = ink(eyeSocket + pupil + browRidge + wrinkles + nostril + cheek + tongue + spines + beard + claws + corbelLeaf, 'fine')
  const inkFlank = ink(flank + wingBones + groove, 'faint2')
  const inkGlints = ink(glints, 'fine')
  inkGlints.style.stroke = '#f3e3c0'
  inkGlints.style.strokeOpacity = '0.55'
  // the inside of the nave: the vault's rib, springing from the wall
  const rib = ink(`M${P(WALL_X0, -330)}A${S(84)} ${S(84)} 0 0 0 ${P(WALL_X0 - 84, -414)}M${P(WALL_X0, -330)}A${S(120)} ${S(70)} 0 0 0 ${P(WALL_X0 - 130, -392)}M${P(WALL_X0 - 8, -330)}H${X(WALL_X0 + 2)}`, 'fine')

  const labels = [
    ['Flying arch', 70, -398, 'middle'],
    ['Vault', WALL_X0 - 70, -372, 'middle'],
    ['Nave wall', WALL_X0 / 2, -200, 'middle'],
    ['Pinnacle', 218, -520, 'start'],
    ['Gargoyle', 392, -236, 'start'],
  ] as const
  const labelEls = labels.map(([text, x, y, anchor]) => {
    const t = el('text', { x: X(x), y: Y(y), class: 'label side', 'font-size': S(8.5), 'text-anchor': anchor, opacity: 0 }, gInk)
    t.textContent = text
    return t
  })

  // ---- thrust and weight (gold and red, as in scene 2) ---------------------------------
  const thrustD =
    `M${P(-100, -352)}L${P(0, -349)}C${P(40, -343)} ${P(110, -325)} ${P(150, -297)}` +
    `C${P(168, -283)} ${P(176, -250)} ${P(176, -200)}L${P(176, -6)}`
  const thrust = el('path', { d: thrustD, class: 'flow', opacity: 0, 'stroke-dasharray': `${S(3)} ${S(4)}` }, gForce)
  const pushes = el('path', { d: arrow(-150, -345, -90, -345, 6), class: 'push', opacity: 0 }, gForce)
  const weight = el('path', { d: arrow(175, -612, 175, -572, 6), class: 'force', opacity: 0 }, gForce)

  // ---- water: rain, the channel, the spout, the splash -------------------------------------
  // rain: streaks of dash that fall (one path; its dash phase is the same for all, offset by length)
  let rainD = ''
  let seed = 5
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 90; i++) {
    const x = -150 + rnd() * 560
    const y0 = -600 + rnd() * 300
    rainD += `M${P(x, y0)}v${S(300 + rnd() * 300)}`
  }
  const rain = el('path', { d: rainD, class: 'rain', opacity: 0, 'stroke-dasharray': `${S(7)} ${S(46)}` }, gWater)
  // the channel: water running down the top of the arch to the pier, into the gargoyle's groove
  const spoutD = `M${P(2, topAt(2) + 0.5)}L${P(150, topAt(150) + 0.5)}` + G('L0 -22L10 -28L22 -34L34 -38')
  const channelFlow = el('path', { d: spoutD, class: 'water', opacity: 0, 'stroke-dasharray': `${S(4)} ${S(5)}` }, gWater)
  // …and out of the mouth in a long parabola
  const mouth: [number, number] = [G_O[0] + 162, G_O[1] + 42]
  let stream = `M${P(mouth[0], mouth[1])}`
  const T = 2.2, vx = 36, grav = (2 * (0 - mouth[1])) / (T * T)
  for (let i = 1; i <= 30; i++) {
    const t = (i / 30) * T
    stream += `L${P(mouth[0] + vx * t, mouth[1] + 0.5 * grav * t * t)}`
  }
  const streamEnd: [number, number] = [mouth[0] + vx * T, 0]
  const spout = el('path', { d: stream, class: 'water thick', opacity: 0, 'stroke-dasharray': `${S(5)} ${S(4)}` }, gWater)
  const splash = el('path', {
    d: `M${P(streamEnd[0] - 14, 0)}q${S(7)} ${S(-9)} ${S(14)} 0M${P(streamEnd[0], 0)}q${S(7)} ${S(-12)} ${S(14)} 0M${P(streamEnd[0] - 6, 0)}q${S(3)} ${S(-16)} ${S(6)} 0`,
    class: 'water thick', opacity: 0,
  }, gWater)

  /** what the swarm lands on: the structure's outlines, in the order they draw */
  const targets = [ground, wall + cornice + parapet, archTop + archUnder, pier + pierCap, roof, shaft + spireBase + spire, garSilhouette + hornBack + hornFront + ear + wing + corbel + forelimb]

  /**
   * q: this scene's own progress 0..1; formed: 0..1 how far the landed swarm has
   * given way to the drawn lines; flowPhase: how far the water and thrust have run.
   */
  function update(q: number, formed: number, flowPhase: number): void {
    setOp(g, formed)
    setOp(gStone, ramp(q, 0.08, 0.22))
    setOp(gGargFill, ramp(q, 0.46, 0.56))
    setOp(shaded, ramp(q, 0.54, 0.64))
    setOp(ember, ramp(q, 0.62, 0.7) * (0.75 + 0.25 * Math.sin(flowPhase * 0.11)))
    // the structure, from the ground up
    setDraw(inkGround, ease(ramp(q, 0.02, 0.1)))
    setDraw(inkWall, ease(ramp(q, 0.04, 0.16)))
    setDraw(inkPier, ease(ramp(q, 0.06, 0.18)))
    setDraw(inkArch, ease(ramp(q, 0.1, 0.2)))
    setDraw(inkRoof, ease(ramp(q, 0.12, 0.2)))
    setDraw(inkSpire, ease(ramp(q, 0.14, 0.26)))
    setDraw(inkJoints, ease(ramp(q, 0.18, 0.3)))
    setDraw(inkCourses, ease(ramp(q, 0.18, 0.32)))
    setDraw(inkCrockets, ease(ramp(q, 0.26, 0.34)))
    setDraw(rib, ease(ramp(q, 0.08, 0.18)))
    labelEls.forEach((l, i) => setOp(l, ramp(q, 0.3 + i * 0.03, 0.36 + i * 0.03) * (1 - ramp(q, 0.7, 0.76))))
    // the thrust, then let it go
    const forcesOut = 1 - ramp(q, 0.46, 0.54)
    setOp(pushes, Math.min(ramp(q, 0.34, 0.38), forcesOut))
    setOp(thrust, Math.min(ramp(q, 0.36, 0.42), forcesOut))
    thrust.style.strokeDashoffset = String(-flowPhase * k)
    setOp(weight, Math.min(ramp(q, 0.36, 0.4), forcesOut))
    // the gargoyle is carved
    setDraw(inkGarg, ease(ramp(q, 0.44, 0.54)))
    setDraw(inkGargDetail, ease(ramp(q, 0.5, 0.58)))
    setDraw(inkFlank, ease(ramp(q, 0.54, 0.62)))
    setDraw(inkGlints, ease(ramp(q, 0.56, 0.64)))
    // rain, the channel, the spout
    setOp(rain, ramp(q, 0.58, 0.66) * 0.55)
    rain.style.strokeDashoffset = String(-flowPhase * k * 1.7)
    setOp(channelFlow, ramp(q, 0.62, 0.68))
    channelFlow.style.strokeDashoffset = String(-flowPhase * k * 0.9)
    setOp(spout, ramp(q, 0.66, 0.72))
    spout.style.strokeDashoffset = String(-flowPhase * k * 1.3)
    setOp(splash, ramp(q, 0.72, 0.78) * (0.75 + 0.25 * Math.sin(flowPhase * 0.18)))
  }

  return { update, targets }
}
