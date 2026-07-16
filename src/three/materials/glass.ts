import * as THREE from 'three'

/**
 * Stained glass: emissive jewel tone with procedural mottling, so panes read
 * as leaded medieval glass with uneven daylight behind them rather than flat
 * fills. Same value-noise trick as the limestone — no texture files.
 */
export function makeStainedGlass(hex: string, emissiveIntensity: number): THREE.MeshStandardMaterial {
  const c = new THREE.Color(hex)
  const mat = new THREE.MeshStandardMaterial({
    color: c.clone().multiplyScalar(0.28),
    emissive: c,
    emissiveIntensity,
    roughness: 0.42,
    side: THREE.DoubleSide,
  })

  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlassPos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGlassPos = (modelMatrix * vec4(position, 1.0)).xyz;',
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGlassPos;

        float glassHash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        float glassNoise(vec3 x) {
          vec3 i = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(glassHash(i), glassHash(i + vec3(1,0,0)), f.x),
                mix(glassHash(i + vec3(0,1,0)), glassHash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(glassHash(i + vec3(0,0,1)), glassHash(i + vec3(1,0,1)), f.x),
                mix(glassHash(i + vec3(0,1,1)), glassHash(i + vec3(1,1,1)), f.x), f.y),
            f.z);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float mottle = glassNoise(vGlassPos * 3.2) * 0.6 + glassNoise(vGlassPos * 11.0) * 0.4;
          totalEmissiveRadiance *= mix(0.55, 1.35, mottle);
        }`,
      )
  }

  return mat
}
