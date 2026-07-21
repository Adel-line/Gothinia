import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scenes } from '../../scenes/registry'
import { scenePhase, scrollState } from '../../scroll/scrollState'

/**
 * Volumetric light shafts — the beams of coloured daylight that a Gothic
 * interior lives on. These are NOT architecture: they are additive
 * atmosphere, part of the lighting layer, mounted alongside the lights in
 * Experience. Each shaft is a soft additive quad whose brightness falls off
 * as a gaussian across its width and fades in and out along its length, so it
 * reads as a column of dust-lit air rather than a card. A slow shimmer keeps
 * the air feeling alive without any obvious particle effect.
 *
 * Kept deliberately faint (VISION: "visible but subtle", "understated").
 */

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec2 vUv;

  void main() {
    // gaussian falloff across the width — no visible card edge
    float x = (vUv.x - 0.5) / 0.34;
    float across = exp(-x * x * 2.2);
    // length: ramp up out of the glass, taper off into the nave
    float along = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.5, 1.0, vUv.y));
    // faint drifting shimmer so the shaft breathes like real dusty air
    float shimmer = 0.86 + 0.14 * sin(vUv.y * 7.0 - uTime * 0.5)
                         + 0.06 * sin(vUv.x * 13.0 + uTime * 0.31);
    float a = across * along * shimmer * uIntensity;
    gl_FragColor = vec4(uColor * a, a);
  }
`

interface BeamDef {
  position: [number, number, number]
  rotation: [number, number, number]
  size: [number, number]
  color: string
  intensity: number
}

// Scene 0 — the rose: warm shafts spilling off the glazed wheel toward the
// interior, fanning gently as they cross the air in front of the window.
const ROSE_BEAMS: BeamDef[] = [
  { position: [-1.7, 0.9, 1.7], rotation: [-0.18, 0, 0.42], size: [1.7, 8.5], color: '#e7b475', intensity: 0.1 },
  { position: [0.1, 0.2, 2.0], rotation: [-0.2, 0, -0.16], size: [2.2, 9.5], color: '#efc588', intensity: 0.12 },
  { position: [1.9, 0.8, 1.6], rotation: [-0.18, 0, -0.5], size: [1.5, 8.0], color: '#e4ac66', intensity: 0.09 },
]

// Scene 1 — Milan: steeper shafts raking down out of the clerestory into the
// dark nave, one over each of the lit bays, following the warm glass spill.
const MILAN_BEAMS: BeamDef[] = [
  { position: [-4.8, 1.4, 1.5], rotation: [-0.24, 0, 0.26], size: [1.9, 12.5], color: '#e8b65e', intensity: 0.1 },
  { position: [0, 1.7, 1.7], rotation: [-0.26, 0, 0.0], size: [2.3, 13.5], color: '#efc177', intensity: 0.12 },
  { position: [4.8, 1.4, 1.5], rotation: [-0.24, 0, -0.26], size: [1.9, 12.5], color: '#e8b65e', intensity: 0.1 },
]

export function LightShafts() {
  const [active, setActive] = useState(0)
  const mats = useRef<(THREE.ShaderMaterial | null)[]>([])

  useFrame((state) => {
    const { index } = scenePhase(scrollState.progress, scenes.length)
    const clamped = Math.min(index, scenes.length - 1)
    if (clamped !== active) setActive(clamped)
    const t = state.clock.elapsedTime
    for (const m of mats.current) if (m) m.uniforms.uTime.value = t
  })

  const beams = active === 0 ? ROSE_BEAMS : MILAN_BEAMS
  mats.current = []

  return (
    <group>
      {beams.map((b, i) => (
        <mesh key={i} position={b.position} rotation={b.rotation} renderOrder={10}>
          <planeGeometry args={b.size} />
          <shaderMaterial
            ref={(m) => {
              mats.current[i] = m as THREE.ShaderMaterial | null
            }}
            args={[
              {
                uniforms: {
                  uTime: { value: 0 },
                  uColor: { value: new THREE.Color(b.color) },
                  uIntensity: { value: b.intensity },
                },
                vertexShader,
                fragmentShader,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
              },
            ]}
          />
        </mesh>
      ))}
    </group>
  )
}
