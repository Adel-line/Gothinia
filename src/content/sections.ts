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
    kicker: 'Duomo di Milano · Milan · Lombard Gothic',
    title: 'The Pointed Arch',
    body:
      'The pointed arch is two circular arcs leaning together, and that break ' +
      'at the crown changes everything: thrust that a round arch spreads ' +
      'sideways is steered steeply down into the piers, so walls could rise ' +
      'far higher on far less stone. In Milan the arcade pushes the idea to ' +
      'its limit — clustered piers as tall as a six-storey building carry ' +
      'tier upon tier of arches, and daylight enters only high above, ' +
      'through the glazed lancets of the clerestory.',
    calloutLabels: [
      'Two-centred apex',
      'Clustered pier',
      'Carved capital',
      'Clerestory lancets',
    ],
  },
]
