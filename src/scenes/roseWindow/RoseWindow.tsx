import { useMemo } from 'react'
import * as THREE from 'three'
import { buildRoseGeometries, ROSE, type Opening } from './tracery'
import { makeLimestone } from '../../three/materials/limestone'
import { assignRoseArtwork } from './glassArt'
import { makeRosePaneMaterial, type PaneFrame } from '../../three/materials/glassArtwork'

function glassGeometry(opening: Opening): THREE.ShapeGeometry {
  // expand slightly about the opening centre so pane edges hide inside stone
  const pts = opening.points.map((p) =>
    p.clone().sub(opening.center).multiplyScalar(1.05).add(opening.center),
  )
  return new THREE.ShapeGeometry(new THREE.Shape(pts))
}

/** Local frame for a pane's artwork: centre, radial orientation, size. */
function paneFrame(o: Opening): PaneFrame {
  let radius = 1e-3
  for (const p of o.points) radius = Math.max(radius, p.distanceTo(o.center))
  const atOrigin = o.center.lengthSq() < 1e-6
  // rotate so the motif's local +Y points radially outward toward the rim
  const angle = atOrigin ? 0 : Math.atan2(o.center.y, o.center.x) - Math.PI / 2
  return { center: [o.center.x, o.center.y], angle, radius }
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
  // carved moulding: slightly darker than the flat plate but just as matte —
  // structure comes from the raking light over the grain bump, not gloss
  const moldingStone = useMemo(
    () => makeLimestone({ color: '#8d7c64', roughness: 0.82, metalness: 0.0, bump: 0.09 }),
    [],
  )
  // Each pane is authored as a handcrafted GlassArtwork recipe and rendered by
  // its own compositor material (all sharing one compiled program).
  const panes = useMemo(
    () =>
      openings.map((o) => ({
        geometry: glassGeometry(o),
        material: makeRosePaneMaterial(assignRoseArtwork(o), paneFrame(o)),
        key: `${o.ring}-${o.index}`,
      })),
    [openings],
  )

  return (
    <group>
      <mesh geometry={wallGeometry} material={limestone} />
      <mesh geometry={stoneGeometry} material={limestone} />
      <mesh geometry={moldingGeometry} material={moldingStone} />
      <mesh geometry={splayGeometry} material={limestoneDS} />
      {panes.map((p) => (
        <mesh
          key={p.key}
          geometry={p.geometry}
          material={p.material}
          position={[0, 0, ROSE.glassZ]}
        />
      ))}
      {/* scattered glow bouncing off the glass onto the facing stone —
          sits just in front of the window, close and falling off fast so
          it rim-lights the moldings and reveal without flooding the nave */}
      <pointLight position={[0, 0, 1.1]} intensity={2.2} color="#d9954e" distance={5} decay={2} />
      <pointLight position={[0, 0, 0.9]} intensity={0.5} color="#7a86c8" distance={3} decay={2} />
    </group>
  )
}
