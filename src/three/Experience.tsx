import { useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { scenes } from '../scenes/registry'
import { scenePhase, scrollState } from '../scroll/scrollState'
import { CameraRig } from './CameraRig'
import { Effects } from './Effects'
import { DustMotes } from './effects/DustMotes'
import { LightShafts } from './effects/LightShafts'

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
      <fogExp2 attach="fog" args={[def.background, 0.045]} />
      <def.Component />
    </>
  )
}

/**
 * Turns dressed stone into shadow casters/receivers by walking the live scene
 * graph — so no scene, geometry or material file is touched. Emissive glass
 * and additive atmosphere are skipped: glass is the light source (it must not
 * cast the sun into darkness) and the shafts are transparent air. New meshes
 * appear whenever a scene swaps in, so the (cheap, flag-guarded) traversal
 * runs each frame and only ever configures a mesh once.
 */
function ShadowSetup() {
  const scene = useThree((s) => s.scene)
  useFrame(() => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh || m.userData.__shadowInit) return
      m.userData.__shadowInit = true
      const mat = m.material as THREE.MeshStandardMaterial | undefined
      const emissive = mat?.emissive
      // Glass must never cast or receive: it is the light source, not stone.
      // Detect it explicitly (materials tag themselves) with a non-black
      // emissive as a fallback — the artwork glass emits from the shader, so
      // its material emissive is black and the heuristic alone would miss it.
      const isGlass =
        !!mat &&
        (mat.userData?.isGlass === true ||
          (!!emissive && emissive.r + emissive.g + emissive.b > 0.001))
      const opaqueStone = !!mat && !mat.transparent && !isGlass
      m.castShadow = opaqueStone
      m.receiveShadow = opaqueStone
    })
  })
  return null
}

export function Experience() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 36, near: 0.1, far: 120, position: [0, 0, 3.4] }}
    >
      {/* Cool ambient bounce only — the blue that VISION asks to sit *under*
          the warm key. Kept very low so corners stay dark and the render
          never flattens out; it exists to keep the deepest shadows from
          crushing to pure black, tinted cold against the warm sun. */}
      <hemisphereLight args={['#26314e', '#080605', 0.08]} />

      {/* Late-afternoon sun: the one shadow-casting key. Warm gold, raking in
          high and from the side so moldings, tracery, piers and capitals throw
          real directional shadows and the stone gains genuine relief and depth.
          The wide ortho frustum covers both the rose wall and the Milan
          arcade; normalBias keeps the granular stone free of shadow acne. */}
      <directionalLight
        position={[-9, 8, 7]}
        intensity={1.1}
        color="#f2c47b"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.03}
      >
        <orthographicCamera attach="shadow-camera" args={[-13, 13, 13, -13, 0.5, 45]} />
      </directionalLight>

      {/* Very low cool counter-fill from the opposite side. Not enough to lift
          the scene to flat — just enough cold light in the shadow side to read
          as bounced skylight, holding the warm/cool contrast. Casts nothing. */}
      <directionalLight position={[8, -3, 9]} intensity={0.12} color="#5f6f9c" />

      <ShadowSetup />
      <CameraRig />
      <ActiveScene />
      <LightShafts />
      <DustMotes />
      <Effects />
    </Canvas>
  )
}
