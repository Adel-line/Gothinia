import { Experience } from './three/Experience'
import { Overlay } from './overlay/Overlay'
import { scenes } from './scenes/registry'
import { useScrollDriver } from './scroll/useScrollDriver'

export default function App() {
  useScrollDriver()

  return (
    <>
      <div className="canvas-holder">
        <Experience />
      </div>
      <Overlay />
      {/* invisible scroll runway; each scene owns an equal slice of it */}
      <div className="scroll-space" style={{ height: `${scenes.length * 320}vh` }} />
    </>
  )
}
