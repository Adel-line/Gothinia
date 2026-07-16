import { sections } from '../content/sections'
import type { SceneDef } from './types'
import { RoseWindow } from './roseWindow/RoseWindow'
import { roseAnchors } from './roseWindow/tracery'

/**
 * Ordered scrollytelling sequence. Milestone 1 ships the rose window only;
 * the pointed arch, rib vault, flying buttress, gargoyle and final cathedral
 * reveal each become one more entry here.
 */
export const scenes: SceneDef[] = [
  {
    content: sections[0],
    Component: RoseWindow,
    poseTight: { position: [0, 0, 3.4], lookAt: [0, 0, 0], fov: 36 },
    poseWide: { position: [1.7, -1.0, 16.6], lookAt: [0, 0, 0], fov: 36 },
    background: '#0d0f18',
    callouts: [
      { label: sections[0].calloutLabels[0], anchor: roseAnchors.oculus, labelOffset: [0.17, 0.2] },
      { label: sections[0].calloutLabels[1], anchor: roseAnchors.mullion, labelOffset: [0.13, -0.14] },
      { label: sections[0].calloutLabels[2], anchor: roseAnchors.trefoil, labelOffset: [-0.1, 0.16] },
      { label: sections[0].calloutLabels[3], anchor: roseAnchors.pane, labelOffset: [0.12, -0.08] },
    ],
  },
]
