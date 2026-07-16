import type { ComponentType } from 'react'
import type { SectionContent } from '../content/sections'

export interface CameraPose {
  position: [number, number, number]
  lookAt: [number, number, number]
  fov: number
}

export interface Callout {
  label: string
  /** Anchor point in world space; computed from the same math as the geometry. */
  anchor: [number, number, number]
  /**
   * Which side of the frame the label chip sits on, as a viewport fraction
   * offset from the projected anchor. The arrow is drawn between the two.
   */
  labelOffset: [number, number]
}

export interface SceneDef {
  content: SectionContent
  /** Procedural geometry, mounted only while this scene is active. */
  Component: ComponentType
  /** Opening pose: element fills the frame, centered. */
  poseTight: CameraPose
  /** Reading pose: pulled back, full element in view. */
  poseWide: CameraPose
  callouts: Callout[]
  /** Scene background color while this scene is active. */
  background: string
}
