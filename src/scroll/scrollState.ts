/**
 * Shared mutable scroll state. Written by the GSAP ScrollTrigger driver,
 * read every frame by the camera rig, post-processing effects, and the
 * HTML overlay. Deliberately NOT React state: it changes every scrolled
 * frame and everything downstream is a pure function of it, which is what
 * makes the whole experience reversible when scrolling back up.
 */
export const scrollState = {
  /** Global progress through the entire scrollytelling page, 0..1. */
  progress: 0,
}

/**
 * Which scene index is active for a given global progress, and the local
 * phase t (0..1) within that scene's scroll range.
 */
export function scenePhase(progress: number, sceneCount: number): { index: number; t: number } {
  const scaled = Math.min(progress, 0.999999) * sceneCount
  const index = Math.floor(scaled)
  return { index, t: scaled - index }
}

/** Clamped linear ramp: 0 before `a`, 1 after `b`. */
export function ramp(t: number, a: number, b: number): number {
  return Math.min(1, Math.max(0, (t - a) / (b - a)))
}

/** Smooth (cubic) ease of a 0..1 value. */
export function smooth(x: number): number {
  return x * x * (3 - 2 * x)
}

/**
 * Phase timings shared by camera, blur and overlay so they stay in sync.
 * Within one scene's local t:
 *   zoom      0    → 0.45  camera pulls back from the tight opening pose
 *   overlay   0.35 → 0.55  text panel + callouts fade in (out again by 0.9)
 *   swap blur 0.85 → 1.0   full-frame blur ramps to max at the scene cut
 *   (and the next scene ramps it back down over its first 0.1)
 */
export const PHASE = {
  zoomEnd: 0.45,
  overlayIn: [0.35, 0.55] as const,
  overlayOut: [0.85, 0.95] as const,
  swapOut: 0.85,
  swapIn: 0.1,
}

/** Camera zoom phase, eased 0..1 (0 = tight pose, 1 = wide pose). */
export function zoomAmount(t: number): number {
  return smooth(ramp(t, 0, PHASE.zoomEnd))
}

/** Overlay (text panel + callouts) opacity for a local phase t. */
export function overlayOpacity(t: number): number {
  const [i0, i1] = PHASE.overlayIn
  const [o0, o1] = PHASE.overlayOut
  return ramp(t, i0, i1) * (1 - ramp(t, o0, o1))
}

/**
 * Full-frame scene-swap blur for a local phase t. Peaks at t=1 of the
 * outgoing scene and t=0 of the incoming one, so the geometry swap at the
 * boundary is hidden. `isLast` keeps the final scene from blurring out
 * into nothing at the end of the page.
 */
export function swapBlurStrength(t: number, isFirst: boolean, isLast: boolean): number {
  const out = isLast ? 0 : smooth(ramp(t, PHASE.swapOut, 1))
  const inn = isFirst ? 0 : smooth(1 - ramp(t, 0, PHASE.swapIn))
  return Math.max(out, inn)
}
