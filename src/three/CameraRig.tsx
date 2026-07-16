import { useFrame, useThree } from '@react-three/fiber'
import type { PerspectiveCamera } from 'three'
import { scenes } from '../scenes/registry'
import { scenePhase, scrollState } from '../scroll/scrollState'
import { applyPose } from './cameraMath'

/** Poses the render camera every frame from the shared scroll progress. */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera

  useFrame(() => {
    const { index, t } = scenePhase(scrollState.progress, scenes.length)
    applyPose(camera, scenes[Math.min(index, scenes.length - 1)], t)
  })

  return null
}
