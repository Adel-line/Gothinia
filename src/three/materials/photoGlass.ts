import * as THREE from 'three'

/**
 * Rose-window glass from a photograph of the real window.
 *
 * tools/trace_rose.py unwraps the photographed rose, fills in what the photo
 * crops or hides from the matching place one sector over, and tones it for
 * use as a light source. The glass is ONE disc behind the traced stone plate,
 * so every opening shows the glass that really fills it — medallions, figures
 * and leading in their true places.
 *
 * Lighting model: the glass is a light source seen in transmission, so the
 * colour goes out through emissive while the diffuse term stays near black.
 */
export function makeRoseGlassMaterial(): THREE.MeshStandardMaterial {
  const map = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/rose-glass.jpg`)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#050506'),
    roughness: 0.35,
    metalness: 0.0,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: map,
    emissiveIntensity: 1.2,
  })
  // glass is the light source: keep it out of the shadow pass
  mat.userData.isGlass = true

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
        float pgHash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float pgNoise(vec3 x){ vec3 i=floor(x),f=fract(x); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(pgHash(i),pgHash(i+vec3(1,0,0)),f.x),mix(pgHash(i+vec3(0,1,0)),pgHash(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(pgHash(i+vec3(0,0,1)),pgHash(i+vec3(1,0,1)),f.x),mix(pgHash(i+vec3(0,1,1)),pgHash(i+vec3(1,1,1)),f.x),f.y),f.z);}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          // hand-blown thickness: slow variation in how much light gets through
          float thick = pgNoise(vGlassPos * 2.3) * 0.6 + pgNoise(vGlassPos * 9.0) * 0.4;
          float trans = mix(0.85, 1.1, thick);
          // the low sun sits upper left; that side of the rose carries more light
          float sun = dot(normalize(vGlassPos.xy + 0.001), normalize(vec2(-1.0, 1.0)));
          trans *= mix(0.88, 1.1, clamp(sun * 0.5 + 0.5, 0.0, 1.0));
          totalEmissiveRadiance *= trans;
        }`,
      )
  }
  return mat
}
