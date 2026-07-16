import type { MutableRefObject } from 'react'
import type { Callout } from '../scenes/types'

/**
 * DOM handles the overlay's rAF loop writes into every frame (positions,
 * line endpoints, opacity) — no React state on the scroll path.
 */
export interface CalloutHandles {
  chips: (HTMLDivElement | null)[]
  lines: (SVGLineElement | null)[]
  dots: (SVGCircleElement | null)[]
}

export function Callouts({
  callouts,
  handles,
}: {
  callouts: Callout[]
  handles: MutableRefObject<CalloutHandles>
}) {
  return (
    <div className="callouts">
      <svg className="callout-svg">
        {callouts.map((c, i) => (
          <g key={c.label}>
            <line
              ref={(el) => {
                handles.current.lines[i] = el
              }}
              className="callout-line"
            />
            <circle
              ref={(el) => {
                handles.current.dots[i] = el
              }}
              className="callout-dot"
              r={4}
            />
          </g>
        ))}
      </svg>
      {callouts.map((c, i) => (
        <div
          key={c.label}
          ref={(el) => {
            handles.current.chips[i] = el
          }}
          className="callout-chip"
        >
          {c.label}
        </div>
      ))}
    </div>
  )
}
