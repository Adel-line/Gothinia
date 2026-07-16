import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { EdgeBlurEffect } from './effects/EdgeBlur'
import { scenes } from '../scenes/registry'
import { edgeBlurStrength, scenePhase, scrollState, swapBlurStrength } from '../scroll/scrollState'

export function Effects() {
  const edgeBlur = useMemo(() => new EdgeBlurEffect(), [])

  useFrame(() => {
    const { index, t } = scenePhase(scrollState.progress, scenes.length)
    edgeBlur.edgeStrength = edgeBlurStrength(t)
    // While the sequence has a single scene, let the final blur-out play as a
    // preview of the swap mechanic (isLast = false); with the full sequence
    // the last scene holds sharp instead.
    const isLast = scenes.length > 1 && index === scenes.length - 1
    edgeBlur.fullStrength = swapBlurStrength(t, index === 0, isLast)
  })

  return (
    <EffectComposer multisampling={4}>
      <Bloom mipmapBlur luminanceThreshold={0.42} luminanceSmoothing={0.28} intensity={0.7} />
      <primitive object={edgeBlur} />
      <Vignette eskil={false} offset={0.22} darkness={0.52} />
    </EffectComposer>
  )
}
