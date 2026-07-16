import * as THREE from 'three'

export interface LimestoneOptions {
  color?: string
  roughness?: number
  metalness?: number
}

/**
 * Warm limestone. Surface variation is procedural value noise injected into
 * the standard material's fragment shader — no texture files anywhere.
 * Lower roughness / added metalness (used for the carved mouldings) gives a
 * worn, hand-dressed sheen that catches directional light in a highlight
 * rather than scattering it flat, without changing the noise detail itself.
 */
export function makeLimestone(opts: LimestoneOptions = {}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color ?? '#b3a488',
    roughness: opts.roughness ?? 0.93,
    metalness: opts.metalness ?? 0.0,
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

          float r = length(vLimePos.xy);

          // ashlar coursing on the wall face (beyond the splayed reveal):
          // offset rows of blocks, darkened mortar joints, per-block tint
          if (r > 5.62) {
            float row = floor(vLimePos.y / 0.82);
            float wob = (limeNoise(vec3(row * 3.1, 0.0, 1.0)) - 0.5) * 0.7;
            float colW = 1.55;
            float cx = vLimePos.x / colW + mod(row, 2.0) * 0.5 + wob;
            float col = floor(cx);
            float fy = fract(vLimePos.y / 0.82);
            float fx = fract(cx);
            float dJoint = min(min(fy, 1.0 - fy) * 0.82, min(fx, 1.0 - fx) * colW);
            float joint = 1.0 - smoothstep(0.012, 0.04, dJoint);
            float blockTint = limeHash(vec3(col, row, 5.0));
            diffuseColor.rgb *= mix(0.9, 1.06, blockTint);
            diffuseColor.rgb *= 1.0 - joint * 0.42;
          }

          // radial voussoir joints around the enclosing ring and splay
          if (r > 4.42 && r < 5.62) {
            float a = atan(vLimePos.y, vLimePos.x);
            float seg = a / 0.3926990817; // 16 voussoirs (22.5 deg each)
            float fa = fract(seg);
            float dJoint = min(fa, 1.0 - fa) * 0.3926990817 * r;
            float joint = 1.0 - smoothstep(0.012, 0.038, dJoint);
            diffuseColor.rgb *= mix(0.92, 1.05, limeHash(vec3(floor(seg), 2.0, 8.0)));
            diffuseColor.rgb *= 1.0 - joint * 0.38;
          }

          // vertical weathering streaks, heavier low on the wall
          float streak = limeNoise(vec3(vLimePos.x * 2.6, vLimePos.y * 0.22, vLimePos.z * 2.6));
          float lowness = clamp((2.0 - vLimePos.y) * 0.12, 0.0, 0.7);
          diffuseColor.rgb *= 1.0 - streak * streak * lowness * 0.35;
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
