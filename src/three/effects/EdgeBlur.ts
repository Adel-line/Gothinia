import { Effect } from 'postprocessing'
import { Uniform } from 'three'

/**
 * Single-pass blur with two independently driven strengths:
 *  - uEdge: radial "tilt-shift" blur — the centre of frame stays sharp while
 *    the edges soften (used while the reader is on the text panel);
 *  - uFull: uniform full-frame blur (ramped to max at a scene boundary so the
 *    procedural geometry swap between cathedrals is hidden inside it).
 * 16-tap golden-angle disc sample, radius scaled by the winning strength.
 */
const fragmentShader = /* glsl */ `
  uniform float uEdge;
  uniform float uFull;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float edgeMask = smoothstep(0.16, 0.62, distance(uv, vec2(0.5)));
    float amount = max(uEdge * edgeMask, uFull);

    if (amount < 0.002) {
      outputColor = inputColor;
      return;
    }

    float radius = amount * amount * 24.0; // px; quadratic so the ramp starts gently
    vec4 acc = inputColor;
    for (int i = 0; i < 24; i++) {
      float a = float(i) * 2.39996323;
      float r = sqrt((float(i) + 0.5) / 24.0);
      vec2 off = vec2(cos(a), sin(a)) * r * radius * texelSize;
      acc += texture2D(inputBuffer, uv + off);
    }
    outputColor = acc / 25.0;
  }
`

export class EdgeBlurEffect extends Effect {
  constructor() {
    super('EdgeBlurEffect', fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['uEdge', new Uniform(0)],
        ['uFull', new Uniform(0)],
      ]),
    })
  }

  set edgeStrength(v: number) {
    this.uniforms.get('uEdge')!.value = v
  }

  set fullStrength(v: number) {
    this.uniforms.get('uFull')!.value = v
  }
}
