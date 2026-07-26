import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three'

export interface Stage {
  renderer: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
  render(): void
  resize(): void
}

const SKY = 0x7fd0ef
const GRASS = 0x6cc24a

export function createStage(host: HTMLElement): Stage {
  const renderer = new WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
  host.appendChild(renderer.domElement)

  const scene = new Scene()
  scene.background = new Color(SKY)
  scene.fog = new Fog(SKY, 14, 34)

  const camera = new PerspectiveCamera(42, 1, 0.1, 100)
  camera.position.set(0, 1.7, 5.4)
  camera.lookAt(0, 1.0, 0)

  scene.add(new AmbientLight(0xffffff, 1.15))

  const sun = new DirectionalLight(0xfff4e0, 2.1)
  sun.position.set(3.5, 6, 4)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 20
  sun.shadow.camera.left = -6
  sun.shadow.camera.right = 6
  sun.shadow.camera.top = 6
  sun.shadow.camera.bottom = -6
  scene.add(sun)

  const ground = new Mesh(
    new PlaneGeometry(60, 60),
    new MeshStandardMaterial({ color: GRASS, roughness: 1 }),
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
  }
}
