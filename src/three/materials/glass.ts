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
        }

        // Lead came lattice: quarries laid out in polar space (radial bands x
        // arc-length segments, matching how a rose is actually leaded), with
        // noise-wobbled joints. Returns (came mask, quarry cell hash).
        vec2 glassCame(vec3 pos) {
          float lr = length(pos.xy);
          vec2 rs;
          if (lr < 1.15) {
            // oculus: polar coords degenerate at the pole — lead the centre
            // pane as a diagonal lattice instead (switch radius lies inside
            // the stone ring, so the change of pattern is never visible)
            rs = vec2(pos.x + pos.y, pos.x - pos.y) * 0.7071 / 0.24;
          } else {
            float th = abs(atan(pos.y, pos.x)); // mirrored: hides the atan seam
            rs = vec2(lr / 0.26, th * lr / 0.22);
          }
          rs += (vec2(glassNoise(pos * 2.7), glassNoise(pos * 3.1 + 7.3)) - 0.5) * 0.4;
          vec2 f = fract(rs);
          float dEdge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
          float came = 1.0 - smoothstep(0.032, 0.075, dEdge);
          float cellH = glassHash(vec3(floor(rs), 3.7));
          return vec2(came, cellH);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 cq = glassCame(vGlassPos);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.045, 0.05), cq.x);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float mottle = glassNoise(vGlassPos * 3.2) * 0.6 + glassNoise(vGlassPos * 11.0) * 0.4;
          totalEmissiveRadiance *= mix(0.55, 1.35, mottle);
          vec2 cq = glassCame(vGlassPos);
          // per-quarry brightness and slight hue drift — hand-blown panes
          float h2 = fract(cq.y * 43.758);
          totalEmissiveRadiance *= mix(0.68, 1.32, cq.y);
          totalEmissiveRadiance *= mix(vec3(1.0), vec3(0.92 + 0.16 * h2, 1.0, 1.08 - 0.16 * h2), 0.45);
          // lead is opaque
          totalEmissiveRadiance *= 1.0 - cq.x * 0.97;
        }`,
      )
  }

  return mat
}
