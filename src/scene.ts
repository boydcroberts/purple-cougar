import {
  Color,
  DirectionalLight,
  Fog,
  HalfFloatType,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'

export interface Stage {
  renderer: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
  render(): void
  resize(): void
  /** QA hook: orbit the camera azimuth, in degrees, around the subject. */
  setAzimuth(deg: number): void
}

const SKY = 0x7fd0ef
const GRASS = 0x63b83f

export function createStage(host: HTMLElement): Stage {
  const renderer = new WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
  // Filmic tone mapping. Without it, bright fur and sky clip to flat blocks of
  // colour and everything reads as cheap plastic; this is the single cheapest
  // change that makes a WebGL scene look rendered rather than drawn.
  renderer.toneMappingExposure = 1.0
  host.appendChild(renderer.domElement)

  const scene = new Scene()
  scene.background = new Color(SKY)
  scene.fog = new Fog(SKY, 14, 34)

  const camera = new PerspectiveCamera(42, 1, 0.1, 100)
  // Low three-quarter view: a quadruped seen head-on foreshortens to nothing,
  // hiding the body length, haunches, and tail that make him read as a cat.
  camera.position.set(2.35, 1.02, 3.05)
  camera.lookAt(0, 0.52, -0.18)

  // --- Three-point lighting. A single directional light was why he read flat.
  // Sky-to-ground ambient rather than uniform white: fur picks up blue from
  // above and green bounce from the grass below, which is most of what makes
  // an outdoor render feel like it is actually outdoors.
  // Ground bounce is DESATURATED, not the grass colour at full strength — a
  // literal green bounce turns the cream underside olive and the purple coat
  // navy. Real bounce light is far weaker and much less saturated than the
  // surface producing it.
  scene.add(new HemisphereLight(0xdcefff, 0xc3c2ad, 1.9))

  // Key: warm, high, camera-right.
  const sun = new DirectionalLight(0xfff4e2, 2.6)
  sun.position.set(3.2, 4.2, 5.2)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.02
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 20
  // Tight frustum around the subject: a wide one spends the shadow map on
  // empty grass and leaves the cougar's own shadows soft and blocky.
  sun.shadow.camera.left = -2.4
  sun.shadow.camera.right = 2.4
  sun.shadow.camera.top = 2.4
  sun.shadow.camera.bottom = -2.4
  scene.add(sun)

  // Fill: cool, low, camera-left. Lifts the shadow side so the far half of him
  // does not go to mud.
  const fill = new DirectionalLight(0xd6e6ff, 1.25)
  fill.position.set(-3.6, 2.0, 3.4)
  scene.add(fill)

  // Rim: behind and above, aimed back at the camera. This is what separates a
  // purple animal from a green field — it lights the fur along his silhouette
  // and is what the sheen material was chosen to catch.
  const rim = new DirectionalLight(0xffe6f2, 2.4)
  rim.position.set(-2.2, 2.4, -4.5)
  scene.add(rim)

  const ground = new Mesh(
    new PlaneGeometry(60, 60),
    new MeshStandardMaterial({ color: GRASS, roughness: 1, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  function resize(): void {
    const w = host.clientWidth
    const h = host.clientHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / Math.max(1, h)
    // Portrait on an iPad crops the sides badly at a fixed FOV, so widen it.
    camera.fov = camera.aspect < 1 ? 58 : 42
    camera.updateProjectionMatrix()
  }

  resize()

  return {
    renderer,
    scene,
    camera,
    render: () => renderer.render(scene, camera),
    resize,
    setAzimuth(deg: number) {
      const r = Math.hypot(camera.position.x, camera.position.z)
      const a = (deg * Math.PI) / 180
      camera.position.x = Math.sin(a) * r
      camera.position.z = Math.cos(a) * r
      camera.lookAt(0, 0.52, -0.18)
    },
  }
}
