import { useMemo } from 'react'
import * as THREE from 'three'
import { buildRoseGeometries, ROSE } from './tracery'
import { makeLimestone } from '../../three/materials/limestone'
import { makeRoseGlassMaterial } from '../../three/materials/photoGlass'

/** The traced moulding relief (normal map), laid over the plate's front face. */
function plateRelief(): THREE.Texture {
  const tex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/rose-stone-normal.jpg`)
  // plate UVs are world XY; the map covers [-R, R] in both
  const s = 1 / (2 * ROSE.textureRadius)
  tex.repeat.set(s, s)
  tex.offset.set(0.5, 0.5)
  tex.anisotropy = 8
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
  const { stoneGeometry, moldingGeometry, splayGeometry, wallGeometry } = useMemo(
    buildRoseGeometries,
    [],
  )
  const limestone = useMemo(() => makeLimestone({ masonry: 'rose' }), [])
  const limestoneDS = useMemo(() => {
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
  // plate faces carry the moulding relief; the hole walls are plain dressed stone
  const plateMaterials = useMemo(() => {
    const face = makeLimestone()
    face.normalMap = plateRelief()
    return [face, makeLimestone()]
  }, [])
  // carved rim rolls: the same stone, a shade darker with a little more wear
  const moldingStone = useMemo(() => makeLimestone({ color: '#a9a69e', roughness: 0.85 }), [])
  const glass = useMemo(makeRoseGlassMaterial, [])

  return (
    <group>
      <mesh geometry={wallGeometry} material={limestone} />
      <mesh geometry={stoneGeometry} material={plateMaterials} />
      <mesh geometry={moldingGeometry} material={moldingStone} />
      <mesh geometry={splayGeometry} material={limestoneDS} />
      {/* one disc of glass behind the whole plate, like a real glazed rose */}
      <mesh position={[0, 0, ROSE.glassZ]} material={glass}>
        <circleGeometry args={[ROSE.textureRadius, 128]} />
      </mesh>
      {/* daylight through the glass, scattered back onto the tracery's inner
          face: neutral, faintly blue from the cobalt — never orange */}
      <pointLight position={[0, 0, 1.4]} intensity={0.55} color="#c4c3d2" distance={7} decay={2} />
    </group>
  )
}
