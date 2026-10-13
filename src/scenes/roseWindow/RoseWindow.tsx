import { useMemo } from 'react'
import * as THREE from 'three'
import { buildRoseGeometries, ROSE } from './tracery'
import { buildFrameGeometries } from './frame'
import { makeLimestone } from '../../three/materials/limestone'
import { makePhotoGlassMaterial } from '../../three/materials/photoGlass'

function loadRelief(file: string): THREE.Texture {
  const tex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/${file}`)
  tex.anisotropy = 16
  return tex
}

/** The rose's traced moulding relief, laid over its plate face (UVs = world XY). */
function roseRelief(): THREE.Texture {
  const tex = loadRelief('rose-stone-normal.webp')
  const s = 1 / (2 * ROSE.textureRadius)
  tex.repeat.set(s, s)
  tex.offset.set(0.5, 0.5)
  return tex
}

/** Light map along the splay's profile (lathe v runs from the glass outward). */
function revealBounce(): THREE.DataTexture {
  const n = 16
  const data = new Uint8Array(n * 4)
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const v = Math.round(255 * (0.55 - 0.3 * t))
    data.set([v, v, Math.round(v * 1.06), 255], i * 4)
  }
  const tex = new THREE.DataTexture(data, 1, n)
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

export function RoseWindow() {
  const { stoneGeometry, moldingGeometry, splayGeometry } = useMemo(buildRoseGeometries, [])
  const frame = useMemo(buildFrameGeometries, [])

  // walls: ashlar, with voussoirs round the rose
  const wallStone = useMemo(() => makeLimestone({ masonry: 'rose' }), [])
  const splayStone = useMemo(() => {
    const m = makeLimestone({ masonry: 'rose' })
    m.side = THREE.DoubleSide // splay cone is seen from inside
    // The reveal faces away from the sun; in a real interior it still catches
    // soft light bounced off the nave and scattered from the glass. Bake that
    // in as a light map — brighter where it meets the glass, fading outward —
    // so it reads as stone in shade, not a black ring.
    m.lightMap = revealBounce()
    m.lightMapIntensity = 1
    return m
  }, [])
  // traced plates: faces carry the moulding relief, hole walls are plain stone
  const rosePlate = useMemo(() => {
    const face = makeLimestone()
    face.normalMap = roseRelief()
    return [face, makeLimestone()]
  }, [])
  const clairePlate = useMemo(() => makeLimestone(), [])
  // carved members (rolls, capitals, string course): the same stone, a shade
  // darker with a little more wear
  const carved = useMemo(() => makeLimestone({ color: '#a9a69e', roughness: 0.85 }), [])
  const roseGlass = useMemo(() => makePhotoGlassMaterial('rose-glass.webp'), [])
  const claireGlass = useMemo(() => makePhotoGlassMaterial('claire-glass.webp'), [])

  return (
    <group>
      {/* the frame: wall, moulded arch orders with capitals, string course */}
      <mesh geometry={frame.outerWall} material={wallStone} />
      <mesh geometry={frame.windowWall} material={wallStone} />
      <mesh geometry={frame.orders} material={carved} />
      <mesh geometry={frame.capitals} material={carved} />
      <mesh geometry={frame.stringCourse} material={carved} />

      {/* the rose */}
      <mesh geometry={stoneGeometry} material={rosePlate} />
      <mesh geometry={moldingGeometry} material={carved} />
      <mesh geometry={splayGeometry} material={splayStone} />
      {/* one disc of glass behind the whole plate, like a real glazed rose */}
      <mesh position={[0, 0, ROSE.glassZ]} material={roseGlass}>
        <circleGeometry args={[ROSE.textureRadius, 128]} />
      </mesh>

      {/* the claire-voie under it */}
      <mesh geometry={frame.clairePlate} material={clairePlate} />
      <mesh geometry={frame.claireGlass} material={claireGlass} />

      {/* daylight through the glass, scattered back onto the tracery's inner
          face: neutral, faintly blue from the cobalt — never orange */}
      <pointLight position={[0, 0, 1.4]} intensity={0.55} color="#c4c3d2" distance={7} decay={2} />
    </group>
  )
}
