import * as THREE from 'three'
import { GLASS_COLORS, type GlassArtwork } from '../../scenes/roseWindow/glassArt'

/**
 * Per-pane stained-glass ARTWORK material for the rose.
 *
 * Each pane gets its own material instance carrying its GlassArtwork recipe as
 * uniforms, but every instance shares ONE compiled shader program (stable
 * customProgramCacheKey), so this stays cheap. The fragment shader composites,
 * per pixel, in the pane's local frame:
 *
 *   ground colour → field pattern → decorative border → symbolic motif (SDF)
 *   → lead lines → glass imperfections → transmitted-daylight (the same
 *   emissive-as-transmission model as the base glass, so it reads as lit
 *   medieval glass, never a glowing screen).
 *
 * Motifs are signed-distance functions — resolution independent, so they stay
 * razor-sharp even when the opening camera pose pushes the lens onto a single
 * pane. No textures anywhere.
 */

export interface PaneFrame {
  center: [number, number]
  /** rotation so the motif's local +Y points radially outward */
  angle: number
  /** local normalising radius (max vertex distance from centre) */
  radius: number
}

function deep(name: keyof typeof GLASS_COLORS): THREE.Color {
  const c = new THREE.Color(GLASS_COLORS[name])
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  return new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.96), hsl.l * 0.82)
}

const COMMON = /* glsl */ `
varying vec3 vLimePos; // reused name convention; world position of the fragment
uniform vec2 uCenter; uniform float uAngle; uniform float uRadius;
uniform vec3 uGround, uBorderCol, uFieldCol, uMotifCol, uAccentCol;
uniform int uMotif, uField, uBorder, uLead;
uniform float uBorderW, uMotifScale, uSeed, uIntensity;

float gHash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float gNoise(vec3 x){ vec3 i=floor(x),f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(gHash(i),gHash(i+vec3(1,0,0)),f.x),mix(gHash(i+vec3(0,1,0)),gHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(gHash(i+vec3(0,0,1)),gHash(i+vec3(1,0,1)),f.x),mix(gHash(i+vec3(0,1,1)),gHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float gFbm(vec3 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*gNoise(p); p=p*2.02+1.7; a*=0.5; } return s; }

// --- sdf primitives (2D) ---
float sdCircle(vec2 p,float r){ return length(p)-r; }
float sdBox(vec2 p,vec2 b){ vec2 d=abs(p)-b; return length(max(d,0.0))+min(max(d.x,d.y),0.0); }
float sdSeg(vec2 p,vec2 a,vec2 b,float th){ vec2 pa=p-a,ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); return length(pa-ba*h)-th; }
float sdTri(vec2 p,float r){ const float k=1.7320508;
  p.x=abs(p.x)-r; p.y=p.y+r/k;
  if(p.x+k*p.y>0.0) p=vec2(p.x-k*p.y,-k*p.x-p.y)/2.0;
  p.x-=clamp(p.x,-2.0*r,0.0); return -length(p)*sign(p.y); }

// --- motif SDFs (local space, pane ~ unit; negative = inside) ---
float mRosette(vec2 p,float lobes){ float a=atan(p.y,p.x); return length(p)-(0.60+0.28*cos(lobes*a)); }
float mStar6(vec2 p,float r){ return min(sdTri(p,r), sdTri(-p,r)); }
float mTrefoil(vec2 p,float r){ float d=1e9;
  for(int i=0;i<3;i++){ float a=1.5707963+2.0943951*float(i); d=min(d,sdCircle(p-vec2(cos(a),sin(a))*r*0.55,r*0.48)); }
  return min(d, sdSeg(p, vec2(0.0,0.0), vec2(0.0,-0.85), 0.06)); }
float mCross(vec2 p,float r){ return min(sdBox(p,vec2(r*0.22,r)), sdBox(p,vec2(r,r*0.22))); }
float mKnot(vec2 p){ float o=mRosette(p,4.0); float i=mRosette(p*1.7,4.0); return max(o,-i); }
float mLeaf(vec2 p){ float d=sdSeg(p,vec2(0.0,-0.82),vec2(0.0,0.82),0.05);
  for(int i=0;i<2;i++){ float s=(i==0)?1.0:-1.0;
    for(int j=0;j<2;j++){ float y=-0.15+0.45*float(j); vec2 q=p-vec2(0.0,y);
      float ang=s*0.9; float c=cos(ang),sn=sin(ang); vec2 r=vec2(q.x*c-q.y*sn,q.x*sn+q.y*c); r.x-=0.26;
      d=min(d, length(r*vec2(1.8,0.8))-0.20); } }
  return d; }
float mFleurPetal(vec2 p){ float c=sdCircle(p,0.24); float t=sdTri(p-vec2(0.0,0.16),0.30); return min(c,t); }
float mFleur(vec2 p){ float mid=mFleurPetal((p-vec2(0.0,0.08))*vec2(1.05,0.9)); float L=1e9;
  for(int i=0;i<2;i++){ float s=(i==0)?1.0:-1.0; float ang=s*0.62; float c=cos(ang),sn=sin(ang);
    vec2 q=vec2(p.x*c-p.y*sn,p.x*sn+p.y*c); q=q*vec2(1.25,0.8)-vec2(0.02,-0.02); L=min(L,mFleurPetal(q)); }
  float band=sdBox(p-vec2(0.0,-0.30),vec2(0.40,0.07));
  return min(min(mid,L),band); }
float mCastle(vec2 p){ float d=sdBox(p-vec2(0.0,-0.32),vec2(0.58,0.20));
  for(int i=0;i<3;i++){ float x=-0.4+0.4*float(i); float h=(i==1)?0.52:0.38;
    d=min(d, sdBox(p-vec2(x,-0.12+(h-0.38)),vec2(0.13,h)));
    d=min(d, sdBox(p-vec2(x-0.07,-0.12+(h-0.38)+h),vec2(0.05,0.06)));
    d=min(d, sdBox(p-vec2(x+0.07,-0.12+(h-0.38)+h),vec2(0.05,0.06))); }
  float gate=min(sdCircle(p-vec2(0.0,-0.34),0.13), sdBox(p-vec2(0.0,-0.46),vec2(0.13,0.1)));
  return max(d,-gate); }

// returns motif coverage (1 inside) and writes signed distance for outlining
float evalMotif(vec2 ml, out float sd){
  sd=1e9;
  if(uMotif==1){ // sunburst
    float rr=length(ml); float a=atan(ml.y,ml.x);
    float rays=cos(a*16.0); float rayR=mix(0.42,0.98, smoothstep(-0.3,1.0,rays));
    float cov=smoothstep(0.03,0.0, rr-rayR); cov=max(cov, smoothstep(0.03,0.0, rr-0.36));
    sd = rr-0.6; return cov;
  }
  if(uMotif==2) sd=mRosette(ml,6.0);
  else if(uMotif==3) sd=mFleur(ml);
  else if(uMotif==4) sd=mCastle(ml);
  else if(uMotif==5) sd=mStar6(ml,0.62);
  else if(uMotif==6) sd=mTrefoil(ml,0.72);
  else if(uMotif==7) sd=mKnot(ml);
  else if(uMotif==8) sd=mLeaf(ml);
  else if(uMotif==9) sd=mCross(ml,0.8);
  else return 0.0;
  float aa=fwidth(sd)+1e-4; return smoothstep(aa,-aa,sd);
}
`

export function makeRosePaneMaterial(art: GlassArtwork, frame: PaneFrame): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#0a0a0c'),
    roughness: 0.5,
    metalness: 0.0,
    side: THREE.DoubleSide,
  })

  const uniforms = {
    uCenter: { value: new THREE.Vector2(frame.center[0], frame.center[1]) },
    uAngle: { value: frame.angle },
    uRadius: { value: Math.max(frame.radius, 1e-3) },
    uGround: { value: deep(art.ground) },
    uBorderCol: { value: deep(art.borderColor) },
    uFieldCol: { value: deep(art.fieldColor) },
    uMotifCol: { value: deep(art.motifColor) },
    uAccentCol: { value: deep(art.motifAccent) },
    uMotif: { value: art.motif },
    uField: { value: art.field },
    uBorder: { value: art.border },
    uLead: { value: art.lead },
    uBorderW: { value: art.borderWidth },
    uMotifScale: { value: art.motifScale },
    uSeed: { value: art.seed },
    uIntensity: { value: 0.9 },
  }

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLimePos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvLimePos = (modelMatrix * vec4(position, 1.0)).xyz;',
      )

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + COMMON)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // ---- pane-local frame ----
        vec2 rel = vLimePos.xy - uCenter;
        float ca = cos(-uAngle), sa = sin(-uAngle);
        vec2 L = vec2(rel.x*ca - rel.y*sa, rel.x*sa + rel.y*ca) / uRadius;
        float rad = length(L);
        float ang = atan(L.y, L.x);

        vec3 regionColor = uGround;
        float leadMask = 0.0;

        // ---- field pattern (inside the border) ----
        if (uField == 1) {                        // diaper lozenge lattice
          vec2 g = abs(fract(vec2(L.x+L.y, L.x-L.y) * 5.0) - 0.5);
          float line = 1.0 - smoothstep(0.03, 0.07, min(g.x, g.y));
          regionColor = mix(regionColor, uFieldCol * 0.72, 0.5);
          leadMask = max(leadMask, line * 0.5);
        } else if (uField == 2) {                 // grisaille foliage: faint vine crosshatch
          float v = gFbm(vLimePos * 3.0);
          regionColor = mix(uFieldCol, uFieldCol * vec3(0.9,0.95,0.82), v);
          float ch = abs(fract((L.x - L.y) * 6.0) - 0.5);
          leadMask = max(leadMask, (1.0 - smoothstep(0.06, 0.12, ch)) * 0.18);
          float leaf = smoothstep(0.55, 0.8, gFbm(vLimePos * 2.0 + 3.0));
          regionColor = mix(regionColor, uAccentCol, leaf * 0.20);
        } else if (uField == 3) {                 // crosshatch
          float a1 = abs(fract(L.x * 6.0) - 0.5);
          float a2 = abs(fract(L.y * 6.0) - 0.5);
          leadMask = max(leadMask, (1.0 - smoothstep(0.06, 0.10, min(a1,a2))) * 0.25);
        }

        // ---- symbolic motif ----
        float sd;
        float mcov = evalMotif(L / max(uMotifScale, 0.05), sd);
        // motif accent = a thin outline just inside its edge
        float mAa = fwidth(sd) + 1e-3;
        float mOutline = (1.0 - smoothstep(0.0, mAa*3.0, abs(sd))) * (uMotif == 0 ? 0.0 : 1.0);
        regionColor = mix(regionColor, uMotifCol, mcov);
        regionColor = mix(regionColor, uAccentCol, mOutline * 0.55 * (uMotif == 1 ? 0.0 : 1.0));
        leadMask = max(leadMask, mOutline * 0.7);   // lead follows the motif

        // ---- decorative border (outer band, hugging the ~unit outline) ----
        float bStart = 1.0 - uBorderW;
        float bBand = smoothstep(bStart - 0.02, bStart + 0.01, rad);
        float pat = 1.0;
        if (uBorder == 1) {                         // bead: pearls along the run
          pat = smoothstep(0.15, 0.35, abs(fract(ang / 0.3926990 * 1.0) - 0.5) + (rad-bStart));
          pat = 1.0 - smoothstep(0.0, 0.5, abs(fract(ang * 3.8) - 0.5));
        } else if (uBorder == 2) {                  // dentil: square teeth
          pat = step(0.5, fract(ang * 5.0));
        } else if (uBorder == 3) {                  // foliate: running wave
          pat = 0.6 + 0.4 * sin(ang * 10.0);
        }
        float border = bBand * clamp(pat, 0.0, 1.0);
        // clear the motif/field out of the border ring
        regionColor = mix(regionColor, uBorderCol, bBand);
        regionColor = mix(regionColor, uBorderCol, border * 0.0); // (pattern handled via lead below)
        // lead line at the inner edge of the border, and a thin rim lead
        leadMask = max(leadMask, (1.0 - smoothstep(0.0, 0.03, abs(rad - bStart))) * 0.6);
        leadMask = max(leadMask, smoothstep(0.985, 1.0, rad) * 0.5);
        if (uBorder == 1 || uBorder == 2) leadMask = max(leadMask, bBand * (1.0 - pat) * 0.55);

        // ---- radial came for the oculus ----
        if (uLead == 1) {
          float spoke = 1.0 - smoothstep(0.0, 0.5, abs(fract(ang / 0.3926990 + 0.5) - 0.5));
          float ringc = 1.0 - smoothstep(0.02, 0.05, abs(fract(rad * 3.0) - 0.5) * 0.33);
          leadMask = max(leadMask, max(spoke * 0.4, ringc * 0.3) * step(rad, bStart));
        }

        // a faint background quarry lead so plain grounds still read leaded
        if (uLead == 0 && uField == 0) {
          vec2 q = abs(fract(L * 3.2) - 0.5);
          leadMask = max(leadMask, (1.0 - smoothstep(0.03, 0.08, min(q.x, q.y))) * 0.16 * step(rad, bStart));
        }

        // seedy imperfection breakup in the lead so it isn't mechanical
        leadMask *= 0.85 + 0.3 * gNoise(vLimePos * 30.0 + uSeed * 50.0);
        leadMask = clamp(leadMask, 0.0, 1.0);

        diffuseColor.rgb = regionColor * 0.05 * (1.0 - leadMask * 0.9);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          // transmitted daylight — same model as the base glass, now driven by
          // the composited region colour instead of one flat hue
          float thick = gFbm(vLimePos * 1.6);
          float streak = gNoise(vec3(vLimePos.x*1.05, vLimePos.y*8.0, vLimePos.z));
          float density = clamp(thick*0.7 + streak*0.2 + gNoise(vLimePos*24.0)*0.1, 0.0, 1.0);
          float bub = smoothstep(0.9, 0.99, gNoise(vLimePos*44.0)) * 0.4;
          float trans = mix(0.55, 1.05, density) + bub;
          float sun = dot(normalize(vLimePos.xy + 0.001), normalize(vec2(-1.0, 1.0)));
          trans *= mix(0.85, 1.14, clamp(sun*0.5+0.5, 0.0, 1.0));

          vec3 col = regionColor * uIntensity * max(trans, 0.0);
          float fres = pow(clamp(1.0 - dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 4.0);
          col *= mix(1.0, 0.6, fres);
          col += fres * vec3(0.05, 0.06, 0.09);
          col *= 1.0 - leadMask * 0.95;             // lead is opaque
          totalEmissiveRadiance = col;
        }`,
      )
  }

  // every pane shares one compiled program; only uniform values differ
  mat.customProgramCacheKey = () => 'rosePaneGlass_v1'

  return mat
}
