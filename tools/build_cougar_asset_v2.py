"""Build the articulated Purple Cougar v2 candidate.

Run with:
  /Applications/Blender.app/Contents/MacOS/Blender \
    --background --python tools/build_cougar_asset_v2.py

This is an intentionally deterministic, source-built GLB candidate.  It keeps
the runtime node contract under ``cougar`` while replacing the old fused-body
stand-in with a real armature and rigidly weighted anatomical components.  Each
leg is watertight within its own shoulder/hip pivot and remains independent
from the torso.
"""

from __future__ import annotations

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

# Reuse the established coordinate conversion and mesh/material utilities.
from build_cougar_asset import (  # noqa: E402
    activate,
    add_modifier_and_apply,
    bvec,
    clear_scene,
    empty,
    fuse_meshes,
    material,
    smooth_mesh,
    smart_uv,
    tube_curve,
    uv_sphere,
)


OUTPUT = Path(
    os.environ.get(
        "PURPLE_COUGAR_V2_OUTPUT",
        PROJECT / "public" / "assets" / "purple-cougar-v2.glb",
    )
)
PREVIEW = Path(
    os.environ.get(
        "PURPLE_COUGAR_V2_PREVIEW",
        PROJECT / "artifacts" / "purple-cougar-v2-preview.png",
    )
)
BLEND_SOURCE = Path(
    os.environ.get(
        "PURPLE_COUGAR_V2_BLEND",
        PROJECT / "artifacts" / "purple-cougar-v2.blend",
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


def freeze_transform(obj: bpy.types.Object) -> bpy.types.Object:
    """Bake a construction object's full transform into its mesh."""

    activate(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def rigid_weight(obj: bpy.types.Object, bone_name: str) -> bpy.types.Object:
    """Give every vertex of a component one deterministic bone influence."""

    if obj.type != "MESH":
        raise TypeError(f"{obj.name}: expected a mesh before skin weighting")
    group = obj.vertex_groups.get(bone_name) or obj.vertex_groups.new(
        name=bone_name
    )
    group.add(range(len(obj.data.vertices)), 1.0, "REPLACE")
    obj["rig_component"] = bone_name
    return obj


def blended_height_weight(
    obj: bpy.types.Object,
    lower_bone: str,
    upper_bone: str,
    start_y: float,
    end_y: float,
) -> bpy.types.Object:
    """Blend a continuous body surface across a vertical joint."""

    if end_y <= start_y:
        raise ValueError("end_y must be greater than start_y")
    lower = obj.vertex_groups.get(lower_bone) or obj.vertex_groups.new(
        name=lower_bone
    )
    upper = obj.vertex_groups.get(upper_bone) or obj.vertex_groups.new(
        name=upper_bone
    )
    for vertex in obj.data.vertices:
        # bvec maps Three-space y to Blender-space z.
        blend = max(0.0, min(1.0, (vertex.co.z - start_y) / (end_y - start_y)))
        if blend < 1.0:
            lower.add([vertex.index], 1.0 - blend, "REPLACE")
        if blend > 0.0:
            upper.add([vertex.index], blend, "REPLACE")
    obj["rig_component"] = f"{lower_bone}->{upper_bone}"
    return obj


def prepare_component(
    obj: bpy.types.Object,
    bone_name: str,
    *,
    unwrap: bool = False,
) -> bpy.types.Object:
    freeze_transform(obj)
    if unwrap:
        smart_uv(obj)
    return rigid_weight(obj, bone_name)


def reduce_component(
    obj: bpy.types.Object,
    target_triangles: int,
) -> bpy.types.Object:
    """Bound a remeshed component without touching small facial details."""

    obj.data.calc_loop_triangles()
    current = len(obj.data.loop_triangles)
    if current <= target_triangles:
        return obj
    ratio = max(0.05, min(1.0, target_triangles / current))
    add_modifier_and_apply(
        obj,
        "DECIMATE",
        "Browser triangle budget",
        decimate_type="COLLAPSE",
        ratio=ratio,
        use_collapse_triangulate=True,
    )
    smooth_mesh(obj)
    return obj


def make_torso(
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    length_segments: int = 48,
    radial_segments: int = 64,
) -> bpy.types.Object:
    """Create one clean athletic torso surface with no metaball lobes."""

    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []

    # Three-space: y is height and z runs from rump to chest.
    center_y = 0.68
    center_z = -0.16
    half_length = 0.80
    vertices.append(bvec((0.0, center_y, center_z - half_length)))

    for longitudinal in range(1, length_segments):
        u = longitudinal / length_segments
        angle = math.pi * u
        profile = math.sin(angle) ** 0.54
        z = center_z - half_length * math.cos(angle)

        # A stronger rump and compact chest make a cougar, while a continuous
        # profile avoids the string-of-metaballs silhouette of the first pass.
        rump_bias = math.exp(-((u - 0.29) / 0.24) ** 2)
        chest_bias = math.exp(-((u - 0.77) / 0.23) ** 2)
        abdomen_bias = math.exp(-((u - 0.55) / 0.19) ** 2)
        width = profile * (0.325 + 0.06 * rump_bias + 0.018 * chest_bias)
        top_height = profile * (
            0.225 + 0.065 * rump_bias + 0.028 * chest_bias
        )
        bottom_height = profile * (
            0.205
            + 0.060 * rump_bias
            + 0.032 * chest_bias
            - 0.045 * abdomen_bias
        )
        ring_center_y = center_y + 0.018 * rump_bias

        for radial in range(radial_segments):
            phi = 2.0 * math.pi * radial / radial_segments
            x = width * math.cos(phi)
            vertical = math.sin(phi)
            height = top_height if vertical >= 0.0 else bottom_height
            y = ring_center_y + height * vertical
            vertices.append(bvec((x, y, z)))

    end_index = len(vertices)
    vertices.append(bvec((0.0, center_y + 0.005, center_z + half_length)))

    first_ring = 1
    for radial in range(radial_segments):
        following = (radial + 1) % radial_segments
        faces.append((0, first_ring + following, first_ring + radial))

    for longitudinal in range(length_segments - 2):
        current = 1 + longitudinal * radial_segments
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

    final_ring = 1 + (length_segments - 2) * radial_segments
    for radial in range(radial_segments):
        following = (radial + 1) % radial_segments
        faces.append((final_ring + radial, final_ring + following, end_index))

    mesh = bpy.data.meshes.new("BodyGeometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    torso = bpy.data.objects.new("Body", mesh)
    bpy.context.collection.objects.link(torso)
    torso.parent = parent
    torso.data.materials.append(mat)
    smooth_mesh(torso)
    smart_uv(torso)
    return torso


def make_skull(
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    radial_segments: int = 56,
) -> bpy.types.Object:
    """Loft a low, heart-shaped feline skull instead of a round cranium."""

    # y, half-width, z-center, front-depth, back-depth
    sections = [
        (1.010, 0.080, 0.545, 0.140, 0.115),
        (1.075, 0.165, 0.570, 0.210, 0.175),
        (1.155, 0.255, 0.590, 0.260, 0.215),
        (1.235, 0.292, 0.590, 0.275, 0.230),
        (1.315, 0.268, 0.580, 0.260, 0.225),
        (1.395, 0.205, 0.560, 0.215, 0.185),
        (1.450, 0.105, 0.550, 0.125, 0.110),
    ]
    vertices: list[tuple[float, float, float]] = [
        bvec((0.0, 0.975, 0.535))
    ]
    faces: list[tuple[int, ...]] = []

    for y, width, z_center, front_depth, back_depth in sections:
        for radial in range(radial_segments):
            phi = 2.0 * math.pi * radial / radial_segments
            sine = math.sin(phi)
            depth = front_depth if sine >= 0.0 else back_depth
            vertices.append(
                bvec(
                    (
                        width * math.cos(phi),
                        y,
                        z_center + depth * sine,
                    )
                )
            )

    top_index = len(vertices)
    vertices.append(bvec((0.0, 1.475, 0.545)))

    for radial in range(radial_segments):
        following = (radial + 1) % radial_segments
        faces.append((0, 1 + following, 1 + radial))

    for section in range(len(sections) - 1):
        current = 1 + section * radial_segments
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

    final_ring = 1 + (len(sections) - 1) * radial_segments
    for radial in range(radial_segments):
        following = (radial + 1) % radial_segments
        faces.append((final_ring + radial, final_ring + following, top_index))

    mesh = bpy.data.meshes.new("HeadGeometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    skull = bpy.data.objects.new("HeadMesh", mesh)
    bpy.context.collection.objects.link(skull)
    skull.parent = parent
    skull.data.materials.append(mat)
    add_modifier_and_apply(
        skull,
        "SUBSURF",
        "Feline skull refinement",
        levels=1,
        render_levels=1,
        subdivision_type="CATMULL_CLARK",
    )
    smooth_mesh(skull)
    smart_uv(skull)
    return skull


def paint_chest_marking(
    obj: bpy.types.Object,
    cream: bpy.types.Material,
) -> None:
    """Assign a flush cream chest/throat marking on the skinned fur surface."""

    width_profile = [
        (0.48, 0.055),
        (0.55, 0.135),
        (0.66, 0.205),
        (0.78, 0.205),
        (0.90, 0.170),
        (1.01, 0.125),
        (1.11, 0.060),
    ]

    def width_at(height: float) -> float:
        for index in range(len(width_profile) - 1):
            lower_y, lower_width = width_profile[index]
            upper_y, upper_width = width_profile[index + 1]
            if lower_y <= height <= upper_y:
                blend = (height - lower_y) / (upper_y - lower_y)
                return lower_width + blend * (upper_width - lower_width)
        return 0.0

    cream_index = len(obj.data.materials)
    obj.data.materials.append(cream)
    obj.data.update()
    for polygon in obj.data.polygons:
        center = polygon.center
        height = center.z
        if not 0.48 <= height <= 1.11:
            continue
        front_threshold = 0.47 + 0.10 * ((height - 0.48) / 0.63)
        faces_forward = polygon.normal.y < -0.22
        vertices_inside = True
        for vertex_index in polygon.vertices:
            vertex = obj.data.vertices[vertex_index].co
            vertex_height = vertex.z
            vertex_width = width_at(vertex_height)
            vertex_threshold = 0.47 + 0.10 * (
                (vertex_height - 0.48) / 0.63
            )
            if (
                vertex_width <= 0.0
                or abs(vertex.x) > vertex_width
                or -vertex.y < vertex_threshold
            ):
                vertices_inside = False
                break
        if faces_forward and vertices_inside and -center.y >= front_threshold:
            polygon.material_index = cream_index


def make_rounded_nose(
    mat: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    """Make a compact downward-pointing feline nose, then softly bevel it."""

    front = [
        (-0.056, 1.155, 0.895),
        (0.056, 1.155, 0.895),
        (0.0, 1.102, 0.906),
    ]
    back = [
        (-0.043, 1.156, 0.868),
        (0.043, 1.156, 0.868),
        (0.0, 1.114, 0.878),
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
    nose.parent = parent
    nose.data.materials.append(mat)
    add_modifier_and_apply(
        nose,
        "BEVEL",
        "Soft triangular nose",
        width=0.010,
        segments=5,
    )
    smooth_mesh(nose)
    return nose


def make_materials() -> dict[str, bpy.types.Material]:
    return {
        "Fur": material(
            "Fur",
            (0.145, 0.024, 0.36, 1.0),
            0.73,
            coat=0.04,
            sheen=0.26,
        ),
        "FurDark": material(
            "FurDark",
            (0.075, 0.012, 0.145, 1.0),
            0.67,
            sheen=0.16,
        ),
        "Cream": material(
            "Cream",
            (0.62, 0.52, 0.50, 1.0),
            0.80,
            sheen=0.25,
        ),
        "Nose": material(
            "Nose",
            (0.78, 0.29, 0.42, 1.0),
            0.30,
            coat=0.50,
        ),
        # The amber surface is the entire visible eye.  There is deliberately
        # no white spherical eye plate in this asset.
        "Iris": material(
            "Iris",
            (0.93, 0.52, 0.055, 1.0),
            0.18,
            coat=0.72,
        ),
        "Pupil": material(
            "Pupil",
            (0.008, 0.004, 0.012, 1.0),
            0.14,
            coat=0.58,
        ),
        "Highlight": material(
            "Highlight",
            (1.0, 0.94, 0.82, 1.0),
            0.08,
        ),
        "EarInner": material(
            "EarInner",
            (0.57, 0.24, 0.50, 1.0),
            0.82,
            sheen=0.18,
        ),
        "Whisker": material(
            "Whisker",
            (0.93, 0.85, 0.92, 1.0),
            0.52,
        ),
        "Cuff": material(
            "Cuff",
            (0.135, 0.018, 0.30, 1.0),
            0.46,
            coat=0.18,
        ),
    }


def make_leg(
    name: str,
    spec: dict[str, object],
    mats: dict[str, bpy.types.Material],
    construction: bpy.types.Object,
) -> list[bpy.types.Object]:
    """Build one independently watertight limb around its named pivot."""

    path = spec["path"]
    assert isinstance(path, list)
    radii = spec["radii"]
    assert isinstance(radii, list)
    paw_center = spec["paw_center"]
    assert isinstance(paw_center, tuple)
    paw_radii = spec["paw_radii"]
    assert isinstance(paw_radii, tuple)
    muscle_center = spec["muscle_center"]
    assert isinstance(muscle_center, tuple)
    muscle_radii = spec["muscle_radii"]
    assert isinstance(muscle_radii, tuple)
    joint_center = spec.get("joint_center")
    joint_radii = spec.get("joint_radii")

    parts = [
        uv_sphere(
            f"{name}Muscle",
            muscle_center,
            muscle_radii,
            mats["Fur"],
            construction,
            segments=44,
            rings=28,
        ),
        tube_curve(
            f"{name}Limb",
            path,
            radii,
            mats["Fur"],
            construction,
            bevel_resolution=5,
            resolution=16,
        ),
        uv_sphere(
            f"{name}Paw",
            paw_center,
            paw_radii,
            mats["Fur"],
            construction,
            segments=48,
            rings=28,
        ),
    ]
    if isinstance(joint_center, tuple) and isinstance(joint_radii, tuple):
        parts.append(
            uv_sphere(
                f"{name}Joint",
                joint_center,
                joint_radii,
                mats["Fur"],
                construction,
                segments=34,
                rings=22,
            )
        )

    # Broad overlapping toe volumes become part of the same manifold limb.
    toe_spread = paw_radii[0] * 0.42
    for toe, lateral in enumerate((-toe_spread, 0.0, toe_spread), start=1):
        toe_center = (
            paw_center[0] + lateral,
            paw_center[1] + 0.004,
            paw_center[2] + paw_radii[2] * 0.47,
        )
        parts.append(
            uv_sphere(
                f"{name}Toe{toe}",
                toe_center,
                (0.058, 0.055, 0.068),
                mats["Fur"],
                construction,
                segments=28,
                rings=18,
            )
        )

    for part in parts:
        freeze_transform(part)
    limb = fuse_meshes(
        f"{name}Mesh",
        parts,
        construction,
        voxel_size=0.0125,
    )
    reduce_component(limb, 3600)
    prepare_component(limb, name)

    # Inset dark grooves give the large paw a feline read without separate toe
    # beads.  They use the same bone and therefore move with the limb.
    details: list[bpy.types.Object] = [limb]
    for seam, lateral in enumerate((-0.041, 0.041), start=1):
        groove = tube_curve(
            f"{name}ToeGroove{seam}",
            [
                (
                    paw_center[0] + lateral,
                    paw_center[1] + paw_radii[1] * 0.74,
                    paw_center[2] + paw_radii[2] * 0.75,
                ),
                (
                    paw_center[0] + lateral,
                    paw_center[1] + paw_radii[1] * 0.89,
                    paw_center[2] + paw_radii[2] * 0.46,
                ),
            ],
            [0.0032, 0.0015],
            mats["FurDark"],
            construction,
            bevel_resolution=2,
            resolution=7,
        )
        details.append(prepare_component(groove, name))
    return details


def make_head(
    mats: dict[str, bpy.types.Material],
    construction: bpy.types.Object,
) -> list[bpy.types.Object]:
    components: list[bpy.types.Object] = []

    head_mesh = make_skull(mats["Fur"], construction)
    components.append(prepare_component(head_mesh, "head"))

    # Broad cream muzzle and chin, fused into one soft facial mask.
    muzzle_parts = [
        uv_sphere(
            "MuzzleL",
            (-0.052, 1.105, 0.842),
            (0.089, 0.067, 0.050),
            mats["Cream"],
            construction,
            segments=34,
            rings=20,
        ),
        uv_sphere(
            "MuzzleR",
            (0.052, 1.105, 0.842),
            (0.089, 0.067, 0.050),
            mats["Cream"],
            construction,
            segments=34,
            rings=20,
        ),
        uv_sphere(
            "Chin",
            (0.0, 1.055, 0.805),
            (0.112, 0.054, 0.075),
            mats["Cream"],
            construction,
            segments=34,
            rings=20,
        ),
    ]
    for part in muzzle_parts:
        freeze_transform(part)
    muzzle = fuse_meshes(
        "Muzzle",
        muzzle_parts,
        construction,
        voxel_size=0.0085,
    )
    reduce_component(muzzle, 1300)
    components.append(prepare_component(muzzle, "head"))

    nose = make_rounded_nose(mats["Nose"], construction)
    components.append(prepare_component(nose, "head"))

    # Amber almond eyes are recessed into the skull and masked by substantial
    # fur lids.  The small pupils/catchlights sit just ahead of the amber lens.
    for side, label in ((-1, "L"), (1, "R")):
        eye_x = side * 0.088
        eye = uv_sphere(
            f"AmberEye{label}",
            (eye_x, 1.275, 0.842),
            (0.047, 0.037, 0.018),
            mats["Iris"],
            construction,
            segments=28,
            rings=18,
        )
        components.append(prepare_component(eye, "head"))

        pupil = uv_sphere(
            f"Pupil{label}",
            (eye_x - side * 0.002, 1.274, 0.858),
            (0.0115, 0.022, 0.0035),
            mats["Pupil"],
            construction,
            segments=18,
            rings=12,
        )
        components.append(prepare_component(pupil, "head"))

        highlight = uv_sphere(
            f"Highlight{label}",
            (eye_x - 0.006, 1.289, 0.862),
            (0.005, 0.006, 0.0018),
            mats["Highlight"],
            construction,
            segments=14,
            rings=8,
        )
        components.append(prepare_component(highlight, "head"))

        upper = tube_curve(
            f"UpperLid{label}",
            [
                (eye_x - 0.052, 1.270, 0.853),
                (eye_x, 1.318, 0.861),
                (eye_x + 0.052, 1.270, 0.853),
            ],
            [0.008, 0.011, 0.008],
            mats["Fur"],
            construction,
            bevel_resolution=4,
            resolution=12,
        )
        lower = tube_curve(
            f"LowerLid{label}",
            [
                (eye_x - 0.049, 1.263, 0.853),
                (eye_x, 1.239, 0.860),
                (eye_x + 0.049, 1.263, 0.853),
            ],
            [0.006, 0.008, 0.006],
            mats["Fur"],
            construction,
            bevel_resolution=4,
            resolution=12,
        )
        components.extend(
            [
                prepare_component(upper, "head"),
                prepare_component(lower, "head"),
            ]
        )

        inner_x = side * 0.036
        outer_x = side * 0.154
        brow = tube_curve(
            f"Brow{label}",
            [
                (inner_x, 1.375, 0.805),
                (side * 0.096, 1.394, 0.812),
                (outer_x, 1.365, 0.796),
            ],
            [0.009, 0.013, 0.008],
            mats["FurDark"],
            construction,
            bevel_resolution=4,
            resolution=12,
        )
        components.append(prepare_component(brow, "head"))

        for whisker in range(3):
            vertical = (whisker - 1) * 0.027
            whisker_mesh = tube_curve(
                f"Whisker{label}{whisker + 1}",
                [
                    (side * 0.085, 1.10 + vertical, 0.902),
                    (side * 0.205, 1.10 + vertical * 1.35, 0.930),
                    (side * 0.355, 1.105 + vertical * 1.8, 0.912),
                ],
                [0.0018, 0.0012, 0.00055],
                mats["Whisker"],
                construction,
                bevel_resolution=2,
                resolution=9,
            )
            components.append(prepare_component(whisker_mesh, "head"))

    mouth_center = tube_curve(
        "MouthCenter",
        [(0.0, 1.105, 0.902), (0.0, 1.063, 0.898)],
        [0.0036, 0.0022],
        mats["FurDark"],
        construction,
        bevel_resolution=3,
        resolution=8,
    )
    components.append(prepare_component(mouth_center, "head"))
    for side, label in ((-1, "L"), (1, "R")):
        mouth = tube_curve(
            f"MouthCorner{label}",
            [
                (0.0, 1.065, 0.898),
                (side * 0.032, 1.052, 0.896),
                (side * 0.064, 1.064, 0.886),
            ],
            [0.0032, 0.0024, 0.0012],
            mats["FurDark"],
            construction,
            bevel_resolution=3,
            resolution=9,
        )
        components.append(prepare_component(mouth, "head"))

    return components


def make_ear(
    bone_name: str,
    side: int,
    mats: dict[str, bpy.types.Material],
    construction: bpy.types.Object,
) -> list[bpy.types.Object]:
    """Create a small rounded cougar ear deeply embedded in the cranium."""

    center = (side * 0.205, 1.398, 0.615)
    outer = uv_sphere(
        f"{bone_name}Outer",
        center,
        (0.075, 0.090, 0.045),
        mats["Fur"],
        construction,
        segments=28,
        rings=18,
    )
    outer.rotation_euler[1] = side * math.radians(9)
    outer.rotation_euler[2] = -side * math.radians(7)
    components = [prepare_component(outer, bone_name)]

    inner = uv_sphere(
        f"{bone_name}Inner",
        (side * 0.205, 1.402, 0.654),
        (0.043, 0.052, 0.010),
        mats["EarInner"],
        construction,
        segments=24,
        rings=16,
    )
    inner.rotation_euler[1] = side * math.radians(9)
    inner.rotation_euler[2] = -side * math.radians(7)
    components.append(prepare_component(inner, bone_name))
    return components


def make_armature(
    root: bpy.types.Object,
) -> tuple[bpy.types.Object, dict[str, bpy.types.EditBone]]:
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
    ) -> bpy.types.EditBone:
        bone = armature_data.edit_bones.new(name)
        bone.head = Vector(bvec(head))
        bone.tail = Vector(bvec(tail))
        if parent:
            bone.parent = bones[parent]
            bone.use_connect = False
        bones[name] = bone
        return bone

    add_bone("body", (0.0, 0.64, -0.52), (0.0, 0.76, 0.28))
    add_bone("neck", (0.0, 0.69, 0.34), (0.0, 1.06, 0.52), "body")
    add_bone("head", (0.0, 1.085, 0.52), (0.0, 1.31, 0.61), "neck")
    add_bone(
        "leftEar",
        (-0.205, 1.345, 0.60),
        (-0.205, 1.445, 0.63),
        "head",
    )
    add_bone(
        "rightEar",
        (0.205, 1.345, 0.60),
        (0.205, 1.445, 0.63),
        "head",
    )
    add_bone(
        "legFL",
        (-0.070, 0.75, 0.31),
        (-0.200, 0.455, 0.35),
        "body",
    )
    add_bone(
        "legFR",
        (0.070, 0.76, 0.40),
        (0.205, 0.465, 0.44),
        "body",
    )
    add_bone(
        "legHL",
        (-0.080, 0.74, -0.59),
        (-0.205, 0.475, -0.50),
        "body",
    )
    add_bone(
        "legHR",
        (0.080, 0.75, -0.52),
        (0.210, 0.485, -0.42),
        "body",
    )
    add_bone(
        "tail",
        (0.0, 0.68, -0.80),
        (0.10, 0.65, -0.98),
        "body",
    )
    add_bone(
        "cuffAnchor",
        (0.250, 0.215, -0.375),
        (0.250, 0.295, -0.36),
        "legHR",
    )

    bpy.ops.object.mode_set(mode="OBJECT")
    return armature, bones


def join_skinned_mesh(
    components: Iterable[bpy.types.Object],
    armature: bpy.types.Object,
) -> bpy.types.Object:
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

    # Surface any construction error instead of exporting a silently unweighted
    # piece that stays behind when a bone moves.
    weighted = set()
    for vertex in mesh.data.vertices:
        if vertex.groups:
            weighted.add(vertex.index)
    if len(weighted) != len(mesh.data.vertices):
        raise RuntimeError(
            f"{len(mesh.data.vertices) - len(weighted)} vertices have no bone weight"
        )
    return mesh


def build_character() -> tuple[
    bpy.types.Object,
    bpy.types.Object,
    bpy.types.Object,
    dict[str, bpy.types.Material],
]:
    mats = make_materials()
    construction = empty("_construction")
    root = empty("cougar")
    root["asset_version"] = "2.0"
    root["articulation"] = "armature-skinned-anatomical-components"

    components: list[bpy.types.Object] = []

    torso = make_torso(mats["Fur"], construction)
    neck_parts = [
        tube_curve(
            "NeckCore",
            [
                (0.0, 0.68, 0.32),
                (0.0, 0.91, 0.43),
                (0.0, 1.10, 0.52),
            ],
            [0.225, 0.235, 0.220],
            mats["Fur"],
            construction,
            bevel_resolution=6,
            resolution=18,
        ),
        uv_sphere(
            "NeckBase",
            (0.0, 0.72, 0.33),
            (0.235, 0.225, 0.225),
            mats["Fur"],
            construction,
            segments=48,
            rings=28,
        ),
    ]
    body_neck_parts = [torso, *neck_parts]
    for part in body_neck_parts:
        freeze_transform(part)
    body_neck = fuse_meshes(
        "Body",
        body_neck_parts,
        construction,
        voxel_size=0.014,
    )
    reduce_component(body_neck, 10500)
    freeze_transform(body_neck)
    paint_chest_marking(body_neck, mats["Cream"])
    components.append(
        blended_height_weight(body_neck, "body", "neck", 0.74, 1.00)
    )

    components.extend(make_head(mats, construction))
    components.extend(make_ear("leftEar", -1, mats, construction))
    components.extend(make_ear("rightEar", 1, mats, construction))

    leg_specs = {
        "legFR": {
            "path": [
                (0.070, 0.76, 0.40),
                (0.100, 0.60, 0.40),
                (0.210, 0.46, 0.44),
                (0.235, 0.29, 0.50),
                (0.250, 0.16, 0.56),
            ],
            "radii": [0.150, 0.135, 0.120, 0.090, 0.075],
            "muscle_center": (0.070, 0.67, 0.38),
            "muscle_radii": (0.128, 0.170, 0.150),
            "joint_center": (0.205, 0.465, 0.44),
            "joint_radii": (0.115, 0.130, 0.120),
            "paw_center": (0.250, 0.085, 0.635),
            "paw_radii": (0.170, 0.085, 0.185),
        },
        "legFL": {
            "path": [
                (-0.070, 0.75, 0.31),
                (-0.100, 0.59, 0.31),
                (-0.205, 0.45, 0.35),
                (-0.230, 0.29, 0.40),
                (-0.245, 0.16, 0.44),
            ],
            "radii": [0.147, 0.132, 0.117, 0.088, 0.073],
            "muscle_center": (-0.070, 0.66, 0.30),
            "muscle_radii": (0.126, 0.168, 0.146),
            "joint_center": (-0.200, 0.455, 0.35),
            "joint_radii": (0.112, 0.127, 0.117),
            "paw_center": (-0.245, 0.085, 0.515),
            "paw_radii": (0.166, 0.083, 0.181),
        },
        "legHR": {
            "path": [
                (0.080, 0.75, -0.52),
                (0.110, 0.60, -0.51),
                (0.215, 0.47, -0.40),
                (0.240, 0.30, -0.48),
                (0.250, 0.16, -0.36),
            ],
            "radii": [0.185, 0.162, 0.132, 0.098, 0.076],
            "muscle_center": (0.080, 0.65, -0.54),
            "muscle_radii": (0.160, 0.195, 0.184),
            "joint_center": (0.210, 0.485, -0.42),
            "joint_radii": (0.132, 0.145, 0.145),
            "paw_center": (0.250, 0.085, -0.235),
            "paw_radii": (0.172, 0.086, 0.190),
        },
        "legHL": {
            "path": [
                (-0.080, 0.74, -0.59),
                (-0.110, 0.59, -0.58),
                (-0.210, 0.46, -0.48),
                (-0.235, 0.29, -0.56),
                (-0.245, 0.16, -0.45),
            ],
            "radii": [0.180, 0.158, 0.128, 0.095, 0.074],
            "muscle_center": (-0.080, 0.64, -0.60),
            "muscle_radii": (0.156, 0.190, 0.180),
            "joint_center": (-0.205, 0.475, -0.50),
            "joint_radii": (0.128, 0.140, 0.140),
            "paw_center": (-0.245, 0.085, -0.325),
            "paw_radii": (0.168, 0.084, 0.186),
        },
    }
    for leg_name, spec in leg_specs.items():
        components.extend(make_leg(leg_name, spec, mats, construction))

    tail_parts = [
        tube_curve(
            "TailCore",
            [
                (0.0, 0.68, -0.80),
                (0.02, 0.67, -0.90),
                (0.14, 0.63, -1.03),
                (0.40, 0.57, -1.15),
                (0.68, 0.52, -1.04),
                (0.90, 0.54, -0.87),
                (1.00, 0.68, -0.68),
                (0.96, 0.84, -0.57),
            ],
            [0.096, 0.094, 0.088, 0.078, 0.068, 0.058, 0.049, 0.038],
            mats["Fur"],
            construction,
            bevel_resolution=5,
            resolution=18,
        ),
        uv_sphere(
            "TailTip",
            (0.96, 0.84, -0.57),
            (0.042, 0.047, 0.045),
            mats["Fur"],
            construction,
            segments=32,
            rings=20,
        ),
    ]
    for part in tail_parts:
        freeze_transform(part)
    tail_mesh = fuse_meshes(
        "TailMesh",
        tail_parts,
        construction,
        voxel_size=0.0105,
    )
    reduce_component(tail_mesh, 2400)
    components.append(prepare_component(tail_mesh, "tail"))

    # A compact purple cuff rides on the dedicated child bone beneath legHR.
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.098,
        minor_radius=0.022,
        major_segments=48,
        minor_segments=12,
        location=bvec((0.250, 0.215, -0.375)),
    )
    cuff = bpy.context.active_object
    cuff.name = "Cuff"
    cuff.parent = construction
    cuff.scale.x = 0.92
    cuff.scale.y = 0.92
    cuff.data.materials.append(mats["Cuff"])
    smooth_mesh(cuff)
    components.append(prepare_component(cuff, "cuffAnchor"))

    armature, _ = make_armature(root)
    mesh = join_skinned_mesh(components, armature)

    # The construction empty must never leak into the runtime node contract.
    if construction.users_collection:
        bpy.data.objects.remove(construction, do_unlink=True)

    return root, armature, mesh, mats


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


def render_preview() -> None:
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.mesh.primitive_plane_add(size=18, location=(0.0, 0.0, 0.0))
    ground = bpy.context.active_object
    ground.name = "PreviewGround"
    ground_mat = material(
        "PreviewGround",
        (0.115, 0.145, 0.13, 1.0),
        0.92,
    )
    ground.data.materials.append(ground_mat)

    camera_data = bpy.data.cameras.new("PreviewCamera")
    camera = bpy.data.objects.new("PreviewCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = bvec((2.85, 1.48, 3.75))
    camera_data.lens = 58
    camera_data.sensor_width = 36
    look_at(camera, (0.0, 0.72, -0.08))
    bpy.context.scene.camera = camera

    key_data = bpy.data.lights.new("Key", type="AREA")
    key_data.energy = 430
    key_data.shape = "DISK"
    key_data.size = 4.2
    key = bpy.data.objects.new("Key", key_data)
    bpy.context.collection.objects.link(key)
    key.location = bvec((3.3, 4.5, 3.7))
    look_at(key, (0.0, 0.76, -0.05))

    fill_data = bpy.data.lights.new("Fill", type="AREA")
    fill_data.energy = 125
    fill_data.color = (0.42, 0.55, 0.82)
    fill_data.size = 3.6
    fill = bpy.data.objects.new("Fill", fill_data)
    bpy.context.collection.objects.link(fill)
    fill.location = bvec((-3.5, 2.6, 2.5))
    look_at(fill, (0.0, 0.78, -0.05))

    rim_data = bpy.data.lights.new("Rim", type="AREA")
    rim_data.energy = 240
    rim_data.color = (0.82, 0.30, 0.55)
    rim_data.size = 3.2
    rim = bpy.data.objects.new("Rim", rim_data)
    bpy.context.collection.objects.link(rim)
    rim.location = bvec((-2.4, 3.2, -3.4))
    look_at(rim, (0.0, 0.80, -0.16))

    top_data = bpy.data.lights.new("TopSoftbox", type="AREA")
    top_data.energy = 95
    top_data.size = 3.0
    top = bpy.data.objects.new("TopSoftbox", top_data)
    bpy.context.collection.objects.link(top)
    top.location = bvec((0.2, 4.5, -0.1))
    look_at(top, (0.0, 0.7, -0.1))

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = "8"
    scene.render.filepath = str(PREVIEW)
    scene.render.film_transparent = False
    scene.world.color = (0.012, 0.018, 0.025)
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    bpy.ops.render.render(write_still=True)


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

    weighted_vertices = sum(bool(vertex.groups) for vertex in mesh.data.vertices)
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


def main() -> None:
    clear_scene()
    bpy.context.scene.frame_set(0)
    root, armature, mesh, _ = build_character()
    report_stats(root, armature, mesh)

    BLEND_SOURCE.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_SOURCE))
    export_glb(root)
    render_preview()

    print(f"Exported {OUTPUT}")
    print(f"Saved source {BLEND_SOURCE}")
    print(f"Rendered {PREVIEW}")


if __name__ == "__main__":
    main()
