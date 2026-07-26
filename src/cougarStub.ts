import {
  BoxGeometry,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import { ANKLE, HOP_HEIGHT } from './constants'

const PURPLE = 0x8b5cf6
const PURPLE_DARK = 0x6d3fd1
const CREAM = 0xfde68a

export interface Cougar {
  group: Group
  /** Live world position of the cuffed ankle. Updated by pose(). */
  ankleWorld: Vector3
  pose(hopP: number, tumbleP: number): void
}

export function createCougar(): Cougar {
  const fur = new MeshStandardMaterial({ color: PURPLE, roughness: 0.85 })
  const furDark = new MeshStandardMaterial({
    color: PURPLE_DARK,
    roughness: 0.85,
  })
  const muzzle = new MeshStandardMaterial({ color: CREAM, roughness: 0.9 })

  const group = new Group()

  // Body — upright, cartoon proportions. A quadruped cannot use a skip-ball.
  const body = new Mesh(new CapsuleGeometry(0.34, 0.62, 6, 16), fur)
  body.position.y = 1.02
  body.castShadow = true
  group.add(body)

  const head = new Mesh(new SphereGeometry(0.32, 20, 16), fur)
  head.position.y = 1.62
  head.castShadow = true
  group.add(head)

  const snout = new Mesh(new SphereGeometry(0.15, 16, 12), muzzle)
  snout.position.set(0, 1.54, 0.26)
  group.add(snout)

  for (const side of [-1, 1]) {
    const ear = new Mesh(new SphereGeometry(0.1, 12, 10), furDark)
    ear.position.set(side * 0.2, 1.85, -0.02)
    group.add(ear)

    const arm = new Mesh(new CapsuleGeometry(0.1, 0.4, 4, 10), fur)
    arm.position.set(side * 0.44, 1.06, 0)
    arm.rotation.z = side * 0.35
    arm.castShadow = true
    group.add(arm)
  }

  // Legs. The right one wears the cuff; the left one is what has to clear the cord.
  const legs: Mesh[] = []
  for (const side of [-1, 1]) {
    const leg = new Mesh(new CapsuleGeometry(0.13, 0.44, 4, 10), fur)
    leg.position.set(side * ANKLE.x, 0.52, 0)
    leg.castShadow = true
    group.add(leg)
    legs.push(leg)

    const foot = new Mesh(new BoxGeometry(0.24, 0.12, 0.34), furDark)
    foot.position.set(side * ANKLE.x, 0.06, 0.06)
    foot.castShadow = true
    group.add(foot)
  }
  const leftLeg = legs[0]!
  const rightLeg = legs[1]!

  const tail = new Mesh(new CapsuleGeometry(0.07, 0.7, 4, 10), fur)
  tail.position.set(0, 0.95, -0.42)
  tail.rotation.x = 0.7
  group.add(tail)

  const ankleWorld = new Vector3(ANKLE.x, ANKLE.y, ANKLE.z)

  function pose(hopP: number, tumbleP: number): void {
    // --- Hop: a sine arc up and back down, with a squash on takeoff and landing.
    const lift = hopP > 0 ? Math.sin(Math.PI * hopP) * HOP_HEIGHT : 0
    const squash = hopP > 0 ? 1 - Math.sin(Math.PI * hopP) * 0.12 : 1

    // --- Tumble: fall flat, lie there, then pop back upright at the very end.
    // tumbleP runs across the whole tumble+pause beat.
    let roll = 0
    let drop = 0
    if (tumbleP > 0) {
      const fall = Math.min(1, tumbleP / 0.28)
      const rise = tumbleP > 0.86 ? (tumbleP - 0.86) / 0.14 : 0
      const down = fall * (1 - rise)
      roll = down * (Math.PI / 2)
      drop = down * -0.34
    }

    group.position.y = lift + drop
    group.rotation.z = roll
    group.scale.set(1 / squash, squash, 1 / squash)

    // Free (left) leg tucks up during the hop — this is the leg clearing the cord.
    leftLeg.position.y = 0.52 + (hopP > 0 ? Math.sin(Math.PI * hopP) * 0.12 : 0)
    rightLeg.position.y = 0.52

    // The cuffed ankle rides with the body; the cord anchors here.
    ankleWorld.set(ANKLE.x, ANKLE.y + group.position.y, ANKLE.z)
    if (roll !== 0) ankleWorld.applyAxisAngle(new Vector3(0, 0, 1), roll)

    tail.rotation.z = Math.sin(hopP * Math.PI) * 0.3
  }

  pose(0, 0)

  return { group, ankleWorld, pose }
}
