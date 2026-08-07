import type { MeshBasicMaterial, Texture } from 'three'

/**
 * The hero is an authored studio render on white: even frontal light, cool
 * neutral, no baked shadow. The cinematic plate behind her is warm golden hour
 * lit from screen-right and slightly behind. Composited untouched she reads as
 * a sticker on a photograph — this is the single biggest remaining tell.
 *
 * She is a `MeshBasicMaterial` card, so there is no lighting model to hook a
 * light into. Instead this patches her fragment shader directly: a golden-hour
 * grade across the card plus an additive warm rim confined to the silhouette
 * edge on the sunward side.
 *
 * The card is yaw-billboarded to the camera every frame, so map u maps
 * dependably to screen x — u=1 is screen-right, where the sun is.
 */

/** Anchor the injection point so a three.js upgrade fails loudly, not silently. */
export const HERO_GRADE_ANCHOR = '#include <map_fragment>'

const HERO_GRADE_CHUNK = /* glsl */ `
#include <map_fragment>

// Silhouette edge: sample the alpha ring around this texel. Fully interior
// pixels see opaque neighbours and get no rim; pixels on the alpha boundary
// see transparent ones and light up. Clamping by our own alpha keeps the rim
// inside her outline instead of haloing into the lawn.
float pcNeighbourAlpha = 0.0;
pcNeighbourAlpha += texture2D( map, vMapUv + vec2(  pcTexel.x, 0.0 ) ).a;
pcNeighbourAlpha += texture2D( map, vMapUv + vec2( -pcTexel.x, 0.0 ) ).a;
pcNeighbourAlpha += texture2D( map, vMapUv + vec2( 0.0,  pcTexel.y ) ).a;
pcNeighbourAlpha += texture2D( map, vMapUv + vec2( 0.0, -pcTexel.y ) ).a;
pcNeighbourAlpha *= 0.25;
float pcEdge = clamp( ( 1.0 - pcNeighbourAlpha ) * diffuseColor.a * 2.4, 0.0, 1.0 );

// Sunward weighting. The plate's sun is screen-right and a little behind, so
// the rim belongs on her right edge and dies out well before her left.
float pcSunward = smoothstep( 0.30, 0.94, vMapUv.x );

// Golden-hour grade: warm and lift the sunward side, cool and settle the away
// side, so her value range lands inside the plate's instead of on top of it.
vec3 pcGrade = mix( pcShadeTint, pcSunTint, pcSunward );
diffuseColor.rgb *= pcGrade;

// Ground falloff — an unlit card is brightest exactly where it should be
// darkest, at the paws. vMapUv.y is 0 at the bottom of the image.
diffuseColor.rgb *= mix( pcFootShade, 1.0, smoothstep( 0.02, 0.30, vMapUv.y ) );

diffuseColor.rgb += pcRimColor * ( pcEdge * pcSunward * pcRimStrength * diffuseColor.a );
`

export interface HeroGradeOptions {
  /** Multiplier applied to the sunward side of the card. */
  readonly sunTint?: readonly [number, number, number]
  /** Multiplier applied to the side facing away from the plate's sun. */
  readonly shadeTint?: readonly [number, number, number]
  /** Additive rim colour along the sunward silhouette. */
  readonly rimColor?: readonly [number, number, number]
  readonly rimStrength?: number
  /** How far the paws are pushed down relative to the rest of the card. */
  readonly footShade?: number
}

const DEFAULTS = {
  // Measured off the plate's lit grass and haze either side of the hero.
  sunTint: [1.14, 1.03, 0.86] as const,
  shadeTint: [0.86, 0.87, 0.97] as const,
  rimColor: [1.0, 0.72, 0.36] as const,
  rimStrength: 0.85,
  footShade: 0.7,
}

function vec3(values: readonly [number, number, number]): string {
  return `vec3( ${values.map((v) => v.toFixed(4)).join(', ')} )`
}

/**
 * Patch a hero card's material so it sits inside the plate's light. Safe to
 * call once at construction; the texture must already be loaded so its real
 * pixel size is known.
 */
export function applyHeroGrade(
  material: MeshBasicMaterial,
  texture: Texture,
  options: HeroGradeOptions = {},
): void {
  const sunTint = options.sunTint ?? DEFAULTS.sunTint
  const shadeTint = options.shadeTint ?? DEFAULTS.shadeTint
  const rimColor = options.rimColor ?? DEFAULTS.rimColor
  const rimStrength = options.rimStrength ?? DEFAULTS.rimStrength
  const footShade = options.footShade ?? DEFAULTS.footShade

  const image = texture.image as { width?: number; height?: number } | undefined
  const width = image?.width ?? 1402
  const height = image?.height ?? 1122
  // Three texels out is wide enough to survive the WebP's soft alpha edge but
  // still tight enough that the rim reads as light, not as an outline.
  const texelU = 3 / Math.max(1, width)
  const texelV = 3 / Math.max(1, height)

  material.onBeforeCompile = (shader) => {
    if (!shader.fragmentShader.includes(HERO_GRADE_ANCHOR)) {
      throw new Error('Purple Cougar hero grade could not find its shader anchor')
    }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        [
          `const vec2 pcTexel = vec2( ${texelU.toFixed(6)}, ${texelV.toFixed(6)} );`,
          `const vec3 pcSunTint = ${vec3(sunTint)};`,
          `const vec3 pcShadeTint = ${vec3(shadeTint)};`,
          `const vec3 pcRimColor = ${vec3(rimColor)};`,
          `const float pcRimStrength = ${rimStrength.toFixed(4)};`,
          `const float pcFootShade = ${footShade.toFixed(4)};`,
          'void main() {',
        ].join('\n'),
      )
      .replace(HERO_GRADE_ANCHOR, HERO_GRADE_CHUNK)
  }
  // A material that has already compiled once keeps its old program otherwise.
  material.needsUpdate = true
}
