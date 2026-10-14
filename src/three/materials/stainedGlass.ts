import * as THREE from 'three'
import { DEPTH_RANGE, DIST_RANGE, type GlassRect } from '../glassLayout'

/**
 * Drawn 13th-century stained glass.
 *
 * Rather than a photograph (which, enlarged, turns blurry and smeared), the
 * glass is composed per pixel the way a glazier composed it, so every lead
 * line stays sharp at any distance. A layout texture (glassLayout.ts) tells
 * each point how deep it lies inside its opening and which opening it is in;
 * from that, every opening gets, following its own outline:
 *
 *   - a lead came where the glass meets the stone;
 *   - a ruby border band, cut into a few long pieces;
 *   - a cobalt ground of large quarries on a diagonal lattice;
 *   - in the larger openings, a medallion: a gold ring round one field of
 *     colour (ruby, emerald, murrey or gold), in large pieces;
 *   - optionally, the iron saddle bars that cross a lancet.
 *
 * Deliberately simple: colour and rhythm, no figures. Most openings are
 * cobalt-ground, one in four ruby, as in the Paris roses, where blue
 * dominates. Each piece varies a little in depth of colour, as hand-blown
 * pot-metal glass does.
 *
 * Lighting: the glass is a light source seen in transmission, so its colour
 * goes out through emissive while the diffuse term stays near black.
 */

const GLSL = /* glsl */ `
varying vec3 vGlassPos;
uniform sampler2D uLayout;
uniform vec4 uRect;      // x0, y0, w, h (world)
uniform float uSaddle;   // > 0: saddle-bar spacing (world units)

const vec3 COBALT  = vec3(0.035, 0.07, 0.42);
const vec3 COBALT2 = vec3(0.06, 0.12, 0.48);
const vec3 RUBY    = vec3(0.42, 0.015, 0.03);
const vec3 GOLD    = vec3(0.62, 0.32, 0.04);
const vec3 EMERALD = vec3(0.03, 0.22, 0.08);
const vec3 MURREY  = vec3(0.22, 0.04, 0.24);

float sgHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 sgHash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}
float sgNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sgHash(i), sgHash(i + vec2(1, 0)), f.x), mix(sgHash(i + vec2(0, 1)), sgHash(i + vec2(1, 1)), f.x), f.y);
}

// Voronoi pieces: x = distance to the nearest piece edge (cell units),
// yz = the piece's cell id.
vec3 sgPieces(vec2 x) {
  vec2 n = floor(x), f = fract(x), mg = vec2(0.0), mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + sgHash2(n + g) * 0.8 + 0.1 - f;
    float dd = dot(r, r);
    if (dd < md) { md = dd; mr = r; mg = g; }
  }
  md = 8.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    vec2 r = g + sgHash2(n + g) * 0.8 + 0.1 - f;
    if (dot(mr - r, mr - r) > 1e-5) md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  return vec3(md, n + mg);
}

// thin anti-aliased line where v crosses 0, half-width w (same units as v)
float sgLine(float v, float w) {
  float aa = fwidth(v) + 1e-5;
  return 1.0 - smoothstep(w, w + aa, abs(v));
}

`

const MAIN = /* glsl */ `
{
  vec2 P = vGlassPos.xy;
  vec4 L = texture2D(uLayout, (P - uRect.xy) / uRect.zw);
  float d = L.r * ${DIST_RANGE.toFixed(3)};     // world units to the stone
  float t = L.g;                                 // 0 edge .. 1 core
  float deep = L.a * ${DEPTH_RANGE.toFixed(3)}; // this opening's depth
  // most openings cobalt-ground; one in four ruby, for the rhythm
  float scheme = step(0.75, L.b);
  float hue = fract(L.b * 7.31);                 // medallion colour per opening

  vec3 ground = mix(COBALT, RUBY, scheme);
  vec3 rim    = mix(RUBY, COBALT, scheme);
  vec3 medCol = hue < 0.45 ? RUBY : (hue < 0.7 ? EMERALD : (hue < 0.85 ? MURREY : GOLD));
  if (scheme > 0.5 && medCol == RUBY) medCol = COBALT2;

  float lead = 0.0;
  vec3 col;
  float pieceH;
  float inner = 1.0;  // 0 at a piece's lead, rising inward

  float bw = clamp(deep * 0.28, 0.025, 0.06);    // border width
  bool hasMed = deep > 0.15;
  float medIn = 0.6, medBand = 0.08;             // in t units

  if (d < bw) {
    // ---- border: one colour, cut into a few long pieces -------------------
    vec3 pc = sgPieces(P / 0.09);
    pieceH = sgHash(pc.yz);
    col = rim;
    inner = pc.x;
    lead = max(lead, sgLine(pc.x, 0.03));
  } else if (hasMed && t > medIn) {
    if (t < medIn + medBand) {
      // ---- medallion ring: a band of gold ----------------------------------
      vec3 pc = sgPieces(P / 0.08);
      pieceH = sgHash(pc.yz);
      col = GOLD * 0.85;
      inner = pc.x;
      lead = max(lead, sgLine(pc.x, 0.035));
    } else {
      // ---- medallion field: one colour, in large pieces --------------------
      vec3 pc = sgPieces(P / 0.11);
      pieceH = sgHash(pc.yz + 7.0);
      col = medCol;
      inner = pc.x;
      lead = max(lead, sgLine(pc.x, 0.025));
    }
    lead = max(lead, sgLine(t - medIn, 0.012));
    lead = max(lead, sgLine(t - medIn - medBand, 0.012));
  } else {
    // ---- ground: large quarries on a diagonal lattice ---------------------
    vec2 q = mat2(0.7071, -0.7071, 0.7071, 0.7071) * P / 0.16;
    vec2 cell = floor(q);
    vec2 fq = fract(q) - 0.5;
    float toLattice = 0.5 - max(abs(fq.x), abs(fq.y));   // 0 on the lattice
    pieceH = sgHash(cell);
    col = ground;
    inner = toLattice * 2.0;
    lead = max(lead, sgLine(toLattice, 0.012));
  }

  // lead came along the stone, and between border and ground
  lead = max(lead, 1.0 - smoothstep(0.008, 0.008 + fwidth(d) + 1e-5, d));
  lead = max(lead, sgLine(d - bw, 0.004));
  // iron saddle bars across a lancet
  if (uSaddle > 0.0) lead = max(lead, sgLine(fract(P.y / uSaddle + 0.5) - 0.5, 0.012 / uSaddle));

  // grisaille wash: painted shading that deepens toward each piece's lead,
  // so the light seems to sit inside the glass rather than on it
  col *= mix(0.45, 1.0, smoothstep(0.0, 0.35, inner));
  col *= mix(0.6, 1.0, smoothstep(0.0, 0.05, d));
  // hand-blown pot-metal: each piece a little deeper or paler, with streaks
  col *= 0.86 + 0.28 * pieceH;
  col *= 0.88 + 0.24 * sgNoise(P * vec2(4.0, 26.0) + pieceH * 17.0);
  // the low sun sits upper left; that side carries a touch more light
  float sun = dot(normalize(P + 0.001), normalize(vec2(-1.0, 1.0)));
  col *= mix(0.9, 1.1, clamp(sun * 0.5 + 0.5, 0.0, 1.0));

  totalEmissiveRadiance = col * (1.0 - 0.96 * lead) * emissive;
}
`

export function makeStainedGlassMaterial(
  layout: THREE.Texture,
  rect: GlassRect,
  opts: { saddle?: number; intensity?: number } = {},
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#050506'),
    roughness: 0.35,
    metalness: 0.0,
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: opts.intensity ?? 1.15,
  })
  // glass is the light source: keep it out of the shadow pass
  mat.userData.isGlass = true

  const uniforms = {
    uLayout: { value: layout },
    uRect: { value: new THREE.Vector4(rect.x0, rect.y0, rect.w, rect.h) },
    uSaddle: { value: opts.saddle ?? 0 },
  }
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlassPos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGlassPos = (modelMatrix * vec4(position, 1.0)).xyz;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + MAIN)
  }
  mat.customProgramCacheKey = () => 'stainedGlass_v3'
  return mat
}
