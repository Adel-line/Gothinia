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
