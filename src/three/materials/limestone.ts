import * as THREE from 'three'

/**
 * Warm limestone. Surface variation is procedural value noise injected into
 * the standard material's fragment shader — no texture files anywhere.
 */
export function makeLimestone(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: '#cfc0a6',
    roughness: 0.93,
    metalness: 0.0,
  })

  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vLimePos;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvLimePos = (modelMatrix * vec4(position, 1.0)).xyz;',
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vLimePos;

        float limeHash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        float limeNoise(vec3 x) {
          vec3 i = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(limeHash(i), limeHash(i + vec3(1,0,0)), f.x),
                mix(limeHash(i + vec3(0,1,0)), limeHash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(limeHash(i + vec3(0,0,1)), limeHash(i + vec3(1,0,1)), f.x),
                mix(limeHash(i + vec3(0,1,1)), limeHash(i + vec3(1,1,1)), f.x), f.y),
            f.z);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // two octaves of fine grain plus a broad warm/cool drift
          float grain = limeNoise(vLimePos * 6.0) * 0.65 + limeNoise(vLimePos * 18.0) * 0.35;
          float drift = limeNoise(vLimePos * 0.55);
          diffuseColor.rgb *= mix(0.82, 1.10, grain);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.04, 1.0, 0.92), drift * 0.5);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor - limeNoise(vLimePos * 9.0) * 0.12, 0.0, 1.0);`,
      )
  }

  return mat
}
