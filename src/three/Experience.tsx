import { useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { scenes } from '../scenes/registry'
import { scenePhase, scrollState } from '../scroll/scrollState'
import { CameraRig } from './CameraRig'
import { Effects } from './Effects'

/**
 * Mounts only the active scene's procedural geometry. The scene index flips
 * exactly at the section boundary — where the full-frame swap blur peaks —
 * so the geometry swap is never visible.
 */
function ActiveScene() {
  const [active, setActive] = useState(0)

  useFrame(() => {
    const { index } = scenePhase(scrollState.progress, scenes.length)
    const clamped = Math.min(index, scenes.length - 1)
    if (clamped !== active) setActive(clamped)
  })

  const def = scenes[active]
  return (
    <>
      <color attach="background" args={[def.background]} />
      <def.Component />
    </>
  )
}

export function Experience() {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 36, near: 0.1, far: 120, position: [0, 0, 3.4] }}
    >
      {/* interior nave: almost no ambient daylight on the stone — the glass
          is the only real light source, the masonry reads as near-silhouette
          with just enough fill for SSAO to model the carving */}
      <hemisphereLight args={['#3a4562', '#0a0806', 0.1]} />
      <directionalLight position={[-9, 8, 7]} intensity={0.1} color="#6b7ca8" />
      <directionalLight position={[8, -4, 9]} intensity={0.05} color="#4a5578" />
      <CameraRig />
      <ActiveScene />
      <Effects />
    </Canvas>
  )
}
