import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useMotionValue } from 'framer-motion'
import { scenes } from '../scenes/registry'
import { overlayOpacity, scenePhase, scrollState } from '../scroll/scrollState'
import { applyPose } from '../three/cameraMath'
import { TextPanel } from './TextPanel'
import { Callouts, type CalloutHandles } from './Callouts'

/**
 * HTML layer above the canvas. Runs its own rAF loop with a scratch camera
 * posed by the SAME pure function as the render camera (applyPose), so
 * projected callout anchors always agree with the 3D view — and everything
 * reverses perfectly when scrolling up.
 */
export function Overlay() {
  const [active, setActive] = useState(0)
  const activeRef = useRef(0)
  const handles = useRef<CalloutHandles>({ chips: [], lines: [], dots: [] })
  const hudRef = useRef<HTMLDivElement>(null)

  const panelOpacity = useMotionValue(0)
  const panelY = useMotionValue(18)

  const debug = typeof window !== 'undefined' && window.location.search.includes('debug')

  useEffect(() => {
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120)
    const v = new THREE.Vector3()
    let raf = 0

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const { index, t } = scenePhase(scrollState.progress, scenes.length)
      const clamped = Math.min(index, scenes.length - 1)
      if (clamped !== activeRef.current) {
        activeRef.current = clamped
        setActive(clamped)
      }
      const def = scenes[clamped]
      const opacity = overlayOpacity(t)

      panelOpacity.set(opacity)
      panelY.set((1 - opacity) * 18)

      const W = window.innerWidth
      const H = window.innerHeight
      camera.aspect = W / H
      applyPose(camera, def, t)
      camera.updateProjectionMatrix()

      const { chips, lines, dots } = handles.current
      def.callouts.forEach((c, i) => {
        const chip = chips[i]
        const line = lines[i]
        const dot = dots[i]
        if (!chip || !line || !dot) return

        v.set(...c.anchor).project(camera)
        const behind = v.z > 1
        const sx = (v.x * 0.5 + 0.5) * W
        const sy = (0.5 - v.y * 0.5) * H
        const lx = sx + c.labelOffset[0] * W
        const ly = sy + c.labelOffset[1] * H
        const alpha = behind ? 0 : opacity

        chip.style.transform = `translate(-50%, -50%) translate(${lx}px, ${ly}px)`
        chip.style.opacity = String(alpha)
        line.setAttribute('x1', String(lx))
        line.setAttribute('y1', String(ly))
        line.setAttribute('x2', String(sx))
        line.setAttribute('y2', String(sy))
        line.style.opacity = String(alpha)
        dot.setAttribute('cx', String(sx))
        dot.setAttribute('cy', String(sy))
        dot.style.opacity = String(alpha)
      })

      if (hudRef.current) {
        hudRef.current.textContent = `p ${scrollState.progress.toFixed(3)}  scene ${clamped}  t ${t.toFixed(3)}`
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [panelOpacity, panelY])

  const def = scenes[active]
  return (
    <div className="overlay">
      <TextPanel content={def.content} opacity={panelOpacity} y={panelY} />
      <Callouts key={def.content.id} callouts={def.callouts} handles={handles} />
      {debug && <div ref={hudRef} className="debug-hud" />}
    </div>
  )
}
