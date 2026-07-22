import * as THREE from 'three'

export interface LimestoneOptions {
  color?: string
  roughness?: number
  metalness?: number
  /** strength of the procedural grain/erosion bump (normal perturbation) */
  bump?: number
}

/**
 * Aged French limestone (pierre de taille, after Paris/Amiens facing stone),
 * dressed to read as ASH GREY: the stone itself is neutral, and all warmth in
 * the render comes from the light reflecting off it (the warm gold key), never
 * from the material's own pigment.
 *
 * The whole surface is procedural — no texture files — but the point of this
 * pass is that it must NOT read as procedural. Three things break the "obvious
 * noise" look:
 *
 *   1. Domain-warped, multi-octave large-scale drift: broad blotches of lighter
 *      and cooler ash-grey stone over ~2–4 metres, so no repeating cell is
 *      legible. The drift is tonal (light/dark), not coloured — the hue stays
 *      neutral grey. Fine grain is subtle and rides on top.
 *   2. Irregular ashlar: courses of varying height, blocks of varying width,
 *      chipped/eroded joints (not ruler-straight), per-block tone, and edges
 *      that round and recess into the mortar via the bump field — so the wall
 *      reads as laid, weathered blocks, not a tiled pattern.
 *   3. Weathering placed where it historically belongs: dirt washes DOWN from
 *      horizontal joints and ledges; grime and moss collect only in the joints
 *      (recesses) and low near the base, patchily — never as an even wash.
 *
 * Lower roughness / a little metalness (used for the carved mouldings) gives a
 * worn, hand-dressed sheen that catches the raking light in a highlight.
 */
export function makeLimestone(opts: LimestoneOptions = {}): THREE.MeshStandardMaterial {
  const bump = opts.bump ?? 0.05
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color ?? '#a7a7a4',
    roughness: opts.roughness ?? 0.93,
    metalness: opts.metalness ?? 0.0,
  })

  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLimePos;')
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
        }

        float limeFbm(vec3 p) {
          float s = 0.0, a = 0.5;
          for (int i = 0; i < 5; i++) { s += a * limeNoise(p); p = p * 2.02 + 1.7; a *= 0.5; }
          return s;
        }

        // domain warp — pushes the sample point around by a low-frequency
        // noise field, so the underlying grid of the value noise is never
        // legible and features read as organic mineral drift
        vec3 limeWarp(vec3 p, float amt) {
          return p + amt * (vec3(limeNoise(p), limeNoise(p + 11.3), limeNoise(p + 27.1)) - 0.5);
        }

        // Irregular ashlar. Courses of jittered height, blocks of per-course
        // width, mortar joints roughened by noise so no edge is straight.
        // Returns joint mask (1 = in mortar), per-block hash, and cell uv.
        void limeAshlar(vec3 p, out float joint, out float blockH, out vec2 cell) {
          float course = 0.82;
          // wander the course line so beds are not perfectly level
          float yy = p.y + (limeNoise(vec3(p.x * 0.55, 0.0, 3.0)) - 0.5) * 0.12;
          float row = floor(yy / course);
          // per-course horizontal shove + per-course block width
          float wob = (limeNoise(vec3(row * 3.1, 0.0, 1.0)) - 0.5) * 0.8;
          float colW = 1.55 * mix(0.78, 1.24, limeHash(vec3(row, 7.0, 2.0)));
          float cx = p.x / colW + mod(row, 2.0) * 0.5 + wob;
          float col = floor(cx);
          float fy = fract(yy / course);
          float fx = fract(cx);
          // chipped joints: perturb the edge distance so mortar lines wobble
          float chip = (limeFbm(p * 6.0) - 0.5) * 0.020;
          float dJ = min(min(fy, 1.0 - fy) * course, min(fx, 1.0 - fx) * colW) + chip;
          joint = 1.0 - smoothstep(0.010, 0.05, dJ);
          blockH = limeHash(vec3(col, row, 5.0));
          cell = vec2(fx, fy);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float r = length(vLimePos.xy);

          // ---- large-scale mineral drift (domain-warped, multi-octave) ----
          // Neutral, ash-grey drift: the blotches vary in *tone* (light/dark)
          // and only a hair in temperature, never in pigment. Any warmth on the
          // stone is the gold key reflecting off it, not the stone's own colour.
          vec3 mp = limeWarp(vLimePos * 0.22, 1.4);
          float m1 = limeFbm(mp);
          float m2 = limeFbm(mp * 0.5 + 7.0);
          vec3 pale = vec3(1.03, 1.03, 1.03); // lighter ash
          vec3 cool = vec3(0.94, 0.95, 0.97); // cooler, faintly blue-grey
          vec3 warm = vec3(1.02, 1.01, 0.99); // barely-there mineral warmth
          vec3 tint = mix(cool, pale, smoothstep(0.30, 0.62, m1));
          tint = mix(tint, warm, smoothstep(0.60, 0.88, m2) * 0.6);
          diffuseColor.rgb *= tint * mix(0.86, 1.10, m1 * 0.6 + m2 * 0.4);

          // ---- fine grain, subtle, riding on top ----
          float grain = limeFbm(vLimePos * 4.5) * 0.6 + limeNoise(vLimePos * 15.0) * 0.4;
          diffuseColor.rgb *= mix(0.93, 1.05, grain);

          // ---- irregular ashlar on the wall face (beyond the splayed reveal) ----
          float joint = 0.0;
          if (r > 5.62) {
            float blockH; vec2 cell;
            limeAshlar(vLimePos, joint, blockH, cell);
            // per-block tone, and a hint of edge-worn lightening at block faces
            diffuseColor.rgb *= mix(0.9, 1.07, blockH);
            // grime settles in the mortar joints
            diffuseColor.rgb *= 1.0 - joint * 0.45;
          }

          // ---- radial voussoir joints around the enclosing ring / splay ----
          if (r > 4.42 && r < 5.62) {
            float a = atan(vLimePos.y, vLimePos.x);
            float seg = a / 0.3926990817; // 16 voussoirs (22.5 deg each)
            float fa = fract(seg);
            float dJoint = min(fa, 1.0 - fa) * 0.3926990817 * r;
            float vj = 1.0 - smoothstep(0.012, 0.045, dJoint + (limeNoise(vLimePos * 8.0) - 0.5) * 0.01);
            diffuseColor.rgb *= mix(0.92, 1.05, limeHash(vec3(floor(seg), 2.0, 8.0)));
            diffuseColor.rgb *= 1.0 - vj * 0.4;
            joint = max(joint, vj);
          }

          // ---- weathering: dirt washing DOWN from ledges, stronger low ----
          float streak = limeNoise(vec3(vLimePos.x * 3.0, vLimePos.y * 0.16, vLimePos.z * 3.0));
          streak *= streak;
          float low = clamp((-1.0 - vLimePos.y) * 0.10, 0.0, 0.7);
          diffuseColor.rgb *= 1.0 - streak * (0.08 + low * 0.30);

          // ---- moss/dirt: ONLY in recesses (joints) and low near the base,
          //      and patchy — never an even coat ----
          float lowMoss = smoothstep(-1.5, -4.5, vLimePos.y);
          float mossPatch = smoothstep(0.45, 0.78, limeFbm(vLimePos * 1.1 + 4.0));
          float mossMask = joint * (0.20 + lowMoss * 0.95) * mossPatch;
          vec3 moss = vec3(0.15, 0.18, 0.11);
          diffuseColor.rgb = mix(diffuseColor.rgb, moss, clamp(mossMask, 0.0, 0.55));
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        {
          // eroded/mossy hollows read rougher; wind-polished faces a touch less
          float rr = length(vLimePos.xy);
          float j = 0.0;
          if (rr > 5.62) { float b; vec2 c; limeAshlar(vLimePos, j, b, c); }
          roughnessFactor = clamp(
            roughnessFactor
              - limeNoise(vLimePos * 8.0) * 0.16
              + limeNoise(vLimePos * 24.0) * 0.12
              + j * 0.12,
            0.0, 1.0);
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // Height field combining block bevels (joints recess, faces round),
          // broad erosion and fine pitting. Perturb the shading normal by its
          // world-space gradient so light rakes over real relief, not a flat
          // noise wash.
          float bs = ${bump.toFixed(3)};
          float e = 0.02;
          #define LIME_H(P) ( \
            ((length((P).xy) > 5.62) ? (-limeAshlarJoint(P) * 0.55) : 0.0) \
            + (limeFbm((P) * 4.5) - 0.5) * 0.16 \
            + (limeNoise((P) * 20.0) - 0.5) * 0.10 )
          float h0 = LIME_H(vLimePos);
          vec3 grad = vec3(
            LIME_H(vLimePos + vec3(e, 0.0, 0.0)) - h0,
            LIME_H(vLimePos + vec3(0.0, e, 0.0)) - h0,
            LIME_H(vLimePos + vec3(0.0, 0.0, e)) - h0
          ) / e;
          vec3 gv = (viewMatrix * vec4(grad, 0.0)).xyz;
          gv -= normal * dot(gv, normal); // keep tangent to the surface
          normal = normalize(normal - gv * bs);
        }`,
      )

    // helper that returns just the ashlar joint mask, used by the bump macro
    shader.fragmentShader = shader.fragmentShader.replace(
      'void limeAshlar(vec3 p, out float joint, out float blockH, out vec2 cell) {',
      `float limeAshlarJoint(vec3 p) {
          float course = 0.82;
          float yy = p.y + (limeNoise(vec3(p.x * 0.55, 0.0, 3.0)) - 0.5) * 0.12;
          float row = floor(yy / course);
          float wob = (limeNoise(vec3(row * 3.1, 0.0, 1.0)) - 0.5) * 0.8;
          float colW = 1.55 * mix(0.78, 1.24, limeHash(vec3(row, 7.0, 2.0)));
          float cx = p.x / colW + mod(row, 2.0) * 0.5 + wob;
          float fy = fract(yy / course);
          float fx = fract(cx);
          float chip = (limeFbm(p * 6.0) - 0.5) * 0.020;
          float dJ = min(min(fy, 1.0 - fy) * course, min(fx, 1.0 - fx) * colW) + chip;
          return 1.0 - smoothstep(0.010, 0.05, dJ);
        }
        void limeAshlar(vec3 p, out float joint, out float blockH, out vec2 cell) {`,
    )
  }

  return mat
}
