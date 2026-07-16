import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Faint drifting dust, lit as if catching the glow off the glass. Pure
 * procedural points — each sprite is a soft circle drawn in the fragment
 * shader (no texture file), size-attenuated, additively blended.
 */
const vertexShader = /* glsl */ `
  uniform float uTime;
  attribute float aSeed;
  attribute float aSize;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    float drift = mod(uTime * 0.05 + aSeed * 9.0, 7.0) - 3.5;
    p.y += drift;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // clamp hard: a mote that drifts near the camera must never balloon
    // into a huge quad (that's what was blowing out into blocky artifacts
    // and confusing SSAO into painting dark patches on the glass behind it)
    gl_PointSize = clamp(aSize * (110.0 / -mv.z), 0.5, 3.2);
    vAlpha = (1.0 - smoothstep(2.6, 3.5, abs(drift))) * (0.12 + 0.22 * fract(aSeed * 13.1));
  }
`

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d) * vAlpha;
    gl_FragColor = vec4(vec3(0.82, 0.74, 0.58), a);
  }
`

export function DustMotes({ count = 130, radius = 10 }: { count?: number; radius?: number }) {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const { positions, seeds, sizes } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    const sizes = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(Math.random()) * radius
      const a = Math.random() * Math.PI * 2
      positions[i * 3] = Math.cos(a) * r
      positions[i * 3 + 1] = (Math.random() - 0.5) * 7
      // scatter between the window and the wide camera pose, kept well
      // clear of the tight pose (z ~3.4) so perspective size can never
      // spike even before the shader's hard clamp
      positions[i * 3 + 2] = 4.5 + Math.random() * 9.0
      seeds[i] = Math.random()
      sizes[i] = 0.4 + Math.random() * 1.1
    }
    return { positions, seeds, sizes }
  }, [count, radius])

  useFrame((state) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[seeds, 1]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{ uTime: { value: 0 } }}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
