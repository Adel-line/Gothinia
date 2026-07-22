import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, SSAO } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
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
    <EffectComposer multisampling={0} enableNormalPass>
      <SSAO
        blendFunction={BlendFunction.MULTIPLY}
        samples={24}
        rings={4}
        radius={0.14}
        intensity={5}
        bias={0.025}
        luminanceInfluence={0.6}
        worldDistanceThreshold={30}
        worldDistanceFalloff={5}
        worldProximityThreshold={0.5}
        worldProximityFalloff={0.2}
      />
      <Bloom mipmapBlur luminanceThreshold={0.22} luminanceSmoothing={0.3} intensity={1.15} radius={0.85} />
      <primitive object={edgeBlur} />
    </EffectComposer>
  )
}
