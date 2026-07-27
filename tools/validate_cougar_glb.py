"""Validate a Purple Cougar GLB in Blender without modifying the asset.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender \
    --background --factory-startup --python-exit-code 1 \
    --python tools/validate_cougar_glb.py -- path/to/cougar.glb

Require an actual glTF skin and its imported Blender armature:
  /Applications/Blender.app/Contents/MacOS/Blender \
    --background --factory-startup --python-exit-code 1 \
    --python tools/validate_cougar_glb.py -- \
    path/to/cougar.glb --require-skin

The validator reads the GLB metadata, clears Blender's in-memory scene, imports
the supplied file, and prints deterministic source/import statistics. It never
saves the Blender scene or rewrites the GLB. Exit status is zero only when all
contract and budget checks pass. Validation failures force status 1 even when
the Blender command omitted ``--python-exit-code``; CLI usage errors use 2.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import struct
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

import bpy


REQUIRED_NODES = (
    "cougar",
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
LIMB_NODES = ("legFL", "legFR", "legHL", "legHR")
MAX_TRIANGLES_V2 = 60_000
MAX_MATERIALS = 16
MAX_PRIMITIVES = 16
GLB_MAGIC = b"glTF"
GLB_VERSION = 2
JSON_CHUNK_TYPE = 0x4E4F534A
WEIGHT_EPSILON = 1.0e-8


class InputError(ValueError):
    """Raised when the supplied file is not a well-formed GLB input."""


class CliExit(Exception):
    """Carry an argparse exit status without relying on Blender's exception exit."""

    def __init__(self, status: int) -> None:
        super().__init__(status)
        self.status = status


class BlenderArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        self.print_usage(sys.stderr)
        print(f"{self.prog}: error: {message}", file=sys.stderr)
        raise CliExit(2)

    def exit(self, status: int = 0, message: str | None = None) -> None:
        if message:
            stream = sys.stderr if status else sys.stdout
            print(message, end="", file=stream)
        raise CliExit(status)


@dataclass(frozen=True)
class SourceMetrics:
    gltf_version: str
    node_names: tuple[str, ...]
    nodes: int
    meshes: int
    primitives: int
    vertices: int
    triangles: int
    materials: int
    skins: int
    animations: int


@dataclass(frozen=True)
class ImportedMetrics:
    objects: int
    mesh_objects: int
    meshes: int
    vertices: int
    triangles: int
    materials: int
    armatures: int
    bones: int
    actions: int
    weighted_meshes: int
    bounds_min: tuple[float, float, float] | None
    bounds_max: tuple[float, float, float] | None


@dataclass(frozen=True)
class LimbEvidence:
    limb: str
    mode: str
    mesh: str
    detail: str


def script_arguments(argv: Sequence[str]) -> list[str]:
    if "--" not in argv:
        raise InputError(
            "validator arguments must follow Blender's '--' separator; "
            "run with '-- path/to/cougar.glb'"
        )
    return list(argv[argv.index("--") + 1 :])


def parse_arguments(argv: Sequence[str]) -> argparse.Namespace:
    parser = BlenderArgumentParser(
        prog="validate_cougar_glb.py",
        description="Validate the Purple Cougar GLB runtime and v2 asset contract.",
    )
    parser.add_argument("glb", type=Path, help="GLB file to import and validate")
    parser.add_argument(
        "--require-skin",
        action="store_true",
        help="require at least one source glTF skin and imported armature",
    )
    return parser.parse_args(script_arguments(argv))


def reject_nonfinite_json(value: str) -> None:
    raise InputError(f"GLB JSON contains invalid numeric constant {value!r}")


def load_glb_json(path: Path) -> tuple[dict[str, Any], int]:
    if path.suffix.lower() != ".glb":
        raise InputError(f"expected a .glb file, received {path.name!r}")
    if not path.exists():
        raise InputError(f"file does not exist: {path}")
    if not path.is_file():
        raise InputError(f"path is not a regular file: {path}")

    file_size = path.stat().st_size
    if file_size < 20:
        raise InputError(f"file is too small to be a GLB: {file_size} bytes")

    with path.open("rb") as stream:
        header = stream.read(12)
        magic, version, declared_size = struct.unpack("<4sII", header)
        if magic != GLB_MAGIC:
            raise InputError("invalid GLB magic; expected b'glTF'")
        if version != GLB_VERSION:
            raise InputError(
                f"unsupported GLB container version {version}; expected 2"
            )
        if declared_size != file_size:
            raise InputError(
                "GLB header length mismatch: "
                f"declared {declared_size} bytes, actual {file_size} bytes"
            )

        chunk_header = stream.read(8)
        if len(chunk_header) != 8:
            raise InputError("GLB is missing its JSON chunk header")
        chunk_length, chunk_type = struct.unpack("<II", chunk_header)
        if chunk_type != JSON_CHUNK_TYPE:
            raise InputError("the first GLB chunk is not JSON")
        if chunk_length > file_size - 20:
            raise InputError(
                f"GLB JSON chunk length {chunk_length} exceeds the file boundary"
            )

        raw_json = stream.read(chunk_length)
        if len(raw_json) != chunk_length:
            raise InputError("GLB JSON chunk is truncated")

    try:
        decoded = raw_json.rstrip(b" \t\r\n\x00").decode("utf-8")
        data = json.loads(decoded, parse_constant=reject_nonfinite_json)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise InputError(f"invalid GLB JSON: {error}") from error

    if not isinstance(data, dict):
        raise InputError("GLB JSON root must be an object")
    return data, file_size


def list_field(
    data: dict[str, Any],
    key: str,
    errors: list[str],
) -> list[Any]:
    value = data.get(key, [])
    if not isinstance(value, list):
        errors.append(f"GLB field {key!r} must be an array")
        return []
    return value


def valid_index(value: Any, upper_bound: int) -> bool:
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and 0 <= value < upper_bound
    )


def accessor_count(
    accessors: Sequence[Any],
    index: Any,
    context: str,
    errors: list[str],
) -> int:
    if not valid_index(index, len(accessors)):
        errors.append(f"{context} references invalid accessor {index!r}")
        return 0
    accessor = accessors[index]
    if not isinstance(accessor, dict):
        errors.append(f"{context} accessor {index} must be an object")
        return 0
    count = accessor.get("count")
    if (
        not isinstance(count, int)
        or isinstance(count, bool)
        or count < 0
    ):
        errors.append(f"{context} accessor {index} has invalid count {count!r}")
        return 0
    return count


def validate_source_transforms(
    nodes: Sequence[Any],
    errors: list[str],
) -> tuple[str, ...]:
    names: list[str] = []
    transform_sizes = {
        "translation": 3,
        "rotation": 4,
        "scale": 3,
        "matrix": 16,
    }

    for index, node in enumerate(nodes):
        if not isinstance(node, dict):
            errors.append(f"GLB node {index} must be an object")
            continue
        name = node.get("name")
        if name is not None and not isinstance(name, str):
            errors.append(f"GLB node {index} has a non-string name")
        elif isinstance(name, str):
            names.append(name)

        for field, expected_size in transform_sizes.items():
            if field not in node:
                continue
            values = node[field]
            if not isinstance(values, list) or len(values) != expected_size:
                errors.append(
                    f"GLB node {index} {field} must contain "
                    f"{expected_size} numbers"
                )
                continue
            for component, value in enumerate(values):
                if (
                    not isinstance(value, (int, float))
                    or isinstance(value, bool)
                    or not math.isfinite(float(value))
                ):
                    errors.append(
                        f"GLB node {index} {field}[{component}] is not finite"
                    )
                    break
    return tuple(names)


def collect_source_metrics(
    data: dict[str, Any],
    errors: list[str],
) -> SourceMetrics:
    asset = data.get("asset")
    gltf_version = ""
    if not isinstance(asset, dict):
        errors.append("GLB is missing its required asset object")
    else:
        version = asset.get("version")
        if not isinstance(version, str):
            errors.append("GLB asset.version must be a string")
        else:
            gltf_version = version
            if version != "2.0":
                errors.append(
                    f"GLB asset.version is {version!r}; expected '2.0'"
                )

    nodes = list_field(data, "nodes", errors)
    meshes = list_field(data, "meshes", errors)
    accessors = list_field(data, "accessors", errors)
    materials = list_field(data, "materials", errors)
    skins = list_field(data, "skins", errors)
    animations = list_field(data, "animations", errors)
    node_names = validate_source_transforms(nodes, errors)

    primitive_count = 0
    vertex_count = 0
    triangle_count = 0
    for mesh_index, mesh in enumerate(meshes):
        if not isinstance(mesh, dict):
            errors.append(f"GLB mesh {mesh_index} must be an object")
            continue
        primitives = mesh.get("primitives")
        if not isinstance(primitives, list) or not primitives:
            errors.append(
                f"GLB mesh {mesh_index} must contain at least one primitive"
            )
            continue

        primitive_count += len(primitives)
        for primitive_index, primitive in enumerate(primitives):
            context = f"mesh {mesh_index} primitive {primitive_index}"
            if not isinstance(primitive, dict):
                errors.append(f"GLB {context} must be an object")
                continue

            attributes = primitive.get("attributes")
            if not isinstance(attributes, dict) or "POSITION" not in attributes:
                errors.append(f"GLB {context} is missing POSITION data")
                position_count = 0
            else:
                position_count = accessor_count(
                    accessors,
                    attributes["POSITION"],
                    f"{context} POSITION",
                    errors,
                )
            vertex_count += position_count

            element_count = position_count
            if "indices" in primitive:
                element_count = accessor_count(
                    accessors,
                    primitive["indices"],
                    f"{context} indices",
                    errors,
                )

            mode = primitive.get("mode", 4)
            if (
                not isinstance(mode, int)
                or isinstance(mode, bool)
                or mode not in range(7)
            ):
                errors.append(f"GLB {context} has invalid mode {mode!r}")
                continue
            if mode == 4:
                if element_count % 3:
                    errors.append(
                        f"GLB {context} TRIANGLES element count "
                        f"{element_count} is not divisible by 3"
                    )
                triangle_count += element_count // 3
            elif mode in (5, 6):
                triangle_count += max(0, element_count - 2)

            if "material" in primitive and not valid_index(
                primitive["material"], len(materials)
            ):
                errors.append(
                    f"GLB {context} references invalid material "
                    f"{primitive['material']!r}"
                )

    return SourceMetrics(
        gltf_version=gltf_version,
        node_names=node_names,
        nodes=len(nodes),
        meshes=len(meshes),
        primitives=primitive_count,
        vertices=vertex_count,
        triangles=triangle_count,
        materials=len(materials),
        skins=len(skins),
        animations=len(animations),
    )


def clear_scene() -> None:
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.armatures,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.actions,
    ):
        for block in list(datablocks):
            datablocks.remove(block, do_unlink=True)
    bpy.context.scene.frame_set(0)


def import_glb(path: Path) -> None:
    try:
        result = bpy.ops.import_scene.gltf(filepath=str(path))
    except Exception as error:
        raise InputError(f"Blender could not import the GLB: {error}") from error
    if "FINISHED" not in result:
        raise InputError(f"Blender GLB import did not finish: {sorted(result)}")
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()


def finite_values(values: Iterable[Any]) -> bool:
    return all(math.isfinite(float(value)) for value in values)


def matrix_values(matrix: Any) -> Iterable[float]:
    for row in matrix:
        yield from row


def unique_mesh_data(mesh_objects: Sequence[bpy.types.Object]) -> list[Any]:
    meshes: dict[int, Any] = {}
    for obj in mesh_objects:
        meshes.setdefault(obj.data.as_pointer(), obj.data)
    return list(meshes.values())


def pose_bone_display_helpers(
    armatures: Sequence[bpy.types.Object],
) -> set[int]:
    """Return Blender-only custom-shape objects created by the glTF importer."""

    return {
        pose_bone.custom_shape.as_pointer()
        for armature in armatures
        for pose_bone in armature.pose.bones
        if pose_bone.custom_shape is not None
    }


def object_is_visible(obj: bpy.types.Object) -> bool:
    current: bpy.types.Object | None = obj
    while current is not None:
        if current.hide_viewport or current.hide_render or current.hide_get():
            return False
        current = current.parent
    return True


def mesh_has_visible_surface(obj: bpy.types.Object) -> bool:
    return (
        obj.type == "MESH"
        and object_is_visible(obj)
        and len(obj.data.vertices) > 0
        and len(obj.data.polygons) > 0
    )


def is_object_descendant(
    candidate: bpy.types.Object,
    ancestor: bpy.types.Object,
) -> bool:
    current: bpy.types.Object | None = candidate
    while current is not None:
        if current is ancestor:
            return True
        current = current.parent
    return False


def bone_subtree_names(bone: Any) -> set[str]:
    result: set[str] = set()
    pending = [bone]
    while pending:
        current = pending.pop()
        result.add(current.name)
        pending.extend(current.children)
    return result


def used_vertex_indices(mesh: Any) -> set[int]:
    return {
        vertex_index
        for polygon in mesh.polygons
        for vertex_index in polygon.vertices
    }


def weighted_surface_vertices(
    mesh_obj: bpy.types.Object,
    group_names: set[str],
) -> int:
    group_indices = {
        group.index
        for group in mesh_obj.vertex_groups
        if group.name in group_names
    }
    if not group_indices:
        return 0
    used = used_vertex_indices(mesh_obj.data)
    count = 0
    for vertex in mesh_obj.data.vertices:
        if vertex.index not in used:
            continue
        if any(
            assignment.group in group_indices
            and math.isfinite(float(assignment.weight))
            and assignment.weight > WEIGHT_EPSILON
            for assignment in vertex.groups
        ):
            count += 1
    return count


def mesh_owned_by_bone(
    mesh_obj: bpy.types.Object,
    armature: bpy.types.Object,
    subtree_names: set[str],
) -> bool:
    current: bpy.types.Object | None = mesh_obj
    while current is not None:
        if current.parent is armature and current.parent_type == "BONE":
            parent_bone = armature.data.bones.get(current.parent_bone)
            while parent_bone is not None:
                if parent_bone.name in subtree_names:
                    return True
                parent_bone = parent_bone.parent
        current = current.parent
    return False


def limb_evidence(
    limb: str,
    mesh_objects: Sequence[bpy.types.Object],
    armatures: Sequence[bpy.types.Object],
) -> LimbEvidence | None:
    object_matches = [obj for obj in bpy.data.objects if obj.name == limb]
    for node_obj in object_matches:
        for mesh_obj in mesh_objects:
            if mesh_has_visible_surface(mesh_obj) and is_object_descendant(
                mesh_obj, node_obj
            ):
                return LimbEvidence(
                    limb=limb,
                    mode="owned-object",
                    mesh=mesh_obj.name,
                    detail=f"polygons={len(mesh_obj.data.polygons)}",
                )

    for armature in armatures:
        bone = armature.data.bones.get(limb)
        if bone is None:
            continue
        subtree_names = bone_subtree_names(bone)
        deform_names = {
            name
            for name in subtree_names
            if armature.data.bones[name].use_deform
        }
        for mesh_obj in mesh_objects:
            if not mesh_has_visible_surface(mesh_obj):
                continue
            if mesh_owned_by_bone(mesh_obj, armature, subtree_names):
                return LimbEvidence(
                    limb=limb,
                    mode="owned-bone",
                    mesh=mesh_obj.name,
                    detail=f"bone_subtree={len(subtree_names)}",
                )
            has_armature_modifier = any(
                modifier.type == "ARMATURE"
                and modifier.object is armature
                for modifier in mesh_obj.modifiers
            )
            if not has_armature_modifier:
                continue
            weighted = weighted_surface_vertices(mesh_obj, deform_names)
            if weighted:
                return LimbEvidence(
                    limb=limb,
                    mode="deformed",
                    mesh=mesh_obj.name,
                    detail=f"weighted_vertices={weighted}",
                )
    return None


def validate_finite_import(
    objects: Sequence[bpy.types.Object],
    armatures: Sequence[bpy.types.Object],
    mesh_objects: Sequence[bpy.types.Object],
    errors: list[str],
) -> None:
    for obj in objects:
        transforms = (
            ("location", obj.location),
            ("scale", obj.scale),
            ("rotation_euler", obj.rotation_euler),
            ("rotation_quaternion", obj.rotation_quaternion),
            ("rotation_axis_angle", obj.rotation_axis_angle),
            ("matrix_local", matrix_values(obj.matrix_local)),
            ("matrix_world", matrix_values(obj.matrix_world)),
        )
        for label, values in transforms:
            if not finite_values(values):
                errors.append(
                    f"imported object {obj.name!r} has non-finite {label}"
                )

    checked_meshes: set[int] = set()
    for obj in mesh_objects:
        mesh = obj.data
        pointer = mesh.as_pointer()
        if pointer in checked_meshes:
            continue
        checked_meshes.add(pointer)

        for vertex in mesh.vertices:
            if not finite_values(vertex.co):
                errors.append(
                    f"mesh {mesh.name!r} vertex {vertex.index} "
                    "has non-finite coordinates"
                )
                break
            if not finite_values(vertex.normal):
                errors.append(
                    f"mesh {mesh.name!r} vertex {vertex.index} "
                    "has a non-finite normal"
                )
                break

        if mesh.shape_keys is not None:
            for shape in mesh.shape_keys.key_blocks:
                for index, point in enumerate(shape.data):
                    if not finite_values(point.co):
                        errors.append(
                            f"mesh {mesh.name!r} shape key {shape.name!r} "
                            f"point {index} has non-finite coordinates"
                        )
                        break

        for uv_layer in mesh.uv_layers:
            for index, loop in enumerate(uv_layer.data):
                if not finite_values(loop.uv):
                    errors.append(
                        f"mesh {mesh.name!r} UV layer {uv_layer.name!r} "
                        f"loop {index} has non-finite coordinates"
                    )
                    break

    for armature in armatures:
        for bone in armature.data.bones:
            if (
                not finite_values(bone.head_local)
                or not finite_values(bone.tail_local)
                or not finite_values(matrix_values(bone.matrix_local))
            ):
                errors.append(
                    f"armature {armature.name!r} bone {bone.name!r} "
                    "has a non-finite transform"
                )


def collect_imported_metrics(
    objects: Sequence[bpy.types.Object],
    mesh_objects: Sequence[bpy.types.Object],
    armatures: Sequence[bpy.types.Object],
    errors: list[str],
) -> ImportedMetrics:
    mesh_data = unique_mesh_data(mesh_objects)
    vertices = sum(len(mesh.vertices) for mesh in mesh_data)
    triangles = 0
    for mesh in mesh_data:
        try:
            mesh.calc_loop_triangles()
        except Exception as error:
            errors.append(
                f"mesh {mesh.name!r} could not be triangulated: {error}"
            )
            continue
        triangles += len(mesh.loop_triangles)

    bounds_min = [math.inf, math.inf, math.inf]
    bounds_max = [-math.inf, -math.inf, -math.inf]
    has_bounds = False
    for obj in mesh_objects:
        for vertex in obj.data.vertices:
            point = obj.matrix_world @ vertex.co
            if not finite_values(point):
                continue
            has_bounds = True
            for axis in range(3):
                bounds_min[axis] = min(bounds_min[axis], point[axis])
                bounds_max[axis] = max(bounds_max[axis], point[axis])

    weighted_meshes = sum(
        any(
            modifier.type == "ARMATURE" and modifier.object is not None
            for modifier in obj.modifiers
        )
        for obj in mesh_objects
    )
    return ImportedMetrics(
        objects=len(objects),
        mesh_objects=len(mesh_objects),
        meshes=len(mesh_data),
        vertices=vertices,
        triangles=triangles,
        materials=len(bpy.data.materials),
        armatures=len(armatures),
        bones=sum(len(obj.data.bones) for obj in armatures),
        actions=len(bpy.data.actions),
        weighted_meshes=weighted_meshes,
        bounds_min=tuple(bounds_min) if has_bounds else None,
        bounds_max=tuple(bounds_max) if has_bounds else None,
    )


def format_vector(vector: tuple[float, float, float]) -> str:
    return "(" + ",".join(f"{value:.6f}" for value in vector) + ")"


def run_validation(path: Path, require_skin: bool) -> int:
    errors: list[str] = []
    try:
        source_json, file_size = load_glb_json(path)
    except (OSError, InputError, struct.error) as error:
        print(f"ERROR input: {error}")
        print("RESULT FAIL errors=1")
        return 1

    source = collect_source_metrics(source_json, errors)
    resolved_path = path.resolve()

    try:
        clear_scene()
        import_glb(resolved_path)
    except (InputError, RuntimeError) as error:
        print(
            f"FILE path={resolved_path} bytes={file_size} "
            f"mib={file_size / (1024 * 1024):.3f}"
        )
        print(f"ERROR import: {error}")
        print("RESULT FAIL errors=1")
        return 1

    scene_objects = list(bpy.context.scene.objects)
    armatures = [obj for obj in scene_objects if obj.type == "ARMATURE"]
    display_helpers = pose_bone_display_helpers(armatures)
    objects = [
        obj
        for obj in scene_objects
        if obj.as_pointer() not in display_helpers
    ]
    mesh_objects = [obj for obj in objects if obj.type == "MESH"]
    validate_finite_import(objects, armatures, mesh_objects, errors)
    imported = collect_imported_metrics(
        objects, mesh_objects, armatures, errors
    )

    source_names = set(source.node_names)
    imported_object_names = {obj.name for obj in objects}
    imported_bone_names = {
        bone.name
        for armature in armatures
        for bone in armature.data.bones
    }
    imported_names = imported_object_names | imported_bone_names

    for required in REQUIRED_NODES:
        if required not in source_names:
            errors.append(f"required source node {required!r} is missing")
        if required not in imported_names:
            errors.append(
                f"required node {required!r} did not survive Blender import"
            )
    if "cougar" in imported_bone_names and "cougar" not in imported_object_names:
        errors.append("required root 'cougar' must import as an object, not a bone")

    limb_results: list[LimbEvidence] = []
    for limb in LIMB_NODES:
        evidence = limb_evidence(limb, mesh_objects, armatures)
        if evidence is None:
            errors.append(
                f"limb node {limb!r} neither owns nor deforms "
                "a visible mesh surface"
            )
        else:
            limb_results.append(evidence)

    budget_triangles = max(source.triangles, imported.triangles)
    if budget_triangles > MAX_TRIANGLES_V2:
        errors.append(
            f"v2 triangle budget exceeded: {budget_triangles} > "
            f"{MAX_TRIANGLES_V2}"
        )
    if source.materials > MAX_MATERIALS:
        errors.append(
            f"material budget exceeded: {source.materials} > {MAX_MATERIALS}"
        )
    if source.primitives > MAX_PRIMITIVES:
        errors.append(
            f"primitive budget exceeded: {source.primitives} > {MAX_PRIMITIVES}"
        )
    if not mesh_objects:
        errors.append("asset imported with no mesh objects")
    if imported.bounds_min is None or imported.bounds_max is None:
        errors.append("asset has no finite mesh bounds")
    if require_skin:
        if source.skins < 1:
            errors.append("--require-skin: GLB contains no glTF skin")
        if imported.armatures < 1:
            errors.append(
                "--require-skin: Blender imported no armature"
            )

    print(
        f"FILE path={resolved_path} bytes={file_size} "
        f"mib={file_size / (1024 * 1024):.3f}"
    )
    print(
        "SOURCE "
        f"gltf={source.gltf_version or 'unknown'} "
        f"nodes={source.nodes} meshes={source.meshes} "
        f"primitives={source.primitives} vertices={source.vertices} "
        f"triangles={source.triangles} materials={source.materials} "
        f"skins={source.skins} animations={source.animations}"
    )
    print(
        "IMPORT "
        f"objects={imported.objects} mesh_objects={imported.mesh_objects} "
        f"meshes={imported.meshes} vertices={imported.vertices} "
        f"triangles={imported.triangles} materials={imported.materials}"
    )
    print(
        "RIG "
        f"skin_present={'yes' if source.skins else 'no'} "
        f"armature_present={'yes' if imported.armatures else 'no'} "
        f"armatures={imported.armatures} bones={imported.bones} "
        f"weighted_meshes={imported.weighted_meshes} "
        f"animations={source.animations} imported_actions={imported.actions}"
    )
    print(
        "NODES "
        f"required={len(REQUIRED_NODES)} "
        f"source_present={sum(name in source_names for name in REQUIRED_NODES)} "
        f"imported_present={sum(name in imported_names for name in REQUIRED_NODES)}"
    )
    print(
        "BUDGET "
        f"triangles={budget_triangles}/{MAX_TRIANGLES_V2} "
        f"materials={source.materials}/{MAX_MATERIALS} "
        f"primitives={source.primitives}/{MAX_PRIMITIVES}"
    )
    if imported.bounds_min is not None and imported.bounds_max is not None:
        bounds_size = tuple(
            imported.bounds_max[index] - imported.bounds_min[index]
            for index in range(3)
        )
        print(
            f"BOUNDS min={format_vector(imported.bounds_min)} "
            f"max={format_vector(imported.bounds_max)} "
            f"size={format_vector(bounds_size)}"
        )
    else:
        print("BOUNDS unavailable")

    for limb in LIMB_NODES:
        evidence = next(
            (result for result in limb_results if result.limb == limb),
            None,
        )
        if evidence is None:
            print(f"LIMB name={limb} status=fail mode=none")
        else:
            print(
                f"LIMB name={limb} status=pass mode={evidence.mode} "
                f"mesh={evidence.mesh!r} {evidence.detail}"
            )

    if errors:
        for error in errors:
            print(f"ERROR {error}")
        print(f"RESULT FAIL errors={len(errors)}")
        return 1

    print("RESULT PASS errors=0")
    return 0


def main() -> int:
    try:
        arguments = parse_arguments(sys.argv)
    except CliExit as exit_request:
        return exit_request.status
    except InputError as error:
        print(f"ERROR usage: {error}", file=sys.stderr)
        return 2
    return run_validation(arguments.glb, arguments.require_skin)


if __name__ == "__main__":
    try:
        EXIT_CODE = main()
    except Exception as unexpected:
        print(
            f"ERROR internal validator failure: "
            f"{type(unexpected).__name__}: {unexpected}",
            file=sys.stderr,
        )
        EXIT_CODE = 1
    if EXIT_CODE:
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(EXIT_CODE)
