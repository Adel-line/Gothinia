import { motion, type MotionValue } from 'framer-motion'
import type { SectionContent } from '../content/sections'

export function TextPanel({
  content,
  opacity,
  y,
}: {
  content: SectionContent
  opacity: MotionValue<number>
  y: MotionValue<number>
}) {
  return (
    <motion.div className="text-panel" style={{ opacity, y }}>
      <div className="text-panel-kicker">{content.kicker}</div>
      <h2 className="text-panel-title">{content.title}</h2>
      <p className="text-panel-body">{content.body}</p>
    </motion.div>
  )
}
