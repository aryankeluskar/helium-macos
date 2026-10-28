"""Pixel-fitted 16 and 32 px icons: the master's background downsampled, with
the Balmer lines drawn on whole pixels (the two violet lines merge at 16 px)."""

from PIL import Image, ImageDraw, ImageFilter

HALO = {"delta": (138, 43, 226), "gamma": (75, 59, 255), "beta": (18, 226, 255), "alpha": (255, 45, 31)}
SPECTRUM = [(97, 0, 125), (40, 0, 255), (0, 169, 255), (0, 239, 255), (85, 255, 0), (255, 223, 0),
            (255, 119, 0), (255, 0, 0)]
LAYOUT = {
    16: dict(rows=(4, 11), cols=[("delta", 4, 1), ("beta", 6, 1), ("alpha", 10, 1)], band=None),
    32: dict(rows=(9, 22), cols=[("delta", 8, 1), ("gamma", 10, 1), ("beta", 12, 2), ("alpha", 21, 2)],
             band=(24, 7, 25)),
}


def render(background, theme, size):
    base = background.resize((size, size), Image.LANCZOS)
    layout = LAYOUT[size]
    y0, y1 = layout["rows"]
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    lines = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_draw, line_draw = ImageDraw.Draw(glow), ImageDraw.Draw(lines)
    for name, col, width in layout["cols"]:
        r, g, b = HALO[name]
        glow_draw.rectangle([col - 1, y0 - 1, col + width, y1], fill=(r, g, b, 150 if theme == "dark" else 90))
        line_draw.rectangle([col, y0, col + width - 1, y1 - 1], fill=(r, g, b, 255))
    out = base
    if size >= 32:
        out = Image.alpha_composite(out, glow.filter(ImageFilter.GaussianBlur(1.2)))
    out = Image.alpha_composite(out, lines)
    if layout["band"]:
        row, c0, c1 = layout["band"]
        band = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        band_draw = ImageDraw.Draw(band)
        for c in range(c0, c1):
            t = (c - c0) / max(1, c1 - c0 - 1) * (len(SPECTRUM) - 1)
            i = min(int(t), len(SPECTRUM) - 2)
            f = t - i
            rgb = tuple(int(SPECTRUM[i][k] * (1 - f) + SPECTRUM[i + 1][k] * f) for k in range(3))
            band_draw.point((c, row), fill=rgb + (140 if theme == "dark" else 170,))
        out = Image.alpha_composite(out, band)
    out.putalpha(base.getchannel("A"))
    return out
