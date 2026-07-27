import { MeshBasicMaterial, MeshStandardMaterial } from 'three'

/**
 * A stylized-real cougar: real coat structure, purple instead of tawny. Real
 * pumas are a single near-uniform colour with a paler underside and darker
 * points on the muzzle, ear backs, and tail tip — that low-contrast scheme is
 * a large part of why they read as an animal rather than a toy, so the values
 * here stay close together instead of spanning bright plush hues.
 */
const PURPLE = 0x8f6ad6
/** Points: ear backs, toe pads, tail tip, brow shadow. */
const PURPLE_DARK = 0x5b3f96
/** Paler underside — belly, chin, muzzle patch. */
const CREAM = 0xe6dcc8
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

/** Shared materials, one instance per colour, reused across every mesh. */
export interface Palette {
  fur: MeshStandardMaterial
  furDark: MeshStandardMaterial
  cream: MeshStandardMaterial
  nose: MeshStandardMaterial
  eyeWhite: MeshStandardMaterial
  iris: MeshStandardMaterial
  pupil: MeshStandardMaterial
  highlight: MeshBasicMaterial
  earInner: MeshStandardMaterial
  whisker: MeshStandardMaterial
  cuff: MeshStandardMaterial
}

export function createPalette(): Palette {
  return {
    fur: new MeshStandardMaterial({ color: PURPLE, roughness: 0.85 }),
    furDark: new MeshStandardMaterial({ color: PURPLE_DARK, roughness: 0.85 }),
    cream: new MeshStandardMaterial({ color: CREAM, roughness: 0.9 }),
    nose: new MeshStandardMaterial({ color: NOSE_PINK, roughness: 0.5 }),
    eyeWhite: new MeshStandardMaterial({ color: 0xf6f2ea, roughness: 0.2 }),
    iris: new MeshStandardMaterial({
      color: IRIS_AMBER,
      roughness: 0.18,
      emissive: IRIS_AMBER,
      emissiveIntensity: 0.16,
    }),
    earInner: new MeshStandardMaterial({ color: EAR_INNER, roughness: 0.9 }),
    whisker: new MeshStandardMaterial({ color: WHISKER, roughness: 0.6 }),
    // Doubles as the velcro-patch material on the cuff — both are just a
    // near-black plush accent, and the interface has no spare slot for a
    // second dark colour.
    pupil: new MeshStandardMaterial({ color: VELCRO_BLACK, roughness: 0.4 }),
    highlight: new MeshBasicMaterial({ color: 0xffffff }),
    cuff: new MeshStandardMaterial({ color: CUFF_RED, roughness: 0.95 }),
  }
}
