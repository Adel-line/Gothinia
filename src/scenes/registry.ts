import { sections } from '../content/sections'
import type { SceneDef } from './types'
import { RoseWindow } from './roseWindow/RoseWindow'
import { roseAnchors } from './roseWindow/tracery'
import { MilanArch } from './milanArch/MilanArch'
import { archAnchors } from './milanArch/geometry'

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
    background: '#060403',
    callouts: [
      { label: sections[0].calloutLabels[0], anchor: roseAnchors.oculus, labelOffset: [0.17, 0.2] },
      { label: sections[0].calloutLabels[1], anchor: roseAnchors.mullion, labelOffset: [0.13, -0.14] },
      { label: sections[0].calloutLabels[2], anchor: roseAnchors.trefoil, labelOffset: [-0.1, 0.16] },
      { label: sections[0].calloutLabels[3], anchor: roseAnchors.pane, labelOffset: [0.12, -0.08] },
    ],
  },
  {
    content: sections[1],
    Component: MilanArch,
    poseTight: { position: [0, 3.05, 3.5], lookAt: [0, 3.05, 0], fov: 36 },
    poseWide: { position: [2.4, 1.2, 15.5], lookAt: [0, 1.7, 0], fov: 36 },
    background: '#060403',
    callouts: [
      { label: sections[1].calloutLabels[0], anchor: archAnchors.apex, labelOffset: [0.15, -0.12] },
      { label: sections[1].calloutLabels[1], anchor: archAnchors.pier, labelOffset: [0.14, 0.08] },
      { label: sections[1].calloutLabels[2], anchor: archAnchors.capital, labelOffset: [0.16, 0.14] },
      { label: sections[1].calloutLabels[3], anchor: archAnchors.clerestory, labelOffset: [0.18, -0.05] },
    ],
  },
]
