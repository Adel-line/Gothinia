import { Effect } from 'postprocessing'
import { Uniform } from 'three'

/**
 * Single-pass uniform full-frame blur, ramped to max at a scene boundary so
 * the procedural geometry swap between cathedrals is hidden inside it.
 * 16-tap golden-angle disc sample, radius scaled by the strength.
 */
const fragmentShader = /* glsl */ `
  uniform float uFull;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float amount = uFull;

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
      uniforms: new Map<string, Uniform>([['uFull', new Uniform(0)]]),
    })
  }

  set fullStrength(v: number) {
    this.uniforms.get('uFull')!.value = v
  }
}
