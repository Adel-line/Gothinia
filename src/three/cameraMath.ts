import * as THREE from 'three'
import type { SceneDef } from '../scenes/types'
import { zoomAmount } from '../scroll/scrollState'

const tightPos = new THREE.Vector3()
const widePos = new THREE.Vector3()
const tightLook = new THREE.Vector3()
const wideLook = new THREE.Vector3()
const pos = new THREE.Vector3()
const look = new THREE.Vector3()

/**
 * Poses a camera for scene `def` at local phase `t`. Shared by the R3F
 * camera rig and the HTML overlay's projection camera, so both always agree
 * on where the camera is — the whole pose is a pure function of scroll.
 */
export function applyPose(camera: THREE.PerspectiveCamera, def: SceneDef, t: number): void {
  const z = zoomAmount(t)
  tightPos.set(...def.poseTight.position)
  widePos.set(...def.poseWide.position)
  tightLook.set(...def.poseTight.lookAt)
  wideLook.set(...def.poseWide.lookAt)

  pos.lerpVectors(tightPos, widePos, z)
  look.lerpVectors(tightLook, wideLook, z)

  camera.position.copy(pos)
  camera.lookAt(look)

  const fov = def.poseTight.fov + (def.poseWide.fov - def.poseTight.fov) * z
  if (camera.fov !== fov) {
    camera.fov = fov
    camera.updateProjectionMatrix()
  }
  camera.updateMatrixWorld()
}
