import {
  ACESFilmicToneMapping,
  BackSide,
  BufferAttribute,
  Color,
  DirectionalLight,
  Fog,
  HalfFloatType,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three'
import { makeMeadowTexture } from './meadowTexture'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'

export interface Stage {
  renderer: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
  render(): void
  resize(): void
  /**
   * A transparent hero plane should not enter GTAO or depth-of-field override
   * renders as an opaque rectangle.
   */
  setFlatHeroMode(enabled: boolean): void
  /**
   * Hide the old procedural sky/ground when a camera-locked authored scenic
   * plate is providing the visible environment.
   */
  setCinematicEnvironmentMode(enabled: boolean): void
  /**
   * Keep the fallback meadow's colour during the scenic-plate crossfade without
   * letting its opaque depth buffer block the partially transparent plate.
   */
  setCinematicEnvironmentFading(fading: boolean): void
  /** QA hook: orbit the camera azimuth, in degrees, around the subject. */
  setAzimuth(deg: number): void
}

// Golden hour over the Blue Ridge: the horizon is warm and hazy, and the fog
// matches it so ridges and meadow dissolve into the same light.
const SKY = 0xbcd9e8
const HORIZON_HAZE = 0xf6d7b0
const GRASS = 0x6bbf4a

export function createStage(host: HTMLElement): Stage {
  const renderer = new WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFShadowMap
  // Filmic highlight rolloff keeps the pale muzzle, eyes, clouds, and purple
  // rim light dimensional instead of clipping into toy-plastic white.
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.82
  host.appendChild(renderer.domElement)

  const scene = new Scene()
  scene.background = new Color(SKY)
  scene.fog = new Fog(HORIZON_HAZE, 18, 46)

  // A flat single-colour sky reads as a wall. This dome fades from the fog
  // colour at the horizon up to a deeper summer blue at the zenith, which
  // gives the backdrop depth for free. fog is off so the gradient itself is
  // never re-tinted, and the horizon colour matching Fog keeps the hills
  // blending into it exactly as before.
  // Golden hour over the lake, built from the real thing: a hot gold band on
  // the horizon, peach and rose stacked above it, easing into lavender and
  // then soft blue overhead. A two-colour ramp cannot hold that rose band, and
  // the rose band is exactly what separates "sunrise" from "blue sky with an
  // orange edge". Bright enough at the horizon that the meadow stays readable
  // for a child — this is dawn, not dusk.
  const SKY_STOPS: ReadonlyArray<readonly [number, number]> = [
    [0.0, 0xffc673],
    [0.08, 0xffdca4],
    [0.2, 0xf7b993],
    [0.36, 0xdca6b4],
    [0.55, 0xb3aed5],
    [1.0, 0x8ec0e4],
  ]
  const skyGeometry = new SphereGeometry(56, 32, 20)
  const skyPositions = skyGeometry.getAttribute('position')
  const skyLow = new Color()
  const skyHigh = new Color()
  const skyTint = new Color()
  const skyColors = new Float32Array(skyPositions.count * 3)
  for (let i = 0; i < skyPositions.count; i++) {
    const t = Math.min(1, Math.max(0, skyPositions.getY(i) / 56))
    let stop = 0
    while (stop < SKY_STOPS.length - 2 && t > SKY_STOPS[stop + 1]![0]) stop++
    const [lowT, lowColor] = SKY_STOPS[stop]!
    const [highT, highColor] = SKY_STOPS[stop + 1]!
    const span = Math.max(1e-6, highT - lowT)
    skyTint
      .copy(skyLow.setHex(lowColor))
      .lerp(skyHigh.setHex(highColor), Math.min(1, (t - lowT) / span))
    skyColors[i * 3] = skyTint.r
    skyColors[i * 3 + 1] = skyTint.g
    skyColors[i * 3 + 2] = skyTint.b
  }
  skyGeometry.setAttribute('color', new BufferAttribute(skyColors, 3))
  const skyDome = new Mesh(
    skyGeometry,
    new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false }),
  )
  skyDome.name = 'Sky gradient dome'
  scene.add(skyDome)

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
  scene.add(new HemisphereLight(0xd4e8f7, 0xc7b393, 1.75))

  // Key: the low golden sun. Dropping it toward the horizon and warming it is
  // most of what turns midday into sunrise — long raking light and warm tops
  // with cool shadows.
  const sun = new DirectionalLight(0xffd39a, 2.75)
  sun.position.set(4.6, 2.5, 4.2)
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
  const fill = new DirectionalLight(0xbcd6f5, 1.15)
  fill.position.set(-3.6, 2.0, 3.4)
  scene.add(fill)

  // Rim: behind and above, aimed back at the camera. This is what separates a
  // purple animal from a green field — it lights the fur along his silhouette
  // and is what the sheen material was chosen to catch.
  const rim = new DirectionalLight(0xffe6f2, 2.4)
  rim.position.set(-2.2, 2.4, -4.5)
  scene.add(rim)

  const meadowTexture = makeMeadowTexture(60)
  const groundMaterial = new MeshStandardMaterial({
    color: meadowTexture ? 0xffffff : GRASS,
    map: meadowTexture,
    roughness: 1,
    metalness: 0,
  })
  const ground = new Mesh(new PlaneGeometry(60, 60), groundMaterial)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  // --- Post-processing: contact AO. Everything above renders flawlessly lit,
  // which is exactly the problem — legs, chin, ears and paws all sit at the
  // same brightness as the open air next to them, so nothing reads as
  // touching anything else. GTAO multiplies a soft, distance-limited darkening
  // wherever two surfaces meet, which is the cheapest fix for that.
  //
  // The main colour target carries its own MSAA (`samples`) so RenderPass
  // keeps the antialiasing `WebGLRenderer({ antialias: true })` used to give
  // us for free — three resolves the multisample buffer to a normal texture
  // at the end of that render() call, before GTAO or OutputPass ever sample
  // it, so no separate SMAA/FXAA pass is needed.
  //
  // AO itself is computed and denoised at HALF the render resolution (see
  // aoWidth/aoHeight below) — GTAO renders the whole scene a second time in
  // an override material to build its normal/depth buffer, and doing that at
  // full res was the difference between 60fps and the high 40s on a
  // simulated iPad GPU during tuning.
  const maxSamples = renderer.capabilities.maxSamples
  const composerTarget = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    samples: Math.min(4, maxSamples),
  })
  const composer = new EffectComposer(renderer, composerTarget)
  composer.addPass(new RenderPass(scene, camera))

  const gtaoPass = new GTAOPass(scene, camera, 1, 1)
  gtaoPass.output = GTAOPass.OUTPUT.Default
  // Tuned for soft contact shading, not a grey halo: a small radius keeps the
  // darkening pinned to where surfaces actually meet (paw/ground, leg/torso,
  // inside the ears) instead of pooling across open fur or the grass.
  // distanceExponent front-loads the AO samples close to the surface, and
  // scale (a post-exponent on the raw AO term) pushes near-unoccluded areas
  // back toward "no darkening" rather than a flat wash.
  gtaoPass.updateGtaoMaterial({
    radius: 0.18,
    distanceExponent: 1.8,
    thickness: 1,
    scale: 1.6,
    samples: 16,
  })
  // The blend intensity is the main "how strong" dial, kept well under 1 so
  // open areas (sky, grass, the cougar's flank) stay untouched and only the
  // creases actually darken.
  gtaoPass.blendIntensity = 0.55
  composer.addPass(gtaoPass)

  // Desktop character review uses a restrained focus plane: the cougar stays
  // crisp while the train and distant hills recede like the supplied
  // cinematic reference. The pass is disabled on narrower tablet layouts,
  // where the extra depth render costs more and the whole playfield must read.
  const bokehPass = new BokehPass(scene, camera, {
    focus: 2.8,
    aperture: 0.00135,
    maxblur: 0.014,
  })
  composer.addPass(bokehPass)
  let flatHeroMode = false

  // Applies the renderer's ACES tone curve and converts the linear composer
  // buffer back to sRGB for display.
  composer.addPass(new OutputPass())

  function resize(): void {
    const w = host.clientWidth
    const h = host.clientHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / Math.max(1, h)
    // Portrait on an iPad crops the sides badly at a fixed FOV, so widen it.
    camera.fov = camera.aspect < 1 ? 58 : 42
    camera.updateProjectionMatrix()
    bokehPass.enabled = !flatHeroMode && camera.aspect >= 1.2

    composer.setPixelRatio(renderer.getPixelRatio())
    composer.setSize(w, h)

    const ratio = renderer.getPixelRatio()
    const aoWidth = Math.max(1, Math.round((w * ratio) / 2))
    const aoHeight = Math.max(1, Math.round((h * ratio) / 2))
    gtaoPass.setSize(aoWidth, aoHeight)
  }

  resize()

  return {
    renderer,
    scene,
    camera,
    render: () => composer.render(),
    resize,
    setFlatHeroMode(enabled) {
      flatHeroMode = enabled
      gtaoPass.enabled = !enabled
      bokehPass.enabled = !enabled && camera.aspect >= 1.2
    },
    setCinematicEnvironmentMode(enabled) {
      skyDome.visible = !enabled
      ground.visible = !enabled
      // Reset this in both directions so a failed/retried scenic load cannot
      // leave the procedural fallback with depth writing unexpectedly disabled.
      groundMaterial.depthWrite = true
    },
    setCinematicEnvironmentFading(fading) {
      // Opaque scene objects render before transparent ones. During the plate's
      // short fade, retaining the meadow's colour but dropping its depth write
      // lets the authored landscape blend over it instead of popping in only
      // after the old ground disappears. Near actors still write depth, so the
      // plate stays behind Purple Cougar and the ball.
      groundMaterial.depthWrite = !fading
    },
    setAzimuth(deg: number) {
      const r = Math.hypot(camera.position.x, camera.position.z)
      const a = (deg * Math.PI) / 180
      camera.position.x = Math.sin(a) * r
      camera.position.z = Math.cos(a) * r
      camera.lookAt(0, 0.52, -0.18)
    },
  }
}
