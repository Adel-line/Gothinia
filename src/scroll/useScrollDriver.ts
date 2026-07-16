import { useLayoutEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { scrollState } from './scrollState'

gsap.registerPlugin(ScrollTrigger)

/**
 * Maps the full page scroll to scrollState.progress (0..1). A scrubbed
 * tween (scrub: 0.6) smooths wheel steps, and because it's a scrub — not
 * a fired animation — scrolling up plays everything in reverse
 * automatically.
 */
export function useScrollDriver() {
  useLayoutEffect(() => {
    const tween = gsap.fromTo(
      scrollState,
      { progress: 0 },
      {
        progress: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: document.body,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.6,
        },
      },
    )
    return () => {
      tween.scrollTrigger?.kill()
      tween.kill()
    }
  }, [])
}
