import { useEffect, useRef } from 'react'
import { ramp, scrollState } from '../scroll/scrollState'

/**
 * Opening title frame — the "header" the visitor meets before the descent
 * begins. It sits above the canvas at scroll progress 0 and fades + drifts
 * upward over the first sliver of the runway, handing off to the Rose Window
 * zoom. Like everything else it's a pure function of scrollState.progress,
 * so scrolling back to the very top restores it exactly.
 */
export function TitleFrame() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const el = rootRef.current
      if (!el) return
      // fully present at the top, gone shortly after the descent starts
      const gone = ramp(scrollState.progress, 0.008, 0.05)
      el.style.opacity = String(1 - gone)
      el.style.transform = `translateY(${gone * -40}px)`
      // stop the invisible frame from swallowing pointer events once faded
      el.style.visibility = gone >= 1 ? 'hidden' : 'visible'
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div ref={rootRef} className="title-frame">
      <div className="title-frame-fog" />
      <div className="title-frame-inner">
        <p className="title-frame-kicker">A Field Guide</p>
        <h1 className="title-frame-title">
          <span>Gothic</span>
          <span>Architecture</span>
        </h1>
        <p className="title-frame-subtitle">
          Five elements, in the order they made each other possible. Not a
          style&nbsp;— a chain of consequences, worked out in stone.
        </p>
        <div className="title-frame-cue">
          <span>Descend</span>
          <div className="title-frame-cue-line" />
        </div>
      </div>
    </div>
  )
}
