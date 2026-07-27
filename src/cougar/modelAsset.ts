import { type Material, Mesh, Object3D, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { Palette } from './materials'
import { createQuadruped, type Quadruped } from './quadruped'

const DEFAULT_ASSET_URL = '/assets/purple-cougar.glb'

interface RigNodes {
  root: Object3D
  legFL: Object3D
  legFR: Object3D
  legHL: Object3D
  legHR: Object3D
  neck: Object3D
  head: Object3D
  tail: Object3D
  cuffAnchor: Object3D
}

function requireNode(root: Object3D, name: string): Object3D {
  const node = root.getObjectByName(name)
  if (!node) throw new Error(`Purple Cougar asset is missing rig node "${name}"`)
  return node
}

function readRig(scene: Object3D): RigNodes {
  const root = requireNode(scene, 'cougar')
  return {
    root,
    legFL: requireNode(root, 'legFL'),
    legFR: requireNode(root, 'legFR'),
    legHL: requireNode(root, 'legHL'),
    legHR: requireNode(root, 'legHR'),
    neck: requireNode(root, 'neck'),
    head: requireNode(root, 'head'),
    tail: requireNode(root, 'tail'),
    cuffAnchor: requireNode(root, 'cuffAnchor'),
  }
}

function finishCharacterMeshes(root: Object3D, palette: Palette): void {
  const materialByName = new Map<string, Material>([
    ['Fur', palette.fur],
    ['FurDark', palette.furDark],
    ['Cream', palette.cream],
    ['Nose', palette.nose],
    ['EyeWhite', palette.eyeWhite],
    ['Iris', palette.iris],
    ['Pupil', palette.pupil],
    ['Highlight', palette.highlight],
    ['EarInner', palette.earInner],
    ['Whisker', palette.whisker],
    ['Cuff', palette.cuff],
  ])
  const replaced = new Set<Material>()

  function finishMaterial(source: Material): Material {
    const replacement = materialByName.get(source.name)
    if (!replacement) return source
    replaced.add(source)
    return replacement
  }

  root.traverse((node) => {
    if (!(node instanceof Mesh)) return
    node.castShadow = true
    node.receiveShadow = true
    node.material = Array.isArray(node.material)
      ? node.material.map(finishMaterial)
      : finishMaterial(node.material)
  })

  for (const material of replaced) material.dispose()
}

function createImportedQuadruped(scene: Object3D, palette: Palette): Quadruped {
  const rig = readRig(scene)
  finishCharacterMeshes(rig.root, palette)

  const cuffWorld = new Vector3()
  function syncCuff(): void {
    rig.root.updateMatrixWorld(true)
    cuffWorld.setFromMatrixPosition(rig.cuffAnchor.matrixWorld)
  }

  const quadruped: Quadruped = {
    ...rig,
    cuffWorld,
    syncCuff,
  }
  syncCuff()
  return quadruped
}

/**
 * Loads the authored browser asset before behavior and physics are created.
 * A malformed or unavailable GLB degrades to the deterministic procedural
 * character so a missing art file can never leave the playfield blank.
 */
export async function loadHeroQuadruped(
  palette: Palette,
  assetUrl = DEFAULT_ASSET_URL,
): Promise<Quadruped> {
  try {
    const gltf = await new GLTFLoader().loadAsync(assetUrl)
    return createImportedQuadruped(gltf.scene, palette)
  } catch (error) {
    console.warn('Falling back to the procedural Purple Cougar.', error)
    return createQuadruped(palette)
  }
}
