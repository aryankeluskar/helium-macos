#!/usr/bin/env python3
"""Generates Hydrogen's app icon set from icon_svg.py: the full-colour masters,
the Icon Composer bundle macOS 26 compiles into Assets.car, the asset catalog
and app.icns older macOS reads, and the product logos WebUI pages show.

Usage: make_icons.py <output dir>   (needs node with playwright, and Pillow)
"""

import io
import json
import struct
import subprocess
import sys
from pathlib import Path

from PIL import Image

import icon_svg
import small_icons

HERE = Path(__file__).resolve().parent
LINE_NAMES = ["delta", "gamma", "beta", "alpha"]
TINT_LEVELS = {"delta": 0.55, "gamma": 0.7, "beta": 0.95, "alpha": 0.82}
LAYOUT = dict(width=26.0, top=292.0, bottom=712.0, margin=150.0)


def render(jobs):
    subprocess.run(["node", str(HERE / "render_svg.cjs"), *[f"{src}:{dst}:{size}" for src, dst, size in jobs]], check=True)


def p3(hex_color, alpha=1.0):
    r, g, b = (int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return f"srgb:{r:.5f},{g:.5f},{b:.5f},{alpha:.5f}"


def layer_svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">{body}</svg>\n'


def write_icon_composer(out):
    bundle = out / "AppIcon.icon"
    assets = bundle / "Assets"
    assets.mkdir(parents=True, exist_ok=True)
    left, right = 100 + LAYOUT["margin"], 924 - LAYOUT["margin"]
    width, top, bottom = LAYOUT["width"], LAYOUT["top"], LAYOUT["bottom"]
    layers = []
    for name, (wavelength, halo, _core, _strength) in zip(LINE_NAMES, icon_svg.BALMER):
        x = icon_svg.line_x(wavelength, left, right)
        (assets / f"{name}.svg").write_text(layer_svg(
            f'<rect x="{x - width / 2:.2f}" y="{top:.2f}" width="{width:.2f}" height="{bottom - top:.2f}" '
            f'rx="{width / 2:.2f}" fill="{halo}"/>'))
        level = TINT_LEVELS[name]
        layers.append({
            "name": name,
            "image-name": f"{name}.svg",
            "glass": False,
            "fill-specializations": [{"appearance": "tinted", "value": {"solid": f"extended-gray:{level:.5f},1.00000"}}],
        })
    stops = icon_svg.SPECTRUM
    gradient = "".join(f'<stop offset="{n / (len(stops) - 1):.3f}" stop-color="{c}"/>' for n, c in enumerate(stops))
    (assets / "band.svg").write_text(layer_svg(
        f'<defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="0">{gradient}</linearGradient></defs>'
        f'<rect x="{left - 30:.1f}" y="{bottom + 34:.1f}" width="{right - left + 60:.1f}" height="12" rx="6" fill="url(#s)"/>'))
    icon = {
        "fill": {"linear-gradient": [p3("#FFFFFF"), p3("#E2E4E9")]},
        "fill-specializations": [
            {"appearance": "dark", "value": {"linear-gradient": [p3("#2E3036"), p3("#0F1013")]}},
            {"appearance": "tinted", "value": {"linear-gradient": ["extended-gray:0.20000,1.00000", "extended-gray:0.06000,1.00000"]}},
        ],
        "groups": [
            {
                "name": "Balmer lines",
                "layers": list(reversed(layers)),
                "lighting": "individual",
                "shadow-specializations": [
                    {"value": {"kind": "layer-color", "opacity": 0.55}},
                    {"appearance": "dark", "value": {"kind": "layer-color", "opacity": 0.9}},
                ],
                "specular": True,
                "translucency": {"enabled": False, "value": 0.1},
            },
            {
                "name": "Spectrum",
                "layers": [{
                    "name": "band",
                    "image-name": "band.svg",
                    "glass": False,
                    "fill-specializations": [{"appearance": "tinted", "value": {"solid": "extended-gray:0.60000,1.00000"}}],
                }],
                "opacity-specializations": [{"value": 0.7}, {"appearance": "dark", "value": 0.6}],
                "shadow": {"kind": "none", "opacity": 0.5},
                "specular": False,
                "translucency": {"enabled": False, "value": 0.5},
            },
        ],
        "supported-platforms": {"squares": "shared"},
    }
    (bundle / "icon.json").write_text(json.dumps(icon, indent=2) + "\n")


ICNS_TYPES = [("icp4", 16), ("icp5", 32), ("icp6", 64), ("ic07", 128), ("ic08", 256), ("ic09", 512),
              ("ic10", 1024), ("ic11", 32), ("ic12", 64), ("ic13", 256), ("ic14", 512)]


def write_icns(path, pngs):
    chunks = []
    for kind, pixels in ICNS_TYPES:
        buffer = io.BytesIO()
        pngs[pixels].save(buffer, format="PNG")
        chunks.append(kind.encode() + struct.pack(">I", buffer.tell() + 8) + buffer.getvalue())
    body = b"".join(chunks)
    path.write_bytes(b"icns" + struct.pack(">I", len(body) + 8) + body)


def write_catalog(out, pngs):
    iconset = out / "Assets.xcassets" / "AppIcon.appiconset"
    iconset.mkdir(parents=True, exist_ok=True)
    (out / "Assets.xcassets" / "Contents.json").write_text(json.dumps({"info": {"author": "xcode", "version": 1}}, indent=2) + "\n")
    images = []
    for size in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            pixels = size * scale
            images.append({"filename": f"appicon_{pixels}.png", "idiom": "mac", "scale": f"{scale}x", "size": f"{size}x{size}"})
    for pixels in {16, 32, 64, 128, 256, 512, 1024}:
        pngs[pixels].save(iconset / f"appicon_{pixels}.png")
    (iconset / "Contents.json").write_text(json.dumps({"images": images, "info": {"author": "xcode", "version": 1}}, indent=2) + "\n")


def main(out):
    out = Path(out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    work = out / "masters"
    work.mkdir(exist_ok=True)
    jobs = []
    for theme in ("light", "dark"):
        (work / f"icon-{theme}.svg").write_text(icon_svg.svg(theme=theme, band=0.6, **LAYOUT))
        (work / f"background-{theme}.svg").write_text(icon_svg.svg(theme=theme, background_only=True, **LAYOUT))
        jobs += [(work / f"icon-{theme}.svg", work / f"icon-{theme}-1024.png", 1024),
                 (work / f"background-{theme}.svg", work / f"background-{theme}-1024.png", 1024)]
    render(jobs)

    pngs = {}
    for theme in ("light", "dark"):
        master = Image.open(work / f"icon-{theme}-1024.png").convert("RGBA")
        background = Image.open(work / f"background-{theme}-1024.png").convert("RGBA")
        sized = {1024: master}
        for pixels in (512, 256, 128, 64):
            sized[pixels] = master.resize((pixels, pixels), Image.LANCZOS)
        for pixels in (32, 16):
            sized[pixels] = small_icons.render(background, theme, pixels)
        for pixels, image in sized.items():
            image.save(work / f"icon-{theme}-{pixels}.png")
        pngs[theme] = sized

    legacy = pngs["dark"]
    write_icon_composer(out)
    write_catalog(out, legacy)
    write_icns(out / "app.icns", legacy)
    logos = out / "product_logo"
    logos.mkdir(exist_ok=True)
    for pixels in (16, 24, 32, 48, 64, 128, 256):
        source = legacy[pixels] if pixels in legacy else legacy[1024].resize((pixels, pixels), Image.LANCZOS)
        source.save(logos / f"product_logo_{pixels}.png")
    (logos / "product_logo.svg").write_text(icon_svg.svg(theme="dark", band=0.6, **LAYOUT))
    print(f"wrote {out}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
