"""Render the static Purple Cougar v4 OBJ with Pillow only.

The renderer is intentionally simple and deterministic: orthographic
projection, global painter sorting, flat Lambert lighting, and 2x
supersampling. It creates separate hero/front/profile/rear images plus clay and
color contact sheets without Blender, WebGL, a browser, or NumPy.

Run:
  python3 tools/render_cougar_head_v4_cpu.py
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import math
from pathlib import Path
from typing import Iterable, Sequence

from PIL import Image, ImageDraw, ImageFilter, ImageFont


PROJECT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT / "artifacts" / "v4" / "head" / "static"
OBJ_PATH = OUTPUT_DIR / "purple-cougar-head-v4.obj"
MTL_PATH = OUTPUT_DIR / "purple-cougar-head-v4.mtl"
METRICS_PATH = OUTPUT_DIR / "purple-cougar-head-v4-metrics.json"
COLOR_SHEET = OUTPUT_DIR / "purple-cougar-head-v4-color-contact-sheet.png"
CLAY_SHEET = OUTPUT_DIR / "purple-cougar-head-v4-clay-contact-sheet.png"

CELL_SIZE = 640
SUPERSAMPLE = 2
CONTACT_GAP = 8
ORTHO_SPAN = 3.18
TARGET = (0.0, 0.17, 0.0)

VIEWS = {
    "hero": (3.8, 2.15, 5.7),
    "front": (0.0, 0.17, 7.0),
    "profile": (7.0, 0.16, 0.0),
    "rear": (0.0, 0.17, -7.0),
}

CLAY_COLOR = (141, 132, 151)
CLAY_DARK = (91, 82, 102)
BACKGROUND = (14, 12, 18)
LIGHT_DIRECTION = (-0.38, 0.72, 0.58)
FILL_DIRECTION = (0.64, 0.30, 0.70)


@dataclass(frozen=True)
class Face:
    indices: tuple[int, int, int]
    normal_indices: tuple[int, int, int] | None
    material: str
    object_name: str


def subtract(
    left: Sequence[float],
    right: Sequence[float],
) -> tuple[float, float, float]:
    return (
        left[0] - right[0],
        left[1] - right[1],
        left[2] - right[2],
    )


def dot(left: Sequence[float], right: Sequence[float]) -> float:
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2]


def cross(
    left: Sequence[float],
    right: Sequence[float],
) -> tuple[float, float, float]:
    return (
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    )


def normalize(vector: Sequence[float]) -> tuple[float, float, float]:
    length = math.sqrt(max(1.0e-18, dot(vector, vector)))
    return (
        vector[0] / length,
        vector[1] / length,
        vector[2] / length,
    )


def average(
    values: Iterable[Sequence[float]],
) -> tuple[float, float, float]:
    collected = list(values)
    count = len(collected)
    return (
        sum(value[0] for value in collected) / count,
        sum(value[1] for value in collected) / count,
        sum(value[2] for value in collected) / count,
    )


def parse_obj(
    path: Path,
) -> tuple[
    list[tuple[float, float, float]],
    list[tuple[float, float, float]],
    list[Face],
]:
    vertices: list[tuple[float, float, float]] = []
    normals: list[tuple[float, float, float]] = []
    faces: list[Face] = []
    material_name = "Fur"
    object_name = "Head"

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if parts[0] == "v" and len(parts) >= 4:
            vertices.append((float(parts[1]), float(parts[2]), float(parts[3])))
        elif parts[0] == "vn" and len(parts) >= 4:
            normals.append(
                normalize(
                    (float(parts[1]), float(parts[2]), float(parts[3]))
                )
            )
        elif parts[0] in {"o", "g"} and len(parts) >= 2:
            object_name = parts[1]
        elif parts[0] == "usemtl" and len(parts) >= 2:
            material_name = parts[1]
        elif parts[0] == "f" and len(parts) >= 4:
            polygon: list[int] = []
            polygon_normals: list[int | None] = []
            for token in parts[1:]:
                fields = token.split("/")
                value = int(fields[0])
                polygon.append(value - 1 if value > 0 else len(vertices) + value)
                normal_value = (
                    int(fields[2])
                    if len(fields) >= 3 and fields[2]
                    else None
                )
                polygon_normals.append(
                    (
                        normal_value - 1
                        if normal_value is not None and normal_value > 0
                        else (
                            len(normals) + normal_value
                            if normal_value is not None
                            else None
                        )
                    )
                )
            for index in range(1, len(polygon) - 1):
                triangle_normals = (
                    polygon_normals[0],
                    polygon_normals[index],
                    polygon_normals[index + 1],
                )
                faces.append(
                    Face(
                        (polygon[0], polygon[index], polygon[index + 1]),
                        (
                            (
                                triangle_normals[0],
                                triangle_normals[1],
                                triangle_normals[2],
                            )
                            if all(
                                value is not None for value in triangle_normals
                            )
                            else None
                        ),
                        material_name,
                        object_name,
                    )
                )
    if not vertices or not faces:
        raise RuntimeError(f"No renderable geometry found in {path}")
    return vertices, normals, faces


def parse_mtl(path: Path) -> dict[str, tuple[int, int, int]]:
    materials: dict[str, tuple[int, int, int]] = {}
    current: str | None = None
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        parts = raw_line.strip().split()
        if not parts:
            continue
        if parts[0] == "newmtl" and len(parts) >= 2:
            current = parts[1]
        elif parts[0] == "Kd" and len(parts) >= 4 and current:
            materials[current] = tuple(
                max(0, min(255, round(float(channel) * 255)))
                for channel in parts[1:4]
            )
    return materials


def camera_basis(
    camera: Sequence[float],
) -> tuple[
    tuple[float, float, float],
    tuple[float, float, float],
    tuple[float, float, float],
]:
    forward = normalize(subtract(TARGET, camera))
    right = normalize(cross(forward, (0.0, 1.0, 0.0)))
    up = normalize(cross(right, forward))
    return right, up, forward


def shade_color(
    base: Sequence[int],
    normal: Sequence[float],
    view_to_camera: Sequence[float],
    *,
    clay: bool,
    material_name: str,
) -> tuple[int, int, int]:
    oriented = normal
    if dot(oriented, view_to_camera) < 0.0:
        oriented = (-normal[0], -normal[1], -normal[2])

    key = max(0.0, dot(oriented, LIGHT_DIRECTION))
    fill = max(0.0, dot(oriented, FILL_DIRECTION))
    rim = (1.0 - max(0.0, dot(oriented, view_to_camera))) ** 2
    intensity = 0.39 + 0.56 * key + 0.16 * fill + 0.10 * rim
    if material_name in {"Sclera", "Highlight"} and not clay:
        intensity = min(1.08, intensity + 0.10)

    return tuple(
        max(0, min(255, round(channel * intensity)))
        for channel in base
    )


def make_background(size: int) -> Image.Image:
    image = Image.new("RGB", (size, size), BACKGROUND)
    glow_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow = ImageDraw.Draw(glow_layer)
    glow.ellipse(
        (
            int(size * 0.10),
            int(-size * 0.30),
            int(size * 0.90),
            int(size * 0.68),
        ),
        fill=(70, 49, 91, 86),
    )
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(size * 0.13))
    image = Image.alpha_composite(image.convert("RGBA"), glow_layer)

    shadow_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow = ImageDraw.Draw(shadow_layer)
    shadow.ellipse(
        (
            int(size * 0.22),
            int(size * 0.79),
            int(size * 0.78),
            int(size * 0.91),
        ),
        fill=(0, 0, 0, 115),
    )
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(size * 0.035))
    return Image.alpha_composite(image, shadow_layer).convert("RGB")


def label_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = (
        "/System/Library/Fonts/SFNSRounded.ttf",
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    )
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def render_view(
    vertices: Sequence[Sequence[float]],
    normals: Sequence[Sequence[float]],
    faces: Sequence[Face],
    materials: dict[str, tuple[int, int, int]],
    view_name: str,
    camera: Sequence[float],
    *,
    clay: bool,
) -> Image.Image:
    size = CELL_SIZE * SUPERSAMPLE
    scale = size / ORTHO_SPAN
    right, up, forward = camera_basis(camera)
    projected: list[tuple[float, float, float]] = []
    for vertex in vertices:
        relative_target = subtract(vertex, TARGET)
        relative_camera = subtract(vertex, camera)
        projected.append(
            (
                size * 0.5 + dot(relative_target, right) * scale,
                size * 0.5 - dot(relative_target, up) * scale,
                dot(relative_camera, forward),
            )
        )

    draw_faces: list[
        tuple[
            float,
            tuple[tuple[float, float], tuple[float, float], tuple[float, float]],
            tuple[int, int, int],
        ]
    ] = []
    for face in faces:
        first = vertices[face.indices[0]]
        second = vertices[face.indices[1]]
        third = vertices[face.indices[2]]
        first_edge = subtract(second, first)
        second_edge = subtract(third, first)
        raw_normal = cross(first_edge, second_edge)
        normal_length = math.sqrt(dot(raw_normal, raw_normal))
        if normal_length <= 1.0e-10:
            continue
        normal = (
            normalize(
                average(normals[index] for index in face.normal_indices)
            )
            if face.normal_indices is not None
            else normalize(raw_normal)
        )
        centroid = average((first, second, third))
        view_to_camera = normalize(subtract(camera, centroid))
        if dot(normal, view_to_camera) <= 0.0:
            continue

        projected_points = (
            projected[face.indices[0]],
            projected[face.indices[1]],
            projected[face.indices[2]],
        )
        area = abs(
            (projected_points[1][0] - projected_points[0][0])
            * (projected_points[2][1] - projected_points[0][1])
            - (projected_points[2][0] - projected_points[0][0])
            * (projected_points[1][1] - projected_points[0][1])
        )
        if area < 0.10:
            continue

        if clay:
            base = (
                CLAY_DARK
                if face.material in {"Socket", "Pupil", "FurDark"}
                else CLAY_COLOR
            )
        else:
            base = materials.get(face.material, (170, 150, 185))
        color = shade_color(
            base,
            normal,
            view_to_camera,
            clay=clay,
            material_name=face.material,
        )
        depth = sum(point[2] for point in projected_points) / 3.0
        points_2d = tuple((point[0], point[1]) for point in projected_points)
        draw_faces.append((depth, points_2d, color))

    draw_faces.sort(key=lambda item: item[0], reverse=True)
    image = make_background(size)
    draw = ImageDraw.Draw(image)
    for _, points, color in draw_faces:
        draw.polygon(points, fill=color)

    label = view_name.upper()
    font = label_font(18 * SUPERSAMPLE)
    draw.rounded_rectangle(
        (
            20 * SUPERSAMPLE,
            20 * SUPERSAMPLE,
            (20 + 92) * SUPERSAMPLE,
            (20 + 34) * SUPERSAMPLE,
        ),
        radius=17 * SUPERSAMPLE,
        fill=(13, 10, 18),
        outline=(74, 63, 84),
        width=1 * SUPERSAMPLE,
    )
    draw.text(
        (36 * SUPERSAMPLE, 27 * SUPERSAMPLE),
        label,
        font=font,
        fill=(230, 221, 239),
    )
    return image.resize((CELL_SIZE, CELL_SIZE), Image.Resampling.LANCZOS)


def compose_contact_sheet(
    paths: Sequence[Path],
    output: Path,
) -> None:
    if len(paths) != 4:
        raise ValueError("Exactly four view images are required")
    width = CELL_SIZE * 2 + CONTACT_GAP
    height = CELL_SIZE * 2 + CONTACT_GAP
    sheet = Image.new("RGB", (width, height), BACKGROUND)
    for index, path in enumerate(paths):
        image = Image.open(path).convert("RGB")
        column = index % 2
        row = index // 2
        sheet.paste(
            image,
            (
                column * (CELL_SIZE + CONTACT_GAP),
                row * (CELL_SIZE + CONTACT_GAP),
            ),
        )
    sheet.save(output, optimize=True)


def main() -> None:
    if not OBJ_PATH.exists() or not MTL_PATH.exists():
        raise FileNotFoundError(
            "Run node tools/build_cougar_head_v4_static.mjs first"
        )
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    vertices, normals, faces = parse_obj(OBJ_PATH)
    materials = parse_mtl(MTL_PATH)

    mode_paths: dict[str, list[Path]] = {"color": [], "clay": []}
    for mode in ("color", "clay"):
        for view_name, camera in VIEWS.items():
            image = render_view(
                vertices,
                normals,
                faces,
                materials,
                view_name,
                camera,
                clay=mode == "clay",
            )
            output = (
                OUTPUT_DIR
                / f"purple-cougar-head-v4-{mode}-{view_name}.png"
            )
            image.save(output, optimize=True)
            mode_paths[mode].append(output)
            print(f"RENDERED {output}")

    compose_contact_sheet(mode_paths["color"], COLOR_SHEET)
    compose_contact_sheet(mode_paths["clay"], CLAY_SHEET)

    metrics = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    metrics["softwareRender"] = {
        "renderer": "Pillow painter-sort CPU rasterizer",
        "cellSize": [CELL_SIZE, CELL_SIZE],
        "supersample": SUPERSAMPLE,
        "orthographicSpan": ORTHO_SPAN,
        "background": list(BACKGROUND),
        "views": list(VIEWS),
        "separateColorViews": [str(path) for path in mode_paths["color"]],
        "separateClayViews": [str(path) for path in mode_paths["clay"]],
        "colorContactSheet": str(COLOR_SHEET),
        "clayContactSheet": str(CLAY_SHEET),
    }
    METRICS_PATH.write_text(
        json.dumps(metrics, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"CONTACT_SHEET {COLOR_SHEET}")
    print(f"CONTACT_SHEET {CLAY_SHEET}")
    print(f"METRICS {METRICS_PATH}")


if __name__ == "__main__":
    main()
