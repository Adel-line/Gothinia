import * as THREE from 'three'

/**
 * Medieval stained glass.
 *
 * There is no light source or geometry behind the glazing in this scene, so we
 * cannot sample true refracted transmission — a physical `transmission`
 * material would render black. Instead the sunlight that has passed *through*
 * the coloured glass is authored as a heavily modulated emissive tint. The
 * point, though, is that it must read as a lit physical pane, NOT a glowing
 * screen. Four things do that work:
 *
 *   1. Deep pot-metal colour and a low, below-bloom brightness — no neon, no
 *      blown-out halo. Thin glass burns a little brighter, thick glass goes
 *      deep and saturated.
 *   2. Uneven density: broad thickness drift, stretched reamy striations, and
 *      sparse seed-bubbles/stones — the flaws of hand-blown cylinder glass.
 *   3. A slow rake of brightness toward the sun side, so it feels like
 *      daylight crossing the window rather than uniform self-illumination.
 *   4. A Fresnel surface term that dims transmission at grazing angles and
 *      adds a faint cool sky sheen — the tell that it is a glazed surface.
 *
 * Same value-noise trick as the limestone — no texture files.
 *
 * `hex` is the nominal glass colour; `strength` scales its transmission (the
 * callers still pass their old emissive-intensity numbers, which are scaled
 * right down here so nothing else has to change).
 */
export function makeStainedGlass(hex: string, strength: number): THREE.MeshStandardMaterial {
  const nominal = new THREE.Color(hex)

  // Deepen toward real medieval glass: keep the hue and most of the chroma,
  // but drop the lightness so cobalt/ruby/emerald read as deep pot-metal
  // rather than lit primaries.
  const hsl = { h: 0, s: 0, l: 0 }
  nominal.getHSL(hsl)
  const deep = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.96), hsl.l * 0.82)

  const mat = new THREE.MeshStandardMaterial({
    // reflected (unlit) colour — very dark, so in shadow the pane reads as
    // near-black glass, not a coloured light
    color: deep.clone().multiplyScalar(0.2),
    emissive: deep,
    // scaled far below the old 2.2–3.5: most of the pane now sits under the
    // bloom threshold, killing the neon glow
    emissiveIntensity: strength * 0.34,
    roughness: 0.5,
    metalness: 0.0,
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

        // fractal drift — glass thickness varies smoothly across a quarry
        float glassFbm(vec3 p) {
          float s = 0.0, a = 0.55;
          for (int i = 0; i < 4; i++) { s += a * glassNoise(p); p *= 2.03; a *= 0.5; }
          return s;
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
          float came = 1.0 - smoothstep(0.030, 0.085, dEdge);
          float cellH = glassHash(vec3(floor(rs), 3.7));
          return vec2(came, cellH);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // lead network reads near-black in reflected light
          vec2 cq = glassCame(vGlassPos);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02, 0.02, 0.024), cq.x);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec2 cq = glassCame(vGlassPos);

          // --- uneven density (uneven glass thickness) ---
          float thick  = glassFbm(vGlassPos * 1.6);
          // reamy striations: noise stretched along one axis, the streaky pull
          // of blown cylinder glass
          float streak = glassNoise(vec3(vGlassPos.x * 1.05, vGlassPos.y * 8.0, vGlassPos.z));
          float fine   = glassNoise(vGlassPos * 24.0);
          float density = clamp(thick * 0.7 + streak * 0.2 + fine * 0.1, 0.0, 1.0);

          // seed-bubbles and stones: sparse tiny bright & dark flecks
          float bub  = smoothstep(0.88, 0.99, glassNoise(vGlassPos * 44.0)) * 0.5;
          float dark = smoothstep(0.88, 0.99, glassNoise(vGlassPos * 39.0 + 11.0)) * 0.4;

          // thin glass transmits brighter (sun burning through); thick glass
          // goes deep. bubbles punch tiny highlights, stones tiny shadows.
          float trans = mix(0.5, 1.1, density) + bub - dark;

          // slow rake toward the sun side (upper-left), as if the low
          // afternoon sun is stronger across that part of the glazing
          float sun = dot(normalize(vGlassPos.xy + 0.001), normalize(vec2(-1.0, 1.0)));
          trans *= mix(0.82, 1.16, clamp(sun * 0.5 + 0.5, 0.0, 1.0));

          // per-quarry hand-blown variation
          float h2 = fract(cq.y * 43.758);
          trans *= mix(0.85, 1.1, cq.y);

          vec3 col = totalEmissiveRadiance; // deep glass tint * intensity
          // saturation follows density: thick glass deepens, thin desaturates
          // slightly (the sun washes the colour where the glass is thinnest)
          float g = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(col, vec3(g), (1.0 - density) * 0.22);
          col *= max(trans, 0.0);
          // subtle per-quarry hue drift — no two pieces of glass match
          col *= mix(vec3(1.0), vec3(0.94 + 0.12 * h2, 1.0, 1.06 - 0.12 * h2), 0.3);

          // --- glass as a surface, not a lamp ---
          float fres = pow(clamp(1.0 - dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 4.0);
          col *= mix(1.0, 0.6, fres);         // transmission falls off at grazing
          col += fres * vec3(0.05, 0.06, 0.09); // faint cool sky sheen

          // lead came is opaque
          col *= 1.0 - cq.x * 0.98;

          totalEmissiveRadiance = col;
        }`,
      )
  }

  return mat
}
