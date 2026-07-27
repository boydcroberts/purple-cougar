/**
 * The cougar's coat and features.
 *
 * The character is the highlight of this project, so the materials do real
 * work rather than picking flat colours:
 *
 *  - Fur uses MeshPhysicalMaterial's *sheen*, which is three's cloth/fur
 *    model. It adds a soft retro-reflective bloom at grazing angles, which is
 *    exactly how real fur catches light around a silhouette. A plain
 *    MeshStandardMaterial reads as painted plastic no matter how good the
 *    geometry underneath it is.
 *  - Eyes get clearcoat: a second specular layer over the iris, which is what
 *    makes an eye look wet instead of like a painted bead.
 *  - The palette is a real cougar's coat structure with purple substituted for
 *    tawny: a near-uniform body, a paler underside, and darker points at the
 *    muzzle, ear backs, and tail tip. Low contrast is a large part of why real
 *    animals read as animals and toys read as toys.
 */
import { MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Vector2 } from 'three'
import { createFurMaps } from './fur'

const PURPLE = 0xbe9bff
/** Points: ear backs, toe pads, tail tip, brow shadow. */
const PURPLE_DARK = 0x7d5cc4
/** Sheen tint — a cooler bloom than the base coat, so the rim reads as light
 *  catching individual hairs rather than as the body colour brightening. */
const SHEEN_LILAC = 0xffd9f0
/** Paler underside — belly, chin, muzzle patch. */
const CREAM = 0xf3ece0
/** Nose leather. */
const NOSE_PINK = 0xc98a92
/** Amber iris — the strongest single realism cue in a cat's face. */
const IRIS_AMBER = 0xd9a441
/** Inner ear. */
const EAR_INNER = 0xd8bfb4
/** Whiskers. */
const WHISKER = 0xf2ece0
// From the photo of the real toy — not free choices.
const CUFF_RED = 0xc8202e
const VELCRO_BLACK = 0x1a1a1a

export interface Palette {
  fur: MeshPhysicalMaterial
  furDark: MeshPhysicalMaterial
  cream: MeshPhysicalMaterial
  nose: MeshPhysicalMaterial
  eyeWhite: MeshPhysicalMaterial
  iris: MeshPhysicalMaterial
  pupil: MeshStandardMaterial
  highlight: MeshBasicMaterial
  earInner: MeshPhysicalMaterial
  whisker: MeshStandardMaterial
  cuff: MeshStandardMaterial
}

/**
 * Fur: matte body, sheen bloom at grazing angles, and procedurally generated
 * coat maps. The maps are what stop it reading as flat plastic — mottled
 * colour breakup, a darker back grading to a paler belly, glossier guard hairs
 * over duller undercoat, and fine normal relief for the sheen to catch.
 */
function furMaterial(
  color: number,
  sheen = 0.85,
  seed = 0x9e3779b9,
  repeat = 3,
): MeshPhysicalMaterial {
  const maps = createFurMaps(color, seed, { mottle: 0.1, spine: 0.1, belly: 0.08 })
  for (const t of [maps.albedo, maps.roughness, maps.normal]) {
    t.repeat.set(repeat, repeat)
  }
  return new MeshPhysicalMaterial({
    color: 0xffffff, // the albedo map carries the colour now
    map: maps.albedo,
    roughnessMap: maps.roughness,
    normalMap: maps.normal,
    normalScale: new Vector2(0.38, 0.38),
    roughness: 1,
    metalness: 0,
    sheen,
    sheenColor: SHEEN_LILAC,
    // A rough sheen spreads the bloom over a wide band around the silhouette,
    // the way deep fur does. A tight sheen would read as satin.
    sheenRoughness: 0.72,
  })
}

export function createPalette(): Palette {
  return {
    fur: furMaterial(PURPLE, 0.85, 0x9e3779b9, 2),
    furDark: furMaterial(PURPLE_DARK, 0.6, 0x51ab3d7, 4),
    cream: furMaterial(CREAM, 0.95, 0x2f8a1c3, 3),
    nose: new MeshPhysicalMaterial({
      color: NOSE_PINK,
      roughness: 0.35,
      clearcoat: 0.6,
      clearcoatRoughness: 0.3,
    }),
    eyeWhite: new MeshPhysicalMaterial({
      color: 0xf6f2ea,
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
    }),
    // Wet, faintly self-lit amber. The clearcoat is what sells "eye" over
    // "painted bead".
    iris: new MeshPhysicalMaterial({
      color: IRIS_AMBER,
      roughness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      emissive: IRIS_AMBER,
      emissiveIntensity: 0.22,
    }),
    pupil: new MeshStandardMaterial({ color: VELCRO_BLACK, roughness: 0.08 }),
    highlight: new MeshBasicMaterial({ color: 0xffffff }),
    earInner: furMaterial(EAR_INNER, 0.5, 0x77c1a09, 5),
    whisker: new MeshStandardMaterial({ color: WHISKER, roughness: 0.5 }),
    cuff: new MeshStandardMaterial({ color: CUFF_RED, roughness: 0.95 }),
  }
}
