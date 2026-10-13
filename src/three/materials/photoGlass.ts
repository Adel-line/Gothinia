import * as THREE from 'three'
import atlasInfo from '../../scenes/roseWindow/roseGlassTiles.json'

/**
 * Rose-window glass built from photographs of real medieval glass.
 *
 * tools/build_rose_glass.py cuts every glazed opening out of a photo of
 * Notre-Dame's north rose, turns it radial-axis-up and packs it into an atlas.
 * Each pane here samples one tile in its own local frame (centre, radial
 * angle, size), so the photographed lancet or medallion sits upright and
 * centred in our opening, leading and painted figures included.
 *
 * Lighting model: the glass is a light source seen in transmission, so the
 * colour goes out through emissive while the diffuse term stays near black
 * (stone light must not wash over it). Every pane shares one shader program;
 * only the uniforms differ.
 */

export interface PaneFrame {
  center: [number, number]
  /** rotation so the tile's +Y (outward) lines up with the pane's radial axis */
  angle: number
  /** max vertex distance from the centre */
  radius: number
}

export interface GlassTile {
  tile: number
  /** distance from the rose centre, 0 = oculus … 1 = rim */
  rn: number
  /** radial length / tangential width */
  elong: number
  size: number
}

export const glassTiles: GlassTile[] = atlasInfo.tiles

let atlas: THREE.Texture | null = null
function atlasTexture(): THREE.Texture {
  if (!atlas) {
    atlas = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/rose-glass-atlas.jpg`)
    atlas.colorSpace = THREE.SRGBColorSpace
    atlas.anisotropy = 8
  }
  return atlas
}

const COMMON = /* glsl */ `
varying vec3 vGlassPos;
uniform sampler2D uAtlas;
uniform vec2 uCenter; uniform float uAngle; uniform float uRadius;
uniform vec2 uTileOrigin; uniform vec2 uTileSize; uniform float uIntensity;

float pgHash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float pgNoise(vec3 x){ vec3 i=floor(x),f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(pgHash(i),pgHash(i+vec3(1,0,0)),f.x),mix(pgHash(i+vec3(0,1,0)),pgHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(pgHash(i+vec3(0,0,1)),pgHash(i+vec3(1,0,1)),f.x),mix(pgHash(i+vec3(0,1,1)),pgHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
`

export function makePhotoGlassMaterial(tile: number, frame: PaneFrame): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#050506'),
    roughness: 0.35,
    metalness: 0.0,
    side: THREE.DoubleSide,
  })
  // emissive stays black on the material itself, so tag it for ShadowSetup
  mat.userData.isGlass = true

  const { cols, rows } = atlasInfo
  const gx = tile % cols
  const gy = Math.floor(tile / cols)
  const uniforms = {
    uAtlas: { value: atlasTexture() },
    uCenter: { value: new THREE.Vector2(frame.center[0], frame.center[1]) },
    uAngle: { value: frame.angle },
    uRadius: { value: Math.max(frame.radius, 1e-3) },
    // texture v runs bottom-up; tile rows are counted from the top
    uTileOrigin: { value: new THREE.Vector2(gx / cols, 1 - (gy + 1) / rows) },
    uTileSize: { value: new THREE.Vector2(1 / cols, 1 / rows) },
    uIntensity: { value: 1.2 },
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
      .replace('#include <common>', '#include <common>\n' + COMMON)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec2 rel = vGlassPos.xy - uCenter;
          float ca = cos(-uAngle), sa = sin(-uAngle);
          vec2 L = vec2(rel.x*ca - rel.y*sa, rel.x*sa + rel.y*ca) / uRadius;
          // pane's unit disc -> tile square, inset so mips don't bleed tiles
          vec2 uv = clamp(0.5 + 0.47 * L, 0.01, 0.99);
          vec3 glass = texture2D(uAtlas, uTileOrigin + uv * uTileSize).rgb;

          // hand-blown thickness: slow variation in how much light gets through
          float thick = pgNoise(vGlassPos * 2.3) * 0.6 + pgNoise(vGlassPos * 9.0) * 0.4;
          float trans = mix(0.82, 1.12, thick);
          // the low sun sits upper left; panes on that side carry more light
          float sun = dot(normalize(vGlassPos.xy + 0.001), normalize(vec2(-1.0, 1.0)));
          trans *= mix(0.88, 1.1, clamp(sun * 0.5 + 0.5, 0.0, 1.0));

          vec3 col = glass * uIntensity * trans;
          float fres = pow(clamp(1.0 - dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 4.0);
          col *= mix(1.0, 0.6, fres);
          totalEmissiveRadiance = col;
        }`,
      )
  }
  mat.customProgramCacheKey = () => 'rosePhotoGlass_v1'
  return mat
}
