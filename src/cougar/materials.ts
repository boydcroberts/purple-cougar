import { MeshBasicMaterial, MeshStandardMaterial } from 'three'

/** Purple plush fur, the character's main colour. */
const PURPLE = 0x9b6ef3
/** Shadowed fur — ears, toe bumps, tail tip. */
const PURPLE_DARK = 0x6d3fd1
/** Chest, belly, and (later) muzzle patch. */
const CREAM = 0xffe9c4
/** Nose. */
const NOSE_PINK = 0xff8fa8
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
  pupil: MeshStandardMaterial
  highlight: MeshBasicMaterial
  cuff: MeshStandardMaterial
}

export function createPalette(): Palette {
  return {
    fur: new MeshStandardMaterial({ color: PURPLE, roughness: 0.85 }),
    furDark: new MeshStandardMaterial({ color: PURPLE_DARK, roughness: 0.85 }),
    cream: new MeshStandardMaterial({ color: CREAM, roughness: 0.9 }),
    nose: new MeshStandardMaterial({ color: NOSE_PINK, roughness: 0.5 }),
    eyeWhite: new MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 }),
    // Doubles as the velcro-patch material on the cuff — both are just a
    // near-black plush accent, and the interface has no spare slot for a
    // second dark colour.
    pupil: new MeshStandardMaterial({ color: VELCRO_BLACK, roughness: 0.4 }),
    highlight: new MeshBasicMaterial({ color: 0xffffff }),
    cuff: new MeshStandardMaterial({ color: CUFF_RED, roughness: 0.95 }),
  }
}
