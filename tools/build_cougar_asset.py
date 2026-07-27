"""Author Purple Cougar's browser-ready hero asset in Blender.

Run with:
  /Applications/Blender.app/Contents/MacOS/Blender \
    --background --python tools/build_cougar_asset.py

The asset uses a stable node contract consumed by src/cougar/modelAsset.ts:
cougar, neck, head, leftEar, rightEar, legFL/FR/HL/HR, tail, cuffAnchor.
Coordinates in this file are written in the game's Three.js convention
(+Y up, +Z forward) and converted to Blender's Z-up space at construction.
"""

from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Sequence

import bpy
from mathutils import Vector


PROJECT = Path(__file__).resolve().parents[1]
OUTPUT = Path(
    os.environ.get(
        "PURPLE_COUGAR_OUTPUT",
        PROJECT / "public" / "assets" / "purple-cougar.glb",
    )
)
PREVIEW = Path(
    os.environ.get(
        "PURPLE_COUGAR_PREVIEW",
        PROJECT / "artifacts" / "purple-cougar-preview.png",
    )
)


def bvec(point: Sequence[float]) -> tuple[float, float, float]:
    """Three.js (x, y-up, z-forward) -> Blender (x, y-back, z-up)."""

    x, y, z = point
    return (x, -z, y)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.metaballs,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def material(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float,
    metallic: float = 0.0,
    coat: float = 0.0,
    sheen: float = 0.0,
) -> bpy.types.Material:
    result = bpy.data.materials.new(name)
    result.diffuse_color = color
    result.use_nodes = True
    bsdf = result.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        if "Base Color" in bsdf.inputs:
            bsdf.inputs["Base Color"].default_value = color
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = roughness
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = metallic
        if "Coat Weight" in bsdf.inputs:
            bsdf.inputs["Coat Weight"].default_value = coat
        if "Sheen Weight" in bsdf.inputs:
            bsdf.inputs["Sheen Weight"].default_value = sheen
    return result


def empty(
    name: str,
    parent: bpy.types.Object | None = None,
    location: Sequence[float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    result = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(result)
    result.empty_display_type = "PLAIN_AXES"
    result.empty_display_size = 0.06
    result.parent = parent
    result.location = bvec(location)
    return result


def activate(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def smooth_mesh(obj: bpy.types.Object) -> None:
    if obj.type != "MESH":
        return
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def smart_uv(obj: bpy.types.Object) -> None:
    if obj.type != "MESH" or not obj.data.polygons:
        return
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    except RuntimeError:
        pass
    bpy.ops.object.mode_set(mode="OBJECT")


def add_modifier_and_apply(
    obj: bpy.types.Object,
    modifier_type: str,
    name: str,
    **settings: float | int | bool,
) -> None:
    modifier = obj.modifiers.new(name=name, type=modifier_type)
    for key, value in settings.items():
        if hasattr(modifier, key):
            setattr(modifier, key, value)
    activate(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def meta_mesh(
    name: str,
    elements: Sequence[
        tuple[
            tuple[float, float, float],
            tuple[float, float, float],
            float,
        ]
    ],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    resolution: float = 0.025,
) -> bpy.types.Object:
    data = bpy.data.metaballs.new(f"{name}Field")
    data.resolution = resolution
    data.render_resolution = max(0.015, resolution * 0.72)
    data.threshold = 0.62
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = (0.0, 0.0, 0.0)

    for center, radii, stiffness in elements:
        element = data.elements.new()
        element.type = "ELLIPSOID"
        element.co = bvec(center)
        element.radius = 1.0
        rx, ry, rz = radii
        element.size_x = rx
        element.size_y = rz
        element.size_z = ry
        element.stiffness = stiffness

    activate(obj)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = f"{name}Geometry"
    obj.data.materials.append(mat)
    smooth_mesh(obj)
    add_modifier_and_apply(
        obj,
        "SMOOTH",
        "Organic smoothing",
        factor=0.34,
        iterations=2,
    )
    smart_uv(obj)
    return obj


def uv_sphere(
    name: str,
    center: Sequence[float],
    radii: Sequence[float],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    segments: int = 40,
    rings: int = 24,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings)
    obj = bpy.context.active_object
    obj.name = name
    obj.parent = parent
    obj.location = bvec(center)
    rx, ry, rz = radii
    obj.scale = (rx, rz, ry)
    obj.data.materials.append(mat)
    smooth_mesh(obj)
    return obj


def fuse_meshes(
    name: str,
    objects: Sequence[bpy.types.Object],
    parent: bpy.types.Object,
    voxel_size: float = 0.009,
) -> bpy.types.Object:
    """Union overlapping toy-sculpt volumes into one watertight smooth mesh."""

    if not objects:
        raise ValueError(f"{name}: at least one object is required")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    active = objects[0]
    bpy.context.view_layer.objects.active = active
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    joined.parent = parent
    add_modifier_and_apply(
        joined,
        "REMESH",
        "Watertight organic union",
        mode="VOXEL",
        voxel_size=voxel_size,
        use_smooth_shade=True,
    )
    add_modifier_and_apply(
        joined,
        "SMOOTH",
        "Soften organic transitions",
        factor=0.2,
        iterations=2,
    )
    smooth_mesh(joined)
    smart_uv(joined)
    return joined


def tube_curve(
    name: str,
    points: Sequence[tuple[float, float, float]],
    radii: Sequence[float],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    bevel_resolution: int = 4,
    resolution: int = 14,
) -> bpy.types.Object:
    if len(points) != len(radii):
        raise ValueError(f"{name}: points and radii must have the same length")
    base_radius = max(radii)
    curve = bpy.data.curves.new(f"{name}Curve", type="CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.render_resolution_u = resolution
    curve.bevel_depth = base_radius
    curve.bevel_resolution = bevel_resolution
    curve.resolution_u = resolution
    curve.use_fill_caps = True
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for bezier, point, radius in zip(spline.bezier_points, points, radii):
        bezier.co = bvec(point)
        bezier.handle_left_type = "AUTO"
        bezier.handle_right_type = "AUTO"
        bezier.radius = radius / base_radius

    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = (0.0, 0.0, 0.0)
    obj.data.materials.append(mat)
    activate(obj)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.active_object
    obj.name = name
    smooth_mesh(obj)
    return obj


def rounded_ear(
    name: str,
    side: int,
    fur: bpy.types.Material,
    inner: bpy.types.Material,
    head: bpy.types.Object,
) -> bpy.types.Object:
    ear = empty(
        name,
        parent=head,
        location=(side * 0.14, 0.074, -0.022),
    )
    # A rounded, graduated cup reads as a cougar ear; a beveled triangular
    # prism reads as a domestic cat. The base penetrates the cranium so there
    # is no detached "hat" seam.
    ear.rotation_euler[1] = side * math.radians(8)
    ear.rotation_euler[2] = -side * math.radians(7)

    def ear_shell(
        object_name: str,
        rings: Sequence[tuple[float, float, float, float]],
        mat: bpy.types.Material,
        bevel: float,
        z_offset: float = 0.0,
    ) -> bpy.types.Object:
        ring_segments = 16
        points: list[tuple[float, float, float]] = []
        for center_y, half_width, half_depth, roundness in rings:
            for index in range(ring_segments):
                angle = 2.0 * math.pi * index / ring_segments
                x = half_width * math.cos(angle)
                z = z_offset + half_depth * math.sin(angle) * roundness
                points.append((x, center_y, z))

        faces: list[tuple[int, ...]] = []
        for ring_index in range(len(rings) - 1):
            current = ring_index * ring_segments
            following = (ring_index + 1) * ring_segments
            for index in range(ring_segments):
                next_index = (index + 1) % ring_segments
                faces.append(
                    (
                        current + index,
                        current + next_index,
                        following + next_index,
                        following + index,
                    )
                )
        faces.append(tuple(reversed(range(ring_segments))))
        last = (len(rings) - 1) * ring_segments
        faces.append(tuple(last + index for index in range(ring_segments)))
        mesh = bpy.data.meshes.new(f"{object_name}Geometry")
        mesh.from_pydata([bvec(point) for point in points], [], faces)
        mesh.update()
        shell = bpy.data.objects.new(object_name, mesh)
        bpy.context.collection.objects.link(shell)
        shell.parent = ear
        shell.data.materials.append(mat)
        add_modifier_and_apply(
            shell,
            "BEVEL",
            "Soft rounded ear shell",
            width=bevel,
            segments=5,
        )
        smooth_mesh(shell)
        smart_uv(shell)
        return shell

    ear_shell(
        f"{name}Outer",
        rings=[
            (-0.038, 0.074, 0.043, 0.9),
            (0.0, 0.082, 0.048, 1.0),
            (0.042, 0.071, 0.043, 1.0),
            (0.072, 0.056, 0.036, 1.0),
            (0.093, 0.041, 0.028, 1.0),
            (0.107, 0.023, 0.017, 1.0),
            (0.113, 0.007, 0.006, 1.0),
        ],
        mat=fur,
        bevel=0.008,
    )
    ear_shell(
        f"{name}Inner",
        rings=[
            (-0.004, 0.047, 0.009, 1.0),
            (0.026, 0.053, 0.012, 1.0),
            (0.056, 0.041, 0.010, 1.0),
            (0.076, 0.029, 0.008, 1.0),
            (0.091, 0.016, 0.006, 1.0),
            (0.097, 0.005, 0.003, 1.0),
        ],
        mat=inner,
        bevel=0.006,
        z_offset=0.045,
    )
    return ear


def triangular_nose(
    mat: bpy.types.Material,
    head: bpy.types.Object,
) -> bpy.types.Object:
    front = [
        (-0.071, -0.036, 0.208),
        (0.071, -0.036, 0.208),
        (0.0, -0.096, 0.212),
    ]
    back = [
        (-0.055, -0.04, 0.18),
        (0.055, -0.04, 0.18),
        (0.0, -0.085, 0.183),
    ]
    vertices = [bvec(point) for point in front + back]
    faces = [
        (0, 1, 2),
        (5, 4, 3),
        (0, 3, 4, 1),
        (1, 4, 5, 2),
        (2, 5, 3, 0),
    ]
    mesh = bpy.data.meshes.new("NoseGeometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Nose", mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = head
    obj.data.materials.append(mat)
    add_modifier_and_apply(
        obj,
        "BEVEL",
        "Rounded nose leather",
        width=0.012,
        segments=5,
    )
    smooth_mesh(obj)
    return obj


def make_character() -> tuple[bpy.types.Object, dict[str, bpy.types.Material]]:
    mats = {
        "Fur": material("Fur", (0.245, 0.072, 0.54, 1.0), 0.76, sheen=0.34),
        "FurDark": material("FurDark", (0.07, 0.01, 0.15, 1.0), 0.72),
        "Cream": material("Cream", (0.58, 0.48, 0.62, 1.0), 0.84, sheen=0.22),
        "Nose": material("Nose", (0.72, 0.31, 0.43, 1.0), 0.34, coat=0.45),
        "EyeWhite": material("EyeWhite", (0.76, 0.72, 0.78, 1.0), 0.2, coat=0.62),
        "Iris": material("Iris", (0.9, 0.55, 0.08, 1.0), 0.14, coat=0.8),
        "Pupil": material("Pupil", (0.012, 0.008, 0.016, 1.0), 0.12, coat=0.55),
        "Highlight": material("Highlight", (1.0, 1.0, 1.0, 1.0), 0.05),
        "EarInner": material("EarInner", (0.43, 0.18, 0.49, 1.0), 0.88, sheen=0.16),
        "Whisker": material("Whisker", (0.9, 0.88, 0.86, 1.0), 0.5),
        "Cuff": material("Cuff", (0.19, 0.025, 0.34, 1.0), 0.72),
    }

    root = empty("cougar")
    root.rotation_euler[2] = math.radians(-7)

    body_mesh = meta_mesh(
        "Body",
        [
            ((0.0, 0.64, -0.62), (0.31, 0.30, 0.31), 2.0),
            ((0.0, 0.65, -0.40), (0.315, 0.29, 0.36), 2.0),
            ((0.0, 0.62, -0.10), (0.285, 0.275, 0.39), 2.0),
            ((0.0, 0.64, 0.18), (0.30, 0.295, 0.35), 2.0),
            ((0.0, 0.67, 0.41), (0.27, 0.285, 0.28), 1.9),
        ],
        mats["Fur"],
        root,
        resolution=0.022,
    )

    neck_pivot = (0.0, 0.64, 0.38)
    neck = empty("neck", parent=root, location=neck_pivot)
    meta_mesh(
        "NeckMesh",
        [
            ((0.0, -0.025, -0.025), (0.22, 0.235, 0.25), 2.0),
            ((0.0, 0.08, 0.14), (0.205, 0.225, 0.235), 2.0),
            ((0.0, 0.16, 0.28), (0.17, 0.185, 0.185), 1.9),
        ],
        mats["Fur"],
        neck,
        resolution=0.02,
    )
    head = empty("head", parent=neck, location=(0.0, 0.17, 0.31))
    head_visual = empty("headVisual", parent=head)
    # Keep the stable head node neutral for runtime animation while the authored
    # sculpt carries the friendly three-quarter turn from the reference.
    head_visual.rotation_euler[2] = math.radians(21)
    head_visual.scale = (1.22, 1.08, 1.10)
    meta_mesh(
        "HeadMesh",
        [
            ((0.0, 0.01, -0.026), (0.238, 0.195, 0.18), 2.0),
            ((-0.12, -0.004, 0.035), (0.12, 0.122, 0.118), 1.9),
            ((0.12, -0.004, 0.035), (0.12, 0.122, 0.118), 1.9),
            ((0.0, -0.05, 0.08), (0.13, 0.09, 0.10), 1.9),
            ((0.0, 0.088, 0.018), (0.17, 0.12, 0.12), 1.8),
            ((0.0, 0.045, 0.10), (0.08, 0.095, 0.07), 1.9),
            ((0.0, -0.018, 0.155), (0.07, 0.07, 0.045), 1.9),
        ],
        mats["Fur"],
        head_visual,
        resolution=0.014,
    )

    rounded_ear("leftEar", -1, mats["Fur"], mats["EarInner"], head_visual)
    rounded_ear("rightEar", 1, mats["Fur"], mats["EarInner"], head_visual)

    for side, label in ((-1, "L"), (1, "R")):
        uv_sphere(
            f"EyeWhite{label}",
            (side * 0.088, 0.035, 0.158),
            (0.046, 0.027, 0.006),
            mats["EyeWhite"],
            head_visual,
        )
        uv_sphere(
            f"Iris{label}",
            (side * 0.088 - 0.002, 0.031, 0.163),
            (0.0255, 0.0245, 0.0035),
            mats["Iris"],
            head_visual,
            segments=32,
            rings=20,
        )
        uv_sphere(
            f"Pupil{label}",
            (side * 0.088 - 0.002, 0.031, 0.166),
            (0.0125, 0.016, 0.0027),
            mats["Pupil"],
            head_visual,
            segments=24,
            rings=16,
        )
        uv_sphere(
            f"Highlight{label}",
            (side * 0.088 - 0.011, 0.045, 0.169),
            (0.0042, 0.005, 0.0018),
            mats["Highlight"],
            head_visual,
            segments=20,
            rings=12,
        )
        eye_x = side * 0.088
        tube_curve(
            f"UpperLid{label}",
            [
                (eye_x - 0.044, 0.037, 0.164),
                (eye_x, 0.064, 0.167),
                (eye_x + 0.044, 0.037, 0.164),
            ],
            [0.004, 0.0065, 0.004],
            mats["Fur"],
            head_visual,
            bevel_resolution=3,
            resolution=10,
        )
        tube_curve(
            f"LowerLid{label}",
            [
                (eye_x - 0.04, 0.012, 0.162),
                (eye_x, 0.001, 0.164),
                (eye_x + 0.04, 0.012, 0.162),
            ],
            [0.0025, 0.0035, 0.0025],
            mats["Fur"],
            head_visual,
            bevel_resolution=3,
            resolution=10,
        )
        tube_curve(
            f"Brow{label}",
            [
                (side * 0.03, 0.09, 0.169),
                (side * 0.086, 0.108, 0.173),
                (side * 0.148, 0.091, 0.161),
            ],
            [0.006, 0.01, 0.005],
            mats["FurDark"],
            head_visual,
            bevel_resolution=3,
            resolution=10,
        )
        for whisker in range(3):
            offset = (whisker - 1) * 0.014
            tube_curve(
                f"Whisker{label}{whisker + 1}",
                [
                    (side * 0.055, -0.055 + offset, 0.185),
                    (side * 0.142, -0.045 + offset, 0.21),
                    (side * 0.235, -0.06 + offset, 0.19),
                ],
                [0.0015, 0.001, 0.00045],
                mats["Whisker"],
                head_visual,
                bevel_resolution=2,
                resolution=8,
            )

    meta_mesh(
        "Muzzle",
        [
            ((-0.043, -0.063, 0.185), (0.06, 0.04, 0.028), 2.0),
            ((0.043, -0.063, 0.185), (0.06, 0.04, 0.028), 2.0),
            ((0.0, -0.1, 0.165), (0.055, 0.035, 0.027), 1.9),
        ],
        mats["Cream"],
        head_visual,
        resolution=0.009,
    )
    triangular_nose(mats["Nose"], head_visual)
    tube_curve(
        "MouthCenter",
        [(0.0, -0.057, 0.216), (0.0, -0.087, 0.205)],
        [0.0025, 0.0015],
        mats["FurDark"],
        head_visual,
        bevel_resolution=2,
        resolution=6,
    )
    for side, label in ((-1, "L"), (1, "R")):
        tube_curve(
            f"MouthCorner{label}",
            [
                (0.0, -0.084, 0.205),
                (side * 0.027, -0.097, 0.204),
                (side * 0.054, -0.09, 0.194),
            ],
            [0.002, 0.0016, 0.0006],
            mats["FurDark"],
            head_visual,
            bevel_resolution=2,
            resolution=7,
        )

    # Each articulated leg has a real shoulder/hip pivot and one continuous
    # tapered limb tube. The tube penetrates both torso and paw so no daylight
    # can appear between anatomical volumes.
    leg_specs = {
        "legFR": {
            "pivot": (0.15, 0.65, 0.31),
            "path": [(0.0, 0.0, 0.0), (0.025, -0.17, 0.04), (0.04, -0.37, 0.13), (0.05, -0.54, 0.22)],
            "radii": [0.12, 0.1, 0.072, 0.06],
            "muscle": (0.105, 0.135, 0.11),
            "paw": ((0.05, -0.59, 0.29), (0.11, 0.06, 0.135)),
        },
        "legFL": {
            "pivot": (-0.14, 0.63, 0.18),
            "path": [(0.0, 0.0, 0.0), (-0.02, -0.17, 0.03), (-0.03, -0.36, 0.10), (-0.035, -0.52, 0.17)],
            "radii": [0.11, 0.092, 0.066, 0.056],
            "muscle": (0.1, 0.13, 0.105),
            "paw": ((-0.035, -0.57, 0.235), (0.102, 0.057, 0.125)),
        },
        "legHR": {
            "pivot": (0.17, 0.65, -0.49),
            "path": [(0.0, 0.0, 0.0), (0.055, -0.18, 0.10), (0.04, -0.36, -0.055), (0.03, -0.54, 0.08)],
            "radii": [0.165, 0.128, 0.083, 0.062],
            "muscle": (0.145, 0.17, 0.145),
            "paw": ((0.03, -0.59, 0.16), (0.112, 0.06, 0.135)),
        },
        "legHL": {
            "pivot": (-0.17, 0.64, -0.56),
            "path": [(0.0, 0.0, 0.0), (-0.045, -0.18, 0.08), (-0.035, -0.35, -0.065), (-0.025, -0.52, 0.055)],
            "radii": [0.15, 0.118, 0.078, 0.058],
            "muscle": (0.135, 0.16, 0.135),
            "paw": ((-0.025, -0.575, 0.13), (0.105, 0.058, 0.13)),
        },
    }

    leg_groups: dict[str, bpy.types.Object] = {}
    limb_parts: list[bpy.types.Object] = []
    for leg_name, spec in leg_specs.items():
        leg = empty(leg_name, parent=root, location=spec["pivot"])
        leg_groups[leg_name] = leg
        path = spec["path"]
        limb_parts.append(uv_sphere(
            f"{leg_name}Muscle",
            (
                path[1][0] * 0.45,
                -0.075,
                path[1][2] * 0.45,
            ),
            spec["muscle"],
            mats["Fur"],
            leg,
        ))
        limb_parts.append(tube_curve(
            f"{leg_name}Mesh",
            path,
            spec["radii"],
            mats["Fur"],
            leg,
            bevel_resolution=5,
            resolution=16,
        ))
        paw_center, paw_radii = spec["paw"]
        limb_parts.append(uv_sphere(
            f"{leg_name}Paw",
            paw_center,
            paw_radii,
            mats["Fur"],
            leg,
        ))
        # Three broad, deeply embedded toe caps read as a feline paw without
        # turning into a necklace of disconnected beads.
        for toe, x_offset in enumerate((-0.045, 0.0, 0.045)):
            limb_parts.append(uv_sphere(
                f"{leg_name}Toe{toe + 1}",
                (
                    paw_center[0] + x_offset,
                    paw_center[1] - 0.028,
                    paw_center[2] + paw_radii[2] * 0.64,
                ),
                (0.029, 0.028, 0.035),
                mats["Fur"],
                leg,
                segments=24,
                rings=14,
            ))

    # The current experience animates expression, not gait. A single watertight
    # body mesh gives the hero a coherent studio-toy silhouette while the named
    # leg pivot empties remain available for a future skinned rig.
    fuse_meshes(
        "Body",
        [body_mesh, *limb_parts],
        root,
        voxel_size=0.011,
    )
    # Subtle dark grooves provide the final paw/toe read while the toe volumes
    # themselves remain planted and fused into the load-bearing silhouette.
    for leg_name, spec in leg_specs.items():
        leg = leg_groups[leg_name]
        paw_center, paw_radii = spec["paw"]
        for seam, x_offset in enumerate((-0.026, 0.026), start=1):
            tube_curve(
                f"{leg_name}ToeSeam{seam}",
                [
                    (
                        paw_center[0] + x_offset,
                        paw_center[1] + paw_radii[1] * 0.76,
                        paw_center[2] + paw_radii[2] * 0.8,
                    ),
                    (
                        paw_center[0] + x_offset,
                        paw_center[1] + paw_radii[1] * 0.88,
                        paw_center[2] + paw_radii[2] * 0.42,
                    ),
                ],
                [0.0022, 0.0011],
                mats["FurDark"],
                leg,
                bevel_resolution=2,
                resolution=6,
            )

    tail_pivot = (0.0, 0.64, -0.72)
    tail = empty("tail", parent=root, location=tail_pivot)
    tail_mesh = tube_curve(
        "TailMesh",
        [
            (0.0, 0.0, 0.0),
            (0.1, -0.07, -0.23),
            (0.28, -0.15, -0.46),
            (0.5, -0.18, -0.62),
            (0.69, -0.12, -0.69),
            (0.79, 0.0, -0.63),
            (0.79, 0.13, -0.51),
        ],
        [0.078, 0.073, 0.066, 0.059, 0.052, 0.045, 0.034],
        mats["Fur"],
        tail,
        bevel_resolution=5,
        resolution=18,
    )
    tail_tip = uv_sphere(
        "TailTip",
        (0.79, 0.135, -0.505),
        (0.034, 0.043, 0.031),
        mats["Fur"],
        tail,
        segments=32,
        rings=20,
    )
    fuse_meshes(
        "TailMesh",
        [tail_mesh, tail_tip],
        tail,
        voxel_size=0.009,
    )

    # One flat dark-violet cuff on the near hind ankle.
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.075, depth=0.035)
    cuff = bpy.context.active_object
    cuff.name = "Cuff"
    cuff.parent = leg_groups["legHR"]
    cuff.location = bvec((0.03, -0.485, 0.065))
    cuff.scale.y = 0.92
    cuff.data.materials.append(mats["Cuff"])
    smooth_mesh(cuff)
    empty(
        "cuffAnchor",
        parent=leg_groups["legHR"],
        location=(0.075, -0.49, 0.075),
    )

    return root, mats


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
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_materials="EXPORT",
    )


def look_at(camera: bpy.types.Object, target: Sequence[float]) -> None:
    direction = Vector(bvec(target)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_preview() -> None:
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.mesh.primitive_plane_add(size=18, location=(0.0, 0.0, 0.0))
    ground = bpy.context.active_object
    ground.name = "PreviewGround"
    ground_mat = material("PreviewGround", (0.22, 0.28, 0.22, 1.0), 0.95)
    ground.data.materials.append(ground_mat)

    camera_data = bpy.data.cameras.new("PreviewCamera")
    camera = bpy.data.objects.new("PreviewCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = bvec((2.7, 1.28, 3.65))
    camera_data.lens = 62
    look_at(camera, (0.0, 0.54, -0.24))
    bpy.context.scene.camera = camera

    key_data = bpy.data.lights.new("Key", type="AREA")
    key_data.energy = 460
    key_data.shape = "DISK"
    key_data.size = 4.0
    key = bpy.data.objects.new("Key", key_data)
    bpy.context.collection.objects.link(key)
    key.location = bvec((3.0, 4.2, 4.5))
    look_at(key, (0.0, 0.55, -0.1))

    fill_data = bpy.data.lights.new("Fill", type="AREA")
    fill_data.energy = 190
    fill_data.color = (0.58, 0.7, 1.0)
    fill_data.size = 3.0
    fill = bpy.data.objects.new("Fill", fill_data)
    bpy.context.collection.objects.link(fill)
    fill.location = bvec((-3.0, 2.4, 3.0))
    look_at(fill, (0.0, 0.55, -0.1))

    rim_data = bpy.data.lights.new("Rim", type="AREA")
    rim_data.energy = 340
    rim_data.color = (1.0, 0.48, 0.74)
    rim_data.size = 3.0
    rim = bpy.data.objects.new("Rim", rim_data)
    bpy.context.collection.objects.link(rim)
    rim.location = bvec((-2.2, 2.8, -3.5))
    look_at(rim, (0.0, 0.65, -0.3))

    scene = bpy.context.scene
    # Blender 5.2 exposes the Eevee engine under BLENDER_EEVEE again.
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(PREVIEW)
    scene.render.film_transparent = False
    scene.world.color = (0.018, 0.024, 0.032)
    # Standard mirrors Three.js NoToneMapping more closely than AgX and keeps
    # material contrast honest during asset review.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    bpy.ops.render.render(write_still=True)


def main() -> None:
    clear_scene()
    root, _ = make_character()
    export_glb(root)
    render_preview()
    print(f"Exported {OUTPUT}")
    print(f"Rendered {PREVIEW}")


if __name__ == "__main__":
    main()
