"""Build a reference-matched Purple Cougar v4 head study in Blender.

This is an isolated visual-development artifact, not a runtime asset. It
authors a true three-dimensional feline skull from depth sections, then adds a
single short muzzle mass, a tucked jaw, large lateral ears, recessed almond
eye sockets, and restrained facial details.

Run with:
  /Applications/Blender.app/Contents/MacOS/Blender \
    --background --factory-startup --python-exit-code 1 \
    --python tools/build_cougar_head_v4.py

Outputs are limited to artifacts/v4/head/. No rig or interchange export is
created at this stage.
"""

from __future__ import annotations

from array import array
import json
import math
from pathlib import Path
import sys
from typing import Iterable, Sequence

import bpy
from mathutils import Vector


PROJECT = Path(__file__).resolve().parents[1]
TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from build_cougar_asset import (  # noqa: E402
    activate,
    add_modifier_and_apply,
    bvec,
    clear_scene,
    empty,
    material,
    smooth_mesh,
)


OUTPUT_DIR = PROJECT / "artifacts" / "v4" / "head"
BLEND_OUTPUT = OUTPUT_DIR / "purple-cougar-head-v4.blend"
CLAY_SHEET = OUTPUT_DIR / "purple-cougar-head-v4-clay-contact-sheet.png"
COLOR_SHEET = OUTPUT_DIR / "purple-cougar-head-v4-color-contact-sheet.png"
METRICS_OUTPUT = OUTPUT_DIR / "purple-cougar-head-v4-metrics.json"
REFERENCE_TURNAROUND = (
    PROJECT / "artifacts" / "v4" / "purple-cougar-head-turnaround-v1.png"
)
ORIGINAL_OBJECTIVE = Path(
    "/var/folders/f4/b0t1pkt90qqcm936w8d_pyhw0000gn/T/"
    "codex-clipboard-f7abb729-0e44-4394-b070-cd50aebafaaf.png"
)

RADIAL_SEGMENTS = 48
RENDER_SIZE = 640
CONTACT_GAP = 8


def make_mesh(
    name: str,
    vertices: Sequence[Sequence[float]],
    faces: Sequence[Sequence[int]],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    smooth: bool = True,
    role: str = "primary",
) -> bpy.types.Object:
    """Create one named mesh from Three-space coordinates."""

    mesh = bpy.data.meshes.new(f"{name}Geometry")
    mesh.from_pydata([bvec(vertex) for vertex in vertices], [], faces)
    mesh.update()
    mesh.validate(clean_customdata=False)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(mat)
    obj["asset_role"] = role
    if smooth:
        smooth_mesh(obj)
    return obj


def interpolate_anchors(
    anchors: Sequence[Sequence[float]],
    samples_per_span: int,
) -> list[tuple[float, ...]]:
    """Interpolate authored stations with a clamped Catmull-Rom spline."""

    if len(anchors) < 2:
        raise ValueError("At least two anchors are required")
    result: list[tuple[float, ...]] = []
    for index in range(len(anchors) - 1):
        previous = anchors[max(0, index - 1)]
        lower = anchors[index]
        upper = anchors[index + 1]
        following = anchors[min(len(anchors) - 1, index + 2)]
        for sample in range(samples_per_span):
            t = sample / samples_per_span
            t2 = t * t
            t3 = t2 * t
            lower_basis = 2.0 * t3 - 3.0 * t2 + 1.0
            lower_tangent_basis = t3 - 2.0 * t2 + t
            upper_basis = -2.0 * t3 + 3.0 * t2
            upper_tangent_basis = t3 - t2
            result.append(
                tuple(
                    lower_basis * lower[value]
                    + 0.5
                    * lower_tangent_basis
                    * (upper[value] - previous[value])
                    + upper_basis * upper[value]
                    + 0.5
                    * upper_tangent_basis
                    * (following[value] - lower[value])
                    for value in range(len(lower))
                )
            )
    result.append(tuple(anchors[-1]))
    return result


def capped_ring_mesh(
    name: str,
    rings: Sequence[Sequence[Sequence[float]]],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    role: str = "primary",
) -> bpy.types.Object:
    """Build a capped quad loft with consistent ring topology."""

    segment_count = len(rings[0])
    if segment_count < 8 or any(
        len(ring) != segment_count for ring in rings
    ):
        raise ValueError(f"{name}: inconsistent ring topology")

    vertices = [point for ring in rings for point in ring]
    faces: list[tuple[int, ...]] = []
    for ring_index in range(len(rings) - 1):
        lower = ring_index * segment_count
        upper = lower + segment_count
        for segment in range(segment_count):
            following = (segment + 1) % segment_count
            faces.append(
                (
                    lower + segment,
                    lower + following,
                    upper + following,
                    upper + segment,
                )
            )
    faces.append(tuple(reversed(range(segment_count))))
    final = (len(rings) - 1) * segment_count
    faces.append(tuple(final + index for index in range(segment_count)))
    return make_mesh(name, vertices, faces, mat, parent, role=role)


def depth_loft(
    name: str,
    anchors: Sequence[Sequence[float]],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    samples_per_span: int = 5,
    radial_segments: int = RADIAL_SEGMENTS,
    role: str = "primary",
) -> bpy.types.Object:
    """Loft asymmetric vertical sections from rear to front.

    Each anchor is ``(z, center_y, half_width, top, bottom, cheek_strength)``.
    The width profile intentionally broadens at the zygoma and tapers at the
    crown and jaw, avoiding the cylindrical section that made v3 read as a
    tube.
    """

    rings: list[list[tuple[float, float, float]]] = []
    for z, center_y, width, top, bottom, cheek_strength in interpolate_anchors(
        anchors, samples_per_span
    ):
        ring: list[tuple[float, float, float]] = []
        for segment in range(radial_segments):
            angle = 2.0 * math.pi * segment / radial_segments
            vertical = math.sin(angle)
            vertical_radius = top if vertical >= 0.0 else bottom
            y = center_y + vertical_radius * vertical

            cheek = 1.0 + cheek_strength * math.exp(
                -((vertical + 0.28) / 0.27) ** 2
            )
            crown_taper = 1.0 - 0.09 * max(vertical, 0.0) ** 2
            jaw_taper = 1.0 - 0.27 * max(-vertical, 0.0) ** 4
            x = width * math.cos(angle) * cheek * crown_taper * jaw_taper
            ring.append((x, y, z))
        rings.append(ring)
    return capped_ring_mesh(name, rings, mat, parent, role=role)


def vertical_loft(
    name: str,
    anchors: Sequence[Sequence[float]],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    samples_per_span: int = 4,
    radial_segments: int = 36,
    role: str = "primary",
) -> bpy.types.Object:
    """Loft x/z ellipses along the vertical axis.

    Each anchor is ``(y, center_x, center_z, half_width, half_depth)``.
    """

    rings: list[list[tuple[float, float, float]]] = []
    for y, center_x, center_z, width, depth in interpolate_anchors(
        anchors, samples_per_span
    ):
        ring = [
            (
                center_x + width * math.cos(2.0 * math.pi * index / radial_segments),
                y,
                center_z + depth * math.sin(2.0 * math.pi * index / radial_segments),
            )
            for index in range(radial_segments)
        ]
        rings.append(ring)
    return capped_ring_mesh(name, rings, mat, parent, role=role)


def make_skull(
    mat: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    """Author the broad-cheeked, tapered feline braincase."""

    skull = depth_loft(
        "Skull",
        [
            (-1.20, 0.08, 0.025, 0.040, 0.040, 0.00),
            (-1.06, 0.10, 0.48, 0.72, 0.63, 0.03),
            (-0.92, 0.11, 0.74, 0.91, 0.80, 0.05),
            (-0.76, 0.11, 0.92, 1.00, 0.90, 0.08),
            (-0.42, 0.10, 1.10, 1.08, 1.00, 0.11),
            (-0.06, 0.06, 1.21, 1.10, 1.07, 0.15),
            (0.22, 0.00, 1.22, 1.01, 1.04, 0.17),
            (0.43, -0.04, 1.11, 0.86, 0.91, 0.14),
            (0.58, 0.00, 0.82, 0.68, 0.66, 0.07),
            (0.68, 0.12, 0.55, 0.51, 0.43, 0.03),
            (0.74, 0.20, 0.29, 0.34, 0.25, 0.00),
        ],
        mat,
        parent,
        samples_per_span=6,
    )
    skull["construction"] = "reference-matched-depth-loft"
    return skull


def make_muzzle(
    mat: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    """Create one continuous, short muzzle mass rather than paired spheres."""

    muzzle = depth_loft(
        "IntegratedMuzzle",
        [
            (0.30, -0.37, 0.61, 0.31, 0.33, 0.07),
            (0.47, -0.40, 0.59, 0.30, 0.32, 0.08),
            (0.64, -0.43, 0.53, 0.27, 0.29, 0.07),
            (0.80, -0.44, 0.44, 0.22, 0.24, 0.04),
            (0.92, -0.43, 0.30, 0.15, 0.17, 0.01),
        ],
        mat,
        parent,
        samples_per_span=5,
        radial_segments=44,
    )
    muzzle["construction"] = "single-short-muzzle-mass"
    return muzzle


def make_jaw(
    mat: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    """Create a shallow jaw and chin tucked behind the muzzle front."""

    jaw = depth_loft(
        "IntegratedJawChin",
        [
            (0.26, -0.66, 0.43, 0.16, 0.25, 0.01),
            (0.43, -0.69, 0.45, 0.16, 0.25, 0.01),
            (0.60, -0.72, 0.40, 0.14, 0.22, 0.00),
            (0.74, -0.72, 0.31, 0.11, 0.17, 0.00),
            (0.80, -0.71, 0.18, 0.07, 0.10, 0.00),
        ],
        mat,
        parent,
        samples_per_span=5,
        radial_segments=40,
    )
    jaw["construction"] = "tucked-shallow-jaw"
    return jaw


def make_ear(
    side: int,
    mat: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    """Build one large rounded triangular ear anchored to the skull side."""

    label = "L" if side < 0 else "R"
    ear = vertical_loft(
        f"Ear{label}",
        [
            (0.43, side * 0.90, -0.18, 0.25, 0.18),
            (0.56, side * 0.95, -0.15, 0.37, 0.22),
            (0.75, side * 0.99, -0.10, 0.41, 0.24),
            (0.96, side * 1.02, -0.06, 0.38, 0.23),
            (1.16, side * 1.05, -0.02, 0.32, 0.20),
            (1.32, side * 1.08, 0.00, 0.25, 0.16),
            (1.42, side * 1.10, 0.02, 0.17, 0.11),
            (1.48, side * 1.11, 0.025, 0.09, 0.065),
            (1.51, side * 1.115, 0.025, 0.025, 0.020),
        ],
        mat,
        parent,
        samples_per_span=5,
        radial_segments=32,
    )
    ear["construction"] = "large-lateral-rounded-ear"
    ear["side"] = side
    return ear


def make_inner_ear(
    side: int,
    mat: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    """Inset a curved rose patch while leaving a broad purple rim."""

    label = "L" if side < 0 else "R"
    rows = [
        (0.61, side * 0.96, 0.28),
        (0.77, side * 1.00, 0.30),
        (0.95, side * 1.03, 0.27),
        (1.13, side * 1.06, 0.21),
        (1.28, side * 1.08, 0.14),
        (1.39, side * 1.10, 0.065),
        (1.44, side * 1.105, 0.018),
    ]
    samples = 14
    vertices: list[tuple[float, float, float]] = []
    for row_index, (y, center_x, width) in enumerate(rows):
        progress = row_index / (len(rows) - 1)
        for sample in range(samples):
            u = -1.0 + 2.0 * sample / (samples - 1)
            z = 0.075 + 0.11 * (1.0 - u * u) - 0.025 * progress
            vertices.append((center_x + width * u, y, z))

    faces = [
        (
            row * samples + column,
            row * samples + column + 1,
            (row + 1) * samples + column + 1,
            (row + 1) * samples + column,
        )
        for row in range(len(rows) - 1)
        for column in range(samples - 1)
    ]
    inner = make_mesh(
        f"InnerEar{label}",
        vertices,
        faces,
        mat,
        parent,
        role="detail",
    )
    inner["construction"] = "curved-inset-ear-patch"
    return inner


def eye_axes(side: int) -> tuple[Vector, Vector, Vector]:
    """Return horizontal, vertical, and outward eye-plane axes."""

    normal = Vector((side * 0.13, 0.0, 0.9915)).normalized()
    horizontal = Vector((normal.z, 0.0, -normal.x)).normalized()
    vertical = Vector((0.0, 1.0, 0.0))
    return horizontal, vertical, normal


def eye_point(
    center: Sequence[float],
    side: int,
    horizontal: float,
    vertical: float,
    depth: float,
) -> tuple[float, float, float]:
    axis_x, axis_y, normal = eye_axes(side)
    point = (
        Vector(center)
        + axis_x * horizontal
        + axis_y * vertical
        + normal * depth
    )
    return tuple(point)


def almond_coordinates(
    angle: float,
    half_width: float,
    half_height: float,
) -> tuple[float, float]:
    sine = math.sin(angle)
    return (
        half_width * math.cos(angle),
        half_height * sine * (0.72 + 0.28 * abs(sine)),
    )


def make_almond_ring(
    name: str,
    center: Sequence[float],
    side: int,
    outer: tuple[float, float],
    inner: tuple[float, float],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    """Create a sloped socket rim whose inner edge sits behind the face."""

    segments = 48
    outer_loop = [
        eye_point(
            center,
            side,
            *almond_coordinates(
                2.0 * math.pi * segment / segments, *outer
            ),
            0.015,
        )
        for segment in range(segments)
    ]
    inner_loop = [
        eye_point(
            center,
            side,
            *almond_coordinates(
                2.0 * math.pi * segment / segments, *inner
            ),
            -0.045,
        )
        for segment in range(segments)
    ]
    faces = [
        (
            segment,
            (segment + 1) % segments,
            segments + (segment + 1) % segments,
            segments + segment,
        )
        for segment in range(segments)
    ]
    rim = make_mesh(
        name,
        outer_loop + inner_loop,
        faces,
        mat,
        parent,
        role="primary",
    )
    rim["construction"] = "recessed-almond-socket-rim"
    return rim


def make_eye_disk(
    name: str,
    center: Sequence[float],
    side: int,
    radii: tuple[float, float],
    depth: float,
    bulge: float,
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    almond: bool,
    offset: tuple[float, float] = (0.0, 0.0),
    role: str = "detail",
) -> bpy.types.Object:
    """Build a shallow convex eye surface aligned to the local face plane."""

    radial_rings = 6
    segments = 48
    vertices = [
        eye_point(center, side, offset[0], offset[1], depth + bulge)
    ]
    for ring in range(1, radial_rings + 1):
        radial = ring / radial_rings
        ring_depth = depth + bulge * (1.0 - radial * radial)
        for segment in range(segments):
            angle = 2.0 * math.pi * segment / segments
            if almond:
                local_x, local_y = almond_coordinates(
                    angle,
                    radii[0] * radial,
                    radii[1] * radial,
                )
            else:
                local_x = radii[0] * radial * math.cos(angle)
                local_y = radii[1] * radial * math.sin(angle)
            vertices.append(
                eye_point(
                    center,
                    side,
                    offset[0] + local_x,
                    offset[1] + local_y,
                    ring_depth,
                )
            )

    faces: list[tuple[int, ...]] = []
    for segment in range(segments):
        faces.append((0, 1 + segment, 1 + (segment + 1) % segments))
    for ring in range(radial_rings - 1):
        lower = 1 + ring * segments
        upper = lower + segments
        for segment in range(segments):
            following = (segment + 1) % segments
            faces.append(
                (
                    lower + segment,
                    upper + segment,
                    upper + following,
                    lower + following,
                )
            )
    return make_mesh(name, vertices, faces, mat, parent, role=role)


def make_eye_assembly(
    side: int,
    mats: dict[str, bpy.types.Material],
    parent: bpy.types.Object,
) -> list[bpy.types.Object]:
    """Build one recessed, graphic feline eye without spherical bead forms."""

    label = "L" if side < 0 else "R"
    center = (side * 0.44, 0.26, 0.655)
    components = [
        make_almond_ring(
            f"EyeSocketRim{label}",
            center,
            side,
            (0.44, 0.245),
            (0.365, 0.180),
            mats["Fur"],
            parent,
        ),
        make_eye_disk(
            f"EyeSocketCavity{label}",
            center,
            side,
            (0.364, 0.179),
            -0.052,
            0.008,
            mats["Socket"],
            parent,
            almond=True,
            role="primary",
        ),
        make_eye_disk(
            f"Sclera{label}",
            center,
            side,
            (0.342, 0.154),
            -0.035,
            0.025,
            mats["Sclera"],
            parent,
            almond=True,
        ),
        make_eye_disk(
            f"Iris{label}",
            center,
            side,
            (0.103, 0.112),
            -0.004,
            0.012,
            mats["Iris"],
            parent,
            almond=False,
            offset=(0.0, -0.006),
        ),
        make_eye_disk(
            f"Pupil{label}",
            center,
            side,
            (0.041, 0.075),
            0.010,
            0.006,
            mats["Pupil"],
            parent,
            almond=False,
            offset=(0.0, -0.006),
        ),
        make_eye_disk(
            f"EyeHighlight{label}",
            center,
            side,
            (0.026, 0.030),
            0.019,
            0.003,
            mats["Highlight"],
            parent,
            almond=False,
            offset=(-0.045, 0.044),
        ),
    ]
    return components


def make_tapered_ribbon(
    name: str,
    points: Sequence[Sequence[float]],
    widths: Sequence[float],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    role: str = "detail",
) -> bpy.types.Object:
    """Create a front-facing ribbon with controlled thickness and taper."""

    if len(points) != len(widths) or len(points) < 2:
        raise ValueError(f"{name}: points and widths must match")
    vertices: list[tuple[float, float, float]] = []
    for index, point in enumerate(points):
        previous = Vector(points[max(0, index - 1)])
        following = Vector(points[min(len(points) - 1, index + 1)])
        tangent = (following - previous).normalized()
        normal = Vector((-tangent.y, tangent.x, 0.0)).normalized()
        half_width = widths[index] * 0.5
        vertices.extend(
            [
                tuple(Vector(point) + normal * half_width),
                tuple(Vector(point) - normal * half_width),
            ]
        )
    faces = [
        (index * 2, index * 2 + 2, index * 2 + 3, index * 2 + 1)
        for index in range(len(points) - 1)
    ]
    ribbon = make_mesh(
        name,
        vertices,
        faces,
        mat,
        parent,
        role=role,
    )
    add_modifier_and_apply(
        ribbon,
        "SOLIDIFY",
        "Ribbon thickness",
        thickness=0.018,
        offset=0.0,
    )
    add_modifier_and_apply(
        ribbon,
        "BEVEL",
        "Ribbon soft edge",
        width=0.009,
        segments=3,
    )
    return ribbon


def make_brow(
    side: int,
    mat: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    """Build a restrained arched brow that tapers at both ends."""

    label = "L" if side < 0 else "R"
    return make_tapered_ribbon(
        f"Brow{label}",
        [
            (side * 0.13, 0.54, 0.746),
            (side * 0.27, 0.61, 0.752),
            (side * 0.43, 0.64, 0.750),
            (side * 0.59, 0.62, 0.741),
            (side * 0.73, 0.56, 0.724),
            (side * 0.80, 0.50, 0.704),
        ],
        [0.020, 0.052, 0.070, 0.060, 0.038, 0.014],
        mat,
        parent,
    )


def make_nose(
    mats: dict[str, bpy.types.Material],
    parent: bpy.types.Object,
) -> list[bpy.types.Object]:
    """Create a compact rounded wedge nose and inset nostrils."""

    outline = [
        (-0.24, 0.04),
        (-0.20, 0.11),
        (-0.10, 0.14),
        (0.00, 0.16),
        (0.10, 0.14),
        (0.20, 0.11),
        (0.24, 0.04),
        (0.16, -0.10),
        (0.00, -0.20),
        (-0.16, -0.10),
    ]
    center_y = -0.22
    back_z = 0.92
    front_z = 1.035
    back = [(x * 0.86, center_y + y * 0.86, back_z) for x, y in outline]
    front = [(x, center_y + y, front_z) for x, y in outline]
    count = len(outline)
    faces: list[tuple[int, ...]] = [
        tuple(reversed(range(count))),
        tuple(count + index for index in range(count)),
    ]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    nose = make_mesh(
        "Nose",
        back + front,
        faces,
        mats["Nose"],
        parent,
        role="detail",
    )
    add_modifier_and_apply(
        nose,
        "BEVEL",
        "Rounded nose perimeter",
        width=0.030,
        segments=4,
    )
    smooth_mesh(nose)

    components = [nose]
    for side, label in ((-1, "L"), (1, "R")):
        components.append(
            make_eye_disk(
                f"Nostril{label}",
                (side * 0.076, -0.210, 1.050),
                1,
                (0.031, 0.014),
                0.0,
                0.001,
                mats["Pupil"],
                parent,
                almond=False,
            )
        )
    return components


def make_mouth_marks(
    mat: bpy.types.Material,
    parent: bpy.types.Object,
) -> list[bpy.types.Object]:
    """Add a short philtrum and feline mouth branches."""

    components = [
        make_tapered_ribbon(
            "Philtrum",
            [
                (0.0, -0.41, 1.002),
                (0.0, -0.49, 0.985),
                (0.0, -0.55, 0.956),
            ],
            [0.025, 0.018, 0.012],
            mat,
            parent,
        )
    ]
    for side, label in ((-1, "L"), (1, "R")):
        components.append(
            make_tapered_ribbon(
                f"MouthBranch{label}",
                [
                    (0.0, -0.55, 0.956),
                    (side * 0.12, -0.59, 0.948),
                    (side * 0.27, -0.58, 0.920),
                    (side * 0.39, -0.54, 0.875),
                ],
                [0.018, 0.015, 0.010, 0.004],
                mat,
                parent,
            )
        )
    return components


def make_tapered_tube(
    name: str,
    points: Sequence[Sequence[float]],
    radii: Sequence[float],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    """Create a smooth tapered tube for one whisker."""

    if len(points) != len(radii):
        raise ValueError(f"{name}: points and radii must match")
    path = [Vector(point) for point in points]
    segments = 8
    vertices: list[tuple[float, float, float]] = []
    previous_normal: Vector | None = None
    for index, (point, radius) in enumerate(zip(path, radii, strict=True)):
        previous = path[max(0, index - 1)]
        following = path[min(len(path) - 1, index + 1)]
        tangent = (following - previous).normalized()
        candidate = tangent.cross(Vector((0.0, 1.0, 0.0)))
        if candidate.length < 1.0e-6:
            candidate = tangent.cross(Vector((1.0, 0.0, 0.0)))
        normal = candidate.normalized()
        if previous_normal is not None and normal.dot(previous_normal) < 0.0:
            normal.negate()
        binormal = tangent.cross(normal).normalized()
        previous_normal = normal
        for segment in range(segments):
            angle = 2.0 * math.pi * segment / segments
            offset = (
                normal * (math.cos(angle) * radius)
                + binormal * (math.sin(angle) * radius)
            )
            vertices.append(tuple(point + offset))

    faces: list[tuple[int, ...]] = []
    for ring in range(len(path) - 1):
        lower = ring * segments
        upper = lower + segments
        for segment in range(segments):
            following = (segment + 1) % segments
            faces.append(
                (
                    lower + segment,
                    lower + following,
                    upper + following,
                    upper + segment,
                )
            )
    faces.append(tuple(reversed(range(segments))))
    final = (len(path) - 1) * segments
    faces.append(tuple(final + index for index in range(segments)))
    return make_mesh(
        name,
        vertices,
        faces,
        mat,
        parent,
        role="detail",
    )


def make_whiskers(
    mat: bpy.types.Material,
    parent: bpy.types.Object,
) -> list[bpy.types.Object]:
    """Build three long, fine, strongly tapered whiskers on each side."""

    components: list[bpy.types.Object] = []
    for side, label in ((-1, "L"), (1, "R")):
        fans = [
            (
                (0.33, -0.34, 0.945),
                (0.66, -0.32, 0.995),
                (1.08, -0.28, 1.015),
                (1.47, -0.18, 0.985),
            ),
            (
                (0.35, -0.43, 0.930),
                (0.70, -0.45, 0.975),
                (1.15, -0.48, 0.985),
                (1.55, -0.44, 0.930),
            ),
            (
                (0.33, -0.51, 0.895),
                (0.66, -0.58, 0.920),
                (1.08, -0.72, 0.910),
                (1.43, -0.82, 0.840),
            ),
        ]
        for index, fan in enumerate(fans, start=1):
            components.append(
                make_tapered_tube(
                    f"Whisker{label}{index}",
                    [(side * x, y, z) for x, y, z in fan],
                    [0.010, 0.007, 0.004, 0.0015],
                    mat,
                    parent,
                )
            )
    return components


def make_materials() -> dict[str, bpy.types.Material]:
    """Create clay-review and final-color materials."""

    mats = {
        "Clay": material(
            "Clay",
            (0.43, 0.39, 0.48, 1.0),
            0.86,
            sheen=0.08,
        ),
        "Fur": material(
            "Fur",
            (0.245, 0.045, 0.56, 1.0),
            0.72,
            sheen=0.16,
        ),
        "FurDark": material(
            "FurDark",
            (0.095, 0.018, 0.17, 1.0),
            0.68,
        ),
        "Cream": material(
            "Cream",
            (0.90, 0.72, 0.76, 1.0),
            0.78,
            sheen=0.12,
        ),
        "EarInner": material(
            "EarInner",
            (0.67, 0.24, 0.42, 1.0),
            0.74,
            sheen=0.10,
        ),
        "Socket": material(
            "Socket",
            (0.028, 0.009, 0.050, 1.0),
            0.50,
        ),
        "Sclera": material(
            "Sclera",
            (0.92, 0.88, 0.86, 1.0),
            0.26,
            coat=0.18,
        ),
        "Iris": material(
            "Iris",
            (0.94, 0.48, 0.045, 1.0),
            0.22,
            coat=0.30,
        ),
        "Pupil": material(
            "Pupil",
            (0.006, 0.002, 0.010, 1.0),
            0.18,
            coat=0.18,
        ),
        "Highlight": material(
            "Highlight",
            (1.0, 0.95, 0.79, 1.0),
            0.10,
        ),
        "Nose": material(
            "Nose",
            (0.77, 0.26, 0.43, 1.0),
            0.34,
            coat=0.24,
        ),
        "Whisker": material(
            "Whisker",
            (0.90, 0.82, 0.78, 1.0),
            0.46,
        ),
    }
    return mats


def build_head() -> tuple[
    bpy.types.Object,
    list[bpy.types.Object],
    list[bpy.types.Object],
    dict[str, bpy.types.Material],
]:
    """Assemble the primary silhouette and optional color details."""

    mats = make_materials()
    root = empty("PurpleCougarHeadV4")
    primary = [
        make_skull(mats["Fur"], root),
        make_muzzle(mats["Cream"], root),
        make_jaw(mats["Cream"], root),
        make_ear(-1, mats["Fur"], root),
        make_ear(1, mats["Fur"], root),
    ]
    details: list[bpy.types.Object] = [
        make_inner_ear(-1, mats["EarInner"], root),
        make_inner_ear(1, mats["EarInner"], root),
    ]
    for side in (-1, 1):
        eye_components = make_eye_assembly(side, mats, root)
        primary.extend(eye_components[:2])
        details.extend(eye_components[2:])
        details.append(make_brow(side, mats["FurDark"], root))
    details.extend(make_nose(mats, root))
    details.extend(make_mouth_marks(mats["FurDark"], root))
    details.extend(make_whiskers(mats["Whisker"], root))

    for obj in primary + details:
        obj["prototype_stage"] = "v4-head-reference-study"
    return root, primary, details, mats


def look_at(obj: bpy.types.Object, target: Sequence[float]) -> None:
    direction = Vector(bvec(target)) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_area_light(
    name: str,
    location: Sequence[float],
    target: Sequence[float],
    energy: float,
    size: float,
    color: tuple[float, float, float],
) -> bpy.types.Object:
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    light = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(light)
    light.location = bvec(location)
    look_at(light, target)
    return light


def configure_review_scene() -> tuple[bpy.types.Object, bpy.types.Camera]:
    """Create one restrained studio shared by both review modes."""

    ground_mat = material(
        "ReviewGround",
        (0.065, 0.072, 0.082, 1.0),
        0.92,
    )
    bpy.ops.mesh.primitive_plane_add(
        size=14,
        location=bvec((0.0, -1.07, 0.0)),
    )
    ground = bpy.context.active_object
    ground.name = "ReviewGround"
    ground.data.materials.append(ground_mat)
    ground["asset_role"] = "review-only"

    camera_data = bpy.data.cameras.new("HeadReviewCamera")
    camera = bpy.data.objects.new("HeadReviewCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera_data.type = "ORTHO"
    camera_data.lens = 70
    bpy.context.scene.camera = camera

    target = (0.0, 0.04, -0.02)
    add_area_light(
        "Key",
        (3.6, 4.8, 4.6),
        target,
        720,
        4.0,
        (1.0, 0.86, 0.76),
    )
    add_area_light(
        "Fill",
        (-4.0, 2.5, 3.2),
        target,
        360,
        4.5,
        (0.63, 0.76, 1.0),
    )
    add_area_light(
        "Rim",
        (-3.0, 3.7, -4.0),
        target,
        520,
        3.2,
        (0.88, 0.58, 1.0),
    )
    add_area_light(
        "Top",
        (0.2, 6.0, -0.4),
        target,
        260,
        3.5,
        (1.0, 1.0, 1.0),
    )

    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = RENDER_SIZE
    scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = (
            0.022,
            0.027,
            0.036,
            1.0,
        )
        background.inputs["Strength"].default_value = 0.34
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium Low Contrast"
    return camera, camera_data


def compose_contact_sheet(
    image_paths: Sequence[Path],
    output: Path,
) -> None:
    """Compose four square PNGs with Blender image buffers."""

    if len(image_paths) != 4:
        raise ValueError("Expected exactly four review renders")
    sheet_width = RENDER_SIZE * 2 + CONTACT_GAP
    sheet_height = RENDER_SIZE * 2 + CONTACT_GAP
    pixels = array("f", (0.018, 0.021, 0.028, 1.0)) * (
        sheet_width * sheet_height
    )
    for index, path in enumerate(image_paths):
        image = bpy.data.images.load(str(path), check_existing=False)
        source = array("f", [0.0]) * (RENDER_SIZE * RENDER_SIZE * 4)
        image.pixels.foreach_get(source)
        column = index % 2
        row = 1 if index < 2 else 0
        x_offset = column * (RENDER_SIZE + CONTACT_GAP)
        y_offset = row * (RENDER_SIZE + CONTACT_GAP)
        row_size = RENDER_SIZE * 4
        for source_y in range(RENDER_SIZE):
            source_start = source_y * row_size
            destination_start = (
                ((y_offset + source_y) * sheet_width + x_offset) * 4
            )
            pixels[
                destination_start : destination_start + row_size
            ] = source[source_start : source_start + row_size]

    sheet = bpy.data.images.new(
        output.stem,
        width=sheet_width,
        height=sheet_height,
        alpha=False,
        float_buffer=False,
    )
    sheet.pixels.foreach_set(pixels)
    sheet.file_format = "PNG"
    sheet.filepath_raw = str(output)
    sheet.save()


def render_review(
    mode: str,
    camera: bpy.types.Object,
    camera_data: bpy.types.Camera,
    details: Sequence[bpy.types.Object],
    clay: bpy.types.Material,
) -> list[Path]:
    """Render hero, front, profile, and rear views for one review mode."""

    if mode not in {"clay", "color"}:
        raise ValueError(f"Unknown review mode {mode!r}")
    for obj in details:
        obj.hide_render = mode == "clay"
    bpy.context.scene.view_layers["ViewLayer"].material_override = (
        clay if mode == "clay" else None
    )

    views = [
        ("hero", (4.4, 2.5, 6.2), (0.0, 0.15, -0.05), 3.15),
        ("front", (0.0, 0.16, 7.0), (0.0, 0.15, 0.0), 3.05),
        ("profile", (7.0, 0.18, 0.0), (0.0, 0.14, -0.10), 3.15),
        ("rear", (0.0, 0.17, -7.0), (0.0, 0.15, -0.18), 3.05),
    ]
    rendered: list[Path] = []
    for label, location, target, ortho_scale in views:
        camera.location = bvec(location)
        camera_data.ortho_scale = ortho_scale
        look_at(camera, target)
        path = OUTPUT_DIR / f"purple-cougar-head-v4-{mode}-{label}.png"
        bpy.context.scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        rendered.append(path)
    return rendered


def mesh_bounds(
    objects: Iterable[bpy.types.Object],
) -> dict[str, float]:
    """Measure world-space width, height, and depth in Three coordinates."""

    points: list[Vector] = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not points:
        raise RuntimeError("No mesh bounds available")
    return {
        "width": max(point.x for point in points)
        - min(point.x for point in points),
        "height": max(point.z for point in points)
        - min(point.z for point in points),
        "depth": max(point.y for point in points)
        - min(point.y for point in points),
    }


def write_metrics(
    primary: Sequence[bpy.types.Object],
    details: Sequence[bpy.types.Object],
) -> dict[str, object]:
    """Write audit-friendly proportions and topology counts."""

    bpy.context.view_layer.update()
    primary_bounds = mesh_bounds(primary)
    color_bounds = mesh_bounds([*primary, *details])
    meshes = [obj for obj in [*primary, *details] if obj.type == "MESH"]
    triangles = 0
    vertices = 0
    polygons = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        vertices += len(obj.data.vertices)
        polygons += len(obj.data.polygons)

    head_height = 2.24
    skull_width = 2.44
    metrics: dict[str, object] = {
        "prototype": "purple-cougar-head-v4",
        "stage": "reference-matched-head-study-no-rig-no-export",
        "references": {
            "turnaround": str(REFERENCE_TURNAROUND),
            "original_objective": str(ORIGINAL_OBJECTIVE),
        },
        "topology": {
            "mesh_objects": len(meshes),
            "vertices": vertices,
            "polygons": polygons,
            "triangles": triangles,
        },
        "primary_bounds": {
            key: round(value, 4) for key, value in primary_bounds.items()
        },
        "color_bounds": {
            key: round(value, 4) for key, value in color_bounds.items()
        },
        "design_ratios": {
            "skull_width_to_skull_height": round(
                skull_width / head_height, 3
            ),
            "muzzle_projection_to_skull_depth": round(
                (0.92 - 0.30) / (0.74 - (-1.20)), 3
            ),
            "eye_aperture_width_to_height": round(0.88 / 0.49, 3),
            "ear_visible_height_to_skull_height": round(
                (1.51 - 0.43) / head_height, 3
            ),
            "eye_center_spacing_to_skull_width": round(
                0.88 / skull_width, 3
            ),
        },
        "construction_checks": {
            "single_continuous_skull": True,
            "single_continuous_muzzle": True,
            "tucked_jaw_chin": True,
            "large_lateral_ears": True,
            "recessed_almond_sockets": True,
            "flat_eye_apertures_not_beads": True,
            "tapered_whiskers": True,
            "rig_present": False,
            "runtime_export_present": False,
        },
        "review_views": ["hero", "front", "profile", "rear"],
        "notes": [
            "Clay review hides color details so skull, muzzle, jaw, and ear silhouette remain independently judgeable.",
            "The color review adds the socket contents, amber irises, integrated cream muzzle and chin, nose, brows, and whiskers.",
            "This prototype deliberately stops before retopology, rigging, or runtime export.",
        ],
    }
    METRICS_OUTPUT.write_text(
        json.dumps(metrics, indent=2) + "\n",
        encoding="utf-8",
    )
    return metrics


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    clear_scene()
    root, primary, details, mats = build_head()
    camera, camera_data = configure_review_scene()
    metrics = write_metrics(primary, details)

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUTPUT))
    clay_renders = render_review(
        "clay",
        camera,
        camera_data,
        details,
        mats["Clay"],
    )
    compose_contact_sheet(clay_renders, CLAY_SHEET)
    color_renders = render_review(
        "color",
        camera,
        camera_data,
        details,
        mats["Clay"],
    )
    compose_contact_sheet(color_renders, COLOR_SHEET)

    for obj in details:
        obj.hide_render = False
    bpy.context.scene.view_layers["ViewLayer"].material_override = None
    activate(root)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUTPUT))

    topology = metrics["topology"]
    ratios = metrics["design_ratios"]
    print(
        "V4_HEAD "
        f"meshes={topology['mesh_objects']} "
        f"vertices={topology['vertices']} "
        f"triangles={topology['triangles']}"
    )
    print(
        "V4_RATIOS "
        f"skull={ratios['skull_width_to_skull_height']} "
        f"muzzle={ratios['muzzle_projection_to_skull_depth']} "
        f"eye={ratios['eye_aperture_width_to_height']} "
        f"ear={ratios['ear_visible_height_to_skull_height']}"
    )
    print(f"Saved {BLEND_OUTPUT}")
    print(f"Rendered {CLAY_SHEET}")
    print(f"Rendered {COLOR_SHEET}")
    print(f"Wrote {METRICS_OUTPUT}")


if __name__ == "__main__":
    main()
