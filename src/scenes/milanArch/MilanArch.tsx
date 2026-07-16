import { useMemo } from 'react'
import * as THREE from 'three'
import { ARCADE, buildArcadeGeometries, pierXs, type ArchOpening } from './geometry'
import { makeLimestone } from '../../three/materials/limestone'
import { makeStainedGlass } from '../../three/materials/glass'

/**
 * Milanese glazing runs bluer and paler than Sainte-Chapelle's; keep the
 * jewel register but weight toward blue and gold.
 */
const GLASS_PALETTE = ['#1c3fa8', '#16327f', '#d29a2b', '#941226', '#186a45', '#1c3fa8']

function paletteIndex(ring: number, index: number): number {
  let h = (ring * 73856093) ^ (index * 19349663)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return Math.abs(h) % GLASS_PALETTE.length
}

function glassGeometry(opening: ArchOpening): THREE.ShapeGeometry {
  const pts = opening.points.map((p) =>
    p.clone().sub(opening.center).multiplyScalar(1.05).add(opening.center),
  )
  return new THREE.ShapeGeometry(new THREE.Shape(pts))
}

/** One clustered pier: core shaft, four engaged shafts, octagonal capital. */
function Pier({ x, material }: { x: number; material: THREE.MeshStandardMaterial }) {
  const A = ARCADE
  const shaftH = A.pier.shaftTop - A.wallBottom
  const upperH = A.wallTop - A.pier.capTop
  return (
    <group position={[x, 0, A.plateFront]}>
      {/* main shaft */}
      <mesh position={[0, A.wallBottom + shaftH / 2, 0]} material={material}>
        <cylinderGeometry args={[0.34, 0.36, shaftH, 20]} />
      </mesh>
      {/* engaged shafts on the diagonals */}
      {[45, 135, 225, 315].map((deg) => {
        const a = (deg * Math.PI) / 180
        return (
          <mesh
            key={deg}
            position={[Math.cos(a) * 0.32, A.wallBottom + shaftH / 2, Math.sin(a) * 0.32]}
            material={material}
          >
            <cylinderGeometry args={[0.13, 0.14, shaftH, 12]} />
          </mesh>
        )
      })}
      {/* octagonal capital block with a necking ring below */}
      <mesh position={[0, (A.pier.shaftTop + A.pier.capTop) / 2, 0]} material={material}>
        <cylinderGeometry args={[0.58, 0.44, A.pier.capTop - A.pier.shaftTop, 8]} />
      </mesh>
      <mesh position={[0, A.pier.shaftTop - 0.05, 0]} rotation={[Math.PI / 2, 0, 0]} material={material}>
        <torusGeometry args={[0.42, 0.05, 8, 24]} />
      </mesh>
      {/* upper shaft rising through the clerestory tier */}
      <mesh position={[0, A.pier.capTop + upperH / 2, -0.1]} material={material}>
        <cylinderGeometry args={[A.pier.upperR, A.pier.upperR, upperH, 14]} />
      </mesh>
    </group>
  )
}

export function MilanArch() {
  const { wallGeometry, moldingGeometry, glassOpenings, farLancets } = useMemo(
    buildArcadeGeometries,
    [],
  )
  const limestone = useMemo(() => makeLimestone({ color: '#b9a88e' }), [])
  const moldingStone = useMemo(
    () => makeLimestone({ color: '#8d7c64', roughness: 0.82, metalness: 0.0, bump: 0.09 }),
    [],
  )
  const darkStone = useMemo(
    () => makeLimestone({ color: '#5c5142', roughness: 0.97, bump: 0.03 }),
    [],
  )
  const glassMaterials = useMemo(
    () => GLASS_PALETTE.map((hex, i) => makeStainedGlass(hex, 2.2 + (i % 3) * 0.3)),
    [],
  )
  // far-aisle glazing: barely-there glow so it reads as distant depth,
  // not as a second arcade of windows competing with the clerestory
  const dimGlass = useMemo(() => makeStainedGlass('#243e80', 0.28), [])
  const panes = useMemo(
    () =>
      glassOpenings.map((o) => ({
        geometry: glassGeometry(o),
        material: paletteIndex(o.ring, o.index),
        key: `${o.ring}-${o.index}`,
      })),
    [glassOpenings],
  )
  const farPanes = useMemo(
    () => farLancets.map((pts) => new THREE.ShapeGeometry(new THREE.Shape(pts))),
    [farLancets],
  )

  const A = ARCADE
  return (
    <group>
      <mesh geometry={wallGeometry} material={limestone} />
      <mesh geometry={moldingGeometry} material={moldingStone} />
      {pierXs().map((x) => (
        <Pier key={x} x={x} material={moldingStone} />
      ))}
      {/* string-course cornices between the tiers */}
      {A.cornices.map((y) => (
        <mesh key={y} position={[0, y, A.plateFront + 0.06]} material={moldingStone}>
          <boxGeometry args={[A.wallHalfWidth * 2, 0.18, 0.14]} />
        </mesh>
      ))}
      {/* clerestory glass */}
      {panes.map((p) => (
        <mesh
          key={p.key}
          geometry={p.geometry}
          material={glassMaterials[p.material]}
          position={[0, 0, A.glassZ]}
        />
      ))}
      {/* the dark nave beyond the arcade: floor, far aisle wall, dim lancets */}
      <mesh position={[0, A.floorY, -1.5]} rotation={[-Math.PI / 2, 0, 0]} material={darkStone}>
        <planeGeometry args={[26, 14]} />
      </mesh>
      <mesh position={[0, 1, A.farWallZ]} material={darkStone}>
        <planeGeometry args={[26, 16]} />
      </mesh>
      {farPanes.map((g, i) => (
        <mesh key={i} geometry={g} material={dimGlass} position={[0, 0, A.farWallZ + 0.05]} />
      ))}
      {/* warm spill off the clerestory glass onto the wall face */}
      <pointLight position={[0, 5.6, 1.4]} intensity={2.4} color="#d9954e" distance={6} decay={2} />
      <pointLight position={[-4.8, 5.6, 1.4]} intensity={1.4} color="#d9954e" distance={5} decay={2} />
      <pointLight position={[4.8, 5.6, 1.4]} intensity={1.4} color="#d9954e" distance={5} decay={2} />
      {/* faint cool depth light in the aisle beyond */}
      <pointLight position={[0, -1, -3]} intensity={1.2} color="#6a76b8" distance={10} decay={2} />
    </group>
  )
}
