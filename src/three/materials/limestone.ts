import * as THREE from 'three'

export interface LimestoneOptions {
  color?: string
  roughness?: number
  metalness?: number
  /** strength of the stone's micro-relief (pitting, tooling) */
  bump?: number
  /**
   * Masonry drawn on the surface: 'rose' = ashlar wall with a voussoir ring
   * around the rose; 'ashlar' = ashlar everywhere; 'none' = monolithic
   * (tracery, mouldings, shafts).
   */
  masonry?: 'rose' | 'ashlar' | 'none'
}

/**
 * Dressed French limestone, as it reads inside a cathedral.
 *
 * The surface detail is PHOTOGRAPHIC: tools/build_stone.py turns photos of
 * the limestone piers of Saint-Denis into a seamless colour-variation tile
 * and a micro-relief normal map (pitting, claw-tool marks, soft stains). They
 * are projected from world space along all three axes (triplanar), so every
 * surface — wall, tracery, splay, hole walls — gets the same real stone.
 *
 * On top of that, the masonry LAYOUT is drawn in the shader, because it is
 * construction, not texture:
 *   - ashlar on the wall: level courses (~0.5 m), blocks of varied length
 *     with alternating joints, thin lime-mortar joints barely lighter than the
 *     stone and only slightly recessed — never dark brick lines;
 *   - each block samples the tile at its own offset and carries its own
 *     slight tone, the way stones from different beds of a quarry differ;
 *   - 16 voussoirs around the rose's enclosing ring.
 * Weathering is interior: faint soot settling high and in recesses. No moss.
 */

let detailTex: THREE.Texture | null = null
let reliefTex: THREE.Texture | null = null
function stoneTextures(): [THREE.Texture, THREE.Texture] {
  if (!detailTex || !reliefTex) {
    const loader = new THREE.TextureLoader()
    detailTex = loader.load(`${import.meta.env.BASE_URL}textures/limestone-detail.jpg`)
    // a ratio around 1 (stored as 0.5), not a colour: read it as plain data
    detailTex.colorSpace = THREE.NoColorSpace
    reliefTex = loader.load(`${import.meta.env.BASE_URL}textures/limestone-normal.jpg`)
    for (const t of [detailTex, reliefTex]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.anisotropy = 8
    }
  }
  return [detailTex, reliefTex]
}

const COMMON = /* glsl */ `
varying vec3 vLimePos;
varying vec3 vLimeNrm;
uniform sampler2D uStoneDetail;
uniform sampler2D uStoneRelief;

float limeHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float limeNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(limeHash(i), limeHash(i + vec3(1,0,0)), f.x), mix(limeHash(i + vec3(0,1,0)), limeHash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(limeHash(i + vec3(0,0,1)), limeHash(i + vec3(1,0,1)), f.x), mix(limeHash(i + vec3(0,1,1)), limeHash(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}
float limeFbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * limeNoise(p); p = p * 2.02 + 1.7; a *= 0.5; }
  return s;
}

const float LIME_TILE = 2.2;      // world units per photo tile (~3 m)
const float LIME_COURSE = 0.38;   // course height (~0.5 m)

// Ashlar on the wall plane. joint: 1 in the mortar; id: per-block hash;
// edge: distance (world units) to the nearest joint.
void limeAshlar(vec2 p, out float joint, out float id, out float edge) {
  float row = floor(p.y / LIME_COURSE);
  float len = mix(0.7, 1.4, limeHash(vec3(row, 7.0, 2.0)));
  float cx = p.x / len + limeHash(vec3(row, 3.0, 9.0));
  float col = floor(cx);
  float fy = fract(p.y / LIME_COURSE);
  float fx = fract(cx);
  edge = min(min(fy, 1.0 - fy) * LIME_COURSE, min(fx, 1.0 - fx) * len);
  joint = 1.0 - smoothstep(0.004, 0.009, edge);
  id = limeHash(vec3(col, row, 5.0));
}

// Voussoirs of the rose's enclosing ring and splay.
void limeVoussoir(vec2 p, out float joint, out float id, out float edge) {
  float r = length(p);
  float seg = atan(p.y, p.x) / 0.3926990817; // 16 x 22.5 deg
  float fa = fract(seg);
  edge = min(fa, 1.0 - fa) * 0.3926990817 * r;
  joint = 1.0 - smoothstep(0.004, 0.009, edge);
  id = limeHash(vec3(floor(seg), 2.0, 8.0));
}

// Masonry for this fragment: which stone it belongs to and how near a joint.
// Joints narrower than a pixel only alias into hard lines; let them fade
// as the camera pulls back, as real joints vanish at a distance.
float limeJointFade(vec3 p) {
  float px = length(fwidth(p));
  return smoothstep(0.03, 0.008, px);
}

void limeMasonry(vec3 p, out float joint, out float id, out float edge) {
  joint = 0.0; id = 0.5; edge = 1.0;
#if LIME_MASONRY == 1
  float r = length(p.xy);
  if (r > 5.62) limeAshlar(p.xy, joint, id, edge);
  else if (r > 4.86) limeVoussoir(p.xy, joint, id, edge);
#elif LIME_MASONRY == 2
  limeAshlar(p.xy, joint, id, edge);
#endif
}

// Triplanar weights from the world normal.
vec3 limeTriW(vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0));
  return w / (w.x + w.y + w.z);
}
`

export function makeLimestone(opts: LimestoneOptions = {}): THREE.MeshStandardMaterial {
  const bump = opts.bump ?? 0.6
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color ?? '#b5b2aa',
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0.0,
  })
  const [detail, relief] = stoneTextures()
  const masonry = opts.masonry ?? 'none'
  mat.defines = { LIME_MASONRY: masonry === 'rose' ? 1 : masonry === 'ashlar' ? 2 : 0 }

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uStoneDetail = { value: detail }
    shader.uniforms.uStoneRelief = { value: relief }

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLimePos;\nvarying vec3 vLimeNrm;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLimePos = (modelMatrix * vec4(position, 1.0)).xyz;
        vLimeNrm = normalize(mat3(modelMatrix) * objectNormal);`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + COMMON)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float joint, id, edge;
          limeMasonry(vLimePos, joint, id, edge);
          float jf = limeJointFade(vLimePos);
          joint *= jf;
          // each block samples the photo tile at its own offset
          vec3 off = vec3(id * 7.31, fract(id * 13.7) * 5.1, fract(id * 3.9) * 3.3);
          vec3 q = (vLimePos + off) / LIME_TILE;
          vec3 w = limeTriW(normalize(vLimeNrm));
          vec3 det = texture2D(uStoneDetail, q.yz).rgb * w.x
                   + texture2D(uStoneDetail, q.xz).rgb * w.y
                   + texture2D(uStoneDetail, q.xy).rgb * w.z;
          diffuseColor.rgb *= det * 2.0;

          // per-stone tone: different beds of the quarry, a few % apart
          diffuseColor.rgb *= mix(0.93, 1.06, id) * mix(vec3(1.0), vec3(1.02, 1.0, 0.97), fract(id * 5.3));
          // broad, soft variation across the wall so no two areas match
          diffuseColor.rgb *= mix(0.94, 1.05, limeFbm(vLimePos * 0.35));
          // arrises: a touch darker right at the block edge (worn, dusty)
          diffuseColor.rgb *= mix(1.0 - 0.03 * jf, 1.0, smoothstep(0.0, 0.04, edge));
          // lime mortar: close to the stone, slightly paler and flatter
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.72, 0.68) * diffuseColor.a, joint * 0.35);

          // interior weathering: faint soot settling high up and in recesses
          float soot = smoothstep(2.0, 9.0, vLimePos.y) * 0.10
                     + (1.0 - smoothstep(0.0, 0.03, edge)) * 0.06;
          soot *= 0.6 + 0.8 * limeFbm(vLimePos * vec3(1.5, 0.4, 1.5));
          diffuseColor.rgb *= 1.0 - soot;
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (limeNoise(vLimePos * 9.0) - 0.5) * 0.08, 0.0, 1.0);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          float joint, id, edge;
          limeMasonry(vLimePos, joint, id, edge);
          vec3 off = vec3(id * 7.31, fract(id * 13.7) * 5.1, fract(id * 3.9) * 3.3);
          vec3 q = (vLimePos + off) / LIME_TILE;
          vec3 N = normalize(vLimeNrm);
          vec3 w = limeTriW(N);
          // photographed micro-relief, triplanar (whiteout-style blend):
          // each projection's tangent xy tilts the normal along its two axes
          vec2 tx = (texture2D(uStoneRelief, q.yz).xy * 2.0 - 1.0);
          vec2 ty = (texture2D(uStoneRelief, q.xz).xy * 2.0 - 1.0);
          vec2 tz = (texture2D(uStoneRelief, q.xy).xy * 2.0 - 1.0);
          vec3 tilt = vec3(0.0, tx.x, tx.y) * w.x
                    + vec3(ty.x, 0.0, ty.y) * w.y
                    + vec3(tz.x, tz.y, 0.0) * w.z;
          // joints: the block arris rounds over into a shallow mortar bed
          float e = 0.012;
          float jx, jy, ix, iy, ex, ey;
          limeMasonry(vLimePos + vec3(e, 0.0, 0.0), jx, ix, ex);
          limeMasonry(vLimePos + vec3(0.0, e, 0.0), jy, iy, ey);
          float h0 = smoothstep(0.0, 0.03, edge);
          vec2 jg = vec2(smoothstep(0.0, 0.03, ex) - h0, smoothstep(0.0, 0.03, ey) - h0) / e;
          tilt += vec3(-jg * 0.006, 0.0) * abs(N.z) * limeJointFade(vLimePos);
          tilt *= ${bump.toFixed(3)};
          vec3 tv = (viewMatrix * vec4(tilt, 0.0)).xyz;
          tv -= normal * dot(tv, normal);
          normal = normalize(normal + tv);
        }`,
      )
  }
  mat.customProgramCacheKey = () => `limestone_v2_${bump.toFixed(3)}_${masonry}`
  return mat
}
