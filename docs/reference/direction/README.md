# Character direction (2026-08-06)

The owner's new art direction for **everything** — cougar, squirrel, toy, and
how they sit in the world. These supersede the older adult-cougar hero and the
photoreal/chroma-keyed critters. Check work against these, not taste alone.

## The plates

- `direction-contact-sheet-v1.webp` — 16 scenes, 4x4. Establishes the range:
  waterfall, rose arch, wisteria picnic, paddleboard, night sky, steam train,
  round green door, drinking from a stream.
- `direction-contact-sheet-v2.webp` — 6 scenes at 512px. **The two top panels
  are the only full-body standing cougar references**; the shipped hero plate
  is cut from the rose-arch panel.
- `cougar-squirrel-waterfall-hero-v1.webp` — the money shot. Best read on the
  toy, the cord, and how the two characters share one light.
- `cougar-squirrel-fireworks-hero-v1.webp` — the same pair at night.
- `squirrel-waterfall-hero-v1.webp`, `squirrel-rose-path-hero-v1.webp` —
  full-resolution squirrel. The shipped squirrel plate is cut from the
  rose-path one.

## What they lock in

**Cougar** is a *cub*, not the lanky adult she used to be: big head, short
muzzle, chunky paws, rounded body, long tail with a curl. Huge violet eyes
with white sclera and strong dark brows — the brows are most of the
expression. Cream muzzle, chest, and belly.

**White squirrel** is a **co-star, not an easter egg**. She is beside the
cougar in every single reference. Violet eyes, oversized fluffy tail, upright
begging pose, joyful open mouth.

**Toy**: deep orange ball with green wavy meridian stripes, and a **thick
purple braided cord** with visible slack, running to a band cuff on the leg.
(The older brief's black cord and red velcro cuff are superseded.)

**Light**: warm golden-hour key with a strong rim separating purple fur from
green foliage; dense layered wildflowers in the foreground; shallow depth of
field behind the characters. Characters must sit *in* that light, not on top
of it — a cutout that misses the grade reads as a sticker immediately.

## Cutting new plates

`tools/subject-cutout.swift` lifts a subject to a real alpha matte using
Vision's foreground-instance mask. Use it instead of a chroma key — the old
green-screen plates fringed every antialiased hair.

    swift tools/subject-cutout.swift <in.png> <out.png> [instanceIndex]

It prints the matted subject's tight bounding box as JSON so you can crop and
record pixel anchors without reopening the file. Two caveats:

- It **drops very thin features** (it ate the butterfly's antennae). For a
  subject already on a flat key colour, a green-dominance key plus despill in
  ImageMagick keeps them — that is how the swallowtail plate was cut.
- Touching subjects come back as **one instance**, not two.

**Swapping the hero plate is never just a URL change.** Every deformation
anchor in `src/cougar/heroBillboard.ts` — ears, head mask and pivot, shoulder,
tail centreline, cuff, alpha trim — is pixel-measured against one exact image.
Re-measure them all, and update `test/hero-driver.test.ts`'s UV samples in the
same commit.
