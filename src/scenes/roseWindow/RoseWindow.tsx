import { useMemo } from 'react'
import * as THREE from 'three'
import { buildRoseGeometries, ROSE, type Opening } from './tracery'
import { makeLimestone } from '../../three/materials/limestone'
import { glassTiles, makePhotoGlassMaterial, type PaneFrame } from '../../three/materials/photoGlass'

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

/** Radial length over tangential width — the same measure the atlas tool uses. */
function elongation(o: Opening): number {
  const r = o.center.length()
  if (r < 1e-3) return 1
  const ru = o.center.clone().divideScalar(r)
  let a0 = Infinity, a1 = -Infinity, t0 = Infinity, t1 = -Infinity
  for (const p of o.points) {
    const d = p.clone().sub(o.center)
    const along = d.dot(ru)
    const across = d.x * -ru.y + d.y * ru.x
    a0 = Math.min(a0, along); a1 = Math.max(a1, along)
    t0 = Math.min(t0, across); t1 = Math.max(t1, across)
  }
  return (a1 - a0) / Math.max(t1 - t0, 1e-3)
}

/**
 * Picks the photographed opening that best fits this pane: one from the same
 * part of the real rose (radial position) with the same proportions, varied
 * deterministically among the closest few so neighbouring panes don't repeat.
 */
function pickTile(o: Opening, rimRadius: number): number {
  const rn = Math.min(o.center.length() / rimRadius, 1)
  const el = elongation(o)
  const ranked = glassTiles
    .map((t) => ({ t, score: Math.abs(rn - t.rn) * 3 + Math.abs(Math.log(el / t.elong)) }))
    .sort((a, b) => a.score - b.score)
  const pool = ranked.slice(0, Math.min(5, ranked.length))
  let h = Math.imul(o.ring + 1, 73856093) ^ Math.imul(o.index + 1, 19349663)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return pool[(h >>> 0) % pool.length].t.tile
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
    () => makeLimestone({ color: '#7c7c79', roughness: 0.82, metalness: 0.0, bump: 0.09 }),
    [],
  )
  // Each pane carries a photographed opening of a real 13th-c. rose, matched
  // to its position and shape (all sharing one compiled program).
  const panes = useMemo(() => {
    let rim = 1e-3
    for (const o of openings) for (const p of o.points) rim = Math.max(rim, p.length())
    return openings.map((o) => ({
      geometry: glassGeometry(o),
      material: makePhotoGlassMaterial(pickTile(o, rim), paneFrame(o)),
      key: `${o.ring}-${o.index}`,
    }))
  }, [openings])

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
      <pointLight position={[0, 0, 1.1]} intensity={0.35} color="#d9954e" distance={5} decay={2} />
      <pointLight position={[0, 0, 0.9]} intensity={0.08} color="#7a86c8" distance={3} decay={2} />
    </group>
  )
}
