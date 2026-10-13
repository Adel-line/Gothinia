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
    kicker: 'Notre-Dame de Paris · North rose · c. 1250',
    title: 'The Rose Window',
    body:
      'Around 1250 the masons of Notre-Dame stopped treating the wall as ' +
      'something to pierce and began treating it as a frame for light. The ' +
      'north rose is nearly thirteen metres across, yet its stone is pared ' +
      'down to a net of slender bars — spokes that multiply as they run ' +
      'outward, ring after ring of lights held between them. Most of the ' +
      'glass is still the glass they set: deep cobalt and ruby, kings and ' +
      'prophets gathered around the Virgin at the centre.',
    calloutLabels: [
      'Central oculus',
      'Radiating mullions',
      'Cusped trefoil light',
      'Stained-glass pane',
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
