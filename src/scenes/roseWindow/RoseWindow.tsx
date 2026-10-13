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

export function RoseWindow() {
  const { stoneGeometry, moldingGeometry, splayGeometry, wallGeometry } = useMemo(
    buildRoseGeometries,
    [],
  )
  const limestone = useMemo(makeLimestone, [])
  const limestoneDS = useMemo(() => {
    const m = makeLimestone()
    m.side = THREE.DoubleSide // splay cone is seen from inside
    return m
  }, [])
  // plate faces carry the moulding relief; the hole walls are plain dressed stone
  const plateMaterials = useMemo(() => {
    const face = makeLimestone()
    face.normalMap = plateRelief()
    return [face, limestone]
  }, [limestone])
  // carved moulding: slightly darker than the flat plate but just as matte —
  // structure comes from the raking light over the grain bump, not gloss
  const moldingStone = useMemo(
    () => makeLimestone({ color: '#7c7c79', roughness: 0.82, metalness: 0.0, bump: 0.09 }),
    [],
  )
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
      {/* scattered glow bouncing off the glass onto the facing stone —
          sits just in front of the window, close and falling off fast so
          it rim-lights the moldings and reveal without flooding the nave */}
      <pointLight position={[0, 0, 1.1]} intensity={0.35} color="#d9954e" distance={5} decay={2} />
      <pointLight position={[0, 0, 0.9]} intensity={0.08} color="#7a86c8" distance={3} decay={2} />
    </group>
  )
}
