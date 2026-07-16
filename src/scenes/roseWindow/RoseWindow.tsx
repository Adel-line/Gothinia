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
  const { stoneGeometry, wallGeometry, openings } = useMemo(buildRoseGeometries, [])
  const limestone = useMemo(makeLimestone, [])
  const glassMaterials = useMemo(
    () => GLASS_PALETTE.map((hex, i) => makeStainedGlass(hex, 1.3 + (i % 4) * 0.22)),
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
      {panes.map((p) => (
        <mesh
          key={p.key}
          geometry={p.geometry}
          material={glassMaterials[p.material]}
          position={[0, 0, ROSE.glassZ]}
        />
      ))}
      {/* faint cool spill, as if daylight were coming through the glass */}
      <pointLight position={[0, 0, 6]} intensity={14} color="#8fa3e8" distance={22} decay={2} />
    </group>
  )
}
