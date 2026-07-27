"""Build the Purple Cougar v3 measured silhouette and neutral-clay review sheet.

Run with:
  /Applications/Blender.app/Contents/MacOS/Blender \
    --background --factory-startup --python-exit-code 1 \
    --python tools/build_cougar_asset_v3.py

Every primary form is authored as a section-to-section loft: no sphere stacks,
curve tubes, or metaballs. The approved silhouette receives recessed feline
eyes, integrated markings, compact facial details, whiskers, toe grooves, and a
rigged cuff. The single joined mesh retains the runtime skin, node, material,
triangle, and primitive contracts.
"""

from __future__ import annotations

from array import array
import math
import os
import sys
from pathlib import Path
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


OUTPUT = Path(
    os.environ.get(
        "PURPLE_COUGAR_V3_OUTPUT",
        PROJECT / "public" / "assets" / "purple-cougar-v3.glb",
    )
)
PREVIEW = Path(
    os.environ.get(
        "PURPLE_COUGAR_V3_PREVIEW",
        PROJECT / "artifacts" / "purple-cougar-v3-fourth-contact-sheet.png",
    )
)
BLEND_SOURCE = Path(
    os.environ.get(
        "PURPLE_COUGAR_V3_BLEND",
        PROJECT / "artifacts" / "purple-cougar-v3.blend",
    )
)

REQUIRED_BONES = (
    "neck",
    "head",
    "leftEar",
    "rightEar",
    "legFL",
    "legFR",
    "legHL",
    "legHR",
    "tail",
    "cuffAnchor",
)
REQUIRED_MATERIALS = (
    "Fur",
    "FurDark",
    "Cream",
    "Nose",
    "EyeWhite",
    "Iris",
    "Pupil",
    "Highlight",
    "EarInner",
    "Whisker",
    "Cuff",
)
FUR_BASE_COLOR = (0.105, 0.014, 0.245, 1.0)
CREAM_BASE_COLOR = (0.88, 0.68, 0.84, 1.0)
TRIANGLE_BUDGET = 60_000


def freeze_transform(obj: bpy.types.Object) -> bpy.types.Object:
    """Bake a construction object's transform before skin binding."""

    activate(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if obj.type == "MESH" and obj.data.polygons:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        smooth_mesh(obj)
    return obj


def rigid_weight(obj: bpy.types.Object, bone_name: str) -> bpy.types.Object:
    """Assign one deterministic bone influence to a complete loft shell."""

    if obj.type != "MESH":
        raise TypeError(f"{obj.name}: expected a mesh before skin weighting")
    group = obj.vertex_groups.get(bone_name) or obj.vertex_groups.new(
        name=bone_name
    )
    group.add(range(len(obj.data.vertices)), 1.0, "REPLACE")
    obj["rig_component"] = bone_name
    return obj


def prepare_component(
    obj: bpy.types.Object,
    bone_name: str,
) -> bpy.types.Object:
    freeze_transform(obj)
    return rigid_weight(obj, bone_name)


def interpolate_sections(
    anchors: Sequence[Sequence[float]],
    samples_per_span: int = 5,
) -> list[tuple[float, ...]]:
    """Interpolate stations with a clamped C1 Catmull-Rom spline."""

    if len(anchors) < 2:
        raise ValueError("A loft requires at least two anchor sections")
    width = len(anchors[0])
    if any(len(anchor) != width for anchor in anchors):
        raise ValueError("All loft anchors must have the same arity")

    sections: list[tuple[float, ...]] = []
    tangent_scale = 0.5
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
            sections.append(
                tuple(
                    lower_basis * lower[value]
                    + lower_tangent_basis
                    * tangent_scale
                    * (upper[value] - previous[value])
                    + upper_basis * upper[value]
                    + upper_tangent_basis
                    * tangent_scale
                    * (following[value] - lower[value])
                    for value in range(width)
                )
            )
    sections.append(tuple(anchors[-1]))
    return sections


def ring_mesh(
    name: str,
    rings: Sequence[Sequence[Sequence[float]]],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    """Build one capped watertight quad loft from Three-space rings."""

    if len(rings) < 2:
        raise ValueError(f"{name}: expected at least two rings")
    radial_segments = len(rings[0])
    if radial_segments < 6 or any(
        len(ring) != radial_segments for ring in rings
    ):
        raise ValueError(f"{name}: inconsistent or undersized rings")

    vertices = [bvec(point) for ring in rings for point in ring]
    faces: list[tuple[int, ...]] = []
    for longitudinal in range(len(rings) - 1):
        current = longitudinal * radial_segments
        following_ring = current + radial_segments
        for radial in range(radial_segments):
            following = (radial + 1) % radial_segments
            faces.append(
                (
                    current + radial,
                    current + following,
                    following_ring + following,
                    following_ring + radial,
                )
            )

    faces.append(tuple(reversed(range(radial_segments))))
    final_ring = (len(rings) - 1) * radial_segments
    faces.append(
        tuple(final_ring + radial for radial in range(radial_segments))
    )

    mesh = bpy.data.meshes.new(f"{name}Geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    mesh.validate(clean_customdata=False)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(mat)
    smooth_mesh(obj)
    return obj


def z_axis_loft(
    name: str,
    anchors: Sequence[Sequence[float]],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    radial_segments: int = 36,
    samples_per_span: int = 5,
) -> bpy.types.Object:
    """Loft asymmetric x/y rings ordered along Three-space z."""

    sections = interpolate_sections(anchors, samples_per_span)
    rings: list[list[tuple[float, float, float]]] = []
    for section in sections:
        z, center_y, half_width, dorsal, ventral = section[:5]
        lower_width_scale = section[5] if len(section) > 5 else 1.0
        average_height = 0.5 * (dorsal + ventral)
        height_bias = 0.5 * (dorsal - ventral)
        ring: list[tuple[float, float, float]] = []
        for radial in range(radial_segments):
            angle = 2.0 * math.pi * radial / radial_segments
            sine = math.sin(angle)
            width_scale = 1.0
            if sine < 0.0:
                width_scale -= (1.0 - lower_width_scale) * (-sine) ** 1.4
            ring.append(
                (
                    half_width * width_scale * math.cos(angle),
                    center_y
                    + sine * (average_height + height_bias * sine),
                    z,
                )
            )
        rings.append(ring)
    return ring_mesh(name, rings, mat, parent)


def vertical_loft(
    name: str,
    anchors: Sequence[Sequence[float]],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    radial_segments: int = 30,
    samples_per_span: int = 4,
) -> bpy.types.Object:
    """Loft horizontal limb sections from sole to shoulder or hip."""

    sections = interpolate_sections(anchors, samples_per_span)
    rings: list[list[tuple[float, float, float]]] = []
    for section in sections:
        y, center_x, center_z, half_width, half_depth = section[:5]
        toe_lobes = section[5] if len(section) > 5 else 0.0
        ring: list[tuple[float, float, float]] = []
        for radial in range(radial_segments):
            angle = 2.0 * math.pi * radial / radial_segments
            cosine = math.cos(angle)
            sine = math.sin(angle)
            depth_scale = 1.0
            if sine > 0.0 and toe_lobes > 0.0:
                lobe_profile = max(
                    math.exp(-((cosine + 0.55) / 0.22) ** 2),
                    math.exp(-(cosine / 0.22) ** 2),
                    math.exp(-((cosine - 0.55) / 0.22) ** 2),
                )
                depth_scale += toe_lobes * lobe_profile * sine
            ring.append(
                (
                    center_x + half_width * cosine,
                    y,
                    center_z + half_depth * depth_scale * sine,
                )
            )
        rings.append(ring)
    return ring_mesh(name, rings, mat, parent)


def sweep_loft(
    name: str,
    points: Sequence[Sequence[float]],
    radii: Sequence[Sequence[float]],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    radial_segments: int = 28,
    samples_per_span: int = 4,
) -> bpy.types.Object:
    """Sweep elliptical rings using a stable parallel-transport frame."""

    if len(points) != len(radii):
        raise ValueError(f"{name}: point/radius count mismatch")
    anchors = [
        (*point, radius[0], radius[1])
        for point, radius in zip(points, radii, strict=True)
    ]
    sections = interpolate_sections(anchors, samples_per_span)
    centers = [Vector(section[:3]) for section in sections]

    tangents: list[Vector] = []
    for index, center in enumerate(centers):
        if index == 0:
            tangent = centers[1] - center
        elif index == len(centers) - 1:
            tangent = center - centers[index - 1]
        else:
            tangent = centers[index + 1] - centers[index - 1]
        tangents.append(tangent.normalized())

    reference = Vector((1.0, 0.0, 0.0))
    if abs(reference.dot(tangents[0])) > 0.92:
        reference = Vector((0.0, 1.0, 0.0))
    normal = (
        reference - tangents[0] * reference.dot(tangents[0])
    ).normalized()
    binormal = tangents[0].cross(normal).normalized()

    rings: list[list[tuple[float, float, float]]] = []
    previous_tangent = tangents[0]
    for index, section in enumerate(sections):
        tangent = tangents[index]
        if index:
            rotation = previous_tangent.rotation_difference(tangent)
            normal = (rotation @ normal).normalized()
            binormal = tangent.cross(normal).normalized()
            normal = binormal.cross(tangent).normalized()

        center = centers[index]
        radius_a, radius_b = section[3], section[4]
        ring: list[tuple[float, float, float]] = []
        for radial in range(radial_segments):
            angle = 2.0 * math.pi * radial / radial_segments
            point = (
                center
                + normal * (radius_a * math.cos(angle))
                + binormal * (radius_b * math.sin(angle))
            )
            ring.append((point.x, point.y, point.z))
        rings.append(ring)
        previous_tangent = tangent

    return ring_mesh(name, rings, mat, parent)


def make_torso(
    mat: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    """Create the six-anchor measured torso as one continuous station loft."""

    # z, center-y, half-width, dorsal height, ventral height, lower-width scale.
    # The second pass lifts the sternum/belly, lowers the rump crown, and
    # narrows the lower barrel while retaining the measured longitudinal plan.
    anchors = [
        (-0.84, 0.710, 0.065, 0.060, 0.055, 0.90),
        (-0.78, 0.710, 0.195, 0.165, 0.140, 0.78),
        (-0.57, 0.710, 0.290, 0.190, 0.180, 0.75),
        (-0.32, 0.710, 0.240, 0.220, 0.105, 0.82),
        (-0.05, 0.700, 0.270, 0.240, 0.090, 0.82),
        (0.20, 0.700, 0.260, 0.240, 0.190, 0.80),
        (0.35, 0.700, 0.200, 0.220, 0.170, 0.82),
        (0.42, 0.710, 0.065, 0.070, 0.060, 0.88),
    ]
    torso = z_axis_loft(
        "Body",
        anchors,
        mat,
        parent,
        radial_segments=38,
        samples_per_span=6,
    )
    torso["topology"] = "measured-torso-station-loft"
    return torso


def make_neck(
    mat: bpy.types.Material,
    construction: bpy.types.Object,
) -> bpy.types.Object:
    """Loft the measured 35-degree forward neck from base to atlas."""

    points = [
        (0.0, 0.750, 0.230),
        (0.0, 0.805, 0.265),
        (0.0, 0.865, 0.305),
        (0.0, 0.920, 0.340),
        (0.0, 0.945, 0.380),
        (0.0, 0.955, 0.420),
    ]
    radii = [
        (0.236, 0.218),
        (0.224, 0.205),
        (0.194, 0.180),
        (0.132, 0.124),
        (0.104, 0.098),
        (0.082, 0.078),
    ]
    neck = sweep_loft(
        "NeckMesh",
        points,
        radii,
        mat,
        construction,
        radial_segments=32,
        samples_per_span=5,
    )
    neck["topology"] = "measured-forward-neck-loft"
    return neck


def make_skull(
    mat: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    """Build the braincase and cheek mass without tapering it to the nose."""

    # The first three measured sections define the braincase and zygoma.
    # Support rows terminate the volume inside the separately lofted muzzle.
    anchors = [
        (0.270, 0.970, 0.118, 0.0880, 0.1150),
        (0.300, 0.985, 0.170, 0.1170, 0.1450),
        (0.440, 0.995, 0.260, 0.1380, 0.1700),
        (0.570, 0.965, 0.270, 0.1260, 0.1550),
        (0.605, 0.935, 0.248, 0.1130, 0.1500),
        (0.625, 0.910, 0.195, 0.0890, 0.1250),
    ]
    head = z_axis_loft(
        "BraincaseMesh",
        anchors,
        mat,
        parent,
        radial_segments=38,
        samples_per_span=7,
    )
    head["topology"] = "measured-braincase-cheek-loft"
    return head


def make_muzzle(
    mat: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    """Build a short lower muzzle rooted inside the retained cheek mass."""

    anchors = [
        (0.545, 0.900, 0.165, 0.0780, 0.1150),
        (0.600, 0.875, 0.138, 0.0620, 0.0820),
        (0.660, 0.855, 0.118, 0.0640, 0.0660),
        (0.720, 0.850, 0.078, 0.0410, 0.0470),
        (0.765, 0.862, 0.043, 0.0240, 0.0270),
    ]
    muzzle = z_axis_loft(
        "MuzzleMesh",
        anchors,
        mat,
        parent,
        radial_segments=34,
        samples_per_span=6,
    )
    muzzle["topology"] = "buried-root-short-muzzle-loft"
    return muzzle


def make_chin(
    mat: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    """Create a distinct lower chin tucked beneath the compact muzzle."""

    anchors = [
        (0.555, 0.795, 0.105, 0.035, 0.052),
        (0.620, 0.790, 0.112, 0.040, 0.055),
        (0.685, 0.795, 0.095, 0.038, 0.050),
        (0.730, 0.810, 0.060, 0.025, 0.032),
    ]
    chin = z_axis_loft(
        "ChinMesh",
        anchors,
        mat,
        parent,
        radial_segments=30,
        samples_per_span=5,
    )
    chin["topology"] = "distinct-lower-chin-loft"
    return chin


def make_leg(
    name: str,
    side: int,
    kind: str,
    mat: bpy.types.Material,
    construction: bpy.types.Object,
) -> bpy.types.Object:
    """Create one continuous measured limb-and-paw loft."""

    if side not in (-1, 1):
        raise ValueError(f"{name}: side must be -1 or 1")

    if kind == "fore":
        # y, x-center, z-center, x half-width, z half-depth, toe-lobe strength
        anchors = [
            (0.014, side * 0.120, 0.305, 0.062, 0.052, 0.10),
            (0.028, side * 0.120, 0.305, 0.080, 0.072, 0.18),
            (0.050, side * 0.120, 0.300, 0.095, 0.090, 0.24),
            (0.070, side * 0.120, 0.292, 0.095, 0.093, 0.22),
            (0.092, side * 0.118, 0.275, 0.086, 0.084, 0.14),
            (0.115, side * 0.115, 0.245, 0.074, 0.070, 0.05),
            (0.140, side * 0.110, 0.205, 0.062, 0.055, 0.00),
            (0.180, side * 0.105, 0.170, 0.081, 0.082, 0.00),
            (0.320, side * 0.090, 0.135, 0.070, 0.076, 0.00),
            (0.470, side * 0.080, 0.100, 0.067, 0.082, 0.00),
            (0.610, side * 0.095, 0.155, 0.085, 0.098, 0.00),
            (0.740, side * 0.110, 0.220, 0.098, 0.115, 0.00),
            (0.800, side * 0.090, 0.220, 0.080, 0.095, 0.00),
            (0.860, side * 0.070, 0.220, 0.050, 0.068, 0.00),
        ]
    elif kind == "hind":
        anchors = [
            (0.014, side * 0.195, -0.330, 0.068, 0.055, 0.10),
            (0.030, side * 0.195, -0.332, 0.086, 0.075, 0.18),
            (0.055, side * 0.195, -0.338, 0.102, 0.085, 0.24),
            (0.082, side * 0.195, -0.348, 0.100, 0.085, 0.22),
            (0.115, side * 0.198, -0.385, 0.091, 0.077, 0.12),
            (0.155, side * 0.202, -0.450, 0.080, 0.068, 0.04),
            (0.185, side * 0.208, -0.525, 0.069, 0.065, 0.00),
            (0.200, side * 0.215, -0.590, 0.067, 0.077, 0.00),
            (0.335, side * 0.230, -0.535, 0.074, 0.088, 0.00),
            (0.490, side * 0.235, -0.545, 0.110, 0.135, 0.00),
            (0.630, side * 0.245, -0.535, 0.152, 0.172, 0.00),
            (0.750, side * 0.250, -0.570, 0.172, 0.190, 0.00),
            (0.805, side * 0.205, -0.555, 0.145, 0.165, 0.00),
            (0.855, side * 0.145, -0.520, 0.095, 0.125, 0.00),
            (0.890, side * 0.100, -0.480, 0.050, 0.080, 0.00),
        ]
    else:
        raise ValueError(f"{name}: unsupported limb kind {kind!r}")

    limb = vertical_loft(
        f"{name}Mesh",
        anchors,
        mat,
        construction,
        radial_segments=30,
        samples_per_span=5,
    )
    limb["topology"] = f"measured-{kind}-limb-loft"
    limb["measured_side"] = side
    return prepare_component(limb, name)


def make_ear(
    bone_name: str,
    side: int,
    mat: bpy.types.Material,
    construction: bpy.types.Object,
) -> bpy.types.Object:
    """Create a rounded triangular ear from an extruded authored outline."""

    center_x = side * 0.215
    center_z = 0.390
    base_y = 1.055
    outline = [
        (-0.075, 0.000),
        (-0.080, 0.032),
        (-0.070, 0.075),
        (-0.052, 0.108),
        (-0.026, 0.128),
        (0.000, 0.134),
        (0.026, 0.128),
        (0.052, 0.108),
        (0.070, 0.075),
        (0.080, 0.032),
        (0.075, 0.000),
    ]
    depths = (-0.032, 0.032)
    vertices: list[tuple[float, float, float]] = []
    for depth in depths:
        for local_x, local_y in outline:
            rise = local_y / 0.134
            vertices.append(
                bvec(
                    (
                        center_x
                        + side * (local_x * 0.90 + 0.010 * rise),
                        base_y + local_y,
                        center_z
                        + depth
                        + local_x * 0.52
                        + 0.034 * rise,
                    )
                )
            )

    count = len(outline)
    faces: list[tuple[int, ...]] = [
        tuple(reversed(range(count))),
        tuple(count + index for index in range(count)),
    ]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))

    mesh = bpy.data.meshes.new(f"{bone_name}Geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    ear = bpy.data.objects.new(f"{bone_name}Mesh", mesh)
    bpy.context.collection.objects.link(ear)
    ear.parent = construction
    ear.data.materials.append(mat)
    add_modifier_and_apply(
        ear,
        "BEVEL",
        "Rounded ear perimeter",
        width=0.013,
        segments=4,
    )
    smooth_mesh(ear)
    ear["topology"] = "rounded-triangular-extrusion"
    return prepare_component(ear, bone_name)


def make_tail(
    mat: bpy.types.Material,
    construction: bpy.types.Object,
) -> bpy.types.Object:
    """Sweep the supplied tail path and diameters without curve primitives."""

    points = [
        (0.00, 0.750, -0.76),
        (0.00, 0.755, -0.90),
        (0.01, 0.748, -1.05),
        (0.02, 0.715, -1.13),
        (0.04, 0.630, -1.25),
        (0.07, 0.535, -1.38),
        (0.10, 0.480, -1.50),
        (0.13, 0.500, -1.61),
        (0.16, 0.590, -1.68),
        (0.16, 0.690, -1.69),
        (0.13, 0.775, -1.64),
    ]
    diameters = (
        0.150,
        0.145,
        0.135,
        0.123,
        0.108,
        0.092,
        0.078,
        0.066,
        0.056,
        0.048,
        0.042,
    )
    radii = [(diameter * 0.5, diameter * 0.5) for diameter in diameters]
    tail = sweep_loft(
        "TailMesh",
        points,
        radii,
        mat,
        construction,
        radial_segments=26,
        samples_per_span=6,
    )
    tail["topology"] = "measured-tail-sweep-loft"
    return prepare_component(tail, "tail")


def make_materials() -> dict[str, bpy.types.Material]:
    """Create the restrained production palette for the finished v3 pass."""

    materials = {
        "Fur": material(
            "Fur",
            FUR_BASE_COLOR,
            0.84,
            coat=0.0,
            sheen=0.05,
        ),
        "Cream": material(
            "Cream",
            CREAM_BASE_COLOR,
            0.82,
            sheen=0.16,
        ),
        "EarInner": material(
            "EarInner",
            (0.47, 0.17, 0.30, 1.0),
            0.80,
            sheen=0.10,
        ),
        "Nose": material(
            "Nose",
            (0.66, 0.20, 0.32, 1.0),
            0.36,
            coat=0.30,
        ),
        "Sclera": material(
            "EyeWhite",
            (0.86, 0.82, 0.88, 1.0),
            0.24,
            coat=0.28,
        ),
        "Iris": material(
            "Iris",
            (0.86, 0.43, 0.035, 1.0),
            0.22,
            coat=0.38,
        ),
        "Pupil": material(
            "Pupil",
            (0.007, 0.003, 0.012, 1.0),
            0.20,
            coat=0.24,
        ),
        "Highlight": material(
            "Highlight",
            (1.0, 0.91, 0.72, 1.0),
            0.12,
        ),
        "Mouth": material(
            "FurDark",
            (0.055, 0.006, 0.130, 1.0),
            0.74,
        ),
        "Whisker": material(
            "Whisker",
            (0.78, 0.69, 0.62, 1.0),
            0.55,
        ),
        "Cuff": material(
            "Cuff",
            (0.095, 0.008, 0.235, 1.0),
            0.62,
            coat=0.025,
        ),
    }
    fur_bsdf = materials["Fur"].node_tree.nodes.get("Principled BSDF")
    if fur_bsdf and "IOR Level" in fur_bsdf.inputs:
        fur_bsdf.inputs["IOR Level"].default_value = 0.24
    return materials


def ellipsoid_mesh(
    name: str,
    center: Sequence[float],
    radii: Sequence[float],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    segments: int = 28,
    rings: int = 14,
) -> bpy.types.Object:
    """Build a compact ellipsoid without invoking primitive operators."""

    center_x, center_y, center_z = center
    radius_x, radius_y, radius_z = radii
    vertices: list[tuple[float, float, float]] = [
        bvec((center_x, center_y - radius_y, center_z))
    ]
    faces: list[tuple[int, ...]] = []

    for ring_index in range(1, rings):
        latitude = -0.5 * math.pi + math.pi * ring_index / rings
        latitude_cosine = math.cos(latitude)
        for segment in range(segments):
            longitude = 2.0 * math.pi * segment / segments
            vertices.append(
                bvec(
                    (
                        center_x
                        + radius_x * latitude_cosine * math.cos(longitude),
                        center_y + radius_y * math.sin(latitude),
                        center_z
                        + radius_z * latitude_cosine * math.sin(longitude),
                    )
                )
            )

    top_index = len(vertices)
    vertices.append(bvec((center_x, center_y + radius_y, center_z)))

    for segment in range(segments):
        following = (segment + 1) % segments
        faces.append((0, 1 + following, 1 + segment))

    for ring_index in range(rings - 2):
        current = 1 + ring_index * segments
        following_ring = current + segments
        for segment in range(segments):
            following = (segment + 1) % segments
            faces.append(
                (
                    current + segment,
                    current + following,
                    following_ring + following,
                    following_ring + segment,
                )
            )

    final_ring = 1 + (rings - 2) * segments
    for segment in range(segments):
        following = (segment + 1) % segments
        faces.append((final_ring + segment, final_ring + following, top_index))

    mesh = bpy.data.meshes.new(f"{name}Geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(mat)
    smooth_mesh(obj)
    return obj


def almond_rim_mesh(
    name: str,
    center: Sequence[float],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    segments: int = 32,
) -> bpy.types.Object:
    """Build a solid fur-colored almond aperture around a buried globe."""

    center_x, center_y, center_z = center
    loops: list[list[tuple[float, float, float]]] = []
    for depth, half_width, half_height in (
        (-0.006, 0.076, 0.055),
        (0.004, 0.060, 0.044),
        (0.000, 0.076, 0.055),
        (0.010, 0.060, 0.044),
    ):
        loop: list[tuple[float, float, float]] = []
        for segment in range(segments):
            angle = 2.0 * math.pi * segment / segments
            sine = math.sin(angle)
            local_y = (
                half_height * sine * (0.72 + 0.28 * abs(sine))
            )
            loop.append(
                (
                    center_x + half_width * math.cos(angle),
                    center_y + local_y,
                    center_z + depth,
                )
            )
        loops.append(loop)

    vertices = [bvec(point) for loop in loops for point in loop]
    outer_back = 0
    inner_back = segments
    outer_front = segments * 2
    inner_front = segments * 3
    faces: list[tuple[int, ...]] = []
    for segment in range(segments):
        following = (segment + 1) % segments
        faces.extend(
            [
                (
                    outer_front + segment,
                    outer_front + following,
                    inner_front + following,
                    inner_front + segment,
                ),
                (
                    outer_back + following,
                    outer_back + segment,
                    inner_back + segment,
                    inner_back + following,
                ),
                (
                    outer_back + segment,
                    outer_back + following,
                    outer_front + following,
                    outer_front + segment,
                ),
                (
                    inner_back + following,
                    inner_back + segment,
                    inner_front + segment,
                    inner_front + following,
                ),
            ]
        )

    mesh = bpy.data.meshes.new(f"{name}Geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    rim = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(rim)
    rim.parent = parent
    rim.data.materials.append(mat)
    smooth_mesh(rim)
    rim["construction"] = "recessed-almond-aperture"
    return rim


def iris_spokes_mesh(
    name: str,
    center: Sequence[float],
    radii: Sequence[float],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    """Add sparse radial iris striations without another material slot."""

    center_x, center_y, center_z = center
    radius_x, radius_y = radii
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    spoke_angles = (
        0.12,
        0.58,
        1.04,
        1.52,
        2.02,
        2.48,
        2.92,
        3.42,
        3.88,
        4.38,
        4.86,
        5.34,
        5.82,
    )
    for index, angle in enumerate(spoke_angles):
        inner_radius = 0.50 + 0.035 * (index % 3)
        outer_radius = 0.84 + 0.035 * ((index + 1) % 3)
        half_angle = 0.025 + 0.006 * (index % 2)
        start = len(vertices)
        for radial_scale, angular_offset in (
            (inner_radius, -half_angle),
            (inner_radius, half_angle),
            (outer_radius, half_angle * 0.55),
            (outer_radius, -half_angle * 0.55),
        ):
            ray_angle = angle + angular_offset
            vertices.append(
                bvec(
                    (
                        center_x
                        + radius_x * radial_scale * math.cos(ray_angle),
                        center_y
                        + radius_y * radial_scale * math.sin(ray_angle),
                        center_z,
                    )
                )
            )
        faces.append((start, start + 1, start + 2, start + 3))

    mesh = bpy.data.meshes.new(f"{name}Geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    spokes = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(spokes)
    spokes.parent = parent
    spokes.data.materials.append(mat)
    spokes["presentation"] = "flush-radial-iris-striation"
    return spokes


def eye_lid_mask_mesh(
    name: str,
    center: Sequence[float],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    upper: bool,
    segments: int = 20,
) -> bpy.types.Object:
    """Mask a measured fraction of the sclera with a flush purple lid."""

    center_x, center_y, center_z = center
    vertices: list[tuple[float, float, float]] = []
    for segment in range(segments + 1):
        u = -1.0 + 2.0 * segment / segments
        profile = math.sqrt(max(0.0, 1.0 - u * u))
        x = center_x + 0.060 * u
        if upper:
            outer_y = center_y + 0.044 * profile
            inner_y = center_y + 0.024 * profile
        else:
            outer_y = center_y - 0.044 * profile
            inner_y = center_y - 0.035 * profile
        vertices.extend(
            [
                bvec((x, outer_y, center_z)),
                bvec((x, inner_y, center_z + 0.0003)),
            ]
        )

    faces = [
        (
            segment * 2,
            segment * 2 + 2,
            segment * 2 + 3,
            segment * 2 + 1,
        )
        for segment in range(segments)
    ]
    mesh = bpy.data.meshes.new(f"{name}Geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    lid = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(lid)
    lid.parent = parent
    lid.data.materials.append(mat)
    smooth_mesh(lid)
    lid["presentation"] = (
        "upper-purple-lid-mask" if upper else "lower-purple-lid-mask"
    )
    return lid


def ribbon_mesh(
    name: str,
    points: Sequence[Sequence[float]],
    width: float,
    mat: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    """Create a flush surface ribbon for mouth lines and toe grooves."""

    if len(points) < 2:
        raise ValueError(f"{name}: a ribbon needs at least two points")
    vertices: list[tuple[float, float, float]] = []
    for index, point in enumerate(points):
        previous = points[max(0, index - 1)]
        following = points[min(len(points) - 1, index + 1)]
        tangent_x = following[0] - previous[0]
        tangent_y = following[1] - previous[1]
        tangent_length = math.hypot(tangent_x, tangent_y)
        if tangent_length <= 1.0e-8:
            raise ValueError(f"{name}: coincident ribbon points")
        normal_x = -tangent_y / tangent_length
        normal_y = tangent_x / tangent_length
        half_width = width * 0.5
        vertices.extend(
            [
                bvec(
                    (
                        point[0] + normal_x * half_width,
                        point[1] + normal_y * half_width,
                        point[2],
                    )
                ),
                bvec(
                    (
                        point[0] - normal_x * half_width,
                        point[1] - normal_y * half_width,
                        point[2],
                    )
                ),
            ]
        )

    faces = [
        (index * 2, index * 2 + 1, index * 2 + 3, index * 2 + 2)
        for index in range(len(points) - 1)
    ]
    mesh = bpy.data.meshes.new(f"{name}Geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    ribbon = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ribbon)
    ribbon.parent = parent
    ribbon.data.materials.append(mat)
    return ribbon


def make_inner_ear(
    bone_name: str,
    side: int,
    mat: bpy.types.Material,
    construction: bpy.types.Object,
) -> bpy.types.Object:
    """Inset a thin rose surface while retaining a violet outer rim."""

    center_x = side * 0.215
    base_y = 1.070
    outline = [
        (-0.048, 0.000),
        (-0.051, 0.027),
        (-0.041, 0.060),
        (-0.024, 0.083),
        (0.000, 0.090),
        (0.024, 0.083),
        (0.041, 0.060),
        (0.051, 0.027),
        (0.048, 0.000),
    ]
    front: list[tuple[float, float, float]] = []
    back: list[tuple[float, float, float]] = []
    for local_x, local_y in outline:
        rise = local_y / 0.090
        point = (
            center_x + side * (local_x * 0.90 + 0.010 * rise),
            base_y + local_y,
            0.425 + local_x * 0.52 + 0.034 * rise,
        )
        front.append(point)
        back.append((point[0], point[1], point[2] - 0.004))

    count = len(outline)
    vertices = [bvec(point) for point in back + front]
    faces: list[tuple[int, ...]] = [
        tuple(reversed(range(count))),
        tuple(count + index for index in range(count)),
    ]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))

    mesh = bpy.data.meshes.new(f"{bone_name}InnerGeometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    inner = bpy.data.objects.new(f"{bone_name}Inner", mesh)
    bpy.context.collection.objects.link(inner)
    inner.parent = construction
    inner.data.materials.append(mat)
    add_modifier_and_apply(
        inner,
        "BEVEL",
        "Soft inner ear",
        width=0.004,
        segments=2,
    )
    smooth_mesh(inner)
    return prepare_component(inner, bone_name)


def make_eye_details(
    mats: dict[str, bpy.types.Material],
    construction: bpy.types.Object,
) -> list[bpy.types.Object]:
    """Build measured, recessed feline eye assemblies with no external rings."""

    components: list[bpy.types.Object] = []
    for side, label in ((-1, "L"), (1, "R")):
        eye_x = side * 0.105
        globe = ellipsoid_mesh(
            f"EyeGlobe{label}",
            (eye_x, 1.005, 0.565),
            (0.055, 0.055, 0.055),
            mats["Sclera"],
            construction,
            segments=30,
            rings=15,
        )
        globe["burial_ratio"] = 0.72
        globe["presentation"] = "fully-buried-support-globe"
        components.append(prepare_component(globe, "head"))

        sclera = ellipsoid_mesh(
            f"ScleraAperture{label}",
            (eye_x, 1.005, 0.629),
            (0.0575, 0.0425, 0.0035),
            mats["Sclera"],
            construction,
            segments=26,
            rings=12,
        )
        sclera["presentation"] = "flattened-almond-aperture"
        components.append(prepare_component(sclera, "head"))

        rim = almond_rim_mesh(
            f"AlmondLidRim{label}",
            (eye_x, 1.005, 0.6225),
            mats["Fur"],
            construction,
        )
        components.append(prepare_component(rim, "head"))

        iris = ellipsoid_mesh(
            f"Iris{label}",
            (eye_x, 1.005, 0.6345),
            (0.0330, 0.0340, 0.002),
            mats["Iris"],
            construction,
            segments=24,
            rings=12,
        )
        components.append(prepare_component(iris, "head"))

        spokes = iris_spokes_mesh(
            f"IrisStriations{label}",
            (eye_x, 1.005, 0.6370),
            (0.0330, 0.0340),
            mats["Mouth"],
            construction,
        )
        components.append(prepare_component(spokes, "head"))

        pupil = ellipsoid_mesh(
            f"Pupil{label}",
            (eye_x, 1.005, 0.6375),
            (0.0065, 0.0205, 0.0015),
            mats["Pupil"],
            construction,
            segments=20,
            rings=10,
        )
        components.append(prepare_component(pupil, "head"))

        highlight = ellipsoid_mesh(
            f"Highlight{label}",
            (eye_x - 0.010, 1.017, 0.6400),
            (0.0070, 0.0080, 0.0012),
            mats["Highlight"],
            construction,
            segments=14,
            rings=8,
        )
        components.append(prepare_component(highlight, "head"))

        small_highlight = ellipsoid_mesh(
            f"HighlightSecondary{label}",
            (eye_x + 0.012, 0.990, 0.6397),
            (0.0032, 0.0036, 0.0009),
            mats["Highlight"],
            construction,
            segments=12,
            rings=7,
        )
        components.append(prepare_component(small_highlight, "head"))

        upper_lid = eye_lid_mask_mesh(
            f"UpperLid{label}",
            (eye_x, 1.005, 0.6381),
            mats["Fur"],
            construction,
            upper=True,
        )
        components.append(prepare_component(upper_lid, "head"))
        lower_lid = eye_lid_mask_mesh(
            f"LowerLid{label}",
            (eye_x, 1.005, 0.6380),
            mats["Fur"],
            construction,
            upper=False,
        )
        components.append(prepare_component(lower_lid, "head"))
    return components


def make_cream_face_pads(
    mats: dict[str, bpy.types.Material],
    construction: bpy.types.Object,
) -> list[bpy.types.Object]:
    """Add two subtle whisker pads and one compact warm-cream chin."""

    components: list[bpy.types.Object] = []
    for side, label in ((-1, "L"), (1, "R")):
        center = (side * 0.058, 0.867, 0.768)
        radii = (0.076, 0.052, 0.0050)
        pad = ellipsoid_mesh(
            f"WhiskerPad{label}",
            center,
            radii,
            mats["Cream"],
            construction,
            segments=26,
            rings=12,
        )
        components.append(prepare_component(pad, "head"))

    chin_center = (0.0, 0.800, 0.758)
    chin_radii = (0.066, 0.025, 0.0045)
    chin = ellipsoid_mesh(
        "CreamChinPatch",
        chin_center,
        chin_radii,
        mats["Cream"],
        construction,
        segments=24,
        rings=11,
    )
    components.append(prepare_component(chin, "head"))
    return components


def make_brow_ridges(
    mats: dict[str, bpy.types.Material],
    construction: bpy.types.Object,
) -> list[bpy.types.Object]:
    """Add thick, arched dark-purple brows above the masked apertures."""

    components: list[bpy.types.Object] = []
    for side, label in ((-1, "L"), (1, "R")):
        center_x = side * 0.105
        brow = ribbon_mesh(
            f"BrowRidge{label}",
            [
                (center_x - 0.060, 1.052, 0.6410),
                (center_x - 0.040, 1.063, 0.6417),
                (center_x - 0.020, 1.070, 0.6422),
                (center_x, 1.073, 0.6425),
                (center_x + 0.020, 1.070, 0.6422),
                (center_x + 0.040, 1.063, 0.6417),
                (center_x + 0.060, 1.052, 0.6410),
            ],
            0.016,
            mats["Mouth"],
            construction,
        )
        add_modifier_and_apply(
            brow,
            "BEVEL",
            "Soft brow edge",
            width=0.002,
            segments=3,
        )
        smooth_mesh(brow)
        brow["presentation"] = "thick-arched-dark-purple-brow"
        components.append(prepare_component(brow, "head"))
    return components


def make_nose_and_mouth(
    mats: dict[str, bpy.types.Material],
    construction: bpy.types.Object,
) -> list[bpy.types.Object]:
    """Create a compact triangular nose and flush feline mouth marks."""

    front = [
        (-0.043, 0.885, 0.774),
        (0.043, 0.885, 0.774),
        (0.000, 0.848, 0.779),
    ]
    back = [
        (-0.035, 0.880, 0.753),
        (0.035, 0.880, 0.753),
        (0.000, 0.850, 0.757),
    ]
    mesh = bpy.data.meshes.new("NoseGeometry")
    mesh.from_pydata(
        [bvec(point) for point in front + back],
        [],
        [
            (0, 1, 2),
            (5, 4, 3),
            (0, 3, 4, 1),
            (1, 4, 5, 2),
            (2, 5, 3, 0),
        ],
    )
    mesh.update()
    nose = bpy.data.objects.new("Nose", mesh)
    bpy.context.collection.objects.link(nose)
    nose.parent = construction
    nose.data.materials.append(mats["Nose"])
    add_modifier_and_apply(
        nose,
        "BEVEL",
        "Rounded triangular nose",
        width=0.006,
        segments=3,
    )
    smooth_mesh(nose)
    components = [prepare_component(nose, "head")]

    for side, label in ((-1, "L"), (1, "R")):
        nostril = ellipsoid_mesh(
            f"Nostril{label}",
            (side * 0.018, 0.874, 0.779),
            (0.005, 0.003, 0.0015),
            mats["Mouth"],
            construction,
            segments=12,
            rings=7,
        )
        components.append(prepare_component(nostril, "head"))

    philtrum = ribbon_mesh(
        "Philtrum",
        [(0.0, 0.848, 0.780), (0.0, 0.826, 0.766)],
        0.004,
        mats["Mouth"],
        construction,
    )
    components.append(prepare_component(philtrum, "head"))
    for side, label in ((-1, "L"), (1, "R")):
        mouth = ribbon_mesh(
            f"MouthCorner{label}",
            [
                (0.0, 0.826, 0.766),
                (side * 0.038, 0.814, 0.754),
                (side * 0.074, 0.820, 0.738),
            ],
            0.0030,
            mats["Mouth"],
            construction,
        )
        components.append(prepare_component(mouth, "head"))
    return components


def make_whiskers(
    mats: dict[str, bpy.types.Material],
    construction: bpy.types.Object,
) -> list[bpy.types.Object]:
    """Sweep six short, curved whiskers in a readable asymmetric fan."""

    components: list[bpy.types.Object] = []
    for side, label in ((-1, "L"), (1, "R")):
        fan_paths = (
            (
                (0.070, 0.850, 0.758),
                (0.138, 0.842, 0.759),
                (0.218, 0.817, 0.758),
                (0.285, 0.787, 0.752),
            ),
            (
                (0.070, 0.870, 0.759),
                (0.148, 0.872, 0.760),
                (0.238, 0.879, 0.758),
                (0.305, 0.871, 0.760),
            ),
            (
                (0.070, 0.891, 0.758),
                (0.142, 0.903, 0.759),
                (0.220, 0.927, 0.756),
                (0.292, 0.950, 0.747),
            ),
        )
        for index, path in enumerate(fan_paths, start=1):
            whisker = sweep_loft(
                f"Whisker{label}{index}",
                [
                    (side * x, y, z)
                    for x, y, z in path
                ],
                [
                    (0.0015, 0.0015),
                    (0.0012, 0.0012),
                    (0.0008, 0.0008),
                    (0.0004, 0.0004),
                ],
                mats["Whisker"],
                construction,
                radial_segments=6,
                samples_per_span=3,
            )
            components.append(prepare_component(whisker, "head"))
    return components


def make_toe_grooves(
    mats: dict[str, bpy.types.Material],
    construction: bpy.types.Object,
) -> list[bpy.types.Object]:
    """Inset paired grooves so each procedural paw reads as three toe lobes."""

    components: list[bpy.types.Object] = []
    paw_specs = (
        ("legFL", -0.120, 0.388),
        ("legFR", 0.120, 0.388),
        ("legHL", -0.195, -0.235),
        ("legHR", 0.195, -0.235),
    )
    for bone_name, center_x, front_z in paw_specs:
        for groove_index, offset in enumerate((-0.030, 0.030), start=1):
            groove = ribbon_mesh(
                f"{bone_name}ToeGroove{groove_index}",
                [
                    (center_x + offset, 0.028, front_z),
                    (center_x + offset * 0.94, 0.055, front_z - 0.003),
                    (center_x + offset * 0.82, 0.086, front_z - 0.012),
                ],
                0.0032,
                mats["Mouth"],
                construction,
            )
            components.append(prepare_component(groove, bone_name))
    return components


def make_cuff(
    mat: bpy.types.Material,
    construction: bpy.types.Object,
) -> bpy.types.Object:
    """Build a compact toroidal cuff on the dedicated runtime anchor."""

    center = (0.215, 0.245, -0.555)
    major_radius = 0.078
    minor_radius = 0.012
    major_segments = 36
    minor_segments = 10
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for major in range(major_segments):
        major_angle = 2.0 * math.pi * major / major_segments
        for minor in range(minor_segments):
            minor_angle = 2.0 * math.pi * minor / minor_segments
            ring_radius = major_radius + minor_radius * math.cos(minor_angle)
            vertices.append(
                bvec(
                    (
                        center[0] + ring_radius * math.cos(major_angle),
                        center[1] + minor_radius * math.sin(minor_angle),
                        center[2] + ring_radius * math.sin(major_angle),
                    )
                )
            )

    for major in range(major_segments):
        next_major = (major + 1) % major_segments
        for minor in range(minor_segments):
            next_minor = (minor + 1) % minor_segments
            faces.append(
                (
                    major * minor_segments + minor,
                    major * minor_segments + next_minor,
                    next_major * minor_segments + next_minor,
                    next_major * minor_segments + minor,
                )
            )

    mesh = bpy.data.meshes.new("CuffGeometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    cuff = bpy.data.objects.new("Cuff", mesh)
    bpy.context.collection.objects.link(cuff)
    cuff.parent = construction
    cuff.data.materials.append(mat)
    smooth_mesh(cuff)
    return prepare_component(cuff, "cuffAnchor")


def blended_neck_weight(obj: bpy.types.Object) -> bpy.types.Object:
    """Blend the neck shell across body, neck, and head bones."""

    groups = {
        name: obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
        for name in ("body", "neck", "head")
    }
    for vertex in obj.data.vertices:
        height = vertex.co.z
        if height <= 0.79:
            weights = {"body": 1.0}
        elif height < 0.90:
            blend = (height - 0.79) / 0.11
            weights = {"body": 1.0 - blend, "neck": blend}
        elif height <= 0.95:
            weights = {"neck": 1.0}
        else:
            blend = min(1.0, (height - 0.95) / 0.06)
            weights = {"neck": 1.0 - blend, "head": blend}
        for bone_name, weight in weights.items():
            if weight > 0.0:
                groups[bone_name].add([vertex.index], weight, "REPLACE")
    obj["rig_component"] = "body->neck->head"
    return obj


def make_armature(root: bpy.types.Object) -> bpy.types.Object:
    """Create the runtime contract as an actual Blender armature."""

    armature_data = bpy.data.armatures.new("CougarRig")
    armature = bpy.data.objects.new("CougarRig", armature_data)
    bpy.context.collection.objects.link(armature)
    armature.parent = root
    armature.show_in_front = True

    activate(armature)
    bpy.ops.object.mode_set(mode="EDIT")
    bones: dict[str, bpy.types.EditBone] = {}

    def add_bone(
        name: str,
        head: Sequence[float],
        tail: Sequence[float],
        parent: str | None = None,
    ) -> None:
        bone = armature_data.edit_bones.new(name)
        bone.head = Vector(bvec(head))
        bone.tail = Vector(bvec(tail))
        if parent:
            bone.parent = bones[parent]
            bone.use_connect = False
        bones[name] = bone

    add_bone("body", (0.0, 0.72, -0.76), (0.0, 0.74, 0.22))
    add_bone("neck", (0.0, 0.75, 0.23), (0.0, 0.92, 0.34), "body")
    add_bone("head", (0.0, 0.92, 0.34), (0.0, 0.97, 0.60), "neck")
    add_bone(
        "leftEar",
        (-0.215, 1.055, 0.39),
        (-0.225, 1.170, 0.42),
        "head",
    )
    add_bone(
        "rightEar",
        (0.215, 1.055, 0.39),
        (0.225, 1.170, 0.42),
        "head",
    )
    add_bone(
        "legFL",
        (-0.11, 0.74, 0.22),
        (-0.105, 0.18, 0.17),
        "body",
    )
    add_bone(
        "legFR",
        (0.11, 0.74, 0.22),
        (0.105, 0.18, 0.17),
        "body",
    )
    add_bone(
        "legHL",
        (-0.25, 0.77, -0.57),
        (-0.215, 0.20, -0.59),
        "body",
    )
    add_bone(
        "legHR",
        (0.25, 0.77, -0.57),
        (0.215, 0.20, -0.59),
        "body",
    )
    add_bone(
        "tail",
        (0.0, 0.75, -0.76),
        (0.01, 0.748, -1.05),
        "body",
    )
    add_bone(
        "cuffAnchor",
        (0.215, 0.20, -0.54),
        (0.215, 0.27, -0.53),
        "legHR",
    )

    bpy.ops.object.mode_set(mode="OBJECT")
    return armature


def join_skinned_mesh(
    components: Iterable[bpy.types.Object],
    armature: bpy.types.Object,
) -> bpy.types.Object:
    """Join loft shells into one browser mesh and attach its skin modifier."""

    mesh_components = [obj for obj in components if obj.type == "MESH"]
    if not mesh_components:
        raise ValueError("At least one mesh component is required")

    bpy.ops.object.select_all(action="DESELECT")
    for obj in mesh_components:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = mesh_components[0]
    bpy.ops.object.join()
    mesh = bpy.context.active_object
    mesh.name = "CougarMesh"
    mesh.data.name = "CougarGeometry"
    smooth_mesh(mesh)

    world_matrix = mesh.matrix_world.copy()
    mesh.parent = armature
    mesh.matrix_parent_inverse = armature.matrix_world.inverted()
    mesh.matrix_world = world_matrix

    modifier = mesh.modifiers.new(name="Cougar skin", type="ARMATURE")
    modifier.object = armature
    modifier.use_vertex_groups = True
    modifier.use_bone_envelopes = False

    unweighted = sum(not vertex.groups for vertex in mesh.data.vertices)
    if unweighted:
        raise RuntimeError(f"{unweighted} vertices have no bone weight")
    return mesh


def build_character() -> tuple[
    bpy.types.Object,
    bpy.types.Object,
    bpy.types.Object,
]:
    """Build the approved silhouette with its finished material/detail pass."""

    mats = make_materials()
    construction = empty("_construction")
    root = empty("cougar")
    root["asset_version"] = "3.0-finished"
    root["articulation"] = "armature-skinned-measured-lofts"
    root["facial_detail"] = "recessed-feline-feature-pass"
    root["units"] = "H=1 measured specification"

    components: list[bpy.types.Object] = []

    torso = make_torso(mats["Fur"], construction)
    neck = make_neck(mats["Fur"], construction)
    limbs = [
        make_leg("legFL", -1, "fore", mats["Fur"], construction),
        make_leg("legFR", 1, "fore", mats["Fur"], construction),
        make_leg("legHL", -1, "hind", mats["Fur"], construction),
        make_leg("legHR", 1, "hind", mats["Fur"], construction),
    ]

    torso = freeze_transform(torso)
    components.append(rigid_weight(torso, "body"))

    neck = freeze_transform(neck)
    components.append(blended_neck_weight(neck))

    components.append(
        prepare_component(make_skull(mats["Fur"], construction), "head")
    )
    components.append(
        prepare_component(make_muzzle(mats["Fur"], construction), "head")
    )
    components.append(
        prepare_component(make_chin(mats["Fur"], construction), "head")
    )
    components.append(
        make_ear("leftEar", -1, mats["Fur"], construction)
    )
    components.append(
        make_ear("rightEar", 1, mats["Fur"], construction)
    )
    components.append(
        make_inner_ear("leftEar", -1, mats["EarInner"], construction)
    )
    components.append(
        make_inner_ear("rightEar", 1, mats["EarInner"], construction)
    )

    components.extend(limbs)
    components.append(make_tail(mats["Fur"], construction))
    components.extend(make_eye_details(mats, construction))
    components.extend(make_brow_ridges(mats, construction))
    components.extend(make_cream_face_pads(mats, construction))
    components.extend(make_nose_and_mouth(mats, construction))
    components.extend(make_whiskers(mats, construction))
    components.extend(make_toe_grooves(mats, construction))
    components.append(make_cuff(mats["Cuff"], construction))

    armature = make_armature(root)
    mesh = join_skinned_mesh(components, armature)

    if construction.users_collection:
        bpy.data.objects.remove(construction, do_unlink=True)
    return root, armature, mesh


def descendants(root: bpy.types.Object) -> list[bpy.types.Object]:
    result = [root]
    for child in root.children:
        result.extend(descendants(child))
    return result


def export_glb(root: bpy.types.Object) -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in descendants(root):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
        export_animations=False,
        export_skins=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )


def look_at(obj: bpy.types.Object, target: Sequence[float]) -> None:
    direction = Vector(bvec(target)) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_studio_light(
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


def compose_contact_sheet(
    image_paths: Sequence[Path],
    cell_width: int,
    cell_height: int,
) -> None:
    """Combine four rendered views using Blender's image buffers only."""

    if len(image_paths) != 4:
        raise ValueError("The contact sheet requires exactly four views")

    gap = 8
    sheet_width = cell_width * 2 + gap
    sheet_height = cell_height * 2 + gap
    background = array("f", (0.028, 0.030, 0.033, 1.0)) * (
        sheet_width * sheet_height
    )

    for index, image_path in enumerate(image_paths):
        image = bpy.data.images.load(str(image_path), check_existing=False)
        if image.size[0] != cell_width or image.size[1] != cell_height:
            raise RuntimeError(f"Unexpected render dimensions for {image_path}")
        pixels = array("f", [0.0]) * (cell_width * cell_height * 4)
        image.pixels.foreach_get(pixels)

        column = index % 2
        # Pixel buffers are bottom-up. Hero/front belong on the top row.
        row = 1 if index < 2 else 0
        x_offset = column * (cell_width + gap)
        y_offset = row * (cell_height + gap)
        row_size = cell_width * 4
        for source_y in range(cell_height):
            source_start = source_y * row_size
            destination_start = (
                ((y_offset + source_y) * sheet_width + x_offset) * 4
            )
            background[
                destination_start : destination_start + row_size
            ] = pixels[source_start : source_start + row_size]

    sheet = bpy.data.images.new(
        "PurpleCougarV3FinishedContactSheet",
        width=sheet_width,
        height=sheet_height,
        alpha=False,
        float_buffer=False,
    )
    sheet.pixels.foreach_set(background)
    sheet.file_format = "PNG"
    sheet.filepath_raw = str(PREVIEW)
    sheet.save()


def render_contact_sheet() -> None:
    """Render hero, front, side, and rear finished-color views."""

    PREVIEW.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.mesh.primitive_plane_add(size=14, location=(0.0, 0.0, 0.0))
    ground = bpy.context.active_object
    ground.name = "FinishedReviewGround"
    ground.data.materials.append(
        material("FinishedReviewGround", (0.095, 0.10, 0.105, 1.0), 0.94)
    )

    camera_data = bpy.data.cameras.new("ClayReviewCamera")
    camera = bpy.data.objects.new("ClayReviewCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera_data.type = "ORTHO"
    camera_data.lens = 70
    bpy.context.scene.camera = camera

    target = (0.0, 0.63, -0.42)
    add_studio_light(
        "ClayKey",
        (3.4, 4.3, 3.8),
        target,
        540,
        4.2,
        (1.0, 0.91, 0.82),
    )
    add_studio_light(
        "ClayFill",
        (-3.2, 2.8, 2.4),
        target,
        260,
        3.8,
        (0.64, 0.76, 1.0),
    )
    add_studio_light(
        "ClayRim",
        (-2.2, 3.0, -3.5),
        target,
        360,
        3.0,
        (0.90, 0.58, 0.48),
    )
    add_studio_light(
        "ClayTop",
        (0.2, 5.2, -0.2),
        target,
        180,
        3.2,
        (1.0, 1.0, 1.0),
    )

    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 620
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.world.use_nodes = True
    background_node = scene.world.node_tree.nodes.get("Background")
    if background_node:
        background_node.inputs["Color"].default_value = (
            0.030,
            0.036,
            0.043,
            1.0,
        )
        background_node.inputs["Strength"].default_value = 0.42
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium Low Contrast"

    views = [
        ("hero", (2.90, 1.65, 3.75), (0.0, 0.62, -0.40), 2.65),
        ("front", (0.0, 0.68, 4.60), (0.0, 0.62, 0.00), 1.58),
        ("side", (4.60, 0.78, -0.42), (0.0, 0.62, -0.42), 2.72),
        ("rear", (0.0, 0.68, -4.60), (0.0, 0.62, -0.50), 1.58),
    ]

    rendered: list[Path] = []
    view_prefix = PREVIEW.stem.removesuffix("-contact-sheet")
    for label, location, view_target, ortho_scale in views:
        camera.location = bvec(location)
        camera_data.ortho_scale = ortho_scale
        look_at(camera, view_target)
        image_path = PREVIEW.parent / f"{view_prefix}-{label}.png"
        scene.render.filepath = str(image_path)
        bpy.ops.render.render(write_still=True)
        rendered.append(image_path)

    compose_contact_sheet(rendered, 720, 620)


def report_stats(
    root: bpy.types.Object,
    armature: bpy.types.Object,
    mesh: bpy.types.Object,
) -> None:
    mesh.data.calc_loop_triangles()
    vertices = len(mesh.data.vertices)
    polygons = len(mesh.data.polygons)
    triangles = len(mesh.data.loop_triangles)
    bone_names = [bone.name for bone in armature.data.bones]
    missing = [name for name in REQUIRED_BONES if name not in bone_names]
    if missing:
        raise RuntimeError(f"Required bones missing before export: {missing}")
    if triangles > TRIANGLE_BUDGET:
        raise RuntimeError(
            f"Triangle budget exceeded: {triangles} > {TRIANGLE_BUDGET}"
        )
    material_names = [slot.name for slot in mesh.data.materials]
    missing_materials = [
        name for name in REQUIRED_MATERIALS if name not in material_names
    ]
    if missing_materials:
        raise RuntimeError(
            f"Runtime materials missing before export: {missing_materials}"
        )
    if len(material_names) > 16:
        raise RuntimeError(
            f"Material/primitive budget exceeded: {len(material_names)} > 16"
        )

    weighted_vertices = sum(bool(vertex.groups) for vertex in mesh.data.vertices)
    if weighted_vertices != vertices:
        raise RuntimeError(
            f"Skin incomplete: {weighted_vertices}/{vertices} vertices weighted"
        )

    print(
        "TOPOLOGY "
        f"vertices={vertices} polygons={polygons} triangles={triangles} "
        f"materials={len(mesh.data.materials)}"
    )
    print(
        "SKIN "
        f"armatures=1 bones={len(bone_names)} "
        f"weighted_vertices={weighted_vertices}/{vertices}"
    )
    print(f"NODE_CONTRACT root={root.name} bones={','.join(REQUIRED_BONES)}")
    print(
        f"MATERIAL_CONTRACT names={','.join(material_names)}"
    )
    print(
        "MILESTONE stage=finished-color-detail "
        "facial_detail=recessed-feline views=hero,front,side,rear"
    )


def main() -> None:
    clear_scene()
    bpy.context.scene.frame_set(0)
    root, armature, mesh = build_character()
    report_stats(root, armature, mesh)

    BLEND_SOURCE.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_SOURCE))
    review_only = os.environ.get(
        "PURPLE_COUGAR_V3_REVIEW_ONLY",
        "",
    ).lower() in {"1", "true", "yes"}
    skip_render = os.environ.get(
        "PURPLE_COUGAR_V3_SKIP_RENDER",
        "",
    ).lower() in {"1", "true", "yes"}
    if not review_only:
        export_glb(root)
    if not skip_render:
        render_contact_sheet()

    if review_only:
        print("Skipped GLB export for review-only visual gate")
    else:
        print(f"Exported {OUTPUT}")
    print(f"Saved source {BLEND_SOURCE}")
    if skip_render:
        print("Skipped contact-sheet render")
    else:
        print(f"Rendered contact sheet {PREVIEW}")


if __name__ == "__main__":
    main()
