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
    kicker: 'Sainte-Chapelle · Paris · Rayonnant',
    title: 'The Rose Window',
    body:
      'In the Rayonnant style, stone was pared down to a skeletal framework of ' +
      'mullions radiating from a central oculus — the wall itself became glass. ' +
      'The western rose of Sainte-Chapelle, rebuilt around 1485, turns fifteen ' +
      'metres of masonry into a wheel of light: slender spokes brace rings of ' +
      'cusped lights, and each opening is glazed in deep cobalt and ruby so the ' +
      'chapel interior reads as a reliquary lit from within.',
    calloutLabels: [
      'Central oculus',
      'Radiating mullions',
      'Cusped trefoil light',
      'Stained-glass pane',
    ],
  },
]
