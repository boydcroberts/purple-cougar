/**
 * Puts the authored garden plate into motion.
 *
 * The plate is one painted 1672x941 image, so every waterfall, wave, and cloud
 * in it is frozen pixels. Rather than rebuild the horizon as geometry, this
 * layer patches the plate's existing material and animates the painted regions
 * in place: the two cascades churn and stream downward, the lake ripples and
 * throws a moving sun-glitter path, and a drifting cloud field passes over the
 * sky.
 *
 * Regions are hand-measured against `storybook-garden-railway-v2.jpg` in
 * source-image coordinates (`sy` counts down from the top, like the file).
 * They are exported so a re-measure after a plate swap is a test-covered edit
 * rather than a hunt through GLSL string literals.
 */
import { ClampToEdgeWrapping } from 'three'
import type { MeshBasicMaterial, Texture } from 'three'

export interface PlateRegion {
  readonly minU: number
  readonly maxU: number
  readonly minSourceY: number
  readonly maxSourceY: number
}

/** The tall cascade dropping past the stone viaduct, top right of the plate. */
export const UPPER_FALLS: PlateRegion = {
  minU: 0.663,
  maxU: 0.727,
  minSourceY: 0.01,
  maxSourceY: 0.295,
}
/** The second, wider drop that lands in the garden below the bridge. */
export const LOWER_FALLS: PlateRegion = {
  minU: 0.575,
  maxU: 0.652,
  minSourceY: 0.295,
  maxSourceY: 0.53,
}
/** Open water only. The far shoreline and its trees start below maxSourceY. */
export const LAKE: PlateRegion = {
  minU: 0.02,
  maxU: 0.455,
  minSourceY: 0.432,
  maxSourceY: 0.556,
}
/** Painted sky above the ridge line, before the foreground foliage overlaps. */
export const SKY: PlateRegion = {
  minU: 0.1,
  maxU: 0.64,
  minSourceY: 0.0,
  maxSourceY: 0.335,
}
/** Centre of the painted sun. Cloud drift fades out around it so the sun
 *  never appears to slide across its own reflection. */
export const SUN_U = 0.275
export const SUN_SOURCE_Y = 0.325

/**
 * Feathered 0..1 membership used by both the GLSL masks and the tests. A point
 * at the exact centre of a region returns 1; the edges fall off smoothly so no
 * animated region shows a rectangular seam.
 */
export function regionWeight(region: PlateRegion, u: number, sourceY: number): number {
  const feather = 0.16
  const insideAxis = (value: number, min: number, max: number): number => {
    if (max <= min) return 0
    const normalized = (value - min) / (max - min)
    if (normalized <= 0 || normalized >= 1) return 0
    const edge = Math.min(normalized, 1 - normalized) / feather
    const clamped = Math.min(1, edge)
    return clamped * clamped * (3 - 2 * clamped)
  }
  return insideAxis(u, region.minU, region.maxU) * insideAxis(sourceY, region.minSourceY, region.maxSourceY)
}

export interface LivingPlate {
  /** Advance the animation. `motion` is 0 under reduced-motion. */
  setTime(elapsedSeconds: number, motion: number): void
}

function glslRegion(name: string, region: PlateRegion): string {
  return `const vec4 ${name} = vec4(${region.minU.toFixed(4)}, ${region.maxU.toFixed(
    4,
  )}, ${region.minSourceY.toFixed(4)}, ${region.maxSourceY.toFixed(4)});`
}

const PLATE_MOTION_HEAD = /* glsl */ `
uniform float uPlateTime;
uniform float uPlateMotion;

${glslRegion('PC_UPPER_FALLS', UPPER_FALLS)}
${glslRegion('PC_LOWER_FALLS', LOWER_FALLS)}
${glslRegion('PC_LAKE', LAKE)}
${glslRegion('PC_SKY', SKY)}

float pcAxis(float value, float minValue, float maxValue) {
  float normalized = (value - minValue) / max(1e-5, maxValue - minValue);
  if (normalized <= 0.0 || normalized >= 1.0) return 0.0;
  return smoothstep(0.0, 1.0, min(min(normalized, 1.0 - normalized) / 0.16, 1.0));
}

float pcRegion(vec4 region, vec2 us) {
  return pcAxis(us.x, region.x, region.y) * pcAxis(us.y, region.z, region.w);
}

float pcHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float pcNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(pcHash(i), pcHash(i + vec2(1.0, 0.0)), w.x),
    mix(pcHash(i + vec2(0.0, 1.0)), pcHash(i + vec2(1.0, 1.0)), w.x),
    w.y
  );
}

float pcFbm(vec2 p) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    total += pcNoise(p) * amplitude;
    p *= 2.03;
    amplitude *= 0.5;
  }
  return total;
}
`

// Water is displaced by a scrolling noise field rather than translated as a
// block. A straight UV scroll would drag painted rock into the falls and show
// a wrap seam; churn plus a downward brightness streak reads as moving water
// while every stone stays exactly where it was painted.
const PLATE_MOTION_BODY = /* glsl */ `
  vec2 pcUs = vec2(vMapUv.x, 1.0 - vMapUv.y);
  vec2 pcUv = vMapUv;
  float pcMotion = uPlateMotion;
  float pcTime = uPlateTime;

  float pcFallWeight =
    pcRegion(PC_UPPER_FALLS, pcUs) + pcRegion(PC_LOWER_FALLS, pcUs);
  pcFallWeight = clamp(pcFallWeight, 0.0, 1.0) * pcMotion;
  float pcFallFlow = 0.0;
  if (pcFallWeight > 0.001) {
    float churn = pcFbm(vec2(pcUs.x * 210.0, pcUs.y * 46.0 - pcTime * 1.45));
    pcUv.y += (churn - 0.5) * 0.0075 * pcFallWeight;
    pcUv.x += (pcNoise(vec2(pcUs.x * 150.0, pcUs.y * 30.0 - pcTime * 1.1)) - 0.5)
      * 0.0022 * pcFallWeight;
    // Bright water streaking downward is what actually sells the fall.
    pcFallFlow = pcFbm(vec2(pcUs.x * 130.0, pcUs.y * 22.0 - pcTime * 2.35));
    pcFallFlow = (pcFallFlow - 0.45) * pcFallWeight;
  }

  float pcLakeWeight = pcRegion(PC_LAKE, pcUs) * pcMotion;
  float pcGlitter = 0.0;
  if (pcLakeWeight > 0.001) {
    // Distant water compresses toward the horizon, so ripples get shorter and
    // slower the further up the lake they sit.
    float depth = smoothstep(PC_LAKE.z, PC_LAKE.w, pcUs.y);
    float rippleScale = mix(520.0, 190.0, depth);
    float ripple =
      sin(pcUs.y * rippleScale + pcTime * 1.5) * 0.55 +
      sin(pcUs.y * rippleScale * 0.41 - pcTime * 0.9 + pcUs.x * 26.0) * 0.45;
    pcUv.x += ripple * 0.0016 * pcLakeWeight * mix(0.45, 1.0, depth);
    pcUv.y += ripple * 0.0005 * pcLakeWeight;

    // A living sun path: sparkles that live only in the reflected column.
    float column = 1.0 - smoothstep(0.0, 0.075, abs(pcUs.x - ${SUN_U.toFixed(3)}));
    float sparkle = pcNoise(vec2(pcUs.x * 320.0, pcUs.y * 400.0 - pcTime * 3.1));
    sparkle = smoothstep(0.72, 0.99, sparkle);
    pcGlitter = sparkle * column * pcLakeWeight * mix(0.35, 1.0, depth);
  }

  vec4 sampledDiffuseColor = texture2D(map, pcUv);
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = sRGBTransferEOTF(sampledDiffuseColor);
  #endif

  if (pcFallWeight > 0.001) {
    sampledDiffuseColor.rgb += vec3(0.95, 0.97, 1.0) * pcFallFlow * 0.16;
  }
  if (pcGlitter > 0.0) {
    sampledDiffuseColor.rgb += vec3(1.0, 0.86, 0.58) * pcGlitter * 0.55;
  }

  // Clouds are added as their own drifting field instead of scrolling the
  // painted sky, which would smear the sun, the ridge line, and the tree
  // silhouettes that overlap it.
  float pcSkyWeight = pcRegion(PC_SKY, pcUs) * pcMotion;
  if (pcSkyWeight > 0.001) {
    float sunGuard = smoothstep(
      0.0,
      0.19,
      length(vec2((pcUs.x - ${SUN_U.toFixed(3)}) * 1.35, pcUs.y - ${SUN_SOURCE_Y.toFixed(3)}))
    );
    // Translation alone cannot look alive at a believable cloud speed: at one
    // plate-width per minute the pattern shifts a few percent of a cloud per
    // second, which measured as no motion at all. The billowing term is what
    // sells it — the field evolves in place while it drifts.
    vec2 drift = vec2(pcUs.x * 3.1 - pcTime * 0.052, pcUs.y * 7.4);
    vec2 billow = vec2(pcTime * 0.045, pcTime * -0.031);
    float clouds = pcFbm(drift + pcFbm(drift * 1.9 + billow) * 0.55);
    clouds = smoothstep(0.44, 0.78, clouds);
    vec2 farDrift = vec2(pcUs.x * 1.9 - pcTime * 0.023, pcUs.y * 4.6);
    float farClouds = smoothstep(0.5, 0.86, pcFbm(farDrift + billow * 0.4));
    // smoothstep needs edge0 < edge1; the reversed form is undefined in GLSL.
    float high = 1.0 - smoothstep(PC_SKY.z, PC_SKY.w, pcUs.y);
    vec3 cloudTint = mix(vec3(1.0, 0.72, 0.44), vec3(0.86, 0.78, 0.95), high);
    sampledDiffuseColor.rgb +=
      cloudTint * (clouds * 0.2 + farClouds * 0.1) * pcSkyWeight * sunGuard;
  }

  diffuseColor *= sampledDiffuseColor;
`

/**
 * Patches an already-configured plate material in place. Using
 * `onBeforeCompile` rather than a bespoke ShaderMaterial keeps the plate's
 * existing map, opacity fade, transparency, and disposal behaviour untouched.
 */
export function applyLivingPlateMotion(material: MeshBasicMaterial): LivingPlate {
  const uniforms = {
    uPlateTime: { value: 0 },
    uPlateMotion: { value: 1 },
  }

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPlateTime = uniforms.uPlateTime
    shader.uniforms.uPlateMotion = uniforms.uPlateMotion
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${PLATE_MOTION_HEAD}\nvoid main() {`)
      .replace('#include <map_fragment>', PLATE_MOTION_BODY)
  }
  // Force a recompile if the material had already been used for a frame.
  material.needsUpdate = true

  return {
    setTime(elapsedSeconds: number, motion: number): void {
      uniforms.uPlateTime.value = Math.max(0, elapsedSeconds)
      uniforms.uPlateMotion.value = Math.min(1, Math.max(0, motion))
    },
  }
}

/** Exported for the environment layer's texture wrap setup. */
export function configurePlateTexture(texture: Texture): void {
  // Region warps push sampling a few thousandths of a UV outside the plate at
  // the very edges; clamping stops that from wrapping a bright sky pixel onto
  // the dark foreground corner.
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
}
