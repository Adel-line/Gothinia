import { useMemo } from 'react'
import * as THREE from 'three'
import { buildRoseGeometries, ROSE, type Opening } from './tracery'
import { makeLimestone } from '../../three/materials/limestone'
import { makeStainedGlass } from '../../three/materials/glass'

/**
 * Sainte-Chapelle jewel tones — blue and red dominate, as they do in the
 * actual glazing, with gold/green/violet accents.
 */
const GLASS_PALETTE = [
  '#1c3fa8', // cobalt
  '#941226', // ruby
  '#16327f', // deep blue
  '#a01327', // garnet
  '#d29a2b', // gold
  '#186a45', // emerald
  '#55307f', // violet
  '#1c3fa8', // cobalt again — weights the mix blue
  '#941226',
]

/** Deterministic per-pane colour pick (mulberry-style integer hash). */
function paletteIndex(ring: number, index: number): number {
  let h = (ring * 73856093) ^ (index * 19349663)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return Math.abs(h) % GLASS_PALETTE.length
}

function glassGeometry(opening: Opening): THREE.ShapeGeometry {
  // expand slightly about the opening centre so pane edges hide inside stone
  const pts = opening.points.map((p) =>
    p.clone().sub(opening.center).multiplyScalar(1.05).add(opening.center),
  )
  return new THREE.ShapeGeometry(new THREE.Shape(pts))
}

export function RoseWindow() {
  const { stoneGeometry, moldingGeometry, splayGeometry, wallGeometry, openings } = useMemo(
    buildRoseGeometries,
    [],
  )
  const limestone = useMemo(makeLimestone, [])
  const limestoneDS = useMemo(() => {
    const m = makeLimestone()
    m.side = THREE.DoubleSide // splay cone is seen from inside
    return m
  }, [])
  const glassMaterials = useMemo(
    () => GLASS_PALETTE.map((hex, i) => makeStainedGlass(hex, 2.2 + (i % 4) * 0.32)),
    [],
  )
  const panes = useMemo(
    () =>
      openings.map((o) => ({
        geometry: glassGeometry(o),
        material: paletteIndex(o.ring, o.index),
        key: `${o.ring}-${o.index}`,
      })),
    [openings],
  )

  return (
    <group>
      <mesh geometry={wallGeometry} material={limestone} />
      <mesh geometry={stoneGeometry} material={limestone} />
      <mesh geometry={moldingGeometry} material={limestone} />
      <mesh geometry={splayGeometry} material={limestoneDS} />
      {panes.map((p) => (
        <mesh
          key={p.key}
          geometry={p.geometry}
          material={glassMaterials[p.material]}
          position={[0, 0, ROSE.glassZ]}
        />
      ))}
      {/* scattered glow bouncing off the glass onto the facing stone —
          sits just in front of the window, close and falling off fast so
          it rim-lights the moldings and reveal without flooding the nave */}
      <pointLight position={[0, 0, 1.1]} intensity={1.8} color="#5f7fd6" distance={4} decay={2} />
      <pointLight position={[0, 0, 0.9]} intensity={0.45} color="#c4552e" distance={3} decay={2} />
    </group>
  )
}
