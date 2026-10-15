// ---------------------------------------------------------------------------
// PLACEHOLDER COPY — replace with finalized text.
// Everything the overlay displays lives in this file: swapping in the real
// paragraphs and callout labels requires no code changes elsewhere.
// ---------------------------------------------------------------------------

export interface SectionContent {
  id: string
  kicker: string
  title: string
  body: string
  calloutLabels: string[]
}

export const sections: SectionContent[] = [
  {
    id: 'rose-window',
    kicker: 'Notre-Dame de Paris · South rose · c. 1260',
    title: 'The Rose Window',
    body:
      'Around 1260 the masons of Notre-Dame stopped treating the wall as ' +
      'something to pierce and began treating it as a frame for light. The ' +
      'south rose is nearly thirteen metres across, yet its stone is pared ' +
      'down to a net of slender bars: twelve lights around the centre, ' +
      'doubling to twenty-four, ring after ring held between them. Through ' +
      'it comes a light that is almost all cobalt and ruby — saints and ' +
      'apostles circling the centre, glass that has been lost, restored and ' +
      'reset for more than seven centuries.',
    calloutLabels: [
      'Central oculus',
      'Radiating mullions',
      'Foiled outer light',
      'Medallion light',
    ],
  },
  {
    id: 'pointed-arch',
    kicker: 'Gothic structure · from c. 1140',
    title: 'The Pointed Arch',
    body:
      'Every lancet under the rose ends in the same figure: two arcs, each ' +
      'struck from the opposite side, leaning together at the top. A round ' +
      'arch can only rise half as high as it is wide, and its weight pushes ' +
      'outward, trying to spread its walls apart. Break it at the crown and ' +
      'the arch climbs higher on the same span, and its weight turns ' +
      'downward, into the piers. That small change let builders reach ' +
      'heights that had once seemed impossible.',
    calloutLabels: [
      'Two-centred apex',
      'Clustered pier',
      'Carved capital',
      'Clerestory lancets',
    ],
  },
]

/** The drawn version's third scene (the rib vault); the 3D scenes don't use it. */
export const vaultSection: SectionContent = {
  id: 'rib-vault',
  kicker: 'Gothic structure · from c. 1140',
  title: 'The Rib Vault',
  body:
    'Roofing a nave in stone means carrying a ceiling on nothing but its own ' +
    'arches. The masons drew two ribs diagonally across each bay, crossing at ' +
    'a boss, and framed the bay with four pointed arches that rise to exactly ' +
    'the same height. Between the ribs the ceiling is only a thin shell of ' +
    'stone. The weight no longer rests on the walls but runs down the ribs ' +
    'into four piers, and the walls between them are free to become glass.',
  calloutLabels: [],
}

/** The drawn version's fourth scene (the flying buttress and the gargoyle); the 3D scenes don't use it. */
export const gargoyleSection: SectionContent = {
  id: 'gargoyle',
  kicker: 'Gothic structure · from c. 1200',
  title: 'The Gargoyle',
  body:
    'The vault pushes outward, and a flying arch carries that thrust over the ' +
    'aisle roof to a buttress pier, weighted by its pinnacle. The same stone ' +
    'carries the rain. A channel runs along the top of the arch to a spout ' +
    'carved from the pier, and the spout is the gargoyle: from the old French ' +
    'for throat. It throws the water clear of the wall, because water running ' +
    'down mortar undoes a building. Its face is a mason\'s joke, made useful.',
  calloutLabels: [],
}

/** The drawn version's fourth scene (the flying buttress); the 3D scenes don't use it. */
export const buttressSection: SectionContent = {
  id: 'flying-buttress',
  kicker: 'Gothic structure · from c. 1180',
  title: 'The Flying Buttress',
  body:
    'A stone vault pushes outward as well as down, and a thin wall cannot hold ' +
    'that push alone. So the masons moved the support outside. A flying arch ' +
    'catches the thrust high on the wall and carries it over the aisle roof to ' +
    'a pier that stands clear of the building. The pinnacle on top is not ' +
    'decoration: its weight presses the pier down and keeps the line of force ' +
    'inside the stone. With the wall freed from carrying the vault, it could ' +
    'be filled with glass.',
  calloutLabels: [],
}
