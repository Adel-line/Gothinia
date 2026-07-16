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
      {/* diffuse daylight: raking warm key models the relief, cool sky fill */}
      <hemisphereLight args={['#b7c4e4', '#241c12', 0.32]} />
      <directionalLight position={[-9, 8, 7]} intensity={1.9} color="#ffedd2" />
      <directionalLight position={[8, -4, 9]} intensity={0.28} color="#a9b8e0" />
      <CameraRig />
      <ActiveScene />
      <Effects />
    </Canvas>
  )
}
