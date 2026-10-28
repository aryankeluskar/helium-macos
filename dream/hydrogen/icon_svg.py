import sys

BALMER = [
    (410.17, "#8A2BE2", "#E4CCFF", 0.62),
    (434.05, "#4B3BFF", "#CFC8FF", 0.72),
    (486.13, "#12E2FF", "#E6FEFF", 0.88),
    (656.28, "#FF2D1F", "#FFD9D2", 1.0),
]
SPECTRUM = ["#61007D", "#7D00DB", "#2800FF", "#0046FF", "#00A9FF", "#00EFFF", "#00FF6E",
            "#55FF00", "#C3FF00", "#FFDF00", "#FF7700", "#FF0000", "#A10000"]
THEMES = {
    "dark": dict(bg=("#2E3036", "#18191E", "#0F1013"), haze=("#7A8BA8", 0.07), bloom=0.42, core=1.0,
                 sheen=0.12, rim=0.5),
    "light": dict(bg=("#FFFFFF", "#F3F4F6", "#E2E4E9"), haze=("#C7CCD6", 0.20), bloom=0.22, core=0.55,
                  sheen=0.0, rim=0.7),
}


def continuous_rect(x, y, w, h, r):
    k = [1.52866483, 1.08849296, 0.86840694, 0.63149399, 0.07491100, 0.37282383, 0.16201398, 0.02044236]
    a, b, c, d, e, f, g, i = [v * r for v in k]
    R, B = x + w, y + h
    p = lambda *xy: " ".join(f"{xy[n]:.2f},{xy[n + 1]:.2f}" for n in range(0, len(xy), 2))
    return (f"M{p(x + a, y)} L{p(R - a, y)} C{p(R - b, y, R - c, y + i, R - d, y + e)} "
            f"C{p(R - f, y + g, R - g, y + f, R - e, y + d)} C{p(R - i, y + c, R, y + b, R, y + a)} "
            f"L{p(R, B - a)} C{p(R, B - b, R - i, B - c, R - e, B - d)} "
            f"C{p(R - g, B - f, R - f, B - g, R - d, B - e)} C{p(R - c, B - i, R - b, B, R - a, B)} "
            f"L{p(x + a, B)} C{p(x + b, B, x + c, B - i, x + d, B - e)} "
            f"C{p(x + f, B - g, x + g, B - f, x + e, B - d)} C{p(x + i, B - c, x, B - b, x, B - a)} "
            f"L{p(x, y + a)} C{p(x, y + b, x + i, y + c, x + e, y + d)} "
            f"C{p(x + g, y + f, x + f, y + g, x + d, y + e)} C{p(x + c, y + i, x + b, y, x + a, y)} Z")


CENTERS = {410.17: 270.0, 434.05: 342.0, 486.13: 438.0, 656.28: 754.0}


def line_x(wavelength, left=None, right=None):
    return CENTERS[wavelength]


def svg(theme="dark", width=52.0, top=260.0, bottom=684.0, margin=244.0, band=0.0, reflection=False,
        lines_only=False, background_only=False, frame=(100.0, 824.0, 185.4)):
    t = THEMES[theme]
    inset, side, radius = frame
    body = continuous_rect(inset, inset, side, side, radius)
    left, right = margin, 1024 - margin
    stops = "".join(f'<stop offset="{n / (len(SPECTRUM) - 1):.3f}" stop-color="{c}"/>' for n, c in enumerate(SPECTRUM))
    defs = (
        f'<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{t["bg"][0]}"/>'
        f'<stop offset="0.55" stop-color="{t["bg"][1]}"/><stop offset="1" stop-color="{t["bg"][2]}"/></linearGradient>'
        f'<radialGradient id="sheen" cx="0.5" cy="0" r="0.9"><stop offset="0" stop-color="#E8ECF4" stop-opacity="{t["sheen"]}"/>'
        '<stop offset="1" stop-color="#E8ECF4" stop-opacity="0"/></radialGradient>'
        f'<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="{t["rim"]}"/>'
        '<stop offset="0.12" stop-color="#fff" stop-opacity="0.10"/><stop offset="0.85" stop-color="#fff" stop-opacity="0.04"/>'
        '<stop offset="1" stop-color="#fff" stop-opacity="0.16"/></linearGradient>'
        f'<linearGradient id="spectrum" x1="0" y1="0" x2="1" y2="0">{stops}</linearGradient>'
        '<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.32"/>'
        '<stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
        f'<mask id="reflect"><rect x="0" y="{bottom + 22}" width="1024" height="200" fill="url(#fade)"/></mask>'
        f'<clipPath id="clip"><path d="{body}"/></clipPath>'
        '<filter id="bloom" x="-300%" y="-30%" width="700%" height="160%"><feGaussianBlur stdDeviation="30"/></filter>'
        '<filter id="glow" x="-300%" y="-30%" width="700%" height="160%"><feGaussianBlur stdDeviation="9"/></filter>'
        '<filter id="haze" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter>'
    )

    def bars(y0, y1):
        out = []
        for wavelength, halo, core, strength in BALMER:
            x = line_x(wavelength, left, right)

            def rect(wd, ext=0.0):
                return (f'x="{x - wd / 2:.2f}" y="{y0 - ext:.2f}" width="{wd:.2f}" '
                        f'height="{y1 - y0 + 2 * ext:.2f}" rx="{wd / 2:.2f}"')
            out.append(f'<rect {rect(width * 3, 30)} fill="{halo}" opacity="{t["bloom"] * strength:.2f}" filter="url(#bloom)"/>')
            out.append(f'<rect {rect(width * 1.25, 3)} fill="{halo}" opacity="{0.6 * strength:.2f}" filter="url(#glow)"/>')
            out.append(f'<rect {rect(width)} fill="{halo}"/>')
            out.append(f'<rect {rect(width * 0.34)} fill="{core}" opacity="{t["core"] * 0.8:.2f}"/>')
        return "".join(out)

    parts = []
    if not lines_only:
        parts += [f'<path d="{body}" fill="url(#bg)"/>',
                  f'<ellipse cx="512" cy="{(top + bottom) / 2:.0f}" rx="360" ry="250" fill="{t["haze"][0]}" opacity="{t["haze"][1]}" filter="url(#haze)"/>',
                  f'<rect x="{inset}" y="{inset}" width="{side}" height="{side * 0.51:.1f}" fill="url(#sheen)"/>']
    if not background_only:
        parts.append(bars(top, bottom))
        if reflection:
            parts.append(f'<g mask="url(#reflect)" transform="translate(0 {2 * bottom + 44}) scale(1 -1)" opacity="0.9">{bars(top, bottom)}</g>')
        if band:
            parts.append(f'<rect x="{left:.1f}" y="{bottom + 40:.1f}" width="{right - left:.1f}" height="28" rx="14" fill="url(#spectrum)" opacity="{band}"/>')
    rim = "" if lines_only else f'<path d="{continuous_rect(inset + 1.5, inset + 1.5, side - 3, side - 3, radius - 0.7)}" fill="none" stroke="url(#rim)" stroke-width="3"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">'
            f'<defs>{defs}</defs><g clip-path="url(#clip)">{"".join(parts)}</g>{rim}</svg>')


if __name__ == "__main__":
    kwargs = {}
    for arg in sys.argv[1:]:
        key, value = arg.split("=")
        kwargs[key] = value if key == "theme" else (value == "True" if value in ("True", "False") else float(value))
    print(svg(**kwargs))
