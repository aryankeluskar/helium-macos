#!/usr/bin/env python3
"""Generates Hydrogen's app icon set from icon_svg.py: the full-colour masters,
the Icon Composer bundle macOS 26 compiles into Assets.car, the asset catalog
and app.icns older macOS reads, and the product logos WebUI pages show.

Usage: make_icons.py <resources dir> [masters dir]   (needs node with playwright, and Pillow)
"""

import io
import json
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

import dmg_background
import icon_svg
import small_icons

HERE = Path(__file__).resolve().parent
INK = "#16171B"
MONO_INK = "#3C4043"
FULL_BLEED = (22.0, 980.0, 219.0)
LINE_NAMES = ["delta", "gamma", "beta", "alpha"]
TINT_LEVELS = {"delta": 0.55, "gamma": 0.7, "beta": 0.95, "alpha": 0.82}
LAYOUT = dict(width=52.0, top=260.0, bottom=684.0, margin=244.0)


def render(jobs):
    subprocess.run(["node", str(HERE / "render_svg.cjs"), *[f"{src}:{dst}:{size}" for src, dst, size in jobs]], check=True)


def p3(hex_color, alpha=1.0):
    r, g, b = (int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return f"srgb:{r:.5f},{g:.5f},{b:.5f},{alpha:.5f}"


def layer_svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">{body}</svg>\n'


def write_icon_composer(out):
    bundle = out / "assets" / "AppIcon.icon"
    assets = bundle / "Assets"
    assets.mkdir(parents=True, exist_ok=True)
    left, right = LAYOUT["margin"], 1024 - LAYOUT["margin"]
    width, top, bottom = LAYOUT["width"], LAYOUT["top"], LAYOUT["bottom"]
    layers = []
    for name, (wavelength, halo, _core, _strength) in zip(LINE_NAMES, icon_svg.BALMER):
        x = icon_svg.line_x(wavelength)
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
        f'<rect x="{left:.1f}" y="{bottom + 40:.1f}" width="{right - left:.1f}" height="28" rx="14" fill="url(#s)"/>'))
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
    iconset = out / "assets" / "Assets.xcassets" / "AppIcon.appiconset"
    iconset.mkdir(parents=True, exist_ok=True)
    (out / "assets" / "Assets.xcassets" / "Contents.json").write_text(json.dumps({"info": {"author": "xcode", "version": 1}}, indent=2) + "\n")
    images = []
    for size in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            pixels = size * scale
            images.append({"filename": f"appicon_{pixels}.png", "idiom": "mac", "scale": f"{scale}x", "size": f"{size}x{size}"})
    for pixels in {16, 32, 64, 128, 256, 512, 1024}:
        pngs[pixels].save(iconset / f"appicon_{pixels}.png")
    (iconset / "Contents.json").write_text(json.dumps({"images": images, "info": {"author": "xcode", "version": 1}}, indent=2) + "\n")


def glyph_rects(box_x, box_y, box_w, line_scale=1.0):
    """The mark without its tile: the Balmer lines and the band, fitted to a box."""
    left, right = LAYOUT["margin"], 1024 - LAYOUT["margin"]
    scale = box_w / (right - left)
    width = LAYOUT["width"] * scale * line_scale
    top = box_y
    height = (LAYOUT["bottom"] - LAYOUT["top"]) * scale
    rects = []
    for name, (wavelength, halo, _core, _strength) in zip(LINE_NAMES, icon_svg.BALMER):
        x = box_x + (icon_svg.line_x(wavelength) - left) * scale
        rects.append((name, halo, x - width / 2, top, width, height))
    band_h = max(28 * scale * line_scale, 1.0)
    band_y = top + height + 40 * scale
    return rects, (box_x, band_y, box_w, band_h)


def glyph_svg(box_x, box_y, box_w, mono=None, line_scale=1.0):
    rects, (bx, by, bw, bh) = glyph_rects(box_x, box_y, box_w, line_scale)
    stops = "".join(f'<stop offset="{n / (len(icon_svg.SPECTRUM) - 1):.3f}" stop-color="{c}"/>' for n, c in enumerate(icon_svg.SPECTRUM))
    out = [] if mono else [f'<defs><linearGradient id="hydrogen-spectrum" x1="0" y1="0" x2="1" y2="0">{stops}</linearGradient></defs>']
    for _name, halo, x, y, w, h in rects:
        out.append(f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" rx="{w / 2:.2f}" fill="{mono or halo}"/>')
    out.append(f'<rect x="{bx:.2f}" y="{by:.2f}" width="{bw:.2f}" height="{bh:.2f}" rx="{bh / 2:.2f}" fill="{mono or "url(#hydrogen-spectrum)"}" opacity="{0.55 if mono else 0.9}"/>')
    return "".join(out)


def write_wordmarks(out, logos):
    font = (HERE / "fonts" / "Sora-Variable.ttf").as_uri()
    jobs = []
    for suffix, ink, scale in (("", INK, 1), ("_white", "#FFFFFF", 1), ("_200", INK, 2), ("_white_200", "#FFFFFF", 2)):
        w, h = 140 * scale, 32 * scale
        glyph = glyph_svg(4 * scale, 5 * scale, 26 * scale, mono=None, line_scale=1.5)
        html = (f'<html><head><style>@font-face{{font-family:Sora;src:url("{font}")}}'
                f'body{{margin:0;background:transparent}}</style></head><body>'
                f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{glyph}'
                f'<text x="{37 * scale}" y="{23.5 * scale}" font-family="Sora" font-weight="400" font-size="{20.5 * scale}" '
                f'letter-spacing="{-0.2 * scale}" fill="{ink}">Hydrogen</text></svg></body></html>')
        page = out / f"wordmark{suffix}.html"
        page.write_text(html)
        jobs.append((page, logos / f"product_logo{suffix}.png", f"{w}x{h}"))
    subprocess.run(["node", str(HERE / "render_svg.cjs"), "--html", *[f"{src}:{dst}:{size}" for src, dst, size in jobs]], check=True)
    for page, _dst, _size in jobs:
        page.unlink()


def vector_icon(canvas, commands):
    return "\n".join([
        "// Copyright 2026 The Hydrogen Authors",
        "// You can use, redistribute, and/or modify this source code under",
        "// the terms of the GPL-3.0 license that can be found in the LICENSE file.",
        "",
        f"CANVAS_DIMENSIONS, {canvas},",
        *commands,
    ]) + "\n"


def num(value):
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return text if "." not in text else text + "f"


def write_vector_icons(logos):
    rects, band = glyph_rects(6, 8, 44, line_scale=1.05)
    mono = []
    for _name, _halo, x, y, w, h in rects:
        mono += ["NEW_PATH,", f"ROUND_RECT, {num(x)}, {num(y)}, {num(w)}, {num(h)}, {num(w / 2)},"]
    bx, by, bw, bh = band
    mono += ["NEW_PATH,", f"ROUND_RECT, {num(bx)}, {num(by + 1)}, {num(bw)}, {num(max(bh, 3))}, {num(max(bh, 3) / 2)},"]
    (logos / "product_logo.icon").write_text(vector_icon(56, mono))

    color = ["NEW_PATH,", "PATH_COLOR_ARGB, 0xFF, 0x18, 0x19, 0x1E,", "ROUND_RECT, 0, 0, 256, 256, 67,"]
    rects, band = glyph_rects(61, 68, 134, line_scale=1.2)
    for _name, halo, x, y, w, h in rects:
        r, g, b = (halo[i:i + 2].upper() for i in (1, 3, 5))
        color += ["NEW_PATH,", f"PATH_COLOR_ARGB, 0xFF, 0x{r}, 0x{g}, 0x{b},", f"ROUND_RECT, {num(x)}, {num(y)}, {num(w)}, {num(h)}, {num(w / 2)},"]
    bx, by, bw, bh = band
    segments = icon_svg.SPECTRUM[1:-1]
    seg_w = bw / len(segments)
    for n, hex_color in enumerate(segments):
        r, g, b = (hex_color[i:i + 2].upper() for i in (1, 3, 5))
        color += ["NEW_PATH,", f"PATH_COLOR_ARGB, 0xE6, 0x{r}, 0x{g}, 0x{b},",
                  f"ROUND_RECT, {num(bx + n * seg_w)}, {num(by)}, {num(seg_w + 0.5)}, {num(bh)}, {num(bh / 2 if n in (0, len(segments) - 1) else 0)},"]
    (logos / "product_logo_color.icon").write_text(vector_icon(256, color))


def write_flat_logo_svg(logos):
    body = '<rect width="256" height="256" rx="67" fill="#18191E"/>'
    (logos / "product_logo.svg").write_text(
        f'<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">{body}{glyph_svg(61, 68, 134, line_scale=1.2)}</svg>\n')


def write_mono(logos):
    image = Image.new("RGBA", (22, 22), (0, 0, 0, 0))
    r, g, b = (int(MONO_INK[i:i + 2], 16) for i in (1, 3, 5))
    for col in (4, 7, 10, 16):
        for x in (col, col + 1):
            for y in range(4, 16):
                image.putpixel((x, y), (r, g, b, 255))
    for x in range(4, 18):
        image.putpixel((x, 18), (r, g, b, 150))
    image.save(logos / "product_logo_22_mono.png")


def write_document_icon(app_icon_dir, work):
    page = ('<path d="M96 32h236l116 116v300a32 32 0 0 1-32 32H96a32 32 0 0 1-32-32V64a32 32 0 0 1 32-32z" fill="#FFFFFF" stroke="#D5D8DE" stroke-width="4"/>'
            '<path d="M332 32v84a32 32 0 0 0 32 32h84" fill="#EEF0F3" stroke="#D5D8DE" stroke-width="4" stroke-linejoin="round"/>')
    tile = icon_svg.svg(theme="dark", band=0.6, frame=FULL_BLEED, **LAYOUT)
    tile_inner = tile.split(">", 1)[1].rsplit("</svg>", 1)[0]
    svg_path = work / "document.svg"
    svg_path.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">{page}'
                        f'<svg x="136" y="196" width="240" height="240" viewBox="0 0 1024 1024">{tile_inner}</svg></svg>')
    render([(svg_path, app_icon_dir / "file.png", 512)])


def write_onboarding_logo(out):
    folder = out / "onboarding"
    folder.mkdir(exist_ok=True)
    (folder / "HeliumLogoRaw.svelte").write_text(
        f'<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">\n'
        f'    {glyph_svg(16, 40, 224, line_scale=1.1)}\n</svg>\n')


def write_dmg(out, work):
    (work / "dmg_background.svg").write_text(dmg_background.svg())
    render([(work / "dmg_background.svg", out / "dmg_background.png", f"{dmg_background.WIDTH}x{dmg_background.HEIGHT}")])
    layout = {
        "title": "Hydrogen",
        "icon": "Hydrogen.app/Contents/Resources/app.icns",
        "background": "dmg_background.png",
        "icon-size": 90,
        "contents": [
            {"x": 175, "y": 130, "type": "file", "path": "Hydrogen.app"},
            {"x": 175, "y": 370, "type": "link", "path": "/Applications"},
        ],
        "window": {"size": {"width": 350, "height": 518}},
        "format": "ULMO",
        "filesystem": "APFS",
    }
    (out / "dmg.json").write_text(json.dumps(layout, indent=4) + "\n")


def main(out, masters=None):
    out = Path(out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    work = Path(masters or tempfile.mkdtemp(prefix="hydrogen-masters-")).resolve()
    work.mkdir(parents=True, exist_ok=True)
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
    write_icns(out / "assets" / "app.icns", legacy)
    branding = out / "branding"
    app_icon_dir = branding / "app_icon"
    app_icon_dir.mkdir(parents=True, exist_ok=True)
    (work / "raw.svg").write_text(icon_svg.svg(theme="dark", band=0.6, frame=FULL_BLEED, **LAYOUT))
    render([(work / "raw.svg", app_icon_dir / "raw.png", 1024)])
    write_document_icon(app_icon_dir, work)
    write_wordmarks(work, branding)
    write_mono(branding)
    write_vector_icons(branding)
    write_flat_logo_svg(branding)
    write_onboarding_logo(out)
    write_dmg(out, work)
    legacy[1024].save(out / "assets" / "legacy.png")
    legacy[1024].resize((512, 512), Image.LANCZOS).save(out / "assets" / "legacy_crop.png")
    print(f"wrote {out}")


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        sys.exit(__doc__)
    main(*sys.argv[1:])
